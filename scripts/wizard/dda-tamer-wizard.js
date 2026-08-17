import {
  getCampaignLevelSummary,
  getAttributeStartingCap,
  getAttributeFinalCap,
  getSkillStartingCap,
  getSkillFinalCap,
  getStartingAttributePoints,
  getStartingSkillPoints,
  getStartingMarkedTormentBoxes,
  getScaledTalentRequirement
} from "../rules/campaign-rules.js";

import {
  DDA_TAMER_TALENTS
} from "../data/tamer-talents.js";

import {
  ensureActorOwner,
  syncTamerAndPartnerOwnership
} from "../utils/ownership.js";


const {
  ApplicationV2,
  HandlebarsApplicationMixin
} = foundry.applications.api;

const DDATamerWizardApplicationBase =
  HandlebarsApplicationMixin(ApplicationV2);

function isEnglishLanguage() {
  const language = String(game?.i18n?.lang ?? game?.i18n?.language ?? "");
  return language.toLowerCase().startsWith("en");
}

function text(pt, en) {
  return isEnglishLanguage() ? en : pt;
}

const DDA_TAMER_DEFAULT_IMAGE =
  "icons/svg/mystery-man.svg";

function getDdaFilePickerClass() {
  return (
    globalThis.foundry
      ?.applications
      ?.apps
      ?.FilePicker
      ?.implementation ??
    globalThis.FilePicker ??
    null
  );
}

function getTamerWorldImageDirectory() {
  const worldId = String(
    game?.world?.id ?? ""
  ).trim();

  return worldId
    ? `worlds/${worldId}`
    : "worlds";
}

function isMissingTamerImage(path = "") {
  const normalized = String(
    path ?? ""
  )
    .trim()
    .replaceAll("\\", "/")
    .toLowerCase();

  if (!normalized) {
    return true;
  }

  return (
    normalized ===
      DDA_TAMER_DEFAULT_IMAGE.toLowerCase() ||
    normalized.endsWith(
      "/mystery-man.svg"
    )
  );
}

const DDA_SYSTEM_ID =
  "digimon-digital-adventures";

function getWorldSetting(key, fallback = false) {
  try {
    return game.settings.get(DDA_SYSTEM_ID, key) ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

function localize(key) {
  return game.i18n.localize(key);
}

function localizeFallback(key, fallback = "") {
  const localized = game.i18n.localize(key);
  return localized === key ? fallback : localized;
}

function formatI18n(key, data = {}) {
  return game.i18n.format(key, data);
}

function hasExperiencedCreationBenefit(
  attributes = {}
) {
  const experienced =
    DDA_TAMER_TALENTS.find(
      (talent) =>
        talent.id === "experienced"
    );

  const requirement =
    experienced?.requirement ?? {};

  if (
    requirement.type !== "attribute" ||
    !requirement.key
  ) {
    return false;
  }

  const currentValue = Number(
    attributes[requirement.key]?.total ??
    attributes[requirement.key]?.value ??
    0
  );

  const requiredValue =
    getScaledTalentRequirement(
      requirement.value
    );

  return currentValue >= requiredValue;
}


const DDA_TAMER_ATTRIBUTE_DESCRIPTIONS = {
  agility: {
    pt: "Coordenação, reflexos e rapidez. Use para correr, escapar, equilibrar-se e reagir sob pressão.",
    en: "Coordination, reflexes, and speed. Use it to run, escape, keep balance, and react under pressure."
  },
  body: {
    pt: "Força física, resistência e presença corporal. Use para aguentar impacto, escalar, nadar e forçar passagem.",
    en: "Physical strength, endurance, and bodily presence. Use it to withstand impact, climb, swim, and force your way through."
  },
  charisma: {
    pt: "Expressão, influência e conexão social. Use para convencer, inspirar, blefar ou chamar atenção.",
    en: "Expression, influence, and social connection. Use it to persuade, inspire, bluff, or draw attention."
  },
  intelligence: {
    pt: "Raciocínio, memória e leitura de padrões. Use para investigar, deduzir, pesquisar e entender tecnologia.",
    en: "Reasoning, memory, and pattern reading. Use it to investigate, deduce, research, and understand technology."
  },
  willpower: {
    pt: "Determinação, autocontrole e coragem emocional. Use para resistir ao medo, manter o foco e seguir em frente.",
    en: "Determination, self-control, and emotional courage. Use it to resist fear, stay focused, and keep going."
  }
};

const DDA_TAMER_SKILL_DESCRIPTIONS = {
  evade: { pt: "Evitar perigo direto: esquivar, se proteger, sair da linha de ataque.", en: "Avoid direct danger: dodge, protect yourself, and get out of the line of attack." },
  precision: { pt: "Mirar, acertar, operar algo com cuidado ou fazer movimentos precisos.", en: "Aim, hit, operate something carefully, or perform precise movement." },
  stealth: { pt: "Mover-se sem chamar atenção, esconder-se e agir discretamente.", en: "Move unnoticed, hide, and act discreetly." },
  athletics: { pt: "Correr, saltar, escalar e realizar esforço físico em movimento.", en: "Run, jump, climb, and perform physical effort while moving." },
  endurance: { pt: "Aguentar dor, cansaço, clima ruim, veneno ou esforço prolongado.", en: "Withstand pain, fatigue, harsh conditions, poison, or prolonged effort." },
  featsOfStrength: { pt: "Empurrar, erguer, quebrar, segurar ou vencer pela força bruta.", en: "Push, lift, break, hold, or win through raw strength." },
  manipulate: { pt: "Mentir, negociar de forma torta, distrair ou conduzir alguém pela conversa.", en: "Lie, negotiate indirectly, distract, or steer someone through conversation." },
  performance: { pt: "Atuar, cantar, discursar, impressionar ou sustentar uma persona.", en: "Act, sing, speak, impress, or maintain a persona." },
  persuasion: { pt: "Convencer de forma honesta, inspirar confiança e aproximar pessoas.", en: "Convince honestly, inspire trust, and bring people closer." },
  decipherIntent: { pt: "Perceber intenções, emoções, mentiras e sinais sociais sutis.", en: "Read intentions, emotions, lies, and subtle social cues." },
  survival: { pt: "Orientar-se, encontrar recursos, lidar com ambiente hostil e improvisar abrigo.", en: "Navigate, find resources, handle hostile environments, and improvise shelter." },
  knowledge: { pt: "Saber fatos, lembrar informações e conectar pistas técnicas ou culturais.", en: "Know facts, remember information, and connect technical or cultural clues." },
  awareness: { pt: "Notar detalhes, emboscadas, pistas, sons, padrões e mudanças no ambiente.", en: "Notice details, ambushes, clues, sounds, patterns, and environmental changes." },
  bravery: { pt: "Enfrentar medo, perigo e pressão emocional sem recuar.", en: "Face fear, danger, and emotional pressure without backing down." },
  fortitude: { pt: "Persistir quando tudo está difícil; resistir desgaste físico e mental.", en: "Persist when things get hard; resist physical and mental strain." }
};

const DDA_TAMER_ATTRIBUTES = {
  agility: {
    label: "DDA.TamerAttribute.Agility",
    description: "DDA.TamerAttributeAgilityDescription"
  },
  body: {
    label: "DDA.TamerAttribute.Body",
    description: "DDA.TamerAttributeBodyDescription"
  },
  charisma: {
    label: "DDA.TamerAttribute.Charisma",
    description: "DDA.TamerAttributeCharismaDescription"
  },
  intelligence: {
    label: "DDA.TamerAttribute.Intelligence",
    description: "DDA.TamerAttributeIntelligenceDescription"
  },
  willpower: {
    label: "DDA.TamerAttribute.Willpower",
    description: "DDA.TamerAttributeWillpowerDescription"
  }
};

const DDA_TAMER_SKILLS = {
  evade: {
    label: "DDA.TamerSkill.Evade",
    attributes: ["agility", "willpower"],
    description: "DDA.TamerSkillEvadeDescription"
  },
  precision: {
    label: "DDA.TamerSkill.Precision",
    attributes: ["agility", "intelligence"],
    description: "DDA.TamerSkillPrecisionDescription"
  },
  stealth: {
    label: "DDA.TamerSkill.Stealth",
    attributes: ["agility", "body"],
    description: "DDA.TamerSkillStealthDescription"
  },
  athletics: {
    label: "DDA.TamerSkill.Athletics",
    attributes: ["body", "agility"],
    description: "DDA.TamerSkillAthleticsDescription"
  },
  endurance: {
    label: "DDA.TamerSkill.Endurance",
    attributes: ["body", "willpower"],
    description: "DDA.TamerSkillEnduranceDescription"
  },
  featsOfStrength: {
    label: "DDA.TamerSkill.FeatsOfStrength",
    attributes: ["body", "charisma"],
    description: "DDA.TamerSkillFeatsOfStrengthDescription"
  },
  manipulate: {
    label: "DDA.TamerSkill.Manipulate",
    attributes: ["charisma", "body"],
    description: "DDA.TamerSkillManipulateDescription"
  },
  performance: {
    label: "DDA.TamerSkill.Performance",
    attributes: ["charisma", "agility"],
    description: "DDA.TamerSkillPerformanceDescription"
  },
  persuasion: {
    label: "DDA.TamerSkill.Persuasion",
    attributes: ["charisma", "intelligence"],
    description: "DDA.TamerSkillPersuasionDescription"
  },
  decipherIntent: {
    label: "DDA.TamerSkill.DecipherIntent",
    attributes: ["intelligence", "charisma"],
    description: "DDA.TamerSkillDecipherIntentDescription"
  },
  survival: {
    label: "DDA.TamerSkill.Survival",
    attributes: ["intelligence", "willpower"],
    description: "DDA.TamerSkillSurvivalDescription"
  },
  knowledge: {
    label: "DDA.TamerSkill.Knowledge",
    attributes: ["intelligence"],
    description: "DDA.TamerSkillKnowledgeDescription"
  },
  awareness: {
    label: "DDA.TamerSkill.Awareness",
    attributes: ["willpower", "agility"],
    description: "DDA.TamerSkillAwarenessDescription"
  },
  bravery: {
    label: "DDA.TamerSkill.Bravery",
    attributes: ["willpower", "body"],
    description: "DDA.TamerSkillBraveryDescription"
  },
  fortitude: {
    label: "DDA.TamerSkill.Fortitude",
    attributes: ["willpower", "intelligence"],
    description: "DDA.TamerSkillFortitudeDescription"
  }
};

export class DDATamerWizard extends DDATamerWizardApplicationBase {
  constructor(options = {}) {
    super(options);

    this.linkContext = options.linkContext ?? null;
    this.stepIndex = 0;
    this._pendingScrollTop = null;
    this._pendingScrollStepIndex = null;
    this._pendingScrollRestoreId = null;
    this._scrollRestoreId = 0;

    this.steps = [
      "welcome",
      "identity",
      "aspects",
      "attributes",
      "skills",
      "inspiration",
      "torments",
      "summary"
    ];

    const campaignRules = this._getCampaignRules();
    const initialTorments = this._buildInitialTorments(campaignRules.startingMarkedTormentBoxes);

    this.data = {
      identity: {
        name: "",
        age: "",
        concept: "",
        pronouns: "",
        description: "",
        img: DDA_TAMER_DEFAULT_IMAGE
      },

      aspects: {
        major: {
          name: "",
          description: ""
        },
        minor: {
          name: "",
          description: ""
        }
      },

      campaignRules,

      ap: {
        base: campaignRules.startingAttributePoints,
        spent: 0,
        remaining: campaignRules.startingAttributePoints,
        startingCap: campaignRules.attributeStartingCap,
        finalCap: campaignRules.attributeFinalCap,
        capUsed: 0,
        capLimit: 1
      },

      sp: {
        base: campaignRules.startingSkillPoints,
        spent: 0,
        remaining: campaignRules.startingSkillPoints,
        startingCap: campaignRules.skillStartingCap,
        finalCap: campaignRules.skillFinalCap,
        capUsed: 0,
        capLimit: 1
      },

      attributes: this._buildInitialAttributes(),

      skills: this._buildInitialSkills(),

      inspiration: {
        value: 1,
        temporary: 0,
        max: 3,
        luckyNumber: ""
      },

      torments: initialTorments,

      tormentBudget: {
        requiredMarked: campaignRules.startingMarkedTormentBoxes,
        usedMarked: campaignRules.startingMarkedTormentBoxes,
        remainingMarked: 0,
        maxTorments: 2
      },

      derived: {
        woundBoxes: 3,
        movement: 0,
        stage: 1,
        size: "medium"
      },

      postCreate: {
        createDigimon: false,
        linkPair: true,
        hidden: Boolean(this.linkContext?.digimonUuid)
      },

      compatibility: foundry.utils.deepClone(this.linkContext?.compatibility ?? null),
      compatibilityQuestionnaireEnabled: getWorldSetting("enableHiddenCompatibilityQuestionnaire", false),

      validation: {
        errors: [],
        warnings: []
      }
    };
  }

  static DEFAULT_OPTIONS = {
    id: "dda-tamer-wizard",
    classes: ["dda", "dda-wizard", "dda-tamer-wizard"],
    position: {
      width: 900,
      height: 760
    },
    window: {
      resizable: true
    }
  };

  static PARTS = {
    form: {
      template: "systems/digimon-digital-adventures/templates/wizard/tamer-wizard.hbs",
      scrollable: [".dda-wizard-body"]
    }
  };

  get title() {
    return localize("DDA.TamerWizard.Title");
  }

  async _prepareContext(options = {}) {
    const context = await super._prepareContext(options);
    return Object.assign(context, this.getData());
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const root = this._getRootElement(this.element);
    if (!root) return;

    this.activateListeners($(root));
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
    this._recalculate();
    this._validate();

return {
  step:
    this.currentStep,

  stepIndex:
    this.stepIndex + 1,

  totalSteps:
    this.steps.length,

  isFirstStep:
    this.isFirstStep,

  isLastStep:
    this.isLastStep,

  data:
    this.data,

  campaignRules:
    this.data.campaignRules,

  imageMissing:
    isMissingTamerImage(
      this.data.identity.img
    ),

  worldImageDirectory:
    getTamerWorldImageDirectory(),

  progressLabel:
    this._getProgressLabel(),

  progressSteps:
    this._getProgressSteps(),

  guide:
    this._getGuideData()
};
  }

  activateListeners(html) {

    html.find("[data-action='next']").on("click", this._onNext.bind(this));
    html.find("[data-action='back']").on("click", this._onBack.bind(this));
    html.find("[data-action='create']").on("click", this._onCreate.bind(this));

    html.find("[data-attribute-increase]").on("click", this._onIncreaseAttribute.bind(this));
    html.find("[data-attribute-decrease]").on("click", this._onDecreaseAttribute.bind(this));

    html.find("[data-skill-increase]").on("click", this._onIncreaseSkill.bind(this));
    html.find("[data-skill-decrease]").on("click", this._onDecreaseSkill.bind(this));

    html.find("[data-torment-increase]").on("click", this._onIncreaseTorment.bind(this));
    html.find("[data-torment-decrease]").on("click", this._onDecreaseTorment.bind(this));

html
  .find("[data-lucky-number]")
  .on(
    "click",
    this._onSelectLuckyNumber.bind(this)
  );

html
  .find(
    "[data-action='select-tamer-image']"
  )
  .on(
    "click",
    this._onSelectTamerImage.bind(this)
  );

html
  .find(
    "input[data-path], textarea[data-path]"
  )
  .on(
    "blur",
    this._onInputChange.bind(this)
  );
    html.find("select[data-path]").on("change", this._onInputChange.bind(this));

    this._restoreScrollPosition(html);
  }

  _getCampaignRules() {
    return getCampaignLevelSummary();
  }

  _refreshCampaignRules() {
    const campaignRules = this._getCampaignRules();

    this.data.campaignRules = campaignRules;

    this.data.ap.base = getStartingAttributePoints();
    this.data.ap.startingCap = getAttributeStartingCap();
    this.data.ap.finalCap = getAttributeFinalCap();

    this.data.sp.base = getStartingSkillPoints();
    this.data.sp.startingCap = getSkillStartingCap();
    this.data.sp.finalCap = getSkillFinalCap();

    this.data.tormentBudget.requiredMarked = getStartingMarkedTormentBoxes();
  }

  _buildInitialTorments(requiredMarked = 7) {
    const total = Math.max(0, Number(requiredMarked ?? 7));
    const first = Math.floor(total / 2);
    const second = total - first;

    return [
      {
        name: "",
        description: "",
        marked: first,
        max: 10
      },
      {
        name: "",
        description: "",
        marked: second,
        max: 10
      }
    ];
  }

  _buildInitialAttributes() {
    const attributes = {};

    for (const [key, config] of Object.entries(DDA_TAMER_ATTRIBUTES)) {
      attributes[key] = {
        key,
        label: localize(config.label),
        labelKey: config.label,
        description: localizeFallback(config.description, text(DDA_TAMER_ATTRIBUTE_DESCRIPTIONS[key]?.pt ?? "", DDA_TAMER_ATTRIBUTE_DESCRIPTIONS[key]?.en ?? "")),
        descriptionKey: config.description,
        base: 1,
        spent: 0,
        total: 1
      };
    }

    return attributes;
  }

  _buildInitialSkills() {
    const skills = {};

    for (const [key, config] of Object.entries(DDA_TAMER_SKILLS)) {
      skills[key] = {
        key,
        label: localize(config.label),
        labelKey: config.label,
        description: localizeFallback(config.description, text(DDA_TAMER_SKILL_DESCRIPTIONS[key]?.pt ?? "", DDA_TAMER_SKILL_DESCRIPTIONS[key]?.en ?? "")),
        descriptionKey: config.description,
        attributes: config.attributes,
        spent: 0,
        total: 0,
        cap: 1
      };
    }

    return skills;
  }

  async _onInputChange(event) {
    const input = event.currentTarget;
    const path = input.dataset.path;

    if (!path) return;

    foundry.utils.setProperty(this.data, path, input.value);
  }

  async _onSelectTamerImage(event) {
  event.preventDefault();
  event.stopPropagation();

  this._syncInputsFromHtml();

  const FilePickerClass =
    getDdaFilePickerClass();

  if (!FilePickerClass) {
    ui.notifications.warn(
      localize(
        "DDA.TamerWizard.Warning.FilePickerUnavailable"
      )
    );

    return;
  }

  const currentImage = String(
    this.data.identity.img ?? ""
  ).trim();

  /*
   * Enquanto estiver usando o mystery-man,
   * o FilePicker abre diretamente dentro da
   * pasta do mundo.
   *
   * Depois de escolher uma imagem, ele abre
   * novamente no caminho atualmente usado.
   */
  const currentPath =
    isMissingTamerImage(currentImage)
      ? getTamerWorldImageDirectory()
      : currentImage;

  const picker =
    new FilePickerClass({
      type: "image",

      current:
        currentPath,

      callback: (selectedPath) => {
        const path = String(
          selectedPath ?? ""
        ).trim();

        if (!path) {
          return;
        }

        this.data.identity.img =
          path;

        this._recalculate();
        this._validate();
        this._renderPreservingScroll();
      },

      top:
        (
          this.position?.top ??
          100
        ) + 40,

      left:
        (
          this.position?.left ??
          100
        ) + 40
    });

  /*
   * O FilePicker continuará servindo para
   * selecionar arquivos existentes, mesmo
   * quando o cargo não puder enviar arquivos.
   */
  if (picker.canUpload === false) {
    ui.notifications.info(
      localize(
        "DDA.TamerWizard.Warning.UploadPermission"
      )
    );
  }

  picker.render(true);
}

async _onNext(event) {
  event.preventDefault();

  this._syncInputsFromHtml();

  this._recalculate();
  this._validate();

  if (!this._canAdvance()) {
    ui.notifications.warn(this.data.validation.errors[0] ?? localize("DDA.TamerWizard.Validation.ReviewStep"));
    this._renderAtStepTop();
    return;
  }

  if (!this.isLastStep) {
    this.stepIndex += 1;
    this._renderAtStepTop();
  }
}

async _onBack(event) {
  event.preventDefault();

  if (!this.isFirstStep) {
    this.stepIndex -= 1;
    this._renderAtStepTop();
  }
}

async _onCreate(event) {
  event.preventDefault();

  this._syncInputsFromHtml();

  this._recalculate();
  this._validate();

  if (this.data.validation.errors.length > 0) {
    ui.notifications.warn(this.data.validation.errors[0]);
    this._renderAtStepTop();
    return;
  }

const actor = await Actor.create(this._buildActorData());
await ensureActorOwner(actor, game.user?.id);

const tormentItems = this._buildTormentItemData();

if (tormentItems.length) {
  await actor.createEmbeddedDocuments("Item", tormentItems);
}

await this._linkWithPendingDigimon(actor);

ui.notifications.info(formatI18n("DDA.TamerWizard.Info.Created", { name: actor.name }));

const shouldOpenDigimonWizard = !this.linkContext?.digimonUuid && Boolean(this.data.postCreate?.createDigimon);

this.close();
actor.sheet?.render(true);

if (shouldOpenDigimonWizard) {
  await this._openDigimonWizardAfterCreate(actor);
}

}

  async _onIncreaseAttribute(event) {
    event.preventDefault();

    const key = event.currentTarget.dataset.attributeIncrease;
    const attribute = this.data.attributes[key];

    if (!attribute) return;

    this._recalculate();

    if (this.data.ap.remaining <= 0) {
      ui.notifications.warn(localize("DDA.TamerWizard.Warning.NoAP"));
      return;
    }

    if (attribute.total >= this.data.ap.startingCap) {
      ui.notifications.warn(formatI18n("DDA.TamerWizard.Warning.AttributeCreationCap", { cap: this.data.ap.startingCap }));
      return;
    }

    const wouldReachCap = attribute.total + 1 === this.data.ap.startingCap;

    if (wouldReachCap && this.data.ap.capUsed >= this.data.ap.capLimit) {
      ui.notifications.warn(formatI18n("DDA.TamerWizard.Validation.AttributeAtCap", { cap: this.data.ap.startingCap }));
      return;
    }

    attribute.spent += 1;

    this._renderPreservingScroll();
  }

  async _onDecreaseAttribute(event) {
    event.preventDefault();

    const key = event.currentTarget.dataset.attributeDecrease;
    const attribute = this.data.attributes[key];

    if (!attribute) return;
    if (attribute.spent <= 0) return;

    attribute.spent -= 1;

    this._renderPreservingScroll();
  }

  async _onIncreaseSkill(event) {
    event.preventDefault();

    const key = event.currentTarget.dataset.skillIncrease;
    const skill = this.data.skills[key];

    if (!skill) return;

    this._recalculate();

    if (this.data.sp.remaining <= 0) {
      ui.notifications.warn(localize("DDA.TamerWizard.Warning.NoSP"));
      return;
    }

    if (skill.total >= this.data.sp.startingCap) {
      ui.notifications.warn(formatI18n("DDA.TamerWizard.Warning.SkillCreationCap", { cap: this.data.sp.startingCap }));
      return;
    }

    if (skill.total + 1 > skill.cap) {
      ui.notifications.warn(formatI18n("DDA.TamerWizard.Warning.SkillLinkedCap", { skill: skill.label, cap: skill.cap }));
      return;
    }

    const wouldReachCap = skill.total + 1 === this.data.sp.startingCap;

    if (wouldReachCap && this.data.sp.capUsed >= this.data.sp.capLimit) {
      ui.notifications.warn(formatI18n("DDA.TamerWizard.Validation.SkillAtCap", { cap: this.data.sp.startingCap }));
      return;
    }

    skill.spent += 1;

    this._renderPreservingScroll();
  }

  async _onDecreaseSkill(event) {
    event.preventDefault();

    const key = event.currentTarget.dataset.skillDecrease;
    const skill = this.data.skills[key];

    if (!skill) return;
    if (skill.spent <= 0) return;

    skill.spent -= 1;

    this._renderPreservingScroll();
  }

  async _onIncreaseTorment(event) {
    event.preventDefault();

    const index = Number(event.currentTarget.dataset.tormentIncrease);
    const torment = this.data.torments[index];

    if (!torment) return;

    this._recalculate();

    if (torment.marked >= torment.max) return;

    torment.marked += 1;

    this._renderPreservingScroll();
  }

  async _onDecreaseTorment(event) {
    event.preventDefault();

    const index = Number(event.currentTarget.dataset.tormentDecrease);
    const torment = this.data.torments[index];

    if (!torment) return;

    if (torment.marked <= 0) return;

    torment.marked -= 1;

    this._renderPreservingScroll();
  }

  async _onSelectLuckyNumber(event) {
    event.preventDefault();

    const luckyNumber = event.currentTarget.dataset.luckyNumber;

    if (!luckyNumber) return;

    this.data.inspiration.luckyNumber = Number(luckyNumber);

    this._renderPreservingScroll();
  }

  _recalculate() {
    this._refreshCampaignRules();
    this._recalculateAttributes();

    this._recalculateExperiencedCreationBenefits();

    this._recalculateSkills();
    this._recalculateInspiration();
    this._recalculateTorments();
    this._recalculateDerived();
  }

  _recalculateAttributes() {
    let spent = 0;
    let capUsed = 0;

    for (const attribute of Object.values(this.data.attributes)) {
      attribute.total = Number(attribute.base ?? 1) + Number(attribute.spent ?? 0);
      spent += Number(attribute.spent ?? 0);

      if (attribute.total >= this.data.ap.startingCap) {
        capUsed += 1;
      }
    }

    this.data.ap.spent = spent;
    this.data.ap.remaining =
      this.data.ap.base - spent;

    this.data.ap.capUsed = capUsed;
  }

  _recalculateExperiencedCreationBenefits() {
    const experiencedActive =
      hasExperiencedCreationBenefit(
        this.data.attributes
      );

    this.data.sp.base =
      getStartingSkillPoints() +
      (experiencedActive ? 1 : 0);

    this.data.sp.capLimit =
      experiencedActive ? 2 : 1;
  }

  _recalculateSkills() {
    let spent = 0;
    let capUsed = 0;

    for (const skill of Object.values(this.data.skills)) {
      skill.total = Number(skill.spent ?? 0);
      skill.cap = this._getSkillCap(skill);
      spent += Number(skill.spent ?? 0);

      if (skill.total >= this.data.sp.startingCap) {
        capUsed += 1;
      }
    }

    this.data.sp.spent = spent;
    this.data.sp.remaining = this.data.sp.base - spent;
    this.data.sp.capUsed = capUsed;
  }

  _getSkillCap(skill) {
    const attributeValues = skill.attributes.map((attributeKey) => {
      return Number(this.data.attributes[attributeKey]?.total ?? 0);
    });

    return Math.max(...attributeValues, 0);
  }

  _recalculateInspiration() {
    const willpower = Number(this.data.attributes.willpower?.total ?? 1);

    this.data.inspiration.max = 2 + willpower;

    if (this.data.inspiration.value > this.data.inspiration.max) {
      this.data.inspiration.value = this.data.inspiration.max;
    }
  }

  _recalculateTorments() {
    const usedMarked = this.data.torments.reduce((total, torment) => {
      return total + Number(torment.marked ?? 0);
    }, 0);

    this.data.tormentBudget.usedMarked = usedMarked;
    this.data.tormentBudget.remainingMarked = this.data.tormentBudget.requiredMarked - usedMarked;
  }

  _recalculateDerived() {
    const agility = Number(this.data.attributes.agility?.total ?? 1);
    const endurance = Number(this.data.skills.endurance?.total ?? 0);

    this.data.derived.woundBoxes = 3 + endurance;
    this.data.derived.movement = agility;
    this.data.derived.stage = 1;
    this.data.derived.size = "medium";
  }

  _validate() {
    const errors = [];
    const warnings = [];

if (
  this.currentStep === "identity" ||
  this.currentStep === "summary"
) {
  if (
    !this.data.identity.name
      ?.trim()
  ) {
    errors.push(
      localize(
        "DDA.TamerWizard.Validation.NameRequired"
      )
    );
  }
}

if (
  this.currentStep === "summary" &&
  isMissingTamerImage(
    this.data.identity.img
  )
) {
  warnings.push(
    localize(
      "DDA.TamerWizard.Validation.ImageFallback"
    )
  );
}

    if (this.currentStep === "aspects" || this.currentStep === "summary") {
      if (!this.data.aspects.major.name?.trim()) {
        warnings.push(localize("DDA.TamerWizard.Validation.MajorAspectWarning"));
      }

      if (!this.data.aspects.minor.name?.trim()) {
        warnings.push(localize("DDA.TamerWizard.Validation.MinorAspectWarning"));
      }
    }

    if (this.currentStep === "attributes" || this.currentStep === "summary") {
      if (this.data.ap.remaining < 0) {
        errors.push(localize("DDA.TamerWizard.Validation.APOverSpent"));
      }

      if (this.data.ap.capUsed > this.data.ap.capLimit) {
        errors.push(formatI18n("DDA.TamerWizard.Validation.AttributeAtCap", { cap: this.data.ap.startingCap }));
      }
    }

    if (this.currentStep === "skills" || this.currentStep === "summary") {
      if (this.data.sp.remaining < 0) {
        errors.push(localize("DDA.TamerWizard.Validation.SPOverSpent"));
      }

      if (this.data.sp.capUsed > this.data.sp.capLimit) {
        errors.push(formatI18n("DDA.TamerWizard.Validation.SkillAtCap", { cap: this.data.sp.startingCap }));
      }

      for (const skill of Object.values(this.data.skills)) {
        if (skill.total > skill.cap) {
          errors.push(formatI18n("DDA.TamerWizard.Validation.SkillAboveCap", { skill: skill.label, cap: skill.cap }));
        }
      }
    }

    if (this.currentStep === "inspiration" || this.currentStep === "summary") {
      if (!this.data.inspiration.luckyNumber) {
        errors.push(localize("DDA.TamerWizard.Validation.LuckyNumberRequired"));
      }
    }

    if (this.currentStep === "torments" || this.currentStep === "summary") {
      if (this.data.tormentBudget.usedMarked !== this.data.tormentBudget.requiredMarked) {
        errors.push(formatI18n("DDA.TamerWizard.Validation.TormentBoxesExact", { boxes: this.data.tormentBudget.requiredMarked }));
      }

      const namedTorments = this.data.torments.filter((torment) => torment.name?.trim());

      if (!namedTorments.length) {
        warnings.push(localize("DDA.TamerWizard.Validation.NameTormentWarning"));
      }
    }

    this.data.validation.errors = errors;
    this.data.validation.warnings = warnings;
  }

  _canAdvance() {
    if (this.currentStep === "welcome") return true;

    this._recalculate();
    this._validate();

    return this.data.validation.errors.length === 0;
  }

  _buildActorData() {
    const name = this.data.identity.name?.trim() || localize("DDA.TamerWizard.DefaultName");
    const actorImage = String(
      this.data.identity.img || DDA_TAMER_DEFAULT_IMAGE
    ).trim() || DDA_TAMER_DEFAULT_IMAGE;
    const luckyNumber = Number(this.data.inspiration.luckyNumber || 1);
    const ipValue = Number(this.data.inspiration.value ?? 1);
    const ipTemp = Number(this.data.inspiration.temporary ?? 0);
    const ipMax = Number(this.data.inspiration.max ?? 3);
    const woundsMax = Number(this.data.derived.woundBoxes ?? 3);
    const movement = Number(this.data.derived.movement ?? 1);

    return {
      name,
      type: "character",
      img: actorImage,
      prototypeToken: {
        name,
        texture: {
          src: actorImage
        },
        actorLink: true
      },

      system: {
        luckyNumber,

        identity: foundry.utils.deepClone(this.data.identity),

        profile: {
          synopsis: this.data.identity.concept?.trim() || "",
          appearance: "",
          background: this.data.identity.description?.trim() || "",
          personality: ""
        },

        compatibility: foundry.utils.deepClone(this.data.compatibility ?? null),

        aspects: {
          major: {
            name: this.data.aspects.major.name?.trim() || "",
            description: this.data.aspects.major.description?.trim() || "",
            positiveUse: "",
            negativeUse: "",
            uses: {
              value: 1,
              max: 1
            }
          },
          minor: {
            name: this.data.aspects.minor.name?.trim() || "",
            description: this.data.aspects.minor.description?.trim() || "",
            positiveUse: "",
            negativeUse: "",
            uses: {
              value: 2,
              max: 2
            }
          }
        },

        resources: {
          ip: {
            label: "DDA.Resource.IP.Short",
            value: ipValue,
            temp: ipTemp,
            max: ipMax,
            temporarySources: []
          },
          evolutionPoints: {
            label: "DDA.Resource.EvolutionPoints.Short",
            value: 0,
            max: 0
          },
          ap: {
            label: "PA",
            spent: this.data.ap.spent,
            max: this.data.ap.base
          },
          sp: {
            label: "PP",
            spent: this.data.sp.spent,
            max: this.data.sp.base
          }
        },

        ap: foundry.utils.deepClone(this.data.ap),
        sp: foundry.utils.deepClone(this.data.sp),

        attributes: this._buildAttributeSystemData(),
        skills: this._buildSkillSystemData(),

        inspiration: foundry.utils.deepClone(this.data.inspiration),

        torments: this._buildTormentSystemData(),
        tormentBudget: foundry.utils.deepClone(this.data.tormentBudget),

        derived: {
          wounds: {
            label: "DDA.Resource.WoundBoxes",
            value: woundsMax,
            max: woundsMax,
            temp: {
              value: 0,
              source: "",
              duration: ""
            }
          },
          movement: {
            label: "DDA.Resource.Movement",
            value: movement
          },
          sv: {
            label: "SV",
            value: Number(this.data.derived.stage ?? 1)
          },
          size: {
            label: "DDA.Resource.Size",
            value: this.data.derived.size || "medium"
          }
        },

        advancement: {
          milestones: {
            completed: 0,
            method: "narrative"
          },
          experience: {
            party: {
              value: 0,
              max: 7
            }
          },
          growthPoints: {
            available: 0,
            spent: 0,
            perMilestone: 3
          },
          attributeCap: {
            current: this.data.ap.startingCap,
            final: this.data.ap.finalCap
          }
        },

        evolution: {
          defaultRange: {
            value: 2,
            template: "limited",
            manualValue: 2,
            defaultStagePolicy: "range"
          },
          completedMilestones: 0
        },

        blastEvolution: {
          uses: {
            value: 1,
            max: 1
          },
          milestoneRecovery: [3, 6]
        },

        partner: {
          name: "",
          uuid: "",
          currentFormUuid: "",
          currentFormName: ""
        },

        wizard: {
          createdByWizard: true,
          createdAt: new Date().toISOString(),
          campaignLevel: this.data.campaignRules?.key ?? "standard",
          campaignRules: foundry.utils.deepClone(this.data.campaignRules),
          compatibility: foundry.utils.deepClone(this.data.compatibility ?? null)
        }
      }
    };
  }

  _buildAttributeSystemData() {
    const attributes = {};

    for (const [key, attribute] of Object.entries(this.data.attributes)) {
      attributes[key] = {
        label: attribute.labelKey ?? attribute.label,
        base: attribute.total,
        bonus: 0,
        total: attribute.total,
        value: attribute.total,

        creation: {
          startingBase: attribute.base,
          spent: attribute.spent
        }
      };
    }

    return attributes;
  }

  _buildSkillSystemData() {
    const skills = {};

    for (const [key, skill] of Object.entries(this.data.skills)) {
      skills[key] = {
        label: skill.labelKey ?? skill.label,
        attributes: skill.attributes,
        base: skill.total,
        bonus: 0,
        total: skill.total,
        value: skill.total,

        creation: {
          spent: skill.spent
        }
      };
    }

    return skills;
  }

  _getProgressLabel() {
    const labels = {
      welcome: "DDA.TamerWizard.Progress.Welcome",
      identity: "DDA.TamerWizard.Progress.Identity",
      aspects: "DDA.TamerWizard.Progress.Aspects",
      attributes: "DDA.TamerWizard.Progress.Attributes",
      skills: "DDA.TamerWizard.Progress.Skills",
      inspiration: "DDA.TamerWizard.Progress.Inspiration",
      torments: "DDA.TamerWizard.Progress.Torments",
      summary: "DDA.TamerWizard.Progress.Summary"
    };

    return localize(labels[this.currentStep] ?? "DDA.TamerWizard.Title");
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

  _getRootElement(html = this.element) {
  if (!html) return null;

  if (html instanceof HTMLElement) return html;

  if (html[0] instanceof HTMLElement) return html[0];

  return null;
}

_getScrollElement(html = this.element) {
  const root = this._getRootElement(html);

  if (!root) return null;

  if (root.matches?.("[data-dda-scroll-container], .dda-wizard-body")) {
    return root;
  }

  const scrollElement = root.querySelector(
    "[data-dda-scroll-container], .dda-wizard-body"
  );

  if (scrollElement) return scrollElement;

  const appRoot = root.closest?.(".window-app.dda-wizard")
    ?? this._getRootElement(this.element);

  const appScrollElement = appRoot?.querySelector?.(
    "[data-dda-scroll-container], .dda-wizard-body"
  );

  if (appScrollElement) return appScrollElement;

  if (root.matches?.(".window-content")) return root;

  return root.querySelector(".window-content") ?? root;
}

_renderPreservingScroll() {
  const scrollElement = this._getScrollElement(this.element);

  this._pendingScrollTop = scrollElement?.scrollTop ?? 0;
  this._pendingScrollStepIndex = this.stepIndex;
  this._pendingScrollRestoreId = ++this._scrollRestoreId;

  return this.render(false);
}

_restoreScrollPosition(html = this.element) {
  if (this._pendingScrollTop === null || this._pendingScrollTop === undefined) return;

  const scrollTop = this._pendingScrollTop;
  const stepIndex = this._pendingScrollStepIndex;
  const restoreId = this._pendingScrollRestoreId;

  this._pendingScrollTop = null;
  this._pendingScrollStepIndex = null;
  this._pendingScrollRestoreId = null;

  const restore = () => {
    if (restoreId !== this._scrollRestoreId) return;
    if (stepIndex !== this.stepIndex) return;

    const scrollElement = this._getScrollElement(this.element)
      ?? this._getScrollElement(html);

    if (scrollElement) {
      scrollElement.scrollTop = scrollTop;
    }
  };

  /*
   * O ciclo de renderização troca o conteúdo em mais de uma fase. Restaurar somente
   * no primeiro frame deixa o foco/layout dos botões de Perícias, Inspiração e
   * Tormentos sobrescrever a posição logo depois. Mantemos a posição durante
   * os dois frames de layout e uma última vez após o ciclo de foco do Foundry.
   */
  restore();

  window.requestAnimationFrame(() => {
    restore();
    window.requestAnimationFrame(restore);
  });

  window.setTimeout(restore, 50);
}

_renderAtStepTop() {
  this._scrollRestoreId += 1;
  this._pendingScrollTop = null;
  this._pendingScrollStepIndex = null;
  this._pendingScrollRestoreId = null;

  return this.render(false);
}

_syncInputsFromHtml(html = this.element) {
  const root = this._getRootElement(html);

  if (!root) return;

  root.querySelectorAll("[data-path]").forEach((input) => {
    const path = input.dataset.path;

    if (!path) return;

    let value = input.value;

    if (input.type === "checkbox") {
      value = input.checked;
    }

    foundry.utils.setProperty(this.data, path, value);
  });
}

_buildTormentSystemData() {
  return this.data.torments
    .map((torment, index) => {
      const marked = Number(torment.marked ?? 0);
      const max = Number(torment.max ?? 10);

      return {
        id: torment.id ?? `torment-${index + 1}`,
        name: torment.name?.trim() || formatI18n("DDA.TamerWizard.DefaultTormentName", { number: index + 1 }),
        description: torment.description?.trim() || "",

        marked,
        value: marked,
        max,

        boxes: {
          value: marked,
          marked,
          max
        }
      };
    })
    .filter((torment) => {
      return torment.name?.trim()
        || torment.description?.trim()
        || Number(torment.marked ?? 0) > 0;
    });
}

_buildTormentItemData() {
  return this._buildTormentSystemData()
    .filter((torment) => {
      return torment.name?.trim()
        || torment.description?.trim()
        || Number(torment.marked ?? 0) > 0;
    })
    .map((torment, index) => {
      const marked = Number(torment.marked ?? torment.value ?? torment.boxes?.marked ?? 0);
      const max = Number(torment.max ?? torment.boxes?.max ?? 10);

      return {
        name: torment.name?.trim() || formatI18n("DDA.TamerWizard.DefaultTormentName", { number: index + 1 }),
        type: "torment",
        img: "icons/svg/terror.svg",

        system: {
          description: torment.description?.trim() || "",

          marked,
          value: marked,
          max,

          boxes: {
            value: marked,
            marked,
            max
          }
        }
      };
    });
}


async _linkWithPendingDigimon(tamerActor) {
  const digimonUuid = this.linkContext?.digimonUuid;

  if (!digimonUuid) return;

  const digimonActor = await fromUuid(digimonUuid);

  if (!digimonActor || digimonActor.type !== "digimon") {
    ui.notifications.warn(text("O Digimon criado anteriormente não foi encontrado para vincular.", "The previously created Digimon could not be found for pairing."));
    return;
  }

  const compatibility = foundry.utils.deepClone(this.data.compatibility ?? digimonActor.system?.compatibility ?? null);

  const tamerUpdate = {
    "system.partner.name": digimonActor.name,
    "system.partner.uuid": digimonActor.uuid,
    "system.partner.currentFormUuid": digimonActor.uuid,
    "system.partner.currentFormName": digimonActor.name
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

async _openDigimonWizardAfterCreate(tamerActor) {
  const { DDADigimonWizard } = await import("./dda-digimon-wizard.js");

const startingStageOverride = String(tamerActor.system?.partner?.startingStageOverride ?? "").trim();
const defaultStartingStage = String(getWorldSetting("defaultPartnerStartingStage", "child") ?? "child").trim();
const effectiveStartingStage = startingStageOverride || defaultStartingStage || "child";

new DDADigimonWizard({
  linkContext: {
    tamerUuid: tamerActor.uuid,
    tamerName: tamerActor.name,
    startingStage: effectiveStartingStage,
    compatibility: foundry.utils.deepClone(tamerActor.system?.compatibility ?? null)
  }
}).render(true);
}

  _getGuideData() {
    const ap = this.data.ap?.base ?? 10;
    const sp = this.data.sp?.base ?? 25;
    const attributeCap = this.data.ap?.startingCap ?? 5;
    const skillCap = this.data.sp?.startingCap ?? 5;
    const tormentBoxes = this.data.tormentBudget?.requiredMarked ?? 7;
    const level = this.data.campaignRules?.label ?? "Standard";
    const apRemaining = this.data.ap?.remaining ?? ap;
    const spRemaining = this.data.sp?.remaining ?? sp;

    const guides = {
      welcome: {
        title: text("Wizardmon ajusta o Digivice:", "Wizardmon adjusts the Digivice:"),
        text: text(
          `Vamos criar um Digi-Escolhido no modo ${level}. O wizard divide a ficha em pedaços pequenos: identidade, Aspectos, Atributos, Perícias, Inspiração e Tormentos. Não tente escrever o romance inteiro agora; deixe a ficha pronta para jogar e refine a história durante a sessão.`,
          `We are creating a Tamer in ${level} mode. The wizard breaks the sheet into small pieces: identity, Aspects, Attributes, Skills, Inspiration, and Torments. Do not write the whole novel now; get the sheet ready to play and refine the story during the session.`
        )
      },
      identity: {
        title: text("Wizardmon abre o perfil:", "Wizardmon opens the profile:"),
        text: text("Nome e conceito dizem ao grupo quem entrou na aventura. Uma boa frase de conceito já resolve muito: estudante cético, atleta impulsiva, irmão protetor, criança perdida no Mundo Digital. A descrição curta serve para lembrar voz, aparência e atitude na mesa.", "Name and concept tell the group who just entered the adventure. A strong concept phrase solves a lot: skeptical student, impulsive athlete, protective sibling, lost child in the Digital World. The short description helps remember voice, appearance, and attitude at the table.")
      },
      aspects: {
        title: text("Wizardmon traduz os Aspectos:", "Wizardmon translates the Aspects:"),
        text: text("Aspectos são frases que tornam o personagem dramático. O Aspecto Maior deve aparecer bastante e definir o coração do Digi-Escolhido. O Menor pode ser uma mania, relação, medo, promessa ou talento estranho. Escreva algo que você queira ver dando problema e ajudando em cena.", "Aspects are phrases that make the character dramatic. The Major Aspect should appear often and define the Tamer's heart. The Minor Aspect can be a habit, relationship, fear, promise, or strange talent. Write something you want to see causing trouble and helping during scenes.")
      },
      attributes: {
        title: text("Wizardmon conta os Atributos:", "Wizardmon counts the Attributes:"),
        text: text(
          `Você tem ${ap} PA para distribuir. Atributos são a base do personagem; nesta criação, o limite inicial é ${attributeCap} e só um Atributo pode chegar nesse limite. Ainda restam ${apRemaining} PA. Se travar, aumente o que combina com o conceito, não o que parece matematicamente perfeito.`,
          `You have ${ap} AP to distribute. Attributes are the character's foundation; during creation, the starting cap is ${attributeCap}, and only one Attribute can reach that cap. You still have ${apRemaining} AP left. If you get stuck, raise what fits the concept, not what looks mathematically perfect.`
        )
      },
      skills: {
        title: text("Wizardmon calibra as Perícias:", "Wizardmon calibrates the Skills:"),
        text: text(
          `Você tem ${sp} PP para distribuir. Perícias mostram o que o Digi-Escolhido sabe fazer sob pressão. O limite inicial é ${skillCap}, mas cada Perícia também respeita os Atributos ligados a ela. Ainda restam ${spRemaining} PP. Atenção: Perícia 0 ainda pode ser usada, mas aplica -1 na rolagem. Escolha algumas especialidades claras em vez de tentar ser bom em tudo.`,
          `You have ${sp} SP to distribute. Skills show what the Tamer can do under pressure. The starting cap is ${skillCap}, but each Skill also respects its linked Attributes. You still have ${spRemaining} SP left. Warning: Skill 0 can still be used, but applies -1 to the roll. Pick a few clear specialties instead of trying to be good at everything.`
        )
      },
      inspiration: {
        title: text("Wizardmon encontra o número da sorte:", "Wizardmon finds the lucky number:"),
        text: text("O Número da Sorte é uma pequena assinatura do personagem. Ele ajuda a mesa a lembrar que este Digi-Escolhido tem um padrão, uma superstição, um detalhe pessoal. Escolha um número que combine com ele; não precisa ser otimizado.", "The Lucky Number is a small signature for the character. It helps the table remember that this Tamer has a pattern, superstition, or personal detail. Pick a number that fits; it does not need to be optimized.")
      },
      torments: {
        title: text("Wizardmon baixa o brilho da tela:", "Wizardmon dims the screen:"),
        text: text(
          `Tormentos são feridas emocionais, medos ou pressões que ainda acompanham o Digi-Escolhido. Para este nível de campanha, marque exatamente ${tormentBoxes} caixa(s) entre os Tormentos. Eles não servem para punir o jogador; servem para dizer ao Narrador onde existe drama interessante.`,
          `Torments are emotional wounds, fears, or pressures that still follow the Tamer. For this campaign level, mark exactly ${tormentBoxes} box(es) among the Torments. They are not meant to punish the player; they tell the GM where interesting drama lives.`
        )
      },
      summary: {
        title: text("Wizardmon faz a revisão final:", "Wizardmon makes the final review:"),
        text: text("Revise os números e leia o personagem como se ele fosse entrar em cena agora. Se o conceito, os Aspectos e os maiores valores apontam para a mesma ideia, a ficha está pronta. Depois de criar o Actor, você ainda pode editar detalhes na ficha normal.", "Review the numbers and read the character as if they were entering a scene right now. If the concept, Aspects, and highest values point to the same idea, the sheet is ready. After creating the Actor, you can still edit details on the normal sheet.")
      }
    };

    return guides[this.currentStep] ?? {
      title: text("Wizardmon explica:", "Wizardmon explains:"),
      text: text("Siga a etapa atual e use os avisos do rodapé para corrigir qualquer pendência antes de criar o Actor.", "Follow the current step and use the footer warnings to fix any pending issue before creating the Actor.")
    };
  }

}
