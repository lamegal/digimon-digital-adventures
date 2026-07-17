// DDA Portrait Integration — Renamon Line
import {
  applyDdaPortraitAndManualDigimonData,
  getDdaPortraitPath
} from "./dda-portrait-and-manual-digimon-data.js";
import { DDA } from "../config.js";

const DDA_SYSTEM_ID = "digimon-digital-adventures";
const DDA_DIGIMON_DATABASE_PATH = `systems/${DDA_SYSTEM_ID}/data/digimon/all_digimon_with_evolution_index_v6.json`;
const PLACEHOLDER_IMAGE = "icons/svg/mystery-man.svg";

const STAGE_ORDER = ["baby1", "baby2", "child", "adult", "perfect", "ultimate", "ultimatePlus"];
const SPECIAL_FORM_CATEGORY_ORDER = Object.freeze([
  "normal",
  "armor",
  "hybrid",
  "jogress",
  "burst",
  "mode",
  "antibody",
  "variant"
]);

const SPECIAL_FORM_CATEGORY_SET = new Set(
  SPECIAL_FORM_CATEGORY_ORDER
);

/*
 * O V6 não possui uma coluna exclusiva de Variant.
 * Estes são identificadores editoriais já existentes nos sourceIds.
 * Eles não substituem Armor, Burst, Mode ou X-Antibody.
 */
const VARIANT_SOURCE_ID_SEGMENTS = new Set([
  "black",
  "blue",
  "green",
  "red",
  "white",
  "orange",
  "violet",
  "gold",
  "silver",
  "2010",
  "2006",
  "anime",
  "version",
  "alter",
  "alterous",
  "awake",
  "awaken",
  "vice",
  "virtue",
  "deva",
  "virus",
  "king",
  "evolved"
]);
const IDENTITY_REDIRECTS = {
  "baby1:pabumon": "baby1:bubbmon",
  "baby1:chibomon": "baby1:chicomon",
  "baby2:yokomon": "baby2:pyocomon"
};

const SKIP_DUPLICATE_IDENTITIES = new Set(Object.keys(IDENTITY_REDIRECTS));

const STAGE_OVERRIDES = {
  demimeramon: "baby2",
  petimeramon: "baby2",
  yokomon: "baby2",
  tokomon: "baby2",
  kekkomon: "baby2",
  torikaraballmon: "baby2",
  torikara_ballmon: "baby2",
  torikaballmon: "baby2",
  bommon2010: "baby1",
  bommon_2010: "baby1",
  kekomon: "baby1",
  puttimon: "baby1",
  puyomon: "baby1",
  yolkmon: "baby1",
  poyomon: "baby1",
  bubbmon: "baby1",
  pabumon: "baby1",
  chicomon: "baby1",
  chibomon: "baby1"
};

const NAME_DATA_OVERRIDES = {
  bubbmon: {
    original: "Bubbmon",
    dub: "Pabumon",
    aliases: ["Bubbmon", "Pabumon"]
  },
  chicomon: {
    original: "Chicomon",
    dub: "Chibomon",
    aliases: ["Chicomon", "Chibomon"]
  },
  demimeramon: {
    original: "PetiMeramon",
    dub: "DemiMeramon",
    aliases: ["PetiMeramon", "DemiMeramon", "Demi Meramon"]
  },
  pyocomon: {
    original: "Pyocomon",
    dub: "Yokomon",
    aliases: ["Pyocomon", "Yokomon"]
  },
  torikara_ballmon: {
    original: "TorikaraBallmon",
    dub: "TorikaraBallmon",
    aliases: ["TorikaraBallmon", "Torikaballmon", "Torikara Ballmon"]
  },
  torikaraballmon: {
    original: "TorikaraBallmon",
    dub: "TorikaraBallmon",
    aliases: ["TorikaraBallmon", "Torikaballmon", "Torikara Ballmon"]
  }
};

const IMAGE_FILE_OVERRIDES = {
  "baby1:poyomon": "Poyomon.webp",
  "baby2:tokomon": "Tokomon.webp",
  "baby1:argomon": "Argomon.webp",
  "baby2:argomon": "Argomon.webp",
  "child:argomon": "Argomon.webp",
  "adult:argomon": "Argomon.webp",
  "perfect:argomon": "Argomon.webp",
  "ultimate:argomon": "Argomon.webp",
  "baby1:algomon": "Argomon.webp",
  "baby2:algomon": "Argomon.webp",
  "child:algomon": "Argomon.webp",
  "adult:algomon": "Argomon.webp",
  "perfect:algomon": "Argomon.webp",
  "ultimate:algomon": "Argomon.webp",
  "baby1:bubbmon": "Pabumon.webp",
  "baby1:pabumon": "Pabumon.webp",
  "baby1:chicomon": "Chibomon.webp",
  "baby1:chibomon": "Chibomon.webp",
  "baby2:demimeramon": "DemiMeramon.webp",
  "baby2:petimeramon": "DemiMeramon.webp",
  "baby2:pyocomon": "Yokomon.webp",
  "baby2:yokomon": "Yokomon.webp",
  "baby1:kekomon": "Kekomon.webp",
  "baby2:kekkomon": "Kekkomon.webp",
  "baby1:bommon": "Bommon.webp",
  "baby1:bommon2010": "Bommon2010AnimeVersion.webp",
  "baby1:bommon_2010": "Bommon2010AnimeVersion.webp",
  "baby1:puttimon": "Puttimon.webp",
  "baby1:puyomon": "Puyomon.webp",
  "baby1:yolkmon": "Yolkmon.webp",
  "baby2:torikara_ballmon": "TorikaraBallmon.webp",
  "baby2:torikaraballmon": "TorikaraBallmon.webp",
  "baby2:torikaballmon": "TorikaraBallmon.webp"
};

function normalizeKey(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/x[-_\s]*antibody/g, "xantibody")
    .replace(/baby\s*i{1,2}/g, (match) => match.includes("ii") ? "babyii" : "babyi")
    .replace(/2010\s*anime\s*version/g, "2010")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function canonicalNameKey(actor = {}) {
  const system = actor.system ?? {};
  const names = system.names ?? {};
  return normalizeKey(system.sourceId || names.canonical || system.species || actor.name || actor._id || "");
}

function stageIdentity(stage = "", key = "") {
  return `${stage}:${normalizeKey(key)}`;
}

function getLocalImagePath(stage = "", key = "", actor = {}) {
  const candidates = [
    stageIdentity(stage, key),
    stageIdentity(stage, actor.system?.sourceId),
    stageIdentity(stage, actor.system?.species),
    stageIdentity(stage, actor.system?.names?.original),
    stageIdentity(stage, actor.system?.names?.dub),
    stageIdentity(stage, actor.name),
    ...(Array.isArray(actor.system?.names?.aliases) ? actor.system.names.aliases.map((alias) => stageIdentity(stage, alias)) : [])
  ].filter(Boolean);

  for (const candidate of candidates) {
    const fileName = IMAGE_FILE_OVERRIDES[candidate];
    if (fileName) return `systems/${DDA_SYSTEM_ID}/assets/digimon/${stage}/${fileName}`;
  }

  const cleanName = String(actor.name || actor.system?.species || key || "").replace(/[^a-zA-Z0-9]+/g, "");
  return cleanName ? `systems/${DDA_SYSTEM_ID}/assets/digimon/${stage}/${cleanName}.webp` : "";
}

function hasSuspiciousRemoteImage(path = "") {
  const clean = String(path ?? "").trim();
  if (!clean) return true;
  if (clean === PLACEHOLDER_IMAGE) return true;
  return /^https?:\/\//i.test(clean);
}

function cloneActor(actor = {}) {
  return foundry?.utils?.deepClone ? foundry.utils.deepClone(actor) : JSON.parse(JSON.stringify(actor));
}

function applyCuration(actor = {}) {
  const next = cloneActor(actor);
  const system = next.system ?? {};
  next.system = system;
  system.names = system.names ?? {};

  let key = canonicalNameKey(next);
  let stage = String(system.stage || "").trim();
  const stageOverride = STAGE_OVERRIDES[key];
  if (stageOverride) stage = stageOverride;
  system.stage = stage;

  const isAlgomonFamily = [key, normalizeKey(system.species), normalizeKey(next.name), ...(system.names.aliases ?? []).map(normalizeKey)]
    .some((entry) => entry === "algomon" || entry === "argomon" || entry.startsWith("algomon") || entry.startsWith("argomon"));

  if (isAlgomonFamily && stage) {
    system.names.aliases = Array.from(new Set([...(system.names.aliases ?? []), "Algomon", "Argomon"]));
  }

  const isKaiserGreymon = [
  key,
  normalizeKey(system.sourceId),
  normalizeKey(system.species),
  normalizeKey(next.name),
  normalizeKey(system.names.original),
  normalizeKey(system.names.dub),
  ...(Array.isArray(system.names.aliases) ? system.names.aliases.map(normalizeKey) : [])
].some((entry) => entry === "kaisergreymon" || entry === "emperorgreymon");

if (isKaiserGreymon) {
  stage = "ultimate";
  system.stage = "ultimate";
  system.evolutionCategory = "hybrid";
  system.isSpecialForm = true;
  system.folderPath = "hybrid/ultimate";

  system.names.original = "Kaiser Greymon";
  system.names.dub = "EmperorGreymon";
  system.names.aliases = Array.from(new Set([
    ...(system.names.aliases ?? []),
    "Kaiser Greymon",
    "KaiserGreymon",
    "EmperorGreymon",
    "Emperor Greymon"
  ]));

  if (!system.species || normalizeKey(system.species) === "kaisergreymon" || normalizeKey(system.species) === "emperorgreymon") {
    system.species = "Kaiser Greymon";
  }

  const hybridImage = `systems/${DDA_SYSTEM_ID}/assets/digimon/hybrid/EmperorGreymon.webp`;

  if (hasSuspiciousRemoteImage(next.img) || /\/adult\/KaiserGreymon\.webp$/i.test(String(next.img ?? ""))) {
    next.img = hybridImage;
  }

  next.prototypeToken = next.prototypeToken ?? {};
  next.prototypeToken.texture = next.prototypeToken.texture ?? {};

  if (hasSuspiciousRemoteImage(next.prototypeToken.texture.src) || /\/adult\/KaiserGreymon\.webp$/i.test(String(next.prototypeToken.texture.src ?? ""))) {
    next.prototypeToken.texture.src = hybridImage;
  }
}

  const nameOverride = NAME_DATA_OVERRIDES[key];
  if (nameOverride) {
    system.names.original = nameOverride.original;
    system.names.dub = nameOverride.dub;
    system.names.aliases = Array.from(new Set([...(system.names.aliases ?? []), ...nameOverride.aliases]));
    system.species = nameOverride.original;
  }

  if (key === "torikara_ballmon" || key === "torikaraballmon") {
    next.name = "TorikaraBallmon";
    system.species = "TorikaraBallmon";
    key = "torikaraballmon";
  }

  const localImage = getLocalImagePath(stage, key, next);
  if (localImage && hasSuspiciousRemoteImage(next.img)) next.img = localImage;
  if (localImage && hasSuspiciousRemoteImage(next.prototypeToken?.texture?.src)) {
    next.prototypeToken = next.prototypeToken ?? {};
    next.prototypeToken.texture = next.prototypeToken.texture ?? {};
    next.prototypeToken.texture.src = localImage;
  }

  const sourceId = system.sourceId || key || normalizeKey(system.species || next.name);
  system.sourceId = sourceId;
  const identityKey = stageIdentity(stage, sourceId || key || system.species || next.name);
  next.databaseId = identityKey;
  system.databaseId = identityKey;

  return next;
}

function shouldSkipActor(actor = {}) {
  const system = actor.system ?? {};
  const key = canonicalNameKey(actor);
  const stage = STAGE_OVERRIDES[key] || system.stage || "";
  return SKIP_DUPLICATE_IDENTITIES.has(stageIdentity(stage, key));
}

function collectKeys(actor = {}) {
  const system = actor.system ?? {};
  const names = system.names ?? {};
  const values = [
    actor.databaseId,
    system.databaseId,
    system.sourceId,
    names.canonical,
    names.original,
    names.dub,
    system.species,
    actor.name,
    ...(Array.isArray(names.aliases) ? names.aliases : [])
  ];

  return values.map(normalizeKey).filter(Boolean);
}

function uniqueStrings(values = []) {
  return Array.from(new Set(
    values
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
  ));
}

function getBaseEvolutionCategory(system = {}) {
  const category = String(
    system.evolutionCategory ?? "normal"
  ).trim();

  return SPECIAL_FORM_CATEGORY_SET.has(category)
    ? category
    : "normal";
}

function getFolderSpecialCategory(system = {}) {
  const folderPath = String(system.folderPath ?? "")
    .trim()
    .toLowerCase();

  const [folderCategory] = folderPath.split("/");

  return SPECIAL_FORM_CATEGORY_SET.has(folderCategory)
    ? folderCategory
    : "";
}

function getActorIdentityKeys(actor = {}) {
  return new Set(collectKeys(actor));
}

function buildJogressResultKeySet(jogressRules = []) {
  const resultKeys = new Set();

  for (const rule of jogressRules) {
    if (rule?.parseStatus !== "parsed") continue;

    const resultKey = normalizeKey(rule?.resultId);

    if (resultKey) {
      resultKeys.add(resultKey);
    }
  }

  return resultKeys;
}

function hasJogressResultIdentity(actor = {}, jogressResultKeys = new Set()) {
  if (!jogressResultKeys.size) return false;

  for (const key of getActorIdentityKeys(actor)) {
    if (jogressResultKeys.has(key)) return true;
  }

  return false;
}

function isRegisteredVariant(actor = {}) {
  const system = actor.system ?? {};

  if (getBaseEvolutionCategory(system) !== "normal") {
    return false;
  }

  const sourceId = String(system.sourceId ?? "").trim();
  const segments = sourceId
    .split("_")
    .map((segment) => normalizeKey(segment))
    .filter(Boolean);

  return segments.some((segment) => {
    return VARIANT_SOURCE_ID_SEGMENTS.has(segment);
  });
}

function orderSpecialCategories(categories = []) {
  const set = new Set(
    categories.filter((category) => {
      return SPECIAL_FORM_CATEGORY_SET.has(category);
    })
  );

  return SPECIAL_FORM_CATEGORY_ORDER.filter((category) => {
    return set.has(category);
  });
}

function applySpecialFormCategories(
  actor = {},
  { jogressResultKeys = new Set() } = {}
) {
  const system = actor.system ?? {};
  actor.system = system;

  const categories = new Set();
  const baseCategory = getBaseEvolutionCategory(system);
  const folderCategory = getFolderSpecialCategory(system);

  categories.add(baseCategory);

  if (folderCategory) {
    categories.add(folderCategory);
  }

  if (hasJogressResultIdentity(actor, jogressResultKeys)) {
    categories.add("jogress");
  }

  if (isRegisteredVariant(actor)) {
    categories.add("variant");
  }

  system.specialCategories = orderSpecialCategories(
    Array.from(categories)
  );

  system.primarySpecialCategory = (
    system.specialCategories.find((category) => category !== "normal")
    ?? baseCategory
  );

  return actor;
}

function makeEmptyEvolutionIndex() {
  return {
    normalFrom: [],
    normalTo: [],
    candidateFrom: [],
    candidateTo: [],
    specialFrom: [],
    specialTo: [],
    candidateSpecialFrom: [],
    candidateSpecialTo: [],
    unresolvedFrom: [],
    unresolvedTo: [],
    rawFrom: [],
    rawTo: [],
    reviewRequired: false
  };
}

function makeVirtualHybridActor(recipe = {}) {
  if (recipe?.method !== "hybrid") return null;

  const result = recipe.result ?? {};
  const displayName = String(
    result.name ?? result.species ?? ""
  ).trim();

  if (!displayName) return null;

  const sourceId = normalizeKey(
    result.species ?? result.name
  );

  if (!sourceId) return null;

  const stage = STAGE_ORDER.includes(recipe.equivalentStage)
    ? recipe.equivalentStage
    : "child";

  const aliases = uniqueStrings([
    displayName,
    result.species,
    ...(Array.isArray(result.aliases) ? result.aliases : [])
  ]);

  const portraitPath = getDdaPortraitPath({
    key: sourceId,
    name: displayName,
    species: displayName,
    aliases
  });

  const databaseId = stageIdentity(stage, sourceId);

  return {
    name: displayName,
    type: "digimon",
    img: portraitPath || PLACEHOLDER_IMAGE,

    prototypeToken: {
      texture: {
        src: portraitPath || PLACEHOLDER_IMAGE
      }
    },

    system: {
      sourceId,
      databaseId,
      species: displayName,
      isPersistentPartner: false,
      nickname: "",

      stage,
      sourceStageKey: stage,

      attribute: "none",
      type: "",
      group: "",
      groups: [],
      field: "none",
      fieldId: "",
      family: "",
      digimental: "",

      names: {
        canonical: sourceId,
        original: displayName,
        dub: displayName,
        aliases
      },

      evolutionCategory: "hybrid",
      primarySpecialCategory: "hybrid",
      specialCategories: ["hybrid"],
      isSpecialForm: true,
      folderPath: `hybrid/${stage}`,

      images: {
        portrait: portraitPath || "",
        token: "",
        source: "config:hybrid-recipes",
        imageFileName: "",
        localImagePath: "",
        officialImageUrl: "",
        portraitImagePath: portraitPath || "",
        tokenImagePath: ""
      },

      officialReference: {
        directoryName: sourceId,
        url: "",
        displayName,
        level: "",
        type: "",
        attribute: "",
        imageUrl: "",
        imageLocalPath: "",
        related: []
      },

      wikimon: {
        title: displayName,
        url: "",
        evolvesFrom: [],
        evolvesTo: [],
        level: "",
        type: "",
        attribute: "",
        field: "",
        group: []
      },

      evolutionHints: {
        evolvesFrom: [],
        evolvesTo: []
      },

      evolutionIndex: makeEmptyEvolutionIndex(),

      specialForm: {
        virtual: true,
        source: "config.hybridRecipes",
        method: "hybrid",
        recipeId: String(recipe.id ?? "")
      },

      curation: {
        sourceSheet: "Config Hybrid Recipes",
        sourceRow: 0,
        curationStatus: "virtual",
        confidence: 100,
        relationSource: "DDA config",
        notes: "Virtual Hybrid Actor for special-form browsers. Profile fields await a dedicated actor source."
      }
    },

    databaseId
  };
}

function createVirtualHybridActors(existingActors = []) {
  const existingIdentityKeysByStage = new Map();

  const getStageKeySet = (stage = "") => {
    const key = String(stage ?? "").trim();

    if (!existingIdentityKeysByStage.has(key)) {
      existingIdentityKeysByStage.set(key, new Set());
    }

    return existingIdentityKeysByStage.get(key);
  };

  for (const actor of existingActors) {
    const stageKeySet = getStageKeySet(actor?.system?.stage);

    for (const key of getActorIdentityKeys(actor)) {
      stageKeySet.add(key);
    }
  }

  const virtualActors = [];

  for (const recipe of DDA.hybridRecipes ?? []) {
    const actor = makeVirtualHybridActor(recipe);

    if (!actor) continue;

    const stageKeySet = getStageKeySet(actor.system?.stage);
    const identityKeys = getActorIdentityKeys(actor);

    if ([...identityKeys].some((key) => stageKeySet.has(key))) {
      continue;
    }

    virtualActors.push(actor);

    for (const key of identityKeys) {
      stageKeySet.add(key);
    }
  }

  return virtualActors;
}

export function isHybridRulesEnabled() {
  try {
    return Boolean(game.settings.get(DDA_SYSTEM_ID, "enableHybridEvolution"));
  } catch (_error) {
    return false;
  }
}

export function getEffectiveEvolutionCategory(actorData = {}) {
  const category = String(actorData?.system?.evolutionCategory ?? "normal").trim() || "normal";

  if (category === "hybrid" && !isHybridRulesEnabled()) {
    return "normal";
  }

  return category;
}

export function getEffectiveIsSpecialForm(actorData = {}) {
  const category = String(actorData?.system?.evolutionCategory ?? "normal").trim();

  if (category === "hybrid" && !isHybridRulesEnabled()) {
    return false;
  }

  return Boolean(actorData?.system?.isSpecialForm);
}

export function getEffectiveDigimonEvolutionData(actorData = {}) {
  return {
    evolutionCategory: getEffectiveEvolutionCategory(actorData),
    isSpecialForm: getEffectiveIsSpecialForm(actorData)
  };
}

export class DDADigimonDatabase {
  static _actors = null;
  static _virtualSpecialActors = null;
  static _byDatabaseId = null;
  static _byStageKey = null;

  static async load({ force = false } = {}) {
    if (this._actors && !force) return this._actors;

    const response = await fetch(DDA_DIGIMON_DATABASE_PATH);
    if (!response.ok) throw new Error(`DDA | Não foi possível carregar banco de Digimon: ${DDA_DIGIMON_DATABASE_PATH}`);

    const data = await response.json();

    const rawActors = Array.isArray(data)
      ? data
      : (Array.isArray(data.actors) ? data.actors : []);

    const jogressResultKeys = buildJogressResultKeySet(
      Array.isArray(data?.jogressRules)
        ? data.jogressRules
        : []
    );

    const actors = [];

    for (const actor of applyDdaPortraitAndManualDigimonData(rawActors)) {
      if (!actor || shouldSkipActor(actor)) continue;

      actors.push(applySpecialFormCategories(
        applyCuration(actor),
        { jogressResultKeys }
      ));
    }

    this._virtualSpecialActors = createVirtualHybridActors(actors);
    this._actors = actors;

    this._actors = actors;
    this._byDatabaseId = new Map();
    this._byStageKey = new Map();

    const indexedActors = [
      ...actors,
      ...(this._virtualSpecialActors ?? [])
    ];

    for (const actor of indexedActors) {
      const system = actor.system ?? {};
      const stage = system.stage || "";
      const databaseId = actor.databaseId || system.databaseId;
      if (databaseId) this._byDatabaseId.set(databaseId, actor);

      for (const key of collectKeys(actor)) {
        this._byStageKey.set(stageIdentity(stage, key), actor);
      }

      const redirected = IDENTITY_REDIRECTS[databaseId];
      if (redirected && this._byDatabaseId.has(redirected)) this._byDatabaseId.set(databaseId, this._byDatabaseId.get(redirected));
    }

    return this._actors;
  }

  static async getAll({ includeVirtualSpecialForms = false } = {}) {
    await this.load();

    if (!includeVirtualSpecialForms) {
      return this._actors;
    }

    return [
      ...this._actors,
      ...(this._virtualSpecialActors ?? [])
    ];
  }

  static async getActorData(databaseId = "") {
    await this.load();
    return this._byDatabaseId.get(String(databaseId ?? "")) ?? null;
  }

  static async getByStageAndName(stage = "", name = "") {
    await this.load();
    const direct = this._byStageKey.get(stageIdentity(stage, name));
    if (direct) return direct;

    const redirected = IDENTITY_REDIRECTS[stageIdentity(stage, name)];
    return redirected ? this._byDatabaseId.get(redirected) ?? null : null;
  }

  static async getByReference(reference = {}, fallbackStage = "") {
    const stage = reference?.stage || fallbackStage || "";
    const candidates = [
      reference?.databaseId,
      reference?.key,
      reference?.sourceId,
      reference?.sourceName,
      reference?.species,
      reference?.name
    ].filter(Boolean);

    for (const candidate of candidates) {
      const byId = await this.getActorData(String(candidate));
      if (byId) return byId;
      const byName = await this.getByStageAndName(stage, candidate);
      if (byName) return byName;
    }

    return null;
  }

  static async findForActor(actor = null) {
    if (!actor) return null;
    const system = actor.system ?? {};
    const stage = system.stage || "";
    const candidates = [
      system.database?.databaseId,
      system.databaseId,
      system.sourceId,
      system.species,
      system.names?.canonical,
      system.names?.original,
      system.names?.dub,
      actor.name,
      ...(Array.isArray(system.names?.aliases) ? system.names.aliases : [])
    ].filter(Boolean);

    for (const candidate of candidates) {
      const found = await this.getByStageAndName(stage, candidate);
      if (found) return found;
    }

    return null;
  }

  static get path() {
    return DDA_DIGIMON_DATABASE_PATH;
  }

  static get stageOrder() {
    return STAGE_ORDER;
  }
}
