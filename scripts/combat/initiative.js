import {
  expireStartOfTurnQualityEffects
} from "../rules/overclock.js";

import {
  hasUnlockedOfficialTamerTalent
} from "../rules/tamer-resources.js";

import {
  getActorSv
} from "../rules/quality-automation.js";

const SYSTEM_ID = "digimon-digital-adventures";
const FLAG = "initiative";

function isEnglish() {
  return String(
    game?.i18n?.lang ??
    game?.i18n?.language ??
    ""
  ).toLowerCase().startsWith("en");
}

function label(pt, en) {
  return isEnglish() ? en : pt;
}

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function html(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function elementFrom(htmlData) {
  if (htmlData instanceof HTMLElement) return htmlData;
  if (htmlData?.[0] instanceof HTMLElement) return htmlData[0];
  return null;
}

function actorKeys(actor) {
  const keys = [
    actor?.uuid,
    actor?.id,
    actor?.parent?.uuid,
    actor?.parent?.id
  ]
    .filter(Boolean)
    .map(String);

  if (actor?.id) keys.push(`Actor.${actor.id}`);
  if (actor?.parent?.id) keys.push(`Actor.${actor.parent.id}`);

  return new Set(keys);
}

function matchesReference(actor, reference = "") {
  const value = String(reference ?? "").trim();
  return Boolean(value && actorKeys(actor).has(value));
}

function sideOf(combatant) {
  const configured = String(
    combatant?.actor?.system?.combat?.initiative?.side ?? ""
  ).trim();

  if (configured === "players" || configured === "enemies") {
    return configured;
  }

  const tokenDisposition = Number(
    combatant?.token?.disposition ??
    combatant?.token?.document?.disposition ??
    combatant?.actor?.prototypeToken?.disposition
  );

  // Hostile no Foundry é -1.
  if (tokenDisposition === -1) {
    return "enemies";
  }

  return ["npc", "group"].includes(combatant?.actor?.type)
    ? "enemies"
    : "players";
}

function ramOf(actor) {
  const ram = number(actor?.system?.derivedStats?.ram?.value, NaN);

  return Number.isFinite(ram)
    ? ram
    : number(actor?.system?.miscStats?.initiative?.base, 0);
}

function digimonInitiativeBonus(actor) {
  const total = number(
    actor?.system?.miscStats?.initiative?.value,
    NaN
  );

  return Number.isFinite(total)
    ? total - ramOf(actor)
    : 0;
}

function tamerInitiativeBase(actor) {
  return number(actor?.system?.attributes?.agility?.value, 0)
    + number(actor?.system?.skills?.awareness?.value, 0);
}

function getUnitPairActors(unit) {
  const tamer =
    unit?.members?.find(
      (member) => member.role === "tamer"
    )?.combatant?.actor ?? null;

  const digimon =
    unit?.members?.find(
      (member) => member.role === "digimon"
    )?.combatant?.actor ?? null;

  return {
    tamer,
    digimon
  };
}

function getHyperAlertInitiativeBonus(unit) {
  const {
    tamer,
    digimon
  } = getUnitPairActors(unit);

  if (!tamer || !digimon) {
    return 0;
  }

  if (
    !hasUnlockedOfficialTamerTalent(
      tamer,
      "hyperAlert"
    )
  ) {
    return 0;
  }

  const awareness = number(
    tamer.system?.skills
      ?.awareness?.value,
    0
  );

  return Math.max(
    0,
    awareness - 2
  );
}

function getEvasiveManeuversReserveMaximum(
  tamer,
  digimon
) {
  const agility = Math.max(
    0,
    number(
      tamer?.system
        ?.attributes?.agility
        ?.value,
      0
    )
  );

  const sv = Math.max(
    0,
    number(
      getActorSv(digimon),
      number(
        digimon?.system?.stageValue,
        0
      )
    )
  );

  return Math.max(
    0,
    sv + agility
  );
}

async function initializeEvasiveManeuversReserve(
  unit,
  combat
) {
  const {
    tamer,
    digimon
  } = getUnitPairActors(unit);

  if (!tamer || !digimon || !combat) {
    return null;
  }

  if (
    !hasUnlockedOfficialTamerTalent(
      tamer,
      "evasiveManeuvers"
    )
  ) {
    return null;
  }

  const previousState =
    foundry.utils.deepClone(
      digimon.system?.combat
        ?.tamerTalentReserves
        ?.evasiveManeuvers ??
      {}
    );

  /*
   * Rolar novamente a Iniciativa dentro do
   * mesmo Combate não recria a reserva.
   */
  if (
    String(
      previousState.combatId ?? ""
    ) === String(combat.id)
  ) {
    unit.evasiveManeuvers =
      previousState;

    return previousState;
  }

  const maximum =
    getEvasiveManeuversReserveMaximum(
      tamer,
      digimon
    );

  if (maximum <= 0) {
    return null;
  }

  const state = {
    active: true,

    combatId:
      combat.id,

    sourceTamerUuid:
      tamer.uuid,

    sourceTamerName:
      tamer.name,

    current:
      maximum,

    max:
      maximum,

    createdAt:
      new Date().toISOString()
  };

  const talentUsage =
    foundry.utils.deepClone(
      tamer.system?.combat
        ?.tamerTalentUsage ??
      {}
    );

  talentUsage.evasiveManeuvers = {
    combatId:
      combat.id,

    round:
      number(
        combat.round,
        1
      ),

    turn:
      number(
        combat.turn,
        0
      ),

    frequency:
      "oncePerCombat",

    usedAt:
      new Date().toISOString()
  };

  await digimon.update({
    "system.combat.tamerTalentReserves.evasiveManeuvers":
      state
  });

  await tamer.update({
    "system.combat.tamerTalentUsage":
      talentUsage
  });

  unit.evasiveManeuvers =
    state;

  digimon.sheet?.render(false);
  tamer.sheet?.render(false);

  return state;
}

function findPartnerCombatant(tamerCombatant, combatants) {
  const partnerUuid = tamerCombatant.actor?.system?.partner?.uuid;

  return combatants.find((candidate) => {
    return candidate.id !== tamerCombatant.id
      && candidate.actor?.type === "digimon"
      && matchesReference(candidate.actor, partnerUuid);
  }) ?? null;
}

function findTamerCombatant(digimonCombatant, combatants) {
  const tamerUuid = digimonCombatant.actor?.system?.tamer?.uuid;

  return combatants.find((candidate) => {
    return candidate.id !== digimonCombatant.id
      && candidate.actor?.type === "character"
      && (
        matchesReference(candidate.actor, tamerUuid)
        || matchesReference(
          digimonCombatant.actor,
          candidate.actor?.system?.partner?.uuid
        )
      );
  }) ?? null;
}

function buildUnits(combat) {
  const combatants = combat.combatants.contents;
  const used = new Set();
  const units = [];

  for (const combatant of combatants) {
    if (!combatant.actor || used.has(combatant.id)) continue;

    if (combatant.actor.type === "character") {
      const partner = findPartnerCombatant(combatant, combatants);

      if (partner) {
        used.add(combatant.id);
        used.add(partner.id);

        units.push({
          id: `pair:${combatant.id}:${partner.id}`,
          kind: "pair",
          side: sideOf(combatant),
            members: [
            { combatant: partner, role: "digimon" },
            { combatant, role: "tamer" }
            ]
        });

        continue;
      }
    }

    if (combatant.actor.type === "digimon") {
      const tamer = findTamerCombatant(combatant, combatants);

      if (tamer && !used.has(tamer.id)) {
        used.add(tamer.id);
        used.add(combatant.id);

        units.push({
          id: `pair:${tamer.id}:${combatant.id}`,
          kind: "pair",
          side: sideOf(tamer),
            members: [
            { combatant, role: "digimon" },
            { combatant: tamer, role: "tamer" }
            ]
        });

        continue;
      }
    }

    used.add(combatant.id);

    units.push({
      id: `solo:${combatant.id}`,
      kind: "solo",
      side: sideOf(combatant),
      members: [{ combatant, role: "solo" }]
    });
  }

  return units;
}

function unitName(unit) {
  return unit.members
    .map((member) => {
      return member.combatant.name ??
        member.combatant.actor?.name ??
        "?";
    })
    .join(" + ");
}

async function rollUnitInitiative(unit) {
  const digimonMember =
    unit.members.find(
      (member) =>
        member.role === "digimon"
    );

  const primaryActor =
    digimonMember?.combatant.actor ??
    unit.members[0]?.combatant.actor;

  const roll =
    await new Roll(
      "3d6"
    ).evaluate();

  const dice = number(
    roll.total,
    0
  );

  const isDigimon =
    unit.kind === "pair" ||
    primaryActor?.type === "digimon" ||
    primaryActor?.type === "npc";

  const base = isDigimon
    ? ramOf(primaryActor)
    : tamerInitiativeBase(
        primaryActor
      );

  const systemBonus = isDigimon
    ? digimonInitiativeBonus(
        primaryActor
      )
    : 0;

  const hyperAlertBonus = isDigimon
    ? getHyperAlertInitiativeBonus(
        unit
      )
    : 0;

  const bonus =
    systemBonus +
    hyperAlertBonus;

  unit.initiative = {
    dice,
    base,

    systemBonus,
    hyperAlertBonus,

    bonus,

    raw:
      dice +
      base +
      bonus,

    ram:
      isDigimon
        ? ramOf(primaryActor)
        : 0
  };
}

function compareUnits(left, right) {
  const initiativeDifference =
    right.initiative.raw -
    left.initiative.raw;

  if (initiativeDifference) return initiativeDifference;

  const ramDifference =
    right.initiative.ram -
    left.initiative.ram;

  if (ramDifference) return ramDifference;

  if (left.side !== right.side) {
    return left.side === "players" ? -1 : 1;
  }

  return unitName(left).localeCompare(unitName(right));
}

function splitIntoChunks(items, chunks) {
  const result = [];
  const safeChunks = Math.max(
    1,
    Math.min(chunks, items.length)
  );

  const minimum = Math.floor(items.length / safeChunks);
  const extras = items.length % safeChunks;

  let offset = 0;

  for (let index = 0; index < safeChunks; index += 1) {
    const size = minimum + (index < extras ? 1 : 0);

    result.push(items.slice(offset, offset + size));
    offset += size;
  }

  return result;
}

function orderUnits(units) {
  const players = units
    .filter((unit) => unit.side === "players")
    .sort(compareUnits);

  const enemies = units
    .filter((unit) => unit.side === "enemies")
    .sort(compareUnits);

  if (!players.length || !enemies.length) {
    return [...players, ...enemies];
  }

  const firstSide =
    compareUnits(players[0], enemies[0]) <= 0
      ? "players"
      : "enemies";

  if (players.length === enemies.length) {
    const first =
      firstSide === "players"
        ? players
        : enemies;

    const second =
      firstSide === "players"
        ? enemies
        : players;

    return first.flatMap((unit, index) => {
      return second[index]
        ? [unit, second[index]]
        : [unit];
    });
  }

  const largerSide =
    players.length > enemies.length
      ? "players"
      : "enemies";

  const larger =
    largerSide === "players"
      ? players
      : enemies;

  const smaller =
    largerSide === "players"
      ? enemies
      : players;

  const largerChunks = splitIntoChunks(
    larger,
    smaller.length
  );

  const result = [];

  for (let index = 0; index < smaller.length; index += 1) {
    if (firstSide === largerSide) {
      result.push(
        ...largerChunks[index],
        smaller[index]
      );
    } else {
      result.push(
        smaller[index],
        ...largerChunks[index]
      );
    }
  }

  return result;
}

function combatantFlag(key) {
  return `flags.${SYSTEM_ID}.${FLAG}.${key}`;
}

function initiativeCard(units) {
  const rows = units.map((unit) => {
    const {
      dice,
      base,
      systemBonus = 0,
      hyperAlertBonus = 0,
      bonus,
      raw
    } = unit.initiative;


    const talentNotes = [];

    if (hyperAlertBonus > 0) {
      talentNotes.push(`
        <span class="dda-initiative-talent-note">
          <strong>Hyper Alert:</strong>
          +${hyperAlertBonus}
        </span>
      `);
    }

    const evasiveReserve = number(
      unit.evasiveManeuvers?.current,
      0
    );

    if (evasiveReserve > 0) {
      talentNotes.push(`
        <span class="dda-initiative-talent-note">
          <strong>Evasive Maneuvers:</strong>
          ${evasiveReserve}
          ${label(
            "dados de Esquiva",
            "Dodge dice"
          )}
        </span>
      `);
    }

    const technicalParts = [
      `3d6 (${dice})`,
      `${base}`
    ];

    if (systemBonus !== 0) {
      technicalParts.push(
        `${systemBonus >= 0 ? "+" : "-"} ${Math.abs(systemBonus)}`
      );
    }

    if (hyperAlertBonus !== 0) {
      technicalParts.push(
        `${hyperAlertBonus >= 0 ? "+" : "-"} ${Math.abs(hyperAlertBonus)}`
      );
    }

    return `
      <li>
        <strong>
          ${html(unitName(unit))}
        </strong>

        <span>
          ${technicalParts.join(" ")}
        </span>

        <b>${raw}</b>

        ${
          talentNotes.length
            ? `
              <div class="dda-initiative-talent-notes">
                ${talentNotes.join("")}
              </div>
            `
            : ""
        }
      </li>
    `;
  }).join("");

  return `
    <div class="dda-chat-card dda-effect-card effect-special dda-initiative-card">
      <h2>
        ${label(
          "Iniciativa",
          "Initiative"
        )}
      </h2>

      <p>
        ${label(
          "Ordem organizada alternando os lados do conflito.",
          "Order arranged by alternating conflict sides."
        )}
      </p>

      <ol class="dda-effect-list dda-initiative-list">
        ${rows}
      </ol>
    </div>
  `;
}

export async function rollDDACombatInitiative(
  combat = game.combat
) {
  if (!combat?.combatants?.size) {
    ui.notifications.warn(label(
      "Adicione participantes ao Combate antes de rolar iniciativa.",
      "Add participants to Combat before rolling initiative."
    ));

    return null;
  }

    const units = buildUnits(combat);

    for (const unit of units) {
    await rollUnitInitiative(unit);
    }

    const ordered = orderUnits(units);

if (!combat.started) {
  await combat.startCombat();
}

/*
 * Hyper Alert já foi incluído durante
 * rollUnitInitiative.
 *
 * Evasive Maneuvers nasce agora, depois
 * que o Combate possui um ID e está ativo.
 */
for (const unit of ordered) {
  await initializeEvasiveManeuversReserve(
    unit,
    combat
  );
}

const updates = [];

  ordered.forEach((unit, unitIndex) => {
    unit.members.forEach((member, memberIndex) => {
      // O Foundry precisa de valores diferentes para manter
      // Tamer e Digimon consecutivos.
      // A iniciativa verdadeira fica nas flags DDA.
      const technicalInitiative = Number(
        (
          ordered.length -
          unitIndex -
          (memberIndex * 0.001)
        ).toFixed(3)
      );

      updates.push({
        _id: member.combatant.id,
        initiative: technicalInitiative,

        [combatantFlag("unitId")]: unit.id,
        [combatantFlag("role")]: member.role,
        [combatantFlag("side")]: unit.side,

[combatantFlag("raw")]:
  unit.initiative.raw,

[combatantFlag("dice")]:
  unit.initiative.dice,

[combatantFlag("base")]:
  unit.initiative.base,

[combatantFlag("bonus")]:
  unit.initiative.bonus,

[combatantFlag("systemBonus")]:
  unit.initiative.systemBonus ?? 0,

[combatantFlag("hyperAlertBonus")]:
  unit.initiative.hyperAlertBonus ?? 0,

[combatantFlag("evasiveManeuversMax")]:
  unit.evasiveManeuvers?.max ?? 0,

        [combatantFlag("orderIndex")]: unitIndex,
        [combatantFlag("lastEndedRound")]: 0,
        [combatantFlag("endedRound")]: 0
      });
    });
  });

  await combat.updateEmbeddedDocuments(
    "Combatant",
    updates
  );

  const processedActors = new Set();

  for (const unit of ordered) {
    for (const member of unit.members) {
      const actor = member.combatant.actor;
      const actorKey = actor?.uuid ?? actor?.id;

      if (!actor || processedActors.has(actorKey)) continue;

      processedActors.add(actorKey);

      await actor.update({
        "system.combat.actions.value": number(
          actor.system?.combat?.actions?.max,
          2
        ),

        "system.combat.hasAttackedThisRound": false,
        "system.combat.attacksMadeThisTurn": 0,
        "system.combat.multiattackPenalty": 0,
        "system.combat.signatureMoveUsedThisTurn": false,
        "system.combat.energizeUsedThisTurn": false,
        "system.combat.surprised": false
      });
    }
  }

  await combat.update({
    turn: 0,

    [`flags.${SYSTEM_ID}.${FLAG}.order`]: ordered.map((unit) => ({
      id: unit.id,
      side: unit.side,
      raw: unit.initiative.raw,
      members: unit.members.map(
        (member) => member.combatant.id
      )
    }))
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    content: initiativeCard(ordered)
  });

  return ordered;
}

function sameActorReference(left, right) {
  const leftKeys = actorKeys(left);
  const rightKeys = actorKeys(right);

  for (const key of rightKeys) {
    if (leftKeys.has(key)) return true;
  }

  return false;
}

function getInitiativeFlag(combatant, key, fallback = null) {
  const value = combatant?.getFlag?.(
    SYSTEM_ID,
    `${FLAG}.${key}`
  );

  return value ?? fallback;
}

function getCombatantUnitId(combatant) {
  return String(
    getInitiativeFlag(combatant, "unitId", "")
  ).trim();
}

function getCurrentCombatRound(combat) {
  return Math.max(1, number(combat?.round, 1));
}

function combatantEndedThisRound(combatant, combat) {
  return number(
    getInitiativeFlag(combatant, "endedRound", 0),
    0
  ) === getCurrentCombatRound(combat);
}

function getCombatantForActor(combat, actor) {
  return combat?.combatants?.find((combatant) => {
    return sameActorReference(combatant?.actor, actor);
  }) ?? null;
}

function getUnitCombatants(combat, unitId) {
  const combatants = combat?.turns ??
    combat?.combatants?.contents ??
    [];

  return combatants.filter((combatant) => {
    return getCombatantUnitId(combatant) === unitId;
  });
}

function getTurnIndex(combat, combatantId) {
  return (combat?.turns ?? []).findIndex((combatant) => {
    return combatant.id === combatantId;
  });
}

async function setActiveCombatant(combat, combatantId) {
  const turnIndex = getTurnIndex(combat, combatantId);

  if (turnIndex < 0) return false;
  if (Number(combat.turn ?? -1) === turnIndex) return true;

  await combat.update({
    turn: turnIndex
  });

  const activeActor =
    combat.turns?.[turnIndex]?.actor ??
    combat.combatant?.actor;

  await expireStartOfTurnQualityEffects(
    activeActor
  );

  return true;
}

async function advanceToNextUnit(combat, sourceCombatant) {
  const turns = combat?.turns ?? [];
  const sourceIndex = getTurnIndex(combat, sourceCombatant?.id);
  const sourceUnitId = getCombatantUnitId(sourceCombatant);

  if (sourceIndex < 0 || !turns.length) return false;

  for (let offset = 1; offset <= turns.length; offset += 1) {
    const nextIndex = (sourceIndex + offset) % turns.length;
    const candidate = turns[nextIndex];

    if (!candidate) continue;
    if (getCombatantUnitId(candidate) === sourceUnitId) continue;

    const wrapped = nextIndex <= sourceIndex;
    const updateData = { turn: nextIndex };

    if (wrapped) {
      updateData.round = getCurrentCombatRound(combat) + 1;
    }

    await combat.update(updateData);

    await expireStartOfTurnQualityEffects(
      candidate.actor
    );

    return true;
  }

  return false;
}

export async function advanceDDACombatTurn(
  actor,
  combat = game.combat
) {
  if (!combat?.started || !actor) {
    return {
      advanced: false,
      reason: "no-active-combat"
    };
  }

  const combatant = getCombatantForActor(combat, actor);

  if (!combatant) {
    return {
      advanced: false,
      reason: "actor-not-in-combat"
    };
  }

  const unitId = getCombatantUnitId(combatant);

  // Combate normal, sem a iniciativa DDA.
  if (!unitId) {
    if (combat.combatant?.id === combatant.id) {
      await combat.nextTurn();

      await expireStartOfTurnQualityEffects(
        combat.combatant?.actor
      );

      return {
        advanced: true,
        mode: "foundry"
      };
    }

    await setActiveCombatant(combat, combatant.id);

    return {
      advanced: true,
      mode: "foundry-focus"
    };
  }

  if (combatantEndedThisRound(combatant, combat)) {
    ui.notifications.warn(label(
      `${combatant.name} já encerrou sua parte deste turno.`,
      `${combatant.name} has already ended their part of this turn.`
    ));

    return {
      advanced: false,
      reason: "already-ended"
    };
  }

  await combatant.update({
    [combatantFlag("endedRound")]: getCurrentCombatRound(combat)
  });

  const pendingMembers = getUnitCombatants(combat, unitId)
    .filter((member) => !combatantEndedThisRound(member, combat));

  if (pendingMembers.length) {
    const partner = pendingMembers[0];

    await setActiveCombatant(combat, partner.id);

    return {
      advanced: true,
      mode: "partner",
      nextCombatantId: partner.id
    };
  }

  await advanceToNextUnit(combat, combatant);

  return {
    advanced: true,
    mode: "next-unit"
  };
}

function getDdaTrackerCombat(app) {
  return app?.viewed ?? game.combat ?? null;
}

function getDdaRawInitiative(combatant) {
  const raw = Number(
    getInitiativeFlag(combatant, "raw", NaN)
  );

  return Number.isFinite(raw) ? raw : null;
}

function formatDdaInitiative(raw) {
  if (!Number.isFinite(Number(raw))) return "—";

  return Number.isInteger(Number(raw))
    ? String(raw)
    : String(Number(raw).toFixed(1));
}

function getDdaActionLabel(actions) {
  return Number(actions) === 1
    ? label("Ação", "Action")
    : label("Ações", "Actions");
}

function getDdaMemberState(combatant, combat) {
  const ended = combatantEndedThisRound(combatant, combat);
  const active = combat?.combatant?.id === combatant.id;

  const actions = number(
    combatant.actor?.system?.combat?.actions?.value,
    0
  );

  if (ended) {
    return {
      key: "ended",
      icon: "✓",
      label: label("Agiu", "Acted"),
      actions
    };
  }

  if (active) {
    return {
      key: "active",
      icon: "●",
      label: label("Ativo", "Active"),
      actions
    };
  }

  return {
    key: "pending",
    icon: "○",
    label: label("Pendente", "Pending"),
    actions
  };
}

function getDdaRoleLabel(role) {
  return role === "digimon"
    ? label("Digimon", "Digimon")
    : label("Digi-Escolhido", "Tamer");
}

function getDdaCombatantImage(combatant) {
  return String(
    combatant?.token?.texture?.src ??
    combatant?.actor?.prototypeToken?.texture?.src ??
    combatant?.actor?.img ??
    combatant?.img ??
    "icons/svg/mystery-man.svg"
  );
}

function buildDdaPairMemberMarkup(combatant, role, combat) {
  const state = getDdaMemberState(combatant, combat);

  const name = String(
    combatant?.name ??
    combatant?.actor?.name ??
    "?"
  );

  const image = getDdaCombatantImage(combatant);
  const roleLabel = getDdaRoleLabel(role);
  const actionLabel = getDdaActionLabel(state.actions);

  return `
    <button
      type="button"
      class="dda-pair-member dda-pair-member--${role} is-${state.key}"
      data-dda-open-combatant="${html(combatant.id)}"
      title="${html(label("Abrir ficha", "Open sheet"))}"
    >
      <img
        class="dda-pair-member-image"
        src="${html(image)}"
        alt=""
      />

      <span class="dda-pair-member-copy">
        <span class="dda-pair-member-role">
          ${html(roleLabel)}
        </span>

        <strong class="dda-pair-member-name">
          ${html(name)}
        </strong>

        <span
        class="dda-pair-member-status"
        title="${html(`${state.actions} ${actionLabel}`)}"
        >
        <span class="dda-pair-member-state-icon">
            ${state.icon}
        </span>
        ${html(state.label)}
        </span>
      </span>
    </button>
  `;
}

function buildDdaPairCard(unitId, digimon, tamer, combat) {
  const raw =
    getDdaRawInitiative(digimon) ??
    getDdaRawInitiative(tamer);

  const card = document.createElement("div");

  card.className = "dda-combat-pair-card";
  card.dataset.ddaUnitId = unitId;

  card.innerHTML = `
    <div
      class="dda-pair-initiative"
      title="${html(label("Iniciativa", "Initiative"))}"
    >
      ${formatDdaInitiative(raw)}
    </div>

    ${buildDdaPairMemberMarkup(digimon, "digimon", combat)}
    ${buildDdaPairMemberMarkup(tamer, "tamer", combat)}
  `;

  card.querySelectorAll("[data-dda-open-combatant]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const combatantId = button.dataset.ddaOpenCombatant;
      const combatant = combat?.combatants?.get(combatantId);

      combatant?.actor?.sheet?.render(true);
    });
  });

  return card;
}

function decorateDdaPairRows(combat, root) {
  const rowByCombatantId = new Map();

  root.querySelectorAll("[data-combatant-id]").forEach((row) => {
    rowByCombatantId.set(row.dataset.combatantId, row);
  });

  const turns =
    combat?.turns ??
    combat?.combatants?.contents ??
    [];

  const processedUnits = new Set();

  for (const combatant of turns) {
    const unitId = getCombatantUnitId(combatant);

    if (!unitId.startsWith("pair:")) continue;
    if (processedUnits.has(unitId)) continue;

    processedUnits.add(unitId);

    const members = getUnitCombatants(combat, unitId);

    const digimon = members.find((member) => {
      return getInitiativeFlag(member, "role") === "digimon";
    });

    const tamer = members.find((member) => {
      return getInitiativeFlag(member, "role") === "tamer";
    });

    if (!digimon || !tamer) continue;

    const digimonRow = rowByCombatantId.get(digimon.id);
    const tamerRow = rowByCombatantId.get(tamer.id);

    if (!digimonRow || !tamerRow) continue;

    digimonRow.hidden = false;
    digimonRow.removeAttribute("aria-hidden");

    digimonRow.classList.add(
      "dda-pair-anchor",
      "dda-pair-combatant"
    );

    digimonRow.classList.remove("dda-solo-combatant");
    digimonRow.dataset.ddaPairUnit = unitId;

    tamerRow.classList.add(
      "dda-pair-secondary",
      "dda-pair-combatant"
    );

    tamerRow.hidden = true;
    tamerRow.setAttribute("aria-hidden", "true");
    tamerRow.dataset.ddaPairUnit = unitId;

    const pairCard = buildDdaPairCard(
      unitId,
      digimon,
      tamer,
      combat
    );

    digimonRow.replaceChildren(pairCard);
  }
}

function decorateDdaSoloRows(combat, root) {
  for (const row of root.querySelectorAll("[data-combatant-id]")) {
    const combatant =
      combat?.combatants?.get(row.dataset.combatantId) ??
      game.combat?.combatants?.get(row.dataset.combatantId);

    if (!combatant) continue;

    const unitId = getCombatantUnitId(combatant);

    if (!unitId.startsWith("solo:")) continue;

    const raw = getDdaRawInitiative(combatant);

    if (raw === null) continue;

const isEnemyDigimon =
  unitId.startsWith("solo:") &&
  ["digimon", "npc"].includes(combatant.actor?.type);

row.classList.add("dda-solo-combatant");

row.classList.toggle(
  "dda-solo-digimon-enemy",
  isEnemyDigimon
);

const initiativeValue = row.querySelector(
  ".token-initiative > span"
);

if (initiativeValue) {
  initiativeValue.textContent = formatDdaInitiative(raw);

  initiativeValue.parentElement.title = label(
    "Iniciativa DDA",
    "DDA Initiative"
  );

  continue;
}

    let badge = row.querySelector(".dda-solo-initiative");

    if (!badge) {
      badge = document.createElement("span");
      badge.className = "dda-solo-initiative";

      const target =
        row.querySelector(".token-name") ??
        row.querySelector(".combatant-name") ??
        row.querySelector("h4") ??
        row;

      target.append(badge);
    }

    badge.textContent = formatDdaInitiative(raw);
  }
}

function ensureDdaInitiativeButton(root) {
  if (!game.user?.isGM) return;

  if (
    root.querySelector(
      "[data-action='dda-roll-initiative']"
    )
  ) {
    return;
  }

  const button = document.createElement("button");

  button.type = "button";
  button.classList.add("dda-roll-initiative-button");
  button.dataset.action = "dda-roll-initiative";

  button.innerHTML = `
    <i class="fas fa-dice-three"></i>
    ${label("Iniciativa DDA", "DDA Initiative")}
  `;

  button.addEventListener("click", (event) => {
    event.preventDefault();
    void rollDDACombatInitiative(game.combat);
  });

  const target =
    root.querySelector(".combat-tracker-header") ??
    root.querySelector(".directory-header") ??
    root.querySelector("header") ??
    root;

  target.append(button);
}

export function registerDDACombatInitiativeHooks() {
  Hooks.on("renderCombatTracker", (app, htmlData) => {
    const root = elementFrom(htmlData);

    if (!root) return;

    root.querySelectorAll(".dda-raw-initiative").forEach((badge) => {
      badge.remove();
    });

    ensureDdaInitiativeButton(root);

    const combat = getDdaTrackerCombat(app);

    if (!combat?.combatants?.size) return;

    decorateDdaPairRows(combat, root);
    decorateDdaSoloRows(combat, root);  
});

  Hooks.once("ready", () => {
    game.dda ??= {};
    game.dda.combat ??= {};

    game.dda.combat.rollInitiative =
      rollDDACombatInitiative;

    game.dda.combat.endParticipantTurn =
      advanceDDACombatTurn;
  });
}