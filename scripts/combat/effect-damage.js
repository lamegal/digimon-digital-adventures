import {
  getActorDerivedStat,
  getActorSv
} from "../rules/quality-automation.js";

import {
  applyDamage
} from "../rolls/damage-application.js";

const DAMAGE_EFFECT_TAGS = new Set([
  "burn",
  "freeze",
  "poison",
  "ruin"
]);

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeEffectDamageTag(value = "") {
  return String(value ?? "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
}

function effectIsActive(effect) {
  const tag = normalizeEffectDamageTag(effect?.tag);
  if (!DAMAGE_EFFECT_TAGS.has(tag)) return false;

  const hasNumericDuration =
    effect?.hasDuration === true ||
    effect?.durationRule === true ||
    effect?.durationRule === "true";

  if (!hasNumericDuration) return true;

  return number(
    effect?.remaining ?? effect?.duration,
    0
  ) > 0;
}

function getWoundPaths(actor) {
  if (actor?.type === "character") {
    return {
      root: "system.derived.wounds",
      value: "system.derived.wounds.value",
      temp: "system.derived.wounds.temp.value"
    };
  }

  return {
    root: "system.miscStats.wounds",
    value: "system.miscStats.wounds.value",
    temp: "system.miscStats.wounds.temp.value"
  };
}

export function getEffectDamageWoundSnapshot(actor) {
  if (!actor) {
    return {
      wounds: 0,
      temp: 0,
      max: 0
    };
  }

  const paths = getWoundPaths(actor);
  const root = foundry.utils.getProperty(
    actor,
    paths.root
  ) ?? {};

  return {
    wounds: Math.max(
      0,
      number(root?.value, 0)
    ),
    temp: Math.max(
      0,
      number(root?.temp?.value, 0)
    ),
    max: Math.max(
      0,
      number(root?.max, 0)
    )
  };
}

function activeDamageEffectCount(actor) {
  return (
    actor?.system?.effects?.active ?? []
  ).filter(effectIsActive).length;
}

function naturewalkDamageReduction(actor, tag) {
  return Math.max(
    0,
    number(
      actor?.system?.qualityFeatures
        ?.naturewalk?.damageReduction?.[tag],
      0
    )
  );
}

export function getEffectDamageReduction(actor, tag) {
  const normalizedTag =
    normalizeEffectDamageTag(tag);

  if (!DAMAGE_EFFECT_TAGS.has(normalizedTag)) {
    return {
      total: 0,
      stacking: 0,
      naturewalk: 0
    };
  }

  /*
   * DDA Effect Damage interaction already used by the system:
   * each additional active Damage Effect reduces every Effect Damage instance
   * by 1, then Naturewalk applies its tag-specific reduction.
   */
  const stacking = Math.max(
    0,
    activeDamageEffectCount(actor) - 1
  );

  const naturewalk =
    naturewalkDamageReduction(
      actor,
      normalizedTag
    );

  return {
    total: stacking + naturewalk,
    stacking,
    naturewalk
  };
}

function effectDamageRoundKey(combat = game.combat) {
  return `${combat?.id ?? "no-combat"}:${number(combat?.round, 0)}`;
}

function effectDamageCap(actor) {
  return Math.max(
    0,
    number(
      getActorSv(actor),
      number(actor?.system?.stageValue, 0)
    ) * 2
  );
}

function getEffectDamageCapState(actor) {
  const key = effectDamageRoundKey();
  const sameRound =
    String(
      actor?.system?.combat
        ?.effectDamageRoundKey ??
      ""
    ) === key;

  const used = sameRound
    ? Math.max(
        0,
        number(
          actor?.system?.combat
            ?.effectDamageTakenThisRound,
          0
        )
      )
    : 0;

  const cap = effectDamageCap(actor);

  return {
    key,
    used,
    cap,
    remaining: Math.max(0, cap - used)
  };
}

async function resolveEffectSourceActor(effect) {
  const uuid = String(
    effect?.sourceActorUuid ?? ""
  ).trim();

  if (!uuid) return null;

  try {
    const document = await fromUuid(uuid);
    return document?.documentName === "Token"
      ? document.actor
      : document;
  } catch (_error) {
    return null;
  }
}

function effectLabel(effect, tag) {
  return String(
    effect?.label ??
    effect?.sourceAttackName ??
    `[${String(tag).toUpperCase()}]`
  );
}

/**
 * Canonical DDA Effect Damage application.
 *
 * All BURN/FREEZE/POISON/RUIN damage routes through applyDamage(), so the same
 * Temporary Wound, Shield, survival, Boss Template, Multi-Stage and defeat
 * lifecycle used by normal damage is respected. The per-round Effect Damage
 * cap remains tracked separately because it is a rule of Effect Damage itself.
 */
export async function applyDDAEffectDamage(
  actor,
  effect,
  rawDamage,
  {
    tag = normalizeEffectDamageTag(effect?.tag),
    sourceActor = null,
    createChat = false,
    reason = "effect"
  } = {}
) {
  const normalizedTag =
    normalizeEffectDamageTag(tag);

  const raw = Math.max(
    0,
    Math.floor(number(rawDamage, 0))
  );

  const before =
    getEffectDamageWoundSnapshot(actor);

  const reduction =
    getEffectDamageReduction(
      actor,
      normalizedTag
    );

  const afterReduction = Math.max(
    0,
    raw - reduction.total
  );

  const capState =
    getEffectDamageCapState(actor);

  const cappedDamage = Math.min(
    afterReduction,
    capState.remaining
  );

  const baseReport = {
    tag: normalizedTag,
    label: effectLabel(
      effect,
      normalizedTag
    ),
    type: "damage",
    reason,
    sourceActorUuid:
      effect?.sourceActorUuid ?? "",
    sourceActorName:
      effect?.sourceActorName ?? "",
    sourceAttackName:
      effect?.sourceAttackName ?? "",
    rawDamage: raw,
    reduction,
    afterReduction,
    cappedDamage,
    amount: 0,
    healthDamage: 0,
    tempDamage: 0,
    before,
    after: before,
    capBefore: capState,
    capAfter: capState,
    damageResult: null
  };

  if (
    !actor ||
    !DAMAGE_EFFECT_TAGS.has(normalizedTag) ||
    cappedDamage <= 0
  ) {
    return baseReport;
  }

  const source = sourceActor ??
    await resolveEffectSourceActor(effect);

  const damageResult = await applyDamage(
    actor,
    cappedDamage,
    {
      unalterable: true,
      attacker: source,
      damageType: normalizedTag,
      damageLabel: effectLabel(
        effect,
        normalizedTag
      ),
      /* Combat Monster already treats hostile Effect damage as hostile damage. */
      damageSourceKind: "attack",
      suppressFatesProtection: true,
      createChat
    }
  );

  if (!damageResult) {
    return {
      ...baseReport,
      cancelled: true
    };
  }

  const result =
    damageResult?.result ?? {};

  const damageSpentOnTemp = Math.max(
    0,
    number(
      result?.damageSpentOnTemp,
      result?.tempDamage
    )
  );

  const healthDamage = Math.max(
    0,
    number(result?.healthDamage, 0)
  );

  /*
   * Count damage that actually made it through the canonical damage pipeline.
   * This means prevention/reduction does not consume phantom points from the
   * SV×2 Effect Damage cap, while Temporary Wounds still count as damage dealt.
   */
  const appliedDamage = Math.min(
    cappedDamage,
    Math.max(
      0,
      damageSpentOnTemp + healthDamage
    )
  );

  const nextUsed = Math.min(
    capState.cap,
    capState.used + appliedDamage
  );

  await actor.update({
    "system.combat.effectDamageRoundKey":
      capState.key,
    "system.combat.effectDamageTakenThisRound":
      nextUsed
  });

  const after =
    getEffectDamageWoundSnapshot(actor);

  return {
    ...baseReport,
    amount: appliedDamage,
    healthDamage,
    tempDamage: Math.max(
      0,
      number(result?.tempDamage, 0)
    ),
    before,
    after,
    capAfter: {
      ...capState,
      used: nextUsed,
      remaining: Math.max(
        0,
        capState.cap - nextUsed
      )
    },
    damageResult,
    cancelled: false
  };
}

export async function applyBurnMovementEffectDamage(
  actor,
  spaces,
  {
    unwilling = false
  } = {}
) {
  const burnEffect =
    (actor?.system?.effects?.active ?? [])
      .find((effect) => {
        return (
          normalizeEffectDamageTag(
            effect?.tag
          ) === "burn" &&
          effectIsActive(effect)
        );
      });

  if (!burnEffect) return null;

  const traversedSpaces = Math.max(
    0,
    number(spaces, 0)
  );

  const rawDamage = unwilling
    ? Math.floor(traversedSpaces / 2)
    : Math.floor(traversedSpaces);

  return applyDDAEffectDamage(
    actor,
    burnEffect,
    rawDamage,
    {
      tag: "burn",
      reason: unwilling
        ? "forcedMovement"
        : "movement"
    }
  );
}

function trackedNonMovementActions(actor) {
  const explicit = Math.max(
    0,
    Math.floor(
      number(
        actor?.system?.combat
          ?.nonMovementActionsThisTurn,
        0
      )
    )
  );

  /*
   * Compatibility/safety inference. A few older mechanics still spend Actions
   * by updating the Actor directly instead of calling action-economy.js. Taking
   * the larger value prevents FREEZE from under-counting those actions while
   * the explicit counter correctly handles extra/reserved Actions.
   */
  const actions =
    actor?.system?.combat?.actions ?? {};

  const baseMaximum = Math.max(
    0,
    number(actions.max, 2)
  );

  const hasteBonus =
    (actor?.system?.effects?.active ?? [])
      .some((effect) => {
        return (
          normalizeEffectDamageTag(
            effect?.tag
          ) === "haste" &&
          number(effect?.actionGranted, 1) > 0
        );
      })
      ? 1
      : 0;

  const current = Math.max(
    0,
    number(actions.value, 0)
  );

  const movementActions = Math.max(
    0,
    number(
      actor?.system?.combat
        ?.movementActionsThisTurn,
      0
    )
  );

  const inferred = Math.max(
    0,
    Math.floor(
      baseMaximum +
      hasteBonus -
      current -
      movementActions
    )
  );

  return Math.max(
    explicit,
    inferred
  );
}

async function getRuinRawDamage(effect) {
  const stored = Math.max(
    0,
    number(
      effect?.potency ??
      effect?.value,
      0
    )
  );

  if (stored > 0) return stored;

  const source =
    await resolveEffectSourceActor(effect);

  return Math.max(
    1,
    number(
      getActorDerivedStat(
        source,
        "bit"
      ),
      1
    )
  );
}

async function getEndTurnRawDamage(actor, effect) {
  const tag =
    normalizeEffectDamageTag(
      effect?.tag
    );

  if (tag === "freeze") {
    return trackedNonMovementActions(actor) * 2;
  }

  if (tag === "poison") {
    return Math.max(
      0,
      number(
        effect?.potency ??
        effect?.value,
        getActorDerivedStat(
          actor,
          "cpu"
        )
      )
    );
  }

  if (tag === "ruin") {
    return getRuinRawDamage(effect);
  }

  return 0;
}

/**
 * Resolve only the Damage Effects whose trigger is End Turn.
 * BURN is deliberately excluded because its trigger is movement.
 * REGEN is deliberately excluded because it resolves at Start Turn.
 */
export async function applyEndTurnEffectDamage(actor) {
  const before =
    getEffectDamageWoundSnapshot(actor);

  const effects = [
    ...(actor?.system?.effects?.active ?? [])
  ].filter((effect) => {
    const tag =
      normalizeEffectDamageTag(
        effect?.tag
      );

    return (
      ["freeze", "poison", "ruin"]
        .includes(tag) &&
      effectIsActive(effect)
    );
  });

  const entries = [];

  for (const effect of effects) {
    const rawDamage =
      await getEndTurnRawDamage(
        actor,
        effect
      );

    if (rawDamage <= 0) continue;

    const report =
      await applyDDAEffectDamage(
        actor,
        effect,
        rawDamage,
        {
          reason: "endTurn"
        }
      );

    if (
      report?.amount > 0 ||
      report?.cancelled
    ) {
      entries.push(report);
    }
  }

  const after =
    getEffectDamageWoundSnapshot(actor);

  const usedDamageResult = entries
    .map((entry) => entry?.damageResult)
    .filter(Boolean);

  const gritSurvival = usedDamageResult
    .map((result) => result?.gritSurvival)
    .find((state) => state?.used) ?? null;

  const undefeatedEndurance = usedDamageResult
    .map((result) => result?.undefeatedEndurance)
    .find((state) => state?.used) ?? null;

  const regenSurvival = usedDamageResult
    .map((result) => result?.regenSurvival)
    .find((state) => state?.used) ?? null;

  return {
    changed:
      before.wounds !== after.wounds ||
      before.temp !== after.temp ||
      entries.some((entry) => entry.amount > 0),
    oldWounds: before.wounds,
    newWounds: after.wounds,
    oldTemp: before.temp,
    newTemp: after.temp,
    woundDelta:
      after.wounds - before.wounds,
    tempDelta:
      after.temp - before.temp,
    healthDamage: Math.max(
      0,
      before.wounds - after.wounds
    ),
    tempDamage: Math.max(
      0,
      before.temp - after.temp
    ),
    entries,
    gritSurvival,
    undefeatedEndurance,
    regenSurvival
  };
}
