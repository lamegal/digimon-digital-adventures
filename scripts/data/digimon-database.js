// DDA Portrait Integration — Renamon Line
import { applyDdaPortraitAndManualDigimonData } from "./dda-portrait-and-manual-digimon-data.js";

const DDA_SYSTEM_ID = "digimon-digital-adventures";
const DDA_DIGIMON_DATABASE_PATH = `systems/${DDA_SYSTEM_ID}/data/digimon/all_digimon_with_evolution_index_v6.json`;
const PLACEHOLDER_IMAGE = "icons/svg/mystery-man.svg";

const STAGE_ORDER = ["baby1", "baby2", "child", "adult", "perfect", "ultimate", "ultimatePlus"];

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
  static _byDatabaseId = null;
  static _byStageKey = null;

  static async load({ force = false } = {}) {
    if (this._actors && !force) return this._actors;

    const response = await fetch(DDA_DIGIMON_DATABASE_PATH);
    if (!response.ok) throw new Error(`DDA | Não foi possível carregar banco de Digimon: ${DDA_DIGIMON_DATABASE_PATH}`);

    const data = await response.json();
    const rawActors = Array.isArray(data) ? data : (Array.isArray(data.actors) ? data.actors : []);
    const actors = [];

    for (const actor of applyDdaPortraitAndManualDigimonData(rawActors)) {
      if (!actor || shouldSkipActor(actor)) continue;
      actors.push(applyCuration(actor));
    }

    this._actors = actors;
    this._byDatabaseId = new Map();
    this._byStageKey = new Map();

    for (const actor of actors) {
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

  static async getAll() {
    return await this.load();
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
