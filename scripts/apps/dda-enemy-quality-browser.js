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

const BROWSER_ATTACK_CHOICE_TYPES = new Set([
  "singleAttack",
  "attackTag"
]);

const ENEMY_QUALITY_CATEGORY_FILTERS = [
  { key: "all", pt: "Todas as categorias", en: "All categories" },
  { key: "core", pt: "Centrais", en: "Core" },
  { key: "attack", pt: "Ataque", en: "Attack / Offensive" },
  { key: "defense", pt: "Defesa", en: "Defense" },
  { key: "clash", pt: "Clash", en: "Clash" },
  { key: "effect", pt: "Efeito e Conjurador", en: "Effect & Caster" },
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
    "Evoker Qualities",
    "Qualidades de Conjurador"
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

function matchesQualitySearch(quality = {}, searchTerm = "") {
  const query = normalizeSearchText(searchTerm);

  if (!query) return true;

  const terms = getSearchTerms(query);

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

  if (fullText.includes(query)) return true;
  if (!terms.length) return false;

  return terms.every((term) => fullText.includes(term));
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
  return Math.max(
    getBrowserQualityBaseRank(quality),
    Number(quality.rank?.max ?? 1)
  );
}

function getBrowserQualityChoiceOptions(quality = {}, wizard = null) {
  const choiceType = String(quality.choices?.type ?? "").trim();

  if (!quality.choices?.required) {
    return [];
  }

  if (choiceType === "single") {
    const options = Array.isArray(quality.choices?.options)
      ? quality.choices.options
      : [];

    return options.map((option) => ({
      key: String(option.key ?? ""),
      label: String(option.label ?? option.key ?? "")
    })).filter((option) => option.key);
  }

  if (BROWSER_ATTACK_CHOICE_TYPES.has(choiceType)) {
    return wizard?.getEnemyQualityBrowserChoiceOptions?.(quality) ?? [];
  }

  return [];
}
function getBrowserQualityUnsupportedChoiceLabel(
  quality = {},
  choiceOptions = []
) {
  if (!quality.choices?.required) return "";

  const choiceType = String(quality.choices?.type ?? "").trim();

  if (choiceType === "single") return "";

  if (BROWSER_ATTACK_CHOICE_TYPES.has(choiceType)) {
    return choiceOptions.length
      ? ""
      : text(
        "Crie um Ataque primeiro",
        "Create an Attack first"
      );
  }

  return text(
    "Escolha manual",
    "Manual choice"
  );
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
    return text("Qualidades do Inimigo", "Enemy Qualities");
  }
  static PARTS = {
    main: {
      template: "systems/digimon-digital-adventures/templates/apps/dda-enemy-quality-browser.hbs",
      scrollable: [".dda-enemy-quality-list"]
    }
  };

  constructor(wizard, options = {}) {
    super(options);

    this.wizard = wizard;
    this.activeTier = "all";
    this.activeCategory = "all";
    this.searchTerm = "";
  }

  async _prepareContext() {
    const form = this.wizard?._getSelectedForm?.() ?? null;
    const stageOrder = getFormStageOrder(form ?? {});

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

            return matchesQualitySearch(quality, this.searchTerm);
      })
.map((quality) => {
  const qualityId = String(quality.id ?? "");
  const selectedRank = Math.max(
    0,
    Number(this.wizard?.getEnemyQualitySelectionRank?.(qualityId) ?? 0)
  );

  const maxRank = getBrowserQualityMaxRank(quality);
const choiceOptions = getBrowserQualityChoiceOptions(
  quality,
  this.wizard
);

const unsupportedChoiceLabel = getBrowserQualityUnsupportedChoiceLabel(
  quality,
  choiceOptions
);

  const hasUnsupportedChoice = Boolean(unsupportedChoiceLabel);
  const canAdd = selectedRank < maxRank && !hasUnsupportedChoice;

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

    selected: selectedRank > 0,
    selectedRank,
    maxRank,
    canAdd,

    choiceOptions,
    hasChoiceOptions: choiceOptions.length > 0,
    unsupportedChoiceLabel,

    addLabel: selectedRank > 0
      ? text("+ Rank", "+ Rank")
      : text("Adicionar", "Add"),

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
  "Escolha Qualidades para a build do inimigo. O wizard valida custo e limites.",
  "Choose Qualities for the enemy build. The wizard validates cost and limits."
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

  const added = this.wizard?.addEnemyQualityById?.(
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