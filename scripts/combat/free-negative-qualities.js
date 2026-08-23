import {
  findQuality,
  getActorDerivedStat,
  getActorSv,
  getCombatId,
  getCombatRound,
  getQualityRank,
  hasQuality,
  normalizeKey,
  rollDerivedCheck
} from "../rules/quality-automation.js";
import { grantNonStackingTemporaryWounds } from "./temporary-wounds.js";

const SYSTEM_ID = "digimon-digital-adventures";
const STATE_PATH = "system.combat.freeNegativeQualities";

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (pt, en) => String(game?.i18n?.lang ?? "").toLowerCase().startsWith("pt") ? pt : en;

function isPrimaryGM() {
  const gm = (game.users?.contents ?? []).filter((user) => user.active && user.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
  return Boolean(game.user?.isGM && (!gm || gm.id === game.user.id));
}

function state(actor) {
  return foundry.utils.deepClone(actor?.system?.combat?.freeNegativeQualities ?? {});
}

function wounds(actor) {
  const path = actor?.type === "character" ? "system.derived.wounds" : "system.miscStats.wounds";
  const data = foundry.utils.getProperty(actor, path) ?? {};
  return { path, valuePath: `${path}.value`, tempPath: `${path}.temp.value`, value: Math.max(0, number(data.value)), max: Math.max(0, number(data.max)), temp: Math.max(0, number(data.temp?.value ?? data.temp)) };
}

async function post(actor, title, entries = []) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dda-chat-card dda-effect-card"><h2>${foundry.utils.escapeHTML(title)}</h2><ul class="dda-effect-list">${entries.map((entry) => `<li>${entry}</li>`).join("")}</ul></div>`
  });
}

async function startCombat(combat) {
  if (!isPrimaryGM()) return;
  const seen = new Set();
  for (const combatant of combat?.combatants ?? []) {
    const actor = combatant.actor;
    if (!actor || !["digimon", "npc"].includes(actor.type) || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    const next = state(actor);
    next.combatId = combat.id;
    next.belowHalfTriggered = false;
    next.mood = hasQuality(actor, "positiveReinforcement") ? 3 : null;
    next.boilingPointTnIncrease = 0;
    next.lastRoundProcessed = 0;
    await actor.update({ [STATE_PATH]: next });
  }
}

async function startRound(combat) {
  if (!isPrimaryGM()) return;
  const round = Math.max(0, number(combat?.round));
  const seen = new Set();
  for (const combatant of combat?.combatants ?? []) {
    const actor = combatant.actor;
    if (!actor || !["digimon", "npc"].includes(actor.type) || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    if (!hasQuality(actor, "violentOverwrite")) continue;
    const next = state(actor);
    if (next.lastRoundProcessed === round) continue;
    next.lastRoundProcessed = round;
    const roll = await new Roll("1d6").evaluate();
    const result = number(roll.total);
    const hp = wounds(actor);
    let line = text(`Resultado: <strong>${result}</strong>.`, `Result: <strong>${result}</strong>.`);
    const updates = { [STATE_PATH]: next };
    if (result === 1) {
      updates[hp.valuePath] = Math.max(0, hp.value - 2);
      line += ` ${text("Perde 2 Caixas de Ferimento.", "Loses 2 Wound Boxes.")}`;
    } else if (result === 2) {
      updates[hp.valuePath] = Math.min(hp.max, hp.value + 2);
      line += ` ${text("Recupera 2 Caixas de Ferimento.", "Recovers 2 Wound Boxes.")}`;
    }
    await actor.update(updates);
    await post(actor, findQuality(actor, "violentOverwrite")?.name ?? "Violent Overwrite", [line]);
  }
}

async function rollBoilingPoint(actor, next) {
  const resolve = Math.max(0, number(actor.system?.combat?.resolve?.value));
  const maximum = Math.max(0, number(actor.system?.combat?.resolve?.max));
  if (!maximum || resolve < maximum) return false;
  const dos = getActorDerivedStat(actor, "dos");
  const tn = Math.max(0, 15 - dos + Math.max(0, number(next.boilingPointTnIncrease)));
  const check = await rollDerivedCheck(actor, "cpu", {
    skillKey: "endurance",
    tn,
    title: findQuality(actor, "boilingPoint")?.name ?? "Boiling Point",
    createChat: false
  });
  if (!check) return false;
  const criticalSuccess = Boolean(check.criticalSuccess);
  const criticalFailure = Boolean(check.criticalFailure);
  const hp = wounds(actor);
  const updates = {};
  let outcome;
  if (check.success) {
    const increase = criticalSuccess ? Math.ceil(maximum / 2) : maximum;
    next.boilingPointTnIncrease = number(next.boilingPointTnIncrease) + increase;
    updates[STATE_PATH] = next;
    outcome = text(`${criticalSuccess ? "Sucesso Crítico" : "Sucesso"}: a NA aumenta em ${increase} até o fim do Combate.`, `${criticalSuccess ? "Critical Success" : "Success"}: TN increases by ${increase} until Combat ends.`);
  } else {
    const loss = criticalFailure ? resolve : Math.ceil(resolve / 2);
    updates[hp.valuePath] = Math.max(0, hp.value - loss);
    updates["system.combat.resolve.value"] = 0;
    outcome = text(`${criticalFailure ? "Falha Crítica" : "Falha"}: perde ${loss} Caixas e todo o Resolve.`, `${criticalFailure ? "Critical Failure" : "Failure"}: loses ${loss} Wound Boxes and all Resolve.`);
  }
  await actor.update(updates);
  await post(actor, findQuality(actor, "boilingPoint")?.name ?? "Boiling Point", [`${text("NA", "TN")}: <strong>${tn}</strong>. ${text("Resultado", "Result")}: <strong>${check.total}</strong>.`, outcome]);
  return true;
}

async function startTurn(combat) {
  if (!isPrimaryGM()) return;
  const actor = combat?.combatant?.actor;
  if (!actor || !["digimon", "npc"].includes(actor.type)) return;
  const next = state(actor);
  const tick = `${combat.id}:${combat.round}:${combat.turn}`;
  if (next.lastTurnStartTick === tick) return;
  next.lastTurnStartTick = tick;
  const updates = { [STATE_PATH]: next };
  const notes = [];
  if (hasQuality(actor, "faultyBattery") && number(actor.system?.resources?.battery?.value) === 3) {
    const hp = wounds(actor);
    const loss = getActorSv(actor) + 3;
    updates["system.resources.battery.value"] = 0;
    updates[hp.valuePath] = Math.max(0, hp.value - loss);
    notes.push(`${findQuality(actor, "faultyBattery")?.name}: ${text(`perde toda a Bateria e ${loss} Caixas.`, `loses all Battery and ${loss} Wound Boxes.`)}`);
  }
  await actor.update(updates);
  if (hasQuality(actor, "boilingPoint")) await rollBoilingPoint(actor, next);
  if (notes.length) await post(actor, text("Qualidades no início do turno", "Start-of-turn Qualities"), notes);
}

async function thresholdChanged(actor, changed) {
  if (!isPrimaryGM() || !["digimon", "npc"].includes(actor.type)) return;
  if (foundry.utils.hasProperty(changed, "system.stage") && hasQuality(actor, "inconsistentSize")) {
    const next = state(actor);
    const currentStage = String(actor.system?.stage ?? "");
    const defaultStage = String(actor.system?.evolution?.defaultStage ?? "");
    if (currentStage && currentStage !== defaultStage && next.inconsistentSizeStage !== currentStage) {
      const sizeRoll = await new Roll("1d6").evaluate();
      const result = number(sizeRoll.total);
      const rolledSize = result === 1 ? "small" : result <= 3 ? "medium" : result <= 5 ? "large" : "huge";
      next.inconsistentSizeOriginal = String(actor.system?.size ?? "medium");
      next.inconsistentSizeStage = currentStage;
      next.inconsistentSizeResult = result;
      await actor.update({ [STATE_PATH]: next, "system.size": rolledSize });
      await post(actor, findQuality(actor, "inconsistentSize")?.name ?? "Inconsistent Size", [text(`1d6 = ${result}: Tamanho ${rolledSize}.`, `1d6 = ${result}: ${rolledSize} Size.`)]);
    }
  }
  const changedWounds = foundry.utils.hasProperty(changed, "system.miscStats.wounds.value");
  if (!changedWounds) return;
  const hp = wounds(actor);
  const next = state(actor);
  if (next.combatId !== getCombatId() || next.belowHalfTriggered || hp.value <= 0 || hp.value >= hp.max / 2) return;
  if (!["vengefulCharge", "sealedWeapon", "awakenedInstinct"].some((key) => hasQuality(actor, key))) return;
  next.belowHalfTriggered = true;
  const updates = { [STATE_PATH]: next };
  const notes = [];
  if (hasQuality(actor, "vengefulCharge")) {
    updates["system.resources.battery.value"] = Math.min(number(actor.system?.resources?.battery?.max, 3), number(actor.system?.resources?.battery?.value) + 3);
    notes.push(text("Investida Vingativa concede 3 Bateria.", "Vengeful Charge grants 3 Battery."));
  }
  if (hasQuality(actor, "sealedWeapon")) notes.push(text("Arma Selada foi liberada até o fim do Combate.", "Sealed Weapon is unlocked until Combat ends."));
  let awakenedInstinctTemporaryWounds = 0;
  if (hasQuality(actor, "awakenedInstinct")) {
    awakenedInstinctTemporaryWounds = getQualityRank(findQuality(actor, "instinct")) * 2;
    notes.push(text(
      `Instinto Desperto oferece ${awakenedInstinctTemporaryWounds} Caixas Temporárias (fontes comuns não acumulam; vale a maior).`,
      `Awakened Instinct offers ${awakenedInstinctTemporaryWounds} Temporary Wound Boxes (normal sources do not stack; the higher source applies).`
    ));
  }
  await actor.update(updates);
  if (awakenedInstinctTemporaryWounds > 0) {
    await grantNonStackingTemporaryWounds(actor, awakenedInstinctTemporaryWounds, {
      sourceId: "awakenedInstinct",
      label: findQuality(actor, "awakenedInstinct")?.name ?? "Awakened Instinct",
      metadata: { triggeredCombatId: getCombatId() }
    });
  }
  await post(actor, text("Limite de Ferimentos atingido", "Wound threshold reached"), notes);
}

function slayerMatches(actor, defender) {
  const quality = findQuality(actor, "slayer");
  if (!quality || !defender) return false;
  const selected = [
    ...(quality.system?.choices?.selectedRanks ?? []),
    ...(quality.system?.choices?.selected ?? [])
  ].flatMap((choice) => [choice?.key, choice?.value, choice?.label, choice?.originalLabel]).map(normalizeKey).filter(Boolean);
  if (!selected.length) return false;
  const candidates = [
    defender.system?.family,
    defender.system?.digimonType,
    defender.system?.type,
    ...(defender.system?.families ?? []),
    ...(defender.system?.types ?? []),
    ...(defender.system?.qualityFeatures?.naturewalk?.elements ?? [])
  ].map(normalizeKey).filter(Boolean);
  return selected.some((entry) => candidates.includes(entry));
}

export function getFreeNegativeAttackContext(actor, attackItem, defender = null) {
  const next = state(actor);
  const weapon = (attackItem?.system?.qualityTags ?? []).map((tag) => String(tag).toLowerCase()).includes("weapon");
  return {
    sealedWeaponBlocked: weapon && hasQuality(actor, "sealedWeapon") && !next.belowHalfTriggered,
    awakenedInstinctLocked: hasQuality(actor, "awakenedInstinct") && !next.belowHalfTriggered,
    mood: hasQuality(actor, "positiveReinforcement") ? Math.min(6, Math.max(1, number(next.mood, 3))) : null,
    slayerApplies: slayerMatches(actor, defender),
    slayerAccuracyBonus: slayerMatches(actor, defender) ? getActorDerivedStat(actor, "dos") : 0
  };
}

export async function adjustPositiveReinforcementMood(actor, delta, reason = "") {
  if (!actor || !hasQuality(actor, "positiveReinforcement")) return null;
  const next = state(actor);
  const before = Math.min(6, Math.max(1, number(next.mood, 3)));
  next.mood = Math.min(6, Math.max(1, before + number(delta)));
  await actor.update({ [STATE_PATH]: next });
  return { before, after: next.mood, reason };
}

export async function useFreeNegativeQualityAction(actor, item) {
  if (!item || item.type !== "quality") return null;
  if (!hasQuality(actor, item.system?.sourceId ?? item.system?.originalName ?? item.name)) return null;
  const positive = findQuality(actor, "positiveReinforcement");
  if (positive?.id === item.id) {
    const next = state(actor);
    if (number(next.mood, 3) !== 1) {
      ui.notifications.info(text("O parceiro só pode animar o Digimon quando o Humor estiver em 1.", "The partner can only cheer the Digimon when Mood is 1."));
      return { handled: true };
    }
    const tamerUuid = String(actor.system?.tamer?.uuid ?? "");
    const tamer = tamerUuid ? await fromUuid(tamerUuid).catch(() => null) : null;
    if (!tamer) {
      ui.notifications.warn(text("Nenhum parceiro humano vinculado foi encontrado.", "No linked Human Partner was found."));
      return { handled: true };
    }
    const actions = Math.max(0, number(tamer.system?.combat?.actions?.value));
    if (actions < 2) {
      ui.notifications.warn(text("O parceiro humano precisa de 2 Ações.", "The Human Partner needs 2 Actions."));
      return { handled: true };
    }
    next.mood = 4;
    await tamer.update({ "system.combat.actions.value": actions - 2 });
    await actor.update({ [STATE_PATH]: next });
    await post(actor, positive.name, [text(`${tamer.name} gastou 2 Ações: Humor 1 → 4.`, `${tamer.name} spent 2 Actions: Mood 1 → 4.`)]);
    return { handled: true };
  }
  const known = Object.keys({
    memoryUpgrade: 1, mercifulMode: 1, slayer: 1, violentOverwrite: 1, criticalArms: 1, luckyMiss: 1,
    innateTalent: 1, vengefulCharge: 1, justiceIsBlind: 1, inconsistentSize: 1, sealedWeapon: 1,
    awakenedInstinct: 1, bulky: 1, lowVitality: 1, complexSignature: 1, faultyBattery: 1,
    vulnerable: 1, fumbledPiercing: 1, weakenedStrike: 1, indiscriminateTargeting: 1,
    underwhelming: 1, broadside: 1, illness: 1, systemError: 1, naturalWeakness: 1,
    exploitableProgram: 1, boilingPoint: 1
  }).find((key) => findQuality(actor, key)?.id === item.id);
  if (!known) return null;
  ui.notifications.info(text(`${item.name} é aplicada automaticamente quando sua condição ocorre.`, `${item.name} is applied automatically when its condition occurs.`));
  return { handled: true };
}

async function cleanup(combat) {
  if (!isPrimaryGM()) return;
  const seen = new Set();
  for (const combatant of combat?.combatants ?? []) {
    const actor = combatant.actor;
    if (!actor || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    const next = state(actor);
    const updates = { [STATE_PATH]: {} };
    if (next.inconsistentSizeOriginal) updates["system.size"] = next.inconsistentSizeOriginal;
    await actor.update(updates);
  }
}

export function registerFreeNegativeQualities() {
  Hooks.on("combatStart", (combat) => void startCombat(combat));
  Hooks.on("createCombatant", (combatant) => combatant.parent?.started && void startCombat(combatant.parent));
  Hooks.on("updateCombat", (combat, changed) => {
    if (!combat?.started || (!Object.hasOwn(changed, "round") && !Object.hasOwn(changed, "turn"))) return;
    if (Object.hasOwn(changed, "round")) void startRound(combat);
    void startTurn(combat);
  });
  Hooks.on("updateActor", (actor, changed) => void thresholdChanged(actor, changed));
  Hooks.on("combatEnd", (combat) => void cleanup(combat));
  Hooks.on("deleteCombat", (combat) => void cleanup(combat));
  game.dda ??= {};
  game.dda.freeNegativeQualities = { getAttackContext: getFreeNegativeAttackContext, adjustMood: adjustPositiveReinforcementMood, useQuality: useFreeNegativeQualityAction };
}
