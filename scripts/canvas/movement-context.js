/**
 * Canonical semantic classification for DDA Token movement.
 *
 * Foundry v13 exposes preMoveToken with the final TokenMovementOperation, but
 * many DDA mechanics also move Tokens through Document.update calls.  This
 * module keeps those two concerns separate:
 *   - movementBudget: how a path is limited/costed by the DDA movement tracker;
 *   - reactions: whether movement-triggered rules may observe the relocation;
 *   - voluntary: whether the mover chose to move (important for Punishing Strike);
 *   - traversal: whether intermediate path points count, or only endpoints
 *     (Teleport does not physically traverse the intervening spaces).
 */

export const DDA_MOVEMENT_CONTEXT_OPTION = "ddaMovementContext";
export const DDA_MOVEMENT_TRACE_OPTION = "ddaMovementTrace";

const DIRECT_FORCED_FLAGS = new Set([
  "ddaForcedMovement",
  "ddaAreaPassMovement",
  "ddaClashForcedMovement",
  "ddaDistantForce",
  "ddaExtendedGrapplePull",
  "ddaThickSkinReflection",
  "ddaClashPinFall"
]);

const AUTOMATED_VOLUNTARY_FLAGS = new Set([
  "ddaEvokerProtectorIntercede"
]);

const AUTOMATED_UNWILLING_FLAGS = new Set([
  "ddaClashMoveFollower",
  "ddaGiantHijackerFollow",
  "ddaGiantHijackerAttach"
]);

const TELEPORT_FLAGS = new Set([
  "ddaTeleport",
  "ddaGlamorSwap"
]);

const FORCED_GRANTED_KINDS = new Set([
  "fastball",
  "areaIntercedeThrow",
  "clash-throw"
]);

const clone = (value) => {
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
};

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function hasAnyFlag(operation, names) {
  if (!operation) return false;
  for (const name of names) {
    if (operation[name]) return true;
  }
  return false;
}

function normalizeExplicitContext(value = {}) {
  const mode = String(value.mode ?? "voluntary");
  const movementBudget = String(value.movementBudget ?? (
    mode === "forced" || mode === "teleport" || mode === "undo"
      ? "none"
      : "movement"
  ));

  return {
    version: 1,
    mode,
    movementBudget,
    voluntary: value.voluntary !== false,
    reactions: value.reactions !== false,
    traversal: value.traversal !== false,
    source: String(value.source ?? ""),
    unwilling: Boolean(value.unwilling ?? value.voluntary === false),
    suppressMovementEffects: Boolean(value.suppressMovementEffects),
    suppressBurn: Boolean(value.suppressBurn),
    ...clone(value)
  };
}

/**
 * Resolve movement semantics from explicit DDA metadata, legacy update options,
 * and (when supplied) an active DDA movement session.
 */
export function getDDAMovementContext(operation = {}, { session = null, movement = null } = {}) {
  const explicit = operation?.[DDA_MOVEMENT_CONTEXT_OPTION];
  if (explicit && typeof explicit === "object") return normalizeExplicitContext(explicit);

  if (operation?.ddaMovementUndo || String(movement?.method ?? "") === "undo") {
    return normalizeExplicitContext({
      mode: "undo",
      movementBudget: "none",
      voluntary: false,
      reactions: false,
      traversal: false,
      source: "movementUndo",
      unwilling: false,
      suppressMovementEffects: true
    });
  }

  if (hasAnyFlag(operation, TELEPORT_FLAGS) || operation?.teleport) {
    return normalizeExplicitContext({
      mode: "teleport",
      movementBudget: "none",
      voluntary: true,
      reactions: true,
      traversal: false,
      source: operation?.ddaGlamorSwap ? "glamorSwap" : "teleport",
      unwilling: false
    });
  }

  if (hasAnyFlag(operation, DIRECT_FORCED_FLAGS)) {
    return normalizeExplicitContext({
      mode: "forced",
      movementBudget: "none",
      voluntary: false,
      reactions: true,
      traversal: true,
      source: "forcedMovement",
      unwilling: true
    });
  }

  if (hasAnyFlag(operation, AUTOMATED_UNWILLING_FLAGS)) {
    return normalizeExplicitContext({
      mode: "automated",
      movementBudget: "none",
      voluntary: false,
      reactions: true,
      traversal: true,
      source: "linkedMovement",
      unwilling: true
    });
  }

  if (hasAnyFlag(operation, AUTOMATED_VOLUNTARY_FLAGS)) {
    return normalizeExplicitContext({
      mode: "automated",
      movementBudget: "none",
      voluntary: true,
      reactions: true,
      traversal: true,
      source: "intercedeMovement",
      unwilling: false
    });
  }

  const kind = String(session?.kind ?? "");
  if (FORCED_GRANTED_KINDS.has(kind)) {
    return normalizeExplicitContext({
      mode: "forced",
      movementBudget: "distance",
      voluntary: false,
      reactions: true,
      traversal: true,
      source: String(session?.source ?? kind),
      unwilling: true
    });
  }

  if (session?.state === "active") {
    return normalizeExplicitContext({
      mode: "granted",
      movementBudget: "movement",
      voluntary: true,
      reactions: true,
      traversal: true,
      source: String(session?.source ?? kind ?? "grantedMovement"),
      unwilling: false
    });
  }

  return normalizeExplicitContext({
    mode: "voluntary",
    movementBudget: "movement",
    voluntary: true,
    reactions: true,
    traversal: true,
    source: "tokenMove",
    unwilling: false
  });
}

export function withDDAMovementContext(options = {}, context = {}) {
  return {
    ...options,
    [DDA_MOVEMENT_CONTEXT_OPTION]: normalizeExplicitContext(context)
  };
}

function tokenCenterOffset(document) {
  const grid = Math.max(1, number(globalThis.canvas?.grid?.size, 100));
  return {
    x: Math.max(0.5, number(document?.width, 1)) * grid / 2,
    y: Math.max(0.5, number(document?.height, 1)) * grid / 2
  };
}

function centerPoint(document, source = {}) {
  const offset = tokenCenterOffset(document);
  return {
    x: number(source?.x, number(document?.x)) + offset.x,
    y: number(source?.y, number(document?.y)) + offset.y,
    elevation: number(source?.elevation, number(document?.elevation))
  };
}

/** Return center-based world points for the final v13 movement path. */
function measuredMovementSection(movement = {}) {
  const pendingSpaces = number(
    movement?.pending?.spaces,
    NaN
  );
  const pendingWaypoints =
    movement?.pending?.waypoints ?? [];

  if (
    (Number.isFinite(pendingSpaces) && pendingSpaces > 0) ||
    pendingWaypoints.length > 0
  ) {
    return movement.pending;
  }

  return movement?.passed ?? {};
}

export function getMovementPathPoints(document, movement = {}, context = null) {
  const semantic = context ?? getDDAMovementContext({});
  const origin = centerPoint(document, movement?.origin ?? document);
  const destination = centerPoint(document, movement?.destination ?? document);

  if (semantic.traversal === false) return [origin, destination];

  const section = measuredMovementSection(movement);

  return [
    origin,
    ...(section?.waypoints ?? []).map((waypoint) => centerPoint(document, waypoint)),
    destination
  ];
}

export function buildDDAMovementTrace(document, movement = {}, operation = {}, { session = null } = {}) {
  const context = getDDAMovementContext(operation, { session, movement });
  const section = measuredMovementSection(movement);

  return {
    version: 1,
    context,
    points: getMovementPathPoints(document, movement, context),
    spaces: Math.max(0, number(section?.spaces, 0))
  };
}

export function attachDDAMovementTrace(document, movement = {}, operation = {}, { session = null } = {}) {
  const trace = buildDDAMovementTrace(document, movement, operation, { session });
  operation[DDA_MOVEMENT_CONTEXT_OPTION] = clone(trace.context);
  operation[DDA_MOVEMENT_TRACE_OPTION] = clone(trace);
  return trace;
}

export function getDDAMovementTrace(operation = {}) {
  const trace = operation?.[DDA_MOVEMENT_TRACE_OPTION];
  if (!trace || !Array.isArray(trace.points)) return null;
  return clone(trace);
}

/**
 * Sample a center-based polyline at a stable density tied to grid size.
 * The callback is invoked with each midpoint sample. Returns sampled lengths.
 */
export function measurePathByPredicate(points = [], predicate, { samplesPerGrid = 6 } = {}) {
  const grid = Math.max(1, number(globalThis.canvas?.grid?.size, 100));
  let totalLength = 0;
  let affectedLength = 0;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const dx = number(to?.x) - number(from?.x);
    const dy = number(to?.y) - number(from?.y);
    const length = Math.hypot(dx, dy);
    if (length <= 0) continue;

    const samples = Math.max(1, Math.ceil((length / grid) * Math.max(1, samplesPerGrid)));
    const sampleLength = length / samples;
    totalLength += length;

    for (let sample = 0; sample < samples; sample += 1) {
      const ratio = (sample + 0.5) / samples;
      const point = {
        x: number(from?.x) + dx * ratio,
        y: number(from?.y) + dy * ratio,
        elevation: number(from?.elevation) + (number(to?.elevation) - number(from?.elevation)) * ratio
      };
      if (predicate(point)) affectedLength += sampleLength;
    }
  }

  return { totalLength, affectedLength };
}

export function affectedSpacesForPath(points, spaces, predicate, options = {}) {
  const totalSpaces = Math.max(0, number(spaces));
  if (!totalSpaces || points?.length < 2) return 0;
  const { totalLength, affectedLength } = measurePathByPredicate(points, predicate, options);
  if (totalLength <= 0 || affectedLength <= 0) return 0;
  const affectedSpaces = totalSpaces * Math.min(1, affectedLength / totalLength);
  return Math.max(0, Math.min(totalSpaces, Math.ceil(affectedSpaces - 0.001)));
}

/**
 * Detect whether a path changed inside/outside state for a predicate. This also
 * catches outside -> inside -> outside traversal, which endpoint-only hooks miss.
 */
export function pathCrossesPredicate(points = [], predicate, { traversal = true, samplesPerGrid = 8 } = {}) {
  if (!Array.isArray(points) || points.length < 2) return false;
  const startInside = Boolean(predicate(points[0]));
  const endInside = Boolean(predicate(points.at(-1)));
  if (startInside !== endInside) return true;
  if (!traversal) return false;

  const grid = Math.max(1, number(globalThis.canvas?.grid?.size, 100));
  let previousInside = startInside;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const dx = number(to?.x) - number(from?.x);
    const dy = number(to?.y) - number(from?.y);
    const length = Math.hypot(dx, dy);
    if (length <= 0) continue;
    const samples = Math.max(1, Math.ceil((length / grid) * Math.max(1, samplesPerGrid)));
    for (let sample = 1; sample <= samples; sample += 1) {
      const ratio = sample / samples;
      const current = {
        x: number(from?.x) + dx * ratio,
        y: number(from?.y) + dy * ratio,
        elevation: number(from?.elevation) + (number(to?.elevation) - number(from?.elevation)) * ratio
      };
      const inside = Boolean(predicate(current));
      if (inside !== previousInside) return true;
      previousInside = inside;
    }
  }
  return false;
}

export function pathDistanceSpaces(points = []) {
  if (!Array.isArray(points) || points.length < 2) return 0;

  /*
   * Foundry v13 owns grid geometry and diagonal measurement. DDA movement
   * budgets are expressed in Spaces, so prefer the grid's public measurePath.
   */
  try {
    const measurement = globalThis.canvas?.grid?.measurePath?.(
      points.map((point) => ({
        x: number(point?.x),
        y: number(point?.y),
        elevation: number(point?.elevation)
      }))
    );

    const measuredSpaces = number(
      measurement?.spaces,
      NaN
    );

    if (Number.isFinite(measuredSpaces) && measuredSpaces > 0) {
      return measuredSpaces;
    }
  } catch (error) {
    console.warn(
      "DDA | Could not measure movement path through Foundry grid.",
      error
    );
  }

  /* Gridless/legacy compatibility fallback. */
  const grid = Math.max(1, number(globalThis.canvas?.grid?.size, 100));
  let pixels = 0;
  for (let index = 1; index < points.length; index += 1) {
    pixels += Math.hypot(
      number(points[index]?.x) - number(points[index - 1]?.x),
      number(points[index]?.y) - number(points[index - 1]?.y)
    );
  }
  return pixels / grid;
}
