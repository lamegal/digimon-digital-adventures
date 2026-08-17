const SYSTEM_ID = "digimon-digital-adventures";
const RUNTIME_FLAG = "bossTemplateRuntime";
const COMBATANT_FLAG = "bossTemplateActivation";

function number(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampInt(value, min, max, fallback = min) {
  const numeric = Math.round(number(value, fallback));
  return Math.min(max, Math.max(min, numeric));
}

function text(pt, en) {
  return String(game?.i18n?.lang ?? "en").toLowerCase().startsWith("pt") ? pt : en;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

export function getBossTemplateConfig(actor) {
  if (!actor || actor.type !== "npc") return null;
  const metadata = actor.getFlag?.(SYSTEM_ID, "enemyNpc") ?? actor.system?.enemy ?? {};
  const boss = metadata?.boss ?? null;
  const template = boss?.bossTemplate ?? null;
  const enabled = Boolean(boss && (boss?.options?.bossTemplate?.enabled ?? template));
  if (!enabled || !template) return null;

  const poolCount = clampInt(template.poolCount ?? boss.partySize, 1, 20, 1);
  // Boss Template grants one Turn and one independent Wound Pool per player.
  const turnCount = poolCount;
  const actorMax = Math.max(1, number(actor.system?.miscStats?.wounds?.max, 1));
  const woundsPerPool = Math.max(1, number(template.woundsPerPool, actorMax));

  return {
    poolCount,
    turnCount,
    woundsPerPool,
    totalWoundCapacity: Math.max(woundsPerPool * poolCount, number(template.totalWoundCapacity, 0))
  };
}

export function isBossTemplateActor(actor) {
  return Boolean(getBossTemplateConfig(actor));
}

function actorKey(actor) {
  return String(actor?.uuid ?? actor?.id ?? "").trim();
}

function legacyActorKey(actor) {
  return String(actor?.id ?? "").trim();
}

function actorIdentityMatches(left, right) {
  if (!left || !right) return false;
  return actorKey(left) === actorKey(right);
}

function runtimeStateForActor(map, actor) {
  if (!map || !actor) return null;
  const key = actorKey(actor);
  const legacy = legacyActorKey(actor);
  const direct = map?.[key] ?? null;
  if (direct) return direct;
  const legacyState = legacy && legacy !== key ? map?.[legacy] ?? null : null;
  if (!legacyState) return null;
  const storedUuid = String(legacyState.actorUuid ?? "").trim();
  if (storedUuid && storedUuid !== key) return null;
  return legacyState;
}

function migrateRuntimeMapEntry(map, actor, state) {
  const key = actorKey(actor);
  const legacy = legacyActorKey(actor);
  if (!key) return map;
  map[key] = state;
  if (legacy && legacy !== key && map[legacy]) delete map[legacy];
  return map;
}

function getRuntimeMap(combat) {
  return foundry.utils.deepClone(combat?.getFlag?.(SYSTEM_ID, RUNTIME_FLAG) ?? {});
}

export function getBossTemplateRuntimeState(actor, combat = game.combat) {
  if (!actor || !combat) return null;
  const state = runtimeStateForActor(combat.getFlag?.(SYSTEM_ID, RUNTIME_FLAG) ?? {}, actor);
  if (!state || String(state.combatId ?? "") !== String(combat.id ?? "")) return null;
  if (state.actorUuid && String(state.actorUuid) !== actorKey(actor)) return null;
  return foundry.utils.deepClone(state);
}

function nonGmOwnerUsers(actor) {
  if (!actor) return [];
  return (game.users?.contents ?? [])
    .filter((user) => !user.isGM)
    .filter((user) => actor.testUserPermission?.(user, "OWNER"))
    .sort((a, b) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id)));
}

function collectPartyUsers(combat, bossActor) {
  const users = new Map();
  for (const combatant of combat?.combatants?.contents ?? []) {
    const actor = combatant.actor;
    if (!actor || actorIdentityMatches(actor, bossActor)) continue;
    for (const user of nonGmOwnerUsers(actor)) users.set(user.id, user);
  }
  return [...users.values()].sort((a, b) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id)));
}

function createPools(actor, combat, config, existing = null) {
  const partyUsers = collectPartyUsers(combat, actor);
  const currentActorWounds = Math.min(
    config.woundsPerPool,
    Math.max(0, number(actor.system?.miscStats?.wounds?.value, config.woundsPerPool))
  );

  const previousPools = Array.isArray(existing?.pools) ? existing.pools : [];
  const pools = [];

  for (let index = 0; index < config.poolCount; index += 1) {
    const previous = previousPools[index] ?? null;
    const user = partyUsers[index] ?? null;
    pools.push({
      id: `pool-${index + 1}`,
      index: index + 1,
      label: `${text("Pool", "Pool")} ${index + 1}`,
      value: previous ? Math.max(0, Math.min(config.woundsPerPool, number(previous.value, config.woundsPerPool))) : currentActorWounds,
      max: config.woundsPerPool,
      assignedUserId: String(previous?.assignedUserId ?? user?.id ?? ""),
      assignedUserName: String(previous?.assignedUserName ?? user?.name ?? "")
    });
  }

  return pools;
}

async function saveState(actor, combat, state) {
  const map = getRuntimeMap(combat);
  migrateRuntimeMapEntry(map, actor, state);
  await combat.setFlag(SYSTEM_ID, RUNTIME_FLAG, map);
  return state;
}

async function ensureBossTemplateState(actor, combat, config) {
  const existing = getBossTemplateRuntimeState(actor, combat);
  const sameShape = existing
    && number(existing.poolCount, 0) === config.poolCount
    && number(existing.woundsPerPool, 0) === config.woundsPerPool;

  const pools = createPools(actor, combat, config, sameShape ? existing : null);
  const state = {
    version: 1,
    combatId: String(combat.id ?? ""),
    actorId: String(actor.id ?? ""),
    actorUuid: String(actor.uuid ?? ""),
    poolCount: config.poolCount,
    turnCount: config.turnCount,
    woundsPerPool: config.woundsPerPool,
    pools,
    initializedAt: existing?.initializedAt ?? Date.now()
  };

  if (!existing || JSON.stringify(existing) !== JSON.stringify(state)) {
    await saveState(actor, combat, state);
  }
  return state;
}

function activationData(combatant) {
  return combatant?.getFlag?.(SYSTEM_ID, COMBATANT_FLAG) ?? null;
}

export function isBossTemplateActivationCombatant(combatant) {
  return Boolean(activationData(combatant)?.synthetic === true);
}

function isTechnicalBossCombatant(combatant) {
  return isBossTemplateActivationCombatant(combatant) || isRaidActionCombatant(combatant);
}

export function getBossEncounterActorForCombatant(combatant, combat = combatant?.combat ?? game.combat) {
  if (!combatant) return null;

  const templateActivation = activationData(combatant);
  const raidActivation = combatant.getFlag?.(SYSTEM_ID, RAID_COMBATANT_FLAG) ?? null;
  const anchorId = String(
    templateActivation?.anchorCombatantId ??
    raidActivation?.anchorCombatantId ??
    ""
  ).trim();

  if (anchorId) {
    const anchor = combat?.combatants?.get?.(anchorId) ?? null;
    if (anchor?.actor) return anchor.actor;
  }

  return combatant.actor ?? null;
}

function bossCombatants(combat, actor) {
  return (combat?.combatants?.contents ?? []).filter((combatant) => {
    const sourceActor = getBossEncounterActorForCombatant(combatant, combat);
    return actorIdentityMatches(sourceActor, actor);
  });
}

async function reconcileBossTemplateCombatants(actor, combat, config) {
  const matches = bossCombatants(combat, actor);
  if (!matches.length) return [];

  const generated = matches.filter((combatant) => activationData(combatant)?.synthetic === true);
  const real = matches.filter((combatant) => activationData(combatant)?.synthetic !== true);
  const anchor = real.find((combatant) => combatant.tokenId) ?? real[0] ?? matches[0];
  const desiredSynthetic = Math.max(0, config.turnCount - 1);

  if (generated.length > desiredSynthetic) {
    const extras = generated.slice(desiredSynthetic).map((combatant) => combatant.id);
    if (extras.length) await combat.deleteEmbeddedDocuments("Combatant", extras);
  }

  const refreshedGenerated = bossCombatants(combat, actor)
    .filter((combatant) => activationData(combatant)?.synthetic === true)
    .slice(0, desiredSynthetic);

  const missing = desiredSynthetic - refreshedGenerated.length;
  if (missing > 0) {
    const startIndex = refreshedGenerated.length + 2;
    const docs = Array.from({ length: missing }, (_, offset) => {
      const index = startIndex + offset;
      return {
        actorId: actor.id,
        tokenId: null,
        sceneId: combat.scene?.id ?? canvas?.scene?.id ?? null,
        name: `${actor.name} · ${text("Turno de Boss", "Boss Turn")} ${index}`,
        img: actor.img,
        hidden: Boolean(anchor.hidden),
        defeated: Boolean(anchor.defeated),
        flags: {
          [SYSTEM_ID]: {
            [COMBATANT_FLAG]: {
              actorId: actor.id,
              activationIndex: index,
              poolIndex: Math.min(index, config.poolCount),
              synthetic: true,
              anchorCombatantId: anchor.id
            }
          }
        }
      };
    });
    await combat.createEmbeddedDocuments("Combatant", docs);
  }

  const finalMatches = bossCombatants(combat, actor);
  const finalGenerated = finalMatches
    .filter((combatant) => activationData(combatant)?.synthetic === true)
    .sort((a, b) => number(activationData(a)?.activationIndex, 99) - number(activationData(b)?.activationIndex, 99));

  const updates = [{
    _id: anchor.id,
    [`flags.${SYSTEM_ID}.${COMBATANT_FLAG}`]: {
      actorId: actor.id,
      activationIndex: 1,
      poolIndex: 1,
      synthetic: false,
      anchorCombatantId: anchor.id
    }
  }];

  finalGenerated.forEach((combatant, offset) => {
    updates.push({
      _id: combatant.id,
      [`flags.${SYSTEM_ID}.${COMBATANT_FLAG}`]: {
        actorId: actor.id,
        activationIndex: offset + 2,
        poolIndex: Math.min(offset + 2, config.poolCount),
        synthetic: true,
        anchorCombatantId: anchor.id
      }
    });
  });
  if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
  return bossCombatants(combat, actor);
}

export async function ensureBossTemplateRuntime(combat = game.combat) {
  if (!game.user?.isGM || !combat) return [];

  const actors = new Map();
  for (const combatant of combat.combatants?.contents ?? []) {
    if (isTechnicalBossCombatant(combatant)) continue;
    const actor = combatant.actor;
    const config = getBossTemplateConfig(actor);
    if (!actor || !config) continue;
    actors.set(actorKey(actor), { actor, config });
  }

  const results = [];
  for (const { actor, config } of actors.values()) {
    await reconcileBossTemplateCombatants(actor, combat, config);
    const state = await ensureBossTemplateState(actor, combat, config);
    results.push({ actor, config, state });
  }
  return results;
}

function ownerCandidateIds(attacker, preferredUserId = "") {
  const owners = nonGmOwnerUsers(attacker);
  const preferred = String(preferredUserId ?? "").trim();
  const preferredUser = preferred ? game.users?.get(preferred) : null;

  if (
    preferredUser &&
    !preferredUser.isGM &&
    attacker?.testUserPermission?.(preferredUser, "OWNER")
  ) {
    return [
      preferredUser.id,
      ...owners.filter((user) => user.id !== preferredUser.id).map((user) => user.id)
    ];
  }

  /*
   * A shared Actor can have multiple non-GM owners. Without knowing which user
   * actually caused the effect, choosing the first owner alphabetically would
   * silently damage the wrong Boss Template pool. Force the GM selection in
   * that ambiguous case instead.
   */
  return owners.length === 1 ? [owners[0].id] : [];
}

async function choosePoolDialog(actor, state) {
  if (!game.user?.isGM) return null;
  const options = state.pools.map((pool) => {
    const owner = pool.assignedUserName ? ` — ${pool.assignedUserName}` : "";
    return `<option value="${escapeHtml(pool.id)}">${escapeHtml(pool.label)}${escapeHtml(owner)} (${pool.value}/${pool.max})</option>`;
  }).join("");

  return foundry.applications.api.DialogV2.wait({
    window: { title: `${actor.name} — ${text("Boss Template", "Boss Template")}` },
    content: `
      <div class="dda-roll-dialog dda-boss-template-pool-dialog">
        <p>${text("Selecione qual Wound Pool este efeito deve afetar.", "Select which Wound Pool this effect should affect.")}</p>
        <select name="poolId">${options}</select>
      </div>`,
    buttons: [
      {
        action: "select",
        label: text("Aplicar", "Apply"),
        default: true,
        callback: (_event, button) => String(button.form?.elements?.poolId?.value ?? "") || null
      },
      { action: "cancel", label: text("Cancelar", "Cancel"), callback: () => null }
    ],
    close: () => null,
    rejectClose: false
  });
}

async function bindUnassignedUser(actor, combat, state, userId) {
  if (!userId) return state;
  if (state.pools.some((pool) => pool.assignedUserId === userId)) return state;
  const free = state.pools.find((pool) => !pool.assignedUserId);
  if (!free) return state;
  const user = game.users?.get(userId);
  free.assignedUserId = userId;
  free.assignedUserName = String(user?.name ?? "");
  await saveState(actor, combat, state);
  return state;
}

export async function getBossTemplateDamageContext(actor, options = {}, combat = game.combat) {
  const config = getBossTemplateConfig(actor);
  if (!config || !combat?.started) return null;

  let state = getBossTemplateRuntimeState(actor, combat);
  if (!state && game.user?.isGM) {
    await ensureBossTemplateRuntime(combat);
    state = getBossTemplateRuntimeState(actor, combat);
  }
  if (!state) {
    return { cancelled: true, actor, combat, state: null, pool: null, reason: "boss-template-runtime-unavailable" };
  }

  const explicit = String(options?.bossTemplatePoolId ?? "").trim();
  let pool = explicit ? state.pools.find((candidate) => candidate.id === explicit) : null;

  if (!pool) {
    const candidates = ownerCandidateIds(options?.attacker, options?.attackerUserId);
    const alreadyAssigned = state.pools.find((candidate) => candidates.includes(candidate.assignedUserId));
    if (alreadyAssigned) pool = alreadyAssigned;
    else if (candidates.length) {
      state = await bindUnassignedUser(actor, combat, state, candidates[0]);
      pool = state.pools.find((candidate) => candidate.assignedUserId === candidates[0]) ?? null;
    }
  }

  if (!pool) {
    const selectedId = await choosePoolDialog(actor, state);
    if (!selectedId) return { cancelled: true, actor, combat, state, pool: null };
    pool = state.pools.find((candidate) => candidate.id === selectedId) ?? null;
  }
  if (!pool) return { cancelled: true, actor, combat, state, pool: null };

  return {
    actor,
    combat,
    state,
    pool,
    currentWounds: number(pool.value, config.woundsPerPool),
    maximumWounds: number(pool.max, config.woundsPerPool)
  };
}

export function previewBossTemplatePoolResult(context, nextWounds) {
  if (!context?.state || !context?.pool) return null;
  const pools = context.state.pools.map((pool) => ({
    ...pool,
    value: pool.id === context.pool.id
      ? Math.max(0, Math.min(number(pool.max, 0), number(nextWounds, 0)))
      : number(pool.value, 0)
  }));
  return {
    pools,
    allDefeated: pools.length > 0 && pools.every((pool) => pool.value <= 0),
    summaryWounds: pools.length ? Math.max(...pools.map((pool) => pool.value)) : 0,
    remainingPools: pools.filter((pool) => pool.value > 0).length
  };
}

export async function commitBossTemplatePoolResult(context, nextWounds) {
  if (!context?.actor || !context?.combat || !context?.state || !context?.pool) return null;
  const preview = previewBossTemplatePoolResult(context, nextWounds);
  if (!preview) return null;
  const nextState = { ...context.state, pools: preview.pools, updatedAt: Date.now() };
  await saveState(context.actor, context.combat, nextState);
  return { ...preview, state: nextState, pool: nextState.pools.find((pool) => pool.id === context.pool.id) };
}

async function resolveEffectSourceActor(entry) {
  const uuid = String(entry?.sourceActorUuid ?? "").trim();
  if (!uuid) return null;
  try {
    const document = await fromUuid(uuid);
    return document?.documentName === "Token" ? document.actor : document;
  } catch (_error) {
    return null;
  }
}

/**
 * Apply already-calculated end-of-turn Effect damage to Boss Template pools.
 * Effect damage intentionally bypasses Temporary Wounds in DDA, so this uses
 * the pool layer directly instead of routing through the normal damage soak.
 */
export async function applyBossTemplateEffectDamageEntries(actor, entries = [], combat = game.combat) {
  const config = getBossTemplateConfig(actor);
  const initialState = getBossTemplateRuntimeState(actor, combat);
  if (!config || !combat?.started || !initialState) return null;

  const beforeSummary = initialState.pools.length
    ? Math.max(...initialState.pools.map((pool) => number(pool.value, 0)))
    : 0;
  const applications = [];
  let totalApplied = 0;

  for (const entry of entries) {
    const amount = Math.max(0, number(entry?.amount, 0));
    if (entry?.type !== "damage" || amount <= 0) continue;

    const attacker = await resolveEffectSourceActor(entry);
    const context = await getBossTemplateDamageContext(actor, { attacker }, combat);
    if (!context || context.cancelled || !context.pool) {
      applications.push({ entry, cancelled: true, applied: 0 });
      continue;
    }

    const before = Math.max(0, number(context.currentWounds, config.woundsPerPool));
    const maximum = Math.max(1, number(context.maximumWounds, config.woundsPerPool));
    let after = Math.max(0, before - amount);
    let undefeatedEndurance = null;

    if (after <= 0 && before > 0) {
      const damageModule = await import("../rolls/damage-application.js");
      undefeatedEndurance = await damageModule.tryUndefeatedEndurance?.(actor, {
        prospectiveWounds: after,
        maximumWounds: maximum
      }) ?? null;
      if (undefeatedEndurance?.used) after = Math.max(0, number(undefeatedEndurance.wounds, after));
    }

    const commit = await commitBossTemplatePoolResult(context, after);
    if (!commit) continue;
    const applied = Math.max(0, before - number(commit.pool?.value, after));
    totalApplied += applied;
    entry.bossTemplatePool = {
      id: context.pool.id,
      label: context.pool.label,
      assignedUserId: context.pool.assignedUserId,
      assignedUserName: context.pool.assignedUserName,
      before,
      after: number(commit.pool?.value, after),
      applied
    };
    applications.push({ entry, cancelled: false, applied, undefeatedEndurance, commit });
  }

  const state = getBossTemplateRuntimeState(actor, combat) ?? initialState;
  const afterSummary = state.pools.length
    ? Math.max(...state.pools.map((pool) => number(pool.value, 0)))
    : 0;
  const allDefeated = state.pools.length > 0 && state.pools.every((pool) => number(pool.value, 0) <= 0);
  const multiStageContinuation = allDefeated && hasMultiStageBossContinuation(actor, combat);
  const actorDefeated = allDefeated && !multiStageContinuation;

  await actor.update({
    "system.miscStats.wounds.value": afterSummary,
    "system.combat.defeated": actorDefeated
  });
  await setBossTemplateDefeatedState(actor, actorDefeated, combat);

  return {
    handled: true,
    beforeSummary,
    afterSummary,
    totalApplied,
    allDefeated,
    multiStageContinuation,
    actorDefeated,
    state,
    applications
  };
}

function activeBossTemplatePoolIndex(actor, combat = game.combat) {
  const active = combat?.combatant ?? null;
  if (!active || !actorIdentityMatches(getBossEncounterActorForCombatant(active, combat), actor)) return 0;
  const activation = activationData(active);
  return clampInt(activation?.poolIndex ?? activation?.activationIndex, 1, 20, 1);
}

export async function healActiveBossTemplatePool(actor, amount, combat = game.combat) {
  const state = getBossTemplateRuntimeState(actor, combat);
  const heal = Math.max(0, number(amount, 0));
  if (!state || heal <= 0) return null;

  const poolIndex = activeBossTemplatePoolIndex(actor, combat);
  const pool = state.pools.find((candidate) => number(candidate.index, 0) === poolIndex) ?? state.pools[0];
  if (!pool) return null;
  const before = Math.max(0, number(pool.value, 0));
  const after = Math.min(number(pool.max, before), before + heal);
  if (after <= before) return { healed: 0, pool, state };

  const pools = state.pools.map((candidate) => candidate.id === pool.id ? { ...candidate, value: after } : candidate);
  const nextState = { ...state, pools, updatedAt: Date.now() };
  await saveState(actor, combat, nextState);
  const summaryWounds = Math.max(...pools.map((candidate) => number(candidate.value, 0)), 0);
  await actor.update({ "system.miscStats.wounds.value": summaryWounds, "system.combat.defeated": false });
  await setBossTemplateDefeatedState(actor, false, combat);
  return { healed: after - before, before, after, pool: { ...pool, value: after }, state: nextState };
}

export async function healBossTemplatePools(actor, amount, combat = game.combat) {
  const state = getBossTemplateRuntimeState(actor, combat);
  const heal = Math.max(0, number(amount, 0));
  if (!state || heal <= 0) return null;

  const pools = state.pools.map((pool) => ({
    ...pool,
    value: Math.min(number(pool.max, 0), Math.max(0, number(pool.value, 0)) + heal)
  }));
  const healed = pools.reduce((sum, pool, index) => {
    return sum + Math.max(0, number(pool.value, 0) - number(state.pools[index]?.value, 0));
  }, 0);
  if (healed <= 0) return { healed: 0, state };

  const nextState = { ...state, pools, updatedAt: Date.now() };
  await saveState(actor, combat, nextState);
  const summaryWounds = Math.max(...pools.map((pool) => number(pool.value, 0)), 0);
  await actor.update({
    "system.miscStats.wounds.value": summaryWounds,
    "system.combat.defeated": false
  });
  await setBossTemplateDefeatedState(actor, false, combat);

  return { healed, perPool: heal, state: nextState, summaryWounds };
}

export async function setBossTemplateDefeatedState(actor, defeated, combat = game.combat) {
  if (!actor || !combat) return;
  const ids = bossCombatants(combat, actor).filter((combatant) => Boolean(combatant.defeated) !== Boolean(defeated));
  if (!ids.length) return;
  await combat.updateEmbeddedDocuments("Combatant", ids.map((combatant) => ({ _id: combatant.id, defeated: Boolean(defeated) })));
}

export function decorateBossTemplateContext(actor, combat = game.combat) {
  const config = getBossTemplateConfig(actor);
  if (!config) return null;
  const state = getBossTemplateRuntimeState(actor, combat);
  const pools = state?.pools ?? Array.from({ length: config.poolCount }, (_, index) => ({
    id: `pool-${index + 1}`,
    index: index + 1,
    label: `${text("Pool", "Pool")} ${index + 1}`,
    value: config.woundsPerPool,
    max: config.woundsPerPool,
    assignedUserName: ""
  }));
  return {
    active: Boolean(state && combat?.started),
    poolCount: config.poolCount,
    turnCount: config.turnCount,
    pools,
    remainingPools: pools.filter((pool) => number(pool.value, 0) > 0).length,
    title: text("Boss Template — Wound Pools", "Boss Template — Wound Pools"),
    turnsLabel: text("Turns por rodada", "Turns per round"),
    remainingLabel: text("Pools restantes", "Remaining Pools"),
    waitingLabel: text("Os pools serão inicializados quando a iniciativa DDA for rolada.", "Pools will initialize when DDA Initiative is rolled.")
  };
}

export function registerBossEncounterHooks() {
  Hooks.on("combatStart", (combat) => {
    if (!isPrimaryActiveGM()) return;
    void ensureBossEncounterRuntime(combat).catch((error) => {
      console.error("DDA | Could not initialize Boss encounter runtime.", error);
    });
  });

  Hooks.on("createCombatant", (combatant) => {
    scheduleBossEncounterReconcile(combatant?.combat);
  });

  Hooks.on("deleteCombatant", (combatant) => {
    scheduleBossEncounterReconcile(combatant?.combat);
  });

  Hooks.on("updateCombatant", (combatant, changed) => {
    const relevant =
      Object.prototype.hasOwnProperty.call(changed ?? {}, "actorId") ||
      Object.prototype.hasOwnProperty.call(changed ?? {}, "tokenId") ||
      foundry.utils.hasProperty(changed ?? {}, `flags.${SYSTEM_ID}.${COMBATANT_FLAG}`) ||
      foundry.utils.hasProperty(changed ?? {}, `flags.${SYSTEM_ID}.${RAID_COMBATANT_FLAG}`);
    if (!relevant) return;
    scheduleBossEncounterReconcile(combatant?.combat);
  });

  Hooks.on("updateActor", (actor, changed) => {
    const bossMetadataChanged =
      foundry.utils.hasProperty(changed ?? {}, `flags.${SYSTEM_ID}.enemyNpc`) ||
      foundry.utils.hasProperty(changed ?? {}, "system.enemy");
    if (!bossMetadataChanged) return;

    for (const combat of game.combats?.contents ?? []) {
      if (!combat?.started) continue;
      const participates = (combat.combatants?.contents ?? []).some((combatant) => {
        if (isTechnicalBossCombatant(combatant)) return false;
        return actorIdentityMatches(combatant.actor, actor);
      });
      if (participates) scheduleBossEncounterReconcile(combat);
    }
  });

  Hooks.on("combatEnd", (combat) => {
    if (!isPrimaryActiveGM()) return;
    void cleanupBossEncounterRuntime(combat, { ending: true }).catch((error) => {
      console.error("DDA | Could not clean Boss encounter runtime.", error);
    });
  });

  Hooks.on("updateCombat", (combat, changed) => {
    const changedRuntime = foundry.utils.hasProperty(changed ?? {}, `flags.${SYSTEM_ID}.${RUNTIME_FLAG}`);
    if (!changedRuntime) return;
    for (const combatant of combat?.combatants?.contents ?? []) {
      const actor = getBossEncounterActorForCombatant(combatant, combat);
      if (!isBossTemplateActor(actor)) continue;
      actor?.sheet?.render?.(false);
    }
  });

  Hooks.once("ready", () => {
    game.socket?.on?.(`system.${SYSTEM_ID}`, (payload = {}) => {
      if (payload?.action !== RAID_DECIPHER_SOCKET || !isPrimaryActiveGM()) return;
      void recordRaidDecipherResult(payload).catch((error) => {
        console.error("DDA | Could not record Raid Action Decipher Intent result.", error);
      });
    });

    game.dda ??= {};
    game.dda.bossEncounters ??= {};
    Object.assign(game.dda.bossEncounters, {
      ensureBossEncounterRuntime,
      cleanupBossEncounterRuntime,
      ensureRaidBossRuntime,
      ensureMultiStageBossRuntime,
      performRaidDecipherIntent,
      handleMultiStageBossDefeat,
      getRaidBossRuntimeState,
      getMultiStageBossRuntimeState
    });
  });
}

/* ------------------------------------------------------------------------- */
/* Raid Boss + Multi-Stage Boss runtime                                      */
/* ------------------------------------------------------------------------- */

const RAID_RUNTIME_FLAG = "raidBossRuntime";
const RAID_COMBATANT_FLAG = "raidActionActivation";
const MULTISTAGE_RUNTIME_FLAG = "multiStageBossRuntime";
const RAID_DECIPHER_SOCKET = "ddaRaidDecipherResult";

function getEnemyBossMetadata(actor) {
  if (!actor || actor.type !== "npc") return null;
  const metadata = actor.getFlag?.(SYSTEM_ID, "enemyNpc") ?? actor.system?.enemy ?? {};
  return metadata?.boss ? metadata : null;
}

function getPrimaryActiveGM() {
  return (game.users?.contents ?? [])
    .filter((user) => user?.isGM && user?.active)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
}

function isPrimaryActiveGM() {
  return Boolean(game.user?.isGM && getPrimaryActiveGM()?.id === game.user.id);
}

const bossEncounterReconcileTimers = new Map();

function scheduleBossEncounterReconcile(combat) {
  if (!isPrimaryActiveGM() || !combat) return;
  const key = String(combat.id ?? "");
  if (!key) return;

  const previous = bossEncounterReconcileTimers.get(key);
  if (previous) clearTimeout(previous);

  const timer = setTimeout(() => {
    bossEncounterReconcileTimers.delete(key);
    if (!combat?.started) return;
    void ensureBossEncounterRuntime(combat).catch((error) => {
      console.error("DDA | Could not reconcile Boss encounter runtime.", error);
    });
  }, 0);
  bossEncounterReconcileTimers.set(key, timer);
}

function realBossActors(combat) {
  const actors = new Map();
  for (const combatant of combat?.combatants?.contents ?? []) {
    if (isTechnicalBossCombatant(combatant)) continue;
    const actor = combatant.actor;
    if (!actor) continue;
    actors.set(actorKey(actor), actor);
  }
  return actors;
}

function rebuiltRuntimeMap(current, actors) {
  const next = {};
  for (const actor of actors.values()) {
    const state = runtimeStateForActor(current, actor);
    if (!state) continue;
    const storedUuid = String(state.actorUuid ?? "").trim();
    if (storedUuid && storedUuid !== actorKey(actor)) continue;
    next[actorKey(actor)] = { ...state, actorUuid: actorKey(actor), actorId: legacyActorKey(actor) };
  }
  return next;
}

export async function cleanupBossEncounterRuntime(combat = game.combat, { ending = false } = {}) {
  if (!isPrimaryActiveGM() || !combat) return false;

  const actors = realBossActors(combat);
  const templateActors = new Map();
  const raidActors = new Map();
  const multiActors = new Map();

  if (!ending) {
    for (const [key, actor] of actors) {
      if (getBossTemplateConfig(actor)) templateActors.set(key, actor);
      if (getRaidBossConfig(actor)) raidActors.set(key, actor);
      if (getMultiStageBossConfig(actor)) multiActors.set(key, actor);
    }
  }

  const deleteIds = [];
  const clearTemplateFlags = [];
  for (const combatant of combat.combatants?.contents ?? []) {
    if (isBossTemplateActivationCombatant(combatant)) {
      const sourceActor = getBossEncounterActorForCombatant(combatant, combat);
      const anchorId = String(activationData(combatant)?.anchorCombatantId ?? "");
      const anchor = anchorId ? combat.combatants?.get?.(anchorId) : null;
      if (ending || !anchor || !sourceActor || !templateActors.has(actorKey(sourceActor))) {
        deleteIds.push(combatant.id);
      }
      continue;
    }

    if (isRaidActionCombatant(combatant)) {
      const sourceActor = getBossEncounterActorForCombatant(combatant, combat);
      const anchorId = String(combatant.getFlag?.(SYSTEM_ID, RAID_COMBATANT_FLAG)?.anchorCombatantId ?? "");
      const anchor = anchorId ? combat.combatants?.get?.(anchorId) : null;
      if (ending || !anchor || !sourceActor || !raidActors.has(actorKey(sourceActor))) {
        deleteIds.push(combatant.id);
      }
      continue;
    }

    if (activationData(combatant) && (ending || !templateActors.has(actorKey(combatant.actor)))) {
      clearTemplateFlags.push({
        _id: combatant.id,
        [`flags.${SYSTEM_ID}.${COMBATANT_FLAG}`]: null
      });
    }
  }

  if (deleteIds.length) {
    await combat.deleteEmbeddedDocuments("Combatant", [...new Set(deleteIds)]);
  }
  if (clearTemplateFlags.length) {
    await combat.updateEmbeddedDocuments("Combatant", clearTemplateFlags);
  }

  const currentTemplate = getRuntimeMap(combat);
  const currentRaid = getRaidRuntimeMap(combat);
  const currentMulti = getMultiStageRuntimeMap(combat);
  const nextTemplate = ending ? {} : rebuiltRuntimeMap(currentTemplate, templateActors);
  const nextRaid = ending ? {} : rebuiltRuntimeMap(currentRaid, raidActors);
  const nextMulti = ending ? {} : rebuiltRuntimeMap(currentMulti, multiActors);

  if (JSON.stringify(currentTemplate) !== JSON.stringify(nextTemplate)) {
    await combat.setFlag(SYSTEM_ID, RUNTIME_FLAG, nextTemplate);
  }
  if (JSON.stringify(currentRaid) !== JSON.stringify(nextRaid)) {
    await combat.setFlag(SYSTEM_ID, RAID_RUNTIME_FLAG, nextRaid);
  }
  if (JSON.stringify(currentMulti) !== JSON.stringify(nextMulti)) {
    await combat.setFlag(SYSTEM_ID, MULTISTAGE_RUNTIME_FLAG, nextMulti);
  }

  return true;
}

function getRaidActionMechanics(action) {
  const messageId = String(action?.secretMessageId ?? "").trim();
  if (!messageId) return "";
  return String(game.messages?.get(messageId)?.getFlag?.(SYSTEM_ID, "raidActionSecret")?.mechanics ?? "").trim();
}

async function storeRaidActionSecret(actor, action) {
  const mechanics = String(action?.mechanics ?? "").trim();
  const gmIds = ChatMessage.getWhisperRecipients("GM").map((user) => user.id);
  const secretMessage = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: gmIds,
    flags: {
      [SYSTEM_ID]: {
        raidActionSecret: {
          actionId: String(action?.id ?? ""),
          bossActorUuid: String(actor?.uuid ?? ""),
          mechanics
        }
      }
    },
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-raid-action-secret-card">
        <h2>${escapeHtml(text("Ação de Raid — Mecânica do GM", "Raid Action — GM Mechanics"))}</h2>
        <p><strong>${escapeHtml(action?.name ?? text("Ação de Raid", "Raid Action"))}</strong></p>
        <p>${mechanics ? escapeHtml(mechanics).replaceAll("\n", "<br>") : escapeHtml(text("Nenhuma mecânica secreta adicional foi configurada.", "No additional secret mechanics were configured."))}</p>
      </div>`
  });

  const stored = { ...action, secretMessageId: String(secretMessage?.id ?? "") };
  delete stored.mechanics;
  return stored;
}

export function getRaidBossConfig(actor) {
  const metadata = getEnemyBossMetadata(actor);
  const boss = metadata?.boss ?? null;
  const raid = boss?.raid ?? null;
  const enabled = Boolean(boss && (boss?.options?.raidBoss?.enabled ?? raid));
  if (!enabled || !raid) return null;

  const stage = Math.max(0, number(actor.system?.stageValue, 0));
  const milestones = Math.max(0, number(boss?.partyMilestones, 0));

  return {
    stage,
    milestones,
    decipherIntentTn: 10 + stage + milestones,
    // Raid Boss: the telegraph always resolves on the next Raid turn.
    telegraphRounds: 1,
    notes: String(raid.notes ?? "").trim()
  };
}

export function getMultiStageBossConfig(actor) {
  const metadata = getEnemyBossMetadata(actor);
  const boss = metadata?.boss ?? null;
  const multiStage = boss?.multiStage ?? null;
  const enabled = Boolean(boss && (boss?.options?.multiStage?.enabled ?? multiStage));
  if (!enabled || !multiStage) return null;

  return {
    stageCount: clampInt(multiStage.stageCount, 2, 99, 2),
    // Multi-Stage Boss always enters the next form with full Wound Boxes.
    recoverFullWounds: true,
    notes: String(multiStage.notes ?? "").trim()
  };
}

export function isRaidActionCombatant(combatant) {
  return Boolean(combatant?.getFlag?.(SYSTEM_ID, RAID_COMBATANT_FLAG)?.synthetic === true);
}

export function getRaidActionCombatants(combat = game.combat) {
  return (combat?.combatants?.contents ?? []).filter((combatant) => isRaidActionCombatant(combatant));
}

function raidActionCombatantsForActor(combat, actor) {
  return getRaidActionCombatants(combat).filter((combatant) => {
    return actorIdentityMatches(getBossEncounterActorForCombatant(combatant, combat), actor);
  });
}

async function reconcileRaidActionCombatant(actor, combat) {
  const existing = raidActionCombatantsForActor(combat, actor);
  if (existing.length > 1) {
    await combat.deleteEmbeddedDocuments("Combatant", existing.slice(1).map((combatant) => combatant.id));
  }
  if (existing.length) return existing[0];

  const anchor = (combat?.combatants?.contents ?? []).find((combatant) => {
    return actorIdentityMatches(combatant.actor, actor) && !isTechnicalBossCombatant(combatant) && combatant.tokenId;
  }) ?? (combat?.combatants?.contents ?? []).find((combatant) => {
    return actorIdentityMatches(combatant.actor, actor) && !isTechnicalBossCombatant(combatant);
  });

  if (!anchor) return null;

  const [created] = await combat.createEmbeddedDocuments("Combatant", [{
    actorId: actor.id,
    tokenId: null,
    sceneId: combat.scene?.id ?? canvas?.scene?.id ?? null,
    name: `${text("Ação de Raid", "Raid Action")} · ${actor.name}`,
    img: actor.img,
    hidden: Boolean(anchor.hidden),
    defeated: false,
    flags: {
      [SYSTEM_ID]: {
        [RAID_COMBATANT_FLAG]: {
          synthetic: true,
          actorId: actor.id,
          anchorCombatantId: anchor.id
        }
      }
    }
  }]);

  return created ?? null;
}

function getRaidRuntimeMap(combat) {
  return foundry.utils.deepClone(combat?.getFlag?.(SYSTEM_ID, RAID_RUNTIME_FLAG) ?? {});
}

function raidRuntimeKey(actor) {
  return actorKey(actor);
}

export function getRaidBossRuntimeState(actor, combat = game.combat) {
  if (!actor || !combat) return null;
  const state = runtimeStateForActor(combat.getFlag?.(SYSTEM_ID, RAID_RUNTIME_FLAG) ?? {}, actor);
  if (!state || String(state.combatId ?? "") !== String(combat.id ?? "")) return null;
  if (state.actorUuid && String(state.actorUuid) !== actorKey(actor)) return null;
  return foundry.utils.deepClone(state);
}

async function saveRaidBossRuntimeState(actor, combat, state) {
  const map = getRaidRuntimeMap(combat);
  migrateRuntimeMapEntry(map, actor, state);
  await combat.setFlag(SYSTEM_ID, RAID_RUNTIME_FLAG, map);
  return state;
}

async function ensureRaidBossState(actor, combat) {
  const config = getRaidBossConfig(actor);
  if (!config) return null;
  const existing = getRaidBossRuntimeState(actor, combat);
  if (existing) {
    let changed = false;
    const normalizeAction = (action) => {
      if (!action) return action;
      const telegraphedRound = Math.max(1, number(action.telegraphedRound, combat?.round ?? 1));
      const resolvesRound = telegraphedRound + 1;
      if (number(action.resolvesRound, resolvesRound) === resolvesRound) return action;
      changed = true;
      return { ...action, telegraphedRound, resolvesRound };
    };
    existing.pendingActions = pendingRaidActions(existing).map(normalizeAction);
    existing.pendingAction = existing.pendingActions[0] ?? null;
    if (changed) {
      existing.updatedAt = Date.now();
      await saveRaidBossRuntimeState(actor, combat, existing);
    }
    return existing;
  }

  const state = {
    version: 1,
    combatId: String(combat.id ?? ""),
    actorId: String(actor.id ?? ""),
    actorUuid: String(actor.uuid ?? ""),
    pendingAction: null,
    pendingActions: [],
    lastResolvedAction: null,
    seenActions: [],
    lastProcessedRound: 0,
    initializedAt: Date.now()
  };
  await saveRaidBossRuntimeState(actor, combat, state);
  return state;
}

export async function ensureRaidBossRuntime(combat = game.combat) {
  if (!game.user?.isGM || !combat) return [];

  const actors = new Map();
  for (const combatant of combat.combatants?.contents ?? []) {
    if (isTechnicalBossCombatant(combatant)) continue;
    const actor = combatant.actor;
    if (!actor || !getRaidBossConfig(actor)) continue;
    actors.set(actorKey(actor), actor);
  }

  const results = [];
  for (const actor of actors.values()) {
    const combatant = await reconcileRaidActionCombatant(actor, combat);
    const state = await ensureRaidBossState(actor, combat);
    results.push({ actor, combatant, state, config: getRaidBossConfig(actor) });
  }
  return results;
}

function raidActionId(actor, combat, round) {
  return `${actorKey(actor)}:${combat?.id ?? "no-combat"}:${round}:${foundry.utils.randomID(8)}`;
}

async function promptRaidAction(actor, config, state, round) {
  if (!game.user?.isGM) return null;
  const previous = state?.lastResolvedAction ?? state?.pendingAction ?? null;
  const defaultName = String(previous?.name ?? text("Ação de Raid", "Raid Action"));
  const defaultMechanics = String(getRaidActionMechanics(previous) || config.notes || "");

  return foundry.applications.api.DialogV2.wait({
    window: { title: `${actor.name} — ${text("Preparar Ação de Raid", "Prepare Raid Action")}` },
    content: `
      <div class="dda-roll-dialog dda-raid-action-dialog">
        <p>${text(
          "Descreva a pista pública e, separadamente, a mecânica exata que será revelada por Decifrar Intenção. A ação será resolvida no próximo turno de Raid.",
          "Describe the public telegraph and, separately, the exact mechanics revealed by Decipher Intent. The action resolves on the next Raid turn."
        )}</p>
        <div class="form-group">
          <label>${text("Nome", "Name")}</label>
          <input type="text" name="name" value="${escapeHtml(defaultName)}" />
        </div>
        <div class="form-group">
          <label>${text("Pista / coreografia pública", "Public telegraph / choreography")}</label>
          <textarea name="telegraph" rows="4"></textarea>
        </div>
        <div class="form-group">
          <label>${text("Mecânica exata (secreta até ser decifrada ou resolvida)", "Exact mechanics (secret until deciphered or resolved)")}</label>
          <textarea name="mechanics" rows="6">${escapeHtml(defaultMechanics)}</textarea>
        </div>
      </div>`,
    buttons: [
      {
        action: "prepare",
        label: text("Preparar", "Prepare"),
        default: true,
        callback: (_event, button) => {
          const elements = button.form?.elements;
          const name = String(elements?.name?.value ?? "").trim() || text("Ação de Raid", "Raid Action");
          const telegraph = String(elements?.telegraph?.value ?? "").trim();
          const mechanics = String(elements?.mechanics?.value ?? "").trim();
          if (!telegraph) {
            ui.notifications.warn(text(
              "Uma Raid Action precisa de uma pista/coreografia pública.",
              "A Raid Action needs a public telegraph/choreography."
            ));
            return null;
          }
          return {
            id: raidActionId(actor, game.combat ?? null, round),
            name,
            telegraph,
            mechanics,
            telegraphedRound: round,
            resolvesRound: round + Math.max(1, number(config.telegraphRounds, 1)),
            decipherIntentTn: config.decipherIntentTn,
            attempts: {},
            createdAt: Date.now()
          };
        }
      },
      {
        action: "skip",
        label: text("Sem nova Raid Action", "No new Raid Action"),
        callback: () => null
      }
    ],
    close: () => null,
    rejectClose: false
  });
}

function pendingRaidActions(state) {
  if (Array.isArray(state?.pendingActions) && state.pendingActions.length) {
    return state.pendingActions.filter(Boolean);
  }
  return state?.pendingAction ? [state.pendingAction] : [];
}

function seenRaidActions(state) {
  return Array.isArray(state?.seenActions) ? state.seenActions.filter(Boolean) : [];
}

function raidSeenKey(action) {
  return `${String(action?.name ?? "").trim().toLowerCase()}::${String(action?.telegraph ?? "").trim().toLowerCase()}`;
}

function rememberResolvedRaidAction(state, action) {
  if (!action) return;
  state.seenActions ??= [];
  const key = raidSeenKey(action);
  if (!key) return;
  const existingIndex = state.seenActions.findIndex((entry) => raidSeenKey(entry) === key);
  const remembered = {
    name: String(action.name ?? text("Ação de Raid", "Raid Action")),
    telegraph: String(action.telegraph ?? ""),
    secretMessageId: String(action.secretMessageId ?? ""),
    firstSeenRound: Number(action.telegraphedRound ?? 0),
    lastResolvedRound: Number(action.resolvesRound ?? 0)
  };
  if (existingIndex >= 0) state.seenActions[existingIndex] = { ...state.seenActions[existingIndex], ...remembered };
  else state.seenActions.push(remembered);
}

async function promptRaidActionMode(state) {
  const seen = seenRaidActions(state);
  if (seen.length < 2) return "single";
  return foundry.applications.api.DialogV2.wait({
    window: { title: text("Quantidade de Raid Actions", "Raid Action Count") },
    content: `<div class="dda-roll-dialog"><p>${text(
      "Você pode preparar uma Raid Action nova, ou duas simultâneas escolhidas apenas entre ações que já foram vistas pelo menos uma vez.",
      "You may prepare one new Raid Action, or two simultaneous actions chosen only from actions that have already been seen at least once."
    )}</p></div>`,
    buttons: [
      { action: "single", label: text("1 Raid Action", "1 Raid Action"), default: true, callback: () => "single" },
      { action: "double", label: text("2 já vistas", "2 previously seen"), callback: () => "double" }
    ],
    close: () => "single",
    rejectClose: false
  });
}

async function promptDoubleSeenRaidActions(actor, config, state, round) {
  const seen = seenRaidActions(state);
  if (seen.length < 2) return [];
  const options = seen.map((entry, index) => `<option value="${index}">${escapeHtml(entry.name)}</option>`).join("");
  const selection = await foundry.applications.api.DialogV2.wait({
    window: { title: `${actor.name} — ${text("Duas Raid Actions", "Two Raid Actions")}` },
    content: `
      <div class="dda-roll-dialog dda-raid-double-dialog">
        <p>${text(
          "As duas ações simultâneas devem ter sido vistas anteriormente. Selecione duas diferentes.",
          "Both simultaneous actions must have been seen previously. Choose two different actions."
        )}</p>
        <div class="form-group"><label>${text("Primeira", "First")}</label><select name="first">${options}</select></div>
        <div class="form-group"><label>${text("Segunda", "Second")}</label><select name="second">${options}</select></div>
      </div>`,
    buttons: [
      {
        action: "prepare",
        label: text("Preparar as duas", "Prepare both"),
        default: true,
        callback: (_event, button) => {
          const first = Number(button.form?.elements?.first?.value ?? -1);
          const second = Number(button.form?.elements?.second?.value ?? -1);
          if (first < 0 || second < 0 || first === second) {
            ui.notifications.warn(text("Selecione duas Raid Actions diferentes.", "Choose two different Raid Actions."));
            return null;
          }
          return [seen[first], seen[second]].filter(Boolean);
        }
      },
      { action: "cancel", label: text("Cancelar", "Cancel"), callback: () => null }
    ],
    close: () => null,
    rejectClose: false
  });
  if (!Array.isArray(selection) || selection.length !== 2) return [];
  return selection.map((entry) => ({
    id: raidActionId(actor, game.combat ?? null, round),
    name: String(entry.name ?? text("Ação de Raid", "Raid Action")),
    telegraph: String(entry.telegraph ?? ""),
    secretMessageId: String(entry.secretMessageId ?? ""),
    telegraphedRound: round,
    resolvesRound: round + Math.max(1, number(config.telegraphRounds, 1)),
    decipherIntentTn: config.decipherIntentTn,
    attempts: {},
    reusedSeenAction: true,
    createdAt: Date.now()
  }));
}

async function createRaidTelegraphMessage(actor, combat, action) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: {
      [SYSTEM_ID]: {
        raidActionPrompt: {
          combatId: String(combat.id ?? ""),
          bossActorUuid: String(actor.uuid ?? ""),
          actionId: String(action.id ?? ""),
          tn: Number(action.decipherIntentTn ?? 0)
        }
      }
    },
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-raid-action-card">
        <h2>${escapeHtml(text("Ação de Raid — Preparando", "Raid Action — Telegraph"))}</h2>
        <p><strong>${escapeHtml(actor.name)}</strong>: ${escapeHtml(action.name)}</p>
        <p>${escapeHtml(action.telegraph)}</p>
        <p><strong>${escapeHtml(text("Resolve no próximo turno de Raid.", "Resolves on the next Raid turn."))}</strong></p>
        <button type="button" data-action="dda-raid-decipher-intent">
          ${escapeHtml(text("Decifrar Intenção (Interrupt)", "Decipher Intent (Interrupt)"))} — TN ${Number(action.decipherIntentTn ?? 0)}
        </button>
      </div>`
  });
}

async function createRaidResolutionMessage(actor, action) {
  const mechanics = getRaidActionMechanics(action);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-negative dda-raid-action-resolution-card">
        <h2>${escapeHtml(text("Ação de Raid — RESOLVE", "Raid Action — RESOLVES"))}</h2>
        <p><strong>${escapeHtml(action?.name ?? text("Ação de Raid", "Raid Action"))}</strong></p>
        ${mechanics ? `<p>${escapeHtml(mechanics).replaceAll("\n", "<br>")}</p>` : `<p>${escapeHtml(text("O Mestre resolve a mecânica configurada para esta Raid Action.", "The GM resolves the configured mechanics for this Raid Action."))}</p>`}
      </div>`
  });
}

function isFriendlyRaidDecipherActor(actor, bossActor) {
  if (!actor || actor.id === bossActor?.id) return false;
  if (["character", "digimon"].includes(actor.type)) return true;
  if (actor.type !== "npc") return false;
  const metadata = actor.getFlag?.(SYSTEM_ID, "enemyNpc") ?? actor.system?.enemy ?? {};
  return Boolean(metadata?.isAlly || String(metadata?.alignment ?? "").toLowerCase() === "ally");
}

async function chooseRaidDecipherActor(bossActor, combat) {
  const candidates = [];
  const seen = new Set();
  for (const combatant of combat?.combatants?.contents ?? []) {
    const actor = combatant.actor;
    if (!isFriendlyRaidDecipherActor(actor, bossActor)) continue;
    if (!game.user?.isGM && !actor.isOwner) continue;
    const key = actor.uuid ?? actor.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push(actor);
  }
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const options = candidates.map((actor) => `<option value="${escapeHtml(actor.uuid)}">${escapeHtml(actor.name)}</option>`).join("");
  const uuid = await foundry.applications.api.DialogV2.wait({
    window: { title: text("Decifrar Intenção", "Decipher Intent") },
    content: `<div class="dda-roll-dialog"><p>${text("Quem fará o teste como Interrupt Action?", "Who makes the Check as an Interrupt Action?")}</p><select name="actorUuid">${options}</select></div>`,
    buttons: [
      { action: "choose", label: text("Escolher", "Choose"), default: true, callback: (_event, button) => String(button.form?.elements?.actorUuid?.value ?? "") },
      { action: "cancel", label: text("Cancelar", "Cancel"), callback: () => "" }
    ],
    close: () => "",
    rejectClose: false
  });
  return candidates.find((actor) => actor.uuid === uuid) ?? null;
}

async function payRaidDecipherInterrupt(actor) {
  if (actor?.type === "character") {
    const { spendActorActions } = await import("./action-economy.js");
    return spendActorActions(actor, 1, { requireActiveUnit: false, notify: true });
  }
  if (["digimon", "npc"].includes(actor?.type)) {
    const { payPartnerInterruptAction } = await import("./tamer-actions.js");
    return payPartnerInterruptAction(actor, {
      reason: text("Decifrar Intenção — Ação de Raid", "Decipher Intent — Raid Action"),
      partnerActionCost: 1
    });
  }
  return null;
}

async function rollRaidDecipherIntent(actor, tn, bossActor) {
  if (actor?.type === "character") {
    const { rollTamerCheck } = await import("../rolls/check-roll.js");
    return rollTamerCheck(actor, "decipherIntent", {
      fixedTn: tn,
      title: text("Decifrar Intenção — Ação de Raid", "Decipher Intent — Raid Action"),
      offerNarrativeTalents: false
    });
  }

  const { rollDerivedCheck } = await import("../rules/quality-automation.js");
  return rollDerivedCheck(actor, "bit", {
    skillKey: "decipherIntent",
    tn,
    title: text("Decifrar Intenção — Ação de Raid", "Decipher Intent — Raid Action"),
    targetActor: bossActor
  });
}

function raidCheckSucceeded(result) {
  const outcome = String(result?.outcome?.key ?? result?.outcome ?? "").toLowerCase();
  return Boolean(result?.success || outcome === "success" || outcome === "criticalsuccess");
}

async function whisperRaidMechanics(actor, bossActor, action, result, recipientUserId = game.user?.id) {
  const mechanics = getRaidActionMechanics(action) || text(
    "A Raid Action não possui mecânica secreta adicional configurada.",
    "This Raid Action has no additional secret mechanics configured."
  );
  const whisper = [...new Set([
    ...(recipientUserId ? [recipientUserId] : []),
    ...ChatMessage.getWhisperRecipients("GM").map((user) => user.id)
  ])];

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper,
    content: `
      <div class="dda-chat-card dda-effect-card effect-positive dda-raid-decipher-card">
        <h2>${escapeHtml(text("Decifrar Intenção — Sucesso", "Decipher Intent — Success"))}</h2>
        <p><strong>${escapeHtml(actor.name)}</strong> ${escapeHtml(text("decifrou", "deciphered"))} <strong>${escapeHtml(action.name)}</strong> (${escapeHtml(bossActor.name)}).</p>
        <p>${escapeHtml(mechanics).replaceAll("\n", "<br>")}</p>
        <p>${escapeHtml(text("Resultado", "Result"))}: <strong>${escapeHtml(String(result?.outcome?.label ?? result?.outcome ?? result?.total ?? ""))}</strong></p>
      </div>`
  });
}

export async function performRaidDecipherIntent(prompt = {}) {
  const combat = game.combats?.get(String(prompt.combatId ?? "")) ?? game.combat;
  if (!combat?.started) return null;
  const bossDocument = await fromUuid(String(prompt.bossActorUuid ?? ""));
  const bossActor = bossDocument?.documentName === "Token" ? bossDocument.actor : bossDocument;
  if (!bossActor) return null;

  let state = getRaidBossRuntimeState(bossActor, combat);
  const action = pendingRaidActions(state).find((entry) => String(entry.id ?? "") === String(prompt.actionId ?? ""));
  if (!action) {
    ui.notifications.warn(text("Esta Raid Action não está mais pendente.", "This Raid Action is no longer pending."));
    return null;
  }

  const actor = await chooseRaidDecipherActor(bossActor, combat);
  if (!actor) return null;
  const attemptKey = String(actor.uuid ?? actor.id);
  if (action.attempts?.[attemptKey]) {
    ui.notifications.warn(text("Este participante já tentou decifrar esta Raid Action.", "This participant already tried to decipher this Raid Action."));
    return null;
  }

  const payment = await payRaidDecipherInterrupt(actor);
  if (!payment) return null;

  const tn = Number(getRaidBossConfig(bossActor)?.decipherIntentTn ?? action.decipherIntentTn ?? prompt.tn ?? 0);
  const result = await rollRaidDecipherIntent(actor, tn, bossActor);
  const success = raidCheckSucceeded(result);

  const resultPayload = {
    combatId: String(combat.id ?? ""),
    bossActorUuid: String(bossActor.uuid ?? ""),
    actionId: String(action.id ?? ""),
    actorUuid: String(actor.uuid ?? ""),
    actorName: String(actor.name ?? ""),
    requestingUserId: String(game.user?.id ?? ""),
    tn,
    total: Number(result?.total ?? 0),
    outcome: String(result?.outcome?.key ?? result?.outcome ?? "")
  };

  if (game.user?.isGM) {
    await recordRaidDecipherResult(resultPayload);
  } else {
    game.socket?.emit?.(`system.${SYSTEM_ID}`, {
      action: RAID_DECIPHER_SOCKET,
      ...resultPayload
    });
  }

  return { actor, bossActor, action, result, success, payment };
}

async function recordRaidDecipherResult(payload = {}) {
  if (!game.user?.isGM) return null;
  const combat = game.combats?.get(String(payload.combatId ?? "")) ?? game.combat;
  if (!combat?.started) return null;
  const bossDocument = await fromUuid(String(payload.bossActorUuid ?? ""));
  const bossActor = bossDocument?.documentName === "Token" ? bossDocument.actor : bossDocument;
  const actorDocument = await fromUuid(String(payload.actorUuid ?? ""));
  const actor = actorDocument?.documentName === "Token" ? actorDocument.actor : actorDocument;
  if (!bossActor || !actor) return null;

  const requestingUser = game.users?.get(String(payload.requestingUserId ?? ""));
  if (requestingUser && !requestingUser.isGM && !actor.testUserPermission?.(requestingUser, "OWNER")) {
    console.warn("DDA | Rejected Raid Action decipher result from a user who does not own the rolling Actor.");
    return null;
  }

  let state = getRaidBossRuntimeState(bossActor, combat);
  const action = pendingRaidActions(state).find((entry) => String(entry.id ?? "") === String(payload.actionId ?? ""));
  if (!action) return null;

  const attemptKey = String(actor.uuid ?? actor.id);
  if (action.attempts?.[attemptKey]) return null;

  const liveTn = Number(getRaidBossConfig(bossActor)?.decipherIntentTn ?? payload.tn ?? action.decipherIntentTn ?? 0);
  const total = Number(payload.total ?? 0);
  const success = Number.isFinite(total) && total >= liveTn;

  const attempts = { ...(action.attempts ?? {}) };
  attempts[attemptKey] = {
    actorUuid: attemptKey,
    actorName: String(actor.name ?? payload.actorName ?? ""),
    userId: String(payload.requestingUserId ?? ""),
    tn: liveTn,
    total,
    outcome: String(payload.outcome ?? ""),
    success,
    attemptedAt: Date.now()
  };
  const nextPending = pendingRaidActions(state).map((entry) =>
    String(entry.id ?? "") === String(action.id ?? "") ? { ...entry, attempts } : entry
  );
  state.pendingActions = nextPending;
  state.pendingAction = nextPending[0] ?? null;
  await saveRaidBossRuntimeState(bossActor, combat, state);

  const storedAction = nextPending.find((entry) => String(entry.id ?? "") === String(action.id ?? "")) ?? action;
  if (success) {
    await whisperRaidMechanics(
      actor,
      bossActor,
      storedAction,
      { total, outcome: payload.outcome },
      String(payload.requestingUserId ?? "")
    );
  }

  return { success, total, tn: liveTn };
}

export async function bindRaidActionChatCard(message, root) {
  if (!root?.querySelector) return;
  const prompt = message?.getFlag?.(SYSTEM_ID, "raidActionPrompt");
  if (!prompt) return;
  const button = root.querySelector("[data-action='dda-raid-decipher-intent']");
  if (!button || button.dataset.bound === "true") return;
  button.dataset.bound = "true";
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    try {
      await performRaidDecipherIntent(prompt);
    } finally {
      button.disabled = false;
    }
  });
}

export async function processRaidActionTurn(combat, combatant) {
  if (!isPrimaryActiveGM() || !combat?.started || !isRaidActionCombatant(combatant)) return false;
  const ddaUnitId = String(combatant.getFlag?.(SYSTEM_ID, "initiative")?.unitId ?? "");
  if (!ddaUnitId.startsWith("raid:")) return false;
  const actor = getBossEncounterActorForCombatant(combatant, combat);
  const config = getRaidBossConfig(actor);
  const round = Math.max(1, number(combat.round, 1));

  /*
   * A technical Raid entry must never keep a defeated/disabled Boss acting or
   * trap the tracker if the Raid option was removed after initiative. A
   * Multi-Stage transition keeps system.combat.defeated false once the next
   * form is successfully established, so legitimate later stages still act.
   */
  if (!actor || !config || actor.system?.combat?.defeated || combatant.defeated) {
    await combatant.update({
      [`flags.${SYSTEM_ID}.initiative.endedRound`]: round
    });
    await combat.nextTurn();
    return true;
  }

  let state = await ensureRaidBossState(actor, combat);
  if (number(state?.lastProcessedRound, 0) === round) return false;

  const existingPending = pendingRaidActions(state);
  const due = existingPending.filter((action) => number(action.resolvesRound, round) <= round);
  const stillPending = existingPending.filter((action) => number(action.resolvesRound, round) > round);

  for (const action of due) {
    await createRaidResolutionMessage(actor, action);
    rememberResolvedRaidAction(state, action);
    state.lastResolvedAction = action;
  }

  state.pendingActions = stillPending;
  state.pendingAction = stillPending[0] ?? null;

  if (!stillPending.length) {
    const mode = await promptRaidActionMode(state);
    let nextActions = [];

    if (mode === "double") {
      nextActions = await promptDoubleSeenRaidActions(actor, config, state, round);
    } else {
      const nextAction = await promptRaidAction(actor, config, state, round);
      if (nextAction) nextActions = [await storeRaidActionSecret(actor, nextAction)];
    }

    state.pendingActions = nextActions;
    state.pendingAction = nextActions[0] ?? null;
    for (const action of nextActions) {
      await createRaidTelegraphMessage(actor, combat, action);
    }
  }

  state.lastProcessedRound = round;
  state.updatedAt = Date.now();
  await saveRaidBossRuntimeState(actor, combat, state);

  await combatant.update({
    [`flags.${SYSTEM_ID}.initiative.endedRound`]: round
  });

  await combat.nextTurn();
  return true;
}

function getMultiStageRuntimeMap(combat) {
  return foundry.utils.deepClone(combat?.getFlag?.(SYSTEM_ID, MULTISTAGE_RUNTIME_FLAG) ?? {});
}

export function getMultiStageBossRuntimeState(actor, combat = game.combat) {
  if (!actor || !combat) return null;
  const state = runtimeStateForActor(combat.getFlag?.(SYSTEM_ID, MULTISTAGE_RUNTIME_FLAG) ?? {}, actor);
  if (!state || String(state.combatId ?? "") !== String(combat.id ?? "")) return null;
  if (state.actorUuid && String(state.actorUuid) !== actorKey(actor)) return null;
  return foundry.utils.deepClone(state);
}

export function hasMultiStageBossContinuation(actor, combat = game.combat) {
  const config = getMultiStageBossConfig(actor);
  if (!config || !combat?.started) return false;
  const state = getMultiStageBossRuntimeState(actor, combat);
  const currentStage = Math.max(1, number(state?.currentStage, 1));
  const stageCount = Math.max(2, number(state?.stageCount ?? config.stageCount, config.stageCount));
  return currentStage < stageCount;
}

async function saveMultiStageBossRuntimeState(actor, combat, state) {
  const map = getMultiStageRuntimeMap(combat);
  migrateRuntimeMapEntry(map, actor, state);
  await combat.setFlag(SYSTEM_ID, MULTISTAGE_RUNTIME_FLAG, map);
  return state;
}

async function ensureMultiStageBossState(actor, combat) {
  const config = getMultiStageBossConfig(actor);
  if (!config) return null;
  const existing = getMultiStageBossRuntimeState(actor, combat);
  if (existing) {
    if (number(existing.stageCount, config.stageCount) !== config.stageCount) {
      existing.stageCount = config.stageCount;
      existing.updatedAt = Date.now();
      await saveMultiStageBossRuntimeState(actor, combat, existing);
    }
    return existing;
  }
  const state = {
    version: 1,
    combatId: String(combat.id ?? ""),
    actorId: String(actor.id ?? ""),
    actorUuid: String(actor.uuid ?? ""),
    currentStage: 1,
    stageCount: config.stageCount,
    transitioning: false,
    history: [],
    initializedAt: Date.now()
  };
  await saveMultiStageBossRuntimeState(actor, combat, state);
  return state;
}

export async function ensureMultiStageBossRuntime(combat = game.combat) {
  if (!game.user?.isGM || !combat) return [];
  const actors = new Map();
  for (const combatant of combat.combatants?.contents ?? []) {
    if (isTechnicalBossCombatant(combatant)) continue;
    const actor = combatant.actor;
    if (!actor || !getMultiStageBossConfig(actor)) continue;
    actors.set(actorKey(actor), actor);
  }
  const results = [];
  for (const actor of actors.values()) {
    results.push({ actor, config: getMultiStageBossConfig(actor), state: await ensureMultiStageBossState(actor, combat) });
  }
  return results;
}

export async function ensureBossEncounterRuntime(combat = game.combat) {
  if (isPrimaryActiveGM()) await cleanupBossEncounterRuntime(combat);
  const bossTemplate = await ensureBossTemplateRuntime(combat);
  const raid = await ensureRaidBossRuntime(combat);
  const multiStage = await ensureMultiStageBossRuntime(combat);
  return { bossTemplate, raid, multiStage };
}

async function chooseMultiStageTransition(actor, config, state) {
  const { qualityMatches } = await import("../rules/quality-automation.js");
  const modeQualities = (actor.items?.contents ?? []).filter((item) => item.type === "quality" && qualityMatches(item, "modeChange"));
  const modeQuality = modeQualities.find((item) => !Boolean(actor.system?.combat?.qualityModeChange?.active)) ?? null;

  if (!modeQuality) return { method: "evolution", quality: null };

  const method = await foundry.applications.api.DialogV2.wait({
    window: { title: `${actor.name} — ${text("Próxima fase", "Next Stage")}` },
    content: `
      <div class="dda-roll-dialog dda-multistage-transition-dialog">
        <p>${text(
          `Fase ${state.currentStage} de ${config.stageCount} foi derrotada. Escolha como a próxima forma será aplicada.`,
          `Stage ${state.currentStage} of ${config.stageCount} was defeated. Choose how the next form is applied.`
        )}</p>
        ${config.notes ? `<p class="hint">${escapeHtml(config.notes).replaceAll("\n", "<br>")}</p>` : ""}
      </div>`,
    buttons: [
      { action: "evolution", label: text("Evolução", "Evolution"), default: true, callback: () => "evolution" },
      { action: "mode", label: text("Mode Change", "Mode Change"), callback: () => "mode" },
      { action: "cancel", label: text("Cancelar", "Cancel"), callback: () => "" }
    ],
    close: () => "",
    rejectClose: false
  });
  return method ? { method, quality: method === "mode" ? modeQuality : null } : null;
}

async function restoreMultiStageFullWounds(actor) {
  const max = Math.max(1, number(actor.system?.miscStats?.wounds?.max, 1));
  await actor.update({
    "system.miscStats.wounds.value": max,
    "system.miscStats.wounds.temp.value": 0,
    "system.combat.defeated": false,
    "system.combat.incapacitated": false
  });
  return max;
}

async function updateBossTemplatePoolCapacityForStage(actor, woundsPerPool) {
  const metadata = foundry.utils.deepClone(actor.getFlag?.(SYSTEM_ID, "enemyNpc") ?? actor.system?.enemy ?? {});
  const template = metadata?.boss?.bossTemplate;
  if (!template) return;
  const poolCount = Math.max(1, number(template.poolCount ?? metadata?.boss?.partySize, 1));
  template.woundsPerPool = Math.max(1, number(woundsPerPool, 1));
  template.totalWoundCapacity = template.woundsPerPool * poolCount;
  await actor.update({
    [`flags.${SYSTEM_ID}.enemyNpc`]: metadata,
    "system.enemy": foundry.utils.deepClone(metadata)
  });
}

export async function resetBossTemplatePoolsForNewStage(actor, combat = game.combat) {
  if (!getBossTemplateConfig(actor) || !combat) return null;
  const woundsPerPool = Math.max(1, number(actor.system?.miscStats?.wounds?.max, 1));
  await updateBossTemplatePoolCapacityForStage(actor, woundsPerPool);
  const config = getBossTemplateConfig(actor);
  const state = await ensureBossTemplateState(actor, combat, config);
  const pools = state.pools.map((pool) => ({ ...pool, value: woundsPerPool, max: woundsPerPool }));
  const nextState = { ...state, woundsPerPool, pools, updatedAt: Date.now() };
  await saveState(actor, combat, nextState);
  await setBossTemplateDefeatedState(actor, false, combat);
  await actor.update({ "system.miscStats.wounds.value": woundsPerPool, "system.combat.defeated": false });
  return nextState;
}

export async function handleMultiStageBossDefeat(actor, { combat = game.combat } = {}) {
  if (!game.user?.isGM || !combat?.started || !actor) return null;
  const config = getMultiStageBossConfig(actor);
  if (!config) return null;

  let state = await ensureMultiStageBossState(actor, combat);
  if (!state || state.transitioning) return null;
  if (number(state.currentStage, 1) >= number(state.stageCount, config.stageCount)) {
    return { handled: false, finalStage: true, state };
  }

  state.transitioning = true;
  state.updatedAt = Date.now();
  await saveMultiStageBossRuntimeState(actor, combat, state);

  try {
    const choice = await chooseMultiStageTransition(actor, config, state);
    if (!choice) {
      state.transitioning = false;
      await saveMultiStageBossRuntimeState(actor, combat, state);
      return { handled: false, cancelled: true, state };
    }

    const previousName = actor.name;
    let transitioned = false;

    if (choice.method === "mode" && choice.quality) {
      const { useModeChangeQuality } = await import("../rules/mode-change.js");
      transitioned = await useModeChangeQuality(actor, choice.quality, {
        actionCostOverride: 0,
        freeSource: text("Boss Multi-Stage", "Multi-Stage Boss"),
        bypassCharmControl: true
      });
    } else {
      const { evolveIndependentDigimon } = await import("./evolution.js");
      transitioned = Boolean(await evolveIndependentDigimon(actor, {
        bypassCombatLock: true,
        skipConfirm: true,
        forceFullWounds: true,
        transitionReason: text("Transição automática de Boss Multi-Stage", "Automatic Multi-Stage Boss transition")
      }));
    }

    if (!transitioned) {
      state.transitioning = false;
      await saveMultiStageBossRuntimeState(actor, combat, state);
      ui.notifications.warn(text(
        "A próxima fase não pôde ser aplicada. O Boss permanece derrotado até a configuração ser corrigida.",
        "The next stage could not be applied. The Boss remains defeated until its configuration is fixed."
      ));
      return { handled: false, failed: true, state };
    }

    await restoreMultiStageFullWounds(actor);
    if (getBossTemplateConfig(actor)) await resetBossTemplatePoolsForNewStage(actor, combat);
    else await setBossTemplateDefeatedState(actor, false, combat);

    const nextStage = Math.min(config.stageCount, number(state.currentStage, 1) + 1);
    state.history ??= [];
    state.history.push({
      stage: number(state.currentStage, 1),
      previousName,
      nextName: actor.name,
      method: choice.method,
      endedAtRound: Math.max(1, number(combat.round, 1)),
      transitionedAt: Date.now()
    });
    state.currentStage = nextStage;
    state.stageCount = config.stageCount;
    state.transitioning = false;
    state.updatedAt = Date.now();
    await saveMultiStageBossRuntimeState(actor, combat, state);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div class="dda-chat-card dda-effect-card effect-special dda-multistage-boss-card">
          <h2>${escapeHtml(text("Boss Multi-Stage — Nova Fase", "Multi-Stage Boss — New Stage"))}</h2>
          <p><strong>${escapeHtml(previousName)}</strong> → <strong>${escapeHtml(actor.name)}</strong></p>
          <p>${escapeHtml(text("Fase", "Stage"))} <strong>${nextStage}/${config.stageCount}</strong>.</p>
          <p>${escapeHtml(text("Wound Boxes recuperadas por completo.", "Wound Boxes fully recovered."))}</p>
        </div>`
    });

    return { handled: true, state, stage: nextStage, method: choice.method };
  } catch (error) {
    state = getMultiStageBossRuntimeState(actor, combat) ?? state;
    state.transitioning = false;
    state.updatedAt = Date.now();
    await saveMultiStageBossRuntimeState(actor, combat, state);
    console.error("DDA | Multi-Stage Boss transition failed.", error);
    throw error;
  }
}
