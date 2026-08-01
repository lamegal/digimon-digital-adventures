/**
 * Canonical helpers for DDA 2E Core Qualities.
 *
 * The source books and the system are bilingual, while old Actors may store
 * either localized names or legacy IDs.  All automation in this module uses
 * stable canonical IDs and only falls back to names for migration safety.
 */

export const CORE_QUALITY_IDS = Object.freeze({
  dataOptimization: "otimizacaoDeDados",
  naturewalk: "passoNatural",
  instinct: "instinto",
  weapon: "arma",
  extraMovement: "movimentoExtra",
  accelerate: "acelerar",
  prodigiousSkill: "periciaProdigiosa",
  algorithm: "algoritmo",
  advancedMobility: "mobilidadeAvancada",
  sprint: "arrancada",
  elementalForce: "forcaElemental",
  elementMaster: "mestreElemental",
  dataSpecialization: "especializacaoDeDados",
  hybridDrive: "impulsoHibrido",
  elementalMyriad: "miriadeElemental"
});

export const DATA_OPTIMIZATION_SPECIALIZATIONS = Object.freeze({
  closeCombat: ["fistfulOfForce", "flurry"],
  rangedStriker: ["mobileArtillery", "sniper"],
  warden: ["trySomething", "trueGuardian"],
  brawler: ["wrestlemania", "wrangler"],
  speedster: ["hitAndRun", "uncatchableTarget"],
  effectWarrior: ["statusWarlord", "codeWizard"],
  variable: ["tacticalAdaptation", "supremeCode"]
});


export const DATA_SPECIALIZATION_FREE_GRANT_KEYS = Object.freeze({
  fistfulOfForce: Object.freeze({ qualityId: "areaDeAtaque", ranks: 1 }),
  mobileArtillery: Object.freeze({ qualityId: "areaDeAtaque", ranks: 1 }),
  trySomething: Object.freeze({ qualityId: "contraAtaque", ranks: 1 }),
  wrestlemania: Object.freeze({ qualityId: "periciaProdigiosa", ranks: 1 }),
  hitAndRun: Object.freeze({ choice: true, ranks: 1 }),
  tacticalAdaptation: Object.freeze({ choice: true, ranks: 1 })
});

const QUALITY_ALIASES = Object.freeze({
  [CORE_QUALITY_IDS.dataOptimization]: [
    "otimizacaoDeDados", "otimizacao de dados", "dataOptimization", "data optimization"
  ],
  [CORE_QUALITY_IDS.naturewalk]: [
    "passoNatural", "passo natural", "naturewalk", "nature walk"
  ],
  [CORE_QUALITY_IDS.instinct]: ["instinto", "instinct"],
  [CORE_QUALITY_IDS.weapon]: ["arma", "weapon"],
  [CORE_QUALITY_IDS.extraMovement]: [
    "movimentoExtra", "movimento extra", "extraMovement", "extra movement"
  ],
  [CORE_QUALITY_IDS.accelerate]: ["acelerar", "accelerate"],
  [CORE_QUALITY_IDS.prodigiousSkill]: [
    "periciaProdigiosa", "pericia prodigiosa", "prodigiousSkill", "prodigious skill"
  ],
  [CORE_QUALITY_IDS.algorithm]: ["algoritmo", "algorithm"],
  [CORE_QUALITY_IDS.advancedMobility]: [
    "mobilidadeAvancada", "mobilidade avancada", "advancedMobility", "advanced mobility"
  ],
  [CORE_QUALITY_IDS.sprint]: ["arrancada", "sprint"],
  [CORE_QUALITY_IDS.elementalForce]: [
    "forcaElemental", "forca elemental", "elementalForce", "elemental force"
  ],
  [CORE_QUALITY_IDS.elementMaster]: [
    "mestreElemental", "mestre elemental", "elementMaster", "element master"
  ],
  [CORE_QUALITY_IDS.dataSpecialization]: [
    "especializacaoDeDados", "especializacao de dados", "dataSpecialization", "data specialization"
  ],
  [CORE_QUALITY_IDS.hybridDrive]: [
    "impulsoHibrido", "impulso hibrido", "hybridDrive", "hybrid drive"
  ],
  [CORE_QUALITY_IDS.elementalMyriad]: [
    "miriadeElemental", "miriade elemental", "elementalMyriad", "elemental myriad"
  ]
});

const SPECIALIZATION_ALIASES = Object.freeze({
  fistfulOfForce: ["fistfulOfForce", "fistful of force", "punhadoDeForca", "punhado de forca"],
  flurry: ["flurry", "rajadaDeGolpes", "rajada de golpes"],
  mobileArtillery: ["mobileArtillery", "mobile artillery", "artilhariaMovel", "artilharia movel"],
  sniper: ["sniper", "francoAtirador", "franco-atirador", "franco atirador"],
  trySomething: ["trySomething", "try something", "tenteAlgo", "tente algo"],
  trueGuardian: ["trueGuardian", "true guardian", "guardiaoVerdadeiro", "guardiao verdadeiro"],
  wrestlemania: ["wrestlemania"],
  wrangler: ["wrangler", "domador"],
  hitAndRun: ["hitAndRun", "hit and run", "baterECorrer", "bater e correr"],
  uncatchableTarget: ["uncatchableTarget", "uncatchable target", "alvoInalcancavel", "alvo inalcancavel"],
  statusWarlord: ["statusWarlord", "status warlord", "senhorDaGuerraDeStatus", "senhor da guerra de status"],
  codeWizard: ["codeWizard", "code wizard", "magoDoCodigo", "mago do codigo"],
  tacticalAdaptation: ["tacticalAdaptation", "tactical adaptation", "adaptacaoTatica", "adaptacao tatica"],
  supremeCode: ["supremeCode", "supreme code", "codigoSupremo", "codigo supremo"]
});

const OPTIMIZATION_ALIASES = Object.freeze({
  closeCombat: ["closeCombat", "close combat", "combatenteCorpoACorpo", "combatente corpo a corpo"],
  rangedStriker: ["rangedStriker", "ranged striker", "atiradorADistancia", "atirador a distancia"],
  warden: ["warden", "guardiao"],
  brawler: ["brawler", "brigao"],
  speedster: ["speedster", "velocista"],
  effectWarrior: ["effectWarrior", "effect warrior", "guerreiroDeEfeitos", "guerreiro de efeitos"],
  variable: ["variable", "variavel"]
});

export function normalizeCoreKey(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function identityCandidates(documentOrSystem = {}) {
  const system = documentOrSystem?.system ?? documentOrSystem ?? {};
  return [
    system?.sourceId,
    system?.id,
    system?.originalName,
    system?.name,
    documentOrSystem?.name,
    documentOrSystem?.originalName,
    documentOrSystem?.id
  ].map((value) => String(value ?? "").trim()).filter(Boolean);
}

function canonicalFromAliases(value, aliasMap) {
  const normalized = normalizeCoreKey(value);
  if (!normalized) return "";

  for (const [canonical, aliases] of Object.entries(aliasMap)) {
    if (aliases.some((alias) => normalizeCoreKey(alias) === normalized)) return canonical;
  }

  return "";
}

export function getCoreQualityId(documentOrSystem = {}) {
  for (const candidate of identityCandidates(documentOrSystem)) {
    const canonical = canonicalFromAliases(candidate, QUALITY_ALIASES);
    if (canonical) return canonical;
  }
  return "";
}

export function isCoreQuality(documentOrSystem, canonicalId) {
  return getCoreQualityId(documentOrSystem) === canonicalId;
}

export function findCoreQuality(actor, canonicalId) {
  return actor?.items?.find?.((item) => item?.type === "quality" && isCoreQuality(item, canonicalId)) ?? null;
}

export function hasCoreQuality(actor, canonicalId) {
  return Boolean(findCoreQuality(actor, canonicalId));
}

export function getCoreQualityRank(actorOrItem, canonicalId = "") {
  const item = canonicalId ? findCoreQuality(actorOrItem, canonicalId) : actorOrItem;
  return Math.max(0, Number(item?.system?.rank?.value ?? 0));
}

export function getCoreSelectedChoices(itemOrSystem = {}) {
  const system = itemOrSystem?.system ?? itemOrSystem ?? {};
  const selectedRanks = Array.isArray(system?.choices?.selectedRanks)
    ? system.choices.selectedRanks
    : [];
  const selected = Array.isArray(system?.choices?.selected)
    ? system.choices.selected
    : [];

  return [...selectedRanks, ...selected]
    .map((entry) => typeof entry === "string" ? { key: entry } : entry)
    .filter((entry) => entry && typeof entry === "object");
}

export function canonicalDataOptimizationKey(value = "") {
  return canonicalFromAliases(value, OPTIMIZATION_ALIASES);
}

export function canonicalDataSpecializationKey(value = "") {
  return canonicalFromAliases(value, SPECIALIZATION_ALIASES);
}

export function getDataOptimizationKey(actor) {
  const quality = findCoreQuality(actor, CORE_QUALITY_IDS.dataOptimization);
  if (!quality) return "";

  for (const choice of getCoreSelectedChoices(quality)) {
    const key = canonicalDataOptimizationKey(
      choice?.dataOptimization ?? choice?.key ?? choice?.value ?? choice?.id ?? choice?.label
    );
    if (key) return key;
  }

  return "";
}

export function getDataSpecializationEntries(actorOrItem) {
  const quality = actorOrItem?.items
    ? findCoreQuality(actorOrItem, CORE_QUALITY_IDS.dataSpecialization)
    : actorOrItem;

  if (!quality) return [];

  return getCoreSelectedChoices(quality)
    .map((choice, index) => {
      const key = canonicalDataSpecializationKey(
        choice?.specialization ?? choice?.key ?? choice?.value ?? choice?.id ?? choice?.label
      );
      if (!key) return null;
      const dataOptimization = canonicalDataOptimizationKey(
        choice?.dataOptimization ?? getDataOptimizationForSpecialization(key)
      );
      return {
        ...choice,
        key,
        specialization: key,
        dataOptimization,
        viaHybridDrive: Boolean(choice?.viaHybridDrive),
        rank: Math.max(1, Number(choice?.rank ?? index + 1))
      };
    })
    .filter(Boolean);
}

export function getDataSpecializationKeys(actorOrItem) {
  return getDataSpecializationEntries(actorOrItem).map((entry) => entry.key);
}

export function hasDataSpecialization(actor, key) {
  const canonical = canonicalDataSpecializationKey(key) || String(key ?? "");
  return getDataSpecializationKeys(actor).includes(canonical);
}

export function getDataOptimizationForSpecialization(specializationKey) {
  const canonical = canonicalDataSpecializationKey(specializationKey) || String(specializationKey ?? "");
  for (const [optimization, specializations] of Object.entries(DATA_OPTIMIZATION_SPECIALIZATIONS)) {
    if (specializations.includes(canonical)) return optimization;
  }
  return "";
}

export function getNativeDataSpecializations(actor) {
  return DATA_OPTIMIZATION_SPECIALIZATIONS[getDataOptimizationKey(actor)] ?? [];
}

export function getUsedHybridDriveSpecializations(actorOrEntries) {
  const entries = Array.isArray(actorOrEntries)
    ? actorOrEntries
    : getDataSpecializationEntries(actorOrEntries);

  return entries.filter((entry) => Boolean(entry.viaHybridDrive));
}

export function canSelectDataSpecialization(actor, specializationKey, existingEntries = null) {
  const key = canonicalDataSpecializationKey(specializationKey);
  if (!key) return { allowed: false, reason: "unknown", viaHybridDrive: false };

  if (key === "uncatchableTarget") {
    const hasAbsoluteEvasion = Boolean(actor?.items?.some?.((item) => {
      if (item?.type !== "quality") return false;
      const identity = normalizeCoreKey(
        item.system?.sourceId ??
        item.system?.id ??
        item.system?.originalName ??
        item.name ??
        ""
      );
      return ["evasaoabsoluta", "absoluteevasion"].includes(identity);
    }));

    if (hasAbsoluteEvasion) {
      return {
        allowed: false,
        reason: "absoluteEvasionConflict",
        viaHybridDrive: false
      };
    }
  }

  const entries = Array.isArray(existingEntries)
    ? existingEntries
    : getDataSpecializationEntries(actor);

  if (entries.some((entry) => canonicalDataSpecializationKey(entry.key) === key)) {
    return { allowed: false, reason: "duplicate", viaHybridDrive: false };
  }

  const native = getNativeDataSpecializations(actor);
  if (native.includes(key)) {
    return { allowed: true, reason: "native", viaHybridDrive: false };
  }

  if (!hasCoreQuality(actor, CORE_QUALITY_IDS.hybridDrive)) {
    return { allowed: false, reason: "wrongOptimization", viaHybridDrive: false };
  }

  const offPathUsed = entries.some((entry) => {
    const entryKey = canonicalDataSpecializationKey(entry.key);
    return Boolean(entry.viaHybridDrive) || !native.includes(entryKey);
  });

  return offPathUsed
    ? { allowed: false, reason: "hybridUsed", viaHybridDrive: false }
    : { allowed: true, reason: "hybrid", viaHybridDrive: true };
}

export function getAvailableDataSpecializationOptions(actor, options = [], existingEntries = null) {
  return options
    .map((option) => {
      const key = canonicalDataSpecializationKey(option?.key ?? option?.value ?? option?.id ?? "");
      const eligibility = canSelectDataSpecialization(actor, key, existingEntries);
      return {
        ...option,
        key,
        dataOptimization: canonicalDataOptimizationKey(
          option?.dataOptimization ?? getDataOptimizationForSpecialization(key)
        ),
        eligibility
      };
    })
    .filter((option) => option.key && option.eligibility.allowed);
}

export function getExtraMovementChoiceKeys(actor) {
  const quality = findCoreQuality(actor, CORE_QUALITY_IDS.extraMovement);
  return [...new Set(getCoreSelectedChoices(quality)
    .map((choice) => normalizeMovementKey(choice?.key ?? choice?.value ?? choice?.id ?? ""))
    .filter(Boolean))];
}

export function getAdvancedMobilityChoiceKeys(actor) {
  const quality = findCoreQuality(actor, CORE_QUALITY_IDS.advancedMobility);
  return [...new Set(getCoreSelectedChoices(quality)
    .map((choice) => normalizeMovementKey(choice?.key ?? choice?.value ?? choice?.id ?? ""))
    .filter(Boolean))];
}

export function normalizeMovementKey(value = "") {
  const normalized = normalizeCoreKey(value);
  const map = {
    flight: "flight", fly: "flight", voo: "flight",
    digger: "digger", dig: "digger", escavador: "digger", escavar: "digger",
    swimmer: "swimmer", swim: "swimmer", nadador: "swimmer", nadar: "swimmer",
    wallclimber: "wallclimber", climb: "wallclimber", escalador: "wallclimber", escalar: "wallclimber",
    jumper: "jumper", jump: "jumper", saltador: "jumper", salto: "jumper"
  };
  return map[normalized] ?? "";
}

export function getAvailableAdvancedMobilityOptions(actor, options = [], existingChoices = []) {
  const ownedMovement = new Set(getExtraMovementChoiceKeys(actor));
  const alreadyAdvanced = new Set(
    existingChoices.map((choice) => normalizeMovementKey(choice?.key ?? choice?.value ?? choice?.id ?? ""))
  );

  return options.filter((option) => {
    const key = normalizeMovementKey(option?.key ?? option?.value ?? option?.id ?? "");
    return key && ownedMovement.has(key) && !alreadyAdvanced.has(key);
  });
}

export function getAlgorithmRank(actor) {
  return getCoreQualityRank(actor, CORE_QUALITY_IDS.algorithm);
}

export function actorCanCombineWeaponAndInstinct(actor) {
  return getAlgorithmRank(actor) > 0;
}

export function getWeaponInstinctStageCap(actor, qualityDefinitionOrItem = null) {
  const system = qualityDefinitionOrItem?.system ?? qualityDefinitionOrItem ?? {};
  const byStage = system?.rankLimit?.byStage ?? {};
  const stage = String(actor?.system?.stage ?? "child");
  const fallback = Math.max(0, Number(system?.rank?.max ?? 3));
  return Math.max(0, Number(byStage[stage] ?? fallback));
}

/**
 * Weapon and Instinct use their normal Stage cap while only one path is owned.
 * As soon as both paths coexist (or the counterpart is being purchased), the
 * Algorithm cap becomes authoritative: Algorithm Ranks + 1.
 */
export function getWeaponInstinctEffectiveMax(actor, qualityDefinitionOrItem, { counterpartWillExist = false } = {}) {
  const canonicalId = getCoreQualityId(qualityDefinitionOrItem);
  const stageCap = getWeaponInstinctStageCap(actor, qualityDefinitionOrItem);
  if (![CORE_QUALITY_IDS.weapon, CORE_QUALITY_IDS.instinct].includes(canonicalId)) return stageCap;

  const counterpartId = canonicalId === CORE_QUALITY_IDS.weapon
    ? CORE_QUALITY_IDS.instinct
    : CORE_QUALITY_IDS.weapon;
  const counterpartExists = counterpartWillExist || hasCoreQuality(actor, counterpartId);
  if (!counterpartExists) return stageCap;

  const algorithmRank = getAlgorithmRank(actor);
  if (algorithmRank <= 0) return 0;
  return Math.min(stageCap, algorithmRank + 1);
}

export function isWeaponInstinctConflict(actor, qualityDefinitionOrItem) {
  const canonicalId = getCoreQualityId(qualityDefinitionOrItem);
  if (![CORE_QUALITY_IDS.weapon, CORE_QUALITY_IDS.instinct].includes(canonicalId)) return false;
  const counterpartId = canonicalId === CORE_QUALITY_IDS.weapon
    ? CORE_QUALITY_IDS.instinct
    : CORE_QUALITY_IDS.weapon;
  return hasCoreQuality(actor, counterpartId) && !actorCanCombineWeaponAndInstinct(actor);
}

export function getCoreDiscountRemaining(actor) {
  return Math.max(0, Number(
    actor?.system?.creation?.coreDiscount?.remaining ??
    actor?.system?.coreDiscount?.remaining ??
    0
  ));
}

export function isCoreDiscountEligible(qualityDefinitionOrItem) {
  const system = qualityDefinitionOrItem?.system ?? qualityDefinitionOrItem ?? {};
  return Boolean(system?.cost?.coreDiscountAvailable || system?.category?.core);
}

function normalizeQualityIdentity(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function getQualityIdentitySet(qualityDefinitionOrItem) {
  const system = qualityDefinitionOrItem?.system ?? qualityDefinitionOrItem ?? {};
  return new Set([
    system?.sourceId,
    system?.id,
    qualityDefinitionOrItem?.id,
    qualityDefinitionOrItem?.name,
    system?.originalName
  ].map(normalizeQualityIdentity).filter(Boolean));
}

export function actorOwnsQualityDefinition(actor, qualityDefinitionOrItem) {
  const identities = getQualityIdentitySet(qualityDefinitionOrItem);
  if (!identities.size) return false;

  return Boolean((actor?.items ?? []).find((item) => {
    if (item.type !== "quality") return false;
    const owned = getQualityIdentitySet(item);
    return [...owned].some((identity) => identities.has(identity));
  }));
}

export function getFirstPurchaseDiscount(actor, qualityDefinitionOrItem) {
  const system = qualityDefinitionOrItem?.system ?? qualityDefinitionOrItem ?? {};
  const amount = Math.max(0, Number(system?.cost?.discount?.firstPurchase ?? 0));
  if (amount <= 0 || actorOwnsQualityDefinition(actor, qualityDefinitionOrItem)) return 0;
  return amount;
}

export function getMarginalQualityDpCost(actor, qualityDefinitionOrItem, { ranks = 1 } = {}) {
  const system = qualityDefinitionOrItem?.system ?? qualityDefinitionOrItem ?? {};
  const tier = String(system?.tier ?? qualityDefinitionOrItem?.tier ?? "");
  if (["free", "negative"].includes(tier)) return 0;

  const raw = Math.max(0, Number(system?.cost?.dp ?? 0)) * Math.max(1, Number(ranks ?? 1));
  const afterFirstPurchaseDiscount = Math.max(
    0,
    raw - getFirstPurchaseDiscount(actor, qualityDefinitionOrItem)
  );
  if (!isCoreDiscountEligible(system)) return afterFirstPurchaseDiscount;
  return Math.max(0, afterFirstPurchaseDiscount - getCoreDiscountRemaining(actor));
}

export function getCoreDiscountPreview(actor, qualityDefinitionOrItem, { ranks = 1 } = {}) {
  const system = qualityDefinitionOrItem?.system ?? qualityDefinitionOrItem ?? {};
  const raw = Math.max(0, Number(system?.cost?.dp ?? 0)) * Math.max(1, Number(ranks ?? 1));
  const eligible = isCoreDiscountEligible(system);
  const remaining = eligible ? getCoreDiscountRemaining(actor) : 0;
  const discount = Math.min(raw, remaining);
  return {
    eligible,
    raw,
    remaining,
    discount,
    payable: Math.max(0, raw - discount)
  };
}

export function buildDataSpecializationFeature(entries = []) {
  const keys = entries.map((entry) => canonicalDataSpecializationKey(entry.key)).filter(Boolean);
  const set = new Set(keys);
  return {
    choices: entries,
    keys,
    fistfulOfForce: set.has("fistfulOfForce"),
    flurry: set.has("flurry"),
    mobileArtillery: set.has("mobileArtillery"),
    sniper: set.has("sniper"),
    trySomething: set.has("trySomething"),
    trueGuardian: set.has("trueGuardian"),
    wrestlemania: set.has("wrestlemania"),
    wrangler: set.has("wrangler"),
    hitAndRun: set.has("hitAndRun"),
    uncatchableTarget: set.has("uncatchableTarget"),
    statusWarlord: set.has("statusWarlord"),
    codeWizard: set.has("codeWizard"),
    tacticalAdaptation: set.has("tacticalAdaptation"),
    supremeCode: set.has("supremeCode"),

    freeAreaAttackRanks: Number(set.has("fistfulOfForce")) + Number(set.has("mobileArtillery")),
    freeCounterattackRanks: Number(set.has("trySomething")),
    freeProdigiousSkillRanks: Number(set.has("wrestlemania")),

    rangedRangeBonus: set.has("sniper") ? 3 : 0,
    rangedEffectiveLimitBonus: set.has("sniper") ? 3 : 0,
    healthBonus: set.has("trySomething") ? 3 : 0,
    dodgeBonus: set.has("uncatchableTarget") ? 3 : 0,
    allMainStatBonus: set.has("supremeCode") ? 1 : 0,
    maximumEffectDurationBonus: set.has("codeWizard") ? 1 : 0,
    oneTimeAttackEffectDiscount: set.has("statusWarlord") ? 1 : 0,

    mayMakeAdditionalMeleeDamageAttack: set.has("flurry"),
    interruptAttacksIgnoreRoundLimit: set.has("trySomething"),
    trueGuardianAreaProtection: set.has("trueGuardian"),
    canUseAlternativeClashChecks: set.has("wrestlemania"),
    freeClashOncePerTurn: set.has("wrangler"),
    hitAndRunChargeRecoil: set.has("hitAndRun"),
    ignoresStackingDodgePenalty: set.has("uncatchableTarget"),
    statusWarlordAttackPair: set.has("statusWarlord"),
    codeWizardDamageTagBypass: set.has("codeWizard"),
    tacticalAdaptationFreeChange: set.has("tacticalAdaptation")
  };
}

export function getQualityFreeRankSources(item) {
  return Array.isArray(item?.system?.cost?.freeRankSources)
    ? item.system.cost.freeRankSources
    : [];
}

export function actorHasFreeRankSource(actor, sourceKey = "") {
  const expected = String(sourceKey ?? "").trim();
  if (!expected) return false;

  return Boolean(actor?.items?.some?.((item) => {
    if (item?.type !== "quality") return false;
    return getQualityFreeRankSources(item).some((entry) => {
      return String(entry?.key ?? entry ?? "").trim() === expected;
    });
  }));
}

/**
 * Return Data Specialization choices whose free Quality entitlement has not
 * been materialized yet. This is intentionally side-effect free so it can be
 * used both while preparing an Actor and by the Quality Browser repair tool.
 */
export function getMissingDataSpecializationFreeGrants(actor) {
  return getDataSpecializationEntries(actor)
    .filter((entry) => Boolean(DATA_SPECIALIZATION_FREE_GRANT_KEYS[entry.key]))
    .filter((entry) => !actorHasFreeRankSource(actor, `dataSpecialization:${entry.key}`))
    .map((entry) => ({
      ...entry,
      entitlement: DATA_SPECIALIZATION_FREE_GRANT_KEYS[entry.key]
    }));
}

