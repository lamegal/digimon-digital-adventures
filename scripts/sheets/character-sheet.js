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
  getCampaignLevelSummary,
  getAttributeStartingCap,
  getSkillStartingCap,
  getStartingAttributePoints,
  getStartingSkillPoints,
  getScaledTalentRequirement
} from "../rules/campaign-rules.js";
import { syncTamerAndPartnerOwnership } from "../utils/ownership.js";
import { validateTamerTalentUse, useTamerTalent } from "../rules/tamer-talent-automation.js";

const ActorSheetV1 = foundry.appv1.sheets.ActorSheet;

function getDdaDocumentSheetConfigClass() {
  return globalThis.foundry?.applications?.apps?.DocumentSheetConfig ?? null;
}

export class DDACharacterSheet extends ActorSheetV1 {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["dda", "sheet", "actor", "character"],
      template: "systems/digimon-digital-adventures/templates/actor/character-sheet.html",
      width: 860,
      height: 760,
      submitOnChange: true,
      submitOnClose: true,
      closeOnSubmit: false,
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "stats"
        }
      ]
    });
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    
    

context.system = this.actor.system;
context.sortedSkills = this._getSortedSkillViewData();
context.isGM = Boolean(game.user?.isGM);
context.campaignRules = this._getCampaignRuleViewData();
context.partnerCurrentSpecies = await this._getPartnerCurrentSpecies();
context.partnerIdentityName = await this._getPartnerIdentityName();
context.partnerStartingStage = this._getPartnerStartingStageViewData();
context.crestPlaque = this._getCrestPlaqueViewData();
context.digiviceSkin = this._getDigiviceSkinViewData();
context.optionalRules = this._getOptionalRuleViewData();
context.jogressActive = Boolean(this.actor.system.specialEvolutions?.jogress?.state?.active);
context.hybridActive = Boolean(this.actor.system.specialEvolutions?.hybrid?.state?.active);
context.hybridState = this._getHybridStateViewData();

const enableHybridEvolution = Boolean(getDDASetting("enableHybridEvolution"));
const enableBioMergeEvolution = Boolean(getDDASetting("enableBioMergeEvolution"));
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

    const attributeCap = getAttributeStartingCap();
    const skillCap = getSkillStartingCap();
    const startingAttributePoints = getStartingAttributePoints();
    const startingSkillPoints = getStartingSkillPoints();

    const attributeOverCap = Object.entries(attributes)
      .filter(([key, attribute]) => Number(attribute?.value ?? 0) > attributeCap)
      .map(([key, attribute]) => ({
        key,
        label: game.i18n.localize(attribute?.label ?? key),
        value: Number(attribute?.value ?? 0),
        cap: attributeCap
      }));

    const skillOverCap = Object.entries(skills)
      .filter(([key, skill]) => Number(skill?.value ?? 0) > skillCap)
      .map(([key, skill]) => ({
        key,
        label: game.i18n.localize(skill?.label ?? key),
        value: Number(skill?.value ?? 0),
        cap: skillCap
      }));

    return {
      ...rules,
      attributeCap,
      skillCap,
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
      hasPointWarning: attributeTotal > startingAttributePoints || skillTotal > startingSkillPoints
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
        localizedLabel
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

  activateListeners(html) {
    super.activateListeners(html);
      this._ensureTamerEndTurnButton(html);
    html.find(".item-create").on("click", this._onItemCreate.bind(this));
    html.find(".item-edit").on("click", this._onItemEdit.bind(this));
    html.find(".item-delete").on("click", this._onItemDelete.bind(this));

    html.find(".roll-skill").on("click", this._onRollSkill.bind(this));
    html.find(".roll-torment").on("click", this._onRollTorment.bind(this));
    html.find(".take-rest").on("click", this._onTakeRest.bind(this));
    html.find(".roll-recovery").on("click", this._onRollRecovery.bind(this));
    html.find(".end-turn-tamer").on("click", this._onEndTurn.bind(this));
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
    html.find(".evolve-partner").on("click", this._onEvolvePartner.bind(this));
    html.find(".jogress-partner").on("click", this._onJogressPartner.bind(this));
    html.find(".end-jogress-partner").on("click", this._onEndJogressPartner.bind(this));
    html.find(".hybrid-partner").on("click", this._onHybridPartner.bind(this));
    html.find(".biomerge-partner").on("click", this._onBioMergePartner.bind(this));
    html.find(".end-hybrid-partner").on("click", this._onEndHybridPartner.bind(this));
    html.find(".open-hybrid-sheet").on("click", this._onOpenHybridSheet.bind(this));
    html.find(".remove-active-effect").on("click", this._onRemoveActiveEffect.bind(this));

    html.find('[data-action="digivice-sheet"]').on("click", this._onDigiviceSheet.bind(this));
    html.find('[data-action="digivice-token"]').on("click", this._onDigivicePrototypeToken.bind(this));
    html.find('[data-action="digivice-close"]').on("click", this._onDigiviceClose.bind(this));

    html.find(".dda-window-side-device").on("dblclick", this._onDigiviceDoubleClick.bind(this));
    html.find(".dda-window-side-device").on("pointerdown", this._onDigiviceDragStart.bind(this));

    // A ficha do Digi-Escolhido esconde a barra nativa do Foundry para usar a carcaça do Digivice.
    // Este handler mantém a janela arrastável mesmo quando ela renderiza encostada no topo da tela
    // e o Digivice externo fica parcialmente fora da área visível.
    html.find(".dda-window-frame, .dda-window-paper > .sheet-header").on("pointerdown", this._onCustomSheetDragStart.bind(this));

    html.find(".dda-device-button").on("pointerdown dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    html.find(".open-tamer-talent-compendium").on("click", this._onOpenTamerTalentCompendium.bind(this));
    html.find(".open-official-tamer-talent").on("click", this._onOpenOfficialTamerTalent.bind(this));
    html.find(".use-tamer-talent").on("click", this._onUseTamerTalent.bind(this));
    html.find(".inventory-use-item").on("click", this._onUseInventoryItem.bind(this));
  }

  _ensureTamerEndTurnButton(html) {
  const combatActions = html
    .find(".dda-tamer-combat-tab .combat-actions")
    .first();

  if (!combatActions.length) return;
  if (combatActions.find(".end-turn-tamer").length) return;

  combatActions.prepend(
    `<button type="button" class="end-turn-tamer">${game.i18n.localize("DDA.EndTurn.Title")}</button>`
  );
}

  async _updateObject(event, formData) {
if (!game.user?.isGM) {
  delete formData["system.partner.bonusDp"];
  delete formData["system.partner.startingStageOverride"];

  for (const key of Object.keys(formData)) {
    if (key.startsWith("system.partner.unlockedEvolutionStages") || key.startsWith("system.partner.unlockedForms")) {
      delete formData[key];
    }
  }
}

    const validation = this._validateCampaignLevelFormData(formData);

    if (validation.messages.length) {
      ui.notifications.warn(validation.messages.join(" "));
    }

    return super._updateObject(event, formData);
  }

  _validateCampaignLevelFormData(formData) {
    const attributeCap = getAttributeStartingCap();
    const skillCap = getSkillStartingCap();
    const messages = [];

    for (const [key, value] of Object.entries(formData)) {
      if (key.startsWith("system.attributes.") && key.endsWith(".value")) {
        const numericValue = Number(value ?? 0);

        if (numericValue < 1) {
          messages.push(game.i18n.localize("DDA.Warning.AttributeBelowMinimum"));
          formData[key] = 1;
          continue;
        }

        if (numericValue > attributeCap) {
          messages.push(game.i18n.format("DDA.Warning.AttributeAboveCampaignCap", {
            value: numericValue,
            cap: attributeCap
          }));
          formData[key] = attributeCap;
          continue;
        }
      }
    }

    for (const [key, value] of Object.entries(formData)) {
      if (key.startsWith("system.skills.") && key.endsWith(".value")) {
        const numericValue = Number(value ?? 0);

        if (numericValue > skillCap) {
          messages.push(game.i18n.format("DDA.Warning.SkillAboveCampaignCap", {
            value: numericValue,
            cap: skillCap
          }));
          break;
        }
      }
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
        automation: talent.automation ?? { enabled: false }
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
      source: "official"
    };
  });
}
async _onOpenTamerTalentCompendium(event) {
  event.preventDefault();

  const talents = this._getOfficialTamerTalentViewData();

  let activeFilter = "all";
  let searchTerm = "";

  const matchesSearch = (talent, term) => {
    const normalizedTerm = String(term ?? "").trim().toLowerCase();
    if (!normalizedTerm) return true;

    const haystack = [
      talent.name,
      talent.requirementText,
      talent.statusLabel,
      talent.system?.specialOrder?.name,
      talent.system?.effect,
      talent.system?.description,
talent.system?.isAdvanced
  ? `${localize("DDA.TamerTalent.Advanced")} advanced avançado avancado`
  : `${localize("DDA.TamerTalent.Initial")} initial inicial`,

talent.system?.isSpecialOrder
  ? `${localize("DDA.TamerTalent.SpecialOrder")} special order ordem especial`
  : `${localize("DDA.TamerTalent.Talent")} talent talento`,
      getTamerTalentUseTypeLabel(talent.system?.useType),
      getTamerTalentActionCostLabel(talent.system?.actionCost),
      getTamerTalentFrequencyLabel(talent.system?.frequency)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedTerm);
  };

  const matchesFilter = (talent, filter) => {
    switch (filter) {
      case "unlocked":
        return talent.requirementMet;
      case "locked":
        return !talent.requirementMet;
      case "initial":
        return !talent.system?.isAdvanced;
      case "advanced":
        return Boolean(talent.system?.isAdvanced);
      default:
        return true;
    }
  };

  const getVisibleTalents = () => {
    return talents.filter((talent) => {
      return matchesSearch(talent, searchTerm) && matchesFilter(talent, activeFilter);
    });
  };

const renderResults = () => {
  const visibleTalents = getVisibleTalents();

  const unlockedTalents = visibleTalents.filter((talent) => talent.requirementMet);
  const lockedTalents = visibleTalents.filter((talent) => !talent.requirementMet);

  const entries = visibleTalents.length
    ? visibleTalents.map((talent) => renderTamerTalentCompendiumEntry(talent)).join("")
    : `<p class="dda-talent-compendium-empty">${localize("DDA.TamerTalentBrowser.NoTalentsFound")}</p>`;

  return `
    <div class="dda-talent-compendium-summary">
      <div>
        <strong>${unlockedTalents.length}</strong>
        <span>${localize("DDA.TamerTalentBrowser.Unlocked")}</span>
      </div>

      <div>
        <strong>${lockedTalents.length}</strong>
        <span>${localize("DDA.TamerTalentBrowser.Locked")}</span>
      </div>

      <div>
        <strong>${visibleTalents.length}</strong>
        <span>${localize("DDA.TamerTalentBrowser.Total")}</span>
      </div>
    </div>

    <section class="dda-talent-compendium-flat-section">
      <div class="dda-talent-compendium-list">
        ${entries}
      </div>
    </section>
  `;
};

const content = `
  <section class="dda-tamer-talent-compendium">
    <header class="dda-tamer-talent-browser-header">
      <input
        type="search"
        value=""
        placeholder="${localize("DDA.TamerTalentBrowser.SearchPlaceholder")}"
        data-tamer-talent-search
      />

      <nav class="dda-tamer-talent-browser-filters">
        <button type="button" class="active" data-tamer-talent-filter="all">${localize("DDA.TamerTalentBrowser.Filter.All")}</button>
        <button type="button" data-tamer-talent-filter="unlocked">${localize("DDA.TamerTalentBrowser.Filter.Unlocked")}</button>
        <button type="button" data-tamer-talent-filter="locked">${localize("DDA.TamerTalentBrowser.Filter.Locked")}</button>
        <button type="button" data-tamer-talent-filter="initial">${localize("DDA.TamerTalentBrowser.Filter.Initial")}</button>
        <button type="button" data-tamer-talent-filter="advanced">${localize("DDA.TamerTalentBrowser.Filter.Advanced")}</button>
      </nav>
    </header>

    <div class="dda-tamer-talent-results" data-tamer-talent-results>
      ${renderResults()}
    </div>
  </section>
`;

  const dialog = new Dialog(
    {
      title: localize("DDA.TamerTalentBrowser.Title"),
      content,
      buttons: {
        close: {
          label: localize("DDA.Button.Close")
        }
      },
      default: "null",
      render: (html) => {
        const root = html instanceof jQuery ? html : $(html);
        const results = root.find("[data-tamer-talent-results]");
        const searchInput = root.find("[data-tamer-talent-search]");
        const filterButtons = root.find("[data-tamer-talent-filter]");

        const refresh = () => {
          results.html(renderResults());
        };

        searchInput.on("keydown", (event) => {
          if (event.key !== "Enter") return;

          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          searchTerm = event.currentTarget.value ?? "";
          refresh();
        });

        filterButtons.on("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          activeFilter = event.currentTarget.dataset.tamerTalentFilter ?? "all";

          filterButtons.removeClass("active");
          event.currentTarget.classList.add("active");

          refresh();
        });
      }
    },
    {
      classes: ["dda", "dda-tamer-talent-compendium-dialog"],
      width: 760,
      height: 720,
      resizable: true
    }
  );

  dialog.render(true);
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

  new Dialog(
    {
      title: talent.name,
      content,
      buttons: {
        close: {
          label: localize("DDA.Button.Close")
        }
      },
      default: "close"
    },
    {
      classes: ["dda-tamer-talent-detail-dialog"],
      width: 620
    }
  ).render(true);
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

  const confirmed = await Dialog.confirm({
    title: formatI18n("DDA.TamerTalent.UseTitle", {
      talent: talent.name
    }),
    content: renderTamerTalentUseConfirmation(talent, this.actor),
    yes: () => true,
    no: () => false,
    defaultYes: true
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

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    content: renderTamerTalentUseCard(talent, this.actor, {
      actionCostNumber: automationResult.actionCostNumber,
      actionCost: automationResult.actionCost,
      source: talentSource,
      automationResult
    })
  });

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

    return new Promise((resolve) => {
      new Dialog({
        title: game.i18n.format("DDA.Inventory.TargetDialog.Title", { item: item.name }),
        content,
        buttons: {
          use: {
            label: localize("DDA.Button.Use"),
            callback: (html) => {
              const root = html instanceof jQuery ? html : $(html);
              const index = Number(root.find("select[name='targetIndex']").val() ?? 0);
              resolve(targets[index] ?? null);
            }
          },
          cancel: {
            label: localize("DDA.Button.Cancel"),
            callback: () => resolve(null)
          }
        },
        default: "use",
        close: () => resolve(null)
      }).render(true);
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

const confirmed = await Dialog.confirm({
  title: localize("DDA.Dialog.DeleteItem.Title"),
  content: `<p>${formatI18n("DDA.Dialog.DeleteItem.Content", {
    item: `<strong>${escapeHtml(item.name)}</strong>`
  })}</p>`,
  yes: () => true,
  no: () => false,
  defaultYes: false
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

const confirmed = await Dialog.confirm({
  title: localize("DDA.Dialog.Rest.Title"),
  content: `<p>${localize("DDA.Dialog.Rest.Content")}</p>`,
  yes: () => true,
  no: () => false,
  defaultYes: false
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

  async _onRecoveryMenu(event) {
    event.preventDefault();

    const choice = await new Promise((resolve) => {
      new Dialog({
        title: localize("DDA.Recovery.OptionsTitle"),
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
        buttons: {
          postCombat: {
            label: localize("DDA.Button.PostCombatRecovery"),
            callback: () => resolve("postCombat")
          },
          break: {
            label: localize("DDA.Button.Break"),
            callback: () => resolve("break")
          },
          rest: {
            label: localize("DDA.Button.Rest"),
            callback: () => resolve("rest")
          },
          cancel: {
            label: localize("DDA.Button.Cancel"),
            callback: () => resolve(null)
          }
        },
        default: "postCombat",
        close: () => resolve(null)
      }).render(true);
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
      const confirmed = await Dialog.confirm({
        title: localize("DDA.Dialog.Rest.Title"),
        content: `<p>${localize("DDA.Dialog.Rest.Content")}</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: false
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

const confirmed = await Dialog.confirm({
  title: localize("DDA.Dialog.UnlinkPartner.Title"),
  content: `<p>${formatI18n("DDA.Dialog.UnlinkPartner.Content", {
    partner: `<strong>${escapeHtml(partnerName)}</strong>`,
    tamer: `<strong>${escapeHtml(this.actor.name)}</strong>`
  })}</p>`,
  yes: () => true,
  no: () => false,
  defaultYes: false
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

  const choice = await new Promise((resolve) => {
    const buttons = {
      normal: {
        label: localize("DDA.Evolution.Option.Normal"),
        callback: () => resolve("normal")
      }
    };

    if (forcedEnabled) {
      buttons.forced = {
        label: localize("DDA.Evolution.Option.Forced"),
        callback: () => resolve("forced")
      };
    }

    if (blastEnabled) {
      buttons.blast = {
        label: localize("DDA.Evolution.Option.Blast"),
        callback: () => resolve("blast")
      };
    }

    buttons.cancel = {
      label: localize("DDA.Button.Cancel"),
      callback: () => resolve(null)
    };

    new Dialog({
      title: localize("DDA.Evolution.OptionsTitle"),
      content: `
        <div class="dda-roll-dialog dda-evolution-options-dialog">
          <p>${localize("DDA.Evolution.OptionsHint")}</p>
          <ul>
            <li><strong>${localize("DDA.Evolution.Option.Normal")}</strong> — ${localize("DDA.Evolution.OptionHint.Normal")}</li>
            ${forcedEnabled ? `<li><strong>${localize("DDA.Evolution.Option.Forced")}</strong> — ${localize("DDA.Evolution.OptionHint.Forced")}</li>` : ""}
            ${blastEnabled ? `<li><strong>${localize("DDA.Evolution.Option.Blast")}</strong> — ${localize("DDA.Evolution.OptionHint.Blast")}</li>` : ""}
          </ul>
        </div>
      `,
      buttons,
      default: "normal",
      close: () => resolve(null)
    }).render(true);
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

  try {
    // Mesmo painel do botão de engrenagem/configuração da ficha.
    if (typeof this._onConfigureSheet === "function") {
      return this._onConfigureSheet(event);
    }

    // Fallback para ambientes onde o método herdado não esteja disponível.
    if (typeof DocumentSheetConfig !== "undefined") {
      new DocumentSheetConfig(this.actor, {
        top: this.position.top + 40,
        left: this.position.left + 40
      }).render(true);
      return;
    }

    ui.notifications.warn(localize("DDA.Warning.CouldNotOpenSheetConfig"));
  } catch (error) {
    console.error("DDA | Erro ao abrir Configuração de Ficha:", error);
    ui.notifications.error(localize("DDA.Error.OpenSheetConfig"));
  }
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
    ui.notifications.error(localize("DDA.Error.OpenPrototypeToken"));
  }
}

_onDigiviceClose(event) {
  event.preventDefault();
  this.close();
}

_onDigiviceDoubleClick(event) {
  event.preventDefault();

  if (event.target.closest(".dda-device-button")) {
    return;
  }

  const appElement = this.element?.[0]?.closest(".window-app, .app, .application");
  if (!appElement) return;

  appElement.classList.toggle("dda-digivice-collapsed");
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

  const root = this.element?.[0];
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

  const appElement = this.element?.[0]?.closest(".window-app, .app, .application");
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

function renderTamerTalentCompendiumEntry(talent) {
  const specialOrderName = talent.system?.specialOrder?.name ?? "";
  const effect = talent.system?.effect ?? "";
  const requirementText = talent.requirementText ?? localize("DDA.TamerTalent.Requirement.None");

  return `
    <article class="dda-talent-compendium-entry ${talent.statusClass}">
      <header>
        <div>
          <h4>${escapeHtml(talent.name)}</h4>
          ${
            specialOrderName
              ? `<p class="dda-talent-special-order">${escapeHtml(specialOrderName)}</p>`
              : ""
          }
        </div>

        <span class="dda-talent-status ${talent.statusClass}">
          ${escapeHtml(talent.statusLabel)}
        </span>
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

      <p class="dda-talent-effect">${escapeHtml(effect)}</p>
    </article>
  `;
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

        <span class="dda-talent-status ${talent.statusClass}">
          ${escapeHtml(talent.statusLabel)}
        </span>
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
  const baseUses = talent.system?.uses ?? talent.uses ?? { enabled: false, value: 0, max: 0, recharge: "" };

  if (!baseUses.enabled) {
    return {
      enabled: false,
      value: 0,
      max: 0,
      recharge: ""
    };
  }

  const max = Number(baseUses.max ?? 0);
  const storedValue = actor.system.tamerTalentUses?.[talent.id]?.value;

  return {
    enabled: true,
    value: Number(storedValue ?? max),
    max,
    recharge: baseUses.recharge ?? ""
  };
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

function localize(key) {
  return game.i18n.localize(key);
}

function formatI18n(key, data = {}) {
  return game.i18n.format(key, data);
}