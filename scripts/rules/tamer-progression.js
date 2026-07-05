import {
  getAttributeFinalCap,
  getAttributeStartingCap
} from "./campaign-rules.js";

function localize(key, fallback = key) {
  const value = game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

function formatI18n(key, data = {}, fallback = "") {
  const value = game?.i18n?.format?.(key, data);
  return value && value !== key ? value : (fallback || key);
}

export const DDA_SYSTEM_ID = "digimon-digital-adventures";
export const DDA_MILESTONE_LEDGER_SETTING = "campaignMilestoneLedger";
export const DDA_GROWTH_POINTS_PER_MILESTONE = 3;
export const DDA_BONUS_DP_PER_MILESTONE = 3;

/**
 * Mapa canônico de Atributos associados a cada Perícia de Tamer.
 * É usado tanto pela janela de Avanço quanto pela validação da ficha.
 */
export const DDA_TAMER_SKILL_ATTRIBUTES = {
  evade: ["agility", "willpower"],
  precision: ["agility", "intelligence"],
  stealth: ["agility", "body"],

  athletics: ["body", "agility"],
  endurance: ["body", "willpower"],
  featsOfStrength: ["body", "charisma"],

  manipulate: ["charisma", "body"],
  performance: ["charisma", "agility"],
  persuasion: ["charisma", "intelligence"],

  decipherIntent: ["intelligence", "charisma"],
  survival: ["intelligence", "willpower"],
  knowledge: ["intelligence"],

  awareness: ["willpower", "agility"],
  bravery: ["willpower", "body"],
  fortitude: ["willpower", "intelligence"]
};

function number(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function integer(value, fallback = 0) {
  return Math.max(0, Math.floor(number(value, fallback)));
}

function clone(value) {
  return foundry.utils.deepClone(value ?? {});
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeScope(scope = "party") {
  return scope === "individual" ? "individual" : "party";
}

function normalizeStatus(status = "pendingRest") {
  return ["pendingRest", "released", "partiallyReleased"].includes(status)
    ? status
    : "pendingRest";
}

function getRecordTargets(record = {}) {
  return Array.isArray(record.targets)
    ? record.targets
      .map((target) => ({
        tamerUuid: String(target?.tamerUuid ?? "").trim(),
        tamerName: String(target?.tamerName ?? "").trim(),
        partnerUuid: String(target?.partnerUuid ?? "").trim(),
        partnerName: String(target?.partnerName ?? "").trim()
      }))
      .filter((target) => target.tamerUuid)
    : [];
}

function normalizeMilestoneRecord(record = {}) {
  return {
    id: String(record?.id ?? foundry.utils.randomID()),
    sequence: integer(record?.sequence, 0),
    scope: normalizeScope(record?.scope),
    status: normalizeStatus(record?.status),
    method: String(record?.method ?? "narrative").trim() || "narrative",
    note: String(record?.note ?? "").trim(),
    grantedAt: String(record?.grantedAt ?? "").trim(),
    grantedBy: {
      id: String(record?.grantedBy?.id ?? "").trim(),
      name: String(record?.grantedBy?.name ?? "").trim()
    },
    releasedAt: String(record?.releasedAt ?? "").trim(),
    releasedBy: {
      id: String(record?.releasedBy?.id ?? "").trim(),
      name: String(record?.releasedBy?.name ?? "").trim()
    },
    targets: getRecordTargets(record),
    results: Array.isArray(record?.results) ? clone(record.results) : []
  };
}

export function getCampaignMilestoneLedger() {
  const fallback = {
    version: 1,
    method: "narrative",
    experience: {
      value: 0,
      max: 7
    },
    records: []
  };

  let stored = fallback;

  try {
    stored = game.settings.get(
      DDA_SYSTEM_ID,
      DDA_MILESTONE_LEDGER_SETTING
    ) ?? fallback;
  } catch (_error) {
    stored = fallback;
  }

  const raw = clone(stored);
  const records = Array.isArray(raw.records)
    ? raw.records.map(normalizeMilestoneRecord)
    : [];

  return {
    version: Math.max(1, integer(raw.version, 1)),
    method: String(raw.method ?? "narrative").trim() || "narrative",
    experience: {
      value: integer(raw.experience?.value, 0),
      max: Math.max(1, integer(raw.experience?.max, 7))
    },
    records
  };
}

export async function setCampaignMilestoneLedger(ledger) {
  if (!game.user?.isGM) {
    throw new Error(localize(
  "DDA.Progression.Warning.OnlyGM",
  "Only the GM can manage campaign milestones."
));
  }

  const normalized = {
    ...getCampaignMilestoneLedger(),
    ...clone(ledger ?? {})
  };

  normalized.records = Array.isArray(normalized.records)
    ? normalized.records.map(normalizeMilestoneRecord)
    : [];

  await game.settings.set(
    DDA_SYSTEM_ID,
    DDA_MILESTONE_LEDGER_SETTING,
    normalized
  );

  return normalized;
}

export async function resolveDdaActor(uuid = "") {
  const cleanUuid = String(uuid ?? "").trim();
  if (!cleanUuid) return null;

  try {
    const document = await fromUuid(cleanUuid);
    return document?.documentName === "Actor"
      ? document
      : null;
  } catch (error) {
    console.warn(
      "DDA | Could not resolve milestone Actor UUID:",
      cleanUuid,
      error
    );

    return null;
  }
}

export function getTamerMilestoneCount(tamer) {
  return integer(
    tamer?.system?.advancement?.milestones?.completed,
    0
  );
}

/**
 * Progressão padrão:
 * 0–2 Marcos: cap inicial.
 * 3–5 Marcos: +1 cap.
 * 6+ Marcos: +2 cap.
 *
 * Campanhas Classic e Extreme preservam os caps configurados no sistema.
 */
export function getTamerAttributeCap(tamer) {
  const milestones = getTamerMilestoneCount(tamer);
  const startingCap = integer(getAttributeStartingCap(), 5);
  const finalCap = Math.max(
    startingCap,
    integer(getAttributeFinalCap(), 7)
  );

  const capIncrease = Math.min(
    Math.max(0, finalCap - startingCap),
    Math.floor(milestones / 3)
  );

  return startingCap + capIncrease;
}

export function getSkillAssociatedAttributes(skillKey = "") {
  return DDA_TAMER_SKILL_ATTRIBUTES[skillKey] ?? [];
}

export function getTamerSkillCap(
  tamer,
  skillKey,
  attributeOverrides = {}
) {
  const attributes = tamer?.system?.attributes ?? {};
  const associated = getSkillAssociatedAttributes(skillKey);

  if (!associated.length) return 0;

  return Math.max(
    ...associated.map((attributeKey) => {
      const override = attributeOverrides?.[attributeKey];
      const value = override ??
        attributes?.[attributeKey]?.value ??
        0;

      return integer(value, 0);
    }),
    0
  );
}

function getGrowthPackages(actor) {
  const packages = actor?.system?.advancement?.growthPoints?.packages;

  if (!Array.isArray(packages)) {
    return [];
  }

  return packages.map((entry) => ({
    id: String(entry?.id ?? foundry.utils.randomID()),
    milestoneId: String(entry?.milestoneId ?? "").trim(),
    scope: normalizeScope(entry?.scope),
    points: Math.max(
      1,
      integer(entry?.points, DDA_GROWTH_POINTS_PER_MILESTONE)
    ),
    remaining: integer(
      entry?.remaining,
      entry?.points ?? DDA_GROWTH_POINTS_PER_MILESTONE
    ),
    spent: integer(entry?.spent, 0),
    status: String(entry?.status ?? "available").trim() || "available",
    note: String(entry?.note ?? "").trim(),
    grantedAt: String(entry?.grantedAt ?? "").trim(),
    releasedAt: String(entry?.releasedAt ?? "").trim()
  }));
}

export function getTamerGrowthPackages(actor) {
  return getGrowthPackages(actor);
}

export function getNextTamerGrowthPackage(actor) {
  const packageEntry = getGrowthPackages(actor)
    .find((entry) => entry.remaining > 0);

  if (packageEntry) {
    return packageEntry;
  }

  const legacyAvailable = integer(
    actor?.system?.advancement?.growthPoints?.available,
    0
  );

  if (legacyAvailable >= DDA_GROWTH_POINTS_PER_MILESTONE) {
    return {
      id: "legacy-growth-pool",
      milestoneId: "",
      scope: "individual",
      points: DDA_GROWTH_POINTS_PER_MILESTONE,
      remaining: DDA_GROWTH_POINTS_PER_MILESTONE,
      spent: 0,
      status: "legacy",
      note: "",
      grantedAt: "",
      releasedAt: "",
      legacy: true
    };
  }

  return null;
}

export function getTamerProgressSummary(actor) {
  const packages = getGrowthPackages(actor);
  const available = integer(
    actor?.system?.advancement?.growthPoints?.available,
    0
  );

  return {
    milestonesCompleted: getTamerMilestoneCount(actor),
    attributeCap: getTamerAttributeCap(actor),
    growthPointsAvailable: available,
    pendingGrowthPackages: packages.filter(
      (entry) => entry.remaining > 0
    ),
    nextGrowthPackage: getNextTamerGrowthPackage(actor)
  };
}

function getMilestoneHistory(actor) {
  const history = actor?.system?.advancement?.milestones?.history;

  return Array.isArray(history)
    ? clone(history)
    : [];
}

function appendGrowthPackage(actor, record) {
  const packages = getGrowthPackages(actor);

  const existing = packages.find(
    (entry) => entry.milestoneId === record.id
  );

  if (existing) {
    return packages;
  }

  packages.push({
    id: `gp-${record.id}`,
    milestoneId: record.id,
    scope: record.scope,
    points: DDA_GROWTH_POINTS_PER_MILESTONE,
    remaining: DDA_GROWTH_POINTS_PER_MILESTONE,
    spent: 0,
    status: "available",
    note: record.note,
    grantedAt: record.grantedAt,
    releasedAt: record.releasedAt
  });

  return packages;
}

function appendBonusDpPackage(partner, record) {
  const current = partner?.system?.advancement?.bonusDp?.packages;

  const packages = Array.isArray(current)
    ? clone(current)
    : [];

  if (packages.some((entry) => entry?.milestoneId === record.id)) {
    return packages;
  }

  packages.push({
    id: `bonus-dp-${record.id}`,
    milestoneId: record.id,
    scope: record.scope,
    points: DDA_BONUS_DP_PER_MILESTONE,
    remaining: DDA_BONUS_DP_PER_MILESTONE,
    spent: 0,
    status: "available",
    note: record.note,
    grantedAt: record.grantedAt,
    releasedAt: record.releasedAt
  });

  return packages;
}

function getPartnerBonusDpTotal(tamer, partner) {
  return Math.max(
    integer(tamer?.system?.partner?.bonusDp, 0),
    integer(partner?.system?.advancement?.bonusDp?.total, 0),
    integer(partner?.system?.creation?.dp?.bonus, 0),
    integer(partner?.system?.creation?.bonusDp, 0)
  );
}

async function releaseMilestoneToTarget(record, target) {
  const tamer = await resolveDdaActor(target.tamerUuid);

  if (!tamer || tamer.type !== "character") {
    return {
      tamerUuid: target.tamerUuid,
      tamerName: target.tamerName,
      partnerUuid: target.partnerUuid,
      partnerName: target.partnerName,
      status: "missingTamer"
    };
  }

  const history = getMilestoneHistory(tamer);

  const alreadyReceived = history.some(
    (entry) => entry?.milestoneId === record.id
  );

  const currentCompleted = getTamerMilestoneCount(tamer);

  const currentGrowth = integer(
    tamer.system?.advancement?.growthPoints?.available,
    0
  );

  const growthPackages = appendGrowthPackage(tamer, record);

  if (!alreadyReceived) {
    history.push({
      milestoneId: record.id,
      sequence: record.sequence,
      scope: record.scope,
      note: record.note,
      grantedAt: record.grantedAt,
      releasedAt: record.releasedAt,
      growthSpentAt: ""
    });
  }

  const partner = await resolveDdaActor(
    tamer.system?.partner?.uuid ||
    target.partnerUuid
  );

  const tamerUpdates = {
    "system.advancement.milestones.completed": alreadyReceived
      ? currentCompleted
      : currentCompleted + 1,

    "system.advancement.milestones.history": history,

    "system.advancement.growthPoints.available": alreadyReceived
      ? currentGrowth
      : currentGrowth + DDA_GROWTH_POINTS_PER_MILESTONE,

    "system.advancement.growthPoints.packages": growthPackages
  };

  let partnerStatus = "missingPartner";

  if (partner?.type === "digimon") {
    const existingPackages = Array.isArray(
      partner.system?.advancement?.bonusDp?.packages
    )
      ? partner.system.advancement.bonusDp.packages
      : [];

    const partnerAlreadyReceived = existingPackages.some((entry) => {
      return entry?.milestoneId === record.id;
    });

    const previousBonusDp = getPartnerBonusDpTotal(tamer, partner);

    const nextBonusDp = partnerAlreadyReceived
      ? previousBonusDp
      : previousBonusDp + DDA_BONUS_DP_PER_MILESTONE;
    const spentStats = integer(
      partner.system?.advancement?.bonusDp?.spentStats,
      0
    );

    const spentQualities = integer(
      partner.system?.advancement?.bonusDp?.spentQualities,
      0
    );

    tamerUpdates["system.partner.bonusDp"] = nextBonusDp;

    await partner.update({
      "system.advancement.bonusDp.total": nextBonusDp,
      "system.advancement.bonusDp.remaining": Math.max(
        0,
        nextBonusDp - spentStats - spentQualities
      ),
      "system.advancement.bonusDp.packages": appendBonusDpPackage(
        partner,
        record
      ),
      "system.creation.dp.bonus": nextBonusDp,
      "system.creation.bonusDp": nextBonusDp
    });

    partner.sheet?.render(false);
    partnerStatus = "released";
  }

  await tamer.update(tamerUpdates);
  tamer.sheet?.render(false);

  return {
    tamerUuid: tamer.uuid,
    tamerName: tamer.name,
    partnerUuid: partner?.uuid ?? target.partnerUuid,
    partnerName: partner?.name ?? target.partnerName,
    status: partnerStatus === "released"
      ? "released"
      : "partiallyReleased",
    partnerStatus
  };
}

export async function createPendingCampaignMilestone({
  scope = "party",
  targets = [],
  note = "",
  method = "narrative"
} = {}) {
  if (!game.user?.isGM) {
    throw new Error(localize(
  "DDA.Progression.Warning.OnlyGM",
  "Only the GM can manage campaign milestones."
));
  }

  const normalizedTargets = getRecordTargets({ targets });
  const cleanNote = String(note ?? "").trim();

  if (!normalizedTargets.length) {
    throw new Error(localize(
  "DDA.Progression.Warning.NoMilestoneTargets",
  "A Milestone needs at least one Tamer target."
));
  }

  if (!cleanNote) {
    throw new Error(localize(
  "DDA.Progression.Warning.MilestoneReasonRequired",
  "A Milestone needs a reason."
));
  }

  const ledger = getCampaignMilestoneLedger();

  const record = normalizeMilestoneRecord({
    id: foundry.utils.randomID(),
    sequence: ledger.records.length + 1,
    scope,
    status: "pendingRest",
    method,
    note: cleanNote,
    grantedAt: nowIso(),
    grantedBy: {
      id: game.user?.id ?? "",
      name: game.user?.name ?? ""
    },
    targets: normalizedTargets,
    results: []
  });

  ledger.records.push(record);

  await setCampaignMilestoneLedger(ledger);

  return record;
}

export async function releasePendingCampaignMilestones(recordIds = null) {
  if (!game.user?.isGM) {
    throw new Error(localize(
  "DDA.Progression.Warning.OnlyGM",
  "Only the GM can manage campaign milestones."
));
  }

  const wantedIds = Array.isArray(recordIds)
    ? new Set(
      recordIds
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
    )
    : null;

  const ledger = getCampaignMilestoneLedger();

  let releasedRecords = 0;
  let releasedTargets = 0;
  let missingTargets = 0;

  for (const record of ledger.records) {
    if (!["pendingRest", "partiallyReleased"].includes(record.status)) continue;
    if (wantedIds && !wantedIds.has(record.id)) continue;

    record.releasedAt = nowIso();
    record.releasedBy = {
      id: game.user?.id ?? "",
      name: game.user?.name ?? ""
    };

    record.results = [];

    for (const target of record.targets) {
      const result = await releaseMilestoneToTarget(record, target);

      record.results.push(result);

      if (result.status === "released") {
        releasedTargets += 1;
      } else {
        missingTargets += 1;
      }
    }

    record.status = record.results.every(
      (result) => result.status === "released"
    )
      ? "released"
      : "partiallyReleased";

    releasedRecords += 1;
  }

  await setCampaignMilestoneLedger(ledger);

  return {
    releasedRecords,
    releasedTargets,
    missingTargets,
    ledger
  };
}

export function getCampaignMilestoneSummary() {
  const ledger = getCampaignMilestoneLedger();
  const records = ledger.records;

  return {
    ...ledger,
    pendingRecords: records.filter(
      (record) => record.status === "pendingRest"
    ),
    releasedPartyCount: records.filter(
      (record) => record.scope === "party" &&
        record.status === "released"
    ).length,
    releasedIndividualCount: records.filter(
      (record) => record.scope === "individual" &&
        record.status === "released"
    ).length,
    history: [...records].reverse()
  };
}

export function validateTamerGrowthSpend(
  actor,
  draft = {},
  packageEntry = null
) {
  if (!actor || actor.type !== "character") {
    return {
      ok: false,
      message: localize(
  "DDA.Progression.Warning.TamerOnly",
  "Only a Tamer can spend Growth Points."
)
    };
  }

  const activePackage = packageEntry ??
    getNextTamerGrowthPackage(actor);

  if (!activePackage) {
    return {
      ok: false,
      message: localize(
  "DDA.Progression.Warning.NoGrowthPackage",
  "There is no Growth Point package available."
)
    };
  }

  const mode = String(draft.mode ?? "").trim();
  const attributeChanges = draft.attributes ?? {};
  const skillChanges = draft.skills ?? {};

  const attributeKeys = Object.keys(attributeChanges)
    .filter((key) => integer(attributeChanges[key], 0) > 0);

  const skillTotal = Object.values(skillChanges)
    .reduce((total, value) => {
      return total + integer(value, 0);
    }, 0);

  if (mode === "attribute") {
    if (
      attributeKeys.length !== 1 ||
      integer(attributeChanges[attributeKeys[0]], 0) !== 1 ||
      skillTotal !== 0
    ) {
      return {
        ok: false,
        message: formatI18n(
  "DDA.Progression.Warning.AttributePackageExact",
  { points: activePackage.remaining },
  `Increasing an Attribute requires all ${activePackage.remaining} Growth Points from this Milestone.`
)
      };
    }

    const attributeKey = attributeKeys[0];

    const current = integer(
      actor.system?.attributes?.[attributeKey]?.value,
      0
    );

    const cap = getTamerAttributeCap(actor);

    if (current + 1 > cap) {
      return {
        ok: false,
        message: formatI18n(
  "DDA.Progression.Warning.AttributeAtCap",
  { cap },
  `This Attribute is already at the current cap (${cap}).`
)
      };
    }

    return {
      ok: true,
      mode,
      package: activePackage
    };
  }

  if (mode === "skills") {
    if (
      attributeKeys.length ||
      skillTotal !== activePackage.remaining
    ) {
      return {
        ok: false,
        message: formatI18n(
  "DDA.Progression.Warning.SkillPackageExact",
  { points: activePackage.remaining },
  `Allocate exactly ${activePackage.remaining} Growth Points among Skills.`
)
      };
    }

    for (const [skillKey, rawIncrease] of Object.entries(skillChanges)) {
      const increase = integer(rawIncrease, 0);
      if (!increase) continue;

      const current = integer(
        actor.system?.skills?.[skillKey]?.value,
        0
      );

      const cap = getTamerSkillCap(actor, skillKey);

      if (current + increase > cap) {
        return {
          ok: false,
          message: localize(
  "DDA.Progression.Warning.SkillAboveAssociatedAttribute",
  "A Skill cannot exceed its highest associated Attribute."
)
        };
      }
    }

    return {
      ok: true,
      mode,
      package: activePackage
    };
  }

  return {
    ok: false,
    message: localize(
  "DDA.Progression.Warning.ChooseGrowthMode",
  "Choose whether this Milestone increases an Attribute or Skills."
)
  };
}

export async function spendTamerGrowthPackage(
  actor,
  draft = {},
  packageEntry = null
) {
  const validation = validateTamerGrowthSpend(
    actor,
    draft,
    packageEntry
  );

  if (!validation.ok) {
    return validation;
  }

  const packageToSpend = validation.package;
  const updates = {};

  if (validation.mode === "attribute") {
    const attributeKey = Object.keys(draft.attributes ?? {})
      .find((key) => integer(draft.attributes?.[key], 0) > 0);

    const current = integer(
      actor.system?.attributes?.[attributeKey]?.value,
      0
    );

    updates[`system.attributes.${attributeKey}.value`] = current + 1;
  }

  if (validation.mode === "skills") {
    for (const [skillKey, rawIncrease] of Object.entries(
      draft.skills ?? {}
    )) {
      const increase = integer(rawIncrease, 0);
      if (!increase) continue;

      const current = integer(
        actor.system?.skills?.[skillKey]?.value,
        0
      );

      updates[`system.skills.${skillKey}.value`] = current + increase;
    }
  }

  const currentAvailable = integer(
    actor.system?.advancement?.growthPoints?.available,
    0
  );

  updates["system.advancement.growthPoints.available"] = Math.max(
    0,
    currentAvailable - packageToSpend.remaining
  );

  updates["system.advancement.growthPoints.spent"] = integer(
    actor.system?.advancement?.growthPoints?.spent,
    0
  ) + packageToSpend.remaining;

  if (!packageToSpend.legacy) {
    const packages = getGrowthPackages(actor);

    const packageIndex = packages.findIndex(
      (entry) => entry.id === packageToSpend.id
    );

    if (packageIndex >= 0) {
      packages[packageIndex].spent = packages[packageIndex].points;
      packages[packageIndex].remaining = 0;
      packages[packageIndex].status = "spent";
      packages[packageIndex].spentAt = nowIso();
    }

    updates["system.advancement.growthPoints.packages"] = packages;

    const history = getMilestoneHistory(actor);

    const historyEntry = history.find(
      (entry) => entry?.milestoneId === packageToSpend.milestoneId
    );

    if (historyEntry) {
      historyEntry.growthSpentAt = nowIso();
    }

    updates["system.advancement.milestones.history"] = history;
  }

  await actor.update(updates);
  actor.sheet?.render(false);

  return {
    ok: true,
    mode: validation.mode,
    package: packageToSpend
  };
}

function getCreationBonusSpent(creation = {}, totalBonusDp = 0) {
  const dp = creation?.dp ?? {};

  const base = Math.max(
    0,
    number(dp.base ?? creation?.baseDp, 0)
  );

  const negative = Math.max(
    0,
    number(
      dp.negative ??
      creation?.negativeDp ??
      creation?.totalNegativeDp,
      0
    )
  );

  const spent = Math.max(
    0,
    number(
      dp.spentTotal ??
      creation?.spentDp ??
      dp.spent ??
      0,
      0
    )
  );

  return Math.min(
    Math.max(0, number(totalBonusDp, 0)),
    Math.max(0, spent - base - negative)
  );
}

export function getSharedBonusDpSpent(
  partner,
  totalBonusDp = null,
  extraSnapshot = null
) {
  const total = totalBonusDp === null
    ? getPartnerBonusDpTotal(null, partner)
    : Math.max(0, number(totalBonusDp, 0));

  const candidates = [
    partner?.system?.creation,
    ...Object.values(
      partner?.system?.evolution?.formSnapshots ?? {}
    ).map((snapshot) => snapshot?.creation),
    extraSnapshot?.creation
  ].filter(Boolean);

  const calculated = candidates.reduce(
    (highest, creation) => {
      return Math.max(
        highest,
        getCreationBonusSpent(creation, total)
      );
    },
    0
  );

  /**
   * Quando houver dados das formas, o gasto atual delas é a fonte de verdade.
   * Isso permite editar uma forma no Wizard e recuperar Bonus DP removido.
   * Em Actors legados sem snapshot, preservamos o valor antigo.
   */
  const stored = Math.max(
    0,
    number(
      partner?.system?.advancement?.bonusDp?.sharedSpent,
      0
    )
  );

  const spent = candidates.length
    ? calculated
    : stored;

  return Math.min(total, Math.max(0, spent));
}

export function synchronizeBonusDpPackages(
  partner,
  totalBonusDp,
  sharedSpent = null
) {
  const total = Math.max(0, number(totalBonusDp, 0));

  const spent = sharedSpent === null
    ? getSharedBonusDpSpent(partner, total)
    : Math.min(
      total,
      Math.max(0, number(sharedSpent, 0))
    );

  const packages = Array.isArray(
    partner?.system?.advancement?.bonusDp?.packages
  )
    ? clone(partner.system.advancement.bonusDp.packages)
    : [];

  const packageTotal = packages.reduce((sum, entry) => {
    return sum + Math.max(0, integer(entry?.points, 0));
  }, 0);

  /**
   * Bonus DP de campanhas antigas é consumido primeiro.
   * Só depois os pacotes originados por Marcos passam a ser gastos.
   */
  let packageSpendRemaining = Math.max(
    0,
    spent - Math.max(0, total - packageTotal)
  );

  for (const packageEntry of packages) {
    const points = Math.max(
      0,
      integer(packageEntry?.points, 0)
    );

    const packageSpent = Math.min(
      points,
      packageSpendRemaining
    );

    packageEntry.spent = packageSpent;
    packageEntry.remaining = Math.max(0, points - packageSpent);
    packageEntry.status = packageEntry.remaining > 0
      ? "available"
      : "spent";

    if (packageEntry.status === "spent" && !packageEntry.spentAt) {
      packageEntry.spentAt = nowIso();
    }

    packageSpendRemaining -= packageSpent;
  }

  return {
    total,
    spent,
    remaining: Math.max(0, total - spent),
    packages
  };
}

export function getDigimonBonusDpSummary(tamer, partner) {
  const total = getPartnerBonusDpTotal(tamer, partner);

  const progress = synchronizeBonusDpPackages(
    partner,
    total
  );

  return {
    ...progress,
    milestoneGranted: progress.packages.reduce((sum, entry) => {
      return sum + Math.max(0, integer(entry?.points, 0));
    }, 0),

    milestoneRemaining: progress.packages.reduce((sum, entry) => {
      return sum + Math.max(0, integer(entry?.remaining, 0));
    }, 0)
  };
}