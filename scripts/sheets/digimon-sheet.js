import { rollAttack } from "../rolls/attack-roll.js";
import { endDigimonTurn } from "../combat/end-turn.js";
import { rollRecovery } from "../combat/recovery.js";
import { energizeDigimon } from "../combat/energize.js";
import { getDDASetting } from "../settings.js";
import { evolvePartner } from "../combat/evolution.js";
import { initiateDigimonClash, endDigimonClash } from "../combat/clash.js";
import { syncTamerAndPartnerOwnership } from "../utils/ownership.js";
import {
  qualityMatches,
  rollDerivedCheck,
  getActorDerivedStat,
  getActorSv,
  getCombatId,
  getCombatRound,
  setUseState,
  clearUseState,
  localizeQ
} from "../rules/quality-automation.js";
import {
  getDigimonAliases,
  getDigimonDisplayName,
  getDigimonDubName,
  getDigimonGroupLabel,
  getDigimonNameStyle,
  getDigimonOriginalName,
  getDigimonSheetDisplayName,
  getDigimonTypeLabel
} from "../helpers/digimon-terms.js";
import {
  getDigimonStageLabel as getConfiguredDigimonStageLabel
} from "../helpers/digimon-stage-labels.js";
import { getDdaPortraitPath } from "../data/dda-portrait-and-manual-digimon-data.js";

const ActorSheetV1 = foundry.appv1.sheets.ActorSheet;

function localize(key) {
  return game.i18n.localize(key);
}

function formatI18n(key, data = {}) {
  return game.i18n.format(key, data);
}

function isVideoPath(path = "") {
  const cleanPath = String(path ?? "").split("?")[0].split("#")[0].trim();
  return /\.(webm|mp4|m4v|ogg|ogv)$/i.test(cleanPath);
}

function getDdaFilePickerClass() {
  return globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? null;
}

function getDdaDocumentSheetConfigClass() {
  return globalThis.foundry?.applications?.apps?.DocumentSheetConfig ?? null;
}


function getHybridMethodLabelForSheet(method = "") {
  const normalized = String(method ?? "").trim();
  const labels = {
    hybrid: "DDA.Hybrid.Method.Hybrid",
    biomerge: "DDA.Hybrid.Method.BioMerge",
    mindLink: "DDA.Hybrid.Method.MindLink"
  };

  return localize(labels[normalized] ?? labels.hybrid);
}


function getHybridPartnerAvailabilityLabelForSheet(value = "unchanged") {
  const normalized = String(value ?? "").trim();
  const labels = {
    unchanged: "DDA.Hybrid.PartnerAvailability.Unchanged",
    separate: "DDA.Hybrid.PartnerAvailability.Separate",
    merged: "DDA.Hybrid.PartnerAvailability.Merged"
  };

  return localize(labels[normalized] ?? labels.unchanged);
}

function localizeMaybe(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  if (raw.startsWith("DDA.")) {
    const normalized = raw
      .split(".")
      .map((part, index) => index === 0 ? "DDA" : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(".");

    const localized = game.i18n.localize(raw);
    if (localized !== raw) return localized;

    const normalizedLocalized = game.i18n.localize(normalized);
    return normalizedLocalized !== normalized ? normalizedLocalized : raw;
  }

  return raw;
}

function localizeConfigMap(map = {}) {
  return Object.fromEntries(
    Object.entries(map ?? {}).map(([key, value]) => [key, localizeMaybe(value)])
  );
}

function normalizeStanceLookup(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase()
    .trim();
}

function getItemLookupText(item) {
  const parts = [
    item?.name,
    item?.system?.label,
    item?.system?.originalLabel,
    item?.system?.name,
    item?.system?.originalName,
    item?.system?.stance,
    item?.system?.effect,
    item?.system?.description
  ];

  return parts
    .filter((part) => part !== null && part !== undefined)
    .map((part) => typeof part === "string" ? part : JSON.stringify(part))
    .join(" ");
}

function actorHasStanceQuality(actor, stanceKey) {
  const aliases = {
    brave: ["brave stance", "postura corajosa"],
    fierce: ["fierce stance", "postura feroz"],
    sentry: ["sentry stance", "postura sentinela", "postura de sentinela"],
    martial: ["martial stance", "postura marcial"],
    anticipate: ["anticipate stance", "postura de antecipacao", "postura de antecipação"]
  };

  const expected = aliases[stanceKey] ?? [];
  if (!expected.length) return false;

  return Array.from(actor?.items ?? []).some((item) => {
    if (item?.type !== "quality") return false;
    const haystack = normalizeStanceLookup(getItemLookupText(item));
    return expected.some((alias) => haystack.includes(normalizeStanceLookup(alias)));
  });
}

function getAvailableStanceOptions(actor) {
  const allStances = CONFIG.DDA?.stances ?? {};
  const baseStances = ["neutral", "offensive", "defensive"];
  const lockedStances = ["brave", "fierce", "sentry", "martial", "anticipate"];
  const available = {};

  for (const key of baseStances) {
    if (allStances[key]) available[key] = localizeMaybe(allStances[key]);
  }

  for (const key of lockedStances) {
    if (allStances[key] && actorHasStanceQuality(actor, key)) {
      available[key] = localizeMaybe(allStances[key]);
    }
  }

  const currentStance = String(actor?.system?.combat?.currentStance ?? "neutral");
  if (currentStance && allStances[currentStance] && !available[currentStance]) {
    available[currentStance] = `${localizeMaybe(allStances[currentStance])} (${localizeMaybe("DDA.Stance.Locked")})`;
  }

  return available;
}

const DIGIMON_SKILLS_BY_DERIVED_STAT = {
  cpu: [
    { key: "athletics", labelKey: "DDA.Skill.Athletics" },
    { key: "endurance", labelKey: "DDA.Skill.Endurance" },
    { key: "featsOfStrength", labelKey: "DDA.Skill.FeatsOfStrength" }
  ],
  ram: [
    { key: "evade", labelKey: "DDA.Skill.Evade" },
    { key: "precision", labelKey: "DDA.Skill.Precision" },
    { key: "stealth", labelKey: "DDA.Skill.Stealth" }
  ],
  bit: [
    { key: "knowledge", labelKey: "DDA.Skill.Knowledge" },
    { key: "survival", labelKey: "DDA.Skill.Survival" },
    { key: "awareness", labelKey: "DDA.Skill.Awareness" },
    { key: "manipulate", labelKey: "DDA.Skill.Manipulate" },
    { key: "performance", labelKey: "DDA.Skill.Performance" },
    { key: "persuasion", labelKey: "DDA.Skill.Persuasion" },
    { key: "decipherIntent", labelKey: "DDA.Skill.DecipherIntent" }
  ],
  dos: [
    { key: "fortitude", labelKey: "DDA.Skill.Fortitude" },
    { key: "bravery", labelKey: "DDA.Skill.Bravery" }
  ]
};

const DIGIMON_PROFILE_OPTION_KEYS = {
  attributes: {
    none: "DDA.DigimonProfile.Attribute.None",
    free: "DDA.DigimonProfile.Attribute.Free",
    virus: "DDA.DigimonProfile.Attribute.Virus",
    data: "DDA.DigimonProfile.Attribute.Data",
    vaccine: "DDA.DigimonProfile.Attribute.Vaccine",
    variable: "DDA.DigimonProfile.Attribute.Variable"
  },

  fields: {
    none: "DDA.DigimonProfile.Field.None",
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

  types: {
    dinosaur: "DDA.DigimonProfile.Type.Dinosaur",
    dragon: "DDA.DigimonProfile.Type.Dragon",
    beast: "DDA.DigimonProfile.Type.Beast",
    animal: "DDA.DigimonProfile.Type.Animal",
    bird: "DDA.DigimonProfile.Type.Bird",
    aquatic: "DDA.DigimonProfile.Type.Aquatic",
    insect: "DDA.DigimonProfile.Type.Insect",
    plant: "DDA.DigimonProfile.Type.Plant",
    machine: "DDA.DigimonProfile.Type.Machine",
    cyborg: "DDA.DigimonProfile.Type.Cyborg",
    angel: "DDA.DigimonProfile.Type.Angel",
    holyKnight: "DDA.DigimonProfile.Type.HolyKnight",
    demon: "DDA.DigimonProfile.Type.Demon",
    darkKnight: "DDA.DigimonProfile.Type.DarkKnight",
    undead: "DDA.DigimonProfile.Type.Undead",
    magicKnight: "DDA.DigimonProfile.Type.MagicKnight",
    warrior: "DDA.DigimonProfile.Type.Warrior",
    beastMan: "DDA.DigimonProfile.Type.BeastMan",
    fairy: "DDA.DigimonProfile.Type.Fairy",
    mutant: "DDA.DigimonProfile.Type.Mutant",
    slime: "DDA.DigimonProfile.Type.Slime",
    spirit: "DDA.DigimonProfile.Type.Spirit",
    ancient: "DDA.DigimonProfile.Type.Ancient",
    appmon: "DDA.DigimonProfile.Type.Appmon",
    other: "DDA.DigimonProfile.Type.Other"
  },

  families: {
    none: "DDA.DigimonProfile.Family.None",
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

const DIGIMON_SIZE_ORDER = [
  "small",
  "medium",
  "large",
  "huge",
  "gigantic",
  "colossal"
];

function getAllowedDigimonSizeOptions(stageKey, currentSize = "medium") {
  const sizes = CONFIG.DDA?.sizes ?? {};
  const stages = CONFIG.DDA?.stages ?? {};

  const maxSize = stages[stageKey]?.maxSize ?? "colossal";
  const maxIndex = DIGIMON_SIZE_ORDER.indexOf(maxSize);

  const allowedKeys = maxIndex >= 0
    ? DIGIMON_SIZE_ORDER.slice(0, maxIndex + 1)
    : DIGIMON_SIZE_ORDER;

  const entries = allowedKeys
    .filter((key) => key in sizes)
    .map((key) => {
      return [
        key,
        {
          label: sizes[key],
          allowed: true,
          invalid: false
        }
      ];
    });

  if (currentSize && !allowedKeys.includes(currentSize) && sizes[currentSize]) {
    entries.push([
      currentSize,
      {
        label: sizes[currentSize],
        allowed: false,
        invalid: true
      }
    ]);
  }

  return Object.fromEntries(entries);
}

function getDigimonMaxSizeLabelForStage(stageKey) {
  const maxSize = CONFIG.DDA?.stages?.[stageKey]?.maxSize ?? "colossal";
  const label = CONFIG.DDA?.sizes?.[maxSize] ?? maxSize;

  return localize(label);
}

function localizeOptionTree(optionTree) {
  return Object.fromEntries(
    Object.entries(optionTree).map(([groupKey, options]) => {
      return [
        groupKey,
        Object.fromEntries(
          Object.entries(options).map(([optionKey, labelKey]) => {
            return [optionKey, localize(labelKey)];
          })
        )
      ];
    })
  );
}

export function getLocalizedDigimonProfileOptions() {
  return localizeOptionTree(DIGIMON_PROFILE_OPTION_KEYS);
}

export const DIGIMON_PROFILE_OPTIONS = new Proxy({}, {
  get(_target, prop) {
    return getLocalizedDigimonProfileOptions()[prop];
  },
  ownKeys() {
    return Reflect.ownKeys(getLocalizedDigimonProfileOptions());
  },
  getOwnPropertyDescriptor(_target, prop) {
    const options = getLocalizedDigimonProfileOptions();
    if (!(prop in options)) return undefined;
    return {
      configurable: true,
      enumerable: true,
      value: options[prop]
    };
  }
});

export class DDADigimonSheet extends ActorSheetV1 {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["dda", "sheet", "actor", "digimon"],
      template: "systems/digimon-digital-adventures/templates/actor/digimon-sheet.html",
      width: 880,
      height: 760,
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "summary"
        }
      ]
    });
  }

get title() {
  const stageKey = this.actor.system.stage;
  const stageLabel = getDigimonStageLabel(stageKey, "Digimon");

  return `Digimon ${stageLabel}`;
}  

async getData(options = {}) {
  const context = await super.getData(options);
  context.system = this.actor.system;
  const digimonAliases = getDigimonAliases(this.actor);
  const customName = String(this.actor.system?.customName ?? "").trim();

  context.digimonDisplay = {
    nameStyle: getDigimonNameStyle(),
    sheetName: customName || getDigimonSheetDisplayName(this.actor),
    species: getDigimonDisplayName(this.actor),
    originalName: getDigimonOriginalName(this.actor),
    dubName: getDigimonDubName(this.actor),
    aliases: digimonAliases.join(", "),
    hasAliases: digimonAliases.length > 0,
    type: getDigimonTypeLabel(this.actor.system.type),
    group: getDigimonGroupLabel(this.actor.system.group),
    rawType: this.actor.system.type ?? "",
    rawGroup: this.actor.system.group ?? ""
  };
  const storedDigivicePortrait = String(
    this.actor.getFlag(game.system?.id ?? "digimon-digital-adventures", "digivicePortrait") || ""
  );
  const storedEvolutionPortrait = String(this.actor.system?.evolution?.portraitImg || "");
  const mappedPortrait = getDdaPortraitPath({
    key: this.actor.system?.sourceId || this.actor.system?.names?.canonical || "",
    name: this.actor.name,
    species: this.actor.system?.species || this.actor.name,
    aliases: digimonAliases
  });
  const digivicePortrait =
    (storedDigivicePortrait && storedDigivicePortrait !== this.actor.img ? storedDigivicePortrait : "") ||
    (storedEvolutionPortrait && storedEvolutionPortrait !== this.actor.img ? storedEvolutionPortrait : "") ||
    mappedPortrait ||
    storedDigivicePortrait ||
    storedEvolutionPortrait ||
    this.actor.img;
  context.digivicePortrait = digivicePortrait;
  context.portraitIsVideo = isVideoPath(digivicePortrait);

  context.config = foundry.utils.deepClone(CONFIG.DDA ?? {});
  context.config.stages = Object.fromEntries(
  Object.entries(context.config.stages ?? {}).map(([stageKey, stage]) => {
    return [
      stageKey,
      {
        ...stage,
        label: getConfiguredDigimonStageLabel(stageKey, {
          fallback: stage?.label ?? stageKey
        })
      }
    ];
  })
);
  context.config.stances = getAvailableStanceOptions(this.actor);
  context.config.digimonDerivedStats = localizeConfigMap(CONFIG.DDA?.digimonDerivedStats ?? {});
  context.digimonProfileOptions = getLocalizedDigimonProfileOptions();

  const stageKey = this.actor.system.stage ?? "child";
  const currentSize = this.actor.system.size ?? "medium";

  context.allowedSizeOptions = getAllowedDigimonSizeOptions(stageKey, currentSize);
  context.maxSizeForStageLabel = getDigimonMaxSizeLabelForStage(stageKey);
  context.currentSizeExceedsStageMaximum = Boolean(context.allowedSizeOptions[currentSize]?.invalid);

  const derivedStatOrder = ["bit", "dos", "ram", "cpu"];

context.visibleDerivedStats = {};

for (const key of derivedStatOrder) {
  const stat = this.actor.system.derivedStats?.[key];

  if (!stat) continue;

  context.visibleDerivedStats[key] = {
    ...stat,
    displayLabel: localizeMaybe(stat.displayLabel ?? stat.label ?? `DDA.DerivedStat.${key.toUpperCase()}`)
  };
}

const selectedMovementType = this.actor.system.currentMovementType ?? "land";
const movementTypes = this.actor.system.movementTypes ?? {};
const selectedMovement = movementTypes[selectedMovementType] ?? movementTypes.land ?? {};

context.selectedMovementType = selectedMovementType;
context.selectedMovementTotal = selectedMovement.enabled
  ? Number(selectedMovement.total ?? 0)
  : "—";
  context.itemsByType = {
    attack: [],
    quality: [],
    equipment: [],
    trait: [],
    evolutionLink: []
  };



  for (const item of this.actor.items) {
    if (context.itemsByType[item.type]) {
      context.itemsByType[item.type].push(item);
    }
  }

const digimonQualities = context.itemsByType.quality ?? [];

const normalizeQualityName = (name = "") => {
  return String(name)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const qualityNames = digimonQualities.map((quality) => {
  return normalizeQualityName(quality.name);
});

context.hasCreationLimitResource = qualityNames.some((name) => {
  return [
    "conjurer",
    "summoner",
    "evoker",
    "conjurador",
    "invocador",
    "evocador"
  ].includes(name);
});

context.hasResolveResource = qualityNames.some((name) => {
  return [
    "combat monster",
    "monstro de combate"
  ].includes(name);
});

context.hasQualityResources =
  context.hasCreationLimitResource ||
  context.hasResolveResource;


const hybridState = this.actor.system.specialEvolutions?.hybrid?.state ?? {};
const specialForm = this.actor.system.specialForm ?? {};
const hybridMethod = specialForm.method || this.actor.system.specialEvolutions?.hybrid?.method || hybridState.method || "hybrid";
const hybridEquivalentStage = specialForm.equivalentStage || this.actor.system.specialEvolutions?.hybrid?.equivalentStage || hybridState.equivalentStage || (this.actor.system.stage === "hybrid" ? "adult" : this.actor.system.stage);
const hybridActive = Boolean(this.actor.system.specialEvolutions?.hybrid?.active || hybridState.active);
const isHybridSpecialForm = Boolean(hybridActive || specialForm.kind === "hybrid" || this.actor.system.stage === "hybrid" || normalizeQualityName(this.actor.folder?.name ?? "") === "hybrid");

context.hybridForm = {
  active: hybridActive,
  isSpecialForm: isHybridSpecialForm,
  canEvolveFromSpecialForm: Boolean(hybridActive && hybridMethod === "biomerge"),
  method: hybridMethod,
  methodLabel: getHybridMethodLabelForSheet(hybridMethod),
  equivalentStage: hybridEquivalentStage,
  equivalentStageLabel: getDigimonStageLabel(hybridEquivalentStage),
  tamerName: hybridState.tamerName || this.actor.system.tamer?.name || "",
  sourceDigimonName: hybridState.sourceDigimonName || "",
  partnerAvailability: hybridState.partnerAvailability || "unchanged",
  partnerAvailabilityLabel: getHybridPartnerAvailabilityLabelForSheet(hybridState.partnerAvailability || "unchanged")
};

  context.qualityGroups = this._getQualityGroups(context.itemsByType.quality);
  context.evolutionStages = this._getEvolutionStages();
  context.evolutionGraph = this._getEvolutionGraphData();

  const humanScaling = getDDASetting("humanScaling") ?? "medium";

  context.settings = {
    energizeAction: getDDASetting("energizeAction"),
    multiattackMode: getDDASetting("multiattackMode"),
    attributeAdvantage: getDDASetting("attributeAdvantage"),
    humanScaling,
    evolutionStructureMode: getDDASetting("evolutionStructureMode"),
    requireDirectEvolutionLink: getDDASetting("requireDirectEvolutionLink"),
    allowEvolutionRebranch: getDDASetting("allowEvolutionRebranch"),
    showLockedEvolutions: getDDASetting("showLockedEvolutions"),
    enableDarkEvolution: getDDASetting("enableDarkEvolution")
  };

  context.humanScaling = {
    value: humanScaling,
    label: localize(`DDA.HumanScaling.${humanScaling}.Label`),
    description: localize(`DDA.HumanScaling.${humanScaling}.Description`)
  };

  return context;
}

_getQualityGroups(qualities = []) {
  const sortedQualities = [...qualities].sort((a, b) => {
    return a.name.localeCompare(b.name, game.i18n.lang);
  });

  const groupDefinitions = [
    {
      key: "core",
      label: localize("DDA.QualityGroup.Core"),
      description: localize("DDA.QualityGroup.CoreDescription"),
      test: (quality) => Boolean(quality.system.category?.core)
    },
    {
      key: "attack",
      label: localize("DDA.QualityGroup.Attack"),
      description: localize("DDA.QualityGroup.AttackDescription"),
      test: (quality) => Boolean(quality.system.category?.attack)
    },
    {
      key: "trigger",
      label: localize("DDA.QualityGroup.Trigger"),
      description: localize("DDA.QualityGroup.TriggerDescription"),
      test: (quality) => Boolean(quality.system.category?.trigger)
    },
    {
      key: "static",
      label: localize("DDA.QualityGroup.Static"),
      description: localize("DDA.QualityGroup.StaticDescription"),
      test: (quality) => Boolean(quality.system.category?.static)
    },
    {
      key: "free",
      label: localize("DDA.QualityGroup.Free"),
      description: localize("DDA.QualityGroup.FreeDescription"),
      test: (quality) => Boolean(quality.system.category?.free)
    },
    {
      key: "negative",
      label: localize("DDA.QualityGroup.Negative"),
      description: localize("DDA.QualityGroup.NegativeDescription"),
      test: (quality) => Boolean(quality.system.category?.negative)
    },
    {
      key: "other",
      label: localize("DDA.QualityGroup.Other"),
      description: localize("DDA.QualityGroup.OtherDescription"),
      test: () => true
    }
  ];

  const used = new Set();

  return groupDefinitions
    .map((group) => {
      const items = sortedQualities.filter((quality) => {
        if (used.has(quality.id)) return false;
        if (!group.test(quality)) return false;

        used.add(quality.id);
        return true;
      });

      return {
        key: group.key,
        label: group.label,
        description: group.description,
        items
      };
    })
    .filter((group) => group.items.length > 0);
}

_getEvolutionStages() {
  const forms = this.actor.system.evolutionLine?.forms ?? {};

  const stages = [
    { key: "baby1", label: getDigimonStageLabel("baby1") },
    { key: "baby2", label: getDigimonStageLabel("baby2") },
    { key: "child", label: getDigimonStageLabel("child") },
    { key: "adult", label: getDigimonStageLabel("adult") },
    { key: "perfect", label: getDigimonStageLabel("perfect") },
    { key: "ultimate", label: getDigimonStageLabel("ultimate") },
    { key: "ultimatePlus", label: getDigimonStageLabel("ultimatePlus") }
  ];

  return stages.map((stage) => {
    const slot = forms[stage.key] ?? {};
    const stageForms = normalizeEvolutionSlotForms(slot, stage.key);

    return {
      key: stage.key,
      label: stage.label,
      forms: stageForms,
      formCount: stageForms.length,
      hasForms: stageForms.length > 0,
      name: stageForms[0]?.name ?? slot.name ?? "",
      uuid: stageForms[0]?.uuid ?? slot.uuid ?? "",
      stage: stageForms[0]?.stage ?? slot.stage ?? stage.key
    };
  });
}

_getEvolutionGraphData() {
  const graph = getNormalizedEvolutionGraph(this.actor);
  const stageKeys = getEvolutionStageKeys();

  // Canvas compacto o bastante para não virar “vazio infinito”,
  // mas amplo o bastante para mostrar até Mega+ com órbitas legíveis.
  const width = 1500;
  const height = 1500;
  const centerX = Math.round(width / 2);
  const centerY = Math.round(height / 2);
  const ringGap = 112;
  const firstRingRadius = 118;
  const positionedNodes = [];
  const nodePositionMap = new Map();
  const rawNodeMap = new Map();
  const manualNodePositions = graph.layout?.nodePositions ?? {};

  const getRingRadius = (stageIndex) => {
    if (stageIndex <= 0) return 0;
    return firstRingRadius + (stageIndex - 1) * ringGap;
  };

  const getConstrainedNodePosition = (node, x, y) => {
    return constrainEvolutionNodePositionToStage({
      x,
      y,
      stageIndex: node.stageIndex,
      centerX,
      centerY,
      getRingRadius
    });
  };

  const getNodeDisplayData = (node) => {
    const formActor = game.actors?.find((actor) => actor.uuid === node.actorUuid);

    // Nós do grafo representam formas, não necessariamente o estado atual do
    // actor persistente. Por isso os dados salvos no node têm prioridade sobre
    // o Actor resolvido; caso contrário, Pafumon vira visualmente Minomon depois
    // da digievolução porque ambos compartilham o UUID persistente do parceiro.
    const resolvedStage = node.stage || formActor?.system?.stage || "child";
    const species = getDigimonSpeciesLabel(formActor, node);
    const name = node.name || species || formActor?.name || localize("DDA.Evolution.UnknownForm");
    const displayName = node.displayName || species || name;

    return {
      ...node,
      name,
      displayName,
      species,
      img: node.img || formActor?.img || "icons/svg/mystery-man.svg",
      stage: resolvedStage,
      stageIndex: getEvolutionStageIndex(resolvedStage),
      stageLabel: getDigimonStageLabel(resolvedStage),
      isSelf: node.actorUuid === this.actor.uuid || node.actorUuid === this.actor.system?.evolution?.currentFormUuid,
      tooltip: `${displayName} — ${getDigimonStageLabel(resolvedStage)}`
    };
  };

  const nodes = graph.nodes.map(getNodeDisplayData);
  for (const node of nodes) rawNodeMap.set(node.id, node);

  const edges = graph.edges
    .map((edge) => {
      const from = rawNodeMap.get(edge.from);
      const to = rawNodeMap.get(edge.to);
      if (!from || !to) return null;

      return {
        ...edge,
        method: edge.method ?? "normal",
        fromStageIndex: from.stageIndex,
        toStageIndex: to.stageIndex
      };
    })
    .filter(Boolean);

  const primaryParentByNode = buildEvolutionPrimaryParentMap(nodes, edges);
  const childrenByParent = buildEvolutionChildrenMap(nodes, primaryParentByNode);
  const angleByNode = buildEvolutionBranchAngles(nodes, childrenByParent, primaryParentByNode, this.actor.uuid);
  const angleUsesByStage = new Map();

  const orderedNodes = [...nodes].sort((a, b) => {
    const stageDifference = a.stageIndex - b.stageIndex;
    if (stageDifference !== 0) return stageDifference;

    const angleDifference = Number(angleByNode.get(a.id) ?? 0) - Number(angleByNode.get(b.id) ?? 0);
    if (Math.abs(angleDifference) > 0.0001) return angleDifference;

    return String(a.displayName ?? a.name ?? "").localeCompare(String(b.displayName ?? b.name ?? ""), game.i18n.lang);
  });

  for (const node of orderedNodes) {
    const stageIndex = node.stageIndex;
    const radius = getRingRadius(stageIndex);
    let angle = Number(angleByNode.get(node.id) ?? getDefaultEvolutionAngle(stageIndex));

    if (!angleUsesByStage.has(stageIndex)) angleUsesByStage.set(stageIndex, []);
    const usedAngles = angleUsesByStage.get(stageIndex);
    angle = resolveEvolutionAngleOverlap(angle, usedAngles, stageIndex, radius);
    usedAngles.push(angle);

    const stagePeerCount = orderedNodes.filter((entry) => entry.stageIndex === stageIndex).length;
    const localRadius = radius === 0 && stagePeerCount > 1 ? 58 : radius;
    const autoX = Math.round(centerX + Math.cos(angle) * localRadius);
    const autoY = Math.round(centerY + Math.sin(angle) * localRadius);
    const manualPosition = manualNodePositions?.[node.id];
    const constrainedPosition = manualPosition
      ? getConstrainedNodePosition(node, Number(manualPosition.x ?? autoX), Number(manualPosition.y ?? autoY))
      : { x: autoX, y: autoY };
    const x = Math.round(constrainedPosition.x);
    const y = Math.round(constrainedPosition.y);

    const positioned = {
      ...node,
      x,
      y,
      left: x,
      top: y,
      branchAngle: angle,
      hasManualPosition: Boolean(manualPosition)
    };

    positionedNodes.push(positioned);
    nodePositionMap.set(node.id, positioned);
  }

  const positionedEdges = edges
    .map((edge) => {
      const from = nodePositionMap.get(edge.from);
      const to = nodePositionMap.get(edge.to);
      if (!from || !to) return null;

      const method = edge.method ?? "normal";
      const geometry = buildEvolutionEdgeGeometry(from, to, method, edge.id, positionedNodes);

      return {
        ...edge,
        method,
        methodLabel: getEvolutionMethodLabel(method),
        fromName: from.displayName ?? from.name ?? "",
        toName: to.displayName ?? to.name ?? "",
        fromStageLabel: from.stageLabel ?? "",
        toStageLabel: to.stageLabel ?? "",
        ...geometry
      };
    })
    .filter(Boolean);

  const rings = stageKeys.map((stageKey) => {
    const stageIndex = getEvolutionStageIndex(stageKey);
    const radius = getRingRadius(stageIndex);
    const size = Math.max(18, radius * 2);

    return {
      key: stageKey,
      label: getDigimonStageLabel(stageKey),
      radius,
      left: Math.round(centerX - size / 2),
      top: Math.round(centerY - size / 2),
      size
    };
  });

  return {
    width,
    height,
    centerX,
    centerY,
    rings,
    nodes: positionedNodes,
    edges: positionedEdges,
    hasNodes: positionedNodes.length > 0,
    methodOptions: getEvolutionMethodOptions()
  };
}


    activateListeners(html) {
    super.activateListeners(html);

    this._applyEnemyNpcSheetClass(html);
    this._applyEvolutionSolarDynamicStyles(html);

    html.find(".item-create").on("click", this.#onItemCreate.bind(this));
    html.find(".item-edit").on("click", this.#onItemEdit.bind(this));
    html.find(".item-delete").on("click", this.#onItemDelete.bind(this));
    html.find(".quality-toggle-active").on("click", this.#onQualityToggleActive.bind(this));
    html.find(".restore-quality-uses").on("click", this.#onRestoreQualityUses.bind(this));
    html.find('[data-action="open-quality-browser"]').on("click", (event) => {
      event.preventDefault();

      if (!game.dda?.DigimonQualityBrowser) {
        ui.notifications.error(localize("DDA.Warning.QualityBrowserNotLoaded"));
        return;
      }

      new game.dda.DigimonQualityBrowser(this.actor).render(true);
    });

    html.find(".roll-pool").on("click", this.#onRollPool.bind(this));
    html.find('[data-action="roll-derived-stat"]').on("click", this._onRollDerivedStat.bind(this));
    html.find(".roll-attack").on("click", this.#onRollAttack.bind(this));
    html.find(".end-turn").on("click", this.#onEndTurn.bind(this));
    html.find(".roll-recovery").on("click", this.#onRollRecovery.bind(this));
    html.find(".dda-clash-stat-card").on("click", this._onInitiateClash.bind(this));
    html.find(".end-clash-digimon").on("click", this._onEndClash.bind(this));

    html.find(".tamer-drop-zone").on("dragover", this._onTamerDragOver.bind(this));
    html.find(".tamer-drop-zone").on("drop", this._onTamerDrop.bind(this));
    html.find(".open-tamer-sheet").on("click", this._onOpenTamerSheet.bind(this));
    html.find(".unlink-tamer").on("click", this._onUnlinkTamer.bind(this));

    html.find(".evolution-drop-zone").on("dragover", this._onEvolutionDragOver.bind(this));
    html.find(".evolution-drop-zone").on("drop", this._onEvolutionDrop.bind(this));
    html.find(".open-evolution-form").on("click", this._onOpenEvolutionForm.bind(this));
    html.find(".clear-evolution-form").on("click", this._onClearEvolutionForm.bind(this));
    html.find("[data-evolution-drop-target]").on("dragover", this._onEvolutionSolarDragOver.bind(this));
    html.find("[data-evolution-drop-target]").on("dragleave", this._onEvolutionSolarDragLeave.bind(this));
    html.find("[data-evolution-drop-target]").on("drop", this._onEvolutionSolarDrop.bind(this));
    html.find(".create-evolution-edge").on("click", this._onCreateEvolutionEdge.bind(this));
    html.find(".remove-evolution-edge").on("click", this._onRemoveEvolutionEdge.bind(this));
    html.find(".open-evolution-node").on("click", this._onOpenEvolutionNode.bind(this));
    html.find(".remove-evolution-node").on("click", this._onRemoveEvolutionNode.bind(this));
    html.find(".clear-evolution-graph").on("click", this._onClearEvolutionGraph.bind(this));
    html.find(".choose-evolution-form").on("click", this._onChooseEvolutionForm.bind(this));
    html.find(".open-evolution-graph-popout").on("click", this._onOpenEvolutionGraphPopout.bind(this));
    html.find(".evolve-active-special-form").on("click", this._onEvolveActiveSpecialForm.bind(this));
    html.find("[data-evolution-zoom]").on("click", this._onEvolutionGraphZoom.bind(this));
    html.find("[data-evolution-viewport]").on("wheel", this._onEvolutionGraphWheel.bind(this));
    html.find("[data-evolution-viewport]").on("pointerdown", this._onEvolutionGraphPanStart.bind(this));
    html.find(".dda-evolution-node").on("pointerdown", this._onEvolutionNodeDragStart.bind(this));
    html.find("[data-evolution-reset-node-layout]").on("click", this._onResetEvolutionNodeLayout.bind(this));

    if (this._ddaEvolutionGraphView?.actorUuid !== this.actor.uuid) {
      this._ddaEvolutionGraphView = {
        x: 0,
        y: 0,
        zoom: this._getEvolutionGraphFocusZoom(),
        initialized: false,
        actorUuid: this.actor.uuid
      };
    }

    this._applyEvolutionGraphTransform(html);

    html.find('[data-action="edit-digimon-portrait"]').on("click", this._onEditDigimonPortrait.bind(this));
    this._ensureAnimatedPortraitPlayback(html);

    requestAnimationFrame(() => {
      const root = this.element?.[0];
      if (!root?.querySelector?.("[data-evolution-map]")) return;

      if (!this._ddaEvolutionGraphView?.focusedOnce) {
        this._ddaEvolutionGraphView = {
          ...this._getEvolutionGraphCenteredView(this._getEvolutionGraphFocusZoom(), root),
          actorUuid: this.actor.uuid,
          focusedOnce: true
        };
        this._applyEvolutionGraphTransform(root);
      }
    });

    html.find(".energize-action").click(this._onEnergizeAction.bind(this));
    html.find('[data-action="select-movement-type"]').on("change", this._onSelectMovementType.bind(this));

    html.find('[data-action="digivice-sheet"]').on("click", this._onDigiviceSheet.bind(this));
    html.find('[data-action="digivice-token"]').on("click", this._onDigivicePrototypeToken.bind(this));
    html.find('[data-action="digivice-close"]').on("click", this._onDigiviceClose.bind(this));
    html.find('[data-action="edit-digimon-name"]').on("click", this._onEditDigimonName.bind(this));
    html.find(".dda-window-side-device").on("dblclick", this._onDigiviceDoubleClick.bind(this));
    html.find(".dda-window-side-device").on("pointerdown", this._onDigiviceDragStart.bind(this));

html.find(".dda-device-button").on("pointerdown", (event) => {
  event.stopPropagation();
});

html.find(".dda-device-button")
  .not('[data-action="digivice-close"]')
  .on("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

html.find(".dda-device-button").on("dblclick", (event) => {
  event.preventDefault();
  event.stopPropagation();
});

    html.find(".remove-active-effect").on("click", this._onRemoveActiveEffect.bind(this));
  }

  _applyEnemyNpcSheetClass(html) {
    const root = html instanceof HTMLElement
      ? html
      : html?.[0] instanceof HTMLElement
        ? html[0]
        : null;

    if (!root) return;

    const systemId = game.system?.id ?? "digimon-digital-adventures";

    const isEnemyNpc =
      this.actor?.type === "npc" ||
      Boolean(
        this.actor?.getFlag?.(systemId, "enemyNpc")?.isEnemy
      );

    root.classList.toggle(
      "dda-enemy-npc-sheet",
      isEnemyNpc
    );

    const appElement = root.closest(".window-app");

    appElement?.classList.toggle(
      "dda-enemy-npc-window",
      isEnemyNpc
    );
  }


  async _onEditDigimonName(event) {
  event.preventDefault();
  event.stopPropagation();

  const currentCustomName = String(this.actor.system?.customName ?? "").trim();
  const currentDisplayName = currentCustomName || getDigimonSheetDisplayName(this.actor);
  const currentSpeciesName = getDigimonDisplayName(this.actor) || this.actor.system?.species || this.actor.name;

const content = `
  <form class="dda-edit-digimon-name-dialog">
    <p>
      ${game.i18n.localize("DDA.DigimonNameEdit.WarningNameNotSpecies")}
    </p>

    <p>
      ${game.i18n.localize("DDA.DigimonNameEdit.WarningSharedPartnerName")}
    </p>

    <p>
      ${game.i18n.localize("DDA.DigimonNameEdit.WarningBlankToReset")}
    </p>

    <div class="form-group">
      <label>${game.i18n.localize("DDA.DigimonNameEdit.FieldLabel")}</label>
      <input
        type="text"
        name="customName"
        value="${foundry.utils.escapeHTML(currentCustomName || currentDisplayName)}"
        placeholder="${foundry.utils.escapeHTML(currentSpeciesName)}"
        autofocus
      />
    </div>
  </form>
`;

  await Dialog.confirm({
    title: game.i18n.localize("DDA.DigimonNameEdit.Title"),
    content,
    yes: async (html) => {
      const form = html[0]?.querySelector?.(".dda-edit-digimon-name-dialog");
      const input = form?.querySelector?.('input[name="customName"]');
      const nextCustomName = String(input?.value ?? "").trim();

      if (nextCustomName) {
        await this.actor.update({
          name: nextCustomName,
          "system.customName": nextCustomName
        });
        return;
      }

      const fallbackName = String(getDigimonDisplayName(this.actor) || this.actor.system?.species || this.actor.name || "").trim();

      await this.actor.update({
        name: fallbackName || this.actor.name,
        "system.customName": ""
      });
    },
    no: () => {},
    defaultYes: false
  });
}

  async _onChooseEvolutionForm(event) {
    event.preventDefault();

    const { DDAEvolutionChoiceBrowser } = await import("../apps/evolution-choice-browser.js");
    new DDAEvolutionChoiceBrowser(this.actor).render(true);
  }

  _applyEvolutionSolarDynamicStyles(html) {
    const root = html instanceof jQuery ? html[0] : html;
    if (!root) return;

    const setPx = (element, property, value) => {
      const number = Number(value ?? 0);
      if (!Number.isFinite(number)) return;
      element.style[property] = `${number}px`;
    };

    const map = root.querySelector("[data-evolution-map]");

    if (map) {
      setPx(map, "width", map.dataset.width);
      setPx(map, "height", map.dataset.height);
    }

    for (const ring of root.querySelectorAll("[data-ring-left][data-ring-top][data-ring-size]")) {
      setPx(ring, "left", ring.dataset.ringLeft);
      setPx(ring, "top", ring.dataset.ringTop);
      setPx(ring, "width", ring.dataset.ringSize);
      setPx(ring, "height", ring.dataset.ringSize);
    }

    for (const node of root.querySelectorAll("[data-node-left][data-node-top]")) {
      setPx(node, "left", node.dataset.nodeLeft);
      setPx(node, "top", node.dataset.nodeTop);
    }
  }


  _getEvolutionGraphViewState() {
    this._ddaEvolutionGraphView ??= {
      x: 0,
      y: 0,
      zoom: this._getEvolutionGraphFocusZoom(),
      initialized: false,
      actorUuid: this.actor.uuid
    };

    return this._ddaEvolutionGraphView;
  }

  _getEvolutionGraphElements(root = this.element?.[0]) {
    const elementRoot = root instanceof jQuery ? root[0] : root;
    const viewport = elementRoot?.querySelector?.("[data-evolution-viewport]");
    const map = elementRoot?.querySelector?.("[data-evolution-map]");

    return { viewport, map };
  }

  _getEvolutionGraphFocusZoom() {
    const stageIndex = getEvolutionStageIndex(this.actor.system?.stage ?? "child");
    const zoomByStage = {
      0: 1.08,
      1: 1.00,
      2: 0.90,
      3: 0.78,
      4: 0.66,
      5: 0.56,
      6: 0.50
    };

    return Math.clamp(Number(zoomByStage[stageIndex] ?? 0.78), 0.48, 1.12);
  }

  _getEvolutionGraphCenteredView(zoom = null, root = this.element?.[0]) {
    const { viewport, map } = this._getEvolutionGraphElements(root);
    const current = this._getEvolutionGraphViewState();
    const nextZoom = Math.clamp(Number(zoom ?? current.zoom ?? this._getEvolutionGraphFocusZoom()), 0.42, 1.65);

    const viewportWidth = Number(viewport?.clientWidth ?? 0);
    const viewportHeight = Number(viewport?.clientHeight ?? 0);
    const mapWidth = Number(map?.dataset?.width ?? map?.offsetWidth ?? 0);
    const mapHeight = Number(map?.dataset?.height ?? map?.offsetHeight ?? 0);
    const focusNode = map?.querySelector?.(".dda-evolution-node.is-self") ?? null;
    const focusX = Number(focusNode?.dataset?.nodeLeft ?? mapWidth / 2);
    const focusY = Number(focusNode?.dataset?.nodeTop ?? mapHeight / 2);

    return this._clampEvolutionGraphView({
      x: Math.round(viewportWidth / 2 - focusX * nextZoom),
      y: Math.round(viewportHeight / 2 - focusY * nextZoom),
      zoom: nextZoom,
      initialized: true
    }, root);
  }

  _clampEvolutionGraphView(view, root = this.element?.[0]) {
    const { viewport, map } = this._getEvolutionGraphElements(root);
    const zoom = Math.clamp(Number(view?.zoom ?? this._getEvolutionGraphFocusZoom()), 0.42, 1.65);

    const viewportWidth = Number(viewport?.clientWidth ?? 0);
    const viewportHeight = Number(viewport?.clientHeight ?? 0);
    const mapWidth = Number(map?.dataset?.width ?? map?.offsetWidth ?? 0) * zoom;
    const mapHeight = Number(map?.dataset?.height ?? map?.offsetHeight ?? 0) * zoom;
    const padding = 12;

    const clampAxis = (value, viewportSize, contentSize) => {
      const numericValue = Number(value ?? 0);

      if (!viewportSize || !contentSize) return numericValue;
      if (contentSize <= viewportSize) return Math.round((viewportSize - contentSize) / 2);

      const min = viewportSize - contentSize - padding;
      const max = padding;
      return Math.round(Math.clamp(numericValue, min, max));
    };

    return {
      x: clampAxis(view?.x, viewportWidth, mapWidth),
      y: clampAxis(view?.y, viewportHeight, mapHeight),
      zoom,
      initialized: true,
      actorUuid: this.actor.uuid,
      focusedOnce: Boolean(view?.focusedOnce)
    };
  }

  _applyEvolutionGraphTransform(html = this.element) {
    const root = html instanceof jQuery ? html[0] : html;
    if (!root) return;

    const { viewport, map } = this._getEvolutionGraphElements(root);
    if (!viewport || !map) return;

    let view = this._getEvolutionGraphViewState();

    if (!view.initialized) {
      view = this._getEvolutionGraphCenteredView(view.zoom, root);
    } else {
      view = this._clampEvolutionGraphView(view, root);
    }

    this._ddaEvolutionGraphView = view;

    const zoomOutput = root.querySelector("[data-evolution-zoom-output]");
    if (zoomOutput) zoomOutput.textContent = `${Math.round(view.zoom * 100)}%`;

    map.style.transformOrigin = "0 0";
    map.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
    map.dataset.zoom = String(view.zoom.toFixed(2));
    viewport.dataset.zoom = String(view.zoom.toFixed(2));
  }

  _setEvolutionGraphView(nextView = {}, root = this.element?.[0]) {
    const current = this._getEvolutionGraphViewState();
    const view = this._clampEvolutionGraphView({
      x: Number(nextView.x ?? current.x ?? 0),
      y: Number(nextView.y ?? current.y ?? 0),
      zoom: Number(nextView.zoom ?? current.zoom ?? this._getEvolutionGraphFocusZoom()),
      initialized: true
    }, root);

    this._ddaEvolutionGraphView = view;
    this._applyEvolutionGraphTransform(root);
  }

  async _onOpenEvolutionGraphPopout(event) {
    event.preventDefault();
    event.stopPropagation();

    const popout = this._ddaEvolutionGraphPopout;
    const popoutElement = popout?.element?.[0] ?? popout?._element?.[0] ?? null;
    const hasValidPopoutElement = popoutElement instanceof Element && document.body.contains(popoutElement);

    if (popout?.rendered && hasValidPopoutElement) {
      popout.bringToTop?.();
      popout.render(false);
      return;
    }

    if (popout) {
      try {
        await popout.close({ force: true });
      } catch (error) {
        console.warn("DDA | Could not close stale Evolution Graph popout before reopening.", error);
      }

      this._ddaEvolutionGraphPopout = null;
    }

    this._ddaEvolutionGraphPopout = new DDAEvolutionGraphPopout(this);
    this._ddaEvolutionGraphPopout.render(true);
  }

  _onEvolutionGraphZoom(event) {
    event.preventDefault();
    event.stopPropagation();

    const root = event.currentTarget?.closest?.(".dda-evolution-graph-popout, .dda-digimon-sheet") ?? this.element?.[0];
    const action = event.currentTarget?.dataset?.evolutionZoom ?? "reset";
    const view = this._getEvolutionGraphViewState();

    if (action === "reset") {
      this._ddaEvolutionGraphView = {
        ...this._getEvolutionGraphCenteredView(this._getEvolutionGraphFocusZoom(), root),
        actorUuid: this.actor.uuid,
        focusedOnce: true
      };
      this._applyEvolutionGraphTransform(root);
      return;
    }

    const factor = action === "in" ? 1.15 : 1 / 1.15;
    this._setEvolutionGraphView({
      ...view,
      zoom: view.zoom * factor
    }, root);
  }

  _onEvolutionGraphWheel(event) {
    const rawEvent = event.originalEvent ?? event;
    const view = this._getEvolutionGraphViewState();

    rawEvent.preventDefault();
    rawEvent.stopPropagation();

    const root = rawEvent.currentTarget?.closest?.(".dda-evolution-graph-popout, .dda-digimon-sheet") ?? this.element?.[0];

    if (rawEvent.ctrlKey || rawEvent.shiftKey) {
      const factor = rawEvent.deltaY < 0 ? 1.1 : 1 / 1.1;
      this._setEvolutionGraphView({
        ...view,
        zoom: view.zoom * factor
      }, root);
      return;
    }

    this._setEvolutionGraphView({
      ...view,
      x: view.x - Number(rawEvent.deltaX ?? 0),
      y: view.y - Number(rawEvent.deltaY ?? 0)
    }, root);
  }

  _onEvolutionGraphPanStart(event) {
    const rawEvent = event.originalEvent ?? event;

    if (rawEvent.button !== 0) return;
    if (rawEvent.target?.closest?.("button, input, select, textarea, a, .dda-evolution-node")) return;

    rawEvent.preventDefault();
    rawEvent.stopPropagation();

    const view = this._getEvolutionGraphViewState();

    this._ddaEvolutionGraphPan = {
      startX: rawEvent.clientX,
      startY: rawEvent.clientY,
      viewX: view.x,
      viewY: view.y,
      root: rawEvent.currentTarget?.closest?.(".dda-evolution-graph-popout, .dda-digimon-sheet") ?? this.element?.[0]
    };

    const viewport = rawEvent.currentTarget;
    viewport?.classList?.add("is-panning");

    document.addEventListener(
      "pointermove",
      this._onEvolutionGraphPanMoveBound ??= this._onEvolutionGraphPanMove.bind(this)
    );

    document.addEventListener(
      "pointerup",
      this._onEvolutionGraphPanEndBound ??= this._onEvolutionGraphPanEnd.bind(this),
      { once: true }
    );
  }

  _onEvolutionGraphPanMove(event) {
    const pan = this._ddaEvolutionGraphPan;
    if (!pan) return;

    const view = this._getEvolutionGraphViewState();
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;

    this._setEvolutionGraphView({
      ...view,
      x: pan.viewX + dx,
      y: pan.viewY + dy
    }, pan.root);
  }

  _onEvolutionGraphPanEnd() {
    document.removeEventListener("pointermove", this._onEvolutionGraphPanMoveBound);

    const panRoot = this._ddaEvolutionGraphPan?.root ?? this.element?.[0] ?? document;
    panRoot.querySelector("[data-evolution-viewport]")?.classList?.remove("is-panning");

    this._ddaEvolutionGraphPan = null;
  }


  _getEvolutionGraphMapPointFromEvent(event, root = this.element?.[0]) {
    const rawEvent = event.originalEvent ?? event;
    const { map } = this._getEvolutionGraphElements(root);
    if (!map) return null;

    const rect = map.getBoundingClientRect();
    const zoom = Number(map.dataset?.zoom ?? this._getEvolutionGraphViewState().zoom ?? 1) || 1;

    return {
      x: (rawEvent.clientX - rect.left) / zoom,
      y: (rawEvent.clientY - rect.top) / zoom
    };
  }

  _onEvolutionNodeDragStart(event) {
    const rawEvent = event.originalEvent ?? event;

    if (rawEvent.button !== 0) return;
    if (rawEvent.target?.closest?.("button, input, select, textarea, a")) return;

    const nodeElement = rawEvent.currentTarget;
    const nodeId = nodeElement?.dataset?.nodeId ?? "";
    const nodeStage = nodeElement?.dataset?.nodeStage ?? "child";
    if (!nodeId) return;

    rawEvent.preventDefault();
    rawEvent.stopPropagation();

    const root = nodeElement.closest?.(".dda-evolution-graph-popout, .dda-digimon-sheet") ?? this.element?.[0];
    const startPoint = this._getEvolutionGraphMapPointFromEvent(rawEvent, root);
    if (!startPoint) return;

    this._ddaEvolutionNodeDrag = {
      root,
      nodeElement,
      nodeId,
      stage: nodeStage,
      stageIndex: getEvolutionStageIndex(nodeStage),
      startPointerX: startPoint.x,
      startPointerY: startPoint.y,
      startNodeX: Number(nodeElement.dataset.nodeLeft ?? 0),
      startNodeY: Number(nodeElement.dataset.nodeTop ?? 0),
      moved: false
    };

    nodeElement.classList.add("is-node-dragging");
    root?.querySelector?.("[data-evolution-viewport]")?.classList?.add("is-dragging-node");

    document.addEventListener(
      "pointermove",
      this._onEvolutionNodeDragMoveBound ??= this._onEvolutionNodeDragMove.bind(this)
    );

    document.addEventListener(
      "pointerup",
      this._onEvolutionNodeDragEndBound ??= this._onEvolutionNodeDragEnd.bind(this),
      { once: true }
    );
  }

  _onEvolutionNodeDragMove(event) {
    const drag = this._ddaEvolutionNodeDrag;
    if (!drag?.nodeElement) return;

    event.preventDefault();

    const point = this._getEvolutionGraphMapPointFromEvent(event, drag.root);
    if (!point) return;

    const graph = this._getEvolutionGraphData();
    const constrained = constrainEvolutionNodePositionToStage({
      x: drag.startNodeX + (point.x - drag.startPointerX),
      y: drag.startNodeY + (point.y - drag.startPointerY),
      stageIndex: drag.stageIndex,
      centerX: graph.centerX,
      centerY: graph.centerY,
      getRingRadius: (stageIndex) => getEvolutionGraphRingRadiusForData(graph, stageIndex)
    });

    const nextX = Math.round(constrained.x);
    const nextY = Math.round(constrained.y);

    drag.nodeElement.dataset.nodeLeft = String(nextX);
    drag.nodeElement.dataset.nodeTop = String(nextY);
    drag.nodeElement.style.left = `${nextX}px`;
    drag.nodeElement.style.top = `${nextY}px`;
    drag.nextX = nextX;
    drag.nextY = nextY;
    drag.moved = true;
  }

  async _onEvolutionNodeDragEnd() {
    document.removeEventListener("pointermove", this._onEvolutionNodeDragMoveBound);

    const drag = this._ddaEvolutionNodeDrag;
    this._ddaEvolutionNodeDrag = null;

    if (!drag?.nodeElement) return;

    drag.nodeElement.classList.remove("is-node-dragging");
    drag.root?.querySelector?.("[data-evolution-viewport]")?.classList?.remove("is-dragging-node");

    if (!drag.moved) return;

    const preservedView = this._captureEvolutionGraphViewForRefresh(drag.root);
    this._ddaEvolutionGraphView = preservedView;

    const graph = getNormalizedEvolutionGraph(this.actor);
    const layout = foundry.utils.deepClone(graph.layout ?? { mode: "solar" });
    layout.mode = layout.mode ?? "solar";
    layout.nodePositions = foundry.utils.deepClone(layout.nodePositions ?? {});
    layout.nodePositions[drag.nodeId] = {
      x: Math.round(Number(drag.nextX ?? drag.startNodeX)),
      y: Math.round(Number(drag.nextY ?? drag.startNodeY))
    };

    graph.layout = layout;
    graph.legacyImported = true;

    await this.actor.update({
      "system.evolutionGraph": graph
    });

    this._refreshEvolutionGraphViews({ preserveView: preservedView });
  }

  async _onResetEvolutionNodeLayout(event) {
    event.preventDefault();
    event.stopPropagation();

    const graph = getNormalizedEvolutionGraph(this.actor);
    const layout = foundry.utils.deepClone(graph.layout ?? { mode: "solar" });

    layout.mode = layout.mode ?? "solar";
    layout.nodePositions = {};
    graph.layout = layout;
    graph.legacyImported = true;

    await this.actor.update({
      "system.evolutionGraph": graph
    });

    this._refreshEvolutionGraphViews();
  }

  async #onItemCreate(event) {
    event.preventDefault();

    const type = event.currentTarget.dataset.type;
    const name = event.currentTarget.dataset.name ?? localize("DDA.Item.NewItem");

    await this.actor.createEmbeddedDocuments("Item", [
      {
        name,
        type
      }
    ]);
  }

  #onItemEdit(event) {
    event.preventDefault();

    const itemId = event.currentTarget.closest(".item-row").dataset.itemId;
    const item = this.actor.items.get(itemId);

    item?.sheet?.render(true);
  }

  async #onItemDelete(event) {
    event.preventDefault();

    const itemId = event.currentTarget.closest(".item-row").dataset.itemId;

    await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
  }

async #onQualityToggleActive(event) {
  event.preventDefault();

  const itemId = event.currentTarget.closest(".item-row")?.dataset.itemId;
  const item = this.actor.items.get(itemId);

  if (!item || item.type !== "quality") {
    ui.notifications.warn(localize("DDA.Warning.QualityNotFoundOnSheet"));
    return;
  }

  const activationMode = item.system.activation?.mode ?? "toggle";
  const isInstant = activationMode === "instant";

  const currentlyActive = Boolean(item.system.activation?.active);
  const nextActive = isInstant ? currentlyActive : !currentlyActive;

  // Só cobra custo quando está usando uma qualidade instantânea
  // ou ativando uma qualidade liga/desliga.
  // Desativar não cobra nada.
  const isActivatingOrUsing = isInstant || nextActive;

  const usesEnabled = Boolean(item.system.uses?.enabled);
  const usesValue = Number(item.system.uses?.value ?? 0);

  const shouldConsumeUse = usesEnabled && isActivatingOrUsing;

  if (shouldConsumeUse && usesValue <= 0) {
    ui.notifications.warn(formatI18n("DDA.Warning.QualityNoUsesRemaining", { quality: item.name }));
    return;
  }

const rawActionCost = item.system.trigger?.actionCost ?? "";
const actionCost = String(rawActionCost).trim();
const normalizedActionCost = actionCost
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "");

const rawBatteryCost = item.system.trigger?.batteryCost;
const batteryCost = Math.max(
  0,
  Number(rawBatteryCost === "" || rawBatteryCost === undefined || rawBatteryCost === null ? 1 : rawBatteryCost)
);

const currentActions = Number(this.actor.system.combat?.actions?.value ?? 0);
const currentBattery = Number(this.actor.system.resources?.battery?.value ?? 0);

let actionsToSpend = 0;
let batteryToSpend = 0;

if (isActivatingOrUsing) {
  if (normalizedActionCost === "1" || normalizedActionCost === "2") {
    actionsToSpend = Number(normalizedActionCost);
  }

const hasBatteryCost = batteryCost > 0;
const actionCostIsBattery =
  normalizedActionCost === "battery" ||
  normalizedActionCost === "bateria" ||
  normalizedActionCost.includes("battery") ||
  normalizedActionCost.includes("bateria");

if (actionCostIsBattery || hasBatteryCost) {
  batteryToSpend = batteryCost;
}
}

  if (actionsToSpend > 0 && currentActions < actionsToSpend) {
    ui.notifications.warn(formatI18n("DDA.Warning.NotEnoughActionsToUseQuality", { actor: this.actor.name, quality: item.name }));
    return;
  }

  if (batteryToSpend > 0 && currentBattery < batteryToSpend) {
    ui.notifications.warn(formatI18n("DDA.Warning.NotEnoughBatteryToUseQuality", { actor: this.actor.name, quality: item.name }));
    return;
  }

  const itemUpdateData = {};
  const actorUpdateData = {};

  if (!isInstant) {
    itemUpdateData["system.activation.active"] = nextActive;
  }

  let remainingUses = usesValue;

  if (shouldConsumeUse) {
    remainingUses = Math.max(0, usesValue - 1);
    itemUpdateData["system.uses.value"] = remainingUses;
  }

  let remainingActions = currentActions;
  let remainingBattery = currentBattery;

  if (actionsToSpend > 0) {
    remainingActions = Math.max(0, currentActions - actionsToSpend);
    actorUpdateData["system.combat.actions.value"] = remainingActions;
  }

if (batteryToSpend > 0) {
  remainingBattery = Math.max(0, currentBattery - batteryToSpend);
  actorUpdateData["system.resources.battery.value"] = remainingBattery;
}
console.log("DDA | Custo da Qualidade", {
  quality: item.name,
  rawActionCost,
  actionCost,
  normalizedActionCost,
  rawBatteryCost,
  batteryCost,
  currentBattery,
  batteryToSpend,
  isActivatingOrUsing
});

  if (Object.keys(itemUpdateData).length > 0) {
    await item.update(itemUpdateData);
  }

  if (Object.keys(actorUpdateData).length > 0) {
    await this.actor.update(actorUpdateData);
  }

  const actionLabel = isInstant
    ? localize("DDA.QualityActivation.Action.Used")
    : nextActive
      ? localize("DDA.QualityActivation.Action.Activated")
      : localize("DDA.QualityActivation.Action.Deactivated");

  const stateLabel = isInstant
    ? localize("DDA.QualityActivation.State.InstantUse")
    : nextActive
      ? localize("DDA.QualityActivation.State.Active")
      : localize("DDA.QualityActivation.State.Inactive");

  const customMessage = item.system.activation?.chatMessage ?? "";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-quality-activation-card">
        <h2>${item.name}</h2>

        <p>
          <strong>${this.actor.name}</strong>
          ${actionLabel}
          <strong>${item.name}</strong>.
        </p>

        <ul class="dda-effect-list dda-quality-activation-list">
          <li>
            ${localize("DDA.Label.State")}:
            <strong>${stateLabel}</strong>.
          </li>

          ${
            actionCost
              ? `
                <li>
                  ${localize("DDA.Label.Cost")}:
                  <strong>${getQualityActionCostLabel(normalizedActionCost, batteryCost)}</strong>
                </li>
              `
              : ""
          }

          ${
            actionsToSpend > 0
              ? `
                <li>
                  ${localize("DDA.Resource.Actions")}:
                  <strong>${currentActions} → ${remainingActions}</strong>.
                </li>
              `
              : ""
          }

          ${
            batteryToSpend > 0
              ? `
                <li>
                  ${localize("DDA.Resource.Battery")}:
                  <strong>${currentBattery} → ${remainingBattery}</strong>.
                </li>
              `
              : ""
          }

          ${
            item.system.trigger?.frequency
              ? `
                <li>
                  ${localize("DDA.Label.Frequency")}:
                  <strong>${getQualityFrequencyLabel(item.system.trigger.frequency)}</strong>.
                </li>
              `
              : ""
          }

          ${
            usesEnabled
              ? `
                <li>
                  ${localize("DDA.Label.Uses")}:
                  <strong>${formatI18n("DDA.QualityActivation.UsesRemaining", { uses: remainingUses })}</strong>.
                </li>
              `
              : ""
          }

          ${
            customMessage
              ? `
                <li>
                  ${customMessage}
                </li>
              `
              : ""
          }
        </ul>
      </div>
    `
  });

  if (isActivatingOrUsing) {
    await applyAutomatedQualityUseSideEffects(this.actor, item);
  }
}

async #onRestoreQualityUses(event) {
  event.preventDefault();

  const rechargeType = await new Promise((resolve) => {
    new Dialog(
      {
      title: localize("DDA.QualityRecharge.RestoreUses"),    
content: `
  <form class="dda-restore-uses-form">
    <div class="dda-dialog-panel">
      <p class="dda-dialog-help">
        ${localize("DDA.QualityRecharge.ChooseRechargeType")}
      </p>

      <div class="form-group">
        <label>${localize("DDA.QualityRecharge.RechargeType")}</label>
        <select name="rechargeType">
          <option value="scene">${localize("DDA.Time.Scene")}</option>
          <option value="session">${localize("DDA.Time.Session")}</option>
          <option value="special">${localize("DDA.Time.Special")}</option>
        </select>
      </div>
    </div>
  </form>
`,
      buttons: {
        restore: {
          label: localize("DDA.Button.Restore"),
          callback: (html) => {
            const value = html.find("[name='rechargeType']").val();
            resolve(value);
          }
        },
        cancel: {
          label: localize("DDA.Button.Cancel"),
          callback: () => resolve(null)
        }
      },
      close: () => resolve(null),
      default: "restore"
    },
    {
      classes: ["dda-restore-uses-dialog"],
      width: 420
    }
  ).render(true);
  });

  if (!rechargeType) return;

  const rechargeData = await rechargeQualityUses(this.actor, rechargeType);

  if (!rechargeData.changed) {
    ui.notifications.info(localize("DDA.Info.NoQualityNeededRecharge"));
    return;
  }

  this.actor.sheet?.render(false);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    content: `
      <div class="dda-chat-card dda-effect-card effect-special dda-quality-recharge-card">
        <h2>${localize("DDA.QualityRecharge.RestoreUses")}</h2>

        <p>
          <strong>${this.actor.name}</strong>
          ${localize("DDA.QualityRecharge.ActorRestoredQualityUses")}
        </p>

        <ul class="dda-effect-list dda-quality-recharge-list">
          <li>
            ${localize("DDA.Label.Type")}:
            <strong>${getQualityRechargeLabel(rechargeType)}</strong>.
          </li>

          <li>
            ${localize("DDA.Item.Qualities")}:
            ${rechargeData.entries.map((entry) => {
              return `<span><strong>${entry.name}</strong> ${entry.oldValue} → ${entry.newValue}</span>`;
            }).join(" ")}
          </li>
        </ul>
      </div>
    `
  });
}

async #onRollPool(event) {
  event.preventDefault();

  const statKey = event.currentTarget.dataset.stat;
  await this._rollMainStatPool(statKey);
}

async _rollMainStatPool(statKey) {
  const stat = this.actor.system.mainStats?.[statKey];

  if (!stat) {
    ui.notifications.warn(localize("DDA.Warning.MainStatNotFound") || "Main Stat not found.");
    return;
  }

  const statLabel = localizeMaybe(stat.displayLabel ?? stat.label ?? statKey);
  const poolSize = Math.max(0, Number(stat.total ?? stat.value ?? 0));
  const automaticSuccesses = Math.max(0, Number(stat.automaticSuccesses ?? 0));

  const dicePoolSize = Math.max(0, poolSize - automaticSuccesses);
  const formula = dicePoolSize > 0 ? `${dicePoolSize}d6` : "0";

  const roll = await new Roll(formula).evaluate();

  const diceResults = roll.dice
    .flatMap((die) => die.results ?? [])
    .map((result) => Number(result.result ?? 0));

  const rolledSuccesses = diceResults.filter((value) => value >= 5).length;
  const totalSuccesses = rolledSuccesses + automaticSuccesses;

  const automaticSuccessSources = Array.isArray(stat.automaticSuccessSources)
    ? stat.automaticSuccessSources
    : [];

  const automaticSuccessLine = automaticSuccesses > 0
    ? `
      <li>
        Sucessos automáticos:
        <strong>+${automaticSuccesses}</strong>
        ${
          automaticSuccessSources.length
            ? `<span class="muted">(${automaticSuccessSources.map((source) => source.name).join(", ")})</span>`
            : ""
        }
      </li>
    `
    : "";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    rolls: [roll],
    content: `
      <div class="dda-chat-roll-message dda-main-stat-pool-message">
        <div class="dda-chat-card dda-effect-card effect-special dda-main-stat-pool-card">
          <h2>${statLabel}</h2>

          <ul class="dda-effect-list">
            <li>Pool total: <strong>${poolSize}</strong></li>
            <li>Dados rolados: <strong>${dicePoolSize}d6</strong></li>
            <li>Sucessos nos dados: <strong>${rolledSuccesses}</strong></li>
            ${automaticSuccessLine}
            <li>Total de sucessos: <strong>${totalSuccesses}</strong></li>
          </ul>
        </div>
        ${dicePoolSize > 0 ? await roll.render() : ""}
      </div>
    `
  });
}

async _onRollDerivedStat(event) {
  event.preventDefault();

  const statKey = event.currentTarget.dataset.derivedStat;
  await this._rollDerivedStatCheck(statKey);
}

async _promptDerivedStatCheckOptions(statKey) {
  const stat = this.actor.system.derivedStats?.[statKey];
  const statLabel = localizeMaybe(stat?.displayLabel ?? stat?.label ?? `DDA.DerivedStat.${String(statKey ?? "").toUpperCase()}`) || String(statKey ?? "").toUpperCase();

  const availableSkills = (DIGIMON_SKILLS_BY_DERIVED_STAT[statKey] ?? [])
  .map((skill) => {
    const skillBonusData = this.actor.system.skillBonuses?.[skill.key];
    const skillBonus = Number(skillBonusData?.value ?? 0);

    if (!skillBonusData || skillBonus === 0) return null;

    return {
      ...skill,
      label: skillBonusData.label ?? localize(skill.labelKey),
      bonus: skillBonus
    };
  })
  .filter(Boolean);

const skillOptions = availableSkills
  .map((skill) => {
    const bonusLabel = skill.bonus > 0 ? ` (+${skill.bonus})` : ` (${skill.bonus})`;
    return `<option value="${skill.key}">${skill.label}${bonusLabel}</option>`;
  })
  .join("");

  const skillFieldLabelKey = "DDA.Label.Skill";
const noneLabelKey = "DDA.Label.None";

const skillFieldLabel = localize(skillFieldLabelKey) !== skillFieldLabelKey
  ? localize(skillFieldLabelKey)
  : "Skill";

const noneLabel = localize(noneLabelKey) !== noneLabelKey
  ? localize(noneLabelKey)
  : "None";

  return await new Promise((resolve) => {
    new Dialog({
      title: formatI18n("DDA.DerivedCheck.DialogTitle", { stat: statLabel }),
      content: `
        <form class="dda-derived-stat-check-form">
          <div class="dda-dialog-panel">
            <p class="dda-dialog-help">
              ${formatI18n("DDA.DerivedCheck.FormulaHelp", { stat: `<strong>${statLabel}</strong>` })}
            </p>

            <div class="form-group">
              <label>${localize("DDA.Roll.TN")}</label>
              <input type="number" name="tn" value="" placeholder="${localize("DDA.Check.NoTN")}" />
            </div>

${
  availableSkills.length
    ? `
      <div class="form-group">
        <label>${skillFieldLabel}</label>
        <select name="skillKey">
          <option value="">${noneLabel}</option>
          ${skillOptions}
        </select>
      </div>
    `
    : ""
}

            <div class="form-group">
              <label>${localize("DDA.TamerSkillDialog.ManualModifier")}</label>
              <input type="number" name="modifier" value="0" />
            </div>
          </div>
        </form>
      `,
      buttons: {
        roll: {
          label: localize("DDA.Button.Roll"),
          callback: (html) => {
            const root = html?.[0] ?? html;
            const findValue = (name) => html.find ? html.find(`[name='${name}']`).val() : root?.querySelector(`[name='${name}']`)?.value;
resolve({
  tn: findValue("tn"),
  modifier: Number(findValue("modifier") ?? 0),
  skillKey: findValue("skillKey") ?? ""
});
          }
        },
        cancel: {
          label: localize("DDA.Button.Cancel"),
          callback: () => resolve(null)
        }
      },
      close: () => resolve(null),
      default: "roll"
    }).render(true);
  });
}

async _rollDerivedStatCheck(statKey) {
  const stat = this.actor.system.derivedStats?.[statKey];

  if (!stat) {
    ui.notifications.warn(localize("DDA.Warning.DerivedStatNotFound"));
    return;
  }

  const options = await this._promptDerivedStatCheckOptions(statKey);
  if (!options) return;

const statLabel = localizeMaybe(stat.displayLabel ?? stat.label ?? `DDA.DerivedStat.${String(statKey).toUpperCase()}`);
const derivedValue = Number(stat.total ?? stat.value ?? 0);
const manualModifier = Number(options.modifier ?? 0);

const skillKey = String(options.skillKey ?? "");
const skillBonusData = skillKey ? this.actor.system.skillBonuses?.[skillKey] : null;
const skillBonus = Number(skillBonusData?.value ?? 0);
const skillLabel = skillBonusData?.label ?? this._getDigimonSkillLabel(statKey, skillKey);

const skillFieldLabelKey = "DDA.Label.Skill";
const skillFieldLabel = localize(skillFieldLabelKey) !== skillFieldLabelKey
  ? localize(skillFieldLabelKey)
  : "Skill";

const tn = options.tn === "" || options.tn === null || options.tn === undefined
  ? null
  : Number(options.tn);

const modifier = derivedValue + skillBonus + manualModifier;
const roll = await new Roll("3d6 + @modifier", { modifier }).evaluate();
  const total = Number(roll.total ?? 0);
  const hasTN = Number.isFinite(tn);
  const success = hasTN ? total >= tn : null;
  const criticalSuccess = hasTN ? total >= tn + 5 : false;
  const criticalFailure = hasTN ? total <= tn - 5 : false;
  const outcome = !hasTN
    ? "noTN"
    : criticalSuccess
      ? "criticalSuccess"
      : success
        ? "success"
        : criticalFailure
          ? "criticalFailure"
          : "failure";
  const outcomeLabel = !hasTN
    ? localize("DDA.Check.NoTN")
    : localize(`DDA.Check.${outcome[0].toUpperCase()}${outcome.slice(1)}`);

const skillBonusLine = skillKey
  ? `<li>${skillFieldLabel}: <strong>${skillLabel} ${skillBonus >= 0 ? "+" : ""}${skillBonus}</strong></li>`
  : "";

  const modifierLine = manualModifier
  ? `<li>${localize("DDA.TamerSkillDialog.ManualModifier")}: <strong>${manualModifier >= 0 ? "+" : ""}${manualModifier}</strong></li>`
  : "";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    rolls: [roll],
    content: `
      <div class="dda-chat-roll-message dda-derived-check-message">
        <div class="dda-chat-card dda-effect-card effect-special dda-derived-check-card ${outcome}">
          <h2>${formatI18n("DDA.DerivedCheck.Title", { stat: statLabel })}</h2>

          <ul class="dda-effect-list">
            <li>${localize("DDA.Label.Formula")}: <strong>3d6 + ${statLabel}</strong></li>
            <li>${localize("DDA.Label.DerivedStat")}: <strong>${statLabel} ${derivedValue}</strong></li>
            ${skillBonusLine}
            ${modifierLine}
            <li>${localize("DDA.Roll.TN")}: <strong>${hasTN ? tn : localize("DDA.Check.NoTN")}</strong></li>
            <li>${localize("DDA.Roll.Result")}: <strong>${outcomeLabel}</strong></li>
          </ul>
        </div>
        ${await roll.render()}
      </div>
    `
  });
}


_getDigimonSkillLabel(statKey, skillKey) {
  if (!skillKey) return "";

  const skills = DIGIMON_SKILLS_BY_DERIVED_STAT[statKey] ?? [];
  const skill = skills.find((entry) => entry.key === skillKey);

  return skill?.labelKey ? localize(skill.labelKey) : skillKey;
}
  async #onRollAttack(event) {
  event.preventDefault();

  const itemId = event.currentTarget.closest(".item-row").dataset.itemId;
  const item = this.actor.items.get(itemId);

  await rollAttack(this.actor, item);
 }
 async #onEndTurn(event) {
  event.preventDefault();

  await endDigimonTurn(this.actor);
}
async #onRollRecovery(event) {
  event.preventDefault();

  await rollRecovery(this.actor);
}
async _onInitiateClash(event) {
  event.preventDefault();

  await initiateDigimonClash(this.actor);
}

async _onEndClash(event) {
  event.preventDefault();

  await endDigimonClash(this.actor);
}
_onTamerDragOver(event) {
  event.preventDefault();

  const target = event.currentTarget;
  target.classList.add("drag-hover");
}

async _onTamerDrop(event) {
  event.preventDefault();

  const rawEvent = event.originalEvent ?? event;
  event.currentTarget.classList.remove("drag-hover");

  let data = {};

  try {
    data = TextEditor.getDragEventData(rawEvent);
  } catch (error) {
    console.warn("DDA | TextEditor.getDragEventData falhou, tentando leitura manual.", error);
  }

  if (!data || Object.keys(data).length === 0) {
    try {
      const rawText =
        rawEvent.dataTransfer?.getData("text/plain") ||
        rawEvent.dataTransfer?.getData("application/json");

      if (rawText) {
        data = JSON.parse(rawText);
      }
    } catch (error) {
      console.error("DDA | Não foi possível ler dados do drop manualmente:", error);
    }
  }

  console.log("DDA | Dados arrastados para Tamer:", data);

  let droppedActor = null;

  try {
    if (data.uuid) {
      const document = await fromUuid(data.uuid);

      if (document?.documentName === "Actor") {
        droppedActor = document;
      } else if (document?.actor) {
        droppedActor = document.actor;
      }
    }

    if (!droppedActor && (data.type === "Actor" || data.documentName === "Actor")) {
      droppedActor = await Actor.implementation.fromDropData(data);
    }

    if (!droppedActor && data.id) {
      droppedActor = game.actors.get(data.id);
    }
  } catch (error) {
    console.error("DDA | Erro ao resolver Actor arrastado:", error);
  }

  if (!droppedActor) {
    ui.notifications.warn(localize("DDA.Warning.CouldNotIdentifyDroppedActorSeeConsole"));
    return;
  }

  console.log("DDA | Actor resolvido como Tamer:", droppedActor);

  if (droppedActor.type !== "character") {
    ui.notifications.warn(formatI18n("DDA.Warning.TamerMustBeCharacterActor", { type: droppedActor.type }));
    return;
  }

await this.actor.update({
  "system.tamer.name": droppedActor.name,
  "system.tamer.uuid": droppedActor.uuid
});

await droppedActor.update({
  "system.partner.name": this.actor.name,
  "system.partner.uuid": this.actor.uuid,
  "system.partner.currentFormUuid": this.actor.uuid,
  "system.partner.currentFormName": this.actor.name
});

await syncTamerAndPartnerOwnership(droppedActor, this.actor);

ui.notifications.info(formatI18n("DDA.Info.DigimonAndTamerLinked", { digimon: this.actor.name, tamer: droppedActor.name }));
}

async _onOpenTamerSheet(event) {
  event.preventDefault();

  const tamerUuid = this.actor.system.tamer?.uuid;

  if (!tamerUuid) {
    ui.notifications.warn(localize("DDA.Warning.NoLinkedTamer"));
    return;
  }

  const tamer = await fromUuid(tamerUuid);

  if (!tamer) {
    ui.notifications.warn(localize("DDA.Warning.LinkedTamerNotFound"));
    return;
  }

  if (tamer.documentName !== "Actor") {
    ui.notifications.warn(localize("DDA.Warning.SavedUuidNotActor"));
    return;
  }

  if (tamer.type !== "character") {
    ui.notifications.warn(formatI18n("DDA.Warning.LinkedActorNotTamer", { type: tamer.type }));
    return;
  }

  tamer.sheet?.render(true);
}
async _onEvolveActiveSpecialForm(event) {
  event.preventDefault();

  const hybridState = this.actor.system.specialEvolutions?.hybrid?.state ?? {};
  const method = String(hybridState.method || this.actor.system.specialForm?.method || "").trim();

  if (!hybridState.active || method !== "biomerge") {
    ui.notifications.warn(localize("DDA.Warning.NoActiveBioMerge"));
    return;
  }

  const tamerUuid = hybridState.tamerUuid || this.actor.system.tamer?.uuid || this.actor.system.specialForm?.sourceTamerUuid || "";

  if (!tamerUuid) {
    ui.notifications.warn(localize("DDA.Warning.NoLinkedTamer"));
    return;
  }

  const tamer = await fromUuid(tamerUuid);

  if (!tamer || tamer.documentName !== "Actor" || tamer.type !== "character") {
    ui.notifications.warn(localize("DDA.Warning.LinkedTamerNotFound"));
    return;
  }

  await evolvePartner(tamer);
}

async _onUnlinkTamer(event) {
  event.preventDefault();

  const tamerUuid = this.actor.system.tamer?.uuid;
  const tamerName = this.actor.system.tamer?.name || localize("DDA.Actor.LinkedTamer");

  const confirmed = await Dialog.confirm({
    title: localize("DDA.Link.UnlinkPair"),
    content: `<p>${formatI18n("DDA.Link.ConfirmUnlinkPair", { digimon: `<strong>${this.actor.name}</strong>`, tamer: `<strong>${tamerName}</strong>` })}</p>`,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });

  if (!confirmed) return;

  let tamer = null;

  if (tamerUuid) {
    try {
      tamer = await fromUuid(tamerUuid);
    } catch (error) {
      console.warn("DDA | Não foi possível encontrar o Digi-Escolhido ao desvincular:", error);
    }
  }

  await this.actor.update({
    "system.tamer.name": "",
    "system.tamer.uuid": ""
  });

  if (tamer?.documentName === "Actor" && tamer.type === "character") {
await tamer.update({
  "system.partner.name": "",
  "system.partner.uuid": "",
  "system.partner.currentFormUuid": "",
  "system.partner.currentFormName": ""
});

    ui.notifications.info(formatI18n("DDA.Info.DigimonAndTamerUnlinked", { digimon: this.actor.name, tamer: tamer.name }));
    return;
  }

  ui.notifications.warn(localize("DDA.Warning.TamerClearedButActorNotFound"));
}
async _onEnergizeAction(event) {
  event.preventDefault();
  await energizeDigimon(this.actor);
}

async _onRemoveActiveEffect(event) {
  event.preventDefault();

  const effectId = event.currentTarget.dataset.effectId;
  if (!effectId) return;

  const currentEffects = foundry.utils.deepClone(this.actor.system.effects?.active ?? []);
  const updatedEffects = currentEffects.filter((effect) => effect.id !== effectId);

  await this.actor.update({
    "system.effects.active": updatedEffects
  });
}

_onEvolutionDragOver(event) {
  event.preventDefault();

  const target = event.currentTarget;
  target.classList.add("drag-hover");
}

async _onEvolutionDrop(event) {
  event.preventDefault();

  const rawEvent = event.originalEvent ?? event;
  const dropZone = event.currentTarget;
  const stageKey = dropZone.dataset.stage;

  dropZone.classList.remove("drag-hover");

  if (!stageKey) {
    ui.notifications.warn(localize("DDA.Warning.EvolutionStageNotIdentified"));
    return;
  }

  const droppedActor = await this._resolveDroppedActor(rawEvent);

  if (!droppedActor) {
    ui.notifications.warn(localize("DDA.Warning.CouldNotIdentifyDroppedActor"));
    return;
  }

  if (droppedActor.type !== "digimon") {
    ui.notifications.warn(formatI18n("DDA.Warning.EvolutionFormMustBeDigimonActor", { type: droppedActor.type }));
    return;
  }

  const currentSlot = foundry.utils.deepClone(
    foundry.utils.getProperty(this.actor.system, `evolutionLine.forms.${stageKey}`) ?? {}
  );

  const registeredForms = normalizeEvolutionSlotForms(currentSlot, stageKey);
  const formData = {
    name: droppedActor.name,
    uuid: droppedActor.uuid,
    stage: droppedActor.system.stage ?? stageKey
  };

  const existingIndex = registeredForms.findIndex((form) => form.uuid === formData.uuid);

  if (existingIndex >= 0) {
    registeredForms[existingIndex] = formData;
  } else {
    registeredForms.push(formData);
  }

  const updateData = buildEvolutionSlotUpdate(stageKey, registeredForms);

  await this.actor.update(updateData);

  ui.notifications.info(formatI18n("DDA.Info.EvolutionFormRegistered", { form: droppedActor.name, actor: this.actor.name }));
}

async _onOpenEvolutionForm(event) {
  event.preventDefault();

  const stageKey = event.currentTarget.dataset.stage;
  const formUuid = event.currentTarget.dataset.uuid ||
    foundry.utils.getProperty(this.actor.system, `evolutionLine.forms.${stageKey}.uuid`);

  if (!formUuid) {
    ui.notifications.warn(localize("DDA.Warning.NoFormRegisteredAtStage"));
    return;
  }

  const formActor = await fromUuid(formUuid);

  if (!formActor) {
    ui.notifications.warn(localize("DDA.Warning.EvolutionFormNotFound"));
    return;
  }

  if (formActor.documentName !== "Actor") {
    ui.notifications.warn(localize("DDA.Warning.SavedUuidNotActor"));
    return;
  }

  if (formActor.type !== "digimon") {
    ui.notifications.warn(formatI18n("DDA.Warning.RegisteredFormNotDigimon", { type: formActor.type }));
    return;
  }

  formActor.sheet?.render(true);
}

async _onClearEvolutionForm(event) {
  event.preventDefault();

  const stageKey = event.currentTarget.dataset.stage;
  const formUuid = event.currentTarget.dataset.uuid ?? "";

  if (!stageKey) {
    ui.notifications.warn(localize("DDA.Warning.EvolutionStageNotIdentified"));
    return;
  }

  const stageLabel = getDigimonStageLabel(stageKey, stageKey);

  const currentSlot = foundry.utils.deepClone(
    foundry.utils.getProperty(this.actor.system, `evolutionLine.forms.${stageKey}`) ?? {}
  );

  const registeredForms = normalizeEvolutionSlotForms(currentSlot, stageKey);
  const formToRemove = formUuid
    ? registeredForms.find((form) => form.uuid === formUuid)
    : null;

  const confirmContent = formUuid
    ? formatI18n("DDA.EvolutionLine.ConfirmRemoveSingleForm", {
        form: `<strong>${escapeHtml(formToRemove?.name ?? localize("DDA.Evolution.Form"))}</strong>`,
        stage: `<strong>${stageLabel}</strong>`
      })
    : formatI18n("DDA.EvolutionLine.ConfirmClearForm", {
        stage: `<strong>${stageLabel}</strong>`
      });

  const confirmed = await Dialog.confirm({
    title: formUuid
      ? localize("DDA.EvolutionLine.RemoveEvolutionForm")
      : localize("DDA.EvolutionLine.ClearEvolutionForm"),
    content: `<p>${confirmContent}</p>`,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });

  if (!confirmed) return;

  const updatedForms = formUuid
    ? registeredForms.filter((form) => form.uuid !== formUuid)
    : [];

  const updateData = buildEvolutionSlotUpdate(stageKey, updatedForms);

  await this.actor.update(updateData);

  ui.notifications.info(formatI18n("DDA.Info.EvolutionFormRemoved", { stage: stageLabel, actor: this.actor.name }));
}

_onEvolutionSolarDragOver(event) {
  event.preventDefault();

  const rawEvent = event.originalEvent ?? event;
  if (rawEvent.dataTransfer) {
    rawEvent.dataTransfer.dropEffect = "copy";
  }

  event.currentTarget.classList.add("drag-hover");
}

_onEvolutionSolarDragLeave(event) {
  event.currentTarget?.classList?.remove("drag-hover");
}

async _onEvolutionSolarDrop(event) {
  event.preventDefault();

  const rawEvent = event.originalEvent ?? event;
  const root = this.element?.[0] ?? document;
  root.querySelectorAll("[data-evolution-drop-target]").forEach((element) => element.classList.remove("drag-hover"));

  const droppedActor = await this._resolveDroppedActor(rawEvent);

  if (!droppedActor) {
    ui.notifications.warn(localize("DDA.Warning.DropActorNotIdentified"));
    return;
  }

  if (droppedActor.type !== "digimon" && droppedActor.type !== "npc") {
    ui.notifications.warn(formatI18n("DDA.Warning.PartnerMustBeDigimon", { type: droppedActor.type }));
    return;
  }

  const graph = getNormalizedEvolutionGraph(this.actor);
  const nextNode = buildEvolutionNodeFromActor(droppedActor);
  const existingIndex = graph.nodes.findIndex((node) => node.actorUuid === nextNode.actorUuid);

  if (existingIndex >= 0) {
    graph.nodes[existingIndex] = {
      ...graph.nodes[existingIndex],
      ...nextNode
    };
  } else {
    graph.nodes.push(nextNode);
  }

  graph.legacyImported = true;
  graph.removedActorUuids = (graph.removedActorUuids ?? []).filter((uuid) => uuid !== droppedActor.uuid);

  await this.actor.update({
    "system.evolutionGraph": graph,
    ...buildEvolutionLineUpdatesFromGraph(graph)
  });

  this._refreshEvolutionGraphViews();

  ui.notifications.info(formatI18n("DDA.Info.EvolutionFormRegistered", {
    form: droppedActor.name,
    stage: getDigimonStageLabel(droppedActor.system.stage ?? "child")
  }));
}

async _onCreateEvolutionEdge(event) {
  event.preventDefault();

  const eventRoot = event.currentTarget?.closest?.(".dda-digimon-sheet, .dda-evolution-graph-popout, .window-content");
  const root = eventRoot ?? this.element?.[0] ?? document;
  const from = root.querySelector('[name="evolutionEdgeFrom"]')?.value ?? this.element?.[0]?.querySelector?.('[name="evolutionEdgeFrom"]')?.value ?? "";
  const to = root.querySelector('[name="evolutionEdgeTo"]')?.value ?? this.element?.[0]?.querySelector?.('[name="evolutionEdgeTo"]')?.value ?? "";
  const method = root.querySelector('[name="evolutionEdgeMethod"]')?.value ?? this.element?.[0]?.querySelector?.('[name="evolutionEdgeMethod"]')?.value ?? "normal";

  if (method === "dark" && !getDDASetting("enableDarkEvolution")) {
    ui.notifications.warn(localize("DDA.Evolution.Blocked.DarkDisabled"));
    return;
  }

  if (!from || !to || from === to) {
    ui.notifications.warn(localize("DDA.Warning.InvalidEvolutionLink"));
    return;
  }

  const graph = getNormalizedEvolutionGraph(this.actor);
  const edgeId = generateEvolutionEdgeId(from, to, method);
  const existingIndex = graph.edges.findIndex((edge) => edge.id === edgeId);
  const nextEdge = {
    id: edgeId,
    from,
    to,
    method,
    unlocked: true
  };

  if (existingIndex >= 0) {
    graph.edges[existingIndex] = nextEdge;
  } else {
    graph.edges.push(nextEdge);
  }

  graph.legacyImported = true;

  await this.actor.update({
    "system.evolutionGraph": graph,
    ...buildEvolutionLineUpdatesFromGraph(graph)
  });

  this._refreshEvolutionGraphViews();
}

async _onRemoveEvolutionEdge(event) {
  event.preventDefault();

  const edgeId = event.currentTarget?.dataset?.edgeId ?? "";
  if (!edgeId) return;

  const graph = getNormalizedEvolutionGraph(this.actor);
  const edge = graph.edges.find((entry) => entry.id === edgeId);

  if (!edge) return;

  const fromNode = graph.nodes.find((node) => node.id === edge.from);
  const toNode = graph.nodes.find((node) => node.id === edge.to);
  const fromName = escapeHtml(fromNode?.name ?? edge.from);
  const toName = escapeHtml(toNode?.name ?? edge.to);
  const confirmed = await Dialog.confirm({
    title: localize("DDA.Button.Remove"),
    content: `<p>Remover a ligação entre <strong>${fromName}</strong> e <strong>${toName}</strong>?</p>`,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });

  if (!confirmed) return;

  graph.edges = graph.edges.filter((entry) => entry.id !== edgeId);
  graph.legacyImported = true;
  graph.removedEdgeIds = Array.from(new Set([...(graph.removedEdgeIds ?? []), edgeId]));

  await this.actor.update({
    "system.evolutionGraph": graph,
    ...buildEvolutionLineUpdatesFromGraph(graph)
  });

  this._refreshEvolutionGraphViews();
}

async _onOpenEvolutionNode(event) {
  event.preventDefault();

  const nodeId = event.currentTarget.dataset.nodeId;
  const graph = getNormalizedEvolutionGraph(this.actor);
  const node = graph.nodes.find((entry) => entry.id === nodeId);

  if (!node?.actorUuid) {
    ui.notifications.warn(localize("DDA.Warning.ChosenEvolutionFormNotFound"));
    return;
  }

  const actor = await fromUuid(node.actorUuid);

  if (!actor || actor.documentName !== "Actor") {
    ui.notifications.warn(localize("DDA.Warning.ChosenEvolutionFormNotFound"));
    return;
  }

  actor.sheet?.render(true);
}

async _onRemoveEvolutionNode(event) {
  event.preventDefault();

  const nodeId = event.currentTarget.dataset.nodeId;
  if (!nodeId) return;

  const graph = getNormalizedEvolutionGraph(this.actor);
  const node = graph.nodes.find((entry) => entry.id === nodeId);

  if (!node) return;

  if (node.actorUuid === this.actor.uuid) {
    ui.notifications.warn(localize("DDA.Warning.CannotRemoveCurrentEvolutionNode"));
    return;
  }

  const confirmed = await Dialog.confirm({
    title: localize("DDA.EvolutionGraph.RemoveNode"),
    content: `<p>${formatI18n("DDA.EvolutionGraph.ConfirmRemoveNode", {
      form: `<strong>${escapeHtml(node.name ?? localize("DDA.Evolution.Form"))}</strong>`
    })}</p>`,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });

  if (!confirmed) return;

  graph.nodes = graph.nodes.filter((entry) => entry.id !== nodeId);
  graph.edges = graph.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
  graph.legacyImported = true;
  graph.removedActorUuids = Array.from(new Set([...(graph.removedActorUuids ?? []), node.actorUuid].filter(Boolean)));

  await this.actor.update({
    "system.evolutionGraph": graph,
    ...buildEvolutionLineUpdatesFromGraph(graph)
  });

  this._refreshEvolutionGraphViews();
}

async _onClearEvolutionGraph(event) {
  event.preventDefault();

  const confirmed = await Dialog.confirm({
    title: localize("DDA.EvolutionGraph.Clear"),
    content: `<p>${localize("DDA.EvolutionGraph.ConfirmClear")}</p>`,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });

  if (!confirmed) return;

  const cleanGraph = {
    layout: { mode: "solar", nodePositions: {} },
    nodes: [buildEvolutionNodeFromActor(this.actor)],
    edges: [],
    legacyImported: true,
    removedActorUuids: [],
    removedEdgeIds: []
  };

  await this.actor.update({
    "system.evolutionGraph": cleanGraph,
    ...buildEvolutionLineUpdatesFromGraph(cleanGraph)
  });

  this._refreshEvolutionGraphViews();
}

_captureEvolutionGraphViewForRefresh(root = this.element?.[0]) {
  const current = this._getEvolutionGraphViewState();
  const elementRoot = root instanceof jQuery ? root[0] : root;
  const map = elementRoot?.querySelector?.("[data-evolution-map]");

  return {
    x: Number(current.x ?? 0),
    y: Number(current.y ?? 0),
    zoom: Number(current.zoom ?? map?.dataset?.zoom ?? this._getEvolutionGraphFocusZoom()),
    initialized: true,
    actorUuid: this.actor.uuid,
    focusedOnce: true
  };
}

_refreshEvolutionGraphViews(options = {}) {
  const preserveView = options?.preserveView
    ? {
        ...options.preserveView,
        initialized: true,
        actorUuid: this.actor.uuid,
        focusedOnce: true
      }
    : null;

  if (preserveView) this._ddaEvolutionGraphView = preserveView;

  this.render(false);

  if (preserveView) this._ddaEvolutionGraphView = preserveView;

  const popout = this._ddaEvolutionGraphPopout;
  const popoutElement = popout?.element?.[0] ?? popout?._element?.[0] ?? null;

  if (popout?.rendered && popoutElement instanceof Element && document.body.contains(popoutElement)) {
    if (preserveView) this._ddaEvolutionGraphView = preserveView;
    popout.render(false);
  }
}

async _resolveDroppedActor(rawEvent) {
  let data = {};

  try {
    data = TextEditor.getDragEventData(rawEvent);
  } catch (error) {
    console.warn("DDA | TextEditor.getDragEventData falhou, tentando leitura manual.", error);
  }

  if (!data || Object.keys(data).length === 0) {
    try {
      const rawText =
        rawEvent.dataTransfer?.getData("text/plain") ||
        rawEvent.dataTransfer?.getData("application/json");

      if (rawText) {
        data = JSON.parse(rawText);
      }
    } catch (error) {
      console.error("DDA | Não foi possível ler dados do drop manualmente:", error);
    }
  }

  console.log("DDA | Dados arrastados para Linha Evolutiva:", data);

  let droppedActor = null;

  try {
    if (data.uuid) {
      const document = await fromUuid(data.uuid);

      if (document?.documentName === "Actor") {
        droppedActor = document;
      } else if (document?.actor) {
        droppedActor = document.actor;
      }
    }

    if (!droppedActor && (data.type === "Actor" || data.documentName === "Actor")) {
      droppedActor = await Actor.implementation.fromDropData(data);
    }

    if (!droppedActor && data.id) {
      droppedActor = game.actors.get(data.id);
    }
  } catch (error) {
    console.error("DDA | Erro ao resolver Actor arrastado:", error);
  }

  return droppedActor;
}

async _onSelectMovementType(event) {
  event.preventDefault();

  const select = event.currentTarget;
  const selectedOption = select.selectedOptions?.[0];

  const movementType = select.value;
  const enabled = selectedOption?.dataset.enabled === "true";
  const total = selectedOption?.dataset.total ?? "0";

  const displayValue = enabled ? total : "—";

  const box = select.closest(".resource-box");
  const input = box?.querySelector("[data-movement-display]");

  if (input) {
    input.value = displayValue;
  }

  await this.actor.update({
    "system.currentMovementType": movementType
  });
}


_ensureAnimatedPortraitPlayback(html = this.element) {
  const root = html instanceof jQuery ? html[0] : html;
  if (!root) return;

  for (const video of root.querySelectorAll("video.dda-device-portrait")) {
    video.muted = true;
    video.loop = true;
    video.playsInline = true;

    const playPromise = video.play?.();
    if (playPromise?.catch) {
      playPromise.catch(() => {
        // Alguns navegadores só liberam autoplay depois de interação do usuário.
        // O vídeo continua configurado corretamente e toca no próximo clique/abertura.
      });
    }
  }
}

_onEditDigimonPortrait(event) {
  event.preventDefault();
  event.stopPropagation();

  if (this._ddaDigiviceDrag?.moved) return;

  const updatePortrait = async (path) => {
    if (!path) return;

    const flagScope = game.system?.id ?? "digimon-digital-adventures";

    if (isVideoPath(path)) {
      // Foundry valida actor.img como imagem estática/animada, mas não como vídeo.
      // Por isso vídeos do Digivice ficam em flag própria e não quebram o schema do ator.
      await this.actor.setFlag(flagScope, "digivicePortrait", path);
      this.render(false);
      return;
    }

    await this.actor.update({ img: path });
    await this.actor.unsetFlag(flagScope, "digivicePortrait");
    this.render(false);
  };

const FilePickerClass = getDdaFilePickerClass();

if (!FilePickerClass) {
  console.warn("DDA | FilePicker implementation is unavailable.");
  return;
}

const openPicker = (type) => {
  const picker = new FilePickerClass({
    type,
    current: this.actor.img,
    callback: updatePortrait,
    top: this.position.top + 40,
    left: this.position.left + 40
  });

  picker.render(true);
};

  try {
    // imagevideo permite escolher imagens animadas/estáticas e vídeos curtos
    // como .gif, .webm e .mp4 para o retrato do Digivice.
    openPicker("imagevideo");
  } catch (error) {
    console.warn("DDA | FilePicker imagevideo indisponível; usando image como fallback.", error);
    openPicker("image");
  }
}

_onDigiviceSheet(event) {
  event.preventDefault();
  event.stopPropagation();

  // Se estiver minimizado como Digivice, reabre visualmente a ficha antes.
  const appElement = this.element?.[0]?.closest(".window-app");
  appElement?.classList.remove("dda-digivice-collapsed");

  // Abre a Configuração de Ficha nativa do Foundry.
  // É o mesmo painel do botão de engrenagem da barra superior.
  if (typeof this._onConfigureSheet === "function") {
    return this._onConfigureSheet(event);
  }

  // Fallback para versões/ambientes em que o método herdado não esteja disponível.
const DocumentSheetConfigClass = getDdaDocumentSheetConfigClass();

if (DocumentSheetConfigClass) {
  new DocumentSheetConfigClass(this.actor, {
    top: this.position.top + 40,
    left: this.position.left + 40
  }).render(true);
  return;
}

  ui.notifications.warn(localize("DDA.Warning.CouldNotOpenSheetConfig"));
}

_onDigivicePrototypeToken(event) {
  event.preventDefault();

  try {
    if (typeof this._onConfigureToken === "function") {
      this._onConfigureToken(event);
      return;
    }

    const prototypeToken = this.actor.prototypeToken;

    if (!prototypeToken) {
      ui.notifications.warn(localize("DDA.Warning.PrototypeTokenNotFound"));
      return;
    }

    prototypeToken.sheet?.render(true);
  } catch (error) {
    console.error("DDA | Erro ao abrir Protótipo de Token:", error);
    ui.notifications.error(localize("DDA.Error.OpenPrototypeTokenSeeConsole"));
  }
}

_onDigiviceClose(event) {
  event.preventDefault();
  event.stopPropagation();

  return this.close();
}

_onDigiviceDoubleClick(event) {
  event.preventDefault();

  if (event.target.closest(".dda-device-button, .dda-device-portrait")) {
    return;
  }

  const appElement = this.element?.[0]?.closest(".window-app");
  if (!appElement) return;

  appElement.classList.toggle("dda-digivice-collapsed");
}

_onDigiviceDragStart(event) {
  if (event.button !== 0) return;
  if (event.target.closest(".dda-device-button, .dda-device-portrait")) return;

  event.preventDefault();

  const appElement = this.element?.[0]?.closest(".window-app");
  if (!appElement) return;

  const rect = appElement.getBoundingClientRect();

  this._ddaDigiviceDrag = {
    appElement,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: rect.left,
    startTop: rect.top,
    moved: false
  };

  appElement.classList.add("dda-digivice-dragging");

  document.addEventListener("pointermove", this._onDigiviceDragMoveBound ??= this._onDigiviceDragMove.bind(this));
  document.addEventListener("pointerup", this._onDigiviceDragEndBound ??= this._onDigiviceDragEnd.bind(this), { once: true });
}

_onDigiviceDragMove(event) {
  const drag = this._ddaDigiviceDrag;
  if (!drag?.appElement) return;

  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;

  if (Math.abs(dx) + Math.abs(dy) > 3) {
    drag.moved = true;
  }

  const left = drag.startLeft + dx;
  const top = drag.startTop + dy;

  drag.appElement.style.left = `${left}px`;
  drag.appElement.style.top = `${top}px`;
}

_onDigiviceDragEnd(event) {
  document.removeEventListener("pointermove", this._onDigiviceDragMoveBound);

  const drag = this._ddaDigiviceDrag;
  if (!drag?.appElement) return;

  drag.appElement.classList.remove("dda-digivice-dragging");

  const rect = drag.appElement.getBoundingClientRect();

  if (typeof this.setPosition === "function") {
    this.setPosition({
      left: rect.left,
      top: rect.top
    });
  }

  this._ddaDigiviceDrag = null;
}

}

function normalizeEvolutionSlotForms(slot, defaultStageKey = "") {
  if (!slot) return [];

  if (Array.isArray(slot)) {
    return slot.map((form) => normalizeEvolutionFormData(form, defaultStageKey)).filter((form) => form.uuid);
  }

  const forms = [];

  if (Array.isArray(slot.forms)) {
    forms.push(...slot.forms.map((form) => normalizeEvolutionFormData(form, defaultStageKey)));
  }

  if (slot.uuid) {
    const legacyForm = normalizeEvolutionFormData(slot, defaultStageKey);

    if (!forms.some((form) => form.uuid === legacyForm.uuid)) {
      forms.unshift(legacyForm);
    }
  }

  return forms.filter((form) => form.uuid);
}

function normalizeEvolutionFormData(form, defaultStageKey = "") {
  return {
    name: form?.name ?? "",
    displayName: form?.displayName ?? form?.species ?? form?.name ?? "",
    species: form?.species ?? form?.name ?? "",
    uuid: form?.uuid ?? "",
    stage: form?.stage ?? defaultStageKey,
    img: form?.img ?? ""
  };
}

function buildEvolutionSlotUpdate(stageKey, forms) {
  const cleanForms = Array.isArray(forms)
    ? forms.map((form) => normalizeEvolutionFormData(form, stageKey)).filter((form) => form.uuid)
    : [];

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

function buildEvolutionLineUpdatesFromGraph(graph = {}) {
  const updates = {};
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];

  for (const stageKey of getEvolutionStageKeys()) {
    const stageForms = nodes
      .filter((node) => {
        const actorUuid = node.actorUuid ?? node.uuid ?? "";
        if (!actorUuid) return false;
        return String(node.stage ?? "child") === stageKey;
      })
      .map((node) => normalizeEvolutionFormData({
        name: node.name ?? "",
        uuid: node.actorUuid ?? node.uuid ?? "",
        stage: node.stage ?? stageKey
      }, stageKey));

    Object.assign(updates, buildEvolutionSlotUpdate(stageKey, stageForms));
  }

  return updates;
}


function getEvolutionStageKeys() {
  return ["baby1", "baby2", "child", "adult", "perfect", "ultimate", "ultimatePlus"];
}

function getEvolutionStageIndex(stageKey) {
  const index = getEvolutionStageKeys().indexOf(stageKey);
  return index >= 0 ? index : 2;
}


function getDigimonSpeciesLabel(actor, node = {}) {
  const system = actor?.system ?? {};

  return String(
    node.species ||
    node.displayName ||
    system.profile?.species ||
    system.species ||
    system.identity?.species ||
    system.details?.species ||
    ""
  ).trim();
}

function getEvolutionMethodOptions() {
  const options = [
    { key: "normal", label: getEvolutionMethodLabel("normal") },
    { key: "slide", label: getEvolutionMethodLabel("slide") },
    { key: "warp", label: getEvolutionMethodLabel("warp") },
    { key: "modeChange", label: getEvolutionMethodLabel("modeChange") },
    { key: "burst", label: getEvolutionMethodLabel("burst") },
    { key: "blast", label: getEvolutionMethodLabel("blast") },
    { key: "armor", label: getEvolutionMethodLabel("armor") },
    { key: "jogress", label: getEvolutionMethodLabel("jogress") },
    { key: "hybrid", label: getEvolutionMethodLabel("hybrid") },
    { key: "biomerge", label: getEvolutionMethodLabel("biomerge") },
    { key: "mindLink", label: getEvolutionMethodLabel("mindLink") }
  ];

  if (getDDASetting("enableDarkEvolution")) {
    options.push({ key: "dark", label: getEvolutionMethodLabel("dark") });
  }

  return options;
}

function getEvolutionMethodLabel(method) {
  const labels = {
    normal: "DDA.Evolution.Method.Normal",
    slide: "DDA.Evolution.Method.Slide",
    warp: "DDA.Evolution.Method.Warp",
    modeChange: "DDA.Evolution.Method.ModeChange",
    burst: "DDA.Evolution.Method.Burst",
    blast: "DDA.Evolution.Method.Blast",
    armor: "DDA.Evolution.Method.Armor",
    jogress: "DDA.Evolution.Method.Jogress",
    hybrid: "DDA.Evolution.Method.Hybrid",
    biomerge: "DDA.Evolution.Method.BioMerge",
    mindLink: "DDA.Evolution.Method.MindLink",
    dark: "DDA.Evolution.Method.Dark"
  };

  return localize(labels[method] ?? labels.normal);
}

function getNormalizedEvolutionGraph(actor) {
  const sourceGraph = foundry.utils.deepClone(actor.system.evolutionGraph ?? {});
  const removedActorUuids = new Set(Array.isArray(sourceGraph.removedActorUuids) ? sourceGraph.removedActorUuids : []);
  const removedEdgeIds = new Set(Array.isArray(sourceGraph.removedEdgeIds) ? sourceGraph.removedEdgeIds : []);
  const legacyImported = Boolean(sourceGraph.legacyImported);
  const graph = {
    layout: sourceGraph.layout ?? { mode: "solar" },
    nodes: Array.isArray(sourceGraph.nodes) ? sourceGraph.nodes : [],
    edges: Array.isArray(sourceGraph.edges) ? sourceGraph.edges : [],
    legacyImported,
    removedActorUuids: Array.from(removedActorUuids),
    removedEdgeIds: Array.from(removedEdgeIds)
  };

  const ensureNode = (formData, { force = false } = {}) => {
    if (!formData?.uuid && !formData?.actorUuid) return;

    const actorUuid = formData.actorUuid ?? formData.uuid;
    if (!force && removedActorUuids.has(actorUuid)) return;
    if (graph.nodes.some((node) => (node.actorUuid ?? node.uuid) === actorUuid)) return;

    graph.nodes.push({
      id: formData.id ?? generateEvolutionNodeId(actorUuid),
      actorUuid,
      name: formData.name ?? "",
      displayName: formData.displayName ?? formData.species ?? formData.name ?? "",
      species: formData.species ?? formData.name ?? "",
      stage: formData.stage ?? "child",
      unlocked: formData.unlocked ?? true,
      hidden: formData.hidden ?? false,
      img: formData.img ?? ""
    });
  };

  ensureNode(buildEvolutionNodeFromActor(actor), { force: true });

  const primaryLegacyNodes = [];

  if (!legacyImported) {
    const legacyForms = actor.system.evolutionLine?.forms ?? {};

    for (const stageKey of getEvolutionStageKeys()) {
      const slot = legacyForms[stageKey];
      const forms = normalizeEvolutionSlotForms(slot, stageKey);

      if (slot?.uuid && !removedActorUuids.has(slot.uuid)) {
        primaryLegacyNodes.push(generateEvolutionNodeId(slot.uuid));
      }

      for (const form of forms) {
        ensureNode(form);
      }
    }

    if (!graph.edges.length && primaryLegacyNodes.length > 1) {
      for (let index = 0; index < primaryLegacyNodes.length - 1; index += 1) {
        const edgeId = generateEvolutionEdgeId(primaryLegacyNodes[index], primaryLegacyNodes[index + 1], "normal");
        if (removedEdgeIds.has(edgeId)) continue;

        graph.edges.push({
          id: edgeId,
          from: primaryLegacyNodes[index],
          to: primaryLegacyNodes[index + 1],
          method: "normal",
          unlocked: true
        });
      }
    }
  }

  const nodeByActorUuid = new Map();

  for (const node of graph.nodes) {
    const actorUuid = node.actorUuid ?? node.uuid ?? "";
    if (!actorUuid) continue;
    if (actorUuid !== actor.uuid && removedActorUuids.has(actorUuid)) continue;

    const normalizedNode = {
      id: node.id ?? generateEvolutionNodeId(actorUuid),
      actorUuid,
      name: node.name ?? "",
      displayName: node.displayName ?? node.species ?? node.name ?? "",
      species: node.species ?? node.name ?? "",
      stage: node.stage ?? "child",
      unlocked: node.unlocked ?? true,
      hidden: node.hidden ?? false,
      img: node.img ?? ""
    };

    nodeByActorUuid.set(actorUuid, {
      ...nodeByActorUuid.get(actorUuid),
      ...normalizedNode
    });
  }

  graph.nodes = Array.from(nodeByActorUuid.values());
  const validNodeIds = new Set(graph.nodes.map((node) => node.id));
  const edgeById = new Map();

  for (const edge of graph.edges) {
    const method = edge.method ?? "normal";
    const id = edge.id ?? generateEvolutionEdgeId(edge.from, edge.to, method);
    if (removedEdgeIds.has(id)) continue;
    if (!edge.from || !edge.to || edge.from === edge.to) continue;
    if (!validNodeIds.has(edge.from) || !validNodeIds.has(edge.to)) continue;

    edgeById.set(id, {
      id,
      from: edge.from,
      to: edge.to,
      method,
      unlocked: edge.unlocked ?? true
    });
  }

  graph.edges = Array.from(edgeById.values());

  return graph;
}


function getEvolutionGraphRingRadiusForData(graph = {}, stageIndex = 0) {
  const stageKey = getEvolutionStageKeys()[stageIndex];
  const ring = Array.isArray(graph.rings)
    ? graph.rings.find((entry) => entry.key === stageKey)
    : null;

  return Number(ring?.radius ?? 0);
}

function constrainEvolutionNodePositionToStage({ x, y, stageIndex = 2, centerX = 0, centerY = 0, getRingRadius }) {
  const safeStageIndex = Math.max(0, Number(stageIndex ?? 0));
  const safeGetRingRadius = typeof getRingRadius === "function"
    ? getRingRadius
    : () => 0;

  const targetRadius = Math.max(0, Number(safeGetRingRadius(safeStageIndex) ?? 0));
  const previousRadius = Math.max(0, Number(safeGetRingRadius(Math.max(0, safeStageIndex - 1)) ?? 0));
  const nextRadius = Math.max(targetRadius, Number(safeGetRingRadius(safeStageIndex + 1) ?? 0));
  const dx = Number(x ?? centerX) - centerX;
  const dy = Number(y ?? centerY) - centerY;
  const distance = Math.hypot(dx, dy);
  const angle = distance > 0.0001 ? Math.atan2(dy, dx) : getDefaultEvolutionAngle(safeStageIndex);

  if (safeStageIndex <= 0 || targetRadius <= 0) {
    const outerLimit = Math.max(36, Number(safeGetRingRadius(1) ?? 118) * 0.48);
    const clampedDistance = Math.clamp(distance, 0, outerLimit);

    return {
      x: centerX + Math.cos(angle) * clampedDistance,
      y: centerY + Math.sin(angle) * clampedDistance
    };
  }

  const inwardGap = Math.max(24, targetRadius - previousRadius);
  const outwardGap = Math.max(24, nextRadius - targetRadius || inwardGap);
  const inwardBand = Math.max(28, Math.min(54, inwardGap / 2 - 8));
  const outwardBand = Math.max(28, Math.min(54, outwardGap / 2 - 8));
  const minDistance = Math.max(0, targetRadius - inwardBand);
  const maxDistance = targetRadius + outwardBand;
  const clampedDistance = Math.clamp(distance || targetRadius, minDistance, maxDistance);

  return {
    x: centerX + Math.cos(angle) * clampedDistance,
    y: centerY + Math.sin(angle) * clampedDistance
  };
}

function buildEvolutionNodeFromActor(actor) {
  const system = actor?.system ?? {};
  const species = String(system.species || system.names?.original || actor.name || "").trim();
  const displayName = getDigimonDisplayName(actor) || species || actor.name;

  return {
    id: generateEvolutionNodeId(actor.uuid),
    actorUuid: actor.uuid,
    sourceId: system.sourceId ?? "",
    name: actor.name,
    displayName,
    species,
    originalName: system.names?.original ?? species,
    dubName: system.names?.dub ?? "",
    aliases: Array.isArray(system.names?.aliases) ? system.names.aliases : [],
    stage: system.stage ?? "child",
    unlocked: true,
    hidden: false,
    img: actor.img ?? ""
  };
}

function generateEvolutionNodeId(actorUuid) {
  return `node_${String(actorUuid ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

function generateEvolutionEdgeId(from, to, method = "normal") {
  return `edge_${String(from)}_${String(to)}_${String(method)}`
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}



async function applyAutomatedQualityUseSideEffects(actor, item) {
  if (!actor || !item || item.type !== "quality") return;

  if (qualityMatches(item, "reload")) {
    const tn = 18 - getActorDerivedStat(actor, "ram");
    const result = await rollDerivedCheck(actor, "bit", {
      skillKey: "precision",
      tn,
      title: localizeQ("DDA.QualityAutomation.Reload.Title", "Reload")
    });
    if (result?.success) {
      await clearUseState(actor, "ammo");
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="dda-chat-card dda-effect-card effect-positive"><h2>${item.name}</h2><p>${localizeQ("DDA.QualityAutomation.Reload.Success", "[AMMO] use has been restored for this combat.")}</p></div>`
      });
    }
    return;
  }

  if (qualityMatches(item, "battleCry")) {
    const sv = await promptNumber(localizeQ("DDA.QualityAutomation.BattleCry.HighestSV", "Highest enemy SV"), getActorSv(actor));
    if (sv === null) return;
    const enemyCount = await promptNumber(localizeQ("DDA.QualityAutomation.BattleCry.EnemyCount", "Number of enemies"), 1);
    if (enemyCount === null) return;
    const tnIncrease = Number(actor.system?.combat?.qualityAttackUses?.battleCry?.tnIncrease ?? 0);
    const tn = 10 + Number(sv) + Number(enemyCount) + tnIncrease;
    const result = await rollDerivedCheck(actor, "dos", { skillKey: "bravery", tn, title: localizeQ("DDA.QualityAutomation.BattleCry.Title", "Battle Cry") });
    const bastion = result?.criticalSuccess || result?.success ? 2 : 1;
    await setUseState(actor, "battleCry", item.id, { tnIncrease: tnIncrease + 6 });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="dda-chat-card dda-effect-card effect-positive"><h2>${item.name}</h2><p>${localizeQ("DDA.QualityAutomation.BattleCry.Result", "Allies in DOS range gain [BASTION {value}] for 1 round.", { value: bastion })}</p></div>`
    });
    return;
  }

  if (qualityMatches(item, "watchfulHunter")) {
    const targetToken = game.user.targets.first();
    if (!targetToken?.actor) {
      ui.notifications.warn(localizeQ("DDA.Warning.SelectTargetBeforeQuality", "Select a target before using this Quality."));
      return;
    }
    const tn = 12 + getActorDerivedStat(targetToken.actor, "ram");
    const result = await rollDerivedCheck(actor, "dos", { skillKey: "awareness", tn, title: localizeQ("DDA.QualityAutomation.WatchfulHunter.Title", "Watchful Hunter") });
    if (result?.success) {
      const mode = result.criticalSuccess ? "all" : "melee";
      await setUseState(actor, "watchfulHunter", targetToken.actor.uuid, {
        targetUuid: targetToken.actor.uuid,
        mode,
        bonus: 2,
        expires: "startOfNextTurn"
      });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="dda-chat-card dda-effect-card effect-positive"><h2>${item.name}</h2><p>${localizeQ("DDA.QualityAutomation.WatchfulHunter.Success", "+2 Accuracy against the target. Critical Success also applies to ranged attacks.")}</p></div>`
      });
    }
    return;
  }

  if (qualityMatches(item, "overdrive")) {
    const tnIncrease = Number(actor.system?.combat?.qualityAttackUses?.overdrive?.tnIncrease ?? 0);
    const tn = 15 - getActorDerivedStat(actor, "ram") + tnIncrease;
    const result = await rollDerivedCheck(actor, "cpu", { skillKey: "athletics", tn, title: localizeQ("DDA.QualityAutomation.Overdrive.Title", "Overdrive") });
    await setUseState(actor, "overdrive", item.id, { tnIncrease: tnIncrease + 6, success: Boolean(result?.success), criticalSuccess: Boolean(result?.criticalSuccess) });
    if (result?.success) {
      const currentActions = Number(actor.system?.combat?.actions?.value ?? 0);
      await actor.update({ "system.combat.actions.value": currentActions + 1 });
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="dda-chat-card dda-effect-card effect-positive"><h2>${item.name}</h2><p>${localizeQ("DDA.QualityAutomation.Overdrive.Success", "[HASTE] granted for this turn. Add/track the end-of-turn Dodge penalty if the check was not a Critical Success.")}</p></div>` });
    }
    return;
  }

  if (qualityMatches(item, "dataScan")) {
    const targetToken = game.user.targets.first();
    if (!targetToken?.actor) {
      ui.notifications.warn(localizeQ("DDA.Warning.SelectTargetBeforeQuality", "Select a target before using this Quality."));
      return;
    }
    const tn = 10 + getActorDerivedStat(targetToken.actor, "dos");
    const result = await rollDerivedCheck(actor, "bit", { skillKey: "knowledge", tn, title: localizeQ("DDA.QualityAutomation.DataScan.Title", "Data Scan") });
    if (result?.success) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="dda-chat-card dda-effect-card effect-special"><h2>${item.name}</h2><p>${localizeQ("DDA.QualityAutomation.DataScan.Success", "Choose one Data Scan reveal from the Quality text. Critical Success grants one additional reveal.")}</p></div>`
      });
    }
    return;
  }
}

async function promptNumber(title, value = 0) {
  return await new Promise((resolve) => {
    new Dialog({
      title,
      content: `<form><div class="form-group"><label>${title}</label><input type="number" name="value" value="${Number(value ?? 0)}" /></div></form>`,
      buttons: {
        ok: { label: localize("DDA.Button.Confirm"), callback: (html) => resolve(Number(html.find("[name='value']").val() ?? 0)) },
        cancel: { label: localize("DDA.Button.Cancel"), callback: () => resolve(null) }
      },
      default: "ok",
      close: () => resolve(null)
    }).render(true);
  });
}

function getQualityActionCostLabel(value, batteryCost = 1) {
  const labels = {
    free: localize("DDA.ActionCost.Free"),
    reaction: localize("DDA.ActionCost.Reaction"),
    "1": localize("DDA.ActionCost.OneAction"),
    "2": localize("DDA.ActionCost.TwoActions"),
    battery: formatI18n("DDA.ActionCost.Battery", { amount: batteryCost }),
    special: localize("DDA.ActionCost.Special")
  };

  return labels[value] ?? value;
}

function getQualityFrequencyLabel(value) {
  const labels = {
    always: localize("DDA.Frequency.Always"),
    oncePerTurn: localize("DDA.Frequency.OncePerTurn"),
    oncePerRound: localize("DDA.Frequency.OncePerRound"),
    oncePerScene: localize("DDA.Frequency.OncePerScene"),
    oncePerSession: localize("DDA.Frequency.OncePerSession"),
    limited: localize("DDA.Frequency.Limited"),
    special: localize("DDA.Frequency.Special")
  };

  return labels[value] ?? value;
}

async function rechargeQualityUses(actor, rechargeType) {
  const normalizedRechargeType = normalizeRechargeType(rechargeType);
  const entries = [];

  for (const item of actor.items) {
    if (item.type !== "quality") continue;
    if (!item.system.uses?.enabled) continue;

    const itemRechargeType = normalizeRechargeType(item.system.uses?.recharge);

    if (itemRechargeType !== normalizedRechargeType) continue;

    const currentValue = Number(item.system.uses.value ?? 0);
    const maxValue = Number(item.system.uses.max ?? 0);

    if (maxValue <= 0) continue;
    if (currentValue >= maxValue) continue;

    await item.update({
      "system.uses.value": maxValue
    });

    entries.push({
      id: item.id,
      name: item.name,
      oldValue: currentValue,
      newValue: maxValue,
      maxValue,
      recharge: item.system.uses?.recharge
    });
  }

  return {
    changed: entries.length > 0,
    entries
  };
}



function normalizeRechargeType(value) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const aliases = {
    turn: "turn",
    turno: "turn",

    round: "round",
    rodada: "round",

    scene: "scene",
    cena: "scene",

    session: "session",
    sessao: "session",

    rest: "rest",
    descanso: "rest",

    special: "special",
    especial: "special"
  };

  return aliases[key] ?? key;
}

function getQualityRechargeLabel(value) {
  const labels = {
    scene: localize("DDA.Time.Scene"),
    session: localize("DDA.Time.Session"),
    special: localize("DDA.Time.Special")
  };

  return labels[value] ?? value;
}

function getDigimonStageLabel(stageKey, fallback = "") {
  return getConfiguredDigimonStageLabel(stageKey, { fallback });
}

function buildEvolutionPrimaryParentMap(nodes = [], edges = []) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incomingByNode = new Map();

  for (const edge of edges) {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) continue;

    if (!incomingByNode.has(to.id)) incomingByNode.set(to.id, []);
    incomingByNode.get(to.id).push({ edge, from, to });
  }

  const parentByNode = new Map();

  for (const node of nodes) {
    const incoming = incomingByNode.get(node.id) ?? [];
    if (!incoming.length) continue;

    const sorted = [...incoming].sort((a, b) => {
      const aForward = a.from.stageIndex <= node.stageIndex ? 0 : 1;
      const bForward = b.from.stageIndex <= node.stageIndex ? 0 : 1;
      if (aForward !== bForward) return aForward - bForward;

      const aDistance = Math.abs(node.stageIndex - a.from.stageIndex);
      const bDistance = Math.abs(node.stageIndex - b.from.stageIndex);
      if (aDistance !== bDistance) return aDistance - bDistance;

      const methodWeight = {
        normal: 0,
        armor: 1,
        slide: 2,
        modeChange: 3,
        warp: 4,
        jogress: 5,
        dark: 6
      };

      return (methodWeight[a.edge.method] ?? 9) - (methodWeight[b.edge.method] ?? 9);
    });

    parentByNode.set(node.id, sorted[0].from.id);
  }

  return parentByNode;
}

function buildEvolutionChildrenMap(nodes = [], parentByNode = new Map()) {
  const childrenByParent = new Map(nodes.map((node) => [node.id, []]));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  for (const [nodeId, parentId] of parentByNode.entries()) {
    const child = nodeMap.get(nodeId);
    const parent = nodeMap.get(parentId);
    if (!child || !parent) continue;

    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(child);
  }

  for (const children of childrenByParent.values()) {
    children.sort((a, b) => {
      const stageDifference = a.stageIndex - b.stageIndex;
      if (stageDifference !== 0) return stageDifference;

      return String(a.displayName ?? a.name ?? "").localeCompare(String(b.displayName ?? b.name ?? ""), game.i18n.lang);
    });
  }

  return childrenByParent;
}

function buildEvolutionBranchAngles(nodes = [], childrenByParent = new Map(), parentByNode = new Map(), focusActorUuid = "") {
  const angleByNode = new Map();
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const focusNode = nodes.find((node) => node.actorUuid === focusActorUuid);
  const roots = nodes
    .filter((node) => !parentByNode.has(node.id))
    .sort((a, b) => {
      if (a.id === focusNode?.id) return -1;
      if (b.id === focusNode?.id) return 1;

      const stageDifference = a.stageIndex - b.stageIndex;
      if (stageDifference !== 0) return stageDifference;

      return String(a.displayName ?? a.name ?? "").localeCompare(String(b.displayName ?? b.name ?? ""), game.i18n.lang);
    });

  if (!roots.length && focusNode) roots.push(focusNode);
  if (!roots.length && nodes.length) roots.push(nodes[0]);

  const getWeight = (node, seen = new Set()) => {
    if (!node || seen.has(node.id)) return 0;
    seen.add(node.id);

    const children = childrenByParent.get(node.id) ?? [];
    if (!children.length) return 1;

    return Math.max(1, children.reduce((total, child) => total + getWeight(child, new Set(seen)), 0));
  };

  const totalWeight = Math.max(1, roots.reduce((total, root) => total + getWeight(root), 0));
  const totalArc = roots.length <= 1 ? Math.PI * 0.12 : Math.PI * 1.85;
  const startAngle = -Math.PI / 2 - totalArc / 2;
  let cursor = startAngle;

  const assignBranch = (node, centerAngle, sectorWidth, depth = 0, seen = new Set()) => {
    if (!node || seen.has(node.id)) return;
    seen.add(node.id);

    const inheritedAngle = Number.isFinite(centerAngle) ? centerAngle : getDefaultEvolutionAngle(node.stageIndex);
    const depthDrift = depth === 0 ? 0 : Math.sin((node.stageIndex + depth) * 1.7) * 0.035;
    angleByNode.set(node.id, normalizeEvolutionAngle(inheritedAngle + depthDrift));

    const children = childrenByParent.get(node.id) ?? [];
    if (!children.length) return;

    const childWeights = children.map((child) => Math.max(1, getWeight(child, new Set(seen))));
    const totalChildWeight = childWeights.reduce((total, weight) => total + weight, 0);
    const childArc = Math.min(Math.max(0.34, sectorWidth * 0.86, children.length * 0.24), Math.PI * 0.95);
    let childCursor = inheritedAngle - childArc / 2;

    children.forEach((child, index) => {
      const childShare = childArc * (childWeights[index] / totalChildWeight);
      const childCenter = childCursor + childShare / 2;
      childCursor += childShare;

      // Se o filho pula um estágio ou divide o mesmo pai com outros ramos, abre mais o ângulo.
      const stageGap = Math.max(1, Math.abs((child.stageIndex ?? 0) - (node.stageIndex ?? 0)));
      const siblingBias = children.length > 1
        ? (index - (children.length - 1) / 2) * Math.min(0.20, 0.08 * stageGap)
        : 0;

      assignBranch(child, childCenter + siblingBias, Math.max(0.22, childShare), depth + 1, new Set(seen));
    });
  };

  roots.forEach((root) => {
    const rootWeight = Math.max(1, getWeight(root));
    const rootShare = totalArc * (rootWeight / totalWeight);
    const rootCenter = roots.length <= 1 ? -Math.PI / 2 : cursor + rootShare / 2;
    cursor += rootShare;

    assignBranch(root, rootCenter, Math.max(0.36, rootShare), 0);
  });

  // Qualquer nó fora de uma árvore dirigida ainda recebe um ângulo previsível.
  for (const node of nodes) {
    if (angleByNode.has(node.id)) continue;
    const fallbackAngle = getDefaultEvolutionAngle(node.stageIndex) + (nodeMap.size % 7) * 0.05;
    angleByNode.set(node.id, normalizeEvolutionAngle(fallbackAngle));
  }

  return angleByNode;
}

function getDefaultEvolutionAngle(stageIndex = 2) {
  return -Math.PI / 2 + (stageIndex % 2 === 0 ? 0 : Math.PI / 8);
}

function normalizeEvolutionAngle(angle = 0) {
  let value = Number(angle ?? 0);
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

function resolveEvolutionAngleOverlap(angle, usedAngles = [], stageIndex = 2, radius = 0) {
  if (!usedAngles.length) return angle;

  const minSeparation = radius <= 0
    ? 0.42
    : Math.min(0.42, Math.max(0.13, 74 / Math.max(radius, 74)));

  let candidate = angle;
  let step = 0;

  const tooClose = (value) => usedAngles.some((used) => Math.abs(normalizeEvolutionAngle(value - used)) < minSeparation);

  while (tooClose(candidate) && step < 18) {
    step += 1;
    const direction = step % 2 === 0 ? -1 : 1;
    const magnitude = Math.ceil(step / 2) * minSeparation;
    candidate = angle + direction * magnitude;
  }

  return normalizeEvolutionAngle(candidate + Math.sin((stageIndex + usedAngles.length) * 2.1) * 0.015);
}

function getEvolutionHashSign(value = "") {
  const text = String(value ?? "");
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash) % 2 === 0 ? 1 : -1;
}

function getDistanceFromPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= 0.0001) return Math.hypot(px - ax, py - ay);

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const projectionX = ax + t * dx;
  const projectionY = ay + t * dy;

  return Math.hypot(px - projectionX, py - projectionY);
}

function buildEvolutionEdgeGeometry(from, to, method = "normal", edgeId = "", allNodes = []) {
  const x1 = Number(from?.x ?? 0);
  const y1 = Number(from?.y ?? 0);
  const x2 = Number(to?.x ?? 0);
  const y2 = Number(to?.y ?? 0);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.max(1, Math.hypot(dx, dy));

  const nodeRadiusByMethod = {
    normal: 36,
    slide: 37,
    warp: 40,
    modeChange: 38,
    armor: 40,
    jogress: 41,
    dark: 44
  };

  const nodeRadius = nodeRadiusByMethod[method] ?? 36;
  const startOffset = Math.min(nodeRadius, distance / 3);
  const endOffset = Math.min(nodeRadius, distance / 3);
  const sx = x1 + (dx / distance) * startOffset;
  const sy = y1 + (dy / distance) * startOffset;
  const ex = x2 - (dx / distance) * endOffset;
  const ey = y2 - (dy / distance) * endOffset;

  const curveStrengthByMethod = {
    // Mantém as linhas comuns mais discretas; a dramatização forte fica para Dark Evolution.
    normal: 0.035,
    slide: 0.07,
    warp: 0.10,
    modeChange: 0.085,
    armor: 0.095,
    jogress: 0.11,
    dark: 0.34
  };

  const perpendicularX = -dy / distance;
  const perpendicularY = dx / distance;
  let sign = getEvolutionHashSign(edgeId || `${from?.id}-${to?.id}-${method}`);
  let curveOffset = Math.min(method === "dark" ? 130 : 58, distance * (curveStrengthByMethod[method] ?? 0.06));

  const blockers = allNodes.filter((node) => {
    if (!node || node.id === from?.id || node.id === to?.id) return false;
    const blockerDistance = getDistanceFromPointToSegment(Number(node.x ?? 0), Number(node.y ?? 0), sx, sy, ex, ey);
    return blockerDistance < 58;
  });

  if (blockers.length) {
    const blockerBias = blockers.reduce((total, node) => {
      const vx = Number(node.x ?? 0) - sx;
      const vy = Number(node.y ?? 0) - sy;
      return total + Math.sign(vx * perpendicularX + vy * perpendicularY || sign);
    }, 0);

    sign = blockerBias >= 0 ? -1 : 1;
    curveOffset += method === "dark"
      ? Math.min(80, blockers.length * 28)
      : Math.min(36, blockers.length * 14);
  }

  const midX = (sx + ex) / 2;
  const midY = (sy + ey) / 2;
  const c1x = sx + dx * 0.28 + perpendicularX * curveOffset * sign;
  const c1y = sy + dy * 0.28 + perpendicularY * curveOffset * sign;
  const c2x = sx + dx * 0.72 + perpendicularX * curveOffset * sign;
  const c2y = sy + dy * 0.72 + perpendicularY * curveOffset * sign;

  if (method !== "dark") {
    const cx = midX + perpendicularX * curveOffset * sign;
    const cy = midY + perpendicularY * curveOffset * sign;
    const path = `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;

    if (method === "biomerge") {
      const strandOffset = Math.min(10, Math.max(5, distance * 0.018));
      const ax = perpendicularX * strandOffset;
      const ay = perpendicularY * strandOffset;

      const pathA = `M ${(sx + ax).toFixed(1)} ${(sy + ay).toFixed(1)} Q ${(cx + ax).toFixed(1)} ${(cy + ay).toFixed(1)} ${(ex + ax).toFixed(1)} ${(ey + ay).toFixed(1)}`;
      const pathB = `M ${(sx - ax).toFixed(1)} ${(sy - ay).toFixed(1)} Q ${(cx - ax).toFixed(1)} ${(cy - ay).toFixed(1)} ${(ex - ax).toFixed(1)} ${(ey - ay).toFixed(1)}`;

      return {
        x1: sx,
        y1: sy,
        x2: ex,
        y2: ey,
        cx,
        cy,
        path,
        pathA,
        pathB
      };
    }

    return {
      x1: sx,
      y1: sy,
      x2: ex,
      y2: ey,
      cx,
      cy,
      path
    };
  }

  if (method === "dark") {
    const slashOffset = curveOffset * 0.42;
    const mx = midX + perpendicularX * curveOffset * sign;
    const my = midY + perpendicularY * curveOffset * sign;
    const kx = midX - perpendicularX * slashOffset * sign;
    const ky = midY - perpendicularY * slashOffset * sign;

    return {
      x1: sx,
      y1: sy,
      x2: ex,
      y2: ey,
      cx: mx,
      cy: my,
      path: `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)} ${kx.toFixed(1)} ${ky.toFixed(1)} S ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`
    };
  }

  return {
    x1: sx,
    y1: sy,
    x2: ex,
    y2: ey,
    cx: midX + perpendicularX * curveOffset * sign,
    cy: midY + perpendicularY * curveOffset * sign,
    path: `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${(midX + perpendicularX * curveOffset * sign).toFixed(1)} ${(midY + perpendicularY * curveOffset * sign).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`
  };
}

function hasEvolutionGraphChange(changes = {}) {
  if (!changes || typeof changes !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(changes, "system.evolutionGraph")) return true;
  if (foundry.utils.hasProperty(changes, "system.evolutionGraph")) return true;

  const systemChanges = changes.system ?? {};
  if (Object.prototype.hasOwnProperty.call(systemChanges, "evolutionGraph")) return true;

  return Object.keys(changes).some((key) => key.startsWith("system.evolutionGraph"));
}

class DDAEvolutionGraphPopout extends Application {
  constructor(sheet, options = {}) {
    super(options);
    this.sheet = sheet;
    this.actor = sheet.actor;
    this._actorUpdateHook = Hooks.on("updateActor", this._onActorUpdated.bind(this));
    this._pendingGraphRefresh = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "dda-evolution-graph-popout",
      title: localize("DDA.Evolution.GraphPopoutTitle"),
      width: 760,
      height: 620,
      resizable: true,
      classes: ["dda", "dda-evolution-graph-popout-window"]
    });
  }

  get title() {
    return `${localize("DDA.Evolution.GraphPopoutTitle")} — ${this.actor?.name ?? "Digimon"}`;
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    context.evolutionGraph = this.sheet._getEvolutionGraphData();
    return context;
  }

  async _renderInner(data) {
    return $(this._buildGraphHtml(data.evolutionGraph));
  }

  activateListeners(html) {
    super.activateListeners(html);

    const root = html instanceof jQuery ? html[0] : html;
    if (!root) return;

    this.sheet._applyEvolutionSolarDynamicStyles(root);

    html.find("[data-evolution-popout-close]").on("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    });

    html.find("[data-evolution-zoom]").on("click", this.sheet._onEvolutionGraphZoom.bind(this.sheet));
    html.find("[data-evolution-viewport]").on("wheel", this.sheet._onEvolutionGraphWheel.bind(this.sheet));
    html.find("[data-evolution-viewport]").on("pointerdown", this.sheet._onEvolutionGraphPanStart.bind(this.sheet));
    html.find(".dda-evolution-node").on("pointerdown", this.sheet._onEvolutionNodeDragStart.bind(this.sheet));
    html.find("[data-evolution-reset-node-layout]").on("click", this.sheet._onResetEvolutionNodeLayout.bind(this.sheet));
    html.find("[data-evolution-drop-target]").on("dragover", this.sheet._onEvolutionSolarDragOver.bind(this.sheet));
    html.find("[data-evolution-drop-target]").on("dragleave", this.sheet._onEvolutionSolarDragLeave.bind(this.sheet));
    html.find("[data-evolution-drop-target]").on("drop", this.sheet._onEvolutionSolarDrop.bind(this.sheet));
    html.find(".create-evolution-edge").on("click", this.sheet._onCreateEvolutionEdge.bind(this.sheet));
    html.find(".remove-evolution-edge").on("click", this.sheet._onRemoveEvolutionEdge.bind(this.sheet));
    html.find(".open-evolution-node").on("click", this.sheet._onOpenEvolutionNode.bind(this.sheet));
    html.find(".remove-evolution-node").on("click", this.sheet._onRemoveEvolutionNode.bind(this.sheet));

    requestAnimationFrame(() => {
      if (!this.sheet._ddaEvolutionGraphView?.focusedOnce || this.sheet._ddaEvolutionGraphView?.actorUuid !== this.actor.uuid) {
        const focusedView = this.sheet._getEvolutionGraphCenteredView(
          this.sheet._getEvolutionGraphFocusZoom(),
          root
        );

        this.sheet._ddaEvolutionGraphView = {
          ...focusedView,
          actorUuid: this.actor.uuid,
          focusedOnce: true
        };
      }

      this.sheet._applyEvolutionGraphTransform(root);
    });
  }


  _onActorUpdated(actor, changes = {}) {
    if (!actor || actor.uuid !== this.actor?.uuid) return;
    if (!hasEvolutionGraphChange(changes)) return;
    if (!this.rendered) return;

    const preservedView = this.sheet._captureEvolutionGraphViewForRefresh(
      this.element?.[0] ?? this.sheet.element?.[0]
    );

    clearTimeout(this._pendingGraphRefresh);
    this._pendingGraphRefresh = setTimeout(() => {
      if (!this.rendered) return;
      this.actor = actor;
      this.sheet.actor = actor;
      this.sheet._ddaEvolutionGraphView = {
        ...preservedView,
        actorUuid: actor.uuid,
        initialized: true,
        focusedOnce: true
      };
      this.render(false);
    }, 60);
  }

  close(options = {}) {
    if (this._actorUpdateHook !== null && this._actorUpdateHook !== undefined) {
      Hooks.off("updateActor", this._actorUpdateHook);
      this._actorUpdateHook = null;
    }

    clearTimeout(this._pendingGraphRefresh);
    this._pendingGraphRefresh = null;

    if (this.sheet?._ddaEvolutionGraphPopout === this) {
      this.sheet._ddaEvolutionGraphPopout = null;
    }

    return super.close(options);
  }

  _buildGraphHtml(evolutionGraph = {}) {
    const escape = foundry.utils.escapeHTML;
    const translate = (key, fallback = key) => {
      const value = localize(key);
      return value === key ? fallback : value;
    };

    const rings = Array.isArray(evolutionGraph.rings) ? evolutionGraph.rings : [];
    const edges = Array.isArray(evolutionGraph.edges) ? evolutionGraph.edges : [];
    const nodes = Array.isArray(evolutionGraph.nodes) ? evolutionGraph.nodes : [];
    const width = Number(evolutionGraph.width ?? 0);
    const height = Number(evolutionGraph.height ?? 0);

    return `
      <section class="dda-evolution-graph-popout">
        <div class="dda-evolution-graph-toolbar" data-evolution-toolbar>
          <button type="button" data-evolution-zoom="out" title="${escape(translate("DDA.Evolution.ZoomOut", "Diminuir zoom"))}">−</button>
          <button type="button" data-evolution-zoom="in" title="${escape(translate("DDA.Evolution.ZoomIn", "Aumentar zoom"))}">+</button>
          <button type="button" data-evolution-zoom="reset">${escape(translate("DDA.Evolution.ResetView", "Centralizar"))}</button>
          <button type="button" data-evolution-reset-node-layout title="${escape(translate("DDA.Evolution.ResetNodeLayout", "Resetar nodos"))}">${escape(translate("DDA.Evolution.ResetNodesShort", "Nodos"))}</button>
          <span>${escape(translate("DDA.Evolution.NavigationHint", "Arraste o mapa para mover. Use Ctrl + roda do mouse para aproximar."))}</span>
          <output data-evolution-zoom-output>100%</output>
          <button type="button" data-evolution-popout-close title="${escape(localize("DDA.Button.Close"))}">×</button>
        </div>

        <div class="dda-evolution-solar-viewport" data-evolution-viewport data-evolution-drop-target>
          <div class="dda-evolution-solar-map" data-evolution-map data-width="${width}" data-height="${height}">
            ${rings.map((ring) => `
              <div
                class="dda-evolution-ring ring-${escape(ring.key ?? "")}" 
                data-ring-left="${Number(ring.left ?? 0)}"
                data-ring-top="${Number(ring.top ?? 0)}"
                data-ring-size="${Number(ring.size ?? 0)}"
              >
                <span>${escape(ring.label ?? "")}</span>
              </div>
            `).join("")}

            <svg class="dda-evolution-lines" viewBox="0 0 ${width} ${height}" aria-hidden="true">
              ${edges.map((edge) => {
                const fallbackPath = `M ${Number(edge.x1 ?? 0)} ${Number(edge.y1 ?? 0)} L ${Number(edge.x2 ?? 0)} ${Number(edge.y2 ?? 0)}`;
                const method = edge.method ?? "";
                const path = edge.path ?? fallbackPath;

                if (method === "biomerge") {
                  return `
                    <path
                      class="dda-evolution-edge edge-biomerge edge-biomerge-core"
                      d="${escape(path)}"
                    />
                    <path
                      class="dda-evolution-edge edge-biomerge-strand edge-biomerge-strand-a"
                      d="${escape(edge.pathA ?? path)}"
                    />
                    <path
                      class="dda-evolution-edge edge-biomerge-strand edge-biomerge-strand-b"
                      d="${escape(edge.pathB ?? path)}"
                    />
                  `;
                }

                return `
                  <path
                    class="dda-evolution-edge edge-${escape(method)}" 
                    d="${escape(path)}"
                  />
                `;
              }).join("")}
            </svg>

            ${nodes.map((node) => `
              <article
                class="dda-evolution-node node-stage-${escape(node.stage ?? "")} ${node.isSelf ? "is-self" : ""}"
                data-node-left="${Number(node.left ?? 0)}"
                data-node-top="${Number(node.top ?? 0)}"
                data-node-id="${escape(node.id ?? "")}" 
                data-node-stage="${escape(node.stage ?? "")}" 
                data-evolution-tooltip="${escape(node.tooltip ?? "")}" 
              >
                <img src="${escape(node.img ?? "")}" alt="" />
                <strong>${escape(node.displayName ?? node.name ?? "")}</strong>
                <span>${escape(node.stageLabel ?? "")}</span>
                <div class="dda-evolution-node-actions">
                  <button type="button" class="open-evolution-node" data-node-id="${escape(node.id ?? "")}">${escape(localize("DDA.Button.Open"))}</button>
                  <button type="button" class="remove-evolution-node" data-node-id="${escape(node.id ?? "")}">${escape(localize("DDA.Button.Remove"))}</button>
                </div>
              </article>
            `).join("")}

            ${evolutionGraph.hasNodes ? "" : `<p class="dda-evolution-empty">${escape(localize("DDA.Evolution.NoGraphNodes"))}</p>`}
          </div>
        </div>
      </section>
    `;
  }
}
