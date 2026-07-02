import { rollPool } from "./pool-roll.js";
import { getDDASetting } from "../settings.js";
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
  setUseState,
  clearUseState,
  spendQualityUse as spendAutomationQualityUse,
  promptUseQuality,
  canSpendQuality,
  actorHasNaturewalkElement,
  getElementTagsFromAttack,
  rollDerivedCheck,
  normalizeKey,
  areActorsAllies,
  localizeQ
} from "../rules/quality-automation.js";


const pendingAttackDodgeRequests = new Map();
const pendingAttackDodgeByAttacker = new Map();
const combatText = (pt, en) => String(game.i18n?.lang ?? "")
  .toLowerCase()
  .startsWith("en")
  ? en
  : pt;

export async function rollAttack(attacker, attackItem, options = {}) {
  if (!attacker || !attackItem) {
    ui.notifications.warn(localize("DDA.Warning.AttackerOrAttackNotFound"));
    return;
  }

if (pendingAttackDodgeByAttacker.has(attacker.uuid)) {
  ui.notifications.warn(formatI18n("DDA.Warning.AttackAwaitingDodge", {
    actor: attacker.name
  }));
  return;
}

const attackOptions = options ?? {};
const attackQualityTagsAtStart = getAttackQualityTags(attackItem);
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

if (alreadyAttacked && !isAmmoAttack) {
  ui.notifications.warn(combatText(
    `${attacker.name} já realizou um Ataque nesta Rodada.`,
    `${attacker.name} has already made an Attack this Round.`
  ));
  return;
}

const effectiveAttacksMade = 0;
const multiattackPenalty = 0;

  const targetToken = attackOptions.targetToken ?? game.user.targets.first();

  if (!targetToken) {
    ui.notifications.warn(localize("DDA.Warning.SelectTargetBeforeAttack"));
    return;
  }

const defender = getCombatActorFromTargetToken(targetToken);

if (!defender) {
  ui.notifications.warn(localize("DDA.Warning.TargetHasNoActor"));
  return;
}

const attackCombatContext = getAttackCombatContext(attacker, attackOptions);

if (!attackCombatContext.ok) {
  ui.notifications.warn(attackCombatContext.message);
  return;
}

  const isSignature = Boolean(attackItem.system.isSignature);
  const currentBattery = Number(attacker.system.resources?.battery?.value ?? 0);

  if (isAmmoAttack && isSignature) {
  ui.notifications.warn(`${attackItem.name} has [AMMO] but [AMMO] cannot be used on a Signature Move.`);
  return;
}

if (isAmmoAttack && isAmmoAttackUsedThisCombat(attacker, attackItem)) {
  ui.notifications.warn(`${attackItem.name} [AMMO] has already been used this combat.`);
  return;
}

  if (isSignature && currentBattery <= 0) {
    ui.notifications.warn(localize("DDA.Warning.SignatureRequiresBattery"));
    return;
  }

  const attributeAdvantageData = getAttributeAdvantageData(attacker, defender);
  const attackerEffectModifiers = getActiveEffectAttackModifiers(attacker);
  const defenderEffectModifiers = getActiveEffectDefenseModifiers(defender);
  const multiattackAccuracyPenalty = multiattackPenalty;
  const multiattackDamagePenalty = multiattackPenalty;
  const signatureAccuracyBonus = isSignature ? currentBattery : 0;
  const signatureDamageBonus = isSignature ? currentBattery : 0;
const qualityAttackModifier = getAppliedAttackQualityModifier(attacker, attackItem, {
  defender,
  targetToken,
  clashContext
});

if (qualityAttackModifier.blockedInSentryStance) {
  ui.notifications.warn(`${attackItem.name} has [RECOIL] and cannot be used in Sentry Stance.`);
  return;
}

const baseActionCost = Number(attackItem.system.actionCost?.value ?? 1);
const attackExtraActionCost = Number(attackItem.system.actionCost?.extra ?? 0);
const qualityExtraActionCost = Number(qualityAttackModifier.extraActionCost ?? 0);

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

const attackTargeting = validateAttackTargeting({
  attacker,
  attackerToken: attackCombatContext.token,
  targetToken,
  attackItem,
  qualityAttackModifier,
  attackRangeTotal,
  attackEffectiveLimitTotal
});

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

const totalActionCost = Math.max(
  Number(qualityAttackModifier.actionCostMinimum ?? 0),
  baseActionCost + attackExtraActionCost + qualityExtraActionCost - Number(qualityAttackModifier.actionCostReduction ?? 0)
);

const currentActions = Number(attacker.system.combat?.actions?.value ?? 0);

if (currentActions < totalActionCost) {
  ui.notifications.warn(formatI18n("DDA.Warning.NotEnoughActionsForAttack", {
  attack: attackItem.name,
  required: totalActionCost,
  actor: attacker.name,
  current: currentActions
}));
  return;
}

const grantedEffectTags = qualityAttackModifier.effectTags ?? [];
const attackEffectTag = attackItem.system.effectTag?.enabled
  ? attackItem.system.effectTag?.tag ?? ""
  : "";

const activeEffectTags = [
  attackEffectTag,
  ...grantedEffectTags
].filter(Boolean);

const cleanseDeclaration = await getCleanseDeclaration(defender, activeEffectTags);

if (cleanseDeclaration === null) return;

const cleanseIsActive = hasCleanseTag(activeEffectTags);
const targetIsAlly = cleanseIsActive && areActorsAllies(attacker, defender);

const activeEffectTagLabels = activeEffectTags.map((tag) => {
  return CONFIG.DDA?.effectTags?.[tag] ?? tag;
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
  isSignature,
  areaAttackDeclaration
});

if (declaredAttackQualityEffects === null) return;

if (declaredAttackQualityEffects.preventAttack) {
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
  return;
}

const accuracyDiceBonus =
  customAccuracyModifier +
  signatureAccuracyBonus +
  attributeAdvantageData.extraAccuracyDice +
  multiattackAccuracyPenalty +
  qualityAttackModifier.accuracyBonus +
  Number(declaredAttackQualityEffects.accuracyBonus ?? 0) +
  attackerEffectModifiers.accuracyDice;


const hugePowerReroll = await getHugePowerRerollDeclaration(attacker, attackOptions);
if (hugePowerReroll === null) return;

const accuracyResult = await rollPool(attacker, "accuracy", {
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
  )
});

  if (!accuracyResult) {
    ui.notifications.warn(localize("DDA.Warning.AccuracyRollCancelledOrInvalid"));
    return;
  }

const attackFunctionType = attackItem.system.baseTags?.functionType ?? "damage";
const weakAttackSupportAccuracyPenalty = isClashWeakAttack && attackFunctionType === "support" ? 1 : 0;
const weakAttackHalvesDodge = isClashWeakAttack && !clashDefenderHasReach;
const cleanseSelectivePenalty = cleanseDeclaration?.selective ? 1 : 0;

const weaponMeleeFourSuccesses = getWeaponMeleeFourSuccesses(
  accuracyResult,
  Number(qualityAttackModifier.weaponMeleeFourSuccessesMax ?? 0)
);

const accuracySuccessesBeforePositioningPenalty = Math.max(
  0,
  Number(accuracyResult.totalSuccesses ?? 0) +
    weaponMeleeFourSuccesses +
    attributeAdvantageData.automaticSuccesses -
    cleanseSelectivePenalty -
    weakAttackSupportAccuracyPenalty
);

const rangePositioningPenalty = Math.max(
  0,
  -Number(attackTargeting.accuracyPenalty ?? 0)
);

const accuracySuccesses = Math.max(
  0,
  accuracySuccessesBeforePositioningPenalty - rangePositioningPenalty
);

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
  Boolean(declaredAttackQualityEffects?.halveDodge);

let dodgeResult;

if (targetIsAlly) {
  dodgeResult = {
    roll: null,
    rolledSuccesses: 0,
    automaticSuccesses: 0,
    totalSuccesses: 0
  };
} else if (defender.type === "character" && attackFunctionType === "support") {
  dodgeResult = await getAttackDodgeResult(
    defender,
    attackFunctionType,
    defenderEffectModifiers.dodgeDice
  );
} else {
  dodgeResult = await requestAttackDodgeResult({
    attacker,
    defender,
    attackItem,
    attackFunctionType,
    effectDodgeModifier: defenderEffectModifiers.dodgeDice,
    accuracySuccesses,
    dodgeShouldHalve
  });
}

if (!dodgeResult) {
  ui.notifications.warn(localize("DDA.Warning.DodgeRollCancelledOrInvalid"));
  return;
}

let cleanseTargetHealthResult = null;

if (targetIsAlly) {
  cleanseTargetHealthResult = await rollCleanseTargetHealthPool(defender);

  if (!cleanseTargetHealthResult) {
    ui.notifications.warn(localize("DDA.Warning.TargetHealthRollCancelledOrInvalid"));
    return;
  }
}

const rawDodgeSuccesses = Number(dodgeResult.totalSuccesses ?? 0);
const dodgeSuccesses = dodgeShouldHalve
  ? Math.ceil(rawDodgeSuccesses / 2)
  : rawDodgeSuccesses;

const hit = accuracySuccesses >= dodgeSuccesses && accuracySuccesses > 0;
const leftoverSuccesses = hit ? Math.max(0, accuracySuccesses - dodgeSuccesses) : 0;

const defaultDamageBase = Number(attacker.system.mainStats?.damage?.total ?? 0);

const attackerDamage = await evaluateAttackFormula(
  attacker,
  attackItem.system.damage?.baseFormula,
  defaultDamageBase
);

const baseAttackDamageBonus = Number(attackItem.system.damage?.bonus ?? 0);
const qualityDamageBonus = Number(qualityAttackModifier.damageBonus ?? 0);

const baseUnalterableDamage = Number(attackItem.system.damage?.unalterable ?? 0);
const qualityUnalterableDamage = Number(qualityAttackModifier.unalterableDamage ?? 0) + Math.min(
  Math.max(0, leftoverSuccesses),
  Number(qualityAttackModifier.piercingUnalterableDamageMax ?? 0)
);

const attackDamageBonus = baseAttackDamageBonus + qualityDamageBonus;
const unalterableDamage = baseUnalterableDamage + qualityUnalterableDamage;

const baseDefenderArmor = Number(defender.system.mainStats?.armor?.total ?? 0);
const defenderArmor = Math.max(
  0,
  baseDefenderArmor + defenderEffectModifiers.armor
);


  const attackDealsDamage = attackItem.system.damage?.enabled !== false;

  let normalDamage = 0;
  let finalDamage = 0;
  let rawWeakAttackNormalDamage = 0;
  let postHitQualityEffects = {};

  if (hit && attackDealsDamage) {
normalDamage = Math.max(
  1,
  attackerDamage +
    attackDamageBonus +
    attackerEffectModifiers.damage +
    signatureDamageBonus +
    leftoverSuccesses +
    multiattackDamagePenalty -
    defenderArmor
);

    rawWeakAttackNormalDamage = normalDamage;

    if (isClashWeakAttack && attackFunctionType !== "support") {
      normalDamage = Math.ceil(normalDamage / 2);
    }

if (declaredAttackQualityEffects?.halveDamageOnHit) {
  normalDamage = Math.ceil(normalDamage / 2);
  qualityAttackModifier.feintDamageHalved = true;
}

if (areaAttackDeclaration?.active && attackFunctionType === "damage") {
  const areaHalvedDamage = Math.ceil(normalDamage / 2);
  const bombardmentFloor = getZonerBombardmentDamageFloor({
    attacker,
    qualityAttackModifier,
    areaAttackDeclaration,
    damageAfterArmor: normalDamage
  });

  normalDamage = Math.max(areaHalvedDamage, bombardmentFloor);
}

postHitQualityEffects = await getPostHitQualityEffects({
  attacker,
  defender,
  attackItem,
  qualityAttackModifier,
  declaredAttackQualityEffects,
  hit,
  attackDealsDamage,
  attackFunctionType,
  normalDamage,
  areaAttackDeclaration
});

if (postHitQualityEffects === null) return;

normalDamage = Math.max(0, normalDamage + Number(postHitQualityEffects.damageBonus ?? 0));
normalDamage = Math.max(0, normalDamage - Number(postHitQualityEffects.damageReduction ?? 0));

if (postHitQualityEffects.preventNormalDamage) {
  normalDamage = 0;
}

    finalDamage = normalDamage + unalterableDamage;
    qualityAttackModifier.drainHealing = qualityAttackModifier.lifesteal ? Math.min(finalDamage, getActorDerivedStat(attacker, "dos")) : 0;
  }
const effectApplication = getAttackEffectApplication({
  hit,
  attackItem,
  activeEffectTags,
  normalDamage,
  leftoverSuccesses,
  attacker,
  defender,
  cleanseDeclaration,
  targetIsAlly,
  cleanseTargetHealthSuccesses: Number(cleanseTargetHealthResult?.totalSuccesses ?? 0),
  accuracySuccesses
});

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

const clashWeakAttackDamageNote = isClashWeakAttack && attackFunctionType !== "support" && hit && attackDealsDamage
  ? `
    <li class="attack-penalty">
      Clash Weak Attack damage after Armor:
      <strong>${rawWeakAttackNormalDamage} → ${normalDamage}</strong>.
    </li>
  `
  : "";

const areaAttackTechnicalNote = areaAttackDeclaration?.active
  ? `
    <li>
      <strong>${areaAttackDeclaration.label}</strong>:
      ${attackFunctionType === "damage"
        ? "damage after Armor is halved, rounded up."
        : "support area effects have their Potency and Duration reduced by 1 unless another rule says otherwise."}
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
            const label = CONFIG.DDA?.effectTags?.[tag] ?? tag;

            return `<span class="attack-effect-tag ${categoryClass}">${label}</span>`;
          }).join("")}
        </div>
      </li>
    </ul>
  `
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
                ${effectApplication.applied.map((effect) => {
                  const categoryClass = getEffectCardCategoryClass(effect.tag);
                  const label = effect.label ?? effect.tag;

                  return `<span class="attack-effect-tag ${categoryClass}">${label}</span>`;
                }).join("")}
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
              const label = CONFIG.DDA?.effectTags?.[tag] ?? tag;

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
                  ${effectApplication.applied.map((effect) => {
                    const categoryClass = getEffectCardCategoryClass(effect.tag);
                    const label = effect.label ?? effect.tag;

                    return `<span class="attack-effect-tag ${categoryClass}">${label}</span>`;
                  }).join("")}
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


  const content = `
    <div class="dda-chat-card dda-effect-card effect-special dda-attack-card ${resultClass}">
      <h2>${attackItem.name}</h2>

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
<span>${formatI18n("DDA.Attack.ActionCostShort", { cost: totalActionCost })}</span>
        </summary>

        <ul class="dda-effect-list dda-attack-technical-list">
          <li>
${localize("DDA.Attack.ActionCost")}:
            <strong>${totalActionCost}</strong>.
          </li>

          ${
            attackItem.system.baseTags?.rangeType === "range"
              ? `
 <li>
                  ${localize("DDA.Attack.RangeValue")}:
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
            qualityExtraActionCost !== 0
              ? `
                <li>
${localize("DDA.Attack.ExtraQualityCost")}:
                  <strong>${qualityExtraActionCost}</strong>.
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
  ${clashWeakAttackAccuracyNote}
  ${clashWeakAttackDodgeNote}
</ul>

${
  hit && attackDealsDamage
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
            <strong>${signatureDamageBonus}</strong>.
          </li>
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
  data-defender-uuid="${defender.uuid}"
  data-attacker-uuid="${attacker.uuid}"
  data-damage="${finalDamage}"
>
  ${localize("DDA.Attack.ApplyDamage")}
</button>
                `
                : ""
            }
          `
          : `
            <p>${localize("DDA.Attack.NoDamageDealt")}</p>
          `
      }
            ${effectApplicationNote}
    </div>
  `;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content
  });

if (hugePowerReroll?.qualityId) {
  await spendHugePowerUse(attacker, hugePowerReroll.qualityId);
}

if (hit && Number(qualityAttackModifier.combatMonsterResolveSpent ?? 0) > 0) {
  await setCombatMonsterResolve(attacker, 0);
}

if (hit && Number(qualityAttackModifier.drainHealing ?? 0) > 0) {
  await healActorWounds(attacker, Number(qualityAttackModifier.drainHealing ?? 0));
}

await recordBulletProofIncomingAttack(defender, attacker);

  if (effectApplication.applied.length) {
  await applyAttackEffectTags(defender, effectApplication.applied);
}

await attacker.update({
  "system.combat.actions.value": Math.max(0, currentActions - totalActionCost)
});



if (isAmmoAttack) {
  await markAmmoAttackUsedThisCombat(attacker, attackItem);
} else {
  await markAttackUsed(attacker, isSignature, effectiveAttacksMade + 1);
}
  if (isSignature) {
    await spendSignatureBattery(attacker);
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
  totalActionCost,
  activeEffectTags,
  activeEffectTagLabels,
  qualityAttackModifier,
  attributeAdvantage: attributeAdvantageData,
  clashContext,
  declaredAttackQualityEffects,
  postHitQualityEffects
};
}



async function maybeConvertResolveWithAssuredDestruction(attacker, qualityAttackModifier, data) {
  const resolve = Number(qualityAttackModifier?.combatMonsterResolveSpent ?? 0);
  if (resolve <= 0 || !hasQuality(attacker, "assuredDestruction")) return;

  const amount = await promptNumberForAttack(localizeQ("DDA.QualityAutomation.AssuredDestruction.Amount", "Resolve to convert into Accuracy dice"), 0, 0, resolve);
  if (amount === null || amount <= 0) return;

  const converted = Math.min(resolve, Math.max(0, Number(amount ?? 0)));
  qualityAttackModifier.damageBonus -= converted;
  data.accuracyBonus += converted;
  data.notes.push(localizeQ("DDA.QualityAutomation.AssuredDestruction.Converted", "Assured Destruction converted {value} Resolve into Accuracy dice.", { value: converted }));
}

async function maybeTriggerSavageryOnAttackDeclare(attacker, data) {
  const quality = findQuality(attacker, "savagery");
  if (!quality) return;
  const state = getCombatUseState(attacker, "savagery", quality.id);
  if (state && Number(state.round ?? -1) === getCombatRound()) return;

  const useIt = await promptUseQuality(quality, {
    body: localizeQ("DDA.QualityAutomation.Savagery.Prompt", "Trigger Savagery for this attack declaration?"),
    defaultYes: false
  });
  if (!useIt) return;

  const tnIncrease = Number(attacker.system?.combat?.qualityAttackUses?.savagery?.[quality.id]?.tnIncrease ?? 0);
  const tn = 15 - getActorDerivedStat(attacker, "dos") + tnIncrease;
  const check = await rollDerivedCheck(attacker, "cpu", {
    skillKey: "endurance",
    tn,
    title: localizeQ("DDA.QualityAutomation.Savagery.Title", "Savagery")
  });

  if (!check) return;

  const maxResolve = 4;
  const selfDamage = Math.ceil(maxResolve / 2);

  if (check.criticalFailure || !check.success) {
    await loseActorWoundsDirectly(attacker, selfDamage);
    await addCombatMonsterResolve(attacker, selfDamage);
    data.notes.push(localizeQ("DDA.QualityAutomation.Savagery.Failure", "Savagery dealt {value} Unalterable Damage to the user and added it to Resolve.", { value: selfDamage }));
  }

  if (check.success) {
    await loseActorWoundsDirectly(attacker, selfDamage);
    await addCombatMonsterResolve(attacker, selfDamage);
    const tempGain = check.criticalSuccess ? selfDamage * 2 : selfDamage;
    await addTemporaryWounds(attacker, tempGain);
    data.notes.push(localizeQ("DDA.QualityAutomation.Savagery.Success", "Savagery dealt {damage} Unalterable Damage and granted {temp} Temporary Wound Boxes.", { damage: selfDamage, temp: tempGain }));
  }

  await setUseState(attacker, "savagery", quality.id, { tnIncrease: tnIncrease + 3 });
}

async function getDeclaredAttackQualityEffects({ attacker, defender, attackItem, qualityAttackModifier, totalActionCost, isSignature, areaAttackDeclaration } = {}) {
  const data = {
    accuracyBonus: 0,
    halveDodge: false,
    halveDamageOnHit: false,
    notes: []
  };

  await maybeTriggerSavageryOnAttackDeclare(attacker, data);

  await maybeConvertResolveWithAssuredDestruction(attacker, qualityAttackModifier, data);

  if (qualityAttackModifier?.elementalForce) {
    const ef = qualityAttackModifier.elementalForce;
    const useElement = await promptUseQuality(ef.quality, {
      body: localizeQ("DDA.QualityAutomation.ElementalForce.Prompt", "Trigger {quality} for +{bonus} Damage?", { quality: ef.quality.name, bonus: ef.damageBonus }),
      defaultYes: false
    });

    if (useElement) {
      if (hasQuality(defender, "elementMaster") && actorHasNaturewalkElement(defender, ef.element)) {
        data.preventAttack = true;
        data.notes.push(localizeQ("DDA.QualityAutomation.ElementalForce.Negated", "Element Master negates this triggered Elemental Force attack."));
      } else if (actorHasNaturewalkElement(defender, ef.element)) {
        data.notes.push(localizeQ("DDA.QualityAutomation.ElementalForce.SharedElement", "Target shares the Element, so Elemental Force grants no bonus damage."));
      } else {
        qualityAttackModifier.damageBonus += ef.damageBonus;
        data.notes.push(localizeQ("DDA.QualityAutomation.ElementalForce.Triggered", "Elemental Force triggered: +{bonus} Damage.", { bonus: ef.damageBonus }));
      }
    }
  }

  if (qualityAttackModifier?.preciseFocus && !areaAttackDeclaration?.active && Number(totalActionCost ?? 0) >= 2) {
    const focusQuality = getQualityForAttackModifier(attacker, "preciseFocus");
    const tn = 12 + getActorDerivedStat(defender, "ram");
    const check = await rollDerivedCheck(attacker, "ram", {
      skillKey: "precision",
      tn,
      title: localizeQ("DDA.QualityAutomation.PreciseFocus.Check", "Precise Focus")
    });
    if (!check) return null;

    let bonus = 0;
    if (check.criticalSuccess) bonus = 5;
    else if (check.success) bonus = 3;
    else if (!check.criticalFailure) bonus = 1;
    data.accuracyBonus += bonus;
    data.notes.push(localizeQ("DDA.QualityAutomation.PreciseFocus.Result", "Precise Focus: {bonus} Accuracy from the RAM (Precision) Check.", { bonus: bonus >= 0 ? `+${bonus}` : bonus }));
  }

  if (qualityAttackModifier?.feintAttack && !areaAttackDeclaration?.active) {
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
        title: localizeQ("DDA.QualityAutomation.FeintAttack.Check", "Feint Attack")
      });
      if (!check) return null;
      if (check.criticalFailure) {
        data.halveDamageOnHit = true;
        data.notes.push(localizeQ("DDA.QualityAutomation.FeintAttack.CritFail", "Feint Attack critically failed: damage is halved if the attack hits."));
      } else if (check.success) {
        data.halveDodge = true;
        data.halveDamageOnHit = !check.criticalSuccess;
        data.notes.push(check.criticalSuccess
          ? localizeQ("DDA.QualityAutomation.FeintAttack.CritSuccess", "Feint Attack critically succeeded: target Dodge is halved and damage is not halved.")
          : localizeQ("DDA.QualityAutomation.FeintAttack.Success", "Feint Attack succeeded: target Dodge is halved, but damage is halved after Armor."));
      }
      await increaseEscalatingTn(attacker, feintQuality, "feintAttack", isSignature ? 0 : 3);
    }
  }

  return data;
}

async function getPostHitQualityEffects({ attacker, defender, qualityAttackModifier, hit, attackDealsDamage, attackFunctionType, normalDamage, areaAttackDeclaration } = {}) {
  const data = { damageBonus: 0, damageReduction: 0, preventNormalDamage: false, notes: [] };
  if (!hit || !attackDealsDamage) return data;

  if (qualityAttackModifier?.mightyBlow && attackFunctionType === "damage" && Number(normalDamage ?? 0) >= 2) {
    const mightyQuality = getQualityForAttackModifier(attacker, "mightyBlow");
    const useMighty = !areaAttackDeclaration?.active && await promptUseQuality(mightyQuality, {
      body: localizeQ("DDA.QualityAutomation.MightyBlow.Prompt", "Trigger Mighty Blow to try to inflict [STUN]?"),
      defaultYes: false
    });
    if (useMighty) {
      const tn = 10 + getActorDerivedStat(defender, "cpu") + getEscalatingTn(attacker, mightyQuality, "mightyBlow");
      const check = await rollDerivedCheck(attacker, "cpu", {
        skillKey: "featsOfStrength",
        tn,
        title: localizeQ("DDA.QualityAutomation.MightyBlow.Check", "Mighty Blow")
      });
      if (!check) return null;
      if (check.criticalFailure) {
        data.damageReduction += 1;
        data.notes.push(localizeQ("DDA.QualityAutomation.MightyBlow.CritFail", "Mighty Blow critically failed: -1 Damage."));
      } else if (check.criticalSuccess) {
        data.damageBonus += 2;
        data.notes.push(localizeQ("DDA.QualityAutomation.MightyBlow.CritSuccess", "Mighty Blow critically succeeded: [STUN] applies and +2 Damage."));
        data.notes.push(localizeQ("DDA.QualityAutomation.EffectAssist", "Apply/track the listed Effect on the target from the chat card or Effect panel."));
      } else if (check.success) {
        data.notes.push(localizeQ("DDA.QualityAutomation.MightyBlow.Success", "Mighty Blow succeeded: [STUN] applies."));
        data.notes.push(localizeQ("DDA.QualityAutomation.EffectAssist", "Apply/track the listed Effect on the target from the chat card or Effect panel."));
      }
      await increaseEscalatingTn(attacker, mightyQuality, "mightyBlow", 3);
    }
  }

  if (hasQuality(defender, "brace") && Number(normalDamage ?? 0) > 0) {
    const braceQuality = findQuality(defender, "brace");
    if (braceQuality && canSpendQuality(braceQuality)) {
      const useBrace = await promptUseQuality(braceQuality, {
        body: localizeQ("DDA.QualityAutomation.Brace.Prompt", "Use Brace to reduce incoming damage?"),
        defaultYes: false
      });
      if (useBrace) {
        const tn = 10 + Number(normalDamage ?? 0) + getEscalatingTn(defender, braceQuality, "brace");
        const check = await rollDerivedCheck(defender, "cpu", { skillKey: "endurance", tn, title: localizeQ("DDA.QualityAutomation.Brace.Check", "Brace") });
        if (!check) return null;
        if (check.criticalFailure) {
          data.damageBonus += 1;
          data.notes.push(localizeQ("DDA.QualityAutomation.Brace.CritFail", "Brace critically failed: incoming damage +1."));
        } else if (check.success) {
          const reduced = Math.floor(Number(normalDamage ?? 0) / 2);
          const reduction = Number(normalDamage ?? 0) - reduced;
          data.damageReduction += reduction;
          if (check.criticalSuccess && reduced === 1) data.damageReduction += 1;
          data.notes.push(localizeQ("DDA.QualityAutomation.Brace.Success", "Brace reduced the damage after Armor."));
        }
        await spendAutomationQualityUse(defender, braceQuality, { bucket: "brace" });
        await increaseEscalatingTn(defender, braceQuality, "brace", 3);
      }
    }
  }

  if (qualityAttackModifier?.lifesteal) {
    data.notes.push(localizeQ("DDA.QualityAutomation.Lifesteal.Pending", "[DRAIN] healing will be applied to the attacker when the attack card resolves."));
  }

  return data;
}

async function getAreaAttackDeclaration(attacker, attackItem, qualityAttackModifier, attackOptions = {}) {
  const areaTags = Array.from(new Set(
    Array.isArray(qualityAttackModifier?.areaAttackTags)
      ? qualityAttackModifier.areaAttackTags
      : []
  ));

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
      label
    };
  }

  const useArea = await Dialog.confirm({
    title: "Area Attack",
    content: `
      <div class="dda-confirm-dialog">
        <p><strong>${attackItem.name}</strong> has an Area Attack tag.</p>
        <p>Use ${label} for this attack?</p>
        <p><small>Damage Area Attacks halve damage after Armor, rounded up.</small></p>
      </div>
    `,
    yes: () => true,
    no: () => false,
    defaultYes: false
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

  const useHugePower = await Dialog.confirm({
    title: quality.name,
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
    yes: () => true,
    no: () => false,
    defaultYes: false
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

function isTargetAdjacentToAttackerAlly(attacker, targetToken) {
  if (!attacker || !targetToken || !canvas?.tokens?.placeables?.length) {
    return false;
  }

  return canvas.tokens.placeables.some((token) => {
    if (!token?.actor) return false;
    if (token === targetToken) return false;
    if (token.actor.uuid === attacker.uuid) return false;
    if (!areActorsAllies(attacker, token.actor)) return false;

    return getTokenGridDistance(token, targetToken) <= 1;
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

function getWeaponMeleeFourSuccesses(accuracyResult, maxCount = 0) {
  const limit = Math.max(0, Number(maxCount ?? 0));

  if (limit <= 0) return 0;

  const roll = accuracyResult?.roll;
  const dice = [];

  for (const die of roll?.dice ?? []) {
    for (const result of die.results ?? []) {
      if (result.active === false) continue;

      const value = Number(result.result ?? result.value ?? 0);

      if (value === 4) {
        dice.push(value);
      }
    }
  }

  return Math.min(limit, dice.length);
}



async function loseActorWoundsDirectly(actor, amount) {
  const damage = Math.max(0, Number(amount ?? 0));
  if (!actor || damage <= 0) return;
  const path = actor.type === "character" ? "system.derived.wounds.value" : "system.miscStats.wounds.value";
  const current = Number(foundry.utils.getProperty(actor, path) ?? 0);
  await actor.update({ [path]: Math.max(0, current - damage) });
}

async function addTemporaryWounds(actor, amount) {
  const value = Math.max(0, Number(amount ?? 0));
  if (!actor || value <= 0) return;
  const path = actor.type === "character" ? "system.derived.wounds.temp.value" : "system.miscStats.wounds.temp.value";
  const current = Number(foundry.utils.getProperty(actor, path) ?? 0);
  await actor.update({ [path]: current + value });
}

async function addCombatMonsterResolve(actor, amount) {
  if (!actor || !hasQuality(actor, "combatMonster")) return;

  const resolveMax = Math.max(1, Number(actor.system?.resources?.resolve?.max ?? 4));
  const visibleResolve = Number(actor.system?.resources?.resolve?.value ?? 0);

  const qualityAttackUses = foundry.utils.deepClone(actor.system?.combat?.qualityAttackUses ?? {});
  qualityAttackUses.combatMonster ??= {};

  const hiddenResolve = Number(qualityAttackUses.combatMonster.resolve ?? 0);
  const current = Math.max(0, visibleResolve, hiddenResolve);
  const nextResolve = Math.min(resolveMax, Math.max(0, current + Number(amount ?? 0)));

  qualityAttackUses.combatMonster.resolve = nextResolve;
  qualityAttackUses.combatMonster.combatId = getCombatId();

  await actor.update({
    "system.resources.resolve.enabled": true,
    "system.resources.resolve.value": nextResolve,
    "system.resources.resolve.max": resolveMax,
    "system.combat.qualityAttackUses": qualityAttackUses
  });
}

async function promptNumberForAttack(title, value = 0, min = 0, max = 999) {
  return await new Promise((resolve) => {
    new Dialog({
      title,
      content: `<form><div class="form-group"><label>${title}</label><input type="number" name="value" value="${Number(value ?? 0)}" min="${Number(min ?? 0)}" max="${Number(max ?? 999)}" /></div></form>`,
      buttons: {
        ok: { label: localize("DDA.Button.Confirm"), callback: (html) => resolve(Number(html.find("[name='value']").val() ?? 0)) },
        cancel: { label: localize("DDA.Button.Cancel"), callback: () => resolve(null) }
      },
      default: "ok",
      close: () => resolve(null)
    }).render(true);
  });
}

function getQualityForAttackModifier(actor, modifierFlag) {
  return actor?.items?.find((item) => item.type === "quality" && Boolean(item.system?.attackModifier?.[modifierFlag])) ?? null;
}

function getElementalForceAttackData(attacker, attackItem) {
  const quality = findQuality(attacker, "elementalForce");
  if (!quality) return null;
  const attackElements = getElementTagsFromAttack(attackItem);
  if (!attackElements.length) return null;
  const naturewalkElements = attackElements.filter((element) => actorHasNaturewalkElement(attacker, element));
  const element = naturewalkElements[0] ?? attackElements[0];
  if (!element) return null;
  const rank = getQualityRank(quality);
  return {
    quality,
    element,
    elementLabel: element.toUpperCase(),
    damageBonus: 1 + rank
  };
}

function getCombatMonsterResolve(actor) {
  if (!hasQuality(actor, "combatMonster")) return 0;

  const visibleResolve = Number(actor.system?.resources?.resolve?.value ?? 0);
  const hiddenResolve = Number(actor.system?.combat?.qualityAttackUses?.combatMonster?.resolve ?? 0);

  return Math.max(0, visibleResolve, hiddenResolve);
}

async function setCombatMonsterResolve(actor, value) {
  const resolveMax = Math.max(1, Number(actor.system?.resources?.resolve?.max ?? 4));
  const nextResolve = Math.clamp
    ? Math.clamp(Number(value ?? 0), 0, resolveMax)
    : Math.min(resolveMax, Math.max(0, Number(value ?? 0)));

  const qualityAttackUses = foundry.utils.deepClone(actor.system?.combat?.qualityAttackUses ?? {});
  qualityAttackUses.combatMonster ??= {};
  qualityAttackUses.combatMonster.resolve = nextResolve;
  qualityAttackUses.combatMonster.combatId = getCombatId();

  await actor.update({
    "system.resources.resolve.enabled": true,
    "system.resources.resolve.value": nextResolve,
    "system.resources.resolve.max": resolveMax,
    "system.combat.qualityAttackUses": qualityAttackUses
  });
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
    String(entry.combatId ?? "") !== getCombatId() ||
    Number(entry.round ?? -1) !== getCombatRound()
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
  const entry = attacker.system?.combat?.qualityAttackUses?.watchfulHunter?.[defender.uuid];
  if (!entry) return null;
  if (String(entry.combatId ?? "") !== getCombatId()) return null;
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
    String(existing.combatId ?? "") === getCombatId() &&
    Number(existing.round ?? -1) === getCombatRound()
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
  const heal = Math.max(0, Number(amount ?? 0));
  if (!actor || heal <= 0) return;
  const path = actor.type === "character" ? "system.derived.wounds.value" : "system.miscStats.wounds.value";
  const maxPath = actor.type === "character" ? "system.derived.wounds.max" : "system.miscStats.wounds.max";
  const current = Number(foundry.utils.getProperty(actor, path) ?? 0);
  const max = Number(foundry.utils.getProperty(actor, maxPath) ?? current);
  await actor.update({ [path]: Math.min(max, current + heal) });
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

  if (areaAttackDeclaration?.active && hasZonerOption(qualityAttackModifier, "bombardment")) {
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
  const functionType = attackItem.system.baseTags?.functionType ?? "";
  const isSignature = Boolean(attackItem.system.isSignature);
  const attackQualityTags = getAttackQualityTags(attackItem);

  const appliesToLabels = {
    all: "DDA.Attack.AppliesTo.All",
    melee: "DDA.Attack.Range.Melee",
    range: "DDA.Attack.Range.Ranged",
    ranged: "DDA.Attack.Range.Ranged",
    damage: "DDA.Attack.Function.Damage",
    support: "DDA.Attack.Function.Support",
    signature: "DDA.Attack.Signature",
    taggedAttack: "DDA.Attack.AppliedTags",
    oneAttack: "DDA.Attack.AppliedTags",
    oneDamageAttack: "DDA.Attack.Function.Damage",
    oneMeleeAttack: "DDA.Attack.Range.Melee",
    oneRangedAttack: "DDA.Attack.Range.Ranged",
    oneMeleeDamageAttack: "DDA.Attack.Range.Melee",
    differentAttackPerRank: "DDA.Attack.AppliedTags"
  };

  const effectTagLabels = CONFIG.DDA?.effectTags ?? {};

  const modifierTotal = {
    accuracyBonus: 0,
    damageBonus: 0,
    unalterableDamage: 0,
    piercingUnalterableDamageMax: 0,
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
    temporaryWoundBoxesDamageMultiplier: 1
  };

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

  const bulletProofModifier = getBulletProofAttackModifier(attacker, options.defender);
  if (bulletProofModifier) {
    modifierTotal.accuracyBonus += bulletProofModifier.accuracyBonus;
    modifierTotal.damageBonus += bulletProofModifier.damageBonus;
    modifierTotal.bulletProofPenalty = bulletProofModifier.penalty;
    modifierTotal.qualities.push(bulletProofModifier.quality);
  }

  const watchfulHunterModifier = getWatchfulHunterAttackModifier(attacker, options.defender, rangeType);
  if (watchfulHunterModifier) {
    modifierTotal.accuracyBonus += watchfulHunterModifier.accuracyBonus;
    modifierTotal.qualities.push(watchfulHunterModifier.quality);
  }

  const qualities = attacker.items.filter((item) => item.type === "quality");

  for (const quality of qualities) {
    const modifier = quality.system.attackModifier ?? {};
    const grantsTags = Array.isArray(modifier.grantsTags) ? modifier.grantsTags.map(normalizeAttackTag).filter(Boolean) : [];
    const hasConfiguredModifier = Boolean(
      modifier.enabled ||
      grantsTags.length ||
      Number(modifier.accuracyBonus ?? 0) ||
      Number(modifier.damageBonus ?? 0) ||
      Number(modifier.unalterableDamage ?? 0) ||
      Number(modifier.extraActionCost ?? 0) ||
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

const rankValue = getAppliedAttackQualityRankValue(quality);

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

const selectedAreaTags = getSelectedAttackAreaTagsForQuality(quality, attackItem);

const areaTagsFromQuality = selectedAreaTags.length
  ? selectedAreaTags
  : grantsTags.filter((tag) => tag.startsWith("t:"));

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

if (modifier.aggressiveFlankAccuracyFrom && isTargetAdjacentToAttackerAlly(attacker, options.targetToken)) {
  const statKey = String(modifier.aggressiveFlankAccuracyFrom);
  accuracyBonus += Number(attacker.system.derivedStats?.[statKey]?.total ?? attacker.system.derivedStats?.[statKey]?.value ?? 0);
}

const unalterableDamage = Number(modifier.unalterableDamage ?? 0);
const automaticSuccesses = Number(modifier.automaticSuccesses ?? 0) + Number(modifier.automaticSuccessesPerRank ?? 0) * rankValue;
const extraActionCost = Number(modifier.extraActionCost ?? 0);
const effectTag = modifier.effectTag ?? "";

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
  const reachBonus = Math.max(0, Number(modifier.reachBonusPerRank ?? 1) * rankValue);
  modifierTotal.meleeReachBonus = Math.max(modifierTotal.meleeReachBonus, reachBonus);
}

if (hasVenomTag || modifier.venomous) {
  modifierTotal.venomous = true;
}

if (hasFocusTag || modifier.preciseFocus) {
  modifierTotal.preciseFocus = true;
}

if (hasMightyTag || modifier.mightyBlow) {
  modifierTotal.mightyBlow = true;
}

if (hasFeintTag || modifier.feintAttack) {
  modifierTotal.feintAttack = true;
}

if (hasDrainTag || modifier.lifesteal) {
  modifierTotal.lifesteal = true;
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

const qualityGrantsPiercingTag = grantsTags.includes("piercing");

if (modifier.piercingUnalterablePerLeftoverSuccess || qualityGrantsPiercingTag) {
  const fallbackCapPerRank = qualityGrantsPiercingTag ? 1 : 0;
  const capPerRank = Math.max(
    fallbackCapPerRank,
    Number(modifier.piercingUnalterableMaxPerRank ?? 0)
  );

  modifierTotal.piercingUnalterableDamageMax += capPerRank * rankValue;
}

    if (effectTag) modifierTotal.effectTags.push(effectTag);
    for (const tag of grantsTags) modifierTotal.qualityTags.push(tag);

    const parts = [];
    const appliesTo = modifier.appliesTo ?? "";

    if (appliesTo) {
      const labelKey = appliesToLabels[appliesTo];
      parts.push(labelKey ? localize(labelKey) : appliesTo);
    }

    const displayGrantTags = areaTagsFromQuality.length
  ? grantsTags.filter((tag) => !String(tag).startsWith("t:"))
  : grantsTags;

if (displayGrantTags.length) {
  parts.push(displayGrantTags.map((tag) => `[${tag.toUpperCase()}]`).join(", "));
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

if (modifier.piercingUnalterablePerLeftoverSuccess || qualityGrantsPiercingTag) {
  parts.push(formatI18n("DDA.Attack.QualityPart.Piercing", {
    value: rankValue
  }));
}

if (extraActionCost !== 0) {
  parts.push(formatI18n("DDA.Attack.QualityPart.Cost", {
    value: extraActionCost > 0 ? `+${extraActionCost}` : extraActionCost
  }));
}

if (effectTag) parts.push(effectTagLabels[effectTag] ?? effectTag);

modifierTotal.qualities.push({
  id: quality.id,
  name: quality.name,
  parts
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

  return modifierTotal;
}

function getSelectedAttackAreaTagsForQuality(quality, attackItem) {
  const attackId = String(attackItem?.id ?? "");
  if (!attackId) return [];

  const selectedChoices = Array.isArray(quality?.system?.choices?.selectedRanks)
    ? quality.system.choices.selectedRanks
    : [];

  const tags = [];

  for (const choice of selectedChoices) {
    const keyText = String(choice?.key ?? "").trim();

    const separatorIndex = keyText.indexOf(":");
    if (separatorIndex <= 0) continue;

    const choiceAttackId = keyText.slice(0, separatorIndex).trim();
    const rawTag = keyText.slice(separatorIndex + 1).trim();

    if (choiceAttackId !== attackId) continue;

    const tag = normalizeAttackTag(rawTag);

    if (tag.startsWith("t:")) {
      tags.push(tag);
    }
  }

  return [...new Set(tags)];
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

  const baseTags = attackItem.system?.baseTags ?? {};
  if (baseTags.rangeType) tags.add(normalizeAttackTag(baseTags.rangeType));
  if (baseTags.functionType) tags.add(normalizeAttackTag(baseTags.functionType));

  return tags;
}

function normalizeAttackTag(value = "") {
  return String(value ?? "").trim().replace(/^\[|\]$/g, "").toLowerCase();
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
      ?? choice.id
      ?? ""
    ).trim();

    const keyText = String(choice.key ?? "").trim();
    const keyAttackId = keyText.includes(":")
      ? keyText.split(":")[0]
      : "";

    return [directId, keyAttackId].filter(Boolean);
  })
  .filter(Boolean);
  const hasExplicitAttackSelection = selectedAttackIds.length > 0;
  const attackMatchesExplicitSelection = hasExplicitAttackSelection && selectedAttackIds.includes(attackItem.id);
  const hasGrantedTagOnAttack = grantsTags.some((tag) => attackQualityTags.has(tag));

  if (attackMatchesExplicitSelection) return true;

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

  return appliesTo === "all" ||
    appliesTo === context.rangeType ||
    appliesTo === context.functionType ||
    (appliesTo === "signature" && context.isSignature) ||
    (appliesTo === "melee" && context.rangeType === "melee") ||
    (["range", "ranged"].includes(appliesTo) && ["range", "ranged"].includes(context.rangeType));
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
  cleanseTargetHealthSuccesses = 0,
  accuracySuccesses = 0
}) {
  
  const functionType = attackItem.system.baseTags?.functionType ?? "";
  const effectTagLabels = CONFIG.DDA?.effectTags ?? {};

  const result = {
    applied: [],
    reason: ""
  };

  if (!activeEffectTags.length) {
    result.reason = localize("DDA.Attack.EffectReason.NoEffectTags");
    return result;
  }

  if (!hit) {
    result.reason = localize("DDA.Attack.EffectReason.AttackMissed");
    return result;
  }

  if (functionType === "damage" && normalDamage < 2) {
    result.reason = localize("DDA.Attack.EffectReason.NotEnoughNormalDamage");
    return result;
  }

for (const tag of activeEffectTags) {
  const label = effectTagLabels[tag] ?? tag;
  const effectKey = getEffectTagKey(tag);

  const effectData = {
    id: foundry.utils.randomID(),
    tag,
    label,
    sourceAttackId: attackItem.id,
    sourceAttackName: attackItem.name,
    sourceActorUuid: attacker.uuid,
    sourceActorName: attacker.name,
    targetActorUuid: defender.uuid,
    targetActorName: defender.name,
    duration: 3,
    remaining: 3
  };

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

  effectData.cleanseSelective = Boolean(cleanseDeclaration?.selective);
  effectData.cleanseSelectedEffectKeys = cleanseDeclaration?.selectedEffectKeys ?? [];
}

  result.applied.push(effectData);
}

  return result;
}

async function applyAttackEffectTags(defender, effectsToApply) {
  if (!defender || !effectsToApply?.length) return;

  const supportsActiveEffects =
    defender.type === "digimon" ||
    defender.type === "npc" ||
    defender.type === "character";

  if (!supportsActiveEffects) return;

  const currentEffects = foundry.utils.deepClone(defender.system.effects?.active ?? []);
  const cleanseReports = [];
    let shouldClearShieldTemp = false;
for (const effect of effectsToApply) {
  const effectKey = getEffectTagKey(effect.tag);
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
  targetHealthSuccesses: effect.cleanseTargetHealthSuccesses ?? null
});

    continue;
  }  
  if (effectKey === "shield") {
    const shieldData = await getShieldTempData(defender, effect);

    const shieldEffect = {
      ...effect,
      tempWounds: shieldData.amount,
      tempWoundsRemaining: shieldData.amount
    };

    const withoutOldShield = currentEffects.filter((existing) => {
      return getEffectTagKey(existing.tag) !== "shield";
    });

    withoutOldShield.push(shieldEffect);

    currentEffects.splice(0, currentEffects.length, ...withoutOldShield);

    await applyShieldTempWounds(defender, shieldData.amount, shieldEffect);

    continue;
  }

  const existingIndex = currentEffects.findIndex((existing) => {
    return existing.tag === effect.tag && existing.sourceAttackId === effect.sourceAttackId;
  });

  if (existingIndex >= 0) {
    currentEffects[existingIndex] = {
      ...currentEffects[existingIndex],
      ...effect,
      id: currentEffects[existingIndex].id ?? effect.id
    };
  } else {
    currentEffects.push(effect);
  }
}
await defender.update({
  "system.effects.active": currentEffects
});

if (shouldClearShieldTemp) {
  await clearShieldTempFromCleanse(defender);
}

defender.sheet?.render(true);

for (const cleanseReport of cleanseReports) {
  await createCleanseChatMessage(defender, cleanseReport);
}
}

async function increaseDodgePenalty(actor) {
  const current = Number(actor.system.combat?.dodgePenalty ?? 0);

  await actor.update({
    "system.combat.dodgePenalty": current + 1
  });
}

async function markAttackUsed(
  actor,
  usedSignatureMove = false,
  attacksMadeThisTurn = 1
) {
  const updateData = {
    "system.combat.hasAttackedThisRound": true,
    "system.combat.attacksMadeThisTurn": attacksMadeThisTurn,
    "system.combat.multiattackPenalty": 0
  };

  if (usedSignatureMove) {
    updateData["system.combat.signatureMoveUsedThisTurn"] = true;
  }

  await actor.update(updateData);
}

async function spendSignatureBattery(actor) {
  await actor.update({
    "system.resources.battery.value": 0
  });
}

export function registerAttackDodgeResponseListener() {
  if (globalThis.__ddaAttackDodgeResponseListenerRegistered) return;

  globalThis.__ddaAttackDodgeResponseListenerRegistered = true;

  Hooks.on("createChatMessage", (message) => {
    void receiveAttackDodgeResponse(message).catch((error) => {
      console.warn("DDA | Could not receive the Dodge response.", error);
    });
  });
}

export async function bindAttackDodgeChatCard(message, root) {
  if (!message || !root?.querySelectorAll) return;

  const request = getAttackDodgeRequestFromMessage(message);
  if (!request || request.status !== "pending") return;

  const buttons = root.querySelectorAll("[data-action='dda-roll-attack-dodge']");
  if (!buttons.length) return;

  let defender = null;

  try {
    defender = await fromUuid(request.defenderUuid);
  } catch (error) {
    console.warn("DDA | Could not resolve pending Dodge defender.", error);
  }

  const canResolve = canCurrentUserResolveAttackDodge(request, defender);

  for (const button of buttons) {
    if (button.dataset.ddaDodgeBound === "true") continue;

    button.dataset.ddaDodgeBound = "true";
    button.hidden = !canResolve;
    button.disabled = !canResolve;

    if (!canResolve) continue;

    button.addEventListener("click", async (event) => {
      event.preventDefault();

      if (button.dataset.ddaDodgeInFlight === "true") return;

      button.dataset.ddaDodgeInFlight = "true";
      button.disabled = true;

      const resolved = await resolveAttackDodgeFromChat(message);

      if (!resolved) {
        delete button.dataset.ddaDodgeInFlight;
        button.disabled = false;
      }
    });
  }
}

export async function resolveAttackDodgeFromChat(message) {
  const request = getAttackDodgeRequestFromMessage(message);

  if (!request || request.status !== "pending") {
    ui.notifications.warn(localize("DDA.Warning.DodgeRequestNoLongerPending"));
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

  const dodgeResult = await getAttackDodgeResult(
    defender,
    request.attackFunctionType,
    Number(request.effectDodgeModifier ?? 0)
  );

  if (!dodgeResult) return false;

  const outcome = getAttackDodgeOutcome(request, dodgeResult);

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

  if (defender.type !== "character") {
    await increaseDodgePenalty(defender);
  }

  return true;
}

async function requestAttackDodgeResult({
  attacker,
  defender,
  attackItem,
  attackFunctionType = "damage",
  effectDodgeModifier = 0,
  accuracySuccesses = 0,
  dodgeShouldHalve = false
} = {}) {
  if (!attacker || !defender || !attackItem) return null;

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
    attackerUuid: attacker.uuid,
    attackerName: attacker.name,
    defenderUuid: defender.uuid,
    defenderName: defender.name,
    attackItemId: attackItem.id,
    attackName: attackItem.name,
    attackFunctionType,
    effectDodgeModifier: Number(effectDodgeModifier ?? 0),
    accuracySuccesses: Math.max(0, Number(accuracySuccesses ?? 0)),
    dodgeShouldHalve: Boolean(dodgeShouldHalve),
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

  pendingAttackDodgeByAttacker.set(attacker.uuid, requestId);

  return new Promise((resolve) => {
    pendingAttackDodgeRequests.set(requestId, {
      ...request,
      messageId: message.id,
      resolve
    });
  });
}

async function receiveAttackDodgeResponse(message) {
  const response = getAttackDodgeResponseFromMessage(message);
  if (!response) return;

  const requestId = String(response.requestId ?? "");
  if (!requestId) return;

  const request = pendingAttackDodgeRequests.get(requestId);
  if (!request) return;

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

  pendingAttackDodgeRequests.delete(requestId);

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

function getAttackDodgeAuthorizedUserIds(defender) {
  if (!defender) return [];

  return game.users
    .filter((user) => {
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

function serializeAttackDodgeResult(result = {}) {
  return {
    rolledSuccesses: Number(result.rolledSuccesses ?? 0),
    automaticSuccesses: Number(result.automaticSuccesses ?? 0),
    totalSuccesses: Number(result.totalSuccesses ?? 0)
  };
}

function normalizeAttackDodgeResult(result = {}) {
  return {
    roll: null,
    rolledSuccesses: Math.max(0, Number(result?.rolledSuccesses ?? 0)),
    automaticSuccesses: Math.max(0, Number(result?.automaticSuccesses ?? 0)),
    totalSuccesses: Math.max(0, Number(result?.totalSuccesses ?? 0))
  };
}

function getAttackDodgeOutcome(request = {}, dodgeResult = {}) {
  const accuracySuccesses = Math.max(
    0,
    Number(request.accuracySuccesses ?? 0)
  );

  const rawDodgeSuccesses = Math.max(
    0,
    Number(dodgeResult.totalSuccesses ?? 0)
  );

  const dodgeSuccesses = request.dodgeShouldHalve
    ? Math.ceil(rawDodgeSuccesses / 2)
    : rawDodgeSuccesses;

  return {
    accuracySuccesses,
    rawDodgeSuccesses,
    dodgeSuccesses,
    hit: accuracySuccesses >= dodgeSuccesses && accuracySuccesses > 0
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
    dodgeSuccesses: Number(outcome.dodgeSuccesses ?? dodgeResult.totalSuccesses ?? 0),
    hit: Boolean(outcome.hit)
  };

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

      <button
        type="button"
        class="dda-roll-attack-dodge"
        data-action="dda-roll-attack-dodge"
      >
        ${localize("DDA.Button.Roll")} ${localize("DDA.MainStat.Dodge")}
      </button>
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
      </ul>

      <h3 class="attack-result-title">${resultLabel}</h3>
    </div>
  `;
}



async function getAttackDodgeResult(defender, attackFunctionType = "damage", effectDodgeModifier = 0) {
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
  return rollTamerEvadeAsDodge(defender, effectDodgeModifier);
}

return rollPool(defender, "dodge", {
  allowZeroSuccesses: true,
  diceModifier: effectDodgeModifier,
  externalLabel: localize("DDA.Attack.ActiveEffects")
});
}
async function rollTamerEvadeAsDodge(actor, effectDodgeModifier = 0) {
  const system = actor.system;
  const skill = system.skills?.evade;

  if (!skill) {
    ui.notifications.warn(localize("DDA.Warning.EvadeSkillNotFound"));
    return null;
  }

  const attributeKey = skill.attributes?.[0] ?? "agility";
  const attribute = system.attributes?.[attributeKey];

  if (!attribute) {
    ui.notifications.warn(localize("DDA.Warning.EvadeAttributeNotFound"));
    return null;
  }

  const attributeValue = Number(attribute.value ?? 0);
  const skillValue = Number(skill.value ?? 0);

  const skillModifier = skillValue > 0 ? skillValue : -1;
const modifier = attributeValue + skillModifier + Number(effectDodgeModifier ?? 0);

  const roll = await new Roll("3d6 + @modifier", {
    modifier
  }).evaluate();

  const total = Number(roll.total ?? 0);
  const totalSuccesses = Math.max(0, Math.floor(total / 5));

const flavor = `
  <div class="dda-chat-card dda-effect-card effect-special dda-pool-card dda-tamer-dodge-card">
    <h2>${formatI18n("DDA.Attack.SkillDefense", { skill: game.i18n.localize(skill.label) })}</h2>

    <ul class="dda-effect-list dda-pool-summary-list dda-tamer-dodge-list">
      <li>
        ${localize("DDA.TamerTalent.Requirement.Attribute")}:
        <strong>${game.i18n.localize(attribute.label)}</strong>
        ${attributeValue}.
      </li>

      <li>
        ${localize("DDA.TamerTalent.Requirement.Skill")}:
        ${
          skillValue > 0
            ? `<strong>${game.i18n.localize(skill.label)}</strong> ${skillValue}.`
            : `<strong>${localize("DDA.TamerSkillDialog.Untrained")}</strong> — ${localize("DDA.Attack.Penalty")} <strong>-1</strong>.`
        }
      </li>

      <li>
        ${localize("DDA.Attack.FinalModifier")}:
        <strong>${modifier >= 0 ? `+${modifier}` : modifier}</strong>.
      </li>
          ${
  effectDodgeModifier !== 0
    ? `
      <li>
        ${localize("DDA.Attack.EffectModifier")}:
        <strong>${effectDodgeModifier >= 0 ? `+${effectDodgeModifier}` : effectDodgeModifier}</strong>.
      </li>
    `
    : ""
}
      <li>
        ${localize("DDA.Roll.Result")}:
        <strong>${total}</strong>.
      </li>

      <li class="pool-total-successes">
        ${localize("DDA.Attack.DodgeSuccesses")}:
        <strong>${totalSuccesses}</strong>.
      </li>
    </ul>
  </div>
`;

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor
  });

  return {
    roll,
    rolledSuccesses: totalSuccesses,
    automaticSuccesses: 0,
    totalSuccesses
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

  const bit = Number(sourceActor?.system.derivedStats?.bit?.value ?? 1);
  const stageValue = Number(sourceActor?.system.stageValue ?? 0);

  const resistance = Number(
    defender.system.miscStats?.resistance?.value ??
    defender.system.derived?.sv?.value ??
    0
  );

  const rawAmount = bit + stageValue;
  const amount = Math.max(1, rawAmount - resistance);

  return {
    bit,
    stageValue,
    resistance,
    rawAmount,
    amount
  };
}

async function applyShieldTempWounds(defender, amount, shieldEffect) {
  if (defender.type === "character") {
    await defender.update({
      "system.derived.wounds.temp.value": amount,
      "system.derived.wounds.temp.source": shieldEffect.label ?? localize("DDA.Effect.Shield"),
      "system.derived.wounds.temp.duration": shieldEffect.remaining ?? shieldEffect.duration ?? 3
    });

    return;
  }

  if (defender.type === "digimon" || defender.type === "npc") {
    await defender.update({
      "system.miscStats.wounds.temp.value": amount,
      "system.miscStats.wounds.temp.source": shieldEffect.label ?? localize("DDA.Effect.Shield"),
      "system.miscStats.wounds.temp.duration": shieldEffect.remaining ?? shieldEffect.duration ?? 3
    });
  }
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

    if (useSelection && !selectedKeys.has(effectKey)) {
      remainingEffects.push(effect);
      continue;
    }

    const currentRemaining = Number(effect.remaining ?? effect.duration ?? 1);
    const nextRemaining = currentRemaining - amount;

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

function getCombatantForActor(actor, combat = game.combat) {
  if (!actor || !combat) return null;

  return (combat.combatants?.contents ?? []).find((combatant) => {
    return actorsMatch(combatant.actor, actor);
  }) ?? null;
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

  const combatant = getCombatantForActor(attacker, combat);

  if (!combatant) {
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

  if (!isInterrupt && combat.combatant?.id !== combatant.id) {
    return {
      ok: false,
      message: combatText(
        `Apenas ${combat.combatant?.actor?.name ?? "o participante ativo"} pode usar a Ação de Ataque agora.`,
        `Only ${combat.combatant?.actor?.name ?? "the active participant"} can use the Attack Action right now.`
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
  attackEffectiveLimitTotal
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

    if (distance > reach) {
      return {
        valid: false,
        message: combatText(
          `Alvo fora do alcance corpo a corpo: ${distance} Espaços de distância, alcance ${reach}.`,
          `Target is outside melee reach: ${distance} Spaces away, reach ${reach}.`
        )
      };
    }

    return {
      valid: true,
      distance,
      reach,
      rangeType,
      accuracyPenalty: 0
    };
  }

  if (["range", "ranged"].includes(rangeType)) {
    const range = Math.max(0, Number(attackRangeTotal ?? 0));
    const effectiveLimit = Math.max(0, Number(attackEffectiveLimitTotal ?? 0));

    if (distance > effectiveLimit) {
      return {
        valid: false,
        message: combatText(
          `Alvo fora do Limite Efetivo: ${distance} Espaços de distância, limite ${effectiveLimit}.`,
          `Target is beyond Effective Limit: ${distance} Spaces away, limit ${effectiveLimit}.`
        )
      };
    }

    const beyondRangePenalty = Math.max(0, distance - range);

    const adjacentEnemy = !qualityAttackModifier?.recoilIgnoreAdjacentAccuracyPenalty &&
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
  const combatant = getCombatantForActor(actor);

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
      selectedEffectKeys: []
    };
  }

  const activeEffects = defender.system.effects?.active ?? [];

  if (!activeEffects.length) {
    return {
      enabled: true,
      selective: false,
      selectedEffectKeys: []
    };
  }

  const effectOptions = activeEffects.map((effect) => {
    const key = getEffectTagKey(effect.tag);
    const label = effect.label ?? effect.tag ?? key;
    const remaining = Number(effect.remaining ?? effect.duration ?? 0);
const source = effect.sourceAttackName || effect.sourceActorName || localize("DDA.Cleanse.UnknownSource");

    return `
      <label class="cleanse-effect-choice">
        <input type="checkbox" name="effect" value="${key}" />
        <span class="cleanse-effect-label">
          <strong>${label}</strong>
          <small>${formatI18n("DDA.Cleanse.EffectSourceAndDuration", {
  source,
  duration: remaining
})}</small>
        </span>
      </label>
    `;
  }).join("");

  return Dialog.wait({
title: localize("DDA.Effect.Cleanse"),
    content: `
      <div class="dda-cleanse-dialog">
        <div class="cleanse-dialog-header">
<h2>${localize("DDA.Effect.Cleanse")}</h2>
          <p>${formatI18n("DDA.Cleanse.ChooseApplication", {
  target: `<strong>${defender.name}</strong>`
})}</p>
        </div>

        <div class="cleanse-mode-grid">
          <label class="cleanse-mode-card">
            <input type="radio" name="mode" value="all" checked />
            <span>
<strong>${localize("DDA.Cleanse.Total")}</strong>
<small>${localize("DDA.Cleanse.TotalDescription")}</small>
            </span>
          </label>

          <label class="cleanse-mode-card">
            <input type="radio" name="mode" value="selective" />
            <span>
<strong>${localize("DDA.Cleanse.Selective")}</strong>
<small>${localize("DDA.Cleanse.SelectiveDescription")}</small>
            </span>
          </label>
        </div>

        <div class="cleanse-effect-picker">
<h3>${localize("DDA.Cleanse.ActiveEffectsOnTarget")}</h3>
<p>${localize("DDA.Cleanse.SelectiveHint")}</p>

          <div class="cleanse-effect-choice-list">
            ${effectOptions}
          </div>
        </div>
      </div>
    `,
    buttons: {
      ok: {
label: localize("DDA.Button.Confirm"),
        callback: (html) => {
          const mode = html[0].querySelector('input[name="mode"]:checked')?.value ?? "all";

          const selectedEffectKeys = Array.from(html[0].querySelectorAll('input[name="effect"]:checked'))
            .map((input) => input.value)
            .filter(Boolean);

          return {
            enabled: true,
            selective: mode === "selective",
            selectedEffectKeys
          };
        }
      },
      cancel: {
label: localize("DDA.Button.Cancel"),
        callback: () => null
      }
    },
    default: "ok"
  });
}

async function rollCleanseTargetHealthPool(actor) {
  if (actor.type === "digimon" || actor.type === "npc") {
    return rollPool(actor, "health", {
      allowZeroSuccesses: true,
      externalLabel: localize("DDA.Effect.Cleanse")
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
    <h2>${localize("DDA.Attack.CleanseHealth")}</h2>
    <p><strong>${actor.name}</strong> ${localize("DDA.Attack.AssistsCleanse")}</p>
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

function getActiveEffectAttackModifiers(actor) {
  const activeEffects = actor.system.effects?.active ?? [];

  const result = {
    accuracyDice: 0,
    damage: 0,
    notes: []
  };

  for (const effect of activeEffects) {
    const key = getEffectTagKey(effect.tag);

    if (key === "keen" || key === "precisao" || key === "precisão") {
      result.accuracyDice += 1;
      result.notes.push(formatI18n("DDA.EffectNote.AccuracyDice", {
        effect: localize("DDA.Effect.Keen"),
        value: "+1"
      }));
    }

    if (key === "vague" || key === "imprecisao" || key === "imprecisão") {
      result.accuracyDice -= 1;
      result.notes.push(formatI18n("DDA.EffectNote.AccuracyDice", {
        effect: localize("DDA.Effect.Vague"),
        value: "-1"
      }));
    }

    if (key === "blind" || key === "cegar") {
      result.accuracyDice -= 1;
      result.notes.push(formatI18n("DDA.EffectNote.AccuracyDice", {
        effect: localize("DDA.Effect.Blind"),
        value: "-1"
      }));
    }

    if (key === "sharpen" || key === "afiar") {
      result.damage += 1;
      result.notes.push(formatI18n("DDA.EffectNote.Damage", {
        effect: localize("DDA.Effect.Sharpen"),
        value: "+1"
      }));
    }

    if (key === "weak" || key === "enfraquecer") {
      result.damage -= 1;
      result.notes.push(formatI18n("DDA.EffectNote.Damage", {
        effect: localize("DDA.Effect.Weak"),
        value: "-1"
      }));
    }
  }

  return result;
}

function getActiveEffectDefenseModifiers(actor) {
  const activeEffects = actor.system.effects?.active ?? [];

  const result = {
    dodgeDice: 0,
    armor: 0,
    notes: []
  };

  for (const effect of activeEffects) {
    const key = getEffectTagKey(effect.tag);

    if (key === "swift" || key === "rapido" || key === "rápido") {
      result.dodgeDice += 1;
      result.notes.push(formatI18n("DDA.EffectNote.DodgeDice", {
        effect: localize("DDA.Effect.Swift"),
        value: "+1"
      }));
    }

    if (key === "heavy" || key === "pesado") {
      result.dodgeDice -= 1;
      result.notes.push(formatI18n("DDA.EffectNote.DodgeDice", {
        effect: localize("DDA.Effect.Heavy"),
        value: "-1"
      }));
    }

    if (key === "blind" || key === "cegar") {
      result.dodgeDice -= 1;
      result.notes.push(formatI18n("DDA.EffectNote.DodgeDice", {
        effect: localize("DDA.Effect.Blind"),
        value: "-1"
      }));
    }

    if (key === "frail" || key === "fragil" || key === "frágil") {
      result.armor -= 1;
      result.notes.push(formatI18n("DDA.EffectNote.Armor", {
        effect: localize("DDA.Effect.Frail"),
        value: "-1"
      }));
    }
  }

  return result;
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

function localize(key) {
  return game.i18n.localize(key);
}

function formatI18n(key, data = {}) {
  return game.i18n.format(key, data);
}