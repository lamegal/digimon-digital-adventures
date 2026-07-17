import { DDADigimonDatabase } from "../data/digimon-database.js";
import { DDA_DIGIMON_QUALITIES } from "../data/digimon-qualities.js";
import { DDAEnemyQualityBrowser } from "./dda-enemy-quality-browser.js";
import { buildQualityItemData } from "./digimon-quality-browser.js";
import {
  getDigimonTokenScaleForSize
} from "../tokens/digimon-token-scale.js";
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

const ENEMY_SIZE_ORDER = [
  "small",
  "medium",
  "large",
  "huge",
  "gigantic",
  "colossal"
];

const ENEMY_SIZE_MODIFIERS = {
  small: { bit: 2, dos: 1, ram: 3, cpu: 0, movement: 0 },
  medium: { bit: 2, dos: 1, ram: 2, cpu: 1, movement: 0 },
  large: { bit: 2, dos: 1, ram: 1, cpu: 2, movement: 0 },
  huge: { bit: 1, dos: 2, ram: 1, cpu: 2, movement: 0 },
  gigantic: { bit: 1, dos: 2, ram: 0, cpu: 3, movement: -1 },
  colossal: { bit: 1, dos: 2, ram: 0, cpu: 3, movement: -1 }
};

const ENEMY_TOKEN_SIZE_RANGE_BY_MECHANICAL_SIZE = {
  small: {
    min: 0.5,
    max: 1
  },

  medium: {
    min: 1,
    max: 2
  },

  large: {
    min: 1,
    max: 3
  },

  huge: {
    min: 2,
    max: 4
  },

  gigantic: {
    min: 3,
    max: 6
  },

  colossal: {
    min: 4,
    max: 8
  }
};

function toNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return Math.max(0, Number(fallback) || 0);
  }

  return Math.max(0, Math.floor(numeric));
}

function toTokenGridSize(value, fallback = 1) {
  const numeric = Number(value);
  const fallbackValue = Number(fallback);

  if (
    !Number.isFinite(numeric) ||
    numeric <= 0
  ) {
    return (
      Number.isFinite(fallbackValue) &&
      fallbackValue > 0
    )
      ? Math.max(
          0.5,
          Math.round(fallbackValue * 2) / 2
        )
      : 1;
  }

  return Math.max(
    0.5,
    Math.round(numeric * 2) / 2
  );
}

function getEnemyTokenSizeBounds(form = {}) {
  const mechanicalSize = String(
    form.size ?? "medium"
  ).trim() || "medium";

  const sizeRange =
    ENEMY_TOKEN_SIZE_RANGE_BY_MECHANICAL_SIZE[
      mechanicalSize
    ] ??
    ENEMY_TOKEN_SIZE_RANGE_BY_MECHANICAL_SIZE.medium;

  /*
   * O estágio ainda limita o maior Tamanho mecânico
   * possível. Dessa forma, a ocupação visual nunca
   * ultrapassa a faixa do maior Size permitido nele.
   */
  const stageMaximumSize = String(
    getEnemyStageData(form)?.maxSize ??
    mechanicalSize
  ).trim() || mechanicalSize;

  const stageRange =
    ENEMY_TOKEN_SIZE_RANGE_BY_MECHANICAL_SIZE[
      stageMaximumSize
    ] ??
    sizeRange;

  const min = toTokenGridSize(
    sizeRange.min,
    1
  );

  const max = Math.max(
    min,
    toTokenGridSize(
      Math.min(
        Number(sizeRange.max ?? min),
        Number(
          stageRange.max ??
          sizeRange.max ??
          min
        )
      ),
      min
    )
  );

  return {
    min,
    max
  };
}

function getEnemyDefaultTokenSize(form = {}) {
  const bounds = getEnemyTokenSizeBounds(form);

  const configuredDefault =
    getDigimonTokenScaleForSize(
      form.size ?? "medium"
    );

  return Math.min(
    bounds.max,
    Math.max(
      bounds.min,
      toTokenGridSize(
        configuredDefault,
        bounds.min
      )
    )
  );
}

function getEnemyTokenSizeOptions(
  form = {},
  selectedValue = null
) {
  const bounds = getEnemyTokenSizeBounds(form);

  const selected = Math.min(
    bounds.max,
    Math.max(
      bounds.min,
      toTokenGridSize(
        selectedValue,
        getEnemyDefaultTokenSize(form)
      )
    )
  );

  const values = [];

  if (bounds.min === 0.5) {
    values.push(0.5);
  }

  for (
    let value = Math.max(
      1,
      Math.ceil(bounds.min)
    );
    value <= Math.floor(bounds.max);
    value += 1
  ) {
    values.push(value);
  }

  if (!values.includes(selected)) {
    values.push(selected);
    values.sort((left, right) => {
      return left - right;
    });
  }

  return values.map((value) => ({
    value,
    label: `${value} × ${value}`,
    selected: value === selected
  }));
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
  const slot = Math.max(
    1,
    Number(index ?? 0) + 1
  );

  return {
    key: `enemyAttack-${foundry.utils.randomID(8)}`,

    name: text(
      `Ataque ${slot}`,
      `Attack ${slot}`
    ),

    rangeType: "melee",
    functionType: "damage",

    isSignature: false
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
      text(
        `Ataque ${index + 1}`,
        `Attack ${index + 1}`
      )
    ).trim(),

    rangeType,
    functionType,

    isSignature: Boolean(
      attack.isSignature
    )
  };
}

function createEnemySuperiorModeDraft() {
  return {
    defaultQualityIds: [],
    modeQualities: [],
    defaultAttackKeys: [],
    modeAttacks: []
  };
}

function createEnemyBuild(form = null) {
  const stageBaseDp =
    getEnemyStageBaseDp(form ?? {});

  const tokenSize =
    getEnemyDefaultTokenSize(form ?? {});

  return {
    baseDp: stageBaseDp,
    bonusDp: 0,
    tokenSize,

    statInvestments: Object.fromEntries(
      ENEMY_STAT_ORDER.map((statKey) => [
        statKey,
        0
      ])
    ),

    attacks: [
      createEnemyAttackDraft(0)
    ],

    selectedQualities: [],
    superiorMode: createEnemySuperiorModeDraft(),
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
  "attackTag",
  "attackWithPiercing",
  "attackWithCertain",
  "signatureMove"
]);

const ENEMY_SINGLE_CONFIGURATION_CHOICE_TYPES = new Set([
  "attackWithPiercing",
  "attackWithCertain",
  "signatureMove",
  "positiveCasterDerivedEffect"
]);

const ENEMY_SIMPLE_CHOICE_TYPES = new Set([
  "single",
  "perRank",
  "effectTagPerRank",
  "positiveCasterDerivedEffect",
  "derivedStatPerRank",
  "dataOptimizationSpecializationPerRank"
]);

const ENEMY_SPECIAL_PAIR_CHOICE_TYPES = new Set([
  "twoSkillsFromSingleAttributeCategory",
  "twoElementsPerRank",
  "modeChangePairsPerRank"
]);

const ENEMY_SUPPORTED_CHOICE_TYPES = new Set([
  ...ENEMY_ATTACK_CHOICE_TYPES,
  ...ENEMY_SIMPLE_CHOICE_TYPES,
  ...ENEMY_SPECIAL_PAIR_CHOICE_TYPES,
  "superiorModeConfiguration"
]);

const ENEMY_INNATE_TALENT_SKILL_CATEGORIES = [
  {
    key: "agility",
    pt: "Agilidade",
    en: "Agility",
    skills: [
      {
        key: "evade",
        pt: "Evasão",
        en: "Evade",
        derivedStat: "ram"
      },
      {
        key: "precision",
        pt: "Precisão",
        en: "Precision",
        derivedStat: "ram"
      },
      {
        key: "stealth",
        pt: "Furtividade",
        en: "Stealth",
        derivedStat: "ram"
      }
    ]
  },

  {
    key: "body",
    pt: "Corpo",
    en: "Body",
    skills: [
      {
        key: "athletics",
        pt: "Atletismo",
        en: "Athletics",
        derivedStat: "cpu"
      },
      {
        key: "endurance",
        pt: "Resistência",
        en: "Endurance",
        derivedStat: "cpu"
      },
      {
        key: "featsOfStrength",
        pt: "Feitos de Força",
        en: "Feats of Strength",
        derivedStat: "cpu"
      }
    ]
  },

  {
    key: "charisma",
    pt: "Carisma",
    en: "Charisma",
    skills: [
      {
        key: "manipulate",
        pt: "Manipular",
        en: "Manipulate",
        derivedStat: "bit"
      },
      {
        key: "performance",
        pt: "Performance",
        en: "Performance",
        derivedStat: "bit"
      },
      {
        key: "persuasion",
        pt: "Persuasão",
        en: "Persuasion",
        derivedStat: "bit"
      }
    ]
  },

  {
    key: "intelligence",
    pt: "Inteligência",
    en: "Intelligence",
    skills: [
      {
        key: "decipherIntent",
        pt: "Decifrar Intenção",
        en: "Decipher Intent",
        derivedStat: "bit"
      },
      {
        key: "survival",
        pt: "Sobrevivência",
        en: "Survival",
        derivedStat: "bit"
      },
      {
        key: "knowledge",
        pt: "Conhecimento",
        en: "Knowledge",
        derivedStat: "bit"
      }
    ]
  },

  {
    key: "willpower",
    pt: "Força de Vontade",
    en: "Willpower",
    skills: [
      {
        key: "awareness",
        pt: "Percepção",
        en: "Awareness",
        derivedStat: "bit"
      },
      {
        key: "bravery",
        pt: "Bravura",
        en: "Bravery",
        derivedStat: "dos"
      },
      {
        key: "fortitude",
        pt: "Fortitude",
        en: "Fortitude",
        derivedStat: "dos"
      }
    ]
  }
];

const ENEMY_ELEMENT_KEY_ALIASES = {
  fire: "fire",
  fogo: "fire",

  water: "water",
  agua: "water",

  wind: "wind",
  vento: "wind",

  earth: "earth",
  terra: "earth",

  ice: "ice",
  gelo: "ice",

  wood: "wood",
  flora: "wood",

  steel: "steel",
  aco: "steel",

  thunder: "thunder",
  trovao: "thunder",

  darkness: "darkness",
  dark: "darkness",
  trevas: "darkness",

  light: "light",
  luz: "light"
};

function getEnemyElementKey(value = "") {
  const normalized = normalizeLookup(value)
    .replace(/\s+/g, "");

  return ENEMY_ELEMENT_KEY_ALIASES[normalized]
    ?? normalized;
}

function createEnemyUnorderedPairs(entries = []) {
  const pairs = [];

  for (
    let leftIndex = 0;
    leftIndex < entries.length;
    leftIndex += 1
  ) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < entries.length;
      rightIndex += 1
    ) {
      pairs.push([
        entries[leftIndex],
        entries[rightIndex]
      ]);
    }
  }

  return pairs;
}

function getEnemyQualityId(quality = {}) {
  return String(
    quality.id ??
    quality.system?.sourceId ??
    ""
  ).trim();
}

function getEnemyQualityBaseRank(quality = {}) {
  return Math.max(
    1,
    Number(quality.rank?.value ?? 1)
  );
}

function getEnemyQualityDeclaredMaxRank(quality = {}) {
  const declaredMax = Number(
    quality.rank?.max ?? 1
  );

  return Number.isFinite(declaredMax)
    ? Math.max(0, declaredMax)
    : 1;
}

function enemyQualityRequiresAttackChoice(quality = {}) {
  const choiceType = String(
    quality.choices?.type ?? ""
  ).trim();

  return Boolean(
    quality.choices?.required &&
    ENEMY_ATTACK_CHOICE_TYPES.has(choiceType)
  );
}

function normalizeEnemyChoiceOption(option, index = 0) {
  if (option === null || option === undefined) {
    return null;
  }

  if (typeof option === "string") {
    const raw = option.trim();
    if (!raw) return null;

    const normalized = normalizeLookup(raw)
      .replace(/\s+/g, "");

    const key = normalized || `option${index + 1}`;

    return {
      key,
      label: ["bit", "dos", "ram", "cpu"].includes(key)
        ? key.toUpperCase()
        : raw,
      originalLabel: raw
    };
  }

  if (typeof option !== "object") {
    return null;
  }

  const cloned = foundry.utils.deepClone(option);

  const key = String(
    cloned.key ??
    cloned.value ??
    cloned.id ??
    ""
  ).trim();

  if (!key) return null;

  return {
    ...cloned,
    key,
    label: String(
      cloned.label ??
      cloned.originalLabel ??
      cloned.name ??
      key
    )
  };
}

function getEnemyStaticChoiceOptions(quality = {}) {
  const options = Array.isArray(
    quality.choices?.options
  )
    ? quality.choices.options
    : [];

  return options
    .map((option, index) => {
      return normalizeEnemyChoiceOption(
        option,
        index
      );
    })
    .filter(Boolean);
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

function isEnemyNaturewalkQuality(quality = {}) {
  const qualityId = normalizeEnemyQualityName(
    quality.id ??
    quality.name ??
    quality.originalName
  );

  return [
    "passonatural",
    "naturewalk"
  ].includes(qualityId);
}

function getEnemyNaturewalkMainStat(
  mainStat = ""
) {
  const key = String(mainStat ?? "")
    .trim()
    .toLowerCase();

  if (!ENEMY_STAT_ORDER.includes(key)) {
    return null;
  }

  return {
    key,

    label: game.i18n.localize(
      ENEMY_STAT_LABELS[key]
    )
  };
}

function buildEnemyNaturewalkChoiceRank(
  quality = {},
  choiceKey = "",
  mainStat = ""
) {
  if (!isEnemyNaturewalkQuality(quality)) {
    return null;
  }

  const option = getEnemyChoiceOption(
    quality,
    choiceKey
  );

  const stat = getEnemyNaturewalkMainStat(
    mainStat
  );

  if (!option || !stat) return null;

  return {
    key: String(
      option.key ?? ""
    ).trim(),

    label: String(
      option.label ??
      option.originalLabel ??
      option.key ??
      ""
    ),

    originalLabel: String(
      option.originalLabel ?? ""
    ),

    mainStat: stat.key,
    mainStatLabel: stat.label,

    terrain: String(
      option.terrain ?? ""
    ),

    recommendedFor: String(
      option.recommendedFor ?? ""
    ),

    effect: String(
      option.effect ?? ""
    )
  };
}

function getEnemyQualityChoiceRows(
  quality = {},
  selection = {},
  availableOptions = []
) {
  const choiceKeys = Array.isArray(
    selection.choiceKeys
  )
    ? selection.choiceKeys
    : [];

  const choiceRanks = Array.isArray(
    selection.choiceRanks
  )
    ? selection.choiceRanks
    : [];

  const allOptions = availableOptions.length
    ? availableOptions
    : getEnemyStaticChoiceOptions(quality);

  return choiceKeys
    .map((choiceKey, index) => {
      const key = String(
        choiceKey ?? ""
      ).trim();

      const option = allOptions.find(
        (entry) => {
          return String(
            entry?.key ?? ""
          ) === key;
        }
      );

      if (!option) return null;

      const cloned =
        foundry.utils.deepClone(
          option
        );

      const configuredRank =
        foundry.utils.deepClone(
          choiceRanks[index] ?? {}
        );

      return {
        ...cloned,
        ...configuredRank,

        rank: index + 1,
        key,

        label: String(
          configuredRank.label ??
          cloned.label ??
          cloned.originalLabel ??
          key
        ),

        originalLabel: String(
          configuredRank.originalLabel ??
          cloned.originalLabel ??
          ""
        ),

        mainStat: String(
          configuredRank.mainStat ??
          cloned.mainStat ??
          ""
        ),

        mainStatLabel: String(
          configuredRank.mainStatLabel ??
          cloned.mainStatLabel ??
          ""
        ),

        effect: String(
          configuredRank.effect ??
          cloned.effect ??
          ""
        ),

        type: String(
          configuredRank.type ??
          cloned.type ??
          ""
        )
      };
    })
    .filter(Boolean);
}

function getEnemyQualityDisplayRank(
  selection = {},
  quality = {}
) {
  return Math.max(
    getEnemyQualityBaseRank(quality),

    Number(
      selection.rank ??
      getEnemyQualityBaseRank(quality)
    )
  );
}

function normalizeEnemyQualitySelection(
  selection = {}
) {
  const id = String(
    selection.id ?? ""
  ).trim();

  const quality =
    getEnemyQualityById(id);

  if (!id || !quality) return null;

  const rawChoiceKeys = Array.isArray(
    selection.choiceKeys
  )
    ? selection.choiceKeys
    : [];

  const rawChoiceRanks = Array.isArray(
    selection.choiceRanks
  )
    ? selection.choiceRanks
    : [];

  const choiceKeys = [];
  const choiceRanks = [];
  const seenKeys = new Set();

  for (
    const [index, rawKey]
    of rawChoiceKeys.entries()
  ) {
    const key = String(
      rawKey ?? ""
    ).trim();

    if (!key || seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    choiceKeys.push(key);

    const configuredRank =
      foundry.utils.deepClone(
        rawChoiceRanks[index] ?? {}
      );

    if (
      Object.keys(configuredRank).length
    ) {
      choiceRanks.push({
        ...configuredRank,
        key
      });
    }
  }

  return {
    id,

    rank: getEnemyQualityDisplayRank(
      selection,
      quality
    ),

    choiceKeys,
    choiceRanks
  };
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
      icon: "fa-solid fa-dragon",
      title: "Create Digimon NPC",
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
      toggleSuperiorDefaultQuality: DDADigimonEnemyWizard._onToggleSuperiorDefaultQuality,
      openSuperiorModeQualityBrowser: DDADigimonEnemyWizard._onOpenSuperiorModeQualityBrowser,
      removeSuperiorModeQuality: DDADigimonEnemyWizard._onRemoveSuperiorModeQuality,
      toggleNpcAlignment: DDADigimonEnemyWizard._onToggleNpcAlignment,
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
    this.npcAlignment = "enemy";
    this.enemyBuild = createEnemyBuild();
    this._enemyBuildFormId = "";
    this._enemyQualityBrowser = null;
    this._enemySuperiorModeQualityBrowser = null;
    this._enemyQualitySelectionOverride = null;

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

    const isAllyNpc =
      this.npcAlignment === "ally";

    const isEnemyNpc =
      !isAllyNpc;

    return {
      isGM: true,

      title: text(
        "Criar Digimon NPC",
        "Create Digimon NPC"
      ),

      subtitle: isAllyNpc
        ? text(
            "Crie um aliado autônomo do Narrador, capaz de escolher formas e evoluir sem gastar PE ou PI.",
            "Create an autonomous GM ally that can choose forms and evolve without spending EP or IP."
          )
        : text(
            "Crie um antagonista independente para encontros e combates.",
            "Create an independent antagonist for encounters and combat."
          ),
      searchHint: text(
        "Digite livremente. A busca só é aplicada ao pressionar Enter.",
        "Type freely. Search is only applied when you press Enter."
      ),
      npcAlignment:
        this.npcAlignment,

      isAllyNpc,
      isEnemyNpc,

      enemyDevicePath:
        isAllyNpc
          ? `systems/${DDA_SYSTEM_ID}/assets/ui/digivice-frame-vazio-2.webp`
          : `systems/${DDA_SYSTEM_ID}/assets/ui/digimon-enemy.webp`,

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
        selected:
          text(
            "Forma selecionada",
            "Selected form"
          ),

        source:
          text(
            "Categoria",
            "Category"
          ),

        alignment:
          text(
            "Alinhamento do NPC",
            "NPC alignment"
          ),

        ally:
          text(
            "Aliado",
            "Ally"
          ),

        enemy:
          text(
            "Inimigo",
            "Enemy"
          ),

        alignmentHint: isAllyNpc
          ? text(
              "Aliados usam disposição amigável e podem evoluir gratuitamente pela própria ficha.",
              "Allies use friendly disposition and may evolve freely from their own sheet."
            )
          : text(
              "Inimigos usam disposição hostil e mantêm o visual escuro do Digivice.",
              "Enemies use hostile disposition and keep the dark Digivice appearance."
            ),

        npcName: isAllyNpc
          ? text(
              "Nome do aliado",
              "Ally name"
            )
          : text(
              "Nome do inimigo",
              "Enemy name"
            ),

        npcNameHint:
          text(
            "Deixe vazio para usar o nome da espécie.",
            "Leave blank to use the species name."
          ),

        create: isAllyNpc
          ? text(
              "Criar NPC Aliado",
              "Create Ally NPC"
            )
          : text(
              "Criar NPC Inimigo",
              "Create Enemy NPC"
            ),
        choose: text(
          "Escolha uma forma na lista para criar o inimigo.",
          "Choose a form from the list to create the enemy."
        ),
        special: text("Forma alternativa", "Alternative form"),

        build: isAllyNpc
          ? text(
              "Montar aliado",
              "Build ally"
            )
          : text(
              "Montar inimigo",
              "Build enemy"
            ),
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

        derived: text(
          "Prévia de derivados",
          "Derived stat preview"
        ),

        wounds: text(
          "Caixas de Ferimento",
          "Wound Boxes"
        ),

        tokenSize: text(
          "Ocupação do token",
          "Token footprint"
        ),

        tokenSizeHint: text(
          "A ocupação visual não altera o Tamanho mecânico nem os derivados.",
          "The visual footprint does not change mechanical Size or derived stats."
        ),

        tokenSizeRange: text(
          "Faixa permitida",
          "Allowed range"
        ),

        attacks: text("Ataques", "Attacks"),
        addAttack: text("Adicionar Ataque", "Add Attack"),
        removeAttack: text("Remover Ataque", "Remove Attack"),
        attackName: text(
          "Nome do Ataque",
          "Attack Name"
        ),

        attackRangeType: text(
          "Alcance",
          "Range Type"
        ),

        attackFunctionType: text(
          "Função",
          "Function"
        ),

        signatureMove: text(
          "Movimento Assinatura",
          "Signature Move"
        ),

        signatureMoveHint: text(
          "Somente um ataque pode ser o Movimento Assinatura.",
          "Only one Attack may be the Signature Move."
        ),

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

        createAndOpen: isAllyNpc
          ? text(
              "Criar aliado e abrir ficha",
              "Create ally and open sheet"
            )
          : text(
              "Criar inimigo e abrir ficha",
              "Create enemy and open sheet"
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
        freeQualities: text("Gratuitas", "Free"),

        superiorModeTitle: text(
          "Configuração da Mudança de Modo Superior",
          "Superior Mode Change Configuration"
        ),

        superiorModeDefaultQualities: text(
          "Qualidades Padrão",
          "Default Qualities"
        ),

        superiorModeDefaultQualitiesHint: text(
          "Selecione as Qualidades pagas que deixarão de funcionar quando o Digimon entrar no Modo alternativo.",
          "Select the paid Qualities that stop functioning when the Digimon enters its alternate Mode."
        ),

                superiorModeModeQualities: text(
          "Qualidades do Modo",
          "Mode Qualities"
        ),

        superiorModeModeQualitiesHint: text(
          "Adicione Qualidades para o Modo alternativo até igualar o custo das Qualidades Padrão.",
          "Add Qualities for the alternate Mode until their cost matches the Default Qualities."
        ),

        superiorModeOpenModeQualities: text(
          "Abrir catálogo do Modo",
          "Open Mode catalog"
        ),

        superiorModeNoModeQualities: text(
          "Nenhuma Qualidade do Modo foi adicionada ainda.",
          "No Mode Quality has been added yet."
        ),

        superiorModeRemoveModeQuality: text(
          "Remover do Modo",
          "Remove from Mode"
        ),

        superiorModeSelectedCost: text(
          "Custo selecionado",
          "Selected cost"
        ),

        superiorModeModeCost: text(
          "Custo do Modo",
          "Mode cost"
        ),

        superiorModeMaximumCost: text(
          "Limite do Estágio",
          "Stage limit"
        ),

        superiorModeConfigurationReady: text(
          "Configuração válida",
          "Valid configuration"
        ),

        superiorModeConfigurationIncomplete: text(
          "Configuração incompleta",
          "Incomplete configuration"
        ),

        superiorModeNoEligibleQualities: text(
          "Adicione ao menos uma Qualidade paga além das duas Qualidades de Mudança de Modo.",
          "Add at least one paid Quality besides the two Mode Change Qualities."
        ),

        superiorModeNoDefaultQuality: text(
          "Nenhuma Qualidade Padrão foi marcada ainda.",
          "No Default Quality has been marked yet."
        )
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

    root
  .querySelectorAll(
    "[data-enemy-attack-field]"
  )
  .forEach((field) => {
    const isCheckbox =
      field.matches?.(
        'input[type="checkbox"]'
      );

    const eventName = (
      field.tagName === "SELECT" ||
      isCheckbox
    )
      ? "change"
      : "input";

    field.addEventListener(
      eventName,
      async (event) => {
        const currentTarget =
          event.currentTarget;

        const attackKey = String(
          currentTarget?.dataset
            ?.attackKey ?? ""
        );

        const fieldKey = String(
          currentTarget?.dataset
            ?.enemyAttackField ?? ""
        );

        if (!attackKey || !fieldKey) {
          return;
        }

        const fieldValue = isCheckbox
          ? Boolean(currentTarget.checked)
          : currentTarget?.value;

        this._setEnemyAttackField(
          attackKey,
          fieldKey,
          fieldValue
        );

        if (fieldKey === "isSignature") {
          await this._renderPreservingScroll({
            preserveForms: true,
            preservePreview: true
          });
        }

        await this._enemyQualityBrowser
          ?.render({
            force: true
          });
      }
    );
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
  preserveTokenSize: true,
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

    static async _onToggleSuperiorDefaultQuality(event, target) {
    event.preventDefault();

    const qualityId = String(
      target?.dataset?.qualityId ?? ""
    ).trim();

    if (!qualityId) return;

    const changed =
      this._toggleSuperiorDefaultQuality(
        qualityId
      );

    if (!changed) return;

    await this._renderPreservingScroll({
      preserveForms: true,
      preservePreview: true
    });
  }

  static async _onOpenSuperiorModeQualityBrowser(
    event
  ) {
    event.preventDefault();

    const preview =
      this._getEnemySuperiorModePreview();

    if (
      !preview.enabled ||
      !preview.hasDefaultQualities
    ) {
      ui.notifications.warn(text(
        "Selecione ao menos uma Qualidade Padrão antes de abrir o catálogo do Modo.",
        "Select at least one Default Quality before opening the Mode catalog."
      ));

      return;
    }

    if (
      this._enemySuperiorModeQualityBrowser
        ?.rendered
    ) {
      this._enemySuperiorModeQualityBrowser
        .bringToFront();

      return;
    }

    const browser =
      new DDAEnemyQualityBrowser(
        this,
        {
          selectionMode: "superiorMode"
        }
      );

    this._enemySuperiorModeQualityBrowser =
      browser;

    try {
      await browser.render({
        force: true
      });
    } catch (error) {
      this._enemySuperiorModeQualityBrowser =
        null;

      console.error(
        "DDA | Não foi possível abrir o catálogo de Qualidades do Modo.",
        error
      );

      ui.notifications.error(text(
        `Não foi possível abrir o catálogo do Modo: ${error?.message ?? error}`,
        `Could not open the Mode catalog: ${error?.message ?? error}`
      ));
    }
  }

  static async _onRemoveSuperiorModeQuality(
    event,
    target
  ) {
    event.preventDefault();

    const qualityId = String(
      target?.dataset?.qualityId ?? ""
    ).trim();

    if (!qualityId) return;

    const removed =
      this.removeEnemySuperiorModeQualityById(
        qualityId
      );

    if (!removed) return;

    await this._renderPreservingScroll({
      preserveForms: true,
      preservePreview: true
    });

    await this
      ._enemySuperiorModeQualityBrowser
      ?.render({ force: true });
  }

    static async _onToggleNpcAlignment(
    event
  ) {
    event.preventDefault();

    this.npcAlignment =
      this.npcAlignment === "ally"
        ? "enemy"
        : "ally";

    await this._renderPreservingScroll({
      preserveForms: true,
      preservePreview: true
    });
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
  preserveTokenSize = false,
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

    if (preserveTokenSize) {
  const bounds =
    getEnemyTokenSizeBounds(form);

  next.tokenSize = Math.min(
    bounds.max,
    Math.max(
      bounds.min,
      toTokenGridSize(
        previous.tokenSize,
        next.tokenSize
      )
    )
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

    if (preserveQualities || preserveAttacks) {
      next.superiorMode = foundry.utils.deepClone(
        previous.superiorMode ??
        createEnemySuperiorModeDraft()
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

  if (key === "tokenSize") {
    if (!selected) return;

    const bounds =
      getEnemyTokenSizeBounds(selected);

    this.enemyBuild.tokenSize = Math.min(
      bounds.max,
      Math.max(
        bounds.min,
        toTokenGridSize(
          value,
          this.enemyBuild.tokenSize
        )
      )
    );

    return;
  }

  if (!["baseDp", "bonusDp"].includes(key)) {
    return;
  }

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
    .filter((attack) => {
      return String(
        attack.name ?? ""
      ).trim();
    })
    .map((attack) => ({
      key: attack.key,
      label: attack.name,

      rangeType: attack.rangeType,
      functionType: attack.functionType,

      isSignature: Boolean(
        attack.isSignature
      )
    }));
}

_getEnemyInnateTalentChoiceOptions() {
  return ENEMY_INNATE_TALENT_SKILL_CATEGORIES.flatMap(
    (category) => {
      const categoryLabel = text(
        category.pt,
        category.en
      );

      const skills = category.skills.map((skill) => ({
        key: skill.key,
        label: text(skill.pt, skill.en),
        originalLabel: skill.en,
        derivedStat: skill.derivedStat
      }));

      return createEnemyUnorderedPairs(skills).map(
        ([left, right]) => ({
          key: `innate:${category.key}:${left.key}+${right.key}`,

          label:
            `${categoryLabel} · ` +
            `${left.label} + ${right.label}`,

          originalLabel:
            `${category.en} · ` +
            `${left.originalLabel} + ${right.originalLabel}`,

          type: "skillPair",

          attributeCategory: category.key,
          attributeCategoryLabel: categoryLabel,

          skills: [
            foundry.utils.deepClone(left),
            foundry.utils.deepClone(right)
          ],

          effect: text(
            `${left.label} e ${right.label} recebem o benefício de Perícia Prodigiosa.`,
            `${left.label} and ${right.label} gain the benefit of Prodigious Skill.`
          )
        })
      );
    }
  );
}

_getEnemyNaturalWeaknessElementOptions(
  quality = {}
) {
  const naturewalkElements = new Set(
    this._getEnemyQualitySelectionChoiceKeys(
      "passoNatural"
    ).map(getEnemyElementKey)
  );

  return getEnemyStaticChoiceOptions(quality)
    .map((option) => {
      const elementKey = getEnemyElementKey(
        option.key ??
        option.label ??
        option.originalLabel
      );

      return {
        ...option,
        elementKey
      };
    })
    .filter((option) => {
      return (
        Boolean(option.elementKey) &&
        !naturewalkElements.has(option.elementKey)
      );
    });
}

_getEnemyNaturalWeaknessChoiceOptions(
  quality = {}
) {
  const elements =
    this._getEnemyNaturalWeaknessElementOptions(
      quality
    );

  return createEnemyUnorderedPairs(elements).map(
    ([left, right]) => ({
      key:
        `weakness:` +
        `${left.elementKey}+${right.elementKey}`,

      label:
        `${left.label} + ${right.label}`,

      originalLabel:
        `${left.originalLabel || left.label} + ` +
        `${right.originalLabel || right.label}`,

      type: "elementPair",

      elements: [
        {
          key: left.elementKey,
          label: left.label,
          originalLabel:
            left.originalLabel || left.label
        },
        {
          key: right.elementKey,
          label: right.label,
          originalLabel:
            right.originalLabel || right.label
        }
      ],

      effect: text(
        `Fraqueza contra ${left.label} e ${right.label}.`,
        `Weakness to ${left.label} and ${right.label}.`
      )
    })
  );
}

_getEnemyTaggedAttackChoiceOptions({
  sourceQualityId = "",
  requiredTag = "",
  grantedTag = "",
  excludeSupport = false
} = {}) {
  const selectedAttackKeys = new Set(
    this._getEnemyQualitySelectionChoiceKeys(
      sourceQualityId
    )
  );

  return this.getEnemyAttackChoiceOptions()
    .filter((attack) => {
      const attackKey = String(
        attack.key ?? ""
      );

      if (!selectedAttackKeys.has(attackKey)) {
        return false;
      }

      if (
        excludeSupport &&
        attack.functionType === "support"
      ) {
        return false;
      }

      return true;
    })
    .map((attack) => ({
      key: attack.key,

      label:
        `${attack.label} · ` +
        `[${requiredTag.toUpperCase()}] → ` +
        `[${grantedTag.toUpperCase()}]`,

      originalLabel: attack.label,

      type: "attack",
      attackKey: attack.key,
      rangeType: attack.rangeType,
      functionType: attack.functionType,

      requiredTag,
      grantedTag
    }));
}

_enemyChoiceKeyTargetsAttack(
  choiceKey = "",
  attackKey = ""
) {
  const choice = String(
    choiceKey ?? ""
  ).trim();

  const attack = String(
    attackKey ?? ""
  ).trim();

  if (!choice || !attack) {
    return false;
  }

  return (
    choice === attack ||
    choice.startsWith(`${attack}:`)
  );
}

_getEnemyAttackSelectedPositiveTags(
  attackKey = ""
) {
  const key = String(
    attackKey ?? ""
  ).trim();

  if (!key) return [];

  const tags = new Set();

  for (
    const selection of
    this.enemyBuild?.selectedQualities ?? []
  ) {
    const quality = getEnemyQualityById(
      selection.id
    );

    if (!quality) continue;

    const isNegative = Boolean(
      quality.tier === "negative" ||
      quality.category?.negative ||
      quality.cost?.grantsDp
    );

    /*
     * Assinatura Complexa exige Tags vindas de
     * Qualidades não negativas.
     */
    if (isNegative) continue;

    const choiceKeys = Array.isArray(
      selection.choiceKeys
    )
      ? selection.choiceKeys
      : [];

    const matchingChoiceKeys =
      choiceKeys.filter((choiceKey) => {
        return this._enemyChoiceKeyTargetsAttack(
          choiceKey,
          key
        );
      });

    if (!matchingChoiceKeys.length) {
      continue;
    }

    for (const choiceKey of matchingChoiceKeys) {
      const rawChoiceKey = String(
        choiceKey ?? ""
      );

      /*
       * Escolhas do tipo attackTag costumam usar:
       *
       * enemyAttack-123:t:blast
       */
      const selectedTag =
        rawChoiceKey.startsWith(`${key}:`)
          ? rawChoiceKey.slice(
              key.length + 1
            )
          : "";

      if (selectedTag) {
        const normalizedTag = selectedTag
          .trim()
          .replace(/^\[|\]$/g, "")
          .toLowerCase();

        if (normalizedTag) {
          tags.add(normalizedTag);
        }

        continue;
      }

      /*
       * Escolhas singleAttack guardam somente a
       * chave do ataque. Nesse caso, usamos a Tag
       * concedida pela própria Qualidade.
       */
      for (
        const tag of
        quality.attackModifier
          ?.grantsTags ?? []
      ) {
        const normalizedTag = String(
          tag ?? ""
        )
          .trim()
          .replace(/^\[|\]$/g, "")
          .toLowerCase();

        if (normalizedTag) {
          tags.add(normalizedTag);
        }
      }
    }
  }

  return [...tags];
}

_getEnemyAttackActionCostBeforeComplex(
  attackKey = ""
) {
  const key = String(
    attackKey ?? ""
  ).trim();

  if (!key) return 1;

  const attack = (
    this.enemyBuild?.attacks ?? []
  ).find((entry) => {
    return String(entry.key ?? "") === key;
  });

  if (!attack) return 1;

  let actionCost = 1;

  for (
    const selection of
    this.enemyBuild?.selectedQualities ?? []
  ) {
    const quality = getEnemyQualityById(
      selection.id
    );

    if (!quality) continue;

    /*
     * Não contamos a própria Assinatura Complexa.
     */
    if (
      String(quality.id ?? "") ===
      "assinaturaComplexa"
    ) {
      continue;
    }

    const choiceKeys = Array.isArray(
      selection.choiceKeys
    )
      ? selection.choiceKeys
      : [];

    const appliesToAttack =
      choiceKeys.some((choiceKey) => {
        return this._enemyChoiceKeyTargetsAttack(
          choiceKey,
          key
        );
      });

    if (!appliesToAttack) continue;

    const modifier =
      quality.attackModifier ?? {};

    actionCost += Math.max(
      0,
      Number(
        modifier.extraActionCost ??
        modifier.actionCostIncrease ??
        0
      )
    );

    /*
     * Ataque Furtivo à distância exige uma Ação
     * adicional, exceto em Movimento Assinatura.
     */
    if (
      !attack.isSignature &&
      attack.rangeType === "range"
    ) {
      actionCost += Math.max(
        0,
        Number(
          modifier.rangeExtraActionCost ?? 0
        )
      );
    }
  }

  return Math.max(
    1,
    actionCost
  );
}

_getEnemyComplexSignatureEligibility(
  attack = {}
) {
  const attackKey = String(
    attack.key ?? ""
  );

  const positiveTags =
    this._getEnemyAttackSelectedPositiveTags(
      attackKey
    );

  const currentActionCost =
    this._getEnemyAttackActionCostBeforeComplex(
      attackKey
    );

  const isSignature = Boolean(
    attack.isSignature
  );

  const hasEnoughTags =
    positiveTags.length >= 2;

  const actionCostIsValid =
    currentActionCost < 2;

  return {
    eligible:
      isSignature &&
      hasEnoughTags &&
      actionCostIsValid,

    isSignature,
    hasEnoughTags,
    actionCostIsValid,

    positiveTags,
    currentActionCost
  };
}

_getEnemyComplexSignatureChoiceOptions() {
  return this.getEnemyAttackChoiceOptions()
    .map((attack) => {
      const eligibility =
        this._getEnemyComplexSignatureEligibility(
          attack
        );

      return {
        attack,
        eligibility
      };
    })
    .filter(({ eligibility }) => {
      return eligibility.eligible;
    })
    .map(({ attack, eligibility }) => {
      const tagLabel =
        eligibility.positiveTags
          .map((tag) => {
            return `[${tag.toUpperCase()}]`;
          })
          .join(" + ");

      return {
        key: attack.key,

        label:
          `${attack.label} · ` +
          `${tagLabel} · ` +
          `${eligibility.currentActionCost} → ` +
          `${eligibility.currentActionCost + 1} ` +
          text("Ações", "Actions"),

        originalLabel: attack.label,

        type: "signatureMove",
        attackKey: attack.key,

        isSignature: true,

        existingTags:
          foundry.utils.deepClone(
            eligibility.positiveTags
          ),

        existingActionCost:
          eligibility.currentActionCost,

        grantedTag: "complex",
        actionCostIncrease: 1
      };
    });
}

_pruneEnemyComplexSignatureSelection() {
  const selection =
    this.getEnemyQualitySelection(
      "assinaturaComplexa"
    );

  if (!selection) return;

  const attackKey = String(
    selection.choiceKeys?.[0] ?? ""
  );

  const attack = (
    this.enemyBuild?.attacks ?? []
  ).find((entry) => {
    return String(entry.key ?? "") ===
      attackKey;
  });

  const eligibility = attack
    ? this._getEnemyComplexSignatureEligibility(
        attack
      )
    : null;

  if (eligibility?.eligible) return;

  this.enemyBuild.selectedQualities = (
    this.enemyBuild.selectedQualities ?? []
  ).filter((entry) => {
    return String(entry.id ?? "") !==
      "assinaturaComplexa";
  });
}

_getEnemySelectedEffectKeys() {
  const effectQualityIds = new Set([
    "efeitoBasico",
    "efeitoAvancado",
    "efeitoMestre"
  ]);

  const keys = new Set();

  for (
    const selection of
    this.enemyBuild?.selectedQualities ?? []
  ) {
    if (!effectQualityIds.has(
      String(selection.id ?? "")
    )) {
      continue;
    }

    for (
      const choiceKey of
      selection.choiceKeys ?? []
    ) {
      const key = String(
        choiceKey ?? ""
      ).trim();

      if (key) keys.add(key);
    }
  }

  return keys;
}

_getEnemyOverclockSelectedEffectKeys() {
  const quality = getEnemyQualityById(
    "overclock"
  );

  const selection = this.getEnemyQualitySelection(
    "overclock"
  );

  if (!quality || !selection) {
    return new Set();
  }

  const options =
    this._getEnemyOverclockChoiceOptions(
      quality,
      {
        ignorePurchasedEffects: true
      }
    );

  const keys = new Set();

  for (
    const choiceKey of
    selection.choiceKeys ?? []
  ) {
    const option = options.find((entry) => {
      return String(entry.key ?? "") ===
        String(choiceKey ?? "");
    });

    const effectTag = String(
      option?.effectTag ?? ""
    ).trim();

    if (effectTag) keys.add(effectTag);
  }

  return keys;
}

_getEnemyOverclockChoiceOptions(
  _quality = {},
  {
    ignorePurchasedEffects = false
  } = {}
) {
  const form = this._getSelectedForm();

  if (!form) return [];

  const allowedPotencyStats = new Set([
    "bit",
    "dos",
    "ram",
    "cpu"
  ]);

  const purchasedEffectKeys =
    ignorePurchasedEffects
      ? new Set()
      : this._getEnemySelectedEffectKeys();

  const sourceQualityIds = [
    "efeitoBasico",
    "efeitoAvancado",
    "efeitoMestre"
  ];

  const options = [];

  for (const sourceQualityId of sourceQualityIds) {
    const sourceQuality = getEnemyQualityById(
      sourceQualityId
    );

    if (!sourceQuality) continue;

    if (
      getEnemyQualityStageOrder(sourceQuality) >
      getEnemyFormStageOrder(form)
    ) {
      continue;
    }

    const effectDpCost =
      getEnemyQualityPositiveCost(
        sourceQuality,
        1
      );

    for (
      const effect of
      getEnemyStaticChoiceOptions(sourceQuality)
    ) {
      const effectTag = String(
        effect.key ?? ""
      ).trim();

      const potencyStat = String(
        effect.potency ?? ""
      )
        .trim()
        .toLowerCase();

      if (
        effect.type !== "positive" ||
        !allowedPotencyStats.has(potencyStat) ||
        purchasedEffectKeys.has(effectTag)
      ) {
        continue;
      }

      const extraActionRequired = Boolean(
        effect.extraActionRequired
      );

      options.push({
        ...foundry.utils.deepClone(effect),

        key:
          `overclock:${sourceQualityId}:` +
          effectTag,

        label:
          `${effect.label} · ` +
          `${potencyStat.toUpperCase()} · ` +
          `${effectDpCost} PD` +
          (
            extraActionRequired
              ? ` · +1 ${text("Ação", "Action")}`
              : ""
          ),

        originalLabel:
          String(
            effect.originalLabel ??
            effect.label ??
            effectTag
          ),

        type: "overclockEffect",

        sourceQualityId,
        sourceQualityName: String(
          sourceQuality.name ?? ""
        ),

        effectTag,
        effectType: "positive",
        potencyStat,

        duration: effect.duration,
        extraActionRequired,

        effectDpCost
      });
    }
  }

  return options;
}

_getEnemyModeChangeChoiceOptions(
  quality = {}
) {
  const form = this._getSelectedForm();

  if (!form) return [];

  const statKeys = (
    Array.isArray(
      quality.choices?.options
    )
      ? quality.choices.options
      : []
  )
    .map((entry) => {
      return String(
        typeof entry === "string"
          ? entry
          : (
              entry?.key ??
              entry?.value ??
              ""
            )
      ).trim();
    })
    .filter((statKey) => {
      return (
        ENEMY_STAT_ORDER.includes(
          statKey
        ) &&
        statKey !== "health"
      );
    });

  const statPairs =
    createEnemyUnorderedPairs(
      statKeys
    );

  const currentSize = String(
    form.size ?? "medium"
  );

  const currentSizeIndex =
    ENEMY_SIZE_ORDER.indexOf(
      currentSize
    );

  const maximumSize = String(
    getEnemyStageData(form)?.maxSize ??
    currentSize
  );

  const maximumSizeIndex =
    ENEMY_SIZE_ORDER.indexOf(
      maximumSize
    );

  const sizeOptions = [
    {
      key: "same",
      modeSize: "",
      sizeDirection: "same",

      label: text(
        "sem alterar o Tamanho",
        "no Size change"
      )
    }
  ];

  const addSizeOption = (
    sizeIndex,
    sizeDirection
  ) => {
    if (
      sizeIndex < 0 ||
      sizeIndex >=
        ENEMY_SIZE_ORDER.length ||
      (
        maximumSizeIndex >= 0 &&
        sizeIndex > maximumSizeIndex
      )
    ) {
      return;
    }

    const modeSize =
      ENEMY_SIZE_ORDER[sizeIndex];

    const sizeLabel = localizeMaybe(
      CONFIG.DDA?.sizes?.[modeSize],
      modeSize
    );

    sizeOptions.push({
      key: modeSize,
      modeSize,
      sizeDirection,

      label: text(
        `Tamanho ${sizeLabel}`,
        `Size ${sizeLabel}`
      )
    });
  };

  if (currentSizeIndex >= 0) {
    addSizeOption(
      currentSizeIndex - 1,
      "smaller"
    );

    addSizeOption(
      currentSizeIndex + 1,
      "larger"
    );
  }

  return statPairs.flatMap(
    ([leftStat, rightStat]) => {
      const pairLabel =
        `${getEnemyStatLabel(leftStat)} ↔ ` +
        getEnemyStatLabel(rightStat);

      return sizeOptions.map(
        (sizeOption) => ({
          key:
            `modeChange:${leftStat}:` +
            `${rightStat}:` +
            sizeOption.key,

          label:
            `${pairLabel} · ` +
            sizeOption.label,

          originalLabel:
            pairLabel,

          type:
            "modeChangePair",

          stats: [
            leftStat,
            rightStat
          ],

          leftStat,
          rightStat,

          defaultSize:
            currentSize,

          modeSize:
            sizeOption.modeSize,

          sizeDirection:
            sizeOption.sizeDirection
        })
      );
    }
  );
}

_getEnemyQualityDynamicChoiceOptions(
  quality = {}
) {
  const qualityId = getEnemyQualityId(quality);

    if (
    qualityId ===
    "mudancaDeModo"
  ) {
    return this
      ._getEnemyModeChangeChoiceOptions(
        quality
      );
  }

    if (qualityId === "overclock") {
    return this._getEnemyOverclockChoiceOptions(
      quality
    );
  }

    if (qualityId === "assinaturaComplexa") {
    return this
      ._getEnemyComplexSignatureChoiceOptions();
  }

  if (qualityId === "talentoInato") {
    return this._getEnemyInnateTalentChoiceOptions();
  }

  if (qualityId === "fraquezaNatural") {
    return this._getEnemyNaturalWeaknessChoiceOptions(
      quality
    );
  }

  if (qualityId === "perfuracaoDesastrada") {
    return this._getEnemyTaggedAttackChoiceOptions({
      sourceQualityId: "perfuracaoDeArmadura",
      requiredTag: "piercing",
      grantedTag: "fumble"
    });
  }

  if (qualityId === "golpeEnfraquecido") {
    return this._getEnemyTaggedAttackChoiceOptions({
      sourceQualityId: "golpeCerteiro",
      requiredTag: "certain",
      grantedTag: "fragile",
      excludeSupport: true
    });
  }

  if (!enemyQualityRequiresAttackChoice(quality)) {
    return [];
  }

  return this.getEnemyAttackChoiceOptions().map(
    (attack) => ({
      key: attack.key,

      label:
        `${attack.label} · ` +
        `${
          attack.rangeType === "range"
            ? text("À distância", "Range")
            : text("Corpo a corpo", "Melee")
        }`,

      originalLabel: attack.label,

      type: "attack",
      attackKey: attack.key,
      rangeType: attack.rangeType,
      functionType: attack.functionType
    })
  );
}

_getEnemyQualitySelectionChoiceKeys(qualityId = "") {
  const selection = this.getEnemyQualitySelection(
    qualityId
  );

  return Array.isArray(selection?.choiceKeys)
    ? selection.choiceKeys
        .map((key) => String(key ?? "").trim())
        .filter(Boolean)
    : [];
}

_getEnemyBuildDerivedStatValue(
  statKey = "",
  form = this._getSelectedForm()
) {
  if (!form) return 0;

  const sourceStatByDerived = {
    bit: "accuracy",
    dos: "damage",
    ram: "dodge",
    cpu: "armor"
  };

  const sourceStat = sourceStatByDerived[statKey];
  if (!sourceStat) return 0;

  const stageValue = getEnemyStageValue(form);

  const investment = toNonNegativeInteger(
    this.enemyBuild?.statInvestments?.[sourceStat],
    0
  );

  const sizeModifiers =
    ENEMY_SIZE_MODIFIERS[form.size] ??
    ENEMY_SIZE_MODIFIERS.medium;

  return Math.max(
    0,
    Math.floor((stageValue + investment) / 3) +
    Number(sizeModifiers?.[statKey] ?? 0)
  );
}

getEnemyQualityEffectiveMax(
  quality = {},
  form = this._getSelectedForm()
) {
  const rankLimit = quality.rankLimit ?? {};
  const rankLimitType = String(
    rankLimit.type ?? ""
  ).trim();

  if (
    rankLimitType === "byStage" ||
    rankLimitType === "byStageMaxFour"
  ) {
    const stageKey = String(
      form?.stageKey ?? "child"
    );

    return Math.max(
      0,
      Number(
        rankLimit.byStage?.[stageKey] ??
        getEnemyQualityDeclaredMaxRank(quality)
      )
    );
  }

  if (rankLimitType === "derivedStat") {
    return this._getEnemyBuildDerivedStatValue(
      String(rankLimit.stat ?? ""),
      form
    );
  }

  const qualityId = getEnemyQualityId(quality);

  if (qualityId === "forcaElemental") {
    return this.getEnemyQualitySelectionRank(
      "passoNatural"
    );
  }

  if (qualityId === "erroDeSistema") {
    return Math.min(
      getEnemyQualityDeclaredMaxRank(quality),
      this.getEnemyQualitySelectionRank(
        "impulsoDeSistema"
      )
    );
  }

  if (qualityId === "fraquezaNatural") {
    const elementPairLimit = Math.floor(
      this._getEnemyNaturalWeaknessElementOptions(
        quality
      ).length / 2
    );

    return Math.min(
      getEnemyQualityDeclaredMaxRank(quality),

      this.getEnemyQualitySelectionRank(
        "passoNatural"
      ),

      elementPairLimit
    );
  }

  if (qualityId === "perfuracaoDesastrada") {
    return Math.min(
      getEnemyQualityDeclaredMaxRank(quality),

      /*
       * A definição atual da Qualidade limita os
       * Ranks pelos Ranks de Golpe Certeiro.
       */
      this.getEnemyQualitySelectionRank(
        "golpeCerteiro"
      )
    );
  }

  if (qualityId === "golpeEnfraquecido") {
    return Math.min(
      getEnemyQualityDeclaredMaxRank(quality),

      this.getEnemyQualitySelectionRank(
        "golpeCerteiro"
      )
    );
  }

  const declaredMax =
    getEnemyQualityDeclaredMaxRank(quality);

  if (declaredMax > 0) {
    return declaredMax;
  }

  const optionCount =
    getEnemyStaticChoiceOptions(quality).length;

  return optionCount > 0
    ? optionCount
    : getEnemyQualityBaseRank(quality);
}

_getEnemyQualityAllChoiceOptions(quality = {}) {
  const choiceType = String(
    quality.choices?.type ?? ""
  ).trim();

  const staticOptions =
    ENEMY_SPECIAL_PAIR_CHOICE_TYPES.has(
      choiceType
    )
      ? []
      : getEnemyStaticChoiceOptions(quality);

  const options = [
    ...staticOptions,

    ...this._getEnemyQualityDynamicChoiceOptions(
      quality
    )
  ];

  const seen = new Set();

  return options.filter((option) => {
    const key = String(option?.key ?? "").trim();

    if (!key || seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

_enemyQualityNeedsChoiceForNextRank(
  quality = {}
) {
  if (!quality.choices?.required) return false;

  const choiceType = String(
    quality.choices?.type ?? ""
  ).trim();

  /*
   * Mudança de Modo Superior é configurada em um
   * painel próprio depois que a Qualidade entra
   * na build. Ela não usa o seletor simples do
   * catálogo antes da compra.
   */
  if (
    choiceType ===
    "superiorModeConfiguration"
  ) {
    return false;
  }

  const selectedRank =
    this.getEnemyQualitySelectionRank(
      getEnemyQualityId(quality)
    );

  if (
    selectedRank > 0 &&
    (
      quality.choices.repeatOnRankIncrease === false ||
      ENEMY_SINGLE_CONFIGURATION_CHOICE_TYPES.has(
        choiceType
      )
    )
  ) {
    return false;
  }

  return true;
}

_getEnemyQualityAvailableChoiceOptions(
  quality = {}
) {
  const qualityId = getEnemyQualityId(quality);

  const selection = this.getEnemyQualitySelection(
    qualityId
  );

  const usedKeys = new Set(
    Array.isArray(selection?.choiceKeys)
      ? selection.choiceKeys.map((key) => {
          return String(key ?? "").trim();
        })
      : []
  );

  let options =
    this._getEnemyQualityAllChoiceOptions(
      quality
    );

  if (quality.choices?.cannotRepeat) {
    options = options.filter((option) => {
      return !usedKeys.has(
        String(option.key ?? "")
      );
    });
  }

  if (qualityId === "mobilidadeAvancada") {
    const extraMovementChoices = new Set(
      this._getEnemyQualitySelectionChoiceKeys(
        "movimentoExtra"
      )
    );

    options = options.filter((option) => {
      return extraMovementChoices.has(
        String(option.key ?? "")
      );
    });
  }

  if (qualityId === "forcaElemental") {
    const naturewalkChoices = new Set(
      this._getEnemyQualitySelectionChoiceKeys(
        "passoNatural"
      )
    );

    options = options.filter((option) => {
      return naturewalkChoices.has(
        String(option.key ?? "")
      );
    });
  }

  if (qualityId === "erroDeSistema") {
    const systemBoostChoices = new Set(
      this._getEnemyQualitySelectionChoiceKeys(
        "impulsoDeSistema"
      )
    );

    options = options.filter((option) => {
      return !systemBoostChoices.has(
        String(option.key ?? "")
      );
    });
  }

  if (qualityId === "especializacaoDeDados") {
    const optimizationChoice =
      this._getEnemyQualitySelectionChoiceKeys(
        "otimizacaoDeDados"
      )[0] ?? "";

    options = options.filter((option) => {
      return String(
        option.dataOptimization ?? ""
      ) === optimizationChoice;
    });
  }

  if (qualityId === "fraquezaNatural") {
    const allOptions =
      this._getEnemyQualityAllChoiceOptions(
        quality
      );

    const usedElementKeys = new Set();

    for (const selectedKey of usedKeys) {
      const selectedOption = allOptions.find(
        (option) => {
          return String(option.key ?? "") ===
            selectedKey;
        }
      );

      for (
        const element of
        selectedOption?.elements ?? []
      ) {
        const elementKey = getEnemyElementKey(
          element.key ?? element.label
        );

        if (elementKey) {
          usedElementKeys.add(elementKey);
        }
      }
    }

    options = options.filter((option) => {
      return (option.elements ?? []).every(
        (element) => {
          const elementKey = getEnemyElementKey(
            element.key ?? element.label
          );

          return (
            elementKey &&
            !usedElementKeys.has(elementKey)
          );
        }
      );
    });
  }

    if (
    qualityId ===
    "mudancaDeModo"
  ) {
    const allOptions =
      this._getEnemyQualityAllChoiceOptions(
        quality
      );

    const selectedOptions =
      Array.from(usedKeys)
        .map((selectedKey) => {
          return allOptions.find(
            (option) => {
              return String(
                option.key ?? ""
              ) === selectedKey;
            }
          );
        })
        .filter(Boolean);

    const usedStats = new Set(
      selectedOptions.flatMap(
        (option) => {
          return Array.isArray(
            option.stats
          )
            ? option.stats
            : [];
        }
      )
    );

    const selectedModeSize =
      selectedOptions.find(
        (option) => {
          return Boolean(
            option.modeSize
          );
        }
      )?.modeSize ?? "";

    options = options.filter(
      (option) => {
        const stats =
          Array.isArray(option.stats)
            ? option.stats
            : [];

        if (
          stats.length !== 2 ||
          stats.some((statKey) => {
            return usedStats.has(
              statKey
            );
          })
        ) {
          return false;
        }

        /*
         * O Tamanho só é escolhido uma vez,
         * mesmo com 2 Ranks.
         */
        if (
          selectedModeSize &&
          option.modeSize
        ) {
          return false;
        }

        return true;
      }
    );
  }

  if (
    [
      "efeitoBasico",
      "efeitoAvancado",
      "efeitoMestre"
    ].includes(qualityId)
  ) {
    const overclockEffectKeys =
      this._getEnemyOverclockSelectedEffectKeys();

    options = options.filter((option) => {
      return !overclockEffectKeys.has(
        String(option.key ?? "")
      );
    });
  }

  return options;
}

getEnemyQualityBrowserChoiceOptions(
  quality = {}
) {
  if (
    !this._enemyQualityNeedsChoiceForNextRank(
      quality
    )
  ) {
    return [];
  }

  return this._getEnemyQualityAvailableChoiceOptions(
    quality
  );
}

getEnemyQualityBrowserBlockedReason(
  quality = {}
) {
  if (!quality.choices?.required) return "";

  if (
    !this._enemyQualityNeedsChoiceForNextRank(
      quality
    )
  ) {
    return "";
  }

  const choiceType = String(
    quality.choices?.type ?? ""
  ).trim();

  if (!ENEMY_SUPPORTED_CHOICE_TYPES.has(choiceType)) {
    return text(
      "Esta Qualidade exige uma configuração especial que será adicionada ao Enemy Creator em seguida.",
      "This Quality requires a special configuration that will be added to the Enemy Creator next."
    );
  }

  const effectiveMax =
    this.getEnemyQualityEffectiveMax(quality);

  if (effectiveMax <= 0) {
    return text(
      "Nenhum Rank está disponível com a build atual.",
      "No Rank is available with the current build."
    );
  }

  const options =
    this._getEnemyQualityAvailableChoiceOptions(
      quality
    );

  if (options.length) return "";

  const qualityId = getEnemyQualityId(quality);

  const messages = {
    mobilidadeAvancada: text(
      "Escolha primeiro um tipo correspondente em Movimento Extra.",
      "First choose a matching type in Extra Movement."
    ),

    forcaElemental: text(
      "Escolha primeiro ao menos um Elemento em Passo Natural.",
      "First choose at least one Element in Naturewalk."
    ),

    especializacaoDeDados: text(
      "A Otimização de Dados escolhida não possui uma Especialização disponível para esta seleção.",
      "The chosen Data Optimization has no available Specialization for this selection."
    ),

    erroDeSistema: text(
      "Todas as Estatísticas Derivadas válidas já estão afetadas por Impulso de Sistema.",
      "All valid Derived Stats are already affected by System Boost."
    ),

    talentoInato: text(
      "Nenhum par válido de Perícias está disponível.",
      "No valid Skill pair is available."
    ),

    fraquezaNatural: text(
      "Escolha Passo Natural primeiro e deixe ao menos dois Elementos diferentes livres para este Rank.",
      "Choose Naturewalk first and leave at least two different Elements available for this Rank."
    ),

    perfuracaoDesastrada: text(
      "Adicione Perfuração de Armadura a um Ataque e tenha Ranks suficientes em Golpe Certeiro.",
      "Add Armor Piercing to an Attack and have enough Ranks in Certain Strike."
    ),

    golpeEnfraquecido: text(
      "Adicione Golpe Certeiro a um Ataque [DAMAGE] antes de escolher Golpe Enfraquecido.",
      "Add Certain Strike to a [DAMAGE] Attack before choosing Weakened Strike."
    ),

    assinaturaComplexa: text(
      "Marque um ataque como Movimento Assinatura. Ele precisa possuir pelo menos 2 Tags vindas de Qualidades não negativas e ainda custar menos de 2 Ações.",
      "Mark an Attack as a Signature Move. It must already have at least 2 Tags from non-Negative Qualities and still cost fewer than 2 Actions."
    ),

    overclock: text(
      "Nenhum Efeito Positivo elegível está disponível. O Efeito precisa usar BIT, DOS, RAM ou CPU como Potência e não pode já ter sido comprado.",
      "No eligible Positive Effect is available. The Effect must use BIT, DOS, RAM, or CPU as Potency and cannot already be purchased."
    ),

    mudancaDeModo: text(
      "Não há outro par válido de Estatísticas disponível para este Rank.",
      "No other valid Stat pair is available for this Rank."
    )
  };
  return messages[qualityId] ?? text(
    "Nenhuma opção válida está disponível para esta Qualidade.",
    "No valid option is available for this Quality."
  );
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

    if (fieldKey === "isSignature") {
    const enabled = Boolean(value);

    if (enabled) {
      for (
        const entry of
        this.enemyBuild.attacks ?? []
      ) {
        entry.isSignature =
          String(entry.key ?? "") === key;
      }
    } else {
      attack.isSignature = false;
    }

    /*
     * Se o Movimento Assinatura escolhido deixou
     * de ser válido, remove Assinatura Complexa.
     */
    this._pruneEnemyComplexSignatureSelection();

    return;
  }

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

_getEnemyAttackQualityTags(
  attackKey = "",
  build = {}
) {
  const key = String(attackKey ?? "");
  const tags = new Set();

  const qualityRows = Array.isArray(
    build.selectedQualityRows
  )
    ? build.selectedQualityRows
    : [];

  for (const row of qualityRows) {
    const appliesToAttack = (
      row.choiceRows ?? []
    ).some((choice) => {
      return String(
        choice.attackKey ??
        choice.key ??
        ""
      ) === key;
    });

    if (!appliesToAttack) continue;

    for (
      const tag of
      row.quality?.attackModifier?.grantsTags ?? []
    ) {
      const normalizedTag = String(tag ?? "")
        .trim()
        .replace(/^\[|\]$/g, "")
        .toLowerCase();

      if (normalizedTag) {
        tags.add(normalizedTag);
      }
    }
  }

  return [...tags];
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

      const qualityTags =
        this._getEnemyAttackQualityTags(
          attack.key,
          build
        );

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
          isSignature: Boolean(
            attack.isSignature
          ),

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

          qualityTags,

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
            count: qualityTags.length,
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

  _ensureEnemySuperiorModeDraft() {
    this.enemyBuild ??= createEnemyBuild(
      this._getSelectedForm()
    );

    const current =
      this.enemyBuild.superiorMode;

    if (
      !current ||
      typeof current !== "object" ||
      Array.isArray(current)
    ) {
      this.enemyBuild.superiorMode =
        createEnemySuperiorModeDraft();
    }

    const draft =
      this.enemyBuild.superiorMode;

    draft.defaultQualityIds = Array.from(
      new Set(
        (
          Array.isArray(
            draft.defaultQualityIds
          )
            ? draft.defaultQualityIds
            : []
        )
          .map(String)
          .filter(Boolean)
      )
    );

    draft.modeQualities = (
      Array.isArray(draft.modeQualities)
        ? draft.modeQualities
        : []
    )
      .map(normalizeEnemyQualitySelection)
      .filter(Boolean);

    draft.defaultAttackKeys = Array.isArray(
      draft.defaultAttackKeys
    )
      ? draft.defaultAttackKeys
          .map(String)
          .filter(Boolean)
      : [];

    draft.modeAttacks = Array.isArray(
      draft.modeAttacks
    )
      ? draft.modeAttacks
      : [];

    return draft;
  }

  _getSuperiorModeDefaultQualityRows(
    form = this._getSelectedForm()
  ) {
    const draft =
      this._ensureEnemySuperiorModeDraft();

    const selectedIds = new Set(
      draft.defaultQualityIds
    );

    return this
      ._getEnemySelectedQualityRows(form)
      .filter((row) => {
        return (
          row.id !== "mudancaDeModo" &&
          row.id !==
            "mudancaDeModoSuperior" &&
          Number(row.qualityDp ?? 0) > 0 &&
          !row.isFree &&
          Number(row.negativeDp ?? 0) <= 0
        );
      })
      .map((row) => ({
        ...row,

        selectedForSuperiorMode:
          selectedIds.has(row.id)
      }));
  }

  _pruneEnemySuperiorModeDraft(
    form = this._getSelectedForm()
  ) {
    const draft =
      this._ensureEnemySuperiorModeDraft();

    const eligibleIds = new Set(
      this
        ._getSuperiorModeDefaultQualityRows(
          form
        )
        .map((row) => row.id)
    );

    draft.defaultQualityIds =
      draft.defaultQualityIds.filter(
        (qualityId) => {
          return eligibleIds.has(qualityId);
        }
      );

    return draft;
  }

  _getSuperiorModeDefaultCost(
    form = this._getSelectedForm()
  ) {
    const selectedIds = new Set(
      this
        ._ensureEnemySuperiorModeDraft()
        .defaultQualityIds
    );

    return this
      ._getSuperiorModeDefaultQualityRows(
        form
      )
      .filter((row) => {
        return selectedIds.has(row.id);
      })
      .reduce((total, row) => {
        return (
          total +
          Math.max(
            0,
            Number(row.qualityDp ?? 0)
          )
        );
      }, 0);
  }

  _getEnemySuperiorModePreview(
    form = this._getSelectedForm(),
    selectedQualityRows =
      this._getEnemySelectedQualityRows(form)
  ) {
    const enabled =
      selectedQualityRows.some((row) => {
        return (
          row.id ===
          "mudancaDeModoSuperior"
        );
      });

    if (!enabled) {
      return {
        enabled: false
      };
    }

    const draft =
      this._pruneEnemySuperiorModeDraft(
        form
      );

    const defaultQualityRows =
      this._getSuperiorModeDefaultQualityRows(
        form
      );

    const selectedIds = new Set(
      draft.defaultQualityIds
    );

    const selectedDefaultQualityRows =
      defaultQualityRows.filter((row) => {
        return selectedIds.has(row.id);
      });

    const modeQualityRows =
      this._withEnemyQualitySelectionScope(
        this._getEnemySuperiorModeActiveSelections(),
        () => {
          return this._getEnemyQualityRowsFromSelections(
            draft.modeQualities
          );
        }
      );

    const defaultCost =
      selectedDefaultQualityRows.reduce(
        (total, row) => {
          return (
            total +
            Math.max(
              0,
              Number(row.qualityDp ?? 0)
            )
          );
        },
        0
      );

    const maxDefaultCost =
      getEnemyStageValue(form ?? {}) * 3;

    const modeCost =
      modeQualityRows.reduce(
        (total, row) => {
          return (
            total +
            Math.max(
              0,
              Number(row.qualityDp ?? 0)
            )
          );
        },
        0
      );

    const hasDefaultQualities =
      selectedDefaultQualityRows.length > 0;

    const defaultCostWithinLimit =
      defaultCost <= maxDefaultCost;

    const modeCostMatchesDefault =
      hasDefaultQualities &&
      modeCost === defaultCost;

    const configurationComplete =
      hasDefaultQualities &&
      defaultCostWithinLimit &&
      modeCostMatchesDefault;

    return {
      enabled: true,
      defaultQualityRows,
      selectedDefaultQualityRows,
      modeQualityRows,

      defaultAttackKeys: foundry.utils.deepClone(
        draft.defaultAttackKeys
      ),

      modeAttacks: foundry.utils.deepClone(
        draft.modeAttacks
      ),

      defaultQualityCount:
        selectedDefaultQualityRows.length,

      defaultCost,
      modeCost,
      maxDefaultCost,

      remainingDefaultCost:
        Math.max(
          0,
          maxDefaultCost - defaultCost
        ),

      hasEligibleQualities:
        defaultQualityRows.length > 0,

      hasDefaultQualities,

      defaultCostWithinLimit,
      modeCostMatchesDefault,
      configurationComplete
    };
  }

  _toggleSuperiorDefaultQuality(
    qualityId = ""
  ) {
    const id = String(
      qualityId ?? ""
    ).trim();

    if (!id) return false;

    if (
      !this.getEnemyQualitySelection(
        "mudancaDeModoSuperior"
      )
    ) {
      ui.notifications.warn(text(
        "Adicione Mudança de Modo Superior antes de configurar as Qualidades Padrão.",
        "Add Superior Mode Change before configuring Default Qualities."
      ));

      return false;
    }

    const form = this._getSelectedForm();

    const eligibleRow = this
      ._getSuperiorModeDefaultQualityRows(
        form
      )
      .find((row) => row.id === id);

    if (!eligibleRow) {
      ui.notifications.warn(text(
        "Esta Qualidade não pode ser usada como Qualidade Padrão.",
        "This Quality cannot be used as a Default Quality."
      ));

      return false;
    }

    const draft =
      this._ensureEnemySuperiorModeDraft();

    const previousIds = [
      ...draft.defaultQualityIds
    ];

    const selectedIds = new Set(
      draft.defaultQualityIds
    );

    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }

    draft.defaultQualityIds = [
      ...selectedIds
    ];

    const maximum =
      getEnemyStageValue(form ?? {}) * 3;

    const total =
      this._getSuperiorModeDefaultCost(
        form
      );

    if (total > maximum) {
      draft.defaultQualityIds =
        previousIds;

      ui.notifications.warn(text(
        `As Qualidades Padrão não podem ultrapassar ${maximum} PD neste Estágio.`,
        `Default Qualities cannot exceed ${maximum} DP at this Stage.`
      ));

      return false;
    }

    const preview =
      this._getEnemySuperiorModePreview(form);

    if (
      preview.modeCost >
      preview.defaultCost
    ) {
      draft.defaultQualityIds =
        previousIds;

      ui.notifications.warn(text(
        "Remova Qualidades do Modo antes de reduzir o custo das Qualidades Padrão.",
        "Remove Mode Qualities before reducing the Default Quality cost."
      ));

      return false;
    }

    return true;
  }

    _getEnemySuperiorModeKeptSelections() {
    const draft =
      this._ensureEnemySuperiorModeDraft();

    const defaultIds = new Set(
      draft.defaultQualityIds
    );

    return (
      this.enemyBuild?.selectedQualities ?? []
    ).filter((selection) => {
      return !defaultIds.has(
        String(selection.id ?? "")
      );
    });
  }

  _getEnemySuperiorModeActiveSelections() {
    const draft =
      this._ensureEnemySuperiorModeDraft();

    return [
      ...this._getEnemySuperiorModeKeptSelections(),
      ...draft.modeQualities
    ];
  }

  _withEnemyQualitySelectionScope(
    selections = [],
    callback = () => null
  ) {
    const previous =
      this._enemyQualitySelectionOverride;

    this._enemyQualitySelectionOverride =
      Array.isArray(selections)
        ? selections
        : [];

    try {
      return callback();
    } finally {
      this._enemyQualitySelectionOverride =
        previous;
    }
  }

  getEnemySuperiorModeQualitySelection(
    qualityId = ""
  ) {
    const id = String(qualityId ?? "").trim();

    return this
      ._ensureEnemySuperiorModeDraft()
      .modeQualities
      .find((selection) => {
        return String(selection.id ?? "") === id;
      }) ?? null;
  }

  getEnemySuperiorModeQualitySelectionRank(
    qualityId = ""
  ) {
    const selection =
      this.getEnemySuperiorModeQualitySelection(
        qualityId
      );

    return Math.max(
      0,
      Number(selection?.rank ?? 0)
    );
  }

  getEnemySuperiorModeQualityEffectiveMax(
    quality = {},
    form = this._getSelectedForm()
  ) {
    return this._withEnemyQualitySelectionScope(
      this._getEnemySuperiorModeActiveSelections(),
      () => {
        return this.getEnemyQualityEffectiveMax(
          quality,
          form
        );
      }
    );
  }

  getEnemySuperiorModeQualityBrowserChoiceOptions(
    quality = {}
  ) {
    return this._withEnemyQualitySelectionScope(
      this._getEnemySuperiorModeActiveSelections(),
      () => {
        return this.getEnemyQualityBrowserChoiceOptions(
          quality
        );
      }
    );
  }

  getEnemySuperiorModeQualityBrowserBlockedReason(
    quality = {}
  ) {
    const form = this._getSelectedForm();

    if (!form) {
      return text(
        "Escolha uma forma primeiro.",
        "Choose a form first."
      );
    }

    const qualityId =
      getEnemyQualityId(quality);

    if (
      qualityId === "mudancaDeModo" ||
      qualityId === "mudancaDeModoSuperior"
    ) {
      return text(
        "As Qualidades de Mudança de Modo não podem ser Qualidades do Modo alternativo.",
        "Mode Change Qualities cannot be alternate Mode Qualities."
      );
    }

    const rank =
      getEnemyQualityBaseRank(quality);

    if (
      quality.tier === "free" ||
      quality.tier === "negative" ||
      quality.category?.free ||
      quality.category?.negative ||
      getEnemyQualityPositiveCost(
        quality,
        rank
      ) <= 0
    ) {
      return text(
        "Somente Qualidades pagas podem entrar no conjunto alternativo.",
        "Only paid Qualities can enter the alternate set."
      );
    }

    const draft =
      this._ensureEnemySuperiorModeDraft();

    if (draft.defaultQualityIds.includes(qualityId)) {
      return text(
        "Esta Qualidade já pertence ao conjunto Padrão que será substituído.",
        "This Quality already belongs to the Default set being replaced."
      );
    }

    const keptQualityIds = new Set(
      this
        ._getEnemySuperiorModeKeptSelections()
        .map((selection) => {
          return String(selection.id ?? "");
        })
    );

    if (keptQualityIds.has(qualityId)) {
      return text(
        "Esta Qualidade já permanece ativa nos dois Modos.",
        "This Quality already remains active in both Modes."
      );
    }

    return this._withEnemyQualitySelectionScope(
      this._getEnemySuperiorModeActiveSelections(),
      () => {
        return this._validateEnemyQualityRequirements(
          quality,
          form
        );
      }
    );
  }

  addEnemySuperiorModeQualityById(
    qualityId = "",
    {
      choiceKey = "",
      mainStat = ""
    } = {}
  ) {
    const form = this._getSelectedForm();

    if (!form) return false;

    const previewBefore =
      this._getEnemySuperiorModePreview(form);

    if (
      !previewBefore.enabled ||
      !previewBefore.hasDefaultQualities
    ) {
      ui.notifications.warn(text(
        "Selecione ao menos uma Qualidade Padrão antes de adicionar Qualidades do Modo.",
        "Select at least one Default Quality before adding Mode Qualities."
      ));

      return false;
    }

    const quality =
      getEnemyQualityById(qualityId);

    if (!quality) return false;

    const blockedReason =
      this.getEnemySuperiorModeQualityBrowserBlockedReason(
        quality
      );

    if (blockedReason) {
      ui.notifications.warn(blockedReason);
      return false;
    }

    const activeSelections =
      this._getEnemySuperiorModeActiveSelections();

    const effectiveMax =
      this.getEnemySuperiorModeQualityEffectiveMax(
        quality,
        form
      );

    const needsChoice =
      this._withEnemyQualitySelectionScope(
        activeSelections,
        () => {
          return this._enemyQualityNeedsChoiceForNextRank(
            quality
          );
        }
      );

    if (needsChoice) {
      const options =
        this.getEnemySuperiorModeQualityBrowserChoiceOptions(
          quality
        );

      if (
        !choiceKey ||
        !options.some((option) => {
          return String(option.key ?? "") ===
            String(choiceKey);
        })
      ) {
        ui.notifications.warn(text(
          "Escolha uma opção válida antes de adicionar esta Qualidade do Modo.",
          "Choose a valid option before adding this Mode Quality."
        ));

        return false;
      }
    }

    const naturewalkChoiceRank =
      buildEnemyNaturewalkChoiceRank(
        quality,
        choiceKey,
        mainStat
      );

    if (
      isEnemyNaturewalkQuality(quality) &&
      !naturewalkChoiceRank
    ) {
      ui.notifications.warn(text(
        "Escolha uma Estatística Principal válida para este Rank de Passo Natural.",
        "Choose a valid Core Stat for this Naturewalk Rank."
      ));

      return false;
    }

    const draft =
      this._ensureEnemySuperiorModeDraft();

    const previous = foundry.utils.deepClone(
      draft.modeQualities
    );

    const existing =
      draft.modeQualities.find((selection) => {
        return String(selection.id ?? "") ===
          String(quality.id ?? "");
      });

    if (existing) {
      const currentRank = Math.max(
        1,
        Number(existing.rank ?? 1)
      );

      if (currentRank >= effectiveMax) {
        ui.notifications.warn(text(
          "Esta Qualidade do Modo já está no Rank máximo.",
          "This Mode Quality is already at maximum Rank."
        ));

        return false;
      }

      existing.rank = currentRank + 1;

      if (needsChoice) {
        existing.choiceKeys ??= [];
        existing.choiceKeys.push(
          choiceKey
        );

        if (naturewalkChoiceRank) {
          existing.choiceRanks ??= [];

          existing.choiceRanks.push(
            naturewalkChoiceRank
          );
        }
      }
    } else {
      draft.modeQualities.push({
        id: String(
          quality.id ?? ""
        ),

        rank:
          getEnemyQualityBaseRank(
            quality
          ),

        choiceKeys: needsChoice
          ? [choiceKey]
          : [],

        choiceRanks:
          naturewalkChoiceRank
            ? [naturewalkChoiceRank]
            : []
      });
    }

    const previewAfter =
      this._getEnemySuperiorModePreview(form);

    if (
      previewAfter.modeCost >
      previewAfter.defaultCost
    ) {
      draft.modeQualities = previous;

      ui.notifications.warn(text(
        "O custo das Qualidades do Modo não pode ultrapassar o custo das Qualidades Padrão.",
        "Mode Qualities cannot cost more than the Default Qualities."
      ));

      return false;
    }

    return true;
  }

  removeEnemySuperiorModeQualityById(
    qualityId = ""
  ) {
    const id = String(qualityId ?? "").trim();
    if (!id) return false;

    const draft =
      this._ensureEnemySuperiorModeDraft();

    const previousLength =
      draft.modeQualities.length;

    draft.modeQualities =
      draft.modeQualities.filter((selection) => {
        return String(selection.id ?? "") !== id;
      });

    return (
      draft.modeQualities.length < previousLength
    );
  }

    getEnemyQualitySelection(qualityId = "") {
    const id = String(qualityId ?? "").trim();

    const selections = Array.isArray(
      this._enemyQualitySelectionOverride
    )
      ? this._enemyQualitySelectionOverride
      : this.enemyBuild?.selectedQualities ?? [];

    return selections.find((entry) => {
      return String(entry.id ?? "") === id;
    }) ?? null;
  }

  getEnemyQualitySelectionRank(qualityId = "") {
    const selection = this.getEnemyQualitySelection(qualityId);

    return Math.max(0, Number(selection?.rank ?? 0));
  }

  _getEnemyQualityRowsFromSelections(
    selections = []
  ) {
    return (
      Array.isArray(selections)
        ? selections
        : []
    )
      .map((selection) => {
        const quality = getEnemyQualityById(selection.id);

        if (!quality) return null;

        const rank = getEnemyQualityDisplayRank(
          selection,
          quality
        );

        const baseQualityDp =
          getEnemyQualityPositiveCost(
            quality,
            rank
          );

        const negativeDp =
          getEnemyQualityNegativeValue(
            quality,
            rank
          );
        const isFree = Boolean(
          quality.tier === "free" ||
          quality.category?.free
        );

const choiceRows = getEnemyQualityChoiceRows(
  quality,
  selection,
  this._getEnemyQualityAllChoiceOptions(quality)
);

        const attachedChoiceDp =
          choiceRows.reduce((total, choice) => {
            return total + Math.max(
              0,
              Number(
                choice.effectDpCost ?? 0
              )
            );
          }, 0);

        const qualityDp =
          baseQualityDp +
          attachedChoiceDp;

        const choiceLabel = choiceRows
          .map((choice) => {
            const label = String(
              choice.label ?? ""
            ).trim();

            const mainStatLabel = String(
              choice.mainStatLabel ?? ""
            ).trim();

            return mainStatLabel
              ? `${label} → ${mainStatLabel}`
              : label;
          })
          .filter(Boolean)
          .join(", ");

        return {
          id: String(quality.id ?? ""),
          name: String(quality.name ?? ""),
          originalName: String(quality.originalName ?? ""),
          section: String(quality.section ?? ""),
          tier: String(quality.tier ?? ""),
          rank,
          baseQualityDp,
          attachedChoiceDp,
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

    _getEnemySelectedQualityRows(
    form = this._getSelectedForm()
  ) {
    const selections = Array.isArray(
      this._enemyQualitySelectionOverride
    )
      ? this._enemyQualitySelectionOverride
      : this.enemyBuild?.selectedQualities ?? [];

    return this._getEnemyQualityRowsFromSelections(
      selections
    );
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
      const selectedNames =
        this._getSelectedQualityNameKeySet();

      const matches = requirementNames.map(
        (requiredName) => {
          return selectedNames.has(
            normalizeEnemyQualityName(
              requiredName
            )
          );
        }
      );

      const requirementsMet =
        quality.requirements?.mode === "any"
          ? matches.some(Boolean)
          : matches.every(Boolean);

      if (!requirementsMet) {
        const separator =
          quality.requirements?.mode === "any"
            ? text(" ou ", " or ")
            : ", ";

        return text(
          `Requer ${requirementNames.join(separator)}.`,
          `Requires ${requirementNames.join(separator)}.`
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

    const choiceBlockedReason =
      this.getEnemyQualityBrowserBlockedReason(
        quality
      );

    if (choiceBlockedReason) {
      return choiceBlockedReason;
    }

    return "";
  }

  addEnemyQualityById(qualityId = "", {
    choiceKey = "",
    mainStat = ""
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

const effectiveMax =
  this.getEnemyQualityEffectiveMax(
    quality,
    form
  );

if (effectiveMax <= 0) {
  ui.notifications.warn(text(
    "Nenhum Rank desta Qualidade está disponível para a build atual.",
    "No Rank of this Quality is available for the current build."
  ));

  return false;
}

if (
  this._enemyQualityNeedsChoiceForNextRank(
    quality
  )
) {
  const options =
    this._getEnemyQualityAvailableChoiceOptions(
      quality
    );

  if (
    !choiceKey ||
    !options.some((option) => {
      return String(
        option.key ?? ""
      ) === String(choiceKey);
    })
  ) {
    ui.notifications.warn(text(
      "Escolha uma opção válida antes de adicionar esta Qualidade.",
      "Choose a valid option before adding this Quality."
    ));

    return false;
  }
}

    const naturewalkChoiceRank =
      buildEnemyNaturewalkChoiceRank(
        quality,
        choiceKey,
        mainStat
      );

    if (
      isEnemyNaturewalkQuality(quality) &&
      !naturewalkChoiceRank
    ) {
      ui.notifications.warn(text(
        "Escolha uma Estatística Principal válida para este Rank de Passo Natural.",
        "Choose a valid Core Stat for this Naturewalk Rank."
      ));

      return false;
    }

    const previousSelection =
      foundry.utils.deepClone(
      this.enemyBuild.selectedQualities ?? []
    );

    const existing = this.enemyBuild.selectedQualities.find((entry) => {
      return String(entry.id ?? "") === String(quality.id ?? "");
    });

        const maxRank = effectiveMax;

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

      if (
        this._enemyQualityNeedsChoiceForNextRank(
          quality
        )
      ) {
        existing.choiceKeys ??= [];

        existing.choiceKeys.push(
          choiceKey
        );

        if (naturewalkChoiceRank) {
          existing.choiceRanks ??= [];

          existing.choiceRanks.push(
            naturewalkChoiceRank
          );
        }
      }
    } else {
      this.enemyBuild.selectedQualities.push({
        id: String(
          quality.id ?? ""
        ),

        rank:
          getEnemyQualityBaseRank(
            quality
          ),

        choiceKeys:
          this._enemyQualityNeedsChoiceForNextRank(
            quality
          )
            ? [choiceKey]
            : [],

        choiceRanks:
          naturewalkChoiceRank
            ? [naturewalkChoiceRank]
            : []
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

removeEnemyQualityById(
  qualityId = ""
) {
  const id = String(
    qualityId ?? ""
  ).trim();

  this.enemyBuild.selectedQualities = (
    this.enemyBuild.selectedQualities ?? []
  ).filter((entry) => {
    return String(entry.id ?? "") !== id;
  });

  if (id === "mudancaDeModoSuperior") {
    this.enemyBuild.superiorMode =
      createEnemySuperiorModeDraft();
  } else {
    this._pruneEnemySuperiorModeDraft();
  }

  /*
   * Remover uma das duas Tags obrigatórias pode
   * invalidar Assinatura Complexa.
   */
  this._pruneEnemyComplexSignatureSelection();
}

  _buildEnemySuperiorModeConfiguration(
    build = {}
  ) {
    const superiorMode =
      build.superiorMode ?? {};

    if (!superiorMode.enabled) {
      return {
        complete: false,
        defaultCost: 0,
        modeCost: 0,
        defaultQualityIds: [],
        modeQualities: [],
        defaultAttackKeys: [],
        modeAttacks: []
      };
    }

    return {
      complete: Boolean(
        superiorMode.configurationComplete
      ),

      defaultCost: Math.max(
        0,
        Number(superiorMode.defaultCost ?? 0)
      ),

      modeCost: Math.max(
        0,
        Number(superiorMode.modeCost ?? 0)
      ),

      defaultQualityIds: (
        superiorMode.selectedDefaultQualityRows ?? []
      )
        .map((row) => String(row.id ?? ""))
        .filter(Boolean),

      modeQualities: (
        superiorMode.modeQualityRows ?? []
      ).map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        originalName: String(
          row.originalName ?? ""
        ),

        rank: Math.max(
          1,
          Number(row.rank ?? 1)
        ),

        qualityDp: Math.max(
          0,
          Number(row.qualityDp ?? 0)
        ),

        choiceKeys: (
          row.choiceRows ?? []
        )
          .map((choice) => {
            return String(choice.key ?? "");
          })
          .filter(Boolean),

        choices: foundry.utils.deepClone(
          row.choiceRows ?? []
        )
      })),

      defaultAttackKeys: foundry.utils.deepClone(
        superiorMode.defaultAttackKeys ?? []
      ),

      modeAttacks: foundry.utils.deepClone(
        superiorMode.modeAttacks ?? []
      )
    };
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
          selectedRanks: foundry.utils.deepClone(
            row.choiceRows
          )
        };
      }

      if (
        row.id ===
        "mudancaDeModoSuperior"
      ) {
        const configuration =
          this._buildEnemySuperiorModeConfiguration(
            build
          );

        itemData.system.superiorModeChange = {
          ...(
            itemData.system
              .superiorModeChange ?? {}
          ),

          enabled: true,
          activeMode: "default",
          configuration
        };

        itemData.system.enemyBuilder = {
          ...(itemData.system.enemyBuilder ?? {}),

          superiorModeConfigured:
            configuration.complete
        };
      }

      if (
        row.id ===
          "mudancaDeModo" &&
        row.choiceRows?.length
      ) {
        const selectedForm =
          this._getSelectedForm();

        const pairs =
          row.choiceRows
            .map(
              (
                choice,
                index
              ) => {
                const stats =
                  Array.isArray(
                    choice.stats
                  )
                    ? choice.stats
                        .map(
                          (statKey) => {
                            return String(
                              statKey ?? ""
                            ).trim();
                          }
                        )
                        .filter(Boolean)
                    : [];

                if (
                  stats.length !== 2
                ) {
                  return null;
                }

                return {
                  rank: index + 1,

                  key: String(
                    choice.key ?? ""
                  ),

                  label: String(
                    choice.label ?? ""
                  ),

                  stats,

                  leftStat:
                    stats[0],

                  rightStat:
                    stats[1],

                  modeSize: String(
                    choice.modeSize ?? ""
                  ),

                  sizeDirection:
                    String(
                      choice
                        .sizeDirection ??
                      "same"
                    )
                };
              }
            )
            .filter(Boolean);

        const selectedSize = String(
          pairs.find((pair) => {
            return Boolean(
              pair.modeSize
            );
          })?.modeSize ?? ""
        );

        itemData.system.modeChange = {
          ...(
            itemData.system
              .modeChange ?? {}
          ),

          pairs,

          defaultSize: String(
            selectedForm?.size ??
            "medium"
          ),

          selectedSize,

          actionCost: 1
        };

        itemData.system.activation = {
          ...(
            itemData.system
              .activation ?? {}
          ),

          enabled: true,
          active: false,
          mode: "action",
          actionCost: 1
        };
      }

      if (
        row.id === "overclock" &&
        row.choiceRows?.[0]
      ) {
        const choice = row.choiceRows[0];

        itemData.system.overclock = {
          sourceQualityId: String(
            choice.sourceQualityId ?? ""
          ),

          sourceQualityName: String(
            choice.sourceQualityName ?? ""
          ),

          effectTag: String(
            choice.effectTag ?? ""
          ),

          effectLabel: String(
            choice.label ??
            choice.originalLabel ??
            choice.effectTag ??
            ""
          ),

          effectType: "positive",

          potencyStat: String(
            choice.potencyStat ?? ""
          ),

          duration: choice.duration,

          extraActionRequired: Boolean(
            choice.extraActionRequired
          ),

          effectDpCost: Math.max(
            0,
            Number(
              choice.effectDpCost ?? 0
            )
          )
        };

        itemData.system.enemyBuilder = {
          ...(itemData.system.enemyBuilder ?? {}),

          baseQualityDp:
            row.baseQualityDp,

          attachedChoiceDp:
            row.attachedChoiceDp
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

const tokenSizeBounds =
  getEnemyTokenSizeBounds(form);

const tokenSize = Math.min(
  tokenSizeBounds.max,
  Math.max(
    tokenSizeBounds.min,
    toTokenGridSize(
      build.tokenSize,
      getEnemyDefaultTokenSize(form)
    )
  )
);

build.tokenSize = tokenSize;

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

    const superiorMode =
      this._getEnemySuperiorModePreview(
        form,
        selectedQualityRows
      );

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

    const freeQualityOverrun =
      freeQualityCount > freeQualityLimit;

    const negativeQualityOverrun =
      negativeQualityDp > negativeQualityLimit;

    const hasBudgetOverrun =
      remainingDp < 0 ||
      freeQualityOverrun ||
      negativeQualityOverrun;

    const hasSuperiorModeConfigurationError =
      Boolean(
        superiorMode.enabled &&
        !superiorMode.configurationComplete
      );

    const canCreateEnemy =
      !hasBudgetOverrun &&
      !hasSuperiorModeConfigurationError;

    return {
      ...foundry.utils.deepClone(build),

      stageValue,
      stageBaseDp,
      baseDp,
      bonusDp,

      tokenSize,
      tokenSizeMin: tokenSizeBounds.min,
      tokenSizeMax: tokenSizeBounds.max,
      tokenSizeOptions: getEnemyTokenSizeOptions(
        form,
        tokenSize
      ),

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
      superiorMode,

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

      hasBudgetOverrun,
      hasSuperiorModeConfigurationError,
      canCreateEnemy
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

    if (
      build.hasSuperiorModeConfigurationError
    ) {
      ui.notifications.warn(text(
        "Conclua a configuração da Mudança de Modo Superior antes de criar o inimigo.",
        "Complete the Superior Mode Change configuration before creating the enemy."
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
      build.qualityDp -
      spentBaseQualities
    );

    const alignment =
      this.npcAlignment === "ally"
        ? "ally"
        : "enemy";

    const isAlly =
      alignment === "ally";

    const isEnemy =
      !isAlly;

    const enemyMetadata = {
      alignment,
      isAlly,
      isEnemy,

      autonomousEvolution:
        true,

      role:
        String(
          build.role ?? "standard"
        ),

      threat: isAlly
        ? "ally"
        : String(
            build.role ?? "standard"
          ) === "boss"
          ? "boss"
          : "standard",

      baseDpOverride: baseDp === stageBaseDp
        ? null
        : baseDp,

        bonusDpAllocated: bonusDp,

        tokenGridSize: toTokenGridSize(
          build.tokenSize,
          1
        ),

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

      superiorMode: build.superiorMode?.enabled
        ? this._buildEnemySuperiorModeConfiguration(
            build
          )
        : null,

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
        disposition: isAlly
          ? CONST.TOKEN_DISPOSITIONS.FRIENDLY
          : CONST.TOKEN_DISPOSITIONS.HOSTILE,

        width: toTokenGridSize(
          build.tokenSize,
          1
        ),

        height: toTokenGridSize(
          build.tokenSize,
          1
        ),

        texture: {
          src: form.tokenImg || form.img
        }
      },

      flags: {
        [DDA_SYSTEM_ID]: {
          digivicePortrait: form.img,

          /*
          * Impede que a escala automática sobrescreva
          * a ocupação escolhida no Enemy Creator.
          */
          tokenGridSizeOverride: toTokenGridSize(
            build.tokenSize,
            1
          ),

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

        primarySpecialCategory:
          form.category,

        isSpecialForm:
          form.isSpecialForm,

        isDigimon: true,

        /*
         * Ally e Enemy são NPCs independentes.
         * Eles não preservam o nome entre formas
         * como um parceiro persistente de Tamer.
         */
        isPersistentPartner:
          false,

        evolution: {
          autonomous:
            true,

          currentStage:
            form.stageKey,

          currentFormName:
            form.displayName,

          sourceFormName:
            form.displayName,

          portraitImg:
            form.img,

          tokenImg:
            form.tokenImg ||
            form.img
        },

        notes:
          String(build.notes ?? ""),

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

            side: isAlly
              ? "players"
              : "enemies"
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
      <span>${text("Criar Digimon NPC", "Create Digimon NPC")}</span>
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