import {
  areActorsAllies,
  areActorsAlliesForQualities,
  findQuality,
  getActorDerivedStat,
  getActorSv,
  getCombatId,
  getCombatRound,
  getCombatTurn,
  getQualityRank,
  hasQuality,
  normalizeKey,
  rollDerivedCheck
} from "../rules/quality-automation.js";

import {
  spendActorActions
} from "./action-economy.js";

const SYSTEM_ID = "digimon-digital-adventures";
const STATE_PATH = "system.combat.defensiveQualities";
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const pendingRequests = new Map();

const text = (pt, en) => String(game?.i18n?.lang ?? "")
  .toLowerCase()
  .startsWith("en")
  ? en
  : pt;

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, minimum, maximum) => Math.min(
  maximum,
  Math.max(minimum, number(value))
);

const escapeHtml = (value = "") => foundry.utils.escapeHTML(String(value ?? ""));

function actorWoundPaths(actor) {
  if (actor?.type === "character") {
    return {
      value: "system.derived.wounds.value",
      max: "system.derived.wounds.max",
      temp: "system.derived.wounds.temp.value"
    };
  }

  return {
    value: "system.miscStats.wounds.value",
    max: "system.miscStats.wounds.max",
    temp: "system.miscStats.wounds.temp.value"
  };
}

function getWoundState(actor) {
  const paths = actorWoundPaths(actor);
  return {
    paths,
    value: Math.max(0, number(foundry.utils.getProperty(actor, paths.value))),
    max: Math.max(0, number(foundry.utils.getProperty(actor, paths.max))),
    temp: Math.max(0, number(foundry.utils.getProperty(actor, paths.temp)))
  };
}

function effectTagKey(effect = {}) {
  return normalizeKey(String(effect?.tag ?? "").replace(/^\[|\]$/g, ""));
}

async function addTemporaryWoundsRespectingDoom(actor, amount, sourceName = "") {
  let remaining = Math.max(0, number(amount));
  if (!actor || remaining <= 0) return { requested: remaining, gained: 0, doomAbsorbed: 0 };

  const effects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
  const doomIndex = effects.findIndex((effect) => effectTagKey(effect) === "doom");
  let doomAbsorbed = 0;

  if (doomIndex >= 0) {
    const doom = effects[doomIndex];
    const doomValue = Math.max(0, number(doom.value ?? doom.potency));
    doomAbsorbed = Math.min(doomValue, remaining);
    remaining -= doomAbsorbed;
    const nextDoom = doomValue - doomAbsorbed;
    if (nextDoom <= 0) effects.splice(doomIndex, 1);
    else effects[doomIndex] = { ...doom, value: nextDoom, potency: nextDoom };
  }

  const wounds = getWoundState(actor);
  const updates = {};
  if (remaining > 0) {
    updates[wounds.paths.temp] = wounds.temp + remaining;
    const sourcePath = wounds.paths.temp.replace(/\.value$/, ".source");
    const durationPath = wounds.paths.temp.replace(/\.value$/, ".duration");
    updates[sourcePath] = sourceName;
    updates[durationPath] = "combat";
  }
  if (doomIndex >= 0) updates["system.effects.active"] = effects;
  if (Object.keys(updates).length) await actor.update(updates);

  return {
    requested: Math.max(0, number(amount)),
    gained: remaining,
    doomAbsorbed
  };
}

function getState(actor) {
  return foundry.utils.deepClone(actor?.system?.combat?.defensiveQualities ?? {});
}

async function updateState(actor, state) {
  await actor.update({ [STATE_PATH]: state });
}

function qualityId(item) {
  return normalizeKey(
    item?.system?.sourceId ??
    item?.system?.id ??
    item?.system?.originalName ??
    item?.name ??
    ""
  );
}

function qualityMatches(item, aliases = []) {
  const key = qualityId(item);
  return aliases.map(normalizeKey).includes(key);
}

function hasDefensiveQuality(actor, aliases = []) {
  return Boolean(actor?.items?.some((item) => item.type === "quality" && qualityMatches(item, aliases)));
}

function findDefensiveQuality(actor, aliases = []) {
  return actor?.items?.find((item) => item.type === "quality" && qualityMatches(item, aliases)) ?? null;
}

function currentCombatSignature() {
  return `${getCombatId()}:${getCombatRound()}:${getCombatTurn()}`;
}

function getPrimaryActiveGM() {
  return Array.from(game?.users ?? [])
    .filter((user) => user?.isGM && user?.active)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
}

function isPrimaryActiveGM() {
  return Boolean(
    game?.user?.isGM &&
    getPrimaryActiveGM()?.id === game.user.id
  );
}

function resolveResponsibleUser(actor) {
  const users = (game?.users?.contents ?? []).filter((user) => user.active);
  const charmIds = game?.dda?.bossQualities?.getCharmAuthorizedUserIds?.(actor, { includeGMs: false });
  const owners = (Array.isArray(charmIds)
    ? users.filter((user) => !user.isGM && charmIds.includes(String(user.id)))
    : users
      .filter((user) => !user.isGM)
      .filter((user) => actor?.testUserPermission?.(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  if (owners.length) return owners[0];
  return users
    .filter((user) => user.isGM)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
}

async function resolveActor(uuid) {
  if (!uuid) return null;
  try {
    const document = await fromUuid(uuid);
    return document?.documentName === "Actor" ? document : document?.actor ?? null;
  } catch (_error) {
    return null;
  }
}

async function createQualityCard(actor, title, details = [], className = "dda-defensive-quality-card") {
  const list = details.length
    ? `<ul class="dda-effect-list">${details.map((entry) => `<li>${entry}</li>`).join("")}</ul>`
    : "";

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dda-chat-card dda-effect-card effect-special ${className}">
      <h2>${escapeHtml(title)}</h2>
      ${list}
    </div>`
  });
}

async function confirmV2({ title, content, yesLabel, noLabel } = {}) {
  return Boolean(await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-area-attack-dialog", "dda-defensive-quality-window"],
    window: { title },
    content: `<div class="dda-confirm-dialog dda-defensive-quality-dialog">${content}</div>`,
    yes: { label: yesLabel ?? text("Usar", "Use") },
    no: { label: noLabel ?? text("Ignorar", "Ignore") },
    rejectClose: false,
    modal: true
  }));
}

async function promptNumberV2({ title, label, value = 0, min = 0, max = 99 } = {}) {
  const result = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-area-attack-dialog", "dda-defensive-quality-window"],
    window: { title },
    content: `<form class="dda-roll-dialog dda-defensive-quality-dialog">
      <div class="form-group">
        <label>${escapeHtml(label)}</label>
        <input type="number" name="value" value="${number(value)}" min="${number(min)}" max="${number(max)}" step="1">
      </div>
    </form>`,
    ok: {
      label: text("Confirmar", "Confirm"),
      callback: (_event, button) => number(button.form.elements.value?.value, value)
    },
    rejectClose: false,
    modal: true
  });

  return result === null || result === undefined
    ? null
    : clamp(result, min, max);
}

async function requestOwnedResolution(type, defender, payload = {}) {
  const responsible = resolveResponsibleUser(defender);
  if (!responsible || responsible.id === game.user?.id) {
    return executeOwnedResolution(type, defender, payload);
  }

  const requestId = foundry.utils.randomID();
  const promise = new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve({ used: false, timedOut: true });
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(requestId, { resolve, timeout });
  });

  game.socket.emit(`system.${SYSTEM_ID}`, {
    action: "defensiveQualityRequest",
    requestId,
    requesterUserId: game.user?.id,
    responsibleUserId: responsible.id,
    type,
    defenderUuid: defender.uuid,
    payload
  });

  return promise;
}

async function handleSocket(data = {}) {
  if (data.action === "defensiveQualityResponse") {
    if (String(data.requesterUserId ?? "") !== String(game.user?.id ?? "")) return;
    const pending = pendingRequests.get(data.requestId);
    if (!pending) return;
    window.clearTimeout(pending.timeout);
    pendingRequests.delete(data.requestId);
    pending.resolve(data.result ?? { used: false });
    return;
  }

  if (data.action !== "defensiveQualityRequest") return;
  if (String(data.responsibleUserId ?? "") !== String(game.user?.id ?? "")) return;

  const defender = await resolveActor(data.defenderUuid);
  const result = defender
    ? await executeOwnedResolution(data.type, defender, data.payload ?? {})
    : { used: false, missingActor: true };

  game.socket.emit(`system.${SYSTEM_ID}`, {
    action: "defensiveQualityResponse",
    requestId: data.requestId,
    requesterUserId: data.requesterUserId,
    result
  });
}

export function getCombatMonsterResolveMax(actor) {
  if (!hasQuality(actor, "combatMonster") && !hasDefensiveQuality(actor, ["monstroDeCombate", "combatMonster"])) return 0;
  return hasQuality(actor, "berserker") || hasDefensiveQuality(actor, ["berserker"])
    ? 6
    : 4;
}

export function getCombatMonsterResolve(actor) {
  const maximum = getCombatMonsterResolveMax(actor);
  if (maximum <= 0) return 0;

  return clamp(
    Math.max(
      number(actor.system?.resources?.resolve?.value),
      number(actor.system?.combat?.qualityAttackUses?.combatMonster?.resolve)
    ),
    0,
    maximum
  );
}

export async function setCombatMonsterResolve(actor, value, { reset = false } = {}) {
  const maximum = getCombatMonsterResolveMax(actor);
  const next = maximum > 0 ? clamp(value, 0, maximum) : 0;
  const qualityAttackUses = foundry.utils.deepClone(actor?.system?.combat?.qualityAttackUses ?? {});
  qualityAttackUses.combatMonster ??= {};
  qualityAttackUses.combatMonster = {
    ...qualityAttackUses.combatMonster,
    resolve: next,
    combatId: reset ? "" : getCombatId(),
    round: reset ? 0 : getCombatRound(),
    turn: reset ? -1 : getCombatTurn()
  };

  await actor.update({
    "system.resources.resolve.enabled": maximum > 0,
    "system.resources.resolve.value": next,
    "system.resources.resolve.max": maximum,
    "system.combat.qualityAttackUses": qualityAttackUses
  });

  return next;
}

export async function addCombatMonsterResolve(actor, amount, {
  attacker = null,
  sourceKind = "attack"
} = {}) {
  const gainedFromWounds = Math.max(0, number(amount));
  if (gainedFromWounds <= 0 || getCombatMonsterResolveMax(actor) <= 0) return null;

  const isOwnQuality = sourceKind === "selfQuality";
  const validEnemyDamage = sourceKind === "attack" && attacker && !areActorsAlliesForQualities(actor, attacker);
  if (!isOwnQuality && !validEnemyDamage) return null;

  const before = getCombatMonsterResolve(actor);
  const after = await setCombatMonsterResolve(actor, before + gainedFromWounds);

  return {
    qualityName: findQuality(actor, "combatMonster")?.name ?? text("Monstro de Combate", "Combat Monster"),
    before,
    after,
    gained: Math.max(0, after - before),
    healthDamage: gainedFromWounds
  };
}

export async function applyCombatMonsterResolveFromDamage({
  actor,
  healthDamage,
  attacker = null,
  sourceKind = "attack"
} = {}) {
  return addCombatMonsterResolve(actor, healthDamage, { attacker, sourceKind });
}

export async function applyCombatMonsterResolveFromEffectDamage({
  actor,
  entries = [],
  healthDamage = 0
} = {}) {
  let remainingDamage = Math.max(0, number(healthDamage));
  if (!actor || remainingDamage <= 0 || getCombatMonsterResolveMax(actor) <= 0) return null;

  let enemyDamage = 0;
  let firstEnemy = null;

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (remainingDamage <= 0) break;
    if (String(entry?.type ?? "") !== "damage") continue;

    const appliedDamage = Math.min(
      remainingDamage,
      Math.max(0, number(entry?.bossTemplatePool?.applied ?? entry?.amount))
    );
    remainingDamage -= appliedDamage;
    if (appliedDamage <= 0) continue;

    const source = await resolveActor(entry?.sourceActorUuid);
    if (!source || source.uuid === actor.uuid || areActorsAlliesForQualities(actor, source)) continue;

    firstEnemy ??= source;
    enemyDamage += appliedDamage;
  }

  if (!firstEnemy || enemyDamage <= 0) return null;
  return addCombatMonsterResolve(actor, enemyDamage, {
    attacker: firstEnemy,
    sourceKind: "attack"
  });
}

async function payDefensiveInterrupt(actor, reason) {
  if (!game?.combat?.started) {
    return { success: true, cost: 0, payer: "none" };
  }

  const combatId = String(getCombatId() ?? "");
  const warden = actor.system?.qualityFeatures?.dataOptimization ?? {};
  const intercedeUsage = actor.system?.combat?.intercedeUsage ?? {};
  const canUseWarden = Boolean(
    warden.warden &&
    number(warden.wardenInterruptActionDiscount) >= 1 &&
    String(intercedeUsage.wardenCombatId ?? "") !== combatId
  );

  if (canUseWarden) {
    await actor.update({ "system.combat.intercedeUsage.wardenCombatId": combatId });
    return { success: true, cost: 0, payer: "warden" };
  }

  const payment = await spendActorActions(actor, 1, {
    requireActiveUnit: false,
    notify: true
  });

  return payment ? { ...payment, success: true, payer: "actor", reason } : null;
}

async function executeSubstitute(defender, payload = {}) {
  const quality = findQuality(defender, "substitute") ?? findDefensiveQuality(defender, ["substituir", "substituto", "substitute"]);
  if (!quality || payload.suppressInterrupts || payload.inClash) return { used: false };

  const state = getState(defender);
  if (String(state.substitute?.lockedCombatId ?? "") === String(getCombatId() ?? "")) {
    return { used: false, locked: true };
  }

  const wounds = getWoundState(defender);
  const normalCost = Math.max(1, number(getActorSv(defender)) + 1);
  if (wounds.value <= 1 || wounds.value - normalCost < 1) {
    return { used: false, insufficientWounds: true };
  }

  const confirmed = await confirmV2({
    title: quality.name,
    content: `<p>${text(
      `<strong>${escapeHtml(payload.attackerName ?? "")}</strong> acertou ${escapeHtml(defender.name)}. Criar um substituto antes do dano?`,
      `<strong>${escapeHtml(payload.attackerName ?? "")}</strong> hit ${escapeHtml(defender.name)}. Create a Substitute before damage?`
    )}</p><p><small>${text(
      "A perda ignora Caixas Temporárias e não pode reduzir o Digimon a 0.",
      "The forfeiture ignores Temporary Wound Boxes and cannot reduce the Digimon to 0."
    )}</small></p>`,
    yesLabel: text("Usar Substituto", "Use Substitute")
  });
  if (!confirmed) return { used: false };

  const tnIncrease = Math.max(0, number(state.substitute?.tnIncrease));
  const tn = 10 + Math.max(0, number(payload.attackerBit)) + tnIncrease;
  const check = await rollDerivedCheck(defender, "ram", {
    skillKey: "evasion",
    tn,
    title: quality.name
  });
  if (!check) return { used: false };

  state.substitute ??= {};
  state.substitute.tnIncrease = tnIncrease + 3;
  state.substitute.combatId = getCombatId();
  state.substitute.lastUsedRound = getCombatRound();
  state.substitute.lastUsedTurn = getCombatTurn();

  if (check.criticalFailure) {
    state.substitute.lockedCombatId = getCombatId();
    await updateState(defender, state);
    return { used: true, success: false, criticalFailure: true, tn };
  }

  if (!check.success) {
    await updateState(defender, state);
    return { used: true, success: false, tn };
  }

  const cost = check.criticalSuccess
    ? Math.max(1, Math.ceil(normalCost / 2))
    : normalCost;

  if (wounds.value - cost < 1) {
    await updateState(defender, state);
    return { used: true, success: false, insufficientWounds: true, tn };
  }

  const nextWounds = wounds.value - cost;
  await defender.update({
    [wounds.paths.value]: nextWounds,
    "system.combat.defeated": false,
    [STATE_PATH]: state
  });
  const resolve = await addCombatMonsterResolve(defender, cost, { sourceKind: "selfQuality" });

  await createQualityCard(defender, quality.name, [
    text(
      `Teste contra TN <strong>${tn}</strong>: sucesso${check.criticalSuccess ? " crítico" : ""}.`,
      `Check against TN <strong>${tn}</strong>: ${check.criticalSuccess ? "critical " : ""}success.`
    ),
    text(
      `Caixas de Ferimento verdadeiras perdidas: <strong>${cost}</strong>.`,
      `True Wound Boxes forfeited: <strong>${cost}</strong>.`
    ),
    text(
      "O Ataque continua contando como bem-sucedido, mas seu dano e seus efeitos foram desviados.",
      "The Attack still counts as successful, but its damage and effects were diverted."
    )
  ]);

  return {
    used: true,
    success: true,
    criticalSuccess: Boolean(check.criticalSuccess),
    cost,
    tn,
    resolveGained: resolve?.gained ?? 0
  };
}

async function executeBrace(defender, payload = {}) {
  const quality = findQuality(defender, "brace") ?? findDefensiveQuality(defender, ["preparar", "brace"]);
  const incomingDamage = Math.max(0, number(payload.normalDamage));
  if (!quality || incomingDamage <= 0 || payload.suppressInterrupts) return { used: false };

  const confirmed = await confirmV2({
    title: quality.name,
    content: `<p>${text(
      `Usar uma Ação de Interrupção para tentar reduzir <strong>${incomingDamage}</strong> de Dano após Armadura?`,
      `Use an Interrupt Action to try to reduce <strong>${incomingDamage}</strong> Damage after Armor?`
    )}</p>`,
    yesLabel: text("Usar Preparar", "Use Brace")
  });
  if (!confirmed) return { used: false };

  const payment = await payDefensiveInterrupt(defender, quality.name);
  if (!payment) return { used: false, unpaid: true };

  const state = getState(defender);
  const tnIncrease = Math.max(0, number(state.brace?.tnIncrease));
  const intercedeIncrease = payload.interceded ? 3 : 0;
  const tn = 10 + incomingDamage + tnIncrease + intercedeIncrease;
  const check = await rollDerivedCheck(defender, "cpu", {
    skillKey: "endurance",
    tn,
    title: quality.name
  });
  if (!check) return { used: false, payment };

  state.brace ??= {};
  state.brace.tnIncrease = tnIncrease + 3;
  state.brace.combatId = getCombatId();
  state.brace.lastUsedRound = getCombatRound();
  state.brace.lastUsedTurn = getCombatTurn();
  await updateState(defender, state);

  let adjustedDamage = incomingDamage;
  if (check.criticalFailure) adjustedDamage += 1;
  else if (check.success) {
    adjustedDamage = Math.ceil(incomingDamage / 2);
    if (check.criticalSuccess && adjustedDamage === 1) adjustedDamage = 0;
  }

  return {
    used: true,
    success: Boolean(check.success),
    criticalSuccess: Boolean(check.criticalSuccess),
    criticalFailure: Boolean(check.criticalFailure),
    incomingDamage,
    adjustedDamage,
    tn,
    payment
  };
}

async function executeOwnedResolution(type, defender, payload) {
  if (type === "substitute") return executeSubstitute(defender, payload);
  if (type === "brace") return executeBrace(defender, payload);
  return { used: false, unknownType: true };
}

export async function requestSubstitute({
  attacker,
  defender,
  suppressInterrupts = false,
  inClash = false
} = {}) {
  if (!attacker || !defender) return { used: false };
  return requestOwnedResolution("substitute", defender, {
    attackerUuid: attacker.uuid,
    attackerName: attacker.name,
    attackerBit: getActorDerivedStat(attacker, "bit"),
    suppressInterrupts,
    inClash
  });
}

export async function requestBrace({
  attacker,
  defender,
  normalDamage,
  interceded = false,
  suppressInterrupts = false
} = {}) {
  if (!defender) return { used: false };
  return requestOwnedResolution("brace", defender, {
    attackerUuid: attacker?.uuid ?? "",
    attackerName: attacker?.name ?? "",
    normalDamage,
    interceded,
    suppressInterrupts
  });
}

export async function triggerSavagery(attacker, { notes = [] } = {}) {
  const quality = findQuality(attacker, "savagery") ?? findDefensiveQuality(attacker, ["selvageria", "savagery"]);
  if (!quality) return { used: false };

  const state = getState(attacker);
  if (Boolean(state.savagery?.usedSinceLastTurn)) return { used: false, alreadyUsed: true };
  if (String(state.savagery?.lockedCombatId ?? "") === String(getCombatId() ?? "")) return { used: false, locked: true };

  const maximumResolve = getCombatMonsterResolveMax(attacker);
  const selfDamage = Math.ceil(maximumResolve / 2);
  const wounds = getWoundState(attacker);
  if (maximumResolve <= 0 || wounds.value - selfDamage < 1) return { used: false, insufficientWounds: true };

  const confirmed = await confirmV2({
    title: quality.name,
    content: `<p>${text(
      `Sofrer <strong>${selfDamage}</strong> de Dano Inalterável diretamente nas Caixas verdadeiras para ativar Selvageria?`,
      `Suffer <strong>${selfDamage}</strong> Unalterable Damage directly to true Wound Boxes to activate Savagery?`
    )}</p>`,
    yesLabel: text("Ativar Selvageria", "Trigger Savagery")
  });
  if (!confirmed) return { used: false };

  const tnIncrease = Math.max(0, number(state.savagery?.tnIncrease));
  const tn = 15 - getActorDerivedStat(attacker, "dos") + tnIncrease;
  const check = await rollDerivedCheck(attacker, "cpu", {
    skillKey: "endurance",
    tn,
    title: quality.name
  });
  if (!check) return { used: false };

  state.savagery ??= {};
  state.savagery.tnIncrease = tnIncrease + 3;
  state.savagery.usedSinceLastTurn = true;
  state.savagery.combatId = getCombatId();
  if (check.criticalFailure) state.savagery.lockedCombatId = getCombatId();

  await attacker.update({
    [wounds.paths.value]: wounds.value - selfDamage,
    [STATE_PATH]: state
  });
  const resolve = await addCombatMonsterResolve(attacker, selfDamage, { sourceKind: "selfQuality" });

  let temporaryGain = 0;
  let temporaryRequested = 0;
  let doomAbsorbed = 0;
  if (check.success) {
    temporaryRequested = selfDamage * (check.criticalSuccess ? 2 : 1);
    const temporaryResult = await addTemporaryWoundsRespectingDoom(
      attacker,
      temporaryRequested,
      quality.name
    );
    temporaryGain = temporaryResult.gained;
    doomAbsorbed = temporaryResult.doomAbsorbed;
  }

  const note = check.success
    ? text(
        `Selvageria causou ${selfDamage} de Dano Inalterável e concedeu ${temporaryGain} Caixas Temporárias${doomAbsorbed > 0 ? ` (${doomAbsorbed} absorvidas por [DOOM])` : ""}.`,
        `Savagery dealt ${selfDamage} Unalterable Damage and granted ${temporaryGain} Temporary Wound Boxes${doomAbsorbed > 0 ? ` (${doomAbsorbed} absorbed by [DOOM])` : ""}.`
      )
    : text(
        `Selvageria causou ${selfDamage} de Dano Inalterável${check.criticalFailure ? " e foi bloqueada até o fim do Combate" : ""}.`,
        `Savagery dealt ${selfDamage} Unalterable Damage${check.criticalFailure ? " and became locked until combat ends" : ""}.`
      );
  notes.push(note);

  return {
    used: true,
    success: Boolean(check.success),
    criticalSuccess: Boolean(check.criticalSuccess),
    criticalFailure: Boolean(check.criticalFailure),
    selfDamage,
    temporaryGain,
    temporaryRequested,
    doomAbsorbed,
    resolveGained: resolve?.gained ?? 0,
    tn,
    note
  };
}

export async function convertResolveWithAssuredDestruction(attacker, {
  maximum = getCombatMonsterResolve(attacker)
} = {}) {
  const quality = findQuality(attacker, "assuredDestruction") ?? findDefensiveQuality(attacker, ["destruicaoGarantida", "assuredDestruction"]);
  const available = Math.min(getCombatMonsterResolve(attacker), Math.max(0, number(maximum)));
  if (!quality || available <= 0) return { converted: 0, remaining: available };

  const amount = await promptNumberV2({
    title: quality.name,
    label: text("Resolve convertido em dados de Precisão", "Resolve converted into Accuracy dice"),
    value: 0,
    min: 0,
    max: available
  });
  if (amount === null || amount <= 0) return { converted: 0, remaining: available };

  const converted = clamp(amount, 0, available);
  const remaining = await setCombatMonsterResolve(attacker, available - converted);
  return { converted, remaining };
}

export async function handleDefensiveEndTurn(actor) {
  if (!actor) return;

  const qualityAttackUses = foundry.utils.deepClone(actor.system?.combat?.qualityAttackUses ?? {});
  const defensiveState = getState(actor);
  let usesChanged = false;
  let stateChanged = false;

  if (qualityAttackUses.bulletProof && Object.keys(qualityAttackUses.bulletProof).length) {
    qualityAttackUses.bulletProof = {};
    usesChanged = true;
  }

  if (qualityAttackUses["reroll-dodge"] && Object.keys(qualityAttackUses["reroll-dodge"]).length) {
    qualityAttackUses["reroll-dodge"] = {};
    usesChanged = true;
  }

  if (defensiveState.savagery?.usedSinceLastTurn) {
    defensiveState.savagery.usedSinceLastTurn = false;
    stateChanged = true;
  }

  const updates = {};
  if (usesChanged) updates["system.combat.qualityAttackUses"] = qualityAttackUses;
  if (stateChanged) updates[STATE_PATH] = defensiveState;
  if (Object.keys(updates).length) await actor.update(updates);

  const avoidance = findQuality(actor, "avoidance") ?? findDefensiveQuality(actor, ["esquiva", "avoidance"]);
  if (avoidance?.system?.uses?.enabled) {
    const maximum = Math.max(1, number(avoidance.system.uses.max, 1));
    if (number(avoidance.system.uses.value) !== maximum || number(avoidance.system.uses.spent) !== 0) {
      await avoidance.update({
        "system.uses.value": maximum,
        "system.uses.spent": 0
      });
    }
  }
}

async function initializeCombatMonsterForCombat(combat) {
  if (!isPrimaryActiveGM()) return;
  const actors = Array.from(new Map(
    (combat?.combatants?.contents ?? [])
      .filter((combatant) => combatant.actor)
      .map((combatant) => [combatant.actor.uuid, combatant.actor])
  ).values());

  for (const actor of actors) {
    const existingState = getState(actor);
    if (String(existingState.initializedCombatId ?? "") === String(combat?.id ?? "")) {
      continue;
    }

    const qualityAttackUses = foundry.utils.deepClone(actor.system?.combat?.qualityAttackUses ?? {});
    qualityAttackUses.bulletProof = {};

    await actor.update({
      [STATE_PATH]: { initializedCombatId: String(combat?.id ?? "") },
      "system.combat.qualityAttackUses": qualityAttackUses
    });

    if (getCombatMonsterResolveMax(actor) <= 0) continue;
    const boilingBlood = findQuality(actor, "boilingBlood") ?? findDefensiveQuality(actor, ["sangueFervente", "boilingBlood"]);
    const startingResolve = boilingBlood ? getQualityRank(boilingBlood) : 0;
    await setCombatMonsterResolve(actor, startingResolve);
  }
}

async function applyBoilingBloodAtTurnStart(combat) {
  if (!isPrimaryActiveGM()) return;
  const actor = combat?.combatant?.actor;
  if (!actor || getCombatMonsterResolveMax(actor) <= 0) return;

  const quality = findQuality(actor, "boilingBlood") ?? findDefensiveQuality(actor, ["sangueFervente", "boilingBlood"]);
  if (!quality) return;

  const wounds = getWoundState(actor);
  if (wounds.value >= wounds.max) return;

  const state = getState(actor);
  const signature = `${currentCombatSignature()}:${actor.uuid}`;
  if (String(state.boilingBlood?.turnSignature ?? "") === signature) return;

  state.boilingBlood ??= {};
  state.boilingBlood.turnSignature = signature;
  await updateState(actor, state);
  await addCombatMonsterResolve(actor, getQualityRank(quality), { sourceKind: "selfQuality" });
}

async function resetCombatMonsterAfterCombat(combat) {
  if (!isPrimaryActiveGM()) return;
  const actors = Array.from(new Map(
    (combat?.combatants?.contents ?? [])
      .filter((combatant) => combatant.actor)
      .map((combatant) => [combatant.actor.uuid, combatant.actor])
  ).values());

  for (const actor of actors) {
    const updates = { [STATE_PATH]: {} };
    if (getCombatMonsterResolveMax(actor) > 0) {
      const maximum = getCombatMonsterResolveMax(actor);
      const qualityAttackUses = foundry.utils.deepClone(actor.system?.combat?.qualityAttackUses ?? {});
      qualityAttackUses.combatMonster ??= {};
      qualityAttackUses.combatMonster.resolve = 0;
      qualityAttackUses.combatMonster.combatId = "";
      updates["system.resources.resolve.enabled"] = true;
      updates["system.resources.resolve.value"] = 0;
      updates["system.resources.resolve.max"] = maximum;
      updates["system.combat.qualityAttackUses"] = qualityAttackUses;
    }
    await actor.update(updates);
  }
}

export async function useDefensiveQualityAction(actor, item) {
  if (!actor || !item || item.type !== "quality") return null;
  const key = qualityId(item);
  const defensiveKeys = new Set([
    "absoluteevasion", "evasaoabsoluta",
    "avoidance", "esquiva",
    "combatmonster", "monstrodecombate",
    "bulletproof", "aprovadebalas",
    "substitute", "substituir", "substituto",
    "brace", "preparar",
    "savagery", "selvageria",
    "assureddestruction", "destruicaogarantida",
    "berserker",
    "boilingblood", "sanguefervente"
  ]);
  if (!defensiveKeys.has(key)) return null;

  const messages = {
    avoidance: text("Esquiva é oferecida automaticamente quando houver resultados 1 ou 2 elegíveis na Pool de Esquiva.", "Avoidance is offered automatically when eligible 1 or 2 results appear in the Dodge Pool."),
    esquiva: text("Esquiva é oferecida automaticamente quando houver resultados 1 ou 2 elegíveis na Pool de Esquiva.", "Avoidance is offered automatically when eligible 1 or 2 results appear in the Dodge Pool."),
    substitute: text("Substituto é oferecido automaticamente depois de um acerto e antes do dano.", "Substitute is offered automatically after a hit and before damage."),
    substituir: text("Substituto é oferecido automaticamente depois de um acerto e antes do dano.", "Substitute is offered automatically after a hit and before damage."),
    brace: text("Preparar é oferecido automaticamente depois da Armadura e antes da aplicação do dano.", "Brace is offered automatically after Armor and before damage is applied."),
    preparar: text("Preparar é oferecido automaticamente depois da Armadura e antes da aplicação do dano.", "Brace is offered automatically after Armor and before damage is applied."),
    savagery: text("Selvageria é oferecida ao declarar um Ataque, uma vez por Rodada.", "Savagery is offered when declaring an Attack, once per Round."),
    selvageria: text("Selvageria é oferecida ao declarar um Ataque, uma vez por Rodada.", "Savagery is offered when declaring an Attack, once per Round."),
    assureddestruction: text("Destruição Garantida é oferecida ao declarar um Ataque enquanto houver Resolve.", "Assured Destruction is offered when declaring an Attack while Resolve is available."),
    destruicaogarantida: text("Destruição Garantida é oferecida ao declarar um Ataque enquanto houver Resolve.", "Assured Destruction is offered when declaring an Attack while Resolve is available.")
  };

  ui.notifications.info(messages[key] ?? text(
    `${item.name} é uma Qualidade defensiva automática/passiva.`,
    `${item.name} is an automatic/passive defensive Quality.`
  ));
  return { handled: true, key };
}

export function registerDefensiveQualities() {
  game.socket.on(`system.${SYSTEM_ID}`, handleSocket);

  Hooks.on("combatStart", (combat) => {
    void initializeCombatMonsterForCombat(combat);
  });

  Hooks.on("createCombatant", (combatant) => {
    const combat = combatant?.parent;
    if (!combat?.started) return;

    /*
     * A combatant can be added after Combat has already begun. Re-running the
     * idempotent initializer prepares only the newly-added Actor and leaves
     * every participant that was already initialized untouched.
     */
    void initializeCombatMonsterForCombat(combat);
  });

  Hooks.on("updateCombat", (combat, changed) => {
    if (changed.turn === undefined && changed.round === undefined) return;

    /*
     * Document update hooks reach every connected client. Initializing here
     * as well as on combatStart guarantees that exactly the primary active GM
     * owns the persistent updates, even when another GM starts the encounter.
     */
    if (combat?.started) {
      void (async () => {
        await initializeCombatMonsterForCombat(combat);
        await applyBoilingBloodAtTurnStart(combat);
      })();
    }
  });

  Hooks.on("combatEnd", (combat) => {
    void resetCombatMonsterAfterCombat(combat);
  });

  Hooks.on("deleteCombat", (combat) => {
    void resetCombatMonsterAfterCombat(combat);
  });

  game.dda ??= {};
  game.dda.defensiveQualities = {
    requestSubstitute,
    requestBrace,
    triggerSavagery,
    convertResolveWithAssuredDestruction,
    getCombatMonsterResolve,
    getCombatMonsterResolveMax,
    setCombatMonsterResolve,
    addCombatMonsterResolve,
    useQuality: useDefensiveQualityAction
  };
}
