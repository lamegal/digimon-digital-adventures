const SYSTEM_ID = "digimon-digital-adventures";
const FLAG_ROOT = "initiative";
const RUNTIME_KEY = "__ddaInitiativeTrackerRuntimeV10";

function text(pt, en) {
  return String(game?.i18n?.lang ?? "").toLowerCase().startsWith("en") ? en : pt;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getFlag(combatant, key, fallback = null) {
  return combatant?.getFlag?.(SYSTEM_ID, `${FLAG_ROOT}.${key}`) ?? fallback;
}

function normalizeSide(value, fallback = "") {
  const side = String(value ?? "").trim().toLowerCase();
  if (["enemies", "enemy", "hostile", "opponent", "opponents"].includes(side)) return "enemies";
  if (["players", "player", "ally", "allies", "friendly", "friend"].includes(side)) return "players";
  return fallback;
}

function unitIdOf(combatant) {
  return String(getFlag(combatant, "unitId", "") ?? "").trim();
}

function roleOf(combatant) {
  return String(getFlag(combatant, "role", "solo") ?? "solo").trim();
}

function tokenDocumentOf(combatant) {
  if (combatant?.token?.documentName === "Token") return combatant.token;
  if (combatant?.token?.document?.documentName === "Token") return combatant.token.document;

  const scene = combatant?.combat?.scene ?? canvas?.scene ?? null;
  const tokenId = String(combatant?.tokenId ?? combatant?.token?.id ?? "");
  return scene?.tokens?.get?.(tokenId)
    ?? canvas?.tokens?.get?.(tokenId)?.document
    ?? null;
}

function actorIsEnemy(actor) {
  if (!actor) return false;
  return Boolean(
    actor.system?.enemy?.isEnemy === true ||
    actor.getFlag?.(SYSTEM_ID, "enemyNpc")?.isEnemy === true
  );
}

function sideOfCombatant(combatant) {
  const actor = combatant?.actor;
  const token = tokenDocumentOf(combatant);
  const disposition = Number(
    token?.disposition
      ?? combatant?.token?.disposition
      ?? combatant?.token?.document?.disposition
      ?? actor?.prototypeToken?.disposition
      ?? NaN
  );

  // Scene Token disposition is authoritative whenever it is explicitly set.
  if (disposition === -1 || disposition === CONST.TOKEN_DISPOSITIONS?.HOSTILE) return "enemies";
  if (disposition === 1 || disposition === CONST.TOKEN_DISPOSITIONS?.FRIENDLY) return "players";

  // Enemy-Wizard metadata is the next strongest signal.
  if (actorIsEnemy(actor)) return "enemies";

  // Accept both the current plural values and old singular values which may
  // still exist in Combatant flags from earlier beta builds.
  const stored = normalizeSide(getFlag(combatant, "side", ""));
  if (stored) return stored;

  const configured = normalizeSide(actor?.system?.combat?.initiative?.side);
  if (configured) return configured;

  // Final fallback for legacy Actors with no explicit allegiance metadata.
  if (actor?.type === "npc") return "enemies";
  return "players";
}

function primaryMember(unit) {
  return unit.members.find((c) => roleOf(c) === "digimon")
    ?? unit.members.find((c) => roleOf(c) === "solo")
    ?? unit.members[0]
    ?? null;
}

function sideOfUnit(unit) {
  const tamer = unit.members.find((c) => roleOf(c) === "tamer");
  if (tamer) return sideOfCombatant(tamer);
  return sideOfCombatant(primaryMember(unit));
}

function ramOf(actor) {
  return Math.max(0, num(
    actor?.system?.derivedStats?.ram?.total
      ?? actor?.system?.derivedStats?.ram?.value
      ?? actor?.system?.derivedStats?.ram?.base
      ?? actor?.system?.miscStats?.initiative?.base,
    0
  ));
}

function buildUnits(combat) {
  const groups = new Map();

  for (const combatant of combat?.combatants?.contents ?? []) {
    if (!combatant?.actor) continue;
    const storedId = unitIdOf(combatant);
    const id = storedId || `solo:${combatant.id}`;
    if (id.startsWith("raid:")) continue;

    const unit = groups.get(id) ?? { id, members: [] };
    unit.members.push(combatant);
    groups.set(id, unit);
  }

  return Array.from(groups.values()).map((unit) => {
    const primary = primaryMember(unit);
    const raw = unit.members
      .map((combatant) => num(getFlag(combatant, "raw", NaN), NaN))
      .find(Number.isFinite);

    return {
      ...unit,
      side: sideOfUnit(unit),
      raw,
      ram: ramOf(primary?.actor),
      name: String(primary?.name ?? primary?.actor?.name ?? unit.id)
    };
  });
}

function compareWithinSide(a, b) {
  const raw = num(b.raw, -Infinity) - num(a.raw, -Infinity);
  if (raw) return raw;
  const ram = num(b.ram) - num(a.ram);
  if (ram) return ram;
  return a.name.localeCompare(b.name);
}

function compareLeaders(a, b) {
  const raw = num(b.raw, -Infinity) - num(a.raw, -Infinity);
  if (raw) return raw;
  const ram = num(b.ram) - num(a.ram);
  if (ram) return ram;
  // DDA tie fallback: Players act first when Initiative and RAM are tied.
  if (a.side !== b.side) return a.side === "players" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function alternatingOrder(units) {
  const players = units.filter((u) => u.side === "players").sort(compareWithinSide);
  const enemies = units.filter((u) => u.side === "enemies").sort(compareWithinSide);

  if (!players.length) return enemies;
  if (!enemies.length) return players;

  const playersFirst = compareLeaders(players[0], enemies[0]) <= 0;
  const first = playersFirst ? players : enemies;
  const second = playersFirst ? enemies : players;
  const shared = Math.min(first.length, second.length);
  const ordered = [];

  for (let i = 0; i < shared; i += 1) ordered.push(first[i], second[i]);
  ordered.push(...first.slice(shared), ...second.slice(shared));
  return ordered;
}

function roleRank(combatant) {
  const role = roleOf(combatant);
  if (role === "tamer") return 1;
  if (role === "suspended") return 2;
  return 0;
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function findAnchorIndex(combat, unitId) {
  const turns = combat?.turns ?? [];
  let fallback = -1;
  for (let i = 0; i < turns.length; i += 1) {
    if (unitIdOf(turns[i]) !== unitId) continue;
    if (fallback < 0) fallback = i;
    if (roleRank(turns[i]) === 0) return i;
  }
  return fallback;
}

async function synchronizeOrder(combat, { forceFirst = false, forceSetup = false } = {}) {
  if (!game?.user?.isGM || !combat?.combatants?.size) return false;

  const units = buildUnits(combat);
  if (!units.length || units.some((u) => !Number.isFinite(u.raw))) return false;

  const ordered = alternatingOrder(units);
  const raids = (combat.combatants.contents ?? [])
    .filter((c) => unitIdOf(c).startsWith("raid:"))
    .sort((a, b) => num(getFlag(a, "orderIndex", 0)) - num(getFlag(b, "orderIndex", 0)));

  const previousActiveUnit = unitIdOf(combat.combatant);
  const updates = [];
  const totalSlots = raids.length + ordered.length;

  raids.forEach((combatant, index) => {
    const desiredInitiative = totalSlots + 100 - (index * 0.001);
    const update = { _id: combatant.id };
    let changed = false;
    if (getFlag(combatant, "side", "") !== "enemies") {
      update[`flags.${SYSTEM_ID}.${FLAG_ROOT}.side`] = "enemies";
      changed = true;
    }
    if (num(getFlag(combatant, "orderIndex", NaN), NaN) !== index) {
      update[`flags.${SYSTEM_ID}.${FLAG_ROOT}.orderIndex`] = index;
      changed = true;
    }
    if (Math.abs(num(combatant.initiative, 0) - desiredInitiative) > 0.0001) {
      update.initiative = desiredInitiative;
      changed = true;
    }
    if (changed) updates.push(update);
  });

  ordered.forEach((unit, unitIndex) => {
    const orderIndex = raids.length + unitIndex;
    const members = [...unit.members].sort((a, b) => roleRank(a) - roleRank(b));
    members.forEach((combatant, memberIndex) => {
      const desiredInitiative = Number((totalSlots - unitIndex - (memberIndex * 0.001)).toFixed(3));
      const update = { _id: combatant.id };
      let changed = false;

      if (getFlag(combatant, "side", "") !== unit.side) {
        update[`flags.${SYSTEM_ID}.${FLAG_ROOT}.side`] = unit.side;
        changed = true;
      }
      if (num(getFlag(combatant, "orderIndex", NaN), NaN) !== orderIndex) {
        update[`flags.${SYSTEM_ID}.${FLAG_ROOT}.orderIndex`] = orderIndex;
        changed = true;
      }
      if (Math.abs(num(combatant.initiative, 0) - desiredInitiative) > 0.0001) {
        update.initiative = desiredInitiative;
        changed = true;
      }
      if (changed) updates.push(update);
    });
  });

  const orderEntries = [
    ...raids.map((combatant) => ({
      id: unitIdOf(combatant), side: "enemies", raw: 999999, members: [combatant.id], raidAction: true
    })),
    ...ordered.map((unit) => ({
      id: unit.id, side: unit.side, raw: unit.raw, members: unit.members.map((c) => c.id)
    }))
  ];

  const currentEntries = combat.getFlag?.(SYSTEM_ID, `${FLAG_ROOT}.order`) ?? [];
  const orderChanged = !sameJson(
    Array.isArray(currentEntries) ? currentEntries.map((e) => ({ id: e.id, side: e.side, raw: e.raw, members: e.members, raidAction: e.raidAction })) : [],
    orderEntries
  );

  if (updates.length) {
    await combat.updateEmbeddedDocuments("Combatant", updates, { ddaV10OrderSync: true });
  }
  if (orderChanged) {
    await combat.setFlag(SYSTEM_ID, `${FLAG_ROOT}.order`, orderEntries);
  }

  // A Combat created by an older hotfix can have correct stored flags but an
  // already-cached/native turn array. Rebuild when data changed and once on
  // ready, without doing it on every tracker render.
  if (updates.length || orderChanged || forceSetup || forceFirst) combat.setupTurns();

  const desiredUnit = forceFirst
    ? (orderEntries[0]?.id ?? "")
    : (previousActiveUnit || orderEntries[0]?.id || "");
  const desiredTurn = findAnchorIndex(combat, desiredUnit);
  let turnChanged = false;
  if (desiredTurn >= 0 && desiredTurn !== Number(combat.turn ?? -1)) {
    await combat.update({ turn: desiredTurn }, { ddaV10OrderSync: true });
    turnChanged = true;
  }

  const changed = Boolean(updates.length || orderChanged || turnChanged);
  if (changed) ui.combat?.render?.({ force: true });
  return changed;
}

function rowId(row) {
  return String(row?.dataset?.combatantId ?? row?.dataset?.entryId ?? "").trim();
}

function applyFactionTheme(row, side) {
  const enemy = side === "enemies";
  const palette = enemy
    ? {
        accent: "rgba(216,86,94,.94)", strong: "rgba(239,111,116,.99)",
        a: "rgba(66,24,32,.99)", b: "rgba(38,25,34,.99)",
        ia: "rgba(151,45,55,.99)", ib: "rgba(84,26,35,.99)"
      }
    : {
        accent: "rgba(69,185,126,.94)", strong: "rgba(101,218,153,.99)",
        a: "rgba(16,54,38,.99)", b: "rgba(20,39,38,.99)",
        ia: "rgba(31,120,77,.99)", ib: "rgba(18,70,49,.99)"
      };

  row.classList.add("dda-solo-combatant", "dda-solo-digimon", enemy ? "dda-solo-digimon-enemy" : "dda-solo-digimon-ally");
  row.classList.remove(enemy ? "dda-solo-digimon-ally" : "dda-solo-digimon-enemy");
  row.dataset.ddaAffiliation = enemy ? "enemy" : "ally";

  // CSS custom properties plus inline !important make the faction cue survive
  // both Foundry tracker rerenders and the older DDA base tracker stylesheet.
  row.style.setProperty("--dda-solo-accent", palette.accent);
  row.style.setProperty("--dda-solo-accent-strong", palette.strong);
  row.style.setProperty("--dda-solo-bg-a", palette.a);
  row.style.setProperty("--dda-solo-bg-b", palette.b);
  row.style.setProperty("--dda-solo-initiative-top", palette.ia);
  row.style.setProperty("--dda-solo-initiative-bottom", palette.ib);
  row.style.setProperty("border-color", palette.accent, "important");
  row.style.setProperty("background", `linear-gradient(135deg,${palette.a},${palette.b})`, "important");
  row.style.setProperty("box-shadow", `inset 3px 0 0 ${palette.strong},0 2px 8px rgba(0,0,0,.34)`, "important");

  const initiative = row.querySelector(".token-initiative");
  initiative?.style?.setProperty("background", `linear-gradient(180deg,${palette.ia},${palette.ib})`, "important");
  initiative?.style?.setProperty("border-right-color", palette.accent, "important");
  row.querySelector(".token-image")?.style?.setProperty("border-color", palette.accent, "important");

  // The native tracker already communicates the combatant's affiliation/name,
  // and the row palette supplies the faction cue. Keep solo rows visually
  // aligned with Tamer/Partner cards by removing the old redundant pill.
  row.querySelectorAll(".dda-solo-affiliation-badge, .dda-solo-affiliation-badge-v8, .dda-solo-affiliation-badge-v9, .dda-solo-affiliation-badge-v10")
    .forEach((badge) => badge.remove());
}

function decorateAndOrder(combat, root) {
  if (!combat || !root) return;
  const rows = Array.from(root.querySelectorAll("[data-combatant-id], [data-entry-id][class*='combatant']"));
  if (!rows.length) return;
  const rowById = new Map(rows.map((row) => [rowId(row), row]).filter(([id]) => id));

  for (const combatant of combat.combatants?.contents ?? []) {
    const row = rowById.get(String(combatant.id));
    if (!row || !combatant.actor) continue;
    const uid = unitIdOf(combatant);
    const role = roleOf(combatant);
    const paired = uid.startsWith("pair:") || uid.startsWith("jogress:");
    if (paired || role === "tamer" || role === "suspended" || uid.startsWith("raid:")) continue;
    if (!["digimon", "npc"].includes(String(combatant.actor.type))) continue;
    applyFactionTheme(row, sideOfCombatant(combatant));
  }

  const stored = combat.getFlag?.(SYSTEM_ID, `${FLAG_ROOT}.order`);
  if (!Array.isArray(stored) || !stored.length) return;
  const parent = rows[0]?.parentElement;
  if (!parent || !rows.every((row) => row.parentElement === parent)) return;

  const appended = new Set();
  for (const entry of stored) {
    const uid = String(entry?.id ?? "");
    const members = (combat.combatants.contents ?? [])
      .filter((c) => unitIdOf(c) === uid)
      .sort((a, b) => roleRank(a) - roleRank(b));
    for (const combatant of members) {
      const row = rowById.get(String(combatant.id));
      if (!row) continue;
      parent.append(row);
      appended.add(row);
    }
  }
  for (const row of rows) if (!appended.has(row)) parent.append(row);
}

function trackerRoot(app, html) {
  if (app?.element instanceof HTMLElement) return app.element;
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return document.querySelector("#combat") ?? document.querySelector(".combat-tracker");
}

function scheduleDecorate(app, html, combat) {
  const run = () => {
    const root = trackerRoot(app, html);
    if (root) decorateAndOrder(combat ?? app?.viewed ?? game?.combat, root);
  };
  requestAnimationFrame(() => {
    run();
    setTimeout(run, 30);
    setTimeout(run, 120);
  });
}

function register() {
  if (globalThis[RUNTIME_KEY]) return;
  globalThis[RUNTIME_KEY] = true;

  let timer = null;
  let forceFirstPending = false;
  let forceSetupPending = false;
  const scheduleSync = (combat, { forceFirst = false, forceSetup = false } = {}) => {
    if (!game?.user?.isGM || !combat) return;
    forceFirstPending ||= forceFirst;
    forceSetupPending ||= forceSetup;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const useForceFirst = forceFirstPending;
      const useForceSetup = forceSetupPending;
      forceFirstPending = false;
      forceSetupPending = false;
      try {
        await synchronizeOrder(combat, { forceFirst: useForceFirst, forceSetup: useForceSetup });
      } catch (error) {
        console.error("DDA | v10 initiative synchronization failed.", error);
      }
    }, 80);
  };

  Hooks.on("renderCombatTracker", (app, html) => {
    const combat = app?.viewed ?? game?.combat;
    if (!combat) return;
    scheduleDecorate(app, html, combat);
    scheduleSync(combat);
  });

  Hooks.on("updateCombatant", (combatant, changed, options = {}) => {
    if (options?.ddaV10OrderSync || options?.ddaV9OrderSync || options?.ddaV8OrderSync) return;
    const combat = combatant?.combat ?? game?.combat;
    if (!combat) return;
    const initiativeChanged = Object.prototype.hasOwnProperty.call(changed ?? {}, "initiative");
    scheduleSync(combat, { forceFirst: initiativeChanged });
  });

  Hooks.on("updateToken", (tokenDocument, changed) => {
    if (!("disposition" in (changed ?? {}))) return;
    const combat = game?.combat;
    if (!combat || String(combat.scene?.id ?? "") !== String(tokenDocument.parent?.id ?? "")) return;
    scheduleSync(combat);
    ui.combat?.render?.({ force: true });
  });

  Hooks.on("createCombatant", (combatant) => scheduleSync(combatant?.combat ?? game?.combat));
  Hooks.on("deleteCombatant", (combatant) => scheduleSync(combatant?.combat ?? game?.combat));

  Hooks.once("ready", () => {
    const combat = game?.combat;
    if (combat) {
      scheduleSync(combat, { forceSetup: true });
      ui.combat?.render?.({ force: true });
    }
    game.dda ??= {};
    const api = {
      synchronize: (target = game.combat, options = {}) => synchronizeOrder(target, options),
      sideOfCombatant
    };
    game.dda.initiativeV10 = api;
    // Compatibility aliases for helpers from the preceding hotfixes.
    game.dda.initiativeV9 = api;
    game.dda.initiativeV8 = api;
  });
}

register();
