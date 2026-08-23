import { rollTamerCheck } from "../rolls/check-roll.js";
import { rollTormentCheck } from "../rolls/torment-roll.js";
import { takeTamerBreak, takeTamerRest } from "../combat/rest.js";
import { endTamerTurn } from "../combat/end-turn.js";
import { rollRecovery } from "../combat/recovery.js";
import { getDDASetting } from "../settings.js";
import {
  DDA_STAGE_ORDER,
  getDigimonStageLabel
} from "../helpers/digimon-stage-labels.js";
import { evolvePartner, executeJogressEvolution, endJogressEvolution, executeHybridEvolution, executeBioMergeEvolution, endHybridEvolution, executeForcedEvolution, endForcedEvolution, executeBlastEvolution } from "../combat/evolution.js";
import { DDA_TAMER_TALENTS } from "../data/tamer-talents.js";
import {
  getTamerTalentImplementation,
  getTamerTalentImplementationLabelKey,
  isTamerTalentTriggeredOnly
} from "../data/tamer-talent-implementation.js";
import {
  getCampaignLevelSummary,
  getStartingAttributePoints,
  getStartingSkillPoints,
  getScaledTalentRequirement
} from "../rules/campaign-rules.js";
import {
  getTamerAttributeCap,
  getTamerSkillCap
} from "../rules/tamer-progression.js";
import { syncTamerAndPartnerOwnership } from "../utils/ownership.js";
import { DDA_HYBRID_SPECIAL_WORKFLOW_SUPPORTED } from "../rules/special-evolution-methods.js";
import {
  getTamerTalentUses,
  validateTamerTalentUse,
  useTamerTalent
} from "../rules/tamer-talent-automation.js";
import {
  getTamerIpPool,
  getTamerTemporaryIpTotal
} from "../rules/tamer-resources.js";
import {
  openTamerActionMenu
} from "../combat/tamer-actions.js";
import { DDATamerTalentBrowser } from "../apps/tamer-talent-browser.js";
const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const DDACharacterSheetBase = HandlebarsApplicationMixin(ActorSheetV2);

function getApplicationElement(element) {
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  return null;
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
    attributes[requirement.key]?.value ??
    attributes[requirement.key]?.total ??
    0
  );

  const requiredValue =
    getScaledTalentRequirement(
      requirement.value
    );

  return currentValue >= requiredValue;
}

function getDdaDocumentSheetConfigClass() {
  return globalThis.foundry?.applications?.apps?.DocumentSheetConfig ?? null;
}

export class DDACharacterSheet extends DDACharacterSheetBase {
  static DEFAULT_OPTIONS = {
    classes: [
      "dda",
      "sheet",
      "actor",
      "character",
      "digimon-digital-adventures",
      "dda-tamer-sheet-window"
    ],
    tag: "form",
    position: {
      width: 860,
      height: 760
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: true
    },
    actions: {
      endTurn: this._onEndTurnAction
    },
    window: {
      resizable: true
    }
  };

  /**
   * ApplicationV2 native action handler for the sheet End Turn button.
   * Keeping this in DEFAULT_OPTIONS.actions avoids stale/manual listeners
   * after HandlebarsApplicationMixin replaces sheet HTML on re-render.
   *
   * @this {DDACharacterSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} _target
   */
  static async _onEndTurnAction(event, _target) {
    event.preventDefault();
    event.stopPropagation();
    return endTamerTurn(this.actor);
  }

  static PARTS = {
    form: {
      template: "systems/digimon-digital-adventures/templates/actor/character-sheet.html",
      scrollable: [".sheet-body"]
    }
  };

  static TABS = {
    primary: {
      initial: "stats",
      tabs: [
        { id: "stats" },
        { id: "aspects" },
        { id: "combat" },
        { id: "inventory" },
        { id: "torments" },
        { id: "advancement" },
        { id: "notes" }
      ]
    }
  };

  get title() {
    const label = game.i18n.localize("DDA.Sheet.Character");
    return `${label}: ${this.actor?.name ?? ""}`;
  }

  async _prepareContext(options = {}) {
    const context = await super._prepareContext(options);

context.cssClass = "dda sheet actor character dda-tamer-window-sheet";
context.actor = this.actor;
context.system = this.actor.system;
context.tabs ??= {};
context.tabs.primary ??= this._prepareTabs("primary");
context.temporaryIp = getTamerTemporaryIpTotal(this.actor);
context.ipPool = getTamerIpPool(this.actor);
context.sortedSkills = this._getSortedSkillViewData();
context.isGM = Boolean(game.user?.isGM);
context.campaignRules = this._getCampaignRuleViewData();
context.partnerCurrentSpecies = await this._getPartnerCurrentSpecies();
context.partnerIdentityName = await this._getPartnerIdentityName();
context.partnerHeaderName = await this._getPartnerHeaderName(
  context.partnerCurrentSpecies
);
context.partnerStartingStage = this._getPartnerStartingStageViewData();
context.crestPlaque = this._getCrestPlaqueViewData();
context.digiviceSkin = this._getDigiviceSkinViewData();
context.optionalRules = this._getOptionalRuleViewData();
context.jogressActive = Boolean(this.actor.system.specialEvolutions?.jogress?.state?.active);
context.forcedActive = Boolean(this.actor.system.specialEvolutions?.forced?.state?.active);
context.hybridActive = Boolean(this.actor.system.specialEvolutions?.hybrid?.state?.active);
context.hybridState = this._getHybridStateViewData();

const enableHybridEvolution = DDA_HYBRID_SPECIAL_WORKFLOW_SUPPORTED && Boolean(getDDASetting("enableHybridEvolution"));
const enableBioMergeEvolution = DDA_HYBRID_SPECIAL_WORKFLOW_SUPPORTED && Boolean(getDDASetting("enableBioMergeEvolution"));
const enableJogressEvolution = Boolean(getDDASetting("enableJogressEvolution"));
const enableForcedEvolution = Boolean(getDDASetting("enableForcedEvolution"));
const enableBlastEvolution = Boolean(getDDASetting("enableBlastEvolution"));
const enableClashActions = Boolean(getDDASetting("enableClashActions"));

context.specialEvolutionSettings = {
  enableHybridEvolution,
  enableBioMergeEvolution,
  enableJogressEvolution,
  enableForcedEvolution,
  enableBlastEvolution,
  enableClashActions,
  hasSpecialEvolutionButton: enableHybridEvolution || enableBioMergeEvolution,
  hasMultipleSpecialEvolutionButtons: enableHybridEvolution && enableBioMergeEvolution
};
context.itemsByType = this._getItemsByType();
context.inventory = this._getInventoryViewData();
context.tamerTalents = this._getTamerTalentViewData();
context.officialTamerTalents = this._getOfficialTamerTalentViewData();
context.unlockedOfficialTamerTalents = context.officialTamerTalents.filter((talent) => talent.requirementMet);
context.lockedOfficialTamerTalents = context.officialTamerTalents.filter((talent) => !talent.requirementMet);

context.itemsByType.tamerTalent = [
  ...context.unlockedOfficialTamerTalents,
  ...context.tamerTalents
];

return context;
  }

  _getCampaignRuleViewData() {
    const rules = getCampaignLevelSummary();

    const attributes = this.actor.system.attributes ?? {};
    const skills = this.actor.system.skills ?? {};

    const attributeTotal = Object.values(attributes).reduce((total, attribute) => {
      const value = Number(attribute?.value ?? attribute?.total ?? attribute?.base ?? 1);
      const startingBase = Number(attribute?.creation?.startingBase ?? 1);

      return total + Math.max(0, value - startingBase);
    }, 0);

    const skillTotal = Object.values(skills).reduce((total, skill) => {
      return total + Number(skill?.value ?? 0);
    }, 0);

    const attributeCap = getTamerAttributeCap(this.actor);

    const skillCaps = Object.fromEntries(
      Object.keys(skills).map((skillKey) => {
        return [skillKey, getTamerSkillCap(this.actor, skillKey)];
      })
    );

    const skillCap = Math.max(0, ...Object.values(skillCaps));

    const startingAttributePoints =
      getStartingAttributePoints();

    const experiencedCreationBenefit =
      hasExperiencedCreationBenefit(
        attributes
      );

    const startingSkillPoints =
      getStartingSkillPoints() +
      (experiencedCreationBenefit ? 1 : 0);

    const milestonesCompleted = Number(
      this.actor.system?.advancement?.milestones?.completed ?? 0
    );

    const attributeOverCap = Object.entries(attributes)
      .filter(([key, attribute]) => Number(attribute?.value ?? 0) > attributeCap)
      .map(([key, attribute]) => ({
        key,
        label: game.i18n.localize(attribute?.label ?? key),
        value: Number(attribute?.value ?? 0),
        cap: attributeCap
      }));

    const skillOverCap = Object.entries(skills)
      .filter(([key, skill]) => {
        return Number(skill?.value ?? 0) > Number(skillCaps[key] ?? 0);
      })
      .map(([key, skill]) => ({
        key,
        label: game.i18n.localize(skill?.label ?? key),
        value: Number(skill?.value ?? 0),
        cap: Number(skillCaps[key] ?? 0)
      }));

    const hasStartingBudgetWarning = milestonesCompleted <= 0 && (
      attributeTotal > startingAttributePoints ||
      skillTotal > startingSkillPoints
    );

    return {
      ...rules,
      attributeCap,
      skillCap,
      skillCaps,
      milestonesCompleted,
      startingAttributePoints,
      startingSkillPoints,
      attributeTotal,
      skillTotal,
      attributeRemaining: startingAttributePoints - attributeTotal,
      skillRemaining: startingSkillPoints - skillTotal,
      attributeOverCap,
      skillOverCap,
      hasAttributeOverCap: attributeOverCap.length > 0,
      hasSkillOverCap: skillOverCap.length > 0,
      hasPointWarning: hasStartingBudgetWarning
    };
  }

  _getSortedSkillViewData() {
  const skills = this.actor.system.skills ?? {};
  const language = game.i18n?.lang || undefined;

  return Object.entries(skills)
    .map(([key, skill]) => {
      const labelKey = skill?.label ?? key;
      const localizedLabel = game.i18n.localize(labelKey);

      return {
        key,
        ...foundry.utils.deepClone(skill ?? {}),
        label: labelKey,
        localizedLabel,
        cap: getTamerSkillCap(this.actor, key)
      };
    })
    .sort((a, b) => {
      return String(a.localizedLabel ?? a.key).localeCompare(
        String(b.localizedLabel ?? b.key),
        language,
        {
          sensitivity: "base",
          numeric: true
        }
      );
    });
}

  async _onRender(context, options) {
    await super._onRender(context, options);

    const root = getApplicationElement(this.element);
    if (!root) return;

    // ApplicationV2 may replace the inner HTML during a re-render. Keep the
    // custom Digivice-only collapsed state on the outer Application element
    // instead of relying on a transient DOM class alone.
    const appElement = root.closest?.(".application, .window-app, .app") ?? root;
    appElement?.classList.toggle("dda-digivice-collapsed", Boolean(this._ddaDigiviceCollapsed));

    const html = $(root);

    const activePrimaryTab = this.tabGroups.primary ?? "stats";
    this._syncTamerTabDom(root, "primary", activePrimaryTab);
    for (const tab of root.querySelectorAll(".sheet-tabs [data-group][data-tab]")) {
      tab.addEventListener("click", this._onTamerTabClick.bind(this));
    }

    this._ensureTamerEndTurnButton(html);
    this._lockTamerProgressionInputs(html);
    html.find(".item-create").on("click", this._onItemCreate.bind(this));
    html.find(".item-edit").on("click", this._onItemEdit.bind(this));
    html.find(".item-delete").on("click", this._onItemDelete.bind(this));

    html.find(".roll-skill").on("click", this._onRollSkill.bind(this));
    html.find(".roll-torment").on("click", this._onRollTorment.bind(this));
    html.find(".take-rest").on("click", this._onTakeRest.bind(this));
    html.find(".roll-recovery").on("click", this._onRollRecovery.bind(this));
    html.find(".recovery-menu").on("click", this._onRecoveryMenu.bind(this));
    html.find(".take-break").on("click", this._onTakeBreak.bind(this));
    html.find(".forced-evolution-partner").on("click", this._onForcedEvolutionPartner.bind(this));
    html.find(".end-forced-evolution-partner").on("click", this._onEndForcedEvolutionPartner.bind(this));
    html.find(".blast-evolution-partner").on("click", this._onBlastEvolutionPartner.bind(this));

    html.find(".partner-drop-zone").on("dragover", this._onPartnerDragOver.bind(this));
    html.find(".partner-drop-zone").on("drop", this._onPartnerDrop.bind(this));
    html.find(".open-partner-sheet").on("click", this._onOpenPartnerSheet.bind(this));
    html.find(".unlink-partner").on("click", this._onUnlinkPartner.bind(this));
    html.find(".evolution-options-partner").on("click", this._onEvolutionOptionsPartner.bind(this));
    html.find(".open-current-form-wizard").on("click", this._onOpenCurrentFormWizard.bind(this));
    html.find(".open-partner-form-planner").on("click", this._onOpenPartnerFormPlanner.bind(this));
    html.find(".evolve-partner").on("click", this._onEvolvePartner.bind(this));
    html.find(".jogress-partner").on("click", this._onJogressPartner.bind(this));
    html.find(".end-jogress-partner").on("click", this._onEndJogressPartner.bind(this));
    html.find(".hybrid-partner").on("click", this._onHybridPartner.bind(this));
    html.find(".biomerge-partner").on("click", this._onBioMergePartner.bind(this));
    html.find(".end-hybrid-partner").on("click", this._onEndHybridPartner.bind(this));
    html.find(".open-hybrid-sheet").on("click", this._onOpenHybridSheet.bind(this));
    html.find(".remove-active-effect").on("click", this._onRemoveActiveEffect.bind(this));

    html.find('[data-action="digivice-sheet"]').on("click", this._onDigiviceSheet.bind(this));
    html.find('[data-action="digivice-close"]').on("click", this._onDigiviceClose.bind(this));

    html.find(".dda-window-side-device").on("dblclick", this._onDigiviceDoubleClick.bind(this));
    html.find(".dda-window-side-device").on("pointerdown", this._onDigiviceDragStart.bind(this));

    // A ficha do Digi-Escolhido esconde a barra nativa do Foundry para usar a carcaça do Digivice.
    // Este handler mantém a janela arrastável mesmo quando ela renderiza encostada no topo da tela
    // e o Digivice externo fica parcialmente fora da área visível.
    html.find(".dda-window-frame, .dda-window-paper > .sheet-header").on("pointerdown", this._onCustomSheetDragStart.bind(this));

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

html.find(".dda-device-button").on("dblclick", (event) => {
  event.preventDefault();
  event.stopPropagation();
});

      html.find(".open-tamer-advancement").on(
  "click",
  this._onOpenTamerAdvancement.bind(this)
);

      html.find(".open-partner-bonus-dp").on(
  "click",
  this._onOpenPartnerBonusDp.bind(this)
);

    html.find(".open-tamer-talent-compendium").on("click", this._onOpenTamerTalentCompendium.bind(this));
    html.find(
      ".open-tamer-action-menu"
    ).on(
      "click",
      this._onOpenTamerActionMenu.bind(this)
    );
    html.find(".open-official-tamer-talent").on("click", this._onOpenOfficialTamerTalent.bind(this));
    html.find(".use-tamer-talent").on("click", this._onUseTamerTalent.bind(this));
    html.find(".inventory-use-item").on("click", this._onUseInventoryItem.bind(this));
  }

  _onTamerTabClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget;
    const group = target?.dataset?.group ?? target?.closest?.("[data-group]")?.dataset?.group ?? "primary";
    const tab = target?.dataset?.tab ?? "";
    if (!tab) return;

    this.changeTab(tab, group, {
      event,
      force: true,
      navElement: target,
      updatePosition: false
    });

    this._syncTamerTabDom(getApplicationElement(this.element), group, tab);
  }

  _syncTamerTabDom(root, group, activeTab) {
    if (!root) return;

    for (const element of root.querySelectorAll("[data-group][data-tab], [data-group] [data-tab]")) {
      const elementGroup = element.dataset.group ?? element.closest?.("[data-group]")?.dataset?.group;
      if (elementGroup !== group) continue;
      element.classList.toggle("active", element.dataset.tab === activeTab);
    }
  }

  _ensureTamerEndTurnButton(html) {
  const combatActions = html
    .find(".dda-tamer-combat-tab .combat-actions")
    .first();

  if (!combatActions.length) return;
  if (combatActions.find(".end-turn-tamer").length) return;

  combatActions.prepend(
    `<button type="button" class="end-turn-tamer" data-action="endTurn"><i class="fa-solid fa-forward-step"></i> ${game.i18n.localize("DDA.EndTurn.Title")}</button>`
  );
}



  _lockTamerProgressionInputs(html) {
    const selector = [
      'input[name^="system.attributes."][name$=".value"]',
      'input[name^="system.skills."][name$=".value"]',
      'input[name="system.advancement.milestones.completed"]',
      'input[name="system.advancement.growthPoints.available"]'
    ].join(", ");

    const fields = html.find(selector);

    if (!fields.length) return;

    fields
      .prop("readonly", true)
      .attr("aria-readonly", "true")
      .attr(
        "title",
        game.i18n.localize("DDA.TamerSheet.Advancement")
      )
      .addClass("dda-progression-locked");
  }

  _stripSheetProgressionEdits(formData) {
    const protectedPatterns = [
      /^system\.attributes\.[^.]+\.value$/,
      /^system\.skills\.[^.]+\.value$/,
      /^system\.advancement\.milestones\.completed$/,
      /^system\.advancement\.growthPoints\.(available|spent)$/
    ];

    for (const key of Object.keys(formData)) {
      if (protectedPatterns.some((pattern) => pattern.test(key))) {
        delete formData[key];
      }
    }
  }



  async _onOpenTamerAdvancement(event) {
    event.preventDefault();

    if (!game.user?.isGM && !this.actor?.isOwner) {
      ui.notifications.warn(
        "You do not have permission to advance this Tamer."
      );
      return;
    }

    const { openTamerAdvancement } = await import(
      "../apps/dda-tamer-advancement.js"
    );

    return openTamerAdvancement(this.actor);
  }


  async _onOpenPartnerBonusDp(event) {
    event.preventDefault();

    if (!game.user?.isGM && !this.actor?.isOwner) {
      ui.notifications.warn(
        game.i18n.localize("DDA.Warning.NoPermission")
      );
      return;
    }

    const { openPartnerBonusDpAdvancement } = await import(
      "../apps/dda-partner-bonus-dp.js"
    );

    return openPartnerBonusDpAdvancement(this.actor);
  }


  _prepareSubmitData(event, form, formData, updateData = {}) {
    const prepared = super._prepareSubmitData(event, form, formData, updateData);
    const flatData = foundry.utils.flattenObject(prepared);

    if (!game.user?.isGM) {
      delete flatData["system.partner.bonusDp"];
      delete flatData["system.partner.startingStageOverride"];

      for (const key of Object.keys(flatData)) {
        if (
          key.startsWith("system.partner.unlockedEvolutionStages") ||
          key.startsWith("system.partner.unlockedForms")
        ) {
          delete flatData[key];
        }
      }
    }

    this._stripSheetProgressionEdits(flatData);

    const validation = this._validateCampaignLevelFormData(flatData);
    if (validation.messages.length) {
      ui.notifications.warn(validation.messages.join(" "));
    }

    return foundry.utils.expandObject(flatData);
  }

  _validateCampaignLevelFormData(formData) {
    const attributeCap = getTamerAttributeCap(this.actor);
    const attributeOverrides = {};
    const messages = [];

    for (const [key, value] of Object.entries(formData)) {
      const match = key.match(/^system\.attributes\.([^.]+)\.value$/);
      if (!match) continue;

      const attributeKey = match[1];
      let numericValue = Math.floor(Number(value ?? 0));

      if (!Number.isFinite(numericValue) || numericValue < 1) {
        messages.push(game.i18n.localize("DDA.Warning.AttributeBelowMinimum"));
        numericValue = 1;
      }

      if (numericValue > attributeCap) {
        messages.push(game.i18n.format("DDA.Warning.AttributeAboveCampaignCap", {
          value: numericValue,
          cap: attributeCap
        }));
        numericValue = attributeCap;
      }

      formData[key] = numericValue;
      attributeOverrides[attributeKey] = numericValue;
    }

    for (const [key, value] of Object.entries(formData)) {
      const match = key.match(/^system\.skills\.([^.]+)\.value$/);
      if (!match) continue;

      const skillKey = match[1];
      let numericValue = Math.floor(Number(value ?? 0));

      if (!Number.isFinite(numericValue) || numericValue < 0) {
        numericValue = 0;
      }

      const skillCap = getTamerSkillCap(
        this.actor,
        skillKey,
        attributeOverrides
      );

      if (numericValue > skillCap) {
        messages.push(game.i18n.format("DDA.Warning.SkillAboveCampaignCap", {
          value: numericValue,
          cap: skillCap
        }));
        numericValue = skillCap;
      }

      formData[key] = numericValue;
    }

    return { messages };
  }

  _getValidPartnerStartingStageKeys() {
  return DDA_STAGE_ORDER.filter((stageKey) => {
    return ["baby1", "baby2", "child", "adult", "perfect", "ultimate"].includes(stageKey);
  });
}

_getDefaultPartnerStartingStage() {
  const validStages = this._getValidPartnerStartingStageKeys();

  try {
    const value = getDDASetting("defaultPartnerStartingStage");
    return validStages.includes(value) ? value : "child";
  } catch (_error) {
    return "child";
  }
}

_getPartnerStartingStageOverride() {
  const validStages = this._getValidPartnerStartingStageKeys();
  const value = String(this.actor.system?.partner?.startingStageOverride ?? "").trim();

  return validStages.includes(value) ? value : "";
}

_getEffectivePartnerStartingStage() {
  return this._getPartnerStartingStageOverride() || this._getDefaultPartnerStartingStage();
}

_getPartnerStartingStageOptions() {
  return Object.fromEntries(
    this._getValidPartnerStartingStageKeys().map((stageKey) => {
      return [stageKey, getDigimonStageLabel(stageKey, { fallback: stageKey })];
    })
  );
}

_getPartnerStartingStageViewData() {
  const defaultStage = this._getDefaultPartnerStartingStage();
  const overrideStage = this._getPartnerStartingStageOverride();
  const effectiveStage = overrideStage || defaultStage;

  const defaultLabel = getDigimonStageLabel(defaultStage, { fallback: defaultStage });
  const effectiveLabel = getDigimonStageLabel(effectiveStage, { fallback: effectiveStage });

  return {
    options: this._getPartnerStartingStageOptions(),
    defaultStage,
    defaultLabel,
    overrideStage,
    effectiveStage,
    effectiveLabel,
    useDefaultLabel: game.i18n.format("DDA.TamerSheet.PartnerStartingStage.UseCampaignDefault", {
      stage: defaultLabel
    }),
    useDefaultShortLabel: game.i18n.format("DDA.TamerSheet.PartnerStartingStage.UseCampaignDefaultShort", {
      stage: defaultLabel
    }),
    overrideHint: game.i18n.localize("DDA.TamerSheet.PartnerStartingStage.OverrideHint"),
    playerHint: game.i18n.localize("DDA.TamerSheet.PartnerStartingStage.PlayerHint"),
    effectiveHint: game.i18n.format("DDA.TamerSheet.PartnerStartingStage.EffectiveHint", {
      stage: effectiveLabel
    })
  };
}

  _getItemsByType() {
    return {
      torment: this.actor.items.filter((item) => item.type === "torment"),
      tamerTalent: this.actor.items.filter((item) => item.type === "tamerTalent"),
      equipment: this.actor.items.filter((item) => item.type === "equipment"),
      milestone: this.actor.items.filter((item) => item.type === "milestone"),
      trait: this.actor.items.filter((item) => item.type === "trait"),
      evolutionLink: this.actor.items.filter((item) => item.type === "evolutionLink"),
      digimental: this.actor.items.filter((item) => item.type === "digimental"),
      card: this.actor.items.filter((item) => item.type === "card"),
      consumable: this.actor.items.filter((item) => item.type === "consumable")
    };
  }

  _getInventoryViewData() {
    const categories = [
      {
        key: "motifs",
        label: localize("DDA.Inventory.Category.Motifs"),
        emptyLabel: localize("DDA.Inventory.Empty.Motifs"),
        createType: "motif",
        createName: localize("DDA.Inventory.New.Motif"),
        items: this.actor.items.filter((item) => item.type === "motif")
      },
      {
        key: "evolution",
        label: localize("DDA.Inventory.Category.EvolutionItems"),
        emptyLabel: localize("DDA.Inventory.Empty.EvolutionItems"),
        createType: "digimental",
        createName: localize("DDA.Inventory.New.Digimental"),
        items: this.actor.items.filter((item) => item.type === "digimental")
      },
      {
        key: "cards",
        label: localize("DDA.Inventory.Category.Cards"),
        emptyLabel: localize("DDA.Inventory.Empty.Cards"),
        createType: "card",
        createName: localize("DDA.Inventory.New.Card"),
        items: this.actor.items.filter((item) => item.type === "card")
      },
      {
        key: "consumables",
        label: localize("DDA.Inventory.Category.Consumables"),
        emptyLabel: localize("DDA.Inventory.Empty.Consumables"),
        createType: "consumable",
        createName: localize("DDA.Inventory.New.Consumable"),
        items: this.actor.items.filter((item) => item.type === "consumable")
      },
      {
        key: "equipment",
        label: localize("DDA.Inventory.Category.Equipment"),
        emptyLabel: localize("DDA.Inventory.Empty.Equipment"),
        createType: "equipment",
        createName: localize("DDA.Inventory.New.Equipment"),
        items: this.actor.items.filter((item) => item.type === "equipment")
      },
      {
        key: "other",
        label: localize("DDA.Inventory.Category.Other"),
        emptyLabel: localize("DDA.Inventory.Empty.Other"),
        createType: "trait",
        createName: localize("DDA.Inventory.New.Other"),
        items: this.actor.items.filter((item) => ["trait", "milestone", "evolutionLink"].includes(item.type))
      }
    ];

    return {
      categories: categories.map((category) => ({
        ...category,
        count: category.items.length,
        items: category.items.map((item) => this._getInventoryItemViewData(item))
      })),
      total: this.actor.items.filter((item) => !["torment", "tamerTalent"].includes(item.type)).length
    };
  }

  _getInventoryItemViewData(item) {
    const system = item.system ?? {};
    const uses = system.uses ?? {};
    const use = system.use ?? {};
    const usesEnabled = Boolean(uses.enabled);
    const usesValue = Number(uses.value ?? 0);
    const usesMax = Number(uses.max ?? 0);
    const typeLabel = localize(getInventoryItemTypeLabelKey(item.type));
    const equipped = Boolean(system.equipped);
    const quantity = Number(system.quantity ?? 1);
    const usedUntilRest = Boolean(system.usedUntilRest);
    const isSpent = usedUntilRest || (usesEnabled && usesMax > 0 && usesValue <= 0);
    const isUsableType = ["digimental", "card", "consumable", "equipment", "motif"].includes(item.type) || Boolean(use.enabled);

    let meta = typeLabel;

    if (item.type === "digimental" && system.crestLabel) {
      meta = `${typeLabel} • ${system.crestLabel}`;
    } else if (item.type === "equipment") {
      const equippedTo = system.equippedToName ? ` • ${system.equippedToName}` : "";
      meta = equipped
        ? `${typeLabel} • ${localize("DDA.Inventory.Equipped")}${equippedTo}`
        : typeLabel;
    } else if (item.type === "motif") {
      meta = `${typeLabel} • ${system.frequency ?? localize("DDA.TamerTalent.Frequency.OncePerDay")}`;
    } else if (item.type === "consumable" && quantity > 1) {
      meta = `${typeLabel} • ×${quantity}`;
    }

    return {
      id: item.id,
      name: item.name,
      img: item.img,
      type: item.type,
      typeLabel,
      typeClass: item.type,
      system,
      meta,
      quantity,
      usesEnabled,
      usesValue,
      usesMax,
      hasUses: usesEnabled && usesMax > 0,
      usedUntilRest,
      isSpent,
      canUse: isUsableType && !isSpent,
      useTitle: isSpent ? localize("DDA.Inventory.UseSpent") : localize("DDA.Button.Use")
    };
  }

  _getTamerTalentViewData() {
  const talents = this.actor.items.filter((item) => item.type === "tamerTalent");

  return talents.map((item) => {
    const system = item.system ?? {};
      system.automation ??= { enabled: false };
    const requirement = system.requirement ?? {};

    const requirementType = requirement.type ?? "attribute";
    const requirementKey = requirement.key ?? "";
    const baseRequirementValue = Number(requirement.value ?? 0);
    const requirementValue = getScaledTalentRequirement(baseRequirementValue);
    const currentValue = getTamerRequirementCurrentValue(this.actor, requirementType, requirementKey);

    const requirementMet = !requirementKey || currentValue >= requirementValue;

    system.requirement.baseValue = baseRequirementValue;
    system.requirement.scaledValue = requirementValue;
    system.requirement.current = currentValue;
    system.requirement.met = requirementMet;

    return {
      id: item.id,
      name: item.name,
      img: item.img,
      type: item.type,
      system,
      requirementMet,
      requirementCurrent: currentValue,
      requirementLabel: getTamerRequirementLabel(requirementType, requirementKey),
      requirementValue,
requirementText: requirementKey
  ? game.i18n.format("DDA.TamerTalent.Requirement.Progress", {
      label: getTamerRequirementLabel(requirementType, requirementKey),
      current: currentValue,
      required: requirementValue
    })
  : game.i18n.localize("DDA.TamerTalent.Requirement.None"),
statusLabel: requirementMet
  ? game.i18n.localize("DDA.TamerTalent.Status.Unlocked")
  : game.i18n.localize("DDA.TamerTalent.Status.Locked"),
      statusClass: requirementMet ? "unlocked" : "locked"
    };
  });
}

_getOfficialTamerTalentViewData() {
  return DDA_TAMER_TALENTS.map((talent) => {
    const requirement = talent.requirement ?? {};

    const requirementType = requirement.type ?? "attribute";
    const requirementKey = requirement.key ?? "";
    const baseRequirementValue = Number(requirement.value ?? 0);
    const requirementValue = getScaledTalentRequirement(baseRequirementValue);
    const currentValue = getTamerRequirementCurrentValue(this.actor, requirementType, requirementKey);
    const requirementMet = !requirementKey || currentValue >= requirementValue;

    const officialUses = getOfficialTamerTalentUses(this.actor, {
      ...talent,
      system: {
        uses: talent.uses ?? { enabled: false, value: 0, max: 0, recharge: "" }
      }
    });

    const implementation = getTamerTalentImplementation(talent.id);
    const implementationLabel = localize(
      getTamerTalentImplementationLabelKey(implementation.mode)
    );

    return {
      ...talent,
      type: "officialTamerTalent",
      img: "icons/svg/book.svg",
      system: {
        requirement: {
          ...requirement,
          baseValue: Number(requirement.value ?? 0),
          scaledValue: requirementValue,
          current: currentValue,
          met: requirementMet
        },
        isAdvanced: Boolean(talent.isAdvanced),
        isSpecialOrder: Boolean(talent.isSpecialOrder),
        useType: talent.useType ?? "passive",
        actionCost: talent.actionCost ?? "",
        frequency: talent.frequency ?? "",
        uses: officialUses,
        specialOrder: talent.specialOrder ?? { name: "" },
        effect: talent.effect ?? "",
        description: talent.description ?? talent.effect ?? "",
        automation: {
          ...(talent.automation ?? { enabled: false }),
          triggeredOnly: Boolean(
            talent.automation?.triggeredOnly ||
            isTamerTalentTriggeredOnly(talent.id)
          )
        }
      },
      requirementMet,
      requirementCurrent: currentValue,
      requirementLabel: getTamerRequirementLabel(requirementType, requirementKey),
      requirementValue,
requirementText: requirementKey
  ? game.i18n.format("DDA.TamerTalent.Requirement.Progress", {
      label: getTamerRequirementLabel(requirementType, requirementKey),
      current: currentValue,
      required: requirementValue
    })
  : game.i18n.localize("DDA.TamerTalent.Requirement.None"),
statusLabel: requirementMet
  ? game.i18n.localize("DDA.TamerTalent.Status.Unlocked")
  : game.i18n.localize("DDA.TamerTalent.Status.Locked"),
      statusClass: requirementMet ? "unlocked" : "locked",
      implementation,
      implementationLabel,
      implementationClass: `is-${implementation.mode}`,
      source: "official"
    };
  });
}
async _onOpenTamerTalentCompendium(event) {
  event.preventDefault();
  const browser = new DDATamerTalentBrowser(this);
  await browser.render(true);
  return browser;
}

async _onOpenOfficialTamerTalent(event) {
  event.preventDefault();

  const talentId = event.currentTarget.dataset.talentId;
  const talent = this._getOfficialTamerTalentViewData().find((entry) => entry.id === talentId);

  if (!talent) {
    ui.notifications.warn(localize("DDA.Warning.OfficialTalentNotFound"));
    return;
  }

  const content = renderTamerTalentDetail(talent);

  const dialog = new foundry.applications.api.DialogV2({
    classes: ["dda", "dda-tamer-talent-detail-dialog"],
    position: { width: 620, height: "auto" },
    window: { title: talent.name, resizable: true },
    content,
    buttons: [
      {
        action: "close",
        label: localize("DDA.Button.Close"),
        icon: "fa-solid fa-xmark",
        default: true,
        callback: () => null
      }
    ]
  });

  await dialog.render(true);
  return dialog;
}

async _onUseTamerTalent(event) {
  event.preventDefault();

  const button = event.currentTarget;
  const talentId = button.dataset.talentId;
  const talentSource = button.dataset.talentSource ?? "item";

  let talent = null;
  let item = null;

  if (talentSource === "official") {
    talent = this._getOfficialTamerTalentViewData().find((entry) => entry.id === talentId);
  } else {
    item = this.actor.items.get(talentId);

    if (!item) {
      ui.notifications.warn(localize("DDA.Warning.TalentNotFound"));
      return;
    }

    talent = this._getTamerTalentViewData().find((entry) => entry.id === talentId);
  }

  if (!talent) {
    ui.notifications.warn(localize("DDA.Warning.TalentNotFound"));
    return;
  }

  if (!talent.requirementMet) {
    ui.notifications.warn(formatI18n("DDA.Warning.TalentStillLocked", {
      talent: talent.name
    }));
    return;
  }

  const preflight = validateTamerTalentUse(this.actor, talent, {
    source: talentSource,
    item
  });

  if (!preflight.ok) {
    ui.notifications.warn(preflight.message);
    return;
  }

  const confirmed = await DialogV2.confirm({
    window: {
      title: formatI18n("DDA.TamerTalent.UseTitle", {
        talent: talent.name
      })
    },
    content: renderTamerTalentUseConfirmation(talent, this.actor),
    yes: { default: true },
    rejectClose: false
  });

  if (!confirmed) return;

  const automationResult = await useTamerTalent(this.actor, talent, {
    source: talentSource,
    item
  });

  if (!automationResult.success) {
    ui.notifications.warn(
      automationResult.message ??
      "Não foi possível aplicar a automação deste Talento."
    );
    return;
  }

  if (talent.system?.uses?.enabled && automationResult.uses) {
    talent.system.uses.value = automationResult.uses.value;
  }

  if (!automationResult.suppressDefaultChat) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: renderTamerTalentUseCard(talent, this.actor, {
        actionCostNumber: automationResult.actionCostNumber,
        actionCost: automationResult.actionCost,
        source: talentSource,
        automationResult
      })
    });
  }

  this.render(false);
}

  async _onUseInventoryItem(event) {
    event.preventDefault();

    const row = event.currentTarget.closest(".item-row");
    const itemId = row?.dataset?.itemId;
    const item = this.actor.items.get(itemId);

    if (!item) return;

    if (item.type === "motif") {
      await this._useMotifItem(item);
      return;
    }

    const targets = await this._getInventoryItemDigimonTargets();

    if (!targets.length) {
      ui.notifications.warn(localize("DDA.Warning.NoDigimonItemTarget"));
      return;
    }

    const target = await this._promptInventoryItemTarget(item, targets);
    if (!target?.actor) return;

    if (item.type === "equipment") {
      await this._toggleEquipmentItem(item, target.actor);
      return;
    }

    const uses = item.system?.uses ?? {};
    const usesEnabled = Boolean(uses.enabled);
    const currentUses = Number(uses.value ?? 0);

    if (usesEnabled && Number(uses.max ?? 0) > 0 && currentUses <= 0) {
      ui.notifications.warn(game.i18n.format("DDA.Warning.ItemNoUsesLeft", { item: item.name }));
      return;
    }

    await this._applyOptionalItemAutomation(item, target.actor);

    const updates = {};

    if (usesEnabled && Number(uses.max ?? 0) > 0) {
      updates["system.uses.value"] = Math.max(0, currentUses - 1);
    }

    if (item.type === "consumable") {
      const quantity = Number(item.system.quantity ?? 1);
      updates["system.quantity"] = Math.max(0, quantity - 1);
    }

    if (item.type === "digimental") {
      updates["system.usedUntilRest"] = true;
      updates["system.lastUsedAt"] = new Date().toISOString();
      updates["system.lastArmorForm.uuid"] = target.actor.uuid;
      updates["system.lastArmorForm.name"] = target.actor.name;
    }

    if (Object.keys(updates).length) {
      await item.update(updates);
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: renderInventoryItemUseCard(this.actor, item, target.actor)
    });

    this.render(false);
  }

  async _useMotifItem(item) {
    const uses = item.system?.uses ?? {};
    const currentUses = Number(uses.value ?? 0);

    if (uses.enabled && currentUses <= 0) {
      ui.notifications.warn(game.i18n.format("DDA.Warning.ItemNoUsesLeft", { item: item.name }));
      return;
    }

    if (uses.enabled) {
      await item.update({ "system.uses.value": Math.max(0, currentUses - 1) });
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: renderInventoryItemUseCard(this.actor, item, this.actor)
    });

    this.render(false);
  }

  async _toggleEquipmentItem(item, targetActor) {
    const equipped = Boolean(item.system?.equipped);
    const isSameTarget = item.system?.equippedToUuid === targetActor.uuid;

    if (equipped && isSameTarget) {
      await this._removeEquipmentEffect(item, targetActor);
      await item.update({
        "system.equipped": false,
        "system.equippedToUuid": "",
        "system.equippedToName": ""
      });
      this.render(false);
      return;
    }

    if (equipped && item.system?.equippedToUuid) {
      try {
        const previousActor = await fromUuid(item.system.equippedToUuid);
        if (previousActor?.documentName === "Actor") {
          await this._removeEquipmentEffect(item, previousActor);
        }
      } catch (error) {
        console.warn("DDA | Could not remove previous equipment effect.", error);
      }
    }

    await this._applyOptionalItemAutomation(item, targetActor, { equipment: true });

    await item.update({
      "system.equipped": true,
      "system.equippedToUuid": targetActor.uuid,
      "system.equippedToName": targetActor.name
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: renderInventoryItemUseCard(this.actor, item, targetActor)
    });

    this.render(false);
  }

  async _removeEquipmentEffect(item, targetActor) {
    const effects = foundry.utils.deepClone(targetActor.system.effects?.active ?? []);
    const sourceUuid = item.uuid;
    const updated = effects.filter((effect) => effect.sourceItemUuid !== sourceUuid);

    if (updated.length !== effects.length) {
      await targetActor.update({ "system.effects.active": updated });
    }
  }

  async _applyOptionalItemAutomation(item, targetActor, options = {}) {
    const automation = item.system?.automation ?? {};
    const shouldApply = Boolean(automation.enabled) || item.type === "card" || item.type === "consumable" || options.equipment;

    if (!shouldApply || !targetActor) return null;

    const kind = automation.kind && automation.kind !== "none"
      ? automation.kind
      : getDefaultAutomationKindForItem(item);

    if (kind === "heal") {
      const path = getWoundValuePath(targetActor);
      const max = getWoundMax(targetActor);
      const current = Number(foundry.utils.getProperty(targetActor, path) ?? 0);
      const amount = getInventoryAutomationValue(item, targetActor);
      await targetActor.update({ [path]: Math.min(max, current + amount) });
      return { kind, amount };
    }

    const effect = buildInventoryEffect(this.actor, item, targetActor, kind);
    if (!effect) return null;

    const currentEffects = foundry.utils.deepClone(targetActor.system.effects?.active ?? []);
    currentEffects.push(effect);
    await targetActor.update({ "system.effects.active": currentEffects });
    targetActor.sheet?.render(false);

    return effect;
  }

  async _getInventoryItemDigimonTargets() {
    const targets = [];
    const seen = new Set();

    const addActor = async (actor, source = "") => {
      if (!actor) return;
      if (actor.documentName !== "Actor") return;
      if (actor.type !== "digimon" && actor.type !== "npc") return;
      if (seen.has(actor.uuid)) return;

      seen.add(actor.uuid);
      targets.push({ actor, source });
    };

    const addUuid = async (uuid, source = "") => {
      const value = String(uuid ?? "").trim();
      if (!value) return;

      try {
        const document = await fromUuid(value);
        await addActor(document, source);
      } catch (error) {
        console.warn("DDA | Could not resolve inventory item target UUID:", value, error);
      }
    };

    await addUuid(this.actor.system?.partner?.uuid, localize("DDA.Inventory.Target.Partner"));
    await addUuid(this.actor.system?.partner?.currentFormUuid, localize("DDA.Inventory.Target.CurrentForm"));

    for (const actor of game.actors ?? []) {
      if (actor.system?.tamer?.uuid === this.actor.uuid) {
        await addActor(actor, localize("DDA.Inventory.Target.LinkedDigimon"));
      }
    }

    for (const token of canvas?.tokens?.controlled ?? []) {
      await addActor(token.actor, localize("DDA.Inventory.Target.SelectedToken"));
    }

    return targets;
  }

  async _promptInventoryItemTarget(item, targets) {
    if (!targets.length) return null;

    const options = targets.map((target, index) => {
      const label = target.source
        ? `${target.actor.name} — ${target.source}`
        : target.actor.name;

      return `<option value="${index}">${escapeHtml(label)}</option>`;
    }).join("");

    const content = `
      <div class="dda-inventory-target-dialog">
        <p>${game.i18n.format("DDA.Inventory.TargetDialog.Content", { item: `<strong>${escapeHtml(item.name)}</strong>` })}</p>
        <select name="targetIndex">${options}</select>
      </div>
    `;

    return DialogV2.wait({
      window: {
        title: game.i18n.format("DDA.Inventory.TargetDialog.Title", { item: item.name })
      },
      content,
      buttons: [
        {
          action: "use",
          label: localize("DDA.Button.Use"),
          icon: "fa-solid fa-check",
          default: true,
          callback: (_event, button) => {
            const index = Number(button.form?.elements?.targetIndex?.value ?? 0);
            return targets[index] ?? null;
          }
        },
        {
          action: "cancel",
          label: localize("DDA.Button.Cancel"),
          icon: "fa-solid fa-xmark",
          callback: () => null
        }
      ],
      rejectClose: false
    });
  }

  async _onItemCreate(event) {
    event.preventDefault();

    const button = event.currentTarget;
    const type = button.dataset.type;
    const name = button.dataset.name ?? localize("DDA.Item.NewItem");

    await this.actor.createEmbeddedDocuments("Item", [
      {
        name,
        type
      }
    ]);
  }

  async _onItemEdit(event) {
    event.preventDefault();

    const itemId = event.currentTarget.closest(".item-row").dataset.itemId;
    const item = this.actor.items.get(itemId);

    item?.sheet?.render(true);
  }

  async _onItemDelete(event) {
    event.preventDefault();

    const itemId = event.currentTarget.closest(".item-row").dataset.itemId;
    const item = this.actor.items.get(itemId);

    if (!item) return;

const confirmed = await DialogV2.confirm({
  window: { title: localize("DDA.Dialog.DeleteItem.Title") },
  content: `<p>${formatI18n("DDA.Dialog.DeleteItem.Content", {
    item: `<strong>${escapeHtml(item.name)}</strong>`
  })}</p>`,
  no: { default: true },
  rejectClose: false
});

    if (!confirmed) return;

    await item.delete();
  }

  async _onRollSkill(event) {
    event.preventDefault();

    const skillKey = event.currentTarget.dataset.skill;
    await rollTamerCheck(this.actor, skillKey);
  }

  async _onRollTorment(event) {
    event.preventDefault();

    const itemId = event.currentTarget.closest(".item-row").dataset.itemId;
    const item = this.actor.items.get(itemId);

    await rollTormentCheck(this.actor, item);
  }

  async _onTakeRest(event) {
    event.preventDefault();

const confirmed = await DialogV2.confirm({
  window: { title: localize("DDA.Dialog.Rest.Title") },
  content: `<p>${localize("DDA.Dialog.Rest.Content")}</p>`,
  no: { default: true },
  rejectClose: false
});

    if (!confirmed) return;

    await takeTamerRest(this.actor);
  }

  async _onRollRecovery(event) {
    event.preventDefault();

    await rollRecovery(this.actor);
  }

async _onEndTurn(event) {
  event.preventDefault();

  await endTamerTurn(this.actor);
}

async _onOpenTamerActionMenu(event) {
  event.preventDefault();

  await openTamerActionMenu(
    this.actor
  );
}

async _onRecoveryMenu(event) {
    event.preventDefault();

    const choice = await DialogV2.wait({
      window: { title: localize("DDA.Recovery.OptionsTitle") },
      content: `
        <div class="dda-roll-dialog dda-recovery-options-dialog">
          <p>${localize("DDA.Recovery.OptionsHint")}</p>
          <ul>
            <li><strong>${localize("DDA.Button.PostCombatRecovery")}</strong> — ${localize("DDA.Recovery.PostCombatHint")}</li>
            <li><strong>${localize("DDA.Button.Break")}</strong> — ${localize("DDA.Recovery.BreakHint")}</li>
            <li><strong>${localize("DDA.Button.Rest")}</strong> — ${localize("DDA.Recovery.RestHint")}</li>
          </ul>
        </div>
      `,
      buttons: [
        {
          action: "postCombat",
          label: localize("DDA.Button.PostCombatRecovery"),
          icon: "fa-solid fa-heart-pulse",
          default: true
        },
        {
          action: "break",
          label: localize("DDA.Button.Break"),
          icon: "fa-solid fa-mug-hot"
        },
        {
          action: "rest",
          label: localize("DDA.Button.Rest"),
          icon: "fa-solid fa-bed"
        },
        {
          action: "cancel",
          label: localize("DDA.Button.Cancel"),
          icon: "fa-solid fa-xmark",
          callback: () => null
        }
      ],
      rejectClose: false
    });

    if (choice === "postCombat") {
      await rollRecovery(this.actor);
      return;
    }

    if (choice === "break") {
      await takeTamerBreak(this.actor);
      return;
    }

    if (choice === "rest") {
      const confirmed = await DialogV2.confirm({
        window: { title: localize("DDA.Dialog.Rest.Title") },
        content: `<p>${localize("DDA.Dialog.Rest.Content")}</p>`,
        no: { default: true },
        rejectClose: false
      });

      if (!confirmed) return;
      await takeTamerRest(this.actor);
    }
  }
async _onPartnerDrop(event) {
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

  console.log("DDA | Dados arrastados para Parceiro:", data);

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
    ui.notifications.warn(localize("DDA.Warning.DropActorNotIdentified"));
    return;
  }

  console.log("DDA | Actor resolvido como parceiro:", droppedActor);

  if (droppedActor.type !== "digimon") {
    ui.notifications.warn(formatI18n("DDA.Warning.PartnerMustBeDigimon", {
  type: droppedActor.type
}));
    return;
  }

await this.actor.update({
  "system.partner.name": droppedActor.name,
  "system.partner.baseName": droppedActor.name,
  "system.partner.uuid": droppedActor.uuid,
  "system.partner.currentFormUuid": droppedActor.uuid,
  "system.partner.currentFormName": droppedActor.name
});

await droppedActor.update({
  "system.tamer.name": this.actor.name,
  "system.tamer.uuid": this.actor.uuid
});

await syncTamerAndPartnerOwnership(this.actor, droppedActor);

ui.notifications.info(formatI18n("DDA.Info.PartnerLinked", {
  partner: droppedActor.name,
  tamer: this.actor.name
}));
}
_onPartnerDragOver(event) {
  event.preventDefault();

  const target = event.currentTarget;
  target.classList.add("drag-hover");
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
async _onOpenPartnerSheet(event) {
  event.preventDefault();

  const partnerUuid = this.actor.system.partner?.uuid;

  if (!partnerUuid) {
    ui.notifications.warn(localize("DDA.Warning.NoPartnerLinked"));
    return;
  }

  const partner = await fromUuid(partnerUuid);

  if (!partner) {
    ui.notifications.warn(localize("DDA.Warning.PartnerNotFound"));
    return;
  }

  if (partner.documentName !== "Actor") {
    ui.notifications.warn(localize("DDA.Warning.UUIDNotActor"));
    return;
  }

  if (partner.type !== "digimon") {
    ui.notifications.warn(formatI18n("DDA.Warning.LinkedPartnerNotDigimon", {
  type: partner.type
}));
    return;
  }

  partner.sheet?.render(true);
}

async _onUnlinkPartner(event) {
  event.preventDefault();

  const partnerUuid = this.actor.system.partner?.uuid;
  const partnerName = this.actor.system.partner?.name || localize("DDA.TamerSheet.LinkedPartner");

const confirmed = await DialogV2.confirm({
  window: { title: localize("DDA.Dialog.UnlinkPartner.Title") },
  content: `<p>${formatI18n("DDA.Dialog.UnlinkPartner.Content", {
    partner: `<strong>${escapeHtml(partnerName)}</strong>`,
    tamer: `<strong>${escapeHtml(this.actor.name)}</strong>`
  })}</p>`,
  no: { default: true },
  rejectClose: false
});

  if (!confirmed) return;

  let partner = null;

  if (partnerUuid) {
    try {
      partner = await fromUuid(partnerUuid);
    } catch (error) {
      console.warn("DDA | Não foi possível encontrar o parceiro ao desvincular:", error);
    }
  }

await this.actor.update({
  "system.partner.name": "",
  "system.partner.baseName": "",
  "system.partner.uuid": "",
  "system.partner.currentFormUuid": "",
  "system.partner.currentFormName": ""
});

  if (partner?.documentName === "Actor" && partner.type === "digimon") {
    await partner.update({
      "system.tamer.name": "",
      "system.tamer.uuid": ""
    });

    ui.notifications.info(formatI18n("DDA.Info.PartnerUnlinked", {
  tamer: this.actor.name,
  partner: partner.name
}));
    return;
  }

  ui.notifications.warn(localize("DDA.Warning.PartnerClearedButActorNotFound"));
}
async _onTakeBreak(event) {
  event.preventDefault();

  await takeTamerBreak(this.actor);
}

async _onForcedEvolutionPartner(event) {
  event.preventDefault();

  await executeForcedEvolution(this.actor);
}

async _onEndForcedEvolutionPartner(event) {
  event.preventDefault();

  await endForcedEvolution(this.actor);
}

async _onBlastEvolutionPartner(event) {
  event.preventDefault();

  await executeBlastEvolution(this.actor);
}

async _onEvolutionOptionsPartner(event) {
  event.preventDefault();

  const forcedEnabled = Boolean(getDDASetting("enableForcedEvolution"));
  const blastEnabled = Boolean(getDDASetting("enableBlastEvolution"));
  const optionCount = 1 + Number(forcedEnabled) + Number(blastEnabled);

  const buttons = [
    {
      action: "normal",
      icon: "fa-solid fa-arrow-trend-up",
      label: localize("DDA.Evolution.Option.Normal"),
      tooltip: localize("DDA.Evolution.OptionHint.Normal"),
      default: true
    }
  ];

  if (forcedEnabled) {
    buttons.push({
      action: "forced",
      icon: "fa-solid fa-triangle-exclamation",
      label: localize("DDA.Evolution.Option.Forced"),
      tooltip: localize("DDA.Evolution.OptionHint.Forced")
    });
  }

  if (blastEnabled) {
    buttons.push({
      action: "blast",
      icon: "fa-solid fa-bolt-lightning",
      label: localize("DDA.Evolution.Option.Blast"),
      tooltip: localize("DDA.Evolution.OptionHint.Blast")
    });
  }

  buttons.push({
    action: "cancel",
    icon: "fa-solid fa-xmark",
    label: localize("DDA.Button.Cancel"),
    callback: () => null
  });

  const choice = await DialogV2.wait({
    window: { title: localize("DDA.Evolution.OptionsTitle") },
    position: { width: 680 },
    content: `
      <div class="dda-roll-dialog dda-evolution-options-dialog has-${optionCount}-options">
        <div class="dda-evolution-options-hero">
          <span class="dda-evolution-options-emblem" aria-hidden="true">
            <i class="fa-solid fa-code-branch"></i>
          </span>
          <div>
            <span class="dda-evolution-options-kicker">${localize("DDA.Evolution.Title")}</span>
            <p>${localize("DDA.Evolution.OptionsHint")}</p>
          </div>
        </div>
      </div>
    `,
    buttons,
    rejectClose: false
  });

  if (choice === "normal") {
    await this._startCrestResonanceForEvolution();
    await evolvePartner(this.actor);
    await this._stopCrestResonanceAfterEvolution();
    return;
  }

  if (choice === "forced") {
    await executeForcedEvolution(this.actor);
    return;
  }

  if (choice === "blast") {
    await executeBlastEvolution(this.actor);
  }
}

async _onEvolvePartner(event) {
  event.preventDefault();

  await this._startCrestResonanceForEvolution();
  await evolvePartner(this.actor);
  await this._stopCrestResonanceAfterEvolution();
}

async _startCrestResonanceForEvolution() {
  const partnerUuid = this.actor.system.partner?.uuid;
  if (!partnerUuid) return;

  let partner = null;
  try {
    partner = await fromUuid(partnerUuid);
  } catch (_error) {
    return;
  }

  const stage = partner?.system?.stage ?? "";
  if (!["baby1", "baby2", "child"].includes(stage)) return;

  await this.actor.update({
    "system.partner.crestResonance.active": true,
    "system.partner.crestResonance.startedAt": new Date().toISOString(),
    "system.partner.crestResonance.lastEvolutionStage": stage
  });
}

async _stopCrestResonanceAfterEvolution() {
  if (!this.actor.system.partner?.crestResonance?.active) return;

  await this.actor.update({
    "system.partner.crestResonance.active": false
  });
}

async _onOpenCurrentFormWizard(event) {
  event.preventDefault();

  const { DDADigimonWizard } = await import("../wizard/dda-digimon-wizard.js");
  await DDADigimonWizard.openCurrentFormWizard(this.actor);
}

async _onOpenPartnerFormPlanner(event) {
  event.preventDefault();

  const { DDAPartnerFormPlanner } = await import(
    "../apps/dda-partner-form-planner.js"
  );

  await DDAPartnerFormPlanner.open(this.actor);
}

async _onJogressPartner(event) {
  event.preventDefault();

  await executeJogressEvolution(this.actor);
}

async _onEndJogressPartner(event) {
  event.preventDefault();

  await endJogressEvolution(this.actor);
}

_onDigiviceSheet(event) {
  event.preventDefault();
  event.stopPropagation();

  try {
    const rootElement = getApplicationElement(this.element);
    const appElement = rootElement?.closest(".application, .window-app") ?? rootElement;
    this._ddaDigiviceCollapsed = false;
    appElement?.classList.remove("dda-digivice-collapsed");

    const DocumentSheetConfigClass = getDdaDocumentSheetConfigClass();
    if (DocumentSheetConfigClass) {
      new DocumentSheetConfigClass({
        document: this.actor,
        position: {
          top: Number(this.position?.top ?? 0) + 40,
          left: Number(this.position?.left ?? 0) + 40
        }
      }).render({ force: true });
      return;
    }

    ui.notifications.warn(localize("DDA.Warning.CouldNotOpenSheetConfig"));
  } catch (error) {
    console.error("DDA | Erro ao abrir Configuração de Ficha:", error);
    ui.notifications.error(localize("DDA.Error.OpenSheetConfig"));
  }
}

_onDigiviceClose(event) {
  event.preventDefault();
  event.stopPropagation();

  return this.close();
}

_onDigiviceDoubleClick(event) {
  event.preventDefault();
  event.stopPropagation();

  if (event.target.closest(".dda-device-button")) {
    return;
  }

  const appElement = getApplicationElement(this.element)?.closest(".application, .window-app, .app");
  if (!appElement) return;

  const collapse = !Boolean(this._ddaDigiviceCollapsed);

  if (collapse) {
    // Preserve the actual ApplicationV2 dimensions. The custom collapsed CSS
    // intentionally shrinks the window to the Digivice, but those temporary
    // dimensions must never become the restored sheet dimensions.
    this._ddaDigiviceExpandedPosition = {
      width: Number(this.position?.width) || 860,
      height: Number(this.position?.height) || 760
    };
  }

  this._ddaDigiviceCollapsed = collapse;
  appElement.classList.toggle("dda-digivice-collapsed", collapse);

  if (!collapse) {
    const expanded = this._ddaDigiviceExpandedPosition ?? {};
    this.setPosition?.({
      width: Number(expanded.width) || 860,
      height: Number(expanded.height) || 760
    });
  }
}

_onDigiviceDragStart(event) {
  if (event.button !== 0) return;
  if (event.target.closest(".dda-device-button")) return;

  this._startSheetWindowDrag(event);
}

_onCustomSheetDragStart(event) {
  if (event.button !== 0) return;

  const target = event.target;
  if (!(target instanceof Element)) return;

  // Não roubar clique/seleção de controles reais da ficha.
  if (target.closest([
    "input",
    "textarea",
    "select",
    "button",
    "a",
    ".item",
    "[data-tab]",
    "[data-action]",
    ".item-row",
    ".resource-box",
    ".dda-aspect-card",
    ".dda-tamer-talent-card",
    ".combat-actions",
    ".partner-actions",
    ".current-form-actions"
  ].join(","))) return;

  const root = getApplicationElement(this.element);
  const frame = root?.querySelector?.(".dda-window-frame");
  const paper = root?.querySelector?.(".dda-window-paper");
  const header = root?.querySelector?.(".sheet-header");

  const frameRect = frame?.getBoundingClientRect?.();
  const paperRect = paper?.getBoundingClientRect?.();
  const headerRect = header?.getBoundingClientRect?.();

  const clickedHeader = headerRect
    && event.clientY >= headerRect.top
    && event.clientY <= headerRect.bottom;

  const clickedFrameBorder = frameRect && paperRect && (
    event.clientX < paperRect.left + 10 ||
    event.clientX > paperRect.right - 10 ||
    event.clientY < paperRect.top + 10 ||
    event.clientY > paperRect.bottom - 10
  );

  if (!clickedHeader && !clickedFrameBorder) return;

  this._startSheetWindowDrag(event);
}

_startSheetWindowDrag(event) {
  event.preventDefault();
  event.stopPropagation();

  const appElement = getApplicationElement(this.element)?.closest(".window-app, .app, .application");
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

  document.addEventListener(
    "pointermove",
    this._onDigiviceDragMoveBound ??= this._onDigiviceDragMove.bind(this)
  );

  document.addEventListener(
    "pointerup",
    this._onDigiviceDragEndBound ??= this._onDigiviceDragEnd.bind(this),
    { once: true }
  );
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
  const top = Math.max(8, drag.startTop + dy);

  drag.appElement.style.left = `${left}px`;
  drag.appElement.style.top = `${top}px`;
}

_onDigiviceDragEnd(event) {
  document.removeEventListener("pointermove", this._onDigiviceDragMoveBound);

  const drag = this._ddaDigiviceDrag;
  if (!drag?.appElement) return;

  drag.appElement.classList.remove("dda-digivice-dragging");

  // A normal click (including each click that composes a dblclick) is not a
  // drag. Calling ApplicationV2#setPosition on every pointerup can update the
  // frame between the two clicks and prevent the second dblclick from being
  // delivered to the Digivice. Only persist position after real movement.
  if (!drag.moved) {
    this._ddaDigiviceDrag = null;
    return;
  }

  const rect = drag.appElement.getBoundingClientRect();

  if (typeof this.setPosition === "function") {
    this.setPosition({
      left: rect.left,
      top: Math.max(8, rect.top)
    });
  }

  this._ddaDigiviceDrag = null;
}

async _onHybridPartner(event) {
  event.preventDefault();

  await executeHybridEvolution(this.actor);
}

async _onBioMergePartner(event) {
  event.preventDefault();

  await executeBioMergeEvolution(this.actor);
}

async _onEndHybridPartner(event) {
  event.preventDefault();

  await endHybridEvolution(this.actor);
}

async _onOpenHybridSheet(event) {
  event.preventDefault();

  const hybridUuid = this.actor.system.specialEvolutions?.hybrid?.state?.resultUuid || this.actor.system.partner?.currentFormUuid;

  if (!hybridUuid) {
    ui.notifications.warn(localize("DDA.Warning.NoActiveHybrid"));
    return;
  }

  const hybridActor = await fromUuid(hybridUuid);

  if (!hybridActor || hybridActor.documentName !== "Actor") {
    ui.notifications.warn(localize("DDA.Warning.HybridResultNotFound"));
    return;
  }

  hybridActor.sheet?.render(true);
}

_getHybridStateViewData() {
  const state = this.actor.system.specialEvolutions?.hybrid?.state ?? {};

  if (!state.active) {
    return {
      active: false,
      methodLabel: "",
      resultName: "",
      equivalentStageLabel: ""
    };
  }

  return {
    ...state,
    active: true,
    methodLabel: getHybridMethodLabelForSheet(state.method),
    equivalentStageLabel: getStageLabelForSheet(state.equivalentStage || state.resultStage),
    sourceDigimonName: state.sourceDigimonName || localize("DDA.Hybrid.NoPartnerRequired"),
    partnerAvailabilityLabel: getHybridPartnerAvailabilityLabelForSheet(state.partnerAvailability),
    partnerIsMerged: Boolean(state.partnerIsMerged || state.partnerAvailability === "merged")
  };
}


_getOptionalRuleViewData() {
  return {
    motifs: Boolean(getDDASetting("enableMotifs")),
    digiModifyCards: Boolean(getDDASetting("enableDigiModifyCards")),
    expendableItems: Boolean(getDDASetting("enableExpendableItems")),
    equipableItems: Boolean(getDDASetting("enableEquipableItems")),
    hiddenCompatibilityQuestionnaire: Boolean(getDDASetting("enableHiddenCompatibilityQuestionnaire"))
  };
}

_getCrestPlaqueViewData() {
  const crestKey = normalizeCrestKey(
    this.actor.system.partner?.digiviceSkin?.crestKey ||
    this.actor.system.compatibility?.hiddenCrest?.key ||
    this.actor.system.compatibility?.crest?.key ||
    ""
  );

  if (!crestKey || !Boolean(getDDASetting("enableHiddenCompatibilityQuestionnaire"))) {
    return { visible: false, key: "", img: "", label: "", pulse: false };
  }

  return {
    visible: true,
    key: crestKey,
    img: `/systems/digimon-digital-adventures/assets/crests-plaque/Crest_${crestKey}.webp`,
    label: getCrestLabel(crestKey),
    pulse: Boolean(this.actor.system.partner?.crestResonance?.active)
  };
}

_getDigiviceSkinViewData() {
  const crestKey = normalizeCrestKey(
    this.actor.system.partner?.digiviceSkin?.crestKey ||
    this.actor.system.compatibility?.hiddenCrest?.key ||
    ""
  );

  const questionnaireEnabled = Boolean(getDDASetting("enableHiddenCompatibilityQuestionnaire"));
  const revealed = questionnaireEnabled && Boolean(this.actor.system.partner?.digiviceSkin?.revealed);
  const active = Boolean(this.actor.system.partner?.crestResonance?.active);
  const defaultFrame = "/systems/digimon-digital-adventures/assets/ui/digivice-frame-vazio-2.webp";

  return {
    revealed,
    active,
    crestKey,
    defaultFrame,
    frame: revealed && crestKey
      ? `/systems/digimon-digital-adventures/assets/colored_digivices/${crestKey}.webp`
      : defaultFrame
  };
}


async _getPartnerIdentityName() {
  const partner = this.actor.system.partner ?? {};
  if (partner.baseName) return partner.baseName;

  let currentSpecies = "";
  try {
    currentSpecies = await this._getPartnerCurrentSpecies();
  } catch (_error) {
    currentSpecies = partner.currentFormName || "";
  }

  if (partner.name && normalizeSheetLookup(partner.name) !== normalizeSheetLookup(currentSpecies)) {
    return partner.name;
  }

  const partnerUuid = partner.uuid || partner.currentFormUuid;
  if (partnerUuid) {
    try {
      const partnerActor = await fromUuid(partnerUuid);
      const nodes = Array.isArray(partnerActor?.system?.evolutionGraph?.nodes) ? partnerActor.system.evolutionGraph.nodes : [];
      const stageOrder = ["baby1", "baby2", "child", "adult", "perfect", "ultimate", "ultimatePlus"];
      const earliest = nodes
        .filter((node) => node?.name || node?.species || node?.displayName)
        .sort((a, b) => {
          const ai = stageOrder.indexOf(a.stage);
          const bi = stageOrder.indexOf(b.stage);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        })[0];

      if (earliest) return earliest.species || earliest.displayName || earliest.name || partner.name || "";
    } catch (error) {
      console.warn("DDA | Não foi possível inferir o nome-base do parceiro:", error);
    }
  }

  return partner.name || partner.currentFormName || "";
}

async _getPartnerCurrentSpecies() {
  const partner = this.actor.system.partner ?? {};
  const partnerUuid = partner.uuid || partner.currentFormUuid;

  if (!partnerUuid) {
    return "";
  }

  try {
    const currentForm = await fromUuid(partnerUuid);

    if (!currentForm || currentForm.documentName !== "Actor") {
      return partner.currentFormName || partner.name || "";
    }

    const system = currentForm.system ?? {};

    return (
      system.profile?.species ||
      system.species ||
      system.identity?.species ||
      system.details?.species ||
      partner.currentFormName ||
      currentForm.name ||
      partner.name ||
      ""
    );
  } catch (error) {
    console.warn("DDA | Não foi possível resolver a espécie da forma atual do parceiro:", error);
    return partner.currentFormName || partner.name || "";
  }
}

async _getPartnerHeaderName(currentSpecies = "") {
  const partner = this.actor.system.partner ?? {};
  const partnerUuid = partner.uuid || partner.currentFormUuid;
  const speciesName = String(
    currentSpecies ||
    partner.currentFormName ||
    partner.name ||
    ""
  ).trim();

  if (!partnerUuid) return speciesName;

  try {
    const partnerActor = await fromUuid(partnerUuid);

    if (!partnerActor || partnerActor.documentName !== "Actor") {
      return speciesName;
    }

    const explicitNickname = String(
      partnerActor.system?.customName ||
      partnerActor.system?.nickname ||
      ""
    ).trim();

    if (explicitNickname) return explicitNickname;

    /*
     * Compatibilidade com Partners antigos: antes de system.customName e
     * system.nickname, um apelido podia existir somente em Actor#name. Ele só
     * é tratado como apelido quando não coincide com nenhuma forma conhecida.
     */
    const knownSpeciesNames = [
      speciesName,
      partner.currentFormName,
      partnerActor.system?.species,
      partnerActor.system?.evolution?.currentFormName,
      partnerActor.system?.evolution?.sourceFormName,
      ...Object.values(
        partnerActor.system?.evolution?.formSnapshots ?? {}
      ).flatMap((snapshot) => [
        snapshot?.species,
        snapshot?.sourceFormName
      ]),
      ...(
        Array.isArray(partnerActor.system?.evolutionGraph?.nodes)
          ? partnerActor.system.evolutionGraph.nodes
          : []
      ).flatMap((node) => [
        node?.species,
        node?.displayName,
        node?.name
      ])
    ]
      .map((value) => normalizeSheetLookup(value))
      .filter(Boolean);

    const actorName = String(partnerActor.name ?? "").trim();

    if (
      actorName &&
      !knownSpeciesNames.includes(normalizeSheetLookup(actorName))
    ) {
      return actorName;
    }

    return speciesName || actorName;
  } catch (error) {
    console.warn(
      "DDA | Não foi possível resolver o nome exibido do parceiro:",
      error
    );
    return speciesName;
  }
}


}

function getTamerRequirementCurrentValue(actor, requirementType, requirementKey) {
  if (!requirementKey) return 0;

  const system = actor.system ?? {};

  if (requirementType === "attribute") {
    return Number(
      system.attributes?.[requirementKey]?.value ??
      system.mainStats?.[requirementKey]?.value ??
      system.stats?.[requirementKey]?.value ??
      0
    );
  }

  if (requirementType === "skill") {
    return Number(
      system.skills?.[requirementKey]?.value ??
      system.tamerSkills?.[requirementKey]?.value ??
      0
    );
  }

  return 0;
}

function getTamerRequirementLabel(requirementType, requirementKey) {
  const attributeLabels = {
    agility: "DDA.TamerAttribute.Agility",
    body: "DDA.TamerAttribute.Body",
    charisma: "DDA.TamerAttribute.Charisma",
    intelligence: "DDA.TamerAttribute.Intelligence",
    willpower: "DDA.TamerAttribute.Willpower"
  };

  const skillLabels = {
    evade: "DDA.TamerSkill.Evade",
    precision: "DDA.TamerSkill.Precision",
    stealth: "DDA.TamerSkill.Stealth",

    athletics: "DDA.TamerSkill.Athletics",
    endurance: "DDA.TamerSkill.Endurance",
    featsOfStrength: "DDA.TamerSkill.FeatsOfStrength",

    manipulate: "DDA.TamerSkill.Manipulate",
    performance: "DDA.TamerSkill.Performance",
    persuasion: "DDA.TamerSkill.Persuasion",

    decipherIntent: "DDA.TamerSkill.DecipherIntent",
    survival: "DDA.TamerSkill.Survival",
    knowledge: "DDA.TamerSkill.Knowledge",

    awareness: "DDA.TamerSkill.Awareness",
    fortitude: "DDA.TamerSkill.Fortitude",
    bravery: "DDA.TamerSkill.Bravery"
  };

  const fallback = requirementType === "attribute"
    ? "DDA.TamerTalent.Requirement.Attribute"
    : "DDA.TamerTalent.Requirement.Skill";

  const key = requirementType === "attribute"
    ? attributeLabels[requirementKey]
    : skillLabels[requirementKey];

  return game.i18n.localize(key ?? fallback);
}

function getTamerTalentUseTypeLabel(value) {
  const labels = {
    passive: "DDA.TamerTalent.UseType.Passive",
    active: "DDA.TamerTalent.UseType.Active",
    interrupt: "DDA.TamerTalent.UseType.Interrupt",
    free: "DDA.TamerTalent.UseType.Free",
    special: "DDA.TamerTalent.UseType.Special"
  };

  return game.i18n.localize(labels[value] ?? value ?? "");
}

function getTamerTalentActionCostLabel(value) {
  const labels = {
    passive: "DDA.TamerTalent.ActionCost.Passive",
    free: "DDA.TamerTalent.ActionCost.Free",
    interrupt: "DDA.TamerTalent.ActionCost.Interrupt",
    "1": "DDA.TamerTalent.ActionCost.One",
    "2": "DDA.TamerTalent.ActionCost.Two",
    special: "DDA.TamerTalent.ActionCost.Special"
  };

  return game.i18n.localize(labels[value] ?? value ?? "");
}

function getTamerTalentFrequencyLabel(value) {
  const labels = {
    always: "DDA.TamerTalent.Frequency.Always",
    oncePerTurn: "DDA.TamerTalent.Frequency.OncePerTurn",
    oncePerCombat: "DDA.TamerTalent.Frequency.OncePerCombat",
    oncePerRest: "DDA.TamerTalent.Frequency.OncePerRest",
    oncePerSession: "DDA.TamerTalent.Frequency.OncePerSession",
    limited: "DDA.TamerTalent.Frequency.Limited",
    special: "DDA.TamerTalent.Frequency.Special"
  };

  return game.i18n.localize(labels[value] ?? value ?? "");
}


function getHybridMethodLabelForSheet(method = "") {
  const normalized = String(method ?? "").trim();
  const labels = {
    hybrid: "DDA.Hybrid.Method.Hybrid",
    biomerge: "DDA.Hybrid.Method.BioMerge",
    mindLink: "DDA.Hybrid.Method.MindLink"
  };

  return game.i18n.localize(labels[normalized] ?? labels.hybrid);
}


function getHybridPartnerAvailabilityLabelForSheet(value = "unchanged") {
  const normalized = String(value ?? "").trim();
  const labels = {
    unchanged: "DDA.Hybrid.PartnerAvailability.Unchanged",
    separate: "DDA.Hybrid.PartnerAvailability.Separate",
    merged: "DDA.Hybrid.PartnerAvailability.Merged"
  };

  return game.i18n.localize(labels[normalized] ?? labels.unchanged);
}

function getStageLabelForSheet(stageKey = "") {
  const label = CONFIG.DDA?.stages?.[stageKey]?.label ?? stageKey;
  return game.i18n.localize(label);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderTamerTalentDetail(talent) {
  const specialOrderName = talent.system?.specialOrder?.name ?? "";
  const effect = talent.system?.effect ?? "";
  const description = talent.system?.description ?? "";
  const requirementText = talent.requirementText ?? localize("DDA.TamerTalent.Requirement.None");

  return `
    <section class="dda-tamer-talent-detail">
      <header class="dda-tamer-talent-detail-header">
        <div>
          <h2>${escapeHtml(talent.name)}</h2>
          ${
            specialOrderName
              ? `<p>${escapeHtml(specialOrderName)}</p>`
              : ""
          }
        </div>

        <div class="dda-talent-entry-statuses">
          <span class="dda-talent-implementation ${escapeHtml(talent.implementationClass ?? "is-unknown")}">
            ${escapeHtml(talent.implementationLabel ?? localize("DDA.Automation.Status.Unknown"))}
          </span>

          <span class="dda-talent-status ${talent.statusClass}">
            ${escapeHtml(talent.statusLabel)}
          </span>
        </div>
      </header>

      <div class="dda-talent-meta">
        <span>${escapeHtml(requirementText)}</span>

        ${
          talent.system?.isAdvanced
            ? `<span>${escapeHtml(localize("DDA.TamerTalent.Advanced"))}</span>`
            : `<span>${escapeHtml(localize("DDA.TamerTalent.Initial"))}</span>`
        }

        ${
          talent.system?.isSpecialOrder
            ? `<span>${escapeHtml(localize("DDA.TamerTalent.SpecialOrder"))}</span>`
            : `<span>${escapeHtml(localize("DDA.TamerTalent.Talent"))}</span>`
        }

        <span>${escapeHtml(getTamerTalentUseTypeLabel(talent.system?.useType))}</span>

        ${
          talent.system?.actionCost
            ? `<span>${escapeHtml(getTamerTalentActionCostLabel(talent.system.actionCost))}</span>`
            : ""
        }

        ${
          talent.system?.frequency
            ? `<span>${escapeHtml(getTamerTalentFrequencyLabel(talent.system.frequency))}</span>`
            : ""
        }

        ${
          talent.system?.uses?.enabled
            ? `<span>${escapeHtml(localize("DDA.Label.Uses"))} ${talent.system.uses.value}/${talent.system.uses.max}</span>`
            : ""
        }
      </div>

      <section class="dda-tamer-talent-detail-block">
        <h3>${escapeHtml(localize("DDA.Label.Effect"))}</h3>
        <p>${escapeHtml(effect)}</p>
      </section>

      ${
        description && description !== effect
          ? `
            <section class="dda-tamer-talent-detail-block">
              <h3>${escapeHtml(localize("DDA.Label.Description"))}</h3>
              <p>${escapeHtml(description)}</p>
            </section>
          `
          : ""
      }
    </section>
  `;
}


function renderTamerTalentUseConfirmation(talent, actor) {
  const system = talent.system ?? {};
  const specialOrderName = system.specialOrder?.name ?? "";
  const actionCost = getTamerTalentActionCostLabel(system.actionCost);
  const frequency = getTamerTalentFrequencyLabel(system.frequency);
  const uses = system.uses ?? {};

  return `
    <section class="dda-tamer-talent-use-confirmation">
      <p>
        ${formatI18n("DDA.TamerTalent.UseConfirmation", {
          actor: `<strong>${escapeHtml(actor.name)}</strong>`,
          talent: `<strong>${escapeHtml(talent.name)}</strong>`
        })}
      </p>

      ${
        specialOrderName
          ? `<p>${localize("DDA.TamerTalent.SpecialOrder")}: <strong>${escapeHtml(specialOrderName)}</strong>.</p>`
          : ""
      }

      <ul>
        ${
          actionCost
            ? `<li>${localize("DDA.Label.Cost")}: <strong>${escapeHtml(actionCost)}</strong>.</li>`
            : `<li>${localize("DDA.Label.Cost")}: <strong>${localize("DDA.Label.None")}</strong>.</li>`
        }

        ${
          frequency
            ? `<li>${localize("DDA.Label.Frequency")}: <strong>${escapeHtml(frequency)}</strong>.</li>`
            : ""
        }

        ${
          uses.enabled
            ? `<li>${localize("DDA.Label.Uses")}: <strong>${Number(uses.value ?? 0)}/${Number(uses.max ?? 0)}</strong>.</li>`
            : ""
        }
      </ul>
    </section>
  `;
}

function renderTamerTalentUseCard(talent, actor, options = {}) {
  const system = talent.system ?? {};
  const specialOrderName = system.specialOrder?.name ?? "";
  const effect = system.effect ?? "";
  const actionCost = getTamerTalentActionCostLabel(system.actionCost);
  const frequency = getTamerTalentFrequencyLabel(system.frequency);
  const useType = getTamerTalentUseTypeLabel(system.useType);
  const uses = system.uses ?? {};
  const automationResult = options.automationResult ?? null;

  return `
    <div class="dda-chat-card dda-effect-card effect-special dda-tamer-talent-use-card">
      <h2>${escapeHtml(localize("DDA.TamerTalent.ChatTitle"))}</h2>

      <div class="dda-tamer-talent-use-hero">
        <span>${escapeHtml(useType || localize("DDA.TamerTalent.Talent"))}</span>
        <strong>${escapeHtml(talent.name)}</strong>
        ${
          specialOrderName
            ? `<small>${escapeHtml(specialOrderName)}</small>`
            : `<small>${escapeHtml(actor.name)}</small>`
        }
      </div>

      <ul class="dda-effect-list dda-tamer-talent-use-list">
        <li>
          ${localize("DDA.Actor.Tamer")}:
          <strong>${escapeHtml(actor.name)}</strong>.
        </li>

        ${
          actionCost
            ? `
              <li>
                ${localize("DDA.Label.Cost")}:
                <strong>${escapeHtml(actionCost)}</strong>.
              </li>
            `
            : ""
        }

        ${
          frequency
            ? `
              <li>
                ${localize("DDA.Label.Frequency")}:
                <strong>${escapeHtml(frequency)}</strong>.
              </li>
            `
            : ""
        }

        ${
          uses.enabled
            ? `
              <li>
                ${localize("DDA.TamerTalent.UsesRemaining")}:
                <strong>${Number(uses.value ?? 0)}/${Number(uses.max ?? 0)}</strong>.
              </li>
            `
            : ""
        }

        ${
          automationResult?.applied
            ? `
              <li>
                ${localize("DDA.Label.Automation")}:
                <strong>${escapeHtml(automationResult.message)}</strong>
              </li>
            `
            : ""
        }

        ${
          automationResult?.details
            ? `
              <li>
                ${localize("DDA.Label.Details")}:
                <strong>${escapeHtml(automationResult.details)}</strong>
              </li>
            `
            : ""
        }

        ${
          effect
            ? `
              <li>
                ${localize("DDA.Label.Effect")}:
                <strong>${escapeHtml(effect)}</strong>
              </li>
            `
            : ""
        }
      </ul>
    </div>
  `;
}

function getOfficialTamerTalentUses(actor, talent) {
  return getTamerTalentUses(
    actor,
    talent,
    { source: "official" }
  );
}


function renderInventoryItemUseCard(tamer, item, target) {
  const description = String(item.system?.use?.chatMessage || item.system?.description || "").trim();

  return `
    <div class="dda-chat-card dda-inventory-use-card item-${escapeHtml(item.type)}">
      <h2>${escapeHtml(localize("DDA.Inventory.ChatTitle"))}</h2>
      <p>${game.i18n.format("DDA.Inventory.ChatContent", {
        actor: `<strong>${escapeHtml(tamer.name)}</strong>`,
        item: `<strong>${escapeHtml(item.name)}</strong>`,
        target: `<strong>${escapeHtml(target.name)}</strong>`
      })}</p>
      ${description ? `<p class="dda-inventory-use-description">${escapeHtml(description)}</p>` : ""}
    </div>
  `;
}

function normalizeSheetLookup(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCrestKey(value = "") {
  return String(value ?? "")
    .trim()
    .replace(/^Crest_/i, "")
    .replace(/^crest_/i, "")
    .replace(/^of_/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function getCrestLabel(crestKey = "") {
  const labels = {
    courage: "Coragem",
    friendship: "Amizade",
    love: "Amor",
    knowledge: "Conhecimento",
    hope: "Esperança",
    light: "Luz",
    purity: "Pureza",
    sincerity: "Sinceridade",
    kindness: "Bondade",
    miracles: "Milagres",
    faith: "Fé",
    fate: "Destino"
  };

  return labels[crestKey] ?? crestKey;
}

function getDefaultAutomationKindForItem(item) {
  if (item.type === "card") {
    const cardType = String(item.system?.cardType ?? "");
    if (cardType === "healing") return "heal";
    if (cardType === "movement") return "movement";
    return "statBonus";
  }

  if (item.type === "consumable") return item.system?.automation?.kind || "heal";
  if (item.type === "equipment") return item.system?.automation?.kind || "statBonus";
  return "none";
}

function getInventoryAutomationValue(item, targetActor) {
  const explicit = Number(item.system?.automation?.value ?? Number.NaN);
  if (Number.isFinite(explicit) && explicit !== 0) return explicit;

  const stageValue = Number(targetActor?.system?.stageValue ?? 1);

  if (item.type === "card") {
    const cardType = String(item.system?.cardType ?? "");
    if (cardType === "healing") return Math.max(1, stageValue + 2);
    return Math.max(1, stageValue + 1);
  }

  return Math.max(1, explicit || 1);
}

function buildInventoryEffect(tamer, item, targetActor, kind = "none") {
  const automation = item.system?.automation ?? {};
  const value = getInventoryAutomationValue(item, targetActor);
  const label = automation.label || item.name;
  const duration = Number(automation.duration ?? (item.type === "equipment" ? 0 : 1));
  const cardType = String(item.system?.cardType ?? "");

  let stat = automation.stat || "";
  if (item.type === "card" && !stat) {
    stat = {
      attack: "damage",
      sureHit: "accuracy",
      reaction: "dodge",
      defense: "armor"
    }[cardType] ?? "";
  }

  return {
    id: foundry.utils.randomID(),
    tag: automation.tag || kind,
    label,
    value,
    potency: value,
    stat,
    kind,
    duration,
    remaining: duration,
    category: item.type === "equipment" ? "equipment" : "positive",
    source: item.type,
    sourceItemUuid: item.uuid,
    sourceItemName: item.name,
    sourceActorName: tamer?.name ?? "",
    sourceActorUuid: tamer?.uuid ?? ""
  };
}

function getInventoryItemTypeLabelKey(type) {
  const labels = {
    attack: "DDA.Item.Attack",
    quality: "DDA.Item.Quality",
    torment: "DDA.Item.Torment",
    tamerTalent: "DDA.Item.TamerTalent",
    motif: "DDA.Item.Motif",
    equipment: "DDA.Item.Equipment",
    consumable: "DDA.Item.Consumable",
    card: "DDA.Item.Card",
    milestone: "DDA.Item.Milestone",
    trait: "DDA.Item.Trait",
    evolutionLink: "DDA.Item.EvolutionLink",
    digimental: "DDA.Item.Digimental"
  };

  return labels[type] ?? "DDA.Item.Item";
}

function localize(key) {
  return game.i18n.localize(key);
}

function formatI18n(key, data = {}) {
  return game.i18n.format(key, data);
}
