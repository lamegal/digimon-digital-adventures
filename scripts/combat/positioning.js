import { areActorsAllies } from "../rules/quality-automation.js";

function number(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function gridDistanceUnits() {
  return Math.max(1, number(canvas?.grid?.distance ?? canvas?.scene?.grid?.distance, 1));
}

function tokenDocument(value) {
  return value?.document ?? value ?? null;
}

function tokenBoundsPixels(value, change = {}) {
  const document = tokenDocument(value);
  if (!document) return null;

  const object = value?.document ? value : document?.object;
  const x = number(change.x ?? document.x);
  const y = number(change.y ?? document.y);
  const widthSpaces = Math.max(0, number(change.width ?? document.width, 1));
  const heightSpaces = Math.max(0, number(change.height ?? document.height, 1));

  // A rendered Token already knows its exact pixel footprint, which matters on
  // hex grids. For prospective Document changes, derive an equivalent bounds
  // rectangle from the public grid dimensions.
  const unchangedPosition = !Object.hasOwn(change, "x") && !Object.hasOwn(change, "y") &&
    !Object.hasOwn(change, "width") && !Object.hasOwn(change, "height");
  if (unchangedPosition && object?.bounds) {
    return {
      x: number(object.bounds.x, x),
      y: number(object.bounds.y, y),
      width: Math.max(0, number(object.bounds.width)),
      height: Math.max(0, number(object.bounds.height))
    };
  }

  const grid = canvas?.grid;
  const sizeX = Math.max(1, number(grid?.sizeX ?? grid?.size, 100));
  const sizeY = Math.max(1, number(grid?.sizeY ?? grid?.size, 100));
  return {
    x,
    y,
    width: widthSpaces * sizeX,
    height: heightSpaces * sizeY
  };
}

function occupiedGridCenters(value, change = {}) {
  const grid = canvas?.grid;
  const document = tokenDocument(value);
  if (!grid || !document) return [];

  const unchangedPosition = !Object.keys(change ?? {}).some((key) =>
    ["x", "y", "width", "height"].includes(key)
  );

  if (unchangedPosition && typeof document.getOccupiedGridSpaceOffsets === "function") {
    try {
      const offsets = document.getOccupiedGridSpaceOffsets();
      const centers = (offsets ?? []).map((offset) => grid.getCenterPoint(offset));
      if (centers.length) return centers;
    } catch (_error) {
      // Fall through to public bounds-based occupancy below.
    }
  }

  const bounds = tokenBoundsPixels(value, change);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return [];

  try {
    const [i0, j0, i1, j1] = grid.getOffsetRange(bounds);
    const centers = [];
    for (let i = i0; i < i1; i += 1) {
      for (let j = j0; j < j1; j += 1) {
        centers.push(grid.getCenterPoint({ i, j }));
      }
    }
    if (centers.length) return centers;
  } catch (_error) {
    // Gridless/custom-grid fallback below.
  }

  return [{
    x: bounds.x + (bounds.width / 2),
    y: bounds.y + (bounds.height / 2)
  }];
}

export function measureGridPointDistanceSpaces(pointA, pointB) {
  if (!pointA || !pointB) return Number.POSITIVE_INFINITY;
  const grid = canvas?.grid;

  try {
    const measurement = grid?.measurePath?.([pointA, pointB]);
    const spaces = number(measurement?.spaces, NaN);
    if (Number.isFinite(spaces)) return Math.max(0, spaces);

    const distance = number(measurement?.distance, NaN);
    if (Number.isFinite(distance)) {
      return Math.max(0, distance / gridDistanceUnits());
    }
  } catch (_error) {
    // Fallback is intentionally only used when the public grid measurement is
    // unavailable (for example while the Canvas is not ready).
  }

  const size = Math.max(1, number(grid?.size, 100));
  return Math.max(0, Math.hypot(
    number(pointA.x) - number(pointB.x),
    number(pointA.y) - number(pointB.y)
  ) / size);
}

export function getTokenDocumentGridDistance(leftDocument, rightDocument, {
  leftChange = {},
  rightChange = {}
} = {}) {
  if (!leftDocument || !rightDocument) return Number.POSITIVE_INFINITY;

  const leftCenters = occupiedGridCenters(leftDocument, leftChange);
  const rightCenters = occupiedGridCenters(rightDocument, rightChange);
  if (!leftCenters.length || !rightCenters.length) return Number.POSITIVE_INFINITY;

  let minimum = Number.POSITIVE_INFINITY;
  for (const left of leftCenters) {
    for (const right of rightCenters) {
      minimum = Math.min(minimum, measureGridPointDistanceSpaces(left, right));
      if (minimum <= 0) return 0;
    }
  }
  return minimum;
}

export function getTokenGridDistance(tokenA, tokenB) {
  if (!tokenA || !tokenB) return Number.POSITIVE_INFINITY;
  return getTokenDocumentGridDistance(tokenA, tokenB);
}

export function isTokenCombatReady(token) {
  const actor = token?.actor;
  if (!actor || token.document?.hidden) return false;
  const combatant = game?.combat?.combatants?.find((entry) =>
    entry.tokenId === token.id || entry.actor?.uuid === actor.uuid
  );
  if (combatant?.defeated) return false;
  const wounds = number(
    actor.type === "character"
      ? actor.system?.derived?.wounds?.value
      : actor.system?.miscStats?.wounds?.value,
    NaN
  );
  return !Number.isFinite(wounds) || wounds > 0;
}

export function getFlankContext(attacker, targetToken, { distance = 1 } = {}) {
  const targetActor = targetToken?.actor ?? null;

  if (
    !attacker ||
    !targetActor ||
    !canvas?.tokens?.placeables?.length ||
    areActorsAllies(attacker, targetActor)
  ) {
    return {
      active: false,
      allies: [],
      allyNames: [],
      distance
    };
  }

  const seenActors = new Set();
  const allies = canvas.tokens.placeables.filter((token) => {
    const ally = token?.actor ?? null;

    if (!ally || token === targetToken) return false;
    if (ally.uuid === attacker.uuid || seenActors.has(ally.uuid)) return false;

    // Aggressive Flank only applies when a valid ally of the attacker is also
    // an opponent of the target. This avoids friendly/neutral tokens or badly
    // configured dispositions granting the bonus by accident.
    if (!areActorsAllies(attacker, ally)) return false;
    if (areActorsAllies(targetActor, ally)) return false;
    if (!isTokenCombatReady(token)) return false;

    // The rule only requires the ally to be adjacent to the target. It does
    // not require strict opposite-side geometry.
    if (getTokenGridDistance(token, targetToken) > distance) return false;

    seenActors.add(ally.uuid);
    return true;
  });

  const allyNames = allies.map((token) => {
    return String(token.name ?? token.actor?.name ?? "").trim();
  }).filter(Boolean);

  return {
    active: allies.length > 0,
    allies,
    allyNames,
    distance
  };
}
