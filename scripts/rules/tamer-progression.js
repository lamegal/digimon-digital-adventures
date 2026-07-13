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

export async function clearCampaignMilestoneHistory() {
  const ledger = getCampaignMilestoneLedger();
  const clearedRecords = ledger.records.length;

  ledger.records = [];

  const savedLedger =
    await setCampaignMilestoneLedger(
      ledger
    );

  return {
    clearedRecords,
    ledger: savedLedger
  };
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

export function getTamerMilestoneBreakdown(tamer) {
  const total = getTamerMilestoneCount(tamer);
  const seenMilestoneIds = new Set();

  let partyMilestones = 0;
  let recordedIndividualMilestones = 0;

  for (const entry of getMilestoneHistory(tamer)) {
    const milestoneId = String(entry?.milestoneId ?? "").trim();

    if (!milestoneId || seenMilestoneIds.has(milestoneId)) {
      continue;
    }

    seenMilestoneIds.add(milestoneId);

    if (normalizeScope(entry?.scope) === "individual") {
      recordedIndividualMilestones += 1;
    } else {
      partyMilestones += 1;
    }
  }

  const recordedTotal = partyMilestones + recordedIndividualMilestones;

  /*
   * Marcos antigos podem existir antes do histórico detalhado.
   * Eles são inferidos pela diferença entre o contador total e o histórico.
   */
  const inferredLegacyIndividualMilestones = Math.max(
    0,
    total - recordedTotal
  );

  /*
   * Crédito exclusivo de migração.
   *
   * Não cria um Marco novo e não altera o total de Marcos.
   * Serve apenas para preservar o cap de personagens que já possuíam
   * Atributos válidos no teto antigo antes da separação entre Marcos
   * de Equipe e Marcos Individuais.
   */
  const legacyIndividualCapCredit = integer(
    tamer?.system?.advancement?.milestones?.legacyIndividualCapCredit,
    0
  );

  return {
    total,
    partyMilestones,
    recordedIndividualMilestones,

    inferredLegacyIndividualMilestones,

    // Mantido para compatibilidade com o resumo/painel atual.
    legacyIndividualMilestones: inferredLegacyIndividualMilestones,

    legacyIndividualCapCredit,

    individualMilestones: (
      recordedIndividualMilestones +
      inferredLegacyIndividualMilestones +
      legacyIndividualCapCredit
    )
  };
}

/**
 * Progressão padrão:
 * 0–2 Marcos concluídos: cap inicial.
 * 3–5 Marcos concluídos: +1 cap.
 * 6+ Marcos concluídos: +2 cap,
 * até o teto final da campanha.
 *
 * Tanto Marcos de Equipe quanto Marcos
 * Individuais contam para liberar o teto.
 *
 * O escopo determina quem recebe o Marco,
 * não um tipo diferente de progressão.
 */
export function getTamerAttributeCap(
  tamer
) {
  const milestonesCompleted =
    getTamerMilestoneCount(
      tamer
    );

  const startingCap =
    integer(
      getAttributeStartingCap(),
      5
    );

  const finalCap =
    Math.max(
      startingCap,

      integer(
        getAttributeFinalCap(),
        7
      )
    );

  const capIncrease =
    Math.min(
      Math.max(
        0,
        finalCap - startingCap
      ),

      Math.floor(
        milestonesCompleted / 3
      )
    );

  return (
    startingCap +
    capIncrease
  );
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

  const milestones = getTamerMilestoneBreakdown(actor);

  return {
    milestonesCompleted: milestones.total,
    partyMilestones: milestones.partyMilestones,
    individualMilestones: milestones.individualMilestones,
    legacyIndividualMilestones: milestones.legacyIndividualMilestones,
    legacyIndividualCapCredit: milestones.legacyIndividualCapCredit,

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

    const milestonePackages = appendBonusDpPackage(partner, record);

    const sharedSpent = getSharedBonusDpSpent(
      partner,
      nextBonusDp
    );

    const bonusProgress = synchronizeBonusDpPackages(
      {
        system: {
          advancement: {
            bonusDp: {
              ...clone(partner.system?.advancement?.bonusDp),
              packages: milestonePackages
            }
          }
        }
      },
      nextBonusDp,
      sharedSpent
    );

    await partner.update({
      "system.advancement.bonusDp.total": bonusProgress.total,
      "system.advancement.bonusDp.sharedSpent": bonusProgress.spent,
      "system.advancement.bonusDp.remaining": bonusProgress.remaining,
      "system.advancement.bonusDp.packages": bonusProgress.packages,
      "system.creation.dp.bonus": bonusProgress.total,
      "system.creation.bonusDp": bonusProgress.total
    });

    const synchronizedBonusProgress =
      await synchronizePartnerBonusDpAcrossForms(
        partner,
        bonusProgress.total
      );

    tamerUpdates["system.partner.bonusDp"] =
      synchronizedBonusProgress?.total ?? bonusProgress.total;

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

function getCreationNumber(creation = {}, paths = [], fallback = 0) {
  for (const path of paths) {
    const value = foundry.utils.getProperty(creation, path);

    if (value === undefined || value === null || value === "") {
      continue;
    }

    const numeric = number(value, Number.NaN);

    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return fallback;
}

function getCreationSpendAllocation(creation = {}) {
  const dp = creation?.dp ?? {};

  const base = Math.max(
    0,
    getCreationNumber(creation, ["dp.base", "baseDp"], 0)
  );

  const storedTotalNegative = Math.max(
    0,
    getCreationNumber(
      creation,
      ["dp.totalNegative", "totalNegativeDp"],
      Number.NaN
    )
  );

  const explicitManualNegative = getCreationNumber(
    creation,
    ["dp.manualNegative", "manualNegativeDp"],
    Number.NaN
  );

  const explicitQualityNegative = getCreationNumber(
    creation,
    ["dp.negativeFromQualities", "negativeQualityDp"],
    Number.NaN
  );

  const legacyNegative = Math.max(
    0,
    getCreationNumber(creation, ["dp.negative", "negativeDp"], 0)
  );

  const manualNegative = Number.isFinite(explicitManualNegative)
    ? Math.max(0, explicitManualNegative)
    : (
      Number.isFinite(storedTotalNegative) &&
      Number.isFinite(explicitQualityNegative)
    )
      ? Math.max(0, storedTotalNegative - explicitQualityNegative)
      : legacyNegative;

  const negativeFromQualities = Number.isFinite(explicitQualityNegative)
    ? Math.max(0, explicitQualityNegative)
    : Math.max(0, (
      Number.isFinite(storedTotalNegative)
        ? storedTotalNegative
        : manualNegative
    ) - manualNegative);

  const totalNegative = Number.isFinite(storedTotalNegative)
    ? Math.max(0, storedTotalNegative)
    : manualNegative + negativeFromQualities;

  const storedBaseStats = Math.max(
    0,
    getCreationNumber(creation, ["dp.spentBaseStats"], 0)
  );

  const storedBaseQualities = Math.max(
    0,
    getCreationNumber(creation, ["dp.spentBaseQualities"], 0)
  );

  const storedBonusStats = Math.max(
    0,
    getCreationNumber(creation, ["dp.spentBonusStats"], 0)
  );

  const storedBonusQualities = Math.max(
    0,
    getCreationNumber(creation, ["dp.spentBonusQualities"], 0)
  );

  const storedStats = storedBaseStats + storedBonusStats;
  const storedQualities = storedBaseQualities + storedBonusQualities;
  const bucketTotal = storedStats + storedQualities;

  const storedTotal = Math.max(
    0,
    getCreationNumber(
      creation,
      ["dp.spentTotal", "spentDp", "dp.spent"],
      0
    )
  );

  /*
   * Em versões antigas, `spentTotal` ignorava Atributos. Quando os
   * buckets forem maiores, eles preservam a compra real.
   */
  const spentTotal = Math.max(storedTotal, bucketTotal);

  let spentStats = storedStats;
  let spentQualities = storedQualities;

  if (spentStats + spentQualities < spentTotal) {
    spentQualities += spentTotal - (
      spentStats + spentQualities
    );
  }

  const localPool = base + totalNegative;

  const spentBaseStats = Math.min(
    spentStats,
    localPool
  );

  const localAfterStats = Math.max(
    0,
    localPool - spentBaseStats
  );

  const spentBaseQualities = Math.min(
    spentQualities,
    localAfterStats
  );

  const spentBonusStats = Math.max(
    0,
    spentStats - spentBaseStats
  );

  const spentBonusQualities = Math.max(
    0,
    spentQualities - spentBaseQualities
  );

  return {
    base,
    manualNegative,
    negativeFromQualities,
    totalNegative,
    localPool,

    spentStats,
    spentQualities,
    spentTotal,

    spentBaseStats,
    spentBaseQualities,
    spentBonusStats,
    spentBonusQualities,

    spentBaseTotal: (
      spentBaseStats +
      spentBaseQualities
    ),

    spentBonusTotal: (
      spentBonusStats +
      spentBonusQualities
    )
  };
}

function getFormEntrySourceUuid(
  snapshot = {},
  fallback = ""
) {
  return String(
    snapshot?.sourceFormUuid ??
    fallback ??
    ""
  ).trim();
}

function getPartnerFormCreationEntries(
  partner,
  extraSnapshot = null,
  options = {}
) {
  const entries = new Map();

  const insert = (snapshot = {}, fallback = "") => {
    const sourceFormUuid = getFormEntrySourceUuid(
      snapshot,
      fallback
    );

    if (!sourceFormUuid) return;

    entries.set(sourceFormUuid, {
      sourceFormUuid,
      creation: snapshot?.creation ?? {},
      updatedAt: String(snapshot?.updatedAt ?? "")
    });
  };

  for (const [key, snapshot] of Object.entries(
    partner?.system?.evolution?.formSnapshots ?? {}
  )) {
    insert(snapshot, key);
  }

  if (extraSnapshot) {
    insert(
      extraSnapshot,
      extraSnapshot?.key ?? options.extraFallbackKey ?? ""
    );
  }

  const currentSourceFormUuid = String(
    partner?.system?.evolution?.currentFormUuid ??
    partner?.system?.evolution?.sourceFormUuid ??
    ""
  ).trim();

  if (currentSourceFormUuid && partner?.system?.creation) {
    /*
     * O Actor persistente sempre vence o snapshot equivalente porque ele
     * representa a forma ativa mais recente.
     */
    entries.set(currentSourceFormUuid, {
      sourceFormUuid: currentSourceFormUuid,
      creation: partner.system.creation,
      updatedAt: new Date().toISOString()
    });
  }

  if (options.excludeSourceFormUuid) {
    entries.delete(
      String(options.excludeSourceFormUuid)
    );
  }

  return [...entries.values()];
}

function getCreationBonusSpent(
  creation = {},
  totalBonusDp = 0
) {
  const allocation = getCreationSpendAllocation(creation);

  return Math.min(
    Math.max(0, number(totalBonusDp, 0)),
    allocation.spentBonusTotal
  );
}

export function getSharedBonusDpSpent(
  partner,
  totalBonusDp = null,
  extraSnapshot = null,
  options = {}
) {
  const total = totalBonusDp === null
    ? getPartnerBonusDpTotal(null, partner)
    : Math.max(0, number(totalBonusDp, 0));

  const entries = getPartnerFormCreationEntries(
    partner,
    extraSnapshot,
    options
  );

  const calculated = entries.reduce((sum, entry) => {
    return sum + getCreationBonusSpent(
      entry.creation,
      total
    );
  }, 0);

  const stored = Math.max(
    0,
    number(
      partner?.system?.advancement?.bonusDp?.sharedSpent,
      0
    )
  );

  const spent = entries.length
    ? calculated
    : stored;

  return Math.min(total, Math.max(0, spent));
}

/*
 * Para abrir uma forma no Wizard, ela pode reutilizar o próprio Bonus DP
 * já gasto nela, mas nunca o Bonus DP comprometido pelas outras formas.
 */
export function getPartnerFormBonusDpAvailable(
  partner,
  sourceFormUuid = "",
  totalBonusDp = null
) {
  const total = totalBonusDp === null
    ? getPartnerBonusDpTotal(null, partner)
    : Math.max(0, number(totalBonusDp, 0));

  const spentByOtherForms = getSharedBonusDpSpent(
    partner,
    total,
    null,
    {
      excludeSourceFormUuid: sourceFormUuid
    }
  );

  return Math.max(0, total - spentByOtherForms);
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
    return sum + Math.max(
      0,
      integer(entry?.points, 0)
    );
  }, 0);

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
    packageEntry.remaining = Math.max(
      0,
      points - packageSpent
    );

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

    milestoneGranted: progress.packages.reduce(
      (sum, entry) => {
        return sum + Math.max(
          0,
          integer(entry?.points, 0)
        );
      },
      0
    ),

    milestoneRemaining: progress.packages.reduce(
      (sum, entry) => {
        return sum + Math.max(
          0,
          integer(entry?.remaining, 0)
        );
      },
      0
    )
  };
}

function synchronizeBonusDpCreation(
  creation = {},
  totalBonusDp = 0,
  sharedSpent = 0
) {
  const next = clone(creation);
  next.dp = clone(next.dp ?? {});

  const allocation = getCreationSpendAllocation(next);

  const bonus = Math.max(
    0,
    number(totalBonusDp, 0)
  );

  const sharedRemaining = Math.max(
    0,
    bonus - Math.max(0, number(sharedSpent, 0))
  );

  const localRemaining = Math.max(
    0,
    allocation.localPool - allocation.spentBaseTotal
  );

  const total = Math.max(
    0,
    allocation.localPool + bonus
  );

  const remaining = Math.max(
    0,
    localRemaining + sharedRemaining
  );

  next.dp.base = allocation.base;
  next.dp.bonus = bonus;

  next.dp.manualNegative =
    allocation.manualNegative;

  next.dp.negative =
    allocation.manualNegative;

  next.dp.negativeFromQualities =
    allocation.negativeFromQualities;

  next.dp.totalNegative =
    allocation.totalNegative;

  next.dp.total = total;

  next.dp.spentBaseStats =
    allocation.spentBaseStats;

  next.dp.spentBaseQualities =
    allocation.spentBaseQualities;

  next.dp.spentBonusStats =
    allocation.spentBonusStats;

  next.dp.spentBonusQualities =
    allocation.spentBonusQualities;

  next.dp.spentTotal =
    allocation.spentTotal;

  next.dp.remaining = remaining;

  next.baseDp = allocation.base;
  next.bonusDp = bonus;
  next.manualNegativeDp =
    allocation.manualNegative;

  next.negativeDp =
    allocation.manualNegative;

  next.negativeQualityDp =
    allocation.negativeFromQualities;

  next.totalNegativeDp =
    allocation.totalNegative;

  next.totalDp = total;
  next.spentDp = allocation.spentTotal;
  next.remainingDp = remaining;

  return next;
}

function synchronizePartnerFormSnapshotBonusDp(
  partner,
  totalBonusDp,
  sharedSpent
) {
  const snapshots = clone(
    partner?.system?.evolution?.formSnapshots ?? {}
  );

  for (const snapshot of Object.values(snapshots)) {
    if (!snapshot || typeof snapshot !== "object") {
      continue;
    }

    snapshot.creation = synchronizeBonusDpCreation(
      snapshot.creation,
      totalBonusDp,
      sharedSpent
    );

    snapshot.updatedAt = nowIso();
  }

  return snapshots;
}

export async function synchronizePartnerBonusDpAcrossForms(
  partner,
  totalBonusDp = null
) {
  if (!partner || partner.type !== "digimon") {
    return null;
  }

  const total = totalBonusDp === null
    ? getPartnerBonusDpTotal(null, partner)
    : Math.max(0, number(totalBonusDp, 0));

  const sharedSpent = getSharedBonusDpSpent(
    partner,
    total
  );

  const progress = synchronizeBonusDpPackages(
    partner,
    total,
    sharedSpent
  );

  const currentCreation = synchronizeBonusDpCreation(
    partner.system?.creation,
    progress.total,
    progress.spent
  );

  const snapshots = synchronizePartnerFormSnapshotBonusDp(
    partner,
    progress.total,
    progress.spent
  );

  await partner.update({
    "system.advancement.bonusDp.total": progress.total,
    "system.advancement.bonusDp.sharedSpent": progress.spent,
    "system.advancement.bonusDp.remaining": progress.remaining,
    "system.advancement.bonusDp.packages": progress.packages,
    "system.creation": currentCreation,
    "system.evolution.formSnapshots": snapshots
  });

  partner.sheet?.render(false);

  return {
    ...progress,
    snapshotCount: Object.keys(snapshots).length
  };
}