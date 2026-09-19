import {
  getAttributeFinalCap,
  getAttributeStartingCap,
  getScaledTalentRequirement,
  getStartingSkillPoints
} from "./campaign-rules.js";

import {
  getDefaultRangeForMilestones,
  normalizeDefaultRangeTemplate,
  normalizeDefaultRangeValue
} from "./evolution-progression.js";

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
export const DDA_IP_PER_MILESTONE = 1;
export const DDA_XP_PER_MILESTONE = 7;
const DDA_PROGRESSION_SOCKET_ACTION = "ddaProgressionReleaseRestedMilestones";

function normalizeDefaultStagePolicy(value = "range") {
  return String(value ?? "").trim().toLowerCase() === "rookie" ? "rookie" : "range";
}
export const DDA_BONUS_DP_STAGE_ORDER = [
  "baby1",
  "baby2",
  "child",
  "adult",
  "perfect",
  "ultimate",
  "ultimatePlus"
];
export const DDA_BONUS_DP_STAT_KEYS = [
  "accuracy",
  "damage",
  "dodge",
  "armor",
  "health"
];

const DDA_DIGIMON_MAIN_STAT_MAX = 20;

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
      max: DDA_XP_PER_MILESTONE
    },
    evolution: {
      defaultRange: {
        template: "limited",
        manualValue: 2,
        defaultStagePolicy: "range"
      }
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
      max: Math.max(1, integer(raw.experience?.max, DDA_XP_PER_MILESTONE))
    },
    evolution: {
      defaultRange: {
        template: normalizeDefaultRangeTemplate(
          raw.evolution?.defaultRange?.template ?? "limited"
        ),
        manualValue: normalizeDefaultRangeValue(
          raw.evolution?.defaultRange?.manualValue ?? 2
        ),
        defaultStagePolicy: normalizeDefaultStagePolicy(
          raw.evolution?.defaultRange?.defaultStagePolicy ?? "range"
        )
      }
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

  normalized.evolution ??= {};
  normalized.evolution.defaultRange = {
    template: normalizeDefaultRangeTemplate(
      normalized.evolution?.defaultRange?.template ?? "limited"
    ),
    manualValue: normalizeDefaultRangeValue(
      normalized.evolution?.defaultRange?.manualValue ?? 2
    ),
    defaultStagePolicy: normalizeDefaultStagePolicy(
      normalized.evolution?.defaultRange?.defaultStagePolicy ?? "range"
    )
  };

  await game.settings.set(
    DDA_SYSTEM_ID,
    DDA_MILESTONE_LEDGER_SETTING,
    normalized
  );

  return normalized;
}

export async function setCampaignProgressionMethod(method = "narrative") {
  if (!game.user?.isGM) {
    throw new Error(localize(
      "DDA.Progression.Warning.OnlyGM",
      "Only the GM can manage campaign milestones."
    ));
  }

  const normalized = method === "xp" ? "xp" : "narrative";
  const ledger = getCampaignMilestoneLedger();
  ledger.method = normalized;
  return setCampaignMilestoneLedger(ledger);
}

export function getCampaignDefaultRangePolicy() {
  const ledger = getCampaignMilestoneLedger();
  const policy = ledger.evolution?.defaultRange ?? {};
  return {
    template: normalizeDefaultRangeTemplate(policy.template ?? "limited"),
    manualValue: normalizeDefaultRangeValue(policy.manualValue ?? 2),
    defaultStagePolicy: normalizeDefaultStagePolicy(policy.defaultStagePolicy ?? "range")
  };
}

export function getExpectedTamerDefaultRange(tamer, policy = getCampaignDefaultRangePolicy()) {
  const milestones = getTamerMilestoneCount(tamer);
  return getDefaultRangeForMilestones(milestones, policy);
}

export function getProjectedTamerDefaultRangeAfterRest(tamer, policy = getCampaignDefaultRangePolicy()) {
  if (!tamer || tamer.type !== "character") return 2;

  const historyIds = new Set(
    getMilestoneHistory(tamer)
      .map((entry) => String(entry?.milestoneId ?? ""))
      .filter(Boolean)
  );
  const ledger = getCampaignMilestoneLedger();
  let projectedMilestones = getTamerMilestoneCount(tamer);

  for (const record of ledger.records) {
    if (!["pendingRest", "partiallyReleased"].includes(record.status)) continue;
    if (historyIds.has(String(record.id))) continue;
    const targetsTamer = getRecordTargets(record).some(
      (target) => String(target.tamerUuid) === String(tamer.uuid)
    );
    if (targetsTamer) projectedMilestones += 1;
  }

  return getDefaultRangeForMilestones(projectedMilestones, policy);
}

export async function synchronizeCampaignDefaultRanges({ actors = null } = {}) {
  if (!game.user?.isGM) {
    throw new Error(localize(
      "DDA.Progression.Warning.OnlyGM",
      "Only the GM can manage campaign milestones."
    ));
  }

  const policy = getCampaignDefaultRangePolicy();
  const tamers = Array.from(actors ?? game.actors ?? [])
    .filter((actor) => actor?.type === "character");

  let updated = 0;
  for (const tamer of tamers) {
    const expected = getExpectedTamerDefaultRange(tamer, policy);
    const current = normalizeDefaultRangeValue(
      tamer.system?.evolution?.defaultRange?.value ?? 2
    );
    const currentTemplate = normalizeDefaultRangeTemplate(
      tamer.system?.evolution?.defaultRange?.template ?? "limited"
    );
    const currentManual = normalizeDefaultRangeValue(
      tamer.system?.evolution?.defaultRange?.manualValue ?? 2
    );
    const currentDefaultStagePolicy = normalizeDefaultStagePolicy(
      tamer.system?.evolution?.defaultRange?.defaultStagePolicy ?? "range"
    );

    if (
      current === expected &&
      currentTemplate === policy.template &&
      currentManual === policy.manualValue &&
      currentDefaultStagePolicy === policy.defaultStagePolicy
    ) {
      continue;
    }

    await tamer.update({
      "system.evolution.defaultRange.value": expected,
      "system.evolution.defaultRange.template": policy.template,
      "system.evolution.defaultRange.manualValue": policy.manualValue,
      "system.evolution.defaultRange.defaultStagePolicy": policy.defaultStagePolicy,
      "system.evolution.completedMilestones": getTamerMilestoneCount(tamer)
    });
    updated += 1;
  }

  return { updated, policy };
}

export async function setCampaignDefaultRangePolicy(template = "limited", manualValue = 2, defaultStagePolicy = null) {
  if (!game.user?.isGM) {
    throw new Error(localize(
      "DDA.Progression.Warning.OnlyGM",
      "Only the GM can manage campaign milestones."
    ));
  }

  const ledger = getCampaignMilestoneLedger();
  ledger.evolution ??= {};
  const currentPolicy = ledger.evolution?.defaultRange ?? {};
  ledger.evolution.defaultRange = {
    template: normalizeDefaultRangeTemplate(template),
    manualValue: normalizeDefaultRangeValue(manualValue),
    defaultStagePolicy: normalizeDefaultStagePolicy(
      defaultStagePolicy ?? currentPolicy.defaultStagePolicy ?? "range"
    )
  };

  await setCampaignMilestoneLedger(ledger);
  return synchronizeCampaignDefaultRanges();
}

export async function adjustCampaignExperience(amount = 0) {
  if (!game.user?.isGM) {
    throw new Error(localize(
      "DDA.Progression.Warning.OnlyGM",
      "Only the GM can manage campaign milestones."
    ));
  }

  const ledger = getCampaignMilestoneLedger();
  const delta = Math.trunc(number(amount, 0));
  ledger.experience.value = Math.max(0, integer(ledger.experience.value, 0) + delta);
  ledger.experience.max = Math.max(1, integer(ledger.experience.max, DDA_XP_PER_MILESTONE));

  const saved = await setCampaignMilestoneLedger(ledger);
  return {
    value: saved.experience.value,
    max: saved.experience.max,
    readyMilestones: Math.floor(saved.experience.value / saved.experience.max),
    ledger: saved
  };
}

export async function createXpCampaignMilestone({
  targets = [],
  note = ""
} = {}) {
  if (!game.user?.isGM) {
    throw new Error(localize(
      "DDA.Progression.Warning.OnlyGM",
      "Only the GM can manage campaign milestones."
    ));
  }

  const ledger = getCampaignMilestoneLedger();
  const xpCost = Math.max(1, integer(ledger.experience?.max, DDA_XP_PER_MILESTONE));
  const currentXp = integer(ledger.experience?.value, 0);

  if (currentXp < xpCost) {
    throw new Error(formatI18n(
      "DDA.Progression.Warning.NotEnoughXP",
      { current: currentXp, required: xpCost },
      `The party needs ${xpCost} XP to reach a Milestone.`
    ));
  }

  const normalizedTargets = getRecordTargets({ targets });
  if (!normalizedTargets.length) {
    throw new Error(localize(
      "DDA.Progression.Warning.NoMilestoneTargets",
      "A Milestone needs at least one Tamer target."
    ));
  }

  const cleanNote = String(note ?? "").trim() || formatI18n(
    "DDA.Progression.Default.XPMilestoneReason",
    { xp: xpCost },
    `Reached ${xpCost} XP.`
  );

  const record = normalizeMilestoneRecord({
    id: foundry.utils.randomID(),
    sequence: ledger.records.length + 1,
    scope: "party",
    status: "pendingRest",
    method: "xp",
    note: cleanNote,
    grantedAt: nowIso(),
    grantedBy: {
      id: game.user?.id ?? "",
      name: game.user?.name ?? ""
    },
    targets: normalizedTargets,
    results: []
  });

  ledger.experience.value = currentXp - xpCost;
  ledger.records.push(record);
  await setCampaignMilestoneLedger(ledger);

  return {
    record,
    experience: clone(ledger.experience)
  };
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

/**
 * Evolution Points unlock after the first Milestone and the maximum equals
 * the number of completed/released Milestones (8.05a).
 *
 * Milestones: 0  1  2  3  4  5  6
 * EP Max:     0  1  2  3  4  5  6
 */
export function getTamerEvolutionPointMaximum(
  tamer
) {
  return getTamerMilestoneCount(tamer);
}

/**
 * Normalize legacy/stale Evolution Point storage to the official maximum.
 *
 * DDA59 briefly used an incorrect reduced maximum. If a Tamer was saved with
 * that lower cap, capacity that never existed could not have been spent, so
 * increasing the cap also restores only that missing capacity while
 * preserving any EP that were actually spent from the stored pool.
 */
export async function normalizeTamerEvolutionPointPool(tamer) {
  if (!tamer || tamer.type !== "character") {
    return { changed: false, max: 0, value: 0 };
  }

  const max = getTamerEvolutionPointMaximum(tamer);
  const storedMax = Math.max(
    0,
    integer(tamer.system?.resources?.evolutionPoints?.max, 0)
  );
  const storedValue = Math.max(
    0,
    integer(tamer.system?.resources?.evolutionPoints?.value, 0)
  );
  const restoredCapacity = Math.max(0, max - storedMax);
  const value = Math.min(max, storedValue + restoredCapacity);

  if (storedMax === max && storedValue === value) {
    return { changed: false, max, value };
  }

  await tamer.update({
    "system.resources.evolutionPoints.max": max,
    "system.resources.evolutionPoints.value": value
  });

  return { changed: true, max, value };
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

const EXPERIENCED_REWARD_FLAG = "experiencedReward";

function getExperiencedStoredReward(tamer) {
  return clone(
    tamer?.getFlag?.(
      DDA_SYSTEM_ID,
      EXPERIENCED_REWARD_FLAG
    ) ?? {}
  );
}

function getTamerCurrentSkillTotal(tamer) {
  return Object.values(
    tamer?.system?.skills ?? {}
  ).reduce((total, skill) => {
    return total + integer(
      skill?.value,
      0
    );
  }, 0);
}

export function getExperiencedRewardState(tamer) {
  const requiredIntelligence =
    getScaledTalentRequirement(3);

  const currentIntelligence = integer(
    tamer?.system?.attributes
      ?.intelligence?.value,
    0
  );

  const unlocked =
    Boolean(
      tamer?.type === "character" &&
      currentIntelligence >=
        requiredIntelligence
    );

  const stored =
    getExperiencedStoredReward(
      tamer
    );

  const explicitlyClaimed =
    Boolean(
      stored.claimed
    );

  const milestonesCompleted =
    getTamerMilestoneCount(
      tamer
    );

  /*
   * Personagens que já começaram com Experienced podiam gastar
   * o ponto extra no Wizard antes deste registro existir.
   *
   * Quando ainda não há Marcos e o total de Perícias já excede
   * o orçamento inicial normal, consideramos o benefício aplicado.
   */
  const inferredFromCreation =
    unlocked &&
    !explicitlyClaimed &&
    milestonesCompleted <= 0 &&
    getTamerCurrentSkillTotal(tamer) >
      getStartingSkillPoints();

  return {
    unlocked,

    claimed:
      explicitlyClaimed ||
      inferredFromCreation,

    explicitlyClaimed,
    inferredFromCreation,

    pending:
      unlocked &&
      !explicitlyClaimed &&
      !inferredFromCreation,

    requiredIntelligence,
    currentIntelligence,

    claimedSkillKey:
      String(
        stored.skillKey ?? ""
      ).trim(),

    claimedMode:
      String(
        stored.mode ?? ""
      ).trim(),

    claimedAt:
      String(
        stored.claimedAt ?? ""
      ).trim(),

    claimedBy:
      clone(
        stored.claimedBy ?? {}
      )
  };
}

function buildExperiencedRewardRecord({
  skillKey = "",
  mode = "granted"
} = {}) {
  return {
    claimed: true,

    skillKey:
      String(
        skillKey ?? ""
      ).trim(),

    mode:
      String(
        mode ?? "granted"
      ).trim() || "granted",

    claimedAt:
      nowIso(),

    claimedBy: {
      id:
        String(
          game.user?.id ?? ""
        ).trim(),

      name:
        String(
          game.user?.name ?? ""
        ).trim()
    }
  };
}

export async function claimExperiencedSkillPoint(
  tamer,
  skillKey = ""
) {
  const state =
    getExperiencedRewardState(
      tamer
    );

  if (!state.unlocked) {
    return {
      ok: false,
      reason: "locked",

      message: localize(
        "DDA.TamerTalent.Experienced.Locked",
        "Experienced is not unlocked."
      )
    };
  }

  if (state.claimed) {
    return {
      ok: false,
      reason: "alreadyClaimed",

      message: localize(
        "DDA.TamerTalent.Experienced.AlreadyClaimed",
        "The extra Skill Point from Experienced has already been applied."
      )
    };
  }

  const cleanSkillKey =
    String(
      skillKey ?? ""
    ).trim();

  const skill =
    tamer.system?.skills
      ?.[cleanSkillKey];

  if (!skill) {
    return {
      ok: false,
      reason: "invalidSkill",

      message: localize(
        "DDA.TamerTalent.Experienced.InvalidSkill",
        "Choose a valid Skill."
      )
    };
  }

  const current = integer(
    skill.value,
    0
  );

  const cap =
    getTamerSkillCap(
      tamer,
      cleanSkillKey
    );

  if (current >= cap) {
    return {
      ok: false,
      reason: "skillAtCap",

      message: formatI18n(
        "DDA.TamerTalent.Experienced.SkillAtCap",
        {
          skill:
            localize(
              skill.label ??
              cleanSkillKey,
              cleanSkillKey
            ),

          cap
        },
        "This Skill is already at its current cap."
      )
    };
  }

  await tamer.update({
    [`system.skills.${cleanSkillKey}.value`]:
      current + 1,

    [`flags.${DDA_SYSTEM_ID}.${EXPERIENCED_REWARD_FLAG}`]:
      buildExperiencedRewardRecord({
        skillKey:
          cleanSkillKey,

        mode:
          "granted"
      })
  });

  tamer.sheet?.render(false);

  return {
    ok: true,

    skillKey:
      cleanSkillKey,

    skillLabel:
      localize(
        skill.label ??
        cleanSkillKey,
        cleanSkillKey
      ),

    before:
      current,

    after:
      current + 1,

    cap
  };
}

export async function markExperiencedRewardClaimed(
  tamer
) {
  const state =
    getExperiencedRewardState(
      tamer
    );

  if (!state.unlocked) {
    return {
      ok: false,
      reason: "locked",

      message: localize(
        "DDA.TamerTalent.Experienced.Locked",
        "Experienced is not unlocked."
      )
    };
  }

  if (state.claimed) {
    return {
      ok: false,
      reason: "alreadyClaimed",

      message: localize(
        "DDA.TamerTalent.Experienced.AlreadyClaimed",
        "The extra Skill Point from Experienced has already been applied."
      )
    };
  }

  await tamer.update({
    [`flags.${DDA_SYSTEM_ID}.${EXPERIENCED_REWARD_FLAG}`]:
      buildExperiencedRewardRecord({
        mode:
          "manual"
      })
  });

  tamer.sheet?.render(false);

  return {
    ok: true,
    mode: "manual"
  };
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

function normalizeSharedStatBonus(value = {}) {
  return Object.fromEntries(
    DDA_BONUS_DP_STAT_KEYS.map((key) => [
      key,
      integer(value?.[key], 0)
    ])
  );
}

function getSharedStatBonusTotal(value = {}) {
  const normalized = normalizeSharedStatBonus(value);
  return DDA_BONUS_DP_STAT_KEYS.reduce(
    (total, key) => total + integer(normalized[key], 0),
    0
  );
}

function getCreationSharedStatBonusApplied(creation = {}) {
  return normalizeSharedStatBonus(
    creation?.dp?.sharedStatBonusApplied ??
    creation?.sharedStatBonusApplied ??
    {}
  );
}

function getCreationQualitySpendTotal(creation = {}) {
  const dp = creation?.dp ?? {};
  const base = integer(dp.spentBaseQualities, 0);
  const bonus = integer(dp.spentBonusQualities, 0);
  const explicit = base + bonus;

  if (explicit > 0) return explicit;

  const allocation = getCreationSpendAllocation(creation);
  return integer(allocation.spentQualities, 0);
}

function getCreationLocalPool(creation = {}) {
  const allocation = getCreationSpendAllocation(creation);
  return Math.max(0, allocation.localPool);
}

function getFormStageValue(entry = {}) {
  const explicit = number(entry?.stageValue, Number.NaN);
  if (Number.isFinite(explicit)) return Math.max(1, explicit);

  const values = Object.values(entry?.mainStats ?? {})
    .map((stat) => number(stat?.creation?.startingBase, Number.NaN))
    .filter(Number.isFinite);

  return values.length ? Math.max(1, Math.min(...values)) : 1;
}

function getFormTotalStatSpend(entry = {}) {
  const stageValue = getFormStageValue(entry);

  return DDA_BONUS_DP_STAT_KEYS.reduce((total, key) => {
    const base = number(entry?.mainStats?.[key]?.base, stageValue);
    return total + Math.max(0, base - stageValue);
  }, 0);
}

function getPartnerFormAdvancementEntries(partner) {
  const entries = new Map();

  const insert = (snapshot = {}, fallback = "", isCurrent = false) => {
    const sourceFormUuid = String(
      snapshot?.sourceFormUuid ?? fallback ?? ""
    ).trim();

    if (!sourceFormUuid) return;

    entries.set(sourceFormUuid, {
      sourceFormUuid,
      name: String(
        snapshot?.species ??
        snapshot?.sourceFormName ??
        snapshot?.name ??
        sourceFormUuid
      ),
      stage: String(snapshot?.stage ?? "child"),
      stageValue: number(snapshot?.stageValue, Number.NaN),
      mainStats: clone(snapshot?.mainStats ?? {}),
      creation: clone(snapshot?.creation ?? {}),
      isCurrent
    });
  };

  for (const [key, snapshot] of Object.entries(
    partner?.system?.evolution?.formSnapshots ?? {}
  )) {
    insert(snapshot, key, false);
  }

  const currentSourceFormUuid = String(
    partner?.system?.evolution?.currentFormUuid ??
    partner?.system?.evolution?.sourceFormUuid ??
    partner?.uuid ??
    ""
  ).trim();

  if (currentSourceFormUuid) {
    entries.set(currentSourceFormUuid, {
      sourceFormUuid: currentSourceFormUuid,
      name: String(partner?.system?.species ?? partner?.name ?? currentSourceFormUuid),
      stage: String(partner?.system?.stage ?? "child"),
      stageValue: number(partner?.system?.stageValue, Number.NaN),
      mainStats: clone(partner?.system?.mainStats ?? {}),
      creation: clone(partner?.system?.creation ?? {}),
      isCurrent: true
    });
  }

  return [...entries.values()];
}

export function getPartnerBonusDpAllocation(partner, totalBonusDp = null) {
  const total = totalBonusDp === null
    ? getPartnerBonusDpTotal(null, partner)
    : integer(totalBonusDp, 0);

  const sharedStatBonus = normalizeSharedStatBonus(
    partner?.system?.advancement?.sharedStatBonus ?? {}
  );

  const statAllocated = getSharedStatBonusTotal(sharedStatBonus);

  const requestedQuality = integer(
    partner?.system?.advancement?.sharedQualityDp?.allocated,
    0
  );

  const qualityAllocated = requestedQuality;

  const allocated = statAllocated + qualityAllocated;

  return {
    total,
    sharedStatBonus,
    statAllocated,
    qualityAllocated,
    allocated,
    unallocated: Math.max(0, total - allocated)
  };
}

export function getPartnerBonusDpFormStatus(
  partner,
  allocationOverride = null
) {
  const baseAllocation = getPartnerBonusDpAllocation(partner);
  const allocation = allocationOverride
    ? {
        ...baseAllocation,
        ...allocationOverride,
        sharedStatBonus: normalizeSharedStatBonus(
          allocationOverride.sharedStatBonus ?? baseAllocation.sharedStatBonus
        )
      }
    : baseAllocation;

  allocation.statAllocated = getSharedStatBonusTotal(
    allocation.sharedStatBonus
  );
  allocation.qualityAllocated = integer(allocation.qualityAllocated, 0);
  allocation.allocated = allocation.statAllocated + allocation.qualityAllocated;
  allocation.unallocated = Math.max(0, allocation.total - allocation.allocated);

  const entries = getPartnerFormAdvancementEntries(partner);

  const forms = entries.map((entry) => {
    const eligible = entry.stage !== "baby1";
    const appliedMap = getCreationSharedStatBonusApplied(entry.creation);
    const appliedStatTotal = eligible
      ? getSharedStatBonusTotal(appliedMap)
      : 0;
    const totalStatSpend = getFormTotalStatSpend(entry);
    const localStatSpend = Math.max(0, totalStatSpend - appliedStatTotal);
    const qualitySpend = getCreationQualitySpendTotal(entry.creation);
    const localPool = getCreationLocalPool(entry.creation);
    const baseQualitySpend = eligible
      ? Math.max(0, qualitySpend - allocation.qualityAllocated)
      : qualitySpend;
    const localSpent = localStatSpend + baseQualitySpend;
    const baseRemaining = localPool - localSpent;
    const qualitySpent = eligible
      ? Math.min(allocation.qualityAllocated, qualitySpend)
      : 0;
    const qualityRemaining = eligible
      ? Math.max(0, allocation.qualityAllocated - qualitySpent)
      : 0;

    const statHeadroom = Object.fromEntries(
      DDA_BONUS_DP_STAT_KEYS.map((key) => {
        const currentBase = number(
          entry?.mainStats?.[key]?.base,
          getFormStageValue(entry)
        );
        const oldApplied = eligible ? integer(appliedMap[key], 0) : 0;
        const localBase = Math.max(1, currentBase - oldApplied);
        return [key, Math.max(0, DDA_DIGIMON_MAIN_STAT_MAX - localBase)];
      })
    );

    const proposedStatFits = DDA_BONUS_DP_STAT_KEYS.every((key) => {
      const target = eligible
        ? integer(allocation.sharedStatBonus[key], 0)
        : 0;
      return target <= statHeadroom[key];
    });

    let status = "notRequired";
    if (eligible && allocation.qualityAllocated > 0) {
      status = qualityRemaining > 0 ? "pending" : "complete";
    }

    if (baseRemaining < 0 || !proposedStatFits) {
      status = "invalid";
    }

    return {
      ...entry,
      eligible,
      localStatSpend,
      qualitySpend,
      localPool,
      baseQualitySpend,
      baseRemaining,
      qualitySpent,
      qualityRemaining,
      statHeadroom,
      proposedStatFits,
      status
    };
  });

  const eligibleForms = forms.filter((form) => form.eligible);

  return {
    ...allocation,
    forms,
    formCount: forms.length,
    eligibleFormCount: eligibleForms.length,
    parityComplete: eligibleForms.every((form) => form.status === "complete" || form.status === "notRequired"),
    hasPendingForms: eligibleForms.some((form) => form.status === "pending"),
    hasInvalidForms: forms.some((form) => form.status === "invalid")
  };
}

function applySharedStatBonusToMainStats(
  mainStats = {},
  creation = {},
  stageKey = "child",
  stageValue = 1,
  targetSharedStatBonus = {}
) {
  const nextStats = clone(mainStats);
  const eligible = String(stageKey) !== "baby1";
  const previousApplied = getCreationSharedStatBonusApplied(creation);
  const target = eligible
    ? normalizeSharedStatBonus(targetSharedStatBonus)
    : normalizeSharedStatBonus({});
  const fallbackBase = Math.max(1, number(stageValue, 1));

  for (const key of DDA_BONUS_DP_STAT_KEYS) {
    const stat = clone(nextStats[key] ?? {});
    const currentBase = number(stat.base, fallbackBase);
    const delta = integer(target[key], 0) - integer(previousApplied[key], 0);
    const base = Math.max(
      1,
      Math.min(DDA_DIGIMON_MAIN_STAT_MAX, currentBase + delta)
    );
    const bonus = number(stat.bonus, 0);
    const qualityBonus = number(stat.qualityBonus, 0);
    const total = Math.min(
      DDA_DIGIMON_MAIN_STAT_MAX,
      base + bonus + qualityBonus
    );

    nextStats[key] = {
      ...stat,
      base,
      total,
      value: total
    };
  }

  return nextStats;
}

function synchronizeBonusDpCreationAllocation(
  creation = {},
  totalBonusDp = 0,
  sharedStatBonus = {},
  qualityAllocated = 0,
  stageKey = "child"
) {
  const next = clone(creation);
  next.dp = clone(next.dp ?? {});

  const eligible = String(stageKey) !== "baby1";
  const total = eligible ? integer(totalBonusDp, 0) : 0;
  const targetStats = eligible
    ? normalizeSharedStatBonus(sharedStatBonus)
    : normalizeSharedStatBonus({});
  const statAllocated = eligible
    ? getSharedStatBonusTotal(targetStats)
    : 0;
  const qualityBudget = eligible
    ? integer(qualityAllocated, 0)
    : 0;

  const previousBaseStats = integer(next.dp.spentBaseStats, 0);
  const totalQualitySpend = getCreationQualitySpendTotal(next);
  const bonusQualitySpent = Math.min(qualityBudget, totalQualitySpend);
  const baseQualitySpent = Math.max(0, totalQualitySpend - bonusQualitySpent);

  const base = Math.max(0, getCreationNumber(next, ["dp.base", "baseDp"], 0));
  const allocation = getCreationSpendAllocation(next);
  const totalNegative = Math.max(0, allocation.totalNegative);
  const localPool = base + totalNegative;
  const spentTotal = previousBaseStats + statAllocated + baseQualitySpent + bonusQualitySpent;
  const totalDp = localPool + total;

  next.dp.base = base;
  next.dp.bonus = total;
  next.dp.spentBaseStats = previousBaseStats;
  next.dp.spentBonusStats = statAllocated;
  next.dp.spentBaseQualities = baseQualitySpent;
  next.dp.spentBonusQualities = bonusQualitySpent;
  next.dp.spentTotal = spentTotal;
  next.dp.remaining = totalDp - spentTotal;
  next.dp.total = totalDp;
  next.dp.sharedStatBonusApplied = targetStats;
  next.dp.sharedStatTotal = statAllocated;
  next.dp.sharedQualityAllocated = qualityBudget;
  next.dp.bonusUnallocated = Math.max(0, total - statAllocated - qualityBudget);

  next.baseDp = base;
  next.bonusDp = total;
  next.totalDp = totalDp;
  next.spentDp = spentTotal;
  next.remainingDp = next.dp.remaining;

  return next;
}

export async function updatePartnerBonusDpAllocation(
  partner,
  {
    sharedStatBonus = {},
    qualityAllocated = 0
  } = {}
) {
  if (!partner || partner.type !== "digimon") {
    return {
      ok: false,
      message: localize(
        "DDA.Progression.BonusDP.Warning.PartnerRequired",
        "A linked Partner Digimon is required."
      )
    };
  }

  if (!game.user?.isGM && !partner.isOwner) {
    return {
      ok: false,
      message: localize(
        "DDA.Warning.NoPermission",
        "You do not have permission to modify this Partner."
      )
    };
  }

  const total = getPartnerBonusDpTotal(null, partner);
  const normalizedStats = normalizeSharedStatBonus(sharedStatBonus);
  const statAllocated = getSharedStatBonusTotal(normalizedStats);
  const quality = integer(qualityAllocated, 0);

  // Budget and form consistency are advisory. Owners may save a draft build
  // and resolve its warnings with the GM later.
  const proposed = getPartnerBonusDpFormStatus(partner, {
    total, sharedStatBonus: normalizedStats, qualityAllocated: quality
  });
  const needsReview = statAllocated + quality > total || proposed.hasInvalidForms;

  await synchronizePartnerBonusDpAcrossForms(
    partner,
    total,
    {
      sharedStatBonus: normalizedStats,
      qualityAllocated: quality
    }
  );

  return {
    ok: true,
    needsReview,
    ...getPartnerBonusDpFormStatus(partner)
  };
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

  const currentCompleted =
    getTamerMilestoneCount(
      tamer
    );

  const currentGrowth =
    integer(
      tamer.system
        ?.advancement
        ?.growthPoints
        ?.available,
      0
    );

  const currentEvolutionPoints =
    integer(
      tamer.system
        ?.resources
        ?.evolutionPoints
        ?.value,
      0
    );

  const currentInspiration = integer(
    tamer.system?.resources?.ip?.value,
    0
  );

  const inspirationMaximum = Math.max(
    currentInspiration,
    integer(tamer.system?.resources?.ip?.max, currentInspiration)
  );

  const nextInspiration = alreadyReceived
    ? currentInspiration
    : Math.min(
        inspirationMaximum,
        currentInspiration + DDA_IP_PER_MILESTONE
      );

  const inspirationGranted = Math.max(
    0,
    nextInspiration - currentInspiration
  );

  const nextCompletedMilestones =
    alreadyReceived
      ? currentCompleted
      : currentCompleted + 1;

  const defaultRangePolicy = getCampaignDefaultRangePolicy();
  const nextDefaultRange = getDefaultRangeForMilestones(
    nextCompletedMilestones,
    defaultRangePolicy
  );

  const blastRecoveryMilestones = Array.isArray(
    tamer.system?.blastEvolution?.milestoneRecovery
  )
    ? tamer.system.blastEvolution.milestoneRecovery.map((value) => integer(value, -1))
    : [3, 6];
  const blastUsesMax = Math.max(0, integer(tamer.system?.blastEvolution?.uses?.max, 1));
  const currentBlastUses = Math.max(0, integer(tamer.system?.blastEvolution?.uses?.value, blastUsesMax));
  const recoverBlastUse = Boolean(
    !alreadyReceived &&
    blastUsesMax > 0 &&
    blastRecoveryMilestones.includes(nextCompletedMilestones)
  );
  const nextBlastUses = recoverBlastUse
    ? Math.min(blastUsesMax, currentBlastUses + 1)
    : Math.min(blastUsesMax, currentBlastUses);

  const currentEvolutionPointsMax = currentCompleted;
  const nextEvolutionPointsMax = nextCompletedMilestones;

  /*
   * Every completed Milestone increases the Evolution Point maximum by 1.
   * Preserve already-spent EP while making the newly unlocked point
   * immediately available when the Milestone benefits are released.
   */
  const unlockedEvolutionPointCapacity = Math.max(
    0,
    nextEvolutionPointsMax - currentEvolutionPointsMax
  );

  const nextEvolutionPointsValue =
    alreadyReceived
      ? Math.min(currentEvolutionPoints, nextEvolutionPointsMax)
      : Math.min(
          nextEvolutionPointsMax,
          currentEvolutionPoints + unlockedEvolutionPointCapacity
        );

  const growthPackages =
    appendGrowthPackage(
      tamer,
      record
    );

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
    "system.advancement.milestones.completed":
      nextCompletedMilestones,

    "system.advancement.milestones.history":
      history,

    "system.advancement.growthPoints.available":
      alreadyReceived
        ? currentGrowth
        : currentGrowth +
          DDA_GROWTH_POINTS_PER_MILESTONE,

    "system.advancement.growthPoints.packages":
      growthPackages,

    "system.resources.evolutionPoints.max":
      nextEvolutionPointsMax,

    "system.resources.evolutionPoints.value":
      nextEvolutionPointsValue,

    "system.resources.ip.value":
      nextInspiration,

    "system.evolution.defaultRange.value":
      nextDefaultRange,

    "system.evolution.defaultRange.template":
      defaultRangePolicy.template,

    "system.evolution.defaultRange.manualValue":
      defaultRangePolicy.manualValue,

    "system.evolution.defaultRange.defaultStagePolicy":
      defaultRangePolicy.defaultStagePolicy,

    "system.evolution.completedMilestones":
      nextCompletedMilestones,

    "system.blastEvolution.uses.value":
      nextBlastUses
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
      0
    );

    await partner.update({
      "system.advancement.bonusDp.total": bonusProgress.total,
      "system.advancement.bonusDp.sharedSpent": 0,
      "system.advancement.bonusDp.remaining": bonusProgress.total,
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
    partnerStatus,
    inspirationGranted
  };
}

function mergeMilestoneResult(record, result) {
  const existingResults = Array.isArray(record?.results)
    ? clone(record.results)
    : [];

  const resultKey = String(result?.tamerUuid ?? "").trim();
  const index = existingResults.findIndex((entry) => {
    return String(entry?.tamerUuid ?? "").trim() === resultKey;
  });

  const nextResult = {
    ...result,
    releasedAt: result?.releasedAt || nowIso()
  };

  if (index >= 0) existingResults[index] = nextResult;
  else existingResults.push(nextResult);

  record.results = existingResults;
  return existingResults;
}

function isMilestoneTargetReleased(record, tamerUuid = "") {
  const cleanUuid = String(tamerUuid ?? "").trim();
  return Array.isArray(record?.results) && record.results.some((entry) => {
    return String(entry?.tamerUuid ?? "").trim() === cleanUuid && entry?.status === "released";
  });
}

function refreshMilestoneRecordStatus(record) {
  const targetUuids = getRecordTargets(record).map((target) => target.tamerUuid);
  const fullyReleased = targetUuids.length > 0 && targetUuids.every((uuid) => {
    return isMilestoneTargetReleased(record, uuid);
  });

  record.status = fullyReleased
    ? "released"
    : (Array.isArray(record.results) && record.results.length > 0)
      ? "partiallyReleased"
      : "pendingRest";

  if (fullyReleased) {
    record.releasedAt = record.releasedAt || nowIso();
    record.releasedBy = {
      id: game.user?.id ?? "",
      name: game.user?.name ?? ""
    };
  }

  return record.status;
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
    ? new Set(recordIds.map((id) => String(id ?? "").trim()).filter(Boolean))
    : null;

  const ledger = getCampaignMilestoneLedger();
  let releasedRecords = 0;
  let releasedTargets = 0;
  let missingTargets = 0;
  let inspirationGranted = 0;

  for (const record of ledger.records) {
    if (!["pendingRest", "partiallyReleased"].includes(record.status)) continue;
    if (wantedIds && !wantedIds.has(record.id)) continue;

    let touched = false;

    for (const target of record.targets) {
      if (isMilestoneTargetReleased(record, target.tamerUuid)) continue;

      const releaseContext = {
        ...record,
        releasedAt: nowIso()
      };

      const result = await releaseMilestoneToTarget(releaseContext, target);
      mergeMilestoneResult(record, result);
      touched = true;

      if (result.status === "released") releasedTargets += 1;
      else missingTargets += 1;

      inspirationGranted += integer(result.inspirationGranted, 0);
    }

    const previousStatus = record.status;
    refreshMilestoneRecordStatus(record);

    if (touched || previousStatus !== record.status) releasedRecords += 1;
  }

  await setCampaignMilestoneLedger(ledger);

  return {
    releasedRecords,
    releasedTargets,
    missingTargets,
    inspirationGranted,
    ledger
  };
}

export async function releasePendingCampaignMilestonesForTamer(tamerUuid = "") {
  if (!game.user?.isGM) {
    throw new Error(localize(
      "DDA.Progression.Warning.OnlyGM",
      "Only the GM can manage campaign milestones."
    ));
  }

  const cleanUuid = String(tamerUuid ?? "").trim();
  if (!cleanUuid) {
    return { releasedRecords: 0, releasedTargets: 0, inspirationGranted: 0 };
  }

  const ledger = getCampaignMilestoneLedger();
  let releasedRecords = 0;
  let releasedTargets = 0;
  let inspirationGranted = 0;

  for (const record of ledger.records) {
    if (!["pendingRest", "partiallyReleased"].includes(record.status)) continue;

    const target = getRecordTargets(record).find((entry) => entry.tamerUuid === cleanUuid);
    if (!target || isMilestoneTargetReleased(record, cleanUuid)) continue;

    const releaseContext = {
      ...record,
      releasedAt: nowIso()
    };

    const result = await releaseMilestoneToTarget(releaseContext, target);
    mergeMilestoneResult(record, result);
    refreshMilestoneRecordStatus(record);

    releasedRecords += 1;
    if (result.status === "released") releasedTargets += 1;
    inspirationGranted += integer(result.inspirationGranted, 0);
  }

  await setCampaignMilestoneLedger(ledger);

  return {
    releasedRecords,
    releasedTargets,
    inspirationGranted,
    ledger
  };
}

let progressionSocketRegistered = false;

function isPrimaryActiveGM() {
  const activeGms = (game.users?.contents ?? [])
    .filter((user) => user.active && user.isGM)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return activeGms[0]?.id === game.user?.id;
}

export async function requestReleasePendingMilestonesForRest(tamer) {
  if (!tamer || tamer.type !== "character") {
    return { releasedRecords: 0, releasedTargets: 0, inspirationGranted: 0 };
  }

  if (game.user?.isGM) {
    return releasePendingCampaignMilestonesForTamer(tamer.uuid);
  }

  const activeGm = (game.users?.contents ?? []).find((user) => user.active && user.isGM);
  if (!activeGm) {
    ui.notifications?.warn?.(localize(
      "DDA.Progression.Warning.NoActiveGMForRestRelease",
      "A GM must be online to release pending Milestone benefits after this Rest."
    ));
    return { requested: false, releasedRecords: 0, releasedTargets: 0 };
  }

  game.socket.emit(`system.${DDA_SYSTEM_ID}`, {
    action: DDA_PROGRESSION_SOCKET_ACTION,
    tamerUuid: tamer.uuid,
    requestingUserId: game.user?.id ?? ""
  });

  return { requested: true, releasedRecords: 0, releasedTargets: 0 };
}

export function registerTamerProgressionSocket() {
  if (progressionSocketRegistered) return;
  progressionSocketRegistered = true;

  game.socket.on(`system.${DDA_SYSTEM_ID}`, async (payload = {}) => {
    if (payload?.action !== DDA_PROGRESSION_SOCKET_ACTION) return;
    if (!game.user?.isGM || !isPrimaryActiveGM()) return;

    const tamer = await resolveDdaActor(payload.tamerUuid);
    const requester = game.users?.get?.(payload.requestingUserId);

    if (!tamer || tamer.type !== "character") return;
    if (requester && !requester.isGM && !tamer.testUserPermission(requester, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) {
      console.warn("DDA | Rejected unauthorized Milestone Rest release request.", payload);
      return;
    }

    try {
      await releasePendingCampaignMilestonesForTamer(tamer.uuid);
    } catch (error) {
      console.error("DDA | Could not release rested Tamer Milestone benefits.", error);
    }
  });
}

export function getCampaignMilestoneSummary() {
  const ledger = getCampaignMilestoneLedger();
  const records = ledger.records;

  return {
    ...ledger,
    pendingRecords: records.filter(
      (record) => ["pendingRest", "partiallyReleased"].includes(record.status)
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
      name: String(
        snapshot?.species ??
        snapshot?.sourceFormName ??
        snapshot?.name ??
        sourceFormUuid
      ),
      stage: String(snapshot?.stage ?? "child"),
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
      name: String(partner?.system?.species ?? partner?.name ?? currentSourceFormUuid),
      stage: String(partner?.system?.stage ?? "child"),
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
  _extraSnapshot = null,
  _options = {}
) {
  const allocation = getPartnerBonusDpAllocation(
    partner,
    totalBonusDp
  );

  return Math.min(
    allocation.total,
    allocation.allocated
  );
}

/*
 * Para abrir uma forma no Wizard, ela pode reutilizar o próprio Bonus DP
 * já gasto nela, mas nunca o Bonus DP comprometido pelas outras formas.
 */
export function getPartnerFormBonusDpAvailable(
  partner,
  _sourceFormUuid = "",
  totalBonusDp = null
) {
  const allocation = getPartnerBonusDpAllocation(
    partner,
    totalBonusDp
  );

  /*
   * Shared Stat Bonus is already applied directly to every eligible form.
   * The form Wizard therefore receives only the portion explicitly allocated
   * to Qualities. Unallocated Bonus DP must first be assigned in Advancement.
   */
  return allocation.qualityAllocated;
}

export function getPartnerBonusDpByStage(
  partner,
  totalBonusDp = null
) {
  const allocation = getPartnerBonusDpAllocation(
    partner,
    totalBonusDp
  );
  const status = getPartnerBonusDpFormStatus(partner, allocation);
  const byStage = {};

  for (const stageKey of DDA_BONUS_DP_STAGE_ORDER) {
    const stageTotal = stageKey === "baby1" ? 0 : allocation.total;
    byStage[stageKey] = {
      total: stageTotal,
      spent: 0,
      remaining: stageTotal,
      formCount: 0,
      forms: []
    };
  }

  for (const form of status.forms) {
    const stageKey = DDA_BONUS_DP_STAGE_ORDER.includes(form.stage)
      ? form.stage
      : "child";
    const stage = byStage[stageKey];
    const spent = form.eligible
      ? allocation.statAllocated + form.qualitySpent
      : 0;
    const remaining = Math.max(0, stage.total - spent);

    stage.forms.push({
      sourceFormUuid: form.sourceFormUuid,
      name: form.name,
      spent,
      total: stage.total,
      remaining,
      qualityStatus: form.status
    });
    stage.formCount += 1;
  }

  for (const stage of Object.values(byStage)) {
    stage.spent = stage.forms.length
      ? Math.max(...stage.forms.map((form) => form.spent))
      : 0;
    stage.remaining = stage.forms.length
      ? Math.min(...stage.forms.map((form) => form.remaining))
      : stage.total;
  }

  return byStage;
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
  const allocation = getPartnerBonusDpAllocation(partner, total);
  const byStage = getPartnerBonusDpByStage(partner, total);

  const progress = synchronizeBonusDpPackages(
    partner,
    total,
    allocation.allocated
  );

  return {
    ...progress,
    ...allocation,
    byStage,
    formStatus: getPartnerBonusDpFormStatus(partner, allocation),

    milestoneGranted: progress.packages.reduce(
      (sum, entry) => sum + Math.max(0, integer(entry?.points, 0)),
      0
    ),

    milestoneRemaining: progress.packages.reduce(
      (sum, entry) => sum + Math.max(0, integer(entry?.remaining, 0)),
      0
    )
  };
}

function synchronizeBonusDpCreation(
  creation = {},
  totalBonusDp = 0,
  sharedStatBonus = {},
  qualityAllocated = 0,
  stageKey = "child"
) {
  return synchronizeBonusDpCreationAllocation(
    creation,
    totalBonusDp,
    sharedStatBonus,
    qualityAllocated,
    stageKey
  );
}

function synchronizePartnerFormSnapshotBonusDp(
  partner,
  totalBonusDp,
  sharedStatBonus,
  qualityAllocated
) {
  const snapshots = clone(
    partner?.system?.evolution?.formSnapshots ?? {}
  );

  for (const snapshot of Object.values(snapshots)) {
    if (!snapshot || typeof snapshot !== "object") continue;

    const jogressProfile = snapshot?.wizard?.jogressPlan?.bonusDpProfile;
    const usesJogressBudget = Boolean(
      snapshot?.wizard?.plannedEvolutionMethod === "jogress" &&
      jogressProfile &&
      typeof jogressProfile === "object"
    );
    const snapshotBonusTotal = usesJogressBudget
      ? Math.max(0, integer(jogressProfile.total, 0))
      : totalBonusDp;
    const snapshotSharedStats = usesJogressBudget
      ? normalizeSharedStatBonus(
          jogressProfile.sharedStatBonus ?? jogressProfile.sharedStats ?? {}
        )
      : sharedStatBonus;
    const snapshotSharedStatTotal = getSharedStatBonusTotal(snapshotSharedStats);
    const snapshotQualityAllocated = usesJogressBudget
      ? Math.min(
          Math.max(0, snapshotBonusTotal - snapshotSharedStatTotal),
          Math.max(0, integer(jogressProfile.qualityAllocated, 0))
        )
      : qualityAllocated;

    const stageKey = String(snapshot.stage ?? "child");
    const stageValue = Math.max(1, number(snapshot.stageValue, 1));
    const stageBonus = stageKey === "baby1" ? 0 : snapshotBonusTotal;

    snapshot.mainStats = applySharedStatBonusToMainStats(
      snapshot.mainStats,
      snapshot.creation,
      stageKey,
      stageValue,
      snapshotSharedStats
    );

    snapshot.creation = synchronizeBonusDpCreation(
      snapshot.creation,
      stageBonus,
      snapshotSharedStats,
      snapshotQualityAllocated,
      stageKey
    );

    snapshot.updatedAt = nowIso();
  }

  return snapshots;
}

export async function synchronizePartnerBonusDpAcrossForms(
  partner,
  totalBonusDp = null,
  allocationOverride = null
) {
  if (!partner || partner.type !== "digimon") return null;

  const total = totalBonusDp === null
    ? getPartnerBonusDpTotal(null, partner)
    : integer(totalBonusDp, 0);

  const baseAllocation = getPartnerBonusDpAllocation(partner, total);
  const allocation = allocationOverride
    ? {
        ...baseAllocation,
        sharedStatBonus: normalizeSharedStatBonus(
          allocationOverride.sharedStatBonus ?? baseAllocation.sharedStatBonus
        ),
        qualityAllocated: integer(
          allocationOverride.qualityAllocated ?? baseAllocation.qualityAllocated,
          0
        )
      }
    : baseAllocation;

  allocation.statAllocated = getSharedStatBonusTotal(allocation.sharedStatBonus);
  allocation.qualityAllocated = integer(allocation.qualityAllocated, 0);
  allocation.allocated = allocation.statAllocated + allocation.qualityAllocated;
  allocation.unallocated = Math.max(0, total - allocation.allocated);

  const progress = synchronizeBonusDpPackages(
    partner,
    total,
    allocation.allocated
  );

  const currentStage = String(partner.system?.stage ?? "child");
  const currentStageValue = Math.max(
    1,
    number(partner.system?.stageValue, 1)
  );
  const currentStageBonus = currentStage === "baby1" ? 0 : progress.total;

  const currentMainStats = applySharedStatBonusToMainStats(
    partner.system?.mainStats,
    partner.system?.creation,
    currentStage,
    currentStageValue,
    allocation.sharedStatBonus
  );

  const currentCreation = synchronizeBonusDpCreation(
    partner.system?.creation,
    currentStageBonus,
    allocation.sharedStatBonus,
    allocation.qualityAllocated,
    currentStage
  );

  const snapshots = synchronizePartnerFormSnapshotBonusDp(
    partner,
    progress.total,
    allocation.sharedStatBonus,
    allocation.qualityAllocated
  );

  await partner.update({
    "system.advancement.bonusDp.total": progress.total,
    "system.advancement.bonusDp.sharedSpent": allocation.allocated,
    "system.advancement.bonusDp.remaining": allocation.unallocated,
    "system.advancement.bonusDp.packages": progress.packages,
    "system.advancement.sharedStatBonus": allocation.sharedStatBonus,
    "system.advancement.sharedQualityDp.allocated": allocation.qualityAllocated,
    "system.advancement.sharedQualityDp.spent": allocation.qualityAllocated,
    "system.creation": currentCreation,
    "system.mainStats": currentMainStats,
    "system.evolution.formSnapshots": snapshots
  });

  const byStage = getPartnerBonusDpByStage(partner, progress.total);

  await partner.update({
    "system.advancement.bonusDp.byStage": byStage
  });

  partner.sheet?.render(false);

  return {
    ...progress,
    ...allocation,
    byStage,
    formStatus: getPartnerBonusDpFormStatus(partner),
    snapshotCount: Object.keys(snapshots).length
  };
}

/* ===================================================== */
/* DDA58 — Progression diagnostics and safe repair       */
/* ===================================================== */

function hasOwn(source, key) {
  return Boolean(source && Object.prototype.hasOwnProperty.call(source, key));
}

function mapsEqual(left = {}, right = {}) {
  return DDA_BONUS_DP_STAT_KEYS.every((key) => {
    return integer(left?.[key], 0) === integer(right?.[key], 0);
  });
}

function getRawPartnerAdvancement(partner) {
  return partner?._source?.system?.advancement ?? {};
}

function getRawCreationDp(creation = {}) {
  return creation?.dp && typeof creation.dp === "object"
    ? creation.dp
    : {};
}

function getRawPreparedFormEntries(partner) {
  const entries = [];
  const snapshots = partner?._source?.system?.evolution?.formSnapshots ?? {};

  for (const [key, snapshot] of Object.entries(snapshots)) {
    if (!snapshot || typeof snapshot !== "object") continue;
    entries.push({
      sourceFormUuid: String(snapshot.sourceFormUuid ?? key),
      name: String(snapshot.species ?? snapshot.sourceFormName ?? snapshot.name ?? key),
      stage: String(snapshot.stage ?? "child"),
      creation: snapshot.creation ?? {},
      isCurrent: false
    });
  }

  const currentSourceFormUuid = String(
    partner?._source?.system?.evolution?.currentFormUuid ??
    partner?._source?.system?.evolution?.sourceFormUuid ??
    partner?.uuid ??
    ""
  ).trim();

  if (currentSourceFormUuid) {
    const index = entries.findIndex((entry) => entry.sourceFormUuid === currentSourceFormUuid);
    const currentEntry = {
      sourceFormUuid: currentSourceFormUuid,
      name: String(partner?.name ?? currentSourceFormUuid),
      stage: String(partner?._source?.system?.stage ?? partner?.system?.stage ?? "child"),
      creation: partner?._source?.system?.creation ?? {},
      isCurrent: true
    };

    if (index >= 0) entries[index] = currentEntry;
    else entries.push(currentEntry);
  }

  return entries;
}

function getCampaignReleasedMilestonesForTamer(tamerUuid = "") {
  const cleanUuid = String(tamerUuid ?? "").trim();
  if (!cleanUuid) return [];

  return getCampaignMilestoneLedger().records.filter((record) => {
    return Array.isArray(record?.results) && record.results.some((result) => {
      return String(result?.tamerUuid ?? "").trim() === cleanUuid &&
        result?.status === "released";
    });
  });
}

function makeDiagnosticIssue(code, severity = "review", data = {}) {
  return { code, severity, data };
}

function getDiagnosticStatus(issues = []) {
  if (issues.some((issue) => issue.severity === "review")) return "review";
  if (issues.some((issue) => issue.severity === "legacy")) return "legacy";
  if (issues.some((issue) => issue.severity === "incomplete")) return "incomplete";
  return "ok";
}

/**
 * Inspect a Tamer and linked Partner without mutating either document.
 *
 * The diagnostic intentionally avoids guessing legacy Bonus DP allocation.
 * When the old data model does not contain enough information to determine
 * which Stat purchase should be shared, the result is marked Legacy and the
 * user must reconcile it through the Bonus DP application.
 */
export function getProgressionDiagnostic(tamer, partner = null) {
  const issues = [];
  const progress = getTamerProgressSummary(tamer);
  const milestoneHistory = getMilestoneHistory(tamer);
  const uniqueHistoryIds = new Set(
    milestoneHistory
      .map((entry) => String(entry?.milestoneId ?? "").trim())
      .filter(Boolean)
  );
  const campaignReleased = getCampaignReleasedMilestonesForTamer(tamer?.uuid);
  const growthPackages = getGrowthPackages(tamer);
  const packageRemaining = growthPackages.reduce(
    (sum, entry) => sum + integer(entry?.remaining, 0),
    0
  );
  const growthAvailable = integer(
    tamer?.system?.advancement?.growthPoints?.available,
    0
  );

  if (uniqueHistoryIds.size > progress.milestonesCompleted) {
    issues.push(makeDiagnosticIssue("milestoneHistoryExceedsCounter", "review", {
      counter: progress.milestonesCompleted,
      history: uniqueHistoryIds.size
    }));
  } else if (progress.milestonesCompleted > uniqueHistoryIds.size) {
    issues.push(makeDiagnosticIssue("legacyMilestonesWithoutHistory", "legacy", {
      counter: progress.milestonesCompleted,
      history: uniqueHistoryIds.size
    }));
  }

  if (campaignReleased.length > uniqueHistoryIds.size) {
    issues.push(makeDiagnosticIssue("campaignLedgerAheadOfActor", "review", {
      ledger: campaignReleased.length,
      history: uniqueHistoryIds.size
    }));
  }

  if (growthAvailable < packageRemaining) {
    issues.push(makeDiagnosticIssue("growthPoolBelowPackages", "review", {
      available: growthAvailable,
      packageRemaining
    }));
  } else if (growthAvailable > packageRemaining && growthAvailable > 0) {
    issues.push(makeDiagnosticIssue("legacyGrowthPool", "legacy", {
      available: growthAvailable,
      packageRemaining
    }));
  }

  const attributes = Object.values(tamer?.system?.attributes ?? {});
  const highestAttribute = attributes.reduce((highest, entry) => {
    return Math.max(highest, integer(entry?.value, 0));
  }, 0);

  if (highestAttribute > progress.attributeCap) {
    issues.push(makeDiagnosticIssue("attributeAboveCap", "review", {
      highest: highestAttribute,
      cap: progress.attributeCap
    }));
  }

  const ledgerInspirationGranted = getCampaignMilestoneLedger().records.reduce(
    (sum, record) => sum + (Array.isArray(record?.results)
      ? record.results.reduce((inner, result) => {
          if (String(result?.tamerUuid ?? "").trim() !== String(tamer?.uuid ?? "").trim()) {
            return inner;
          }
          return inner + integer(result?.inspirationGranted, 0);
        }, 0)
      : 0),
    0
  );

  let partnerDiagnostic = null;

  if (!partner || partner.type !== "digimon") {
    issues.push(makeDiagnosticIssue("missingPartner", "review"));
  } else {
    const bonus = getDigimonBonusDpSummary(tamer, partner);
    const allocation = getPartnerBonusDpAllocation(partner, bonus.total);
    const formStatus = getPartnerBonusDpFormStatus(partner, allocation);
    const rawAdvancement = getRawPartnerAdvancement(partner);
    const canonicalAllocationStored = hasOwn(rawAdvancement, "sharedStatBonus") &&
      hasOwn(rawAdvancement, "sharedQualityDp");
    const rawForms = getRawPreparedFormEntries(partner);
    const canonicalStatMap = normalizeSharedStatBonus(allocation.sharedStatBonus);

    const legacyFormEvidence = rawForms.some((form) => {
      if (form.stage === "baby1") return false;
      const dp = getRawCreationDp(form.creation);
      const hasAppliedMap = hasOwn(dp, "sharedStatBonusApplied");
      const oldBonusSpend = integer(dp.spentBonusStats, 0) + integer(dp.spentBonusQualities, 0);
      return oldBonusSpend > 0 && !hasAppliedMap;
    });

    if (bonus.total > 0 && (!canonicalAllocationStored || legacyFormEvidence)) {
      issues.push(makeDiagnosticIssue("legacyBonusDp", "legacy", {
        total: bonus.total
      }));
    }

    if (bonus.milestoneGranted > bonus.total) {
      issues.push(makeDiagnosticIssue("bonusDpBelowPackages", "review", {
        total: bonus.total,
        packages: bonus.milestoneGranted
      }));
    } else if (bonus.total > bonus.milestoneGranted && bonus.total > 0) {
      issues.push(makeDiagnosticIssue("legacyBonusDpTotal", "legacy", {
        total: bonus.total,
        packages: bonus.milestoneGranted
      }));
    }

    if (formStatus.hasInvalidForms) {
      issues.push(makeDiagnosticIssue("invalidPartnerForm", "review"));
    }

    if (formStatus.hasPendingForms) {
      issues.push(makeDiagnosticIssue("pendingQualityParity", "incomplete", {
        pending: formStatus.forms.filter((form) => form.status === "pending").length
      }));
    }

    if (allocation.unallocated > 0) {
      issues.push(makeDiagnosticIssue("unallocatedBonusDp", "incomplete", {
        value: allocation.unallocated
      }));
    }

    const metadataMismatchForms = formStatus.forms.filter((form) => {
      if (!form.eligible) return false;
      const applied = getCreationSharedStatBonusApplied(form.creation);
      return !mapsEqual(applied, canonicalStatMap);
    });

    if (canonicalAllocationStored && metadataMismatchForms.length) {
      issues.push(makeDiagnosticIssue("sharedStatMetadataMismatch", "review", {
        forms: metadataMismatchForms.length
      }));
    }

    const tamerMirror = integer(tamer?.system?.partner?.bonusDp, 0);
    if (tamerMirror !== bonus.total) {
      issues.push(makeDiagnosticIssue("tamerPartnerBonusMirrorMismatch", "review", {
        tamerValue: tamerMirror,
        partnerValue: bonus.total
      }));
    }

    partnerDiagnostic = {
      uuid: partner.uuid,
      name: partner.name,
      total: bonus.total,
      statAllocated: allocation.statAllocated,
      qualityAllocated: allocation.qualityAllocated,
      unallocated: allocation.unallocated,
      milestoneGranted: bonus.milestoneGranted,
      canonicalAllocationStored,
      legacyFormEvidence,
      parityComplete: formStatus.parityComplete,
      hasPendingForms: formStatus.hasPendingForms,
      hasInvalidForms: formStatus.hasInvalidForms,
      metadataMismatchCount: metadataMismatchForms.length,
      formCount: formStatus.formCount,
      eligibleFormCount: formStatus.eligibleFormCount,
      forms: formStatus.forms.map((form) => ({
        sourceFormUuid: form.sourceFormUuid,
        name: form.name,
        stage: form.stage,
        eligible: form.eligible,
        status: form.status,
        qualitySpent: form.qualitySpent,
        qualityRemaining: form.qualityRemaining,
        baseRemaining: form.baseRemaining,
        appliedSharedStatBonus: getCreationSharedStatBonusApplied(form.creation)
      }))
    };
  }

  const status = getDiagnosticStatus(issues);

  return {
    status,
    ok: status === "ok",
    repairable: Boolean(
      partnerDiagnostic?.canonicalAllocationStored &&
      partnerDiagnostic?.uuid &&
      issues.some((issue) => [
        "sharedStatMetadataMismatch",
        "tamerPartnerBonusMirrorMismatch"
      ].includes(issue.code))
    ),
    requiresReconcile: issues.some((issue) => issue.code === "legacyBonusDp"),
    tamer: {
      uuid: tamer?.uuid ?? "",
      name: tamer?.name ?? "",
      milestonesCompleted: progress.milestonesCompleted,
      historyCount: uniqueHistoryIds.size,
      ledgerReleasedCount: campaignReleased.length,
      attributeCap: progress.attributeCap,
      highestAttribute,
      growthPointsAvailable: growthAvailable,
      growthPackageRemaining: packageRemaining,
      growthPackageCount: growthPackages.length,
      inspirationValue: integer(tamer?.system?.resources?.ip?.value, 0),
      inspirationMax: integer(tamer?.system?.resources?.ip?.max, 0),
      inspirationGrantedRecorded: ledgerInspirationGranted
    },
    partner: partnerDiagnostic,
    issues
  };
}

/**
 * Apply only repairs that can be reconstructed from explicit canonical data.
 * Legacy Bonus DP allocation is never inferred or rewritten here.
 */
export async function repairProgressionDiagnostic(tamer, partner = null) {
  if (!game.user?.isGM) {
    return {
      ok: false,
      reason: "gmOnly"
    };
  }

  const diagnostic = getProgressionDiagnostic(tamer, partner);
  if (!partner || partner.type !== "digimon") {
    return {
      ok: false,
      reason: "missingPartner",
      diagnostic
    };
  }

  if (!diagnostic.partner?.canonicalAllocationStored && diagnostic.partner?.total > 0) {
    return {
      ok: false,
      reason: "legacyRequiresReconcile",
      diagnostic
    };
  }

  const allocation = getPartnerBonusDpAllocation(partner);
  await synchronizePartnerBonusDpAcrossForms(partner, allocation.total, allocation);

  const mirror = integer(tamer?.system?.partner?.bonusDp, 0);
  if (mirror !== allocation.total) {
    await tamer.update({
      "system.partner.bonusDp": allocation.total
    });
  }

  tamer.sheet?.render(false);

  return {
    ok: true,
    diagnostic: getProgressionDiagnostic(tamer, partner)
  };
}
