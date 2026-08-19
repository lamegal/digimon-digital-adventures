const DDA_HEALTH_PIPS_NAME = "dda-health-pips";
const DDA_SUPPORTED_HEALTH_TYPES = new Set([
  "character",
  "digimon",
  "npc"
]);

function num(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function clamp(value, min, max) {
  return Math.min(
    Math.max(value, min),
    max
  );
}

function getActorWounds(actor) {
  if (!actor || !DDA_SUPPORTED_HEALTH_TYPES.has(actor.type)) {
    return null;
  }

  const system = actor.system ?? {};

  const wounds = actor.type === "character"
    ? system.derived?.wounds
    : system.miscStats?.wounds ?? system.derived?.wounds;

  const max = Math.max(
    0,
    Math.floor(num(wounds?.max, 0))
  );

  if (max <= 0) return null;

  const value = clamp(
    Math.floor(num(wounds?.value, max)),
    0,
    max
  );

  const temp = Math.max(
    0,
    Math.floor(num(wounds?.temp?.value, 0))
  );

  return {
    value,
    max,
    temp
  };
}

function isEnemyToken(token, actor) {
  const disposition = Number(
    token?.document?.disposition ?? 0
  );

  const friendlyDisposition =
    disposition === CONST.TOKEN_DISPOSITIONS?.FRIENDLY ||
    disposition > 0;

  const hostileDisposition =
    disposition === CONST.TOKEN_DISPOSITIONS?.HOSTILE ||
    disposition < 0;

  if (friendlyDisposition) return false;
  if (hostileDisposition) return true;

  const enemyFlag = Boolean(
    actor?.system?.enemy?.isEnemy ||
    actor?.getFlag?.(
      game.system.id,
      "enemyNpc"
    )?.isEnemy ||
    token?.document?.getFlag?.(
      game.system.id,
      "enemyNpc"
    )?.isEnemy
  );

  return enemyFlag;
}

function canSeeHealthPips(token, actor) {
  if (!token || !actor) return false;
  if (game.user?.isGM) return true;

  if (token.isOwner || token.observer) return true;

  return Boolean(
    actor.testUserPermission?.(
      game.user,
      "OBSERVER"
    )
  );
}

function getHealthPalette(token, actor) {
  const temporary = {
    temp: 0xffd54a,
    tempBorder: 0xffef9a
  };

  if (isEnemyToken(token, actor)) {
    return {
      filled: 0xc72a74,
      filledBorder: 0xff9fc9,
      empty: 0x21111d,
      emptyBorder: 0x7b3158,
      background: 0x120912,
      ...temporary
    };
  }

  if (actor?.type === "digimon" || actor?.type === "npc") {
    return {
      filled: 0x31c96b,
      filledBorder: 0xb9ffd0,
      empty: 0x0d2115,
      emptyBorder: 0x37734d,
      background: 0x07140c,
      ...temporary
    };
  }

  return {
    filled: 0x27a8ff,
    filledBorder: 0xbcecff,
    empty: 0x0c1724,
    emptyBorder: 0x2e5f8b,
    background: 0x07111f,
    ...temporary
  };
}

function clearHealthPips(token) {
  if (!token) return;

  token._ddaHealthPips?.destroy({
    children: true
  });

  token._ddaHealthPips = null;

  token.children
    ?.filter((child) => child.name === DDA_HEALTH_PIPS_NAME)
    ?.forEach((child) => {
      child.destroy({
        children: true
      });
    });
}

function drawHealthPips(token) {
  clearHealthPips(token);

  const actor = token?.actor;

  if (!token || !actor) return;
  if (!canSeeHealthPips(token, actor)) return;

  const wounds = getActorWounds(actor);

  if (!wounds) return;

  const width = Math.max(
    1,
    num(
      token.w,
      num(token.document?.width, 1) *
        num(canvas.grid?.size, 100)
    )
  );

  const height = Math.max(
    1,
    num(
      token.h,
      num(token.document?.height, 1) *
        num(canvas.grid?.size, 100)
    )
  );

  const palette = getHealthPalette(token, actor);

  const max = wounds.max;
  const value = wounds.value;
  const temp = wounds.temp;
  const totalPips = Math.max(1, max + temp);

  const centerX = width / 2;
  const centerY = height / 2;

  const shortestSide = Math.min(width, height);

const pipSize = clamp(
  Math.floor(shortestSide / Math.max(totalPips + 5, 10)),
  6,
  11
);

const radius = Math.max(
  3,
  Math.floor(pipSize / 2)
);

const orbitRadius = Math.max(
  14,
  (shortestSide / 2) + radius + 8
);

  const container = new PIXI.Container();

  container.name = DDA_HEALTH_PIPS_NAME;
  container.eventMode = "none";
  container.interactive = false;
  container.zIndex = 9998;
  container.position.set(0, 0);

  const ring = new PIXI.Graphics();

  ring.lineStyle(
    2,
    palette.emptyBorder,
    0.30
  );

  ring.drawCircle(
    centerX,
    centerY,
    orbitRadius
  );

  container.addChild(ring);

  const startAngle = -Math.PI / 2;

  for (let index = 0; index < totalPips; index += 1) {
    const angle = startAngle +
      ((Math.PI * 2) * (index / totalPips));

    const x = centerX + Math.cos(angle) * orbitRadius;
    const y = centerY + Math.sin(angle) * orbitRadius;

    const isTemp = index >= max;
    const isFilled = !isTemp && index < value;

if (isFilled || isTemp) {
  const glowColor = isTemp
    ? palette.temp
    : palette.filled;

  const outerGlow = new PIXI.Graphics();

  outerGlow.beginFill(glowColor, 0.14);
  outerGlow.drawCircle(
    x,
    y,
    radius + 6
  );
  outerGlow.endFill();

  container.addChild(outerGlow);

  const innerGlow = new PIXI.Graphics();

  innerGlow.beginFill(glowColor, 0.24);
  innerGlow.drawCircle(
    x,
    y,
    radius + 3
  );
  innerGlow.endFill();

  container.addChild(innerGlow);
}

    const pip = new PIXI.Graphics();

pip.lineStyle(
  1.8,
  isTemp
    ? palette.tempBorder
    : isFilled
      ? palette.filledBorder
      : palette.emptyBorder,
  isFilled || isTemp ? 1 : 0.58
);

pip.beginFill(
  isTemp
    ? palette.temp
    : isFilled
      ? palette.filled
      : palette.empty,
  isFilled || isTemp ? 1 : 0.26
);

    pip.drawCircle(
      x,
      y,
      radius
    );

    pip.endFill();

    container.addChild(pip);
  }

  token.sortableChildren = true;
  token.addChild(container);

  token._ddaHealthPips = container;
}

function refreshHealthPips(token) {
  if (!canvas?.ready) return;

  window.setTimeout(() => {
    drawHealthPips(token);
  }, 0);
}

function refreshHealthPipsForDocument(document) {
  const token =
    document?.object ??
    canvas.tokens?.get?.(document?.id) ??
    null;

  if (!token) return;

  refreshHealthPips(token);
}

function refreshHealthPipsForActor(actor) {
  if (!canvas?.ready || !actor) return;

  window.setTimeout(() => {
    for (const token of canvas.tokens?.placeables ?? []) {
      const tokenActor = token.actor;

      if (!tokenActor) continue;

      if (
        tokenActor.id === actor.id ||
        tokenActor.uuid === actor.uuid
      ) {
        drawHealthPips(token);
      }
    }
  }, 0);
}

function refreshAllHealthPips() {
  if (!canvas?.ready) return;

  window.setTimeout(() => {
    for (const token of canvas.tokens?.placeables ?? []) {
      drawHealthPips(token);
    }
  }, 0);
}

function clearAllHealthPips() {
  for (const token of canvas.tokens?.placeables ?? []) {
    clearHealthPips(token);
  }
}

export function registerDdaHealthPips() {
  Hooks.on("drawToken", (token) => {
    refreshHealthPips(token);
  });

  Hooks.on("refreshToken", (token) => {
    refreshHealthPips(token);
  });

  Hooks.on("createToken", (document) => {
    refreshHealthPipsForDocument(document);
  });

  Hooks.on("updateToken", (document) => {
    refreshHealthPipsForDocument(document);
  });

  Hooks.on("deleteToken", (document) => {
    clearHealthPips(
      document?.object ??
      canvas.tokens?.get?.(document?.id) ??
      null
    );
  });

  Hooks.on("updateActor", (actor) => {
    refreshHealthPipsForActor(actor);
  });

  Hooks.on("canvasReady", () => {
    refreshAllHealthPips();
  });

  game.dda ??= {};

  game.dda.healthPips = {
    refreshAll: refreshAllHealthPips,
    clearAll: clearAllHealthPips,
    refreshToken: refreshHealthPips
  };

  console.log("DDA | Health pips registered.");
}