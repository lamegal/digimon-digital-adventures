import { getDomainMovementContext } from "../combat/utility-qualities.js";
import {
  getActiveDDAUnitContext,
  getCombatantUnitId
} from "../combat/initiative.js";
import { spendActorActions } from "../combat/action-economy.js";
import {
  reduceEnemyUnalterableDamageWithShiningArmor,
  refundLightDigizoidActionReserve
} from "../combat/digizoid-gain-force.js";

const DDA_MOVEMENT_FLAG = "movementTracker";
const MOBILE_ARTILLERY_TERRAIN_FLAG = "mobileArtilleryTerrain";
const MOVABLE_TYPES = new Set(["character", "digimon", "npc"]);

const pendingMoves = new Map();
const runtimeSessions = new Map();
const actionReservations = new Map();
const actorUpdateQueues = new Map();

const scope = () => game.system?.id ?? "digimon-digital-adventures";

const num = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const i18n = (pt, en) => {
  return String(game.i18n?.lang ?? "")
    .toLowerCase()
    .startsWith("en")
      ? en
      : pt;
};

const supported = (actor) => MOVABLE_TYPES.has(actor?.type);

const tokenObject = (document) => {
  return canvas.tokens?.get(document?.id) ?? null;
};

const point = (source = {}) => ({
  x: num(source.x),
  y: num(source.y),
  elevation: num(source.elevation)
});

function clone(value) {
  if (foundry?.utils?.deepClone) {
    return foundry.utils.deepClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function actorKey(actor) {
  return String(actor?.uuid ?? actor?.id ?? "");
}

function getStoredSession(document) {
  const value = document?.getFlag?.(
    scope(),
    DDA_MOVEMENT_FLAG
  );

  return value && typeof value === "object"
    ? value
    : null;
}

function getSession(document) {
  const id = String(document?.id ?? "");

  return runtimeSessions.get(id) ??
    getStoredSession(document);
}

function refreshTokenHud(document) {
  const hud = canvas?.tokens?.hud;
  const hudDocument = hud?.object?.document ?? hud?.object;

  if (
    !hud?.rendered ||
    !document ||
    String(hudDocument?.id ?? "") !== String(document.id ?? "")
  ) {
    return;
  }

  hud.render();
}

async function setSession(document, session) {
  const id = String(document?.id ?? "");
  const value = clone(session);

  runtimeSessions.set(id, value);

  await document.setFlag(
    scope(),
    DDA_MOVEMENT_FLAG,
    value
  );
}

async function unsetSession(document) {
  const id = String(document?.id ?? "");

  runtimeSessions.delete(id);

  await document.unsetFlag(
    scope(),
    DDA_MOVEMENT_FLAG
  );
}

function isStraightLineSession(session) {
  const points = [point(session?.start ?? {})];

  for (const segment of session?.segments ?? []) {
    for (const waypoint of segment?.waypoints ?? []) {
      points.push(point(waypoint));
    }

    points.push(point(segment?.to ?? {}));
  }

  if (points.length <= 2) return true;

  const start = points[0];
  const end = points.at(-1);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = (dx * dx) + (dy * dy);

  if (lengthSquared <= 0) return false;

  const length = Math.sqrt(lengthSquared);
  const tolerance = Math.max(
    1,
    num(canvas.grid?.size, 100) * 0.02
  );

  let previousProjection = -tolerance;

  for (const current of points) {
    const relativeX = current.x - start.x;
    const relativeY = current.y - start.y;

    const distanceFromLine = Math.abs(
      (dx * relativeY) - (dy * relativeX)
    ) / length;

    const projection = (
      (relativeX * dx) + (relativeY * dy)
    ) / length;

    if (
      distanceFromLine > tolerance ||
      projection + tolerance < previousProjection
    ) {
      return false;
    }

    previousProjection = projection;
  }

  return true;
}

function sameActor(left, right) {
  return Boolean(left && right && (
    left.uuid === right.uuid ||
    left.id === right.id ||
    left.parent?.uuid === right.uuid ||
    right.parent?.uuid === left.uuid
  ));
}

function getCombatant(combat, document) {
  if (!combat || !document) return null;

  const combatants = combat.combatants?.contents ?? [];

  return combatants.find((combatant) => {
    return combatant.tokenId === document.id ||
      combatant.token?.id === document.id;
  }) ?? combatants.find((combatant) => {
    return sameActor(
      combatant.actor,
      document.actor
    );
  }) ?? null;
}

function applyCurrentTurnMovementMultiplier(actor, value) {
  const base = Math.max(0, num(value));
  const penalty = actor?.system?.combat?.offensiveQualities?.noEscape;

  if (!penalty?.active) return base;

  const sameTurn =
    String(penalty.combatId ?? "") === String(game.combat?.id ?? "") &&
    Number(penalty.round ?? -1) === Number(game.combat?.round ?? -2) &&
    Number(penalty.turn ?? -1) === Number(game.combat?.turn ?? -2);

  if (!sameTurn) return base;

  return Math.max(
    0,
    Math.floor(base * Math.max(0, num(penalty.multiplier, 1)))
  );
}

function landMovementData(actor) {
  const land =
    actor?.system?.movementTypes?.land;

  /*
   * Tamers store Movement under
   * system.derived.movement.
   *
   * Digimon and NPC Digimon store it under
   * system.miscStats.movement or movementTypes.
   */
  const fallbackTotal =
    actor?.type === "character"
      ? (
          actor?.system?.derived
            ?.movement?.total ??
          actor?.system?.derived
            ?.movement?.value
        )
      : (
          actor?.system?.miscStats
            ?.movement?.total ??
          actor?.system?.miscStats
            ?.movement?.value
        );

  if (!land) {
    return {
      key: "land",

      label: i18n(
        "Terrestre",
        "Land"
      ),

      enabled: true,

      total: applyCurrentTurnMovementMultiplier(
        actor,
        Math.max(0, num(fallbackTotal))
      )
    };
  }

  return {
    key: "land",

    label: String(
      land.displayLabel ??
      land.label ??
      i18n(
        "Terrestre",
        "Land"
      )
    ),

    /*
     * Older Actors may not explicitly contain
     * the enabled property.
     */
    enabled:
      land.enabled !== false,

    total: applyCurrentTurnMovementMultiplier(
      actor,
      Math.max(
        0,
        num(land.total ?? land.value),
        num(fallbackTotal)
      )
    )
  };
}

function moveSpaces(movement) {
  const spaces = num(movement?.passed?.spaces, NaN);

  if (Number.isFinite(spaces) && spaces > 0) {
    return spaces;
  }

  return (movement?.passed?.waypoints ?? []).length;
}

function clearTracker(token) {
  if (!token) return;

  token._ddaMovementTracker?.destroy({
    children: true
  });

  token._ddaMovementTracker = null;

  token.children
    ?.find((child) => {
      return child.name === "dda-movement-tracker";
    })
    ?.destroy({
      children: true
    });
}

function movementColor(spent, max, unrestricted = false) {
  if (unrestricted) return 0x58c8ff;
  if (spent > max) return 0x7a0000;
  if (spent <= Math.ceil(max / 3)) return 0x00ff66;
  if (spent <= Math.ceil((max * 2) / 3)) return 0xffcc00;
  return 0xff3333;
}

function drawTracker(token, session) {
  clearTracker(token);

  if (!token || !session) return;

  const spent = Math.max(0, num(session.spent));
  const max = Math.max(0, num(session.max));

  if (max <= 0) return;

  const width = num(
    token.w,
    num(token.document?.width, 1) *
      num(canvas.grid?.size, 100)
  );

  const height = num(
    token.h,
    num(token.document?.height, 1) *
      num(canvas.grid?.size, 100)
  );

  const color = movementColor(spent, max, Boolean(session.unrestricted));

  const box = new PIXI.Container();
  box.name = "dda-movement-tracker";
  box.zIndex = 9999;

  const border = new PIXI.Graphics();
  border.lineStyle(4, color, 0.95);
  border.drawRoundedRect(
    2,
    2,
    Math.max(1, width - 4),
    Math.max(1, height - 4),
    8
  );
  border.endFill();

  const badgeWidth = 62;
  const badgeX = width - badgeWidth + 4;

  const badge = new PIXI.Graphics();
  badge.lineStyle(2, color, 0.95);
  badge.beginFill(0x050b12, 0.88);
  badge.drawRoundedRect(
    badgeX,
    -10,
    badgeWidth,
    24,
    7
  );
  badge.endFill();

  const displaySpent = Number.isInteger(spent)
    ? spent
    : spent.toFixed(1);

  const displayMax = session.unrestricted
    ? "∞"
    : Number.isInteger(max)
      ? max
      : max.toFixed(1);

  const suffix = session.state === "complete"
    ? "✓"
    : "";

  const label = new PIXI.Text(
    `T ${displaySpent}/${displayMax}${suffix}`,
    {
      fontFamily: "Arial",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0xffffff,
      stroke: 0x000000,
      strokeThickness: 3
    }
  );

  label.anchor.set(0.5, 0.5);
  label.x = badgeX + (badgeWidth / 2);
  label.y = 2;

  box.addChild(border, badge, label);

  token.sortableChildren = true;
  token.addChild(box);

  token._ddaMovementTracker = box;
}

function refreshTracker(document) {
  const token = tokenObject(document);

  if (!token) return;

  const session = getSession(document);

  if (session) {
    drawTracker(token, session);
  } else {
    clearTracker(token);
  }
}

function warn(message) {
  ui.notifications.warn(message);
}

function isCurrentActiveMove(
  session,
  combat,
  combatant
) {
  return Boolean(
    session &&
    session.state === "active" &&
    session.combatId === combat?.id &&
    session.combatantId === combatant?.id &&
    num(session.round, -1) === num(combat?.round, -2) &&
    num(session.spent) < num(session.max)
  );
}

function getReservedActions(actor) {
  const key =
    actorKey(actor);

  if (!key) return 0;

  /*
   * pendingMoves é a fonte real das reservas.
   *
   * actionReservations funciona somente como proteção
   * contra duas movimentações simultâneas. Ele não pode
   * continuar bloqueando o Actor sem um movimento pendente
   * correspondente.
   */
  const pendingCount = [
    ...pendingMoves.values()
  ].filter((pending) => {
    return (
      pending?.reservationKey === key
    );
  }).length;

  const storedCount = Math.max(
    0,
    num(actionReservations.get(key))
  );

  if (storedCount !== pendingCount) {
    if (pendingCount > 0) {
      actionReservations.set(
        key,
        pendingCount
      );
    } else {
      actionReservations.delete(key);
    }
  }

  return pendingCount;
}

function reserveAction(actor) {
  const key = actorKey(actor);

  if (!key) return;

  actionReservations.set(
    key,
    getReservedActions(actor) + 1
  );
}

function releaseActionReservation(key) {
  const current = Math.max(
    0,
    num(actionReservations.get(key))
  );

  if (current <= 1) {
    actionReservations.delete(key);
    return;
  }

  actionReservations.set(key, current - 1);
}

function discardPendingMove(document) {
  if (!document) return false;

  const id =
    String(document.id ?? "");

  const pending =
    pendingMoves.get(id);

  if (!pending) return false;

  if (pending.reservationKey) {
    releaseActionReservation(
      pending.reservationKey
    );
  }

  pendingMoves.delete(id);

  /*
   * A sessão em runtime pode conter um movimento
   * que nunca chegou ao updateToken.
   *
   * Nesse caso, voltamos para a última sessão
   * realmente salva no TokenDocument.
   */
  const storedSession =
    getStoredSession(document);

  if (storedSession) {
    runtimeSessions.set(
      id,
      clone(storedSession)
    );
  } else {
    runtimeSessions.delete(id);
  }

  return true;
}

function pruneOrphanedActionReservation(actor) {
  const key =
    actorKey(actor);

  if (
    !key ||
    !actionReservations.has(key)
  ) {
    return false;
  }

  const hasMatchingPendingMove = [
    ...pendingMoves.values()
  ].some((pending) => {
    return (
      pending?.reservationKey === key
    );
  });

  if (hasMatchingPendingMove) {
    return false;
  }

  /*
   * Existe uma reserva, mas nenhum movimento
   * pendente é responsável por ela.
   */
  actionReservations.delete(key);

  return true;
}

function enqueueActorUpdate(actor, callback) {
  const key = actorKey(actor);

  if (!key) return Promise.resolve();

  const previous = actorUpdateQueues.get(key) ??
    Promise.resolve();

  const task = previous
    .catch(() => undefined)
    .then(callback);

  actorUpdateQueues.set(key, task);

  void task.finally(() => {
    if (actorUpdateQueues.get(key) === task) {
      actorUpdateQueues.delete(key);
    }
  });

  return task;
}

function createAutomaticSession(
  document,
  combat,
  combatant,
  data
) {
  return {
    version: 4,
    state: "active",

    combatId: combat.id,
    combatantId: combatant.id,
    round: num(combat.round),

    actionCost: 1,
    actionSpent: false,
    actionReservationKey: actorKey(document.actor),

    start: point(document),
    max: data.total,
    spent: 0,

    startType: "land",
    startTypeLabel: data.label,
    lastType: "land",
    lastTypeLabel: data.label,

    segments: []
  };
}

function actorHasEffect(actor, tag) {
  const needle = String(tag ?? "").toLowerCase();
  return (actor?.system?.effects?.active ?? []).some((effect) => {
    return String(effect?.tag ?? "").replace(/^\[|\]$/g, "").toLowerCase() === needle &&
      Number(effect?.remaining ?? effect?.duration ?? 1) > 0;
  });
}

function directionalEffectPenalty(actor, movement) {
  const origin = point(movement?.origin ?? {});
  const destination = point(movement?.destination ?? {});

  for (const effect of actor?.system?.effects?.active ?? []) {
    const tag = String(effect?.tag ?? "").replace(/^\[|\]$/g, "").toLowerCase();
    if (tag !== "fear" && tag !== "taunt") continue;

    const sourceToken = (canvas?.tokens?.placeables ?? []).find((token) => {
      return token.actor?.uuid === effect.sourceActorUuid ||
        token.actor?.id === effect.sourceActorUuid ||
        `Actor.${token.actor?.id}` === effect.sourceActorUuid;
    });
    if (!sourceToken) continue;

    const source = point(sourceToken.document ?? sourceToken);
    const before = Math.hypot(origin.x - source.x, origin.y - source.y);
    const after = Math.hypot(destination.x - source.x, destination.y - source.y);

    if (tag === "fear" && after < before) return 1;
    if (tag === "taunt" && after > before) return 1;
  }

  return 0;
}

async function applyBurnMovementDamage(actor, spaces, { unwilling = false } = {}) {
  const effects = actor?.system?.effects?.active ?? [];
  const burnEffect = effects.find((effect) => String(effect?.tag ?? "").replace(/^\[|\]$/g, "").toLowerCase() === "burn");
  if (!burnEffect) {
    return 0;
  }

  const damageEffectCount = effects.filter((effect) => {
    return ["burn", "freeze", "poison", "ruin"].includes(
      String(effect?.tag ?? "").replace(/^\[|\]$/g, "").toLowerCase()
    );
  }).length;
  const reduction = Math.max(0, damageEffectCount - 1) + Math.max(
    0,
    num(actor.system?.qualityFeatures?.naturewalk?.damageReduction?.burn)
  );
  const rawDamage = unwilling ? Math.floor(num(spaces) / 2) : Math.floor(num(spaces));
  let damage = Math.max(0, rawDamage - reduction);
  if (damage <= 0) return 0;

  const roundKey = `${game.combat?.id ?? "no-combat"}:${num(game.combat?.round)}`;
  const previousKey = String(actor.system?.combat?.effectDamageRoundKey ?? "");
  const previousDamage = previousKey === roundKey
    ? Math.max(0, num(actor.system?.combat?.effectDamageTakenThisRound))
    : 0;
  const cap = Math.max(0, num(actor.system?.stageValue) * 2);
  damage = Math.min(damage, Math.max(0, cap - previousDamage));
  if (damage <= 0) return 0;

  let burnSource = null;
  if (burnEffect.sourceActorUuid) {
    try {
      const document = await fromUuid(burnEffect.sourceActorUuid);
      burnSource = document?.documentName === "Token" ? document.actor : document;
    } catch (_error) {
      burnSource = null;
    }
  }
  const shining = await reduceEnemyUnalterableDamageWithShiningArmor(actor, damage, {
    unalterable: true,
    attacker: burnSource
  });
  damage = shining.damage;
  if (damage <= 0) return 0;

  const woundsPath = actor.type === "character"
    ? "system.derived.wounds.value"
    : "system.miscStats.wounds.value";
  const currentWounds = Math.max(0, num(foundry.utils.getProperty(actor, woundsPath)));

  await actor.update({
    [woundsPath]: Math.max(0, currentWounds - damage),
    "system.combat.effectDamageRoundKey": roundKey,
    "system.combat.effectDamageTakenThisRound": previousDamage + damage
  });

  return damage;
}


function normalizeTerrainElement(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function actorNaturewalkElements(actor) {
  return new Set(
    (actor?.system?.qualityFeatures?.naturewalk?.elements ?? [])
      .map(normalizeTerrainElement)
      .filter(Boolean)
  );
}

function activeSurfaceMobileArtilleryTemplates(actor) {
  const ignoredElements = actorNaturewalkElements(actor);

  return (canvas?.templates?.placeables ?? []).filter((template) => {
    const document = template?.document;
    const flag = document?.getFlag?.(scope(), MOBILE_ARTILLERY_TERRAIN_FLAG)
      ?? document?.flags?.[scope()]?.[MOBILE_ARTILLERY_TERRAIN_FLAG]
      ?? null;
    if (!flag?.active || flag.layer !== "surface") return false;
    return !ignoredElements.has(normalizeTerrainElement(flag.element));
  });
}

function templateContainsWorldPoint(template, worldPoint) {
  const document = template?.document;
  const shape = template?.shape ?? template?.object?.shape;
  if (!document || !shape?.contains) return false;

  const localX = num(worldPoint?.x) - num(document.x);
  const localY = num(worldPoint?.y) - num(document.y);

  try {
    return Boolean(shape.contains(localX, localY));
  } catch (_error) {
    return false;
  }
}

function movementPathPoints(document, movement) {
  const grid = Math.max(1, num(canvas?.grid?.size, 100));
  const centerOffset = {
    x: Math.max(0.5, num(document?.width, 1)) * grid / 2,
    y: Math.max(0.5, num(document?.height, 1)) * grid / 2
  };
  const center = (source = {}) => ({
    x: num(source.x) + centerOffset.x,
    y: num(source.y) + centerOffset.y
  });

  return [
    center(movement?.origin ?? document),
    ...(movement?.passed?.waypoints ?? []).map(center),
    center(movement?.destination ?? document)
  ];
}

/**
 * Estimate how many grid spaces of a Token's path are inside one or more
 * active Surface Mobile Artillery templates. Difficult Terrain adds one
 * additional Movement cost per affected Space; matching Naturewalk ignores it.
 */
function mobileArtilleryTerrainPenalty(document, movement, spaces) {
  const templates = activeSurfaceMobileArtilleryTemplates(document?.actor);
  if (!templates.length || spaces <= 0) return 0;

  const points = movementPathPoints(document, movement);
  const grid = Math.max(1, num(canvas?.grid?.size, 100));
  let totalLength = 0;
  let difficultLength = 0;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0) continue;

    const samples = Math.max(1, Math.ceil((length / grid) * 6));
    const sampleLength = length / samples;
    totalLength += length;

    for (let sample = 0; sample < samples; sample += 1) {
      const ratio = (sample + 0.5) / samples;
      const current = {
        x: from.x + (dx * ratio),
        y: from.y + (dy * ratio)
      };
      if (templates.some((template) => templateContainsWorldPoint(template, current))) {
        difficultLength += sampleLength;
      }
    }
  }

  if (totalLength <= 0 || difficultLength <= 0) return 0;
  const affectedSpaces = Number(spaces) * Math.min(1, difficultLength / totalLength);
  return Math.max(0, Math.min(Number(spaces), Math.ceil(affectedSpaces - 0.001)));
}

function utilityDomainTerrainPenalty(document, movement, spaces) {
  if (!document?.actor || spaces <= 0) return 0;
  const points = movementPathPoints(document, movement);
  const grid = Math.max(1, num(canvas?.grid?.size, 100));
  let totalLength = 0;
  let difficultLength = 0;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0) continue;
    const samples = Math.max(1, Math.ceil((length / grid) * 6));
    const sampleLength = length / samples;
    totalLength += length;
    for (let sample = 0; sample < samples; sample += 1) {
      const ratio = (sample + 0.5) / samples;
      const current = { x: from.x + dx * ratio, y: from.y + dy * ratio };
      if (getDomainMovementContext(document.actor, current)?.difficult) difficultLength += sampleLength;
    }
  }

  if (totalLength <= 0 || difficultLength <= 0) return 0;
  const affectedSpaces = Number(spaces) * Math.min(1, difficultLength / totalLength);
  return Math.max(0, Math.min(Number(spaces), Math.ceil(affectedSpaces - 0.001)));
}

function buildSegment(document, movement, spaces) {
  const inSentryStance = String(document?.actor?.system?.combat?.currentStance ?? "").toLowerCase() === "sentry";
  const evokerProtectorIgnoresDifficultTerrain = Boolean(
    document?.actor?.flags?.["digimon-digital-adventures"]?.evokerCreation?.kind === "minion" &&
    document?.actor?.flags?.["digimon-digital-adventures"]?.evokerCreation?.subtype === "protector"
  );
  const difficultMultiplier =
    !evokerProtectorIgnoresDifficultTerrain && (
      actorHasEffect(document?.actor, "paralyze") || inSentryStance
    )
      ? 2
      : 1;

  const directionalPenalty =
    directionalEffectPenalty(
      document?.actor,
      movement
    );

  const mobileArtilleryPenalty = evokerProtectorIgnoresDifficultTerrain
    ? 0
    : mobileArtilleryTerrainPenalty(document, movement, spaces);
  const domainTerrainPenalty = difficultMultiplier > 1
    || evokerProtectorIgnoresDifficultTerrain
    ? 0
    : utilityDomainTerrainPenalty(document, movement, spaces);
  const terrainPenalty = mobileArtilleryPenalty + domainTerrainPenalty;

  return {
    from: point(
      movement?.origin ??
      document
    ),

    to: point(
      movement?.destination ??
      document
    ),

    waypoints:
      (movement?.passed?.waypoints ?? [])
        .map((waypoint) => point(waypoint)),

    spaces,

    cost:
      spaces * difficultMultiplier +
      directionalPenalty +
      terrainPenalty,

    directionalPenalty,
    terrainPenalty,
    mobileArtilleryPenalty,
    domainTerrainPenalty,
    sentryDifficultTerrain: inSentryStance,

    type: "land",

    typeLabel:
      i18n(
        "Terrestre",
        "Land"
      )
  };
}

function queueAutomaticMove(document, movement) {
  const actor = document?.actor;
  const combat = game.combat;
  const combatant = getCombatant(combat, document);

  if (!actor || !combat || !combatant) {
    return false;
  }

  const data = landMovementData(actor);

  if (!data.enabled || data.total <= 0) {
    warn(i18n(
      "Esse participante não possui Movimento terrestre disponível.",
      "This participant does not have Land Movement available."
    ));

    return false;
  }

  const spaces = moveSpaces(movement);

  if (spaces <= 0) {
    return true;
  }

  let session = getSession(document);
  let startsNew = !isCurrentActiveMove(
    session,
    combat,
    combatant
  );

  if (startsNew) {
    pruneOrphanedActionReservation(actor);

    const actions = Math.max(
      0,
      num(actor.system?.combat?.actions?.value)
    );

    const availableActions = actions -
      getReservedActions(actor);

    if (availableActions < 1) {
      warn(i18n(
        "Esse participante não possui Ações suficientes para se mover.",
        "This participant does not have enough Actions to move."
      ));

      return false;
    }

    session = createAutomaticSession(
      document,
      combat,
      combatant,
      data
    );

    reserveAction(actor);
  } else {
    session = clone(session);
  }

  const segment = buildSegment(document, movement, spaces);
  if (session.directionalPenaltyApplied && segment.directionalPenalty) {
    segment.cost -= segment.directionalPenalty;
    segment.directionalPenalty = 0;
  }
  const remaining = Math.max(
    0,
    num(session.max) - num(session.spent)
  );

  if (segment.cost > remaining) {
    if (startsNew) {
      releaseActionReservation(
        session.actionReservationKey
      );
    }

    warn(i18n(
      `Movimento insuficiente: faltam ${remaining} Espaços.`,
      `Not enough Movement: ${remaining} Spaces remain.`
    ));

    return false;
  }

  const next = clone(session);

  next.segments = [
    ...(next.segments ?? []),
    segment
  ];

  next.spent = num(next.spent) + segment.cost;
  next.directionalPenaltyApplied = Boolean(
    session.directionalPenaltyApplied || segment.directionalPenalty
  );
  next.lastType = "land";
  next.lastTypeLabel = data.label;

  runtimeSessions.set(document.id, next);

  pendingMoves.set(document.id, {
    session: next,
    startsNew,
    reservationKey: startsNew
      ? next.actionReservationKey
      : ""
  });

  return true;
}

function findTokenDocumentForActor(actor) {
  if (!actor) return null;

  const controlled = canvas.tokens?.controlled ?? [];
  const controlledMatch = controlled.find((token) => sameActor(token.actor, actor));
  if (controlledMatch?.document) return controlledMatch.document;

  const placeables = canvas.tokens?.placeables ?? [];
  const sceneMatch = placeables.find((token) => sameActor(token.actor, actor));

  return sceneMatch?.document ?? null;
}

function isGrantedMovementSession(session, combat) {
  if (!session || session.state !== "active") return false;
  if (!["granted", "charge-approach", "paid-action", "gm-unrestricted"].includes(session.kind)) return false;

  if (!combat?.started) return true;

  return (
    (!session.combatId || session.combatId === combat.id) &&
    num(session.round, -1) === num(combat.round, -2) &&
    num(session.turn, -1) === num(combat.turn, -2)
  );
}

function queueGrantedMove(document, movement, session) {
  const spaces = moveSpaces(movement);

  if (spaces <= 0) return true;

  const segment = buildSegment(document, movement, spaces);
  if (session.directionalPenaltyApplied && segment.directionalPenalty) {
    segment.cost -= segment.directionalPenalty;
    segment.directionalPenalty = 0;
  }
  const remaining = Math.max(
    0,
    num(session.max) - num(session.spent)
  );

  if (!session.unrestricted && segment.cost > remaining) {
    warn(i18n(
      `Reposicionamento insuficiente: restam ${remaining} Espaços.`,
      `Not enough Reposition movement: ${remaining} Spaces remain.`
    ));

    return false;
  }

  const next = clone(session);

  next.segments = [
    ...(next.segments ?? []),
    segment
  ];

  next.spent =
    num(next.spent) +
    segment.cost;
  next.directionalPenaltyApplied = Boolean(
    session.directionalPenaltyApplied ||
    segment.directionalPenalty
  );

  if (
    next.source === "charge" &&
    !isStraightLineSession(next)
  ) {
    warn(i18n(
      "O Movimento de [CHARGE] deve seguir em linha reta, sem retornar pelo trajeto.",
      "[CHARGE] Movement must follow a straight line without backtracking."
    ));

    return false;
  }

  if (next.kind === "charge-approach") {
    const targetToken = canvas.tokens?.get(next.targetTokenId);

    if (!targetToken) {
      warn(i18n(
        "O alvo de [CHARGE] não está mais disponível.",
        "The [CHARGE] target is no longer available."
      ));
      return false;
    }

    const targetCenter = targetToken.center;
    const from = segment.from;
    const to = segment.to;
    const gridSize = Math.max(1, num(canvas.grid?.size, 100));
    const width = num(document.width, 1) * gridSize;
    const height = num(document.height, 1) * gridSize;
    const fromCenter = { x: from.x + width / 2, y: from.y + height / 2 };
    const toCenter = { x: to.x + width / 2, y: to.y + height / 2 };
    const before = Math.hypot(fromCenter.x - targetCenter.x, fromCenter.y - targetCenter.y);
    const after = Math.hypot(toCenter.x - targetCenter.x, toCenter.y - targetCenter.y);

    if (after >= before - 1) {
      warn(i18n(
        "O Movimento de [CHARGE] precisa aproximar o Digimon do alvo.",
        "[CHARGE] Movement must bring the Digimon closer to its target."
      ));
      return false;
    }
  }

  /*
   * An exhausted granted movement session must
   * become complete instead of remaining active
   * forever with zero spaces.
   */
  if (
    !next.unrestricted &&
    next.spent >=
    num(next.max) &&
    next.kind !== "charge-approach"
  ) {
    next.spent =
      num(next.max);

    next.state =
      "complete";
  }

  next.lastType =
    "land";

  next.lastTypeLabel =
    dataLabel(next);

  runtimeSessions.set(document.id, next);

  pendingMoves.set(document.id, {
    session: next,
    startsNew: false,
    reservationKey: ""
  });

  return true;
}

function dataLabel(session) {
  return String(
    session?.lastTypeLabel ??
    session?.label ??
    i18n("Reposicionar", "Reposition")
  );
}

async function grantMovement(actor, spaces, options = {}) {
  const maximum = Math.max(0, num(spaces));

  if (!supported(actor) || maximum <= 0) {
    return false;
  }

  const document = findTokenDocumentForActor(actor);

  if (!document) {
    return false;
  }

  const combat = game.combat;
  const combatant = getCombatant(combat, document);
  const label = String(
    options.label ??
    i18n("Reposicionar", "Reposition")
  );

  const session = {
    version: 5,
    kind: String(options.kind ?? "granted"),
    state: "active",

    combatId: combat?.id ?? "",
    combatantId: combatant?.id ?? "",
    round: num(combat?.round),
    turn: num(combat?.turn, -1),

    actionCost: Math.max(0, num(options.actionCost)),
    actionSpent: true,
    actionReservationKey: "",

    start: point(document),
    max: maximum,
    spent: 0,

    startType: "land",
    startTypeLabel: label,
    lastType: "land",
    lastTypeLabel: label,

    source: String(options.source ?? "grantedMovement"),
    sourceActorUuid: String(options.sourceActorUuid ?? ""),
    sourceActorName: String(options.sourceActorName ?? ""),
    difficultTerrain: Boolean(options.difficultTerrain),
    unrestricted: Boolean(options.unrestricted),

    attackItemUuid: String(options.attackItemUuid ?? ""),
    targetTokenId: String(options.targetTokenId ?? ""),
    targetSceneId: String(options.targetSceneId ?? canvas?.scene?.id ?? ""),
    attackReach: Math.max(1, num(options.attackReach, 1)),
    sprintQualityId: String(options.sprintQualityId ?? ""),
    initialTargetDistance: Math.max(0, num(options.initialTargetDistance, 0)),

    segments: []
  };

  await setSession(document, session);
  refreshTracker(document);

  return true;
}

async function grantUnrestrictedMovement(actor, options = {}) {
  const baseline = Math.max(
    1,
    num(
      actor?.system?.derived?.movement?.value ??
      actor?.system?.movement?.land?.total ??
      actor?.system?.movement?.land?.value ??
      actor?.system?.miscStats?.movement?.total ??
      actor?.system?.miscStats?.movement?.value ??
      actor?.system?.miscStats?.movement?.base,
      1
    )
  );

  return grantMovement(actor, baseline, {
    ...options,
    kind: "gm-unrestricted",
    source: "gmUnrestrictedMovement",
    actionCost: 0,
    unrestricted: true,
    label: String(
      options.label ??
      i18n("Movimento livre do Mestre", "GM unrestricted movement")
    )
  });
}

async function clearMovementForActor(actor) {
  const document = findTokenDocumentForActor(actor);
  if (!document) return false;
  return clearMovementSession(document);
}

function getChargeMovementCapacity(actor, bonusSpaces = 0, multiplier = 1) {
  const movement = landMovementData(actor);

  if (!movement.enabled) return 0;

  return Math.max(
    0,
    (num(movement.total) + Math.max(0, num(bonusSpaces))) *
      Math.max(1, num(multiplier, 1))
  );
}

function hasActiveMovementSession(actor) {
  const document = findTokenDocumentForActor(actor);
  return Boolean(document && getSession(document)?.state === "active");
}

/**
 * Return the current tracked Movement spent by an Actor in spaces.
 * Completed [CHARGE] sessions remain readable until the Attack finalizes,
 * allowing combat Qualities such as Hit and Run to use the actual path.
 */
export function getCurrentMovementSpent(actor) {
  const document = findTokenDocumentForActor(actor);
  const session = document ? getSession(document) : null;
  return Math.max(0, num(session?.spent));
}

export function getCurrentMovementSession(actor) {
  const document = findTokenDocumentForActor(actor);
  const session = document ? getSession(document) : null;
  return session ? clone(session) : null;
}

function hasActiveChargeApproach(actor) {
  const document = findTokenDocumentForActor(actor);
  const session = document ? getSession(document) : null;
  return Boolean(session?.state === "active" && session.kind === "charge-approach");
}

async function beginChargeApproach(actor, options = {}) {
  if (!supported(actor)) return false;

  const document = findTokenDocumentForActor(actor);
  const combat = game.combat;
  const combatant = document ? getCombatant(combat, document) : null;
  const maximum = Math.max(0, num(options.maximum));

  if (!document || !combatant || maximum <= 0) return false;
  if (!getActiveDDAUnitContext(actor, combat).allowed) return false;

  if (getSession(document)?.state === "active") {
    warn(i18n(
      "Encerre ou cancele o Movimento atual antes de iniciar outro [CHARGE].",
      "Finish or cancel the current Movement before starting another [CHARGE]."
    ));
    return false;
  }

  const actions = Math.max(0, num(actor.system?.combat?.actions?.value));

  if (actions < 1) {
    warn(i18n(
      "Esse Digimon não possui Ações suficientes para iniciar [CHARGE].",
      "This Digimon does not have enough Actions to begin [CHARGE]."
    ));
    return false;
  }

  const previousMovementActions = Math.max(
    0,
    num(actor.system?.combat?.movementActionsThisTurn)
  );

  await actor.update({
    "system.combat.actions.value": actions - 1,
    "system.combat.movementActionsThisTurn": previousMovementActions + 1
  }, {
    ddaChargeAttackAction: true,
    ddaMovementAutoStart: true
  });

  const granted = await grantMovement(actor, maximum, {
    kind: "charge-approach",
    actionCost: 1,
    label: "[CHARGE]",
    source: "charge",
    sourceActorUuid: actor.uuid,
    sourceActorName: actor.name,
    attackItemUuid: options.attackItemUuid,
    targetTokenId: options.targetTokenId,
    targetSceneId: options.targetSceneId,
    attackReach: options.attackReach,
    sprintQualityId: options.sprintQualityId,
    initialTargetDistance: options.initialTargetDistance
  });

  if (!granted) {
    await actor.update({
      "system.combat.actions.value": actions,
      "system.combat.movementActionsThisTurn": previousMovementActions
    }, {
      ddaChargeAttackAction: true,
      ddaMovementAutoStart: true
    });
    return false;
  }

  refreshTokenHud(document);
  return true;
}

async function beginActionMovement(actor, options = {}) {
  if (!supported(actor)) return false;

  const document = findTokenDocumentForActor(actor);
  const combat = game.combat;
  const actionCost = Math.max(1, Math.floor(num(options.actionCost, 1)));
  const maximum = Math.max(0, num(options.maximum, landMovementData(actor).total));

  if (!document || maximum <= 0) {
    warn(i18n(
      "Este token não possui Movimento terrestre disponível.",
      "This token has no Land Movement available."
    ));
    return false;
  }

  const evokerCommandedMinion = Boolean(
    actor.flags?.["digimon-digital-adventures"]?.evokerCreation?.kind === "minion" &&
    actor.system?.combat?.evokerCommand?.roundSignature
  );
  if (!evokerCommandedMinion && !getActiveDDAUnitContext(actor, combat).allowed) {
    warn(i18n(
      "Este Digimon não pode agir nesta ativação.",
      "This Digimon cannot act during this activation."
    ));
    return false;
  }

  if (getSession(document)?.state === "active") {
    warn(i18n(
      "Conclua ou cancele o Movimento atual antes de iniciar outro.",
      "Finish or cancel the current Movement before starting another one."
    ));
    return false;
  }

  const actions = Math.max(0, num(actor.system?.combat?.actions?.value));

  const previousMovementActions = Math.max(
    0,
    num(actor.system?.combat?.movementActionsThisTurn)
  );

  const payment = await spendActorActions(actor, actionCost, {
    requireActiveUnit: !evokerCommandedMinion,
    lightDigizoidAction: actionCost > 1 ? "difficultMove" : "move",
    additionalUpdates: {
      "system.combat.movementActionsThisTurn": previousMovementActions + 1
    }
  });
  if (!payment) return false;

  const granted = await grantMovement(actor, maximum, {
    kind: "paid-action",
    actionCost,
    label: options.label ?? i18n("Mover", "Move"),
    source: options.source ?? "digimonActionMove",
    sourceActorUuid: actor.uuid,
    sourceActorName: actor.name,
    difficultTerrain: Boolean(options.difficultTerrain)
  });

  if (!granted) {
    await actor.update({
      "system.combat.actions.value": actions,
      "system.combat.movementActionsThisTurn": previousMovementActions
    }, { ddaMovementAutoStart: true });
    if (payment.lightReserveSpent > 0) {
      await refundLightDigizoidActionReserve(actor, payment.lightReserveSpent);
    }
    return false;
  }

  refreshTokenHud(document);
  return true;
}

function isChargeApproachReady(actor, {
  attackItemUuid = "",
  targetTokenId = ""
} = {}) {
  const document = findTokenDocumentForActor(actor);
  const session = document ? getSession(document) : null;

  if (!document || session?.kind !== "charge-approach") return false;
  if (session.state !== "active") return false;

  if (
    attackItemUuid &&
    String(session.attackItemUuid ?? "") !== String(attackItemUuid)
  ) {
    return false;
  }

  if (
    targetTokenId &&
    String(session.targetTokenId ?? "") !== String(targetTokenId)
  ) {
    return false;
  }

  return true;
}

function canCombineChargeWithCurrentMove(actor) {
  const document =
    findTokenDocumentForActor(actor);

  const session =
    document
      ? getSession(document)
      : null;

  const combat =
    game.combat;

  const combatant =
    document
      ? getCombatant(combat, document)
      : null;

  return Boolean(
    document &&
    combat?.started &&
    combatant &&
    getActiveDDAUnitContext(actor, combat).allowed &&
    session?.state === "active" &&
    session.combatId === combat.id &&
    session.combatantId === combatant.id &&
    num(session.round, -1) ===
      num(combat.round, -2) &&
    session.kind !== "granted" &&
    session.actionSpent &&
    num(session.spent) > 0 &&
    isStraightLineSession(session)
  );
}

async function completeChargeMovementBeforeAttack(actor) {
  const document = findTokenDocumentForActor(actor);
  const currentSession = document ? getSession(document) : null;
  const isApproach = currentSession?.kind === "charge-approach" &&
    currentSession?.state === "active";

  if (!isApproach && !canCombineChargeWithCurrentMove(actor)) {
    return false;
  }

  const session =
    clone(getSession(document));

  session.state = "complete";
  session.kind = "charge-combined";
  session.source = "charge";
  session.chargeAttackUsed = true;

  await setSession(
    document,
    session
  );

  refreshTracker(document);
  refreshTokenHud(document);

  return true;
}

async function grantChargeMovement(
  actor,
  bonusSpaces = 0
) {
  const movement =
    landMovementData(actor);

  const maximum = Math.max(
    0,

    num(movement.total) +
    Math.max(
      0,
      num(bonusSpaces)
    )
  );

  if (
    !movement.enabled ||
    maximum <= 0
  ) {
    return false;
  }

  return grantMovement(
    actor,
    maximum,
    {
      label: "[CHARGE]",
      source: "charge",
      sourceActorUuid: actor.uuid,
      sourceActorName: actor.name
    }
  );
}

function onPreMove(document, movement, operation = {}) {
  if (operation.ddaMovementUndo) return;
  if (!supported(document?.actor)) return;

  /*
   * Se uma chamada anterior de preMove não produziu
   * updateToken, ela deixou uma tentativa incompleta.
   *
   * A reserva e o trajeto fantasma são removidos
   * antes de processar a nova tentativa.
   */
  discardPendingMove(document);

  const grantedSession =
    getSession(document);

  if (isGrantedMovementSession(grantedSession, game.combat)) {
    return queueGrantedMove(document, movement, grantedSession)
      ? undefined
      : false;
  }

  if (!game.combat?.started) return;

  const combatant = getCombatant(game.combat, document);

  // Tokens fora do Combate permanecem livres.
  if (!combatant) return;

  const activeUnitContext = getActiveDDAUnitContext(
    document.actor,
    game.combat
  );

  if (!activeUnitContext.allowed) {
    warn(i18n(
      activeUnitContext.ended
        ? "Esse participante já encerrou sua parte desta ativação."
        : "Apenas integrantes da unidade ativa podem se mover agora.",
      activeUnitContext.ended
        ? "This participant has already ended their part of this activation."
        : "Only members of the active unit can move right now."
    ));

    return false;
  }

  return queueAutomaticMove(document, movement)
    ? undefined
    : false;
}

async function spendReservedMovementAction(
  actor,
  reservationKey
) {
  try {
    await enqueueActorUpdate(actor, async () => {
      const actions = Math.max(
        0,
        num(actor.system?.combat?.actions?.value)
      );

      if (actions < 1) {
        throw new Error(
          "No Actions remained when Movement was committed."
        );
      }

      await actor.update(
        {
          "system.combat.actions.value": actions - 1,
          "system.combat.movementActionsThisTurn":
            Math.max(0, num(actor.system?.combat?.movementActionsThisTurn)) + 1
        },
        {
          ddaMovementAutoStart: true
        }
      );
    });

    return true;
  } catch (error) {
    console.error(
      "DDA | Could not spend the automatic Move Action.",
      error
    );

    warn(i18n(
      "O token se moveu, mas não foi possível gastar a Ação de Movimento. Verifique a ficha.",
      "The token moved, but the Move Action could not be spent. Check the sheet."
    ));

    return false;
  } finally {
    releaseActionReservation(reservationKey);
  }
}

async function onUpdateToken(document, changed) {
  const moved =
    "x" in changed ||
    "y" in changed ||
    "elevation" in changed;

  const pending = pendingMoves.get(document.id);

  if (pending && moved) {
    pendingMoves.delete(document.id);

    const { session, startsNew, reservationKey } = pending;

    if (startsNew) {
      const spent = await spendReservedMovementAction(
        document.actor,
        reservationKey
      );

      session.actionSpent = spent;
    }

    runtimeSessions.set(document.id, session);

    await setSession(document, session);
    refreshTracker(document);
    refreshTokenHud(document);

    const lastSegment = session.segments?.at?.(-1);
    if (lastSegment?.spaces > 0) {
      await applyBurnMovementDamage(document.actor, lastSegment.spaces);
    }

    return;
  }

  if (moved || getSession(document)) {
    refreshTracker(document);
  }
}

async function finishMove(document) {
  discardPendingMove(document);

  const session =
    getSession(document);

  if (!document || !session || session.state !== "active") {
    return false;
  }

  const complete = clone(session);
  complete.state = "complete";

  await setSession(document, complete);
  refreshTracker(document);

  return true;
}

async function clearMovementSession(document) {
  if (!document) return false;

  const pending = pendingMoves.get(document.id);

  if (pending?.reservationKey) {
    releaseActionReservation(
      pending.reservationKey
    );
  }

  pendingMoves.delete(document.id);

  await unsetSession(document);

  clearTracker(
    tokenObject(document)
  );

  return true;
}

async function resetMovementSession(document) {
  if (!document) return false;

  const session = getSession(document);
  if (!session || session.state !== "active") return false;

  const start = session.start ?? {};
  await document.update({
    x: num(start.x, document.x),
    y: num(start.y, document.y),
    elevation: num(start.elevation, document.elevation)
  }, {
    ddaMovementUndo: true
  });

  if (session.actionSpent && session.kind !== "granted" && document.actor) {
    const actor = document.actor;
    const current = Math.max(0, num(actor.system?.combat?.actions?.value));
    const refund = Math.max(0, num(session.actionCost, 1));
    const maximum = Math.max(current, num(actor.system?.combat?.actions?.max, current + refund));
    const movementActions = Math.max(0, num(actor.system?.combat?.movementActionsThisTurn));
    await actor.update({
      "system.combat.actions.value": Math.min(maximum, current + refund),
      "system.combat.movementActionsThisTurn": Math.max(0, movementActions - 1)
    }, {
      ddaMovementAutoStart: true
    });
  }

  if (
    session.kind === "charge-approach" &&
    session.sprintQualityId &&
    document.actor
  ) {
    const quality = document.actor.items?.get(session.sprintQualityId);

    if (quality) {
      const currentValue = Math.max(0, num(quality.system?.uses?.value));
      const maximum = Math.max(currentValue, num(quality.system?.uses?.max, 1));
      const spent = Math.max(0, num(quality.system?.uses?.spent));

      await document.actor.updateEmbeddedDocuments("Item", [{
        _id: quality.id,
        "system.uses.value": Math.min(maximum, currentValue + 1),
        "system.uses.spent": Math.max(0, spent - 1)
      }]);
    }
  }

  return clearMovementSession(document);
}

async function closeForeignMoves(combat) {
  if (!combat?.started) return;

  const activeUnitId = getCombatantUnitId(combat.combatant);
  const activeCombatantId = combat.combatant?.id ?? "";

  for (const document of canvas.scene?.tokens ?? []) {
    const session = getSession(document);

    if (
      session?.state !== "active" ||
      session.combatId !== combat.id
    ) {
      continue;
    }

    const combatant = getCombatant(combat, document);

    const combatantUnitId = getCombatantUnitId(combatant);
    const belongsToActiveUnit = activeUnitId
      ? combatantUnitId === activeUnitId
      : combatant?.id === activeCombatantId;

    if (!belongsToActiveUnit) {
      await finishMove(document);
    }
  }
}

async function closeMovesAfterAnotherAction(
  actor,
  changed,
  options = {}
) {
  const actionChanged =
    foundry.utils.getProperty(
      changed,
      "system.combat.actions.value"
    ) !== undefined ||
    "system.combat.actions.value" in changed;

  if (
    !actionChanged ||
    options.ddaMovementAutoStart ||
    options.ddaChargeAttackAction ||
    !canvas.scene
  ) {
    return;
  }

  for (const document of canvas.scene.tokens) {
    if (!sameActor(document.actor, actor)) continue;

    if (getSession(document)?.state === "active") {
      await finishMove(document);
    }
  }
}

function getHudRoot(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return document.querySelector("#token-hud");
}

function getMovementHudToken(hud) {
  const candidate =
    hud?.object ??
    hud?.token ??
    canvas.tokens?.hud?.object ??
    null;

  if (!candidate) return null;

  if (candidate.document) {
    return candidate;
  }

  return canvas.tokens?.get(
    candidate.id
  ) ?? null;
}

function createMovementHudButton({
  icon,
  label,
  className,
  disabled = false,
  onClick
}) {
  const button =
    document.createElement("button");

  button.type = "button";

  button.className = [
    "control-icon",
    "dda-movement-hud-controls",
    className
  ]
    .filter(Boolean)
    .join(" ");

  button.title = label;
  button.dataset.tooltip = label;
  button.disabled = Boolean(disabled);

  button.innerHTML = `
    <i class="${icon}"></i>
  `;

  button.addEventListener(
    "click",
    async (event) => {
      event.preventDefault();
      event.stopPropagation();

      button.disabled = true;

      try {
        await onClick(button);
      } finally {
        button.disabled = false;
      }
    }
  );

  return button;
}

function renderMovementHud(hud, html) {
  const root = getHudRoot(html);

  if (!root) return;

  for (
    const oldControl of
    root.querySelectorAll(
      ".dda-movement-hud-controls"
    )
  ) {
    oldControl.remove();
  }

  const token =
    getMovementHudToken(hud);

  const tokenDocument =
    token?.document;

  if (!tokenDocument) return;

  const session =
    getSession(tokenDocument);

  if (!session) return;

  const mayControl =
    game.user.isGM ||
    tokenDocument.isOwner;

  if (!mayControl) return;

  const rightColumn =
    root.querySelector(".col.right") ??
    root.querySelector(".right");

  if (!rightColumn) return;

  if (session.state === "active" && session.kind !== "charge-approach") {
    const finishButton =
      createMovementHudButton({
        icon: "fas fa-flag-checkered",

        label: i18n(
          "Encerrar Movimento",
          "Finish Movement"
        ),

        className:
          "dda-finish-movement",

        onClick: async (button) => {
          const finished =
            await finishMove(
              tokenDocument
            );

          if (!finished) return;

          ui.notifications.info(
            i18n(
              "O Movimento atual foi encerrado.",
              "The current Movement was finished."
            )
          );

          button.remove();
        }
      });

    rightColumn.append(
      finishButton
    );
  }

  if (session.state === "active" && session.kind === "charge-approach") {
    const chargeButton = createMovementHudButton({
      icon: "fas fa-person-running",
      label: i18n(
        "Concluir [CHARGE] e atacar",
        "Complete [CHARGE] and attack"
      ),
      className: "dda-complete-charge",
      onClick: async () => {
        const currentSession = getSession(tokenDocument);
        const targetToken = canvas.tokens?.get(currentSession?.targetTokenId);
        const attackItem = currentSession?.attackItemUuid
          ? await fromUuid(currentSession.attackItemUuid)
          : null;

        if (!targetToken || !attackItem) {
          warn(i18n(
            "Não foi possível recuperar o alvo ou o ataque deste [CHARGE]. Cancele o Movimento e tente novamente.",
            "The target or attack for this [CHARGE] could not be recovered. Cancel the Movement and try again."
          ));
          return;
        }

        const { rollAttack } = await import("../rolls/attack-roll.js");

        await rollAttack(tokenDocument.actor, attackItem, {
          targetToken,
          chargeApproachCommit: true
        });
      }
    });

    rightColumn.append(chargeButton);
  }

  if (session.state === "active") {
    const resetButton =
      createMovementHudButton({
        icon: "fas fa-rotate-left",

        label: i18n(
          "Resetar Rastreador de Movimento",
          "Reset Movement Tracker"
        ),

        className:
          "dda-reset-movement",

        onClick: async () => {
          await resetMovementSession(
            tokenDocument
          );

          for (
            const control of
            root.querySelectorAll(
              ".dda-movement-hud-controls"
            )
          ) {
            control.remove();
          }

          ui.notifications.info(
            i18n(
              "O Movimento foi cancelado, o token voltou ao início e a Ação foi devolvida quando aplicável.",
              "Movement was cancelled, the token returned to its start, and its Action was refunded when applicable."
            )
          );
        }
      });

    rightColumn.append(
      resetButton
    );
  }
}

function selectedToken() {
  const tokens = canvas.tokens?.controlled ?? [];

  if (tokens.length === 1) {
    return tokens[0];
  }

  warn(i18n(
    "Selecione exatamente um Token.",
    "Select exactly one Token."
  ));

  return null;
}

export function registerMovementTracker() {
  Hooks.on("preMoveToken", onPreMove);
  Hooks.on("updateToken", onUpdateToken);

  Hooks.on("updateCombat", (combat, changed) => {
    if ("turn" in changed || "round" in changed) {
      void closeForeignMoves(combat);
    }
  });

  Hooks.on(
    "updateActor",
    closeMovesAfterAnotherAction
  );

  Hooks.on(
  "renderTokenHUD",
  renderMovementHud
);

  Hooks.on("deleteToken", (document) => {
    const pending = pendingMoves.get(document.id);

    if (pending?.reservationKey) {
      releaseActionReservation(
        pending.reservationKey
      );
    }

    pendingMoves.delete(document.id);
    runtimeSessions.delete(document.id);

    clearTracker(tokenObject(document));
  });

  Hooks.on("canvasReady", () => {
    runtimeSessions.clear();
    pendingMoves.clear();
    actionReservations.clear();
    actorUpdateQueues.clear();

    window.setTimeout(() => {
      for (const token of canvas.tokens?.placeables ?? []) {
        refreshTracker(token.document);
      }
    }, 0);
  });

  game.dda ??= {};

  game.dda.movementTracker = {
    grantMovement,
    grantUnrestrictedMovement,
    clearForActor: clearMovementForActor,
    beginActionMovement,
    grantChargeMovement,
    getChargeMovementCapacity,
    hasActiveMovementSession,
    getCurrentMovementSpent,
    getCurrentMovementSession,
    hasActiveChargeApproach,
    beginChargeApproach,
    isChargeApproachReady,
    canCombineChargeWithCurrentMove,
    completeChargeMovementBeforeAttack,

    clearSelected: async () => {
      const token = selectedToken();

      if (!token) return false;

      return clearMovementSession(
        token.document
      );
    },

    clearAll: async () => {
      for (const token of canvas.tokens?.placeables ?? []) {
        await clearMovementSession(
          token.document
        );
      }

      actionReservations.clear();
      actorUpdateQueues.clear();

      return true;
    },

    finishForToken: finishMove
  };

  console.log(
    "DDA | Automatic Movement Tracker registered."
  );
}
