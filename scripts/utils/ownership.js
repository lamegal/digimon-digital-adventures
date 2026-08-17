const DDA_SYSTEM_ID = "digimon-digital-adventures";

function localize(key) {
  return game?.i18n?.localize?.(key) ?? key;
}

function formatI18n(key, data = {}) {
  return game?.i18n?.format?.(key, data) ?? key;
}

function isActorDocument(actor) {
  return actor?.documentName === "Actor" || actor instanceof Actor;
}

function isWorldActor(actor) {
  return isActorDocument(actor) && !actor.pack;
}

function isCompendiumActor(actor) {
  return isActorDocument(actor) && Boolean(actor.pack);
}

function cloneOwnership(actor) {
  return foundry.utils.deepClone(actor?.ownership ?? {});
}

function getOwnerUserIds(actor) {
  const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

  return Object.entries(actor?.ownership ?? {})
    .filter(([userId, level]) => userId !== "default" && Number(level ?? 0) >= ownerLevel)
    .map(([userId]) => userId)
    .filter((userId) => Boolean(game.users?.get(userId)));
}

function buildOwnershipUpdate(actor, userIds = [], { defaultLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER } = {}) {
  const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const ownership = cloneOwnership(actor);
  let changed = false;

  if (Number(ownership.default ?? 0) < defaultLevel) {
    ownership.default = defaultLevel;
    changed = true;
  }

  for (const userId of userIds) {
    if (!userId || !game.users?.get(userId)) continue;

    if (Number(ownership[userId] ?? 0) < ownerLevel) {
      ownership[userId] = ownerLevel;
      changed = true;
    }
  }

  return changed ? ownership : null;
}

async function safeUpdateOwnership(actor, ownership, context = "") {
  if (!isWorldActor(actor) || !ownership) return false;

  try {
    await actor.update({ ownership });
    return true;
  } catch (error) {
    console.warn(`DDA | Não foi possível sincronizar permissões${context ? ` (${context})` : ""}.`, actor?.name, error);
    return false;
  }
}

export async function ensureActorOwner(actor, userId = game.user?.id, options = {}) {
  if (!isWorldActor(actor) || !userId) return false;

  const ownership = buildOwnershipUpdate(actor, [userId], options);
  return safeUpdateOwnership(actor, ownership, `ensureActorOwner:${actor.name}`);
}

export async function syncPartnerOwnershipFromTamer(tamerActor, partnerActor, options = {}) {
  if (!isWorldActor(tamerActor) || !isWorldActor(partnerActor)) return false;

  const ownerIds = getOwnerUserIds(tamerActor).filter((userId) => !game.users?.get(userId)?.isGM);

  if (!ownerIds.length) {
    if (game.user?.isGM && options.notifyNoPlayerOwner === true) {
      console.info(formatI18n("DDA.Ownership.NoPlayerOwnerForTamer", {
        tamer: tamerActor.name
      }));
    }

    return false;
  }

  const ownership = buildOwnershipUpdate(partnerActor, ownerIds, options);
  return safeUpdateOwnership(partnerActor, ownership, `${tamerActor.name} → ${partnerActor.name}`);
}

export async function syncTamerOwnershipFromPartner(tamerActor, partnerActor, options = {}) {
  if (!isWorldActor(tamerActor) || !isWorldActor(partnerActor)) return false;

  const ownerIds = getOwnerUserIds(partnerActor).filter((userId) => !game.users?.get(userId)?.isGM);
  if (!ownerIds.length) return false;

  const ownership = buildOwnershipUpdate(tamerActor, ownerIds, options);
  return safeUpdateOwnership(tamerActor, ownership, `${partnerActor.name} → ${tamerActor.name}`);
}

export async function syncTamerAndPartnerOwnership(tamerActor, partnerActor, options = {}) {
  if (!isWorldActor(tamerActor) || !isWorldActor(partnerActor)) return false;

  const tamerOwners = getOwnerUserIds(tamerActor).filter((userId) => !game.users?.get(userId)?.isGM);
  const partnerOwners = getOwnerUserIds(partnerActor).filter((userId) => !game.users?.get(userId)?.isGM);
  const mergedOwners = Array.from(new Set([...tamerOwners, ...partnerOwners]));

  if (!mergedOwners.length) {
    if (game.user?.isGM && options.notifyNoPlayerOwner === true) {
      console.info(formatI18n("DDA.Ownership.NoPlayerOwnerForPair", {
        tamer: tamerActor.name,
        partner: partnerActor.name
      }));
    }

    return false;
  }
  const tamerOwnership = buildOwnershipUpdate(tamerActor, mergedOwners, options);
  const partnerOwnership = buildOwnershipUpdate(partnerActor, mergedOwners, options);

  const tamerChanged = await safeUpdateOwnership(tamerActor, tamerOwnership, `${partnerActor.name} → ${tamerActor.name}`);
  const partnerChanged = await safeUpdateOwnership(partnerActor, partnerOwnership, `${tamerActor.name} → ${partnerActor.name}`);

  return Boolean(tamerChanged || partnerChanged);
}

export async function resolveDdaActor(uuid) {
  if (!uuid) return null;

  try {
    const document = await fromUuid(uuid);
    return document?.documentName === "Actor" ? document : null;
  } catch (error) {
    console.warn("DDA | Não foi possível resolver Actor para sincronizar permissões:", uuid, error);
    return null;
  }
}

async function syncFromTamerActor(tamerActor, options = {}) {
  if (!isWorldActor(tamerActor) || tamerActor.type !== "character") return false;

  const partnerUuid = tamerActor.system?.partner?.uuid ?? "";
  const partnerActor = await resolveDdaActor(partnerUuid);

  if (!isWorldActor(partnerActor) || partnerActor.type !== "digimon") return false;

  return syncTamerAndPartnerOwnership(tamerActor, partnerActor, options);
}

async function syncFromDigimonActor(partnerActor, options = {}) {
  if (!isWorldActor(partnerActor) || partnerActor.type !== "digimon") return false;

  const tamerUuid = partnerActor.system?.tamer?.uuid ?? "";
  const tamerActor = await resolveDdaActor(tamerUuid);

  if (!isWorldActor(tamerActor) || tamerActor.type !== "character") return false;

  return syncTamerAndPartnerOwnership(tamerActor, partnerActor, options);
}

function hasRelevantOwnershipChange(changed = {}) {
  return Boolean(
    foundry.utils.hasProperty(changed, "ownership") ||
    foundry.utils.hasProperty(changed, "system.partner.uuid") ||
    foundry.utils.hasProperty(changed, "system.tamer.uuid")
  );
}

let syncing = false;

export async function syncExistingPartnerOwnership() {
  if (!game.user?.isGM) {
    return {
      checked: 0,
      synchronized: 0
    };
  }

  const actors = Array.from(game.actors ?? []);
  let checked = 0;
  let synchronized = 0;

  syncing = true;

  try {
    for (const actor of actors) {
      if (!isWorldActor(actor)) continue;
      if (actor.type !== "character" && actor.type !== "digimon") continue;

      const linkedActorUuid = actor.type === "character"
        ? actor.system?.partner?.uuid
        : actor.system?.tamer?.uuid;

      if (!linkedActorUuid) continue;

      checked += 1;

      const changed = actor.type === "character"
        ? await syncFromTamerActor(actor, { notifyNoPlayerOwner: false })
        : await syncFromDigimonActor(actor, { notifyNoPlayerOwner: false });

      if (changed) synchronized += 1;
    }
  } finally {
    syncing = false;
  }

  if (synchronized > 0) {
    console.log(`DDA | Partner ownership audit synchronized ${synchronized} linked Actors.`);
  }

  return {
    checked,
    synchronized
  };
}

export function registerOwnershipSyncHooks() {
  Hooks.on("createActor", async (actor) => {
    if (!isWorldActor(actor)) return;

    if (!game.user?.isGM) {
      await ensureActorOwner(actor, game.user?.id, { defaultLevel: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER });
    }

    if (actor.type === "character") await syncFromTamerActor(actor, { notifyNoPlayerOwner: false });
    if (actor.type === "digimon") await syncFromDigimonActor(actor, { notifyNoPlayerOwner: false });
  });

  Hooks.on("updateActor", async (actor, changed, options = {}) => {
    if (options?.ddaCharmDelegation) return;
    if (syncing || !isWorldActor(actor) || !hasRelevantOwnershipChange(changed)) return;

    syncing = true;
    try {
      if (actor.type === "character") await syncFromTamerActor(actor, { notifyNoPlayerOwner: false });
      if (actor.type === "digimon") await syncFromDigimonActor(actor, { notifyNoPlayerOwner: false });
    } finally {
      syncing = false;
    }
  });

  game.dda = game.dda ?? {};
  game.dda.ownership = {
    ensureActorOwner,
    syncPartnerOwnershipFromTamer,
    syncTamerOwnershipFromPartner,
    syncTamerAndPartnerOwnership,
    syncExistingPartnerOwnership,
    resolveDdaActor
    };

  console.log("DDA | Ownership sync hooks registered.");
}

export function canSyncOwnership(actor) {
  return isWorldActor(actor) && !isCompendiumActor(actor);
}
