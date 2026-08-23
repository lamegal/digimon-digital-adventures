import {
  validateEffectAttackDeclaration as validateBaseEffectAttackDeclaration
} from "./effect-qualities.js";

import {
  EFFECT_TAGS
} from "../rules/quality-automation.js";

const AREA_SIGNATURE_SUPPORT_TAGS = new Set([
  "haste",
  "shield",
  "paralyze",
  "weak",
  "regen",
  "strength",
  "stun"
]);

function normalizeEffectTag(value = "") {
  return String(value ?? "")
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .toLowerCase();
}

function text(pt, en) {
  return String(game?.i18n?.lang ?? "en")
    .toLowerCase()
    .startsWith("pt")
      ? pt
      : en;
}

/**
 * beta.8 compatibility validator.
 *
 * The base v2.0.22 validator correctly enforces structural limits, self-targeting,
 * per-Effect restrictions, Protecting Shield uses and Area restrictions. Two old
 * blanket assumptions were too broad, though: every Positive Effect was forced
 * onto [SUPPORT], and every Positive Effect was forced onto an ally.
 *
 * DDA 2E only imposes those restrictions when the individual Effect says so.
 * This wrapper preserves every explicit restriction and relaxes only those two
 * generic Positive-Effect gates.
 */
export function validateEffectAttackDeclaration(options = {}) {
  const {
    attacker,
    defender,
    attackItem,
    effectTags = [],
    areaActive = false,
    currentBattery = 0,
    targetIsAlly = false,
    functionTypeOverride = ""
  } = options;

  const baseResult = validateBaseEffectAttackDeclaration(options);
  if (baseResult?.ok) return baseResult;
  if (!attackItem) return baseResult;

  const normalizedEffects = [...new Set(
    effectTags
      .map(normalizeEffectTag)
      .filter((tag) => Boolean(EFFECT_TAGS[tag]))
  )];

  // The base validator already owns the one-Effect limit. Never relax a
  // structural failure involving zero/multiple Effect Tags.
  if (normalizedEffects.length !== 1) return baseResult;

  const effectKey = normalizedEffects[0];
  const definition = EFFECT_TAGS[effectKey] ?? {};
  const effectType = String(definition.type ?? "").trim().toLowerCase();

  // Only Positive Effects hit the obsolete blanket gates. Everything else must
  // keep the exact base result.
  if (effectType !== "positive") return baseResult;

  const functionType = String(
    functionTypeOverride ||
    attackItem.system?.baseTags?.functionType ||
    ""
  ).trim().toLowerCase();
  const isSignature = Boolean(attackItem.system?.isSignature);

  // Self-application remains prohibited for Attack Effects.
  if (attacker?.uuid && defender?.uuid && attacker.uuid === defender.uuid) {
    return baseResult;
  }

  // Preserve any Effect-specific Allies Only declaration, including future
  // Positive Effects that may acquire the property later.
  if (definition.alliesOnly && defender && !targetIsAlly) {
    return baseResult;
  }

  // Preserve any Effect-specific [DAMAGE] declaration.
  if (definition.requiresDamage && functionType !== "damage") {
    return baseResult;
  }

  // [SHIELD] is explicitly a [SUPPORT] Effect; this is not a generic Positive
  // restriction and therefore stays mandatory in beta.8.
  if (effectKey === "shield" && functionType !== "support") {
    return {
      ok: false,
      message: text(
        "[SHIELD] só pode ser aplicado por um Ataque [SUPPORT].",
        "[SHIELD] can only be applied by a [SUPPORT] Attack."
      )
    };
  }

  // These Effects explicitly require a [SUPPORT] Signature Move and 2 Battery
  // when combined with an Area Tag. Check against the real function type before
  // neutralizing the base validator's generic Positive rule.
  if (areaActive && AREA_SIGNATURE_SUPPORT_TAGS.has(effectKey)) {
    if (!isSignature || functionType !== "support" || Number(currentBattery ?? 0) < 2) {
      return {
        ok: false,
        message: text(
          `[${effectKey.toUpperCase()}] só pode ser combinado com Área em um Movimento Assinatura [SUPPORT] com pelo menos 2 Bateria.`,
          `[${effectKey.toUpperCase()}] can only be combined with an Area Tag on a [SUPPORT] Signature Move with at least 2 Battery.`
        )
      };
    }
  }

  /*
   * Re-run the base validator with only its two obsolete blanket assumptions
   * neutralized. Structural checks, self-targeting, Protecting Shield purchase/
   * uses and all other base checks still execute normally.
   */
  const relaxedResult = validateBaseEffectAttackDeclaration({
    ...options,
    targetIsAlly: definition.alliesOnly ? targetIsAlly : true,
    functionTypeOverride: "support"
  });

  if (!relaxedResult?.ok) return relaxedResult;

  return {
    ...relaxedResult,
    effectKey,
    effectType,
    functionType,
    beta8PositiveRestrictionOverride: true
  };
}
