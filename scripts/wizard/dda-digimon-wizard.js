import { DDA_DIGIMON_QUALITIES } from "../data/digimon-qualities.js";
import {
  DDA_DIGIMON_BUILD_TEMPLATES,
  DDA_DIGIMON_BUILD_TEMPLATE_INDEX
} from "../data/digimon-build-templates.js";
import {
  getCurrentPartnerFormWizardContext,
  getFuturePartnerFormWizardContext,
  savePartnerFormWizardSnapshot,
  savePartnerFutureFormSnapshot
} from "../combat/evolution.js";
import { ensureActorOwner, syncTamerAndPartnerOwnership } from "../utils/ownership.js";
import {
  DDA_INITIAL_DIGIMON_INDEX,
  DDA_INITIAL_EVOLUTION_RELATIONS,
  getBaby2OptionsForBaby1,
  getRookieOptionsForBaby2,
  getInitialDigimonById
} from "../data/dda-initial-evolution-db.js";
import {
  getDigimonStageLabel as getConfiguredDigimonStageLabel
} from "../helpers/digimon-stage-labels.js";
import { DDADigimonDatabase } from "../data/digimon-database.js";
import {
  getDdaPortraitPath,
  getDdaTokenPath
} from "../data/dda-portrait-and-manual-digimon-data.js";

function isEnglishLanguage() {
  const language = String(game?.i18n?.lang ?? game?.i18n?.language ?? "");
  return language.toLowerCase().startsWith("en");
}

function text(pt, en) {
  return isEnglishLanguage() ? en : pt;
}

function getDdaFilePickerClass() {
  return globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? null;
}


const DDA_SYSTEM_ID = "digimon-digital-adventures";

const DDA_WIZARD_STAGE_ORDER = [
  "baby1",
  "baby2",
  "child",
  "adult",
  "perfect",
  "ultimate",
  "ultimatePlus"
];

const DDA_WIZARD_STARTING_STAGE_KEYS = [
  "baby1",
  "baby2",
  "child",
  "adult",
  "perfect",
  "ultimate"
];

const DDA_NORMAL_PARTNER_LINE_STAGES = [
  "baby1",
  "baby2",
  "child",
  "adult",
  "perfect",
  "ultimate"
];

function getWorldSetting(key, fallback = false) {
  try {
    return game.settings.get(DDA_SYSTEM_ID, key) ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

function slugifyDigitamaName(name = "") {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .trim();
}

function digitamaPath(fileName = "") {
  const safe = String(fileName ?? "").replace(/ /g, "%20");
  return `systems/digimon-digital-adventures/assets/digitamas/Digitama_${safe}.webp`;
}

function digimonBabyPath(fileName = "") {
  const safe = String(fileName ?? "").replace(/ /g, "%20");
  return `systems/digimon-digital-adventures/assets/digimon/baby1/${safe}.webp`;
}

const DDA_DIGIMON_IMAGE_BASE_PATH = "systems/digimon-digital-adventures/assets/digimon";

const DDA_INITIAL_IMAGE_STAGE_FOLDERS = {
  baby1: "baby1",
  baby2: "baby2",
  child: "child",
  adult: "adult",
  perfect: "perfect",
  ultimate: "ultimate"
};

// Pequenos ajustes para casos em que a database usa um nome,
// mas o arquivo está salvo com outra grafia comum.
const DDA_INITIAL_IMAGE_FILENAME_ALIASES = {
  baby1: {
    choromon: ["Choromon"],
    pipimon: ["Pipimon"]
  },

  baby2: {
    flufflymon: ["Fluffymon"],
    hyarimon: ["Hiyarimon"]
  },

  child: {
    bakumon: ["Bakomon"],
    blucomon: ["Bulucomon"],
    dracumon: ["Dracmon"],
    goburimon: ["Goblimon"],
    hackmon: ["Huckmon"],
    shakomon: ["Syakomon"],
    snow_goburimon: ["SnowGoblimon"],
    sunarizarmon: ["Sunarizamon"],
    takimon: ["Takinmon"],
    tukaimon: ["Tsukaimon"]
  }
};

const DDA_INITIAL_STATIC_PORTRAIT_FILE_OVERRIDES = {
  algomon_baby1: "Argomon_Baby1.webp",
  algomon_baby2: "Argomon_Baby2.webp",
  algomon_child: "Argomon_Child.webp",
  algomon_adult: "Argomon_Adult.webp",
  algomon_perfect: "Argomon_perfect.webp",
  algomon_ultimate: "Argomon_mega.webp",

  burgamon_child: "Burgamon_child.webp",
  burgamon_adult: "Burgamon_adult.webp"

};

const DDA_GENERAL_DATABASE_STATIC_PORTRAIT_FILE_OVERRIDES = {
  "adult:algomon_adult": "Argomon_Adult.webp",
  "perfect:algomon_perfect": "Argomon_perfect.webp",
  "ultimate:algomon_ultimate": "Argomon-mega.webp",

  "baby2:arkadimon_baby": "arkadimon-baby-ii.webp",
  "child:arkadimon_child": "Arkadimon-Child.webp",
  "adult:arkadimon_adult": "Arkadimon_Adult.jpg",
  "perfect:arkadimon_perfect": "Arkadimon_Perfect.jpg",
  "ultimate:arkadimon_ultimate": "Arkadimon_Ultimate.jpg",

  "child:burgamon_child": "Burgamon_child.webp",
  "adult:burgamon_adult": "Burgamon_adult.webp",

  "adult:eosmon_adult": "Eosmon.webp",
  "perfect:eosmon_perfect": "Eosmon_perfect.webp",
  "ultimate:eosmon_ultimate": "Eosmon-ultimate.webp",

  "adult:red_v_dramon": "Red_V_Dramon.webp",
  "adult:sorcerimon": "Sorcermon.webp",

  // Você acabou de colocar este portrait na pasta.
  "adult:yo_yo_mon": "YoYomon.webp"
};

function getInitialEvolutionImageStageFolder(stageKey = "") {
  const cleanStage = String(stageKey ?? "").trim();
  return DDA_INITIAL_IMAGE_STAGE_FOLDERS[cleanStage] || cleanStage || "child";
}

function buildInitialEvolutionImagePath(stageKey = "", fileName = "") {
  const folder = getInitialEvolutionImageStageFolder(stageKey);
  const cleanFileName = slugifyDigitamaName(
    String(fileName ?? "")
      .replace(/\.(webp|png|jpg|jpeg|gif)$/i, "")
  );

  if (!folder || !cleanFileName) return "";

  return `${DDA_DIGIMON_IMAGE_BASE_PATH}/${folder}/${cleanFileName}.webp`;
}

function getInitialEvolutionStaticPortraitPath(entry = null) {
  if (!entry) return "";

  const overrideFileName =
    DDA_INITIAL_STATIC_PORTRAIT_FILE_OVERRIDES?.[entry.id];

  if (overrideFileName) {
    return `${DDA_DIGIMON_IMAGE_BASE_PATH}/portraits/${overrideFileName}`;
  }

  // A database guarda o nome correto do arquivo em resolvedPath,
  // mas com a antiga pasta de estágio. Aqui reaproveitamos somente
  // o nome do arquivo e apontamos para a pasta real de portraits.
  const resolvedPath = String(entry.images?.resolvedPath ?? "").trim();
  const fileName = resolvedPath.split("/").pop();

  if (!fileName || fileName === "mystery-man.svg") return "";

  return `${DDA_DIGIMON_IMAGE_BASE_PATH}/portraits/${fileName}`;
}

function getInitialEvolutionImageNameCandidates(entry = null) {
  if (!entry) return [];

  const stageKey = String(entry.stageKey ?? "").trim();
  const aliases = DDA_INITIAL_IMAGE_FILENAME_ALIASES?.[stageKey]?.[entry.id] ?? [];

  return Array.from(new Set([
    ...(Array.isArray(aliases) ? aliases : []),
    entry.images?.imageFileName,
    entry.displayName,
    entry.dub,
    entry.original,
    ...(Array.isArray(entry.aliases) ? entry.aliases : []),
    entry.id
  ].filter(Boolean)));
}

function getInitialEvolutionEntryImageFallbacks(
  entry = null,
  fallback = "icons/svg/mystery-man.svg"
) {
  if (!entry) return [fallback || "icons/svg/mystery-man.svg"];

  const displayName = String(
    entry.displayName || entry.dub || entry.original || entry.id || ""
  ).trim();

  const indexedPortraitPath = getDdaPortraitPath({
    key: entry.id,
    name: displayName,
    species: displayName,
    aliases: [
      entry.original,
      entry.dub,
      ...(Array.isArray(entry.aliases) ? entry.aliases : [])
    ].filter(Boolean)
  });

  // O wizard aceita só imagens estáticas. WebM fica reservado para a ficha.
  const staticPaths = [
    getInitialEvolutionStaticPortraitPath(entry),

    /\.webp(?:$|[?#])/i.test(indexedPortraitPath)
      ? indexedPortraitPath
      : "",

    entry.images?.portraitImagePath,
    entry.images?.tokenImagePath,
    entry.images?.localImagePath,
    entry.images?.officialImageUrl,
    entry.image,
    entry.img
  ]
    .map((path) => String(path ?? "").trim())
    .filter((path) => path && !/\.webm(?:$|[?#])/i.test(path));

  return Array.from(new Set([
    ...staticPaths,
    fallback || "icons/svg/mystery-man.svg"
  ]));
}

function getInitialEvolutionEntryImageFallbackString(entry = null, fallback = "icons/svg/mystery-man.svg") {
  return getInitialEvolutionEntryImageFallbacks(entry, fallback).slice(1).join("|");
}

/**
 * O wizard sempre trabalha com imagens estáticas em `img`.
 * Já o retrato do Actor pode usar o WebM aprovado no índice de portraits.
 * `portraitImg` só é preenchido quando o jogador escolhe uma substituição manual.
 */
function resolveWizardActorPortrait({
  portraitOverride = "",
  key = "",
  name = "",
  species = "",
  aliases = [],
  fallback = "icons/svg/mystery-man.svg"
} = {}) {
  const explicitPortrait = String(portraitOverride ?? "").trim();
  if (explicitPortrait) return explicitPortrait;

  return getDdaPortraitPath({
    key: String(key ?? "").trim(),
    name: String(name ?? "").trim(),
    species: String(species ?? "").trim(),
    aliases: Array.isArray(aliases) ? aliases.filter(Boolean) : []
  }) || fallback;
}

function resolveLineFormActorPortrait(form = null, fallback = "icons/svg/mystery-man.svg") {
  const stageKey = String(form?.stageKey ?? "").trim();

  const entry = form?.id
    ? getInitialDigimonById(form.id)
    : findInitialEvolutionEntry(form?.species, stageKey);

  const displayName = String(
    form?.species || getInitialEvolutionDisplayName(entry) || ""
  ).trim();

  return resolveWizardActorPortrait({
    portraitOverride: form?.portraitImg,
    key: form?.id || entry?.id || "",
    name: displayName,
    species: displayName,
    aliases: [
      form?.originalName,
      entry?.original,
      entry?.dub,
      entry?.displayName,
      ...(Array.isArray(entry?.aliases) ? entry.aliases : [])
    ].filter(Boolean),
    fallback
  });
}

const DDA_PIXEL_ART_BASE_PATH = "systems/digimon-digital-adventures/assets/PixelArt";

const DDA_BABY1_PIXEL_ART_MAP = {
  Bommon: "bom",
  Botamon: "bota",
  Chibickmon: "chibi",
  Choromon: "choro",
  Curimon: "curi",
  Dodomon: "dodo",
  Dokimon: "doki",
  Fufumon: "fufu",
  Fusamon: "fusa",
  Jyarimon: "jyari",
  Ketomon: "keto",
  Leafmon: "leaf",
  Mokumon: "moku",
  Nyokimon: "nyoki",
  Petitmon: "petit",
  Popomon: "popo",
  Punimon: "puni",
  Pururumon: "pururu",
  Puyomon: "puyo",
  Pyonmon: "pyon",
  Relemon: "rele",
  Sakumon: "saku",
  Tsubumon: "tsubu",
  YukimiBotamon: "yukimibota",
  Yuramon: "yura",
  Zerimon: "zeri",
  Zurumon: "zuru"
};

function getDigimonPixelArtPath(species = "", stage = "") {
  const normalizedStage = String(stage ?? "").trim().toLowerCase();
  if (normalizedStage !== "baby1") return "";

  const speciesKey = String(species ?? "").trim();
  const fileKey = DDA_BABY1_PIXEL_ART_MAP[speciesKey];

  if (!fileKey) return "";
  return `${DDA_PIXEL_ART_BASE_PATH}/${fileKey}.webp`;
}


function normalizeDigimonLookupName(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+Nv\.\s*[IVX]+$/i, "")
    .replace(/\s+Lv\.\s*[IVX]+$/i, "")
    .replace(/\s+Nv\.\s*\d+$/i, "")
    .replace(/\s+Lv\.\s*\d+$/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase()
    .trim();
}

function normalizeInitialEvolutionId(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/x[-_\s]*antibody/g, "x_antibody")
    .replace(/\+/g, " plus ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
}

function getInitialEvolutionStageLabel(stageKey = "") {
  return getConfiguredDigimonStageLabel(stageKey, {
    fallback: String(stageKey || "")
  });
}

function getInitialEvolutionDisplayName(entry = null) {
  if (!entry) return "";
  return String(entry.displayName || entry.dub || entry.original || entry.id || "");
}

function getInitialEvolutionOriginalName(entry = null) {
  if (!entry) return "";
  return String(entry.original || entry.displayName || entry.dub || entry.id || "");
}

function getInitialEvolutionLookupCandidates(value = "") {
  const raw = String(value ?? "").trim();
  const compact = normalizeDigimonLookupName(raw);
  const id = normalizeInitialEvolutionId(raw);

  return Array.from(new Set([raw, compact, id].filter(Boolean)));
}

function findInitialEvolutionEntry(value = "", stageKey = "") {
  const candidates = getInitialEvolutionLookupCandidates(value);
  if (!candidates.length) return null;

  for (const candidate of candidates) {
    const byId = DDA_INITIAL_DIGIMON_INDEX?.[candidate];
    if (byId && (!stageKey || byId.stageKey === stageKey)) return byId;
  }

  const wanted = new Set(candidates.map((entry) => normalizeDigimonLookupName(entry)).filter(Boolean));

  return Object.values(DDA_INITIAL_DIGIMON_INDEX ?? {}).find((entry) => {
    if (!entry) return false;
    if (stageKey && entry.stageKey !== stageKey) return false;

    const entryKeys = [
      entry.id,
      entry.original,
      entry.dub,
      entry.displayName,
      ...(Array.isArray(entry.aliases) ? entry.aliases : [])
    ].map((candidate) => normalizeDigimonLookupName(candidate));

    return entryKeys.some((key) => wanted.has(key));
  }) ?? null;
}

function getInitialEvolutionEntryImage(entry = null, fallback = "icons/svg/mystery-man.svg") {
  return getInitialEvolutionEntryImageFallbacks(entry, fallback)[0] || fallback || "icons/svg/mystery-man.svg";
}

function getLocalizedValue(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value || fallback;
  if (typeof value === "object") {
    const langKey = isEnglishLanguage() ? "en" : "pt";
    return value[langKey] ?? value.pt ?? value.en ?? value.label ?? value.name ?? value.value ?? fallback;
  }
  return String(value ?? fallback);
}

function getOptionKeyFromLabel(optionsObject = {}, value = "") {
  const normalizedValue = normalizeDigimonLookupName(getLocalizedValue(value));
  if (!normalizedValue) return "";

  if (optionsObject[normalizedValue]) return normalizedValue;

  for (const [key, label] of Object.entries(optionsObject ?? {})) {
    if (normalizeDigimonLookupName(key) === normalizedValue) return key;
    if (normalizeDigimonLookupName(getLocalizedValue(label)) === normalizedValue) return key;
  }

  return "";
}

function sanitizeCompendiumGroup(group = "", typeLabel = "") {
  const cleanGroup = String(group ?? "").trim();
  if (!cleanGroup) return typeLabel || "";
  if (/^[a-z0-9_ -]+-species$/i.test(cleanGroup)) return typeLabel || cleanGroup;
  return cleanGroup;
}

function extractSpeciesDataFromActor(actor) {
  if (!actor) return null;

  const system = actor.system ?? {};
  const species = system.species || actor.name || "";
  const typeLabel = getLocalizedValue(system.type ?? system.family ?? "");
  const typeKey = typeof system.type === "string"
    ? (DIGIMON_PROFILE_OPTIONS.types?.[system.type] ? system.type : getOptionKeyFromLabel(DIGIMON_PROFILE_OPTIONS.types, system.type))
    : getOptionKeyFromLabel(DIGIMON_PROFILE_OPTIONS.types, typeLabel);

  return {
    source: actor.pack ? "pack" : "world",
    sourceActorUuid: actor.uuid ?? "",
    name: actor.name ?? species,
    species,
    stage: system.stage ?? "baby1",
    img: actor.img || system.image || digimonBabyPath(species),
    attribute: system.attribute || "none",
    type: typeKey || "slime",
    typeLabel: typeLabel || getLocalizedValue(DIGIMON_PROFILE_OPTIONS.types?.[typeKey] ?? typeKey),
    field: system.field || (Array.isArray(system.fields) ? system.fields[0] : "") || "unknown",
    group: sanitizeCompendiumGroup(system.group, typeLabel),
    family: system.family ?? "",
    evolution: foundry.utils.deepClone(system.evolution ?? null),
    evolutionLine: foundry.utils.deepClone(system.evolutionLine ?? null),
    evolutionGraph: foundry.utils.deepClone(system.evolutionGraph ?? null)
  };
}

function extractSpeciesDataFromDatabaseEntry(entry) {
  if (!entry) return null;

  const species = entry.species || entry.name || "";
  const typeLabel = getLocalizedValue(entry.type ?? entry.family ?? "");
  const familyKey = String(entry.family ?? "").trim();
  const typeKey = DIGIMON_PROFILE_OPTIONS.types?.[familyKey]
    ? familyKey
    : getOptionKeyFromLabel(DIGIMON_PROFILE_OPTIONS.types, typeLabel);

  return {
    source: "database",
    sourceActorUuid: "",
    name: entry.name ?? species,
    species,
    stage: entry.stage ?? "baby1",
    img: entry.image || digimonBabyPath(entry.fileName ?? species),
    attribute: entry.attribute || "none",
    type: typeKey || "slime",
    typeLabel: typeLabel || getLocalizedValue(DIGIMON_PROFILE_OPTIONS.types?.[typeKey] ?? typeKey),
    field: entry.field || (Array.isArray(entry.fields) ? entry.fields[0] : "") || "unknown",
    group: sanitizeCompendiumGroup(entry.group, typeLabel),
    family: entry.family ?? "",
    evolution: foundry.utils.deepClone(entry.evolution ?? null),
    evolutionLine: null,
    evolutionGraph: null
  };
}

const DDA_DIGITAMA_VISUAL_PRESETS = {
  // Use apenas Digitamas-base que costumam existir na pasta de assets.
  // Se o tema específico não tiver arquivo próprio, o wizard reaproveita um ovo real próximo
  // e só cai no fallback CSS se TODOS os arquivos falharem.
  white: { fileName: "Botamon", className: "white", primary: "#f7fbff", secondary: "#d8ecf7", glow: "rgba(235, 250, 255, 0.62)", backups: ["Tokomon", "Pafumon"] },
  orange: { fileName: "Tokomon", className: "orange", primary: "#ff9b3d", secondary: "#d95a22", glow: "rgba(255, 160, 70, 0.52)", backups: ["Botamon", "Pafumon"] },
  purple: { fileName: "PetiMeramon", className: "purple", primary: "#9f57ff", secondary: "#5524b8", glow: "rgba(170, 95, 255, 0.55)", backups: ["Pafumon", "Botamon"] },
  blue: { fileName: "Pafumon", className: "blue", primary: "#7fdcff", secondary: "#2578c8", glow: "rgba(95, 200, 255, 0.52)", backups: ["Botamon", "Tokomon"] },
  green: { fileName: "Botamon", className: "green", primary: "#8ee879", secondary: "#2f9a52", glow: "rgba(130, 235, 150, 0.46)", backups: ["Pafumon", "Tokomon"] },
  pink: { fileName: "Pafumon", className: "pink", primary: "#ff9bd5", secondary: "#b83c86", glow: "rgba(255, 140, 210, 0.46)", backups: ["Botamon", "Tokomon"] },
  black: { fileName: "PetiMeramon", className: "black", primary: "#625a86", secondary: "#19172c", glow: "rgba(150, 120, 255, 0.34)", backups: ["Pafumon", "Botamon"] },
  yellow: { fileName: "Tokomon", className: "yellow", primary: "#ffe26e", secondary: "#d68b26", glow: "rgba(255, 220, 100, 0.48)", backups: ["Botamon", "Pafumon"] },
  steel: { fileName: "Pafumon", className: "steel", primary: "#c8e4ee", secondary: "#527b92", glow: "rgba(170, 225, 245, 0.36)", backups: ["Botamon", "Tokomon"] }
};

function getDigitamaVisualPreset(entry = {}, answer = {}, hiddenCrest = {}) {
  const traits = new Set([
    ...(entry.traits ?? []),
    ...(answer.traits ?? []),
    ...(DDA_CRESTS[hiddenCrest?.key]?.traits ?? [])
  ]);

  let key = "white";

  if (traits.has("dark") || traits.has("lonely") || traits.has("isolated")) key = "black";
  if (traits.has("plant")) key = "green";
  if (traits.has("aquatic") || traits.has("ice")) key = "blue";
  if (traits.has("machine") || traits.has("artificial")) key = "steel";
  if (traits.has("emotional") || traits.has("empathetic") || traits.has("gentle")) key = "pink";
  if (traits.has("holy") || traits.has("light") || traits.has("hopeful")) key = "yellow";
  if (traits.has("flame") || traits.has("impulsive") || traits.has("courageous")) key = "orange";
  if (traits.has("chaotic") || traits.has("mutant") || traits.has("strange")) key = "purple";

  const preset = DDA_DIGITAMA_VISUAL_PRESETS[key] ?? DDA_DIGITAMA_VISUAL_PRESETS.white;

  const backups = Array.isArray(preset.backups) ? preset.backups : [];

  return {
    ...preset,
    fallbackImg: digitamaPath(preset.fileName),
    fallbackImg2: digitamaPath(backups[0] ?? "Botamon"),
    fallbackImg3: digitamaPath(backups[1] ?? "Tokomon"),
    style: `--dda-digitama-primary: ${preset.primary}; --dda-digitama-secondary: ${preset.secondary}; --dda-digitama-glow: ${preset.glow};`
  };
}

function crestPath(fileName = "") {
  const key = String(fileName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  const crestFileName = key
    ? `${key.charAt(0).toUpperCase()}${key.slice(1)}`
    : "";

  return `systems/digimon-digital-adventures/assets/crests/Crest_of_${crestFileName}.webp`;
}

const DDA_CRESTS = {
  courage: { key: "courage", labelPt: "Coragem", labelEn: "Courage", img: crestPath("Courage"), traits: ["courageous", "impulsive", "energetic", "protective", "flame", "external"] },
  friendship: { key: "friendship", labelPt: "Amizade", labelEn: "Friendship", img: crestPath("Friendship"), traits: ["loyal", "social", "protective", "empathetic", "external"] },
  love: { key: "love", labelPt: "Amor", labelEn: "Love", img: crestPath("Love"), traits: ["emotional", "gentle", "empathetic", "protective", "social"] },
  knowledge: { key: "knowledge", labelPt: "Conhecimento", labelEn: "Knowledge", img: crestPath("Knowledge"), traits: ["analytical", "curious", "observant", "creative", "internal"] },
  sincerity: { key: "sincerity", labelPt: "Sinceridade", labelEn: "Sincerity", img: crestPath("Sincerity"), traits: ["honest", "emotional", "plant", "gentle", "external"] },
  purity: { key: "purity", labelPt: "Pureza", labelEn: "Purity", img: crestPath("Purity"), traits: ["playful", "plant", "hopeful", "social", "emotional"] },
  hope: { key: "hope", labelPt: "Esperança", labelEn: "Hope", img: crestPath("Hope"), traits: ["hopeful", "resilient", "holy", "calm", "internal"] },
  light: { key: "light", labelPt: "Luz", labelEn: "Light", img: crestPath("Light"), traits: ["holy", "gentle", "empathetic", "hopeful", "calm"] },
  kindness: { key: "kindness", labelPt: "Bondade", labelEn: "Kindness", img: crestPath("Kindness"), traits: ["gentle", "empathetic", "loyal", "protective", "calm"] },
  destiny: { key: "destiny", labelPt: "Destino", labelEn: "Destiny", img: crestPath("Destiny"), traits: ["strange", "observant", "resilient", "internal", "ancient"] },
  miracles: { key: "miracles", labelPt: "Milagres", labelEn: "Miracles", img: crestPath("Miracles"), traits: ["hopeful", "resilient", "holy", "energetic", "external"] }
};

const DDA_COMPATIBILITY_QUESTIONS = [
  {
    id: "q01",
    textPt: "Você vê alguém sendo intimidado por um grupo maior. O que faz?",
    textEn: "You see someone being intimidated by a larger group. What do you do?",
    answers: [
      { key: "A", textPt: "Interfere imediatamente.", textEn: "Intervene immediately.", crests: ["courage"], traits: ["courageous", "protective", "external"] },
      { key: "B", textPt: "Procura uma forma segura de ajudar.", textEn: "Look for a safe way to help.", crests: ["kindness", "love"], traits: ["cautious", "empathetic", "protective"] },
      { key: "C", textPt: "Chama outras pessoas para intervir junto.", textEn: "Call others to intervene together.", crests: ["friendship"], traits: ["social", "loyal", "protective"] },
      { key: "D", textPt: "Tenta entender por que aquilo está acontecendo.", textEn: "Try to understand why it is happening.", crests: ["knowledge"], traits: ["analytical", "observant", "curious"] }
    ]
  },
  {
    id: "q02",
    textPt: "O que mais destrói uma amizade?",
    textEn: "What destroys a friendship the most?",
    answers: [
      { key: "A", textPt: "Mentiras.", textEn: "Lies.", crests: ["sincerity"], traits: ["honest", "loyal"] },
      { key: "B", textPt: "Egoísmo.", textEn: "Selfishness.", crests: ["kindness", "love"], traits: ["empathetic", "gentle"] },
      { key: "C", textPt: "Falta de confiança.", textEn: "Lack of trust.", crests: ["friendship"], traits: ["loyal", "protective"] },
      { key: "D", textPt: "Distância emocional.", textEn: "Emotional distance.", crests: ["love", "light"], traits: ["emotional", "internal", "empathetic"] }
    ]
  },
  {
    id: "q03",
    textPt: "Qual dessas características você mais admira?",
    textEn: "Which of these traits do you admire most?",
    answers: [
      { key: "A", textPt: "Coragem.", textEn: "Courage.", crests: ["courage"], traits: ["courageous", "external"] },
      { key: "B", textPt: "Gentileza.", textEn: "Kindness.", crests: ["kindness", "light"], traits: ["gentle", "empathetic"] },
      { key: "C", textPt: "Inteligência.", textEn: "Intelligence.", crests: ["knowledge"], traits: ["analytical", "curious"] },
      { key: "D", textPt: "Persistência.", textEn: "Persistence.", crests: ["hope", "miracles"], traits: ["resilient", "hopeful"] }
    ]
  },
  {
    id: "q04",
    textPt: "Você falha em algo importante. O que dói mais?",
    textEn: "You fail at something important. What hurts the most?",
    answers: [
      { key: "A", textPt: "Parecer fraco.", textEn: "Looking weak.", crests: ["courage"], traits: ["courageous", "resilient"] },
      { key: "B", textPt: "Decepcionar alguém.", textEn: "Disappointing someone.", crests: ["love", "friendship"], traits: ["emotional", "loyal", "social"] },
      { key: "C", textPt: "Não entender onde errou.", textEn: "Not understanding where you went wrong.", crests: ["knowledge"], traits: ["analytical", "observant"] },
      { key: "D", textPt: "Perder a esperança.", textEn: "Losing hope.", crests: ["hope"], traits: ["hopeful", "internal"] }
    ]
  },
  {
    id: "q05",
    textPt: "Seu grupo está perdido. Qual papel você assume naturalmente?",
    textEn: "Your group is lost. What role do you naturally take?",
    answers: [
      { key: "A", textPt: "Lidero a movimentação.", textEn: "Lead the movement.", crests: ["courage"], traits: ["courageous", "external", "energetic"] },
      { key: "B", textPt: "Tento manter todos unidos.", textEn: "Try to keep everyone together.", crests: ["friendship"], traits: ["social", "loyal", "protective"] },
      { key: "C", textPt: "Procuro uma solução lógica.", textEn: "Look for a logical solution.", crests: ["knowledge"], traits: ["analytical", "observant"] },
      { key: "D", textPt: "Tento manter a calma do grupo.", textEn: "Try to keep the group calm.", crests: ["hope", "kindness"], traits: ["calm", "hopeful", "gentle"] }
    ]
  },
  {
    id: "q06",
    textPt: "Qual destes lugares parece mais acolhedor?",
    textEn: "Which of these places feels most welcoming?",
    answers: [
      { key: "A", textPt: "Um campo aberto ao amanhecer.", textEn: "An open field at dawn.", crests: ["courage", "hope"], traits: ["external", "hopeful", "energetic"] },
      { key: "B", textPt: "Uma sala silenciosa cheia de livros.", textEn: "A quiet room full of books.", crests: ["knowledge"], traits: ["analytical", "curious", "internal"] },
      { key: "C", textPt: "Uma casa cheia de amigos.", textEn: "A house full of friends.", crests: ["friendship", "love"], traits: ["social", "loyal", "emotional"] },
      { key: "D", textPt: "Um quarto pequeno iluminado por luz suave.", textEn: "A small room lit by soft light.", crests: ["light", "kindness"], traits: ["gentle", "calm", "internal"] }
    ]
  },
  {
    id: "q07",
    textPt: "Quando alguém te machuca emocionalmente, você tende a…",
    textEn: "When someone hurts you emotionally, you tend to…",
    answers: [
      { key: "A", textPt: "confrontar a pessoa.", textEn: "confront them.", crests: ["courage", "sincerity"], traits: ["courageous", "external", "honest"] },
      { key: "B", textPt: "se afastar em silêncio.", textEn: "withdraw silently.", crests: ["destiny"], traits: ["lonely", "internal", "cautious"] },
      { key: "C", textPt: "tentar entender os motivos dela.", textEn: "try to understand their reasons.", crests: ["knowledge", "kindness"], traits: ["analytical", "empathetic", "observant"] },
      { key: "D", textPt: "fingir que não se abalou.", textEn: "pretend it did not affect you.", crests: ["hope"], traits: ["resilient", "internal"] }
    ]
  },
  {
    id: "q08",
    textPt: "Qual dessas frases parece mais forte para você?",
    textEn: "Which of these phrases feels strongest to you?",
    answers: [
      { key: "A", textPt: "“Eu não vou fugir.”", textEn: "“I will not run away.”", crests: ["courage"], traits: ["courageous", "resilient"] },
      { key: "B", textPt: "“Você não está sozinho.”", textEn: "“You are not alone.”", crests: ["friendship", "love"], traits: ["social", "loyal", "empathetic"] },
      { key: "C", textPt: "“Ainda existe uma saída.”", textEn: "“There is still a way out.”", crests: ["hope", "miracles"], traits: ["hopeful", "resilient"] },
      { key: "D", textPt: "“Preciso descobrir a verdade.”", textEn: "“I need to uncover the truth.”", crests: ["knowledge", "sincerity"], traits: ["curious", "analytical", "honest"] }
    ]
  },
  {
    id: "q09",
    textPt: "Seu parceiro Digimon perde o controle durante uma batalha. O que você faz primeiro?",
    textEn: "Your Digimon partner loses control in battle. What do you do first?",
    answers: [
      { key: "A", textPt: "Vai até ele mesmo correndo risco.", textEn: "Run to them even at personal risk.", crests: ["courage"], traits: ["courageous", "protective", "external"] },
      { key: "B", textPt: "Protege as pessoas próximas.", textEn: "Protect the people nearby.", crests: ["love", "kindness"], traits: ["protective", "empathetic", "social"] },
      { key: "C", textPt: "Analisa o que causou aquilo.", textEn: "Analyze what caused it.", crests: ["knowledge"], traits: ["analytical", "observant"] },
      { key: "D", textPt: "Chama por ele emocionalmente.", textEn: "Call out to them emotionally.", crests: ["friendship", "light"], traits: ["emotional", "loyal", "hopeful"] }
    ]
  },
  {
    id: "q10",
    textPt: "O que mais te motiva a continuar?",
    textEn: "What motivates you most to keep going?",
    answers: [
      { key: "A", textPt: "Superar seus limites.", textEn: "Surpassing your limits.", crests: ["courage", "miracles"], traits: ["courageous", "energetic", "resilient"] },
      { key: "B", textPt: "Pessoas importantes para você.", textEn: "People who matter to you.", crests: ["love", "friendship"], traits: ["loyal", "social", "emotional"] },
      { key: "C", textPt: "Descobrir algo novo.", textEn: "Discovering something new.", crests: ["knowledge"], traits: ["curious", "analytical"] },
      { key: "D", textPt: "A ideia de um futuro melhor.", textEn: "The idea of a better future.", crests: ["hope"], traits: ["hopeful", "internal"] }
    ]
  },
  {
    id: "q11",
    textPt: "Qual dessas situações parece pior?",
    textEn: "Which of these situations feels worst?",
    answers: [
      { key: "A", textPt: "Ser incapaz de proteger alguém.", textEn: "Being unable to protect someone.", crests: ["love", "kindness"], traits: ["protective", "emotional"] },
      { key: "B", textPt: "Ficar sozinho.", textEn: "Being alone.", crests: ["friendship"], traits: ["lonely", "social", "loyal"] },
      { key: "C", textPt: "Não conseguir confiar em ninguém.", textEn: "Being unable to trust anyone.", crests: ["friendship", "sincerity"], traits: ["loyal", "cautious"] },
      { key: "D", textPt: "Perder quem você era.", textEn: "Losing who you were.", crests: ["light", "destiny"], traits: ["strange", "internal", "resilient"] }
    ]
  },
  {
    id: "q12",
    textPt: "Se pudesse ter qualquer parceiro Digimon, você preferiria que ele fosse…",
    textEn: "If you could have any Digimon partner, you would prefer them to be…",
    answers: [
      { key: "A", textPt: "impulsivo e energético.", textEn: "impulsive and energetic.", crests: ["courage"], traits: ["impulsive", "energetic", "external"] },
      { key: "B", textPt: "calmo e gentil.", textEn: "calm and gentle.", crests: ["kindness", "light"], traits: ["calm", "gentle", "empathetic"] },
      { key: "C", textPt: "curioso e inteligente.", textEn: "curious and intelligent.", crests: ["knowledge"], traits: ["curious", "analytical", "observant"] },
      { key: "D", textPt: "estranho, mas profundamente leal.", textEn: "strange, but deeply loyal.", crests: ["friendship", "destiny"], traits: ["strange", "loyal", "internal"] }
    ]
  },
  {
    id: "q13",
    textPt: "Você encontra um Digi-Ovo abandonado. O que sente primeiro?",
    textEn: "You find an abandoned Digi-Egg. What do you feel first?",
    answers: [
      { key: "A", textPt: "Empolgação.", textEn: "Excitement.", crests: ["courage", "purity"], traits: ["energetic", "playful", "external"] },
      { key: "B", textPt: "Responsabilidade.", textEn: "Responsibility.", crests: ["kindness", "love"], traits: ["protective", "resilient", "cautious"] },
      { key: "C", textPt: "Curiosidade.", textEn: "Curiosity.", crests: ["knowledge"], traits: ["curious", "observant"] },
      { key: "D", textPt: "Compaixão.", textEn: "Compassion.", crests: ["love", "light"], traits: ["empathetic", "emotional", "gentle"] }
    ]
  },
  {
    id: "q14",
    textPt: "O que você mais teme em si mesmo?",
    textEn: "What do you fear most in yourself?",
    answers: [
      { key: "A", textPt: "Covardia.", textEn: "Cowardice.", crests: ["courage"], traits: ["courageous", "resilient"] },
      { key: "B", textPt: "Machucar alguém sem perceber.", textEn: "Hurting someone without realizing it.", crests: ["love", "kindness"], traits: ["empathetic", "emotional"] },
      { key: "C", textPt: "Se tornar indiferente.", textEn: "Becoming indifferent.", crests: ["light", "sincerity"], traits: ["gentle", "honest", "internal"] },
      { key: "D", textPt: "Perder sua direção.", textEn: "Losing your direction.", crests: ["hope", "destiny"], traits: ["hopeful", "internal"] }
    ]
  },
  {
    id: "q15",
    textPt: "Quando tudo parece impossível, você normalmente…",
    textEn: "When everything seems impossible, you usually…",
    answers: [
      { key: "A", textPt: "avança mesmo assim.", textEn: "push forward anyway.", crests: ["courage", "miracles"], traits: ["courageous", "resilient", "external"] },
      { key: "B", textPt: "procura apoiar os outros.", textEn: "try to support others.", crests: ["friendship", "kindness"], traits: ["supportive", "social", "empathetic"] },
      { key: "C", textPt: "tenta encontrar outra solução.", textEn: "try to find another solution.", crests: ["knowledge"], traits: ["analytical", "creative", "curious"] },
      { key: "D", textPt: "continua acreditando até o fim.", textEn: "keep believing until the end.", crests: ["hope"], traits: ["hopeful", "resilient"] }
    ]
  },
  {
    id: "q16",
    textPt: "Escolha a imagem que mais te atrai:",
    textEn: "Choose the image that attracts you most:",
    answers: [
      { key: "A", textPt: "Uma chama iluminando a escuridão.", textEn: "A flame illuminating the darkness.", crests: ["courage"], traits: ["flame", "external", "courageous"] },
      { key: "B", textPt: "Duas pessoas de mãos dadas.", textEn: "Two people holding hands.", crests: ["friendship", "love"], traits: ["social", "loyal", "emotional"] },
      { key: "C", textPt: "Uma estrela distante no céu noturno.", textEn: "A distant star in the night sky.", crests: ["hope", "light"], traits: ["hopeful", "holy", "internal"] },
      { key: "D", textPt: "Uma flor crescendo entre ruínas.", textEn: "A flower growing among ruins.", crests: ["purity", "sincerity"], traits: ["plant", "hopeful", "resilient"] }
    ]
  }
];

const DDA_COMPATIBILITY_CREST_WEIGHTS = {
  q01: {
    A: { courage: 3, miracles: 1 },
    B: { kindness: 3, love: 1, knowledge: 1 },
    C: { friendship: 3, love: 1 },
    D: { knowledge: 3, sincerity: 1, destiny: 1 }
  },
  q02: {
    A: { sincerity: 3, friendship: 1 },
    B: { purity: 3, kindness: 1, love: 1 },
    C: { friendship: 3, hope: 1 },
    D: { love: 3, light: 1, destiny: 1 }
  },
  q03: {
    A: { courage: 3, miracles: 1 },
    B: { kindness: 3, light: 1, love: 1 },
    C: { knowledge: 3, destiny: 1 },
    D: { miracles: 3, hope: 1 }
  },
  q04: {
    A: { destiny: 3, courage: 1, sincerity: 1 },
    B: { love: 3, friendship: 1 },
    C: { sincerity: 3, knowledge: 1 },
    D: { hope: 3, light: 1, miracles: 1 }
  },
  q05: {
    A: { courage: 3, friendship: 1 },
    B: { friendship: 3, kindness: 1 },
    C: { knowledge: 3, destiny: 1 },
    D: { light: 3, hope: 1, kindness: 1 }
  },
  q06: {
    A: { hope: 3, purity: 1, courage: 1 },
    B: { knowledge: 3, destiny: 1 },
    C: { friendship: 3, love: 1 },
    D: { light: 3, kindness: 1 }
  },
  q07: {
    A: { sincerity: 3, courage: 1 },
    B: { destiny: 3, light: 1 },
    C: { kindness: 3, knowledge: 1, sincerity: 1 },
    D: { hope: 3, destiny: 1, miracles: 1 }
  },
  q08: {
    A: { courage: 3, hope: 1 },
    B: { friendship: 3, love: 1 },
    C: { miracles: 3, hope: 1 },
    D: { sincerity: 3, knowledge: 1 }
  },
  q09: {
    A: { courage: 3, love: 1 },
    B: { kindness: 3, love: 1 },
    C: { knowledge: 3, destiny: 1 },
    D: { light: 3, friendship: 1 }
  },
  q10: {
    A: { miracles: 3, courage: 1 },
    B: { love: 3, friendship: 1 },
    C: { purity: 3, knowledge: 1 },
    D: { hope: 3, light: 1 }
  },
  q11: {
    A: { love: 3, kindness: 1 },
    B: { friendship: 3, hope: 1 },
    C: { sincerity: 3, friendship: 1 },
    D: { destiny: 3, light: 1 }
  },
  q12: {
    A: { purity: 3, courage: 1 },
    B: { kindness: 3, light: 1 },
    C: { knowledge: 3, destiny: 1 },
    D: { destiny: 3, friendship: 1 }
  },
  q13: {
    A: { purity: 3, miracles: 1, courage: 1 },
    B: { kindness: 3, love: 1, sincerity: 1 },
    C: { destiny: 3, knowledge: 1 },
    D: { love: 3, light: 1 }
  },
  q14: {
    A: { courage: 3, sincerity: 1 },
    B: { love: 3, kindness: 1, sincerity: 1 },
    C: { light: 3, sincerity: 1 },
    D: { destiny: 3, hope: 1 }
  },
  q15: {
    A: { miracles: 3, courage: 1 },
    B: { friendship: 3, kindness: 1 },
    C: { hope: 3, knowledge: 1 },
    D: { miracles: 3, hope: 1, light: 1 }
  },
  q16: {
    A: { courage: 3, light: 1 },
    B: { love: 3, friendship: 1 },
    C: { light: 3, hope: 1, destiny: 1 },
    D: { purity: 3, sincerity: 1, hope: 1 }
  }
};

function getCompatibilityCrestWeights(questionId = "", answer = {}) {
  const answerKey = String(answer?.key ?? "").trim();
  const weighted = DDA_COMPATIBILITY_CREST_WEIGHTS?.[questionId]?.[answerKey];

  if (weighted && typeof weighted === "object") {
    return weighted;
  }

  const fallback = {};

  for (const crestKey of answer.crests ?? []) {
    fallback[crestKey] = Number(fallback[crestKey] ?? 0) + 1;
  }

  return fallback;
}


const DDA_COMPATIBILITY_FINAL_QUESTIONS = [
  {
    id: "protector",
    profileTraits: ["protective", "loyal", "empathetic", "resilient", "social"],
    crestHints: ["friendship", "love", "kindness"],
    textPt: "17. Quando seu parceiro Digimon finalmente encosta em você pela primeira vez, qual sensação parece mais verdadeira?",
    textEn: "17. When your partner Digimon finally touches you for the first time, which feeling seems most true?",
    answers: [
      { key: "A", textPt: "Mesmo pequeno, ele transmite uma vontade silenciosa de proteger quem ama.", textEn: "Even small, it carries a quiet desire to protect those it loves.", traits: ["protective", "loyal", "resilient", "beast", "social"] },
      { key: "B", textPt: "Ele parece extremamente atento às suas emoções, como se percebesse dores que você nunca disse em voz alta.", textEn: "It seems intensely aware of your emotions, as if sensing pains you never said aloud.", traits: ["empathetic", "emotional", "observant", "gentle", "internal"] },
      { key: "C", textPt: "Existe uma energia gentil e acolhedora nele, como se simplesmente estar ao seu lado já fosse suficiente.", textEn: "There is a gentle, welcoming energy in it, as if simply staying beside you is enough.", traits: ["gentle", "calm", "loyal", "social", "hopeful"] },
      { key: "D", textPt: "O jeito estranho e cauteloso dele faz parecer que vocês dois entendem o que é se sentir deslocado.", textEn: "Its strange, cautious manner makes it feel like you both understand what it means to feel displaced.", traits: ["strange", "cautious", "lonely", "internal", "observant"] }
    ]
  },
  {
    id: "brave",
    profileTraits: ["courageous", "impulsive", "energetic", "external", "flame", "dragon"],
    crestHints: ["courage", "miracles"],
    textPt: "17. O Digitama vibra como se uma batalha distante tivesse acabado de começar. Qual reação dele parece mais verdadeira?",
    textEn: "17. The Digi-Egg vibrates as if a distant battle has just begun. Which reaction feels most true?",
    answers: [
      { key: "A", textPt: "Ele avança para perto da sua mão, impaciente, como se já quisesse nascer correndo.", textEn: "It moves toward your hand, impatient, as if already wanting to be born running.", traits: ["impulsive", "energetic", "external", "courageous"] },
      { key: "B", textPt: "Ele pulsa quente, mas firme, como uma pequena chama que se recusa a apagar.", textEn: "It pulses warm and steady, like a small flame refusing to go out.", traits: ["flame", "resilient", "courageous", "hopeful"] },
      { key: "C", textPt: "Ele parece desafiar você, não por raiva, mas para saber se você também não vai fugir.", textEn: "It seems to challenge you, not out of anger, but to know whether you also refuse to run.", traits: ["courageous", "stubborn", "dragon", "external"] },
      { key: "D", textPt: "Ele se agita de forma caótica, como se sua energia ainda não coubesse dentro da casca.", textEn: "It shakes chaotically, as if its energy no longer fits inside the shell.", traits: ["chaotic", "energetic", "impulsive", "instinctive"] }
    ]
  },
  {
    id: "bond",
    profileTraits: ["social", "loyal", "emotional", "playful", "external", "hopeful"],
    crestHints: ["friendship", "love", "purity"],
    textPt: "17. Quatro Digitamas começam a se mover quando você pensa nas pessoas importantes da sua vida. Qual deles parece responder melhor?",
    textEn: "17. Four Digi-Eggs begin to move when you think about the important people in your life. Which one seems to answer best?",
    answers: [
      { key: "A", textPt: "Ele balança como se reconhecesse uma risada que você ainda nem deu.", textEn: "It sways as if recognizing a laugh you have not even made yet.", traits: ["playful", "social", "external", "energetic"] },
      { key: "B", textPt: "Ele encosta devagar, como alguém pedindo permissão para ficar por perto.", textEn: "It leans closer slowly, like someone asking permission to stay nearby.", traits: ["loyal", "gentle", "emotional", "social"] },
      { key: "C", textPt: "Ele pulsa em resposta ao seu coração, como se a distância entre vocês desaparecesse.", textEn: "It pulses in response to your heart, as if the distance between you disappeared.", traits: ["emotional", "hopeful", "social", "empathetic"] },
      { key: "D", textPt: "Ele parece pequeno demais para o mundo, mas grande o bastante para não deixar você sozinho.", textEn: "It seems too small for the world, but large enough to keep you from being alone.", traits: ["loyal", "protective", "hopeful", "resilient"] }
    ]
  },
  {
    id: "curious",
    profileTraits: ["analytical", "curious", "observant", "creative", "machine", "artificial"],
    crestHints: ["knowledge"],
    textPt: "17. O Digivice emite dados incompletos, e quatro Digitamas respondem de formas diferentes. Qual reação prende sua atenção?",
    textEn: "17. The Digivice emits incomplete data, and four Digi-Eggs answer in different ways. Which reaction catches your attention?",
    answers: [
      { key: "A", textPt: "Ele pisca em padrões quase lógicos, como se estivesse tentando formar uma pergunta.", textEn: "It blinks in almost logical patterns, as if trying to form a question.", traits: ["analytical", "observant", "machine", "artificial"] },
      { key: "B", textPt: "Ele muda de ritmo toda vez que você olha mais de perto, como se testasse sua curiosidade.", textEn: "It changes rhythm whenever you look closer, as if testing your curiosity.", traits: ["curious", "creative", "adaptable", "external"] },
      { key: "C", textPt: "Ele permanece quase imóvel, mas você sente que está observando tudo ao redor.", textEn: "It stays almost still, but you feel it is observing everything around it.", traits: ["observant", "cautious", "internal", "analytical"] },
      { key: "D", textPt: "Ele parece estranho demais para ser entendido de primeira, e isso torna impossível ignorá-lo.", textEn: "It seems too strange to understand at first, which makes it impossible to ignore.", traits: ["strange", "curious", "artificial", "isolated"] }
    ]
  },
  {
    id: "hopeful",
    profileTraits: ["hopeful", "resilient", "holy", "calm", "internal", "light"],
    crestHints: ["hope", "light", "miracles"],
    textPt: "17. Por um instante, o lugar parece menos escuro. Qual Digitama parece carregar essa pequena promessa?",
    textEn: "17. For a moment, the place feels less dark. Which Digi-Egg seems to carry that small promise?",
    answers: [
      { key: "A", textPt: "Ele brilha baixinho, como uma estrela que insiste em continuar no céu.", textEn: "It glows softly, like a star insisting on remaining in the sky.", traits: ["hopeful", "holy", "internal", "light"] },
      { key: "B", textPt: "Ele parece frágil, mas cada pulso dele diz que ainda há tempo.", textEn: "It seems fragile, but each pulse says there is still time.", traits: ["hopeful", "resilient", "gentle", "emotional"] },
      { key: "C", textPt: "Ele se mantém calmo, como se soubesse que sobreviver também é uma forma de vencer.", textEn: "It remains calm, as if knowing survival is also a way to win.", traits: ["calm", "resilient", "internal", "cautious"] },
      { key: "D", textPt: "Ele responde como se algo impossível tivesse acabado de encontrar uma brecha para acontecer.", textEn: "It responds as if something impossible has just found a way to happen.", traits: ["holy", "hopeful", "energetic", "miracles"] }
    ]
  },
  {
    id: "gentle",
    profileTraits: ["gentle", "empathetic", "calm", "emotional", "holy", "aquatic"],
    crestHints: ["kindness", "love", "light"],
    textPt: "17. Ao tocar o Digitama, você sente que ele percebe algo delicado em você. Qual resposta dele parece mais sincera?",
    textEn: "17. When you touch the Digi-Egg, you feel it senses something delicate in you. Which response seems most sincere?",
    answers: [
      { key: "A", textPt: "Ele aquece de leve, como se quisesse confortar antes mesmo de falar.", textEn: "It warms gently, as if wanting to comfort you before it can speak.", traits: ["gentle", "empathetic", "emotional", "social"] },
      { key: "B", textPt: "Ele pulsa no mesmo ritmo da sua respiração, tornando tudo um pouco mais calmo.", textEn: "It pulses with your breathing, making everything a little calmer.", traits: ["calm", "aquatic", "gentle", "internal"] },
      { key: "C", textPt: "Ele parece pequeno e tímido, mas não se afasta quando você se aproxima.", textEn: "It seems small and shy, but does not move away when you approach.", traits: ["shy", "gentle", "emotional", "internal"] },
      { key: "D", textPt: "Ele brilha com uma luz suave, como se enxergasse algo bom mesmo nas suas partes quebradas.", textEn: "It glows with a soft light, as if seeing something good even in your broken parts.", traits: ["holy", "light", "empathetic", "hopeful"] }
    ]
  },
  {
    id: "outsider",
    profileTraits: ["strange", "lonely", "isolated", "internal", "dark", "observant"],
    crestHints: ["destiny", "knowledge", "light"],
    textPt: "17. O Digitama parece fora de lugar, como se tivesse caído neste mundo por engano. O que nele chama você?",
    textEn: "17. The Digi-Egg seems out of place, as if it fell into this world by mistake. What about it calls to you?",
    answers: [
      { key: "A", textPt: "Ele observa tudo de longe, e isso faz você querer se aproximar sem assustá-lo.", textEn: "It watches everything from afar, making you want to approach without frightening it.", traits: ["observant", "cautious", "lonely", "internal"] },
      { key: "B", textPt: "Ele parece estranho de um jeito familiar, como se sua diferença tivesse encontrado companhia.", textEn: "It feels strange in a familiar way, as if your difference has found company.", traits: ["strange", "isolated", "loyal", "internal"] },
      { key: "C", textPt: "Ele pulsa com uma sombra inquieta, mas não parece maldoso — só perdido.", textEn: "It pulses with restless shadow, but it does not feel evil, only lost.", traits: ["dark", "emotional", "lonely", "strange"] },
      { key: "D", textPt: "Ele parece conhecer um caminho que ninguém mais consegue ver.", textEn: "It seems to know a path no one else can see.", traits: ["destiny", "strange", "observant", "ancient"] }
    ]
  },
  {
    id: "playful",
    profileTraits: ["playful", "energetic", "social", "adaptable", "external", "beast"],
    crestHints: ["purity", "friendship"],
    textPt: "17. O Digitama não consegue ficar parado, como se o mundo inteiro fosse uma brincadeira esperando para começar. Qual movimento dele te atrai?",
    textEn: "17. The Digi-Egg cannot stay still, as if the whole world were a game waiting to begin. Which movement attracts you?",
    answers: [
      { key: "A", textPt: "Ele pula na sua direção com uma alegria impossível de ignorar.", textEn: "It hops toward you with joy that is impossible to ignore.", traits: ["playful", "energetic", "social", "external"] },
      { key: "B", textPt: "Ele gira sem parar, mas sempre parece voltar para perto de você.", textEn: "It spins nonstop, but always seems to return close to you.", traits: ["playful", "loyal", "beast", "social"] },
      { key: "C", textPt: "Ele muda de ritmo como se estivesse improvisando uma dança só sua.", textEn: "It changes rhythm as if improvising a dance just for you.", traits: ["adaptable", "playful", "creative", "external"] },
      { key: "D", textPt: "Ele treme de empolgação, pequeno demais para conter tanta vida.", textEn: "It trembles with excitement, too small to contain so much life.", traits: ["energetic", "hopeful", "playful", "external"] }
    ]
  },
  {
    id: "quiet",
    profileTraits: ["calm", "cautious", "internal", "shy", "melancholic", "observant"],
    crestHints: ["hope", "destiny", "knowledge"],
    textPt: "17. O silêncio ao redor do Digitama parece mais importante que qualquer som. O que você percebe primeiro?",
    textEn: "17. The silence around the Digi-Egg feels more important than any sound. What do you notice first?",
    answers: [
      { key: "A", textPt: "Ele quase não se move, mas parece esperar pacientemente que você esteja pronto.", textEn: "It barely moves, but seems to patiently wait until you are ready.", traits: ["calm", "internal", "cautious", "resilient"] },
      { key: "B", textPt: "Ele esconde parte do brilho, como se ainda estivesse aprendendo a confiar.", textEn: "It hides part of its glow, as if still learning how to trust.", traits: ["shy", "cautious", "emotional", "internal"] },
      { key: "C", textPt: "Ele carrega uma tristeza pequena, mas honesta, que não pede solução imediata.", textEn: "It carries a small, honest sadness that does not ask for an immediate solution.", traits: ["melancholic", "emotional", "gentle", "internal"] },
      { key: "D", textPt: "Ele percebe sua presença antes que você faça qualquer movimento.", textEn: "It notices your presence before you make any movement.", traits: ["observant", "calm", "cautious", "internal"] }
    ]
  },
  {
    id: "wild",
    profileTraits: ["chaotic", "instinctive", "mutant", "dark", "adaptable", "slime"],
    crestHints: ["miracles", "destiny", "courage"],
    textPt: "17. Por um segundo, o Digitama parece impossível de prever. Qual instinto dele parece mais familiar?",
    textEn: "17. For a second, the Digi-Egg seems impossible to predict. Which instinct feels most familiar?",
    answers: [
      { key: "A", textPt: "Ele reage antes de qualquer lógica, como se sobreviver viesse primeiro.", textEn: "It reacts before any logic, as if survival comes first.", traits: ["instinctive", "resilient", "beast", "external"] },
      { key: "B", textPt: "Ele muda de forma no brilho do visor, estranho e livre demais para ser classificado.", textEn: "It changes shape in the screen glow, too strange and free to classify.", traits: ["mutant", "strange", "adaptable", "slime"] },
      { key: "C", textPt: "Ele parece carregar uma pequena bagunça dentro de si, mas essa bagunça tem vida.", textEn: "It seems to carry a small mess inside itself, but that mess is alive.", traits: ["chaotic", "playful", "emotional", "external"] },
      { key: "D", textPt: "Ele pulsa com uma escuridão curiosa, como uma pergunta que ninguém teve coragem de fazer.", textEn: "It pulses with curious darkness, like a question no one dared to ask.", traits: ["dark", "curious", "strange", "internal"] }
    ]
  }
];

const DDA_DIGITAMA_POOL = [
  { name: "Algomon", fileName: "Algomon", traits: ["artificial", "analytical", "isolated", "observant", "strange", "internal"] },
  { name: "Bombmon", fileName: "Bombmon", traits: ["impulsive", "energetic", "chaotic", "external", "resilient", "flame"] },
  { name: "Bommon", fileName: "Bommon", traits: ["playful", "energetic", "dragon", "hopeful", "social", "external"] },
  { name: "Botamon", fileName: "Botamon", traits: ["courageous", "impulsive", "dragon", "energetic", "resilient", "external"] },
  { name: "Bubbmon", fileName: "Bubbmon", traits: ["aquatic", "playful", "adaptable", "emotional", "social", "external"] },
  { name: "Chibickmon", fileName: "Chibickmon", traits: ["bird", "energetic", "curious", "playful", "social", "wind"] },
  { name: "Chicomon", fileName: "Chicomon", traits: ["playful", "energetic", "social", "hopeful", "beast", "external"] },
  { name: "Choromon", fileName: "Choromon", traits: ["machine", "analytical", "creative", "energetic", "curious", "external"] },
  { name: "Cocomon", fileName: "Cocomon", traits: ["lonely", "emotional", "melancholic", "cautious", "beast", "internal"] },
  { name: "Cotsucomon", fileName: "Cotsucomon", traits: ["earth", "stoic", "resilient", "cautious", "isolated", "ancient"] },
  { name: "Curimon", fileName: "Curimon", traits: ["holy", "gentle", "empathetic", "emotional", "hopeful", "social"] },
  { name: "Dodomon", fileName: "Dodomon", traits: ["beast", "stubborn", "courageous", "energetic", "protective", "external"] },
  { name: "Dokimon", fileName: "Dokimon", traits: ["dark", "chaotic", "impulsive", "emotional", "mutant", "external"] },
  { name: "Fufumon", fileName: "Fufumon", traits: ["dragon", "cautious", "observant", "lonely", "resilient", "internal"] },
  { name: "Fukamon", fileName: "Fukamon", traits: ["aquatic", "calm", "cautious", "observant", "resilient", "internal"] },
  { name: "Fusamon", fileName: "Fusamon", traits: ["mutant", "chaotic", "strange", "playful", "curious", "external"] },
  { name: "Jyarimon", fileName: "Jyarimon", traits: ["dragon", "courageous", "impulsive", "energetic", "instinctive", "resilient"] },
  { name: "Keemon", fileName: "Keemon", traits: ["dark", "lonely", "chaotic", "instinctive", "resilient", "internal"] },
  { name: "Ketomon", fileName: "Ketomon", traits: ["beast", "loyal", "protective", "cautious", "resilient", "social"] },
  { name: "Kuramon", fileName: "Kuramon", traits: ["dark", "analytical", "isolated", "strange", "observant", "internal"] },
  { name: "Leafmon", fileName: "Leafmon", traits: ["plant", "gentle", "empathetic", "protective", "calm", "emotional"] },
  { name: "Mokumon", fileName: "Mokumon", traits: ["flame", "melancholic", "lonely", "dark", "emotional", "internal"] },
  { name: "Nyokimon", fileName: "Nyokimon", traits: ["plant", "shy", "calm", "observant", "hopeful", "internal"] },
  { name: "Pabumon", fileName: "Pabumon", traits: ["curious", "analytical", "adaptable", "energetic", "social", "external"] },
  { name: "Pafumon", fileName: "Pafumon", traits: ["emotional", "observant", "empathetic", "cautious", "hopeful", "internal"] },
  { name: "Paomon", fileName: "Paomon", traits: ["aquatic", "calm", "emotional", "social", "hopeful", "empathetic"] },
  { name: "Petitmon", fileName: "Petitmon", traits: ["holy", "dragon", "hopeful", "energetic", "resilient", "social"] },
  { name: "PetiMeramon", fileName: "PetiMeramon", traits: ["flame", "impulsive", "energetic", "chaotic", "external", "instinctive"] },
  { name: "Pipimon", fileName: "Pipimon", traits: ["playful", "strange", "curious", "social", "adaptable", "external"] },
  { name: "Pitchmon", fileName: "Pitchmon", traits: ["aquatic", "social", "playful", "emotional", "hopeful", "external"] },
  { name: "Popomon", fileName: "Popomon", traits: ["plant", "hopeful", "playful", "emotional", "social", "external"] },
  { name: "Poyomon", fileName: "Poyomon", traits: ["holy", "aquatic", "calm", "emotional", "hopeful", "internal"] },
  { name: "Punimon", fileName: "Punimon", traits: ["beast", "loyal", "cautious", "protective", "resilient", "social"] },
  { name: "Pupumon", fileName: "Pupumon", traits: ["machine", "curious", "analytical", "creative", "playful", "external"] },
  { name: "Pururumon", fileName: "Pururumon", traits: ["emotional", "gentle", "loyal", "calm", "empathetic", "social"] },
  { name: "Pusumon", fileName: "Pusumon", traits: ["holy", "shy", "emotional", "empathetic", "gentle", "internal"] },
  { name: "Puwamon", fileName: "Puwamon", traits: ["bird", "calm", "hopeful", "observant", "wind", "internal"] },
  { name: "Pyonmon", fileName: "Pyonmon", traits: ["playful", "energetic", "beast", "social", "adaptable", "external"] },
  { name: "Relemon", fileName: "Relemon", traits: ["beast", "playful", "energetic", "loyal", "social", "external"] },
  { name: "Sakumon", fileName: "Sakumon", traits: ["holy", "strange", "emotional", "observant", "internal", "spirit"] },
  { name: "Sunamon", fileName: "Sunamon", traits: ["earth", "stoic", "calm", "resilient", "protective", "internal"] },
  { name: "Tokomon", fileName: "Tokomon", traits: ["holy", "loyal", "hopeful", "protective", "resilient", "social"] },
  { name: "Tomorimon", fileName: "Tomorimon", traits: ["artificial", "curious", "observant", "adaptable", "analytical", "external"] },
  { name: "TorikaraBallmon", fileName: "TorikaraBallmon", traits: ["bird", "playful", "chaotic", "energetic", "external", "social"] },
  { name: "Tsubumon", fileName: "Tsubumon", traits: ["machine", "analytical", "observant", "cautious", "resilient", "internal"] },
  { name: "Yokomon", fileName: "Yokomon", traits: ["plant", "hopeful", "playful", "emotional", "social", "external"] },
  { name: "YukimiBotamon", fileName: "Yukimi Botamon", traits: ["ice", "calm", "shy", "emotional", "gentle", "internal"] },
  { name: "Yuramon", fileName: "Yuramon", traits: ["plant", "emotional", "hopeful", "social", "playful", "empathetic"] },
  { name: "Zerimon", fileName: "Zerimon", traits: ["holy", "loyal", "hopeful", "resilient", "social", "protective"] },
  { name: "Zurumon", fileName: "Zurumon", traits: ["slime", "chaotic", "adaptable", "strange", "playful", "external"] }
];

const DIGIMON_PROFILE_OPTIONS = {
  attributes: {
    none: "DDA.DigimonProfile.Attribute.None",
    free: "DDA.DigimonProfile.Attribute.Free",
    virus: "DDA.DigimonProfile.Attribute.Virus",
    data: "DDA.DigimonProfile.Attribute.Data",
    vaccine: "DDA.DigimonProfile.Attribute.Vaccine",
    variable: "DDA.DigimonProfile.Attribute.Variable"
  },

  types: {
    slime: "DDA.DigimonProfile.Type.Slime",
    lesser: "DDA.DigimonProfile.Type.Lesser",
    animal: "DDA.DigimonProfile.Type.Animal",
    bird: "DDA.DigimonProfile.Type.Bird",
    beast: "DDA.DigimonProfile.Type.Beast",
    aquatic: "DDA.DigimonProfile.Type.Aquatic",
    plant: "DDA.DigimonProfile.Type.Plant",
    insect: "DDA.DigimonProfile.Type.Insect",
    machine: "DDA.DigimonProfile.Type.Machine",
    mutant: "DDA.DigimonProfile.Type.Mutant",
    dragon: "DDA.DigimonProfile.Type.Dragon",
    dinosaur: "DDA.DigimonProfile.Type.Dinosaur",
    holy: "DDA.DigimonProfile.Type.Holy",
    dark: "DDA.DigimonProfile.Type.Dark",
    spirit: "DDA.DigimonProfile.Type.Spirit",
    ancient: "DDA.DigimonProfile.Type.Ancient",
    other: "DDA.DigimonProfile.Type.Other"
  },

  roles: {
    none: "DDA.Wizard.Option.NotDefined",
    striker: "DDA.Wizard.Option.Striker",
    defender: "DDA.Wizard.Option.Defender",
    support: "DDA.Wizard.Option.Support",
    controller: "DDA.Wizard.Option.Controller",
    skirmisher: "DDA.Wizard.Option.Skirmisher",
    specialist: "DDA.Wizard.Option.Specialist",
    balanced: "DDA.Wizard.Option.Balanced"
  },

  fields: {
    none: "DDA.Wizard.Option.NotDefined",
    dragonsRoar: "DDA.DigimonProfile.Field.DragonsRoar",
    natureSpirits: "DDA.DigimonProfile.Field.NatureSpirits",
    deepSavers: "DDA.DigimonProfile.Field.DeepSavers",
    windGuardians: "DDA.DigimonProfile.Field.WindGuardians",
    metalEmpire: "DDA.DigimonProfile.Field.MetalEmpire",
    nightmareSoldiers: "DDA.DigimonProfile.Field.NightmareSoldiers",
    virusBusters: "DDA.DigimonProfile.Field.VirusBusters",
    jungleTroopers: "DDA.DigimonProfile.Field.JungleTroopers",
    darkArea: "DDA.DigimonProfile.Field.DarkArea",
    unknown: "DDA.DigimonProfile.Field.Unknown"
  },

  families: {
    none: "DDA.Wizard.Option.NotDefinedFeminine",
    dragon: "DDA.DigimonProfile.Family.Dragon",
    beast: "DDA.DigimonProfile.Family.Beast",
    aquatic: "DDA.DigimonProfile.Family.Aquatic",
    bird: "DDA.DigimonProfile.Family.Bird",
    insectPlant: "DDA.DigimonProfile.Family.InsectPlant",
    machine: "DDA.DigimonProfile.Family.Machine",
    holy: "DDA.DigimonProfile.Family.Holy",
    dark: "DDA.DigimonProfile.Family.Dark",
    humanoid: "DDA.DigimonProfile.Family.Humanoid",
    mutant: "DDA.DigimonProfile.Family.Mutant",
    spirit: "DDA.DigimonProfile.Family.Spirit",
    slime: "DDA.DigimonProfile.Family.Slime",
    other: "DDA.DigimonProfile.Family.Other"
  }
};
export class DDADigimonWizard extends Application {
  constructor(options = {}) {
    super(options);

    this.linkContext = options.linkContext ?? null;
    this.compatibilityQuestionnaireEnabled = getWorldSetting("enableHiddenCompatibilityQuestionnaire", false);
    this.stepIndex = 0;
    this._inputRenderTimeout = null;
    this._pendingScrollTop = null;
    this.mode = options.mode ?? "create";
this.formContext = options.formContext ?? null;

this.steps = [];

this._wizardDatabaseActors = [];
this._wizardDatabaseEntriesById = new Map();
this._wizardDatabaseEntriesByStageKey = new Map();
this._wizardDatabaseLoaded = false;
this._wizardDatabaseLoadPromise = null;

this._wizardStaticPortraitByKey = new Map();
this._wizardStaticPortraitIndexPromise = null;

    this.data = {
      creationMode: "existing",
      tutorialMode: true,
            buildTemplate: {
        enabled: false,
        selectedId: "",
        appliedId: "",
        applied: false,
        pendingChoices: {},
        resolvedChoices: {}
      },

      identity: {
        name: "",
        species: "",
        attribute: "",
        type: "",
        group: "",
        field: "",
        description: "",
        img: "systems/digimon-digital-adventures/assets/ui/Digimon-Logo-2.webp",
        portraitImg: "",
        tokenImg: "",
        source: null
      },

      partnerQuestions: {
        appearance: "",
        personality: "",
        favoriteFood: "",
        goals: "",
        protection: "",
        tactics: "",
        age: "",
        selfImage: "",
        separatedReaction: ""
      },

      stage: "child",

      initialLine: {
        baby1Id: "",
        baby2Id: "",
        rookieId: "",
        locked: true,
        source: "dda_initial_evolution_db_v0",
        status: ""
      },

      initialLineBrowser: {
  baby1: {
    mode: "suggested",
    searchTerm: ""
  },
  baby2: {
    mode: "suggested",
    searchTerm: ""
  },
  child: {
    mode: "suggested",
    searchTerm: ""
  }
},

      lineForms: {
  baby1: {
    stageKey: "baby1",
    id: "",
    species: "",
    originalName: "",
    attribute: "",
    type: "",
    group: "",
    field: "",
    img: "",
    portraitImg: "",
    tokenImg: "",
    custom: false,
    attacks: []
  },
  baby2: {
    stageKey: "baby2",
    id: "",
    species: "",
    originalName: "",
    attribute: "",
    type: "",
    group: "",
    field: "",
    img: "",
    portraitImg: "",
    tokenImg: "",
    custom: false,
    attacks: []
  },
  child: {
    stageKey: "child",
    id: "",
    species: "",
    originalName: "",
    attribute: "",
    type: "",
    group: "",
    field: "",
    img: "",
    portraitImg: "",
    tokenImg: "",
    custom: false,
    attacks: []
  }
},

      formAttacks: [],

      initialLineBuildStage: "baby1",

      initialLineBuilds: {
        baby1: null,
        baby2: null,
        child: null
      },
formBuilds: {
  activeStage: "child",
  order: ["baby1", "baby2", "child"],
  stages: {}
},
      dp: {
  base: 0,
  totalAvailable: 0,
  remaining: 0,
  spent: 0,
  negativeUsed: 0,
  negativeLimit: 0,

  freeQualityUsed: 0,
  freeQualityLimit: 0,

  coreDiscountBase: 0,
  coreDiscountUsed: 0,
  coreDiscountRemaining: 0
},


      stats: {
        movement: 1,
        attackSlots: 1,
        maxSize: "small"
      },

      statAllocation: {
        accuracy: {
          label: text("Acerto", "Accuracy"),
          description: text("Define quantos dados o Digimon rola para acertar ataques.", "Defines how many dice the Digimon rolls to hit attacks."),
          base: 1,
          spent: 0,
          total: 1
        },
        damage: {
          label: text("Dano", "Damage"),
          description: text("Define a força dos ataques que causam dano.", "Defines the strength of damage-dealing attacks."),
          base: 1,
          spent: 0,
          total: 1
        },
        dodge: {
          label: text("Esquiva", "Dodge"),
          description: text("Define quantos dados o Digimon rola para evitar ataques.", "Defines how many dice the Digimon rolls to avoid attacks."),
          base: 1,
          spent: 0,
          total: 1
        },
        armor: {
          label: text("Armadura", "Armor"),
          description: text("Reduz o dano recebido e ajuda a formar o CPU.", "Reduces incoming damage and helps calculate CPU."),
          base: 1,
          spent: 0,
          total: 1
        },
        health: {
          label: text("Saúde", "Health"),
          description: text("Define quantas Caixas de Ferimento o Digimon possui.", "Defines how many Wound Boxes the Digimon has."),
          base: 1,
          spent: 0,
          total: 1
        }
      },

      derivedStatsPreview: {
        bit: 1,
        dos: 1,
        ram: 1,
        cpu: 1,
        woundBoxes: 1,
        range: 3,
        effectiveLimit: 3,
        initiative: 1
      },

      qualities: {
        positive: [],
        negative: []
      },

      qualityBrowser: {
        searchTerm: "",
        activeTier: "all",
        activeCategory: "all",
        onlyAvailable: true
      },

      postCreate: {
        createTamer: false,
        linkPair: true,
        hidden: Boolean(this.linkContext?.tamerUuid)
      },

      compatibility: this._buildInitialCompatibilityData(),

      validation: {
        errors: [],
        warnings: []
      }
        };

    if (this.mode !== "formSnapshot") {
      const effectiveStartingStage = this._getEffectivePartnerStartingStage();

      this.data.partnerStartingStage = this._getPartnerStartingStageWizardData(effectiveStartingStage);
      this.data.stage = effectiveStartingStage;
      this.data.initialLineBuildStage = this._getOriginLineStageKey(effectiveStartingStage);
      this._initializeFormBuilds();
    }

    if (this.mode === "formSnapshot") {
      this.data.postCreate.createTamer = false;
      this.data.postCreate.hidden = true;
      this.data.postCreate.linkPair = true;
      this._initializeFormSnapshotData();
    }

this._rebuildSteps();
this._preloadWizardDatabase();
  }

async _loadWizardStaticPortraitIndex() {
  if (this._wizardStaticPortraitByKey?.size) {
    return this._wizardStaticPortraitByKey;
  }

  if (this._wizardStaticPortraitIndexPromise) {
    return this._wizardStaticPortraitIndexPromise;
  }

this._wizardStaticPortraitIndexPromise = (async () => {
  const index = new Map();
  const FilePickerClass = getDdaFilePickerClass();

  if (!FilePickerClass) {
    return index;
  }

  const result = await FilePickerClass.browse(
    "data",
    `${DDA_DIGIMON_IMAGE_BASE_PATH}/portraits`
  );

    for (const path of result?.files ?? []) {
      if (!/\.(webp|png|jpe?g)$/i.test(path)) continue;

      const fileName = String(path)
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "") ?? "";

      const key = normalizeDigimonLookupName(fileName);

      if (key && !index.has(key)) {
        index.set(key, path);
      }
    }

    this._wizardStaticPortraitByKey = index;
    return index;
  })().catch((error) => {
    console.warn(
      "DDA | Não foi possível indexar os portraits estáticos do wizard.",
      error
    );

    this._wizardStaticPortraitByKey = new Map();
    this._wizardStaticPortraitIndexPromise = null;

    return this._wizardStaticPortraitByKey;
  });

  return this._wizardStaticPortraitIndexPromise;
}

_getWizardStaticPortraitPathFromIndex(
  actor = {},
  portraitIndex = new Map()
) {
  const system = actor.system ?? {};
  const names = system.names ?? {};

  const stageKey = this._normalizeWizardStageKey(
    system.stage,
    ""
  );

  const stageTerms = {
    baby1: ["baby1", "baby i", "fresh"],
    baby2: ["baby2", "baby ii", "in training", "in-training"],
    child: ["child", "rookie"],
    adult: ["adult", "champion"],
    perfect: ["perfect", "ultimate"],
    ultimate: ["ultimate", "mega"]
  }[stageKey] ?? [];

  const rawCandidates = [
    system.sourceId,
    names.canonical,
    names.original,
    names.dub,
    system.species,
    actor.name,
    ...(Array.isArray(names.aliases) ? names.aliases : [])
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  const candidateKeys = new Set();

  for (const rawCandidate of rawCandidates) {
    const simplified = rawCandidate
      .replace(
        /\((?:baby\s*[i1]+|baby\s*ii|fresh|in[-\s]?training|child|rookie|adult|champion|perfect|ultimate|mega)\)/gi,
        " "
      )
      .replace(
        /[-_\s]+(?:baby\s*[i1]+|baby\s*ii|fresh|in[-\s]?training|child|rookie|adult|champion|perfect|ultimate|mega)$/gi,
        " "
      )
      .trim();

    for (const candidate of [rawCandidate, simplified]) {
      const normalized = normalizeDigimonLookupName(candidate);

      if (!normalized) continue;

      candidateKeys.add(normalized);

      for (const stageTerm of stageTerms) {
        candidateKeys.add(
          normalizeDigimonLookupName(
            `${candidate} ${stageTerm}`
          )
        );
      }
    }
  }

  for (const key of candidateKeys) {
    const path = portraitIndex.get(key);

    if (path) return path;
  }

  return "";
}

_getStaticPortraitPathFromDatabaseActor(
  actor = {},
  portraitIndex = new Map()
) {
  const system = actor.system ?? {};
  const names = system.names ?? {};

  const stageKey = this._normalizeWizardStageKey(
    system.stage,
    ""
  );

  const sourceId = String(
    system.sourceId ??
    names.canonical ??
    system.species ??
    actor.name ??
    ""
  ).trim();

  const overrideFileName =
    DDA_GENERAL_DATABASE_STATIC_PORTRAIT_FILE_OVERRIDES[
      `${stageKey}:${sourceId}`
    ];

  if (overrideFileName) {
    return `${DDA_DIGIMON_IMAGE_BASE_PATH}/portraits/${overrideFileName}`;
  }

  const indexedPortrait = this._getWizardStaticPortraitPathFromIndex(
    actor,
    portraitIndex
  );

  if (indexedPortrait) return indexedPortrait;

  const images = system.images ?? {};

  const candidates = [
    images.portraitImagePath,
    images.portrait,
    images.localImagePath,
    images.tokenImagePath,
    actor.img
  ];

  for (const candidate of candidates) {
    const rawPath = String(candidate ?? "").trim();

    if (!rawPath || /\.webm(?:$|[?#])/i.test(rawPath)) continue;

    if (!/\.(webp|png|jpe?g)(?:$|[?#])/i.test(rawPath)) continue;

    // Mantém o caminho real. Pode ser portraits/, adult/, perfect/ etc.
    return rawPath;
  }

  return "icons/svg/mystery-man.svg";
}

_buildWizardDatabaseEntry(
  actor = {},
  portraitIndex = new Map()
) {
  const system = actor.system ?? {};
  const names = system.names ?? {};

  const stageKey = this._normalizeWizardStageKey(
    system.stage,
    ""
  );

  const sourceId = String(
    system.sourceId ??
    names.canonical ??
    system.species ??
    actor.name ??
    ""
  ).trim();

  const databaseId = String(
    system.databaseId ??
    actor.databaseId ??
    `${stageKey}:${sourceId}`
  ).trim();

  const displayName = String(
    names.dub ??
    system.species ??
    actor.name ??
    sourceId
  ).trim();

  const originalName = String(
    names.original ??
    displayName
  ).trim();

  const aliases = Array.from(new Set([
    displayName,
    originalName,
    sourceId,
    ...(Array.isArray(names.aliases) ? names.aliases : [])
  ].filter(Boolean)));

  const img = this._getStaticPortraitPathFromDatabaseActor(
    actor,
    portraitIndex
  );

  return {
    id: databaseId,
    databaseId,
    sourceId,
    source: "generalDatabase",

    stageKey,
    displayName,
    original: originalName,
    dub: displayName,
    aliases,

    attribute: String(system.attribute ?? "none"),
    type: String(system.type ?? ""),
    family: String(system.family ?? ""),

    groups: Array.isArray(system.groups)
      ? system.groups
      : [],

    fieldIds: [
      system.fieldId,
      system.field
    ].filter(Boolean),

    img,

    // Não mantém fallback inventado da database antiga.
    imageFallbacks: "",

    evolutionCategory: String(
      system.evolutionCategory ?? "normal"
    ),

    isSpecialForm: Boolean(system.isSpecialForm),

    evolutionIndex: foundry.utils.deepClone(
      system.evolutionIndex ?? {}
    )
  };
}

_getWizardDatabaseEntryById(databaseId = "") {
  const cleanId = String(databaseId ?? "").trim();

  if (!cleanId) return null;

  return this._wizardDatabaseEntriesById.get(cleanId) ?? null;
}

_findWizardDatabaseEntry(stageKey = "", value = "") {
  const cleanStage = this._normalizeWizardStageKey(
    stageKey,
    ""
  );

  const cleanValue = normalizeDigimonLookupName(value);

  if (!cleanStage || !cleanValue) return null;

  return this._wizardDatabaseEntriesByStageKey.get(
    `${cleanStage}:${cleanValue}`
  ) ?? null;
}

async _preloadWizardDatabase() {
  if (this._wizardDatabaseLoaded) {
    return this._wizardDatabaseActors;
  }

  if (this._wizardDatabaseLoadPromise) {
    return this._wizardDatabaseLoadPromise;
  }

  this._wizardDatabaseLoadPromise = (async () => {
    const [actors, portraitIndex] = await Promise.all([
      DDADigimonDatabase.getAll(),
      this._loadWizardStaticPortraitIndex()
    ]);

    const entries = actors
      .map((actor) => {
        return this._buildWizardDatabaseEntry(
          actor,
          portraitIndex
        );
      })
      .filter((entry) => {
        return entry.stageKey &&
          DDA_NORMAL_PARTNER_LINE_STAGES.includes(entry.stageKey) &&
          entry.evolutionCategory === "normal" &&
          !entry.isSpecialForm;
      });

    this._wizardDatabaseActors = entries;
    this._wizardDatabaseEntriesById = new Map();
    this._wizardDatabaseEntriesByStageKey = new Map();

    for (const entry of entries) {
      this._wizardDatabaseEntriesById.set(
        entry.id,
        entry
      );

      const keys = [
        entry.id,
        entry.databaseId,
        entry.sourceId,
        entry.displayName,
        entry.original,
        entry.dub,
        ...(entry.aliases ?? [])
      ];

      for (const key of keys) {
        const normalized = normalizeDigimonLookupName(key);

        if (!normalized) continue;

        this._wizardDatabaseEntriesByStageKey.set(
          `${entry.stageKey}:${normalized}`,
          entry
        );
      }
    }

    this._wizardDatabaseLoaded = true;

    if (this.rendered) {
      this._renderPreservingScroll();
    }

    return entries;
  })().catch((error) => {
    console.error(
      "DDA | Não foi possível carregar a database geral no wizard.",
      error
    );

    this._wizardDatabaseLoaded = false;
    this._wizardDatabaseActors = [];
    this._wizardDatabaseEntriesById = new Map();
    this._wizardDatabaseEntriesByStageKey = new Map();
    this._wizardDatabaseLoadPromise = null;

    return [];
  });

  return this._wizardDatabaseLoadPromise;
}



  static async openCurrentFormWizard(tamerActor) {
    const formContext = await getCurrentPartnerFormWizardContext(tamerActor);
    if (!formContext) return null;

    const wizard = new this({
      mode: "formSnapshot",
      formContext
    });

    wizard.render(true);
    return wizard;
  }

    static async openFutureFormWizard(tamerActor, formTemplateActor) {
    const formContext = await getFuturePartnerFormWizardContext(
      tamerActor,
      formTemplateActor
    );

    if (!formContext) return null;

    formContext.isFutureForm = true;

    const wizard = new this({
      mode: "formSnapshot",
      formContext
    });

    wizard.render(true);
    return wizard;
  }

  _isFutureFormWizard() {
    return this.mode === "formSnapshot"
      && Boolean(this.formContext?.isFutureForm);
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "dda-digimon-wizard",
      title: text("Criar Digimon Parceiro", "Create Partner Digimon"),
      template: "systems/digimon-digital-adventures/templates/wizard/digimon-wizard.hbs",
      width: 900,
      height: 820,
      resizable: true,
      classes: ["dda", "dda-wizard"]
    });
  }

  get currentStep() {
    return this.steps[this.stepIndex];
  }

  get isFirstStep() {
    return this.stepIndex === 0;
  }

  get isLastStep() {
    return this.stepIndex === this.steps.length - 1;
  }

getData() {
  this._ensureCompatibilityIdentityResolved();

  if (this._usesInitialFormBuildsForMechanicalState()) {
    this._initializeFormBuilds();

  if (!["stats", "qualities"].includes(this.currentStep)) {
    this.data.formBuilds.activeStage = this._getPrimaryMechanicalBuildStage();
  }

    this._syncActiveFormBuildToGlobalState();
  } else {
    this._recalculateStageData();
  }

  this._validate();

  return {
      step: this.currentStep,
      stepIndex: this.stepIndex + 1,
      totalSteps: this.steps.length,

      isFirstStep: this.isFirstStep,
      isLastStep: this.isLastStep,

      data: this.data,
      formBuildView: this._getFormBuildViewData(),
      formBuildSummary: this._getFormBuildSummaryData(),
      formMode: this.mode === "formSnapshot",
      identityPixelArt: getDigimonPixelArtPath(this.data.identity?.species || this.data.identity?.name, this.data.stage),      wizardTitle: this.mode === "formSnapshot" ? game.i18n.localize("DDA.DigimonWizard.FormTitle") : game.i18n.localize("DDA.DigimonWizard.Title"),
      createButtonLabel: this.mode === "formSnapshot" ? game.i18n.localize("DDA.DigimonWizard.Button.SaveForm") : game.i18n.localize("DDA.DigimonWizard.Button.CreateDigimon"),

      progressLabel: this._getProgressLabel(),
      progressSteps: this._getProgressSteps(),

      identityOptions: this._getIdentityOptions(),
      identityLabels: this._getIdentityLabels(),
      identityFallbackHint: text(
        "Dados de perfil incompletos usam padrões seguros automaticamente: Atributo Livre, Tipo Slime e Campo Desconhecido. Você ainda pode ajustar tudo depois na ficha.",
        "Incomplete profile data uses safe defaults automatically: Free Attribute, Slime Type, and Unknown Field. You can still adjust everything later on the sheet."
      ),

      stageOptions: this._getStageOptions(),
      mainFormOptions: this._getMainFormOptions(),
      initialLineOptions: this._getInitialLineOptions(),
      buildTemplates: this._getBuildTemplateOptions(),
      buildTemplateChoices: this._getBuildTemplateChoicesViewData(),
      partnerQuestionsSummary: this._getPartnerQuestionsSummaryData(),
      guide: this._getGuideData(),
      compatibilityQuestions: this._getCompatibilityQuestions(),
      crestTendency: this._getCrestTendencyIndicators(),
      compatibilityRecommendations: this._getDigitamaRecommendations(),
      compatibilityFinalQuestion: this._getCompatibilityFinalQuestion(),
      questionnaireEnabled: this.compatibilityQuestionnaireEnabled,
      availableQualities: this._getFilteredQualities(),
      selectedQualityIds: this._getSelectedQualityIds(),
      qualityBrowser: this.data.qualityBrowser,
      qualityTiers: this._getQualityTiers(),
      qualityCategories: this._getQualityCategories()
          };
        }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("[data-action='next']").on("click", this._onNext.bind(this));
    html.find("[data-action='back']").on("click", this._onBack.bind(this));
    html.find("[data-action='create']").on("click", this._onCreate.bind(this));
    html.find("[data-action='toggle-tutorial']").on("click", this._onToggleTutorial.bind(this));
    html.find("[data-action='toggle-build-template']").on("change", this._onToggleBuildTemplate.bind(this));
    html.find("[data-action='select-build-template']").on("click", this._onSelectBuildTemplate.bind(this));
    html.find("[data-action='update-build-template-choice']").on("change", this._onUpdateBuildTemplateChoice.bind(this));
    html.find("[data-action='select-creation-mode']").on("click", this._onSelectCreationMode.bind(this));
    html.find("[data-action='select-main-form']").on("click", this._onSelectMainForm.bind(this));
    html.find("[data-action='select-line-form']").on("click", this._onSelectLineForm.bind(this));
    html.find("[data-line-search]").on("keydown change", this._onInitialLineSearch.bind(this));
    html.find("[data-line-mode]").on("click", this._onInitialLineMode.bind(this));
    html.find("[data-action='set-main-form']").on("click", this._onSetMainForm.bind(this));
    html.find("[data-action='select-line-form-image']").on("click", this._onSelectLineFormImage.bind(this));
    html.find("[data-action='questionnaire-choice']").on("click", this._onQuestionnaireChoice.bind(this));
    html.find("[data-compatibility-answer]").on("click", this._onCompatibilityAnswer.bind(this));
    html.find("[data-action='select-digitama']").on("click", this._onSelectDigitama.bind(this));
    html.find("[data-action='select-stage']").on("click", this._onSelectStage.bind(this));
    html.find("[data-action='select-form-build-stage']").on("click", this._onSelectFormBuildStage.bind(this));
    html.find("[data-action='select-initial-baby1']").on("click", this._onSelectInitialBaby1.bind(this));
    html.find("[data-action='select-initial-baby2']").on("click", this._onSelectInitialBaby2.bind(this));
    html.find("[data-action='select-initial-rookie']").on("click", this._onSelectInitialRookie.bind(this));
    html.find("[data-stat-increase]").on("click", this._onIncreaseStat.bind(this));
    html.find("[data-stat-decrease]").on("click", this._onDecreaseStat.bind(this));
    html.find("[data-action='add-quality']").on("click", this._onAddQuality.bind(this));
    html.find("[data-action='remove-quality']").on("click", this._onRemoveQuality.bind(this));
    html.find("[data-action='select-digimon-image']").on("click", this._onSelectDigimonImage.bind(this));

    html.find("input[data-path]:not([type='search']), textarea[data-path]").on("blur", this._onInputChange.bind(this));
    html.find("select[data-path], input[type='checkbox'][data-path]").on("change", this._onInputChange.bind(this));

    html.find("[data-quality-search]").on("keydown", this._onQualitySearch.bind(this));
    html.find("[data-tier-filter]").on("click", this._onTierFilter.bind(this));
    html.find("[data-category-filter]").on("click", this._onCategoryFilter.bind(this));
    html.find("[data-toggle-available]").on("click", this._onToggleAvailable.bind(this));

    this._restoreScrollPosition(html);
    this._scrollToPendingCompatibilityQuestion(html);
  }

async _onInputChange(event) {
  const input = event.currentTarget;
  const path = input.dataset.path;

  if (!path) return;

  let value = input.value;

  if (input.type === "checkbox") {
    value = input.checked;
  }

  foundry.utils.setProperty(this.data, path, value);
}

_buildTemplatesCanBeUsed() {
  if (this.mode === "formSnapshot") return false;

  const effectiveStage = this.data.partnerStartingStage?.effectiveStage
    || this._getEffectivePartnerStartingStage();

  return this._getInitialLineStageKey(effectiveStage || "child") === "child";
}

_getTemplateChoiceRankData(quality = null, choiceConfig = null, rankNumber = 1) {
  if (!quality || !choiceConfig) return null;

  const key = String(choiceConfig.key ?? "").trim();
  if (!key) return null;

  const options = Array.isArray(quality.choices?.options)
    ? quality.choices.options
    : [];

  const option = options.find((entry) => String(entry.key) === key) ?? {
    key,
    label: key
  };

  return {
    rank: rankNumber,
    key: option.key ?? key,
    label: option.label ?? key,
    originalLabel: option.originalLabel ?? "",
    derivedStat: option.derivedStat ?? "",
    attackId: option.attackId ?? "",
    attackName: option.attackName ?? "",
    attackTag: option.attackTag ?? "",
    effect: option.effect ?? "",
    pendingAttackChoice: Boolean(option.pendingAttackChoice),
    pendingAttackSlot: option.pendingAttackSlot ?? null,
    dataOptimization: option.dataOptimization ?? "",
    dataOptimizationLabel: option.dataOptimizationLabel ?? "",
    category: foundry.utils.deepClone(option.category ?? {}),
    grants: foundry.utils.deepClone(option.grants ?? {})
  };
}

_getTemplateSelectedRanks(templateQuality = {}, quality = null) {
  const selectedRanks = [];

  if (!quality?.choices?.required) return selectedRanks;

  const explicitChoices = Array.isArray(templateQuality.choices)
    ? templateQuality.choices
    : [];

  if (explicitChoices.length) {
    explicitChoices.forEach((choice, index) => {
      const rankChoice = this._getTemplateChoiceRankData(quality, choice, index + 1);
      if (rankChoice) selectedRanks.push(rankChoice);
    });

    return selectedRanks;
  }

  if (templateQuality.choice?.key) {
    const rankChoice = this._getTemplateChoiceRankData(quality, templateQuality.choice, 1);
    if (rankChoice) selectedRanks.push(rankChoice);
  }

  return selectedRanks;
}

_getNormalizedQualityCatalogIndex() {
  const index = new Map();

  const addKey = (key, quality) => {
    const normalized = normalizeDigimonLookupName(key);
    if (!normalized || index.has(normalized)) return;
    index.set(normalized, quality);
  };

  for (const quality of this._getAvailableQualities()) {
    addKey(quality.id, quality);
    addKey(quality.name, quality);
    addKey(quality.originalName, quality);

    if (Array.isArray(quality.aliases)) {
      for (const alias of quality.aliases) {
        addKey(alias, quality);
      }
    }

    if (Array.isArray(quality.originalNames)) {
      for (const originalName of quality.originalNames) {
        addKey(originalName, quality);
      }
    }

    if (Array.isArray(quality.localizedNames)) {
      for (const localizedName of quality.localizedNames) {
        addKey(localizedName, quality);
      }
    }
  }

  return index;
}

_getTemplateQualityDefinition(templateQuality = {}) {
  const catalogIndex = this._getNormalizedQualityCatalogIndex();

  const candidates = [
    templateQuality.qualityId,
    templateQuality.id,
    templateQuality.name,
    templateQuality.originalName
  ]
    .map((value) => normalizeDigimonLookupName(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    const quality = catalogIndex.get(candidate);
    if (quality) return quality;
  }

  return null;
}

_buildTemplateSelectedQuality(templateQuality = {}, quality = null, template = null) {
  if (!quality) return null;

  const rankValue = Math.max(1, Number(templateQuality.rank ?? 1));
  const selectedRanks = this._getTemplateSelectedRanks(templateQuality, quality);

  return {
    id: quality.id,
    name: quality.name,
    originalName: quality.originalName,
    section: quality.section,
    tier: quality.tier,
    originalTier: quality.originalTier,
    availability: foundry.utils.deepClone(quality.availability ?? {}),

    cost: this._calculateSelectedQualityCost(quality, rankValue),
    costData: foundry.utils.deepClone(quality.costData ?? {}),
    baseCost: this._getQualityBaseDpCost(quality),
    fullCost: this._getQualityFullCost(quality, rankValue),
    coreDiscountUsed: 0,
    discountedByCore: false,

    kind: quality.kind,
    grantsDp: quality.grantsDp,
    perRank: quality.perRank,
    coreDiscountAvailable: quality.coreDiscountAvailable,
    isCore: quality.isCore,
    isFree: quality.isFree,
    isNegative: quality.isNegative,
    countsAgainstFreeLimit: quality.countsAgainstFreeLimit,

    rank: {
      ...(foundry.utils.deepClone(quality.rank ?? {})),
      value: rankValue
    },
    rankLimit: foundry.utils.deepClone(quality.rankLimit ?? {}),

    category: foundry.utils.deepClone(quality.category ?? {}),
    stageRequirement: foundry.utils.deepClone(quality.stageRequirement ?? {}),
    requirements: foundry.utils.deepClone(quality.requirements ?? {}),
    incompatible: foundry.utils.deepClone(quality.incompatible ?? {}),
    requiredFor: foundry.utils.deepClone(quality.requiredFor ?? []),

    choices: {
      ...(foundry.utils.deepClone(quality.choices ?? {})),
      selectedRanks
    },

    attackModifier: foundry.utils.deepClone(quality.attackModifier ?? {}),
    grants: foundry.utils.deepClone(quality.grants ?? {}),
    activation: foundry.utils.deepClone(quality.activation ?? {}),
    uses: foundry.utils.deepClone(quality.uses ?? {}),

    effect: quality.effect,
    description: quality.description,

    wizard: {
      stage: "child",
      buildTemplateId: template?.id ?? "",
      buildTemplateQuality: true,
      requiresTemplateChoice: Boolean(templateQuality.requiresTemplateChoice),
      choiceType: templateQuality.choiceType ?? "",
      tag: templateQuality.tag ?? ""
    }
  };
}

_getTemplatePendingChoices(template = null, selectedQualities = []) {
  if (!template) return {};

  const qualitiesById = new Map(
    selectedQualities.map((quality) => [quality.id, quality])
  );

  const pending = {};

  for (const [index, templateQuality] of Object.entries(template.qualities ?? [])) {
    if (!templateQuality?.requiresTemplateChoice) continue;

    const selectedQuality = qualitiesById.get(templateQuality.qualityId);
    if (!selectedQuality) continue;

    const key = `${templateQuality.qualityId}:${index}`;

    pending[key] = {
      key,
      templateId: template.id,
      qualityId: templateQuality.qualityId,
      qualityName: selectedQuality.name,
      rank: Number(templateQuality.rank ?? selectedQuality.rank?.value ?? 1),
      choiceType: templateQuality.choiceType ?? "",
      tag: templateQuality.tag ?? "",
      recommendedOptions: foundry.utils.deepClone(templateQuality.recommendedOptions ?? []),
      templateChoices: foundry.utils.deepClone(templateQuality.choices ?? []),
      resolved: false,
      value: ""
    };
  }

  return pending;
}

_applySelectedBuildTemplateToChildBuild({ force = false } = {}) {
  if (!this.data.buildTemplate?.enabled) return false;
  if (!this._buildTemplatesCanBeUsed()) return false;

  const template = this._getSelectedBuildTemplate();
  if (!template) return false;

  if (
    !force &&
    this.data.buildTemplate?.applied &&
    this.data.buildTemplate?.appliedId === template.id
  ) {
    return true;
  }

  this._initializeFormBuilds();

  const build = this._getFormBuild("child");
  if (!build || build.locked) return false;

  const defaultAllocation = this._getDefaultStatAllocationForBuild("child");
  const statKeys = ["accuracy", "damage", "dodge", "armor", "health"];

  build.statAllocation = foundry.utils.deepClone(defaultAllocation);

  for (const statKey of statKeys) {
    const spent = Math.max(0, Number(template.stats?.[statKey] ?? 0));

    build.statAllocation[statKey] ??= foundry.utils.deepClone(defaultAllocation[statKey]);
    build.statAllocation[statKey].spent = spent;
    build.statAllocation[statKey].total = Number(build.statAllocation[statKey].base ?? 0) + spent;
  }

  build.qualities = {
    positive: [],
    negative: []
  };

  const selectedQualities = [];
  const missingQualities = [];

  for (const templateQuality of template.qualities ?? []) {
    const quality = this._getTemplateQualityDefinition(templateQuality);

    if (!quality) {
      missingQualities.push(templateQuality.qualityId ?? templateQuality.name ?? templateQuality.originalName ?? "unknown");
      continue;
    }

    const selectedQuality = this._buildTemplateSelectedQuality(templateQuality, quality, template);
    if (!selectedQuality) continue;

    selectedQualities.push(selectedQuality);

    const list = selectedQuality.kind === "negative"
      ? build.qualities.negative
      : build.qualities.positive;

    list.push(selectedQuality);
  }

  build.template = {
    enabled: true,
    id: template.id,
    name: getLocalizedValue(template.name, template.id),
    appliedAt: new Date().toISOString(),
    missingQualities
  };

  this.data.buildTemplate.applied = true;
  this.data.buildTemplate.appliedId = template.id;
  this.data.buildTemplate.pendingChoices = this._getTemplatePendingChoices(template, selectedQualities);
  this.data.buildTemplate.resolvedChoices = {};

  this.data.formBuilds.activeStage = "child";

  this._recalculateFormBuild(build);
  this._syncActiveFormBuildToGlobalState();

  const blockingMissing = missingQualities.filter((qualityId) => {
    const templateQuality = (template.qualities ?? []).find((entry) => entry.qualityId === qualityId);
    return !templateQuality?.optionalIfMissing;
  });

  if (blockingMissing.length) {
    ui.notifications.warn(text(
      `Algumas Qualidades do template não foram encontradas: ${blockingMissing.join(", ")}.`,
      `Some template Qualities were not found: ${blockingMissing.join(", ")}.`
    ));
  }

  return true;
}

_getBuildTemplateChildBuild() {
  this._initializeFormBuilds();
  return this.data.formBuilds?.stages?.child ?? null;
}

_getBuildTemplateChildQualities() {
  const build = this._getBuildTemplateChildBuild();

  return [
    ...(Array.isArray(build?.qualities?.positive) ? build.qualities.positive : []),
    ...(Array.isArray(build?.qualities?.negative) ? build.qualities.negative : [])
  ];
}

_getBuildTemplateQualityById(qualityId = "") {
  const normalized = normalizeDigimonLookupName(qualityId);

  return this._getBuildTemplateChildQualities().find((quality) => {
    return [
      quality.id,
      quality.name,
      quality.originalName
    ]
      .map((value) => normalizeDigimonLookupName(value))
      .includes(normalized);
  }) ?? null;
}

_getBuildTemplatePendingEntries() {
  return Object.values(this.data.buildTemplate?.pendingChoices ?? {})
    .filter((entry) => entry && typeof entry === "object");
}

_getBuildTemplateResolvedChoice(choiceKey = "") {
  return this.data.buildTemplate?.resolvedChoices?.[choiceKey] ?? "";
}

_setBuildTemplateResolvedChoice(choiceKey = "", value = "") {
  this.data.buildTemplate ??= {};
  this.data.buildTemplate.resolvedChoices ??= {};

  if (!String(value ?? "").trim()) {
    delete this.data.buildTemplate.resolvedChoices[choiceKey];
    return;
  }

  this.data.buildTemplate.resolvedChoices[choiceKey] = String(value);
}

_getTemplateSelectedRankForPendingChoice(quality = null, pending = null, rankNumber = 1) {
  const selectedRanks = Array.isArray(quality?.choices?.selectedRanks)
    ? quality.choices.selectedRanks
    : [];

  const byRank = selectedRanks.find((choice) => Number(choice.rank ?? 0) === Number(rankNumber));
  if (byRank) return byRank;

  const byIndex = selectedRanks[rankNumber - 1];
  if (byIndex) return byIndex;

  const templateChoice = Array.isArray(pending?.templateChoices)
    ? pending.templateChoices[rankNumber - 1]
    : null;

  if (templateChoice?.key) {
    return this._getTemplateChoiceRankData(quality, templateChoice, rankNumber);
  }

  return {
    rank: rankNumber,
    key: "",
    label: "",
    originalLabel: "",
    attackId: "",
    attackName: "",
    attackTag: "",
    effect: ""
  };
}

_getTemplatePendingRankNumbers(pending = null, quality = null) {
  if (Array.isArray(pending?.templateChoices) && pending.templateChoices.length) {
    return pending.templateChoices.map((_choice, index) => index + 1);
  }

  const selectedRanks = Array.isArray(quality?.choices?.selectedRanks)
    ? quality.choices.selectedRanks
    : [];

  if (selectedRanks.length) {
    return selectedRanks.map((choice, index) => Number(choice.rank ?? index + 1));
  }

  const rank = Math.max(1, Number(pending?.rank ?? 1));
  return Array.from({ length: rank }, (_entry, index) => index + 1);
}

_getTemplateAreaAppliesTo(choice = {}) {
  const appliesTo = String(choice.appliesTo ?? "");

  if (appliesTo === "rangeAttack") return "oneRangedAttack";
  if (appliesTo === "meleeAttack") return "oneMeleeAttack";
  if (appliesTo === "meleeOrRangeAttack") return "oneAttack";

  return "oneAttack";
}

_getTemplateAttackChoiceOptionsForPending(pending = null, quality = null, rankChoice = null) {
  const choiceType = String(pending?.choiceType ?? "");
  const attacks = this._getWizardAttackItemsForChoices();

  if (choiceType === "attack") {
    return this._getAttackChoiceOptionsForQuality(quality, []);
  }

  if (choiceType === "effectAttack") {
    const tag = String(rankChoice?.key || pending?.tag || "").trim().toLowerCase();
    if (!tag) return [];

    return attacks
      .filter((attack) => this._attackMatchesQualityAppliesTo(attack, "oneAttack"))
      .map((attack) => ({
        key: `${attack.id}:${tag}`,
        label: `${attack.name} — [${tag.toUpperCase()}]`,
        originalLabel: attack.name,
        attackId: attack.id,
        attackName: attack.name,
        attackTag: tag,
        effect: text(
          `${attack.name} recebe [${tag.toUpperCase()}].`,
          `${attack.name} gains [${tag.toUpperCase()}].`
        )
      }));
  }

  if (choiceType === "areaAttack") {
    const rawTag = String(rankChoice?.key || pending?.tag || "").trim().toLowerCase();
    if (!rawTag) return [];

    const tag = rawTag.startsWith("t:") ? rawTag : `t:${rawTag}`;
    const appliesTo = this._getTemplateAreaAppliesTo(rankChoice);

    return attacks
      .filter((attack) => this._attackMatchesQualityAppliesTo(attack, appliesTo))
      .map((attack) => ({
        key: `${attack.id}:${tag}`,
        label: `${attack.name} — [${tag.toUpperCase()}]`,
        originalLabel: attack.name,
        attackId: attack.id,
        attackName: attack.name,
        attackTag: tag,
        effect: text(
          `${attack.name} recebe [${tag.toUpperCase()}].`,
          `${attack.name} gains [${tag.toUpperCase()}].`
        )
      }));
  }

  return [];
}

_getTemplateOptionChoiceOptionsForPending(pending = null, quality = null) {
  const recommended = Array.isArray(pending?.recommendedOptions)
    ? pending.recommendedOptions.map((entry) => String(entry).toLowerCase())
    : [];

  const options = Array.isArray(quality?.choices?.options)
    ? quality.choices.options
    : [];

  return options
    .filter((option) => {
      if (!recommended.length) return true;
      return recommended.includes(String(option.key ?? "").toLowerCase());
    })
    .map((option) => ({
      key: String(option.key ?? ""),
      label: option.label ?? option.originalLabel ?? option.key,
      originalLabel: option.originalLabel ?? "",
      effect: option.effect ?? "",
      derivedStat: option.derivedStat ?? "",
      category: foundry.utils.deepClone(option.category ?? {}),
      grants: foundry.utils.deepClone(option.grants ?? {})
    }))
    .filter((option) => option.key);
}

_getBuildTemplateChoiceOptionRows(pending = null, quality = null, rankNumber = 1) {
  const rankChoice = this._getTemplateSelectedRankForPendingChoice(quality, pending, rankNumber);
  const choiceType = String(pending?.choiceType ?? "");
  const currentValue = this._getBuildTemplateResolvedChoice(`${pending.key}:${rankNumber}`);

  let rawOptions = [];

  if (choiceType === "option") {
    rawOptions = this._getTemplateOptionChoiceOptionsForPending(pending, quality);
  } else {
    rawOptions = this._getTemplateAttackChoiceOptionsForPending(pending, quality, rankChoice);
  }

  return rawOptions.map((option) => {
    const value = option.key;
    const label = option.originalLabel
      ? `${option.label} (${option.originalLabel})`
      : option.label;

    return {
      value,
      label,
      selected: String(currentValue) === String(value),
      choiceData: option
    };
  });
}

_getBuildTemplateChoicesViewData() {
  const pendingEntries = this._getBuildTemplatePendingEntries();
  const rows = [];

  for (const pending of pendingEntries) {
    const quality = this._getBuildTemplateQualityById(pending.qualityId);
    if (!quality) continue;

    const rankNumbers = this._getTemplatePendingRankNumbers(pending, quality);

    for (const rankNumber of rankNumbers) {
      const choiceKey = `${pending.key}:${rankNumber}`;
      const options = this._getBuildTemplateChoiceOptionRows(pending, quality, rankNumber);
      const selectedValue = this._getBuildTemplateResolvedChoice(choiceKey);

      const rankChoice = this._getTemplateSelectedRankForPendingChoice(quality, pending, rankNumber);
      const tagLabel = String(rankChoice?.label || rankChoice?.key || pending.tag || "").trim();

      rows.push({
        choiceKey,
        qualityId: quality.id,
        qualityName: quality.name,
        originalName: quality.originalName ?? "",
        rankNumber,
        choiceType: pending.choiceType ?? "",
        tagLabel,
        selectedValue,
        resolved: Boolean(selectedValue),
        hasOptions: options.length > 0,
        options,
        hint: this._getBuildTemplateChoiceHint(pending, quality, rankChoice)
      });
    }
  }

  return {
    enabled: Boolean(this.data.buildTemplate?.enabled),
    hasChoices: rows.length > 0,
    resolved: rows.filter((row) => row.resolved).length,
    total: rows.length,
    complete: rows.every((row) => row.resolved || !row.hasOptions),
    rows
  };
}

_getBuildTemplateChoiceHint(pending = null, quality = null, rankChoice = null) {
  const choiceType = String(pending?.choiceType ?? "");

  if (choiceType === "option") {
    return text(
      `Escolha a opção registrada para ${quality?.name ?? "esta Qualidade"}.`,
      `Choose the option recorded for ${quality?.name ?? "this Quality"}.`
    );
  }

  const tag = String(rankChoice?.label || rankChoice?.key || pending?.tag || "").trim();

  if (tag) {
    return text(
      `Escolha qual ataque receberá ${tag}.`,
      `Choose which attack will receive ${tag}.`
    );
  }

  return text(
    "Escolha qual ataque receberá esta Qualidade.",
    "Choose which attack will receive this Quality."
  );
}

_allBuildTemplateChoicesResolved() {
  const view = this._getBuildTemplateChoicesViewData();

  if (!view.hasChoices) return true;

  return view.rows.every((row) => {
    if (!row.hasOptions) return true;
    return Boolean(this._getBuildTemplateResolvedChoice(row.choiceKey));
  });
}

_makeTemplateAttackChoiceData(option = {}, rankChoice = {}, rankNumber = 1) {
  const attackTag = String(option.attackTag ?? rankChoice.attackTag ?? "").trim().toLowerCase();
  const label = option.label ?? rankChoice.label ?? option.key ?? "";

  return {
    ...foundry.utils.deepClone(rankChoice ?? {}),
    rank: rankNumber,
    key: option.key ?? rankChoice.key ?? "",
    label,
    originalLabel: option.originalLabel ?? option.attackName ?? rankChoice.originalLabel ?? "",
    attackId: option.attackId ?? "",
    attackName: option.attackName ?? "",
    attackTag,
    effect: option.effect ?? rankChoice.effect ?? "",
    pendingAttackChoice: false,
    pendingAttackSlot: null
  };
}

_applyResolvedBuildTemplateChoicesToChildBuild() {
  const build = this._getBuildTemplateChildBuild();
  if (!build) return false;

  const pendingEntries = this._getBuildTemplatePendingEntries();

  for (const pending of pendingEntries) {
    const quality = this._getBuildTemplateQualityById(pending.qualityId);
    if (!quality) continue;

    quality.choices ??= {};
    quality.choices.selectedRanks = Array.isArray(quality.choices.selectedRanks)
      ? foundry.utils.deepClone(quality.choices.selectedRanks)
      : [];

    const rankNumbers = this._getTemplatePendingRankNumbers(pending, quality);

    for (const rankNumber of rankNumbers) {
      const choiceKey = `${pending.key}:${rankNumber}`;
      const value = this._getBuildTemplateResolvedChoice(choiceKey);
      if (!value) continue;

      const options = this._getBuildTemplateChoiceOptionRows(pending, quality, rankNumber);
      const option = options.find((entry) => String(entry.value) === String(value));
      if (!option) continue;

      const currentRankChoice = this._getTemplateSelectedRankForPendingChoice(quality, pending, rankNumber);

      let nextChoice;

      if (pending.choiceType === "option") {
        nextChoice = this._getTemplateChoiceRankData(quality, option.choiceData, rankNumber);
      } else {
        nextChoice = this._makeTemplateAttackChoiceData(option.choiceData, currentRankChoice, rankNumber);
      }

      const existingIndex = quality.choices.selectedRanks.findIndex((choice, index) => {
        return Number(choice.rank ?? index + 1) === Number(rankNumber);
      });

      if (existingIndex >= 0) {
        quality.choices.selectedRanks[existingIndex] = nextChoice;
      } else {
        quality.choices.selectedRanks.push(nextChoice);
      }
    }

    quality.choices.selectedRanks.sort((a, b) => Number(a.rank ?? 0) - Number(b.rank ?? 0));
  }

  this._recalculateFormBuild(build);

  this.data.formBuilds.activeStage = "child";
  this._syncActiveFormBuildToGlobalState();

  return true;
}

async _onUpdateBuildTemplateChoice(event) {
  event.preventDefault();

  const choiceKey = String(event.currentTarget?.dataset?.choiceKey ?? "").trim();
  const value = String(event.currentTarget?.value ?? "").trim();

  if (!choiceKey) return;

  this._setBuildTemplateResolvedChoice(choiceKey, value);
  this._applyResolvedBuildTemplateChoicesToChildBuild();

  this.render(false);
}

_getBuildTemplateOptions() {
  const selectedId = String(this.data.buildTemplate?.selectedId ?? "").trim();
  const enabled = Boolean(this.data.buildTemplate?.enabled) && this._buildTemplatesCanBeUsed();

  return DDA_DIGIMON_BUILD_TEMPLATES.map((template) => ({
    ...foundry.utils.deepClone(template),
    selected: template.id === selectedId,
    nameLabel: getLocalizedValue(template.name, template.id),
    subtitleLabel: getLocalizedValue(template.subtitle, ""),
    descriptionLabel: getLocalizedValue(template.description, "")
  }));
}

_getSelectedBuildTemplate() {
  const selectedId = String(this.data.buildTemplate?.selectedId ?? "").trim();
  return DDA_DIGIMON_BUILD_TEMPLATE_INDEX[selectedId] ?? null;
}

_resetBuildTemplateSelection({ keepEnabled = true } = {}) {
  this.data.buildTemplate ??= {};

  this.data.buildTemplate.selectedId = "";
  this.data.buildTemplate.appliedId = "";
  this.data.buildTemplate.applied = false;
  this.data.buildTemplate.pendingChoices = {};
  this.data.buildTemplate.resolvedChoices = {};

  if (!keepEnabled) {
    this.data.buildTemplate.enabled = false;
  }
}

async _onToggleBuildTemplate(event) {
  event.preventDefault();

  const enabled = Boolean(event.currentTarget?.checked);

  this.data.buildTemplate ??= {};
  this.data.buildTemplate.enabled = enabled;

  if (!enabled) {
    this._resetBuildTemplateSelection({ keepEnabled: false });
  }

  this._rebuildSteps();
  this.render(false);
}

async _onSelectBuildTemplate(event) {
  event.preventDefault();

  if (!this._buildTemplatesCanBeUsed()) {
    ui.notifications.warn(text(
      "As builds prontas deste grimório são feitas para Digimon Criança/Rookie.",
      "These ready-made builds are made for Child/Rookie Digimon."
    ));
    return;
  }

  const templateId = String(event.currentTarget?.dataset?.templateId ?? "").trim();

  if (!templateId || !DDA_DIGIMON_BUILD_TEMPLATE_INDEX[templateId]) {
    ui.notifications.warn(text(
      "Template de build não encontrado.",
      "Build template not found."
    ));
    return;
  }

  this.data.buildTemplate ??= {};
  this.data.buildTemplate.enabled = true;
  this.data.buildTemplate.selectedId = templateId;
  this.data.buildTemplate.applied = false;
  this.data.buildTemplate.appliedId = "";
  this.data.buildTemplate.pendingChoices = {};
  this.data.buildTemplate.resolvedChoices = {};

  this.render(false);
}

async _onToggleTutorial(event) {
  event.preventDefault();

  this.data.tutorialMode = !this.data.tutorialMode;
  this.render(false);
}

async _onSelectCreationMode(event) {
  event.preventDefault();

  const mode = String(event.currentTarget.dataset.mode ?? "").trim();
  if (!["existing", "custom"].includes(mode)) return;

  this.data.creationMode = mode;

  if (mode === "custom") {
    this.data.identity.source = null;
  }

  this.render(false);
}

async _onSelectMainForm(event) {
  event.preventDefault();

  const stageKey = this._getInitialLineStageKey(
    event.currentTarget.dataset.stageKey
    ?? this.data.stage
    ?? "child"
  );

  const digimonId = String(
    event.currentTarget.dataset.digimonId ?? ""
  ).trim();

  const entry =
    getInitialDigimonById(digimonId)
    ?? this._getWizardDatabaseEntryById(digimonId)
    ?? this._findWizardDatabaseEntry(stageKey, digimonId);

  if (!entry) {
    ui.notifications.warn(text(
      "Não foi possível encontrar esse Digimon na database.",
      "Could not find this Digimon in the database."
    ));
    return;
  }

this.data.stage = stageKey;

// Uma espécie principal nova começa uma linha normal nova.
// Sem isso, Bebê II/Rookie e dados visuais antigos podem sobreviver.
this._resetNormalLineForNewMainForm(stageKey);

this._setLineFormFromEntry(stageKey, entry, {
    preserveImages: false
  });

  // Mantém a compatibilidade com a linha inicial já existente.
  if (stageKey === "baby1") this.data.initialLine.baby1Id = entry.id;
  if (stageKey === "baby2") this.data.initialLine.baby2Id = entry.id;
  if (stageKey === "child") this.data.initialLine.rookieId = entry.id;

  this._completeInitialLineAroundMainStage();

  this._applyLineFormToIdentity(stageKey, {
    preserveName: true
  });

  this._renderPreservingScroll();
}

async _onInitialLineSearch(event) {
  if (event.type === "keydown" && event.key !== "Enter") return;

  event.preventDefault();

  const input = event.currentTarget;
  const stageKey = this._getInitialLineStageKey(input.dataset.stageKey ?? "child");

  this.data.initialLineBrowser ??= {};
  this.data.initialLineBrowser[stageKey] ??= { mode: "suggested", searchTerm: "" };
  this.data.initialLineBrowser[stageKey].searchTerm = String(input.value ?? "").trim();

  this._renderPreservingScroll();
}

async _onInitialLineMode(event) {
  event.preventDefault();

  const button = event.currentTarget;
  const stageKey = this._getInitialLineStageKey(button.dataset.stageKey ?? "child");
  const mode = String(button.dataset.lineMode ?? "suggested").trim();

  if (!["suggested", "all"].includes(mode)) return;

  this.data.initialLineBrowser ??= {};
  this.data.initialLineBrowser[stageKey] ??= { mode: "suggested", searchTerm: "" };
  this.data.initialLineBrowser[stageKey].mode = mode;

  this._renderPreservingScroll();
}

async _onSelectLineForm(event) {
  event.preventDefault();

  const stageKey = String(event.currentTarget.dataset.stageKey ?? "").trim();
  const digimonId = String(event.currentTarget.dataset.digimonId ?? "").trim();

  if (!["baby1", "baby2", "child"].includes(stageKey)) return;

  if (stageKey === "baby1" && this._isQuestionnaireBaby1Locked()) {
  ui.notifications.warn(text(
    "Este Bebê I nasceu do questionário de compatibilidade e não pode ser alterado.",
    "This Baby I was born from the compatibility questionnaire and cannot be changed."
  ));
  return;
}

  const entry = getInitialDigimonById(digimonId);
  if (!entry) return;

  this._setLineFormFromEntry(stageKey, entry, { preserveImages: false });

  if (stageKey === "baby1") this.data.initialLine.baby1Id = entry.id;
  if (stageKey === "baby2") this.data.initialLine.baby2Id = entry.id;
  if (stageKey === "child") this.data.initialLine.rookieId = entry.id;

  this._completeInitialLineAroundMainStage();

  if (stageKey === this.data.stage) {
    this._applyLineFormToIdentity(stageKey, { preserveName: true });
  }

  this._renderPreservingScroll();
}

async _onSetMainForm(event) {
  event.preventDefault();

  this._syncInputsFromHtml();

  const stageKey = this._getInitialLineStageKey(event.currentTarget.dataset.stageKey ?? "child");
  const form = this._getLineForm(stageKey);

if (this.mode === "formSnapshot") {
  this.data.stage = stageKey;

  if (form?.species?.trim()) {
    this._applyLineFormToIdentity(stageKey, { preserveName: true });
  }
} else {
  const effectiveStage = this.data.partnerStartingStage?.effectiveStage
    || this._getEffectivePartnerStartingStage();

  const originLineStage = this._getOriginLineStageKey(effectiveStage);
  const originForm = this._getLineForm(originLineStage);

  this.data.stage = effectiveStage;

  if (originForm?.species?.trim()) {
    this._applyLineFormToIdentity(originLineStage, { preserveName: true });
  }
}

  this._recalculateStageData();
  this._renderPreservingScroll();
}

async _onSelectLineFormImage(event) {
event.preventDefault();

const stageKey = String(
event.currentTarget.dataset.stageKey ?? this.data.stage ?? "child"
).trim();

const imageKind = String(
event.currentTarget.dataset.imageKind ?? "portrait"
).trim();

if (!this.data.lineForms?.[stageKey]) return;

const FilePickerClass = getDdaFilePickerClass();

if (!FilePickerClass) {
  ui.notifications.warn(
    text(
      "O seletor de arquivos do Foundry não está disponível.",
      "The Foundry file picker is not available."
    )
  );
  return;
}

const currentPath =
imageKind === "token"
? this.data.lineForms[stageKey].tokenImg ||
this.data.lineForms[stageKey].img
: this.data.lineForms[stageKey].img ||
this.data.identity.img;

const updateImage = (path) => {
if (!path) return;


if (imageKind === "token") {
  // Token continua independente do portrait.
  this.data.lineForms[stageKey].tokenImg = path;

  if (stageKey === this.data.stage) {
    this.data.identity.tokenImg = path;
  }
} else {
  // O wizard mostra imagem estática.
  // portraitImg registra que esta forma recebeu uma escolha manual.
  this.data.lineForms[stageKey].img = path;
  this.data.lineForms[stageKey].portraitImg = path;

  if (stageKey === this.data.stage) {
    this.data.identity.img = path;
    this.data.identity.portraitImg = path;
  }
}

this._renderPreservingScroll();


};

const picker = new FilePickerClass({
type: "image",
current: currentPath ||
"systems/digimon-digital-adventures/assets/digimon",
callback: updateImage,
top: (this.position?.top ?? 100) + 40,
left: (this.position?.left ?? 100) + 40
});

picker.render(true);
}


async _onSelectFormBuildStage(event) {
  event.preventDefault();

  if (!this._usesInitialFormBuildsForMechanicalState()) return;

  const stageKey = this._getInitialLineStageKey(event.currentTarget.dataset.stage ?? "");
  const order = this.data.formBuilds?.order ?? [];

  if (!order.includes(stageKey)) return;

  this._syncInputsFromHtml();
  this._syncGlobalStateToActiveFormBuild();

  this.data.formBuilds.activeStage = stageKey;

  this._syncActiveFormBuildToGlobalState();
  this._renderPreservingScroll();
}

async _onSelectStage(event) {
  event.preventDefault();

  const button = event.currentTarget;
  const stage = button.dataset.stage;

  if (!stage) return;

  const selectedStage = this._normalizeWizardStageKey(stage);

if (this._isStageLockedByStartingStage(selectedStage)) {
  ui.notifications.warn(game.i18n.format("DDA.DigimonWizard.Stage.LockedByStartingStage", {
    stage: this.data.partnerStartingStage?.effectiveLabel ?? this._getStageLabel(this._getEffectivePartnerStartingStage())
  }));
  return;
}

this.data.stage = selectedStage;

  const originLineStage = this._getOriginLineStageKey(this.data.stage);
const form = this.data.lineForms?.[originLineStage];
  if (form?.species) {
    this._applyLineFormToIdentity(originLineStage, { preserveName: true });
  } else {
    this.data.identity.species = "";
    this.data.identity.attribute = "";
    this.data.identity.type = "";
    this.data.identity.group = "";
    this.data.identity.field = "";
    this.data.identity.img = "systems/digimon-digital-adventures/assets/ui/Digimon-Logo-2.webp";
    this.data.identity.portraitImg = "";
    this.data.identity.tokenImg = "";
    this.data.identity.source = null;
  }

  this._recalculateStageData();
  this.render(false);
}

  async _onSelectInitialBaby1(event) {
    event.preventDefault();

    const baby1Id = String(event.currentTarget.dataset.baby1Id ?? "").trim();
    if (!baby1Id) return;

    const baby1 = getInitialDigimonById(baby1Id);
    if (!baby1) return;

    this.data.initialLine.baby1Id = baby1Id;
    this.data.initialLine.baby2Id = "";
    this.data.initialLine.rookieId = "";

    this.data.stage = "baby1";
    this.data.identity.species = getInitialEvolutionDisplayName(baby1);
    this.data.identity.name = this.data.identity.name?.trim() || getInitialEvolutionDisplayName(baby1);
    this.data.identity.attribute = baby1.attribute || "none";
    this.data.identity.field = Array.isArray(baby1.fieldIds) && baby1.fieldIds.length ? baby1.fieldIds[0] : "unknown";
    this.data.identity.type = baby1.type || "slime";
    this.data.identity.group = baby1.family || baby1.type || "";

    const img = getInitialEvolutionEntryImage(baby1, "");
    if (img && img !== "icons/svg/mystery-man.svg") {
      this.data.identity.img = img;
    }

    const baby2Options = this._getInitialBaby2OptionsForSelectedBaby1();
    const primaryBaby2 = baby2Options.find((option) => option.rank === "primary") ?? baby2Options[0];

    if (primaryBaby2?.id) {
      this.data.initialLine.baby2Id = primaryBaby2.id;

      const rookieOptions = this._getInitialRookieOptionsForSelectedBaby2();
      const primaryRookie = rookieOptions.find((option) => option.rank === "primary") ?? rookieOptions[0];

      if (primaryRookie?.id) {
        this.data.initialLine.rookieId = primaryRookie.id;
      }
    }

    this._applyInitialLineEntryToIdentityForStage(this.data.stage || "baby1");
    this._recalculateStageData();
    this._renderPreservingScroll();
  }

  async _onSelectInitialBaby2(event) {
    event.preventDefault();

    const baby2Id = String(event.currentTarget.dataset.baby2Id ?? "").trim();
    if (!baby2Id) return;

    this.data.initialLine.baby2Id = baby2Id;

    const rookieOptions = this._getInitialRookieOptionsForSelectedBaby2();
    const currentRookieId = String(this.data.initialLine.rookieId ?? "").trim();

    if (!rookieOptions.some((option) => option.id === currentRookieId)) {
      const primary = rookieOptions.find((option) => option.rank === "primary") ?? rookieOptions[0];
      this.data.initialLine.rookieId = primary?.id ?? "";
    }

    this._applyInitialLineEntryToIdentityForStage(this.data.stage || "baby1");
    this._renderPreservingScroll();
  }

  async _onSelectInitialRookie(event) {
    event.preventDefault();

    const rookieId = String(event.currentTarget.dataset.rookieId ?? "").trim();
    if (!rookieId) return;

    this.data.initialLine.rookieId = rookieId;
    this._applyInitialLineEntryToIdentityForStage(this.data.stage || "baby1");
    this._renderPreservingScroll();
  }

async _onIncreaseStat(event) {
  event.preventDefault();

  const statKey = event.currentTarget.dataset.statIncrease;

  if (!statKey) return;

  if (this._usesInitialFormBuildsForMechanicalState()) {
    const activeBuild = this._getActiveFormBuild();

    if (activeBuild?.locked) {
      ui.notifications.warn(text(
        "Esta forma possui uma build fixa e não pode receber ajustes de PD.",
        "This form has a fixed build and cannot receive DP adjustments."
      ));
      return;
    }

    this._syncActiveFormBuildToGlobalState();
  } else {
    this._recalculateStageData();
  }

  const stat = this.data.statAllocation?.[statKey];

  if (!stat) return;

  if (Number(this.data.dp?.remaining ?? 0) <= 0) {
    ui.notifications.warn(text(
      "Você não possui PD restante para aumentar este atributo.",
      "You do not have remaining DP to increase this stat."
    ));
    return;
  }

  stat.spent = Number(stat.spent ?? 0) + 1;
  stat.total = Number(stat.base ?? 0) + Number(stat.spent ?? 0);

  if (this._usesInitialFormBuildsForMechanicalState()) {
    this._syncGlobalStateToActiveFormBuild();
    this._syncActiveFormBuildToGlobalState();
  } else {
    this._recalculateStageData();
  }

  this._renderPreservingScroll();
}

async _onDecreaseStat(event) {
  event.preventDefault();

  const statKey = event.currentTarget.dataset.statDecrease;

  if (!statKey) return;

  if (this._usesInitialFormBuildsForMechanicalState()) {
    const activeBuild = this._getActiveFormBuild();

    if (activeBuild?.locked) {
      ui.notifications.warn(text(
        "Esta forma possui uma build fixa e não pode receber ajustes de PD.",
        "This form has a fixed build and cannot receive DP adjustments."
      ));
      return;
    }

    this._syncActiveFormBuildToGlobalState();
  }

  const stat = this.data.statAllocation?.[statKey];

  if (!stat) return;

  const currentSpent = Number(stat.spent ?? 0);

  if (currentSpent <= 0) return;

  stat.spent = currentSpent - 1;
  stat.total = Number(stat.base ?? 0) + Number(stat.spent ?? 0);

  if (this._usesInitialFormBuildsForMechanicalState()) {
    this._syncGlobalStateToActiveFormBuild();
    this._syncActiveFormBuildToGlobalState();
  } else {
    this._recalculateStageData();
  }

  this._renderPreservingScroll();
}

async _onNext(event) {
    event.preventDefault();
    const previousStep = this.currentStep;

    this._syncInputsFromHtml();
    if (this._usesInitialFormBuildsForMechanicalState() && ["stats", "qualities"].includes(previousStep)) {
      this._syncGlobalStateToActiveFormBuild();
    }
    this._syncLineFormsFromWizardData();
    this._completeInitialLineAroundMainStage();
    this._rebuildSteps();
    this._validate();

    if (!this._canAdvance()) {
      if (this.currentStep === "compatibility") {
        this._pendingCompatibilityScrollQuestionId = this._getFirstUnansweredCompatibilityQuestionId();
      }

      ui.notifications.warn(this.data.validation.errors[0] ?? "Revise esta etapa antes de continuar.");
      this.render(false);
      return;
    }

    if (!this.isLastStep) {
      if (previousStep === "buildTemplate") {
        const applied = this._applySelectedBuildTemplateToChildBuild({ force: true });

        if (!applied) {
          ui.notifications.warn(text(
            "Não foi possível aplicar a build pronta. Escolha outro template ou desative a opção.",
            "Could not apply the ready-made build. Choose another template or disable the option."
          ));
          this.render(false);
          return;
        }
      }

      if (previousStep === "templateChoices") {
  if (!this._allBuildTemplateChoicesResolved()) {
    ui.notifications.warn(text(
      "Resolva todas as escolhas da build antes de continuar.",
      "Resolve all build choices before continuing."
    ));
    this.render(false);
    return;
  }

  this._applyResolvedBuildTemplateChoicesToChildBuild();
}

      this.stepIndex += 1;

      if (this._usesInitialFormBuildsForMechanicalState() && ["stats", "qualities", "buildTemplate", "templateChoices"].includes(previousStep)) {
        this.data.formBuilds.activeStage = this._getPrimaryMechanicalBuildStage();
        this._syncActiveFormBuildToGlobalState();
      }

      this.render(false);
    }
  }

  async _onBack(event) {
    event.preventDefault();

    this._syncInputsFromHtml();
    if (this._usesInitialFormBuildsForMechanicalState() && ["stats", "qualities"].includes(this.currentStep)) {
  this._syncGlobalStateToActiveFormBuild();
}

    if (!this.isFirstStep) {
      this.stepIndex -= 1;
      this.render(false);
    }
  }

async _onCreate(event) {
  event.preventDefault();

  if (this.mode === "formSnapshot") {
    return this._onSaveFormSnapshot(event);
  }

    this._syncInputsFromHtml();

    if (this._usesInitialFormBuildsForMechanicalState()) {
      this._syncGlobalStateToActiveFormBuild();
      this.data.formBuilds.activeStage = this._getPrimaryMechanicalBuildStage();
      this._syncActiveFormBuildToGlobalState();
    }

    this._syncLineFormsFromWizardData();
    this._completeInitialLineAroundMainStage();
    this._applyLineFormToIdentity(this.data.stage, { preserveName: true });
    this._ensureIdentityFallbacks({ resolveSource: true });
    this._validate();

  if (this.data.validation.errors.length > 0) {
    ui.notifications.warn(this.data.validation.errors[0]);
    this.render(false);
    return;
  }

const isCompatibilityBaby1Flow = this._isCompatibilityBaby1Flow();

if (isCompatibilityBaby1Flow) {
  this._applyCompatibilityBaby1Defaults();
}

await this._applySpeciesDataFromCompendium(
  this.data.identity.species || this.data.compatibility?.digitama?.name,
  this.data.compatibility?.digitama?.fileName || this.data.identity.species,
  { forceName: Boolean(this.data.compatibility?.digitama) }
);

if (isCompatibilityBaby1Flow) {
  this._applyCompatibilityBaby1Defaults();
}
this._syncLineFormsFromWizardData();
this._completeInitialLineAroundMainStage();
this._applyLineFormToIdentity(this.data.stage, { preserveName: true });

if (this._usesInitialFormBuildsForMechanicalState()) {
  this.data.formBuilds.activeStage = this._getPrimaryMechanicalBuildStage();
  this._syncActiveFormBuildToGlobalState();
} else {
  this._recalculateStageData();
}

await this._resolveAutomaticTokensForInitialLine();

this._applyLineFormToIdentity(this.data.stage, {
  preserveName: true
});

const actorData = this._buildActorData();

const actor = await Actor.create(actorData);
await ensureActorOwner(actor, game.user?.id);

const selectedQualities = isCompatibilityBaby1Flow
  ? []
  : [
      ...this.data.qualities.positive,
      ...this.data.qualities.negative
    ];

const currentAttackStage = this._usesInitialFormBuildsForMechanicalState()
  ? this._getPrimaryMechanicalBuildStage()
  : this.data.stage;

const attackItems = this._getLineAttackItemsForStage(currentAttackStage);

const qualityItems = selectedQualities.map((quality) => {
  return this._buildQualityItemDataFromSelection(quality);
});

const embeddedItems = [
  ...attackItems,
  ...qualityItems
];

const createdItems = embeddedItems.length
  ? await actor.createEmbeddedDocuments("Item", embeddedItems)
  : [];

await this._resolveWizardQualityAttackChoices(actor, createdItems);

await this._finalizeInitialEvolutionLineForCreatedActor(actor);

  await this._linkWithPendingTamer(actor);

  ui.notifications.info(text(`${actor.name} foi criado com sucesso.`, `${actor.name} was created successfully.`));

  const shouldOpenTamerWizard = this.mode !== "formSnapshot"
    && !this.linkContext?.tamerUuid
    && Boolean(this.data.postCreate?.createTamer);

  this.close();

  actor.sheet?.render(true);

  if (shouldOpenTamerWizard) {
    await this._openTamerWizardAfterCreate(actor);
  }
}

async _onQualitySearch(event) {
  if (event.key !== "Enter") return;

  event.preventDefault();

  const input = event.currentTarget;

  this.data.qualityBrowser.searchTerm = input.value ?? "";

  this._renderPreservingScroll();
}

async _onSelectDigimonImage(event) {
  event.preventDefault();

  const FilePickerClass = getDdaFilePickerClass();

if (!FilePickerClass) {
    ui.notifications.warn(
      text(
        "O seletor de arquivos do Foundry não está disponível.",
        "The Foundry file picker is not available."
      )
    );
    return;
  }

  const updateImage = (path) => {
    if (!path) return;

    const stageKey = this._getInitialLineStageKey(
      this.data.stage || "child"
    );

    const form = this._getLineForm(stageKey);

    // O wizard trabalha apenas com imagem estática.
    // portraitImg registra que houve uma escolha manual.
    this.data.identity.img = path;
    this.data.identity.portraitImg = path;

    if (form) {
      form.img = path;
      form.portraitImg = path;
    }

    this._renderPreservingScroll();
  };

  const picker = new FilePickerClass({
    type: "image",
    current: this.data.identity.img ||
      "systems/digimon-digital-adventures/assets/digimon",
    callback: updateImage,
    top: (this.position?.top ?? 100) + 40,
    left: (this.position?.left ?? 100) + 40
  });

  picker.render(true);
}

async _onTierFilter(event) {
  event.preventDefault();

  const button = event.currentTarget;
  const tier = button.dataset.tierFilter;

  if (!tier) return;

  this.data.qualityBrowser.activeTier = tier;
  this._renderPreservingScroll();
}

async _onCategoryFilter(event) {
  event.preventDefault();

  const button = event.currentTarget;
  const category = button.dataset.categoryFilter;

  if (!category) return;

  this.data.qualityBrowser.activeCategory = category;
  this._renderPreservingScroll();
}

async _onToggleAvailable(event) {
  event.preventDefault();

  this.data.qualityBrowser.onlyAvailable = !this.data.qualityBrowser.onlyAvailable;
  this._renderPreservingScroll();
}

_getLivePartnerItemsForFormWizard() {
  const partnerActor = this.formContext?.partnerActor ?? null;

  if (!partnerActor?.items) return [];

  return partnerActor.items.map((item) => {
    const data = item.toObject();
    delete data._id;
    return data;
  });
}

_getFormWizardSourceItems() {
  const snapshot = this.formContext?.snapshot ?? {};

  // Uma forma futura só lê o próprio rascunho.
  // Nunca pode copiar os itens vivos do parceiro atual.
  if (this._isFutureFormWizard()) {
    return Array.isArray(snapshot.items)
      ? foundry.utils.deepClone(snapshot.items)
      : [];
  }

  const liveItems = this._getLivePartnerItemsForFormWizard();

  if (liveItems.length) return liveItems;

  return Array.isArray(snapshot.items)
    ? foundry.utils.deepClone(snapshot.items)
    : [];
}

_getFutureFormAttackSlotCount(stageKey = this.data.stage) {
  const cleanStage = this._normalizeWizardStageKey(stageKey, "child");

  const stageData = this._getStageOptions().find((entry) => {
    return entry.key === cleanStage;
  });

  return Math.max(1, Number(stageData?.attacks ?? 1));
}

_normalizeFutureFormAttackSlot(attack = {}) {
  const system = attack?.system ?? {};

  const rangeType = String(
    system.baseTags?.rangeType ??
    system.rangeType ??
    "melee"
  ).toLowerCase();

  const functionType = String(
    system.baseTags?.functionType ??
    system.functionType ??
    (system.support?.enabled ? "support" : "damage")
  ).toLowerCase();

  return {
    name: String(attack?.name ?? "").trim(),
    rangeType: rangeType === "range" ? "range" : "melee",
    functionType: functionType === "support" ? "support" : "damage"
  };
}

_initializeFutureFormAttackSlots(items = []) {
  const slotCount = this._getFutureFormAttackSlotCount();
  const existingSlots = Array.isArray(this.data.formAttacks)
    ? this.data.formAttacks
    : [];

  const sourceSlots = existingSlots.length
    ? existingSlots
    : (Array.isArray(items) ? items : [])
      .filter((item) => item?.type === "attack")
      .map((item) => this._normalizeFutureFormAttackSlot(item));

  this.data.formAttacks = Array.from(
    { length: slotCount },
    (_entry, index) => this._normalizeFutureFormAttackSlot(sourceSlots[index])
  );

  return this.data.formAttacks;
}

_getFutureFormAttackItems(stageKey = this.data.stage) {
  return this._initializeFutureFormAttackSlots()
    .map((attack, index) => {
      return this._buildAttackItemDataFromLineAttack(
        stageKey,
        attack,
        index
      );
    })
    .filter(Boolean);
}

_initializeFormSnapshotData() {
  this.data.postCreate.createTamer = false;
  this.data.postCreate.hidden = true;

  const context = this.formContext ?? {};
  const snapshot = context.snapshot ?? {};
  const templateActor = context.formTemplateActor ?? null;
  const partnerActor = context.partnerActor ?? null;

  const stageKey = snapshot.stage || templateActor?.system?.stage || partnerActor?.system?.stage || "child";
  const defaultBase = Math.max(1, this._getStageValue(stageKey));
  const mainStats = snapshot.mainStats ?? partnerActor?.system?.mainStats ?? {};

  this.data.identity.name = snapshot.name || partnerActor?.name || templateActor?.name || "Digimon";
  this.data.identity.species = snapshot.species || partnerActor?.system?.species || templateActor?.system?.species || templateActor?.name || "Digimon";
  this.data.identity.attribute = snapshot.attribute || partnerActor?.system?.attribute || templateActor?.system?.attribute || "data";
  this.data.identity.type = snapshot.type || partnerActor?.system?.type || templateActor?.system?.type || "";
  this.data.identity.group = snapshot.group || partnerActor?.system?.group || templateActor?.system?.group || "";
  this.data.identity.field = snapshot.field || partnerActor?.system?.field || templateActor?.system?.field || "none";
  this.data.identity.description = snapshot.profile?.personality || partnerActor?.system?.profile?.personality || "";
  this.data.identity.img = snapshot.img || templateActor?.img || partnerActor?.img || this.data.identity.img;
  this.data.identity.portraitImg = snapshot.portraitImg || "";
  this.data.identity.tokenImg =
    snapshot.tokenImg ||
    templateActor?.prototypeToken?.texture?.src ||
    templateActor?.img ||
    partnerActor?.prototypeToken?.texture?.src ||
    partnerActor?.img ||
    "";
  this.data.identity.source = templateActor?.uuid ?? snapshot.sourceFormUuid ?? "";
  this.data.stage = stageKey;

  for (const key of ["accuracy", "damage", "dodge", "armor", "health"]) {
    const stat = this.data.statAllocation[key];
    if (!stat) continue;
    const base = Number(mainStats[key]?.base ?? defaultBase);
    stat.base = defaultBase;
    stat.spent = Math.max(0, base - defaultBase);
    stat.total = defaultBase + stat.spent;
  }

  this.data.qualities.positive = [];
  this.data.qualities.negative = [];

const items = this._getFormWizardSourceItems();
  if (this._isFutureFormWizard()) {
    this._initializeFutureFormAttackSlots(items);
  }

for (const item of items.filter((entry) => entry.type === "quality")) {
  const quality = this._selectionFromQualityItem(item);
  if (!quality) continue;
  if (quality.isNegative || quality.tier === "negative") this.data.qualities.negative.push(quality);
  else this.data.qualities.positive.push(quality);
}

  this._recalculateStageData();
}

_selectionFromQualityItem(itemData) {
  const system = itemData.system ?? {};
  const sourceId = system.sourceId ?? "";
  const catalog = DDA_DIGIMON_QUALITIES.find((entry) => entry.id === sourceId);
  const rankValue = Math.max(1, Number(system.rank?.value ?? 1));
  const tier = catalog?.tier ?? system.tier ?? "starting";
  const fallbackQuality = { ...system, id: sourceId || itemData.name, name: itemData.name, tier, cost: system.cost ?? {} };
  const qualityData = catalog ?? fallbackQuality;
  const isNegative = tier === "negative";

  return {
    ...(catalog ? this._prepareQualityForBrowser(catalog) : {}),
    id: sourceId || itemData.name,
    name: itemData.name,
    originalName: system.originalName ?? catalog?.originalName ?? "",
    tier,
    section: system.section ?? catalog?.section ?? "",
    category: system.category ?? catalog?.category ?? {},
    costData: system.cost ?? catalog?.cost ?? {},
    rank: { ...(system.rank ?? catalog?.rank ?? {}), value: rankValue },
    rankLimit: system.rankLimit ?? catalog?.rankLimit ?? null,
    stageRequirement: system.stageRequirement ?? catalog?.stageRequirement ?? {},
    requirements: system.requirements ?? catalog?.requirements ?? {},
    incompatible: system.incompatible ?? catalog?.incompatible ?? {},
    requiredFor: system.requiredFor ?? catalog?.requiredFor ?? [],
    choices: system.choices ?? catalog?.choices ?? {},
    attackModifier: system.attackModifier ?? catalog?.attackModifier ?? {},
    grants: system.grants ?? catalog?.grants ?? {},
    activation: system.activation ?? catalog?.activation ?? {},
    uses: system.uses ?? catalog?.uses ?? {},
    effect: system.effect ?? catalog?.effect ?? "",
    description: system.description ?? catalog?.description ?? "",
    isNegative,
    cost: this._calculateSelectedQualityCost(qualityData, rankValue),
    fullCost: this._getQualityFullCost(qualityData, rankValue)
  };
}

async _onSaveFormSnapshot(event) {
  event.preventDefault();

  this._syncInputsFromHtml();
  this._recalculateStageData();
  this._validate();

  if (this.data.validation.errors.length > 0) {
    ui.notifications.warn(this.data.validation.errors[0]);
    this.render(false);
    return;
  }

  const context = this.formContext ?? {};
  const partnerActor = context.partnerActor;
  const formTemplateActor = context.formTemplateActor ?? partnerActor;
  const existingSnapshot = context.snapshot ?? {};
  const selectedQualities = [...this.data.qualities.positive, ...this.data.qualities.negative];

  const stageKey = this.data.stage || formTemplateActor?.system?.stage || partnerActor?.system?.stage || "child";
  const stageData = this._getStageOptions().find((entry) => entry.key === stageKey) ?? this._getStageOptions()[0];

const preservedAttacks = this._isFutureFormWizard()
  ? this._getFutureFormAttackItems(stageKey)
  : this._getFormWizardSourceItems()
    .filter((item) => item.type === "attack");


  const qualityItems = selectedQualities.map((quality) => this._buildQualityItemDataFromSelection(quality));

  const snapshot = {
    ...(existingSnapshot ?? {}),
    sourceFormUuid: formTemplateActor?.uuid || existingSnapshot.sourceFormUuid || partnerActor.uuid,
    sourceFormName: formTemplateActor?.name || existingSnapshot.sourceFormName || this.data.identity.name,
    name: this.data.identity.name || formTemplateActor?.name || partnerActor.name,
    img: this.data.identity.img || formTemplateActor?.img || partnerActor.img,
    portraitImg:
  this.data.identity.portraitImg
  || existingSnapshot.portraitImg
  || "",

tokenImg:
  this.data.identity.tokenImg
  || existingSnapshot.tokenImg
  || formTemplateActor?.system?.evolution?.tokenImg
  || formTemplateActor?.prototypeToken?.texture?.src
  || formTemplateActor?.img
  || partnerActor.img,
    species: this.data.identity.species || formTemplateActor?.system?.species || partnerActor.system?.species || this.data.identity.name,
    stage: stageKey,
    stageValue: this._getStageValue(stageKey),
    size: existingSnapshot.size || formTemplateActor?.system?.size || partnerActor.system?.size || stageData?.maxSize || "medium",
    type: this.data.identity.type || formTemplateActor?.system?.type || partnerActor.system?.type || "",
    attribute: this.data.identity.attribute || formTemplateActor?.system?.attribute || partnerActor.system?.attribute || "data",
    field: this.data.identity.field || formTemplateActor?.system?.field || partnerActor.system?.field || "none",
    family: existingSnapshot.family || formTemplateActor?.system?.family || partnerActor.system?.family || "none",
    group: this.data.identity.group || formTemplateActor?.system?.group || partnerActor.system?.group || "",
    profile: {
      ...(existingSnapshot.profile ?? partnerActor.system?.profile ?? {}),
      personality: this.data.identity.description || existingSnapshot.profile?.personality || partnerActor.system?.profile?.personality || ""
    },
    mainStats: {
      accuracy: this._buildMainStatData(this.data.statAllocation.accuracy),
      damage: this._buildMainStatData(this.data.statAllocation.damage),
      dodge: this._buildMainStatData(this.data.statAllocation.dodge),
      armor: this._buildMainStatData(this.data.statAllocation.armor),
      health: this._buildMainStatData(this.data.statAllocation.health)
    },
    miscStats: {
      movement: {
        label: "DDA.Resource.Movement",
        base: Number(this.data.stats.movement ?? stageData?.movement ?? 0),
        bonus: Number(existingSnapshot.miscStats?.movement?.bonus ?? partnerActor.system?.miscStats?.movement?.bonus ?? 0),
        value: Number(this.data.stats.movement ?? stageData?.movement ?? 0),
        total: Number(this.data.stats.movement ?? stageData?.movement ?? 0)
      }
    },
    creation: {
      ...(existingSnapshot.creation ?? partnerActor.system?.creation ?? {}),
      dp: {
        base: Number(this.data.dp.base ?? 0),
        bonus: Number(this.data.dp.bonus ?? 0),
        negative: Number(this.data.dp.negativeUsed ?? 0),
        total: Number(this.data.dp.totalAvailable ?? 0),
        spentBaseStats: this._getSpentStatDp(),
        spentBaseQualities: selectedQualities.reduce((total, quality) => total + Number(quality.cost ?? 0), 0),
        spentBonusStats: 0,
        spentBonusQualities: 0,
        spentTotal: Number(this.data.dp.spent ?? 0),
        remaining: Number(this.data.dp.remaining ?? 0)
      },
coreDiscount: {
  base: Number(this.data.dp.coreDiscountBase ?? 0),
  used: Number(this.data.dp.coreDiscountUsed ?? 0),
  spent: Number(this.data.dp.coreDiscountUsed ?? 0),
  remaining: Number(this.data.dp.coreDiscountRemaining ?? 0)
},
      buildStyle: "formWizard"
    },
    qualityLimits: {
      freeQualities: { used: Number(this.data.dp.freeQualityUsed ?? 0), max: Number(this.data.dp.freeQualityLimit ?? 0) },
      negativeDp: { used: Number(this.data.dp.negativeUsed ?? 0), max: Number(this.data.dp.negativeLimit ?? 0) }
    },
    wizard: {
      ...(existingSnapshot.wizard ?? {}),
      editedByFormWizard: true,
      editedAt: new Date().toISOString(),
      statAllocation: foundry.utils.deepClone(this.data.statAllocation),
      derivedStatsPreview: foundry.utils.deepClone(this.data.derivedStatsPreview)
    },
    items: [...preservedAttacks, ...qualityItems]
  };

  if (this._isFutureFormWizard()) {
  await savePartnerFutureFormSnapshot({
    partnerActor,
    formTemplateActor,
    snapshot
  });
} else {
  await savePartnerFormWizardSnapshot({
    tamerActor: context.tamerActor,
    partnerActor,
    formTemplateActor,
    snapshot
  });
}



  ui.notifications.info(game.i18n.format("DDA.Info.FormSnapshotSaved", { form: snapshot.name, partner: partnerActor.name }));
  this.close();
  partnerActor.sheet?.render(true);
  context.tamerActor?.sheet?.render(false);
}

_getInitialFormBuildStageKeys() {
  return ["baby1", "baby2", "child"];
}

_getBuildableFormStagesForStartingStage(stageKey = this.data.stage) {
  const originLineStage = this._getOriginLineStageKey(stageKey);
  const order = this._getInitialFormBuildStageKeys();
  const index = Math.max(0, order.indexOf(originLineStage));

  return order.slice(0, index + 1);
}

_getStageOption(stageKey = "child") {
  const cleanStage = this._normalizeWizardStageKey(stageKey, "child");
  return this._getStageOptions().find((entry) => entry.key === cleanStage) ?? null;
}

_getDefaultStatAllocationForBuild(stageKey = "child") {
  const cleanStage = this._getInitialLineStageKey(stageKey);
  const baseValue = cleanStage === "baby1"
    ? 1
    : Math.max(1, this._getStageValue(cleanStage));

  const statKeys = ["accuracy", "damage", "dodge", "armor", "health"];

  return Object.fromEntries(
    statKeys.map((statKey) => {
      const template = this.data.statAllocation?.[statKey] ?? {};

      return [
        statKey,
        {
          label: template.label ?? statKey,
          description: template.description ?? "",
          base: baseValue,
          spent: 0,
          total: baseValue
        }
      ];
    })
  );
}

_createDefaultFormBuild(stageKey = "child") {
  const cleanStage = this._getInitialLineStageKey(stageKey);
  const stageData = this._getStageOption(cleanStage) ?? {};
  const isBaby1 = cleanStage === "baby1";

  const startingDp = isBaby1 ? 0 : Number(stageData.startingDp ?? 0);
  const movement = isBaby1 ? 2 : Number(stageData.movement ?? 0);
  const attackSlots = isBaby1 ? 1 : Number(stageData.attacks ?? 1);
  const maxSize = isBaby1 ? "small" : String(stageData.maxSize ?? "medium");

  const build = {
    stageKey: cleanStage,
    locked: isBaby1,
    editable: !isBaby1,

    dp: {
      base: startingDp,
      bonus: 0,
      totalAvailable: startingDp,
      remaining: startingDp,
      spent: 0,
      negativeUsed: 0,
      negativeLimit: isBaby1 ? 0 : Number(stageData.negativeLimit ?? 0),

      freeQualityUsed: 0,
      freeQualityLimit: isBaby1 ? 0 : Number(stageData.freeQualityLimit ?? 0),

      coreDiscountBase: isBaby1 ? 0 : this._getCoreDiscountBase(cleanStage),
      coreDiscountUsed: 0,
      coreDiscountRemaining: isBaby1 ? 0 : this._getCoreDiscountBase(cleanStage)
    },

    stats: {
      movement,
      attackSlots,
      maxSize
    },

    statAllocation: this._getDefaultStatAllocationForBuild(cleanStage),

    derivedStatsPreview: {
      bit: 1,
      dos: 1,
      ram: 1,
      cpu: 1,
      woundBoxes: 1,
      range: 3,
      effectiveLimit: 3,
      initiative: 1
    },

    qualities: {
      positive: [],
      negative: []
    },

    attacks: []
  };

  return this._recalculateFormBuild(build);
}

_recalculateFormBuildQualityCosts(build = null) {
  if (!build) return { used: 0, remaining: 0 };

  const stageKey = this._getInitialLineStageKey(build.stageKey);
  const isBaby1 = stageKey === "baby1";

  build.qualities ??= { positive: [], negative: [] };
  build.qualities.positive = Array.isArray(build.qualities.positive) ? build.qualities.positive : [];
  build.qualities.negative = Array.isArray(build.qualities.negative) ? build.qualities.negative : [];

  if (isBaby1) {
    build.qualities.positive = [];
    build.qualities.negative = [];
    return { used: 0, remaining: 0 };
  }

  let remainingCoreDiscount = Number(build.dp?.coreDiscountBase ?? this._getCoreDiscountBase(stageKey));
  let usedCoreDiscount = 0;

  for (const quality of build.qualities.positive) {
    const rankValue = Number(quality.rank?.value ?? 1);
    const fullCost = this._getQualityFullCost(quality, rankValue);

    let coreDiscountUsed = 0;

    if (this._isCoreDiscountEligible(quality) && fullCost > 0 && remainingCoreDiscount > 0) {
      coreDiscountUsed = Math.min(remainingCoreDiscount, fullCost);
      remainingCoreDiscount -= coreDiscountUsed;
      usedCoreDiscount += coreDiscountUsed;
    }

    quality.fullCost = fullCost;
    quality.coreDiscountUsed = coreDiscountUsed;
    quality.discountedByCore = coreDiscountUsed > 0;
    quality.cost = Math.max(0, fullCost - coreDiscountUsed);
  }

  return {
    used: usedCoreDiscount,
    remaining: remainingCoreDiscount
  };
}

_recalculateFormBuildDerivedStats(build = null) {
  if (!build) return null;

  const stats = build.statAllocation ?? {};
  const derived = build.derivedStatsPreview ?? {};
  const stageKey = this._getInitialLineStageKey(build.stageKey);
  const stageValue = this._getStageValue(stageKey);

  const accuracy = Number(stats.accuracy?.total ?? 1);
  const damage = Number(stats.damage?.total ?? 1);
  const dodge = Number(stats.dodge?.total ?? 1);
  const armor = Number(stats.armor?.total ?? 1);
  const health = Number(stats.health?.total ?? 1);

  derived.bit = Math.max(1, Math.floor(accuracy / 3));
  derived.dos = Math.max(1, Math.floor(damage / 3));
  derived.ram = Math.max(1, Math.floor(dodge / 3));
  derived.cpu = Math.max(1, Math.floor(armor / 3));

  derived.woundBoxes = stageValue + (health * 2);
  derived.range = 3 + derived.bit;
  derived.effectiveLimit = derived.range + stageValue;
  derived.initiative = derived.ram;

  build.derivedStatsPreview = derived;
  return derived;
}

_recalculateFormBuild(build = null) {
  if (!build) return null;

  const stageKey = this._getInitialLineStageKey(build.stageKey);
  const stageData = this._getStageOption(stageKey) ?? {};
  const isBaby1 = stageKey === "baby1";

  build.dp ??= {};
  build.stats ??= {};
  build.qualities ??= { positive: [], negative: [] };
  build.statAllocation ??= this._getDefaultStatAllocationForBuild(stageKey);

  if (isBaby1) {
    build.locked = true;
    build.editable = false;
    build.dp.base = 0;
    build.dp.bonus = 0;
    build.dp.totalAvailable = 0;
    build.dp.remaining = 0;
    build.dp.spent = 0;
    build.dp.negativeUsed = 0;
    build.dp.negativeLimit = 0;
    build.dp.freeQualityUsed = 0;
    build.dp.freeQualityLimit = 0;
    build.dp.coreDiscountBase = 0;
    build.dp.coreDiscountUsed = 0;
    build.dp.coreDiscountRemaining = 0;

    build.stats.movement = 2;
    build.stats.attackSlots = 1;
    build.stats.maxSize = "small";

    build.qualities.positive = [];
    build.qualities.negative = [];

    for (const stat of Object.values(build.statAllocation)) {
      stat.base = 1;
      stat.spent = 0;
      stat.total = 1;
    }

    this._recalculateFormBuildDerivedStats(build);
    return build;
  }

  for (const stat of Object.values(build.statAllocation)) {
    stat.base = Math.max(1, this._getStageValue(stageKey));
    stat.spent = Math.max(0, Number(stat.spent ?? 0));
    stat.total = Number(stat.base ?? 0) + Number(stat.spent ?? 0);
  }

  build.dp.base = Number(stageData.startingDp ?? build.dp.base ?? 0);
  build.dp.bonus = 0;

  build.dp.coreDiscountBase = this._getCoreDiscountBase(stageKey);
  const coreDiscount = this._recalculateFormBuildQualityCosts(build);

  const spentStats = Object.values(build.statAllocation).reduce((total, stat) => {
    return total + Number(stat.spent ?? 0);
  }, 0);

  const spentQualities = build.qualities.positive.reduce((total, quality) => {
    return total + Number(quality.cost ?? 0);
  }, 0);

  const bonusFromNegativeQualities = build.qualities.negative.reduce((total, quality) => {
    return total + Number(quality.cost ?? 0);
  }, 0);

  const freeQualityUsed = [
    ...build.qualities.positive,
    ...build.qualities.negative
  ].reduce((total, quality) => {
    if (!this._isFreeQuality(quality)) return total;
    if (!this._qualityCountsAgainstFreeLimit(quality)) return total;
    return total + Math.max(1, Number(quality.rank?.value ?? 1));
  }, 0);

  const totalAvailable = Number(build.dp.base ?? 0) + bonusFromNegativeQualities;
  const spentPositive = spentStats + spentQualities;

  build.dp.totalAvailable = totalAvailable;
  build.dp.spent = spentPositive;
  build.dp.remaining = totalAvailable - spentPositive;
  build.dp.negativeUsed = bonusFromNegativeQualities;
  build.dp.negativeLimit = Number(stageData.negativeLimit ?? 0);
  build.dp.freeQualityUsed = freeQualityUsed;
  build.dp.freeQualityLimit = Number(stageData.freeQualityLimit ?? 0);
  build.dp.coreDiscountUsed = coreDiscount.used;
  build.dp.coreDiscountRemaining = coreDiscount.remaining;

  build.stats.movement = Number(stageData.movement ?? 0);
  build.stats.attackSlots = Number(stageData.attacks ?? 1);
  build.stats.maxSize = String(stageData.maxSize ?? "medium");

  this._recalculateFormBuildDerivedStats(build);
  return build;
}

_initializeFormBuilds() {
  if (this.mode === "formSnapshot") return null;

  this.data.formBuilds ??= {
    activeStage: "child",
    order: ["baby1", "baby2", "child"],
    stages: {}
  };

  this.data.formBuilds.stages ??= {};

  const effectiveStage = this.data.partnerStartingStage?.effectiveStage
    || this._getEffectivePartnerStartingStage();

  const buildableStages = this._getBuildableFormStagesForStartingStage(effectiveStage);

  this.data.formBuilds.order = buildableStages;

  for (const stageKey of buildableStages) {
    if (!this.data.formBuilds.stages[stageKey]) {
      this.data.formBuilds.stages[stageKey] = this._createDefaultFormBuild(stageKey);
    } else {
      this._recalculateFormBuild(this.data.formBuilds.stages[stageKey]);
    }
  }

  const activeStage = this._getInitialLineStageKey(this.data.formBuilds.activeStage);
  this.data.formBuilds.activeStage = buildableStages.includes(activeStage)
    ? activeStage
    : buildableStages[buildableStages.length - 1] ?? "child";

  return this.data.formBuilds;
}

_getFormBuild(stageKey = null) {
  this._initializeFormBuilds();

  const requestedStage = stageKey
    ? this._getInitialLineStageKey(stageKey)
    : this._getInitialLineStageKey(this.data.formBuilds?.activeStage ?? "child");

  this.data.formBuilds ??= {
    activeStage: requestedStage,
    order: ["baby1", "baby2", "child"],
    stages: {}
  };

  this.data.formBuilds.stages ??= {};

  if (!this.data.formBuilds.stages[requestedStage]) {
    this.data.formBuilds.stages[requestedStage] = this._createDefaultFormBuild(requestedStage);
  }

  return this._recalculateFormBuild(this.data.formBuilds.stages[requestedStage]);
}

_getActiveFormBuild() {
  return this._getFormBuild(this.data.formBuilds?.activeStage ?? this._getOriginLineStageKey(this.data.stage));
}

_usesInitialFormBuildsForMechanicalState() {
  if (this.mode === "formSnapshot") return false;

  const effectiveStage = this.data.partnerStartingStage?.effectiveStage
    || this._getEffectivePartnerStartingStage();

  return ["baby1", "baby2", "child"].includes(effectiveStage);
}

_getPrimaryMechanicalBuildStage() {
  const effectiveStage = this.data.partnerStartingStage?.effectiveStage
    || this._getEffectivePartnerStartingStage();

  return this._getOriginLineStageKey(effectiveStage);
}

_getActiveMechanicalStageKeyForWizard() {
  if (this._usesInitialFormBuildsForMechanicalState()) {
    return this._getInitialLineStageKey(
      this.data.formBuilds?.activeStage
      ?? this._getPrimaryMechanicalBuildStage()
    );
  }

  return this._normalizeWizardStageKey(this.data.stage || "child", "child");
}

_getFormBuildLabel(stageKey = "child") {
  const form = this._getLineForm(stageKey);
  const stageLabel = this._getStageLabel(stageKey);
  const species = String(form?.species ?? "").trim();

  return species ? `${stageLabel} — ${species}` : stageLabel;
}

_getFormBuildValidationErrors() {
  if (!this._usesInitialFormBuildsForMechanicalState()) return [];

  this._initializeFormBuilds();

  const errors = [];
  const previousActiveStage = this.data.formBuilds?.activeStage ?? this._getPrimaryMechanicalBuildStage();
  const previousQualities = foundry.utils.deepClone(this.data.qualities ?? {
    positive: [],
    negative: []
  });

  const order = Array.isArray(this.data.formBuilds?.order)
    ? this.data.formBuilds.order
    : [];

  for (const stageKey of order) {
    const cleanStage = this._getInitialLineStageKey(stageKey);
    const build = this._getFormBuild(cleanStage);

    if (!build) continue;

    this._recalculateFormBuild(build);

    const label = this._getFormBuildLabel(cleanStage);
    const prefix = `[${label}] `;

    const positiveQualities = Array.isArray(build.qualities?.positive)
      ? build.qualities.positive
      : [];

    const negativeQualities = Array.isArray(build.qualities?.negative)
      ? build.qualities.negative
      : [];

    if (cleanStage === "baby1") {
      const spentStats = this._getSpentStatDpFromFormBuild(build);
      const hasQualities = positiveQualities.length > 0 || negativeQualities.length > 0;

      if (spentStats > 0) {
        errors.push(prefix + text(
          "Bebê I possui stats comprados, mas esta forma deve ser fixa.",
          "Baby I has purchased stats, but this form must be fixed."
        ));
      }

      if (hasQualities) {
        errors.push(prefix + text(
          "Bebê I não pode possuir Qualidades.",
          "Baby I cannot have Qualities."
        ));
      }
    }

    if (Number(build.dp?.remaining ?? 0) < 0) {
      errors.push(prefix + text(
        "Você gastou mais PD do que possui nesta forma.",
        "You spent more DP than this form has."
      ));
    }

    if (Number(build.dp?.negativeUsed ?? 0) > Number(build.dp?.negativeLimit ?? 0)) {
      errors.push(prefix + text(
        "Você excedeu o limite de PD Negativo desta forma.",
        "You exceeded this form's Negative DP limit."
      ));
    }

    if (
      Number(build.dp?.freeQualityLimit ?? 0) > 0 &&
      Number(build.dp?.freeQualityUsed ?? 0) > Number(build.dp?.freeQualityLimit ?? 0)
    ) {
      errors.push(prefix + text(
        "Você excedeu o limite de Qualidades Gratuitas desta forma.",
        "You exceeded this form's Free Quality limit."
      ));
    }

    const previousLoopActiveStage = this.data.formBuilds.activeStage;

    this.data.formBuilds.activeStage = cleanStage;
    this.data.qualities = foundry.utils.deepClone(build.qualities ?? {
      positive: [],
      negative: []
    });

    const incompatibilityErrors = this._getSelectedQualityIncompatibilityErrors();

    for (const error of incompatibilityErrors) {
      errors.push(prefix + error);
    }

    this.data.formBuilds.activeStage = previousLoopActiveStage;
  }

  this.data.formBuilds.activeStage = previousActiveStage;
  this.data.qualities = previousQualities;
  this._syncActiveFormBuildToGlobalState();

  return errors;
}

_formBuildsAreValidForAdvance() {
  return this._getFormBuildValidationErrors().length === 0;
}

_getFormBuildSummaryData() {
  if (!this._usesInitialFormBuildsForMechanicalState()) {
    return {
      enabled: false,
      forms: []
    };
  }

  this._initializeFormBuilds();

  const primaryStage = this._getPrimaryMechanicalBuildStage();
  const order = Array.isArray(this.data.formBuilds?.order)
    ? this.data.formBuilds.order
    : [];

  return {
    enabled: order.length > 0,
    primaryStage,
    forms: order.map((stageKey) => {
      const cleanStage = this._getInitialLineStageKey(stageKey);
      const build = this._getFormBuild(cleanStage);
      const form = this._getLineFormViewData(cleanStage);

      const attacks = this._getLineFormAttackSlots(cleanStage)
        .map((attack, index) => ({
          name: String(attack.name ?? "").trim(),
          rangeType: attack.rangeType,
          functionType: attack.functionType,
          slot: index + 1
        }))
        .filter((attack) => attack.name);

      const qualities = build?.qualities ?? {
        positive: [],
        negative: []
      };

      return {
        stageKey: cleanStage,
        stageLabel: this._getStageLabel(cleanStage),
        title: this._getFormBuildLabel(cleanStage),
        species: form.species || "",
        img: form.img || "icons/svg/mystery-man.svg",
        active: cleanStage === primaryStage,
        locked: Boolean(build?.locked),

        dp: foundry.utils.deepClone(build?.dp ?? {}),
        stats: foundry.utils.deepClone(build?.stats ?? {}),
        statAllocation: foundry.utils.deepClone(build?.statAllocation ?? {}),
        derivedStatsPreview: foundry.utils.deepClone(build?.derivedStatsPreview ?? {}),

        qualitiesPositive: Array.isArray(qualities.positive)
          ? foundry.utils.deepClone(qualities.positive)
          : [],

        qualitiesNegative: Array.isArray(qualities.negative)
          ? foundry.utils.deepClone(qualities.negative)
          : [],

        attacks
      };
    })
  };
}

_getFormBuildViewData() {
  if (!this._usesInitialFormBuildsForMechanicalState()) {
    return {
      enabled: false,
      tabs: []
    };
  }

  this._initializeFormBuilds();

  const activeStage = this.data.formBuilds?.activeStage ?? this._getPrimaryMechanicalBuildStage();
  const order = Array.isArray(this.data.formBuilds?.order)
    ? this.data.formBuilds.order
    : [];

  return {
    enabled: order.length > 1,
    activeStage,
    tabs: order.map((stageKey) => {
      const build = this._getFormBuild(stageKey);
      const form = this._getLineForm(stageKey);
      const species = String(form?.species ?? "").trim();

      return {
        stageKey,
        label: this._getStageLabel(stageKey),
        species,
        title: species
          ? `${this._getStageLabel(stageKey)} — ${species}`
          : this._getStageLabel(stageKey),
        active: stageKey === activeStage,
        locked: Boolean(build.locked),
        editable: Boolean(build.editable),
        dpBase: Number(build.dp?.base ?? 0),
        dpRemaining: Number(build.dp?.remaining ?? 0)
      };
    })
  };
}

_syncActiveFormBuildToGlobalState() {
  if (!this._usesInitialFormBuildsForMechanicalState()) return null;

  const build = this._getActiveFormBuild();
  if (!build) return null;

  this._recalculateFormBuild(build);

  this.data.dp = foundry.utils.deepClone(build.dp);
  this.data.stats = foundry.utils.deepClone(build.stats);
  this.data.statAllocation = foundry.utils.deepClone(build.statAllocation);
  this.data.derivedStatsPreview = foundry.utils.deepClone(build.derivedStatsPreview);
  this.data.qualities = foundry.utils.deepClone(build.qualities ?? {
  positive: [],
  negative: []
});

  return build;
}

_syncGlobalStateToActiveFormBuild() {
  if (!this._usesInitialFormBuildsForMechanicalState()) return null;

  const build = this._getActiveFormBuild();
  if (!build) return null;

  build.dp = foundry.utils.deepClone(this.data.dp ?? build.dp);
  build.stats = foundry.utils.deepClone(this.data.stats ?? build.stats);
  build.statAllocation = foundry.utils.deepClone(this.data.statAllocation ?? build.statAllocation);
  build.derivedStatsPreview = foundry.utils.deepClone(this.data.derivedStatsPreview ?? build.derivedStatsPreview);
  build.qualities = foundry.utils.deepClone(this.data.qualities ?? build.qualities ?? {
  positive: [],
  negative: []
});

  return this._recalculateFormBuild(build);
}

_rebuildSteps() {
  if (this.mode === "formSnapshot") {
  this.steps = this._isFutureFormWizard()
    ? ["stats", "attacks", "qualities", "summary"]
    : ["stats", "qualities", "summary"];
    if (this.stepIndex >= this.steps.length) this.stepIndex = this.steps.length - 1;
    return;
  }

  const steps = ["welcome", "origin"];

  const questionnaireAvailable = this.compatibilityQuestionnaireEnabled
    && !this.linkContext?.compatibility?.answered;

  const wantsQuestionnaire = Boolean(this.data?.compatibility?.wantsQuestionnaire);

  if (questionnaireAvailable) {
    steps.push("compatibilityIntro");

    if (wantsQuestionnaire) {
      steps.push("compatibility", "digitama");
    }
  }

const effectiveStage = this.data.partnerStartingStage?.effectiveStage
  || this._getEffectivePartnerStartingStage();

if (!this._isQuestionnaireBaby1Locked() || effectiveStage !== "baby1") {
  steps.push("stage");
}

steps.push("identity", "evolutionLine");

if (this.data.buildTemplate?.enabled && this._buildTemplatesCanBeUsed()) {
  steps.push("buildTemplate", "templateChoices", "partnerQuestions", "summary");
} else {
  steps.push("stats", "qualities", "partnerQuestions", "summary");
}

  this.steps = steps;

  if (this.stepIndex >= this.steps.length) {
    this.stepIndex = this.steps.length - 1;
  }
}

_shouldAskCompatibilityQuestionnaire() {
  if (!this.compatibilityQuestionnaireEnabled) return false;
  if (this.linkContext?.compatibility?.answered) return false;
  if (this.data?.compatibility?.answered) return false;
  return true;
}

_isQuestionnaireBaby1Locked() {
  return this.mode !== "formSnapshot"
    && Boolean(this.data?.compatibility?.digitama?.key || this.data?.compatibility?.digitama?.name)
    && Boolean(this.data?.initialLine?.baby1LockedByQuestionnaire);
}

_getQuestionnaireBaby1Entry() {
  if (!this._isQuestionnaireBaby1Locked()) return null;

  return getInitialDigimonById(this.data.initialLine?.baby1Id)
    ?? findInitialEvolutionEntry(this.data.compatibility?.digitama?.name, "baby1")
    ?? null;
}

_isCompatibilityBaby1Flow() {
  return this.mode !== "formSnapshot"
    && this._isQuestionnaireBaby1Locked()
    && this._getInitialLineStageKey(this.data.stage || "baby1") === "baby1";
}

_applyCompatibilityBaby1Defaults() {
  if (!this._isCompatibilityBaby1Flow()) return;

  this.data.stage = "baby1";

  this.data.qualities.positive = [];
  this.data.qualities.negative = [];

  for (const stat of Object.values(this.data.statAllocation ?? {})) {
    stat.base = 1;
    stat.spent = 0;
    stat.total = 1;
  }

  this.data.stats.movement = 2;
  this.data.stats.attackSlots = 1;
  this.data.stats.maxSize = "small";

  this.data.dp.base = 0;
  this.data.dp.bonus = 0;
  this.data.dp.totalAvailable = 0;
  this.data.dp.remaining = 0;
  this.data.dp.spent = 0;
  this.data.dp.negativeUsed = 0;
  this.data.dp.negativeLimit = 0;
  this.data.dp.freeQualityUsed = 0;
  this.data.dp.freeQualityLimit = 0;
  this.data.dp.coreDiscountBase = 0;
  this.data.dp.coreDiscountUsed = 0;
  this.data.dp.coreDiscountRemaining = 0;
}

_buildInitialCompatibilityData() {
  const inherited = foundry.utils.deepClone(this.linkContext?.compatibility ?? null);

  if (inherited?.answered) {
    return {
      ...inherited,
      enabled: this.compatibilityQuestionnaireEnabled,
      inherited: true,
      wantsQuestionnaire: false
    };
  }

  return {
    enabled: this.compatibilityQuestionnaireEnabled,
    wantsQuestionnaire: null,
    answered: false,
    skipped: false,
    answers: {},
    answerList: [],
    crestScores: {},
    traitScores: {},
    hiddenCrest: null,
    digitama: null,
    recommendations: []
  };
}

async _onQuestionnaireChoice(event) {
  event.preventDefault();

  const value = event.currentTarget.dataset.value;
  const wantsQuestionnaire = value === "yes";

this.data.compatibility.wantsQuestionnaire = wantsQuestionnaire;
this.data.compatibility.skipped = !wantsQuestionnaire;

if (!wantsQuestionnaire) {
  this.data.compatibility.answered = false;
  this.data.compatibility.answers = {};
  this.data.compatibility.answerList = [];
  this.data.compatibility.crestScores = {};
  this.data.compatibility.traitScores = {};
  this.data.compatibility.hiddenCrest = null;
  this.data.compatibility.finalQuestion = null;
  this.data.compatibility.finalQuestionId = "";
  this.data.compatibility.finalAnswerKey = "";
  this.data.compatibility.finalAnswerText = "";
  this.data.compatibility.digitama = null;
  this.data.compatibility.recommendations = [];
}

this._rebuildSteps();

  const nextStep = wantsQuestionnaire ? "compatibility" : "stage";
  this.stepIndex = Math.max(0, this.steps.indexOf(nextStep));
  this.render(false);
}

async _onCompatibilityAnswer(event) {
  event.preventDefault();

  const questionId = event.currentTarget.dataset.questionId;
  const answerKey = event.currentTarget.dataset.answerKey;

  if (!questionId || !answerKey) return;

  this.data.compatibility.answers[questionId] = answerKey;
  this.data.compatibility.answerList = this._getCompatibilityAnswerList();

  this._recalculateCompatibilityResult();
  this._renderPreservingScroll();
}

async _onSelectDigitama(event) {
  event.preventDefault();

  const digitamaKey = event.currentTarget.dataset.digitamaKey;
  const recommendations = this._getDigitamaRecommendations();
  const selected = recommendations.find((entry) => entry.key === digitamaKey);

  if (!selected) return;

  this.data.compatibility.digitama = foundry.utils.deepClone({
    ...selected,
    playerLabel: text("Digitama escolhido", "Chosen Digi-Egg")
  });
  this.data.compatibility.finalQuestionId = selected.finalQuestionId ?? this._getCompatibilityFinalQuestion()?.id ?? "";
  this.data.compatibility.finalAnswerKey = selected.finalAnswerKey ?? "";
  this.data.compatibility.finalAnswerText = selected.finalAnswerText ?? "";
  this.data.compatibility.answered = true;
  this.data.compatibility.skipped = false;

// A resposta final agora define o Bebê I recebido pelo Digi-Escolhido.
// No fluxo com questionário, o parceiro nasce como Bebê I e essa forma não pode ser alterada.
const baby1Entry = findInitialEvolutionEntry(selected.name, "baby1");

const effectiveStage = this.data.partnerStartingStage?.effectiveStage
  || this._getEffectivePartnerStartingStage();

this.data.stage = effectiveStage;
this.data.initialLine.baby1LockedByQuestionnaire = true;
this.data.initialLine.source = "compatibility_questionnaire";

if (baby1Entry) {
  this.data.initialLine.baby1Id = baby1Entry.id;
  this._setLineFormFromEntry("baby1", baby1Entry, { preserveImages: false });
} else {
  this.data.initialLine.baby1Id = "";
  this.data.lineForms.baby1.species = selected.name;
  this.data.lineForms.baby1.originalName = selected.name;
  this.data.lineForms.baby1.img = selected.digimonImg ?? digimonBabyPath(selected.fileName ?? selected.name);
  this.data.lineForms.baby1.tokenImg = this.data.lineForms.baby1.img;
  this.data.lineForms.baby1.custom = true;
}

const baby2Options = this._getInitialBaby2OptionsForSelectedBaby1();
const primaryBaby2 = baby2Options.find((option) => option.rank === "primary") ?? baby2Options[0];

if (primaryBaby2?.id) {
  this.data.initialLine.baby2Id = primaryBaby2.id;
  this._setLineFormFromEntry("baby2", getInitialDigimonById(primaryBaby2.id), { preserveImages: true });

  const rookieOptions = this._getInitialRookieOptionsForSelectedBaby2();
  const primaryRookie = rookieOptions.find((option) => option.rank === "primary") ?? rookieOptions[0];

  if (primaryRookie?.id) {
    this.data.initialLine.rookieId = primaryRookie.id;
    this._setLineFormFromEntry("child", getInitialDigimonById(primaryRookie.id), { preserveImages: true });
  }
}

const originLineStage = this._getOriginLineStageKey(this.data.stage);

this._completeInitialLineAroundMainStage();
this._applyLineFormToIdentity(originLineStage, { preserveName: true });
this._recalculateStageData();

  this._rebuildSteps();
  this._renderPreservingScroll();
}


_ensureCompatibilityIdentityResolved() {
  const digitama = this.data?.compatibility?.digitama;
  if (!digitama) return;

  const speciesName = digitama.name ?? this.data.identity.species;
  const fileName = digitama.fileName ?? speciesName;

  this._applySpeciesDataFromWorldOrDatabase(speciesName, fileName, { forceName: true });
}

_applySpeciesDataToIdentity(speciesData, { forceName = false } = {}) {
  if (!speciesData) return false;

  const species = speciesData.species || speciesData.name || this.data.identity.species || "Digimon";

  this.data.identity.species = species;

  if (forceName || !this.data.identity.name?.trim()) {
    this.data.identity.name = species;
  }

  this.data.identity.img = speciesData.img || this.data.identity.img || digimonBabyPath(species);
  this.data.identity.attribute = speciesData.attribute || this.data.identity.attribute || "none";
  this.data.identity.type = speciesData.type || this.data.identity.type || "slime";
  this.data.identity.field = speciesData.field || this.data.identity.field || "unknown";
  this.data.identity.group = speciesData.group || this.data.identity.group || speciesData.typeLabel || "";
  this.data.identity.source = foundry.utils.deepClone(speciesData);

  if (speciesData.stage) this.data.stage = speciesData.stage;

  return true;
}

_findSpeciesDataInWorldActors(speciesName = "", fileName = "") {
  const keys = new Set([
    normalizeDigimonLookupName(speciesName),
    normalizeDigimonLookupName(fileName)
  ].filter(Boolean));

  if (!keys.size) return null;

  const candidates = Array.from(game.actors ?? []).filter((actor) => {
    if (!actor || !["digimon", "npc"].includes(actor.type)) return false;

    const stage = actor.system?.stage ?? "";
    if (stage && stage !== "baby1") return false;

    const actorKeys = [
      actor.name,
      actor.system?.species,
      actor.system?.name,
      actor.system?.key
    ].map((value) => normalizeDigimonLookupName(value));

    return actorKeys.some((key) => keys.has(key));
  });

  return extractSpeciesDataFromActor(candidates[0] ?? null);
}

_findSpeciesDataInGlobalDatabase(speciesName = "", fileName = "") {
  const database = globalThis.DDA_DIGIMON_ACTOR_DATABASE;
  if (!Array.isArray(database)) return null;

  const keys = new Set([
    normalizeDigimonLookupName(speciesName),
    normalizeDigimonLookupName(fileName)
  ].filter(Boolean));

  if (!keys.size) return null;

  const entry = database.find((candidate) => {
    if (!candidate) return false;
    if (candidate.stage && candidate.stage !== "baby1") return false;

    const candidateKeys = [
      candidate.key,
      candidate.name,
      candidate.species,
      candidate.actorName?.pt,
      candidate.actorName?.en
    ].map((value) => normalizeDigimonLookupName(value));

    return candidateKeys.some((key) => keys.has(key));
  });

  return extractSpeciesDataFromDatabaseEntry(entry ?? null);
}

_applySpeciesDataFromWorldOrDatabase(speciesName = "", fileName = "", options = {}) {
  const speciesData = this._findSpeciesDataInWorldActors(speciesName, fileName)
    ?? this._findSpeciesDataInGlobalDatabase(speciesName, fileName);

  return this._applySpeciesDataToIdentity(speciesData, options);
}

async _findSpeciesDataInActorPacks(speciesName = "", fileName = "") {
  const keys = new Set([
    normalizeDigimonLookupName(speciesName),
    normalizeDigimonLookupName(fileName)
  ].filter(Boolean));

  if (!keys.size) return null;

  const packs = Array.from(game.packs ?? []).filter((pack) => pack?.documentName === "Actor");

  for (const pack of packs) {
    let index;

    try {
      index = await pack.getIndex({ fields: ["name", "type", "system.species", "system.stage"] });
    } catch (error) {
      console.warn("DDA | Could not read actor pack index for Digimon Wizard:", pack.collection, error);
      continue;
    }

    const match = Array.from(index ?? []).find((entry) => {
      if (!entry) return false;
      if (entry.type && !["digimon", "npc"].includes(entry.type)) return false;

      const stage = foundry.utils.getProperty(entry, "system.stage") ?? "";
      if (stage && stage !== "baby1") return false;

      const entryKeys = [
        entry.name,
        foundry.utils.getProperty(entry, "system.species")
      ].map((value) => normalizeDigimonLookupName(value));

      return entryKeys.some((key) => keys.has(key));
    });

    if (!match) continue;

    try {
      const doc = await pack.getDocument(match._id);
      const data = extractSpeciesDataFromActor(doc);
      if (data) return data;
    } catch (error) {
      console.warn("DDA | Could not read Digimon actor from pack:", pack.collection, match._id, error);
    }
  }

  return null;
}

async _applySpeciesDataFromCompendium(speciesName = "", fileName = "", options = {}) {
  if (this._applySpeciesDataFromWorldOrDatabase(speciesName, fileName, options)) return true;

  const speciesData = await this._findSpeciesDataInActorPacks(speciesName, fileName);
  return this._applySpeciesDataToIdentity(speciesData, options);
}

_ensureIdentityFallbacks({ resolveSource = true } = {}) {
  const identity = this.data.identity ?? {};
  const lookupName = identity.species?.trim() || identity.name?.trim() || this.data.compatibility?.digitama?.name?.trim() || "";
  const lookupFile = this.data.compatibility?.digitama?.fileName || lookupName;

  if (resolveSource && lookupName && !identity.source) {
    this._applySpeciesDataFromWorldOrDatabase(lookupName, lookupFile, { forceName: false });
  }

  if (!identity.species?.trim() && identity.name?.trim()) {
    identity.species = identity.name.trim();
  }

  if (!identity.name?.trim() && identity.species?.trim()) {
    identity.name = identity.species.trim();
  }

  identity.attribute = identity.attribute?.trim() || identity.source?.attribute || "none";
  identity.type = identity.type?.trim() || identity.source?.type || "slime";
  identity.field = identity.field?.trim() || identity.source?.field || "unknown";
  identity.group = identity.group?.trim() || identity.source?.group || identity.source?.typeLabel || "";

if (!identity.img || identity.img === "systems/digimon-digital-adventures/assets/ui/Digimon-Logo-2.webp") {
  identity.img = identity.source?.img || (identity.species ? digimonBabyPath(identity.species) : identity.img);
}

identity.tokenImg = identity.tokenImg?.trim() || identity.img || "icons/svg/mystery-man.svg";

return identity;
}

_getCompatibilityQuestions() {
  return DDA_COMPATIBILITY_QUESTIONS.map((question, index) => {
    return {
      id: question.id,
      number: index + 1,
      text: text(question.textPt, question.textEn),
      answered: Boolean(this.data.compatibility.answers?.[question.id]),
      answers: question.answers.map((answer) => ({
        ...answer,
        text: text(answer.textPt, answer.textEn),
        selected: this.data.compatibility.answers?.[question.id] === answer.key
      }))
    };
  });
}

_getCompatibilityAnswerList() {
  return DDA_COMPATIBILITY_QUESTIONS
    .map((question) => {
      const answerKey = this.data.compatibility.answers?.[question.id];
      if (!answerKey) return null;
      return { questionId: question.id, answerKey };
    })
    .filter(Boolean);
}

_recalculateCompatibilityResult() {
  const crestScores = {};
  const traitScores = {};

  for (const question of DDA_COMPATIBILITY_QUESTIONS) {
    const answerKey = this.data.compatibility.answers?.[question.id];
    const answer = question.answers.find((entry) => entry.key === answerKey);

    if (!answer) continue;

    const crestWeights = getCompatibilityCrestWeights(question.id, answer);

    for (const [crestKey, weight] of Object.entries(crestWeights)) {
      const scoreValue = Number(weight ?? 0);
      if (scoreValue === 0) continue;

      crestScores[crestKey] = Number(crestScores[crestKey] ?? 0) + scoreValue;
    }

    for (const trait of answer.traits ?? []) {
      traitScores[trait] = Number(traitScores[trait] ?? 0) + 1;
    }
  }

  const hiddenCrest = this._getTopCrest(crestScores);

  this.data.compatibility.crestScores = crestScores;
  this.data.compatibility.traitScores = traitScores;
  const finalQuestion = this._getCompatibilityFinalQuestion({ traitScores, hiddenCrest });

  this.data.compatibility.hiddenCrest = hiddenCrest;
  this.data.compatibility.finalQuestion = finalQuestion;
  this.data.compatibility.recommendations = this._getDigitamaRecommendations({ crestScores, traitScores, hiddenCrest, finalQuestion });
}

_getTopCrest(crestScores = this.data.compatibility.crestScores ?? {}) {
  const sorted = Object.entries(crestScores)
    .sort((a, b) => Number(b[1] ?? 0) - Number(a[1] ?? 0) || String(a[0]).localeCompare(String(b[0])));

  const key = sorted[0]?.[0] ?? "courage";
  const config = DDA_CRESTS[key] ?? DDA_CRESTS.courage;

  return {
    key: config.key,
    label: text(config.labelPt, config.labelEn),
    img: config.img,
    score: Number(crestScores[key] ?? 0)
  };
}

_getCrestTendencyIndicators(limit = 3) {
  const crestScores = this.data?.compatibility?.crestScores ?? {};
  const answerCount = this._getCompatibilityAnswerList().length;

  if (!answerCount) return [];

  const ranked = Object.entries(DDA_CRESTS)
    .map(([key, config]) => {
      const score = Number(crestScores[key] ?? 0);

      return {
        key,
        label: text(config.labelPt, config.labelEn),
        img: config.img,
        score
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0) || a.label.localeCompare(b.label))
    .slice(0, Math.max(1, Number(limit ?? 3)));

  const maxScore = Math.max(1, ...ranked.map((entry) => Number(entry.score ?? 0)));

  return ranked.map((entry, index) => {
    const strength = Math.max(0.35, Number(entry.score ?? 0) / maxScore);
    const opacity = Math.min(1, 0.38 + (strength * 0.62));
    const scale = Math.min(1.08, 0.84 + (strength * 0.20));

    return {
      ...entry,
      leader: index === 0,
      style: `--dda-crest-opacity: ${opacity.toFixed(2)}; --dda-crest-scale: ${scale.toFixed(2)};`
    };
  });
}

_getCompatibilityFinalQuestion(context = {}) {
  const traitScores = context.traitScores ?? this.data?.compatibility?.traitScores ?? {};
  const hiddenCrest = context.hiddenCrest ?? this.data?.compatibility?.hiddenCrest ?? this._getTopCrest();

  const ranked = DDA_COMPATIBILITY_FINAL_QUESTIONS.map((question, index) => {
    let score = 0;

    for (const trait of question.profileTraits ?? []) {
      score += Number(traitScores[trait] ?? 0) * 3;
    }

    if (question.crestHints?.includes(hiddenCrest?.key)) {
      score += 4;
    }

    return { question, index, score };
  }).sort((a, b) => {
    return Number(b.score ?? 0) - Number(a.score ?? 0)
      || Number(a.index ?? 0) - Number(b.index ?? 0);
  });

  const config = ranked[0]?.question ?? DDA_COMPATIBILITY_FINAL_QUESTIONS[0];

  return {
    id: config.id,
    text: text(config.textPt, config.textEn),
    score: Number(ranked[0]?.score ?? 0),
    answers: (config.answers ?? []).map((answer) => ({
      ...answer,
      text: text(answer.textPt, answer.textEn)
    }))
  };
}

_getUsedDigitamaNames() {
  const used = new Set();

  for (const actor of game.actors ?? []) {
    const compatibility = actor.system?.compatibility ?? actor.system?.wizard?.compatibility;
    const name = compatibility?.digitama?.name ?? compatibility?.digitamaName ?? compatibility?.digitama?.key;

    if (name) used.add(slugifyDigitamaName(name));
  }

  const selected = this.data?.compatibility?.digitama?.name;
  if (selected) used.delete(slugifyDigitamaName(selected));

  return used;
}

_getDigitamaRecommendations(context = {}) {
  const crestScores = context.crestScores ?? this.data?.compatibility?.crestScores ?? {};
  const traitScores = context.traitScores ?? this.data?.compatibility?.traitScores ?? {};
  const hiddenCrest = context.hiddenCrest ?? this.data?.compatibility?.hiddenCrest ?? this._getTopCrest(crestScores);
  const finalQuestion = context.finalQuestion ?? this._getCompatibilityFinalQuestion({ traitScores, hiddenCrest });
  const usedNames = this._getUsedDigitamaNames();
  const chosen = [];
  const selectedKey = this.data?.compatibility?.digitama?.key ?? "";

  const scoreDigitamaForAnswer = (entry, answer) => {
    const answerTraits = answer?.traits ?? [];
    const profileTraits = DDA_COMPATIBILITY_FINAL_QUESTIONS.find((question) => question.id === finalQuestion?.id)?.profileTraits ?? [];
    const crestTraits = DDA_CRESTS[hiddenCrest?.key]?.traits ?? [];

    let score = 0;

    for (const trait of entry.traits ?? []) {
      score += Number(traitScores[trait] ?? 0);
      if (answerTraits.includes(trait)) score += 8;
      if (profileTraits.includes(trait)) score += 3;
      if (crestTraits.includes(trait)) score += 1;
    }

    return score;
  };

  const answers = finalQuestion?.answers?.length
    ? finalQuestion.answers
    : DDA_COMPATIBILITY_FINAL_QUESTIONS[0].answers.map((answer) => ({
      ...answer,
      text: text(answer.textPt, answer.textEn)
    }));

  for (const answer of answers.slice(0, 4)) {
    const ranked = DDA_DIGITAMA_POOL.map((entry) => {
      const key = slugifyDigitamaName(entry.name);
      const used = usedNames.has(key);
      const alreadyChosen = chosen.some((choice) => choice.key === key);
      const score = scoreDigitamaForAnswer(entry, answer);

      const visual = getDigitamaVisualPreset(entry, answer, hiddenCrest);

      return {
        key,
        name: entry.name,
        fileName: entry.fileName,
        img: digitamaPath(entry.fileName),
        fallbackImg: visual.fallbackImg,
        fallbackImg2: visual.fallbackImg2,
        fallbackImg3: visual.fallbackImg3,
        visualClass: visual.className,
        visualStyle: visual.style,
        digimonImg: digimonBabyPath(entry.fileName ?? entry.name),
        traits: entry.traits,
        score,
        used,
        alreadyChosen,
        crest: hiddenCrest,
        finalQuestionId: finalQuestion?.id ?? "",
        finalAnswerKey: answer.key,
        finalAnswerText: answer.text
      };
    }).sort((a, b) => {
      if (a.used !== b.used) return a.used ? 1 : -1;
      if (a.alreadyChosen !== b.alreadyChosen) return a.alreadyChosen ? 1 : -1;
      return Number(b.score ?? 0) - Number(a.score ?? 0) || a.name.localeCompare(b.name);
    });

    const selectedForAnswer = ranked.find((entry) => !entry.used && !entry.alreadyChosen)
      ?? ranked.find((entry) => !entry.alreadyChosen)
      ?? ranked[0];

    if (selectedForAnswer) chosen.push(selectedForAnswer);
  }

  const sharedFallbackImages = chosen
    .map((entry) => digitamaPath(entry.fileName ?? entry.name))
    .filter(Boolean);

  return chosen.map((entry) => {
    const fallbackQueue = [
      entry.fallbackImg,
      entry.fallbackImg2,
      entry.fallbackImg3,
      ...sharedFallbackImages,
      digitamaPath("Botamon"),
      digitamaPath("Tokomon"),
      digitamaPath("Pafumon")
    ];

    const seen = new Set([entry.img]);
    const fallbackSrcs = fallbackQueue
      .filter(Boolean)
      .filter((src) => {
        if (seen.has(src)) return false;
        seen.add(src);
        return true;
      })
      .join("|");

    return {
      ...entry,
      fallbackSrcs,
      selected: selectedKey === entry.key
    };
  });
}

_getCleanCompatibilityData() {
  const compatibility = foundry.utils.deepClone(this.data.compatibility ?? {});

if (!compatibility.enabled) return null;

if (compatibility.skipped && !compatibility.answered) {
  return {
    enabled: true,
    wantsQuestionnaire: false,
    answered: false,
    skipped: true,
    hidden: true,
    answers: {},
    answerList: [],
    crestScores: {},
    traitScores: {},
    hiddenCrest: null,
    finalQuestion: null,
    finalQuestionId: "",
    finalAnswerKey: "",
    finalAnswerText: "",
    digitama: null,
    recommendations: [],
    assignedAt: ""
  };
}

return {
    enabled: Boolean(compatibility.enabled),
    wantsQuestionnaire: Boolean(compatibility.wantsQuestionnaire),
    answered: Boolean(compatibility.answered),
    skipped: Boolean(compatibility.skipped),
    hidden: true,
    answers: compatibility.answers ?? {},
    answerList: compatibility.answerList ?? [],
    crestScores: compatibility.crestScores ?? {},
    traitScores: compatibility.traitScores ?? {},
    hiddenCrest: compatibility.hiddenCrest ?? null,
    finalQuestion: compatibility.finalQuestion ?? null,
    finalQuestionId: compatibility.finalQuestionId ?? compatibility.finalQuestion?.id ?? "",
    finalAnswerKey: compatibility.finalAnswerKey ?? compatibility.digitama?.finalAnswerKey ?? "",
    finalAnswerText: compatibility.finalAnswerText ?? compatibility.digitama?.finalAnswerText ?? "",
    digitama: compatibility.digitama ?? null,
    recommendations: compatibility.recommendations ?? [],
    assignedAt: compatibility.answered ? new Date().toISOString() : ""
  };
}

_getRootElement(html = this.element) {
  if (!html) return null;
  if (html instanceof HTMLElement) return html;
  if (html[0] instanceof HTMLElement) return html[0];
  return null;
}

_getScrollElement(html = this.element) {
  const root = this._getRootElement(html);
  if (!root) return null;
  return root.querySelector(".dda-wizard-body")
    ?? root.querySelector(".window-content")
    ?? root;
}

_renderPreservingScroll() {
  const scrollElement = this._getScrollElement(this.element);
  this._pendingScrollTop = scrollElement?.scrollTop ?? 0;
  return this.render(false);
}

_restoreScrollPosition(html = this.element) {
  if (this._pendingScrollTop === null || this._pendingScrollTop === undefined) return;

  const scrollTop = this._pendingScrollTop;
  this._pendingScrollTop = null;

  window.requestAnimationFrame(() => {
    const scrollElement = this._getScrollElement(html);
    if (scrollElement) scrollElement.scrollTop = scrollTop;
  });
}

_getFirstUnansweredCompatibilityQuestionId() {
  const answers = this.data?.compatibility?.answers ?? {};

  for (const question of DDA_COMPATIBILITY_QUESTIONS) {
    if (!answers?.[question.id]) return question.id;
  }

  return "";
}

_scrollToPendingCompatibilityQuestion(html = this.element) {
  const questionId = this._pendingCompatibilityScrollQuestionId;
  if (!questionId) return;

  this._pendingCompatibilityScrollQuestionId = "";

  window.requestAnimationFrame(() => {
    const root = this._getRootElement(html);
    if (!root) return;

    const answerButton = root.querySelector(`[data-compatibility-answer][data-question-id="${questionId}"]`);
    const questionCard = answerButton?.closest(".dda-compatibility-question");

    if (!questionCard) return;

    questionCard.classList.add("missing");

    questionCard.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    window.setTimeout(() => {
      questionCard.classList.remove("missing");
    }, 2200);
  });
}

_syncInputsFromHtml(html = this.element) {
  const root = this._getRootElement(html);
  if (!root) return;

  root.querySelectorAll("[data-path]").forEach((input) => {
    const path = input.dataset.path;
    if (!path) return;

    let value = input.value;
    if (input.type === "checkbox") value = input.checked;

    foundry.utils.setProperty(this.data, path, value);
  });
}

_syncInitialEvolutionLineFromIdentity({ preserveSelections = true } = {}) {
  const identity = this.data.identity ?? {};
  const currentBaby1Id = String(this.data.initialLine?.baby1Id ?? "").trim();
  const candidates = [
    identity.source?.id,
    identity.source?.sourceId,
    identity.source?.key,
    identity.source?.species,
    identity.source?.name,
    identity.species,
    identity.name,
    this.data.compatibility?.digitama?.sourceId,
    this.data.compatibility?.digitama?.key,
    this.data.compatibility?.digitama?.name,
    this.data.compatibility?.digitama?.fileName
  ].filter(Boolean);

  let baby1Entry = null;

  for (const candidate of candidates) {
    baby1Entry = findInitialEvolutionEntry(candidate, "baby1");
    if (baby1Entry) break;
  }

  if (!this.data.initialLine) {
    this.data.initialLine = {
      baby1Id: "",
      baby2Id: "",
      rookieId: "",
      locked: true,
      source: "dda_initial_evolution_db_v0",
      status: ""
    };
  }

const nextBaby1Id = baby1Entry?.id ?? "";

if (!this._isQuestionnaireBaby1Locked() && nextBaby1Id !== currentBaby1Id) {
  this.data.initialLine.baby1Id = nextBaby1Id;

  if (!preserveSelections) {
    this.data.initialLine.baby2Id = "";
    this.data.initialLine.rookieId = "";
  }
}

  const baby2Options = this._getInitialBaby2OptionsForSelectedBaby1();
  const currentBaby2Id = String(this.data.initialLine.baby2Id ?? "").trim();

  if (currentBaby2Id && !baby2Options.some((option) => option.id === currentBaby2Id)) {
    this.data.initialLine.baby2Id = "";
    this.data.initialLine.rookieId = "";
  }

  if (!this.data.initialLine.baby2Id && baby2Options.length === 1) {
    this.data.initialLine.baby2Id = baby2Options[0].id;
  }

  const rookieOptions = this._getInitialRookieOptionsForSelectedBaby2();
  const currentRookieId = String(this.data.initialLine.rookieId ?? "").trim();

  if (currentRookieId && !rookieOptions.some((option) => option.id === currentRookieId)) {
    this.data.initialLine.rookieId = "";
  }

  if (!this.data.initialLine.rookieId && rookieOptions.length === 1) {
    this.data.initialLine.rookieId = rookieOptions[0].id;
  }

  this.data.initialLine.status = nextBaby1Id ? "matched" : "unmatched";
  return this.data.initialLine;
}

_syncLineFormsFromWizardData() {
  this.data.lineForms ??= {};

  const stageKeys = ["baby1", "baby2", "child"];
  const currentStageKey = this._getInitialLineStageKey(this._getActiveMechanicalStageKeyForWizard());

  for (const stageKey of stageKeys) {
    const form = this._getLineForm(stageKey);

    form.stageKey = stageKey;
    form.species = String(form.species ?? "").trim();
    form.originalName = String(form.originalName ?? "").trim();
    form.id = String(form.id ?? "").trim();
    form.attribute = String(form.attribute ?? "").trim();
    form.type = String(form.type ?? "").trim();
    form.group = String(form.group ?? "").trim();
    form.field = String(form.field ?? "").trim();
    form.img = String(form.img ?? "").trim();
    form.portraitImg = String(form.portraitImg ?? "").trim();
    form.tokenImg = String(form.tokenImg ?? "").trim();
    form.attacks = this._getLineFormAttackSlots(stageKey);

    if (!form.species) continue;

    const matchedEntry = form.id
      ? getInitialDigimonById(form.id)
      : findInitialEvolutionEntry(form.species, stageKey);

if (matchedEntry) {
  this._setLineFormFromEntry(stageKey, matchedEntry, {
    preserveImages: true
  });

  const syncedForm = this._getLineForm(stageKey);
  syncedForm.custom = false;

      if (stageKey === "baby1") this.data.initialLine.baby1Id = matchedEntry.id;
      if (stageKey === "baby2") this.data.initialLine.baby2Id = matchedEntry.id;
      if (stageKey === "child") this.data.initialLine.rookieId = matchedEntry.id;
    } else {
      form.custom = true;
      form.id = "";
      form.attribute ||= "free";
      form.type ||= stageKey === "baby1" ? "slime" : "";
      form.group ||= "";
      form.field ||= "unknown";
      form.img ||= stageKey === currentStageKey
        ? this.data.identity?.img || "icons/svg/mystery-man.svg"
        : "icons/svg/mystery-man.svg";
      form.portraitImg ||= "";
      form.tokenImg ||= form.img;
    }
  }

  const currentForm = this._getLineForm(currentStageKey);
  const identity = this.data.identity ?? {};

  if (!currentForm.species && identity.species?.trim()) {
    currentForm.species = identity.species.trim();
    currentForm.attribute = identity.attribute || currentForm.attribute || "free";
    currentForm.type = identity.type || currentForm.type || "slime";
    currentForm.group = identity.group || currentForm.group || "";
    currentForm.field = identity.field || currentForm.field || "unknown";
    currentForm.img = identity.img || currentForm.img || "icons/svg/mystery-man.svg";
    currentForm.portraitImg = identity.portraitImg || currentForm.portraitImg || "";
    currentForm.tokenImg = identity.tokenImg || currentForm.tokenImg || currentForm.img;
    currentForm.custom = !currentForm.id;
  }

  if (currentForm.species) {
    this._applyLineFormToIdentity(currentStageKey, { preserveName: true });
  }

  return this.data.lineForms;
}

_getDatabaseOptionsForStage(stageKey = "child") {
  const cleanStage = this._getInitialLineStageKey(stageKey);
  const selectedId = this._getInitialLineSelectedIdForStage(cleanStage);

  const seen = new Set();

  return Object.values(DDA_INITIAL_DIGIMON_INDEX ?? {})
    .filter((entry) => entry && entry.stageKey === cleanStage)
    .map((entry) => {
      if (seen.has(entry.id)) return null;
      seen.add(entry.id);

      return this._buildInitialLineOptionFromEntry(entry, {
        selected: entry.id === selectedId
      });
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

_getInitialLineSelectedIdForStage(stageKey = "child") {
  const cleanStage = this._getInitialLineStageKey(stageKey);

  if (cleanStage === "baby1") return String(this.data.initialLine?.baby1Id ?? "").trim();
  if (cleanStage === "baby2") return String(this.data.initialLine?.baby2Id ?? "").trim();

  return String(this.data.initialLine?.rookieId ?? "").trim();
}

_getInitialLineBrowserState(stageKey = "child") {
  const cleanStage = this._getInitialLineStageKey(stageKey);

  this.data.initialLineBrowser ??= {};
  this.data.initialLineBrowser[cleanStage] ??= {
    mode: "suggested",
    searchTerm: ""
  };

  const state = this.data.initialLineBrowser[cleanStage];

  state.mode = ["suggested", "all"].includes(state.mode) ? state.mode : "suggested";
  state.searchTerm = String(state.searchTerm ?? "").trim();

  return state;
}

_buildInitialLineOptionFromEntry(entry = null, extra = {}) {
  if (!entry) return null;

  const stageKey = this._getInitialLineStageKey(entry.stageKey || extra.stageKey || "child");
  const selectedId = this._getInitialLineSelectedIdForStage(stageKey);

  return {
    id: entry.id,
    relationId: extra.relationId ?? "",
    rank: extra.rank ?? "",
    primary: Boolean(extra.primary),
    name: getInitialEvolutionDisplayName(entry),
    originalName: getInitialEvolutionOriginalName(entry),
    stageKey,
    stageLabel: getInitialEvolutionStageLabel(stageKey),
    attribute: entry.attribute || "none",
    fieldIds: Array.isArray(entry.fieldIds) ? entry.fieldIds : [],
    family: entry.family || "",
    groups: Array.isArray(entry.groups) ? entry.groups : [],
    type: entry.type || "",
    img: getInitialEvolutionEntryImage(entry, "icons/svg/mystery-man.svg"),
    imageFallbacks: getInitialEvolutionEntryImageFallbackString(entry, "icons/svg/mystery-man.svg"),
    confidence: Number(extra.confidence ?? 0),
    curationStatus: extra.curationStatus || entry.curationStatus || "needs_review",
    selected: Boolean(extra.selected ?? (entry.id === selectedId))
  };
}

_getDirectInitialLineOptionsForStage(stageKey = "child") {
  const cleanStage = this._getInitialLineStageKey(stageKey);

  if (cleanStage === "baby1") {
    return this._getBaby1OptionsForSelectedBaby2();
  }

  if (cleanStage === "baby2") {
    const fromRookie = this._getBaby2OptionsForSelectedRookie();
    const fromBaby1 = this._getInitialBaby2OptionsForSelectedBaby1();

    return [...fromRookie, ...fromBaby1];
  }

  return this._getInitialRookieOptionsForSelectedBaby2();
}

_getDirectInitialLineOptionMap(stageKey = "child") {
  const map = new Map();

  for (const option of this._getDirectInitialLineOptionsForStage(stageKey)) {
    if (!option?.id) continue;

    const current = map.get(option.id);

    if (!current) {
      map.set(option.id, option);
      continue;
    }

    const currentWeight = (current.primary ? 1000 : 0) + Number(current.confidence ?? 0);
    const nextWeight = (option.primary ? 1000 : 0) + Number(option.confidence ?? 0);

    if (nextWeight > currentWeight) {
      map.set(option.id, option);
    }
  }

  return map;
}

_getInitialLineReferenceEntriesForStage(stageKey = "child") {
  const cleanStage = this._getInitialLineStageKey(stageKey);

  const ids = [];

  if (cleanStage === "baby1") {
    ids.push(this.data.initialLine?.baby2Id, this.data.initialLine?.rookieId);
  } else if (cleanStage === "baby2") {
    ids.push(this.data.initialLine?.baby1Id, this.data.initialLine?.rookieId);
  } else {
    ids.push(this.data.initialLine?.baby2Id, this.data.initialLine?.baby1Id);
  }

  return ids
    .map((id) => getInitialDigimonById(id))
    .filter(Boolean);
}

_getInitialLineProfileScore(option = {}, references = []) {
  if (!references.length) return 24;

  let best = 24;

  const optionFields = new Set(Array.isArray(option.fieldIds) ? option.fieldIds.filter(Boolean) : []);
  const optionGroups = new Set(Array.isArray(option.groups) ? option.groups.filter(Boolean) : []);
  const optionType = String(option.type ?? "").trim();
  const optionFamily = String(option.family ?? "").trim();
  const optionAttribute = String(option.attribute ?? "").trim();

  for (const reference of references) {
    let score = 24;

    const referenceFields = new Set(Array.isArray(reference.fieldIds) ? reference.fieldIds.filter(Boolean) : []);
    const referenceGroups = new Set(Array.isArray(reference.groups) ? reference.groups.filter(Boolean) : []);
    const referenceType = String(reference.type ?? "").trim();
    const referenceFamily = String(reference.family ?? "").trim();
    const referenceAttribute = String(reference.attribute ?? "").trim();

    const sharesField = [...optionFields].some((field) => referenceFields.has(field));
    const sharesGroup = [...optionGroups].some((group) => referenceGroups.has(group));

    if (sharesField) score += 18;

    if (optionType && referenceType && optionType === referenceType) {
      score += 15;
    }

    if (optionFamily && referenceFamily && optionFamily === referenceFamily) {
      score += 10;
    }

    if (sharesGroup) score += 8;

    if (
      optionAttribute &&
      referenceAttribute &&
      optionAttribute === referenceAttribute &&
      !["none", "free", "unknown"].includes(optionAttribute)
    ) {
      score += 7;
    }

    best = Math.max(best, score);
  }

  return Math.max(0, Math.min(64, Math.round(best)));
}

_getInitialLineCompatibilityData(option = {}, directOption = null, references = []) {
  let score = this._getInitialLineProfileScore(option, references);
  let reason = text("Linha incomum", "Unusual line");
  let direct = false;

  if (directOption) {
    direct = true;

    if (directOption.primary) {
      score = 96;
      reason = text("Relação direta forte", "Strong direct relation");
    } else {
      score = Math.max(72, Number(directOption.confidence ?? 75));
      reason = text("Relação direta alternativa", "Alternative direct relation");
    }
  } else if (score >= 65) {
    reason = text("Perfil muito próximo", "Very close profile");
  } else if (score >= 45) {
    reason = text("Perfil próximo", "Close profile");
  } else if (score >= 35) {
    reason = text("Alternativa incomum", "Unusual alternative");
  }

  const tier = score >= 85
    ? "excellent"
    : score >= 65
      ? "good"
      : score >= 40
        ? "medium"
        : "low";

  return {
    score,
    tier,
    reason,
    direct,
    tooltip: `${score}% — ${reason}`
  };
}

_filterInitialLineOptionsForBrowser(stageKey = "child", options = []) {
  const cleanStage = this._getInitialLineStageKey(stageKey);
  const browser = this._getInitialLineBrowserState(cleanStage);
  const searchKey = normalizeDigimonLookupName(browser.searchTerm);

  let result = options;

  if (searchKey) {
    result = result.filter((option) => {
      const keys = [
        option.id,
        option.name,
        option.originalName,
        option.stageLabel
      ].map((value) => normalizeDigimonLookupName(value));

      return keys.some((key) => key.includes(searchKey));
    });
  }

  if (browser.mode === "suggested" && !searchKey) {
    const suggested = result.filter((option) => {
      return option.selected ||
        option.compatibility?.direct ||
        Number(option.compatibility?.score ?? 0) >= 45;
    });

    result = suggested.length ? suggested : result.slice(0, 24);
  }

  return result.sort((a, b) => {
    if (a.selected !== b.selected) return a.selected ? -1 : 1;

    const scoreDiff = Number(b.compatibility?.score ?? 0) - Number(a.compatibility?.score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;

    const primaryDiff = Number(Boolean(b.primary)) - Number(Boolean(a.primary));
    if (primaryDiff !== 0) return primaryDiff;

    return a.name.localeCompare(b.name);
  });
}

_getLineFormOptionsForStage(stageKey = "child") {
  const cleanStage = this._getInitialLineStageKey(stageKey);
  const selectedId = this._getInitialLineSelectedIdForStage(cleanStage);
  const directMap = this._getDirectInitialLineOptionMap(cleanStage);
  const references = this._getInitialLineReferenceEntriesForStage(cleanStage);

  const options = this._getDatabaseOptionsForStage(cleanStage).map((option) => {
    const directOption = directMap.get(option.id) ?? null;
    const compatibility = this._getInitialLineCompatibilityData(option, directOption, references);

    return {
      ...option,
      ...(directOption ? {
        relationId: directOption.relationId,
        rank: directOption.rank,
        primary: Boolean(directOption.primary),
        confidence: Number(directOption.confidence ?? 0)
      } : {}),
      selected: option.id === selectedId,
      compatibility
    };
  });

  return this._filterInitialLineOptionsForBrowser(cleanStage, options);
}

_getWizardAttackKey(stageKey = "child", index = 0) {
  const cleanStage = this._getInitialLineStageKey(stageKey);
  const slot = Math.max(1, Number(index ?? 0) + 1);

  return `wizard-line-${cleanStage}-attack-${slot}`;
}

_getLineFormAttackSlotCount(stageKey = "child") {
  const cleanStage = this._getInitialLineStageKey(stageKey);
  const stageData = this._getStageOptions().find((entry) => entry.key === cleanStage);

  return Math.max(1, Number(stageData?.attacks ?? 1));
}

_getLineFormAttackSlots(stageKey = "child") {
  const cleanStage = this._getInitialLineStageKey(stageKey);
  const form = this._getLineForm(cleanStage);
  const slotCount = this._getLineFormAttackSlotCount(cleanStage);

  if (!Array.isArray(form.attacks)) {
    form.attacks = Object.values(form.attacks ?? {});
  }

  form.attacks = Array.from({ length: slotCount }, (_entry, index) => {
    const attack = form.attacks[index] ?? {};

    return {
      name: String(attack.name ?? "").trim(),
      rangeType: ["melee", "range"].includes(attack.rangeType) ? attack.rangeType : "melee",
      functionType: ["damage", "support"].includes(attack.functionType) ? attack.functionType : "damage"
    };
  });

  return form.attacks;
}

_buildAttackItemDataFromLineAttack(stageKey = "child", attack = {}, index = 0) {
  const name = String(attack.name ?? "").trim();

  if (!name) return null;

  const rangeType = ["melee", "range"].includes(attack.rangeType) ? attack.rangeType : "melee";
  const functionType = ["damage", "support"].includes(attack.functionType) ? attack.functionType : "damage";
  const isRanged = rangeType === "range";
  const isSupport = functionType === "support";
  const wizardAttackKey = this._getWizardAttackKey(stageKey, index);

  return {
    name,
    type: "attack",
    img: isSupport ? "icons/svg/aura.svg" : "icons/svg/sword.svg",
    flags: {
    [DDA_SYSTEM_ID]: {
      wizardAttackKey
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
        createdByDigimonWizard: true,
        attackKey: wizardAttackKey,
        stage: this._getInitialLineStageKey(stageKey),
        slot: index + 1
      }
    }
  };
}

_getLineAttackItemsForStage(stageKey = "child") {
  return this._getLineFormAttackSlots(stageKey)
    .map((attack, index) => this._buildAttackItemDataFromLineAttack(stageKey, attack, index))
    .filter(Boolean);
}

_getLineFormViewData(stageKey = "child") {
  const cleanStage = this._getInitialLineStageKey(stageKey);
  const form = this._getLineForm(cleanStage);

  const fallbackImg = form.img
    || (form.species ? digimonBabyPath(form.species) : "")
    || "icons/svg/mystery-man.svg";

const entry = form.id
  ? getInitialDigimonById(form.id)
  : findInitialEvolutionEntry(form.species, cleanStage);

return {
  ...form,
  stageKey: cleanStage,
  stageLabel: getInitialEvolutionStageLabel(cleanStage),
  species: form.species || "",
  originalName: form.originalName || "",
  attribute: form.attribute || "",
  type: form.type || "",
  group: form.group || "",
  field: form.field || "",
  img: fallbackImg,
  imageFallbacks: entry
    ? getInitialEvolutionEntryImageFallbackString(entry, "icons/svg/mystery-man.svg")
    : "",
  tokenImg: form.tokenImg || fallbackImg,
  custom: Boolean(form.custom),
  attackSlots: this._getLineFormAttackSlots(cleanStage)
};
}

_getLineFormSourceId(stageKey = "child", form = null) {
  const cleanStage = this._getInitialLineStageKey(stageKey);
  const cleanForm = form ?? this._getLineForm(cleanStage);

  if (cleanForm?.id) return cleanForm.id;

  const speciesKey = normalizeInitialEvolutionId(cleanForm?.species || cleanStage || "form");
  return `custom.${cleanStage}.${speciesKey}`;
}

_getLineFormSnapshotUuid(stageKey = "child", form = null) {
  return `DDA-SNAPSHOT.${this._getLineFormSourceId(stageKey, form)}`;
}

_getLineNicknameForSnapshots() {
  const nickname = String(this.data.identity?.name ?? "").trim();
  if (!nickname) return "";

  const currentStageKey = this._getInitialLineStageKey(this._getActiveMechanicalStageKeyForWizard());
  const currentSpecies = String(this.data.lineForms?.[currentStageKey]?.species ?? this.data.identity?.species ?? "").trim();

  if (!currentSpecies) return nickname;

  // Se o nome atual é igual à espécie da forma principal, ele foi preenchido automaticamente.
  // Nesse caso não deve virar o nome de todos os snapshots.
  if (normalizeDigimonLookupName(nickname) === normalizeDigimonLookupName(currentSpecies)) {
    return "";
  }

  return nickname;
}

_getLineForm(stageKey = this.data.stage) {
  const cleanStage = this._getInitialLineStageKey(stageKey);
  this.data.lineForms ??= {};
  this.data.lineForms[cleanStage] ??= {
    stageKey: cleanStage,
    id: "",
    species: "",
    originalName: "",
    attribute: "",
    type: "",
    group: "",
    field: "",
    img: "",
    portraitImg: "",
    tokenImg: "",
    custom: false,
    attacks: []
  };

  return this.data.lineForms[cleanStage];
}

_setLineFormFromEntry(stageKey = "child", entry = null, { preserveImages = true } = {}) {
  if (!entry) return null;

  const cleanStage = this._getInitialLineStageKey(stageKey);
  const form = this._getLineForm(cleanStage);

  const previousId = String(form.id ?? "").trim();
  const nextId = String(entry.id ?? "").trim();
  const entryChanged = previousId !== nextId;

  const displayName = getInitialEvolutionDisplayName(entry);
  const originalName = getInitialEvolutionOriginalName(entry);
  const img = getInitialEvolutionEntryImage(
    entry,
    "icons/svg/mystery-man.svg"
  );

  form.stageKey = cleanStage;
  form.id = nextId;
  form.species = displayName;
  form.originalName = originalName;
  form.attribute = entry.attribute || "";
  form.type = entry.type || "";
  form.group = entry.family || entry.type || "";
  form.field = Array.isArray(entry.fieldIds) && entry.fieldIds.length
    ? entry.fieldIds[0]
    : "";
  form.custom = false;

  // A imagem do wizard é estática e acompanha a espécie selecionada.
  if (!preserveImages || entryChanged || !form.img) {
    form.img = img;
  }

  // Portrait e token manuais nunca devem acompanhar outra espécie.
  if (!preserveImages || entryChanged) {
    form.portraitImg = "";
    form.tokenImg = "";
  }

  return form;
}

_resetNormalLineForNewMainForm(mainStage = "child") {
  const cleanMainStage = this._getInitialLineStageKey(
    mainStage
  );

  this.data.initialLine ??= {};

  this.data.initialLine.baby1Id = "";
  this.data.initialLine.baby2Id = "";
  this.data.initialLine.rookieId = "";
  this.data.initialLine.status = "";

  this.data.lineForms ??= {};

  for (const stageKey of DDA_NORMAL_PARTNER_LINE_STAGES) {
    if (stageKey === cleanMainStage) continue;

    delete this.data.lineForms[stageKey];
  }
}

async _resolveAutomaticTokenForLineForm(stageKey = "child") {
  const cleanStage = this._getInitialLineStageKey(stageKey);
  const form = this._getLineForm(cleanStage);

  if (!form?.species?.trim()) return "";

  const baseImg = String(form.img ?? "").trim();
  const currentToken = String(form.tokenImg ?? "").trim();

  // Um token diferente da imagem-base foi escolhido manualmente.
  if (currentToken && currentToken !== baseImg) {
    return currentToken;
  }

  const entry = form.id
    ? getInitialDigimonById(form.id)
    : findInitialEvolutionEntry(form.species, cleanStage);

  const tokenPath = await getDdaTokenPath({
    key: form.id || entry?.id || "",
    name: form.species,
    species: form.species,
    aliases: [
      form.originalName,
      entry?.original,
      entry?.dub,
      entry?.displayName,
      ...(Array.isArray(entry?.aliases) ? entry.aliases : [])
    ].filter(Boolean)
  });

  if (!tokenPath) {
    return currentToken || baseImg;
  }

  form.tokenImg = tokenPath;

  const currentStageKey = this._getInitialLineStageKey(
    this.data.stage || "child"
  );

  if (cleanStage === currentStageKey) {
    this.data.identity.tokenImg = tokenPath;
  }

  return tokenPath;
}

async _resolveAutomaticTokensForInitialLine() {
  for (const stageKey of ["baby1", "baby2", "child"]) {
    await this._resolveAutomaticTokenForLineForm(stageKey);
  }
}

_applyLineFormToIdentity(
  stageKey = this.data.stage,
  { preserveName = true } = {}
) {
  const form = this._getLineForm(stageKey);

  if (!form?.species) return false;

  const previousSpecies = String(
    this.data.identity?.species ?? ""
  ).trim();

  const currentName = String(
    this.data.identity?.name ?? ""
  ).trim();

  // Troca nomes preenchidos automaticamente pela espécie anterior,
  // mas preserva apelidos realmente definidos pelo jogador.
  const nameWasGenerated = !currentName || (
    previousSpecies &&
    normalizeDigimonLookupName(currentName) ===
      normalizeDigimonLookupName(previousSpecies)
  );

  this.data.identity.species = form.species;
  this.data.identity.attribute =
    form.attribute ||
    this.data.identity.attribute ||
    "free";

  this.data.identity.type =
    form.type ||
    this.data.identity.type ||
    "slime";

  this.data.identity.group =
    form.group ||
    this.data.identity.group ||
    "";

  this.data.identity.field =
    form.field ||
    this.data.identity.field ||
    "unknown";

  this.data.identity.img =
    form.img ||
    this.data.identity.img ||
    "icons/svg/mystery-man.svg";

  this.data.identity.portraitImg =
    form.portraitImg || "";

  this.data.identity.tokenImg =
    form.tokenImg ||
    this.data.identity.tokenImg ||
    this.data.identity.img;

  if (!preserveName || nameWasGenerated) {
    this.data.identity.name = form.species;
  }

  return true;
}

_getInitialLineRelationOptionsTo(toId = "", fromStageKey = "") {
  const cleanToId = String(toId ?? "").trim();
  const cleanFromStageKey = this._getInitialLineStageKey(fromStageKey);

  if (!cleanToId) return [];

  const seen = new Set();

  return (DDA_INITIAL_EVOLUTION_RELATIONS ?? [])
    .filter((relation) => relation.toId === cleanToId)
    .filter((relation) => relation.fromStageKey === cleanFromStageKey)
    .map((relation) => {
      const digimon = getInitialDigimonById(relation.fromId);
      if (!digimon) return null;

        return {
          id: digimon.id,
          relationId: relation.id,
          rank: relation.rank || "alternate",
          primary: relation.rank === "primary",
          name: getInitialEvolutionDisplayName(digimon),
          originalName: getInitialEvolutionOriginalName(digimon),
          stageKey: digimon.stageKey || cleanFromStageKey,
          stageLabel: getInitialEvolutionStageLabel(digimon.stageKey || cleanFromStageKey),
          attribute: digimon.attribute || "none",
          fieldIds: Array.isArray(digimon.fieldIds) ? digimon.fieldIds : [],
          family: digimon.family || "",
          groups: Array.isArray(digimon.groups) ? digimon.groups : [],
          type: digimon.type || "",
          img: getInitialEvolutionEntryImage(digimon, "icons/svg/mystery-man.svg"),
          imageFallbacks: getInitialEvolutionEntryImageFallbackString(digimon, "icons/svg/mystery-man.svg"),
          confidence: Number(relation.confidence ?? 0),
          curationStatus: relation.curationStatus || digimon.curationStatus || "needs_review"
        };
    })
    .filter(Boolean)
    .filter((option) => {
      if (seen.has(option.id)) return false;
      seen.add(option.id);
      return true;
    })
    .sort((a, b) => {
      const rankA = a.rank === "primary" ? 0 : 1;
      const rankB = b.rank === "primary" ? 0 : 1;
      return rankA - rankB || b.confidence - a.confidence || a.name.localeCompare(b.name);
    });
}

_getBaby1OptionsForSelectedBaby2() {
  const baby2Id = String(this.data.initialLine?.baby2Id ?? "").trim();
  return this._getInitialLineRelationOptionsTo(baby2Id, "baby1");
}

_getBaby2OptionsForSelectedRookie() {
  const rookieId = String(this.data.initialLine?.rookieId ?? "").trim();
  return this._getInitialLineRelationOptionsTo(rookieId, "baby2");
}

_completeInitialLineAroundMainStage() {
  const stageKey = this._getInitialLineStageKey(this.data.stage);

  if (stageKey === "baby1") {
    const baby2Options = this._getInitialBaby2OptionsForSelectedBaby1();
    if (!this.data.initialLine.baby2Id && baby2Options.length) {
      const chosen = baby2Options.find((option) => option.primary) ?? baby2Options[0];
      this.data.initialLine.baby2Id = chosen.id;
      this._setLineFormFromEntry("baby2", getInitialDigimonById(chosen.id), { preserveImages: true });
    }

    const rookieOptions = this._getInitialRookieOptionsForSelectedBaby2();
    if (!this.data.initialLine.rookieId && rookieOptions.length) {
      const chosen = rookieOptions.find((option) => option.primary) ?? rookieOptions[0];
      this.data.initialLine.rookieId = chosen.id;
      this._setLineFormFromEntry("child", getInitialDigimonById(chosen.id), { preserveImages: true });
    }
  }

  if (stageKey === "baby2") {
    const baby1Options = this._getBaby1OptionsForSelectedBaby2();
    if (!this.data.initialLine.baby1Id && baby1Options.length) {
      const chosen = baby1Options.find((option) => option.primary) ?? baby1Options[0];
      this.data.initialLine.baby1Id = chosen.id;
      this._setLineFormFromEntry("baby1", getInitialDigimonById(chosen.id), { preserveImages: true });
    }

    const rookieOptions = this._getInitialRookieOptionsForSelectedBaby2();
    if (!this.data.initialLine.rookieId && rookieOptions.length) {
      const chosen = rookieOptions.find((option) => option.primary) ?? rookieOptions[0];
      this.data.initialLine.rookieId = chosen.id;
      this._setLineFormFromEntry("child", getInitialDigimonById(chosen.id), { preserveImages: true });
    }
  }

  if (stageKey === "child") {
    const baby2Options = this._getBaby2OptionsForSelectedRookie();
    if (!this.data.initialLine.baby2Id && baby2Options.length) {
      const chosen = baby2Options.find((option) => option.primary) ?? baby2Options[0];
      this.data.initialLine.baby2Id = chosen.id;
      this._setLineFormFromEntry("baby2", getInitialDigimonById(chosen.id), { preserveImages: true });
    }

    const baby1Options = this._getBaby1OptionsForSelectedBaby2();
    if (!this.data.initialLine.baby1Id && baby1Options.length) {
      const chosen = baby1Options.find((option) => option.primary) ?? baby1Options[0];
      this.data.initialLine.baby1Id = chosen.id;
      this._setLineFormFromEntry("baby1", getInitialDigimonById(chosen.id), { preserveImages: true });
    }
  }
}

_getInitialLineRelationOptions(fromId = "", toStageKey = "") {
  const cleanFromId = String(fromId ?? "").trim();
  if (!cleanFromId) return [];

  const rawOptions = toStageKey === "baby2"
    ? getBaby2OptionsForBaby1(cleanFromId, { includeNeedsReview: true })
    : getRookieOptionsForBaby2(cleanFromId, { includeNeedsReview: true });

  const seen = new Set();

  return rawOptions
    .map((option) => {
      const digimon = option.digimon ?? getInitialDigimonById(option.toId);
      if (!digimon) return null;

      return {
        id: digimon.id,
        relationId: option.id,
        rank: option.rank || "alternate",
        primary: option.rank === "primary",
        name: getInitialEvolutionDisplayName(digimon),
        originalName: getInitialEvolutionOriginalName(digimon),
        stageKey: digimon.stageKey || toStageKey,
        stageLabel: getInitialEvolutionStageLabel(digimon.stageKey || toStageKey),
        attribute: digimon.attribute || "none",
        fieldIds: Array.isArray(digimon.fieldIds) ? digimon.fieldIds : [],
        family: digimon.family || "",
        groups: Array.isArray(digimon.groups) ? digimon.groups : [],
        type: digimon.type || "",
        img: getInitialEvolutionEntryImage(digimon, "icons/svg/mystery-man.svg"),
        imageFallbacks: getInitialEvolutionEntryImageFallbackString(digimon, "icons/svg/mystery-man.svg"),
        confidence: Number(option.confidence ?? 0),
        curationStatus: option.curationStatus || digimon.curationStatus || "needs_review"
      };
    })
    .filter(Boolean)
    .filter((option) => {
      if (seen.has(option.id)) return false;
      seen.add(option.id);
      return true;
    })
    .sort((a, b) => {
      const rankA = a.rank === "primary" ? 0 : 1;
      const rankB = b.rank === "primary" ? 0 : 1;
      return rankA - rankB || b.confidence - a.confidence || a.name.localeCompare(b.name);
    });
}

_getInitialBaby1Entry() {
  this._syncInitialEvolutionLineFromIdentity({ preserveSelections: true });
  return getInitialDigimonById(this.data.initialLine?.baby1Id) ?? null;
}

_getMainFormOptions() {
  const stageKey = this._getInitialLineStageKey(
    this.data.stage || "child"
  );

  const selectedId = String(
    this._getLineForm(stageKey)?.id
    || (
      stageKey === "baby1"
        ? this.data.initialLine?.baby1Id
        : stageKey === "baby2"
          ? this.data.initialLine?.baby2Id
          : stageKey === "child"
            ? this.data.initialLine?.rookieId
            : ""
    )
    || ""
  ).trim();

  const usesInitialDatabase = [
    "baby1",
    "baby2",
    "child"
  ].includes(stageKey);

  const sourceEntries = usesInitialDatabase
    ? Object.values(DDA_INITIAL_DIGIMON_INDEX ?? {})
        .filter((entry) => entry?.stageKey === stageKey)
    : (this._wizardDatabaseActors ?? [])
        .filter((entry) => entry?.stageKey === stageKey);

  const seen = new Set();

  return sourceEntries
    .map((entry) => {
      const id = String(entry?.id ?? "").trim();

      if (!id || seen.has(id)) return null;
      seen.add(id);

      const imageFallbacks = usesInitialDatabase
        ? getInitialEvolutionEntryImageFallbackString(
            entry,
            "icons/svg/mystery-man.svg"
          )
        : [
            entry.imageFallbacks,
            entry.img,
            "icons/svg/mystery-man.svg"
          ]
            .filter(Boolean)
            .join("|");

      return {
        id,
        name: getInitialEvolutionDisplayName(entry),
        originalName: getInitialEvolutionOriginalName(entry),
        stageKey,
        stageLabel: getInitialEvolutionStageLabel(stageKey),
        attribute: entry.attribute || "none",
        fieldIds: Array.isArray(entry.fieldIds)
          ? entry.fieldIds
          : [],
        type: entry.type || "",
        img: usesInitialDatabase
          ? getInitialEvolutionEntryImage(
              entry,
              "icons/svg/mystery-man.svg"
            )
          : (entry.img || "icons/svg/mystery-man.svg"),
        imageFallbacks,
        selected: id === selectedId
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

_getInitialBaby1Options() {
  const selectedId = String(this.data.initialLine?.baby1Id ?? "").trim();
  const seen = new Set();

  return Object.values(DDA_INITIAL_DIGIMON_INDEX ?? {})
    .filter((entry) => entry && entry.stageKey === "baby1")
    .map((entry) => {
      if (seen.has(entry.id)) return null;
      seen.add(entry.id);

      return {
        id: entry.id,
        name: getInitialEvolutionDisplayName(entry),
        originalName: getInitialEvolutionOriginalName(entry),
        stageKey: "baby1",
        stageLabel: getInitialEvolutionStageLabel("baby1"),
        attribute: entry.attribute || "none",
        fieldIds: Array.isArray(entry.fieldIds) ? entry.fieldIds : [],
        type: entry.type || "",
        img: getInitialEvolutionEntryImage(entry, "icons/svg/mystery-man.svg"),
        curationStatus: entry.curationStatus || "needs_review",
        selected: entry.id === selectedId
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

_getInitialBaby2OptionsForSelectedBaby1() {
  const baby1Id = String(this.data.initialLine?.baby1Id ?? "").trim();
  return this._getInitialLineRelationOptions(baby1Id, "baby2");
}

_getInitialRookieOptionsForSelectedBaby2() {
  const baby2Id = String(this.data.initialLine?.baby2Id ?? "").trim();
  return this._getInitialLineRelationOptions(baby2Id, "child");
}

_getInitialLineStageKey(stageKey = this.data.stage) {
  const cleanStage = this._normalizeWizardStageKey(stageKey, "child");

  if (DDA_WIZARD_STARTING_STAGE_KEYS.includes(cleanStage)) {
    return cleanStage;
  }

  return "child";
}

_getInitialLineEntryForStage(stageKey = this.data.stage) {
  const lineStageKey = this._getInitialLineStageKey(stageKey);

  if (lineStageKey === "baby1") {
    return getInitialDigimonById(this.data.initialLine?.baby1Id) ?? null;
  }

  if (lineStageKey === "baby2") {
    return getInitialDigimonById(this.data.initialLine?.baby2Id) ?? null;
  }

  return getInitialDigimonById(this.data.initialLine?.rookieId) ?? null;
}

_getInitialLineDisplayNameKeys() {
  const entries = [
    getInitialDigimonById(this.data.initialLine?.baby1Id),
    getInitialDigimonById(this.data.initialLine?.baby2Id),
    getInitialDigimonById(this.data.initialLine?.rookieId)
  ].filter(Boolean);

  return new Set(
    entries
      .flatMap((entry) => [
        getInitialEvolutionDisplayName(entry),
        getInitialEvolutionOriginalName(entry),
        entry.id,
        entry.dub,
        entry.original,
        entry.displayName
      ])
      .map((value) => normalizeDigimonLookupName(value))
      .filter(Boolean)
  );
}

_applyInitialLineEntryToIdentityForStage(stageKey = this.data.stage) {
  const entry = this._getInitialLineEntryForStage(stageKey);
  if (!entry) return false;

  const displayName = getInitialEvolutionDisplayName(entry);
  const currentName = String(this.data.identity?.name ?? "").trim();
  const lineNameKeys = this._getInitialLineDisplayNameKeys();
  const currentNameIsLineName = currentName && lineNameKeys.has(normalizeDigimonLookupName(currentName));

  this.data.identity.species = displayName;

  if (!currentName || currentNameIsLineName) {
    this.data.identity.name = displayName;
  }

  this.data.identity.attribute = entry.attribute || this.data.identity.attribute || "none";
  this.data.identity.field = Array.isArray(entry.fieldIds) && entry.fieldIds.length
    ? entry.fieldIds[0]
    : (this.data.identity.field || "unknown");
  this.data.identity.type = entry.type || this.data.identity.type || "slime";
  this.data.identity.group = entry.family || entry.type || this.data.identity.group || "";

  const img = getInitialEvolutionEntryImage(entry, "");
  if (img && img !== "icons/svg/mystery-man.svg") {
    this.data.identity.img = img;
  }

  return true;
}

_getInitialLineValidationState() {
  this._syncInitialEvolutionLineFromIdentity({ preserveSelections: true });

  const baby1Entry = getInitialDigimonById(this.data.initialLine?.baby1Id) ?? null;
  const baby1Options = this._getInitialBaby1Options();
  const baby2Options = this._getInitialBaby2OptionsForSelectedBaby1();
  const rookieOptions = this._getInitialRookieOptionsForSelectedBaby2();

  return {
    baby1Found: Boolean(baby1Entry),
    baby1Id: baby1Entry?.id ?? "",
    baby2Id: String(this.data.initialLine?.baby2Id ?? "").trim(),
    rookieId: String(this.data.initialLine?.rookieId ?? "").trim(),
    baby1Options,
    baby2Options,
    rookieOptions
  };
}

_getInitialLineOptions() {
  this._syncLineFormsFromWizardData();

  const stageBlocks = [
    {
      stageKey: "baby1",
      title: game.i18n.localize("DDA.DigimonWizard.InitialLine.Start"),
      choiceTitle: game.i18n.localize("DDA.DigimonWizard.InitialLine.ChooseBaby1")
    },
    {
      stageKey: "baby2",
      title: game.i18n.localize("DDA.DigimonWizard.InitialLine.Baby2"),
      choiceTitle: game.i18n.localize("DDA.DigimonWizard.InitialLine.ChooseBaby2")
    },
    {
      stageKey: "child",
      title: game.i18n.localize("DDA.DigimonWizard.InitialLine.Rookie"),
      choiceTitle: game.i18n.localize("DDA.DigimonWizard.InitialLine.ChooseRookie")
    }
  ].map((block) => {
    const form = this._getLineFormViewData(block.stageKey);
    const options = this._getLineFormOptionsForStage(block.stageKey);
    const browser = this._getInitialLineBrowserState(block.stageKey);

    return {
      ...block,
      form,
      options,
      hasOptions: options.length > 0,
      isMain: block.stageKey === this._getInitialLineStageKey(this.data.stage || "child"),
      lockedByQuestionnaire: this._isQuestionnaireBaby1Locked() && block.stageKey === "baby1",
      mainLocked: false,
      browserMode: browser.mode,
      searchTerm: browser.searchTerm,
      suggestedActive: browser.mode === "suggested",
      allActive: browser.mode === "all",
      searchPlaceholder: text(
        `Buscar ${block.title}...`,
        `Search ${block.title}...`
      ),
      suggestedLabel: text("Sugeridos", "Suggested"),
      allLabel: text("Todos", "All"),
      compatibilityHint: text(
        "As primeiras opções ressoam melhor com a forma escolhida. As demais ainda podem ser usadas como linhas menos usuais.",
        "The first options resonate better with the chosen form. The others can still be used as unusual lines."
      )
    };
  });

  return {
    locked: true,
    source: this.data.initialLine?.source || "dda_initial_evolution_db_v0",
    stageBlocks,

    forms: {
      baby1: this._getLineFormViewData("baby1"),
      baby2: this._getLineFormViewData("baby2"),
      child: this._getLineFormViewData("child")
    },

    missingLineMessage: text(
      "Complete Baby I, Baby II e Rookie para criar a linha inicial.",
      "Complete Baby I, Baby II, and Rookie to create the initial line."
    ),

    noSuggestionsMessage: text(
      "Nenhuma opção encontrada para esta busca. Limpe a busca ou altere o filtro.",
      "No option was found for this search. Clear the search or change the filter."
    )
  };
}

_buildMainStatsDataFromFormBuild(build = null, fallbackBase = 1) {
  const allocation = build?.statAllocation ?? {};

  const fallbackStat = (label) => ({
    label,
    base: Number(fallbackBase ?? 1),
    spent: 0,
    total: Number(fallbackBase ?? 1)
  });

  return {
    accuracy: this._buildMainStatData(allocation.accuracy ?? fallbackStat("DDA.MainStat.Accuracy")),
    damage: this._buildMainStatData(allocation.damage ?? fallbackStat("DDA.MainStat.Damage")),
    dodge: this._buildMainStatData(allocation.dodge ?? fallbackStat("DDA.MainStat.Dodge")),
    armor: this._buildMainStatData(allocation.armor ?? fallbackStat("DDA.MainStat.Armor")),
    health: this._buildMainStatData(allocation.health ?? fallbackStat("DDA.MainStat.Health"))
  };
}

_getSpentStatDpFromFormBuild(build = null) {
  return Object.values(build?.statAllocation ?? {}).reduce((total, stat) => {
    return total + Number(stat?.spent ?? 0);
  }, 0);
}

_getSelectedQualitiesFromFormBuild(build = null) {
  const qualities = build?.qualities ?? {};

  return [
    ...(Array.isArray(qualities.positive) ? qualities.positive : []),
    ...(Array.isArray(qualities.negative) ? qualities.negative : [])
  ];
}

_getSpentQualityDpFromFormBuild(build = null) {
  return this._getSelectedQualitiesFromFormBuild(build).reduce((total, quality) => {
    if (quality?.isNegative || quality?.tier === "negative") return total;
    return total + Number(quality?.cost ?? 0);
  }, 0);
}

_buildCreationDpDataFromFormBuild(build = null, stageData = {}) {
  const dp = build?.dp ?? {};
  const spentStats = this._getSpentStatDpFromFormBuild(build);
  const spentQualities = this._getSpentQualityDpFromFormBuild(build);

  return {
    base: Number(dp.base ?? stageData?.startingDp ?? 0),
    bonus: Number(dp.bonus ?? 0),
    negative: Number(dp.negativeUsed ?? 0),
    total: Number(dp.totalAvailable ?? stageData?.startingDp ?? 0),
    spentBaseStats: spentStats,
    spentBaseQualities: spentQualities,
    spentBonusStats: 0,
    spentBonusQualities: 0,
    spentTotal: Number(dp.spent ?? (spentStats + spentQualities)),
    remaining: Number(dp.remaining ?? 0)
  };
}

_buildCoreDiscountDataFromFormBuild(build = null) {
  const dp = build?.dp ?? {};

  return {
    base: Number(dp.coreDiscountBase ?? 0),
    used: Number(dp.coreDiscountUsed ?? 0),
    spent: Number(dp.coreDiscountUsed ?? 0),
    remaining: Number(dp.coreDiscountRemaining ?? 0)
  };
}

_buildQualityLimitsFromFormBuild(build = null, stageData = {}) {
  const dp = build?.dp ?? {};

  return {
    freeQualities: {
      used: Number(dp.freeQualityUsed ?? 0),
      max: Number(dp.freeQualityLimit ?? stageData?.freeQualityLimit ?? 0)
    },
    negativeDp: {
      used: Number(dp.negativeUsed ?? 0),
      max: Number(dp.negativeLimit ?? stageData?.negativeLimit ?? 0)
    }
  };
}

_resolveSnapshotQualityAttackChoices(items = []) {
  const snapshotItems = foundry.utils.deepClone(items ?? []);
  const attackByWizardKey = new Map();

  for (const item of snapshotItems) {
    if (item?.type !== "attack") continue;

    const wizardAttackKey = String(
      item.flags?.[DDA_SYSTEM_ID]?.wizardAttackKey ||
      item.system?.wizard?.attackKey ||
      item.system?.wizard?.attackId ||
      ""
    ).trim();

    if (wizardAttackKey) {
      attackByWizardKey.set(wizardAttackKey, item);
    }

    if (item.name) {
      attackByWizardKey.set(String(item.name).trim(), item);
    }
  }

  for (const item of snapshotItems) {
    if (item?.type !== "quality") continue;

    const selectedRanks = Array.isArray(item.system?.choices?.selectedRanks)
      ? foundry.utils.deepClone(item.system.choices.selectedRanks)
      : [];

    if (!selectedRanks.length) continue;

    let changed = false;

    const nextChoices = selectedRanks.map((choice) => {
      const provisionalAttackId = String(choice.attackId ?? "").trim();
      const keyAttackPart = String(choice.key ?? "").split(":")[0] ?? "";
      const lookupKey = provisionalAttackId || keyAttackPart;

      const attack = attackByWizardKey.get(lookupKey);

      if (!attack || attack.type !== "attack") return choice;

      const wizardAttackKey = String(
        attack.flags?.[DDA_SYSTEM_ID]?.wizardAttackKey ||
        attack.system?.wizard?.attackKey ||
        lookupKey
      ).trim();

      const attackTag = String(choice.attackTag ?? "").trim().toLowerCase();

      if (attackTag) {
        attack.system ??= {};

        const currentTags = Array.isArray(attack.system.qualityTags)
          ? foundry.utils.deepClone(attack.system.qualityTags)
          : [];

        const normalizedTags = currentTags.map((tag) => String(tag).toLowerCase());

        if (!normalizedTags.includes(attackTag)) {
          currentTags.push(attackTag);
          attack.system.qualityTags = currentTags;
        }
      }

      changed = true;

      return {
        ...choice,
        key: attackTag ? `${wizardAttackKey}:${attackTag}` : wizardAttackKey,
        label: attackTag
          ? `${attack.name} — [${attackTag.toUpperCase()}]`
          : attack.name,
        originalLabel: attack.name,
        attackId: wizardAttackKey,
        attackName: attack.name,
        pendingAttackChoice: false,
        pendingAttackSlot: null
      };
    });

    if (changed) {
      item.system ??= {};
      item.system.choices ??= {};
      item.system.choices.selectedRanks = nextChoices;
    }
  }

  return snapshotItems;
}

_getSnapshotItemsForFormBuild(stageKey = "child", build = null) {
  const cleanStage = this._getInitialLineStageKey(stageKey);

  const attackItems = this._getLineAttackItemsForStage(cleanStage);

  const qualityItems = this._getSelectedQualitiesFromFormBuild(build).map((quality) => {
    return this._buildQualityItemDataFromSelection(quality);
  });

  return this._resolveSnapshotQualityAttackChoices([
    ...attackItems,
    ...qualityItems
  ]);
}

_getInitialLineFormSnapshot(entry = null, fallback = {}) {
  if (!entry) return null;

  const stageKey = String(entry.stageKey || fallback.stageKey || "baby1");
  const stageData = this._getStageOptions().find((stage) => stage.key === stageKey) ?? this._getStageOptions()[0];
  const stageValue = this._getStageValue(stageKey);
  const baseStat = 1;
  const movement = Number(stageData?.movement ?? (stageKey === "baby1" ? 2 : stageKey === "baby2" ? 2 : 3));
  const sourceFormUuid = `DDA-SNAPSHOT.${entry.id}`;
  const displayName = getInitialEvolutionDisplayName(entry);
  const originalName = getInitialEvolutionOriginalName(entry);
  const img = getInitialEvolutionEntryImage(entry, fallback.img || "icons/svg/mystery-man.svg");

  return {
    key: normalizeInitialEvolutionId(sourceFormUuid),
    sourceFormUuid,
    sourceFormName: displayName,
    name: displayName,
    img,
    portraitImg: img,
    tokenImg: img,
    species: displayName,
    stage: stageKey,
    stageValue,
    size: stageData?.maxSize ?? "medium",
    type: entry.type || fallback.type || "slime",
    attribute: entry.attribute || fallback.attribute || "none",
    field: Array.isArray(entry.fieldIds) && entry.fieldIds.length ? entry.fieldIds[0] : (fallback.field || "unknown"),
    family: entry.family || fallback.family || "none",
    group: Array.isArray(entry.groups) ? entry.groups.join(";") : "",
    profile: {
      appearance: "",
      personality: "",
      tactics: ""
    },
    mainStats: {
      accuracy: { label: "DDA.MainStat.Accuracy", base: baseStat, bonus: 0, total: baseStat },
      damage: { label: "DDA.MainStat.Damage", base: baseStat, bonus: 0, total: baseStat },
      dodge: { label: "DDA.MainStat.Dodge", base: baseStat, bonus: 0, total: baseStat },
      armor: { label: "DDA.MainStat.Armor", base: baseStat, bonus: 0, total: baseStat },
      health: { label: "DDA.MainStat.Health", base: baseStat, bonus: 0, total: baseStat }
    },
    miscStats: {
      movement: {
        label: "DDA.Resource.Movement",
        base: movement,
        bonus: 0,
        value: movement,
        total: movement
      }
    },
    creation: {
      dp: {
        base: Number(stageData?.startingDp ?? 0),
        bonus: 0,
        negative: 0,
        total: Number(stageData?.startingDp ?? 0),
        spentBaseStats: 0,
        spentBaseQualities: 0,
        spentBonusStats: 0,
        spentBonusQualities: 0,
        spentTotal: 0,
        remaining: Number(stageData?.startingDp ?? 0)
      },
      coreDiscount: {
        base: 0,
        used: 0,
        spent: 0,
        remaining: 0
      },
      buildStyle: "initialEvolutionLine"
    },
    qualityLimits: {
      freeQualities: {
        used: 0,
        max: Number(stageData?.freeQualityLimit ?? 0)
      },
      negativeDp: {
        used: 0,
        max: Number(stageData?.negativeLimit ?? 0)
      }
    },
    wizard: {
      createdByInitialLine: true,
      originalName,
      provisionalDatabase: "dda_initial_evolution_db_v0"
    },
    items: this._getLineAttackItemsForStage(stageKey),
    createdAt: fallback.now || new Date().toISOString(),
    updatedAt: fallback.now || new Date().toISOString()
  };
}

_getInitialLineFormSnapshotFromForm(stageKey = "child", form = null, fallback = {}) {
  const cleanStage = this._getInitialLineStageKey(stageKey);
  const cleanForm = form ?? this._getLineForm(cleanStage);

  if (!cleanForm?.species?.trim()) return null;

  const stageData = this._getStageOptions().find((stage) => stage.key === cleanStage) ?? this._getStageOptions()[0];
  const stageValue = this._getStageValue(cleanStage);

  const formBuild = this._usesInitialFormBuildsForMechanicalState()
    ? this._getFormBuild(cleanStage)
    : null;

  if (formBuild) {
    this._recalculateFormBuild(formBuild);
  }

  const fallbackBase = cleanStage === "baby1"
    ? 1
    : Math.max(1, this._getStageValue(cleanStage));

  const movement = Number(
    formBuild?.stats?.movement
    ?? stageData?.movement
    ?? (cleanStage === "baby1" ? 2 : cleanStage === "baby2" ? 2 : 3)
  );

  const species = cleanForm.species.trim();
  const nickname = this._getLineNicknameForSnapshots();
  const sourceId = this._getLineFormSourceId(cleanStage, cleanForm);
  const sourceFormUuid = this._getLineFormSnapshotUuid(cleanStage, cleanForm);
  const img = cleanForm.img || fallback.img || "icons/svg/mystery-man.svg";

  // Só aqui o sistema consulta o mapa: WebM se existir; WebP de portrait se não.
  const portraitImg = resolveLineFormActorPortrait(cleanForm, img);

  const tokenImg = cleanForm.tokenImg || img;

  const mainStats = formBuild
    ? this._buildMainStatsDataFromFormBuild(formBuild, fallbackBase)
    : {
        accuracy: { label: "DDA.MainStat.Accuracy", base: fallbackBase, bonus: 0, total: fallbackBase },
        damage: { label: "DDA.MainStat.Damage", base: fallbackBase, bonus: 0, total: fallbackBase },
        dodge: { label: "DDA.MainStat.Dodge", base: fallbackBase, bonus: 0, total: fallbackBase },
        armor: { label: "DDA.MainStat.Armor", base: fallbackBase, bonus: 0, total: fallbackBase },
        health: { label: "DDA.MainStat.Health", base: fallbackBase, bonus: 0, total: fallbackBase }
      };

  const creationDp = formBuild
    ? this._buildCreationDpDataFromFormBuild(formBuild, stageData)
    : {
        base: Number(stageData?.startingDp ?? 0),
        bonus: 0,
        negative: 0,
        total: Number(stageData?.startingDp ?? 0),
        spentBaseStats: 0,
        spentBaseQualities: 0,
        spentBonusStats: 0,
        spentBonusQualities: 0,
        spentTotal: 0,
        remaining: Number(stageData?.startingDp ?? 0)
      };

  const coreDiscount = formBuild
    ? this._buildCoreDiscountDataFromFormBuild(formBuild)
    : {
        base: 0,
        used: 0,
        spent: 0,
        remaining: 0
      };

  const qualityLimits = formBuild
    ? this._buildQualityLimitsFromFormBuild(formBuild, stageData)
    : {
        freeQualities: {
          used: 0,
          max: Number(stageData?.freeQualityLimit ?? 0)
        },
        negativeDp: {
          used: 0,
          max: Number(stageData?.negativeLimit ?? 0)
        }
      };

  return {
    key: normalizeInitialEvolutionId(sourceFormUuid),
    sourceFormUuid,
    sourceFormName: species,
    name: nickname || species,
    img,
    portraitImg,
    tokenImg,
    species,
    stage: cleanStage,
    stageValue,
    size: formBuild?.stats?.maxSize ?? stageData?.maxSize ?? "medium",
    type: cleanForm.type || fallback.type || "slime",
    attribute: cleanForm.attribute || fallback.attribute || "none",
    field: cleanForm.field || fallback.field || "unknown",
    family: cleanForm.group || fallback.family || "none",
    group: cleanForm.group || fallback.group || "",
    profile: {
      appearance: "",
      personality: "",
      tactics: ""
    },
    mainStats,
    miscStats: {
      movement: {
        label: "DDA.Resource.Movement",
        base: movement,
        bonus: 0,
        value: movement,
        total: movement
      }
    },
    creation: {
      dp: creationDp,
      coreDiscount,
      buildStyle: "initialEvolutionLine"
    },
    qualityLimits,
    wizard: {
      createdByInitialLine: true,
      custom: Boolean(cleanForm.custom),
      sourceId,
      originalName: cleanForm.originalName || "",
      provisionalDatabase: "dda_initial_evolution_db_v0",
      formBuild: formBuild
        ? foundry.utils.deepClone({
            stageKey: formBuild.stageKey,
            dp: formBuild.dp,
            stats: formBuild.stats,
            statAllocation: formBuild.statAllocation,
            derivedStatsPreview: formBuild.derivedStatsPreview
          })
        : null
    },
    items: this._getSnapshotItemsForFormBuild(cleanStage, formBuild),
    createdAt: fallback.now || new Date().toISOString(),
    updatedAt: fallback.now || new Date().toISOString()
  };
}

_buildInitialEvolutionLineData({ species, name, attribute, field, digimonType, group, img, stageKey, stageValue, now } = {}) {
  this._syncLineFormsFromWizardData();

  const lineStageKey = this._getInitialLineStageKey(stageKey);
  const formsByStage = {
    baby1: this._getLineForm("baby1"),
    baby2: this._getLineForm("baby2"),
    child: this._getLineForm("child")
  };

  const missingForm = Object.values(formsByStage).some((form) => !form?.species?.trim());

  if (missingForm) {
    return {
      currentFormUuid: "",
      currentFormName: name || species || "Digimon",
      forms: [],
      formSnapshots: {},
      initialLine: null,
      evolutionLine: null,
      evolutionGraph: null
    };
  }

  const currentForm = formsByStage[lineStageKey] ?? formsByStage.child;
  const currentDisplayName = currentForm.species || species || "Digimon";
  const currentImage = currentForm.img || img || "icons/svg/mystery-man.svg";

  // O WebM/WebP de portrait só é resolvido para os dados finais da linha.
  const currentPortraitImage = resolveLineFormActorPortrait(
    currentForm,
    currentImage
  );

  const currentTokenImage = currentForm.tokenImg || currentImage;

  const fallback = {
    type: digimonType,
    attribute,
    field,
    group,
    img,
    now
  };

  const currentActorPlaceholderUuid = "DDA-CURRENT-PARTNER";
  const currentActorPlaceholderNodeId = `node_${normalizeInitialEvolutionId(currentActorPlaceholderUuid)}`;

  const makeSnapshot = (entryStageKey) => {
    if (entryStageKey === lineStageKey) return null;
    return this._getInitialLineFormSnapshotFromForm(entryStageKey, formsByStage[entryStageKey], fallback);
  };

  const snapshotsByStage = {
    baby1: makeSnapshot("baby1"),
    baby2: makeSnapshot("baby2"),
    child: makeSnapshot("child")
  };

  const formSnapshots = {};

  for (const snapshot of Object.values(snapshotsByStage).filter(Boolean)) {
    formSnapshots[snapshot.key] = snapshot;
  }

  const currentSourceId = this._getLineFormSourceId(lineStageKey, currentForm);

  const currentActorNode = {
    id: currentActorPlaceholderNodeId,
    actorUuid: currentActorPlaceholderUuid,
    uuid: currentActorPlaceholderUuid,
    sourceFormUuid: currentActorPlaceholderUuid,
    sourceId: currentSourceId,
    name: name || currentDisplayName,
    displayName: currentDisplayName,
    species: currentDisplayName,
    stage: lineStageKey,
    stageValue: Number(stageValue ?? this._getStageValue(lineStageKey)),
    type: digimonType || currentForm.type || "slime",
    attribute: attribute || currentForm.attribute || "free",
    field: field || currentForm.field || "unknown",
    family: currentForm.group || "none",
    group: group || currentForm.group || "",
    img: currentImage,
    portraitImg: currentPortraitImage,
    tokenImg: currentTokenImage,
    currentActorPlaceholder: true,
    currentForm: true,
    snapshot: false,
    persistentSnapshot: false,
    originLine: true,
    locked: true,
    userEditable: false,
    source: "initialEvolutionLine"
  };

  const nodeForSnapshot = (snapshot) => ({
    id: `node_${normalizeInitialEvolutionId(snapshot.sourceFormUuid)}`,
    actorUuid: snapshot.sourceFormUuid,
    uuid: snapshot.sourceFormUuid,
    sourceFormUuid: snapshot.sourceFormUuid,
    sourceId: snapshot.sourceFormUuid.replace(/^DDA-SNAPSHOT\./, ""),
    name: snapshot.name,
    displayName: snapshot.species,
    species: snapshot.species,
    stage: snapshot.stage,
    stageValue: snapshot.stageValue,
    type: snapshot.type,
    attribute: snapshot.attribute,
    field: snapshot.field,
    family: snapshot.family,
    group: snapshot.group,
    img: snapshot.img,
    portraitImg: snapshot.portraitImg,
    tokenImg: snapshot.tokenImg,
    snapshot: true,
    persistentSnapshot: true,
    originLine: true,
    locked: true,
    userEditable: false,
    source: "initialEvolutionLine"
  });

  const nodeByStage = {
    baby1: lineStageKey === "baby1" ? currentActorNode : nodeForSnapshot(snapshotsByStage.baby1),
    baby2: lineStageKey === "baby2" ? currentActorNode : nodeForSnapshot(snapshotsByStage.baby2),
    child: lineStageKey === "child" ? currentActorNode : nodeForSnapshot(snapshotsByStage.child)
  };

  const edge = (from, to, rank = "primary") => ({
    id: `edge_${from.id}_${to.id}_normal`,
    from: from.id,
    to: to.id,
    method: "normal",
    rank,
    unlocked: true,
    originLine: true,
    locked: true,
    userEditable: false,
    source: "initialEvolutionLine"
  });

  const evolutionGraph = {
    layout: {
      mode: "solar"
    },
    nodes: [
      nodeByStage.baby1,
      nodeByStage.baby2,
      nodeByStage.child
    ].filter(Boolean),
    edges: [
      edge(nodeByStage.baby1, nodeByStage.baby2),
      edge(nodeByStage.baby2, nodeByStage.child)
    ].filter((entry) => entry.from && entry.to)
  };

  const formForStage = (entryStageKey, form, snapshot) => {
    const isCurrent = entryStageKey === lineStageKey;
    const displayName = form.species || "Digimon";
    const formImg = isCurrent
      ? currentImage
      : (snapshot?.img || form.img || "icons/svg/mystery-man.svg");
    const formTokenImg = isCurrent
      ? currentTokenImage
      : (snapshot?.tokenImg || form.tokenImg || formImg);

    const formPortraitImg = isCurrent
      ? currentPortraitImage
      : (snapshot?.portraitImg || resolveLineFormActorPortrait(form, formImg));  

    return {
      uuid: isCurrent ? currentActorPlaceholderUuid : snapshot.sourceFormUuid,
      name: isCurrent ? (name || displayName) : (snapshot.name || displayName),
displayName,
      species: displayName,
      stage: entryStageKey,
      img: formImg,
      portraitImg: formPortraitImg,
      tokenImg: formTokenImg,
      locked: true,
      originLine: true,
      currentActor: isCurrent,
      sourceId: this._getLineFormSourceId(entryStageKey, form)
    };
  };

  const evolutionLine = {
    locked: true,
    source: "dda_initial_evolution_db_v0",
    createdBy: "wizard",
    baby1Id: this._getLineFormSourceId("baby1", formsByStage.baby1),
    baby2Id: this._getLineFormSourceId("baby2", formsByStage.baby2),
    rookieId: this._getLineFormSourceId("child", formsByStage.child),
    currentStage: lineStageKey,
    forms: {
      baby1: formForStage("baby1", formsByStage.baby1, snapshotsByStage.baby1),
      baby2: formForStage("baby2", formsByStage.baby2, snapshotsByStage.baby2),
      child: formForStage("child", formsByStage.child, snapshotsByStage.child)
    }
  };

  return {
    currentFormUuid: currentActorPlaceholderUuid,
    currentFormName: name || currentDisplayName,
    forms: Object.values(evolutionLine.forms),
    formSnapshots,
    initialLine: foundry.utils.deepClone(evolutionLine),
    evolutionLine,
    evolutionGraph
  };
}

async _linkWithPendingTamer(digimonActor) {
  const tamerUuid = this.linkContext?.tamerUuid;

  if (!tamerUuid) return;

  const tamerActor = await fromUuid(tamerUuid);

  if (!tamerActor || tamerActor.type !== "character") {
    ui.notifications.warn(text("O Digi-Escolhido criado anteriormente não foi encontrado para vincular.", "The previously created Tamer could not be found for pairing."));
    return;
  }

  const compatibility = this._getCleanCompatibilityData();

  const currentFormUuid = digimonActor.system?.evolution?.currentFormUuid || digimonActor.uuid;
  const currentFormName = digimonActor.system?.evolution?.currentFormName || digimonActor.name;

  const tamerUpdate = {
    "system.partner.name": digimonActor.name,
    "system.partner.uuid": digimonActor.uuid,
    "system.partner.currentFormUuid": currentFormUuid,
    "system.partner.currentFormName": currentFormName
  };

  if (compatibility) tamerUpdate["system.compatibility"] = compatibility;

  await tamerActor.update(tamerUpdate);
  await syncTamerAndPartnerOwnership(tamerActor, digimonActor);

  const digimonUpdate = {
    "system.tamer.name": tamerActor.name,
    "system.tamer.uuid": tamerActor.uuid,
    "system.tamer.id": tamerActor.id
  };

  if (compatibility) digimonUpdate["system.compatibility"] = compatibility;

  await digimonActor.update(digimonUpdate);
  await syncTamerAndPartnerOwnership(tamerActor, digimonActor);

  ui.notifications.info(text(`${tamerActor.name} e ${digimonActor.name} foram vinculados.`, `${tamerActor.name} and ${digimonActor.name} were paired.`));
}

async _openTamerWizardAfterCreate(digimonActor) {
  const { DDATamerWizard } = await import("./dda-tamer-wizard.js");

  new DDATamerWizard({
    linkContext: {
      digimonUuid: digimonActor.uuid,
      digimonName: digimonActor.name,
      compatibility: this._getCleanCompatibilityData()
    }
  }).render(true);
}

async _finalizeInitialEvolutionLineForCreatedActor(actor) {
  if (!actor || actor.type !== "digimon") return actor;

  const placeholderUuid = "DDA-CURRENT-PARTNER";
  const system = actor.system ?? {};
  const currentLineStageKey = this._getInitialLineStageKey(system.stage || this.data.stage || "child");

  const nodeIdForUuid = (uuid = "") => {
    return `node_${String(uuid ?? "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/^_+|_+$/g, "")}`;
  };

  const currentNodeId = nodeIdForUuid(actor.uuid);

  const initialLine = foundry.utils.deepClone(system.evolution?.initialLine ?? null);
  const evolutionLine = foundry.utils.deepClone(system.evolutionLine ?? initialLine ?? null);

  const idByStage = {
    baby1: String(initialLine?.baby1Id ?? evolutionLine?.baby1Id ?? this.data.initialLine?.baby1Id ?? "").trim(),
    baby2: String(initialLine?.baby2Id ?? evolutionLine?.baby2Id ?? this.data.initialLine?.baby2Id ?? "").trim(),
    child: String(initialLine?.rookieId ?? evolutionLine?.rookieId ?? this.data.initialLine?.rookieId ?? "").trim()
  };

  const currentStageId = idByStage[currentLineStageKey] ?? "";
  const currentSnapshotUuid = currentStageId ? `DDA-SNAPSHOT.${currentStageId}` : "";

  const currentSpecies = String(actor.system?.species || actor.name || "").trim();
  const currentNameKey = normalizeDigimonLookupName(currentSpecies || actor.name);

  const graph = foundry.utils.deepClone(system.evolutionGraph ?? {
    layout: { mode: "solar" },
    nodes: [],
    edges: []
  });

  graph.layout = graph.layout ?? { mode: "solar" };
  graph.nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  graph.edges = Array.isArray(graph.edges) ? graph.edges : [];

  const idsToReplace = new Set();

  for (const node of graph.nodes) {
    const nodeId = String(node?.id ?? "").trim();
    const nodeUuid = String(node?.actorUuid || node?.uuid || node?.sourceFormUuid || "").trim();
    const nodeStage = String(node?.stage || "").trim();
    const nodeNameKey = normalizeDigimonLookupName(node?.species || node?.displayName || node?.name || "");

    const isPlaceholder =
      nodeUuid === placeholderUuid ||
      node?.currentActorPlaceholder === true;

    const isCurrentStageSnapshot =
      currentSnapshotUuid &&
      (
        nodeUuid === currentSnapshotUuid ||
        node?.actorUuid === currentSnapshotUuid ||
        node?.uuid === currentSnapshotUuid ||
        node?.sourceFormUuid === currentSnapshotUuid
      );

    const isCurrentSnapshotByName =
      node?.snapshot === true &&
      nodeStage === currentLineStageKey &&
      currentNameKey &&
      nodeNameKey === currentNameKey;

    if (nodeId && (isPlaceholder || isCurrentStageSnapshot || isCurrentSnapshotByName)) {
      idsToReplace.add(nodeId);
    }
  }

  idsToReplace.add(currentNodeId);

const currentPortraitImg = String(
  actor.system?.evolution?.portraitImg ||
  actor.flags?.[DDA_SYSTEM_ID]?.digivicePortrait ||
  actor.img ||
  "icons/svg/mystery-man.svg"
);

const currentTokenImg = String(
  actor.system?.evolution?.tokenImg ||
  actor.prototypeToken?.texture?.src ||
  currentPortraitImg ||
  actor.img ||
  "icons/svg/mystery-man.svg"
);

const currentNode = {
    id: currentNodeId,
    actorUuid: actor.uuid,
    uuid: actor.uuid,
    sourceFormUuid: actor.uuid,
    sourceId: currentStageId || system.sourceDigimon?.species || "",
    name: actor.name,
    displayName: currentSpecies || actor.name,
    species: currentSpecies || actor.name,
    stage: currentLineStageKey,
    stageValue: Number(system.stageValue ?? this._getStageValue(currentLineStageKey)),
    type: system.type || "",
    attribute: system.attribute || "",
    field: system.field || "",
    family: system.family || "",
    group: system.group || "",
    img: actor.img || "icons/svg/mystery-man.svg",
    portraitImg: currentPortraitImg,
    tokenImg: currentTokenImg,
    currentForm: true,
    originLine: true,
    locked: true,
    userEditable: false,
    source: "initialEvolutionLine"
  };

  graph.edges = graph.edges
    .map((edge) => {
      const from = idsToReplace.has(edge.from) ? currentNodeId : edge.from;
      const to = idsToReplace.has(edge.to) ? currentNodeId : edge.to;

      return {
        ...edge,
        from,
        to
      };
    })
    .filter((edge) => edge.from && edge.to && edge.from !== edge.to);

  const seenEdges = new Set();

  graph.edges = graph.edges.filter((edge) => {
    const key = `${edge.from}::${edge.to}::${edge.method ?? "normal"}`;
    if (seenEdges.has(key)) return false;
    seenEdges.add(key);
    return true;
  });

  graph.nodes = graph.nodes.filter((node) => {
    const nodeId = String(node?.id ?? "").trim();
    const nodeUuid = String(node?.actorUuid || node?.uuid || node?.sourceFormUuid || "").trim();

    if (nodeId && idsToReplace.has(nodeId)) return false;
    if (nodeUuid && nodeUuid === actor.uuid) return false;
    return true;
  });

  graph.nodes.unshift(currentNode);

  const patchLine = (lineData = null) => {
    if (!lineData || typeof lineData !== "object") return lineData;

    const nextLine = foundry.utils.deepClone(lineData);
    nextLine.forms = nextLine.forms ?? {};
    nextLine.currentStage = currentLineStageKey;

  nextLine.forms[currentLineStageKey] = {
    ...(nextLine.forms[currentLineStageKey] ?? {}),
    uuid: actor.uuid,
    name: actor.name,
    species: currentSpecies || actor.name,
    stage: currentLineStageKey,
    img: actor.img || "icons/svg/mystery-man.svg",
    portraitImg: currentPortraitImg,
    tokenImg: currentTokenImg,
    locked: true,
    originLine: true,
    currentActor: true
  };

    return nextLine;
  };

  const nextInitialLine = patchLine(initialLine);
  const nextEvolutionLine = patchLine(evolutionLine);

  const formSnapshots = foundry.utils.deepClone(system.evolution?.formSnapshots ?? {});

  for (const [key, snapshot] of Object.entries(formSnapshots)) {
    const snapshotUuid = String(snapshot?.sourceFormUuid || snapshot?.actorUuid || "").trim();
    const snapshotStage = String(snapshot?.stage || "").trim();
    const snapshotNameKey = normalizeDigimonLookupName(snapshot?.species || snapshot?.name || snapshot?.sourceFormName || "");

    const isCurrentSnapshot =
      snapshotUuid === placeholderUuid ||
      snapshotUuid === currentSnapshotUuid ||
      (
        snapshotStage === currentLineStageKey &&
        currentNameKey &&
        snapshotNameKey === currentNameKey
      );

    if (isCurrentSnapshot) {
      delete formSnapshots[key];
    }
  }

  const nextForms = nextEvolutionLine?.forms
    ? Object.values(nextEvolutionLine.forms)
    : foundry.utils.deepClone(system.evolution?.forms ?? []);

  await actor.update({
    "system.evolution.currentFormUuid": actor.uuid,
    "system.evolution.currentFormName": actor.name,
    "system.evolution.sourceFormUuid": actor.uuid,
    "system.evolution.sourceFormName": actor.name,
    "system.evolution.forms": nextForms,
    "system.evolution.formSnapshots": formSnapshots,
    "system.evolution.initialLine": nextInitialLine,
    "system.evolutionLine": nextEvolutionLine,
    "system.evolutionGraph": graph
  });

  return actor;
}

_getPartnerQuestionsData() {
  const questions = this.data.partnerQuestions ?? {};

  return {
    appearance: String(questions.appearance ?? "").trim(),
    personality: String(questions.personality ?? "").trim(),
    favoriteFood: String(questions.favoriteFood ?? "").trim(),
    goals: String(questions.goals ?? "").trim(),
    protection: String(questions.protection ?? "").trim(),
    tactics: String(questions.tactics ?? "").trim(),
    age: String(questions.age ?? "").trim(),
    selfImage: String(questions.selfImage ?? "").trim(),
    separatedReaction: String(questions.separatedReaction ?? "").trim()
  };
}

_getPartnerQuestionsSummaryData() {
  const questions = this._getPartnerQuestionsData();

  const notesKeys = [
    "favoriteFood",
    "goals",
    "protection",
    "tactics",
    "age",
    "selfImage",
    "separatedReaction"
  ];

  const notesCount = notesKeys.reduce((total, key) => {
    return total + (questions[key] ? 1 : 0);
  }, 0);

  return {
    hasAny: Object.values(questions).some((value) => Boolean(value)),
    appearanceFilled: Boolean(questions.appearance),
    personalityFilled: Boolean(questions.personality),
    notesCount
  };
}

_buildPartnerQuestionsNotesText(questions = this._getPartnerQuestionsData()) {
  const sections = [
    {
      label: text("Comida favorita / paladar", "Favorite food / eating habits"),
      value: questions.favoriteFood
    },
    {
      label: text("Sonhos, objetivos e aspirações", "Dreams, goals, and aspirations"),
      value: questions.goals
    },
    {
      label: text("Proteção do Digi-Escolhido", "Protecting the Tamer"),
      value: questions.protection
    },
    {
      label: text("Táticas preferidas", "Preferred tactics"),
      value: questions.tactics
    },
    {
      label: text("Idade e maturidade", "Age and maturity"),
      value: questions.age
    },
    {
      label: text("Autoimagem", "Self-image"),
      value: questions.selfImage
    },
    {
      label: text("Reação se separado do Digi-Escolhido", "Reaction if separated from the Tamer"),
      value: questions.separatedReaction
    }
  ].filter((section) => section.value);

  if (!sections.length) return "";

  const lines = [
    text("PERGUNTAS DO WIZARDMON", "WIZARDMON'S QUESTIONS"),
    ""
  ];

  for (const section of sections) {
    lines.push(`${section.label}:`);
    lines.push(section.value);
    lines.push("");
  }

  return lines.join("\n").trim();
}

_buildActorData() {

if (this._usesInitialFormBuildsForMechanicalState()) {
  this.data.formBuilds.activeStage = this._getPrimaryMechanicalBuildStage();
  this._syncActiveFormBuildToGlobalState();
}

this._ensureIdentityFallbacks({ resolveSource: true });

const isCompatibilityBaby1Flow = this._isCompatibilityBaby1Flow();

if (isCompatibilityBaby1Flow) {
  this._applyCompatibilityBaby1Defaults();
}

  const sourceData = this.data.identity.source ?? this._findSpeciesDataInWorldActors(
    this.data.identity.species || this.data.compatibility?.digitama?.name,
    this.data.compatibility?.digitama?.fileName || this.data.identity.species
  ) ?? this._findSpeciesDataInGlobalDatabase(
    this.data.identity.species || this.data.compatibility?.digitama?.name,
    this.data.compatibility?.digitama?.fileName || this.data.identity.species
  );

  this._syncLineFormsFromWizardData();

  const currentStageKey = this._getInitialLineStageKey(this.data.stage || "child");
  const currentLineForm = this._getLineForm(currentStageKey);

  const currentLineName = currentLineForm?.species?.trim() || "";
  const currentLineImg = currentLineForm?.img?.trim() || "";
  const currentLineTokenImg = currentLineForm?.tokenImg?.trim() || currentLineImg;

  const species = currentLineName || this.data.identity.species?.trim() || sourceData?.species || this.data.compatibility?.digitama?.name?.trim() || "Digimon";

  const rawName = this.data.identity.name?.trim() || "";
  const lineNameKeys = this._getInitialLineDisplayNameKeys();
  const rawNameIsLineName = rawName && lineNameKeys.has(normalizeDigimonLookupName(rawName));
  const name = rawName && !rawNameIsLineName ? rawName : (species || "Novo Digimon");

  const attribute = currentLineForm?.attribute || this.data.identity.attribute?.trim() || sourceData?.attribute || "free";
  const field = currentLineForm?.field || this.data.identity.field?.trim() || sourceData?.field || "unknown";
  const digimonType = currentLineForm?.type || this.data.identity.type?.trim() || sourceData?.type || "slime";
  const group = currentLineForm?.group || this.data.identity.group?.trim() || sourceData?.group || sourceData?.typeLabel || "";
const actorImg = currentLineImg ||
  this.data.identity.img ||
  sourceData?.img ||
  "icons/svg/mystery-man.svg";

// Mantém o Actor e o wizard com imagem estática.
// A ficha lê este campo para usar WebM quando existir.
const actorPortraitImg = resolveLineFormActorPortrait(
  currentLineForm,
  actorImg
);

const actorTokenImg = currentLineTokenImg ||
  this.data.identity.tokenImg ||
  actorImg;

  const stageKey = this.data.stage || "child";
  const stageValue = this._getStageValue(stageKey);
  const stageData = this._getStageOptions().find((entry) => entry.key === stageKey) ?? this._getStageOptions()[0];
  const initialSize = stageData?.maxSize ?? "medium";

  const derived = this.data.derivedStatsPreview ?? {};
  const movement = Number(this.data.stats.movement ?? stageData?.movement ?? 0);
  const woundBoxes = Number(derived.woundBoxes ?? 1);

  const now = new Date().toISOString();
  const partnerQuestions = this._getPartnerQuestionsData();
  const partnerQuestionNotes = this._buildPartnerQuestionsNotesText(partnerQuestions);
  const initialEvolutionLine = this._buildInitialEvolutionLineData({
  species,
  name,
  attribute,
  field,
  digimonType,
  group,
  img: actorImg,
  stageKey,
  stageValue,
  now
});
  const actorData = {
    name,
    type: "digimon",
    img: actorImg,
    
      prototypeToken: {
    name,
    texture: {
      src: actorTokenImg
    },
    actorLink: true
  },

    system: {
      species,
      nickname: name !== species ? name : "",
      stage: stageKey,
      stageValue,
      size: initialSize,
      field,
      attribute,
      type: digimonType,
      group,

    profile: {
      appearance: partnerQuestions.appearance,
      personality: partnerQuestions.personality || this.data.identity.description?.trim() || "",
      favoriteFood: partnerQuestions.favoriteFood,
      goals: partnerQuestions.goals,
      protection: partnerQuestions.protection,
      tactics: partnerQuestions.tactics,
      age: partnerQuestions.age,
      selfImage: partnerQuestions.selfImage,
      separatedReaction: partnerQuestions.separatedReaction
    },

      compatibility: this._getCleanCompatibilityData(),

      creation: {
        dp: {
          base: this.data.dp.base,
          bonus: 0,
          negative: 0,
          total: this.data.dp.totalAvailable,
          spentBaseStats: this._getSpentStatDp(),
          spentBaseQualities: this.data.qualities.positive.reduce((total, quality) => total + Number(quality.cost ?? 0), 0),
          spentBonusStats: 0,
          spentBonusQualities: 0,
          spentTotal: this.data.dp.spent,
          remaining: this.data.dp.remaining
        },
coreDiscount: {
  base: this.data.dp.coreDiscountBase,
  used: this.data.dp.coreDiscountUsed,
  spent: this.data.dp.coreDiscountUsed,
  remaining: this.data.dp.coreDiscountRemaining
},
        buildStyle: isCompatibilityBaby1Flow ? "compatibilityBaby1" : "wizard"
      },

      qualityLimits: {
        freeQualities: {
          used: this.data.dp.freeQualityUsed,
          max: this.data.dp.freeQualityLimit
        },
        negativeDp: {
          used: this.data.dp.negativeUsed,
          max: this.data.dp.negativeLimit
        }
      },

      mainStats: {
        accuracy: this._buildMainStatData(this.data.statAllocation.accuracy),
        damage: this._buildMainStatData(this.data.statAllocation.damage),
        dodge: this._buildMainStatData(this.data.statAllocation.dodge),
        armor: this._buildMainStatData(this.data.statAllocation.armor),
        health: this._buildMainStatData(this.data.statAllocation.health)
      },

      derivedStats: {
        bit: this._buildDerivedStatData("DDA.DerivedStat.BIT", derived.bit),
        dos: this._buildDerivedStatData("DDA.DerivedStat.DOS", derived.dos),
        ram: this._buildDerivedStatData("DDA.DerivedStat.RAM", derived.ram),
        cpu: this._buildDerivedStatData("DDA.DerivedStat.CPU", derived.cpu)
      },

      miscStats: {
        movement: {
          label: "DDA.Resource.Movement",
          base: movement,
          bonus: 0,
          qualityBonus: 0,
          effectBonus: 0,
          value: movement,
          total: movement
        },
        wounds: {
          label: "DDA.Resource.WoundBoxes",
          value: woundBoxes,
          max: woundBoxes,
          temp: {
            value: 0,
            source: "",
            duration: ""
          }
        },
        range: {
          label: "DDA.Resource.Range",
          value: Number(derived.range ?? 3)
        },
        effectiveLimit: {
          label: "DDA.Resource.EffectiveLimit",
          value: Number(derived.effectiveLimit ?? 3)
        },
        initiative: {
          label: "DDA.Resource.Initiative",
          value: Number(derived.initiative ?? 0)
        },
        resistance: {
          label: "DDA.Resource.Resistance",
          value: Math.floor(Number(derived.dos ?? 1) / 2)
        },
        clash: {
          label: "DDA.Resource.Clash",
          value: Number(derived.cpu ?? 1) + Number(derived.ram ?? 1)
        }
      },

      resources: {
        battery: {
          value: 0,
          max: 3
        },
        resolve: {
          enabled: false,
          value: 0,
          max: 4
        },
        creationLimit: {
          enabled: false,
          value: 0,
          max: 0
        },
        mood: {
          enabled: false,
          value: 3,
          die: "1d6"
        }
      },

      currentMovementType: "land",
      movementTypes: {},

        signatureMove: {
          batteryCost: 1,
          notes: ""
        },

        notes: partnerQuestionNotes,

        evolution: {
        defaultStage: stageKey,
        currentStage: stageKey,
        currentFormUuid: initialEvolutionLine.currentFormUuid || "",
        currentFormName: initialEvolutionLine.currentFormName || name,
        sourceFormUuid: initialEvolutionLine.currentFormUuid || "",
        sourceFormName: initialEvolutionLine.currentFormName || name,
        portraitImg: actorPortraitImg,
        tokenImg: actorTokenImg,
        unlockedStages: this._getUnlockedStagesFor(stageKey),
        forms: initialEvolutionLine.forms ?? [],
        formSnapshots: initialEvolutionLine.formSnapshots ?? {},
        initialLine: initialEvolutionLine.initialLine ?? null
      },

      wizard: {
        createdByWizard: true,
        createdAt: now,
        compatibility: this._getCleanCompatibilityData(),
        partnerQuestions: foundry.utils.deepClone(partnerQuestions),
        statAllocation: foundry.utils.deepClone(this.data.statAllocation),
        derivedStatsPreview: foundry.utils.deepClone(this.data.derivedStatsPreview)
      }
    }
  };

  if (initialEvolutionLine.evolutionGraph) {
    actorData.system.evolutionGraph = foundry.utils.deepClone(initialEvolutionLine.evolutionGraph);
  } else if (sourceData?.evolutionGraph) {
    actorData.system.evolutionGraph = foundry.utils.deepClone(sourceData.evolutionGraph);
  }

  if (initialEvolutionLine.evolutionLine) {
    actorData.system.evolutionLine = foundry.utils.deepClone(initialEvolutionLine.evolutionLine);
  } else if (sourceData?.evolutionLine) {
    actorData.system.evolutionLine = foundry.utils.deepClone(sourceData.evolutionLine);
  }

  if (sourceData?.evolution) {
    actorData.system.compendiumEvolution = foundry.utils.deepClone(sourceData.evolution);
  }

  actorData.system.sourceDigimon = {
    source: sourceData?.source ?? "wizard",
    sourceActorUuid: sourceData?.sourceActorUuid ?? "",
    species: sourceData?.species ?? species
  };

  return actorData;
}

_buildMainStatData(stat) {
  const startingBase = Number(stat.base ?? 0);
  const spent = Number(stat.spent ?? 0);

  const base = startingBase + spent;
  const bonus = 0;
  const qualityBonus = 0;
  const total = base + bonus + qualityBonus;

  return {
    label: stat.label ?? "",
    base,
    bonus,
    qualityBonus,
    total,

    value: total,

    creation: {
      startingBase,
      spent
    }
  };
}

_buildDerivedStatData(label, value) {
  const base = Number(value ?? 0);
  const bonus = 0;
  const qualityBonus = 0;
  const total = base + bonus + qualityBonus;

  return {
    label,
    base,
    bonus,
    qualityBonus,
    total,
    value: total
  };
}

async _resolveWizardQualityAttackChoices(actor, createdItems = []) {
  if (!actor?.items) return;

  const attackByWizardKey = new Map();

  const allAttacks = Array.from(actor.items).filter((item) => item.type === "attack");

  for (const attack of allAttacks) {
    const wizardAttackKey = String(
      attack.flags?.[DDA_SYSTEM_ID]?.wizardAttackKey ||
      attack.system?.wizard?.attackKey ||
      ""
    ).trim();

    if (wizardAttackKey) {
      attackByWizardKey.set(wizardAttackKey, attack);
    }
  }

  const allQualities = Array.from(actor.items).filter((item) => item.type === "quality");

  for (const quality of allQualities) {
    const selectedRanks = Array.isArray(quality.system?.choices?.selectedRanks)
      ? foundry.utils.deepClone(quality.system.choices.selectedRanks)
      : [];

    if (!selectedRanks.length) continue;

    let changedQuality = false;

    const nextChoices = selectedRanks.map((choice) => {
      const provisionalAttackId = String(choice.attackId ?? "").trim();
      const keyAttackPart = String(choice.key ?? "").split(":")[0] ?? "";
      const lookupKey = provisionalAttackId || keyAttackPart;

      const attack = attackByWizardKey.get(lookupKey) || actor.items.get(provisionalAttackId);

      if (!attack || attack.type !== "attack") return choice;

      const attackTag = String(choice.attackTag ?? "").trim().toLowerCase();

      if (attackTag) {
        const currentTags = Array.isArray(attack.system?.qualityTags)
          ? foundry.utils.deepClone(attack.system.qualityTags)
          : [];

        const normalizedTags = currentTags.map((tag) => String(tag).toLowerCase());

        if (!normalizedTags.includes(attackTag)) {
          currentTags.push(attackTag);
          attack.update({ "system.qualityTags": currentTags });
        }
      }

      changedQuality = true;

      return {
        ...choice,
        key: attackTag ? `${attack.id}:${attackTag}` : attack.id,
        label: attackTag
          ? `${attack.name} — [${attackTag.toUpperCase()}]`
          : attack.name,
        originalLabel: attack.name,
        attackId: attack.id,
        attackName: attack.name,
        pendingAttackChoice: false,
        pendingAttackSlot: null
      };
    });

    if (changedQuality) {
      await quality.update({
        "system.choices.selectedRanks": nextChoices
      });
    }
  }
}

_buildQualityItemDataFromSelection(quality) {
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

      cost: quality.costData ?? {
        dp: Number(quality.baseCost ?? quality.cost ?? 0),
        perRank: Boolean(quality.perRank),
        grantsDp: Boolean(quality.grantsDp)
      },

      rank: quality.rank ?? {
        value: 1,
        max: 1,
        limited: false
      },

      rankLimit: quality.rankLimit ?? null,
      stageRequirement: quality.stageRequirement ?? {},

      requirements: quality.requirements ?? {},
      incompatible: quality.incompatible ?? {},
      requiredFor: quality.requiredFor ?? [],

      choices: quality.choices ?? {},

      attackModifier: quality.attackModifier ?? {},
      grants: quality.grants ?? {},

      activation: quality.activation ?? {},
      uses: quality.uses ?? {},

      effect: quality.effect ?? "",
      description: quality.description ?? ""
    }
  };
}

  _validate() {
    this._ensureCompatibilityIdentityResolved();

    const errors = [];
    const warnings = [];
    const isFormSnapshotMode = this.mode === "formSnapshot";

    if (!isFormSnapshotMode && (this.currentStep === "identity" || this.currentStep === "summary")) {
      this._ensureIdentityFallbacks({ resolveSource: true });
    }

    const name = this.data.identity.name?.trim();
    const species = this.data.identity.species?.trim();

    if (this.currentStep === "compatibility" && this._getCompatibilityAnswerList().length < DDA_COMPATIBILITY_QUESTIONS.length) {
      errors.push(text("Responda todas as perguntas de compatibilidade ou volte e pule o questionário.", "Answer all compatibility questions or go back and skip the questionnaire."));
    }

    if (this.currentStep === "digitama" && !this.data.compatibility.digitama?.key) {
      errors.push(text("Escolha um Digitama para concluir a compatibilidade.", "Choose a Digitama to finish compatibility."));
    }

    if (!isFormSnapshotMode && this.currentStep === "summary") {
      if (!species && !name) {
        errors.push(text("Informe a espécie ou o nome do Digimon.", "Enter the Digimon species or name."));
      }
    }

    if (this.currentStep === "stage" || this.currentStep === "summary") {
      if (!this.data.stage) {
        errors.push(text("Escolha um estágio inicial.", "Choose a starting stage."));
      }
    }

    const selectedStage = this._getStageOptions().find((stage) => stage.key === this.data.stage);

    if (!selectedStage) {
      errors.push(text("O estágio selecionado não é válido.", "The selected stage is not valid."));
    }

    if (["adult", "perfect", "ultimate"].includes(this.data.stage)) {
      warnings.push(text("Este estágio é mais indicado para campanhas avançadas.", "This stage is better suited for advanced campaigns."));
    }

if (!isFormSnapshotMode && (this.currentStep === "evolutionLine" || this.currentStep === "summary")) {
  this._syncLineFormsFromWizardData();

  const baby1Species = String(this.data.lineForms?.baby1?.species ?? "").trim();
  const baby2Species = String(this.data.lineForms?.baby2?.species ?? "").trim();
  const rookieSpecies = String(this.data.lineForms?.child?.species ?? "").trim();

  if (!baby1Species) {
    errors.push(text("Informe ou escolha a forma Bebê I da linha inicial.", "Enter or choose the Baby I form for the initial line."));
  }

  if (!baby2Species) {
    errors.push(text("Informe ou escolha a forma Bebê II / Em Treinamento da linha inicial.", "Enter or choose the Baby II / In-Training form for the initial line."));
  }

  if (!rookieSpecies) {
    errors.push(text("Informe ou escolha a forma Criança / Rookie da linha inicial.", "Enter or choose the Child / Rookie form for the initial line."));
  }
}

    if (["stats", "qualities", "summary"].includes(this.currentStep)) {
      if (this._usesInitialFormBuildsForMechanicalState()) {
        errors.push(...this._getFormBuildValidationErrors());
      } else if (this.currentStep === "qualities" || this.currentStep === "summary") {
        const incompatibilityErrors = this._getSelectedQualityIncompatibilityErrors();

        for (const error of incompatibilityErrors) {
          errors.push(error);
        }

        if (this.data.dp.remaining < 0) {
          errors.push(text("Você gastou mais PD do que possui. Remova Qualidades ou escolha Qualidades Negativas.", "You spent more DP than you have. Remove Qualities or choose Negative Qualities."));
        }

        if (this.data.dp.negativeUsed > this.data.dp.negativeLimit) {
          errors.push(text("Você excedeu o limite de PD Negativo para este estágio.", "You exceeded the Negative DP limit for this stage."));
        }

        if (
          this.data.dp.freeQualityLimit > 0 &&
          this.data.dp.freeQualityUsed > this.data.dp.freeQualityLimit
        ) {
          errors.push(text("Você excedeu o limite de Qualidades Gratuitas para este estágio.", "You exceeded the Free Quality limit for this stage."));
        }
      }
    }

    this.data.validation.errors = errors;
    this.data.validation.warnings = warnings;
  }

  _canAdvance() {
    if (this.currentStep === "welcome") return true;
    if (this.currentStep === "origin") {
  return ["existing", "custom"].includes(this.data.creationMode);
}

    if (this.currentStep === "compatibilityIntro") {
      return this.data.compatibility.wantsQuestionnaire !== null;
    }

    if (this.currentStep === "compatibility") {
      return this._getCompatibilityAnswerList().length >= DDA_COMPATIBILITY_QUESTIONS.length;
    }

    if (this.currentStep === "digitama") {
      return Boolean(this.data.compatibility.digitama?.key);
    }

if (this.currentStep === "identity") {
  const species = String(this.data.identity?.species ?? "").trim();
  return Boolean(species);
}

if (this.currentStep === "evolutionLine") {
  this._syncLineFormsFromWizardData();

  return Boolean(
    String(this.data.lineForms?.baby1?.species ?? "").trim()
    && String(this.data.lineForms?.baby2?.species ?? "").trim()
    && String(this.data.lineForms?.child?.species ?? "").trim()
  );
}

if (this.currentStep === "buildTemplate") {
  return Boolean(this._getSelectedBuildTemplate());
}

if (this.currentStep === "templateChoices") {
  return this._allBuildTemplateChoicesResolved();
}

if (this.currentStep === "partnerQuestions") {
  return true;
}

    if (this.currentStep === "stage") {
      return Boolean(this.data.stage);
    }

    if (this.currentStep === "stats") {
      if (this._usesInitialFormBuildsForMechanicalState()) {
        return this._formBuildsAreValidForAdvance();
      }

      return this.data.dp.remaining >= 0;
    }

    if (this.currentStep === "qualities") {
      if (this._usesInitialFormBuildsForMechanicalState()) {
        return this._formBuildsAreValidForAdvance();
      }

      const freeOk = this.data.dp.freeQualityLimit <= 0
        || this.data.dp.freeQualityUsed <= this.data.dp.freeQualityLimit;

      const incompatibilityOk = this._getSelectedQualityIncompatibilityErrors().length === 0;

      return this.data.dp.remaining >= 0
        && this.data.dp.negativeUsed <= this.data.dp.negativeLimit
        && freeOk
        && incompatibilityOk;
    }

    return this.data.validation.errors.length === 0;
  }

_recalculateStageData() {
  const stage = this._getStageOptions().find(stage => stage.key === this.data.stage);

  if (!stage) return;

  this._recalculateStatAllocation(stage);

  const spentStats = this._getSpentStatDp();

  const coreDiscountBase = this._getCoreDiscountBase(this.data.stage);
  const coreDiscount = this._recalculateQualityCosts(coreDiscountBase);

  const spentQualities = this.data.qualities.positive.reduce((total, quality) => {
    return total + Number(quality.cost ?? 0);
  }, 0);

  const bonusFromNegativeQualities = this.data.qualities.negative.reduce((total, quality) => {
    return total + Number(quality.cost ?? 0);
  }, 0);

  const freeQualityUsed = this._getFreeQualityUsed?.() ?? 0;

  const formBonusDp = stage.key === "baby1" ? 0 : this._getFormBonusDp();
  const totalAvailable = stage.startingDp + formBonusDp + bonusFromNegativeQualities;
  const spentPositive = spentStats + spentQualities;
  const remaining = totalAvailable - spentPositive;

  this.data.dp.base = stage.startingDp;
  this.data.dp.bonus = formBonusDp;
  this.data.dp.totalAvailable = totalAvailable;
  this.data.dp.spent = spentPositive;
  this.data.dp.remaining = remaining;

  this.data.dp.negativeUsed = bonusFromNegativeQualities;
  this.data.dp.negativeLimit = stage.negativeLimit ?? 0;

  this.data.dp.freeQualityUsed = freeQualityUsed;
  this.data.dp.freeQualityLimit = stage.freeQualityLimit ?? 0;

  this.data.dp.coreDiscountBase = coreDiscountBase;
  this.data.dp.coreDiscountUsed = coreDiscount.used;
  this.data.dp.coreDiscountRemaining = coreDiscount.remaining;

  this.data.stats.movement = stage.movement;
  this.data.stats.attackSlots = stage.attacks;
  this.data.stats.maxSize = stage.maxSize;

  this._recalculateDerivedStatsPreview();
}

_isFreeQuality(quality = {}) {
  const tier = String(quality?.tier ?? quality?.originalTier ?? "").trim().toLowerCase();

  return tier === "free"
    || Boolean(quality?.category?.free)
    || Boolean(quality?.costData?.free)
    || Boolean(quality?.cost?.free);
}

_qualityCountsAgainstFreeLimit(quality = {}) {
  if (!this._isFreeQuality(quality)) return false;

  // Se um dia precisarmos de uma Free que realmente não conte,
  // usamos um campo explícito diferente do antigo countsAgainstFreeLimit false.
  return !Boolean(
    quality?.doesNotCountAgainstFreeLimit
    || quality?.costData?.doesNotCountAgainstFreeLimit
    || quality?.cost?.doesNotCountAgainstFreeLimit
  );
}

_canTakeFreeQuality(quality, ownedEntry = null) {
  if (!this._isFreeQuality(quality)) return true;
  if (!this._qualityCountsAgainstFreeLimit(quality)) return true;

  const limit = Number(this.data.dp.freeQualityLimit ?? 0);

  if (limit <= 0) return false;

  const used = Number(this.data.dp.freeQualityUsed ?? 0);

  if (ownedEntry) {
    return used <= limit;
  }

  return used + 1 <= limit;
}

_getFreeQualityBlockedReason() {
  return text(`Limite de Qualidades Gratuitas atingido: ${this.data.dp.freeQualityUsed}/${this.data.dp.freeQualityLimit}.`, `Free Quality limit reached: ${this.data.dp.freeQualityUsed}/${this.data.dp.freeQualityLimit}.`);
}

_getSpentStatDp() {
  return Object.values(this.data.statAllocation ?? {}).reduce((total, stat) => {
    return total + Number(stat.spent ?? 0);
  }, 0);
}

_getFormBonusDp() {
  if (this.mode !== "formSnapshot") return 0;

  /*
   * evolution.js já calcula o orçamento utilizável desta forma:
   * total compartilhado menos o que as OUTRAS formas consumiram.
   *
   * Zero é um valor válido e não pode cair em fallback global.
   */
  const value = Number(this.formContext?.bonusDp);

  return Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

_recalculateStatAllocation(stage = null) {
  const selectedStage = stage ?? this._getStageOptions().find(entry => entry.key === this.data.stage);
  const stageKey = selectedStage?.key ?? this.data.stage ?? "child";
  const baseValue = Math.max(1, this._getStageValue(stageKey));

  for (const stat of Object.values(this.data.statAllocation ?? {})) {
    stat.base = baseValue;
    stat.total = Number(stat.base ?? 0) + Number(stat.spent ?? 0);
  }
}

_recalculateDerivedStatsPreview() {
  const stats = this.data.statAllocation;
  const derived = this.data.derivedStatsPreview;

  const accuracy = Number(stats.accuracy?.total ?? 1);
  const damage = Number(stats.damage?.total ?? 1);
  const dodge = Number(stats.dodge?.total ?? 1);
  const armor = Number(stats.armor?.total ?? 1);
  const health = Number(stats.health?.total ?? 1);

  const stageValue = this._getStageValue(this.data.stage);

  derived.bit = Math.max(1, Math.floor(accuracy / 3));
  derived.dos = Math.max(1, Math.floor(damage / 3));
  derived.ram = Math.max(1, Math.floor(dodge / 3));
  derived.cpu = Math.max(1, Math.floor(armor / 3));

  derived.woundBoxes = stageValue + (health * 2);
  derived.range = 3 + derived.bit;
  derived.effectiveLimit = derived.range + stageValue;
  derived.initiative = derived.ram;
}

_getStageValue(stageKey) {
  const configValue = CONFIG.DDA?.stages?.[stageKey]?.stageValue;

  if (Number.isFinite(Number(configValue))) {
    return Number(configValue);
  }

  const values = {
    baby1: 1,
    baby2: 1,
    child: 2,
    adult: 3,
    perfect: 4,
    ultimate: 5,
    mega: 5,
    ultimatePlus: 5
  };

  return values[stageKey] ?? 0;
}

_getUnlockedStagesFor(stageKey) {
  const order = ["baby1", "baby2", "child", "adult", "perfect", "ultimate", "ultimatePlus"];
  const index = Math.max(0, order.indexOf(stageKey));

  return order.slice(0, index + 1);
}

_normalizeWizardStageKey(stageKey = "", fallback = "child") {
  const cleanStage = String(stageKey ?? "").trim();

  if (cleanStage === "mega") return "ultimate";
  if (DDA_WIZARD_STAGE_ORDER.includes(cleanStage)) return cleanStage;

  return fallback;
}

_getValidPartnerStartingStageKeys() {
  return DDA_WIZARD_STARTING_STAGE_KEYS;
}

_getOriginLineStageKey(stageKey = this.data.stage) {
  return this._getInitialLineStageKey(stageKey);
}

_getEffectivePartnerStartingStage() {
  const validStages = this._getValidPartnerStartingStageKeys();

  const candidates = [
    this.linkContext?.startingStage,
    this.linkContext?.startingStageOverride,
    this.formContext?.tamerActor?.system?.partner?.startingStageOverride,
    getWorldSetting("defaultPartnerStartingStage", "child")
  ];

  for (const candidate of candidates) {
    const stageKey = this._normalizeWizardStageKey(candidate, "");

    if (validStages.includes(stageKey)) {
      return stageKey;
    }
  }

  return "child";
}

_getPartnerStartingStageWizardData(stageKey = null) {
  const maximumStage = this._normalizeWizardStageKey(
    stageKey || this._getEffectivePartnerStartingStage()
  );

  const maximumLabel = this._getStageLabel(maximumStage);

  return {
    effectiveStage: maximumStage,
    maximumStage,
    effectiveLabel: maximumLabel,
    limitLabel: text("Limite da campanha", "Campaign limit"),
    locked: false,
    hint: text(
      `O Narrador liberou parceiros até ${maximumLabel}. Você pode iniciar em qualquer estágio normal anterior ou nesse estágio.`,
      `The GM has unlocked partners up to ${maximumLabel}. You may start at any normal stage before it or at that stage.`
    )
  };
}

_isStageLockedByStartingStage(stageKey = "") {
  if (this.mode === "formSnapshot") return false;

  const maximumStage = this._normalizeWizardStageKey(
    this.data.partnerStartingStage?.maximumStage
    || this.data.partnerStartingStage?.effectiveStage
    || this._getEffectivePartnerStartingStage()
  );

  const selectedStage = this._normalizeWizardStageKey(stageKey, "");

  const maximumIndex = DDA_WIZARD_STAGE_ORDER.indexOf(maximumStage);
  const selectedIndex = DDA_WIZARD_STAGE_ORDER.indexOf(selectedStage);

  if (maximumIndex < 0 || selectedIndex < 0) return true;

  return selectedIndex > maximumIndex;
}

_getStageOptions() {
  const effectiveStartingStage = this.data.partnerStartingStage?.effectiveStage
    || this._getEffectivePartnerStartingStage();

  return [
    {
      key: "baby1",
        label: getConfiguredDigimonStageLabel("baby1", { fallback: text("Bebê I", "Baby I") }),
        startingDp: 0,
        movement: 2,
        attacks: 1,
        maxSize: "small",
        maxSizeLabel: text("Pequeno", "Small"),
        negativeLimit: 0,
        freeQualityLimit: 0,
        recommendation: text("O início da jornada, com o parceiro recém-nascido. Tem stats fixos, sem Qualidades e sem Bonus DP.", "The beginning of the journey, with a newborn partner. It has fixed stats, no Qualities, and no Bonus DP."),
        recommended: true
      },
      {
        key: "baby2",
        label: getConfiguredDigimonStageLabel("baby2", { fallback: text("Bebê II", "Baby II") }),
        startingDp: 5,
        movement: 2,
        attacks: 1,
        maxSize: "medium",
        maxSizeLabel: text("Médio", "Medium"),
        negativeLimit: 2,
        freeQualityLimit: 1,
        recommendation: text("Bom para começar com um parceiro um pouco mais ativo.", "Good for starting with a slightly more active partner."),
        recommended: true
      },
      {
        key: "child",
        label: getConfiguredDigimonStageLabel("child", { fallback: text("Criança", "Rookie") }),
        startingDp: 10,
        movement: 3,
        attacks: 3,
        maxSize: "large",
        maxSizeLabel: text("Grande", "Large"),
        negativeLimit: 5,
        freeQualityLimit: 1,
        recommendation: text("Recomendado para aventuras já começando no ritmo clássico.", "Recommended for adventures that already start at the classic pace."),
        recommended: true
      },
      {
        key: "adult",
        label: getConfiguredDigimonStageLabel("adult", { fallback: text("Adulto", "Champion") }),
        startingDp: 20,
        movement: 4,
        attacks: 3,
        maxSize: "huge",
        maxSizeLabel: text("Enorme", "Huge"),
        negativeLimit: 10,
        freeQualityLimit: 1,
        recommendation: text("Indicado para campanhas mais avançadas.", "Recommended for more advanced campaigns."),
        recommended: false
      },
      {
        key: "perfect",
        label: getConfiguredDigimonStageLabel("perfect", { fallback: text("Perfeito", "Ultimate") }),
        startingDp: 30,
        movement: 5,
        attacks: 3,
        maxSize: "gigantic",
        maxSizeLabel: text("Gigantesco", "Gigantic"),
        negativeLimit: 15,
        freeQualityLimit: 1,
        recommendation: text("Use apenas se o Narrador quiser começar em nível alto.", "Use only if the GM wants to start at a high level."),
        recommended: false
      },
{
  key: "ultimate",
  label: getConfiguredDigimonStageLabel("ultimate", { fallback: text("Mega", "Mega") }),
  startingDp: 40,
  movement: 6,
  attacks: 4,
  maxSize: "colossal",
  maxSizeLabel: text("Colossal", "Colossal"),
  negativeLimit: 20,
  freeQualityLimit: 1,
  recommendation: text("Estágio final. Melhor para campanhas muito específicas.", "Final stage. Best for very specific campaigns."),
  recommended: false
},
{
  key: "ultimatePlus",
  label: getConfiguredDigimonStageLabel("ultimatePlus", { fallback: text("Mega+", "Mega+") }),
  startingDp: 50,
  movement: 7,
  attacks: 4,
  maxSize: "colossal",
  maxSizeLabel: text("Colossal", "Colossal"),
  negativeLimit: 25,
  freeQualityLimit: 1,
  recommendation: text("Acima do Mega. Use apenas com aprovação do Narrador.", "Beyond Mega. Use only with GM approval."),
  recommended: false
}
].map((stage) => {
  const lockedByStartingStage = this._isStageLockedByStartingStage(
    stage.key
  );

  return {
    ...stage,
    campaignLimit: stage.key === effectiveStartingStage,
    selectedByStartingStage: false,
    lockedByStartingStage
  };
});
}

  _getProgressLabel() {
const labels = {
  welcome: text("Boas-vindas", "Welcome"),
  compatibilityIntro: text("Compatibilidade", "Compatibility"),
  compatibility: text("Questionário", "Questionnaire"),
  digitama: "Digitama",
  partnerQuestions: text("Sobre o Parceiro", "About Partner"),
  origin: text("Origem", "Origin"),
  identity: text("Forma Principal", "Main Form"),
  evolutionLine: text("Linha Inicial", "Initial Line"),
  buildTemplate: text("Build Pronta", "Ready Build"),
  templateChoices: text("Escolhas da Build", "Build Choices"),
  stage: text("Estágio Principal", "Main Stage"),
  stats: this.mode === "formSnapshot" ? text("Atributos da Forma", "Form Attributes") : text("Atributos", "Attributes"),
  qualities: this.mode === "formSnapshot" ? text("Qualidades da Forma", "Form Qualities") : text("Qualidades", "Qualities"),
  summary: this.mode === "formSnapshot" ? text("Salvar Forma", "Save Form") : text("Revisão", "Review")
};

    return labels[this.currentStep] ?? "Wizard";
  }

  _getProgressSteps() {
    return this.steps.map((step, index) => {
      return {
        key: step,
        active: index === this.stepIndex,
        done: index < this.stepIndex
      };
    });
  }

async _onAddQuality(event) {
  event.preventDefault();
  if (this._usesInitialFormBuildsForMechanicalState()) {
  const activeBuild = this._getActiveFormBuild();

  if (activeBuild?.locked) {
    ui.notifications.warn(text(
      "Esta forma possui uma build fixa e não pode receber Qualidades.",
      "This form has a fixed build and cannot receive Qualities."
    ));
    return;
  }

  this._syncActiveFormBuildToGlobalState();
}
  const button = event.currentTarget;
  const qualityId = button.dataset.qualityId || button.dataset.addQuality;

  if (!qualityId) return;

  const quality = this._getAvailableQualities().find((entry) => entry.id === qualityId);
  if (!quality) return;

  const existing = this._getSelectedQualityById(quality.id);

  if (existing) {
    const effectiveMax = this._getQualityEffectiveMaxForWizard(quality);
    const currentRank = Number(existing.rank?.value ?? 1);
    const nextRank = currentRank + 1;

    if (effectiveMax > 0 && currentRank >= effectiveMax) {
      ui.notifications.warn(text(`${quality.name} já está no Rank máximo para este Digimon.`, `${quality.name} is already at maximum Rank for this Digimon.`));
      return;
    }

    const increaseCost = this._getQualityRankIncreaseCostInfo(quality);

    if (increaseCost.effectiveCost > this.data.dp.remaining) {
      ui.notifications.warn(text("PD insuficiente para aumentar o Rank desta Qualidade.", "Not enough DP to increase this Quality Rank."));
      return;
}

    const existingChoices = Array.isArray(existing.choices?.selectedRanks)
      ? foundry.utils.deepClone(existing.choices.selectedRanks)
      : [];

    if (quality.choices?.required) {
      const choice = await this._promptQualityChoice(quality, nextRank, existingChoices);

      if (!choice) return;

      existing.choices = {
        ...(quality.choices ?? {}),
        ...(existing.choices ?? {}),
        selectedRanks: [
          ...existingChoices,
          choice
        ]
      };
    }

    existing.rank = existing.rank ?? {};
    existing.rank.value = nextRank;

    existing.cost = this._calculateSelectedQualityCost(quality, existing.rank.value);

    if (this._usesInitialFormBuildsForMechanicalState()) {
      this._syncGlobalStateToActiveFormBuild();
      this._syncActiveFormBuildToGlobalState();
    }

    this.render(false);
    return;
  }

  const conflict = this._getQualityIncompatibilityConflict(quality);

  if (conflict) {
    ui.notifications.warn(conflict.message);
    return;
  }

  const prepared = this._prepareQualityForBrowser(quality);

  if (!prepared.canBuy) {
    ui.notifications.warn(prepared.blockedReason || text("Esta Qualidade não pode ser adicionada agora.", "This Quality cannot be added right now."));
    return;
  }

  const selectedRanks = [];

  if (quality.choices?.required) {
    const choice = await this._promptQualityChoice(quality, 1, []);

    if (!choice) return;

    selectedRanks.push(choice);
  }

  const targetList = quality.kind === "negative"
    ? this.data.qualities.negative
    : this.data.qualities.positive;

  targetList.push({
    id: quality.id,
    name: quality.name,
    originalName: quality.originalName,
    section: quality.section,
    tier: quality.tier,
    originalTier: quality.originalTier,
    availability: quality.availability,

    cost: this._calculateSelectedQualityCost(quality, 1),
    costData: quality.costData,
    baseCost: this._getQualityBaseDpCost(quality),
    fullCost: this._getQualityFullCost(quality, 1),
    coreDiscountUsed: 0,
    discountedByCore: false,

    kind: quality.kind,
    grantsDp: quality.grantsDp,
    perRank: quality.perRank,
    coreDiscountAvailable: quality.coreDiscountAvailable,
    isCore: quality.isCore,
    isFree: quality.isFree,
    isNegative: quality.isNegative,
    countsAgainstFreeLimit: quality.countsAgainstFreeLimit,

    rank: {
      ...(quality.rank ?? {}),
      value: 1
    },
    rankLimit: quality.rankLimit,

    category: quality.category,
    stageRequirement: quality.stageRequirement,
    requirements: quality.requirements,
    incompatible: quality.incompatible,
    requiredFor: quality.requiredFor,

    choices: {
      ...(quality.choices ?? {}),
      selectedRanks
    },

    attackModifier: quality.attackModifier,
    grants: quality.grants,
    activation: quality.activation,
    uses: quality.uses,

    effect: quality.effect,
    description: quality.description
  });

  if (this._usesInitialFormBuildsForMechanicalState()) {
  this._syncGlobalStateToActiveFormBuild();
  this._syncActiveFormBuildToGlobalState();
}

this.render(false);
}

_getFreeQualityUsed() {
  return [
    ...this.data.qualities.positive,
    ...this.data.qualities.negative
  ].reduce((total, quality) => {
    if (!this._isFreeQuality(quality)) return total;
    if (!this._qualityCountsAgainstFreeLimit(quality)) return total;

    return total + Math.max(1, Number(quality.rank?.value ?? 1));
  }, 0);
}

async _promptQualityChoice(quality, rankNumber, existingChoices = []) {
  const choices = quality.choices ?? {};

  if (!choices.required) {
    return null;
  }

const isAttackChoice = ["singleAttack", "attackTag"].includes(choices.type);
const options = isAttackChoice
  ? this._getAttackChoiceOptionsForQuality(quality, existingChoices)
  : Array.isArray(choices.options) ? choices.options : [];

if (!options.length) {
  ui.notifications.warn(
    isAttackChoice
      ? text(`${quality.name} exige um ataque, mas o Digimon ainda não possui ataques disponíveis.`, `${quality.name} requires an attack, but this Digimon has no available attacks.`)
      : text(`${quality.name} exige uma escolha, mas não possui opções configuradas.`, `${quality.name} requires a choice, but has no configured options.`)
  );
  return null;
}

const usedKeys = new Set(
  existingChoices
    .map((choice) => isAttackChoice ? choice.attackId : choice.key)
    .filter(Boolean)
);

const availableOptions = options.filter((option) => {
  if (!choices.cannotRepeat && !isAttackChoice) return true;
  const key = isAttackChoice ? option.attackId : option.key;
  return !usedKeys.has(key);
});

  if (!availableOptions.length) {
    ui.notifications.warn(text(`${quality.name} não possui mais opções disponíveis.`, `${quality.name} has no available options left.`));
    return null;
  }

const optionHtml = availableOptions
  .map((option) => {
    const key = this._escapeHtml(option.key);
    const label = this._escapeHtml(option.label ?? option.key);
    const originalLabel = option.originalLabel
      ? ` (${this._escapeHtml(option.originalLabel)})`
      : "";

    return `<option value="${key}">${label}${originalLabel}</option>`;
  })
  .join("");

  const effectsHtml = availableOptions
    .map((option) => {
      const label = this._escapeHtml(option.label ?? option.key);
      const effect = this._escapeHtml(option.effect ?? "");

      if (!effect) return "";

      return `
        <li>
          <strong>${label}:</strong>
          <span>${effect}</span>
        </li>
      `;
    })
    .filter(Boolean)
    .join("");

  const selectedKey = await new Promise((resolve) => {
    new Dialog({
      title: text(`${quality.name} — Escolha do Rank ${rankNumber}`, `${quality.name} — Rank ${rankNumber} Choice`),
      content: `
        <form class="dda-quality-choice-form">
          <div class="form-group">
            <label>${this._escapeHtml(choices.label ?? text("Escolha", "Choice"))}</label>

            <select name="choiceKey">
              ${optionHtml}
            </select>
          </div>

          <p class="notes">
            ${text(`Esta escolha será registrada no Rank ${rankNumber}.`, `This choice will be recorded at Rank ${rankNumber}.`)}
          </p>

          ${effectsHtml ? `
            <div class="dda-quality-choice-effects">
              <strong>${text("Opções disponíveis:", "Available options:")}</strong>
              <ul>
                ${effectsHtml}
              </ul>
            </div>
          ` : ""}
        </form>
      `,
      buttons: {
        confirm: {
          label: text("Confirmar", "Confirm"),
          callback: (html) => {
            const value = html.find
              ? html.find("[name='choiceKey']").val()
              : html[0]?.querySelector("[name='choiceKey']")?.value;

            resolve(value);
          }
        },
        cancel: {
          label: text("Cancelar", "Cancel"),
          callback: () => resolve(null)
        }
      },
      close: () => resolve(null),
      default: "confirm"
    }).render(true);
  });

  if (!selectedKey) return null;

  const selectedOption = availableOptions.find((option) => String(option.key) === String(selectedKey));

  if (!selectedOption) return null;

  return {
    rank: rankNumber,
    key: selectedOption.key,
    label: selectedOption.label ?? selectedOption.key,
    originalLabel: selectedOption.originalLabel ?? "",
    derivedStat: selectedOption.derivedStat ?? "",
    attackId: selectedOption.attackId ?? "",
    attackName: selectedOption.attackName ?? "",
    attackTag: selectedOption.attackTag ?? "",
    effect: selectedOption.effect ?? "",
    pendingAttackChoice: Boolean(selectedOption.pendingAttackChoice),
    pendingAttackSlot: selectedOption.pendingAttackSlot ?? null,
    dataOptimization: selectedOption.dataOptimization ?? "",
    dataOptimizationLabel: selectedOption.dataOptimizationLabel ?? "",
    category: foundry.utils.deepClone(selectedOption.category ?? {}),
    grants: foundry.utils.deepClone(selectedOption.grants ?? {})
  };
}

_getWizardAttackItemsForChoices() {
  if (this._isFutureFormWizard()) {
    const stageKey = this._normalizeWizardStageKey(
      this.data.stage || "child",
      "child"
    );

    return this._initializeFutureFormAttackSlots()
      .map((attack, index) => {
        const name = String(attack.name ?? "").trim();
        if (!name) return null;

        const wizardAttackKey = this._getWizardAttackKey(stageKey, index);

        return {
          id: wizardAttackKey,
          name,
          type: "attack",
          wizardAttackKey,
          slotNumber: index + 1,
          system: {
            baseTags: {
              rangeType: attack.rangeType,
              functionType: attack.functionType
            },
            qualityTags: [],
            tags: [],
            wizard: {
              attackKey: wizardAttackKey,
              stage: stageKey,
              slot: index + 1
            }
          }
        };
      })
      .filter(Boolean);
  }

  const partnerActor = this.formContext?.partnerActor ?? null;

  if (this.mode === "formSnapshot" && partnerActor?.items) {
    return Array.from(partnerActor.items)
      .filter((item) => item.type === "attack")
      .map((attack, index) => ({
        id: attack.id,
        name: attack.name ?? text(`Ataque ${index + 1}`, `Attack ${index + 1}`),
        type: "attack",
        system: attack.system ?? {}
      }))
      .filter((attack) => attack.id && attack.name);
  }

  const currentStageKey = this._usesInitialFormBuildsForMechanicalState()
    ? this._getInitialLineStageKey(this.data.formBuilds?.activeStage ?? this._getPrimaryMechanicalBuildStage())
    : this._getInitialLineStageKey(this.data.stage || "child");

  const currentForm = this.data.lineForms?.[currentStageKey];

  if (currentForm) {
    const lineAttacks = this._getLineFormAttackSlots(currentStageKey)
      .map((attack, index) => {
        const name = String(attack.name ?? "").trim();
        if (!name) return null;

        const wizardAttackKey = this._getWizardAttackKey(currentStageKey, index);

        return {
          id: wizardAttackKey,
          name,
          type: "attack",
          wizardAttackKey,
          slotNumber: index + 1,
          system: {
            baseTags: {
              rangeType: ["melee", "range"].includes(attack.rangeType) ? attack.rangeType : "melee",
              functionType: ["damage", "support"].includes(attack.functionType) ? attack.functionType : "damage"
            },
            qualityTags: [],
            tags: [],
            wizard: {
              attackKey: wizardAttackKey,
              stage: currentStageKey,
              slot: index + 1
            }
          }
        };
      })
      .filter(Boolean);

    if (lineAttacks.length) return lineAttacks;
  }

  const snapshotItems = Array.isArray(this.formContext?.snapshot?.items)
    ? this.formContext.snapshot.items
    : [];

  const snapshotAttacks = snapshotItems
    .filter((item) => item.type === "attack")
    .map((attack, index) => ({
      id: String(
        attack._id ??
        attack.id ??
        attack.system?.sourceId ??
        attack.name ??
        `snapshot-attack-${index}`
      ),
      name: attack.name ?? text(`Ataque ${index + 1}`, `Attack ${index + 1}`),
      type: "attack",
      system: attack.system ?? {}
    }))
    .filter((attack) => attack.id && attack.name);

  if (snapshotAttacks.length) return snapshotAttacks;

  return [];
}

_getAttackChoiceOptionsForQuality(quality, existingChoices = []) {
  const attacks = this._getWizardAttackItemsForChoices();
  const modifier = quality.attackModifier ?? {};
  const grantsTags = Array.isArray(modifier.grantsTags) ? modifier.grantsTags : [];
  const primaryTag = grantsTags[0] ?? quality.id ?? "quality";
  const normalizedPrimaryTag = String(primaryTag).toLowerCase();
  const appliesTo = String(modifier.appliesTo ?? "oneAttack");

  const usedAttackIds = new Set(
    existingChoices
      .map((choice) => choice.attackId)
      .filter(Boolean)
  );

  return attacks
    .filter((attack) => this._attackMatchesQualityAppliesTo(attack, appliesTo))
    .filter((attack) => !usedAttackIds.has(attack.id))
    .filter((attack) => {
      const tags = [
        ...(Array.isArray(attack.system?.qualityTags) ? attack.system.qualityTags : []),
        ...(Array.isArray(attack.system?.tags) ? attack.system.tags : [])
      ].map((tag) => String(tag).toLowerCase());

      return !tags.includes(normalizedPrimaryTag);
    })
      .map((attack) => {
      const isPendingSlot = Boolean(attack.pendingWizardAttackSlot);
      const tagLabel = `[${String(normalizedPrimaryTag).toUpperCase()}]`;

      return {
        key: `${attack.id}:${normalizedPrimaryTag}`,
        label: isPendingSlot
          ? text(`${attack.name} — ${tagLabel} (configurar depois)`, `${attack.name} — ${tagLabel} (configure later)`)
          : `${attack.name} — ${tagLabel}`,
        originalLabel: isPendingSlot ? "" : attack.name,
        attackId: isPendingSlot ? "" : attack.id,
        attackName: attack.name,
        attackTag: normalizedPrimaryTag,
        pendingAttackChoice: isPendingSlot,
        pendingAttackSlot: isPendingSlot ? attack.slotNumber : null,
        effect: isPendingSlot
          ? text(
              `${attack.name} receberá ${tagLabel} quando o ataque real for criado/configurado.`,
              `${attack.name} will receive ${tagLabel} once the real attack is created/configured.`
            )
          : text(
              `${attack.name} recebe ${tagLabel}.`,
              `${attack.name} gains ${tagLabel}.`
            )
      };
    });
}

_attackMatchesQualityAppliesTo(attack, appliesTo = "") {
  const rangeType = String(
    attack.system?.baseTags?.rangeType ??
    attack.system?.rangeType ??
    attack.system?.range?.type ??
    ""
  );

  const functionType = String(
    attack.system?.baseTags?.functionType ??
    attack.system?.functionType ??
    attack.system?.function?.type ??
    ""
  );

  if (appliesTo === "oneDamageAttack" || appliesTo === "damage") return functionType === "damage";
  if (appliesTo === "oneMeleeAttack" || appliesTo === "melee") return rangeType === "melee";
  if (appliesTo === "oneRangedAttack" || appliesTo === "range" || appliesTo === "ranged") return ["range", "ranged"].includes(rangeType);

  return true;
}

_escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

_getQualityEffectiveMaxForWizard(quality) {
  const rankLimit = quality.rankLimit ?? null;

  if (rankLimit?.type === "derivedStat") {
    const statKey = rankLimit.stat;
    return Number(this.data.derivedStatsPreview?.[statKey] ?? quality.rank?.max ?? 1);
  }

  if (rankLimit?.type === "byStage" || rankLimit?.type === "byStageMaxFour") {
    const byStage = rankLimit.byStage ?? {};
    const stageKey = this._getActiveMechanicalStageKeyForWizard();
    const stageMax = Number(byStage[stageKey] ?? quality.rank?.max ?? 1);

    if (rankLimit.type === "byStageMaxFour") {
      return Math.min(stageMax, 4);
    }

    return stageMax;
  }

  return Number(quality.rank?.max ?? 1);
}

_getQualityBaseDpCost(quality) {
  if (this._isFreeQuality(quality)) return 0;

  const rawCost = quality?.baseCost
    ?? quality?.costData?.dp
    ?? (typeof quality?.cost === "object" ? quality.cost?.dp : quality?.cost)
    ?? 0;

  const numericCost = Number(rawCost);
  return Number.isFinite(numericCost) ? Math.abs(numericCost) : 0;
}

_qualityCostsPerRank(quality) {
  return Boolean(
    quality?.perRank
    || quality?.costData?.perRank
    || quality?.cost?.perRank
  );
}

_calculateSelectedQualityCost(quality, rankValue = 1) {
  if (this._isFreeQuality(quality)) return 0;
  const baseCost = this._getQualityBaseDpCost(quality);

  if (this._qualityCostsPerRank(quality)) {
    const rank = Math.max(1, Number(rankValue ?? quality?.rank?.value ?? 1));
    return baseCost * rank;
  }

  return baseCost;
}
async _onRemoveQuality(event) {
  event.preventDefault();

  if (this._usesInitialFormBuildsForMechanicalState()) {
    this._syncActiveFormBuildToGlobalState();
  }

  const button = event.currentTarget;
  const qualityId = button.dataset.qualityId;
  const kind = button.dataset.kind;

  if (!qualityId || !kind) return;

  const list = kind === "negative"
    ? this.data.qualities.negative
    : this.data.qualities.positive;

  const index = list.findIndex((entry) => entry.id === qualityId);

  if (index >= 0) {
    list.splice(index, 1);

    if (this._usesInitialFormBuildsForMechanicalState()) {
      this._syncGlobalStateToActiveFormBuild();
      this._syncActiveFormBuildToGlobalState();
    }

    this.render(false);
  }
}
_getAvailableQualities() {
  return DDA_DIGIMON_QUALITIES.map((quality) => {
    const isNegative = quality.tier === "negative" || Boolean(quality.category?.negative);
    const isFree = quality.tier === "free" || Boolean(quality.category?.free);
    const dpCost = Number(quality.cost?.dp ?? 0);

return {
  id: quality.id,
  name: quality.name,
  originalName: quality.originalName ?? "",
  section: quality.section ?? "",
  tier: quality.tier ?? "starting",
  originalTier: quality.originalTier ?? "",
  availability: foundry.utils.deepClone(quality.availability ?? {}),

  cost: isFree ? 0 : Math.abs(dpCost),
  costData: foundry.utils.deepClone(quality.cost ?? {}),

  kind: isNegative ? "negative" : "positive",
  isNegative,
  isFree,

  isCore: Boolean(quality.category?.core),
  coreDiscountAvailable: Boolean(quality.cost?.coreDiscountAvailable),

  grantsDp: Boolean(quality.cost?.grantsDp),
  perRank: Boolean(quality.cost?.perRank),
  countsAgainstFreeLimit: isFree,

  rank: foundry.utils.deepClone(quality.rank ?? {}),
  rankLimit: foundry.utils.deepClone(quality.rankLimit ?? {}),

  category: foundry.utils.deepClone(quality.category ?? {}),
  stageRequirement: foundry.utils.deepClone(quality.stageRequirement ?? {}),
  requirements: foundry.utils.deepClone(quality.requirements ?? {}),
  incompatible: foundry.utils.deepClone(quality.incompatible ?? {}),
  requiredFor: foundry.utils.deepClone(quality.requiredFor ?? []),
  choices: foundry.utils.deepClone(quality.choices ?? {}),

  attackModifier: foundry.utils.deepClone(quality.attackModifier ?? {}),
  grants: foundry.utils.deepClone(quality.grants ?? {}),
  activation: foundry.utils.deepClone(quality.activation ?? {}),
  uses: foundry.utils.deepClone(quality.uses ?? {}),

  effect: quality.effect ?? "",
  description: quality.description ?? quality.effect ?? ""
};
  });
}

_getSelectedQualityIds() {
  return [
    ...this.data.qualities.positive.map((quality) => quality.id),
    ...this.data.qualities.negative.map((quality) => quality.id)
  ];
}

_getQualityTiers() {
  return [
    { key: "all", label: text("Todas", "All") },
    { key: "starting", label: text("Iniciais", "Starting") },
    { key: "champion", label: text("Adulto", "Champion") },
    { key: "perfect", label: text("Perfeito", "Ultimate") },
    { key: "mega", label: text("Mega", "Mega") },
    { key: "free", label: text("Gratuitas", "Free") },
    { key: "negative", label: text("Negativas", "Negative") }
  ];
}

_getQualityCategories() {
  return [
    {
      key: "all",
      label: text("Todas", "All")
    },
    {
      key: "core",
      label: text("Core", "Core")
    },
    {
      key: "attack",
      label: text("Ataque", "Attack")
    },
    {
      key: "trigger",
      label: text("Ativáveis", "Active")
    },
    {
      key: "static",
      label: text("Passivas", "Passive")
    },
    {
      key: "free",
      label: text("Grátis", "Free")
    },
    {
      key: "negative",
      label: text("Negativas", "Negative")
    }
  ];
}

_normalizeQualitySearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

_getQualitySearchTerms(searchTerm) {
  const stopWords = new Set([
    "a", "o", "as", "os",
    "um", "uma", "uns", "umas",
    "de", "da", "do", "das", "dos",
    "em", "no", "na", "nos", "nas",
    "para", "por", "com", "e", "ou",
    "the", "of", "and", "or", "to", "with"
  ]);

  return this._normalizeQualitySearchText(searchTerm)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !stopWords.has(term));
}

_matchesQualitySearch(quality, searchTerm) {
  const query = this._normalizeQualitySearchText(searchTerm);

  if (!query) return true;

  const terms = this._getQualitySearchTerms(query);

  const nameHaystack = this._normalizeQualitySearchText([
    quality.name,
    quality.originalName
  ]
    .filter(Boolean)
    .join(" "));

  const metaHaystack = this._normalizeQualitySearchText([
    quality.section,
    quality.availability?.label,
    quality.tierLabel,
    quality.categoryLabel,
    quality.requirements?.text,
    quality.incompatible?.text
  ]
    .filter(Boolean)
    .join(" "));

  const fullHaystack = this._normalizeQualitySearchText([
    quality.name,
    quality.originalName,
    quality.section,
    quality.availability?.label,
    quality.tierLabel,
    quality.categoryLabel,
    quality.requirements?.text,
    quality.incompatible?.text,
    quality.effect,
    quality.description
  ]
    .filter(Boolean)
    .join(" "));

  if (nameHaystack.includes(query)) return true;
  if (metaHaystack.includes(query)) return true;
  if (fullHaystack.includes(query)) return true;

  if (!terms.length) return false;

  if (terms.every((term) => nameHaystack.includes(term))) return true;
  return terms.every((term) => fullHaystack.includes(term));
}

_getFilteredQualities() {
  const searchTerm = String(this.data.qualityBrowser.searchTerm ?? "").trim();
  const activeTier = this.data.qualityBrowser.activeTier ?? "all";
  const activeCategory = this.data.qualityBrowser.activeCategory ?? "all";
  const onlyAvailable = Boolean(this.data.qualityBrowser.onlyAvailable);

  return this._getAvailableQualities()
    .map((quality) => this._prepareQualityForBrowser(quality))
    .filter((quality) => {
      if (activeTier !== "all" && quality.tier !== activeTier) return false;

      if (activeCategory !== "all") {
        if (!quality.category?.[activeCategory]) return false;
      }

      if (onlyAvailable && !quality.canBuy && !quality.owned && !quality.canIncreaseRank) return false;

      return this._matchesQualitySearch(quality, searchTerm);
    });
}

_prepareQualityForBrowser(quality) {
  const ownedEntry = this._getSelectedQualityById(quality.id);
  const owned = Boolean(ownedEntry);

  const rankValue = Number(ownedEntry?.rank?.value ?? quality.rank?.value ?? 1);
  const effectiveMax = this._getQualityEffectiveMaxForWizard(quality);
  const hasAvailableRank = effectiveMax > 0;
  const canIncreaseRank = owned && hasAvailableRank && rankValue < effectiveMax;

  const availabilityCheck = this._checkQualityAvailability(quality);
  const purchaseCost = this._getQualityPurchaseCostInfo(quality);
  const canAfford = quality.kind === "negative"
    ? this.data.dp.negativeUsed + this._getQualityFullCost(quality, 1) <= this.data.dp.negativeLimit
    : this.data.dp.remaining >= Number(purchaseCost.effectiveCost ?? 0);
  const canTakeFreeQuality = this._canTakeFreeQuality(quality, ownedEntry);

  const incompatibilityConflict = this._getQualityIncompatibilityConflict(quality);

  const canBuy = !owned
    && availabilityCheck.available
    && canAfford
    && canTakeFreeQuality
    && !incompatibilityConflict;

  let blockedReason = "";

      if (incompatibilityConflict) {
        blockedReason = incompatibilityConflict.message;
      } else if (!availabilityCheck.available) {
        blockedReason = availabilityCheck.reason;
      } else if (!canAfford) {
    blockedReason = quality.kind === "negative"
      ? text("Excede o limite de PD Negativo deste estágio.", "Exceeds the Negative DP limit for this stage.")
      : text("PD insuficiente.", "Not enough DP.");
  } else if (!canTakeFreeQuality) {
    blockedReason = this._getFreeQualityBlockedReason();
  }


    return {
      ...quality,

      owned,
      ownedItemId: ownedEntry?.id ?? "",
      canBuy,
      canIncreaseRank,
      blockedReason,

      isNegative: quality.kind === "negative",
      isFree: this._isFreeQuality(quality),

      tierLabel: this._getQualityAvailabilityLabel(quality),
      costLabel: this._getQualityCostLabel(quality, purchaseCost),
      originalName: this._getQualityOriginalNameForDisplay(quality),

      showRankInfo: Boolean(quality.perRank || quality.rank?.limited || quality.rank?.max),
  rankLabel: this._getQualityRankLabel(quality, ownedEntry, effectiveMax)
    };
}

_getQualityOriginalNameForDisplay(quality) {
  const name = String(quality?.name ?? "").trim();
  const originalName = String(quality?.originalName ?? "").trim();

  if (!originalName) return "";
  if (normalizeDigimonLookupName(name) === normalizeDigimonLookupName(originalName)) return "";

  return originalName;
}

_getQualityAvailabilityLabel(quality) {
  const rawLabel = String(quality?.availability?.label ?? "").trim();
  const tierLabel = this._getTierLabel(quality?.tier);

  if (!rawLabel) return tierLabel;

  const normalized = normalizeDigimonLookupName(rawLabel);

  const labelMap = {
    qualidadeinicial: text("Qualidade Inicial", "Starting Quality"),
    startingquality: text("Qualidade Inicial", "Starting Quality"),
    qualidadedeadulto: text("Qualidade de Adulto", "Champion Quality"),
    adultquality: text("Qualidade de Adulto", "Champion Quality"),
    championquality: text("Qualidade de Adulto", "Champion Quality"),
    qualidadedeperfeito: text("Qualidade de Perfeito", "Ultimate Quality"),
    perfectquality: text("Qualidade de Perfeito", "Ultimate Quality"),
    ultimatequality: text("Qualidade de Perfeito", "Ultimate Quality"),
    qualidadedemega: text("Qualidade de Mega", "Mega Quality"),
    megaquality: text("Qualidade de Mega", "Mega Quality"),
    qualidadegratuita: text("Qualidade Gratuita", "Free Quality"),
    freequality: text("Qualidade Gratuita", "Free Quality"),
    qualidadenegativa: text("Qualidade Negativa", "Negative Quality"),
    negativequality: text("Qualidade Negativa", "Negative Quality")
  };

  return labelMap[normalized] ?? rawLabel;
}

_getQualityIdentityKeys(quality = {}) {
  return [
    quality.id,
    quality.name,
    quality.originalName,
    quality.system?.sourceId,
    quality.system?.originalName
  ]
    .map((value) => normalizeDigimonLookupName(value))
    .filter(Boolean);
}

_getQualityIncompatibleNames(quality = {}) {
  const raw = String(quality?.incompatible?.qualityNames ?? "").trim();

  if (!raw) return [];

  return raw
    .split(/[,;|]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => normalizeDigimonLookupName(entry))
    .filter(Boolean);
}

_qualityReferencesQuality(sourceQuality = {}, targetQuality = {}) {
  const incompatibleNames = this._getQualityIncompatibleNames(sourceQuality);
  if (!incompatibleNames.length) return false;

  const targetKeys = this._getQualityIdentityKeys(targetQuality);

  return incompatibleNames.some((name) => {
    return targetKeys.includes(name);
  });
}

_hasWeaponInstinctBypass(selectedQualities = null) {
  const qualities = selectedQualities ?? [
    ...this.data.qualities.positive,
    ...this.data.qualities.negative
  ];

  return qualities.some((quality) => {
    return Boolean(quality?.grants?.ignoresWeaponInstinctIncompatibility);
  });
}

_isWeaponInstinctPair(left = {}, right = {}) {
  const leftKeys = this._getQualityIdentityKeys(left);
  const rightKeys = this._getQualityIdentityKeys(right);

  const leftIsWeapon = leftKeys.includes("weapon") || leftKeys.includes("arma");
  const leftIsInstinct = leftKeys.includes("instinct") || leftKeys.includes("instinto");
  const rightIsWeapon = rightKeys.includes("weapon") || rightKeys.includes("arma");
  const rightIsInstinct = rightKeys.includes("instinct") || rightKeys.includes("instinto");

  return (leftIsWeapon && rightIsInstinct) || (leftIsInstinct && rightIsWeapon);
}

_getQualityIncompatibilityConflict(candidateQuality = null) {
  if (!candidateQuality) return null;

  const selectedQualities = [
    ...this.data.qualities.positive,
    ...this.data.qualities.negative
  ];

  for (const selected of selectedQualities) {
    if (!selected || selected.id === candidateQuality.id) continue;

    if (
      this._isWeaponInstinctPair(candidateQuality, selected) &&
      this._hasWeaponInstinctBypass([...selectedQualities, candidateQuality])
    ) {
      continue;
    }

  const weaponInstinctConflict = this._isWeaponInstinctPair(candidateQuality, selected);
  const candidateBlocksSelected = this._qualityReferencesQuality(candidateQuality, selected);
  const selectedBlocksCandidate = this._qualityReferencesQuality(selected, candidateQuality);

  if (weaponInstinctConflict || candidateBlocksSelected || selectedBlocksCandidate) {
      return {
        candidate: candidateQuality,
        selected,
        message: text(
          `${candidateQuality.name} é incompatível com ${selected.name}.`,
          `${candidateQuality.name} is incompatible with ${selected.name}.`
        )
      };
    }
  }

  return null;
}

_getSelectedQualityIncompatibilityErrors() {
  const selectedQualities = [
    ...this.data.qualities.positive,
    ...this.data.qualities.negative
  ];

  const errors = [];

  for (let index = 0; index < selectedQualities.length; index += 1) {
    const left = selectedQualities[index];

    for (let compareIndex = index + 1; compareIndex < selectedQualities.length; compareIndex += 1) {
      const right = selectedQualities[compareIndex];

      if (
        this._isWeaponInstinctPair(left, right) &&
        this._hasWeaponInstinctBypass(selectedQualities)
      ) {
        continue;
      }

    const conflict =
      this._isWeaponInstinctPair(left, right) ||
      this._qualityReferencesQuality(left, right) ||
      this._qualityReferencesQuality(right, left);

    if (!conflict) continue;

      errors.push(text(
        `${left.name} é incompatível com ${right.name}. Remova uma delas.`,
        `${left.name} is incompatible with ${right.name}. Remove one of them.`
      ));
    }
  }

  return errors;
}

_getSelectedQualityById(qualityId) {
  return [
    ...this.data.qualities.positive,
    ...this.data.qualities.negative
  ].find((quality) => quality.id === qualityId);
}

_getTierLabel(tier) {
  const tiers = this._getQualityTiers();
  return tiers.find((entry) => entry.key === tier)?.label ?? tier ?? "Qualidade";
}

_getQualityCostLabel(quality, costInfo = null) {
  if (quality.kind === "negative") {
    const cost = this._getQualityFullCost(quality, quality?.rank?.value ?? 1);
    return `+${cost} ${text("PD", "DP")}`;
  }

  if (quality.isFree) return text("Grátis", "Free");

  const info = costInfo ?? this._getQualityPurchaseCostInfo(quality);

  if (info.coreDiscountUsed > 0) {
    if (info.effectiveCost <= 0) {
      return `0 ${text("PD", "DP")} (${text("Core", "Core")} -${info.coreDiscountUsed})`;
    }

    return `${info.effectiveCost} ${text("PD", "DP")} (${text("Core", "Core")} -${info.coreDiscountUsed})`;
  }

  if (quality.perRank) return `${info.effectiveCost} ${text("PD", "DP")} / ${text("Rank", "Rank")}`;

  return `${info.effectiveCost} ${text("PD", "DP")}`;
}

_getQualityRankLabel(quality, ownedEntry = null, effectiveMax = null) {
  const currentRank = Number(ownedEntry?.rank?.value ?? quality.rank?.value ?? 1);
  const maxRank = Number(effectiveMax ?? quality.rank?.max ?? 0);

  if (maxRank > 0) return `${text("Rank", "Rank")} ${currentRank} / ${maxRank}`;
  if (quality.perRank) return `${text("Rank", "Rank")} ${currentRank}`;

  return text("Rank único", "Single rank");
}

_checkQualityAvailability(quality) {
  const stageOrder = {
  baby1: 0,
  baby2: 1,
  child: 2,
  adult: 3,
  perfect: 4,
  ultimate: 5,
  mega: 5,
  ultimatePlus: 6
};

  const currentStageValue = stageOrder[this._getActiveMechanicalStageKeyForWizard()] ?? 0;

  const minimumStage =
    quality.stageRequirement?.minimum ||
    quality.availability?.minimumStage ||
    "";

  const maximumStage = quality.stageRequirement?.maximum || "";

  if (minimumStage) {
    const minimumValue = stageOrder[minimumStage] ?? 0;

    if (currentStageValue < minimumValue) {
      return {
        available: false,
        reason: text(`Requer estágio ${this._getStageLabel(minimumStage)} ou superior.`, `Requires stage ${this._getStageLabel(minimumStage)} or higher.`)
      };
    }
  }

  if (maximumStage) {
    const maximumValue = stageOrder[maximumStage] ?? 999;

    if (currentStageValue > maximumValue) {
      return {
        available: false,
        reason: text(`Disponível apenas até o estágio ${this._getStageLabel(maximumStage)}.`, `Available only up to stage ${this._getStageLabel(maximumStage)}.`)
      };
    }
  }

  return {
    available: true,
    reason: ""
  };
}

_getStageLabel(stageKey) {
  return getConfiguredDigimonStageLabel(stageKey, {
    fallback: String(stageKey || "")
  });
}

_getGuideData() {
  if (this.mode === "formSnapshot") {
    const dp = this.data.dp ?? {};
    const formName = this.data.identity?.name || this.formContext?.formTemplateActor?.name || "Digimon";
const guides = {
  stats: {
        title: text("Wizardmon ajusta a forma atual:", "Wizardmon adjusts the current form:"),
        text: text(`Você está editando a build de ${formName}. O PD total desta forma usa o PD base do estágio somado ao Bonus DP persistente do parceiro. Restante: ${dp.remaining ?? 0}/${dp.totalAvailable ?? 0}.`, `You are editing ${formName}'s build. This form's total DP uses the stage base DP plus the partner's persistent Bonus DP. Remaining: ${dp.remaining ?? 0}/${dp.totalAvailable ?? 0}.`)
      },
      qualities: {
        title: text("Wizardmon abre as Qualidades desta forma:", "Wizardmon opens this form's Qualities:"),
        text: text(`Escolha as Qualidades específicas desta forma. Elas serão salvas no snapshot da forma atual, não no ator modelo. Desconto Core: ${dp.coreDiscountRemaining ?? 0}/${dp.coreDiscountBase ?? 0}.`, `Choose this form's specific Qualities. They will be saved into the current form snapshot, not the template actor. Core Discount: ${dp.coreDiscountRemaining ?? 0}/${dp.coreDiscountBase ?? 0}.`)
      },
      partnerQuestions: {
        title: text("Wizardmon fecha o grimório e observa o parceiro:", "Wizardmon closes the grimoire and watches the partner:"),
        text: text(
          "Os números já dizem o que seu Digimon faz. Agora me diga quem ele é. Essas respostas vão para a aba de Notas e ajudam o Narrador a tratar o parceiro como personagem, não só como um monte de dados com patinhas.",
          "The numbers already say what your Digimon does. Now tell me who they are. These answers go to the Notes tab and help the GM treat the partner as a character, not just a pile of dice with tiny feet."
        )
      },
      summary: {
        title: text("Wizardmon grava o snapshot:", "Wizardmon writes the snapshot:"),
        text: text("Ao salvar, esta build será aplicada ao parceiro persistente e guardada para quando ele voltar a esta forma.", "When saved, this build will be applied to the persistent partner and stored for when it returns to this form.")
      }
    };
    return guides[this.currentStep] ?? guides.stats;
  }

  const stage = this._getStageOptions().find((entry) => entry.key === this.data.stage);
  const dp = this.data.dp ?? {};

  const guides = {
    welcome: {
      title: text("Wizardmon abre o Digiovo:", "Wizardmon opens the Digi-Egg:"),
      text: text("Vamos montar um parceiro jogável, não uma ficha perfeita de laboratório. Primeiro damos identidade, depois escolhemos o Estágio, distribuímos PD e, por fim, compramos Qualidades. Se alguma escolha parecer estranha, siga em frente: quase tudo pode ser ajustado depois na ficha.", "We are building a playable partner, not a perfect lab sheet. First we set identity, then choose the Stage, distribute DP, and finally buy Qualities. If a choice feels strange, keep going: almost everything can be adjusted later on the sheet.")
    },

    compatibilityIntro: {
      title: text("Wizardmon ergue o Digivice:", "Wizardmon raises the Digivice:"),
      text: text("Este mundo está usando o Questionário de Compatibilidade. Ele é opcional para o jogador, mas ajuda o sistema a registrar um Brasão latente escondido e sugerir um Digitama inicial.", "This world is using the Compatibility Questionnaire. It is optional for the player, but helps the system record a hidden latent Crest and suggest a starting Digitama.")
    },

    compatibility: {
      title: text("Wizardmon faz perguntas demais:", "Wizardmon asks too many questions:"),
      text: text("Responda com instinto. Não existe resposta certa: cada escolha soma traços emocionais, temas de Brasão e afinidade com possíveis Digitamas.", "Answer by instinct. There is no right answer: each choice adds emotional traits, Crest themes, and affinity with possible Digitama.")
    },

    digitama: {
      title: text("Wizardmon aponta para os Digitamas:", "Wizardmon points to the Digitama:"),
      text: text("A última escolha nasce da soma das respostas. Se outro jogador já registrou o primeiro Digitama sugerido, o sistema pula para as próximas opções compatíveis.", "The last choice comes from the total of your answers. If another player already registered the first suggested Digitama, the system moves to the next compatible options.")
    },

    identity: {
      title: text("Wizardmon organiza os dados:", "Wizardmon organizes the data:"),
      text: text("Aqui nasce a personalidade do parceiro. O Nome vira a espécie registrada na ficha; o Apelido é como o Digi-Escolhido pode chamá-lo em cena. Tipo, Grupo, Família e Campo ajudam o Narrador e os jogadores a entenderem de relance que tipo de criatura digital entrou na história.", "This is where the partner's identity takes shape. The Name becomes the species registered on the sheet. Type, Group, Family, and Field help the GM and players understand at a glance what kind of digital creature entered the story.")
    },

    evolutionLine: {
      title: text("Wizardmon traça a linha inicial:", "Wizardmon maps the initial line:"),
      text: text(
        "Escolha as formas Bebê II e Criança/Rookie que pertencem ao parceiro. Essa trilha será salva como origem protegida no grafo para evitar duplicações e ligações acidentais.",
        "Choose the Baby II and Child/Rookie forms that belong to this partner. This path will be saved as a protected origin line in the graph to avoid duplicates and accidental links."
      )
    },

    stage: {
      title: text("Wizardmon mede o sinal evolutivo:", "Wizardmon measures the evolution signal:"),
      text: text(
        `O Estágio define o tamanho da brincadeira: PD inicial, Movimento, quantidade de Ataques e limite de Qualidades Negativas. Para jogadores novos, Bebê II ou Criança costumam ser os melhores pontos de partida. ${stage ? `Agora você está olhando para ${stage.label}: ${stage.startingDp} PD, Movimento ${stage.movement} e ${stage.attacks} Ataque(s).` : ""}`,
        `The Stage defines the scale of play: starting DP, Movement, number of Attacks, and Negative Quality limit. For new players, Baby II or Rookie are usually the best starting points. ${stage ? `You are currently looking at ${stage.label}: ${stage.startingDp} DP, Movement ${stage.movement}, and ${stage.attacks} Attack(s).` : ""}`
      )
    },

          buildTemplate: {
      title: text("Wizardmon abre um grimório de receitas:", "Wizardmon opens a recipe grimoire:"),
      text: text(
        "Estas builds prontas são atalhos seguros para Digimon Criança/Rookie. Não são classes fixas, pactos eternos nem min-maxing proibido pela Igreja do Balanceamento. Escolha o estilo que parece divertido; eu cuido dos números chatos depois.",
        "These ready-made builds are safe shortcuts for Child/Rookie Digimon. They are not fixed classes, eternal pacts, or min-maxing forbidden by the Church of Balance. Pick the style that sounds fun; I will handle the boring numbers afterward."
      )
    },

    templateChoices: {
      title: text("Wizardmon aponta para as runas finais:", "Wizardmon points at the final runes:"),
      text: text(
        "A build já está montada. Agora só falta dizer onde algumas runas encaixam: qual ataque recebe uma Tag, qual elemento combina com o parceiro, ou qual sistema interno será reforçado. Prometo perguntar só o necessário.",
        "The build is already assembled. Now we only need to decide where a few runes fit: which attack receives a Tag, which element suits the partner, or which internal system gets reinforced. I promise to ask only what is needed."
      )
    
    },

    

    stats: {
      title: text("Wizardmon aponta para os cinco núcleos:", "Wizardmon points to the five cores:"),
      text: text(
        `Distribua PD entre Acerto, Dano, Esquiva, Armadura e Saúde. Acerto ajuda a acertar, Dano aumenta impacto, Esquiva evita golpes, Armadura segura dano e Saúde aumenta Caixas de Ferimento. Você ainda tem ${dp.remaining ?? 0} PD livre(s); se ficar negativo, volte alguns pontos antes de avançar.`,
        `Distribute DP among Accuracy, Damage, Dodge, Armor, and Health. Accuracy helps you hit, Damage increases impact, Dodge avoids blows, Armor reduces damage, and Health increases Wound Boxes. You still have ${dp.remaining ?? 0} free DP; if it goes negative, lower some values before moving on.`
      )
    },

    qualities: {
      title: text("Wizardmon abre o compêndio:", "Wizardmon opens the compendium:"),
      text: text(
        `Qualidades são o tempero mecânico do Digimon. Core forma a base da build e pode usar Desconto Core; Qualidades Gratuitas custam 0 PD, mas algumas contam contra limite; Qualidades Negativas dão PD extra, mas cobram preço narrativo ou mecânico. No momento: Desconto Core ${dp.coreDiscountRemaining ?? 0}/${dp.coreDiscountBase ?? 0}, PD Negativo ${dp.negativeUsed ?? 0}/${dp.negativeLimit ?? 0}.`,
        `Qualities are the Digimon's mechanical seasoning. Core forms the build foundation and can use Core Discount; Free Qualities cost 0 DP, but some count against a limit; Negative Qualities grant extra DP, but carry narrative or mechanical costs. Current: Core Discount ${dp.coreDiscountRemaining ?? 0}/${dp.coreDiscountBase ?? 0}, Negative DP ${dp.negativeUsed ?? 0}/${dp.negativeLimit ?? 0}.`
      )
    },

    summary: {
      title: text("Wizardmon revisa o código final:", "Wizardmon reviews the final code:"),
      text: text("Confira nome, Estágio, PD gasto, estatísticas derivadas e Qualidades escolhidas. Ao criar, o Actor nasce com os dados de criação salvos, pronto para ser vinculado ao Digi-Escolhido e entrar em cena.", "Review name, Stage, spent DP, derived stats, and chosen Qualities. When created, the Actor is born with its creation data saved, ready to be linked to the Tamer and enter play.")
    }
  };

  return guides[this.currentStep] ?? {
    title: text("Wizardmon explica:", "Wizardmon explains:"),
    text: text("Siga a etapa atual e use os avisos do rodapé para corrigir qualquer pendência antes de criar o Actor.", "Follow the current step and use the footer warnings to fix any pending issue before creating the Actor.")
  };
}

_getBookStageValue(stageKey = this.data.stage) {
  const values = {
    baby1: -1,
    baby2: 0,
    child: 1,
    adult: 2,
    perfect: 3,
    ultimate: 4,
    mega: 4,
    ultimatePlus: 5
  };

  return values[stageKey] ?? 0;
}

_getCoreDiscountBase(stageKey = this.data.stage) {
  return Math.max(0, this._getStageValue(stageKey));
}

_isCoreDiscountEligible(quality) {
  return Boolean(
    quality?.coreDiscountAvailable
    || quality?.costData?.coreDiscountAvailable
    || quality?.cost?.coreDiscountAvailable
  );
}

_getQualityFullCost(quality, rankValue = null) {
  const baseCost = this._getQualityBaseDpCost(quality);
  const rank = Math.max(1, Number(rankValue ?? quality?.rank?.value ?? 1));

  if (this._qualityCostsPerRank(quality)) {
    return baseCost * rank;
  }

  return baseCost;
}

_recalculateQualityCosts(coreDiscountBase = this._getCoreDiscountBase()) {
  let remainingCoreDiscount = Number(coreDiscountBase ?? 0);
  let usedCoreDiscount = 0;

  for (const quality of this.data.qualities.positive) {
    const rankValue = Number(quality.rank?.value ?? 1);
    const fullCost = this._getQualityFullCost(quality, rankValue);

    let coreDiscountUsed = 0;

    if (this._isCoreDiscountEligible(quality) && fullCost > 0 && remainingCoreDiscount > 0) {
      coreDiscountUsed = Math.min(remainingCoreDiscount, fullCost);
      remainingCoreDiscount -= coreDiscountUsed;
      usedCoreDiscount += coreDiscountUsed;
    }

    quality.fullCost = fullCost;
    quality.coreDiscountUsed = coreDiscountUsed;
    quality.discountedByCore = coreDiscountUsed > 0;
    quality.cost = Math.max(0, fullCost - coreDiscountUsed);
  }

  return {
    used: usedCoreDiscount,
    remaining: remainingCoreDiscount
  };
}

_getQualityPurchaseCostInfo(quality) {
  const fullCost = this._getQualityFullCost(quality, 1);
  const remainingCoreDiscount = Number(this.data.dp.coreDiscountRemaining ?? 0);

  let coreDiscountUsed = 0;

  if (this._isCoreDiscountEligible(quality) && fullCost > 0 && remainingCoreDiscount > 0) {
    coreDiscountUsed = Math.min(remainingCoreDiscount, fullCost);
  }

  return {
    fullCost,
    coreDiscountUsed,
    effectiveCost: Math.max(0, fullCost - coreDiscountUsed)
  };
}

_getQualityRankIncreaseCostInfo(quality) {
  const fullCost = this._qualityCostsPerRank(quality)
    ? this._getQualityBaseDpCost(quality)
    : 0;
  const remainingCoreDiscount = Number(this.data.dp.coreDiscountRemaining ?? 0);

  let coreDiscountUsed = 0;

  if (this._isCoreDiscountEligible(quality) && fullCost > 0 && remainingCoreDiscount > 0) {
    coreDiscountUsed = Math.min(remainingCoreDiscount, fullCost);
  }

  return {
    fullCost,
    coreDiscountUsed,
    effectiveCost: Math.max(0, fullCost - coreDiscountUsed)
  };
}
_getIdentityOptions() {
  return {
    attributes: this._normalizeOptions(DIGIMON_PROFILE_OPTIONS.attributes),
    types: this._normalizeOptions(DIGIMON_PROFILE_OPTIONS.types),
    fields: this._normalizeOptions(DIGIMON_PROFILE_OPTIONS.fields)
  };
}

_getConfigOptions(paths = []) {
  const config = CONFIG.DDA ?? game.dda?.config ?? {};

  for (const path of paths) {
    const value = foundry.utils.getProperty(config, path);
    const options = this._normalizeOptions(value);

    if (options.length) return options;
  }

  return [];
}

_normalizeOptions(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (typeof entry === "string") {
        return {
          key: entry,
          label: entry
        };
      }

      return {
        key: entry.key ?? entry.value ?? entry.id ?? "",
        label: this._localizeOptionLabel(entry.label ?? entry.name ?? entry.key ?? entry.value ?? entry.id ?? "")
      };
    }).filter((entry) => entry.key);
  }

  if (typeof value === "object") {
    return Object.entries(value).map(([key, entry]) => {
      if (typeof entry === "string") {
        return {
          key,
          label: this._localizeOptionLabel(entry)
        };
      }

      return {
        key,
        label: this._localizeOptionLabel(entry.label ?? entry.name ?? entry.value ?? key)
      };
    });
  }

  return [];
}

_localizeOptionLabel(value = "") {
  const label = String(value ?? "").trim();
  if (!label) return "";

  if (label.startsWith("DDA.")) {
    const localized = game.i18n.localize(label);
    return localized !== label ? localized : label;
  }

  return label;
}

_getIdentityLabels() {
  const options = this._getIdentityOptions();

  return {
    species: this.data.identity.species?.trim() || "—",
    attribute: this._getOptionLabel(options.attributes, this.data.identity.attribute),
    type: this._getOptionLabel(options.types, this.data.identity.type),
    group: this.data.identity.group?.trim() || "—",
    field: this._getOptionLabel(options.fields, this.data.identity.field)
  };
}

_getOptionLabel(options = [], key = "") {
  if (!key) return "—";

  return options.find((option) => option.key === key)?.label ?? key;
}
}