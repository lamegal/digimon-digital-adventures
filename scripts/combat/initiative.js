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
import {
  expireCombatBoundNonStackingTemporaryWounds,
  expireNonStackingTemporaryWounds
} from "./temporary-wounds.js";

import {
  ensureBossEncounterRuntime,
  getBossEncounterActorForCombatant,
  getRaidActionCombatants,
  getRaidBossRuntimeState,
  healActiveBossTemplatePool,
  getBossTemplateRuntimeState,
  isBossTemplateActivationCombatant,
  isRaidActionCombatant,
  processRaidActionTurn
} from "./boss-encounters.js";

const SYSTEM_ID = "digimon-digital-adventures";
const FLAG = "initiative";
const SOCKET_END_PARTICIPANT = "ddaEndParticipantTurn";
const TRACKER_AFFILIATION_STYLESHEET_ID = "dda-combat-tracker-affiliation-styles";
const TRACKER_AFFILIATION_STYLESHEET = `systems/${SYSTEM_ID}/styles/dda-combat-tracker-affiliation-v10.css`;

function getChangedNumericValue(changes, path) {
  if (!changes || typeof changes !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(changes, path)) {
    const value = Number(changes[path]);
    return Number.isFinite(value) ? value : null;
  }
  const nested = foundry.utils.getProperty(changes, path);
  if (nested === undefined || nested === null) return null;
  const value = Number(nested);
  return Number.isFinite(value) ? value : null;
}

function effectTagKeyBeta8(tag = "") {
  return String(tag ?? "")
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .toLowerCase();
}

function registerHasteActionConsumptionBeta8() {
  const registry = globalThis.__ddaBeta8Runtime ??= {};
  if (registry.hasteActionConsumptionHook) return;
  registry.hasteActionConsumptionHook = true;

  Hooks.on("preUpdateActor", (actor, changes) => {
    const nextActions = getChangedNumericValue(
      changes,
      "system.combat.actions.value"
    );
    if (nextActions === null) return;

    const currentActions = Math.max(
      0,
      Number(actor?.system?.combat?.actions?.value ?? 0)
    );
    if (nextActions >= currentActions) return;

    /*
     * Action loss (for example [STUN]) is not an expenditure. Real action
     * payments in DDA update one of the per-turn action counters alongside the
     * action pool, so only those updates may consume the Action granted by
     * [HASTE].
     */
    const currentMovement = Math.max(
      0,
      Number(actor?.system?.combat?.movementActionsThisTurn ?? 0)
    );
    const currentNonMovement = Math.max(
      0,
      Number(actor?.system?.combat?.nonMovementActionsThisTurn ?? 0)
    );
    const nextMovement = getChangedNumericValue(
      changes,
      "system.combat.movementActionsThisTurn"
    );
    const nextNonMovement = getChangedNumericValue(
      changes,
      "system.combat.nonMovementActionsThisTurn"
    );
    const trackedSpend =
      Math.max(0, (nextMovement ?? currentMovement) - currentMovement) +
      Math.max(0, (nextNonMovement ?? currentNonMovement) - currentNonMovement);
    if (trackedSpend <= 0) return;

    const updatedEffects = Object.prototype.hasOwnProperty.call(
      changes,
      "system.effects.active"
    )
      ? changes["system.effects.active"]
      : foundry.utils.getProperty(changes, "system.effects.active");
    const effects = foundry.utils.deepClone(
      Array.isArray(updatedEffects)
        ? updatedEffects
        : actor?.system?.effects?.active ?? []
    );
    const hasteIndex = effects.findIndex((effect) => {
      return effectTagKeyBeta8(effect?.tag) === "haste" &&
        Number(effect?.actionGranted ?? 1) > 0;
    });
    if (hasteIndex < 0) return;

    const hasteGrant = Math.max(
      0,
      Number(effects[hasteIndex]?.actionGranted ?? 1)
    );
    const ordinaryActionsAvailable = Math.max(
      0,
      currentActions - hasteGrant
    );
    const actionsSpent = Math.max(0, currentActions - nextActions);

    // Ordinary Actions are spent first. HASTE ends only when its granted Action
    // is actually needed to complete the payment.
    if (actionsSpent <= ordinaryActionsAvailable) return;

    effects.splice(hasteIndex, 1);
    changes["system.effects.active"] = effects;
  });
}

registerHasteActionConsumptionBeta8();

function ensureDdaCombatTrackerAffiliationStyles() {
  if (typeof document === "undefined") return;

  const route = foundry.utils.getRoute(TRACKER_AFFILIATION_STYLESHEET);
  const cacheBusted = foundry.utils.getCacheBustURL?.(route);
  const href = typeof cacheBusted === "string" ? cacheBusted : route;

  const existing = document.getElementById(TRACKER_AFFILIATION_STYLESHEET_ID)
    ?? document.querySelector(`link[href*="dda-combat-tracker-affiliation-v10.css"]`);
  if (existing) {
    existing.id = TRACKER_AFFILIATION_STYLESHEET_ID;
    if (!String(existing.href ?? "").includes("dda-combat-tracker-affiliation-v10.css")) existing.href = href;
    return;
  }

  const link = document.createElement("link");
  link.id = TRACKER_AFFILIATION_STYLESHEET_ID;
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.ddaCombatTrackerAffiliation = "true";
  document.head.append(link);
}

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

async function resetCombatStancesToNeutral(combat) {
  if (!combat || !isPrimaryActiveGM()) return false;
  const actors = new Map();
  for (const combatant of combat.combatants?.contents ?? combat.combatants ?? []) {
    const actor = combatant?.actor;
    if (!actor || !["digimon", "npc"].includes(actor.type)) continue;
    actors.set(String(actor.uuid ?? actor.id), actor);
  }

  let changed = false;
  for (const actor of actors.values()) {
    if (String(actor.system?.combat?.currentStance ?? "neutral") === "neutral") continue;
    await actor.update({ "system.combat.currentStance": "neutral" });
    changed = true;
  }
  return changed;
}

function normalizeInitiativeSide(value, fallback = "") {
  const side = String(value ?? "").trim().toLowerCase();
  if (["enemies", "enemy", "hostile", "opponent", "opponents"].includes(side)) return "enemies";
  if (["players", "player", "ally", "allies", "friendly", "friend"].includes(side)) return "players";
  return fallback;
}

function sideOf(combatant) {
  /*
   * Token disposition is the scene-level declaration of allegiance. This MUST
   * take precedence over the Actor template default: ordinary Digimon Actors
   * are born with initiative.side="players", but GMs routinely drag one to
   * the Scene and mark its Token Hostile to use it as an enemy.
   */
  const tokenDisposition = Number(
    combatant?.token?.disposition ??
    combatant?.token?.document?.disposition ??
    canvas?.tokens?.placeables?.find((token) => token?.document?.id === combatant?.tokenId)?.document?.disposition ??
    combatant?.actor?.prototypeToken?.disposition
  );

  if (tokenDisposition === CONST.TOKEN_DISPOSITIONS?.HOSTILE || tokenDisposition === -1) return "enemies";
  if (tokenDisposition === CONST.TOKEN_DISPOSITIONS?.FRIENDLY || tokenDisposition === 1) return "players";

  // Enemy-Wizard metadata is more explicit than an old Actor default.
  const actorIsEnemy = Boolean(
    combatant?.actor?.system?.enemy?.isEnemy === true ||
    combatant?.actor?.getFlag?.(SYSTEM_ID, "enemyNpc")?.isEnemy === true
  );
  if (actorIsEnemy) return "enemies";

  // Neutral Tokens may use an explicitly configured DDA side. NPC templates
  // default to enemies and Digimon templates to players, so this preserves
  // explicit ally-NPC overrides without letting a hostile placed Token lose.
  const configured = String(
    combatant?.actor?.system?.combat?.initiative?.side ?? ""
  ).trim();

  if (configured === "players" || configured === "enemies") {
    return configured;
  }

  // Final document fallback for legacy Actors with no side configured.
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
    if (!combatant.actor || used.has(combatant.id) || isRaidActionCombatant(combatant)) continue;

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

  const primaryCombatant =
    digimonMember?.combatant ??
    unit.members[0]?.combatant;
  const primaryActor = isBossTemplateActivationCombatant(primaryCombatant)
    ? getBossEncounterActorForCombatant(primaryCombatant, primaryCombatant?.combat ?? game.combat)
    : primaryCombatant?.actor;

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

  /*
   * DDA alternates initiative sides for as long as both sides still have
   * available units. Once one side runs out, every remaining unit from the
   * outnumbering side is appended to the end of the round in its own rolled
   * initiative order.
   *
   * The side with the highest leading Initiative acts first. Ties are already
   * resolved by compareUnits (RAM, then Players).
   */
  const firstSide =
    compareUnits(players[0], enemies[0]) <= 0
      ? "players"
      : "enemies";

  const first = firstSide === "players" ? players : enemies;
  const second = firstSide === "players" ? enemies : players;

  const result = [];
  const pairedCount = Math.min(first.length, second.length);

  for (let index = 0; index < pairedCount; index += 1) {
    result.push(first[index], second[index]);
  }

  /*
   * Only one side can have leftovers. Do not distribute those extras between
   * opposing activations: Outnumbered units stack at the end of the order.
   */
  if (first.length > pairedCount) {
    result.push(...first.slice(pairedCount));
  }

  if (second.length > pairedCount) {
    result.push(...second.slice(pairedCount));
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
  const charmIds = game?.dda?.bossQualities?.getCharmAuthorizedUserIds?.(actor, { includeGMs: true });
  const owners = Array.isArray(charmIds)
    ? (game?.users?.contents ?? [])
      .filter((user) => user.active && charmIds.includes(String(user.id)))
      .map((user) => user.id)
    : (game?.users?.contents ?? [])
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

    /*
     * Boss encounter runtimes add their technical Combatants before initiative
     * units are built. Boss Template activations join the normal order; Raid
     * Action entries are excluded from normal rolls and are pinned to the top.
     */
    if (game.user?.isGM) {
      await ensureBossEncounterRuntime(combat);
    }

    const raidCombatants = getRaidActionCombatants(combat)
      .sort((left, right) => String(left.actor?.name ?? left.name ?? "").localeCompare(String(right.actor?.name ?? right.name ?? "")));

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
  await resetCombatStancesToNeutral(combat);
  await combat.startCombat();
}

/*
 * Hyper Alert já foi incluído durante
 * rollUnitInitiative.
 *
 * Evasive Maneuvers nasce agora, depois
 * que o Combate possui um ID e está ativo.
 */
const {
  initializeOverlookedForInitiative,
  processChallengerInitiative
} = await import(
  "../rules/tamer-talent-combat-survival.js"
);

for (const unit of ordered) {
  await initializeEvasiveManeuversReserve(
    unit,
    combat
  );

  await processChallengerInitiative(
    unit,
    ordered,
    combat
  );

  await initializeOverlookedForInitiative(
    unit,
    ordered,
    combat
  );

  if (unit.primaryActor) {
    await grantShiningDigizoidTemporaryIp(
      unit.primaryActor
    );
  }
}

const updates = [];

  raidCombatants.forEach((combatant, raidIndex) => {
    const raidUnitId = `raid:${combatant.id}`;
    updates.push({
      _id: combatant.id,
      initiative: Number((ordered.length + raidCombatants.length + 100 - (raidIndex * 0.001)).toFixed(3)),
      [combatantFlag("unitId")]: raidUnitId,
      [combatantFlag("role")]: "raid",
      [combatantFlag("side")]: "enemies",
      [combatantFlag("raw")]: 999999 - raidIndex,
      [combatantFlag("dice")]: 0,
      [combatantFlag("base")]: 0,
      [combatantFlag("bonus")]: 0,
      [combatantFlag("systemBonus")]: 0,
      [combatantFlag("hyperAlertBonus")]: 0,
      [combatantFlag("evasiveManeuversMax")]: 0,
      [combatantFlag("orderIndex")]: raidIndex,
      [combatantFlag("lastEndedRound")]: 0,
      [combatantFlag("endedRound")]: 0
    });
  });

  ordered.forEach((unit, unitIndex) => {
    const surprisedUnit = unit.members.some((member) => {
      return Boolean(
        member.combatant.actor?.system?.combat?.surprised &&
        member.combatant.actor?.system?.combat?.bestLaidPlansSurprise
      );
    });

    unit.members.forEach((member, memberIndex) => {
      // O Foundry precisa de valores diferentes para manter
      // Tamer e Digimon consecutivos.
      // A iniciativa verdadeira fica nas flags DDA.
      const technicalInitiative = Number(
        (
          ordered.length + raidCombatants.length -
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

        [combatantFlag("orderIndex")]: unitIndex + raidCombatants.length,
        [combatantFlag("lastEndedRound")]: 0,
        [combatantFlag("endedRound")]: surprisedUnit
          ? getCurrentCombatRound(combat)
          : 0
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

      const bestLaidPlansSurprised = Boolean(
        actor.system?.combat?.surprised &&
        actor.system?.combat?.bestLaidPlansSurprise
      );

      const preInitiativeEvolution = actor.system?.combat?.preInitiativeEvolution ?? {};
      const preInitiativeDebt = (
        preInitiativeEvolution.pending &&
        String(preInitiativeEvolution.combatId ?? "") === String(combat.id ?? "")
      )
        ? Math.max(0, number(preInitiativeEvolution.actionDebt, 0))
        : 0;

      const initiativeActions = Math.max(
        0,
        number(actor.system?.combat?.actions?.max, 2) - preInitiativeDebt
      );

      await actor.update({
        "system.combat.actions.value": bestLaidPlansSurprised
          ? 0
          : initiativeActions,

        "system.combat.hasAttackedThisRound": false,
        "system.combat.attacksMadeThisTurn": 0,
        "system.combat.movementActionsThisTurn": 0,
        "system.combat.nonMovementActionsThisTurn": 0,
        "system.combat.multiattackPenalty": 0,
        "system.combat.signatureMoveUsedThisTurn": false,
        "system.combat.energizeUsedThisTurn": false,
        ...(!bestLaidPlansSurprised
          ? { "system.combat.surprised": false }
          : {}),
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

  const firstUnitId = raidCombatants.length
    ? `raid:${raidCombatants[0].id}`
    : ordered.find((unit) => {
        return !isDDAUnitEndedForRound(
          combat,
          unit.id,
          getCurrentCombatRound(combat)
        );
      })?.id ?? ordered[0]?.id ?? "";

  const firstTurnIndex = getDDAUnitAnchorIndex(
    combat.turns ?? [],
    firstUnitId
  );

  await combat.update({
    turn: firstTurnIndex >= 0 ? firstTurnIndex : 0,

    [`flags.${SYSTEM_ID}.${FLAG}.order`]: [
      ...raidCombatants.map((combatant) => ({
        id: `raid:${combatant.id}`,
        side: "enemies",
        raw: 999999,
        members: [combatant.id],
        raidAction: true
      })),
      ...ordered.map((unit) => ({
        id: unit.id,
        side: unit.side,
        raw: unit.initiative.raw,
        members: unit.members.map(
          (member) => member.combatant.id
        )
      }))
    ]
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

function sameCombatActorReference(left, right) {
  if (!left || !right) return false;
  const leftUuid = String(left.uuid ?? "");
  const rightUuid = String(right.uuid ?? "");
  const leftSynthetic = leftUuid.startsWith("Scene.");
  const rightSynthetic = rightUuid.startsWith("Scene.");
  if (leftSynthetic || rightSynthetic) return leftUuid === rightUuid;
  return sameActorReference(left, right);
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
  if (!combat || !actor) return null;

  /*
   * Boss Template may represent one Actor with several Combatants. When that
   * Actor owns the active activation, always resolve to the active Combatant
   * instead of the first document in the collection. This keeps action gates
   * and End Turn tied to the correct Boss turn.
   */
  const activeCombatant = combat.combatant ?? null;
  const activeActor = activeCombatant
    ? getBossEncounterActorForCombatant(activeCombatant, combat)
    : null;
  if (activeCombatant && sameCombatActorReference(activeActor, actor) && !isRaidActionCombatant(activeCombatant)) {
    return activeCombatant;
  }

  const matches = (combat.combatants?.contents ?? []).filter((combatant) => {
    const sourceActor = getBossEncounterActorForCombatant(combatant, combat);
    return sameCombatActorReference(sourceActor, actor) && !isRaidActionCombatant(combatant);
  });
  if (!matches.length) return null;

  const activeUnitId = getCombatantUnitId(activeCombatant);
  if (activeUnitId) {
    const activeUnitMatch = matches.find((combatant) => {
      return getCombatantUnitId(combatant) === activeUnitId;
    });
    if (activeUnitMatch) return activeUnitMatch;
  }

  return matches.find((combatant) => !combatantEndedThisRound(combatant, combat))
    ?? matches[0]
    ?? null;
}

function getUnitCombatants(combat, unitId) {
  const combatants = combat?.turns ??
    combat?.combatants?.contents ??
    [];

  return combatants.filter((combatant) => {
    return getCombatantUnitId(combatant) === unitId;
  });
}

function isDDAUnitEndedForRound(combat, unitId, round) {
  const members = getUnitCombatants(combat, unitId).filter((member) => {
    return String(getInitiativeFlag(member, "role", "solo")) !== "suspended";
  });
  return Boolean(
    members.length &&
    members.every((member) => {
      return number(getInitiativeFlag(member, "endedRound", 0), 0) === number(round, 0);
    })
  );
}

function findAvailableDDAUnitStep(
  combat,
  unitOrder,
  currentUnitIndex,
  step = 1
) {
  const currentRound = getCurrentCombatRound(combat);

  for (let offset = 1; offset <= unitOrder.length; offset += 1) {
    const rawIndex = currentUnitIndex + (step * offset);
    const unitIndex = (
      rawIndex % unitOrder.length + unitOrder.length
    ) % unitOrder.length;

    const wrapped = step > 0
      ? rawIndex >= unitOrder.length
      : rawIndex < 0;

    const round = wrapped
      ? step > 0
        ? currentRound + 1
        : Math.max(1, currentRound - 1)
      : currentRound;

    if (!isDDAUnitEndedForRound(combat, unitOrder[unitIndex], round)) {
      return {
        unitIndex,
        unitId: unitOrder[unitIndex],
        round,
        wrapped
      };
    }
  }

  return null;
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
  const suspended = String(getInitiativeFlag(combatant, "role", "solo")) === "suspended";
  const ended = suspended || combatantEndedThisRound(combatant, combat);
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
    reason: suspended
      ? "participant-suspended"
      : ended
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

  return members
    .filter((member) => String(getInitiativeFlag(member, "role", "solo")) !== "suspended")
    .map((member) => member.actor)
    .filter(Boolean);
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

  try {
    const { applyDangerousTerrainStartOfTurn } = await import("../canvas/movement-tracker.js");
    await applyDangerousTerrainStartOfTurn(activeActor);
  } catch (error) {
    console.error("DDA | Could not process Dangerous Terrain at start of turn.", error);
  }

  const tick = `${combat?.id ?? "no-combat"}:${Number(combat?.round ?? 0)}:${Number(combat?.turn ?? -1)}`;
  const sourceKeys = actorReferenceKeys(activeActor);

  for (const target of effectBearingActors()) {
    if (!game.user?.isGM && !target.isOwner) continue;

    const effects = foundry.utils.deepClone(target.system?.effects?.active ?? []);
    if (!effects.length) continue;

    let changed = false;
    const expiredShieldEffects = [];
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
        const requestedHealing = Math.max(1, number(effect.potency ?? effect.value, 1));
        const bossTemplateState = target.type === "npc"
          ? getBossTemplateRuntimeState(target, combat)
          : null;
        let healing = bossTemplateState
          ? requestedHealing
          : Math.min(requestedHealing, Math.max(0, maximum - current));
        const doom = effects.find((candidate) => effectTagKey(candidate.tag) === "doom");
        if (doom) {
          const doomValue = Math.max(0, number(doom.value ?? doom.potency, 0));
          const absorbed = Math.min(doomValue, healing);
          healing -= absorbed;
          doom.value = doomValue - absorbed;
          if (doom.value <= 0) doom._ddaExpiredByDoom = true;
        }
        if (healing > 0) {
          const bossTemplateHealing = bossTemplateState
            ? await healActiveBossTemplatePool(target, healing, combat)
            : null;
          if (!bossTemplateHealing && current < maximum) {
            await target.update({ [`${woundsPath}.value`]: Math.min(maximum, current + healing) });
          }
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
      else if (tag === "shield") {
        expiredShieldEffects.push(effect);
      }
    }

    if (changed) {
      const updates = {
        "system.effects.active": remainingEffects.filter((effect) => !effect._ddaExpiredByDoom)
      };
      await target.update(updates);
      for (const shieldEffect of expiredShieldEffects) {
        await expireNonStackingTemporaryWounds(target, {
          sourceId: "shield",
          effectId: String(shieldEffect?.id ?? "")
        });
      }
      target.sheet?.render(false);
    }
  }
}

async function processDDAUnitStart(combat, anchorCombatant = combat?.combatant) {
  if (!anchorCombatant?.actor) return;

  if (isRaidActionCombatant(anchorCombatant)) {
    await processRaidActionTurn(combat, anchorCombatant);
    return;
  }

  const unitId = getCombatantUnitId(anchorCombatant);
  const members = unitId
    ? getUnitCombatants(combat, unitId)
    : [anchorCombatant];

  for (const member of members) {
    if (!member?.actor) continue;
    const memberActor = isBossTemplateActivationCombatant(member)
      ? getBossEncounterActorForCombatant(member, combat)
      : member.actor;
    if (!memberActor) continue;
    if (String(getInitiativeFlag(member, "role", "solo")) === "suspended") continue;

    if (
      getCurrentCombatRound(combat) > 1 &&
      memberActor.system?.combat?.surprised &&
      memberActor.system?.combat?.bestLaidPlansSurprise
    ) {
      await memberActor.update({
        "system.combat.actions.value": number(
          memberActor.system?.combat?.actions?.max,
          2
        ),
        "system.combat.surprised": false,
        "system.combat.-=bestLaidPlansSurprise": null
      });
    }

    const trueGuardianRefund =
      memberActor.system?.combat?.intercedeUsage?.trueGuardianRefund ?? null;
    if (trueGuardianRefund?.pending) {
      const sameCombat = String(trueGuardianRefund.combatId ?? "") === String(combat?.id ?? "");
      if (sameCombat) {
        await memberActor.update({
          "system.combat.actions.value": Math.max(
            0,
            number(memberActor.system?.combat?.actions?.value, 0) + 1
          ),
          "system.combat.intercedeUsage.-=trueGuardianRefund": null
        });
      } else {
        await memberActor.update({
          "system.combat.intercedeUsage.-=trueGuardianRefund": null
        });
      }
    }

    await expireStartOfTurnQualityEffects(memberActor);
    await processDigizoidGainForceStartOfTurn(memberActor);
    await processDDAStartOfTurnEffects(memberActor, combat);
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
  if (role === "suspended") return 2;
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

  const next = findAvailableDDAUnitStep(
    combat,
    unitOrder,
    currentUnitIndex,
    step
  );

  if (!next) return combat;

  const nextTurnIndex = getDDAUnitAnchorIndex(turns, next.unitId);
  if (nextTurnIndex < 0) return combat;

  const updateData = {
    turn: nextTurnIndex
  };

  if (next.round !== getCurrentCombatRound(combat)) {
    updateData.round = next.round;
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

  /*
   * Start-of-turn processing is owned exclusively by the primary-GM
   * updateCombat hook. Do not run it again here or REGEN/durations can race.
   */
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

    return true;
  }

  const next = findAvailableDDAUnitStep(
    combat,
    unitOrder,
    sourceUnitIndex,
    1
  );

  if (!next) return false;

  const nextTurnIndex = getDDAUnitAnchorIndex(
    turns,
    next.unitId
  );

  if (nextTurnIndex < 0) return false;

  const updateData = {
    turn: nextTurnIndex
  };

  if (next.round !== getCurrentCombatRound(combat)) {
    updateData.round = next.round;
  }

  await combat.update(updateData);

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

      /* updateCombat is the single authoritative Start Turn clock. */
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
    .filter((member) => String(getInitiativeFlag(member, "role", "solo")) !== "suspended")
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

function getDdaCombatMeta(actor) {
  if (!actor) return "";

  const currentActions = Math.max(0, number(actor.system?.combat?.actions?.value, 0));
  const maximumActions = Math.max(
    currentActions,
    number(actor.system?.combat?.actions?.max, currentActions)
  );
  const parts = [`${currentActions}/${maximumActions}A`];

  if (["digimon", "npc"].includes(actor.type)) {
    const stance = String(actor.system?.combat?.currentStance ?? "neutral").toLowerCase();
    const stanceLabels = {
      neutral: label("Neutral", "Neutral"),
      offensive: label("Ofensiva", "Offensive"),
      defensive: label("Defensiva", "Defensive"),
      brave: label("Brava", "Brave"),
      fierce: label("Feroz", "Fierce"),
      sentry: label("Sentinela", "Sentry"),
      martial: label("Marcial", "Martial"),
      anticipate: label("Antecipação", "Anticipate")
    };
    parts.push(stanceLabels[stance] ?? stance);
  }

  const clash = actor.system?.combat?.clash ?? actor.system?.clash?.state ?? {};
  if (clash?.active) {
    const controller = String(clash.controllerUuid ?? "") === String(actor.uuid ?? "");
    if (!controller && clash.pinned) parts.push(label("Clash: Preso", "Clash: Pinned"));
    else parts.push(controller
      ? label("Clash: Controle", "Clash: Controller")
      : label("Clash: Oponente", "Clash: Opponent"));
  }

  return parts.filter(Boolean).join(" · ");
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
        <span class="dda-pair-member-meta">
          ${html(getDdaCombatMeta(combatant?.actor))}
        </span>
      </span>
    </button>
  `;
}

function buildDdaUnitCard(unitId, digimon, tamers, combat) {
  const tamerList = Array.isArray(tamers) ? tamers.filter(Boolean) : [];
  const raw = getDdaRawInitiative(digimon) ?? getDdaRawInitiative(tamerList[0]);
  const isJogress = unitId.startsWith("jogress:") && tamerList.length > 1;
  const card = document.createElement("div");
  const isActive = getCombatantUnitId(combat?.combatant) === unitId;

  card.className = `dda-combat-pair-card${isActive ? " is-active" : ""}${isJogress ? " dda-jogress-unit-card" : ""}`;
  card.dataset.ddaUnitId = unitId;

  card.innerHTML = `
    <div class="dda-pair-shared-turn">
      <i class="fas fa-link" aria-hidden="true"></i>
      ${html(isJogress
        ? label("Jogress — 2 Digi-Escolhidos / 1 Digimon", "Jogress — 2 Tamers / 1 Digimon")
        : label("Mesmo turno — ações separadas", "Same turn — separate Actions"))}
    </div>

    <div class="dda-pair-initiative" title="${html(label("Iniciativa", "Initiative"))}">
      ${formatDdaInitiative(raw)}
    </div>

    ${buildDdaPairMemberMarkup(digimon, "digimon", combat)}
    ${tamerList.map((tamer) => buildDdaPairMemberMarkup(tamer, "tamer", combat)).join("")}
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

  const turns = combat?.turns ?? combat?.combatants?.contents ?? [];
  const processedUnits = new Set();

  for (const combatant of turns) {
    const unitId = getCombatantUnitId(combatant);
    const supportedUnit = unitId.startsWith("pair:") || unitId.startsWith("jogress:");
    if (!supportedUnit || processedUnits.has(unitId)) continue;
    processedUnits.add(unitId);

    const members = getUnitCombatants(combat, unitId);
    const digimon = members.find((member) => getInitiativeFlag(member, "role") === "digimon");
    const tamers = members.filter((member) => getInitiativeFlag(member, "role") === "tamer");
    const suspended = members.filter((member) => getInitiativeFlag(member, "role") === "suspended");
    if (!digimon || !tamers.length) continue;

    const digimonRow = rowByCombatantId.get(digimon.id);
    if (!digimonRow) continue;

    digimonRow.hidden = false;
    digimonRow.removeAttribute("aria-hidden");
    digimonRow.classList.add("dda-pair-anchor", "dda-pair-combatant");
    digimonRow.classList.remove("dda-solo-combatant");
    digimonRow.dataset.ddaPairUnit = unitId;

    for (const member of [...tamers, ...suspended]) {
      const row = rowByCombatantId.get(member.id);
      if (!row) continue;
      row.classList.add("dda-pair-secondary", "dda-pair-combatant");
      row.hidden = true;
      row.setAttribute("aria-hidden", "true");
      row.dataset.ddaPairUnit = unitId;
    }

    digimonRow.replaceChildren(buildDdaUnitCard(unitId, digimon, tamers, combat));
  }
}

function applyDdaSoloAffiliationInlineTheme(row, side) {
  if (!row) return;

  const enemy = side === "enemies";
  const ally = side === "players";
  if (!enemy && !ally) return;

  const theme = enemy
    ? {
        accent: "rgba(211, 91, 96, 0.86)",
        accentStrong: "rgba(231, 112, 112, 0.98)",
        rowA: "rgba(55, 23, 31, 0.985)",
        rowB: "rgba(32, 27, 39, 0.985)",
        initiativeA: "rgba(132, 48, 55, 0.99)",
        initiativeB: "rgba(73, 27, 34, 0.99)"
      }
    : {
        accent: "rgba(78, 184, 127, 0.86)",
        accentStrong: "rgba(105, 211, 154, 0.98)",
        rowA: "rgba(17, 47, 36, 0.985)",
        rowB: "rgba(23, 39, 42, 0.985)",
        initiativeA: "rgba(35, 111, 76, 0.99)",
        initiativeB: "rgba(21, 67, 49, 0.99)"
      };

  // Inline !important is intentional here. Foundry's tracker and some tracker
  // modules use their own !important backgrounds on active combatants; this
  // keeps allegiance visible regardless of stylesheet order.
  row.style.setProperty("border-color", theme.accent, "important");
  row.style.setProperty(
    "background",
    `linear-gradient(135deg, ${theme.rowA}, ${theme.rowB})`,
    "important"
  );
  row.style.setProperty(
    "box-shadow",
    `inset 3px 0 0 ${theme.accentStrong}, 0 2px 8px rgba(0,0,0,.34)`,
    "important"
  );

  const initiative = row.querySelector(".token-initiative");
  initiative?.style?.setProperty(
    "background",
    `linear-gradient(180deg, ${theme.initiativeA}, ${theme.initiativeB})`,
    "important"
  );
  initiative?.style?.setProperty("border-right-color", theme.accent, "important");

  const image = row.querySelector(".token-image");
  image?.style?.setProperty("border-color", theme.accent, "important");
}

function reorderDdaTrackerRows(combat, root) {
  const storedOrder = combat?.getFlag?.(SYSTEM_ID, `${FLAG}.order`);
  if (!Array.isArray(storedOrder) || !storedOrder.length) return false;

  const rows = Array.from(root.querySelectorAll("[data-combatant-id]"));
  if (!rows.length) return false;

  const parent = rows[0]?.parentElement;
  if (!parent || !rows.every((row) => row.parentElement === parent)) return false;

  const rowById = new Map(rows.map((row) => [String(row.dataset.combatantId ?? ""), row]));
  const appended = new Set();

  for (const entry of storedOrder) {
    const unitId = String(entry?.id ?? "").trim();
    if (!unitId) continue;

    const members = getUnitCombatants(combat, unitId);
    if (!members.length && unitId.startsWith("raid:")) {
      const combatantId = unitId.slice(5);
      const row = rowById.get(combatantId);
      if (row) {
        parent.append(row);
        appended.add(row);
      }
      continue;
    }

    // Anchor first, then hidden Tamer/suspended rows. This keeps native DOM
    // grouping coherent while the visible list follows the DDA unit order.
    const orderedMembers = [...members].sort((left, right) => {
      return getDDACombatantRoleRank(left) - getDDACombatantRoleRank(right);
    });

    for (const member of orderedMembers) {
      const row = rowById.get(String(member.id));
      if (!row) continue;
      parent.append(row);
      appended.add(row);
    }
  }

  // Preserve any technical or module-added rows which are not part of DDA's
  // stored order rather than deleting them.
  for (const row of rows) {
    if (!appended.has(row)) parent.append(row);
  }

  return true;
}

function decorateDdaSoloRows(combat, root) {
  for (const row of root.querySelectorAll("[data-combatant-id]")) {
    const combatant =
      combat?.combatants?.get(row.dataset.combatantId) ??
      game.combat?.combatants?.get(row.dataset.combatantId);

    if (!combatant) continue;
    if (row.classList.contains("dda-pair-combatant") || isRaidActionCombatant(combatant)) continue;

    const unitId = getCombatantUnitId(combatant);
    const role = String(getInitiativeFlag(combatant, "role", "solo"));
    const pairedUnit = unitId.startsWith("pair:") || unitId.startsWith("jogress:");
    if (pairedUnit || ["digimon", "tamer", "suspended"].includes(role) && unitId && !unitId.startsWith("solo:")) {
      continue;
    }

    const actor = combatant.actor;
    const isSoloDigimon = ["digimon", "npc"].includes(actor?.type);
    const raw = getDdaRawInitiative(combatant);

    // Keep the standard DDA solo layout once an Initiative exists. Affiliation
    // itself is decorated even before Initiative is rolled so the tracker never
    // loses its friend/enemy cue during rerenders.
    if (raw !== null || isSoloDigimon) row.classList.add("dda-solo-combatant");

    const unitSide = normalizeInitiativeSide(
      getInitiativeFlag(combatant, "side", ""),
      sideOf(combatant)
    );
    const isEnemyDigimon = isSoloDigimon && unitSide === "enemies";
    const isAlliedDigimon = isSoloDigimon && unitSide === "players";

    row.classList.toggle("dda-solo-digimon", isSoloDigimon);
    row.classList.toggle("dda-solo-digimon-enemy", isEnemyDigimon);
    row.classList.toggle("dda-solo-digimon-ally", isAlliedDigimon);

    if (isSoloDigimon) {
      row.dataset.ddaAffiliation = isEnemyDigimon
        ? "enemy"
        : isAlliedDigimon
          ? "ally"
          : "neutral";

      applyDdaSoloAffiliationInlineTheme(row, unitSide);

      // Affiliation is already conveyed by the native row text plus the
      // red/green faction palette. The former badge was redundant, increased
      // solo-row height, and could expose stale language text after a locale
      // change. Remove both old and current hotfix badges on every render.
      row.querySelectorAll(".dda-solo-affiliation-badge, .dda-solo-affiliation-badge-v8, .dda-solo-affiliation-badge-v9, .dda-solo-affiliation-badge-v10")
        .forEach((badge) => badge.remove());
    }
    else {
      delete row.dataset.ddaAffiliation;
      row.querySelectorAll(".dda-solo-affiliation-badge, .dda-solo-affiliation-badge-v8, .dda-solo-affiliation-badge-v9, .dda-solo-affiliation-badge-v10").forEach((badge) => badge.remove());
    }

    const tokenNameForMeta = row.querySelector(".token-name") ?? row.querySelector(".combatant-name");
    if (tokenNameForMeta) {
      let meta = tokenNameForMeta.querySelector(".dda-solo-combat-meta");
      if (!meta) {
        meta = document.createElement("span");
        meta.className = "dda-solo-combat-meta";
        tokenNameForMeta.append(meta);
      }
      meta.textContent = getDdaCombatMeta(actor);
    }

    if (raw === null) continue;

    const initiativeValue = row.querySelector(".token-initiative > span");
    if (initiativeValue) {
      initiativeValue.textContent = formatDdaInitiative(raw);
      initiativeValue.parentElement.title = label("Rolar Iniciativa", "Roll Initiative");
      continue;
    }

    let initiativeBadge = row.querySelector(".dda-solo-initiative");
    if (!initiativeBadge) {
      initiativeBadge = document.createElement("span");
      initiativeBadge.className = "dda-solo-initiative";

      const target =
        row.querySelector(".token-name") ??
        row.querySelector(".combatant-name") ??
        row.querySelector("h4") ??
        row;

      target.append(initiativeBadge);
    }

    initiativeBadge.textContent = formatDdaInitiative(raw);
  }
}

function decorateDdaRaidRows(combat, root) {
  for (const row of root.querySelectorAll("[data-combatant-id]")) {
    const combatant = combat?.combatants?.get(row.dataset.combatantId) ?? game.combat?.combatants?.get(row.dataset.combatantId);
    if (!combatant || !isRaidActionCombatant(combatant)) continue;

    row.classList.add("dda-raid-action-combatant");

    const bossActor = getBossEncounterActorForCombatant(combatant, combat) ?? combatant.actor;
    const raidState = getRaidBossRuntimeState(bossActor, combat);
    const pending = Array.isArray(raidState?.pendingActions)
      ? raidState.pendingActions.filter(Boolean)
      : raidState?.pendingAction ? [raidState.pendingAction] : [];
    const tokenName = row.querySelector(".token-name");
    if (tokenName) {
      let clock = tokenName.querySelector(".dda-raid-action-clock");
      if (!clock) {
        clock = document.createElement("span");
        clock.className = "dda-raid-action-clock";
        tokenName.append(clock);
      }
      clock.textContent = pending.length
        ? pending.map((action) => {
            const resolves = Math.max(1, number(action?.resolvesRound, number(combat?.round, 1) + 1));
            return `${String(action?.name ?? label("Raid Action", "Raid Action"))} · ${label("resolve R", "resolves R")}${resolves}`;
          }).join(" / ")
        : label("Preparar nova Raid Action", "Prepare next Raid Action");
    }

    const initiativeValue = row.querySelector(".token-initiative > span");
    if (initiativeValue) {
      initiativeValue.textContent = "RAID";
      initiativeValue.parentElement.title = label(
        "A Raid Action sempre age no início da rodada",
        "The Raid Action always acts at the start of the round"
      );
    } else {
      let badge = row.querySelector(".dda-raid-action-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "dda-raid-action-badge";
        (row.querySelector(".token-name") ?? row.querySelector(".combatant-name") ?? row).append(badge);
      }
      badge.textContent = "RAID";
    }
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
    ${label("Rolar Iniciativa", "Roll Initiative")}
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
  ensureDdaCombatTrackerAffiliationStyles();
  Hooks.on("combatStart", (combat) => {
    void resetCombatStancesToNeutral(combat).catch((error) => {
      console.error("DDA | Could not reset Stances to Neutral at combat start.", error);
    });
  });

  Hooks.on("updateCombat", async (combat, changed, options = {}) => {
    refreshDDAUnitVisuals(combat);
    if (options?.ddaJogressSync) return;
    if (!isPrimaryActiveGM() || !combat?.started) return;
    if (!("turn" in changed || "round" in changed)) return;

    if ("round" in changed) {
      try {
        const evolution = await import("./evolution.js");
        const jogressChanged = await evolution.applyPendingJogressInitiativeForCombat?.(combat);
        if (jogressChanged) refreshDDAUnitVisuals(combat);
      } catch (error) {
        console.error("DDA | Could not apply pending Jogress initiative.", error);
      }
    }

    await processDDAUnitStart(combat, combat.combatant).catch((error) => {
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
  const resetTamerBreakAvailability = async (combat) => {
    if (!game.user?.isGM) return;

    const tamers = new Map();
    for (const combatant of combat?.combatants ?? []) {
      const actor = combatant?.actor;
      if (!actor || actor.type !== "character") continue;
      tamers.set(actor.uuid ?? actor.id, actor);
    }

    for (const actor of tamers.values()) {
      if (!actor.system?.recovery?.breakUsedSinceCombat) continue;
      await actor.update({ "system.recovery.breakUsedSinceCombat": false });
    }
  };

  const resetPreInitiativeEvolutionDebt = async (combat) => {
    if (!game.user?.isGM) return;

    const combatId = String(combat?.id ?? "");
    const tamers = new Map();

    for (const combatant of combat?.combatants ?? []) {
      const actor = combatant?.actor;
      if (!actor || actor.type !== "character") continue;
      tamers.set(actor.uuid ?? actor.id, actor);
    }

    for (const actor of tamers.values()) {
      const state = actor.system?.combat?.preInitiativeEvolution ?? {};
      if (!state.pending && !state.combatId && !state.actionDebt) continue;
      if (state.combatId && combatId && String(state.combatId) !== combatId) continue;

      await actor.update({
        "system.combat.preInitiativeEvolution.combatId": "",
        "system.combat.preInitiativeEvolution.actionDebt": 0,
        "system.combat.preInitiativeEvolution.pending": false
      });
    }
  };

  const clearIntercedeTurnCredits = async (combat) => {
    if (!game.user?.isGM) return;
    const combatId = String(combat?.id ?? "");
    const actors = new Map();
    for (const combatant of combat?.combatants ?? []) {
      const actor = combatant?.actor;
      if (!actor) continue;
      actors.set(actor.uuid ?? actor.id, actor);
    }
    for (const actor of actors.values()) {
      const refund = actor.system?.combat?.intercedeUsage?.trueGuardianRefund ?? null;
      if (!refund?.pending) continue;
      if (refund.combatId && combatId && String(refund.combatId) !== combatId) continue;
      await actor.update({
        "system.combat.intercedeUsage.-=trueGuardianRefund": null
      });
    }
  };

  const handleCombatFinished = async (combat) => {
    if (!isPrimaryActiveGM()) return;
    await clearCombatBoundEffects(combat);
    for (const actor of effectBearingActors()) {
      await expireCombatBoundNonStackingTemporaryWounds(actor, String(combat?.id ?? ""));
    }
    await resetTamerBreakAvailability(combat);
    await resetPreInitiativeEvolutionDebt(combat);
    await clearIntercedeTurnCredits(combat);
  };

  Hooks.on("combatEnd", (combat) => void handleCombatFinished(combat));
  Hooks.on("deleteCombat", (combat) => void handleCombatFinished(combat));

  Hooks.on("renderCombatTracker", (app, htmlData) => {
    ensureDdaCombatTrackerAffiliationStyles();
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
    decorateDdaRaidRows(combat, root);
    reorderDdaTrackerRows(combat, root);
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
