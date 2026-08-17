import {
  getCombatId,
  getActorSv
} from "../rules/quality-automation.js";

import {
  hasUnlockedOfficialTamerTalent,
  maybeApplyGritSurvival
} from "../rules/tamer-resources.js";

import {
  checkActorActionSpend,
  spendActorActions
} from "../combat/action-economy.js";
import {
  applyCombatMonsterResolveFromDamage
} from "../combat/defensive-qualities.js";
import {
  resolveBraveHeartAfterIntercede
} from "../combat/stance-qualities.js";
import {
  shouldNegateFallCrashDamage
} from "../combat/preservation-qualities.js";
import {
  reduceEnemyUnalterableDamageWithShiningArmor
} from "../combat/digizoid-gain-force.js";

import {
  commitBossTemplatePoolResult,
  getBossTemplateDamageContext,
  previewBossTemplatePoolResult,
  setBossTemplateDefeatedState,
  handleMultiStageBossDefeat,
  hasMultiStageBossContinuation
} from "../combat/boss-encounters.js";

import {
  consumeChallengerTemporaryWounds,
  maybeApplySurvivalInstinctDamage,
  recordRevitalizeDefeatState
} from "../rules/tamer-talent-combat-survival.js";

import {
  consumeGloriousWorldTemporaryWounds
} from "../rules/tamer-talent-transversal.js";

const DAMAGE_TYPE_LABEL_KEYS = {
  crash: "DDA.Damage.Type.Crash",
  burn: "DDA.Damage.Type.Burn",
  freeze: "DDA.Damage.Type.Freeze",
  poison: "DDA.Damage.Type.Poison"
};

const DAMAGE_REDUCTION_LABEL_KEYS = {
  crash: "DDA.Damage.Reduction.Crash",
  burn: "DDA.Damage.Reduction.Burn",
  freeze: "DDA.Damage.Reduction.Freeze",
  poison: "DDA.Damage.Reduction.Poison"
};

const ATTACK_DAMAGE_FLAG = "attackDamageEntry";
const AREA_DAMAGE_FLAG = "areaAttackDamageEntry";
const DAMAGE_SOCKET_SCOPE = "attack-damage-application";
const DAMAGE_SOCKET_CLAIM = "claim";
const DAMAGE_SOCKET_CLAIM_RESULT = "claim-result";
const DAMAGE_SOCKET_FINALIZE = "finalize";
const DAMAGE_SOCKET_FINALIZE_RESULT = "finalize-result";
const DAMAGE_CLAIM_STALE_MS = 2 * 60 * 1000;
const DAMAGE_SOCKET_TIMEOUT_MS = 15 * 1000;
const DAMAGE_HISTORY_LIMIT = 30;

const pendingDamageSocketRequests = new Map();
const authoritativeDamageClaims = new Set();
let damageApplicationSocketRegistered = false;

function primaryActiveGM() {
  return (game?.users?.contents ?? [])
    .filter((user) => user.active && user.isGM)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
}

function getAttackDamageEntryFromMessage(message) {
  return message?.getFlag?.(game.system.id, ATTACK_DAMAGE_FLAG)
    ?? message?.flags?.[game.system.id]?.[ATTACK_DAMAGE_FLAG]
    ?? null;
}

function getAreaDamageEntryFromMessage(message) {
  return message?.getFlag?.(game.system.id, AREA_DAMAGE_FLAG)
    ?? message?.flags?.[game.system.id]?.[AREA_DAMAGE_FLAG]
    ?? null;
}

function getCanonicalDamageEntryFromMessage(message) {
  const area = getAreaDamageEntryFromMessage(message);
  if (area) return { key: AREA_DAMAGE_FLAG, entry: area, area: true };

  const attack = getAttackDamageEntryFromMessage(message);
  if (attack) return { key: ATTACK_DAMAGE_FLAG, entry: attack, area: false };

  return { key: "", entry: null, area: false };
}

function getDamageEntryState(entry = {}) {
  if (entry?.applied) return "applied";
  return String(entry?.state ?? "pending").trim().toLowerCase() || "pending";
}

function damageClaimIsStale(entry = {}) {
  if (getDamageEntryState(entry) !== "applying") return false;
  const claimedAt = Number(entry?.claimedAt ?? 0);
  return !claimedAt || Date.now() - claimedAt > DAMAGE_CLAIM_STALE_MS;
}

export function isAttackDamageApplicationInFlight(entry = {}) {
  return getDamageEntryState(entry) === "applying" && !damageClaimIsStale(entry);
}

function findAreaProgressMessage(requestId = "") {
  const id = String(requestId ?? "");
  if (!id) return null;

  return game.messages?.find?.((candidate) => {
    const request = candidate?.getFlag?.(
      game.system.id,
      "areaAttackRequest"
    ) ?? candidate?.flags?.[game.system.id]?.areaAttackRequest;

    return String(request?.requestId ?? "") === id;
  }) ?? null;
}

function getAreaTargetForDamageEntry(request = {}, entry = {}) {
  const targets = Array.isArray(request?.targets) ? request.targets : [];
  const applicationId = String(entry?.applicationId ?? "");
  const targetTokenId = String(entry?.targetTokenId ?? "");
  const defenderUuid = String(entry?.defenderUuid ?? "");

  if (applicationId) {
    const exact = targets.find((target) => {
      return String(target?.damageApplication?.applicationId ?? "") === applicationId;
    });
    if (exact) return exact;
  }

  if (targetTokenId) {
    const byToken = targets.find((target) => {
      const candidateTokenId = String(
        target?.damageApplication?.targetTokenId ??
        target?.tokenId ??
        ""
      );
      return candidateTokenId === targetTokenId;
    });
    if (byToken) return byToken;
  }

  return targets.find((target) => {
    const candidateUuid = String(
      target?.damageApplication?.defenderUuid ??
      target?.actorUuid ??
      ""
    );
    return defenderUuid && candidateUuid === defenderUuid;
  }) ?? null;
}

function getAreaDamageLiveState(entry = {}) {
  const progressMessage = findAreaProgressMessage(entry?.requestId);
  const request = progressMessage?.getFlag?.(
    game.system.id,
    "areaAttackRequest"
  ) ?? progressMessage?.flags?.[game.system.id]?.areaAttackRequest;
  const target = getAreaTargetForDamageEntry(request, entry);

  return {
    progressMessage,
    request,
    target,
    application: target?.damageApplication ?? null
  };
}

function damageApplicationInvalidReason(entry = {}, { area = false } = {}) {
  if (!entry || typeof entry !== "object") return "missing";
  if (getDamageEntryState(entry) === "applied") return "applied";

  const combatId = String(entry?.combatId ?? "");
  if (combatId) {
    if (!game?.combat?.started || String(game.combat.id ?? "") !== combatId) {
      return "combatEnded";
    }
  }

  const sceneId = String(entry?.sceneId ?? "");
  const currentSceneId = String(canvas?.scene?.id ?? game?.scenes?.current?.id ?? "");
  if (sceneId && currentSceneId && sceneId !== currentSceneId) {
    return "sceneChanged";
  }

  if (area) {
    const live = getAreaDamageLiveState(entry);
    const requestStatus = String(live.request?.status ?? "");
    const targetStatus = String(live.target?.status ?? "");
    const ready = Boolean(
      entry?.areaReady ||
      live.application?.areaReady ||
      (
        ["resolved", "prevented", "cancelled"].includes(requestStatus) &&
        targetStatus === "resolved"
      )
    );
    if (!ready) return "areaPending";
  }

  return "";
}

function damageEntryMatches(left = {}, right = {}) {
  const leftId = String(left?.applicationId ?? "");
  const rightId = String(right?.applicationId ?? "");
  if (leftId && rightId) return leftId === rightId;

  return String(left?.defenderUuid ?? "") === String(right?.defenderUuid ?? "") &&
    String(left?.requestId ?? "") === String(right?.requestId ?? "");
}

function getDamageHistory(actor) {
  const history = actor?.getFlag?.(game.system.id, "damageApplicationHistory")
    ?? actor?.flags?.[game.system.id]?.damageApplicationHistory
    ?? [];
  return Array.isArray(history) ? history : [];
}

function hasAppliedDamageApplication(actor, applicationId = "") {
  const id = String(applicationId ?? "");
  if (!id || !actor) return false;
  return getDamageHistory(actor).some((entry) => String(entry?.id ?? "") === id);
}

function buildNextDamageHistory(actor, applicationId = "") {
  const id = String(applicationId ?? "");
  if (!id) return getDamageHistory(actor);

  const next = getDamageHistory(actor)
    .filter((entry) => String(entry?.id ?? "") !== id)
    .slice(-(DAMAGE_HISTORY_LIMIT - 1));
  next.push({ id, at: Date.now() });
  return next;
}

function damageButtonLabel(reason = "") {
  const english = String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en");
  const labels = {
    applied: english ? "Damage Applied" : "Dano Aplicado",
    applying: english ? "Applying Damage…" : "Aplicando Dano…",
    areaPending: english ? "Waiting for Dodges…" : "Aguardando Esquivas…",
    combatEnded: english ? "Expired Damage" : "Dano Expirado",
    sceneChanged: english ? "Different Scene" : "Outra Cena"
  };
  return labels[reason] ?? (english ? "Apply Damage" : "Aplicar Dano");
}

function canUserApplyDamageToActor(actor, user = game?.user) {
  if (!actor || !user) return false;
  if (user.isGM) return true;
  try {
    const ownerLevel = CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
    return Boolean(actor.testUserPermission?.(user, ownerLevel));
  } catch (_error) {
    return Boolean(user.id === game?.user?.id && actor.isOwner);
  }
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

async function updateDamageEntryOnMessage(message, key, entry) {
  if (!message || !key || !entry) return false;
  await message.update({
    [`flags.${game.system.id}.${key}`]: entry
  });
  return true;
}

async function claimDamageApplicationAsGM({
  messageId = "",
  applicationId = "",
  requestingUserId = game?.user?.id ?? ""
} = {}) {
  const message = game.messages?.get(String(messageId ?? ""));
  if (!message) return { granted: false, reason: "messageMissing" };

  const canonical = getCanonicalDamageEntryFromMessage(message);
  const entry = foundry.utils.deepClone(canonical.entry ?? {});
  if (!entry?.applicationId || String(entry.applicationId) !== String(applicationId ?? "")) {
    return { granted: false, reason: "applicationMismatch" };
  }

  const user = game.users?.get(String(requestingUserId ?? ""));
  const defender = await resolveDamageTargetActor(entry.defenderUuid);
  if (!user || !canUserApplyDamageToActor(defender, user)) {
    return { granted: false, reason: "notAuthorized" };
  }

  const invalidReason = damageApplicationInvalidReason(entry, { area: canonical.area });
  if (invalidReason && invalidReason !== "applied") {
    return { granted: false, reason: invalidReason };
  }
  if (invalidReason === "applied") {
    return { granted: false, reason: "applied", applied: true };
  }

  const state = getDamageEntryState(entry);
  if (state === "applying" && !damageClaimIsStale(entry)) {
    return {
      granted: false,
      reason: "applying",
      claimedByUserId: String(entry.claimedByUserId ?? "")
    };
  }

  const claimKey = `${message.id}|${entry.applicationId}`;
  if (authoritativeDamageClaims.has(claimKey)) {
    return { granted: false, reason: "applying" };
  }

  authoritativeDamageClaims.add(claimKey);
  try {
    const liveCanonical = getCanonicalDamageEntryFromMessage(message);
    const liveEntry = foundry.utils.deepClone(liveCanonical.entry ?? {});
    if (!damageEntryMatches(liveEntry, entry)) {
      return { granted: false, reason: "applicationMismatch" };
    }

    if (
      getDamageEntryState(liveEntry) === "applying" &&
      !damageClaimIsStale(liveEntry)
    ) {
      return { granted: false, reason: "applying" };
    }

    liveEntry.state = "applying";
    liveEntry.claimedByUserId = String(requestingUserId ?? "");
    liveEntry.claimedAt = Date.now();
    liveEntry.lastError = "";

    await updateDamageEntryOnMessage(message, liveCanonical.key, liveEntry);

    if (liveCanonical.area && liveEntry.requestId) {
      try {
        const areaController = await import(
          "../combat/area-attacks/area-attack-controller.js"
        );
        await areaController.markAreaAttackDamageState?.({
          requestId: liveEntry.requestId,
          applicationId: liveEntry.applicationId,
          targetTokenId: liveEntry.targetTokenId,
          defenderUuid: liveEntry.defenderUuid,
          messageId: message.id,
          state: "applying",
          applied: false,
          claimedByUserId: liveEntry.claimedByUserId,
          claimedAt: liveEntry.claimedAt
        });
      } catch (error) {
        console.warn(
          "DDA | Damage was claimed, but the Area Attack summary could not be synchronized immediately.",
          error
        );
      }
    }

    return {
      granted: true,
      messageId: message.id,
      applicationId: String(liveEntry.applicationId ?? ""),
      entry: liveEntry,
      area: liveCanonical.area
    };
  } finally {
    authoritativeDamageClaims.delete(claimKey);
  }
}

async function finalizeDamageApplicationAsGM({
  messageId = "",
  applicationId = "",
  requestingUserId = game?.user?.id ?? "",
  success = true,
  errorMessage = ""
} = {}) {
  const message = game.messages?.get(String(messageId ?? ""));
  if (!message) return { ok: false, reason: "messageMissing" };

  const canonical = getCanonicalDamageEntryFromMessage(message);
  const entry = foundry.utils.deepClone(canonical.entry ?? {});
  if (!entry?.applicationId || String(entry.applicationId) !== String(applicationId ?? "")) {
    return { ok: false, reason: "applicationMismatch" };
  }

  const claimantId = String(entry.claimedByUserId ?? "");
  const requester = String(requestingUserId ?? "");
  const requestingUser = game.users?.get(requester);
  if (claimantId && claimantId !== requester && !requestingUser?.isGM) {
    return { ok: false, reason: "notClaimant" };
  }

  if (success) {
    entry.state = "applied";
    entry.applied = true;
    entry.appliedAt = Date.now();
    entry.appliedByUserId = requester;
    entry.lastError = "";
  } else {
    entry.state = "pending";
    entry.applied = false;
    entry.claimedByUserId = "";
    entry.claimedAt = null;
    entry.lastError = String(errorMessage ?? "");
  }

  await updateDamageEntryOnMessage(message, canonical.key, entry);

  if (canonical.area && entry.requestId) {
    try {
      const areaController = await import(
        "../combat/area-attacks/area-attack-controller.js"
      );
      await areaController.markAreaAttackDamageState?.({
        requestId: entry.requestId,
        applicationId: entry.applicationId,
        targetTokenId: entry.targetTokenId,
        defenderUuid: entry.defenderUuid,
        messageId: message.id,
        state: entry.state,
        applied: Boolean(entry.applied),
        claimedByUserId: String(entry.claimedByUserId ?? ""),
        claimedAt: entry.claimedAt ?? null,
        appliedAt: entry.appliedAt ?? null,
        appliedByUserId: String(entry.appliedByUserId ?? ""),
        lastError: String(entry.lastError ?? "")
      });
    } catch (error) {
      console.warn(
        "DDA | Damage state was updated, but the Area Attack summary could not be synchronized.",
        error
      );
    }
  }

  return { ok: true, entry };
}

function requestDamageSocket(type, payload = {}) {
  const gm = primaryActiveGM();
  if (!gm) return Promise.resolve({ ok: false, reason: "noGM" });

  const requestId = foundry.utils.randomID();
  return new Promise((resolve) => {
    const timeoutId = globalThis.setTimeout(() => {
      pendingDamageSocketRequests.delete(requestId);
      resolve({ ok: false, reason: "timeout" });
    }, DAMAGE_SOCKET_TIMEOUT_MS);

    pendingDamageSocketRequests.set(requestId, { resolve, timeoutId });
    game.socket.emit(`system.${game.system.id}`, {
      scope: DAMAGE_SOCKET_SCOPE,
      type,
      requestId,
      targetGmId: gm.id,
      requestingUserId: game.user.id,
      ...payload
    });
  });
}

export async function claimAttackDamageApplication(message, entry = null) {
  if (!message) return { granted: true, legacy: true };

  const canonical = entry
    ? { ...getCanonicalDamageEntryFromMessage(message), entry }
    : getCanonicalDamageEntryFromMessage(message);
  if (!canonical.entry?.applicationId) {
    return { granted: true, legacy: true };
  }

  const gm = primaryActiveGM();
  if (gm?.id === game.user?.id) {
    return claimDamageApplicationAsGM({
      messageId: message.id,
      applicationId: canonical.entry.applicationId,
      requestingUserId: game.user.id
    });
  }

  if (!gm) {
    // Preserve legacy GM-less play. The Actor-side application history still
    // protects a later retry from re-applying the same damage, but there is no
    // cross-client claim authority without an active GM.
    return {
      granted: true,
      legacyNoGM: true,
      entry: canonical.entry,
      area: canonical.area
    };
  }

  const response = await requestDamageSocket(DAMAGE_SOCKET_CLAIM, {
    messageId: message.id,
    applicationId: canonical.entry.applicationId
  });
  return response?.result ?? response;
}

export async function finalizeAttackDamageApplication(
  message,
  entry = null,
  { success = true, errorMessage = "" } = {}
) {
  if (!message) return { ok: true, legacy: true };

  const canonical = getCanonicalDamageEntryFromMessage(message);
  const application = entry ?? canonical.entry;
  if (!application?.applicationId) return { ok: true, legacy: true };

  const gm = primaryActiveGM();
  if (gm?.id === game.user?.id) {
    return finalizeDamageApplicationAsGM({
      messageId: message.id,
      applicationId: application.applicationId,
      requestingUserId: game.user.id,
      success,
      errorMessage
    });
  }

  if (!gm) {
    if (userCanUpdateMessage(message)) {
      const liveCanonical = getCanonicalDamageEntryFromMessage(message);
      const liveEntry = foundry.utils.deepClone(liveCanonical.entry ?? application);
      if (success) {
        liveEntry.state = "applied";
        liveEntry.applied = true;
        liveEntry.appliedAt = Date.now();
        liveEntry.appliedByUserId = String(game.user?.id ?? "");
      } else {
        liveEntry.state = "pending";
        liveEntry.applied = false;
        liveEntry.claimedAt = null;
        liveEntry.claimedByUserId = "";
        liveEntry.lastError = String(errorMessage ?? "");
      }
      await updateDamageEntryOnMessage(message, liveCanonical.key, liveEntry);
    }
    return { ok: true, legacyNoGM: true };
  }

  const response = await requestDamageSocket(DAMAGE_SOCKET_FINALIZE, {
    messageId: message.id,
    applicationId: application.applicationId,
    success,
    errorMessage
  });
  return response?.result ?? response;
}

export function registerDamageApplicationSocket() {
  if (damageApplicationSocketRegistered || !game.socket) return;
  damageApplicationSocketRegistered = true;

  game.socket.on(`system.${game.system.id}`, async (payload = {}) => {
    if (payload?.scope !== DAMAGE_SOCKET_SCOPE) return;

    if (
      payload.type === DAMAGE_SOCKET_CLAIM_RESULT ||
      payload.type === DAMAGE_SOCKET_FINALIZE_RESULT
    ) {
      if (String(payload.targetUserId ?? "") !== String(game.user?.id ?? "")) return;
      const pending = pendingDamageSocketRequests.get(String(payload.requestId ?? ""));
      if (!pending) return;
      globalThis.clearTimeout(pending.timeoutId);
      pendingDamageSocketRequests.delete(String(payload.requestId ?? ""));
      pending.resolve(payload);
      return;
    }

    const gm = primaryActiveGM();
    if (!game.user?.isGM || gm?.id !== game.user.id) return;
    if (String(payload.targetGmId ?? "") !== String(game.user.id)) return;

    if (payload.type === DAMAGE_SOCKET_CLAIM) {
      const result = await claimDamageApplicationAsGM(payload);
      game.socket.emit(`system.${game.system.id}`, {
        scope: DAMAGE_SOCKET_SCOPE,
        type: DAMAGE_SOCKET_CLAIM_RESULT,
        requestId: payload.requestId,
        targetUserId: payload.requestingUserId,
        result
      });
      return;
    }

    if (payload.type === DAMAGE_SOCKET_FINALIZE) {
      const result = await finalizeDamageApplicationAsGM(payload);
      game.socket.emit(`system.${game.system.id}`, {
        scope: DAMAGE_SOCKET_SCOPE,
        type: DAMAGE_SOCKET_FINALIZE_RESULT,
        requestId: payload.requestId,
        targetUserId: payload.requestingUserId,
        result
      });
    }
  });
}

function isAreaDamageAppliedInProgress(entry = {}) {
  const live = getAreaDamageLiveState(entry);
  return Boolean(
    live.application?.applied ||
    getDamageEntryState(live.application ?? {}) === "applied"
  );
}

export async function bindDamageApplicationButtons(root, message = null) {
  if (!root?.querySelectorAll) return;

  const buttons = Array.from(root.querySelectorAll(".dda-apply-damage"));
  const canonical = getCanonicalDamageEntryFromMessage(message);
  const damageEntry = canonical.entry;

  for (const button of buttons) {
    if (button.dataset.ddaDamageBound === "true") continue;

    button.dataset.ddaDamageBound = "true";

    if (message?.id) {
      button.dataset.ddaMessageId = String(message.id);
    }

    if (
      damageEntry?.applied ||
      getDamageEntryState(damageEntry) === "applied" ||
      (canonical.area && isAreaDamageAppliedInProgress(damageEntry))
    ) {
      button.dataset.ddaDamageApplied = "true";
      button.disabled = true;
      button.innerText = damageButtonLabel("applied");
      continue;
    }

    if (damageEntry) {
      const invalidReason = damageApplicationInvalidReason(damageEntry, {
        area: canonical.area
      });

      if (invalidReason) {
        button.disabled = true;
        button.innerText = damageButtonLabel(invalidReason);
        continue;
      }

      if (isAttackDamageApplicationInFlight(damageEntry)) {
        button.disabled = true;
        button.innerText = damageButtonLabel("applying");
        continue;
      }
    }

    const defender = await resolveDamageTargetActor(
      damageEntry?.defenderUuid ?? button.dataset.defenderUuid
    );

    const canApplyDamage = canCurrentUserApplyDamage(defender);

    // Só o dono do alvo ou o GM recebe o botão funcional.
    button.hidden = !canApplyDamage;
    button.disabled = !canApplyDamage;

    if (!canApplyDamage) continue;

    button.addEventListener("click", applyDamageFromChat);
  }
}


async function resolveDamageTargetActor(uuid = "") {
  if (!uuid) return null;

  try {
    const document = await fromUuid(uuid);

    if (!document) return null;

    if (document.documentName === "Token") {
      return document.actor ?? null;
    }

    return document.documentName === "Actor"
      ? document
      : null;
  } catch (error) {
    console.warn("DDA | Could not resolve damage target.", error);
    return null;
  }
}

function canCurrentUserApplyDamage(actor) {
  return canUserApplyDamageToActor(actor, game.user);
}

export async function applyDamageFromChat(event) {
  event.preventDefault();

  const button = event.currentTarget;

  if (button.dataset.ddaDamageApplied === "true") return;

  if (button.dataset.ddaDamageInFlight === "true") return;
  button.dataset.ddaDamageInFlight = "true";
  button.disabled = true;

  const messageId = String(button.dataset.ddaMessageId ?? "");
  const message = messageId ? game.messages?.get(messageId) : null;
  const canonical = getCanonicalDamageEntryFromMessage(message);
  const storedEntry = canonical.entry ?? null;

  const defenderUuid = String(
    storedEntry?.defenderUuid ?? button.dataset.defenderUuid ?? ""
  );
  const attackerUuid = String(
    storedEntry?.attackerUuid ?? button.dataset.attackerUuid ?? ""
  ).trim();
  const damage = Number(storedEntry?.damage ?? button.dataset.damage ?? 0);
  const damageType = normalizeDamageType(
    storedEntry?.damageType ?? button.dataset.damageType ?? ""
  );
  const damageLabel = String(
    storedEntry?.damageLabel ?? button.dataset.damageLabel ?? ""
  ).trim();
  const holdBack = storedEntry
    ? Boolean(storedEntry.holdBack)
    : button.dataset.holdBack === "true";
  const tamerIntercede = storedEntry
    ? Boolean(storedEntry.tamerIntercede)
    : button.dataset.tamerIntercede === "true";
  const digimonIntercede = storedEntry
    ? Boolean(storedEntry.digimonIntercede)
    : button.dataset.digimonIntercede === "true";
  const unalterable = storedEntry
    ? Boolean(storedEntry.unalterable)
    : button.dataset.unalterable === "true";
  const unalterablePortion = Math.max(
    0,
    Number(storedEntry?.unalterablePortion ?? button.dataset.unalterablePortion ?? 0)
  );
  const focusTempMultiplier = Math.max(
    1,
    Number(storedEntry?.focusTempMultiplier ?? button.dataset.focusTempMultiplier ?? 1)
  );
  const lifestealCap = Math.max(
    0,
    Number(storedEntry?.lifestealCap ?? button.dataset.lifestealCap ?? 0)
  );
  const lifestealKey = String(
    storedEntry?.lifestealKey ?? button.dataset.lifestealKey ?? ""
  ).trim();
  const applicationId = String(storedEntry?.applicationId ?? "");

  if (!defenderUuid) {
    warnLocalized(
      "DDA.Warning.DefenderNotFoundInAttackCard",
      "Defensor não encontrado no card de ataque."
    );
    delete button.dataset.ddaDamageInFlight;
    button.disabled = false;
    return;
  }

  if (!Number.isFinite(damage) || damage <= 0) {
    warnLocalized("DDA.Warning.InvalidDamage", "Dano inválido.");
    delete button.dataset.ddaDamageInFlight;
    button.disabled = false;
    return;
  }

  const defender = await resolveDamageTargetActor(defenderUuid);

  if (!defender) {
    warnLocalized(
      "DDA.Warning.DefenderActorNotFound",
      "Não foi possível encontrar o Actor do defensor."
    );
    delete button.dataset.ddaDamageInFlight;
    button.disabled = false;
    return;
  }

  if (!canCurrentUserApplyDamage(defender)) {
    warnLocalized(
      "DDA.Warning.NoPermissionToApplyDamage",
      "Apenas o dono do alvo ou o Mestre pode aplicar este dano."
    );
    delete button.dataset.ddaDamageInFlight;
    button.disabled = false;
    return;
  }

  if (storedEntry) {
    const invalidReason = damageApplicationInvalidReason(storedEntry, {
      area: canonical.area
    });
    if (invalidReason) {
      button.innerText = damageButtonLabel(invalidReason);
      delete button.dataset.ddaDamageInFlight;
      return;
    }
  }

  const attackerDocument = attackerUuid
    ? await fromUuid(attackerUuid)
    : null;

  const attacker = attackerDocument?.documentName === "Token"
    ? attackerDocument.actor
    : attackerDocument;

  let claim = { granted: true, legacy: true };

  try {
    if (storedEntry) {
      claim = await claimAttackDamageApplication(message, storedEntry);
      if (!claim?.granted) {
        const reason = claim?.reason ?? "applying";
        if (reason === "applied") {
          button.dataset.ddaDamageApplied = "true";
        }
        button.innerText = damageButtonLabel(reason);
        delete button.dataset.ddaDamageInFlight;
        return;
      }
    }

    const result = await applyDamage(defender, damage, {
      damageType,
      damageLabel,
      holdBack,
      tamerIntercede,
      digimonIntercede,
      unalterable,
      unalterablePortion,
      attacker,
      attackerUserId: String(message?.user?.id ?? message?.author?.id ?? ""),
      focusTempMultiplier,
      lifestealCap,
      lifestealKey,
      applicationId
    });

    if (!result) {
      if (storedEntry && !claim?.legacyNoGM) {
        await finalizeAttackDamageApplication(message, storedEntry, {
          success: false,
          errorMessage: "Damage application returned no result."
        });
      }
      delete button.dataset.ddaDamageInFlight;
      button.disabled = false;
      return;
    }

    await resolveAttackDamagePostProcessing(defender, result, {
      digimonIntercede
    });

    try {
      const bossQualities = await import("../combat/boss-qualities.js");
      await bossQualities.resolveBossDamagePostProcessing?.({
        attacker,
        defender,
        damageResult: result,
        damageEntry: storedEntry ?? {}
      });
    } catch (error) {
      console.error("DDA | Boss Quality damage post-processing failed.", error);
    }

    if (storedEntry) {
      await finalizeAttackDamageApplication(message, storedEntry, {
        success: true
      });
    }

    button.dataset.ddaDamageApplied = "true";
    button.disabled = true;
    button.innerText = damageButtonLabel("applied");
    delete button.dataset.ddaDamageInFlight;
  } catch (error) {
    console.error("DDA | Could not apply damage from attack card.", error);

    if (storedEntry && claim?.granted && !claim?.legacyNoGM) {
      try {
        await finalizeAttackDamageApplication(message, storedEntry, {
          success: false,
          errorMessage: String(error?.message ?? error ?? "")
        });
      } catch (finalizeError) {
        console.warn(
          "DDA | Could not release the failed damage application claim.",
          finalizeError
        );
      }
    }

    warnLocalized(
      "DDA.Warning.CouldNotApplyDamage",
      "Não foi possível aplicar o dano."
    );
    delete button.dataset.ddaDamageInFlight;
    button.disabled = false;
  }
}

export async function resolveAttackDamagePostProcessing(
  defender,
  result,
  { digimonIntercede = false } = {}
) {
  if (!defender || !result) return;
  if (!digimonIntercede) return;

  await resolveBraveHeartAfterIntercede(defender, result, { interceded: true });

  try {
    const evolution = await import("../combat/evolution.js");
    await evolution.finishBlastIntercedeForPartner?.(defender);
  } catch (error) {
    console.error("DDA | Could not finish Blast Intercede after damage.", error);
  }
}

export async function applyDamage(actor, damage, options = {}) {
  if (actor.type === "character") {
    return applyDamageToCharacter(actor, damage, options);
  }

  if (actor.type === "digimon" || actor.type === "npc") {
    return applyDamageToDigimon(actor, damage, options);
  }

  warnLocalized(
    "DDA.Warning.UnsupportedActorTypeForDamage",
    "Tipo de Actor não suportado para dano."
  );
}

export async function applyCrashDamage(actor, damage, options = {}) {
  const negatedByTumbler = shouldNegateFallCrashDamage(actor, options);
  return applyDamage(actor, negatedByTumbler ? 0 : damage, {
    ...options,
    negatedByTumbler,
    damageType: "crash",
    damageLabel: options.damageLabel ?? localizeWithFallback(
      "DDA.Damage.Type.Crash",
      "Dano de Colisão"
    )
  });
}

async function applyDamageToCharacter(actor, damage, options = {}) {
  return applyDamageToActor(actor, damage, options, {
    woundsDataPath: "system.derived.wounds",
    woundsValuePath: "system.derived.wounds.value",
    tempValuePath: "system.derived.wounds.temp.value",
    noHealthWarningKey: "DDA.Warning.CharacterHasNoHealth",
    noHealthWarningFallback: "Este personagem não possui Saúde."
  });
}

async function applyDamageToDigimon(actor, damage, options = {}) {
  return applyDamageToActor(actor, damage, options, {
    woundsDataPath: "system.miscStats.wounds",
    woundsValuePath: "system.miscStats.wounds.value",
    tempValuePath: "system.miscStats.wounds.temp.value",
    noHealthWarningKey: "DDA.Warning.DigimonHasNoHealth",
    noHealthWarningFallback: "Este Digimon não possui Saúde."
  });
}

function actorReferenceKeys(actor) {
  return new Set(
    [
      actor?.uuid,
      actor?.id,
      actor?.parent?.uuid,
      actor?.parent?.id,
      actor?.id
        ? `Actor.${actor.id}`
        : ""
    ]
      .map((value) => {
        return String(
          value ?? ""
        ).trim();
      })
      .filter(Boolean)
  );
}

async function resolveTamerForPartner(
  partner
) {
  const directUuid = String(
    partner?.system?.tamer?.uuid ?? ""
  ).trim();

  if (directUuid) {
    try {
      const document =
        await fromUuid(directUuid);

      if (
        document?.documentName === "Actor" &&
        document.type === "character"
      ) {
        return document;
      }
    } catch (error) {
      console.warn(
        "DDA | Could not resolve Tamer for Undefeated Endurance.",
        error
      );
    }
  }

  const keys =
    actorReferenceKeys(partner);

  return (
    game?.actors?.contents ?? []
  ).find((candidate) => {
    if (candidate.type !== "character") {
      return false;
    }

    const partnerData =
      candidate.system?.partner ?? {};

    return [
      partnerData.currentFormUuid,
      partnerData.uuid
    ].some((reference) => {
      return keys.has(
        String(reference ?? "").trim()
      );
    });
  }) ?? null;
}

function actorIsInActiveCombat(actor) {
  if (
    !game?.combat?.started ||
    !actor
  ) {
    return false;
  }

  return Boolean(
    game.combat.combatants?.find(
      (combatant) => {
        return Boolean(
          combatant?.actor &&
          (
            combatant.actor.uuid ===
              actor.uuid ||
            combatant.actor.id ===
              actor.id
          )
        );
      }
    )
  );
}

function combatTalentWasUsed(
  tamer,
  talentId
) {
  const usage =
    tamer?.system?.combat
      ?.tamerTalentUsage
      ?.[talentId];

  return Boolean(
    usage &&
    String(
      usage.combatId ?? ""
    ) === String(
      game?.combat?.id ?? ""
    )
  );
}

async function markCombatTalentUsed(
  tamer,
  talentId
) {
  const usage =
    foundry.utils.deepClone(
      tamer.system?.combat
        ?.tamerTalentUsage ??
      {}
    );

  usage[talentId] = {
    combatId:
      game?.combat?.id ?? "",

    round:
      Number(
        game?.combat?.round ?? 0
      ),

    turn:
      Number(
        game?.combat?.turn ?? -1
      ),

    usedAt:
      new Date().toISOString()
  };

  await tamer.update({
    "system.combat.tamerTalentUsage":
      usage
  });
}

export async function tryUndefeatedEndurance(
  actor,
  {
    prospectiveWounds = 0,
    maximumWounds = null
  } = {}
) {
  if (
    !actor ||
    !["digimon", "npc"].includes(
      actor.type
    ) ||
    Number(prospectiveWounds) > 0 ||
    !actorIsInActiveCombat(actor)
  ) {
    return null;
  }

  const tamer =
    await resolveTamerForPartner(
      actor
    );

  if (
    !tamer ||
    !hasUnlockedOfficialTamerTalent(
      tamer,
      "undefeatedEndurance"
    ) ||
    combatTalentWasUsed(
      tamer,
      "undefeatedEndurance"
    )
  ) {
    return null;
  }

  const body = Math.max(
    0,
    Math.floor(
      Number(
        tamer.system?.attributes
          ?.body?.value ?? 0
      )
    )
  );

  const roll =
    body > 0
      ? await new Roll(
          `${body}d6`
        ).evaluate()
      : null;

  const diceResults =
    (
      roll?.dice?.[0]
        ?.results ?? []
    )
      .filter((entry) => {
        return entry.active !== false;
      })
      .map((entry) => {
        return Number(
          entry.result ?? 0
        );
      });

  const successes =
    diceResults.filter(
      (result) => result >= 5
    ).length;

  const sv = Math.max(
    0,
    Number(
      getActorSv(actor) ?? 0
    )
  );

  const maximum = Math.max(
    0,
    Number(
      maximumWounds ??
      actor.system?.miscStats
        ?.wounds?.max ??
      0
    )
  );

  const recovered = Math.min(
    maximum,
    successes + sv
  );

  if (recovered <= 0) {
    return null;
  }

  await markCombatTalentUsed(
    tamer,
    "undefeatedEndurance"
  );

  await ChatMessage.create({
    speaker:
      ChatMessage.getSpeaker({
        actor: tamer
      }),

    rolls:
      roll
        ? [roll]
        : [],

    content: `
      <div class="dda-chat-card dda-effect-card effect-positive dda-undefeated-endurance-card">
        <h2>
          ${escapeHtml(
            localizeWithFallback(
              "DDA.TamerTalent.UndefeatedEndurance.Title",
              "Undefeated Endurance"
            )
          )}
        </h2>

        <p>
          ${escapeHtml(
            localizeWithFallback(
              "DDA.TamerTalent.UndefeatedEndurance.Trigger",
              "{partner} seria Derrotado, mas continua lutando.",
              {
                partner:
                  actor.name
              }
            )
          )}
        </p>

        <ul class="dda-effect-list">
          <li>
            ${escapeHtml(
              localizeWithFallback(
                "DDA.TamerAttribute.Body",
                "Corpo"
              )
            )}:
            <strong>${body}</strong>.
          </li>

          <li>
            ${escapeHtml(
              localizeWithFallback(
                "DDA.Pool.RolledSuccesses",
                "Sucessos Rolados"
              )
            )}:
            <strong>${successes}</strong>.
          </li>

          <li>
            SV:
            <strong>+${sv}</strong>.
          </li>

          <li>
            ${escapeHtml(
              localizeWithFallback(
                "DDA.TamerTalent.UndefeatedEndurance.Recovered",
                "Caixas de Ferimento recuperadas"
              )
            )}:
            <strong>${recovered}</strong>.
          </li>
        </ul>
      </div>
    `
  });

  return {
    used: true,
    actor,
    tamer,
    roll,
    body,
    diceResults,
    successes,
    sv,
    recovered,
    wounds:
      recovered
  };
}

async function maybeUseStandardFatesProtection(actor, options = {}) {
  if (
    actor?.type !== "character" ||
    !options?.attacker ||
    options?.tamerIntercede
  ) {
    return null;
  }

  const actionCheck = checkActorActionSpend(actor, 1, {
    requireActiveUnit: false,
    notify: false
  });

  if (!actionCheck) return null;

  const combatId = String(getCombatId() ?? "");
  const storedCombatId = String(
    actor.system?.combat?.fatesProtectionStandardCombatId ?? ""
  );
  const usesBefore = storedCombatId === combatId
    ? Math.max(0, Number(actor.system?.combat?.fatesProtectionStandardUses ?? 0))
    : 0;
  const ipCost = usesBefore > 0 ? 2 : 0;
  const ipBefore = Math.max(0, Number(actor.system?.resources?.ip?.value ?? 0));

  if (ipBefore < ipCost) return null;

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: localizeWithFallback(
        "DDA.FatesProtection.Title",
        "Proteção do Destino"
      )
    },
    content: `<div class="dda-confirm-dialog dda-fates-protection-dialog">
      <p>${escapeHtml(localizeWithFallback(
        "DDA.FatesProtection.Prompt",
        "Usar Proteção do Destino para evitar todo o Dano deste Ataque?"
      ))}</p>
      <p>${escapeHtml(localizeWithFallback(
        ipCost > 0
          ? "DDA.FatesProtection.CostPaid"
          : "DDA.FatesProtection.FirstUseFree",
        ipCost > 0
          ? "Esta utilização custa 1 Ação e 2 PI."
          : "A primeira utilização no Combate custa 1 Ação e nenhum PI."
      ))}</p>
    </div>`,
    yes: {
      default: false
    },
    no: {
      default: true
    },
    rejectClose: false
  });

  if (!confirmed) return null;

  const payment = await spendActorActions(actor, 1, {
    requireActiveUnit: false,
    notify: true
  });

  if (!payment) return null;

  return {
    used: true,
    combatId,
    usesBefore,
    usesAfter: usesBefore + 1,
    ipCost,
    ipBefore,
    ipAfter: ipBefore - ipCost,
    payment
  };
}

async function applyDamageToActor(actor, damage, options = {}, config = {}) {
  const wounds = foundry.utils.getProperty(actor, config.woundsDataPath);

  if (!wounds) {
    warnLocalized(config.noHealthWarningKey, config.noHealthWarningFallback);
    return;
  }

  const applicationId = String(options?.applicationId ?? "").trim();
  if (applicationId && hasAppliedDamageApplication(actor, applicationId)) {
    const currentWounds = Number(wounds.value ?? 0);
    const currentTemp = Number(wounds.temp?.value ?? 0);
    return {
      actor,
      applicationId,
      alreadyApplied: true,
      before: {
        wounds: currentWounds,
        temp: currentTemp
      },
      after: {
        wounds: currentWounds,
        temp: currentTemp
      }
    };
  }

  const bossTemplateContext = await getBossTemplateDamageContext(actor, options);
  if (bossTemplateContext?.cancelled) {
    ui.notifications?.info?.(localizeWithFallback(
      "DDA.BossTemplate.PoolSelectionCancelled",
      "A aplicação foi cancelada porque nenhum Wound Pool do Boss Template foi selecionado."
    ));
    return null;
  }

  const currentWounds = bossTemplateContext
    ? Number(bossTemplateContext.currentWounds ?? 0)
    : Number(wounds.value ?? 0);
  const currentTemp = Number(wounds.temp?.value ?? 0);

  /*
   * Once a player's Boss Template pool is depleted, further actions from that
   * player do not spill into another player's pool. Treat the damage step as a
   * no-op instead of re-triggering survival mechanics from zero Wounds.
   */
  if (bossTemplateContext && currentWounds <= 0) {
    if (applicationId) {
      await actor.update({
        [`flags.${game.system.id}.damageApplicationHistory`]:
          buildNextDamageHistory(actor, applicationId)
      });
    }

    const bossTemplate = {
      poolId: bossTemplateContext.pool.id,
      poolIndex: bossTemplateContext.pool.index,
      poolLabel: bossTemplateContext.pool.label,
      assignedUserName: bossTemplateContext.pool.assignedUserName ?? "",
      before: 0,
      after: 0,
      max: Number(bossTemplateContext.pool.max ?? bossTemplateContext.maximumWounds),
      remainingPools: bossTemplateContext.state.pools.filter((pool) => Number(pool.value ?? 0) > 0).length,
      allDefeated: bossTemplateContext.state.pools.every((pool) => Number(pool.value ?? 0) <= 0),
      alreadyDepleted: true
    };

    const noOp = {
      actor,
      applicationId,
      alreadyApplied: false,
      noEffect: true,
      reason: "boss-template-pool-depleted",
      damageInfo: { rawDamage: Number(damage ?? 0), effectiveDamage: 0 },
      result: {
        wounds: 0,
        temp: currentTemp,
        tempDamage: 0,
        healthDamage: 0,
        absorbedByTemp: 0
      },
      bossTemplate,
      before: { wounds: 0, temp: currentTemp },
      after: { wounds: 0, temp: currentTemp }
    };

    if (options.createChat !== false) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
          <div class="dda-chat-card dda-effect-card effect-negative dda-damage-card">
            <h2>${escapeHtml(localizeWithFallback("DDA.BossTemplate.Title", "Boss Template"))}</h2>
            <p><strong>${escapeHtml(bossTemplate.poolLabel)}</strong>${bossTemplate.assignedUserName ? ` — ${escapeHtml(bossTemplate.assignedUserName)}` : ""}: ${escapeHtml(localizeWithFallback("DDA.BossTemplate.PoolAlreadyDepleted", "este Wound Pool já foi esgotado; o dano não transborda para outro pool."))}</p>
          </div>`
      });
    }

    return noOp;
  }

  const shiningDigizoid =
    await reduceEnemyUnalterableDamageWithShiningArmor(
      actor,
      damage,
      options
    );

  const survivalInstinct =
    await maybeApplySurvivalInstinctDamage(
      actor,
      shiningDigizoid.damage,
      {
        ...options,
        shiningReduction:
          shiningDigizoid.reduction
      }
    );

  const adjustedDamage = survivalInstinct?.used
    ? survivalInstinct.damage
    : shiningDigizoid.damage;

  const adjustedOptions = survivalInstinct?.used
    ? {
        ...options,
        unalterable: false,
        unalterablePortion: 0
      }
    : options;

  const damageInfo = getDamageApplicationInfo(
    actor,
    adjustedDamage,
    adjustedOptions
  );

  damageInfo.shiningDigizoidReduction =
    shiningDigizoid.reduction;

  damageInfo.survivalInstinct =
    survivalInstinct;
  let effectiveDamage = damageInfo.effectiveDamage;
  const evokerCreation = actor.flags?.["digimon-digital-adventures"]?.evokerCreation;
  const damageThreshold = evokerCreation?.kind === "structure"
    ? Math.max(0, Number(evokerCreation.damageThreshold ?? 0))
    : 0;
  if (damageThreshold > 0 && effectiveDamage < damageThreshold) {
    damageInfo.beforeDamageThreshold = effectiveDamage;
    damageInfo.damageThreshold = damageThreshold;
    damageInfo.blockedByDamageThreshold = true;
    damageInfo.effectiveDamage = 0;
    effectiveDamage = 0;
  }

const focusTempMultiplier = Math.max(
  1,
  Number(options.focusTempMultiplier ?? 1)
);

const result = calculateWoundLoss(
  currentWounds,
  currentTemp,
  effectiveDamage,
  { tempDamageMultiplier: focusTempMultiplier }
);

const intercedePending = actor.type === "character" && Boolean(options.tamerIntercede);

let intercedeSurvival = null;

if (intercedePending) {
  const ipCurrent = Math.max(0, Number(actor.system?.resources?.ip?.value ?? 0));
  const combatId = String(getCombatId() ?? "");
  const fateAlreadyUsed = String(actor.system?.combat?.fatesProtectionCombatId ?? "") === combatId;
  const canUseFatesProtection = ipCurrent >= 2 && !fateAlreadyUsed;
  const useFatesProtection = canUseFatesProtection && await foundry.applications.api.DialogV2.confirm({
    window: {
      title: localizeWithFallback("DDA.Intercede.FatesProtectionTitle", "Fate's Protection")
    },
    content: `<p>${localizeWithFallback(
      "DDA.Intercede.FatesProtectionPrompt",
      "Spend 2 IP so {actor} remains at 1 Wound Box after Interceding?",
      { actor: actor.name }
    )}</p>`,
    yes: {
      default: false
    },
    no: {
      default: true
    },
    rejectClose: false
  });

  result.temp = 0;
  result.wounds = useFatesProtection ? 1 : 0;
  result.tempDamage = currentTemp;
  result.healthDamage = Math.max(0, currentWounds - result.wounds);
  intercedeSurvival = {
    used: true,
    fatesProtection: Boolean(useFatesProtection),
    ipBefore: ipCurrent,
    ipAfter: useFatesProtection ? ipCurrent - 2 : ipCurrent,
    combatId
  };
}

let fatesProtection = null;

if (!intercedePending && effectiveDamage > 0) {
  fatesProtection = await maybeUseStandardFatesProtection(actor, options);

  if (fatesProtection?.used) {
    result.temp = currentTemp;
    result.wounds = currentWounds;
    result.tempDamage = 0;
    result.healthDamage = 0;
    result.absorbedByTemp = 0;
  }
}

let regenSurvival = null;
let activeEffectsUpdate = null;
const activeEffects = foundry.utils.deepClone(actor.system?.effects?.active ?? []);
const regenIndex = activeEffects.findIndex((effect) => {
  return String(effect?.tag ?? "").replace(/^\[|\]$/g, "").toLowerCase() === "regen";
});
const regenAlreadyUsed = String(actor.system?.combat?.regenSurvivalCombatId ?? "") === String(getCombatId());

if (!intercedePending && !fatesProtection?.used && result.wounds <= 0 && regenIndex >= 0 && !regenAlreadyUsed) {
  const [regenEffect] = activeEffects.splice(regenIndex, 1);
  result.wounds = 1;
  result.healthDamage = Math.max(0, currentWounds - 1);
  activeEffectsUpdate = activeEffects;
  regenSurvival = {
    used: true,
    effect: regenEffect,
    combatId: getCombatId()
  };
}

const gritSurvival = intercedePending || fatesProtection?.used
  ? null
  : await maybeApplyGritSurvival(
    actor,
    {
      currentWounds,

      nextWounds:
        result.wounds,

      sourceLabel:
        damageInfo.damageTypeLabel ||
        options.damageLabel ||
        localizeWithFallback(
          "DDA.Damage.Applied",
          "Dano Aplicado"
        )
    }
  );

if (gritSurvival?.used) {
  result.wounds =
    gritSurvival.wounds;

  result.healthDamage = Math.max(
    0,
    currentWounds - result.wounds
  );
}

const undefeatedEndurance = intercedePending || fatesProtection?.used
  ? null
  : await tryUndefeatedEndurance(
    actor,
    {
      prospectiveWounds:
        result.wounds,

      maximumWounds:
        bossTemplateContext
          ? Number(bossTemplateContext.maximumWounds ?? wounds.max ?? 0)
          : Number(wounds.max ?? 0)
    }
  );

if (undefeatedEndurance?.used) {
  result.wounds =
    undefeatedEndurance.wounds;
}

const heldBack = Boolean(!intercedePending && options.holdBack && currentWounds > 0 && result.wounds <= 0);

if (heldBack) {
  result.wounds = 1;
  result.healthDamage = Math.max(0, currentWounds - 1);
}

const bossTemplatePreview = bossTemplateContext
  ? previewBossTemplatePoolResult(bossTemplateContext, result.wounds)
  : null;

const phaseDefeated = bossTemplatePreview
  ? Boolean(bossTemplatePreview.allDefeated)
  : result.wounds <= 0;

const multiStageContinuation = phaseDefeated && hasMultiStageBossContinuation(
  actor,
  bossTemplateContext?.combat ?? game.combat
);

let actorDefeated = Boolean(phaseDefeated && !multiStageContinuation);

if (actorDefeated) {
  await recordRevitalizeDefeatState(actor);
}

const bossTemplateCommit = bossTemplateContext
  ? await commitBossTemplatePoolResult(bossTemplateContext, result.wounds)
  : null;

await actor.update({
  [config.woundsValuePath]:
    bossTemplateCommit
      ? bossTemplateCommit.summaryWounds
      : result.wounds,

  [config.tempValuePath]:
    result.temp,

  "system.combat.defeated":
    actorDefeated,

  ...(heldBack ? { "system.combat.incapacitated": true } : {}),

  ...(activeEffectsUpdate ? { "system.effects.active": activeEffectsUpdate } : {}),
  ...(regenSurvival ? { "system.combat.regenSurvivalCombatId": regenSurvival.combatId } : {}),
  ...(intercedeSurvival?.fatesProtection ? {
    "system.resources.ip.value": intercedeSurvival.ipAfter,
    "system.combat.fatesProtectionCombatId": intercedeSurvival.combatId
  } : {}),

  ...(fatesProtection?.used ? {
    "system.resources.ip.value": fatesProtection.ipAfter,
    "system.combat.fatesProtectionStandardCombatId": fatesProtection.combatId,
    "system.combat.fatesProtectionStandardUses": fatesProtection.usesAfter
  } : {}),

  ...(applicationId ? {
    [`flags.${game.system.id}.damageApplicationHistory`]:
      buildNextDamageHistory(actor, applicationId)
  } : {})
});

if (bossTemplateCommit) {
  await setBossTemplateDefeatedState(actor, actorDefeated, bossTemplateContext.combat);
}

const gloriousWorldConsumed =
  await consumeGloriousWorldTemporaryWounds(
    actor,
    result.tempDamage
  );

await consumeChallengerTemporaryWounds(
  actor,
  Math.max(
    0,
    result.tempDamage -
      gloriousWorldConsumed
  )
);

let shieldBroken = false;

if (currentTemp > 0 && result.temp <= 0) {
  shieldBroken = await removeShieldEffectIfTempDepleted(actor);
}

const combatMonsterResolve = options.suppressCombatMonsterResolve
  ? null
  : await applyCombatMonsterResolveFromDamage({
      actor,
      healthDamage: result.healthDamage,
      attacker: options.attacker ?? null,
      sourceKind: options.damageSourceKind ?? "attack"
    });

const lifesteal = await applyLifestealFromDamage({
  attacker: options.attacker,
  defender: actor,
  damageResult: result,
  effectiveDamage,
  tempDamageMultiplier: focusTempMultiplier,
  cap: Math.max(0, Number(options.lifestealCap ?? 0)),
  key: String(options.lifestealKey ?? "")
});

/*
 * Multi-Stage resolves only after every consequence of the defeating hit has
 * finished against the form that actually received it. This prevents the new
 * form from retroactively changing Shield, Combat Monster/Resolve, Lifesteal,
 * temporary-wound consumption, or other post-damage behavior from the old
 * stage.
 */
let multiStageTransition = null;
if (multiStageContinuation) {
  multiStageTransition = await handleMultiStageBossDefeat(actor, {
    combat: bossTemplateContext?.combat ?? game.combat
  });

  if (!multiStageTransition?.handled) {
    actorDefeated = true;
    await actor.update({ "system.combat.defeated": true });
    if (bossTemplateContext?.combat) {
      await setBossTemplateDefeatedState(actor, true, bossTemplateContext.combat);
    }
    await recordRevitalizeDefeatState(actor);
  }
}

const applicationResult = {
  actor,
  applicationId,
  alreadyApplied: false,
  damageInfo,
  result,
shieldBroken,
combatMonsterResolve,
lifesteal,
gritSurvival,
undefeatedEndurance,
regenSurvival,
intercedeSurvival,
fatesProtection,
survivalInstinct,
multiStageTransition,
bossTemplate: bossTemplateCommit
  ? {
      poolId: bossTemplateCommit.pool?.id ?? bossTemplateContext.pool?.id,
      poolIndex: bossTemplateCommit.pool?.index ?? bossTemplateContext.pool?.index,
      poolLabel: bossTemplateCommit.pool?.label ?? bossTemplateContext.pool?.label,
      assignedUserName: bossTemplateCommit.pool?.assignedUserName ?? bossTemplateContext.pool?.assignedUserName ?? "",
      before: currentWounds,
      after: Number(bossTemplateCommit.pool?.value ?? result.wounds),
      max: Number(bossTemplateCommit.pool?.max ?? bossTemplateContext.maximumWounds),
      remainingPools: bossTemplateCommit.remainingPools,
      allDefeated: bossTemplateCommit.allDefeated
    }
  : null,
before: {
    wounds: currentWounds,
    temp: currentTemp
  },
  after: {
    wounds: result.wounds,
    temp: result.temp
  }
};


  if (options.createChat === false) {
    return applicationResult;
  }

  try {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
content: buildDamageChatContent({
  actor,
  damageInfo,
  result,
  shieldBroken,
  combatMonsterResolve,
  gritSurvival,
  fatesProtection,
  survivalInstinct,
  lifesteal,
  bossTemplate: applicationResult.bossTemplate,
  multiStageTransition: applicationResult.multiStageTransition,
  currentWounds,
  currentTemp,
  effectiveDamage
})
    });
  } catch (error) {
    console.warn(
      localizeWithFallback(
        "DDA.Warning.DamageChatRenderFailed",
        "DDA | O dano foi aplicado, mas o card de chat falhou ao renderizar."
      ),
      error
    );
  }

  return applicationResult;
}



function buildDamageChatContent({
  actor,
  damageInfo,
  result,
  shieldBroken,
  combatMonsterResolve,
  gritSurvival,
  fatesProtection,
  survivalInstinct,
  lifesteal,
  bossTemplate,
  multiStageTransition,
  currentWounds,
  currentTemp,
  effectiveDamage
} = {}) {
  const receivedText = localizeWithFallback(
    "DDA.Damage.Received",
    "{actor} recebeu {damage} de dano.",
    {
      actor: actor.name,
      damage: damageInfo.rawDamage
    }
  );

  return `
    <div class="dda-chat-card dda-effect-card effect-negative dda-damage-card">
      <h2>${escapeHtml(localizeWithFallback("DDA.Damage.Applied", "Dano Aplicado"))}</h2>

      <p>${escapeHtml(receivedText)}</p>

      <ul class="dda-effect-list dda-damage-list">
        ${
          damageInfo.damageTypeLabel
            ? `
              <li>
                ${escapeHtml(localizeWithFallback("DDA.Damage.TypeLabel", "Tipo de Dano"))}:
                <strong>${escapeHtml(damageInfo.damageTypeLabel)}</strong>.
              </li>
            `
            : ""
        }

        ${
          damageInfo.reduction > 0
            ? `
              <li class="damage-reduction">
                ${escapeHtml(localizeWithFallback("DDA.Damage.ReductionLabel", "Redução"))}:
                <strong>-${damageInfo.reduction}</strong>
                ${damageInfo.reductionSource ? `(${escapeHtml(damageInfo.reductionSource)})` : ""}.
              </li>
            `
            : ""
        }

        <li>
          ${escapeHtml(localizeWithFallback("DDA.Damage.Final", "Dano Final"))}:
          <strong>${effectiveDamage}</strong>.
        </li>

        ${
          lifesteal?.healed > 0
            ? `<li class="damage-healing"><strong>${escapeHtml(lifesteal.attackerName)}</strong> ${escapeHtml(localizeWithFallback("DDA.Damage.LifestealHealed", "recuperou {value} Caixa(s) de Ferimento com [DRAIN].", { value: lifesteal.healed }))}</li>`
            : ""
        }
        ${
          lifesteal?.absorbedByDoom > 0
            ? `<li class="damage-healing damage-healing-absorbed">${escapeHtml(localizeWithFallback("DDA.Damage.LifestealDoomAbsorbed", "[DOOM] absorveu {value} ponto(s) da cura de [DRAIN].", { value: lifesteal.absorbedByDoom }))}</li>`
            : ""
        }

        ${
          result.absorbedByTemp > 0
            ? `
              <li class="damage-temp-absorbed">
                ${escapeHtml(localizeWithFallback("DDA.Damage.TempAbsorbed", "Temp. absorveu"))}:
                <strong>${result.absorbedByTemp}</strong>.
              </li>
            `
            : ""
        }

        ${
          result.healthDamage > 0
            ? `
              <li class="damage-health-loss">
                ${escapeHtml(localizeWithFallback("DDA.Damage.HealthDamage", "Dano em Saúde"))}:
                <strong>${result.healthDamage}</strong>.
              </li>
            `
            : ""
        }

        ${
          bossTemplate
            ? `
              <li class="damage-boss-template-pool">
                <strong>${escapeHtml(localizeWithFallback("DDA.BossTemplate.Pool", "Boss Wound Pool"))} ${bossTemplate.poolIndex}:</strong>
                ${bossTemplate.assignedUserName ? `${escapeHtml(bossTemplate.assignedUserName)} — ` : ""}
                <strong>${bossTemplate.before} → ${bossTemplate.after} / ${bossTemplate.max}</strong>.
              </li>
              <li class="damage-boss-template-remaining">
                ${escapeHtml(localizeWithFallback("DDA.BossTemplate.RemainingPools", "Wound Pools restantes", { count: bossTemplate.remainingPools }))}:
                <strong>${bossTemplate.remainingPools}</strong>.
              </li>
            `
            : ""
        }

        <li>
          ${escapeHtml(localizeWithFallback("DDA.Damage.Temporary", "Temporárias"))}:
          <strong>${currentTemp} → ${result.temp}</strong>.
        </li>

        <li>
          ${escapeHtml(localizeWithFallback("DDA.Damage.Health", "Saúde"))}:
          <strong>${currentWounds} → ${result.wounds}</strong>.
        </li>
        ${
          fatesProtection?.used
            ? `
              <li class="damage-fates-protection">
                <strong>${escapeHtml(localizeWithFallback("DDA.FatesProtection.Title", "Proteção do Destino"))}:</strong>
                ${escapeHtml(localizeWithFallback("DDA.FatesProtection.Applied", "Todo o Dano deste Ataque foi evitado."))}
              </li>
            `
            : ""
        }
        ${
          survivalInstinct?.used
            ? `
              <li class="damage-survival-instinct">
                <strong>FLOW WITH IT:</strong>
                ${escapeHtml(
                  localizeWithFallback(
                    "DDA.TamerTalent.SurvivalInstinct.Applied",
                    "O Dano Inalterável associado foi ignorado e o restante foi reduzido pela metade."
                  )
                )}
              </li>
            `
            : ""
        }
        ${
          gritSurvival?.used
            ? `
              <li class="damage-grit-survival">
                <strong>
                  ${escapeHtml(
                    localizeWithFallback(
                      "DDA.TamerTalent.Grit.Title",
                      "Grit"
                    )
                  )}:
                </strong>

                ${escapeHtml(
                  localizeWithFallback(
                    "DDA.TamerTalent.Grit.SurvivalApplied",
                    "O Digi-Escolhido permaneceu com 1 Caixa de Ferimento."
                  )
                )}
              </li>
            `
            : ""
        }
        ${
  combatMonsterResolve
    ? `
      <li class="damage-combat-monster-resolve">
        <strong>${combatMonsterResolve.qualityName}</strong>:
        Resolve
        <strong>${combatMonsterResolve.before} → ${combatMonsterResolve.after}</strong>.
      </li>
    `
    : ""
}

        ${
          shieldBroken
            ? `
              <li class="damage-shield-broken">
                <strong>${escapeHtml(localizeWithFallback("DDA.Damage.ShieldBroken", "[ESCUDO] quebrado:"))}</strong>
                ${escapeHtml(localizeWithFallback("DDA.Damage.TempHealthDepleted", "Saúde Temporária esgotada."))}
              </li>
            `
            : ""
        }

        ${
          !multiStageTransition?.handled && (bossTemplate ? bossTemplate.allDefeated : result.wounds <= 0)
            ? `
              <li class="damage-defeated">
                <strong>${escapeHtml(localizeWithFallback("DDA.Damage.Defeated", "Derrotado."))}</strong>
              </li>
            `
            : ""
        }
      </ul>
    </div>
  `;
}

function getDamageApplicationInfo(actor, damage, options = {}) {
  const rawDamage = Math.max(0, Number(damage ?? 0));
  const damageType = normalizeDamageType(options.damageType ?? "");
  const damageTypeLabel = getDamageTypeLabel(damageType, options.damageLabel);
  const ignoresReduction = Boolean(options.ignoreReduction || options.unalterable);

  const reductionData = ignoresReduction
    ? { value: 0, tooltip: "" }
    : getDamageReductionData(actor, damageType);

  const reduction = Math.min(rawDamage, reductionData.value);

  return {
    rawDamage,
    damageType,
    damageTypeLabel,
    reduction,
    reductionSource: reductionData.tooltip,
    ignoresReduction,
    effectiveDamage: Math.max(0, rawDamage - reduction)
  };
}

function normalizeDamageType(value = "") {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const aliases = {
  crash: "crash",
  collision: "crash",
  colisao: "crash",
  colision: "crash",
  impact: "crash",
  impacto: "crash",
  fall: "crash",
  falling: "crash",
  queda: "crash",
  throw: "crash",
  thrown: "crash",
  arremesso: "crash",
  arremessado: "crash",

  burn: "burn",
  burning: "burn",
  queimadura: "burn",
  queimando: "burn",
  fogo: "burn",
  fire: "burn",

  freeze: "freeze",
  freezing: "freeze",
  frozen: "freeze",
  congelamento: "freeze",
  congelado: "freeze",
  gelo: "freeze",
  ice: "freeze",

  poison: "poison",
  poisoned: "poison",
  veneno: "poison",
  envenenado: "poison",
  toxina: "poison",
  toxin: "poison"
};

  return aliases[normalized] ?? normalized;
}

function getDamageTypeLabel(damageType = "", fallback = "") {
  const explicit = String(fallback ?? "").trim();
  if (explicit) return explicit;

  const labelKey = DAMAGE_TYPE_LABEL_KEYS[damageType];

  if (!labelKey) return "";

  return localizeWithFallback(labelKey, "");
}

function getDamageReductionData(actor, damageType = "") {
  const normalizedDamageType = normalizeDamageType(damageType);

  if (!normalizedDamageType) {
    return {
      value: 0,
      tooltip: ""
    };
  }

  // Crash Damage é especial porque Tumbler/Acrobata usa RAM
  // e Naturewalk Wind/Thunder já é somado em crashDamageReduction.
  if (normalizedDamageType === "crash") {
    const crashReduction = actor.system?.utilityBonuses?.crashDamageReduction ?? {};
    const value = Math.max(0, Number(crashReduction.total ?? crashReduction.value ?? 0));

    if (value <= 0) {
      return {
        value: 0,
        tooltip: ""
      };
    }

    const fallbackLabel = localizeWithFallback(
      DAMAGE_REDUCTION_LABEL_KEYS.crash,
      "Redução de Colisão"
    );

    return {
      value,
      tooltip: crashReduction.tooltip || crashReduction.label || fallbackLabel
    };
  }

  const typedReduction = actor.system?.utilityBonuses?.damageReductionByType?.[normalizedDamageType] ?? {};
  const value = Math.max(0, Number(typedReduction.total ?? typedReduction.value ?? 0));

  if (value <= 0) {
    return {
      value: 0,
      tooltip: ""
    };
  }

  const fallbackLabel = localizeWithFallback(
    DAMAGE_REDUCTION_LABEL_KEYS[normalizedDamageType],
    "Damage Reduction"
  );

  const sources = Array.isArray(typedReduction.sources)
    ? typedReduction.sources
    : [];

  return {
    value,
    tooltip: sources.length
      ? sources.map((source) => {
          const sourceName = source.name ?? fallbackLabel;
          const sourceLabel = source.label ? `: ${source.label}` : "";
          const sourceValue = Number(source.value ?? value);

          return `${sourceName}${sourceLabel} (${sourceValue})`;
        }).join("\n")
      : fallbackLabel
  };
}

function calculateWoundLoss(
  currentWounds,
  currentTemp,
  damage,
  { tempDamageMultiplier = 1 } = {}
) {
  let remainingDamage = Math.max(0, Number(damage ?? 0));
  let temp = Math.max(0, Number(currentTemp ?? 0));
  let wounds = Math.max(0, Number(currentWounds ?? 0));

  const multiplier = Math.max(1, Number(tempDamageMultiplier ?? 1));
  let absorbedByTemp = 0;
  let damageSpentOnTemp = 0;
  let healthDamage = 0;

  if (temp > 0 && remainingDamage > 0) {
    absorbedByTemp = Math.min(temp, remainingDamage * multiplier);
    damageSpentOnTemp = Math.min(
      remainingDamage,
      Math.ceil(absorbedByTemp / multiplier)
    );
    temp -= absorbedByTemp;
    remainingDamage -= damageSpentOnTemp;
  }

  if (remainingDamage > 0) {
    const oldWounds = wounds;
    wounds = Math.max(0, wounds - remainingDamage);
    healthDamage = Math.max(0, oldWounds - wounds);
  }

  return {
    wounds,
    temp,
    absorbedByTemp,
    damageSpentOnTemp,
    healthDamage,
    tempDamageMultiplier: multiplier
  };
}

async function applyLifestealFromDamage({
  attacker,
  defender,
  damageResult = {},
  effectiveDamage = 0,
  tempDamageMultiplier = 1,
  cap = 0,
  key = ""
} = {}) {
  if (!attacker || !defender || cap <= 0 || !key) return null;
  if (attacker.uuid === defender.uuid) return null;

  const attackDamageActuallyDealt = Math.max(
    0,
    Math.min(
      Number(effectiveDamage ?? 0),
      Number(damageResult.healthDamage ?? 0) +
        Math.ceil(
          Number(damageResult.absorbedByTemp ?? 0) /
          Math.max(1, Number(tempDamageMultiplier ?? 1))
        )
    )
  );

  if (attackDamageActuallyDealt <= 0) return null;

  const offensive = foundry.utils.deepClone(
    attacker.system?.combat?.offensiveQualities ?? {}
  );
  offensive.lifesteal ??= {};
  const previous = offensive.lifesteal[key] ?? {};
  const alreadyHealed = Math.max(0, Number(previous.healed ?? 0));
  const alreadySpent = Math.max(alreadyHealed, Number(previous.spent ?? alreadyHealed));
  const requestedHeal = Math.max(
    0,
    Math.min(
      attackDamageActuallyDealt,
      Math.max(0, Number(cap ?? 0) - alreadySpent)
    )
  );

  if (requestedHeal <= 0) return {
    attackerName: attacker.name,
    healed: 0,
    absorbedByDoom: 0,
    totalHealed: alreadyHealed,
    cap
  };

  const path = attacker.type === "character"
    ? "system.derived.wounds"
    : "system.miscStats.wounds";
  const wounds = foundry.utils.getProperty(attacker, path) ?? {};
  const current = Math.max(0, Number(wounds.value ?? 0));
  const maximum = Math.max(current, Number(wounds.max ?? current));

  /*
   * [DOOM] absorbs gains before Wound Boxes are restored. The absorbed
   * amount still consumes this Attack's [DRAIN] ceiling, preventing an
   * Area Attack from bypassing DOS by resolving additional targets.
   */
  const effects = foundry.utils.deepClone(attacker.system?.effects?.active ?? []);
  const doomIndex = effects.findIndex((effect) => getEffectTagKey(effect?.tag) === "doom");
  let absorbedByDoom = 0;
  let remainingHeal = requestedHeal;

  if (doomIndex >= 0 && remainingHeal > 0) {
    const doom = effects[doomIndex] ?? {};
    const doomValue = Math.max(0, Number(doom.value ?? doom.potency ?? 0));
    absorbedByDoom = Math.min(doomValue, remainingHeal);
    remainingHeal -= absorbedByDoom;
    const nextDoomValue = doomValue - absorbedByDoom;

    if (nextDoomValue <= 0) {
      effects.splice(doomIndex, 1);
    } else {
      effects[doomIndex] = {
        ...doom,
        value: nextDoomValue,
        potency: doom.potency === undefined
          ? doom.potency
          : nextDoomValue
      };
    }
  }

  const actualHeal = Math.max(0, Math.min(remainingHeal, maximum - current));
  const spentThisApplication = absorbedByDoom + actualHeal;

  offensive.lifesteal[key] = {
    healed: alreadyHealed + actualHeal,
    spent: alreadySpent + spentThisApplication,
    cap,
    combatId: String(game.combat?.id ?? ""),
    round: Number(game.combat?.round ?? 0),
    turn: Number(game.combat?.turn ?? -1)
  };

  await attacker.update({
    [`${path}.value`]: current + actualHeal,
    "system.combat.offensiveQualities": offensive,
    ...(absorbedByDoom > 0 ? { "system.effects.active": effects } : {})
  });

  return {
    attackerName: attacker.name,
    healed: actualHeal,
    absorbedByDoom,
    totalHealed: alreadyHealed + actualHeal,
    cap
  };
}

async function removeShieldEffectIfTempDepleted(actor) {
  const currentEffects = foundry.utils.deepClone(actor.system.effects?.active ?? []);

  if (!currentEffects.length) return false;

  const updatedEffects = currentEffects.filter((effect) => {
    return getEffectTagKey(effect.tag) !== "shield";
  });

  if (updatedEffects.length === currentEffects.length) return false;

  await actor.update({
    "system.effects.active": updatedEffects
  });

  return true;
}

function getEffectTagKey(tag) {
  return String(tag ?? "")
    .trim()
    .replace("[", "")
    .replace("]", "")
    .toLowerCase();
}

function normalizeQualityKeyForDamage(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function findCombatMonsterQuality(actor) {
  return actor?.items?.find((item) => {
    if (item.type !== "quality") return false;

    const sourceId = normalizeQualityKeyForDamage(item.system?.sourceId ?? "");
    const name = normalizeQualityKeyForDamage(item.name ?? "");
    const originalName = normalizeQualityKeyForDamage(item.system?.originalName ?? "");

    return (
      sourceId === "monstrodecombate" ||
      sourceId === "combatmonster" ||
      name === "monstrodecombate" ||
      name === "combatmonster" ||
      originalName === "combatmonster"
    );
  }) ?? null;
}

function areDamageActorsAllies(attacker, defender) {
  if (!attacker || !defender) return false;

  const attackerSide = attacker.system?.combat?.initiative?.side ?? "";
  const defenderSide = defender.system?.combat?.initiative?.side ?? "";

  if (attackerSide && defenderSide) {
    return attackerSide === defenderSide;
  }

  if (attacker.type === "character" || defender.type === "character") {
    return true;
  }

  return false;
}

function warnLocalized(key, fallback) {
  ui.notifications.warn(localizeWithFallback(key, fallback));
}

function localizeWithFallback(key, fallback = "", data = {}) {
  if (!key) return interpolateFallback(fallback, data);

  const hasData = data && Object.keys(data).length > 0;
  const localized = hasData
    ? game.i18n.format(key, data)
    : game.i18n.localize(key);

  if (localized && localized !== key) {
    return localized;
  }

  return interpolateFallback(fallback, data);
}

function interpolateFallback(template = "", data = {}) {
  return String(template ?? "").replace(/\{([^}]+)\}/g, (match, key) => {
    return data[key] ?? match;
  });
}

function escapeHtml(value = "") {
  const element = document.createElement("div");
  element.innerText = String(value ?? "");
  return element.innerHTML;
}
