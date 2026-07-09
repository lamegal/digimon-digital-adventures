import { DDADigimonDatabase } from "../data/digimon-database.js";
import { DDA_DIGIMON_QUALITIES } from "../data/digimon-qualities.js";
import { DDAEnemyQualityBrowser } from "./dda-enemy-quality-browser.js";
import { buildQualityItemData } from "./digimon-quality-browser.js";
import {
  getDdaPortraitPath,
  getDdaTokenPath
} from "../data/dda-portrait-and-manual-digimon-data.js";

const DDA_SYSTEM_ID = "digimon-digital-adventures";
const DDA_ENEMY_FORM_LIMIT = 120;
const DDA_DIGIMON_PORTRAITS_PATH =
  `systems/${DDA_SYSTEM_ID}/assets/digimon/portraits`;

  const DDA_DIGIMON_ASSETS_PATH =
  `systems/${DDA_SYSTEM_ID}/assets/digimon`;

const DDA_STATIC_IMAGE_PATTERN =
  /\.(?:webp|png|jpe?g)(?:$|[?#])/i;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const DDADigimonEnemyWizardBase = HandlebarsApplicationMixin(ApplicationV2);

const ENEMY_FORM_CATEGORY_ORDER = [
  "normal",
  "armor",
  "hybrid",
  "jogress",
  "burst",
  "mode",
  "antibody",
  "variant"
];

const ENEMY_FORM_CATEGORY_LABELS = {
  normal: { pt: "Normal", en: "Normal" },
  armor: { pt: "Armadura", en: "Armor" },
  hybrid: { pt: "Híbrido", en: "Hybrid" },
  jogress: { pt: "Jogress", en: "Jogress" },
  burst: { pt: "Burst Mode", en: "Burst Mode" },
  mode: { pt: "Mode Change", en: "Mode Change" },
  antibody: { pt: "X-Antibody", en: "X-Antibody" },
  variant: { pt: "Variação", en: "Variant" }
};

const ENEMY_STAT_ORDER = [
  "accuracy",
  "damage",
  "dodge",
  "armor",
  "health"
];

const ENEMY_STAT_LABELS = {
  accuracy: "DDA.MainStat.Accuracy",
  damage: "DDA.MainStat.Damage",
  dodge: "DDA.MainStat.Dodge",
  armor: "DDA.MainStat.Armor",
  health: "DDA.MainStat.Health"
};

const ENEMY_ATTACK_RANGE_OPTIONS = [
  { key: "melee", pt: "Corpo a corpo", en: "Melee" },
  { key: "range", pt: "À distância", en: "Range" }
];

const ENEMY_ATTACK_FUNCTION_OPTIONS = [
  { key: "damage", pt: "Dano", en: "Damage" },
  { key: "support", pt: "Suporte", en: "Support" }
];

const ENEMY_ROLE_DEFINITIONS = [
  { key: "mook", pt: "Lacaio", en: "Mook" },
  { key: "standard", pt: "Inimigo padrão", en: "Standard enemy" },
  { key: "attacker", pt: "Atacante", en: "Striker" },
  { key: "protector", pt: "Protetor", en: "Protector" },
  { key: "controller", pt: "Controlador", en: "Controller" },
  { key: "support", pt: "Suporte", en: "Support" },
  { key: "leader", pt: "Líder", en: "Leader" },
  { key: "boss", pt: "Chefe", en: "Boss" }
];

const ENEMY_SIZE_MODIFIERS = {
  small: { bit: 2, dos: 1, ram: 3, cpu: 0, movement: 0 },
  medium: { bit: 2, dos: 1, ram: 2, cpu: 1, movement: 0 },
  large: { bit: 2, dos: 1, ram: 1, cpu: 2, movement: 0 },
  huge: { bit: 1, dos: 2, ram: 1, cpu: 2, movement: 0 },
  gigantic: { bit: 1, dos: 2, ram: 0, cpu: 3, movement: -1 },
  colossal: { bit: 1, dos: 2, ram: 0, cpu: 3, movement: -1 }
};

function toNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return Math.max(0, Number(fallback) || 0);
  }

  return Math.max(0, Math.floor(numeric));
}

function getEnemyStageData(form = {}) {
  return CONFIG.DDA?.stages?.[form.stageKey]
    ?? CONFIG.DDA?.stages?.child
    ?? {};
}

function getEnemyStageValue(form = {}) {
  const stage = getEnemyStageData(form);

  return Math.max(
    1,
    toNonNegativeInteger(stage.stageValue ?? form.stageValue ?? 2, 2)
  );
}

function getEnemyStageBaseDp(form = {}) {
  const stage = getEnemyStageData(form);

  return toNonNegativeInteger(
    stage.baseDp ?? stage.startingDp ?? 0,
    0
  );
}

function getEnemyStatLabel(statKey = "") {
  return localizeMaybe(
    ENEMY_STAT_LABELS[statKey],
    String(statKey ?? "")
  );
}

function createEnemyAttackDraft(index = 0) {
  const slot = Math.max(1, Number(index ?? 0) + 1);

  return {
    key: `enemyAttack-${foundry.utils.randomID(8)}`,
    name: text(`Ataque ${slot}`, `Attack ${slot}`),
    rangeType: "melee",
    functionType: "damage"
  };
}

function getEnemyAttackRangeLabel(rangeType = "melee") {
  const entry = ENEMY_ATTACK_RANGE_OPTIONS.find((option) => {
    return option.key === rangeType;
  }) ?? ENEMY_ATTACK_RANGE_OPTIONS[0];

  return text(entry.pt, entry.en);
}

function getEnemyAttackFunctionLabel(functionType = "damage") {
  const entry = ENEMY_ATTACK_FUNCTION_OPTIONS.find((option) => {
    return option.key === functionType;
  }) ?? ENEMY_ATTACK_FUNCTION_OPTIONS[0];

  return text(entry.pt, entry.en);
}

function normalizeEnemyAttackDraft(attack = {}, index = 0) {
  const rangeType = ENEMY_ATTACK_RANGE_OPTIONS.some((option) => {
    return option.key === attack.rangeType;
  })
    ? attack.rangeType
    : "melee";

  const functionType = ENEMY_ATTACK_FUNCTION_OPTIONS.some((option) => {
    return option.key === attack.functionType;
  })
    ? attack.functionType
    : "damage";

  return {
    key: String(
      attack.key ??
      `enemyAttack-${foundry.utils.randomID(8)}`
    ),

    name: String(
      attack.name ??
      text(`Ataque ${index + 1}`, `Attack ${index + 1}`)
    ).trim(),

    rangeType,
    functionType
  };
}

function createEnemyBuild(form = null) {
  const stageBaseDp = getEnemyStageBaseDp(form ?? {});

  return {
    baseDp: stageBaseDp,
    bonusDp: 0,

    statInvestments: Object.fromEntries(
      ENEMY_STAT_ORDER.map((statKey) => [statKey, 0])
    ),

    attacks: [
      createEnemyAttackDraft(0)
    ],

    selectedQualities: [],
    role: "standard",
    goal: "",
    motivation: "",
    tactic: "",
    notes: ""
  };
}

let enemyDirectoryHookRegistered = false;

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

function localizeMaybe(value, fallback = "") {
  const raw = String(value ?? "").trim();

  if (!raw) return fallback;

  const localized = game.i18n.localize(raw);

  return localized !== raw ? localized : raw;
}

function normalizeLookup(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/x[-_\s]*antibody/g, "x antibody")
    .replace(/mode[-_\s]*change/g, "mode change")
    .replace(/burst[-_\s]*mode/g, "burst mode")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueStrings(values = []) {
  return Array.from(new Set(
    values
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
  ));
}

function getStageLabel(stageKey = "") {
  const stage = CONFIG.DDA?.stages?.[stageKey] ?? {};

  return localizeMaybe(
    stage.label,
    String(stageKey ?? "")
  );
}

function getCategoryLabel(category = "normal") {
  const entry = ENEMY_FORM_CATEGORY_LABELS[category]
    ?? ENEMY_FORM_CATEGORY_LABELS.variant;

  return text(entry.pt, entry.en);
}

function getAttributeLabel(attribute = "") {
  const key = String(attribute ?? "").trim().toLowerCase();

  const keys = {
    none: "DDA.DigimonProfile.Attribute.None",
    free: "DDA.DigimonProfile.Attribute.Free",
    virus: "DDA.DigimonProfile.Attribute.Virus",
    data: "DDA.DigimonProfile.Attribute.Data",
    vaccine: "DDA.DigimonProfile.Attribute.Vaccine",
    variable: "DDA.DigimonProfile.Attribute.Variable"
  };

  return localizeMaybe(
    keys[key],
    key || text("Não definido", "Not defined")
  );
}

function getProfileLabel(kind = "", value = "") {
  const key = String(value ?? "").trim();

  if (!key) return text("Não definido", "Not defined");

  const localized = localizeMaybe(key, "");

  if (localized && localized !== key) return localized;

  const titleKey = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ");

  return titleKey.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getEnemyFormCategories(sourceActor = {}) {
  const system = sourceActor.system ?? {};

  const configuredCategories = Array.isArray(system.specialCategories)
    ? system.specialCategories
    : [];

  const categories = new Set(
    configuredCategories
      .map((category) => String(category ?? "").trim())
      .filter((category) => ENEMY_FORM_CATEGORY_ORDER.includes(category))
  );

  if (!categories.size) {
    const baseCategory = String(
      system.evolutionCategory ?? "normal"
    ).trim();

    categories.add(
      ENEMY_FORM_CATEGORY_ORDER.includes(baseCategory)
        ? baseCategory
        : "normal"
    );
  }

  return ENEMY_FORM_CATEGORY_ORDER.filter((category) => {
    return categories.has(category);
  });
}

function getEnemyPrimaryCategory(categories = []) {
  return categories.find((category) => category !== "normal")
    ?? categories[0]
    ?? "normal";
}

function getEnemyCategoryTags(categories = []) {
  return categories.map((category) => ({
    key: category,
    label: getCategoryLabel(category)
  }));
}

function getDdaFilePickerClass() {
  return globalThis.foundry?.applications?.apps?.FilePicker?.implementation
    ?? null;
}

function normalizeImageLookup(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/x[-_\s]*antibody/gi, "x antibody")
    .replace(/mode[-_\s]*change/gi, "mode change")
    .replace(/burst[-_\s]*mode/gi, "burst mode")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase()
    .trim();
}

function isStaticImagePath(path = "") {
  return DDA_STATIC_IMAGE_PATTERN.test(
    String(path ?? "").trim()
  );
}

function cleanAssetPath(path = "") {
  return String(path ?? "")
    .replace(/^\/+/, "")
    .replace(/[?#].*$/, "")
    .trim();
}

function isDdaSystemAssetPath(path = "") {
  return cleanAssetPath(path).startsWith(
    `systems/${DDA_SYSTEM_ID}/`
  );
}

function getAssetIndexPriority(path = "", kind = "portrait") {
  const cleanPath = cleanAssetPath(path).toLowerCase();

  if (kind === "token") {
    if (cleanPath.includes("/tokens/")) return 0;
    if (cleanPath.includes("/portraits/")) return 1;
    return 2;
  }

  if (cleanPath.includes("/portraits/")) return 0;
  if (cleanPath.includes("/tokens/")) return 2;

  return 1;
}

function rememberIndexedAsset(index, key = "", path = "", kind = "portrait") {
  const cleanKey = normalizeImageLookup(key);
  const cleanPath = cleanAssetPath(path);

  if (!cleanKey || !cleanPath || !isStaticImagePath(cleanPath)) return;

  const current = index.get(cleanKey);

  if (
    !current ||
    getAssetIndexPriority(cleanPath, kind) <
      getAssetIndexPriority(current, kind)
  ) {
    index.set(cleanKey, cleanPath);
  }
}

function filterExistingAssetPaths(
  paths = [],
  assetPaths = new Set(),
  fallback = "icons/svg/mystery-man.svg"
) {
  const result = [];

  for (const path of uniquePaths(paths, "")) {
    const cleanPath = cleanAssetPath(path);

    if (!cleanPath) continue;
    if (/\.webm(?:$|[?#])/i.test(cleanPath)) continue;

    if (
      isDdaSystemAssetPath(cleanPath) &&
      !assetPaths.has(cleanPath)
    ) {
      continue;
    }

    if (!result.includes(cleanPath)) {
      result.push(cleanPath);
    }
  }

  if (!result.length && fallback) {
    result.push(fallback);
  }

  return result;
}

function uniquePaths(paths = [], fallback = "icons/svg/mystery-man.svg") {
  const result = [];

  for (const path of paths) {
    const cleanPath = String(path ?? "").trim();

    if (!cleanPath || /\.webm(?:$|[?#])/i.test(cleanPath)) {
      continue;
    }

    if (!result.includes(cleanPath)) {
      result.push(cleanPath);
    }
  }

  if (!result.length && fallback) {
    result.push(fallback);
  }

  return result;
}

function getActorImageIdentity(sourceActor = {}) {
  const system = sourceActor.system ?? {};
  const names = system.names ?? {};

  const sourceId = String(
    system.sourceId ??
    names.canonical ??
    system.species ??
    sourceActor.name ??
    ""
  ).trim();

  const displayName = String(
    names.dub ??
    system.species ??
    sourceActor.name ??
    sourceId
  ).trim();

  const aliases = uniqueStrings([
    displayName,
    names.original,
    names.canonical,
    sourceId,
    ...(Array.isArray(names.aliases) ? names.aliases : [])
  ]);

  return {
    sourceId,
    displayName,
    aliases,
    stageKey: String(system.stage ?? "").trim()
  };
}

function getStaticPortraitIndexKeys(sourceActor = {}) {
  const identity = getActorImageIdentity(sourceActor);

  const stageTerms = {
    baby1: ["baby1", "babyi", "fresh"],
    baby2: ["baby2", "babyii", "intraining"],
    child: ["child", "rookie"],
    adult: ["adult", "champion"],
    perfect: ["perfect", "ultimate"],
    ultimate: ["ultimate", "mega"],
    ultimatePlus: ["ultimateplus", "megaplus"]
  }[identity.stageKey] ?? [];

  const keys = new Set();

  for (const value of [
    identity.sourceId,
    identity.displayName,
    ...identity.aliases
  ]) {
    const raw = String(value ?? "").trim();

    if (!raw) continue;

    const simplified = raw
      .replace(
        /\((?:baby\s*[i1]+|baby\s*ii|fresh|in[-\s]?training|child|rookie|adult|champion|perfect|ultimate|mega)\)/gi,
        " "
      )
      .replace(
        /[-_\s]+(?:baby\s*[i1]+|baby\s*ii|fresh|in[-\s]?training|child|rookie|adult|champion|perfect|ultimate|mega)$/gi,
        " "
      )
      .trim();

    for (const candidate of [raw, simplified]) {
      const normalized = normalizeImageLookup(candidate);

      if (!normalized) continue;

      keys.add(normalized);

      for (const stageTerm of stageTerms) {
        keys.add(
          normalizeImageLookup(`${candidate} ${stageTerm}`)
        );
      }
    }
  }

  return keys;
}

function getStaticPortraitFromIndex(
  sourceActor = {},
  portraitIndex = new Map()
) {
  for (const key of getStaticPortraitIndexKeys(sourceActor)) {
    const path = portraitIndex.get(key);

    if (path) return path;
  }

  return "";
}

function getStaticTokenFromIndex(
  sourceActor = {},
  tokenIndex = new Map()
) {
  for (const key of getStaticPortraitIndexKeys(sourceActor)) {
    const path = tokenIndex.get(key);

    if (path) return path;
  }

  return "";
}

function getStaticPortraitCandidates(
  sourceActor = {},
  portraitIndex = new Map(),
  assetPaths = new Set()
) {
  const system = sourceActor.system ?? {};
  const images = system.images ?? {};
  const identity = getActorImageIdentity(sourceActor);

  const mappedPortrait = getDdaPortraitPath({
    key: identity.sourceId,
    name: identity.displayName,
    species: identity.displayName,
    aliases: identity.aliases
  });

  return filterExistingAssetPaths([
  isStaticImagePath(mappedPortrait) ? mappedPortrait : "",
  getStaticPortraitFromIndex(sourceActor, portraitIndex),
  images.portraitImagePath,
  images.portrait,
  images.localImagePath,
  images.tokenImagePath,
  sourceActor.img
], assetPaths);
}

async function getTokenCandidates(
  sourceActor = {},
  portraitCandidates = [],
  assetPaths = new Set(),
  tokenIndex = new Map()
) {
  const system = sourceActor.system ?? {};
  const images = system.images ?? {};
  const identity = getActorImageIdentity(sourceActor);

  let mappedToken = "";

  try {
    mappedToken = await getDdaTokenPath({
      key: identity.sourceId,
      name: identity.displayName,
      species: identity.displayName,
      aliases: identity.aliases
    });
  } catch (error) {
    console.warn(
      "DDA | Não foi possível resolver o token da forma inimiga.",
      error
    );
  }

return filterExistingAssetPaths([
  mappedToken,
  getStaticTokenFromIndex(sourceActor, tokenIndex),
  images.tokenImagePath,
  images.token,
  sourceActor.prototypeToken?.texture?.src,
  ...portraitCandidates
], assetPaths);
}

function defaultFilters() {
  return {
    searchDraft: "",
    searchTerm: "",
    stage: "all",
    attribute: "all",
    type: "all",
    field: "all",
    group: "all",
    categories: new Set(["normal"])
  };
}

function createMainStats(stageValue = 2, investments = {}) {
  const startingValue = Math.max(1, Number(stageValue ?? 2));

  return Object.fromEntries(
    ENEMY_STAT_ORDER.map((key) => {
      const investment = toNonNegativeInteger(
        investments?.[key],
        0
      );

      const total = startingValue + investment;

      return [
        key,
        {
          label: ENEMY_STAT_LABELS[key],
          base: total,
          bonus: 0,
          total
        }
      ];
    })
  );
}

const ENEMY_ATTACK_CHOICE_TYPES = new Set([
  "singleAttack",
  "attackTag"
]);

function getEnemyQualityId(quality = {}) {
  return String(quality.id ?? quality.system?.sourceId ?? "").trim();
}

function getEnemyQualityBaseRank(quality = {}) {
  return Math.max(1, Number(quality.rank?.value ?? 1));
}

function getEnemyQualityMaxRank(quality = {}) {
  return Math.max(
    getEnemyQualityBaseRank(quality),
    Number(quality.rank?.max ?? 1)
  );
}

function enemyQualityRequiresAttackChoice(quality = {}) {
  const choiceType = String(quality.choices?.type ?? "").trim();

  return Boolean(
    quality.choices?.required &&
    ENEMY_ATTACK_CHOICE_TYPES.has(choiceType)
  );
}

function enemyQualityHasManualChoice(quality = {}) {
  return Boolean(
    quality.choices?.required &&
    !enemyQualityRequiresAttackChoice(quality)
  );
}

function getEnemyQualityPositiveCost(quality = {}, rank = 1) {
  if (quality.tier === "free" || quality.category?.free) return 0;
  if (quality.tier === "negative" || quality.category?.negative) return 0;

  const dp = Math.max(0, Number(quality.cost?.dp ?? 0));
  const effectiveRank = Math.max(1, Number(rank ?? 1));

  return quality.cost?.perRank ? dp * effectiveRank : dp;
}

function getEnemyQualityNegativeValue(quality = {}, rank = 1) {
  const isNegative = Boolean(
    quality.tier === "negative" ||
    quality.category?.negative ||
    quality.cost?.grantsDp
  );

  if (!isNegative) return 0;

  const dp = Math.abs(Number(quality.cost?.dp ?? 0));
  const effectiveRank = Math.max(1, Number(rank ?? 1));

  return quality.cost?.perRank ? dp * effectiveRank : dp;
}

function getEnemyQualityFreeLimit(form = {}) {
  const stage = getEnemyStageData(form);

  if (Number.isFinite(Number(stage.freeQualityLimit))) {
    return Math.max(0, Number(stage.freeQualityLimit));
  }

  const stageKey = String(form.stageKey ?? "");
  if (stageKey === "baby1") return 0;

  return 1;
}

function getEnemyQualityNegativeLimit(form = {}) {
  const stage = getEnemyStageData(form);

  if (Number.isFinite(Number(stage.negativeLimit))) {
    return Math.max(0, Number(stage.negativeLimit));
  }

  const stageKey = String(form.stageKey ?? "");

  if (stageKey === "baby1") return 0;
  if (stageKey === "baby2") return 2;
  if (stageKey === "ultimatePlus") return 25;

  return Math.max(
    0,
    (getEnemyStageValue(form) - 1) * 5
  );
}

function normalizeEnemyQualityName(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function parseEnemyQualityNameList(value = "") {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const ENEMY_QUALITY_STAGE_ORDER = {
  baby1: 0,
  baby2: 1,
  child: 2,
  adult: 3,
  perfect: 4,
  ultimate: 5,
  mega: 5,
  ultimatePlus: 6
};

function getEnemyQualityById(qualityId = "") {
  const id = String(qualityId ?? "").trim();

  return DDA_DIGIMON_QUALITIES.find((quality) => {
    return String(quality.id ?? "") === id;
  }) ?? null;
}

function getEnemyQualityStageOrder(quality = {}) {
  const minimumStage = String(
    quality.stageRequirement?.minimum ??
    quality.availability?.minimumStage ??
    ""
  ).trim();

  if (!minimumStage) return 0;

  return ENEMY_QUALITY_STAGE_ORDER[minimumStage] ?? 0;
}

function getEnemyFormStageOrder(form = {}) {
  const stageKey = String(form.stageKey ?? "").trim();

  if (stageKey in ENEMY_QUALITY_STAGE_ORDER) {
    return ENEMY_QUALITY_STAGE_ORDER[stageKey];
  }

  return Math.max(
    0,
    Number(form.stageValue ?? 0)
  );
}

function getEnemyQualityNameKeys(quality = {}) {
  return [
    quality.id,
    quality.name,
    quality.originalName
  ]
    .map(normalizeEnemyQualityName)
    .filter(Boolean);
}

function getEnemyChoiceOption(quality = {}, choiceKey = "") {
  const key = String(choiceKey ?? "").trim();

  if (!key) return null;

  const options = Array.isArray(quality.choices?.options)
    ? quality.choices.options
    : [];

  return options.find((option) => {
    return String(option.key ?? "") === key;
  }) ?? null;
}

function getEnemyQualityChoiceRows(
  quality = {},
  selection = {},
  dynamicOptions = []
) {
  const choiceKeys = Array.isArray(selection.choiceKeys)
    ? selection.choiceKeys
    : [];

  const staticOptions = Array.isArray(quality.choices?.options)
    ? quality.choices.options
    : [];

  const allOptions = [
    ...staticOptions,
    ...dynamicOptions
  ];

  return choiceKeys
    .map((choiceKey, index) => {
      const key = String(choiceKey ?? "").trim();

      const option = allOptions.find((entry) => {
        return String(entry.key ?? "") === key;
      });

      if (!option) return null;

      return {
        rank: index + 1,
        key,
        label: String(option.label ?? option.key ?? ""),
        originalLabel: String(option.originalLabel ?? ""),
        effect: String(option.effect ?? ""),
        type: String(option.type ?? "")
      };
    })
    .filter(Boolean);
}

function getEnemyQualityDisplayRank(selection = {}, quality = {}) {
  return Math.max(
    getEnemyQualityBaseRank(quality),
    Number(selection.rank ?? getEnemyQualityBaseRank(quality))
  );
}

function getApplicationRoot(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

export class DDADigimonEnemyWizard extends DDADigimonEnemyWizardBase {
  static DEFAULT_OPTIONS = {
    id: "dda-digimon-enemy-wizard",
    tag: "section",
    classes: ["dda", "dda-digimon-enemy-wizard"],

    position: {
      width: 1280,
      height: 860
    },

    window: {
      icon: "fa-solid fa-skull",
      title: "Criar Digimon Inimigo",
      resizable: true
    },

    actions: {
      selectEnemyForm: DDADigimonEnemyWizard._onSelectEnemyForm,
      toggleEnemyCategory: DDADigimonEnemyWizard._onToggleEnemyCategory,
      showAllEnemyCategories: DDADigimonEnemyWizard._onShowAllEnemyCategories,
      clearEnemyFilters: DDADigimonEnemyWizard._onClearEnemyFilters,
      clearEnemySearch: DDADigimonEnemyWizard._onClearEnemySearch,
      adjustEnemyStat: DDADigimonEnemyWizard._onAdjustEnemyStat,
      resetEnemyStats: DDADigimonEnemyWizard._onResetEnemyStats,
      addEnemyAttack: DDADigimonEnemyWizard._onAddEnemyAttack,
      removeEnemyAttack: DDADigimonEnemyWizard._onRemoveEnemyAttack,
      openEnemyQualityBrowser: DDADigimonEnemyWizard._onOpenEnemyQualityBrowser,
      removeEnemyQuality: DDADigimonEnemyWizard._onRemoveEnemyQuality,
      createEnemyNpc: DDADigimonEnemyWizard._onCreateEnemyNpc
    }
  };

  static PARTS = {
    main: {
      template: "systems/digimon-digital-adventures/templates/apps/dda-digimon-enemy-wizard.hbs",
      scrollable: [
        ".dda-enemy-form-results",
        ".dda-enemy-preview-panel"
        ]
    }
  };

  static open(options = {}) {
    if (!game.user?.isGM) {
      ui.notifications.warn(text(
        "Somente o Narrador pode abrir o Criador de Digimon Inimigo.",
        "Only the GM can open the Enemy Digimon Builder."
      ));

      return null;
    }

    return new this(options).render({ force: true });
  }

  constructor(options = {}) {
    super(options);

    this.filters = defaultFilters();
    this.selectedFormId = "";
    this.enemyName = "";
    this.enemyBuild = createEnemyBuild();
    this._enemyBuildFormId = "";
    this._enemyQualityBrowser = null;

    this._databaseForms = [];
    this._databaseLoaded = false;
    this._databasePromise = null;

    this._staticPortraitIndex = new Map();
    this._staticTokenIndex = new Map();
    this._staticAssetPaths = new Set();
    this._staticPortraitIndexPromise = null;
  }

  async _prepareContext() {
    const isGM = Boolean(game.user?.isGM);

    if (!isGM) {
      return {
        isGM: false,
        title: text("Criar Digimon Inimigo", "Create Enemy Digimon")
      };
    }

    await this._loadDatabaseForms();

    const matchingForms = this._getFilteredForms();
    const results = matchingForms.slice(0, DDA_ENEMY_FORM_LIMIT);
    const selectedForm = this._getSelectedForm();

    const enemyBuild = selectedForm
      ? this._getEnemyBuildPreview(selectedForm)
      : null;

    return {
      isGM: true,
      title: text("Criar Digimon Inimigo", "Create Enemy Digimon"),
      subtitle: text(
        "Escolha uma forma da database. Ela cria um NPC independente, sem parceiro, Tamer, linha persistente ou Marcos.",
        "Choose a form from the database. It creates an independent NPC, without a partner, Tamer, persistent line, or Milestones."
      ),
      searchHint: text(
        "Digite livremente. A busca só é aplicada ao pressionar Enter.",
        "Type freely. Search is only applied when you press Enter."
      ),
      enemyDevicePath: `systems/${DDA_SYSTEM_ID}/assets/ui/digimon-enemy.webp`,

      filters: {
        ...this.filters,
        categories: Array.from(this.filters.categories)
      },

      stageOptions: this._getStageOptions(),
      attributeOptions: this._getAttributeOptions(),
      typeOptions: this._getTextFilterOptions("type"),
      fieldOptions: this._getTextFilterOptions("field"),
      groupOptions: this._getTextFilterOptions("group"),
      categoryFilters: this._getCategoryFilters(),

      results: results.map((form) => ({
        ...form,
        selected: form.id === this.selectedFormId
      })),

      resultCount: matchingForms.length,
      resultLimited: matchingForms.length > DDA_ENEMY_FORM_LIMIT,
      resultLimit: DDA_ENEMY_FORM_LIMIT,

      selectedForm,
      enemyName: this.enemyName,
      enemyBuild,
      hasSelectedForm: Boolean(selectedForm),
      enemyRoleOptions: this._getEnemyRoleOptions(),

      labels: {
        search: text("Buscar forma", "Search form"),
        stage: text("Estágio", "Stage"),
        attribute: text("Atributo", "Attribute"),
        type: text("Tipo", "Type"),
        field: text("Campo", "Field"),
        group: text("Grupo", "Group"),
        categories: text("Categorias de forma", "Form categories"),
        all: text("Todos", "All"),
        reset: text("Limpar filtros", "Clear filters"),
        allCategories: text("Todas as formas", "All forms"),
        results: text("Resultados", "Results"),
        noResults: text(
          "Nenhuma forma corresponde aos filtros atuais.",
          "No form matches the current filters."
        ),
        refine: text(
          `Mostrando as primeiras ${DDA_ENEMY_FORM_LIMIT}. Refine os filtros ou use a busca.`,
          `Showing the first ${DDA_ENEMY_FORM_LIMIT}. Refine the filters or use search.`
        ),
        selected: text("Forma selecionada", "Selected form"),
        source: text("Categoria", "Category"),
        npcName: text("Nome do inimigo", "Enemy name"),
        npcNameHint: text(
          "Deixe vazio para usar o nome da espécie.",
          "Leave blank to use the species name."
        ),
        create: text("Criar NPC Inimigo", "Create Enemy NPC"),
        choose: text(
          "Escolha uma forma na lista para criar o inimigo.",
          "Choose a form from the list to create the enemy."
        ),
        special: text("Forma alternativa", "Alternative form"),

        build: text("Montar inimigo", "Build enemy"),
        budget: text("Orçamento individual", "Individual budget"),
        stageBaseDp: text("PD padrão do estágio", "Stage default DP"),
        baseDp: text("PD base deste inimigo", "This enemy's base DP"),
        bonusDp: text("Bonus DP alocado", "Allocated Bonus DP"),
        totalDp: text("PD total", "Total DP"),
        spentDp: text("PD gastos", "DP spent"),
        remainingDp: text("PD restantes", "DP remaining"),

        statInvestment: text("Investimento em atributos", "Stat investment"),
        resetStats: text("Redefinir atributos", "Reset stats"),
        starting: text("Inicial", "Starting"),
        invested: text("Investido", "Invested"),
        total: text("Total", "Total"),

        derived: text("Prévia de derivados", "Derived stat preview"),
        wounds: text("Caixas de Ferimento", "Wound Boxes"),
        attacks: text("Ataques", "Attacks"),
        addAttack: text("Adicionar Ataque", "Add Attack"),
        removeAttack: text("Remover Ataque", "Remove Attack"),
        attackName: text("Nome do Ataque", "Attack Name"),
        attackRangeType: text("Alcance", "Range Type"),
        attackFunctionType: text("Função", "Function"),

        role: text("Função no encontro", "Encounter role"),
        goal: text("Objetivo", "Goal"),
        motivation: text("Motivação", "Motivation"),
        tactic: text("Tática / gimmick", "Tactic / gimmick"),
        notes: text("Notas secretas do Narrador", "GM private notes"),

        baseDpHint: text(
          "Por padrão, use o valor do estágio. Ajuste apenas quando o antagonista tiver um rank próprio.",
          "Use the stage value by default. Adjust it only when the antagonist has its own rank."
        ),

        bonusDpHint: text(
          "Use aqui a parcela de Bonus DP que este inimigo recebeu do orçamento do encontro.",
          "Enter the share of Bonus DP this enemy received from the encounter budget here."
        ),

        healthAdvice: text(
          "Para grupos menores que a equipe, prefira investir sobrevivência em Saúde antes de inflar Esquiva ou Armadura.",
          "For groups smaller than the party, prefer investing survivability in Health before inflating Dodge or Armor."
        ),

        overBudget: text(
          "A construção excede o orçamento deste inimigo.",
          "This build exceeds this enemy's budget."
        ),

        createAndOpen: text(
          "Criar NPC e abrir ficha",
          "Create NPC and open sheet"
        ),

        qualities: text("Qualidades", "Qualities"),
        openQualities: text("Abrir catálogo", "Open browser"),
        selectedQualities: text("Qualidades selecionadas", "Selected Qualities"),
        noSelectedQualities: text(
          "Nenhuma Qualidade selecionada ainda.",
          "No Qualities selected yet."
        ),
        removeQuality: text("Remover", "Remove"),
        qualityBrowserHint: text(
          "Escolha as Qualidades pelo catálogo. O custo delas entra no orçamento de PD do inimigo.",
          "Choose Qualities from the browser. Their cost is counted against the enemy's DP budget."
        ),
        qualityDp: text("PD em Qualidades", "Quality DP"),
        negativeDp: text("PD negativo", "Negative DP"),
        freeQualities: text("Gratuitas", "Free")
      }
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const root = this.element;

    if (!root) return;

    this._bindImageFallbacks(root);

    const searchInput = root.querySelector("[data-enemy-search]");

    searchInput?.addEventListener("input", (event) => {
      this.filters.searchDraft = String(
        event.currentTarget?.value ?? ""
      );
    });

    searchInput?.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;

      event.preventDefault();

      this.filters.searchDraft = String(
        event.currentTarget?.value ?? ""
      );

      this.filters.searchTerm = this.filters.searchDraft.trim();

      await this._renderPreservingScroll({
        preserveForms: false,
        preservePreview: true
      });
    });

    root.querySelectorAll("[data-enemy-filter]").forEach((select) => {
      select.addEventListener("change", async (event) => {
        const key = String(
          event.currentTarget?.dataset?.enemyFilter ?? ""
        );

        if (!key || !(key in this.filters)) return;

        this.filters[key] = String(
          event.currentTarget?.value ?? "all"
        );

        await this._renderPreservingScroll({
          preserveForms: false,
          preservePreview: true
        });
      });
    });

    root.querySelector("[data-enemy-name]")?.addEventListener("input", (event) => {
      this.enemyName = String(
        event.currentTarget?.value ?? ""
      );
    });

    root.querySelectorAll("[data-enemy-build-number]").forEach((input) => {
      input.addEventListener("change", async (event) => {
        const key = String(
          event.currentTarget?.dataset?.enemyBuildNumber ?? ""
        );

        if (!key) return;

        this._setEnemyBuildNumber(
          key,
          event.currentTarget?.value
        );

        this._patchEnemyBuildPreview();
      });
    });

    root.querySelector("[data-enemy-role]")?.addEventListener("change", (event) => {
      this.enemyBuild.role = String(
        event.currentTarget?.value ?? "standard"
      );
    });

    root.querySelectorAll("[data-enemy-build-text]").forEach((field) => {
      field.addEventListener("input", (event) => {
        const key = String(
          event.currentTarget?.dataset?.enemyBuildText ?? ""
        );

        if (!key) return;

        this.enemyBuild[key] = String(
          event.currentTarget?.value ?? ""
        );
      });
    });

    root.querySelectorAll("[data-enemy-attack-field]").forEach((field) => {
  const eventName = field.tagName === "SELECT"
    ? "change"
    : "input";

  field.addEventListener(eventName, async (event) => {
    const attackKey = String(
      event.currentTarget?.dataset?.attackKey ?? ""
    );

    const fieldKey = String(
      event.currentTarget?.dataset?.enemyAttackField ?? ""
    );

    if (!attackKey || !fieldKey) return;

    this._setEnemyAttackField(
      attackKey,
      fieldKey,
      event.currentTarget?.value
    );

    await this._enemyQualityBrowser?.render({ force: true });
  });
});
  }

  _captureWizardScrollState() {
    const root = this.element;

    const formResults = root?.querySelector(
      ".dda-enemy-form-results"
    );

    const previewPanel = root?.querySelector(
      ".dda-enemy-preview-panel"
    );

    return {
      formsTop: Number(formResults?.scrollTop ?? 0),
      formsLeft: Number(formResults?.scrollLeft ?? 0),

      previewTop: Number(previewPanel?.scrollTop ?? 0),
      previewLeft: Number(previewPanel?.scrollLeft ?? 0)
    };
  }

  async _renderPreservingScroll({
    preserveForms = true,
    preservePreview = true
  } = {}) {
    const scrollState = this._captureWizardScrollState();

    await this.render();

    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });

    const root = this.element;

    const formResults = root?.querySelector(
      ".dda-enemy-form-results"
    );

    const previewPanel = root?.querySelector(
      ".dda-enemy-preview-panel"
    );

    if (preserveForms && formResults) {
      formResults.scrollTop = scrollState.formsTop;
      formResults.scrollLeft = scrollState.formsLeft;
    }

    if (preservePreview && previewPanel) {
      previewPanel.scrollTop = scrollState.previewTop;
      previewPanel.scrollLeft = scrollState.previewLeft;
    }
  }
  static async _onSelectEnemyForm(event, target) {
    event.preventDefault();

    this.selectedFormId = String(
      target?.dataset?.formId ?? ""
    );

    const selected = this._getSelectedForm();

    if (selected) {
      this._resetEnemyBuildForForm(selected);
      this.enemyName = selected.displayName;
    }

    await this._renderPreservingScroll({
      preserveForms: true,
      preservePreview: false
    });
  }

  static async _onToggleEnemyCategory(event, target) {
    event.preventDefault();

    const category = String(
      target?.dataset?.category ?? ""
    );

    if (!ENEMY_FORM_CATEGORY_ORDER.includes(category)) return;

    if (this.filters.categories.has(category)) {
      if (this.filters.categories.size > 1) {
        this.filters.categories.delete(category);
      }
    } else {
      this.filters.categories.add(category);
    }

    await this._renderPreservingScroll({
      preserveForms: false,
      preservePreview: true
    });
  }

  static async _onShowAllEnemyCategories(event) {
    event.preventDefault();

    this.filters.categories = new Set(
      ENEMY_FORM_CATEGORY_ORDER
    );

    await this._renderPreservingScroll({
      preserveForms: false,
      preservePreview: true
    });
  }

  static async _onClearEnemyFilters(event) {
    event.preventDefault();

    this.filters = defaultFilters();

    await this._renderPreservingScroll({
      preserveForms: false,
      preservePreview: true
    });
  }

  static async _onClearEnemySearch(event) {
    event.preventDefault();

    this.filters.searchDraft = "";
    this.filters.searchTerm = "";

    await this._renderPreservingScroll({
      preserveForms: false,
      preservePreview: true
    });
  }

  static _onAdjustEnemyStat(event, target) {
    event.preventDefault();

    const statKey = String(
      target?.dataset?.stat ?? ""
    );

    const adjustment = Number(
      target?.dataset?.adjust ?? 0
    );

    this._adjustEnemyStat(statKey, adjustment);
    this._patchEnemyBuildPreview();
  }

  static _onResetEnemyStats(event) {
    event.preventDefault();

    const form = this._getSelectedForm();

    if (!form) return;
this._resetEnemyBuildForForm(form, {
  preserveNarrative: true,
  preserveBudget: true,
  preserveAttacks: true,
  preserveQualities: true
});

    this._patchEnemyBuildPreview();
  }

  static async _onAddEnemyAttack(event) {
  event.preventDefault();

  this._addEnemyAttack();

  await this._renderPreservingScroll({
    preserveForms: true,
    preservePreview: true
  });

  await this._enemyQualityBrowser?.render({ force: true });
}

static async _onRemoveEnemyAttack(event, target) {
  event.preventDefault();

  const attackKey = String(
    target?.dataset?.attackKey ?? ""
  );

  if (!attackKey) return;

  this._removeEnemyAttack(attackKey);

  await this._renderPreservingScroll({
    preserveForms: true,
    preservePreview: true
  });

  await this._enemyQualityBrowser?.render({ force: true });
}

  static _onOpenEnemyQualityBrowser(event) {
  event.preventDefault();

  const form = this._getSelectedForm();

  if (!form) {
    ui.notifications.warn(text(
      "Escolha uma forma antes de abrir o catálogo de Qualidades.",
      "Choose a form before opening the Quality browser."
    ));

    return;
  }

  if (!this._enemyQualityBrowser) {
    this._enemyQualityBrowser = new DDAEnemyQualityBrowser(this);
  }

  this._enemyQualityBrowser.render({ force: true });
}

  static async _onRemoveEnemyQuality(event, target) {
    event.preventDefault();

    const qualityId = String(
      target?.dataset?.qualityId ?? ""
    );

    if (!qualityId) return;

    this.removeEnemyQualityById(qualityId);

    await this._renderPreservingScroll({
      preserveForms: true,
      preservePreview: true
    });

    await this._enemyQualityBrowser?.render({ force: true });
  }

  static async _onCreateEnemyNpc(event) {
    event.preventDefault();

    await this._createEnemyNpc();
  }

    _patchEnemyBuildPreview() {
    const form = this._getSelectedForm();

    if (!form || !this.element) return;

    const build = this._getEnemyBuildPreview(form);
    const root = this.element;

    const setText = (selector, value) => {
      root.querySelectorAll(selector).forEach((element) => {
        element.textContent = String(value);
      });
    };

    for (const stat of build.statRows) {
      setText(
        `[data-enemy-stat-investment="${stat.key}"]`,
        stat.investment
      );

      setText(
        `[data-enemy-stat-total="${stat.key}"]`,
        stat.total
      );
    }

    for (const derived of build.derivedRows) {
      setText(
        `[data-enemy-derived="${derived.key}"]`,
        derived.value
      );
    }

    setText("[data-enemy-wounds]", build.wounds);
    setText("[data-enemy-movement]", build.movement);
    setText("[data-enemy-range]", build.range);
    setText("[data-enemy-effective-limit]", build.effectiveLimit);

    setText("[data-enemy-total-dp]", build.totalDp);
    setText("[data-enemy-spent-dp]", build.spentDp);
    setText("[data-enemy-remaining-dp]", build.remainingDp);

        setText("[data-enemy-quality-dp]", build.qualityDp);
    setText("[data-enemy-negative-quality-dp]", build.negativeQualityDp);
    setText(
      "[data-enemy-free-quality-count]",
      `${build.freeQualityCount}/${build.freeQualityLimit}`
    );

    const budgetSummary = root.querySelector(
      "[data-enemy-budget-summary]"
    );

    budgetSummary?.classList.toggle(
      "is-over-budget",
      build.hasBudgetOverrun
    );

    const overBudgetWarning = root.querySelector(
      "[data-enemy-over-budget]"
    );

    if (overBudgetWarning) {
      overBudgetWarning.hidden = !build.hasBudgetOverrun;
    }

    const createButton = root.querySelector(
      '[data-action="createEnemyNpc"]'
    );

    if (createButton) {
      createButton.disabled = build.hasBudgetOverrun;
    }
  }


    _getEnemyRoleOptions() {
    const currentRole = String(
      this.enemyBuild?.role ?? "standard"
    );

    return ENEMY_ROLE_DEFINITIONS.map((entry) => ({
      key: entry.key,
      label: text(entry.pt, entry.en),
      selected: entry.key === currentRole
    }));
  }

  _ensureEnemyBuildForForm(form) {
    if (!form) return createEnemyBuild();

    if (this._enemyBuildFormId !== form.id) {
      this._resetEnemyBuildForForm(form);
    }

    return this.enemyBuild;
  }

_resetEnemyBuildForForm(form, {
  preserveNarrative = false,
  preserveBudget = false,
  preserveAttacks = false,
  preserveQualities = false
} = {}) {
    const previous = this.enemyBuild ?? {};
    const next = createEnemyBuild(form);

    if (preserveNarrative) {
      next.role = String(previous.role ?? next.role);
      next.goal = String(previous.goal ?? "");
      next.motivation = String(previous.motivation ?? "");
      next.tactic = String(previous.tactic ?? "");
      next.notes = String(previous.notes ?? "");
    }

    if (preserveBudget) {
      next.baseDp = toNonNegativeInteger(
        previous.baseDp,
        next.baseDp
      );

      next.bonusDp = toNonNegativeInteger(
        previous.bonusDp,
        0
      );
    }

    if (preserveAttacks) {
  next.attacks = foundry.utils.deepClone(
    previous.attacks ?? []
  );
}

    if (preserveQualities) {
  next.selectedQualities = foundry.utils.deepClone(
    previous.selectedQualities ?? []
  );
}

    this.enemyBuild = next;
    this._enemyBuildFormId = String(form.id ?? "");
  }

  _setEnemyBuildNumber(key, value) {
    const selected = this._getSelectedForm();

    if (selected) {
      this._ensureEnemyBuildForForm(selected);
    }

    if (!["baseDp", "bonusDp"].includes(key)) return;

    this.enemyBuild[key] = toNonNegativeInteger(
      value,
      this.enemyBuild[key]
    );
  }

  _getEnemyAttackRows() {
  const attacks = Array.isArray(this.enemyBuild?.attacks)
    ? this.enemyBuild.attacks
    : [];

  this.enemyBuild.attacks = attacks.map((attack, index) => {
    return normalizeEnemyAttackDraft(attack, index);
  });

  return this.enemyBuild.attacks.map((attack, index) => ({
    ...attack,

    index,
    slot: index + 1,

    rangeLabel: getEnemyAttackRangeLabel(attack.rangeType),
    functionLabel: getEnemyAttackFunctionLabel(attack.functionType),

    rangeOptions: ENEMY_ATTACK_RANGE_OPTIONS.map((option) => ({
      key: option.key,
      label: text(option.pt, option.en),
      selected: option.key === attack.rangeType
    })),

    functionOptions: ENEMY_ATTACK_FUNCTION_OPTIONS.map((option) => ({
      key: option.key,
      label: text(option.pt, option.en),
      selected: option.key === attack.functionType
    }))
  }));
}

getEnemyAttackChoiceOptions() {
  return this._getEnemyAttackRows()
    .filter((attack) => String(attack.name ?? "").trim())
    .map((attack) => ({
      key: attack.key,
      label: attack.name,
      rangeType: attack.rangeType,
      functionType: attack.functionType
    }));
}

_getEnemyQualityDynamicChoiceOptions(quality = {}) {
  if (!enemyQualityRequiresAttackChoice(quality)) {
    return [];
  }

  return this.getEnemyAttackChoiceOptions().map((attack) => ({
    key: attack.key,
    label: `${attack.label} · ${attack.rangeType === "range" ? text("À distância", "Range") : text("Corpo a corpo", "Melee")}`,
    originalLabel: attack.label,
    type: "attack",
    rangeType: attack.rangeType,
    functionType: attack.functionType
  }));
}

getEnemyQualityBrowserChoiceOptions(quality = {}) {
  return this._getEnemyQualityDynamicChoiceOptions(quality);
}

_addEnemyAttack() {
  this.enemyBuild.attacks ??= [];

  this.enemyBuild.attacks.push(
    createEnemyAttackDraft(this.enemyBuild.attacks.length)
  );
}

_removeEnemyAttack(attackKey = "") {
  const key = String(attackKey ?? "");

  this.enemyBuild.attacks = (
    this.enemyBuild.attacks ?? []
  ).filter((attack) => {
    return String(attack.key ?? "") !== key;
  });

  if (!this.enemyBuild.attacks.length) {
    this.enemyBuild.attacks.push(
      createEnemyAttackDraft(0)
    );
  }

  this.enemyBuild.selectedQualities = (
    this.enemyBuild.selectedQualities ?? []
  ).filter((quality) => {
    const choiceKeys = Array.isArray(quality.choiceKeys)
      ? quality.choiceKeys
      : [];

    return !choiceKeys.some((choiceKey) => {
      return String(choiceKey ?? "") === key;
    });
  });
}

_setEnemyAttackField(attackKey = "", fieldKey = "", value = "") {
  const key = String(attackKey ?? "");

  const attack = (this.enemyBuild.attacks ?? []).find((entry) => {
    return String(entry.key ?? "") === key;
  });

  if (!attack) return;

  if (fieldKey === "name") {
    attack.name = String(value ?? "").trim();
    return;
  }

  if (fieldKey === "rangeType") {
    attack.rangeType = ENEMY_ATTACK_RANGE_OPTIONS.some((option) => {
      return option.key === value;
    })
      ? value
      : "melee";

    return;
  }

  if (fieldKey === "functionType") {
    attack.functionType = ENEMY_ATTACK_FUNCTION_OPTIONS.some((option) => {
      return option.key === value;
    })
      ? value
      : "damage";
  }
}

_buildEnemyAttackItems(form = {}, build = {}) {
  const stageKey = String(form.stageKey ?? "child");
  const rows = Array.isArray(build.attackRows)
    ? build.attackRows
    : [];

  return rows
    .filter((attack) => String(attack.name ?? "").trim())
    .map((attack, index) => {
      const rangeType = ["melee", "range"].includes(attack.rangeType)
        ? attack.rangeType
        : "melee";

      const functionType = ["damage", "support"].includes(attack.functionType)
        ? attack.functionType
        : "damage";

      const isRanged = rangeType === "range";
      const isSupport = functionType === "support";

      return {
        name: String(
          attack.name ??
          text(`Ataque ${index + 1}`, `Attack ${index + 1}`)
        ).trim(),

        type: "attack",
        img: isSupport ? "icons/svg/aura.svg" : "icons/svg/sword.svg",

        flags: {
          [DDA_SYSTEM_ID]: {
            enemyBuilderAttackKey: attack.key
          }
        },

        system: {
          isSignature: false,

          baseTags: {
            rangeType,
            functionType
          },

          range: {
            value: isRanged ? 3 : 0,
            bonus: 0,
            qualityBonus: 0,
            total: isRanged ? 3 : 0
          },

          effectiveLimit: {
            value: isRanged ? 3 : 0,
            bonus: 0,
            qualityBonus: 0,
            total: isRanged ? 3 : 0
          },

          qualityTags: [],

          effectTag: {
            enabled: false,
            tag: "",
            type: "",
            sourceQualityId: "",
            potencyStat: "",
            duration: true
          },

          accuracy: {
            baseFormula: "@actor.mainStats.accuracy.total",
            bonus: 0,
            automaticSuccesses: 0,
            display: "",
            formulaAdvanced: false
          },

          damage: {
            enabled: !isSupport,
            baseFormula: "@actor.mainStats.damage.total",
            bonus: 0,
            unalterable: 0,
            minimum: 1,
            display: "",
            formulaAdvanced: false
          },

          support: {
            enabled: isSupport,
            effect: "",
            potency: 0,
            duration: 1
          },

          actionCost: {
            value: 1,
            extra: 0
          },

          qualityTagLimit: {
            count: 0,
            max: 3
          },

          batteryScaling: {
            accuracy: true,
            damage: !isSupport,
            potency: isSupport
          },

          wizard: {
            createdByEnemyWizard: true,
            attackKey: attack.key,
            stage: stageKey,
            slot: index + 1
          }
        }
      };
    });
}

    getEnemyQualitySelection(qualityId = "") {
    const id = String(qualityId ?? "").trim();

    return this.enemyBuild?.selectedQualities?.find((entry) => {
      return String(entry.id ?? "") === id;
    }) ?? null;
  }

  getEnemyQualitySelectionRank(qualityId = "") {
    const selection = this.getEnemyQualitySelection(qualityId);

    return Math.max(0, Number(selection?.rank ?? 0));
  }

  _getEnemySelectedQualityRows(form = this._getSelectedForm()) {
    const selections = Array.isArray(this.enemyBuild?.selectedQualities)
      ? this.enemyBuild.selectedQualities
      : [];

    return selections
      .map((selection) => {
        const quality = getEnemyQualityById(selection.id);

        if (!quality) return null;

        const rank = getEnemyQualityDisplayRank(selection, quality);
        const qualityDp = getEnemyQualityPositiveCost(quality, rank);
        const negativeDp = getEnemyQualityNegativeValue(quality, rank);
        const isFree = Boolean(
          quality.tier === "free" ||
          quality.category?.free
        );

const choiceRows = getEnemyQualityChoiceRows(
  quality,
  selection,
  this._getEnemyQualityDynamicChoiceOptions(quality)
);

        const choiceLabel = choiceRows
          .map((choice) => choice.label)
          .filter(Boolean)
          .join(", ");

        return {
          id: String(quality.id ?? ""),
          name: String(quality.name ?? ""),
          originalName: String(quality.originalName ?? ""),
          section: String(quality.section ?? ""),
          tier: String(quality.tier ?? ""),
          rank,
          qualityDp,
          negativeDp,
          isFree,
          choiceRows,
          choiceLabel,
          quality,
          removeLabel: text("Remover", "Remove")
        };
      })
      .filter(Boolean);
  }

  _getSelectedQualityNameKeySet() {
    const keys = new Set();

    for (const row of this._getEnemySelectedQualityRows()) {
      for (const key of getEnemyQualityNameKeys(row.quality)) {
        keys.add(key);
      }
    }

    return keys;
  }

  _validateEnemyQualityRequirements(quality = {}, form = {}) {
if (
  enemyQualityRequiresAttackChoice(quality) &&
  !this.getEnemyAttackChoiceOptions().length
) {
  return text(
    "Crie pelo menos um Ataque antes de adicionar esta Qualidade.",
    "Create at least one Attack before adding this Quality."
  );
}

    const choiceType = String(quality.choices?.type ?? "").trim();

if (
  quality.choices?.required &&
  choiceType &&
  choiceType !== "single" &&
  !ENEMY_ATTACK_CHOICE_TYPES.has(choiceType)
) {
  return text(
    "Esta Qualidade exige uma escolha especial que ainda não foi automatizada neste wizard.",
    "This Quality requires a special choice that is not automated in this wizard yet."
  );
}

    if (getEnemyQualityStageOrder(quality) > getEnemyFormStageOrder(form)) {
      return text(
        "O estágio desta forma ainda não atende ao requisito da Qualidade.",
        "This form's stage does not meet the Quality requirement yet."
      );
    }

    const requirementNames = parseEnemyQualityNameList(
      quality.requirements?.qualityNames
    );

    if (requirementNames.length) {
      const selectedNames = this._getSelectedQualityNameKeySet();

      const missing = requirementNames.find((requiredName) => {
        return !selectedNames.has(
          normalizeEnemyQualityName(requiredName)
        );
      });

      if (missing) {
        return text(
          `Requisito ausente: ${missing}.`,
          `Missing requirement: ${missing}.`
        );
      }
    }

    const selectedRows = this._getEnemySelectedQualityRows();
    const nextQualityNameKeys = new Set(
      getEnemyQualityNameKeys(quality)
    );

    const incompatibleNames = parseEnemyQualityNameList(
      quality.incompatible?.qualityNames
    );

    if (incompatibleNames.length) {
      const selectedNames = this._getSelectedQualityNameKeySet();

      const conflict = incompatibleNames.find((entry) => {
        return selectedNames.has(normalizeEnemyQualityName(entry));
      });

      if (conflict) {
        return text(
          `Incompatível com ${conflict}.`,
          `Incompatible with ${conflict}.`
        );
      }
    }

    for (const selected of selectedRows) {
      const selectedIncompatibles = parseEnemyQualityNameList(
        selected.quality?.incompatible?.qualityNames
      );

      const conflict = selectedIncompatibles.find((entry) => {
        return nextQualityNameKeys.has(
          normalizeEnemyQualityName(entry)
        );
      });

      if (conflict) {
        return text(
          `Incompatível com ${selected.name}.`,
          `Incompatible with ${selected.name}.`
        );
      }
    }

    return "";
  }

  addEnemyQualityById(qualityId = "", {
    choiceKey = ""
  } = {}) {
    const form = this._getSelectedForm();

    if (!form) {
      ui.notifications.warn(text(
        "Escolha uma forma antes de adicionar Qualidades.",
        "Choose a form before adding Qualities."
      ));

      return false;
    }

    this._ensureEnemyBuildForForm(form);

    const quality = getEnemyQualityById(qualityId);

    if (!quality) {
      ui.notifications.warn(text(
        "Qualidade não encontrada.",
        "Quality not found."
      ));

      return false;
    }

    const validationMessage = this._validateEnemyQualityRequirements(
      quality,
      form
    );

    if (validationMessage) {
      ui.notifications.warn(validationMessage);
      return false;
    }

if (quality.choices?.required) {
  const staticOptions = Array.isArray(quality.choices?.options)
    ? quality.choices.options
    : [];

  const dynamicOptions = this._getEnemyQualityDynamicChoiceOptions(
    quality
  );

  const options = [
    ...staticOptions,
    ...dynamicOptions
  ];

  if (!choiceKey || !options.some((option) => {
    return String(option.key ?? "") === String(choiceKey);
  })) {
    ui.notifications.warn(text(
      "Escolha uma opção antes de adicionar esta Qualidade.",
      "Choose an option before adding this Quality."
    ));

    return false;
  }
}

    const previousSelection = foundry.utils.deepClone(
      this.enemyBuild.selectedQualities ?? []
    );

    const existing = this.enemyBuild.selectedQualities.find((entry) => {
      return String(entry.id ?? "") === String(quality.id ?? "");
    });

    const maxRank = getEnemyQualityMaxRank(quality);

    if (existing) {
      const currentRank = Math.max(
        1,
        Number(existing.rank ?? 1)
      );

      if (currentRank >= maxRank) {
        ui.notifications.warn(text(
          "Esta Qualidade já está no rank máximo.",
          "This Quality is already at maximum rank."
        ));

        return false;
      }

      existing.rank = currentRank + 1;

      if (quality.choices?.required) {
        existing.choiceKeys ??= [];
        existing.choiceKeys.push(choiceKey);
      }
    } else {
      this.enemyBuild.selectedQualities.push({
        id: String(quality.id ?? ""),
        rank: getEnemyQualityBaseRank(quality),
        choiceKeys: quality.choices?.required ? [choiceKey] : []
      });
    }

    const preview = this._getEnemyBuildPreview(form);

    if (preview.freeQualityOverrun) {
      this.enemyBuild.selectedQualities = previousSelection;

      ui.notifications.warn(text(
        "Este estágio não comporta mais Qualidades gratuitas.",
        "This stage cannot take more free Qualities."
      ));

      return false;
    }

    if (preview.negativeQualityOverrun) {
      this.enemyBuild.selectedQualities = previousSelection;

      ui.notifications.warn(text(
        "O inimigo excedeu o limite de PD negativo permitido.",
        "The enemy exceeded the allowed Negative DP limit."
      ));

      return false;
    }

    if (preview.remainingDp < 0) {
      this.enemyBuild.selectedQualities = previousSelection;

      ui.notifications.warn(text(
        "O inimigo não tem PD suficiente para esta Qualidade.",
        "The enemy does not have enough DP for this Quality."
      ));

      return false;
    }

    return true;
  }

  removeEnemyQualityById(qualityId = "") {
    const id = String(qualityId ?? "").trim();

    this.enemyBuild.selectedQualities = (
      this.enemyBuild.selectedQualities ?? []
    ).filter((entry) => {
      return String(entry.id ?? "") !== id;
    });
  }

  _buildEnemyQualityItems(build = {}) {
    const rows = Array.isArray(build.selectedQualityRows)
      ? build.selectedQualityRows
      : [];

    return rows.map((row) => {
      const itemData = buildQualityItemData(row.quality);

      itemData.system.rank = {
        ...(itemData.system.rank ?? {}),
        value: row.rank
      };

      itemData.system.enemyBuilder = {
        selected: true,
        qualityDp: row.qualityDp,
        negativeDp: row.negativeDp,
        isFree: row.isFree
      };

      if (row.choiceRows?.length) {
        itemData.system.choices = {
          ...(itemData.system.choices ?? {}),
          selectedRanks: foundry.utils.deepClone(row.choiceRows)
        };
      }

      return itemData;
    });
  }

  _adjustEnemyStat(statKey, adjustment = 0) {
    const selected = this._getSelectedForm();

    if (!selected || !ENEMY_STAT_ORDER.includes(statKey)) return;

    this._ensureEnemyBuildForForm(selected);

    const current = toNonNegativeInteger(
      this.enemyBuild.statInvestments?.[statKey],
      0
    );

    const delta = Number.isFinite(Number(adjustment))
      ? Math.trunc(Number(adjustment))
      : 0;

    this.enemyBuild.statInvestments[statKey] = Math.max(
      0,
      current + delta
    );
  }

  _getEnemyBuildPreview(form) {
    const build = this._ensureEnemyBuildForForm(form);

    const stageValue = getEnemyStageValue(form);
    const stageBaseDp = getEnemyStageBaseDp(form);

    const baseDp = toNonNegativeInteger(
      build.baseDp,
      stageBaseDp
    );

    const bonusDp = toNonNegativeInteger(
      build.bonusDp,
      0
    );

    const sizeModifiers = ENEMY_SIZE_MODIFIERS[form.size]
      ?? ENEMY_SIZE_MODIFIERS.medium;

    const statRows = ENEMY_STAT_ORDER.map((statKey) => {
      const investment = toNonNegativeInteger(
        build.statInvestments?.[statKey],
        0
      );

      return {
        key: statKey,
        label: getEnemyStatLabel(statKey),
        starting: stageValue,
        investment,
        total: stageValue + investment
      };
    });

    const statTotals = Object.fromEntries(
      statRows.map((entry) => [entry.key, entry.total])
    );

    const derivedRows = [
      {
        key: "bit",
        label: "BIT",
        value: Math.max(
          0,
          Math.floor(statTotals.accuracy / 3) +
          Number(sizeModifiers.bit ?? 0)
        )
      },
      {
        key: "dos",
        label: "DOS",
        value: Math.max(
          0,
          Math.floor(statTotals.damage / 3) +
          Number(sizeModifiers.dos ?? 0)
        )
      },
      {
        key: "ram",
        label: "RAM",
        value: Math.max(
          0,
          Math.floor(statTotals.dodge / 3) +
          Number(sizeModifiers.ram ?? 0)
        )
      },
      {
        key: "cpu",
        label: "CPU",
        value: Math.max(
          0,
          Math.floor(statTotals.armor / 3) +
          Number(sizeModifiers.cpu ?? 0)
        )
      }
    ];

    const derived = Object.fromEntries(
      derivedRows.map((entry) => [entry.key, entry.value])
    );

    const statDp = statRows.reduce((total, entry) => {
      return total + entry.investment;
    }, 0);
const attackRows = this._getEnemyAttackRows();
    const selectedQualityRows = this._getEnemySelectedQualityRows(form);

    const qualityDp = selectedQualityRows.reduce((total, row) => {
      return total + Number(row.qualityDp ?? 0);
    }, 0);

    const negativeQualityDp = selectedQualityRows.reduce((total, row) => {
      return total + Number(row.negativeDp ?? 0);
    }, 0);

    const freeQualityCount = selectedQualityRows.filter((row) => {
      return row.isFree && row.quality?.cost?.countsAgainstFreeLimit !== false;
    }).length;

    const freeQualityLimit = getEnemyQualityFreeLimit(form);
    const negativeQualityLimit = getEnemyQualityNegativeLimit(form);

    const spentDp = statDp + qualityDp;
    const totalDp = baseDp + bonusDp + negativeQualityDp;
    const remainingDp = totalDp - spentDp;

    const freeQualityOverrun = freeQualityCount > freeQualityLimit;
    const negativeQualityOverrun = negativeQualityDp > negativeQualityLimit;

    return {
      ...foundry.utils.deepClone(build),

      stageValue,
      stageBaseDp,
      baseDp,
      bonusDp,

      statRows,
      statTotals,
      derivedRows,
      derived,
      attackRows,
      attackCount: attackRows.length,

      wounds: Math.max(
        1,
        stageValue + (statTotals.health * 2)
      ),

      movement: Math.max(
        0,
        stageValue + 1 + Number(sizeModifiers.movement ?? 0)
      ),

      range: 3 + derived.bit,
      effectiveLimit: 3 + derived.bit + stageValue,

      selectedQualityRows,
      selectedQualityCount: selectedQualityRows.length,

      statDp,
      qualityDp,
      negativeQualityDp,
      freeQualityCount,
      freeQualityLimit,
      negativeQualityLimit,

      totalDp,
      spentDp,
      remainingDp,

      freeQualityOverrun,
      negativeQualityOverrun,

      hasBudgetOverrun:
        remainingDp < 0 ||
        freeQualityOverrun ||
        negativeQualityOverrun
    };
  }


async _loadStaticPortraitIndex() {
  if (
    this._staticPortraitIndex?.size &&
    this._staticAssetPaths?.size
  ) {
    return this._staticPortraitIndex;
  }

  if (this._staticPortraitIndexPromise) {
    return this._staticPortraitIndexPromise;
  }

  this._staticPortraitIndexPromise = (async () => {
    const portraitIndex = new Map();
    const tokenIndex = new Map();
    const assetPaths = new Set();

    const FilePickerClass = getDdaFilePickerClass();

    if (!FilePickerClass) {
      return portraitIndex;
    }

    const crawlDirectory = async (directory) => {
      let result = null;

      try {
        result = await FilePickerClass.browse(
          "data",
          directory
        );
      } catch (error) {
        console.warn(
          `DDA | Não foi possível indexar assets em ${directory}.`,
          error
        );

        return;
      }

      for (const file of result?.files ?? []) {
        const path = cleanAssetPath(file);

        if (!path || !isStaticImagePath(path)) continue;

        assetPaths.add(path);

        const fileName = path
          .split("/")
          .pop()
          ?.replace(/\.[^.]+$/, "") ?? "";

        const key = normalizeImageLookup(fileName);

        rememberIndexedAsset(
          portraitIndex,
          key,
          path,
          "portrait"
        );

        rememberIndexedAsset(
          tokenIndex,
          key,
          path,
          "token"
        );
      }

      for (const dir of result?.dirs ?? []) {
        await crawlDirectory(cleanAssetPath(dir));
      }
    };

    await crawlDirectory(DDA_DIGIMON_ASSETS_PATH);

    this._staticPortraitIndex = portraitIndex;
    this._staticTokenIndex = tokenIndex;
    this._staticAssetPaths = assetPaths;

    console.log(
      `DDA | ${assetPaths.size} assets de Digimon indexados para portraits/tokens.`
    );

    return portraitIndex;
  })().catch((error) => {
    console.warn(
      "DDA | Não foi possível indexar os assets do Criador de Inimigos.",
      error
    );

    this._staticPortraitIndex = new Map();
    this._staticTokenIndex = new Map();
    this._staticAssetPaths = new Set();
    this._staticPortraitIndexPromise = null;

    return this._staticPortraitIndex;
  });

  return this._staticPortraitIndexPromise;
}

  _bindImageFallbacks(root) {
    root.querySelectorAll("img[data-image-fallbacks]").forEach((image) => {
      if (image.dataset.ddaFallbackBound === "true") return;

      image.dataset.ddaFallbackBound = "true";

      image.addEventListener("error", () => {
        const remainingPaths = String(
          image.dataset.imageFallbacks ?? ""
        )
          .split("|")
          .map((path) => path.trim())
          .filter(Boolean);

        const nextPath = remainingPaths.shift();

        if (!nextPath) return;

        image.dataset.imageFallbacks = remainingPaths.join("|");
        image.src = nextPath;
      });
    });
  }

  async _loadDatabaseForms() {
    if (this._databaseLoaded) return this._databaseForms;
    if (this._databasePromise) return this._databasePromise;

    this._databasePromise = (async () => {
      const [actors, portraitIndex] = await Promise.all([
        DDADigimonDatabase.getAll({
          includeVirtualSpecialForms: true
        }),
        this._loadStaticPortraitIndex()
      ]);

      const forms = await Promise.all(
        actors.map((actor) => {
          return this._normalizeDatabaseForm(actor, portraitIndex);
        })
      );

      this._databaseForms = forms
        .filter((form) => Boolean(form?.id))
        .sort((left, right) => {
          const stageDifference =
            Number(left.stageValue ?? 0) -
            Number(right.stageValue ?? 0);

          if (stageDifference !== 0) return stageDifference;

          return left.displayName.localeCompare(
            right.displayName,
            game.i18n.lang
          );
        });

      this._databaseLoaded = true;

      return this._databaseForms;
    })().catch((error) => {
      console.error(
        "DDA | Não foi possível carregar formas para o Criador de Digimon Inimigo.",
        error
      );

      this._databaseForms = [];
      this._databaseLoaded = false;
      this._databasePromise = null;

      return [];
    });

    return this._databasePromise;
  }

  async _normalizeDatabaseForm(
    sourceActor = {},
    portraitIndex = new Map()
  ) {
    const system = sourceActor.system ?? {};
    const names = system.names ?? {};
    const stageKey = String(system.stage ?? "child").trim() || "child";

    const stage = CONFIG.DDA?.stages?.[stageKey]
      ?? CONFIG.DDA?.stages?.child
      ?? {};

    const sourceId = String(
      system.sourceId ??
      names.canonical ??
      system.species ??
      sourceActor.name ??
      ""
    ).trim();

    const id = String(
      sourceActor.databaseId ??
      system.databaseId ??
      `${stageKey}:${sourceId}`
    ).trim();

    const displayName = String(
      names.dub ??
      system.species ??
      sourceActor.name ??
      sourceId
    ).trim();

    const originalName = String(
      names.original ?? ""
    ).trim();

    const groups = uniqueStrings([
      system.group,
      ...(Array.isArray(system.groups) ? system.groups : [])
    ]);

    const aliases = uniqueStrings([
      displayName,
      originalName,
      sourceId,
      names.canonical,
      ...(Array.isArray(names.aliases) ? names.aliases : [])
    ]);

    const type = String(system.type ?? system.family ?? "").trim();

    const field = String(
      system.field ??
      system.fieldId ??
      ""
    ).trim();

    const categories = getEnemyFormCategories(sourceActor);
    const category = getEnemyPrimaryCategory(categories);
    const categoryTags = getEnemyCategoryTags(categories);

const portraitCandidates = getStaticPortraitCandidates(
  sourceActor,
  portraitIndex,
  this._staticAssetPaths
);

const tokenCandidates = await getTokenCandidates(
  sourceActor,
  portraitCandidates,
  this._staticAssetPaths,
  this._staticTokenIndex
);

    const previewCandidates = uniquePaths([
      ...portraitCandidates.filter((path) => {
        return path !== "icons/svg/mystery-man.svg";
      }),

      ...tokenCandidates.filter((path) => {
        return path !== "icons/svg/mystery-man.svg";
      })
    ]);

    return {
      id,
      databaseId: id,
      sourceActorUuid: String(sourceActor.uuid ?? "").trim(),
      sourceId,

      displayName,
      originalName,
      aliases,

      stageKey,
      stageLabel: getStageLabel(stageKey),
      stageValue: Number(stage.stageValue ?? system.stageValue ?? 0),
      size: String(system.size ?? stage.maxSize ?? "medium"),

      attribute: String(system.attribute ?? "none").trim() || "none",
      attributeLabel: getAttributeLabel(system.attribute ?? "none"),

      type,
      typeLabel: getProfileLabel("type", type),

      field,
      fieldLabel: getProfileLabel("field", field),

      group: groups[0] ?? "",
      groups,
      groupLabel: getProfileLabel("group", groups[0] ?? ""),

      family: String(system.family ?? "").trim(),

      baseEvolutionCategory: String(
        system.evolutionCategory ?? "normal"
      ).trim() || "normal",

      categories,
      category,
      categoryTags,
      categoryLabel: getCategoryLabel(category),

      categorySummary: categoryTags
        .map((entry) => entry.label)
        .join(" · "),

      isSpecialForm: Boolean(system.isSpecialForm) || categories.some((entry) => {
        return entry !== "normal";
      }),

      isVirtualSpecialForm: Boolean(
        system.specialForm?.virtual
      ),

      img: previewCandidates[0],
      imageFallbacks: previewCandidates.slice(1).join("|"),

      tokenImg: tokenCandidates[0],
      tokenFallbacks: tokenCandidates.slice(1).join("|"),

      sourceSystem: foundry.utils.deepClone(system),

      searchText: normalizeLookup([
        displayName,
        originalName,
        sourceId,
        stageKey,
        system.attribute,
        type,
        field,
        ...groups,
        ...categories,
        ...aliases
      ].join(" "))
    };
  }


  _getFilteredForms() {
    const activeCategories = this.filters.categories;

    const searchTerms = normalizeLookup(
      this.filters.searchTerm
    ).split(/\s+/).filter(Boolean);

    return this._databaseForms.filter((form) => {
            if (
        activeCategories.size &&
        !form.categories.some((category) => {
          return activeCategories.has(category);
        })
      ) {
        return false;
      }

      if (
        this.filters.stage !== "all" &&
        form.stageKey !== this.filters.stage
      ) {
        return false;
      }

      if (
        this.filters.attribute !== "all" &&
        form.attribute !== this.filters.attribute
      ) {
        return false;
      }

      if (
        this.filters.type !== "all" &&
        form.type !== this.filters.type
      ) {
        return false;
      }

      if (
        this.filters.field !== "all" &&
        form.field !== this.filters.field
      ) {
        return false;
      }

      if (
        this.filters.group !== "all" &&
        !form.groups.includes(this.filters.group)
      ) {
        return false;
      }

      return searchTerms.every((term) => {
        return form.searchText.includes(term);
      });
    });
  }

  _getSelectedForm() {
    return this._databaseForms.find((form) => {
      return form.id === this.selectedFormId;
    }) ?? null;
  }

  _getStageOptions() {
    const stages = CONFIG.DDA?.stages ?? {};

    return [
      {
        value: "all",
        label: text("Todos", "All"),
        selected: this.filters.stage === "all"
      },
      ...Object.entries(stages).map(([key]) => ({
        value: key,
        label: getStageLabel(key),
        selected: this.filters.stage === key
      }))
    ];
  }

  _getAttributeOptions() {
    const values = uniqueStrings(
      this._databaseForms.map((form) => form.attribute)
    ).sort((left, right) => {
      return getAttributeLabel(left).localeCompare(
        getAttributeLabel(right),
        game.i18n.lang
      );
    });

    return [
      {
        value: "all",
        label: text("Todos", "All"),
        selected: this.filters.attribute === "all"
      },
      ...values.map((value) => ({
        value,
        label: getAttributeLabel(value),
        selected: this.filters.attribute === value
      }))
    ];
  }

  _getTextFilterOptions(property) {
    const values = uniqueStrings(
      this._databaseForms.flatMap((form) => {
        if (property === "group") return form.groups;
        return form[property] ? [form[property]] : [];
      })
    ).sort((left, right) => {
      return getProfileLabel(property, left).localeCompare(
        getProfileLabel(property, right),
        game.i18n.lang
      );
    });

    return [
      {
        value: "all",
        label: text("Todos", "All"),
        selected: this.filters[property] === "all"
      },
      ...values.map((value) => ({
        value,
        label: getProfileLabel(property, value),
        selected: this.filters[property] === value
      }))
    ];
  }

  _getCategoryFilters() {
    return ENEMY_FORM_CATEGORY_ORDER.map((category) => ({
      key: category,
      label: getCategoryLabel(category),
      active: this.filters.categories.has(category),
      count: this._databaseForms.filter((form) => {
        return form.categories.includes(category);
      }).length
    }));
  }

  async _createEnemyNpc() {
    if (!game.user?.isGM) {
      ui.notifications.warn(text(
        "Somente o Narrador pode criar Digimon inimigos.",
        "Only the GM can create enemy Digimon."
      ));

      return;
    }

    const form = this._getSelectedForm();

    if (!form) {
      ui.notifications.warn(text(
        "Escolha uma forma antes de criar o NPC.",
        "Choose a form before creating the NPC."
      ));

      return;
    }

    const build = this._getEnemyBuildPreview(form);

    if (build.hasBudgetOverrun) {
      ui.notifications.warn(text(
        "O inimigo está gastando mais PD do que o orçamento individual permite.",
        "This enemy is spending more DP than its individual budget allows."
      ));

      return;
    }

    const actor = await Actor.create(
      this._buildEnemyNpcData(form, build)
    );

    if (!actor) return;

    const woundsMax = Number(
      actor.system?.miscStats?.wounds?.max ?? 0
    );

    if (woundsMax > 0) {
      await actor.update({
        "system.miscStats.wounds.value": woundsMax
      });
    }

    ui.notifications.info(text(
      `${actor.name} foi criado como Digimon inimigo.`,
      `${actor.name} was created as an enemy Digimon.`
    ));

    await this.close();
    actor.sheet?.render(true);
  }

  _buildEnemyNpcData(form, build = this._getEnemyBuildPreview(form)) {
    const sourceSystem = foundry.utils.deepClone(
      form.sourceSystem ?? {}
    );

    const stage = CONFIG.DDA?.stages?.[form.stageKey]
      ?? CONFIG.DDA?.stages?.child
      ?? {};

    const stageValue = Math.max(
      1,
      Number(stage.stageValue ?? form.stageValue ?? 2)
    );

    const baseDp = toNonNegativeInteger(
      build.baseDp,
      Number(stage.baseDp ?? stage.startingDp ?? 0)
    );

    const stageBaseDp = toNonNegativeInteger(
      build.stageBaseDp,
      Number(stage.baseDp ?? stage.startingDp ?? 0)
    );

    const bonusDp = toNonNegativeInteger(
      build.bonusDp,
      0
    );

    const name = String(
      this.enemyName ?? ""
    ).trim() || form.displayName;

    const qualityItems = this._buildEnemyQualityItems(build);
    const attackItems = this._buildEnemyAttackItems(form, build);
    const spentBaseStats = Math.min(
      build.statDp,
      baseDp
    );

    const spentBaseQualities = Math.min(
      build.qualityDp,
      Math.max(0, baseDp - spentBaseStats)
    );

    const spentBonusStats = Math.max(
      0,
      build.statDp - spentBaseStats
    );

    const spentBonusQualities = Math.max(
      0,
      build.qualityDp - spentBaseQualities
    );

    const enemyMetadata = {
      isEnemy: true,

      role: String(build.role ?? "standard"),

      threat: String(build.role ?? "standard") === "boss"
        ? "boss"
        : "standard",

      baseDpOverride: baseDp === stageBaseDp
        ? null
        : baseDp,

      bonusDpAllocated: bonusDp,

      statInvestments: foundry.utils.deepClone(
        build.statInvestments ?? {}
      ),

      selectedQualities: foundry.utils.deepClone(
        build.selectedQualityRows?.map((row) => ({
          id: row.id,
          name: row.name,
          rank: row.rank,
          qualityDp: row.qualityDp,
          negativeDp: row.negativeDp,
          choices: row.choiceRows
        })) ?? []
      ),

      goal: String(build.goal ?? ""),
      motivation: String(build.motivation ?? ""),
      tactic: String(build.tactic ?? ""),
      notes: String(build.notes ?? ""),

      sourceDatabaseId: form.databaseId,
      sourceActorUuid: form.sourceActorUuid,
      sourceFormName: form.displayName,
      sourceEvolutionCategory: form.baseEvolutionCategory,

      sourceSpecialCategories: foundry.utils.deepClone(
        form.categories ?? []
      )
    };

    return {
      name,
      type: "npc",
      img: form.img,

      prototypeToken: {
        disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE,

        texture: {
          src: form.tokenImg || form.img
        }
      },

      flags: {
        [DDA_SYSTEM_ID]: {
          digivicePortrait: form.img,
          enemyNpc: enemyMetadata
        }
      },

      system: {
        sourceId: form.sourceId,
        databaseId: form.databaseId,

        species: form.displayName,
        stage: form.stageKey,
        stageValue,
        size: form.size,

        attribute: form.attribute,
        type: form.type,
        family: form.family,
        field: form.field,
        fieldId: String(sourceSystem.fieldId ?? form.field ?? ""),
        group: form.group,
        groups: foundry.utils.deepClone(form.groups),

        names: {
          canonical: String(
            sourceSystem.names?.canonical ??
            form.sourceId
          ),

          original: form.originalName,
          dub: form.displayName,
          aliases: foundry.utils.deepClone(form.aliases)
        },

        images: {
          portraitImagePath: form.img,
          tokenImagePath: form.tokenImg || form.img
        },

        wikimon: foundry.utils.deepClone(
          sourceSystem.wikimon ?? {}
        ),

        evolutionCategory: form.baseEvolutionCategory,

        specialCategories: foundry.utils.deepClone(
          form.categories ?? []
        ),

        primarySpecialCategory: form.category,
        isSpecialForm: form.isSpecialForm,
        isDigimon: true,

        notes: String(build.notes ?? ""),

        profile: {
          description: String(
            sourceSystem.profile?.description ?? ""
          ),

          behavior: String(build.motivation ?? ""),
          tactics: String(build.tactic ?? "")
        },

        mainStats: createMainStats(
          stageValue,
          build.statInvestments ?? {}
        ),

        creation: {
          dp: {
            base: baseDp,
            bonus: bonusDp,
            negative: build.negativeQualityDp,
            total: build.totalDp,

            spentBaseStats,
            spentBaseQualities,
            spentBonusStats,
            spentBonusQualities,

            spentTotal: build.spentDp,
            remaining: build.remainingDp
          }
        },

        combat: {
          actions: {
            value: 2,
            max: 2
          },

          initiative: {
            value: 0,
            side: "enemies"
          }
        },

        enemy: enemyMetadata
      },

      items: [
  ...attackItems,
  ...qualityItems
]
    };
  }
}

export function registerEnemyDigimonWizardDirectoryButton() {
  if (enemyDirectoryHookRegistered) return;

  enemyDirectoryHookRegistered = true;

  Hooks.on("renderActorDirectory", (app, html) => {
    if (!game.user?.isGM) return;

    const root = getApplicationRoot(html)
      ?? app?.element
      ?? null;

    if (!root) return;
    if (root.querySelector(".dda-open-enemy-digimon-wizard")) return;

    const button = document.createElement("button");

    button.type = "button";
    button.className = "dda-open-enemy-digimon-wizard";
    button.innerHTML = `
      <img
        class="dda-directory-action-icon"
        src="systems/digimon-digital-adventures/assets/ui/enemy-digimon.svg"
        alt=""
      />
      <span>${text("Criar Digimon Inimigo", "Create Enemy Digimon")}</span>
    `;

    button.addEventListener("click", (event) => {
      event.preventDefault();
      DDADigimonEnemyWizard.open();
    });

    const footer =
      root.querySelector(".directory-footer") ??
      root.querySelector("footer");

    if (!footer) return;

    footer.append(button);
  });
}