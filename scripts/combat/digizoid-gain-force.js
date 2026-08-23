import {
  EFFECT_TAGS,
  areActorsAllies,
  areActorsAlliesForQualities,
  clearUseState,
  findQuality,
  getActorDerivedStat,
  getActorSv,
  getCombatId,
  getCombatRound,
  getQualityRank,
  hasQuality,
  normalizeKey
} from "../rules/quality-automation.js";
import { getTokenGridDistance } from "./positioning.js";

const SYSTEM_ID = "digimon-digital-adventures";
const STATE_PATH = "system.combat.digizoidGainForce";
const SOCKET_ACTION = "digizoidGainForce";

const NEGATIVE_EFFECTS = new Set([
  "root", "slow", "vague", "fear", "doom", "taunt", "confuse", "distract",
  "dull", "frail", "heavy", "burn", "freeze", "poison", "exploit", "pacify",
  "paralyze", "rattled", "shaken", "weak", "ruin", "blind", "dot", "stun"
]);

const EFFECT_DP_COST = {
  root: 1, slow: 1, vague: 1, keen: 1, swift: 1, tailwind: 1,
  cleanse: 1, fear: 1, doom: 1, taunt: 1, pull: 1, push: 1,
  confuse: 2, distract: 2, dull: 2, frail: 2, heavy: 2, nimble: 2,
  sharpen: 2, sturdy: 2, burn: 2, freeze: 2, poison: 2, haste: 2,
  immune: 2, shield: 2,
  exploit: 3, pacify: 3, paralyze: 3, rattled: 3, shaken: 3, weak: 3,
  daring: 3, fury: 3, regen: 3, steady: 3, strength: 3, vigil: 3,
  vigor: 3, ruin: 3, blind: 3, deny: 3, dot: 3, stun: 3
};

function text(pt, en) {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("pt") ? pt : en;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeHtml(value = "") {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function effectKey(effect = {}) {
  return normalizeKey(String(effect?.tag ?? effect?.key ?? effect ?? "").replace(/^\[|\]$/g, ""));
}

function actorWounds(actor) {
  const path = actor?.type === "character"
    ? "system.derived.wounds"
    : "system.miscStats.wounds";
  const data = foundry.utils.getProperty(actor, path) ?? {};
  return {
    path,
    valuePath: `${path}.value`,
    value: Math.max(0, number(data.value)),
    max: Math.max(0, number(data.max))
  };
}

function actorState(actor) {
  return foundry.utils.deepClone(actor?.system?.combat?.digizoidGainForce ?? {});
}

function attackTags(attackItem, qualityTags = []) {
  const tags = new Set();
  for (const tag of attackItem?.system?.qualityTags ?? []) tags.add(normalizeKey(tag));
  for (const tag of attackItem?.system?.tags ?? []) tags.add(normalizeKey(tag));
  for (const tag of attackItem?.system?.baseTags?.tags ?? []) tags.add(normalizeKey(tag));
  for (const tag of qualityTags ?? []) tags.add(normalizeKey(tag));
  tags.add(normalizeKey(attackItem?.system?.baseTags?.rangeType ?? ""));
  tags.add(normalizeKey(attackItem?.system?.baseTags?.functionType ?? ""));
  tags.delete("");
  return tags;
}

function attackIdentityKeys(attackItem) {
  return new Set([
    attackItem?.id,
    attackItem?.system?.wizard?.attackKey,
    attackItem?.flags?.[SYSTEM_ID]?.wizardAttackKey,
    attackItem?.flags?.[SYSTEM_ID]?.enemyBuilderAttackKey
  ].map((entry) => String(entry ?? "").trim()).filter(Boolean));
}

function qualitySelectedAttack(quality, attackItem) {
  if (!quality || !attackItem) return false;
  const keys = attackIdentityKeys(attackItem);
  const choices = [
    ...(Array.isArray(quality.system?.choices?.selectedRanks) ? quality.system.choices.selectedRanks : []),
    ...(Array.isArray(quality.system?.choices?.selected) ? quality.system.choices.selected : [])
  ];
  return choices.some((choice) => {
    const direct = String(choice?.attackId ?? choice?.attackItemId ?? choice?.itemId ?? choice?.attackKey ?? "").trim();
    const key = String(choice?.key ?? choice?.value ?? "").trim();
    const keyAttack = key.includes(":") ? key.slice(0, key.indexOf(":")) : key;
    return keys.has(direct) || keys.has(keyAttack) || keys.has(key);
  });
}

function tokenForActor(actor) {
  return canvas?.tokens?.controlled?.find((token) => token.actor?.uuid === actor?.uuid)
    ?? canvas?.tokens?.placeables?.find((token) => token.actor?.uuid === actor?.uuid)
    ?? null;
}

function tokenDistance(left, right) {
  return getTokenGridDistance(left, right);
}

function primaryActiveGM() {
  return (game?.users?.contents ?? [])
    .filter((user) => user.active && user.isGM)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
}

function canUpdateActor(actor) {
  return Boolean(game?.user?.isGM || actor?.canUserModify?.(game.user, "update"));
}

async function requestDamageApplication(target, damage, { attacker, ...options } = {}) {
  if (canUpdateActor(target)) {
    const { applyDamage } = await import("../rolls/damage-application.js");
    return applyDamage(target, damage, { ...options, attacker });
  }
  const gm = primaryActiveGM();
  if (!gm) {
    ui.notifications.warn(text("Um GM ativo é necessário para aplicar este Dano.", "An active GM is required to apply this Damage."));
    return null;
  }
  game.socket.emit(`system.${SYSTEM_ID}`, {
    action: SOCKET_ACTION,
    operation: "damage",
    requesterId: game.user.id,
    targetUuid: target.uuid,
    attackerUuid: attacker?.uuid ?? "",
    damage,
    options
  });
  return { requestedFromGm: true };
}

function getAttackDamageBase(attacker, attackItem) {
  return Math.max(0, number(attacker.system?.mainStats?.damage?.total ?? attacker.system?.mainStats?.damage?.value))
    + number(attackItem.system?.damage?.bonus);
}

function consumeSignatureBatteryUpdates(attacker, attackItem) {
  return attackItem.system?.isSignature
    ? {
        "system.resources.battery.value": 0,
        "system.combat.signatureMoveUsedThisTurn": true
      }
    : {};
}

async function executeDigitalHazard(attacker, attackItem) {
  const quality = findQuality(attacker, "digitalHazard");
  const directTags = attackTags(attackItem);
  const prohibited = [...directTags].filter((tag) => !["melee", "range", "ranged", "damage", "support", "hazard"].includes(tag) && !EFFECT_TAGS[tag]);
  if (prohibited.length) {
    ui.notifications.warn(text(
      `[HAZARD] não aceita Tags adicionais além de Tags de Efeito: ${prohibited.map((tag) => `[${tag.toUpperCase()}]`).join(", ")}.`,
      `[HAZARD] cannot carry non-Effect Tags: ${prohibited.map((tag) => `[${tag.toUpperCase()}]`).join(", ")}.`
    ));
    return null;
  }

  const state = actorState(attacker);
  const sameCombat = String(state.hazard?.combatId ?? "") === String(getCombatId());
  const usesBefore = sameCombat ? Math.max(0, number(state.hazard?.uses)) : 0;
  const signature = Boolean(attackItem.system?.isSignature);
  const battery = signature ? Math.max(0, number(attacker.system?.resources?.battery?.value)) : 0;
  if (signature && battery <= 0) {
    ui.notifications.warn(text("Movimentos Assinatura exigem Bateria.", "Signature Moves require Battery."));
    return null;
  }
  if (attacker.system?.combat?.hasAttackedThisRound || number(attacker.system?.combat?.attacksMadeThisTurn) > 0) {
    ui.notifications.warn(text("Este Digimon já usou seu Ataque nesta ativação.", "This Digimon already used its Attack this turn."));
    return null;
  }
  const actionCost = Math.max(1, number(attackItem.system?.actionCost?.value, 1) + number(attackItem.system?.actionCost?.extra));
  const { spendActorActions } = await import("./action-economy.js");
  if (!(await spendActorActions(attacker, actionCost, { requireActiveUnit: true }))) return null;

  let selfCost = 0;
  if (usesBefore >= 1 && !signature) {
    selfCost = Math.max(0, getActorSv(attacker));
    const wounds = actorWounds(attacker);
    await attacker.update({ [wounds.valuePath]: Math.max(0, wounds.value - selfCost) });
  }

  const sourceToken = tokenForActor(attacker);
  const fullRange = Math.max(0, number(attacker.system?.miscStats?.range?.total ?? attacker.system?.miscStats?.range?.value ?? attacker.system?.miscStats?.range?.base));
  const radius = Math.max(0, Math.floor(fullRange / 2));
  const targets = (canvas?.tokens?.placeables ?? []).filter((token) => (
    token.actor && token.actor.uuid !== attacker.uuid && sourceToken && tokenDistance(sourceToken, token) <= radius
  ));
  const instinct = Math.max(1, getQualityRank(findQuality(attacker, "instinct")));
  const rawDamage = getAttackDamageBase(attacker, attackItem) + instinct + battery;
  const results = [];

  for (const target of targets) {
    const armor = Math.max(0, number(target.actor.system?.mainStats?.armor?.total ?? target.actor.system?.mainStats?.armor?.value));
    const damage = Math.max(1, rawDamage - armor);
    await requestDamageApplication(target.actor, damage, {
      attacker,
      damageSourceKind: "attack",
      damageLabel: quality?.name ?? "Digital Hazard"
    });
    if (damage >= 4) {
      const attackAutomation = await import("../rolls/attack-roll.js");
      await attackAutomation.applyDigitalHazardEffects?.({ attacker, defender: target.actor, attackItem, normalDamage: damage });
    }
    results.push({ name: target.name, armor, damage });
  }

  state.hazard = { combatId: getCombatId(), uses: usesBefore + 1, lastAttackId: attackItem.id };
  await attacker.update({
    [STATE_PATH]: state,
    "system.combat.hasAttackedThisRound": true,
    "system.combat.attacksMadeThisTurn": Math.max(0, number(attacker.system?.combat?.attacksMadeThisTurn)) + 1,
    ...consumeSignatureBatteryUpdates(attacker, attackItem)
  });

  if (attacker.system?.clash?.state?.active) {
    const { endDigimonClash } = await import("./clash.js");
    await endDigimonClash(attacker, { reason: "digitalHazard", all: true });
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: `<div class="dda-chat-card dda-effect-card effect-special dda-digital-hazard-card"><h2>${escapeHtml(quality?.name ?? "Digital Hazard")}</h2><ul class="dda-effect-list"><li>${text("Raio", "Radius")}: <strong>${radius}</strong>.</li><li>${text("Dano bruto", "Raw Damage")}: <strong>${rawDamage}</strong>.</li>${results.map((entry) => `<li>${escapeHtml(entry.name)}: ${rawDamage} − ${entry.armor} ${text("Armadura", "Armor")} = <strong>${entry.damage}</strong>.</li>`).join("")}${selfCost ? `<li>${text("Custo após o primeiro uso", "Cost after first use")}: <strong>${selfCost}</strong> ${text("Caixas de Ferimento; não concede Resolve", "Wound Boxes; grants no Resolve")}.</li>` : ""}</ul></div>`
  });
  return { targets: results, rawDamage, radius, selfCost };
}

async function applyZeroPositiveEffect(attacker, target, attackItem, duration) {
  if (!target) return null;
  const directTag = normalizeKey(attackItem.system?.effectTag?.enabled ? attackItem.system.effectTag.tag : "");
  const tag = directTag || [...attackTags(attackItem)].find((candidate) => EFFECT_TAGS[candidate]?.type === "positive") || "";
  const definition = EFFECT_TAGS[tag];
  if (!tag || !definition || definition.type !== "positive") return null;
  const potencyStat = String(definition.potency ?? "");
  const potency = potencyStat ? Math.max(1, getActorDerivedStat(attacker, potencyStat)) : 1;
  const effects = foundry.utils.deepClone(target.system?.effects?.active ?? []);
  const effect = {
    id: foundry.utils.randomID(), tag, label: `[${tag.toUpperCase()}] — Zero Unit`,
    sourceActorUuid: attacker.uuid, sourceAttackId: attackItem.id,
    effectType: "positive", potency, value: potency,
    durationRule: true, hasDuration: true, duration, remaining: duration, maxDuration: duration,
    zeroUnitAutomatic: true
  };
  if (!canUpdateActor(target)) {
    game.socket.emit(`system.${SYSTEM_ID}`, {
      action: SOCKET_ACTION,
      operation: "addEffect",
      requesterId: game.user.id,
      attackerUuid: attacker.uuid,
      targetUuid: target.uuid,
      effect
    });
    return { tag, potency, duration, requestedFromGm: true };
  }
  effects.push(effect);
  await target.update({ "system.effects.active": effects });
  return { tag, potency, duration };
}

async function reviveWithZeroUnit(attacker, target, amount) {
  const stage = normalizeKey(target.system?.stage ?? "");
  if (["baby1", "digitama", "digiegg", "egg"].includes(stage)) return null;
  const wounds = actorWounds(target);
  const restored = Math.max(1, Math.min(wounds.max || amount, amount));
  if (!canUpdateActor(target)) {
    game.socket.emit(`system.${SYSTEM_ID}`, {
      action: SOCKET_ACTION,
      operation: "revive",
      requesterId: game.user.id,
      attackerUuid: attacker.uuid,
      targetUuid: target.uuid,
      amount
    });
    return { requestedFromGm: true, restored };
  }
  await target.update({ [wounds.valuePath]: restored, "system.combat.defeated": false, "system.combat.incapacitated": false });
  const combatant = game?.combat?.combatants?.find((entry) => entry.actor?.uuid === target.uuid);
  if (combatant?.defeated) await combatant.update({ defeated: false });
  return { restored };
}

async function executeZeroUnit(attacker, attackItem, mode) {
  const state = actorState(attacker);
  if (state.zeroUnit?.combatId === getCombatId() && state.zeroUnit?.used) {
    ui.notifications.warn(text("[ZERO] já concedeu seu benefício neste Combate.", "[ZERO] already granted its benefit this Combat."));
    return null;
  }
  const signature = Boolean(attackItem.system?.isSignature);
  const battery = signature ? Math.max(0, number(attacker.system?.resources?.battery?.value)) : 0;
  if (signature && battery <= 0) return null;
  if (attacker.system?.combat?.hasAttackedThisRound || number(attacker.system?.combat?.attacksMadeThisTurn) > 0) {
    ui.notifications.warn(text("Este Digimon já usou seu Ataque nesta ativação.", "This Digimon already used its Attack this turn."));
    return null;
  }

  const instinct = Math.max(1, getQualityRank(findQuality(attacker, "instinct")));
  const sourceToken = tokenForActor(attacker);
  const sv = Math.max(0, getActorSv(attacker));
  const selected = Array.from(game.user?.targets ?? [])[0] ?? null;
  let result = null;

  if (mode === "revive") {
    const target = selected?.actor;
    if (!target || !areActorsAlliesForQualities(attacker, target) || actorWounds(target).value > 0) {
      ui.notifications.warn(text("Selecione um único aliado derrotado.", "Select one defeated ally."));
      return null;
    }
    if (["baby1", "digitama", "digiegg", "egg"].includes(normalizeKey(target.system?.stage ?? ""))) {
      ui.notifications.warn(text("Unidade Zero não afeta Digi-Ovos.", "Zero Unit does not affect DigiEggs."));
      return null;
    }
  }

  const { spendActorActions } = await import("./action-economy.js");
  if (!(await spendActorActions(attacker, 2, { requireActiveUnit: true }))) return null;

  if (mode === "revive") {
    const target = selected.actor;
    result = await reviveWithZeroUnit(attacker, target, (instinct * 2) + battery);
    await applyZeroPositiveEffect(attacker, target, attackItem, instinct);
  } else {
    const allies = (canvas?.tokens?.placeables ?? []).filter((token) => (
      token.actor && sourceToken && areActorsAlliesForQualities(attacker, token.actor) && tokenDistance(sourceToken, token) <= sv
    ));
    const credit = instinct + battery;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
      content: `<div class="dda-chat-card dda-effect-card effect-positive dda-zero-unit-card"><h2>${escapeHtml(findQuality(attacker, "zeroUnit")?.name ?? "Zero Unit")}</h2><p>${text(`Aliados a até ${sv} Espaços podem Evoluir gratuitamente com crédito de ${credit} PE.`, `Allies within ${sv} Spaces may Evolve for free with ${credit} EP credit.`)}</p><div class="dda-zero-unit-targets">${allies.map((token) => `<button type="button" data-action="zero-unit-evolve" data-target-uuid="${escapeHtml(token.actor.uuid)}" data-credit="${credit}">${escapeHtml(token.name)}</button>`).join("") || `<em>${text("Nenhum aliado elegível no alcance.", "No eligible ally in range.")}</em>`}</div></div>`
    });
    const effectTarget = selected?.actor && allies.some((token) => token.actor.uuid === selected.actor.uuid) ? selected.actor : null;
    await applyZeroPositiveEffect(attacker, effectTarget, attackItem, instinct);
    result = { allies: allies.map((token) => token.actor.uuid), credit };
  }

  state.zeroUnit = { combatId: getCombatId(), used: true, mode, usedAt: new Date().toISOString() };
  await attacker.update({
    [STATE_PATH]: state,
    "system.combat.hasAttackedThisRound": true,
    "system.combat.attacksMadeThisTurn": Math.max(0, number(attacker.system?.combat?.attacksMadeThisTurn)) + 1,
    ...consumeSignatureBatteryUpdates(attacker, attackItem)
  });
  return result;
}

export async function tryExecuteSpecialGainForceAttack(attacker, attackItem, options = {}) {
  if (options?.skipGainForceSpecialAttack) return { handled: false };
  const hazard = findQuality(attacker, "digitalHazard");
  if (hazard && qualitySelectedAttack(hazard, attackItem)) {
    return { handled: true, result: await executeDigitalHazard(attacker, attackItem) };
  }
  const zero = findQuality(attacker, "zeroUnit");
  if (!zero || !qualitySelectedAttack(zero, attackItem)) return { handled: false };
  const state = actorState(attacker);
  if (state.zeroUnit?.combatId === getCombatId() && state.zeroUnit?.used) return { handled: false };
  const mode = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-offensive-quality-window"],
    window: { title: zero.name },
    content: `<form class="dda-roll-dialog"><p>${text("Ativar o benefício único de [ZERO] nesta declaração?", "Trigger [ZERO]'s once-per-combat benefit?")}</p><div class="form-group"><label>${text("Modo", "Mode")}</label><select name="mode"><option value="normal">${text("Ataque de Suporte normal", "Normal Support Attack")}</option><option value="evolve">${text("Evolução gratuita em alcance", "Free Evolution in range")}</option><option value="revive">${text("Restaurar aliado derrotado", "Revive defeated ally")}</option></select></div></form>`,
    ok: { label: text("Continuar", "Continue"), callback: (_event, button) => String(button.form.elements.mode?.value ?? "normal") },
    rejectClose: false,
    modal: true
  });
  if (!mode || mode === "normal") return { handled: false };
  return { handled: true, result: await executeZeroUnit(attacker, attackItem, mode) };
}

export function getEffectDpCost(effectOrTag) {
  const explicit = number(effectOrTag?.dpCost ?? effectOrTag?.effectDpCost, NaN);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  return EFFECT_DP_COST[effectKey(effectOrTag)] ?? 0;
}

export function isNegativeEffect(effectOrTag) {
  const type = String(effectOrTag?.effectType ?? effectOrTag?.type ?? "").toLowerCase();
  return type === "negative" || type === "damage" || NEGATIVE_EFFECTS.has(effectKey(effectOrTag));
}

export function isFlexibleDigizoidWeaponEscapeAutomatic(actor) {
  return hasQuality(actor, "flexibleDigizoidWeaponry");
}

export function getDigizoidDisarmRule(actor) {
  if (hasQuality(actor, "adaptiveDigizoidWeaponry")) return { immune: true, choices: [] };
  if (hasQuality(actor, "pureDigizoidWeaponry")) return { immune: false, choices: ["weapon", "offhand"], removesBoth: false };
  return { immune: false, choices: ["weapon"], removesBoth: false };
}

export function isTemporalInForceActor(actor) {
  return hasQuality(actor, "temporalInForce");
}

export function suppressInterruptsDuringTemporalTurn(attacker) {
  if (!attacker || !isTemporalInForceActor(attacker) || !game?.combat?.started) return false;
  const combatant = game.combat.combatants?.find((entry) => entry.actor?.uuid === attacker.uuid);
  const active = game.combat.combatant;
  if (!combatant || !active) return false;
  const unitId = combatant.getFlag(SYSTEM_ID, "initiative.unitId");
  const activeUnitId = active.getFlag(SYSTEM_ID, "initiative.unitId");
  return unitId && activeUnitId ? unitId === activeUnitId : combatant.id === active.id;
}

export function getSecondWindGainForceRules(actor) {
  const undying = hasQuality(actor, "undyingInForce");
  const instinctRanks = Math.max(0, getQualityRank(findQuality(actor, "instinct")));
  return {
    canAttackSameTurn: undying,
    maximumUses: 1 + (undying ? instinctRanks : 0),
    pureOverwriteAlternative: hasQuality(actor, "pureOverwrite")
  };
}

export function getGainForceLowReroll(actor, statKey) {
  const key = String(statKey ?? "").toLowerCase();
  if (key === "health" && hasQuality(actor, "undyingInForce")) {
    const supporting = findQuality(actor, "vitalEnergy");
    const limit = supporting ? Math.min(3, 1 + Math.max(1, getQualityRank(supporting))) : 1;
    return { quality: findQuality(actor, "undyingInForce"), limit, bucket: "gain-force-health" };
  }
  if (key === "accuracy" && hasQuality(actor, "temporalInForce")) {
    const supporting = findQuality(actor, "hugePower");
    const limit = supporting ? Math.min(3, 1 + Math.max(1, getQualityRank(supporting))) : 1;
    return { quality: findQuality(actor, "temporalInForce"), limit, bucket: "gain-force-accuracy" };
  }
  if (key === "dodge" && hasQuality(actor, "omniscientInForce")) {
    const supporting = findQuality(actor, "avoidance");
    const limit = supporting ? Math.min(3, 1 + Math.max(1, getQualityRank(supporting))) : 1;
    return { quality: findQuality(actor, "omniscientInForce"), limit, bucket: "gain-force-dodge" };
  }
  return null;
}

/** Add only the Digizoid rules that the generic attack-modifier engine cannot express. */
export function applyDigizoidAttackRules(attacker, attackItem, modifier, options = {}) {
  if (!attacker || !attackItem || !modifier) return modifier;
  const tags = attackTags(attackItem, modifier.qualityTags);
  const weapon = tags.has("weapon") || tags.has("offhand");
  if (!weapon) return modifier;

  const damage = tags.has("damage") || String(attackItem.system?.baseTags?.functionType ?? "") === "damage";
  const support = tags.has("support") || String(attackItem.system?.baseTags?.functionType ?? "") === "support";
  const melee = tags.has("melee") || String(attackItem.system?.baseTags?.rangeType ?? "") === "melee";
  const ranged = tags.has("range") || tags.has("ranged") || ["range", "ranged"].includes(String(attackItem.system?.baseTags?.rangeType ?? ""));

  if (hasQuality(attacker, "cursedDigizoidWeaponry")) {
    const wounds = actorWounds(attacker);
    if (wounds.max > 0 && wounds.value <= wounds.max / 2) {
      modifier.damageBonus += 2;
      modifier.qualities.push({
        id: "cursed-digizoid-weaponry-threshold",
        name: findQuality(attacker, "cursedDigizoidWeaponry")?.name ?? "Cursed Digizoid Weaponry",
        parts: [text("Metade das Caixas de Ferimento ou menos: +2 Dano", "Half Wound Boxes or fewer: +2 Damage")]
      });
    }
  }

  if (hasQuality(attacker, "adaptiveDigizoidWeaponry")) {
    const allocation = attacker.system?.combat?.digizoidGainForce?.adaptiveWeapon ?? {};
    modifier.accuracyBonus += Math.max(0, number(allocation.accuracy));
    modifier.damageBonus += Math.max(0, number(allocation.damage));
  }

  if (damage && hasQuality(attacker, "sharpDigizoidWeaponry")) {
    modifier.unalterableDamage += 2;
  }

  if (hasQuality(attacker, "flexibleDigizoidWeaponry")) {
    if (ranged) modifier.rangeBonus += 1;
    if (melee) modifier.meleeReachBonus += 1;
  }

  if (damage && hasQuality(attacker, "heavyDigizoidWeaponry")) {
    modifier.effectTags.push("heavy");
    modifier.heavyDigizoidDuration = 1;
  }

  if (hasQuality(attacker, "lightDigizoidWeaponry")) {
    modifier.automaticSuccesses += 1;
  }

  if (hasQuality(attacker, "shiningDigizoidWeaponry")) {
    if (ranged) {
      modifier.rangeBonus += 3;
      modifier.effectiveLimitBonus += 3;
    }
    if (melee && damage) modifier.minimumNormalDamage = Math.max(2, number(modifier.minimumNormalDamage));
    if (melee && support) modifier.effectDurationBonus = Math.max(1, number(modifier.effectDurationBonus));
  }

  /* OFFHAND behaves as Rank 2 WEAPON. It is independent and may join WEAPON on a Signature Move. */
  if (hasQuality(attacker, "pureDigizoidWeaponry") && tags.has("offhand")) {
    const both = tags.has("weapon");
    const isSignature = Boolean(attackItem.system?.isSignature);
    const battery = Math.max(0, number(attacker.system?.resources?.battery?.value));
    const offhandBonus = 2;
    if (!both || isSignature) {
      const weaponRanks = both ? Math.max(0, getQualityRank(findQuality(attacker, "weapon"))) : 0;
      const cap = 4 + battery;
      const existingAccuracyFromWeapon = weaponRanks + 2;
      const existingDamageFromWeapon = weaponRanks + 2 + (both && melee && damage ? 1 : 0);
      const offhandMeleeDamage = melee && damage ? 1 : 0;
      const accuracyApplied = isSignature
        ? Math.min(offhandBonus, Math.max(0, cap - existingAccuracyFromWeapon))
        : offhandBonus;
      const damageApplied = isSignature
        ? Math.min(offhandBonus + offhandMeleeDamage, Math.max(0, cap - existingDamageFromWeapon))
        : offhandBonus + offhandMeleeDamage;
      modifier.accuracyBonus += accuracyApplied;
      modifier.damageBonus += damageApplied;
      if (ranged) {
        modifier.rangeBonus += offhandBonus;
        modifier.effectiveLimitBonus += offhandBonus;
      }
      modifier.pureDigizoidOffhandBonus = Math.min(accuracyApplied, damageApplied);
    }
  }

  return modifier;
}

export function applyDigizoidPostHitRules(data, { qualityAttackModifier, attackFunctionType } = {}) {
  if (!data || !qualityAttackModifier) return data;
  data.minimumNormalDamage = Math.max(
    number(data.minimumNormalDamage),
    number(qualityAttackModifier.minimumNormalDamage)
  );
  if (attackFunctionType === "damage" && number(qualityAttackModifier.heavyDigizoidDuration) > 0) {
    data.extraEffects ??= [];
    /* The normal Effect pipeline will calculate potency; this marker fixes Duration at 1. */
    data.heavyDigizoidDuration = 1;
  }
  return data;
}

async function resolveActor(reference = "") {
  if (!reference) return null;
  try {
    const document = await fromUuid(reference);
    return document?.documentName === "Token" ? document.actor : document;
  } catch (_error) {
    return null;
  }
}

async function chatEffectNegation(actor, entries = []) {
  if (!entries.length) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dda-chat-card dda-effect-card effect-special dda-gain-force-card">
      <h2>${escapeHtml(text("Gain Force — Efeitos recebidos", "Gain Force — Incoming Effects"))}</h2>
      <ul class="dda-effect-list">${entries.map((entry) => `<li>${entry}</li>`).join("")}</ul>
    </div>`
  });
}

export async function resolveIncomingDigizoidGainForceEffects(defender, effects = []) {
  if (!defender || !effects.length) return { effects: effects ?? [], negated: [] };
  const remaining = [];
  const negated = [];
  const notes = [];
  const state = actorState(defender);
  const overwriteActive = Boolean(state.overwrite?.active && state.overwrite?.combatId === getCombatId());

  for (const rawEffect of effects) {
    const effect = foundry.utils.deepClone(rawEffect);
    const key = effectKey(effect);
    const cost = getEffectDpCost(effect);
    effect.dpCost = cost;
    const negative = isNegativeEffect(effect);

    if (negative && hasQuality(defender, "pureOverwrite") && cost > 0 && cost <= 2) {
      negated.push(effect);
      notes.push(`${escapeHtml(findQuality(defender, "pureOverwrite")?.name ?? "Pure Overwrite")}: <strong>[${escapeHtml(key.toUpperCase())}]</strong> ${text("foi negado por imunidade.", "was negated by immunity.")}`);
      continue;
    }

    if (negative && hasQuality(defender, "shiningDigizoidArmor")) {
      const original = Math.max(0, number(effect.potency ?? effect.value));
      if (original > 0) {
        const reduced = Math.max(1, original - 1);
        effect.potency = reduced;
        if (Number.isFinite(Number(effect.value))) effect.value = Math.max(1, number(effect.value) - 1);
        effect.shiningDigizoidPotencyReduction = original - reduced;
      }
    }

    if (overwriteActive && cost > 0) {
      const source = await resolveActor(effect.sourceActorUuid);
      const isOwnQuality = Boolean(effect.sourceOwnQuality || effect.sourceKind === "selfQuality");
      const isExternal = !isOwnQuality && (!source || source.uuid !== defender.uuid);
      const wounds = actorWounds(defender);
      const loss = cost * 2;
      if (isExternal && !isOwnQuality && wounds.value - loss > 0) {
        await defender.update({ [wounds.valuePath]: wounds.value - loss });
        const { applyCombatMonsterResolveFromDamage } = await import("./defensive-qualities.js");
        await applyCombatMonsterResolveFromDamage({
          actor: defender,
          healthDamage: loss,
          attacker: defender,
          sourceKind: "selfQuality"
        });
        negated.push(effect);
        notes.push(`${escapeHtml(findQuality(defender, "overwrite")?.name ?? "Overwrite")}: <strong>[${escapeHtml(key.toUpperCase())}]</strong> ${text(`foi negado ao custo de ${loss} Caixas de Ferimento.`, `was negated for ${loss} Wound Boxes.`)}`);
        continue;
      }
    }

    remaining.push(effect);
  }

  await chatEffectNegation(defender, notes);
  return { effects: remaining, negated };
}

export async function reduceEnemyUnalterableDamageWithShiningArmor(actor, damage, options = {}) {
  const amount = Math.max(0, Math.floor(number(damage)));
  const unalterablePortion = options?.unalterable
    ? amount
    : Math.min(amount, Math.max(0, Math.floor(number(options?.unalterablePortion))));
  if (!actor || amount <= 0 || unalterablePortion <= 0 || !hasQuality(actor, "shiningDigizoidArmor")) {
    return { damage: amount, reduction: 0 };
  }
  const attacker = options.attacker ?? null;
  if (!attacker || areActorsAlliesForQualities(actor, attacker)) return { damage: amount, reduction: 0 };

  const useIt = await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-defensive-quality-window"],
    window: { title: findQuality(actor, "shiningDigizoidArmor")?.name ?? "Shining Digizoid Armor" },
    content: `<div class="dda-confirm-dialog"><p>${text(
      `Rolar ${unalterablePortion}d6 para reduzir o Dano Inalterável recebido de <strong>${escapeHtml(attacker.name)}</strong>?`,
      `Roll ${unalterablePortion}d6 to reduce the Unalterable Damage from <strong>${escapeHtml(attacker.name)}</strong>?`
    )}</p></div>`,
    yes: { label: text("Rolar", "Roll") },
    no: { label: text("Não usar", "Do not use") },
    rejectClose: false,
    modal: true
  });
  if (!useIt) return { damage: amount, reduction: 0 };

  const roll = await new Roll(`${unalterablePortion}d6`).evaluate();
  const successes = (roll.dice?.[0]?.results ?? []).filter((entry) => entry.active !== false && number(entry.result) >= 5).length;
  const reduction = Math.min(unalterablePortion, successes);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content: `<div class="dda-chat-card dda-effect-card effect-positive"><h2>${escapeHtml(findQuality(actor, "shiningDigizoidArmor")?.name ?? "Shining Digizoid Armor")}</h2><p>${text("Redução", "Reduction")}: <strong>${reduction}</strong> (${amount} → ${amount - reduction}).</p></div>`
  });
  return { damage: amount - reduction, reduction, roll };
}

export async function resolveSharpDigizoidArmorRetaliation({ attacker, defender, attackItem, hit } = {}) {
  if (!hit || !attacker || !defender || !hasQuality(defender, "sharpDigizoidArmor")) return null;
  const tags = attackTags(attackItem);
  if (!tags.has("damage") && String(attackItem?.system?.baseTags?.functionType ?? "") !== "damage") return null;
  const result = await requestDamageApplication(attacker, 1, {
    attacker: defender,
    unalterable: true,
    damageSourceKind: "attack",
    damageLabel: findQuality(defender, "sharpDigizoidArmor")?.name ?? "Sharp Digizoid Armor"
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: defender }),
    content: `<div class="dda-chat-card dda-effect-card effect-special"><h2>${escapeHtml(findQuality(defender, "sharpDigizoidArmor")?.name ?? "Sharp Digizoid Armor")}</h2><p>${escapeHtml(attacker.name)} ${text("sofreu 1 Dano Inalterável de retaliação.", "suffered 1 retaliatory Unalterable Damage.")}</p></div>`
  });
  return result;
}

async function promptAdaptiveWeapon(actor) {
  const selected = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-offensive-quality-window"],
    window: { title: findQuality(actor, "adaptiveDigizoidWeaponry")?.name ?? "Adaptive Digizoid Weaponry" },
    content: `<form class="dda-roll-dialog"><p>${text("Distribua exatamente 4 pontos entre Precisão e Dano até o início do próximo turno.", "Split exactly 4 points between Accuracy and Damage until the start of the next turn.")}</p><div class="form-group"><label>${text("Precisão", "Accuracy")}</label><input type="number" name="accuracy" min="0" max="4" value="2"></div><div class="form-group"><label>${text("Dano", "Damage")}</label><input type="number" name="damage" min="0" max="4" value="2"></div></form>`,
    ok: {
      label: text("Aplicar", "Apply"),
      callback: (_event, button) => ({
        accuracy: Math.max(0, Math.min(4, Math.floor(number(button.form.elements.accuracy?.value)))),
        damage: Math.max(0, Math.min(4, Math.floor(number(button.form.elements.damage?.value))))
      })
    },
    rejectClose: false,
    modal: true
  });
  if (!selected) return null;
  if (selected.accuracy + selected.damage !== 4) {
    ui.notifications.warn(text("A distribuição precisa totalizar 4 pontos.", "The allocation must total 4 points."));
    return promptAdaptiveWeapon(actor);
  }
  return selected;
}

async function ensureUndyingRegen(actor) {
  if (!hasQuality(actor, "undyingInForce")) return;
  const suppressedUntilRound = number(actor.system?.combat?.digizoidGainForce?.undyingRegenSuppressedUntilRound, -1);
  if (suppressedUntilRound >= getCombatRound()) return;
  const wounds = actorWounds(actor);
  const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
  const index = effects.findIndex((effect) => effect.gainForceUndyingRegen === true);
  const shouldExist = wounds.value > 0 && wounds.max > 0 && wounds.value < wounds.max / 2;
  if (!shouldExist && index >= 0) {
    effects.splice(index, 1);
    await actor.update({ "system.effects.active": effects });
    return;
  }
  if (!shouldExist) return;
  const potency = Math.max(1, getQualityRank(findQuality(actor, "instinct")));
  const regen = {
    id: index >= 0 ? effects[index].id : foundry.utils.randomID(),
    tag: "regen",
    label: findQuality(actor, "undyingInForce")?.name ?? "Undying inForce",
    effectType: "positive",
    potency,
    value: potency,
    durationRule: false,
    hasDuration: false,
    remaining: null,
    gainForceUndyingRegen: true,
    sourceActorUuid: actor.uuid,
    sourceOwnQuality: true
  };
  if (index >= 0) effects[index] = { ...effects[index], ...regen };
  else effects.push(regen);
  await actor.update({ "system.effects.active": effects });
}

export async function markUndyingRegenCleanseSuppression(actor) {
  if (!actor || !hasQuality(actor, "undyingInForce")) return false;
  const state = actorState(actor);
  state.undyingRegenSuppressedUntilRound = getCombatRound() + 1;
  await actor.update({ [STATE_PATH]: state });
  return true;
}

export async function processDigizoidGainForceStartOfTurn(actor) {
  if (!actor || !["digimon", "npc"].includes(actor.type)) return;
  const state = actorState(actor);
  const turnKey = `${getCombatId()}:${getCombatRound()}:${game?.combat?.turn ?? -1}`;
  if (state.startedTurnKey === turnKey) return;
  state.startedTurnKey = turnKey;

  if (hasQuality(actor, "adaptiveDigizoidWeaponry")) {
    const allocation = await promptAdaptiveWeapon(actor);
    if (allocation) state.adaptiveWeapon = { ...allocation, turnKey, selectedAt: new Date().toISOString() };
  } else {
    state.adaptiveWeapon = null;
  }

  state.lightWeaponAction = hasQuality(actor, "lightDigizoidWeaponry")
    ? { available: 1, turnKey }
    : { available: 0, turnKey };
  state.omniscientHold = { ...(state.omniscientHold ?? {}), freeAvailable: true, paidUsed: false, turnKey, holds: [] };
  await actor.update({ [STATE_PATH]: state });
  await ensureUndyingRegen(actor);
}

export function getLightDigizoidActionReserve(actor, actionKey = "") {
  if (!hasQuality(actor, "lightDigizoidWeaponry")) return 0;
  const allowed = new Set(["move", "difficultMove", "bolster"]);
  if (!allowed.has(String(actionKey))) return 0;
  return Math.max(0, number(actor.system?.combat?.digizoidGainForce?.lightWeaponAction?.available));
}

export async function spendLightDigizoidActionReserve(actor, amount = 1) {
  const state = actorState(actor);
  const current = Math.max(0, number(state.lightWeaponAction?.available));
  const spent = Math.min(current, Math.max(0, Math.floor(number(amount))));
  if (spent <= 0) return 0;
  state.lightWeaponAction = { ...(state.lightWeaponAction ?? {}), available: current - spent };
  await actor.update({ [STATE_PATH]: state });
  return spent;
}

export async function refundLightDigizoidActionReserve(actor, amount = 1) {
  if (!actor || !hasQuality(actor, "lightDigizoidWeaponry")) return 0;
  const state = actorState(actor);
  const current = Math.max(0, number(state.lightWeaponAction?.available));
  const refunded = Math.max(0, Math.floor(number(amount)));
  state.lightWeaponAction = { ...(state.lightWeaponAction ?? {}), available: Math.min(1, current + refunded) };
  await actor.update({ [STATE_PATH]: state });
  return refunded;
}

export async function handleDigizoidGainForceEndTurn(actor) {
  if (!actor) return;
  const state = actorState(actor);
  state.lowRerolls = {};
  state.adaptiveWeapon = null;
  state.lightWeaponAction = { available: 0 };
  state.temporalTurns = Math.max(0, number(state.temporalTurns)) + (hasQuality(actor, "temporalInForce") ? 1 : 0);
  await actor.update({ [STATE_PATH]: state });
  for (const bucket of ["gain-force-health", "gain-force-accuracy", "gain-force-dodge"]) {
    await clearUseState(actor, bucket);
  }
}

export async function toggleOverwrite(actor) {
  if (!hasQuality(actor, "overwrite")) return null;
  if (!game?.combat?.started) {
    ui.notifications.warn(text("Overwrite só pode ser ativado durante um Combate.", "Overwrite can only be activated during Combat."));
    return null;
  }
  const state = actorState(actor);
  const active = Boolean(state.overwrite?.active && state.overwrite?.combatId === getCombatId());
  if (!active) {
    const { spendActorActions } = await import("./action-economy.js");
    if (!(await spendActorActions(actor, 1, { requireActiveUnit: true }))) return null;
  }
  state.overwrite = {
    active: !active,
    combatId: getCombatId(),
    changedAt: new Date().toISOString()
  };
  await actor.update({ [STATE_PATH]: state });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dda-chat-card dda-effect-card effect-special"><h2>Overwrite</h2><p>${!active ? text("Ativado até o fim do Combate ou encerramento voluntário.", "Active until the end of Combat or voluntarily ended.") : text("Encerrado como Ação Livre.", "Ended as a Free Action.")}</p></div>`
  });
  return { active: !active };
}

export function getDigizoidGainForceActionMenuEntries(actor) {
  const entries = [];
  if (hasQuality(actor, "overwrite")) {
    const active = Boolean(actor.system?.combat?.digizoidGainForce?.overwrite?.active);
    entries.push({
      key: "gainForceOverwrite",
      title: "Overwrite",
      summary: active ? text("Encerrar a sequência ativa.", "End the active sequence.") : text("Ativar e negar Efeitos externos ao custo de Ferimentos.", "Activate and negate external Effects by losing Wounds."),
      cost: active ? text("Livre", "Free") : "1A"
    });
  }
  if (hasQuality(actor, "omniscientInForce")) {
    const holdState = actor.system?.combat?.digizoidGainForce?.omniscientHold ?? {};
    if (holdState.freeAvailable !== false || holdState.paidUsed !== true) {
      entries.push({
        key: "gainForceHold",
        title: findQuality(actor, "omniscientInForce")?.name ?? "Omniscient inForce",
        summary: text("Preparar um Ataque ou uma Esquiva para liberação posterior.", "Hold an Attack or Dodge for later release."),
        cost: holdState.freeAvailable === false ? "2A" : text("Livre", "Free")
      });
    }
  }
  const temporaryIp = Math.max(0, number(actor.system?.resources?.ip?.temp));
  if (temporaryIp > 0) {
    entries.push({
      key: "gainForceSpendIp",
      title: text("Gastar PI Temporário", "Spend Temporary IP"),
      summary: text("Gastar 1 PI Temporário pelas regras normais de PI.", "Spend 1 Temporary IP using the normal IP rules."),
      cost: `${temporaryIp} PI`
    });
  }
  const temporalTurns = Math.max(0, number(actor.system?.combat?.digizoidGainForce?.temporalTurns));
  const lastAdjusted = number(actor.system?.combat?.digizoidGainForce?.temporalLastAdjustedTurn, -1);
  if (hasQuality(actor, "temporalInForce") && temporalTurns > 0 && temporalTurns % 2 === 1 && lastAdjusted !== temporalTurns) {
    entries.push({
      key: "gainForceTemporalAdjust",
      title: findQuality(actor, "temporalInForce")?.name ?? "Temporal inForce",
      summary: text("Reposicionar esta unidade na Ordem de Iniciativa.", "Reposition this unit in the Initiative Order."),
      cost: text("Livre", "Free")
    });
  }
  return entries;
}

async function adjustTemporalInitiative(actor) {
  if (!game?.combat?.started || !hasQuality(actor, "temporalInForce")) return null;
  const lagged = (actor.system?.effects?.active ?? []).some((effect) => effectKey(effect) === "lag");
  if (lagged && !hasQuality(actor, "combatAwareness")) {
    ui.notifications.warn(text("[LAG] impede o ajuste da Iniciativa.", "[LAG] prevents the Initiative adjustment."));
    return null;
  }
  const combat = game.combat;
  const groups = new Map();
  for (const combatant of combat.combatants?.contents ?? []) {
    const unitId = String(combatant.getFlag(SYSTEM_ID, "initiative.unitId") ?? combatant.id);
    if (!groups.has(unitId)) groups.set(unitId, []);
    groups.get(unitId).push(combatant);
  }
  const units = [...groups.entries()].map(([id, members]) => ({
    id,
    members,
    order: Math.min(...members.map((member) => number(member.getFlag(SYSTEM_ID, "initiative.orderIndex"), 999))),
    name: members.map((member) => member.name).filter(Boolean).join(" + ")
  })).sort((left, right) => left.order - right.order);
  const currentIndex = units.findIndex((unit) => unit.members.some((member) => member.actor?.uuid === actor.uuid));
  if (currentIndex < 0) return null;
  const moving = units[currentIndex];
  const options = units.map((unit, index) => `<option value="${index}" ${index === currentIndex ? "selected" : ""}>${index + 1} — ${escapeHtml(unit.name)}</option>`).join("");
  const selected = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-initiative-dialog"],
    window: { title: findQuality(actor, "temporalInForce")?.name ?? "Temporal inForce" },
    content: `<form class="dda-roll-dialog"><div class="form-group"><label>${text("Nova posição", "New position")}</label><select name="position">${options}</select></div></form>`,
    ok: { label: text("Reposicionar", "Reposition"), callback: (_event, button) => Math.max(0, Math.floor(number(button.form.elements.position?.value))) },
    rejectClose: false,
    modal: true
  });
  if (selected === null || selected === undefined) return null;
  units.splice(currentIndex, 1);
  units.splice(Math.min(units.length, number(selected)), 0, moving);
  const updates = [];
  units.forEach((unit, index) => unit.members.forEach((member, memberIndex) => updates.push({
    _id: member.id,
    initiative: Number((units.length - index - (memberIndex * 0.001)).toFixed(3)),
    [`flags.${SYSTEM_ID}.initiative.orderIndex`]: index
  })));
  await combat.updateEmbeddedDocuments("Combatant", updates);
  const state = actorState(actor);
  state.temporalLastAdjustedTurn = Math.max(0, number(state.temporalTurns));
  await actor.update({ [STATE_PATH]: state });
  return { position: number(selected) };
}

async function chooseOmniscientHold(actor, { maximumActionCost = 1 } = {}) {
  const attacks = actor.items.filter((item) => {
    if (item.type !== "attack") return false;
    const actionCost = Math.max(1, number(item.system?.actionCost?.value, 1) + number(item.system?.actionCost?.extra));
    return actionCost <= maximumActionCost;
  });
  return foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-offensive-quality-window"],
    window: { title: findQuality(actor, "omniscientInForce")?.name ?? "Omniscient inForce" },
    content: `<form class="dda-roll-dialog"><div class="form-group"><label>${text("Resposta", "Response")}</label><select name="responseAction"><option value="attack">${text("Ataque preparado", "Held Attack")}</option><option value="dodge">${text("Esquiva prevista", "Predicted Dodge")}</option></select></div><div class="form-group"><label>${text("Ataque", "Attack")}</label><select name="attackId"><option value="">—</option>${attacks.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></div><div class="form-group"><label>${text("Gatilho específico", "Specific Trigger")}</label><input type="text" name="trigger" placeholder="${text("Quando um inimigo...", "When an enemy...")}"></div><p class="hint">${text(`Esta Ação Preparar aceita uma resposta de até ${maximumActionCost} Ação(ões).`, `This Hold Action accepts a response costing up to ${maximumActionCost} Action(s).`)}</p></form>`,
    ok: {
      label: text("Preparar", "Hold"),
      callback: (_event, button) => ({
        responseAction: String(button.form.elements.responseAction?.value ?? "attack"),
        attackId: String(button.form.elements.attackId?.value ?? ""),
        trigger: String(button.form.elements.trigger?.value ?? "").trim()
      })
    },
    rejectClose: false,
    modal: true
  });
}

export async function useOmniscientHold(actor) {
  if (!hasQuality(actor, "omniscientInForce")) return null;
  const state = actorState(actor);
  const free = state.omniscientHold?.freeAvailable !== false;
  if (!free && state.omniscientHold?.paidUsed === true) {
    ui.notifications.warn(text("As duas Ações Preparar deste turno já foram usadas.", "Both Hold Actions for this turn have already been used."));
    return null;
  }
  const choice = await chooseOmniscientHold(actor, { maximumActionCost: free ? 1 : 2 });
  if (!choice?.trigger) {
    if (choice) ui.notifications.warn(text("Declare um gatilho específico para Ação Preparar.", "Declare a specific trigger for Hold Action."));
    return null;
  }
  if (choice.responseAction === "attack" && !choice.attackId) {
    ui.notifications.warn(text("Selecione o Ataque que será preparado.", "Select the Attack to hold."));
    return null;
  }
  if (!free) {
    const { spendActorActions } = await import("./action-economy.js");
    if (!(await spendActorActions(actor, 2, { requireActiveUnit: true }))) return null;
  }
  const holdId = foundry.utils.randomID();
  const holds = Array.isArray(state.omniscientHold?.holds) ? [...state.omniscientHold.holds] : [];
  holds.push({
    id: holdId,
    responseAction: choice.responseAction,
    attackId: choice.attackId,
    trigger: choice.trigger,
    instinctBonus: Math.max(1, getQualityRank(findQuality(actor, "instinct"))),
    paid: !free,
    active: false,
    declaredAt: new Date().toISOString()
  });
  state.omniscientHold = {
    ...(state.omniscientHold ?? {}),
    freeAvailable: false,
    paidUsed: !free || state.omniscientHold?.paidUsed === true,
    holds
  };
  await actor.update({ [STATE_PATH]: state });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [SYSTEM_ID]: { omniscientHold: { actorUuid: actor.uuid, holdId } } },
    content: `<div class="dda-chat-card dda-effect-card effect-special dda-omniscient-hold-card"><h2>${escapeHtml(findQuality(actor, "omniscientInForce")?.name ?? "Omniscient inForce")}</h2><p>${text("Gatilho", "Trigger")}: ${escapeHtml(choice.trigger)}</p><p>${choice.responseAction === "dodge" ? text("Resposta: próxima Pool de Esquiva.", "Response: next Dodge Pool.") : text("Resposta: Ataque preparado.", "Response: held Attack.")}</p><button type="button" data-action="release-omniscient-hold" data-actor-uuid="${escapeHtml(actor.uuid)}" data-hold-id="${escapeHtml(holdId)}">${choice.responseAction === "dodge" ? text("Ativar Esquiva", "Activate Dodge") : text("Liberar Ataque", "Release Attack")}</button></div>`
  });
  return choice;
}

async function releaseOmniscientHold(actor, holdId = "") {
  const state = actorState(actor);
  const holds = Array.isArray(state.omniscientHold?.holds) ? [...state.omniscientHold.holds] : [];
  const index = holds.findIndex((entry) => String(entry.id) === String(holdId));
  if (index < 0) return null;
  const hold = holds[index];
  if (hold.responseAction === "dodge") {
    holds[index] = { ...hold, active: true, activatedAt: new Date().toISOString() };
    state.omniscientHold = { ...(state.omniscientHold ?? {}), holds };
    await actor.update({ [STATE_PATH]: state });
    ui.notifications.info(text("A próxima Pool de Esquiva receberá o bônus de Instinto.", "The next Dodge Pool gains the Instinct bonus."));
    return holds[index];
  }
  const attack = actor.items.get(hold.attackId);
  if (!attack) return null;
  holds.splice(index, 1);
  state.omniscientHold = { ...(state.omniscientHold ?? {}), holds };
  await actor.update({ [STATE_PATH]: state });
  const { rollAttack } = await import("../rolls/attack-roll.js");
  return rollAttack(actor, attack, {
    allowOutOfTurn: true,
    isInterrupt: true,
    actionCostOverride: 0,
    ignoreAttackPerRoundLimit: true,
    accuracyDiceModifier: Math.max(0, number(hold.instinctBonus)),
    omniscientHold: true
  });
}

export function prepareOmniscientHoldPoolOptions(actor, statKey, options = {}) {
  if (statKey !== "dodge" || !hasQuality(actor, "omniscientInForce")) return options;
  const holds = actor.system?.combat?.digizoidGainForce?.omniscientHold?.holds ?? [];
  const hold = holds.find((entry) => entry.responseAction === "dodge" && entry.active === true);
  if (!hold) return options;
  const bonus = Math.max(0, number(hold.instinctBonus));
  return {
    ...options,
    diceModifier: number(options.diceModifier) + bonus,
    modifierBreakdown: [
      ...(Array.isArray(options.modifierBreakdown) ? options.modifierBreakdown : []),
      { label: findQuality(actor, "omniscientInForce")?.name ?? "Omniscient inForce", value: bonus, kind: "gain-force-hold" }
    ],
    omniscientHoldDodgeId: hold.id
  };
}

export async function consumeOmniscientHoldDodge(actor, holdId = "") {
  const state = actorState(actor);
  const holds = Array.isArray(state.omniscientHold?.holds) ? [...state.omniscientHold.holds] : [];
  const next = holds.filter((entry) => String(entry.id) !== String(holdId));
  if (next.length === holds.length) return false;
  state.omniscientHold = { ...(state.omniscientHold ?? {}), holds: next };
  await actor.update({ [STATE_PATH]: state });
  return true;
}

export async function executeDigizoidGainForceAction(actor, key) {
  if (key === "gainForceOverwrite") return toggleOverwrite(actor);
  if (key === "gainForceHold") return useOmniscientHold(actor);
  if (key === "gainForceTemporalAdjust") return adjustTemporalInitiative(actor);
  if (key === "gainForceSpendIp") {
    const result = await spendDigimonTemporaryIp(actor, 1);
    if (result.success) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="dda-chat-card dda-effect-card effect-special"><h2>${text("PI Temporário", "Temporary IP")}</h2><p>${text("1 PI Temporário foi gasto pelas regras normais de PI.", "1 Temporary IP was spent using the normal IP rules.")}</p></div>`
      });
    }
    return result;
  }
  return null;
}

export async function useDigizoidGainForceQualityAction(actor, quality) {
  if (!actor || !quality || quality.type !== "quality") return { handled: false };
  const id = normalizeKey(quality.system?.source?.id ?? quality.system?.sourceId ?? quality.flags?.[SYSTEM_ID]?.sourceId ?? quality.name);
  if (["overwrite"].includes(id)) {
    return { handled: true, result: await toggleOverwrite(actor) };
  }
  if (["inforceonisciente", "omniscientinforce"].includes(id)) {
    return { handled: true, result: await useOmniscientHold(actor) };
  }
  if (["inforcetemporal", "temporalinforce"].includes(id)) {
    return { handled: true, result: await adjustTemporalInitiative(actor) };
  }
  return { handled: false };
}

export async function grantShiningDigizoidTemporaryIp(actor) {
  if (!hasQuality(actor, "shiningDigizoidWeaponry")) return null;
  const combatId = getCombatId();
  const sources = foundry.utils.deepClone(actor.system?.resources?.ip?.temporarySources ?? [])
    .filter((entry) => !(entry.id === "shining-digizoid-initiative" && entry.combatId !== combatId));
  if (!sources.some((entry) => entry.id === "shining-digizoid-initiative" && entry.combatId === combatId)) {
    sources.push({
      id: "shining-digizoid-initiative",
      amount: 1,
      source: findQuality(actor, "shiningDigizoidWeaponry")?.name ?? "Shining Digizoid Weaponry",
      expiresOn: "combatEnd",
      combatId
    });
  }
  const total = sources.reduce((sum, entry) => sum + Math.max(0, number(entry.amount)), 0);
  await actor.update({
    "system.resources.ip.temp": total,
    "system.resources.ip.temporarySources": sources
  });
  return { granted: 1 };
}

export async function spendDigimonTemporaryIp(actor, amount = 1) {
  const current = Math.max(0, number(actor?.system?.resources?.ip?.temp));
  const cost = Math.max(0, Math.floor(number(amount)));
  if (!actor || current < cost) return { success: false, available: current };
  let remaining = cost;
  const sources = foundry.utils.deepClone(actor.system?.resources?.ip?.temporarySources ?? []);
  for (let index = sources.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const available = Math.max(0, number(sources[index].amount));
    const spent = Math.min(available, remaining);
    sources[index].amount = available - spent;
    remaining -= spent;
  }
  const nextSources = sources.filter((entry) => number(entry.amount) > 0);
  await actor.update({
    "system.resources.ip.temp": current - cost,
    "system.resources.ip.temporarySources": nextSources
  });
  return { success: true, spent: cost, remaining: current - cost };
}

export async function insertTemporalInForceUnits(ordered = []) {
  const temporal = ordered.filter((unit) => unit?.initiative?.temporal);
  const result = ordered.filter((unit) => !unit?.initiative?.temporal);
  for (const unit of temporal) {
    const actor = unit.primaryActor ?? unit.members?.find((entry) => entry.role === "digimon")?.combatant?.actor ?? unit.members?.[0]?.combatant?.actor;
    const options = Array.from({ length: result.length + 1 }, (_unused, index) => {
      const nextName = result[index]?.members?.map((member) => member.combatant?.name).filter(Boolean).join(" + ");
      return `<option value="${index}">${index + 1}${nextName ? ` — ${text("antes de", "before")} ${escapeHtml(nextName)}` : ` — ${text("fim da ordem", "end of order")}`}</option>`;
    }).join("");
    const selected = await foundry.applications.api.DialogV2.prompt({
      classes: ["dda", "dda-initiative-dialog"],
      window: { title: findQuality(actor, "temporalInForce")?.name ?? "Temporal inForce" },
      content: `<form class="dda-roll-dialog"><p>${text(`Escolha a posição de <strong>${escapeHtml(actor?.name)}</strong> depois das demais rolagens.`, `Choose <strong>${escapeHtml(actor?.name)}</strong>'s position after all other rolls.`)}</p><div class="form-group"><label>${text("Posição", "Position")}</label><select name="position">${options}</select></div></form>`,
      ok: { label: text("Aplicar", "Apply"), callback: (_event, button) => Math.max(0, Math.floor(number(button.form.elements.position?.value))) },
      rejectClose: false,
      modal: true
    });
    result.splice(Math.min(result.length, Math.max(0, number(selected))), 0, unit);
  }
  return result;
}

export function registerDigizoidGainForce() {
  Hooks.on("renderChatMessageHTML", (_message, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0] ?? html?.element ?? null;
    root?.querySelectorAll?.('[data-action="release-omniscient-hold"]').forEach((button) => button.addEventListener("click", async (event) => {
      event.preventDefault();
      const actor = await resolveActor(event.currentTarget?.dataset?.actorUuid);
      if (!actor || (!game.user.isGM && !actor.isOwner)) {
        ui.notifications.warn(text("Você não controla este Digimon.", "You do not control this Digimon."));
        return;
      }
      await releaseOmniscientHold(actor, event.currentTarget?.dataset?.holdId ?? "");
    }));
    root?.querySelectorAll?.('[data-action="zero-unit-evolve"]').forEach((button) => button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.currentTarget.disabled = true;
      const target = await resolveActor(event.currentTarget?.dataset?.targetUuid);
      const credit = Math.max(0, number(event.currentTarget?.dataset?.credit));
      if (!target || (!game.user.isGM && !target.isOwner)) {
        ui.notifications.warn(text("Você não controla esse aliado.", "You do not control that ally."));
        event.currentTarget.disabled = false;
        return;
      }
      const evolution = await import("./evolution.js");
      let result = null;
      if (target.type === "npc") {
        result = await evolution.evolveIndependentDigimon(target);
      } else {
        const { resolveLinkedTamerForPartner } = await import("./tamer-actions.js");
        const tamer = await resolveLinkedTamerForPartner(target);
        result = tamer ? await evolution.evolvePartner(tamer, {
          zeroUnit: true,
          evolutionPointCredit: credit
        }) : null;
      }
      if (!result) event.currentTarget.disabled = false;
    }));
  });
  game.socket.on(`system.${SYSTEM_ID}`, async (payload = {}) => {
    if (payload.action !== SOCKET_ACTION || primaryActiveGM()?.id !== game.user.id) return;
    const target = await resolveActor(payload.targetUuid);
    if (!target) return;
    if (payload.operation === "damage") {
      const attacker = await resolveActor(payload.attackerUuid);
      const requester = game.users?.get(payload.requesterId);
      if (!requester || (!requester.isGM && attacker && !attacker.testUserPermission?.(requester, "OWNER"))) return;
      const { applyDamage } = await import("../rolls/damage-application.js");
      await applyDamage(target, payload.damage, { ...(payload.options ?? {}), attacker });
    }
    if (payload.operation === "revive") {
      const attacker = await resolveActor(payload.attackerUuid);
      const requester = game.users?.get(payload.requesterId);
      if (!requester || !attacker || (!requester.isGM && !attacker.testUserPermission?.(requester, "OWNER"))) return;
      const wounds = actorWounds(target);
      const restored = Math.max(1, Math.min(wounds.max || number(payload.amount), number(payload.amount)));
      await target.update({ [wounds.valuePath]: restored, "system.combat.defeated": false, "system.combat.incapacitated": false });
      const combatant = game?.combat?.combatants?.find((entry) => entry.actor?.uuid === target.uuid);
      if (combatant?.defeated) await combatant.update({ defeated: false });
    }
    if (payload.operation === "addEffect" && payload.effect) {
      const attacker = await resolveActor(payload.attackerUuid);
      const requester = game.users?.get(payload.requesterId);
      if (!requester || !attacker || (!requester.isGM && !attacker.testUserPermission?.(requester, "OWNER"))) return;
      const effects = foundry.utils.deepClone(target.system?.effects?.active ?? []);
      effects.push(payload.effect);
      await target.update({ "system.effects.active": effects });
    }
  });
  const cleanupCombatResources = async () => {
  for (const actor of game.actors?.contents ?? []) {
      if (!["digimon", "npc"].includes(actor.type)) continue;
      const state = actorState(actor);
      const sources = foundry.utils.deepClone(actor.system?.resources?.ip?.temporarySources ?? []);
      const remainingSources = sources.filter((entry) => entry.id !== "shining-digizoid-initiative");
      const remainingTemporaryIp = remainingSources.reduce((sum, entry) => sum + Math.max(0, number(entry.amount)), 0);
      if (!state.overwrite?.active && remainingSources.length === sources.length) continue;
      state.overwrite = { active: false, combatId: "" };
      await actor.update({
        [STATE_PATH]: state,
        "system.resources.ip.temp": remainingTemporaryIp,
        "system.resources.ip.temporarySources": remainingSources
      });
    }
  };
  Hooks.on("combatEnd", cleanupCombatResources);
  Hooks.on("deleteCombat", cleanupCombatResources);
  game.dda ??= {};
  game.dda.digizoidGainForce = {
    getDisarmRule: getDigizoidDisarmRule,
    spendTemporaryIp: spendDigimonTemporaryIp,
    toggleOverwrite,
    useOmniscientHold
  };
}
