import {
  EFFECT_TAGS,
  findQuality,
  getActorDerivedStat,
  getActorSv,
  getCombatId,
  getCombatRound,
  getCombatTurn,
  getQualityRank,
  localizeQ,
  normalizeKey,
  qualityMatches,
  rollDerivedCheck
} from "../rules/quality-automation.js";

const SYSTEM_ID = "digimon-digital-adventures";
const EFFECT_RESIST_TAGS = new Set(["fear", "doom", "taunt"]);
const AREA_SIGNATURE_ONLY_TAGS = new Set([
  "haste", "shield", "paralyze", "weak", "regen", "strength", "stun"
]);
const POSITIVE_EFFECT_TAGS = new Set(
  Object.entries(EFFECT_TAGS)
    .filter(([, data]) => String(data?.type ?? "").toLowerCase() === "positive")
    .map(([key]) => key)
);
const DAMAGE_EFFECT_TAGS = new Set(
  Object.entries(EFFECT_TAGS)
    .filter(([, data]) => String(data?.type ?? "").toLowerCase() === "damage")
    .map(([key]) => key)
);
const EFFECT_TAG_SET = new Set(Object.keys(EFFECT_TAGS));

function text(pt, en) {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? en : pt;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeEffectTag(value = "") {
  return String(value ?? "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
}

function getAttackIdentityKeys(attackItem) {
  return new Set([
    attackItem?.id,
    attackItem?.uuid,
    attackItem?.system?.wizard?.attackKey,
    attackItem?.flags?.[SYSTEM_ID]?.wizardAttackKey,
    attackItem?.flags?.[SYSTEM_ID]?.enemyBuilderAttackKey
  ].filter(Boolean).map(String));
}

function getChoiceAttackId(choice = {}) {
  const key = String(choice?.key ?? "").trim();
  const separator = key.indexOf(":");
  return String(
    choice?.attackId ??
    choice?.attackItemId ??
    choice?.itemId ??
    choice?.attackKey ??
    (separator > 0 ? key.slice(0, separator) : "")
  ).trim();
}

function normalizeAttackNameKey(value = "") {
  return String(value ?? "")
    .split(/\s+[—–-]\s+\[/u)[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function choiceMatchesAttack(choice = {}, attackItem = null) {
  if (!attackItem) return false;

  const attackKeys = getAttackIdentityKeys(attackItem);
  const attackId = getChoiceAttackId(choice);

  if (attackId && attackKeys.has(String(attackId))) {
    return true;
  }

  const attackNameKey = normalizeAttackNameKey(attackItem?.name ?? "");
  const choiceNameKey = normalizeAttackNameKey(
    choice?.attackName ??
    choice?.originalLabel ??
    choice?.label ??
    ""
  );

  if (!attackNameKey || !choiceNameKey || attackNameKey !== choiceNameKey) {
    return false;
  }

  const siblings = Array.from(attackItem?.parent?.items ?? []).filter((item) => {
    return item?.type === "attack" &&
      normalizeAttackNameKey(item?.name ?? "") === attackNameKey;
  });

  return siblings.length <= 1;
}

function qualityIsBoundToAttack(quality, attackItem, expectedTag = "") {
  if (!quality || !attackItem) return false;
  const tag = normalizeEffectTag(expectedTag);
  const choices = [
    ...(Array.isArray(quality.system?.choices?.selectedRanks)
      ? quality.system.choices.selectedRanks
      : []),
    ...(Array.isArray(quality.system?.choices?.selected)
      ? quality.system.choices.selected
      : [])
  ];

  return choices.some((rawChoice) => {
    const choice = rawChoice && typeof rawChoice === "object"
      ? rawChoice
      : { key: rawChoice };

    if (!choiceMatchesAttack(choice, attackItem)) return false;
    if (!tag) return true;

    const choiceTag = normalizeEffectTag(
      choice.effectTag ?? choice.attackTag ?? String(choice.key ?? "").split(":").at(-1)
    );

    return !choiceTag || choiceTag === tag;
  });
}

export function findEffectQualityForAttack(actor, attackItem, aliasKey, expectedTag = "") {
  return actor?.items?.find?.((item) => {
    return item.type === "quality" &&
      qualityMatches(item, aliasKey) &&
      qualityIsBoundToAttack(item, attackItem, expectedTag);
  }) ?? null;
}

export function findProtectingShieldQualityForAttack(actor, attackItem) {
  return findEffectQualityForAttack(actor, attackItem, "protectingShield", "shield");
}

export function findInspiringGuidanceQualityForAttack(actor, attackItem) {
  return findEffectQualityForAttack(actor, attackItem, "inspiringGuidance", "guiding");
}

function attackQualityTags(attackItem) {
  const tags = new Set();
  for (const entry of attackItem?.system?.qualityTags ?? []) {
    const tag = normalizeEffectTag(entry?.tag ?? entry?.key ?? entry?.value ?? entry);
    if (tag) tags.add(tag);
  }
  if (attackItem?.system?.effectTag?.enabled) {
    const tag = normalizeEffectTag(attackItem.system.effectTag.tag);
    if (tag) tags.add(tag);
  }
  return tags;
}

export function validateEffectAttackDeclaration({
  attacker,
  defender,
  attackItem,
  effectTags = [],
  areaActive = false,
  currentBattery = 0,
  targetIsAlly = false,
  functionTypeOverride = "",
  executionId = ""
} = {}) {
  if (!attackItem) return { ok: true };

  const functionType = String(functionTypeOverride || attackItem.system?.baseTags?.functionType || "").toLowerCase();
  const rangeType = String(attackItem.system?.baseTags?.rangeType ?? "").toLowerCase();
  const isSignature = Boolean(attackItem.system?.isSignature);
  const normalizedEffects = [...new Set(effectTags.map(normalizeEffectTag).filter((tag) => EFFECT_TAG_SET.has(tag)))];
  const qualityTags = attackQualityTags(attackItem);

  if (qualityTags.size > 3) {
    return {
      ok: false,
      message: text(
        `${attackItem.name} possui ${qualityTags.size} Tags de Qualidade. Um Ataque pode ter no máximo 3.`,
        `${attackItem.name} has ${qualityTags.size} Quality Tags. An Attack can have at most 3.`
      )
    };
  }

  if (normalizedEffects.length > 1) {
    return {
      ok: false,
      message: text(
        `${attackItem.name} possui mais de uma Tag de Efeito. Um Ataque só pode receber uma.`,
        `${attackItem.name} has more than one Effect Tag. An Attack can only have one.`
      )
    };
  }

  if (functionType === "support" && normalizedEffects.length === 0) {
    return {
      ok: false,
      message: text(
        "Ataques [SUPPORT] precisam possuir uma Tag de Efeito.",
        "[SUPPORT] Attacks must have an Effect Tag."
      )
    };
  }

  const effectKey = normalizedEffects[0] ?? "";
  const definition = EFFECT_TAGS[effectKey] ?? {};
  const effectType = String(definition.type ?? "").toLowerCase();

  if (effectType === "positive" && functionType !== "support") {
    return {
      ok: false,
      message: text(
        `[${effectKey.toUpperCase()}] é um Efeito Positivo e só pode ser usado em um Ataque [SUPPORT].`,
        `[${effectKey.toUpperCase()}] is a Positive Effect and can only be used on a [SUPPORT] Attack.`
      )
    };
  }

  if (effectType === "positive" && defender && !targetIsAlly) {
    return {
      ok: false,
      message: text(
        "Efeitos Positivos de Ataque só podem ser aplicados a aliados.",
        "Positive Attack Effects can only be applied to allies."
      )
    };
  }

  if (attacker?.uuid && defender?.uuid && attacker.uuid === defender.uuid) {
    return {
      ok: false,
      message: text(
        "O conjurador não pode aplicar uma Tag de Efeito de Ataque em si mesmo. Use Overclock para Efeitos Positivos próprios.",
        "The Caster cannot apply an Attack Effect Tag to itself. Use Overclock for self-applied Positive Effects."
      )
    };
  }

  if (definition.alliesOnly && defender && !targetIsAlly) {
    return {
      ok: false,
      message: text(
        `[${effectKey.toUpperCase()}] afeta apenas aliados.`,
        `[${effectKey.toUpperCase()}] only affects allies.`
      )
    };
  }

  if (definition.requiresDamage && functionType !== "damage") {
    return {
      ok: false,
      message: text(
        `[${effectKey.toUpperCase()}] exige um Ataque [DAMAGE].`,
        `[${effectKey.toUpperCase()}] requires a [DAMAGE] Attack.`
      )
    };
  }

  if (effectKey === "shield") {
    const quality = findProtectingShieldQualityForAttack(attacker, attackItem);
    if (!quality) {
      return {
        ok: false,
        message: text(
          "A Tag [SHIELD] não está vinculada a uma compra válida de Escudo Protetor.",
          "The [SHIELD] Tag is not bound to a valid Protecting Shield purchase."
        )
      };
    }

    if (attacker?.uuid === defender?.uuid) {
      return {
        ok: false,
        message: text(
          "O usuário de Escudo Protetor não pode se beneficiar do próprio [SHIELD].",
          "The Protecting Shield user cannot benefit from their own [SHIELD]."
        )
      };
    }

    const usage = getProtectingShieldUsage(attacker, quality);
    const sameAreaExecution = Boolean(
      executionId &&
      String(usage.state.lastExecutionId ?? "") === String(executionId)
    );
    if (usage.remaining <= 0 && !sameAreaExecution) {
      return {
        ok: false,
        message: text(
          `${quality.name} não possui usos restantes neste Combate.`,
          `${quality.name} has no uses remaining in this Combat.`
        )
      };
    }
  }

  if (areaActive && AREA_SIGNATURE_ONLY_TAGS.has(effectKey)) {
    if (!isSignature || functionType !== "support" || number(currentBattery) < 2) {
      return {
        ok: false,
        message: text(
          `[${effectKey.toUpperCase()}] só pode ser combinado com Área em um Movimento Assinatura [SUPPORT] com pelo menos 2 Bateria.`,
          `[${effectKey.toUpperCase()}] can only be combined with an Area Tag on a [SUPPORT] Signature Move with at least 2 Battery.`
        )
      };
    }
  }

  return {
    ok: true,
    effectKey,
    effectType,
    functionType,
    rangeType,
    isSignature
  };
}

export function getProtectingShieldUsage(actor, quality) {
  const rank = Math.max(1, getQualityRank(quality));
  const state = actor?.system?.combat?.qualityAttackUses?.protectingShield?.[quality?.id] ?? {};
  const sameCombat = String(state.combatId ?? "") === String(getCombatId());
  const used = sameCombat ? Math.max(0, number(state.usedCount)) : 0;
  return {
    rank,
    used,
    remaining: Math.max(0, rank - used),
    state: sameCombat ? state : {}
  };
}

export async function consumeProtectingShieldUse({
  attacker,
  attackItem,
  executionId = ""
} = {}) {
  const quality = findProtectingShieldQualityForAttack(attacker, attackItem);
  if (!quality || !attacker) return null;
  const usage = getProtectingShieldUsage(attacker, quality);
  const key = String(executionId || `${getCombatRound()}:${getCombatTurn()}:${attackItem.id}`);
  if (String(usage.state.lastExecutionId ?? "") === key) return usage;
  if (usage.remaining <= 0) return null;

  const state = foundry.utils.deepClone(attacker.system?.combat?.qualityAttackUses ?? {});
  state.protectingShield ??= {};
  state.protectingShield[quality.id] = {
    combatId: getCombatId(),
    usedCount: usage.used + 1,
    lastExecutionId: key,
    lastRound: getCombatRound(),
    lastTurn: getCombatTurn(),
    attackItemId: attackItem.id
  };
  await attacker.update({ "system.combat.qualityAttackUses": state });

  const remaining = Math.max(0, usage.remaining - 1);
  await quality.update({
    "system.uses.enabled": true,
    "system.uses.value": remaining,
    "system.uses.max": usage.rank,
    "system.uses.recharge": "combat"
  });

  return getProtectingShieldUsage(attacker, quality);
}

function getActiveEffect(actor, predicate) {
  return (actor?.system?.effects?.active ?? []).find((effect) => {
    return number(effect.remaining ?? effect.duration, 1) > 0 && predicate(effect);
  }) ?? null;
}

export function getIncomingEffectDurationPenalty(defender, effectType = "") {
  const type = String(effectType ?? "").toLowerCase();
  if (!new Set(["negative", "damage"]).has(type)) return 0;
  return getActiveEffect(defender, (effect) => normalizeEffectTag(effect.tag) === "immune") ? 1 : 0;
}

export function consumeDenyForIncomingEffects(defender, effects = []) {
  const incoming = [...effects];
  const active = foundry.utils.deepClone(defender?.system?.effects?.active ?? []);
  const denyIndex = active.findIndex((effect) => normalizeEffectTag(effect.tag) === "deny");
  if (denyIndex < 0) return { effects: incoming, activeEffects: active, denied: null };

  const incomingIndex = incoming.findIndex((effect) => {
    return normalizeEffectTag(effect.tag) !== "cleanse";
  });
  if (incomingIndex < 0) return { effects: incoming, activeEffects: active, denied: null };

  const [denied] = incoming.splice(incomingIndex, 1);
  const [denyEffect] = active.splice(denyIndex, 1);
  return { effects: incoming, activeEffects: active, denied, denyEffect };
}

async function resolveActorFromUuid(uuid = "") {
  if (!uuid) return null;
  try {
    return await fromUuid(uuid);
  } catch (_error) {
    return null;
  }
}

function getEffectResistanceUseState(actor, effectId) {
  const state = actor?.system?.combat?.effectResistanceUses?.[effectId] ?? {};
  const tick = `${getCombatId()}:${getCombatRound()}:${getCombatTurn()}`;
  return { state, tick, used: String(state.tick ?? "") === tick };
}

async function setEffectResistanceUse(actor, effectId, mode) {
  const root = foundry.utils.deepClone(actor.system?.combat?.effectResistanceUses ?? {});
  root[effectId] = {
    tick: `${getCombatId()}:${getCombatRound()}:${getCombatTurn()}`,
    mode,
    usedAt: new Date().toISOString()
  };
  await actor.update({ "system.combat.effectResistanceUses": root });
}

function effectResistanceCheckData(effect, source) {
  const tag = normalizeEffectTag(effect?.tag);
  if (tag === "fear") {
    return {
      stat: "dos",
      skillKey: "bravery",
      tn: 12 + getActorDerivedStat(source, "dos"),
      successReduction: 1,
      criticalReduction: Number.POSITIVE_INFINITY
    };
  }
  if (tag === "taunt") {
    return {
      stat: "dos",
      skillKey: "fortitude",
      tn: 12 + getActorDerivedStat(source, "cpu"),
      successReduction: 1,
      criticalReduction: Number.POSITIVE_INFINITY
    };
  }
  if (tag === "doom") {
    return {
      stat: "cpu",
      skillKey: "endurance",
      tn: 12 + getActorDerivedStat(source, "dos"),
      successReduction: 1,
      criticalReduction: 3
    };
  }
  return null;
}

export async function useEffectResistanceAction(actor, effectId, {
  mode = "action",
  prompt = true
} = {}) {
  if (!actor || !effectId) return { handled: false };
  const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
  const index = effects.findIndex((effect) => String(effect.id ?? "") === String(effectId));
  if (index < 0) return { handled: false };
  const effect = effects[index];
  const tag = normalizeEffectTag(effect.tag);
  if (!EFFECT_RESIST_TAGS.has(tag)) return { handled: false };

  if (
    effect.disableEffectResistance ||
    effect.cannotUseResistanceCheck
  ) {
    if (mode === "action") {
      ui.notifications.warn(text(
        "Este Efeito não permite um Teste de resistência.",
        "This Effect does not allow a resistance Check."
      ));
    }

    return {
      handled: true,
      used: false,
      blocked: true
    };
  }

  const use = getEffectResistanceUseState(actor, effectId);
  if (use.used) {
    ui.notifications.warn(text(
      "Este Efeito já recebeu seu Teste de resistência neste turno.",
      "This Effect already received its resistance Check this turn."
    ));
    return { handled: true, used: false };
  }

  const actionCost = mode === "action" ? 1 : 0;
  const actions = Math.max(0, number(actor.system?.combat?.actions?.value));
  if (actions < actionCost) {
    ui.notifications.warn(text("Ações insuficientes.", "Not enough Actions."));
    return { handled: true, used: false };
  }

  if (prompt) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      classes: ["dda", "dda-effect-quality-dialog"],
      window: { title: effect.label ?? `[${tag.toUpperCase()}]` },
      content: `<div class="dda-roll-dialog dda-effect-resist-dialog">
        <p>${text(
          `Realizar o Teste para resistir a <strong>${escapeHtml(effect.label ?? tag)}</strong>${actionCost ? " gastando 1 Ação" : " no fim do turno"}?`,
          `Attempt the Check to resist <strong>${escapeHtml(effect.label ?? tag)}</strong>${actionCost ? " by spending 1 Action" : " at the end of the turn"}?`
        )}</p>
      </div>`,
      yes: { label: text("Resistir", "Resist") },
      no: { label: text("Não", "No") },
      rejectClose: false,
      modal: true
    });
    if (!confirmed) return { handled: true, used: false };
  }

  const source = await resolveActorFromUuid(effect.sourceActorUuid);
  const checkData = effectResistanceCheckData(effect, source);
  if (!checkData) return { handled: true, used: false };

  const result = await rollDerivedCheck(actor, checkData.stat, {
    skillKey: checkData.skillKey,
    tn: checkData.tn,
    title: effect.label ?? `[${tag.toUpperCase()}]`
  });
  if (!result) return { handled: true, used: false };

  if (actionCost) {
    await actor.update({
      "system.combat.actions.value": actions - actionCost,
      "system.combat.nonMovementActionsThisTurn":
        Math.max(
          0,
          number(actor.system?.combat?.nonMovementActionsThisTurn, 0)
        ) + actionCost
    });
  }
  await setEffectResistanceUse(actor, effectId, mode);

  let reduction = 0;
  if (result.criticalSuccess) reduction = checkData.criticalReduction;
  else if (result.success) reduction = checkData.successReduction;

  if (tag === "doom") {
    const current = Math.max(0, number(effect.value ?? effect.potency));
    const next = Number.isFinite(reduction) ? Math.max(0, current - reduction) : 0;
    if (next <= 0) effects.splice(index, 1);
    else effects[index] = { ...effect, value: next, potency: next };
  } else {
    const current = Math.max(0, number(effect.remaining ?? effect.duration, 1));
    const next = Number.isFinite(reduction) ? Math.max(0, current - reduction) : 0;
    if (next <= 0) effects.splice(index, 1);
    else effects[index] = { ...effect, remaining: next };
  }

  await actor.update({ "system.effects.active": effects });
  actor.sheet?.render(false);

  return {
    handled: true,
    used: true,
    tag,
    result,
    reduction
  };
}

export async function resolveEndTurnEffectResistance(actor) {
  if (!actor) return [];
  const snapshot = [...(actor.system?.effects?.active ?? [])];
  const reports = [];
  for (const effect of snapshot) {
    if (!EFFECT_RESIST_TAGS.has(normalizeEffectTag(effect.tag))) continue;
    if (effect.disableEffectResistance || effect.cannotUseResistanceCheck) continue;
    const use = getEffectResistanceUseState(actor, effect.id);
    if (use.used) continue;
    const result = await useEffectResistanceAction(actor, effect.id, {
      mode: "endTurn",
      prompt: true
    });
    if (result?.used) reports.push(result);
  }
  return reports;
}

function guidingStateIsValid(actor, state) {
  if (!state?.active || number(state.current) <= 0) return false;
  return (actor?.system?.effects?.active ?? []).some((effect) => {
    const sameSource = !state.sourceActorUuid || String(effect.sourceActorUuid ?? "") === String(state.sourceActorUuid);
    const sameAttack = !state.sourceAttackId || String(effect.sourceAttackId ?? "") === String(state.sourceAttackId);
    const sameTag = !state.effectTag || normalizeEffectTag(effect.tag) === normalizeEffectTag(state.effectTag);
    return sameSource && sameAttack && sameTag && number(effect.remaining ?? effect.duration, 1) > 0;
  });
}

export function getGuidingDiceState(actor) {
  const state = foundry.utils.deepClone(actor?.system?.combat?.guidingDice ?? {});
  if (!guidingStateIsValid(actor, state)) return null;
  return {
    ...state,
    current: Math.max(0, number(state.current)),
    max: Math.max(0, number(state.max, state.current))
  };
}

export async function reconcileGuidingDiceState(actor) {
  if (!actor || actor.__ddaReconcilingGuidance) return false;
  const rawState = actor.system?.combat?.guidingDice ?? {};
  if (!rawState?.active || guidingStateIsValid(actor, rawState)) return false;

  actor.__ddaReconcilingGuidance = true;
  try {
    await actor.update({ "system.combat.guidingDice": {} });
    return true;
  } finally {
    actor.__ddaReconcilingGuidance = false;
  }
}

export function prepareGuidingDicePoolOptions(actor, options = {}) {
  const state = getGuidingDiceState(actor);
  if (!state) return { ...options, guidingDiceState: null };
  return { ...options, guidingDiceState: state };
}

export async function consumeGuidingDice(actor, amount) {
  const state = getGuidingDiceState(actor);
  const spent = Math.min(Math.max(0, Math.floor(number(amount))), state?.current ?? 0);
  if (!state || spent <= 0) return state;
  const next = Math.max(0, state.current - spent);
  await actor.update({
    "system.combat.guidingDice": {
      ...state,
      current: next,
      active: next > 0,
      lastSpent: spent,
      lastSpentRound: getCombatRound(),
      lastSpentTurn: getCombatTurn()
    }
  });
  return { ...state, current: next, active: next > 0 };
}

async function clearGuidanceFromSource(sourceActorUuid, exceptActorUuid = "") {
  const actors = [
    ...(game.actors?.contents ?? []),
    ...((canvas?.scene?.tokens ?? []).map((token) => token.actor).filter(Boolean))
  ];
  const unique = [...new Map(actors.map((actor) => [actor.uuid ?? actor.id, actor])).values()];
  for (const actor of unique) {
    if (String(actor.uuid ?? "") === String(exceptActorUuid ?? "")) continue;
    const state = actor.system?.combat?.guidingDice ?? {};
    if (String(state.sourceActorUuid ?? "") !== String(sourceActorUuid ?? "")) continue;
    if (!actor.isOwner && !game.user?.isGM) continue;
    await actor.update({ "system.combat.guidingDice": {} });
  }
}

async function adjustEffectDuration(target, result, delta) {
  const effectTag = normalizeEffectTag(result?.effectApplication?.applied?.[0]?.tag);
  const sourceAttackId = String(result?.attackItem?.id ?? "");
  const sourceActorUuid = String(result?.attacker?.uuid ?? "");
  if (!effectTag || !target) return null;
  const effects = foundry.utils.deepClone(target.system?.effects?.active ?? []);
  const index = effects.findIndex((effect) => {
    return normalizeEffectTag(effect.tag) === effectTag &&
      String(effect.sourceAttackId ?? "") === sourceAttackId &&
      String(effect.sourceActorUuid ?? "") === sourceActorUuid;
  });
  if (index < 0) return null;
  const current = Math.max(1, number(effects[index].remaining ?? effects[index].duration, 1));
  effects[index] = { ...effects[index], remaining: Math.max(1, current + delta) };
  await target.update({ "system.effects.active": effects });
  return effects[index];
}

async function chooseGuidanceResult(results, isArea) {
  if (!results.length) return null;
  if (!isArea || results.length === 1) return results[0];
  const options = results.map((result, index) => {
    return `<option value="${index}">${escapeHtml(result.defender?.name ?? `Target ${index + 1}`)}</option>`;
  }).join("");
  return foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-effect-quality-dialog"],
    window: { title: text("Orientação Inspiradora", "Inspiring Guidance") },
    content: `<div class="dda-roll-dialog dda-guiding-dialog">
      <p>${text("Escolha o único alvo que receberá os Dados de Orientação.", "Choose the single target that receives Guiding Dice.")}</p>
      <div class="form-group"><label>${text("Alvo", "Target")}</label><select name="targetIndex">${options}</select></div>
    </div>`,
    ok: {
      label: text("Confirmar", "Confirm"),
      callback: (_event, button) => results[Math.max(0, number(button.form.elements.targetIndex.value))] ?? null
    },
    rejectClose: false,
    modal: true
  });
}

export async function resolveInspiringGuidanceAfterAttack({
  attacker,
  attackItem,
  results = [],
  currentBattery = 0,
  isArea = false
} = {}) {
  const quality = findInspiringGuidanceQualityForAttack(attacker, attackItem);
  if (!quality) return null;

  const eligible = results.filter((result) => {
    const actuallyApplied = new Set(
      (result?.appliedEffectResolution?.applied ?? []).map(normalizeEffectTag)
    );
    const applied = (result?.effectApplication?.applied ?? []).filter((effect) => {
      return !actuallyApplied.size || actuallyApplied.has(normalizeEffectTag(effect.tag));
    });
    return Boolean(
      result?.hit &&
      result?.defender &&
      applied.some((effect) => String(effect.effectType ?? EFFECT_TAGS[normalizeEffectTag(effect.tag)]?.type ?? "").toLowerCase() === "positive")
    );
  });
  if (!eligible.length) return null;

  const selected = await chooseGuidanceResult(eligible, isArea);
  if (!selected?.defender) return null;

  const tn = 15 - getActorDerivedStat(attacker, "dos");
  const check = await rollDerivedCheck(attacker, "bit", {
    skillKey: "persuasion",
    tn,
    title: quality.name
  });
  if (!check) return null;

  const rank = Math.max(1, getQualityRank(quality));
  const signatureDice = attackItem.system?.isSignature
    ? Math.max(0, number(currentBattery))
    : 0;
  let guidingDice = signatureDice;
  if (check.criticalSuccess) guidingDice += rank + 1;
  else if (check.success) guidingDice += rank;

  if (check.criticalFailure) {
    await adjustEffectDuration(selected.defender, selected, -1);
  }

  if (guidingDice > 0) {
    const actuallyApplied = new Set(
      (selected?.appliedEffectResolution?.applied ?? []).map(normalizeEffectTag)
    );
    const appliedEffect = selected.effectApplication.applied.find((effect) => {
      const isApplied = !actuallyApplied.size || actuallyApplied.has(normalizeEffectTag(effect.tag));
      return isApplied && String(effect.effectType ?? EFFECT_TAGS[normalizeEffectTag(effect.tag)]?.type ?? "").toLowerCase() === "positive";
    });
    await clearGuidanceFromSource(attacker.uuid, selected.defender.uuid);
    await selected.defender.update({
      "system.combat.guidingDice": {
        active: true,
        current: guidingDice,
        max: guidingDice,
        sourceActorUuid: attacker.uuid,
        sourceActorName: attacker.name,
        sourceQualityId: quality.id,
        sourceQualityName: quality.name,
        sourceAttackId: attackItem.id,
        sourceAttackName: attackItem.name,
        effectTag: normalizeEffectTag(appliedEffect?.tag),
        grantedCombatId: getCombatId(),
        grantedRound: getCombatRound(),
        grantedTurn: getCombatTurn()
      }
    });
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: `<div class="dda-chat-card dda-effect-card effect-positive dda-guiding-card">
      <h2>${escapeHtml(quality.name)}</h2>
      <ul class="dda-effect-list">
        <li>${text("Alvo", "Target")}: <strong>${escapeHtml(selected.defender.name)}</strong>.</li>
        <li>${text("NA", "TN")}: <strong>${tn}</strong>.</li>
        <li>${text("Dados de Orientação", "Guiding Dice")}: <strong>${guidingDice}</strong>.</li>
        ${check.criticalFailure ? `<li>${text("Falha Crítica: a Duração do Efeito Positivo foi reduzida em 1, até o mínimo de 1.", "Critical Failure: the Positive Effect Duration was reduced by 1, to a minimum of 1.")}</li>` : ""}
      </ul>
    </div>`
  });

  return { quality, selected, check, guidingDice };
}

export async function processPendingStunEndTurn(actor) {
  if (!actor) return { changed: false, activated: [] };

  const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
  const currentTick = `${getCombatId()}:${getCombatRound()}:${getCombatTurn()}`;
  const activated = [];
  let changed = false;

  for (let index = 0; index < effects.length; index += 1) {
    const effect = effects[index];
    if (normalizeEffectTag(effect.tag) !== "stun" || !effect.activatesAtEndOfNextTurn) continue;

    const appliedTick = `${effect.appliedCombatId ?? ""}:${Number(effect.appliedCombatRound ?? 0)}:${Number(effect.appliedCombatTurn ?? -1)}`;
    if (appliedTick === currentTick) continue;

    const actions = Math.max(0, number(actor.system?.combat?.actions?.value));
    const removed = actions > 0 ? 1 : 0;
    if (removed > 0) {
      await actor.update({ "system.combat.actions.value": actions - 1 });
    }

    effects[index] = {
      ...effect,
      activatesAtEndOfNextTurn: false,
      actionRemoved: removed,
      activatedCombatId: getCombatId(),
      activatedRound: getCombatRound(),
      activatedTurn: getCombatTurn()
    };
    activated.push(effects[index]);
    changed = true;
  }

  if (changed) {
    await actor.update({ "system.effects.active": effects });
    actor.sheet?.render(false);
  }

  return { changed, activated };
}

export async function reconcileDotAttacks(actor) {
  if (!actor || !["digimon", "npc"].includes(actor.type)) return false;
  if (actor.__ddaReconcilingDot) return false;
  actor.__ddaReconcilingDot = true;
  try {
    const hasDot = (actor.system?.effects?.active ?? []).some((effect) => {
      return normalizeEffectTag(effect.tag) === "dot" && number(effect.remaining ?? effect.duration, 1) > 0;
    });
    const dotItems = actor.items.filter((item) => item.type === "attack" && item.flags?.[SYSTEM_ID]?.dotSynthetic);

    if (hasDot && dotItems.length < 2) {
      const existingModes = new Set(dotItems.map((item) => item.flags?.[SYSTEM_ID]?.dotMode));
      const create = [];
      for (const mode of ["melee", "range"]) {
        if (existingModes.has(mode)) continue;
        create.push({
          name: mode === "melee"
            ? text("Ataque Pixelado — Corpo a Corpo", "Pixel Attack — Melee")
            : text("Ataque Pixelado — Distância", "Pixel Attack — Ranged"),
          type: "attack",
          img: "icons/svg/explosion.svg",
          system: {
            isSignature: false,
            baseTags: { rangeType: mode, functionType: "damage", tags: [] },
            qualityTags: [],
            actionCost: { value: 1, extra: 0 },
            accuracy: { baseFormula: "@actor.mainStats.accuracy.total", formulaAdvanced: false },
            damage: { enabled: true, baseFormula: "@actor.mainStats.damage.total", formulaAdvanced: false, bonus: 0, unalterable: 0 },
            effectTag: { enabled: false, tag: "" }
          },
          flags: { [SYSTEM_ID]: { dotSynthetic: true, dotMode: mode } }
        });
      }
      if (create.length) await actor.createEmbeddedDocuments("Item", create);
      return true;
    }

    if (!hasDot && dotItems.length) {
      await actor.deleteEmbeddedDocuments("Item", dotItems.map((item) => item.id));
      return true;
    }
    return false;
  } finally {
    actor.__ddaReconcilingDot = false;
  }
}

export function actorIsDotTransformed(actor) {
  return (actor?.system?.effects?.active ?? []).some((effect) => {
    return normalizeEffectTag(effect.tag) === "dot" && number(effect.remaining ?? effect.duration, 1) > 0;
  });
}

export function attackAllowedDuringDot(actor, attackItem) {
  if (!actorIsDotTransformed(actor)) return true;
  return Boolean(attackItem?.flags?.[SYSTEM_ID]?.dotSynthetic);
}

export async function clearEffectQualityCombatState(combat) {
  const actors = [...new Set((combat?.combatants ?? []).map((combatant) => combatant.actor).filter(Boolean))];
  for (const actor of actors) {
    if (!actor.isOwner && !game.user?.isGM) continue;
    const qualityAttackUses = foundry.utils.deepClone(actor.system?.combat?.qualityAttackUses ?? {});
    delete qualityAttackUses.protectingShield;

    await actor.update({
      "system.combat.guidingDice": {},
      "system.combat.effectResistanceUses": {},
      "system.combat.dotAfflictedCombatId": "",
      "system.combat.qualityAttackUses": qualityAttackUses
    });

    const shieldUpdates = actor.items
      .filter((item) => item.type === "quality" && qualityMatches(item, "protectingShield"))
      .map((item) => {
        const rank = Math.max(1, getQualityRank(item));
        return {
          _id: item.id,
          "system.uses.enabled": true,
          "system.uses.value": rank,
          "system.uses.max": rank,
          "system.uses.recharge": "combat"
        };
      });
    if (shieldUpdates.length) await actor.updateEmbeddedDocuments("Item", shieldUpdates);

    await reconcileDotAttacks(actor);
  }
}

export function registerEffectQualities() {
  if (globalThis.__ddaEffectQualitiesRegistered) return;
  globalThis.__ddaEffectQualitiesRegistered = true;

  Hooks.on("updateActor", (actor, changes) => {
    if (!foundry.utils.hasProperty(changes, "system.effects.active")) return;
    void reconcileDotAttacks(actor).catch((error) => {
      console.warn("DDA | DOT reconciliation failed.", error);
    });
    void reconcileGuidingDiceState(actor).catch((error) => {
      console.warn("DDA | Guiding Dice reconciliation failed.", error);
    });
  });

  const cleanupCombat = (combat) => {
    void clearEffectQualityCombatState(combat).catch((error) => {
      console.warn("DDA | Effect Quality combat cleanup failed.", error);
    });
  };

  Hooks.on("combatEnd", cleanupCombat);
  Hooks.on("deleteCombat", cleanupCombat);
}
