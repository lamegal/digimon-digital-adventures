import { rollAttack } from "../rolls/attack-roll.js";
import {
  areActorsAllies,
  findQuality,
  getActorDerivedStat,
  getActorStageValue,
  getCombatId,
  getCombatRound,
  hasQuality,
  normalizeKey,
  rollDerivedCheck
} from "../rules/quality-automation.js";
import { spendActorActions } from "./action-economy.js";
import { getActiveDDAUnitContext } from "./initiative.js";
import {
  getReachModeData,
  getTokenDistanceSpaces
} from "./offensive-qualities.js";

const SYSTEM_ID = "digimon-digital-adventures";
const SOCKET_UPDATE_ACTOR = "clashQualityUpdateActor";
const SOCKET_UPDATE_TOKEN = "clashQualityUpdateToken";
const SIZE_ORDER = ["small", "medium", "large", "huge", "gigantic", "colossal"];

function english() {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en");
}

function text(pt, en) {
  return english() ? en : pt;
}

function escapeHtml(value = "") {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function primaryActiveGM() {
  return (game?.users?.contents ?? [])
    .filter((user) => user.active && user.isGM)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
}

function isPrimaryActiveGM() {
  return Boolean(game.user?.isGM && primaryActiveGM()?.id === game.user.id);
}

function canUpdate(document) {
  if (!document) return false;
  if (game.user?.isGM) return true;
  return Boolean(document.canUserModify?.(game.user, "update"));
}

async function requestGM(payload = {}) {
  if (!primaryActiveGM()) {
    ui.notifications.warn(text(
      "Esta ação precisa de um Mestre ativo para atualizar o alvo.",
      "This action requires an active GM to update the target."
    ));
    return false;
  }

  game.socket.emit(`system.${SYSTEM_ID}`, {
    ...payload,
    systemId: SYSTEM_ID,
    requestUserId: game.user.id
  });
  return true;
}

async function updateActor(actor, update = {}, options = {}) {
  if (!actor) return false;
  if (canUpdate(actor)) {
    await actor.update(update, options);
    return true;
  }
  return requestGM({
    action: SOCKET_UPDATE_ACTOR,
    actorUuid: actor.uuid,
    update,
    options
  });
}

async function updateToken(tokenDocument, update = {}, options = {}) {
  if (!tokenDocument) return false;
  if (canUpdate(tokenDocument)) {
    await tokenDocument.update(update, options);
    return true;
  }
  return requestGM({
    action: SOCKET_UPDATE_TOKEN,
    sceneId: tokenDocument.parent?.id ?? canvas?.scene?.id ?? "",
    tokenId: tokenDocument.id,
    update,
    options
  });
}

async function resolveActor(uuid = "") {
  if (!uuid) return null;
  try {
    const actor = await fromUuid(uuid);
    return actor?.documentName === "Actor" ? actor : null;
  } catch (_error) {
    return null;
  }
}

function getTokenForActor(actor) {
  if (!actor) return null;
  if (actor.isToken && actor.token?.object) return actor.token.object;
  return (canvas?.tokens?.placeables ?? []).find((token) => (
    token.actor?.uuid === actor.uuid || token.actor?.id === actor.id
  )) ?? null;
}

function getSizeIndex(actor) {
  const key = String(actor?.system?.size ?? "medium").toLowerCase();
  const index = SIZE_ORDER.indexOf(key);
  return index >= 0 ? index : SIZE_ORDER.indexOf("medium");
}

function isDigimon(actor) {
  return Boolean(actor && ["digimon", "npc"].includes(actor.type));
}

function getMovement(actor) {
  return Math.max(0, number(
    actor?.system?.movement?.land?.total ??
    actor?.system?.movement?.land?.value ??
    actor?.system?.derived?.movement?.value ??
    actor?.system?.miscStats?.movement?.total ??
    actor?.system?.miscStats?.movement?.value ??
    actor?.system?.miscStats?.movement?.base
  ));
}

function getRange(actor) {
  return Math.max(0, number(
    actor?.system?.miscStats?.range?.total ??
    actor?.system?.miscStats?.range?.value ??
    actor?.system?.miscStats?.range?.base
  ));
}

function clashReach(actor) {
  const reach = getReachModeData(actor);
  return reach.mode === "extendedgrapple"
    ? 1 + Math.max(0, number(reach.rank))
    : 1;
}

function canActNow(actor) {
  if (!game.combat?.started) return true;
  const context = getActiveDDAUnitContext(actor);
  if (!context.allowed) {
    ui.notifications.warn(context.ended
      ? text("Este Digimon já encerrou sua parte desta ativação.", "This Digimon has already ended its part of this activation.")
      : text("Este Digimon não pertence à unidade ativa.", "This Digimon does not belong to the active unit."));
    return false;
  }
  return true;
}

function attackTags(attack) {
  const tags = new Set();
  const values = [
    ...(Array.isArray(attack?.system?.qualityTags) ? attack.system.qualityTags : []),
    ...(Array.isArray(attack?.system?.tags) ? attack.system.tags : []),
    ...(Array.isArray(attack?.system?.baseTags?.tags) ? attack.system.baseTags.tags : [])
  ];
  for (const value of values) {
    const normalized = String(value?.tag ?? value?.key ?? value ?? "")
      .trim()
      .replace(/^\[|\]$/g, "")
      .toLowerCase();
    if (normalized) tags.add(normalized);
  }
  return tags;
}

function hasChargeBinding(actor, attack) {
  if (attackTags(attack).has("charge")) return true;
  const attackKeys = new Set([attack.id, attack.uuid, attack.name].filter(Boolean).map(String));
  for (const quality of actor?.items ?? []) {
    if (quality.type !== "quality") continue;
    const tags = quality.system?.attackModifier?.grantsTags ?? [];
    if (!tags.map((tag) => normalizeKey(tag)).includes("charge")) continue;
    const choices = [
      ...(quality.system?.choices?.selectedRanks ?? []),
      ...(quality.system?.choices?.selected ?? [])
    ];
    if (!choices.length) return true;
    if (choices.some((raw) => {
      const choice = typeof raw === "object" ? raw : { key: raw };
      const key = String(choice.attackId ?? choice.attackItemId ?? choice.itemId ?? choice.key ?? "");
      return attackKeys.has(key) || key.startsWith(`${attack.id}:`);
    })) return true;
  }
  return false;
}

function getChargeAttacks(actor) {
  return (actor?.items ?? []).filter((item) => item.type === "attack" && hasChargeBinding(actor, item));
}

export function hasMonsterStrength(actor) {
  return hasQuality(actor, "monsterStrength");
}

export function hasExposingHold(actor) {
  return hasQuality(actor, "exposingHold");
}

export function hasPointBlank(actor) {
  return hasQuality(actor, "pointBlank");
}

export function hasSlippery(actor) {
  return hasQuality(actor, "slippery");
}

export function hasFastball(actor) {
  return hasQuality(actor, "fastball");
}

export function hasGiantHijacker(actor) {
  return hasQuality(actor, "giantHijacker");
}

export function hasTitanPower(actor) {
  return hasQuality(actor, "titanPower");
}

export function hasDistantForce(actor) {
  return hasQuality(actor, "distantForce");
}

export function hasPowerThrow(actor) {
  return hasQuality(actor, "powerThrow");
}

export function getFastballAreaIntercedeCost(actor, fallback = 2) {
  return hasFastball(actor) ? 1 : Math.max(0, number(fallback, 2));
}

export function getThrowDistance(actor) {
  return Math.max(0, 3 + getActorDerivedStat(actor, "cpu") + (hasPowerThrow(actor) ? 3 : 0));
}

function getHijackerState(actor) {
  return foundry.utils.deepClone(actor?.system?.combat?.clashQualities?.giantHijacker ?? {});
}

export function actorsShareGiantHijackerState(left, right) {
  if (!left || !right) return false;
  const leftState = getHijackerState(left);
  const rightState = getHijackerState(right);
  return Boolean(
    leftState.active && rightState.active &&
    ((leftState.riderUuid === left.uuid && leftState.hostUuid === right.uuid) ||
      (leftState.hostUuid === left.uuid && leftState.riderUuid === right.uuid))
  );
}

async function setHijackerPair(rider, host, state) {
  const update = {
    "system.combat.clashQualities.giantHijacker": state
  };
  await Promise.all([
    updateActor(rider, update),
    updateActor(host, update)
  ]);
}

export async function clearGiantHijacker(actor, { reason = "manual", announce = true } = {}) {
  const state = getHijackerState(actor);
  if (!state.active) return false;
  const rider = await resolveActor(state.riderUuid);
  const host = await resolveActor(state.hostUuid);
  const cleared = {
    active: false,
    riderUuid: "",
    hostUuid: "",
    removalTnBonus: 0,
    reason,
    endedAt: Date.now()
  };
  await Promise.all([
    rider ? updateActor(rider, { "system.combat.clashQualities.giantHijacker": cleared }) : null,
    host ? updateActor(host, { "system.combat.clashQualities.giantHijacker": cleared }) : null
  ].filter(Boolean));

  if (announce) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: rider ?? host ?? actor }),
      content: `<div class="dda-chat-card dda-effect-card dda-clash-quality-card">
        <h2>${text("Sequestrador de Gigantes", "Giant Hijacker")}</h2>
        <p>${text(
          `<strong>${escapeHtml(rider?.name ?? actor.name)}</strong> não está mais sobre <strong>${escapeHtml(host?.name ?? "")}</strong>.`,
          `<strong>${escapeHtml(rider?.name ?? actor.name)}</strong> is no longer riding <strong>${escapeHtml(host?.name ?? "")}</strong>.`
        )}</p>
      </div>`
    });
  }
  return true;
}

function addTemporaryEffect(actor, effect) {
  const effects = foundry.utils.deepClone(actor?.system?.effects?.active ?? []);
  effects.push({
    id: foundry.utils.randomID(),
    appliedCombatId: getCombatId(),
    appliedCombatRound: getCombatRound(),
    appliedCombatTurn: Number(game.combat?.turn ?? -1),
    ...effect
  });
  return updateActor(actor, { "system.effects.active": effects });
}

export async function useGiantHijacker(actor) {
  if (!hasGiantHijacker(actor)) {
    ui.notifications.warn(text("Este Digimon não possui Sequestrador de Gigantes.", "This Digimon does not have Giant Hijacker."));
    return null;
  }
  if (!canActNow(actor)) return null;
  if (actor.system?.clash?.state?.active) {
    ui.notifications.warn(text("Sequestrador de Gigantes não pode ser usado durante um Clash.", "Giant Hijacker cannot be used during a Clash."));
    return null;
  }

  const targets = Array.from(game.user.targets ?? []);
  if (targets.length !== 1 || !isDigimon(targets[0]?.actor)) {
    ui.notifications.warn(text("Mire exatamente um Digimon maior e adjacente.", "Target exactly one larger adjacent Digimon."));
    return null;
  }
  const hostToken = targets[0];
  const host = hostToken.actor;
  const riderToken = getTokenForActor(actor);
  if (!riderToken || getTokenDistanceSpaces(riderToken, hostToken) > 1) {
    ui.notifications.warn(text("O alvo precisa estar adjacente.", "The target must be adjacent."));
    return null;
  }
  if (getSizeIndex(host) <= getSizeIndex(actor)) {
    ui.notifications.warn(text("O alvo precisa ser pelo menos um Tamanho maior.", "The target must be at least one Size larger."));
    return null;
  }
  if (getHijackerState(actor).active || getHijackerState(host).active) {
    ui.notifications.warn(text("Um dos participantes já está envolvido em Sequestrador de Gigantes.", "One participant is already involved in Giant Hijacker."));
    return null;
  }

  const payment = await spendActorActions(actor, 1);
  if (!payment) return null;

  const tn = Math.max(1, 10 + getActorDerivedStat(host, "ram") - getActorDerivedStat(host, "cpu"));
  const result = await rollDerivedCheck(actor, "cpu", {
    skillKey: "athletics",
    tn,
    title: text("Sequestrador de Gigantes", "Giant Hijacker")
  });
  if (!result) return null;

  if (result.criticalFailure) {
    await addTemporaryEffect(actor, {
      tag: "slow",
      label: "[SLOW 2]",
      value: 2,
      potency: 2,
      duration: 1,
      remaining: 1,
      maxDuration: 1,
      expiresOn: "sourceTurnStart",
      sourceActorUuid: actor.uuid,
      sourceActorName: actor.name
    });
  }

  if (result.success) {
    const state = {
      active: true,
      riderUuid: actor.uuid,
      riderName: actor.name,
      hostUuid: host.uuid,
      hostName: host.name,
      removalTnBonus: result.criticalSuccess ? 3 : 0,
      startedCombatId: getCombatId(),
      startedRound: getCombatRound(),
      startedAt: Date.now()
    };
    await setHijackerPair(actor, host, state);
    await updateToken(riderToken.document, {
      x: hostToken.document.x,
      y: hostToken.document.y,
      elevation: hostToken.document.elevation
    }, { animate: true, ddaGiantHijackerAttach: true });
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dda-chat-card dda-effect-card dda-clash-quality-card ${result.success ? "is-success" : "is-failure"}">
      <h2>${text("Sequestrador de Gigantes", "Giant Hijacker")}</h2>
      <ul class="dda-effect-list">
        <li>${text("Alvo", "Target")}: <strong>${escapeHtml(host.name)}</strong>.</li>
        <li>${text("NA", "TN")}: <strong>${tn}</strong>.</li>
        <li>${text("Resultado", "Result")}: <strong>${escapeHtml(result.outcome ?? "")}</strong>.</li>
        ${result.success ? `<li>${text("O Digimon passa a compartilhar o espaço e acompanhar todo movimento do alvo.", "The Digimon now shares the target's space and follows all of its movement.")}</li>` : ""}
        ${result.criticalSuccess ? `<li>${text("O teste para removê-lo recebe +3 NA.", "The check to remove it gains +3 TN.")}</li>` : ""}
        ${result.criticalFailure ? `<li>${text("Falha Crítica: sofre [SLOW 2] até o início do próximo turno.", "Critical Failure: suffers [SLOW 2] until the start of its next turn.")}</li>` : ""}
      </ul>
    </div>`
  });

  return result;
}

export async function shakeOffGiantHijacker(actor) {
  const state = getHijackerState(actor);
  if (!state.active || state.hostUuid !== actor.uuid) {
    ui.notifications.warn(text("Este Digimon não está carregando um Sequestrador de Gigantes.", "This Digimon is not carrying a Giant Hijacker."));
    return null;
  }
  if (!canActNow(actor)) return null;
  const rider = await resolveActor(state.riderUuid);
  if (!rider) return clearGiantHijacker(actor, { reason: "missingRider" });
  const payment = await spendActorActions(actor, 1);
  if (!payment) return null;

  const tn = 10 + getActorDerivedStat(rider, "ram") + Math.max(0, number(state.removalTnBonus));
  const result = await rollDerivedCheck(actor, "cpu", {
    tn,
    title: text("Remover Sequestrador", "Shake Off Hijacker")
  });
  if (result?.success) await clearGiantHijacker(actor, { reason: "shakenOff" });
  return result;
}

function getEligibleFastballAllies(actor) {
  const actorToken = getTokenForActor(actor);
  if (!actorToken) return [];
  const maxDistance = clashReach(actor);
  return (canvas?.tokens?.placeables ?? []).filter((token) => {
    const ally = token.actor;
    if (!isDigimon(ally) || ally.uuid === actor.uuid) return false;
    if (!areActorsAllies(actor, ally)) return false;
    if (getTokenDistanceSpaces(actorToken, token) > maxDistance) return false;
    if (!hasMonsterStrength(actor) && getSizeIndex(ally) >= getSizeIndex(actor)) return false;
    return getChargeAttacks(ally).length > 0;
  });
}

function getEligibleFastballEnemies(actor) {
  return (canvas?.tokens?.placeables ?? []).filter((token) => {
    const target = token.actor;
    return isDigimon(target) && !areActorsAllies(actor, target);
  });
}

async function promptFastball(actor, allies, enemies) {
  return foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-clash-dialog", "dda-clash-quality-window"],
    window: { title: text("Arremesso Especial", "Fastball") },
    position: { width: 620, height: "auto" },
    modal: true,
    content: `<form class="dda-clash-quality-form">
      <header class="dda-clash-quality-hero">
        <span>${text("Qualidade de Clash", "Clash Quality")}</span>
        <h2>${text("Arremesso Especial", "Fastball")}</h2>
        <p>${text("Escolha o aliado, o alvo e o investimento de Ações.", "Choose the ally, target, and Action investment.")}</p>
      </header>
      <div class="form-group"><label>${text("Aliado arremessado", "Thrown ally")}</label>
        <select name="allyTokenId">${allies.map((token) => `<option value="${token.id}">${escapeHtml(token.name)}</option>`).join("")}</select>
      </div>
      <div class="form-group"><label>${text("Alvo da investida", "Charge target")}</label>
        <select name="enemyTokenId">${enemies.map((token) => `<option value="${token.id}">${escapeHtml(token.name)}</option>`).join("")}</select>
      </div>
      <div class="form-group"><label>${text("Custo", "Cost")}</label>
        <select name="actionCost">
          <option value="1">1 ${text("Ação", "Action")}</option>
          <option value="2">2 ${text("Ações — concede 1 Ação ao aliado para o ataque", "Actions — grants 1 Action to the ally for the attack")}</option>
        </select>
      </div>
      <label class="dda-clash-choice"><input type="checkbox" name="useThrowerAttack">
        <span>${text("Contar o ataque [CHARGE] como o ataque do arremessador nesta Rodada, ignorando o limite do aliado.", "Count the [CHARGE] attack as the thrower's Attack this Round, bypassing the ally's limit.")}</span>
      </label>
    </form>`,
    buttons: [
      {
        action: "confirm",
        label: text("Preparar arremesso", "Prepare throw"),
        icon: "fa-solid fa-baseball",
        default: true,
        callback: (_event, button) => ({
          allyTokenId: String(button.form?.elements?.allyTokenId?.value ?? ""),
          enemyTokenId: String(button.form?.elements?.enemyTokenId?.value ?? ""),
          actionCost: number(button.form?.elements?.actionCost?.value, 1),
          useThrowerAttack: Boolean(button.form?.elements?.useThrowerAttack?.checked)
        })
      },
      { action: "cancel", label: text("Cancelar", "Cancel"), callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });
}

export async function useFastball(actor) {
  if (!hasFastball(actor)) {
    ui.notifications.warn(text("Este Digimon não possui Arremesso Especial.", "This Digimon does not have Fastball."));
    return null;
  }
  if (!canActNow(actor)) return null;
  const allies = getEligibleFastballAllies(actor);
  const enemies = getEligibleFastballEnemies(actor);
  if (!allies.length || !enemies.length) {
    ui.notifications.warn(text(
      "É necessário um aliado elegível com ataque [CHARGE] no alcance de Clash e ao menos um inimigo no canvas.",
      "An eligible ally with a [CHARGE] attack in Clash reach and at least one enemy on the canvas are required."
    ));
    return null;
  }
  const choice = await promptFastball(actor, allies, enemies);
  if (!choice) return null;
  const allyToken = canvas.tokens?.get(choice.allyTokenId);
  const enemyToken = canvas.tokens?.get(choice.enemyTokenId);
  const ally = allyToken?.actor;
  if (!ally || !enemyToken?.actor) return null;

  if (choice.useThrowerAttack && actor.system?.combat?.hasAttackedThisRound) {
    ui.notifications.warn(text("O arremessador já usou seu Ataque nesta Rodada.", "The thrower has already used its Attack this Round."));
    return null;
  }

  const payment = await spendActorActions(actor, choice.actionCost);
  if (!payment) return null;

  const distance = getThrowDistance(actor);
  const movementGranted = await game.dda?.movementTracker?.grantMovement?.(ally, distance, {
    kind: "fastball",
    actionCost: 0,
    source: "fastball",
    sourceActorUuid: actor.uuid,
    sourceActorName: actor.name,
    targetTokenId: enemyToken.id,
    label: text("Arremesso Especial", "Fastball")
  });

  const request = {
    id: foundry.utils.randomID(),
    status: "ready",
    throwerUuid: actor.uuid,
    throwerName: actor.name,
    allyUuid: ally.uuid,
    allyName: ally.name,
    allyTokenId: allyToken.id,
    enemyUuid: enemyToken.actor.uuid,
    enemyName: enemyToken.actor.name,
    enemyTokenId: enemyToken.id,
    distance,
    actionCost: choice.actionCost,
    grantedAttackAction: choice.actionCost >= 2 ? 1 : 0,
    useThrowerAttack: choice.useThrowerAttack,
    noCrashDamage: hasPowerThrow(actor) || hasQuality(ally, "tumbler"),
    authorizedUserIds: (game.users?.contents ?? [])
      .filter((user) => user.isGM || ally.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
      .map((user) => user.id)
  };

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="dda-chat-card dda-effect-card dda-clash-quality-card dda-fastball-card">
      <h2>${text("Arremesso Especial", "Fastball")}</h2>
      <ul class="dda-effect-list">
        <li>${text("Arremessador", "Thrower")}: <strong>${escapeHtml(actor.name)}</strong>.</li>
        <li>${text("Aliado", "Ally")}: <strong>${escapeHtml(ally.name)}</strong>.</li>
        <li>${text("Alvo", "Target")}: <strong>${escapeHtml(enemyToken.actor.name)}</strong>.</li>
        <li>${text("Distância disponível", "Available distance")}: <strong>${distance}</strong> ${text("Espaços", "Spaces")}.</li>
        <li>${movementGranted ? text("Mova o aliado com o rastreador concedido e então use o botão abaixo.", "Move the ally with the granted tracker, then use the button below.") : text("Reposicione o aliado manualmente dentro da distância permitida.", "Reposition the ally manually within the allowed distance.")}</li>
        <li>${request.noCrashDamage
          ? text("O aliado não sofre Dano de Colisão pelo arremesso.", "The ally takes no Crash Damage from the throw.")
          : text("Dano de Colisão do arremesso permanece sujeito às regras normais de Arremessar.", "Crash Damage from the throw remains subject to the normal Throw rules.")}</li>
      </ul>
      <button type="button" data-action="dda-fastball-charge" data-request-id="${request.id}">
        <i class="fa-solid fa-bolt"></i> ${text("Realizar ataque [CHARGE]", "Make [CHARGE] attack")}
      </button>
    </div>`,
    flags: { [SYSTEM_ID]: { fastballRequest: request } }
  });
  return request;
}

async function promptChargeAttack(ally) {
  const attacks = getChargeAttacks(ally);
  if (!attacks.length) return null;
  return foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-clash-dialog", "dda-clash-quality-window"],
    window: { title: text("Ataque [CHARGE]", "[CHARGE] Attack") },
    modal: true,
    content: `<form class="dda-clash-quality-form"><div class="form-group"><label>${text("Ataque", "Attack")}</label>
      <select name="attackId">${attacks.map((attack) => `<option value="${attack.id}">${escapeHtml(attack.name)}</option>`).join("")}</select>
    </div></form>`,
    buttons: [
      { action: "confirm", label: text("Atacar", "Attack"), default: true, callback: (_event, button) => String(button.form?.elements?.attackId?.value ?? "") },
      { action: "cancel", label: text("Cancelar", "Cancel"), callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  }).then((id) => attacks.find((attack) => attack.id === id) ?? null);
}

async function resolveFastballCharge(message) {
  const request = foundry.utils.deepClone(message?.getFlag?.(SYSTEM_ID, "fastballRequest") ?? {});
  if (request.status !== "ready") return false;
  if (!game.user.isGM && !(request.authorizedUserIds ?? []).includes(game.user.id)) return false;
  const ally = await resolveActor(request.allyUuid);
  const thrower = await resolveActor(request.throwerUuid);
  const enemyToken = canvas.tokens?.get(request.enemyTokenId);
  if (!ally || !thrower || !enemyToken) return false;
  const attack = await promptChargeAttack(ally);
  if (!attack) return false;

  const attackBaseCost = Math.max(
    1,
    number(attack.system?.actionCost?.value, 1) +
      number(attack.system?.actionCost?.extra, 0)
  );
  const interruptActionCost = Math.max(
    0,
    attackBaseCost - Math.max(0, number(request.grantedAttackAction, 0))
  );

  const result = await rollAttack(ally, attack, {
    targetToken: enemyToken,
    allowOutOfTurn: true,
    isInterrupt: true,
    actionCostOverride: interruptActionCost,
    ignoreAttackPerRoundLimit: Boolean(request.useThrowerAttack),
    skipAttackUseTracking: Boolean(request.useThrowerAttack),
    suppressChargeMovement: true,
    clashContext: {
      isInterrupt: true,
      fastball: true,
      throwerUuid: thrower.uuid,
      thrownAllyDoesNotMove: true
    }
  });
  if (!result) return false;

  if (request.useThrowerAttack) {
    await updateActor(thrower, {
      "system.combat.hasAttackedThisRound": true,
      "system.combat.attacksMadeThisTurn": Math.max(1, number(thrower.system?.combat?.attacksMadeThisTurn) + 1)
    });
  }

  request.status = "resolved";
  request.resolvedAt = Date.now();
  request.resolvedByUserId = game.user.id;
  request.attackItemId = attack.id;
  request.attackItemName = attack.name;
  request.interruptActionCost = interruptActionCost;
  await message.update({
    [`flags.${SYSTEM_ID}.fastballRequest`]: request,
    content: `<div class="dda-chat-card dda-effect-card dda-clash-quality-card dda-fastball-card is-resolved">
      <h2>${text("Arremesso Especial resolvido", "Fastball resolved")}</h2>
      <p><strong>${escapeHtml(ally.name)}</strong> ${text("realizou", "made")} <strong>${escapeHtml(attack.name)}</strong> ${text("contra", "against")} <strong>${escapeHtml(enemyToken.actor.name)}</strong>.</p>
    </div>`
  });
  return true;
}

export async function useDistantForce(actor) {
  if (!hasDistantForce(actor)) {
    ui.notifications.warn(text("Este Digimon não possui Força Distante.", "This Digimon does not have Distant Force."));
    return null;
  }
  if (!canActNow(actor)) return null;
  const targets = Array.from(game.user.targets ?? []);
  if (targets.length !== 1 || !isDigimon(targets[0]?.actor)) {
    ui.notifications.warn(text("Mire exatamente um Digimon.", "Target exactly one Digimon."));
    return null;
  }
  const targetToken = targets[0];
  const target = targetToken.actor;
  const actorToken = getTokenForActor(actor);
  const distance = getTokenDistanceSpaces(actorToken, targetToken);
  if (!Number.isFinite(distance) || distance > getRange(actor)) {
    ui.notifications.warn(text("O alvo está fora do Alcance.", "The target is out of Range."));
    return null;
  }

  const choice = await foundry.applications.api.DialogV2.wait({
    classes: ["dda", "dda-clash-dialog", "dda-clash-quality-window"],
    window: { title: text("Força Distante", "Distant Force") },
    modal: true,
    content: `<form class="dda-clash-quality-form">
      <div class="form-group"><label>${text("Efeito", "Effect")}</label><select name="direction"><option value="push">[PUSH]</option><option value="pull">[PULL]</option></select></div>
      <div class="form-group"><label>${text("Estatística para distância", "Distance stat")}</label><select name="stat"><option value="bit">BIT (${getActorDerivedStat(actor, "bit")})</option><option value="dos">DOS (${getActorDerivedStat(actor, "dos")})</option></select></div>
      <label class="dda-clash-choice"><input type="checkbox" name="willing" ${areActorsAllies(actor, target) ? "checked" : ""}><span>${text("O alvo está disposto", "The target is willing")}</span></label>
    </form>`,
    buttons: [
      { action: "confirm", label: text("Usar", "Use"), default: true, callback: (_event, button) => ({
        direction: String(button.form?.elements?.direction?.value ?? "push"),
        stat: String(button.form?.elements?.stat?.value ?? "bit"),
        willing: Boolean(button.form?.elements?.willing?.checked)
      }) },
      { action: "cancel", label: text("Cancelar", "Cancel"), callback: () => null }
    ],
    rejectClose: false,
    close: () => null
  });
  if (!choice) return null;

  const payment = await spendActorActions(actor, 1);
  if (!payment) return null;
  let success = Boolean(choice.willing);
  let casterRoll = null;
  let targetRoll = null;

  if (!success) {
    const brawlerCaster = actor.system?.qualityFeatures?.dataOptimization?.brawler ? 1 : 0;
    const brawlerTarget = target.system?.qualityFeatures?.dataOptimization?.brawler ? 1 : 0;
    casterRoll = await new Roll("3d6 + @modifier", {
      modifier: getActorDerivedStat(actor, "bit") + getActorDerivedStat(actor, "dos") + brawlerCaster
    }).evaluate();
    const targetModifier = hasSlippery(target)
      ? getActorDerivedStat(target, "ram") * 2 + brawlerTarget
      : number(target.system?.miscStats?.clash?.total ?? target.system?.miscStats?.clash?.value) + brawlerTarget;
    targetRoll = await new Roll("3d6 + @modifier", { modifier: targetModifier }).evaluate();
    success = number(casterRoll.total) > number(targetRoll.total);
  }

  const movementDistance = getActorDerivedStat(actor, choice.stat);
  if (success && movementDistance > 0) {
    const sourceCenter = actorToken.center;
    const targetCenter = targetToken.center;
    const dx = number(targetCenter.x) - number(sourceCenter.x);
    const dy = number(targetCenter.y) - number(sourceCenter.y);
    const length = Math.max(1, Math.hypot(dx, dy));
    const sign = choice.direction === "pull" ? -1 : 1;
    const grid = Math.max(1, number(canvas.grid?.size, 100));
    const allowed = choice.direction === "pull"
      ? Math.min(movementDistance, Math.max(0, Math.ceil(length / grid) - 1))
      : movementDistance;
    const destination = {
      x: number(targetToken.document.x) + (dx / length) * grid * allowed * sign,
      y: number(targetToken.document.y) + (dy / length) * grid * allowed * sign
    };
    const snapped = canvas.grid?.getSnappedPoint
      ? canvas.grid.getSnappedPoint(destination, { mode: CONST.GRID_SNAPPING_MODES?.CENTER })
      : destination;
    const forcedDestination = {
      x: Math.round(number(snapped.x, destination.x)),
      y: Math.round(number(snapped.y, destination.y))
    };
    let handledByClash = false;
    try {
      const clashAutomation = await import("./clash.js");
      const resolution = await clashAutomation.handleClashForcedMovement?.({
        defender: target,
        source: actor,
        direction: choice.direction,
        potency: movementDistance,
        destination: forcedDestination
      });
      handledByClash = Boolean(resolution?.handled);
    } catch (error) {
      console.warn("DDA | Distant Force Clash integration failed.", error);
    }
    if (!handledByClash) {
      await updateToken(targetToken.document, forcedDestination, { animate: true, ddaDistantForce: true });
    }
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [casterRoll, targetRoll].filter(Boolean),
    content: `<div class="dda-chat-card dda-effect-card dda-clash-quality-card ${success ? "is-success" : "is-failure"}">
      <h2>${text("Força Distante", "Distant Force")}</h2>
      <ul class="dda-effect-list">
        <li>${text("Alvo", "Target")}: <strong>${escapeHtml(target.name)}</strong>.</li>
        ${casterRoll ? `<li>${escapeHtml(actor.name)}: <strong>${number(casterRoll.total)}</strong>.</li><li>${escapeHtml(target.name)}: <strong>${number(targetRoll.total)}</strong>.</li>` : `<li>${text("Alvo disposto: não houve disputa.", "Willing target: no contest was required.")}</li>`}
        <li>${text("Resultado", "Result")}: <strong>${success ? text("Sucesso", "Success") : text("Falha", "Failure")}</strong>.</li>
        ${success ? `<li>${choice.direction.toUpperCase()} ${movementDistance}.</li>` : ""}
      </ul>
    </div>`
  });
  return { success, casterRoll, targetRoll, choice, movementDistance };
}

export function getClashQualityMenuEntries(actor) {
  const entries = [];
  if (hasFastball(actor)) entries.push({ key: "fastball", title: text("Arremesso Especial", "Fastball"), summary: text("Arremesse um aliado e prepare um ataque [CHARGE].", "Throw an ally and prepare a [CHARGE] attack."), cost: "1–2A" });
  if (hasGiantHijacker(actor)) {
    const state = getHijackerState(actor);
    if (state.active && state.riderUuid === actor.uuid) entries.push({ key: "endGiantHijacker", title: text("Descer do alvo", "Dismount"), summary: text("Encerra Sequestrador de Gigantes como Ação Livre.", "Ends Giant Hijacker as a Free Action."), cost: text("Livre", "Free") });
    else if (state.active && state.hostUuid === actor.uuid) entries.push({ key: "shakeOffGiantHijacker", title: text("Remover Sequestrador", "Shake Off Hijacker"), summary: text("Tente remover o Digimon que está sobre você.", "Try to remove the Digimon riding you."), cost: "1A" });
    else entries.push({ key: "giantHijacker", title: text("Sequestrador de Gigantes", "Giant Hijacker"), summary: text("Suba em um inimigo maior e acompanhe seu movimento.", "Climb onto a larger enemy and follow its movement."), cost: "1A" });
  }
  if (hasDistantForce(actor)) entries.push({ key: "distantForce", title: text("Força Distante", "Distant Force"), summary: text("Empurre ou puxe um alvo dentro do Alcance.", "Push or pull a target within Range."), cost: "1A" });
  return entries;
}

export async function executeClashQualityMenuAction(actor, key) {
  if (key === "fastball") return useFastball(actor);
  if (key === "giantHijacker") return useGiantHijacker(actor);
  if (key === "endGiantHijacker") return clearGiantHijacker(actor, { reason: "dismount" });
  if (key === "shakeOffGiantHijacker") return shakeOffGiantHijacker(actor);
  if (key === "distantForce") return useDistantForce(actor);
  return null;
}

export function bindClashQualityChatCards(message, root) {
  const button = root?.querySelector?.("[data-action='dda-fastball-charge']");
  if (!button || button.dataset.ddaBound === "true") return;
  const request = message?.getFlag?.(SYSTEM_ID, "fastballRequest");
  const allowed = Boolean(request?.status === "ready" && (game.user.isGM || request.authorizedUserIds?.includes(game.user.id)));
  button.hidden = !allowed;
  button.disabled = !allowed;
  if (!allowed) return;
  button.dataset.ddaBound = "true";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    void resolveFastballCharge(message);
  });
}

async function followHijackerHost(document, changed, options = {}) {
  if (options.ddaGiantHijackerFollow || options.ddaGiantHijackerAttach) return;
  if (!("x" in changed || "y" in changed || "elevation" in changed)) return;
  const host = document.actor;
  const state = getHijackerState(host);
  if (!state.active || state.hostUuid !== host?.uuid) return;
  const rider = await resolveActor(state.riderUuid);
  const riderToken = getTokenForActor(rider);
  if (!riderToken) return;
  await updateToken(riderToken.document, {
    ...(Object.hasOwn(changed, "x") ? { x: changed.x } : {}),
    ...(Object.hasOwn(changed, "y") ? { y: changed.y } : {}),
    ...(Object.hasOwn(changed, "elevation") ? { elevation: changed.elevation } : {})
  }, { animate: false, ddaGiantHijackerFollow: true });
}

async function detachMovingRider(document, changed, options = {}) {
  if (options.ddaGiantHijackerFollow || options.ddaGiantHijackerAttach) return;
  if (!("x" in changed || "y" in changed || "elevation" in changed)) return;
  const rider = document.actor;
  const state = getHijackerState(rider);
  if (!state.active || state.riderUuid !== rider?.uuid) return;
  await clearGiantHijacker(rider, { reason: "riderMoved" });
}

export function registerClashQualities() {
  if (!globalThis.__ddaClashQualitySocketRegistered) {
    globalThis.__ddaClashQualitySocketRegistered = true;
    game.socket?.on(`system.${SYSTEM_ID}`, async (payload = {}, respond) => {
      if (payload.systemId !== SYSTEM_ID || !isPrimaryActiveGM()) return;
      if (![SOCKET_UPDATE_ACTOR, SOCKET_UPDATE_TOKEN].includes(payload.action)) return;
      try {
        if (payload.action === SOCKET_UPDATE_ACTOR) {
          const actor = await resolveActor(payload.actorUuid);
          if (!actor) throw new Error(`Actor not found: ${payload.actorUuid}`);
          await actor.update(payload.update ?? {}, payload.options ?? {});
        } else {
          const scene = game.scenes?.get(payload.sceneId) ?? canvas?.scene;
          const token = scene?.tokens?.get(payload.tokenId);
          if (!token) throw new Error(`Token not found: ${payload.tokenId}`);
          await token.update(payload.update ?? {}, payload.options ?? {});
        }
        if (typeof respond === "function") respond({ ok: true });
      } catch (error) {
        console.error("DDA | Clash Quality socket update failed.", error);
        if (typeof respond === "function") respond({ ok: false, error: String(error?.message ?? error) });
      }
    });
  }

  Hooks.on("updateToken", (document, changed, options) => {
    void followHijackerHost(document, changed, options);
    void detachMovingRider(document, changed, options);
  });

  Hooks.on("deleteToken", (document) => {
    const actor = document.actor;
    if (getHijackerState(actor).active) void clearGiantHijacker(actor, { reason: "tokenDeleted", announce: false });
  });

  Hooks.on("deleteCombat", () => {
    for (const actor of game.actors?.contents ?? []) {
      if (getHijackerState(actor).active) void clearGiantHijacker(actor, { reason: "combatEnded", announce: false });
    }
  });

  game.dda ??= {};
  game.dda.clashQualities = {
    useFastball,
    useGiantHijacker,
    shakeOffGiantHijacker,
    useDistantForce,
    clearGiantHijacker,
    getFastballAreaIntercedeCost
  };
}
