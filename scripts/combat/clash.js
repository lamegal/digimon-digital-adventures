import { getDDASetting } from "../settings.js";
import { rollAttack } from "../rolls/attack-roll.js";
import {
  findQuality,
  getActorDerivedStat,
  getActorStageValue,
  getRoundUseState,
  hasQuality,
  rollDerivedCheck,
  setUseState
} from "../rules/quality-automation.js";
import {
  getReachModeData,
  getTokenDistanceSpaces
} from "./offensive-qualities.js";
import {
  getTokenDocumentGridDistance
} from "./positioning.js";
import { getActiveDDAUnitContext } from "./initiative.js";
import { spendActorActions } from "./action-economy.js";
import {
  actorsShareGiantHijackerState,
  hasExposingHold as hasExposingHoldQuality,
  hasMonsterStrength as hasMonsterStrengthQuality,
  hasPointBlank as hasPointBlankQuality,
  hasPowerThrow,
  hasSlippery as hasSlipperyQuality,
  hasTitanPower as hasTitanPowerQuality
} from "./clash-qualities.js";
import { requestSubstitute } from "./defensive-qualities.js";
import { isFlexibleDigizoidWeaponEscapeAutomatic } from "./digizoid-gain-force.js";
import {
  applyHackersMemoryDerivedStatModifier
} from "../rules/tamer-talent-transversal.js";

const DDA_SYSTEM_ID = "digimon-digital-adventures";
const DDA_CLASH_SOCKET_ACTION_UPDATE_ACTOR = "clashUpdateActor";
const DDA_CLASH_SOCKET_ACTION_UPDATE_CLASH_STATE = "clashUpdateState";
const DDA_CLASH_SOCKET_ACTION_UPDATE_TOKEN = "clashUpdateToken";

function localize(key) {
  return game?.i18n?.localize(key) ?? key;
}

function formatI18n(key, data = {}) {
  return game?.i18n?.format(key, data) ?? key;
}

function text(pt, en) {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? en : pt;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPrimaryActiveGM() {
  return Array.from(game?.users ?? [])
    .filter((user) => user?.isGM && user?.active)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

function isPrimaryActiveGM() {
  return Boolean(game?.user?.isGM && getPrimaryActiveGM()?.id === game.user.id);
}

function canUpdateActor(actor) {
  if (!actor) return false;
  if (game?.user?.isGM) return true;
  return Boolean(actor.canUserModify?.(game.user, "update"));
}

async function requestGMClashUpdate(payload = {}) {
  const primaryGM = getPrimaryActiveGM();

  if (!primaryGM) {
    ui.notifications.warn(localize("DDA.Warning.ClashRequiresActiveGM"));
    return false;
  }

  game.socket.emit(`system.${DDA_SYSTEM_ID}`, {
    ...payload,
    systemId: DDA_SYSTEM_ID,
    requestUserId: game.user?.id ?? ""
  });

  return true;
}

async function updateActorData(actor, update = {}, options = {}) {
  if (!actor) return false;

  if (canUpdateActor(actor)) {
    await actor.update(update, options);
    return true;
  }

  return requestGMClashUpdate({
    action: DDA_CLASH_SOCKET_ACTION_UPDATE_ACTOR,
    actorUuid: actor.uuid,
    update,
    options
  });
}

Hooks.once("ready", () => {
  game.socket?.on(`system.${DDA_SYSTEM_ID}`, async (payload = {}, respond) => {
    if (payload?.systemId !== DDA_SYSTEM_ID) return;
    if (![
      DDA_CLASH_SOCKET_ACTION_UPDATE_ACTOR,
      DDA_CLASH_SOCKET_ACTION_UPDATE_CLASH_STATE,
      DDA_CLASH_SOCKET_ACTION_UPDATE_TOKEN
    ].includes(payload?.action)) return;
    if (!isPrimaryActiveGM()) return;

    try {
      if (payload.action === DDA_CLASH_SOCKET_ACTION_UPDATE_TOKEN) {
        const scene = game.scenes?.get(payload.sceneId) ?? canvas?.scene;
        const tokenDocument = scene?.tokens?.get(payload.tokenId);
        if (!tokenDocument) throw new Error(`Token not found: ${payload.sceneId}.${payload.tokenId}`);
        await tokenDocument.update(payload.update ?? {}, payload.options ?? {});
      } else {
        const actor = await resolveActor(payload.actorUuid);
        if (!actor) throw new Error(`Actor not found: ${payload.actorUuid}`);

        if (payload.action === DDA_CLASH_SOCKET_ACTION_UPDATE_ACTOR) {
          await actor.update(payload.update ?? {}, payload.options ?? {});
        }

        if (payload.action === DDA_CLASH_SOCKET_ACTION_UPDATE_CLASH_STATE) {
          await updateActorClashState(actor, payload.state ?? {}, { forceLocal: true, removeClashId: payload.removeClashId ?? "", replaceAll: Boolean(payload.replaceAll) });
        }
      }

      if (typeof respond === "function") respond({ ok: true });
    } catch (error) {
      console.error("DDA | Clash socket handler failed.", error, payload);
      if (typeof respond === "function") respond({ ok: false, error: String(error?.message ?? error) });
    }
  });
});

async function resolveActor(uuid) {
  if (!uuid) return null;

  try {
    const document = await fromUuid(uuid);
    return document?.documentName === "Actor" ? document : null;
  } catch (error) {
    console.warn("DDA | Could not resolve Actor UUID:", uuid, error);
    return null;
  }
}

function getDDASettingSafe(key, fallback) {
  try {
    return getDDASetting(key);
  } catch (_error) {
    return fallback;
  }
}

const SIZE_ORDER = ["small", "medium", "large", "huge", "gigantic", "colossal"];

function getSizeIndex(sizeKey = "medium") {
  const index = SIZE_ORDER.indexOf(String(sizeKey ?? "medium"));
  return index >= 0 ? index : SIZE_ORDER.indexOf("medium");
}

function getStatTotal(pathLike) {
  if (typeof pathLike === "number") return pathLike;
  return Number(pathLike?.value ?? pathLike?.total ?? pathLike?.base ?? 0);
}

function getClashTotal(actor) {
  return Number(actor?.system?.miscStats?.clash?.value ?? actor?.system?.miscStats?.clash?.total ?? 0);
}

function getCpuTotal(actor) {
  return Number(actor?.system?.derivedStats?.cpu?.value ?? actor?.system?.derivedStats?.cpu?.total ?? 0);
}

function getRamTotal(actor) {
  return Number(actor?.system?.derivedStats?.ram?.value ?? actor?.system?.derivedStats?.ram?.total ?? 0);
}

function getBitTotal(actor) {
  return Number(actor?.system?.derivedStats?.bit?.value ?? actor?.system?.derivedStats?.bit?.total ?? 0);
}

function getSkillBonus(actor, skillKey) {
  return Math.max(0, Number(actor?.system?.skillBonuses?.[skillKey]?.value ?? 0));
}

function getDataSpecializationFeatures(actor) {
  return actor?.system?.qualityFeatures?.dataSpecialization ?? {};
}

function getBrawlerClashBonus(actor) {
  return Math.max(0, Number(
    actor?.system?.qualityFeatures?.dataOptimization?.brawlerClashCheckBonus ?? 0
  ));
}

function getBestCpuOrRam(actor) {
  return Math.max(getCpuTotal(actor), getRamTotal(actor));
}

function isDigimonLike(actor) {
  return actor && ["digimon", "npc"].includes(actor.type);
}

function getSelectedTargetActor() {
  const targets = Array.from(game?.user?.targets ?? []);
  if (targets.length !== 1) return { error: targets.length ? "DDA.Warning.SelectExactlyOneDigimonTargetForClash" : "DDA.Warning.SelectDigimonTargetForClash" };

  const targetToken = targets[0];
  const targetActor = targetToken?.actor;

  if (!isDigimonLike(targetActor)) return { error: "DDA.Warning.SelectDigimonTargetForClash" };

  return { targetToken, targetActor };
}

function actorHasQuality(actor, names = []) {
  const normalizedNames = names.map(normalizeText);
  return Array.from(actor?.items ?? []).some((item) => {
    if (item?.type !== "quality") return false;
    const haystack = normalizeText([
      item.name,
      item.system?.label,
      item.system?.originalLabel,
      item.system?.description,
      item.system?.effect
    ].filter(Boolean).join(" "));
    return normalizedNames.some((name) => haystack.includes(name));
  });
}

function normalizeText(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function hasMonsterStrength(actor) {
  return hasMonsterStrengthQuality(actor);
}

function hasTitanPower(actor) {
  return hasTitanPowerQuality(actor);
}

function hasWrestlemania(actor) {
  return Boolean(getDataSpecializationFeatures(actor).wrestlemania) ||
    actorHasQuality(actor, ["Wrestlemania", "Data Specialization Wrestlemania", "Especialização de Dados Wrestlemania", "Especializacao de Dados Wrestlemania"]);
}

function hasWrangler(actor) {
  return Boolean(getDataSpecializationFeatures(actor).wrangler);
}

function hasTeleport(actor) {
  const movementTypes = actor?.system?.movementTypes ?? {};
  const teleport = movementTypes.teleport ?? {};
  if (teleport.enabled) return true;
  return actorHasQuality(actor, ["Teleport", "Teleporte"]);
}

function hasPointBlank(actor) {
  return hasPointBlankQuality(actor);
}

function hasSlippery(actor) {
  return hasSlipperyQuality(actor);
}

function hasExposingHold(actor) {
  return hasExposingHoldQuality(actor);
}

function hasMultigrappler(actor) {
  return hasQuality(actor, ["Multigrappler"]);
}

function getMultigrapplerCapacity(actor) {
  if (!hasMultigrappler(actor)) return 1;
  return Math.max(1, getActorStageValue(actor));
}

function getMultigrapplerReachData(actor) {
  if (!hasMultigrappler(actor)) return { active: false, rank: 0, maximumDistance: 1 };
  const reach = findQuality(actor, "reach");
  if (!reach) return { active: false, rank: 0, maximumDistance: 1 };
  const rank = Math.max(1, Number(reach.system?.rank?.value ?? 1));
  return {
    active: true,
    rank,
    maximumDistance: 1 + rank
  };
}

function getSizeDifference(a, b) {
  return getSizeIndex(a?.system?.size) - getSizeIndex(b?.system?.size);
}

function getWrestlemaniaCheckOptions(actor, opponent, { bonus = 0 } = {}) {
  const sizeBonus = getSizeIndex(actor.system?.size) > getSizeIndex(opponent.system?.size) ? 1 : 0;
  const brawlerBonus = getBrawlerClashBonus(actor);
  const externalBonus = Number(bonus ?? 0);
  const sharedBonus = sizeBonus + brawlerBonus + externalBonus;

  return [
    {
      key: "clash",
      label: localize("DDA.Clash.Stat"),
      detail: "Clash",
      base: getClashTotal(actor),
      modifier: getClashTotal(actor) + sharedBonus
    },
    {
      key: "cpuFeatsOfStrength",
      label: `${localize("DDA.DerivedStat.CPU")} (${localize("DDA.Skill.FeatsOfStrength")})`,
      detail: "CPU + Prodigious Skill: Feats of Strength",
      base: getCpuTotal(actor) + getSkillBonus(actor, "featsOfStrength"),
      modifier: getCpuTotal(actor) + getSkillBonus(actor, "featsOfStrength") + sharedBonus
    },
    {
      key: "bitPerformance",
      label: `${localize("DDA.DerivedStat.BIT")} (${localize("DDA.Skill.Performance")})`,
      detail: "BIT + Prodigious Skill: Performance",
      base: getBitTotal(actor) + getSkillBonus(actor, "performance"),
      modifier: getBitTotal(actor) + getSkillBonus(actor, "performance") + sharedBonus
    }
  ].map((option) => ({
    ...option,
    sizeBonus,
    brawlerBonus,
    externalBonus
  }));
}

async function chooseClashCheckOption(actor, opponent, { bonus = 0, purpose = "contest" } = {}) {
  const options = getWrestlemaniaCheckOptions(actor, opponent, { bonus });
  if (!hasWrestlemania(actor)) return options[0];

  const english = String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en");
  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-core-quality-dialog", "dda-wrestlemania-dialog"],
    position: { width: 560, height: "auto" },
    window: {
      title: purpose === "damage"
        ? (english ? "Wrestlemania — Extra Damage" : "Wrestlemania — Dano Extra")
        : (english ? "Wrestlemania — Clash Check" : "Wrestlemania — Teste de Clash")
    },
    modal: true,
    content: `
      <form class="dda-core-choice-dialog">
        <header class="dda-core-choice-dialog__hero">
          <span>Data Specialization · Wrestlemania</span>
          <h2>${escapeHtml(actor.name)}</h2>
          <p>${english
            ? "Choose which Check will represent this Clash. Size and Brawler bonuses are already included."
            : "Escolha qual Teste representará este Clash. Os bônus de Tamanho e Brigão já estão incluídos."}</p>
        </header>
        <div class="dda-core-specialization-grid">
          ${options.map((option, index) => `
            <label class="dda-core-specialization-card">
              <input type="radio" name="checkKey" value="${escapeHtml(option.key)}" ${index === 0 ? "checked" : ""}>
              <span class="dda-core-specialization-card__body">
                <span class="dda-core-specialization-card__heading">
                  <strong>${escapeHtml(option.label)}</strong>
                  <span class="dda-core-specialization-card__badges">
                    <span class="dda-core-specialization-card__role">+${option.modifier}</span>
                  </span>
                </span>
                <span class="dda-core-specialization-card__effect">${escapeHtml(option.detail)}</span>
              </span>
            </label>
          `).join("")}
        </div>
      </form>
    `,
    buttons: [
      {
        action: "confirm",
        label: localize("DDA.Button.Confirm"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (_event, button) => String(button.form?.elements?.checkKey?.value ?? "clash")
      },
      {
        action: "cancel",
        label: localize("DDA.Button.Cancel"),
        icon: "fa-solid fa-xmark",
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });

  if (!result) return null;
  return options.find((option) => option.key === result) ?? options[0];
}

async function rollClashCheck(actor, opponent, { bonus = 0, purpose = "contest" } = {}) {
  const option = await chooseClashCheckOption(actor, opponent, { bonus, purpose });
  if (!option) return null;

  const modifier =
    applyHackersMemoryDerivedStatModifier(
      actor,
      opponent,
      option.modifier
    );

  const roll = await new Roll(
    "3d6 + @modifier",
    { modifier }
  ).evaluate();

  return {
    actor,
    roll,
    total: Number(roll.total ?? 0),
    clash: getClashTotal(actor),
    checkKey: option.key,
    checkLabel: option.label,
    checkBase: option.base,
    sizeBonus: option.sizeBonus,
    brawlerBonus: option.brawlerBonus,
    bonus: option.externalBonus,
    modifier
  };
}

async function rollSlipperyCheck(actor, opponent, { bonus = 0, prompt = true } = {}) {
  if (!hasSlippery(actor)) return null;

  if (prompt) {
    const useIt = await foundry.applications.api.DialogV2.confirm({
      classes: ["dda", "dda-clash-dialog", "dda-clash-quality-window"],
      window: { title: localize("DDA.Clash.Slippery.Title") },
      content: `<div class="dda-confirm-dialog"><p>${formatI18n("DDA.Clash.Slippery.Prompt", {
        actor: escapeHtml(actor.name),
        opponent: escapeHtml(opponent.name)
      })}</p></div>`,
      yes: { label: localize("DDA.Yes") },
      no: { label: localize("DDA.No") },
      defaultYes: true
    });
    if (!useIt) return null;
  }

  const brawlerBonus = getBrawlerClashBonus(actor);
  const modifier = applyHackersMemoryDerivedStatModifier(
    actor,
    opponent,
    getRamTotal(actor) * 2 +
      brawlerBonus +
      Number(bonus ?? 0)
  );
  const roll = await new Roll("3d6 + @modifier", { modifier }).evaluate();
  return {
    actor,
    roll,
    total: Number(roll.total ?? 0),
    clash: getClashTotal(actor),
    checkKey: "slippery",
    checkLabel: localize("DDA.Clash.Slippery.RamX2"),
    checkBase: getRamTotal(actor) * 2,
    sizeBonus: 0,
    brawlerBonus,
    bonus: Number(bonus ?? 0),
    modifier,
    slippery: true
  };
}

async function rollWrestlemaniaDamageCheck(actor, opponent) {
  if (!hasWrestlemania(actor)) return null;
  const option = await chooseClashCheckOption(actor, opponent, { purpose: "damage" });
  if (!option) return null;

  const tn = 12 + getBestCpuOrRam(opponent);
  const result = await rollFixedCheck(
    actor,
    option.modifier,
    tn,
    `${localize("DDA.Quality.DataSpecialization.Wrestlemania")} — ${option.label}`,
    "dda-wrestlemania-check-card",
    { targetActor: opponent }
  );

  const damageBonus = result.criticalSuccess
    ? 5
    : result.success
      ? 3
      : result.criticalFailure
        ? 0
        : 1;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-wrestlemania-damage-card">
        <h2>Wrestlemania</h2>
        <p><strong>${escapeHtml(actor.name)}</strong> ${localize("DDA.Clash.WrestlemaniaDamageResult")}</p>
        <ul class="dda-effect-list">
          <li>${localize("DDA.Roll.TN")}: <strong>${tn}</strong>.</li>
          <li>${localize("DDA.MainStat.Damage")}: <strong>+${damageBonus}</strong>.</li>
        </ul>
      </div>
    `
  });

  return { ...result, option, damageBonus };
}

function canUseWranglerFreeClash(actor) {
  if (!hasWrangler(actor)) return false;
  const state = getRoundUseState(actor, "dataSpecialization", "wranglerClash");
  if (!state) return true;
  return Number(state.turn ?? -1) !== Number(game?.combat?.turn ?? -2);
}

async function markWranglerFreeClashUsed(actor) {
  await setUseState(actor, "dataSpecialization", "wranglerClash", {
    source: "wrangler",
    turn: Number(game?.combat?.turn ?? -1)
  });
}

async function rollFixedCheck(
  actor,
  statValue,
  tn,
  title,
  cardClass = "dda-clash-card",
  { targetActor = null } = {}
) {
  const modifier =
    applyHackersMemoryDerivedStatModifier(
      actor,
      targetActor,
      Number(statValue ?? 0)
    );
  const roll = await new Roll("3d6 + @modifier", { modifier }).evaluate();
  const total = Number(roll.total ?? 0);
  const success = total >= tn;
  const criticalSuccess = total >= tn + 5;
  const criticalFailure = total <= tn - 5;
  const outcome = criticalSuccess ? "criticalSuccess" : success ? "success" : criticalFailure ? "criticalFailure" : "failure";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content: `
      <div class="dda-chat-roll-message dda-clash-check-message">
        <div class="dda-chat-card dda-effect-card ${cardClass} dda-clash-check-card ${outcome}">
          <h2>${escapeHtml(title)}</h2>
          <ul class="dda-effect-list">
            <li>${localize("DDA.Roll.TN")}: <strong>${tn}</strong>.</li>
            <li>${localize("DDA.Roll.Result")}: <strong>${localize(`DDA.Check.${outcome[0].toUpperCase()}${outcome.slice(1)}`)}</strong>.</li>
          </ul>
        </div>
        ${await roll.render()}
      </div>
    `
  });

  return { roll, total, tn, success, criticalSuccess, criticalFailure, outcome };
}

function resolveController(a, b, aRoll, bRoll) {
  if (aRoll.total > bRoll.total) return a;
  if (bRoll.total > aRoll.total) return b;

  const aCpu = getCpuTotal(a);
  const bCpu = getCpuTotal(b);

  if (aCpu > bCpu) return a;
  if (bCpu > aCpu) return b;

  const aIsPlayer = Boolean(a?.hasPlayerOwner || a?.type === "digimon");
  const bIsPlayer = Boolean(b?.hasPlayerOwner || b?.type === "digimon");
  if (aIsPlayer !== bIsPlayer) return aIsPlayer ? a : b;

  return a;
}

function getOtherClashUuid(state, actor) {
  const actorUuid = actor?.uuid;
  if (state.initiatorUuid === actorUuid) return state.opponentUuid;
  if (state.opponentUuid === actorUuid) return state.initiatorUuid;
  return state.opponentUuid || state.initiatorUuid;
}

function getStoredClashStates(actor) {
  const states = [];
  const seen = new Set();
  const sessions = actor?.system?.clash?.sessions;

  if (sessions && typeof sessions === "object") {
    for (const state of Object.values(sessions)) {
      if (!state?.active || !state?.id || seen.has(String(state.id))) continue;
      states.push(foundry.utils.deepClone(state));
      seen.add(String(state.id));
    }
  }

  // Backward compatibility with worlds created before Multigrappler stored
  // simultaneous Clash sessions under system.clash.sessions.
  const legacyState = actor?.system?.clash?.state ?? {};
  if (legacyState?.active && legacyState?.id && !seen.has(String(legacyState.id))) {
    states.push(foundry.utils.deepClone(legacyState));
  }

  return states;
}

function getClashState(actor, { clashId = "", opponentUuid = "" } = {}) {
  const states = getStoredClashStates(actor);
  if (!states.length) return foundry.utils.deepClone(actor?.system?.clash?.state ?? {});

  if (clashId) {
    const byId = states.find((state) => String(state.id ?? "") === String(clashId));
    if (byId) return byId;
  }

  if (opponentUuid) {
    const byOpponent = states.find((state) => String(getOtherClashUuid(state, actor)) === String(opponentUuid));
    if (byOpponent) return byOpponent;
  }

  const primaryId = String(actor?.system?.clash?.state?.id ?? "");
  return states.find((state) => String(state.id ?? "") === primaryId) ?? states[0];
}

function getActiveClashCount(actor) {
  return getStoredClashStates(actor).length;
}

function hasActiveClash(actor) {
  return getActiveClashCount(actor) > 0 || Boolean(actor?.system?.combat?.clash?.active);
}

function hasClashWith(actor, otherActor) {
  return getStoredClashStates(actor).some((state) => String(getOtherClashUuid(state, actor)) === String(otherActor?.uuid ?? otherActor ?? ""));
}

function canJoinAdditionalClash(actor) {
  return getActiveClashCount(actor) < getMultigrapplerCapacity(actor);
}

function getRangedMultigrapplerClashCount(actor) {
  return getStoredClashStates(actor).filter((state) => (
    state?.multigrapplerRanged?.active &&
    String(state.multigrapplerRanged.ownerUuid ?? "") === String(actor?.uuid ?? "")
  )).length;
}

function getStateMaximumClashDistance(state, leftActor, rightActor) {
  let maximum = 1;
  for (const actor of [leftActor, rightActor]) {
    const extended = getExtendedGrappleData(actor);
    if (extended.active) maximum = Math.max(maximum, extended.maximumDistance);
    if (
      state?.multigrapplerRanged?.active &&
      String(state.multigrapplerRanged.ownerUuid ?? "") === String(actor?.uuid ?? "")
    ) {
      maximum = Math.max(maximum, Number(state.multigrapplerRanged.maximumDistance ?? 1));
    }
  }
  return maximum;
}

export function isActorInActiveClash(actor) {
  return hasActiveClash(actor);
}

export function canInitiateAdditionalClash(actor) {
  return Boolean(hasMultigrappler(actor) && canJoinAdditionalClash(actor));
}

function getTurnSignature(actor) {
  return [
    String(game?.combat?.id ?? "no-combat"),
    Number(game?.combat?.round ?? 0),
    Number(game?.combat?.turn ?? -1),
    Number(actor?.system?.combat?.tamerTalentRoundWindows?.speedSurge?.sequence ?? 0),
    String(actor?.uuid ?? "")
  ].join(":");
}

function getPairBlockKey(actor) {
  return String(actor?.uuid ?? "")
    .replaceAll(".", "__DOT__");
}

function isClashPairBlocked(initiator, target) {
  const entry = initiator?.system?.combat?.clashBlockedPairs?.[getPairBlockKey(target)];
  if (!entry) return false;
  return String(entry.combatId ?? "") === String(game?.combat?.id ?? "") &&
    Number(entry.round ?? -1) === Number(game?.combat?.round ?? 0);
}

async function blockClashPairUntilNextRound(initiator, target, reason = "slippery") {
  const blocks = foundry.utils.deepClone(initiator?.system?.combat?.clashBlockedPairs ?? {});
  blocks[getPairBlockKey(target)] = {
    combatId: game?.combat?.id ?? "",
    round: Number(game?.combat?.round ?? 0),
    targetUuid: target?.uuid ?? "",
    reason
  };
  await updateActorData(initiator, { "system.combat.clashBlockedPairs": blocks });
}

function hasUsedClashActionThisTurn(state, actor) {
  return String(getClashMapValue(state?.clashActionUse, actor, "")) === getTurnSignature(actor);
}

function getCombatTurnSignature() {
  return [String(game?.combat?.id ?? "no-combat"), Number(game?.combat?.round ?? 0), Number(game?.combat?.turn ?? -1)].join(":");
}

async function maybeActivateExposingHold(controller, opponent, state) {
  const nextState = {
    ...foundry.utils.deepClone(state),
    exposingHold: null
  };

  if (!hasExposingHold(controller)) return nextState;

  const useIt = await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-clash-dialog", "dda-clash-quality-window"],
    window: { title: localize("DDA.Clash.ExposingHold.Title") },
    content: `<div class="dda-confirm-dialog"><p>${formatI18n("DDA.Clash.ExposingHold.Prompt", {
      controller: escapeHtml(controller.name),
      opponent: escapeHtml(opponent.name)
    })}</p></div>`,
    yes: { label: localize("DDA.Yes") },
    no: { label: localize("DDA.No") },
    defaultYes: false
  });

  if (!useIt) return nextState;

  nextState.exposingHold = {
    active: true,
    controllerUuid: controller.uuid,
    opponentUuid: opponent.uuid,
    activatedRound: Number(game?.combat?.round ?? 0),
    activatedTurn: Number(game?.combat?.turn ?? -1),
    pinBlockedTurnSignature: getCombatTurnSignature()
  };
  return nextState;
}

function isClashParticipant(actor, state = {}) {
  const actorUuid = String(actor?.uuid ?? "");
  if (!actorUuid) return false;

  return [
    String(state?.initiatorUuid ?? ""),
    String(state?.opponentUuid ?? "")
  ].includes(actorUuid);
}

function isOutOfTurnClashParticipant(actor, state = {}) {
  return isClashParticipant(actor, state) && !getActiveDDAUnitContext(actor).allowed;
}

async function spendClashAction(actor, opponent, state, action) {
  if (hasUsedClashActionThisTurn(state, actor)) {
    ui.notifications.warn(localize("DDA.Warning.ClashActionAlreadyUsedThisTurn"));
    return null;
  }

  const turnContext = getActiveDDAUnitContext(actor);
  const outOfTurnClashAction = isClashParticipant(actor, state) && !turnContext.allowed;

  // Both participants must be able to resolve their Clash Action during the
  // current Clash window. An out-of-turn participant receives a virtual Clash
  // Action instead of spending Actions reserved for its future activation.
  if (!turnContext.allowed && !outOfTurnClashAction) {
    ui.notifications.warn(turnContext.ended
      ? localize("DDA.Warning.ClashParticipantEndedTurn")
      : localize("DDA.Warning.ClashNotActiveUnit"));
    return null;
  }

  const noActionSignature = String(getClashMapValue(state?.noClashActionTurn, actor, ""));
  if (noActionSignature === getTurnSignature(actor)) {
    ui.notifications.warn(localize("DDA.Warning.ClashNoActionAfterInitiation"));
    return null;
  }

  const currentActions = Math.max(0, Number(actor.system?.combat?.actions?.value ?? 0));
  const payment = outOfTurnClashAction
    ? {
        actionCost: 1,
        actionsBefore: currentActions,
        actionsAfter: currentActions,
        virtualClashAction: true,
        outOfTurnClashAction: true
      }
    : currentActions > 0
      ? await spendActorActions(actor, 1, { requireActiveUnit: true, notify: true })
      : { actionCost: 1, actionsBefore: 0, actionsAfter: 0, virtualClashAction: true };
  if (!payment) return null;

  let clashActionUse = foundry.utils.deepClone(state.clashActionUse ?? {});
  clashActionUse = setClashMapValue(clashActionUse, actor, getTurnSignature(actor));

  const nextState = recordClashAction({
    ...state,
    clashActionUse
  }, actor, action);

  await syncClashStateForPair(actor, opponent, nextState);
  return { payment, state: nextState };
}

export async function getOutsideClashAttackContext({ attacker, defender, clashContext = {} } = {}) {
  if (!attacker || !defender || !hasActiveClash(defender)) return { active: false };
  if (clashContext?.enabled || clashContext?.isClash || clashContext?.weakAttack || clashContext?.clashId) {
    return { active: false };
  }

  const states = getStoredClashStates(defender);
  if (!states.length) return { active: false };
  if (states.some((candidate) => String(getOtherClashUuid(candidate, defender)) === String(attacker.uuid))) {
    return { active: false };
  }

  // Outside-Clash modifiers are applied once, never stacked per Multigrappler
  // session. Prefer the session where this defender is exposed, otherwise keep
  // the legacy primary-session behavior.
  const state = states.find((candidate) => (
    candidate.exposingHold?.active &&
    String(candidate.exposingHold?.opponentUuid ?? "") === String(defender.uuid)
  )) ?? getClashState(defender);
  const otherActor = await resolveActor(getOtherClashUuid(state, defender));
  if (!otherActor) return { active: false };

  const defenderIsExposedOpponent = Boolean(
    state.exposingHold?.active &&
    String(state.exposingHold?.opponentUuid ?? "") === String(defender.uuid)
  );

  const cpuReduction = defenderIsExposedOpponent
    ? Math.floor(getCpuTotal(defender) / 2)
    : Math.floor((getCpuTotal(defender) + getCpuTotal(otherActor)) / 2);

  const supportDodge = defenderIsExposedOpponent
    ? Math.floor(getRamTotal(defender) / 2)
    : Math.floor((getRamTotal(defender) + getRamTotal(otherActor)) / 2);

  return {
    active: true,
    clashId: state.id ?? "",
    otherActorUuid: otherActor.uuid,
    otherActorName: otherActor.name,
    noDodgePool: true,
    damageReduction: Math.max(0, cpuReduction),
    supportDodgeSuccesses: Math.max(0, supportDodge),
    positiveEffectHealthRollBlocked: true,
    exposingHold: defenderIsExposedOpponent
  };
}

function hasFearFrom(actor, sourceActor) {
  const sourceKeys = new Set([
    sourceActor?.uuid,
    sourceActor?.id,
    sourceActor?.id ? `Actor.${sourceActor.id}` : ""
  ].filter(Boolean).map(String));

  return (actor?.system?.effects?.active ?? []).some((effect) => {
    const tag = String(effect?.tag ?? "").replace(/^\[|\]$/g, "").toLowerCase();
    return tag === "fear" && sourceKeys.has(String(effect.sourceActorUuid ?? ""));
  });
}

function getClashMapKey(actorOrUuid) {
  return String(actorOrUuid?.uuid ?? actorOrUuid ?? "")
    .replaceAll(".", "__DOT__");
}

function getLegacyDottedMapValue(map = {}, actorOrUuid = "") {
  const dottedKey = String(actorOrUuid?.uuid ?? actorOrUuid ?? "");
  if (!dottedKey || typeof map !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(map, dottedKey)) return map[dottedKey];

  let cursor = map;
  for (const part of dottedKey.split(".")) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = cursor[part];
  }

  return cursor;
}

function getClashMapValue(map = {}, actorOrUuid = "", fallback = 0) {
  if (typeof map === "number") return Number(map ?? fallback);
  if (!map || typeof map !== "object") return fallback;

  const safeKey = getClashMapKey(actorOrUuid);
  const value = map[safeKey] ?? getLegacyDottedMapValue(map, actorOrUuid);

  return value ?? fallback;
}

function setClashMapValue(map = {}, actorOrUuid = "", value = 0) {
  const nextMap = foundry.utils.deepClone(map ?? {});
  nextMap[getClashMapKey(actorOrUuid)] = value;
  return nextMap;
}

function getClashParticipantUuids(state = {}) {
  const uuids = new Set();

  for (const value of [
    state.initiatorUuid,
    state.opponentUuid,
    state.controllerUuid,
    state.pinnedByUuid,
    state.lastActionUuid
  ]) {
    if (value) uuids.add(String(value));
  }

  for (const entry of state.actionLog ?? []) {
    if (entry?.actorUuid) uuids.add(String(entry.actorUuid));
  }

  return Array.from(uuids);
}

function shouldKeepClashMapValue(value) {
  if (value === undefined || value === null) return false;
  if (value === 0 || value === false) return false;
  if (typeof value === "object") return false;
  return true;
}

function sanitizeClashMap(map = {}, participantUuids = []) {
  if (!map || typeof map !== "object") return {};

  const cleanMap = {};

  for (const uuid of participantUuids) {
    const value = getClashMapValue(map, uuid, undefined);

    if (shouldKeepClashMapValue(value)) {
      cleanMap[getClashMapKey(uuid)] = value;
    }
  }

  return cleanMap;
}

function sanitizeClashStateMaps(state = {}) {
  const nextState = foundry.utils.deepClone(state ?? {});
  const participantUuids = getClashParticipantUuids(nextState);

  for (const key of [
    "pinUses",
    "comebackBonus",
    "nextContestBonus",
    "blockedPairs",
    "actionCounts",
    "extendedReach",
    "clashActionUse",
    "noClashActionTurn"
  ]) {
    nextState[key] = sanitizeClashMap(nextState[key], participantUuids);
  }

  return nextState;
}

function getNextContestBonus(state, actorUuid) {
  return Number(getClashMapValue(state?.nextContestBonus, actorUuid, 0));
}

function getActionCount(state, actorUuid) {
  return Number(getClashMapValue(state?.actionCounts, actorUuid, 0));
}

function recordClashAction(state, actor, action) {
  const nextState = foundry.utils.deepClone(state ?? {});
  let actionCounts = foundry.utils.deepClone(nextState.actionCounts ?? {});
  const actionLog = Array.isArray(nextState.actionLog) ? [...nextState.actionLog] : [];

  actionCounts = setClashMapValue(actionCounts, actor, Number(getClashMapValue(actionCounts, actor, 0)) + 1);
  actionLog.push({
    actorUuid: actor.uuid,
    actorName: actor.name,
    action,
    at: new Date().toISOString()
  });

  nextState.actionCounts = actionCounts;
  nextState.actionLog = actionLog;
  nextState.lastActionUuid = actor.uuid;
  nextState.lastAction = action;

  return nextState;
}

function getEmptyLegacyClashState() {
  return {
    active: false,
    opponentUuid: "",
    controllerUuid: "",
    initiatorUuid: "",
    pinned: false,
    pinUses: 0,
    comebackBonus: 0,
    extendedReach: 0
  };
}

function getLegacyClashState(state = {}, actor = null) {
  const active = Boolean(state.active);
  const actorUuid = actor?.uuid ?? "";
  const opponentUuid = active ? getOtherClashUuid(state, actor) : "";

  return {
    active,
    opponentUuid,
    controllerUuid: active ? String(state.controllerUuid ?? "") : "",
    initiatorUuid: active ? String(state.initiatorUuid ?? "") : "",
    pinned: active ? Boolean(state.pinned) : false,
    pinUses: active ? Number(getClashMapValue(state.pinUses, actorUuid, 0)) : 0,
    comebackBonus: active ? Number(getClashMapValue(state.comebackBonus, actorUuid, 0)) : 0,
    extendedReach: active ? Number(getClashMapValue(state.extendedReach, actorUuid, 0)) : 0
  };
}

function buildClashMapDeleteUpdate(actor, nextState = {}) {
  const update = {};
  const currentState = actor?.system?.clash?.state ?? {};

  for (const key of [
    "pinUses",
    "comebackBonus",
    "nextContestBonus",
    "blockedPairs",
    "actionCounts",
    "extendedReach",
    "clashActionUse"
  ]) {
    const currentMap = currentState[key] ?? {};
    const nextMap = nextState[key] ?? {};

    if (!currentMap || typeof currentMap !== "object") continue;

    for (const oldKey of Object.keys(currentMap)) {
      const oldValue = currentMap[oldKey];
      const keepExistingKey = Object.prototype.hasOwnProperty.call(nextMap, oldKey) && shouldKeepClashMapValue(nextMap[oldKey]);
      const brokenNestedKey = oldValue && typeof oldValue === "object";
      const emptyValueKey = !shouldKeepClashMapValue(oldValue);

      if (!keepExistingKey || brokenNestedKey || emptyValueKey) {
        update[`system.clash.state.${key}.-=${oldKey}`] = null;
      }
    }
  }

  return update;
}

function getSyntheticTokenDocument(actor) {
  if (!actor?.isToken) return null;

  const tokenDocument = actor.token ?? actor.parent ?? null;
  if (tokenDocument?.documentName === "Token") return tokenDocument;

  return null;
}

async function clearBaseActorClashForSyntheticToken(tokenDocument, { forceLocal = false } = {}) {
  const baseActor = tokenDocument?.actorId ? game.actors?.get(tokenDocument.actorId) : null;
  if (!baseActor) return;

  // Unlinked tokens inherit system data from their base actor and then apply
  // TokenDocument.delta on top. If an older build saved dotted UUID maps on the
  // base actor, a clean token delta can still inherit { Scene: { ... } }.
  // The base actor should not carry live Clash state for unlinked scene tokens,
  // so reset its Clash root before writing the token-specific delta.
if (forceLocal || canUpdateActor(baseActor)) {
  await baseActor.update({
    "system.clash": null,
    "system.combat.clash": getEmptyLegacyClashState()
  }, { diff: false });
  return;
}

await updateActorData(baseActor, {
  "system.clash": null,
  "system.combat.clash": getEmptyLegacyClashState()
}, { diff: false });
}

async function updateActorClashState(
  actor,
  state,
  { forceLocal = false, removeClashId = "", replaceAll = false } = {}
) {
  if (!forceLocal && !canUpdateActor(actor)) {
    return requestGMClashUpdate({
      action: DDA_CLASH_SOCKET_ACTION_UPDATE_CLASH_STATE,
      actorUuid: actor.uuid,
      state,
      removeClashId,
      replaceAll
    });
  }

  const sessions = {};
  if (!replaceAll) {
    for (const existing of getStoredClashStates(actor)) {
      if (!existing?.active || !existing?.id) continue;
      sessions[String(existing.id)] = sanitizeClashStateMaps(existing);
    }
  }

  if (removeClashId) delete sessions[String(removeClashId)];

  if (state?.active && state?.id) {
    sessions[String(state.id)] = sanitizeClashStateMaps(state);
  }

  const currentPrimaryId = String(actor?.system?.clash?.state?.id ?? "");
  let primaryState = currentPrimaryId && sessions[currentPrimaryId]
    ? sessions[currentPrimaryId]
    : null;

  if (!primaryState && state?.active && state?.id && sessions[String(state.id)]) {
    primaryState = sessions[String(state.id)];
  }

  if (!primaryState) primaryState = Object.values(sessions)[0] ?? null;
  const storedPrimary = primaryState
    ? foundry.utils.deepClone(primaryState)
    : getInactiveClashState(state?.endedReason ?? "manual");
  const legacyState = getLegacyClashState(storedPrimary, actor);
  const tokenDocument = getSyntheticTokenDocument(actor);

  if (tokenDocument) {
    await clearBaseActorClashForSyntheticToken(tokenDocument, { forceLocal });
    await tokenDocument.update({
      "delta.system.clash": null,
      "delta.system.combat.clash": null
    });
    await tokenDocument.update({
      "delta.system.clash.state": storedPrimary,
      "delta.system.clash.sessions": sessions,
      "delta.system.combat.clash": legacyState
    });
    return;
  }

  // Remove the two dynamic containers before writing them again. This avoids
  // stale Clash IDs surviving Foundry's deep merge when a Multigrappler leaves
  // only one of several simultaneous Clashes.
  await actor.update({
    "system.clash.-=state": null,
    "system.clash.-=sessions": null
  });

  await actor.update({
    "system.clash.state": storedPrimary,
    "system.clash.sessions": sessions,
    "system.combat.clash": legacyState
  });
}

async function syncClashStateForPair(actorA, actorB, state) {
  const sanitizedState = sanitizeClashStateMaps(state);
  const stateA = {
    ...foundry.utils.deepClone(sanitizedState),
    role: sanitizedState.controllerUuid === actorA.uuid ? "controller" : "opponent"
  };
  const updates = [updateActorClashState(actorA, stateA)];

  if (actorB) {
    const stateB = {
      ...foundry.utils.deepClone(sanitizedState),
      role: sanitizedState.controllerUuid === actorB.uuid ? "controller" : "opponent"
    };
    updates.push(updateActorClashState(actorB, stateB));
  }

  await Promise.all(updates);
}

async function removeClashStateForPair(actorA, actorB, state, reason = "manual") {
  const clashId = String(state?.id ?? "");
  if (!clashId) return;
  const inactive = getInactiveClashState(reason);
  await Promise.all([
    actorA ? updateActorClashState(actorA, inactive, { removeClashId: clashId }) : null,
    actorB ? updateActorClashState(actorB, inactive, { removeClashId: clashId }) : null
  ].filter(Boolean));
}

function getInactiveClashState(reason = "manual") {
  return {
    active: false,
    id: "",
    initiatorUuid: "",
    initiatorName: "",
    opponentUuid: "",
    opponentName: "",
    controllerUuid: "",
    controllerName: "",
    role: "",
    pinned: false,
    pinnedByUuid: "",
    pinUses: {},
    comebackBonus: {},
    nextContestBonus: {},
    blockedPairs: {},
    actionCounts: {},
    clashActionUse: {},
    noClashActionTurn: {},
    actionLog: [],
    intents: {},
    exposingHold: null,
    lastContestRound: 0,
    endedReason: reason,
    endedAt: new Date().toISOString(),
    startedAt: ""
  };
}

function getRoleFor(actor, state = {}) {
  if (state.controllerUuid === actor?.uuid) return "controller";
  return "opponent";
}

function primaryActionOptions(actor) {
  const options = [
    ["attack", "DDA.Clash.Action.Primary.Attack"],
    ["move", "DDA.Clash.Action.Primary.Move"],
    ["pin", "DDA.Clash.Action.Primary.Pin"],
    ["end", "DDA.Clash.Action.Primary.End"],
    ["throw", "DDA.Clash.Action.Primary.Throw"]
  ];

  if (getExtendedGrappleData(actor).active) options.push(["pull", "DDA.Clash.Action.Primary.Pull"]);
  if (hasWrestlemania(actor)) options.push(["finisher", "DDA.Clash.Action.Primary.Finisher"]);
  return options;
}

function secondaryActionOptions(actor, state = {}) {
  const options = [
    ["weakAttack", "DDA.Clash.Action.Secondary.WeakAttack"],
    ["comeback", "DDA.Clash.Action.Secondary.Comeback"]
  ];

  if (state.pinned) options.push(["contestPin", "DDA.Clash.Action.Secondary.ContestPin"]);
  if (!state.pinned) options.push(["escape", "DDA.Clash.Action.Secondary.Escape"]);
  if (hasTeleport(actor)) options.push(["teleport", "DDA.Clash.Action.Secondary.Teleport"]);

  return options;
}

function renderSelect(name, label, options, selected = "") {
  return `
    <div class="form-group">
      <label>${escapeHtml(localize(label))}</label>
      <select name="${escapeHtml(name)}">
        ${options.map(([value, labelKey]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(localize(labelKey))}</option>`).join("")}
      </select>
    </div>
  `;
}

async function promptClashIntent(actor) {
  try {
    return await foundry.applications.api.DialogV2.prompt({
      classes: ["dda", "dda-area-attack-dialog", "dda-offensive-quality-window"],
      window: { title: localize("DDA.Clash.IntentDialog.Title") },
      content: `
        <form class="dda-roll-dialog dda-clash-intent-dialog dda-offensive-quality-dialog">
          <p>${formatI18n("DDA.Clash.IntentDialog.Hint", { actor: escapeHtml(actor.name) })}</p>
          ${renderSelect("primaryIntent", "DDA.Clash.IntentDialog.Primary", primaryActionOptions(actor), "attack")}
          ${renderSelect("secondaryIntent", "DDA.Clash.IntentDialog.Secondary", secondaryActionOptions(actor), "escape")}
        </form>
      `,
      ok: {
        label: localize("DDA.Button.Confirm"),
        callback: (_event, button) => ({
          primaryIntent: String(button.form.elements.primaryIntent?.value ?? "attack"),
          secondaryIntent: String(button.form.elements.secondaryIntent?.value ?? "escape")
        })
      },
      rejectClose: false,
      modal: true
    });
  } catch (_error) {
    return null;
  }
}

async function promptClashAction(actor, state = {}) {
  const role = getRoleFor(actor, state);
  const options = role === "controller"
    ? primaryActionOptions(actor)
    : secondaryActionOptions(actor, state);

  try {
    return await foundry.applications.api.DialogV2.prompt({
      classes: ["dda", "dda-area-attack-dialog", "dda-offensive-quality-window"],
      window: {
        title: role === "controller"
          ? localize("DDA.Clash.PrimaryMenu.Title")
          : localize("DDA.Clash.SecondaryMenu.Title")
      },
      content: `
        <form class="dda-roll-dialog dda-clash-action-dialog dda-offensive-quality-dialog">
          <p>${formatI18n("DDA.Clash.ActionDialog.Hint", {
            actor: escapeHtml(actor.name),
            role: escapeHtml(localize(role === "controller" ? "DDA.Clash.Role.Controller" : "DDA.Clash.Role.Opponent"))
          })}</p>
          ${renderSelect(
            "action",
            role === "controller" ? "DDA.Clash.PrimaryAction" : "DDA.Clash.SecondaryAction",
            options
          )}
        </form>
      `,
      ok: {
        label: localize("DDA.Button.Confirm"),
        callback: (_event, button) => String(button.form.elements.action?.value ?? "") || null
      },
      rejectClose: false,
      modal: true
    });
  } catch (_error) {
    return null;
  }
}

function renderActionButton(actor, labelKey, action = "menu", clashId = "") {
  return `<button type="button" class="dda-clash-chat-action" data-action="dda-clash-action" data-clash-action="${escapeHtml(action)}" data-clash-id="${escapeHtml(clashId)}" data-actor-uuid="${escapeHtml(actor.uuid)}">${escapeHtml(localize(labelKey))}</button>`;
}

function renderClashCard({ title, lines = [], controllerActor = null, opponentActor = null, includeButtons = false, extraClass = "", clashId = "" }) {
  return `
    <div class="dda-chat-card dda-effect-card dda-clash-card ${escapeHtml(extraClass)}">
      <h2>${escapeHtml(title)}</h2>
      <ul class="dda-effect-list dda-clash-list">
        ${lines.map((line) => `<li>${line}</li>`).join("")}
      </ul>
      ${includeButtons ? `
        <div class="dda-clash-chat-actions">
          ${controllerActor ? renderActionButton(controllerActor, "DDA.Clash.Button.ControllerActions", "menu", clashId) : ""}
          ${opponentActor ? renderActionButton(opponentActor, "DDA.Clash.Button.OpponentActions", "menu", clashId) : ""}
          ${controllerActor ? renderActionButton(controllerActor, "DDA.Clash.Button.End", "end", clashId) : ""}
        </div>
      ` : ""}
    </div>
  `;
}

function getActionLabel(actionKey, role = "controller") {
  const prefix = role === "controller" ? "DDA.Clash.Action.Primary" : "DDA.Clash.Action.Secondary";
  const map = {
    attack: `${prefix}.Attack`,
    move: `${prefix}.Move`,
    pin: `${prefix}.Pin`,
    end: `${prefix}.End`,
    throw: `${prefix}.Throw`,
    finisher: `${prefix}.Finisher`,
    pull: `${prefix}.Pull`,
    weakAttack: `${prefix}.WeakAttack`,
    comeback: `${prefix}.Comeback`,
    contestPin: `${prefix}.ContestPin`,
    escape: `${prefix}.Escape`,
    teleport: `${prefix}.Teleport`
  };
  return localize(map[actionKey] ?? actionKey);
}

function getAttackItems(actor) {
  return Array.from(actor?.items ?? []).filter((item) => item?.type === "attack");
}

function getAttackRangeType(attackItem) {
  return normalizeText(attackItem?.system?.baseTags?.rangeType ?? "");
}

function getAttackFunctionType(attackItem) {
  return normalizeText(attackItem?.system?.baseTags?.functionType ?? "damage");
}

function isMeleeAttack(attackItem) {
  return getAttackRangeType(attackItem) === "melee";
}

function isRangedAttack(attackItem) {
  const rangeType = getAttackRangeType(attackItem);
  return rangeType === "range" || rangeType === "ranged";
}

function isSupportAttack(attackItem) {
  return getAttackFunctionType(attackItem) === "support";
}

function hasReach(actor) {
  return actorHasQuality(actor, ["Reach", "Alcance"]);
}

function getClashAttackOptions(actor, { weakAttack = false } = {}) {
  const attacks = getAttackItems(actor);
  const pointBlank = hasPointBlank(actor);

  return attacks.filter((attack) => {
    if (isMeleeAttack(attack)) return true;
    if (isRangedAttack(attack)) return pointBlank;
    return false;
  });
}

function renderAttackSelectOptions(attacks = []) {
  return attacks.map((attack) => {
    const rangeType = attack.system?.baseTags?.rangeType ?? "";
    const functionType = attack.system?.baseTags?.functionType ?? "";
    const tags = [rangeType, functionType].filter(Boolean).join(" / ");
    const label = tags ? `${attack.name} (${tags})` : attack.name;
    return `<option value="${escapeHtml(attack.id)}">${escapeHtml(label)}</option>`;
  }).join("");
}

async function promptClashAttackItem(actor, { weakAttack = false } = {}) {
  const allAttacks = getAttackItems(actor);
  if (!allAttacks.length) {
    ui.notifications.warn(formatI18n("DDA.Warning.NoAttackItemsAvailable", { actor: actor.name }));
    return null;
  }

  const attacks = getClashAttackOptions(actor, { weakAttack });
  if (!attacks.length) {
    ui.notifications.warn(localize("DDA.Warning.ClashNoValidAttack"));
    return null;
  }

  const attackId = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-clash-dialog", "dda-clash-attack-window"],
    window: {
      title: weakAttack ? localize("DDA.Clash.Action.Secondary.WeakAttack") : localize("DDA.Clash.Action.Primary.Attack")
    },
    position: { width: 560, height: "auto" },
    modal: true,
    content: `
      <form class="dda-roll-dialog dda-clash-attack-dialog dda-clash-quality-form">
        <header class="dda-clash-quality-hero">
          <span>${escapeHtml(localize("DDA.Clash.Title"))}</span>
          <h2>${escapeHtml(actor.name)}</h2>
          <p>${escapeHtml(weakAttack ? localize("DDA.Clash.WeakAttackHint") : localize("DDA.Clash.PrimaryAttackHint"))}</p>
        </header>
        <div class="form-group">
          <label>${escapeHtml(localize("DDA.Item.Type.Attack"))}</label>
          <select name="attackId">${renderAttackSelectOptions(attacks)}</select>
        </div>
      </form>
    `,
    buttons: [
      {
        action: "confirm",
        label: localize("DDA.Button.Confirm"),
        icon: "fa-solid fa-hand-fist",
        default: true,
        callback: (_event, button) => String(button.form?.elements?.attackId?.value ?? "")
      },
      {
        action: "cancel",
        label: localize("DDA.Button.Cancel"),
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });

  return attacks.find((attack) => attack.id === attackId) ?? null;
}

function getTokenObjectForActor(actor) {
  const tokenDocument = getSyntheticTokenDocument(actor);
  if (tokenDocument?.object) return tokenDocument.object;

  return canvas?.tokens?.placeables?.find((token) => {
    return token?.actor?.uuid === actor?.uuid || token?.actor?.id === actor?.id;
  }) ?? null;
}


function getExtendedGrappleData(actor) {
  const reach = getReachModeData(actor);
  return {
    ...reach,
    active: reach.mode === "extendedgrapple" && Number(reach.rank ?? 0) > 0,
    maximumDistance: 1 + Math.max(0, Number(reach.rank ?? 0))
  };
}

function getClashDistance(leftActor, rightActor) {
  return getTokenDistanceSpaces(
    getTokenObjectForActor(leftActor),
    getTokenObjectForActor(rightActor)
  );
}

function tokenRectangle(document, x = document?.x, y = document?.y) {
  const grid = Math.max(1, Number(canvas?.grid?.size ?? 100));
  return {
    left: Number(x ?? 0),
    top: Number(y ?? 0),
    right: Number(x ?? 0) + Math.max(1, Number(document?.width ?? 1)) * grid,
    bottom: Number(y ?? 0) + Math.max(1, Number(document?.height ?? 1)) * grid
  };
}

function rectanglesOverlap(left, right) {
  return !(
    left.right <= right.left ||
    left.left >= right.right ||
    left.bottom <= right.top ||
    left.top >= right.bottom
  );
}

function getClosestAdjacentPosition(controllerToken, opponentToken) {
  const controller = controllerToken?.document;
  const opponent = opponentToken?.document;
  if (!controller || !opponent) return null;

  const grid = Math.max(1, Number(canvas?.grid?.size ?? 100));
  const controllerWidth = Math.max(1, Number(controller.width ?? 1)) * grid;
  const controllerHeight = Math.max(1, Number(controller.height ?? 1)) * grid;
  const opponentWidth = Math.max(1, Number(opponent.width ?? 1)) * grid;
  const opponentHeight = Math.max(1, Number(opponent.height ?? 1)) * grid;
  const centerY = Number(controller.y ?? 0) + (controllerHeight - opponentHeight) / 2;
  const centerX = Number(controller.x ?? 0) + (controllerWidth - opponentWidth) / 2;

  const candidates = [
    { x: Number(controller.x ?? 0) - opponentWidth, y: centerY },
    { x: Number(controller.x ?? 0) + controllerWidth, y: centerY },
    { x: centerX, y: Number(controller.y ?? 0) - opponentHeight },
    { x: centerX, y: Number(controller.y ?? 0) + controllerHeight },
    { x: Number(controller.x ?? 0) - opponentWidth, y: Number(controller.y ?? 0) - opponentHeight },
    { x: Number(controller.x ?? 0) + controllerWidth, y: Number(controller.y ?? 0) - opponentHeight },
    { x: Number(controller.x ?? 0) - opponentWidth, y: Number(controller.y ?? 0) + controllerHeight },
    { x: Number(controller.x ?? 0) + controllerWidth, y: Number(controller.y ?? 0) + controllerHeight }
  ].map((candidate) => ({
    x: Math.round(candidate.x / grid) * grid,
    y: Math.round(candidate.y / grid) * grid
  }));

  const sceneWidth = Math.max(0, Number(canvas?.scene?.width ?? 0));
  const sceneHeight = Math.max(0, Number(canvas?.scene?.height ?? 0));
  const occupied = (canvas?.tokens?.placeables ?? [])
    .filter((token) => token?.document?.id !== opponent.id && token?.document?.id !== controller.id)
    .map((token) => tokenRectangle(token.document));

  const valid = candidates.filter((candidate) => {
    const rectangle = tokenRectangle(opponent, candidate.x, candidate.y);
    if (candidate.x < 0 || candidate.y < 0) return false;
    if (sceneWidth > 0 && rectangle.right > sceneWidth) return false;
    if (sceneHeight > 0 && rectangle.bottom > sceneHeight) return false;
    return occupied.every((other) => !rectanglesOverlap(rectangle, other));
  });

  valid.sort((left, right) => {
    const leftDistance = Math.hypot(left.x - Number(opponent.x ?? 0), left.y - Number(opponent.y ?? 0));
    const rightDistance = Math.hypot(right.x - Number(opponent.x ?? 0), right.y - Number(opponent.y ?? 0));
    return leftDistance - rightDistance;
  });

  return valid[0] ?? null;
}

async function updateClashToken(tokenDocument, update = {}, options = {}) {
  if (!tokenDocument) return false;
  if (game.user?.isGM || tokenDocument.canUserModify?.(game.user, "update")) {
    await tokenDocument.update(update, options);
    return true;
  }

  return requestGMClashUpdate({
    action: DDA_CLASH_SOCKET_ACTION_UPDATE_TOKEN,
    sceneId: tokenDocument.parent?.id ?? canvas?.scene?.id ?? "",
    tokenId: tokenDocument.id,
    update,
    options
  });
}

async function executeExtendedGrapplePull(controller, opponent, state) {
  const reach = getExtendedGrappleData(controller);
  if (!reach.active) {
    ui.notifications.warn(localize("DDA.Warning.ClashPullRequiresExtendedGrapple"));
    return null;
  }

  const spent = await spendClashAction(controller, opponent, state, "pull");
  if (!spent) return null;
  state = spent.state;

  if (getSizeDifference(controller, opponent) < 0) {
    const check = await rollDerivedCheck(controller, "cpu", {
      skillKey: "featsOfStrength",
      tn: 12 + getActorDerivedStat(opponent, "cpu"),
      title: localize("DDA.Clash.Action.Primary.Pull"),
      targetActor: opponent
    });
    if (!check) return null;
    if (!check.success) {
      ui.notifications.warn(localize("DDA.Warning.ClashPullCheckFailed"));
      return null;
    }
  }

  const controllerToken = getTokenObjectForActor(controller);
  const opponentToken = getTokenObjectForActor(opponent);
  const destination = getClosestAdjacentPosition(controllerToken, opponentToken);
  if (!destination) {
    ui.notifications.warn(localize("DDA.Warning.ClashPullNoSpace"));
    return null;
  }

  await syncClashStateForPair(controller, opponent, state);
  await updateClashToken(opponentToken.document, destination, {
    animate: true,
    ddaExtendedGrapplePull: true
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: controller }),
    content: renderClashCard({
      title: localize("DDA.Clash.Action.Primary.Pull"),
      lines: [formatI18n("DDA.Clash.ActionResult.Pull", {
        controller: escapeHtml(controller.name),
        opponent: escapeHtml(opponent.name)
      })],
      controllerActor: controller,
      opponentActor: opponent,
      includeButtons: true,
      clashId: state.id,
      extraClass: "dda-clash-action-result-card"
    })
  });

  return true;
}

async function maybeGrantClashChargeMovement(attacker, defender, state, rollResult) {
  if (!rollResult?.qualityAttackModifier?.chargeMoveWithAttack) return false;
  const canMoveTarget = getSizeDifference(attacker, defender) >= 0 || hasTitanPower(attacker);
  if (!canMoveTarget) return false;

  const useIt = await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-clash-dialog", "dda-clash-quality-window"],
    window: { title: localize("DDA.Clash.ChargeMove.Title") },
    content: `<div class="dda-confirm-dialog"><p>${formatI18n("DDA.Clash.ChargeMove.Prompt", {
      attacker: escapeHtml(attacker.name),
      opponent: escapeHtml(defender.name)
    })}</p></div>`,
    yes: { label: localize("DDA.Yes") },
    no: { label: localize("DDA.No") },
    defaultYes: false
  });
  if (!useIt) return false;

  const movement = Math.max(0, Number(
    attacker.system?.movement?.land?.total ??
    attacker.system?.movement?.land?.value ??
    attacker.system?.derived?.movement?.value ??
    attacker.system?.miscStats?.movement?.total ??
    attacker.system?.miscStats?.movement?.value ?? 0
  ));
  const maximum = Math.floor(movement / 2);
  if (maximum <= 0) return false;

  const moverToken = getTokenObjectForActor(attacker);
  const followerToken = getTokenObjectForActor(defender);
  const nextState = {
    ...foundry.utils.deepClone(state),
    clashMove: {
      active: true,
      moverUuid: attacker.uuid,
      followerUuid: defender.uuid,
      maximum,
      maximumDistance: getStateMaximumClashDistance(state, attacker, defender),
      kind: "charge",
      offsetX: followerToken && moverToken
        ? Number(followerToken.document.x ?? 0) - Number(moverToken.document.x ?? 0)
        : 0,
      offsetY: followerToken && moverToken
        ? Number(followerToken.document.y ?? 0) - Number(moverToken.document.y ?? 0)
        : 0,
      turnSignature: getCombatTurnSignature(),
      startedAt: Date.now()
    }
  };
  await syncClashStateForPair(attacker, defender, nextState);
  await game.dda?.movementTracker?.grantMovement?.(attacker, maximum, {
    kind: "clash-charge",
    actionCost: 0,
    source: "clashCharge",
    sourceActorUuid: attacker.uuid,
    sourceActorName: attacker.name,
    label: localize("DDA.Clash.ChargeMove.Title")
  });
  ui.notifications.info(formatI18n("DDA.Clash.ChargeMove.Ready", { spaces: maximum }));
  return true;
}

async function executeClashAttack(attacker, defender, state, action, { weakAttack = false } = {}) {
  const attackItem = await promptClashAttackItem(attacker, { weakAttack });
  if (!attackItem) return null;

  const targetToken = getTokenObjectForActor(defender);
  if (!targetToken) {
    ui.notifications.warn(localize("DDA.Warning.ClashOpponentNotFound"));
    return null;
  }

  const spent = await spendClashAction(attacker, defender, state, action);
  if (!spent) return null;
  state = spent.state;

  const wrestlemania = getAttackFunctionType(attackItem) === "damage"
    ? await rollWrestlemaniaDamageCheck(attacker, defender)
    : null;

  const clashDistance = getClashDistance(attacker, defender);
  const attackerExtendedGrapple = getExtendedGrappleData(attacker);
  const defenderExtendedGrapple = getExtendedGrappleData(defender);
  const multigrapplerNoPenalty = Boolean(
    state?.multigrapplerRanged?.active &&
    String(state.multigrapplerRanged.ownerUuid ?? "") === String(attacker.uuid ?? "")
  );
  const extendedGrappleAccuracyPenalty = !multigrapplerNoPenalty && attackerExtendedGrapple.active && clashDistance > 0
    ? Math.max(0, Math.ceil(clashDistance))
    : 0;
  const defenderKeepsFullDodge = weakAttack && (
    hasReach(defender) ||
    (
      defenderExtendedGrapple.active &&
      attackerExtendedGrapple.rank < defenderExtendedGrapple.rank
    )
  );
  const pointBlankRanged = hasPointBlank(attacker) && isRangedAttack(attackItem);

  const rollResult = await rollAttack(attacker, attackItem, {
    targetToken,
    actionCostOverride: 0,
    allowOutOfTurn: isOutOfTurnClashParticipant(attacker, state),
    areaAttackActive: false,
    accuracyDiceModifier: -extendedGrappleAccuracyPenalty,
    ignoreAdjacentEnemyPenalty: pointBlankRanged,
    clashContext: {
      active: true,
      enabled: true,
      clashId: state.id,
      action,
      weakAttack,
      halveDodge: !defenderKeepsFullDodge,
      defenderHasReach: defenderKeepsFullDodge,
      pointBlankRanged,
      extendedGrappleDistance: clashDistance,
      extendedGrappleAccuracyPenalty,
      wrestlemaniaDamageBonus: Number(wrestlemania?.damageBonus ?? 0),
      wrestlemaniaCheckLabel: wrestlemania?.option?.label ?? ""
    }
  });

  if (!rollResult) return null;

  const isRecoil = Number(rollResult.qualityAttackModifier?.recoilDistance ?? 0) > 0;
  if (isRecoil && hasPointBlank(attacker)) {
    await endDigimonClash(attacker, { reason: "recoil", clashId: state.id });
    return rollResult;
  }

  await maybeGrantClashChargeMovement(attacker, defender, state, rollResult);
  return rollResult;
}

export async function initiateDigimonClash(actor) {
  if (!isDigimonLike(actor)) {
    ui.notifications.warn(localize("DDA.Warning.ClashOnlyForDigimon"));
    return null;
  }

  if (!Boolean(getDDASettingSafe("enableClashActions", true))) {
    ui.notifications.warn(localize("DDA.Warning.ClashDisabled"));
    return null;
  }

  const { targetToken, targetActor, error } = getSelectedTargetActor();
  if (error) {
    ui.notifications.warn(localize(error));
    return null;
  }

  if (targetActor.uuid === actor.uuid) {
    ui.notifications.warn(localize("DDA.Warning.CannotClashSelf"));
    return null;
  }

  if (actorsShareGiantHijackerState(actor, targetActor)) {
    ui.notifications.warn(localize("DDA.Warning.ClashGiantHijackerPair"));
    return null;
  }

  if (isClashPairBlocked(actor, targetActor)) {
    ui.notifications.warn(localize("DDA.Warning.ClashPairBlockedThisRound"));
    return null;
  }

  const initiatorToken = getTokenObjectForActor(actor);
  const targetTokenObject = targetToken?.object ?? targetToken;
  const clashDistance = getTokenDistanceSpaces(initiatorToken, targetTokenObject);
  const extendedGrapple = getExtendedGrappleData(actor);
  const multigrapplerReach = getMultigrapplerReachData(actor);
  const remoteClash = Number.isFinite(clashDistance) && clashDistance > 1;
  const maximumClashDistance = Math.max(
    1,
    extendedGrapple.active ? extendedGrapple.maximumDistance : 1,
    multigrapplerReach.active ? multigrapplerReach.maximumDistance : 1
  );

  if (!Number.isFinite(clashDistance) || clashDistance > maximumClashDistance) {
    ui.notifications.warn(formatI18n("DDA.Warning.ClashTargetOutOfReach", {
      distance: Number.isFinite(clashDistance) ? clashDistance : "—",
      reach: maximumClashDistance
    }));
    return null;
  }

  if (remoteClash && hasMultigrappler(actor)) {
    if (!multigrapplerReach.active) {
      ui.notifications.warn(text(
        "Multigrappler só pode manter um Clash à distância se também possuir Reach.",
        "Multigrappler can only maintain a ranged Clash if it also has Reach."
      ));
      return null;
    }
    if (getRangedMultigrapplerClashCount(actor) >= 1) {
      ui.notifications.warn(text(
        "Multigrappler só pode manter 1 inimigo em Clash à distância por vez.",
        "Multigrappler can only maintain 1 enemy in a ranged Clash at a time."
      ));
      return null;
    }
  }

  const turnContext = getActiveDDAUnitContext(actor);
  if (!turnContext.allowed) {
    ui.notifications.warn(turnContext.ended
      ? "Este Digimon já encerrou sua parte desta ativação."
      : "Este Digimon não pertence à unidade ativa.");
    return null;
  }

  if (hasFearFrom(actor, targetActor)) {
    ui.notifications.warn("[FEAR] impede iniciar ou controlar um Clash contra este Caster.");
    return null;
  }

  if (hasClashWith(actor, targetActor)) {
    ui.notifications.warn(text(
      "Esses Digimon já estão em Clash entre si.",
      "These Digimon are already in a Clash with each other."
    ));
    return null;
  }

  if (!canJoinAdditionalClash(actor)) {
    ui.notifications.warn(hasMultigrappler(actor)
      ? text(
          `${actor.name} já atingiu o limite de ${getMultigrapplerCapacity(actor)} Clashes simultâneos do Multigrappler.`,
          `${actor.name} has already reached Multigrappler's limit of ${getMultigrapplerCapacity(actor)} simultaneous Clashes.`
        )
      : localize("DDA.Warning.ClashParticipantAlreadyInClash"));
    return null;
  }

  if (!canJoinAdditionalClash(targetActor)) {
    ui.notifications.warn(hasMultigrappler(targetActor)
      ? text(
          `${targetActor.name} já atingiu o limite de ${getMultigrapplerCapacity(targetActor)} Clashes simultâneos do Multigrappler.`,
          `${targetActor.name} has already reached Multigrappler's limit of ${getMultigrapplerCapacity(targetActor)} simultaneous Clashes.`
        )
      : localize("DDA.Warning.ClashParticipantAlreadyInClash"));
    return null;
  }

  const actions = Number(actor.system.combat?.actions?.value ?? 0);
  const wranglerFreeClash = canUseWranglerFreeClash(actor);
  const clashActionCost = wranglerFreeClash ? 0 : 1;
  if (actions < clashActionCost) {
    ui.notifications.warn(localize("DDA.Warning.NotEnoughActionsForClash"));
    return null;
  }

  const intent = await promptClashIntent(actor);
  if (!intent) return null;

  try {
    const environment = await import("./environment.js");
    await environment.revealActorFromInteraction?.(actor, "clash");
  } catch (error) {
    console.warn("DDA | Could not end Hidden after Clash initiation.", error);
  }

  const substituteEscape = await requestSubstitute({
    attacker: actor,
    defender: targetActor,
    suppressInterrupts: false,
    inClash: false
  });

  if (substituteEscape?.success) {
    await updateActorData(actor, {
      "system.combat.actions.value": Math.max(0, actions - clashActionCost)
    });

    if (wranglerFreeClash) {
      await markWranglerFreeClashUsed(actor);
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="dda-chat-card dda-effect-card effect-special dda-defensive-quality-card">
        <h2>${escapeHtml(targetActor.name)} — ${localize("DDA.Clash.Title")}</h2>
        <p>${escapeHtml(targetActor.name)} ${String(game.i18n?.lang ?? "").toLowerCase().startsWith("en")
          ? "escaped the Clash initiation with Substitute."
          : "escapou da iniciação do Clash usando Substituto."}</p>
      </div>`
    });

    return {
      active: false,
      escapedBySubstitute: true,
      substitute: substituteEscape
    };
  }

  // A new Multigrappler relationship is a fresh Clash. Comeback / next-contest
  // bonuses belong to their original Clash session and must not leak into it.
  const initiatorBonus = 0;
  const targetBonus = 0;

  const initiatorRoll = await rollClashCheck(actor, targetActor, { bonus: initiatorBonus });
  if (!initiatorRoll) return null;

  const slipperyRoll = await rollSlipperyCheck(targetActor, actor, { bonus: targetBonus });
  const targetRoll = slipperyRoll ?? await rollClashCheck(targetActor, actor, { bonus: targetBonus });
  if (!targetRoll) return null;

  let controller;
  if (slipperyRoll && targetRoll.total !== initiatorRoll.total) {
    controller = targetRoll.total > initiatorRoll.total ? targetActor : actor;
  } else {
    controller = resolveController(actor, targetActor, initiatorRoll, targetRoll);
  }

  if (slipperyRoll && controller.uuid === targetActor.uuid) {
    await updateActorData(actor, {
      "system.combat.actions.value": Math.max(0, actions - clashActionCost)
    });
    if (wranglerFreeClash) await markWranglerFreeClashUsed(actor);
    await blockClashPairUntilNextRound(actor, targetActor, "slippery");

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      rolls: [initiatorRoll.roll, targetRoll.roll],
      content: renderClashCard({
        title: localize("DDA.Clash.Slippery.Title"),
        lines: [
          formatI18n("DDA.Clash.RollSummaryDetailed", {
            initiator: escapeHtml(actor.name),
            initiatorTotal: initiatorRoll.total,
            opponent: escapeHtml(targetActor.name),
            opponentTotal: targetRoll.total
          }),
          formatI18n("DDA.Clash.Slippery.Prevented", {
            initiator: escapeHtml(actor.name),
            opponent: escapeHtml(targetActor.name)
          })
        ],
        extraClass: "dda-clash-slippery-card"
      })
    });
    return { active: false, preventedBySlippery: true };
  }

  if (controller.uuid === targetActor.uuid && hasFearFrom(targetActor, actor)) {
    controller = actor;
  }
  const opponent = controller.uuid === actor.uuid ? targetActor : actor;

  const autoEndForSize = getSizeDifference(controller, opponent) <= -2 && !hasMonsterStrength(controller);
  let stateBase = {
    active: !autoEndForSize,
    id: foundry.utils.randomID(),
    initiatorUuid: actor.uuid,
    initiatorName: actor.name,
    opponentUuid: targetActor.uuid,
    opponentName: targetActor.name,
    controllerUuid: controller.uuid,
    controllerName: controller.name,
    pinned: false,
    pinnedByUuid: "",
    pinUses: {},
    comebackBonus: {},
    nextContestBonus: {},
    blockedPairs: {},
    actionCounts: {},
    clashActionUse: {},
    noClashActionTurn: (actions - clashActionCost) <= 0
      ? setClashMapValue({}, actor, getTurnSignature(actor))
      : {},
    actionLog: [],
    intents: {
      [getClashMapKey(actor)]: intent
    },
    exposingHold: null,
    lastContestRound: Number(game?.combat?.round ?? 0),
    extendedGrapple: extendedGrapple.active
      ? {
          ownerUuid: actor.uuid,
          rank: extendedGrapple.rank,
          startedDistance: clashDistance
        }
      : null,
    multigrapplerRanged: remoteClash && hasMultigrappler(actor) && multigrapplerReach.active
      ? {
          active: true,
          ownerUuid: actor.uuid,
          rank: multigrapplerReach.rank,
          maximumDistance: multigrapplerReach.maximumDistance,
          startedDistance: clashDistance
        }
      : null,
    startedAt: new Date().toISOString()
  };

  if (!autoEndForSize) {
    stateBase = await maybeActivateExposingHold(controller, opponent, stateBase);
  }

await updateActorData(actor, {
  "system.combat.actions.value": Math.max(0, actions - clashActionCost),
  "system.combat.currentStance": "neutral"
});

if (wranglerFreeClash) {
  await markWranglerFreeClashUsed(actor);
}

await updateActorData(targetActor, {
  "system.combat.currentStance": "neutral"
});

  await syncClashStateForPair(actor, targetActor, stateBase);

  const lines = [
    formatI18n("DDA.Clash.Started", { initiator: escapeHtml(actor.name), opponent: escapeHtml(targetActor.name) }),
    formatI18n("DDA.Clash.RollSummaryDetailed", {
      initiator: escapeHtml(actor.name),
      initiatorTotal: initiatorRoll.total,
      opponent: escapeHtml(targetActor.name),
      opponentTotal: targetRoll.total
    }),
    formatI18n("DDA.Clash.Controller", { controller: escapeHtml(controller.name) }),
    formatI18n("DDA.Clash.IntentSummary", {
      primary: escapeHtml(getActionLabel(intent.primaryIntent, "controller")),
      secondary: escapeHtml(getActionLabel(intent.secondaryIntent, "opponent"))
    }),
    localize("DDA.Clash.NeutralStanceNote")
  ];

  if (wranglerFreeClash) {
    lines.push(localize("DDA.Clash.WranglerFreeAction"));
  }

  if (hasWrestlemania(actor)) {
    lines.push(`${escapeHtml(actor.name)}: ${escapeHtml(initiatorRoll.checkLabel)} (+${initiatorRoll.modifier}).`);
  }

  if (hasWrestlemania(targetActor)) {
    lines.push(`${escapeHtml(targetActor.name)}: ${escapeHtml(targetRoll.checkLabel)} (+${targetRoll.modifier}).`);
  }

  if (autoEndForSize) {
    lines.push(localize("DDA.Clash.AutoEndTooSmall"));
    await syncClashStateForPair(actor, targetActor, getInactiveClashState("size"));
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: renderClashCard({
      title: localize("DDA.Clash.Title"),
      lines,
      controllerActor: autoEndForSize ? null : controller,
      opponentActor: autoEndForSize ? null : opponent,
      includeButtons: !autoEndForSize,
      clashId: stateBase.id
    })
  });

  actor.sheet?.render(false);
  targetActor.sheet?.render(false);
  return stateBase;
}

export async function performClashContestForInitiator(initiator, { automatic = false, clashId = "" } = {}) {
  if (!initiator || !hasActiveClash(initiator)) return null;
  let state = getClashState(initiator, { clashId });
  if (String(state.initiatorUuid ?? "") !== String(initiator.uuid)) return null;

  const currentRound = Number(game?.combat?.round ?? 0);
  if (currentRound < 1 || Number(state.lastContestRound ?? 0) >= currentRound) return null;

  const other = await resolveActor(getOtherClashUuid(state, initiator));
  if (!other) return null;
  const currentController = await resolveActor(state.controllerUuid);
  const currentOpponent = currentController?.uuid === initiator.uuid ? other : initiator;

  state = {
    ...state,
    exposingHold: null,
    lastContestRound: currentRound
  };

  if (state.pinned && currentController) {
    await syncClashStateForPair(initiator, other, state);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: initiator }),
      content: renderClashCard({
        title: localize("DDA.Clash.Contest.Title"),
        lines: [
          formatI18n("DDA.Clash.Contest.PinAutomatic", {
            controller: escapeHtml(currentController.name),
            opponent: escapeHtml(currentOpponent?.name ?? "")
          })
        ],
        controllerActor: currentController,
        opponentActor: currentOpponent,
        includeButtons: true,
        clashId: state.id,
        extraClass: "dda-clash-contest-card"
      })
    });
    return { controller: currentController, automaticPin: true };
  }

  const initiatorBonus = getNextContestBonus(state, initiator.uuid);
  const otherBonus = getNextContestBonus(state, other.uuid);
  const initiatorRoll = await rollClashCheck(initiator, other, { bonus: initiatorBonus });
  if (!initiatorRoll) return null;
  const otherRoll = await rollClashCheck(other, initiator, { bonus: otherBonus });
  if (!otherRoll) return null;

  let controller = resolveController(initiator, other, initiatorRoll, otherRoll);
  if (controller.uuid === initiator.uuid && hasFearFrom(initiator, other)) controller = other;
  if (controller.uuid === other.uuid && hasFearFrom(other, initiator)) controller = initiator;
  const opponent = controller.uuid === initiator.uuid ? other : initiator;

  let nextContestBonus = foundry.utils.deepClone(state.nextContestBonus ?? {});
  nextContestBonus = setClashMapValue(nextContestBonus, initiator, 0);
  nextContestBonus = setClashMapValue(nextContestBonus, other, 0);

  state = {
    ...state,
    controllerUuid: controller.uuid,
    controllerName: controller.name,
    pinned: false,
    pinnedByUuid: "",
    nextContestBonus,
    lastContestRound: currentRound
  };

  const autoEndForSize = getSizeDifference(controller, opponent) <= -2 && !hasMonsterStrength(controller);
  if (!autoEndForSize) state = await maybeActivateExposingHold(controller, opponent, state);

  await syncClashStateForPair(initiator, other, state);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: initiator }),
    rolls: [initiatorRoll.roll, otherRoll.roll],
    content: renderClashCard({
      title: localize("DDA.Clash.Contest.Title"),
      lines: [
        formatI18n("DDA.Clash.RollSummaryDetailed", {
          initiator: escapeHtml(initiator.name),
          initiatorTotal: initiatorRoll.total,
          opponent: escapeHtml(other.name),
          opponentTotal: otherRoll.total
        }),
        formatI18n("DDA.Clash.Controller", { controller: escapeHtml(controller.name) }),
        ...(state.exposingHold?.active ? [formatI18n("DDA.Clash.ExposingHold.Active", { opponent: escapeHtml(opponent.name) })] : []),
        ...(autoEndForSize ? [localize("DDA.Clash.AutoEndTooSmall")] : [])
      ],
      controllerActor: autoEndForSize ? null : controller,
      opponentActor: autoEndForSize ? null : opponent,
      includeButtons: !autoEndForSize,
      clashId: state.id,
      extraClass: "dda-clash-contest-card"
    })
  });

  if (autoEndForSize) await endDigimonClash(controller, { reason: "size", clashId: state.id });
  return { controller, opponent, initiatorRoll, otherRoll, automatic };
}

async function processAutomaticClashContests(combat) {
  if (!isPrimaryActiveGM() || !combat?.started || Number(combat.round ?? 0) < 1) return;
  const actors = new Map();
  for (const combatant of combat.combatants ?? []) {
    if (combatant.actor) actors.set(combatant.actor.uuid, combatant.actor);
  }
  for (const actor of actors.values()) {
    if (!getActiveDDAUnitContext(actor, combat).allowed) continue;
    for (const state of getStoredClashStates(actor)) {
      if (!state.active || state.initiatorUuid !== actor.uuid) continue;
      await performClashContestForInitiator(actor, { automatic: true, clashId: state.id });
    }
  }
}

export async function clearClashStateForActor(actor, { reason = "formChange" } = {}) {
  if (!isDigimonLike(actor)) return false;

  const states = getStoredClashStates(actor);
  if (!states.length) {
    await updateActorClashState(actor, getInactiveClashState(reason), { replaceAll: true });
    return true;
  }

  for (const state of states) {
    const otherActor = await resolveActor(getOtherClashUuid(state, actor));
    await removeClashStateForPair(actor, otherActor, state, reason);
  }
  return true;
}

export async function endDigimonClash(
  actor,
  { reason = "manual", clashId = "", opponentUuid = "", all = false } = {}
) {
  if (!isDigimonLike(actor)) {
    ui.notifications.warn(localize("DDA.Warning.ClashOnlyForDigimon"));
    return null;
  }

  const states = getStoredClashStates(actor);
  if (!states.length) {
    ui.notifications.warn(localize("DDA.Warning.NoActiveClash"));
    return null;
  }

  let targets;
  if (all) {
    targets = states;
  } else if (!clashId && !opponentUuid && states.length > 1 && reason === "manual") {
    const selectedState = await chooseActiveClashState(actor);
    targets = selectedState?.active ? [selectedState] : [];
  } else {
    targets = [getClashState(actor, { clashId, opponentUuid })].filter((state) => state?.active);
  }

  if (!targets.length) {
    ui.notifications.warn(localize("DDA.Warning.NoActiveClash"));
    return null;
  }

  for (const state of targets) {
    const otherActor = await resolveActor(getOtherClashUuid(state, actor));
    await removeClashStateForPair(actor, otherActor, state, reason);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: renderClashCard({
        title: localize("DDA.Clash.EndTitle"),
        lines: [
          formatI18n("DDA.Clash.Ended", { a: escapeHtml(actor.name), b: escapeHtml(otherActor?.name ?? state.opponentName ?? "") }),
          formatI18n("DDA.Clash.EndReasonLabel", { reason: escapeHtml(localize(`DDA.Clash.EndReason.${reason}`)) })
        ],
        extraClass: "dda-clash-ended-card"
      })
    });

    otherActor?.sheet?.render(false);
  }

  actor.sheet?.render(false);
  return true;
}


function getSelectedActiveClashTarget(actor) {
  const targets = Array.from(game?.user?.targets ?? []);
  if (targets.length !== 1) return null;
  const targetToken = targets[0];
  const targetActor = targetToken?.actor;
  if (!isDigimonLike(targetActor) || !hasActiveClash(targetActor)) return null;
  const states = getStoredClashStates(targetActor).filter((state) => (
    ![state.initiatorUuid, state.opponentUuid].includes(actor?.uuid)
  ));
  if (!states.length) return null;
  return { targetToken, targetActor, states };
}

function getAdjacentBreakClashStates(actor, selected) {
  if (!selected) return [];
  const actorToken = getTokenObjectForActor(actor);
  const selectedToken = selected.targetToken?.object ?? selected.targetToken;
  const selectedDistance = getTokenDistanceSpaces(actorToken, selectedToken);
  return selected.states.filter((state) => {
    const otherToken = (canvas?.tokens?.placeables ?? []).find((token) => (
      token.actor?.uuid === getOtherClashUuid(state, selected.targetActor)
    ));
    const otherDistance = otherToken
      ? getTokenDistanceSpaces(actorToken, otherToken)
      : Number.POSITIVE_INFINITY;
    return Math.min(selectedDistance, otherDistance) <= 1;
  });
}

export function canAttemptBreakClash(actor) {
  if (!isDigimonLike(actor) || hasActiveClash(actor)) return false;
  const selected = getSelectedActiveClashTarget(actor);
  return getAdjacentBreakClashStates(actor, selected).length > 0;
}

async function rollClashSeparationCheck(
  actor,
  modifier,
  label,
  targetActor = null
) {
  const effectiveModifier =
    applyHackersMemoryDerivedStatModifier(
      actor,
      targetActor,
      Math.max(0, Number(modifier ?? 0))
    );

  const roll = await new Roll("3d6 + @modifier", {
    modifier: effectiveModifier
  }).evaluate();
  return {
    actor,
    label,
    roll,
    total: Number(roll.total ?? 0),
    modifier: effectiveModifier
  };
}

export async function breakClashFromOutside(actor) {
  if (!isDigimonLike(actor) || hasActiveClash(actor)) {
    ui.notifications.warn(localize("DDA.Warning.ClashBreakOutsideOnly"));
    return null;
  }

  const selected = getSelectedActiveClashTarget(actor);
  if (!selected) {
    ui.notifications.warn(localize("DDA.Warning.ClashBreakSelectParticipant"));
    return null;
  }

  const eligibleStates = getAdjacentBreakClashStates(actor, selected);
  if (!eligibleStates.length) {
    ui.notifications.warn(localize("DDA.Warning.ClashBreakMustBeAdjacent"));
    return null;
  }

  let state = eligibleStates[0];
  if (eligibleStates.length > 1) {
    const selectedId = await foundry.applications.api.DialogV2.prompt({
      classes: ["dda", "dda-clash-dialog", "dda-clash-quality-window"],
      window: { title: localize("DDA.Clash.Break.Title") },
      content: `<form class="dda-roll-dialog dda-clash-action-dialog dda-offensive-quality-dialog">
        <p>${text("O alvo participa de vários Clashes. Escolha qual deles separar.", "The target is in multiple Clashes. Choose which one to separate.")}</p>
        <div class="form-group"><label>${text("Clash", "Clash")}</label><select name="clashId">
          ${eligibleStates.map((candidate) => {
            const otherName = String(candidate.initiatorUuid ?? "") === String(selected.targetActor.uuid ?? "")
              ? candidate.opponentName
              : candidate.initiatorName;
            return `<option value="${escapeHtml(candidate.id)}">${escapeHtml(selected.targetActor.name)} × ${escapeHtml(otherName ?? "—")}</option>`;
          }).join("")}
        </select></div>
      </form>`,
      ok: {
        label: localize("DDA.Button.Confirm"),
        callback: (_event, button) => String(button.form?.elements?.clashId?.value ?? "")
      },
      rejectClose: false,
      modal: true
    });
    state = eligibleStates.find((candidate) => String(candidate.id) === String(selectedId ?? ""));
    if (!state) return null;
  }

  const other = await resolveActor(getOtherClashUuid(state, selected.targetActor));
  if (!other) {
    ui.notifications.warn(localize("DDA.Warning.ClashOpponentNotFound"));
    return null;
  }

  const controller = state.controllerUuid === selected.targetActor.uuid
    ? selected.targetActor
    : other;
  const opponent = controller.uuid === selected.targetActor.uuid
    ? other
    : selected.targetActor;

  const actorToken = getTokenObjectForActor(actor);
  const controllerToken = getTokenObjectForActor(controller);
  const opponentToken = getTokenObjectForActor(opponent);
  const adjacent = Math.min(
    getTokenDistanceSpaces(actorToken, controllerToken),
    getTokenDistanceSpaces(actorToken, opponentToken)
  ) <= 1;

  if (!adjacent) {
    ui.notifications.warn(localize("DDA.Warning.ClashBreakMustBeAdjacent"));
    return null;
  }

  const turnContext = getActiveDDAUnitContext(actor);
  if (!turnContext.allowed) {
    ui.notifications.warn(turnContext.ended
      ? localize("DDA.Warning.ClashParticipantEndedTurn")
      : localize("DDA.Warning.ClashNotActiveUnit"));
    return null;
  }

  const declaration = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-clash-dialog", "dda-clash-quality-window"],
    window: { title: localize("DDA.Clash.Break.Title") },
    position: { width: 580, height: "auto" },
    modal: true,
    content: `<form class="dda-clash-quality-form">
      <header class="dda-clash-quality-hero">
        <span>${escapeHtml(localize("DDA.Clash.Break.Kicker"))}</span>
        <h2>${escapeHtml(actor.name)}</h2>
        <p>${formatI18n("DDA.Clash.Break.Prompt", {
          controller: escapeHtml(controller.name),
          opponent: escapeHtml(opponent.name)
        })}</p>
      </header>
      <label class="dda-clash-choice">
        <input type="checkbox" name="opponentWilling">
        <span>${formatI18n("DDA.Clash.Break.OpponentWilling", { opponent: escapeHtml(opponent.name) })}</span>
      </label>
    </form>`,
    buttons: [
      {
        action: "confirm",
        label: localize("DDA.Clash.Break.Action"),
        default: true,
        callback: (_event, button) => ({
          opponentWilling: Boolean(button.form?.elements?.opponentWilling?.checked)
        })
      },
      { action: "cancel", label: localize("DDA.Button.Cancel"), callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });

  if (!declaration) return null;

  const payment = await spendActorActions(actor, 2, {
    requireActiveUnit: true,
    notify: true
  });
  if (!payment) return null;

  const separatorCheck = await rollClashSeparationCheck(
    actor,
    getCpuTotal(actor),
    localize("DDA.Clash.Break.SeparatorCheck"),
    controller
  );
  const allyCheck = declaration.opponentWilling
    ? await rollClashSeparationCheck(
        opponent,
        getCpuTotal(opponent),
        localize("DDA.Clash.Break.WillingOpponentCheck"),
        controller
      )
    : null;
  const controllerCheck = await rollClashSeparationCheck(
    controller,
    getRamTotal(controller),
    localize("DDA.Clash.Break.ControllerCheck"),
    actor
  );

  const bestCpu = Math.max(
    separatorCheck.total,
    Number(allyCheck?.total ?? Number.NEGATIVE_INFINITY)
  );
  const separated = bestCpu > controllerCheck.total;

  if (separated) {
    await endDigimonClash(controller, { reason: "priedApart", clashId: state.id });
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [separatorCheck.roll, allyCheck?.roll, controllerCheck.roll].filter(Boolean),
    content: renderClashCard({
      title: localize("DDA.Clash.Break.Title"),
      lines: [
        formatI18n("DDA.Clash.Break.CheckLine", {
          actor: escapeHtml(actor.name),
          stat: "CPU",
          total: separatorCheck.total
        }),
        ...(allyCheck ? [formatI18n("DDA.Clash.Break.CheckLine", {
          actor: escapeHtml(opponent.name),
          stat: "CPU",
          total: allyCheck.total
        })] : []),
        formatI18n("DDA.Clash.Break.CheckLine", {
          actor: escapeHtml(controller.name),
          stat: "RAM",
          total: controllerCheck.total
        }),
        separated
          ? localize("DDA.Clash.Break.Success")
          : localize("DDA.Clash.Break.Failure")
      ],
      controllerActor: separated ? null : controller,
      opponentActor: separated ? null : opponent,
      includeButtons: !separated,
      clashId: state.id,
      extraClass: `dda-clash-break-card ${separated ? "is-success" : "is-failure"}`
    })
  });

  return {
    separated,
    separatorCheck,
    allyCheck,
    controllerCheck,
    payment
  };
}

async function chooseActiveClashState(actor, { clashId = "" } = {}) {
  const states = getStoredClashStates(actor);
  if (!states.length) return null;

  if (clashId) {
    const exact = states.find((state) => String(state.id ?? "") === String(clashId));
    if (exact) return exact;
  }

  const targeted = Array.from(game?.user?.targets ?? []);
  if (targeted.length === 1) {
    const targetUuid = targeted[0]?.actor?.uuid ?? "";
    const targetedState = states.find((state) => String(getOtherClashUuid(state, actor)) === String(targetUuid));
    if (targetedState) return targetedState;
  }

  if (states.length === 1) return states[0];

  try {
    const selectedId = await foundry.applications.api.DialogV2.prompt({
      classes: ["dda", "dda-clash-dialog", "dda-clash-quality-window"],
      window: { title: text("Escolher Clash", "Choose Clash") },
      content: `<form class="dda-roll-dialog dda-clash-action-dialog dda-offensive-quality-dialog">
        <p>${text(
          "Este Digimon está em vários Clashes. Escolha qual relação deseja resolver.",
          "This Digimon is in multiple Clashes. Choose which relationship to resolve."
        )}</p>
        <div class="form-group"><label>${text("Oponente", "Opponent")}</label><select name="clashId">
          ${states.map((state) => {
            const otherName = String(state.initiatorUuid ?? "") === String(actor.uuid ?? "")
              ? state.opponentName
              : state.initiatorName;
            const role = getRoleFor(actor, state) === "controller"
              ? localize("DDA.Clash.Role.Controller")
              : localize("DDA.Clash.Role.Opponent");
            return `<option value="${escapeHtml(state.id)}">${escapeHtml(otherName ?? "—")} — ${escapeHtml(role)}</option>`;
          }).join("")}
        </select></div>
      </form>`,
      ok: {
        label: localize("DDA.Button.Confirm"),
        callback: (_event, button) => String(button.form?.elements?.clashId?.value ?? "")
      },
      rejectClose: false,
      modal: true
    });
    return states.find((state) => String(state.id ?? "") === String(selectedId ?? "")) ?? null;
  } catch (_error) {
    return null;
  }
}

export async function openDigimonClashActionMenu(actor, { clashId = "" } = {}) {
  if (!isDigimonLike(actor)) {
    ui.notifications.warn(localize("DDA.Warning.ClashOnlyForDigimon"));
    return null;
  }

  const charmGate = game?.dda?.bossQualities?.ensureCharmActionController;
  if (typeof charmGate === "function" && !charmGate(actor, { user: game?.user, notify: true })) return null;

  const state = await chooseActiveClashState(actor, { clashId });
  if (!state?.active) {
    ui.notifications.warn(localize("DDA.Warning.NoActiveClash"));
    return null;
  }

  const action = await promptClashAction(actor, state);
  if (!action) return null;

  return executeClashAction(actor, action, { clashId: state.id });
}

export async function executeClashAction(actor, action, { clashId = "" } = {}) {
  const charmGate = game?.dda?.bossQualities?.ensureCharmActionController;
  if (typeof charmGate === "function" && !charmGate(actor, { user: game?.user, notify: true })) return null;

  const state = await chooseActiveClashState(actor, { clashId });
  if (!state?.active) {
    ui.notifications.warn(localize("DDA.Warning.NoActiveClash"));
    return null;
  }

  const role = getRoleFor(actor, state);
  const otherActor = await resolveActor(getOtherClashUuid(state, actor));
  if (!otherActor) {
    ui.notifications.warn(localize("DDA.Warning.ClashOpponentNotFound"));
    return null;
  }

  if (action === "end") {
    if (role !== "controller") {
      ui.notifications.warn(localize("DDA.Warning.ClashOnlyControllerCanEnd"));
      return null;
    }
    return endDigimonClash(actor, { reason: "controller", clashId: state.id });
  }

  if (role === "controller") {
    return executePrimaryClashAction(actor, otherActor, state, action);
  }

  return executeSecondaryClashAction(actor, otherActor, state, action);
}

function getActorMovement(actor) {
  return Math.max(0, Number(
    actor?.system?.movement?.land?.total ??
    actor?.system?.movement?.land?.value ??
    actor?.system?.derived?.movement?.value ??
    actor?.system?.miscStats?.movement?.total ??
    actor?.system?.miscStats?.movement?.value ??
    actor?.system?.miscStats?.movement?.base ??
    0
  ));
}

function getPinUseState(actor) {
  const entry = actor?.system?.combat?.clashPinUses ?? {};
  const sameCombat = String(entry.combatId ?? "") === String(game?.combat?.id ?? "");
  return {
    combatId: game?.combat?.id ?? "",
    value: sameCombat ? Math.max(0, Number(entry.value ?? 0)) : 0,
    max: 3
  };
}

async function spendPinUse(actor) {
  const state = getPinUseState(actor);
  if (state.value >= state.max) return null;
  const next = { ...state, value: state.value + 1 };
  await updateActorData(actor, { "system.combat.clashPinUses": next });
  return next;
}

function getFinisherTargetState(actor) {
  const data = actor?.system?.combat?.clashFinisherTargets ?? {};
  return String(data.combatId ?? "") === String(game?.combat?.id ?? "")
    ? foundry.utils.deepClone(data)
    : { combatId: game?.combat?.id ?? "", targets: {} };
}

function hasUsedFinisherOn(actor, target) {
  return Boolean(getFinisherTargetState(actor).targets?.[getClashMapKey(target)]);
}

async function markFinisherTarget(actor, target) {
  const data = getFinisherTargetState(actor);
  data.targets ??= {};
  data.targets[getClashMapKey(target)] = {
    targetUuid: target.uuid,
    targetName: target.name,
    usedAt: new Date().toISOString()
  };
  await updateActorData(actor, { "system.combat.clashFinisherTargets": data });
}

async function chooseMonsterStrengthMove(controller, opponent) {
  if (!hasMonsterStrength(controller)) return { drag: false };
  const canAttempt = getSizeDifference(controller, opponent) >= 0 || hasTitanPower(controller);
  if (!canAttempt) return { drag: false };

  return foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-clash-dialog", "dda-clash-quality-window"],
    window: { title: localize("DDA.Clash.MonsterStrength.Title") },
    position: { width: 560, height: "auto" },
    modal: true,
    content: `<form class="dda-clash-quality-form">
      <header class="dda-clash-quality-hero"><span>${escapeHtml(localize("DDA.Clash.Action.Primary.Move"))}</span><h2>${escapeHtml(controller.name)}</h2><p>${formatI18n("DDA.Clash.MonsterStrength.MovePrompt", { opponent: escapeHtml(opponent.name) })}</p></header>
      <label class="dda-clash-choice"><input type="radio" name="mode" value="none" checked><span>${escapeHtml(localize("DDA.Clash.MonsterStrength.MoveAlone"))}</span></label>
      <label class="dda-clash-choice"><input type="radio" name="mode" value="cpu"><span>${escapeHtml(localize("DDA.Clash.MonsterStrength.CpuCheck"))}</span></label>
      <label class="dda-clash-choice"><input type="radio" name="mode" value="clash"><span>${escapeHtml(localize("DDA.Clash.MonsterStrength.ClashCheck"))}</span></label>
    </form>`,
    buttons: [
      { action: "confirm", label: localize("DDA.Button.Confirm"), default: true, callback: (_event, button) => ({ mode: String(button.form?.elements?.mode?.value ?? "none") }) },
      { action: "cancel", label: localize("DDA.Button.Cancel"), callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });
}

async function executeClashMoveAction(controller, opponent, state) {
  const choice = await chooseMonsterStrengthMove(controller, opponent);
  if (choice === null) return null;

  const spent = await spendClashAction(controller, opponent, state, "move");
  if (!spent) return null;
  state = spent.state;

  let drag = false;
  let fullMovement = true;
  let check = null;

  if (choice?.mode === "cpu") {
    check = await rollDerivedCheck(controller, "cpu", {
      skillKey: "featsOfStrength",
      tn: 10 + getCpuTotal(opponent),
      title: localize("DDA.Clash.MonsterStrength.Title"),
      targetActor: opponent
    });
    drag = Boolean(check?.success);
    fullMovement = Boolean(check?.criticalSuccess);
  } else if (choice?.mode === "clash") {
    check = await rollFixedCheck(
      controller,
      getClashTotal(controller) + getBrawlerClashBonus(controller),
      10 + getClashTotal(opponent),
      localize("DDA.Clash.MonsterStrength.Title"),
      "dda-clash-card",
      { targetActor: opponent }
    );
    drag = Boolean(check?.success);
    fullMovement = Boolean(check?.criticalSuccess);
  }

  const movement = getActorMovement(controller);
  const maximum = drag && !fullMovement ? Math.floor(movement / 2) : movement;
  const moverToken = getTokenObjectForActor(controller);
  const followerToken = drag ? getTokenObjectForActor(opponent) : null;
  const nextState = {
    ...state,
    clashMove: {
      active: true,
      moverUuid: controller.uuid,
      followerUuid: drag ? opponent.uuid : "",
      maximum,
      maximumDistance: getStateMaximumClashDistance(state, controller, opponent),
      kind: drag ? "monsterStrength" : "reposition",
      offsetX: followerToken && moverToken ? Number(followerToken.document.x ?? 0) - Number(moverToken.document.x ?? 0) : 0,
      offsetY: followerToken && moverToken ? Number(followerToken.document.y ?? 0) - Number(moverToken.document.y ?? 0) : 0,
      turnSignature: getCombatTurnSignature(),
      startedAt: Date.now()
    }
  };
  await syncClashStateForPair(controller, opponent, nextState);
  await game.dda?.movementTracker?.grantMovement?.(controller, maximum, {
    kind: "clash-move",
    actionCost: 0,
    source: "clashMove",
    sourceActorUuid: controller.uuid,
    sourceActorName: controller.name,
    label: localize("DDA.Clash.Action.Primary.Move")
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: controller }),
    content: renderClashCard({
      title: localize("DDA.Clash.Action.Primary.Move"),
      lines: [formatI18n(
        drag ? "DDA.Clash.ActionResult.MoveDragging" : "DDA.Clash.ActionResult.Move",
        { controller: escapeHtml(controller.name), opponent: escapeHtml(opponent.name), spaces: maximum }
      )],
      controllerActor: controller,
      opponentActor: opponent,
      includeButtons: true,
      clashId: state.id
    })
  });
  return { moved: true, drag, maximum, check };
}

function makeThrowAttack(controller, opponent, { area = false } = {}) {
  const powerThrowBonus = hasPowerThrow(controller) ? getCpuTotal(controller) : 0;
  return {
    id: `clash-throw-${foundry.utils.randomID()}`,
    uuid: "",
    name: formatI18n("DDA.Clash.Throw.AttackName", { target: opponent.name }),
    type: "attack",
    system: {
      baseTags: { rangeType: "range", functionType: "damage", tags: [] },
      actionCost: { value: 1, extra: 0 },
      accuracy: { baseFormula: "" },
      damage: { enabled: true, baseFormula: "", bonus: powerThrowBonus, unalterable: 0 },
      effectTag: { enabled: false, tag: "" },
      qualityTags: area ? ["t:blast"] : [],
      tags: area ? ["t:blast"] : [],
      isSignature: false
    }
  };
}

async function chooseThrowTarget(controller, opponent, distance) {
  const controllerToken = getTokenObjectForActor(controller);
  const candidates = (canvas?.tokens?.placeables ?? [])
    .filter((token) => token.actor && token.actor.uuid !== controller.uuid && token.actor.uuid !== opponent.uuid)
    .filter((token) => getTokenDistanceSpaces(controllerToken, token) <= distance);

  return foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-clash-dialog", "dda-clash-quality-window"],
    window: { title: localize("DDA.Clash.Action.Primary.Throw") },
    position: { width: 560, height: "auto" },
    modal: true,
    content: `<form class="dda-clash-quality-form">
      <header class="dda-clash-quality-hero"><span>${escapeHtml(localize("DDA.Clash.Action.Primary.Throw"))}</span><h2>${escapeHtml(opponent.name)}</h2><p>${formatI18n("DDA.Clash.Throw.Prompt", { spaces: distance })}</p><p class="hint">${escapeHtml(text(
        `Crash: se o arremesso colidir após percorrer pelo menos ${Math.ceil(distance / 2)} Espaços e antes de completar ${distance}, o Dano bruto é igual aos Espaços que faltaram.`,
        `Crash: if the throw collides after travelling at least ${Math.ceil(distance / 2)} Spaces but before completing ${distance}, raw Damage equals the untravelled Spaces.`
      ))}</p></header>
      <div class="form-group"><label>${escapeHtml(localize("DDA.Clash.Throw.Target"))}</label><select name="targetId"><option value="">${escapeHtml(localize("DDA.Clash.Throw.NoAttack"))}</option><option value="__AREA__">${escapeHtml(text("Grupo de inimigos — Ataque em Área", "Group of enemies — Area Attack"))}</option>${candidates.map((token) => `<option value="${escapeHtml(token.id)}">${escapeHtml(token.name)}</option>`).join("")}</select></div>
    </form>`,
    buttons: [
      { action: "confirm", label: localize("DDA.Button.Confirm"), default: true, callback: (_event, button) => String(button.form?.elements?.targetId?.value ?? "") },
      { action: "cancel", label: localize("DDA.Button.Cancel"), callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });
}

async function executeClashThrowAction(controller, opponent, state, { alreadySpent = false, finisher = false } = {}) {
  const sizeDifference = getSizeDifference(controller, opponent);
  if (sizeDifference <= -2 && !hasTitanPower(controller)) {
    ui.notifications.warn(localize("DDA.Warning.ClashThrowTargetTooLarge"));
    return null;
  }

  const baseDistance = 3 + getCpuTotal(controller);
  const distance = baseDistance + (hasPowerThrow(controller) ? 3 : 0);
  const targetId = await chooseThrowTarget(controller, opponent, distance);
  if (targetId === null) return null;

  if (!alreadySpent) {
    const spent = await spendClashAction(controller, opponent, state, "throw");
    if (!spent) return null;
    state = spent.state;
  }

  const thrownToken = getTokenObjectForActor(opponent);
  await endDigimonClash(controller, { reason: finisher ? "finisherThrow" : "throw", clashId: state.id });
  await game.dda?.movementTracker?.grantMovement?.(opponent, distance, {
    kind: "clash-throw",
    actionCost: 0,
    source: "clashThrow",
    sourceActorUuid: controller.uuid,
    sourceActorName: controller.name,
    label: localize("DDA.Clash.Action.Primary.Throw")
  });
  thrownToken?.control?.({ releaseOthers: true });

  let attackResult = null;
  const areaThrow = targetId === "__AREA__";
  const targetToken = !areaThrow && targetId ? canvas?.tokens?.get(targetId) : null;
  const thrownSizeKey = String(opponent?.system?.size ?? "medium").trim().toLowerCase();
  const thrownSize = ({
    small: 1,
    medium: 1,
    large: 2,
    huge: 3,
    gigantic: 4,
    colossal: 5
  })[thrownSizeKey] ?? Math.max(
    1,
    Math.round(Number(thrownToken?.document?.width ?? 1)),
    Math.round(Number(thrownToken?.document?.height ?? 1))
  );

  if (targetToken || areaThrow) {
    attackResult = await rollAttack(controller, makeThrowAttack(controller, opponent, { area: areaThrow }), {
      ...(targetToken ? { targetToken } : {}),
      actionCostOverride: 0,
      allowOutOfTurn: isOutOfTurnClashParticipant(controller, state),
      areaAttackActive: areaThrow ? undefined : false,
      areaAttackForcedTag: areaThrow ? "t:blast" : "",
      areaAttackFixedSize: areaThrow ? thrownSize : 0,
      rangeOverride: distance,
      accuracyDiceModifier: getCpuTotal(controller),
      ignoreTargetingValidation: true,
      allowAttackWhileClashing: true,
      suppressChargeMovement: true,
      ignoreAttackPerRoundLimit: Boolean(finisher),
      skipAttackUseTracking: Boolean(finisher)
    });
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: controller }),
    content: renderClashCard({
      title: localize("DDA.Clash.Action.Primary.Throw"),
      lines: [
        formatI18n("DDA.Clash.ActionResult.Throw", { controller: escapeHtml(controller.name), opponent: escapeHtml(opponent.name), distance }),
        formatI18n("DDA.Clash.Throw.AccuracyBonus", { bonus: getCpuTotal(controller) }),
        ...(areaThrow ? [text(`O Digimon arremessado gera um Ataque [RANGE] em Área de tamanho ${thrownSize}.`, `The thrown Digimon creates a [RANGE] Area Attack of Size ${thrownSize}.`)] : []),
        hasPowerThrow(controller)
          ? formatI18n("DDA.Clash.PowerThrow.Active", { bonus: getCpuTotal(controller) })
          : localize("DDA.Clash.Throw.CrashAssisted")
      ],
      extraClass: "dda-clash-action-result-card"
    })
  });
  return { distance, attackResult, targetToken };
}

async function chooseFinisherBenefit() {
  return foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-clash-dialog", "dda-clash-quality-window"],
    window: { title: localize("DDA.Clash.Action.Primary.Finisher") },
    position: { width: 580, height: "auto" },
    modal: true,
    content: `<form class="dda-clash-quality-form">
      <label class="dda-clash-choice"><input type="radio" name="benefit" value="secondAttack" checked><span>${escapeHtml(localize("DDA.Clash.Finisher.SecondAttack"))}</span></label>
      <label class="dda-clash-choice"><input type="radio" name="benefit" value="throw"><span>${escapeHtml(localize("DDA.Clash.Finisher.Throw"))}</span></label>
      <label class="dda-clash-choice"><input type="radio" name="benefit" value="jump"><span>${escapeHtml(localize("DDA.Clash.Finisher.Jump"))}</span></label>
      <label class="dda-clash-choice"><input type="radio" name="benefit" value="custom"><span>${escapeHtml(localize("DDA.Clash.Finisher.Custom"))}</span></label>
    </form>`,
    buttons: [
      { action: "confirm", label: localize("DDA.Button.Confirm"), default: true, callback: (_event, button) => String(button.form?.elements?.benefit?.value ?? "secondAttack") },
      { action: "cancel", label: localize("DDA.Button.Cancel"), callback: () => "custom" }
    ],
    rejectClose: false,
    close: () => "custom"
  });
}

async function executeClashFinisher(controller, opponent, state) {
  if (!hasWrestlemania(controller)) {
    ui.notifications.warn(localize("DDA.Warning.ClashFinisherRequiresWrestlemania"));
    return null;
  }
  if (hasUsedFinisherOn(controller, opponent)) {
    ui.notifications.warn(localize("DDA.Warning.ClashFinisherTargetAlreadyUsed"));
    return null;
  }
  const attackItem = await promptClashAttackItem(controller, { weakAttack: false });
  if (!attackItem) return null;
  const spent = await spendClashAction(controller, opponent, state, "finisher");
  if (!spent) return null;
  state = spent.state;

  const targetToken = getTokenObjectForActor(opponent);
  if (!targetToken) return null;
  const battery = attackItem.system?.isSignature
    ? Math.max(0, Number(controller.system?.resources?.battery?.value ?? 0))
    : 0;
  const option = await chooseClashCheckOption(controller, opponent, { bonus: battery, purpose: "damage" });
  if (!option) return null;
  const tn = 12 + Math.max(getCpuTotal(opponent), getRamTotal(opponent));
  const check = await rollFixedCheck(
    controller,
    option.modifier,
    tn,
    localize("DDA.Clash.Action.Primary.Finisher"),
    "dda-clash-card",
    { targetActor: opponent }
  );
  const benefit = check.success ? await chooseFinisherBenefit() : "";

  const attackResult = await rollAttack(controller, attackItem, {
    targetToken,
    actionCostOverride: 0,
    allowOutOfTurn: isOutOfTurnClashParticipant(controller, state),
    areaAttackActive: false,
    allowAttackWhileClashing: true,
    accuracyPoolMultiplier: check.criticalFailure ? 0.5 : 1,
    flatDamageBonus: check.criticalSuccess && getAttackFunctionType(attackItem) === "damage" ? 3 : 0,
    clashContext: {
      active: true,
      enabled: true,
      clashId: state.id,
      action: "finisher",
      halveDodge: true,
      finisher: true
    }
  });

  await markFinisherTarget(controller, opponent);

  let followUp = null;
  if (check.success && benefit === "throw") {
    followUp = await executeClashThrowAction(controller, opponent, state, { alreadySpent: true, finisher: true });
  } else {
    await endDigimonClash(controller, { reason: "finisher", clashId: state.id });
  }

  if (check.success && benefit === "secondAttack") {
    const secondAttack = await promptClashAttackItem(controller, { weakAttack: false });
    if (secondAttack) {
      followUp = await rollAttack(controller, secondAttack, {
        targetToken,
        actionCostOverride: 0,
        allowOutOfTurn: isOutOfTurnClashParticipant(controller, state),
        areaAttackActive: false,
        ignoreAttackPerRoundLimit: true,
        skipAttackUseTracking: true,
        suppressChargeMovement: true
      });
    }
  } else if (check.success && ["jump", "custom"].includes(benefit)) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: controller }),
      content: renderClashCard({
        title: localize("DDA.Clash.Action.Primary.Finisher"),
        lines: [localize(benefit === "jump" ? "DDA.Clash.Finisher.JumpAssisted" : "DDA.Clash.Finisher.CustomAssisted")],
        extraClass: "dda-clash-action-result-card"
      })
    });
  }
  return { check, attackResult, benefit, followUp };
}

async function executePrimaryClashAction(controller, opponent, state, action) {
  if (action === "pin") {
    if (state.exposingHold?.active && state.exposingHold.pinBlockedTurnSignature === getCombatTurnSignature()) {
      ui.notifications.warn(localize("DDA.Warning.ClashPinBlockedByExposingHold"));
      return null;
    }
    if (getPinUseState(controller).value >= 3) {
      ui.notifications.warn(localize("DDA.Warning.ClashPinLimitReached"));
      return null;
    }
    const spent = await spendClashAction(controller, opponent, state, action);
    if (!spent) return null;
    const pinUse = await spendPinUse(controller);
    if (!pinUse) return null;
    const nextState = {
      ...spent.state,
      pinned: true,
      pinnedByUuid: controller.uuid,
      controllerUuid: controller.uuid,
      controllerName: controller.name
    };
    await syncClashStateForPair(controller, opponent, nextState);

    const controllerToken = getTokenObjectForActor(controller);
    const opponentToken = getTokenObjectForActor(opponent);
    const airborne = Number(controllerToken?.document?.elevation ?? 0) > 0 || Number(opponentToken?.document?.elevation ?? 0) > 0;
    if (airborne) {
      await Promise.all([
        controllerToken ? updateClashToken(controllerToken.document, { elevation: 0 }, { animate: true, ddaClashPinFall: true }) : null,
        opponentToken ? updateClashToken(opponentToken.document, { elevation: 0 }, { animate: true, ddaClashPinFall: true }) : null
      ].filter(Boolean));
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: controller }),
      content: renderClashCard({
        title: localize("DDA.Clash.Action.Primary.Pin"),
        lines: [
          formatI18n("DDA.Clash.ActionResult.Pin", { controller: escapeHtml(controller.name), opponent: escapeHtml(opponent.name), uses: pinUse.value }),
          ...(airborne ? [localize("DDA.Clash.Pin.AirborneCrashAssisted")] : [])
        ],
        controllerActor: controller,
        opponentActor: opponent,
        includeButtons: true,
        clashId: nextState.id
      })
    });
    return true;
  }

  if (action === "throw") return executeClashThrowAction(controller, opponent, state);
  if (action === "pull") return executeExtendedGrapplePull(controller, opponent, state);
  if (action === "attack") return executeClashAttack(controller, opponent, state, action);
  if (action === "move") return executeClashMoveAction(controller, opponent, state);
  if (action === "finisher") return executeClashFinisher(controller, opponent, state);

  ui.notifications.warn(localize("DDA.Warning.ClashUnknownAction"));
  return null;
}


async function executeSecondaryClashAction(opponent, controller, state, action) {
  if (action === "comeback") {
    if (state.pinned) {
      ui.notifications.warn(localize("DDA.Warning.ClashComebackWhilePinned"));
      return null;
    }
    if (state.initiatorUuid === opponent.uuid && getActionCount(state, opponent.uuid) <= 0) {
      ui.notifications.warn(localize("DDA.Warning.ClashComebackNotFirstInitiatorAction"));
      return null;
    }
    const spent = await spendClashAction(opponent, controller, state, action);
    if (!spent) return null;
    state = spent.state;
    let nextContestBonus = foundry.utils.deepClone(state.nextContestBonus ?? {});
    nextContestBonus = setClashMapValue(nextContestBonus, opponent, Number(getClashMapValue(nextContestBonus, opponent, 0)) + 3);
    const nextState = { ...state, nextContestBonus };
    await syncClashStateForPair(opponent, controller, nextState);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: opponent }),
      content: renderClashCard({
        title: localize("DDA.Clash.Action.Secondary.Comeback"),
        lines: [formatI18n("DDA.Clash.ActionResult.Comeback", { opponent: escapeHtml(opponent.name) })],
        controllerActor: controller,
        opponentActor: opponent,
        includeButtons: true,
        clashId: nextState.id
      })
    });
    return true;
  }

  if (action === "contestPin") {
    if (!state.pinned) {
      ui.notifications.warn(localize("DDA.Warning.ClashNotPinned"));
      return null;
    }
    const spent = await spendClashAction(opponent, controller, state, action);
    if (!spent) return null;
    state = spent.state;
    const tn = 12 + getCpuTotal(controller);
    const statValue = getBestCpuOrRam(opponent);
    const result = await rollFixedCheck(
      opponent,
      statValue,
      tn,
      localize("DDA.Clash.Action.Secondary.ContestPin"),
      "dda-clash-card",
      { targetActor: controller }
    );
    let nextState = state;
    if (result.success) {
      let nextContestBonus = foundry.utils.deepClone(state.nextContestBonus ?? {});
      nextContestBonus = setClashMapValue(nextContestBonus, opponent, Number(getClashMapValue(nextContestBonus, opponent, 0)) + 2);
      nextState = { ...state, pinned: false, pinnedByUuid: "", nextContestBonus };
    }
    await syncClashStateForPair(opponent, controller, nextState);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: opponent }),
      content: renderClashCard({
        title: localize("DDA.Clash.Action.Secondary.ContestPin"),
        lines: [result.success
          ? formatI18n("DDA.Clash.ActionResult.ContestPinSuccess", { opponent: escapeHtml(opponent.name) })
          : formatI18n("DDA.Clash.ActionResult.ContestPinFailure", { opponent: escapeHtml(opponent.name) })],
        controllerActor: controller,
        opponentActor: opponent,
        includeButtons: true,
        clashId: nextState.id
      })
    });
    return result;
  }

  if (action === "escape") {
    if (state.pinned) {
      ui.notifications.warn(localize("DDA.Warning.ClashEscapeWhilePinned"));
      return null;
    }
    const spent = await spendClashAction(opponent, controller, state, action);
    if (!spent) return null;
    state = spent.state;

    if (isFlexibleDigizoidWeaponEscapeAutomatic(opponent)) {
      await blockClashPairUntilNextRound(
        state.initiatorUuid === controller.uuid ? controller : opponent,
        state.initiatorUuid === controller.uuid ? opponent : controller,
        "flexibleDigizoidWeaponry"
      );
      await endDigimonClash(opponent, { reason: "escape", clashId: state.id });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: opponent }),
        content: renderClashCard({
          title: localize("DDA.Clash.Action.Secondary.Escape"),
          lines: [String(game.i18n?.lang ?? "").toLowerCase().startsWith("en")
            ? `${escapeHtml(opponent.name)} automatically escaped through Flexible Digizoid Weaponry.`
            : `${escapeHtml(opponent.name)} escapou automaticamente por Armamento de Digizóide Flexível.`],
          extraClass: "dda-clash-action-result-card is-success"
        })
      });
      return { winner: opponent, automatic: true, quality: "flexibleDigizoidWeaponry" };
    }

    const opponentBonus = getNextContestBonus(state, opponent.uuid);
    const controllerBonus = getNextContestBonus(state, controller.uuid);
    const slipperyRoll = await rollSlipperyCheck(opponent, controller, { bonus: opponentBonus, prompt: true });
    const opponentRoll = slipperyRoll ?? await rollClashCheck(opponent, controller, { bonus: opponentBonus });
    const controllerRoll = await rollClashCheck(controller, opponent, { bonus: controllerBonus });
    if (!opponentRoll || !controllerRoll) return null;
    const winner = resolveController(opponent, controller, opponentRoll, controllerRoll);

    if (winner.uuid === opponent.uuid) {
      await blockClashPairUntilNextRound(state.initiatorUuid === controller.uuid ? controller : opponent, state.initiatorUuid === controller.uuid ? opponent : controller, slipperyRoll ? "slippery" : "escape");
      await endDigimonClash(opponent, { reason: slipperyRoll ? "slippery" : "escape", clashId: state.id });
    } else {
      let nextContestBonus = foundry.utils.deepClone(state.nextContestBonus ?? {});
      nextContestBonus = setClashMapValue(nextContestBonus, opponent, 0);
      nextContestBonus = setClashMapValue(nextContestBonus, controller, 0);
      await syncClashStateForPair(opponent, controller, { ...state, nextContestBonus });
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: opponent }),
      content: renderClashCard({
        title: localize("DDA.Clash.Action.Secondary.Escape"),
        lines: [
          formatI18n("DDA.Clash.RollSummaryDetailed", {
            initiator: escapeHtml(opponent.name), initiatorTotal: opponentRoll.total,
            opponent: escapeHtml(controller.name), opponentTotal: controllerRoll.total
          }),
          winner.uuid === opponent.uuid
            ? formatI18n("DDA.Clash.ActionResult.EscapeSuccess", { opponent: escapeHtml(opponent.name) })
            : formatI18n("DDA.Clash.ActionResult.EscapeFailure", { opponent: escapeHtml(opponent.name), controller: escapeHtml(controller.name) })
        ],
        controllerActor: winner.uuid === opponent.uuid ? null : controller,
        opponentActor: winner.uuid === opponent.uuid ? null : opponent,
        includeButtons: winner.uuid !== opponent.uuid,
        clashId: state.id
      })
    });
    return { winner, opponentRoll, controllerRoll, slippery: Boolean(slipperyRoll) };
  }

  if (action === "teleport") {
    if (!hasTeleport(opponent)) {
      ui.notifications.warn(localize("DDA.Warning.ClashTeleportUnavailable"));
      return null;
    }
    const spent = await spendClashAction(opponent, controller, state, action);
    if (!spent) return null;
    const { useTeleportClashEscape } = await import("./utility-qualities.js");
    const teleportResult = await useTeleportClashEscape(opponent);
    if (!teleportResult?.used) return null;
    await endDigimonClash(opponent, { reason: "teleport", clashId: state.id });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: opponent }),
      content: renderClashCard({
        title: localize("DDA.Clash.Action.Secondary.Teleport"),
        lines: [formatI18n("DDA.Clash.ActionResult.Teleport", { opponent: escapeHtml(opponent.name) })],
        extraClass: "dda-clash-action-result-card"
      })
    });
    return teleportResult;
  }

  if (action === "weakAttack") return executeClashAttack(opponent, controller, state, action, { weakAttack: true });

  ui.notifications.warn(localize("DDA.Warning.ClashUnknownAction"));
  return null;
}


export async function handleClashChatAction(event) {
  event.preventDefault();

  const button = event.currentTarget;
  const actor = await resolveActor(button?.dataset?.actorUuid);
  if (!actor) {
    ui.notifications.warn(localize("DDA.Warning.ActorNotFound"));
    return null;
  }

  const action = button?.dataset?.clashAction ?? "menu";
  const clashId = String(button?.dataset?.clashId ?? "");
  if (action === "menu") return openDigimonClashActionMenu(actor, { clashId });
  return executeClashAction(actor, action, { clashId });
}

function getTokenDocumentForActor(actor) {
  return getTokenObjectForActor(actor)?.document ?? null;
}

function getDocumentDistanceSpaces(leftDocument, leftChange = {}, rightDocument, rightChange = {}) {
  return getTokenDocumentGridDistance(leftDocument, rightDocument, {
    leftChange,
    rightChange
  });
}

async function followClashMove(document, changed, options = {}) {
  if (options.ddaClashMoveFollower || options.ddaClashForcedMovement || options.ddaDistantForce) return;
  if (!("x" in changed || "y" in changed || "elevation" in changed)) return;
  const actor = document.actor;
  const state = getStoredClashStates(actor).find((candidate) => (
    candidate?.clashMove?.active && candidate.clashMove.moverUuid === actor?.uuid
  ));
  const move = state?.clashMove ?? {};
  if (!state?.active || !move.active || !move.followerUuid) return;
  const follower = await resolveActor(move.followerUuid);
  const followerDocument = getTokenDocumentForActor(follower);
  if (!followerDocument) return;
  await updateClashToken(followerDocument, {
    ...(Object.hasOwn(changed, "x") ? { x: Number(changed.x) + Number(move.offsetX ?? 0) } : {}),
    ...(Object.hasOwn(changed, "y") ? { y: Number(changed.y) + Number(move.offsetY ?? 0) } : {}),
    ...(Object.hasOwn(changed, "elevation") ? { elevation: changed.elevation } : {})
  }, { animate: false, ddaClashMoveFollower: true });
}

async function clearExpiredClashMoves(combat) {
  if (!isPrimaryActiveGM() || !combat?.started) return;
  const signature = getCombatTurnSignature();
  const processed = new Set();
  for (const combatant of combat.combatants ?? []) {
    const actor = combatant.actor;
    for (const state of getStoredClashStates(actor)) {
      if (!state.active || !state.clashMove?.active || processed.has(state.id)) continue;
      processed.add(state.id);
      if (String(state.clashMove.turnSignature ?? "") === signature) continue;
      const other = await resolveActor(getOtherClashUuid(state, actor));
      const next = { ...state, clashMove: null };
      await syncClashStateForPair(actor, other, next);
    }
  }
}

function shouldAllowClashTokenMove(document, changed, options = {}) {
  if (!("x" in changed || "y" in changed || "elevation" in changed)) return true;
  if (
    options.ddaClashMoveFollower ||
    options.ddaClashForcedMovement ||
    options.ddaDistantForce ||
    options.ddaExtendedGrapplePull ||
    options.ddaClashPinFall ||
    options.ddaGiantHijackerFollow ||
    options.ddaGiantHijackerAttach
  ) return true;

  const actor = document.actor;
  const states = getStoredClashStates(actor);
  if (!states.length) return true;

  const moveState = states.find((state) => (
    state?.clashMove?.active && state.clashMove.moverUuid === actor?.uuid
  ));
  if (!moveState) {
    ui.notifications.warn(localize("DDA.Warning.ClashMovementRequiresMoveAction"));
    return false;
  }

  for (const state of states) {
    const move = state.clashMove ?? {};
    // The follower in the selected Clash is moved with the controller immediately
    // after this update. Every other simultaneous Clash must still remain in reach.
    if (String(state.id) === String(moveState.id) && move.followerUuid) continue;

    const otherUuid = getOtherClashUuid(state, actor);
    const otherActor = canvas?.tokens?.placeables?.find((token) => token.actor?.uuid === otherUuid)?.actor;
    const otherDocument = getTokenDocumentForActor(otherActor);
    if (!otherDocument) continue;
    const maximumDistance = getStateMaximumClashDistance(state, actor, otherActor);
    if (getDocumentDistanceSpaces(document, changed, otherDocument) > maximumDistance) {
      ui.notifications.warn(text(
        `O movimento quebraria o Clash com ${otherActor?.name ?? "outro Digimon"}.`,
        `The movement would break the Clash with ${otherActor?.name ?? "another Digimon"}.`
      ));
      return false;
    }
  }

  return true;
}


export async function handleClashForcedMovement({
  defender,
  source = null,
  direction = "push",
  potency = 0,
  destination = {},
  suppressThickSkin = false
} = {}) {
  if (!defender) return { handled: false };

  if (!suppressThickSkin) {
    const {
      maybeResolveThickSkinForcedMovement
    } = await import(
      "../rules/tamer-talent-combat-survival.js"
    );

    const reaction =
      await maybeResolveThickSkinForcedMovement({
        defender,
        source,
        direction,
        spaces: Math.max(0, Number(potency ?? 0))
      });

    if (reaction?.used) {
      return {
        handled: true,
        moved: false,
        thickSkin: true,
        reflected: Boolean(reaction.reflected),
        reflectedMovement: Boolean(reaction.reflectedMovement)
      };
    }
  }

  const states = getStoredClashStates(defender);
  if (!states.length) return { handled: false };

  const defenderDocument = getTokenDocumentForActor(defender);
  if (!defenderDocument) return { handled: false };
  const moveUpdate = { x: Number(destination.x), y: Number(destination.y) };
  const relationships = [];

  for (const state of states) {
    const other = await resolveActor(getOtherClashUuid(state, defender));
    const otherDocument = getTokenDocumentForActor(other);
    if (!other || !otherDocument) continue;
    relationships.push({
      state,
      other,
      otherDocument,
      maximumDistance: getStateMaximumClashDistance(state, defender, other),
      proposedDistance: getDocumentDistanceSpaces(defenderDocument, destination, otherDocument)
    });
  }

  if (!relationships.length) return { handled: false };
  const breaking = relationships.filter((entry) => entry.proposedDistance > entry.maximumDistance);
  if (!breaking.length) {
    await updateClashToken(defenderDocument, moveUpdate, { animate: true, ddaClashForcedMovement: true });
    return { handled: true, moved: true, clashEnded: false };
  }

  const held = [];
  const broken = [];
  for (const entry of breaking) {
    const controller = entry.state.controllerUuid === defender.uuid ? defender : entry.other;
    const controllerCheck = await rollFixedCheck(
      controller,
      getCpuTotal(controller),
      10 + Math.max(0, Number(potency ?? 0)),
      localize("DDA.Clash.ForcedMovement.HoldCheck"),
      "dda-clash-card",
      { targetActor: defender }
    );
    if (controllerCheck.success) held.push({ ...entry, controller, controllerCheck });
    else broken.push({ ...entry, controller, controllerCheck });
  }

  const dx = Number(destination.x) - Number(defenderDocument.x ?? 0);
  const dy = Number(destination.y) - Number(defenderDocument.y ?? 0);
  await updateClashToken(defenderDocument, moveUpdate, { animate: true, ddaClashForcedMovement: true });

  for (const entry of held) {
    await updateClashToken(entry.otherDocument, {
      x: Number(entry.otherDocument.x ?? 0) + dx,
      y: Number(entry.otherDocument.y ?? 0) + dy
    }, { animate: true, ddaClashForcedMovement: true });
  }

  for (const entry of broken) {
    await endDigimonClash(defender, {
      reason: direction === "pull" ? "pull" : "push",
      clashId: entry.state.id
    });
  }

  return {
    handled: true,
    moved: true,
    carriedOther: held.length > 0,
    carriedCount: held.length,
    clashEnded: broken.length > 0,
    endedClashIds: broken.map((entry) => entry.state.id)
  };
}


export async function handleClashEffectApplied(defender, effectKey = "", sourceActor = null) {
  if (!defender || !hasActiveClash(defender)) return false;
  const key = String(effectKey ?? "").replace(/^\[|\]$/g, "").toLowerCase();
  if (["stun", "paralyze"].includes(key)) {
    await endDigimonClash(defender, { reason: key, all: true });
    return true;
  }
  if (key === "fear" && sourceActor) {
    const affected = getStoredClashStates(defender).filter((state) => (
      String(getOtherClashUuid(state, defender)) === String(sourceActor.uuid)
    ));
    for (const state of affected) {
      await endDigimonClash(defender, { reason: "fear", clashId: state.id });
    }
    return affected.length > 0;
  }
  return false;
}


Hooks.on("preUpdateToken", (document, changed, options) => {
  return shouldAllowClashTokenMove(document, changed, options);
});

Hooks.on("updateToken", (document, changed, options) => {
  void followClashMove(document, changed, options).catch((error) => {
    console.error("DDA | Clash movement follow failed.", error);
  });
});

Hooks.on("updateCombat", (combat, changed) => {
  if (!("turn" in changed) && !("round" in changed) && !("active" in changed)) return;
  void processAutomaticClashContests(combat).catch((error) => {
    console.error("DDA | Automatic Clash Contest failed.", error);
  });
  void clearExpiredClashMoves(combat).catch((error) => {
    console.error("DDA | Clash movement cleanup failed.", error);
  });
});
