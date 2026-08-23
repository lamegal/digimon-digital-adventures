const SYSTEM_ID = "digimon-digital-adventures";
const NON_STACKING_PATH = "system.combat.temporaryWounds.nonStacking";

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function normalizeKey(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function getTemporaryWoundRootPath(actor) {
  if (actor?.type === "character") return "system.derived.wounds.temp";
  if (["digimon", "npc"].includes(actor?.type)) return "system.miscStats.wounds.temp";
  return "";
}

export function getTemporaryWoundValue(actor) {
  const root = getTemporaryWoundRootPath(actor);
  if (!root) return 0;
  return Math.max(0, number(foundry.utils.getProperty(actor, `${root}.value`), 0));
}

function gloriousWorldState(actor) {
  const state = actor?.system?.tamerTalentStates?.gloriousWorld ?? {};
  const remaining = state?.active ? Math.max(0, number(state.remaining, 0)) : 0;
  return remaining > 0 ? { id: "gloriousWorld", label: "Glorious World", remaining } : null;
}

function challengerState(actor) {
  const state = actor?.system?.combat?.tamerTalentRuntime?.challenger ?? {};
  const remaining = state?.active ? Math.max(0, number(state.remaining, 0)) : 0;
  return remaining > 0 ? { id: "challenger", label: "Challenger", remaining } : null;
}

export function getStackingTemporaryWoundSources(actor) {
  return [gloriousWorldState(actor), challengerState(actor)].filter(Boolean);
}

export function getStackingTemporaryWoundTotal(actor) {
  return getStackingTemporaryWoundSources(actor)
    .reduce((total, source) => total + Math.max(0, number(source.remaining, 0)), 0);
}

function inferLegacyNonStackingState(actor, ordinaryValue) {
  if (ordinaryValue <= 0) return null;

  const root = getTemporaryWoundRootPath(actor);
  const sourceText = root
    ? String(foundry.utils.getProperty(actor, `${root}.source`) ?? "").trim()
    : "";
  const effects = actor?.system?.effects?.active ?? [];
  const shield = effects.find((effect) => normalizeKey(effect?.tag) === "shield");
  const reinforce = effects.find((effect) => normalizeKey(effect?.tag) === "tamerreinforce");

  if (shield) {
    return {
      active: true,
      sourceId: "shield",
      label: String(shield.label ?? "[SHIELD]"),
      remaining: ordinaryValue,
      granted: ordinaryValue,
      effectId: String(shield.id ?? ""),
      legacyInferred: true
    };
  }

  if (reinforce) {
    return {
      active: true,
      sourceId: `reinforce:${String(reinforce.sourceActorUuid ?? "")}`,
      label: String(reinforce.label ?? "Reinforce"),
      remaining: ordinaryValue,
      granted: ordinaryValue,
      effectId: String(reinforce.id ?? ""),
      legacyInferred: true
    };
  }

  return {
    active: true,
    sourceId: `legacy:${normalizeKey(sourceText) || "temporary"}`,
    label: sourceText || "Temporary Wound Boxes",
    remaining: ordinaryValue,
    granted: ordinaryValue,
    effectId: "",
    legacyInferred: true
  };
}

export function getNonStackingTemporaryWoundState(actor) {
  const total = getTemporaryWoundValue(actor);
  const stackingTotal = getStackingTemporaryWoundTotal(actor);
  const ordinaryValue = Math.max(0, total - stackingTotal);
  if (ordinaryValue <= 0) return null;

  const stored = foundry.utils.deepClone(
    foundry.utils.getProperty(actor, NON_STACKING_PATH) ?? {}
  );

  if (stored?.active && number(stored.remaining, 0) > 0) {
    stored.remaining = Math.min(ordinaryValue, Math.max(0, number(stored.remaining, ordinaryValue)));
    stored.granted = Math.max(stored.remaining, number(stored.granted, stored.remaining));
    return stored;
  }

  return inferLegacyNonStackingState(actor, ordinaryValue);
}

export function getTemporaryWoundSummary(actor) {
  const stackingSources = getStackingTemporaryWoundSources(actor);
  const stackingTotal = stackingSources.reduce((total, entry) => total + entry.remaining, 0);
  const total = getTemporaryWoundValue(actor);
  const nonStacking = getNonStackingTemporaryWoundState(actor);
  return {
    total,
    stackingSources,
    stackingTotal,
    nonStacking,
    nonStackingValue: Math.max(0, total - stackingTotal)
  };
}

function displaySource(stackers = [], nonStacking = null) {
  return [
    ...stackers.map((source) => source.label),
    ...(nonStacking?.remaining > 0 ? [nonStacking.label] : [])
  ].filter(Boolean).join(" + ");
}

function displayDuration(stackers = [], nonStacking = null) {
  const values = [];
  if (stackers.some((source) => source.id === "gloriousWorld")) values.push("rest");
  if (stackers.some((source) => source.id === "challenger")) values.push("combat");
  if (nonStacking?.duration) values.push(String(nonStacking.duration));
  return [...new Set(values)].join(" + ");
}

async function writeDisplay(actor, { nonStacking = null, total = null } = {}) {
  const root = getTemporaryWoundRootPath(actor);
  if (!root) return false;
  const stackers = getStackingTemporaryWoundSources(actor);
  const stackingTotal = stackers.reduce((sum, source) => sum + source.remaining, 0);
  const ordinary = nonStacking?.active ? Math.max(0, number(nonStacking.remaining, 0)) : 0;
  const resolvedTotal = total === null ? stackingTotal + ordinary : Math.max(0, number(total, 0));
  const updates = {
    [`${root}.value`]: resolvedTotal,
    [`${root}.source`]: displaySource(stackers, ordinary > 0 ? nonStacking : null),
    [`${root}.duration`]: resolvedTotal > 0 ? displayDuration(stackers, ordinary > 0 ? nonStacking : null) : "",
    [NON_STACKING_PATH]: ordinary > 0
      ? { ...nonStacking, active: true, remaining: ordinary }
      : { active: false, remaining: 0, endedAt: new Date().toISOString() }
  };
  await actor.update(updates);
  return true;
}

/**
 * Grant a normal Temporary Wound Box source.
 *
 * Core 9.09e: normal sources do not stack. The larger source replaces the
 * smaller source. Explicit exceptions such as Glorious World and Challenger
 * are tracked separately and remain additive.
 */
export async function grantNonStackingTemporaryWounds(actor, amount, {
  sourceId = "temporary",
  label = "Temporary Wound Boxes",
  duration = "",
  effectId = "",
  metadata = {}
} = {}) {
  const requested = Math.max(0, Math.floor(number(amount, 0)));
  if (!actor || requested <= 0) {
    return { applied: false, requested, gained: 0, reason: "noAmount" };
  }

  const summary = getTemporaryWoundSummary(actor);
  const current = summary.nonStacking;
  const currentValue = Math.max(0, number(current?.remaining, summary.nonStackingValue));
  const sameSourceId = Boolean(current && String(current.sourceId ?? "") === String(sourceId ?? ""));
  const currentEffectId = String(current?.effectId ?? "");
  const requestedEffectId = String(effectId ?? "");
  // Re-applications backed by different effects are different sources even when
  // they share the same tag/name (for example two separate [SHIELD] effects).
  // This keeps the duration/effect metadata attached to whichever source is
  // actually providing the higher Temporary Wound value.
  const sameSource = Boolean(
    sameSourceId &&
    (
      currentEffectId || requestedEffectId
        ? currentEffectId === requestedEffectId
        : true
    )
  );

  if (!sameSource && requested <= currentValue) {
    return {
      applied: false,
      requested,
      gained: 0,
      reason: "lowerSourceKept",
      currentSource: current,
      effectiveNonStacking: currentValue,
      total: summary.total
    };
  }

  const nextValue = sameSource ? Math.max(currentValue, requested) : requested;
  const next = {
    active: true,
    sourceId: String(sourceId ?? "temporary"),
    label: String(label ?? "Temporary Wound Boxes"),
    duration: String(duration ?? ""),
    effectId: String(effectId ?? ""),
    granted: nextValue,
    remaining: nextValue,
    combatId: String(game?.combat?.id ?? ""),
    createdAt: new Date().toISOString(),
    ...metadata
  };

  await writeDisplay(actor, { nonStacking: next });

  return {
    applied: true,
    requested,
    gained: Math.max(0, nextValue - currentValue),
    replacedSource: sameSource ? null : current,
    source: next,
    effectiveNonStacking: nextValue,
    total: getStackingTemporaryWoundTotal(actor) + nextValue
  };
}

/**
 * Reconcile the active normal source after damage has already reduced the
 * actor's displayed Temporary Wound pool. Explicit stacking ledgers must be
 * consumed before this function is called.
 */
export async function reconcileNonStackingTemporaryWoundsAfterDamage(actor) {
  if (!actor) return { depleted: false };
  const total = getTemporaryWoundValue(actor);
  const stackingTotal = getStackingTemporaryWoundTotal(actor);
  const ordinaryRemaining = Math.max(0, total - stackingTotal);
  // Damage is applied to the displayed Temporary Wound value before source
  // ledgers are reconciled. Preserve the stored source even when the displayed
  // ordinary pool just reached 0, otherwise we would lose the backing Shield /
  // Reinforce effect identity exactly when it needs to be expired.
  const storedPrevious = foundry.utils.deepClone(
    foundry.utils.getProperty(actor, NON_STACKING_PATH) ?? {}
  );
  const previous = storedPrevious?.active && number(storedPrevious.remaining, 0) > 0
    ? storedPrevious
    : getNonStackingTemporaryWoundState(actor);

  if (!previous) {
    if (ordinaryRemaining <= 0) {
      await writeDisplay(actor, { nonStacking: null, total });
      return { depleted: false };
    }
    const inferred = inferLegacyNonStackingState(actor, ordinaryRemaining);
    await writeDisplay(actor, { nonStacking: inferred, total });
    return { depleted: false, state: inferred };
  }

  const next = {
    ...foundry.utils.deepClone(previous),
    active: ordinaryRemaining > 0,
    remaining: ordinaryRemaining,
    updatedAt: new Date().toISOString()
  };

  if (ordinaryRemaining <= 0) next.endedAt = new Date().toISOString();
  await writeDisplay(actor, {
    nonStacking: ordinaryRemaining > 0 ? next : null,
    total
  });

  return {
    depleted: ordinaryRemaining <= 0 && number(previous.remaining, 0) > 0,
    previous,
    state: next,
    effectId: ordinaryRemaining <= 0 ? String(previous.effectId ?? "") : "",
    sourceId: String(previous.sourceId ?? "")
  };
}

export async function expireNonStackingTemporaryWounds(actor, {
  sourceId = "",
  effectId = ""
} = {}) {
  if (!actor) return { expired: false };
  const summary = getTemporaryWoundSummary(actor);
  const current = summary.nonStacking;
  if (!current) return { expired: false };

  const sourceMatches = Boolean(sourceId && String(current.sourceId ?? "") === String(sourceId));
  const effectMatches = Boolean(effectId && String(current.effectId ?? "") === String(effectId));
  const matches = sourceId && effectId
    ? sourceMatches && effectMatches
    : sourceId
      ? sourceMatches
      : effectId
        ? effectMatches
        : false;
  if (!matches) return { expired: false, current };

  await writeDisplay(actor, { nonStacking: null });
  return {
    expired: true,
    source: current,
    remainingRemoved: Math.max(0, number(current.remaining, 0)),
    remainingStacking: getStackingTemporaryWoundTotal(actor)
  };
}

export async function clearNonStackingTemporaryWounds(actor) {
  if (!actor) return { cleared: false };
  const current = getNonStackingTemporaryWoundState(actor);
  if (!current) return { cleared: false };
  await writeDisplay(actor, { nonStacking: null });
  return { cleared: true, source: current };
}

export async function expireCombatBoundNonStackingTemporaryWounds(actor, combatId = "") {
  const current = getNonStackingTemporaryWoundState(actor);
  if (!current) return { expired: false };
  const duration = String(current.duration ?? "").trim().toLowerCase();
  const sourceCombatId = String(current.combatId ?? "");
  if (duration !== "combat") return { expired: false, current };
  if (combatId && sourceCombatId && sourceCombatId !== String(combatId)) {
    return { expired: false, current };
  }
  return expireNonStackingTemporaryWounds(actor, {
    sourceId: String(current.sourceId ?? ""),
    effectId: String(current.effectId ?? "")
  });
}

export function isTemporaryWoundSourceActive(actor, sourceId = "", effectId = "") {
  const current = getNonStackingTemporaryWoundState(actor);
  if (!current) return false;
  if (sourceId && String(current.sourceId ?? "") === String(sourceId)) return true;
  if (effectId && String(current.effectId ?? "") === String(effectId)) return true;
  return false;
}

export const TEMPORARY_WOUND_RULE_VERSION = 2;
export const TEMPORARY_WOUND_NON_STACKING_PATH = NON_STACKING_PATH;
export const TEMPORARY_WOUND_SYSTEM_ID = SYSTEM_ID;
