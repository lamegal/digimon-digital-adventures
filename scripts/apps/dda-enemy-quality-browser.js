import { DDA_DIGIMON_QUALITIES } from "../data/digimon-qualities.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const DDAEnemyQualityBrowserBase = HandlebarsApplicationMixin(ApplicationV2);

const TIER_ORDER = [
  "all",
  "starting",
  "champion",
  "perfect",
  "mega",
  "free",
  "negative"
];

const TIER_LABELS = {
  all: { pt: "Todas", en: "All" },
  starting: { pt: "Iniciais", en: "Starting" },
  champion: { pt: "Adultas", en: "Adult" },
  perfect: { pt: "Perfeitas", en: "Perfect" },
  mega: { pt: "Ultimates", en: "Ultimate" },
  free: { pt: "Gratuitas", en: "Free" },
  negative: { pt: "Negativas", en: "Negative" }
};



const ENEMY_QUALITY_CATEGORY_FILTERS = [
  { key: "all", pt: "Todas as categorias", en: "All categories" },
  { key: "core", pt: "Centrais", en: "Core" },
  { key: "attack", pt: "Ataque", en: "Attack / Offensive" },
  { key: "defense", pt: "Defesa", en: "Defense" },
  { key: "clash", pt: "Clash", en: "Clash" },
  {
    key: "effect",
    pt: "Efeito e Conjuração",
    en: "Effect & Conjuration"
  },
  { key: "utility", pt: "Utilidade", en: "Utility" },
  { key: "stanceMode", pt: "Postura e Modo", en: "Stance & Mode" },
  { key: "digizoid", pt: "Digizoide", en: "Digizoid" }
];

const ENEMY_QUALITY_SECTION_GROUPS = {
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

    /*
     * Chaves novas e legadas.
     */
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
  ]
};

const STAGE_ORDER = {
  baby1: 0,
  baby2: 1,
  child: 2,
  adult: 3,
  perfect: 4,
  mega: 5,
  ultimate: 5,
  ultimatePlus: 5
};

function isEnglishLanguage() {
  const language = String(
    game?.i18n?.lang ??
    game?.i18n?.language ??
    ""
  );

  return language.toLowerCase().startsWith("en");
}

function text(pt, en) {
  return isEnglishLanguage() ? en : pt;
}

function normalizeSearchText(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getSearchTerms(searchTerm = "") {
  const stopWords = new Set([
    "a", "o", "as", "os",
    "um", "uma", "uns", "umas",
    "de", "da", "do", "das", "dos",
    "em", "no", "na", "nos", "nas",
    "para", "por", "com", "e", "ou"
  ]);

  return normalizeSearchText(searchTerm)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !stopWords.has(term));
}

function getQualitySearchScore(
  quality = {},
  searchTerm = ""
) {
  const query = normalizeSearchText(searchTerm);

  if (!query) return 0;

  const terms = getSearchTerms(query);

  const displayName = normalizeSearchText(
    quality.name
  );

  const originalName = normalizeSearchText(
    quality.originalName
  );

  const displayNameWords = new Set(
    displayName.split(/\s+/).filter(Boolean)
  );

  const originalNameWords = new Set(
    originalName.split(/\s+/).filter(Boolean)
  );

  const nameText = normalizeSearchText([
    quality.name,
    quality.originalName
  ]
    .filter(Boolean)
    .join(" "));

  const metaText = normalizeSearchText([
    quality.section,
    quality.availability?.label,
    quality.category?.label,
    quality.requirements?.text,
    quality.incompatible?.text
  ]
    .filter(Boolean)
    .join(" "));

  const fullText = normalizeSearchText([
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

  if (metaText.includes(query)) return 400;
  if (fullText.includes(query)) return 200;

  if (!terms.length) return -1;

  if (
    terms.every((term) => {
      return nameText.includes(term);
    })
  ) {
    return 150;
  }

  if (
    terms.every((term) => {
      return fullText.includes(term);
    })
  ) {
    return 50;
  }

  return -1;
}

function matchesQualitySearch(
  quality = {},
  searchTerm = ""
) {
  if (!normalizeSearchText(searchTerm)) {
    return true;
  }

  return getQualitySearchScore(
    quality,
    searchTerm
  ) >= 0;
}

function getMinimumStageOrder(quality = {}) {
  const minimumStage = String(
    quality.stageRequirement?.minimum ??
    quality.availability?.minimumStage ??
    ""
  ).trim();

  return STAGE_ORDER[minimumStage] ?? 0;
}

function getFormStageOrder(form = {}) {
  const stageKey = String(form.stageKey ?? "").trim();

  return STAGE_ORDER[stageKey] ?? Math.max(
    0,
    Number(form.stageValue ?? 0)
  );
}

function matchesEnemyQualityCategory(
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
    return Boolean(category.attack)
      || ENEMY_QUALITY_SECTION_GROUPS.attack.includes(section);
  }

  return ENEMY_QUALITY_SECTION_GROUPS[categoryKey]
    ?.includes(section) ?? false;
}

function getQualityCostLabel(quality = {}) {
  if (quality.tier === "free") {
    return text("Gratuita", "Free");
  }

  const dp = Math.max(0, Number(quality.cost?.dp ?? 0));
  const perRank = Boolean(quality.cost?.perRank);

  if (quality.tier === "negative") {
    return text(
      `${Math.abs(Number(quality.cost?.dp ?? 0))} PD negativo`,
      `${Math.abs(Number(quality.cost?.dp ?? 0))} negative DP`
    );
  }

  return perRank
    ? `${dp} PD / ${text("rank", "rank")}`
    : `${dp} PD`;
}

function getBrowserQualityBaseRank(quality = {}) {
  return Math.max(1, Number(quality.rank?.value ?? 1));
}

function getBrowserQualityMaxRank(quality = {}) {
  const declaredMax = Number(
    quality.rank?.max ?? 1
  );

  if (
    Number.isFinite(declaredMax) &&
    declaredMax > 0
  ) {
    return Math.max(
      getBrowserQualityBaseRank(quality),
      declaredMax
    );
  }

  const optionCount = Array.isArray(
    quality.choices?.options
  )
    ? quality.choices.options.length
    : 0;

  return Math.max(
    getBrowserQualityBaseRank(quality),
    optionCount
  );
}

function getBrowserQualityChoiceOptions(
  quality = {},
  wizard = null
) {
  if (!quality.choices?.required) {
    return [];
  }

  return wizard
    ?.getEnemyQualityBrowserChoiceOptions?.(
      quality
    ) ?? [];
}

function getBrowserQualityBlockedReason(
  quality = {},
  wizard = null
) {
  return wizard
    ?.getEnemyQualityBrowserBlockedReason?.(
      quality
    ) ?? "";
}

export class DDAEnemyQualityBrowser extends DDAEnemyQualityBrowserBase {
  static DEFAULT_OPTIONS = {
    id: "dda-enemy-quality-browser",
    tag: "section",
    classes: ["dda", "dda-enemy-quality-browser-window"],

    position: {
      width: 760,
      height: 720
    },

        window: {
        icon: "fa-solid fa-book-open",
        resizable: true
        },

      actions: {
        filterEnemyQualityTier: DDAEnemyQualityBrowser._onFilterEnemyQualityTier,
        filterEnemyQualityCategory: DDAEnemyQualityBrowser._onFilterEnemyQualityCategory,
        addEnemyQuality: DDAEnemyQualityBrowser._onAddEnemyQuality,
        clearEnemyQualitySearch: DDAEnemyQualityBrowser._onClearEnemyQualitySearch,
        closeEnemyQualityBrowser: DDAEnemyQualityBrowser._onCloseEnemyQualityBrowser
      }
  };
  get title() {
    return this.selectionMode === "superiorMode"
      ? text(
          "Qualidades do Modo",
          "Mode Qualities"
        )
      : text(
          "Qualidades do Inimigo",
          "Enemy Qualities"
        );
  }
  static PARTS = {
    main: {
      template: "systems/digimon-digital-adventures/templates/apps/dda-enemy-quality-browser.hbs",
      scrollable: [".dda-enemy-quality-list"]
    }
  };

  constructor(wizard, options = {}) {
    const {
      selectionMode = "build",
      ...applicationOptions
    } = options;

    if (selectionMode === "superiorMode") {
      applicationOptions.id ??=
        "dda-enemy-superior-mode-quality-browser";
    }

    super(applicationOptions);

    this.wizard = wizard;

    this.selectionMode =
      selectionMode === "superiorMode"
        ? "superiorMode"
        : "build";

    this.activeTier = "all";
    this.activeCategory = "all";
    this.searchTerm = "";
  }

  async _prepareContext() {
    const form = this.wizard?._getSelectedForm?.() ?? null;
    const stageOrder = getFormStageOrder(form ?? {});

    const isSuperiorMode =
      this.selectionMode === "superiorMode";

    const qualities = DDA_DIGIMON_QUALITIES
      .filter((quality) => {
        if (this.activeTier !== "all" && quality.tier !== this.activeTier) {
          return false;
        }

        if (getMinimumStageOrder(quality) > stageOrder) {
            return false;
            }

            if (!matchesEnemyQualityCategory(
            quality,
            this.activeCategory
            )) {
            return false;
            }

            return matchesQualitySearch(
              quality,
              this.searchTerm
            );
      })
      .sort((left, right) => {
        if (!String(this.searchTerm ?? "").trim()) {
          return 0;
        }

        const scoreDifference =
          getQualitySearchScore(
            right,
            this.searchTerm
          ) -
          getQualitySearchScore(
            left,
            this.searchTerm
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
  const qualityId = String(quality.id ?? "");

  const targetSelectedRank = Math.max(
    0,
    Number(
      isSuperiorMode
        ? this.wizard
            ?.getEnemySuperiorModeQualitySelectionRank?.(
              qualityId
            ) ?? 0
        : this.wizard
            ?.getEnemyQualitySelectionRank?.(
              qualityId
            ) ?? 0
    )
  );

  const maxRank = Math.max(
    0,
    Number(
      isSuperiorMode
        ? this.wizard
            ?.getEnemySuperiorModeQualityEffectiveMax?.(
              quality
            ) ?? getBrowserQualityMaxRank(quality)
        : this.wizard
            ?.getEnemyQualityEffectiveMax?.(
              quality
            ) ?? getBrowserQualityMaxRank(quality)
    )
  );

  const choiceOptions = isSuperiorMode
    ? this.wizard
        ?.getEnemySuperiorModeQualityBrowserChoiceOptions?.(
          quality
        ) ?? []
    : getBrowserQualityChoiceOptions(
        quality,
        this.wizard
      );

  const blockedReason = isSuperiorMode
    ? this.wizard
        ?.getEnemySuperiorModeQualityBrowserBlockedReason?.(
          quality
        ) ?? ""
    : getBrowserQualityBlockedReason(
        quality,
        this.wizard
      );

  const atMaxRank =
    maxRank > 0 &&
    targetSelectedRank >= maxRank;

  const canAdd =
    maxRank > 0 &&
    !atMaxRank &&
    !blockedReason;

  const addLabel = targetSelectedRank > 0
    ? text("+ Rank", "+ Rank")
    : text("Adicionar", "Add");

  const buttonLabel = atMaxRank
    ? text("Máximo", "Max")
    : blockedReason
      ? text("Indisponível", "Unavailable")
      : addLabel;

  return {

    ...quality,
    id: qualityId,

    tierLabel: text(
      TIER_LABELS[quality.tier]?.pt ?? quality.tier,
      TIER_LABELS[quality.tier]?.en ?? quality.tier
    ),

    costLabel: getQualityCostLabel(quality),
    isFree: quality.tier === "free",
    isNegative: quality.tier === "negative",

    selected: targetSelectedRank > 0,
    selectedRank: targetSelectedRank,
    maxRank,
    canAdd,
    atMaxRank,

    choiceOptions,
    hasChoiceOptions: choiceOptions.length > 0,
    unsupportedChoiceLabel: blockedReason,

    addLabel,
    buttonLabel,
    maxRankLabel: text("Máximo", "Max")
  };
});

    return {
      formName: String(form?.displayName ?? ""),
      formStage: String(form?.stageLabel ?? ""),
      searchTerm: this.searchTerm,
      qualities,

      tiers: TIER_ORDER.map((key) => ({
            key,
            label: text(
                TIER_LABELS[key]?.pt ?? key,
                TIER_LABELS[key]?.en ?? key
            ),
            active: key === this.activeTier
            })),

            categories: ENEMY_QUALITY_CATEGORY_FILTERS.map((category) => ({
            key: category.key,
            label: text(category.pt, category.en),
            active: category.key === this.activeCategory
            })),

            labels: {
        search: text("Buscar Qualidade", "Search Quality"),
        searchHint: text(
          "A busca é aplicada ao pressionar Enter.",
          "Search is applied when you press Enter."
        ),
        clear: text("Limpar", "Clear"),
        noResults: text(
          "Nenhuma Qualidade disponível corresponde aos filtros atuais.",
          "No available Quality matches the current filters."
        ),
        stage: text("Estágio", "Stage"),
        category: text("Categoria", "Category"),
        requirements: text("Requisitos", "Requirements"),
        incompatible: text("Incompatível", "Incompatible"),
rank: text("Rank", "Rank"),
selected: text("Selecionada", "Selected"),
choice: text("Escolha", "Choice"),
close: text("Fechar", "Close"),
catalogOnly: text(
  isSuperiorMode
    ? "Escolha Qualidades para o Modo alternativo. O custo não pode ultrapassar o conjunto Padrão."
    : "Escolha Qualidades para a build do inimigo. O wizard valida custo e limites.",

  isSuperiorMode
    ? "Choose Qualities for the alternate Mode. Their cost cannot exceed the Default set."
    : "Choose Qualities for the enemy build. The wizard validates cost and limits."
)
      }
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const searchInput = this.element?.querySelector(
      "[data-enemy-quality-search]"
    );

    searchInput?.addEventListener("input", (event) => {
      this.searchTerm = String(event.currentTarget?.value ?? "");
    });

    searchInput?.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;

      event.preventDefault();

      this.searchTerm = String(
        event.currentTarget?.value ?? ""
      );

      await this.render({ force: true });
    });
  }

  static async _onFilterEnemyQualityTier(event, target) {
    event.preventDefault();

    const tier = String(target?.dataset?.tier ?? "all");

    if (!TIER_ORDER.includes(tier)) return;

    this.activeTier = tier;
    await this.render({ force: true });
  }

  static async _onFilterEnemyQualityCategory(event, target) {
  event.preventDefault();

  const category = String(
    target?.dataset?.category ?? "all"
  );

  const isKnownCategory = ENEMY_QUALITY_CATEGORY_FILTERS.some(
    (entry) => entry.key === category
  );

  if (!isKnownCategory) return;

  this.activeCategory = category;

  await this.render({ force: true });
}

static async _onAddEnemyQuality(event, target) {
  event.preventDefault();

  const qualityId = String(
    target?.dataset?.qualityId ?? ""
  );

  if (!qualityId) return;

  const card = target?.closest?.("[data-enemy-quality-card]");

  const choiceKey = String(
    card?.querySelector("[data-enemy-quality-choice]")?.value ?? ""
  );

  const added =
    this.selectionMode === "superiorMode"
      ? this.wizard
          ?.addEnemySuperiorModeQualityById?.(
            qualityId,
            { choiceKey }
          )
      : this.wizard?.addEnemyQualityById?.(
          qualityId,
          { choiceKey }
        );

  if (!added) return;

  await this.wizard?._renderPreservingScroll?.({
    preserveForms: true,
    preservePreview: true
  });

  await this.render({ force: true });
}

  static async _onClearEnemyQualitySearch(event) {
    event.preventDefault();

    this.searchTerm = "";
    await this.render({ force: true });
  }

  static _onCloseEnemyQualityBrowser(event) {
    event.preventDefault();
    this.close();
  }
}