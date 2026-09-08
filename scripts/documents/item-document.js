import { DDA_DIGIMON_QUALITIES } from "../data/digimon-qualities.js";

const DDA_QUALITY_AUTOMATION_DEFAULTS = {
  instinto: {
    grants: {
      mainStatsPerRank: {
        dodge: 1,
        health: 1
      },
      miscStats: {
        movementPerRank: 1
      }
    }
  },

  arma: {
    choices: {
      required: true,
      type: "attackTag",
      options: []
    },
    attackModifier: {
      enabled: true,
      appliesTo: "differentAttackPerRank",
      grantsTags: ["weapon"],
      accuracyBonusPerRank: 1,
      damageBonusPerRank: 1
    }
  },

  periciaProdigiosa: {
    grants: {
      skillBonus: 3
    }
  },

  evasaoAbsoluta: {
    grants: {
      automaticSuccesses: {
        dodgePerRank: 1
      }
    }
  },

  acrobata: {
    grants: {
      crashDamageReductionFrom: "ram"
    }
  },

  impulsoDeSistema: {
    grants: {
      derivedStatChoicePerRank: 1
    }
  },

  conscienciaDeCombate: {
    grants: {
      initiativeBonus: 3,
      treatsSurpriseRoundsAsNormal: true
    }
  },

  teleporte: {
    grants: {
      movementType: "teleport"
    },
    activation: {
      enabled: true,
      active: false,
      mode: "action",
      action: "teleport",
      chatMessage: "Use a Ação Teleporte para se mover instantaneamente para um local desocupado visível."
    },
    uses: {
      enabled: true,
      value: 1,
      max: 1,
      recharge: "combat"
    },
    teleport: {
      rangeFormula: "stage + 2 + instinctRanks + speedsterBonus",
      ignoresDifficultTerrain: true,
      requiresVisibleUnoccupiedLocation: true,
      instinctAddsDistance: true,
      speedsterBonus: 1,
      interruptEscape: {
        enabled: true,
        usesSharedCombatUse: true,
        causesAttackToMiss: true,
        doesNotTriggerMissEffects: true
      },
      clashEscape: {
        enabled: true,
        usesSharedCombatUse: true,
        automaticallyEscapesClash: true
      }
    }
  },

  tecnico: {
    grants: {
      technicianBonus: 3,
      readsDigicode: true
    }
  },

  firewall: {
    grants: {
      technicianBonusIncrease: 3,
      firewallApplications: true
    }
  },

  trojan: {
    grants: {
      technicianBonusIncrease: 3,
      trojanApplications: true
    }
  },

  perfuracaoDeArmadura: {
    choices: {
      required: true,
      type: "singleAttack",
      repeatOnRankIncrease: false,
      options: []
    },
    attackModifier: {
      enabled: true,
      appliesTo: "oneDamageAttack",
      grantsTags: ["piercing"],
      piercingUnalterableDamagePerRank: 2,
      piercingUnalterableDamageAreaPerRank: 1,
      signatureBatteryDamageCanBecomeUnalterable: true
    }
  },

  golpeCerteiro: {
    choices: {
      required: true,
      type: "singleAttack",
      repeatOnRankIncrease: false,
      options: []
    },
    attackModifier: {
      enabled: true,
      appliesTo: "oneDamageAttack",
      grantsTags: ["certain"],
      automaticSuccessesPerRank: 1,
      signatureBatteryAutomaticSuccessThreshold: 2,
      signatureBatteryAutomaticSuccessBonus: 1
    }
  },

ataqueDeInvestida: {
  choices: {
    required: true,
    type: "singleAttack",
    options: []
  },
  attackModifier: {
    enabled: true,
    appliesTo: "oneMeleeAttack",
    grantsTags: ["charge"],
    chargeMoveWithAttack: true,
    signatureBatteryMoveBonus: true
  }
},

municao: {
  choices: {
    required: true,
    type: "singleAttack",
    options: []
  },
  attackModifier: {
    enabled: true,
    appliesTo: "oneAttack",
    grantsTags: ["ammo"],
    ignoresAttackPerRoundLimit: true,
    oncePerCombat: true,
    cannotApplyToSignatureMove: true
  }
},

recuoPesado: {
  choices: {
    required: true,
    type: "singleAttack",
    options: []
  },
  attackModifier: {
    enabled: true,
    appliesTo: "oneRangedAttack",
    grantsTags: ["recoil"],
    rangeMultiplier: 0.5,
    effectiveLimitMultiplier: 0.5,
    ignoreAdjacentAccuracyPenalty: true,
    selfPushByStage: true,
    targetPushOnDamageHit: true,
    cannotUseInSentryStance: true,
    signatureBatteryPushBonus: true
  }
},
  poderBrutal: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "Reroll low results in an Accuracy Pool." },
    uses: { enabled: true, value: 1, max: 1, recharge: "round" },
    reroll: { pool: "accuracy", rerollResultsUpToPerRank: 1, maxRerollResultsUpTo: 2 }
  },

  flancoAgressivo: {
    attackModifier: { enabled: true, appliesTo: "all", grantsTags: [], aggressiveFlankAccuracyFrom: "ram" }
  },

  contraAtaque: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "Use an Interrupt Action to counterattack after an enemy misses you." },
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    usesFormula: { valueFromRank: true, valuePerRank: 1, recharge: "combat" }
  },

  duelistaDeHordas: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "Spend 1 Action and roll BIT (Survival) against adjacent enemies." },
    trigger: { actionCost: "1", frequency: "combat" }
  },

  ocultarAVista: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "Spend 1 Action to attempt a Stealth Check while in view." },
    trigger: { actionCost: "1", frequency: "turn" },
    grants: { hideInPlainSight: true }
  },

  mantoDeSombras: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "When rolling RAM (Stealth), spend +1 Action to share the result with allies in range." },
    trigger: { actionCost: "1" },
    grants: { shadeCloak: true }
  },

  ataqueFurtivo: {
    choices: { required: true, type: "singleAttack", options: [] },
    attackModifier: { enabled: true, appliesTo: "oneAttack", grantsTags: ["sneak"], sneakAttack: true, rangeExtraActionCost: 1 }
  },

  golpeSimplificado: {
    choices: { required: true, type: "singleAttack", options: [] },
    attackModifier: { enabled: true, appliesTo: "oneAttack", grantsTags: ["simple"], actionCostReduction: 1, actionCostMinimum: 1 }
  },

  gritoDeGuerra: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "Spend 1 Action and roll DOS (Bravery) to grant [BASTION] to allies in range." },
    trigger: { actionCost: "1" }
  },

  cacadorVigilante: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "Study a target with DOS (Awareness)." },
    trigger: { actionCost: "free/2", frequency: "round" },
    grants: { watchfulHunter: true }
  },

  venenoso: {
    choices: { required: true, type: "singleAttack", options: [] },
    attackModifier: { enabled: true, appliesTo: "oneDamageAttack", grantsTags: ["venom"], venomous: true, cannotShareWithTags: ["poison"] }
  },

  alcance: {
    choices: { required: true, type: "single", options: [
      { key: "wideSwings", label: "Wide Swings" },
      { key: "longArms", label: "Long Arms" },
      { key: "extendedGrapple", label: "Extended Grapple" }
    ] },
    attackModifier: { enabled: true, appliesTo: "melee", grantsTags: [], reachMode: "wideSwings", reachBonusPerRank: 1 }
  },

  areaDeAtaque: {
    choices: { required: true, type: "attackTag", cannotRepeat: true, options: [] },
    attackModifier: { enabled: true, appliesTo: "differentAttackPerRank", grantsTags: ["t:blast", "t:burst", "t:cone", "t:line", "t:pass", "t:wave"], areaAttack: true }
  },

  zonista: {
    grants: { zoner: true }
  },

  algoritmo: {
    grants: { algorithm: true }
  },

  mobilidadeAvancada: {
    grants: { advancedMobility: true }
  },

  sprint: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "DDA.QualityAutomation.Sprint.Chat" },
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    trigger: { actionCost: "0", frequency: "combat" },
    grants: { sprint: true }
  },

  forcaElemental: {
    choices: { required: true, type: "attackTag", options: [] },
    attackModifier: { enabled: true, appliesTo: "oneDamageAttack", grantsTags: [], elementalForce: true, elementalForceDamageBonusFormula: "1 + rank" }
  },

  mestreElemental: {
    grants: { elementMaster: true }
  },

  golpePoderoso: {
    choices: { required: true, type: "singleAttack", options: [] },
    attackModifier: { enabled: true, appliesTo: "oneMeleeDamageAttack", grantsTags: ["t:mighty"], mightyBlow: true }
  },

  focoPreciso: {
    choices: { required: true, type: "singleAttack", options: [] },
    attackModifier: { enabled: true, appliesTo: "oneRangedAttack", grantsTags: ["focus"], preciseFocus: true }
  },

  ataqueDeFinta: {
    choices: { required: true, type: "singleAttack", options: [] },
    attackModifier: { enabled: true, appliesTo: "oneMeleeAttack", grantsTags: ["t:feint"], feintAttack: true }
  },

  golpePunitivo: {
    choices: { required: true, type: "singleAttack", options: [] },
    attackModifier: { enabled: true, appliesTo: "oneMeleeAttack", grantsTags: ["punish"], punishingStrike: true }
  },

  naoHaEscapatoria: {
    grants: { noEscape: true }
  },

  contraGolpe: {
    choices: { required: true, type: "singleAttack", options: [] },
    attackModifier: { enabled: true, appliesTo: "oneMeleeAttack", grantsTags: ["counter"], counterblow: true }
  },

  contraGolpeCruzado: {
    choices: { required: true, type: "singleAttack", options: [] },
    attackModifier: { enabled: true, appliesTo: "oneMeleeAttack", grantsTags: ["counter"], crossCounter: true }
  },

  fogoDeRetorno: {
    choices: { required: true, type: "singleAttack", options: [] },
    attackModifier: { enabled: true, appliesTo: "oneRangedAttack", grantsTags: ["counter"], returnFire: true }
  },

  contraAtaqueInstantaneo: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "DDA.QualityAutomation.InstantCounter.Chat" },
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    grants: { instantCounter: true }
  },

  rouboDeVida: {
    choices: { required: true, type: "singleAttack", options: [] },
    attackModifier: { enabled: true, appliesTo: "oneAttack", grantsTags: ["drain"], lifesteal: true }
  },

  recarregar: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "DDA.QualityAutomation.Reload.Chat" },
    uses: { enabled: true, value: 1, max: 1, recharge: "combat" },
    trigger: { actionCost: "2", frequency: "combat" },
    grants: { reload: true }
  },

  brace: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "DDA.QualityAutomation.Brace.Chat" },
    uses: { enabled: false, value: 0, max: 0, recharge: "" },
    trigger: { actionCost: "interrupt", frequency: "escalatingCombat" },
    grants: { brace: true }
  },

  selvageria: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "DDA.QualityAutomation.Savagery.Chat" },
    trigger: { actionCost: "0", frequency: "round" },
    grants: { savagery: true }
  },

  destruicaoGarantida: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "DDA.QualityAutomation.AssuredDestruction.Chat" },
    grants: { assuredDestruction: true }
  },

  resistenciaFocada: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "DDA.QualityAutomation.FocusedResistance.Chat" },
    grants: { focusedResistance: true }
  },

  imunidade: {
    grants: { immunity: true }
  },

  controleDeDominio: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "DDA.QualityAutomation.DomainControl.Chat" },
    trigger: { actionCost: "2" },
    grants: { domainControl: true }
  },

  elementoAdaptativo: {
    grants: { adaptiveElement: true }
  },

  elementoAlterado: {
    grants: { alteredElement: true }
  },

  overdrive: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "DDA.QualityAutomation.Overdrive.Chat" },
    trigger: { actionCost: "0", frequency: "round" },
    grants: { overdrive: true }
  },

  dataScan: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "DDA.QualityAutomation.DataScan.Chat" },
    trigger: { actionCost: "1" },
    grants: { dataScan: true }
  },

  conjurador: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "DDA.QualityAutomation.Conjurer.Chat" },
    trigger: { actionCost: "1/2" },
    grants: { conjurer: true, resource: "mastery" }
  },

  invocador: {
    activation: { enabled: true, active: false, mode: "instant", chatMessage: "DDA.QualityAutomation.Summoner.Chat" },
    trigger: { actionCost: "1/2" },
    grants: { summoner: true, resource: "mastery" }
  },

  evocador: {
    grants: { omnievoker: true }
  },
};

const DDA_QUALITY_AUTOMATION_ALIASES = {
  instinto: "instinto",
  instinct: "instinto",

  arma: "arma",
  weapon: "arma",

  periciaprodigiosa: "periciaProdigiosa",
  prodigiousskill: "periciaProdigiosa",

  evasaoabsoluta: "evasaoAbsoluta",
  absoluteevasion: "evasaoAbsoluta",

  acrobata: "acrobata",
  tumbler: "acrobata",

  impulsodesistema: "impulsoDeSistema",
  systemboost: "impulsoDeSistema",

  conscienciadecombate: "conscienciaDeCombate",
  combatawareness: "conscienciaDeCombate",

  teleporte: "teleporte",
  teleport: "teleporte",

  tecnico: "tecnico",
  technician: "tecnico",

  firewall: "firewall",

  trojan: "trojan",

  perfuracaodearmadura: "perfuracaoDeArmadura",
  armorpiercing: "perfuracaoDeArmadura",

  golpecerteiro: "golpeCerteiro",
  certainstrike: "golpeCerteiro",

  ataquedeinvestida: "ataqueDeInvestida",
chargeattack: "ataqueDeInvestida",

municao: "municao",
ammo: "municao",

recuopesado: "recuoPesado",
heavyrecoil: "recuoPesado",
  poderbrutal: "poderBrutal",
  hugepower: "poderBrutal",
  flancoagressivo: "flancoAgressivo",
  aggressiveflank: "flancoAgressivo",
  contraataque: "contraAtaque",
  counterattack: "contraAtaque",
  duelistadehordas: "duelistaDeHordas",
  hordeduelist: "duelistaDeHordas",
  ocultaravista: "ocultarAVista",
  hideinplainsight: "ocultarAVista",
  mantodesombras: "mantoDeSombras",
  shadecloak: "mantoDeSombras",
  ataquefurtivo: "ataqueFurtivo",
  sneakattack: "ataqueFurtivo",
  golpesimplificado: "golpeSimplificado",
  simplifiedstrike: "golpeSimplificado",
  gritodeguerra: "gritoDeGuerra",
  battlecry: "gritoDeGuerra",
  cacadorvigilante: "cacadorVigilante",
  watchfulhunter: "cacadorVigilante",
  venenoso: "venenoso",
  venomous: "venenoso",
  alcance: "alcance",
  reach: "alcance",
  areadeataque: "areaDeAtaque",
  areaattack: "areaDeAtaque",
  zonista: "zonista",
  zoner: "zonista",

  algoritmo: "algoritmo",
  algorithm: "algoritmo",
  mobilidadeavancada: "mobilidadeAvancada",
  advancedmobility: "mobilidadeAvancada",
  sprint: "sprint",
  forcaelemental: "forcaElemental",
  elementalforce: "forcaElemental",
  mestreelemental: "mestreElemental",
  elementmaster: "mestreElemental",
  golpepoderoso: "golpePoderoso",
  mightyblow: "golpePoderoso",
  focopreciso: "focoPreciso",
  precisefocus: "focoPreciso",
  ataquedefinta: "ataqueDeFinta",
  feintattack: "ataqueDeFinta",
  golpepunitivo: "golpePunitivo",
  punishingstrike: "golpePunitivo",
  naohaescapatoria: "naoHaEscapatoria",
  thereisnoescape: "naoHaEscapatoria",
  counterblow: "contraGolpe",
  contragolpe: "contraGolpe",
  crosscounter: "contraGolpeCruzado",
  contragolpecruzado: "contraGolpeCruzado",
  returnfire: "fogoDeRetorno",
  fogoderetorno: "fogoDeRetorno",
  instantcounter: "contraAtaqueInstantaneo",
  contraataqueinstantaneo: "contraAtaqueInstantaneo",
  lifesteal: "rouboDeVida",
  roubodevida: "rouboDeVida",
  reload: "recarregar",
  recarregar: "recarregar",
  brace: "brace",
  preparar: "brace",
  selvageria: "selvageria",
  savagery: "selvageria",
  destruicaogarantida: "destruicaoGarantida",
  assureddestruction: "destruicaoGarantida",
  focusedresistance: "resistenciaFocada",
  resistenciafocada: "resistenciaFocada",
  immunity: "imunidade",
  imunidade: "imunidade",
  domaincontrol: "controleDeDominio",
  controlededominio: "controleDeDominio",
  adaptiveelement: "elementoAdaptativo",
  elementoadaptativo: "elementoAdaptativo",
  alteredelement: "elementoAlterado",
  elementoalterado: "elementoAlterado",
  overdrive: "overdrive",
  datascan: "dataScan",
  varreduradedados: "dataScan",
  conjurer: "conjurador",
  conjurador: "conjurador",
  summoner: "invocador",
  invocador: "invocador",
  evoker: "evocador",
  omnievoker: "evocador",
  evocador: "evocador",

};

function normalizeQualityAutomationLookup(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function getQualityAutomationKey(item) {
  const system = item?.system ?? {};

  const candidates = [
    system.sourceId,
    system.id,
    item?.flags?.["digimon-digital-adventures"]?.sourceId,
    item?.name,
    system.originalName,
    system.name
  ];

  for (const candidate of candidates) {
    const lookup = normalizeQualityAutomationLookup(candidate);
    if (!lookup) continue;

    const mapped = DDA_QUALITY_AUTOMATION_ALIASES[lookup];
    if (mapped) return mapped;
  }

  return "";
}

function cloneQualityAutomationValue(value) {
  if (globalThis.foundry?.utils?.deepClone) {
    return globalThis.foundry.utils.deepClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function applyMissingQualityAutomation(target, defaults) {
  if (!target || !defaults) return;

  for (const [key, defaultValue] of Object.entries(defaults)) {
    const currentValue = target[key];

    if (
      defaultValue &&
      typeof defaultValue === "object" &&
      !Array.isArray(defaultValue)
    ) {
      if (
        !currentValue ||
        typeof currentValue !== "object" ||
        Array.isArray(currentValue)
      ) {
        target[key] = {};
      }

      applyMissingQualityAutomation(target[key], defaultValue);
      continue;
    }

    const shouldApply =
      currentValue === undefined ||
      currentValue === null ||
      currentValue === "" ||
      (typeof defaultValue === "number" && Number(currentValue ?? 0) === 0) ||
      (Array.isArray(defaultValue) && (!Array.isArray(currentValue) || !currentValue.length));

    if (shouldApply) {
      target[key] = cloneQualityAutomationValue(defaultValue);
    }
  }
}


const DDA_ITEM_SPRITE_BASE = "systems/digimon-digital-adventures/assets/ui/Sprites-1bit";
const DDA_GENERIC_ITEM_ICONS = new Set([
  "icons/svg/item-bag.svg",
  "icons/svg/book.svg",
  "icons/svg/wing.svg",
  "icons/svg/shield.svg",
  "icons/svg/d20.svg",
  "icons/svg/target.svg",
  "icons/svg/sword.svg",
  "icons/svg/aura.svg",
  "icons/svg/terror.svg"
]);

const DDA_MANAGED_ITEM_ICON_FILES = {
  quality: "Tools_Crafting_Books_Manual_Documentation_Reading.webp",
  tamerTalent: "RPG_Stat_Intelligence_Intellect_Brain_Wisdom_Thinking_IQ.webp",
  torment: "RPG_Skull_Death_Dead_Bones_Pirates.webp",
  digimental: "Warfare_Medal_Award_Achievement_Rank.webp",
  motif: "Map_Markers_Flagpole_Triangle_Minesweeper.webp",
  equipment: "RPG_Item_Armor_Equipment_Slot_Chestplate_Body_Armour.webp",
  consumable: "Alchemy_Potion_Vial_Bottle_Full.webp",
  card: "Boardgames_Cards_Deck_Pile.webp",
  milestone: "Sports_Winner_Award_Cup_Achievement_Trophy.webp",
  trait: "RPG_Stat_HP_Health_Heart.webp",
  evolutionLink: "Software_Link_Chain_Shortcut_Combo.webp"
};

const DDA_ATTACK_ICON_FILES = {
  ranged: "RPG_Item_Weapon_Bow_Ranged_Shooting.webp",
  digimonMelee: "RPG_Skill_Claw_Scratch_Rake_Maul_Attack_Damage.webp",
  tamerMelee: "RPG_Stat_Strength_Fist_Melee_Attack.webp"
};

function getDdaManagedIconPaths() {
  const managed = new Set();
  for (const file of Object.values(DDA_MANAGED_ITEM_ICON_FILES)) {
    managed.add(`${DDA_ITEM_SPRITE_BASE}/${file}`);
  }
  for (const file of Object.values(DDA_ATTACK_ICON_FILES)) {
    managed.add(`${DDA_ITEM_SPRITE_BASE}/${file}`);
  }
  return managed;
}

const DDA_MANAGED_ITEM_ICON_PATHS = getDdaManagedIconPaths();

function getDdaSpritePath(fileName = "") {
  const file = String(fileName ?? "").trim();
  return file ? `${DDA_ITEM_SPRITE_BASE}/${file}` : "";
}

function normalizeAttackRangeType(value = "") {
  const rangeType = String(value ?? "").trim().toLowerCase();
  return ["range", "ranged"].includes(rangeType) ? "range" : "melee";
}

function isGenericDdaItemIcon(path = "") {
  const clean = String(path ?? "").trim();
  return !clean || DDA_GENERIC_ITEM_ICONS.has(clean) || DDA_MANAGED_ITEM_ICON_PATHS.has(clean);
}

function resolveDdaAttackIcon(item, { rangeType = null, parentType = null } = {}) {
  const resolvedRangeType = normalizeAttackRangeType(
    rangeType ?? item?.system?.baseTags?.rangeType ?? item?.system?.rangeType ?? "melee"
  );

  if (resolvedRangeType === "range") {
    return getDdaSpritePath(DDA_ATTACK_ICON_FILES.ranged);
  }

  const ownerType = String(parentType ?? item?.parent?.type ?? "").trim().toLowerCase();
  const meleeFile = ownerType === "character"
    ? DDA_ATTACK_ICON_FILES.tamerMelee
    : DDA_ATTACK_ICON_FILES.digimonMelee;

  return getDdaSpritePath(meleeFile);
}

function resolveDdaItemDefaultIcon(item, { type = null, rangeType = null, parentType = null } = {}) {
  const itemType = String(type ?? item?.type ?? "").trim();
  if (!itemType) return "";

  if (itemType === "attack") {
    return resolveDdaAttackIcon(item, { rangeType, parentType });
  }

  const file = DDA_MANAGED_ITEM_ICON_FILES[itemType] ?? "";
  return getDdaSpritePath(file);
}

function applyQualityAutomationDefaults(item) {
  const automationKey = getQualityAutomationKey(item);
  if (automationKey) {
    const defaults = DDA_QUALITY_AUTOMATION_DEFAULTS[automationKey];
    if (defaults) applyMissingQualityAutomation(item.system, defaults);
  }

  applyCurrentQualityDefinition(item);
}

const CURRENT_RULE_QUALITY_IDS = new Set([
  "ordemTatica",
  "orientacaoInspiradora",
  "perfuracaoDeArmadura",
  "golpeCerteiro",
  "conjurador",
  "invocador",
  "evocador",
  "venenoso",
  "substituir",
  "perigoDigital"
]);

function getCurrentQualityDefinition(item) {
  const identities = new Set([
    item?.system?.sourceId,
    item?.system?.id,
    item?.system?.originalName,
    item?.name
  ].map(normalizeQualityAutomationLookup).filter(Boolean));

  return DDA_DIGIMON_QUALITIES.find((definition) => (
    CURRENT_RULE_QUALITY_IDS.has(definition.id) &&
    [definition.id, definition.name, definition.originalName]
      .some((value) => identities.has(normalizeQualityAutomationLookup(value)))
  )) ?? null;
}

function applyCurrentQualityDefinition(item) {
  const definition = getCurrentQualityDefinition(item);
  if (!definition) return;

  const system = item.system;
  const currentRankValue = Number(system.rank?.value ?? definition.rank?.value ?? 1);
  const currentChoices = cloneQualityAutomationValue(system.choices ?? {});
  const currentCreation = cloneQualityAutomationValue(system.creation ?? {});

  for (const key of [
    "section",
    "tier",
    "originalTier",
    "category",
    "availability",
    "stageRequirement",
    "requirements",
    "incompatible",
    "requiredFor",
    "statRankRequirement",
    "effect",
    "description",
    "result",
    "substitute",
    "hazard"
  ]) {
    if (definition[key] !== undefined) {
      system[key] = cloneQualityAutomationValue(definition[key]);
    }
  }

  system.cost = {
    ...(system.cost ?? {}),
    ...cloneQualityAutomationValue(definition.cost ?? {})
  };
  system.rank = {
    ...(system.rank ?? {}),
    ...cloneQualityAutomationValue(definition.rank ?? {}),
    value: currentRankValue
  };
  system.grants = {
    ...(system.grants ?? {}),
    ...cloneQualityAutomationValue(definition.grants ?? {})
  };
  system.attackModifier = {
    ...(system.attackModifier ?? {}),
    ...cloneQualityAutomationValue(definition.attackModifier ?? {})
  };
  system.activation = {
    ...(system.activation ?? {}),
    ...cloneQualityAutomationValue(definition.activation ?? {})
  };

  const canonicalChoices = cloneQualityAutomationValue(definition.choices ?? {});
  system.choices = {
    ...currentChoices,
    ...canonicalChoices,
    options: Array.isArray(canonicalChoices.options) && canonicalChoices.options.length
      ? canonicalChoices.options
      : (currentChoices.options ?? []),
    selectedRanks: currentChoices.selectedRanks ?? [],
    selected: currentChoices.selected ?? []
  };

  /* Legacy Conjurer/Summoner Items predate the current option schema. Give
   * them a deterministic Rank-1 choice so an existing Actor remains usable
   * without deleting and repurchasing the Quality. Explicit current choices
   * always win. */
  if (["conjurador", "invocador"].includes(definition.id)) {
    const validOptions = Array.isArray(canonicalChoices.options)
      ? canonicalChoices.options
      : [];
    const validKeys = new Set(validOptions.map((option) => normalizeQualityAutomationLookup(option.key)));
    const selectedRanks = Array.isArray(system.choices.selectedRanks)
      ? system.choices.selectedRanks
      : [];
    const selected = Array.isArray(system.choices.selected)
      ? system.choices.selected
      : (system.choices.selected ? [system.choices.selected] : []);
    const hasCurrentChoice = [...selectedRanks, ...selected].some((choice) => validKeys.has(normalizeQualityAutomationLookup(
      choice?.key ?? choice?.originalLabel ?? choice?.label ?? choice
    )));
    if (!hasCurrentChoice && validOptions.length) {
      const fallback = validOptions[0];
      system.choices.selectedRanks = [{
        ...cloneQualityAutomationValue(fallback),
        rank: 1,
        key: fallback.key,
        label: fallback.label ?? fallback.key,
        originalLabel: fallback.originalLabel ?? ""
      }];
    }
  }

  if (definition.creation !== undefined) {
    system.creation = {
      ...currentCreation,
      ...cloneQualityAutomationValue(definition.creation),
      appearance: currentCreation.appearance ?? definition.creation?.appearance ?? "",
      summoningMethod: currentCreation.summoningMethod ?? definition.creation?.summoningMethod ?? ""
    };
  }

  if (definition.rankLimit !== undefined) {
    system.rankLimit = cloneQualityAutomationValue(definition.rankLimit);
  } else {
    system.rankLimit = {};
  }

  if (["perfuracaoDeArmadura", "golpeCerteiro"].includes(definition.id)) {
    delete system.attackModifier.cannotShareWithTagsUnlessSignatureMove;
  }

  if (definition.id === "perfuracaoDeArmadura") {
    delete system.attackModifier.piercingUnalterablePerLeftoverSuccess;
    delete system.attackModifier.piercingUnalterableMaxPerRank;
  }
}

export class DDAItem extends Item {

  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    const currentImg = String(data?.img ?? this.img ?? "").trim();
    if (!isGenericDdaItemIcon(currentImg)) return;

    const defaultImg = resolveDdaItemDefaultIcon(this);
    if (!defaultImg) return;

    this.updateSource({ img: defaultImg });
  }

  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);

    if (foundry.utils.hasProperty(changed, "img")) return;

    const currentImg = String(this.img ?? "").trim();
    if (!isGenericDdaItemIcon(currentImg)) return;

    const nextType = String(changed.type ?? this.type ?? "").trim();
    const nextRangeType = foundry.utils.getProperty(changed, "system.baseTags.rangeType")
      ?? this.system?.baseTags?.rangeType
      ?? "melee";

    const nextImg = resolveDdaItemDefaultIcon(this, {
      type: nextType,
      rangeType: nextRangeType
    });

    if (!nextImg) return;
    changed.img = nextImg;
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    if (this.type === "quality") {
      this._prepareQualityData();
    }

    if (this.type === "attack") {
      this._prepareAttackData();
    }
    if (this.type === "torment") {
      this._prepareTormentData();
    }
    if (this.type === "tamerTalent") {
      this._prepareTamerTalentData();
    }

    if (this.type === "motif") {
      this._prepareMotifData();
    }

    if (this.type === "digimental") {
      this._prepareDigimentalData();
    }

    if (["equipment", "consumable", "card"].includes(this.type)) {
      this._prepareInventoryItemData();
    }
    
  }

_prepareQualityData() {
  applyQualityAutomationDefaults(this);

  const system = this.system;

    const rank = Number(system.rank?.value ?? 1);
    const cost = Number(system.cost?.dp ?? 0);
    const perRank = Boolean(system.cost?.perRank);
    const isFree = Boolean(system.cost?.isFree);

    const totalCost = isFree
      ? 0
      : perRank
        ? cost * Math.max(1, rank)
        : cost;

    system.cost.total = totalCost;

    if (!system.grants) {
      system.grants = {};
    }

    if (!system.grants.mainStats) {
  system.grants.mainStats = {};
}

const mainStatKeys = ["accuracy", "damage", "dodge", "armor", "health"];

for (const key of mainStatKeys) {
  system.grants.mainStats[key] = Number(system.grants.mainStats[key] ?? 0);
}

if (!system.grants.mainStatsPerRank) {
  system.grants.mainStatsPerRank = {};
}

for (const key of mainStatKeys) {
  system.grants.mainStatsPerRank[key] = Number(system.grants.mainStatsPerRank[key] ?? 0);
}

if (!system.grants.miscStats) {
  system.grants.miscStats = {};
}

system.grants.miscStats.movement = Number(system.grants.miscStats.movement ?? 0);
system.grants.miscStats.movementPerRank = Number(system.grants.miscStats.movementPerRank ?? 0);

system.grants.skillBonus = Number(system.grants.skillBonus ?? 0);

    if (!system.grants.mainStats) {
  system.grants.mainStats = {
    accuracy: 0,
    damage: 0,
    dodge: 0,
    armor: 0,
    health: 0
  };
}

if (!system.grants.miscStats) {
  system.grants.miscStats = {
    movement: 0,
    movementPerRank: 0
  };
}

if (system.grants.skillBonus === undefined) {
  system.grants.skillBonus = 0;
}

    if (!system.grants.dp) {
      system.grants.dp = {
        enabled: false,
        value: 0,
        total: 0
      };
    }

    const grantsDp = Boolean(system.grants.dp.enabled);
    const grantedDpValue = Number(system.grants.dp.value ?? 0);

    system.grants.dp.total = grantsDp ? grantedDpValue : 0;
  }

  _prepareAttackData() {
    const system = this.system;

          if (!system.accuracy) {
      system.accuracy = {};
    }

    if (!system.damage) {
      system.damage = {};
    }

    if (system.accuracy.formulaAdvanced === undefined) {
      system.accuracy.formulaAdvanced = false;
    }

    if (system.damage.formulaAdvanced === undefined) {
      system.damage.formulaAdvanced = false;
    }

    if (!system.accuracy.baseFormula) {
      system.accuracy.baseFormula = "@actor.mainStats.accuracy.total";
    }

    if (!system.damage.baseFormula) {
      system.damage.baseFormula = "@actor.mainStats.damage.total";
    }

    if (!system.range) {
      system.range = {};
    }

    system.range.value = Number(system.range.value ?? 0);
    system.range.bonus = Number(system.range.bonus ?? 0);
    system.range.qualityBonus = Number(system.range.qualityBonus ?? 0);
    system.range.total = Math.max(
      0,
      system.range.value + system.range.bonus + system.range.qualityBonus
    );

    if (!system.effectiveLimit) {
      system.effectiveLimit = {};
    }

    system.effectiveLimit.value = Number(system.effectiveLimit.value ?? 0);
    system.effectiveLimit.bonus = Number(system.effectiveLimit.bonus ?? 0);
    system.effectiveLimit.qualityBonus = Number(system.effectiveLimit.qualityBonus ?? 0);
    system.effectiveLimit.total = Math.max(
      0,
      system.effectiveLimit.value + system.effectiveLimit.bonus + system.effectiveLimit.qualityBonus
    );

    const qualityTags = Array.isArray(system.qualityTags) ? system.qualityTags : [];
    const normalizedQualityTags = new Set(
      qualityTags
        .map((entry) => String(entry?.tag ?? entry?.key ?? entry?.value ?? entry ?? "").trim().toLowerCase())
        .filter(Boolean)
    );

    if (system.effectTag?.enabled && String(system.effectTag?.tag ?? "").trim()) {
      normalizedQualityTags.add(String(system.effectTag.tag).trim().toLowerCase());
    }

    if (!system.qualityTagLimit) {
      system.qualityTagLimit = {};
    }

    system.qualityTagLimit.count = normalizedQualityTags.size;
    system.qualityTagLimit.max = 3;
    system.qualityTagLimit.exceeded = normalizedQualityTags.size > 3;
  }
  _prepareTormentData() {
  const system = this.system;

  if (!system.boxes) {
    system.boxes = {};
  }

  const marked = Math.clamp(Number(system.boxes.value ?? 0), 0, 10);

  system.boxes.value = marked;
  system.boxes.max = Number(system.boxes.max ?? 10) || 10;

let severity = "none";
let severityLabelKey = "DDA.Torment.Severity.None";

if (marked >= 8) {
  severity = "terrible";
  severityLabelKey = "DDA.Torment.Severity.Terrible";
} else if (marked >= 5) {
  severity = "major";
  severityLabelKey = "DDA.Torment.Severity.Major";
} else if (marked >= 1) {
  severity = "minor";
  severityLabelKey = "DDA.Torment.Severity.Minor";
}

system.severity = severity;
system.severityLabel = game.i18n.localize(severityLabelKey);
system.severityLabelKey = severityLabelKey;
}

  _prepareDigimentalData() {
  const system = this.system;

  if (!system.uses) {
    system.uses = { enabled: true, value: 1, max: 1, recharge: "rest" };
  }

  system.uses.enabled = true;

  const rawUsesMax = Number(system.uses.max ?? 1);
  const rawUsesValue = Number(system.uses.value ?? Number.NaN);

  system.uses.max = Math.max(1, Number.isFinite(rawUsesMax) ? rawUsesMax : 1);

  // O template genérico de usos começa em 0/0; para Digimentals novos,
  // isso deve virar 1/1, não "já usado até o descanso".
  if (!Number.isFinite(rawUsesValue) || (rawUsesMax <= 0 && rawUsesValue <= 0 && !system.usedUntilRest)) {
    system.uses.value = system.uses.max;
  } else {
    system.uses.value = Math.clamp(rawUsesValue, 0, system.uses.max);
  }

  system.uses.recharge = system.uses.recharge || "rest";
  system.usedUntilRest = Boolean(system.usedUntilRest || system.uses.value <= 0);

  if (!system.use) {
    system.use = { enabled: true, target: "digimon", consumeOnUse: false, chatMessage: "" };
  }

  system.use.enabled = true;
  system.use.target = system.use.target || "digimon";
  system.use.consumeOnUse = Boolean(system.use.consumeOnUse);
  system.use.chatMessage = String(system.use.chatMessage ?? "");

  if (!system.template) system.template = {};
  system.template.spentDp = Number(system.template.spentDp ?? 0);
  system.template.qualityGrants = Array.isArray(system.template.qualityGrants) ? system.template.qualityGrants : [];
}
  _prepareInventoryItemData() {
    const system = this.system;

    if (!system.uses) {
      system.uses = { enabled: false, value: 0, max: 0, recharge: "" };
    }

    if (!system.use) {
      system.use = { enabled: false, target: "digimon", consumeOnUse: false, chatMessage: "" };
    }

    system.quantity = Math.max(1, Number(system.quantity ?? 1));
    system.uses.enabled = Boolean(system.uses.enabled);
    system.uses.max = Math.max(0, Number(system.uses.max ?? 0));
    system.uses.value = Math.clamp(Number(system.uses.value ?? system.uses.max), 0, system.uses.max);
    system.uses.recharge = system.uses.recharge || "";
    system.use.enabled = Boolean(system.use.enabled || this.type === "consumable" || this.type === "card");
    system.use.target = system.use.target || "digimon";
    system.use.consumeOnUse = Boolean(system.use.consumeOnUse || this.type === "consumable");
    system.use.chatMessage = String(system.use.chatMessage ?? "");

    if (!system.automation) {
      system.automation = {};
    }

    system.automation.enabled = Boolean(system.automation.enabled);
    system.automation.kind = String(system.automation.kind ?? "none");
    system.automation.stat = String(system.automation.stat ?? "");
    system.automation.value = Number(system.automation.value ?? 0);
    system.automation.duration = Math.max(0, Number(system.automation.duration ?? 1));
    system.automation.tag = String(system.automation.tag ?? "");
    system.automation.label = String(system.automation.label ?? "");
    system.automation.qualityName = String(system.automation.qualityName ?? "");
    system.automation.movementType = String(system.automation.movementType ?? "");
    system.automation.naturewalk = String(system.automation.naturewalk ?? "");

    if (this.type === "equipment") {
      system.slot = system.slot || "accessory";
      system.equipmentType = system.equipmentType || system.slot;
      system.equippedToUuid = String(system.equippedToUuid ?? "");
      system.equippedToName = String(system.equippedToName ?? "");
    }

    if (this.type === "card") {
      system.cardType = system.cardType || "attack";
      system.rarity = system.rarity || "common";
      system.deck ??= {};
      system.deck.prepared = Boolean(system.deck.prepared);
      system.deck.usedInCombat = Boolean(system.deck.usedInCombat);
    }
  }

  _prepareMotifData() {
    const system = this.system;

    system.requirement ??= {};
    system.requirement.attributeA = String(system.requirement.attributeA ?? "");
    system.requirement.attributeB = String(system.requirement.attributeB ?? "");
    system.requirement.minimumSpecialOrders = Number(system.requirement.minimumSpecialOrders ?? 2);
    system.requirement.text = String(system.requirement.text ?? "");

    system.uses ??= { enabled: true, value: 1, max: 1, recharge: "day" };
    system.uses.enabled = true;
    system.uses.max = Math.max(1, Number(system.uses.max ?? 1));
    system.uses.value = Math.clamp(Number(system.uses.value ?? system.uses.max), 0, system.uses.max);
    system.uses.recharge = system.uses.recharge || "day";

    system.automation ??= {};
    system.automation.enabled = Boolean(system.automation.enabled);
    system.automation.kind = String(system.automation.kind ?? "none");
    system.automation.stat = String(system.automation.stat ?? "");
    system.automation.value = Number(system.automation.value ?? 0);
    system.automation.duration = Math.max(0, Number(system.automation.duration ?? 1));
    system.automation.tag = String(system.automation.tag ?? "");
    system.automation.label = String(system.automation.label ?? this.name ?? "");

    system.useType = String(system.useType ?? "simple");
    system.actionCost = String(system.actionCost ?? "1");
    system.frequency = String(system.frequency ?? "oncePerDay");
    system.effect = String(system.effect ?? "");
  }

_prepareTamerTalentData() {
  const system = this.system;

  if (!system.requirement) {
    system.requirement = {};
  }

  const type = system.requirement.type ?? "";
  const key = system.requirement.key ?? "";
  const value = Number(system.requirement.value ?? 0);

  const attributeLabels = {
    agility: "DDA.TamerAttribute.Agility",
    body: "DDA.TamerAttribute.Body",
    charisma: "DDA.TamerAttribute.Charisma",
    intelligence: "DDA.TamerAttribute.Intelligence",
    willpower: "DDA.TamerAttribute.Willpower"
  };

  const skillLabels = {
    awareness: "DDA.Skill.Awareness",
    athletics: "DDA.Skill.Athletics",
    bravery: "DDA.Skill.Bravery",
    decipherIntent: "DDA.Skill.DecipherIntent",
    endurance: "DDA.Skill.Endurance",
    evade: "DDA.Skill.Evade",
    featsOfStrength: "DDA.Skill.FeatsOfStrength",
    fortitude: "DDA.Skill.Fortitude",
    knowledge: "DDA.Skill.Knowledge",
    manipulate: "DDA.Skill.Manipulate",
    performance: "DDA.Skill.Performance",
    persuasion: "DDA.Skill.Persuasion",
    precision: "DDA.Skill.Precision",
    stealth: "DDA.Skill.Stealth",
    survival: "DDA.Skill.Survival"
  };

  let label = "";
  let labelKey = "";

  if (type === "attribute") {
    labelKey = attributeLabels[key] ?? key;
  } else if (type === "skill") {
    labelKey = skillLabels[key] ?? key;
  } else {
    labelKey = key;
  }

  label = labelKey && String(labelKey).startsWith("DDA.")
    ? game.i18n.localize(labelKey)
    : String(labelKey ?? "");

  system.requirement.labelKey = labelKey;
  system.requirement.label = label;
  system.requirement.display = label && value > 0
    ? `${label} ${value}`
    : label || "";
}
}
