import {
  areActorsAllies,
  areActorsAlliesForQualities,
  findQuality,
  getActorDerivedStat,
  getActorSv,
  getCombatId,
  getCombatRound,
  getCombatTurn,
  hasQuality,
  normalizeKey
} from "../rules/quality-automation.js";

import {
  getDDAMovementContext,
  getDDAMovementTrace,
  pathCrossesPredicate
} from "../canvas/movement-context.js";

import { spendActorActions } from "./action-economy.js";
import { getTokenDistanceSpaces } from "./offensive-qualities.js";

const SYSTEM_ID = "digimon-digital-adventures";
const STATE_PATH = "system.combat.stanceQualities";
const TEMPLATE_FLAG = "sentryZone";
const SOCKET_REQUEST = "stanceQualityRequest";
const SOCKET_RESPONSE = "stanceQualityResponse";
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const pendingRequests = new Map();
const pendingTokenPositions = new Map();

const text = (pt, en) => String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? en : pt;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const escapeHtml = (value = "") => foundry.utils.escapeHTML(String(value ?? ""));

function getState(actor) {
  return foundry.utils.deepClone(actor?.system?.combat?.stanceQualities ?? {});
}

async function updateState(actor, state) {
  await actor.update({ [STATE_PATH]: state });
}

function currentTurnKey(actor) {
  return `${getCombatId()}:${getCombatRound()}:${getCombatTurn()}:${actor?.uuid ?? ""}`;
}

function primaryActiveGM() {
  return Array.from(game?.users ?? [])
    .filter((user) => user?.isGM && user?.active)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

function isPrimaryActiveGM() {
  return Boolean(game?.user?.isGM && primaryActiveGM()?.id === game.user.id);
}

function responsibleUser(actor) {
  const active = (game?.users?.contents ?? []).filter((user) => user.active);
  const charmIds = game?.dda?.bossQualities?.getCharmAuthorizedUserIds?.(actor, { includeGMs: false });
  const owners = (Array.isArray(charmIds)
    ? active.filter((user) => !user.isGM && charmIds.includes(String(user.id)))
    : active
      .filter((user) => !user.isGM)
      .filter((user) => actor?.testUserPermission?.(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return owners[0] ?? primaryActiveGM();
}

function tokenForActor(actor) {
  if (!actor) return null;
  return (canvas?.tokens?.controlled ?? []).find((token) => token.actor?.uuid === actor.uuid)
    ?? (canvas?.tokens?.placeables ?? []).find((token) => token.actor?.uuid === actor.uuid || token.actor?.id === actor.id)
    ?? null;
}

function tokenCenter(tokenOrDocument, changed = null) {
  const document = tokenOrDocument?.document ?? tokenOrDocument ?? {};
  const grid = Math.max(1, number(canvas?.grid?.size, 100));
  const x = number(changed?.x, number(document.x));
  const y = number(changed?.y, number(document.y));
  const width = Math.max(1, number(document.width, 1)) * grid;
  const height = Math.max(1, number(document.height, 1)) * grid;
  return { x: x + width / 2, y: y + height / 2 };
}

function qualityKey(item) {
  return normalizeKey(item?.system?.sourceId ?? item?.system?.id ?? item?.system?.originalName ?? item?.name ?? "");
}

function qualityMatches(item, aliases = []) {
  return aliases.map(normalizeKey).includes(qualityKey(item));
}

function hasStanceQuality(actor, stance) {
  const aliases = {
    fierce: ["almaFeroz", "fierceSoul", "fierce soul"],
    brave: ["coracaoCorajoso", "braveHeart", "brave heart"],
    sentry: ["miraSentinela", "sentryAim", "sentry aim"]
  };
  return Boolean(findQuality(actor, aliases[stance] ?? []));
}

function getCurrentStance(actor) {
  return normalizeKey(actor?.system?.combat?.currentStance ?? "neutral");
}

export function getStanceAttackModifier(attacker, attackItem, { defender = null, targetToken = null } = {}) {
  const stance = getCurrentStance(attacker);
  const rangeType = String(attackItem?.system?.baseTags?.rangeType ?? "").toLowerCase();
  const functionType = String(attackItem?.system?.baseTags?.functionType ?? "").toLowerCase();
  const sv = Math.max(0, number(getActorSv(attacker)));
  const state = getState(attacker);
  const modifier = {
    accuracyBonus: 0,
    damageBonus: 0,
    rangeBonus: 0,
    effectiveLimitBonus: 0,
    ignoreNegativeAccuracyModifiers: false,
    blocked: false,
    blockedMessage: "",
    braveHeartBonusUsed: 0,
    qualities: []
  };

  if (stance === "fierce" && hasStanceQuality(attacker, "fierce")) {
    modifier.qualities.push({
      id: "fierce-soul-stance",
      name: text("Postura Feroz", "Fierce Stance"),
      parts: [text(`+${sv} Dano`, `+${sv} Damage`), text(`−${sv} Alcance`, `−${sv} Range`)]
    });
  }

  const braveBonus = Math.max(0, number(state.braveHeart?.damageBonus));
  if (braveBonus > 0 && functionType === "damage") {
    modifier.damageBonus += braveBonus;
    modifier.braveHeartBonusUsed = braveBonus;
    modifier.qualities.push({
      id: "brave-heart-intercede-bonus",
      name: text("Coração Corajoso", "Brave Heart"),
      parts: [text(`+${braveBonus} Dano temporário`, `+${braveBonus} temporary Damage`)]
    });
  }

  if (stance === "sentry" && hasStanceQuality(attacker, "sentry") && ["range", "ranged"].includes(rangeType)) {
    modifier.ignoreNegativeAccuracyModifiers = true;
    const attackerToken = tokenForActor(attacker);
    if (defender && targetToken && attackerToken && !areActorsAlliesForQualities(attacker, defender)) {
      const distance = getTokenDistanceSpaces(attackerToken, targetToken);
      if (distance <= 2) {
        modifier.blocked = true;
        modifier.blockedMessage = text(
          "A Postura Sentinela não pode mirar inimigos a 2 Espaços ou menos.",
          "Sentry Stance cannot target enemies within 2 Spaces."
        );
      }
    }
    modifier.qualities.push({
      id: "sentry-aim-stance",
      name: text("Postura Sentinela", "Sentry Stance"),
      parts: [text("ignora penalidades de Precisão em Ataques à Distância", "ignores Accuracy penalties on Ranged Attacks")]
    });
  }

  return modifier;
}

export function getSentryMeleeDodgePenalty(defender, attackItem) {
  const rangeType = String(attackItem?.system?.baseTags?.rangeType ?? "").toLowerCase();
  if (rangeType !== "melee") return 0;
  if (getCurrentStance(defender) !== "sentry" || !hasStanceQuality(defender, "sentry")) return 0;
  return -2;
}

export async function consumeBraveHeartDamageBonus(actor) {
  const state = getState(actor);
  if (number(state.braveHeart?.damageBonus) <= 0) return false;
  state.braveHeart = {
    ...(state.braveHeart ?? {}),
    damageBonus: 0,
    consumedAt: new Date().toISOString()
  };
  await updateState(actor, state);
  return true;
}

function alliesWithin(actor, distance) {
  const sourceToken = tokenForActor(actor);
  if (!sourceToken) return [];
  return (canvas?.tokens?.placeables ?? [])
    .filter((token) => token.actor && token.actor.uuid !== actor.uuid)
    .filter((token) => areActorsAlliesForQualities(actor, token.actor))
    .filter((token) => getTokenDistanceSpaces(sourceToken, token) <= distance)
    .map((token) => token.actor);
}

export async function resolveBraveHeartAfterIntercede(actor, damageResult, { interceded = false } = {}) {
  if (!actor || !interceded || getCurrentStance(actor) !== "brave" || !hasStanceQuality(actor, "brave")) return null;
  if (number(damageResult?.after?.wounds, number(actor.system?.miscStats?.wounds?.value)) <= 0) return null;
  const cpu = Math.max(0, number(getActorDerivedStat(actor, "cpu")));
  const count = alliesWithin(actor, cpu).length;
  const state = getState(actor);
  state.braveHeart = {
    damageBonus: count,
    earnedAt: new Date().toISOString(),
    combatId: getCombatId(),
    turnKey: currentTurnKey(actor)
  };
  await updateState(actor, state);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dda-chat-card dda-effect-card effect-positive dda-stance-quality-card">
      <h2>${text("Coração Corajoso", "Brave Heart")}</h2>
      <p><strong>${escapeHtml(actor.name)}</strong> ${text("sobreviveu à Interposição.", "survived the Intercede.")}</p>
      <ul class="dda-effect-list"><li>${text("Aliados no alcance de CPU", "Allies within CPU range")}: <strong>${count}</strong>.</li><li>${text("Bônus no próximo Ataque de Dano bem-sucedido", "Bonus to the next successful Damage Attack")}: <strong>+${count}</strong>.</li></ul>
    </div>`
  });
  return count;
}

export async function maybeTriggerFierceSoulRepeat({ attacker, attackItem, targetToken, hit = false, allAreaTargetsMissed = false, attackOptions = {} } = {}) {
  if (!attacker || !attackItem || attackOptions?.fierceSoulRepeat) return null;
  if (getCurrentStance(attacker) !== "fierce" || !hasStanceQuality(attacker, "fierce")) return null;
  if (hit || (attackOptions?.areaAttackActive && !allAreaTargetsMissed)) return null;
  const state = getState(attacker);
  const turnKey = currentTurnKey(attacker);
  if (state.fierceSoul?.repeatTurnKey === turnKey) return null;

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    classes: ["dda", "dda-stance-quality-window"],
    window: { title: text("Alma Feroz", "Fierce Soul") },
    content: `<div class="dda-confirm-dialog dda-stance-quality-dialog"><p>${text(
      `O ataque <strong>${escapeHtml(attackItem.name)}</strong> errou. Repeti-lo imediatamente contra o mesmo alvo como Ação Livre?`,
      `<strong>${escapeHtml(attackItem.name)}</strong> missed. Immediately repeat it against the same target as a Free Action?`
    )}</p></div>`,
    yes: { label: text("Repetir Ataque", "Repeat Attack") },
    no: { label: text("Não repetir", "Do not repeat") },
    rejectClose: false,
    modal: true
  });
  if (!confirmed) return null;

  state.fierceSoul = { ...(state.fierceSoul ?? {}), repeatTurnKey: turnKey };
  await updateState(attacker, state);
  const { rollAttack } = await import("../rolls/attack-roll.js");
  return rollAttack(attacker, attackItem, {
    ...attackOptions,
    targetToken,
    fierceSoulRepeat: true,
    allowOutOfTurn: true,
    areaAttackActive: Boolean(attackOptions?.areaAttackActive),
    suppressCounterTriggers: true
  });
}

function getTemplateFlag(templateDocument) {
  return templateDocument?.getFlag?.(SYSTEM_ID, TEMPLATE_FLAG)
    ?? templateDocument?.flags?.[SYSTEM_ID]?.[TEMPLATE_FLAG]
    ?? null;
}

function sentryTemplates() {
  return (canvas?.scene?.templates?.contents ?? []).filter((template) => getTemplateFlag(template)?.active);
}

async function deleteSentryZone(actor) {
  const ids = sentryTemplates()
    .filter((template) => getTemplateFlag(template)?.actorUuid === actor?.uuid)
    .map((template) => template.id);
  if (ids.length) await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", ids);
  const state = getState(actor);
  state.sentryAim = { ...(state.sentryAim ?? {}), templateId: "", active: false };
  await updateState(actor, state);
}

async function pickCanvasPoint({ title, maximumDistance, origin } = {}) {
  ui.notifications.info(text(`${title}: clique no canvas. Esc cancela.`, `${title}: click the canvas. Escape cancels.`));
  canvas?.templates?.activate?.();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      canvas?.stage?.off?.("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const onKey = (event) => { if (event.key === "Escape") finish(null); };
    const onPointer = (event) => {
      const point = event.data?.getLocalPosition?.(canvas.stage) ?? event.getLocalPosition?.(canvas.stage);
      if (!point) return;
      const grid = Math.max(1, number(canvas?.grid?.size, 100));
      const distance = Math.hypot(point.x - origin.x, point.y - origin.y) / grid;
      if (distance > maximumDistance) {
        ui.notifications.warn(text(`O ponto precisa estar dentro de ${maximumDistance} Espaços.`, `The point must be within ${maximumDistance} Spaces.`));
        return;
      }
      const snapped = canvas?.grid?.getSnappedPoint?.({ x: point.x, y: point.y }, { mode: CONST.GRID_SNAPPING_MODES.CENTER }) ?? point;
      finish(snapped);
    };
    canvas?.stage?.on?.("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
  });
}

async function chooseSentryRadius(actor) {
  const bit = Math.max(0, number(getActorDerivedStat(actor, "bit")));
  const maximum = Math.max(1, 1 + Math.floor(bit / 2));
  return foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-stance-quality-window"],
    window: { title: text("Zona Sentinela", "Sentry Zone") },
    content: `<form class="dda-roll-dialog dda-stance-quality-dialog"><div class="form-group"><label>${text("Raio", "Radius")}</label><input type="number" name="radius" min="1" max="${maximum}" value="${maximum}"></div><p>${text(`Tamanho máximo de [T:BLAST]: ${maximum}.`, `Maximum [T:BLAST] Size: ${maximum}.`)}</p></form>`,
    ok: { label: text("Posicionar", "Place"), callback: (_event, button) => Math.max(1, Math.min(maximum, number(button.form.elements.radius?.value, maximum))) },
    rejectClose: false,
    modal: true
  });
}

export async function placeOrMoveSentryZone(actor, { actionCost = 0 } = {}) {
  if (!canvas?.scene) return null;
  const token = tokenForActor(actor);
  if (!token) {
    ui.notifications.warn(text("O Digimon precisa ter um Token na Cena.", "The Digimon needs a Token in the Scene."));
    return null;
  }
  const radius = await chooseSentryRadius(actor);
  if (!radius) return null;
  const range = Math.max(0, number(actor.system?.miscStats?.range?.total ?? actor.system?.miscStats?.range?.value));
  const origin = tokenCenter(token);
  const point = await pickCanvasPoint({ title: text("Posicionar Zona Sentinela", "Place Sentry Zone"), maximumDistance: range, origin });
  if (!point) return null;
  if (actionCost > 0 && !(await spendActorActions(actor, actionCost, { requireActiveUnit: true }))) return null;
  await deleteSentryZone(actor);
  const [created] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
    t: "circle",
    user: game.user.id,
    x: point.x,
    y: point.y,
    distance: radius,
    direction: 0,
    fillColor: game.user.color ?? "#00a8ff",
    borderColor: game.user.color ?? "#00a8ff",
    flags: { [SYSTEM_ID]: { [TEMPLATE_FLAG]: {
      active: true,
      actorUuid: actor.uuid,
      actorName: actor.name,
      radius,
      combatId: getCombatId(),
      createdRound: getCombatRound()
    } } }
  }]);
  const state = getState(actor);
  state.sentryAim = { active: true, templateId: created?.id ?? "", radius, combatId: getCombatId() };
  await updateState(actor, state);
  return created;
}

export async function onStanceChanged(actor, previousStance, nextStance) {
  const previous = normalizeKey(previousStance);
  const next = normalizeKey(nextStance);
  if (previous === "sentry" && next !== "sentry") await deleteSentryZone(actor);
  if (next === "sentry" && hasStanceQuality(actor, "sentry")) await placeOrMoveSentryZone(actor, { actionCost: 0 });
  return next;
}

function pointInsideSentryTemplate(point, templateDocument) {
  const flag = getTemplateFlag(templateDocument);
  if (!flag) return false;
  const grid = Math.max(1, number(canvas?.grid?.size, 100));
  const distance = Math.hypot(point.x - number(templateDocument.x), point.y - number(templateDocument.y)) / grid;
  return distance <= number(flag.radius ?? templateDocument.distance, 0);
}

async function actorFromUuid(uuid) {
  if (!uuid) return null;
  try {
    const doc = await fromUuid(uuid);
    return doc?.documentName === "Actor" ? doc : doc?.actor ?? null;
  } catch (_error) {
    return null;
  }
}

function sentryAttacks(actor) {
  return (actor?.items ?? []).filter((item) => {
    if (item.type !== "attack") return false;
    const rangeType = String(item.system?.baseTags?.rangeType ?? "").toLowerCase();
    const functionType = String(item.system?.baseTags?.functionType ?? "").toLowerCase();
    const hasExtra = Boolean(
      item.system?.isSignature ||
      item.system?.effectTag?.enabled ||
      (item.system?.qualityTags ?? []).length ||
      (item.system?.tags ?? []).some?.((tag) => !["range", "ranged", "damage"].includes(normalizeKey(tag)))
    );
    return ["range", "ranged"].includes(rangeType) && functionType === "damage" && !hasExtra && number(item.system?.actionCost?.value, 1) <= 1;
  });
}

async function chooseSentryAttack(actor, mover) {
  const attacks = sentryAttacks(actor);
  if (!attacks.length) return null;
  const result = await foundry.applications.api.DialogV2.prompt({
    classes: ["dda", "dda-stance-quality-window"],
    window: { title: text("Interrupção da Zona Sentinela", "Sentry Zone Interrupt") },
    content: `<form class="dda-roll-dialog dda-stance-quality-dialog"><p><strong>${escapeHtml(mover.name)}</strong> ${text("entrou ou saiu da Zona.", "entered or exited the Zone.")}</p><div class="form-group"><label>${text("Ataque", "Attack")}</label><select name="attackId">${attacks.map((attack) => `<option value="${attack.id}">${escapeHtml(attack.name)}</option>`).join("")}</select></div></form>`,
    ok: { label: text("Atacar", "Attack"), callback: (_event, button) => String(button.form.elements.attackId?.value ?? "") },
    rejectClose: false,
    modal: true
  });
  return result ? actor.items.get(result) : null;
}

async function executeSentryRequest(payload) {
  const sentry = await actorFromUuid(payload.sentryActorUuid);
  const mover = await actorFromUuid(payload.moverActorUuid);
  const moverToken = canvas?.tokens?.get(payload.moverTokenId);
  if (!sentry || !mover || !moverToken || getCurrentStance(sentry) !== "sentry") return { used: false };
  const attack = await chooseSentryAttack(sentry, mover);
  if (!attack) return { used: false };
  const { rollAttack } = await import("../rolls/attack-roll.js");
  const attackResult = await rollAttack(sentry, attack, {
    targetToken: moverToken,
    allowOutOfTurn: true,
    isInterrupt: true,
    sentryReaction: true,
    suppressCounterTriggers: true,
    areaAttackActive: false
  });
  return {
    used: Boolean(attackResult),
    hit: Boolean(attackResult?.hit),
    attackId: attack.id,
    resultMessageId: String(attackResult?.resultMessageId ?? "")
  };
}

async function requestSentryReaction(sentry, moverToken) {
  const owner = responsibleUser(sentry);
  if (!owner) return null;
  const payload = {
    requestId: foundry.utils.randomID(),
    sentryActorUuid: sentry.uuid,
    moverActorUuid: moverToken.actor.uuid,
    moverTokenId: moverToken.id,
    requestingUserId: game.user.id
  };
  if (owner.id === game.user.id) return executeSentryRequest(payload);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => { pendingRequests.delete(payload.requestId); resolve(null); }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(payload.requestId, { resolve, timeout });
    game.socket.emit(`system.${SYSTEM_ID}`, { type: SOCKET_REQUEST, targetUserId: owner.id, payload });
  });
}

async function handleSentryCrossing(tokenDocument, before, after, operation = {}) {
  if (!isPrimaryActiveGM() || !game?.combat?.started || !tokenDocument?.actor) return;
  const moverToken = tokenDocument.object ?? canvas?.tokens?.get(tokenDocument.id);
  if (!moverToken) return;
  const session = tokenDocument.getFlag?.(SYSTEM_ID, "movementTracker") ?? null;
  const movementContext = getDDAMovementContext(operation, { session });
  if (!movementContext.reactions) return;
  const trace = getDDAMovementTrace(operation);
  const movementPoints = trace?.points?.length >= 2
    ? trace.points
    : [before, after];
  for (const template of sentryTemplates()) {
    const flag = getTemplateFlag(template);
    const sentry = await actorFromUuid(flag.actorUuid);
    if (!sentry || getCurrentStance(sentry) !== "sentry") continue;
    const crossed = pathCrossesPredicate(
      movementPoints,
      (current) => pointInsideSentryTemplate(current, template),
      { traversal: movementContext.traversal !== false }
    );
    if (!crossed) continue;
    const targetState = getState(tokenDocument.actor);
    const roundKey = `${getCombatId()}:${getCombatRound()}`;
    if (targetState.sentryZone?.hitRoundKey === roundKey) continue;
    const reaction = await requestSentryReaction(sentry, moverToken);

    /*
     * The shared once-per-Round lock is earned only after the moving target
     * is actually hit. Declining the reaction or missing does not prevent a
     * different Sentry Zone from reacting later in the same Round.
     */
    if (reaction?.hit) {
      targetState.sentryZone = {
        hitRoundKey: roundKey,
        sentryActorUuid: sentry.uuid,
        attackId: String(reaction.attackId ?? ""),
        hitAt: new Date().toISOString()
      };
      await updateState(tokenDocument.actor, targetState);
    }
  }
}

async function handleSocket(message) {
  if (!message || ![SOCKET_REQUEST, SOCKET_RESPONSE].includes(message.type)) return;
  if (message.targetUserId && message.targetUserId !== game.user.id) return;
  if (message.type === SOCKET_RESPONSE) {
    const pending = pendingRequests.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingRequests.delete(message.requestId);
    pending.resolve(message.result ?? null);
    return;
  }
  const result = await executeSentryRequest(message.payload ?? {});
  game.socket.emit(`system.${SYSTEM_ID}`, {
    type: SOCKET_RESPONSE,
    targetUserId: message.payload?.requestingUserId ?? primaryActiveGM()?.id,
    requestId: message.payload?.requestId,
    result
  });
}

export async function useStanceQualityAction(actor, item) {
  const key = qualityKey(item);
  const supported = new Set([
    "almaferoz", "fiercesoul", "coracaocorajoso", "braveheart", "mirasentinela", "sentryaim"
  ]);
  if (!supported.has(key)) return null;
  if (["mirasentinela", "sentryaim"].includes(key) && getCurrentStance(actor) === "sentry") {
    await placeOrMoveSentryZone(actor, { actionCost: 1 });
    return { handled: true, key, action: "moveZone" };
  }
  const { changeDigimonStance } = await import("./digimon-actions.js");
  await changeDigimonStance(actor);
  return { handled: true, key, action: "changeStance" };
}

export async function handleStanceEndTurn(actor) {
  const state = getState(actor);
  let changed = false;
  if (state.fierceSoul?.repeatTurnKey) {
    state.fierceSoul.repeatTurnKey = "";
    changed = true;
  }
  if (changed) await updateState(actor, state);
}

export function registerStanceQualities() {
  game.socket.on(`system.${SYSTEM_ID}`, (message) => {
    void handleSocket(message);
  });
  Hooks.on("preUpdateToken", (tokenDocument, changed) => {
    if (changed.x === undefined && changed.y === undefined) return;
    pendingTokenPositions.set(tokenDocument.uuid, tokenCenter(tokenDocument));
  });
  Hooks.on("updateToken", (tokenDocument, changed, operation = {}) => {
    if (changed.x === undefined && changed.y === undefined) return;
    const before = pendingTokenPositions.get(tokenDocument.uuid) ?? tokenCenter(tokenDocument);
    pendingTokenPositions.delete(tokenDocument.uuid);
    const after = tokenCenter(tokenDocument);
    void handleSentryCrossing(tokenDocument, before, after, operation);
  });
  Hooks.on("combatEnd", () => {
    if (!isPrimaryActiveGM()) return;
    const ids = sentryTemplates().map((template) => template.id);
    if (ids.length) void canvas?.scene?.deleteEmbeddedDocuments?.("MeasuredTemplate", ids);

    for (const actor of game.actors?.contents ?? []) {
      const state = getState(actor);
      if (!state.braveHeart?.damageBonus && !state.fierceSoul?.repeatTurnKey) continue;
      state.braveHeart = {
        ...(state.braveHeart ?? {}),
        damageBonus: 0,
        endedAtCombatEnd: true
      };
      state.fierceSoul = {
        ...(state.fierceSoul ?? {}),
        repeatTurnKey: ""
      };
      void updateState(actor, state);
    }
  });
  game.dda ??= {};
  game.dda.stanceQualities = {
    useQuality: useStanceQualityAction,
    getAttackModifier: getStanceAttackModifier,
    onStanceChanged,
    placeOrMoveSentryZone,
    maybeTriggerFierceSoulRepeat,
    resolveBraveHeartAfterIntercede
  };
}
