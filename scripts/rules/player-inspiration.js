import {
  getTamerIpPool,
  spendTamerIp
} from "./tamer-resources.js";
import {
  isQualitySuppressedByBossState
} from "./quality-automation.js";

const SYSTEM_ID = "digimon-digital-adventures";
const SOCKET_CHANNEL = `system.${SYSTEM_ID}`;
const SOCKET_SCOPE = "player-inspiration";
const REQUEST_TIMEOUT_MS = 20000;
const pendingRequests = new Map();
let socketRegistered = false;

function isEnglish() {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en");
}

function text(pt, en) {
  return isEnglish() ? en : pt;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function integer(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function normalizeBossData(item) {
  const boss = item?.system?.boss;
  return item?.type === "quality" && boss && typeof boss === "object"
    ? boss
    : {};
}

export function getUnchangeableFateQuality(actor) {
  if (!actor) return null;
  return (actor.items ?? []).find((item) => Boolean(normalizeBossData(item).unchangeableFate)) ?? null;
}

export function hasEffectiveUnchangeableFate(actor) {
  const quality = getUnchangeableFateQuality(actor);
  return Boolean(quality && !isQualitySuppressedByBossState(actor, quality));
}

export function canPlayerInspirationAlterRoll(actor, { option = "standard" } = {}) {
  if (String(option ?? "").trim().toLowerCase() === "miracle") return true;
  return !hasEffectiveUnchangeableFate(actor);
}

function isHostileActor(actor) {
  if (!actor) return false;
  if (actor.type === "npc" && actor.system?.enemy?.isEnemy) return true;
  const disposition = Number(actor.token?.disposition ?? actor.prototypeToken?.disposition ?? 0);
  return disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE;
}

function getOwnedTamersForUser(user, { requireIp = true } = {}) {
  if (!user) return [];
  return (game.actors ?? [])
    .filter((actor) => actor?.type === "character")
    .filter((actor) => actor.testUserPermission?.(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
    .filter((actor) => !requireIp || getTamerIpPool(actor).total > 0)
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

async function getEligibleUsers(actor, opposingActorUuids = []) {
  const activePlayers = Array.from(game.users ?? [])
    .filter((user) => user?.active && !user.isGM);

  // Enemy rolls concern only their actual opponents in this roll. Never use
  // every connected player (or a client's currently selected targets) here.
  const participants = isHostileActor(actor)
    ? (await Promise.all([...new Set(Array.isArray(opposingActorUuids) ? opposingActorUuids : [])]
        .filter((uuid) => typeof uuid === "string" && uuid)
        .map(async (uuid) => {
          try { return await fromUuid(uuid); } catch (_error) { return null; }
        }))).filter((participant) => participant && !isHostileActor(participant))
    : [actor];

  return activePlayers
    .filter((user) => participants.some((participant) =>
      participant?.testUserPermission?.(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)))
    .filter((user) => getOwnedTamersForUser(user).length > 0)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function availableActionsForPhase(phase, maximumIp) {
  const actions = [];
  if (phase === "pool-pre") {
    if (maximumIp >= 4) {
      actions.push({ value: "actPlus", label: text("Ato de Inspiração: +5 dados (4 PI)", "Act of Inspiration: +5 dice (4 IP)") });
      actions.push({ value: "actMinus", label: text("Ato de Inspiração: -5 dados (4 PI)", "Act of Inspiration: -5 dice (4 IP)") });
    }
    return actions;
  }

  if (maximumIp >= 1) {
    actions.push({ value: "reroll", label: text("Rerrolar o Teste/Pool (1 PI)", "Reroll the Check/Pool (1 IP)") });
    actions.push({ value: "bonus", label: phase === "check-post"
      ? text("Bônus de Check: +1 no resultado por PI", "Check Bonus: +1 to the result per IP")
      : text("Bônus de Check: +1 dado por PI", "Check Bonus: +1 die per IP") });
  }

  if (phase === "check-post" && maximumIp >= 4) {
    actions.push({ value: "actPlus", label: text("Ato de Inspiração: +5 no resultado (4 PI)", "Act of Inspiration: +5 to the result (4 IP)") });
    actions.push({ value: "actMinus", label: text("Ato de Inspiração: -5 no resultado (4 PI)", "Act of Inspiration: -5 to the result (4 IP)") });
  }

  return actions;
}

async function promptBonusAmount(tamer, phase) {
  const maximum = getTamerIpPool(tamer).total;
  if (maximum <= 0) return 0;

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: text("Bônus de Inspiração", "Inspiration Bonus") },
    content: `
      <div class="dda-roll-dialog dda-inspiration-dialog">
        <p>${phase === "check-post"
          ? text("Quantos PI gastar? Cada PI adiciona +1 ao resultado do Check.", "How many IP? Each IP adds +1 to the Check result.")
          : text("Quantos PI gastar? Cada PI adiciona +1 dado à Pool.", "How many IP? Each IP adds +1 die to the Pool.")}</p>
        <div class="form-group">
          <label>${text("PI", "IP")}</label>
          <input type="number" name="amount" min="1" max="${maximum}" value="1" step="1" />
        </div>
      </div>`,
    ok: {
      label: text("Gastar PI", "Spend IP"),
      callback: (_event, button) => integer(button.form.elements.amount?.value, 0)
    },
    rejectClose: false,
    modal: true
  });

  return Math.min(maximum, integer(result, 0));
}

async function promptOneChoice({ phase, actorName = "", currentLabel = "" } = {}) {
  const user = game.user;
  const tamers = getOwnedTamersForUser(user);
  if (!tamers.length) return null;

  const maximumIp = Math.max(...tamers.map((tamer) => getTamerIpPool(tamer).total));
  const actions = availableActionsForPhase(phase, maximumIp);
  if (!actions.length) return null;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: text("Inspiração", "Inspiration") },
    content: `
      <div class="dda-roll-dialog dda-inspiration-dialog">
        <p><strong>${escapeHtml(actorName)}</strong>${currentLabel ? ` — ${escapeHtml(currentLabel)}` : ""}</p>
        <p class="hint">${text(
          "Você pode gastar PI para alterar esta rolagem. Escolha Passar para continuar sem gastar; após um gasto, você poderá usar outra opção enquanto ainda tiver PI.",
          "You may spend IP to alter this roll. Choose Pass to continue without spending; after a spend, you may use another option while you still have IP."
        )}</p>
        <div class="form-group">
          <label>${text("Digi-Escolhido", "Tamer")}</label>
          <select name="tamerUuid">
            ${tamers.map((tamer) => {
              const pool = getTamerIpPool(tamer);
              return `<option value="${escapeHtml(tamer.uuid)}">${escapeHtml(tamer.name)} — ${pool.total} IP</option>`;
            }).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>${text("Opção", "Option")}</label>
          <select name="action">
            ${actions.map((entry) => `<option value="${entry.value}">${escapeHtml(entry.label)}</option>`).join("")}
          </select>
        </div>
      </div>`,
    buttons: [
      {
        action: "apply",
        label: text("Usar Inspiração", "Use Inspiration"),
        default: true,
        callback: (_event, button) => ({
          tamerUuid: String(button.form.elements.tamerUuid?.value ?? ""),
          action: String(button.form.elements.action?.value ?? "")
        })
      },
      {
        action: "pass",
        label: text("Passar", "Pass"),
        callback: () => null
      }
    ],
    rejectClose: false,
    modal: true
  });

  return result ?? null;
}

async function resolveLocalInspirationOffer({ phase, actorUuid = "", opposingActorUuids = [], actorName = "", currentLabel = "" } = {}) {
  const choices = [];
  let actor = null;
  try { actor = await fromUuid(actorUuid); } catch (_error) { return choices; }
  if (!actor || !canPlayerInspirationAlterRoll(actor)) return choices;
  const eligibleUsers = await getEligibleUsers(actor, opposingActorUuids);
  if (!eligibleUsers.some((user) => user.id === game.user?.id)) return choices;

  while (true) {
    const chosen = await promptOneChoice({ phase, actorName, currentLabel });
    if (!chosen?.tamerUuid || !chosen?.action) break;

    let tamer = null;
    try { tamer = await fromUuid(chosen.tamerUuid); } catch (_error) { tamer = null; }
    if (!tamer || tamer.type !== "character" || !tamer.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
      ui.notifications.warn(text("Digi-Escolhido inválido para Inspiração.", "Invalid Tamer for Inspiration."));
      continue;
    }

    const pool = getTamerIpPool(tamer);
    let amount = 0;
    let cost = 0;

    if (chosen.action === "reroll") {
      amount = 1;
      cost = 1;
    } else if (chosen.action === "bonus") {
      amount = await promptBonusAmount(tamer, phase);
      cost = amount;
      if (amount <= 0) continue;
    } else if (chosen.action === "actPlus" || chosen.action === "actMinus") {
      amount = 5;
      cost = 4;
    }

    if (cost <= 0 || pool.total < cost) {
      ui.notifications.warn(text("PI insuficiente para essa opção.", "Not enough IP for that option."));
      continue;
    }

    const spent = await spendTamerIp(tamer, cost, { allowTemporary: true, temporaryFirst: true });
    if (!spent?.success) {
      ui.notifications.warn(text("Não foi possível gastar os PI.", "Could not spend the IP."));
      continue;
    }

    choices.push({
      action: chosen.action,
      amount,
      cost,
      tamerUuid: tamer.uuid,
      tamerName: tamer.name,
      userId: game.user.id
    });
  }

  return choices;
}

function requestRemoteUser(user, payload = {}) {
  if (!user?.active || !game.socket) return Promise.resolve([]);
  if (user.id === game.user?.id) return resolveLocalInspirationOffer(payload);

  const requestId = foundry.utils.randomID();

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve([]);
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(requestId, { resolve, timeoutId });

    game.socket.emit(SOCKET_CHANNEL, {
      scope: SOCKET_SCOPE,
      type: "offer",
      requestId,
      requestingUserId: game.user.id,
      targetUserId: user.id,
      payload
    });
  });
}

async function collectChoices(actor, phase, currentLabel = "", opposingActorUuids = []) {
  if (!actor) return { blocked: false, choices: [] };

  if (!canPlayerInspirationAlterRoll(actor, { option: "standard" })) {
    return { blocked: true, choices: [] };
  }

  const users = await getEligibleUsers(actor, opposingActorUuids);
  if (!users.length) return { blocked: false, choices: [] };

  const results = await Promise.all(
    users.map(async (user) => ({
      userId: user.id,
      choices: await requestRemoteUser(user, {
        phase,
        actorName: actor.name ?? "Actor",
        actorUuid: actor.uuid ?? "",
        opposingActorUuids,
        currentLabel
      })
    }))
  );

  results.sort((a, b) => String(a.userId).localeCompare(String(b.userId)));

  return {
    blocked: false,
    choices: results.flatMap((entry) => Array.isArray(entry.choices) ? entry.choices : [])
  };
}

export async function preparePoolPlayerInspiration(actor, { diceCount = 0, miracleUsed = false, opposingActorUuids = [] } = {}) {
  const originalDiceCount = integer(diceCount, 0);
  const collected = await collectChoices(actor, "pool-pre", `${originalDiceCount}d6`, opposingActorUuids);

  let finalDiceCount = originalDiceCount;
  const applied = [];

  for (const choice of collected.choices) {
    if (choice.action === "actPlus") {
      finalDiceCount += 5;
      applied.push({ ...choice, diceDelta: 5 });
    } else if (choice.action === "actMinus") {
      const before = finalDiceCount;
      finalDiceCount = Math.max(0, finalDiceCount - 5);
      applied.push({ ...choice, diceDelta: finalDiceCount - before });
    }
  }

  return {
    blocked: collected.blocked,
    miracleUsed: Boolean(miracleUsed),
    originalDiceCount,
    diceCount: finalDiceCount,
    choices: applied
  };
}

export async function applyCheckPlayerInspiration(actor, {
  roll = null,
  formula = "",
  data = {},
  currentLabel = "",
  opposingActorUuids = []
} = {}) {
  const collected = await collectChoices(actor, "check-post", currentLabel || String(roll?.total ?? ""), opposingActorUuids);
  let currentRoll = roll;
  let totalAdjustment = 0;
  let inspirationRerolled = false;
  const applied = [];

  for (const choice of collected.choices) {
    if (choice.action === "reroll") {
      if (!formula) continue;
      currentRoll = await new Roll(formula, data).evaluate();
      inspirationRerolled = true;
      applied.push({ ...choice, result: Number(currentRoll.total ?? 0) });
      continue;
    }

    if (choice.action === "bonus") {
      totalAdjustment += integer(choice.amount, 0);
      applied.push({ ...choice, resultDelta: integer(choice.amount, 0) });
      continue;
    }

    if (choice.action === "actPlus") {
      totalAdjustment += 5;
      applied.push({ ...choice, resultDelta: 5 });
      continue;
    }

    if (choice.action === "actMinus") {
      totalAdjustment -= 5;
      applied.push({ ...choice, resultDelta: -5 });
    }
  }

  if (currentRoll && totalAdjustment !== 0) {
    currentRoll._total = Number(currentRoll.total ?? 0) + totalAdjustment;
  }

  return {
    blocked: collected.blocked,
    roll: currentRoll,
    totalAdjustment,
    rerolled: inspirationRerolled,
    choices: applied
  };
}

export async function applyPoolPlayerInspiration(actor, {
  roll = null,
  diceCount = 0,
  currentLabel = "",
  opposingActorUuids = []
} = {}) {
  const collected = await collectChoices(actor, "pool-post", currentLabel || `${integer(diceCount, 0)}d6`, opposingActorUuids);
  let currentRoll = roll;
  let currentDiceCount = integer(diceCount, 0);
  let diceResults = (currentRoll?.dice?.[0]?.results ?? []).map((result) => ({
    result: Number(result.result ?? 0),
    active: result.active !== false
  }));
  let inspirationRerolled = false;
  let bonusRolls = [];
  const applied = [];

  for (const choice of collected.choices) {
    if (choice.action === "reroll") {
      currentRoll = currentDiceCount > 0
        ? await new Roll(`${currentDiceCount}d6`).evaluate()
        : null;
      diceResults = (currentRoll?.dice?.[0]?.results ?? []).map((result) => ({
        result: Number(result.result ?? 0),
        active: result.active !== false
      }));
      bonusRolls = [];
      inspirationRerolled = true;
      applied.push({ ...choice, diceCount: currentDiceCount });
      continue;
    }

    if (choice.action === "bonus") {
      const amount = integer(choice.amount, 0);
      if (amount <= 0) continue;
      const bonusRoll = await new Roll(`${amount}d6`).evaluate();
      const bonusResults = (bonusRoll.dice?.[0]?.results ?? []).map((result) => ({
        result: Number(result.result ?? 0),
        active: result.active !== false,
        inspirationBonus: true
      }));
      diceResults.push(...bonusResults);
      currentDiceCount += amount;
      bonusRolls.push(bonusRoll);
      applied.push({ ...choice, diceAdded: amount, diceValues: bonusResults.map((entry) => entry.result) });
    }
  }

  return {
    blocked: collected.blocked,
    roll: currentRoll,
    diceCount: currentDiceCount,
    diceResults,
    bonusRolls,
    rerolled: inspirationRerolled,
    choices: applied
  };
}

export function buildPlayerInspirationNote(result = {}, { kind = "check" } = {}) {
  const isPool = kind === "pool";
  const wrapper = (inner, className = "dda-player-inspiration-result") => isPool
    ? `<li class="${className}">${inner}</li>`
    : `<section class="${className}">${inner}</section>`;

  if (result?.blocked) {
    return wrapper(
      `<strong>${text("Destino Imutável", "Unchangeable Fate")}:</strong> ${text(
        "as opções normais de Inspiração dos Jogadores não podem alterar esta rolagem. Miracle continua permitido.",
        "normal Player Inspiration options cannot alter this roll. Miracle remains allowed."
      )}`,
      "dda-player-inspiration-result dda-unchangeable-fate-result"
    );
  }

  const choices = Array.isArray(result?.choices) ? result.choices : [];
  if (!choices.length) return "";

  const ip = text("PI", "IP");
  const lines = choices.map((choice) => {
    const who = escapeHtml(choice.tamerName ?? "Tamer");
    if (choice.action === "reroll") {
      return `<li><strong>${who}</strong>: ${text("rerrolagem por Inspiração", "Inspiration reroll")} (1 ${ip}).</li>`;
    }
    if (choice.action === "bonus") {
      return `<li><strong>${who}</strong>: ${kind === "check"
        ? text(`+${choice.amount} no resultado`, `+${choice.amount} to the result`)
        : text(`+${choice.amount} dado(s)`, `+${choice.amount} die/dice`)} (${choice.cost} ${ip}).</li>`;
    }
    const sign = choice.action === "actMinus" ? "-" : "+";
    return `<li><strong>${who}</strong>: ${text("Ato de Inspiração", "Act of Inspiration")} ${sign}5 (${choice.cost} ${ip}).</li>`;
  }).join("");

  return wrapper(
    `<strong>${text("Inspiração", "Inspiration")}</strong><ul>${lines}</ul>`
  );
}

export function registerPlayerInspirationSocket() {
  if (socketRegistered || !game.socket) return;
  socketRegistered = true;

  game.socket.on(SOCKET_CHANNEL, async (message = {}) => {
    if (message?.scope !== SOCKET_SCOPE) return;

    if (message.type === "response") {
      if (message.targetUserId && message.targetUserId !== game.user?.id) return;
      const pending = pendingRequests.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timeoutId);
      pendingRequests.delete(message.requestId);
      pending.resolve(Array.isArray(message.choices) ? message.choices : []);
      return;
    }

    if (message.type !== "offer" || message.targetUserId !== game.user?.id) return;

    const choices = await resolveLocalInspirationOffer(message.payload ?? {});
    game.socket.emit(SOCKET_CHANNEL, {
      scope: SOCKET_SCOPE,
      type: "response",
      requestId: message.requestId,
      targetUserId: message.requestingUserId,
      responderUserId: game.user.id,
      choices
    });
  });
}
