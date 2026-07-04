const DDA_MOVEMENT_FLAG = "movementTracker";
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

function landMovementData(actor) {
  const land = actor?.system?.movementTypes?.land;

  if (!land) {
    return {
      key: "land",
      label: i18n("Terrestre", "Land"),
      enabled: true,
      total: Math.max(0, num(
        actor?.system?.miscStats?.movement?.total ??
        actor?.system?.miscStats?.movement?.value
      ))
    };
  }

  return {
    key: "land",
    label: String(
      land.displayLabel ??
      land.label ??
      i18n("Terrestre", "Land")
    ),
    enabled: Boolean(land.enabled),
    total: Math.max(0, num(land.total))
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

function movementColor(spent, max) {
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

  const color = movementColor(spent, max);

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

  const displayMax = Number.isInteger(max)
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
  return Math.max(
    0,
    num(actionReservations.get(actorKey(actor)))
  );
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

function buildSegment(document, movement, spaces) {
  return {
    from: point(movement?.origin ?? document),
    to: point(movement?.destination ?? document),
    spaces,
    cost: spaces,
    type: "land",
    typeLabel: i18n("Terrestre", "Land")
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

  const remaining = Math.max(
    0,
    num(session.max) - num(session.spent)
  );

  if (spaces > remaining) {
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

  const segment = buildSegment(
    document,
    movement,
    spaces
  );

  const next = clone(session);

  next.segments = [
    ...(next.segments ?? []),
    segment
  ];

  next.spent = num(next.spent) + segment.cost;
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

function onPreMove(document, movement, operation = {}) {
  if (operation.ddaMovementUndo) return;
  if (!supported(document?.actor)) return;
  if (!game.combat?.started) return;

  const combatant = getCombatant(game.combat, document);

  // Tokens fora do Combate permanecem livres.
  if (!combatant) return;

  if (game.combat.combatant?.id !== combatant.id) {
    warn(i18n(
      "Apenas o participante ativo pode se mover agora.",
      "Only the active participant can move right now."
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
          "system.combat.actions.value": actions - 1
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

    return;
  }

  if (moved || getSession(document)) {
    refreshTracker(document);
  }
}

async function finishMove(document) {
  const session = getSession(document);

  if (!document || !session || session.state !== "active") {
    return false;
  }

  const complete = clone(session);
  complete.state = "complete";

  await setSession(document, complete);
  refreshTracker(document);

  return true;
}

async function closeForeignMoves(combat) {
  if (!combat?.started) return;

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

    if (combatant?.id !== activeCombatantId) {
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

function removeLegacyMovementHud(hud, html) {
  const root = getHudRoot(html);

  root?.querySelector(
    ".dda-movement-hud-controls"
  )?.remove();
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

  Hooks.on("renderTokenHUD", removeLegacyMovementHud);

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
    clearSelected: async () => {
      const token = selectedToken();

      if (!token) return false;

      await unsetSession(token.document);
      clearTracker(token);

      return true;
    },

    clearAll: () => {
      for (const token of canvas.tokens?.placeables ?? []) {
        clearTracker(token);
      }
    },

    finishForToken: finishMove
  };

  console.log(
    "DDA | Automatic Movement Tracker registered."
  );
}
