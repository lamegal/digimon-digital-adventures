import {
  areActorsAllies,
  getCombatId,
  getCombatRound,
  hasQuality
} from "../rules/quality-automation.js";
import { spendActorActions } from "./action-economy.js";
import { payPartnerInterruptAction } from "./tamer-actions.js";
import { getTokenGridDistance, isTokenCombatReady } from "./positioning.js";

const pendingRequests = new Map();
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

function text(pt, en) {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("pt") ? pt : en;
}

function number(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function escape(value = "") {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function movementOf(actor) {
  return Math.max(0, number(
    actor?.system?.movement?.land?.total
      ?? actor?.system?.movement?.land?.value
      ?? actor?.system?.derived?.movement?.value
      ?? actor?.system?.miscStats?.movement?.total
      ?? actor?.system?.miscStats?.movement?.value
      ?? actor?.system?.miscStats?.movement?.base
  ));
}

function ownerIds(actor) {
  return (game?.users?.contents ?? [])
    .filter((user) => user.active)
    .filter((user) => user.isGM || actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
    .map((user) => user.id);
}

function getIntercedeFreeSource(actor, target, distance) {
  const combatId = String(getCombatId() ?? "");
  const round = Number(getCombatRound() ?? 0);
  const usage = actor?.system?.combat?.intercedeUsage ?? {};

  const warden = actor?.system?.qualityFeatures?.dataOptimization ?? {};
  if (
    actor &&
    ["digimon", "npc"].includes(actor.type) &&
    warden.warden &&
    Number(warden.wardenInterruptActionDiscount ?? 0) >= 1 &&
    String(usage.wardenCombatId ?? "") !== combatId
  ) {
    return { key: "warden", sourceActorUuid: actor.uuid };
  }

  const protectedUsage = target?.system?.combat?.intercedeUsage ?? {};
  if (
    target &&
    distance <= 1 &&
    hasQuality(target, "packMaster") &&
    !(
      String(protectedUsage.packMasterCombatId ?? "") === combatId &&
      Number(protectedUsage.packMasterRound ?? -1) === round
    )
  ) {
    return { key: "packMaster", sourceActorUuid: target.uuid };
  }

  return null;
}

async function markFreeIntercedeUse(candidate, request) {
  const combatId = String(getCombatId() ?? "");
  const round = Number(getCombatRound() ?? 0);

  if (candidate.freeSource === "warden") {
    const actor = await fromUuid(candidate.actorUuid);
    await actor?.update({
      "system.combat.intercedeUsage.wardenCombatId": combatId
    });
    return true;
  }

  if (candidate.freeSource === "packMaster") {
    const target = await fromUuid(request.defenderUuid);
    await target?.update({
      "system.combat.intercedeUsage.packMasterCombatId": combatId,
      "system.combat.intercedeUsage.packMasterRound": round
    });
    return true;
  }

  return false;
}

async function payIntercedeAction(actor, candidate, request) {
  if (candidate.actionCost <= 0) {
    await markFreeIntercedeUse(candidate, request);
    return { success: true, payer: candidate.freeSource || "free" };
  }

  if (["digimon", "npc"].includes(actor.type)) {
    return payPartnerInterruptAction(actor, {
      reason: text("Interceder", "Intercede")
    });
  }

  const payment = await spendActorActions(actor, candidate.actionCost, {
    requireActiveUnit: false,
    notify: false
  });

  return payment ? { success: true, payer: "actor", ...payment } : null;
}

function eligibleInterceders(attacker, targetToken) {
  const target = targetToken?.actor;
  if (!target) return [];
  const seen = new Set();
  return (canvas?.tokens?.placeables ?? []).flatMap((token) => {
    const actor = token?.actor;
    if (!actor || token === targetToken || actor.uuid === attacker?.uuid || actor.uuid === target.uuid) return [];
    if (seen.has(actor.uuid) || !areActorsAllies(target, actor) || !isTokenCombatReady(token)) return [];
    if (!["character", "digimon", "npc"].includes(actor.type)) return [];
    const actions = Math.max(0, number(actor.system?.combat?.actions?.value));
    const movement = movementOf(actor);
    const distance = getTokenGridDistance(token, targetToken);
    const freeSource = getIntercedeFreeSource(actor, target, distance);
    const actionCost = freeSource ? 0 : 1;
    if (actions < actionCost || movement <= 0 || distance > movement) return [];
    const authorizedUserIds = ownerIds(actor);
    if (!authorizedUserIds.length) return [];
    seen.add(actor.uuid);
    return [{
      id: foundry.utils.randomID(),
      actorUuid: actor.uuid,
      actorName: actor.name,
      tokenId: token.id,
      sceneId: canvas.scene?.id ?? "",
      distance,
      movement,
      actionCost,
      freeSource: freeSource?.key ?? "",
      authorizedUserIds
    }];
  });
}

function requestCard(request) {
  return `
    <div class="dda-chat-card dda-intercede-card">
      <h2>${text("Janela de Interceder", "Intercede Window")}</h2>
      <p>${text(
        `<strong>${escape(request.attackerName)}</strong> declarou <strong>${escape(request.attackName)}</strong> contra <strong>${escape(request.defenderName)}</strong>.`,
        `<strong>${escape(request.attackerName)}</strong> declared <strong>${escape(request.attackName)}</strong> against <strong>${escape(request.defenderName)}</strong>.`
      )}</p>
      <p>${text("Um aliado elegível pode pagar o custo indicado, mover-se até o alvo e receber o ataque sem rolar Esquiva.", "An eligible ally may pay the listed cost, move to the target, and take the attack without rolling Dodge.")}</p>
      <div class="dda-intercede-options">
        ${request.candidates.map((candidate) => `
          <button type="button" data-action="dda-intercede" data-candidate-id="${candidate.id}">
            <i class="fas fa-shield-halved"></i>
            ${escape(candidate.actorName)}
            <small>${candidate.distance}/${candidate.movement} ${text("Espaços", "Spaces")} · ${candidate.actionCost > 0 ? `${candidate.actionCost}A` : text("Livre", "Free")}</small>
          </button>`).join("")}
        <button type="button" data-action="dda-intercede-decline">
          ${text("Prosseguir sem Interceder", "Continue without Interceding")}
        </button>
      </div>
    </div>`;
}

async function moveAdjacent(candidate, targetToken) {
  const token = canvas?.tokens?.get(candidate.tokenId);
  if (!token || !targetToken || getTokenGridDistance(token, targetToken) <= 1) return;
  const grid = Math.max(1, number(canvas.grid?.size, 100));
  const targetDocument = targetToken.document;
  const tokenDocument = token.document;
  const tx = number(targetDocument.x);
  const ty = number(targetDocument.y);
  const tw = Math.max(1, number(targetDocument.width, 1)) * grid;
  const th = Math.max(1, number(targetDocument.height, 1)) * grid;
  const iw = Math.max(1, number(tokenDocument.width, 1)) * grid;
  const ih = Math.max(1, number(tokenDocument.height, 1)) * grid;
  const candidates = [
    { x: tx - iw, y: ty }, { x: tx + tw, y: ty },
    { x: tx, y: ty - ih }, { x: tx, y: ty + th },
    { x: tx - iw, y: ty - ih }, { x: tx + tw, y: ty - ih },
    { x: tx - iw, y: ty + th }, { x: tx + tw, y: ty + th }
  ].sort((a, b) => Math.hypot(a.x - tokenDocument.x, a.y - tokenDocument.y) - Math.hypot(b.x - tokenDocument.x, b.y - tokenDocument.y));
  const destination = candidates.find((point) => {
    try {
      return !token.checkCollision({ x: point.x + iw / 2, y: point.y + ih / 2 }, { type: "move", mode: "any" });
    } catch (_error) {
      return true;
    }
  }) ?? candidates[0];
  await tokenDocument.update(destination, { ddaMovementUndo: true, animate: true });
}

async function resolveChoice(message, candidateId = "") {
  const request = message?.getFlag?.(game.system.id, "intercedeRequest");
  if (!request || request.status !== "pending") return false;
  const candidate = request.candidates.find((entry) => entry.id === candidateId) ?? null;
  const declining = !candidate;
  if (declining) {
    if (!game.user.isGM && request.requesterUserId !== game.user.id) return false;
  } else if (!game.user.isGM && !candidate.authorizedUserIds.includes(game.user.id)) {
    return false;
  }

  let actor = null;
  if (candidate) {
    actor = await fromUuid(candidate.actorUuid);
    if (!actor) return false;

    const payment = await payIntercedeAction(actor, candidate, request);
    if (!payment) {
      ui.notifications.warn(text("O personagem não possui mais Ações para Interceder.", "The character no longer has enough Actions to Intercede."));
      return false;
    }

    const targetToken = canvas?.tokens?.get(request.targetTokenId);
    await moveAdjacent(candidate, targetToken);
  }

  const resolvedRequest = {
    ...foundry.utils.deepClone(request),
    status: "resolved",
    declined: declining,
    resolverUserId: game.user.id,
    selectedCandidateId: candidate?.id ?? ""
  };

  await message.update({
    content: candidate
      ? `<div class="dda-chat-card dda-intercede-card is-resolved"><h2>${text("Interceder resolvido", "Intercede resolved")}</h2><p><strong>${escape(candidate.actorName)}</strong> ${text("assumiu o ataque.", "took over the attack.")}</p></div>`
      : `<div class="dda-chat-card dda-intercede-card is-declined"><p>${text("Ninguém Intercedeu. O ataque prossegue.", "Nobody Interceded. The attack continues.")}</p></div>`,
    [`flags.${game.system.id}.intercedeRequest`]: resolvedRequest
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor ?? undefined }),
    content: candidate
      ? `<div class="dda-chat-card dda-intercede-card is-resolved"><h2>${text("Interceder", "Intercede")}</h2><p><strong>${escape(candidate.actorName)}</strong> ${text("recebe o ataque no lugar do alvo original e não rola Esquiva.", "takes the attack instead of the original target and does not roll Dodge.")}</p></div>`
      : `<div class="dda-chat-card dda-intercede-card is-declined"><p>${text("Ninguém Intercedeu. O ataque prossegue.", "Nobody Interceded. The attack continues.")}</p></div>`,
    flags: { [game.system.id]: { intercedeResponse: {
      requestId: request.requestId,
      resolverUserId: game.user.id,
      declined: declining,
      candidate
    } } }
  });
  return true;
}

export function bindIntercedeChatCard(message, root) {
  const request = message?.getFlag?.(game.system.id, "intercedeRequest");
  if (!request || request.status !== "pending" || !root?.querySelectorAll) return;
  for (const button of root.querySelectorAll("[data-action='dda-intercede']")) {
    const candidate = request.candidates.find((entry) => entry.id === button.dataset.candidateId);
    const allowed = Boolean(candidate && (game.user.isGM || candidate.authorizedUserIds.includes(game.user.id)));
    button.hidden = !allowed;
    button.disabled = !allowed;
    if (allowed && !button.dataset.bound) {
      button.dataset.bound = "true";
      button.addEventListener("click", () => void resolveChoice(message, candidate.id));
    }
  }
  const decline = root.querySelector("[data-action='dda-intercede-decline']");
  if (decline) {
    const allowed = game.user.isGM || request.requesterUserId === game.user.id;
    decline.hidden = !allowed;
    decline.disabled = !allowed;
    if (allowed && !decline.dataset.bound) {
      decline.dataset.bound = "true";
      decline.addEventListener("click", () => void resolveChoice(message, ""));
    }
  }
}

export async function requestStandardIntercede({ attacker, targetToken, attackItem } = {}) {
  const candidates = eligibleInterceders(attacker, targetToken);
  if (!candidates.length) return null;
  const request = {
    requestId: foundry.utils.randomID(), status: "pending",
    requesterUserId: game.user.id,
    attackerUuid: attacker.uuid, attackerName: attacker.name,
    defenderUuid: targetToken.actor.uuid, defenderName: targetToken.actor.name,
    targetTokenId: targetToken.id, attackItemId: attackItem.id, attackName: attackItem.name,
    candidates
  };
  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: requestCard(request),
    flags: { [game.system.id]: { intercedeRequest: request } }
  });
  return new Promise((resolve) => {
    const timeoutId = globalThis.setTimeout(() => {
      pendingRequests.delete(request.requestId);
      resolve(null);
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(request.requestId, { ...request, messageId: message.id, timeoutId, resolve });
  });
}

export function registerIntercede() {
  Hooks.on("renderChatMessage", (message, html) => bindIntercedeChatCard(message, html?.[0] ?? html));
  Hooks.on("createChatMessage", (message) => {
    const response = message?.getFlag?.(game.system.id, "intercedeResponse");
    if (!response) return;
    const pending = pendingRequests.get(response.requestId);
    if (!pending) return;
    const candidate = response.candidate ?? null;
    if (candidate && !candidate.authorizedUserIds.includes(response.resolverUserId) && !game.users.get(response.resolverUserId)?.isGM) return;
    globalThis.clearTimeout(pending.timeoutId);
    pendingRequests.delete(response.requestId);
    pending.resolve(candidate);
  });
}
