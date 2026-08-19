import { withDDAMovementContext } from "../canvas/movement-context.js";
import { rollPool } from "./pool-roll.js";
import { getTamerCheckOutcome } from "./check-roll.js";
import { getDDASetting } from "../settings.js";

import {
  combatantEndedThisRound,
  getActiveDDAUnitContext,
  getCombatantForActor
} from "../combat/initiative.js";

import { getFlankContext } from "../combat/positioning.js";
import {
  requestStandardIntercede
} from "../combat/intercede.js";
import { requestEvokerProtectorIntercede } from "../combat/evoker-qualities.js";
import {
  getCoordinatedAssaultBonus,
  incrementCoordinatedAssaultMarks
} from "../combat/digimon-actions.js";

import {
  getTamerHoldAttackWindow,
  payPartnerInterruptAction,
  resolveLinkedTamerForPartner
} from "../combat/tamer-actions.js";

import {
  hasUnlockedOfficialTamerTalent
} from "../rules/tamer-resources.js";

import {
  getVanishBlindAttackPenalty,
  getVanishBlindDodgePenalty,
  maybeOfferHeroicExemplarAfterHit
} from "../rules/tamer-talent-special-orders.js";

import {
  consumeArmedAttackTalent,
  getArmedAttackTalentState,
  requestDistractingGesture
} from "../rules/tamer-talent-attack-direct.js";

import {
  getOverlookedBlindAttackPenalty
} from "../rules/tamer-talent-combat-survival.js";

import {
  runAreaAttackWorkflow
} from "../combat/area-attacks/area-attack-controller.js";

import {
  getCurrentMovementSpent
} from "../canvas/movement-tracker.js";

import {
  clearHiddenAfterInterference,
  getHordeDuelistAttackModifier,
  getReachModeData,
  getSneakAttackState,
  maybeTriggerCounterattack
} from "../combat/offensive-qualities.js";
import {
  getAdaptiveIntelligenceDodgeBonus,
  getBossImmunityEffectTags,
  getBossSpatialDistortionExtraActionCost,
  hasBossQuality,
  getBossWeaponExpertExtraActionCost,
  getBossWeaponExpertTagRank,
  getBossInvincibleBatteryMinimum,
  isBossInvincibleAgainstAttack,
  recordBossInvincibleSignatureUse,
  isActorBossDisarmed,
  isBossTrueSightObserver,
  isTokenVisibleToBossObserver,
  isWeaponBenefitQuality,
  prepareBossSpatialDistortionDeclaration,
  prepareBossWeaponExpertDeclaration,
  recordAdaptiveIntelligenceExposure
} from "../combat/boss-qualities.js";

import {
  convertResolveWithAssuredDestruction,
  getCombatMonsterResolve,
  requestBrace,
  requestSubstitute,
  setCombatMonsterResolve,
  triggerSavagery
} from "../combat/defensive-qualities.js";

import {
  consumeBraveHeartDamageBonus,
  getSentryMeleeDodgePenalty,
  getStanceAttackModifier,
  maybeTriggerFierceSoulRepeat
} from "../combat/stance-qualities.js";

import {
  canAttackAfterSecondWind,
  requestFocusedResistance
} from "../combat/preservation-qualities.js";
import {
  applyDigizoidAttackRules,
  applyDigizoidPostHitRules,
  getEffectDpCost,
  markUndyingRegenCleanseSuppression,
  resolveIncomingDigizoidGainForceEffects,
  resolveSharpDigizoidArmorRetaliation,
  suppressInterruptsDuringTemporalTurn,
  tryExecuteSpecialGainForceAttack
} from "../combat/digizoid-gain-force.js";
import {
  adjustPositiveReinforcementMood,
  getFreeNegativeAttackContext
} from "../combat/free-negative-qualities.js";

import {
  breakGlamorOnAttackHit,
  getDomainAttackModifier,
  requestTeleportEscape,
  resolveWardEmblemAfterAttack
} from "../combat/utility-qualities.js";
import {
  attackAllowedDuringDot,
  consumeDenyForIncomingEffects,
  consumeProtectingShieldUse,
  getIncomingEffectDurationPenalty,
  resolveInspiringGuidanceAfterAttack,
  validateEffectAttackDeclaration
} from "../combat/effect-qualities.js";
import { calculateEffectDurationRounds } from "../combat/effect-duration.js";

function identityForMatching(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

import {
  findQuality,
  hasQuality,
  getQualityRank,
  getActorDerivedStat,
  getActorMainStat,
  getActorSv,
  getCombatId,
  getCombatRound,
  getCombatTurn,
  getCombatUseState,
  getRoundUseState,
  setUseState,
  clearUseState,
  spendQualityUse as spendAutomationQualityUse,
  promptUseQuality,
  canSpendQuality,
  actorHasNaturewalkElement,
  getElementTagsFromAttack,
  getSelectedChoices,
  EFFECT_TAGS,
  rollDerivedCheck,
  normalizeKey,
  areActorsAllies,
  areActorsAlliesForQualities,
  localizeQ
} from "../rules/quality-automation.js";
import {
  applyHackersMemoryDerivedStatModifier
} from "../rules/tamer-talent-transversal.js";


const pendingAttackDodgeRequests =
  new Map();

const pendingAttackDodgeByAttacker =
  new Map();

const bulkAreaDodgeInFlightRequests =
  new Set();

/*
 * Area Attack Dodge de-duplication.
 *
 * One Area Attack must produce exactly one Dodge resolution per affected
 * Token. Keep the same Promise alive for the lifetime of the area request so
 * duplicate render/hooks or a repeated child-resolution path cannot create a
 * second Dodge roll for the same target.
 */
const areaAttackDodgePromiseCache =
  new Map();

/*
 * A second guard protects a single Dodge request from being resolved twice
 * concurrently (for example, two chat renders firing the same bulk resolver).
 */
const attackDodgeResolutionInFlightRequests =
  new Set();

const AREA_ATTACK_DODGE_CACHE_TTL_MS =
  10 * 60 * 1000;

const ATTACK_DODGE_REQUEST_TIMEOUT_MS =
  5 * 60 * 1000;

function attackDodgeWindowMetadata(timeoutMs = ATTACK_DODGE_REQUEST_TIMEOUT_MS) {
  const now = Date.now();
  return {
    combatId: String(game?.combat?.id ?? ""),
    sceneId: String(canvas?.scene?.id ?? game?.scenes?.current?.id ?? ""),
    createdAt: now,
    expiresAt: now + Math.max(1000, Number(timeoutMs ?? ATTACK_DODGE_REQUEST_TIMEOUT_MS))
  };
}

function attackDodgeInvalidReason(request = {}) {
  if (!request || typeof request !== "object") return "missing";

  const createdAt = Number(request.createdAt ?? 0);
  const expiresAt = Number(request.expiresAt ?? 0);
  if (!(createdAt > 0) || !(expiresAt > 0)) return "staleLegacy";

  if (expiresAt > 0 && Date.now() >= expiresAt) return "timeout";

  const combatId = String(request.combatId ?? "");
  if (combatId) {
    const combat = game?.combats?.get?.(combatId)
      ?? (String(game?.combat?.id ?? "") === combatId ? game.combat : null);
    if (!combat) return "combatChanged";
    if (!combat.started) return "combatEnded";
  }

  const sceneId = String(request.sceneId ?? "");
  const currentSceneId = String(canvas?.scene?.id ?? game?.scenes?.current?.id ?? "");
  if (sceneId && currentSceneId && sceneId !== currentSceneId) return "sceneChanged";

  return "";
}
const combatText = (pt, en) => String(game.i18n?.lang ?? "")
  .toLowerCase()
  .startsWith("en")
  ? en
  : pt;

function escapeHtml(
  value = ""
) {
  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getDataSpecializationFeature(actor) {
  return actor?.system?.qualityFeatures?.dataSpecialization ?? {};
}

function attackHasExtraTags(attackItem) {
  const qualityTags = getAttackQualityTags(attackItem);
  const effectTagEnabled = Boolean(
    attackItem?.system?.effectTag?.enabled &&
    String(attackItem?.system?.effectTag?.tag ?? "").trim()
  );
  const isSignature = Boolean(attackItem?.system?.isSignature);
  return qualityTags.size > 0 || effectTagEnabled || isSignature;
}

function getDataSpecializationAttackPermission(attacker, attackItem, attackOptions = {}, alreadyAttacked = false) {
  const feature = getDataSpecializationFeature(attacker);
  const rangeType = String(attackItem?.system?.baseTags?.rangeType ?? "").toLowerCase();
  const functionType = String(
    attackOptions?.areaBatch?.functionTypeOverride ??
    attackItem?.system?.baseTags?.functionType ??
    ""
  ).toLowerCase();
  const isInterrupt = Boolean(
    attackOptions?.isInterrupt ||
    attackOptions?.clashContext?.isInterrupt ||
    attackOptions?.allowOutOfTurn
  );

  if (!alreadyAttacked) {
    return { allowed: true, mode: "normal", functionType };
  }

  if (isInterrupt && feature.interruptAttacksIgnoreRoundLimit) {
    return { allowed: true, mode: "trySomething", functionType };
  }

  const flurryUse = getRoundUseState(attacker, "dataSpecialization", "flurry");
  const flurryEligible = Boolean(
    feature.mayMakeAdditionalMeleeDamageAttack &&
    !isInterrupt &&
    rangeType === "melee" &&
    functionType === "damage" &&
    !attackHasExtraTags(attackItem) &&
    !flurryUse?.used
  );

  if (flurryEligible) {
    return { allowed: true, mode: "flurry", functionType };
  }

  const statusUse = getRoundUseState(attacker, "dataSpecialization", "statusWarlord");
  if (feature.statusWarlordAttackPair && statusUse && !statusUse.completed && !isInterrupt) {
    const firstFunction = String(statusUse.firstFunction ?? "");
    const firstHadEffect = Boolean(statusUse.firstHadEffect);
    const currentHasEffect = attackHasExtraTags(attackItem);
    const validPair = (
      firstFunction === "support" && functionType === "damage" && !currentHasEffect
    ) || (
      firstFunction === "damage" && !firstHadEffect && functionType === "support"
    );

    if (validPair) {
      return { allowed: true, mode: "statusWarlord", functionType };
    }
  }

  return { allowed: false, mode: "blocked", functionType };
}

async function recordDataSpecializationAttackUse(attacker, attackItem, mode = "normal") {
  const feature = getDataSpecializationFeature(attacker);
  const functionType = String(attackItem?.system?.baseTags?.functionType ?? "").toLowerCase();
  const hadEffect = attackHasExtraTags(attackItem);

  if (mode === "flurry") {
    await setUseState(attacker, "dataSpecialization", "flurry", {
      used: true,
      attackItemId: attackItem?.id ?? ""
    });
    return;
  }

  if (mode === "statusWarlord") {
    await setUseState(attacker, "dataSpecialization", "statusWarlord", {
      used: true,
      completed: true,
      secondFunction: functionType,
      attackItemId: attackItem?.id ?? ""
    });
    return;
  }

  if (!feature.statusWarlordAttackPair) return;

  const existing = getRoundUseState(attacker, "dataSpecialization", "statusWarlord");
  if (existing?.completed || existing?.firstFunction) return;

  const canOpenPair = functionType === "support" || (functionType === "damage" && !hadEffect);
  if (!canOpenPair) return;

  await setUseState(attacker, "dataSpecialization", "statusWarlord", {
    used: false,
    completed: false,
    firstFunction: functionType,
    firstHadEffect: hadEffect,
    attackItemId: attackItem?.id ?? ""
  });
}

async function finishCommittedBlastIntercede(intercedeDeclaration, defender = null) {
  if (!intercedeDeclaration?.blastEvolution?.active) return;

  try {
    const partnerUuid = String(intercedeDeclaration.blastEvolution.partnerUuid ?? "");
    const partnerActor = defender?.uuid === partnerUuid
      ? defender
      : (partnerUuid ? await fromUuid(partnerUuid) : defender);
    if (!partnerActor) return;

    const evolution = await import("../combat/evolution.js");
    await evolution.finishBlastIntercedeForPartner?.(partnerActor);
  } catch (error) {
    console.error("DDA | Could not finish committed Blast Intercede.", error);
  }
}

export async function rollAttack(attacker, attackItem, options = {}) {
  if (!attacker || !attackItem) {
    ui.notifications.warn(localize("DDA.Warning.AttackerOrAttackNotFound"));
    return;
  }

  // Secondary Area Attack resolution is a continuation of an Attack already
  // chosen by the controller. Every new Attack declaration from a charmed
  // Digimon must come from the Caster's controller (or a GM).
  const isAreaContinuation = Boolean(options?.areaBatch?.active && options?.areaBatch?.secondary);
  if (!isAreaContinuation) {
    const charmGate = game?.dda?.bossQualities?.ensureCharmActionController;
    if (typeof charmGate === "function" && !charmGate(attacker, { user: game?.user, notify: true })) return;
  }

  const { isAttackAvailableForCurrentMode } = await import("../rules/mode-change.js");
  if (!isAttackAvailableForCurrentMode(attacker, attackItem)) {
    ui.notifications.warn(combatText(
      "Este Ataque pertence ao outro Modo do Digimon.",
      "This Attack belongs to the Digimon's other Mode."
    ));
    return;
  }

  if (!attackAllowedDuringDot(attacker, attackItem)) {
    ui.notifications.warn(combatText(
      "[DOT] substitui os Ataques do Digimon pelos Ataques Pixelados enquanto o Efeito durar.",
      "[DOT] replaces the Digimon's Attacks with Pixel Attacks for the Effect's Duration."
    ));
    return;
  }

  const specialGainForceAttack = await tryExecuteSpecialGainForceAttack(attacker, attackItem, options);
  if (specialGainForceAttack.handled) return specialGainForceAttack.result;

const pendingDodgeRequestId =
  pendingAttackDodgeByAttacker.get(attacker.uuid);

if (
  pendingDodgeRequestId &&
  !isAreaContinuation
) {
  const pendingDodgeRequest =
    pendingAttackDodgeRequests.get(
      pendingDodgeRequestId
    );

  const invalidReason =
    attackDodgeInvalidReason(
      pendingDodgeRequest
    );

  const hasActiveResolver =
    Array.isArray(
      pendingDodgeRequest
        ?.authorizedUserIds
    ) &&
    pendingDodgeRequest
      .authorizedUserIds
      .some((userId) => {
        return Boolean(
          game.users?.get(userId)
            ?.active
        );
      });

  /*
   * A disconnected/invalid Dodge request must never keep the attacker
   * permanently locked. Clear it before evaluating a new Attack.
   */
  if (
    invalidReason ||
    !hasActiveResolver
  ) {
    await cancelPendingAttackDodgeRequest(
      pendingDodgeRequestId,
      {
        reason:
          invalidReason ||
          "noActiveDodgeController",

        updateMessage:
          true
      }
    );
  }
}

if (
  pendingAttackDodgeByAttacker.has(attacker.uuid) &&
  !isAreaContinuation
) {
  ui.notifications.warn(formatI18n("DDA.Warning.AttackAwaitingDodge", {
    actor: attacker.name
  }));
  return;
}

const holdAttackWindow =
  getTamerHoldAttackWindow(attacker);

const usesTamerHoldAttackWindow =
  Boolean(holdAttackWindow);

const attackOptions = {
  ...(options ?? {}),

  ...(
    usesTamerHoldAttackWindow
      ? {
          allowOutOfTurn: true
        }
      : {}
  )
};

if (suppressInterruptsDuringTemporalTurn(attacker)) {
  attackOptions.suppressTargetInterrupts = true;
}

const effectExecutionId = String(
  attackOptions?.areaBatch?.id ??
  attackOptions?.effectExecutionId ??
  foundry.utils.randomID()
);
attackOptions.effectExecutionId = effectExecutionId;

const areaBatch = attackOptions.areaBatch ?? null;
const isAreaBatchSecondary = Boolean(areaBatch?.active && areaBatch?.secondary);
const isFierceSoulRepeat = Boolean(attackOptions.fierceSoulRepeat);
const isSentryReaction = Boolean(attackOptions.sentryReaction);
const isFreeStanceAttack = isFierceSoulRepeat || isSentryReaction;

if (!isFreeStanceAttack && !canAttackAfterSecondWind(attacker)) {
  ui.notifications.warn(combatText(
    `${attacker.name} usou Segundo Fôlego e não pode usar uma Ação de Ataque nesta ativação.`,
    `${attacker.name} used Second Wind and cannot take an Attack Action this turn.`
  ));
  return;
}

const attackQualityTagsAtStart =
  getAttackQualityTags(attackItem);
const directBossEffectAtStart = attackItem.system?.effectTag ?? {};
const directBossEffectKeyAtStart = directBossEffectAtStart.enabled && directBossEffectAtStart.bossEffect
  ? normalizeAttackTag(directBossEffectAtStart.tag)
  : "";
const directAttackFunctionTypeAtStart = String(attackItem.system?.baseTags?.functionType ?? "").trim().toLowerCase();
if (directBossEffectKeyAtStart === "demoralize" && directAttackFunctionTypeAtStart !== "support") {
  ui.notifications.warn(combatText(
    "[DEMORALIZE] só pode ser usado em um Ataque [SUPPORT].",
    "[DEMORALIZE] can only be used on a [SUPPORT] Attack."
  ));
  return;
}
const isAmmoAttack = attackQualityTagsAtStart.has("ammo");
const clashContext = attackOptions.clashContext ?? {};
const isClashWeakAttack = Boolean(clashContext.weakAttack);
const clashDefenderHasReach = Boolean(clashContext.defenderHasReach);

// Regra-base: uma Ação de Ataque por rodada.
// [AMMO] é a exceção automatizada atual.
const multiattackMode = "strict";
const attacksMadeThisTurn = Number(attacker.system.combat?.attacksMadeThisTurn ?? 0);
const hasAttackedThisRound = Boolean(attacker.system.combat?.hasAttackedThisRound);
const alreadyAttacked = hasAttackedThisRound || attacksMadeThisTurn > 0;
const speedSurgeAttackWindow = getSpeedSurgeAttackWindow(attacker);
const hasteAttackWindow = getHasteAttackWindow(attacker);

const usesSpeedSurgeAttackWindow = Boolean(
  alreadyAttacked &&
  !isAmmoAttack &&
  speedSurgeAttackWindow
);
const usesHasteAttackWindow = Boolean(
  alreadyAttacked && !isAmmoAttack && !usesSpeedSurgeAttackWindow && hasteAttackWindow
);

const dataSpecializationAttackPermission =
  getDataSpecializationAttackPermission(
    attacker,
    attackItem,
    attackOptions,
    alreadyAttacked
  );

const usesDataSpecializationAttackWindow = Boolean(
  alreadyAttacked &&
  dataSpecializationAttackPermission.allowed &&
  dataSpecializationAttackPermission.mode !== "normal"
);

const usesCounterattackWindow = Boolean(
  attackOptions?.counterattackContext?.active
);

const usesPunishingStrikeWindow = Boolean(
  attackOptions?.punishingStrikeContext?.active
);

if (
  alreadyAttacked &&
  !isAreaBatchSecondary &&
  !usesCounterattackWindow &&
  !usesPunishingStrikeWindow &&
  !attackOptions.ignoreAttackPerRoundLimit &&
  !isFreeStanceAttack &&
  !isAmmoAttack &&
  !usesSpeedSurgeAttackWindow &&
  !usesHasteAttackWindow &&
  !usesDataSpecializationAttackWindow
) {
  ui.notifications.warn(combatText(
    `${attacker.name} já realizou um Ataque nesta Rodada e não possui uma janela válida de Ataque adicional.`,
    `${attacker.name} has already made an Attack this Round and has no valid additional Attack window.`
  ));
  return;
}

const effectiveAttacksMade = 0;
const multiattackPenalty = 0;

/*
 * Area Attacks need to be declared before the single-target requirement.
 * This preflight intentionally uses a target-neutral Quality pass only to
 * discover Area tags and calculate the legal template Size. Each affected
 * target is still resolved through the normal attack pipeline afterwards.
 */
if (!attackOptions.__ddaAreaChild) {
  const areaCombatContext = getAttackCombatContext(attacker, attackOptions);

  if (!areaCombatContext.ok) {
    ui.notifications.warn(areaCombatContext.message);
    return;
  }

  const preflightArmedTamerAttackTalent =
    getArmedAttackTalentState(attacker);

  const bossWeaponExpertContext =
    await prepareBossWeaponExpertDeclaration(
      attacker,
      attackItem,
      attackOptions
    );

  if (bossWeaponExpertContext) {
    attackOptions.bossWeaponExpertContext = bossWeaponExpertContext;
  }

  const provisionalQualityModifier = getAppliedAttackQualityModifier(
    attacker,
    attackItem,
    {
      defender: null,
      targetToken: null,
      clashContext,
      bossWeaponExpertContext: attackOptions.bossWeaponExpertContext,
      isSignatureOverride: Boolean(
        attackItem.system?.isSignature ||
        attackOptions.forceSignature ||
        preflightArmedTamerAttackTalent.signature
      )
    }
  );

  const provisionalRange = Math.max(
    0,
    Math.floor(
      (
        Number(
          attacker.system?.miscStats?.range?.total ??
          attacker.system?.miscStats?.range?.value ??
          attacker.system?.miscStats?.range?.base ??
          attackItem.system?.range?.total ??
          0
        ) +
        Number(provisionalQualityModifier.rangeBonus ?? 0)
      ) *
      Number(provisionalQualityModifier.rangeMultiplier ?? 1)
    )
  );

  /*
   * Area tags can exist in two valid places:
   * 1) the Area Attack Quality binding (areaAttackTags), and
   * 2) directly on the Attack item after wizard/editor materialization.
   *
   * The preflight previously looked only at (1). If the binding data was
   * normalized/rebuilt while the Attack retained its [T:*] tag, the area
   * workflow was skipped and the canvas placement marker never appeared.
   */
  const provisionalAreaTags = [
    ...(provisionalQualityModifier.areaAttackTags ?? []),
    ...getDirectAreaAttackTags(attackItem)
  ];

  if (directBossEffectKeyAtStart === "invincible" && provisionalAreaTags.length) {
    ui.notifications.warn(combatText(
      "[INVINCIBLE] não pode ser usado com um Ataque de Área.",
      "[INVINCIBLE] cannot be used with an Area Attack."
    ));
    return;
  }

  const areaWorkflow = await runAreaAttackWorkflow({
    attacker,
    attackItem,
    attackOptions,
    attackerToken: areaCombatContext.token,
    areaTags: [...new Set(provisionalAreaTags)],
    attackRangeTotal: provisionalRange,
    qualityAttackModifier: provisionalQualityModifier,
    resolveTarget: (targetToken, childOptions) => {
      return rollAttack(attacker, attackItem, {
        ...childOptions,
        targetToken
      });
    }
  });

  if (areaWorkflow?.suppressLegacyAreaPrompt) {
    attackOptions.areaAttackActive = false;
  }

  if (areaWorkflow?.handled) return areaWorkflow.result;
}

  let targetToken = attackOptions.targetToken ?? game.user.targets.first();

  if (!targetToken) {
    ui.notifications.warn(localize("DDA.Warning.SelectTargetBeforeAttack"));
    return;
  }

let defender = getCombatActorFromTargetToken(targetToken);

if (!defender) {
  ui.notifications.warn(localize("DDA.Warning.TargetHasNoActor"));
  return;
}

if (directBossEffectKeyAtStart === "demoralize" && defender.type !== "character") {
  ui.notifications.warn(combatText(
    "[DEMORALIZE] só pode ter um Tamer como alvo.",
    "[DEMORALIZE] can only target a Tamer."
  ));
  return;
}

let outsideClashAttackContext = { active: false };
try {
  const clashAutomation = await import("../combat/clash.js");
  if (
    clashAutomation.isActorInActiveClash?.(attacker) &&
    !clashContext?.active &&
    !clashContext?.enabled &&
    !attackOptions.allowAttackWhileClashing
  ) {
    ui.notifications.warn(combatText(
      `${attacker.name} está em um Clash e só pode usar uma Ação de Clash.`,
      `${attacker.name} is in a Clash and can only use a Clash Action.`
    ));
    return;
  }
  outsideClashAttackContext = await clashAutomation.getOutsideClashAttackContext?.({
    attacker,
    defender,
    clashContext
  }) ?? { active: false };
} catch (error) {
  console.warn("DDA | Could not prepare Clash attack context.", error);
}

const attackCombatContext = getAttackCombatContext(attacker, attackOptions);

if (!attackCombatContext.ok) {
  ui.notifications.warn(attackCombatContext.message);
  return;
}

  const sharedTamerAttackTalent = areaBatch?.sharedTamerAttackTalent ?? null;
  const armedTamerAttackTalent = sharedTamerAttackTalent
    ? { signature: null, autoHit: null }
    : getArmedAttackTalentState(attacker);

  const baseIsSignature = Boolean(attackItem.system.isSignature);
  const forcedSignature = Boolean(attackOptions.forceSignature);
  const signatureVersatilityUsed = Boolean(
    sharedTamerAttackTalent?.signatureVersatilityUsed ??
    (!baseIsSignature && !forcedSignature && armedTamerAttackTalent.signature)
  );
  const autoHitUsed = Boolean(
    sharedTamerAttackTalent?.autoHitUsed ??
    (!baseIsSignature && !forcedSignature && !signatureVersatilityUsed && armedTamerAttackTalent.autoHit && !areActorsAllies(attacker, defender))
  );

  let isSignature = Boolean(baseIsSignature || forcedSignature || signatureVersatilityUsed);
  if (directBossEffectKeyAtStart === "invincible" && !isSignature) {
    ui.notifications.warn(combatText(
      "[INVINCIBLE] exige um Movimento Assinatura.",
      "[INVINCIBLE] requires a Signature Move."
    ));
    return;
  }
  const signatureBatteryOverride = Number(attackOptions.signatureBatteryOverride);
  const currentBattery = Number.isFinite(signatureBatteryOverride)
    ? Math.max(0, signatureBatteryOverride)
    : Number(attacker.system.resources?.battery?.value ?? 0);

  if (isAmmoAttack && isSignature) {
  ui.notifications.warn(`${attackItem.name} has [AMMO] but [AMMO] cannot be used on a Signature Move.`);
  return;
}

if (armedTamerAttackTalent.autoHit && isSignature) {
  ui.notifications.warn(combatText(
    "PUT 100% INTO THIS não pode ser usado em Signature Move; a Ordem permanece preparada.",
    "PUT 100% INTO THIS cannot be used on a Signature Move; the Order remains prepared."
  ));
}

if (isAmmoAttack && isAmmoAttackUsedThisCombat(attacker, attackItem)) {
  ui.notifications.warn(`${attackItem.name} [AMMO] has already been used this combat.`);
  return;
}

  const bossInvincibleBatteryMinimum = getBossInvincibleBatteryMinimum(attackItem);
  if (isSignature && currentBattery < bossInvincibleBatteryMinimum) {
    ui.notifications.warn(
      bossInvincibleBatteryMinimum > 1
        ? combatText(
            `${attackItem.name} exige no mínimo ${bossInvincibleBatteryMinimum} de Bateria por [INVINCIBLE].`,
            `${attackItem.name} requires at least ${bossInvincibleBatteryMinimum} Battery due to [INVINCIBLE].`
          )
        : localize("DDA.Warning.SignatureRequiresBattery")
    );
    return;
  }

  let attributeAdvantageData = getAttributeAdvantageData(attacker, defender);
  let attackerEffectModifiers = getActiveEffectAttackModifiers(attacker, defender, attackOptions);
  let defenderEffectModifiers = getActiveEffectDefenseModifiers(defender, attacker);
  const multiattackAccuracyPenalty = multiattackPenalty;
  const multiattackDamagePenalty = multiattackPenalty;
  const signatureAccuracyBonus = isSignature ? currentBattery : 0;
  const signatureDamageBonus = isSignature ? currentBattery : 0;
let qualityAttackModifier = getAppliedAttackQualityModifier(attacker, attackItem, {
  defender,
  targetToken,
  clashContext,
  bossWeaponExpertContext: attackOptions.bossWeaponExpertContext,
  isSignatureOverride: isSignature
});

const freeNegativeContext = getFreeNegativeAttackContext(attacker, attackItem, defender);
if (freeNegativeContext.sealedWeaponBlocked) {
  ui.notifications.warn(combatText(
    "Este Ataque [WEAPON] permanece selado até o Digimon cair abaixo da metade das Caixas de Ferimento.",
    "This [WEAPON] Attack remains sealed until the Digimon falls below half Wound Boxes."
  ));
  return;
}
if (freeNegativeContext.mood !== null) {
  const mood = Number(freeNegativeContext.mood);
  if (mood < 3) qualityAttackModifier.accuracyBonus -= 3 - mood;
  if (mood > 4) qualityAttackModifier.damageBonus += mood - 4;
}
if (freeNegativeContext.slayerApplies) {
  qualityAttackModifier.accuracyBonus += Number(freeNegativeContext.slayerAccuracyBonus ?? 0);
}
if (hasQuality(attacker, "sealedWeapon") && !freeNegativeContext.sealedWeaponBlocked) {
  qualityAttackModifier.accuracyBonus += 1;
  qualityAttackModifier.damageBonus += 1;
  qualityAttackModifier.effectPotencyBonus = Number(qualityAttackModifier.effectPotencyBonus ?? 0) + 1;
}

if (attackOptions.suppressChargeMovement) {
  qualityAttackModifier.chargeMoveWithAttack = false;
  qualityAttackModifier.chargeSignatureBatteryMoveBonus = 0;
}

/*
 * [CHARGE] may already be stored directly on the Attack item. Older
 * automation only detected the tag when a Quality granted it at runtime,
 * so imported and previously-created attacks skipped the pre-attack flow.
 */
if (
  !attackOptions.suppressChargeMovement &&
  hasChargeAttackBinding(attacker, attackItem, attackQualityTagsAtStart)
) {
  qualityAttackModifier.chargeMoveWithAttack = true;

  if (isSignature) {
    qualityAttackModifier.chargeSignatureBatteryMoveBonus = Math.max(
      Number(qualityAttackModifier.chargeSignatureBatteryMoveBonus ?? 0),
      currentBattery
    );
  }
}

if (qualityAttackModifier.blockedInSentryStance) {
  ui.notifications.warn(`${attackItem.name} has [RECOIL] and cannot be used in Sentry Stance.`);
  return;
}

if (qualityAttackModifier.stanceBlocked) {
  ui.notifications.warn(qualityAttackModifier.stanceBlockedMessage || combatText(
    "Este Ataque não pode ser usado na Postura atual.",
    "This Attack cannot be used in the current Stance."
  ));
  return;
}

if (
  getAttackQualityTags(attackItem).has("counter") &&
  !usesCounterattackWindow
) {
  ui.notifications.warn(combatText(
    `${attackItem.name} possui [COUNTER] e só pode ser usado durante Contra-Ataque.`,
    `${attackItem.name} has [COUNTER] and can only be used during Counterattack.`
  ));
  return;
}

const baseActionCost = Number(attackItem.system.actionCost?.value ?? 1);
const attackExtraActionCost = Number(attackItem.system.actionCost?.extra ?? 0);
const qualityExtraActionCost = Number(qualityAttackModifier.extraActionCost ?? 0);
const areaBatchExtraActionCost = Number(attackOptions?.areaBatch?.extraActionCost ?? 0);
let totalQualityExtraActionCost = qualityExtraActionCost + areaBatchExtraActionCost;

const rawAttackRangeTotal =
  Number(
    attacker.system?.miscStats?.range?.total ??
    attacker.system?.miscStats?.range?.value ??
    attacker.system?.miscStats?.range?.base ??
    attackItem.system?.range?.total ??
    0
  ) +
  Number(qualityAttackModifier.rangeBonus ?? 0);

const rawAttackEffectiveLimitTotal =
  Number(
    attacker.system?.miscStats?.effectiveLimit?.total ??
    attacker.system?.miscStats?.effectiveLimit?.value ??
    attacker.system?.miscStats?.effectiveLimit?.base ??
    attackItem.system?.effectiveLimit?.total ??
    0
  ) +
  Number(qualityAttackModifier.effectiveLimitBonus ?? 0);

const attackRangeTotal = Math.max(
  0,
  Math.floor(
    rawAttackRangeTotal *
    Number(qualityAttackModifier.rangeMultiplier ?? 1)
  )
);

const attackEffectiveLimitTotal = Math.max(
  0,
  Math.floor(
    rawAttackEffectiveLimitTotal *
    Number(qualityAttackModifier.effectiveLimitMultiplier ?? 1)
  )
);

const bossSpatialDistortionContext =
  await prepareBossSpatialDistortionDeclaration({
    attacker,
    attackerToken: attackCombatContext.token,
    targetToken,
    attackItem,
    qualityAttackModifier,
    attackRangeTotal,
    attackEffectiveLimitTotal,
    attackOptions
  });

if (bossSpatialDistortionContext) {
  attackOptions.bossSpatialDistortionContext = bossSpatialDistortionContext;
  totalQualityExtraActionCost += getBossSpatialDistortionExtraActionCost(attackOptions);
}

const unreducedDeclaredActionCost = Number.isFinite(
  Number(attackOptions.actionCostOverride)
)
  ? Number(attackOptions.actionCostOverride)
  : baseActionCost +
    attackExtraActionCost +
    totalQualityExtraActionCost;

const declaredActionCost = attackOptions.ignoreActionCostModifiers
  ? Math.max(0, unreducedDeclaredActionCost)
  : Math.max(
      Number(
        qualityAttackModifier
          .actionCostMinimum ?? 0
      ),

      unreducedDeclaredActionCost -
        Number(
          qualityAttackModifier
            .actionCostReduction ?? 0
        )
    );

const movementTracker = game.dda?.movementTracker;
const hasActiveChargeApproach = Boolean(
  movementTracker?.hasActiveChargeApproach?.(attacker)
);
const matchesActiveChargeApproach = Boolean(
  movementTracker?.isChargeApproachReady?.(attacker, {
    attackItemUuid: attackItem.uuid,
    targetTokenId: targetToken.id
  })
);

if (hasActiveChargeApproach && !matchesActiveChargeApproach) {
  ui.notifications.warn(combatText(
    "Conclua ou cancele o [CHARGE] atual antes de declarar outro ataque ou trocar de alvo.",
    "Complete or cancel the current [CHARGE] before declaring another attack or changing targets."
  ));
  return;
}

if (matchesActiveChargeApproach && !isTokenVisibleToCurrentUser(targetToken, attacker)) {
  ui.notifications.warn(combatText(
    "O alvo não está mais visível. Cancele o [CHARGE] ou recupere a linha de visão.",
    "The target is no longer visible. Cancel [CHARGE] or regain line of sight."
  ));
  return;
}

const attackTargeting = areaBatch?.active || attackOptions.ignoreTargetingValidation
  ? {
      valid: true,
      distance: Number(areaBatch?.originDistance ?? getTokenGridDistance(attackCombatContext.token, targetToken) ?? 0),
      accuracyPenalty: 0,
      rangeType: String(attackItem.system.baseTags?.rangeType ?? "")
    }
  : validateAttackTargeting({
      attacker,
      attackerToken: attackCombatContext.token,
      targetToken,
      attackItem,
      qualityAttackModifier,
      attackRangeTotal,
      attackEffectiveLimitTotal,
      attackOptions
    });

/*
 * [CHARGE] is declared before the attack continues. This intentionally
 * happens before the normal invalid-target warning, Area Attack choices,
 * quality declarations and every die roll.
 */
const chargeApproach = areaBatch?.active
  ? { handled: false }
  : await maybeBeginChargeApproach({
      attacker,
      attackerToken: attackCombatContext.token,
      targetToken,
      attackItem,
      attackOptions,
      attackTargeting,
      qualityAttackModifier,
      declaredActionCost
    });

if (chargeApproach.handled) return;

if (!attackTargeting.valid) {
  ui.notifications.warn(attackTargeting.message);
  return;
}

const areaAttackDeclaration = await getAreaAttackDeclaration(
  attacker,
  attackItem,
  qualityAttackModifier,
  attackOptions
);

if (areaAttackDeclaration === null) return;

let intercedeDeclaration = null;

const isInterruptAttack =
  Boolean(
    attackOptions.isInterrupt ||
    clashContext.isInterrupt
  );

const usesInterruptPayment =
  Boolean(
    isInterruptAttack &&
    !usesTamerHoldAttackWindow &&
    !usesCounterattackWindow &&
    !usesPunishingStrikeWindow &&
    declaredActionCost === 1
  );

if (
  usesTamerHoldAttackWindow &&
  declaredActionCost > 1
) {
  ui.notifications.warn(
    combatText(
      `Segurar só pode liberar um Ataque de 1 Ação. ${attackItem.name} custa ${declaredActionCost}.`,
      `Hold can only release a 1-Action Attack. ${attackItem.name} costs ${declaredActionCost}.`
    )
  );

  return;
}

/*
 * As 2 Ações do Tamer já pagaram a resposta
 * preparada de 1 Ação do parceiro.
 */
const totalActionCost =
  declaredActionCost;

const chargeCanCombineMovement = Boolean(
  qualityAttackModifier.chargeMoveWithAttack &&
  declaredActionCost === 1 &&
  !usesTamerHoldAttackWindow &&
  !usesInterruptPayment
);

const chargeMovementBeforeAttack = Boolean(
  chargeCanCombineMovement &&
  (
    matchesActiveChargeApproach ||
    game.dda?.movementTracker
      ?.isChargeApproachReady
      ?.(attacker, {
        attackItemUuid: attackItem.uuid,
        targetTokenId: targetToken.id
      }) ||
    game.dda?.movementTracker
      ?.canCombineChargeWithCurrentMove
      ?.(attacker)
  )
);

const attackerActionCost =
  (
    isAreaBatchSecondary ||
    usesTamerHoldAttackWindow ||
    usesInterruptPayment ||
    usesCounterattackWindow ||
    usesPunishingStrikeWindow ||
    isFreeStanceAttack ||
    chargeMovementBeforeAttack
  )
    ? 0
    : totalActionCost;

const displayedActionCost =
  totalActionCost;

const currentActions = Number(
  attacker.system.combat
    ?.actions?.value ?? 0
);

if (currentActions < attackerActionCost) {
  ui.notifications.warn(
    formatI18n(
      "DDA.Warning.NotEnoughActionsForAttack",
      {
        attack:
          attackItem.name,

        required:
          attackerActionCost,

        actor:
          attacker.name,

        current:
          currentActions
      }
    )
  );

  return;
}

if (
  game.combat?.started &&
  !areaAttackDeclaration?.active &&
  !isClashAttackContext(clashContext) &&
  !qualityAttackModifier.sneakSuppressInterrupts &&
  !attackOptions.suppressTargetInterrupts
) {
  intercedeDeclaration = await requestEvokerProtectorIntercede({ attacker, targetToken, attackItem })
    ?? await requestStandardIntercede({ attacker, targetToken, attackItem });

  if (intercedeDeclaration) {
    const nextTargetToken = canvas?.tokens?.get(intercedeDeclaration.tokenId);
    const nextDefender = getCombatActorFromTargetToken(nextTargetToken);
    if (!nextTargetToken || !nextDefender) {
      ui.notifications.warn(combatText(
        "O personagem que Intercedeu não está mais disponível no canvas.",
        "The Interceding character is no longer available on the canvas."
      ));
      await finishCommittedBlastIntercede(intercedeDeclaration);
      return;
    }
    targetToken = nextTargetToken;
    defender = nextDefender;
    attributeAdvantageData = getAttributeAdvantageData(attacker, defender);
    attackerEffectModifiers = getActiveEffectAttackModifiers(attacker, defender, attackOptions);
    defenderEffectModifiers = getActiveEffectDefenseModifiers(defender, attacker);
    qualityAttackModifier = getAppliedAttackQualityModifier(attacker, attackItem, {
      defender,
      targetToken,
      clashContext,
      bossWeaponExpertContext: attackOptions.bossWeaponExpertContext,
      isSignatureOverride: isSignature
    });
    if (
      !attackOptions.suppressChargeMovement &&
      hasChargeAttackBinding(attacker, attackItem, attackQualityTagsAtStart)
    ) {
      qualityAttackModifier.chargeMoveWithAttack = true;
      if (isSignature) {
        qualityAttackModifier.chargeSignatureBatteryMoveBonus = Math.max(
          Number(qualityAttackModifier.chargeSignatureBatteryMoveBonus ?? 0),
          currentBattery
        );
      }
    }
  }
}

const grantedEffectTags = qualityAttackModifier.effectTags ?? [];
const attackEffectTag = attackItem.system.effectTag?.enabled
  ? attackItem.system.effectTag?.tag ?? ""
  : "";

const activeEffectTags = areaBatch?.suppressEffectTags
  ? []
  : [
      ...new Set([
        attackEffectTag,
        ...grantedEffectTags
      ].filter(Boolean))
    ];

const targetIsAlly =
  areActorsAllies(attacker, defender);

const effectAttackValidation = validateEffectAttackDeclaration({
  attacker,
  defender,
  attackItem,
  effectTags: activeEffectTags,
  areaActive: Boolean(areaAttackDeclaration?.active),
  currentBattery,
  targetIsAlly,
  functionTypeOverride: areaBatch?.functionTypeOverride ?? "",
  executionId: effectExecutionId
});

if (!effectAttackValidation.ok) {
  ui.notifications.warn(effectAttackValidation.message);
  await finishCommittedBlastIntercede(intercedeDeclaration, defender);
  return;
}

const cleanseDeclaration = await getCleanseDeclaration(defender, activeEffectTags);

if (cleanseDeclaration === null) {
  await finishCommittedBlastIntercede(intercedeDeclaration, defender);
  return;
}

const cleanseIsActive =
  hasCleanseTag(activeEffectTags);

const isAlliedCleanse =
  cleanseIsActive &&
  targetIsAlly;

/*
 * 9.02b: um Efeito aplicado a um alvo disposto é tratado como Positivo.
 * Em Área, isso só vale quando a declaração inclui exclusivamente aliados;
 * uma Área indiscriminada continua usando a resolução de Efeito Negativo.
 */
const targetIsWillingForEffect = Boolean(
  targetIsAlly &&
  activeEffectTags.length > 0 &&
  String(attackFunctionType).toLowerCase() === "support" &&
  (
    !areaAttackDeclaration?.active ||
    areaAttackDeclaration?.targetMode === "allies"
  )
);

const activeEffectTagLabels =
  activeEffectTags.map((tag) => {
    return getEffectTagLabel(tag);
  });
const defaultAccuracyBase = Number(attacker.system.mainStats?.accuracy?.total ?? 0);

const attackAccuracyBase = await evaluateAttackFormula(
  attacker,
  attackItem.system.accuracy?.baseFormula,
  defaultAccuracyBase
);

const customAccuracyModifier = attackAccuracyBase - defaultAccuracyBase;

const declaredAttackQualityEffects = await getDeclaredAttackQualityEffects({
  attacker,
  defender,
  attackItem,
  qualityAttackModifier,
  totalActionCost,
  unreducedDeclaredActionCost,
  isSignature,
  areaAttackDeclaration,
  areaBatch,
  attackOptions
});

if (declaredAttackQualityEffects === null) {
  await finishCommittedBlastIntercede(intercedeDeclaration, defender);
  return;
}

if (declaredAttackQualityEffects.preventAttack) {
  if (usesInterruptPayment) {
    const payment = await payPartnerInterruptAction(attacker, {
      reason: attackItem.name
    });
    if (!payment?.success) {
      await finishCommittedBlastIntercede(intercedeDeclaration, defender);
      return null;
    }
  }

  let preventedAttackUseFinalized = false;

  const finalizePreventedAttackUse = async () => {
    if (preventedAttackUseFinalized) return;
    preventedAttackUseFinalized = true;

    if (isAmmoAttack) {
      await markAmmoAttackUsedThisCombat(attacker, attackItem);
    } else {
      await markAttackUsed(
        attacker,
        isSignature,
        effectiveAttacksMade + 1,
        {
          attackItem,
          dataSpecializationMode: dataSpecializationAttackPermission.mode,
          suppressRoundCount: usesCounterattackWindow || usesPunishingStrikeWindow
        }
      );

      if (usesSpeedSurgeAttackWindow) {
        await consumeSpeedSurgeAttackWindow(
          attacker,
          speedSurgeAttackWindow.id
        );
      }

      if (usesHasteAttackWindow) {
        await consumeSpeedSurgeAttackWindow(
          attacker,
          hasteAttackWindow.id
        );
      }
    }

    if (!usesInterruptPayment && attackerActionCost > 0) {
      await attacker.update(
        {
          "system.combat.actions.value": Math.max(
            0,
            currentActions - attackerActionCost
          ),
          "system.combat.nonMovementActionsThisTurn":
            Math.max(
              0,
              Number(attacker.system?.combat?.nonMovementActionsThisTurn ?? 0)
            ) + attackerActionCost
        },
        {
          ddaChargeAttackAction:
            chargeCanCombineMovement &&
            !chargeMovementBeforeAttack
        }
      );
    }

    await resolveChargeMovementForAttack({
      attacker,
      chargeCanCombineMovement,
      chargeMovementBeforeAttack,
      chargeSignatureBatteryMoveBonus:
        qualityAttackModifier.chargeSignatureBatteryMoveBonus,
      suppressAfterMovement: Boolean(
        areaAttackDeclaration?.active &&
        normalizeAttackTag(areaAttackDeclaration?.tag) === "t:pass"
      )
    });
  };

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-negative dda-attack-card miss">
        <h2>${attackItem.name}</h2>
        <p><strong>${attacker.name}</strong> ${localizeQ("DDA.QualityAutomation.AttackNegated", "had the attack negated by a Quality effect.")}</p>
        <ul class="dda-effect-list">
          ${(declaredAttackQualityEffects.notes ?? []).map((note) => `<li>${note}</li>`).join("")}
        </ul>
      </div>`
  });

  if (!areaBatch?.active) {
    await finalizePreventedAttackUse();
    await finishCommittedBlastIntercede(intercedeDeclaration, defender);
    return;
  }

  return {
    attacker,
    defender,
    attackItem,
    attackPrevented: true,
    hit: false,
    accuracySuccesses: 0,
    dodgeSuccesses: 0,
    leftoverSuccesses: 0,
    normalDamage: 0,
    unalterableDamage: 0,
    finalDamage: 0,
    totalActionCost,
    activeEffectTags,
    activeEffectTagLabels,
    qualityAttackModifier,
    areaAttackDeclaration,
    declaredAttackQualityEffects,
    accuracyRollResult: null,
    hugePowerReroll: null,
    overpowerResult: null,
    finalizeAttackUse: finalizePreventedAttackUse
  };
}

const ignoreRangedAccuracyPenalties = Boolean(
  qualityAttackModifier.ignoreNegativeAccuracyModifiers
);
const keepNonNegative = (value) => ignoreRangedAccuracyPenalties
  ? Math.max(0, Number(value ?? 0))
  : Number(value ?? 0);

const accuracyPoolMultiplier = Math.max(0, Number(attackOptions.accuracyPoolMultiplier ?? 1));
const accuracyPoolMultiplierPenalty = accuracyPoolMultiplier < 1
  ? -Math.ceil(Number(attacker.system.mainStats?.accuracy?.total ?? 0) * (1 - accuracyPoolMultiplier))
  : 0;

const accuracyDiceBonus =
  keepNonNegative(customAccuracyModifier) +
  keepNonNegative(attackOptions.accuracyDiceModifier) +
  accuracyPoolMultiplierPenalty +
  signatureAccuracyBonus +
  attributeAdvantageData.extraAccuracyDice +
  keepNonNegative(multiattackAccuracyPenalty) +
  keepNonNegative(qualityAttackModifier.accuracyBonus) +
  keepNonNegative(declaredAttackQualityEffects.accuracyBonus) +
  keepNonNegative(attackerEffectModifiers.accuracyDice);


const sharedAccuracyResult = areaBatch?.sharedAccuracyResult ?? attackOptions.sharedAccuracyResult ?? null;

const distractingGestureResult = sharedAccuracyResult || autoHitUsed
  ? (sharedTamerAttackTalent?.distractingGestureResult ?? null)
  : await requestDistractingGesture({
      attacker,
      defender,
      attackItem
    });

const hugePowerReroll = sharedAccuracyResult || autoHitUsed
  ? (areaBatch?.sharedHugePowerReroll ?? null)
  : await getHugePowerRerollDeclaration(attacker, { ...attackOptions, attackItem });

if (!sharedAccuracyResult && !autoHitUsed && hugePowerReroll === null) {
  await finishCommittedBlastIntercede(intercedeDeclaration, defender);
  return;
}

const accuracyResult = sharedAccuracyResult ?? (
  autoHitUsed
    ? {
        roll: null,
        rolledSuccesses: 0,
        automaticSuccesses: Math.max(0, Number(getActorSv(attacker) ?? 0)),
        totalSuccesses: Math.max(0, Number(getActorSv(attacker) ?? 0)),
        adjustedDiceResults: [],
        autoHit: true,
        ddaTamerDirectEffects: []
      }
    : await rollPool(attacker, "accuracy", {
  diceModifier: accuracyDiceBonus,

  automaticSuccesses: Number(qualityAttackModifier.automaticSuccesses ?? 0),
  rerollResultsUpTo: Number(hugePowerReroll?.rerollResultsUpTo ?? 0),
  rerollLabel: hugePowerReroll?.label ?? "",

  externalLabel: getAccuracyExternalLabel(
    isSignature,
    currentBattery,
    attributeAdvantageData,
    multiattackPenalty,
    qualityAttackModifier,
    attackerEffectModifiers,
    customAccuracyModifier
  ),

  modifierBreakdown: getAccuracyModifierBreakdown({
    isSignature,
    currentBattery,
    attributeAdvantageData,
    multiattackPenalty,
    qualityAttackModifier,
    attackerEffectModifiers,
    customAccuracyModifier,
    attackOptionModifier: Number(attackOptions.accuracyDiceModifier ?? 0),
    declaredQualityBonus: Number(declaredAttackQualityEffects.accuracyBonus ?? 0)
  }),

  finalDiceMultiplier: distractingGestureResult ? 0.5 : 1,
  allowZeroSuccesses: Boolean(distractingGestureResult)
  })
);

  if (!accuracyResult) {
    ui.notifications.warn(localize("DDA.Warning.AccuracyRollCancelledOrInvalid"));
    await finishCommittedBlastIntercede(intercedeDeclaration, defender);
    return;
  }

  if (!sharedAccuracyResult && !isAreaBatchSecondary) {
    if (signatureVersatilityUsed && armedTamerAttackTalent.signature?.id) {
      await consumeArmedAttackTalent(attacker, armedTamerAttackTalent.signature.id);
    }
    if (autoHitUsed && armedTamerAttackTalent.autoHit?.id) {
      await consumeArmedAttackTalent(attacker, armedTamerAttackTalent.autoHit.id);
    }
  }

  if (autoHitUsed && !sharedAccuracyResult) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
      content: `<div class="dda-chat-card dda-effect-card effect-special"><h2>PUT 100% INTO THIS</h2><p>${combatText(
        "O Ataque usa Sucessos automáticos iguais ao SV e não permite rolagens de Precisão ou Esquiva.",
        "The Attack uses automatic Successes equal to SV and allows no Accuracy or Dodge roll."
      )}</p><p><strong>${combatText("Sucessos automáticos", "Automatic Successes")}:</strong> ${accuracyResult.totalSuccesses}.</p></div>`
    });
  }

const attackFunctionType = String(
  areaBatch?.functionTypeOverride ??
  attackItem.system.baseTags?.functionType ??
  "damage"
).trim().toLowerCase();
const weakAttackSupportAccuracyPenalty = isClashWeakAttack && attackFunctionType === "support" ? 1 : 0;
const weakAttackHalvesDodge = isClashWeakAttack && !clashDefenderHasReach;
const cleanseAccuracyPenalty =
  (cleanseDeclaration?.selective ? 1 : 0) +
  (cleanseIsActive && areaAttackDeclaration?.active ? 1 : 0);

const weaponMeleeFourSuccesses =
  getWeaponMeleeFourSuccesses(
    accuracyResult,

    Number(
      qualityAttackModifier
        .weaponMeleeFourSuccessesMax ?? 0
    )
  );

const overpowerResult = areaBatch?.sharedOverpowerResult ??
  await getOverpowerDeclaration(
    attacker,
    accuracyResult,
    {
      attackName:
        attackItem.name,

      isInterruptAttack,

      alreadyCountedFours:
        weaponMeleeFourSuccesses
    }
  );

const overpowerFourSuccesses =
  Math.max(
    0,
    Number(
      overpowerResult
        ?.fourSuccesses ?? 0
    )
  );

const accuracySuccessesBeforePositioningPenalty =
  Math.max(
    0,

    Number(
      accuracyResult.totalSuccesses ?? 0
    ) +

    weaponMeleeFourSuccesses +
    overpowerFourSuccesses +
    attributeAdvantageData
      .automaticSuccesses -

    cleanseAccuracyPenalty -
    weakAttackSupportAccuracyPenalty
  );

const rangePositioningPenalty = qualityAttackModifier.ignoreNegativeAccuracyModifiers
  ? 0
  : Math.max(
      0,
      -Number(attackTargeting.accuracyPenalty ?? 0)
    );

let accuracySuccesses = Math.max(
  0,
  accuracySuccessesBeforePositioningPenalty - rangePositioningPenalty
);

if (hugePowerReroll?.qualityId && hasQuality(attacker, "underwhelming")) {
  accuracySuccesses = Math.max(0, accuracySuccesses - getQualityRank(findQuality(attacker, "underwhelming")));
}

let criticalArmsResult = null;
if (hasQuality(attacker, "criticalArms") && getAttackQualityTags(attackItem).has("weapon")) {
  const criticalRoll = await new Roll("2d6").evaluate();
  criticalArmsResult = Number(criticalRoll.total);
  if (criticalArmsResult === 2) accuracySuccesses = 0;
  if (criticalArmsResult === 12) accuracySuccesses += 3;
}

const rangePositioningAccuracyNote = rangePositioningPenalty > 0
  ? `
    <li class="attack-penalty">
      ${combatText("Alcance/Posicionamento", "Range/Positioning")}:
      <strong>${accuracySuccessesBeforePositioningPenalty} → ${accuracySuccesses}</strong>
      (−${rangePositioningPenalty}).
    </li>
  `
  : "";

const dodgeShouldHalve = weakAttackHalvesDodge ||
  Boolean(clashContext?.halveDodge) ||
  Boolean(declaredAttackQualityEffects?.halveDodge) ||
  Boolean(attackOptions?.counterattackContext?.halveDodge);

const equalAccuracyAndDodgeCountsAsMiss = Boolean(
  qualityAttackModifier
    .fumbleEqualAccuracyAndDodgeCountsAsMiss
);

let dodgeResult;
let teleportEscape = null;

if (
  !intercedeDeclaration &&
  !targetIsWillingForEffect &&
  !qualityAttackModifier.sneakSuppressInterrupts &&
  !attackOptions.suppressTargetInterrupts
) {
  teleportEscape = await requestTeleportEscape({ defender, attacker, attackItem });
}

if (teleportEscape?.used) {
  dodgeResult = {
    roll: null,
    rolledSuccesses: 0,
    automaticSuccesses: Math.max(1, accuracySuccesses + 1),
    totalSuccesses: Math.max(1, accuracySuccesses + 1),
    teleportEscape: true,
    suppressSuccessfulDodgeTriggers: true,
    suppressMissTriggers: true
  };
} else if (outsideClashAttackContext?.active) {
  const syntheticDodge = attackFunctionType === "support"
    ? Math.max(0, Number(outsideClashAttackContext.supportDodgeSuccesses ?? 0))
    : 0;
  dodgeResult = {
    roll: null,
    rolledSuccesses: 0,
    automaticSuccesses: syntheticDodge,
    totalSuccesses: syntheticDodge,
    outsideClash: true,
    suppressDodgePenalty: true
  };
} else if (intercedeDeclaration || areaBatch?.areaInterceded) {
  dodgeResult = {
    roll: null,
    rolledSuccesses: 0,
    automaticSuccesses: 0,
    totalSuccesses: 0,
    interceded: true,
    areaInterceded: Boolean(areaBatch?.areaInterceded)
  };
} else if (autoHitUsed) {
  dodgeResult = {
    roll: null,
    rolledSuccesses: 0,
    automaticSuccesses: 0,
    totalSuccesses: 0,
    autoHit: true,
    suppressSuccessfulDodgeTriggers: true,
    suppressMissTriggers: true,
    suppressDodgePenalty: true
  };
} else if (targetIsWillingForEffect) {
  dodgeResult = {
    roll: null,
    rolledSuccesses: 0,
    automaticSuccesses: 0,
    totalSuccesses: 0,
    suppressSuccessfulDodgeTriggers: true,
    suppressMissTriggers: true
  };
} else if (defender.flags?.["digimon-digital-adventures"]?.evokerCreation) {
  dodgeResult = {
    roll: null,
    rolledSuccesses: 0,
    automaticSuccesses: 0,
    totalSuccesses: 0,
    evokerCreationCannotDodge: true
  };
} else if (defender.type === "character" && attackFunctionType === "support") {
  dodgeResult = await getAttackDodgeResult(
    defender,
    attackFunctionType,
    defenderEffectModifiers.dodgeDice -
      Math.max(0, Number(qualityAttackModifier.domainTargetDodgePenalty ?? 0))
  );
} else {
const defenderFreeNegativeContext = getFreeNegativeAttackContext(defender, attackItem);
const moodDodgeBonus = defenderFreeNegativeContext.mood !== null && Number(defenderFreeNegativeContext.mood) > 4
  ? Number(defenderFreeNegativeContext.mood) - 4
  : 0;
dodgeResult = await requestAttackDodgeResult({
  attacker,
  defender,
  attackItem,
  attackFunctionType,
  effectDodgeModifier: defenderEffectModifiers.dodgeDice +
  moodDodgeBonus +
  getSentryMeleeDodgePenalty(defender, attackItem) -
  Math.max(0, Number(attackOptions?.counterattackContext?.dodgePenalty ?? 0)) - (
    qualityAttackModifier.ignoresUncatchableTarget &&
    defender.system?.qualityFeatures?.dataSpecialization?.uncatchableTarget
      ? 3
      : 0
  ) - Math.max(0, Number(qualityAttackModifier.domainTargetDodgePenalty ?? 0)),
  accuracySuccesses,
  dodgeShouldHalve,
  equalAccuracyAndDodgeCountsAsMiss,
  areaAttack: Boolean(areaAttackDeclaration?.active),
  areaRequestId: String(areaBatch?.id ?? ""),
  areaProgressMessageId: String(areaBatch?.progressMessageId ?? ""),
  areaTargetTokenId: String(targetToken?.id ?? ""),
  ignoresUncatchableTarget: Boolean(
    qualityAttackModifier.ignoresUncatchableTarget
  ),
  suppressTargetInterrupts: Boolean(
    qualityAttackModifier.sneakSuppressInterrupts
  ),
  fakeoutEligible: Boolean(
    (accuracyResult.ddaTamerDirectEffects ?? []).some((effect) => effect?.fakeout)
  )
});
}

if (!dodgeResult) {
  ui.notifications.warn(localize("DDA.Warning.DodgeRollCancelledOrInvalid"));
  await finishCommittedBlastIntercede(intercedeDeclaration, defender);
  return;
}

let targetHealthPoolResult = null;
const isAlliedForcedMovementEffect = Boolean(
  targetIsAlly &&
  activeEffectTags.some((tag) => ["pull", "push"].includes(getEffectTagKey(tag)))
);

if (targetIsWillingForEffect || isAlliedForcedMovementEffect) {
  targetHealthPoolResult = await rollCleanseTargetHealthPool(defender, {
    label: isAlliedCleanse
      ? localize("DDA.Effect.Cleanse")
      : isAlliedForcedMovementEffect
        ? combatText("Movimento Forçado em Aliado", "Allied Forced Movement")
        : combatText("Efeito Positivo", "Positive Effect")
  });

  if (!targetHealthPoolResult && (isAlliedCleanse || isAlliedForcedMovementEffect)) {
    ui.notifications.warn(localize("DDA.Warning.TargetHealthRollCancelledOrInvalid"));
    await finishCommittedBlastIntercede(intercedeDeclaration, defender);
    return;
  }
}

const rawDodgeSuccesses =
  Number(
    dodgeResult.totalSuccesses ?? 0
  );

const originalRawDodgeSuccesses =
  Number(
    dodgeResult
      .originalTotalSuccesses ??
    rawDodgeSuccesses
  );

let dodgeSuccesses =
  dodgeShouldHalve
    ? Math.ceil(
        rawDodgeSuccesses / 2
      )
    : rawDodgeSuccesses;

let luckyMissResult = null;
if (hasQuality(defender, "luckyMiss") && !dodgeResult.suppressSuccessfulDodgeTriggers) {
  const luckyRoll = await new Roll("2d6").evaluate();
  luckyMissResult = Number(luckyRoll.total);
  if (luckyMissResult === 2) dodgeSuccesses = 0;
  if (luckyMissResult === 12) dodgeSuccesses += 3;
}

const originalDodgeSuccesses =
  dodgeShouldHalve
    ? Math.ceil(
        originalRawDodgeSuccesses / 2
      )
    : originalRawDodgeSuccesses;

const tamerDefense = dodgeResult.tamerDefense ?? null;

let hit = tamerDefense
  ? Number(tamerDefense.damage ?? 0) > 0
  : targetIsWillingForEffect
    ? true
    : accuracySuccesses > 0 &&
    (
      equalAccuracyAndDodgeCountsAsMiss
        ? accuracySuccesses > dodgeSuccesses
        : accuracySuccesses >= dodgeSuccesses
    );

if (criticalArmsResult === 2) hit = false;
if (criticalArmsResult === 12) hit = true;
if (autoHitUsed) hit = true;

const attackNegatedByInvincible = isBossInvincibleAgainstAttack(defender, {
  calledShotMode: attackOptions.calledShotMode
});
if (attackNegatedByInvincible) hit = false;

if (criticalArmsResult === 2) {
  const effects = foundry.utils.deepClone(attacker.system?.effects?.active ?? []);
  effects.push({
    id: foundry.utils.randomID(), tag: "disarm", label: "[DISARM]", sourceActorUuid: attacker.uuid,
    durationRule: "combat", hasDuration: false, endsAtCombatEnd: true, removalActionCost: 2,
    appliedCombatId: game.combat?.id ?? "", appliedCombatRound: Number(game.combat?.round ?? 0), appliedCombatTurn: Number(game.combat?.turn ?? -1)
  });
  await attacker.update({ "system.effects.active": effects });
}

const luckyMissMitigation = luckyMissResult === 12 && hit;
if (luckyMissMitigation) {
  qualityAttackModifier.luckyMissDamageHalved = true;
  qualityAttackModifier.luckyMissEffectPenalty = 1;
}

await adjustPositiveReinforcementMood(attacker, hit ? 1 : -1, hit ? "attackHit" : "attackMiss");
await adjustPositiveReinforcementMood(defender, hit ? -1 : 1, hit ? "wasHit" : "dodged");

if (!hit && freeNegativeContext.slayerApplies) {
  const selfWoundPath = attacker.type === "character" ? "system.derived.wounds.value" : "system.miscStats.wounds.value";
  const currentSelfWounds = Math.max(0, Number(foundry.utils.getProperty(attacker, selfWoundPath) ?? 0));
  await attacker.update({ [selfWoundPath]: Math.max(0, currentSelfWounds - getActorSv(attacker)) });
}

await incrementCoordinatedAssaultMarks(defender);

const leftoverSuccesses = tamerDefense
  ? 0
  : hit
    ? Math.max(
        0,
        accuracySuccesses - dodgeSuccesses
      )
    : 0;

const substituteResolution = hit && !tamerDefense
  ? await requestSubstitute({
      attacker,
      defender,
      suppressInterrupts: Boolean(
        qualityAttackModifier.sneakSuppressInterrupts ||
        attackOptions.suppressTargetInterrupts
      ),
      inClash: Boolean(
        clashContext?.active ||
        clashContext?.isClash ||
        clashContext?.clashId
      )
    })
  : { used: false, success: false };

const attackDivertedBySubstitute = Boolean(
  substituteResolution?.success
);

const defaultDamageBase = Number(attacker.system.mainStats?.damage?.total ?? 0);

const attackerDamage = await evaluateAttackFormula(
  attacker,
  attackItem.system.damage?.baseFormula,
  defaultDamageBase
);

const baseAttackDamageBonus = Number(attackItem.system.damage?.bonus ?? 0);
const clashFlatDamageBonus = Number(
  attackOptions.flatDamageBonus ??
  clashContext.flatDamageBonus ??
  0
);
const qualityDamageBonus = Number(qualityAttackModifier.damageBonus ?? 0) + clashFlatDamageBonus;

const baseUnalterableDamage = Number(attackItem.system.damage?.unalterable ?? 0);

const basePiercingUnalterableDamage = hit
  ? (
      areaAttackDeclaration?.active
        ? Number(
            qualityAttackModifier
              .piercingUnalterableDamageArea ?? 0
          )
        : Number(
            qualityAttackModifier
              .piercingUnalterableDamageRegular ?? 0
          )
    )
  : 0;

const fumbleAdditionalDodgeForPiercing =
  Math.max(
    0,
    Number(
      qualityAttackModifier
        .fumbleAdditionalDodgeForPiercing ?? 0
    )
  );

const fumblePiercingDamageCap =
  fumbleAdditionalDodgeForPiercing > 0
    ? Math.max(
        0,
        accuracySuccesses -
        (
          dodgeSuccesses +
          fumbleAdditionalDodgeForPiercing
        )
      )
    : Number.POSITIVE_INFINITY;

const piercingUnalterableDamage = hit
  ? Math.min(
      basePiercingUnalterableDamage,
      fumblePiercingDamageCap
    )
  : 0;

qualityAttackModifier
  .fumblePiercingDamageBeforePenalty =
    basePiercingUnalterableDamage;

qualityAttackModifier
  .fumblePiercingDamageAfterPenalty =
    piercingUnalterableDamage;

const signatureBatteryUnalterableDamage = Math.max(
  0,
  Number(qualityAttackModifier.signatureBatteryUnalterableDamage ?? 0)
);

const qualityUnalterableDamage =
  Number(qualityAttackModifier.unalterableDamage ?? 0) +
  piercingUnalterableDamage +
  signatureBatteryUnalterableDamage;

const signatureNormalDamageBonus = Math.max(
  0,
  signatureDamageBonus - signatureBatteryUnalterableDamage
);

const attackDamageBonus = baseAttackDamageBonus + qualityDamageBonus;
let unalterableDamage = baseUnalterableDamage + qualityUnalterableDamage;

const baseDefenderArmor = Number(defender.system.mainStats?.armor?.total ?? 0);
const intercedeArmorBonus = Math.max(
  0,
  Number(intercedeDeclaration?.intercedeArmorBonus ?? 0),
  Number(areaBatch?.areaIntercedeArmorBonus ?? 0)
);
const trueGuardianProtection = areaBatch?.trueGuardianProtection ?? null;
const trueGuardianArmorBonus = Math.max(
  0,
  Number(trueGuardianProtection?.armorBonus ?? 0)
);

let defenderArmor = Math.max(
  0,
  baseDefenderArmor +
    defenderEffectModifiers.armor +
    intercedeArmorBonus +
    trueGuardianArmorBonus -
    Math.max(0, Number(qualityAttackModifier.domainTargetArmorPenalty ?? 0))
);

const defenderMood = getFreeNegativeAttackContext(defender, attackItem).mood;
if (defenderMood !== null && Number(defenderMood) < 3) {
  defenderArmor = Math.max(0, defenderArmor - (3 - Number(defenderMood)));
}

if (attackOptions?.counterattackContext?.halveArmor) {
  defenderArmor = Math.ceil(defenderArmor / 2);
}

if (
  attackOptions?.punishingStrikeContext?.active &&
  intercedeDeclaration
) {
  defenderArmor = Math.ceil(defenderArmor / 2);
}

  const attackDealsDamage = areaBatch?.functionTypeOverride === "damage"
    ? true
    : attackItem.system.damage?.enabled !== false;

  let normalDamage = 0;
  let finalDamage = 0;
  let rawWeakAttackNormalDamage = 0;
  let postHitQualityEffects = {};

  if (tamerDefense && attackDealsDamage && attackFunctionType === "damage") {
    normalDamage = Math.max(0, Number(tamerDefense.damage ?? 0));
    rawWeakAttackNormalDamage = normalDamage;
    finalDamage = normalDamage;
  } else if (hit && attackDealsDamage && !attackDivertedBySubstitute) {
    const minimumDamageAfterArmor = qualityAttackModifier.allowArmorToReduceDamageToZero
      ? 0
      : 1;

    normalDamage = Math.max(
      minimumDamageAfterArmor,
      attackerDamage +
        attackDamageBonus +
        attackerEffectModifiers.damage +
        signatureNormalDamageBonus +
        leftoverSuccesses +
        multiattackDamagePenalty -
        defenderArmor
    );

    const fragileDamagePenalty = Math.max(
      0,
      Number(
        qualityAttackModifier?.fragileDamagePenalty ?? 0
      )
    );

    if (fragileDamagePenalty > 0) {
      normalDamage = Math.max(
        0,
        normalDamage - fragileDamagePenalty
      );
    }

    rawWeakAttackNormalDamage = normalDamage;

    if (
      isClashWeakAttack &&
      attackFunctionType !== "support"
    ) {
      normalDamage = Math.ceil(normalDamage / 2);
    }

    if (declaredAttackQualityEffects?.halveDamageOnHit) {
      normalDamage = Math.ceil(normalDamage / 2);
      qualityAttackModifier.feintDamageHalved = true;
    }

    if (qualityAttackModifier.luckyMissDamageHalved) {
      normalDamage = Math.ceil(normalDamage / 2);
    }

    if (
      areaAttackDeclaration?.active &&
      attackFunctionType === "damage"
    ) {
      const ignoresAreaHalving = Boolean(
        qualityAttackModifier?.areaIgnoreDamageHalving
      );

      if (!ignoresAreaHalving) {
        const areaHalvedDamage = Math.ceil(
          normalDamage / 2
        );

        const bombardmentFloor =
          getZonerBombardmentDamageFloor({
            attacker,
            qualityAttackModifier,
            areaAttackDeclaration,
            damageAfterArmor: normalDamage
          });

        normalDamage = Math.max(
          areaHalvedDamage,
          bombardmentFloor
        );
      }
    }

    if (outsideClashAttackContext?.active) {
      normalDamage = Math.max(
        0,
        normalDamage - Math.max(0, Number(outsideClashAttackContext.damageReduction ?? 0))
      );
    }

    postHitQualityEffects =
      await getPostHitQualityEffects({
        attacker,
        defender,
        attackItem,
        qualityAttackModifier,
        declaredAttackQualityEffects,
        hit,
        attackDealsDamage,
        attackFunctionType,
        normalDamage,
        areaAttackDeclaration,
        areaBatch
      });

    if (postHitQualityEffects === null) {
      await finishCommittedBlastIntercede(intercedeDeclaration, defender);
      return;
    }

    normalDamage = Math.max(
      0,
      normalDamage +
        Number(
          postHitQualityEffects.damageBonus ?? 0
        )
    );

    normalDamage = Math.max(
      Math.max(0, Number(postHitQualityEffects.minimumNormalDamage ?? 0)),
      normalDamage -
        Number(
          postHitQualityEffects.damageReduction ?? 0
        )
    );

    if (postHitQualityEffects.preventNormalDamage) {
      normalDamage = 0;
    }

    const braceResolution = await requestBrace({
      attacker,
      defender,
      normalDamage,
      interceded: Boolean(intercedeDeclaration),
      suppressInterrupts: Boolean(
        qualityAttackModifier.sneakSuppressInterrupts ||
        attackOptions.suppressTargetInterrupts
      )
    });

    if (braceResolution?.used) {
      normalDamage = Math.max(
        0,
        Number(braceResolution.adjustedDamage ?? normalDamage)
      );

      postHitQualityEffects.notes ??= [];
      postHitQualityEffects.notes.push(
        braceResolution.criticalFailure
          ? combatText(
              `Preparar falhou criticamente: o Dano após Armadura aumentou para ${normalDamage}.`,
              `Brace critically failed: Damage after Armor increased to ${normalDamage}.`
            )
          : braceResolution.success
            ? combatText(
                `Preparar reduziu o Dano após Armadura para ${normalDamage}.`,
                `Brace reduced Damage after Armor to ${normalDamage}.`
              )
            : combatText(
                "Preparar não reduziu o Dano.",
                "Brace did not reduce the Damage."
              )
      );
    }

    finalDamage = normalDamage + unalterableDamage;

    qualityAttackModifier.drainHealing = 0;
  } else if (
    !hit &&
    attackDealsDamage &&
    !attackDivertedBySubstitute &&
    qualityAttackModifier.qualityTags.includes("smite") &&
    !attackNegatedByInvincible
  ) {
    /*
     * [SMITE] resolves a miss for half of the Attack's own Damage. It does
     * not receive Accuracy-success damage or any Attack Quality damage
     * benefits. Intrinsic Attack damage, Signature Battery, Active Effects,
     * Multiattack modifiers, Armor, and intrinsic Unalterable damage remain.
     */
    const smiteNormalBeforeHalving = Math.max(
      0,
      attackerDamage +
        baseAttackDamageBonus +
        attackerEffectModifiers.damage +
        signatureDamageBonus +
        multiattackDamagePenalty -
        defenderArmor
    );

    const smiteTotalBeforeHalving = Math.max(
      0,
      smiteNormalBeforeHalving + baseUnalterableDamage
    );

    const smiteTotalDamage = Math.ceil(smiteTotalBeforeHalving / 2);
    const smiteUnalterableDamage = Math.min(
      smiteTotalDamage,
      Math.ceil(Math.max(0, baseUnalterableDamage) / 2)
    );

    unalterableDamage = smiteUnalterableDamage;
    normalDamage = Math.max(0, smiteTotalDamage - smiteUnalterableDamage);
    finalDamage = smiteTotalDamage;
    qualityAttackModifier.bossSmiteMissDamage = finalDamage > 0;
  } else if (attackDivertedBySubstitute) {
    normalDamage = 0;
    finalDamage = 0;
    postHitQualityEffects = {
      damageBonus: 0,
      damageReduction: 0,
      minimumNormalDamage: 0,
      preventNormalDamage: true,
      extraEffects: [],
      notes: [combatText(
        `Substituto desviou o Ataque; ${substituteResolution.cost ?? 0} Caixas de Ferimento verdadeiras foram perdidas.`,
        `Substitute diverted the Attack; ${substituteResolution.cost ?? 0} true Wound Boxes were forfeited.`
      )]
    };
  }

  const gritDefenseDealsDamage = Boolean(
  dodgeResult.gritDefense &&
  !attackDivertedBySubstitute &&
  attackDealsDamage &&
  attackFunctionType === "damage"
);

const gritMinimumDamageApplied = Boolean(
  gritDefenseDealsDamage &&
  finalDamage < 1
);

if (gritMinimumDamageApplied) {
  normalDamage = Math.max(
    1,
    normalDamage
  );

  finalDamage = Math.max(
    1,
    finalDamage
  );
}

const volatileElement = String(
  attackItem.flags?.["digimon-digital-adventures"]?.element ?? ""
).trim();
const defenderNaturewalkElements = new Set(
  defender.system?.qualityFeatures?.naturewalk?.elements ?? []
);
const volatileElementImmune = Boolean(
  attackItem.flags?.["digimon-digital-adventures"]?.volatileExplosion &&
  volatileElement &&
  defender.system?.qualityFeatures?.elementMaster?.active &&
  [...defenderNaturewalkElements].some((element) => identityForMatching(element) === identityForMatching(volatileElement))
);
if (volatileElementImmune) {
  normalDamage = 0;
  finalDamage = 0;
}

const gritDamageOnMiss = Boolean(
  gritDefenseDealsDamage &&
  !hit
);

const smiteMissDamage = Boolean(
  qualityAttackModifier.bossSmiteMissDamage &&
  !hit &&
  attackDealsDamage &&
  finalDamage > 0
);

const confuseAffectedStat = hit && activeEffectTags.some((tag) => getEffectTagKey(tag) === "confuse")
  ? await getConfuseAffectedStatDeclaration(defender)
  : "";

const focusedResistance = hit && activeEffectTags.length && !attackDivertedBySubstitute
  ? await requestFocusedResistance({
      defender,
      attacker,
      attackItem,
      effectTags: activeEffectTags
    })
  : { used: false, multiplier: 1, canNegate: Boolean(defender.system?.qualityFeatures?.preservation?.immunity) };

let effectApplication = getAttackEffectApplication({
  hit,
  attackItem,
  activeEffectTags,
  normalDamage,
  leftoverSuccesses,
  attacker,
  defender,
  cleanseDeclaration,
  targetIsAlly,
  targetIsWilling: targetIsWillingForEffect,
  positiveTargetHealthSuccesses: Number(
    targetHealthPoolResult
      ?.totalSuccesses ?? 0
  ),
  cleanseTargetHealthSuccesses: Number(
    targetHealthPoolResult
      ?.totalSuccesses ?? 0
  ),
  forcedMovementTargetHealthSuccesses: Number(
    targetHealthPoolResult
      ?.totalSuccesses ?? 0
  ),
  confuseAffectedStat,

  accuracySuccesses,
  qualityAttackModifier,
  areaAttackDeclaration,
  isSignatureAttack: isSignature,
  ignoreEffectResistance:
    attackOptions.calledShotMode === "focused" &&
    leftoverSuccesses >= 1,
  additionalDurationPenalty: Number(
    declaredAttackQualityEffects?.effectDurationPenalty ?? 0
  ) + Math.max(0, Number(qualityAttackModifier?.luckyMissEffectPenalty ?? 0)),
  effectResistanceMultiplier: Number(focusedResistance?.multiplier ?? 1),
  effectResistanceCanNegate: Boolean(focusedResistance?.canNegate)
  });

if (attackDivertedBySubstitute) {
  effectApplication = {
    applied: [],
    reason: combatText(
      "Substituto desviou o dano e as Tags de Efeito do Ataque.",
      "Substitute diverted the Attack's damage and Effect Tags."
    )
  };
}

if (Array.isArray(postHitQualityEffects?.extraEffects) && postHitQualityEffects.extraEffects.length) {
  effectApplication.applied.push(...postHitQualityEffects.extraEffects);
}

if (trueGuardianProtection?.negateEffects && effectApplication.applied.length) {
  effectApplication = {
    applied: [],
    reason: combatText(
      `${trueGuardianProtection.guardianName || "Guardião Verdadeiro"} protegeu o alvo e negou as Tags de Efeito da Área de Ataque.`,
      `${trueGuardianProtection.guardianName || "True Guardian"} protected the target and negated the Area Attack's Effect Tags.`
    )
  };
}

const resultLabel = hit
  ? localize("DDA.Attack.Result.Hit")
  : localize("DDA.Attack.Result.Miss");
  const resultClass = hit ? "hit" : "miss";

const clashWeakAttackTechnicalNote = isClashWeakAttack
  ? `
    <li class="attack-penalty">
      <strong>Clash Weak Attack</strong>:
      ${attackFunctionType === "support"
        ? "Accuracy Successes -1."
        : "damage after Armor is halved, rounded up."}
      ${weakAttackHalvesDodge
        ? " Target Dodge Successes are halved."
        : clashDefenderHasReach
          ? " Target has Reach, so Dodge Successes are not halved."
          : ""}
    </li>
  `
  : "";

const clashWeakAttackAccuracyNote = weakAttackSupportAccuracyPenalty
  ? `
    <li class="attack-penalty">
      Clash Weak Attack support penalty:
      <strong>-${weakAttackSupportAccuracyPenalty}</strong> Accuracy Success.
    </li>
  `
  : "";

const clashWeakAttackDodgeNote = weakAttackHalvesDodge
  ? `
    <li class="attack-penalty">
      Clash Weak Attack Dodge:
      <strong>${rawDodgeSuccesses} → ${dodgeSuccesses}</strong>.
    </li>
  `
  : "";

const tuckAndRollDodgeNote =
  dodgeResult.tuckAndRoll
    ? `
      <li>
        <strong>
          ${localize(
            "DDA.TamerTalent.TuckAndRoll.Title"
          )}:
        </strong>

        ${formatI18n(
          "DDA.TamerTalent.TuckAndRoll.Applied",
          {
            actor:
              escapeHtml(
                dodgeResult
                  .tuckAndRollTamerName ??
                defender.name
              ),

            original:
              originalDodgeSuccesses,

            final:
              dodgeSuccesses
          }
        )}
      </li>
    `
    : "";

    const gritDefenseNote =
  dodgeResult.gritDefense
    ? `
      <li>
        <strong>
          ${localize(
            "DDA.TamerTalent.Grit.Title"
          )}:
        </strong>

        ${localize(
          "DDA.TamerTalent.Grit.DefenseApplied"
        )}

        ${
          gritDefenseDealsDamage
            ? localize(
                "DDA.TamerTalent.Grit.MinimumDamage"
              )
            : ""
        }
      </li>
    `
    : "";

const clashWeakAttackDamageNote = isClashWeakAttack && attackFunctionType !== "support" && hit && attackDealsDamage
  ? `
    <li class="attack-penalty">
      Clash Weak Attack damage after Armor:
      <strong>${rawWeakAttackNormalDamage} → ${normalDamage}</strong>.
    </li>
  `
  : "";

const outsideClashTechnicalNote = outsideClashAttackContext?.active
  ? `
    <li class="attack-clash-protection">
      <strong>${combatText("Proteção de Clash", "Clash Protection")}</strong>:
      ${attackFunctionType === "support"
        ? combatText(
            `Esquiva sintética ${Number(outsideClashAttackContext.supportDodgeSuccesses ?? 0)} pela proteção de RAM${outsideClashAttackContext.exposingHold ? " (Imobilização Exposta)" : ""}.`,
            `Synthetic Dodge ${Number(outsideClashAttackContext.supportDodgeSuccesses ?? 0)} from RAM protection${outsideClashAttackContext.exposingHold ? " (Exposing Hold)" : ""}.`
          )
        : combatText(
            `Redução de Dano ${Number(outsideClashAttackContext.damageReduction ?? 0)} após Armadura${outsideClashAttackContext.exposingHold ? " (Imobilização Exposta)" : ""}.`,
            `Damage reduction ${Number(outsideClashAttackContext.damageReduction ?? 0)} after Armor${outsideClashAttackContext.exposingHold ? " (Exposing Hold)" : ""}.`
          )}
    </li>
  `
  : "";

const areaAttackTechnicalNote = areaAttackDeclaration?.active
  ? `
    <li>
      <strong>${areaAttackDeclaration.label}</strong>:
      ${areaAttackDeclaration.size > 0
        ? `${combatText("Tamanho", "Size")} ${Number(areaAttackDeclaration.size)}; `
        : ""}
      ${areaAttackDeclaration.targetMode
        ? `${combatText("alvos", "targets")}: ${escapeHtml(areaAttackDeclaration.targetMode)}; `
        : ""}
      ${attackFunctionType === "damage"
        ? combatText(
            "o Dano após Armadura é reduzido pela metade, arredondado para cima.",
            "damage after Armor is halved, rounded up."
          )
        : areaAttackDeclaration.targetMode === "all" &&
          hasZonerOption(qualityAttackModifier, "firewallBypass")
          ? combatText(
              "Firewall Bypass impede a redução de Potência e Duração.",
              "Firewall Bypass prevents the Potency and Duration reduction."
            )
          : combatText(
              "a Potência e a Duração dos Efeitos são reduzidas em 1, salvo outra regra.",
              "support area effects have their Potency and Duration reduced by 1 unless another rule says otherwise."
            )}
    </li>
  `
  : "";


const qualityModifierNote = qualityAttackModifier.qualities.length
  ? `
    <details class="dda-card-details dda-attack-details dda-quality-details">
<summary>
  ${localize("DDA.Attack.AppliedQualities")}
  <span>${qualityAttackModifier.qualities.length}</span>
</summary>

      <ul class="dda-effect-list dda-attack-quality-list">
        ${qualityAttackModifier.qualities.map((quality) => `
          <li class="attack-quality-entry">
            <strong>${quality.name}</strong>

            <div class="attack-quality-parts">
              ${quality.parts.map((part) => {
                return `<span>${part}</span>`;
              }).join("")}
            </div>
          </li>
        `).join("")}
      </ul>
    </details>
  `
  : "";


const effectTagsNote = activeEffectTags.length
  ? `
    <ul class="dda-effect-list dda-attack-tags-list">
      <li class="attack-effect-tags">
${localize("DDA.Attack.EffectTags")}:
        <div class="attack-effect-tag-chips">
          ${activeEffectTags.map((tag) => {
            const categoryClass = getEffectCardCategoryClass(tag);
            const label =
  escapeHtml(
    getEffectTagLabel(tag)
  );

            return `<span class="attack-effect-tag ${categoryClass}">${label}</span>`;
          }).join("")}
        </div>
      </li>
    </ul>
  `
  : "";

const bossInvincibleNegationNote = attackNegatedByInvincible
  ? `<p class="attack-effect-note"><strong>[INVINCIBLE]</strong> ${combatText("negou completamente este Ataque. Called Shots ignoram esta proteção.", "completely negated this Attack. Called Shots ignore this protection.")}</p>`
  : "";

const effectApplicationNote = activeEffectTags.length
  ? `
    <ul class="dda-effect-list dda-attack-effects-summary-list">
      ${
        effectApplication.applied.length
          ? `
            <li class="attack-effects-applied">
              ${localize("DDA.Attack.AppliedEffects")}:
                            <div class="attack-effect-tag-chips">
                              ${effectApplication.applied
                .map(renderAppliedEffectTag)
                .join("")}
              </div>
            </li>
          `
          : `
            <li class="attack-effects-none">
${localize("DDA.Attack.AppliedEffects")}:
<strong>${localize("DDA.Label.None").toLowerCase()}</strong>.
              ${effectApplication.reason ? `<span>${effectApplication.reason}</span>` : ""}
            </li>
          `
      }
    </ul>

    <details class="dda-card-details dda-attack-details dda-effects-details">
      <summary>
${localize("DDA.Attack.EffectDetails")}
        <span>${activeEffectTags.length}</span>
      </summary>

      <ul class="dda-effect-list dda-attack-applied-effects-list">
        <li class="attack-effect-tags">
          ${localize("DDA.Attack.ActiveTags")}:
          <div class="attack-effect-tag-chips">
            ${activeEffectTags.map((tag) => {
              const categoryClass = getEffectCardCategoryClass(tag);
              const label =
  escapeHtml(
    getEffectTagLabel(tag)
  );

              return `<span class="attack-effect-tag ${categoryClass}">${label}</span>`;
            }).join("")}
          </div>
        </li>

        ${
          effectApplication.applied.length
            ? `
              <li class="attack-effects-applied">
              ${localize("DDA.Attack.ActuallyAppliedEffects")}:
                <div class="attack-effect-tag-chips">
                  ${effectApplication.applied
                    .map(renderAppliedEffectTag)
                    .join("")}
                </div>
              </li>
            `
            : `
              <li class="attack-effects-none">
${localize("DDA.Label.Reason")}:
<strong>${effectApplication.reason || localize("DDA.Attack.NoEffectWasApplied")}</strong>
              </li>
            `
        }
      </ul>
    </details>
  `
  : "";

const qualitySpecialNote = buildAttackQualitySpecialNote({
  qualityAttackModifier,
  hit,
  attackDealsDamage,
  leftoverSuccesses,
  isSignature,
  currentBattery,
  areaAttackDeclaration,
  areaBatch,
  declaredAttackQualityEffects,
  postHitQualityEffects
});

const hugePowerNote = hugePowerReroll?.qualityId
  ? `
    <ul class="dda-effect-list dda-attack-quality-special-list">
      <li>
        <strong>${hugePowerReroll.label || "Huge Power"}</strong>:
        rerolled Accuracy dice results up to
        <strong>${Number(hugePowerReroll.rerollResultsUpTo ?? 0)}</strong>.
      </li>
    </ul>
  `
  : "";

let interruptPayment = null;

if (usesInterruptPayment) {
  interruptPayment =
    await payPartnerInterruptAction(
      attacker,
      {
        reason:
          attackItem.name
      }
    );

  if (!interruptPayment?.success) {
    await finishCommittedBlastIntercede(intercedeDeclaration, defender);
    return null;
  }
}
  const calledShotNote = attackOptions.calledShotMode
    ? `<p class="dda-called-shot-note"><strong>${combatText("Tiro Localizado", "Called Shot")}:</strong> ${
        attackOptions.calledShotMode === "focused"
          ? combatText(
              leftoverSuccesses >= 1
                ? "Focado foi bem-sucedido; os Efeitos ignoram Resistência, imunidades e redução de Potência."
                : "Focado não obteve 1 Sucesso acima da Esquiva; os Efeitos seguem as regras normais.",
              leftoverSuccesses >= 1
                ? "Focused succeeded; Effects ignore Resistance, immunities, and Potency reduction."
                : "Focused did not score 1 Success over Dodge; Effects use the normal rules."
            )
          : combatText(
              leftoverSuccesses >= 1
                ? "Atirador de Elite foi bem-sucedido; o Mestre determina o efeito adicional."
                : "Atirador de Elite não obteve 1 Sucesso acima da Esquiva.",
              leftoverSuccesses >= 1
                ? "Sharpshooter succeeded; the GM determines the additional effect."
                : "Sharpshooter did not score 1 Success over Dodge."
            )
      }</p>`
    : "";
  const lifestealApplicationId = String(
    areaBatch?.id ?? foundry.utils.randomID()
  );
  const damageApplicationId = String(foundry.utils.randomID());

  const tamerIntercedeMustResolve = Boolean(
    hit && intercedeDeclaration && defender.type === "character"
  );
  const tamerIntercedeResolutionButton = tamerIntercedeMustResolve
    ? `
      <button
        type="button"
        class="dda-apply-damage"
        data-damage-application-id="${escapeHtml(damageApplicationId)}"
        data-defender-uuid="${defender.uuid}"
        data-attacker-uuid="${attacker.uuid}"
        data-damage="1"
        data-hold-back="false"
        data-tamer-intercede="true"
        data-focus-temp-multiplier="${Number(qualityAttackModifier.focusTemporaryWoundMultiplier ?? 1)}"
        data-lifesteal-cap="${Number(qualityAttackModifier.lifestealHealingCap ?? 0)}"
        data-lifesteal-key="${escapeHtml(lifestealApplicationId)}"
      >
        ${localizeQ("DDA.Intercede.ResolveTamer", "Resolve Tamer Intercede")}
      </button>`
    : "";
  const content = `
    <div class="dda-chat-card dda-effect-card effect-special dda-attack-card ${resultClass}">
      <h2>${attackItem.name}</h2>

      ${calledShotNote}

      <ul class="dda-effect-list dda-attack-main-list">
        <li>
${localize("DDA.Attack.Attacker")}:
          <strong>${attacker.name}</strong>.
        </li>

        <li>
${localize("DDA.Attack.Target")}:
          <strong>${defender.name}</strong>.
        </li>
      </ul>

      ${effectTagsNote}

      <details class="dda-card-details dda-attack-details dda-attack-technical-details">
        <summary>
${localize("DDA.Attack.AttackDetails")}
<span>
  ${formatI18n(
    "DDA.Attack.ActionCostShort",
    {
      cost: displayedActionCost
    }
  )}
</span>
        </summary>

        <ul class="dda-effect-list dda-attack-technical-list">
<li>
  ${localize(
    "DDA.Attack.ActionCost"
  )}:

  <strong>
    ${displayedActionCost}
  </strong>.
</li>

${
  usesTamerHoldAttackWindow
    ? `
      <li>
        <strong>
          ${localize(
            "DDA.TamerAction.Hold.Title",
            "Segurar"
          )}:
        </strong>

        ${localize(
          "DDA.TamerAction.Hold.AttackCostPrepaid",
          "A resposta foi preparada pelas Ações do Tamer e não consumiu Ações do Digimon."
        )}
      </li>
    `
    : ""
}

${
  usesInterruptPayment
    ? `
      <li>
        <strong>
          ${
            interruptPayment
              ?.usedDangerSense
              ? localize(
                  "DDA.TamerTalent.DangerSense.Title",
                  "Danger Sense"
                )
              : localize(
                  "DDA.TamerTalent.DangerSense.Interrupt",
                  "Interrupção"
                )
          }:
        </strong>

        ${
          interruptPayment
            ?.usedDangerSense
            ? localize(
                "DDA.TamerTalent.DangerSense.AttackPaid",
                "O Digi-Escolhido gastou 1 Ação no lugar do Digimon."
              )
            : localize(
                "DDA.TamerTalent.DangerSense.PartnerPaid",
                "O Digimon gastou 1 Ação de Interrupção."
              )
        }
      </li>
    `
    : ""
}

${
  attackItem.system.baseTags?.rangeType === "range"
    ? `
      <li>
        ${localize(
          "DDA.Attack.RangeValue"
        )}:
                  <strong>${attackRangeTotal}</strong>
                  ${
                    Number(qualityAttackModifier.rangeBonus ?? 0)
                      ? `<span>(+${Number(qualityAttackModifier.rangeBonus ?? 0)} ${localize("DDA.Attack.FromQualities")})</span>`
                      : ""
                  }.
                </li>

                <li>
                  ${localize("DDA.Attack.EffectiveLimit")}:
                  <strong>${attackEffectiveLimitTotal}</strong>
                  ${
                    Number(qualityAttackModifier.effectiveLimitBonus ?? 0)
                      ? `<span>(+${Number(qualityAttackModifier.effectiveLimitBonus ?? 0)} ${localize("DDA.Attack.FromQualities")})</span>`
                      : ""
                  }.
                </li>
              `
              : ""
          }

          ${clashWeakAttackTechnicalNote}
          ${outsideClashTechnicalNote}
          ${areaAttackTechnicalNote}
          ${
  attackerEffectModifiers.notes.length
    ? `
      <li>
${localize("DDA.Attack.EffectsOnAttacker")}:
        <div class="attack-quality-parts">
          ${attackerEffectModifiers.notes.map((note) => `<span>${note}</span>`).join("")}
        </div>
      </li>
    `
    : ""
}

${
  defenderEffectModifiers.notes.length
    ? `
      <li>
${localize("DDA.Attack.EffectsOnTarget")}:
        <div class="attack-quality-parts">
          ${defenderEffectModifiers.notes.map((note) => `<span>${note}</span>`).join("")}
        </div>
      </li>
    `
    : ""
}
          ${
            totalQualityExtraActionCost !== 0
              ? `
                <li>
${localize("DDA.Attack.ExtraQualityCost")}:
                  <strong>${totalQualityExtraActionCost}</strong>.
                </li>
              `
              : ""
          }

          ${
            isSignature
              ? `
                <li>
${localize("DDA.Attack.SignatureMove")}:
<strong>${localize("DDA.Yes")}</strong> — ${localize("DDA.Attack.BatteryUsed")}:
                  <strong>${currentBattery}</strong>.
                </li>
              `
              : ""
          }

          ${
            multiattackMode === "diminishing" && attacksMadeThisTurn > 0
              ? `
                <li class="attack-penalty">
${localize("DDA.Attack.Multiattack")}:
<strong>${formatI18n("DDA.Attack.MultiattackPenalty", { penalty: multiattackPenalty })}</strong>
${localize("DDA.Attack.OnAccuracyAndDamage")}.
                </li>
              `
              : multiattackMode === "full" && attacksMadeThisTurn > 0
                ? `
                  <li>
${localize("DDA.Attack.Multiattack")}:
<strong>${localize("DDA.Attack.AdditionalAttackNoPenalty")}</strong>.
                  </li>
                `
                : ""
          }

          ${
            attributeAdvantageData.active
              ? `
                <li>
${localize("DDA.Attack.AttributeAdvantage")}:
                  <strong>${attributeAdvantageData.attackerLabel}</strong>
${localize("DDA.Attack.Beats")}
                  <strong>${attributeAdvantageData.defenderLabel}</strong>.
                </li>

                <li>
${localize("DDA.Label.Bonus")}:
                  ${
                    attributeAdvantageData.mode === "minor"
                      ? `<strong>${localize("DDA.Attack.BonusOneAccuracyDie")}</strong>.`
                      : `<strong>${localize("DDA.Attack.BonusOneAutomaticAccuracySuccess")}</strong>.`
                  }
                </li>
              `
              : attributeAdvantageData.mode !== "none"
                ? `
                  <li>
                    ${localize("DDA.Attack.AttributeAdvantage")}:
                    <strong>${localize("DDA.Attack.NoApplicableAdvantage")}</strong>.
                  </li>
                `
                : ""
          }
        </ul>
      </details>

      ${qualityModifierNote}

      ${qualitySpecialNote}
        ${hugePowerNote}

      <h3 class="attack-result-title">${resultLabel}</h3>

<ul class="dda-effect-list dda-attack-result-list">
  <li>
    ${localize("DDA.Attack.AccuracySuccesses")}:
    <strong>${accuracySuccesses}</strong>.
  </li>

  ${rangePositioningAccuracyNote}

  ${
    weaponMeleeFourSuccesses > 0
      ? `
        <li>
          ${localize("DDA.Attack.WeaponMeleeFours")}:
          <strong>+${weaponMeleeFourSuccesses}</strong>.
        </li>
      `
      : ""
  }

    ${
    overpowerResult?.used
      ? `
        <li>
          <strong>
            ${localize(
              "DDA.TamerTalent.Overpower.Title"
            )}:
          </strong>

          ${formatI18n(
            "DDA.TamerTalent.Overpower.ConvertedFours",
            {
              amount:
                overpowerFourSuccesses
            }
          )}
        </li>
      `
      : ""
  }

  ${
    attributeAdvantageData.automaticSuccesses > 0
      ? `
        <li>
          ${localize("DDA.Attack.AttributeAutomaticSuccesses")}:
          <strong>${attributeAdvantageData.automaticSuccesses}</strong>.
        </li>
      `
      : ""
  }

  <li>
    ${localize("DDA.Attack.DodgeSuccesses")}:
    <strong>${dodgeSuccesses}</strong>.
  </li>

  ${tuckAndRollDodgeNote}
  ${gritDefenseNote}
  ${clashWeakAttackAccuracyNote}
  ${clashWeakAttackDodgeNote}
</ul>

${
  gritDamageOnMiss
    ? `
      <ul class="dda-effect-list dda-attack-damage-summary-list">
        <li class="attack-final-damage">
          ${localize(
            "DDA.Attack.FinalDamage"
          )}:

          <strong>1</strong>.
        </li>

        <li>
          <strong>
            ${localize(
              "DDA.TamerTalent.Grit.Title"
            )}:
          </strong>

          ${localize(
            "DDA.TamerTalent.Grit.MinimumDamage"
          )}
        </li>
      </ul>

      <button
        type="button"
        class="dda-apply-damage"
        data-damage-application-id="${escapeHtml(damageApplicationId)}"
        data-defender-uuid="${defender.uuid}"
        data-attacker-uuid="${attacker.uuid}"
        data-damage="1"
        data-hold-back="${Boolean(attackOptions.holdBack)}"
        data-tamer-intercede="${Boolean(intercedeDeclaration && defender.type === "character")}"
        data-digimon-intercede="${Boolean((intercedeDeclaration && defender.type !== "character") || areaBatch?.areaInterceded)}"
        data-focus-temp-multiplier="${Number(qualityAttackModifier.focusTemporaryWoundMultiplier ?? 1)}"
        data-lifesteal-cap="${Number(qualityAttackModifier.lifestealHealingCap ?? 0)}"
        data-lifesteal-key="${escapeHtml(lifestealApplicationId)}"
      >
        ${localize(
          "DDA.Attack.ApplyDamage"
        )}
      </button>
    `
    : smiteMissDamage
      ? `
        <ul class="dda-effect-list dda-attack-damage-summary-list">
          <li class="attack-final-damage">
            ${localize("DDA.Attack.FinalDamage")}: <strong>${finalDamage}</strong>.
          </li>
          <li>
            <strong>[SMITE]</strong>: ${combatText(
              "O Ataque errou, mas causa metade do Dano próprio sem bônus de Dano por Sucessos de Precisão ou Qualidades.",
              "The Attack missed, but deals half its own Damage without Accuracy-success Damage or Quality Damage benefits."
            )}
          </li>
        </ul>
        <button
          type="button"
          class="dda-apply-damage"
          data-damage-application-id="${escapeHtml(damageApplicationId)}"
          data-defender-uuid="${defender.uuid}"
          data-attacker-uuid="${attacker.uuid}"
          data-damage="${finalDamage}"
          data-unalterable-portion="${unalterableDamage}"
          data-hold-back="${Boolean(attackOptions.holdBack)}"
          data-tamer-intercede="${Boolean(intercedeDeclaration && defender.type === "character")}"
          data-digimon-intercede="${Boolean((intercedeDeclaration && defender.type !== "character") || areaBatch?.areaInterceded)}"
          data-focus-temp-multiplier="1"
          data-lifesteal-cap="0"
        >
          ${localize("DDA.Attack.ApplyDamage")}
        </button>
      `
    : hit && attackDealsDamage
      ? `
<ul class="dda-effect-list dda-attack-damage-summary-list">
  <li class="attack-final-damage">
    ${localize("DDA.Attack.FinalDamage")}:
    <strong>${finalDamage}</strong>.
  </li>
</ul>

<details class="dda-card-details dda-attack-details dda-damage-details">
  <summary>
    ${localize("DDA.Attack.DamageDetails")}
    <span>${finalDamage}</span>
  </summary>

  <ul class="dda-effect-list dda-attack-damage-list">
    <li>
      ${localize("DDA.Attack.LeftoverSuccesses")}:
      <strong>${leftoverSuccesses}</strong>.
    </li>

    <li>
      ${localize("DDA.Attack.AttackerDamage")}:
      <strong>${attackerDamage}</strong>.
    </li>

    <li>
      ${localize("DDA.Attack.AttackBonus")}:
      <strong>${baseAttackDamageBonus}</strong>.
    </li>
          ${
  attackerEffectModifiers.damage !== 0
    ? `
      <li>
        ${localize("DDA.Attack.EffectDamageModifier")}:
        <strong>${attackerEffectModifiers.damage > 0 ? "+" : ""}${attackerEffectModifiers.damage}</strong>.
      </li>
    `
    : ""
}
    ${
      qualityDamageBonus !== 0
        ? `
          <li>
            ${localize("DDA.Attack.QualityDamageBonus")}:
            <strong>${qualityDamageBonus}</strong>.
          </li>
        `
        : ""
    }

    ${
      multiattackDamagePenalty !== 0
        ? `
          <li class="attack-penalty">
            ${localize("DDA.Attack.MultiattackDamagePenalty")}:
            <strong>${multiattackDamagePenalty}</strong>.
          </li>
        `
        : ""
    }

    ${
      isSignature
        ? `
          <li>
            ${localize("DDA.Attack.BatteryDamageBonus")}:
            <strong>${signatureNormalDamageBonus}</strong>.
          </li>
          ${signatureBatteryUnalterableDamage > 0
            ? `<li>${combatText("Bateria convertida em Dano Inalterável", "Battery converted to Unalterable Damage")}: <strong>${signatureBatteryUnalterableDamage}</strong>.</li>`
            : ""}
        `
        : ""
    }

    <li>
      ${localize("DDA.Attack.TargetArmor")}:
      <strong>${defenderArmor}</strong>.
    </li>
    ${
  defenderEffectModifiers.armor !== 0
    ? `
      <li>
        ${localize("DDA.Attack.EffectArmorModifier")}:
        <strong>${defenderEffectModifiers.armor > 0 ? "+" : ""}${defenderEffectModifiers.armor}</strong>.
      </li>
    `
    : ""
}
    ${
      intercedeArmorBonus > 0
        ? `
          <li>
            <strong>${combatText("Guardião Verdadeiro", "True Guardian")}</strong>:
            +${intercedeArmorBonus} ${combatText("Armadura neste ataque", "Armor for this attack")}.
          </li>
        `
        : ""
    }
    <li>
      ${localize("DDA.Attack.NormalDamage")}:
      <strong>${normalDamage}</strong>.
    </li>
    ${clashWeakAttackDamageNote}

    <li>
      ${localize("DDA.Attack.AttackUnalterableDamage")}:
      <strong>${baseUnalterableDamage}</strong>.
    </li>

    ${
      qualityUnalterableDamage !== 0
        ? `
          <li>
            ${localize("DDA.Attack.QualityUnalterableDamage")}:
            <strong>${qualityUnalterableDamage}</strong>.
          </li>
        `
        : ""
    }

    <li>
      ${localize("DDA.Attack.TotalUnalterableDamage")}:
      <strong>${unalterableDamage}</strong>.
    </li>
  </ul>
</details>


            ${
              finalDamage > 0
                ? `
<button
  type="button"
  class="dda-apply-damage"
  data-damage-application-id="${escapeHtml(damageApplicationId)}"
  data-defender-uuid="${defender.uuid}"
  data-attacker-uuid="${attacker.uuid}"
  data-damage="${finalDamage}"
  data-unalterable-portion="${unalterableDamage}"
  data-hold-back="${Boolean(attackOptions.holdBack)}"
  data-tamer-intercede="${Boolean(intercedeDeclaration && defender.type === "character")}"
        data-digimon-intercede="${Boolean((intercedeDeclaration && defender.type !== "character") || areaBatch?.areaInterceded)}"
  data-focus-temp-multiplier="${Number(qualityAttackModifier.focusTemporaryWoundMultiplier ?? 1)}"
  data-lifesteal-cap="${Number(qualityAttackModifier.lifestealHealingCap ?? 0)}"
  data-lifesteal-key="${escapeHtml(lifestealApplicationId)}"
>
  ${localize("DDA.Attack.ApplyDamage")}
</button>
                `
                : tamerIntercedeResolutionButton
            }
          `
          : `
            <p>${localize("DDA.Attack.NoDamageDealt")}</p>
            ${tamerIntercedeResolutionButton}
          `
      }
            ${bossInvincibleNegationNote}
            ${effectApplicationNote}
    </div>
  `;

  const damageAmountForApplication = tamerIntercedeMustResolve
    ? Math.max(1, gritDamageOnMiss
      ? 1
      : (
          (hit || smiteMissDamage) && attackDealsDamage && Number(finalDamage) > 0
            ? Number(finalDamage)
            : 0
        ))
    : gritDamageOnMiss
      ? 1
      : (
          (hit || smiteMissDamage) &&
          attackDealsDamage &&
          Number(finalDamage) > 0
            ? Number(finalDamage)
            : 0
        );

  const damageApplication = damageAmountForApplication > 0
    ? {
        applicationId: damageApplicationId,
        requestId: String(areaBatch?.id ?? ""),
        progressMessageId: String(areaBatch?.progressMessageId ?? ""),
        targetTokenId: String(targetToken?.id ?? ""),
        defenderUuid: String(defender.uuid ?? ""),
        attackerUuid: String(attacker.uuid ?? ""),
        attackItemUuid: String(attackItem.uuid ?? ""),
        attackItemId: String(attackItem.id ?? ""),
        bossDisarm: Boolean(
          hit && qualityAttackModifier.qualityTags.includes("disarm")
        ),
        bossSmite: Boolean(smiteMissDamage),
        bossMassDestruction: Boolean(
          attackOptions?.counterattackContext?.bossMassDestructionEligible
        ),
        counterattackUsesSpent: Math.max(
          0,
          Number(attackOptions?.counterattackContext?.bossCounterattackUsesSpent ?? 0)
        ),
        damage: damageAmountForApplication,
        damageType: "",
        damageLabel: "",
        holdBack: Boolean(attackOptions.holdBack),
        tamerIntercede: Boolean(
          intercedeDeclaration &&
          defender.type === "character"
        ),
        digimonIntercede: Boolean(
          (intercedeDeclaration && defender.type !== "character") ||
          areaBatch?.areaInterceded
        ),
        unalterable: false,
        unalterablePortion: tamerIntercedeMustResolve && Number(finalDamage) <= 0
          ? 0
          : Math.max(0, Number(unalterableDamage)),
        focusTempMultiplier: Number(
          qualityAttackModifier.focusTemporaryWoundMultiplier ?? 1
        ),
        lifestealCap: Number(
          qualityAttackModifier.lifestealHealingCap ?? 0
        ),
        lifestealKey: lifestealApplicationId,
        combatId: String(game?.combat?.started ? game.combat.id ?? "" : ""),
        sceneId: String(canvas?.scene?.id ?? game?.scenes?.current?.id ?? ""),
        createdAt: Date.now(),
        state: "pending",
        claimedByUserId: "",
        claimedAt: null,
        applied: false,
        appliedAt: null,
        appliedByUserId: "",
        areaReady: !Boolean(areaBatch?.active),
        lastError: ""
      }
    : null;

  const damageFlagKey = areaBatch?.active
    ? "areaAttackDamageEntry"
    : "attackDamageEntry";

  const attackResultMessage = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content,
    flags: damageApplication
      ? {
          [game.system.id]: {
            [damageFlagKey]: damageApplication
          }
        }
      : {}
  });

  if (damageApplication) {
    damageApplication.messageId = String(attackResultMessage?.id ?? "");

    try {
      await attackResultMessage?.update?.({
        [`flags.${game.system.id}.${damageFlagKey}`]:
          damageApplication
      });
    } catch (error) {
      console.warn(
        "DDA | Could not store the Attack damage entry.",
        error
      );
    }
  }

/*
 * A partir deste ponto o Ataque já foi completamente resolvido e publicado.
 * Ataques em Área adiam o pagamento único até todas as Esquivas individuais
 * terminarem. O controlador recebe esta closure e a executa exatamente uma vez.
 */
let attackUseFinalized = false;

const finalizeAttackUse = async ({ attackHit = hit } = {}) => {
  if (attackUseFinalized) return;
  attackUseFinalized = true;

  if (isFreeStanceAttack || attackOptions.skipAttackUseTracking) {
    // Free/replacement attacks do not consume Battery, Ammo, the one-Attack
    // limit, Actions or once-per-roll resources unless their parent flow says so.
  } else if (isAmmoAttack) {
    await markAmmoAttackUsedThisCombat(
      attacker,
      attackItem
    );
  } else {
    await markAttackUsed(
      attacker,
      isSignature,
      effectiveAttacksMade + 1,
      {
        attackItem,
        dataSpecializationMode: dataSpecializationAttackPermission.mode,
          suppressRoundCount: usesCounterattackWindow || usesPunishingStrikeWindow
      }
    );

    if (usesSpeedSurgeAttackWindow) {
      await consumeSpeedSurgeAttackWindow(
        attacker,
        speedSurgeAttackWindow.id
      );
    }

    if (usesHasteAttackWindow) {
      await consumeSpeedSurgeAttackWindow(
        attacker,
        hasteAttackWindow.id
      );
    }
  }

  if (!usesInterruptPayment && attackerActionCost > 0) {
    await attacker.update(
      {
        "system.combat.actions.value":
          Math.max(
            0,
            currentActions - attackerActionCost
          ),
        "system.combat.nonMovementActionsThisTurn":
          Math.max(
            0,
            Number(attacker.system?.combat?.nonMovementActionsThisTurn ?? 0)
          ) + attackerActionCost
      },
      {
        ddaChargeAttackAction:
          chargeCanCombineMovement &&
          !chargeMovementBeforeAttack
      }
    );
  }

  await resolveChargeMovementForAttack({
    attacker,
    chargeCanCombineMovement,
    chargeMovementBeforeAttack,
    chargeSignatureBatteryMoveBonus:
      qualityAttackModifier.chargeSignatureBatteryMoveBonus,
    suppressAfterMovement: Boolean(
      areaAttackDeclaration?.active &&
      normalizeAttackTag(areaAttackDeclaration?.tag) === "t:pass"
    )
  });

  if (!isFreeStanceAttack && hugePowerReroll?.qualityId) {
    await spendHugePowerUse(
      attacker,
      hugePowerReroll.qualityId
    );
  }

  if (attackHit && Number(qualityAttackModifier.combatMonsterResolveSpent ?? 0) > 0) {
    await setCombatMonsterResolve(attacker, 0);
  }
};

if (!areaBatch?.active && !hit && !dodgeResult?.suppressMissTriggers) {
  await maybeTriggerFierceSoulRepeat({
    attacker,
    attackItem,
    targetToken,
    hit,
    attackOptions
  });
}

if (!areaBatch?.active) {
  await finalizeAttackUse();
}

await resolveSharpDigizoidArmorRetaliation({
  attacker,
  defender,
  attackItem,
  hit
});

await recordBulletProofIncomingAttack(defender, attacker);

let appliedEffectResolution = { applied: [], denied: null };
if (effectApplication.applied.length) {
  appliedEffectResolution = await applyAttackEffectTags(
    defender,
    effectApplication.applied
  );

  if (appliedEffectResolution.denied) {
    effectApplication.deniedByDeny = appliedEffectResolution.denied;
  }

  if (appliedEffectResolution.applied.includes("shield")) {
    await consumeProtectingShieldUse({
      attacker,
      attackItem,
      executionId: effectExecutionId
    });
  }
}

if (!areaBatch?.active && appliedEffectResolution.applied.length) {
  await resolveInspiringGuidanceAfterAttack({
    attacker,
    attackItem,
    currentBattery,
    isArea: false,
    results: [{
      attacker,
      defender,
      attackItem,
      hit,
      effectApplication: {
        ...effectApplication,
        applied: effectApplication.applied.filter((effect) => {
          return appliedEffectResolution.applied.includes(getEffectTagKey(effect.tag));
        })
      }
    }]
  });
}

if (hit) {
  await breakGlamorOnAttackHit(defender, attackItem);
}

if (!areaBatch?.active && hit) {
  await resolveWardEmblemAfterAttack({ attacker, results: [{
    attacker,
    defender,
    attackItem,
    hit,
    activeEffectTags,
    effectApplication,
    finalDamage,
    normalDamage
  }] });
  if (String(attackFunctionType).toLowerCase() === "damage" && Number(qualityAttackModifier.braveHeartBonusUsed ?? 0) > 0) {
    await consumeBraveHeartDamageBonus(attacker);
  }

  await maybeOfferHeroicExemplarAfterHit({
    attacker,
    defender,
    hit
  });
}

await resolveOffensiveForcedMovement({
  attacker,
  defender,
  targetToken,
  qualityAttackModifier,
  attackOptions,
  hit,
  attackFunctionType,
  leftoverSuccesses
});

await applyThereIsNoEscapeMovementPenalty({
  attacker,
  defender,
  attackItem,
  attackOptions,
  hit,
  normalDamage
});

await clearHiddenAfterInterference(attacker);

if (
  intercedeDeclaration?.blastEvolution?.active &&
  !areaBatch?.active &&
  Number(damageAmountForApplication ?? 0) <= 0
) {
  try {
    const evolution = await import("../combat/evolution.js");
    await evolution.finishBlastIntercedeForPartner?.(defender);
  } catch (error) {
    console.error("DDA | Could not finish zero-damage Blast Intercede.", error);
  }
}

if (!qualityAttackModifier.sneakSuppressInterrupts && !attackOptions.suppressTargetInterrupts) {
  await maybeTriggerCounterattack({
    attacker,
    defender,
    attackItem,
    hit,
    attackOptions,
    intercedeDeclaration,
    finalDamage
  });
}

return {
  attacker,
  defender,
  attackItem,
  hit,
  accuracySuccesses,
  dodgeSuccesses,
  leftoverSuccesses,
  normalDamage,
  unalterableDamage,
  finalDamage,
  damageApplication,
  resultMessageId: String(attackResultMessage?.id ?? ""),
  totalActionCost,
  activeEffectTags,
  activeEffectTagLabels,
  effectApplication,
  appliedEffectResolution,
  signatureBatteryAtDeclaration: currentBattery,
  qualityAttackModifier,
  attributeAdvantage: attributeAdvantageData,
  clashContext,
accuracyRollResult: accuracyResult,
hugePowerReroll,
tamerAttackTalent: {
  signatureVersatilityUsed,
  autoHitUsed,
  distractingGestureResult
},
finalizeAttackUse: areaBatch?.active ? finalizeAttackUse : null,
declaredAttackQualityEffects,
postHitQualityEffects,
substituteResolution,
attackDivertedBySubstitute,
focusedResistance,
teleportEscape,
interruptPayment,
overpowerResult,

quickeningUsed:
  Boolean(
    dodgeResult.quickening
  ),

tuckAndRollUsed:
  Boolean(
    dodgeResult.tuckAndRoll
  ),

gritDefenseUsed:
  Boolean(
    dodgeResult.gritDefense
  ),

gritMinimumDamageApplied,
gritDamageOnMiss
};
}



async function maybeConvertResolveWithAssuredDestruction(attacker, defender, qualityAttackModifier, data) {
  const availableResolve = getCombatMonsterResolve(attacker);
  if (
    availableResolve <= 0 ||
    !hasQuality(attacker, "assuredDestruction") ||
    !defender ||
    areActorsAlliesForQualities(attacker, defender)
  ) return 0;

  const result = await convertResolveWithAssuredDestruction(attacker, {
    maximum: availableResolve
  });
  const converted = Math.max(0, Number(result?.converted ?? 0));
  if (converted <= 0) return 0;

  /*
   * O Resolve convertido é gasto imediatamente. Apenas o Resolve restante
   * continua disponível para virar Dano caso o Ataque acerte.
   */
  qualityAttackModifier.damageBonus -= converted;
  qualityAttackModifier.combatMonsterResolveSpent = Math.max(
    0,
    Number(result?.remaining ?? availableResolve - converted)
  );
  data.accuracyBonus += converted;
  data.notes.push(localizeQ(
    "DDA.QualityAutomation.AssuredDestruction.Converted",
    "Assured Destruction converted {value} Resolve into Accuracy dice.",
    { value: converted }
  ));

  return converted;
}

async function maybeTriggerSavageryOnAttackDeclare(attacker, data) {
  const result = await triggerSavagery(attacker, {
    notes: data.notes
  });

  if (result?.insufficientWounds) {
    data.notes.push(combatText(
      "Selvageria não pôde ser ativada: o custo reduziria o Digimon a 0 Caixas de Ferimento.",
      "Savagery could not be triggered: its cost would reduce the Digimon to 0 Wound Boxes."
    ));
  }

  return result;
}

async function getDeclaredAttackQualityEffects({ attacker, defender, attackItem, qualityAttackModifier, totalActionCost, unreducedDeclaredActionCost = totalActionCost, isSignature, areaAttackDeclaration, areaBatch = null, attackOptions = {} } = {}) {
  const data = {
    accuracyBonus: 0,
    halveDodge: false,
    halveDamageOnHit: false,
    effectDurationPenalty: 0,
    elementalForceUsed: null,
    assuredDestructionConverted: 0,
    notes: []
  };

  const isAreaSecondary = Boolean(areaBatch?.active && areaBatch?.secondary);

  if (!isAreaSecondary) {
    await maybeTriggerSavageryOnAttackDeclare(attacker, data);
    data.assuredDestructionConverted = await maybeConvertResolveWithAssuredDestruction(
      attacker,
      defender,
      qualityAttackModifier,
      data
    );
  } else {
    const converted = Math.max(
      0,
      Number(areaBatch?.sharedAssuredDestructionConverted ?? 0)
    );

    if (converted > 0) {
      /* O modificador secundário já lê apenas o Resolve restante. */
      data.accuracyBonus += converted;
      data.assuredDestructionConverted = converted;
      data.notes.push(localizeQ(
        "DDA.QualityAutomation.AssuredDestruction.Converted",
        "Assured Destruction converted {value} Resolve into Accuracy dice.",
        { value: converted }
      ));
    }
  }

  if (qualityAttackModifier?.elementalForce) {
    const ef =
      qualityAttackModifier.elementalForce;

    const hasNaturalWeakness =
      actorHasNaturalWeaknessElement(
        defender,
        ef.element
      );

    const elementalDamageBonus = Number(
      ef.damageBonus ?? 0
    ) * (
      hasNaturalWeakness
        ? 2
        : 1
    );

    const hasSharedElementalChoice =
      isAreaSecondary &&
      areaBatch?.sharedElementalForceUsed !== null &&
      areaBatch?.sharedElementalForceUsed !== undefined;

    const useElement = hasSharedElementalChoice
      ? Boolean(areaBatch.sharedElementalForceUsed)
      : await promptUseQuality(
          ef.quality,
          {
            body: localizeQ(
              "DDA.QualityAutomation.ElementalForce.Prompt",
              "Trigger {quality} for +{bonus} Damage?",
              {
                quality: ef.quality.name,
                bonus: elementalDamageBonus
              }
            ),

            defaultYes: false
          }
        );

    data.elementalForceUsed = Boolean(useElement);

    if (useElement) {
      if (
        hasQuality(
          defender,
          "elementMaster"
        ) &&
        actorHasNaturewalkElement(
          defender,
          ef.element
        )
      ) {
        data.preventAttack = true;

        data.notes.push(
          localizeQ(
            "DDA.QualityAutomation.ElementalForce.Negated",
            "Element Master negates this triggered Elemental Force attack."
          )
        );
      } else if (
        actorHasNaturewalkElement(
          defender,
          ef.element
        )
      ) {
        data.notes.push(
          localizeQ(
            "DDA.QualityAutomation.ElementalForce.SharedElement",
            "Target shares the Element, so Elemental Force grants no bonus damage."
          )
        );
      } else {
        qualityAttackModifier.damageBonus +=
          elementalDamageBonus;

        if (hasNaturalWeakness) {
          data.notes.push(
            localizeQ(
              "DDA.QualityAutomation.NaturalWeakness.Triggered",
              "Natural Weakness doubled the Elemental Force bonus to +{bonus} Damage.",
              {
                bonus: elementalDamageBonus
              }
            )
          );
        } else {
          data.notes.push(
            localizeQ(
              "DDA.QualityAutomation.ElementalForce.Triggered",
              "Elemental Force triggered: +{bonus} Damage.",
              {
                bonus: elementalDamageBonus
              }
            )
          );
        }
      }
    }
  }

  if (
    qualityAttackModifier?.preciseFocus &&
    !areaAttackDeclaration?.active &&
    Number(unreducedDeclaredActionCost ?? totalActionCost ?? 0) >= 2
  ) {
    const focusQuality = getQualityForAttackModifier(attacker, "preciseFocus");
    const tn = 12 + getActorDerivedStat(defender, "ram");
    const check = await rollDerivedCheck(attacker, "ram", {
      skillKey: "precision",
      tn,
      title: localizeQ("DDA.QualityAutomation.PreciseFocus.Check", "Precise Focus"),
      targetActor: defender
    });
    if (!check) return null;

    let bonus = 0;
    if (check.criticalSuccess) bonus = 5;
    else if (check.success) bonus = 3;
    else if (!check.criticalFailure) bonus = 1;
    data.accuracyBonus += bonus;
    data.notes.push(localizeQ("DDA.QualityAutomation.PreciseFocus.Result", "Precise Focus: {bonus} Accuracy from the RAM (Precision) Check.", { bonus: bonus >= 0 ? `+${bonus}` : bonus }));
  }

  const areaQualityAppliesToThisTarget = !areaAttackDeclaration?.active || Boolean(areaBatch?.isClosestAreaTarget);

  if (
    qualityAttackModifier?.feintAttack &&
    areaQualityAppliesToThisTarget &&
    !isClashAttackContext(attackOptions?.clashContext ?? {}) &&
    !attackOptions?.counterattackContext?.active
  ) {
    const feintQuality = getQualityForAttackModifier(attacker, "feintAttack");
    const useFeint = await promptUseQuality(feintQuality, {
      body: localizeQ("DDA.QualityAutomation.FeintAttack.Prompt", "Trigger Feint Attack against this target?"),
      defaultYes: false
    });
    if (useFeint) {
      const tn = 10 + getActorDerivedStat(defender, "bit");
      const check = await rollDerivedCheck(attacker, "bit", {
        skillKey: "manipulate",
        tn,
        title: localizeQ("DDA.QualityAutomation.FeintAttack.Check", "Feint Attack"),
        targetActor: defender
      });
      if (!check) return null;
      if (check.criticalFailure) {
        data.halveDamageOnHit = true;
        data.notes.push(localizeQ("DDA.QualityAutomation.FeintAttack.CritFail", "Feint Attack critically failed: damage is halved if the attack hits."));
      } else if (check.success) {
        data.halveDodge = true;
        data.halveDamageOnHit = !check.criticalSuccess;
        if (String(attackItem?.system?.baseTags?.functionType ?? "") === "support") {
          data.effectDurationPenalty = 1;
        }
        data.notes.push(check.criticalSuccess
          ? localizeQ("DDA.QualityAutomation.FeintAttack.CritSuccess", "Feint Attack critically succeeded: target Dodge is halved and damage is not halved.")
          : localizeQ("DDA.QualityAutomation.FeintAttack.Success", "Feint Attack succeeded: target Dodge is halved, but damage is halved after Armor."));
      }
      await increaseEscalatingTn(attacker, feintQuality, "feintAttack", isSignature ? 0 : 3);
    }
  }

  return data;
}

function buildOffensiveQualityEffect({
  tag,
  attacker,
  defender,
  attackItem,
  sourceName = "",
  potency = 0,
  duration = "special"
} = {}) {
  const hasNumericDuration = Number.isFinite(Number(duration));
  return {
    id: foundry.utils.randomID(),
    tag,
    label: sourceName || getEffectTagLabel(tag),
    sourceAttackId: attackItem?.id ?? "",
    sourceAttackName: attackItem?.name ?? sourceName,
    sourceActorUuid: attacker?.uuid ?? "",
    sourceActorName: attacker?.name ?? "",
    targetActorUuid: defender?.uuid ?? "",
    targetActorName: defender?.name ?? "",
    appliedCombatId: game.combat?.id ?? "",
    appliedCombatRound: Number(game.combat?.round ?? 0),
    appliedCombatTurn: Number(game.combat?.turn ?? -1),
    effectType: tag === "poison" ? "damage" : "unique",
    potency: Math.max(0, Number(potency ?? 0)),
    value: Math.max(0, Number(potency ?? 0)),
    durationRule: hasNumericDuration ? true : duration,
    hasDuration: hasNumericDuration,
    hasSpecialDuration: !hasNumericDuration,
    duration: hasNumericDuration ? Math.max(0, Number(duration)) : 0,
    remaining: hasNumericDuration ? Math.max(0, Number(duration)) : 0,
    maxDuration: hasNumericDuration ? Math.max(0, Number(duration)) : 0
  };
}

async function getPostHitQualityEffects({ attacker, defender, attackItem, qualityAttackModifier, hit, attackDealsDamage, attackFunctionType, normalDamage, areaAttackDeclaration, areaBatch = null } = {}) {
  const data = {
    damageBonus: 0,
    damageReduction: 0,
    minimumNormalDamage: 0,
    preventNormalDamage: false,
    extraEffects: [],
    notes: []
  };
  if (!hit || !attackDealsDamage) return data;

  applyDigizoidPostHitRules(data, {
    attacker,
    defender,
    attackItem,
    qualityAttackModifier,
    attackFunctionType
  });

  const areaQualityAppliesToThisTarget = !areaAttackDeclaration?.active || Boolean(areaBatch?.isClosestAreaTarget);

  if (
    qualityAttackModifier?.mightyBlow &&
    areaQualityAppliesToThisTarget &&
    attackFunctionType === "damage" &&
    Number(normalDamage ?? 0) >= 2
  ) {
    const mightyQuality = getQualityForAttackModifier(attacker, "mightyBlow");
    const useMighty = await promptUseQuality(mightyQuality, {
      body: localizeQ("DDA.QualityAutomation.MightyBlow.Prompt", "Trigger Mighty Blow to try to inflict [STUN]?"),
      defaultYes: false
    });
    if (useMighty) {
      const exploitablePenalty = hasQuality(defender, "exploitableProgram") && !areActorsAlliesForQualities(attacker, defender) ? 3 : 0;
      const tn = Math.max(0, 10 + getActorDerivedStat(defender, "cpu") + getEscalatingTn(attacker, mightyQuality, "mightyBlow") - exploitablePenalty);
      const check = await rollDerivedCheck(attacker, "cpu", {
        skillKey: "featsOfStrength",
        tn,
        title: localizeQ("DDA.QualityAutomation.MightyBlow.Check", "Mighty Blow"),
        targetActor: defender
      });
      if (!check) return null;
      if (check.criticalFailure) {
        data.damageReduction += 1;
        data.notes.push(localizeQ("DDA.QualityAutomation.MightyBlow.CritFail", "Mighty Blow critically failed: -1 Damage."));
      } else if (check.criticalSuccess) {
        data.damageBonus += 2;
        data.extraEffects.push(buildOffensiveQualityEffect({
          tag: "stun",
          attacker,
          defender,
          attackItem,
          sourceName: mightyQuality?.name ?? "Mighty Blow"
        }));
        data.notes.push(localizeQ("DDA.QualityAutomation.MightyBlow.CritSuccess", "Mighty Blow critically succeeded: [STUN] applies and +2 Damage."));
      } else if (check.success) {
        data.extraEffects.push(buildOffensiveQualityEffect({
          tag: "stun",
          attacker,
          defender,
          attackItem,
          sourceName: mightyQuality?.name ?? "Mighty Blow"
        }));
        data.notes.push(localizeQ("DDA.QualityAutomation.MightyBlow.Success", "Mighty Blow succeeded: [STUN] applies."));
      }
      await increaseEscalatingTn(attacker, mightyQuality, "mightyBlow", 3);
    }
  }

  if (
    qualityAttackModifier?.venomous &&
    !areaAttackDeclaration?.active &&
    attackFunctionType === "damage"
  ) {
    const venomQuality = getQualityForAttackModifier(attacker, "venomous");
    const tn = 10 + getActorDerivedStat(defender, "ram");
    const check = await rollDerivedCheck(attacker, "bit", {
      skillKey: "survival",
      tn,
      title: venomQuality?.name ?? localizeQ("DDA.QualityAutomation.Venomous.Name", "Venomous"),
        targetActor: defender
    });

    if (!check) return null;

    if (check.criticalFailure) {
      data.damageReduction += 1;
      data.minimumNormalDamage = Math.max(data.minimumNormalDamage, 1);
      data.notes.push(combatText(
        "Venenoso falhou criticamente: -1 Dano, mínimo 1.",
        "Venomous critically failed: -1 Damage, minimum 1."
      ));
    } else if (check.success) {
      const batteryBonus = attackItem?.system?.isSignature
        ? Math.max(0, Number(attacker.system?.resources?.battery?.value ?? 0))
        : 0;
      const existingPoison = (defender.system?.effects?.active ?? []).find((effect) => {
        return getEffectTagKey(effect?.tag) === "poison";
      });
      const existingPotency = Math.max(
        0,
        Number(existingPoison?.potency ?? existingPoison?.value ?? 0)
      );
      const potency = (existingPoison ? existingPotency : 0) +
        1 +
        (check.criticalSuccess ? 1 : 0) +
        batteryBonus;
      data.extraEffects.push(buildOffensiveQualityEffect({
        tag: "poison",
        attacker,
        defender,
        attackItem,
        sourceName: venomQuality?.name ?? "Venomous",
        potency,
        duration: 1
      }));
      data.notes.push(combatText(
        `Venenoso aplicou [POISON ${potency}] por 1 Rodada.`,
        `Venomous applied [POISON ${potency}] for 1 Round.`
      ));
    }
  }

  if (qualityAttackModifier?.lifesteal) {
    data.notes.push(localizeQ("DDA.QualityAutomation.Lifesteal.Pending", "[DRAIN] healing will be applied to the attacker when the attack card resolves."));
  }

  return data;
}

async function getAreaAttackDeclaration(attacker, attackItem, qualityAttackModifier, attackOptions = {}) {
  const areaTags = Array.from(new Set([
    ...(Array.isArray(qualityAttackModifier?.areaAttackTags)
      ? qualityAttackModifier.areaAttackTags
      : []),
    ...getDirectAreaAttackTags(attackItem)
  ]));

  if (!areaTags.length) {
    return { active: false };
  }

  if (attackOptions.areaAttackActive === false) {
    return { active: false };
  }

  const selectedTag = String(
    attackOptions.areaAttackTag ??
    areaTags[0] ??
    ""
  ).trim();

  const label = selectedTag
    ? `[${selectedTag.toUpperCase()}] Area Attack`
    : "Area Attack";

  if (attackOptions.areaAttackActive === true) {
    return {
      active: true,
      tag: selectedTag,
      label: attackOptions.areaAttackLabel ?? label,
      size: Number(attackOptions.areaAttackSize ?? 0),
      targetMode: String(attackOptions.areaAttackTargetMode ?? "")
    };
  }

  const useArea = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Area Attack" },

    content: `
      <div class="dda-confirm-dialog">
        <p><strong>${attackItem.name}</strong> has an Area Attack tag.</p>
        <p>Use ${label} for this attack?</p>
        <p><small>Damage Area Attacks halve damage after Armor, rounded up.</small></p>
      </div>
    `,

    no: { default: true },
    rejectClose: false,
    modal: true
    });

  if (!useArea) {
    return { active: false };
  }

  return {
    active: true,
    tag: selectedTag,
    label
  };
}

async function resolveChargeMovementForAttack({
  attacker,
  chargeCanCombineMovement = false,
  chargeMovementBeforeAttack = false,
  chargeSignatureBatteryMoveBonus = 0,
  suppressAfterMovement = false
} = {}) {
  if (!chargeCanCombineMovement) return false;

  const tracker = game.dda?.movementTracker;
  if (!tracker) return false;

  if (chargeMovementBeforeAttack) {
    return Boolean(
      await tracker.completeChargeMovementBeforeAttack?.(attacker)
    );
  }

  if (suppressAfterMovement || tracker.hasActiveMovementSession?.(attacker)) {
    return false;
  }

  const maximum = Math.max(
    0,
    Number(
      tracker.getChargeMovementCapacity?.(
        attacker,
        chargeSignatureBatteryMoveBonus,
        1
      ) ?? 0
    )
  );

  if (maximum <= 0) return false;

  let useMovement = false;
  try {
    useMovement = Boolean(
      await foundry.applications.api.DialogV2.confirm({
          classes: ["dda", "dda-area-attack-dialog", "dda-offensive-quality-window"],
        window: {
          title: combatText("Movimento após [CHARGE]", "Post-[CHARGE] Movement")
        },
        content: `<div class="dda-confirm-dialog dda-offensive-quality-dialog"><p>${combatText(
          `Mover até ${maximum} Espaços em linha reta após o Ataque? A Ação já foi paga pelo [CHARGE].`,
          `Move up to ${maximum} Spaces in a straight line after the Attack? The Action was already paid by [CHARGE].`
        )}</p></div>`,
        yes: { label: combatText("Mover", "Move") },
        no: { label: combatText("Encerrar", "Finish") },
        rejectClose: false,
        modal: true
      })
    );
  } catch (_error) {
    useMovement = false;
  }

  if (!useMovement) return false;

  return Boolean(await tracker.grantMovement?.(attacker, maximum, {
    kind: "charge-post",
    source: "charge",
    actionCost: 0,
    requireStraightLine: true,
    label: combatText("Movimento após [CHARGE]", "Post-[CHARGE] Movement")
  }));
}

function isTokenVisibleToCurrentUser(token, observerActor = null) {
  if (observerActor) return isTokenVisibleToBossObserver(observerActor, token);
  if (!token) return false;
  if (token.document?.hidden) return false;
  if (game.user?.isGM) return true;
  return token.isVisible !== false && token.visible !== false;
}

async function promptChargeApproachDeclaration({
  attacker,
  attackItem,
  distance,
  reach,
  baseMovement,
  sprintMovement,
  sprintQuality,
  sprintRequired
} = {}) {
  const sprintControl = sprintQuality
    ? `
      <label class="dda-tamer-action-check">
        <input
          type="checkbox"
          name="useSprint"
          ${sprintRequired ? "checked disabled" : ""}
        />
        <span>
          <strong>${escapeHtml(sprintQuality.name)}</strong> —
          ${combatText(
            `aumentar o Movimento disponível para ${sprintMovement}.`,
            `increase available Movement to ${sprintMovement}.`
          )}
          ${
            sprintRequired
              ? `<em>${combatText("Necessário para alcançar o alvo.", "Required to reach the target.")}</em>`
              : ""
          }
        </span>
      </label>
    `
    : "";

  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-charge-approach-window"],
    window: {
      title: combatText("Aproximação com [CHARGE]", "[CHARGE] Approach")
    },
    content: `
      <div class="dda-roll-dialog dda-charge-approach-dialog">
        <p>
          <strong>${escapeHtml(attacker.name)}</strong>
          ${combatText(
            `está a ${distance} Espaços do alvo, e ${escapeHtml(attackItem.name)} alcança ${reach}.`,
            `is ${distance} Spaces from the target, and ${escapeHtml(attackItem.name)} reaches ${reach}.`
          )}
        </p>
        <p>
          ${combatText(
            `O [CHARGE] permite mover até ${baseMovement} Espaços em linha reta antes do ataque, usando uma única Ação para o conjunto.`,
            `[CHARGE] allows up to ${baseMovement} Spaces of straight-line Movement before the attack, using one Action for both.`
          )}
        </p>
        ${sprintControl}
      </div>
    `,
    buttons: [
      {
        action: "charge",
        label: combatText("Usar [CHARGE]", "Use [CHARGE]"),
        default: true,
        callback: (_event, button) => ({
          useCharge: true,
          useSprint: Boolean(
            sprintQuality &&
            (
              sprintRequired ||
              button.form?.elements?.useSprint?.checked
            )
          )
        })
      },
      {
        action: "cancel",
        label: combatText("Cancelar", "Cancel"),
        callback: () => ({ useCharge: false, useSprint: false })
      }
    ],
    rejectClose: false,
    modal: true
  });

  return result ?? { useCharge: false, useSprint: false };
}

async function maybeBeginChargeApproach({
  attacker,
  attackerToken,
  targetToken,
  attackItem,
  attackOptions = {},
  attackTargeting = {},
  qualityAttackModifier = {},
  declaredActionCost = 1
} = {}) {
  const tracker = game.dda?.movementTracker;
  const isEligible = Boolean(
    tracker &&
    attackTargeting.reason === "melee-out-of-reach" &&
    qualityAttackModifier.chargeMoveWithAttack &&
    Number(declaredActionCost) === 1 &&
    !attackOptions.isInterrupt &&
    !attackOptions.allowOutOfTurn &&
    !attackOptions.clashContext?.isInterrupt &&
    !attackOptions.chargeApproachCommit
  );

  if (!isEligible) return { handled: false };

  if (!isTokenVisibleToCurrentUser(targetToken, attacker)) {
    ui.notifications.warn(combatText(
      "Você precisa enxergar o alvo para iniciar uma aproximação com [CHARGE].",
      "You must be able to see the target to begin a [CHARGE] approach."
    ));
    return { handled: true, started: false, reason: "target-not-visible" };
  }

  if (tracker.hasActiveMovementSession?.(attacker)) {
    ui.notifications.warn(combatText(
      "Encerre ou cancele o Movimento atual antes de iniciar a aproximação com [CHARGE].",
      "Finish or cancel the current Movement before beginning a [CHARGE] approach."
    ));
    return { handled: true, started: false, reason: "movement-active" };
  }

  const currentActions = Math.max(
    0,
    Number(attacker.system?.combat?.actions?.value ?? 0)
  );

  if (currentActions < 1) {
    ui.notifications.warn(combatText(
      "Esse Digimon não possui uma Ação disponível para usar [CHARGE].",
      "This Digimon does not have an Action available for [CHARGE]."
    ));
    return { handled: true, started: false, reason: "not-enough-actions" };
  }

  const bonusSpaces = Math.max(
    0,
    Number(qualityAttackModifier.chargeSignatureBatteryMoveBonus ?? 0)
  );
  const baseMovement = Math.max(
    0,
    Number(tracker.getChargeMovementCapacity?.(attacker, bonusSpaces, 1) ?? 0)
  );
  const sprintQuality = findQuality(attacker, [
    "arrancada",
    "sprint",
    "disparada"
  ]);
  const sprintAvailable = Boolean(
    sprintQuality && canSpendQuality(sprintQuality)
  );
  const sprintMovement = sprintAvailable
    ? Math.max(
        baseMovement,
        Number(tracker.getChargeMovementCapacity?.(attacker, bonusSpaces, 2) ?? 0)
      )
    : baseMovement;
  const distance = Math.max(0, Number(attackTargeting.distance ?? 0));
  const reach = Math.max(1, Number(attackTargeting.reach ?? 1));
  const requiredMovement = Math.max(0, distance - reach);

  if (requiredMovement > sprintMovement) {
    ui.notifications.warn(combatText(
      `Mesmo com [CHARGE], o alvo está longe demais: são necessários ${requiredMovement} Espaços de Movimento, mas apenas ${sprintMovement} estão disponíveis.`,
      `Even with [CHARGE], the target is too far away: ${requiredMovement} Spaces of Movement are required, but only ${sprintMovement} are available.`
    ));
    return { handled: true, started: false, reason: "beyond-charge" };
  }

  const sprintRequired = requiredMovement > baseMovement;
  const declaration = await promptChargeApproachDeclaration({
    attacker,
    attackItem,
    distance,
    reach,
    baseMovement,
    sprintMovement,
    sprintQuality: sprintAvailable ? sprintQuality : null,
    sprintRequired
  });

  if (!declaration?.useCharge) {
    return { handled: true, started: false, reason: "cancelled" };
  }

  const maximum = declaration.useSprint
    ? sprintMovement
    : baseMovement;
  const started = await tracker.beginChargeApproach?.(attacker, {
    maximum,
    attackItemUuid: attackItem.uuid,
    targetTokenId: targetToken.id,
    targetSceneId: canvas.scene?.id,
    attackReach: reach,
    sprintQualityId: declaration.useSprint ? sprintQuality?.id : "",
    initialTargetDistance: distance
  });

  if (!started) {
    return { handled: true, started: false, reason: "tracker-rejected" };
  }

  if (declaration.useSprint && sprintQuality) {
    await spendAutomationQualityUse(attacker, sprintQuality);
  }

  attackerToken?.control?.({ releaseOthers: true });

  ui.notifications.info(combatText(
    "Mova o token em linha reta até entrar no alcance. Depois use o botão de [CHARGE] no HUD do token ou clique no ataque novamente.",
    "Move the token in a straight line until it is in reach. Then use the [CHARGE] button in the Token HUD or click the attack again."
  ));

  return { handled: true, started: true };
}


async function getHugePowerRerollDeclaration(attacker, attackOptions = {}) {
  if (attackOptions.hugePower === false || attackOptions.hugePowerReroll === false) {
    return {};
  }

  const quality = attacker?.items?.find((item) => {
    if (item.type !== "quality") return false;

    const sourceId = normalizeQualityChoiceKeyForAttack(
      item.system?.sourceId ??
      item.system?.id ??
      item.name
    );

    const nameKey = normalizeQualityChoiceKeyForAttack(item.name);
    const originalNameKey = normalizeQualityChoiceKeyForAttack(item.system?.originalName ?? "");

    return (
      sourceId === "poderbrutal" ||
      sourceId === "hugepower" ||
      nameKey === "poderbrutal" ||
      nameKey === "hugepower" ||
      originalNameKey === "hugepower"
    );
  });

  if (!quality) {
    return {};
  }

  if (hasQuality(attacker, "underwhelming") && getAttackQualityTags(attackOptions.attackItem).has("certain")) {
    return {};
  }

  const usesEnabled = Boolean(quality.system?.uses?.enabled);
  const remainingUses = Number(quality.system?.uses?.value ?? 0);

  if (usesEnabled && remainingUses <= 0) {
    return {};
  }

  const combatId = game.combat?.id ?? "";
  const combatRound = Number(game.combat?.round ?? 0);

  const actorUseEntry = attacker.system?.combat?.qualityAttackUses?.hugePower?.[quality.id];

  const alreadyUsedThisRound =
    combatId &&
    actorUseEntry &&
    String(actorUseEntry.combatId ?? "") === combatId &&
    Number(actorUseEntry.round ?? -1) === combatRound;

  if (alreadyUsedThisRound) {
    return {};
  }

  const rankValue = getAppliedAttackQualityRankValue(quality);
  const rerollResultsUpTo = Math.min(2, Math.max(1, rankValue));

  const useHugePower = await foundry.applications.api.DialogV2.confirm({
    window: { title: quality.name },

    content: `
      <div class="dda-confirm-dialog">
        <p>Use <strong>${quality.name}</strong> on this Accuracy roll?</p>
        <p>Reroll dice results up to <strong>${rerollResultsUpTo}</strong>.</p>
        ${
          usesEnabled
            ? `<p><small>Uses remaining: ${remainingUses}/${Number(quality.system?.uses?.max ?? remainingUses)}</small></p>`
            : ""
        }
      </div>
    `,

    no: { default: true },
    rejectClose: false,
    modal: true
    });

  if (!useHugePower) {
    return {};
  }

  return {
    qualityId: quality.id,
    rerollResultsUpTo,
    label: quality.name
  };
}

async function spendQualityUse(actor, qualityId) {
  const quality = actor?.items?.get?.(qualityId);

  if (!actor || !quality) return;

  const uses = quality.system?.uses ?? {};
  const qualityUpdates = {};

  if (uses.enabled) {
    const currentValue = Number(uses.value ?? uses.max ?? 0);
    const currentSpent = Number(uses.spent ?? 0);

    qualityUpdates["system.uses.value"] = Math.max(0, currentValue - 1);
    qualityUpdates["system.uses.spent"] = currentSpent + 1;
    qualityUpdates["system.uses.lastUsedCombatId"] = game.combat?.id ?? "";
    qualityUpdates["system.uses.lastUsedRound"] = Number(game.combat?.round ?? 0);
    qualityUpdates["system.uses.lastUsedTurn"] = Number(game.combat?.turn ?? -1);
  }

  if (Object.keys(qualityUpdates).length > 0) {
    await quality.update(qualityUpdates);
  }

  const qualityAttackUses = foundry.utils.deepClone(actor.system?.combat?.qualityAttackUses ?? {});
  qualityAttackUses.hugePower ??= {};
  qualityAttackUses.hugePower[qualityId] = {
    used: true,
    combatId: game.combat?.id ?? "",
    round: Number(game.combat?.round ?? 0),
    turn: Number(game.combat?.turn ?? -1)
  };

  await actor.update({
    "system.combat.qualityAttackUses": qualityAttackUses
  });
}

function getTokenGridDistance(tokenA, tokenB) {
  const gridSize = Number(canvas?.grid?.size ?? 100) || 100;

  const getBounds = (token) => {
    const document = token?.document ?? token ?? {};
    const x = Math.round(Number(document.x ?? 0) / gridSize);
    const y = Math.round(Number(document.y ?? 0) / gridSize);
    const width = Math.max(1, Math.round(Number(document.width ?? 1)));
    const height = Math.max(1, Math.round(Number(document.height ?? 1)));

    return {
      left: x,
      right: x + width - 1,
      top: y,
      bottom: y + height - 1
    };
  };

  const a = getBounds(tokenA);
  const b = getBounds(tokenB);

  const gapX = a.right < b.left
    ? b.left - a.right
    : b.right < a.left
      ? a.left - b.right
      : 0;

  const gapY = a.bottom < b.top
    ? b.top - a.bottom
    : b.bottom < a.top
      ? a.top - b.bottom
      : 0;

  return Math.max(gapX, gapY);
}

async function spendHugePowerUse(actor, qualityId) {
  const quality = actor?.items?.get?.(qualityId);

  if (!actor || !quality) return;

  const uses = quality.system?.uses ?? {};

  const currentValue = Number(uses.value ?? uses.max ?? 0);
  const currentSpent = Number(uses.spent ?? 0);

  const nextValue = Math.max(0, currentValue - 1);
  const nextSpent = currentSpent + 1;

  await actor.updateEmbeddedDocuments("Item", [{
    _id: qualityId,
    "system.uses.value": nextValue,
    "system.uses.spent": nextSpent,
    "system.uses.lastUsedCombatId": game.combat?.id ?? "",
    "system.uses.lastUsedRound": Number(game.combat?.round ?? 0),
    "system.uses.lastUsedTurn": Number(game.combat?.turn ?? -1)
  }]);

  const qualityAttackUses = foundry.utils.deepClone(actor.system?.combat?.qualityAttackUses ?? {});
  qualityAttackUses.hugePower ??= {};
  qualityAttackUses.hugePower[qualityId] = {
    used: true,
    combatId: game.combat?.id ?? "",
    round: Number(game.combat?.round ?? 0),
    turn: Number(game.combat?.turn ?? -1)
  };

  await actor.update({
    "system.combat.qualityAttackUses": qualityAttackUses
  });
}

function getOfficialTamerTalentUseValue(
  tamer,
  talentId,
  maximum = 1
) {
  return Math.max(
    0,
    Number(
      tamer?.system
        ?.tamerTalentUses
        ?.[talentId]
        ?.value ?? maximum
    )
  );
}

function canCurrentUserControlActor(actor) {
  return Boolean(
    actor &&
    (
      game.user?.isGM ||
      actor.isOwner
    )
  );
}

async function spendTamerTalentActionAndUse(
  tamer,
  talentId,
  {
    actionCost = 1,
    maximum = 1,
    recharge = "rest"
  } = {}
) {
  const cost = Math.max(
    0,
    Math.floor(
      Number(actionCost ?? 0)
    )
  );

  const currentActions = Math.max(
    0,
    Number(
      tamer?.system?.combat
        ?.actions?.value ?? 0
    )
  );

  const currentUses =
    getOfficialTamerTalentUseValue(
      tamer,
      talentId,
      maximum
    );

  if (
    !tamer ||
    currentActions < cost ||
    currentUses < 1
  ) {
    return null;
  }

  await tamer.update({
    "system.combat.actions.value":
      currentActions - cost,

    "system.combat.nonMovementActionsThisTurn":
      Math.max(
        0,
        Number(tamer.system?.combat?.nonMovementActionsThisTurn ?? 0)
      ) + cost,

    [`system.tamerTalentUses.${talentId}.value`]:
      currentUses - 1,

    [`system.tamerTalentUses.${talentId}.max`]:
      maximum,

    [`system.tamerTalentUses.${talentId}.recharge`]:
      recharge
  });

  return {
    tamer,
    talentId,

    actionCost:
      cost,

    actionsBefore:
      currentActions,

    actionsAfter:
      currentActions - cost,

    usesBefore:
      currentUses,

    usesAfter:
      currentUses - 1,

    recharge
  };
}

function getUncountedAccuracyFourCount(
  accuracyResult
) {
  const adjustedResults = Array.isArray(
    accuracyResult?.adjustedDiceResults
  )
    ? accuracyResult.adjustedDiceResults
    : [];

  /*
   * Usa o resultado bruto depois de eventuais
   * rerrolagens. Um 4 que já virou Sucesso por
   * algum modificador não deve ser contado duas
   * vezes por Weapon ou Overpower.
   */
  if (adjustedResults.length) {
    return adjustedResults.filter(
      (result) => {
        return (
          Number(result?.raw ?? 0) === 4 &&
          !Boolean(result?.success)
        );
      }
    ).length;
  }

  const resultModifier = Number(
    accuracyResult?.resultModifier ?? 0
  );

  let count = 0;

  for (
    const die of
    accuracyResult?.roll?.dice ?? []
  ) {
    for (const result of die.results ?? []) {
      if (result.active === false) {
        continue;
      }

      const value = Number(
        result.result ??
        result.value ??
        0
      );

      if (
        value === 4 &&
        value + resultModifier < 5
      ) {
        count += 1;
      }
    }
  }

  return count;
}

async function getOverpowerDeclaration(
  attacker,
  accuracyResult,
  {
    attackName = "",
    isInterruptAttack = false,
    alreadyCountedFours = 0
  } = {}
) {
  const tamer =
    await resolveLinkedTamerForPartner(
      attacker
    );

  if (
    !tamer ||
    !canCurrentUserControlActor(tamer) ||
    !hasUnlockedOfficialTamerTalent(
      tamer,
      "overpower"
    )
  ) {
    return null;
  }

  const totalFours =
    getUncountedAccuracyFourCount(
      accuracyResult
    );

  /*
   * Weapon pode já transformar alguns dos mesmos
   * resultados 4 em Sucessos. Overpower transforma
   * somente os restantes, evitando contagem dupla.
   */
  const availableFours = Math.max(
    0,

    totalFours -
    Math.max(
      0,
      Number(
        alreadyCountedFours ?? 0
      )
    )
  );

  if (availableFours <= 0) {
    return null;
  }

  const currentActions = Math.max(
    0,
    Number(
      tamer.system?.combat
        ?.actions?.value ?? 0
    )
  );

  const currentUses =
    getOfficialTamerTalentUseValue(
      tamer,
      "overpower",
      1
    );

  if (
    currentActions < 1 ||
    currentUses < 1
  ) {
    return null;
  }

  const useOverpower =
    await foundry.applications.api.DialogV2.confirm({
      window: { title: localize(
        "DDA.TamerTalent.Overpower.Title"
      ) },

      content: `
        <div class="dda-confirm-dialog dda-overpower-dialog">
          <p>
            ${formatI18n(
              "DDA.TamerTalent.Overpower.Prompt",
              {
                tamer:
                  tamer.name,

                partner:
                  attacker.name,

                attack:
                  attackName,

                amount:
                  availableFours
              }
            )}
          </p>

          <p>
            ${
              isInterruptAttack
                ? localize(
                    "DDA.TamerTalent.Overpower.InterruptTiming"
                  )
                : localize(
                    "DDA.TamerTalent.Overpower.NormalTiming"
                  )
            }
          </p>

          <p>
            ${formatI18n(
              "DDA.TamerTalent.Overpower.CostSummary",
              {
                actions:
                  currentActions,

                uses:
                  currentUses
              }
            )}
          </p>
        </div>
      `,

      no: { default: true },
      rejectClose: false,
      modal: true
      });

  if (!useOverpower) {
    return null;
  }

  const payment =
    await spendTamerTalentActionAndUse(
      tamer,
      "overpower",
      {
        actionCost: 1,
        maximum: 1,
        recharge: "rest"
      }
    );

  if (!payment) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.Overpower.PaymentFailed"
      )
    );

    return null;
  }

  return {
    used: true,
    tamer,

    totalFours,

    alreadyCountedFours:
      Math.max(
        0,
        Number(
          alreadyCountedFours ?? 0
        )
      ),

    fourSuccesses:
      availableFours,

    isInterruptAttack,
    payment
  };
}

async function getQuickeningDodgeResult(
  defender,
  request = {}
) {
  if (
    !game?.combat?.started ||
    !defender ||
    !["digimon", "npc"].includes(
      defender.type
    ) ||
    Number(
      request.accuracySuccesses ?? 0
    ) <= 0
  ) {
    return null;
  }

  const tamer =
    await resolveLinkedTamerForPartner(
      defender
    );

  if (
    !tamer ||
    !canCurrentUserControlActor(tamer) ||
    !hasUnlockedOfficialTamerTalent(
      tamer,
      "quickening"
    )
  ) {
    return null;
  }

  const currentActions = Math.max(
    0,
    Number(
      tamer.system?.combat
        ?.actions?.value ?? 0
    )
  );

  const currentUses =
    getOfficialTamerTalentUseValue(
      tamer,
      "quickening",
      1
    );

  if (
    currentActions < 1 ||
    currentUses < 1
  ) {
    return null;
  }

  const useQuickening =
    await foundry.applications.api.DialogV2.confirm({
      window: { title: localize(
        "DDA.TamerTalent.Quickening.Title"
      ) },

      content: `
        <div class="dda-confirm-dialog dda-quickening-dialog">
          <p>
            ${formatI18n(
              "DDA.TamerTalent.Quickening.Prompt",
              {
                tamer:
                  tamer.name,

                partner:
                  defender.name,

                attacker:
                  request.attackerName ?? "",

                attack:
                  request.attackName ?? ""
              }
            )}
          </p>

          <p>
            ${localize(
              "DDA.TamerTalent.Quickening.NoDodgeTriggers"
            )}
          </p>

          <p>
            ${formatI18n(
              "DDA.TamerTalent.Quickening.CostSummary",
              {
                actions:
                  currentActions,

                uses:
                  currentUses
              }
            )}
          </p>
        </div>
      `,

      no: { default: true },
      rejectClose: false,
      modal: true
      });

  if (!useQuickening) {
    return null;
  }

  const payment =
    await spendTamerTalentActionAndUse(
      tamer,
      "quickening",
      {
        actionCost: 1,
        maximum: 1,
        recharge: "combat"
      }
    );

  if (!payment) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.Quickening.PaymentFailed"
      )
    );

    return null;
  }

  /*
   * O resultado sintético fica sempre acima da
   * Precisão, inclusive quando alguma regra reduz
   * os Sucessos de Esquiva pela metade.
   */
  const requiredFinalDodge = Math.max(
    1,

    Number(
      request.accuracySuccesses ?? 0
    ) + 1
  );

  const rawDodgeSuccesses =
    request.dodgeShouldHalve
      ? requiredFinalDodge * 2
      : requiredFinalDodge;

  return {
    roll: null,

    rolledSuccesses: 0,

    automaticSuccesses:
      rawDodgeSuccesses,

    totalSuccesses:
      rawDodgeSuccesses,

    quickening: true,

    quickeningTamerUuid:
      tamer.uuid,

    quickeningTamerName:
      tamer.name,

    /*
     * Esta marca deixa explícito para automações
     * futuras que não houve Esquiva bem-sucedida
     * normal.
     */
    suppressSuccessfulDodgeTriggers:
      true,

    payment
  };
}

async function getTuckAndRollDodgeResult(
  defender,
  request = {},
  dodgeResult = {}
) {
  if (
    !game?.combat?.started ||
    !defender ||
    defender.type !== "character" ||
    !canCurrentUserControlActor(
      defender
    ) ||
    !hasUnlockedOfficialTamerTalent(
      defender,
      "tuckAndRoll"
    )
  ) {
    return null;
  }

  const originalOutcome =
    getAttackDodgeOutcome(
      request,
      dodgeResult
    );

  /*
   * O Talento só é oferecido quando o Ataque
   * realmente acertaria após a Esquiva normal.
   */
  if (!originalOutcome.hit) {
    return null;
  }

  const currentUses =
    getOfficialTamerTalentUseValue(
      defender,
      "tuckAndRoll",
      1
    );

  if (currentUses < 1) {
    return null;
  }

  const useTuckAndRoll =
    await foundry.applications.api.DialogV2.confirm({
      window: { title: localize(
          "DDA.TamerTalent.TuckAndRoll.Title"
        ) },

      content: `
        <div class="dda-confirm-dialog dda-tuck-and-roll-dialog">
          <p>
            ${formatI18n(
              "DDA.TamerTalent.TuckAndRoll.Prompt",
              {
                actor:
                  escapeHtml(
                    defender.name
                  ),

                attack:
                  escapeHtml(
                    request.attackName ??
                    ""
                  ),

                attacker:
                  escapeHtml(
                    request.attackerName ??
                    ""
                  )
              }
            )}
          </p>

          <p>
            ${formatI18n(
              "DDA.TamerTalent.TuckAndRoll.CostSummary",
              {
                uses:
                  currentUses
              }
            )}
          </p>
        </div>
      `,

      no: { default: true },
      rejectClose: false,
      modal: true
      });

  if (!useTuckAndRoll) {
    return null;
  }

  const payment =
    await spendTamerTalentActionAndUse(
      defender,
      "tuckAndRoll",
      {
        actionCost: 0,
        maximum: 1,
        recharge: "rest"
      }
    );

  if (!payment) {
    ui.notifications.warn(
      localize(
        "DDA.TamerTalent.TuckAndRoll.PaymentFailed"
      )
    );

    return null;
  }

  if (dodgeResult.tamerDefense) {
    return {
      ...dodgeResult,
      tamerDefense: {
        ...dodgeResult.tamerDefense,
        damage: 0,
        outcomeKey: "success"
      },
      originalTotalSuccesses: Math.max(0, Number(dodgeResult.totalSuccesses ?? 0)),
      tuckAndRoll: true,
      tuckAndRollTamerName: defender.name,
      payment
    };
  }

  /*
   * Quando empate já conta como erro, basta igualar
   * os Sucessos de Esquiva aos de Acerto.
   *
   * Na regra normal, a Esquiva precisa superar
   * o Acerto em pelo menos 1.
   */
  const requiredFinalDodge =
    Math.max(
      0,

      originalOutcome
        .accuracySuccesses +
      (
        request
          .equalAccuracyAndDodgeCountsAsMiss
          ? 0
          : 1
      )
    );

  /*
   * Se alguma regra divide a Esquiva pela metade,
   * calcula o valor bruto mínimo necessário.
   *
   * Math.ceil(raw / 2) precisa resultar no valor
   * final desejado.
   */
  const requiredRawDodge =
    request.dodgeShouldHalve
      ? Math.max(
          0,
          requiredFinalDodge * 2 - 1
        )
      : requiredFinalDodge;

  const originalTotalSuccesses =
    Math.max(
      0,

      Number(
        dodgeResult
          .totalSuccesses ?? 0
      )
    );

  const addedAutomaticSuccesses =
    Math.max(
      0,

      requiredRawDodge -
      originalTotalSuccesses
    );

  return {
    ...dodgeResult,

    automaticSuccesses:
      Math.max(
        0,

        Number(
          dodgeResult
            .automaticSuccesses ?? 0
        )
      ) +
      addedAutomaticSuccesses,

    totalSuccesses:
      Math.max(
        originalTotalSuccesses,
        requiredRawDodge
      ),

    originalTotalSuccesses,

    tuckAndRoll: true,

    tuckAndRollTamerName:
      defender.name,

    payment
  };
}

function getWeaponMeleeFourSuccesses(
  accuracyResult,
  maxCount = 0
) {
  const limit = Math.max(
    0,
    Number(maxCount ?? 0)
  );

  if (limit <= 0) {
    return 0;
  }

  return Math.min(
    limit,

    getUncountedAccuracyFourCount(
      accuracyResult
    )
  );
}




function absorbGainWithDoom(actor, amount) {
  const requested = Math.max(0, Number(amount ?? 0));
  const effects = foundry.utils.deepClone(actor?.system?.effects?.active ?? []);
  const doomIndex = effects.findIndex((effect) => getEffectTagKey(effect.tag) === "doom");
  if (doomIndex < 0 || requested <= 0) {
    return { remaining: requested, effects, changed: false };
  }

  const doom = effects[doomIndex];
  const value = Math.max(0, Number(doom.value ?? doom.potency ?? 0));
  const absorbed = Math.min(value, requested);
  const nextValue = value - absorbed;

  if (nextValue <= 0) effects.splice(doomIndex, 1);
  else effects[doomIndex] = { ...doom, value: nextValue };

  return {
    remaining: requested - absorbed,
    effects,
    changed: absorbed > 0
  };
}



function getQualityForAttackModifier(actor, modifierFlag) {
  return actor?.items?.find((item) => item.type === "quality" && Boolean(item.system?.attackModifier?.[modifierFlag])) ?? null;
}

function actorHasNaturalWeaknessElement(
  actor,
  element = ""
) {
  const normalizedElement =
    normalizeKey(element);

  if (!normalizedElement) return false;

  const elements = Array.isArray(
    actor?.system
      ?.qualityFeatures
      ?.naturalWeakness
      ?.elements
  )
    ? actor.system
        .qualityFeatures
        .naturalWeakness
        .elements
    : [];

  return elements.some((entry) => {
    return normalizeKey(entry) ===
      normalizedElement;
  });
}

function getElementalForceAttackData(attacker, attackItem) {
  const quality = findQuality(attacker, "elementalForce");
  if (!quality) return null;

  const attackKeys = new Set([
    attackItem?.id,
    attackItem?.uuid,
    attackItem?.name
  ].filter(Boolean).map(String));

  const choices = getSelectedChoices(quality);
  const boundChoice = choices.find((choice) => {
    const keyText = String(choice?.key ?? "");
    const keyAttackId = keyText.includes(":") ? keyText.slice(0, keyText.indexOf(":")) : "";
    const selectedAttack = String(
      choice?.attackId ?? choice?.attackItemId ?? choice?.itemId ?? keyAttackId ?? ""
    );
    return selectedAttack && attackKeys.has(selectedAttack);
  });

  /*
   * Builds antigas não armazenavam o ataque no Rank. Mantemos apenas o
   * fallback quando há uma única escolha, evitando que uma compra moderna
   * dispare Elemental Force em todos os ataques elementais do Digimon.
   */
  const legacyChoice = !boundChoice && choices.length === 1 && !choices[0]?.attackId
    ? choices[0]
    : null;
  const selectedChoice = boundChoice ?? legacyChoice;
  if (!selectedChoice) return null;

  const keyText = String(selectedChoice.key ?? "");
  const keyElement = keyText.includes(":") ? keyText.slice(keyText.indexOf(":") + 1) : keyText;
  const element = normalizeKey(
    selectedChoice.element ?? selectedChoice.attackTag ?? selectedChoice.value ?? keyElement
  );
  if (!element) return null;
  const attackElements = getElementTagsFromAttack(attackItem);
  if (!attackElements.includes(element)) return null;
  if (!actorHasNaturewalkElement(attacker, element)) return null;
  const rank = getQualityRank(quality);
  return {
    quality,
    element,
    elementLabel: element.toUpperCase(),
    damageBonus: 1 + rank
  };
}

function findBulletProofQualityForAttack(actor) {
  return actor?.items?.find((item) => {
    if (item.type !== "quality") return false;

    const key = normalizeKey([
      item.name,
      item.system?.sourceId,
      item.system?.originalName,
      item.system?.id
    ].filter(Boolean).join(" "));

    return (
      key.includes("bulletproof") ||
      key.includes("aprovadebalas")
    );
  }) ?? null;
}

function actorHasBulletProofForAttack(actor) {
  return Boolean(findBulletProofQualityForAttack(actor));
}

function getBulletProofAttackerKey(attacker) {
  const rawKey = String(
    attacker?.id ??
    attacker?.uuid ??
    attacker?.name ??
    "unknown-attacker"
  ).trim();

  return rawKey
    .replace(/\./g, "_")
    .replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function getBulletProofStoredEntry(bucket = {}, attacker) {
  const directKey = getBulletProofAttackerKey(attacker);
  const directEntry = bucket?.[directKey];

  if (directEntry) return directEntry;

  const attackerUuid = String(attacker?.uuid ?? "");
  const attackerId = String(attacker?.id ?? "");
  const attackerName = String(attacker?.name ?? "");

  const entries = [
    ...Object.values(bucket ?? {}),
    ...Object.values(bucket?.Actor ?? {})
  ];

  return entries.find((entry) => {
    if (!entry || typeof entry !== "object") return false;

    return (
      (attackerUuid && String(entry.attackerUuid ?? "") === attackerUuid) ||
      (attackerId && String(entry.attackerId ?? "") === attackerId) ||
      (attackerName && String(entry.attackerName ?? "") === attackerName)
    );
  }) ?? null;
}

function getBulletProofSvValue(actor) {
  const candidates = [
    actor?.system?.derivedStats?.sv?.total,
    actor?.system?.derivedStats?.sv?.value,
    actor?.system?.derivedStats?.sv?.base,

    actor?.system?.derived?.sv?.total,
    actor?.system?.derived?.sv?.value,
    actor?.system?.derived?.sv?.base,

    actor?.system?.miscStats?.resistance?.total,
    actor?.system?.miscStats?.resistance?.value,
    actor?.system?.miscStats?.resistance?.base,

    actor?.system?.miscStats?.sv?.total,
    actor?.system?.miscStats?.sv?.value,
    actor?.system?.miscStats?.sv?.base
  ];

  for (const candidate of candidates) {
    const value = Number(candidate ?? Number.NaN);

    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return Math.max(0, Number(getActorSv(actor) ?? 0));
}

function getBulletProofAttackModifier(attacker, defender) {
  if (!attacker || !defender) return null;

  const quality = findBulletProofQualityForAttack(defender);
  if (!quality) return null;

  const bucket = defender.system?.combat?.qualityAttackUses?.bulletProof ?? {};
  const entry = getBulletProofStoredEntry(bucket, attacker);

  if (
    !entry ||
    String(entry.combatId ?? "") !== getCombatId()
  ) {
    return null;
  }

  const priorAttacks = Math.max(0, Number(entry.count ?? 0));

  if (priorAttacks <= 0) return null;

  const bulletProofSv = getBulletProofSvValue(defender);
  const penalty = priorAttacks * bulletProofSv;

  if (penalty <= 0) {
    console.warn("DDA | Bullet Proof found, but SV was 0 or missing.", {
      defender: defender?.name,
      sv: bulletProofSv,
      derivedStatsSv: defender?.system?.derivedStats?.sv,
      derivedSv: defender?.system?.derived?.sv,
      resistance: defender?.system?.miscStats?.resistance,
      miscSv: defender?.system?.miscStats?.sv
    });

    return null;
  }

  return {
    penalty,
    accuracyBonus: -penalty,
    damageBonus: -penalty,
    quality: {
      id: quality.id ?? "bullet-proof",
      name: quality.name ?? localizeQ("DDA.QualityAutomation.BulletProof.Name", "Bullet Proof"),
      parts: [
        localizeQ(
          "DDA.QualityAutomation.BulletProof.Penalty",
          "Repeated attacker: -{value} Accuracy and Damage.",
          { value: penalty }
        )
      ]
    }
  };
}


function getWatchfulHunterAttackModifier(attacker, defender, rangeType = "") {
  if (!attacker || !defender) return null;
  const modern = attacker.system?.combat?.offensiveQualities?.watchfulHunter;
  const legacy = attacker.system?.combat?.qualityAttackUses?.watchfulHunter?.[defender.uuid];
  const entry = modern?.targetUuid === defender.uuid ? modern : legacy;
  if (!entry) return null;
  if (legacy && String(entry.combatId ?? "") !== getCombatId()) return null;
  if (modern && !entry.active && String(entry.mode ?? "none") === "none") return null;
  const mode = String(entry.mode ?? "melee");
  if (mode !== "all" && rangeType !== "melee") return null;
  const bonus = Number(entry.bonus ?? 2);
  const quality = findQuality(attacker, "watchfulHunter");
  return {
    accuracyBonus: bonus,
    quality: {
      id: quality?.id ?? "watchful-hunter",
      name: quality?.name ?? localizeQ("DDA.QualityAutomation.WatchfulHunter.Name", "Watchful Hunter"),
      parts: [localizeQ("DDA.QualityAutomation.WatchfulHunter.AttackBonus", "+{bonus} Accuracy against studied target.", { bonus })]
    }
  };
}

async function recordBulletProofIncomingAttack(defender, attacker) {
  if (!defender || !attacker) return;
  if (!actorHasBulletProofForAttack(defender)) return;

  const qualityAttackUses = foundry.utils.deepClone(defender.system?.combat?.qualityAttackUses ?? {});
  qualityAttackUses.bulletProof ??= {};

  const key = getBulletProofAttackerKey(attacker);
  const existing = getBulletProofStoredEntry(qualityAttackUses.bulletProof, attacker);

  const currentCount =
    existing &&
    String(existing.combatId ?? "") === getCombatId()
      ? Number(existing.count ?? 0)
      : 0;

  qualityAttackUses.bulletProof[key] = {
    ...(existing ?? {}),
    attackerUuid: attacker.uuid ?? "",
    attackerId: attacker.id ?? "",
    attackerName: attacker.name ?? "",
    combatId: getCombatId(),
    round: getCombatRound(),
    turn: getCombatTurn(),
    count: currentCount + 1
  };

  await defender.update({
    "system.combat.qualityAttackUses": qualityAttackUses
  });
}

function getEscalatingTn(actor, quality, bucket) {
  return Math.max(0, Number(actor?.system?.combat?.qualityAttackUses?.[bucket]?.[quality?.id]?.tnIncrease ?? 0));
}

async function increaseEscalatingTn(actor, quality, bucket, amount = 3) {
  if (!actor || !quality || !amount) return;
  const qualityAttackUses = foundry.utils.deepClone(actor.system?.combat?.qualityAttackUses ?? {});
  qualityAttackUses[bucket] ??= {};
  const current = qualityAttackUses[bucket][quality.id] ?? {};
  qualityAttackUses[bucket][quality.id] = {
    ...current,
    used: true,
    combatId: getCombatId(),
    round: getCombatRound(),
    turn: getCombatTurn(),
    tnIncrease: Math.max(0, Number(current.tnIncrease ?? 0) + Number(amount ?? 0))
  };
  await actor.update({ "system.combat.qualityAttackUses": qualityAttackUses });
}

async function healActorWounds(actor, amount) {
  if (!actor) return;
  const doom = absorbGainWithDoom(actor, amount);
  const heal = doom.remaining;
  if (heal <= 0) {
    if (doom.changed) await actor.update({ "system.effects.active": doom.effects });
    return;
  }
  const path = actor.type === "character" ? "system.derived.wounds.value" : "system.miscStats.wounds.value";
  const maxPath = actor.type === "character" ? "system.derived.wounds.max" : "system.miscStats.wounds.max";
  const current = Number(foundry.utils.getProperty(actor, path) ?? 0);
  const max = Number(foundry.utils.getProperty(actor, maxPath) ?? current);
  await actor.update({
    [path]: Math.min(max, current + heal),
    ...(doom.changed ? { "system.effects.active": doom.effects } : {})
  });
}

function getAttributeAdvantageData(attacker, defender) {
  const mode = getDDASetting("attributeAdvantage");

  const attackerAttribute = attacker.system.attribute ?? "";
  const defenderAttribute = defender.system.attribute ?? "";

  const attackerLabel = getAttributeLabel(attackerAttribute);
  const defenderLabel = getAttributeLabel(defenderAttribute);

  const data = {
    mode,
    active: false,
    attackerAttribute,
    defenderAttribute,
    attackerLabel,
    defenderLabel,
    extraAccuracyDice: 0,
    automaticSuccesses: 0
  };

  if (mode === "none") return data;

  if (!hasAttributeAdvantage(attackerAttribute, defenderAttribute)) {
    return data;
  }

  data.active = true;

  if (mode === "minor") {
    data.extraAccuracyDice = 1;
  }

  if (mode === "major") {
    data.automaticSuccesses = 1;
  }

  return data;
}

async function evaluateAttackFormula(actor, formula, fallback = 0) {
  const text = String(formula ?? "").trim();

  if (!text) return Number(fallback ?? 0);

  try {
    const roll = await new Roll(text, {
      actor: actor.system,
      system: actor.system
    }).evaluate();

    const total = Number(roll.total ?? fallback);

    return Number.isFinite(total)
      ? total
      : Number(fallback ?? 0);
  } catch (error) {
    console.warn("DDA | Invalid attack formula.", {
      actor: actor?.name,
      formula,
      fallback,
      error
    });

    ui.notifications.warn(formatI18n("DDA.Warning.InvalidAttackFormulaUsingFallback", {
  fallback
}));

    return Number(fallback ?? 0);
  }
}

function hasAttributeAdvantage(attackerAttribute, defenderAttribute) {
  if (!attackerAttribute || !defenderAttribute) return false;

  if (attackerAttribute === "free" || defenderAttribute === "free") return false;
  if (attackerAttribute === "variable" || defenderAttribute === "variable") return false;

  const advantageMap = {
    vaccine: "virus",
    virus: "data",
    data: "vaccine"
  };

  return advantageMap[attackerAttribute] === defenderAttribute;
}

function getAttributeLabel(attribute) {
  const labels = CONFIG.DDA?.digimonAttributes ?? {};

  return labels[attribute] ?? "—";
}

function isActorInSentryStance(actor) {
  const stance = String(actor?.system?.combat?.currentStance ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();

  return stance === "sentry" || stance === "sentrystance" || stance === "posturasentinela";
}

function isAmmoAttackUsedThisCombat(actor, attackItem) {
  const attackId = String(attackItem?.id ?? "");
  if (!attackId) return false;

  const combatId = game.combat?.id ?? "";

  if (!combatId) return false;

  const entry = actor?.system?.combat?.qualityAttackUses?.ammo?.[attackId];

  if (!entry) return false;

  if (typeof entry === "object") {
    return Boolean(entry.used) && String(entry.combatId ?? "") === combatId;
  }

  return false;
}

async function markAmmoAttackUsedThisCombat(actor, attackItem) {
  const attackId = String(attackItem?.id ?? "");
  if (!actor || !attackId) return;

  const combatId = game.combat?.id ?? "";

  if (!combatId) return;

  const qualityAttackUses = foundry.utils.deepClone(actor.system.combat?.qualityAttackUses ?? {});
  qualityAttackUses.ammo ??= {};
  qualityAttackUses.ammo[attackId] = {
    used: true,
    combatId,
    round: Number(game.combat?.round ?? 0),
    turn: Number(game.combat?.turn ?? -1)
  };

  await actor.update({
    "system.combat.qualityAttackUses": qualityAttackUses
  });
}

function buildAttackQualitySpecialNote({
  qualityAttackModifier,
  hit,
  attackDealsDamage,
  leftoverSuccesses,
  isSignature,
  currentBattery,
  areaAttackDeclaration,
  areaBatch = null,
  declaredAttackQualityEffects = {},
  postHitQualityEffects = {}
} = {}) {
  const notes = [];

  if (qualityAttackModifier?.chargeMoveWithAttack) {
    notes.push("This [CHARGE] Attack may be used with movement before or after the Attack, in a straight line.");

    if (isSignature && Number(qualityAttackModifier.chargeSignatureBatteryMoveBonus ?? 0) > 0) {
      notes.push(`Signature Move: may move +${Number(currentBattery ?? 0)} additional spaces from Battery.`);
    }
  }

  if (qualityAttackModifier?.ammoOncePerCombat) {
    notes.push("This [AMMO] Attack ignores the one Attack per Round rule, but is now spent for this combat.");
  }

  if (Number(qualityAttackModifier?.recoilDistance ?? 0) > 0) {
    const distance = Number(qualityAttackModifier.recoilDistance ?? 0);

    notes.push(`This [RECOIL] Attack pushes the attacker ${distance} spaces away from the target.`);

    if (
      qualityAttackModifier.recoilTargetPushOnDamageHit &&
      hit &&
      attackDealsDamage &&
      Number(leftoverSuccesses ?? 0) > 0
    ) {
      notes.push(`The target is also pushed ${distance} spaces away because the attack hit with at least 1 leftover Accuracy Success.`);
    }
  }

  if (Number(qualityAttackModifier?.sneakRangeExtraActionCost ?? 0) > 0) {
    notes.push(`This ranged [SNEAK] Attack costs +${Number(qualityAttackModifier.sneakRangeExtraActionCost)} Action unless it is a Signature Move.`);
  }

  if (qualityAttackModifier?.venomous && hit && attackDealsDamage) {
    notes.push("This [VENOM] Attack hit: roll BIT (Survival) vs TN 10 + target RAM to apply [POISON].");
  }

  if (areaAttackDeclaration?.active) {
    notes.push(`${areaAttackDeclaration.label} was declared as active for this Attack.`);
  }

  if (areaBatch?.trueGuardianProtection?.active) {
    const protection = areaBatch.trueGuardianProtection;
    notes.push(combatText(
      `${protection.guardianName || "Guardião Verdadeiro"} concede +${Number(protection.armorBonus ?? 0)} de Armadura e nega as Tags de Efeito por estar entre o alvo e a origem da Área.`,
      `${protection.guardianName || "True Guardian"} grants +${Number(protection.armorBonus ?? 0)} Armor and negates Effect Tags by standing between the target and the Area origin.`
    ));
  }

    if (
    hit &&
    attackDealsDamage &&
    (
      Number(qualityAttackModifier?.piercingUnalterableDamageRegular ?? 0) > 0 ||
      Number(qualityAttackModifier?.piercingUnalterableDamageArea ?? 0) > 0
    )
  ) {
    const piercingDamage = areaAttackDeclaration?.active
      ? Number(qualityAttackModifier.piercingUnalterableDamageArea ?? 0)
      : Number(qualityAttackModifier.piercingUnalterableDamageRegular ?? 0);

    notes.push(localizeQ(
      "DDA.QualityAutomation.ArmorPiercing.Damage",
      "[PIERCING] added {value} Unalterable Damage.",
      { value: piercingDamage }
    ));
  }

  if (
    Number(
      qualityAttackModifier
        ?.certainSignatureBatteryAutomaticSuccessBonus ?? 0
    ) > 0
  ) {
    notes.push(localizeQ(
      "DDA.QualityAutomation.CertainStrike.SignatureBattery",
      "[CERTAIN] gained +{value} additional automatic Accuracy Success from Signature Move Battery.",
      {
        value: Number(
          qualityAttackModifier
            .certainSignatureBatteryAutomaticSuccessBonus
        )
      }
    ));
  }

  if (
    Number(
      qualityAttackModifier?.fumbleRanks ?? 0
    ) > 0
  ) {
    notes.push(localizeQ(
      "DDA.QualityAutomation.FumbledPiercing.Result",
      "[FUMBLE {ranks}] made Accuracy/Dodge ties miss and changed Piercing damage from {before} to {after}.",
      {
        ranks: Number(
          qualityAttackModifier.fumbleRanks
        ),

        before: Number(
          qualityAttackModifier
            .fumblePiercingDamageBeforePenalty ?? 0
        ),

        after: Number(
          qualityAttackModifier
            .fumblePiercingDamageAfterPenalty ?? 0
        )
      }
    ));
  }

  if (
    Number(
      qualityAttackModifier?.fragileRanks ?? 0
    ) > 0
  ) {
    notes.push(localizeQ(
      "DDA.QualityAutomation.WeakenedStrike.Result",
      "[FRAGILE {ranks}] applied -{damage} Damage, -{potency} Effect Potency, and -{duration} Effect Duration.",
      {
        ranks: Number(
          qualityAttackModifier.fragileRanks
        ),

        damage: Number(
          qualityAttackModifier
            .fragileDamagePenalty ?? 0
        ),

        potency: Number(
          qualityAttackModifier
            .fragileEffectPotencyPenalty ?? 0
        ),

        duration: Number(
          qualityAttackModifier
            .fragileEffectDurationPenalty ?? 0
        )
      }
    ));
  }

  if (
    areaAttackDeclaration?.active &&
    areaAttackDeclaration?.targetMode === "all" &&
    hasZonerOption(
      qualityAttackModifier,
      "bombardment"
    )
  ) {
  const derivedStatKey = getAreaAttackDerivedStatKey(areaAttackDeclaration.tag).toUpperCase();

  notes.push(`Bombardment is active for this Area Attack. The damage reduction cannot lower damage below the ${derivedStatKey} floor, or below the damage after Armor if that is lower.`);
}

  for (const note of declaredAttackQualityEffects?.notes ?? []) notes.push(note);
  for (const note of postHitQualityEffects?.notes ?? []) notes.push(note);

  if (Number(qualityAttackModifier?.combatMonsterResolveSpent ?? 0) > 0 && hit) {
    notes.push(localizeQ("DDA.QualityAutomation.CombatMonster.ResolveSpent", "Combat Monster spent {value} Resolve and added it to Damage.", { value: Number(qualityAttackModifier.combatMonsterResolveSpent) }));
  }

  if (Number(qualityAttackModifier?.drainHealing ?? 0) > 0 && hit) {
    notes.push(localizeQ("DDA.QualityAutomation.Lifesteal.Heal", "[DRAIN] heals the attacker for {value} Wound Boxes.", { value: Number(qualityAttackModifier.drainHealing) }));
  }

  if (!notes.length) return "";

  return `
    <ul class="dda-effect-list dda-attack-quality-special-list">
      ${notes.map((note) => `<li>${note}</li>`).join("")}
    </ul>
  `;
}

function getAppliedAttackQualityModifier(attacker, attackItem, options = {}) {
  const rangeType = attackItem.system.baseTags?.rangeType ?? "";
  const functionType = String(
    options?.areaBatch?.functionTypeOverride ??
    attackItem.system.baseTags?.functionType ??
    ""
  ).trim().toLowerCase();
  const isSignature = Boolean(
    options.isSignatureOverride ?? attackItem.system.isSignature
  );
  const attackQualityTags = getAttackQualityTags(attackItem);

  const appliesToLabels = {
    all: "DDA.Attack.AppliesTo.All",
    melee: "DDA.Attack.Range.Melee",
    range: "DDA.Attack.Range.Ranged",
    ranged: "DDA.Attack.Range.Ranged",
    damage: "DDA.Attack.Function.Damage",
    support: "DDA.Attack.Function.Support",
    signature: "DDA.Attack.Signature",
    signatureMove: "DDA.Attack.Signature",
    taggedAttack: "DDA.Attack.AppliedTags",
    oneAttack: "DDA.Attack.AppliedTags",
    oneDamageAttack: "DDA.Attack.Function.Damage",
    oneMeleeAttack: "DDA.Attack.Range.Melee",
    oneRangedAttack: "DDA.Attack.Range.Ranged",
    oneMeleeDamageAttack:
      "DDA.Attack.Range.Melee",

    differentAttackPerRank:
      "DDA.Attack.AppliedTags",

    oneAttackPerPurchasedEffect:
      "DDA.Attack.AppliedTags"
  };

  const effectTagLabels = CONFIG.DDA?.effectTags ?? {};

  const modifierTotal = {
    accuracyBonus: 0,
    damageBonus: 0,
    unalterableDamage: 0,
    piercingUnalterableDamageMax: 0,
    piercingUnalterableDamageRegular: 0,
    piercingUnalterableDamageArea: 0,
    piercingRanks: 0,

    fumbleRanks: 0,
    fumbleAdditionalDodgeForPiercing: 0,
    fumbleEqualAccuracyAndDodgeCountsAsMiss: false,
    fumblePiercingDamageBeforePenalty: 0,
    fumblePiercingDamageAfterPenalty: 0,

    fragileRanks: 0,
    fragileDamagePenalty: 0,
    fragileEffectPotencyPenalty: 0,
    fragileEffectDurationPenalty: 0,

    certainSignatureBatteryAutomaticSuccessBonus: 0,
    signatureBatteryUnalterableDamage: 0,
    weaponMeleeFourSuccessesMax: 0,
    rangeBonus: 0,
    effectiveLimitBonus: 0,
    automaticSuccesses: 0,
    extraActionCost: 0,
    effectTags: [],
    qualityTags: [],
    qualities: [],
    rangeMultiplier: 1,
    effectiveLimitMultiplier: 1,
    blockedInSentryStance: false,
    chargeMoveWithAttack: false,
    chargeSignatureBatteryMoveBonus: 0,
    ammoOncePerCombat: false,
    ammoIgnoresAttackPerRoundLimit: false,
    recoilDistance: 0,
    recoilTargetPushOnDamageHit: false,
    recoilIgnoreAdjacentAccuracyPenalty: false,
    actionCostReduction: 0,
    actionCostMinimum: 0,
    meleeReachBonus: 0,
    longArmsAccuracyPenalty: 0,
    sneakAccuracyBonus: 0,
    sneakSuppressInterrupts: false,
    focusTemporaryWoundMultiplier: 1,
    lifestealHealingCap: 0,
    sneakRangeExtraActionCost: 0,
    venomous: false,
    areaAttackTags: [],
    zonerOptions: [],
    elementalForce: null,
    mightyBlow: false,
    preciseFocus: false,
    feintAttack: false,
    feintDamageHalved: false,
    lifesteal: false,
    punish: false,
    counterTag: false,
    drainHealing: 0,
    combatMonsterResolveSpent: 0,
    bulletProofPenalty: 0,
    allowArmorToReduceDamageToZero: false,
    temporaryWoundBoxesDamageMultiplier: 1,
    dataSpecialization: null,
    areaInsideBaseSize: Boolean(options?.areaBatch?.insideBaseSize),
    areaIgnoreDamageHalving: false,
    areaEffectMinimumDamage: 0,
    ignoresUncatchableTarget: false,
    ignoreNegativeAccuracyModifiers: false,
    stanceBlocked: false,
    stanceBlockedMessage: "",
    braveHeartBonusUsed: 0,
    domainExploitPotency: 0,
    domainTargetDodgePenalty: 0,
    domainTargetArmorPenalty: 0
  };

  /*
   * [DOT] substitui completamente os Ataques do Digimon por dois Ataques
   * básicos. Eles usam os Totais de Precisão e Dano, mas não recebem Tags,
   * bônus de Qualidades de Ataque, Posturas ou Especializações.
   */
  if (attackItem?.flags?.[game.system.id]?.dotSynthetic) {
    return modifierTotal;
  }

  const stanceModifier = getStanceAttackModifier(attacker, attackItem, options);
  if (stanceModifier) {
    modifierTotal.accuracyBonus += Number(stanceModifier.accuracyBonus ?? 0);
    modifierTotal.damageBonus += Number(stanceModifier.damageBonus ?? 0);
    modifierTotal.rangeBonus += Number(stanceModifier.rangeBonus ?? 0);
    modifierTotal.effectiveLimitBonus += Number(stanceModifier.effectiveLimitBonus ?? 0);
    modifierTotal.ignoreNegativeAccuracyModifiers = Boolean(stanceModifier.ignoreNegativeAccuracyModifiers);
    modifierTotal.stanceBlocked = Boolean(stanceModifier.blocked);
    modifierTotal.stanceBlockedMessage = String(stanceModifier.blockedMessage ?? "");
    modifierTotal.braveHeartBonusUsed = Math.max(0, Number(stanceModifier.braveHeartBonusUsed ?? 0));
    modifierTotal.qualities.push(...(stanceModifier.qualities ?? []));
  }

  const domainModifier = getDomainAttackModifier(attacker, options.defender);
  if (domainModifier) {
    modifierTotal.accuracyBonus += Number(domainModifier.accuracyBonus ?? 0);
    modifierTotal.damageBonus += Number(domainModifier.damageBonus ?? 0);
    modifierTotal.domainExploitPotency = Math.max(0, Number(domainModifier.exploitPotency ?? 0));
    modifierTotal.domainTargetDodgePenalty += Math.max(0, Number(domainModifier.targetDodgePenalty ?? 0));
    modifierTotal.domainTargetArmorPenalty += Math.max(0, Number(domainModifier.targetArmorPenalty ?? 0));
    if (domainModifier.quality) modifierTotal.qualities.push(domainModifier.quality);
    modifierTotal.qualities.push(...(domainModifier.qualities ?? []));
  }

    const dataOptimizationModifier = getDataOptimizationAttackModifier(attacker, attackItem, {
    ...options,
    rangeType,
    functionType
  });

  if (dataOptimizationModifier) {
    modifierTotal.accuracyBonus += dataOptimizationModifier.accuracyBonus;
    modifierTotal.damageBonus += dataOptimizationModifier.damageBonus;
    modifierTotal.rangeBonus += dataOptimizationModifier.rangeBonus;
    modifierTotal.effectiveLimitBonus += dataOptimizationModifier.effectiveLimitBonus;

    modifierTotal.qualities.push(dataOptimizationModifier.quality);
  }

  const dataSpecializationModifier = getDataSpecializationAttackModifier(
    attacker,
    attackItem,
    {
      ...options,
      rangeType,
      functionType
    }
  );

  if (dataSpecializationModifier) {
    modifierTotal.damageBonus += dataSpecializationModifier.damageBonus;
    modifierTotal.rangeBonus += dataSpecializationModifier.rangeBonus;
    modifierTotal.effectiveLimitBonus += dataSpecializationModifier.effectiveLimitBonus;
    modifierTotal.dataSpecialization = dataSpecializationModifier;
    modifierTotal.ignoresUncatchableTarget = Boolean(
      dataSpecializationModifier.sniper
    );

    const isInsideBaseSize = Boolean(options?.areaBatch?.insideBaseSize);
    const isMeleeDamage = rangeType === "melee" && functionType === "damage";
    const isRangedDamage = ["range", "ranged"].includes(rangeType) && functionType === "damage";

    modifierTotal.areaIgnoreDamageHalving = Boolean(
      isInsideBaseSize &&
      (
        (dataSpecializationModifier.fistfulOfForce && isMeleeDamage) ||
        (dataSpecializationModifier.mobileArtillery && isRangedDamage)
      )
    );

    modifierTotal.areaEffectMinimumDamage = Boolean(
      isInsideBaseSize &&
      dataSpecializationModifier.mobileArtillery &&
      isRangedDamage
    ) ? 4 : 0;

    if (
      dataSpecializationModifier.quality.parts.length ||
      modifierTotal.areaIgnoreDamageHalving ||
      modifierTotal.areaEffectMinimumDamage
    ) {
      const areaParts = [];
      if (modifierTotal.areaIgnoreDamageHalving) {
        areaParts.push(combatText(
          "Alvo no Tamanho Base: o Dano não é reduzido pela metade.",
          "Target within Base Size: Damage is not halved."
        ));
      }
      if (modifierTotal.areaEffectMinimumDamage) {
        areaParts.push(combatText(
          "Tags de Efeito exigem ao menos 4 de Dano neste alvo do Tamanho Base.",
          "Effect Tags require at least 4 Damage against this Base Size target."
        ));
      }
      modifierTotal.qualities.push({
        ...dataSpecializationModifier.quality,
        parts: [
          ...dataSpecializationModifier.quality.parts,
          ...areaParts
        ]
      });
    }
  }

  const bulletProofModifier = getBulletProofAttackModifier(attacker, options.defender);
  if (bulletProofModifier) {
    modifierTotal.accuracyBonus += bulletProofModifier.accuracyBonus;
    modifierTotal.damageBonus += bulletProofModifier.damageBonus;
    modifierTotal.bulletProofPenalty = bulletProofModifier.penalty;
    modifierTotal.allowArmorToReduceDamageToZero = true;
    modifierTotal.qualities.push(bulletProofModifier.quality);
  }

  const watchfulHunterModifier = getWatchfulHunterAttackModifier(attacker, options.defender, rangeType);
  if (watchfulHunterModifier) {
    modifierTotal.accuracyBonus += watchfulHunterModifier.accuracyBonus;
    modifierTotal.qualities.push(watchfulHunterModifier.quality);
  }

  const hordeDuelistModifier = getHordeDuelistAttackModifier(
    attacker,
    options.defender
  );

  if (hordeDuelistModifier?.accuracyBonus) {
    modifierTotal.accuracyBonus += hordeDuelistModifier.accuracyBonus;
    modifierTotal.qualities.push({
      id: "horde-duelist",
      name: hordeDuelistModifier.qualityName,
      parts: [combatText(
        `Inimigo adjacente sem aliados junto dele: +${hordeDuelistModifier.accuracyBonus} de Precisão.`,
        `Adjacent enemy with no allies beside it: +${hordeDuelistModifier.accuracyBonus} Accuracy.`
      )]
    });
  }

  const directAttackTags = getAttackQualityTags(attackItem);
  const sneakState = directAttackTags.has("sneak")
    ? getSneakAttackState(attacker, options.defender)
    : null;

  if (sneakState?.active) {
    const sneakBonus = Math.max(0, Number(sneakState.accuracyBonus ?? 0));
    modifierTotal.accuracyBonus += sneakBonus;
    modifierTotal.sneakAccuracyBonus = sneakBonus;
    modifierTotal.sneakSuppressInterrupts = Boolean(
      isSignature && rangeType === "melee"
    );
    modifierTotal.qualities.push({
      id: "sneak-attack-hidden",
      name: combatText("Ataque Furtivo", "Sneak Attack"),
      parts: [
        sneakBonus > 0
          ? combatText(`Oculto e reposicionado: +${sneakBonus} de Precisão.`, `Hidden and repositioned: +${sneakBonus} Accuracy.`)
          : combatText(
              "Oculto, mas sem ter se movido desde que se escondeu neste turno: sem bônus de Precisão.",
              "Hidden, but without moving since hiding this turn: no Accuracy bonus."
            ),
        modifierTotal.sneakSuppressInterrupts
          ? combatText("Signature [MELEE]: o alvo não pode usar Interrupções nem Substituto.", "[MELEE] Signature: the target cannot use Interrupts or Substitute.")
          : ""
      ].filter(Boolean)
    });
  } else if (sneakState?.revealedByTrueSight) {
    modifierTotal.sneakAccuracyBonus = 0;
    modifierTotal.sneakSuppressInterrupts = false;
    modifierTotal.qualities.push({
      id: "sneak-attack-true-sight",
      name: combatText("Visão Verdadeira", "True Sight"),
      parts: [combatText(
        "O alvo vê automaticamente através de Ocultar-se à Vista: nenhum benefício de estar oculto se aplica contra ele.",
        "The target automatically sees through Hide in Plain Sight: no hidden benefit applies against it."
      )]
    });
  }

  const reachData = getReachModeData(attacker);
  if (rangeType === "melee" && ["wideswings", "longarms"].includes(reachData.mode)) {
    modifierTotal.meleeReachBonus = Math.max(
      modifierTotal.meleeReachBonus,
      Math.max(0, Number(reachData.rank ?? 0))
    );

    if (reachData.mode === "longarms" && options.targetToken) {
      const attackerToken = findSceneTokenForActor(attacker);
      const distance = getTokenGridDistance(attackerToken, options.targetToken);
      const maximumReach = 1 + Math.max(0, Number(reachData.rank ?? 0));
      modifierTotal.longArmsAccuracyPenalty = Math.max(0, maximumReach - distance);
    }
  }

  const qualities = attacker.items.filter((item) => item.type === "quality");

  for (const quality of qualities) {
    if (isActorBossDisarmed(attacker) && isWeaponBenefitQuality(quality)) {
      continue;
    }

    const modifier = quality.system.attackModifier ?? {};
    const grantsTags = Array.isArray(modifier.grantsTags) ? modifier.grantsTags.map(normalizeAttackTag).filter(Boolean) : [];
    const hasConfiguredModifier = Boolean(
      modifier.enabled ||
      grantsTags.length ||
      Number(modifier.accuracyBonus ?? 0) ||
      Number(modifier.damageBonus ?? 0) ||
      Number(modifier.unalterableDamage ?? 0) ||
      Number(modifier.unalterableDamagePerRank ?? 0) ||
      Number(
        modifier.extraActionCost ??
        modifier.actionCostIncrease ??
        0
      ) ||
      Number(modifier.accuracyBonusPerRank ?? 0) ||
      Number(modifier.damageBonusPerRank ?? 0) ||
      Number(modifier.automaticSuccessesPerRank ?? 0) ||
      modifier.piercingUnalterablePerLeftoverSuccess ||
      modifier.actionCostReduction ||
      modifier.sneakAttack ||
      modifier.venomous ||
      modifier.areaAttack ||
      modifier.reachMode ||
      modifier.effectTag ||
      modifier.elementalForce ||
      modifier.mightyBlow ||
      modifier.preciseFocus ||
      modifier.feintAttack ||
      modifier.lifesteal ||
      modifier.punishingStrike ||
      modifier.counterblow ||
      modifier.crossCounter ||
      modifier.returnFire
    );

    if (!hasConfiguredModifier) continue;
    if (!qualityModifierAppliesToAttack(quality, modifier, attackItem, { rangeType, functionType, isSignature, attackQualityTags, grantsTags })) continue;

const bossWeaponExpertRank = getBossWeaponExpertTagRank(
  attacker,
  quality,
  options
);

const rankValue = Number.isFinite(bossWeaponExpertRank)
  ? bossWeaponExpertRank
  : getAppliedAttackQualityRankValue(quality);

const selectedAttackBinding = getSelectedChoices(quality).find((choice) => {
  const attackId = String(
    choice?.attackId ?? choice?.attackItemId ?? choice?.itemId ?? ""
  );
  return attackId && getAttackIdentityKeys(attackItem).has(attackId);
}) ?? null;

const hasWeaponTag = grantsTags.includes("weapon");
const hasChargeTag = grantsTags.includes("charge");
const hasAmmoTag = grantsTags.includes("ammo");
const hasRecoilTag = grantsTags.includes("recoil");
const hasSimpleTag = grantsTags.includes("simple");
const hasSneakTag = grantsTags.includes("sneak");
const hasVenomTag = grantsTags.includes("venom");
const hasFocusTag = grantsTags.includes("focus");
const hasMightyTag = grantsTags.includes("t:mighty");
const hasFeintTag = grantsTags.includes("t:feint");
const hasDrainTag = grantsTags.includes("drain");
const hasPunishTag = grantsTags.includes("punish");
const hasCounterTag = grantsTags.includes("counter");
const hasPiercingTag = grantsTags.includes("piercing");
const hasCertainTag = grantsTags.includes("certain");
const hasFumbleTag = grantsTags.includes("fumble");
const hasFragileTag = grantsTags.includes("fragile");

const selectedAreaTags =
  getSelectedAttackAreaTagsForQuality(
    quality,
    attackItem
  );


const selectedEffectChoices =
  getSelectedAttackEffectChoicesForQuality(
    quality,
    attackItem
  );

const selectedEffectTags =
  selectedEffectChoices.map(
    (choice) => choice.tag
  );

const choicesType =
  String(
    quality.system?.choices?.type ??
    ""
  ).trim();

const appliesTo =
  String(
    modifier.appliesTo ?? ""
  ).trim();

const usesPurchasedEffectSelection =
  choicesType ===
    "effectTagPerRank" ||
  appliesTo ===
    "oneAttackPerPurchasedEffect";

const isAreaAttackModifier =
  Boolean(
    modifier.areaAttack
  ) ||
  (
    appliesTo ===
      "differentAttackPerRank" &&

    grantsTags.some((tag) => {
      return tag.startsWith(
        "t:"
      );
    })
  );

const areaTagsFromQuality =
  isAreaAttackModifier
    ? selectedAreaTags
    : grantsTags.filter((tag) => {
        return tag.startsWith(
          "t:"
        );
      });

const weaponIsMelee = hasWeaponTag && rangeType === "melee";
const weaponIsMeleeDamage = weaponIsMelee && functionType === "damage";
const weaponIsRanged = hasWeaponTag && ["range", "ranged"].includes(rangeType);

const accuracyBonusPerRank =
  Number(modifier.accuracyBonusPerRank ?? 0) ||
  (hasWeaponTag ? 1 : 0);

const damageBonusPerRank =
  Number(modifier.damageBonusPerRank ?? 0) ||
  (hasWeaponTag ? 1 : 0);

const weaponMeleeDamageBonus = weaponIsMeleeDamage ? 1 : 0;
const weaponRangeBonus = weaponIsRanged ? rankValue : 0;
const weaponEffectiveLimitBonus = weaponIsRanged ? rankValue : 0;

let accuracyBonus = Number(modifier.accuracyBonus ?? 0) + accuracyBonusPerRank * rankValue;
const damageBonus = Number(modifier.damageBonus ?? 0) + damageBonusPerRank * rankValue + weaponMeleeDamageBonus;

const aggressiveFlankContext = modifier.aggressiveFlankAccuracyFrom
  ? getFlankContext(attacker, options.targetToken)
  : { active: false, allies: [] };
let aggressiveFlankBonus = 0;

if (modifier.aggressiveFlankAccuracyFrom && aggressiveFlankContext.active) {
  const statKey = String(modifier.aggressiveFlankAccuracyFrom);
  aggressiveFlankBonus = Number(
    attacker.flags?.["digimon-digital-adventures"]?.evokerCreation?.sourceDerivedStats?.[statKey] ??
    attacker.system.derivedStats?.[statKey]?.total ??
    attacker.system.derivedStats?.[statKey]?.value ??
    0
  );
  accuracyBonus += aggressiveFlankBonus;
}

const unalterableDamage =
  Number(modifier.unalterableDamage ?? 0) +
  (Number(modifier.unalterableDamagePerRank ?? 0) * rankValue);

let automaticSuccesses =
  Number(modifier.automaticSuccesses ?? 0) +
  Number(modifier.automaticSuccessesPerRank ?? 0) * rankValue;

let certainSignatureBatteryAutomaticSuccessBonus = 0;

if (hasCertainTag && isSignature) {
  const currentBattery = Number(attacker.system.resources?.battery?.value ?? 0);
  const threshold = Math.max(0, Number(modifier.signatureBatteryAutomaticSuccessThreshold ?? 2));
  const bonus = Math.max(0, Number(modifier.signatureBatteryAutomaticSuccessBonus ?? 1));

  if (currentBattery >= threshold && bonus > 0) {
    certainSignatureBatteryAutomaticSuccessBonus = bonus;
    automaticSuccesses += bonus;
  }
}

if (
  hasFumbleTag ||
  modifier.equalAccuracyAndDodgeCountsAsMiss
) {
  modifierTotal.fumbleRanks = Math.max(
    modifierTotal.fumbleRanks,
    rankValue
  );

  modifierTotal.fumbleAdditionalDodgeForPiercing =
    Math.max(
      modifierTotal.fumbleAdditionalDodgeForPiercing,
      rankValue * 2
    );

  modifierTotal.fumbleEqualAccuracyAndDodgeCountsAsMiss =
    true;
}

if (
  hasFragileTag ||
  modifier.damagePenaltyFormula ||
  modifier.effectPotencyPenaltyFormula ||
  modifier.effectDurationPenaltyFormula
) {
  modifierTotal.fragileRanks = Math.max(
    modifierTotal.fragileRanks,
    rankValue
  );

  modifierTotal.fragileDamagePenalty = Math.max(
    modifierTotal.fragileDamagePenalty,
    rankValue
  );

  modifierTotal.fragileEffectPotencyPenalty = Math.max(
    modifierTotal.fragileEffectPotencyPenalty,
    rankValue
  );

  modifierTotal.fragileEffectDurationPenalty = Math.max(
    modifierTotal.fragileEffectDurationPenalty,
    rankValue
  );
}

const signatureCannotWaiveEffectActionCost = new Set([
  "haste",
  "paralyze",
  "weak",
  "strength",
  "stun"
]);

const selectedEffectExtraActionCost =
  selectedEffectChoices.some((choice) => {
    if (!choice.extraActionRequired) return false;
    return !isSignature || signatureCannotWaiveEffectActionCost.has(
      normalizeAttackTag(choice.tag)
    );
  })
    ? 1
    : 0;

const extraActionCost =
  Number(
    modifier.extraActionCost ??
    modifier.actionCostIncrease ??
    0
  ) +
  selectedEffectExtraActionCost;

const effectTag =
  normalizeAttackTag(
    modifier.effectTag ?? ""
  );

const rangeMultiplier = hasRecoilTag
  ? Number(modifier.rangeMultiplier ?? 0.5)
  : Number(modifier.rangeMultiplier ?? 1);

const effectiveLimitMultiplier = hasRecoilTag
  ? Number(modifier.effectiveLimitMultiplier ?? 0.5)
  : Number(modifier.effectiveLimitMultiplier ?? 1);

const stagePushDistance = Number(attacker.system.stageValue ?? 0);

const signaturePushBonus = isSignature && modifier.signatureBatteryPushBonus
  ? Number(attacker.system.resources?.battery?.value ?? 0)
  : 0;

const recoilDistance = hasRecoilTag
  ? Math.max(0, stagePushDistance + signaturePushBonus)
  : 0;

const chargeSignatureBatteryMoveBonus = hasChargeTag && isSignature && modifier.signatureBatteryMoveBonus
  ? Number(attacker.system.resources?.battery?.value ?? 0)
  : 0;

modifierTotal.accuracyBonus += accuracyBonus;
modifierTotal.damageBonus += damageBonus;
modifierTotal.unalterableDamage += unalterableDamage;
modifierTotal.rangeBonus += weaponRangeBonus;
modifierTotal.effectiveLimitBonus += weaponEffectiveLimitBonus;
modifierTotal.automaticSuccesses += automaticSuccesses;
modifierTotal.extraActionCost += extraActionCost;
modifierTotal.certainSignatureBatteryAutomaticSuccessBonus += certainSignatureBatteryAutomaticSuccessBonus;

if (Number.isFinite(rangeMultiplier) && rangeMultiplier > 0) {
  modifierTotal.rangeMultiplier *= rangeMultiplier;
}

if (Number.isFinite(effectiveLimitMultiplier) && effectiveLimitMultiplier > 0) {
  modifierTotal.effectiveLimitMultiplier *= effectiveLimitMultiplier;
}

if (hasChargeTag) {
  modifierTotal.chargeMoveWithAttack = true;
  modifierTotal.chargeSignatureBatteryMoveBonus = Math.max(
    modifierTotal.chargeSignatureBatteryMoveBonus,
    chargeSignatureBatteryMoveBonus
  );
}

if (hasAmmoTag) {
  modifierTotal.ammoOncePerCombat = true;
  modifierTotal.ammoIgnoresAttackPerRoundLimit = true;
}

if (hasRecoilTag) {
  modifierTotal.recoilDistance = Math.max(modifierTotal.recoilDistance, recoilDistance);
  modifierTotal.recoilTargetPushOnDamageHit = true;
  modifierTotal.recoilIgnoreAdjacentAccuracyPenalty = true;

  if (modifier.cannotUseInSentryStance && isActorInSentryStance(attacker)) {
    modifierTotal.blockedInSentryStance = true;
  }
}

if (hasSimpleTag || Number(modifier.actionCostReduction ?? 0) > 0) {
  modifierTotal.actionCostReduction += Math.max(0, Number(modifier.actionCostReduction ?? 1));
  modifierTotal.actionCostMinimum = Math.max(modifierTotal.actionCostMinimum, Number(modifier.actionCostMinimum ?? 1));
}

if (hasSneakTag && ["range", "ranged"].includes(rangeType) && !isSignature) {
  const sneakCost = Number(modifier.rangeExtraActionCost ?? 1);
  modifierTotal.extraActionCost += sneakCost;
  modifierTotal.sneakRangeExtraActionCost += sneakCost;
}

if (modifier.reachMode && rangeType === "melee") {
  const selectedReach = getReachModeData(attacker);
  if (["wideswings", "longarms"].includes(selectedReach.mode)) {
    const reachBonus = Math.max(0, Number(modifier.reachBonusPerRank ?? 1) * rankValue);
    modifierTotal.meleeReachBonus = Math.max(modifierTotal.meleeReachBonus, reachBonus);
  }
}

if (hasVenomTag || modifier.venomous) {
  modifierTotal.venomous = true;
}

if (hasFocusTag || modifier.preciseFocus) {
  modifierTotal.preciseFocus = true;

  if (functionType === "damage") {
    modifierTotal.focusTemporaryWoundMultiplier = Math.max(
      modifierTotal.focusTemporaryWoundMultiplier,
      2
    );
  }

  if (isSignature) {
    const battery = Math.max(
      0,
      Number(attacker.system?.resources?.battery?.value ?? 0)
    );
    modifierTotal.rangeBonus += battery;
  }
}

if (hasMightyTag || modifier.mightyBlow) {
  modifierTotal.mightyBlow = true;
}

if (hasFeintTag || modifier.feintAttack) {
  modifierTotal.feintAttack = true;
}

if (
  hasDrainTag ||
  modifier.lifesteal
) {
  modifierTotal.lifesteal = true;
  modifierTotal.lifestealHealingCap = Math.max(
    modifierTotal.lifestealHealingCap,
    getActorDerivedStat(attacker, "dos") +
      (isSignature
        ? Math.max(0, Number(attacker.system?.resources?.battery?.value ?? 0))
        : 0)
  );
}

if (hasPunishTag || modifier.punishingStrike) {
  modifierTotal.punish = true;
}

if (hasCounterTag || modifier.counterblow || modifier.crossCounter || modifier.returnFire) {
  modifierTotal.counterTag = true;
}

if (areaTagsFromQuality.length) {
  for (const tag of areaTagsFromQuality) {
    modifierTotal.areaAttackTags.push(tag);
  }
}

  if (weaponIsMelee) {
  modifierTotal.weaponMeleeFourSuccessesMax += rankValue;
}  

const qualityGrantsPiercingTag = hasPiercingTag;

let piercingUnalterableDamageRegular = 0;
let piercingUnalterableDamageArea = 0;

if (
  qualityGrantsPiercingTag ||
  Number(modifier.piercingUnalterableDamagePerRank ?? 0) > 0 ||
  Number(modifier.piercingUnalterableDamageAreaPerRank ?? 0) > 0
) {
  const regularPerRank = Math.max(
    qualityGrantsPiercingTag ? 2 : 0,
    Number(modifier.piercingUnalterableDamagePerRank ?? 0)
  );

  const areaPerRank = Math.max(
    qualityGrantsPiercingTag ? 1 : 0,
    Number(modifier.piercingUnalterableDamageAreaPerRank ?? 0)
  );

  piercingUnalterableDamageRegular = regularPerRank * rankValue;
  piercingUnalterableDamageArea = areaPerRank * rankValue;

  modifierTotal.piercingUnalterableDamageRegular += piercingUnalterableDamageRegular;
  modifierTotal.piercingUnalterableDamageArea += piercingUnalterableDamageArea;
  modifierTotal.piercingRanks += rankValue;

  if (
    isSignature &&
    selectedAttackBinding?.signatureBatteryAsUnalterable
  ) {
    modifierTotal.signatureBatteryUnalterableDamage = Math.max(
      modifierTotal.signatureBatteryUnalterableDamage,
      Math.min(
        rankValue,
        Math.max(0, Number(attacker.system?.resources?.battery?.value ?? 0))
      )
    );
  }
}

if (effectTag) {
  modifierTotal.effectTags.push(
    effectTag
  );
}

for (
  const selectedEffectTag of
  selectedEffectTags
) {
  modifierTotal.effectTags.push(
    selectedEffectTag
  );
}

/*
 * Efeito Básico/Avançado possui todas as opções
 * dentro de grantsTags, mas somente a opção
 * comprada para este Ataque pode ser aplicada.
 */
const configuredEffectTags =
  new Set(
    Object.keys(
      CONFIG.DDA?.effectTags ?? {}
    ).map((tag) => {
      return normalizeAttackTag(tag);
    })
  );

const grantedQualityTags =
  usesPurchasedEffectSelection
    ? grantsTags.filter((tag) => {
        return !configuredEffectTags.has(
          tag
        );
      })
    : grantsTags;

const attackBoundGrantedQualityTags = grantedQualityTags.filter((tag) => {
  if (tag !== "offhand") return true;
  return attackMatchesExplicitSelection || attackQualityTags.has("offhand");
});

for (const tag of attackBoundGrantedQualityTags) {
  modifierTotal.qualityTags.push(
    tag
  );
}

    const parts = [];

    if (appliesTo) {
      const labelKey =
        appliesToLabels[appliesTo];

      parts.push(
        labelKey
          ? localize(labelKey)
          : appliesTo
      );
    }

    const displayGrantTags =
  usesPurchasedEffectSelection
    ? []
    : areaTagsFromQuality.length
      ? grantsTags.filter((tag) => {
          return !String(tag)
            .startsWith("t:");
        })
      : grantsTags;

if (displayGrantTags.length) {
  parts.push(displayGrantTags.map((tag) => `[${tag.toUpperCase()}]`).join(", "));
}

if (hasFumbleTag) {
  parts.push(localizeQ(
    "DDA.QualityAutomation.FumbledPiercing.Part",
    "[FUMBLE]: ties between Accuracy and Dodge count as a miss; target Dodge counts as +{value} for Piercing damage.",
    {
      value:
        rankValue * 2
    }
  ));
}

if (hasFragileTag) {
  parts.push(localizeQ(
    "DDA.QualityAutomation.WeakenedStrike.Part",
    "[FRAGILE]: -{value} Damage, Effect Potency, and Effect Duration.",
    {
      value:
        rankValue
    }
  ));
}

    if (hasChargeTag) {
  parts.push("move before or after the Attack in a straight line");

  if (chargeSignatureBatteryMoveBonus > 0) {
    parts.push(`Signature Move: +${chargeSignatureBatteryMoveBonus} spaces from Battery`);
  }
}

if (hasAmmoTag) {
  parts.push("ignores the one Attack per Round rule");
  parts.push("once per combat");
}

if (hasRecoilTag) {
  parts.push("Range × 1/2");
  parts.push("Effective Limit × 1/2");
  parts.push(`push self ${recoilDistance} spaces`);
  parts.push("cannot be used in Sentry Stance");
}

if (hasSimpleTag || Number(modifier.actionCostReduction ?? 0) > 0) {
  parts.push("Action Cost -1, minimum 1");
}

if (hasSneakTag) {
  parts.push("Sneak Attack");
  if (["range", "ranged"].includes(rangeType) && !isSignature) parts.push("+1 Action Cost for ranged Sneak Attack");
}

if (hasVenomTag || modifier.venomous) {
  parts.push(localizeQ("DDA.QualityAutomation.Venomous.Part", "roll BIT (Survival) after a hit to apply [POISON]"));
}

if (hasFocusTag || modifier.preciseFocus) {
  parts.push(localizeQ("DDA.QualityAutomation.PreciseFocus.Part", "when this ranged attack costs +1 Action, roll RAM (Precision) for +1/+3/+5 Accuracy"));
}

if (hasMightyTag || modifier.mightyBlow) {
  parts.push(localizeQ("DDA.QualityAutomation.MightyBlow.Part", "after dealing 2+ damage, roll CPU (Feats of Strength) to inflict [STUN]"));
}

if (hasFeintTag || modifier.feintAttack) {
  parts.push(localizeQ("DDA.QualityAutomation.FeintAttack.Part", "may roll BIT (Manipulate) to halve target Dodge; damage is halved unless critical"));
}

if (hasDrainTag || modifier.lifesteal) {
  parts.push(localizeQ("DDA.QualityAutomation.Lifesteal.Part", "heals Wound Boxes equal to damage dealt, up to DOS"));
}

if (hasPunishTag || modifier.punishingStrike) {
  parts.push(localizeQ("DDA.QualityAutomation.PunishingStrike.Part", "can be used as an Interrupt when a target leaves melee reach"));
}

if (hasCounterTag || modifier.counterblow || modifier.crossCounter || modifier.returnFire) {
  parts.push(localizeQ("DDA.QualityAutomation.CounterTag.Part", "restricted to Counterattack and may modify Dodge/Armor depending on the Counter Quality"));
}

if (modifier.reachMode && rangeType === "melee") {
  parts.push(`Melee Reach +${Math.max(0, Number(modifier.reachBonusPerRank ?? 1) * rankValue)}`);
}

if (areaTagsFromQuality.length) {
  parts.push(areaTagsFromQuality.map((tag) => `[${tag.toUpperCase()}]`).join(", "));
  parts.push("can be activated as an Area Attack when declared");
}

    if (accuracyBonus !== 0) {
      parts.push(formatI18n("DDA.Attack.QualityPart.Accuracy", {
        value: accuracyBonus > 0 ? `+${accuracyBonus}` : accuracyBonus
      }));
    }

const displayedDamageBonus = damageBonus - weaponMeleeDamageBonus;

if (displayedDamageBonus !== 0) {
  parts.push(formatI18n("DDA.Attack.QualityPart.Damage", {
    value: displayedDamageBonus > 0 ? `+${displayedDamageBonus}` : displayedDamageBonus
  }));
}

if (weaponIsMelee) {
  const weaponMeleeFoursPart = formatI18n("DDA.Attack.QualityPart.WeaponMeleeFours", {
    value: rankValue
  });

  if (!parts.includes(weaponMeleeFoursPart)) {
    parts.push(weaponMeleeFoursPart);
  }
}

if (weaponMeleeDamageBonus) {
  const meleeDamagePart = formatI18n("DDA.Attack.QualityPart.MeleeDamage", {
    value: `+${weaponMeleeDamageBonus}`
  });

  if (!parts.includes(meleeDamagePart)) {
    parts.push(meleeDamagePart);
  }
}

if (weaponRangeBonus) {
  const rangePart = formatI18n("DDA.Attack.QualityPart.Range", {
    value: `+${weaponRangeBonus}`
  });

  if (!parts.includes(rangePart)) {
    parts.push(rangePart);
  }
}

if (weaponEffectiveLimitBonus) {
  const effectiveLimitPart = formatI18n("DDA.Attack.QualityPart.EffectiveLimit", {
    value: `+${weaponEffectiveLimitBonus}`
  });

  if (!parts.includes(effectiveLimitPart)) {
    parts.push(effectiveLimitPart);
  }
}

if (automaticSuccesses !== 0) {
  parts.push(formatI18n("DDA.Attack.QualityPart.AutomaticSuccesses", {
    value: automaticSuccesses > 0 ? `+${automaticSuccesses}` : automaticSuccesses
  }));
}

if (unalterableDamage !== 0) {
  parts.push(formatI18n("DDA.Attack.QualityPart.UnalterableDamage", {
    value: unalterableDamage > 0 ? `+${unalterableDamage}` : unalterableDamage
  }));
}

if (qualityGrantsPiercingTag || piercingUnalterableDamageRegular > 0 || piercingUnalterableDamageArea > 0) {
  parts.push(localizeQ(
    "DDA.Attack.QualityPart.Piercing",
    "Piercing: +{regular} Unalterable Damage on hit, or +{area} on Area Attacks.",
    {
      regular: piercingUnalterableDamageRegular,
      area: piercingUnalterableDamageArea
    }
  ));

  if (isSignature && modifier.signatureBatteryDamageCanBecomeUnalterable) {
    parts.push(localizeQ(
      "DDA.Attack.QualityPart.PiercingSignatureBattery",
      "Signature Move: Battery damage may become Unalterable Damage, up to this Quality's Ranks, if chosen when the Tag was applied."
    ));
  }
}

if (extraActionCost !== 0) {
  parts.push(formatI18n("DDA.Attack.QualityPart.Cost", {
    value: extraActionCost > 0 ? `+${extraActionCost}` : extraActionCost
  }));
}

if (aggressiveFlankBonus > 0) {
  const flankAllies = aggressiveFlankContext.allyNames?.length
    ? aggressiveFlankContext.allyNames.join(", ")
    : String(aggressiveFlankContext.allies.length);

  parts.push(localizeQ(
    "DDA.QualityAutomation.AggressiveFlank.Bonus",
    "Flank: +{bonus} Accuracy — {allies}.",
    { bonus: aggressiveFlankBonus, allies: flankAllies }
  ));
}

if (effectTag) {
  parts.push(
    getEffectTagLabel(effectTag)
  );
}

for (
  const selectedEffectTag of
  selectedEffectTags
) {
  parts.push(
    getEffectTagLabel(
      selectedEffectTag
    )
  );
}

modifierTotal.qualities.push({
  id: quality.id,
  name: quality.name,
  parts
});
  }

  const bossWeaponExpertExtraActionCost =
    getBossWeaponExpertExtraActionCost(options);

  if (bossWeaponExpertExtraActionCost > 0) {
    modifierTotal.extraActionCost += bossWeaponExpertExtraActionCost;
    modifierTotal.qualities.push({
      id: "boss-weapon-expert-declaration",
      name: combatText("Especialista em Armas", "Weapon Expert"),
      parts: [combatText(
        `Maior Estatística Derivada substitui os Ranks de Arma (+${bossWeaponExpertExtraActionCost} Ação).`,
        `Highest Derived Stat replaces Weapon Ranks (+${bossWeaponExpertExtraActionCost} Action).`
      )]
    });
  }

  const elementalForceData = getElementalForceAttackData(attacker, attackItem);
  if (elementalForceData) {
    modifierTotal.elementalForce = elementalForceData;
    modifierTotal.qualities.push({
      id: elementalForceData.quality.id,
      name: elementalForceData.quality.name,
      parts: [elementalForceData.elementLabel, localizeQ("DDA.QualityAutomation.ElementalForce.Available", "can be triggered for elemental bonus damage")]
    });
  }

  const resolve = getCombatMonsterResolve(attacker);
  if (resolve > 0) {
    modifierTotal.damageBonus += resolve;
    modifierTotal.combatMonsterResolveSpent = resolve;
    const combatMonster = findQuality(attacker, "combatMonster");
    modifierTotal.qualities.push({
      id: combatMonster?.id ?? "combat-monster",
      name: combatMonster?.name ?? localizeQ("DDA.QualityAutomation.CombatMonster.Name", "Combat Monster"),
      parts: [localizeQ("DDA.QualityAutomation.CombatMonster.ResolveDamage", "Resolve +{value} Damage on next hit", { value: resolve })]
    });
  }

  const zonerData = getZonerQualityDataForActor(attacker);

if (zonerData && modifierTotal.areaAttackTags.length) {
  if (zonerData.key) {
    modifierTotal.zonerOptions.push(zonerData.key);
  }

  const zonerParts = [
    zonerData.label || "Zoner"
  ];

  if (zonerData.effect) {
    zonerParts.push(zonerData.effect);
  }

  if (zonerData.key === "bombardment") {
    zonerParts.push("When this [DAMAGE] Area Attack targets everything, Bombardment may prevent the area damage reduction from lowering damage below the Area-derived-stat floor.");
  }

  modifierTotal.qualities.push({
    id: zonerData.quality.id,
    name: zonerData.quality.name,
    parts: zonerParts
  });
}

  modifierTotal.effectTags = [...new Set(modifierTotal.effectTags)];
  modifierTotal.qualityTags = [...new Set(modifierTotal.qualityTags)];

applyDigizoidAttackRules(attacker, attackItem, modifierTotal, options);
modifierTotal.effectTags = [...new Set(modifierTotal.effectTags)];
modifierTotal.qualityTags = [...new Set(modifierTotal.qualityTags)];

if (modifierTotal.longArmsAccuracyPenalty > 0) {
    modifierTotal.accuracyBonus -= modifierTotal.longArmsAccuracyPenalty;
    modifierTotal.qualities.push({
      id: "reach-long-arms",
      name: combatText("Alcance: Braços Longos", "Reach: Long Arms"),
      parts: [combatText(
        `Alvo ${modifierTotal.longArmsAccuracyPenalty} Espaço(s) mais próximo que o Alcance máximo: -${modifierTotal.longArmsAccuracyPenalty} de Precisão.`,
        `Target ${modifierTotal.longArmsAccuracyPenalty} Space(s) closer than maximum Reach: -${modifierTotal.longArmsAccuracyPenalty} Accuracy.`
      )]
    });
  }

  const coordinatedAssault = getCoordinatedAssaultBonus(attacker, options.defender);
  if (coordinatedAssault.bonus > 0) {
    modifierTotal.accuracyBonus += coordinatedAssault.bonus;
    modifierTotal.ignoresUncatchableTarget = true;
    modifierTotal.qualities.push({
      id: "coordinated-assault-mark",
      name: localizeQ("DDA.Quality.CoordinatedAssault", "Coordinated Assault"),
      parts: [localizeQ(
        "DDA.QualityAutomation.CoordinatedAssault.Bonus",
        "Marked target: +{bonus} Accuracy.",
        { bonus: coordinatedAssault.bonus }
      )]
    });
  }

  return modifierTotal;
}

function getSelectedAttackAreaTagsForQuality(
  quality,
  attackItem
) {
  const attackIdentityKeys =
    getAttackIdentityKeys(
      attackItem
    );

  if (!attackIdentityKeys.size) {
    return [];
  }

  const selectedChoices =
    Array.isArray(
      quality?.system
        ?.choices
        ?.selectedRanks
    )
      ? quality.system
          .choices
          .selectedRanks
      : [];

  const tags = [];

  for (const choice of selectedChoices) {
    const choiceData =
      getAttackChoiceIdentity(
        choice
      );

    if (
      !choiceData.attackId ||
      !attackIdentityKeys.has(
        choiceData.attackId
      )
    ) {
      continue;
    }

    const tag =
      normalizeAttackTag(
        choice.attackTag ||
        choiceData.tag
      );

    if (
      tag.startsWith("t:")
    ) {
      tags.push(tag);
    }
  }

  return [
    ...new Set(tags)
  ];
}

function getAttackIdentityKeys(
  attackItem
) {
  return new Set([
    attackItem?.id,

    attackItem?.system
      ?.wizard
      ?.attackKey,

    attackItem?.flags
      ?.[
        "digimon-digital-adventures"
      ]
      ?.wizardAttackKey,

    attackItem?.flags
      ?.[
        "digimon-digital-adventures"
      ]
      ?.enemyBuilderAttackKey
  ]
    .map((value) => {
      return String(
        value ?? ""
      ).trim();
    })
    .filter(Boolean));
}

function getAttackChoiceIdentity(
  choice = {}
) {
  const keyText =
    String(
      choice.key ?? ""
    ).trim();

  const separatorIndex =
    keyText.indexOf(":");

  const keyAttackId =
    separatorIndex > 0
      ? keyText
          .slice(
            0,
            separatorIndex
          )
          .trim()
      : "";

  const keyTag =
    separatorIndex > 0
      ? keyText
          .slice(
            separatorIndex + 1
          )
          .trim()
      : "";

  const directAttackId =
    String(
      choice.attackId ??
      choice.attackItemId ??
      choice.itemId ??
      choice.attackKey ??
      ""
    ).trim();

  return {
    attackId:
      directAttackId ||
      keyAttackId,

    tag:
      String(
        choice.effectTag ??
        choice.attackTag ??
        keyTag
      ).trim()
  };
}

function getSelectedAttackEffectChoicesForQuality(
  quality,
  attackItem
) {
  const attackIdentityKeys =
    getAttackIdentityKeys(
      attackItem
    );

  if (!attackIdentityKeys.size) {
    return [];
  }

  const selectedChoices =
    Array.isArray(
      quality?.system
        ?.choices
        ?.selectedRanks
    )
      ? quality.system
          .choices
          .selectedRanks
      : [];

  const effectOptions =
    Array.isArray(
      quality?.system
        ?.choices
        ?.options
    )
      ? quality.system
          .choices
          .options
      : [];

  const optionByTag =
    new Map(
      effectOptions.map((option) => {
        return [
          normalizeAttackTag(
            option.key
          ),

          option
        ];
      })
    );

  const configuredEffectTags =
    new Set(
      Object.keys(
        CONFIG.DDA?.effectTags ?? {}
      ).map((tag) => {
        return normalizeAttackTag(tag);
      })
    );

  const results = [];

  for (const choice of selectedChoices) {
    const choiceData =
      getAttackChoiceIdentity(
        choice
      );

    if (
      !choiceData.attackId ||
      !attackIdentityKeys.has(
        choiceData.attackId
      )
    ) {
      continue;
    }

    const tag =
      normalizeAttackTag(
        choice.effectTag ||
        choice.attackTag ||
        choiceData.tag
      );

    if (
      !tag ||
      !configuredEffectTags.has(tag)
    ) {
      continue;
    }

    const option =
      optionByTag.get(tag) ?? {};

    results.push({
      tag,

      effectType:
        choice.effectType ??
        option.type ??
        "",

      potencyStat:
        choice.potencyStat ??
        option.potency ??
        "",

      duration:
        choice.duration ??
        option.duration ??
        true,

      extraActionRequired:
        Boolean(
          choice.extraActionRequired ??
          option.extraActionRequired
        ),

      requiresDamageTag:
        Boolean(
          choice.requiresDamageTag ??
          option.requiresDamageTag
        ),

      onlyAffectsAllies:
        Boolean(
          choice.onlyAffectsAllies ??
          option.onlyAffectsAllies
        )
    });
  }

  return results.filter(
    (
      entry,
      index,
      array
    ) => {
      return array.findIndex(
        (candidate) => {
          return (
            candidate.tag ===
            entry.tag
          );
        }
      ) === index;
    }
  );
}

function getZonerQualityDataForActor(actor) {
  const quality = actor?.items?.find((item) => {
    if (item.type !== "quality") return false;

    const sourceId = normalizeQualityChoiceKeyForAttack(
      item.system?.sourceId ??
      item.system?.id ??
      item.name
    );

    const nameKey = normalizeQualityChoiceKeyForAttack(item.name);

    return (
      sourceId === "zonista" ||
      sourceId === "zoner" ||
      nameKey === "zonista" ||
      nameKey === "zoner"
    );
  });

  if (!quality) return null;

  const selectedChoices = [
    ...(Array.isArray(quality.system?.choices?.selectedRanks) ? quality.system.choices.selectedRanks : []),
    ...(Array.isArray(quality.system?.choices?.selected) ? quality.system.choices.selected : [])
  ];

  const selectedChoice = selectedChoices[0] ?? null;

  const key = normalizeQualityChoiceKeyForAttack(
    selectedChoice?.key ??
    selectedChoice?.value ??
    selectedChoice?.id ??
    ""
  );

  if (!key) return null;

  return {
    quality,
    key,
    label: selectedChoice?.label ?? selectedChoice?.originalLabel ?? key,
    effect: selectedChoice?.effect ?? ""
  };
}

function hasZonerOption(qualityAttackModifier, optionKey = "") {
  const normalizedOptionKey = normalizeQualityChoiceKeyForAttack(optionKey);

  return (qualityAttackModifier?.zonerOptions ?? []).some((option) => {
    return normalizeQualityChoiceKeyForAttack(option) === normalizedOptionKey;
  });
}

function getZonerBombardmentDamageFloor({
  attacker,
  qualityAttackModifier,
  areaAttackDeclaration,
  damageAfterArmor = 0
} = {}) {
  if (!areaAttackDeclaration?.active) return 0;
  if (areaAttackDeclaration?.targetMode !== "all") return 0;
  if (!hasZonerOption(qualityAttackModifier, "bombardment")) return 0;

  const derivedStatKey = getAreaAttackDerivedStatKey(areaAttackDeclaration.tag);
  if (!derivedStatKey) return 0;

  const derivedStatTotal = getActorDerivedStatTotal(attacker, derivedStatKey);
  const currentDamageAfterArmor = Math.max(0, Number(damageAfterArmor ?? 0));

  return Math.min(currentDamageAfterArmor, derivedStatTotal);
}

function getAreaAttackDerivedStatKey(areaTag = "") {
  const tag = normalizeAttackTag(areaTag);

  const map = {
    "t:blast": "bit",
    "t:burst": "dos",
    "t:cone": "bit",
    "t:line": "cpu",
    "t:pass": "ram",
    "t:wave": "dos"
  };

  return map[tag] ?? "";
}

function getActorDerivedStatTotal(actor, statKey = "") {
  const key = String(statKey ?? "").trim().toLowerCase();
  if (!key) return 0;

  const stat = actor?.system?.derivedStats?.[key];

  const value = Number(
    stat?.total ??
    stat?.value ??
    stat?.base ??
    0
  );

  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function getAppliedAttackQualityRankValue(quality) {
  const rankValue = Math.max(0, Number(quality.system?.rank?.value ?? 1));
  const effectiveMax = Number(quality.system?.rank?.effectiveMax ?? Number.NaN);

if (Number.isFinite(effectiveMax) && effectiveMax >= 0) {
  return Math.min(rankValue, effectiveMax);
}

  return rankValue;
}

function getDataOptimizationAttackModifier(attacker, attackItem, context = {}) {
  const dataOptimization = attacker.system?.qualityFeatures?.dataOptimization ?? {};

  const rangeType = context.rangeType ?? attackItem.system.baseTags?.rangeType ?? "";
  const functionType = context.functionType ?? attackItem.system.baseTags?.functionType ?? "";
  const defender = context.defender ?? null;
  const clashContext = context.clashContext ?? {};

  let accuracyBonus = 0;
  let damageBonus = 0;
  let rangeBonus = 0;
  let effectiveLimitBonus = 0;

  const parts = [];

  if (dataOptimization.closeCombat && rangeType === "melee") {
    const targetIsWounded = isActorMissingWoundBoxes(defender);
    const closeCombatBonus = targetIsWounded
      ? Number(dataOptimization.closeCombatWoundedTargetAccuracyBonus ?? 3)
      : Number(dataOptimization.closeCombatAccuracyBonus ?? 1);

    accuracyBonus += closeCombatBonus;

    parts.push(formatI18n("DDA.Attack.QualityPart.Accuracy", {
      value: closeCombatBonus > 0 ? `+${closeCombatBonus}` : closeCombatBonus
    }));
  }

  if (dataOptimization.rangedStriker && ["range", "ranged"].includes(rangeType)) {
    const rangedAccuracyBonus = Number(dataOptimization.rangedStrikerAccuracyBonus ?? 1);
    const rangedRangeBonus = Number(dataOptimization.rangedStrikerRangeBonus ?? 2);
    const rangedEffectiveLimitBonus = Number(dataOptimization.rangedStrikerEffectiveLimitBonus ?? 2);

    accuracyBonus += rangedAccuracyBonus;
    rangeBonus += rangedRangeBonus;
    effectiveLimitBonus += rangedEffectiveLimitBonus;

    parts.push(formatI18n("DDA.Attack.QualityPart.Accuracy", {
      value: rangedAccuracyBonus > 0 ? `+${rangedAccuracyBonus}` : rangedAccuracyBonus
    }));

    parts.push(formatI18n("DDA.Attack.QualityPart.Range", {
      value: rangedRangeBonus > 0 ? `+${rangedRangeBonus}` : rangedRangeBonus
    }));

    parts.push(formatI18n("DDA.Attack.QualityPart.EffectiveLimit", {
      value: rangedEffectiveLimitBonus > 0 ? `+${rangedEffectiveLimitBonus}` : rangedEffectiveLimitBonus
    }));
  }

  if (
    dataOptimization.brawler &&
    functionType === "damage" &&
    isClashAttackContext(clashContext)
  ) {
    const brawlerDamageBonus = Number(dataOptimization.brawlerClashDamageBonus ?? 1);

    damageBonus += brawlerDamageBonus;

    parts.push(formatI18n("DDA.Attack.QualityPart.Damage", {
      value: brawlerDamageBonus > 0 ? `+${brawlerDamageBonus}` : brawlerDamageBonus
    }));
  }

  const wrestlemaniaDamageBonus = Math.max(
    0,
    Number(clashContext?.wrestlemaniaDamageBonus ?? 0)
  );

  if (functionType === "damage" && wrestlemaniaDamageBonus > 0) {
    damageBonus += wrestlemaniaDamageBonus;
    parts.push(`${combatText("Wrestlemania", "Wrestlemania")}: ${formatI18n("DDA.Attack.QualityPart.Damage", {
      value: `+${wrestlemaniaDamageBonus}`
    })}`);
  }

  if (
    accuracyBonus === 0 &&
    damageBonus === 0 &&
    rangeBonus === 0 &&
    effectiveLimitBonus === 0
  ) {
    return null;
  }

  const quality = getDataOptimizationQuality(attacker);
  const choiceLabel = dataOptimization.choiceLabel || getDataOptimizationChoiceLabel(quality);

  return {
    accuracyBonus,
    damageBonus,
    rangeBonus,
    effectiveLimitBonus,
    quality: {
      id: quality?.id ?? "data-optimization",
      name: quality?.name ?? localize("DDA.Quality.DataOptimization"),
      parts: [
        choiceLabel,
        ...parts
      ].filter(Boolean)
    }
  };
}

function getDataSpecializationAttackModifier(attacker, attackItem, context = {}) {
  const feature = getDataSpecializationFeature(attacker);
  const rangeType = String(
    context.rangeType ?? attackItem?.system?.baseTags?.rangeType ?? ""
  ).trim().toLowerCase();
  const functionType = String(
    context.functionType ?? attackItem?.system?.baseTags?.functionType ?? ""
  ).trim().toLowerCase();
  const attackTags = getAttackQualityTags(attackItem);
  const movementSpent = getCurrentMovementSpent(attacker);

  let damageBonus = 0;
  let rangeBonus = 0;
  let effectiveLimitBonus = 0;
  const parts = [];

  if (feature.sniper && ["range", "ranged"].includes(rangeType)) {
    rangeBonus += Number(feature.rangedRangeBonus ?? 3);
    effectiveLimitBonus += Number(feature.rangedEffectiveLimitBonus ?? 3);
    parts.push(combatText(
      `Franco-Atirador: +${rangeBonus} Alcance e Limite Efetivo.`,
      `Sniper: +${rangeBonus} Range and Effective Limit.`
    ));
  }

  const usesChargeOrRecoil = attackTags.has("charge") || attackTags.has("recoil");
  if (
    feature.hitAndRunChargeRecoil &&
    functionType === "damage" &&
    usesChargeOrRecoil &&
    movementSpent >= 2
  ) {
    const ram = Math.max(0, getActorDerivedStat(attacker, "ram"));
    damageBonus += ram;
    parts.push(combatText(
      `Bater e Correr: +${ram} Dano por mover ${movementSpent} Espaços antes do Ataque.`,
      `Hit and Run: +${ram} Damage after moving ${movementSpent} Spaces before the Attack.`
    ));
  }

  const hasAnyEffect = Boolean(
    damageBonus ||
    rangeBonus ||
    effectiveLimitBonus ||
    feature.fistfulOfForce ||
    feature.mobileArtillery ||
    feature.codeWizardDamageTagBypass
  );
  if (!hasAnyEffect) return null;

  return {
    damageBonus,
    rangeBonus,
    effectiveLimitBonus,
    movementSpent,
    fistfulOfForce: Boolean(feature.fistfulOfForce),
    mobileArtillery: Boolean(feature.mobileArtillery),
    sniper: Boolean(feature.sniper),
    codeWizardDamageTagBypass: Boolean(feature.codeWizardDamageTagBypass),
    quality: {
      id: "data-specialization",
      name: feature.sourceName || combatText("Especialização de Dados", "Data Specialization"),
      parts
    }
  };
}

function getDataOptimizationQuality(actor) {
  return actor.items.find((item) => {
    if (item.type !== "quality") return false;

    const sourceId = String(
      item.system?.sourceId ??
      item.system?.id ??
      item.flags?.["digimon-digital-adventures"]?.sourceId ??
      ""
    ).trim();

    const normalizedSourceId = normalizeQualityChoiceKeyForAttack(sourceId);
    const normalizedName = normalizeQualityChoiceKeyForAttack(item.name);

    return (
      sourceId === "otimizacaoDeDados" ||
      sourceId === "dataOptimization" ||
      normalizedSourceId === "dataoptimization" ||
      normalizedSourceId === "otimizacaodedados" ||
      normalizedName === "dataoptimization" ||
      normalizedName === "otimizacaodedados"
    );
  });
}

function getDataOptimizationChoiceLabel(quality) {
  const selectedChoices = [
    ...(Array.isArray(quality?.system?.choices?.selectedRanks) ? quality.system.choices.selectedRanks : []),
    ...(Array.isArray(quality?.system?.choices?.selected) ? quality.system.choices.selected : [])
  ];

  const selectedChoice = selectedChoices[0];
  const selectedKey = String(
    selectedChoice?.key ??
    selectedChoice?.value ??
    selectedChoice?.id ??
    ""
  ).trim();

  const optionData = quality?.system?.choices?.options?.find((option) => {
    return normalizeQualityChoiceKeyForAttack(option.key) === normalizeQualityChoiceKeyForAttack(selectedKey);
  });

  return String(
    selectedChoice?.label ??
    optionData?.label ??
    optionData?.originalLabel ??
    ""
  ).trim();
}

function normalizeQualityChoiceKeyForAttack(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function isActorMissingWoundBoxes(actor) {
  if (!actor) return false;

  const wounds = actor.type === "character"
    ? actor.system?.derived?.wounds
    : actor.system?.miscStats?.wounds;

  const value = Number(wounds?.value ?? 0);
  const max = Number(wounds?.max ?? 0);

  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return false;
  }

  return value < max;
}

function isClashAttackContext(clashContext = {}) {
  return Boolean(
    clashContext.active ||
    clashContext.enabled ||
    clashContext.isClash ||
    clashContext.weakAttack ||
    clashContext.opponent ||
    clashContext.opponentUuid ||
    clashContext.targetInClash
  );
}

function getAttackQualityTags(attackItem) {
  const tags = new Set();

  for (const tag of attackItem.system?.qualityTags ?? []) tags.add(normalizeAttackTag(tag));
  for (const tag of attackItem.system?.tags ?? []) tags.add(normalizeAttackTag(tag));
  for (const tag of attackItem.system?.baseTags?.tags ?? []) tags.add(normalizeAttackTag(tag));

  const baseTags = attackItem.system?.baseTags ?? {};
  if (baseTags.rangeType) tags.add(normalizeAttackTag(baseTags.rangeType));
  if (baseTags.functionType) tags.add(normalizeAttackTag(baseTags.functionType));

  return tags;
}

const DIRECT_AREA_ATTACK_TAGS = new Set([
  "t:blast",
  "t:burst",
  "t:cone",
  "t:line",
  "t:pass",
  "t:wave"
]);

function getDirectAreaAttackTags(attackItem) {
  return [...getAttackQualityTags(attackItem)].filter((tag) => {
    return DIRECT_AREA_ATTACK_TAGS.has(tag);
  });
}

function normalizeAttackTag(value = "") {
  if (value && typeof value === "object") {
    value =
      value.tag ??
      value.key ??
      value.value ??
      value.id ??
      value.slug ??
      value.name ??
      value.label ??
      "";
  }

  return String(value ?? "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
}

function hasChargeAttackBinding(attacker, attackItem, directTags = null) {
  const tags = directTags instanceof Set
    ? directTags
    : getAttackQualityTags(attackItem);

  if (tags.has("charge")) return true;

  const attackIdentityKeys = new Set([
    ...getAttackIdentityKeys(attackItem),
    attackItem?.uuid
  ].filter(Boolean).map(String));
  const attackNameKey = normalizeQualityChoiceKeyForAttack(attackItem?.name ?? "");

  for (const quality of attacker?.items ?? []) {
    if (quality.type !== "quality") continue;

    const grantsCharge = (quality.system?.attackModifier?.grantsTags ?? [])
      .map(normalizeAttackTag)
      .includes("charge");
    const qualityKey = normalizeQualityChoiceKeyForAttack(
      quality.system?.sourceId ??
      quality.system?.id ??
      quality.system?.originalName ??
      quality.name
    );
    const isChargeQuality = grantsCharge || [
      "chargeattack",
      "ataquedeinvestida"
    ].includes(qualityKey);

    if (!isChargeQuality) continue;

    const choices = [
      ...(Array.isArray(quality.system?.choices?.selectedRanks)
        ? quality.system.choices.selectedRanks
        : []),
      ...(Array.isArray(quality.system?.choices?.selected)
        ? quality.system.choices.selected
        : [])
    ];

    for (const rawChoice of choices) {
      const choice = rawChoice && typeof rawChoice === "object"
        ? rawChoice
        : { key: rawChoice };
      const keyText = String(choice.key ?? "").trim();
      const separatorIndex = keyText.indexOf(":");
      const keyAttackId = separatorIndex > 0
        ? keyText.slice(0, separatorIndex).trim()
        : keyText;
      const keyTag = separatorIndex > 0
        ? normalizeAttackTag(keyText.slice(separatorIndex + 1))
        : "";
      const choiceTag = normalizeAttackTag(
        choice.attackTag ??
        choice.effectTag ??
        choice.grantedTag ??
        keyTag
      );

      if (choiceTag && choiceTag !== "charge") continue;

      const choiceIds = [
        choice.attackId,
        choice.attackItemId,
        choice.itemId,
        choice.attackKey,
        choice.id,
        keyAttackId
      ].filter(Boolean).map(String);

      if (choiceIds.some((id) => attackIdentityKeys.has(id))) return true;

      const choiceAttackName = String(
        choice.attackName ??
        choice.originalLabel ??
        choice.label ??
        ""
      ).split(/\s+[—-]\s+\[/)[0];

      if (
        attackNameKey &&
        normalizeQualityChoiceKeyForAttack(choiceAttackName) === attackNameKey
      ) {
        return true;
      }
    }
  }

  return false;
}

function qualityModifierAppliesToAttack(quality, modifier, attackItem, context) {
  const appliesTo = String(modifier.appliesTo ?? "").trim();
  const grantsTags = context.grantsTags ?? [];
  const attackQualityTags = context.attackQualityTags ?? new Set();
  const selectedChoices = Array.isArray(quality.system?.choices?.selectedRanks)
    ? quality.system.choices.selectedRanks
    : [];
const selectedAttackIds = selectedChoices
  .flatMap((choice) => {
    const directId = String(
      choice.attackId
      ?? choice.attackItemId
      ?? choice.itemId
      ?? choice.attackKey
      ?? choice.id
      ?? ""
    ).trim();

    const keyText = String(
      choice.key ?? ""
    ).trim();

    const keyAttackId = keyText.includes(":")
      ? keyText.split(":")[0]
      : keyText;

    return [
      directId,
      keyAttackId
    ].filter(Boolean);
  })
  .filter(Boolean);

const attackIdentityKeys =
  getAttackIdentityKeys(
    attackItem
  );

const hasExplicitAttackSelection =
  selectedAttackIds.length > 0;

const attackMatchesExplicitSelection =
  hasExplicitAttackSelection &&
  selectedAttackIds.some((attackId) => {
    return attackIdentityKeys.has(attackId);
  });

const hasGrantedTagOnAttack = grantsTags.some(
  (tag) => attackQualityTags.has(tag)
);

if (appliesTo === "weaponAttacks") {
  if (attackQualityTags.has("weapon") || attackQualityTags.has("offhand")) return true;
  return (quality.parent?.items ?? []).some((item) => {
    if (item.type !== "quality") return false;
    const source = normalizeQualityChoiceKeyForAttack(item.system?.sourceId ?? item.system?.originalName ?? item.name);
    if (!["arma", "weapon", "armamentodedigizoidepuro", "puredigizoidweaponry"].includes(source)) return false;
    const choices = [
      ...(Array.isArray(item.system?.choices?.selectedRanks) ? item.system.choices.selectedRanks : []),
      ...(Array.isArray(item.system?.choices?.selected) ? item.system.choices.selected : [])
    ];
    return choices.some((choice) => {
      const key = String(choice?.key ?? "").trim();
      const attackId = String(choice?.attackId ?? choice?.attackItemId ?? choice?.itemId ?? choice?.attackKey ?? (key.includes(":") ? key.slice(0, key.indexOf(":")) : key)).trim();
      return attackIdentityKeys.has(attackId);
    });
  });
}

  if (attackMatchesExplicitSelection) return true;

  /*
 * Efeito Básico/Avançado jamais deve vazar
 * para outro Ataque somente porque a definição
 * da Qualidade contém aquela Tag.
 */
if (
  appliesTo ===
  "oneAttackPerPurchasedEffect"
) {
  return false;
}

  if (["oneAttack", "oneDamageAttack", "oneMeleeAttack", "oneRangedAttack", "oneMeleeDamageAttack", "differentAttackPerRank", "taggedAttack"].includes(appliesTo)) {
    if (!hasGrantedTagOnAttack) return false;
  }

  if (appliesTo === "oneDamageAttack" && context.functionType !== "damage") return false;
  if (appliesTo === "oneMeleeAttack" && context.rangeType !== "melee") return false;
  if (appliesTo === "oneRangedAttack" && !["range", "ranged"].includes(context.rangeType)) return false;
  if (appliesTo === "oneMeleeDamageAttack" && (context.rangeType !== "melee" || context.functionType !== "damage")) return false;
if (appliesTo === "differentAttackPerRank") {
  return attackMatchesExplicitSelection || hasGrantedTagOnAttack;
}
  if (appliesTo === "taggedAttack") return hasGrantedTagOnAttack;

  if (!appliesTo && grantsTags.length) return hasGrantedTagOnAttack;
  if (!appliesTo) return Boolean(modifier.enabled);

  return (
    appliesTo === "all" ||

    appliesTo === context.rangeType ||

    appliesTo === context.functionType ||

    (
      [
        "signature",
        "signatureMove"
      ].includes(appliesTo) &&
      context.isSignature
    ) ||

    (
      appliesTo === "melee" &&
      context.rangeType === "melee"
    ) ||

    (
      ["range", "ranged"].includes(
        appliesTo
      ) &&
      ["range", "ranged"].includes(
        context.rangeType
      )
    )
  );
}

function buildRangePositioningPenaltyLabel(targeting = {}, english = false) {
  const beyondRangePenalty = Math.max(
    0,
    Number(targeting.beyondRangePenalty ?? 0)
  );

  const adjacentEnemyPenalty = Math.max(
    0,
    Number(targeting.adjacentEnemyPenalty ?? 0)
  );

  const totalPenalty = beyondRangePenalty + adjacentEnemyPenalty;

  if (totalPenalty <= 0) return "";

  const parts = [];

  if (beyondRangePenalty > 0) {
    parts.push(
      english
        ? `${beyondRangePenalty} space${beyondRangePenalty === 1 ? "" : "s"} beyond Range: -${beyondRangePenalty}`
        : `${beyondRangePenalty} Espaço${beyondRangePenalty === 1 ? "" : "s"} além do Alcance: -${beyondRangePenalty}`
    );
  }

  if (adjacentEnemyPenalty > 0) {
    parts.push(
      english
        ? `Adjacent enemy: -${adjacentEnemyPenalty}`
        : `Inimigo adjacente: -${adjacentEnemyPenalty}`
    );
  }

  return english
    ? `Accuracy Penalty ${-totalPenalty} (${parts.join(" • ")})`
    : `Penalidade de Precisão ${-totalPenalty} (${parts.join(" • ")})`;
}

function getAccuracyExternalLabel(
  isSignature,
  currentBattery,
  attributeAdvantageData,
  multiattackPenalty = 0,
  qualityAttackModifier = null,
  attackerEffectModifiers = null,
  customAccuracyModifier = 0
) {
  const labels = [];

  if (customAccuracyModifier !== 0) {
    labels.push(localize("DDA.Attack.Modifier.BaseFormula"));
  }

  if (isSignature && currentBattery > 0) {
    labels.push(localize("DDA.Resource.Battery"));
  }

  if (attributeAdvantageData.extraAccuracyDice > 0) {
    labels.push(localize("DDA.Attack.AttributeAdvantage"));
  }

  if (multiattackPenalty < 0) {
    labels.push(localize("DDA.Attack.Multiattack"));
  }

  if (qualityAttackModifier?.accuracyBonus) {
    labels.push(localize("DDA.Attack.Qualities"));
  }

  if (attackerEffectModifiers?.accuracyDice) {
    labels.push(localize("DDA.Attack.ActiveEffects"));
  }

  if (qualityAttackModifier?.effectAccuracyBonus) {
    labels.push(localize("DDA.Attack.ActiveEffects"));
  }

  return labels.join(" + ");
}

function getAccuracyModifierBreakdown({
  isSignature = false,
  currentBattery = 0,
  attributeAdvantageData = {},
  multiattackPenalty = 0,
  qualityAttackModifier = {},
  attackerEffectModifiers = {},
  customAccuracyModifier = 0,
  attackOptionModifier = 0,
  declaredQualityBonus = 0
} = {}) {
  const entries = [];
  const add = (label, value = null, kind = "external", detail = false) => {
    if (!label) return;
    if (value !== null && (!Number.isFinite(Number(value)) || Number(value) === 0)) return;
    entries.push({ label, value: value === null ? null : Number(value), kind, detail });
  };

  add(localize("DDA.Attack.Modifier.BaseFormula"), customAccuracyModifier, "formula");
  if (isSignature) add(localize("DDA.Resource.Battery"), currentBattery, "battery");
  add(localize("DDA.Attack.AttributeAdvantage"), attributeAdvantageData.extraAccuracyDice, "attribute");
  add(localize("DDA.Attack.Multiattack"), multiattackPenalty, "penalty");
  add(combatText("Modificador do Ataque", "Attack Modifier"), attackOptionModifier, "attack-option");

  const qualityBonus = Number(qualityAttackModifier.accuracyBonus ?? 0) + Number(declaredQualityBonus ?? 0);
  add(localize("DDA.Attack.Qualities"), qualityBonus, "quality-total");

  const seenQualities = new Set();
  for (const quality of qualityAttackModifier.qualities ?? []) {
    const name = String(quality?.name ?? "").trim();
    const key = String(quality?.id ?? name).trim().toLowerCase();
    if (!name || seenQualities.has(key)) continue;
    seenQualities.add(key);
    add(name, null, "quality", true);
  }

  add(localize("DDA.Attack.ActiveEffects"), attackerEffectModifiers.accuracyDice, "effect");
  return entries;
}

function getAttackEffectDefinition({
  attacker,
  attackItem,
  tag
} = {}) {
  const normalizedTag =
    normalizeAttackTag(tag);

  const fallback =
    EFFECT_TAGS?.[normalizedTag] ?? {};

  /*
   * Efeito configurado diretamente no Attack.
   */
  const directEffect =
    attackItem?.system?.effectTag ?? {};

  if (
    directEffect.enabled &&
    normalizeAttackTag(
      directEffect.tag
    ) === normalizedTag
  ) {
    return {
      tag: normalizedTag,

      effectType: String(
        directEffect.type ||
        fallback.type ||
        ""
      )
        .trim()
        .toLowerCase(),

      potencyStat: String(
        directEffect.potencyStat ||
        fallback.potency ||
        ""
      )
        .trim()
        .toLowerCase(),

      /*
       * Não usar !== false aqui.
       * É necessário preservar "special".
       */
      duration:
        directEffect.duration ??
        fallback.duration ??
        true,

      onlyAffectsAllies: Boolean(
        directEffect.onlyAffectsAllies ?? fallback.alliesOnly
      ),
      requiresDamageTag: Boolean(
        directEffect.requiresDamageTag ?? fallback.requiresDamage
      ),
      bossEffect: Boolean(directEffect.bossEffect),
      selectedAttribute: String(directEffect.selectedAttribute ?? ""),
      maximumDuration: Number.isFinite(Number(directEffect.maximumDuration))
        ? Math.max(0, Number(directEffect.maximumDuration))
        : null,
      requiresSupportTag: Boolean(directEffect.requiresSupportTag),
      requiresSignature: Boolean(directEffect.requiresSignature),
      forbidsAreaAttack: Boolean(directEffect.forbidsAreaAttack)
    };
  }

  /*
   * Efeito comprado por uma Effect Quality.
   */
  for (
    const quality of
    attacker?.items ?? []
  ) {
    if (quality.type !== "quality") {
      continue;
    }

    const selectedEffect =
      getSelectedAttackEffectChoicesForQuality(
        quality,
        attackItem
      ).find((choice) => {
        return (
          normalizeAttackTag(
            choice?.tag
          ) === normalizedTag
        );
      });

    if (!selectedEffect) {
      continue;
    }

    return {
      tag: normalizedTag,

      effectType: String(
        selectedEffect.effectType ||
        fallback.type ||
        ""
      )
        .trim()
        .toLowerCase(),

      potencyStat: String(
        selectedEffect.potencyStat ||
        fallback.potency ||
        ""
      )
        .trim()
        .toLowerCase(),

      duration:
        selectedEffect.duration ??
        fallback.duration ??
        true,

      onlyAffectsAllies: Boolean(
        selectedEffect.onlyAffectsAllies ?? fallback.alliesOnly
      ),
      requiresDamageTag: Boolean(
        selectedEffect.requiresDamageTag ?? fallback.requiresDamage
      )
    };
  }

  /*
   * Compatibilidade com Attacks antigos que
   * armazenavam somente a Tag.
   */
  return {
    tag: normalizedTag,

    effectType: String(
      fallback.type ?? ""
    )
      .trim()
      .toLowerCase(),

    potencyStat: String(
      fallback.potency ?? ""
    )
      .trim()
      .toLowerCase(),

    duration:
      fallback.duration ?? true,
    onlyAffectsAllies: Boolean(fallback.alliesOnly),
    requiresDamageTag: Boolean(fallback.requiresDamage)
  };
}

function getAttackEffectPotencyBonus(
  attacker,
  attackItem,
  {
    includeEffectWarrior = true
  } = {}
) {
  let total = 0;

  /*
   * Support Signature Moves may scale Potency
   * with the current Battery.
   */
  const functionType = String(
    attackItem?.system?.baseTags?.functionType ?? ""
  ).trim().toLowerCase();
  const rangeType = String(
    attackItem?.system?.baseTags?.rangeType ?? ""
  ).trim().toLowerCase();

  if (
    attackItem?.system?.isSignature &&
    functionType === "support"
  ) {
    total += Math.max(
      0,
      Number(
        attacker?.system?.resources
          ?.battery?.value ?? 0
      )
    );
  }

  /* [MELEE][SUPPORT] receives +1 Potency for the risk of touch range. */
  if (functionType === "support" && rangeType === "melee") {
    total += 1;
  }

  /*
   * Data Optimization: Effect Warrior.
   */
  const dataOptimization =
    attacker?.system?.qualityFeatures
      ?.dataOptimization ?? {};

  if (
  includeEffectWarrior &&
  dataOptimization.effectWarrior
) {
    total += Math.max(
      0,
      Number(
        dataOptimization
          .effectWarriorPotencyBonus ??
        1
      )
    );
  }


  const isSignature = Boolean(
    attackItem?.system?.isSignature
  );

  const attackQualityTags =
    getAttackQualityTags(
      attackItem
    );

  /*
   * Qualities such as Chrome Digizoid
   * Weaponry may grant Potency to qualifying
   * Attacks.
   */
  for (
    const quality of
    attacker?.items ?? []
  ) {
    if (quality.type !== "quality") {
      continue;
    }

    const modifier =
      quality.system
        ?.attackModifier ?? {};

    const potencyBonus = Number(
      modifier.effectPotencyBonus ?? 0
    );

    if (!potencyBonus) {
      continue;
    }

    const grantsTags =
      Array.isArray(
        modifier.grantsTags
      )
        ? modifier.grantsTags
            .map(normalizeAttackTag)
            .filter(Boolean)
        : [];

    if (
      !qualityModifierAppliesToAttack(
        quality,
        modifier,
        attackItem,
        {
          rangeType,
          functionType,
          isSignature,
          attackQualityTags,
          grantsTags
        }
      )
    ) {
      continue;
    }

    total += potencyBonus;
  }

  return Math.max(
    0,
    total
  );
}

function getAttackEffectApplication({
  hit,
  attackItem,
  activeEffectTags,
  normalDamage,
  leftoverSuccesses = 0,
  attacker,
  defender,
  cleanseDeclaration = null,
  targetIsAlly = false,
  targetIsWilling = false,
  positiveTargetHealthSuccesses = 0,
  cleanseTargetHealthSuccesses = 0,
  forcedMovementTargetHealthSuccesses = 0,
  confuseAffectedStat = "",
  accuracySuccesses = 0,
  qualityAttackModifier = {},
  areaAttackDeclaration = null,
  isSignatureAttack = Boolean(attackItem?.system?.isSignature),
  ignoreEffectResistance = false,
  additionalDurationPenalty = 0,
  effectResistanceMultiplier = 1,
  effectResistanceCanNegate = false
}) {
  
  const functionType = attackItem.system.baseTags?.functionType ?? "";
  const effectTagLabels = CONFIG.DDA?.effectTags ?? {};

  const result = {
    applied: [],
    reason: ""
  };

  const fragilePotencyPenalty = Math.max(
    0,
    Number(
      qualityAttackModifier
        ?.fragileEffectPotencyPenalty ?? 0
    ) + Math.max(0, Number(qualityAttackModifier?.luckyMissEffectPenalty ?? 0))
  );

  const fragileDurationPenalty = Math.max(
    0,
    Number(
      qualityAttackModifier
        ?.fragileEffectDurationPenalty ?? 0
    )
  );

  const effectPotencyBonus =
    getAttackEffectPotencyBonus(
      attacker,
      attackItem
    ) + Math.max(0, Number(qualityAttackModifier?.effectPotencyBonus ?? 0));

  if (!activeEffectTags.length) {
    result.reason = localize("DDA.Attack.EffectReason.NoEffectTags");
    return result;
  }

  if (!hit) {
    result.reason = localize("DDA.Attack.EffectReason.AttackMissed");
    return result;
  }

  if (
  attacker?.uuid &&
  attacker.uuid === defender?.uuid
) {
  result.reason = combatText(
    "O Conjurador não pode aplicar uma Tag de Efeito de Ataque em si mesmo.",
    "The Caster cannot apply an Attack Effect Tag to itself."
  );

  return result;
}

  const areaEffectMinimumDamage = Math.max(
    0,
    Number(qualityAttackModifier?.areaEffectMinimumDamage ?? 0)
  );

  if (
    functionType === "damage" &&
    areaEffectMinimumDamage > 0 &&
    normalDamage < areaEffectMinimumDamage
  ) {
    result.reason = combatText(
      `Artilharia Móvel exige ao menos ${areaEffectMinimumDamage} de Dano para aplicar Tags de Efeito a um alvo no Tamanho Base.`,
      `Mobile Artillery requires at least ${areaEffectMinimumDamage} Damage to apply Effect Tags to a Base Size target.`
    );
    return result;
  }

  if (functionType === "damage" && normalDamage < 2) {
    result.reason = localize("DDA.Attack.EffectReason.NotEnoughNormalDamage");
    return result;
  }

const bossImmunityEffectTags = getBossImmunityEffectTags(defender);

for (const tag of activeEffectTags) {
  const label =
    getEffectTagLabel(tag);

  const effectKey =
    getEffectTagKey(tag);

  if (bossImmunityEffectTags.has(normalizeKey(effectKey))) {
    result.reason = combatText(
      `Imunidade de Chefe negou [${String(effectKey).toUpperCase()}].`,
      `Boss Immunity negated [${String(effectKey).toUpperCase()}].`
    );
    continue;
  }

  if (
    effectKey === "blind" &&
    (
      hasQuality(defender, "justiceIsBlind") ||
      isBossTrueSightObserver(defender)
    )
  ) {
    result.reason = isBossTrueSightObserver(defender)
      ? combatText("Visão Verdadeira negou [BLIND].", "True Sight negated [BLIND].")
      : result.reason;
    continue;
  }

  const effectDefinition =
    getAttackEffectDefinition({
      attacker,
      attackItem,
      tag
    });

  if (effectDefinition.onlyAffectsAllies && !targetIsAlly) {
    continue;
  }

  if (effectKey === "demoralize" && (functionType !== "support" || defender?.type !== "character")) {
    result.reason = combatText(
      "[DEMORALIZE] exige um Ataque [SUPPORT] e só pode ter um Tamer como alvo.",
      "[DEMORALIZE] requires a [SUPPORT] Attack and can only target a Tamer."
    );
    continue;
  }

  if (effectDefinition.requiresSignature && !isSignatureAttack) {
    result.reason = combatText("Este Efeito exige um Movimento Assinatura.", "This Effect requires a Signature Move.");
    continue;
  }

  if (effectDefinition.forbidsAreaAttack && areaAttackDeclaration?.active) {
    result.reason = combatText("Este Efeito não pode ser usado com Ataque de Área.", "This Effect cannot be used with an Area Attack.");
    continue;
  }
  const hasCodeWizard = Boolean(
    attacker?.system?.qualityFeatures?.dataSpecialization?.codeWizardDamageTagBypass
  );

  if (effectDefinition.requiresDamageTag && functionType !== "damage" && !hasCodeWizard) {
    continue;
  }

const effectCalculation =
  calculateAttackEffectValues({
    attacker,
    defender,
    attackItem,
    effectDefinition,
    effectKey,
    leftoverSuccesses,
    targetIsAlly,
    targetIsWilling,
    positiveTargetHealthSuccesses,
    forcedMovementTargetHealthSuccesses,
    confuseAffectedStat,
    accuracySuccesses,
    areaAttackDeclaration,
    fragilePotencyPenalty,
    fragileDurationPenalty: fragileDurationPenalty + Math.max(0, Number(additionalDurationPenalty ?? 0)),
    ignoreEffectResistance,
    effectResistanceMultiplier,
    effectResistanceCanNegate
  });

const {
  effectType,
  potencyStat,
  sourceStat,
  affectedStat,

  usesPotency,
  usePotencyValue,

  basePotency,
  potencyBonus,
  resistance,

  potency,
  value,

  durationRule,
  hasDuration,
  hasSpecialDuration,

  duration: rawDuration,
  maxDuration,

  areaEffectPenalty
} = effectCalculation;

const immuneDurationPenalty = ignoreEffectResistance
  ? 0
  : getIncomingEffectDurationPenalty(
      defender,
      effectType
    );

const adjustedDuration = hasDuration && rawDuration > 0 && immuneDurationPenalty > 0
  ? Math.max(1, rawDuration - immuneDurationPenalty)
  : rawDuration;

const digizoidDuration = effectKey === "heavy" && Number(qualityAttackModifier?.heavyDigizoidDuration ?? 0) > 0
  ? Number(qualityAttackModifier.heavyDigizoidDuration)
  : hasDuration
    ? Math.max(0, Number(adjustedDuration ?? 0) + Math.max(0, Number(qualityAttackModifier?.effectDurationBonus ?? 0)))
    : adjustedDuration;

const effectData = {
  id: foundry.utils.randomID(),

  tag,
  label,

  sourceAttackId:
    attackItem.id,

  sourceAttackName:
    attackItem.name,

  sourceActorUuid:
    attacker.uuid,

  sourceActorName:
    attacker.name,

  targetActorUuid:
    defender.uuid,

  targetActorName:
    defender.name,

  appliedCombatId: game.combat?.id ?? "",
  appliedCombatRound: Number(game.combat?.round ?? 0),
  appliedCombatTurn: Number(game.combat?.turn ?? -1),

  effectType,
  dpCost: getEffectDpCost(effectKey),
  heavyDigizoidWeaponry: effectKey === "heavy" && Number(qualityAttackModifier?.heavyDigizoidDuration ?? 0) > 0,
  potencyStat,
  sourceStat,
  affectedStat,

  usesPotency,
  usePotencyValue,

  basePotency,
  potencyBonus,
  resistance,

  potency,
  value,

  durationRule: effectKey === "demoralize" ? "combat" : durationRule,
  hasDuration,
  hasSpecialDuration,
  endsAtCombatEnd: effectKey === "demoralize",

  duration: digizoidDuration,
  remaining: digizoidDuration,
  maxDuration,

  leftoverSuccesses:
    effectCalculation
      .leftoverSuccesses,

  areaEffectPenalty,

  fragilePotencyPenalty,
  fragileDurationPenalty,
  focusedCalledShot: Boolean(ignoreEffectResistance),
  ignoresResistance: Boolean(ignoreEffectResistance),
  cannotReducePotency: Boolean(ignoreEffectResistance),
  bossEffect: Boolean(effectDefinition?.bossEffect),
  selectedAttribute: String(effectDefinition?.selectedAttribute ?? ""),
  bossMaximumDuration: effectDefinition?.maximumDuration ?? null,
  bossInvincible: effectKey === "invincible",
  bossCharm: effectKey === "charm",
  bossBug: effectKey === "bug",
  bossDemoralize: effectKey === "demoralize",
  bossFrenzy: effectKey === "frenzy",
  cannotCleanse: effectKey === "demoralize"
};

if (effectKey === "invincible") {
  effectData.durationRule = "bossInvincible";
  effectData.hasDuration = false;
  effectData.hasSpecialDuration = false;
  effectData.duration = 0;
  effectData.remaining = 0;
  effectData.endsAtCombatEnd = true;
}

if (
  effectKey !== "cleanse" &&
  usesPotency &&
  potency <= 0
) {
  result.reason = combatText(
    "Imunidade e Resistência negaram o Efeito.",
    "Immunity and Resistance negated the Effect."
  );
  continue;
}

if (
  effectKey !== "cleanse" &&
  hasDuration &&
  digizoidDuration <= 0
) {
  continue;
}

if (effectKey === "cleanse") {
  if (targetIsAlly) {
    const combinedSuccesses =
      Number(accuracySuccesses ?? 0) +
      Number(cleanseTargetHealthSuccesses ?? 0);

    effectData.cleanseAmount = Math.floor(combinedSuccesses / 3);
    effectData.cleanseCombinedSuccesses = combinedSuccesses;
    effectData.cleanseTargetHealthSuccesses = cleanseTargetHealthSuccesses;
  } else {
    effectData.cleanseAmount = 1 + Math.floor(Number(leftoverSuccesses ?? 0) / 2);
  }

  effectData.cleanseAmount = Math.max(
    0,
    Number(effectData.cleanseAmount ?? 0) -
    fragilePotencyPenalty
  );

  effectData.cleanseSelective = Boolean(
    cleanseDeclaration?.selective
  );

  effectData.cleanseSelectedEffectKeys =
    cleanseDeclaration?.selectedEffectKeys ?? [];

  effectData.cleanseReduceResolve = Boolean(
    cleanseDeclaration?.reduceResolve
  );
}

  result.applied.push(effectData);
}

if (
  !result.applied.length &&
  fragileDurationPenalty > 0
) {
  result.reason = combatText(
    "A Duração do Efeito foi reduzida a 0 por [FRAGILE].",
    "The Effect Duration was reduced to 0 by [FRAGILE]."
  );
}

return result;
}

function getEffectDerivedStatValue(
  actor,
  statKey
) {
  const key = String(
    statKey ?? ""
  )
    .trim()
    .toLowerCase();

  if (!key) return 0;

  const stat =
    actor?.system?.derivedStats?.[key] ??
    actor?.system?.derived?.[key] ??
    {};

  const value = Number(
    stat.total ??
    stat.value ??
    stat.base ??
    0
  );

  return Math.max(
    0,
    Number.isFinite(value)
      ? value
      : 0
  );
}

function getEffectResistance(actor) {
  const value = Number(
    actor?.system
      ?.miscStats?.resistance?.total ??
    actor?.system
      ?.miscStats?.resistance?.value ??
    actor?.system
      ?.miscStats?.resistance?.base ??
    actor?.system
      ?.derived?.sv?.total ??
    actor?.system
      ?.derived?.sv?.value ??
    0
  );

  return Math.max(
    0,
    Number.isFinite(value)
      ? value
      : 0
  );
}

async function getConfuseAffectedStatDeclaration(defender) {
  const associations = [
    { derivedStat: "bit", affectedStat: "accuracy" },
    { derivedStat: "cpu", affectedStat: "damage" },
    { derivedStat: "ram", affectedStat: "dodge" },
    { derivedStat: "dos", affectedStat: "armor" }
  ].map((entry) => ({
    ...entry,
    derivedValue: getEffectDerivedStatValue(defender, entry.derivedStat),
    mainValue: Number(defender?.system?.mainStats?.[entry.affectedStat]?.total ?? 0)
  }));

  const highestDerived = Math.max(...associations.map((entry) => entry.derivedValue));
  const derivedTies = associations.filter((entry) => entry.derivedValue === highestDerived);
  if (derivedTies.length === 1) return derivedTies[0].affectedStat;

  const highestMain = Math.max(...derivedTies.map((entry) => entry.mainValue));
  const finalTies = derivedTies.filter((entry) => entry.mainValue === highestMain);
  if (finalTies.length === 1) return finalTies[0].affectedStat;

  const labels = {
    accuracy: combatText("Precisão", "Accuracy"),
    damage: combatText("Dano", "Damage"),
    dodge: combatText("Esquiva", "Dodge"),
    armor: combatText("Armadura", "Armor")
  };

  const options = finalTies.map((entry) => {
    return `<option value="${entry.affectedStat}">${labels[entry.affectedStat]} (${entry.derivedStat.toUpperCase()} ${entry.derivedValue})</option>`;
  }).join("");

  const selected = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-effect-quality-dialog"],
    window: { title: combatText("[CONFUSE] — Estatística afetada", "[CONFUSE] — Affected Stat") },
    content: `<div class="dda-roll-dialog"><p>${combatText(
      "Há empate entre as Estatísticas elegíveis. Escolha qual Total será reduzido.",
      "Eligible Stats are tied. Choose which Total is reduced."
    )}</p><div class="form-group"><label>${combatText("Estatística", "Stat")}</label><select name="affectedStat">${options}</select></div></div>`,
    ok: {
      label: combatText("Confirmar", "Confirm"),
      callback: (_event, button) => String(button.form.elements.affectedStat?.value ?? finalTies[0].affectedStat)
    },
    rejectClose: false,
    modal: true
  });

  return String(selected ?? finalTies[0].affectedStat);
}

function getConfusePotencyData(defender, selectedAffectedStat = "") {
  /*
   * Associação determinada pelas regras:
   * BIT -> Accuracy
   * CPU -> Damage
   * RAM -> Dodge
   * DOS -> Armor
   */
  const associations = [
    {
      derivedStat: "bit",
      affectedStat: "accuracy"
    },
    {
      derivedStat: "cpu",
      affectedStat: "damage"
    },
    {
      derivedStat: "ram",
      affectedStat: "dodge"
    },
    {
      derivedStat: "dos",
      affectedStat: "armor"
    }
  ];

  const candidates =
    associations.map((entry) => {
      return {
        ...entry,

        derivedValue:
          getEffectDerivedStatValue(
            defender,
            entry.derivedStat
          ),

        mainValue: Number(
          defender?.system
            ?.mainStats
            ?.[entry.affectedStat]
            ?.total ?? 0
        )
      };
    });

  const selected = String(selectedAffectedStat ?? "").trim().toLowerCase();
  if (selected) {
    const explicit = candidates.find((candidate) => candidate.affectedStat === selected);
    if (explicit) return explicit;
  }

  /*
   * Primeiro usa o maior Derived Stat.
   * Em empate, usa o maior Main Stat associado.
   */
  candidates.sort(
    (left, right) => {
      return (
        right.derivedValue -
          left.derivedValue ||
        right.mainValue -
          left.mainValue
      );
    }
  );

  return candidates[0] ?? {
    derivedStat: "bit",
    affectedStat: "accuracy",
    derivedValue: 0,
    mainValue: 0
  };
}

function calculateAttackEffectValues({
  attacker,
  defender,
  attackItem,
  effectDefinition,
  effectKey,
  leftoverSuccesses = 0,
  targetIsAlly = false,
  targetIsWilling = false,
  positiveTargetHealthSuccesses = 0,
  forcedMovementTargetHealthSuccesses = 0,
  confuseAffectedStat = "",
  accuracySuccesses = 0,
  areaAttackDeclaration = null,
  fragilePotencyPenalty = 0,
  fragileDurationPenalty = 0,
  ignoreEffectResistance = false,
  effectResistanceMultiplier = 1,
  effectResistanceCanNegate = false
} = {}) {
  const effectType = String(
    effectDefinition?.effectType ?? ""
  )
    .trim()
    .toLowerCase();

  const potencyStat = String(
    effectDefinition?.potencyStat ?? ""
  )
    .trim()
    .toLowerCase();

  const casterDerivedStats =
    new Set([
      "bit",
      "cpu",
      "ram",
      "dos"
    ]);

  const usesCasterDerivedStat =
    casterDerivedStats.has(
      potencyStat
    );

  let basePotency = 0;
  let affectedStat = "";
  let sourceStat = potencyStat;

  /*
   * CONFUSE usa o maior Derived Stat do alvo.
   */
  if (effectKey === "confuse") {
    const confuseData =
      getConfusePotencyData(defender, confuseAffectedStat);

    basePotency =
      confuseData.derivedValue;

    affectedStat =
      confuseData.affectedStat;

    sourceStat =
      confuseData.derivedStat;
  }

  /*
   * POISON usa o CPU do alvo.
   */
  else if (effectKey === "poison") {
    const creation = defender.flags?.["digimon-digital-adventures"]?.evokerCreation;
    const summoner = creation?.kind === "minion"
      ? game.actors?.get?.(creation.sourceActorId)
      : null;
    basePotency = getEffectDerivedStatValue(summoner ?? defender, "cpu");

    sourceStat = "cpu";
  }

  /*
   * Demais efeitos usam o Derived Stat
   * listado do Caster.
   */
  else if (usesCasterDerivedStat) {
    basePotency =
      getEffectDerivedStatValue(
        attacker,
        potencyStat
      );
  }

  if (
    usesCasterDerivedStat ||
    ["confuse", "poison"].includes(effectKey)
  ) {
    basePotency = applyHackersMemoryDerivedStatModifier(
      attacker,
      defender,
      basePotency
    );
  }

  /*
   * Positive e Negative Effects usam Potência.
   * POISON e RUIN são os dois Damage Effects
   * que também usam Potência.
   */
  const bossEffectsWithoutPotency = new Set(["charm", "bug", "demoralize", "frenzy", "invincible"]);
  const usesPotency =
    !bossEffectsWithoutPotency.has(effectKey) &&
    (effectType === "positive" ||
    effectType === "negative" ||
    (
      effectType === "damage" &&
      (
        effectKey === "poison" ||
        effectKey === "ruin"
      )
    ));

  const isUniqueEffect =
    effectType === "unique";

  /*
   * Effect Warrior só entra quando o efeito
   * usa um Derived Stat do Caster.
   */
  const potencyBonus =
    getAttackEffectPotencyBonus(
      attacker,
      attackItem,
      {
        includeEffectWarrior:
          usesCasterDerivedStat
      }
    );

  const resistance =
    usesPotency && !ignoreEffectResistance
      ? getEffectResistance(defender) * Math.max(1, Number(effectResistanceMultiplier ?? 1))
      : 0;

  /*
   * Normally Resistance cannot reduce real Potency below 2. Immunity removes
   * that floor and negates the incoming Effect when the result reaches 0.
   */
  const rawPotency = Math.max(0, basePotency + potencyBonus);
  const resistanceFloor = effectResistanceCanNegate
    ? 0
    : Math.min(2, rawPotency);
  const potencyAfterResistance =
    usesPotency
      ? Math.max(
          resistanceFloor,
          rawPotency - resistance
        )
      : 0;

  const functionType = String(
    attackItem?.system
      ?.baseTags?.functionType ?? ""
  )
    .trim()
    .toLowerCase();

  const isAreaAttack =
    Boolean(
      areaAttackDeclaration?.active
    );

  const isSupportAreaAttack =
    isAreaAttack &&
    functionType === "support";

  const zonerChoice = normalizeQualityChoiceKeyForAttack(
    getZonerQualityDataForActor(attacker)?.key ?? ""
  );
  const bypassSupportAreaPenalty =
    isSupportAreaAttack &&
    areaAttackDeclaration?.targetMode === "all" &&
    zonerChoice === "firewallbypass";
  const applySupportAreaPenalty =
    isSupportAreaAttack &&
    !bypassSupportAreaPenalty;

  /*
   * Support Area:
   * -1 Potency e Duration.
   *
   * Mínimo 1 contra inimigos.
   * Mínimo 0 contra aliados.
   */
  const areaMinimum =
    targetIsAlly ? 0 : 1;

  const potencyAfterArea =
    applySupportAreaPenalty &&
    usesPotency
      ? Math.max(
          areaMinimum,
          potencyAfterResistance - 1
        )
      : potencyAfterResistance;

  /*
   * FRAGILE é aplicado depois e pode reduzir
   * a Potência até 0.
   */
  const potency =
    usesPotency
      ? Math.max(
          0,
          potencyAfterArea -
            fragilePotencyPenalty
        )
      : 0;

  /*
   * Unique Effects não possuem Potência.
   * Alguns possuem um Valor baseado em um
   * Derived Stat, como Fear, Doom e Taunt.
   */
  let value =
    isUniqueEffect &&
    usesCasterDerivedStat
      ? Math.max(
          0,
          basePotency +
            potencyBonus
        )
      : 0;

  if (effectKey === "push") {
    const rangeType = String(attackItem?.system?.baseTags?.rangeType ?? "").toLowerCase();
    const basePush = rangeType === "range" || rangeType === "ranged"
      ? Math.floor(basePotency / 2)
      : basePotency;
    value = Math.max(0, basePush + potencyBonus);
  }

  if (
    (effectKey === "pull" || effectKey === "push") &&
    functionType === "support"
  ) {
    if (targetIsAlly) {
      const combinedSuccesses = Math.max(0, Number(accuracySuccesses ?? 0)) +
        Math.max(0, Number(forcedMovementTargetHealthSuccesses ?? 0));
      value += Math.floor(combinedSuccesses / 3);
    } else {
      value += Math.floor(Math.max(0, Number(leftoverSuccesses ?? 0)) / 2);
    }
  }

  if (effectKey === "pull" || effectKey === "push") {
    const sizeKey = normalizeKey(defender?.system?.size ?? "");
    const sizePenalty = sizeKey.includes("colossal")
      ? 5
      : sizeKey.includes("gigantic") || sizeKey.includes("gigante")
        ? 3
        : sizeKey.includes("huge") || sizeKey.includes("enorme")
          ? 1
          : 0;
    value = Math.max(0, value - sizePenalty);
  }

  if (isAreaAttack && value > 0) {
    let valuePenalty = 0;

    if (
      effectKey === "pull" ||
      effectKey === "push"
    ) {
      valuePenalty = 2;
    } else if (
      isSupportAreaAttack ||
      effectKey === "fear" ||
      effectKey === "doom" ||
      effectKey === "taunt"
    ) {
      valuePenalty = 1;
    }

    value = Math.max(
      0,
      value - valuePenalty
    );
  }

  const durationRule =
    effectDefinition?.duration ?? true;

  const hasDuration =
    durationRule === true ||
    durationRule === "true";

  const hasSpecialDuration =
    durationRule === "special";

  const defaultMaximumDuration = 3 + Math.max(
    0,
    Number(
      attacker?.system?.qualityFeatures?.dataSpecialization
        ?.maximumEffectDurationBonus ?? 0
    )
  );
  const configuredMaximumDuration = Number(effectDefinition?.maximumDuration);
  const maximumDuration = Number.isFinite(configuredMaximumDuration) && configuredMaximumDuration > 0
    ? configuredMaximumDuration
    : defaultMaximumDuration;

  /*
   * Um efeito que acerta tem Duração mínima 1,
   * usando os Successes restantes até o máximo.
   */
  /*
   * 9.02b:
   * - Negativo: Duração 1 ao acertar, +1 para cada 2 Sucessos depois do
   *   primeiro Sucesso excedente necessário para assegurar o acerto.
   * - Positivo/alvo disposto: Duração 1 automática, +1 para cada múltiplo
   *   completo de 3 nos Sucessos combinados de Precisão e Saúde.
   */
  const calculatedDuration = calculateEffectDurationRounds({
    targetIsWilling,
    leftoverAccuracySuccesses: leftoverSuccesses,
    accuracySuccesses,
    targetHealthSuccesses: positiveTargetHealthSuccesses,
    maximumDuration
  });

  const baseDuration = hasDuration
    ? Math.min(maximumDuration, Math.max(1, calculatedDuration))
    : 0;

  const durationAfterArea =
    applySupportAreaPenalty &&
    hasDuration
      ? Math.max(
          areaMinimum,
          baseDuration - 1
        )
      : baseDuration;

  /*
   * FRAGILE pode reduzir a Duração até 0.
   */
  const duration =
    hasDuration
      ? Math.max(
          0,
          durationAfterArea -
            fragileDurationPenalty
        )
      : 0;

  return {
    effectType,
    potencyStat,
    sourceStat,
    affectedStat,

    usesPotency,
    usePotencyValue:
      usesPotency,

    basePotency,
    potencyBonus,
    resistance,

    potency,
    value,

    durationRule,
    hasDuration,
    hasSpecialDuration,

    duration,
    remaining: duration,
    maxDuration: maximumDuration,

    leftoverSuccesses:
      Math.max(
        0,
        Number(
          leftoverSuccesses ?? 0
        )
      ),

    areaEffectPenalty:
      applySupportAreaPenalty ? 1 : 0
  };
}

function findSceneTokenForActor(actor) {
  return (canvas?.tokens?.placeables ?? []).find((token) => {
    return token.actor?.uuid === actor?.uuid || token.actor?.id === actor?.id;
  }) ?? null;
}

async function resolveOffensiveForcedMovement({
  attacker,
  defender,
  targetToken,
  qualityAttackModifier = {},
  attackOptions = {},
  hit = false,
  attackFunctionType = "damage",
  leftoverSuccesses = 0
} = {}) {
  const spaces = Math.max(
    0,
    Math.floor(Number(qualityAttackModifier.recoilDistance ?? 0))
  );

  if (!attacker || !defender || spaces <= 0) return false;

  const isArea = Boolean(attackOptions?.areaBatch?.active);
  const isFirstAreaTarget = !isArea || Number(attackOptions?.areaBatch?.index ?? 0) === 0;

  if (isFirstAreaTarget) {
    await applyForcedMovementEffect(attacker, {
      value: spaces,
      sourceActorUuid: defender.uuid
    }, "push");
  }

  if (
    hit &&
    attackFunctionType === "damage" &&
    Number(leftoverSuccesses ?? 0) >= 1
  ) {
    await applyForcedMovementEffect(defender, {
      value: spaces,
      sourceActorUuid: attacker.uuid
    }, "push");
  }

  return true;
}

async function applyThereIsNoEscapeMovementPenalty({
  attacker,
  defender,
  attackItem,
  attackOptions = {},
  hit = false,
  normalDamage = 0
} = {}) {
  if (
    !attackOptions?.punishingStrikeContext?.active ||
    !hit ||
    Number(normalDamage ?? 0) < 2 ||
    !hasQuality(attacker, "noEscape") ||
    !defender
  ) {
    return false;
  }

  const tags = getAttackQualityTags(attackItem);
  const multiplier = tags.has("root") ? 0 : 0.5;
  const offensiveState = foundry.utils.deepClone(
    defender.system?.combat?.offensiveQualities ?? {}
  );

  offensiveState.noEscape = {
    active: true,
    multiplier,
    combatId: getCombatId(),
    round: getCombatRound(),
    turn: getCombatTurn(),
    sourceActorUuid: attacker.uuid,
    sourceActorName: attacker.name
  };

  await defender.update({
    "system.combat.offensiveQualities": offensiveState
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: `<div class="dda-chat-card dda-effect-card effect-negative">
      <h2>${combatText("Não Há Escapatória", "There Is No Escape")}</h2>
      <p><strong>${escapeHtml(defender.name)}</strong> ${multiplier === 0
        ? combatText("teve o Movimento reduzido a 0 até o fim do turno atual.", "had Movement reduced to 0 until the end of the current turn.")
        : combatText("teve o Movimento reduzido pela metade até o fim do turno atual.", "had Movement halved until the end of the current turn.")}</p>
    </div>`
  });

  return true;
}

async function applyForcedMovementEffect(defender, effect, direction) {
  const spaces = Math.max(0, Math.floor(Number(effect.value ?? 0)));
  if (!defender || spaces <= 0) return false;

  const sourceDocument = effect.sourceActorUuid
    ? await fromUuid(effect.sourceActorUuid).catch(() => null)
    : null;

  const source = sourceDocument?.documentName === "Token"
    ? sourceDocument.actor
    : sourceDocument;

  const sourceToken = findSceneTokenForActor(source);
  const targetToken = findSceneTokenForActor(defender);
  if (!sourceToken || !targetToken) return false;

  const sourceCenter = sourceToken.center;
  const targetCenter = targetToken.center;
  const dx = Number(targetCenter.x ?? 0) - Number(sourceCenter.x ?? 0);
  const dy = Number(targetCenter.y ?? 0) - Number(sourceCenter.y ?? 0);
  const length = Math.hypot(dx, dy);
  if (length <= 0) return false;

  const sign = direction === "pull" ? -1 : 1;
  const gridSize = Number(canvas.grid?.size ?? 100);
  const movedSpaces = direction === "pull"
    ? Math.min(spaces, Math.max(0, Math.ceil(length / gridSize) - 1))
    : spaces;
  if (movedSpaces <= 0) return false;
  const destination = {
    x: Number(targetToken.document.x ?? 0) + (dx / length) * gridSize * movedSpaces * sign,
    y: Number(targetToken.document.y ?? 0) + (dy / length) * gridSize * movedSpaces * sign
  };

  const snapped = canvas.grid?.getSnappedPoint
    ? canvas.grid.getSnappedPoint(destination, { mode: CONST.GRID_SNAPPING_MODES?.CENTER })
    : destination;

  try {
    const clashAutomation = await import("../combat/clash.js");
    const clashResolution = await clashAutomation.handleClashForcedMovement?.({
      defender,
      source,
      direction,
      potency: Number(effect.potency ?? effect.value ?? spaces),
      destination: {
        x: Math.round(Number(snapped.x ?? destination.x)),
        y: Math.round(Number(snapped.y ?? destination.y))
      }
    });
    if (clashResolution?.handled) return Boolean(clashResolution.moved);
  } catch (error) {
    console.warn("DDA | Clash forced-movement handling failed.", error);
  }

  await targetToken.document.update({
    x: Math.round(Number(snapped.x ?? destination.x)),
    y: Math.round(Number(snapped.y ?? destination.y))
  }, withDDAMovementContext({
    ddaForcedMovement: true
  }, {
    mode: "forced", movementBudget: "none", voluntary: false, reactions: true,
    traversal: true, source: "attackEffect", unwilling: true, suppressBurn: true
  }));

  const activeEffects = defender.system?.effects?.active ?? [];
  if (activeEffects.some((entry) => getEffectTagKey(entry.tag) === "burn")) {
    const damageEffectCount = activeEffects.filter((entry) => {
      return ["burn", "freeze", "poison", "ruin"].includes(getEffectTagKey(entry.tag));
    }).length;
    const reduction = Math.max(0, damageEffectCount - 1) + Math.max(
      0,
      Number(defender.system?.qualityFeatures?.naturewalk?.damageReduction?.burn ?? 0)
    );
    let burnDamage = Math.max(0, Math.floor(movedSpaces / 2) - reduction);
    const roundKey = `${game.combat?.id ?? "no-combat"}:${Number(game.combat?.round ?? 0)}`;
    const previousDamage = String(defender.system?.combat?.effectDamageRoundKey ?? "") === roundKey
      ? Math.max(0, Number(defender.system?.combat?.effectDamageTakenThisRound ?? 0))
      : 0;
    const cap = Math.max(0, Number(getActorSv(defender)) * 2);
    burnDamage = Math.min(burnDamage, Math.max(0, cap - previousDamage));

    if (burnDamage > 0) {
      const woundsPath = defender.type === "character"
        ? "system.derived.wounds.value"
        : "system.miscStats.wounds.value";
      const wounds = Math.max(0, Number(foundry.utils.getProperty(defender, woundsPath) ?? 0));
      await defender.update({
        [woundsPath]: Math.max(0, wounds - burnDamage),
        "system.combat.effectDamageRoundKey": roundKey,
        "system.combat.effectDamageTakenThisRound": previousDamage + burnDamage
      });
    }
  }

  return true;
}

async function applyAttackEffectTags(defender, effectsToApply) {
  if (!defender || !effectsToApply?.length) return { applied: [], denied: null };

  const supportsActiveEffects =
    defender.type === "digimon" ||
    defender.type === "npc" ||
    defender.type === "character";

  if (!supportsActiveEffects) return { applied: [], denied: null };

  const currentEffects = foundry.utils.deepClone(defender.system.effects?.active ?? []);
  const cleanseReports = [];
  let shouldClearShieldTemp = false;
  const appliedEffectKeys = [];

  const gainForceResolution = await resolveIncomingDigizoidGainForceEffects(defender, effectsToApply);
  const denyResolution = consumeDenyForIncomingEffects(defender, gainForceResolution.effects);
  let incomingEffects = denyResolution.effects;
  if (defender.flags?.["digimon-digital-adventures"]?.evokerCreation?.kind === "minion") {
    const allowedMinionEffects = new Set([
      "burn", "freeze", "poison", "ruin", "dot",
      "root", "slow", "paralyze", "pull", "push", "swift", "tailwind", "nimble", "heavy",
      "charm", "bug", "frenzy", "invincible"
    ]);
    incomingEffects = incomingEffects.filter((effect) => {
      const key = getEffectTagKey(effect.tag);
      const type = String(effect.effectType ?? effect.type ?? "").toLowerCase();
      return type === "damage" || allowedMinionEffects.has(key);
    });
  }
  if (denyResolution.denied) {
    currentEffects.splice(0, currentEffects.length, ...denyResolution.activeEffects);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: defender }),
      content: `<div class="dda-chat-card dda-effect-card effect-special dda-deny-card">
        <h2>${combatText("Efeito Negado", "Effect Denied")}</h2>
        <p><strong>[DENY]</strong> ${combatText(
          `negou [${getEffectTagKey(denyResolution.denied.tag).toUpperCase()}] e então terminou.`,
          `negated [${getEffectTagKey(denyResolution.denied.tag).toUpperCase()}] and then ended.`
        )}</p>
      </div>`
    });
  }

for (const originalEffect of incomingEffects) {
  let effect = originalEffect;
  const effectKey = getEffectTagKey(effect.tag);

  /* FEAR e TAUNT se substituem imediatamente. */
  if (effectKey === "fear" || effectKey === "taunt") {
    const opposite = effectKey === "fear" ? "taunt" : "fear";
    for (let index = currentEffects.length - 1; index >= 0; index -= 1) {
      if (getEffectTagKey(currentEffects[index].tag) === opposite) {
        currentEffects.splice(index, 1);
      }
    }
  }
    if (effectKey === "cleanse") {
    const rawCleanseAmount = Number(effect.cleanseAmount ?? 0);
const cleanseAmount = Math.max(0, rawCleanseAmount);

if (cleanseAmount <= 0) {
  cleanseReports.push({
    beforeCount: currentEffects.length,
    afterCount: currentEffects.length,
    remainingEffects: currentEffects,
    expiredEffects: [],
    affectedEffects: [],
    amount: 0,
    sourceName: effect.sourceAttackName ?? localize("DDA.Effect.Cleanse"),
    selective: Boolean(effect.cleanseSelective),
    combinedSuccesses: effect.cleanseCombinedSuccesses ?? null,
    targetHealthSuccesses: effect.cleanseTargetHealthSuccesses ?? null
  });

  continue;
}
const cleanseData = applyCleanseToEffectList(
  currentEffects,
  cleanseAmount,
  effect.cleanseSelectedEffectKeys ?? []
);

if (hasQuality(defender, "vulnerable") && cleanseData.expiredEffects.length) {
  const backlash = cleanseData.expiredEffects.reduce((total, expiredEffect) => (
    total + Math.max(0, Number(expiredEffect.dpCost ?? getEffectDpCost(getEffectTagKey(expiredEffect.tag)) ?? 0))
  ), 0);
  if (backlash > 0) {
    const woundPath = defender.type === "character" ? "system.derived.wounds.value" : "system.miscStats.wounds.value";
    const currentWounds = Math.max(0, Number(foundry.utils.getProperty(defender, woundPath) ?? 0));
    await defender.update({ [woundPath]: Math.max(0, currentWounds - backlash) });
  }
}

if ([...(cleanseData.expiredEffects ?? []), ...(cleanseData.affectedEffects ?? [])].some((entry) => entry.gainForceUndyingRegen)) {
  await markUndyingRegenCleanseSuppression(defender);
}

const resolveBeforeCleanse = getCombatMonsterResolve(defender);
let resolveAfterCleanse = resolveBeforeCleanse;
if (effect.cleanseReduceResolve && resolveBeforeCleanse > 0) {
  resolveAfterCleanse = await setCombatMonsterResolve(
    defender,
    Math.max(0, resolveBeforeCleanse - cleanseAmount)
  );
}

const restoredStunActions = cleanseData.expiredEffects.reduce((total, expiredEffect) => {
  return getEffectTagKey(expiredEffect.tag) === "stun"
    ? total + Math.max(0, Number(expiredEffect.actionRemoved ?? 0))
    : total;
}, 0);

const removedUnusedHaste = cleanseData.expiredEffects.some((expiredEffect) => {
  return getEffectTagKey(expiredEffect.tag) === "haste" && Number(expiredEffect.actionGranted ?? 0) > 0;
});

if (restoredStunActions > 0 || removedUnusedHaste) {
  const actions = Math.max(0, Number(defender.system?.combat?.actions?.value ?? 0));
  const maximum = Math.max(0, Number(defender.system?.combat?.actions?.max ?? 2));
  const hasteStillActive = cleanseData.remainingEffects.some((remainingEffect) => {
    return getEffectTagKey(remainingEffect.tag) === "haste" && Number(remainingEffect.actionGranted ?? 0) > 0;
  });
  const actionCap = maximum + (hasteStillActive ? 1 : 0);
  const nextActions = Math.min(actionCap, actions + restoredStunActions);
  await defender.update({
    "system.combat.actions.value": Math.max(0, nextActions)
  });
}


    currentEffects.splice(0, currentEffects.length, ...cleanseData.remainingEffects);

    if (cleanseData.expiredEffects.some((expiredEffect) => getEffectTagKey(expiredEffect.tag) === "shield")) {
      shouldClearShieldTemp = true;
    }

cleanseReports.push({
  ...cleanseData,
  amount: cleanseAmount,
  sourceName: effect.sourceAttackName ?? localize("DDA.Effect.Cleanse"),
  selective: Boolean(effect.cleanseSelective),
  combinedSuccesses: effect.cleanseCombinedSuccesses ?? null,
  targetHealthSuccesses: effect.cleanseTargetHealthSuccesses ?? null,
  resolveBefore: resolveBeforeCleanse,
  resolveAfter: resolveAfterCleanse,
  resolveReduced: Math.max(0, resolveBeforeCleanse - resolveAfterCleanse)
});

    appliedEffectKeys.push(effectKey);
    continue;
  }  
  if (effectKey === "shield") {
    const shieldData = await getShieldTempData(defender, effect);
    let shieldAmount = shieldData.amount;
    const doomIndex = currentEffects.findIndex((existing) => {
      return getEffectTagKey(existing.tag) === "doom";
    });

    if (doomIndex >= 0) {
      const doom = currentEffects[doomIndex];
      const doomValue = Math.max(0, Number(doom.value ?? doom.potency ?? 0));
      const absorbed = Math.min(doomValue, shieldAmount);
      shieldAmount -= absorbed;
      const nextDoomValue = doomValue - absorbed;
      if (nextDoomValue <= 0) currentEffects.splice(doomIndex, 1);
      else currentEffects[doomIndex] = { ...doom, value: nextDoomValue };
    }

    const shieldEffect = {
      ...effect,
      tempWounds: shieldAmount,
      tempWoundsRemaining: shieldAmount
    };

    const withoutOldShield = currentEffects.filter((existing) => {
      return getEffectTagKey(existing.tag) !== "shield";
    });

    withoutOldShield.push(shieldEffect);

    currentEffects.splice(0, currentEffects.length, ...withoutOldShield);

    await applyShieldTempWounds(defender, shieldAmount, shieldEffect);

    appliedEffectKeys.push(effectKey);
    continue;
  }

  if (effectKey === "pull" || effectKey === "push") {
    await applyForcedMovementEffect(defender, effect, effectKey);
    appliedEffectKeys.push(effectKey);
    continue;
  }

  if (effectKey === "dot") {
    const combatId = getCombatId();
    if (String(defender.system?.combat?.dotAfflictedCombatId ?? "") === String(combatId)) {
      continue;
    }
    await defender.update({
      "system.combat.dotAfflictedCombatId": combatId
    });
  }

const existingIndex = effectKey === "demoralize"
  ? -1
  : currentEffects.findIndex(
    (existing) => {
      return (
        getEffectTagKey(
          existing.tag
        ) === effectKey
      );
    }
  );

if (existingIndex < 0 && effectKey === "haste") {
  const actions = Math.max(0, Number(defender.system?.combat?.actions?.value ?? 0));
  await defender.update({
    "system.combat.actions.value": actions + 1
  });
  effect.actionGranted = 1;
}

if (existingIndex < 0 && effectKey === "stun") {
  const actions = Math.max(0, Number(defender.system?.combat?.actions?.value ?? 0));
  const removed = actions > 0 ? 1 : 0;
  if (removed) {
    await defender.update({
      "system.combat.actions.value": actions - removed
    });
  }
  effect.actionRemoved = removed;
  effect.activatesAtEndOfNextTurn = removed === 0;

  if (typeof game?.dda?.actions?.endDigimonClash === "function") {
    await game.dda.actions.endDigimonClash(defender, { reason: "stun", all: true });
  }
}

if (existingIndex >= 0) {
  const existing =
    currentEffects[existingIndex];

  const oldRemaining = Math.max(
    0,
    Number(
      existing.remaining ??
      existing.duration ??
      0
    )
  );

  const durationIncrease = Math.max(
    0,
    Number(
      effect.leftoverSuccesses ?? 0
    )
  );

  const maximumDuration = Math.max(
    0,
    Number(
      effect.maxDuration ??
      existing.maxDuration ??
      3
    )
  );

  const combinedRemaining =
    maximumDuration > 0
      ? Math.max(
          oldRemaining,

          Math.min(
            maximumDuration,

            oldRemaining +
              durationIncrease
          )
        )
      : oldRemaining;

  const refreshUsesLatestCaster = ["fear", "taunt", "invincible"].includes(effectKey);

  currentEffects[existingIndex] = {
    ...(refreshUsesLatestCaster ? { ...existing, ...effect } : existing),

    id:
      existing.id ??
      effect.id,

    remaining:
      combinedRemaining,

    maxDuration:
      Math.max(
        Number(existing.maxDuration ?? 0),
        Number(effect.maxDuration ?? 0)
      ),

    refreshedCombatId: getCombatId(),
    refreshedRound: getCombatRound(),
    refreshedTurn: getCombatTurn()
  };
} else {
  currentEffects.push(effect);
}
appliedEffectKeys.push(effectKey);
}
await defender.update({
  "system.effects.active": currentEffects
});

for (const effect of incomingEffects) {
  const effectKey = getEffectTagKey(effect.tag);
  if (!appliedEffectKeys.includes(effectKey)) continue;
  if (!["fear", "stun", "paralyze"].includes(effectKey)) continue;
  try {
    const clashAutomation = await import("../combat/clash.js");
    const sourceActor = effect.sourceActorUuid
      ? await fromUuid(effect.sourceActorUuid).catch(() => null)
      : null;
    await clashAutomation.handleClashEffectApplied?.(defender, effectKey, sourceActor);
  } catch (error) {
    console.warn("DDA | Clash effect-ending integration failed.", error);
  }
}

if (shouldClearShieldTemp) {
  await clearShieldTempFromCleanse(defender);
}

defender.sheet?.render(true);

for (const cleanseReport of cleanseReports) {
  await createCleanseChatMessage(defender, cleanseReport);
}

return {
  applied: [...new Set(appliedEffectKeys)],
  denied: denyResolution.denied ? getEffectTagKey(denyResolution.denied.tag) : null
};
}

async function increaseDodgePenalty(actor, request = {}, outcome = {}) {
  const uncatchable = Boolean(
    actor?.system?.qualityFeatures?.dataSpecialization
      ?.ignoresStackingDodgePenalty
  );

  if (uncatchable && !request?.ignoresUncatchableTarget) return;

  const speedsterIgnoreCount = Math.max(
    0,
    Number(actor?.system?.qualityFeatures?.dataOptimization?.speedsterDodgePenaltyIgnoreCount ?? 0)
  );
  const combatant = getCombatantForActor(game?.combat, actor);
  const speedsterWindow = speedsterIgnoreCount > 0 && combatantEndedThisRound(combatant, game?.combat);
  const speedsterUse = getRoundUseState(actor, "dataOptimization", "speedsterDodgePenalty");

  if (speedsterWindow && !speedsterUse) {
    await setUseState(actor, "dataOptimization", "speedsterDodgePenalty", {
      source: "speedster",
      ignored: 1
    });
    return;
  }

  const current = Number(actor.system.combat?.dodgePenalty ?? 0);
  const increase = Boolean(request?.fakeoutEligible && outcome?.hit === false)
    ? 2
    : 1;

  await actor.update({
    "system.combat.dodgePenalty": current + increase
  });
}

function getSpeedSurgeAttackWindow(actor) {
  const effects = Array.isArray(actor?.system?.effects?.active)
    ? actor.system.effects.active
    : [];

  return effects.find((effect) => {
    return getEffectTagKey(effect.tag) === "speedsurgeattackwindow";
  }) ?? null;
}

async function consumeSpeedSurgeAttackWindow(actor, effectId = "") {
  if (!actor || !effectId) return;

  const effects = foundry.utils.deepClone(
    actor.system?.effects?.active ?? []
  );

  const remainingEffects = effects.filter(
    (effect) => effect.id !== effectId
  );

  if (remainingEffects.length === effects.length) return;

  await actor.update({
    "system.effects.active": remainingEffects
  });
}

async function markAttackUsed(
  actor,
  usedSignatureMove = false,
  attacksMadeThisTurn = 1,
  options = {}
) {
  const updateData = options.suppressRoundCount
    ? {}
    : {
        "system.combat.hasAttackedThisRound": true,
        "system.combat.attacksMadeThisTurn": attacksMadeThisTurn,
        "system.combat.multiattackPenalty": 0
      };

  if (usedSignatureMove) {
    /*
     * O valor da Bateria já foi capturado no
     * começo da resolução e utilizado nos
     * bônus do Movimento Assinatura.
     *
     * Só zeramos a Bateria quando o Ataque
     * realmente termina sua resolução.
     */
    updateData[
      "system.combat.signatureMoveUsedThisTurn"
    ] = true;

    updateData[
      "system.resources.battery.value"
    ] = 0;
  }

  await actor.update(
    updateData
  );

  if (usedSignatureMove && options.attackItem) {
    await recordBossInvincibleSignatureUse(options.attackItem);
  }

  await recordDataSpecializationAttackUse(
    actor,
    options.attackItem ?? null,
    options.dataSpecializationMode ?? "normal"
  );
}

export function registerAttackDodgeResponseListener() {
  if (
    globalThis
      .__ddaAttackDodgeResponseListenerRegistered
  ) {
    return;
  }

  globalThis
    .__ddaAttackDodgeResponseListenerRegistered =
      true;

  Hooks.on(
    "createChatMessage",
    (message) => {
      void receiveAttackDodgeResponse(
        message
      ).catch((error) => {
        console.warn(
          "DDA | Could not receive the Dodge response.",
          error
        );
      });
    }
  );

  Hooks.on(
    "updateChatMessage",
    (message) => {
      void receiveAttackDodgeCancellation(
        message
      ).catch((error) => {
        console.warn(
          "DDA | Could not receive the Dodge cancellation.",
          error
        );
      });
    }
  );

  Hooks.on(
    "deleteChatMessage",
    (message) => {
      const request =
        getAttackDodgeRequestFromMessage(
          message
        );

      if (
        !request ||
        request.status !== "pending"
      ) {
        return;
      }

      void cancelPendingAttackDodgeRequest(
        request.requestId,
        {
          reason: "messageDeleted",
          updateMessage: false
        }
      );
    }
  );

  Hooks.on("combatEnd", (combat) => {
    void cancelAttackDodgeRequestsForCombat(combat, "combatEnded");
  });

  Hooks.on("deleteCombat", (combat) => {
    void cancelAttackDodgeRequestsForCombat(combat, "combatEnded");
  });
}

function getAreaAttackRequestFromMessage(message) {
  return message?.getFlag?.(game.system.id, "areaAttackRequest")
    ?? message?.flags?.[game.system.id]?.areaAttackRequest
    ?? null;
}

function getAreaAttackProgressMessage(request = {}) {
  const progressMessageId = String(request?.areaProgressMessageId ?? "");
  if (progressMessageId) {
    const direct = game.messages?.get(progressMessageId);
    if (direct) return direct;
  }

  const areaRequestId = String(request?.areaRequestId ?? "");
  if (!areaRequestId) return null;

  return game.messages?.find?.((candidate) => {
    const areaRequest = getAreaAttackRequestFromMessage(candidate);
    return String(areaRequest?.requestId ?? "") === areaRequestId;
  }) ?? null;
}

async function isEnemyAreaDodgeRequest(request, defender) {
  if (!request?.areaAttack || !request?.areaRequestId || !defender) {
    return false;
  }

  let attacker = null;

  try {
    attacker = await fromUuid(request.attackerUuid);
  } catch (error) {
    console.warn(
      "DDA | Could not resolve the attacker for bulk Area Dodge.",
      error
    );
  }

  return Boolean(attacker && !areActorsAllies(attacker, defender));
}

async function shouldAutoResolveEnemyAreaDodge(request, defender) {
  if (!game.user?.isGM) return false;
  if (!await isEnemyAreaDodgeRequest(request, defender)) return false;

  const progressMessage = getAreaAttackProgressMessage(request);
  const areaRequest = getAreaAttackRequestFromMessage(progressMessage);
  const bulkDodge = areaRequest?.bulkDodge ?? null;

  return Boolean(
    bulkDodge?.active &&
    String(bulkDodge.requestedByUserId ?? "") === String(game.user.id ?? "")
  );
}

async function queueAutomaticEnemyAreaDodge(message, request, defender) {
  const requestId = String(request?.requestId ?? "");
  if (!requestId) return false;

  if (!await shouldAutoResolveEnemyAreaDodge(request, defender)) {
    return false;
  }

  if (bulkAreaDodgeInFlightRequests.has(requestId)) {
    return true;
  }

  bulkAreaDodgeInFlightRequests.add(requestId);

  void resolveAttackDodgeFromChat(message)
    .then((resolved) => {
      if (!resolved) {
        bulkAreaDodgeInFlightRequests.delete(requestId);
        ui.notifications.warn(combatText(
          `A Esquiva automática de ${request.defenderName ?? "um alvo"} precisa ser resolvida manualmente.`,
          `The automatic Dodge for ${request.defenderName ?? "a target"} must be resolved manually.`
        ));
        return;
      }

      globalThis.setTimeout(() => {
        bulkAreaDodgeInFlightRequests.delete(requestId);
      }, 10_000);
    })
    .catch((error) => {
      bulkAreaDodgeInFlightRequests.delete(requestId);
      console.error(
        "DDA | Could not automatically resolve an enemy Area Dodge.",
        error
      );
    });

  return true;
}

export async function bindAreaAttackBulkDodgeCard(message, root) {
  if (!message || !root?.querySelectorAll) return;

  const areaRequest = getAreaAttackRequestFromMessage(message);
  if (!areaRequest?.requestId) return;

  const buttons = root.querySelectorAll(
    "[data-action='dda-roll-all-area-dodges']"
  );

  if (!buttons.length) return;

  const finishedStatuses = new Set([
    "resolved",
    "prevented",
    "cancelled",
    "skipped"
  ]);
  const enemyPending = Array.isArray(areaRequest.targets)
    ? areaRequest.targets.filter((target) => {
        return Boolean(target?.isEnemy) &&
          !finishedStatuses.has(String(target?.status ?? "pending"));
      })
    : [];
  const complete = ["resolved", "prevented", "cancelled"].includes(
    String(areaRequest.status ?? "")
  );
  const isMessageAuthor = Boolean(
    String(message.author?.id ?? message.user?.id ?? "") ===
    String(game.user?.id ?? "")
  );
  const canChooseMode = Boolean(
    !complete &&
    enemyPending.length &&
    (game.user?.isGM || isMessageAuthor)
  );
  const canUseBulk = Boolean(
    game.user?.isGM &&
    !complete &&
    enemyPending.length
  );
  const selectedMode = String(
    areaRequest.bulkDodge?.mode ??
    (areaRequest.bulkDodge?.active ? "bulk" : "")
  ).trim();
  const alreadyActive = selectedMode === "bulk";

  for (const button of buttons) {
    if (button.dataset.ddaAreaBulkDodgeBound === "true") continue;
    button.dataset.ddaAreaBulkDodgeBound = "true";
    button.hidden = !canUseBulk;
    button.disabled = !canUseBulk || Boolean(selectedMode);

    if (!canUseBulk || selectedMode) continue;

    button.addEventListener("click", async (event) => {
      event.preventDefault();

      if (button.dataset.ddaAreaBulkDodgeInFlight === "true") return;

      button.dataset.ddaAreaBulkDodgeInFlight = "true";
      button.disabled = true;
      button.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        ${combatText(
          "Resolvendo Esquivas inimigas…",
          "Resolving enemy Dodges…"
        )}
      `;

      const liveAreaRequest = foundry.utils.deepClone(
        getAreaAttackRequestFromMessage(message) ?? areaRequest
      );
      liveAreaRequest.bulkDodge = {
        active: true,
        mode: "bulk",
        requestedByUserId: game.user.id,
        requestedAt: Date.now()
      };

      try {
        await message.update({
          [`flags.${game.system.id}.areaAttackRequest`]: liveAreaRequest
        });
      } catch (error) {
        delete button.dataset.ddaAreaBulkDodgeInFlight;
        button.disabled = false;
        console.error(
          "DDA | Could not activate bulk enemy Dodges.",
          error
        );
        ui.notifications.error(combatText(
          "Não foi possível ativar as Esquivas inimigas automáticas.",
          "Could not enable automatic enemy Dodges."
        ));
        return;
      }

      const currentDodgeMessage = game.messages?.find?.((candidate) => {
        const request = getAttackDodgeRequestFromMessage(candidate);
        return request?.status === "pending" &&
          String(request.areaRequestId ?? "") ===
            String(liveAreaRequest.requestId ?? "");
      }) ?? null;

      if (!currentDodgeMessage) {
        ui.notifications.info(combatText(
          "As próximas Esquivas dos inimigos serão roladas automaticamente.",
          "The next enemy Dodges will be rolled automatically."
        ));
        return;
      }

      const currentRequest = getAttackDodgeRequestFromMessage(
        currentDodgeMessage
      );
      let defender = null;

      try {
        defender = await fromUuid(currentRequest?.defenderUuid);
      } catch (error) {
        console.warn(
          "DDA | Could not resolve the current Area Dodge defender.",
          error
        );
      }

      if (
        defender &&
        canCurrentUserResolveAttackDodge(currentRequest, defender)
      ) {
        await queueAutomaticEnemyAreaDodge(
          currentDodgeMessage,
          currentRequest,
          defender
        );
      }
    });
  }

  const individualButtons = root.querySelectorAll(
    "[data-action='dda-resolve-area-dodges-individually']"
  );

  for (const button of individualButtons) {
    if (button.dataset.ddaAreaIndividualDodgeBound === "true") continue;
    button.dataset.ddaAreaIndividualDodgeBound = "true";
    button.hidden = !canChooseMode;
    button.disabled = !canChooseMode || Boolean(selectedMode);

    if (!canChooseMode || selectedMode) continue;

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      button.disabled = true;

      const liveAreaRequest = foundry.utils.deepClone(
        getAreaAttackRequestFromMessage(message) ?? areaRequest
      );

      liveAreaRequest.bulkDodge = {
        active: false,
        mode: "individual",
        requestedByUserId: game.user.id,
        requestedAt: Date.now()
      };

      try {
        await message.update({
          [`flags.${game.system.id}.areaAttackRequest`]: liveAreaRequest
        });
      } catch (error) {
        button.disabled = false;
        console.error(
          "DDA | Could not select individual Area Dodges.",
          error
        );
        ui.notifications.error(combatText(
          "Não foi possível iniciar as Esquivas individuais.",
          "Could not start individual Dodges."
        ));
      }
    });
  }
}

export async function bindAttackDodgeChatCard(
  message,
  root
) {
  if (
    !message ||
    !root?.querySelectorAll
  ) {
    return;
  }

  const request =
    getAttackDodgeRequestFromMessage(
      message
    );

  if (
    !request ||
    request.status !== "pending"
  ) {
    return;
  }

  const invalidReason = attackDodgeInvalidReason(request);
  if (invalidReason || hasAttackDodgeResponse(request.requestId)) {
    for (const button of root.querySelectorAll(
      "[data-action='dda-roll-attack-dodge'], [data-action='dda-cancel-attack-dodge']"
    )) {
      button.hidden = true;
      button.disabled = true;
    }
    return;
  }

  let defender = null;

  try {
    defender =
      await fromUuid(
        request.defenderUuid
      );
  } catch (error) {
    console.warn(
      "DDA | Could not resolve pending Dodge defender.",
      error
    );
  }

  const canResolve =
    canCurrentUserResolveAttackDodge(
      request,
      defender
    );

  if (
    canResolve &&
    await queueAutomaticEnemyAreaDodge(
      message,
      request,
      defender
    )
  ) {
    root.classList?.add("dda-area-bulk-dodge-auto-resolving");

    for (const button of root.querySelectorAll(
      "[data-action='dda-roll-attack-dodge'], [data-action='dda-cancel-attack-dodge']"
    )) {
      button.hidden = true;
      button.disabled = true;
    }

    return;
  }

  const rollButtons =
    root.querySelectorAll(
      "[data-action='dda-roll-attack-dodge']"
    );

  for (
    const button of
    rollButtons
  ) {
    if (
      button.dataset.ddaDodgeBound ===
      "true"
    ) {
      continue;
    }

    button.dataset.ddaDodgeBound =
      "true";

    /*
     * Keep the pending Dodge visible to all clients. Only the target
     * controller or an active GM can actually resolve it.
     */
    button.hidden =
      false;

    button.disabled =
      !canResolve;

    button.title =
      canResolve
        ? ""
        : combatText(
            "Aguardando o controlador do alvo ou um GM ativo.",
            "Waiting for the target controller or an active GM."
          );

    if (!canResolve) {
      continue;
    }

    button.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();

        if (
          button.dataset
            .ddaDodgeInFlight ===
          "true"
        ) {
          return;
        }

        button.dataset
          .ddaDodgeInFlight =
            "true";

        button.disabled =
          true;

        const resolved =
          await resolveAttackDodgeFromChat(
            message
          );

        if (!resolved) {
          delete button.dataset
            .ddaDodgeInFlight;

          button.disabled =
            false;
        }
      }
    );
  }

  const canCancel =
    Boolean(
      game.user?.isGM ||
      request.requesterUserId ===
        game.user?.id
    );

  const cancelButtons =
    root.querySelectorAll(
      "[data-action='dda-cancel-attack-dodge']"
    );

  for (
    const button of
    cancelButtons
  ) {
    if (
      button.dataset
        .ddaDodgeCancelBound ===
      "true"
    ) {
      continue;
    }

    button.dataset
      .ddaDodgeCancelBound =
        "true";

    button.hidden =
      !canCancel;

    button.disabled =
      !canCancel;

    if (!canCancel) {
      continue;
    }

    button.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();

        button.disabled =
          true;

        const cancelled =
          await cancelAttackDodgeFromChat(
            message
          );

        if (!cancelled) {
          button.disabled =
            false;
        }
      }
    );
  }
}

async function cancelAttackDodgeFromChat(
  message
) {
  const request =
    getAttackDodgeRequestFromMessage(
      message
    );

  if (
    !request ||
    request.status !== "pending"
  ) {
    ui.notifications.warn(
      localize(
        "DDA.Warning.DodgeRequestNoLongerPending"
      )
    );

    return false;
  }

  const canCancel =
    Boolean(
      game.user?.isGM ||
      request.requesterUserId ===
        game.user?.id
    );

  if (!canCancel) {
    ui.notifications.warn(
      combatText(
        "Você não pode cancelar esta solicitação de Esquiva.",
        "You cannot cancel this Dodge request."
      )
    );

    return false;
  }

  const nextRequest = {
    ...foundry.utils.deepClone(
      request
    ),

    status:
      "cancelled",

    cancelReason:
      "manual",

    cancelledByUserId:
      game.user.id
  };

  await message.update({
    content:
      buildCancelledAttackDodgeCard(
        nextRequest
      ),

    [
      `flags.${game.system.id}.attackDodgeRequest`
    ]:
      nextRequest
  });

  return true;
}

export async function resolveAttackDodgeFromChat(message) {
  const request = getAttackDodgeRequestFromMessage(message);

  if (!request || request.status !== "pending") {
    ui.notifications.warn(localize("DDA.Warning.DodgeRequestNoLongerPending"));
    return false;
  }

  if (hasAttackDodgeResponse(request.requestId)) {
    ui.notifications.warn(localize("DDA.Warning.DodgeRequestNoLongerPending"));
    return false;
  }

  const invalidReason = attackDodgeInvalidReason(request);
  if (invalidReason) {
    ui.notifications.warn(combatText(
      invalidReason === "timeout"
        ? "Esta solicitação de Esquiva expirou."
        : "Esta solicitação de Esquiva não pertence mais ao Combate/Cena atual.",
      invalidReason === "timeout"
        ? "This Dodge request has expired."
        : "This Dodge request no longer belongs to the current Combat/Scene."
    ));
    return false;
  }

  let defender = null;

  try {
    defender = await fromUuid(request.defenderUuid);
  } catch (error) {
    console.warn("DDA | Could not resolve Dodge defender.", error);
  }

  if (!defender) {
    ui.notifications.warn(localize("DDA.Warning.TargetHasNoActor"));
    return false;
  }

  if (!canCurrentUserResolveAttackDodge(request, defender)) {
    ui.notifications.warn(localize("DDA.Warning.NoPermissionToRollDodge"));
    return false;
  }

  const resolutionRequestId = String(request.requestId ?? "");
  if (resolutionRequestId && attackDodgeResolutionInFlightRequests.has(resolutionRequestId)) {
    console.debug("DDA | Ignored duplicate Dodge resolver for an in-flight request.", {
      requestId: resolutionRequestId,
      areaRequestId: String(request.areaRequestId ?? ""),
      defenderUuid: request.defenderUuid
    });
    return true;
  }

  if (resolutionRequestId) {
    attackDodgeResolutionInFlightRequests.add(resolutionRequestId);
  }

  let dodgeResolutionSucceeded = false;

  try {
  const quickeningResult = request.suppressTargetInterrupts
    ? null
    : await getQuickeningDodgeResult(
        defender,
        request
      );

  let dodgeResult =
    quickeningResult ??
    await getAttackDodgeResult(
      defender,
      request.attackFunctionType,
      request.effectDodgeModifier,
      request
    );

  if (!dodgeResult) {
    return false;
  }

  /*
   * Quickening já gera uma Esquiva automática.
   * Nesse caso Tuck and Roll não será oferecido,
   * pois o Ataque já não acertaria.
   */
  const tuckAndRollResult =
    await getTuckAndRollDodgeResult(
      defender,
      request,
      dodgeResult
    );

  if (tuckAndRollResult) {
    dodgeResult =
      tuckAndRollResult;
  }

  const outcome =
    getAttackDodgeOutcome(
      request,
      dodgeResult
    );

  const response = {
    requestId: request.requestId,
    attackerUuid: request.attackerUuid,
    defenderUuid: request.defenderUuid,
    resolverUserId: game.user.id,
    dodgeResult: serializeAttackDodgeResult(dodgeResult),
    outcome
  };

  try {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: defender }),
      content: buildAttackDodgeOutcomeCard(request, outcome),
      flags: {
        [game.system.id]: {
          attackDodgeResponse: response
        }
      }
    });
  } catch (error) {
    console.error("DDA | Could not create the Dodge response card.", error);
    ui.notifications.warn(localize("DDA.Warning.DodgeRollCancelledOrInvalid"));
    return false;
  }

  try {
    await recordAdaptiveIntelligenceExposure(defender, request);
  } catch (error) {
    console.warn("DDA | Could not record Adaptive Intelligence exposure.", error);
  }

  if (
    defender.type !== "character" &&
    !dodgeResult.quickening
  ) {
    await increaseDodgePenalty(
      defender,
      request,
      outcome
    );
  }

  dodgeResolutionSucceeded = true;
  return true;
  } finally {
    if (resolutionRequestId) {
      /*
       * Once the response card exists, hasAttackDodgeResponse() protects any
       * later invocation. On failure, releasing immediately allows a retry.
       */
      if (dodgeResolutionSucceeded) {
        globalThis.setTimeout(() => {
          attackDodgeResolutionInFlightRequests.delete(resolutionRequestId);
        }, 5_000);
      } else {
        attackDodgeResolutionInFlightRequests.delete(resolutionRequestId);
      }
    }
  }
}

async function cancelPendingAttackDodgeRequest(
  requestId,
  {
    reason = "cancelled",
    updateMessage = false
  } = {}
) {
  const cleanRequestId =
    String(
      requestId ?? ""
    );

  if (!cleanRequestId) {
    return false;
  }

  const request =
    pendingAttackDodgeRequests.get(
      cleanRequestId
    );

  if (!request) {
    return false;
  }

  if (request.timeoutId) {
    globalThis.clearTimeout(
      request.timeoutId
    );
  }

  pendingAttackDodgeRequests.delete(
    cleanRequestId
  );

  if (
    pendingAttackDodgeByAttacker.get(
      request.attackerUuid
    ) === cleanRequestId
  ) {
    pendingAttackDodgeByAttacker.delete(
      request.attackerUuid
    );
  }

  if (updateMessage) {
    const message =
      game.messages?.get(
        request.messageId
      );

    if (message) {
      const nextRequest = {
        ...foundry.utils.deepClone(
          getAttackDodgeRequestFromMessage(
            message
          ) ?? request
        ),

        status:
          "cancelled",

        cancelReason:
          reason
      };

      try {
        await message.update({
          content:
            buildCancelledAttackDodgeCard(
              nextRequest
            ),

          [
            `flags.${game.system.id}.attackDodgeRequest`
          ]:
            nextRequest
        });
      } catch (error) {
        console.warn(
          "DDA | Could not update the cancelled Dodge request card.",
          error
        );
      }
    }
  }

  request.resolve(
    null
  );

  return true;
}

async function cancelAttackDodgeRequestsForCombat(combat, reason = "combatEnded") {
  const combatId = String(combat?.id ?? "");
  if (!combatId) return;

  const requestIds = [...pendingAttackDodgeRequests.entries()]
    .filter(([, request]) => String(request?.combatId ?? "") === combatId)
    .map(([requestId]) => requestId);

  for (const requestId of requestIds) {
    await cancelPendingAttackDodgeRequest(requestId, {
      reason,
      updateMessage: true
    });
  }

  bulkAreaDodgeInFlightRequests.clear();
}

async function receiveAttackDodgeCancellation(
  message
) {
  const request =
    getAttackDodgeRequestFromMessage(
      message
    );

  if (
    !request ||
    request.status !== "cancelled"
  ) {
    return;
  }

  await cancelPendingAttackDodgeRequest(
    request.requestId,
    {
      reason:
        request.cancelReason ??
        "cancelled",

      updateMessage:
        false
    }
  );
}

async function requestAttackDodgeResult({
  attacker,
  defender,
  attackItem,
  attackFunctionType = "damage",
  effectDodgeModifier = 0,
  accuracySuccesses = 0,
  dodgeShouldHalve = false,
  equalAccuracyAndDodgeCountsAsMiss = false,
  areaAttack = false,
  areaRequestId = "",
  areaProgressMessageId = "",
  areaTargetTokenId = "",
  ignoresUncatchableTarget = false,
  suppressTargetInterrupts = false,
  fakeoutEligible = false
} = {}) {
  if (!attacker || !defender || !attackItem) return null;

  const cleanAreaRequestId = String(areaRequestId ?? "");
  const cleanAreaTargetTokenId = String(areaTargetTokenId ?? "");
  const areaDodgeCacheKey = areaAttack && cleanAreaRequestId
    ? `${cleanAreaRequestId}:${cleanAreaTargetTokenId || defender.uuid}`
    : "";

  if (areaDodgeCacheKey) {
    const cached = areaAttackDodgePromiseCache.get(areaDodgeCacheKey);
    if (cached?.promise) {
      console.debug("DDA | Reusing Area Dodge resolution instead of rolling twice.", {
        areaRequestId: cleanAreaRequestId,
        targetTokenId: cleanAreaTargetTokenId,
        defenderUuid: defender.uuid
      });
      return cached.promise;
    }
  }

  const requestId = foundry.utils.randomID();
  const authorizedUserIds = getAttackDodgeAuthorizedUserIds(defender);

  if (!authorizedUserIds.length) {
    ui.notifications.warn(formatI18n("DDA.Warning.NoEligibleDodgeRoller", {
      actor: defender.name
    }));
    return null;
  }

  const request = {
    requestId,
    status: "pending",
    ...attackDodgeWindowMetadata(),
    attackerUuid: attacker.uuid,
    attackerName: attacker.name,
    defenderUuid: defender.uuid,
    defenderName: defender.name,
    attackItemId: attackItem.id,
    attackName: attackItem.name,
    attackFunctionType,
    attackerSv: Math.max(0, Number(getActorSv(attacker) ?? 0)),
    areaAttack: Boolean(areaAttack),
    areaRequestId: cleanAreaRequestId,
    areaProgressMessageId: String(areaProgressMessageId ?? ""),
    areaTargetTokenId: cleanAreaTargetTokenId,
    effectDodgeModifier: Number(effectDodgeModifier ?? 0),
    accuracySuccesses: Math.max(0, Number(accuracySuccesses ?? 0)),
    dodgeShouldHalve: Boolean(dodgeShouldHalve),
    ignoresUncatchableTarget: Boolean(ignoresUncatchableTarget),
    suppressTargetInterrupts: Boolean(suppressTargetInterrupts),
    fakeoutEligible: Boolean(fakeoutEligible),

    equalAccuracyAndDodgeCountsAsMiss: Boolean(
      equalAccuracyAndDodgeCountsAsMiss
    ),

    authorizedUserIds,
    requesterUserId: game.user.id
  };

  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: buildPendingAttackDodgeCard(request),
    flags: {
      [game.system.id]: {
        attackDodgeRequest: request
      }
    }
  });

pendingAttackDodgeByAttacker.set(
  attacker.uuid,
  requestId
);

const dodgePromise = new Promise((resolve) => {
  const timeoutId =
    globalThis.setTimeout(
      () => {
        void cancelPendingAttackDodgeRequest(
          requestId,
          {
            reason:
              "timeout",

            updateMessage:
              true
          }
        );
      },

      Math.max(
        1,
        Number(request.expiresAt ?? Date.now() + ATTACK_DODGE_REQUEST_TIMEOUT_MS) - Date.now()
      )
    );

  pendingAttackDodgeRequests.set(
    requestId,
    {
      ...request,

      messageId:
        message.id,

      timeoutId,

      resolve
    }
  );
});

if (areaDodgeCacheKey) {
  areaAttackDodgePromiseCache.set(areaDodgeCacheKey, {
    promise: dodgePromise,
    createdAt: Date.now()
  });

  globalThis.setTimeout(() => {
    const cached = areaAttackDodgePromiseCache.get(areaDodgeCacheKey);
    if (cached?.promise === dodgePromise) {
      areaAttackDodgePromiseCache.delete(areaDodgeCacheKey);
    }
  }, AREA_ATTACK_DODGE_CACHE_TTL_MS);
}

return dodgePromise;
}

async function receiveAttackDodgeResponse(message) {
  const response = getAttackDodgeResponseFromMessage(message);
  if (!response) return;

  const requestId = String(response.requestId ?? "");
  if (!requestId) return;

  const request = pendingAttackDodgeRequests.get(requestId);
  if (!request) return;

  const invalidReason = attackDodgeInvalidReason(request);
  if (invalidReason) {
    await cancelPendingAttackDodgeRequest(requestId, {
      reason: invalidReason,
      updateMessage: true
    });
    return;
  }

  const resolverUserId = String(response.resolverUserId ?? "");
  const messageAuthorId = String(
    message?.author?.id ??
    message?.user?.id ??
    ""
  );

  if (messageAuthorId && messageAuthorId !== resolverUserId) {
    console.warn("DDA | Ignored Dodge response with a mismatched chat author.", {
      message,
      response
    });
    return;
  }

  if (!request.authorizedUserIds.includes(resolverUserId)) {
    console.warn("DDA | Ignored Dodge response from an unauthorized user.", {
      request,
      response
    });
    return;
  }

  if (
    String(response.attackerUuid ?? "") !== request.attackerUuid ||
    String(response.defenderUuid ?? "") !== request.defenderUuid
  ) {
    console.warn("DDA | Ignored Dodge response with mismatched attack context.", {
      request,
      response
    });
    return;
  }

  const dodgeResult = normalizeAttackDodgeResult(response.dodgeResult);
  const outcome = getAttackDodgeOutcome(request, dodgeResult);

  if (request.timeoutId) {
  globalThis.clearTimeout(
    request.timeoutId
  );
}

pendingAttackDodgeRequests.delete(
  requestId
);

  if (pendingAttackDodgeByAttacker.get(request.attackerUuid) === requestId) {
    pendingAttackDodgeByAttacker.delete(request.attackerUuid);
  }

  await markAttackDodgeRequestResolved(
    request,
    dodgeResult,
    resolverUserId,
    outcome
  );

  request.resolve(dodgeResult);
}

function getAttackDodgeRequestFromMessage(message) {
  return message?.getFlag?.(game.system.id, "attackDodgeRequest")
    ?? message?.flags?.[game.system.id]?.attackDodgeRequest
    ?? null;
}

function getAttackDodgeResponseFromMessage(message) {
  return message?.getFlag?.(game.system.id, "attackDodgeResponse")
    ?? message?.flags?.[game.system.id]?.attackDodgeResponse
    ?? null;
}

function hasAttackDodgeResponse(requestId = "") {
  const id = String(requestId ?? "");
  if (!id) return false;
  return Boolean((game.messages?.contents ?? []).some((message) => {
    const response = getAttackDodgeResponseFromMessage(message);
    return String(response?.requestId ?? "") === id;
  }));
}

function getAttackDodgeAuthorizedUserIds(defender) {
  if (!defender) return [];

  return game.users
    .filter((user) => {
      /*
       * Offline users cannot answer the pending chat request. Counting them
       * as resolvers can leave the attacker waiting until the timeout.
       */
      if (!user?.active) return false;
      if (user.isGM) return true;

      try {
        return defender.testUserPermission(
          user,
          CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
        );
      } catch (_error) {
        return false;
      }
    })
    .map((user) => user.id);
}

function canCurrentUserResolveAttackDodge(request, defender) {
  if (!defender) return false;
  if (game.user.isGM) return true;

  const authorizedUserIds = Array.isArray(request?.authorizedUserIds)
    ? request.authorizedUserIds
    : [];

  if (!authorizedUserIds.includes(game.user.id)) return false;

  try {
    return defender.testUserPermission(
      game.user,
      CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    );
  } catch (_error) {
    return false;
  }
}

function serializeAttackDodgeResult(
  result = {}
) {
  return {
    rolledSuccesses:
      Number(
        result.rolledSuccesses ?? 0
      ),

    automaticSuccesses:
      Number(
        result.automaticSuccesses ?? 0
      ),

    totalSuccesses:
      Number(
        result.totalSuccesses ?? 0
      ),

    originalTotalSuccesses:
      Number(
        result
          .originalTotalSuccesses ??
        result.totalSuccesses ??
        0
      ),

    quickening:
      Boolean(
        result.quickening
      ),

    quickeningTamerName:
      String(
        result.quickeningTamerName ?? ""
      ),

    tuckAndRoll:
      Boolean(
        result.tuckAndRoll
      ),

    tuckAndRollTamerName:
      String(
        result
          .tuckAndRollTamerName ??
        ""
      ),

    gritDefense:
      Boolean(
        result.gritDefense
      ),

    tamerDefense: result.tamerDefense
      ? {
          tn: Number(result.tamerDefense.tn ?? 0),
          total: Number(result.tamerDefense.total ?? 0),
          outcomeKey: String(result.tamerDefense.outcomeKey ?? ""),
          damage: Math.max(0, Number(result.tamerDefense.damage ?? 0)),
          areaAttack: Boolean(result.tamerDefense.areaAttack)
        }
      : null,

    suppressSuccessfulDodgeTriggers:
      Boolean(
        result
          .suppressSuccessfulDodgeTriggers
      )
  };
}

function normalizeAttackDodgeResult(
  result = {}
) {
  const totalSuccesses =
    Math.max(
      0,

      Number(
        result?.totalSuccesses ?? 0
      )
    );

  return {
    roll: null,

    rolledSuccesses:
      Math.max(
        0,

        Number(
          result?.rolledSuccesses ?? 0
        )
      ),

    automaticSuccesses:
      Math.max(
        0,

        Number(
          result?.automaticSuccesses ?? 0
        )
      ),

    totalSuccesses,

    originalTotalSuccesses:
      Math.max(
        0,

        Number(
          result
            ?.originalTotalSuccesses ??
          totalSuccesses
        )
      ),

    quickening:
      Boolean(
        result?.quickening
      ),

    quickeningTamerName:
      String(
        result
          ?.quickeningTamerName ?? ""
      ),

    tuckAndRoll:
      Boolean(
        result?.tuckAndRoll
      ),

    tuckAndRollTamerName:
      String(
        result
          ?.tuckAndRollTamerName ??
        ""
      ),

    gritDefense:
      Boolean(
        result?.gritDefense
      ),

    tamerDefense: result?.tamerDefense
      ? {
          tn: Number(result.tamerDefense.tn ?? 0),
          total: Number(result.tamerDefense.total ?? 0),
          outcomeKey: String(result.tamerDefense.outcomeKey ?? ""),
          damage: Math.max(0, Number(result.tamerDefense.damage ?? 0)),
          areaAttack: Boolean(result.tamerDefense.areaAttack)
        }
      : null,

    suppressSuccessfulDodgeTriggers:
      Boolean(
        result
          ?.suppressSuccessfulDodgeTriggers
      )
  };
}

function getAttackDodgeOutcome(
  request = {},
  dodgeResult = {}
) {
  const accuracySuccesses = Math.max(
    0,

    Number(
      request.accuracySuccesses ?? 0
    )
  );

  const rawDodgeSuccesses = Math.max(
    0,

    Number(
      dodgeResult.totalSuccesses ?? 0
    )
  );

  const originalRawDodgeSuccesses =
    Math.max(
      0,

      Number(
        dodgeResult
          .originalTotalSuccesses ??
        rawDodgeSuccesses
      )
    );

  const dodgeSuccesses =
    request.dodgeShouldHalve
      ? Math.ceil(
          rawDodgeSuccesses / 2
        )
      : rawDodgeSuccesses;

  const originalDodgeSuccesses =
    request.dodgeShouldHalve
      ? Math.ceil(
          originalRawDodgeSuccesses / 2
        )
      : originalRawDodgeSuccesses;

  const tamerDefense = dodgeResult.tamerDefense ?? null;

  const hit = dodgeResult.quickening
    ? false
    : tamerDefense
      ? Number(tamerDefense.damage ?? 0) > 0
      : accuracySuccesses > 0 &&
        (
          request
            .equalAccuracyAndDodgeCountsAsMiss
            ? accuracySuccesses >
                dodgeSuccesses
            : accuracySuccesses >=
                dodgeSuccesses
        );

  return {
    accuracySuccesses,
    rawDodgeSuccesses,
    dodgeSuccesses,

    originalRawDodgeSuccesses,
    originalDodgeSuccesses,

    quickening:
      Boolean(
        dodgeResult.quickening
      ),

    quickeningTamerName:
      String(
        dodgeResult
          .quickeningTamerName ?? ""
      ),

    tuckAndRoll:
      Boolean(
        dodgeResult.tuckAndRoll
      ),

    tuckAndRollTamerName:
      String(
        dodgeResult
          .tuckAndRollTamerName ??
        ""
      ),

    gritDefense:
      Boolean(
        dodgeResult.gritDefense
      ),

    tamerDefense,

    hit
  };
}

async function markAttackDodgeRequestResolved(
  request,
  dodgeResult,
  resolverUserId,
  outcome = {}
) {
  const message = game.messages?.get(request.messageId);
  if (!message) return;

  const nextRequest = {
    ...foundry.utils.deepClone(getAttackDodgeRequestFromMessage(message) ?? request),
    status: "resolved",
    resolverUserId,
    accuracySuccesses: Number(outcome.accuracySuccesses ?? request.accuracySuccesses ?? 0),
    rawDodgeSuccesses: Number(outcome.rawDodgeSuccesses ?? dodgeResult.totalSuccesses ?? 0),
    dodgeSuccesses:
      Number(
        outcome.dodgeSuccesses ??
        dodgeResult.totalSuccesses ??
        0
      ),

    quickening:
      Boolean(
        dodgeResult.quickening
      ),

    quickeningTamerName:
      String(
        dodgeResult
          .quickeningTamerName ?? ""
      ),

    originalRawDodgeSuccesses:
      Number(
        outcome
          .originalRawDodgeSuccesses ??
        dodgeResult
          .originalTotalSuccesses ??
        outcome.rawDodgeSuccesses ??
        0
      ),

    originalDodgeSuccesses:
      Number(
        outcome
          .originalDodgeSuccesses ??
        outcome.dodgeSuccesses ??
        0
      ),

    tuckAndRoll:
      Boolean(
        dodgeResult.tuckAndRoll
      ),

    tuckAndRollTamerName:
      String(
        dodgeResult
          .tuckAndRollTamerName ??
        ""
      ),

    gritDefense:
      Boolean(
        dodgeResult.gritDefense
      ),

    hit:
      Boolean(outcome.hit)
  };

  /*
   * Area Attacks already publish one outcome card for each Dodge and a final
   * aggregate damage card. Keeping the original request card and converting it
   * into a second outcome card duplicates the same result in chat. Remove the
   * request card after its response is accepted; fall back to the normal update
   * if the current user cannot delete it.
   */
  if (request.areaAttack) {
    try {
      await message.delete();
      return;
    } catch (error) {
      console.warn(
        "DDA | Could not remove the resolved Area Dodge request card.",
        error
      );
    }
  }

  try {
    await message.update({
      content: buildResolvedAttackDodgeCard(nextRequest),
      [`flags.${game.system.id}.attackDodgeRequest`]: nextRequest
    });
  } catch (error) {
    console.warn("DDA | Could not mark Dodge request as resolved.", error);
  }
}

function buildPendingAttackDodgeCard(request = {}) {
  return `
    <div class="dda-chat-card dda-effect-card effect-special dda-attack-dodge-request-card">
      <h2>${localize("DDA.MainStat.Dodge")}</h2>

      <ul class="dda-effect-list dda-attack-dodge-request-list">
        <li>
          ${localize("DDA.Attack.Attacker")}:
          <strong>${request.attackerName}</strong>.
        </li>

        <li>
          ${localize("DDA.Attack.Target")}:
          <strong>${request.defenderName}</strong>.
        </li>

        <li>
          ${localize("DDA.Attack.Attack")}:
          <strong>${request.attackName}</strong>.
        </li>
      </ul>

<div class="dda-attack-dodge-request-actions">
  <button
    type="button"
    class="dda-roll-attack-dodge"
    data-action="dda-roll-attack-dodge"
  >
    ${localize("DDA.Button.Roll")}
    ${localize("DDA.MainStat.Dodge")}
  </button>

  <button
    type="button"
    class="dda-cancel-attack-dodge"
    data-action="dda-cancel-attack-dodge"
  >
    ${combatText(
      "Cancelar Ataque",
      "Cancel Attack"
    )}
  </button>
</div>
    </div>
  `;
}

function buildCancelledAttackDodgeCard(
  request = {}
) {
  const timedOut =
    request.cancelReason ===
    "timeout";

  const deleted =
    request.cancelReason ===
    "messageDeleted";

  const combatEnded = ["combatEnded", "combatChanged"].includes(String(request.cancelReason ?? ""));
  const sceneChanged = request.cancelReason === "sceneChanged";
  const staleLegacy = request.cancelReason === "staleLegacy";

  const reason = timedOut
    ? combatText(
        "A solicitação expirou sem uma resposta.",
        "The request expired without a response."
      )
    : deleted
      ? combatText(
          "O card da solicitação foi removido.",
          "The request card was removed."
        )
      : combatEnded
        ? combatText(
            "O Combate terminou ou mudou; esta Esquiva foi cancelada.",
            "The Combat ended or changed; this Dodge was cancelled."
          )
        : sceneChanged
          ? combatText(
              "A Cena mudou; esta Esquiva foi cancelada.",
              "The Scene changed; this Dodge was cancelled."
            )
          : staleLegacy
            ? combatText(
                "Este card de Esquiva pertence a uma sessão anterior e foi invalidado.",
                "This Dodge card belongs to an earlier session and was invalidated."
              )
            : combatText(
                "O Ataque foi cancelado.",
                "The Attack was cancelled."
              );

  return `
    <div class="dda-chat-card dda-effect-card effect-negative dda-attack-dodge-request-card cancelled">
      <h2>
        ${localize(
          "DDA.MainStat.Dodge"
        )}
      </h2>

      <ul class="dda-effect-list dda-attack-dodge-request-list">
        <li>
          ${localize(
            "DDA.Attack.Attacker"
          )}:
          <strong>
            ${request.attackerName}
          </strong>.
        </li>

        <li>
          ${localize(
            "DDA.Attack.Target"
          )}:
          <strong>
            ${request.defenderName}
          </strong>.
        </li>

        <li>
          ${localize(
            "DDA.Attack.Attack"
          )}:
          <strong>
            ${request.attackName}
          </strong>.
        </li>

        <li>
          <strong>
            ${reason}
          </strong>
        </li>
      </ul>
    </div>
  `;
}

function buildResolvedAttackDodgeCard(request = {}) {
  const hit = Boolean(request.hit);
  const resultLabel = hit
    ? localize("DDA.Attack.Result.Hit")
    : localize("DDA.Attack.Result.Miss");
  const resultClass = hit ? "hit" : "miss";

  const rawDodgeSuccesses = Number(
    request.rawDodgeSuccesses ??
    request.dodgeSuccesses ??
    0
  );

  const dodgeSuccesses = Number(request.dodgeSuccesses ?? 0);

  const dodgeText = rawDodgeSuccesses !== dodgeSuccesses
    ? `${rawDodgeSuccesses} → ${dodgeSuccesses}`
    : `${dodgeSuccesses}`;

  return `
    <div class="dda-chat-card dda-effect-card effect-special dda-attack-dodge-request-card resolved ${resultClass}">
      <h2>${localize("DDA.MainStat.Dodge")}</h2>

      <ul class="dda-effect-list dda-attack-dodge-request-list">
        <li>
          ${localize("DDA.Attack.Attacker")}:
          <strong>${request.attackerName}</strong>.
        </li>

        <li>
          ${localize("DDA.Attack.Target")}:
          <strong>${request.defenderName}</strong>.
        </li>

        <li>
          ${localize("DDA.Attack.Attack")}:
          <strong>${request.attackName}</strong>.
        </li>

        <li>
          ${localize("DDA.Attack.AccuracySuccesses")}:
          <strong>${Number(request.accuracySuccesses ?? 0)}</strong>.
        </li>

        <li class="pool-total-successes">
          ${localize("DDA.Attack.DodgeSuccesses")}:
          <strong>${dodgeText}</strong>.
        </li>

                ${
          request.quickening
            ? `
              <li>
                <strong>
                  ${localize(
                    "DDA.TamerTalent.Quickening.Title"
                  )}:
                </strong>

                ${localize(
                  "DDA.TamerTalent.Quickening.AutomaticDodge"
                )}
              </li>
            `
            : ""
        }

                ${
          request.tuckAndRoll
            ? `
              <li>
                <strong>
                  ${localize(
                    "DDA.TamerTalent.TuckAndRoll.Title"
                  )}:
                </strong>

                ${formatI18n(
                  "DDA.TamerTalent.TuckAndRoll.Applied",
                  {
                    actor:
                      escapeHtml(
                        request
                          .tuckAndRollTamerName ??
                        request.defenderName ??
                        ""
                      ),

                    original:
                      Number(
                        request
                          .originalDodgeSuccesses ??
                        0
                      ),

                    final:
                      dodgeSuccesses
                  }
                )}
              </li>
            `
            : ""
        }
                ${
          request.gritDefense
            ? `
              <li>
                <strong>
                  ${localize(
                    "DDA.TamerTalent.Grit.Title"
                  )}:
                </strong>

                ${localize(
                  "DDA.TamerTalent.Grit.DefenseApplied"
                )}
              </li>
            `
            : ""
        }
      </ul>

      <h3 class="attack-result-title">${resultLabel}</h3>
    </div>
  `;
}

function buildAttackDodgeOutcomeCard(request = {}, outcome = {}) {
  const hit = Boolean(outcome.hit);
  const resultLabel = hit
    ? localize("DDA.Attack.Result.Hit")
    : localize("DDA.Attack.Result.Miss");
  const resultClass = hit ? "hit" : "miss";

  const rawDodgeSuccesses = Number(
    outcome.rawDodgeSuccesses ??
    outcome.dodgeSuccesses ??
    0
  );

  const dodgeSuccesses = Number(outcome.dodgeSuccesses ?? 0);

  const dodgeText = rawDodgeSuccesses !== dodgeSuccesses
    ? `${rawDodgeSuccesses} → ${dodgeSuccesses}`
    : `${dodgeSuccesses}`;

  return `
    <div class="dda-chat-card dda-effect-card effect-special dda-attack-dodge-outcome-card ${resultClass}">
      <h2>${localize("DDA.MainStat.Dodge")}</h2>

      <ul class="dda-effect-list dda-attack-dodge-request-list">
        <li>
          ${localize("DDA.Attack.Attacker")}:
          <strong>${request.attackerName}</strong>.
        </li>

        <li>
          ${localize("DDA.Attack.Target")}:
          <strong>${request.defenderName}</strong>.
        </li>

        <li>
          ${localize("DDA.Attack.Attack")}:
          <strong>${request.attackName}</strong>.
        </li>

        <li>
          ${localize("DDA.Attack.AccuracySuccesses")}:
          <strong>${Number(outcome.accuracySuccesses ?? 0)}</strong>.
        </li>

        <li>
          ${localize("DDA.Attack.DodgeSuccesses")}:
          <strong>${dodgeText}</strong>.
        </li>
        ${
          outcome.quickening
            ? `
              <li>
                <strong>
                  ${localize(
                    "DDA.TamerTalent.Quickening.Title"
                  )}:
                </strong>

                ${localize(
                  "DDA.TamerTalent.Quickening.AutomaticDodge"
                )}
              </li>
            `
            : ""
        }

                ${
          outcome.tuckAndRoll
            ? `
              <li>
                <strong>
                  ${localize(
                    "DDA.TamerTalent.TuckAndRoll.Title"
                  )}:
                </strong>

                ${formatI18n(
                  "DDA.TamerTalent.TuckAndRoll.Applied",
                  {
                    actor:
                      escapeHtml(
                        outcome
                          .tuckAndRollTamerName ??
                        request.defenderName ??
                        ""
                      ),

                    original:
                      Number(
                        outcome
                          .originalDodgeSuccesses ??
                        0
                      ),

                    final:
                      dodgeSuccesses
                  }
                )}
              </li>
            `
            : ""
        }
                ${
          outcome.gritDefense
            ? `
              <li>
                <strong>
                  ${localize(
                    "DDA.TamerTalent.Grit.Title"
                  )}:
                </strong>

                ${localize(
                  "DDA.TamerTalent.Grit.DefenseApplied"
                )}
              </li>
            `
            : ""
        }
      </ul>

      <h3 class="attack-result-title">${resultLabel}</h3>
    </div>
  `;
}



async function getAttackDodgeResult(
  defender,
  attackFunctionType = "damage",
  effectDodgeModifier = 0,
  request = {}
) {
  if (defender.type === "character" && attackFunctionType === "support") {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: defender }),
content: `
  <div class="dda-chat-card dda-effect-card effect-positive dda-support-defense-card">
    <h2>${localize("DDA.Attack.SupportDefense")}</h2>

    <ul class="dda-effect-list dda-support-defense-list">
      <li>
        ${localize("DDA.Attack.Target")}:
        <strong>${defender.name}</strong>.
      </li>

      <li>
        ${localize("DDA.Label.Type")}:
        <strong>${localize("DDA.Attack.SupportTargetTamer")}</strong>.
      </li>

      <li>
        ${localize("DDA.Attack.SupportNoDodge")}
      </li>

      <li>
        ${localize("DDA.Attack.TotalDodgeSuccesses")}:
        <strong>0</strong>.
      </li>
    </ul>
  </div>
`
    });

    return {
      roll: null,
      rolledSuccesses: 0,
      automaticSuccesses: 0,
      totalSuccesses: 0
    };
  }

if (defender.type === "character") {
  return rollTamerEvadeAsDodge(
    defender,
    effectDodgeModifier,
    request
  );
}

const adaptiveIntelligence =
  getAdaptiveIntelligenceDodgeBonus(defender, request);

const adaptiveBonus = Math.max(
  0,
  Number(adaptiveIntelligence?.bonus ?? 0)
);

return rollPool(defender, "dodge", {
  allowZeroSuccesses: true,
  diceModifier: Number(effectDodgeModifier ?? 0) + adaptiveBonus,
  modifierBreakdown: adaptiveBonus > 0
    ? [{
        label: combatText("Inteligência Adaptativa", "Adaptive Intelligence"),
        value: adaptiveBonus
      }]
    : [],
  externalLabel: adaptiveBonus > 0
    ? `${localize("DDA.Attack.ActiveEffects")} · ${combatText("Inteligência Adaptativa", "Adaptive Intelligence")} +${adaptiveBonus}`
    : localize("DDA.Attack.ActiveEffects")
});
}

async function rollTamerEvadeAsDodge(
  actor,
  effectDodgeModifier = 0,
  request = {}
) {
  const system =
    actor.system;

  const evadeSkill =
    system.skills?.evade;

  if (!evadeSkill) {
    ui.notifications.warn(
      localize(
        "DDA.Warning.EvadeSkillNotFound"
      )
    );

    return null;
  }

  const enduranceSkill =
    system.skills?.endurance;

  const gritAvailable =
    Boolean(
      game.combat?.started &&
      enduranceSkill &&
      hasUnlockedOfficialTamerTalent(
        actor,
        "grit"
      )
    );

  let gritDefense = false;

  if (gritAvailable) {
    gritDefense =
      Boolean(
        await foundry.applications.api.DialogV2.confirm({
          window: { title: localize(
              "DDA.TamerTalent.Grit.Title"
            ) },

          content: `
            <div class="dda-confirm-dialog dda-grit-defense-dialog">
              <p>
                ${formatI18n(
                  "DDA.TamerTalent.Grit.DefensePrompt",
                  {
                    actor:
                      escapeHtml(
                        actor.name
                      ),

                    attack:
                      escapeHtml(
                        request.attackName ??
                        ""
                      ),

                    attacker:
                      escapeHtml(
                        request.attackerName ??
                        ""
                      )
                  }
                )}
              </p>

              <p>
                ${localize(
                  "DDA.TamerTalent.Grit.DefenseWarning"
                )}
              </p>
            </div>
          `,

          no: { default: true },
          rejectClose: false,
          modal: true
          })
      );
  }

  const skillKey =
    gritDefense
      ? "endurance"
      : "evade";

  const skill =
    gritDefense
      ? enduranceSkill
      : evadeSkill;

  if (!skill) {
    return null;
  }

  /*
   * Grit substitui o Teste de Evasão por um
   * Teste de Resistência completo.
   *
   * Portanto, Resistência usa seu próprio
   * Atributo relevante, e não o Atributo
   * originalmente ligado à Evasão.
   */
  const attributeKey =
    skill.attributes?.[0] ??
    (
      gritDefense
        ? "body"
        : "agility"
    );

  const attribute =
    system.attributes
      ?.[attributeKey];

  if (!attribute) {
    ui.notifications.warn(
      localize(
        "DDA.Warning.EvadeAttributeNotFound"
      )
    );

    return null;
  }

  const attributeValue =
    Number(
      attribute.value ?? 0
    );

  const skillValue =
    Number(
      skill.value ?? 0
    );

  const skillModifier =
    skillValue > 0
      ? skillValue
      : -1;

  const modifier =
    attributeValue +
    skillModifier +
    Number(
      effectDodgeModifier ?? 0
    );

  const roll =
    await new Roll(
      "3d6 + @modifier",
      {
        modifier
      }
    ).evaluate();

  const total =
    Number(
      roll.total ?? 0
    );

  const totalSuccesses =
    Math.max(
      0,
      Math.floor(
        total / 5
      )
    );

  const attackerSv = Math.max(0, Number(request.attackerSv ?? 0));
  const tn = 12 + (attackerSv * 2);
  const diceResults = Array.from(roll.dice ?? []).flatMap((term) =>
    Array.from(term.results ?? []).map((result) => Number(result.result ?? 0))
  );
  const checkOutcome = getTamerCheckOutcome(total, tn, diceResults);
  const failureMargin = Math.max(0, tn - total);
  let defenseDamage = 0;

  if (!["success", "criticalSuccess"].includes(checkOutcome.key)) {
    if (request.areaAttack) {
      defenseDamage = 1;
    } else if (checkOutcome.key === "criticalFailure") {
      defenseDamage = 3;
    } else if (failureMargin <= 2) {
      defenseDamage = 1;
    } else {
      defenseDamage = 2;
    }
  }

  if (gritDefense) {
    defenseDamage = Math.max(1, defenseDamage);
  }

  const tamerDefense = {
    tn,
    total,
    outcomeKey: checkOutcome.key,
    damage: defenseDamage,
    areaAttack: Boolean(request.areaAttack)
  };

  const gritNote =
    gritDefense
      ? `
        <li>
          <strong>
            ${localize(
              "DDA.TamerTalent.Grit.Title"
            )}:
          </strong>

          ${localize(
            "DDA.TamerTalent.Grit.DefenseApplied"
          )}
        </li>
      `
      : "";

  const flavor = `
    <div class="dda-chat-card dda-effect-card effect-special dda-pool-card dda-tamer-dodge-card">
      <h2>
        ${formatI18n(
          "DDA.Attack.SkillDefense",
          {
            skill:
              game.i18n.localize(
                skill.label
              )
          }
        )}
      </h2>

      <ul class="dda-effect-list dda-pool-summary-list dda-tamer-dodge-list">
        <li>
          ${localize(
            "DDA.TamerTalent.Requirement.Attribute"
          )}:

          <strong>
            ${game.i18n.localize(
              attribute.label
            )}
          </strong>

          ${attributeValue}.
        </li>

        <li>
          ${localize(
            "DDA.TamerTalent.Requirement.Skill"
          )}:

          ${
            skillValue > 0
              ? `
                <strong>
                  ${game.i18n.localize(
                    skill.label
                  )}
                </strong>

                ${skillValue}.
              `
              : `
                <strong>
                  ${localize(
                    "DDA.TamerSkillDialog.Untrained"
                  )}
                </strong>

                — ${localize(
                  "DDA.Attack.Penalty"
                )}

                <strong>-1</strong>.
              `
          }
        </li>

        <li>
          ${localize(
            "DDA.Attack.FinalModifier"
          )}:

          <strong>
            ${
              modifier >= 0
                ? `+${modifier}`
                : modifier
            }
          </strong>.
        </li>

        ${
          effectDodgeModifier !== 0
            ? `
              <li>
                ${localize(
                  "DDA.Attack.EffectModifier"
                )}:

                <strong>
                  ${
                    effectDodgeModifier >= 0
                      ? `+${effectDodgeModifier}`
                      : effectDodgeModifier
                  }
                </strong>.
              </li>
            `
            : ""
        }

        ${gritNote}

        <li>
          ${localize(
            "DDA.Roll.Result"
          )}:

          <strong>
            ${total}
          </strong>.
        </li>

        <li>
          ${localize("DDA.Roll.TN", "TN")}:
          <strong>${tn}</strong>.
        </li>

        <li>
          ${localize("DDA.Roll.Outcome", "Resultado")}:
          <strong>${escapeHtml(checkOutcome.label)}</strong>.
        </li>

        <li class="pool-total-successes">
          ${localize("DDA.TamerCombat.DamageTaken", "Dano sofrido")}:
          <strong>${defenseDamage}</strong>.
        </li>
      </ul>
    </div>
  `;

  await roll.toMessage({
    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    flavor
  });

  return {
    roll,

    rolledSuccesses:
      totalSuccesses,

    automaticSuccesses: 0,

    totalSuccesses,

    gritDefense,
    tamerDefense
  };
}

async function getShieldTempData(defender, effect) {
  let sourceActor = null;

  if (effect.sourceActorUuid) {
    try {
      sourceActor = await fromUuid(effect.sourceActorUuid);
    } catch (error) {
      console.warn("DDA | Could not resolve [SHIELD] source.", error);
    }
  }

  const bit = Math.max(
    0,
    Number(
      effect.basePotency ??
      sourceActor?.system?.derivedStats?.bit?.total ??
      sourceActor?.system?.derivedStats?.bit?.value ??
      0
    )
  );
  const stageValue = Math.max(0, Number(sourceActor?.system?.stageValue ?? 0));
  const potencyBonus = Math.max(0, Number(effect.potencyBonus ?? 0));

  const resistance = Math.max(
    0,
    Number(
      effect.resistance ??
      defender.system.miscStats?.resistance?.total ??
      defender.system.miscStats?.resistance?.value ??
      defender.system.derived?.sv?.value ??
      0
    )
  );

  /*
   * [SHIELD] is BIT + Stage and is treated as a Positive Effect. Signature
   * Battery, Effect Warrior and the [MELEE][SUPPORT] bonus are therefore
   * included before Resistance. Resistance cannot reduce a real positive
   * magnitude below 2.
   */
  const rawAmount = Math.max(0, bit + stageValue + potencyBonus);
  const amount = Math.max(
    Math.min(2, rawAmount),
    rawAmount - resistance
  );

  return {
    bit,
    stageValue,
    potencyBonus,
    resistance,
    rawAmount,
    amount
  };
}

function stripShieldTempSource(source = "") {
  return String(source ?? "")
    .split("+")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      const key = identityForMatching(entry);
      return !key.includes("shield") && !key.includes("escudo");
    })
    .join(" + ");
}

async function applyShieldTempWounds(defender, amount, shieldEffect) {
  const rootPath = defender.type === "character"
    ? "system.derived.wounds.temp"
    : ["digimon", "npc"].includes(defender.type)
      ? "system.miscStats.wounds.temp"
      : "";

  if (!rootPath) return;

  const temp = foundry.utils.getProperty(
    defender,
    rootPath
  ) ?? {};

  const current = Math.max(
    0,
    Number(temp.value ?? 0)
  );

  const previousShield = (
    defender.system?.effects?.active ?? []
  ).find((effect) => {
    return getEffectTagKey(effect?.tag) === "shield";
  });

  const previousShieldRemaining = Math.max(
    0,
    Number(
      previousShield?.tempWoundsRemaining ??
      previousShield?.tempWounds ??
      0
    )
  );

  const nonShieldTemp = Math.max(
    0,
    current - previousShieldRemaining
  );

  const shieldAmount = Math.max(
    0,
    Number(amount ?? 0)
  );

  const cleanSource = stripShieldTempSource(
    temp.source
  );

  const shieldLabel = String(
    shieldEffect?.label ??
    localize("DDA.Effect.Shield") ??
    "[SHIELD]"
  ).trim();

  const nextSource = [
    cleanSource,
    ...(shieldAmount > 0 ? [shieldLabel] : [])
  ].filter(Boolean).join(" + ");

  await defender.update({
    [`${rootPath}.value`]: nonShieldTemp + shieldAmount,
    [`${rootPath}.source`]: nextSource,
    [`${rootPath}.duration`]: nextSource
      ? shieldEffect.remaining ?? shieldEffect.duration ?? 3
      : ""
  });
}

function getEffectTagKey(tag) {
  return String(tag ?? "")
    .trim()
    .replace("[", "")
    .replace("]", "")
    .toLowerCase();
}
function applyCleanseToEffectList(currentEffects, amount = 1, selectedEffectKeys = []) {
  const remainingEffects = [];
  const expiredEffects = [];
  const affectedEffects = [];

  const selectedKeys = new Set(
    selectedEffectKeys.map((key) => getEffectTagKey(key)).filter(Boolean)
  );

  const useSelection = selectedKeys.size > 0;

  for (const effect of currentEffects) {
    const effectKey = getEffectTagKey(effect.tag);

    if (effectKey === "cleanse") {
      continue;
    }

    if (effect.cannotCleanse) {
      remainingEffects.push(effect);
      continue;
    }

    if (useSelection && !selectedKeys.has(effectKey)) {
      remainingEffects.push(effect);
      continue;
    }

    const currentRemaining = Number(effect.remaining ?? effect.duration ?? 1);
    const nextRemaining = effect.cleanseEndsImmediately
      ? 0
      : currentRemaining - amount;

    affectedEffects.push({
      ...effect,
      previousRemaining: currentRemaining,
      nextRemaining: Math.max(0, nextRemaining)
    });

    if (nextRemaining <= 0) {
      expiredEffects.push({
        ...effect,
        remaining: 0
      });

      continue;
    }

    remainingEffects.push({
      ...effect,
      remaining: nextRemaining
    });
  }

  return {
    beforeCount: currentEffects.length,
    afterCount: remainingEffects.length,
    remainingEffects,
    expiredEffects,
    affectedEffects,
    selected: useSelection
  };
}


async function clearShieldTempFromCleanse(actor) {
  if (actor.type === "character") {
    await actor.update({
      "system.derived.wounds.temp.value": 0,
      "system.derived.wounds.temp.source": "",
      "system.derived.wounds.temp.duration": ""
    });

    return;
  }

  if (actor.type === "digimon" || actor.type === "npc") {
    await actor.update({
      "system.miscStats.wounds.temp.value": 0,
      "system.miscStats.wounds.temp.source": "",
      "system.miscStats.wounds.temp.duration": ""
    });
  }
}

async function createCleanseChatMessage(defender, cleanseReport) {
  const modeLabel = cleanseReport.selective
  ? localize("DDA.Cleanse.Selective")
  : localize("DDA.Cleanse.Total");

  const resultClass = cleanseReport.amount > 0
    ? "cleanse-success"
    : "cleanse-none";

await ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor: defender }),
  content: `
    <div class="dda-chat-card dda-effect-card effect-positive dda-cleanse-card ${resultClass}">
<h2>${localize("DDA.Effect.Cleanse")}</h2>

      <p>
${formatI18n("DDA.Cleanse.SourcePurifiedTarget", {
  source: `<strong>${cleanseReport.sourceName}</strong>`,
  target: `<strong>${defender.name}</strong>`
})}
      </p>

      <ul class="dda-effect-list dda-cleanse-list">
        <li>
${localize("DDA.Cleanse.Mode")}:
          <strong>${modeLabel}</strong>.
        </li>

        <li>
${localize("DDA.Cleanse.DurationReduction")}:
          <strong>${cleanseReport.amount}</strong>.
        </li>

        ${
          cleanseReport.combinedSuccesses !== null
            ? `
              <li>
${localize("DDA.Cleanse.CombinedSuccesses")}:
                <strong>${cleanseReport.combinedSuccesses}</strong>.
              </li>

              <li>
${localize("DDA.Cleanse.TargetHealthSuccesses")}:
                <strong>${cleanseReport.targetHealthSuccesses}</strong>.
              </li>
            `
            : ""
        }

        <li class="cleanse-affected-effects">
${localize("DDA.Cleanse.AffectedEffects")}:
          <div class="cleanse-effect-chips">
            ${
              cleanseReport.affectedEffects?.length
                ? cleanseReport.affectedEffects.map((effect) => {
                    const label = effect.label ?? effect.tag;
                    const expired = Number(effect.nextRemaining ?? 0) <= 0;
                    const effectClass = expired ? "effect-expired" : "effect-reduced";

                    return `
                      <span class="${effectClass}">
                        <strong>${label}</strong>
                        ${effect.previousRemaining} → ${effect.nextRemaining}
                      </span>
                    `;
                  }).join("")
: `<span class="effect-none">${localize("DDA.Cleanse.NoEffectReduced")}</span>`
            }
          </div>
        </li>

        ${
          cleanseReport.expiredEffects.length
            ? `
              <li class="cleanse-expired-effects">
${localize("DDA.Cleanse.ExpiredEffects")}:
                <strong>${cleanseReport.expiredEffects.map((effect) => effect.label ?? effect.tag).join(", ")}</strong>.
              </li>
            `
            : ""
        }

        ${
          Number(cleanseReport.resolveReduced ?? 0) > 0
            ? `<li>${combatText("Resolve reduzido", "Resolve reduced")}: <strong>${cleanseReport.resolveBefore} → ${cleanseReport.resolveAfter}</strong>.</li>`
            : ""
        }

        <li>
${localize("DDA.Cleanse.ActiveEffects")}:
          <strong>${cleanseReport.beforeCount} → ${cleanseReport.afterCount}</strong>.
        </li>
      </ul>
    </div>
  `
});
}

function getCombatActorFromTargetToken(targetToken) {
  if (!targetToken) return null;

  const tokenActor = targetToken.actor;
  if (!tokenActor) return null;

  return tokenActor;
}

function actorsMatch(left, right) {
  if (!left || !right) return false;

  const leftUuid = String(left.uuid ?? "");
  const rightUuid = String(right.uuid ?? "");
  const leftId = String(left.id ?? "");
  const rightId = String(right.id ?? "");

  return Boolean(
    (leftUuid && rightUuid && leftUuid === rightUuid) ||
    (leftId && rightId && leftId === rightId)
  );
}

function getTokenForActor(actor, combatant = null) {
  const tokenId = combatant?.tokenId ?? combatant?.token?.id ?? "";
  const combatToken = tokenId
    ? canvas.tokens?.get(tokenId)
    : null;

  if (combatToken) return combatToken;

  return canvas.tokens?.placeables?.find((token) => {
    return actorsMatch(token?.actor, actor);
  }) ?? null;
}

function getAttackCombatContext(attacker, attackOptions = {}) {
  const combat = game.combat;

  if (!combat?.started) {
    return {
      ok: true,
      combat: null,
      combatant: null,
      token: getTokenForActor(attacker)
    };
  }

  const combatant = getCombatantForActor(combat, attacker);

  if (!combatant) {
    if (
      attackOptions.evokerMinionCommand &&
      attacker.flags?.["digimon-digital-adventures"]?.evokerCreation?.kind === "minion"
    ) {
      const token = getTokenForActor(attacker);
      return token
        ? { ok: true, combat, combatant: null, token, evokerMinionCommand: true }
        : {
            ok: false,
            message: combatText(
              `${attacker.name} precisa ter um Token no canvas para atacar.`,
              `${attacker.name} needs a Token on the canvas to Attack.`
            )
          };
    }
    return {
      ok: false,
      message: combatText(
        `${attacker.name} não está no Combate ativo.`,
        `${attacker.name} is not in the active Combat.`
      )
    };
  }

  const isInterrupt = Boolean(
    attackOptions.isInterrupt ||
    attackOptions.allowOutOfTurn ||
    attackOptions.clashContext?.isInterrupt
  );

  const activeUnitContext = getActiveDDAUnitContext(attacker, combat);

  if (!isInterrupt && !activeUnitContext.allowed) {
    return {
      ok: false,
      message: combatText(
        activeUnitContext.ended
          ? `${attacker.name} já encerrou sua parte desta ativação.`
          : `Apenas integrantes da unidade ativa podem usar a Ação de Ataque agora.`,
        activeUnitContext.ended
          ? `${attacker.name} has already ended their part of this activation.`
          : `Only members of the active unit can use the Attack Action right now.`
      )
    };
  }

  const token = getTokenForActor(attacker, combatant);

  if (!token) {
    return {
      ok: false,
      message: combatText(
        `${attacker.name} precisa ter um Token no canvas para atacar em Combate.`,
        `${attacker.name} needs a Token on the canvas to attack in Combat.`
      )
    };
  }

  return {
    ok: true,
    combat,
    combatant,
    token
  };
}

function validateAttackTargeting({
  attacker,
  attackerToken,
  targetToken,
  attackItem,
  qualityAttackModifier,
  attackRangeTotal,
  attackEffectiveLimitTotal,
  attackOptions = {}
} = {}) {
  const rangeType = String(attackItem?.system?.baseTags?.rangeType ?? "")
    .trim()
    .toLowerCase();

  if (!game.combat?.started && !attackerToken) {
    return {
      valid: true,
      distance: null,
      accuracyPenalty: 0,
      rangeType
    };
  }

  if (!attackerToken || !targetToken) {
    return {
      valid: false,
      message: combatText(
        "Atacante e alvo precisam ter Tokens no canvas para medir o alcance.",
        "Attacker and target need Tokens on the canvas to measure range."
      )
    };
  }

  const distance = getTokenGridDistance(attackerToken, targetToken);

  if (rangeType === "melee") {
    const reach = Math.max(
      1,
      1 + Number(qualityAttackModifier?.meleeReachBonus ?? 0)
    );

    if (
      distance > reach &&
      !attackOptions?.punishingStrikeContext?.ignoreMeleeRange &&
      !attackOptions?.bossSpatialDistortionContext?.active
    ) {
      return {
        valid: false,
        reason: "melee-out-of-reach",
        distance,
        reach,
        rangeType,
        message: combatText(
          `Alvo fora do alcance corpo a corpo: ${distance} Espaços de distância, alcance ${reach}.`,
          `Target is outside melee reach: ${distance} Spaces away, reach ${reach}.`
        )
      };
    }

    const longArmsPenalty = Math.max(
      0,
      Number(qualityAttackModifier?.longArmsAccuracyPenalty ?? 0)
    );

    return {
      valid: true,
      distance,
      reach,
      rangeType,
      longArmsPenalty,
      accuracyPenalty: -longArmsPenalty
    };
  }

  if (["range", "ranged"].includes(rangeType)) {
    const range = Math.max(0, Number(attackRangeTotal ?? 0));
    const effectiveLimit = Math.max(0, Number(attackEffectiveLimitTotal ?? 0));

    if (
      distance > effectiveLimit &&
      !attackOptions?.bossSpatialDistortionContext?.active
    ) {
      return {
        valid: false,
        message: combatText(
          `Alvo fora do Limite Efetivo: ${distance} Espaços de distância, limite ${effectiveLimit}.`,
          `Target is beyond Effective Limit: ${distance} Spaces away, limit ${effectiveLimit}.`
        )
      };
    }

    const beyondRangePenalty = (
      attackOptions?.counterattackContext?.ignoreEffectiveLimitPenalty ||
      attackOptions?.bossSpatialDistortionContext?.active
    )
      ? 0
      : Math.max(0, distance - range);

    const adjacentEnemy = !attackOptions.ignoreAdjacentEnemyPenalty &&
      !qualityAttackModifier?.recoilIgnoreAdjacentAccuracyPenalty &&
      hasAdjacentEnemyToken(attacker, attackerToken);

    const adjacentEnemyPenalty = adjacentEnemy ? 3 : 0;

    return {
      valid: true,
      distance,
      range,
      effectiveLimit,
      rangeType,
      beyondRangePenalty,
      adjacentEnemyPenalty,
      accuracyPenalty: -(beyondRangePenalty + adjacentEnemyPenalty)
    };
  }

  return {
    valid: true,
    distance,
    rangeType,
    accuracyPenalty: 0
  };
}

function getAttackCombatSide(actor) {
  const combatant = getCombatantForActor(game.combat, actor);

  const rawSide =
    combatant?.getFlag?.(game.system.id, "initiative.side") ??
    combatant?.flags?.[game.system.id]?.initiative?.side ??
    combatant?.getFlag?.(game.system.id, "side") ??
    combatant?.flags?.[game.system.id]?.side ??
    "";

  return String(rawSide).trim().toLowerCase();
}

function areAttackActorsEnemies(attacker, candidate) {
  const attackerSide = getAttackCombatSide(attacker);
  const candidateSide = getAttackCombatSide(candidate);

  // Dentro de Combate, a Iniciativa DDA define os lados.
  if (attackerSide && candidateSide) {
    return attackerSide !== candidateSide;
  }

  // Fora de Combate, mantém a lógica antiga como fallback.
  return !areActorsAllies(attacker, candidate);
}

function hasAdjacentEnemyToken(attacker, attackerToken) {
  if (!attacker || !attackerToken) return false;

  return (canvas.tokens?.placeables ?? []).some((token) => {
    if (!token?.actor || token === attackerToken) return false;
    if (actorsMatch(token.actor, attacker)) return false;
    if (!areAttackActorsEnemies(attacker, token.actor)) return false;

    return getTokenGridDistance(attackerToken, token) <= 1;
  });
}
function hasCleanseTag(activeEffectTags = []) {
  return activeEffectTags.some((tag) => getEffectTagKey(tag) === "cleanse");
}
async function getCleanseDeclaration(defender, activeEffectTags = []) {
  if (!hasCleanseTag(activeEffectTags)) {
    return {
      enabled: false,
      selective: false,
      selectedEffectKeys: [],
      reduceResolve: false
    };
  }

  const activeEffects = defender.system.effects?.active ?? [];
  const resolve = getCombatMonsterResolve(defender);

  if (!activeEffects.length && resolve <= 0) {
    return {
      enabled: true,
      selective: false,
      selectedEffectKeys: [],
      reduceResolve: false
    };
  }

  const effectOptions = activeEffects.map((effect) => {
    const key = getEffectTagKey(effect.tag);
    const label = effect.label ?? effect.tag ?? key;
    const remaining = Number(effect.remaining ?? effect.duration ?? 0);
    const source = effect.sourceAttackName || effect.sourceActorName || localize("DDA.Cleanse.UnknownSource");

    return `
      <label class="cleanse-effect-choice">
        <input type="checkbox" name="effect" value="${escapeHtml(key)}" />
        <span class="cleanse-effect-label">
          <strong>${escapeHtml(label)}</strong>
          <small>${formatI18n("DDA.Cleanse.EffectSourceAndDuration", {
            source,
            duration: remaining
          })}</small>
        </span>
      </label>
    `;
  }).join("");

  const resolveOption = resolve > 0
    ? `<label class="cleanse-effect-choice cleanse-resolve-choice">
        <input type="checkbox" name="resolve" value="1" checked />
        <span class="cleanse-effect-label">
          <strong>${combatText("Resolve de Monstro de Combate", "Combat Monster Resolve")}</strong>
          <small>${combatText(
            `Atual: ${resolve}. [CLEANSE] pode reduzi-lo em uma quantidade igual à força da Limpeza.`,
            `Current: ${resolve}. [CLEANSE] may reduce it by the Cleanse amount.`
          )}</small>
        </span>
      </label>`
    : "";

  return foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-area-attack-dialog", "dda-defensive-quality-window", "dda-cleanse-window"],
    window: { title: localize("DDA.Effect.Cleanse") },
    content: `
      <form class="dda-cleanse-dialog dda-defensive-quality-dialog">
        <div class="cleanse-dialog-header">
          <h2>${localize("DDA.Effect.Cleanse")}</h2>
          <p>${formatI18n("DDA.Cleanse.ChooseApplication", {
            target: `<strong>${escapeHtml(defender.name)}</strong>`
          })}</p>
        </div>

        <div class="cleanse-mode-grid">
          <label class="cleanse-mode-card">
            <input type="radio" name="mode" value="all" checked />
            <span><strong>${localize("DDA.Cleanse.Total")}</strong><small>${localize("DDA.Cleanse.TotalDescription")}</small></span>
          </label>
          <label class="cleanse-mode-card">
            <input type="radio" name="mode" value="selective" />
            <span><strong>${localize("DDA.Cleanse.Selective")}</strong><small>${localize("DDA.Cleanse.SelectiveDescription")}</small></span>
          </label>
        </div>

        <div class="cleanse-effect-picker">
          <h3>${localize("DDA.Cleanse.ActiveEffectsOnTarget")}</h3>
          <p>${localize("DDA.Cleanse.SelectiveHint")}</p>
          <div class="cleanse-effect-choice-list">${effectOptions}${resolveOption}</div>
        </div>
      </form>
    `,
    ok: {
      label: localize("DDA.Button.Confirm"),
      callback: (_event, button) => {
        const form = button.form;
        const mode = form.elements.mode?.value ?? "all";
        const selectedEffectKeys = Array.from(form.querySelectorAll('input[name="effect"]:checked'))
          .map((input) => input.value)
          .filter(Boolean);
        const selective = mode === "selective";
        return {
          enabled: true,
          selective,
          selectedEffectKeys,
          reduceResolve: resolve > 0 && Boolean(form.elements.resolve?.checked)
        };
      }
    },
    rejectClose: false,
    modal: true
  });
}

async function rollCleanseTargetHealthPool(actor, { label = "" } = {}) {
  const rollLabel = label || localize("DDA.Effect.Cleanse");

  if (actor.type === "digimon" || actor.type === "npc") {
    return rollPool(actor, "health", {
      allowZeroSuccesses: true,
      externalLabel: rollLabel
    });
  }

  if (actor.type === "character") {
    const woundsMax = Number(actor.system.derived?.wounds?.max ?? 1);
    const modifier = Math.max(0, woundsMax);

    const roll = await new Roll("3d6 + @modifier", {
      modifier
    }).evaluate();

    const total = Number(roll.total ?? 0);
    const totalSuccesses = Math.max(0, Math.floor(total / 5));

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
flavor: `
  <div class="dda-chat-card dda-pool-card">
    <h2>${rollLabel}</h2>
    <p><strong>${actor.name}</strong> ${combatText("rola sua Saúde para auxiliar o Efeito.", "rolls Health to assist the Effect.")}</p>
    <p><strong>${localize("DDA.MainStat.Health")}:</strong> ${woundsMax}</p>
    <p><strong>${localize("DDA.Roll.Result")}:</strong> ${total}</p>
    <p><strong>${localize("DDA.Roll.Successes")}:</strong> ${totalSuccesses}</p>
  </div>
`
    });

    return {
      roll,
      rolledSuccesses: totalSuccesses,
      automaticSuccesses: 0,
      totalSuccesses
    };
  }

  return null;
}

function getActiveEffectAttackModifiers(actor, defender = null, attackOptions = {}) {
  /*
   * Permanent Effect modifiers are already included in prepared Actor totals.
   * FEAR and TAUNT remain conditional because their penalty depends on the
   * chosen target (or on whether their Caster is included in an Area Attack).
   */
  let conditionalAccuracy = 0;
  const defenderKeys = new Set([
    defender?.uuid,
    defender?.id,
    defender?.id ? `Actor.${defender.id}` : ""
  ].filter(Boolean).map(String));

  const areaTargetKeys = new Set(
    (attackOptions?.areaBatch?.targetActorUuids ?? [])
      .filter(Boolean)
      .map(String)
  );
  const isAreaAttack = Boolean(attackOptions?.areaBatch?.active);

  for (const effect of actor?.system?.effects?.active ?? []) {
    const tag = getEffectTagKey(effect.tag);
    const sourceUuid = String(effect.sourceActorUuid ?? "");
    const sourceMatchesTarget = defenderKeys.has(sourceUuid);
    const sourceIsInArea = isAreaAttack && sourceUuid && areaTargetKeys.has(sourceUuid);
    const fullPenalty = Math.max(0, Number(effect.value ?? effect.potency ?? 0));
    const areaPenalty = Math.ceil(fullPenalty / 2);

    if (tag === "fear") {
      if (sourceIsInArea) conditionalAccuracy -= areaPenalty;
      else if (sourceMatchesTarget) conditionalAccuracy -= fullPenalty;
    }

    if (tag === "taunt") {
      if (sourceIsInArea) conditionalAccuracy -= areaPenalty;
      else if (!sourceMatchesTarget) conditionalAccuracy -= fullPenalty;
    }
  }

  const vanishPenalty = getVanishBlindAttackPenalty(
    actor,
    defender
  );

  const overlookedPenalty = getOverlookedBlindAttackPenalty(
    actor,
    defender
  );

  conditionalAccuracy -= vanishPenalty + overlookedPenalty;

  const notes = [];

  if (vanishPenalty > 0) {
    notes.push(combatText(
      `NOW YOU SEE US: -${vanishPenalty} dado(s) de Precisão contra o alvo oculto.`,
      `NOW YOU SEE US: -${vanishPenalty} Accuracy die/dice against the hidden target.`
    ));
  }

  if (overlookedPenalty > 0) {
    notes.push(combatText(
      `Overlooked: -${overlookedPenalty} dado(s) de Precisão contra o Tamer obscuro.`,
      `Overlooked: -${overlookedPenalty} Accuracy die/dice against the obscured Tamer.`
    ));
  }

  return {
    accuracyDice: conditionalAccuracy,
    damage: 0,
    notes
  };
}

function getActiveEffectDefenseModifiers(actor, attacker = null) {
  /*
   * Dodge e Armor permanentes já incluem effectBonus no actor-document.
   * Vanish é relativo a um atacante específico, então precisa ser calculado
   * aqui como uma penalidade condicional semelhante a [BLIND].
   */
  const vanishPenalty = getVanishBlindDodgePenalty(
    actor,
    attacker
  );

  const overlookedPenalty = getOverlookedBlindAttackPenalty(
    actor,
    attacker
  );

  const notes = [];

  if (vanishPenalty > 0) {
    notes.push(combatText(
      `NOW YOU SEE US: -${vanishPenalty} dado(s) de Esquiva contra o alvo oculto.`,
      `NOW YOU SEE US: -${vanishPenalty} Dodge die/dice against the hidden target.`
    ));
  }

  if (overlookedPenalty > 0) {
    notes.push(combatText(
      `Overlooked: -${overlookedPenalty} dado(s) de Esquiva contra o Tamer obscuro.`,
      `Overlooked: -${overlookedPenalty} Dodge die/dice against the obscured Tamer.`
    ));
  }

  return {
    dodgeDice: -(vanishPenalty + overlookedPenalty),
    armor: 0,
    notes
  };
}

function renderAppliedEffectTag(
  effect
) {
  const effectKey =
    getEffectTagKey(effect.tag);

  const categoryClass =
    getEffectCardCategoryClass(
      effect.tag
    );

  const label =
    escapeHtml(
      getAppliedEffectLabel(effect)
    );

  const details = [];

  if (effect.usePotencyValue) {
    details.push({
      label: combatText(
        "Potência",
        "Potency"
      ),

      value: Number(
        effect.potency ?? 0
      )
    });
  } else if (
    Number(effect.value ?? 0) > 0
  ) {
    details.push({
      label:
        ["pull", "push"].includes(effectKey)
          ? combatText(
              "Distância",
              "Distance"
            )
          : combatText(
              "Valor",
              "Value"
            ),

      value: Number(
        effect.value ?? 0
      )
    });
  }

  if (
    effect.hasDuration &&
    Number(effect.duration ?? 0) > 0
  ) {
    details.push({
      label: combatText(
        "Duração",
        "Duration"
      ),

      value: Number(
        effect.duration ?? 0
      )
    });
  } else if (
    effect.hasSpecialDuration ||
    effect.durationRule === "special"
  ) {
    details.push({
      label: combatText(
        "Duração",
        "Duration"
      ),

      value: combatText(
        "Especial",
        "Special"
      )
    });
  }

  const detailsHtml =
    details.length
      ? `
        <span class="attack-effect-tag-values">
          ${details.map((detail) => {
            return `
              <span class="attack-effect-tag-value">
                <span>${detail.label}</span>
                <strong>${detail.value}</strong>
              </span>
            `;
          }).join("")}
        </span>
      `
      : "";

  return `
    <span class="attack-effect-tag attack-effect-tag-detailed ${categoryClass}">
      <span class="attack-effect-tag-name">
        ${label}
      </span>

      ${detailsHtml}
    </span>
  `;
}

function getEffectCardCategoryClass(tag) {
  const key = getEffectTagKey(tag);

  const positive = new Set([
    "cleanse",
    "shield",
    "regen",
    "immune",
    "keen",
    "sharpen",
    "sturdy",
    "swift",
    "strength",
    "vigil",
    "daring",
    "fury"
  ]);

  const negative = new Set([
    "burn",
    "poison",
    "ruin",
    "doom"
  ]);

  const control = new Set([
    "stun",
    "paralyze",
    "freeze"
  ]);

  const penalty = new Set([
    "vague",
    "dull",
    "frail",
    "blind",
    "weak"
  ]);

  const movement = new Set([
    "root",
    "tailwind",
    "push",
    "pull",
    "nimble",
    "heavy"
  ]);

  const mental = new Set([
    "fear",
    "confuse",
    "distract",
    "shaken",
    "rattled",
    "taunt",
    "pacify"
  ]);

  const special = new Set([
    "exploit",
    "deny",
    "dot",
    "zero"
  ]);

  if (positive.has(key)) return "effect-positive";
  if (negative.has(key)) return "effect-negative";
  if (control.has(key)) return "effect-control";
  if (penalty.has(key)) return "effect-penalty";
  if (movement.has(key)) return "effect-movement";
  if (mental.has(key)) return "effect-mental";
  if (special.has(key)) return "effect-special";

  return "effect-special";
}

function getEffectTagLabel(tag = "") {
  const rawTag =
    String(tag ?? "").trim();

  const normalizedTag =
    normalizeAttackTag(rawTag);

  const configuredLabel =
    CONFIG.DDA?.effectTags?.[rawTag] ??
    CONFIG.DDA?.effectTags?.[normalizedTag] ??
    rawTag;

  const localizedLabel =
    localize(configuredLabel);

  if (
    localizedLabel &&
    localizedLabel !== configuredLabel
  ) {
    return localizedLabel;
  }

  if (
    configuredLabel &&
    !String(configuredLabel).startsWith("DDA.")
  ) {
    return configuredLabel;
  }

  return rawTag
    ? `[${rawTag.toUpperCase()}]`
    : configuredLabel;
}

function getAppliedEffectLabel(effect = {}) {
  const storedLabel =
    String(effect?.label ?? "").trim();

  if (storedLabel) {
    const localizedLabel =
      localize(storedLabel);

    if (
      localizedLabel &&
      localizedLabel !== storedLabel
    ) {
      return localizedLabel;
    }

    if (!storedLabel.startsWith("DDA.")) {
      return storedLabel;
    }
  }

  return getEffectTagLabel(
    effect?.tag ?? ""
  );
}

function localize(key) {
  return game.i18n.localize(key);
}

function formatI18n(key, data = {}) {
  return game.i18n.format(key, data);
}

function getHasteAttackWindow(actor) {
  const effects = Array.isArray(actor?.system?.effects?.active)
    ? actor.system.effects.active
    : [];

  return effects.find((effect) => {
    return getEffectTagKey(effect.tag) === "haste" && Number(effect.actionGranted ?? 1) > 0;
  }) ?? null;
}

/** Resolve only Effect Tags for Digital Hazard after its automatic Damage was applied. */
export async function applyDigitalHazardEffects({ attacker, defender, attackItem, normalDamage = 0 } = {}) {
  if (!attacker || !defender || !attackItem || Number(normalDamage) < 4) {
    return { applied: [], reason: "minimumDamage" };
  }
  const qualityAttackModifier = getAppliedAttackQualityModifier(attacker, attackItem, {
    defender,
    targetToken: canvas?.tokens?.placeables?.find((token) => token.actor?.uuid === defender.uuid) ?? null
  });
  const directTag = attackItem.system?.effectTag?.enabled ? attackItem.system.effectTag.tag : "";
  const effectTags = [...new Set([directTag, ...(qualityAttackModifier.effectTags ?? [])]
    .map(normalizeAttackTag)
    .filter((tag) => Boolean(EFFECT_TAGS[tag])))];
  if (!effectTags.length) return { applied: [], reason: "noEffectTags" };
  const application = getAttackEffectApplication({
    hit: true,
    attackItem,
    activeEffectTags: effectTags,
    normalDamage: Number(normalDamage),
    leftoverSuccesses: 0,
    attacker,
    defender,
    cleanseDeclaration: null,
    targetIsAlly: areActorsAllies(attacker, defender),
    accuracySuccesses: 0,
    qualityAttackModifier,
    areaAttackDeclaration: { active: false },
    isSignatureAttack: Boolean(attackItem.system?.isSignature),
    ignoreEffectResistance: false,
    effectResistanceMultiplier: 1,
    effectResistanceCanNegate: Boolean(defender.system?.qualityFeatures?.preservation?.immunity)
  });
  if (!application.applied.length) return application;
  const resolution = await applyAttackEffectTags(defender, application.applied);
  return { ...application, resolution };
}
