import {
  expireStartOfTurnQualityEffects
} from "../rules/overclock.js";

import {
  hasUnlockedOfficialTamerTalent
} from "../rules/tamer-resources.js";

import {
  getActorSv
} from "../rules/quality-automation.js";
import {
  grantShiningDigizoidTemporaryIp,
  insertTemporalInForceUnits,
  isTemporalInForceActor,
  processDigizoidGainForceStartOfTurn
} from "./digizoid-gain-force.js";

import {
  applyLuckyNumberReward
} from "../rolls/lucky-number.js";

const SYSTEM_ID = "digimon-digital-adventures";
const FLAG = "initiative";
const SOCKET_END_PARTICIPANT = "ddaEndParticipantTurn";

/**
 * Combat document used by DDA.
 *
 * Tamer and Partner are stored as two technical Combatants so each keeps its
 * own Actor, Actions and end-of-turn refreshes. They are nevertheless one
 * initiative unit. Foundry's native nextTurn/previousTurn would otherwise stop
 * on the hidden secondary Combatant, making the shared turn require two clicks.
 */
export class DDACombat extends Combat {
  /**
   * Keep the official DDA unit order authoritative inside Foundry itself.
   *
   * The visible raw Initiative cannot be used as the native sort value because
   * the rules alternate conflict sides. Each Combatant therefore receives an
   * orderIndex flag when DDA Initiative is rolled, and the Digimon/Tamer pair
   * shares that same index. Foundry v13 explicitly allows systems to override
   * _sortCombatants for alternative tracker orders.
   */
  _sortCombatants(left, right) {
    const leftOrder = number(
      getInitiativeFlag(left, "orderIndex", NaN),
      NaN
    );

    const rightOrder = number(
      getInitiativeFlag(right, "orderIndex", NaN),
      NaN
    );

    const leftHasDDAOrder = Number.isFinite(leftOrder);
    const rightHasDDAOrder = Number.isFinite(rightOrder);

    if (leftHasDDAOrder && rightHasDDAOrder) {
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      const roleDifference =
        getDDACombatantRoleRank(left) -
        getDDACombatantRoleRank(right);

      if (roleDifference) return roleDifference;

      return String(left?.id ?? "")
        .localeCompare(String(right?.id ?? ""));
    }

    if (leftHasDDAOrder !== rightHasDDAOrder) {
      return leftHasDDAOrder ? -1 : 1;
    }

    return super._sortCombatants(left, right);
  }

  /**
   * The native Roll All control must also use the DDA side-alternating roll.
   * This prevents the normal Foundry initiative sorter from silently creating
   * a different order when the GM uses the standard tracker control instead of
   * the dedicated DDA button.
   */
  async rollAll(_options = {}) {
    await rollDDACombatInitiative(this);
    return this;
  }

  async nextTurn() {
    if (!combatUsesDDAUnitOrder(this)) {
      return super.nextTurn();
    }

    return moveDDACombatByUnit(this, 1);
  }

  async previousTurn() {
    if (!combatUsesDDAUnitOrder(this)) {
      return super.previousTurn();
    }

    return moveDDACombatByUnit(this, -1);
  }
}

function getPrimaryActiveGM() {
  return Array.from(game?.users ?? [])
    .filter((user) => user?.isGM && user?.active)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
}

function isPrimaryActiveGM() {
  return Boolean(game?.user?.isGM && getPrimaryActiveGM()?.id === game.user.id);
}

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

  unit.primaryActor = primaryActor;

  if (isTemporalInForceActor(primaryActor)) {
    unit.initiative = {
      dice: 0,
      base: 0,
      systemBonus: 0,
      hyperAlertBonus: 0,
      bonus: 0,
      raw: 0,
      ram: ramOf(primaryActor),
      temporal: true
    };
    return;
  }

  const roll =
    await new Roll(
      "3d6"
    ).evaluate();

  const initiativeDice = Array.from(
    roll.dice?.[0]?.results ?? []
  )
    .filter((result) => result?.active !== false)
    .map((result) => number(result?.result, NaN))
    .filter(Number.isFinite);

  await applyLuckyNumberReward(primaryActor, initiativeDice, {
    source: "initiative"
  });

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


function tacticalAdaptationActorOwners(actor) {
  const owners = (game?.users?.contents ?? [])
    .filter((user) => user.active)
    .filter((user) => user.isGM || actor?.testUserPermission?.(
      user,
      CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    ))
    .map((user) => user.id);
  return [...new Set(owners)];
}

function actorHasTacticalAdaptation(actor) {
  return Boolean(
    actor?.system?.qualityFeatures?.dataSpecialization?.tacticalAdaptationFreeChange
  );
}

async function createTacticalAdaptationInitiativePrompts(units, combat) {
  const seen = new Set();

  for (const unit of units) {
    for (const member of unit.members ?? []) {
      const actor = member?.combatant?.actor;
      const actorKey = actor?.uuid ?? actor?.id ?? "";
      if (!actorKey || seen.has(actorKey) || !actorHasTacticalAdaptation(actor)) continue;
      seen.add(actorKey);

      const authorizedUserIds = tacticalAdaptationActorOwners(actor);
      if (!authorizedUserIds.length) continue;

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        whisper: authorizedUserIds,
        content: `
          <div class="dda-chat-card dda-effect-card effect-special dda-tactical-adaptation-prompt">
            <h2>${label("Adaptação Tática", "Tactical Adaptation")}</h2>
            <p><strong>${html(actor.name)}</strong> ${label(
              "pode mudar imediatamente de Postura ou usar Mudança de Modo como Ação Livre por ter rolado Iniciativa.",
              "may immediately change Stance or use Mode Change as a Free Action because Initiative was rolled."
            )}</p>
            <button type="button" data-action="dda-tactical-adaptation-initiative">
              <i class="fa-solid fa-arrows-rotate"></i>
              ${label("Escolher mudança gratuita", "Choose free change")}
            </button>
          </div>
        `,
        flags: {
          [SYSTEM_ID]: {
            tacticalAdaptationPrompt: {
              actorUuid: actor.uuid,
              combatId: combat?.id ?? "",
              authorizedUserIds,
              createdAt: Date.now()
            }
          }
        }
      });
    }
  }
}

export async function bindTacticalAdaptationInitiativeCard(message, root) {
  const prompt = message?.getFlag?.(SYSTEM_ID, "tacticalAdaptationPrompt");
  if (!prompt || !root?.querySelector) return;

  const button = root.querySelector("[data-action='dda-tactical-adaptation-initiative']");
  if (!button || button.dataset.bound === "true") return;

  const allowed = Boolean(
    game.user?.isGM || prompt.authorizedUserIds?.includes?.(game.user?.id)
  );
  button.hidden = !allowed;
  button.disabled = !allowed;
  if (!allowed) return;

  button.dataset.bound = "true";
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;

    try {
      if (prompt.combatId && String(game.combat?.id ?? "") !== String(prompt.combatId)) {
        ui.notifications.warn(label(
          "Esta janela pertence a outro Combate.",
          "This prompt belongs to another Combat."
        ));
        return;
      }

      const document = await fromUuid(prompt.actorUuid);
      const actor = document?.documentName === "Token" ? document.actor : document;
      if (!actor) return;

      const { useTacticalAdaptationChange } = await import("./digimon-actions.js");
      const result = await useTacticalAdaptationChange(actor, { initiative: true });
      if (!result) button.disabled = false;
    } catch (error) {
      button.disabled = false;
      console.error("DDA | Tactical Adaptation initiative prompt failed.", error);
    }
  });
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

    const normalUnits = orderUnits(units.filter((unit) => !unit.initiative?.temporal));
    const ordered = await insertTemporalInForceUnits([
      ...normalUnits,
      ...units.filter((unit) => unit.initiative?.temporal)
    ]);

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
  if (unit.primaryActor) await grantShiningDigizoidTemporaryIp(unit.primaryActor);
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
        "system.combat.surprised": false,
        "system.combat.digimonActionUses.-=tacticalAdaptationInitiative": null
      });
    }
  }

  /*
   * Rebuild Foundry's turn array after the DDA orderIndex flags are saved.
   * DDACombat._sortCombatants then makes the official alternating sequence the
   * document's real order, not merely a visual decoration in the tracker.
   */
  combat.setupTurns();

  const firstUnitId = ordered[0]?.id ?? "";
  const firstTurnIndex = getDDAUnitAnchorIndex(
    combat.turns ?? [],
    firstUnitId
  );

  await combat.update({
    turn: firstTurnIndex >= 0 ? firstTurnIndex : 0,

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

  await createTacticalAdaptationInitiativePrompts(ordered, combat);

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

export function getCombatantUnitId(combatant) {
  return String(
    getInitiativeFlag(combatant, "unitId", "")
  ).trim();
}

function getCurrentCombatRound(combat) {
  return Math.max(1, number(combat?.round, 1));
}

export function combatantEndedThisRound(combatant, combat = game.combat) {
  return number(
    getInitiativeFlag(combatant, "endedRound", 0),
    0
  ) === getCurrentCombatRound(combat);
}

export function getCombatantForActor(combat, actor) {
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

export function getActiveDDAUnitContext(
  actor,
  combat = game.combat
) {
  if (!combat?.started || !actor) {
    return {
      allowed: true,
      combat,
      combatant: null,
      activeCombatant: combat?.combatant ?? null,
      unitId: "",
      activeUnitId: "",
      ended: false,
      reason: "no-active-combat"
    };
  }

  const combatant = getCombatantForActor(combat, actor);
  const activeCombatant = combat.combatant ?? null;

  if (!combatant) {
    return {
      allowed: false,
      combat,
      combatant: null,
      activeCombatant,
      unitId: "",
      activeUnitId: getCombatantUnitId(activeCombatant),
      ended: false,
      reason: "actor-not-in-combat"
    };
  }

  const unitId = getCombatantUnitId(combatant);
  const activeUnitId = getCombatantUnitId(activeCombatant);
  const ended = combatantEndedThisRound(combatant, combat);
  const sameActivation = unitId && activeUnitId
    ? unitId === activeUnitId
    : activeCombatant?.id === combatant.id;

  return {
    allowed: Boolean(sameActivation && !ended),
    combat,
    combatant,
    activeCombatant,
    unitId,
    activeUnitId,
    ended,
    reason: ended
      ? "participant-ended"
      : sameActivation
        ? "active-unit"
        : "different-unit"
  };
}

export function canActorActInCurrentDDAUnit(
  actor,
  combat = game.combat
) {
  return getActiveDDAUnitContext(actor, combat).allowed;
}

export function getDDAUnitActorsForActor(actor, combat = game.combat) {
  const combatant = getCombatantForActor(combat, actor);
  if (!combatant) return actor ? [actor] : [];

  const unitId = getCombatantUnitId(combatant);
  const members = unitId
    ? getUnitCombatants(combat, unitId)
    : [combatant];

  return members.map((member) => member.actor).filter(Boolean);
}

function effectTagKey(tag = "") {
  return String(tag ?? "").trim().replace(/^\[|\]$/g, "").toLowerCase();
}

function actorReferenceKeys(actor) {
  return new Set([
    actor?.uuid,
    actor?.id,
    actor?.id ? `Actor.${actor.id}` : ""
  ].filter(Boolean).map(String));
}

function effectBearingActors() {
  const actors = [
    ...(game.actors?.contents ?? []),
    ...((canvas?.scene?.tokens ?? []).map((token) => token.actor).filter(Boolean))
  ];
  return [...new Map(actors.map((actor) => [actor.uuid ?? actor.id, actor])).values()];
}

export async function processDDAStartOfTurnEffects(activeActor, combat = game.combat) {
  if (!activeActor) return;

  const tick = `${combat?.id ?? "no-combat"}:${Number(combat?.round ?? 0)}:${Number(combat?.turn ?? -1)}`;
  const sourceKeys = actorReferenceKeys(activeActor);

  for (const target of effectBearingActors()) {
    if (!game.user?.isGM && !target.isOwner) continue;

    const effects = foundry.utils.deepClone(target.system?.effects?.active ?? []);
    if (!effects.length) continue;

    let changed = false;
    let expiredShield = false;
    const remainingEffects = [];

    for (const effect of effects) {
      const tag = effectTagKey(effect.tag);

      if (target.uuid === activeActor.uuid && tag === "regen" && effect.lastStartTurnTick !== tick) {
        const woundsPath = target.type === "character"
          ? "system.derived.wounds"
          : "system.miscStats.wounds";
        const wounds = foundry.utils.getProperty(target, woundsPath) ?? {};
        const current = Math.max(0, number(wounds.value, 0));
        const maximum = Math.max(current, number(wounds.max, current));
        let healing = Math.max(1, number(effect.potency ?? effect.value, 1));
        const doom = effects.find((candidate) => effectTagKey(candidate.tag) === "doom");
        if (doom) {
          const doomValue = Math.max(0, number(doom.value ?? doom.potency, 0));
          const absorbed = Math.min(doomValue, healing);
          healing -= absorbed;
          doom.value = doomValue - absorbed;
          if (doom.value <= 0) doom._ddaExpiredByDoom = true;
        }
        if (current < maximum && healing > 0) {
          await target.update({ [`${woundsPath}.value`]: Math.min(maximum, current + healing) });
        }
        effect.lastStartTurnTick = tick;
        changed = true;
      }

      const isNormalDuration = effect.hasDuration === true || effect.durationRule === true || effect.durationRule === "true";
      /*
       * Durações normais pertencem ao relógio do conjurador. Efeitos legados
       * sem UUID de origem usam, de forma determinística, o início do turno
       * do próprio alvo; assim eles não ficam permanentes por acidente.
       */
      const sourceUuid = String(effect.sourceActorUuid ?? "").trim();
      const belongsToCaster = sourceUuid
        ? sourceKeys.has(sourceUuid)
        : target.uuid === activeActor.uuid;

      if (effect._ddaExpiredByDoom) {
        changed = true;
        continue;
      }

      if (!isNormalDuration || !belongsToCaster || effect.lastDurationTick === tick) {
        remainingEffects.push(effect);
        continue;
      }

      const nextRemaining = Math.max(0, number(effect.remaining ?? effect.duration, 1) - 1);
      effect.remaining = nextRemaining;
      effect.lastDurationTick = tick;
      changed = true;

      if (nextRemaining > 0) remainingEffects.push(effect);
      else if (tag === "shield") expiredShield = true;
    }

    if (changed) {
      const updates = {
        "system.effects.active": remainingEffects.filter((effect) => !effect._ddaExpiredByDoom)
      };
      if (expiredShield) {
        const tempPath = target.type === "character"
          ? "system.derived.wounds.temp"
          : "system.miscStats.wounds.temp";
        updates[`${tempPath}.value`] = 0;
        updates[`${tempPath}.source`] = "";
        updates[`${tempPath}.duration`] = "";
      }
      await target.update(updates);
      target.sheet?.render(false);
    }
  }
}

async function processDDAUnitStart(combat, anchorCombatant = combat?.combatant) {
  if (!anchorCombatant?.actor) return;

  const unitId = getCombatantUnitId(anchorCombatant);
  const members = unitId
    ? getUnitCombatants(combat, unitId)
    : [anchorCombatant];

  for (const member of members) {
    if (!member?.actor) continue;

    await expireStartOfTurnQualityEffects(member.actor);
    await processDigizoidGainForceStartOfTurn(member.actor);
    await processDDAStartOfTurnEffects(member.actor, combat);
  }
}

function combatUsesDDAUnitOrder(combat) {
  const activeUnitId = getCombatantUnitId(combat?.combatant);
  if (!activeUnitId) return false;

  return (combat?.turns ?? []).some((combatant) => {
    return Boolean(getCombatantUnitId(combatant));
  });
}

function getDDACombatantRoleRank(combatant) {
  const role = String(
    getInitiativeFlag(combatant, "role", "solo")
  );

  // The visible Digimon/solo row is always the unit anchor. The hidden Tamer
  // remains immediately after it only so both Actors keep independent Actions.
  return role === "tamer" ? 1 : 0;
}

function getDDAUnitAnchorIndex(turns = [], unitId = "") {
  const matchingIndexes = [];

  for (let index = 0; index < turns.length; index += 1) {
    if (getCombatantUnitId(turns[index]) === unitId) {
      matchingIndexes.push(index);
    }
  }

  if (!matchingIndexes.length) return -1;

  return matchingIndexes.find((index) => {
    return getDDACombatantRoleRank(turns[index]) === 0;
  }) ?? matchingIndexes[0];
}

function getDDAUnitOrderIds(combat) {
  const turns = combat?.turns ?? [];
  const presentUnitIds = new Set(
    turns
      .map((combatant) => getCombatantUnitId(combatant))
      .filter(Boolean)
  );

  const storedOrder = combat?.getFlag?.(
    SYSTEM_ID,
    `${FLAG}.order`
  );

  const result = [];
  const used = new Set();

  if (Array.isArray(storedOrder)) {
    for (const entry of storedOrder) {
      const unitId = String(entry?.id ?? "").trim();

      if (!unitId || !presentUnitIds.has(unitId) || used.has(unitId)) {
        continue;
      }

      used.add(unitId);
      result.push(unitId);
    }
  }

  /*
   * orderIndex is also persisted on every Combatant. It is the fallback for
   * older combats whose Combat-level order flag is missing or incomplete.
   */
  const remaining = [];

  for (const unitId of presentUnitIds) {
    if (used.has(unitId)) continue;

    const member = turns.find((combatant) => {
      return getCombatantUnitId(combatant) === unitId;
    });

    remaining.push({
      unitId,
      orderIndex: number(
        getInitiativeFlag(member, "orderIndex", Number.POSITIVE_INFINITY),
        Number.POSITIVE_INFINITY
      )
    });
  }

  remaining.sort((left, right) => {
    if (left.orderIndex !== right.orderIndex) {
      return left.orderIndex - right.orderIndex;
    }

    return left.unitId.localeCompare(right.unitId);
  });

  for (const entry of remaining) {
    used.add(entry.unitId);
    result.push(entry.unitId);
  }

  return result;
}

async function moveDDACombatByUnit(combat, direction = 1) {
  const turns = combat?.turns ?? [];
  const currentIndex = Number(combat?.turn ?? -1);
  const currentCombatant = turns[currentIndex] ?? combat?.combatant ?? null;
  const currentUnitId = getCombatantUnitId(currentCombatant);
  const unitOrder = getDDAUnitOrderIds(combat);
  const currentUnitIndex = unitOrder.indexOf(currentUnitId);
  const step = direction < 0 ? -1 : 1;

  if (
    !turns.length ||
    currentIndex < 0 ||
    !currentCombatant ||
    !currentUnitId ||
    currentUnitIndex < 0 ||
    !unitOrder.length
  ) {
    return combat;
  }

  if (unitOrder.length === 1) {
    await combat.update({
      round: step > 0
        ? getCurrentCombatRound(combat) + 1
        : Math.max(1, getCurrentCombatRound(combat) - 1),
      turn: getDDAUnitAnchorIndex(turns, currentUnitId)
    });

    return combat;
  }

  const nextUnitIndex = (
    currentUnitIndex + step + unitOrder.length
  ) % unitOrder.length;

  const nextUnitId = unitOrder[nextUnitIndex];
  const nextTurnIndex = getDDAUnitAnchorIndex(turns, nextUnitId);

  if (nextTurnIndex < 0) return combat;

  const wrapped = step > 0
    ? nextUnitIndex <= currentUnitIndex
    : nextUnitIndex >= currentUnitIndex;

  const updateData = {
    turn: nextTurnIndex
  };

  if (wrapped) {
    updateData.round = step > 0
      ? getCurrentCombatRound(combat) + 1
      : Math.max(1, getCurrentCombatRound(combat) - 1);
  }

  await combat.update(updateData);
  return combat;
}

async function setActiveCombatant(combat, combatantId) {
  const turnIndex = getTurnIndex(combat, combatantId);

  if (turnIndex < 0) return false;
  if (Number(combat.turn ?? -1) === turnIndex) return true;

  await combat.update({
    turn: turnIndex
  });

  const activeCombatant =
    combat.turns?.[turnIndex] ??
    combat.combatant;

  await processDDAUnitStart(combat, activeCombatant);

  return true;
}

async function advanceToNextUnit(combat, sourceCombatant) {
  const turns = combat?.turns ?? [];
  const sourceUnitId = getCombatantUnitId(sourceCombatant);
  const unitOrder = getDDAUnitOrderIds(combat);
  const sourceUnitIndex = unitOrder.indexOf(sourceUnitId);

  if (!turns.length || !sourceUnitId || sourceUnitIndex < 0) {
    return false;
  }

  if (unitOrder.length === 1) {
    const sourceAnchorIndex = getDDAUnitAnchorIndex(
      turns,
      sourceUnitId
    );

    await combat.update({
      round: getCurrentCombatRound(combat) + 1,
      turn: sourceAnchorIndex
    });

    await processDDAUnitStart(
      combat,
      turns[sourceAnchorIndex] ?? sourceCombatant
    );

    return true;
  }

  const nextUnitIndex = (
    sourceUnitIndex + 1
  ) % unitOrder.length;

  const nextUnitId = unitOrder[nextUnitIndex];
  const nextTurnIndex = getDDAUnitAnchorIndex(
    turns,
    nextUnitId
  );

  if (nextTurnIndex < 0) return false;

  const updateData = {
    turn: nextTurnIndex
  };

  if (nextUnitIndex <= sourceUnitIndex) {
    updateData.round = getCurrentCombatRound(combat) + 1;
  }

  await combat.update(updateData);

  await processDDAUnitStart(
    combat,
    turns[nextTurnIndex]
  );

  return true;
}

async function advanceDDACombatTurnLocal(
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
      await processDDAStartOfTurnEffects(combat.combatant?.actor, combat);

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

  const activeUnitId = getCombatantUnitId(combat.combatant);

  if (!activeUnitId || activeUnitId !== unitId) {
    ui.notifications.warn(label(
      `${combatant.name} não pertence à unidade ativa.`,
      `${combatant.name} does not belong to the active unit.`
    ));

    return {
      advanced: false,
      reason: "different-unit"
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
    return {
      advanced: false,
      mode: "waiting-for-unit",
      pendingCombatantIds: pendingMembers.map((member) => member.id)
    };
  }

  await advanceToNextUnit(combat, combatant);

  return {
    advanced: true,
    mode: "next-unit"
  };
}

async function requestGMEndParticipantTurn(actor, combat = game.combat) {
  const gm = getPrimaryActiveGM();

  if (!gm) {
    ui.notifications.warn(label(
      "É necessário um Mestre ativo para encerrar o turno no Combat Tracker.",
      "An active GM is required to end the turn in the Combat Tracker."
    ));
    return { advanced: false, ended: false, reason: "no-active-gm" };
  }

  return new Promise((resolve) => {
    let settled = false;
    const combatId = combat?.id ?? "";
    const combatant = getCombatantForActor(combat, actor);
    const combatantId = combatant?.id ?? "";
    const startingUnitId = getCombatantUnitId(combat?.combatant);
    const startingRound = Number(combat?.round ?? 0);
    const startingTurn = Number(combat?.turn ?? -1);
    let combatHookId = null;
    let combatantHookId = null;
    let endedTimer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (combatHookId !== null) Hooks.off("updateCombat", combatHookId);
      if (combatantHookId !== null) Hooks.off("updateCombatant", combatantHookId);
      if (endedTimer !== null) window.clearTimeout(endedTimer);
      resolve(result ?? { advanced: false, reason: "empty-response" });
    };

    combatHookId = Hooks.on("updateCombat", (updatedCombat) => {
      if (updatedCombat?.id !== combatId) return;
      const nextUnitId = getCombatantUnitId(updatedCombat.combatant);
      if (
        (nextUnitId && nextUnitId !== startingUnitId) ||
        Number(updatedCombat.round ?? 0) !== startingRound ||
        Number(updatedCombat.turn ?? -1) !== startingTurn
      ) {
        finish({ advanced: true, ended: true, mode: "next-unit" });
      }
    });

    combatantHookId = Hooks.on("updateCombatant", (updatedCombatant) => {
      if (updatedCombatant?.id !== combatantId) return;
      if (!combatantEndedThisRound(updatedCombatant, combat)) return;

      /*
       * The second member's flag is updated just before the Combat itself
       * advances. Give that update a brief window before reporting that the
       * unit is still waiting for its partner.
       */
      endedTimer = window.setTimeout(() => {
        finish({
          advanced: false,
          ended: true,
          mode: "waiting-for-unit"
        });
      }, 250);
    });

    game.socket.emit(`system.${SYSTEM_ID}`, {
      action: SOCKET_END_PARTICIPANT,
      actorUuid: actor.uuid,
      combatId,
      requestingUserId: game.user?.id ?? ""
    });

    window.setTimeout(() => {
      const nextUnitId = getCombatantUnitId(game.combat?.combatant);
      const advanced = (
        (nextUnitId && nextUnitId !== startingUnitId) ||
        Number(game.combat?.round ?? 0) !== startingRound ||
        Number(game.combat?.turn ?? -1) !== startingTurn
      );
      finish(advanced
        ? { advanced: true, ended: true, mode: "next-unit" }
        : combatantEndedThisRound(getCombatantForActor(game.combat, actor), game.combat)
          ? { advanced: false, ended: true, mode: "waiting-for-unit" }
          : { advanced: false, ended: false, reason: "gm-timeout" });
    }, 5000);
  });
}

export async function advanceDDACombatTurn(actor, combat = game.combat) {
  if (game.user?.isGM) return advanceDDACombatTurnLocal(actor, combat);
  return requestGMEndParticipantTurn(actor, combat);
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
  const activeCombatant = combat?.combatant;
  const activeUnitId = getCombatantUnitId(activeCombatant);
  const combatantUnitId = getCombatantUnitId(combatant);
  const active = activeUnitId
    ? activeUnitId === combatantUnitId
    : activeCombatant?.id === combatant.id;

  const actions = number(
    combatant.actor?.system?.combat?.actions?.value,
    0
  );

  if (ended) {
    return {
      key: "ended",
      icon: "✓",
      label: label("Encerrado", "Ended"),
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

  const isActive = getCombatantUnitId(combat?.combatant) === unitId;

  card.className = `dda-combat-pair-card${isActive ? " is-active" : ""}`;
  card.dataset.ddaUnitId = unitId;

  card.innerHTML = `
    <div class="dda-pair-shared-turn">
      <i class="fas fa-link" aria-hidden="true"></i>
      ${html(label("Mesmo turno — ações separadas", "Same turn — separate Actions"))}
    </div>

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

export function refreshDDAUnitVisuals(combat = game.combat) {
  const apply = () => {
    const activeUnitId = getCombatantUnitId(combat?.combatant);
    const combatants = combat?.combatants?.contents ?? [];

    const decorate = (element, combatant) => {
      if (!element || !combatant) return;
      const sameUnit = Boolean(
        activeUnitId && getCombatantUnitId(combatant) === activeUnitId
      );
      const ended = combatantEndedThisRound(combatant, combat);
      const role = String(getInitiativeFlag(combatant, "role", "solo"));

      element.classList.toggle("dda-unit-active", sameUnit);
      element.classList.toggle("dda-unit-ended", sameUnit && ended);
      element.classList.toggle("dda-unit-ready", sameUnit && !ended);
      element.classList.toggle("dda-unit-tamer", sameUnit && role === "tamer");
      element.classList.toggle("dda-unit-digimon", sameUnit && role === "digimon");
      if (sameUnit) {
        element.dataset.ddaUnitRole = role === "tamer"
          ? label("Tamer", "Tamer")
          : role === "digimon"
            ? "Digimon"
            : label("Ativo", "Active");
        element.dataset.ddaSharedTurn = label("Mesmo turno", "Same turn");
      }
      else {
        delete element.dataset.ddaUnitRole;
        delete element.dataset.ddaSharedTurn;
      }
    };

    for (const combatant of combatants) {
      const selector = `[data-combatant-id="${combatant.id}"]`;
      for (const row of document.querySelectorAll(selector)) decorate(row, combatant);
    }

    /* Optional integration: Carousel Combat Tracker (combat-tracker-dock). */
    if (game.modules?.get("combat-tracker-dock")?.active && ui.combatDock?.portraits) {
      for (const portrait of ui.combatDock.portraits) {
        decorate(portrait.element, portrait.combatant);
      }
    }
  };

  if (typeof requestAnimationFrame === "function") requestAnimationFrame(apply);
  else apply();

  /* Combat Tracker Dock renders each portrait asynchronously. */
  if (game.modules?.get("combat-tracker-dock")?.active) {
    window.setTimeout(apply, 120);
  }
}

export function registerDDACombatInitiativeHooks() {
  Hooks.on("updateCombat", (combat, changed) => {
    refreshDDAUnitVisuals(combat);
    if (!game.user?.isGM || !combat?.started) return;
    if (!("turn" in changed || "round" in changed)) return;

    void processDDAUnitStart(combat, combat.combatant).catch((error) => {
      console.error("DDA | Could not process start-of-turn effects.", error);
    });
  });

  Hooks.on("updateCombatant", (combatant) => {
    refreshDDAUnitVisuals(combatant?.combat ?? game.combat);
  });

  const clearCombatBoundEffects = async (combat) => {
    if (!game.user?.isGM) return;
    const combatId = String(combat?.id ?? "");
    for (const actor of effectBearingActors()) {
      const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
      const remaining = effects.filter((effect) => {
        const boundToThisCombat = !effect.appliedCombatId || String(effect.appliedCombatId) === combatId;
        return !(boundToThisCombat && (effect.endsAtCombatEnd || effect.durationRule === "combat"));
      });
      if (remaining.length !== effects.length) await actor.update({ "system.effects.active": remaining });
    }
  };
  Hooks.on("combatEnd", (combat) => void clearCombatBoundEffects(combat));
  Hooks.on("deleteCombat", (combat) => void clearCombatBoundEffects(combat));

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
    refreshDDAUnitVisuals(combat);
});

  Hooks.once("ready", () => {
    game.socket?.on(`system.${SYSTEM_ID}`, async (payload = {}, respond) => {
      if (payload?.action !== SOCKET_END_PARTICIPANT || !isPrimaryActiveGM()) return;

      try {
        const actorDocument = await fromUuid(payload.actorUuid);
        const actor = actorDocument?.documentName === "Token"
          ? actorDocument.actor
          : actorDocument;
        const combat = game.combats?.get(payload.combatId) ?? game.combat;
        const result = await advanceDDACombatTurnLocal(actor, combat);
        if (typeof respond === "function") respond(result);
      } catch (error) {
        console.error("DDA | Could not end the participant turn through the GM.", error);
        if (typeof respond === "function") {
          respond({ advanced: false, reason: "gm-error", error: String(error?.message ?? error) });
        }
      }
    });

    game.dda ??= {};
    game.dda.combat ??= {};

    game.dda.combat.rollInitiative =
      rollDDACombatInitiative;

    game.dda.combat.endParticipantTurn =
      advanceDDACombatTurn;

    refreshDDAUnitVisuals(game.combat);
  });
}
