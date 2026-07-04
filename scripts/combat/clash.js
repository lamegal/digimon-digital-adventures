import { getDDASetting } from "../settings.js";
import { rollAttack } from "../rolls/attack-roll.js";

const DDA_SYSTEM_ID = "digimon-digital-adventures";
const DDA_CLASH_SOCKET_ACTION_UPDATE_ACTOR = "clashUpdateActor";
const DDA_CLASH_SOCKET_ACTION_UPDATE_CLASH_STATE = "clashUpdateState";

function localize(key) {
  return game?.i18n?.localize(key) ?? key;
}

function formatI18n(key, data = {}) {
  return game?.i18n?.format(key, data) ?? key;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPrimaryActiveGM() {
  return Array.from(game?.users ?? [])
    .filter((user) => user?.isGM && user?.active)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

function isPrimaryActiveGM() {
  return Boolean(game?.user?.isGM && getPrimaryActiveGM()?.id === game.user.id);
}

function canUpdateActor(actor) {
  if (!actor) return false;
  if (game?.user?.isGM) return true;
  return Boolean(actor.canUserModify?.(game.user, "update"));
}

async function requestGMClashUpdate(payload = {}) {
  const primaryGM = getPrimaryActiveGM();

  if (!primaryGM) {
    ui.notifications.warn(localize("DDA.Warning.ClashRequiresActiveGM"));
    return false;
  }

  game.socket.emit(`system.${DDA_SYSTEM_ID}`, {
    ...payload,
    systemId: DDA_SYSTEM_ID,
    requestUserId: game.user?.id ?? ""
  });

  return true;
}

async function updateActorData(actor, update = {}, options = {}) {
  if (!actor) return false;

  if (canUpdateActor(actor)) {
    await actor.update(update, options);
    return true;
  }

  return requestGMClashUpdate({
    action: DDA_CLASH_SOCKET_ACTION_UPDATE_ACTOR,
    actorUuid: actor.uuid,
    update,
    options
  });
}

Hooks.once("ready", () => {
  game.socket?.on(`system.${DDA_SYSTEM_ID}`, async (payload = {}, respond) => {
    if (payload?.systemId !== DDA_SYSTEM_ID) return;
    if (![DDA_CLASH_SOCKET_ACTION_UPDATE_ACTOR, DDA_CLASH_SOCKET_ACTION_UPDATE_CLASH_STATE].includes(payload?.action)) return;
    if (!isPrimaryActiveGM()) return;

    try {
      const actor = await resolveActor(payload.actorUuid);

      if (!actor) throw new Error(`Actor not found: ${payload.actorUuid}`);

      if (payload.action === DDA_CLASH_SOCKET_ACTION_UPDATE_ACTOR) {
        await actor.update(payload.update ?? {}, payload.options ?? {});
      }

      if (payload.action === DDA_CLASH_SOCKET_ACTION_UPDATE_CLASH_STATE) {
        await updateActorClashState(actor, payload.state ?? {}, { forceLocal: true });
      }

      if (typeof respond === "function") respond({ ok: true });
    } catch (error) {
      console.error("DDA | Clash socket handler failed.", error, payload);
      if (typeof respond === "function") respond({ ok: false, error: String(error?.message ?? error) });
    }
  });
});

async function resolveActor(uuid) {
  if (!uuid) return null;

  try {
    const document = await fromUuid(uuid);
    return document?.documentName === "Actor" ? document : null;
  } catch (error) {
    console.warn("DDA | Could not resolve Actor UUID:", uuid, error);
    return null;
  }
}

function getDDASettingSafe(key, fallback) {
  try {
    return getDDASetting(key);
  } catch (_error) {
    return fallback;
  }
}

const SIZE_ORDER = ["small", "medium", "large", "huge", "gigantic", "colossal"];

function getSizeIndex(sizeKey = "medium") {
  const index = SIZE_ORDER.indexOf(String(sizeKey ?? "medium"));
  return index >= 0 ? index : SIZE_ORDER.indexOf("medium");
}

function getStatTotal(pathLike) {
  if (typeof pathLike === "number") return pathLike;
  return Number(pathLike?.value ?? pathLike?.total ?? pathLike?.base ?? 0);
}

function getClashTotal(actor) {
  return Number(actor?.system?.miscStats?.clash?.value ?? actor?.system?.miscStats?.clash?.total ?? 0);
}

function getCpuTotal(actor) {
  return Number(actor?.system?.derivedStats?.cpu?.value ?? actor?.system?.derivedStats?.cpu?.total ?? 0);
}

function getRamTotal(actor) {
  return Number(actor?.system?.derivedStats?.ram?.value ?? actor?.system?.derivedStats?.ram?.total ?? 0);
}

function getBestCpuOrRam(actor) {
  return Math.max(getCpuTotal(actor), getRamTotal(actor));
}

function isDigimonLike(actor) {
  return actor && ["digimon", "npc"].includes(actor.type);
}

function getSelectedTargetActor() {
  const targets = Array.from(game?.user?.targets ?? []);
  if (targets.length !== 1) return { error: targets.length ? "DDA.Warning.SelectExactlyOneDigimonTargetForClash" : "DDA.Warning.SelectDigimonTargetForClash" };

  const targetToken = targets[0];
  const targetActor = targetToken?.actor;

  if (!isDigimonLike(targetActor)) return { error: "DDA.Warning.SelectDigimonTargetForClash" };

  return { targetToken, targetActor };
}

function actorHasQuality(actor, names = []) {
  const normalizedNames = names.map(normalizeText);
  return Array.from(actor?.items ?? []).some((item) => {
    if (item?.type !== "quality") return false;
    const haystack = normalizeText([
      item.name,
      item.system?.label,
      item.system?.originalLabel,
      item.system?.description,
      item.system?.effect
    ].filter(Boolean).join(" "));
    return normalizedNames.some((name) => haystack.includes(name));
  });
}

function normalizeText(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function hasMonsterStrength(actor) {
  return actorHasQuality(actor, ["Monster Strength", "Força Monstruosa", "Forca Monstruosa"]);
}

function hasTitanPower(actor) {
  return actorHasQuality(actor, ["Titan Power", "Poder Titânico", "Poder Titanico"]);
}

function hasWrestlemania(actor) {
  return actorHasQuality(actor, ["Wrestlemania", "Data Specialization Wrestlemania", "Especialização de Dados Wrestlemania", "Especializacao de Dados Wrestlemania"]);
}

function hasTeleport(actor) {
  const movementTypes = actor?.system?.movementTypes ?? {};
  const teleport = movementTypes.teleport ?? {};
  if (teleport.enabled) return true;
  return actorHasQuality(actor, ["Teleport", "Teleporte"]);
}

function hasPointBlank(actor) {
  return actorHasQuality(actor, ["Point Blank", "À Queima-Roupa", "A Queima Roupa"]);
}

function getSizeDifference(a, b) {
  return getSizeIndex(a?.system?.size) - getSizeIndex(b?.system?.size);
}

async function rollClashCheck(actor, opponent, { bonus = 0 } = {}) {
  const clash = getClashTotal(actor);
  const sizeBonus = getSizeIndex(actor.system?.size) > getSizeIndex(opponent.system?.size) ? 1 : 0;
  const modifier = clash + sizeBonus + Number(bonus ?? 0);
  const roll = await new Roll("3d6 + @modifier", { modifier }).evaluate();

  return {
    actor,
    roll,
    total: Number(roll.total ?? 0),
    clash,
    sizeBonus,
    bonus: Number(bonus ?? 0)
  };
}

async function rollFixedCheck(actor, statValue, tn, title, cardClass = "dda-clash-card") {
  const modifier = Number(statValue ?? 0);
  const roll = await new Roll("3d6 + @modifier", { modifier }).evaluate();
  const total = Number(roll.total ?? 0);
  const success = total >= tn;
  const criticalSuccess = total >= tn + 5;
  const criticalFailure = total <= tn - 5;
  const outcome = criticalSuccess ? "criticalSuccess" : success ? "success" : criticalFailure ? "criticalFailure" : "failure";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content: `
      <div class="dda-chat-roll-message dda-clash-check-message">
        <div class="dda-chat-card dda-effect-card ${cardClass} dda-clash-check-card ${outcome}">
          <h2>${escapeHtml(title)}</h2>
          <ul class="dda-effect-list">
            <li>${localize("DDA.Roll.TN")}: <strong>${tn}</strong>.</li>
            <li>${localize("DDA.Roll.Result")}: <strong>${localize(`DDA.Check.${outcome[0].toUpperCase()}${outcome.slice(1)}`)}</strong>.</li>
          </ul>
        </div>
        ${await roll.render()}
      </div>
    `
  });

  return { roll, total, tn, success, criticalSuccess, criticalFailure, outcome };
}

function resolveController(a, b, aRoll, bRoll) {
  if (aRoll.total > bRoll.total) return a;
  if (bRoll.total > aRoll.total) return b;

  const aCpu = getCpuTotal(a);
  const bCpu = getCpuTotal(b);

  if (aCpu > bCpu) return a;
  if (bCpu > aCpu) return b;

  return a.type === "digimon" ? a : b;
}

function getOtherClashUuid(state, actor) {
  const actorUuid = actor?.uuid;
  if (state.initiatorUuid === actorUuid) return state.opponentUuid;
  if (state.opponentUuid === actorUuid) return state.initiatorUuid;
  return state.opponentUuid || state.initiatorUuid;
}

function getClashState(actor) {
  return foundry.utils.deepClone(actor?.system?.clash?.state ?? {});
}

function hasActiveClash(actor) {
  return Boolean(actor?.system?.clash?.state?.active || actor?.system?.combat?.clash?.active);
}

function getClashMapKey(actorOrUuid) {
  return String(actorOrUuid?.uuid ?? actorOrUuid ?? "")
    .replaceAll(".", "__DOT__");
}

function getLegacyDottedMapValue(map = {}, actorOrUuid = "") {
  const dottedKey = String(actorOrUuid?.uuid ?? actorOrUuid ?? "");
  if (!dottedKey || typeof map !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(map, dottedKey)) return map[dottedKey];

  let cursor = map;
  for (const part of dottedKey.split(".")) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = cursor[part];
  }

  return cursor;
}

function getClashMapValue(map = {}, actorOrUuid = "", fallback = 0) {
  if (typeof map === "number") return Number(map ?? fallback);
  if (!map || typeof map !== "object") return fallback;

  const safeKey = getClashMapKey(actorOrUuid);
  const value = map[safeKey] ?? getLegacyDottedMapValue(map, actorOrUuid);

  return value ?? fallback;
}

function setClashMapValue(map = {}, actorOrUuid = "", value = 0) {
  const nextMap = foundry.utils.deepClone(map ?? {});
  nextMap[getClashMapKey(actorOrUuid)] = value;
  return nextMap;
}

function getClashParticipantUuids(state = {}) {
  const uuids = new Set();

  for (const value of [
    state.initiatorUuid,
    state.opponentUuid,
    state.controllerUuid,
    state.pinnedByUuid,
    state.lastActionUuid
  ]) {
    if (value) uuids.add(String(value));
  }

  for (const entry of state.actionLog ?? []) {
    if (entry?.actorUuid) uuids.add(String(entry.actorUuid));
  }

  return Array.from(uuids);
}

function shouldKeepClashMapValue(value) {
  if (value === undefined || value === null) return false;
  if (value === 0 || value === false) return false;
  if (typeof value === "object") return false;
  return true;
}

function sanitizeClashMap(map = {}, participantUuids = []) {
  if (!map || typeof map !== "object") return {};

  const cleanMap = {};

  for (const uuid of participantUuids) {
    const value = getClashMapValue(map, uuid, undefined);

    if (shouldKeepClashMapValue(value)) {
      cleanMap[getClashMapKey(uuid)] = value;
    }
  }

  return cleanMap;
}

function sanitizeClashStateMaps(state = {}) {
  const nextState = foundry.utils.deepClone(state ?? {});
  const participantUuids = getClashParticipantUuids(nextState);

  for (const key of [
    "pinUses",
    "comebackBonus",
    "nextContestBonus",
    "blockedPairs",
    "actionCounts",
    "extendedReach"
  ]) {
    nextState[key] = sanitizeClashMap(nextState[key], participantUuids);
  }

  return nextState;
}

function getNextContestBonus(state, actorUuid) {
  return Number(getClashMapValue(state?.nextContestBonus, actorUuid, 0));
}

function getActionCount(state, actorUuid) {
  return Number(getClashMapValue(state?.actionCounts, actorUuid, 0));
}

function recordClashAction(state, actor, action) {
  const nextState = foundry.utils.deepClone(state ?? {});
  let actionCounts = foundry.utils.deepClone(nextState.actionCounts ?? {});
  const actionLog = Array.isArray(nextState.actionLog) ? [...nextState.actionLog] : [];

  actionCounts = setClashMapValue(actionCounts, actor, Number(getClashMapValue(actionCounts, actor, 0)) + 1);
  actionLog.push({
    actorUuid: actor.uuid,
    actorName: actor.name,
    action,
    at: new Date().toISOString()
  });

  nextState.actionCounts = actionCounts;
  nextState.actionLog = actionLog;
  nextState.lastActionUuid = actor.uuid;
  nextState.lastAction = action;

  return nextState;
}

function getEmptyLegacyClashState() {
  return {
    active: false,
    opponentUuid: "",
    controllerUuid: "",
    initiatorUuid: "",
    pinned: false,
    pinUses: 0,
    comebackBonus: 0,
    extendedReach: 0
  };
}

function getLegacyClashState(state = {}, actor = null) {
  const active = Boolean(state.active);
  const actorUuid = actor?.uuid ?? "";
  const opponentUuid = active ? getOtherClashUuid(state, actor) : "";

  return {
    active,
    opponentUuid,
    controllerUuid: active ? String(state.controllerUuid ?? "") : "",
    initiatorUuid: active ? String(state.initiatorUuid ?? "") : "",
    pinned: active ? Boolean(state.pinned) : false,
    pinUses: active ? Number(getClashMapValue(state.pinUses, actorUuid, 0)) : 0,
    comebackBonus: active ? Number(getClashMapValue(state.comebackBonus, actorUuid, 0)) : 0,
    extendedReach: active ? Number(getClashMapValue(state.extendedReach, actorUuid, 0)) : 0
  };
}

function buildClashMapDeleteUpdate(actor, nextState = {}) {
  const update = {};
  const currentState = actor?.system?.clash?.state ?? {};

  for (const key of [
    "pinUses",
    "comebackBonus",
    "nextContestBonus",
    "blockedPairs",
    "actionCounts",
    "extendedReach"
  ]) {
    const currentMap = currentState[key] ?? {};
    const nextMap = nextState[key] ?? {};

    if (!currentMap || typeof currentMap !== "object") continue;

    for (const oldKey of Object.keys(currentMap)) {
      const oldValue = currentMap[oldKey];
      const keepExistingKey = Object.prototype.hasOwnProperty.call(nextMap, oldKey) && shouldKeepClashMapValue(nextMap[oldKey]);
      const brokenNestedKey = oldValue && typeof oldValue === "object";
      const emptyValueKey = !shouldKeepClashMapValue(oldValue);

      if (!keepExistingKey || brokenNestedKey || emptyValueKey) {
        update[`system.clash.state.${key}.-=${oldKey}`] = null;
      }
    }
  }

  return update;
}

function getSyntheticTokenDocument(actor) {
  if (!actor?.isToken) return null;

  const tokenDocument = actor.token ?? actor.parent ?? null;
  if (tokenDocument?.documentName === "Token") return tokenDocument;

  return null;
}

async function clearBaseActorClashForSyntheticToken(tokenDocument, { forceLocal = false } = {}) {
  const baseActor = tokenDocument?.actorId ? game.actors?.get(tokenDocument.actorId) : null;
  if (!baseActor) return;

  // Unlinked tokens inherit system data from their base actor and then apply
  // TokenDocument.delta on top. If an older build saved dotted UUID maps on the
  // base actor, a clean token delta can still inherit { Scene: { ... } }.
  // The base actor should not carry live Clash state for unlinked scene tokens,
  // so reset its Clash root before writing the token-specific delta.
if (forceLocal || canUpdateActor(baseActor)) {
  await baseActor.update({
    "system.clash": null,
    "system.combat.clash": getEmptyLegacyClashState()
  }, { diff: false });
  return;
}

await updateActorData(baseActor, {
  "system.clash": null,
  "system.combat.clash": getEmptyLegacyClashState()
}, { diff: false });
}

async function updateActorClashState(actor, state, { forceLocal = false } = {}) {
  if (!forceLocal && !canUpdateActor(actor)) {
  return requestGMClashUpdate({
    action: DDA_CLASH_SOCKET_ACTION_UPDATE_CLASH_STATE,
    actorUuid: actor.uuid,
    state
  });
}
  const legacyState = getLegacyClashState(state, actor);
  const tokenDocument = getSyntheticTokenDocument(actor);

  if (tokenDocument) {
    // Synthetic token actors keep their actor-specific data in TokenDocument.delta.
    // Actor.update can write new values, but stale nested map keys created by older
    // builds may remain stuck either in the token delta or inherited from the base
    // actor. Clean the base actor root, wipe the Clash delta, then write the
    // complete fresh state back to the token document.
    await clearBaseActorClashForSyntheticToken(tokenDocument, { forceLocal });

    await tokenDocument.update({
      "delta.system.clash": null,
      "delta.system.combat.clash": null
    });

    await tokenDocument.update({
      "delta.system.clash.state": state,
      "delta.system.combat.clash": legacyState
    });

    return;
  }

  const deleteUpdate = buildClashMapDeleteUpdate(actor, state);

  if (Object.keys(deleteUpdate).length) {
    await actor.update(deleteUpdate);
  }

  // Foundry deep-merges plain objects in Actor system data. If an older build
  // created nested map keys such as { Scene: { ... } }, updating the map to {}
  // or even null can still leave stale nested data behind on some actors.
  // Delete the whole state object first, then write the sanitized state fresh.
  await actor.update({
    "system.clash.-=state": null
  });

  await actor.update({
    "system.clash.state": state,
    "system.combat.clash": legacyState
  });
}

async function syncClashStateForPair(actorA, actorB, state) {
  const sanitizedState = sanitizeClashStateMaps(state);

  const stateA = {
    ...foundry.utils.deepClone(sanitizedState),
    role: sanitizedState.controllerUuid === actorA.uuid ? "controller" : "opponent"
  };

  const updates = [updateActorClashState(actorA, stateA)];

  if (actorB) {
    const stateB = {
      ...foundry.utils.deepClone(sanitizedState),
      role: sanitizedState.controllerUuid === actorB.uuid ? "controller" : "opponent"
    };

    updates.push(updateActorClashState(actorB, stateB));
  }

  await Promise.all(updates);
}

function getInactiveClashState(reason = "manual") {
  return {
    active: false,
    id: "",
    initiatorUuid: "",
    initiatorName: "",
    opponentUuid: "",
    opponentName: "",
    controllerUuid: "",
    controllerName: "",
    role: "",
    pinned: false,
    pinnedByUuid: "",
    pinUses: {},
    comebackBonus: {},
    nextContestBonus: {},
    blockedPairs: {},
    actionCounts: {},
    actionLog: [],
    intents: {},
    endedReason: reason,
    endedAt: new Date().toISOString(),
    startedAt: ""
  };
}

function getRoleFor(actor, state = {}) {
  if (state.controllerUuid === actor?.uuid) return "controller";
  return "opponent";
}

function primaryActionOptions(actor) {
  const options = [
    ["attack", "DDA.Clash.Action.Primary.Attack"],
    ["move", "DDA.Clash.Action.Primary.Move"],
    ["pin", "DDA.Clash.Action.Primary.Pin"],
    ["end", "DDA.Clash.Action.Primary.End"],
    ["throw", "DDA.Clash.Action.Primary.Throw"]
  ];

  if (hasWrestlemania(actor)) options.push(["finisher", "DDA.Clash.Action.Primary.Finisher"]);
  return options;
}

function secondaryActionOptions(actor, state = {}) {
  const options = [
    ["weakAttack", "DDA.Clash.Action.Secondary.WeakAttack"],
    ["comeback", "DDA.Clash.Action.Secondary.Comeback"]
  ];

  if (state.pinned) options.push(["contestPin", "DDA.Clash.Action.Secondary.ContestPin"]);
  if (!state.pinned) options.push(["escape", "DDA.Clash.Action.Secondary.Escape"]);
  if (hasTeleport(actor)) options.push(["teleport", "DDA.Clash.Action.Secondary.Teleport"]);

  return options;
}

function renderSelect(name, label, options, selected = "") {
  return `
    <div class="form-group">
      <label>${escapeHtml(localize(label))}</label>
      <select name="${escapeHtml(name)}">
        ${options.map(([value, labelKey]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(localize(labelKey))}</option>`).join("")}
      </select>
    </div>
  `;
}

async function promptClashIntent(actor) {
  return new Promise((resolve) => {
    new Dialog({
      title: localize("DDA.Clash.IntentDialog.Title"),
      content: `
        <form class="dda-roll-dialog dda-clash-intent-dialog">
          <p>${formatI18n("DDA.Clash.IntentDialog.Hint", { actor: escapeHtml(actor.name) })}</p>
          ${renderSelect("primaryIntent", "DDA.Clash.IntentDialog.Primary", primaryActionOptions(actor), "attack")}
          ${renderSelect("secondaryIntent", "DDA.Clash.IntentDialog.Secondary", secondaryActionOptions(actor), "escape")}
        </form>
      `,
      buttons: {
        confirm: {
          label: localize("DDA.Button.Confirm"),
          callback: (html) => {
            const form = html[0]?.querySelector("form");
            resolve({
              primaryIntent: form?.primaryIntent?.value ?? "attack",
              secondaryIntent: form?.secondaryIntent?.value ?? "escape"
            });
          }
        },
        cancel: {
          label: localize("DDA.Button.Cancel"),
          callback: () => resolve(null)
        }
      },
      default: "confirm",
      close: () => resolve(null)
    }).render(true);
  });
}

async function promptClashAction(actor, state = {}) {
  const role = getRoleFor(actor, state);
  const options = role === "controller" ? primaryActionOptions(actor) : secondaryActionOptions(actor, state);

  return new Promise((resolve) => {
    new Dialog({
      title: role === "controller" ? localize("DDA.Clash.PrimaryMenu.Title") : localize("DDA.Clash.SecondaryMenu.Title"),
      content: `
        <form class="dda-roll-dialog dda-clash-action-dialog">
          <p>${formatI18n("DDA.Clash.ActionDialog.Hint", { actor: escapeHtml(actor.name), role: escapeHtml(localize(role === "controller" ? "DDA.Clash.Role.Controller" : "DDA.Clash.Role.Opponent")) })}</p>
          ${renderSelect("action", role === "controller" ? "DDA.Clash.PrimaryAction" : "DDA.Clash.SecondaryAction", options)}
        </form>
      `,
      buttons: {
        confirm: {
          label: localize("DDA.Button.Confirm"),
          callback: (html) => resolve(html[0]?.querySelector("form")?.action?.value ?? null)
        },
        cancel: {
          label: localize("DDA.Button.Cancel"),
          callback: () => resolve(null)
        }
      },
      default: "confirm",
      close: () => resolve(null)
    }).render(true);
  });
}

function renderActionButton(actor, labelKey, action = "menu") {
  return `<button type="button" class="dda-clash-chat-action" data-action="dda-clash-action" data-clash-action="${escapeHtml(action)}" data-actor-uuid="${escapeHtml(actor.uuid)}">${escapeHtml(localize(labelKey))}</button>`;
}

function renderClashCard({ title, lines = [], controllerActor = null, opponentActor = null, includeButtons = false, extraClass = "" }) {
  return `
    <div class="dda-chat-card dda-effect-card dda-clash-card ${escapeHtml(extraClass)}">
      <h2>${escapeHtml(title)}</h2>
      <ul class="dda-effect-list dda-clash-list">
        ${lines.map((line) => `<li>${line}</li>`).join("")}
      </ul>
      ${includeButtons ? `
        <div class="dda-clash-chat-actions">
          ${controllerActor ? renderActionButton(controllerActor, "DDA.Clash.Button.ControllerActions", "menu") : ""}
          ${opponentActor ? renderActionButton(opponentActor, "DDA.Clash.Button.OpponentActions", "menu") : ""}
          ${controllerActor ? renderActionButton(controllerActor, "DDA.Clash.Button.End", "end") : ""}
        </div>
      ` : ""}
    </div>
  `;
}

function getActionLabel(actionKey, role = "controller") {
  const prefix = role === "controller" ? "DDA.Clash.Action.Primary" : "DDA.Clash.Action.Secondary";
  const map = {
    attack: `${prefix}.Attack`,
    move: `${prefix}.Move`,
    pin: `${prefix}.Pin`,
    end: `${prefix}.End`,
    throw: `${prefix}.Throw`,
    finisher: `${prefix}.Finisher`,
    weakAttack: `${prefix}.WeakAttack`,
    comeback: `${prefix}.Comeback`,
    contestPin: `${prefix}.ContestPin`,
    escape: `${prefix}.Escape`,
    teleport: `${prefix}.Teleport`
  };
  return localize(map[actionKey] ?? actionKey);
}

function getAttackItems(actor) {
  return Array.from(actor?.items ?? []).filter((item) => item?.type === "attack");
}

function getAttackRangeType(attackItem) {
  return normalizeText(attackItem?.system?.baseTags?.rangeType ?? "");
}

function getAttackFunctionType(attackItem) {
  return normalizeText(attackItem?.system?.baseTags?.functionType ?? "damage");
}

function isMeleeAttack(attackItem) {
  return getAttackRangeType(attackItem) === "melee";
}

function isRangedAttack(attackItem) {
  const rangeType = getAttackRangeType(attackItem);
  return rangeType === "range" || rangeType === "ranged";
}

function isSupportAttack(attackItem) {
  return getAttackFunctionType(attackItem) === "support";
}

function hasReach(actor) {
  return actorHasQuality(actor, ["Reach", "Alcance"]);
}

function getClashAttackOptions(actor, { weakAttack = false } = {}) {
  const attacks = getAttackItems(actor);
  if (!weakAttack) return attacks;

  const pointBlank = hasPointBlank(actor);
  return attacks.filter((attack) => {
    if (isRangedAttack(attack)) return pointBlank;
    return isMeleeAttack(attack) || isSupportAttack(attack);
  });
}

function renderAttackSelectOptions(attacks = []) {
  return attacks.map((attack) => {
    const rangeType = attack.system?.baseTags?.rangeType ?? "";
    const functionType = attack.system?.baseTags?.functionType ?? "";
    const tags = [rangeType, functionType].filter(Boolean).join(" / ");
    const label = tags ? `${attack.name} (${tags})` : attack.name;
    return `<option value="${escapeHtml(attack.id)}">${escapeHtml(label)}</option>`;
  }).join("");
}

async function promptClashAttackItem(actor, { weakAttack = false } = {}) {
  const allAttacks = getAttackItems(actor);
  if (!allAttacks.length) {
    ui.notifications.warn(formatI18n("DDA.Warning.NoAttackItemsAvailable", { actor: actor.name }));
    return null;
  }

  const attacks = getClashAttackOptions(actor, { weakAttack });
  if (!attacks.length) {
    ui.notifications.warn(weakAttack
      ? `${actor.name} has no valid Weak Attack. Weak Attack requires a [MELEE] or [SUPPORT] attack, unless Point Blank allows [RANGE] attacks.`
      : formatI18n("DDA.Warning.NoAttackItemsAvailable", { actor: actor.name })
    );
    return null;
  }

  return Dialog.wait({
    title: weakAttack ? localize("DDA.Clash.Action.Secondary.WeakAttack") : localize("DDA.Clash.Action.Primary.Attack"),
    content: `
      <form class="dda-roll-dialog dda-clash-attack-dialog">
        <p>${escapeHtml(actor.name)} — ${escapeHtml(weakAttack ? localize("DDA.Clash.Action.Secondary.WeakAttack") : localize("DDA.Clash.Action.Primary.Attack"))}</p>
        <div class="form-group">
          <label>${escapeHtml(localize("DDA.Item.Type.Attack"))}</label>
          <select name="attackId">
            ${renderAttackSelectOptions(attacks)}
          </select>
        </div>
      </form>
    `,
    buttons: {
      ok: {
        label: localize("DDA.Button.Confirm"),
        callback: (html) => {
          const attackId = html[0]?.querySelector("select[name='attackId']")?.value ?? "";
          return attacks.find((attack) => attack.id === attackId) ?? null;
        }
      },
      cancel: {
        label: localize("DDA.Button.Cancel"),
        callback: () => null
      }
    },
    default: "ok"
  });
}

function getTokenObjectForActor(actor) {
  const tokenDocument = getSyntheticTokenDocument(actor);
  if (tokenDocument?.object) return tokenDocument.object;

  return canvas?.tokens?.placeables?.find((token) => {
    return token?.actor?.uuid === actor?.uuid || token?.actor?.id === actor?.id;
  }) ?? null;
}

async function executeClashAttack(attacker, defender, state, action, { weakAttack = false } = {}) {
  const attackItem = await promptClashAttackItem(attacker, { weakAttack });
  if (!attackItem) return null;

  const targetToken = getTokenObjectForActor(defender);
  if (!targetToken) {
    ui.notifications.warn(localize("DDA.Warning.ClashOpponentNotFound"));
    return null;
  }

  const nextState = recordClashAction(state, attacker, action);
  await syncClashStateForPair(attacker, defender, nextState);

  const rollResult = await rollAttack(attacker, attackItem, {
    targetToken,
    clashContext: {
      enabled: true,
      action,
      weakAttack,
      defenderHasReach: weakAttack ? hasReach(defender) : false
    }
  });

  if (!rollResult) return null;

  await syncClashStateForPair(attacker, defender, getClashState(attacker));
  return rollResult;
}

export async function initiateDigimonClash(actor) {
  if (!isDigimonLike(actor)) {
    ui.notifications.warn(localize("DDA.Warning.ClashOnlyForDigimon"));
    return null;
  }

  if (!Boolean(getDDASettingSafe("enableClashActions", true))) {
    ui.notifications.warn(localize("DDA.Warning.ClashDisabled"));
    return null;
  }

  const { targetActor, error } = getSelectedTargetActor();
  if (error) {
    ui.notifications.warn(localize(error));
    return null;
  }

  if (targetActor.uuid === actor.uuid) {
    ui.notifications.warn(localize("DDA.Warning.CannotClashSelf"));
    return null;
  }

  if (hasActiveClash(actor) || hasActiveClash(targetActor)) {
    ui.notifications.warn(localize("DDA.Warning.ClashParticipantAlreadyInClash"));
    return null;
  }

  const actions = Number(actor.system.combat?.actions?.value ?? 0);
  if (actions < 1) {
    ui.notifications.warn(localize("DDA.Warning.NotEnoughActionsForClash"));
    return null;
  }

  const intent = await promptClashIntent(actor);
  if (!intent) return null;

  const initiatorBonus = getNextContestBonus(getClashState(actor), actor.uuid);
  const targetBonus = getNextContestBonus(getClashState(targetActor), targetActor.uuid);

  const initiatorRoll = await rollClashCheck(actor, targetActor, { bonus: initiatorBonus });
  const targetRoll = await rollClashCheck(targetActor, actor, { bonus: targetBonus });
  const controller = resolveController(actor, targetActor, initiatorRoll, targetRoll);
  const opponent = controller.uuid === actor.uuid ? targetActor : actor;

  const autoEndForSize = getSizeDifference(controller, opponent) <= -2 && !hasMonsterStrength(controller);
  const stateBase = {
    active: !autoEndForSize,
    id: randomID(),
    initiatorUuid: actor.uuid,
    initiatorName: actor.name,
    opponentUuid: targetActor.uuid,
    opponentName: targetActor.name,
    controllerUuid: controller.uuid,
    controllerName: controller.name,
    pinned: false,
    pinnedByUuid: "",
    pinUses: {},
    comebackBonus: {},
    nextContestBonus: {},
    blockedPairs: {},
    actionCounts: {},
    actionLog: [],
    intents: {
      [getClashMapKey(actor)]: intent
    },
    startedAt: new Date().toISOString()
  };

await updateActorData(actor, {
  "system.combat.actions.value": Math.max(0, actions - 1),
  "system.combat.currentStance": "neutral"
});

await updateActorData(targetActor, {
  "system.combat.currentStance": "neutral"
});

  await syncClashStateForPair(actor, targetActor, stateBase);

  const lines = [
    formatI18n("DDA.Clash.Started", { initiator: escapeHtml(actor.name), opponent: escapeHtml(targetActor.name) }),
    formatI18n("DDA.Clash.RollSummaryDetailed", {
      initiator: escapeHtml(actor.name),
      initiatorTotal: initiatorRoll.total,
      opponent: escapeHtml(targetActor.name),
      opponentTotal: targetRoll.total
    }),
    formatI18n("DDA.Clash.Controller", { controller: escapeHtml(controller.name) }),
    formatI18n("DDA.Clash.IntentSummary", {
      primary: escapeHtml(getActionLabel(intent.primaryIntent, "controller")),
      secondary: escapeHtml(getActionLabel(intent.secondaryIntent, "opponent"))
    }),
    localize("DDA.Clash.NeutralStanceNote")
  ];

  if (autoEndForSize) {
    lines.push(localize("DDA.Clash.AutoEndTooSmall"));
    await syncClashStateForPair(actor, targetActor, getInactiveClashState("size"));
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: renderClashCard({
      title: localize("DDA.Clash.Title"),
      lines,
      controllerActor: autoEndForSize ? null : controller,
      opponentActor: autoEndForSize ? null : opponent,
      includeButtons: !autoEndForSize
    })
  });

  actor.sheet?.render(false);
  targetActor.sheet?.render(false);
  return stateBase;
}

export async function clearClashStateForActor(actor, { reason = "formChange" } = {}) {
  if (!isDigimonLike(actor)) return false;

  const state = foundry.utils.deepClone(actor.system?.clash?.state ?? {});
  const inactiveState = getInactiveClashState(reason);

  if (!state.active) {
    await updateActorClashState(actor, inactiveState);
    return true;
  }

  const otherActor = await resolveActor(getOtherClashUuid(state, actor));
  await syncClashStateForPair(actor, otherActor, inactiveState);
  return true;
}

export async function endDigimonClash(actor, { reason = "manual" } = {}) {
  if (!isDigimonLike(actor)) {
    ui.notifications.warn(localize("DDA.Warning.ClashOnlyForDigimon"));
    return null;
  }

  const state = foundry.utils.deepClone(actor.system.clash?.state ?? {});
  if (!state.active) {
    ui.notifications.warn(localize("DDA.Warning.NoActiveClash"));
    return null;
  }

  const otherActor = await resolveActor(getOtherClashUuid(state, actor));

  const inactiveState = getInactiveClashState(reason);
  await syncClashStateForPair(actor, otherActor, inactiveState);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: renderClashCard({
      title: localize("DDA.Clash.EndTitle"),
      lines: [
        formatI18n("DDA.Clash.Ended", { a: escapeHtml(actor.name), b: escapeHtml(otherActor?.name ?? state.opponentName ?? "") }),
        formatI18n("DDA.Clash.EndReasonLabel", { reason: escapeHtml(localize(`DDA.Clash.EndReason.${reason}`)) })
      ],
      extraClass: "dda-clash-ended-card"
    })
  });

  actor.sheet?.render(false);
  otherActor?.sheet?.render(false);
  return true;
}

export async function openDigimonClashActionMenu(actor) {
  if (!isDigimonLike(actor)) {
    ui.notifications.warn(localize("DDA.Warning.ClashOnlyForDigimon"));
    return null;
  }

  const state = foundry.utils.deepClone(actor.system.clash?.state ?? {});
  if (!state.active) {
    ui.notifications.warn(localize("DDA.Warning.NoActiveClash"));
    return null;
  }

  const action = await promptClashAction(actor, state);
  if (!action) return null;

  return executeClashAction(actor, action);
}

export async function executeClashAction(actor, action) {
  const state = foundry.utils.deepClone(actor.system.clash?.state ?? {});
  if (!state.active) {
    ui.notifications.warn(localize("DDA.Warning.NoActiveClash"));
    return null;
  }

  const role = getRoleFor(actor, state);
  const otherActor = await resolveActor(getOtherClashUuid(state, actor));
  if (!otherActor) {
    ui.notifications.warn(localize("DDA.Warning.ClashOpponentNotFound"));
    return null;
  }

  if (action === "end") return endDigimonClash(actor, { reason: "controller" });

  if (role === "controller") {
    return executePrimaryClashAction(actor, otherActor, state, action);
  }

  return executeSecondaryClashAction(actor, otherActor, state, action);
}

async function executePrimaryClashAction(controller, opponent, state, action) {
  if (action === "pin") {
    let pinUses = foundry.utils.deepClone(state.pinUses ?? {});
    const used = Number(getClashMapValue(pinUses, controller, 0));

    if (used >= 3) {
      ui.notifications.warn(localize("DDA.Warning.ClashPinLimitReached"));
      return null;
    }

    pinUses = setClashMapValue(pinUses, controller, used + 1);
    const nextState = recordClashAction({
      ...state,
      pinned: true,
      pinnedByUuid: controller.uuid,
      pinUses,
      controllerUuid: controller.uuid,
      controllerName: controller.name
    }, controller, action);

    await syncClashStateForPair(controller, opponent, nextState);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: controller }),
      content: renderClashCard({
        title: localize("DDA.Clash.Action.Primary.Pin"),
        lines: [
          formatI18n("DDA.Clash.ActionResult.Pin", { controller: escapeHtml(controller.name), opponent: escapeHtml(opponent.name), uses: getClashMapValue(pinUses, controller, 0) })
        ],
        controllerActor: controller,
        opponentActor: opponent,
        includeButtons: true
      })
    });

    return true;
  }

  if (action === "throw") {
    const sizeDifference = getSizeDifference(controller, opponent);
    if (sizeDifference <= -2 && !hasTitanPower(controller)) {
      ui.notifications.warn(localize("DDA.Warning.ClashThrowTargetTooLarge"));
      return null;
    }

    const distance = 3 + getCpuTotal(controller);
    await syncClashStateForPair(controller, opponent, recordClashAction(state, controller, action));
    await endDigimonClash(controller, { reason: "throw" });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: controller }),
      content: renderClashCard({
        title: localize("DDA.Clash.Action.Primary.Throw"),
        lines: [
          formatI18n("DDA.Clash.ActionResult.Throw", { controller: escapeHtml(controller.name), opponent: escapeHtml(opponent.name), distance })
        ],
        extraClass: "dda-clash-action-result-card"
      })
    });

    return true;
  }

  if (action === "attack") {
    return executeClashAttack(controller, opponent, state, action);
  }

  if (action === "move" || action === "finisher") {
    await syncClashStateForPair(controller, opponent, recordClashAction(state, controller, action));

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: controller }),
      content: renderClashCard({
        title: getActionLabel(action, "controller"),
        lines: [
          formatI18n(`DDA.Clash.ActionResult.${action}`, { controller: escapeHtml(controller.name), opponent: escapeHtml(opponent.name) })
        ],
        controllerActor: controller,
        opponentActor: opponent,
        includeButtons: action !== "finisher"
      })
    });

    if (action === "finisher") {
      await endDigimonClash(controller, { reason: "finisher" });
    }

    return true;
  }

  ui.notifications.warn(localize("DDA.Warning.ClashUnknownAction"));
  return null;
}

async function executeSecondaryClashAction(opponent, controller, state, action) {
  if (action === "comeback") {
    if (state.pinned) {
      ui.notifications.warn(localize("DDA.Warning.ClashComebackWhilePinned"));
      return null;
    }

    if (state.initiatorUuid === opponent.uuid && getActionCount(state, opponent.uuid) <= 0) {
      ui.notifications.warn(localize("DDA.Warning.ClashComebackNotFirstInitiatorAction"));
      return null;
    }

    let nextContestBonus = foundry.utils.deepClone(state.nextContestBonus ?? {});
    nextContestBonus = setClashMapValue(nextContestBonus, opponent, Number(getClashMapValue(nextContestBonus, opponent, 0)) + 3);

    const nextState = recordClashAction({
      ...state,
      nextContestBonus
    }, opponent, action);

    await syncClashStateForPair(opponent, controller, nextState);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: opponent }),
      content: renderClashCard({
        title: localize("DDA.Clash.Action.Secondary.Comeback"),
        lines: [
          formatI18n("DDA.Clash.ActionResult.Comeback", { opponent: escapeHtml(opponent.name) })
        ],
        controllerActor: controller,
        opponentActor: opponent,
        includeButtons: true
      })
    });

    return true;
  }

  if (action === "contestPin") {
    if (!state.pinned) {
      ui.notifications.warn(localize("DDA.Warning.ClashNotPinned"));
      return null;
    }

    const tn = 12 + getCpuTotal(controller);
    const statValue = getBestCpuOrRam(opponent);
    const result = await rollFixedCheck(opponent, statValue, tn, localize("DDA.Clash.Action.Secondary.ContestPin"));

    if (result.success) {
      let nextContestBonus = foundry.utils.deepClone(state.nextContestBonus ?? {});
      nextContestBonus = setClashMapValue(nextContestBonus, opponent, Number(getClashMapValue(nextContestBonus, opponent, 0)) + 2);
      const nextState = recordClashAction({
        ...state,
        pinned: false,
        pinnedByUuid: "",
        nextContestBonus
      }, opponent, action);

      await syncClashStateForPair(opponent, controller, nextState);
    }

    if (!result.success) {
      await syncClashStateForPair(opponent, controller, recordClashAction(state, opponent, action));
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: opponent }),
      content: renderClashCard({
        title: localize("DDA.Clash.Action.Secondary.ContestPin"),
        lines: [
          result.success
            ? formatI18n("DDA.Clash.ActionResult.ContestPinSuccess", { opponent: escapeHtml(opponent.name) })
            : formatI18n("DDA.Clash.ActionResult.ContestPinFailure", { opponent: escapeHtml(opponent.name) })
        ],
        controllerActor: controller,
        opponentActor: opponent,
        includeButtons: true
      })
    });

    return true;
  }

  if (action === "escape") {
    if (state.pinned) {
      ui.notifications.warn(localize("DDA.Warning.ClashEscapeWhilePinned"));
      return null;
    }

    const opponentBonus = getNextContestBonus(state, opponent.uuid);
    const controllerBonus = getNextContestBonus(state, controller.uuid);
    const opponentRoll = await rollClashCheck(opponent, controller, { bonus: opponentBonus });
    const controllerRoll = await rollClashCheck(controller, opponent, { bonus: controllerBonus });
    const winner = resolveController(opponent, controller, opponentRoll, controllerRoll);

    if (winner.uuid === opponent.uuid) {
      await syncClashStateForPair(opponent, controller, recordClashAction(state, opponent, action));
      await endDigimonClash(opponent, { reason: "escape" });
    } else {
      let nextContestBonus = foundry.utils.deepClone(state.nextContestBonus ?? {});
      nextContestBonus = setClashMapValue(nextContestBonus, opponent, 0);
      nextContestBonus = setClashMapValue(nextContestBonus, controller, 0);

      await syncClashStateForPair(opponent, controller, recordClashAction({
        ...state,
        nextContestBonus
      }, opponent, action));
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: opponent }),
      content: renderClashCard({
        title: localize("DDA.Clash.Action.Secondary.Escape"),
        lines: [
          formatI18n("DDA.Clash.RollSummaryDetailed", {
            initiator: escapeHtml(opponent.name),
            initiatorTotal: opponentRoll.total,
            opponent: escapeHtml(controller.name),
            opponentTotal: controllerRoll.total
          }),
          winner.uuid === opponent.uuid
            ? formatI18n("DDA.Clash.ActionResult.EscapeSuccess", { opponent: escapeHtml(opponent.name) })
            : formatI18n("DDA.Clash.ActionResult.EscapeFailure", { opponent: escapeHtml(opponent.name), controller: escapeHtml(controller.name) })
        ],
        controllerActor: winner.uuid === opponent.uuid ? null : controller,
        opponentActor: winner.uuid === opponent.uuid ? null : opponent,
        includeButtons: winner.uuid !== opponent.uuid
      })
    });

    return true;
  }

  if (action === "teleport") {
    if (!hasTeleport(opponent)) {
      ui.notifications.warn(localize("DDA.Warning.ClashTeleportUnavailable"));
      return null;
    }

    await syncClashStateForPair(opponent, controller, recordClashAction(state, opponent, action));
    await endDigimonClash(opponent, { reason: "teleport" });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: opponent }),
      content: renderClashCard({
        title: localize("DDA.Clash.Action.Secondary.Teleport"),
        lines: [
          formatI18n("DDA.Clash.ActionResult.Teleport", { opponent: escapeHtml(opponent.name) })
        ],
        extraClass: "dda-clash-action-result-card"
      })
    });

    return true;
  }

  if (action === "weakAttack") {
    return executeClashAttack(opponent, controller, state, action, { weakAttack: true });
  }

  ui.notifications.warn(localize("DDA.Warning.ClashUnknownAction"));
  return null;
}

export async function handleClashChatAction(event) {
  event.preventDefault();

  const button = event.currentTarget;
  const actor = await resolveActor(button?.dataset?.actorUuid);
  if (!actor) {
    ui.notifications.warn(localize("DDA.Warning.ActorNotFound"));
    return null;
  }

  const action = button?.dataset?.clashAction ?? "menu";
  if (action === "menu") return openDigimonClashActionMenu(actor);
  return executeClashAction(actor, action);
}
