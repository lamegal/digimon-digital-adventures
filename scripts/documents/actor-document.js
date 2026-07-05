const DIGIMON_SIZE_ORDER = [
  "small",
  "medium",
  "large",
  "huge",
  "gigantic",
  "colossal"
];

function getMaximumSizeForStage(stageKey = "child") {
  return CONFIG.DDA?.stages?.[stageKey]?.maxSize ?? "colossal";
}

function clampDigimonSizeForStage(sizeKey = "medium", stageKey = "child") {
  const currentSize = String(sizeKey || "medium");
  const maxSize = getMaximumSizeForStage(stageKey);

  const currentIndex = DIGIMON_SIZE_ORDER.indexOf(currentSize);
  const maxIndex = DIGIMON_SIZE_ORDER.indexOf(maxSize);

  if (currentIndex < 0) {
    return maxIndex >= 0 ? maxSize : "medium";
  }

  if (maxIndex >= 0 && currentIndex > maxIndex) {
    return maxSize;
  }

  return currentSize;
}


const DDA_SYSTEM_ID = "digimon-digital-adventures";

function getQualityRankValue(itemSystem = {}) {
  return Math.max(0, Number(itemSystem.rank?.value ?? 1));
}

function addQualitySourceBonus(stat, source) {
  if (!stat || !source || Number(source.value ?? 0) === 0) return;
  stat.sharedBonus = Number(stat.sharedBonus ?? 0) + Number(source.value ?? 0);
  stat.sharedBonusSources = Array.isArray(stat.sharedBonusSources) ? stat.sharedBonusSources : [];
  stat.sharedBonusSources.push(source);
}

function getQualitySelectedChoices(itemSystem = {}) {
  const ranks = Array.isArray(itemSystem.choices?.selectedRanks)
    ? itemSystem.choices.selectedRanks
    : [];

  const selected = Array.isArray(itemSystem.choices?.selected)
    ? itemSystem.choices.selected
    : [];

  return [...ranks, ...selected]
    .map((choice) => typeof choice === "string" ? { key: choice } : choice)
    .filter((choice) => choice && typeof choice === "object");
}

function getQualityChoiceKeys(itemSystem = {}) {
  return getQualitySelectedChoices(itemSystem)
    .map((choice) => String(choice.key ?? choice.value ?? choice.id ?? "").trim())
    .filter(Boolean);
}

function getExtraMovementTypeFromChoiceKey(choiceKey = "") {
  const normalized = String(choiceKey ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();

  const map = {
    flight: "fly",
    fly: "fly",
    voo: "fly",

    digger: "dig",
    dig: "dig",
    escavador: "dig",
    escavar: "dig",

    swimmer: "swim",
    swim: "swim",
    nadador: "swim",
    nadar: "swim",

    wallclimber: "climb",
    climb: "climb",
    escalador: "climb",
    escalar: "climb",

    jumper: "jump",
    jump: "jump",
    saltador: "jump",
    salto: "jump",

    teleport: "teleport",
    teleporte: "teleport",
    transporter: "teleport",
    transportador: "teleport"
  };

  return map[normalized] ?? "";
}

function getQualitySourceId(item) {
  return String(item?.system?.sourceId ?? item?.system?.id ?? item?.flags?.[DDA_SYSTEM_ID]?.sourceId ?? "").trim();
}

function normalizeQualityChoiceKey(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function qualityHasChoice(choiceKeys = [], ...aliases) {
  const normalizedChoices = new Set(
    choiceKeys.map((choiceKey) => normalizeQualityChoiceKey(choiceKey))
  );

  return aliases.some((alias) => {
    return normalizedChoices.has(normalizeQualityChoiceKey(alias));
  });
}

function isDataOptimizationQuality(item) {
  const sourceId = getQualitySourceId(item);
  const normalizedName = normalizeQualityName(item?.name);

  return (
    sourceId === "otimizacaoDeDados" ||
    sourceId === "dataOptimization" ||
    normalizeQualityChoiceKey(sourceId) === "dataoptimization" ||
    normalizedName === "otimizacao de dados" ||
    normalizedName === "data optimization"
  );
}

function isNaturewalkQuality(item) {
  const sourceId = getQualitySourceId(item);
  const normalizedSourceId = normalizeQualityChoiceKey(sourceId);
  const normalizedName = normalizeQualityName(item?.name);

  return (
    sourceId === "passoNatural" ||
    sourceId === "naturewalk" ||
    normalizedSourceId === "passonatural" ||
    normalizedSourceId === "naturewalk" ||
    normalizedName === "passo natural" ||
    normalizedName === "naturewalk"
  );
}

function getQualityChoiceOptionData(itemSystem = {}, choiceKey = "") {
  const normalizedChoiceKey = normalizeQualityChoiceKey(choiceKey);

  return itemSystem.choices?.options?.find((option) => {
    return normalizeQualityChoiceKey(option.key) === normalizedChoiceKey;
  });
}

function getNaturewalkElementData(elementKey = "") {
  const key = normalizeQualityChoiceKey(elementKey);

  const data = {
    key,
    damageReductionType: "",
    crashReduction: 0,
    awarenessBonus: 0,
    grantsDarkvision: false
  };

  if (["fire", "steel"].includes(key)) {
    data.damageReductionType = "burn";
  }

  if (["water", "ice"].includes(key)) {
    data.damageReductionType = "freeze";
  }

  if (["earth", "wood"].includes(key)) {
    data.damageReductionType = "poison";
  }

  if (["wind", "thunder"].includes(key)) {
    data.damageReductionType = "crash";
    data.crashReduction = 1;
  }

  if (["darkness", "light"].includes(key)) {
    data.awarenessBonus = 1;
    data.grantsDarkvision = true;
  }

  return data;
}

function isExtraMovementQuality(item) {
  const sourceId = getQualitySourceId(item);
  const normalizedSourceId = normalizeQualityChoiceKey(sourceId);
  const normalizedName = normalizeQualityName(item?.name);

  return (
    sourceId === "movimentoExtra" ||
    sourceId === "extraMovement" ||
    normalizedSourceId === "movimentoextra" ||
    normalizedSourceId === "extramovement" ||
    normalizedName === "movimento extra" ||
    normalizedName === "extra movement"
  );
}

function isAdvancedMobilityQuality(item) {
  const sourceId = getQualitySourceId(item);
  const normalizedSourceId = normalizeQualityChoiceKey(sourceId);
  const normalizedName = normalizeQualityName(item?.name);

  return (
    sourceId === "mobilidadeAvancada" ||
    sourceId === "advancedMobility" ||
    normalizedSourceId === "mobilidadeavancada" ||
    normalizedSourceId === "advancedmobility" ||
    normalizedName === "mobilidade avancada" ||
    normalizedName === "advanced mobility"
  );
}

function isAccelerateQualitySystem(itemSystem = {}) {
  const sourceId = String(itemSystem.sourceId ?? itemSystem.id ?? "").trim();
  const normalizedSourceId = normalizeQualityChoiceKey(sourceId);

  return (
    sourceId === "acelerar" ||
    sourceId === "accelerate" ||
    normalizedSourceId === "acelerar" ||
    normalizedSourceId === "accelerate"
  );
}

function getAccelerateRamLimit(actorSystem = {}) {
  const ramStat = actorSystem.derivedStats?.ram;

  const storedRamLimit = Math.max(0, Number(
    ramStat?.total ??
    ramStat?.value ??
    ramStat?.max ??
    0
  ));

  const sizeKey = String(actorSystem.size ?? "medium");

  const sizeRamBonus = {
    small: 3,
    medium: 2,
    large: 1,
    huge: 1,
    gigantic: 0,
    colossal: 0
  }[sizeKey] ?? 2;

  const dodgeBase = Number(actorSystem.mainStats?.dodge?.base ?? 0);
  const ramBase = Math.floor(dodgeBase / 3);
  const ramQualityBonus = Number(ramStat?.qualityBonus ?? 0);

  const computedRamLimit = Math.max(0, ramBase + sizeRamBonus + ramQualityBonus);

  return Math.max(storedRamLimit, computedRamLimit);
}

function getAccelerateAppliedRankValue(itemSystem = {}, actorSystem = {}) {
  const rankValue = getQualityRankValue(itemSystem);
  const ramLimit = getAccelerateRamLimit(actorSystem);

  if (ramLimit <= 0) return 0;

  return Math.min(rankValue, ramLimit);
}

function formatSignedQualityBonus(value = 0) {
  const numberValue = Number(value ?? 0);
  return numberValue >= 0 ? `+${numberValue}` : `${numberValue}`;
}

function getQualityMovementChoiceLabel(itemSystem = {}, choice = {}) {
  const choiceKey = String(choice.key ?? choice.value ?? choice.id ?? "").trim();
  const optionData = getQualityChoiceOptionData(itemSystem, choiceKey);

  return String(
    choice.label ??
    optionData?.label ??
    optionData?.originalLabel ??
    choiceKey
  ).trim();
}

function addDigimonSkillBonus(system, skillKey, source) {
  const bonusValue = Number(source?.value ?? 0);
  if (!skillKey || bonusValue === 0) return;

  const current = system.skillBonuses?.[skillKey] ?? {};

  system.skillBonuses[skillKey] = {
    key: skillKey,
    label: current.label ?? source.label ?? skillKey,
    derivedStat: current.derivedStat ?? source.derivedStat ?? "",
    value: Number(current.value ?? 0) + bonusValue,
    sources: [
      ...(Array.isArray(current.sources) ? current.sources : []),
      source.name
    ]
  };
}

function getSelectedQualityChoiceLabel(itemSystem = {}) {
  const selectedChoice = getQualitySelectedChoices(itemSystem)[0];
  const selectedChoiceKey = String(
    selectedChoice?.key ??
    selectedChoice?.value ??
    selectedChoice?.id ??
    ""
  ).trim();

  const optionData = itemSystem.choices?.options?.find((option) => {
    return normalizeQualityChoiceKey(option.key) === normalizeQualityChoiceKey(selectedChoiceKey);
  });

  return String(
    selectedChoice?.label ??
    optionData?.label ??
    optionData?.originalLabel ??
    selectedChoiceKey ??
    ""
  ).trim();
}

export class DDAActor extends Actor {
  prepareDerivedData() {
    super.prepareDerivedData();

    if (this.type === "character") {
      this._prepareCharacterData();
    }

    if (this.type === "digimon" || this.type === "npc") {
      this._prepareDigimonData();
    }
  }

  _prepareCharacterData() {
    const system = this.system;

    const willpower = Number(system.attributes?.willpower?.value ?? 0);
    const endurance = Number(system.skills?.endurance?.value ?? 0);
    const agility = Number(system.attributes?.agility?.value ?? 0);
    const milestones = Number(system.advancement?.milestones?.completed ?? 0);

    const ipMax = 2 + willpower;
    const evolutionPointsMax = milestones;
    const woundsMax = 3 + Math.max(0, endurance);
    const movement = Math.max(0, agility);

    let attributeCap = 5;

    if (milestones >= 6) {
      attributeCap = 7;
    } else if (milestones >= 3) {
      attributeCap = 6;
    }

    system.resources.ip.max = ipMax;
    system.resources.evolutionPoints.max = evolutionPointsMax;

      system.derived.wounds.max = woundsMax;

      const woundsValueRaw = Number(system.derived.wounds.value ?? woundsMax);
      const woundsTempValueRaw = Number(system.derived.wounds.temp?.value ?? 0);

      const woundsValue = Number.isFinite(woundsValueRaw) ? woundsValueRaw : woundsMax;
      const woundsTempValue = Number.isFinite(woundsTempValueRaw) ? woundsTempValueRaw : 0;

      system.derived.wounds.value = Math.clamp(woundsValue, 0, woundsMax);

      if (system.derived.wounds.temp) {
        system.derived.wounds.temp.value = Math.max(0, woundsTempValue);
      }

      const healthRatio = system.derived.wounds.value / woundsMax;

      system.derived.wounds.healthRatio = healthRatio;

      if (system.derived.wounds.value <= 0) {
        system.derived.wounds.healthClass = "health-empty";
      } else if (healthRatio <= 0.25) {
        system.derived.wounds.healthClass = "health-critical";
      } else if (healthRatio <= 0.5) {
        system.derived.wounds.healthClass = "health-warning";
      } else if (healthRatio <= 0.75) {
        system.derived.wounds.healthClass = "health-caution";
      } else {
        system.derived.wounds.healthClass = "health-healthy";
      }

      system.derived ??= {};
      const previousMovement = system.derived.movement;

      if (!previousMovement || typeof previousMovement !== "object") {
        system.derived.movement = {
          label: "DDA.Resource.Movement",
          value: Number(previousMovement ?? movement ?? 0)
        };
      }

      system.derived.movement.value = movement;

    system.advancement.attributeCap.current = attributeCap;
  }

  _prepareDigimonData() {
    const system = this.system;

this._prepareDigimonStage(system);
this._prepareDigimonPersistentEvolutionState(system);
this._prepareDigimonEvolutionGraph(system);
this._prepareDigimonQualityBonuses(system);
this._prepareDigimonEffectBonuses(system);
this._prepareDigimonMainStats(system);
this._prepareDigimonDerivedStats(system);
this._prepareDigimonMiscStats(system);
this._prepareDigimonMovementTypes(system);
this._prepareDigimonQualityRequirements(system);
this._prepareDigimonDp(system);
  }

_prepareDigimonEvolutionGraph(system) {
  if (!system.evolutionGraph) {
    system.evolutionGraph = {
      layout: { mode: "solar" },
      nodes: [],
      edges: []
    };
  }

  if (!system.evolutionGraph.layout) {
    system.evolutionGraph.layout = { mode: "solar" };
  }

  if (!Array.isArray(system.evolutionGraph.nodes)) {
    system.evolutionGraph.nodes = [];
  }

  if (!Array.isArray(system.evolutionGraph.edges)) {
    system.evolutionGraph.edges = [];
  }
}


_prepareDigimonPersistentEvolutionState(system) {
  if (!system.evolution) {
    system.evolution = {};
  }

  system.evolution.defaultStage = String(system.evolution.defaultStage ?? system.stage ?? "child");
  system.evolution.currentStage = String(system.evolution.currentStage ?? system.stage ?? "child");
  system.evolution.currentFormUuid = String(system.evolution.currentFormUuid ?? system.evolution.sourceFormUuid ?? "");
  system.evolution.currentFormName = String(system.evolution.currentFormName ?? system.evolution.sourceFormName ?? system.species ?? "");
  system.evolution.sourceFormUuid = String(system.evolution.sourceFormUuid ?? system.evolution.currentFormUuid ?? "");
  system.evolution.sourceFormName = String(system.evolution.sourceFormName ?? system.evolution.currentFormName ?? system.species ?? "");
  system.evolution.previousFormUuid = String(system.evolution.previousFormUuid ?? "");
  system.evolution.previousFormName = String(system.evolution.previousFormName ?? "");
  system.evolution.lastTransitionType = String(system.evolution.lastTransitionType ?? "");
  system.evolution.lastEvolvedAt = String(system.evolution.lastEvolvedAt ?? "");

  if (!Array.isArray(system.evolution.unlockedStages)) {
    system.evolution.unlockedStages = ["baby1", "baby2", "child"];
  }

  if (!Array.isArray(system.evolution.forms)) {
    system.evolution.forms = [];
  }

  if (!system.evolution.formSnapshots || typeof system.evolution.formSnapshots !== "object" || Array.isArray(system.evolution.formSnapshots)) {
    system.evolution.formSnapshots = {};
  }
}

_prepareDigimonQualityBonuses(system) {
  const mainStats = system.mainStats ?? {};
  const miscStats = system.miscStats ?? {};
for (const stat of Object.values(mainStats)) {
  stat.sharedBonus = 0;
  stat.sharedBonusSources = [];
  stat.automaticSuccesses = 0;
  stat.automaticSuccessSources = [];
}
for (const stat of Object.values(system.derivedStats ?? {})) {
  stat.qualityBonus = 0;
  stat.qualityBonusSources = [];
}

if (miscStats.movement) {
  miscStats.movement.qualityBonus = 0;
  miscStats.movement.qualityBonusSources = [];
}

if (miscStats.initiative) {
  miscStats.initiative.qualityBonus = 0;
  miscStats.initiative.qualityBonusSources = [];
}

system.qualityFeatures ??= {};
system.qualityFeatures.treatsSurpriseRoundsAsNormal = false;
system.qualityFeatures.readsDigicode = false;
system.qualityFeatures.firewallApplications = false;
system.qualityFeatures.trojanApplications = false;

system.qualityFeatures.dataOptimization = {
  choice: "",
  choiceLabel: "",

  closeCombat: false,
  closeCombatAccuracyBonus: 0,
  closeCombatWoundedTargetAccuracyBonus: 0,

  rangedStriker: false,
  rangedStrikerAccuracyBonus: 0,
  rangedStrikerRangeBonus: 0,
  rangedStrikerEffectiveLimitBonus: 0,

  warden: false,
  wardenInterruptActionDiscount: 0,
  wardenUsesPerCombat: 0,

  brawler: false,
  brawlerClashCheckBonus: 0,
  brawlerClashDamageBonus: 0,

  speedster: false,
  speedsterDodgePenaltyIgnoreCount: 0,

  effectWarrior: false,
  effectWarriorPotencyBonus: 0,

  variable: false,
  variableRerollPerRound: 0
};

system.qualityFeatures.naturewalk = {
  elements: [],
  elementLabels: [],
  terrains: [],
  ignoresDifficultTerrainForElements: [],
  elementalForceNoBonusDamageElements: [],

  darkvision: false,
  lowLightVision: false,
  awarenessBonus: 0,

  damageReduction: {
    burn: 0,
    freeze: 0,
    poison: 0,
    crash: 0
  },

  sources: []
};

system.qualityFeatures.extraMovement = {
  types: [],
  typeLabels: [],
  byType: {},
  flightMovementPenaltyApplied: false,
  flightMovementPenalty: 0,
  sources: []
};

system.qualityFeatures.advancedMobility = {
  types: [],
  typeLabels: [],
  byType: {},

  fly: {
    severeWindSlowImmunity: false,
    lostAtWoundRatio: 0.25
  },

  dig: {
    hardMaterialDigging: false,
    leavesTunnel: false,
    tremorSenseFullRangeUnderground: false,
    tremorSenseHalfRangeAboveGround: false
  },

  swim: {
    underwaterBreathing: false,
    indefiniteBreath: false,
    severeCurrentSlowImmunity: false,
    unusualLiquids: false,
    underwaterVisionPenaltyImmunity: false
  },

  climb: {
    ceilingMovement: false,
    verticalSurfaceSlowImmunity: false,
    rootImmunity: false
  },

  jump: {
    curvedTrajectory: false,
    fallAndThrowDamageReductionFrom: "",
    fallDamageNegatedWithTumbler: false,
    difficultTerrainJumpEntryExit: false
  },

  sources: []
};

system.utilityBonuses ??= {};

system.utilityBonuses.technician = {
  key: "technician",
  label: "Técnico",
  value: 0,
  sources: []
};

system.utilityBonuses.crashDamageReduction = {
  key: "crashDamageReduction",
  label: "Redução de Dano de Colisão",
  from: "",
  value: 0,
  sources: []
};

system.utilityBonuses.damageReductionByType = {
  burn: {
    key: "burn",
    value: 0,
    sources: []
  },
  freeze: {
    key: "freeze",
    value: 0,
    sources: []
  },
  poison: {
    key: "poison",
    value: 0,
    sources: []
  },
  crash: {
    key: "crash",
    value: 0,
    sources: []
  }
};

system.skillBonuses = {};

  for (const item of this.items) {
    if (item.type !== "quality") continue;

    const itemSystem = item.system ?? {};
const grants = itemSystem.grants ?? {};
const mainStatGrants = grants.mainStats ?? {};
const mainStatPerRankGrants = grants.mainStatsPerRank ?? {};
const derivedStatGrants = grants.derivedStats ?? {};
const derivedStatChoicePerRank = Number(grants.derivedStatChoicePerRank ?? 0);


const rankValue = getQualityRankValue(itemSystem);
const sourceId = getQualitySourceId(item);
const choiceKeys = getQualityChoiceKeys(itemSystem);

if (miscStats.movement && grants.miscStats) {
  const movementFlat = Number(grants.miscStats.movement ?? 0);
  const movementPerRank = Number(grants.miscStats.movementPerRank ?? 0);

  if (movementFlat !== 0) {
    miscStats.movement.qualityBonus += movementFlat;

    miscStats.movement.qualityBonusSources.push({
      name: item.name,
      value: movementFlat,
      type: "flat"
    });
  }

if (movementPerRank !== 0) {
  const movementRankValue = isAccelerateQualitySystem(itemSystem)
    ? getAccelerateAppliedRankValue(itemSystem, system)
    : rankValue;

  const totalMovementPerRank = movementPerRank * movementRankValue;

  if (totalMovementPerRank !== 0) {
    miscStats.movement.qualityBonus += totalMovementPerRank;

    miscStats.movement.qualityBonusSources.push({
      name: item.name,
      value: totalMovementPerRank,
      type: "perRank",
      rank: movementRankValue,
      declaredRank: rankValue,
      perRank: movementPerRank,
      capped: movementRankValue < rankValue
    });
  }
}
}

for (const [statKey, value] of Object.entries(mainStatGrants)) {
  if (!mainStats[statKey]) continue;

  const bonusValue = Number(value ?? 0);
  if (bonusValue === 0) continue;

  mainStats[statKey].sharedBonus += bonusValue;

  mainStats[statKey].sharedBonusSources.push({
    name: item.name,
    value: bonusValue,
    type: "flat"
  });
}

for (const [statKey, value] of Object.entries(mainStatPerRankGrants)) {
  if (!mainStats[statKey]) continue;

  const perRankValue = Number(value ?? 0);
  if (perRankValue === 0) continue;

  const totalValue = perRankValue * rankValue;

  addQualitySourceBonus(mainStats[statKey], {
    name: item.name,
    value: totalValue,
    type: "perRank",
    rank: rankValue,
    perRank: perRankValue
  });
}

if (derivedStatChoicePerRank !== 0 && choiceKeys.length > 0) {
  const derivedStats = system.derivedStats ?? {};
  const allowedDerivedStats = new Set(["bit", "dos", "ram", "cpu"]);

  for (const choiceKey of choiceKeys) {
    const statKey = String(choiceKey ?? "").trim().toLowerCase();

    if (!allowedDerivedStats.has(statKey)) continue;
    if (!derivedStats[statKey]) continue;

    const currentQualityBonus = Number(derivedStats[statKey].qualityBonus ?? 0);
    const bonusValue = derivedStatChoicePerRank;

    derivedStats[statKey].qualityBonus = currentQualityBonus + bonusValue;
    derivedStats[statKey].qualityBonusSources = Array.isArray(derivedStats[statKey].qualityBonusSources)
      ? derivedStats[statKey].qualityBonusSources
      : [];

    derivedStats[statKey].qualityBonusSources.push({
      name: item.name,
      value: bonusValue,
      type: "choice",
      choice: statKey
    });
  }
}

for (const [grantKey, value] of Object.entries(derivedStatGrants)) {
  const perRankValue = Number(value ?? 0);
  if (perRankValue === 0) continue;

  const match = String(grantKey).match(/^(accuracy|damage|dodge|armor|health|movement)PerRank$/);
  if (!match) continue;

  const statKey = match[1];

  // derivedStats é fallback/compatibilidade.
  // Se o bônus já existe no caminho canônico, não soma de novo.
  if (statKey === "movement") {
    const alreadyHasCanonicalMovementGrant =
      Number(grants.miscStats?.movementPerRank ?? 0) !== 0 ||
      Number(grants.miscStats?.movement ?? 0) !== 0;

    if (alreadyHasCanonicalMovementGrant) continue;

    if (miscStats.movement) {
      const totalValue = perRankValue * rankValue;

      miscStats.movement.qualityBonus += totalValue;
      miscStats.movement.qualityBonusSources.push({
        name: item.name,
        value: totalValue,
        type: "perRank",
        rank: rankValue,
        perRank: perRankValue
      });
    }

    continue;
  }

  const alreadyHasCanonicalMainStatGrant =
    Number(mainStatPerRankGrants?.[statKey] ?? 0) !== 0 ||
    Number(mainStatGrants?.[statKey] ?? 0) !== 0;

  if (alreadyHasCanonicalMainStatGrant) continue;

  if (mainStats[statKey]) {
    const totalValue = perRankValue * rankValue;

    addQualitySourceBonus(mainStats[statKey], {
      name: item.name,
      value: totalValue,
      type: "perRank",
      rank: rankValue,
      perRank: perRankValue
    });
  }
}

if (isDataOptimizationQuality(item)) {
  const dataOptimization = system.qualityFeatures.dataOptimization;
  const choiceLabel = getSelectedQualityChoiceLabel(itemSystem);

  dataOptimization.choiceLabel = choiceLabel;

  const hasCloseCombat = qualityHasChoice(choiceKeys, "closeCombat", "close combat");
  const hasRangedStriker = qualityHasChoice(choiceKeys, "rangedStriker", "ranged striker");
  const hasWarden = qualityHasChoice(choiceKeys, "warden");
  const hasBrawler = qualityHasChoice(choiceKeys, "brawler");
  const hasSpeedster = qualityHasChoice(choiceKeys, "speedster");
  const hasEffectWarrior = qualityHasChoice(choiceKeys, "effectWarrior", "effect warrior");
  const hasVariable = qualityHasChoice(choiceKeys, "variable");

  if (hasCloseCombat) {
    dataOptimization.choice = "closeCombat";
    dataOptimization.closeCombat = true;
    dataOptimization.closeCombatAccuracyBonus = 1;
    dataOptimization.closeCombatWoundedTargetAccuracyBonus = 3;
  }

  if (hasRangedStriker) {
    dataOptimization.choice = "rangedStriker";
    dataOptimization.rangedStriker = true;
    dataOptimization.rangedStrikerAccuracyBonus = 1;
    dataOptimization.rangedStrikerRangeBonus = 2;
    dataOptimization.rangedStrikerEffectiveLimitBonus = 2;
  }

  if (hasWarden) {
    dataOptimization.choice = "warden";
    dataOptimization.warden = true;
    dataOptimization.wardenInterruptActionDiscount = 1;
    dataOptimization.wardenUsesPerCombat = 1;

    if (mainStats.armor) {
      addQualitySourceBonus(mainStats.armor, {
        name: item.name,
        value: 1,
        type: "choice",
        choice: "warden"
      });
    }
  }

  if (hasBrawler) {
    dataOptimization.choice = "brawler";
    dataOptimization.brawler = true;
    dataOptimization.brawlerClashCheckBonus = 1;
    dataOptimization.brawlerClashDamageBonus = 1;
  }

  if (hasSpeedster) {
    dataOptimization.choice = "speedster";
    dataOptimization.speedster = true;
    dataOptimization.speedsterDodgePenaltyIgnoreCount = 1;

    if (miscStats.movement) {
      miscStats.movement.qualityBonus += 1;
      miscStats.movement.qualityBonusSources.push({
        name: item.name,
        value: 1,
        type: "choice",
        choice: "speedster"
      });
    }
  }

  if (hasEffectWarrior) {
    dataOptimization.choice = "effectWarrior";
    dataOptimization.effectWarrior = true;
    dataOptimization.effectWarriorPotencyBonus = 1;
  }

  if (hasVariable) {
    dataOptimization.choice = "variable";
    dataOptimization.variable = true;
    dataOptimization.variableRerollPerRound = 1;
  }
}

if (isNaturewalkQuality(item)) {
  const naturewalk = system.qualityFeatures.naturewalk;
  const selectedChoices = getQualitySelectedChoices(itemSystem);
  const seenElements = new Set();

  for (const choice of selectedChoices) {
    const elementKey = String(choice.key ?? choice.value ?? choice.id ?? "").trim();
    const normalizedElementKey = normalizeQualityChoiceKey(elementKey);

    if (!normalizedElementKey || seenElements.has(normalizedElementKey)) continue;

    seenElements.add(normalizedElementKey);

    const optionData = getQualityChoiceOptionData(itemSystem, elementKey);
    const elementLabel = String(
      choice.label ??
      optionData?.label ??
      optionData?.originalLabel ??
      elementKey
    ).trim();

    const terrain = String(optionData?.terrain ?? "").trim();
    const elementData = getNaturewalkElementData(elementKey);

    naturewalk.elements.push(normalizedElementKey);
    naturewalk.elementLabels.push(elementLabel);
    naturewalk.ignoresDifficultTerrainForElements.push(normalizedElementKey);
    naturewalk.elementalForceNoBonusDamageElements.push(normalizedElementKey);

    if (terrain) {
      naturewalk.terrains.push({
        key: normalizedElementKey,
        label: elementLabel,
        terrain
      });
    }

    naturewalk.sources.push({
      name: item.name,
      element: normalizedElementKey,
      label: elementLabel,
      terrain
    });

    if (elementData.damageReductionType) {
      const reductionType = elementData.damageReductionType;

      naturewalk.damageReduction[reductionType] = Number(naturewalk.damageReduction[reductionType] ?? 0) + 1;

      if (system.utilityBonuses.damageReductionByType?.[reductionType]) {
        system.utilityBonuses.damageReductionByType[reductionType].value += 1;
        system.utilityBonuses.damageReductionByType[reductionType].sources.push({
          name: item.name,
          element: normalizedElementKey,
          label: elementLabel,
          value: 1,
          type: "naturewalk"
        });
      }
    }

    if (elementData.crashReduction > 0) {
      system.utilityBonuses.crashDamageReduction.sources.push({
        name: item.name,
        element: normalizedElementKey,
        label: elementLabel,
        value: elementData.crashReduction,
        type: "flat"
      });
    }

    if (elementData.awarenessBonus > 0) {
      naturewalk.awarenessBonus += elementData.awarenessBonus;
      naturewalk.darkvision = true;
      naturewalk.lowLightVision = true;

      addDigimonSkillBonus(system, "awareness", {
        name: item.name,
        label: game.i18n.localize("DDA.Skill.Awareness"),
        derivedStat: "bit",
        value: elementData.awarenessBonus
      });
    }
  }

  naturewalk.elements = [...new Set(naturewalk.elements)];
  naturewalk.elementLabels = [...new Set(naturewalk.elementLabels)];
  naturewalk.ignoresDifficultTerrainForElements = [...new Set(naturewalk.ignoresDifficultTerrainForElements)];
  naturewalk.elementalForceNoBonusDamageElements = [...new Set(naturewalk.elementalForceNoBonusDamageElements)];
}

if (isExtraMovementQuality(item)) {
  const extraMovement = system.qualityFeatures.extraMovement;
  const selectedChoices = getQualitySelectedChoices(itemSystem);

  for (const choice of selectedChoices) {
    const choiceKey = String(choice.key ?? choice.value ?? choice.id ?? "").trim();
    const movementType = getExtraMovementTypeFromChoiceKey(choiceKey);

    if (!movementType) continue;

    const label = getQualityMovementChoiceLabel(itemSystem, choice);

    if (!extraMovement.types.includes(movementType)) {
      extraMovement.types.push(movementType);
    }

    if (label && !extraMovement.typeLabels.includes(label)) {
      extraMovement.typeLabels.push(label);
    }

    extraMovement.byType[movementType] = {
      key: movementType,
      choiceKey,
      label,
      source: item.name,
      enabled: true
    };

    extraMovement.sources.push({
      name: item.name,
      movementType,
      choiceKey,
      label
    });

    if (movementType === "fly" && miscStats.movement && !extraMovement.flightMovementPenaltyApplied) {
      extraMovement.flightMovementPenaltyApplied = true;
      extraMovement.flightMovementPenalty = -1;

      miscStats.movement.qualityBonus -= 1;
      miscStats.movement.qualityBonusSources.push({
        name: item.name,
        value: -1,
        type: "choice",
        choice: "flight"
      });
    }
  }
}

if (isAdvancedMobilityQuality(item)) {
  const advancedMobility = system.qualityFeatures.advancedMobility;
  const selectedChoices = getQualitySelectedChoices(itemSystem);

  for (const choice of selectedChoices) {
    const choiceKey = String(choice.key ?? choice.value ?? choice.id ?? "").trim();
    const movementType = getExtraMovementTypeFromChoiceKey(choiceKey);

    if (!movementType) continue;

    const label = getQualityMovementChoiceLabel(itemSystem, choice);

    if (!advancedMobility.types.includes(movementType)) {
      advancedMobility.types.push(movementType);
    }

    if (label && !advancedMobility.typeLabels.includes(label)) {
      advancedMobility.typeLabels.push(label);
    }

    advancedMobility.byType[movementType] = {
      key: movementType,
      choiceKey,
      label,
      source: item.name,
      enabled: true
    };

    advancedMobility.sources.push({
      name: item.name,
      movementType,
      choiceKey,
      label
    });

    if (movementType === "fly") {
      advancedMobility.fly.severeWindSlowImmunity = true;
      advancedMobility.fly.lostAtWoundRatio = 0.25;
    }

    if (movementType === "dig") {
      advancedMobility.dig.hardMaterialDigging = true;
      advancedMobility.dig.leavesTunnel = true;
      advancedMobility.dig.tremorSenseFullRangeUnderground = true;
      advancedMobility.dig.tremorSenseHalfRangeAboveGround = true;
    }

    if (movementType === "swim") {
      advancedMobility.swim.underwaterBreathing = true;
      advancedMobility.swim.indefiniteBreath = true;
      advancedMobility.swim.severeCurrentSlowImmunity = true;
      advancedMobility.swim.unusualLiquids = true;
      advancedMobility.swim.underwaterVisionPenaltyImmunity = true;
    }

    if (movementType === "climb") {
      advancedMobility.climb.ceilingMovement = true;
      advancedMobility.climb.verticalSurfaceSlowImmunity = true;
      advancedMobility.climb.rootImmunity = true;
    }

    if (movementType === "jump") {
      advancedMobility.jump.curvedTrajectory = true;
      advancedMobility.jump.fallAndThrowDamageReductionFrom = "ram";
      advancedMobility.jump.fallDamageNegatedWithTumbler = true;
      advancedMobility.jump.difficultTerrainJumpEntryExit = true;
    }
  }
}

const initiativeBonus = Number(grants.initiativeBonus ?? 0);

if (initiativeBonus !== 0 && miscStats.initiative) {
  miscStats.initiative.qualityBonus += initiativeBonus;
  miscStats.initiative.qualityBonusSources.push({
    name: item.name,
    value: initiativeBonus,
    type: "flat"
  });
}

if (grants.treatsSurpriseRoundsAsNormal) {
  system.qualityFeatures.treatsSurpriseRoundsAsNormal = true;
}

const technicianBonus = Number(grants.technicianBonus ?? 0);
const technicianBonusIncrease = Number(grants.technicianBonusIncrease ?? 0);
const totalTechnicianBonus = technicianBonus + technicianBonusIncrease;

if (totalTechnicianBonus !== 0) {
  system.utilityBonuses.technician.value += totalTechnicianBonus;
  system.utilityBonuses.technician.sources.push({
    name: item.name,
    value: totalTechnicianBonus,
    type: technicianBonusIncrease !== 0 ? "increase" : "base"
  });
}

if (grants.readsDigicode) {
  system.qualityFeatures.readsDigicode = true;
}

if (grants.firewallApplications) {
  system.qualityFeatures.firewallApplications = true;
}

if (grants.trojanApplications) {
  system.qualityFeatures.trojanApplications = true;
}

const crashDamageReductionFrom = String(grants.crashDamageReductionFrom ?? "").trim().toLowerCase();

if (crashDamageReductionFrom) {
  system.utilityBonuses.crashDamageReduction.from = crashDamageReductionFrom;
  system.utilityBonuses.crashDamageReduction.sources.push({
    name: item.name,
    from: crashDamageReductionFrom,
    type: "derivedStat"
  });
}

const automaticSuccessGrants = grants.automaticSuccesses ?? {};
for (const [statKey, value] of Object.entries(automaticSuccessGrants)) {
  const match = String(statKey).match(/^(accuracy|damage|dodge|armor|health)PerRank$/);
  if (!match) continue;

  const targetKey = match[1];
  const totalValue = Number(value ?? 0) * rankValue;
  if (totalValue === 0 || !mainStats[targetKey]) continue;

  mainStats[targetKey].automaticSuccesses = Number(mainStats[targetKey].automaticSuccesses ?? 0) + totalValue;
  mainStats[targetKey].automaticSuccessSources = Array.isArray(mainStats[targetKey].automaticSuccessSources)
    ? mainStats[targetKey].automaticSuccessSources
    : [];
  mainStats[targetKey].automaticSuccessSources.push({ name: item.name, value: totalValue, type: "perRank", rank: rankValue, perRank: Number(value ?? 0) });
}


const skillBonus = Number(grants.skillBonus ?? 0);
const selectedRanks = Array.isArray(itemSystem.choices?.selectedRanks)
  ? itemSystem.choices.selectedRanks
  : [];

if (skillBonus > 0 && selectedRanks.length > 0) {
  const rankLimitData = getQualityRankLimitForStage(
    itemSystem,
    system.stage ?? "child",
    system
  );

  const effectiveRankMax = Math.max(0, Number(rankLimitData.max ?? selectedRanks.length));
  const rankValue = getQualityRankValue(itemSystem);
  const appliedChoiceCount = Math.max(
    0,
    Math.min(selectedRanks.length, rankValue, effectiveRankMax || selectedRanks.length)
  );

  const appliedChoices = selectedRanks.slice(0, appliedChoiceCount);

  for (const choice of appliedChoices) {
    const skillKey = choice.key;
    if (!skillKey) continue;

    const optionData = itemSystem.choices?.options?.find((option) => {
      return option.key === skillKey;
    });

    const currentBonus = Number(system.skillBonuses[skillKey]?.value ?? 0);

    system.skillBonuses[skillKey] = {
      key: skillKey,
      label: choice.label ?? optionData?.label ?? skillKey,
      derivedStat: choice.derivedStat ?? optionData?.derivedStat ?? "",
      value: currentBonus + skillBonus,
      sources: [
        ...(system.skillBonuses[skillKey]?.sources ?? []),
        item.name
      ]
    };
  }
}
  }

  for (const stat of Object.values(mainStats)) {
    const sources = Array.isArray(stat.sharedBonusSources)
      ? stat.sharedBonusSources
      : [];

    stat.sharedBonusTooltip = sources.length
      ? sources.map((source) => {
          if (source.type === "perRank") {
            return `${source.name}: +${source.value} (${source.perRank}/Rank × ${source.rank})`;
          }

          return `${source.name}: +${source.value}`;
        }).join("\n")
      : game.i18n.localize("DDA.QualityBonus.None");
  }

if (miscStats.movement) {
  const sources = Array.isArray(miscStats.movement.qualityBonusSources)
    ? miscStats.movement.qualityBonusSources
    : [];

  miscStats.movement.qualityBonusTooltip = sources.length
    ? sources.map((source) => {
        if (source.type === "perRank") {
          return game.i18n.format("DDA.QualityBonus.MovementPerRank", {
            name: source.name,
            value: formatSignedQualityBonus(source.value),
            perRank: formatSignedQualityBonus(source.perRank),
            rank: source.rank
          });
        }

        return game.i18n.format("DDA.QualityBonus.MovementFlat", {
          name: source.name,
          value: formatSignedQualityBonus(source.value)
        });
      }).join("\n")
    : game.i18n.localize("DDA.QualityBonus.None");
}
}

_prepareDigimonEffectBonuses(system) {
  const mainStats = system.mainStats ?? {};
  const miscStats = system.miscStats ?? {};
  const activeEffects = Array.isArray(system.effects?.active)
    ? system.effects.active
    : [];

  for (const stat of Object.values(mainStats)) {
    stat.effectBonus = 0;
    stat.effectBonusSources = [];
  }

  if (miscStats.movement) {
    miscStats.movement.effectBonus = 0;
    miscStats.movement.effectBonusSources = [];
  }

  const effectModifiers = {
    slow: { dodge: -1 },
    vague: { accuracy: -1 },
    dull: { damage: -1 },
    frail: { armor: -1 },

    keen: { accuracy: 1 },
    swift: { dodge: 1 },
    sharpen: { damage: 1 },
    sturdy: { armor: 1 },

    root: { movement: -1 },
    tailwind: { movement: 1 }
  };

  for (const effect of activeEffects) {
    const tag = String(effect.tag ?? "")
      .replace("[", "")
      .replace("]", "")
      .trim()
      .toLowerCase();

    if (
      tag === "root" &&
      system.qualityFeatures?.advancedMobility?.climb?.rootImmunity
    ) {
      continue;
    }

    const potency = Math.max(0, Number(
      effect.potency ??
      effect.value ??
      1
    ));

    const variableModifiers = {
      bastion: {
        accuracy: potency,
        damage: potency,
        dodge: potency,
        armor: potency
      },
      debilitate: {
        accuracy: -potency,
        damage: -potency,
        dodge: -potency,
        armor: -potency
      }
    };

    const modifiers = variableModifiers[tag] ?? effectModifiers[tag];

    if (!modifiers) continue;

    for (const [statKey, value] of Object.entries(modifiers)) {
      const numericValue = Number(value ?? 0);
      if (numericValue === 0) continue;

      if (statKey === "movement") {
        if (!miscStats.movement) continue;

        miscStats.movement.effectBonus += numericValue;
        miscStats.movement.effectBonusSources.push({
          name: effect.label ?? effect.tag ?? tag,
          value: numericValue,
          tag
        });
        continue;
      }

      if (!mainStats[statKey]) continue;

      mainStats[statKey].effectBonus += numericValue;
      mainStats[statKey].effectBonusSources.push({
        name: effect.label ?? effect.tag ?? tag,
        value: numericValue,
        tag
      });
    }
  }
}


_prepareDigimonStage(system) {
  const stage = system.stage ?? "child";
  const stageData = CONFIG.DDA?.stages?.[stage] ?? CONFIG.DDA?.stages?.child;

  const stageValue = Number(stageData?.stageValue ?? 2);
  const baseDp = Number(stageData?.baseDp ?? stageData?.startingDp ?? 10);

  system.stageValue = stageValue;
  system.size = clampDigimonSizeForStage(system.size, stage);

  // Modelo atual
  if (system.creation?.dp) {
    system.creation.dp.base = baseDp;
  }

  // Compatibilidade com modelo antigo
  if (system.creation) {
    system.creation.baseDp = baseDp;
  }

  // Modelo atual
  if (system.creation?.coreDiscount) {
    system.creation.coreDiscount.base = stageValue;
  }

  // Compatibilidade com modelo antigo
  if (system.coreDiscount) {
    system.coreDiscount.base = stageValue;
  }
}

_prepareDigimonMainStats(system) {
  const mainStats = system.mainStats ?? {};

  const mainStatLabelKeys = {
    accuracy: "DDA.MainStat.Accuracy",
    damage: "DDA.MainStat.Damage",
    dodge: "DDA.MainStat.Dodge",
    armor: "DDA.MainStat.Armor",
    health: "DDA.MainStat.Health"
  };

  for (const [statKey, stat] of Object.entries(mainStats)) {
    const base = Number(stat.base ?? 0);
    const bonus = Number(stat.bonus ?? 0);
    const sharedBonus = Number(stat.sharedBonus ?? 0);
    const effectBonus = Number(stat.effectBonus ?? 0);

    const labelKey = mainStatLabelKeys[statKey] ?? stat.label ?? statKey;

    stat.displayLabel = getLocalizedLabel(labelKey);
    stat.total = Math.max(1, base + bonus + sharedBonus + effectBonus);
  }
}
  _prepareDigimonDerivedStats(system) {
    const mainStats = system.mainStats ?? {};
    const derivedStats = system.derivedStats ?? {};
    const sizeModifiers = this._getSizeModifiers(system.size);
    const sizeLabel = getReadableSizeLabel(system.size);

    const mainStatLabelKeys = {
      accuracy: "DDA.MainStat.Accuracy",
      damage: "DDA.MainStat.Damage",
      dodge: "DDA.MainStat.Dodge",
      armor: "DDA.MainStat.Armor",
      health: "DDA.MainStat.Health"
    };

    const derivedDefinitions = {
      bit: {
        mainStatKey: "accuracy",
        label: "BIT",
        description: localizeActorKey("DDA.TooltipDerivedBITDescription")
      },
      dos: {
        mainStatKey: "damage",
        label: "DOS",
        description: localizeActorKey("DDA.TooltipDerivedDOSDescription")
      },
      ram: {
        mainStatKey: "dodge",
        label: "RAM",
        description: localizeActorKey("DDA.TooltipDerivedRAMDescription")
      },
      cpu: {
        mainStatKey: "armor",
        label: "CPU",
        description: localizeActorKey("DDA.TooltipDerivedCPUDescription")
      }
    };

    for (const [derivedKey, definition] of Object.entries(derivedDefinitions)) {
      const stat = derivedStats[derivedKey];
      if (!stat) continue;

      const mainStat = mainStats[definition.mainStatKey] ?? {};
      const mainStatBase = Number(mainStat.base ?? 0);
      const baseValue = Math.floor(mainStatBase / 3);
      const sizeBonus = Number(sizeModifiers[derivedKey] ?? 0);
      const qualityBonus = Number(stat.qualityBonus ?? 0);
      const total = Math.max(0, baseValue + sizeBonus + qualityBonus);
      stat.base = baseValue;
      stat.sizeBonus = sizeBonus;
      stat.qualityBonus = qualityBonus;
      stat.value = total;
      stat.total = total;
      stat.displayLabel = definition.label;

      const mainStatLabel = getLocalizedLabel(
        mainStatLabelKeys[definition.mainStatKey] ??
        mainStat.label ??
        definition.mainStatKey
      );

      stat.breakdown = {
        title: definition.label,
        description: definition.description,
        baseLabel: formatActorKey("DDA.TooltipDerivedBaseFormula", { stat: mainStatLabel }),
        baseValue,
        sizeLabel,
        sizeBonus,
        totalLabel: localizeActorKey("DDA.Label.Total"),
        total
      };

      const tooltipLines = [
        `${stat.breakdown.baseLabel}: ${baseValue}`,
        `${localizeActorKey("DDA.Label.Size")} (${sizeLabel}): ${formatSignedNumber(sizeBonus)}`
      ];

      if (qualityBonus !== 0) {
        tooltipLines.push(`${localizeActorKey("DDA.TooltipQualityBonus")}: ${formatSignedNumber(qualityBonus)}`);
      }

      tooltipLines.push(`${stat.breakdown.totalLabel}: ${total}`);

      stat.tooltip = tooltipLines.join("\n");    }
  }

  _prepareDigimonMiscStats(system) {
    const stageValue = Number(system.stageValue ?? 0);
    const sizeModifiers = this._getSizeModifiers(system.size);

    const mainStats = system.mainStats ?? {};
    const derivedStats = system.derivedStats ?? {};
    const miscStats = system.miscStats ?? {};

    const healthTotal = Number(mainStats.health?.total ?? 0);

const bit = Number(derivedStats.bit?.value ?? 0);
const dos = Number(derivedStats.dos?.value ?? 0);
const ram = Number(derivedStats.ram?.value ?? 0);
const cpu = Number(derivedStats.cpu?.value ?? 0);

if (system.utilityBonuses?.crashDamageReduction) {
  const crashReduction = system.utilityBonuses.crashDamageReduction;
  const sources = Array.isArray(crashReduction.sources)
    ? crashReduction.sources
    : [];

  const sourceValues = {
    bit,
    dos,
    ram,
    cpu
  };

  const computedSources = [];
  let totalReduction = 0;

  if (!sources.length) {
    const from = String(crashReduction.from ?? "").trim().toLowerCase();
    const derivedValue = Number(sourceValues[from] ?? 0);

    if (from && derivedValue > 0) {
      computedSources.push({
        name: crashReduction.label ?? "Crash Damage Reduction",
        label: from.toUpperCase(),
        value: derivedValue
      });

      totalReduction += derivedValue;
    }
  }

  for (const source of sources) {
    let sourceValue = 0;
    let sourceLabel = "";

    if (source.type === "flat") {
      sourceValue = Number(source.value ?? 0);
      sourceLabel = source.label ?? source.element ?? "";
    } else {
      const from = String(source.from ?? crashReduction.from ?? "").trim().toLowerCase();
      sourceValue = Number(sourceValues[from] ?? 0);
      sourceLabel = from ? from.toUpperCase() : "";
    }

    if (sourceValue <= 0) continue;

    computedSources.push({
      name: source.name,
      label: sourceLabel,
      value: sourceValue
    });

    totalReduction += sourceValue;
  }

  crashReduction.value = Math.max(0, totalReduction);
  crashReduction.total = crashReduction.value;

  crashReduction.tooltip = computedSources.length
    ? computedSources.map((source) => {
        return `${source.name}: ${source.label ? `${source.label} ` : ""}(${source.value})`;
      }).join("\n")
    : game.i18n.localize("DDA.QualityBonus.None");
}

if (miscStats.movement) {
  const movementBase = stageValue + 1;
  const movementBonus = Number(miscStats.movement.bonus ?? 0);
  const movementQualityBonus = Number(miscStats.movement.qualityBonus ?? 0);
  const movementEffectBonus = Number(miscStats.movement.effectBonus ?? 0);
  const movementSizeBonus = Number(sizeModifiers.movement ?? 0);
  const sizeLabel = getReadableSizeLabel(system.size);

  const movementTotal = Math.max(
    0,
    movementBase +
    movementBonus +
    movementQualityBonus +
    movementSizeBonus +
    movementEffectBonus
  );

  miscStats.movement.base = movementBase;
  miscStats.movement.bonus = movementBonus;
  miscStats.movement.qualityBonus = movementQualityBonus;
  miscStats.movement.sizeBonus = movementSizeBonus;
  miscStats.movement.effectBonus = movementEffectBonus;
  miscStats.movement.value = movementTotal;
  miscStats.movement.total = movementTotal;

  const tooltipLines = [
    `${localizeActorKey("DDA.TooltipMovementBaseByStage")} (${localizeActorKey("DDA.TooltipMovementBaseFormula")}): ${movementBase}`
  ];

  if (movementBonus !== 0) {
    tooltipLines.push(`${localizeActorKey("DDA.TooltipManualBonus")}: ${formatSignedNumber(movementBonus)}`);
  }

  if (movementQualityBonus !== 0) {
    tooltipLines.push(`${localizeActorKey("DDA.TooltipQualityBonus")}: ${formatSignedNumber(movementQualityBonus)}`);
  }

  if (movementSizeBonus !== 0) {
    tooltipLines.push(`${localizeActorKey("DDA.Label.Size")} (${sizeLabel}): ${formatSignedNumber(movementSizeBonus)}`);
  }

  if (movementEffectBonus !== 0) {
    tooltipLines.push(`${localizeActorKey("DDA.TooltipEffectBonus")}: ${formatSignedNumber(movementEffectBonus)}`);
  }

  tooltipLines.push(`${localizeActorKey("DDA.Label.Total")}: ${movementTotal}`);

  miscStats.movement.totalTooltip = tooltipLines.join("\n");
  miscStats.movement.breakdown = {
    title: localizeActorKey("DDA.Stat.Movement"),
    description: localizeActorKey("DDA.TooltipMovementDescription"),
    baseLabel: localizeActorKey("DDA.TooltipMovementBaseByStage"),
    baseDescription: localizeActorKey("DDA.TooltipMovementBaseFormula"),
    manualBonusLabel: localizeActorKey("DDA.TooltipManualBonus"),
    qualityBonusLabel: localizeActorKey("DDA.TooltipQualityBonus"),
    sizeBonusLabel: localizeActorKey("DDA.Label.Size"),
    effectBonusLabel: localizeActorKey("DDA.TooltipEffectBonus"),
    totalLabel: localizeActorKey("DDA.Label.Total"),
    baseValue: movementBase,
    manualBonus: movementBonus,
    qualityBonus: movementQualityBonus,
    sizeLabel,
    sizeBonus: movementSizeBonus,
    effectBonus: movementEffectBonus,
    total: movementTotal
  };
}

if (miscStats.wounds) {
  const woundsMax = Math.max(1, stageValue + healthTotal * 2);

  const woundsValueRaw = Number(miscStats.wounds.value ?? woundsMax);
  const woundsTempValueRaw = Number(miscStats.wounds.temp?.value ?? 0);

  const woundsValue = Number.isFinite(woundsValueRaw) ? woundsValueRaw : woundsMax;
  const woundsTempValue = Number.isFinite(woundsTempValueRaw) ? woundsTempValueRaw : 0;

  miscStats.wounds.max = woundsMax;
  miscStats.wounds.value = Math.clamp(woundsValue, 0, woundsMax);

  if (miscStats.wounds.temp) {
    miscStats.wounds.temp.value = Math.max(0, woundsTempValue);
  }

  const healthRatio = miscStats.wounds.value / woundsMax;

  miscStats.wounds.healthRatio = healthRatio;

  if (miscStats.wounds.value <= 0) {
    miscStats.wounds.healthClass = "health-empty";
  } else if (healthRatio <= 0.25) {
    miscStats.wounds.healthClass = "health-critical";
  } else if (healthRatio <= 0.5) {
    miscStats.wounds.healthClass = "health-warning";
  } else if (healthRatio <= 0.75) {
    miscStats.wounds.healthClass = "health-caution";
  } else {
    miscStats.wounds.healthClass = "health-healthy";
  }
}
    if (miscStats.range) {
      miscStats.range.value = 3 + bit;
    }

    if (miscStats.effectiveLimit) {
      miscStats.effectiveLimit.value = Number(miscStats.range?.value ?? 3) + stageValue;
    }

if (miscStats.initiative) {
  const initiativeBase = ram;
  const initiativeBonus = Number(miscStats.initiative.bonus ?? 0);
  const initiativeQualityBonus = Number(miscStats.initiative.qualityBonus ?? 0);
  const initiativeEffectBonus = Number(miscStats.initiative.effectBonus ?? 0);

  const initiativeTotal = Math.max(
    0,
    initiativeBase +
    initiativeBonus +
    initiativeQualityBonus +
    initiativeEffectBonus
  );

  miscStats.initiative.base = initiativeBase;
  miscStats.initiative.bonus = initiativeBonus;
  miscStats.initiative.qualityBonus = initiativeQualityBonus;
  miscStats.initiative.effectBonus = initiativeEffectBonus;
  miscStats.initiative.value = initiativeTotal;
  miscStats.initiative.total = initiativeTotal;

  const tooltipLines = [
    `RAM: ${initiativeBase}`
  ];

  if (initiativeBonus !== 0) {
    tooltipLines.push(`${localizeActorKey("DDA.TooltipManualBonus")}: ${formatSignedNumber(initiativeBonus)}`);
  }

  if (initiativeQualityBonus !== 0) {
    tooltipLines.push(`${localizeActorKey("DDA.TooltipQualityBonus")}: ${formatSignedNumber(initiativeQualityBonus)}`);
  }

  if (initiativeEffectBonus !== 0) {
    tooltipLines.push(`${localizeActorKey("DDA.TooltipEffectBonus")}: ${formatSignedNumber(initiativeEffectBonus)}`);
  }

  tooltipLines.push(`${localizeActorKey("DDA.Label.Total")}: ${initiativeTotal}`);

  miscStats.initiative.totalTooltip = tooltipLines.join("\n");
}

    if (miscStats.resistance) {
      miscStats.resistance.value = Math.floor(dos / 2);
    }

    if (miscStats.clash) {
      miscStats.clash.value = cpu + ram;
    }
  }

_prepareDigimonMovementTypes(system) {
  const movementTotal = Number(
    system.miscStats?.movement?.total ??
    system.miscStats?.movement?.value ??
    0
  );

  if (!system.movementTypes) {
    system.movementTypes = {};
  }

  const movementTypes = system.movementTypes;

  const movementLabelKeys = {
    land: "DDA.Movement.Land",
    jump: "DDA.Movement.Jump",
    swim: "DDA.Movement.Swim",
    fly: "DDA.Movement.Fly",
    dig: "DDA.Movement.Dig",
    climb: "DDA.Movement.Climb",
    teleport: "DDA.Movement.Teleport"
  };

  const defaults = {
    land: {
      labelKey: "DDA.Movement.Land",
      enabled: true,
      base: movementTotal,
      bonus: 0,
      qualityBonus: 0,
      total: movementTotal,
      costMultiplier: 1
    },
    jump: {
      labelKey: "DDA.Movement.Jump",
      enabled: true,
      base: Math.floor(movementTotal / 2),
      bonus: 0,
      qualityBonus: 0,
      total: Math.floor(movementTotal / 2),
      costMultiplier: 2
    },
    swim: {
      labelKey: "DDA.Movement.Swim",
      enabled: true,
      base: Math.floor(movementTotal / 2),
      bonus: 0,
      qualityBonus: 0,
      total: Math.floor(movementTotal / 2),
      costMultiplier: 2
    },
    fly: {
      labelKey: "DDA.Movement.Fly",
      enabled: false,
      base: 0,
      bonus: 0,
      qualityBonus: 0,
      total: 0,
      costMultiplier: 1
    },
    dig: {
      labelKey: "DDA.Movement.Dig",
      enabled: false,
      base: 0,
      bonus: 0,
      qualityBonus: 0,
      total: 0,
      costMultiplier: 1
    },
    climb: {
      labelKey: "DDA.Movement.Climb",
      enabled: false,
      base: 0,
      bonus: 0,
      qualityBonus: 0,
      total: 0,
      costMultiplier: 1
    },
    teleport: {
      labelKey: "DDA.Movement.Teleport",
      enabled: false,
      base: 0,
      bonus: 0,
      qualityBonus: 0,
      total: 0,
      costMultiplier: 1
    }
  };

  for (const [key, data] of Object.entries(defaults)) {
    const current = movementTypes[key] ?? {};

    const enabled = current.enabled ?? data.enabled;
    const base = data.base;
    const bonus = Number(current.bonus ?? 0);
    const qualityBonus = 0;
    const labelKey = movementLabelKeys[key] ?? data.labelKey ?? current.label ?? key;

    movementTypes[key] = {
      ...current,
      label: current.label ?? getLocalizedLabel(labelKey),
      labelKey,
      displayLabel: getLocalizedLabel(labelKey),
      enabled,
      base,
      bonus,
      qualityBonus,
      costMultiplier: Number(current.costMultiplier ?? data.costMultiplier),
      total: enabled
        ? Math.max(0, base + bonus + qualityBonus)
        : 0,
      isExtraMovement: false,
      advanced: false,
      disabledByLowHealth: false,
      disabledReason: ""
    };
  }

  for (const item of this.items) {
    if (item.type !== "quality") continue;

    const itemSystem = item.system ?? {};
    const grants = itemSystem.grants ?? {};

    const grantedMovementType = getExtraMovementTypeFromChoiceKey(grants.movementType ?? "");

    if (grantedMovementType && movementTypes[grantedMovementType]) {
      movementTypes[grantedMovementType].enabled = true;

      if (grantedMovementType === "teleport") {
        const stageTeleportBase = Number(system.stageValue ?? 0) + 2;

        const instinctRanks = this.items
          .filter((quality) => {
            if (quality.type !== "quality") return false;

            const qualitySourceId = getQualitySourceId(quality);
            const qualityName = normalizeQualityName(quality.name);

            return (
              qualitySourceId === "instinto" ||
              qualitySourceId === "instinct" ||
              qualityName === "instinto" ||
              qualityName === "instinct"
            );
          })
          .reduce((total, quality) => {
            return total + getQualityRankValue(quality.system ?? {});
          }, 0);

        const hasSpeedster = this.items.some((quality) => {
          if (quality.type !== "quality") return false;

          const qualitySourceId = getQualitySourceId(quality);
          const qualityName = normalizeQualityName(quality.name);
          const qualityChoices = getQualityChoiceKeys(quality.system ?? {});

          const isDataOptimization =
            qualitySourceId === "otimizacaoDeDados" ||
            qualitySourceId === "dataOptimization" ||
            qualityName === "otimizacao de dados" ||
            qualityName === "data optimization";

          return isDataOptimization && qualityChoices.includes("speedster");
        });

        const speedsterBonus = hasSpeedster ? 1 : 0;
        const teleportQualityBonus = instinctRanks + speedsterBonus;
        const teleportTotal = Math.max(0, stageTeleportBase + teleportQualityBonus);

        movementTypes.teleport.base = stageTeleportBase;
        movementTypes.teleport.bonus = 0;
        movementTypes.teleport.qualityBonus = teleportQualityBonus;
        movementTypes.teleport.total = teleportTotal;
        movementTypes.teleport.formula = "stage + 2 + instinctRanks + speedsterBonus";
        movementTypes.teleport.totalTooltip = [
          `Estágio + 2: ${stageTeleportBase}`,
          instinctRanks ? `Instinto: +${instinctRanks}` : "",
          speedsterBonus ? `Velocista: +${speedsterBonus}` : "",
          `${localizeActorKey("DDA.Label.Total")}: ${teleportTotal}`
        ].filter(Boolean).join("\n");

        continue;
      }

      movementTypes[grantedMovementType].base = movementTotal;
      movementTypes[grantedMovementType].qualityBonus = Math.max(
        0,
        Number(movementTypes[grantedMovementType].qualityBonus ?? 0)
      );
      movementTypes[grantedMovementType].total = Math.max(
        0,
        movementTotal +
        Number(movementTypes[grantedMovementType].bonus ?? 0) +
        Number(movementTypes[grantedMovementType].qualityBonus ?? 0)
      );
    }
  }

  const extraMovementTypes = new Set(system.qualityFeatures?.extraMovement?.types ?? []);
  const advancedMovementTypes = new Set(system.qualityFeatures?.advancedMobility?.types ?? []);

for (const movementType of extraMovementTypes) {
  if (!movementTypes[movementType]) continue;

  movementTypes[movementType].enabled = true;
  movementTypes[movementType].base = movementTotal;
  movementTypes[movementType].costMultiplier = 1;
  movementTypes[movementType].qualityBonus = Math.max(
    0,
    Number(movementTypes[movementType].qualityBonus ?? 0)
  );
    movementTypes[movementType].total = Math.max(
      0,
      movementTotal +
      Number(movementTypes[movementType].bonus ?? 0) +
      Number(movementTypes[movementType].qualityBonus ?? 0)
    );
    movementTypes[movementType].isExtraMovement = true;
    movementTypes[movementType].advanced = advancedMovementTypes.has(movementType);
  }

  if (movementTypes.fly?.enabled && extraMovementTypes.has("fly")) {
    const woundsValue = Number(system.miscStats?.wounds?.value ?? 0);
    const woundsMax = Number(system.miscStats?.wounds?.max ?? 0);
    const thresholdRatio = advancedMovementTypes.has("fly") ? 0.25 : 0.5;
    const threshold = woundsMax > 0 ? woundsMax * thresholdRatio : 0;

    movementTypes.fly.lostAtWoundRatio = thresholdRatio;
    movementTypes.fly.lostAtWounds = threshold;

    if (woundsMax > 0 && woundsValue <= threshold) {
      movementTypes.fly.enabled = false;
      movementTypes.fly.total = 0;
      movementTypes.fly.disabledByLowHealth = true;
      movementTypes.fly.disabledReason = advancedMovementTypes.has("fly")
        ? "Advanced Mobility: Flight only loses flying speed at one quarter Wounds or below."
        : "Extra Movement: Flight loses flying speed at half Wounds or below.";
    } else {
      movementTypes.fly.disabledByLowHealth = false;
      movementTypes.fly.disabledReason = "";
    }
  }

  if (movementTypes.jump && advancedMovementTypes.has("jump")) {
    movementTypes.jump.advanced = true;
    movementTypes.jump.canCurveTrajectory = true;
    movementTypes.jump.canUseToEnterAndExitDifficultTerrain = true;
  }

  if (movementTypes.swim && advancedMovementTypes.has("swim")) {
    movementTypes.swim.advanced = true;
    movementTypes.swim.canBreatheUnderwater = true;
    movementTypes.swim.indefiniteBreath = true;
  }

  if (movementTypes.dig && advancedMovementTypes.has("dig")) {
    movementTypes.dig.advanced = true;
    movementTypes.dig.canDigHardMaterials = true;
    movementTypes.dig.leavesTunnel = true;
  }

  if (movementTypes.climb && advancedMovementTypes.has("climb")) {
    movementTypes.climb.advanced = true;
    movementTypes.climb.canMoveOnCeilings = true;
    movementTypes.climb.rootImmunity = true;
  }
}

_prepareDigimonDp(system) {
  const creation = system.creation ?? {};
  const dp = creation.dp ?? {};

  const baseDp = Number(dp.base ?? creation.baseDp ?? 0);
  const bonusDp = Number(dp.bonus ?? creation.bonusDp ?? 0);
  const manualNegativeDp = Number(dp.negative ?? creation.negativeDp ?? 0);
  const stageValue = Number(system.stageValue ?? 0);

  let spentDp = 0;
  let grantedDp = 0;
  let negativeQualityDp = 0;
  let freeQualityUsed = 0;

  const coreDiscountBase = Math.max(0, stageValue);
  let coreDiscountUsed = 0;
  let coreDiscountRemaining = coreDiscountBase;

  for (const item of this.items) {
    if (item.type !== "quality") continue;

    const itemSystem = item.system ?? {};
    const itemCost = getQualityTotalCost(itemSystem);

    if (itemSystem.cost) {
      itemSystem.cost.total = itemCost;
    }

    const isFreeQuality = Boolean(
      itemSystem.cost?.isFree ||
      itemSystem.category?.free
    );

    const countsAgainstFreeLimit = Boolean(
      itemSystem.countsAgainstFreeLimit ||
      itemSystem.category?.countsAgainstFreeLimit ||
      itemSystem.cost?.countsAgainstFreeLimit
    );

    if (isFreeQuality && countsAgainstFreeLimit) {
      freeQualityUsed += 1;
    }

    const isNegativeQuality = Boolean(itemSystem.category?.negative);
    const legacyGrantsDp = Boolean(itemSystem.cost?.grantsDp);

    const coreDiscountAvailable = Boolean(
      itemSystem.cost?.coreDiscountAvailable ||
      itemSystem.category?.core
    );

let itemGrantedDp = Number(itemSystem.grants?.dp?.total ?? 0);

      if (itemSystem.grants?.dp) {
        const grantsDpEnabled = Boolean(itemSystem.grants.dp.enabled);
        const grantsDpValue = Math.max(0, Number(itemSystem.grants.dp.value ?? 0));
        const grantsDpTotal = grantsDpEnabled ? grantsDpValue : 0;

        itemSystem.grants.dp.total = grantsDpTotal;
        itemGrantedDp = grantsDpTotal;
      }
    // Compatibilidade com o modelo antigo, em que "Concede PD"
    // transformava o custo em negativo.
    if (legacyGrantsDp && itemGrantedDp === 0) {
      itemGrantedDp = Math.abs(itemCost);
    }

    if (isNegativeQuality || legacyGrantsDp) {
      const grantedByNegativeQuality = Math.max(0, itemGrantedDp);

      grantedDp += grantedByNegativeQuality;
      negativeQualityDp += grantedByNegativeQuality;
      continue;
    }
    
    // Custos negativos antigos não devem reduzir o PD gasto duas vezes.
    const positiveCost = Math.max(0, itemCost);

    let coreDiscountApplied = 0;

    if (coreDiscountAvailable && positiveCost > 0 && coreDiscountRemaining > 0) {
      coreDiscountApplied = Math.min(positiveCost, coreDiscountRemaining);
      coreDiscountRemaining -= coreDiscountApplied;
      coreDiscountUsed += coreDiscountApplied;
    }

    spentDp += Math.max(0, positiveCost - coreDiscountApplied);
  }

const totalNegativeDp = manualNegativeDp + negativeQualityDp;
const totalDp = baseDp + bonusDp + totalNegativeDp;
const remainingDp = totalDp - spentDp;

  const negativeLimitMax = Math.max(0, stageValue);
  const negativeLimitRemaining = Math.max(0, negativeLimitMax - negativeQualityDp);
  const negativeLimitExceeded = negativeQualityDp > negativeLimitMax;

  // Modelo atual da ficha
  if (creation.dp) {
    creation.dp.base = baseDp;
    creation.dp.bonus = bonusDp;
    creation.dp.negative = manualNegativeDp;
    creation.dp.granted = grantedDp;
    creation.dp.negativeFromQualities = negativeQualityDp;
    creation.dp.totalNegative = totalNegativeDp;
    creation.dp.total = totalDp;
    creation.dp.spentTotal = spentDp;
    creation.dp.remaining = remainingDp;
  }

  // Compatibilidade com campos usados antes
  creation.baseDp = baseDp;
  creation.bonusDp = bonusDp;
  creation.negativeDp = manualNegativeDp;
  creation.grantedDp = grantedDp;
  creation.negativeQualityDp = negativeQualityDp;
  creation.totalNegativeDp = totalNegativeDp;
  creation.totalDp = totalDp;
  creation.spentDp = spentDp;
  creation.remainingDp = remainingDp;

  if (system.qualityLimits?.negativeDp) {
    system.qualityLimits.negativeDp.max = negativeLimitMax;
    system.qualityLimits.negativeDp.used = negativeQualityDp;
    system.qualityLimits.negativeDp.remaining = negativeLimitRemaining;
    system.qualityLimits.negativeDp.exceeded = negativeLimitExceeded;
  }

  if (system.qualityLimits?.freeQualities) {
    const freeQualityMax = Number(system.qualityLimits.freeQualities.max ?? 0);
    const freeQualityRemaining = Math.max(0, freeQualityMax - freeQualityUsed);
    const freeQualityExceeded = freeQualityUsed > freeQualityMax;

    system.qualityLimits.freeQualities.max = freeQualityMax;
    system.qualityLimits.freeQualities.used = freeQualityUsed;
    system.qualityLimits.freeQualities.remaining = freeQualityRemaining;
    system.qualityLimits.freeQualities.exceeded = freeQualityExceeded;
  }

  if (creation.negativeDpLimit) {
    creation.negativeDpLimit.max = negativeLimitMax;
    creation.negativeDpLimit.used = negativeQualityDp;
    creation.negativeDpLimit.remaining = negativeLimitRemaining;
    creation.negativeDpLimit.exceeded = negativeLimitExceeded;
  }

  if (!creation.coreDiscount) {
    creation.coreDiscount = {};
  }

  creation.coreDiscount.base = coreDiscountBase;
  creation.coreDiscount.used = coreDiscountUsed;
  creation.coreDiscount.spent = coreDiscountUsed;
  creation.coreDiscount.remaining = coreDiscountRemaining;

  if (!system.coreDiscount) {
    system.coreDiscount = {};
  }

  system.coreDiscount.base = coreDiscountBase;
  system.coreDiscount.used = coreDiscountUsed;
  system.coreDiscount.spent = coreDiscountUsed;
  system.coreDiscount.remaining = coreDiscountRemaining;
}

_prepareDigimonQualityRequirements(system) {
  const stageKey = system.stage ?? "child";
  const ownedQualities = this.items.filter((item) => item.type === "quality");

  const ownedQualityNames = new Set(
    ownedQualities.map((item) => normalizeQualityName(item.name))
  );

  for (const item of ownedQualities) {
    const itemSystem = item.system ?? {};
    const unmet = [];
    const incompatible = [];

    const stageRequirementEnabled = Boolean(itemSystem.stageRequirement?.enabled);

    if (stageRequirementEnabled) {
      const minimumStage = itemSystem.stageRequirement?.minimum ?? "";
      const maximumStage = itemSystem.stageRequirement?.maximum ?? "";

      if (minimumStage && compareStageOrder(stageKey, minimumStage) < 0) {
        unmet.push(`Estágio mínimo: ${getStageLabel(minimumStage)}`);
      }

      if (maximumStage && compareStageOrder(stageKey, maximumStage) > 0) {
        unmet.push(`Estágio máximo: ${getStageLabel(maximumStage)}`);
      }
    }

const rankValue = Math.max(0, Number(itemSystem.rank?.value ?? 0));
const rankLimitData = getQualityRankLimitForStage(itemSystem, stageKey, system);
const effectiveRankMax = rankLimitData.max;

if (itemSystem.rank) {
  itemSystem.rank.effectiveMax = effectiveRankMax;
  itemSystem.rank.exceeded = effectiveRankMax > 0 && rankValue > effectiveRankMax;
}

if (effectiveRankMax > 0 && rankValue > effectiveRankMax) {
  unmet.push(game.i18n.format("DDA.QualityRequirement.MaxRankForStage", { stage: getLocalizedLabel(getStageLabel(stageKey)), max: effectiveRankMax }));
}

const statRankRequirement = getQualityStatRankRequirement(itemSystem);

if (statRankRequirement.enabled && rankValue > 0) {
  const requiredTotal = getQualityRequiredStatTotalForRank(statRankRequirement, rankValue);
  const currentTotal = getActorStatTotalForQualityRequirement(system, statRankRequirement);

  if (requiredTotal > 0 && currentTotal < requiredTotal) {
    const statLabel = getLocalizedLabel(statRankRequirement.labelKey ?? statRankRequirement.stat ?? "");
    unmet.push(`${statLabel} Total ${currentTotal}/${requiredTotal} required for Rank ${rankValue}`);
  }
}

const requiredQualityNames = parseQualityNameList(itemSystem.requirements?.qualityNames);

for (const requiredName of requiredQualityNames) {
  if (!ownedQualityNames.has(normalizeQualityName(requiredName))) {
    unmet.push(game.i18n.format("DDA.QualityRequirement.RequiredQuality", { quality: requiredName }));
  }
}

const incompatibleQualityNames = parseQualityNameList(itemSystem.incompatible?.qualityNames);

for (const incompatibleName of incompatibleQualityNames) {
  if (ownedQualityNames.has(normalizeQualityName(incompatibleName))) {
    incompatible.push(`Incompatível com: ${incompatibleName}`);
  }
}

    if (!itemSystem.requirements) itemSystem.requirements = {};
    if (!itemSystem.incompatible) itemSystem.incompatible = {};

    itemSystem.requirements.met = unmet.length === 0;
    itemSystem.requirements.unmet = unmet;

    itemSystem.incompatible.met = incompatible.length === 0;
    itemSystem.incompatible.unmet = incompatible;

    itemSystem.requirements.valid = unmet.length === 0 && incompatible.length === 0;
  }
}

  _getSizeModifiers(size) {
    const modifiers = {
      small: {
        bit: 2,
        dos: 1,
        ram: 3,
        cpu: 0,
        movement: 0
      },
      medium: {
        bit: 2,
        dos: 1,
        ram: 2,
        cpu: 1,
        movement: 0
      },
      large: {
        bit: 2,
        dos: 1,
        ram: 1,
        cpu: 2,
        movement: 0
      },
      huge: {
        bit: 1,
        dos: 2,
        ram: 1,
        cpu: 2,
        movement: 0
      },
      gigantic: {
        bit: 1,
        dos: 2,
        ram: 0,
        cpu: 3,
        movement: -1
      },
      colossal: {
        bit: 1,
        dos: 2,
        ram: 0,
        cpu: 3,
        movement: -1
      }
    };

    return modifiers[size] ?? modifiers.medium;
  }
}
function getQualityTotalCost(itemSystem) {
  const isFree = Boolean(itemSystem.cost?.isFree || itemSystem.category?.free);
  const isNegative = Boolean(itemSystem.category?.negative);

  if (isFree || isNegative) return 0;

  const baseCost = Math.max(0, Number(itemSystem.cost?.dp ?? 0));
  const rank = Math.max(1, Number(itemSystem.rank?.value ?? 1));
  const limited = Boolean(itemSystem.rank?.limited);

  const effectiveMax = Number(itemSystem.rank?.effectiveMax ?? 0);
  const declaredMax = Number(itemSystem.rank?.max ?? 0);

  let effectiveRank = rank;

  if (limited) {
    const usableMax = effectiveMax > 0
      ? effectiveMax
      : declaredMax > 0
        ? declaredMax
        : rank;

    effectiveRank = Math.min(rank, usableMax);
  }

  if (itemSystem.cost?.perRank) {
    return baseCost * effectiveRank;
  }

  return baseCost;
}

function parseQualityNameList(value) {
  return String(value ?? "")
    .split(/[\n,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeQualityName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function compareStageOrder(currentStage, requiredStage) {
  const order = {
    baby1: 0,
    baby2: 1,
    child: 2,
    adult: 3,
    perfect: 4,
    ultimate: 5,
    ultimatePlus: 6
  };

  const current = Number(order[currentStage] ?? 0);
  const required = Number(order[requiredStage] ?? 0);

  return current - required;
}

function getStageLabel(stageKey) {
  return CONFIG.DDA?.stages?.[stageKey]?.label ?? stageKey;
}


function getLocalizedLabel(label) {
  if (!label) return "";

  const text = String(label);

  if (text.startsWith("DDA.")) {
    return game.i18n.localize(text);
  }

  return text;
}

function getReadableSizeLabel(sizeKey) {
  const normalizedSizeKey = String(sizeKey ?? "medium");

  const sizeLabelKeys = {
    small: "DDA.Size.Small",
    medium: "DDA.Size.Medium",
    large: "DDA.Size.Large",
    huge: "DDA.Size.Huge",
    gigantic: "DDA.Size.Gigantic",
    colossal: "DDA.Size.Colossal"
  };

  const labelKey = sizeLabelKeys[normalizedSizeKey] ?? "DDA.Size.Medium";
  const localized = game.i18n.localize(labelKey);

  if (localized !== labelKey) return localized;

  const fallbackLabels = {
    small: "Small",
    medium: "Medium",
    large: "Large",
    huge: "Huge",
    gigantic: "Gigantic",
    colossal: "Colossal"
  };

  return fallbackLabels[normalizedSizeKey] ?? normalizedSizeKey;
}

function formatSignedNumber(value) {
  const number = Number(value ?? 0);
  return number >= 0 ? `+${number}` : `${number}`;
}

function localizeActorKey(key) {
  return game.i18n.localize(key);
}

function getQualityStatRankRequirement(itemSystem = {}) {
  const configured = itemSystem.statRankRequirement ?? {};

  if (configured.enabled) {
    return configured;
  }

  const sourceId = normalizeQualityChoiceKey(itemSystem.sourceId ?? itemSystem.id ?? "");

  if (sourceId === "perfuracaodearmadura" || sourceId === "armorpiercing") {
    return {
      enabled: true,
      statType: "mainStats",
      stat: "damage",
      labelKey: "DDA.MainStat.Damage",
      thresholds: {
        1: 4,
        2: 8,
        3: 12
      }
    };
  }

  if (sourceId === "golp certeiro" || sourceId === "golpecerteiro" || sourceId === "certainstrike") {
    return {
      enabled: true,
      statType: "mainStats",
      stat: "accuracy",
      labelKey: "DDA.MainStat.Accuracy",
      thresholds: {
        1: 4,
        2: 8,
        3: 12
      }
    };
  }

  return {
    enabled: false
  };
}

function getQualityRequiredStatTotalForRank(requirement = {}, rankValue = 1) {
  const thresholds = requirement.thresholds ?? {};
  const rank = Math.max(1, Number(rankValue ?? 1));

  if (Number(thresholds[rank] ?? 0) > 0) {
    return Number(thresholds[rank]);
  }

  const availableRanks = Object.keys(thresholds)
    .map((key) => Number(key))
    .filter((key) => Number.isFinite(key))
    .sort((a, b) => a - b);

  const fallbackRank = availableRanks
    .filter((key) => key <= rank)
    .at(-1);

  return Math.max(0, Number(thresholds[fallbackRank] ?? 0));
}

function getActorStatTotalForQualityRequirement(actorSystem = {}, requirement = {}) {
  const statType = String(requirement.statType ?? "mainStats");
  const statKey = String(requirement.stat ?? "");

  const stat = statType === "derivedStats"
    ? actorSystem.derivedStats?.[statKey]
    : actorSystem.mainStats?.[statKey];

  return Math.max(0, Number(
    stat?.total ??
    stat?.value ??
    stat?.max ??
    stat?.base ??
    0
  ));
}

function getQualityRankLimitForStage(itemSystem, stageKey, actorSystem = {}) {
  const rankLimit = itemSystem.rankLimit ?? {};
  const type = rankLimit.type ?? "fixed";
if (isAccelerateQualitySystem(itemSystem)) {
  const ramLimit = getAccelerateRamLimit(actorSystem);

  return {
    type: "accelerate",
    max: ramLimit,
    ramLimit
  };
}

  if (type === "derivedStat") {
    const statKey = rankLimit.stat ?? "";
    const stat = actorSystem.derivedStats?.[statKey];

    const derivedValue = Number(
      stat?.total ??
      stat?.value ??
      stat?.max ??
      stat?.base ??
      0
    );

    return {
      type,
      max: Math.max(0, derivedValue)
    };
  }

  if (type === "byStage" || type === "byStageMaxFour") {
    const byStageValue = Number(rankLimit.byStage?.[stageKey] ?? 0);

    return {
      type,
      max: Math.max(0, byStageValue)
    };
  }

  const fixedValue = Number(rankLimit.value ?? itemSystem.rank?.max ?? 0);

  return {
    type: "fixed",
    max: Math.max(0, fixedValue)
  };
}
function formatActorKey(key, data = {}) {
  return game.i18n.format(key, data);
}
