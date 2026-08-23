import {
  areActorsAllies,
  areActorsAlliesForQualities,
  canSpendQuality,
  findQuality,
  getCombatId,
  getCombatRound,
  hasQuality,
  spendQualityUse
} from "../rules/quality-automation.js";
import { withDDAMovementContext } from "../canvas/movement-context.js";
import { spendActorActions } from "./action-economy.js";
import { payPartnerInterruptAction } from "./tamer-actions.js";
import {
  getTokenGridDistance,
  isTokenCombatReady,
  measureGridPointDistanceSpaces
} from "./positioning.js";

const pendingRequests = new Map();
const pendingAreaRequests = new Map();
const pendingAreaChatUpdates = new Map();
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const AREA_CHAT_UPDATE_TIMEOUT_MS = 10 * 1000;
const AREA_SOCKET_SCOPE = "areaIntercede";
const AREA_SOCKET_UPDATE_CHAT = "updateChatMessage";
const AREA_SOCKET_UPDATE_RESPONSE = "updateChatMessageResponse";

function reactionWindowMetadata(timeoutMs = REQUEST_TIMEOUT_MS) {
  const now = Date.now();
  return {
    combatId: String(game?.combat?.id ?? ""),
    sceneId: String(canvas?.scene?.id ?? game?.scenes?.current?.id ?? ""),
    createdAt: now,
    expiresAt: now + Math.max(1000, Number(timeoutMs ?? REQUEST_TIMEOUT_MS))
  };
}

function reactionWindowInvalidReason(request = {}) {
  if (!request || typeof request !== "object") return "missing";

  const createdAt = Number(request.createdAt ?? 0);
  const expiresAt = Number(request.expiresAt ?? 0);
  if (!(createdAt > 0) || !(expiresAt > 0)) return "staleLegacy";

  if (expiresAt > 0 && Date.now() >= expiresAt) return "timeout";

  const combatId = String(request.combatId ?? "");
  if (combatId) {
    const combat = game?.combats?.get?.(combatId)
      ?? (String(game?.combat?.id ?? "") === combatId ? game.combat : null);
    if (!combat) return "combatChanged";
    if (!combat.started) return "combatEnded";
  }

  const sceneId = String(request.sceneId ?? "");
  const currentSceneId = String(canvas?.scene?.id ?? game?.scenes?.current?.id ?? "");
  if (sceneId && currentSceneId && sceneId !== currentSceneId) return "sceneChanged";

  return "";
}

function reactionClosedText(reason = "cancelled") {
  const labels = {
    timeout: text("A janela de reação expirou.", "The reaction window expired."),
    combatEnded: text("O Combate terminou; esta reação não é mais válida.", "The Combat ended; this reaction is no longer valid."),
    combatChanged: text("Esta reação pertence a outro Combate.", "This reaction belongs to another Combat."),
    sceneChanged: text("Esta reação pertence a outra Cena.", "This reaction belongs to another Scene."),
    messageDeleted: text("O card da reação foi removido.", "The reaction card was removed."),
    staleLegacy: text("Este card de reação pertence a uma sessão anterior e foi invalidado.", "This reaction card belongs to an earlier session and was invalidated."),
    cancelled: text("A janela de reação foi encerrada.", "The reaction window was closed.")
  };
  return labels[reason] ?? labels.cancelled;
}

function closedIntercedeCard(title, reason = "cancelled") {
  return `<div class="dda-chat-card dda-intercede-card is-declined"><h2>${escape(title)}</h2><p>${escape(reactionClosedText(reason))}</p></div>`;
}

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

function primaryActiveGM() {
  return (game?.users?.contents ?? [])
    .filter((user) => user.active && user.isGM)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
}

function userCanUpdateMessage(message, user = game?.user) {
  if (!message || !user) return false;
  if (user.isGM) return true;
  try {
    return Boolean(message.canUserModify?.(user, "update"));
  } catch (_error) {
    return Boolean(message.author?.id && message.author.id === user.id);
  }
}

function areaMessageAllowsUser(message, userId = "") {
  const cleanUserId = String(userId ?? "");
  if (!cleanUserId) return false;
  const user = game?.users?.get(cleanUserId);
  if (user?.isGM) return true;

  const standardRequest = message?.getFlag?.(game.system.id, "intercedeRequest");
  if (standardRequest) {
    if (String(standardRequest.requesterUserId ?? "") === cleanUserId) return true;
    return (standardRequest.candidates ?? []).some((candidate) => (
      candidate.authorizedUserIds?.includes(cleanUserId)
    ));
  }

  const request = message?.getFlag?.(game.system.id, "areaIntercedeRequest");
  if (request) {
    if (String(request.requesterUserId ?? "") === cleanUserId) return true;
    return (request.candidates ?? []).some((candidate) => (
      candidate.authorizedUserIds?.includes(cleanUserId) ||
      candidate.throwAuthorizedUserIds?.includes(cleanUserId)
    ));
  }

  const throwRequest = message?.getFlag?.(game.system.id, "areaIntercedeThrow");
  if (throwRequest) {
    return Boolean(
      String(throwRequest.requesterUserId ?? "") === cleanUserId ||
      throwRequest.authorizedUserIds?.includes(cleanUserId)
    );
  }

  return false;
}

async function updateAreaChatMessage(message, update = {}) {
  if (!message) return false;
  if (userCanUpdateMessage(message)) {
    await message.update(update);
    return true;
  }

  const gm = primaryActiveGM();
  if (!gm) {
    ui.notifications.warn(text(
      "Esta reação precisa de um Mestre ativo para atualizar o card compartilhado.",
      "This reaction requires an active GM to update the shared card."
    ));
    return false;
  }

  const requestId = foundry.utils.randomID();
  return new Promise((resolve) => {
    const timeoutId = globalThis.setTimeout(() => {
      pendingAreaChatUpdates.delete(requestId);
      resolve(false);
    }, AREA_CHAT_UPDATE_TIMEOUT_MS);

    pendingAreaChatUpdates.set(requestId, { resolve, timeoutId });
    game.socket.emit(`system.${game.system.id}`, {
      scope: AREA_SOCKET_SCOPE,
      type: AREA_SOCKET_UPDATE_CHAT,
      requestId,
      requestingUserId: game.user.id,
      targetGmId: gm.id,
      messageId: message.id,
      update
    });
  });
}

async function markReactionMessageClosed(message, flagKey, request, title, reason = "cancelled") {
  if (!message || !request) return false;
  const next = {
    ...foundry.utils.deepClone(request),
    status: reason === "timeout" ? "expired" : "cancelled",
    closeReason: reason,
    closedAt: Date.now()
  };
  return updateAreaChatMessage(message, {
    content: closedIntercedeCard(title, reason),
    [`flags.${game.system.id}.${flagKey}`]: next
  });
}

function resolvePendingStandardIntercede(response = {}) {
  const requestId = String(response?.requestId ?? "");
  if (!requestId) return false;

  const pending = pendingRequests.get(requestId);
  if (!pending) return false;

  const candidate = response?.candidate ?? null;
  const resolverUserId = String(response?.resolverUserId ?? "");
  const resolver = game?.users?.get?.(resolverUserId) ?? null;
  const authorized = candidate
    ? Boolean(
        candidate.authorizedUserIds?.includes?.(resolverUserId) ||
        resolver?.isGM
      )
    : Boolean(
        resolver?.isGM ||
        resolverUserId === String(pending.requesterUserId ?? "")
      );

  if (!authorized) return false;

  if (pending.timeoutId) globalThis.clearTimeout(pending.timeoutId);
  pendingRequests.delete(requestId);
  pending.resolve(candidate);
  return true;
}

async function closeStandardIntercedeRequest(requestId, { reason = "cancelled", updateMessage = true } = {}) {
  const id = String(requestId ?? "");
  if (!id) return false;
  const pending = pendingRequests.get(id);
  if (!pending) return false;

  if (pending.timeoutId) globalThis.clearTimeout(pending.timeoutId);
  pendingRequests.delete(id);

  if (updateMessage) {
    const message = game.messages?.get(pending.messageId) ?? null;
    if (message) {
      const live = message.getFlag?.(game.system.id, "intercedeRequest") ?? pending;
      const next = {
        ...foundry.utils.deepClone(live),
        status: reason === "timeout" ? "expired" : "cancelled",
        closeReason: reason,
        closedAt: Date.now()
      };
      try {
        await updateAreaChatMessage(message, {
          content: closedIntercedeCard(text("Interceder", "Intercede"), reason),
          [`flags.${game.system.id}.intercedeRequest`]: next
        });
      } catch (error) {
        console.warn("DDA | Could not close stale Intercede card.", error);
      }
    }
  }

  pending.resolve(null);
  return true;
}

async function closeAreaIntercedeRequest(requestId, { reason = "cancelled", updateMessages = true } = {}) {
  const id = String(requestId ?? "");
  if (!id) return false;
  const pending = pendingAreaRequests.get(id);
  if (!pending) return false;

  if (pending.timeoutId) globalThis.clearTimeout(pending.timeoutId);
  pendingAreaRequests.delete(id);

  if (updateMessages) {
    for (const message of game.messages?.contents ?? []) {
      const areaRequest = message.getFlag?.(game.system.id, "areaIntercedeRequest") ?? null;
      if (String(areaRequest?.requestId ?? "") === id && ["pending", "awaitingThrow"].includes(String(areaRequest?.status ?? ""))) {
        const next = {
          ...foundry.utils.deepClone(areaRequest),
          status: reason === "timeout" ? "expired" : "cancelled",
          closeReason: reason,
          closedAt: Date.now()
        };
        try {
          await updateAreaChatMessage(message, {
            content: closedIntercedeCard(text("Interceder em Área", "Area Intercede"), reason),
            [`flags.${game.system.id}.areaIntercedeRequest`]: next
          });
        } catch (error) {
          console.warn("DDA | Could not close stale Area Intercede card.", error);
        }
      }

      const throwRequest = message.getFlag?.(game.system.id, "areaIntercedeThrow") ?? null;
      if (String(throwRequest?.requestId ?? "") !== id || !["ready", "moving"].includes(String(throwRequest?.status ?? ""))) continue;

      if (throwRequest.movementGranted && throwRequest.protectedActorUuid) {
        try {
          const actor = await fromUuid(throwRequest.protectedActorUuid);
          if (actor) await game.dda?.movementTracker?.clearForActor?.(actor);
        } catch (error) {
          console.warn("DDA | Could not clear expired Area Intercede throw movement.", error);
        }
      }

      const nextThrow = {
        ...foundry.utils.deepClone(throwRequest),
        status: reason === "timeout" ? "expired" : "cancelled",
        closeReason: reason,
        closedAt: Date.now()
      };
      try {
        await updateAreaChatMessage(message, {
          content: closedIntercedeCard(text("Area Intercede — Arremesso", "Area Intercede — Throw"), reason),
          [`flags.${game.system.id}.areaIntercedeThrow`]: nextThrow
        });
      } catch (error) {
        console.warn("DDA | Could not close stale Area Intercede throw card.", error);
      }
    }
  }

  pending.resolve(null);
  return true;
}

async function closeIntercedeRequestsForCombat(combat, reason = "combatEnded") {
  const combatId = String(combat?.id ?? "");
  if (!combatId) return;

  const standardIds = [...pendingRequests.entries()]
    .filter(([, request]) => String(request?.combatId ?? "") === combatId)
    .map(([id]) => id);
  for (const id of standardIds) await closeStandardIntercedeRequest(id, { reason, updateMessage: true });

  const areaIds = [...pendingAreaRequests.entries()]
    .filter(([, request]) => String(request?.combatId ?? "") === combatId)
    .map(([id]) => id);
  for (const id of areaIds) await closeAreaIntercedeRequest(id, { reason, updateMessages: true });
}

async function handleAreaIntercedeSocket(payload = {}) {
  if (payload?.scope !== AREA_SOCKET_SCOPE) return false;

  if (payload.type === AREA_SOCKET_UPDATE_RESPONSE) {
    if (String(payload.targetUserId ?? "") !== String(game.user?.id ?? "")) return true;
    const pending = pendingAreaChatUpdates.get(payload.requestId);
    if (!pending) return true;
    globalThis.clearTimeout(pending.timeoutId);
    pendingAreaChatUpdates.delete(payload.requestId);
    pending.resolve(Boolean(payload.ok));
    return true;
  }

  if (payload.type !== AREA_SOCKET_UPDATE_CHAT) return false;
  if (!game.user?.isGM || String(payload.targetGmId ?? "") !== String(game.user.id)) return true;

  let ok = false;
  try {
    const message = game.messages?.get(payload.messageId) ?? null;
    if (!message || !areaMessageAllowsUser(message, payload.requestingUserId)) {
      throw new Error("Unauthorized Area Intercede chat update.");
    }
    await message.update(payload.update ?? {});
    ok = true;
  } catch (error) {
    console.error("DDA | Area Intercede chat update failed.", error, payload);
  }

  game.socket.emit(`system.${game.system.id}`, {
    scope: AREA_SOCKET_SCOPE,
    type: AREA_SOCKET_UPDATE_RESPONSE,
    requestId: payload.requestId,
    targetUserId: payload.requestingUserId,
    ok
  });
  return true;
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

function cpuOf(actor) {
  return Math.max(0, number(
    actor?.system?.derivedStats?.cpu?.total
      ?? actor?.system?.derivedStats?.cpu?.value
      ?? actor?.system?.derivedStats?.cpu?.base
  ));
}

function getAreaIntercedeBaseCost(actor) {
  return hasQuality(actor, "fastball") ? 1 : 2;
}

function getAreaIntercedeThrowDistance(actor) {
  return Math.max(
    0,
    3 + cpuOf(actor) + (hasQuality(actor, "powerThrow") ? 3 : 0)
  );
}

function ownerIds(actor) {
  const charmIds = game?.dda?.bossQualities?.getCharmAuthorizedUserIds?.(actor, { includeGMs: true });
  if (Array.isArray(charmIds)) {
    const allowed = new Set(charmIds.map(String));
    return (game?.users?.contents ?? [])
      .filter((user) => user.active && allowed.has(String(user.id)))
      .map((user) => user.id);
  }
  return (game?.users?.contents ?? [])
    .filter((user) => user.active)
    .filter((user) => user.isGM || actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
    .map((user) => user.id);
}

function getIntercedeCostContext(actor, target, distance, baseCost = 1) {
  const normalizedBaseCost = Math.max(0, number(baseCost, 1));
  const combatId = String(getCombatId() ?? "");
  const round = Number(getCombatRound() ?? 0);
  const usage = actor?.system?.combat?.intercedeUsage ?? {};

  const protectedUsage = target?.system?.combat?.intercedeUsage ?? {};
  const packMasterAlreadyUsed = Boolean(
    (
      String(protectedUsage.packMasterCombatId ?? "") === combatId &&
      Number(protectedUsage.packMasterRound ?? -1) === round
    ) ||
    (canvas?.tokens?.placeables ?? []).some((token) => {
      const recorded = token?.actor?.system?.combat?.intercedeUsage?.packMasterSource ?? {};
      return Boolean(
        String(recorded.combatId ?? "") === combatId &&
        Number(recorded.round ?? -1) === round &&
        String(recorded.sourceActorUuid ?? "") === String(target?.uuid ?? "")
      );
    })
  );
  if (
    target &&
    distance <= 1 &&
    hasQuality(target, "packMaster") &&
    !packMasterAlreadyUsed
  ) {
    return {
      actionCost: 0,
      baseActionCost: normalizedBaseCost,
      discountSource: "packMaster",
      discountAmount: normalizedBaseCost,
      sourceActorUuid: target.uuid
    };
  }

  const warden = actor?.system?.qualityFeatures?.dataOptimization ?? {};
  if (
    actor &&
    ["digimon", "npc"].includes(actor.type) &&
    warden.warden &&
    Number(warden.wardenInterruptActionDiscount ?? 0) >= 1 &&
    String(usage.wardenCombatId ?? "") !== combatId
  ) {
    return {
      actionCost: Math.max(0, normalizedBaseCost - 1),
      baseActionCost: normalizedBaseCost,
      discountSource: "warden",
      discountAmount: Math.min(1, normalizedBaseCost),
      sourceActorUuid: actor.uuid
    };
  }

  return {
    actionCost: normalizedBaseCost,
    baseActionCost: normalizedBaseCost,
    discountSource: "",
    discountAmount: 0,
    sourceActorUuid: ""
  };
}

async function markIntercedeModifierUse(candidate, request) {
  const combatId = String(getCombatId() ?? "");
  const round = Number(getCombatRound() ?? 0);
  const source = String(candidate?.discountSource ?? candidate?.freeSource ?? "");

  if (source === "warden") {
    const actor = await fromUuid(candidate.actorUuid);
    await actor?.update({
      "system.combat.intercedeUsage.wardenCombatId": combatId
    });
    return true;
  }

  if (source === "packMaster") {
    const actor = await fromUuid(candidate.actorUuid);
    const targetUuid = String(candidate.protectedActorUuid ?? request.defenderUuid ?? "");
    await actor?.update({
      "system.combat.intercedeUsage.packMasterSource": {
        combatId,
        round,
        sourceActorUuid: targetUuid
      }
    });
    return true;
  }

  return false;
}

async function payIntercedeAction(actor, candidate, request) {
  if (candidate.actionCost <= 0) {
    await markIntercedeModifierUse(candidate, request);
    return {
      success: true,
      payer: candidate.discountSource || candidate.freeSource || "free",
      actionCost: 0
    };
  }

  let payment = null;

  if (["digimon", "npc"].includes(actor.type)) {
    payment = await payPartnerInterruptAction(actor, {
      reason: String(candidate.reasonLabel ?? text("Interceder", "Intercede")),
      partnerActionCost: Math.max(0, Number(candidate.actionCost ?? 1))
    });
  } else {
    const actorPayment = await spendActorActions(actor, candidate.actionCost, {
      requireActiveUnit: false,
      notify: false
    });
    payment = actorPayment
      ? { success: true, payer: "actor", ...actorPayment }
      : null;
  }

  if (!payment) return null;

  /*
   * Danger Sense substitutes the Digimon's Interrupt payment entirely.
   * If the Tamer paid instead, the Warden/Pack Master discount was not
   * actually consumed and remains available for a later Interrupt.
   */
  if (payment.payer !== "tamer" && (candidate.discountSource || candidate.freeSource)) {
    await markIntercedeModifierUse(candidate, request);
  }

  return payment;
}

async function eligibleInterceders(attacker, targetToken, { fatal = false } = {}) {
  const target = targetToken?.actor;
  if (!target) return [];
  const seen = new Set();
  const candidates = (canvas?.tokens?.placeables ?? []).flatMap((token) => {
    const actor = token?.actor;
    if (!actor || token === targetToken || actor.uuid === attacker?.uuid || actor.uuid === target.uuid) return [];
    if (seen.has(actor.uuid) || !areActorsAlliesForQualities(actor, target) || !isTokenCombatReady(token)) return [];
    if (!["character", "digimon", "npc"].includes(actor.type)) return [];
    if (isActorInClash(actor)) return [];
    if (
      !fatal &&
      ["digimon", "npc"].includes(actor.type) &&
      ["digimon", "npc"].includes(target.type) &&
      isActorInClash(target)
    ) return [];
    const actions = Math.max(0, number(actor.system?.combat?.actions?.value));
    const movement = movementOf(actor);
    const distance = getTokenGridDistance(token, targetToken);
    const travelRequired = Math.max(0, distance - 1);
    const sprintQuality = findQuality(actor, "sprint");
    const sprintAvailable = Boolean(sprintQuality && canSpendQuality(sprintQuality));
    const sprintRequired = travelRequired > movement;
    const effectiveMovement = movement * (sprintRequired && sprintAvailable ? 2 : 1);
    const costContext = getIntercedeCostContext(actor, target, distance, 1);
    const actionCost = costContext.actionCost;
    if ((actor.type === "character" && actions < actionCost) || movement <= 0 || travelRequired > effectiveMovement) return [];

    const trueGuardian = Boolean(actor.system?.qualityFeatures?.dataSpecialization?.trueGuardian);
    const unusedMovement = Math.max(0, effectiveMovement - travelRequired);
    const intercedeArmorBonus = trueGuardian ? Math.min(cpuOf(actor), unusedMovement) : 0;
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
      travelRequired,
      movement: effectiveMovement,
      baseMovement: movement,
      sprintRequired,
      sprintQualityId: sprintRequired ? sprintQuality?.id ?? "" : "",
      unusedMovement,
      trueGuardian,
      intercedeArmorBonus,
      actionCost,
      baseActionCost: costContext.baseActionCost,
      discountSource: costContext.discountSource,
      discountAmount: costContext.discountAmount,
      freeSource: actionCost <= 0 ? costContext.discountSource : "",
      reasonLabel: text("Interceder", "Intercede"),
      authorizedUserIds,
      blastEligible: false,
      blastTamerName: ""
    }];
  });

  if (!candidates.some((candidate) => {
    const actor = canvas?.tokens?.get(candidate.tokenId)?.actor;
    return actor?.type === "digimon";
  })) return candidates;

  try {
    const evolution = await import("./evolution.js");
    for (const candidate of candidates) {
      const actor = canvas?.tokens?.get(candidate.tokenId)?.actor;
      if (actor?.type !== "digimon") continue;
      candidate.blastActionCost = Math.max(1, Number(candidate.actionCost ?? 1) + 1);
      const eligibility = await evolution.getBlastIntercedeEligibility?.(actor, {
        digimonActionCost: candidate.blastActionCost
      });
      candidate.blastEligible = Boolean(eligibility?.eligible);
      candidate.blastTamerName = String(eligibility?.tamerName ?? "");
    }
  } catch (error) {
    console.warn("DDA | Could not evaluate Blast Intercede candidates.", error);
  }

  return candidates;
}

function requestCard(request) {
  const fatal = Boolean(request?.fatal);
  return `
    <div class="dda-chat-card dda-intercede-card ${fatal ? "is-fatal" : ""}">
      <h2>${fatal ? text("Interceder — Dano Fatal", "Intercede — Fatal Damage") : text("Janela de Interceder", "Intercede Window")}</h2>
      <p>${text(
        fatal
          ? `<strong>${escape(request.attackerName)}</strong> acertou <strong>${escape(request.defenderName)}</strong> e o Dano seria fatal.`
          : `<strong>${escape(request.attackerName)}</strong> declarou <strong>${escape(request.attackName)}</strong> contra <strong>${escape(request.defenderName)}</strong>.`,
        fatal
          ? `<strong>${escape(request.attackerName)}</strong> hit <strong>${escape(request.defenderName)}</strong> and the Damage would be fatal.`
          : `<strong>${escape(request.attackerName)}</strong> declared <strong>${escape(request.attackName)}</strong> against <strong>${escape(request.defenderName)}</strong>.`
      )}</p>
      <p>${fatal
        ? text("Pela exceção de Dano fatal, um aliado elegível ainda pode Interceder agora e receber o Ataque sem rolar Esquiva.", "Under the fatal-Damage exception, an eligible ally may still Intercede now and take the Attack without rolling Dodge.")
        : text("Um aliado elegível pode pagar o custo indicado, mover-se até o alvo e receber o ataque sem rolar Esquiva.", "An eligible ally may pay the listed cost, move to the target, and take the attack without rolling Dodge.")}</p>
      <div class="dda-intercede-options">
        ${request.candidates.map((candidate) => `
          <button type="button" data-action="dda-intercede" data-candidate-id="${candidate.id}">
            <i class="fas fa-shield-halved"></i>
            ${escape(candidate.actorName)}
            <small>
              ${candidate.travelRequired}/${candidate.movement} ${text("Espaços", "Spaces")} ·
              ${candidate.actionCost > 0 ? `${candidate.actionCost}A` : text("Livre", "Free")}
              ${candidate.sprintRequired ? ` · ${text("Arrancada", "Sprint")}` : ""}
              ${candidate.intercedeArmorBonus > 0
                ? ` · ${text("Guardião Verdadeiro", "True Guardian")} +${candidate.intercedeArmorBonus} ${text("Armadura", "Armor")}`
                : ""}
            </small>
          </button>
          ${candidate.blastEligible ? `
            <button type="button" class="dda-blast-intercede" data-action="dda-blast-intercede" data-candidate-id="${candidate.id}">
              <i class="fas fa-bolt"></i>
              ${text("Blast Intercede", "Blast Intercede")} — ${escape(candidate.actorName)}
              <small>${Math.max(1, Number(candidate.blastActionCost ?? candidate.actionCost + 1))}A ${text("Digimon", "Digimon")} · 1A ${text("Tamer", "Tamer")}${candidate.blastTamerName ? ` · ${escape(candidate.blastTamerName)}` : ""}</small>
            </button>`
          : ""}`
        ).join("")}
        <button type="button" data-action="dda-intercede-decline">
          ${text("Prosseguir sem Interceder", "Continue without Interceding")}
        </button>
      </div>
    </div>`;
}

async function moveAdjacent(candidate, targetToken, { templateId = "", preferInside = false } = {}) {
  const token = canvas?.tokens?.get(candidate.tokenId);
  if (!token || !targetToken) return;
  if (token.actor?.system?.status?.hidden) {
    const environment = await import("./environment.js");
    await environment.revealActorFromInteraction(token.actor, "intercede");
  }
  const currentDistance = getTokenGridDistance(token, targetToken);
  const currentTemplate = templateId ? canvas?.templates?.get?.(templateId) ?? null : null;
  const currentCenter = token.center ?? {
    x: Number(token.x ?? 0) + Number(token.w ?? canvas?.grid?.size ?? 100) / 2,
    y: Number(token.y ?? 0) + Number(token.h ?? canvas?.grid?.size ?? 100) / 2
  };
  const currentInside = Boolean(
    currentTemplate?.shape?.contains?.(
      currentCenter.x - Number(currentTemplate.document?.x ?? 0),
      currentCenter.y - Number(currentTemplate.document?.y ?? 0)
    )
  );
  if (currentDistance <= 1 && (!preferInside || currentInside)) return;
  const grid = Math.max(1, number(canvas.grid?.size, 100));
  const targetDocument = targetToken.document;
  const tokenDocument = token.document;
  const tx = number(targetDocument.x);
  const ty = number(targetDocument.y);
  const tw = Math.max(1, number(targetDocument.width, 1)) * grid;
  const th = Math.max(1, number(targetDocument.height, 1)) * grid;
  const iw = Math.max(1, number(tokenDocument.width, 1)) * grid;
  const ih = Math.max(1, number(tokenDocument.height, 1)) * grid;
  const templateObject = templateId ? canvas?.templates?.get?.(templateId) ?? null : null;
  const templateOrigin = {
    x: Number(templateObject?.document?.x ?? 0),
    y: Number(templateObject?.document?.y ?? 0)
  };
  const isInsideTemplate = (point) => {
    if (!preferInside || !templateObject?.shape?.contains) return true;
    const centerX = Number(point.x ?? 0) + iw / 2;
    const centerY = Number(point.y ?? 0) + ih / 2;
    return templateObject.shape.contains(
      centerX - templateOrigin.x,
      centerY - templateOrigin.y
    );
  };
  const candidates = [
    { x: tx - iw, y: ty }, { x: tx + tw, y: ty },
    { x: tx, y: ty - ih }, { x: tx, y: ty + th },
    { x: tx - iw, y: ty - ih }, { x: tx + tw, y: ty - ih },
    { x: tx - iw, y: ty + th }, { x: tx + tw, y: ty + th }
  ].sort((a, b) => {
    const insideDifference = Number(isInsideTemplate(b)) - Number(isInsideTemplate(a));
    if (insideDifference) return insideDifference;
    if (preferInside && templateObject) {
      const aOriginDistance = Math.hypot(
        a.x + iw / 2 - templateOrigin.x,
        a.y + ih / 2 - templateOrigin.y
      );
      const bOriginDistance = Math.hypot(
        b.x + iw / 2 - templateOrigin.x,
        b.y + ih / 2 - templateOrigin.y
      );
      if (aOriginDistance !== bOriginDistance) return aOriginDistance - bOriginDistance;
    }
    return Math.hypot(a.x - tokenDocument.x, a.y - tokenDocument.y) - Math.hypot(b.x - tokenDocument.x, b.y - tokenDocument.y);
  });
  const destination = candidates.find((point) => {
    try {
      return !token.checkCollision({ x: point.x + iw / 2, y: point.y + ih / 2 }, { type: "move", mode: "any" });
    } catch (_error) {
      return true;
    }
  }) ?? candidates[0];
  await tokenDocument.update(destination, withDDAMovementContext(
    { animate: true },
    {
      mode: "automated",
      movementBudget: "none",
      voluntary: true,
      reactions: true,
      traversal: true,
      source: "intercede",
      unwilling: false
    }
  ));
}

async function resolveChoice(message, candidateId = "", mode = "normal") {
  const request = message?.getFlag?.(game.system.id, "intercedeRequest");
  if (!request || request.status !== "pending") return false;
  const invalidReason = reactionWindowInvalidReason(request);
  if (invalidReason) {
    await markReactionMessageClosed(
      message,
      "intercedeRequest",
      request,
      text("Interceder", "Intercede"),
      invalidReason
    );
    ui.notifications.warn(reactionClosedText(invalidReason));
    return false;
  }
  const candidate = request.candidates.find((entry) => entry.id === candidateId) ?? null;
  const declining = !candidate;
  if (declining) {
    if (!game.user.isGM && request.requesterUserId !== game.user.id) return false;
  } else if (!game.user.isGM && !candidate.authorizedUserIds.includes(game.user.id)) {
    return false;
  }

  if (!userCanUpdateMessage(message) && !primaryActiveGM()) {
    ui.notifications.warn(text(
      "Interceder precisa de um Mestre ativo quando o jogador não é autor do card de ataque.",
      "Intercede requires an active GM when the player is not the attack card author."
    ));
    return false;
  }

  let actor = null;
  let blastEvolution = null;
  if (candidate) {
    actor = await fromUuid(candidate.actorUuid);
    if (!actor) return false;

    const sprintQuality = candidate.sprintRequired
      ? actor.items?.get?.(candidate.sprintQualityId) ?? findQuality(actor, "sprint")
      : null;
    if (candidate.sprintRequired && (!sprintQuality || !canSpendQuality(sprintQuality))) {
      ui.notifications.warn(text(
        "Arrancada não está mais disponível para este Interceder.",
        "Sprint is no longer available for this Intercede."
      ));
      return false;
    }

    if (mode === "blast") {
      if (!candidate.blastEligible || actor.type !== "digimon") return false;
      const evolution = await import("./evolution.js");
      blastEvolution = await evolution.prepareBlastIntercede?.({
        partnerActor: actor,
        request,
        digimonActionCost: Math.max(1, Number(candidate.blastActionCost ?? candidate.actionCost + 1)),
        beforeTransform: async () => {
          if (candidate.actionCost <= 0) {
            await markIntercedeModifierUse(candidate, request);
          }
          if (sprintQuality) {
            await spendQualityUse(actor, sprintQuality, {
              bucket: "movement",
              key: "sprintIntercede",
              state: { source: "intercede", requestId: request.requestId }
            });
          }
        }
      });
      if (!blastEvolution) return false;
    } else {
      const payment = await payIntercedeAction(actor, candidate, request);
      if (!payment) {
        ui.notifications.warn(text("O personagem não possui mais Ações para Interceder.", "The character no longer has enough Actions to Intercede."));
        return false;
      }
    }

    if (sprintQuality && mode !== "blast") {
      await spendQualityUse(actor, sprintQuality, {
        bucket: "movement",
        key: "sprintIntercede",
        state: { source: "intercede", requestId: request.requestId }
      });
    }

    const targetToken = canvas?.tokens?.get(request.targetTokenId);
    await moveAdjacent(candidate, targetToken);
  }

  const resolvedRequest = {
    ...foundry.utils.deepClone(request),
    status: "resolved",
    declined: declining,
    resolverUserId: game.user.id,
    selectedCandidateId: candidate?.id ?? "",
    selectedMode: candidate ? mode : ""
  };

  if (!await updateAreaChatMessage(message, {
    content: candidate
      ? `<div class="dda-chat-card dda-intercede-card is-resolved"><h2>${text("Interceder resolvido", "Intercede resolved")}</h2><p><strong>${escape(candidate.actorName)}</strong> ${text("assumiu o ataque.", "took over the attack.")}${candidate.sprintRequired ? ` ${text("Arrancada foi consumida.", "Sprint was spent.")}` : ""}</p></div>`
      : `<div class="dda-chat-card dda-intercede-card is-declined"><p>${text("Ninguém Intercedeu. O ataque prossegue.", "Nobody Interceded. The attack continues.")}</p></div>`,
    [`flags.${game.system.id}.intercedeRequest`]: resolvedRequest
  })) {
    ui.notifications.warn(text(
      "Não foi possível atualizar o card compartilhado de Intercede.",
      "Could not update the shared Intercede card."
    ));
    return false;
  }

  const responsePayload = {
    requestId: request.requestId,
    resolverUserId: game.user.id,
    declined: declining,
    candidate: candidate ? { ...candidate, blastEvolution } : null
  };

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor ?? undefined }),
    content: candidate
      ? `<div class="dda-chat-card dda-intercede-card is-resolved"><h2>${text("Interceder", "Intercede")}</h2><p><strong>${escape(candidate.actorName)}</strong> ${text("recebe o ataque no lugar do alvo original e não rola Esquiva.", "takes the attack instead of the original target and does not roll Dodge.")}</p>${candidate.sprintRequired ? `<p><strong>${text("Arrancada", "Sprint")}:</strong> ${text("Movimento dobrado para alcançar o aliado.", "Movement doubled to reach the ally.")}</p>` : ""}${candidate.intercedeArmorBonus > 0 ? `<p><strong>${text("Guardião Verdadeiro", "True Guardian")}:</strong> +${candidate.intercedeArmorBonus} ${text("Armadura neste ataque", "Armor for this attack")}.</p>` : ""}</div>`
      : `<div class="dda-chat-card dda-intercede-card is-declined"><p>${text("Ninguém Intercedeu. O ataque prossegue.", "Nobody Interceded. The attack continues.")}</p></div>`,
    flags: { [game.system.id]: { intercedeResponse: responsePayload } }
  });

  // Do not rely exclusively on the createChatMessage hook to wake the
  // originating attack. On the same client (the common GM/Enemy case),
  // resolve the pending Promise immediately. The hook remains as the
  // cross-client fallback when another authorized user answers the card.
  resolvePendingStandardIntercede(responsePayload);
  return true;
}

export function bindIntercedeChatCard(message, root) {
  const request = message?.getFlag?.(game.system.id, "intercedeRequest");
  if (!request || request.status !== "pending" || !root?.querySelectorAll) return;
  if (reactionWindowInvalidReason(request)) {
    for (const button of root.querySelectorAll("[data-action='dda-intercede'], [data-action='dda-blast-intercede'], [data-action='dda-intercede-decline']")) {
      button.hidden = true;
      button.disabled = true;
    }
    return;
  }
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
  for (const button of root.querySelectorAll("[data-action='dda-blast-intercede']")) {
    const candidate = request.candidates.find((entry) => entry.id === button.dataset.candidateId);
    const allowed = Boolean(candidate?.blastEligible && (game.user.isGM || candidate.authorizedUserIds.includes(game.user.id)));
    button.hidden = !allowed;
    button.disabled = !allowed;
    if (allowed && !button.dataset.bound) {
      button.dataset.bound = "true";
      button.addEventListener("click", () => void resolveChoice(message, candidate.id, "blast"));
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
  const candidates = await eligibleInterceders(attacker, targetToken);
  if (!candidates.length) return null;
  const request = {
    requestId: foundry.utils.randomID(), status: "pending",
    ...reactionWindowMetadata(),
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
      void closeStandardIntercedeRequest(request.requestId, {
        reason: "timeout",
        updateMessage: true
      });
    }, Math.max(1, Number(request.expiresAt ?? Date.now() + REQUEST_TIMEOUT_MS) - Date.now()));
    pendingRequests.set(request.requestId, { ...request, messageId: message.id, timeoutId, resolve });
  });
}


export async function requestFatalIntercede({ attacker, targetToken, attackItem, damage = 0 } = {}) {
  const candidates = await eligibleInterceders(attacker, targetToken, { fatal: true });
  if (!candidates.length) return null;
  const request = {
    requestId: foundry.utils.randomID(), status: "pending", fatal: true,
    prospectiveDamage: Math.max(0, Number(damage ?? 0)),
    ...reactionWindowMetadata(),
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
      void closeStandardIntercedeRequest(request.requestId, { reason: "timeout", updateMessage: true });
    }, Math.max(1, Number(request.expiresAt ?? Date.now() + REQUEST_TIMEOUT_MS) - Date.now()));
    pendingRequests.set(request.requestId, { ...request, messageId: message.id, timeoutId, resolve });
  });
}


function hasTrueGuardian(actor) {
  return Boolean(
    actor?.system?.qualityFeatures?.dataSpecialization?.trueGuardian ||
    actor?.system?.qualityFeatures?.dataOptimization?.trueGuardian ||
    actor?.items?.some?.((item) => {
      const selected = item?.system?.choices?.selected;
      const values = Array.isArray(selected) ? selected : [selected];
      return values.some((value) => String(value?.key ?? value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "") === "trueguardian");
    })
  );
}


function isActorInClash(actor) {
  return Boolean(
    actor?.system?.clash?.state?.active ||
    actor?.system?.combat?.clash?.active
  );
}

function tokenInsideTemplate(token, templateId = "") {
  const templateObject = templateId ? canvas?.templates?.get?.(templateId) ?? null : null;
  if (!token || !templateObject?.shape?.contains) return false;
  const center = token.center ?? {
    x: Number(token.x ?? 0) + Number(token.w ?? canvas?.grid?.size ?? 100) / 2,
    y: Number(token.y ?? 0) + Number(token.h ?? canvas?.grid?.size ?? 100) / 2
  };
  return Boolean(templateObject.shape.contains(
    center.x - Number(templateObject.document?.x ?? 0),
    center.y - Number(templateObject.document?.y ?? 0)
  ));
}

function intercedeCostLabel(candidate, mode = "area") {
  const actionCost = mode === "trueGuardian"
    ? Number(candidate.trueGuardianActionCost ?? 1)
    : Number(candidate.areaActionCost ?? 2);
  const baseCost = mode === "trueGuardian"
    ? Number(candidate.trueGuardianBaseActionCost ?? 1)
    : Number(candidate.areaBaseActionCost ?? 2);
  const source = mode === "trueGuardian"
    ? String(candidate.trueGuardianDiscountSource ?? "")
    : String(candidate.areaDiscountSource ?? "");

  const pieces = [
    actionCost > 0 ? `${actionCost}A` : text("Livre", "Free")
  ];

  if (source === "warden" && baseCost > actionCost) {
    pieces.push(text("Warden −1A", "Warden −1A"));
  } else if (source === "packMaster") {
    pieces.push(text("Pack Master", "Pack Master"));
  }

  return pieces.join(" · ");
}

function canOccupyAreaAdjacentToTarget(token, targetToken, templateId = "") {
  const templateObject = templateId ? canvas?.templates?.get?.(templateId) ?? null : null;
  if (!token || !targetToken || !templateObject?.shape?.contains) return false;

  const grid = Math.max(1, number(canvas.grid?.size, 100));
  const tokenDocument = token.document;
  const targetDocument = targetToken.document;
  const iw = Math.max(1, number(tokenDocument.width, 1)) * grid;
  const ih = Math.max(1, number(tokenDocument.height, 1)) * grid;
  const tw = Math.max(1, number(targetDocument.width, 1)) * grid;
  const th = Math.max(1, number(targetDocument.height, 1)) * grid;
  const tx = number(targetDocument.x);
  const ty = number(targetDocument.y);
  const originX = Number(templateObject.document?.x ?? 0);
  const originY = Number(templateObject.document?.y ?? 0);

  const currentCenter = token.center ?? {
    x: Number(tokenDocument.x ?? 0) + iw / 2,
    y: Number(tokenDocument.y ?? 0) + ih / 2
  };
  if (
    getTokenGridDistance(token, targetToken) <= 1 &&
    templateObject.shape.contains(currentCenter.x - originX, currentCenter.y - originY)
  ) return true;

  return [
    { x: tx - iw, y: ty }, { x: tx + tw, y: ty },
    { x: tx, y: ty - ih }, { x: tx, y: ty + th },
    { x: tx - iw, y: ty - ih }, { x: tx + tw, y: ty - ih },
    { x: tx - iw, y: ty + th }, { x: tx + tw, y: ty + th }
  ].some((point) => {
    const centerX = point.x + iw / 2;
    const centerY = point.y + ih / 2;
    if (!templateObject.shape.contains(centerX - originX, centerY - originY)) return false;
    try {
      return !token.checkCollision(
        { x: centerX, y: centerY },
        { type: "move", mode: "any" }
      );
    } catch (_error) {
      return true;
    }
  });
}

async function eligibleAreaInterceders(attacker, targetTokens = [], excludedCandidateKeys = [], templateId = "") {
  const targets = (targetTokens ?? []).filter((token) => token?.actor);
  const excluded = new Set((excludedCandidateKeys ?? []).map((value) => String(value ?? "")));
  if (!targets.length) return [];

  const candidates = [];

  for (const targetToken of targets) {
    const target = targetToken.actor;
    const seen = new Set();

    for (const token of canvas?.tokens?.placeables ?? []) {
      const actor = token?.actor;
      if (!actor || !["digimon", "npc"].includes(actor.type)) continue;
      if (token === targetToken || actor.uuid === attacker?.uuid || actor.uuid === target.uuid) continue;
      if (seen.has(actor.uuid) || !areActorsAlliesForQualities(actor, target) || !isTokenCombatReady(token)) continue;
      if (isActorInClash(actor)) continue;
      if (["digimon", "npc"].includes(target.type) && isActorInClash(target)) continue;

      const movement = movementOf(actor);
      const distance = getTokenGridDistance(token, targetToken);
      const travelRequired = Math.max(0, distance - 1);
      const sprintQuality = findQuality(actor, "sprint");
      const sprintAvailable = Boolean(sprintQuality && canSpendQuality(sprintQuality));
      const sprintRequired = travelRequired > movement;
      const effectiveMovement = movement * (sprintRequired && sprintAvailable ? 2 : 1);
      if (movement <= 0 || travelRequired > effectiveMovement) continue;
      if (!canOccupyAreaAdjacentToTarget(token, targetToken, templateId)) continue;

      const authorizedUserIds = ownerIds(actor);
      const throwAuthorizedUserIds = ownerIds(target);
      if (!authorizedUserIds.length || !throwAuthorizedUserIds.length) continue;

      const areaBaseActionCost = getAreaIntercedeBaseCost(actor);
      const areaCost = getIntercedeCostContext(
        actor,
        target,
        distance,
        areaBaseActionCost
      );
      const guardian = hasTrueGuardian(actor);
      const currentlyInsideArea = tokenInsideTemplate(token, templateId);
      const guardianCost = guardian && !currentlyInsideArea
        ? getIntercedeCostContext(actor, target, distance, 1)
        : null;
      const unusedMovement = Math.max(0, effectiveMovement - travelRequired);
      const intercedeArmorBonus = guardian
        ? Math.min(cpuOf(actor), unusedMovement)
        : 0;

      const candidateKey = `${actor.uuid}|${target.uuid}`;
      if (excluded.has(candidateKey)) continue;
      seen.add(actor.uuid);
      candidates.push({
        id: foundry.utils.randomID(),
        candidateKey,
        actorUuid: actor.uuid,
        actorName: actor.name,
        tokenId: token.id,
        sceneId: canvas.scene?.id ?? "",
        protectedActorUuid: target.uuid,
        protectedActorName: target.name,
        protectedTokenId: targetToken.id,
        distance,
        travelRequired,
        movement: effectiveMovement,
        baseMovement: movement,
        sprintRequired,
        sprintQualityId: sprintRequired ? sprintQuality?.id ?? "" : "",
        unusedMovement,
        trueGuardian: guardian,
        currentlyInsideArea,
        intercedeArmorBonus,
        areaActionCost: areaCost.actionCost,
        areaBaseActionCost: areaCost.baseActionCost,
        areaDiscountSource: areaCost.discountSource,
        areaDiscountAmount: areaCost.discountAmount,
        trueGuardianActionCost: guardianCost?.actionCost ?? null,
        trueGuardianBaseActionCost: guardianCost?.baseActionCost ?? null,
        trueGuardianDiscountSource: guardianCost?.discountSource ?? "",
        trueGuardianDiscountAmount: guardianCost?.discountAmount ?? 0,
        throwDistance: getAreaIntercedeThrowDistance(actor),
        authorizedUserIds,
        throwAuthorizedUserIds
      });
    }
  }

  return candidates;
}

function areaRequestCard(request) {
  return `
    <div class="dda-chat-card dda-intercede-card dda-area-intercede-card">
      <h2>${text("Janela de Interceder em Área", "Area Intercede Window")}</h2>
      <p>${text(
        `<strong>${escape(request.attackerName)}</strong> declarou o Ataque em Área <strong>${escape(request.attackName)}</strong>. Um Digimon elegível pode proteger um dos alvos antes das rolagens.`,
        `<strong>${escape(request.attackerName)}</strong> declared the Area Attack <strong>${escape(request.attackName)}</strong>. An eligible Digimon may protect one of the targets before rolls are made.`
      )}</p>
      <div class="dda-intercede-options">
        ${request.candidates.map((candidate) => `
          <div class="dda-area-intercede-option">
            <strong>${escape(candidate.actorName)} → ${escape(candidate.protectedActorName)}</strong>
            <small>
              ${candidate.travelRequired}/${candidate.movement} ${text("Espaços", "Spaces")}
              ${candidate.sprintRequired ? ` · ${text("Arrancada", "Sprint")}` : ""}
              · ${text("Arremesso", "Throw")} ${candidate.throwDistance}
            </small>
            <button type="button" data-action="dda-area-intercede" data-candidate-id="${candidate.id}" data-mode="area">
              <i class="fas fa-people-arrows-left-right"></i>
              ${text("Area Intercede", "Area Intercede")} — ${intercedeCostLabel(candidate, "area")}
            </button>
            ${candidate.trueGuardian && !candidate.currentlyInsideArea ? `
              <button type="button" data-action="dda-area-intercede" data-candidate-id="${candidate.id}" data-mode="trueGuardian">
                <i class="fas fa-shield"></i>
                ${text("Guardião Verdadeiro: entrar na área", "True Guardian: enter the area")} — ${intercedeCostLabel(candidate, "trueGuardian")}
              </button>` : ""}
          </div>
        `).join("")}
        <button type="button" data-action="dda-area-intercede-decline">
          ${text("Prosseguir sem outra Intercede", "Continue without another Intercede")}
        </button>
      </div>
    </div>`;
}

function throwRequestCard(request) {
  if (request.status === "moving") {
    return `
      <div class="dda-chat-card dda-intercede-card dda-area-intercede-throw-card">
        <h2>${text("Area Intercede — Arremesso", "Area Intercede — Throw")}</h2>
        <p>${text(
          `Reposicione <strong>${escape(request.protectedActorName)}</strong> em até <strong>${request.throwDistance}</strong> Espaços e confirme a posição.`,
          `Reposition <strong>${escape(request.protectedActorName)}</strong> up to <strong>${request.throwDistance}</strong> Spaces, then confirm the position.`
        )}</p>
        <button type="button" data-action="dda-area-intercede-throw-confirm">
          <i class="fas fa-check"></i> ${text("Confirmar posição", "Confirm position")}
        </button>
      </div>`;
  }

  return `
    <div class="dda-chat-card dda-intercede-card dda-area-intercede-throw-card">
      <h2>${text("Area Intercede — Arremesso", "Area Intercede — Throw")}</h2>
      <p>${text(
        `<strong>${escape(request.intercederName)}</strong> alcançou <strong>${escape(request.protectedActorName)}</strong>. O alvo pode ser arremessado até <strong>${request.throwDistance}</strong> Espaços.`,
        `<strong>${escape(request.intercederName)}</strong> reached <strong>${escape(request.protectedActorName)}</strong>. The protected target may be thrown up to <strong>${request.throwDistance}</strong> Spaces.`
      )}</p>
      <p>${text("O controlador do alvo arremessado ou o GM deve iniciar o reposicionamento.", "The thrown target's controller or the GM must begin repositioning.")}</p>
      <button type="button" data-action="dda-area-intercede-throw-start">
        <i class="fas fa-arrows-up-down-left-right"></i> ${text("Reposicionar alvo", "Reposition target")}
      </button>
    </div>`;
}

async function createAreaIntercedeResponse(request, candidate, mode) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({
      actor: await fromUuid(candidate.actorUuid)
    }),
    content: `<div class="dda-chat-card dda-intercede-card is-resolved">
      <h2>${text("Intercede em Área resolvida", "Area Intercede resolved")}</h2>
      <p>${mode === "trueGuardian"
        ? text(
            `<strong>${escape(candidate.actorName)}</strong> entrou na área para proteger <strong>${escape(candidate.protectedActorName)}</strong>.`,
            `<strong>${escape(candidate.actorName)}</strong> entered the area to protect <strong>${escape(candidate.protectedActorName)}</strong>.`
          )
        : text(
            `<strong>${escape(candidate.actorName)}</strong> arremessou <strong>${escape(candidate.protectedActorName)}</strong>. A área será recalculada antes das rolagens.`,
            `<strong>${escape(candidate.actorName)}</strong> threw <strong>${escape(candidate.protectedActorName)}</strong>. The area will be recalculated before rolls.`
          )}</p>
    </div>`,
    flags: {
      [game.system.id]: {
        areaIntercedeResponse: {
          requestId: request.requestId,
          resolverUserId: game.user.id,
          declined: false,
          candidate: {
            ...candidate,
            mode
          }
        }
      }
    }
  });
}

async function resolveAreaChoice(message, candidateId = "", mode = "area") {
  const request = message?.getFlag?.(game.system.id, "areaIntercedeRequest");
  if (!request || request.status !== "pending") return false;
  const invalidReason = reactionWindowInvalidReason(request);
  if (invalidReason) {
    await markReactionMessageClosed(
      message,
      "areaIntercedeRequest",
      request,
      text("Interceder em Área", "Area Intercede"),
      invalidReason
    );
    ui.notifications.warn(reactionClosedText(invalidReason));
    return false;
  }
  const candidate = request.candidates.find((entry) => entry.id === candidateId) ?? null;

  if (!candidate) {
    if (!game.user.isGM && request.requesterUserId !== game.user.id) return false;
    const resolvedRequest = {
      ...foundry.utils.deepClone(request),
      status: "resolved",
      declined: true,
      resolverUserId: game.user.id
    };
    if (!await updateAreaChatMessage(message, {
      content: `<div class="dda-chat-card dda-intercede-card is-declined"><p>${text("Nenhuma outra Intercede em Área foi declarada. O ataque prossegue.", "No further Area Intercede was declared. The attack continues.")}</p></div>`,
      [`flags.${game.system.id}.areaIntercedeRequest`]: resolvedRequest
    })) return false;
    await ChatMessage.create({
      content: `<div class="dda-chat-card dda-intercede-card is-declined"><p>${text("A janela de Intercede em Área foi encerrada.", "The Area Intercede window was closed.")}</p></div>`,
      flags: {
        [game.system.id]: {
          areaIntercedeResponse: {
            requestId: request.requestId,
            resolverUserId: game.user.id,
            declined: true,
            candidate: null
          }
        }
      }
    });
    return true;
  }

  if (!game.user.isGM && !candidate.authorizedUserIds.includes(game.user.id)) return false;
  if (!["area", "trueGuardian"].includes(mode)) return false;
  if (mode === "trueGuardian" && (!candidate.trueGuardian || candidate.currentlyInsideArea)) return false;
  if (!userCanUpdateMessage(message) && !primaryActiveGM()) {
    ui.notifications.warn(text(
      "Interceder em Área precisa de um Mestre ativo quando o jogador não é autor do card.",
      "Area Intercede requires an active GM when the player is not the card author."
    ));
    return false;
  }

  const actor = await fromUuid(candidate.actorUuid);
  if (!actor) return false;

  const sprintQuality = candidate.sprintRequired
    ? actor.items?.get?.(candidate.sprintQualityId) ?? findQuality(actor, "sprint")
    : null;
  if (candidate.sprintRequired && (!sprintQuality || !canSpendQuality(sprintQuality))) {
    ui.notifications.warn(text(
      "Arrancada não está mais disponível para esta Intercede.",
      "Sprint is no longer available for this Intercede."
    ));
    return false;
  }

  const actionCost = mode === "trueGuardian"
    ? Number(candidate.trueGuardianActionCost ?? 1)
    : Number(candidate.areaActionCost ?? 2);
  const discountSource = mode === "trueGuardian"
    ? String(candidate.trueGuardianDiscountSource ?? "")
    : String(candidate.areaDiscountSource ?? "");
  const baseActionCost = mode === "trueGuardian"
    ? Number(candidate.trueGuardianBaseActionCost ?? 1)
    : Number(candidate.areaBaseActionCost ?? 2);

  const paymentCandidate = {
    ...candidate,
    actionCost,
    baseActionCost,
    discountSource,
    freeSource: actionCost <= 0 ? discountSource : "",
    reasonLabel: mode === "trueGuardian"
      ? text("Guardião Verdadeiro — Interceder em Área", "True Guardian — Area Intercede")
      : text("Interceder em Área", "Area Intercede")
  };

  const payment = await payIntercedeAction(actor, paymentCandidate, {
    ...request,
    defenderUuid: candidate.protectedActorUuid
  });
  if (!payment) {
    ui.notifications.warn(text(
      "A Intercede em Área não pôde ser paga.",
      "The Area Intercede could not be paid."
    ));
    return false;
  }

  if (
    candidate.trueGuardian &&
    actionCost >= 2 &&
    payment.payer !== "tamer"
  ) {
    await actor.update({
      "system.combat.intercedeUsage.trueGuardianRefund": {
        pending: true,
        combatId: String(getCombatId() ?? ""),
        round: Number(getCombatRound() ?? 0),
        sourceRequestId: request.requestId
      }
    });
  }

  if (sprintQuality) {
    await spendQualityUse(actor, sprintQuality, {
      bucket: "movement",
      key: "sprintAreaIntercede",
      state: { source: "areaIntercede", requestId: request.requestId }
    });
  }

  const protectedToken = canvas?.tokens?.get(candidate.protectedTokenId);
  if (!protectedToken) return false;
  await moveAdjacent(candidate, protectedToken, {
    templateId: String(request.templateId ?? ""),
    preferInside: true
  });

  const resolvedRequest = {
    ...foundry.utils.deepClone(request),
    status: mode === "area" ? "awaitingThrow" : "resolved",
    declined: false,
    resolverUserId: game.user.id,
    selectedCandidateId: candidate.id,
    selectedMode: mode
  };
  if (!await updateAreaChatMessage(message, {
    content: `<div class="dda-chat-card dda-intercede-card is-resolved"><h2>${text("Intercede em Área declarada", "Area Intercede declared")}</h2><p><strong>${escape(candidate.actorName)}</strong> → <strong>${escape(candidate.protectedActorName)}</strong> · ${actionCost > 0 ? `${actionCost}A` : text("Livre", "Free")}${candidate.sprintRequired ? ` · ${text("Arrancada", "Sprint")}` : ""}</p>${mode === "area" ? `<p>${text("Aguardando o reposicionamento do alvo arremessado.", "Waiting for the thrown target to be repositioned.")}</p>` : ""}</div>`,
    [`flags.${game.system.id}.areaIntercedeRequest`]: resolvedRequest
  })) return false;

  const resolvedCandidate = {
    ...candidate,
    actionCost,
    baseActionCost,
    discountSource,
    paymentPayer: String(payment.payer ?? ""),
    mode
  };

  if (mode === "trueGuardian") {
    await createAreaIntercedeResponse(request, resolvedCandidate, mode);
    return true;
  }

  const throwRequest = {
    requestId: request.requestId,
    status: "ready",
    combatId: String(request.combatId ?? game?.combat?.id ?? ""),
    sceneId: String(request.sceneId ?? canvas?.scene?.id ?? ""),
    createdAt: Number(request.createdAt ?? Date.now()),
    expiresAt: Number(request.expiresAt ?? (Date.now() + REQUEST_TIMEOUT_MS)),
    requesterUserId: String(request.requesterUserId ?? ""),
    intercederActorUuid: candidate.actorUuid,
    intercederName: candidate.actorName,
    intercederTokenId: candidate.tokenId,
    protectedActorUuid: candidate.protectedActorUuid,
    protectedActorName: candidate.protectedActorName,
    protectedTokenId: candidate.protectedTokenId,
    throwStartX: Number(protectedToken.document?.x ?? protectedToken.x ?? 0),
    throwStartY: Number(protectedToken.document?.y ?? protectedToken.y ?? 0),
    throwDistance: Math.max(0, Number(candidate.throwDistance ?? 0)),
    authorizedUserIds: candidate.throwAuthorizedUserIds,
    candidate: resolvedCandidate
  };

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: throwRequestCard(throwRequest),
    flags: { [game.system.id]: { areaIntercedeThrow: throwRequest } }
  });
  return true;
}

async function startAreaIntercedeThrow(message) {
  const request = message?.getFlag?.(game.system.id, "areaIntercedeThrow");
  if (!request || request.status !== "ready") return false;
  const invalidReason = reactionWindowInvalidReason(request);
  if (invalidReason) {
    await markReactionMessageClosed(
      message,
      "areaIntercedeThrow",
      request,
      text("Area Intercede — Arremesso", "Area Intercede — Throw"),
      invalidReason
    );
    ui.notifications.warn(reactionClosedText(invalidReason));
    return false;
  }
  if (!game.user.isGM && !request.authorizedUserIds?.includes(game.user.id)) return false;

  const actor = await fromUuid(request.protectedActorUuid);
  if (!actor) return false;

  const movementGranted = await game.dda?.movementTracker?.grantMovement?.(
    actor,
    Math.max(0, Number(request.throwDistance ?? 0)),
    {
      kind: "areaIntercedeThrow",
      actionCost: 0,
      source: "areaIntercede",
      sourceActorUuid: String(request.intercederActorUuid ?? ""),
      sourceActorName: String(request.intercederName ?? ""),
      label: text("Arremesso de Area Intercede", "Area Intercede Throw")
    }
  );

  const next = {
    ...foundry.utils.deepClone(request),
    status: "moving",
    movementGranted: Boolean(movementGranted),
    moverUserId: game.user.id
  };
  if (!await updateAreaChatMessage(message, {
    content: throwRequestCard(next),
    [`flags.${game.system.id}.areaIntercedeThrow`]: next
  })) {
    if (movementGranted) await game.dda?.movementTracker?.clearForActor?.(actor);
    return false;
  }

  if (!movementGranted) {
    ui.notifications.warn(text(
      "O rastreador de movimento não pôde ser concedido. Reposicione o token manualmente dentro do alcance do arremesso e confirme.",
      "The movement tracker could not be granted. Reposition the token manually within throw range and confirm."
    ));
  }
  return true;
}

async function confirmAreaIntercedeThrow(message) {
  const request = message?.getFlag?.(game.system.id, "areaIntercedeThrow");
  if (!request || request.status !== "moving") return false;
  const invalidReason = reactionWindowInvalidReason(request);
  if (invalidReason) {
    if (request.movementGranted && request.protectedActorUuid) {
      try {
        const staleActor = await fromUuid(request.protectedActorUuid);
        if (staleActor) await game.dda?.movementTracker?.clearForActor?.(staleActor);
      } catch (_error) {}
    }
    await markReactionMessageClosed(
      message,
      "areaIntercedeThrow",
      request,
      text("Area Intercede — Arremesso", "Area Intercede — Throw"),
      invalidReason
    );
    ui.notifications.warn(reactionClosedText(invalidReason));
    return false;
  }
  if (!game.user.isGM && !request.authorizedUserIds?.includes(game.user.id)) return false;

  const actor = await fromUuid(request.protectedActorUuid);
  const token = canvas?.tokens?.get(request.protectedTokenId) ?? null;
  const trackedMovement = request.movementGranted
    ? Number(game.dda?.movementTracker?.getCurrentMovementSpent?.(actor) ?? NaN)
    : NaN;
  const movedSpaces = Number.isFinite(trackedMovement)
    ? Math.max(0, trackedMovement)
    : token
      ? (() => {
          const offsetX = Number(token.center?.x ?? 0) - Number(token.document?.x ?? token.x ?? 0);
          const offsetY = Number(token.center?.y ?? 0) - Number(token.document?.y ?? token.y ?? 0);
          const startCenter = {
            x: Number(request.throwStartX ?? 0) + offsetX,
            y: Number(request.throwStartY ?? 0) + offsetY
          };
          return measureGridPointDistanceSpaces(startCenter, token.center);
        })()
      : 0;
  if (movedSpaces > Math.max(0, Number(request.throwDistance ?? 0)) + 0.25) {
    ui.notifications.warn(text(
      `O alvo foi movido ${movedSpaces.toFixed(1)} Espaços; o alcance máximo deste arremesso é ${request.throwDistance}.`,
      `The target was moved ${movedSpaces.toFixed(1)} Spaces; this throw's maximum range is ${request.throwDistance}.`
    ));
    return false;
  }

  const next = {
    ...foundry.utils.deepClone(request),
    status: "resolved",
    resolverUserId: game.user.id
  };
  if (!await updateAreaChatMessage(message, {
    content: `<div class="dda-chat-card dda-intercede-card is-resolved"><h2>${text("Arremesso confirmado", "Throw confirmed")}</h2><p><strong>${escape(request.protectedActorName)}</strong> ${text("foi reposicionado. O Ataque em Área será recalculado.", "was repositioned. The Area Attack will now be recalculated.")}</p></div>`,
    [`flags.${game.system.id}.areaIntercedeThrow`]: next
  })) return false;

  await game.dda?.movementTracker?.clearForActor?.(actor);

  const parentRequest = {
    requestId: request.requestId
  };
  await createAreaIntercedeResponse(
    parentRequest,
    request.candidate,
    "area"
  );
  return true;
}

function bindAreaIntercedeChatCard(message, root) {
  const request = message?.getFlag?.(game.system.id, "areaIntercedeRequest");
  const invalidAreaReason = request?.status === "pending"
    ? reactionWindowInvalidReason(request)
    : "";
  if (invalidAreaReason && root?.querySelectorAll) {
    for (const button of root.querySelectorAll("[data-action='dda-area-intercede'], [data-action='dda-area-intercede-decline']")) {
      button.hidden = true;
      button.disabled = true;
    }
  } else if (request?.status === "pending" && root?.querySelectorAll) {
    for (const button of root.querySelectorAll("[data-action='dda-area-intercede']")) {
      const candidate = request.candidates.find((entry) => entry.id === button.dataset.candidateId);
      const allowed = Boolean(candidate && (game.user.isGM || candidate.authorizedUserIds.includes(game.user.id)));
      button.hidden = !allowed;
      button.disabled = !allowed;
      if (allowed && !button.dataset.bound) {
        button.dataset.bound = "true";
        button.addEventListener("click", () => void resolveAreaChoice(
          message,
          candidate.id,
          String(button.dataset.mode ?? "area")
        ));
      }
    }

    const decline = root.querySelector("[data-action='dda-area-intercede-decline']");
    if (decline) {
      const allowed = game.user.isGM || request.requesterUserId === game.user.id;
      decline.hidden = !allowed;
      decline.disabled = !allowed;
      if (allowed && !decline.dataset.bound) {
        decline.dataset.bound = "true";
        decline.addEventListener("click", () => void resolveAreaChoice(message, ""));
      }
    }
  }

  const throwRequest = message?.getFlag?.(game.system.id, "areaIntercedeThrow");
  if (!throwRequest || !root?.querySelector) return;
  const validWindow = !reactionWindowInvalidReason(throwRequest);
  const allowed = validWindow && (game.user.isGM || throwRequest.authorizedUserIds?.includes(game.user.id));

  const start = root.querySelector("[data-action='dda-area-intercede-throw-start']");
  if (start) {
    start.hidden = !allowed;
    start.disabled = !allowed;
    if (allowed && !start.dataset.bound) {
      start.dataset.bound = "true";
      start.addEventListener("click", () => void startAreaIntercedeThrow(message));
    }
  }

  const confirm = root.querySelector("[data-action='dda-area-intercede-throw-confirm']");
  if (confirm) {
    confirm.hidden = !allowed;
    confirm.disabled = !allowed;
    if (allowed && !confirm.dataset.bound) {
      confirm.dataset.bound = "true";
      confirm.addEventListener("click", () => void confirmAreaIntercedeThrow(message));
    }
  }
}

export async function requestAreaIntercede({
  attacker,
  targetTokens = [],
  attackItem,
  templateId = "",
  excludedCandidateKeys = []
} = {}) {
  if (!attacker || !attackItem || !game?.combat?.started) return null;
  const candidates = await eligibleAreaInterceders(
    attacker,
    targetTokens,
    excludedCandidateKeys,
    templateId
  );
  if (!candidates.length) return null;

  const request = {
    requestId: foundry.utils.randomID(),
    status: "pending",
    ...reactionWindowMetadata(),
    requesterUserId: game.user.id,
    attackerUuid: attacker.uuid,
    attackerName: attacker.name,
    attackItemId: attackItem.id,
    attackName: attackItem.name,
    templateId: String(templateId ?? ""),
    targetTokenIds: targetTokens.map((token) => token.id),
    candidates
  };

  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: areaRequestCard(request),
    flags: { [game.system.id]: { areaIntercedeRequest: request } }
  });

  return new Promise((resolve) => {
    const timeoutId = globalThis.setTimeout(() => {
      void closeAreaIntercedeRequest(request.requestId, {
        reason: "timeout",
        updateMessages: true
      });
    }, Math.max(1, Number(request.expiresAt ?? Date.now() + REQUEST_TIMEOUT_MS) - Date.now()));
    pendingAreaRequests.set(request.requestId, {
      ...request,
      messageId: message.id,
      timeoutId,
      resolve
    });
  });
}

export function registerIntercede() {
  if (!globalThis.__ddaAreaIntercedeSocketRegistered) {
    globalThis.__ddaAreaIntercedeSocketRegistered = true;
    game.socket?.on(`system.${game.system.id}`, (payload = {}) => {
      void handleAreaIntercedeSocket(payload);
    });
  }

  Hooks.on("renderChatMessageHTML", (message, html) => {
    bindIntercedeChatCard(message, html);
    bindAreaIntercedeChatCard(message, html);
  });
  Hooks.on("createChatMessage", (message) => {
    const response = message?.getFlag?.(game.system.id, "intercedeResponse");
    if (response) resolvePendingStandardIntercede(response);

    const areaResponse = message?.getFlag?.(game.system.id, "areaIntercedeResponse");
    if (!areaResponse) return;
    const pendingArea = pendingAreaRequests.get(areaResponse.requestId);
    if (!pendingArea) return;
    const candidate = areaResponse.candidate ?? null;
    const authorized = Boolean(
      !candidate ||
      candidate.authorizedUserIds?.includes(areaResponse.resolverUserId) ||
      candidate.throwAuthorizedUserIds?.includes(areaResponse.resolverUserId) ||
      game.users.get(areaResponse.resolverUserId)?.isGM
    );
    if (!authorized) return;
    globalThis.clearTimeout(pendingArea.timeoutId);
    pendingAreaRequests.delete(areaResponse.requestId);
    pendingArea.resolve(candidate);
  });

  Hooks.on("deleteChatMessage", (message) => {
    const standard = message?.getFlag?.(game.system.id, "intercedeRequest") ?? null;
    if (standard?.requestId && pendingRequests.has(String(standard.requestId))) {
      void closeStandardIntercedeRequest(standard.requestId, {
        reason: "messageDeleted",
        updateMessage: false
      });
    }

    const area = message?.getFlag?.(game.system.id, "areaIntercedeRequest") ?? null;
    if (area?.requestId && pendingAreaRequests.has(String(area.requestId))) {
      void closeAreaIntercedeRequest(area.requestId, {
        reason: "messageDeleted",
        updateMessages: true
      });
      return;
    }

    const throwRequest = message?.getFlag?.(game.system.id, "areaIntercedeThrow") ?? null;
    if (throwRequest?.requestId && pendingAreaRequests.has(String(throwRequest.requestId))) {
      void (async () => {
        if (throwRequest.movementGranted && throwRequest.protectedActorUuid) {
          try {
            const actor = await fromUuid(throwRequest.protectedActorUuid);
            if (actor) await game.dda?.movementTracker?.clearForActor?.(actor);
          } catch (error) {
            console.warn("DDA | Could not clear deleted Area Intercede throw movement.", error);
          }
        }
        await closeAreaIntercedeRequest(throwRequest.requestId, {
          reason: "messageDeleted",
          updateMessages: true
        });
      })();
    }
  });

  Hooks.on("combatEnd", (combat) => {
    void closeIntercedeRequestsForCombat(combat, "combatEnded");
  });

  Hooks.on("deleteCombat", (combat) => {
    void closeIntercedeRequestsForCombat(combat, "combatEnded");
  });
}
