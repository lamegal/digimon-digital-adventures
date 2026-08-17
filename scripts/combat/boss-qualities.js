import {
  findQuality,
  getActorDerivedStat,
  getCombatId,
  getQualityRank,
  isQualitySuppressedByBossState,
  normalizeKey,
  rollDerivedCheck
} from "../rules/quality-automation.js";
import { spendActorActions } from "./action-economy.js";
import { getTokenGridDistance } from "./positioning.js";
import { rollTormentCheck } from "../rolls/torment-roll.js";
import { getTamerCheckOutcome, rollTamerCheck } from "../rolls/check-roll.js";
import { healBossTemplatePools } from "./boss-encounters.js";

const SYSTEM_ID = "digimon-digital-adventures";
const BOSS_STATE_PATH = "system.combat.bossQualities";
const BOSS_SOCKET_SCOPE = "boss-quality-automation";
const BOSS_SOCKET_MASS_DESTRUCTION = "mass-destruction";
const TRUE_SIGHT_DETECTION_MODE_ID = "ddaTrueSight";
let bossQualitySocketRegistered = false;
let gravityReconcileTimer = null;
let trueSightReconcileTimer = null;
const trueSightReconcileActors = new Set();
const charmControlReconcileActors = new Set();
let gravityReconcileRunning = false;

const text = (pt, en) => String(game?.i18n?.lang ?? "")
  .toLowerCase()
  .startsWith("en") ? en : pt;

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const escapeHtml = (value = "") => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function qualityBossData(item) {
  return item?.type === "quality" && item.system?.boss && typeof item.system.boss === "object"
    ? item.system.boss
    : {};
}

export function findBossQuality(actor, feature = "") {
  const wanted = String(feature ?? "").trim();
  if (!actor || !wanted) return null;
  return (actor.items ?? []).find((item) => Boolean(qualityBossData(item)?.[wanted])) ?? null;
}

export function hasBossQuality(actor, feature = "") {
  return Boolean(findBossQuality(actor, feature));
}

/**
 * True Sight is intentionally modelled as a relative observer capability.
 * It never unhides a GM-hidden Token and it never changes the target Actor's
 * Hide in Plain Sight state for other observers.
 */
export function isBossTrueSightObserver(actor) {
  const quality = actor ? findBossQuality(actor, "trueSight") : null;
  return Boolean(quality && !isQualitySuppressedByBossState(actor, quality));
}

export function isActorUsingHideInPlainSight(actor) {
  return Boolean(actor?.system?.combat?.offensiveQualities?.hideInPlainSight?.active);
}

export function doesBossTrueSightRevealHide(observer, target) {
  return Boolean(
    observer &&
    target &&
    observer.uuid !== target.uuid &&
    isBossTrueSightObserver(observer) &&
    isActorUsingHideInPlainSight(target)
  );
}

function findCanvasTokenForActor(actor) {
  if (!actor || !canvas?.ready) return null;
  const actorUuid = String(actor.uuid ?? "");
  const actorId = String(actor.id ?? "");

  const candidates = (canvas?.tokens?.placeables ?? []).filter((candidate) => {
    const candidateActor = candidate?.actor ?? candidate?.document?.actor;
    if (!candidateActor) return false;
    if (actorUuid && String(candidateActor.uuid ?? "") === actorUuid) return true;
    return Boolean(actorId && String(candidateActor.id ?? "") === actorId);
  });

  return candidates.find((candidate) => candidate?.controlled)
    ?? candidates.find((candidate) => candidate?.combatant)
    ?? candidates[0]
    ?? null;
}

function testBossTrueSightVisibility(observer, targetToken) {
  if (!observer || !targetToken || !canvas?.ready) return null;
  if (!isBossTrueSightObserver(observer)) return null;
  if (!registerBossTrueSightDetectionMode()) return null;

  const observerToken = findCanvasTokenForActor(observer);
  const visionSource = observerToken?.vision;
  const detectionMode = CONFIG.Canvas?.detectionModes?.[TRUE_SIGHT_DETECTION_MODE_ID];
  const preparedMode = (observerToken?.detectionModes ?? []).find(
    (entry) => String(entry?.id ?? "") === TRUE_SIGHT_DETECTION_MODE_ID && entry?.enabled !== false
  );
  // Reconciliation persists this mode onto the Token for rendering. The
  // mechanical test can still run during the short reconciliation window.
  const mode = preparedMode ?? {
    id: TRUE_SIGHT_DETECTION_MODE_ID,
    enabled: true,
    range: Number.POSITIVE_INFINITY
  };
  const point = targetToken?.center;
  const visibility = canvas?.visibility;

  if (!visionSource || !detectionMode || !mode || !point || !visibility?._createVisibilityTestConfig) {
    return null;
  }

  try {
    const config = visibility._createVisibilityTestConfig(point, { object: targetToken });
    return Boolean(detectionMode.testVisibility(visionSource, mode, config));
  } catch (error) {
    console.warn("DDA | True Sight visibility test fell back to rendered visibility.", error);
    return null;
  }
}

/**
 * Mechanical visibility helper for rules which care about line of sight.
 * A Token explicitly hidden by the GM remains hidden. True Sight bypasses
 * wall/solid-object LOS through its dedicated Light Perception mode, but it
 * deliberately does not grant darkvision or ignore illumination.
 */
export function isTokenVisibleToBossObserver(observer, token) {
  if (!token) return false;
  if (token.document?.hidden) return false;

  const trueSightVisibility = testBossTrueSightVisibility(observer, token);
  if (trueSightVisibility !== null) return trueSightVisibility;

  // If the dedicated source cannot be evaluated (for example before Canvas
  // initialization), never broaden True Sight into omniscience. Fall back to
  // the visibility Foundry already prepared for the current client.
  if (game.user?.isGM && !isBossTrueSightObserver(observer)) return true;
  return token.isVisible !== false && token.visible !== false;
}

function registerBossTrueSightDetectionMode() {
  CONFIG.Canvas ??= {};
  CONFIG.Canvas.detectionModes ??= {};
  if (CONFIG.Canvas.detectionModes[TRUE_SIGHT_DETECTION_MODE_ID]) return true;

  const DetectionModeLightPerception = foundry?.canvas?.perception?.DetectionModeLightPerception;
  const DetectionMode = foundry?.canvas?.perception?.DetectionMode;
  if (!DetectionModeLightPerception) {
    console.warn("DDA | True Sight detection mode could not be registered: DetectionModeLightPerception is unavailable.");
    return false;
  }

  const type = DetectionMode?.DETECTION_TYPES?.SIGHT
    ?? DetectionModeLightPerception?.DETECTION_TYPES?.SIGHT
    ?? 0;

  CONFIG.Canvas.detectionModes[TRUE_SIGHT_DETECTION_MODE_ID] = new DetectionModeLightPerception({
    id: TRUE_SIGHT_DETECTION_MODE_ID,
    label: "DDA: True Sight",
    type,
    walls: false,
    angle: true,
    tokenConfig: false
  });
  return true;
}

function sourceDetectionModes(tokenDocument) {
  const source = tokenDocument?._source?.detectionModes;
  if (Array.isArray(source)) return foundry.utils.deepClone(source);
  const object = tokenDocument?.toObject?.(true) ?? {};
  return Array.isArray(object.detectionModes)
    ? foundry.utils.deepClone(object.detectionModes)
    : [];
}

async function reconcileBossTrueSightToken(tokenDocument) {
  if (!tokenDocument || !game.user?.isGM) return false;
  const gm = primaryActiveGM();
  if (gm?.id !== game.user.id) return false;
  if (!registerBossTrueSightDetectionMode()) return false;

  const actor = tokenDocument.actor;
  const shouldHave = isBossTrueSightObserver(actor);
  const modes = sourceDetectionModes(tokenDocument);
  const index = modes.findIndex((mode) => String(mode?.id ?? "") === TRUE_SIGHT_DETECTION_MODE_ID);
  let changed = false;

  if (shouldHave) {
    const desired = { id: TRUE_SIGHT_DETECTION_MODE_ID, range: null, enabled: true };
    if (index < 0) {
      modes.push(desired);
      changed = true;
    } else {
      const current = modes[index] ?? {};
      if (current.enabled !== true || current.range !== null) {
        modes[index] = { ...current, ...desired };
        changed = true;
      }
    }
  } else if (index >= 0) {
    modes.splice(index, 1);
    changed = true;
  }

  if (!changed) return false;
  await tokenDocument.update(
    { detectionModes: modes },
    { ddaTrueSightReconcile: true }
  );
  return true;
}

async function reconcileBossTrueSightForActor(actor) {
  if (!actor || !canvas?.ready) return;
  const tokens = (canvas?.tokens?.placeables ?? [])
    .map((token) => token.document)
    .filter((document) => document?.actor?.uuid === actor.uuid || document?.actor?.id === actor.id);
  for (const document of tokens) {
    await reconcileBossTrueSightToken(document);
  }
}

async function reconcileAllBossTrueSightTokens() {
  if (!canvas?.ready) return;
  for (const token of canvas?.tokens?.placeables ?? []) {
    await reconcileBossTrueSightToken(token.document);
  }
}

function scheduleBossTrueSightReconcile(actor = null) {
  if (actor?.uuid) trueSightReconcileActors.add(actor.uuid);
  if (trueSightReconcileTimer) clearTimeout(trueSightReconcileTimer);
  trueSightReconcileTimer = setTimeout(() => {
    trueSightReconcileTimer = null;
    void (async () => {
      if (!game.user?.isGM) return;
      if (!trueSightReconcileActors.size) {
        await reconcileAllBossTrueSightTokens();
        return;
      }
      const uuids = [...trueSightReconcileActors];
      trueSightReconcileActors.clear();
      for (const uuid of uuids) {
        let actor = null;
        try { actor = await fromUuid(uuid); } catch (_error) { actor = null; }
        if (actor?.documentName === "Token") actor = actor.actor;
        if (actor) await reconcileBossTrueSightForActor(actor);
      }
    })().catch((error) => {
      console.error("DDA | True Sight token reconciliation failed.", error);
    });
  }, 50);
}

export function getBossImmunityEffectTags(actor) {
  const quality = findBossQuality(actor, "effectImmunity");
  if (!quality) return new Set();

  const selected = [
    ...(Array.isArray(quality.system?.choices?.selectedRanks)
      ? quality.system.choices.selectedRanks
      : []),
    ...(Array.isArray(quality.system?.choices?.selected)
      ? quality.system.choices.selected
      : [])
  ];

  return new Set(
    selected
      .map((choice) => String(
        choice?.effectTag ??
        choice?.tag ??
        choice?.value ??
        choice?.key ??
        choice ??
        ""
      ))
      .map((value) => value.includes(":") ? value.split(":").at(-1) : value)
      .map(normalizeKey)
      .filter(Boolean)
  );
}

function getBossState(actor) {
  return foundry.utils.deepClone(actor?.system?.combat?.bossQualities ?? {});
}

async function setBossState(actor, state) {
  if (!actor) return;
  await actor.update({ [BOSS_STATE_PATH]: state });
}

function attackIdentityKey(request = {}) {
  const attacker = String(request.attackerUuid ?? "").trim();
  const attack = String(request.attackItemId ?? request.attackName ?? "").trim();
  return attacker && attack ? `${attacker}::${attack}` : attack;
}

/**
 * Adaptive Intelligence applies +2 Dodge dice per previous exposure to the
 * same Attack during the current Combat. The first exposure gives no bonus.
 */
export function getAdaptiveIntelligenceDodgeBonus(defender, request = {}) {
  if (!defender || !hasBossQuality(defender, "adaptiveIntelligence")) {
    return { active: false, bonus: 0, seen: 0, key: "" };
  }

  const combatId = String(getCombatId() ?? "");
  if (!combatId) return { active: true, bonus: 0, seen: 0, key: "" };

  const key = attackIdentityKey(request);
  if (!key) return { active: true, bonus: 0, seen: 0, key: "" };

  const state = getBossState(defender).adaptiveIntelligence ?? {};
  const seenByAttack = String(state.combatId ?? "") === combatId
    ? state.seenByAttack ?? {}
    : {};
  const seen = Math.max(0, Math.floor(number(seenByAttack[key], 0)));

  return {
    active: true,
    key,
    seen,
    bonus: seen * 2
  };
}

export async function recordAdaptiveIntelligenceExposure(defender, request = {}) {
  const data = getAdaptiveIntelligenceDodgeBonus(defender, request);
  const combatId = String(getCombatId() ?? "");
  if (!data.active || !data.key || !combatId) return data;

  const state = getBossState(defender);
  const previous = state.adaptiveIntelligence ?? {};
  const seenByAttack = String(previous.combatId ?? "") === combatId
    ? foundry.utils.deepClone(previous.seenByAttack ?? {})
    : {};

  seenByAttack[data.key] = Math.max(0, Math.floor(number(seenByAttack[data.key], 0))) + 1;
  state.adaptiveIntelligence = {
    combatId,
    seenByAttack,
    lastAttackKey: data.key,
    updatedAt: Date.now()
  };
  await setBossState(defender, state);
  return { ...data, seenAfter: seenByAttack[data.key] };
}

function selectedAttackMatches(quality, attackItem) {
  if (!quality || !attackItem) return false;
  const identities = new Set([
    String(attackItem.id ?? ""),
    String(attackItem.uuid ?? ""),
    String(attackItem.name ?? "")
  ].filter(Boolean));

  const selected = [
    ...(Array.isArray(quality.system?.choices?.selectedRanks) ? quality.system.choices.selectedRanks : []),
    ...(Array.isArray(quality.system?.choices?.selected) ? quality.system.choices.selected : [])
  ];

  return selected.some((choice) => {
    const key = String(choice?.key ?? "").trim();
    const keyAttackId = key.includes(":") ? key.slice(0, key.indexOf(":")) : key;
    return [
      choice?.attackId,
      choice?.attackItemId,
      choice?.itemId,
      choice?.attackKey,
      keyAttackId,
      choice?.attackName
    ].filter(Boolean).some((value) => identities.has(String(value)));
  });
}

function attackHasWeaponTag(actor, attackItem) {
  if (!actor || !attackItem) return false;

  const directTags = [
    ...(Array.isArray(attackItem.system?.qualityTags) ? attackItem.system.qualityTags : []),
    ...(Array.isArray(attackItem.system?.tags) ? attackItem.system.tags : []),
    ...(Array.isArray(attackItem.system?.baseTags?.tags) ? attackItem.system.baseTags.tags : [])
  ].map((tag) => normalizeKey(tag));

  if (directTags.includes("weapon") || directTags.includes("arma")) return true;

  return (actor.items ?? []).some((quality) => {
    if (quality.type !== "quality") return false;
    const grantsTags = Array.isArray(quality.system?.attackModifier?.grantsTags)
      ? quality.system.attackModifier.grantsTags.map((tag) => normalizeKey(tag))
      : [];
    if (!grantsTags.includes("weapon") && !grantsTags.includes("arma")) return false;
    return selectedAttackMatches(quality, attackItem);
  });
}

export function getWeaponQualityRank(actor) {
  const weapon = findQuality(actor, ["arma", "weapon"]);
  return weapon ? Math.max(1, getQualityRank(weapon)) : 1;
}

function highestDerivedStat(actor) {
  const entries = ["cpu", "dos", "ram", "bit"].map((key) => ({
    key,
    value: Math.max(0, number(
      actor?.system?.derivedStats?.[key]?.total ??
      actor?.system?.derivedStats?.[key]?.value ??
      actor?.system?.derivedStats?.[key]?.base ??
      0
    ))
  }));
  entries.sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  return entries[0] ?? { key: "cpu", value: 0 };
}


export async function prepareBossSpatialDistortionDeclaration({
  attacker,
  attackerToken,
  targetToken,
  attackItem,
  qualityAttackModifier = {},
  attackRangeTotal = 0,
  attackEffectiveLimitTotal = 0,
  attackOptions = {}
} = {}) {
  if (!attacker || !attackerToken || !targetToken || !attackItem) return null;
  if (attackOptions?.areaBatch?.active || attackOptions?.__ddaAreaChild) return null;
  if (attackOptions.bossSpatialDistortionContext) return attackOptions.bossSpatialDistortionContext;

  const quality = findBossQuality(attacker, "spatialDistortion");
  if (!quality) return null;

  const distance = getTokenGridDistance(attackerToken, targetToken);
  const rangeType = String(attackItem.system?.baseTags?.rangeType ?? "").trim().toLowerCase();
  const reach = Math.max(1, 1 + number(qualityAttackModifier?.meleeReachBonus, 0));
  const normalRange = Math.max(0, number(attackRangeTotal, 0));
  const effectiveLimit = Math.max(0, number(attackEffectiveLimitTotal, 0));

  const useful = rangeType === "melee"
    ? distance > reach && !attackOptions?.punishingStrikeContext?.ignoreMeleeRange
    : ["range", "ranged"].includes(rangeType)
      ? distance > normalRange
      : false;

  if (!useful) {
    return {
      active: false,
      qualityId: quality.id,
      distance,
      rangeType,
      range: normalRange,
      effectiveLimit,
      reach
    };
  }

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-offensive-quality-window"],
    window: { title: quality.name },
    content: `<div class="dda-confirm-dialog"><p>${text(
      `Gastar <strong>+1 Ação</strong> para ignorar a distância até <strong>${escapeHtml(targetToken.name)}</strong>?`,
      `Spend <strong>+1 Action</strong> to ignore the distance to <strong>${escapeHtml(targetToken.name)}</strong>?`
    )}</p><p>${text(
      rangeType === "melee"
        ? `Distância ${distance}; alcance corpo a corpo normal ${reach}.`
        : `Distância ${distance}; Alcance normal ${normalRange}${effectiveLimit ? `; Limite Efetivo ${effectiveLimit}` : ""}.`,
      rangeType === "melee"
        ? `Distance ${distance}; normal melee reach ${reach}.`
        : `Distance ${distance}; normal Range ${normalRange}${effectiveLimit ? `; Effective Limit ${effectiveLimit}` : ""}.`
    )}</p></div>`,
    yes: { label: text("Usar Distorção Espacial", "Use Spatial Distortion"), default: false },
    no: { label: text("Não usar", "Do not use"), default: true },
    rejectClose: false,
    modal: true
  });

  return {
    active: Boolean(confirmed),
    qualityId: quality.id,
    distance,
    rangeType,
    range: normalRange,
    effectiveLimit,
    reach
  };
}

export function getBossSpatialDistortionExtraActionCost(attackOptions = {}) {
  return attackOptions?.bossSpatialDistortionContext?.active ? 1 : 0;
}

/**
 * Prompt once before an Attack workflow. Area Attack child resolutions inherit
 * the declaration through attackOptions, so the +1 Action is never prompted
 * or charged once per target.
 */
export async function prepareBossWeaponExpertDeclaration(attacker, attackItem, attackOptions = {}) {
  if (!attacker || !attackItem) return null;

  if (attackOptions.bossWeaponExpertContext) {
    return attackOptions.bossWeaponExpertContext;
  }

  const quality = findBossQuality(attacker, "weaponExpert");
  if (!quality || !attackHasWeaponTag(attacker, attackItem)) return null;

  const highest = highestDerivedStat(attacker);
  const weaponRank = getWeaponQualityRank(attacker);
  if (highest.value <= weaponRank) {
    return {
      active: false,
      qualityId: quality.id,
      weaponRank,
      derivedStatKey: highest.key,
      derivedStatValue: highest.value
    };
  }

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-offensive-quality-window"],
    window: { title: quality.name },
    content: `<div class="dda-confirm-dialog"><p>${text(
      `Gastar <strong>+1 Ação</strong> para usar <strong>${highest.key.toUpperCase()} ${highest.value}</strong> no lugar dos ${weaponRank} Rank(s) de Arma neste ataque?`,
      `Spend <strong>+1 Action</strong> to use <strong>${highest.key.toUpperCase()} ${highest.value}</strong> instead of ${weaponRank} Weapon Rank(s) for this attack?`
    )}</p></div>`,
    yes: { label: text("Usar Especialista em Armas", "Use Weapon Expert"), default: false },
    no: { label: text("Usar Arma normalmente", "Use Weapon normally"), default: true },
    rejectClose: false,
    modal: true
  });

  return {
    active: Boolean(confirmed),
    qualityId: quality.id,
    weaponRank,
    derivedStatKey: highest.key,
    derivedStatValue: highest.value
  };
}

/**
 * getAppliedAttackQualityModifier uses this value only for Weapon Expert's own
 * granted [WEAPON] tag. Normal Weapon qualities keep their own rank value.
 */
export function getBossWeaponExpertTagRank(attacker, quality, attackOptions = {}) {
  const grantsTags = Array.isArray(quality?.system?.attackModifier?.grantsTags)
    ? quality.system.attackModifier.grantsTags.map((tag) => normalizeKey(tag))
    : [];
  const grantsWeapon = grantsTags.includes("weapon") || grantsTags.includes("arma");
  if (!grantsWeapon) return null;

  const declaration = attackOptions?.bossWeaponExpertContext ?? null;
  if (!declaration?.active) return null;

  return Math.max(
    0,
    number(declaration.derivedStatValue, getWeaponQualityRank(attacker))
  );
}

export function getBossWeaponExpertExtraActionCost(attackOptions = {}) {
  return attackOptions?.bossWeaponExpertContext?.active ? 1 : 0;
}


function tokenForActor(actor) {
  if (!actor) return null;
  return (canvas?.tokens?.controlled ?? []).find((token) => token.actor?.uuid === actor.uuid)
    ?? (canvas?.tokens?.placeables ?? []).find((token) => token.actor?.uuid === actor.uuid || token.actor?.id === actor.id)
    ?? null;
}

function selectedSuppressionType(quality) {
  const selected = [
    ...(Array.isArray(quality?.system?.choices?.selectedRanks) ? quality.system.choices.selectedRanks : []),
    ...(Array.isArray(quality?.system?.choices?.selected) ? quality.system.choices.selected : [])
  ];
  for (const choice of selected) {
    const key = normalizeKey(choice?.key ?? choice?.value ?? choice?.id ?? choice ?? "");
    if (["static", "trigger", "attack"].includes(key)) return key;
  }
  return "";
}

function suppressionStateFor(actor) {
  const current = actor?.system?.combat?.bossQualities?.suppression ?? {};
  const combatId = String(getCombatId() ?? "");
  if (!combatId || String(current.combatId ?? "") !== combatId) {
    return { combatId, sources: [], ignoredSourceUuids: [] };
  }
  return {
    combatId,
    sources: Array.isArray(current.sources) ? current.sources : [],
    ignoredSourceUuids: Array.isArray(current.ignoredSourceUuids) ? current.ignoredSourceUuids.map(String) : []
  };
}

async function reconcileAllSuppression() {
  if (!game.user?.isGM) return;
  const combat = game?.combat;
  if (!combat?.started) return;

  const combatId = String(combat.id ?? "");
  const combatActors = [...new Map((combat.combatants?.contents ?? [])
    .map((combatant) => combatant.actor)
    .filter(Boolean)
    .map((actor) => [actor.uuid, actor])).values()];

  const sources = [];
  for (const actor of combatActors) {
    if (!["digimon", "npc"].includes(actor.type)) continue;
    const quality = findBossQuality(actor, "suppression");
    if (!quality) continue;
    const type = selectedSuppressionType(quality);
    const token = tokenForActor(actor);
    if (!type || !token) continue;
    sources.push({
      actor,
      quality,
      token,
      type,
      radius: Math.max(0, number(getActorDerivedStat(actor, "dos"), 0))
    });
  }

  for (const target of combatActors) {
    if (!["digimon", "npc"].includes(target.type)) continue;
    const targetToken = tokenForActor(target);
    const previous = suppressionStateFor(target);
    const ignored = new Set(previous.ignoredSourceUuids);
    const nextSources = [];

    if (targetToken) {
      for (const source of sources) {
        if (source.actor.uuid === target.uuid) continue;
        if (ignored.has(source.actor.uuid)) continue;
        if (getTokenGridDistance(source.token, targetToken) > source.radius) continue;
        nextSources.push({
          sourceActorUuid: source.actor.uuid,
          sourceActorName: source.actor.name,
          qualityId: String(source.quality.id ?? ""),
          type: source.type,
          radius: source.radius
        });
      }
    }

    const previousJson = JSON.stringify(previous.sources ?? []);
    const nextJson = JSON.stringify(nextSources);
    const needsReset = String(target.system?.combat?.bossQualities?.suppression?.combatId ?? "") !== combatId;
    if (!needsReset && previousJson === nextJson) continue;

    const bossState = getBossState(target);
    bossState.suppression = {
      combatId,
      sources: nextSources,
      ignoredSourceUuids: [...ignored],
      updatedAt: Date.now()
    };
    await setBossState(target, bossState);
    target.sheet?.render(false);
  }
}

async function clearSuppressionForCombat(combat) {
  if (!game.user?.isGM) return;
  const combatId = String(combat?.id ?? "");
  const actors = new Map();
  for (const combatant of combat?.combatants?.contents ?? []) {
    if (combatant.actor) actors.set(combatant.actor.uuid, combatant.actor);
  }
  for (const actor of actors.values()) {
    const state = getBossState(actor);
    if (String(state.suppression?.combatId ?? "") !== combatId) continue;
    delete state.suppression;
    await setBossState(actor, state);
  }
}

function suppressedSourcesForItem(actor, item) {
  if (!isQualitySuppressedByBossState(actor, item)) return [];
  const category = item?.system?.category ?? {};
  return suppressionStateFor(actor).sources.filter((source) => {
    const type = normalizeKey(source?.type ?? "");
    return (type === "static" && category.static) ||
      (type === "trigger" && category.trigger) ||
      (type === "attack" && category.attack);
  });
}

export async function ensureBossQualityNotSuppressed(actor, item) {
  const sources = suppressedSourcesForItem(actor, item);
  if (!sources.length) return true;

  let source = sources[0];
  if (sources.length > 1) {
    const selected = await foundry.applications.api.DialogV2.prompt({
      classes: ["dda", "dda-defensive-quality-window"],
      window: { title: text("Supressão", "Suppression") },
      content: `<form class="dda-roll-dialog"><p>${text("Esta Qualidade está sob mais de uma Supressão. Escolha qual tentar ignorar.", "This Quality is under more than one Suppression. Choose which one to attempt to ignore.")}</p><div class="form-group"><select name="source">${sources.map((entry, index) => `<option value="${index}">${escapeHtml(entry.sourceActorName)} — ${escapeHtml(entry.type)}</option>`).join("")}</select></div></form>`,
      ok: { label: text("Tentar ignorar", "Attempt to Ignore"), callback: (_event, button) => Number(button.form.elements.source?.value ?? 0) },
      rejectClose: false,
      modal: true
    });
    if (selected === null || selected === undefined) return false;
    source = sources[Math.max(0, Math.min(sources.length - 1, Number(selected)))] ?? sources[0];
  }

  const suppressor = await resolveActorUuid(source.sourceActorUuid);
  if (!suppressor) return false;
  const tn = 10 + Math.max(0, number(getActorDerivedStat(suppressor, "dos"), 0));
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-defensive-quality-window"],
    window: { title: text("Ignorar Supressão", "Ignore Suppression") },
    content: `<div class="dda-confirm-dialog"><p>${text(
      `Gastar <strong>2 Ações</strong> para fazer um Teste de DOS contra NA <strong>${tn}</strong> e ignorar a Supressão de <strong>${escapeHtml(suppressor.name)}</strong> pelo resto do Combate?`,
      `Spend <strong>2 Actions</strong> on a DOS Check against TN <strong>${tn}</strong> to ignore <strong>${escapeHtml(suppressor.name)}</strong>'s Suppression for the rest of Combat?`
    )}</p></div>`,
    yes: { label: text("Fazer Teste", "Make Check") },
    no: { label: text("Cancelar", "Cancel") },
    rejectClose: false,
    modal: true
  });
  if (!confirmed) return false;

  const paid = await spendActorActions(actor, 2, { requireActiveUnit: true, notify: true });
  if (!paid) return false;
  const check = await rollDerivedCheck(actor, "dos", { tn, title: text("Ignorar Supressão", "Ignore Suppression") });
  if (!check?.success) return false;

  const state = getBossState(actor);
  const suppression = suppressionStateFor(actor);
  const ignored = new Set(suppression.ignoredSourceUuids);
  ignored.add(String(suppressor.uuid));
  state.suppression = {
    ...suppression,
    ignoredSourceUuids: [...ignored],
    sources: suppression.sources.filter((entry) => String(entry.sourceActorUuid ?? "") !== String(suppressor.uuid)),
    updatedAt: Date.now()
  };
  await setBossState(actor, state);
  actor.sheet?.render(false);
  return true;
}

function gravityEffectMatches(effect, sourceActorUuid = "") {
  return Boolean(
    effect?.bossGravity === true &&
    String(effect?.bossGravitySourceUuid ?? effect?.sourceActorUuid ?? "") === String(sourceActorUuid ?? "")
  );
}

async function removeGravityEffect(targetActor, sourceActorUuid = "") {
  if (!targetActor) return false;
  const effects = foundry.utils.deepClone(targetActor.system?.effects?.active ?? []);
  const remaining = effects.filter((effect) => !gravityEffectMatches(effect, sourceActorUuid));
  if (remaining.length === effects.length) return false;
  await targetActor.update({ "system.effects.active": remaining });
  targetActor.sheet?.render(false);
  return true;
}

async function ensureGravityEffect(targetActor, sourceActor, quality) {
  if (!targetActor || !sourceActor) return false;
  const effects = foundry.utils.deepClone(targetActor.system?.effects?.active ?? []);
  const existingIndex = effects.findIndex((effect) => gravityEffectMatches(effect, sourceActor.uuid));
  const record = {
    id: existingIndex >= 0
      ? String(effects[existingIndex]?.id ?? foundry.utils.randomID())
      : foundry.utils.randomID(),
    tag: "heavy",
    label: `[HEAVY] — ${quality?.name ?? text("Gravidade", "Gravity")}`,
    type: "negative",
    active: true,
    sourceActorUuid: sourceActor.uuid,
    sourceActorName: sourceActor.name,
    appliedCombatId: String(getCombatId() ?? ""),
    bossGravity: true,
    bossGravitySourceUuid: sourceActor.uuid,
    bossGravityQualityId: String(quality?.id ?? "")
  };

  if (existingIndex >= 0) effects[existingIndex] = { ...effects[existingIndex], ...record };
  else effects.push(record);

  await targetActor.update({ "system.effects.active": effects });
  targetActor.sheet?.render(false);
  return true;
}

function gravityStateFor(actor) {
  const state = actor?.system?.combat?.bossQualities?.gravity ?? {};
  const combatId = String(getCombatId() ?? "");
  return combatId && String(state.combatId ?? "") === combatId && state.active
    ? state
    : null;
}

async function reconcileGravityForSource(sourceActor) {
  if (!sourceActor) return null;
  const state = gravityStateFor(sourceActor);
  if (!state) return null;

  const quality = findBossQuality(sourceActor, "gravity");
  if (!quality) return null;

  const sourceToken = tokenForActor(sourceActor);
  const radius = Math.max(0, number(
    getActorDerivedStat(sourceActor, qualityBossData(quality)?.radiusStat ?? "dos"),
    number(state.radius, 0)
  ));

  const targetUuids = Array.isArray(state.targetActorUuids)
    ? state.targetActorUuids.map(String).filter(Boolean)
    : [];

  const results = [];
  for (const targetUuid of targetUuids) {
    const targetToken = (canvas?.tokens?.placeables ?? []).find((token) => token.actor?.uuid === targetUuid);
    const targetActor = targetToken?.actor
      ?? game.actors?.contents?.find((actor) => actor.uuid === targetUuid)
      ?? null;
    if (!targetActor) continue;

    const inside = Boolean(
      sourceToken &&
      targetToken &&
      getTokenGridDistance(sourceToken, targetToken) <= radius
    );

    if (inside) {
      await ensureGravityEffect(targetActor, sourceActor, quality);
      results.push({ actor: targetActor, heavy: true });
    } else {
      await removeGravityEffect(targetActor, sourceActor.uuid);
      results.push({ actor: targetActor, heavy: false });
    }
  }

  return { sourceActor, radius, results };
}

async function reconcileAllGravity() {
  if (!game.user?.isGM) return;
  const combat = game?.combat;
  if (!combat?.started) return;

  const seen = new Set();
  for (const combatant of combat.combatants?.contents ?? []) {
    const actor = combatant.actor;
    if (!actor || seen.has(actor.uuid) || !gravityStateFor(actor)) continue;
    seen.add(actor.uuid);
    await reconcileGravityForSource(actor);
  }
}

function scheduleGravityReconcile() {
  if (!game.user?.isGM) return;
  if (gravityReconcileTimer) clearTimeout(gravityReconcileTimer);
  gravityReconcileTimer = setTimeout(async () => {
    gravityReconcileTimer = null;
    if (gravityReconcileRunning) {
      scheduleGravityReconcile();
      return;
    }
    gravityReconcileRunning = true;
    try {
      await reconcileAllGravity();
      await reconcileAllSuppression();
    } catch (error) {
      console.error("DDA | Boss area reconciliation failed.", error);
    } finally {
      gravityReconcileRunning = false;
    }
  }, 40);
}

async function clearGravityForCombat(combat) {
  if (!game.user?.isGM) return;
  const combatId = String(combat?.id ?? "");
  const actors = new Map();
  for (const combatant of combat?.combatants?.contents ?? []) {
    if (combatant.actor) actors.set(combatant.actor.uuid, combatant.actor);
  }
  for (const actor of game.actors?.contents ?? []) actors.set(actor.uuid, actor);

  for (const actor of actors.values()) {
    const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
    const remaining = effects.filter((effect) => !(
      effect?.bossGravity === true &&
      (!effect.appliedCombatId || String(effect.appliedCombatId) === combatId)
    ));
    if (remaining.length !== effects.length) {
      await actor.update({ "system.effects.active": remaining });
    }
  }
}

async function useGravity(actor, item) {
  if (!game?.combat?.started) {
    ui.notifications.warn(text(
      "Gravidade só pode ser usada durante um Combate.",
      "Gravity can only be used during Combat."
    ));
    return { handled: true, success: false };
  }

  const sourceToken = tokenForActor(actor);
  if (!sourceToken) {
    ui.notifications.warn(text(
      "Gravidade exige um Token do Boss no canvas.",
      "Gravity requires the Boss to have a Token on the canvas."
    ));
    return { handled: true, success: false };
  }

  const radius = Math.max(0, number(getActorDerivedStat(actor, "dos"), 0));
  const selectedTokens = Array.from(game.user?.targets ?? [])
    .filter((token) => token?.actor && token.actor.uuid !== actor.uuid);
  const validTokens = selectedTokens.filter((token) => getTokenGridDistance(sourceToken, token) <= radius);
  const invalidTokens = selectedTokens.filter((token) => !validTokens.includes(token));

  if (!validTokens.length) {
    ui.notifications.warn(text(
      `Marque pelo menos um alvo a até ${radius} Espaços para usar Gravidade.`,
      `Target at least one creature within ${radius} Spaces to use Gravity.`
    ));
    return { handled: true, success: false };
  }

  if (invalidTokens.length) {
    ui.notifications.warn(text(
      `Fora do alcance de Gravidade e ignorado(s): ${invalidTokens.map((token) => token.name).join(", ")}.`,
      `Outside Gravity range and ignored: ${invalidTokens.map((token) => token.name).join(", ")}.`
    ));
  }

  const paid = await spendActorActions(actor, 1, {
    requireActiveUnit: true,
    notify: true
  });
  if (!paid) return { handled: true, success: false };

  const previous = gravityStateFor(actor);
  const nextTargetUuids = validTokens.map((token) => token.actor.uuid);
  const removedUuids = (previous?.targetActorUuids ?? []).filter((uuid) => !nextTargetUuids.includes(String(uuid)));
  for (const uuid of removedUuids) {
    const previousActor = game.actors?.contents?.find((candidate) => candidate.uuid === String(uuid))
      ?? (canvas?.tokens?.placeables ?? []).find((token) => token.actor?.uuid === String(uuid))?.actor
      ?? null;
    if (previousActor) await removeGravityEffect(previousActor, actor.uuid);
  }

  const state = getBossState(actor);
  state.gravity = {
    active: true,
    combatId: String(getCombatId() ?? ""),
    qualityId: String(item.id ?? ""),
    radius,
    targetActorUuids: nextTargetUuids,
    updatedAt: Date.now()
  };
  await setBossState(actor, state);
  await reconcileGravityForSource(actor);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-negative">
        <h2>${escapeHtml(item.name)}</h2>
        <p>${text(
          `${escapeHtml(actor.name)} impôs [HEAVY] a alvos escolhidos dentro de ${radius} Espaços.`,
          `${escapeHtml(actor.name)} imposed [HEAVY] on chosen targets within ${radius} Spaces.`
        )}</p>
        <ul class="dda-effect-list">${validTokens.map((token) => `<li>${escapeHtml(token.name)}</li>`).join("")}</ul>
        <p>${text(
          "[HEAVY] é removido automaticamente quando um alvo escolhido sai da área e retorna se ele entrar novamente.",
          "[HEAVY] is automatically removed when a chosen target leaves the area and returns if it enters again."
        )}</p>
      </div>`
  });

  return { handled: true, success: true, radius, targets: validTokens.map((token) => token.actor) };
}

function effectTagKey(effect = {}) {
  return normalizeKey(String(effect?.tag ?? "").replace(/^\[|\]$/g, ""));
}

export function getBossInvincibleEffect(actor) {
  return (Array.isArray(actor?.system?.effects?.active) ? actor.system.effects.active : [])
    .find((effect) => effectTagKey(effect) === "invincible" && effect?.bossInvincible !== false) ?? null;
}

export function isBossInvincibleAgainstAttack(actor, { calledShotMode = "" } = {}) {
  if (!actor || String(calledShotMode ?? "").trim()) return false;
  return Boolean(getBossInvincibleEffect(actor));
}

function attackHasInvincibleBossEffect(attackItem) {
  const effect = attackItem?.system?.effectTag ?? {};
  return Boolean(effect.enabled && normalizeKey(String(effect.tag ?? "")) === "invincible");
}

export function getBossInvincibleBatteryMinimum(attackItem) {
  if (!attackHasInvincibleBossEffect(attackItem)) return 1;
  return Math.max(1, Math.floor(number(attackItem.system?.bossInvincible?.minimumBattery, 1)));
}

export async function recordBossInvincibleSignatureUse(attackItem) {
  if (!attackHasInvincibleBossEffect(attackItem)) return null;
  const before = getBossInvincibleBatteryMinimum(attackItem);
  const after = before + 1;
  await attackItem.update({
    "system.bossInvincible.minimumBattery": after,
    "system.bossInvincible.uses": Math.max(0, Math.floor(number(attackItem.system?.bossInvincible?.uses, 0))) + 1
  });
  return { before, after };
}

async function expireBossInvincibleForSource(sourceActor, combat) {
  if (!sourceActor || !combat?.started) return [];
  const currentTick = `${combat.id}:${number(combat.round, 0)}:${number(combat.turn, -1)}`;
  const changed = [];
  const candidates = new Map();
  for (const combatant of combat.combatants?.contents ?? []) {
    if (combatant.actor) candidates.set(combatant.actor.uuid, combatant.actor);
  }
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (token.actor) candidates.set(token.actor.uuid, token.actor);
  }

  for (const actor of candidates.values()) {
    const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
    const filtered = effects.filter((effect) => {
      if (effectTagKey(effect) !== "invincible") return true;
      if (String(effect.sourceActorUuid ?? "") !== String(sourceActor.uuid)) return true;
      const appliedTick = `${effect.appliedCombatId ?? ""}:${number(effect.appliedCombatRound, 0)}:${number(effect.appliedCombatTurn, -1)}`;
      return appliedTick === currentTick;
    });
    if (filtered.length === effects.length) continue;
    await actor.update({ "system.effects.active": filtered });
    changed.push(actor);
  }
  return changed;
}

async function resolveActorUuid(uuid = "") {
  const key = String(uuid ?? "").trim();
  if (!key) return null;
  try {
    const document = await fromUuid(key);
    return document?.documentName === "Token" ? document.actor : document;
  } catch (_error) {
    return null;
  }
}

async function resolveTamerPartner(tamer) {
  if (!tamer || tamer.type !== "character") return null;
  const partner = tamer.system?.partner ?? {};
  for (const uuid of [partner.currentFormUuid, partner.uuid]) {
    const actor = await resolveActorUuid(uuid);
    if (actor && ["digimon", "npc"].includes(actor.type)) return actor;
  }
  return null;
}

function highestTormentFor(tamer) {
  return (tamer?.items ?? [])
    .filter((item) => item.type === "torment")
    .sort((left, right) => {
      const rightBoxes = Math.max(0, number(right.system?.boxes?.value, 0));
      const leftBoxes = Math.max(0, number(left.system?.boxes?.value, 0));
      return rightBoxes - leftBoxes || String(left.name).localeCompare(String(right.name));
    })[0] ?? null;
}

async function eligibleTormentorTamers(combat) {
  const actors = new Map();
  for (const combatant of combat?.combatants?.contents ?? []) {
    const actor = combatant.actor;
    if (!actor) continue;
    if (actor.type === "character") actors.set(actor.uuid, actor);

    const tamerUuid = String(actor.system?.tamer?.uuid ?? "").trim();
    if (tamerUuid) {
      const tamer = await resolveActorUuid(tamerUuid);
      if (tamer?.type === "character") actors.set(tamer.uuid, tamer);
    }
  }
  return [...actors.values()].filter((tamer) => Boolean(highestTormentFor(tamer)));
}

async function applyTormentorDebilitate({ boss, tamer } = {}) {
  const partner = await resolveTamerPartner(tamer);
  if (!boss || !tamer || !partner) return null;

  const effects = foundry.utils.deepClone(partner.system?.effects?.active ?? []);
  const existingIndex = effects.findIndex((effect) =>
    effect?.bossTormentor === true &&
    String(effect.bossTormentorTamerUuid ?? "") === String(tamer.uuid) &&
    String(effect.bossTormentorSourceUuid ?? "") === String(boss.uuid)
  );

  const effect = {
    id: existingIndex >= 0 ? effects[existingIndex].id : foundry.utils.randomID(),
    tag: "debilitate",
    label: `[DEBILITATE 2] — ${text("Atormentador", "Tormentor")}`,
    effectType: "negative",
    type: "negative",
    potency: 2,
    value: 2,
    usePotencyValue: true,
    durationRule: "bossTormentor",
    hasDuration: false,
    hasSpecialDuration: false,
    duration: 0,
    remaining: 0,
    sourceActorUuid: boss.uuid,
    sourceActorName: boss.name,
    targetActorUuid: partner.uuid,
    targetActorName: partner.name,
    appliedCombatId: String(getCombatId() ?? ""),
    bossTormentor: true,
    bossTormentorTamerUuid: tamer.uuid,
    bossTormentorSourceUuid: boss.uuid,
    cannotCleanse: true,
    cannotReduceDuration: true
  };

  if (existingIndex >= 0) effects[existingIndex] = effect;
  else effects.push(effect);
  await partner.update({ "system.effects.active": effects });
  return partner;
}

async function clearTormentorDebilitateForTamer(tamer, { combatId = String(getCombatId() ?? "") } = {}) {
  if (!tamer) return [];
  const updated = [];
  const candidates = new Map();
  const partner = await resolveTamerPartner(tamer);
  if (partner) candidates.set(partner.uuid, partner);
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (token.actor) candidates.set(token.actor.uuid, token.actor);
  }
  for (const actor of game.actors?.contents ?? []) candidates.set(actor.uuid, actor);

  for (const actor of candidates.values()) {
    const current = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
    const filtered = current.filter((effect) => !(
      effect?.bossTormentor === true &&
      String(effect.bossTormentorTamerUuid ?? "") === String(tamer.uuid) &&
      (!combatId || String(effect.appliedCombatId ?? "") === combatId)
    ));
    if (filtered.length === current.length) continue;
    await actor.update({ "system.effects.active": filtered });
    updated.push(actor);
  }
  return updated;
}

export async function handleBossTormentCheckResult(tamer, result = {}) {
  const degree = String(result?.finalDegree ?? result?.degree ?? "");
  if (!tamer || !["success", "criticalSuccess"].includes(degree)) return [];
  return clearTormentorDebilitateForTamer(tamer);
}

async function clearTormentorEffectsForCombat(combat) {
  const combatId = String(combat?.id ?? "");
  if (!combatId) return;
  const candidates = new Map();
  for (const combatant of combat?.combatants?.contents ?? []) {
    if (combatant.actor) candidates.set(combatant.actor.uuid, combatant.actor);
  }
  for (const actor of game.actors?.contents ?? []) candidates.set(actor.uuid, actor);

  for (const actor of candidates.values()) {
    const current = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
    const filtered = current.filter((effect) => !(
      effect?.bossTormentor === true && String(effect.appliedCombatId ?? "") === combatId
    ));
    if (filtered.length !== current.length) {
      await actor.update({ "system.effects.active": filtered });
    }
  }
}

function activeFrenzyEffect(actor) {
  return (Array.isArray(actor?.system?.effects?.active) ? actor.system.effects.active : [])
    .find((effect) => normalizeKey(String(effect?.tag ?? "").replace(/^\[|\]$/g, "")) === "frenzy") ?? null;
}

function currentFrenzyRound(combat = game?.combat) {
  return combat?.started ? Math.max(0, Math.floor(number(combat.round, 0))) : 0;
}

function currentFrenzyCombatId(combat = game?.combat) {
  return combat?.started ? String(combat.id ?? "") : "";
}

function frenzyStateFor(actor, combat = game?.combat) {
  const state = actor?.system?.combat?.bossQualities?.frenzy ?? {};
  const combatId = currentFrenzyCombatId(combat);
  const round = currentFrenzyRound(combat);
  const effectId = String(activeFrenzyEffect(actor)?.id ?? "");
  if (
    !combatId ||
    !effectId ||
    String(state.combatId ?? "") !== combatId ||
    Number(state.round ?? -1) !== round ||
    String(state.effectId ?? "") !== effectId
  ) {
    return { combatId, round, effectId, satisfied: false, overrideAllowed: false };
  }
  return foundry.utils.deepClone(state);
}

async function updateFrenzyState(actor, patch = {}, combat = game?.combat) {
  if (!actor) return null;
  const state = getBossState(actor);
  const current = frenzyStateFor(actor, combat);
  state.frenzy = {
    ...current,
    ...foundry.utils.deepClone(patch),
    combatId: currentFrenzyCombatId(combat),
    round: currentFrenzyRound(combat),
    effectId: String(activeFrenzyEffect(actor)?.id ?? current.effectId ?? ""),
    updatedAt: Date.now()
  };
  await setBossState(actor, state);
  return state.frenzy;
}

async function resolvePartnerTamer(partner) {
  if (!partner || !["digimon", "npc"].includes(partner.type)) return null;

  const direct = String(partner.system?.tamer?.uuid ?? "").trim();
  if (direct) {
    const actor = await resolveActorUuid(direct);
    if (actor?.type === "character") return actor;
  }

  const candidates = new Map();
  for (const combatant of game?.combat?.combatants?.contents ?? []) {
    if (combatant.actor?.type === "character") candidates.set(combatant.actor.uuid, combatant.actor);
  }
  for (const actor of game?.actors?.contents ?? []) {
    if (actor?.type === "character") candidates.set(actor.uuid, actor);
  }

  for (const tamer of candidates.values()) {
    const resolved = await resolveTamerPartner(tamer);
    if (resolved?.uuid === partner.uuid || resolved?.id === partner.id) return tamer;
  }

  return null;
}

function actorIsDefeated(actor) {
  if (!actor) return true;
  const wounds = actor.type === "character"
    ? number(actor.system?.derived?.wounds?.value ?? actor.system?.derived?.wounds?.current, 1)
    : number(actor.system?.miscStats?.wounds?.value, 1);
  return Boolean(actor.system?.combat?.defeated) || wounds <= 0;
}

export function getBossFrenzyNearestTargets(actor) {
  const sourceToken = tokenForActor(actor);
  if (!actor || !sourceToken) return { tokens: [], distance: null };

  const activeCombatActorUuids = new Set(
    (game?.combat?.started ? game.combat.combatants?.contents ?? [] : [])
      .filter((combatant) => combatant?.actor && !combatant.defeated && !actorIsDefeated(combatant.actor))
      .map((combatant) => String(combatant.actor.uuid ?? ""))
      .filter(Boolean)
  );

  const candidates = (canvas?.tokens?.placeables ?? []).filter((token) => {
    const target = token?.actor;
    if (!target || target.uuid === actor.uuid || target.id === actor.id) return false;
    if (actorIsDefeated(target)) return false;
    if (activeCombatActorUuids.size && !activeCombatActorUuids.has(String(target.uuid ?? ""))) return false;
    return true;
  }).map((token) => ({
    token,
    distance: Math.max(0, number(getTokenGridDistance(sourceToken, token), Number.POSITIVE_INFINITY))
  })).filter((entry) => Number.isFinite(entry.distance));

  if (!candidates.length) return { tokens: [], distance: null };
  const nearestDistance = Math.min(...candidates.map((entry) => entry.distance));
  const tokens = candidates
    .filter((entry) => Math.abs(entry.distance - nearestDistance) < 0.001)
    .map((entry) => entry.token)
    .sort((left, right) => String(left.name ?? "").localeCompare(String(right.name ?? "")));

  return { tokens, distance: nearestDistance };
}

export function getBossFrenzyEffect(actor) {
  return activeFrenzyEffect(actor);
}

export function isBossFrenzyTamerInfluenceBlocked(actor) {
  return Boolean(activeFrenzyEffect(actor));
}

export async function getBossFrenzyTamerGateData(tamer) {
  if (!tamer || tamer.type !== "character" || !game?.combat?.started) return null;
  const partner = await resolveTamerPartner(tamer);
  if (!partner) return null;
  const frenzy = activeFrenzyEffect(partner);
  if (!frenzy?.sourceActorUuid) return null;
  const caster = await resolveActorUuid(frenzy.sourceActorUuid);
  if (!caster) return null;

  const state = frenzyStateFor(partner);
  const tn = 10 + Math.max(0, number(getActorDerivedStat(caster, "dos"), 0));
  return {
    tamer,
    partner,
    caster,
    frenzy,
    state,
    tn,
    pending: !state.satisfied,
    overrideAllowed: Boolean(state.overrideAllowed)
  };
}

async function rollFrenzyCharismaCheck(tamer, tn) {
  const charisma = Math.max(0, number(tamer?.system?.attributes?.charisma?.value, 0));
  const roll = await new Roll("3d6 + @modifier", { modifier: charisma }).evaluate();
  const diceResults = (roll.dice?.[0]?.results ?? [])
    .filter((entry) => entry.active !== false)
    .map((entry) => number(entry.result, 0));
  const total = number(roll.total, 0);
  const outcome = getTamerCheckOutcome(total, tn, diceResults);

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    flavor: `<div class="dda-chat-card dda-effect-card effect-special"><h2>${text("[FRENZY] — Teste de Carisma", "[FRENZY] — Charisma Check")}</h2><p><strong>${escapeHtml(tamer.name)}</strong>: 3d6 + ${charisma} ${text("contra NA", "vs TN")} <strong>${tn}</strong>.</p><p><strong>${text("Resultado", "Result")}:</strong> ${escapeHtml(outcome.label)} (${total}).</p></div>`
  });

  return { roll, total, outcome, charisma, tn };
}

export async function attemptBossFrenzyOverride(tamer) {
  const data = await getBossFrenzyTamerGateData(tamer);
  if (!data?.pending) {
    ui.notifications.warn(text("Não há uma obrigação de [FRENZY] pendente para este Partner nesta rodada.", "There is no pending [FRENZY] obligation for this Partner this round."));
    return { success: false, reason: "notPending" };
  }

  if (data.overrideAllowed) {
    ui.notifications.info(text("O Teste já foi bem-sucedido. O Digimon pode atacar um alvo à escolha do Tamer nesta rodada.", "The Check already succeeded. The Digimon may attack a Target of the Tamer's choice this round."));
    return { success: true, alreadyAllowed: true, ...data };
  }

  const paid = await spendActorActions(tamer, 1, { requireActiveUnit: true, notify: true });
  if (!paid) return { success: false, reason: "actions", ...data };

  const check = await rollFrenzyCharismaCheck(tamer, data.tn);
  const degree = String(check?.outcome?.key ?? "");
  const success = degree === "success" || degree === "criticalSuccess";

  if (success) {
    await updateFrenzyState(data.partner, {
      satisfied: false,
      overrideAllowed: true,
      overrideTamerUuid: tamer.uuid,
      overrideDegree: degree,
      overrideAt: Date.now()
    });
  }

  let frenzyEnded = false;
  let remaining = number(data.frenzy.remaining ?? data.frenzy.duration, 0);
  if (degree === "criticalSuccess") {
    const effects = foundry.utils.deepClone(data.partner.system?.effects?.active ?? []);
    const index = effects.findIndex((effect) => String(effect?.id ?? "") === String(data.frenzy.id ?? ""));
    if (index >= 0) {
      remaining = Math.max(0, number(effects[index].remaining ?? effects[index].duration, 1) - 1);
      if (remaining <= 0) {
        effects.splice(index, 1);
        frenzyEnded = true;
      } else {
        effects[index].remaining = remaining;
      }
      await data.partner.update({ "system.effects.active": effects });
    }
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `<div class="dda-chat-card dda-effect-card ${success ? "effect-positive" : "effect-negative"}"><h2>[FRENZY]</h2><p><strong>${escapeHtml(tamer.name)}</strong> ${success
      ? text("conseguiu direcionar o ataque do Partner nesta rodada.", "may direct the Partner's Attack this round.")
      : text("não conseguiu direcionar o ataque do Partner.", "failed to direct the Partner's Attack.")}</p>${degree === "criticalSuccess" ? `<p>${frenzyEnded
        ? text("Sucesso Crítico: a Duração caiu para 0 e [FRENZY] terminou imediatamente.", "Critical Success: Duration fell to 0 and [FRENZY] ended immediately.")
        : text(`Sucesso Crítico: a Duração de [FRENZY] foi reduzida em 1 (restam ${remaining}).`, `Critical Success: [FRENZY] Duration was reduced by 1 (${remaining} remaining).`)}</p>` : ""}</div>`
  });

  return { success, frenzyEnded, remaining, check, ...data };
}

export function validateBossFrenzyAttackDeclaration({
  attacker,
  targetToken = null,
  attackFunctionType = "",
  hasNegativeEffect = false,
  areaTargetActorUuids = []
} = {}) {
  const frenzy = activeFrenzyEffect(attacker);
  if (!frenzy || !game?.combat?.started) return { active: false, allowed: true };

  const state = frenzyStateFor(attacker);
  if (state.satisfied) return { active: true, allowed: true, state, frenzy };

  const qualifies = String(attackFunctionType ?? "").trim().toLowerCase() === "damage" || Boolean(hasNegativeEffect);
  if (!qualifies) {
    return {
      active: true,
      allowed: false,
      reason: "attackType",
      message: text(
        "[FRENZY] exige um Ataque [DAMAGE] ou um Ataque com Efeito Negativo nesta rodada.",
        "[FRENZY] requires a [DAMAGE] Attack or an Attack with a Negative Effect this round."
      ),
      state,
      frenzy
    };
  }

  if (state.overrideAllowed) {
    return { active: true, allowed: true, state, frenzy, overrideAllowed: true };
  }

  const nearest = getBossFrenzyNearestTargets(attacker);
  const nearestUuids = new Set(nearest.tokens.map((token) => String(token.actor?.uuid ?? "")));
  const selectedUuids = new Set([
    String(targetToken?.actor?.uuid ?? ""),
    ...(areaTargetActorUuids ?? []).map((uuid) => String(uuid ?? ""))
  ].filter(Boolean));
  const targetsNearest = [...selectedUuids].some((uuid) => nearestUuids.has(uuid));

  if (!nearest.tokens.length) {
    return {
      active: true,
      allowed: false,
      unable: true,
      reason: "noTarget",
      message: text("[FRENZY] não encontrou nenhum outro alvo válido no Combate.", "[FRENZY] found no other valid Target in Combat."),
      state,
      frenzy,
      nearest
    };
  }

  if (!targetsNearest) {
    return {
      active: true,
      allowed: false,
      reason: "nearestTarget",
      message: text(
        `[FRENZY] obriga o Ataque contra o alvo mais próximo: ${nearest.tokens.map((token) => token.name).join(", ")}.`,
        `[FRENZY] forces the Attack against the nearest Target: ${nearest.tokens.map((token) => token.name).join(", ")}.`
      ),
      state,
      frenzy,
      nearest
    };
  }

  return { active: true, allowed: true, state, frenzy, nearest };
}

export async function recordBossFrenzyAttack(attacker, data = {}) {
  const frenzy = activeFrenzyEffect(attacker);
  if (!frenzy || !game?.combat?.started) return null;
  const state = frenzyStateFor(attacker);
  if (state.satisfied) return state;

  return updateFrenzyState(attacker, {
    ...state,
    satisfied: true,
    satisfiedByAttack: true,
    attackItemUuid: String(data.attackItem?.uuid ?? data.attackItemUuid ?? ""),
    attackName: String(data.attackItem?.name ?? data.attackName ?? ""),
    targetActorUuid: String(data.targetToken?.actor?.uuid ?? data.targetActorUuid ?? ""),
    targetActorName: String(data.targetToken?.actor?.name ?? data.targetActorName ?? ""),
    satisfiedAt: Date.now()
  });
}

async function applyFrenzyUnableDamage(actor, frenzy) {
  const stage = Math.max(0, Math.floor(number(actor.system?.stageValue ?? CONFIG.DDA?.stages?.[actor.system?.stage]?.stageValue, 0)));
  const damage = stage * 2;
  if (damage <= 0) return { damage: 0, before: 0, after: 0 };

  const woundsPath = actor.type === "character" ? "system.derived.wounds.value" : "system.miscStats.wounds.value";
  const visibleBefore = Math.max(0, number(foundry.utils.getProperty(actor, woundsPath), 0));
  let sourceActor = null;
  try {
    const sourceDocument = frenzy?.sourceActorUuid ? await fromUuid(frenzy.sourceActorUuid) : null;
    sourceActor = sourceDocument?.documentName === "Token" ? sourceDocument.actor : sourceDocument;
  } catch (_error) {
    sourceActor = null;
  }

  const { applyDamage } = await import("../rolls/damage-application.js");
  const damageResult = await applyDamage(actor, damage, {
    unalterable: true,
    attacker: sourceActor,
    damageSourceKind: "effect",
    damageLabel: "[FRENZY]",
    createChat: false
  });
  if (!damageResult) return { damage: 0, before: visibleBefore, after: visibleBefore, cancelled: true };

  const before = Math.max(0, number(damageResult?.before?.wounds, visibleBefore));
  const after = Math.max(0, number(damageResult?.after?.wounds, before));
  await updateFrenzyState(actor, {
    satisfied: true,
    satisfiedByUnableDamage: true,
    unableDamage: damage,
    sourceActorUuid: String(frenzy?.sourceActorUuid ?? ""),
    satisfiedAt: Date.now()
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dda-chat-card dda-effect-card effect-negative"><h2>[FRENZY]</h2><p><strong>${escapeHtml(actor.name)}</strong> ${text(
      `não conseguiu fazer um Ataque válido e sofreu ${damage} de Dano Inalterável (2 × Estágio ${stage}).`,
      `could not make a valid Attack and took ${damage} Unalterable Damage (2 × Stage ${stage}).`
    )}</p><p>${before} → <strong>${after}</strong></p></div>`
  });

  return { damage, before, after };
}

export async function resolveBossFrenzyEndTurn(actor) {
  const frenzy = activeFrenzyEffect(actor);
  if (!frenzy || !game?.combat?.started) return { active: false, allowEndTurn: true };
  const state = frenzyStateFor(actor);
  if (state.satisfied) return { active: true, allowEndTurn: true, state };

  let availability = { canAttack: false, reasons: [] };
  try {
    const attackModule = await import("../rolls/attack-roll.js");
    availability = await attackModule.getBossFrenzyAttackAvailability?.(actor) ?? availability;
  } catch (error) {
    console.error("DDA | Could not evaluate Frenzy Attack availability.", error);
    return {
      active: true,
      allowEndTurn: false,
      reason: "availabilityError",
      message: text("Não foi possível verificar com segurança se [FRENZY] pode atacar.", "Could not safely verify whether [FRENZY] can Attack.")
    };
  }

  if (availability.canAttack) {
    const nearest = getBossFrenzyNearestTargets(actor);
    const names = nearest.tokens.map((token) => token.name).join(", ") || text("nenhum", "none");
    ui.notifications.warn(text(
      `[FRENZY] ainda exige um Ataque nesta rodada. Alvo(s) mais próximo(s): ${names}.`,
      `[FRENZY] still requires an Attack this round. Nearest Target(s): ${names}.`
    ));
    return { active: true, allowEndTurn: false, state, availability, nearest };
  }

  const damage = await applyFrenzyUnableDamage(actor, frenzy);
  return { active: true, allowEndTurn: true, state: frenzyStateFor(actor), availability, damage };
}

function activeCharmEffect(actor) {
  return (Array.isArray(actor?.system?.effects?.active) ? actor.system.effects.active : [])
    .find((effect) => normalizeKey(String(effect?.tag ?? "").replace(/^\[|\]$/g, "")) === "charm") ?? null;
}

function resolveActorUuidSync(uuid = "") {
  const key = String(uuid ?? "").trim();
  if (!key) return null;

  for (const actor of game?.actors?.contents ?? []) {
    if (String(actor?.uuid ?? "") === key) return actor;
  }
  for (const combatant of game?.combat?.combatants?.contents ?? []) {
    if (String(combatant?.actor?.uuid ?? "") === key) return combatant.actor;
  }
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (String(token?.actor?.uuid ?? "") === key) return token.actor;
  }

  if (key.startsWith("Actor.")) {
    const actorId = key.split(".")[1] ?? "";
    return game?.actors?.get?.(actorId) ?? null;
  }
  return null;
}

function charmControllerUserIds(caster) {
  if (!caster) return [];
  const ownerLevel = CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  return (game?.users?.contents ?? [])
    .filter((user) => !user.isGM && caster.testUserPermission?.(user, ownerLevel))
    .map((user) => String(user.id ?? ""))
    .filter(Boolean)
    .sort();
}

export function getBossCharmControlData(actor, user = game?.user) {
  const charm = activeCharmEffect(actor);
  if (!charm) return { active: false, allowed: true, actor, charm: null, caster: null, controllerUserIds: [] };

  const caster = resolveActorUuidSync(charm.sourceActorUuid);
  const saved = actor?.system?.combat?.bossQualities?.charmControl ?? {};
  const controllerUserIds = caster
    ? charmControllerUserIds(caster)
    : (Array.isArray(saved.controllerUserIds) ? saved.controllerUserIds.map(String) : []);
  const userId = String(user?.id ?? "");
  const allowed = Boolean(user?.isGM || (userId && controllerUserIds.includes(userId)));

  return {
    active: true,
    allowed,
    actor,
    charm,
    caster,
    casterName: String(caster?.name ?? charm.sourceActorName ?? text("Conjurador", "Caster")),
    controllerUserIds
  };
}

export function canUserControlBossCharmedActor(actor, user = game?.user) {
  return getBossCharmControlData(actor, user).allowed;
}

export function ensureBossCharmActionController(actor, { user = game?.user, notify = true } = {}) {
  const data = getBossCharmControlData(actor, user);
  if (!data.active || data.allowed) return true;
  if (notify && String(user?.id ?? "") === String(game?.user?.id ?? "")) {
    ui.notifications.warn(text(
      `[CHARM]: as Ações de ${actor?.name ?? "este Digimon"} estão sob controle de ${data.casterName}.`,
      `[CHARM]: ${actor?.name ?? "this Digimon"}'s Actions are controlled by ${data.casterName}.`
    ));
  }
  return false;
}

function restoreCharmDelegationGrants(ownership, grants = {}) {
  let changed = false;
  const ownerLevel = CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  for (const [userId, grant] of Object.entries(grants ?? {})) {
    if (!grant?.delegated) continue;

    // Restore only the OWNER grant that Charm itself installed. If someone
    // deliberately changed this user's permission while Charm was active,
    // preserve that newer ownership decision instead of overwriting it.
    if (Number(ownership[userId] ?? 0) !== ownerLevel) continue;

    if (grant.previousLevel === null || grant.previousLevel === undefined) {
      if (Object.prototype.hasOwnProperty.call(ownership, userId)) {
        delete ownership[userId];
        changed = true;
      }
    } else if (Number(ownership[userId]) !== Number(grant.previousLevel)) {
      ownership[userId] = Number(grant.previousLevel);
      changed = true;
    }
  }
  return changed;
}

export function getBossCharmAuthorizedUserIds(actor, { includeGMs = true } = {}) {
  const data = getBossCharmControlData(actor, game?.user);
  if (!data.active) return null;
  const ids = new Set(data.controllerUserIds.map(String));
  if (includeGMs) {
    for (const user of game?.users?.contents ?? []) {
      if (user.isGM) ids.add(String(user.id ?? ""));
    }
  }
  return Array.from(ids).filter(Boolean);
}

export async function reconcileBossCharmControl(actor) {
  if (!actor) return null;
  const gm = primaryActiveGM();
  if (!game?.user?.isGM || gm?.id !== game.user.id) return null;

  const actorKey = String(actor.uuid ?? actor.id ?? "");
  if (!actorKey || charmControlReconcileActors.has(actorKey)) return null;
  charmControlReconcileActors.add(actorKey);

  try {
    const state = getBossState(actor);
    const previous = foundry.utils.deepClone(state.charmControl ?? {});
    const charm = activeCharmEffect(actor);
    const ownership = foundry.utils.deepClone(actor.ownership ?? {});
    let ownershipChanged = false;

    const sameCharm = Boolean(
      charm && previous.active &&
      String(previous.effectId ?? "") === String(charm.id ?? "") &&
      String(previous.sourceActorUuid ?? "") === String(charm.sourceActorUuid ?? "")
    );

    if (previous.active && !sameCharm) {
      ownershipChanged = restoreCharmDelegationGrants(ownership, previous.grants) || ownershipChanged;
    }

    if (!charm) {
      if (!previous.active && !ownershipChanged) return { active: false, changed: false };
      delete state.charmControl;
      await actor.update({
        ...(ownershipChanged ? { ownership } : {}),
        [BOSS_STATE_PATH]: state
      }, { ddaCharmDelegation: true });
      return { active: false, changed: true };
    }

    const caster = await resolveActorUuid(charm.sourceActorUuid);
    const controllerUserIds = charmControllerUserIds(caster);
    const ownerLevel = CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
    const grants = sameCharm ? foundry.utils.deepClone(previous.grants ?? {}) : {};

    for (const userId of controllerUserIds) {
      if (Number(ownership[userId] ?? 0) >= ownerLevel) continue;
      grants[userId] = {
        delegated: true,
        previousLevel: Object.prototype.hasOwnProperty.call(ownership, userId)
          ? Number(ownership[userId])
          : null
      };
      ownership[userId] = ownerLevel;
      ownershipChanged = true;
    }

    for (const [userId, grant] of Object.entries(grants)) {
      if (controllerUserIds.includes(userId)) continue;
      ownershipChanged = restoreCharmDelegationGrants(ownership, { [userId]: grant }) || ownershipChanged;
      delete grants[userId];
    }

    state.charmControl = {
      active: true,
      effectId: String(charm.id ?? ""),
      sourceActorUuid: String(charm.sourceActorUuid ?? ""),
      sourceActorName: String(caster?.name ?? charm.sourceActorName ?? ""),
      controllerUserIds,
      grants,
      updatedAt: Date.now()
    };

    const stateChanged = JSON.stringify(previous) !== JSON.stringify(state.charmControl);
    if (!ownershipChanged && !stateChanged) {
      return { active: true, changed: false, controllerUserIds, caster };
    }

    await actor.update({
      ...(ownershipChanged ? { ownership } : {}),
      [BOSS_STATE_PATH]: state
    }, { ddaCharmDelegation: true });

    return { active: true, changed: true, controllerUserIds, caster };
  } finally {
    charmControlReconcileActors.delete(actorKey);
  }
}

async function reconcileAllBossCharmControls() {
  const gm = primaryActiveGM();
  if (!game?.user?.isGM || gm?.id !== game.user.id) return;
  const actors = new Map();
  for (const actor of game?.actors?.contents ?? []) actors.set(actor.uuid, actor);
  for (const combatant of game?.combat?.combatants?.contents ?? []) {
    if (combatant.actor) actors.set(combatant.actor.uuid, combatant.actor);
  }
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (token.actor) actors.set(token.actor.uuid, token.actor);
  }
  for (const actor of actors.values()) {
    if (!activeCharmEffect(actor) && !actor.system?.combat?.bossQualities?.charmControl?.active) continue;
    await reconcileBossCharmControl(actor);
  }
}

function isInvoluntaryCharmMovement(options = {}) {
  const context = options?.ddaMovementContext;
  if (context && context.voluntary === false) return true;
  return Boolean(
    options?.ddaForcedMovement ||
    options?.ddaAreaPassMovement ||
    options?.ddaClashForcedMovement ||
    options?.ddaDistantForce ||
    options?.ddaExtendedGrapplePull ||
    options?.ddaThickSkinReflection ||
    options?.ddaClashPinFall ||
    options?.ddaClashMoveFollower ||
    options?.ddaGiantHijackerFollow ||
    options?.ddaGiantHijackerAttach
  );
}

export async function getBossCharmContestData(tamer) {
  const partner = await resolveTamerPartner(tamer);
  if (!partner) return null;
  const charm = activeCharmEffect(partner);
  if (!charm?.sourceActorUuid) return null;
  const caster = await resolveActorUuid(charm.sourceActorUuid);
  if (!caster) return null;
  const tn = 10 + Math.max(0, number(getActorDerivedStat(caster, "bit"), 0));
  return { tamer, partner, caster, charm, tn };
}

export async function contestBossCharm(tamer) {
  const data = await getBossCharmContestData(tamer);
  if (!data) {
    ui.notifications.warn(text("O Partner deste Tamer não está sob [CHARM].", "This Tamer's Partner is not under [CHARM]."));
    return { success: false, reason: "noCharm" };
  }

  const eligibleSkills = Object.entries(tamer.system?.skills ?? {})
    .filter(([, skill]) => ["charisma", "willpower"].includes(String(skill?.attributes?.[0] ?? "").toLowerCase()));
  if (!eligibleSkills.length) {
    ui.notifications.warn(text("Nenhuma Perícia de Carisma ou Força de Vontade foi encontrada.", "No Charisma or Willpower Skill was found."));
    return { success: false, reason: "noSkill" };
  }

  const skillKey = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-defensive-quality-window"],
    window: { title: text("Contestar [CHARM]", "Contest [CHARM]") },
    content: `<form class="dda-roll-dialog"><p>${text(
      `Gaste <strong>2 Ações</strong> e faça um Teste de Carisma ou Força de Vontade contra NA <strong>${data.tn}</strong>.`,
      `Spend <strong>2 Actions</strong> and make a Charisma or Willpower Skill Check against TN <strong>${data.tn}</strong>.`
    )}</p><div class="form-group"><label>${text("Perícia", "Skill")}</label><select name="skill">${eligibleSkills.map(([key, skill]) => `<option value="${escapeHtml(key)}">${escapeHtml(game.i18n?.localize?.(skill.label) ?? skill.label ?? key)}</option>`).join("")}</select></div></form>`,
    ok: { label: text("Fazer Teste", "Make Check"), callback: (_event, button) => String(button.form.elements.skill?.value ?? "") },
    rejectClose: false,
    modal: true
  });
  if (!skillKey) return { success: false, reason: "cancelled" };

  const paid = await spendActorActions(tamer, 2, { requireActiveUnit: Boolean(game?.combat?.started), notify: true });
  if (!paid) return { success: false, reason: "actions" };

  const check = await rollTamerCheck(tamer, skillKey, {
    fixedTn: data.tn,
    title: text("Contestar [CHARM]", "Contest [CHARM]")
  });
  const success = ["success", "criticalSuccess"].includes(String(check?.outcome?.key ?? check?.degree ?? check?.result ?? "")) || Number(check?.total ?? -Infinity) >= data.tn;
  if (!success) return { success: false, check, ...data };

  const effects = foundry.utils.deepClone(data.partner.system?.effects?.active ?? []);
  const filtered = effects.filter((effect) => String(effect?.id ?? "") !== String(data.charm.id ?? ""));
  await data.partner.update({ "system.effects.active": filtered });
  await reconcileBossCharmControl(data.partner);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: tamer }),
    content: `<div class="dda-chat-card dda-effect-card effect-positive"><h2>${text("[CHARM] encerrado", "[CHARM] ended")}</h2><p><strong>${escapeHtml(tamer.name)}</strong> ${text("libertou", "freed")} <strong>${escapeHtml(data.partner.name)}</strong>.</p></div>`
  });
  return { success: true, check, ...data };
}

async function useTormentor(actor, item) {
  const combat = game?.combat;
  if (!combat?.started) {
    ui.notifications.warn(text("Atormentador só pode ser usado durante um Combate.", "Tormentor can only be used during Combat."));
    return { handled: true, success: false };
  }

  const combatId = String(combat.id ?? "");
  const state = getBossState(actor);
  if (String(state.tormentor?.combatId ?? "") === combatId && state.tormentor?.used) {
    ui.notifications.warn(text("Atormentador já foi usado neste Combate.", "Tormentor has already been used this Combat."));
    return { handled: true, success: false };
  }

  const tamers = await eligibleTormentorTamers(combat);
  if (!tamers.length) {
    ui.notifications.warn(text("Nenhum Tamer participante possui Tormento para testar.", "No participating Tamer has a Torment to test."));
    return { handled: true, success: false };
  }

  const paid = await spendActorActions(actor, 1, { requireActiveUnit: true, notify: true });
  if (!paid) return { handled: true, success: false };

  state.tormentor = { combatId, used: true, qualityId: String(item.id ?? ""), usedAt: Date.now() };
  await setBossState(actor, state);

  const results = [];
  for (const tamer of tamers) {
    const torment = highestTormentFor(tamer);
    if (!torment) continue;
    const check = await rollTormentCheck(tamer, torment);
    const success = ["success", "criticalSuccess"].includes(String(check?.finalDegree ?? ""));
    const partner = success ? null : await applyTormentorDebilitate({ boss: actor, tamer });
    results.push({ tamer, torment, check, success, partner });
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dda-chat-card dda-effect-card effect-negative">
      <h2>${escapeHtml(item.name)}</h2>
      <p>${text("Atormentador foi usado uma vez neste Combate.", "Tormentor was used once this Combat.")}</p>
      <ul class="dda-effect-list">${results.map((entry) => `<li>${escapeHtml(entry.tamer.name)} — ${escapeHtml(entry.torment.name)}: <strong>${escapeHtml(String(entry.check?.finalDegree ?? text("sem resultado", "no result")))}</strong>${entry.partner ? ` → [DEBILITATE 2] (${escapeHtml(entry.partner.name)})` : ""}</li>`).join("")}</ul>
    </div>`
  });

  return { handled: true, success: true, results };
}

function isDataAbsorbQuality(item) {
  return Boolean(qualityBossData(item)?.dataAbsorb);
}

export async function useBossQualityAction(actor, item) {
  if (!actor || item?.type !== "quality") return { handled: false };
  if (!ensureBossCharmActionController(actor, { user: game?.user, notify: true })) {
    return { handled: true, success: false, reason: "charmController" };
  }

  if (qualityBossData(item)?.gravity) {
    return useGravity(actor, item);
  }

  if (qualityBossData(item)?.tormentor) {
    return useTormentor(actor, item);
  }

  if (!isDataAbsorbQuality(item)) return { handled: false };

  if (!game?.combat?.started) {
    ui.notifications.warn(text(
      "Absorção de Dados só pode ser ativada durante um Combate.",
      "Data Absorb can only be toggled during Combat."
    ));
    return { handled: true, success: false };
  }

  const paid = await spendActorActions(actor, 1, {
    requireActiveUnit: true,
    notify: true
  });
  if (!paid) return { handled: true, success: false };

  const nextActive = !Boolean(item.system?.activation?.active);
  await item.update({ "system.activation.active": nextActive });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special">
        <h2>${escapeHtml(item.name)}</h2>
        <p><strong>${escapeHtml(actor.name)}</strong> ${nextActive
          ? text("ativou Absorção de Dados.", "activated Data Absorb.")
          : text("desativou Absorção de Dados.", "deactivated Data Absorb.")}</p>
        <ul class="dda-effect-list">
          <li>${text("Custo", "Cost")}: <strong>1 Action</strong>.</li>
          <li>${nextActive
            ? text("Movimento reduzido a 0; cura ocorre no fim da rodada.", "Movement is reduced to 0; healing occurs at the end of the round.")
            : text("Movimento restaurado ao valor normal.", "Movement returns to its normal value.")}</li>
        </ul>
      </div>`
  });

  actor.sheet?.render(false);
  return { handled: true, success: true, active: nextActive };
}

export function isDataAbsorbActive(actor) {
  const quality = findBossQuality(actor, "dataAbsorb");
  return Boolean(quality?.system?.activation?.active);
}

async function healDataAbsorbAtRoundEnd(combat) {
  if (!combat?.started) return;

  const seenActors = new Set();
  for (const combatant of combat.combatants?.contents ?? []) {
    const actor = combatant.actor;
    if (!actor || seenActors.has(actor.uuid)) continue;
    seenActors.add(actor.uuid);

    const quality = findBossQuality(actor, "dataAbsorb");
    if (!quality?.system?.activation?.active) continue;

    const path = actor.type === "character"
      ? "system.derived.wounds"
      : "system.miscStats.wounds";
    const wounds = foundry.utils.getProperty(actor, path);
    if (!wounds) continue;

    const current = Math.max(0, number(wounds.value));
    const maximum = Math.max(current, number(wounds.max, current));
    if (current >= maximum) continue;

    const boss = qualityBossData(quality);
    const firewall = Boolean(findQuality(actor, ["firewall"]));
    const requested = Math.max(0, number(
      firewall ? boss.firewallHealPerRound : boss.healPerRound,
      firewall ? 8 : 6
    ));
    const bossTemplateHeal = actor.type === "npc"
      ? await healBossTemplatePools(actor, requested, combat)
      : null;

    if (bossTemplateHeal) {
      if (bossTemplateHeal.healed <= 0) continue;
      continue;
    }

    const healed = Math.min(requested, maximum - current);
    if (healed <= 0) continue;

    await actor.update({ [`${path}.value`]: current + healed });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div class="dda-chat-card dda-effect-card effect-positive">
          <h2>${escapeHtml(quality.name)}</h2>
          <p><strong>${escapeHtml(actor.name)}</strong> ${text(
            `recuperou ${healed} Caixa(s) de Ferimento no fim da rodada.`,
            `recovered ${healed} Wound Box(es) at the end of the round.`
          )}</p>
          <p>${current} → <strong>${current + healed}</strong> / ${maximum}</p>
        </div>`
    });
  }
}

export function isWeaponBenefitQuality(item) {
  if (item?.type !== "quality") return false;
  const source = normalizeKey(
    item.system?.sourceId ?? item.system?.id ?? item.system?.originalName ?? item.name ?? ""
  );
  const requirementRaw = String(item.system?.requirements?.qualityNames ?? "").toLowerCase();
  const requirement = normalizeKey(requirementRaw);

  if (["arma", "weapon"].includes(source)) return true;
  if (source.startsWith("armamentodedigizoide") || source.includes("digizoidweaponry")) return true;
  if (qualityBossData(item)?.weaponExpert) return true;

  // Match Weapon/Arma as their own requirement, not the "arma" substring in
  // Armadura. Digizoid Weaponry dependencies are also weapon benefits.
  if (/(^|[^a-zà-ÿ])(weapon|arma)([^a-zà-ÿ]|$)/i.test(requirementRaw)) return true;
  return requirement.includes("armamentodedigizoide") || requirement.includes("digizoidweaponry");
}

export function isActorBossDisarmed(actor) {
  const state = actor?.system?.combat?.bossQualities?.disarm ?? {};
  const combatId = String(getCombatId() ?? "");
  return Boolean(combatId && String(state.combatId ?? "") === combatId && state.active);
}

export async function applyBossDisarm({ attacker, defender, damageResult, damageEntry = {} } = {}) {
  if (!attacker || !defender || !damageResult) return null;
  if (!damageEntry?.bossDisarm) return null;

  const effectiveDamage = Math.max(0, number(
    damageResult?.damageInfo?.effectiveDamage ??
    damageResult?.result?.healthDamage ??
    0
  ));
  if (effectiveDamage < 2) return null;

  const combatId = String(getCombatId() ?? "");
  if (!combatId) return null;

  const state = getBossState(defender);
  state.disarm = {
    active: true,
    combatId,
    sourceActorUuid: String(attacker.uuid ?? ""),
    sourceAttackUuid: String(damageEntry.attackItemUuid ?? ""),
    appliedAt: Date.now()
  };
  await setBossState(defender, state);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: defender }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-negative">
        <h2>[DISARM]</h2>
        <p><strong>${escapeHtml(defender.name)}</strong> ${text(
          "perdeu os benefícios de Arma e Qualidades associadas pelo restante do Combate.",
          "lost the benefits of Weapon and associated Qualities for the rest of Combat."
        )}</p>
      </div>`
  });

  return state.disarm;
}

function isSummonedMinion(actor) {
  return actor?.flags?.[SYSTEM_ID]?.evokerCreation?.kind === "minion";
}

function primaryActiveGM() {
  return (game?.users?.contents ?? [])
    .filter((user) => user.active && user.isGM)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
}

async function resolveMassDestructionLocal({ attacker, defender, damageResult, damageEntry = {} } = {}) {
  if (!attacker || !defender || !damageResult) return null;
  if (!damageEntry?.bossMassDestruction) return null;
  if (!hasBossQuality(attacker, "massDestruction")) return null;
  if (!isSummonedMinion(defender)) return null;
  if (number(damageResult?.after?.wounds, 1) > 0) return null;

  const offensive = foundry.utils.deepClone(attacker.system?.combat?.offensiveQualities ?? {});
  const counter = offensive.counterattack ?? {};
  const combatId = String(getCombatId() ?? "");
  const restoreUses = Math.max(0, Math.floor(number(damageEntry.counterattackUsesSpent, 0)));

  if (restoreUses > 0 && String(counter.combatId ?? "") === combatId) {
    counter.used = Math.max(0, Math.floor(number(counter.used, 0)) - restoreUses);
    offensive.counterattack = counter;
  }

  const actions = Math.max(0, number(attacker.system?.combat?.actions?.value));
  const maximum = Math.max(actions, number(attacker.system?.combat?.actions?.max, 2));
  const nextActions = Math.min(maximum, actions + 1);

  await attacker.update({
    "system.combat.offensiveQualities": offensive,
    "system.combat.actions.value": nextActions
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-positive">
        <h2>${text("Destruição em Massa", "Mass Destruction")}</h2>
        <p><strong>${escapeHtml(attacker.name)}</strong> ${text(
          `destruiu o Minion invocado ${escapeHtml(defender.name)} com Contra-Ataque.`,
          `destroyed the summoned Minion ${escapeHtml(defender.name)} with Counterattack.`
        )}</p>
        <ul class="dda-effect-list">
          <li>${text("Uso de Contra-Ataque restaurado", "Counterattack use restored")}: <strong>${restoreUses}</strong>.</li>
          <li>${text("Ações", "Actions")}: ${actions} → <strong>${nextActions}</strong>.</li>
        </ul>
      </div>`
  });

  return { restoreUses, actionsBefore: actions, actionsAfter: nextActions };
}

export async function resolveMassDestruction({ attacker, defender, damageResult, damageEntry = {} } = {}) {
  if (!attacker || !defender || !damageResult) return null;
  if (!damageEntry?.bossMassDestruction) return null;

  if (game.user?.isGM || attacker.isOwner) {
    return resolveMassDestructionLocal({ attacker, defender, damageResult, damageEntry });
  }

  const gm = primaryActiveGM();
  if (!gm || !game.socket) return null;

  game.socket.emit(`system.${game.system.id}`, {
    scope: BOSS_SOCKET_SCOPE,
    type: BOSS_SOCKET_MASS_DESTRUCTION,
    targetGmId: gm.id,
    attackerUuid: String(attacker.uuid ?? ""),
    defenderUuid: String(defender.uuid ?? ""),
    damageEntry: foundry.utils.deepClone(damageEntry),
    afterWounds: Math.max(0, number(damageResult?.after?.wounds, 0))
  });

  return { requestedFromGM: true };
}

export async function resolveBossDamagePostProcessing({ attacker, defender, damageResult, damageEntry = {} } = {}) {
  const results = {};
  results.disarm = await applyBossDisarm({ attacker, defender, damageResult, damageEntry });
  results.massDestruction = await resolveMassDestruction({ attacker, defender, damageResult, damageEntry });
  return results;
}

export function registerBossQualities() {
  registerBossTrueSightDetectionMode();

  if (!bossQualitySocketRegistered && game.socket) {
    bossQualitySocketRegistered = true;

    game.socket.on(`system.${game.system.id}`, async (payload = {}) => {
      if (payload?.scope !== BOSS_SOCKET_SCOPE) return;
      if (payload?.type !== BOSS_SOCKET_MASS_DESTRUCTION) return;

      const gm = primaryActiveGM();
      if (!game.user?.isGM || gm?.id !== game.user.id) return;
      if (String(payload.targetGmId ?? "") !== String(game.user.id)) return;

      try {
        const attackerDoc = payload.attackerUuid
          ? await fromUuid(payload.attackerUuid)
          : null;
        const defenderDoc = payload.defenderUuid
          ? await fromUuid(payload.defenderUuid)
          : null;
        const attacker = attackerDoc?.documentName === "Token" ? attackerDoc.actor : attackerDoc;
        const defender = defenderDoc?.documentName === "Token" ? defenderDoc.actor : defenderDoc;
        if (!attacker || !defender) return;

        await resolveMassDestructionLocal({
          attacker,
          defender,
          damageResult: { after: { wounds: Math.max(0, number(payload.afterWounds, 0)) } },
          damageEntry: payload.damageEntry ?? {}
        });
      } catch (error) {
        console.error("DDA | Mass Destruction GM authority resolution failed.", error);
      }
    });
  }

  Hooks.on("updateActor", (actor, changed = {}, options = {}) => {
    if (options?.ddaCharmDelegation) return;
    const effectsChanged = foundry.utils.hasProperty(changed, "system.effects.active");
    const ownershipChanged = foundry.utils.hasProperty(changed, "ownership");
    const suppressionChanged = foundry.utils.hasProperty(changed, "system.combat.bossQualities.suppression");
    if (!effectsChanged && !ownershipChanged && !suppressionChanged) return;

    const gm = primaryActiveGM();
    if (!game.user?.isGM || gm?.id !== game.user.id) return;

    if (suppressionChanged) scheduleBossTrueSightReconcile(actor);

    if (effectsChanged && (activeCharmEffect(actor) || actor.system?.combat?.bossQualities?.charmControl?.active)) {
      void reconcileBossCharmControl(actor).catch((error) => {
        console.error("DDA | Charm control reconciliation failed after Effect update.", error);
      });
    }

    if (ownershipChanged) {
      void reconcileAllBossCharmControls().catch((error) => {
        console.error("DDA | Charm control reconciliation failed after ownership update.", error);
      });
    }
  });

  Hooks.on("preUpdateToken", (tokenDocument, changed = {}, options = {}, userId = "") => {
    if (!("x" in changed || "y" in changed || "elevation" in changed)) return true;
    if (isInvoluntaryCharmMovement(options)) return true;
    const actor = tokenDocument?.actor;
    if (!actor || !activeCharmEffect(actor)) return true;
    const user = game?.users?.get?.(userId) ?? null;
    if (canUserControlBossCharmedActor(actor, user)) return true;
    if (String(userId ?? "") === String(game?.user?.id ?? "")) {
      ensureBossCharmActionController(actor, { user, notify: true });
    }
    return false;
  });

  const scheduleTrueSightForItem = (item) => {
    if (item?.type !== "quality") return;
    const actor = item.parent?.documentName === "Actor" ? item.parent : null;
    if (actor) scheduleBossTrueSightReconcile(actor);
  };

  Hooks.on("createItem", (item) => scheduleTrueSightForItem(item));
  Hooks.on("updateItem", (item) => scheduleTrueSightForItem(item));
  Hooks.on("deleteItem", (item) => scheduleTrueSightForItem(item));

  Hooks.on("createToken", (tokenDocument) => {
    if (!game.user?.isGM) return;
    setTimeout(() => {
      void reconcileBossTrueSightToken(tokenDocument).catch((error) => {
        console.error("DDA | True Sight new-token reconciliation failed.", error);
      });
    }, 0);
  });

  Hooks.on("canvasReady", () => {
    scheduleBossTrueSightReconcile();
  });

  Hooks.once("ready", () => {
    void reconcileAllBossCharmControls().catch((error) => {
      console.error("DDA | Initial Charm control reconciliation failed.", error);
    });
    scheduleBossTrueSightReconcile();
  });

  Hooks.on("updateCombat", (combat, changed = {}) => {
    if (!game.user?.isGM || !combat?.started) return;
    if (!("turn" in changed || "round" in changed)) return;
    const sourceActor = combat.combatant?.actor;
    if (!sourceActor) return;
    void expireBossInvincibleForSource(sourceActor, combat).catch((error) => {
      console.error("DDA | Invincible start-of-caster-turn expiration failed.", error);
    });
  });

  Hooks.on("combatRound", (combat, updateData = {}, updateOptions = {}) => {
    const direction = number(updateOptions?.direction, 0);
    const nextRound = number(updateData?.round, combat?.round ?? 0);
    const currentRound = number(combat?.round, 0);
    if (direction <= 0 || nextRound <= currentRound || currentRound <= 0) return;
    void healDataAbsorbAtRoundEnd(combat).catch((error) => {
      console.error("DDA | Data Absorb end-of-round healing failed.", error);
    });
  });

  Hooks.on("combatStart", (combat) => {
    // Stale combat-scoped states are ignored by combatId checks. Explicitly
    // deactivate Data Absorb so a prior encounter cannot carry its toggle in.
    for (const combatant of combat?.combatants?.contents ?? []) {
      const quality = findBossQuality(combatant.actor, "dataAbsorb");
      if (quality?.system?.activation?.active) {
        void quality.update({ "system.activation.active": false });
      }
    }
  });

  Hooks.on("updateToken", (document, changed = {}, options = {}) => {
    if ("x" in changed || "y" in changed || "width" in changed || "height" in changed) {
      scheduleGravityReconcile();
    }
    if (!options?.ddaTrueSightReconcile && ("actorId" in changed || "actorLink" in changed || "delta" in changed)) {
      scheduleBossTrueSightReconcile(document?.actor ?? null);
    }
  });

  Hooks.on("combatStart", (combat) => {
    const gm = primaryActiveGM();
    if (!game.user?.isGM || gm?.id !== game.user.id) return;
    void (async () => {
      await clearGravityForCombat(combat);
      await clearSuppressionForCombat(combat);
      await reconcileAllSuppression();
    })().catch((error) => {
      console.error("DDA | Boss combat-start area setup failed.", error);
    });
  });

  Hooks.on("combatEnd", (combat) => {
    const gm = primaryActiveGM();
    if (!game.user?.isGM || gm?.id !== game.user.id) return;
    void clearGravityForCombat(combat).catch((error) => {
      console.error("DDA | Gravity combat-end cleanup failed.", error);
    });
    void clearTormentorEffectsForCombat(combat).catch((error) => {
      console.error("DDA | Tormentor combat-end cleanup failed.", error);
    });
    void clearSuppressionForCombat(combat).catch((error) => {
      console.error("DDA | Suppression combat-end cleanup failed.", error);
    });
  });

  Hooks.on("deleteCombat", (combat) => {
    const gm = primaryActiveGM();
    if (!game.user?.isGM || gm?.id !== game.user.id) return;
    void clearGravityForCombat(combat).catch((error) => {
      console.error("DDA | Gravity combat deletion cleanup failed.", error);
    });
    void clearTormentorEffectsForCombat(combat).catch((error) => {
      console.error("DDA | Tormentor combat deletion cleanup failed.", error);
    });
    void clearSuppressionForCombat(combat).catch((error) => {
      console.error("DDA | Suppression combat deletion cleanup failed.", error);
    });
  });

  game.dda ??= {};
  game.dda.bossQualities = {
    findQuality: findBossQuality,
    hasQuality: hasBossQuality,
    hasTrueSight: isBossTrueSightObserver,
    trueSightRevealsHide: doesBossTrueSightRevealHide,
    isTokenVisibleToObserver: isTokenVisibleToBossObserver,
    reconcileTrueSight: reconcileAllBossTrueSightTokens,
    useQuality: useBossQualityAction,
    adaptiveDodgeBonus: getAdaptiveIntelligenceDodgeBonus,
    recordAdaptiveExposure: recordAdaptiveIntelligenceExposure,
    isDisarmed: isActorBossDisarmed,
    reconcileGravity: reconcileGravityForSource,
    handleTormentCheckResult: handleBossTormentCheckResult,
    getCharmContestData: getBossCharmContestData,
    contestCharm: contestBossCharm,
    getCharmControlData: getBossCharmControlData,
    getCharmAuthorizedUserIds: getBossCharmAuthorizedUserIds,
    canControlCharmedActor: canUserControlBossCharmedActor,
    ensureCharmActionController: ensureBossCharmActionController,
    reconcileCharmControl: reconcileBossCharmControl,
    getFrenzyTamerGateData: getBossFrenzyTamerGateData,
    attemptFrenzyOverride: attemptBossFrenzyOverride,
    getFrenzyEffect: getBossFrenzyEffect,
    nearestFrenzyTargets: getBossFrenzyNearestTargets,
    validateFrenzyAttack: validateBossFrenzyAttackDeclaration,
    recordFrenzyAttack: recordBossFrenzyAttack,
    resolveFrenzyEndTurn: resolveBossFrenzyEndTurn,
    isFrenzyTamerInfluenceBlocked: isBossFrenzyTamerInfluenceBlocked,
    isInvincibleAgainstAttack: isBossInvincibleAgainstAttack,
    invincibleBatteryMinimum: getBossInvincibleBatteryMinimum,
    ensureQualityNotSuppressed: ensureBossQualityNotSuppressed,
    reconcileSuppression: reconcileAllSuppression
  };
}
