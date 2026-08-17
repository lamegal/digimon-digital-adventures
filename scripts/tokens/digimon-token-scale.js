const MODULE_ID = "digimon-digital-adventures";

const DIGIMON_SIZE_ORDER = [
  "small",
  "medium",
  "large",
  "huge",
  "gigantic",
  "colossal"
];

const DIGIMON_TOKEN_SCALE_BY_HUMAN_SCALING = {
  // Humans are Small: Digimon feel larger and more kaiju-like.
  small: {
    small: 1,
    medium: 1,
    large: 2,
    huge: 3,
    gigantic: 4,
    colossal: 6
  },

  // Official DDA space table: Small/Medium/Large 1x1, Huge 2x2,
  // Gigantic 3x3, Colossal 4x4+.
  medium: {
    small: 1,
    medium: 1,
    large: 1,
    huge: 2,
    gigantic: 3,
    colossal: 4
  },

  // Humans are Large: partner/mascot scale.
  large: {
    small: 0.5,
    medium: 0.5,
    large: 1,
    huge: 2,
    gigantic: 3,
    colossal: 4
  }
};

function isDigimonLikeActor(actor) {
  return Boolean(
    actor &&
    (
      actor.type === "digimon" ||
      (
        actor.type === "npc" &&
        actor.system?.isDigimon
      )
    )
  );
}

function getDigimonTokenGridSizeOverride(actor) {
  const override = Number(
    actor?.flags?.[MODULE_ID]?.tokenGridSizeOverride ?? 0
  );

  if (
    !Number.isFinite(override) ||
    override <= 0
  ) {
    return null;
  }

  return Math.max(
    0.5,
    Math.round(override * 2) / 2
  );
}

export function getDigimonTokenScaleForSize(
  sizeKey = "medium",
  humanScaling = null
) {
  const scaling =
    humanScaling ??
    game.settings.get(MODULE_ID, "humanScaling") ??
    "medium";

  const size = String(
    sizeKey ?? "medium"
  ).trim() || "medium";

  return (
    DIGIMON_TOKEN_SCALE_BY_HUMAN_SCALING
      [scaling]?.[size] ??
    1
  );
}

function localize(key) {
  return game.i18n.localize(key);
}

function formatI18n(key, data = {}) {
  return game.i18n.format(key, data);
}

function getStageMaxSize(stageKey) {
  return CONFIG.DDA?.stages?.[stageKey]?.maxSize ?? "colossal";
}

function isSizeAllowedForStage(sizeKey, stageKey) {
  const maxSize = getStageMaxSize(stageKey);
  const sizeIndex = DIGIMON_SIZE_ORDER.indexOf(sizeKey);
  const maxIndex = DIGIMON_SIZE_ORDER.indexOf(maxSize);

  if (sizeIndex < 0 || maxIndex < 0) return true;

  return sizeIndex <= maxIndex;
}

function getClampedSizeForStage(sizeKey, stageKey) {
  if (isSizeAllowedForStage(sizeKey, stageKey)) return sizeKey;
  return getStageMaxSize(stageKey);
}

export function getDigimonTokenScale(
  actor,
  humanScaling = null
) {
  if (!isDigimonLikeActor(actor)) return 1;

  const override =
    getDigimonTokenGridSizeOverride(actor);

  /*
   * Uma ocupação escolhida manualmente no wizard
   * tem prioridade sobre a escala automática.
   */
  if (override !== null) {
    return override;
  }

  return getDigimonTokenScaleForSize(
    actor.system?.size ?? "medium",
    humanScaling
  );
}

export async function applyDigimonTokenScaleToActor(actor, humanScaling = null) {
  if (!isDigimonLikeActor(actor)) return false;

  const tokenSize = getDigimonTokenScale(actor, humanScaling);

  await actor.update({
    "prototypeToken.width": tokenSize,
    "prototypeToken.height": tokenSize
  });

  return true;
}

export async function applyDigimonTokenScaleToActorAndPlacedTokens(actor, humanScaling = null) {
  if (!isDigimonLikeActor(actor)) return false;

  const scaling =
    humanScaling ??
    game.settings.get(MODULE_ID, "humanScaling") ??
    "medium";

  const tokenSize = getDigimonTokenScale(actor, scaling);

  await actor.update({
    "prototypeToken.width": tokenSize,
    "prototypeToken.height": tokenSize
  });

  let updatedSceneTokens = 0;

  for (const scene of game.scenes) {
    const updates = [];

    for (const token of scene.tokens) {
      const tokenActor = token.actor;

      if (!isDigimonLikeActor(tokenActor)) continue;

      const isSameActor =
        token.actorId === actor.id ||
        tokenActor.id === actor.id;

      if (!isSameActor) continue;

      updates.push({
        _id: token.id,
        width: tokenSize,
        height: tokenSize
      });
    }

    if (updates.length > 0) {
      await scene.updateEmbeddedDocuments("Token", updates);
      updatedSceneTokens += updates.length;
    }
  }

  return {
    actor: true,
    tokens: updatedSceneTokens
  };
}

function getPlacedTokensForActor(actor) {
  if (!actor) return [];

  const activeScene = canvas?.scene;
  if (!activeScene) return [];

  return canvas.tokens?.placeables?.filter((token) => {
    return token?.document?.actorId === actor.id ||
      token?.actor?.id === actor.id ||
      token?.actor?.uuid === actor.uuid;
  }) ?? [];
}

function sleep(ms = 0) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function updateActiveSceneTokenAlpha(tokens = [], alphaByTokenId = new Map()) {
  const scene = canvas?.scene;
  if (!scene || !tokens.length) return;

  const updates = tokens
    .map((token) => {
      const alpha = alphaByTokenId.get(token.document.id);
      if (alpha === null || alpha === undefined) return null;

      return {
        _id: token.document.id,
        alpha
      };
    })
    .filter(Boolean);

  if (!updates.length) return;

  await scene.updateEmbeddedDocuments("Token", updates);
}

function buildAlphaMap(tokens = [], multiplier = 1) {
  const result = new Map();

  for (const token of tokens) {
    const original = Number(token.document?.alpha ?? 1);
    result.set(token.document.id, Math.clamp(original * multiplier, 0.08, 1));
  }

  return result;
}

function buildOriginalAlphaMap(tokens = []) {
  const result = new Map();

  for (const token of tokens) {
    result.set(token.document.id, Number(token.document?.alpha ?? 1));
  }

  return result;
}

function getActorTokenTextureSource(actor, preferredTextureSrc = "") {
  const preferredImg = String(preferredTextureSrc || "").trim();
  const evolutionTokenImg = String(actor?.system?.evolution?.tokenImg || "").trim();
  const prototypeImg = String(actor?.prototypeToken?.texture?.src || "").trim();
  const actorImg = String(actor?.img || "").trim();
  const portraitImg = String(actor?.flags?.[MODULE_ID]?.digivicePortrait || actor?.system?.evolution?.portraitImg || "").trim();

  const candidates = [
    preferredImg,
    evolutionTokenImg,
    prototypeImg,
    actorImg,
    portraitImg
  ];

  const src = candidates.find((entry) => {
    return entry && entry !== "icons/svg/mystery-man.svg";
  });

  return src || "icons/svg/mystery-man.svg";
}

function tokenDocumentBelongsToActor(tokenDocument, actor) {
  if (!tokenDocument || !actor) return false;

  const tokenActor = tokenDocument.actor;

  return tokenDocument.actorId === actor.id ||
    tokenActor?.id === actor.id ||
    tokenActor?.uuid === actor.uuid;
}

function getTokenRuntimeId(token) {
  return token?.document?.id || token?.id || "";
}

function getTokenVisualObject(token) {
  return token?.mesh || token?.icon || token?.object?.mesh || null;
}

function captureTokenVisualState(tokens = []) {
  const state = new Map();

  for (const token of tokens) {
    const id = getTokenRuntimeId(token);
    const visual = getTokenVisualObject(token);
    if (!id || !visual) continue;

    state.set(id, {
      alpha: Number(visual.alpha ?? 1),
      scaleX: Number(visual.scale?.x ?? 1),
      scaleY: Number(visual.scale?.y ?? 1)
    });
  }

  return state;
}

function restoreTokenVisualState(tokens = [], state = new Map()) {
  for (const token of tokens) {
    const id = getTokenRuntimeId(token);
    const visual = getTokenVisualObject(token);
    const saved = state.get(id);

    if (!visual || !saved) continue;

    visual.alpha = saved.alpha;

    if (visual.scale?.set) {
      visual.scale.set(saved.scaleX, saved.scaleY);
    }
  }
}

function getEffectLayer() {
  return canvas?.effects || canvas?.tokens || canvas?.stage || null;
}

function makeBlurFilter(strength = 12) {
  if (!globalThis.PIXI) return null;
  if (PIXI.BlurFilter) return new PIXI.BlurFilter(strength);
  if (PIXI.filters?.BlurFilter) return new PIXI.filters.BlurFilter(strength);
  return null;
}

function createDigivolutionEffect(token) {
  if (!globalThis.PIXI || !token?.center) return null;

  const layer = getEffectLayer();
  if (!layer?.addChild) return null;

  const radius = Math.max(Number(token.w ?? 100), Number(token.h ?? 100)) * 0.58;

  const aura = new PIXI.Container();
  aura.eventMode = "none";
  aura.interactive = false;
  aura.zIndex = 9999;
  aura.position.set(token.center.x, token.center.y);
  aura.alpha = 0;

  const glow = new PIXI.Graphics();
  glow.beginFill(0x7cf7ff, 0.28);
  glow.drawCircle(0, 0, radius * 1.32);
  glow.endFill();
  glow.blendMode = PIXI.BLEND_MODES.ADD;

  const glowBlur = makeBlurFilter(18);
  if (glowBlur) glow.filters = [glowBlur];

  const ringOuter = new PIXI.Graphics();
  ringOuter.lineStyle(4, 0xffffff, 0.95);
  ringOuter.drawCircle(0, 0, radius);
  ringOuter.blendMode = PIXI.BLEND_MODES.ADD;

  const ringInner = new PIXI.Graphics();
  ringInner.lineStyle(2, 0x74ecff, 0.95);
  ringInner.drawCircle(0, 0, radius * 0.72);
  ringInner.blendMode = PIXI.BLEND_MODES.ADD;

  const flash = new PIXI.Graphics();
  flash.beginFill(0xffffff, 0.88);
  flash.drawRoundedRect(
    -radius * 0.82,
    -radius * 1.22,
    radius * 1.64,
    radius * 2.44,
    radius * 0.18
  );
  flash.endFill();
  flash.blendMode = PIXI.BLEND_MODES.ADD;
  flash.alpha = 0;

  const flashBlur = makeBlurFilter(16);
  if (flashBlur) flash.filters = [flashBlur];

  aura.addChild(glow, flash, ringOuter, ringInner);
  layer.addChild(aura);

  return {
    aura,
    glow,
    flash,
    ringOuter,
    ringInner
  };
}

function destroyDigivolutionEffect(effect) {
  if (!effect?.aura) return;
  effect.aura.destroy({ children: true });
}

function applyDigivolutionStep(tokens = [], effects = new Map(), originalState = new Map(), step = {}) {
  const {
    tokenAlpha = 1,
    tokenScale = 1,
    tokenFlip = 1,
    auraAlpha = 0,
    auraScale = 1,
    flashAlpha = 0,
    ringRotation = 0.22
  } = step;

  for (const token of tokens) {
    const id = getTokenRuntimeId(token);
    const visual = getTokenVisualObject(token);
    const saved = originalState.get(id);

    if (visual) {
      const baseScaleX = Number(saved?.scaleX ?? visual.scale?.x ?? 1) || 1;
      const baseScaleY = Number(saved?.scaleY ?? visual.scale?.y ?? 1) || 1;

      visual.alpha = tokenAlpha;

      if (visual.scale?.set) {
        visual.scale.set(
          baseScaleX * tokenScale * tokenFlip,
          baseScaleY * tokenScale
        );
      }
    }

    const effect = effects.get(id);
    if (!effect) continue;

    effect.aura.position.set(token.center.x, token.center.y);
    effect.aura.alpha = auraAlpha;
    effect.aura.scale.set(auraScale);

    effect.flash.alpha = flashAlpha;
    effect.glow.alpha = Math.min(1, auraAlpha * 0.95);

    effect.ringOuter.rotation += ringRotation;
    effect.ringInner.rotation -= ringRotation * 1.35;
  }
}

export async function applyDigimonTokenAppearanceToActorAndPlacedTokens(actor, options = {}) {
  if (!isDigimonLikeActor(actor)) return false;

  const scaling =
    options.humanScaling ??
    game.settings.get(MODULE_ID, "humanScaling") ??
    "medium";

  const tokenSize = getDigimonTokenScale(actor, scaling);
  const textureSrc = getActorTokenTextureSource(actor, options.textureSrc);

  const actorUpdates = {
    "prototypeToken.width": tokenSize,
    "prototypeToken.height": tokenSize
  };

  if (textureSrc) {
    actorUpdates["prototypeToken.texture.src"] = textureSrc;
  }

  await actor.update(actorUpdates);

  let updatedSceneTokens = 0;

  for (const scene of game.scenes) {
    const updates = [];

    for (const token of scene.tokens) {
      if (!tokenDocumentBelongsToActor(token, actor)) continue;

      updates.push({
        _id: token.id,
        width: tokenSize,
        height: tokenSize,
        ...(textureSrc ? { "texture.src": textureSrc } : {})
      });
    }

    if (updates.length > 0) {
      await scene.updateEmbeddedDocuments("Token", updates);
      updatedSceneTokens += updates.length;
    }
  }

  for (const token of canvas?.tokens?.placeables ?? []) {
    if (!tokenDocumentBelongsToActor(token.document, actor)) continue;
    token.refresh?.();
  }

  return {
    actor: true,
    tokens: updatedSceneTokens,
    textureSrc,
    tokenSize
  };
}

export async function runDigimonTokenEvolutionTransition(actor, changeCallback, options = {}) {
  if (!actor || actor.type !== "digimon") {
    if (typeof changeCallback === "function") return changeCallback();
    return null;
  }

  let tokens = getPlacedTokensForActor(actor);
  const originalState = captureTokenVisualState(tokens);
  const effects = new Map();

  for (const token of tokens) {
    const id = getTokenRuntimeId(token);
    const effect = createDigivolutionEffect(token);
    if (id && effect) effects.set(id, effect);
  }

  let result = null;

  try {
    if (tokens.length) {
      applyDigivolutionStep(tokens, effects, originalState, {
        tokenAlpha: 0.92,
        tokenScale: 1.00,
        tokenFlip: 1,
        auraAlpha: 0.10,
        auraScale: 0.92,
        flashAlpha: 0.02,
        ringRotation: 0.10
      });
      await sleep(45);

      applyDigivolutionStep(tokens, effects, originalState, {
        tokenAlpha: 0.80,
        tokenScale: 1.04,
        tokenFlip: -1,
        auraAlpha: 0.24,
        auraScale: 1.00,
        flashAlpha: 0.08,
        ringRotation: 0.22
      });
      await sleep(55);

      applyDigivolutionStep(tokens, effects, originalState, {
        tokenAlpha: 0.66,
        tokenScale: 1.07,
        tokenFlip: 1,
        auraAlpha: 0.42,
        auraScale: 1.08,
        flashAlpha: 0.16,
        ringRotation: 0.34
      });
      await sleep(55);

      applyDigivolutionStep(tokens, effects, originalState, {
        tokenAlpha: 0.46,
        tokenScale: 1.10,
        tokenFlip: -1,
        auraAlpha: 0.66,
        auraScale: 1.18,
        flashAlpha: 0.32,
        ringRotation: 0.48
      });
      await sleep(65);

      applyDigivolutionStep(tokens, effects, originalState, {
        tokenAlpha: 0.16,
        tokenScale: 1.16,
        tokenFlip: 1,
        auraAlpha: 0.95,
        auraScale: 1.35,
        flashAlpha: 0.82,
        ringRotation: 0.70
      });
      await sleep(80);
    }

    if (typeof changeCallback === "function") {
      result = await changeCallback();
    }

    await applyDigimonTokenAppearanceToActorAndPlacedTokens(actor, {
      textureSrc: getActorTokenTextureSource(actor, options.textureSrc),
      humanScaling: options.humanScaling
    });

    tokens = getPlacedTokensForActor(actor);

    if (tokens.length) {
      applyDigivolutionStep(tokens, effects, originalState, {
        tokenAlpha: 0.08,
        tokenScale: 1.20,
        tokenFlip: -1,
        auraAlpha: 1.00,
        auraScale: 1.48,
        flashAlpha: 1.00,
        ringRotation: 0.82
      });
      await sleep(75);

      applyDigivolutionStep(tokens, effects, originalState, {
        tokenAlpha: 0.72,
        tokenScale: 1.14,
        tokenFlip: 1,
        auraAlpha: 0.78,
        auraScale: 1.28,
        flashAlpha: 0.42,
        ringRotation: 0.52
      });
      await sleep(80);

      applyDigivolutionStep(tokens, effects, originalState, {
        tokenAlpha: 1.00,
        tokenScale: 1.08,
        tokenFlip: -1,
        auraAlpha: 0.42,
        auraScale: 1.12,
        flashAlpha: 0.16,
        ringRotation: 0.30
      });
      await sleep(55);

      applyDigivolutionStep(tokens, effects, originalState, {
        tokenAlpha: 1.00,
        tokenScale: 1.03,
        tokenFlip: 1,
        auraAlpha: 0.22,
        auraScale: 1.04,
        flashAlpha: 0.05,
        ringRotation: 0.18
      });
      await sleep(55);

      applyDigivolutionStep(tokens, effects, originalState, {
        tokenAlpha: 1.00,
        tokenScale: 1.00,
        tokenFlip: 1,
        auraAlpha: 0.00,
        auraScale: 1.00,
        flashAlpha: 0.00,
        ringRotation: 0.08
      });
      await sleep(45);
    }

    return result;
  } finally {
    tokens = getPlacedTokensForActor(actor);
    restoreTokenVisualState(tokens, originalState);

    for (const effect of effects.values()) {
      destroyDigivolutionEffect(effect);
    }
  }
}

export async function applyHumanScalingToAllDigimonTokens(humanScaling = null) {
  const scaling =
    humanScaling ??
    game.settings.get(MODULE_ID, "humanScaling") ??
    "medium";

  let updatedActors = 0;
  let updatedSceneTokens = 0;

  const digimonActors = game.actors.filter((actor) => {
  return isDigimonLikeActor(actor);
});

  for (const actor of digimonActors) {
    const changed = await applyDigimonTokenScaleToActor(actor, scaling);
    if (changed) updatedActors += 1;
  }

  for (const scene of game.scenes) {
    const updates = [];

    for (const token of scene.tokens) {
      const actor = token.actor;

      if (!isDigimonLikeActor(actor)) continue;

      const tokenSize = getDigimonTokenScale(actor, scaling);

      updates.push({
        _id: token.id,
        width: tokenSize,
        height: tokenSize
      });
    }

    if (updates.length > 0) {
      await scene.updateEmbeddedDocuments("Token", updates);
      updatedSceneTokens += updates.length;
    }
  }

  ui.notifications.info(
    formatI18n("DDA.HumanScaling.ApplyNotification", {
      actors: updatedActors,
      tokens: updatedSceneTokens
    })
  );

  return {
    actors: updatedActors,
    tokens: updatedSceneTokens
  };
}

export async function confirmApplyHumanScalingToAllDigimonTokens(humanScaling = null) {
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: localize("DDA.HumanScaling.ApplyDialog.Title")
    },
    content: `<p>${localize("DDA.HumanScaling.ApplyDialog.Content")}</p>`,
    yes: {
      default: false
    },
    no: {
      default: true
    },
    rejectClose: false,
    modal: true
  });

  if (!confirmed) {
    ui.notifications.info(localize("DDA.HumanScaling.ApplyCancelled"));
    return null;
  }

  return applyHumanScalingToAllDigimonTokens(humanScaling);
}

export function registerDigimonTokenScaleHooks() {
  Hooks.on("updateActor", async (actor, changed) => {
    if (!game.user.isGM) return;
    if (!isDigimonLikeActor(actor)) return;

    const newSize =
      foundry.utils.getProperty(changed, "system.size") ??
      changed["system.size"];

    const newStage =
      foundry.utils.getProperty(changed, "system.stage") ??
      changed["system.stage"];

    if (!newSize && !newStage) return;

    const currentStage = newStage ?? actor.system.stage ?? "child";
    const currentSize = newSize ?? actor.system.size ?? "medium";
    const clampedSize = getClampedSizeForStage(currentSize, currentStage);

    if (clampedSize !== currentSize) {
      await actor.update({ "system.size": clampedSize });
      ui.notifications.warn(
        formatI18n("DDA.Warning.SizeAutoClampedToStageMaximum", {
          name: actor.name,
          size: localize(CONFIG.DDA?.sizes?.[clampedSize] ?? clampedSize)
        })
      );
      return;
    }

    await applyDigimonTokenAppearanceToActorAndPlacedTokens(actor, {
      textureSrc: getActorTokenTextureSource(actor)
    });
  });
}
