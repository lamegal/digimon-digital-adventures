import { DDA_DIGIMON_QUALITIES } from "../data/digimon-qualities.js";
import { EFFECT_TAGS } from "../rules/quality-automation.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const DDADigimonQualityBrowserBase = HandlebarsApplicationMixin(ApplicationV2);
import {
  CORE_QUALITY_IDS,
  getCoreQualityId,
  findCoreQuality,
  hasCoreQuality,
  getDataOptimizationKey,
  getDataSpecializationEntries,
  getAvailableDataSpecializationOptions,
  getDataOptimizationForSpecialization,
  getAvailableAdvancedMobilityOptions,
  getWeaponInstinctEffectiveMax,
  isWeaponInstinctConflict,
  getCoreDiscountPreview,
  getFirstPurchaseDiscount,
  getMarginalQualityDpCost,
  normalizeCoreKey,
  getMissingDataSpecializationFreeGrants
} from "../rules/core-qualities.js";
const NATUREWALK_MAIN_STATS = [
  {
    key: "accuracy",
    labelKey: "DDA.MainStat.Accuracy"
  },
  {
    key: "damage",
    labelKey: "DDA.MainStat.Damage"
  },
  {
    key: "dodge",
    labelKey: "DDA.MainStat.Dodge"
  },
  {
    key: "armor",
    labelKey: "DDA.MainStat.Armor"
  },
  {
    key: "health",
    labelKey: "DDA.MainStat.Health"
  }
];

const STATUS_WARLORD_DISCOUNT_KEY = "dataSpecialization:statusWarlord";

function normalizeNaturewalkIdentity(
  value = ""
) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function isNaturewalkQualityData(
  quality = {},
  ownedItem = null
) {
  const candidates = [
    quality?.id,
    quality?.name,
    quality?.originalName,

    ownedItem?.system?.sourceId,
    ownedItem?.system?.originalName,
    ownedItem?.name
  ];

  return candidates.some((candidate) => {
    return [
      "passonatural",
      "naturewalk"
    ].includes(
      normalizeNaturewalkIdentity(
        candidate
      )
    );
  });
}

function normalizeQualityBrowserIdentity(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizeQualityBrowserElementKey(value = "") {
  const key = normalizeQualityBrowserIdentity(value);
  const aliases = {
    fire: "fire", fogo: "fire",
    water: "water", agua: "water",
    wind: "wind", vento: "wind",
    earth: "earth", terra: "earth",
    ice: "ice", gelo: "ice",
    wood: "wood", flora: "wood",
    steel: "steel", aco: "steel",
    thunder: "thunder", trovao: "thunder", lightning: "thunder",
    dark: "dark", darkness: "dark", trevas: "dark",
    light: "light", luz: "light"
  };
  return aliases[key] ?? key;
}

function getOffensiveRankStatRequirement(quality = {}, rank = 1) {
  const key = normalizeQualityBrowserIdentity(
    quality?.id ?? quality?.originalName ?? quality?.name ?? ""
  );
  const required = Math.max(0, Number(rank ?? 1)) * 4;

  if (["perfuracaodearmadura", "armorpiercing"].includes(key)) {
    return { stat: "damage", required };
  }

  if (["golpecerteiro", "certainstrike"].includes(key)) {
    return { stat: "accuracy", required };
  }

  if (["evasaoabsoluta", "absoluteevasion"].includes(key)) {
    return { stat: "dodge", required };
  }

  return null;
}

function getActorMainStatTotalForBrowser(actor, stat = "") {
  const data = actor?.system?.mainStats?.[stat] ?? {};
  const value = Number(data.total ?? data.value ?? data.base ?? 0);
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function actorMeetsOffensiveRankStatRequirement(actor, quality, rank = 1) {
  const requirement = getOffensiveRankStatRequirement(quality, rank);
  if (!requirement) return true;
  return getActorMainStatTotalForBrowser(actor, requirement.stat) >= requirement.required;
}

function qualityBrowserMatches(quality = {}, ownedItem = null, aliases = []) {
  const expected = new Set(aliases.map(normalizeQualityBrowserIdentity));
  return [
    quality?.id,
    quality?.name,
    quality?.originalName,
    ownedItem?.system?.sourceId,
    ownedItem?.system?.originalName,
    ownedItem?.name
  ].some((entry) => expected.has(normalizeQualityBrowserIdentity(entry)));
}

function isEffectPurchaseQualityData(quality = {}, ownedItem = null) {
  const definitions = [
    quality,
    ownedItem?.system
  ].filter(Boolean);

  const hasEffectChoiceStructure = definitions.some((definition) => {
    const choiceType = normalizeQualityBrowserIdentity(
      definition?.choices?.type
    );

    const appliesTo = normalizeQualityBrowserIdentity(
      definition?.attackModifier?.appliesTo
    );

    return choiceType === "effecttagperrank" ||
      appliesTo === "oneattackperpurchasedeffect";
  });

  return hasEffectChoiceStructure ||
    qualityBrowserMatches(quality, ownedItem, [
      "efeitoBasico",
      "basicEffect",
      "basic-effect",

      "efeitoAvancado",
      "advancedEffect",
      "advanced-effect",

      "efeitoMestre",
      "masterEffect",
      "master-effect"
    ]);
}

function isElementalForceQualityData(quality = {}, ownedItem = null) {
  return qualityBrowserMatches(quality, ownedItem, [
    "forcaElemental", "elementalForce"
  ]);
}

function isElementalMyriadQualityData(quality = {}, ownedItem = null) {
  return qualityBrowserMatches(quality, ownedItem, [
    "miríadeElemental", "miriadeElemental", "elementalMyriad"
  ]);
}

function isNaturalWeaknessQualityData(quality = {}, ownedItem = null) {
  return qualityBrowserMatches(quality, ownedItem, [
    "fraquezaNatural", "naturalWeakness"
  ]);
}

function escapeNaturewalkHtml(
  value = ""
) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
const QUALITY_BROWSER_CATEGORY_FILTERS = [
  { key: "all", labelKey: "DDA.QualityBrowser.Category.All" },
  { key: "core", labelKey: "DDA.QualityBrowser.Category.Core" },
  { key: "attack", labelKey: "DDA.QualityBrowser.Category.Attack" },
  { key: "defense", labelKey: "DDA.QualityBrowser.Category.Defense" },
  { key: "clash", labelKey: "DDA.QualityBrowser.Category.Clash" },
  { key: "effect", labelKey: "DDA.QualityBrowser.Category.Effect" },
  { key: "utility", labelKey: "DDA.QualityBrowser.Category.Utility" },
  { key: "stanceMode", labelKey: "DDA.QualityBrowser.Category.StanceMode" },
  { key: "digizoid", labelKey: "DDA.QualityBrowser.Category.Digizoid" },
  { key: "gainForce", labelKey: "DDA.QualityBrowser.Category.GainForce" }
];

const QUALITY_BROWSER_SECTION_GROUPS = {
  attack: [
    "Offensive Qualities",
    "Qualidades Ofensivas"
  ],

  defense: [
    "Defensive Qualities",
    "Qualidades Defensivas",
    "Preservation Qualities",
    "Qualidades de Preservação"
  ],

  clash: [
    "Clash Qualities",
    "Qualidades de Clash"
  ],

  effect: [
    "Effect Qualities",
    "Qualidades de Efeito",
    "Evoker Qualities",
    "Omnievoker Qualities",
    "Qualidades de Conjurador",
    "Qualidades de Conjuração"
  ],

  utility: [
    "Utility Qualities",
    "Qualidades Utilitárias"
  ],

  stanceMode: [
    "Stance Qualities",
    "Qualidades de Postura",
    "Mode Change Qualities",
    "Qualidades de Mudança de Modo"
  ],

  digizoid: [
    "Digizoid Armor",
    "Armaduras de Digizoide",
    "Digizoid Weaponry",
    "Armamentos de Digizoide"
  ],

  gainForce: [
    "Gain Force Qualities",
    "Qualidades Gain Force"
  ]
};

function getDigizoidGainForceFamily(quality = {}) {
  const section = normalizeQualityBrowserIdentity(quality?.section ?? quality?.system?.section ?? "");
  if (section === "digizoidarmor" || section === "armadurasdedigizoide") return "digizoidArmor";
  if (section === "digizoidweaponry" || section === "armamentosdedigizoide") return "digizoidWeaponry";
  if (section === "gainforcequalities" || section === "qualidadesgainforce") return "gainForce";
  return "";
}

function getDigizoidGainForceRankRequirements(quality = {}) {
  const family = getDigizoidGainForceFamily(quality);
  const id = normalizeQualityBrowserIdentity(quality?.id ?? quality?.system?.sourceId ?? quality?.originalName ?? quality?.name ?? "");
  const requirements = [];
  if (family === "digizoidWeaponry") requirements.push({ aliases: ["arma", "weapon"], label: isQualityBrowserEnglish() ? "Weapon" : "Arma", rank: 1 });
  if (family === "gainForce") requirements.push({ aliases: ["instinto", "instinct"], label: isQualityBrowserEnglish() ? "Instinct" : "Instinto", rank: 1 });
  if (["armamentodedigizoidepuro", "puredigizoidweaponry", "overwritepuro", "pureoverwrite"].includes(id)) {
    requirements.push({ aliases: ["algoritmo", "algorithm"], label: isQualityBrowserEnglish() ? "Algorithm" : "Algoritmo", rank: 3 });
  }
  return requirements;
}

function isQualityBrowserEnglish() {
  const language = String(
    game?.i18n?.lang ??
    game?.i18n?.language ??
    ""
  );

  return language.toLowerCase().startsWith("en");
}

function matchesQualityBrowserCategory(
  quality = {},
  categoryKey = "all"
) {
  if (categoryKey === "all") return true;

  const category = quality.category ?? {};
  const section = String(quality.section ?? "");

  if (categoryKey === "core") {
    return Boolean(category.core);
  }

  if (categoryKey === "attack") {
    return Boolean(category.attack) ||
      QUALITY_BROWSER_SECTION_GROUPS.attack
        .includes(section);
  }

  return QUALITY_BROWSER_SECTION_GROUPS[
    categoryKey
  ]?.includes(section) ?? false;
}
export function buildQualityItemData(quality) {
    return {
    name: quality.name,
    type: "quality",
    img: "icons/svg/book.svg",
    system: {
      sourceId: quality.id,
      originalName: quality.originalName ?? "",
      tier: quality.tier ?? "starting",
      originalTier: quality.originalTier ?? "",
      availability: quality.availability ?? {},
      section: quality.section ?? "",
      category: quality.category ?? {},
      cost: quality.cost ?? {},
      rank: quality.rank ?? {},
      rankLimit: quality.rankLimit ?? null,
      statRankRequirement: quality.statRankRequirement ?? {},
      stageRequirement: quality.stageRequirement ?? {},
      requirements: quality.requirements ?? {},
      incompatible: quality.incompatible ?? {},
      requiredFor: quality.requiredFor ?? [],
      choices: quality.choices ?? {},
      attackModifier: quality.attackModifier ?? {},
      grants: quality.grants ?? {},
      activation: quality.activation ?? {},
      uses: quality.uses ?? {},
      bossQuality: Boolean(quality.bossQuality),
      boss: quality.boss ?? {},

      superiorModeChange: {
        ...(quality.superiorModeChange ?? {}),

        enabled: Boolean(
          quality.superiorModeChange
        ),

        activeMode: "default",

        configuration: {
          complete: false,
          defaultCost: 0,
          modeCost: 0,
          defaultQualityIds: [],
          modeQualities: [],
          defaultAttackKeys: [],
          modeAttacks: [],

          ...(
            quality.superiorModeChange
              ?.configuration ?? {}
          )
        }
      },

      creation: quality.creation ?? {},

      effect: quality.effect ?? "",
      description: quality.description ?? ""
    }
  };
}

export class DDADigimonQualityBrowser extends DDADigimonQualityBrowserBase {
  constructor(actor, options = {}) {
    const viewportHeight = Number(globalThis?.innerHeight ?? 820);
    const safeHeight = Math.min(720, Math.max(520, viewportHeight - 96));
    const position = { ...(options.position ?? {}) };

    if (position.height === undefined) position.height = safeHeight;

    super({
      ...options,
      position
    });

    this.actor = actor;
    this.activeTier = "all";
    this.activeCategory = "all";
    this.searchTerm = "";
  }

  static DEFAULT_OPTIONS = {
    id: "dda-digimon-quality-browser",
    classes: ["dda", "quality-browser-window"],
    position: {
      width: 760,
      height: 720
    },
    window: {
      title: "DDA.QualityBrowser.Title",
      icon: "fa-solid fa-gem",
      resizable: true
    }
  };

  static PARTS = {
    main: {
      template: "systems/digimon-digital-adventures/templates/apps/digimon-quality-browser.html",
      scrollable: [".quality-browser-list"]
    }
  };

  _normalizeSearchText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  _getSearchTerms(searchTerm) {
    const stopWords = new Set([
      "a", "o", "as", "os",
      "um", "uma", "uns", "umas",
      "de", "da", "do", "das", "dos",
      "em", "no", "na", "nos", "nas",
      "para", "por", "com", "e", "ou"
    ]);

    return this._normalizeSearchText(searchTerm)
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3 && !stopWords.has(term));
  }

_getQualitySearchScore(quality, searchTerm) {
  const query = this._normalizeSearchText(
    searchTerm
  );

  if (!query) return 0;

  const terms = this._getSearchTerms(query);

  const displayName = this._normalizeSearchText(
    quality.name
  );

  const originalName = this._normalizeSearchText(
    quality.originalName
  );

  const displayNameWords = new Set(
    displayName.split(/\s+/).filter(Boolean)
  );

  const originalNameWords = new Set(
    originalName.split(/\s+/).filter(Boolean)
  );

  const nameHaystack = this._normalizeSearchText([
    quality.name,
    quality.originalName
  ]
    .filter(Boolean)
    .join(" "));

  const metaHaystack = this._normalizeSearchText([
    quality.section,
    quality.availability?.label,
    quality.category?.label,
    quality.requirements?.text,
    quality.incompatible?.text
  ]
    .filter(Boolean)
    .join(" "));

  const fullHaystack = this._normalizeSearchText([
    quality.name,
    quality.originalName,
    quality.section,
    quality.availability?.label,
    quality.category?.label,
    quality.requirements?.text,
    quality.incompatible?.text,
    quality.effect,
    quality.description
  ]
    .filter(Boolean)
    .join(" "));

  /*
   * Quanto maior a pontuação, mais cedo a
   * Qualidade aparece nos resultados.
   */
  if (displayName === query) return 1000;
  if (originalName === query) return 950;

  if (displayName.startsWith(query)) return 900;
  if (originalName.startsWith(query)) return 850;

  if (
    terms.length &&
    terms.every((term) => {
      return displayNameWords.has(term);
    })
  ) {
    return 800;
  }

  if (
    terms.length &&
    terms.every((term) => {
      return originalNameWords.has(term);
    })
  ) {
    return 760;
  }

  if (displayName.includes(query)) return 700;
  if (originalName.includes(query)) return 650;

  if (metaHaystack.includes(query)) return 400;
  if (fullHaystack.includes(query)) return 200;

  if (!terms.length) return -1;

  if (
    terms.every((term) => {
      return nameHaystack.includes(term);
    })
  ) {
    return 150;
  }

  if (
    terms.every((term) => {
      return fullHaystack.includes(term);
    })
  ) {
    return 50;
  }

  return -1;
}

_matchesQualitySearch(quality, searchTerm) {
  if (!this._normalizeSearchText(searchTerm)) {
    return true;
  }

  return this._getQualitySearchScore(
    quality,
    searchTerm
  ) >= 0;
}

  _getViewData() {
    const tiers = [
      { key: "all", label: "DDA.QualityBrowser.Filter.All" },
      { key: "starting", label: "DDA.QualityBrowser.Filter.Starting" },
      { key: "champion", label: "DDA.QualityBrowser.Filter.Adult" },
      { key: "perfect", label: "DDA.QualityBrowser.Filter.Perfect" },
      { key: "mega", label: "DDA.QualityBrowser.Filter.Mega" },
      { key: "free", label: "DDA.QualityBrowser.Filter.Free" },
      { key: "negative", label: "DDA.QualityBrowser.Filter.Negative" }
    ];

    const categories = QUALITY_BROWSER_CATEGORY_FILTERS.map(
      (category) => ({
        key: category.key,
        label: game.i18n.localize(category.labelKey)
      })
    );

    const term = this.searchTerm;

    const qualities = DDA_DIGIMON_QUALITIES
      .filter((quality) => {
        if (
          this.activeTier !== "all" &&
          quality.tier !== this.activeTier
        ) {
          return false;
        }

        if (
          !matchesQualityBrowserCategory(
            quality,
            this.activeCategory
          )
        ) {
          return false;
        }

        return this._matchesQualitySearch(
          quality,
          term
        );
      })
      .sort((left, right) => {
        if (!String(term ?? "").trim()) {
          return 0;
        }

        const scoreDifference =
          this._getQualitySearchScore(
            right,
            term
          ) -
          this._getQualitySearchScore(
            left,
            term
          );

        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return String(left.name ?? "").localeCompare(
          String(right.name ?? ""),
          game.i18n.lang
        );
      })
      .map((quality) => {
        const ownedItem = this.actor?.items?.find((item) => {
          return item.type === "quality" && item.system?.sourceId === quality.id;
        });

        const owned = Boolean(ownedItem);
        const currentRank = Number(ownedItem?.system?.rank?.value ?? 1);
        const effectiveMax = this._getQualityEffectiveMax(quality, ownedItem);
        const canIncreaseRank = owned && effectiveMax > currentRank;
                    const isRanked = Boolean(
          quality.cost?.perRank ||
          quality.rankLimit ||
          Number(quality.rank?.max ?? 1) > 1
        );

        const showRankInfo = Boolean(
          isRanked &&
          (
            owned ||
            effectiveMax > 1 ||
            quality.rankLimit
          )
        );

        const rankDisplayValue = owned
          ? currentRank
          : Number(quality.rank?.value ?? 1);

        const rankLabel = effectiveMax > 0
          ? game.i18n.format("DDA.QualityBrowser.RankProgress", {
              rank: rankDisplayValue,
              max: effectiveMax
            })
          : game.i18n.format("DDA.QualityBrowser.RankValue", {
              rank: rankDisplayValue
            });
            const canBuy = this._canActorBuyQuality(quality);


        return {
          ...quality,
          owned,
          ownedItemId: ownedItem?.id ?? "",
          currentRank,
          effectiveMax,
          canIncreaseRank,
          isRanked,
          showRankInfo,
          rankLabel,
          canBuy,
          blockedReason: owned ? "" : this._getBlockedReason(quality),
          costLabel: this._getCostLabel(quality),
          tierLabel: this._getTierLabel(quality),
          isNegative: quality.tier === "negative",
          isFree: quality.tier === "free"
                };
      });

    return {
      actor: this.actor,
      tiers,
      categories,
      activeTier: this.activeTier,
      activeCategory: this.activeCategory,
      searchTerm: this.searchTerm,
      qualities,
      coreReview: this._getCoreReviewData()
    };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, this._getViewData());
  }

  _getCoreReviewData() {
    const english = isQualityBrowserEnglish();
    const actor = this.actor;
    if (!actor) return { visible: false };

    const discount = actor.system?.creation?.coreDiscount ?? actor.system?.coreDiscount ?? {};
    const base = Math.max(0, Number(discount.base ?? actor.system?.stageValue ?? 0));
    const used = Math.max(0, Number(discount.used ?? discount.spent ?? 0));
    const remaining = Math.max(0, Number(discount.remaining ?? Math.max(0, base - used)));

    const optimizationKey = getDataOptimizationKey(actor);
    const optimizationDefinition = DDA_DIGIMON_QUALITIES.find((entry) => {
      return getCoreQualityId(entry) === CORE_QUALITY_IDS.dataOptimization;
    });
    const optimizationOption = optimizationDefinition?.choices?.options?.find((option) => {
      return normalizeCoreKey(option?.key) === normalizeCoreKey(optimizationKey);
    });

    const specializationDefinition = DDA_DIGIMON_QUALITIES.find((entry) => {
      return getCoreQualityId(entry) === CORE_QUALITY_IDS.dataSpecialization;
    });
    const specializationOptions = new Map(
      (specializationDefinition?.choices?.options ?? []).map((option) => [
        normalizeCoreKey(option?.key),
        option
      ])
    );
    const specializations = getDataSpecializationEntries(actor).map((entry) => {
      const option = specializationOptions.get(normalizeCoreKey(entry.key));
      return {
        key: entry.key,
        label: entry.label ?? option?.label ?? entry.originalLabel ?? entry.key,
        viaHybridDrive: Boolean(entry.viaHybridDrive),
        hybridLabel: entry.viaHybridDrive
          ? (english ? "Hybrid Drive" : "Impulso Híbrido")
          : ""
      };
    });

    const missingGrants = getMissingDataSpecializationFreeGrants(actor);
    const warnings = [
      ...(actor.system?.qualityFeatures?.coreValidation?.warnings ?? [])
    ].map((warning) => String(warning ?? "").trim()).filter(Boolean);

    if (!optimizationKey && specializations.length) {
      warnings.push(english
        ? "Data Specialization requires a configured Data Optimization."
        : "Especialização de Dados exige uma Otimização de Dados configurada.");
    }

    const uniqueWarnings = [...new Set(warnings)];
    const coreCount = actor.items?.filter?.((item) => {
      return item.type === "quality" && Boolean(getCoreQualityId(item));
    })?.length ?? 0;

    const statusWarlordOwned = specializations.some((entry) => entry.key === "statusWarlord");
    const statusWarlordDiscountUsed = Boolean(this._getStatusWarlordDiscountUse());

    return {
      visible: true,
      valid: uniqueWarnings.length === 0,
      stateClass: uniqueWarnings.length ? "has-warnings" : "is-valid",
      statusIcon: uniqueWarnings.length ? "fa-triangle-exclamation" : "fa-circle-check",
      title: english ? "Core Build Review" : "Revisão da Build Core",
      statusLabel: uniqueWarnings.length
        ? (english ? "Review required" : "Revisão necessária")
        : (english ? "Automation healthy" : "Automação íntegra"),
      actorName: actor.name,
      coreCount,
      coreCountLabel: english ? "Core Qualities" : "Qualidades Core",
      discountLabel: english ? "Core Discount" : "Desconto Core",
      discountBaseLabel: english ? "Base" : "Base",
      discountUsedLabel: english ? "Used" : "Usado",
      discountRemainingLabel: english ? "Remaining" : "Restante",
      discount: { base, used, remaining },
      optimizationLabel: english ? "Data Optimization" : "Otimização de Dados",
      optimizationValue: optimizationOption?.label ?? optimizationKey ?? (english ? "Not selected" : "Não selecionada"),
      specializationLabel: english ? "Data Specializations" : "Especializações de Dados",
      noSpecializationsLabel: english ? "None selected" : "Nenhuma selecionada",
      specializations,
      warningsLabel: english ? "Checks" : "Verificações",
      warnings: uniqueWarnings.map((message) => ({ message })),
      missingGrantCount: missingGrants.length,
      canRepair: Boolean(actor.isOwner && missingGrants.length),
      repairLabel: english ? "Apply missing free grants" : "Aplicar concessões gratuitas pendentes",
      repairHint: english
        ? "Repairs free Quality Ranks from Data Specialization without charging DP."
        : "Repara Ranks gratuitos de Qualidades concedidos por Especialização de Dados, sem cobrar PD.",
      statusWarlord: statusWarlordOwned ? {
        label: english ? "Status Warlord discount" : "Desconto de Senhor da Guerra de Status",
        value: statusWarlordDiscountUsed
          ? (english ? "Used" : "Usado")
          : (english ? "Available: 1 DP" : "Disponível: 1 PD")
      } : null
    };
  }

  async _repairCoreAutomation() {
    const english = isQualityBrowserEnglish();
    const dataSpecializationItem = findCoreQuality(this.actor, CORE_QUALITY_IDS.dataSpecialization);
    const missing = getMissingDataSpecializationFreeGrants(this.actor);
    let repaired = 0;

    if (dataSpecializationItem && missing.length) {
      const choices = Array.isArray(dataSpecializationItem.system?.choices?.selectedRanks)
        ? foundry.utils.deepClone(dataSpecializationItem.system.choices.selectedRanks)
        : [];

      for (const entry of missing) {
        const index = choices.findIndex((choice) => {
          return normalizeCoreKey(choice?.key ?? choice?.specialization ?? choice) === normalizeCoreKey(entry.key);
        });
        if (index < 0) continue;

        const choice = {
          ...choices[index],
          key: entry.key,
          specialization: entry.key,
          label: choices[index]?.label ?? entry.label ?? entry.originalLabel ?? entry.key
        };
        let freeGrant = choice.freeGrant;
        if (!freeGrant?.qualityId || !freeGrant?.sourceKey) {
          freeGrant = await this._prepareDataSpecializationFreeGrant(choice);
        }
        if (freeGrant === false || !freeGrant?.qualityId) continue;

        choice.freeGrant = freeGrant;
        choices[index] = choice;
        await dataSpecializationItem.update({
          "system.choices.selectedRanks": choices
        });
        await this._applyDataSpecializationFreeGrant(dataSpecializationItem, choice);
        repaired += 1;
      }
    }

    // Re-apply persisted attack Tags for old Actors. The operation is idempotent.
    for (const item of this.actor?.items ?? []) {
      if (item.type !== "quality") continue;
      const selected = Array.isArray(item.system?.choices?.selectedRanks)
        ? item.system.choices.selectedRanks
        : [];
      for (const choice of selected) {
        await this._applyAttackChoiceToAttack(item, choice);
      }
    }

    if (repaired > 0) {
      ui.notifications.info(english
        ? `${repaired} Core automation grant(s) repaired.`
        : `${repaired} concessão(ões) da automação Core reparada(s).`);
    } else if (!missing.length) {
      ui.notifications.info(english
        ? "The Core automation is already healthy."
        : "A automação Core já está íntegra.");
    }

    this.render();
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const root = this.element;
    if (!(root instanceof HTMLElement)) return;

    const html = $(root);

    html.find("[data-tier-filter]").on("click", (event) => {
      event.preventDefault();
      this.activeTier = event.currentTarget.dataset.tierFilter;
      this.render();
      });

    html.find("[data-category-filter]").on(
      "click",
      (event) => {
        event.preventDefault();

        this.activeCategory =
          event.currentTarget
            .dataset
            .categoryFilter ?? "all";

        this.render();
      }
    );
      html.find("[data-quality-search]").on("keydown", (event) => {
  if (event.key !== "Enter") return;

  event.preventDefault();

  this.searchTerm = event.currentTarget.value ?? "";
  this.render();
      });

    html.find("[data-add-quality]").on("click", async (event) => {
  event.preventDefault();

  const button = event.currentTarget;
  const qualityId = button.dataset.addQuality;
  const ownedItemId = button.dataset.ownedItemId;

  const quality = DDA_DIGIMON_QUALITIES.find((entry) => entry.id === qualityId);

  if (!quality) {
    ui.notifications.warn(game.i18n.localize("DDA.Warning.QualityNotFound"));
    return;
  }

  if (ownedItemId) {
    await this._increaseQualityRank(ownedItemId);
    return;
  }

  await this._addQualityToActor(quality);
      });

    html.find("[data-repair-core-automation]").on("click", async (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await this._repairCoreAutomation();
      } finally {
        button.disabled = false;
      }
    });

    html.find("[data-close-quality-browser]").on("click", (event) => {
  event.preventDefault();
  this.close();
      });

  }

  async _addQualityToActor(quality) {
    if (!this.actor) {
      ui.notifications.warn(game.i18n.localize("DDA.Warning.NoDigimonSelected"));
      return;
    }

    const existing = this.actor.items.find((item) => {
      return item.type === "quality" && item.system?.sourceId === quality.id;
    });

    if (existing) {
      ui.notifications.warn(game.i18n.format("DDA.Warning.QualityAlreadyOnSheet", {
        quality: quality.name
      }));
      return;
    }

    if (!this._canActorBuyQuality(quality)) {
      ui.notifications.warn(this._getBlockedReason(quality));
      return;
    }

    const itemData = buildQualityItemData(quality);
    this._attachStatusWarlordDiscountToItemData(quality, itemData);

    if (quality.choices?.required) {
      const choice = await this._promptQualityChoice(quality, 1, []);

      if (!choice) return;

      itemData.system.choices = {
        ...(itemData.system.choices ?? {}),
        selectedRanks: [choice]
      };

      if (quality.choices?.type === "positiveCasterDerivedEffect") {
        const totalCost = this._getQualityDpCost(quality) + Math.max(0, Number(choice.effectDpCost ?? 0));
        if (this._getActorRemainingDp() < totalCost) {
          ui.notifications.warn(isQualityBrowserEnglish()
            ? `${quality.name} and the selected Effect cost ${totalCost} DP, but only ${this._getActorRemainingDp()} remain.`
            : `${quality.name} e o Efeito escolhido custam ${totalCost} PD, mas restam apenas ${this._getActorRemainingDp()}.`);
          return;
        }

        itemData.system.overclock = {
          sourceQualityId: String(choice.sourceQualityId ?? ""),
          sourceQualityName: String(choice.sourceQualityName ?? ""),
          effectTag: String(choice.effectTag ?? ""),
          effectLabel: String(choice.originalLabel ?? choice.label ?? choice.effectTag ?? ""),
          effectType: "positive",
          potencyStat: String(choice.potencyStat ?? ""),
          duration: choice.duration ?? true,
          extraActionRequired: Boolean(choice.extraActionRequired),
          effectDpCost: Math.max(0, Number(choice.effectDpCost ?? 0))
        };
      }
    }

const [createdQuality] =
  await this.actor.createEmbeddedDocuments(
    "Item",
    [itemData]
  );

if (quality.id === "mudancaDeModoSuperior") {
  const { configureSuperiorModeChange } = await import("./superior-mode-config.js");
  const configured = await configureSuperiorModeChange(this.actor, createdQuality, this);
  if (!configured) {
    await this.actor.deleteEmbeddedDocuments("Item", [createdQuality.id]);
    ui.notifications.warn(isQualityBrowserEnglish()
      ? "Superior Mode Change was not added because its configuration was not completed."
      : "Mudança de Modo Superior não foi adicionada porque a configuração não foi concluída.");
    return;
  }
}

if (["conjurador", "invocador"].includes(quality.id)) {
  const { configureEvokerQualityAppearance } = await import("../combat/evoker-qualities.js");
  const configured = await configureEvokerQualityAppearance(this.actor, createdQuality);
  if (!configured) {
    await this.actor.deleteEmbeddedDocuments("Item", [createdQuality.id]);
    ui.notifications.warn(isQualityBrowserEnglish()
      ? `${quality.name} was not added because its appearance was not defined.`
      : `${quality.name} não foi adicionada porque sua aparência não foi definida.`);
    return;
  }
}

await this._applyAttackChoiceToAttack(
  createdQuality,
  itemData.system?.choices?.selectedRanks?.[0]
);

await this._applyDataSpecializationFreeGrant(
  createdQuality,
  itemData.system?.choices?.selectedRanks?.[0]
);

    ui.notifications.info(game.i18n.format("DDA.QualityBrowser.AddedToSheet", {
      quality: quality.name
    }));

    this.render();
  }

    _actorMeetsChoiceOptionRequirements(option = {}) {
    const raw = String(
      option.requirements?.qualityNames ?? ""
    ).trim();

    if (!raw) return true;

    const requiredNames = raw
      .split(/[,;|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    const actorQualityNames = new Set(
      this._getActorQualityNames().map((name) => {
        return this._normalizeSearchText(name);
      })
    );

    const matches = requiredNames.map((requiredName) => {
      return actorQualityNames.has(
        this._normalizeSearchText(requiredName)
      );
    });

    const requirementText = String(option.requirements?.text ?? "").toLowerCase();
    const usesAnyRequirement = option.requirements?.mode === "any" ||
      /\b(or|ou)\b/.test(requirementText);

    return usesAnyRequirement
      ? matches.some(Boolean)
      : matches.every(Boolean);
  }

  async _promptDataSpecializationChoice(quality, rankNumber, existingChoices = []) {
    const english = isQualityBrowserEnglish();
    const options = getAvailableDataSpecializationOptions(
      this.actor,
      Array.isArray(quality?.choices?.options) ? quality.choices.options : [],
      existingChoices
    );

    if (!options.length) {
      ui.notifications.warn(english
        ? "No valid Data Specialization remains for this Digimon."
        : "Não resta nenhuma Especialização de Dados válida para este Digimon.");
      return null;
    }

    const optimizationKey = getDataOptimizationKey(this.actor);
    const nativeOptions = options.filter((option) => !option.eligibility.viaHybridDrive);
    const hybridOptions = options.filter((option) => option.eligibility.viaHybridDrive);
    const defaultKey = nativeOptions[0]?.key ?? hybridOptions[0]?.key ?? "";

    const renderOption = (option, hybrid = false) => {
      const label = option.label ?? option.originalLabel ?? option.key;
      const optimizationLabel = option.dataOptimizationLabel ?? option.dataOptimization ?? "";
      return `
        <label class="dda-core-specialization-card ${hybrid ? "is-hybrid" : ""}">
          <input
            type="radio"
            name="specializationKey"
            value="${escapeNaturewalkHtml(option.key)}"
            ${option.key === defaultKey ? "checked" : ""}
          >
          <span class="dda-core-specialization-card__body">
            <span class="dda-core-specialization-card__heading">
              <strong>${escapeNaturewalkHtml(label)}</strong>
              <span class="dda-core-specialization-card__badges">
                <span class="dda-core-specialization-card__role">${escapeNaturewalkHtml(optimizationLabel)}</span>
                ${hybrid ? `<span class="dda-core-specialization-card__hybrid">${english ? "Hybrid Drive" : "Impulso Híbrido"}</span>` : ""}
              </span>
            </span>
            <span class="dda-core-specialization-card__effect">${escapeNaturewalkHtml(option.effect ?? "")}</span>
          </span>
        </label>
      `;
    };

    const section = (title, hint, entries, hybrid = false) => entries.length
      ? `
        <section class="dda-core-specialization-section ${hybrid ? "is-hybrid" : ""}">
          <header>
            <h3>${escapeNaturewalkHtml(title)}</h3>
            <p>${escapeNaturewalkHtml(hint)}</p>
          </header>
          <div class="dda-core-specialization-grid">
            ${entries.map((option) => renderOption(option, hybrid)).join("")}
          </div>
        </section>
      `
      : "";

    const result = await foundry.applications.api.DialogV2.wait({
      classes: ["dda", "dda-core-quality-dialog", "dda-data-specialization-dialog"],
      position: { width: 720, height: "auto" },
      window: {
        title: english
          ? `${quality.name} — Rank ${rankNumber}`
          : `${quality.name} — Rank ${rankNumber}`
      },
      modal: true,
      content: `
        <form class="dda-core-choice-dialog">
          <header class="dda-core-choice-dialog__hero">
            <span>${english ? `Core Quality · Rank ${rankNumber}` : `Qualidade Core · Rank ${rankNumber}`}</span>
            <h2>${escapeNaturewalkHtml(quality.name)}</h2>
            <p>${english
              ? "Choose one specialization. The system only displays choices your Data Optimization can legally purchase."
              : "Escolha uma especialização. O sistema mostra apenas opções que sua Otimização de Dados pode adquirir legalmente."}</p>
          </header>
          ${section(
            english ? "Your Data Optimization" : "Sua Otimização de Dados",
            english
              ? `Native choices for ${optimizationKey || "the selected role"}.`
              : `Opções naturais de ${optimizationKey || "sua função escolhida"}.`,
            nativeOptions,
            false
          )}
          ${section(
            english ? "Hybrid Drive option" : "Opção de Impulso Híbrido",
            english
              ? "You may purchase exactly one specialization outside your original Data Optimization."
              : "Você pode adquirir exatamente uma especialização fora de sua Otimização de Dados original.",
            hybridOptions,
            true
          )}
        </form>
      `,
      buttons: [
        {
          action: "confirm",
          label: game.i18n.localize("DDA.Button.Confirm"),
          icon: "fa-solid fa-check",
          default: true,
          callback: (_event, button) => String(
            button.form?.elements?.specializationKey?.value ?? ""
          ).trim()
        },
        {
          action: "cancel",
          label: game.i18n.localize("DDA.Button.Cancel"),
          icon: "fa-solid fa-xmark",
          callback: () => null
        }
      ],
      rejectClose: false,
      close: () => null
    });

    if (!result) return null;

    const selected = options.find((option) => option.key === result);
    if (!selected) return null;

    const freeGrant = await this._prepareDataSpecializationFreeGrant(selected);
    if (freeGrant === false) return null;

    return {
      rank: rankNumber,
      key: selected.key,
      specialization: selected.key,
      label: selected.label ?? selected.originalLabel ?? selected.key,
      originalLabel: selected.originalLabel ?? "",
      dataOptimization: selected.dataOptimization || getDataOptimizationForSpecialization(selected.key),
      dataOptimizationLabel: selected.dataOptimizationLabel ?? "",
      viaHybridDrive: Boolean(selected.eligibility.viaHybridDrive),
      freeGrant,
      effect: selected.effect ?? ""
    };
  }

  _getOwnedQualityBySourceId(qualityId) {
    return this.actor?.items?.find((item) => {
      return item.type === "quality" && item.system?.sourceId === qualityId;
    }) ?? null;
  }

  _getFreeRankSourceTotal(item, excludedKey = "") {
    const sources = Array.isArray(item?.system?.cost?.freeRankSources)
      ? item.system.cost.freeRankSources
      : [];

    return sources.reduce((total, entry) => {
      const key = String(entry?.key ?? entry ?? "");
      if (excludedKey && key === excludedKey) return total;
      return total + Math.max(0, Number(entry?.ranks ?? 1));
    }, 0);
  }

  async _chooseFreeGrantDefinition({ title, hint, definitions = [] } = {}) {
    const english = isQualityBrowserEnglish();
    const options = definitions.filter(Boolean);
    if (!options.length) return null;

    const result = await foundry.applications.api.DialogV2.wait({
      classes: ["dda", "dda-core-quality-dialog", "dda-core-free-grant-dialog"],
      position: { width: 640, height: "auto" },
      window: { title },
      modal: true,
      content: `
        <form class="dda-core-choice-dialog">
          <header class="dda-core-choice-dialog__hero">
            <span>${english ? "Free Quality" : "Qualidade Gratuita"}</span>
            <h2>${escapeNaturewalkHtml(title)}</h2>
            <p>${escapeNaturewalkHtml(hint ?? "")}</p>
          </header>
          <div class="dda-core-specialization-grid">
            ${options.map((definition, index) => `
              <label class="dda-core-specialization-card">
                <input type="radio" name="freeGrantQualityId" value="${escapeNaturewalkHtml(definition.id)}" ${index === 0 ? "checked" : ""} />
                <span class="dda-core-specialization-card__body">
                  <strong>${escapeNaturewalkHtml(definition.name)}</strong>
                  <small>${escapeNaturewalkHtml(definition.originalName ?? "")}</small>
                  <span>${escapeNaturewalkHtml(definition.effect ?? definition.description ?? "")}</span>
                </span>
              </label>
            `).join("")}
          </div>
        </form>
      `,
      buttons: [
        {
          action: "confirm",
          label: game.i18n.localize("DDA.Button.Confirm"),
          icon: "fa-solid fa-check",
          default: true,
          callback: (_event, button) => String(
            button.form?.elements?.freeGrantQualityId?.value ?? ""
          ).trim()
        },
        {
          action: "cancel",
          label: game.i18n.localize("DDA.Button.Cancel"),
          icon: "fa-solid fa-xmark",
          callback: () => null
        }
      ],
      rejectClose: false,
      close: () => null
    });

    return options.find((definition) => definition.id === result) ?? null;
  }

  async _promptModeChangePair(rankNumber, existingChoices = []) {
    const english = isQualityBrowserEnglish();
    const usedStats = new Set(
      existingChoices.flatMap((choice) => {
        return Array.isArray(choice?.stats)
          ? choice.stats
          : [choice?.leftStat, choice?.rightStat];
      }).map((stat) => String(stat ?? "").trim()).filter(Boolean)
    );

    const statOptions = ["accuracy", "damage", "dodge", "armor"]
      .filter((stat) => !usedStats.has(stat));

    if (statOptions.length < 2) return null;

    const labelFor = (stat) => game.i18n.localize({
      accuracy: "DDA.MainStat.Accuracy",
      damage: "DDA.MainStat.Damage",
      dodge: "DDA.MainStat.Dodge",
      armor: "DDA.MainStat.Armor"
    }[stat]);

    const optionsHtml = statOptions.map((stat) => {
      return `<option value="${stat}">${escapeNaturewalkHtml(labelFor(stat))}</option>`;
    }).join("");

    const sizeOrder = ["small", "medium", "large", "huge", "gigantic", "colossal"];
    const defaultSize = String(this.actor?.system?.size ?? "medium");
    const defaultSizeIndex = sizeOrder.indexOf(defaultSize);
    const stage = String(this.actor?.system?.stage ?? "child");
    const maximumSize = String(CONFIG.DDA?.stages?.[stage]?.maxSize ?? "colossal");
    const maximumSizeIndex = sizeOrder.indexOf(maximumSize);
    const alreadySelectedSize = existingChoices.some((choice) => String(choice?.modeSize ?? "").trim());
    const adjacentSizes = alreadySelectedSize || defaultSizeIndex < 0
      ? []
      : [defaultSizeIndex - 1, defaultSizeIndex + 1]
          .filter((index) => index >= 0 && index < sizeOrder.length)
          .filter((index) => maximumSizeIndex < 0 || index <= maximumSizeIndex)
          .map((index) => sizeOrder[index]);
    const sizeLabel = (size) => {
      const configured = CONFIG.DDA?.sizes?.[size] ?? size;
      const localized = game.i18n.localize(configured);
      return localized && localized !== configured ? localized : configured;
    };
    const sizeOptionsHtml = [
      `<option value="">${english ? "Keep the default Size" : "Manter o Tamanho padrão"}</option>`,
      ...adjacentSizes.map((size) => `<option value="${size}">${escapeNaturewalkHtml(sizeLabel(size))}</option>`)
    ].join("");

    const result = await foundry.applications.api.DialogV2.wait({
      classes: ["dda", "dda-core-quality-dialog", "dda-mode-change-pair-dialog"],
      position: { width: 520, height: "auto" },
      window: {
        title: english
          ? `Mode Change — Rank ${rankNumber}`
          : `Mudança de Modo — Rank ${rankNumber}`
      },
      modal: true,
      content: `
        <form class="dda-core-choice-dialog dda-mode-change-pair-form">
          <header class="dda-core-choice-dialog__hero">
            <span>${english ? `Rank ${rankNumber}` : `Rank ${rankNumber}`}</span>
            <h2>${english ? "Choose the linked Core Stats" : "Escolha as Estatísticas Centrais vinculadas"}</h2>
            <p>${english
              ? "The two stats swap their values whenever the Digimon changes Mode. A stat cannot be selected twice."
              : "As duas estatísticas trocam seus valores quando o Digimon muda de Modo. Uma estatística não pode ser escolhida duas vezes."}</p>
          </header>
          <div class="dda-mode-change-pair-grid">
            <label>
              <span>${english ? "First stat" : "Primeira estatística"}</span>
              <select name="leftStat">${optionsHtml}</select>
            </label>
            <span class="dda-mode-change-pair-grid__arrow">↔</span>
            <label>
              <span>${english ? "Second stat" : "Segunda estatística"}</span>
              <select name="rightStat">${optionsHtml}</select>
            </label>
          </div>
          ${alreadySelectedSize ? "" : `
            <label class="dda-mode-change-size-choice">
              <span>${english ? "Optional Mode Size" : "Tamanho opcional do Modo"}</span>
              <select name="modeSize">${sizeOptionsHtml}</select>
              <small>${english
                ? "Only a Size one step larger or smaller and available at this Stage is offered."
                : "Somente um Tamanho um passo maior ou menor e disponível neste Estágio é oferecido."}</small>
            </label>
          `}
        </form>
      `,
      buttons: [
        {
          action: "confirm",
          label: game.i18n.localize("DDA.Button.Confirm"),
          icon: "fa-solid fa-check",
          default: true,
          callback: (_event, button) => ({
            leftStat: String(button.form?.elements?.leftStat?.value ?? "").trim(),
            rightStat: String(button.form?.elements?.rightStat?.value ?? "").trim(),
            modeSize: String(button.form?.elements?.modeSize?.value ?? "").trim()
          })
        },
        {
          action: "cancel",
          label: game.i18n.localize("DDA.Button.Cancel"),
          icon: "fa-solid fa-xmark",
          callback: () => null
        }
      ],
      rejectClose: false,
      close: () => null
    });

    if (!result?.leftStat || !result?.rightStat || result.leftStat === result.rightStat) {
      if (result) {
        ui.notifications.warn(english
          ? "Mode Change requires two different Core Stats."
          : "Mudança de Modo exige duas Estatísticas Centrais diferentes.");
      }
      return null;
    }

    const stats = [result.leftStat, result.rightStat];
    return {
      rank: rankNumber,
      key: stats.join(":"),
      label: `${labelFor(stats[0])} ↔ ${labelFor(stats[1])}`,
      originalLabel: stats.join(" ↔ "),
      stats,
      leftStat: stats[0],
      rightStat: stats[1],
      modeSize: result.modeSize,
      sizeDirection: result.modeSize
        ? (sizeOrder.indexOf(result.modeSize) > defaultSizeIndex ? "larger" : "smaller")
        : "same"
    };
  }

  async _buildFreeGrant({
    qualityId,
    sourceKey,
    entitlementRanks = 1,
    mode = "add",
    targetRank = 0
  } = {}) {
    const definition = DDA_DIGIMON_QUALITIES.find((entry) => entry.id === qualityId);
    if (!definition) return false;

    const ownedItem = this._getOwnedQualityBySourceId(qualityId);
    const currentRank = Math.max(0, Number(ownedItem?.system?.rank?.value ?? 0));
    const existingChoices = Array.isArray(ownedItem?.system?.choices?.selectedRanks)
      ? foundry.utils.deepClone(ownedItem.system.choices.selectedRanks)
      : [];
    const maximum = Math.max(1, this._getQualityEffectiveMax(definition, ownedItem));
    const otherFreeRanks = this._getFreeRankSourceTotal(ownedItem, sourceKey);

    let desiredRank = currentRank;
    if (mode === "ensure") {
      desiredRank = Math.max(currentRank, Math.min(maximum, Math.max(1, Number(targetRank ?? entitlementRanks))));
    } else if (otherFreeRanks < currentRank) {
      // Convert an already-paid Rank into the granted free Rank before adding a new one.
      desiredRank = currentRank;
    } else {
      desiredRank = Math.min(maximum, currentRank + Math.max(1, Number(entitlementRanks ?? 1)));
    }

    const assignableFreeRanks = Math.max(0, desiredRank - otherFreeRanks);
    const sourceRanks = Math.min(
      Math.max(1, Number(entitlementRanks ?? 1)),
      assignableFreeRanks
    );

    if (sourceRanks <= 0) {
      return {
        qualityId,
        sourceKey,
        ranks: 0,
        targetRank: currentRank,
        choices: []
      };
    }

    const choices = [];
    const ranksToCreate = Math.max(0, desiredRank - currentRank);
    const combinedChoices = [...existingChoices];

    for (let offset = 0; offset < ranksToCreate; offset += 1) {
      const rankNumber = currentRank + offset + 1;
      let choice = null;

      if (definition.choices?.type === "modeChangePairsPerRank") {
        choice = await this._promptModeChangePair(rankNumber, combinedChoices);
      } else if (definition.choices?.required) {
        choice = await this._promptQualityChoice(definition, rankNumber, combinedChoices);
      }

      if (definition.choices?.required && !choice) return false;
      if (choice) {
        choices.push(choice);
        combinedChoices.push(choice);
      }
    }

    return {
      qualityId,
      sourceKey,
      ranks: sourceRanks,
      targetRank: desiredRank,
      choices
    };
  }

  async _prepareDataSpecializationFreeGrant(selected = {}) {
    const english = isQualityBrowserEnglish();
    const sourceKey = `dataSpecialization:${selected.key}`;
    const directGrantId = {
      fistfulOfForce: "areaDeAtaque",
      mobileArtillery: "areaDeAtaque",
      trySomething: "contraAtaque",
      wrestlemania: "periciaProdigiosa"
    }[selected.key] ?? "";

    if (directGrantId) {
      return this._buildFreeGrant({
        qualityId: directGrantId,
        sourceKey,
        entitlementRanks: 1,
        mode: "add"
      });
    }

    if (selected.key === "hitAndRun") {
      const definition = await this._chooseFreeGrantDefinition({
        title: selected.label,
        hint: english
          ? "Choose the Quality granted for free. If you already own it, its paid Rank is converted into the free Rank."
          : "Escolha a Qualidade concedida gratuitamente. Se você já a possuir, o Rank pago é convertido em Rank gratuito.",
        definitions: ["ataqueDeInvestida", "recuoPesado"].map((id) => {
          return DDA_DIGIMON_QUALITIES.find((entry) => entry.id === id);
        })
      });
      if (!definition) return false;
      return this._buildFreeGrant({
        qualityId: definition.id,
        sourceKey,
        entitlementRanks: 1,
        mode: "ensure",
        targetRank: 1
      });
    }

    if (selected.key === "tacticalAdaptation") {
      const modeDefinition = DDA_DIGIMON_QUALITIES.find((entry) => entry.id === "mudancaDeModo");
      const stanceDefinitions = DDA_DIGIMON_QUALITIES.filter((entry) => {
        return ["Stance Qualities", "Qualidades de Postura"].includes(entry.section);
      });
      const grantDefinitions = [
        ...stanceDefinitions,
        modeDefinition && {
          ...modeDefinition,
          name: english ? "Mode Change — 2 Ranks" : "Mudança de Modo — 2 Ranks",
          originalName: "Mode Change — 2 Ranks"
        }
      ].filter(Boolean);

      const definition = await this._chooseFreeGrantDefinition({
        title: selected.label,
        hint: english
          ? "Choose one Stance Quality for free, or take both Ranks of Mode Change for free."
          : "Escolha uma Qualidade de Postura gratuitamente ou receba os dois Ranks de Mudança de Modo gratuitamente.",
        definitions: grantDefinitions
      });
      if (!definition) return false;

      const isModeChange = definition.id === "mudancaDeModo";
      return this._buildFreeGrant({
        qualityId: definition.id,
        sourceKey,
        entitlementRanks: isModeChange ? 2 : 1,
        mode: "ensure",
        targetRank: isModeChange ? 2 : 1
      });
    }

    return null;
  }

  async _applyDataSpecializationFreeGrant(dataSpecializationItem, choice = null) {
    const grant = choice?.freeGrant;
    if (!grant?.qualityId || !grant?.sourceKey || Number(grant.ranks ?? 0) <= 0) return;

    const definition = DDA_DIGIMON_QUALITIES.find((entry) => entry.id === grant.qualityId);
    if (!definition) return;

    let ownedItem = this._getOwnedQualityBySourceId(grant.qualityId);
    const existingSources = Array.isArray(ownedItem?.system?.cost?.freeRankSources)
      ? foundry.utils.deepClone(ownedItem.system.cost.freeRankSources)
      : [];

    if (existingSources.some((entry) => String(entry?.key ?? entry) === grant.sourceKey)) return;

    const sourceRecord = {
      key: grant.sourceKey,
      sourceItemId: dataSpecializationItem?.id ?? "",
      sourceItemName: dataSpecializationItem?.name ?? "",
      specialization: choice.key,
      ranks: Math.max(1, Number(grant.ranks ?? 1))
    };
    const grantedChoices = Array.isArray(grant.choices)
      ? foundry.utils.deepClone(grant.choices)
      : grant.choice
        ? [foundry.utils.deepClone(grant.choice)]
        : [];

    if (!ownedItem) {
      const itemData = buildQualityItemData(definition);
      const targetRank = Math.max(1, Number(grant.targetRank ?? sourceRecord.ranks));
      itemData.system.rank = {
        ...(itemData.system.rank ?? {}),
        value: targetRank
      };
      itemData.system.cost = {
        ...(itemData.system.cost ?? {}),
        freeRanks: Math.min(targetRank, sourceRecord.ranks),
        freeRankSources: [sourceRecord]
      };

      if (grantedChoices.length) {
        itemData.system.choices = {
          ...(itemData.system.choices ?? {}),
          selectedRanks: grantedChoices
        };
      }

      [ownedItem] = await this.actor.createEmbeddedDocuments("Item", [itemData]);
    } else {
      const existingChoices = Array.isArray(ownedItem.system?.choices?.selectedRanks)
        ? foundry.utils.deepClone(ownedItem.system.choices.selectedRanks)
        : [];
      existingChoices.push(...grantedChoices);

      const nextSources = [...existingSources, sourceRecord];
      const nextRank = Math.max(
        Number(ownedItem.system?.rank?.value ?? 0),
        Number(grant.targetRank ?? 0)
      );
      const sourceTotal = nextSources.reduce((total, entry) => {
        return total + Math.max(0, Number(entry?.ranks ?? 1));
      }, 0);
      const update = {
        "system.rank.value": nextRank,
        "system.cost.freeRanks": Math.min(nextRank, sourceTotal),
        "system.cost.freeRankSources": nextSources
      };
      if (grantedChoices.length) update["system.choices.selectedRanks"] = existingChoices;
      await ownedItem.update(update);
    }

    for (const grantedChoice of grantedChoices) {
      await this._applyAttackChoiceToAttack(ownedItem, grantedChoice);
    }

    const rankLabel = sourceRecord.ranks === 1
      ? (isQualityBrowserEnglish() ? "1 free Rank" : "1 Rank gratuito")
      : (isQualityBrowserEnglish()
        ? `${sourceRecord.ranks} free Ranks`
        : `${sourceRecord.ranks} Ranks gratuitos`);
    ui.notifications.info(isQualityBrowserEnglish()
      ? `${definition.name} gained ${rankLabel} from ${choice.label}.`
      : `${definition.name} recebeu ${rankLabel} de ${choice.label}.`);
  }

  _getOverclockChoiceOptions() {
    const allowedPotencyStats = new Set(["bit", "dos", "ram", "cpu"]);
    const actorStageValue = Number(this.actor?.system?.stageValue ?? 0);

    const purchasedEffectTags = new Set();
    for (const item of this.actor?.items ?? []) {
      if (item.type !== "quality") continue;
      for (const choice of item.system?.choices?.selectedRanks ?? []) {
        const key = String(choice?.key ?? "");
        const tag = String(
          choice?.effectTag ??
          choice?.attackTag ??
          (key.includes(":") ? key.slice(key.indexOf(":") + 1) : "")
        ).trim().replace(/^\[|\]$/g, "").toLowerCase();
        if (tag && EFFECT_TAGS[tag]) purchasedEffectTags.add(tag);
      }
    }

    const sourceIds = ["efeitoBasico", "efeitoAvancado", "efeitoMestre"];
    const options = [];

    for (const sourceId of sourceIds) {
      const sourceQuality = DDA_DIGIMON_QUALITIES.find((entry) => entry.id === sourceId);
      if (!sourceQuality) continue;
      if (actorStageValue < this._getQualityMinimumStageValue(sourceQuality)) continue;

      const effectDpCost = Math.max(0, Number(sourceQuality.cost?.dp ?? 0));
      for (const effect of sourceQuality.choices?.options ?? []) {
        const effectTag = String(effect.key ?? "").trim().toLowerCase();
        const potencyStat = String(effect.potency ?? "").trim().toLowerCase();
        const effectType = String(effect.type ?? EFFECT_TAGS[effectTag]?.type ?? "").toLowerCase();

        if (effectType !== "positive" || !allowedPotencyStats.has(potencyStat)) continue;
        if (purchasedEffectTags.has(effectTag)) continue;

        options.push({
          ...foundry.utils.deepClone(effect),
          key: `overclock:${sourceId}:${effectTag}`,
          label: `${effect.label ?? effect.originalLabel ?? effectTag.toUpperCase()} · ${potencyStat.toUpperCase()} · ${effectDpCost} PD${effect.extraActionRequired ? ` · +1 ${isQualityBrowserEnglish() ? "Action" : "Ação"}` : ""}`,
          originalLabel: String(effect.originalLabel ?? effect.label ?? effectTag),
          sourceQualityId: sourceId,
          sourceQualityName: sourceQuality.name,
          effectTag,
          effectType: "positive",
          potencyStat,
          duration: effect.duration ?? true,
          extraActionRequired: Boolean(effect.extraActionRequired),
          effectDpCost
        });
      }
    }

    return options;
  }

async _promptQualityChoice(quality, rankNumber, existingChoices = []) {
  const choices = quality.choices ?? {};

  if (!choices.required) {
    return null;
  }

  if (choices.type === "modeChangePairsPerRank") {
    return this._promptModeChangePair(rankNumber, existingChoices);
  }

  if (getCoreQualityId(quality) === CORE_QUALITY_IDS.dataSpecialization) {
    return this._promptDataSpecializationChoice(quality, rankNumber, existingChoices);
  }

const modifier =
  quality.attackModifier ?? {};

const grantsTags =
  Array.isArray(
    modifier.grantsTags
  )
    ? modifier.grantsTags
    : [];

const isAreaAttackChoice =
  quality.id === "areaDeAtaque" ||
  Boolean(
    modifier.areaAttack
  ) ||
  (
    String(
      modifier.appliesTo ?? ""
    ) === "differentAttackPerRank" &&

    grantsTags.some((tag) => {
      return String(tag)
        .trim()
        .toLowerCase()
        .startsWith("t:");
    })
  );

const isAttackChoice =
  isAreaAttackChoice ||
  isElementalForceQualityData(quality) ||
  [
    "singleAttack",
    "attackTag",
    "effectTagPerRank",
    "attackWithPiercing",
    "attackWithCertain",
    "signatureMove"
  ].includes(
    choices.type
  );

  const isOverclockChoice = choices.type === "positiveCasterDerivedEffect";

  let rawOptions = isAttackChoice
    ? this._getAttackChoiceOptionsForQuality(quality, existingChoices)
    : isOverclockChoice
      ? this._getOverclockChoiceOptions()
      : Array.isArray(choices.options)
        ? choices.options
        : [];

  const isAdvancedMobility = getCoreQualityId(quality) === CORE_QUALITY_IDS.advancedMobility;

  if (isAdvancedMobility) {
    rawOptions = getAvailableAdvancedMobilityOptions(
      this.actor,
      rawOptions,
      existingChoices
    );
  }

  let options = rawOptions.map((option) => {
    return typeof option === "string"
      ? {
          key: choices.type === "twoElementsPerRank"
            ? normalizeQualityBrowserElementKey(option)
            : normalizeQualityBrowserIdentity(option),
          label: choices.type === "derivedStatPerRank" ? option.toUpperCase() : option,
          originalLabel: option
        }
      : option;
  }).filter((option) => {
    return isAdvancedMobility || this._actorMeetsChoiceOptionRequirements(option);
  });

  if (choices.type === "derivedStatPerRank" && choices.cannotChooseStatsAffectedBySystemBoost) {
    const systemBoost = this._getOwnedQualityBySourceId?.("impulsoDeSistema") ??
      this.actor?.items?.find((item) => qualityBrowserMatches({}, item, ["impulsoDeSistema", "systemBoost"]));
    const boostedStats = new Set(
      (systemBoost?.system?.choices?.selectedRanks ?? [])
        .map((choice) => normalizeQualityBrowserIdentity(choice?.key ?? choice?.label ?? ""))
        .filter(Boolean)
    );
    options = options.filter((option) => !boostedStats.has(
      normalizeQualityBrowserIdentity(option?.key ?? option?.label ?? "")
    ));
  }

  if (!options.length) {
    ui.notifications.warn(game.i18n.format(isAttackChoice ? "DDA.Warning.QualityChoiceHasNoAttacks" : "DDA.Warning.QualityChoiceHasNoOptions", {
      quality: quality.name
    }));
    return null;
  }

const usedKeys = new Set(
  existingChoices
    .map((choice) => {
      return choice.key;
    })
    .filter(Boolean)
);

const availableOptions =
  isAttackChoice
    ? options
    : options.filter((option) => {
        if (!choices.cannotRepeat) {
          return true;
        }

        return !usedKeys.has(
          option.key
        );
      });

    if (!availableOptions.length) {
      ui.notifications.warn(
        game.i18n.format(
          "DDA.Warning.QualityNoAvailableOptions",
          {
            quality:
              quality.name
          }
        )
      );

      return null;
    }

    /*
     * Naturewalk exige duas escolhas por Rank:
     *
     * 1. Um Elemento ainda não escolhido.
     * 2. Um Core Stat que receberá +1.
     */
    if (
      isNaturewalkQualityData(
        quality
      )
    ) {
      const elementOptionsHtml =
        availableOptions
          .map((option) => {
            const label =
              option.label ??
              option.originalLabel ??
              option.key;

            return `
              <option value="${escapeNaturewalkHtml(
                option.key
              )}">
                ${escapeNaturewalkHtml(
                  label
                )}
              </option>
            `;
          })
          .join("");

      const mainStatUseCount = existingChoices.reduce((counts, choice) => {
        const stat = String(choice?.mainStat ?? "").trim();
        if (stat) counts[stat] = Number(counts[stat] ?? 0) + 1;
        return counts;
      }, {});

      const availableMainStats = NATUREWALK_MAIN_STATS.filter((stat) => {
        return Number(mainStatUseCount[stat.key] ?? 0) < 2;
      });

      const mainStatOptionsHtml =
        availableMainStats
          .map((stat) => {
            return `
              <option value="${stat.key}">
                ${escapeNaturewalkHtml(
                  game.i18n.localize(
                    stat.labelKey
                  )
                )}
              </option>
            `;
          })
          .join("");

      let selection =
        null;

      try {
        selection =
          await foundry
            .applications
            .api
            .DialogV2
            .prompt({
              window: {
                title:
                  game.i18n.format(
                    "DDA.QualityBrowser.ChoiceDialogTitle",
                    {
                      quality:
                        quality.name,

                      rank:
                        rankNumber
                    }
                  )
              },

              content: `
                <div class="dda-quality-choice-form dda-naturewalk-choice-dialog">
                  <p>
                    ${game.i18n.format(
                      "DDA.Naturewalk.ChoiceHint",
                      {
                        rank:
                          rankNumber
                      }
                    )}
                  </p>

                  <div class="form-group">
                    <label>
                      ${game.i18n.localize(
                        "DDA.Naturewalk.Element"
                      )}
                    </label>

                    <select name="elementKey">
                      ${elementOptionsHtml}
                    </select>
                  </div>

                  <div class="form-group">
                    <label>
                      ${game.i18n.localize(
                        "DDA.Naturewalk.CoreStat"
                      )}
                    </label>

                    <select name="mainStat">
                      ${mainStatOptionsHtml}
                    </select>
                  </div>

                  <p class="notes">
                    ${game.i18n.localize(
                      "DDA.Naturewalk.CoreStatHint"
                    )}
                  </p>
                </div>
              `,

              ok: {
                label:
                  game.i18n.localize(
                    "DDA.Button.Confirm"
                  ),

                callback:
                  (_event, button) => {
                    return {
                      elementKey:
                        String(
                          button.form
                            .elements
                            .elementKey
                            ?.value ??
                          ""
                        ).trim(),

                      mainStat:
                        String(
                          button.form
                            .elements
                            .mainStat
                            ?.value ??
                          ""
                        ).trim()
                    };
                  }
              },

              rejectClose:
                false,

              modal:
                true
            });
      } catch (_error) {
        selection =
          null;
      }

      if (
        !selection?.elementKey ||
        !selection?.mainStat
      ) {
        return null;
      }

      const selectedOption =
        availableOptions.find(
          (option) => {
            return (
              String(
                option.key ?? ""
              ) ===
              selection.elementKey
            );
          }
        );

      const selectedStat =
        availableMainStats.find(
          (stat) => {
            return (
              stat.key ===
              selection.mainStat
            );
          }
        );

      if (
        !selectedOption ||
        !selectedStat
      ) {
        return null;
      }

      return {
        rank:
          rankNumber,

        key:
          selectedOption.key,

        label:
          selectedOption.label ??
          selectedOption.key,

        originalLabel:
          selectedOption.originalLabel ??
          "",

        mainStat:
          selectedStat.key,

        mainStatLabel:
          game.i18n.localize(
            selectedStat.labelKey
          ),

        terrain:
          selectedOption.terrain ??
          "",

        recommendedFor:
          selectedOption.recommendedFor ??
          "",

        effect:
          selectedOption.effect ??
          ""
      };
    }

    if (choices.type === "twoElementsPerRank") {
      const naturewalkElements = new Set(
        (this.actor?.system?.qualityFeatures?.naturewalk?.elements ?? [])
          .map(normalizeQualityBrowserElementKey)
      );
      const alreadyChosen = new Set(
        existingChoices.flatMap((choice) => choice?.elements ?? [])
          .map((element) => normalizeQualityBrowserElementKey(element?.key ?? element?.label ?? element))
      );
      const eligible = availableOptions.filter((option) => {
        const key = normalizeQualityBrowserElementKey(option.key);
        return key && !naturewalkElements.has(key) && !alreadyChosen.has(key);
      });

      if (eligible.length < 2) {
        ui.notifications.warn(game.i18n.localize("DDA.Warning.QualityNoAvailableOptions"));
        return null;
      }

      let selectedKeys = null;
      try {
        selectedKeys = await foundry.applications.api.DialogV2.prompt({
      classes: ["dda", "dda-area-attack-dialog", "dda-offensive-quality-window"],
          window: { title: `${quality.name} — Rank ${rankNumber}` },
          content: `<div class="dda-quality-choice-form">
            <p>${isQualityBrowserEnglish() ? "Choose exactly two non-Naturewalk Elements." : "Escolha exatamente dois Elementos que não sejam Naturewalk."}</p>
            ${eligible.map((option) => `<label><input type="checkbox" name="elements" value="${escapeNaturewalkHtml(option.key)}"> ${escapeNaturewalkHtml(option.label)}</label>`).join("")}
          </div>`,
          ok: {
            label: game.i18n.localize("DDA.Button.Confirm"),
            callback: (_event, button) => [...button.form.querySelectorAll('[name="elements"]:checked')].map((input) => input.value)
          },
          rejectClose: false,
          modal: true
        });
      } catch (_error) {
        selectedKeys = null;
      }

      if (!Array.isArray(selectedKeys) || selectedKeys.length !== 2) {
        ui.notifications.warn(isQualityBrowserEnglish() ? "Choose exactly two Elements." : "Escolha exatamente dois Elementos.");
        return null;
      }

      const elements = selectedKeys.map((key) => {
        const canonicalKey = normalizeQualityBrowserElementKey(key);
        const option = eligible.find((entry) => normalizeQualityBrowserElementKey(entry.key) === canonicalKey);
        return { key: canonicalKey, label: option.label, originalLabel: option.originalLabel ?? option.label };
      });

      return {
        rank: rankNumber,
        key: elements.map((element) => element.key).join("+"),
        label: elements.map((element) => element.label).join(" + "),
        elements
      };
    }

        /*
     * Basic / Advanced / Master Effect:
     * mostra cada Efeito uma vez e deixa a escolha do Ataque para o painel
     * de detalhes. Isso evita repetir a mesma descrição para cada Ataque.
     */
    if (
      String(choices.type ?? "") ===
      "effectTagPerRank"
    ) {
      const english =
        isQualityBrowserEnglish();

      const groupsByTag =
        new Map();

      const effectGroups = [];

      for (
        const option of
        availableOptions
      ) {
        const tag = String(
          option.effectTag ??
          option.attackTag ??
          ""
        )
          .trim()
          .toLowerCase();

        if (!tag) continue;

        let group =
          groupsByTag.get(tag);

        if (!group) {
          group = {
            tag,

            type: String(
              option.effectType ??
              option.type ??
              "unique"
            ).toLowerCase(),

            potencyStat: String(
              option.potencyStat ??
              option.potency ??
              ""
            ),

            duration:
              option.duration,

            effect: String(
              option.effect ?? ""
            ),

            options: []
          };

          groupsByTag.set(
            tag,
            group
          );

          effectGroups.push(
            group
          );
        }

        group.options.push(
          option
        );
      }

      if (!effectGroups.length) {
        ui.notifications.warn(
          english
            ? "There are no Effects compatible with the remaining Attacks."
            : "Não há Efeitos compatíveis com os Ataques restantes."
        );

        return null;
      }

      const typeLabels = english
        ? {
            negative: "Negative",
            positive: "Positive",
            damage: "Damage",
            unique: "Special"
          }
        : {
            negative: "Negativo",
            positive: "Positivo",
            damage: "Dano",
            unique: "Especial"
          };

      const getDurationLabel = (
        duration
      ) => {
        if (duration === true) {
          return english
            ? "Up to 3 rounds"
            : "Até 3 rodadas";
        }

        if (
          duration === "special"
        ) {
          return english
            ? "Special"
            : "Especial";
        }

        return english
          ? "Instant"
          : "Instantâneo";
      };

      const cardsHtml =
        effectGroups
          .map((group) => {
            const potency =
              group.potencyStat
                ? group.potencyStat
                    .toUpperCase()
                : "—";

            return `
              <button
                type="button"
                class="
                  dda-effect-picker__card
                  dda-effect-picker__card--${escapeNaturewalkHtml(
                    group.type
                  )}
                "
                data-effect-card="${escapeNaturewalkHtml(
                  group.tag
                )}"
              >
                <span class="dda-effect-picker__tag">
                  [${escapeNaturewalkHtml(
                    group.tag.toUpperCase()
                  )}]
                </span>

                <span class="dda-effect-picker__kind">
                  ${escapeNaturewalkHtml(
                    typeLabels[group.type] ??
                    typeLabels.unique
                  )}
                </span>

                <span class="dda-effect-picker__meta">
                  ${english
                    ? "Potency"
                    : "Potência"}:
                  ${escapeNaturewalkHtml(
                    potency
                  )}
                </span>

                <span class="dda-effect-picker__available">
                  ${group.options.length}
                  ${english
                    ? "attack(s)"
                    : "ataque(s)"}
                </span>
              </button>
            `;
          })
          .join("");

      const filterHtml = [
        "all",
        "negative",
        "positive",
        "damage",
        "unique"
      ]
        .map((type) => {
          const label =
            type === "all"
              ? (
                  english
                    ? "All"
                    : "Todos"
                )
              : (
                  typeLabels[type] ??
                  type
                );

          return `
            <button
              type="button"
              class="
                dda-effect-picker__filter
                ${type === "all"
                  ? "is-active"
                  : ""}
              "
              data-effect-filter="${type}"
            >
              ${escapeNaturewalkHtml(
                label
              )}
            </button>
          `;
        })
        .join("");

      const selectedKey = await DialogV2.wait({
        classes: ["dda", "dda-effect-choice-dialog"],
        position: { width: 780, height: "auto" },
        window: {
          title: game.i18n.format(
            "DDA.QualityBrowser.ChoiceDialogTitle",
            { quality: quality.name, rank: rankNumber }
          )
        },
        modal: true,
        content: `
                  <div class="dda-effect-picker">
                    <header class="dda-effect-picker__header">
                      <span class="dda-effect-picker__eyebrow">
                        ${english
                          ? `Rank ${rankNumber} configuration`
                          : `Configuração do Rank ${rankNumber}`}
                      </span>

                      <h2>
                        ${english
                          ? "Choose an Effect"
                          : "Escolha um Efeito"}
                      </h2>

                      <p>
                        ${english
                          ? "Select an Effect, review its rules, then choose a compatible Attack."
                          : "Selecione um Efeito, confira suas regras e escolha um Ataque compatível."}
                      </p>
                    </header>

                    <div class="dda-effect-picker__toolbar">
                      <label class="dda-effect-picker__search-wrapper">
                        <i class="fas fa-search"></i>

                        <input
                          type="search"
                          class="dda-effect-picker__search"
                          autocomplete="off"
                          placeholder="${english
                            ? "Search effect..."
                            : "Buscar efeito..."}"
                        >
                      </label>

                      <div class="dda-effect-picker__filters">
                        ${filterHtml}
                      </div>
                    </div>

                    <div class="dda-effect-picker__layout">
                      <section class="dda-effect-picker__catalog">
                        <div class="dda-effect-picker__cards">
                          ${cardsHtml}
                        </div>

                        <div class="dda-effect-picker__empty">
                          <i class="fas fa-filter-circle-xmark"></i>

                          <span>
                            ${english
                              ? "No Effect matches this search."
                              : "Nenhum Efeito corresponde a essa busca."}
                          </span>
                        </div>
                      </section>

                      <section class="dda-effect-picker__detail">
                        <div class="dda-effect-picker__detail-heading">
                          <span class="dda-effect-picker__selected-label">
                            ${english
                              ? "Selected effect"
                              : "Efeito selecionado"}
                          </span>

                          <h3 data-effect-title></h3>
                        </div>

                        <div class="dda-effect-picker__facts">
                          <div class="dda-effect-picker__fact">
                            <strong>
                              ${english
                                ? "Type"
                                : "Tipo"}
                            </strong>

                            <span data-effect-kind></span>
                          </div>

                          <div class="dda-effect-picker__fact">
                            <strong>
                              ${english
                                ? "Potency"
                                : "Potência"}
                            </strong>

                            <span data-effect-potency></span>
                          </div>

                          <div class="dda-effect-picker__fact">
                            <strong>
                              ${english
                                ? "Duration"
                                : "Duração"}
                            </strong>

                            <span data-effect-duration></span>
                          </div>

                          <div class="dda-effect-picker__fact">
                            <strong>
                              ${english
                                ? "Attacks"
                                : "Ataques"}
                            </strong>

                            <span data-effect-count></span>
                          </div>
                        </div>

                        <div class="dda-effect-picker__rules">
                          <strong>
                            ${english
                              ? "Effect rules"
                              : "Regras do Efeito"}
                          </strong>

                          <p data-effect-description></p>
                        </div>

                        <label class="dda-effect-picker__attack">
                          <span>
                            ${english
                              ? "Apply this Effect to"
                              : "Aplicar este Efeito em"}
                          </span>

                          <select name="choiceKey"></select>
                        </label>

                        <p class="dda-effect-picker__rank-note">
                          ${game.i18n.format(
                            "DDA.QualityBrowser.ChoiceRegisteredRank",
                            {
                              rank:
                                rankNumber
                            }
                          )}
                        </p>
                      </section>
                    </div>
                  </div>
                `,
        buttons: [
          {
            action: "confirm",
            icon: "fa-solid fa-check",
            label: game.i18n.localize("DDA.Button.Confirm"),
            default: true,
            callback: (_event, button) => String(
              button.form?.elements?.choiceKey?.value ?? ""
            ) || null
          },
          {
            action: "cancel",
            icon: "fa-solid fa-xmark",
            label: game.i18n.localize("DDA.Button.Cancel"),
            callback: () => null
          }
        ],
        render: (_event, dialog) => {
          const html = $(dialog.element);
                  const search =
                    html.find(
                      ".dda-effect-picker__search"
                    );

                  const cards =
                    html.find(
                      "[data-effect-card]"
                    );

                  const attackSelect =
                    html.find(
                      "[name='choiceKey']"
                    );

                  const selectGroup = (
                    tag
                  ) => {
                    const group =
                      groupsByTag.get(tag);

                    if (!group) return;

                    selectedTag =
                      tag;

                    cards.removeClass(
                      "is-selected"
                    );

                    cards
                      .filter(
                        `[data-effect-card="${tag}"]`
                      )
                      .addClass(
                        "is-selected"
                      );

                    html
                      .find(
                        "[data-effect-title]"
                      )
                      .text(
                        `[${tag.toUpperCase()}]`
                      );

                    html
                      .find(
                        "[data-effect-kind]"
                      )
                      .text(
                        typeLabels[
                          group.type
                        ] ??
                        typeLabels.unique
                      );

                    html
                      .find(
                        "[data-effect-potency]"
                      )
                      .text(
                        group.potencyStat
                          ? group.potencyStat
                              .toUpperCase()
                          : "—"
                      );

                    html
                      .find(
                        "[data-effect-duration]"
                      )
                      .text(
                        getDurationLabel(
                          group.duration
                        )
                      );

                    html
                      .find(
                        "[data-effect-count]"
                      )
                      .text(
                        group.options.length
                      );

                    html
                      .find(
                        "[data-effect-description]"
                      )
                      .text(
                        group.effect ||
                        (
                          english
                            ? "No description available."
                            : "Nenhuma descrição disponível."
                        )
                      );

                    attackSelect.empty();

                    for (
                      const option of
                      group.options
                    ) {
                      const element =
                        document.createElement(
                          "option"
                        );

                      element.value =
                        option.key;

                      element.textContent =
                        option.attackName ??
                        option.label ??
                        option.key;

                      attackSelect.append(
                        element
                      );
                    }
                  };

                  const applyFilters =
                    () => {
                      const query =
                        normalizeQualityBrowserIdentity(
                          search.val()
                        );

                      let firstVisibleTag =
                        "";

                      let selectedIsVisible =
                        false;

                      cards.each(
                        (
                          _index,
                          element
                        ) => {
                          const card =
                            $(element);

                          const tag =
                            String(
                              card.data(
                                "effectCard"
                              ) ??
                              ""
                            );

                          const group =
                            groupsByTag.get(
                              tag
                            );

                          const matchesType =
                            activeFilter ===
                              "all" ||
                            group?.type ===
                              activeFilter;

                          const haystack =
                            normalizeQualityBrowserIdentity(
                              [
                                tag,
                                group?.effect ??
                                  "",
                                typeLabels[
                                  group?.type
                                ] ??
                                  ""
                              ].join(" ")
                            );

                          const visible =
                            matchesType &&
                            (
                              !query ||
                              haystack.includes(
                                query
                              )
                            );

                          card.toggle(
                            visible
                          );

                          if (
                            visible &&
                            !firstVisibleTag
                          ) {
                            firstVisibleTag =
                              tag;
                          }

                          if (
                            visible &&
                            tag === selectedTag
                          ) {
                            selectedIsVisible =
                              true;
                          }
                        }
                      );

                      html
                        .find(
                          ".dda-effect-picker__empty"
                        )
                        .toggle(
                          !firstVisibleTag
                        );

                      if (
                        !selectedIsVisible &&
                        firstVisibleTag
                      ) {
                        selectGroup(
                          firstVisibleTag
                        );
                      }
                    };

                  cards.on(
                    "click",
                    (event) => {
                      event.preventDefault();

                      selectGroup(
                        String(
                          event
                            .currentTarget
                            .dataset
                            .effectCard ??
                          ""
                        )
                      );
                    }
                  );

                  html
                    .find(
                      "[data-effect-filter]"
                    )
                    .on(
                      "click",
                      (event) => {
                        event.preventDefault();

                        activeFilter =
                          String(
                            event
                              .currentTarget
                              .dataset
                              .effectFilter ??
                            "all"
                          );

                        html
                          .find(
                            "[data-effect-filter]"
                          )
                          .removeClass(
                            "is-active"
                          );

                        $(
                          event.currentTarget
                        ).addClass(
                          "is-active"
                        );

                        applyFilters();
                      }
                    );

                  search.on(
                    "input",
                    applyFilters
                  );

                  selectGroup(
                    selectedTag
                  );
        },
        rejectClose: false
      });

      if (!selectedKey) {
        return null;
      }

      const selectedOption =
        availableOptions.find(
          (option) => {
            return (
              String(option.key) ===
              String(selectedKey)
            );
          }
        );

      if (!selectedOption) {
        return null;
      }

      return {
        rank:
          rankNumber,

        key:
          selectedOption.key,

        label:
          selectedOption.label ??
          selectedOption.key,

        originalLabel:
          selectedOption.originalLabel ??
          "",

        derivedStat:
          selectedOption.derivedStat ??
          "",

        attackId:
          selectedOption.attackId ??
          "",

        attackName:
          selectedOption.attackName ??
          "",

        attackTag:
          selectedOption.attackTag ??
          "",

        effectTag:
          selectedOption.effectTag ??
          "",

        effectType:
          selectedOption.effectType ??
          selectedOption.type ??
          "",

        potencyStat:
          selectedOption.potencyStat ??
          selectedOption.potency ??
          "",

        duration:
          selectedOption.duration ??
          true,

        extraActionRequired:
          Boolean(
            selectedOption
              .extraActionRequired
          ),

        requiresDamageTag:
          Boolean(
            selectedOption
              .requiresDamageTag
          ),

        onlyAffectsAllies:
          Boolean(
            selectedOption
              .onlyAffectsAllies
          ),

        effect:
          selectedOption.effect ??
          ""
      };
    }

    const escape = foundry.utils.escapeHTML;
    const qualityIdentity = normalizeQualityBrowserIdentity(
      quality.id ?? quality.originalName ?? quality.name ?? ""
    );
    const isSystemBoost = ["impulsodesistema", "systemboost"].includes(qualityIdentity);

    const optionHtml = availableOptions
      .map((option) => {
        const label = escape(String(option.label ?? option.key));
        const key = escape(String(option.key));
        

        return `
          <option value="${key}">
            ${label}
          </option>
        `;
      })
      .join("");

    const systemBoostOptionsHtml = availableOptions
      .map((option, index) => {
        const key = escape(String(option.key));
        const label = escape(String(option.label ?? option.key));
        const effect = escape(String(option.effect ?? ""));

        return `
          <label class="dda-system-boost-option">
            <input type="radio" name="choiceKey" value="${key}" ${index === 0 ? "checked" : ""}>
            <span class="dda-system-boost-option-copy">
              <strong>${label}</strong>
              ${effect ? `<small>${effect}</small>` : ""}
            </span>
            <i class="fa-solid fa-microchip" aria-hidden="true"></i>
          </label>
        `;
      })
      .join("");

    const selectedKey = await foundry.applications.api.DialogV2.wait({
      classes: [
        "dda",
        "dda-quality-choice-dialog",
        ...(isSystemBoost ? ["dda-system-boost-choice-dialog"] : [])
      ],
      position: { width: isSystemBoost ? 620 : 520, height: "auto" },
      window: {
        title: game.i18n.format("DDA.QualityBrowser.ChoiceDialogTitle", {
          quality: quality.name,
          rank: rankNumber
        })
      },
      modal: true,
      content: isSystemBoost
        ? `
          <form class="dda-quality-choice-form dda-system-boost-choice-form">
            <header class="dda-system-boost-choice-hero">
              <span class="dda-system-boost-choice-icon"><i class="fa-solid fa-microchip"></i></span>
              <span>
                <strong>${escape(String(quality.name))}</strong>
                <small>${isQualityBrowserEnglish() ? "Choose the subsystem that receives the boost." : "Escolha o subsistema que receberá o impulso."}</small>
              </span>
              <b>${isQualityBrowserEnglish() ? "Rank" : "Rank"} ${rankNumber}</b>
            </header>
            <fieldset class="dda-system-boost-choice-grid">
              <legend>${escape(String(choices.label ?? game.i18n.localize("DDA.QualityBrowser.Choice")))}</legend>
              ${systemBoostOptionsHtml}
            </fieldset>
            <p class="notes">
              ${game.i18n.format("DDA.QualityBrowser.ChoiceRegisteredRank", { rank: rankNumber })}
            </p>
          </form>
        `
        : `
          <form class="dda-quality-choice-form">
            <div class="form-group">
              <label>${escape(String(choices.label ?? game.i18n.localize("DDA.QualityBrowser.Choice")))}</label>
              <select name="choiceKey">${optionHtml}</select>
            </div>
            <p class="notes">
              ${game.i18n.format("DDA.QualityBrowser.ChoiceRegisteredRank", { rank: rankNumber })}
            </p>
          </form>
        `,
      buttons: [
        {
          action: "confirm",
          label: game.i18n.localize("DDA.Button.Confirm"),
          icon: "fa-solid fa-check",
          default: true,
          callback: (_event, button) => String(
            button.form?.elements?.choiceKey?.value ?? ""
          ) || null
        },
        {
          action: "cancel",
          label: game.i18n.localize("DDA.Button.Cancel"),
          icon: "fa-solid fa-xmark",
          callback: () => null
        }
      ],
      rejectClose: false,
      close: () => null
    });

    if (!selectedKey) return null;

    const selectedOption = availableOptions.find((option) => option.key === selectedKey);

    if (!selectedOption) return null;

    let signatureBatteryAsUnalterable = false;
    const qualityKey = qualityIdentity;
    const selectedAttack = selectedOption.attackId
      ? this.actor?.items?.get(selectedOption.attackId)
      : null;

    if (
      ["perfuracaodearmadura", "armorpiercing"].includes(qualityKey) &&
      selectedAttack?.system?.isSignature
    ) {
      try {
        signatureBatteryAsUnalterable = Boolean(
          await foundry.applications.api.DialogV2.confirm({
          classes: ["dda", "dda-area-attack-dialog", "dda-offensive-quality-window"],
            window: {
              title: isQualityBrowserEnglish()
                ? "Armor Piercing — Signature Move"
                : "Perfuração de Armadura — Movimento Assinatura"
            },
            content: `<div class="dda-confirm-dialog dda-offensive-quality-dialog"><p>${isQualityBrowserEnglish()
              ? "Convert Signature Move Battery damage into Unalterable Damage, up to this Quality's Ranks? This choice is stored on the selected Attack binding."
              : "Converter o Dano da Bateria do Movimento Assinatura em Dano Inalterável, até o limite de Ranks desta Qualidade? Esta escolha ficará registrada no vínculo com o Ataque."}</p></div>`,
            yes: { label: isQualityBrowserEnglish() ? "Convert" : "Converter" },
            no: { label: isQualityBrowserEnglish() ? "Keep normal Damage" : "Manter Dano normal" },
            rejectClose: false,
            modal: true
          })
        );
      } catch (_error) {
        signatureBatteryAsUnalterable = false;
      }
    }

return {
  rank:
    rankNumber,

  key:
    selectedOption.key,

  label:
    selectedOption.label ??
    selectedOption.key,

  originalLabel:
    selectedOption.originalLabel ??
    "",

  derivedStat:
    selectedOption.derivedStat ??
    "",

  attackId:
    selectedOption.attackId ??
    "",

  attackName:
    selectedOption.attackName ??
    "",

  attackTag:
    selectedOption.attackTag ??
    "",

  effectTag:
    selectedOption.effectTag ??
    "",

  effectType:
    selectedOption.effectType ??
    selectedOption.type ??
    "",

  potencyStat:
    selectedOption.potencyStat ??
    selectedOption.potency ??
    "",

  duration:
    selectedOption.duration ??
    true,

  extraActionRequired:
    Boolean(
      selectedOption.extraActionRequired
    ),

  requiresDamageTag:
    Boolean(
      selectedOption.requiresDamageTag
    ),

  onlyAffectsAllies:
    Boolean(
      selectedOption.onlyAffectsAllies
    ),

  signatureBatteryAsUnalterable,

  effect:
    selectedOption.effect ??
    ""
};
  }



  async _applyAttackChoiceToAttack(qualityItem, choice) {
    if (!choice?.attackId || !choice?.attackTag) return;

    const attack = this.actor?.items?.get(choice.attackId);
    if (!attack || attack.type !== "attack") return;

    const currentTags = Array.isArray(attack.system?.qualityTags)
      ? foundry.utils.deepClone(attack.system.qualityTags)
      : [];
    const normalizedTag = String(choice.attackTag).toLowerCase();

    if (!currentTags.map((tag) => String(tag).toLowerCase()).includes(normalizedTag)) {
      currentTags.push(normalizedTag);
      await attack.update({ "system.qualityTags": currentTags });
    }
  }

_getAttackChoiceOptionsForQuality(
  quality,
  existingChoices = []
) {
  const attacks =
    this.actor?.items?.filter(
      (item) => {
        return item.type === "attack" && (
          !(this._superiorModeAttackIds instanceof Set) ||
          this._superiorModeAttackIds.has(item.id)
        );
      }
    ) ?? [];

  const modifier =
    quality.attackModifier ?? {};

  const choices =
    quality.choices ?? {};

  const choiceType =
    String(
      choices.type ?? ""
    );

  const grantsTags =
    Array.isArray(
      modifier.grantsTags
    )
      ? modifier.grantsTags
      : [];

  const normalizeTag = (value) => {
    return String(value ?? "")
      .trim()
      .replace(/^\[|\]$/g, "")
      .toLowerCase();
  };

  const getChoiceTag = (
    choice = {}
  ) => {
    const directTag =
      normalizeTag(
        choice.effectTag ??
        choice.attackTag ??
        ""
      );

    if (directTag) {
      return directTag;
    }

    const keyText =
      String(
        choice.key ?? ""
      ).trim();

    const separatorIndex =
      keyText.indexOf(":");

    return separatorIndex >= 0
      ? normalizeTag(
          keyText.slice(
            separatorIndex + 1
          )
        )
      : normalizeTag(keyText);
  };

  const usedAttackIds =
    new Set(
      existingChoices
        .map((choice) => {
          return String(
            choice.attackId ?? ""
          ).trim();
        })
        .filter(Boolean)
    );

  const usedTags =
    new Set(
      existingChoices
        .map((choice) => {
          return getChoiceTag(
            choice
          );
        })
        .filter(Boolean)
    );

  const reservedOverclockEffectTags = new Set(
    (this.actor?.items ?? [])
      .filter((item) => item.type === "quality")
      .map((item) => normalizeTag(item.system?.overclock?.effectTag ?? ""))
      .filter(Boolean)
  );

  const actorHasCodeWizard = (this.actor?.items ?? []).some((item) => {
    const selected = [
      ...(item.system?.choices?.selectedRanks ?? []),
      ...(item.system?.choices?.selected ?? [])
    ];
    return item.type === "quality" && selected.some((choice) => {
      return normalizeQualityBrowserIdentity(
        typeof choice === "string" ? choice : choice?.key ?? choice?.value ?? choice?.id
      ) === "codewizard";
    });
  });

  const getAttackTags = (
    attack
  ) => {
    const tags = [
      ...(
        Array.isArray(
          attack.system?.qualityTags
        )
          ? attack.system.qualityTags
          : []
      ),

      ...(
        Array.isArray(
          attack.system?.tags
        )
          ? attack.system.tags
          : []
      ),

      ...(
        attack.system?.effectTag?.enabled && attack.system.effectTag?.tag
          ? [attack.system.effectTag.tag]
          : []
      )
    ].map(normalizeTag).filter(Boolean);

    return [...new Set(tags)];
  };

  /*
   * Reúne todas as Tags de Efeito das
   * Qualidades Básica e Avançada.
   */
  const allEffectTags =
    new Set(
      DDA_DIGIMON_QUALITIES
        .filter((entry) => {
          return (
            entry.choices?.type ===
            "effectTagPerRank"
          );
        })
        .flatMap((entry) => {
          return Array.isArray(
            entry.choices?.options
          )
            ? entry.choices.options.map(
                (option) => {
                  return normalizeTag(
                    option.key
                  );
                }
              )
            : [];
        })
        .filter(Boolean)
    );

  const attackHasEffectTag = (
    attack
  ) => {
    const directEffectTag =
      attack.system
        ?.effectTag
        ?.enabled
        ? normalizeTag(
            attack.system
              .effectTag
              .tag
          )
        : "";

    if (directEffectTag) {
      return true;
    }

    return getAttackTags(attack)
      .some((tag) => {
        return allEffectTags.has(tag);
      });
  };

  /*
   * ELEMENTAL FORCE
   *
   * Cada Rank escolhe um Naturewalk que o Actor possui e o vincula a
   * um Ataque [DAMAGE] diferente. A escolha composta é persistida para
   * que o attack-roll saiba exatamente qual ataque pode disparar o bônus.
   */
  if (isElementalForceQualityData(quality)) {
    const elementalTags = new Set([
      "fire", "water", "wind", "earth", "ice",
      "wood", "steel", "thunder", "darkness", "light"
    ]);

    const ownedElements = new Set(
      (this.actor?.system?.qualityFeatures?.naturewalk?.elements ?? [])
        .map(normalizeTag)
        .filter(Boolean)
    );

    const elementOptions = Array.isArray(choices.options)
      ? choices.options
      : [];

    return elementOptions
      .filter((option) => ownedElements.has(normalizeTag(option.key)))
      .flatMap((option) => {
        const element = normalizeTag(option.key);

        return attacks
          .filter((attack) => !usedAttackIds.has(attack.id))
          .filter((attack) => {
            return String(attack.system?.baseTags?.functionType ?? "")
              .trim()
              .toLowerCase() === "damage";
          })
          .filter((attack) => {
            return !getAttackTags(attack).some((tag) => elementalTags.has(tag));
          })
          .map((attack) => ({
            key: `${attack.id}:${element}`,
            label: `${attack.name} — [${element.toUpperCase()}]`,
            originalLabel: "",
            attackId: attack.id,
            attackName: attack.name,
            attackTag: element,
            element,
            effect: option.effect ?? ""
          }));
      });
  }

  const isAreaAttackChoice =
    quality.id ===
      "areaDeAtaque" ||
    Boolean(
      modifier.areaAttack
    ) ||
    (
      String(
        modifier.appliesTo ?? ""
      ) ===
        "differentAttackPerRank" &&

      grantsTags.some((tag) => {
        return normalizeTag(tag)
          .startsWith("t:");
      })
    );

  /*
   * ÁREA DE ATAQUE
   */
  if (isAreaAttackChoice) {
    const areaOptions =
      Array.isArray(
        choices.options
      )
        ? choices.options
        : [];

    return areaOptions
      .filter((option) => {
        const areaTag =
          `t:${normalizeTag(
            option.key
          ).replace(/^t:/, "")}`;

        /*
         * Cada Tag de Área só pode
         * ser adquirida uma vez.
         */
        return !usedTags.has(
          areaTag
        );
      })
      .flatMap((option) => {
        const areaTag =
          `t:${normalizeTag(
            option.key
          ).replace(/^t:/, "")}`;

        return attacks
          .filter((attack) => {
            return this
              ._attackMatchesAreaOption(
                attack,
                option.appliesTo ?? ""
              );
          })
          .filter((attack) => {
            /*
             * Cada Rank precisa ser aplicado
             * a um Ataque diferente.
             */
            return !usedAttackIds.has(
              attack.id
            );
          })
          .filter((attack) => {
            /*
             * Impede duas Tags de Área
             * no mesmo Ataque.
             */
            return !getAttackTags(attack)
              .some((tag) => {
                return tag.startsWith(
                  "t:"
                );
              });
          })
          .map((attack) => ({
            key:
              `${attack.id}:${areaTag}`,

            label:
              `${attack.name} — [${areaTag.toUpperCase()}]`,

            /*
             * Não repetir o nome do Ataque
             * entre parênteses em outros
             * renderizadores.
             */
            originalLabel:
              "",

            attackId:
              attack.id,

            attackName:
              attack.name,

            attackTag:
              areaTag,

            derivedStat:
              option.derivedStat ??
              "",

            appliesTo:
              option.appliesTo ??
              "",

            effect:
              option.effect ??
              game.i18n.format(
                "DDA.QualityBrowser.AttackChoiceEffect",
                {
                  attack:
                    attack.name,

                  tag:
                    `[${areaTag.toUpperCase()}]`
                }
              )
          }));
      });
  }

  /*
   * EFEITO BÁSICO / AVANÇADO
   */
  if (
    choiceType ===
    "effectTagPerRank"
  ) {
    const effectOptions =
      Array.isArray(
        choices.options
      )
        ? choices.options
        : [];

    return effectOptions
      .filter((option) => {
        const effectTag =
          normalizeTag(
            option.key
          );

        /*
         * O mesmo Efeito não pode
         * ser adquirido novamente.
         */
        return (
          effectTag &&
          !usedTags.has(effectTag) &&
          !reservedOverclockEffectTags.has(effectTag)
        );
      })
      .flatMap((option) => {
        const effectTag =
          normalizeTag(
            option.key
          );

        return attacks
          .filter((attack) => {
            return !usedAttackIds.has(
              attack.id
            );
          })
          .filter((attack) => {
            return new Set(getAttackTags(attack)).size < 3;
          })
          .filter((attack) => {
            const functionType = String(
              attack.system?.baseTags?.functionType ?? ""
            ).trim().toLowerCase();
            const effectType = String(
              option.type ?? EFFECT_TAGS[effectTag]?.type ?? ""
            ).trim().toLowerCase();

            if (effectType === "positive" && functionType !== "support") {
              return false;
            }

            const hasAreaTag = getAttackTags(attack).some((tag) => tag.startsWith("t:"));
            const areaRestrictedEffects = new Set([
              "haste", "paralyze", "weak", "regen", "strength", "stun"
            ]);

            if (hasAreaTag && areaRestrictedEffects.has(effectTag)) {
              return Boolean(attack.system?.isSignature) && functionType === "support";
            }

            if (
              !option.requiresDamageTag ||
              actorHasCodeWizard
            ) {
              return true;
            }

            return functionType === "damage";
          })
          .filter((attack) => {
            if (
              !modifier
                .onlyOneEffectTagPerAttack
            ) {
              return true;
            }

            return !attackHasEffectTag(
              attack
            );
          })
          .map((attack) => ({
            key:
              `${attack.id}:${effectTag}`,

            label:
              `${attack.name} — [${effectTag.toUpperCase()}]`,

            originalLabel:
              "",

            attackId:
              attack.id,

            attackName:
              attack.name,

            /*
             * _applyAttackChoiceToAttack
             * utiliza attackTag para gravar
             * em system.qualityTags.
             */
            attackTag:
              effectTag,

            effectTag,

            effectType:
              option.type ??
              "",

            potencyStat:
              option.potency ??
              "",

            duration:
              option.duration ??
              true,

            extraActionRequired:
              Boolean(
                option.extraActionRequired
              ),

            requiresDamageTag:
              Boolean(
                option.requiresDamageTag
              ),

            onlyAffectsAllies:
              Boolean(
                option.onlyAffectsAllies
              ),

            effect:
              option.effect ??
              ""
          }));
      });
  }

  /*
   * OUTRAS QUALIDADES VINCULADAS
   * A UM ATAQUE
   */
  const primaryTag =
    normalizeTag(
      grantsTags[0] ??
      quality.id ??
      "quality"
    );

  const appliesTo =
    String(
      modifier.appliesTo ??
      "oneAttack"
    );

  const offensiveQualityKey = normalizeQualityBrowserIdentity(
    quality.id ?? quality.originalName ?? quality.name ?? ""
  );

  const attackIsLegalForOffensiveQuality = (attack) => {
    const tags = new Set(getAttackTags(attack));
    const isSignature = Boolean(attack.system?.isSignature);
    const hasEffect = attackHasEffectTag(attack);

    if (["armamentodedigizoidepuro", "puredigizoidweaponry"].includes(offensiveQualityKey)) {
      if (tags.has("weapon") && !isSignature) return false;
    }

    if (["municao", "ammo"].includes(offensiveQualityKey) && isSignature) {
      return false;
    }

    if (["perfuracaodearmadura", "armorpiercing"].includes(offensiveQualityKey)) {
      if (tags.has("certain") && !isSignature) return false;
    }

    if (["golpecerteiro", "certainstrike"].includes(offensiveQualityKey)) {
      if (tags.has("piercing") && !isSignature) return false;
    }

    if (["venenoso", "venomous"].includes(offensiveQualityKey)) {
      if (tags.has("poison")) return false;
    }

    if (["roubodevida", "lifesteal"].includes(offensiveQualityKey)) {
      if (hasEffect) return false;
    }

    if (["ataquefinta", "feintattack"].includes(offensiveQualityKey)) {
      if (tags.has("piercing") || tags.has("stun")) return false;
    }

    if (["golpepoderoso", "mightyblow"].includes(offensiveQualityKey)) {
      if (["burn", "freeze", "poison", "ruin"].some((tag) => tags.has(tag))) {
        return false;
      }
    }

    if (["escudoprotetor", "protectingshield"].includes(offensiveQualityKey)) {
      const hasAreaTag = [...tags].some((tag) => tag.startsWith("t:"));
      const functionType = String(attack.system?.baseTags?.functionType ?? "").toLowerCase();
      if (hasEffect) return false;
      if (hasAreaTag && (!isSignature || functionType !== "support")) return false;
    }

    return true;
  };

  return attacks
    .filter((attack) => {
      return this
        ._attackMatchesQualityAppliesTo(
          attack,
          appliesTo
        );
    })
    .filter((attack) => {
      return new Set(getAttackTags(attack)).size < 3;
    })
    .filter((attack) => {
      return attackIsLegalForOffensiveQuality(attack);
    })
    .filter((attack) => {
      return !usedAttackIds.has(
        attack.id
      );
    })
    .filter((attack) => {
      return !getAttackTags(attack)
        .includes(primaryTag);
    })
    .map((attack) => ({
      key:
        `${attack.id}:${primaryTag}`,

      label:
        `${attack.name} — [${primaryTag.toUpperCase()}]`,

      originalLabel:
        "",

      attackId:
        attack.id,

      attackName:
        attack.name,

      attackTag:
        primaryTag,

      effect:
        game.i18n.format(
          "DDA.QualityBrowser.AttackChoiceEffect",
          {
            attack:
              attack.name,

            tag:
              `[${primaryTag.toUpperCase()}]`
          }
        )
    }));
}

  _attackMatchesAreaOption(attack, appliesTo = "") {
    const rangeType = String(attack.system?.baseTags?.rangeType ?? "")
      .trim()
      .toLowerCase();

    const functionType = String(attack.system?.baseTags?.functionType ?? "")
      .trim()
      .toLowerCase();

    const option = String(appliesTo ?? "")
      .trim()
      .toLowerCase();

    if (!option) return true;

    if (option === "rangeattack" || option === "rangedattack") {
      return ["range", "ranged"].includes(rangeType);
    }

    if (option === "meleeattack") {
      return rangeType === "melee";
    }

    if (option === "meleeorrangeattack" || option === "meleeorrangedattack") {
      return rangeType === "melee" || ["range", "ranged"].includes(rangeType);
    }

    if (option === "damageattack") {
      return functionType === "damage";
    }

    if (option === "supportattack") {
      return functionType === "support";
    }

    return this._attackMatchesQualityAppliesTo(attack, appliesTo);
  }

  _attackMatchesQualityAppliesTo(attack, appliesTo = "") {
    const rangeType = String(attack.system?.baseTags?.rangeType ?? "").toLowerCase();
    const functionType = String(attack.system?.baseTags?.functionType ?? "").toLowerCase();
    const rule = String(appliesTo ?? "").trim();

    if (rule === "oneDamageAttack" || rule === "damage") return functionType === "damage";
    if (rule === "oneSupportAttack" || rule === "support") return functionType === "support";
    if (rule === "oneMeleeAttack" || rule === "melee") return rangeType === "melee";
    if (rule === "oneRangedAttack" || rule === "range" || rule === "ranged") return ["range", "ranged"].includes(rangeType);

    if (rule === "oneSupportAttackWithPositiveEffect") {
      if (functionType !== "support") return false;
      const tags = new Set([
        ...(attack.system?.qualityTags ?? []),
        attack.system?.effectTag?.enabled ? attack.system.effectTag.tag : ""
      ].map((entry) => String(entry?.tag ?? entry?.key ?? entry?.value ?? entry ?? "").trim().toLowerCase()).filter(Boolean));
      return [...tags].some((tag) => String(EFFECT_TAGS[tag]?.type ?? "").toLowerCase() === "positive" || tag === "shield");
    }

    return true;
  }

  async _increaseQualityRank(itemId) {
    const item = this.actor?.items?.get(itemId);

    if (!item) {
      ui.notifications.warn(game.i18n.localize("DDA.Warning.QualityNotFoundOnSheet"));
      return;
    }

    const quality = DDA_DIGIMON_QUALITIES.find((entry) => {
      return entry.id === item.system?.sourceId || entry.name === item.name;
    });

    if (!quality) {
      ui.notifications.warn(game.i18n.localize("DDA.Warning.QualityNotFound"));
      return;
    }

    const currentRank = Number(item.system?.rank?.value ?? 1);
    const effectiveMax = this._getQualityEffectiveMax(quality, item);

    if (currentRank >= effectiveMax) {
      ui.notifications.warn(game.i18n.format("DDA.Warning.QualityAlreadyAtMaxRank", {
        quality: item.name
      }));
      return;
    }

    const nextRank = currentRank + 1;

    if (!actorMeetsOffensiveRankStatRequirement(this.actor, quality, nextRank)) {
      const requirement = getOffensiveRankStatRequirement(quality, nextRank);
      const statLabel = requirement?.stat === "damage"
        ? (isQualityBrowserEnglish() ? "Damage" : "Dano")
        : requirement?.stat === "dodge"
          ? (isQualityBrowserEnglish() ? "Dodge" : "Esquiva")
          : (isQualityBrowserEnglish() ? "Accuracy" : "Precisão");
      ui.notifications.warn(isQualityBrowserEnglish()
        ? `${quality.name} Rank ${nextRank} requires ${requirement?.required ?? 0} Total ${statLabel}.`
        : `${quality.name} Rank ${nextRank} exige ${requirement?.required ?? 0} de ${statLabel} Total.`);
      return;
    }

    const rankCost = this._getQualityDpCost(quality, { ranks: 1, ownedItem: item });
    const remainingDp = this._getActorRemainingDp();

    if (rankCost > remainingDp) {
      ui.notifications.warn(game.i18n.format("DDA.QualityBrowser.BlockedReason.NotEnoughDP", {
        cost: rankCost,
        remaining: remainingDp
      }));
      return;
    }

    if (!this._actorHasRequiredQualities(quality)) {
      ui.notifications.warn(this._getBlockedReason(quality));
      return;
    }

    if (this._actorHasIncompatibleQualities(quality)) {
      ui.notifications.warn(this._getBlockedReason(quality));
      return;
    }

    const existingChoices = Array.isArray(item.system?.choices?.selectedRanks)
      ? foundry.utils.deepClone(item.system.choices.selectedRanks)
      : [];

    const updateData = {
      "system.rank.value": nextRank
    };

    if (
      quality?.choices?.required &&
      quality.choices.repeatOnRankIncrease !== false
    ) {
      const choice = await this._promptQualityChoice(
        quality,
        nextRank,
        existingChoices
      );

      if (!choice) return;

      existingChoices.push(choice);
      updateData["system.choices.selectedRanks"] = existingChoices;
    }

this._attachStatusWarlordDiscountToUpdate(quality, item, updateData);

await item.update(
  updateData
);

const addedChoice = updateData[
  "system.choices.selectedRanks"
]?.at?.(-1);

await this._applyAttackChoiceToAttack(
  item,
  addedChoice
);

await this._applyDataSpecializationFreeGrant(
  item,
  addedChoice
);

    ui.notifications.info(game.i18n.format("DDA.QualityBrowser.RankIncreased", {
      quality: item.name,
      rank: nextRank
    }));

    this.render();
  }

  _getActorDerivedStatValue(statKey) {
    const stat = this.actor?.system?.derivedStats?.[statKey];

    if (!stat) return 0;

    return Number(
      stat.total ??
      stat.value ??
      stat.max ??
      stat.base ??
      0
    );
  }

  _getInspiringGuidanceEffectiveMax(quality, ownedItem = null) {
    const identity = normalizeQualityBrowserIdentity(
      ownedItem?.system?.sourceId ??
      ownedItem?.system?.id ??
      quality?.id ??
      ownedItem?.name ??
      quality?.name ??
      ""
    );

    const configured = Boolean(
      quality?.attackModifier?.maxRanksEqualDpSpentOnPositiveEffect ??
      ownedItem?.system?.attackModifier?.maxRanksEqualDpSpentOnPositiveEffect
    );

    if (!configured && !["orientacaoinspiradora", "inspiringguidance"].includes(identity)) {
      return null;
    }

    const selected = [
      ...(Array.isArray(ownedItem?.system?.choices?.selectedRanks)
        ? ownedItem.system.choices.selectedRanks
        : []),
      ...(Array.isArray(ownedItem?.system?.choices?.selected)
        ? ownedItem.system.choices.selected
        : [])
    ];

    const firstChoice = selected[0] ?? {};
    const choiceKey = String(firstChoice?.key ?? "").trim();
    const attackId = String(
      firstChoice?.attackId ??
      firstChoice?.attackItemId ??
      firstChoice?.itemId ??
      firstChoice?.attackKey ??
      (choiceKey.includes(":") ? choiceKey.split(":")[0] : choiceKey) ??
      ""
    ).trim();

    /*
     * Antes da primeira compra o Browser ainda não possui um Ataque salvo.
     * O teto provisório continua 3; após a escolha, o limite é recalculado
     * com base no PD do Efeito Positivo daquele mesmo Ataque.
     */
    if (!attackId) return 3;

    const positiveTags = new Set(
      Object.entries(EFFECT_TAGS)
        .filter(([, data]) => String(data?.type ?? "").toLowerCase() === "positive")
        .map(([tag]) => String(tag).toLowerCase())
    );

    let maximum = 0;

    for (const item of this.actor?.items ?? []) {
      if (item.type !== "quality" || item.id === ownedItem?.id) continue;

      const itemIdentity = normalizeQualityBrowserIdentity(
        item.system?.sourceId ??
        item.system?.id ??
        item.system?.originalName ??
        item.name ??
        ""
      );

      const choices = [
        ...(Array.isArray(item.system?.choices?.selectedRanks)
          ? item.system.choices.selectedRanks
          : []),
        ...(Array.isArray(item.system?.choices?.selected)
          ? item.system.choices.selected
          : [])
      ];

      const matchingChoice = choices.find((rawChoice) => {
        const choice = rawChoice && typeof rawChoice === "object"
          ? rawChoice
          : { key: rawChoice };
        const key = String(choice.key ?? "").trim();
        const boundAttackId = String(
          choice.attackId ??
          choice.attackItemId ??
          choice.itemId ??
          choice.attackKey ??
          (key.includes(":") ? key.split(":")[0] : "")
        ).trim();
        if (boundAttackId !== attackId) return false;

        const tag = String(
          choice.effectTag ??
          choice.attackTag ??
          (key.includes(":") ? key.slice(key.indexOf(":") + 1) : "")
        ).trim().replace(/^\[|\]$/g, "").toLowerCase();

        return positiveTags.has(tag) || tag === "shield";
      });

      if (!matchingChoice) continue;

      if (["efeitobasico", "basiceffect"].includes(itemIdentity)) maximum = Math.max(maximum, 1);
      else if (["efeitoavancado", "advancedeffect"].includes(itemIdentity)) maximum = Math.max(maximum, 2);
      else if (["efeitomestre", "mastereffect"].includes(itemIdentity)) maximum = Math.max(maximum, 3);
      else if (["escudoprotetor", "protectingshield"].includes(itemIdentity)) maximum = Math.max(maximum, 2);
    }

    return Math.max(1, Math.min(3, maximum || 1));
  }

_getQualityEffectiveMax(
  quality,
  ownedItem = null
) {
  const coreQualityId = getCoreQualityId(ownedItem ?? quality);

  const inspiringGuidanceMaximum = this._getInspiringGuidanceEffectiveMax(quality, ownedItem);
  if (inspiringGuidanceMaximum !== null) return inspiringGuidanceMaximum;

  if ([CORE_QUALITY_IDS.weapon, CORE_QUALITY_IDS.instinct].includes(coreQualityId)) {
    return getWeaponInstinctEffectiveMax(this.actor, ownedItem ?? quality);
  }

  if (coreQualityId === CORE_QUALITY_IDS.advancedMobility) {
    const extraMovement = findCoreQuality(this.actor, CORE_QUALITY_IDS.extraMovement);
    const selected = Array.isArray(extraMovement?.system?.choices?.selectedRanks)
      ? extraMovement.system.choices.selectedRanks
      : [];
    return Math.min(5, selected.length);
  }

  /*
   * Algumas Naturewalks antigas foram salvas com
   * rank.max = 1. A definição oficial é sempre 2.
   */
  if (
    isNaturewalkQualityData(
      quality,
      ownedItem
    )
  ) {
    const hasElementalMyriad = this.actor?.items?.some((item) => {
      return item.type === "quality" && isElementalMyriadQualityData({}, item);
    });

    return hasElementalMyriad ? 10 : 2;
  }

  /*
   * Basic/Advanced/Master Effect e Elemental Force não possuem
   * um limite fixo. O limite real é a quantidade de Ataques que ainda
   * podem receber uma escolha válida.
   */
  if (
    isEffectPurchaseQualityData(quality, ownedItem) ||
    isElementalForceQualityData(quality, ownedItem)
  ) {
    const currentRank = Math.max(
      0,
      Number(ownedItem?.system?.rank?.value ?? 0)
    );

    const existingChoices = Array.isArray(
      ownedItem?.system?.choices?.selectedRanks
    )
      ? ownedItem.system.choices.selectedRanks
      : [];

    /*
     * Itens de builds antigas podem ter sido salvos sem choices ou
     * attackModifier completos. A definição atual sobrescreve o fallback.
     */
    const choiceDefinition = {
      ...(ownedItem?.system ?? {}),
      ...(quality ?? {}),

      choices: {
        ...(ownedItem?.system?.choices ?? {}),
        ...(quality?.choices ?? {})
      },

      attackModifier: {
        ...(ownedItem?.system?.attackModifier ?? {}),
        ...(quality?.attackModifier ?? {})
      }
    };

    const availableOptions =
      this._getAttackChoiceOptionsForQuality(
        choiceDefinition,
        existingChoices
      );

    /*
     * Várias Tags podem apontar para o mesmo Ataque.
     * Cada Ataque disponível conta somente uma vez.
     */
    const availableAttackIds = new Set(
      availableOptions
        .map((option) => {
          return String(
            option.attackId ?? ""
          ).trim();
        })
        .filter(Boolean)
    );

    return (
      currentRank +
      availableAttackIds.size
    );
  }

  if (isNaturalWeaknessQualityData(quality, ownedItem)) {
    const naturewalk = this.actor?.items?.find((item) => {
      return item.type === "quality" && isNaturewalkQualityData({}, item);
    });
    return Math.max(0, Number(naturewalk?.system?.rank?.value ?? 0));
  }

  if (qualityBrowserMatches(quality, ownedItem, ["erroDeSistema", "systemError"])) {
    const systemBoost = this.actor?.items?.find((item) => (
      item.type === "quality" && qualityBrowserMatches({}, item, ["impulsoDeSistema", "systemBoost"])
    ));
    return Math.min(
      Number(quality?.rank?.max ?? ownedItem?.system?.rank?.max ?? 2),
      Math.max(0, Number(systemBoost?.system?.rank?.value ?? 0))
    );
  }

  const dependentRankCapDefinitions = [
    { quality: ["perfuracaoDesastrada", "fumbledPiercing"], source: ["golpeCerteiro", "certainStrike"] },
    { quality: ["golpeEnfraquecido", "weakenedStrike"], source: ["golpeCerteiro", "certainStrike"] },
    { quality: ["decepcionante", "underwhelming"], source: ["poderBrutal", "hugePower"] },
    { quality: ["flancoAberto", "broadside"], source: ["esquiva", "avoidance"] },
    { quality: ["doenca", "illness"], source: ["energiaVital", "vitalEnergy"] }
  ];
  const dependentRankCap = dependentRankCapDefinitions.find((entry) => (
    qualityBrowserMatches(quality, ownedItem, entry.quality)
  ));
  if (dependentRankCap) {
    const sourceItem = this.actor?.items?.find((item) => (
      item.type === "quality" && qualityBrowserMatches({}, item, dependentRankCap.source)
    ));
    return Math.min(
      Number(quality?.rank?.max ?? ownedItem?.system?.rank?.max ?? 1),
      Math.max(0, Number(sourceItem?.system?.rank?.value ?? 0))
    );
  }

  const fixedCatalogMaximum = Number(quality?.rank?.max ?? Number.NaN);
  const catalogRankLimit = quality?.rankLimit ?? null;
  if (
    Number.isFinite(fixedCatalogMaximum) &&
    fixedCatalogMaximum > 0 &&
    !catalogRankLimit
  ) {
    return fixedCatalogMaximum;
  }

  const actorComputedEffectiveMax =
    Number(
      ownedItem?.system
        ?.rank
        ?.effectiveMax ??
      Number.NaN
    );

  if (Number.isFinite(actorComputedEffectiveMax) && actorComputedEffectiveMax >= 0) {
    return actorComputedEffectiveMax;
  }

  const rankLimit = quality.rankLimit ?? ownedItem?.system?.rankLimit ?? null;

if (this._isAccelerateQuality(quality, ownedItem)) {
  return this._getActorDerivedStatValue("ram");
}

  if (rankLimit?.type === "derivedStat") {
    return this._getActorDerivedStatValue(rankLimit.stat);
  }

  if (rankLimit?.type === "byStage" || rankLimit?.type === "byStageMaxFour") {
    const stage = this.actor?.system?.stage ?? "";
    const byStage = rankLimit.byStage ?? {};

    return Number(byStage[stage] ?? quality.rank?.max ?? 1);
  }

  return Number(
    ownedItem?.system?.rank?.max ??
    quality.rank?.max ??
    1
  );
}

_isAccelerateQuality(quality, ownedItem = null) {
  const candidates = [
    quality?.id,
    quality?.name,
    quality?.originalName,
    ownedItem?.system?.sourceId,
    ownedItem?.system?.id,
    ownedItem?.name
  ];

  return candidates.some((candidate) => {
    const normalized = String(candidate ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();

    return normalized === "acelerar" || normalized === "accelerate";
  });
}

  _getQualityMinimumStageValue(quality) {
    const stageOrder = {
      baby1: 0,
      baby2: 1,
      child: 2,
      adult: 3,
      perfect: 4,
      mega: 5
    };

    const minimumStage = quality.stageRequirement?.minimum || quality.availability?.minimumStage || "";

    if (!minimumStage) return 0;

    return stageOrder[minimumStage] ?? 0;
  }

  _getActorQualityNames() {
    if (!this.actor) return [];

    return this.actor.items
      .filter((item) => item.type === "quality")
      .flatMap((item) => [
        item.name,
        item.system?.originalName,
        item.system?.sourceId
      ])
      .filter(Boolean);
  }

  _actorHasQualityReference(reference = "") {
    const normalizedReference = normalizeCoreKey(reference);
    if (!normalizedReference || !this.actor) return false;

    if (["dataspecializationuncatchabletarget", "especializacaodedadosalvoinalcancavel", "uncatchabletarget", "alvoinalcancavel"].includes(normalizedReference)) {
      return this._actorHasDataSpecializationChoice("uncatchableTarget");
    }

    const definition = DDA_DIGIMON_QUALITIES.find((entry) => {
      return [entry.id, entry.name, entry.originalName]
        .some((candidate) => normalizeCoreKey(candidate) === normalizedReference);
    });

    const canonicalCoreId = getCoreQualityId(definition ?? { name: reference });
    if (canonicalCoreId && hasCoreQuality(this.actor, canonicalCoreId)) return true;

    const expected = new Set([
      reference,
      definition?.id,
      definition?.name,
      definition?.originalName
    ].map(normalizeCoreKey).filter(Boolean));

    return this.actor.items.some((item) => {
      if (item.type !== "quality") return false;
      return [item.system?.sourceId, item.system?.originalName, item.name]
        .some((candidate) => expected.has(normalizeCoreKey(candidate)));
    });
  }

  _parseRequiredQualityNames(quality) {
    const raw = quality.requirements?.qualityNames ?? "";

    if (!raw) return [];

    return raw
      .split(/[,;|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  _actorHasRequiredQualities(quality) {
    const requiredNames =
      this._parseRequiredQualityNames(quality);

    if (!requiredNames.length) return true;

    const matches = requiredNames.map((requiredName) => {
      return this._actorHasQualityReference(requiredName);
    });

    const anyMode = quality.requirements?.mode === "any" ||
      /\b(or|ou)\b/i.test(String(quality.requirements?.text ?? ""));

    return anyMode
      ? matches.some(Boolean)
      : matches.every(Boolean);
  }

  _getMissingRequiredQualities(quality) {
    const requiredNames =
      this._parseRequiredQualityNames(quality);

    if (!requiredNames.length) return [];

    const missing = requiredNames.filter((requiredName) => {
      return !this._actorHasQualityReference(requiredName);
    });

    const anyMode = quality.requirements?.mode === "any" ||
      /\b(or|ou)\b/i.test(String(quality.requirements?.text ?? ""));

    if (anyMode) {
      return missing.length === requiredNames.length
        ? requiredNames
        : [];
    }

    return missing;
  }

  _parseIncompatibleQualityNames(quality) {
    const raw = quality.incompatible?.qualityNames ?? "";

    if (!raw) return [];

    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  _getConflictingQualities(quality) {
    const coreId = getCoreQualityId(quality);

    if ([CORE_QUALITY_IDS.weapon, CORE_QUALITY_IDS.instinct].includes(coreId)) {
      if (!isWeaponInstinctConflict(this.actor, quality)) return [];
      return [coreId === CORE_QUALITY_IDS.weapon
        ? (isQualityBrowserEnglish() ? "Instinct" : "Instinto")
        : (isQualityBrowserEnglish() ? "Weapon" : "Arma")];
    }

    const family = getDigizoidGainForceFamily(quality);
    const familyConflicts = family ? this.actor.items.filter((item) => (
      item.type === "quality" &&
      getDigizoidGainForceFamily(item) === family &&
      normalizeQualityBrowserIdentity(item.system?.sourceId ?? item.name) !== normalizeQualityBrowserIdentity(quality.id ?? quality.name)
    )).map((item) => item.name) : [];

    const incompatibleNames = this._parseIncompatibleQualityNames(quality);
    if (!incompatibleNames.length) return familyConflicts;

    const qualityKey = normalizeCoreKey(
      quality?.id ?? quality?.originalName ?? quality?.name ?? ""
    );
    const hasChaoticBalance = this._actorHasQualityReference("Chaotic Balance") ||
      this._actorHasQualityReference("Equilíbrio Caótico");
    const isWardEmblemPair = [
      "holyward",
      "protecaosagrada",
      "darkemblem",
      "emblemasombrio"
    ].includes(qualityKey);

    return [...new Set([...familyConflicts, ...incompatibleNames.filter((incompatibleName) => {
      const incompatibleKey = normalizeCoreKey(incompatibleName);
      if (
        hasChaoticBalance &&
        isWardEmblemPair &&
        ["holyward", "protecaosagrada", "darkemblem", "emblemasombrio"].includes(incompatibleKey)
      ) {
        return false;
      }
      return this._actorHasQualityReference(incompatibleName);
    })])];
  }

  _actorHasIncompatibleQualities(quality) {
    return this._getConflictingQualities(quality).length > 0;
  }

  _actorHasDataSpecializationChoice(choiceKey) {
    return getDataSpecializationEntries(this.actor).some((entry) => {
      return normalizeCoreKey(entry?.key ?? entry?.specialization ?? "") === normalizeCoreKey(choiceKey);
    });
  }

  _getStatusWarlordDiscountUse() {
    for (const item of this.actor?.items ?? []) {
      if (item.type !== "quality") continue;
      const sources = Array.isArray(item.system?.cost?.dpDiscountSources)
        ? item.system.cost.dpDiscountSources
        : [];
      const source = sources.find((entry) => {
        return String(entry?.key ?? entry ?? "") === STATUS_WARLORD_DISCOUNT_KEY;
      });
      if (source) return { item, source };
    }
    return null;
  }

  _statusWarlordDiscountAvailable(quality, ownedItem = null) {
    if (!this._actorHasDataSpecializationChoice("statusWarlord")) return false;
    if (!isEffectPurchaseQualityData(quality, ownedItem)) return false;
    return !this._getStatusWarlordDiscountUse();
  }

  _getStatusWarlordMarginalDiscount(quality, ownedItem = null) {
    if (!this._statusWarlordDiscountAvailable(quality, ownedItem)) return 0;
    const baseCost = Math.max(0, Number(quality?.cost?.dp ?? ownedItem?.system?.cost?.dp ?? 0));
    return Math.min(1, baseCost);
  }

  _attachStatusWarlordDiscountToItemData(quality, itemData) {
    const amount = this._getStatusWarlordMarginalDiscount(quality, null);
    if (amount <= 0) return;

    const existing = Array.isArray(itemData?.system?.cost?.dpDiscountSources)
      ? foundry.utils.deepClone(itemData.system.cost.dpDiscountSources)
      : [];
    existing.push({
      key: STATUS_WARLORD_DISCOUNT_KEY,
      amount,
      specialization: "statusWarlord"
    });
    itemData.system.cost = {
      ...(itemData.system.cost ?? {}),
      dpDiscountSources: existing
    };
  }

  _attachStatusWarlordDiscountToUpdate(quality, item, updateData) {
    const amount = this._getStatusWarlordMarginalDiscount(quality, item);
    if (amount <= 0) return;

    const existing = Array.isArray(item?.system?.cost?.dpDiscountSources)
      ? foundry.utils.deepClone(item.system.cost.dpDiscountSources)
      : [];
    existing.push({
      key: STATUS_WARLORD_DISCOUNT_KEY,
      amount,
      specialization: "statusWarlord"
    });
    updateData["system.cost.dpDiscountSources"] = existing;
  }

  _getActorRemainingDp() {
    if (!this.actor) return 0;

    return Number(this.actor.system?.creation?.dp?.remaining ?? 0);
  }

  _getQualityDpCost(quality, { ranks = 1, ownedItem = null } = {}) {
    const baseCost = getMarginalQualityDpCost(this.actor, quality, { ranks });
    const statusDiscount = this._getStatusWarlordMarginalDiscount(quality, ownedItem);
    return Math.max(0, baseCost - statusDiscount);
  }


  _actorHasEnoughDp(quality) {
    const cost = this._getQualityDpCost(quality);

    if (cost <= 0) return true;

    return this._getActorRemainingDp() >= cost;
  }

    _getActorFreeQualityLimit() {
    return Number(this.actor?.system?.qualityLimits?.freeQualities?.max ?? 0);
  }

  _getActorFreeQualityUsed() {
    return Number(this.actor?.system?.qualityLimits?.freeQualities?.used ?? 0);
  }

  _actorCanTakeFreeQuality(quality) {
    if (quality.tier !== "free") return true;

    const limit = this._getActorFreeQualityLimit();

    if (limit <= 0) return true;

    return this._getActorFreeQualityUsed() < limit;
  }

  _getActorNegativeDpLimit() {
    return Number(this.actor?.system?.qualityLimits?.negativeDp?.max ?? 0);
  }

  _getActorNegativeDpUsed() {
    return Number(this.actor?.system?.qualityLimits?.negativeDp?.used ?? 0);
  }

  _getNegativeQualityDpValue(quality) {
    if (quality.tier !== "negative") return 0;

    return Math.abs(Number(quality.cost?.dp ?? 0));
  }

  _actorCanTakeNegativeQuality(quality) {
    // DDA 7.02 limits how much DP can be GAINED, not which Negative
    // Qualities may be taken. The Actor preparation code caps the awarded DP.
    return true;
  }


  _canActorBuyQuality(quality) {
    if (!this.actor) return false;

    const actorStageValue = Number(this.actor.system?.stageValue ?? 0);
    const minimumStageValue = this._getQualityMinimumStageValue(quality);

    if (actorStageValue < minimumStageValue) return false;

    if (!actorMeetsOffensiveRankStatRequirement(this.actor, quality, 1)) {
      return false;
    }

    if (!this._actorHasRequiredQualities(quality)) return false;

    if (getDigizoidGainForceRankRequirements(quality).some((requirement) => {
      const item = this.actor.items.find((entry) => entry.type === "quality" && requirement.aliases.some((alias) => (
        normalizeQualityBrowserIdentity(entry.system?.sourceId ?? entry.system?.originalName ?? entry.name) === normalizeQualityBrowserIdentity(alias)
      )));
      return Math.max(0, Number(item?.system?.rank?.value ?? 0)) < requirement.rank;
    })) return false;

    if (this._actorHasIncompatibleQualities(quality)) return false;

    const coreId = getCoreQualityId(quality);
    if ([CORE_QUALITY_IDS.weapon, CORE_QUALITY_IDS.instinct].includes(coreId)) {
      const counterpartId = coreId === CORE_QUALITY_IDS.weapon
        ? CORE_QUALITY_IDS.instinct
        : CORE_QUALITY_IDS.weapon;
      const counterpart = findCoreQuality(this.actor, counterpartId);
      if (counterpart) {
        const cap = getWeaponInstinctEffectiveMax(this.actor, quality, { counterpartWillExist: true });
        const counterpartRank = Number(counterpart.system?.rank?.value ?? 0);
        if (cap <= 0 || counterpartRank > cap) return false;
      }
    }

    if (!this._actorHasEnoughDp(quality)) return false;

    if (!this._actorCanTakeFreeQuality(quality)) return false;

    if (!this._actorCanTakeNegativeQuality(quality)) return false;

    return true;
  }


  _getBlockedReason(quality) {
    if (!this.actor) return game.i18n.localize("DDA.Warning.NoDigimonSelected");

    const actorStageValue = Number(this.actor.system?.stageValue ?? 0);
    const minimumStageValue = this._getQualityMinimumStageValue(quality);

    if (actorStageValue < minimumStageValue) {
      return game.i18n.format("DDA.QualityBrowser.BlockedReason.RequiresStage", {
        stage: quality.availability?.label ?? game.i18n.localize("DDA.QualityBrowser.HigherStage")
      });
    }

    const offensiveRequirement = getOffensiveRankStatRequirement(quality, 1);
    if (
      offensiveRequirement &&
      !actorMeetsOffensiveRankStatRequirement(this.actor, quality, 1)
    ) {
      const statLabel = offensiveRequirement.stat === "damage"
        ? (isQualityBrowserEnglish() ? "Damage" : "Dano")
        : offensiveRequirement.stat === "dodge"
          ? (isQualityBrowserEnglish() ? "Dodge" : "Esquiva")
          : (isQualityBrowserEnglish() ? "Accuracy" : "Precisão");
      return isQualityBrowserEnglish()
        ? `Requires ${offensiveRequirement.required} Total ${statLabel}.`
        : `Exige ${offensiveRequirement.required} de ${statLabel} Total.`;
    }

    const missing = this._getMissingRequiredQualities(quality);

    if (missing.length) {
      return game.i18n.format("DDA.QualityBrowser.BlockedReason.RequiresQualities", {
        qualities: missing.join(", ")
      });
    }

    const missingRank = getDigizoidGainForceRankRequirements(quality).find((requirement) => {
      const item = this.actor.items.find((entry) => entry.type === "quality" && requirement.aliases.some((alias) => (
        normalizeQualityBrowserIdentity(entry.system?.sourceId ?? entry.system?.originalName ?? entry.name) === normalizeQualityBrowserIdentity(alias)
      )));
      return Math.max(0, Number(item?.system?.rank?.value ?? 0)) < requirement.rank;
    });
    if (missingRank) {
      return isQualityBrowserEnglish()
        ? `Requires ${missingRank.rank} Rank${missingRank.rank === 1 ? "" : "s"} of ${missingRank.label}.`
        : `Exige ${missingRank.rank} Rank${missingRank.rank === 1 ? "" : "s"} de ${missingRank.label}.`;
    }

    const conflicts = this._getConflictingQualities(quality);

    if (conflicts.length) {
      return game.i18n.format("DDA.QualityBrowser.BlockedReason.IncompatibleWith", {
        qualities: conflicts.join(", ")
      });
    }

    const coreId = getCoreQualityId(quality);
    if ([CORE_QUALITY_IDS.weapon, CORE_QUALITY_IDS.instinct].includes(coreId)) {
      const counterpartId = coreId === CORE_QUALITY_IDS.weapon
        ? CORE_QUALITY_IDS.instinct
        : CORE_QUALITY_IDS.weapon;
      const counterpart = findCoreQuality(this.actor, counterpartId);
      if (counterpart) {
        const cap = getWeaponInstinctEffectiveMax(this.actor, quality, { counterpartWillExist: true });
        const counterpartRank = Number(counterpart.system?.rank?.value ?? 0);
        if (cap <= 0 || counterpartRank > cap) {
          return isQualityBrowserEnglish()
            ? `Algorithm must be high enough to support both Weapon and Instinct. Current shared cap: ${cap}.`
            : `Algoritmo precisa ter Ranks suficientes para sustentar Arma e Instinto. Limite compartilhado atual: ${cap}.`;
        }
      }
    }

    if (!this._actorHasEnoughDp(quality)) {
      const cost = this._getQualityDpCost(quality);
      const remaining = this._getActorRemainingDp();

      return game.i18n.format("DDA.QualityBrowser.BlockedReason.NotEnoughDP", {
        cost,
        remaining
      });
    }

    if (!this._actorCanTakeFreeQuality(quality)) {
      const used = this._getActorFreeQualityUsed();
      const limit = this._getActorFreeQualityLimit();

      return game.i18n.format("DDA.QualityBrowser.BlockedReason.FreeLimitReached", {
        used,
        limit
      });
    }

    return "";
  }


  _getCostLabel(quality) {
    const cost = quality.cost ?? {};
    const rawDp = Number(cost.dp ?? 0);
    const dp = Math.max(0, rawDp);

    if (quality.tier === "free") return game.i18n.localize("DDA.QualityBrowser.Cost.Free");
    if (quality.tier === "negative") {
      const suffix = cost.perRank ? ` / ${game.i18n.localize("DDA.QualitySheet.Rank")}` : "";
      return `+${Math.abs(rawDp)} PD${suffix}`;
    }

    const suffix = cost.perRank ? ` / ${game.i18n.localize("DDA.QualitySheet.Rank")}` : "";
    const preview = getCoreDiscountPreview(this.actor, quality);

    if (preview.eligible && preview.discount > 0) {
      return `${preview.raw} PD → ${preview.payable} PD${suffix} (${isQualityBrowserEnglish() ? "Core Discount" : "Desconto Core"})`;
    }

    const statusDiscount = this._getStatusWarlordMarginalDiscount(quality, null);
    if (statusDiscount > 0) {
      return `${dp} PD → ${Math.max(0, dp - statusDiscount)} PD${suffix} (${isQualityBrowserEnglish() ? "Status Warlord discount" : "desconto de Senhor da Guerra de Status"})`;
    }

    const firstPurchaseDiscount = getFirstPurchaseDiscount(this.actor, quality);
    if (firstPurchaseDiscount > 0) {
      return `${dp} PD → ${Math.max(0, dp - firstPurchaseDiscount)} PD${suffix} (${isQualityBrowserEnglish() ? "first-purchase discount" : "desconto da primeira compra"})`;
    }

    return `${dp} PD${suffix}`;
  }


  _getTierLabel(quality) {
    const labels = {
      starting: "DDA.QualityBrowser.Tier.Starting",
      champion: "DDA.QualityBrowser.Tier.Champion",
      perfect: "DDA.QualityBrowser.Tier.Perfect",
      mega: "DDA.QualityBrowser.Tier.Mega",
      free: "DDA.QualityBrowser.Tier.Free",
      negative: "DDA.QualityBrowser.Tier.Negative"
    };

    const labelKey = labels[quality.tier];

    return labelKey
      ? game.i18n.localize(labelKey)
      : quality.availability?.label ?? game.i18n.localize("DDA.QualityBrowser.Tier.Starting");
  }
}
