const TARGET_ARROW_Z_INDEX = 10080;
const TARGET_PIP_Z_INDEX = 10081;
const RUNTIME_KEY = "__ddaTargetVisibilityV8";

function promoteTargetIndicators(token) {
  if (!canvas?.ready || !token) return;
  if (token.sortableChildren !== true) token.sortableChildren = true;

  const arrows = token.targetArrows;
  if (arrows) {
    arrows.zIndex = TARGET_ARROW_Z_INDEX;
    arrows.alpha = 1;
    arrows.visible = true;
  }

  const pips = token.targetPips;
  if (pips) {
    pips.zIndex = TARGET_PIP_Z_INDEX;
    pips.alpha = 1;
  }

  token.sortChildren?.();
}

function promoteAllTargets() {
  if (!canvas?.ready) return;
  requestAnimationFrame(() => {
    for (const token of canvas?.tokens?.placeables ?? []) promoteTargetIndicators(token);
  });
}

function register() {
  if (globalThis[RUNTIME_KEY]) return;
  globalThis[RUNTIME_KEY] = true;

  Hooks.on("drawToken", promoteTargetIndicators);
  Hooks.on("refreshToken", promoteTargetIndicators);
  Hooks.on("targetToken", (_user, token) => {
    promoteTargetIndicators(token);
    requestAnimationFrame(() => promoteTargetIndicators(token));
  });
  Hooks.on("canvasReady", promoteAllTargets);
  Hooks.on("createCombatant", promoteAllTargets);
  Hooks.on("updateCombatant", promoteAllTargets);

  Hooks.once("ready", () => {
    game.dda ??= {};
    game.dda.targetVisibilityV8 = {
      refreshToken: promoteTargetIndicators,
      refreshAll: promoteAllTargets,
      targetArrowZIndex: TARGET_ARROW_Z_INDEX,
      targetPipZIndex: TARGET_PIP_Z_INDEX
    };
    promoteAllTargets();
  });
}

register();
