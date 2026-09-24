import { getAttributeFinalCap } from "../rules/campaign-rules.js";
import { getCanonicalQualityRankData } from "../rules/quality-rank-limits.js";
import {
  getTamerAttributeCap,
  getTamerEvolutionPointMaximum
} from "../rules/tamer-progression.js";
import {
  CORE_QUALITY_IDS,
  getCoreQualityId,
  findCoreQuality,
  hasCoreQuality,
  getCoreSelectedChoices,
  getDataSpecializationEntries,
  buildDataSpecializationFeature,
  getAlgorithmRank,
  getWeaponInstinctEffectiveMax,
  isWeaponInstinctConflict,
  getDataOptimizationKey,
  getNativeDataSpecializations,
  getMissingDataSpecializationFreeGrants,
  applyIntrinsicQualityDiscount
} from "../rules/core-qualities.js";
import { prepareEvokerCreationActor } from "../combat/evoker-qualities.js";
import { hasUnlockedOfficialTamerTalent } from "../rules/tamer-resources.js";
import {
  isActorBossDisarmed,
  isDataAbsorbActive,
  isWeaponBenefitQuality
} from "../combat/boss-qualities.js";
import { isQualitySuppressedByBossState } from "../rules/quality-automation.js";


const DDA_DIGIMON_MAIN_STAT_MIN =
  1;

const DDA_DIGIMON_MAIN_STAT_MAX =
  20;

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

function isAdaptiveDigizoidArmorQuality(item) {
  if (!item || item.type !== "quality") return false;

  const sourceId = normalizeQualityChoiceKey(
    getQualitySourceId(item)
  );

  const name = normalizeQualityChoiceKey(item.name);

  const originalName = normalizeQualityChoiceKey(
    item.system?.originalName ?? ""
  );

  return (
    sourceId === "armaduradedigizoideadaptavel" ||
    sourceId === "adaptivedigizoidarmor" ||
    name === "armaduradedigizoideadaptavel" ||
    name === "adaptivedigizoidarmor" ||
    originalName === "adaptivedigizoidarmor"
  );
}

function getAdaptiveArmorPointsPerRound(item) {
  const configuredPoints = Number(
    item?.system?.adaptiveArmor?.pointsPerRound ??
    item?.system?.grants?.adaptiveArmorPointsPerRound ??
    0
  );

  if (Number.isFinite(configuredPoints) && configuredPoints > 0) {
    return Math.floor(configuredPoints);
  }

  return isAdaptiveDigizoidArmorQuality(item) ? 4 : 0;
}

const DDA_NEGATIVE_EFFECT_TAGS = new Set([
  "blind",
  "burn",
  "confuse",
  "debilitate",
  "distract",
  "doom",
  "dot",
  "dull",
  "exploit",
  "fear",
  "frail",
  "freeze",
  "heavy",
  "pacify",
  "paralyze",
  "poison",
  "rattled",
  "root",
  "ruin",
  "shaken",
  "slow",
  "stun",
  "taunt",
  "vague",
  "weak"
]);

function normalizeDigimonEffectTag(value = "") {
  return String(value ?? "")
    .replaceAll("[", "")
    .replaceAll("]", "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function isActiveDigimonEffect(effect = {}) {
  if (!effect || typeof effect !== "object") {
    return false;
  }

  if (
    effect.disabled === true ||
    effect.active === false
  ) {
    return false;
  }

  const remainingValue =
    effect.remaining ??
    effect.duration;

  if (
    remainingValue !== undefined &&
    remainingValue !== null &&
    remainingValue !== ""
  ) {
    const numericRemaining =
      Number(remainingValue);

    if (
      Number.isFinite(numericRemaining) &&
      numericRemaining <= 0
    ) {
      return false;
    }
  }

  return true;
}

function isActiveNegativeDigimonEffect(effect = {}) {
  if (!isActiveDigimonEffect(effect)) {
    return false;
  }

  const explicitType = normalizeDigimonEffectTag(
    effect.type ??
    effect.effectType ??
    effect.category ??
    ""
  );

  if (
    explicitType === "negative" ||
    explicitType === "n"
  ) {
    return true;
  }

  const tag =
    normalizeDigimonEffectTag(
      effect.tag
    );

  return DDA_NEGATIVE_EFFECT_TAGS.has(tag);
}

function getActiveNegativeDigimonEffects(system = {}) {
  const activeEffects = Array.isArray(system.effects?.active)
    ? system.effects.active
    : [];

  return activeEffects.filter(isActiveNegativeDigimonEffect);
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

function isNaturewalkQualitySystem(
  itemSystem = {}
) {
  const candidates = [
    itemSystem.sourceId,
    itemSystem.id,
    itemSystem.originalName,
    itemSystem.name
  ];

  return candidates.some((candidate) => {
    return [
      "passonatural",
      "naturewalk"
    ].includes(
      normalizeQualityChoiceKey(
        candidate
      )
    );
  });
}

function getNaturewalkMainStatKey(
  choice = {}
) {
  const statKey =
    String(
      choice.mainStat ??
      choice.coreStat ??
      choice.stat ??
      ""
    )
      .trim()
      .toLowerCase();

  return [
    "accuracy",
    "damage",
    "dodge",
    "armor",
    "health"
  ].includes(statKey)
    ? statKey
    : "";
}

function isInnateTalentQuality(item) {
  const sourceId = normalizeQualityChoiceKey(
    getQualitySourceId(item)
  );

  const name = normalizeQualityChoiceKey(
    item?.name ?? ""
  );

  return [
    "talentoinato",
    "innatetalent"
  ].includes(sourceId) || [
    "talentoinato",
    "innatetalent"
  ].includes(name);
}

function isNaturalWeaknessQuality(item) {
  const sourceId = normalizeQualityChoiceKey(
    getQualitySourceId(item)
  );

  const name = normalizeQualityChoiceKey(
    item?.name ?? ""
  );

  return [
    "fraquezanatural",
    "naturalweakness"
  ].includes(sourceId) || [
    "fraquezanatural",
    "naturalweakness"
  ].includes(name);
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

    const demoralizePenalties = {};
    for (const effect of (Array.isArray(system.effects?.active) ? system.effects.active : [])) {
      const tag = normalizeDigimonEffectTag(effect?.tag);
      const attribute = String(effect?.selectedAttribute ?? "").trim().toLowerCase();
      if (tag !== "demoralize" || !attribute || !system.attributes?.[attribute]) continue;
      demoralizePenalties[attribute] = Math.max(0, Number(demoralizePenalties[attribute] ?? 0)) + 1;
    }
    for (const [attribute, penalty] of Object.entries(demoralizePenalties)) {
      const stat = system.attributes?.[attribute];
      if (!stat) continue;
      const before = Math.max(0, Number(stat.value ?? 0));
      stat.bossDemoralizeBase = before;
      stat.bossDemoralizePenalty = penalty;
      stat.value = Math.max(0, before - penalty);
    }

    const willpower = Number(system.attributes?.willpower?.value ?? 0);
    const endurance = Number(system.skills?.endurance?.value ?? 0);
    const agility = Number(system.attributes?.agility?.value ?? 0);
    const athletics = Number(system.skills?.athletics?.value ?? 0);
    const naturalExplorer = hasUnlockedOfficialTamerTalent(this, "naturalExplorer");
    const milestoneValue = Number(
      system.advancement?.milestones?.completed ?? 0
    );
    const milestones = Number.isFinite(milestoneValue)
      ? Math.max(0, milestoneValue)
      : 0;

    const ipMax =
      2 + willpower;

    const evolutionPointsMax =
      getTamerEvolutionPointMaximum(
        this
      );

    const woundsMax =
      3 + Math.max(
        0,
        endurance
      );
    const movement = Math.max(
      0,
      naturalExplorer
        ? Math.max(agility, athletics)
        : agility
    );
    const attributeCap = getTamerAttributeCap(this);

    system.advancement ??= {};
    system.advancement.milestones ??= {
      completed: milestones,
      method: "narrative",
      history: []
    };
    system.advancement.milestones.history ??= [];

    system.advancement.growthPoints ??= {
      available: 0,
      spent: 0,
      perMilestone: 3,
      packages: []
    };
    system.advancement.growthPoints.packages ??= [];

    system.advancement.attributeCap ??= {
      current: attributeCap,
      final: getAttributeFinalCap()
    };

    system.resources ??= {};

    system.resources.ip ??= {
      value: 0,
      max: 0,
      temp: 0
    };

    system.resources.evolutionPoints ??= {
      value: 0,
      max: 0
    };

    system.resources.ip.max =
      ipMax;

    const evolutionPointsValue =
      Number(
        system.resources
          .evolutionPoints
          .value ??
        0
      );

    system.resources.evolutionPoints.max =
      evolutionPointsMax;

    /*
     * Apenas limita o valor durante prepareDerivedData.
     * Não enche automaticamente aqui, pois isso devolveria
     * EP gastos toda vez que a ficha fosse renderizada.
     */
    system.resources.evolutionPoints.value =
      Math.clamp(
        Number.isFinite(
          evolutionPointsValue
        )
          ? evolutionPointsValue
          : 0,

        0,
        evolutionPointsMax
      );

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
      system.derived.movement.total = movement;
      system.derived.movement.land = movement;
      system.derived.movement.climb = naturalExplorer ? movement : Math.max(0, Number(system.derived.movement.climb ?? 0));
      system.derived.movement.swim = naturalExplorer ? movement : Math.max(0, Number(system.derived.movement.swim ?? 0));
      system.derived.movement.jump = naturalExplorer ? movement : Math.max(0, Number(system.derived.movement.jump ?? 0));
      system.derived.movement.ignoresDifficultTerrain = naturalExplorer;
      system.derived.movement.naturalExplorer = naturalExplorer;

    system.advancement.attributeCap.current = attributeCap;
    system.advancement.attributeCap.final = Math.max(
      attributeCap,
      Number(getAttributeFinalCap() ?? attributeCap)
    );
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
this._prepareDigimonQualityResources(system);
this._prepareDigimonMiscStats(system);
this._prepareDigimonMovementTypes(system);
this._prepareDigimonQualityRequirements(system);
this._prepareDigimonDp(system);
prepareEvokerCreationActor(this, system);
  }

_prepareDigimonQualityResources(system) {
  system.resources ??= {};
  system.qualityFeatures ??= {};

  const rankBySourceId = (sourceIds = []) => {
    const wanted = new Set(
      sourceIds.map((value) => {
        return normalizeQualityChoiceKey(value);
      })
    );

    return this.items
      .filter((item) => item.type === "quality")
      .filter((item) => {
        const sourceId = normalizeQualityChoiceKey(
          getQualitySourceId(item)
        );

        return wanted.has(sourceId);
      })
      .reduce((total, item) => {
        return total + getQualityRankValue(
          item.system ?? {}
        );
      }, 0);
  };

  const hasQuality = (sourceIds = []) => {
    const wanted = new Set(
      sourceIds.map((value) => {
        return normalizeQualityChoiceKey(value);
      })
    );

    return this.items.some((item) => {
      if (item.type !== "quality") return false;

      const sourceId = normalizeQualityChoiceKey(
        getQualitySourceId(item)
      );

      return wanted.has(sourceId);
    });
  };

  const conjurerRanks = rankBySourceId([
    "conjurador",
    "conjurer"
  ]);

  const summonerRanks = rankBySourceId([
    "invocador",
    "summoner"
  ]);

  const enabled =
    conjurerRanks > 0 ||
    summonerRanks > 0;

  const bit = Math.max(0, Number(
    system.derivedStats?.bit?.total ??
    system.derivedStats?.bit?.value ??
    system.derivedStats?.bit?.base ??
    0
  ));

  const max = enabled
    ? Math.max(
        0,
        bit +
        (2 * (conjurerRanks + summonerRanks))
      )
    : 0;

  const legacyResource =
    system.resources.creationLimit ?? {};

  const currentResource =
    system.resources.mastery ?? {};

  const previousMax = Math.max(0, Number(
    currentResource.max ??
    legacyResource.max ??
    0
  ));

  const previousValue = Math.max(0, Number(
    currentResource.value ??
    legacyResource.value ??
    previousMax
  ));

  /*
   * Se o máximo aumentar, preserva a quantidade já
   * gasta em vez de simplesmente encher o recurso.
   */
  const previouslySpent = previousMax > 0
    ? Math.max(
        0,
        previousMax - previousValue
      )
    : 0;

  const value = enabled
    ? Math.max(
        0,
        Math.min(
          max,
          previousMax > 0
            ? max - previouslySpent
            : max
        )
      )
    : 0;

  system.resources.mastery = {
    ...currentResource,

    enabled,
    value,
    max,

    label: "DDA.Resource.Mastery",

    formula:
      "DDA.Resource.MasteryFormula",

    bitContribution: bit,
    conjurerRanks,
    summonerRanks
  };

  system.resources.creationLimit = {
    ...legacyResource,
    enabled: false,
    legacy: true
  };

  system.qualityFeatures.omnievoker = {
    enabled: hasQuality([
      "evocador",
      "evoker",
      "omnievoker"
    ]),

    canConjureAndSummonTogether: true,
    sharedActionSpend: true
  };
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
  system.evolution.defaultFormUuid = String(system.evolution.defaultFormUuid ?? "");
  system.evolution.defaultFormName = String(system.evolution.defaultFormName ?? "");
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

  if (!Array.isArray(system.evolution.unlockedForms)) {
    system.evolution.unlockedForms = [];
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

  const activeNegativeEffects = getActiveNegativeDigimonEffects(system);
  const isSufferingNegativeEffect = activeNegativeEffects.length > 0;

  const adaptiveArmorState = system.combat?.adaptiveArmor ?? {};
  const activeCombatId = String(game.combat?.id ?? "");
  const activeCombatRound = Number(game.combat?.round ?? 0);

  const adaptiveArmorStateIsCurrent = Boolean(
    adaptiveArmorState.active &&
    activeCombatId &&
    String(adaptiveArmorState.combatId ?? "") === activeCombatId &&
    Number(adaptiveArmorState.round ?? 0) === activeCombatRound
  );

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

system.qualityFeatures.adaptiveArmor = {
  active: false,
  qualityId: "",
  qualityName: "",
  pointsPerRound: 0,
  dodge: 0,
  armor: 0,
  combatId: "",
  round: 0
};

system.qualityFeatures.digizoid = {
  consideredSizeStepsSmallerWhileMoving: 0,
  canMoveThroughLargerDigimon: false,
  cannotEndMovementInOccupiedSpace: true,
  disarmImmune: false,
  disarmMustChooseWeaponOrOffhand: false,
  lightExtraActionAllowedActions: []
};

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

  mainStatBonuses: {
    accuracy: 0,
    damage: 0,
    dodge: 0,
    armor: 0,
    health: 0
  },

  incompleteRanks: [],

  damageReduction: {
    burn: 0,
    freeze: 0,
    poison: 0,
    crash: 0
  },

  sources: []
};

system.qualityFeatures.naturalWeakness = {
  elements: [],
  elementLabels: [],
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

system.qualityFeatures.algorithm = {
  active: false,
  ranks: 0,
  weaponInstinctSharedCap: 0,
  ignoresWeaponInstinctIncompatibility: false
};

system.qualityFeatures.dataSpecialization = buildDataSpecializationFeature([]);
system.qualityFeatures.dataSpecialization.sourceName = "";
system.qualityFeatures.dataSpecialization.nativeOptimization = "";
system.qualityFeatures.dataSpecialization.hybridChoicesUsed = 0;
system.qualityFeatures.dataSpecialization.invalidChoices = [];

system.qualityFeatures.hybridDrive = {
  active: false,
  offPathChoicesAllowed: 0,
  offPathChoicesUsed: 0,
  remaining: 0
};

system.qualityFeatures.sprint = {
  active: false,
  usesPerCombat: 0,
  doublesMovementForAction: false,
  affectsChargeAndIntercede: false
};

system.qualityFeatures.elementMaster = {
  active: false,
  elements: [],
  freeManipulationCheckPerRound: 0,
  negatesElementalForce: true,
  dangerousTerrainDamage: 1
};

system.qualityFeatures.coreValidation = {
  valid: true,
  warnings: []
};

system.qualityFeatures.defensive = {
  absoluteEvasionRanks: 0,
  avoidanceRanks: 0,
  combatMonster: false,
  combatMonsterResolveMax: 0,
  bulletProof: false,
  substitute: false,
  brace: false,
  savagery: false,
  assuredDestruction: false,
  berserker: false,
  boilingBloodRanks: 0
};

system.qualityFeatures.stance = {
  fierceSoul: false,
  braveHeart: false,
  sentryAim: false,
  current: normalizeQualityChoiceKey(system.combat?.currentStance ?? "neutral"),
  activeDamageBonus: 0,
  activeArmorBonus: 0,
  activeMovementPenalty: 0,
  activeRangePenalty: 0
};

system.qualityFeatures.preservation = {
  secondWind: false,
  packMaster: false,
  vitalEnergyRanks: 0,
  tumbler: false,
  focusedResistance: false,
  immunity: false
};

system.qualityFeatures.utility = {
  systemBoostRanks: 0,
  combatAwareness: false,
  tacticalOrder: false,
  teleport: false,
  glamor: false,
  illusionaryOverlay: false,
  technician: false,
  firewall: false,
  trojan: false,
  domainControl: false,
  adaptiveElement: false,
  alteredElement: false,
  overdrive: false,
  dataScan: false,
  transporter: false,
  holyWard: false,
  darkEmblem: false,
  chaoticBalance: false
};

system.qualityFeatures.boss = {
  dataAbsorbActive: isDataAbsorbActive(this),
  disarmed: isActorBossDisarmed(this)
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

/*
 * Core Qualities are evaluated from canonical IDs before the generic Quality
 * loop.  This keeps localized/legacy item names from changing their rules and
 * gives every combat subsystem one stable feature object to consult.
 */
const algorithmRank = getAlgorithmRank(this);
const weaponItem = findCoreQuality(this, CORE_QUALITY_IDS.weapon);
const instinctItem = findCoreQuality(this, CORE_QUALITY_IDS.instinct);
const hasWeaponAndInstinct = Boolean(weaponItem && instinctItem);
const sharedWeaponInstinctCap = hasWeaponAndInstinct
  ? Math.min(
      getWeaponInstinctEffectiveMax(this, weaponItem),
      getWeaponInstinctEffectiveMax(this, instinctItem)
    )
  : 0;

system.qualityFeatures.algorithm = {
  active: algorithmRank > 0,
  ranks: algorithmRank,
  weaponInstinctSharedCap: sharedWeaponInstinctCap,
  ignoresWeaponInstinctIncompatibility: algorithmRank > 0
};

const dataSpecializationItem = findCoreQuality(this, CORE_QUALITY_IDS.dataSpecialization);
const dataSpecializationEntries = getDataSpecializationEntries(dataSpecializationItem);
const dataSpecialization = buildDataSpecializationFeature(dataSpecializationEntries);
const dataOptimizationKey = getDataOptimizationKey(this);
const nativeSpecializations = new Set(getNativeDataSpecializations(this));
const hybridDriveActive = hasCoreQuality(this, CORE_QUALITY_IDS.hybridDrive);
const hybridChoicesUsed = dataSpecializationEntries.filter((entry) => {
  return Boolean(entry.viaHybridDrive) || !nativeSpecializations.has(entry.key);
}).length;
const duplicateSpecializations = dataSpecializationEntries.filter((entry, index, entries) => {
  return entries.findIndex((candidate) => candidate.key === entry.key) !== index;
});
const invalidSpecializations = dataSpecializationEntries.filter((entry) => {
  const native = nativeSpecializations.has(entry.key);
  return !native && (!hybridDriveActive || hybridChoicesUsed > 1);
});

dataSpecialization.sourceName = dataSpecializationItem?.name ?? "";
dataSpecialization.nativeOptimization = dataOptimizationKey;
dataSpecialization.hybridChoicesUsed = hybridChoicesUsed;
dataSpecialization.invalidChoices = [
  ...duplicateSpecializations.map((entry) => ({ ...entry, reason: "duplicate" })),
  ...invalidSpecializations.map((entry) => ({ ...entry, reason: "hybridDrive" }))
];
system.qualityFeatures.dataSpecialization = dataSpecialization;
system.qualityFeatures.hybridDrive = {
  active: hybridDriveActive,
  offPathChoicesAllowed: hybridDriveActive ? 1 : 0,
  offPathChoicesUsed: hybridChoicesUsed,
  remaining: hybridDriveActive ? Math.max(0, 1 - hybridChoicesUsed) : 0
};

system.qualityFeatures.sprint = {
  active: hasCoreQuality(this, CORE_QUALITY_IDS.sprint),
  usesPerCombat: hasCoreQuality(this, CORE_QUALITY_IDS.sprint) ? 1 : 0,
  doublesMovementForAction: hasCoreQuality(this, CORE_QUALITY_IDS.sprint),
  affectsChargeAndIntercede: hasCoreQuality(this, CORE_QUALITY_IDS.sprint)
};

system.qualityFeatures.elementMaster = {
  active: hasCoreQuality(this, CORE_QUALITY_IDS.elementMaster),
  elements: [],
  freeManipulationCheckPerRound: hasCoreQuality(this, CORE_QUALITY_IDS.elementMaster) ? 1 : 0,
  negatesElementalForce: hasCoreQuality(this, CORE_QUALITY_IDS.elementMaster),
  dangerousTerrainDamage: hasCoreQuality(this, CORE_QUALITY_IDS.elementMaster) ? 1 : 2
};

if (dataSpecialization.healthBonus && mainStats.health) {
  addQualitySourceBonus(mainStats.health, {
    name: dataSpecialization.sourceName || "Data Specialization: Try Something",
    value: dataSpecialization.healthBonus,
    type: "dataSpecialization",
    choice: "trySomething"
  });
}

if (dataSpecialization.dodgeBonus && mainStats.dodge) {
  addQualitySourceBonus(mainStats.dodge, {
    name: dataSpecialization.sourceName || "Data Specialization: Uncatchable Target",
    value: dataSpecialization.dodgeBonus,
    type: "dataSpecialization",
    choice: "uncatchableTarget"
  });
}

if (dataSpecialization.allMainStatBonus) {
  for (const [statKey, stat] of Object.entries(mainStats)) {
    addQualitySourceBonus(stat, {
      name: dataSpecialization.sourceName || "Data Specialization: Supreme Code",
      value: dataSpecialization.allMainStatBonus,
      type: "dataSpecialization",
      choice: "supremeCode",
      stat: statKey
    });
  }
}

if (hasWeaponAndInstinct) {
  if (algorithmRank <= 0) {
    system.qualityFeatures.coreValidation.warnings.push(
      game.i18n?.lang?.startsWith("en")
        ? "Weapon and Instinct require Algorithm."
        : "Arma e Instinto juntos exigem Algoritmo."
    );
  } else {
    const weaponRank = Number(weaponItem.system?.rank?.value ?? 0);
    const instinctRank = Number(instinctItem.system?.rank?.value ?? 0);
    if (weaponRank > sharedWeaponInstinctCap || instinctRank > sharedWeaponInstinctCap) {
      system.qualityFeatures.coreValidation.warnings.push(
        game.i18n?.lang?.startsWith("en")
          ? `Algorithm currently supports at most ${sharedWeaponInstinctCap} Ranks in Weapon and Instinct.`
          : `Algoritmo atualmente sustenta no máximo ${sharedWeaponInstinctCap} Ranks em Arma e Instinto.`
      );
    }
  }
}

if (duplicateSpecializations.length) {
  system.qualityFeatures.coreValidation.warnings.push(
    game.i18n?.lang?.startsWith("en")
      ? "Data Specialization choices cannot be repeated."
      : "Escolhas de Especialização de Dados não podem ser repetidas."
  );
}

if (hybridChoicesUsed > (hybridDriveActive ? 1 : 0)) {
  system.qualityFeatures.coreValidation.warnings.push(
    game.i18n?.lang?.startsWith("en")
      ? "Hybrid Drive permits only one off-path Data Specialization."
      : "Impulso Híbrido permite somente uma Especialização de Dados fora da sua Otimização."
  );
}

const missingDataSpecializationGrants = getMissingDataSpecializationFreeGrants(this);
system.qualityFeatures.dataSpecialization.missingFreeGrants = missingDataSpecializationGrants;
if (missingDataSpecializationGrants.length) {
  const labels = missingDataSpecializationGrants
    .map((entry) => entry.label ?? entry.originalLabel ?? entry.key)
    .join(", ");
  system.qualityFeatures.coreValidation.warnings.push(
    game.i18n?.lang?.startsWith("en")
      ? `Data Specialization free grants still need to be applied: ${labels}.`
      : `Ainda é preciso aplicar as concessões gratuitas de Especialização de Dados: ${labels}.`
  );
}

system.qualityFeatures.coreValidation.valid = system.qualityFeatures.coreValidation.warnings.length === 0;

  for (const item of this.items) {
    if (item.type !== "quality") continue;

    const itemSystem = item.system ?? {};

    // Boss [DISARM] removes the benefits of Weapon and every Quality tied to
    // Weapon for the remainder of the current Combat. The Item itself remains
    // on the Actor; only its mechanical grants are ignored while disarmed.
    if (system.qualityFeatures.boss.disarmed && isWeaponBenefitQuality(item)) {
      continue;
    }
    if (isQualitySuppressedByBossState(this, item)) {
      continue;
    }

const grants = foundry.utils.deepClone(itemSystem.grants ?? {});

grants.mainStats ??= {};
grants.mainStatsPerRank ??= {};
grants.miscStats ??= {};
grants.derivedStats ??= {};
grants.automaticSuccesses ??= {};

/*
 * Compatibilidade com Qualities antigas/importadas.
 * Algumas Digizoid Armor/Weaponry ainda usam armorBonus, healthBonus,
 * movementPenalty, cpuBonus etc. O ator, porém, calcula os bônus pelos
 * caminhos canônicos abaixo.
 */
const legacyMainStatGrantMap = {
  accuracyBonus: "accuracy",
  damageBonus: "damage",
  dodgeBonus: "dodge",
  armorBonus: "armor",
  healthBonus: "health"
};

for (const [legacyKey, statKey] of Object.entries(legacyMainStatGrantMap)) {
  if (grants[legacyKey] === undefined) continue;

  const legacyValue = Number(grants[legacyKey] ?? 0);
  const canonicalValue = Number(grants.mainStats[statKey] ?? 0);

  if (legacyValue === 0) continue;
  if (canonicalValue !== 0) continue;

  grants.mainStats[statKey] = legacyValue;
}

const legacyMiscStatGrantMap = {
  movementBonus: "movement",
  movementPenalty: "movement",
  movementPenaltyPerRank: "movementPerRank",
  initiativeBonus: "initiative"
};

for (const [legacyKey, statKey] of Object.entries(legacyMiscStatGrantMap)) {
  if (grants[legacyKey] === undefined) continue;

  const legacyValue = Number(grants[legacyKey] ?? 0);
  const canonicalValue = Number(grants.miscStats[statKey] ?? 0);

  if (legacyValue === 0) continue;
  if (canonicalValue !== 0) continue;

  grants.miscStats[statKey] = legacyValue;
}

const legacyDerivedStatGrantMap = {
  bitBonus: "bit",
  dosBonus: "dos",
  ramBonus: "ram",
  cpuBonus: "cpu"
};

for (const [legacyKey, statKey] of Object.entries(legacyDerivedStatGrantMap)) {
  if (grants[legacyKey] === undefined) continue;

  const legacyValue = Number(grants[legacyKey] ?? 0);
  const canonicalValue = Number(grants.derivedStats[statKey] ?? 0);

  if (legacyValue === 0) continue;
  if (canonicalValue !== 0) continue;

  grants.derivedStats[statKey] = legacyValue;
}

if (
  grants.automaticDodgeSuccesses !== undefined &&
  grants.automaticSuccesses.dodge === undefined
) {
  const value = Number(grants.automaticDodgeSuccesses ?? 0);

  if (value !== 0) {
    grants.automaticSuccesses.dodge = value;
  }
}

const mainStatGrants = grants.mainStats ?? {};
const mainStatPerRankGrants = grants.mainStatsPerRank ?? {};
const derivedStatGrants = grants.derivedStats ?? {};
const derivedStatChoicePerRank = Number(grants.derivedStatChoicePerRank ?? 0);


const rankValue = getQualityRankValue(itemSystem);
const sourceId = getQualitySourceId(item);
const normalizedSourceId = normalizeQualityChoiceKey(
  sourceId || itemSystem.originalName || item.name
);
const choiceKeys = getQualityChoiceKeys(itemSystem);

if (["armaduradedigizoideflexivel", "flexibledigizoidarmor"].includes(normalizedSourceId)) {
  system.qualityFeatures.digizoid.consideredSizeStepsSmallerWhileMoving = -1;
  system.qualityFeatures.digizoid.canMoveThroughLargerDigimon = true;
}
if (["armamentodedigizoideadaptavel", "adaptivedigizoidweaponry"].includes(normalizedSourceId)) {
  system.qualityFeatures.digizoid.disarmImmune = true;
}
if (["armamentodedigizoidepuro", "puredigizoidweaponry"].includes(normalizedSourceId)) {
  system.qualityFeatures.digizoid.disarmMustChooseWeaponOrOffhand = true;
}
if (["armamentodedigizoideleve", "lightdigizoidweaponry"].includes(normalizedSourceId)) {
  system.qualityFeatures.digizoid.lightExtraActionAllowedActions = ["bolster", "move", "difficultMove"];
}

const defensiveFeature = system.qualityFeatures.defensive;
if (["evasaoabsoluta", "absoluteevasion"].includes(normalizedSourceId)) {
  defensiveFeature.absoluteEvasionRanks = Math.max(defensiveFeature.absoluteEvasionRanks, rankValue);
}
if (["esquiva", "avoidance"].includes(normalizedSourceId)) {
  defensiveFeature.avoidanceRanks = Math.max(defensiveFeature.avoidanceRanks, rankValue);
}
if (["monstrodecombate", "combatmonster"].includes(normalizedSourceId)) {
  defensiveFeature.combatMonster = true;
}
if (["aprovadebalas", "bulletproof"].includes(normalizedSourceId)) {
  defensiveFeature.bulletProof = true;
}
if (["substituir", "substituto", "substitute"].includes(normalizedSourceId)) {
  defensiveFeature.substitute = true;
}
if (["preparar", "brace"].includes(normalizedSourceId)) {
  defensiveFeature.brace = true;
}
if (["selvageria", "savagery"].includes(normalizedSourceId)) {
  defensiveFeature.savagery = true;
}
if (["destruicaogarantida", "assureddestruction"].includes(normalizedSourceId)) {
  defensiveFeature.assuredDestruction = true;
}
if (normalizedSourceId === "berserker") {
  defensiveFeature.berserker = true;
}
if (["sanguefervente", "boilingblood"].includes(normalizedSourceId)) {
  defensiveFeature.boilingBloodRanks = Math.max(defensiveFeature.boilingBloodRanks, rankValue);
}

const stanceFeature = system.qualityFeatures.stance;
if (["almaferoz", "fiercesoul"].includes(normalizedSourceId)) stanceFeature.fierceSoul = true;
if (["coracaocorajoso", "braveheart"].includes(normalizedSourceId)) stanceFeature.braveHeart = true;
if (["mirasentinela", "sentryaim"].includes(normalizedSourceId)) stanceFeature.sentryAim = true;

const preservationFeature = system.qualityFeatures.preservation;
if (["segundofolego", "secondwind"].includes(normalizedSourceId)) preservationFeature.secondWind = true;
if (["mestredamatilha", "packmaster"].includes(normalizedSourceId)) preservationFeature.packMaster = true;
if (["energiavital", "vitalenergy"].includes(normalizedSourceId)) preservationFeature.vitalEnergyRanks = Math.max(preservationFeature.vitalEnergyRanks, rankValue);
if (["acrobata", "tumbler"].includes(normalizedSourceId)) preservationFeature.tumbler = true;
if (["resistenciafocada", "focusedresistance"].includes(normalizedSourceId)) preservationFeature.focusedResistance = true;
if (["imunidade", "immunity"].includes(normalizedSourceId)) preservationFeature.immunity = true;

const utilityFeature = system.qualityFeatures.utility;
if (["impulsodesistema", "systemboost"].includes(normalizedSourceId)) utilityFeature.systemBoostRanks = Math.max(utilityFeature.systemBoostRanks, rankValue);
if (["conscienciadecombate", "combatawareness"].includes(normalizedSourceId)) utilityFeature.combatAwareness = true;
if (["ordemtatica", "tacticalorder"].includes(normalizedSourceId)) utilityFeature.tacticalOrder = true;
if (["teleporte", "teleport"].includes(normalizedSourceId)) utilityFeature.teleport = true;
if (["glamour", "glamor"].includes(normalizedSourceId)) utilityFeature.glamor = true;
if (["sobreposicaoilusoria", "illusionaryoverlay"].includes(normalizedSourceId)) utilityFeature.illusionaryOverlay = true;
if (["tecnico", "technician"].includes(normalizedSourceId)) utilityFeature.technician = true;
if (normalizedSourceId === "firewall") utilityFeature.firewall = true;
if (normalizedSourceId === "trojan") utilityFeature.trojan = true;
if (["controlededominio", "domaincontrol"].includes(normalizedSourceId)) utilityFeature.domainControl = true;
if (["elementoadaptavel", "adaptiveelement"].includes(normalizedSourceId)) utilityFeature.adaptiveElement = true;
if (["elementoalterado", "alteredelement"].includes(normalizedSourceId)) utilityFeature.alteredElement = true;
if (normalizedSourceId === "overdrive") utilityFeature.overdrive = true;
if (["varreduradedados", "datascan"].includes(normalizedSourceId)) utilityFeature.dataScan = true;
if (["transportador", "transporter"].includes(normalizedSourceId)) utilityFeature.transporter = true;
if (["protecaosagrada", "holyward"].includes(normalizedSourceId)) utilityFeature.holyWard = true;
if (["emblemasombrio", "darkemblem"].includes(normalizedSourceId)) utilityFeature.darkEmblem = true;
if (["equilibriocaotico", "chaoticbalance"].includes(normalizedSourceId)) utilityFeature.chaoticBalance = true;

if (isInnateTalentQuality(item)) {
  const allStatsPenalty = Number(
    grants.allStatsPenalty ?? 0
  );

  if (allStatsPenalty !== 0) {
    for (
      const [statKey, stat] of
      Object.entries(mainStats)
    ) {
      addQualitySourceBonus(stat, {
        name: item.name,
        value: allStatsPenalty,
        type: "innateTalent",
        stat: statKey
      });
    }
  }

  if (
    grants.prodigiousSkillForChosenSkills
  ) {
    const selectedChoices =
      getQualitySelectedChoices(itemSystem);

    const chosenSkills =
      selectedChoices.flatMap((choice) => {
        return Array.isArray(choice.skills)
          ? choice.skills
          : [];
      });

    const seenSkillKeys = new Set();

    for (const skill of chosenSkills) {
      const skillKey = String(
        skill?.key ??
        skill?.id ??
        ""
      ).trim();

      if (
        !skillKey ||
        seenSkillKeys.has(skillKey)
      ) {
        continue;
      }

      seenSkillKeys.add(skillKey);

      addDigimonSkillBonus(
        system,
        skillKey,
        {
          name: item.name,

          label: String(
            skill.label ??
            skill.originalLabel ??
            skillKey
          ),

          derivedStat: String(
            skill.derivedStat ?? ""
          ),

          value: 3
        }
      );
    }
  }
}

if (isNaturalWeaknessQuality(item)) {
  const naturalWeakness =
    system.qualityFeatures.naturalWeakness;

  const selectedChoices =
    getQualitySelectedChoices(itemSystem);

  for (const choice of selectedChoices) {
    const elements =
      Array.isArray(choice.elements)
        ? choice.elements
        : [];

    for (const element of elements) {
      const elementKey =
        normalizeQualityChoiceKey(
          element?.key ??
          element?.id ??
          element?.label ??
          ""
        );

      if (!elementKey) continue;

      const elementLabel = String(
        element?.label ??
        element?.originalLabel ??
        elementKey
      ).trim();

      if (
        !naturalWeakness.elements.includes(
          elementKey
        )
      ) {
        naturalWeakness.elements.push(
          elementKey
        );
      }

      if (
        elementLabel &&
        !naturalWeakness.elementLabels.includes(
          elementLabel
        )
      ) {
        naturalWeakness.elementLabels.push(
          elementLabel
        );
      }

      naturalWeakness.sources.push({
        name: item.name,
        element: elementKey,
        label: elementLabel,
        rank: Number(choice.rank ?? 1)
      });
    }
  }
}

const adaptiveArmorPoints =
  getAdaptiveArmorPointsPerRound(item);

const adaptiveStateMatchesQuality = (
  !adaptiveArmorState.qualityId &&
  !adaptiveArmorState.sourceId
) || (
  String(adaptiveArmorState.qualityId ?? "") ===
  String(item.id ?? "")
) || (
  normalizeQualityChoiceKey(
    adaptiveArmorState.sourceId ?? ""
  ) === normalizeQualityChoiceKey(sourceId)
);

if (
  adaptiveArmorPoints > 0 &&
  adaptiveArmorStateIsCurrent &&
  adaptiveStateMatchesQuality
) {
  const adaptiveDodgeBonus = Math.max(
    0,
    Math.min(
      adaptiveArmorPoints,
      Math.floor(Number(adaptiveArmorState.dodge ?? 0))
    )
  );

  const adaptiveArmorBonus = Math.max(
    0,
    Math.min(
      adaptiveArmorPoints - adaptiveDodgeBonus,
      Math.floor(Number(adaptiveArmorState.armor ?? 0))
    )
  );

  if (adaptiveDodgeBonus > 0 && mainStats.dodge) {
    addQualitySourceBonus(mainStats.dodge, {
      name: item.name,
      value: adaptiveDodgeBonus,
      type: "roundAllocation",
      stat: "dodge",
      combatId: activeCombatId,
      round: activeCombatRound
    });
  }

  if (adaptiveArmorBonus > 0 && mainStats.armor) {
    addQualitySourceBonus(mainStats.armor, {
      name: item.name,
      value: adaptiveArmorBonus,
      type: "roundAllocation",
      stat: "armor",
      combatId: activeCombatId,
      round: activeCombatRound
    });
  }

  system.qualityFeatures.adaptiveArmor = {
    active: true,
    qualityId: item.id,
    qualityName: item.name,
    pointsPerRound: adaptiveArmorPoints,
    dodge: adaptiveDodgeBonus,
    armor: adaptiveArmorBonus,
    combatId: activeCombatId,
    round: activeCombatRound
  };
}

const conditionalArmorBonus = Number(
  grants.armorBonusWhileSufferingNegativeEffect ?? 0
);

if (
  conditionalArmorBonus !== 0 &&
  isSufferingNegativeEffect &&
  mainStats.armor
) {
  addQualitySourceBonus(mainStats.armor, {
    name: item.name,
    value: conditionalArmorBonus,
    type: "conditional",
    condition: "negativeEffect",
    activeEffects: activeNegativeEffects.map((effect) => {
      return String(
        effect.label ??
        effect.tag ??
        ""
      ).trim();
    }).filter(Boolean)
  });
}

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
  const numericValue = Number(value ?? 0);
  if (numericValue === 0) continue;

  const rawGrantKey = String(grantKey ?? "").trim();
  const perRankMatch = rawGrantKey.match(/^(accuracy|damage|dodge|armor|health|movement)PerRank$/);

  if (perRankMatch) {
    const statKey = perRankMatch[1];

    const awakenedInstinctLocked = ["instinto", "instinct"].includes(normalizedSourceId) &&
      Array.from(this.items ?? []).some((entry) => {
        if (entry.type !== "quality") return false;
        const key = normalizeQualityChoiceKey(getQualitySourceId(entry) || entry.system?.originalName || entry.name);
        return ["instintodesperto", "awakenedinstinct"].includes(key);
      }) && !Boolean(system.combat?.freeNegativeQualities?.belowHalfTriggered);
    if (awakenedInstinctLocked && ["dodge", "movement"].includes(statKey)) continue;

    // derivedStats é fallback/compatibilidade.
    // Se o bônus já existe no caminho canônico, não soma de novo.
    if (statKey === "movement") {
      const alreadyHasCanonicalMovementGrant =
        Number(grants.miscStats?.movementPerRank ?? 0) !== 0 ||
        Number(grants.miscStats?.movement ?? 0) !== 0;

      if (alreadyHasCanonicalMovementGrant) continue;

      if (miscStats.movement) {
        const totalValue = numericValue * rankValue;

        miscStats.movement.qualityBonus += totalValue;
        miscStats.movement.qualityBonusSources.push({
          name: item.name,
          value: totalValue,
          type: "perRank",
          rank: rankValue,
          perRank: numericValue
        });
      }

      continue;
    }

    const alreadyHasCanonicalMainStatGrant =
      Number(mainStatPerRankGrants?.[statKey] ?? 0) !== 0 ||
      Number(mainStatGrants?.[statKey] ?? 0) !== 0;

    if (alreadyHasCanonicalMainStatGrant) continue;

    if (mainStats[statKey]) {
      const totalValue = numericValue * rankValue;

      addQualitySourceBonus(mainStats[statKey], {
        name: item.name,
        value: totalValue,
        type: "perRank",
        rank: rankValue,
        perRank: numericValue
      });
    }

    continue;
  }

  const normalizedDerivedKey = rawGrantKey.toLowerCase();
  const allowedFlatDerivedStats = new Set(["bit", "dos", "ram", "cpu"]);

  if (!allowedFlatDerivedStats.has(normalizedDerivedKey)) continue;

  const derivedStats = system.derivedStats ?? {};
  const stat = derivedStats[normalizedDerivedKey];

  if (!stat) continue;

  stat.qualityBonus = Number(stat.qualityBonus ?? 0) + numericValue;
  stat.qualityBonusSources = Array.isArray(stat.qualityBonusSources)
    ? stat.qualityBonusSources
    : [];

  stat.qualityBonusSources.push({
    name: item.name,
    value: numericValue,
    type: "flat"
  });
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

    const rankNumber =
      Math.max(
        1,
        Number(
          choice.rank ??
          naturewalk.sources.length + 1
        )
      );

    const mainStatKey =
      getNaturewalkMainStatKey(
        choice
      );

    naturewalk.sources.push({
      name:
        item.name,

      rank:
        rankNumber,

      element:
        normalizedElementKey,

      label:
        elementLabel,

      terrain,

      mainStat:
        mainStatKey,

      mainStatLabel:
        String(
          choice.mainStatLabel ?? ""
        ).trim()
    });

    if (
      mainStatKey &&
      mainStats[mainStatKey] &&
      Number(naturewalk.mainStatBonuses[mainStatKey] ?? 0) < 2
    ) {
      addQualitySourceBonus(
        mainStats[mainStatKey],
        {
          name:
            item.name,

          value:
            1,

          type:
            "naturewalk",

          rank:
            rankNumber,

          element:
            normalizedElementKey,

          elementLabel
        }
      );

      naturewalk.mainStatBonuses[
        mainStatKey
      ] += 1;
    } else {
      naturewalk.incompleteRanks.push({
        itemId:
          item.id,

        itemName:
          item.name,

        rank:
          rankNumber,

        element:
          normalizedElementKey,

        elementLabel
      });
    }

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
  const match = String(statKey).match(/^(accuracy|damage|dodge|armor|health)(PerRank)?$/);
  if (!match) continue;

  const targetKey = match[1];
  const isPerRank = Boolean(match[2]);
  const grantValue = Number(value ?? 0);
  const totalValue = grantValue * (isPerRank ? rankValue : 1);

  if (totalValue === 0 || !mainStats[targetKey]) continue;

  mainStats[targetKey].automaticSuccesses =
    Number(mainStats[targetKey].automaticSuccesses ?? 0) + totalValue;

  mainStats[targetKey].automaticSuccessSources =
    Array.isArray(mainStats[targetKey].automaticSuccessSources)
      ? mainStats[targetKey].automaticSuccessSources
      : [];

  mainStats[targetKey].automaticSuccessSources.push({
    name: item.name,
    value: totalValue,
    type: isPerRank ? "perRank" : "flat",
    rank: isPerRank ? rankValue : undefined,
    perRank: isPerRank ? grantValue : undefined
  });
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

  const activeStanceFeature = system.qualityFeatures.stance;
  const activeStance = normalizeQualityChoiceKey(system.combat?.currentStance ?? "neutral");
  const activeSv = Math.max(0, Number(system.stageValue ?? 0));
  activeStanceFeature.current = activeStance;

  if (activeStance === "fierce" && activeStanceFeature.fierceSoul) {
    activeStanceFeature.activeDamageBonus = activeSv;
    activeStanceFeature.activeMovementPenalty = activeSv;
    activeStanceFeature.activeRangePenalty = activeSv;
    addQualitySourceBonus(mainStats.damage, { name: game.i18n?.lang?.startsWith("en") ? "Fierce Stance" : "Postura Feroz", value: activeSv, type: "stance" });
    if (miscStats.movement) {
      miscStats.movement.qualityBonus -= activeSv;
      miscStats.movement.qualityBonusSources.push({ name: game.i18n?.lang?.startsWith("en") ? "Fierce Stance" : "Postura Feroz", value: -activeSv, type: "stance" });
    }
  }

  if (activeStance === "brave" && activeStanceFeature.braveHeart) {
    activeStanceFeature.activeArmorBonus = activeSv;
    activeStanceFeature.activeMovementPenalty = activeSv;
    addQualitySourceBonus(mainStats.armor, { name: game.i18n?.lang?.startsWith("en") ? "Brave Stance" : "Postura Corajosa", value: activeSv, type: "stance" });
    if (miscStats.movement) {
      miscStats.movement.qualityBonus -= activeSv;
      miscStats.movement.qualityBonusSources.push({ name: game.i18n?.lang?.startsWith("en") ? "Brave Stance" : "Postura Corajosa", value: -activeSv, type: "stance" });
    }
  }

  const defensiveFeature = system.qualityFeatures.defensive;
  defensiveFeature.combatMonsterResolveMax = defensiveFeature.combatMonster
    ? (defensiveFeature.berserker ? 6 : 4)
    : 0;

  system.resources ??= {};
  system.resources.resolve ??= {};
  system.resources.resolve.enabled = defensiveFeature.combatMonster;
  system.resources.resolve.max = defensiveFeature.combatMonsterResolveMax;
  system.resources.resolve.value = defensiveFeature.combatMonster
    ? Math.min(
        defensiveFeature.combatMonsterResolveMax,
        Math.max(0, Number(system.resources.resolve.value ?? 0))
      )
    : 0;

  if (system.qualityFeatures.elementMaster.active) {
    system.qualityFeatures.elementMaster.elements = [
      ...new Set(system.qualityFeatures.naturewalk.elements ?? [])
    ];
  }

  const missingAdvancedMobility = (system.qualityFeatures.advancedMobility.types ?? [])
    .filter((type) => !(system.qualityFeatures.extraMovement.types ?? []).includes(type));
  if (missingAdvancedMobility.length) {
    system.qualityFeatures.coreValidation.warnings.push(
      game.i18n?.lang?.startsWith("en")
        ? `Advanced Mobility requires matching Extra Movement: ${missingAdvancedMobility.join(", ")}.`
        : `Mobilidade Avançada exige o Movimento Extra correspondente: ${missingAdvancedMobility.join(", ")}.`
    );
  }

  system.qualityFeatures.coreValidation.valid =
    system.qualityFeatures.coreValidation.warnings.length === 0;

  for (const stat of Object.values(mainStats)) {
    const sources = Array.isArray(stat.sharedBonusSources)
      ? stat.sharedBonusSources
      : [];

stat.sharedBonusTooltip = sources.length
  ? sources.map((source) => {
      if (source.type === "perRank") {
        return `${source.name}: ${formatSignedQualityBonus(source.value)} (${formatSignedQualityBonus(source.perRank)}/Rank × ${source.rank})`;
      }

      if (source.type === "conditional" && source.condition === "negativeEffect") {
        const effectNames = Array.isArray(source.activeEffects)
          ? source.activeEffects.filter(Boolean).join(", ")
          : "";

        return effectNames
          ? `${source.name}: ${formatSignedQualityBonus(source.value)} — Efeito Negativo: ${effectNames}`
          : `${source.name}: ${formatSignedQualityBonus(source.value)} — Efeito Negativo`;
      }

      return `${source.name}: ${formatSignedQualityBonus(source.value)}`;
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
  const mainStats =
    system.mainStats ?? {};

  const miscStats =
    system.miscStats ?? {};

  const activeEffects = (
    Array.isArray(system.effects?.active)
      ? system.effects.active
      : []
  ).filter(isActiveDigimonEffect);

  /*
   * Todo efeito começa zerado a cada preparação.
   * Isso impede que os bônus se acumulem a cada
   * atualização da ficha.
   */
  for (const stat of Object.values(mainStats)) {
    stat.effectBonus = 0;
    stat.effectBonusSources = [];
  }

  if (miscStats.movement) {
    miscStats.movement.effectBonus = 0;
    miscStats.movement.effectBonusSources = [];
  }

  /*
   * Cada valor abaixo representa o modificador
   * causado por 1 ponto de Potência.
   */
  const effectModifiers = {
    /*
     * Efeitos positivos simples.
     */
    keen: {
      accuracy: 1
    },

    sharpen: {
      damage: 1
    },

    sturdy: {
      armor: 1
    },

    swift: {
      dodge: 1
    },

    tailwind: {
      movement: 1
    },

    /*
     * Efeitos positivos combinados.
     */
    nimble: {
      accuracy: 1,
      dodge: 1
    },

    daring: {
      accuracy: 1,
      armor: 1
    },

    fury: {
      accuracy: 1,
      damage: 1
    },

    steady: {
      damage: 1,
      dodge: 1
    },

    strength: {
      damage: 1,
      armor: 1
    },

    vigil: {
      dodge: 1,
      armor: 1
    },

    vigor: {
      dodge: 1,
      movement: 1
    },

    /*
     * Efeitos negativos simples.
     */
    vague: {
      accuracy: -1
    },

    dull: {
      damage: -1
    },

    frail: {
      armor: -1
    },

    slow: {
      dodge: -1
    },

    root: {
      movement: -1
    },

    /*
     * Blind continua com a implementação que
     * já existia no attack-roll: -Accuracy e
     * -Dodge.
     */
    blind: {
      accuracy: -1,
      dodge: -1
    },

    /*
     * Efeitos negativos combinados.
     */
    confuse: {},

    distract: {
      accuracy: -1,
      dodge: -1
    },

    exploit: {
      dodge: -1,
      armor: -1
    },

    pacify: {
      accuracy: -1,
      damage: -1
    },

    paralyze: {
      dodge: -1
    },

    rattled: {
      damage: -1,
      dodge: -1
    },

    shaken: {
      accuracy: -1,
      armor: -1
    },

    weak: {
      damage: -1,
      armor: -1
    },

    /*
     * Bastion e Debilitate usam magnitude
     * variável, mas o multiplicador é aplicado
     * apenas uma vez.
     */
    bastion: {
      accuracy: 1,
      damage: 1,
      dodge: 1,
      armor: 1
    },

    debilitate: {
      accuracy: -1,
      damage: -1,
      dodge: -1,
      armor: -1
    }
  };

  const strongestNegativeByStat = new Map();

  for (const effect of activeEffects) {
    const tag =
      normalizeDigimonEffectTag(
        effect.tag
      );

    if (!tag) continue;

    /* Metadados de interface para o painel de Efeitos da ficha. */
    effect.canResist =
      ["fear", "doom", "taunt"].includes(tag) &&
      !effect.disableEffectResistance &&
      !effect.cannotUseResistanceCheck;
    const displayedMagnitude = Number(effect.value ?? effect.potency ?? 0);
    effect.hasDisplayMagnitude = Number.isFinite(displayedMagnitude) && displayedMagnitude > 0;
    effect.displayMagnitude = effect.hasDisplayMagnitude ? displayedMagnitude : 0;
    effect.displayMagnitudeLabel = ["fear", "doom", "taunt"].includes(tag)
      ? "DDA.EffectQualities.Value"
      : "DDA.EffectQualities.Potency";

    /*
     * Advanced Mobility: Climb concede
     * imunidade a Root.
     */
    if (
      tag === "root" &&
      system.qualityFeatures
        ?.advancedMobility
        ?.climb
        ?.rootImmunity
    ) {
      continue;
    }

    let modifiers =
      effectModifiers[tag];

    if (tag === "heavy" && effect.heavyDigizoidWeaponry) {
      modifiers = { movement: -1 };
    }

    if (tag === "confuse" && effect.affectedStat) {
      modifiers = { [String(effect.affectedStat)]: -1 };
    }

    if (tag === "dot") {
      modifiers = {
        dodge: Math.max(0, Number(system.derivedStats?.ram?.value ?? 0))
      };
    }

    /*
     * Alguns efeitos não alteram diretamente
     * os atributos da ficha. Burn, Poison,
     * Fear, Taunt etc. são resolvidos por seus
     * próprios fluxos.
     */
    if (!modifiers || !Object.keys(modifiers).length) continue;

    const hasStoredPotency =
      effect.potency !== undefined &&
      effect.potency !== null &&
      effect.potency !== "";

    const hasStoredValue =
      effect.value !== undefined &&
      effect.value !== null &&
      effect.value !== "";

    const rawPotency =
      Number(effect.potency);

    const potency = hasStoredPotency &&
      Number.isFinite(rawPotency)
        ? Math.max(0, rawPotency)
        : 0;

    let potencyMultiplier = 1;

    /*
     * Efeitos criados pelo attack-roll novo
     * informam explicitamente quando sua
     * Potência deve multiplicar o modificador.
     */
    if (effect.usePotencyValue === true && tag !== "dot") {
      potencyMultiplier = potency;
    }

    /*
     * Compatibilidade com Bastion e Debilitate.
     *
     * Versões novas podem salvar a magnitude em
     * value. Versões antigas salvavam em potency
     * sem possuir usePotencyValue.
     */
    if (
      tag === "bastion" ||
      tag === "debilitate"
    ) {
      const rawMagnitude = hasStoredValue
        ? Number(effect.value)
        : hasStoredPotency
          ? Number(effect.potency)
          : 1;

      potencyMultiplier =
        Number.isFinite(rawMagnitude)
          ? Math.max(0, rawMagnitude)
          : 1;
    }

    for (
      const [statKey, modifierPerPotency] of
      Object.entries(modifiers)
    ) {
      const numericValue =
        Number(modifierPerPotency ?? 0) *
        potencyMultiplier;

      if (numericValue === 0) continue;

      const sourceData = {
        name: effect.label ?? effect.tag ?? tag,
        value: numericValue,
        tag,
        potency: potencyMultiplier
      };

      /* Penalidades não somam: por atributo vale somente a maior Potência. */
      if (numericValue < 0) {
        const previous = strongestNegativeByStat.get(statKey);
        if (!previous || numericValue < previous.value) {
          strongestNegativeByStat.set(statKey, sourceData);
        }
        continue;
      }

      if (statKey === "movement") {
        if (!miscStats.movement) continue;

        miscStats.movement.effectBonus +=
          numericValue;

        miscStats.movement.effectBonusSources.push(sourceData);

        continue;
      }

      if (!mainStats[statKey]) continue;

      mainStats[statKey].effectBonus +=
        numericValue;

      mainStats[statKey].effectBonusSources.push(sourceData);
    }
  }

  for (const [statKey, source] of strongestNegativeByStat) {
    if (statKey === "movement") {
      if (!miscStats.movement) continue;
      miscStats.movement.effectBonus += source.value;
      miscStats.movement.effectBonusSources.push(source);
      continue;
    }

    if (!mainStats[statKey]) continue;
    mainStats[statKey].effectBonus += source.value;
    mainStats[statKey].effectBonusSources.push(source);
  }
}


_prepareDigimonStage(system) {
  const stage = system.stage ?? "child";
  const stageData = CONFIG.DDA?.stages?.[stage] ?? CONFIG.DDA?.stages?.child;

  const stageValue = Number(stageData?.stageValue ?? 2);
  const stageBaseDp = Number(
    stageData?.baseDp ??
    stageData?.startingDp ??
    10
  );

  /*
   * NPCs adversários podem usar um PD Base próprio para representar
   * o rank individual de um antagonista.
   *
   * null ou vazio significa: usar o valor normal do estágio.
   */
  const enemyBaseDpOverrideRaw = this.type === "npc"
    ? system.enemy?.baseDpOverride
    : undefined;

  const enemyBaseDpOverride = Number(enemyBaseDpOverrideRaw);

  const hasEnemyBaseDpOverride = (
    enemyBaseDpOverrideRaw !== null &&
    enemyBaseDpOverrideRaw !== "" &&
    Number.isFinite(enemyBaseDpOverride) &&
    enemyBaseDpOverride >= 0
  );

  const baseDp = hasEnemyBaseDpOverride
    ? Math.floor(enemyBaseDpOverride)
    : stageBaseDp;

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
  const mainStats =
    system.mainStats ?? {};

  const mainStatLabelKeys = {
    accuracy:
      "DDA.MainStat.Accuracy",

    damage:
      "DDA.MainStat.Damage",

    dodge:
      "DDA.MainStat.Dodge",

    armor:
      "DDA.MainStat.Armor",

    health:
      "DDA.MainStat.Health"
  };

  for (
    const [statKey, stat] of
    Object.entries(mainStats)
  ) {
    const storedBase =
      Number(
        stat.base ?? 0
      );

    /*
     * A Base também precisa ser normalizada.
     * Os Atributos Derivados usam a Base para
     * calcular BIT, DOS, RAM e CPU.
     */
    const base =
      Math.min(
        DDA_DIGIMON_MAIN_STAT_MAX,

        Math.max(
          DDA_DIGIMON_MAIN_STAT_MIN,
          storedBase
        )
      );

    const bonus =
      Number(
        stat.bonus ?? 0
      );

    const sharedBonus =
      Number(
        stat.sharedBonus ?? 0
      );

    const effectBonus =
      Number(
        stat.effectBonus ?? 0
      );

    const uncappedTotal =
      base +
      bonus +
      sharedBonus +
      effectBonus;

    const total =
      Math.min(
        DDA_DIGIMON_MAIN_STAT_MAX,

        Math.max(
          DDA_DIGIMON_MAIN_STAT_MIN,
          uncappedTotal
        )
      );

    const labelKey =
      mainStatLabelKeys[statKey] ??
      stat.label ??
      statKey;

    stat.displayLabel =
      getLocalizedLabel(
        labelKey
      );

    /*
     * Mantém informações úteis para interface,
     * tooltips e futura auditoria.
     */
    stat.storedBase =
      storedBase;

    stat.base =
      base;

    stat.uncappedTotal =
      uncappedTotal;

    stat.minimum =
      DDA_DIGIMON_MAIN_STAT_MIN;

    stat.maximum =
      DDA_DIGIMON_MAIN_STAT_MAX;

    stat.cappedAtMaximum =
      uncappedTotal >
      DDA_DIGIMON_MAIN_STAT_MAX;

    stat.clampedAtMinimum =
      uncappedTotal <
      DDA_DIGIMON_MAIN_STAT_MIN;

    stat.total =
      total;
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

      const qualityBonusSources = Array.isArray(stat.qualityBonusSources)
        ? stat.qualityBonusSources
        : [];

      const qualitySourcesSummary = qualityBonusSources
        .filter((source) => Number(source?.value ?? 0) !== 0)
        .map((source) => {
          const sourceName = String(source?.name ?? "").trim();
          const sourceValue = formatSignedNumber(source?.value ?? 0);

          return sourceName
            ? `${sourceName} ${sourceValue}`
            : sourceValue;
        })
        .join(" • ");

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
        qualityBonus,
        qualitySourcesSummary,
        totalLabel: localizeActorKey("DDA.Label.Total"),
        total
      };

      const tooltipLines = [
        `${stat.breakdown.baseLabel}: ${baseValue}`,
        `${localizeActorKey("DDA.Label.Size")} (${sizeLabel}): ${formatSignedNumber(sizeBonus)}`
      ];

      if (qualityBonus !== 0) {
        tooltipLines.push(
          qualitySourcesSummary
            ? `${localizeActorKey("DDA.TooltipQualityBonus")}: ${qualitySourcesSummary}`
            : `${localizeActorKey("DDA.TooltipQualityBonus")}: ${formatSignedNumber(qualityBonus)}`
        );
      }

      tooltipLines.push(`${stat.breakdown.totalLabel}: ${total}`);

      stat.tooltip = tooltipLines.join("\n");    }

    const bossBugActive = (Array.isArray(system.effects?.active) ? system.effects.active : [])
      .some((effect) => normalizeDigimonEffectTag(effect?.tag) === "bug");
    if (bossBugActive) {
      const swapNumericDerivedData = (leftKey, rightKey) => {
        const left = derivedStats[leftKey];
        const right = derivedStats[rightKey];
        if (!left || !right) return;
        const numericKeys = ["base", "sizeBonus", "qualityBonus", "value", "total"];
        const leftSnapshot = Object.fromEntries(numericKeys.map((key) => [key, left[key]]));
        const rightSnapshot = Object.fromEntries(numericKeys.map((key) => [key, right[key]]));
        for (const key of numericKeys) {
          left[key] = rightSnapshot[key];
          right[key] = leftSnapshot[key];
        }
        left.bossBugSwappedFrom = rightKey;
        right.bossBugSwappedFrom = leftKey;
        if (left.breakdown) left.breakdown.total = left.total;
        if (right.breakdown) right.breakdown.total = right.total;
      };
      swapNumericDerivedData("cpu", "dos");
      swapNumericDerivedData("bit", "ram");
    }
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

  const calculatedMovementTotal = Math.max(
    0,
    movementBase +
    movementBonus +
    movementQualityBonus +
    movementSizeBonus +
    movementEffectBonus
  );

  const dataAbsorbMovementLock = Boolean(
    system.qualityFeatures?.boss?.dataAbsorbActive
  );

  const movementTotal = dataAbsorbMovementLock
    ? 0
    : calculatedMovementTotal;

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

  if (dataAbsorbMovementLock) {
    tooltipLines.push(
      game.i18n?.lang?.startsWith("en")
        ? `Data Absorb: ${calculatedMovementTotal} → 0`
        : `Absorção de Dados: ${calculatedMovementTotal} → 0`
    );
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
  const hasLowVitality = Array.from(this.items ?? []).some((entry) => {
    if (entry.type !== "quality") return false;
    const key = normalizeQualityChoiceKey(getQualitySourceId(entry) || entry.system?.originalName || entry.name);
    return ["baixavitalidade", "lowvitality"].includes(key);
  });
  const naturalWoundsMax = Math.max(1, stageValue + healthTotal * 2);
  const woundsMax = hasLowVitality ? Math.max(1, Math.ceil(naturalWoundsMax / 2)) : naturalWoundsMax;

  const woundsValueRaw = Number(miscStats.wounds.value ?? woundsMax);
  const woundsTempValueRaw = Number(miscStats.wounds.temp?.value ?? 0);

  const woundsValue = Number.isFinite(woundsValueRaw) ? woundsValueRaw : woundsMax;
  const woundsTempValue = Number.isFinite(woundsTempValueRaw) ? woundsTempValueRaw : 0;

  miscStats.wounds.max = woundsMax;
  miscStats.wounds.value = Math.clamp(woundsValue, 0, woundsMax);

  if (miscStats.wounds.temp) {
    miscStats.wounds.temp.value = hasLowVitality ? 0 : Math.max(0, woundsTempValue);
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
      const stanceRangePenalty = Math.max(0, Number(system.qualityFeatures?.stance?.activeRangePenalty ?? 0));
      miscStats.range.base = 3 + bit;
      miscStats.range.stancePenalty = stanceRangePenalty;
      miscStats.range.value = Math.max(0, miscStats.range.base - stanceRangePenalty);
      miscStats.range.total = miscStats.range.value;
    }

    if (miscStats.effectiveLimit) {
      miscStats.effectiveLimit.value = Number(miscStats.range?.value ?? 3) + stageValue;
      miscStats.effectiveLimit.total = miscStats.effectiveLimit.value;
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
      const vulnerableRanks = Array.from(this.items ?? []).reduce((total, entry) => {
        if (entry.type !== "quality") return total;
        const key = normalizeQualityChoiceKey(getQualitySourceId(entry) || entry.system?.originalName || entry.name);
        return ["vulneravel", "vulnerable"].includes(key)
          ? total + Math.max(0, getQualityRankValue(entry.system ?? {}))
          : total;
      }, 0);
      miscStats.resistance.value = Math.max(0, Math.floor(dos / 2) - vulnerableRanks);
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
      disabledByHeavy: false,
      disabledReason: ""
    };
  }

  for (const item of this.items) {
    if (item.type !== "quality") continue;
    if (isQualitySuppressedByBossState(this, item)) continue;

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

  const activeHeavyEffects = (Array.isArray(system.effects?.active) ? system.effects.active : [])
    .filter((effect) => isActiveDigimonEffect(effect) && normalizeDigimonEffectTag(effect.tag) === "heavy");
  const hasHeavyEffect = activeHeavyEffects.length > 0;
  const hasDigizoidHeavyEffect = activeHeavyEffects.some((effect) => effect.heavyDigizoidWeaponry === true);

/*
 * Heavy remove somente opções adicionais.
 * Land permanece disponível.
 */
  system.qualityFeatures.heavy = {
    active: false,
    transporterSuppressed: false,
    teleportSuppressed: false,
    advancedMobilitySuppressed: false,
    extraMovementSuppressed: false,
    digizoidWeaponry: false
  };

if (hasHeavyEffect) {
  const hasTransporter = this.items.some((quality) => {
    if (quality.type !== "quality") return false;
    const sourceId = normalizeQualityName(getQualitySourceId(quality));
    const name = normalizeQualityName(quality.name);
    return sourceId === "transporter" || sourceId === "transportador" ||
      name === "transporter" || name === "transportador";
  });

  system.qualityFeatures.heavy = {
    active: true,
    transporterSuppressed: Boolean(hasTransporter && movementTypes.teleport?.enabled),
    teleportSuppressed: Boolean(!hasTransporter && movementTypes.teleport?.enabled),
    advancedMobilitySuppressed: advancedMovementTypes.size > 0,
    extraMovementSuppressed: (hasDigizoidHeavyEffect || advancedMovementTypes.size === 0) && extraMovementTypes.size > 0,
    digizoidWeaponry: hasDigizoidHeavyEffect
  };

  if (movementTypes.teleport?.enabled) {
    if (hasTransporter) {
      movementTypes.teleport.transporterDisabledByHeavy = true;
      movementTypes.teleport.disabledReason =
        "[HEAVY] suppresses Transporter before suppressing Teleport.";
      if (hasDigizoidHeavyEffect) {
        movementTypes.teleport.enabled = false;
        movementTypes.teleport.total = 0;
        movementTypes.teleport.disabledByDigizoidHeavy = true;
      }
    } else {
      movementTypes.teleport.enabled = false;
      movementTypes.teleport.total = 0;
      movementTypes.teleport.disabledByHeavy = true;
      movementTypes.teleport.disabledReason =
        "[HEAVY] suppresses Teleport when Transporter is unavailable.";
    }
  }

  if (advancedMovementTypes.size > 0) {
    for (const movementType of advancedMovementTypes) {
      if (!movementTypes[movementType]) continue;
      movementTypes[movementType].advanced = false;
      movementTypes[movementType].advancedDisabledByHeavy = true;
      movementTypes[movementType].disabledReason =
        "[HEAVY] suppresses Advanced Mobility before suppressing Extra Movement.";
      if (hasDigizoidHeavyEffect) {
        movementTypes[movementType].enabled = false;
        movementTypes[movementType].total = 0;
        movementTypes[movementType].disabledByDigizoidHeavy = true;
      }
    }
  } else {
    for (
      const [movementType, movementData] of
      Object.entries(movementTypes)
    ) {
      if (movementType === "land") continue;
      if (!movementData?.isExtraMovement) continue;

      movementData.enabled = false;
      movementData.total = 0;
      movementData.disabledByHeavy = true;
      movementData.disabledReason =
        "[HEAVY] removes additional Movement options.";
    }
  }
}

  /* Extra Movement: Swimmer uses full Movement and may Hold Breath indefinitely. */
  if (movementTypes.swim?.isExtraMovement) {
    movementTypes.swim.indefiniteBreath = true;
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

  if (movementTypes.jump && advancedMovementTypes.has("jump") && !hasHeavyEffect) {
    movementTypes.jump.advanced = true;
    movementTypes.jump.canCurveTrajectory = true;
    movementTypes.jump.canUseToEnterAndExitDifficultTerrain = true;
  }

  if (movementTypes.swim && advancedMovementTypes.has("swim") && !hasHeavyEffect) {
    movementTypes.swim.advanced = true;
    movementTypes.swim.canBreatheUnderwater = true;
    movementTypes.swim.indefiniteBreath = true;
  }

  if (movementTypes.dig && advancedMovementTypes.has("dig") && !hasHeavyEffect) {
    movementTypes.dig.advanced = true;
    movementTypes.dig.canDigHardMaterials = true;
    movementTypes.dig.leavesTunnel = true;
  }

  if (movementTypes.climb && advancedMovementTypes.has("climb") && !hasHeavyEffect) {
    movementTypes.climb.advanced = true;
    movementTypes.climb.canMoveOnCeilings = true;
    movementTypes.climb.rootImmunity = true;
  }
}

_prepareDigimonDp(system) {
  const creation = system.creation ??= {};
  const dp = creation.dp ?? {};

  const baseDp = Math.max(
    0,
    Number(dp.base ?? creation.baseDp ?? 0)
  );

  const globalBonusDp = Math.max(
    0,
    Number(system.advancement?.bonusDp?.total ?? 0),
    Number(dp.bonus ?? 0),
    Number(creation.bonusDp ?? 0)
  );

  const stageKey = String(system.stage ?? "child");
  const stageBonusDp = Number(
    system.advancement?.bonusDp?.byStage?.[stageKey]?.total
  );
  const bonusDp = stageKey === "baby1"
    ? 0
    : Number.isFinite(stageBonusDp)
      ? Math.max(0, stageBonusDp)
      : globalBonusDp;

  const stageValue = Math.max(
    1,
    Number(system.stageValue ?? 1)
  );

  let spentQualityDp = 0;
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

    let itemGrantedDp = Number(
      itemSystem.grants?.dp?.total ?? 0
    );

    if (itemSystem.grants?.dp) {
      const grantsDpEnabled = Boolean(
        itemSystem.grants.dp.enabled
      );

      const grantsDpValue = Math.max(
        0,
        Number(itemSystem.grants.dp.value ?? 0)
      );

      const grantsDpTotal = grantsDpEnabled
        ? grantsDpValue
        : 0;

      itemSystem.grants.dp.total = grantsDpTotal;
      itemGrantedDp = grantsDpTotal;
    }

    if ((isNegativeQuality || legacyGrantsDp) && itemGrantedDp === 0) {
      const printedNegativeDp = Math.abs(Number(itemSystem.cost?.dp ?? 0));
      const negativeRank = Math.max(1, Number(itemSystem.rank?.value ?? 1));
      itemGrantedDp = itemSystem.cost?.perRank
        ? printedNegativeDp * negativeRank
        : printedNegativeDp;
    }

    if (isNegativeQuality || legacyGrantsDp) {
      const grantedByNegativeQuality = Math.max(
        0,
        itemGrantedDp
      );

      grantedDp += grantedByNegativeQuality;
      negativeQualityDp += grantedByNegativeQuality;
      continue;
    }

    const positiveCost = Math.max(0, itemCost);

    let coreDiscountApplied = 0;

    if (
      coreDiscountAvailable &&
      positiveCost > 0 &&
      coreDiscountRemaining > 0
    ) {
      coreDiscountApplied = Math.min(
        positiveCost,
        coreDiscountRemaining
      );

      coreDiscountRemaining -= coreDiscountApplied;
      coreDiscountUsed += coreDiscountApplied;
    }

    spentQualityDp += Math.max(
      0,
      positiveCost - coreDiscountApplied
    );
  }

  /*
   * Atributos não existem como Items. O gasto deles é a diferença entre
   * o valor-base atual da forma e o valor-base natural do Estágio.
   */
  const spentStatDp = Object.values(system.mainStats ?? {})
    .reduce((total, stat) => {
      const value = Number(stat?.base ?? stageValue);

      return total + Math.max(
        0,
        value - stageValue
      );
    }, 0);

  const sharedStatBonus = system.advancement?.sharedStatBonus ?? {};
  const sharedStatTotal = stageKey === "baby1"
    ? 0
    : ["accuracy", "damage", "dodge", "armor", "health"]
      .reduce((total, key) => {
        return total + Math.max(
          0,
          Math.floor(Number(sharedStatBonus?.[key] ?? 0))
        );
      }, 0);

  const sharedQualityAllocated = stageKey === "baby1"
    ? 0
    : Math.max(
        0,
        Math.floor(Number(
          system.advancement?.sharedQualityDp?.allocated ?? 0
        ))
      );

  const localSpentStatDp = Math.max(
    0,
    spentStatDp - sharedStatTotal
  );

  const explicitManualNegative = (
    dp.manualNegative ??
    creation.manualNegativeDp
  );

  const legacyNegative = Number(
    dp.negative ??
    creation.negativeDp ??
    0
  );

  /*
   * Versões antigas gravavam o valor de Qualidades Negativas em
   * `dp.negative`. Quando uma Qualidade negativa existir, não tratamos
   * esse campo legado como bônus manual para evitar soma duplicada.
   */
  const manualNegativeDp = Number.isFinite(
    Number(explicitManualNegative)
  )
    ? Math.max(0, Number(explicitManualNegative))
    : negativeQualityDp > 0
      ? 0
      : Math.max(0, legacyNegative);

  /*
   * DDA 7.02 caps the DP GAINED from Negative Qualities at SV. It does not
   * make a Quality illegal when its printed negative value is larger than the
   * remaining allowance. Keep the raw total for diagnostics, but only add the
   * capped amount to the creation pool.
   */
  const negativeLimitMax = Math.max(0, stageValue);
  const rawNegativeQualityDp = Math.max(0, negativeQualityDp);
  negativeQualityDp = Math.min(rawNegativeQualityDp, negativeLimitMax);
  grantedDp = Math.min(Math.max(0, grantedDp), negativeLimitMax);

  const totalNegativeDp = (
    manualNegativeDp +
    negativeQualityDp
  );

  const localDpPool = (
    baseDp +
    totalNegativeDp
  );

  const spentBonusStats = Math.min(
    bonusDp,
    sharedStatTotal
  );

  const qualityBudget = Math.min(
    Math.max(0, bonusDp - spentBonusStats),
    sharedQualityAllocated
  );

  const spentBonusQualities = Math.min(
    qualityBudget,
    spentQualityDp
  );

  const spentBaseStats = localSpentStatDp;
  const spentBaseQualities = Math.max(
    0,
    spentQualityDp - spentBonusQualities
  );

  const spentTotal = (
    spentBaseStats +
    spentBonusStats +
    spentBaseQualities +
    spentBonusQualities
  );

  const localRemaining = (
    localDpPool -
    spentBaseStats -
    spentBaseQualities
  );

  const qualityRemaining = Math.max(
    0,
    qualityBudget - spentBonusQualities
  );

  const bonusUnallocated = Math.max(
    0,
    bonusDp - spentBonusStats - qualityBudget
  );

  const remainingDp = Math.max(
    0,
    localRemaining + qualityRemaining + bonusUnallocated
  );

  const totalDp = (
    localDpPool +
    bonusDp
  );

  const negativeLimitRemaining = Math.max(
    0,
    negativeLimitMax - negativeQualityDp
  );

  const negativeLimitExceeded = false;
  const negativeDpWasCapped = rawNegativeQualityDp > negativeLimitMax;

  creation.dp ??= {};

  creation.dp.base = baseDp;
  creation.dp.bonus = bonusDp;

  creation.dp.manualNegative = manualNegativeDp;
  creation.dp.negative = manualNegativeDp;
  creation.dp.granted = grantedDp;
  creation.dp.negativeFromQualities =
    negativeQualityDp;
  creation.dp.negativeFromQualitiesRaw = rawNegativeQualityDp;
  creation.dp.negativeCapped = negativeDpWasCapped;
  creation.dp.totalNegative = totalNegativeDp;

  creation.dp.total = totalDp;

  creation.dp.spentBaseStats = spentBaseStats;
  creation.dp.spentBaseQualities =
    spentBaseQualities;
  creation.dp.spentBonusStats = spentBonusStats;
  creation.dp.spentBonusQualities =
    spentBonusQualities;

  creation.dp.sharedStatBonusApplied = stageKey === "baby1"
    ? { accuracy: 0, damage: 0, dodge: 0, armor: 0, health: 0 }
    : {
        accuracy: Math.max(0, Math.floor(Number(creation.dp.sharedStatBonusApplied?.accuracy ?? 0))),
        damage: Math.max(0, Math.floor(Number(creation.dp.sharedStatBonusApplied?.damage ?? 0))),
        dodge: Math.max(0, Math.floor(Number(creation.dp.sharedStatBonusApplied?.dodge ?? 0))),
        armor: Math.max(0, Math.floor(Number(creation.dp.sharedStatBonusApplied?.armor ?? 0))),
        health: Math.max(0, Math.floor(Number(creation.dp.sharedStatBonusApplied?.health ?? 0)))
      };
  creation.dp.sharedStatTotal = spentBonusStats;
  creation.dp.sharedQualityAllocated = qualityBudget;
  creation.dp.bonusUnallocated = bonusUnallocated;

  creation.dp.spentTotal = spentTotal;
  creation.dp.remaining = remainingDp;

  creation.baseDp = baseDp;
  creation.bonusDp = bonusDp;
  creation.manualNegativeDp = manualNegativeDp;
  creation.negativeDp = manualNegativeDp;
  creation.grantedDp = grantedDp;
  creation.negativeQualityDp = negativeQualityDp;
  creation.negativeQualityDpRaw = rawNegativeQualityDp;
  creation.totalNegativeDp = totalNegativeDp;
  creation.totalDp = totalDp;
  creation.spentDp = spentTotal;
  creation.remainingDp = remainingDp;

  if (system.qualityLimits?.negativeDp) {
    system.qualityLimits.negativeDp.max =
      negativeLimitMax;

    system.qualityLimits.negativeDp.used =
      negativeQualityDp;

    system.qualityLimits.negativeDp.remaining =
      negativeLimitRemaining;

    system.qualityLimits.negativeDp.exceeded =
      negativeLimitExceeded;
    system.qualityLimits.negativeDp.selected = rawNegativeQualityDp;
    system.qualityLimits.negativeDp.capped = negativeDpWasCapped;
  }

  if (system.qualityLimits?.freeQualities) {
    const freeQualityMax = Number(
      system.qualityLimits.freeQualities.max ?? 0
    );

    const freeQualityRemaining = Math.max(
      0,
      freeQualityMax - freeQualityUsed
    );

    const freeQualityExceeded = (
      freeQualityUsed > freeQualityMax
    );

    system.qualityLimits.freeQualities.max =
      freeQualityMax;

    system.qualityLimits.freeQualities.used =
      freeQualityUsed;

    system.qualityLimits.freeQualities.remaining =
      freeQualityRemaining;

    system.qualityLimits.freeQualities.exceeded =
      freeQualityExceeded;
  }

  if (creation.negativeDpLimit) {
    creation.negativeDpLimit.max = negativeLimitMax;
    creation.negativeDpLimit.used = negativeQualityDp;
    creation.negativeDpLimit.remaining =
      negativeLimitRemaining;
    creation.negativeDpLimit.exceeded =
      negativeLimitExceeded;
    creation.negativeDpLimit.selected = rawNegativeQualityDp;
    creation.negativeDpLimit.capped = negativeDpWasCapped;
  }

  creation.coreDiscount ??= {};

  creation.coreDiscount.base = coreDiscountBase;
  creation.coreDiscount.used = coreDiscountUsed;
  creation.coreDiscount.spent = coreDiscountUsed;
  creation.coreDiscount.remaining = coreDiscountRemaining;

  system.coreDiscount ??= {};

  system.coreDiscount.base = coreDiscountBase;
  system.coreDiscount.used = coreDiscountUsed;
  system.coreDiscount.spent = coreDiscountUsed;
  system.coreDiscount.remaining = coreDiscountRemaining;
}

_prepareDigimonQualityRequirements(system) {
  const stageKey = system.stage ?? "child";
  const ownedQualities = this.items.filter((item) => item.type === "quality");

  const ownedQualityNames = new Set(
    ownedQualities.flatMap((item) => [
      item.name,
      item.system?.originalName,
      item.system?.sourceId
    ]).filter(Boolean).map(normalizeQualityName)
  );

  const hasOwnedQualityReference = (reference = "") => {
    const coreId = getCoreQualityId({ name: reference });
    if (coreId && hasCoreQuality(this, coreId)) return true;
    return ownedQualityNames.has(normalizeQualityName(reference));
  };

  const getOwnedQualityRank = (aliases = []) => {
    const wanted = new Set(aliases.map(normalizeQualityName));
    const owned = ownedQualities.find((quality) => (
      [quality.name, quality.system?.originalName, quality.system?.sourceId]
        .filter(Boolean)
        .map(normalizeQualityName)
        .some((key) => wanted.has(key))
    ));
    return Math.max(0, Number(owned?.system?.rank?.value ?? 0));
  };

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
let effectiveRankMax = rankLimitData.max;

if (isNaturewalkQualitySystem(itemSystem)) {
  const hasElementalMyriad = hasCoreQuality(this, CORE_QUALITY_IDS.elementalMyriad);
  effectiveRankMax = hasElementalMyriad ? 10 : 2;
}

const coreQualityId = getCoreQualityId(item);
if ([CORE_QUALITY_IDS.weapon, CORE_QUALITY_IDS.instinct].includes(coreQualityId)) {
  effectiveRankMax = getWeaponInstinctEffectiveMax(this, item);
}

if (coreQualityId === CORE_QUALITY_IDS.advancedMobility) {
  const extraMovement = findCoreQuality(this, CORE_QUALITY_IDS.extraMovement);
  const extraChoices = getCoreSelectedChoices(extraMovement);
  effectiveRankMax = Math.min(5, extraChoices.length);
}

const qualityIdentity = normalizeQualityName(
  itemSystem.sourceId ?? itemSystem.originalName ?? item.name ?? ""
);
const dependentRankCaps = {
  fraquezanatural: ["passoNatural", "naturewalk"],
  naturalweakness: ["passoNatural", "naturewalk"],
  errodesistema: ["impulsoDeSistema", "systemBoost"],
  systemerror: ["impulsoDeSistema", "systemBoost"],
  perfuracaodesastrada: ["golpeCerteiro", "certainStrike"],
  fumbledpiercing: ["golpeCerteiro", "certainStrike"],
  golpeenfraquecido: ["golpeCerteiro", "certainStrike"],
  weakenedstrike: ["golpeCerteiro", "certainStrike"],
  decepcionante: ["poderBrutal", "hugePower"],
  underwhelming: ["poderBrutal", "hugePower"],
  flancoaberto: ["esquiva", "avoidance"],
  broadside: ["esquiva", "avoidance"],
  doenca: ["energiaVital", "vitalEnergy"],
  illness: ["energiaVital", "vitalEnergy"]
};

if (dependentRankCaps[qualityIdentity]) {
  effectiveRankMax = Math.min(
    Math.max(0, Number(itemSystem.rank?.max ?? effectiveRankMax ?? 0)),
    getOwnedQualityRank(dependentRankCaps[qualityIdentity])
  );
}

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
const anyRequiredQuality = itemSystem.requirements?.mode === "any" ||
  /\b(or|ou)\b/i.test(String(itemSystem.requirements?.text ?? ""));

if (anyRequiredQuality && requiredQualityNames.length) {
  const hasAny = requiredQualityNames.some((requiredName) => {
    return hasOwnedQualityReference(requiredName);
  });
  if (!hasAny) {
    unmet.push(game.i18n.format("DDA.QualityRequirement.RequiredQuality", {
      quality: requiredQualityNames.join(" / ")
    }));
  }
} else {
  for (const requiredName of requiredQualityNames) {
    if (!hasOwnedQualityReference(requiredName)) {
      unmet.push(game.i18n.format("DDA.QualityRequirement.RequiredQuality", { quality: requiredName }));
    }
  }
}

const incompatibleQualityNames = parseQualityNameList(itemSystem.incompatible?.qualityNames);

for (const incompatibleName of incompatibleQualityNames) {
  const weaponInstinctPair = [CORE_QUALITY_IDS.weapon, CORE_QUALITY_IDS.instinct].includes(coreQualityId) &&
    ["arma", "weapon", "instinto", "instinct"].includes(
      normalizeQualityChoiceKey(incompatibleName)
    );

  if (weaponInstinctPair && !isWeaponInstinctConflict(this, item)) continue;

  if (hasOwnedQualityReference(incompatibleName)) {
    incompatible.push(`Incompatível com: ${incompatibleName}`);
  }
}

if (coreQualityId === CORE_QUALITY_IDS.dataSpecialization) {
  const invalidChoices = system.qualityFeatures?.dataSpecialization?.invalidChoices ?? [];
  for (const invalidChoice of invalidChoices) {
    const label = invalidChoice.label ?? invalidChoice.key ?? "Data Specialization";
    unmet.push(invalidChoice.reason === "duplicate"
      ? `${label}: escolha repetida.`
      : `${label}: exige Impulso Híbrido disponível.`);
  }
}

if (coreQualityId === CORE_QUALITY_IDS.advancedMobility) {
  const extraTypes = new Set(system.qualityFeatures?.extraMovement?.types ?? []);
  const invalidTypes = (system.qualityFeatures?.advancedMobility?.types ?? [])
    .filter((type) => !extraTypes.has(type));
  for (const type of invalidTypes) {
    unmet.push(`Mobilidade Avançada exige Movimento Extra: ${type}.`);
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
  const isFree = Boolean(
    itemSystem.cost?.isFree ||
    itemSystem.category?.free
  );

  const isNegative = Boolean(
    itemSystem.category?.negative
  );

  if (isFree || isNegative) return 0;

  const attachedChoiceCost = Math.max(
    0,
    Number(
      itemSystem.overclock?.effectDpCost ??
      itemSystem.enemyBuilder?.attachedChoiceDp ??
      0
    )
  );

  const baseCost = Math.max(
    0,
    Number(itemSystem.cost?.dp ?? 0)
  );
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

  const freeRanks = Math.max(0, Number(itemSystem.cost?.freeRanks ?? 0));
  const paidRank = Math.max(0, effectiveRank - freeRanks);

  const rankedBaseCost =
    itemSystem.cost?.perRank
      ? baseCost * paidRank
      : baseCost;

  const intrinsicCost = applyIntrinsicQualityDiscount(
    rankedBaseCost,
    itemSystem
  );

  const storedDiscount = (Array.isArray(itemSystem.cost?.dpDiscountSources)
    ? itemSystem.cost.dpDiscountSources
    : []).reduce((total, entry) => {
      return total + Math.max(0, Number(entry?.amount ?? entry?.value ?? 0));
    }, 0);

  return Math.max(0,
    intrinsicCost.payable +
    attachedChoiceCost -
    storedDiscount
  );
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

function getQualityRankLimitForStage(
  itemSystem,
  stageKey,
  actorSystem = {}
) {
  const canonicalRank = getCanonicalQualityRankData(itemSystem);
  const rankLimit = canonicalRank
    ? (canonicalRank.rankLimit ?? {})
    : (itemSystem.rankLimit ?? {});

  const type =
    rankLimit.type ??
    "fixed";

  /*
   * Naturewalk possui sempre até 2 Ranks.
   * Corrige também Items antigos com rank.max = 1.
   */
  if (
    isNaturewalkQualitySystem(
      itemSystem
    )
  ) {
    return {
      type:
        "naturewalk",

      max:
        2
    };
  }

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

  const fixedValue = Number(rankLimit.value ?? canonicalRank?.rank?.max ?? itemSystem.rank?.max ?? 0);

  return {
    type: "fixed",
    max: Math.max(0, fixedValue)
  };
}
function formatActorKey(key, data = {}) {
  return game.i18n.format(key, data);
}
