import {
  DDADigimonDatabase,
  getEffectiveEvolutionCategory,
  getEffectiveIsSpecialForm,
  isHybridRulesEnabled
} from "../data/digimon-database.js";
import { getDdaPortraitPath } from "../data/dda-portrait-and-manual-digimon-data.js";
import {
  getDigimonAliases,
  getDigimonDisplayName,
  getDigimonDubName,
  getDigimonNameData,
  getDigimonOriginalName
} from "../helpers/digimon-terms.js";
import {
  resolveDigimonPortrait
} from "../helpers/digimon-portrait-resolver.js";
const STAGE_ORDER = ["baby1", "baby2", "child", "adult", "perfect", "ultimate", "ultimatePlus"];

const DDA_EVOLUTION_CARD_STATIC_IMAGE_OVERRIDES = Object.freeze({
  "adult:algomon": "systems/digimon-digital-adventures/assets/digimon/portraits/Argomon_Adult.webp",
  "adult:algomonadult": "systems/digimon-digital-adventures/assets/digimon/portraits/Argomon_Adult.webp",
  "adult:argomon": "systems/digimon-digital-adventures/assets/digimon/portraits/Argomon_Adult.webp",
  "adult:argomonadult": "systems/digimon-digital-adventures/assets/digimon/portraits/Argomon_Adult.webp",
  "adult:redvdramon": "systems/digimon-digital-adventures/assets/digimon/portraits/Red_V_Dramon.webp"
});

// Ferramenta temporária de desenvolvedor.
// Use chaves normalizadas: "relemon", "viximon", "renamon" etc.
// Exemplos:
// const DEV_EVOLUTION_COMPATIBILITY_OVERRIDES = {
//   relemon: { viximon: 95, poromon: 75 },
//   viximon: { renamon: { score: 98, reason: "Linha principal" } }
// };
// const DEV_EVOLUTION_CHOICE_EXCLUSIONS = {
//   "*": ["algomonbabyii"],
//   relemon: ["tokomon"]
// };
const DEV_EVOLUTION_COMPATIBILITY_OVERRIDES = {
};

const DEV_EVOLUTION_CHOICE_EXCLUSIONS = {
  "*": []
};

const DEV_EVOLUTION_FLAG_SCOPE = "digimon-digital-adventures";
const DEV_EVOLUTION_COMPATIBILITY_FLAG = "devEvolutionCompatibilityOverrides";
const DEV_EVOLUTION_EXCLUSIONS_FLAG = "devEvolutionChoiceExclusions";
const DEV_EVOLUTION_VISUAL_EDITOR_SETTING = "devEvolutionVisualEditorState";

function getDevFlagScope() {
  return game.system?.id ?? DEV_EVOLUTION_FLAG_SCOPE;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function registerEvolutionCompatibilityDevSettings() {
  const scope = getDevFlagScope();
  const settings = [
    [DEV_EVOLUTION_COMPATIBILITY_FLAG, {}],
    [DEV_EVOLUTION_EXCLUSIONS_FLAG, { "*": [] }],
    [DEV_EVOLUTION_VISUAL_EDITOR_SETTING, {}]
  ];

  for (const [key, defaultValue] of settings) {
    try {
      game.settings.register(scope, key, {
        name: key,
        hint: "Hidden DDA evolution compatibility curation setting.",
        scope: "world",
        config: false,
        type: Object,
        default: defaultValue
      });
    } catch (_error) {
      // Settings can only be registered once; ignore duplicate registration.
    }
  }
}

function getStoredDevObject(flagName = "") {
  const scope = getDevFlagScope();

  try {
    const value = game.settings?.get(scope, flagName);
    if (isPlainObject(value)) return value;
  } catch (_error) {
    // Fall back to legacy user flags below.
  }

  const legacyValue = game.user?.getFlag(scope, flagName);
  return isPlainObject(legacyValue) ? legacyValue : {};
}

async function setStoredDevObject(flagName = "", value = {}) {
  const scope = getDevFlagScope();
  const cleanValue = isPlainObject(value) ? value : {};

  try {
    await game.settings.set(scope, flagName, cleanValue);
    return cleanValue;
  } catch (_error) {
    await game.user?.setFlag(scope, flagName, cleanValue);
    return cleanValue;
  }
}

async function unsetStoredDevObject(flagName = "") {
  await setStoredDevObject(flagName, {});
}

function mergeDevObjects(base = {}, stored = {}) {
  return foundry.utils.mergeObject(
    foundry.utils.deepClone(base ?? {}),
    foundry.utils.deepClone(stored ?? {}),
    { inplace: false, recursive: true }
  );
}

function getDevCompatibilityOverrides() {
  return mergeDevObjects(
    DEV_EVOLUTION_COMPATIBILITY_OVERRIDES,
    getStoredDevObject(DEV_EVOLUTION_COMPATIBILITY_FLAG)
  );
}

function getDevChoiceExclusions() {
  return mergeDevObjects(
    DEV_EVOLUTION_CHOICE_EXCLUSIONS,
    getStoredDevObject(DEV_EVOLUTION_EXCLUSIONS_FLAG)
  );
}

function parseDevJson(text = "", fallback = {}) {
  const raw = String(text ?? "").trim();
  if (!raw) return fallback;

  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("O conteúdo precisa ser um objeto JSON.");
  }

  return parsed;
}

async function openEvolutionCompatibilityDevTool() {
  const overrides = getStoredDevObject(DEV_EVOLUTION_COMPATIBILITY_FLAG);
  const exclusions = getStoredDevObject(DEV_EVOLUTION_EXCLUSIONS_FLAG);
  const formatJson = (value) => JSON.stringify(value ?? {}, null, 2);

  return new Promise((resolve) => {
    new Dialog({
      title: "DDA Dev Tool — Compatibilidade de Evolução",
      content: `
        <form class="dda-dev-evolution-compatibility-form">
          <p class="notes">
            Ajustes salvos como configuração oculta de mundo. Afetam o Browser de Evolução para todos os usuários deste mundo.
          </p>

          <div class="form-group stacked">
            <label>Overrides de compatibilidade</label>
            <textarea name="overrides" spellcheck="false" rows="12">${escapeHtml(formatJson(overrides))}</textarea>
            <p class="hint">Exemplo: { "relemon": { "viximon": 95 }, "viximon": { "renamon": { "score": 98, "reason": "Linha principal" } } }</p>
          </div>

          <div class="form-group stacked">
            <label>Exclusões</label>
            <textarea name="exclusions" spellcheck="false" rows="8">${escapeHtml(formatJson(exclusions))}</textarea>
            <p class="hint">Exemplo: { "*": ["algomonbabyii"], "relemon": ["tokomon"] }</p>
          </div>
        </form>
      `,
      buttons: {
        save: {
          label: "Salvar",
          callback: async (html) => {
            const form = html[0]?.querySelector?.("form");
            try {
              const nextOverrides = parseDevJson(form?.overrides?.value, {});
              const nextExclusions = parseDevJson(form?.exclusions?.value, { "*": [] });

              await setStoredDevObject(DEV_EVOLUTION_COMPATIBILITY_FLAG, nextOverrides);
              await setStoredDevObject(DEV_EVOLUTION_EXCLUSIONS_FLAG, nextExclusions);

              ui.notifications.info("Ajustes de compatibilidade salvos.");
              resolve({ overrides: nextOverrides, exclusions: nextExclusions });
            } catch (error) {
              ui.notifications.error(`JSON inválido: ${error.message}`);
              resolve(null);
            }
          }
        },
        clear: {
          label: "Limpar ajustes",
          callback: async () => {
            await unsetStoredDevObject(DEV_EVOLUTION_COMPATIBILITY_FLAG);
            await unsetStoredDevObject(DEV_EVOLUTION_EXCLUSIONS_FLAG);
            ui.notifications.info("Ajustes de compatibilidade limpos.");
            resolve({ overrides: {}, exclusions: {} });
          }
        },
        cancel: {
          label: "Cancelar",
          callback: () => resolve(null)
        }
      },
      default: "save",
      close: () => resolve(null)
    }, { width: 720 }).render(true);
  });
}

function localize(key) {
  return game.i18n.localize(key);
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalize(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}


function imageLookupKey(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/x[-_\s]*antibody/g, "xantibody")
    .replace(/baby\s*i{1,2}/g, (match) => match.includes("ii") ? "babyii" : "babyi")
    .replace(/lv\s*2/g, "lv2")
    .replace(/lv\s*1/g, "lv1")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}


function devLookupKey(value = "") {
  return imageLookupKey(value);
}

function getEvolutionChoiceStableUuid(choice = {}) {
  const realUuid = String(choice.uuid ?? "").trim();
  if (realUuid) return realUuid;

  const sourceId = String(choice.sourceId ?? "").trim();
  if (sourceId) return `DDA-SNAPSHOT.${devLookupKey(sourceId)}`;

  const name = String(choice.species || choice.name || choice.displayName || "digimon").trim();
  return `DDA-SNAPSHOT.${devLookupKey(name) || foundry.utils.randomID()}`;
}

function getCandidateLookupKeys(candidate = {}) {
  return [
    candidate.sourceId,
    candidate.key,
    candidate.species,
    candidate.originalName,
    candidate.dubName,
    candidate.name,
    candidate.displayName,
    ...(Array.isArray(candidate.aliases) ? candidate.aliases : [])
  ]
    .map((value) => devLookupKey(value))
    .filter(Boolean);
}

function getActorLookupKeys(actor = null) {
  const names = actor?.system?.names ?? {};

  return [
    actor?.system?.sourceId,
    names.canonical,
    names.original,
    names.dub,
    actor?.system?.species,
    actor?.system?.evolution?.currentFormName,
    actor?.system?.evolution?.sourceFormName,
    ...(Array.isArray(names.aliases) ? names.aliases : []),
    actor?.name
  ]
    .map((value) => devLookupKey(value))
    .filter(Boolean);
}

function getDevMapValue(map = {}, fromKeys = [], toKeys = []) {
  const candidateFromKeys = [...fromKeys, "*"];

  for (const fromKey of candidateFromKeys) {
    const group = map?.[fromKey];
    if (!group || typeof group !== "object") continue;

    for (const toKey of toKeys) {
      if (Object.prototype.hasOwnProperty.call(group, toKey)) return group[toKey];
    }
  }

  return undefined;
}

function getDevCompatibilityOverride(candidate = {}, currentActor = null) {
  const value = getDevMapValue(
    getDevCompatibilityOverrides(),
    getActorLookupKeys(currentActor),
    getCandidateLookupKeys(candidate)
  );

  if (value === undefined || value === null) return null;
  if (value === false || value === "hide") return { hidden: true };
  if (typeof value === "number") return { score: value, reason: "Ajuste manual de desenvolvedor" };
  if (typeof value === "object") {
    if (value.hidden || value.hide || value.score === false || value.score === "hide") return { hidden: true };
    const score = Number(value.score ?? value.compatibility ?? value.value ?? NaN);
    return {
      score: Number.isFinite(score) ? score : null,
      reason: String(value.reason || value.label || "Ajuste manual de desenvolvedor")
    };
  }

  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? { score: numeric, reason: "Ajuste manual de desenvolvedor" }
    : null;
}

function isCandidateExcludedByDev(
  candidate = {},
  currentActor = null,
  {
    ignoreExclusionLists = false
  } = {}
) {
  const explicitOverride = getDevCompatibilityOverride(
    candidate,
    currentActor
  );

  /*
   * Overrides explicitamente marcados como ocultos
   * continuam tendo autoridade sobre o candidato.
   */
  if (explicitOverride?.hidden) {
    return true;
  }

  /*
   * Relações diretas curadas da database não devem
   * desaparecer por causa de exclusões antigas ou
   * geradas pela limpeza automática de duplicatas.
   */
  if (ignoreExclusionLists) {
    return false;
  }

  const fromKeys = [
    ...getActorLookupKeys(currentActor),
    "*"
  ];

  const toKeys = new Set(
    getCandidateLookupKeys(candidate)
  );

  for (const fromKey of fromKeys) {
    const exclusions =
      getDevChoiceExclusions()?.[fromKey];

    if (!Array.isArray(exclusions)) {
      continue;
    }

    for (const entry of exclusions) {
      if (
        typeof entry === "string" &&
        toKeys.has(devLookupKey(entry))
      ) {
        return true;
      }

      if (
        isPlainObject(entry) &&
        exclusionEntryMatchesCandidate(
          entry,
          candidate
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function nodeTextLookup(node = {}) {
  return normalize(node.species || node.displayName || node.name || "");
}

function findCurrentEvolutionGraphNode(graph = {}, actor = null) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  if (!nodes.length) return null;

  const currentFormUuid = String(actor?.system?.evolution?.currentFormUuid || actor?.system?.evolution?.sourceFormUuid || actor?.uuid || "");
  const persistentUuid = String(actor?.uuid || "");
  const currentStage = String(actor?.system?.stage || "");
  const currentName = normalize(actor?.system?.species || actor?.system?.evolution?.currentFormName || actor?.name || "");

  const hasSameIdentity = (node) => {
    const nodeStage = String(node?.stage || "");
    if (currentStage && nodeStage && nodeStage !== currentStage) return false;
    return Boolean(currentName && nodeTextLookup(node) === currentName);
  };

  return nodes.find((node) => currentFormUuid && node?.formUuid === currentFormUuid)
    ?? nodes.find((node) => currentFormUuid && node?.sourceFormUuid === currentFormUuid)
    ?? nodes.find((node) => currentFormUuid && node?.currentFormUuid === currentFormUuid)
    ?? (currentFormUuid && currentFormUuid !== persistentUuid ? nodes.find((node) => node?.actorUuid === currentFormUuid) : null)
    ?? nodes.find((node) => node?.actorUuid === persistentUuid && hasSameIdentity(node))
    ?? nodes.find((node) => hasSameIdentity(node))
    ?? nodes.find((node) => node?.actorUuid === persistentUuid && String(node?.stage || "") === currentStage)
    ?? nodes.find((node) => node?.actorUuid === persistentUuid)
    ?? nodes[0]
    ?? null;
}

function resolveDigimonImagePath({
  path = "",
  name = "",
  species = "",
  key = "",
  stage = ""
} = {}) {
  const cleanPath = String(path ?? "").trim();

  /* Preserve user-provided artwork outside the system asset library. */
  if (
    cleanPath &&
    !cleanPath.startsWith("systems/digimon-digital-adventures/assets/digimon/") &&
    !cleanPath.includes("icons/svg/mystery-man.svg")
  ) {
    return cleanPath;
  }

  return resolveDigimonPortrait({
    name: name || species || key || "Digimon",
    img: cleanPath,
    system: {
      sourceId: key,
      databaseId: stage && key ? `${stage}:${key}` : "",
      species: species || name || key,
      stage,
      names: {
        canonical: key,
        original: species || name || key,
        dub: name || species || key,
        aliases: [name, species, key].filter(Boolean)
      }
    }
  });
}

function stageLabel(stageKey = "") {
  const label = CONFIG.DDA?.stages?.[stageKey]?.label ?? stageKey;
  return label ? localize(label) : stageKey;
}

function nextStage(stageKey = "") {
  const index = STAGE_ORDER.indexOf(stageKey);
  if (index < 0 || index >= STAGE_ORDER.length - 1) return "";
  return STAGE_ORDER[index + 1];
}

async function resolveActor(uuid = "") {
  const clean = String(uuid ?? "").trim();
  if (!clean) return null;
  try {
    const doc = await fromUuid(clean);
    return doc?.documentName === "Actor" ? doc : null;
  } catch (_error) {
    return null;
  }
}

function getCandidateImagePath(path = "", options = {}) {
  return resolveDigimonImagePath({ path, ...options });
}

function isUsableEvolutionCandidateUuid(uuid = "") {
  const clean = String(uuid ?? "").trim();
  return /^(Actor\.|Compendium\.)/.test(clean);
}

function getCandidateDisplayName(value = "") {
  const raw = String(value ?? "").trim();
  if (!raw) return "Digimon";

  return raw
    .replace(/XAntibody/gi, " X-Antibody")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function actorToCandidate(actor, options = {}) {
  if (
    !actor ||
    !["digimon", "npc"].includes(
      actor.type
    )
  ) {
    return null;
  }

  const nameData = getDigimonNameData(actor);
  const aliases = getDigimonAliases(actor);
  const sourceId = actor.system?.sourceId || nameData.canonical || "";
  const species = actor.system?.species || nameData.original || actor.name;
  const displayName = getDigimonDisplayName(actor) || getCandidateDisplayName(species);

  return {
    uuid: actor.uuid,
    key: sourceId || actor.id || species,
    sourceId,
    name: actor.name,
    displayName,
    species,
    originalName: getDigimonOriginalName(actor) || species,
    dubName: getDigimonDubName(actor) || "",
    aliases,
    aliasesText: aliases.join("|"),
    portraitImg: String(
      actor.system?.evolution?.portraitImg ||
      actor.flags?.["digimon-digital-adventures"]?.digivicePortrait ||
      getDdaPortraitPath({ key: sourceId, name: actor.name, species, aliases }) ||
      actor.img ||
      "icons/svg/mystery-man.svg"
    ),
    img: getCandidateImagePath(actor.img || "icons/svg/mystery-man.svg", {
      name: actor.name,
      species,
      key: sourceId,
      stage: actor.system?.stage
    }),
    stage: actor.system?.stage || "",
    attribute: actor.system?.attribute || "",
    field: actor.system?.field || "",
    family: actor.system?.family || "",
    evolutionCategory: actor.system?.evolutionCategory || "normal",

    specialCategories:
      Array.isArray(
        actor.system?.specialCategories
      )
        ? foundry.utils.deepClone(
            actor.system.specialCategories
          )
        : [],

    specialCategoriesText:
      Array.isArray(
        actor.system?.specialCategories
      )
        ? actor.system.specialCategories.join("|")
        : "",

    primarySpecialCategory:
      actor.system?.primarySpecialCategory || "",

    isSpecialForm:
      Boolean(actor.system?.isSpecialForm),

    rawEvolutionCategory:
      actor.system?.evolutionCategory || "normal",

    rawIsSpecialForm:
      Boolean(actor.system?.isSpecialForm),

    source: options.source ?? "actor",
    direct: Boolean(options.direct),
    usable: true,
    selectable: true,
    missingActor: false
  };
}


function nodeToCandidate(node, options = {}) {
  if (!node) return null;

  const name = node.species || node.displayName || node.name || "Digimon";
  const uuid = String(node.actorUuid || node.uuid || "").trim();
  const isSnapshotNode = Boolean(
    node.snapshot ||
    node.persistentSnapshot ||
    uuid.startsWith("DDA-SNAPSHOT.")
  );
  const usable = isSnapshotNode || isUsableEvolutionCandidateUuid(uuid);

  return {
    uuid,
    key: node.key || node.id || node.name || name,
    sourceId: node.sourceId || "",
    name: node.name || name,
    displayName: getCandidateDisplayName(node.displayName || name),
    species: node.species || name,
    originalName: node.originalName || "",
    dubName: node.dubName || "",
    aliases: Array.isArray(node.aliases) ? node.aliases : [],
    aliasesText: Array.isArray(node.aliases) ? node.aliases.join("|") : "",
    portraitImg: String(
      node.portraitImg ||
      getDdaPortraitPath({
        key: node.sourceId || node.key || node.id || "",
        name: node.name || name,
        species: node.species || name,
        aliases: Array.isArray(node.aliases) ? node.aliases : []
      }) ||
      node.img || node.image || "icons/svg/mystery-man.svg"
    ),
    img: getCandidateImagePath(node.img || node.image || "", { name, species: node.species, stage: node.stage }),
    stage: node.stage || "",
    attribute: node.attribute || "",
    field: node.field || "",
    family: node.family || "",

    evolutionCategory:
      node.evolutionCategory || "normal",

    specialCategories:
      Array.isArray(node.specialCategories)
        ? foundry.utils.deepClone(
            node.specialCategories
          )
        : [],

    specialCategoriesText:
      Array.isArray(node.specialCategories)
        ? node.specialCategories.join("|")
        : "",

    primarySpecialCategory:
      node.primarySpecialCategory || "",

    isSpecialForm:
      Boolean(node.isSpecialForm),

    rawEvolutionCategory:
      node.rawEvolutionCategory ||
      node.evolutionCategory ||
      "normal",

    rawIsSpecialForm:
      Boolean(
        node.rawIsSpecialForm ??
        node.isSpecialForm
      ),

    isRawHybrid:
      String(
        node.rawEvolutionCategory ||
        node.evolutionCategory ||
        ""
      ) === "hybrid",

    hybridTreatedAsNormal:
      String(
        node.rawEvolutionCategory ||
        node.evolutionCategory ||
        ""
      ) === "hybrid" &&
      String(
        node.evolutionCategory || "normal"
      ) === "normal",

    source: options.source ?? "graph",
    direct: Boolean(options.direct),
    snapshotOnly: isSnapshotNode,
    snapshot: isSnapshotNode,
    usable,
    selectable: usable,
    missingActor: !usable
  };
}

function databaseEntryToCandidate(entry) {
  if (!entry) return null;

  const system = entry.system ?? {};
  const names = system.names ?? {};

  const uuid = String(
    entry.uuid ||
    entry.actorUuid ||
    entry.documentUuid ||
    entry.compendiumUuid ||
    ""
  ).trim();

  const sourceId = String(
    system.sourceId ||
    entry.sourceId ||
    entry.key ||
    entry._id ||
    ""
  ).trim();

  const originalName =
    getDigimonOriginalName(entry) ||
    names.original ||
    system.species ||
    entry.name ||
    sourceId ||
    "Digimon";

  const dubName =
    getDigimonDubName(entry) ||
    names.dub ||
    originalName;

  const displayName =
    getDigimonDisplayName(entry) ||
    dubName ||
    originalName;

  const name =
    entry.name ||
    system.species ||
    originalName;

  const species =
    system.species ||
    entry.species ||
    originalName ||
    name;

  const aliases = Array.from(new Set([
    ...getDigimonAliases(entry),
    ...(Array.isArray(names.aliases)
      ? names.aliases
      : []),
    originalName,
    dubName,
    name,
    species,
    sourceId
  ].filter(Boolean)));

  const stage = system.stage || entry.stage || "";

  const attribute =
    system.attribute ||
    entry.attribute ||
    "";

  const field =
    system.field ||
    entry.field ||
    (Array.isArray(system.fields)
      ? system.fields[0]
      : "") ||
    (Array.isArray(entry.fields)
      ? entry.fields[0]
      : "");

  const family =
    system.family ||
    entry.family ||
    "";

  const rawEvolutionCategory = String(
    system.evolutionCategory ||
    entry.evolutionCategory ||
    "normal"
  ).trim() || "normal";

  const rawIsSpecialForm = Boolean(
    system.isSpecialForm ??
    entry.isSpecialForm
  );

  const specialCategories = Array.isArray(
    system.specialCategories
  )
    ? foundry.utils.deepClone(
        system.specialCategories
      )
    : rawEvolutionCategory !== "normal"
      ? [rawEvolutionCategory]
      : [];

  const primarySpecialCategory = String(
    system.primarySpecialCategory ||
    specialCategories.find((category) => {
      return category !== "normal";
    }) ||
    rawEvolutionCategory ||
    ""
  ).trim();

  const evolutionCategory =
    getEffectiveEvolutionCategory(entry);

  const isSpecialForm =
    getEffectiveIsSpecialForm(entry);

  const img = getCandidateImagePath(
    entry.img ||
    entry.image ||
    entry.imgPath ||
    entry.prototypeToken?.texture?.src ||
    "icons/svg/mystery-man.svg",
    {
      name,
      species,
      key: sourceId,
      stage
    }
  );

  const portraitImg = String(
    system.images?.portraitImagePath ||
    getDdaPortraitPath({
      key: sourceId,
      name,
      species,
      aliases
    }) ||
    img ||
    "icons/svg/mystery-man.svg"
  );

  const usable = Boolean(uuid) || Boolean(sourceId);

  return {
    uuid,
    key: sourceId || entry.key || name,
    sourceId,

    name,
    displayName,
    species,

    originalName,
    dubName,
    aliases,
    aliasesText: aliases.join("|"),

    img,
    portraitImg,

    stage,
    attribute,
    field,
    family,

    evolutionCategory,

    specialCategories,

    specialCategoriesText:
      specialCategories.join("|"),

    primarySpecialCategory,

    isSpecialForm,
    rawEvolutionCategory,
    rawIsSpecialForm,

    isRawHybrid: rawEvolutionCategory === "hybrid",

    hybridTreatedAsNormal:
      rawEvolutionCategory === "hybrid" &&
      evolutionCategory === "normal",

    source: "database",
    direct: false,

    usable,
    selectable: usable,
    missingActor: !usable,

    actorData: entry
  };
}

function getCompatibility(candidate, currentActor, directNames = new Set()) {
  let score = 35;
  const reasons = [];
  const candidateName = normalize(candidate.species || candidate.name);
  const devOverride = getDevCompatibilityOverride(candidate, currentActor);

  if (candidate.direct || directNames.has(candidateName)) {
    score += 45;
    reasons.push(localize("DDA.EvolutionChoice.Reason.Direct"));
  }

  if (candidate.family && currentActor.system?.family && candidate.family === currentActor.system.family) {
    score += 8;
    reasons.push(localize("DDA.EvolutionChoice.Reason.SameFamily"));
  }

  if (candidate.field && currentActor.system?.field && candidate.field === currentActor.system.field) {
    score += 8;
    reasons.push(localize("DDA.EvolutionChoice.Reason.SameField"));
  }

  if (candidate.attribute && currentActor.system?.attribute && candidate.attribute === currentActor.system.attribute) {
    score += 4;
    reasons.push(localize("DDA.EvolutionChoice.Reason.SameAttribute"));
  }

  const manualScore = Number(devOverride?.score ?? NaN);
  const manual = Number.isFinite(manualScore);

  if (manual) {
    score = manualScore;
    reasons.unshift(devOverride?.reason || "Ajuste manual de desenvolvedor");
  }

  score = Math.clamp(score, 5, 98);

  let tier = "uncommon";
  if (score >= 80) tier = "recommended";
  else if (score >= 55) tier = "plausible";

  return {
    score,
    tier,
    manual,
    label: localize(`DDA.EvolutionChoice.Tier.${tier}`),
    reasons: reasons.length ? reasons : [localize("DDA.EvolutionChoice.Reason.Explored")]
  };
}



function normalizeEvolutionChoiceLineForm(form = {}, defaultStageKey = "") {
  const stableUuid = String(
    form.uuid ||
    form.actorUuid ||
    form.formUuid ||
    form.sourceId ||
    ""
  ).trim();

  if (!stableUuid) return null;

  return {
    name: form.name ?? form.species ?? form.displayName ?? "",
    displayName: form.displayName ?? form.species ?? form.name ?? "",
    species: form.species ?? form.name ?? "",
    uuid: stableUuid,
    actorUuid: form.actorUuid ?? form.uuid ?? "",
    sourceId: form.sourceId ?? "",
    snapshot: Boolean(form.snapshot),

    evolutionCategory:
      form.evolutionCategory ?? "normal",

    specialCategories:
      Array.isArray(form.specialCategories)
        ? foundry.utils.deepClone(
            form.specialCategories
          )
        : [],

    primarySpecialCategory:
      form.primarySpecialCategory ?? "",

    isSpecialForm:
      Boolean(form.isSpecialForm),

    rawEvolutionCategory:
      form.rawEvolutionCategory ??
      form.evolutionCategory ??
      "normal",

    rawIsSpecialForm:
      Boolean(
        form.rawIsSpecialForm ??
        form.isSpecialForm
      ),

    stage: form.stage ?? defaultStageKey,
    img: form.img ?? "",
    portraitImg: form.portraitImg ?? form.img ?? ""
  };
}

function normalizeEvolutionChoiceSlotForms(slot, defaultStageKey = "") {
  if (!slot) return [];

  const forms = [];

  if (Array.isArray(slot)) {
    forms.push(...slot);
  } else {
    if (Array.isArray(slot.forms)) forms.push(...slot.forms);
    if (slot.uuid) forms.unshift(slot);
  }

  const seen = new Set();

  return forms
    .map((form) => normalizeEvolutionChoiceLineForm(form, defaultStageKey))
    .filter(Boolean)
    .filter((form) => {
      const key = String(form.uuid ?? "").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildEvolutionChoiceLineForm(choice = {}) {
  const stableUuid = getEvolutionChoiceStableUuid(choice);

  return {
    name: choice.name || choice.species || choice.displayName || "Digimon",
    displayName: choice.displayName || getCandidateDisplayName(choice.species || choice.name),
    species: choice.species || choice.name || "",
    uuid: stableUuid,
    actorUuid: choice.uuid || "",
    sourceId: choice.sourceId || "",
    snapshot: Boolean(choice.snapshot),
    source: choice.source || "evolution-choice-browser",
    originalName: choice.originalName || "",
    dubName: choice.dubName || "",

    aliases:
      Array.isArray(choice.aliases)
        ? choice.aliases
        : [],

    evolutionCategory:
      choice.evolutionCategory || "normal",

    specialCategories:
      Array.isArray(choice.specialCategories)
        ? foundry.utils.deepClone(
            choice.specialCategories
          )
        : [],

    primarySpecialCategory:
      choice.primarySpecialCategory || "",

    isSpecialForm:
      Boolean(choice.isSpecialForm),

    rawEvolutionCategory:
      choice.rawEvolutionCategory ||
      choice.evolutionCategory ||
      "normal",

    rawIsSpecialForm:
      Boolean(
        choice.rawIsSpecialForm ??
        choice.isSpecialForm
      ),

    stage: choice.stage || "",
    img: choice.img || "icons/svg/mystery-man.svg",
    portraitImg: choice.portraitImg || choice.img || "icons/svg/mystery-man.svg"
  };
}

function buildEvolutionChoiceSlotUpdate(stageKey = "", forms = []) {
  const cleanForms = forms
    .map((form) => normalizeEvolutionChoiceLineForm(form, stageKey))
    .filter(Boolean);

  const primary = cleanForms[0] ?? {
    name: "",
    uuid: "",
    stage: stageKey
  };

  return {
    [`system.evolutionLine.forms.${stageKey}.forms`]: cleanForms,
    [`system.evolutionLine.forms.${stageKey}.name`]: primary.name,
    [`system.evolutionLine.forms.${stageKey}.uuid`]: primary.uuid,
    [`system.evolutionLine.forms.${stageKey}.stage`]: primary.stage ?? stageKey
  };
}

export class DDAEvolutionChoiceBrowser extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "dda-evolution-choice-browser",
      classes: ["dda", "dda-evolution-choice-browser"],
      template: "systems/digimon-digital-adventures/templates/apps/evolution-choice-browser.html",
      title: localize("DDA.EvolutionChoice.Title"),
      width: 860,
      height: 720,
      resizable: true
    });
  }

constructor(digimonActor, options = {}) {
  super(options);
  this.actor = digimonActor;
  this.searchTerm = "";
  this.showExploration = false;
  this.pendingChoice = null;
}

  async getData(options = {}) {
    const context = await super.getData(options);
    const tamer = await this._getLinkedTamer();
    const currentStage = this.actor.system?.stage || "";
    const targetStage = nextStage(currentStage);
    const stageUnlocked = this._isStageUnlocked(tamer, targetStage);
    const directCandidates = await this._getDirectCandidates(targetStage);
    const directNames = new Set(directCandidates.map((entry) => normalize(entry.species || entry.name)));
    const explorationCandidates = await this._getExplorationCandidates(targetStage, directNames);
    const savedChoice =
      this._getSavedEvolutionChoice(
        tamer,
        targetStage
      );
    const selectedChoice = this.pendingChoice ?? savedChoice ?? null;
    const selectionIsPending = Boolean(this.pendingChoice);
    const hybridRulesEnabled = isHybridRulesEnabled();    
// A área principal mostra somente evoluções diretas confirmadas.
// Resultados de exploração nunca viram “evolução direta”.
const primaryCandidates = directCandidates;
const primaryNames = new Set(
  primaryCandidates.map((entry) => normalize(entry.species || entry.name))
);

const visibleExploration = explorationCandidates.filter((entry) => {
  return !primaryNames.has(normalize(entry.species || entry.name));
});

    return {
      ...context,
      actor: this.actor,
      tamer,
      currentStage,
      currentStageLabel: stageLabel(currentStage),
      targetStage,
      targetStageLabel: stageLabel(targetStage),
      stageUnlocked,
      selectedChoice: selectedChoice
        ? {
            ...selectedChoice,
            displayName: selectedChoice.displayName || getCandidateDisplayName(selectedChoice.species || selectedChoice.name),
            stageLabel: stageLabel(selectedChoice.stage || targetStage),
            pending: selectionIsPending
          }
        : null,
      hasSelectedChoice: Boolean(selectedChoice),
      selectionIsPending,
      directCandidates: primaryCandidates.map((candidate) => this._markSelected(candidate, selectedChoice)),
      explorationCandidates: this.showExploration ? visibleExploration.map((candidate) => this._markSelected(candidate, selectedChoice)) : [],
      hasDirectCandidates: primaryCandidates.length > 0,
      hasExplorationCandidates: visibleExploration.length > 0,
      showExploration: this.showExploration,
      searchTerm: this.searchTerm,
      hybridRulesEnabled,
      hybridRulesLabel: localize(
        hybridRulesEnabled
          ? "DDA.EvolutionChoice.HybridRules.Enabled"
          : "DDA.EvolutionChoice.HybridRules.Disabled"
      ),
      hybridRulesHint: localize(
        hybridRulesEnabled
          ? "DDA.EvolutionChoice.HybridRules.EnabledHint"
          : "DDA.EvolutionChoice.HybridRules.DisabledHint"
      )
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html instanceof jQuery ? html : $(html);
    root.find("[data-action='select-evolution-choice']").on("click", this._onSelectChoice.bind(this));
    root.find("[data-action='clear-evolution-choice']").on("click", this._onClearEvolutionChoice.bind(this));
    root.find("[data-action='save-evolution-choice']").on("click", this._onSaveEvolutionChoice.bind(this));
    root.find(".dda-evolution-choice-img-frame img").on("error", this._onCandidateImageError.bind(this));
    root.find("[data-action='toggle-exploration']").on("click", (event) => {
      event.preventDefault();
      this.showExploration = !this.showExploration;
      this.render(true);
    });
const updateExplorationSearch = (event) => {
  this.searchTerm = event.currentTarget.value ?? "";
  this.showExploration = true;

  clearTimeout(this._explorationSearchTimeout);

  this._explorationSearchTimeout = setTimeout(() => {
    this.render(true);
  }, 180);
};

root.find("[data-action='exploration-search']")
  .on("input", updateExplorationSearch)
  .on("keydown", (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    event.stopPropagation();

    clearTimeout(this._explorationSearchTimeout);

    this.searchTerm = event.currentTarget.value ?? "";
    this.showExploration = true;

    this.render(true);
  });
  }

  _onCandidateImageError(event) {
    const image = event.currentTarget;
    const card = image?.closest?.(".dda-evolution-choice-card");

    if (!image || image.dataset.fallbackApplied === "true") {
      card?.classList?.add("has-missing-image");
      return;
    }

    image.dataset.fallbackApplied = "true";
    image.src = "icons/svg/mystery-man.svg";
    card?.classList?.add("has-missing-image");
  }

  async _getLinkedTamer() {
    const uuid = this.actor.system?.tamer?.uuid;
    if (uuid) {
      const tamer = await resolveActor(uuid);
      if (tamer?.type === "character") return tamer;
    }

    return game.actors.find((actor) => actor.type === "character" && actor.system?.partner?.uuid === this.actor.uuid) ?? null;
  }

  _isStageUnlocked(tamer, stageKey) {
    if (!stageKey) return false;

    if (!tamer) {
      return true;
    }

    const unlocked =
      tamer.system?.partner
        ?.unlockedEvolutionStages ?? {};

    if (unlocked[stageKey] === undefined) {
      return [
        "baby1",
        "baby2",
        "child"
      ].includes(stageKey);
    }

    return Boolean(unlocked[stageKey]);
  }

  _getActorSavedEvolutionChoice(
    stageKey = ""
  ) {
    if (!stageKey) return null;

    const slot =
      this.actor.system
        ?.evolutionLine
        ?.forms
        ?.[stageKey] ?? {};

    const forms =
      normalizeEvolutionChoiceSlotForms(
        slot,
        stageKey
      );

    const selectedForm = forms[0] ?? null;

    if (!selectedForm) return null;

    return {
      uuid: selectedForm.uuid || "",

      name:
        selectedForm.name ||
        selectedForm.species ||
        "Digimon",

      displayName:
        selectedForm.displayName ||
        selectedForm.species ||
        selectedForm.name ||
        "Digimon",

      species:
        selectedForm.species ||
        selectedForm.name ||
        "Digimon",

      img:
        selectedForm.img ||
        "icons/svg/mystery-man.svg",

      portraitImg:
        selectedForm.portraitImg ||
        selectedForm.img ||
        "icons/svg/mystery-man.svg",

      stage:
        selectedForm.stage ||
        stageKey,

      sourceId:
        selectedForm.sourceId || "",

      evolutionCategory:
        selectedForm.evolutionCategory ||
        "normal",

      specialCategories:
        Array.isArray(
          selectedForm.specialCategories
        )
          ? foundry.utils.deepClone(
              selectedForm.specialCategories
            )
          : [],

      specialCategoriesText:
        Array.isArray(
          selectedForm.specialCategories
        )
          ? selectedForm.specialCategories.join("|")
          : "",

      primarySpecialCategory:
        selectedForm.primarySpecialCategory ||
        "",

      isSpecialForm:
        Boolean(
          selectedForm.isSpecialForm
        ),

      rawEvolutionCategory:
        selectedForm.rawEvolutionCategory ||
        selectedForm.evolutionCategory ||
        "normal",

      rawIsSpecialForm:
        Boolean(
          selectedForm.rawIsSpecialForm ??
          selectedForm.isSpecialForm
        ),

      source:
        selectedForm.snapshot
          ? "database"
          : "actor-line",

      snapshot:
        Boolean(selectedForm.snapshot)
    };
  }

  _getSavedEvolutionChoice(
    tamer,
    stageKey = ""
  ) {
    return (
      tamer?.system?.partner
        ?.evolutionChoices
        ?.[stageKey] ??
      this._getActorSavedEvolutionChoice(
        stageKey
      )
    );
  }

async _getDirectCandidates(targetStage) {
  const [curatedCandidates, graphCandidates] = await Promise.all([
    this._getCuratedDirectCandidates(targetStage),
    this._getGraphDirectCandidates(targetStage)
  ]);

  const byIdentity = new Map();

  for (const candidate of [
    ...curatedCandidates,
    ...graphCandidates
  ]) {
    const identity = [
      candidate.stage,
      devLookupKey(
        candidate.sourceId ||
        candidate.species ||
        candidate.name
      )
    ].join(":");

    if (!identity) continue;

    const existing = byIdentity.get(identity);

    /*
     * A database curada vence o grafo local.
     * O grafo só complementa linhas homebrew ou antigas.
     */
    if (!existing || candidate.source === "database") {
      byIdentity.set(identity, candidate);
    }
  }

  const rankWeight = (rank = "") => {
    if (rank === "primary") return 0;
    if (rank === "secondary") return 1;
    return 2;
  };

  return [...byIdentity.values()].sort((a, b) => {
    const rankDifference =
      rankWeight(a.relationRank) -
      rankWeight(b.relationRank);

    if (rankDifference !== 0) {
      return rankDifference;
    }

    const scoreDifference =
      Number(b.compatibility?.score ?? 0) -
      Number(a.compatibility?.score ?? 0);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return String(a.displayName ?? a.name ?? "").localeCompare(
      String(b.displayName ?? b.name ?? ""),
      game.i18n.lang
    );
  });
}

async _findCuratedDatabaseActor() {
  const directMatch = await DDADigimonDatabase.findForActor(
    this.actor
  );

  if (directMatch) return directMatch;

  const currentStage = String(
    this.actor.system?.stage ?? ""
  ).trim();

  const actorKeys = new Set(
    getActorLookupKeys(this.actor)
  );

  const allEntries =
    await DDADigimonDatabase.getAll({
      includeVirtualSpecialForms: true
    });

  return allEntries.find((entry) => {
    const entryStage = String(
      entry.system?.stage ??
      entry.stage ??
      ""
    ).trim();

    if (currentStage && entryStage !== currentStage) {
      return false;
    }

    const candidate = databaseEntryToCandidate(entry);

    return getCandidateLookupKeys(candidate).some((key) => {
      return actorKeys.has(key);
    });
  }) ?? null;
}

async _getCuratedDirectCandidates(targetStage) {
  const origin = await this._findCuratedDatabaseActor();

  if (!origin) return [];

  const originCandidate = databaseEntryToCandidate(origin);

  const originKeys = new Set(
    getCandidateLookupKeys(originCandidate)
  );

  const allEntries =
    await DDADigimonDatabase.getAll({
      includeVirtualSpecialForms: true
    });

  const candidatesByIdentity = new Map();

  const isAllowedDirectRelation = (
    relation = {}
  ) => {
    const relationType = String(
      relation.relationType ?? "normal"
    )
      .trim()
      .toLowerCase();

    const evolutionCategory = String(
      relation.evolutionCategory ?? "normal"
    )
      .trim()
      .toLowerCase();

    const allowedCategories = new Set([
      "normal",
      "hybrid"
    ]);

    return (
      allowedCategories.has(relationType) &&
      allowedCategories.has(
        evolutionCategory
      )
    );
  };

  const relationReferencesOrigin = (relation = {}) => {
    const possibleKeys = [
      relation.databaseId,
      relation.key,
      relation.sourceId,
      relation.sourceName,
      relation.species,
      relation.name,
      relation.id
    ];

    return possibleKeys.some((value) => {
      return originKeys.has(devLookupKey(value));
    });
  };

  const addCandidate = (entry, relation = {}) => {
    const candidate = databaseEntryToCandidate(entry);

    if (!candidate || candidate.stage !== targetStage) {
      return;
    }

    const rawCategory = String(
      candidate.rawEvolutionCategory ??
      candidate.evolutionCategory ??
      "normal"
    )
      .trim()
      .toLowerCase();

    const rawSpecialForm = Boolean(
      candidate.rawIsSpecialForm ??
      candidate.isSpecialForm
    );

    const isNormalCandidate = (
      rawCategory === "normal" &&
      !rawSpecialForm
    );

    const isHybridCandidate =
      rawCategory === "hybrid";

    if (
      !isNormalCandidate &&
      !isHybridCandidate
    ) {
      return;
    }

    const identity = [
      candidate.stage,
      devLookupKey(
        candidate.sourceId ||
        candidate.species ||
        candidate.name
      )
    ].join(":");

    if (!identity || candidatesByIdentity.has(identity)) {
      return;
    }

    const enriched = this._withCompatibility(
      {
        ...candidate,
        direct: true,
        relationRank: relation.rank ?? "secondary"
      },
      new Set([
        normalize(candidate.species || candidate.name)
      ]),
      {
        protectCuratedDirect: true
      }
    );

    if (enriched) {
      candidatesByIdentity.set(identity, enriched);
    }
  };

  /*
   * Primeiro: relações salvas diretamente na forma atual.
   * Exemplo: Renamon -> Tenkomon.
   */
  const outgoingRelations = Array.isArray(
    origin.system?.evolutionIndex?.normalTo
  )
    ? origin.system.evolutionIndex.normalTo
    : [];

  for (const relation of outgoingRelations) {
    if (
      !isAllowedDirectRelation(relation)
    ) {
      continue;
    }

    const entry = await DDADigimonDatabase.getByReference(
      relation,
      targetStage
    );

    addCandidate(entry, relation);
  }

  /*
   * Depois: procura candidatos que registram Renamon
   * como evolução anterior.
   *
   * Isso cobre relações curadas que ficaram gravadas
   * no normalFrom do Adulto em vez do normalTo do Rookie.
   */
  for (const entry of allEntries) {
    const incomingRelations = Array.isArray(
      entry.system?.evolutionIndex?.normalFrom
    )
      ? entry.system.evolutionIndex.normalFrom
      : [];

    const matchingRelation = incomingRelations.find((relation) => {
      return (
        isAllowedDirectRelation(relation) &&
        relationReferencesOrigin(relation)
      );
    });

    if (!matchingRelation) continue;

    addCandidate(entry, matchingRelation);
  }

  const rankWeight = (rank = "") => {
    if (rank === "primary") return 0;
    if (rank === "secondary") return 1;
    return 2;
  };

  return [...candidatesByIdentity.values()].sort((a, b) => {
    const rankDifference =
      rankWeight(a.relationRank) -
      rankWeight(b.relationRank);

    if (rankDifference !== 0) {
      return rankDifference;
    }

    const scoreDifference =
      Number(b.compatibility?.score ?? 0) -
      Number(a.compatibility?.score ?? 0);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return String(a.displayName ?? a.name ?? "").localeCompare(
      String(b.displayName ?? b.name ?? ""),
      game.i18n.lang
    );
  });
}

async _getGraphDirectCandidates(targetStage) {
  const graph = this.actor.system?.evolutionGraph ?? {};
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const currentNode = findCurrentEvolutionGraphNode(graph, this.actor);

  const outgoing = edges.filter((edge) => {
    return edge.from === currentNode?.id;
  });

  const byId = new Map(
    nodes.map((node) => [node.id, node])
  );

  const candidates = [];

  for (const edge of outgoing) {
    const node = byId.get(edge.to);

    if (!node?.actorUuid) continue;

    const actor = await resolveActor(node.actorUuid);

    const useFrozenNode = Boolean(
      actor?.uuid === this.actor.uuid &&
      node.stage &&
      node.stage !== this.actor.system?.stage
    );

    const candidate = useFrozenNode
      ? nodeToCandidate(node, {
          source: "graph",
          direct: true
        })
      : (
          actorToCandidate(actor, {
            source: "graph",
            direct: true
          }) ??
          nodeToCandidate(node, {
            source: "graph",
            direct: true
          })
        );

    if (!candidate || candidate.stage !== targetStage) {
      continue;
    }

    const enriched = this._withCompatibility(
      candidate,
      new Set()
    );

    if (enriched) {
      candidates.push(enriched);
    }
  }

  return candidates;
}

  async _getExplorationCandidates(targetStage, directNames) {
    const candidates = [];
    const seen = new Set(directNames);
    const term = normalize(this.searchTerm);

    for (const actor of game.actors ?? []) {
      const candidate = actorToCandidate(actor, { source: "actor" });
      if (!candidate || candidate.stage !== targetStage) continue;
      const nameKey = normalize(candidate.species || candidate.name);
      if (seen.has(nameKey)) continue;
      if (term && !this._matchesExplorationSearch(candidate, term)) {
  continue;
}
      const enriched = this._withCompatibility(candidate, directNames);
      if (!enriched) continue;
      seen.add(nameKey);
      candidates.push(enriched);
    }

    for (
      const entry of
      await DDADigimonDatabase.getAll({
        includeVirtualSpecialForms: true
      })
    ) {
      const candidate = databaseEntryToCandidate(entry);
      if (!candidate || candidate.stage !== targetStage) continue;
      const nameKey = normalize(candidate.species || candidate.name);
      if (seen.has(nameKey)) continue;
      if (term && !this._matchesExplorationSearch(candidate, term)) {
  continue;
}
      const enriched = this._withCompatibility(candidate, directNames);
      if (!enriched) continue;
      seen.add(nameKey);
      candidates.push(enriched);
    }

    return candidates.sort((a, b) => {
      const scoreDifference = Number(b.compatibility?.score ?? 0) - Number(a.compatibility?.score ?? 0);
      if (scoreDifference !== 0) return scoreDifference;

      const aUsable = a.usable ? 1 : 0;
      const bUsable = b.usable ? 1 : 0;
      if (aUsable !== bUsable) return bUsable - aUsable;

      return String(a.displayName ?? a.name ?? "").localeCompare(String(b.displayName ?? b.name ?? ""), game.i18n.lang);
    });
  }

  _matchesExplorationSearch(candidate = {}, term = "") {
  const searchable = [
    candidate.name,
    candidate.displayName,
    candidate.species,
    candidate.originalName,
    candidate.dubName,
    candidate.sourceId,
    candidate.key,
    ...(Array.isArray(candidate.aliases)
      ? candidate.aliases
      : [])
  ]
    .filter(Boolean)
    .join(" ");

  return normalize(searchable).includes(normalize(term));
}

  _withCompatibility(
    candidate,
    directNames,
    {
      protectCuratedDirect = false
    } = {}
  ) {
    const ignoreExclusionLists = Boolean(
      protectCuratedDirect &&
      candidate?.direct &&
      candidate?.source === "database"
    );

    if (
      isCandidateExcludedByDev(
        candidate,
        this.actor,
        {
          ignoreExclusionLists
        }
      )
    ) {
      return null;
    }

    const isDatabaseSnapshot = candidate.source === "database";
    const usable = isDatabaseSnapshot || (candidate.usable !== false && isUsableEvolutionCandidateUuid(candidate.uuid));
    const compatibility = getCompatibility(candidate, this.actor, directNames);

    return {
      ...candidate,
      usable,
      selectable: usable,
      missingActor: !isDatabaseSnapshot && (candidate.missingActor || !usable),
      snapshotOnly: isDatabaseSnapshot,
      selected: false,
      buttonLabel: usable
        ? (isDatabaseSnapshot ? localize("DDA.EvolutionChoice.SelectSnapshot") : localize("DDA.EvolutionChoice.Select"))
        : localize("DDA.EvolutionChoice.NotAvailable"),
      displayName: candidate.displayName || getCandidateDisplayName(candidate.name || candidate.species),
      stageLabel: stageLabel(candidate.stage),
      compatibility
    };
  }


  _markSelected(candidate, selectedChoice = null) {
    if (!candidate) return candidate;
    const selectedUuid = String(selectedChoice?.uuid ?? "").trim();
    const selectedName = normalize(selectedChoice?.species || selectedChoice?.name || "");
    const candidateUuid = String(candidate.uuid ?? "").trim();
    const candidateName = normalize(candidate.species || candidate.name || "");

    const selected = Boolean(
      (selectedUuid && candidateUuid && selectedUuid === candidateUuid) ||
      (selectedName && candidateName && selectedName === candidateName)
    );

    return {
      ...candidate,
      selected,
      buttonLabel: selected
        ? localize("DDA.EvolutionChoice.SelectedShort")
        : (
            candidate.usable
              ? (candidate.snapshotOnly ? localize("DDA.EvolutionChoice.SelectSnapshot") : localize("DDA.EvolutionChoice.Select"))
              : localize("DDA.EvolutionChoice.NotAvailable")
          )
    };
  }

  async _onSelectChoice(event) {
  event.preventDefault();

  const choice = this._choiceFromButton(event.currentTarget);

  if (!choice.snapshot && !isUsableEvolutionCandidateUuid(choice.uuid)) {
    ui.notifications.warn(localize("DDA.Warning.ChosenEvolutionFormNotFound"));
    return;
  }

  this.pendingChoice = choice;

  ui.notifications.info(game.i18n.format("DDA.EvolutionChoice.Selected", {
    name: choice.displayName || choice.name
  }));

  this.render(true);
}

_choiceFromButton(button) {
  return {
    uuid: button.dataset.uuid ?? "",
    name: button.dataset.name ?? "",
    displayName: button.dataset.displayName ?? button.dataset.name ?? "",
    species: button.dataset.species ?? button.dataset.name ?? "",
    img: button.dataset.img ?? "icons/svg/mystery-man.svg",
    portraitImg: button.dataset.portraitImg ?? button.dataset.img ?? "icons/svg/mystery-man.svg",
    stage: button.dataset.stage ?? "",
    compatibility: Number(button.dataset.compatibility ?? 0),
    source: button.dataset.source ?? "exploration",
    snapshot: (button.dataset.source ?? "exploration") === "database",
    selectedAt: new Date().toISOString(),
    sourceId:
      button.dataset.sourceId ?? "",

    originalName:
      button.dataset.originalName ?? "",

    dubName:
      button.dataset.dubName ?? "",

    evolutionCategory:
      button.dataset.evolutionCategory ??
      "normal",

    specialCategories: String(
      button.dataset.specialCategories ?? ""
    )
      .split("|")
      .map((entry) => entry.trim())
      .filter(Boolean),

    specialCategoriesText:
      button.dataset.specialCategories ?? "",

    primarySpecialCategory:
      button.dataset.primarySpecialCategory ??
      "",

    isSpecialForm:
      button.dataset.isSpecialForm ===
      "true",

    rawEvolutionCategory:
      button.dataset.rawEvolutionCategory ??
      button.dataset.evolutionCategory ??
      "normal",

    rawIsSpecialForm:
      button.dataset.rawIsSpecialForm ===
      "true",

    aliases: String(
      button.dataset.aliases ?? ""
    )
      .split("|")
      .map((entry) => entry.trim())
      .filter(Boolean)
  };
}

async _onClearEvolutionChoice(event) {
  event.preventDefault();

  const button = event.currentTarget;
  const stage =
    button.dataset.stage ||
    this.pendingChoice?.stage ||
    nextStage(this.actor.system?.stage || "");

  const pendingChoice = this.pendingChoice
    ? foundry.utils.deepClone(this.pendingChoice)
    : null;

  const tamer = await this._getLinkedTamer();

  const tamerSavedChoice =
    tamer?.system?.partner
      ?.evolutionChoices
      ?.[stage] ?? null;

  const actorSavedChoice =
    this._getActorSavedEvolutionChoice(
      stage
    );

  const savedChoice =
    tamerSavedChoice ??
    actorSavedChoice;

  if (!pendingChoice && !savedChoice) {
    ui.notifications.info(
      localize(
        "DDA.EvolutionChoice.NoSelectionToClear"
      )
    );

    this.render(true);
    return;
  }

  this.pendingChoice = null;

  if (tamerSavedChoice) {
    await tamer.update({
      [
        `system.partner.evolutionChoices.-=${stage}`
      ]: null
    });
  }

  if (savedChoice) {
    const removalChoice = {
      ...savedChoice,
      stage: savedChoice.stage || stage
    };

    await this._removeChoiceFromGraph(
      removalChoice
    );

    await this._removeChoiceFromActorEvolutionLists(
      removalChoice
    );
  }

  const removedChoice =
    pendingChoice ??
    savedChoice;

  const removedName =
    removedChoice?.displayName ||
    removedChoice?.species ||
    removedChoice?.name ||
    stage;

  ui.notifications.info(
    game.i18n.format(
      "DDA.EvolutionChoice.SelectionCleared",
      {
        name: removedName
      }
    )
  );

  this.render(true);
  this.actor.sheet?.render(false);
}

async _onSaveEvolutionChoice(event) {
  event.preventDefault();

  const tamer = await this._getLinkedTamer();

  const targetStage =
    event.currentTarget?.dataset?.stage ||
    nextStage(this.actor.system?.stage || "");

  const savedChoice =
    this._getSavedEvolutionChoice(
      tamer,
      targetStage
    );

  const choice =
    this.pendingChoice ??
    savedChoice ??
    null;

  if (!choice) {
    ui.notifications.warn(localize("DDA.EvolutionChoice.NoSelection"));
    return;
  }

  if (!choice.snapshot && !isUsableEvolutionCandidateUuid(choice.uuid)) {
    ui.notifications.warn(localize("DDA.Warning.ChosenEvolutionFormNotFound"));
    return;
  }

  const cleanChoice = {
    ...choice,
    stage: choice.stage || targetStage,
    savedAt: new Date().toISOString()
  };

  if (tamer) {
    await this._saveChoiceToTamer(
      tamer,
      cleanChoice
    );
  }

  await this._addChoiceToGraph(
    cleanChoice
  );

  await this._saveChoiceToActorEvolutionLists(
    cleanChoice
  );

  this.pendingChoice = null;

  ui.notifications.info(game.i18n.format("DDA.EvolutionChoice.Saved", {
    name: cleanChoice.displayName || cleanChoice.species || cleanChoice.name
  }));

  this.actor.sheet?.render(true);
  this.close();
}

async _saveChoiceToTamer(tamer, choice) {
  const choices = foundry.utils.deepClone(tamer.system.partner?.evolutionChoices ?? {});
  choices[choice.stage] = choice;

  await tamer.update({ "system.partner.evolutionChoices": choices });
}


_getChoiceIdentityKey(choice = {}) {
  return normalize([
    choice.uuid,
    choice.sourceId,
    choice.species,
    choice.name,
    choice.displayName
  ].filter(Boolean).join(" "));
}

_choiceMatchesRegisteredForm(choice = {}, form = {}) {
  const choiceUuid = String(choice.uuid ?? "").trim();
  const formUuid = String(form.uuid ?? form.formUuid ?? form.actorUuid ?? "").trim();

  if (choiceUuid && formUuid && choiceUuid === formUuid) return true;

  const choiceSourceId = String(choice.sourceId ?? "").trim();
  const formSourceId = String(form.sourceId ?? "").trim();

  if (choiceSourceId && formSourceId && choiceSourceId === formSourceId) return true;

  const choiceName = normalize(choice.species || choice.name || choice.displayName || "");
  const formName = normalize(form.species || form.name || form.displayName || "");

  return Boolean(choiceName && formName && choiceName === formName && String(choice.stage ?? "") === String(form.stage ?? ""));
}

_buildRegisteredEvolutionForm(choice = {}) {
  return {
    id: choice.uuid || choice.sourceId || choice.name || foundry.utils.randomID(),
    uuid: choice.uuid || "",
    actorUuid: choice.uuid || "",
    sourceId: choice.sourceId || "",
    snapshot: Boolean(choice.snapshot),
    source: choice.source || "evolution-choice-browser",
    name: choice.name || choice.species || "Digimon",
    displayName: choice.displayName || getCandidateDisplayName(choice.species || choice.name),
    species: choice.species || choice.name || "",
    originalName: choice.originalName || "",
    dubName: choice.dubName || "",
    aliases: Array.isArray(choice.aliases) ? choice.aliases : [],
    img: choice.img || "icons/svg/mystery-man.svg",
    portraitImg: choice.portraitImg || choice.img || "icons/svg/mystery-man.svg",
    stage: choice.stage || "",
    compatibility: Number(choice.compatibility ?? 0),
    savedAt: choice.savedAt || new Date().toISOString()
  };
}

async _saveChoiceToActorEvolutionLists(choice = {}) {
  const stageKey =
    choice.stage ||
    nextStage(this.actor.system?.stage || "");

  if (!stageKey) return;

  const slot =
    this.actor.system
      ?.evolutionLine
      ?.forms
      ?.[stageKey] ?? {};

  const currentForms =
    normalizeEvolutionChoiceSlotForms(
      slot,
      stageKey
    );

  const nextForm =
    buildEvolutionChoiceLineForm({
      ...choice,
      stage: stageKey
    });

  const remainingForms =
    currentForms.filter((form) => {
      const sameUuid =
        form.uuid &&
        nextForm.uuid &&
        form.uuid === nextForm.uuid;

      const sameSourceId =
        form.sourceId &&
        nextForm.sourceId &&
        form.sourceId ===
          nextForm.sourceId;

      const sameName =
        normalize(
          form.species ||
          form.name ||
          form.displayName
        ) ===
        normalize(
          nextForm.species ||
          nextForm.name ||
          nextForm.displayName
        );

      return !(
        sameUuid ||
        sameSourceId ||
        sameName
      );
    });

  const nextForms = [
    nextForm,
    ...remainingForms
  ];

  await this.actor.update(
    buildEvolutionChoiceSlotUpdate(
      stageKey,
      nextForms
    )
  );
}

async _removeChoiceFromActorEvolutionLists(choice = {}) {
  const stageKey = choice.stage || nextStage(this.actor.system?.stage || "");

  if (!stageKey) return;

  const slot = this.actor.system?.evolutionLine?.forms?.[stageKey] ?? {};
  const currentForms = normalizeEvolutionChoiceSlotForms(slot, stageKey);
  const choiceForm = buildEvolutionChoiceLineForm({
    ...choice,
    stage: stageKey
  });

  const filteredForms = currentForms.filter((form) => {
    const sameUuid = form.uuid && choiceForm.uuid && form.uuid === choiceForm.uuid;
    const sameSourceId = form.sourceId && choiceForm.sourceId && form.sourceId === choiceForm.sourceId;
    const sameName =
      normalize(form.species || form.name || form.displayName) ===
      normalize(choiceForm.species || choiceForm.name || choiceForm.displayName);

    return !(sameUuid || sameSourceId || sameName);
  });

  if (filteredForms.length === currentForms.length) return;

  await this.actor.update(buildEvolutionChoiceSlotUpdate(stageKey, filteredForms));
}

async _removeChoiceFromGraph(choice) {
  const graph = foundry.utils.deepClone(this.actor.system?.evolutionGraph ?? { nodes: [], edges: [] });
  graph.nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  graph.edges = Array.isArray(graph.edges) ? graph.edges : [];

  const fromNode = findCurrentEvolutionGraphNode(graph, this.actor);
  if (!fromNode) return;

  const stableUuid = getEvolutionChoiceStableUuid(choice);
  const choiceRealUuid = String(choice?.uuid ?? "").trim();
  const choiceSourceId = String(choice?.sourceId ?? "").trim();
  const choiceName = normalize(choice?.species || choice?.name || choice?.displayName || "");

  const toNode = graph.nodes.find((node) => {
    const nodeUuid = String(node?.actorUuid || node?.uuid || "").trim();
    const nodeRealUuid = String(node?.realActorUuid || "").trim();
    const nodeSourceId = String(node?.sourceId || "").trim();
    const nodeName = normalize(node?.species || node?.displayName || node?.name || "");

    return (
      (stableUuid && nodeUuid === stableUuid) ||
      (choiceRealUuid && nodeRealUuid === choiceRealUuid) ||
      (choiceSourceId && nodeSourceId === choiceSourceId) ||
      (choiceName && nodeName === choiceName)
    );
  });

  if (!toNode) return;

  const previousLength = graph.edges.length;

  graph.edges = graph.edges.filter((edge) => {
    if (edge.from !== fromNode.id || edge.to !== toNode.id) return true;

    const createdByBrowser =
      edge.source === "evolution-choice-browser" ||
      edge.choiceUuid === stableUuid ||
      edge.choiceRealActorUuid === choiceRealUuid ||
      edge.choiceSourceId === choiceSourceId ||
      (edge.explored === true && String(edge.method ?? "normal") === "normal");

    return !createdByBrowser;
  });

  if (graph.edges.length === previousLength) return;

  const stillConnected = graph.edges.some((edge) => {
    return edge.from === toNode.id || edge.to === toNode.id;
  });

  const isBrowserSnapshotNode = Boolean(
    toNode.snapshot ||
    String(toNode.actorUuid || toNode.uuid || "").startsWith("DDA-SNAPSHOT.") ||
    toNode.source === "evolution-choice-browser" ||
    toNode.source === "database" ||
    toNode.source === "exploration"
  );

  if (!stillConnected && isBrowserSnapshotNode) {
    graph.nodes = graph.nodes.filter((node) => node.id !== toNode.id);
  }

  await this.actor.update({ "system.evolutionGraph": graph });
}

async _addChoiceToGraph(choice) {
  const graph = foundry.utils.deepClone(this.actor.system?.evolutionGraph ?? { nodes: [], edges: [] });
  graph.layout = graph.layout ?? { mode: "solar" };
  graph.nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  graph.edges = Array.isArray(graph.edges) ? graph.edges : [];

  const currentFormUuid =
    this.actor.system?.evolution?.currentFormUuid ||
    this.actor.system?.evolution?.sourceFormUuid ||
    this.actor.uuid;

  let fromNode = findCurrentEvolutionGraphNode(graph, this.actor);

  if (!fromNode) {
    fromNode = {
      id: foundry.utils.randomID(),
      actorUuid: currentFormUuid,
      uuid: currentFormUuid,
      sourceFormUuid: currentFormUuid,
      name: this.actor.system?.species || this.actor.name,
      displayName: this.actor.system?.species || this.actor.name,
      species: this.actor.system?.species || this.actor.name,
      img: getCandidateImagePath(
        this.actor.img,
        {
          name: this.actor.name,
          species:
            this.actor.system?.species,
          stage:
            this.actor.system?.stage
        }
      ),

      evolutionCategory:
        this.actor.system
          ?.evolutionCategory ||
        "normal",

      specialCategories:
        Array.isArray(
          this.actor.system
            ?.specialCategories
        )
          ? foundry.utils.deepClone(
              this.actor.system
                .specialCategories
            )
          : [],

      primarySpecialCategory:
        this.actor.system
          ?.primarySpecialCategory ||
        "",

      isSpecialForm:
        Boolean(
          this.actor.system
            ?.isSpecialForm
        ),

      rawEvolutionCategory:
        this.actor.system
          ?.evolutionCategory ||
        "normal",

      rawIsSpecialForm:
        Boolean(
          this.actor.system
            ?.isSpecialForm
        ),

      portraitImg: String(
        this.actor.system?.evolution?.portraitImg ||
        this.actor.flags?.["digimon-digital-adventures"]?.digivicePortrait ||
        getDdaPortraitPath({
          key: this.actor.system?.sourceId || "",
          name: this.actor.name,
          species: this.actor.system?.species || this.actor.name,
          aliases: getDigimonAliases(this.actor)
        }) ||
        this.actor.img || "icons/svg/mystery-man.svg"
      ),
      stage: this.actor.system?.stage || ""
    };

    graph.nodes.push(fromNode);
  }

  if (!choice.snapshot && !isUsableEvolutionCandidateUuid(choice.uuid)) {
    ui.notifications.warn(localize("DDA.Warning.ChosenEvolutionFormNotFound"));
    return;
  }

  const stableUuid = getEvolutionChoiceStableUuid(choice);
  const choiceName = normalize(choice.species || choice.name || choice.displayName || "");
  const choiceSourceId = String(choice.sourceId || "").trim();

  let toNode = graph.nodes.find((node) => {
    const nodeUuid = String(node.actorUuid || node.uuid || "").trim();
    const nodeSourceId = String(node.sourceId || "").trim();
    const nodeName = normalize(node.species || node.name || node.displayName || "");

    return (
      (stableUuid && nodeUuid && nodeUuid === stableUuid) ||
      (choiceSourceId && nodeSourceId && nodeSourceId === choiceSourceId) ||
      (choiceName && nodeName && nodeName === choiceName && String(node.stage || "") === String(choice.stage || ""))
    );
  });

  if (!toNode) {
    toNode = {
      id: foundry.utils.randomID(),
      actorUuid: stableUuid,
      uuid: stableUuid,
      realActorUuid: choice.uuid || "",
      sourceId: choice.sourceId || "",
      snapshot: Boolean(choice.snapshot),
      source: choice.source || "exploration",
      name: choice.name || choice.species || "Digimon",
      displayName: choice.displayName || getCandidateDisplayName(choice.species || choice.name),
      species: choice.species || choice.name || "",
      originalName:
        choice.originalName || "",

      dubName:
        choice.dubName || "",

      aliases:
        Array.isArray(choice.aliases)
          ? choice.aliases
          : [],

      evolutionCategory:
        choice.evolutionCategory ||
        "normal",

      specialCategories:
        Array.isArray(
          choice.specialCategories
        )
          ? foundry.utils.deepClone(
              choice.specialCategories
            )
          : [],

      primarySpecialCategory:
        choice.primarySpecialCategory ||
        "",

      isSpecialForm:
        Boolean(choice.isSpecialForm),

      rawEvolutionCategory:
        choice.rawEvolutionCategory ||
        choice.evolutionCategory ||
        "normal",

      rawIsSpecialForm:
        Boolean(
          choice.rawIsSpecialForm ??
          choice.isSpecialForm
        ),

      img:
        choice.img ||
        "icons/svg/mystery-man.svg",
      portraitImg: choice.portraitImg || choice.img || "icons/svg/mystery-man.svg",
      stage: choice.stage,
      explored: true
    };

    graph.nodes.push(toNode);
  } else {
    Object.assign(toNode, {
      actorUuid: toNode.actorUuid || stableUuid,
      uuid: toNode.uuid || stableUuid,
      realActorUuid: choice.uuid || toNode.realActorUuid || "",
      sourceId: choice.sourceId || toNode.sourceId || "",
      snapshot: Boolean(choice.snapshot || toNode.snapshot),
      source: choice.source || toNode.source || "exploration",
      name: choice.name || toNode.name,
      displayName: choice.displayName || toNode.displayName,
      species: choice.species || toNode.species,
      originalName: choice.originalName || toNode.originalName || "",
      dubName: choice.dubName || toNode.dubName || "",
      aliases:
        Array.isArray(choice.aliases)
          ? choice.aliases
          : (toNode.aliases ?? []),

      evolutionCategory:
        choice.evolutionCategory ||
        toNode.evolutionCategory ||
        "normal",

      specialCategories:
        Array.isArray(
          choice.specialCategories
        )
          ? foundry.utils.deepClone(
              choice.specialCategories
            )
          : (
              toNode.specialCategories ??
              []
            ),

      primarySpecialCategory:
        choice.primarySpecialCategory ||
        toNode.primarySpecialCategory ||
        "",

      isSpecialForm:
        Boolean(
          choice.isSpecialForm ??
          toNode.isSpecialForm
        ),

      rawEvolutionCategory:
        choice.rawEvolutionCategory ||
        toNode.rawEvolutionCategory ||
        choice.evolutionCategory ||
        toNode.evolutionCategory ||
        "normal",

      rawIsSpecialForm:
        Boolean(
          choice.rawIsSpecialForm ??
          toNode.rawIsSpecialForm ??
          choice.isSpecialForm ??
          toNode.isSpecialForm
        ),

      img: choice.img || toNode.img,
      portraitImg: choice.portraitImg || toNode.portraitImg || choice.img || toNode.img,
      stage: choice.stage || toNode.stage,
      explored: true
    });
  }

  const exists = graph.edges.some((edge) => edge.from === fromNode.id && edge.to === toNode.id);

  if (!exists) {
    graph.edges.push({
      id: foundry.utils.randomID(),
      from: fromNode.id,
      to: toNode.id,
      method: "normal",
      explored: choice.source !== "graph",
      source: "evolution-choice-browser",
      choiceStage: choice.stage,
      choiceUuid: stableUuid,
      choiceRealActorUuid: choice.uuid || "",
      choiceSourceId: choice.sourceId || "",
      choiceSnapshot: Boolean(choice.snapshot),
      choiceName: choice.name || choice.species || ""
    });
  }

  await this.actor.update({ "system.evolutionGraph": graph });
}
}

function getEvolutionCompatibilityCurationData() {
  return {
    overrides: getStoredDevObject(DEV_EVOLUTION_COMPATIBILITY_FLAG),
    exclusions: getStoredDevObject(DEV_EVOLUTION_EXCLUSIONS_FLAG)
  };
}

function getFirstCandidateKey(candidate = {}) {
  return getCandidateLookupKeys(candidate)[0] || devLookupKey(candidate.name || candidate.species || candidate.key || "digimon");
}

function getCandidateDevId(candidate = {}) {
  const source = devLookupKey(candidate.sourceLabel || candidate.source || "unknown");
  const stage = devLookupKey(candidate.stage || "unknown");
  const uuid = devLookupKey(candidate.uuid || candidate.actorUuid || candidate.documentUuid || candidate.compendiumUuid || "");
  const key = getFirstCandidateKey(candidate);
  return [source, stage, uuid || key].filter(Boolean).join(":");
}

function getCandidateDedupKey(candidate = {}) {
  const stage = devLookupKey(candidate.stage || "unknown");
  const name = devLookupKey(candidate.species || candidate.displayName || candidate.name || candidate.key || "digimon");
  return `${stage}:${name}`;
}

function hasRealCandidateImage(candidate = {}) {
  const img = String(candidate.img || candidate.image || "").trim();
  return Boolean(img && !img.includes("icons/svg/mystery-man.svg"));
}

function getCandidateSourceRank(candidate = {}) {
  const source = String(candidate.sourceLabel || candidate.source || "").toLowerCase();
  if (source.includes("actor")) return 40;
  if (source.includes("compendium")) return 35;
  if (source.includes("graph")) return 30;
  if (source.includes("database")) return 10;
  return 0;
}

function getCandidateCurationRank(candidate = {}) {
  let rank = 0;
  if (candidate.usable !== false && isUsableEvolutionCandidateUuid(candidate.uuid)) rank += 100;
  if (candidate.usable) rank += 30;
  rank += getCandidateSourceRank(candidate);
  if (hasRealCandidateImage(candidate)) rank += 25;
  if (candidate.uuid) rank += 10;
  return rank;
}

function buildPreciseExclusionEntry(candidate = {}) {
  return {
    id: getCandidateDevId(candidate),
    key: getFirstCandidateKey(candidate),
    name: candidate.displayName || candidate.species || candidate.name || "Digimon",
    stage: candidate.stage || "",
    source: candidate.sourceLabel || candidate.source || "",
    uuid: candidate.uuid || ""
  };
}

function exclusionEntryMatchesCandidate(entry, candidate = {}) {
  if (entry === undefined || entry === null) return false;

  if (typeof entry === "string") {
    const wanted = devLookupKey(entry);
    return getCandidateLookupKeys(candidate).some((key) => key === wanted);
  }

  if (!isPlainObject(entry)) return false;

  const candidateId = getCandidateDevId(candidate);
  if (entry.id && devLookupKey(entry.id) === devLookupKey(candidateId)) return true;

  const stage = devLookupKey(entry.stage || "");
  if (stage && stage !== devLookupKey(candidate.stage || "")) return false;

  const source = devLookupKey(entry.source || "");
  if (source && source !== devLookupKey(candidate.sourceLabel || candidate.source || "")) return false;

  const uuid = devLookupKey(entry.uuid || "");
  if (uuid && uuid !== devLookupKey(candidate.uuid || "")) return false;

  const key = devLookupKey(entry.key || entry.name || "");
  if (key && !getCandidateLookupKeys(candidate).some((candidateKey) => candidateKey === key)) return false;

  return Boolean(source || uuid || key || entry.id);
}

function getAllEvolutionEditorSources() {
  const entries = [];
  const seen = new Set();

  const addCandidate = (candidate, sourceLabel = "") => {
    if (!candidate) return;
    const key = getFirstCandidateKey(candidate);
    if (!key || seen.has(key)) return;
    seen.add(key);
    entries.push({
      ...candidate,
      key,
      sourceLabel,
      displayName: candidate.displayName || getCandidateDisplayName(candidate.name || candidate.species || key)
    });
  };

  for (const actor of game.actors ?? []) {
    if (
      !["digimon", "npc"].includes(
        actor?.type
      )
    ) {
      continue;
    }

    addCandidate(
      actorToCandidate(
        actor,
        {
          source: "actor"
        }
      ),
      "Actor"
    );
  }

  for (const entry of DDA_DIGIMON_ACTOR_DATABASE ?? []) {
    addCandidate(databaseEntryToCandidate(entry), "Database");
  }

  return entries.sort((a, b) => String(a.displayName ?? a.name ?? "").localeCompare(String(b.displayName ?? b.name ?? ""), game.i18n.lang));
}

function getAllEvolutionEditorCandidates(targetStage = "") {
  const entries = [];
  const seen = new Set();

  const addCandidate = (candidate, sourceLabel = "") => {
    if (!candidate || candidate.stage !== targetStage) return;
    const key = getFirstCandidateKey(candidate);
    const uniqueKey = `${sourceLabel}:${candidate.uuid || key}`;
    if (!key || seen.has(uniqueKey)) return;
    seen.add(uniqueKey);
    entries.push({
      ...candidate,
      key,
      sourceLabel,
      displayName: candidate.displayName || getCandidateDisplayName(candidate.name || candidate.species || key)
    });
  };

  for (const actor of game.actors ?? []) {
    if (
      !["digimon", "npc"].includes(
        actor?.type
      )
    ) {
      continue;
    }

    addCandidate(
      actorToCandidate(
        actor,
        {
          source: "actor"
        }
      ),
      "Actor"
    );
  }

  for (const entry of DDA_DIGIMON_ACTOR_DATABASE ?? []) {
    addCandidate(databaseEntryToCandidate(entry), "Database");
  }

  return entries;
}

function getEditorPseudoActor(origin = {}) {
  return {
    name: origin.name || origin.species || origin.key || "Digimon",
    system: {
      species: origin.species || origin.name || origin.key || "Digimon",
      stage: origin.stage || "",
      attribute: origin.attribute || "",
      field: origin.field || "",
      family: origin.family || "",
      evolution: {
        currentFormName: origin.species || origin.name || origin.key || "Digimon",
        sourceFormName: origin.species || origin.name || origin.key || "Digimon"
      }
    }
  };
}

function getDevObjectValueForKeys(map = {}, fromKey = "", toKeys = []) {
  const group = map?.[fromKey];
  if (!group || typeof group !== "object") return undefined;

  for (const key of toKeys) {
    if (Object.prototype.hasOwnProperty.call(group, key)) return group[key];
  }

  return undefined;
}

function getManualScoreFromOverride(value) {
  if (value === undefined || value === null || value === false || value === "hide") return null;
  if (typeof value === "number") return value;
  if (typeof value === "object") {
    const score = Number(value.score ?? value.compatibility ?? value.value ?? NaN);
    return Number.isFinite(score) ? score : null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasDevExclusion(exclusions = {}, groupKey = "", candidate = "") {
  const group = exclusions?.[groupKey];
  if (!Array.isArray(group)) return false;

  if (typeof candidate === "string") {
    const wanted = devLookupKey(candidate);
    return group.some((entry) => {
      if (typeof entry === "string") return devLookupKey(entry) === wanted;
      if (!isPlainObject(entry)) return false;
      return devLookupKey(entry.id || entry.key || entry.name || "") === wanted;
    });
  }

  return group.some((entry) => exclusionEntryMatchesCandidate(entry, candidate));
}

async function setDevOverride(originKey = "", candidateKey = "", value = null) {
  const overrides = foundry.utils.deepClone(getStoredDevObject(DEV_EVOLUTION_COMPATIBILITY_FLAG));
  overrides[originKey] = isPlainObject(overrides[originKey]) ? overrides[originKey] : {};

  if (value === null || value === undefined || value === "") {
    delete overrides[originKey][candidateKey];
    if (Object.keys(overrides[originKey]).length === 0) delete overrides[originKey];
  } else {
    overrides[originKey][candidateKey] = value;
  }

  await setStoredDevObject(DEV_EVOLUTION_COMPATIBILITY_FLAG, overrides);
  return overrides;
}

async function setDevExclusion(groupKey = "*", candidate = "", enabled = true) {
  const exclusions = foundry.utils.deepClone(getStoredDevObject(DEV_EVOLUTION_EXCLUSIONS_FLAG));
  const normalizedKey = typeof candidate === "string" ? devLookupKey(candidate) : getCandidateDevId(candidate);
  if (!normalizedKey) return exclusions;

  const nextEntry = typeof candidate === "string" ? normalizedKey : buildPreciseExclusionEntry(candidate);
  const group = Array.isArray(exclusions[groupKey]) ? [...exclusions[groupKey]] : [];
  const filtered = group.filter((entry) => {
    if (typeof candidate === "string") {
      if (typeof entry === "string") return devLookupKey(entry) !== normalizedKey;
      return devLookupKey(entry.id || entry.key || entry.name || "") !== normalizedKey;
    }

    return !exclusionEntryMatchesCandidate(entry, candidate);
  });

  if (enabled) filtered.push(nextEntry);

  if (filtered.length) exclusions[groupKey] = filtered;
  else delete exclusions[groupKey];

  await setStoredDevObject(DEV_EVOLUTION_EXCLUSIONS_FLAG, exclusions);
  return exclusions;
}

async function clearDevCurationForOrigin(originKey = "") {
  const overrides = foundry.utils.deepClone(getStoredDevObject(DEV_EVOLUTION_COMPATIBILITY_FLAG));
  const exclusions = foundry.utils.deepClone(getStoredDevObject(DEV_EVOLUTION_EXCLUSIONS_FLAG));
  delete overrides[originKey];
  delete exclusions[originKey];
  await setStoredDevObject(DEV_EVOLUTION_COMPATIBILITY_FLAG, overrides);
  await setStoredDevObject(DEV_EVOLUTION_EXCLUSIONS_FLAG, exclusions);
}

async function hideDuplicateEvolutionCandidates({ targetStage = "", candidates = null } = {}) {
  const sourceCandidates = Array.isArray(candidates)
    ? candidates
    : getAllEvolutionEditorCandidates(targetStage || "");

  const groups = new Map();
  for (const candidate of sourceCandidates) {
    if (!candidate) continue;
    if (targetStage && candidate.stage !== targetStage) continue;
    const dedupKey = getCandidateDedupKey(candidate);
    if (!groups.has(dedupKey)) groups.set(dedupKey, []);
    groups.get(dedupKey).push(candidate);
  }

  const duplicatesToHide = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((a, b) => {
      const rankDifference = getCandidateCurationRank(b) - getCandidateCurationRank(a);
      if (rankDifference !== 0) return rankDifference;
      return String(a.displayName || a.name || "").localeCompare(String(b.displayName || b.name || ""), game.i18n.lang);
    });

    duplicatesToHide.push(...sorted.slice(1));
  }

  for (const candidate of duplicatesToHide) {
    await setDevExclusion("*", candidate, true);
  }

  return duplicatesToHide;
}

function exportEvolutionCompatibilityCuration() {
  const data = getEvolutionCompatibilityCurationData();
  console.log("DDA | Evolution compatibility curation", JSON.stringify(data, null, 2));
  return data;
}

class DDAEvolutionCompatibilityEditor extends Application {
  static ALL_ORIGINS_KEY = "__all__";

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "dda-evolution-compatibility-editor",
      classes: ["dda", "dda-evolution-compatibility-editor"],
      title: "DDA Dev — Curadoria de Evolução",
      width: 1080,
      height: 780,
      resizable: true
    });
  }

  constructor(options = {}) {
    super(options);
    const sources = getAllEvolutionEditorSources();
    const requestedOrigin = devLookupKey(options.origin ?? options.originKey ?? "");
    this.originKey = options.showAllOrigins || options.originKey === DDAEvolutionCompatibilityEditor.ALL_ORIGINS_KEY
      ? DDAEvolutionCompatibilityEditor.ALL_ORIGINS_KEY
      : requestedOrigin || sources[0]?.key || DDAEvolutionCompatibilityEditor.ALL_ORIGINS_KEY;
    this.targetStage = options.targetStage || "child";
    this.searchTerm = "";
    this.showHidden = true;
    this.showDuplicates = true;
    this.showNotImported = true;
    this.draftOverrides = foundry.utils.deepClone(getStoredDevObject(DEV_EVOLUTION_COMPATIBILITY_FLAG));
    this.draftExclusions = foundry.utils.deepClone(getStoredDevObject(DEV_EVOLUTION_EXCLUSIONS_FLAG));
    this._dirty = false;
  }

  get _effectiveOriginKey() {
    return this.originKey === DDAEvolutionCompatibilityEditor.ALL_ORIGINS_KEY ? "*" : this.originKey;
  }

  get _isGlobalSanitationMode() {
    return this.originKey === DDAEvolutionCompatibilityEditor.ALL_ORIGINS_KEY;
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    const rawSources = getAllEvolutionEditorSources();
    const allSource = {
      key: DDAEvolutionCompatibilityEditor.ALL_ORIGINS_KEY,
      displayName: "Todos os Digimon",
      name: "Todos os Digimon",
      stage: "",
      stageLabel: "Saneamento global"
    };
    const sources = [allSource, ...rawSources];
    const origin = this._isGlobalSanitationMode
      ? allSource
      : rawSources.find((entry) => entry.key === this.originKey) ?? rawSources[0] ?? allSource;

    if (!this._isGlobalSanitationMode && origin?.key && this.originKey !== origin.key) this.originKey = origin.key;

    const pseudoActor = this._isGlobalSanitationMode ? getEditorPseudoActor({}) : getEditorPseudoActor(origin ?? {});
    const term = normalize(this.searchTerm);

    const builtCandidates = getAllEvolutionEditorCandidates(this.targetStage)
      .map((candidate) => this._buildEditorCandidate(candidate, pseudoActor, this.draftOverrides, this.draftExclusions));

    const duplicateCounts = builtCandidates.reduce((counts, candidate) => {
      if (!candidate) return counts;
      counts.set(candidate.dedupKey, (counts.get(candidate.dedupKey) ?? 0) + 1);
      return counts;
    }, new Map());

    const bestDuplicateIds = new Set();
    const groups = new Map();
    for (const candidate of builtCandidates) {
      if (!candidate) continue;
      if (!groups.has(candidate.dedupKey)) groups.set(candidate.dedupKey, []);
      groups.get(candidate.dedupKey).push(candidate);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const best = [...group].sort((a, b) => {
        const rankDifference = Number(b.curationRank ?? 0) - Number(a.curationRank ?? 0);
        if (rankDifference !== 0) return rankDifference;
        return String(a.displayName ?? a.name ?? "").localeCompare(String(b.displayName ?? b.name ?? ""), game.i18n.lang);
      })[0];
      if (best?.devId) bestDuplicateIds.add(best.devId);
    }

    const candidates = builtCandidates
      .map((candidate) => candidate ? {
        ...candidate,
        duplicateCount: duplicateCounts.get(candidate.dedupKey) ?? 1,
        duplicate: (duplicateCounts.get(candidate.dedupKey) ?? 1) > 1,
        duplicateWinner: bestDuplicateIds.has(candidate.devId)
      } : null)
      .filter((candidate) => {
        if (!candidate) return false;
        if (!this.showHidden && candidate.hidden) return false;
        if (!this.showDuplicates && candidate.duplicate && !candidate.duplicateWinner) return false;
        if (!this.showNotImported && !candidate.usable) return false;
        if (!term) return true;
        return normalize(`${candidate.name} ${candidate.species} ${candidate.displayName} ${candidate.key} ${candidate.sourceLabel}`).includes(term);
      })
      .sort((a, b) => {
        if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
        if (a.duplicate !== b.duplicate) return a.duplicate ? -1 : 1;
        const scoreDifference = Number(b.compatibility?.score ?? 0) - Number(a.compatibility?.score ?? 0);
        if (scoreDifference !== 0) return scoreDifference;
        return String(a.displayName ?? a.name ?? "").localeCompare(String(b.displayName ?? b.name ?? ""), game.i18n.lang);
      });

    return {
      ...context,
      origin,
      originKey: this.originKey,
      targetStage: this.targetStage,
      searchTerm: this.searchTerm,
      showHidden: this.showHidden,
      showDuplicates: this.showDuplicates,
      showNotImported: this.showNotImported,
      sources,
      stageOptions: STAGE_ORDER.map((stage) => ({ key: stage, label: stageLabel(stage), selected: stage === this.targetStage })),
      candidates,
      dirty: this._dirty,
      globalSanitationMode: this._isGlobalSanitationMode,
      pendingSummary: this._getPendingSummary(),
      visibleDuplicateCount: candidates.filter((candidate) => candidate.duplicate && !candidate.hidden).length,
      curationJson: JSON.stringify({ overrides: this.draftOverrides, exclusions: this.draftExclusions }, null, 2)
    };
  }

  _getPendingSummary() {
    const savedOverrides = JSON.stringify(getStoredDevObject(DEV_EVOLUTION_COMPATIBILITY_FLAG) ?? {});
    const savedExclusions = JSON.stringify(getStoredDevObject(DEV_EVOLUTION_EXCLUSIONS_FLAG) ?? {});
    const draftOverrides = JSON.stringify(this.draftOverrides ?? {});
    const draftExclusions = JSON.stringify(this.draftExclusions ?? {});
    const changed = savedOverrides !== draftOverrides || savedExclusions !== draftExclusions;
    return changed ? "Alterações pendentes" : "Sem alterações pendentes";
  }

  _buildEditorCandidate(candidate, pseudoActor, overrides, exclusions) {
    const key = getFirstCandidateKey(candidate);
    const toKeys = getCandidateLookupKeys(candidate);
    const localOverride = getDevObjectValueForKeys(overrides, this._effectiveOriginKey, toKeys);
    const globalOverride = getDevObjectValueForKeys(overrides, "*", toKeys);
    const manualScore = getManualScoreFromOverride(localOverride ?? globalOverride);
    const hiddenByOverride = localOverride === "hide" || localOverride === false || globalOverride === "hide" || globalOverride === false ||
      (isPlainObject(localOverride) && (localOverride.hidden || localOverride.hide || localOverride.score === "hide" || localOverride.score === false)) ||
      (isPlainObject(globalOverride) && (globalOverride.hidden || globalOverride.hide || globalOverride.score === "hide" || globalOverride.score === false));
    const hiddenLocal = !this._isGlobalSanitationMode && (hasDevExclusion(exclusions, this._effectiveOriginKey, candidate) || hiddenByOverride && localOverride !== undefined);
    const hiddenGlobal = hasDevExclusion(exclusions, "*", candidate) || hiddenByOverride && globalOverride !== undefined;
    const compatibility = getCompatibility(candidate, pseudoActor, new Set());

    if (Number.isFinite(Number(manualScore))) {
      const score = Math.clamp(Number(manualScore), 5, 100);
      compatibility.score = score;
      compatibility.manual = true;
      compatibility.tier = score >= 80 ? "recommended" : score >= 55 ? "plausible" : "uncommon";
      compatibility.label = localize(`DDA.EvolutionChoice.Tier.${compatibility.tier}`);
      compatibility.reasons = ["Curadoria visual", ...(compatibility.reasons ?? [])];
    }

    return {
      ...candidate,
      key,
      devId: getCandidateDevId(candidate),
      dedupKey: getCandidateDedupKey(candidate),
      curationRank: getCandidateCurationRank(candidate),
      stageLabel: stageLabel(candidate.stage),
      sourceLabel: candidate.sourceLabel || candidate.source || "",
      compatibility,
      manualScore,
      hasManualScore: Number.isFinite(Number(manualScore)),
      hidden: Boolean(hiddenLocal || hiddenGlobal),
      hiddenLocal: Boolean(hiddenLocal),
      hiddenGlobal: Boolean(hiddenGlobal),
      usableLabel: candidate.usable ? "Importado" : "Não importado",
      image: candidate.img || "icons/svg/mystery-man.svg"
    };
  }

  async _renderInner(data) {
    return $(this._renderEditorHtml(data));
  }

  _renderEditorHtml(data) {
    const sourceOptions = data.sources.map((source) => {
      const selected = source.key === data.originKey ? "selected" : "";
      const label = source.key === DDAEvolutionCompatibilityEditor.ALL_ORIGINS_KEY
        ? "Todos os Digimon — saneamento global"
        : escapeHtml(`${source.displayName || source.name} (${source.stageLabel || stageLabel(source.stage)})`);
      return `<option value="${escapeHtml(source.key)}" ${selected}>${label}</option>`;
    }).join("");

    const stageOptions = data.stageOptions.map((stage) => {
      return `<option value="${escapeHtml(stage.key)}" ${stage.selected ? "selected" : ""}>${escapeHtml(stage.label)}</option>`;
    }).join("");

    const cards = data.candidates.map((candidate) => this._renderCandidateCard(candidate, data)).join("");
    const dirtyClass = data.dirty ? "is-dirty" : "";

    return `
      <section class="dda-evolution-compatibility-editor-root ${dirtyClass}">
        <header class="dda-evolution-compatibility-editor-header">
          <div class="form-group">
            <label>Digimon de origem</label>
            <select data-action="select-origin">${sourceOptions}</select>
          </div>
          <div class="form-group">
            <label>Estágio alvo</label>
            <select data-action="select-stage">${stageOptions}</select>
          </div>
          <div class="form-group">
            <label>Buscar candidato</label>
            <input type="search" data-action="search-candidate" value="${escapeHtml(data.searchTerm)}" placeholder="Agumon, Hakase, Aquilamon..." />
          </div>
          <div class="dda-evolution-compatibility-toggle-stack">
            <label class="dda-evolution-compatibility-toggle">
              <input type="checkbox" data-action="toggle-hidden" ${data.showHidden ? "checked" : ""} />
              Mostrar ocultos
            </label>
            <label class="dda-evolution-compatibility-toggle">
              <input type="checkbox" data-action="toggle-duplicates" ${data.showDuplicates ? "checked" : ""} />
              Mostrar duplicatas
            </label>
            <label class="dda-evolution-compatibility-toggle">
              <input type="checkbox" data-action="toggle-not-imported" ${data.showNotImported ? "checked" : ""} />
              Mostrar não importados
            </label>
          </div>
        </header>

        <nav class="dda-evolution-compatibility-editor-actions">
          <button type="button" data-action="clean-visible-duplicates">Limpar duplicatas visíveis</button>
          <button type="button" data-action="clean-stage-duplicates">Limpar duplicatas do estágio</button>
          <button type="button" data-action="clear-origin">Limpar origem</button>
          <button type="button" data-action="export-curation">Exportar no console</button>
          <button type="button" data-action="open-json-tool">Abrir JSON</button>
        </nav>

        <nav class="dda-evolution-compatibility-editor-savebar">
          <strong>${escapeHtml(data.pendingSummary)}</strong>
          <span>${data.globalSanitationMode ? "Modo: todos os Digimon do estágio" : "Modo: compatibilidade por origem"}</span>
          <button type="button" data-action="save-curation" ${data.dirty ? "" : "disabled"}>Salvar alterações</button>
          <button type="button" data-action="discard-curation" ${data.dirty ? "" : "disabled"}>Descartar alterações</button>
        </nav>

        <p class="dda-evolution-compatibility-editor-help">
          Em “Todos os Digimon”, a origem não limita a lista: o editor mostra todos os candidatos do estágio escolhido para saneamento global. Os botões alteram um rascunho; clique em <strong>Salvar alterações</strong> para gravar no mundo.
        </p>

        <div class="dda-evolution-compatibility-editor-grid">
          ${cards || `<p class="dda-evolution-compatibility-empty">Nenhum candidato encontrado.</p>`}
        </div>
      </section>
    `;
  }

  _renderCandidateCard(candidate, data = {}) {
    const hiddenClass = candidate.hidden ? "is-hidden-by-dev" : "";
    const manualClass = candidate.hasManualScore ? "has-manual-score" : "";
    const duplicateClass = candidate.duplicate ? "has-duplicate" : "";
    const winnerClass = candidate.duplicateWinner ? "is-duplicate-winner" : "";
    const hiddenLabel = candidate.hiddenGlobal ? "Oculto global" : candidate.hiddenLocal ? "Oculto nesta origem" : "Visível";
    const localButtonLabel = data.globalSanitationMode ? "Ocultar global" : "Ocultar origem";

    return `
      <article class="dda-evolution-compatibility-editor-card ${hiddenClass} ${manualClass} ${duplicateClass} ${winnerClass}" data-candidate-key="${escapeHtml(candidate.key)}" data-candidate-id="${escapeHtml(candidate.devId)}">
        <div class="dda-evolution-compatibility-editor-img">
          <img src="${escapeHtml(candidate.image)}" alt="${escapeHtml(candidate.displayName || candidate.name)}" />
        </div>
        <h3>${escapeHtml(candidate.displayName || candidate.name)}</h3>
        <div class="dda-evolution-compatibility-editor-meta">
          <span>${escapeHtml(candidate.stageLabel)}</span>
          <span>${escapeHtml(candidate.sourceLabel)}</span>
          <span>${escapeHtml(candidate.usableLabel)}</span>
          <span>${escapeHtml(hiddenLabel)}</span>
          ${candidate.duplicate ? `<span class="is-duplicate">Duplicata ×${Number(candidate.duplicateCount || 2)}${candidate.duplicateWinner ? " · manter" : ""}</span>` : ""}
        </div>
        <label class="dda-evolution-compatibility-score-field">
          Compatibilidade
          <input type="number" min="0" max="100" step="1" value="${escapeHtml(candidate.manualScore ?? candidate.compatibility.score)}" />
        </label>
        <small>Atual: ${Number(candidate.compatibility.score ?? 0)}%${candidate.compatibility.manual ? " · DEV" : ""}</small>
        <div class="dda-evolution-compatibility-editor-buttons">
          <button type="button" data-action="save-score">Aplicar %</button>
          <button type="button" data-action="hide-local">${localButtonLabel}</button>
          ${data.globalSanitationMode ? "" : `<button type="button" data-action="hide-global">Ocultar global</button>`}
          <button type="button" data-action="clear-candidate">Limpar ajuste</button>
        </div>
      </article>
    `;
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html instanceof jQuery ? html : $(html);

    root.find("[data-action='select-origin']").on("change", (event) => {
      this.originKey = event.currentTarget.value || this.originKey;
      this.render(true);
    });

    root.find("[data-action='select-stage']").on("change", (event) => {
      this.targetStage = event.currentTarget.value || this.targetStage;
      this.render(true);
    });

    root.find("[data-action='search-candidate']").on("input", (event) => {
      this.searchTerm = event.currentTarget.value ?? "";
      clearTimeout(this._searchTimeout);
      this._searchTimeout = setTimeout(() => this.render(true), 180);
    });

    root.find("[data-action='toggle-hidden']").on("change", (event) => {
      this.showHidden = Boolean(event.currentTarget.checked);
      this.render(true);
    });

    root.find("[data-action='toggle-duplicates']").on("change", (event) => {
      this.showDuplicates = Boolean(event.currentTarget.checked);
      this.render(true);
    });

    root.find("[data-action='toggle-not-imported']").on("change", (event) => {
      this.showNotImported = Boolean(event.currentTarget.checked);
      this.render(true);
    });

    root.find("[data-action='save-score']").on("click", this._onApplyScore.bind(this));
    root.find("[data-action='hide-local']").on("click", this._onHideLocal.bind(this));
    root.find("[data-action='hide-global']").on("click", this._onHideGlobal.bind(this));
    root.find("[data-action='clear-candidate']").on("click", this._onClearCandidate.bind(this));
    root.find("[data-action='clean-visible-duplicates']").on("click", this._onCleanVisibleDuplicates.bind(this));
    root.find("[data-action='clean-stage-duplicates']").on("click", this._onCleanStageDuplicates.bind(this));
    root.find("[data-action='clear-origin']").on("click", this._onClearOrigin.bind(this));
    root.find("[data-action='save-curation']").on("click", this._onSaveCuration.bind(this));
    root.find("[data-action='discard-curation']").on("click", this._onDiscardCuration.bind(this));
    root.find("[data-action='export-curation']").on("click", () => {
      console.log("DDA | Evolution compatibility draft", JSON.stringify({ overrides: this.draftOverrides, exclusions: this.draftExclusions }, null, 2));
      ui.notifications.info("Rascunho exportado no console.");
    });
    root.find("[data-action='open-json-tool']").on("click", async () => {
      await openEvolutionCompatibilityDevTool();
      this.draftOverrides = foundry.utils.deepClone(getStoredDevObject(DEV_EVOLUTION_COMPATIBILITY_FLAG));
      this.draftExclusions = foundry.utils.deepClone(getStoredDevObject(DEV_EVOLUTION_EXCLUSIONS_FLAG));
      this._dirty = false;
      this.render(true);
    });
    root.find(".dda-evolution-compatibility-editor-img img").on("error", (event) => {
      event.currentTarget.src = "icons/svg/mystery-man.svg";
    });
  }

  _markDirty() {
    this._dirty = true;
  }

  _getCandidateKeyFromEvent(event) {
    return event.currentTarget?.closest?.("[data-candidate-key]")?.dataset?.candidateKey ?? "";
  }

  _getCandidateFromEvent(event) {
    const card = event.currentTarget?.closest?.("[data-candidate-key]");
    const candidateId = card?.dataset?.candidateId ?? "";
    return getAllEvolutionEditorCandidates(this.targetStage).find((candidate) => getCandidateDevId(candidate) === candidateId) ?? null;
  }

  _getVisibleCandidatesFromRoot(root) {
    const visibleIds = new Set();
    root.find("[data-candidate-id]").each((_index, element) => {
      const id = element?.dataset?.candidateId ?? "";
      if (id) visibleIds.add(id);
    });

    return getAllEvolutionEditorCandidates(this.targetStage).filter((candidate) => visibleIds.has(getCandidateDevId(candidate)));
  }

  _setDraftOverride(originKey = "", candidateKey = "", value = null) {
    const key = originKey || this._effectiveOriginKey;
    this.draftOverrides = foundry.utils.deepClone(this.draftOverrides ?? {});
    this.draftOverrides[key] = isPlainObject(this.draftOverrides[key]) ? this.draftOverrides[key] : {};

    if (value === null || value === undefined || value === "") {
      delete this.draftOverrides[key][candidateKey];
      if (Object.keys(this.draftOverrides[key]).length === 0) delete this.draftOverrides[key];
    } else {
      this.draftOverrides[key][candidateKey] = value;
    }

    this._markDirty();
  }

  _setDraftExclusion(groupKey = "*", candidate = "", enabled = true) {
    this.draftExclusions = foundry.utils.deepClone(this.draftExclusions ?? {});
    const normalizedKey = typeof candidate === "string" ? devLookupKey(candidate) : getCandidateDevId(candidate);
    if (!normalizedKey) return;

    const nextEntry = typeof candidate === "string" ? normalizedKey : buildPreciseExclusionEntry(candidate);
    const group = Array.isArray(this.draftExclusions[groupKey]) ? [...this.draftExclusions[groupKey]] : [];
    const filtered = group.filter((entry) => {
      if (typeof candidate === "string") {
        if (typeof entry === "string") return devLookupKey(entry) !== normalizedKey;
        return devLookupKey(entry.id || entry.key || entry.name || "") !== normalizedKey;
      }

      return !exclusionEntryMatchesCandidate(entry, candidate);
    });

    if (enabled) filtered.push(nextEntry);

    if (filtered.length) this.draftExclusions[groupKey] = filtered;
    else delete this.draftExclusions[groupKey];

    this._markDirty();
  }

  _clearDraftOrigin(originKey = "") {
    const key = originKey || this._effectiveOriginKey;
    this.draftOverrides = foundry.utils.deepClone(this.draftOverrides ?? {});
    this.draftExclusions = foundry.utils.deepClone(this.draftExclusions ?? {});
    delete this.draftOverrides[key];
    delete this.draftExclusions[key];
    this._markDirty();
  }

  _hideDuplicateCandidatesInDraft(candidates = []) {
    const groups = new Map();
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (this.targetStage && candidate.stage !== this.targetStage) continue;
      const dedupKey = getCandidateDedupKey(candidate);
      if (!groups.has(dedupKey)) groups.set(dedupKey, []);
      groups.get(dedupKey).push(candidate);
    }

    const duplicatesToHide = [];

    for (const group of groups.values()) {
      if (group.length < 2) continue;

      const sorted = [...group].sort((a, b) => {
        const rankDifference = getCandidateCurationRank(b) - getCandidateCurationRank(a);
        if (rankDifference !== 0) return rankDifference;
        return String(a.displayName || a.name || "").localeCompare(String(b.displayName || b.name || ""), game.i18n.lang);
      });

      duplicatesToHide.push(...sorted.slice(1));
    }

    for (const candidate of duplicatesToHide) {
      this._setDraftExclusion("*", candidate, true);
    }

    return duplicatesToHide;
  }

  async _onApplyScore(event) {
    event.preventDefault();
    const card = event.currentTarget.closest("[data-candidate-key]");
    const candidateKey = card?.dataset?.candidateKey ?? "";
    const input = card?.querySelector?.("input[type='number']");
    const score = Math.clamp(Number(input?.value ?? NaN), 0, 100);

    if (!candidateKey || !Number.isFinite(score)) {
      ui.notifications.warn("Informe uma compatibilidade válida.");
      return;
    }

    this._setDraftOverride(this._effectiveOriginKey, candidateKey, { score, reason: "Curadoria visual" });
    ui.notifications.info("Compatibilidade aplicada ao rascunho. Clique em Salvar alterações para gravar.");
    this.render(true);
  }

  async _onHideLocal(event) {
    event.preventDefault();
    const candidate = this._getCandidateFromEvent(event);
    const candidateKey = this._getCandidateKeyFromEvent(event);
    const key = this._isGlobalSanitationMode ? "*" : this._effectiveOriginKey;
    this._setDraftExclusion(key, candidate ?? candidateKey, true);
    ui.notifications.info(this._isGlobalSanitationMode ? "Candidato oculto globalmente no rascunho." : "Candidato oculto para esta origem no rascunho.");
    this.render(true);
  }

  async _onHideGlobal(event) {
    event.preventDefault();
    const candidate = this._getCandidateFromEvent(event);
    const candidateKey = this._getCandidateKeyFromEvent(event);
    this._setDraftExclusion("*", candidate ?? candidateKey, true);
    ui.notifications.info("Candidato oculto globalmente no rascunho.");
    this.render(true);
  }

  async _onClearCandidate(event) {
    event.preventDefault();
    const candidate = this._getCandidateFromEvent(event);
    const candidateKey = this._getCandidateKeyFromEvent(event);
    this._setDraftOverride(this._effectiveOriginKey, candidateKey, null);
    this._setDraftOverride("*", candidateKey, null);
    this._setDraftExclusion(this._effectiveOriginKey, candidate ?? candidateKey, false);
    this._setDraftExclusion("*", candidate ?? candidateKey, false);
    ui.notifications.info("Ajustes do candidato limpos no rascunho.");
    this.render(true);
  }

  async _onCleanVisibleDuplicates(event) {
    event.preventDefault();
    const root = $(this.element);
    const duplicates = this._hideDuplicateCandidatesInDraft(this._getVisibleCandidatesFromRoot(root));

    ui.notifications.info(`Duplicatas visíveis marcadas para ocultar: ${duplicates.length}. Clique em Salvar alterações para gravar.`);
    this.render(true);
  }

  async _onCleanStageDuplicates(event) {
    event.preventDefault();
    const confirmed = await Dialog.confirm({
      title: "Limpar duplicatas do estágio",
      content: `<p>Marcar para ocultar globalmente duplicatas inferiores de <strong>${stageLabel(this.targetStage)}</strong>, mantendo a melhor entrada de cada nome?</p><p>Isso só grava depois que você clicar em <strong>Salvar alterações</strong>.</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (!confirmed) return;

    const duplicates = this._hideDuplicateCandidatesInDraft(getAllEvolutionEditorCandidates(this.targetStage));
    ui.notifications.info(`Duplicatas do estágio marcadas para ocultar: ${duplicates.length}. Clique em Salvar alterações para gravar.`);
    this.render(true);
  }

  async _onClearOrigin(event) {
    event.preventDefault();
    const label = this._isGlobalSanitationMode ? "curadoria global" : "curadoria da origem";
    const confirmed = await Dialog.confirm({
      title: this._isGlobalSanitationMode ? "Limpar curadoria global" : "Limpar curadoria da origem",
      content: `<p>Remover todos os ajustes da ${label} no rascunho?</p><p>Isso só grava depois que você clicar em <strong>Salvar alterações</strong>.</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (!confirmed) return;
    this._clearDraftOrigin(this._effectiveOriginKey);
    ui.notifications.info("Curadoria limpa no rascunho.");
    this.render(true);
  }

  async _onSaveCuration(event) {
    event.preventDefault();
    await setStoredDevObject(DEV_EVOLUTION_COMPATIBILITY_FLAG, this.draftOverrides);
    await setStoredDevObject(DEV_EVOLUTION_EXCLUSIONS_FLAG, this.draftExclusions);
    this._dirty = false;
    ui.notifications.info("Curadoria de evolução salva no mundo.");
    this.render(true);
  }

  async _onDiscardCuration(event) {
    event.preventDefault();
    const confirmed = await Dialog.confirm({
      title: "Descartar alterações",
      content: "<p>Descartar todas as alterações pendentes e recarregar a curadoria salva?</p>",
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (!confirmed) return;
    this.draftOverrides = foundry.utils.deepClone(getStoredDevObject(DEV_EVOLUTION_COMPATIBILITY_FLAG));
    this.draftExclusions = foundry.utils.deepClone(getStoredDevObject(DEV_EVOLUTION_EXCLUSIONS_FLAG));
    this._dirty = false;
    ui.notifications.info("Alterações pendentes descartadas.");
    this.render(true);
  }
}

function openEvolutionCompatibilityEditor(options = {}) {
  return new DDAEvolutionCompatibilityEditor(options).render(true);
}

Hooks.once("init", () => {
  registerEvolutionCompatibilityDevSettings();
});

Hooks.once("ready", () => {
  game.dda = game.dda ?? {};
  game.dda.applications = game.dda.applications ?? {};
  game.dda.applications.DDAEvolutionChoiceBrowser = DDAEvolutionChoiceBrowser;
  game.dda.applications.DDAEvolutionCompatibilityEditor = DDAEvolutionCompatibilityEditor;
  game.dda.openEvolutionCompatibilityDevTool = openEvolutionCompatibilityDevTool;
  game.dda.openEvolutionCompatibilityEditor = openEvolutionCompatibilityEditor;
  game.dda.exportEvolutionCompatibilityCuration = exportEvolutionCompatibilityCuration;
});
