const DDA_ACTION_TRACKER_NAME = "dda-token-action-tracker";
const DDA_SUPPORTED_TYPES = new Set(["character", "digimon", "npc"]);
const DDA_SYSTEM_ID = "digimon-digital-adventures";
const DDA_TRACKER_BASE_PATH = `systems/${DDA_SYSTEM_ID}/assets/ui`;

function num(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function currentCombat() {
  return game.combat ?? null;
}

function isCombatActive() {
  const combat = currentCombat();
  return Boolean(combat?.started || (combat?.combatants?.size ?? 0) > 0);
}

function getCombatantForToken(token) {
  const combat = currentCombat();
  if (!combat || !token?.document) return null;

  const tokenId = String(token.document.id ?? "");
  const sceneId = String(token.document.parent?.id ?? canvas?.scene?.id ?? "");

  return combat.combatants.find((combatant) => {
    const combatantTokenId = String(combatant.tokenId ?? combatant.token?.id ?? "");
    const combatantSceneId = String(combatant.sceneId ?? combatant.token?.parent?.id ?? sceneId);
    return combatantTokenId === tokenId && combatantSceneId === sceneId;
  }) ?? null;
}

function isEnemyToken(token, actor = token?.actor) {
  const combatant = getCombatantForToken(token);
  const initiativeSide = String(
    combatant?.getFlag?.(DDA_SYSTEM_ID, "initiative.side") ?? ""
  ).toLowerCase();

  if (initiativeSide === "enemies" || initiativeSide === "enemy") return true;
  if (initiativeSide === "players" || initiativeSide === "allies" || initiativeSide === "ally") return false;

  const disposition = Number(
    token?.document?.disposition ??
    token?.document?.toObject?.()?.disposition ??
    actor?.prototypeToken?.disposition ??
    0
  );

  const friendlyDisposition =
    disposition === CONST.TOKEN_DISPOSITIONS?.FRIENDLY || disposition > 0;

  const hostileDisposition =
    disposition === CONST.TOKEN_DISPOSITIONS?.HOSTILE || disposition < 0;

  if (friendlyDisposition) return false;
  if (hostileDisposition) return true;

  return Boolean(
    actor?.system?.enemy?.isEnemy ||
    actor?.getFlag?.(DDA_SYSTEM_ID, "enemyNpc")?.isEnemy ||
    token?.document?.getFlag?.(DDA_SYSTEM_ID, "enemyNpc")?.isEnemy
  );
}

function getActorActions(actor) {
  if (!actor || !DDA_SUPPORTED_TYPES.has(actor.type)) return null;

  const actions = actor.system?.combat?.actions;
  if (!actions) return null;

  const value = Math.max(0, Math.floor(num(actions.value, 0)));
  const max = Math.max(0, Math.floor(num(actions.max, 0)));

  if (value <= 0 && max <= 0) return null;

  return { value, max };
}

function resolveTrackerAssetName(token) {
  const actor = token?.actor;
  const actions = getActorActions(actor);

  if (!actions) return null;
  if (!isCombatActive()) return null;
  if (!getCombatantForToken(token)) return null;

  const enemy = isEnemyToken(token, actor);
  const value = clamp(actions.value, 0, 4);

  if (value <= 0) return "vazio";
  return `${value}-2${enemy ? "-inimigo" : ""}`;
}

function resolveTrackerAssetPath(token) {
  const assetName = resolveTrackerAssetName(token);
  return assetName ? `${DDA_TRACKER_BASE_PATH}/${assetName}.webp` : null;
}

function clearActionTracker(token) {
  if (!token) return;

  token._ddaActionTracker?.destroy({ children: true });
  token._ddaActionTracker = null;
  token._ddaActionTrackerKey = null;

  token.children
    ?.filter?.((child) => child?.name === DDA_ACTION_TRACKER_NAME)
    ?.forEach?.((child) => child.destroy({ children: true }));
}

function ensureActionTracker(token, assetPath) {
  const width = Math.max(1, num(token?.w, num(token?.document?.width, 1) * num(canvas.grid?.size, 100)));
  const height = Math.max(1, num(token?.h, num(token?.document?.height, 1) * num(canvas.grid?.size, 100)));
  const side = Math.max(width, height);
  const diameter = Math.round(Math.max(side * 1.46, side + 90));
  const trackerKey = `${assetPath}|${width}x${height}|${diameter}`;

  if (token._ddaActionTracker && token._ddaActionTrackerKey === trackerKey) {
    token._ddaActionTracker.visible = true;
    return token._ddaActionTracker;
  }

  clearActionTracker(token);

  const container = new PIXI.Container();
  container.name = DDA_ACTION_TRACKER_NAME;
  container.eventMode = "none";
  container.interactive = false;
  if (token.sortableChildren !== true) token.sortableChildren = true;
  container.zIndex = 10005;
  container.position.set(0, 0);
  container.sortableChildren = false;

  const sprite = PIXI.Sprite.from(assetPath);
  sprite.anchor.set(0.5, 0.5);
  sprite.position.set(width / 2, height / 2);
  sprite.width = diameter;
  sprite.height = diameter;
  sprite.alpha = 0.98;
  sprite.eventMode = "none";
  sprite.interactive = false;

  container.addChild(sprite);
  token.addChild(container);
  token.sortChildren?.();

  token._ddaActionTracker = container;
  token._ddaActionTrackerKey = trackerKey;
  return container;
}

function drawActionTracker(token) {
  if (!canvas?.ready || !token) return;

  const assetPath = resolveTrackerAssetPath(token);
  if (!assetPath) {
    clearActionTracker(token);
    return;
  }

  ensureActionTracker(token, assetPath);
}

function refreshActionTracker(token) {
  if (!token) return;
  window.requestAnimationFrame(() => drawActionTracker(token));
}

function refreshActionTrackerForDocument(document) {
  const token = document?.object ?? canvas?.tokens?.get?.(document?.id) ?? null;
  refreshActionTracker(token);
}

function refreshActionTrackerForActor(actor) {
  if (!canvas?.ready || !actor) return;

  for (const token of canvas.tokens?.placeables ?? []) {
    if (token?.actor?.uuid === actor.uuid) {
      refreshActionTracker(token);
    }
  }
}

function refreshAllActionTrackers() {
  if (!canvas?.ready) return;
  window.requestAnimationFrame(() => {
    for (const token of canvas.tokens?.placeables ?? []) {
      drawActionTracker(token);
    }
  });
}

function clearAllActionTrackers() {
  for (const token of canvas?.tokens?.placeables ?? []) {
    clearActionTracker(token);
  }
}

export function registerDdaTokenActionTracker() {
  Hooks.on("drawToken", (token) => refreshActionTracker(token));
  Hooks.on("refreshToken", (token) => refreshActionTracker(token));
  Hooks.on("createToken", (document) => refreshActionTrackerForDocument(document));
  Hooks.on("updateToken", (document) => refreshActionTrackerForDocument(document));
  Hooks.on("deleteToken", (document) => {
    clearActionTracker(document?.object ?? canvas?.tokens?.get?.(document?.id) ?? null);
  });

  Hooks.on("updateActor", (actor) => refreshActionTrackerForActor(actor));

  Hooks.on("canvasReady", () => refreshAllActionTrackers());
  Hooks.on("createCombat", () => refreshAllActionTrackers());
  Hooks.on("updateCombat", () => refreshAllActionTrackers());
  Hooks.on("deleteCombat", () => refreshAllActionTrackers());
  Hooks.on("createCombatant", () => refreshAllActionTrackers());
  Hooks.on("updateCombatant", () => refreshAllActionTrackers());
  Hooks.on("deleteCombatant", () => refreshAllActionTrackers());

  game.dda ??= {};
  game.dda.tokenActionTracker = {
    refreshAll: refreshAllActionTrackers,
    clearAll: clearAllActionTrackers,
    refreshToken: refreshActionTracker,
    refreshActor: refreshActionTrackerForActor
  };

  console.log("DDA | Token action tracker registered.");
}
