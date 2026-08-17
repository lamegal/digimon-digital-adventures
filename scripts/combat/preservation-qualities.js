import {
  findQuality,
  getCombatId,
  getCombatRound,
  getCombatTurn,
  hasQuality,
  normalizeKey
} from "../rules/quality-automation.js";

import { spendActorActions } from "./action-economy.js";
import { getSecondWindGainForceRules } from "./digizoid-gain-force.js";

const STATE_PATH = "system.combat.preservationQualities";
const text = (pt, en) => String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? en : pt;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const escapeHtml = (value = "") => foundry.utils.escapeHTML(String(value ?? ""));

function isPrimaryActiveGM() {
  const primary = (game?.users?.contents ?? [])
    .filter((user) => user.active && user.isGM)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
  return Boolean(primary && primary.id === game.user?.id);
}

function qualityKey(item) {
  return normalizeKey(item?.system?.sourceId ?? item?.system?.id ?? item?.system?.originalName ?? item?.name ?? "");
}

function getState(actor) {
  return foundry.utils.deepClone(actor?.system?.combat?.preservationQualities ?? {});
}

async function updateState(actor, state) {
  await actor.update({ [STATE_PATH]: state });
}

function turnKey(actor) {
  return `${getCombatId()}:${getCombatRound()}:${getCombatTurn()}:${actor?.uuid ?? ""}`;
}

function woundPaths(actor) {
  return actor?.type === "character"
    ? { value: "system.derived.wounds.value", max: "system.derived.wounds.max" }
    : { value: "system.miscStats.wounds.value", max: "system.miscStats.wounds.max" };
}

async function healWounds(actor, amount) {
  const paths = woundPaths(actor);
  const current = Math.max(0, number(foundry.utils.getProperty(actor, paths.value)));
  const maximum = Math.max(0, number(foundry.utils.getProperty(actor, paths.max)));
  const requested = Math.max(0, number(amount));
  const healed = Math.max(0, Math.min(maximum, current + requested) - current);
  if (healed > 0) await actor.update({ [paths.value]: current + healed });
  return healed;
}

export function canAttackAfterSecondWind(actor) {
  if (getSecondWindGainForceRules(actor).canAttackSameTurn) return true;
  const state = getState(actor);
  return state.secondWind?.attackBlockedTurnKey !== turnKey(actor);
}

export function getSecondWindRecoveryBonus(actor) {
  const state = getState(actor);
  return Math.max(0, number(state.secondWind?.endCombatRecoveryBonus));
}

export async function consumeSecondWindRecoveryBonus(actor) {
  const state = getState(actor);
  const bonus = Math.max(0, number(state.secondWind?.endCombatRecoveryBonus));
  if (bonus <= 0) return 0;
  state.secondWind.endCombatRecoveryBonus = 0;
  state.secondWind.bonusConsumedAt = new Date().toISOString();
  await updateState(actor, state);
  return bonus;
}

async function useSecondWind(actor, item) {
  if (!game?.combat?.started) {
    ui.notifications.warn(text("Segundo Fôlego só pode ser usado durante um Combate.", "Second Wind can only be used during Combat."));
    return null;
  }
  const state = getState(actor);
  const gainForce = getSecondWindGainForceRules(actor);
  const sameCombat = state.secondWind?.usedCombatId === getCombatId();
  const usedCount = sameCombat ? Math.max(0, number(state.secondWind?.usedCount, 1)) : 0;
  let preserveUse = false;
  if (gainForce.pureOverwriteAlternative) {
    preserveUse = usedCount >= gainForce.maximumUses || await foundry.applications.api.DialogV2.confirm({
      classes: ["dda", "dda-preservation-quality-window"],
      window: { title: text("Overwrite Puro — Segundo Fôlego", "Pure Overwrite — Second Wind") },
      content: `<div class="dda-confirm-dialog"><p>${text("Gastar 1 Ação adicional para não consumir um uso de Segundo Fôlego?", "Spend 1 additional Action so this does not consume a Second Wind use?")}</p></div>`,
      yes: { label: text("Gastar 2 Ações", "Spend 2 Actions") },
      no: { label: text("Consumir uso", "Consume use") },
      rejectClose: false,
      modal: true
    });
  }
  if (!preserveUse && usedCount >= gainForce.maximumUses) {
    ui.notifications.warn(text("Segundo Fôlego já foi usado neste Combate.", "Second Wind has already been used this Combat."));
    return null;
  }
  if (!(await spendActorActions(actor, preserveUse ? 2 : 1, { requireActiveUnit: true }))) return null;
  const { rollPool } = await import("../rolls/pool-roll.js");
  const result = await rollPool(actor, "health", {
    externalLabel: text("Segundo Fôlego — Recuperação em Combate", "Second Wind — Combat Recovery")
  });
  if (!result) return null;
  const successes = Math.max(0, number(result.totalSuccesses));
  const healed = await healWounds(actor, successes);
  state.secondWind = {
    ...(state.secondWind ?? {}),
    usedCombatId: getCombatId(),
    usedCount: preserveUse ? usedCount : usedCount + 1,
    attackBlockedTurnKey: gainForce.canAttackSameTurn ? "" : turnKey(actor),
    recoverySuccesses: successes,
    healed,
    usedAt: new Date().toISOString(),
    endCombatRecoveryBonus: 0
  };
  await updateState(actor, state);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dda-chat-card dda-effect-card effect-positive dda-preservation-quality-card"><h2>${escapeHtml(item.name)}</h2><ul class="dda-effect-list"><li>${text("Sucessos de Recuperação", "Recovery Successes")}: <strong>${successes}</strong>.</li><li>${text("Caixas recuperadas", "Wound Boxes recovered")}: <strong>${healed}</strong>.</li><li>${gainForce.canAttackSameTurn ? text("inForce Imortal permite atacar nesta ativação.", "Undying inForce allows an Attack this turn.") : text("Não pode usar Ação de Ataque nesta ativação.", "Cannot take an Attack Action this turn.")}</li>${preserveUse ? `<li>${text("Overwrite Puro preservou o uso por +1 Ação.", "Pure Overwrite preserved the use for +1 Action.")}</li>` : ""}</ul></div>`
  });
  return { successes, healed };
}

export async function requestFocusedResistance({ defender, attacker = null, attackItem = null, effectTags = [] } = {}) {
  if (!defender || !effectTags.length || !hasQuality(defender, "focusedResistance")) {
    return { used: false, multiplier: 1, canNegate: Boolean(defender.system?.qualityFeatures?.preservation?.immunity) };
  }
  const actions = Math.max(0, number(defender.system?.combat?.actions?.value));
  if (actions < 1) return { used: false, multiplier: 1, canNegate: Boolean(defender.system?.qualityFeatures?.preservation?.immunity) };
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-preservation-quality-window"],
    window: { title: text("Resistência Focada", "Focused Resistance") },
    content: `<div class="dda-confirm-dialog dda-preservation-quality-dialog"><p>${text(
      `<strong>${escapeHtml(defender.name)}</strong> será submetido a ${effectTags.map((tag) => `<strong>[${escapeHtml(String(tag).toUpperCase())}]</strong>`).join(", ")}. Gastar 1 Ação de Interrupção para dobrar a Resistência?`,
      `<strong>${escapeHtml(defender.name)}</strong> will be subjected to ${effectTags.map((tag) => `<strong>[${escapeHtml(String(tag).toUpperCase())}]</strong>`).join(", ")}. Spend 1 Interrupt Action to double Resistance?`
    )}</p>${attacker ? `<p>${text("Origem", "Source")}: <strong>${escapeHtml(attacker.name)}</strong>${attackItem ? ` — ${escapeHtml(attackItem.name)}` : ""}.</p>` : ""}</div>`,
    yes: { label: text("Dobrar Resistência", "Double Resistance") },
    no: { label: text("Não usar", "Do not use") },
    rejectClose: false,
    modal: true
  });
  if (!confirmed) return { used: false, multiplier: 1, canNegate: Boolean(defender.system?.qualityFeatures?.preservation?.immunity) };
  const paid = await spendActorActions(defender, 1, { requireActiveUnit: false });
  if (!paid) return { used: false, multiplier: 1, canNegate: Boolean(defender.system?.qualityFeatures?.preservation?.immunity) };
  return {
    used: true,
    multiplier: 2,
    canNegate: Boolean(defender.system?.qualityFeatures?.preservation?.immunity),
    quality: findQuality(defender, "focusedResistance")
  };
}

export function getImmunityResistBonus(actor) {
  return Boolean(actor.system?.qualityFeatures?.preservation?.immunity) ? 1 : 0;
}

export function shouldNegateFallCrashDamage(actor, options = {}) {
  const source = normalizeKey(options?.crashSource ?? options?.damageSource ?? options?.damageLabel ?? "");
  const isFall = ["fall", "falling", "queda", "danoqueda"].some((key) => source.includes(normalizeKey(key)));
  if (!isFall) return false;
  const hasTumbler = hasQuality(actor, "tumbler");
  const jump = actor?.system?.qualityFeatures?.advancedMobility?.jump ?? {};
  return Boolean(hasTumbler && jump.fallDamageNegatedWithTumbler);
}

async function markSecondWindCombatEnd(combat) {
  if (!isPrimaryActiveGM()) return;
  const seen = new Set();
  for (const combatant of combat?.combatants?.contents ?? []) {
    const actor = combatant.actor;
    if (!actor || seen.has(actor.uuid) || !hasQuality(actor, "secondWind")) continue;
    seen.add(actor.uuid);
    const state = getState(actor);
    const used = state.secondWind?.usedCombatId === combat.id;
    state.secondWind = {
      ...(state.secondWind ?? {}),
      endCombatRecoveryBonus: used ? 0 : 3,
      endedCombatId: combat.id,
      attackBlockedTurnKey: ""
    };
    await updateState(actor, state);
  }
}

export async function usePreservationQualityAction(actor, item) {
  const key = qualityKey(item);
  if (["segundofolego", "secondwind"].includes(key)) {
    await useSecondWind(actor, item);
    return { handled: true, key };
  }
  const automatic = new Set([
    "mestredamatilha", "packmaster", "energiavital", "vitalenergy", "acrobata", "tumbler",
    "resistenciafocada", "focusedresistance", "imunidade", "immunity"
  ]);
  if (!automatic.has(key)) return null;
  const messages = {
    mestredamatilha: text("Mestre da Matilha é oferecido automaticamente quando um aliado adjacente puder Interceder.", "Pack Master is offered automatically when an adjacent ally can Intercede."),
    packmaster: text("Mestre da Matilha é oferecido automaticamente quando um aliado adjacente puder Interceder.", "Pack Master is offered automatically when an adjacent ally can Intercede."),
    energiavital: text("Energia Vital é oferecida automaticamente quando a Pool de Saúde possui resultados elegíveis para rerrolagem.", "Vital Energy is offered automatically when the Health Pool has eligible reroll results."),
    vitalenergy: text("Energia Vital é oferecida automaticamente quando a Pool de Saúde possui resultados elegíveis para rerrolagem.", "Vital Energy is offered automatically when the Health Pool has eligible reroll results."),
    resistenciafocada: text("Resistência Focada é oferecida automaticamente antes de um Efeito de Ataque ser aplicado.", "Focused Resistance is offered automatically before an Attack Effect is applied."),
    focusedresistance: text("Resistência Focada é oferecida automaticamente antes de um Efeito de Ataque ser aplicado.", "Focused Resistance is offered automatically before an Attack Effect is applied."),
    imunidade: text("Imunidade permite que Resistência reduza Potência abaixo de 2 e melhora a Ação Resistir.", "Immunity lets Resistance reduce Potency below 2 and improves the Resist Action."),
    immunity: text("Imunidade permite que Resistência reduza Potência abaixo de 2 e melhora a Ação Resistir.", "Immunity lets Resistance reduce Potency below 2 and improves the Resist Action.")
  };
  ui.notifications.info(messages[key] ?? text(`${item.name} é uma Qualidade passiva.`, `${item.name} is a passive Quality.`));
  return { handled: true, key };
}

export function registerPreservationQualities() {
  Hooks.on("combatEnd", (combat) => { void markSecondWindCombatEnd(combat); });
  Hooks.on("deleteCombat", (combat) => { void markSecondWindCombatEnd(combat); });
  game.dda ??= {};
  game.dda.preservationQualities = {
    useQuality: usePreservationQualityAction,
    requestFocusedResistance,
    canAttackAfterSecondWind,
    getSecondWindRecoveryBonus,
    consumeSecondWindRecoveryBonus,
    getImmunityResistBonus,
    shouldNegateFallCrashDamage
  };
}
