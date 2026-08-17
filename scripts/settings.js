import { confirmApplyHumanScalingToAllDigimonTokens } from "./tokens/digimon-token-scale.js";
import { DDA_HYBRID_SPECIAL_WORKFLOW_SUPPORTED } from "./rules/special-evolution-methods.js";

const MODULE_ID = "digimon-digital-adventures";
const { DialogV2 } = foundry.applications.api;

let reloadRecommendedTimeout = null;
let reloadPromptOpen = false;

function rerenderDDAWindows() {
  for (const app of Object.values(ui.windows ?? {})) {
    app.render(false);
  }

  ui.actors?.render(true);
}

function promptReloadRecommended() {
  if (reloadRecommendedTimeout) {
    clearTimeout(reloadRecommendedTimeout);
  }

  reloadRecommendedTimeout = setTimeout(() => {
    reloadRecommendedTimeout = null;

    if (reloadPromptOpen) return;

    reloadPromptOpen = true;

    void DialogV2.confirm({
      window: {
        title: game.i18n.localize("DDA.Settings.ReloadPrompt.Title")
      },
      content: `<p>${game.i18n.localize("DDA.Settings.ReloadPrompt.Content")}</p>`,
      yes: { default: false },
      no: { default: true },
      rejectClose: false,
      modal: true
    }).then((confirmed) => {
      if (confirmed) {
        window.location.reload();
        return;
      }

      reloadPromptOpen = false;
    }).catch((error) => {
      reloadPromptOpen = false;
      console.error("DDA | Failed to display reload recommendation dialog", error);
    });
  }, 350);
}

function onSettingChanged({ reloadRecommended = false } = {}) {
  rerenderDDAWindows();

  if (reloadRecommended) {
    promptReloadRecommended();
  }
}

function localize(key) {
  return game.i18n.localize(key);
}

function promptReloadForSetting(settingNameKey = "DDA.Settings.ReloadRequired.Setting") {
  const title = localize("DDA.Settings.ReloadRequiredTitle");
  const settingName = localize(settingNameKey);
  const content = `<p>${game.i18n.format("DDA.Settings.ReloadRequiredContent", { setting: settingName })}</p>`;

  void DialogV2.confirm({
    window: { title },
    content,
    yes: { default: true },
    no: { default: false },
    rejectClose: false,
    modal: true
  }).then((confirmed) => {
    if (confirmed) {
      window.location.reload();
      return;
    }

    ui.notifications.info(localize("DDA.Settings.ReloadRequiredNotification"));
  }).catch((error) => {
    console.error("DDA | Failed to display reload-required dialog", error);
  });
}

export function registerDDASettings() {
  game.settings.register(MODULE_ID, "campaignLevel", {
    name: "DDA.Settings.CampaignLevel.Name",
    hint: "DDA.Settings.CampaignLevel.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      classic: "DDA.Settings.CampaignLevel.Classic",
      standard: "DDA.Settings.CampaignLevel.Standard",
      extreme: "DDA.Settings.CampaignLevel.Extreme"
    },
    default: "standard",
    onChange: () => onSettingChanged({ reloadRecommended: true })
  });

  game.settings.register(MODULE_ID, "defaultPartnerStartingStage", {
  name: "DDA.Settings.DefaultPartnerStartingStage.Name",
  hint: "DDA.Settings.DefaultPartnerStartingStage.Hint",
  scope: "world",
  config: true,
  type: String,
  choices: {
    baby1: "DDA.Settings.DefaultPartnerStartingStage.Baby1",
    baby2: "DDA.Settings.DefaultPartnerStartingStage.Baby2",
    child: "DDA.Settings.DefaultPartnerStartingStage.Child",
    adult: "DDA.Settings.DefaultPartnerStartingStage.Adult",
    perfect: "DDA.Settings.DefaultPartnerStartingStage.Perfect",
    ultimate: "DDA.Settings.DefaultPartnerStartingStage.Ultimate"
  },
  default: "child",
  onChange: () => promptReloadForSetting("DDA.Settings.DefaultPartnerStartingStage.Name")
});

  game.settings.register(MODULE_ID, "digimonNameStyle", {
    name: "DDA.Settings.DigimonNameStyle.Name",
    hint: "DDA.Settings.DigimonNameStyle.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      original: "DDA.Settings.DigimonNameStyle.Original",
      dub: "DDA.Settings.DigimonNameStyle.Dub"
    },
    default: "original",
      onChange: () => onSettingChanged({ reloadRecommended: true })
  });

  game.settings.register(MODULE_ID, "digimonStageNameStyle", {
  name: "DDA.Settings.DigimonStageNameStyle.Name",
  hint: "DDA.Settings.DigimonStageNameStyle.Hint",
  scope: "client",
  config: true,
  type: String,
  choices: {
    original: "DDA.Settings.DigimonStageNameStyle.Original",
    dub: "DDA.Settings.DigimonStageNameStyle.Dub"
  },
  default: "original",
    onChange: () => onSettingChanged({ reloadRecommended: true })
});

  game.settings.register(MODULE_ID, "naturalCriticals", {
    name: "DDA.Settings.NaturalCriticals.Name",
    hint: "DDA.Settings.NaturalCriticals.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "harderTorments", {
    name: "DDA.Settings.HarderTorments.Name",
    hint: "DDA.Settings.HarderTorments.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "mechanicalTorments", {
    name: "DDA.Settings.MechanicalTorments.Name",
    hint: "DDA.Settings.MechanicalTorments.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "flexibleTormentCreation", {
    name: "DDA.Settings.FlexibleTormentCreation.Name",
    hint: "DDA.Settings.FlexibleTormentCreation.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => onSettingChanged()
  });

  game.settings.register(MODULE_ID, "attributeAdvantage", {
    name: "DDA.Settings.AttributeAdvantage.Name",
    hint: "DDA.Settings.AttributeAdvantage.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      none: "DDA.Settings.AttributeAdvantage.None",
      minor: "DDA.Settings.AttributeAdvantage.Minor",
      major: "DDA.Settings.AttributeAdvantage.Major"
    },
    default: "none"
  });

  game.settings.register(MODULE_ID, "multiattackMode", {
    name: "DDA.Settings.MultiattackMode.Name",
    hint: "DDA.Settings.MultiattackMode.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      disabled: "DDA.Settings.MultiattackMode.Disabled",
      full: "DDA.Settings.MultiattackMode.Full",
      diminishing: "DDA.Settings.MultiattackMode.Diminishing"
    },
    default: "disabled"
  });

  game.settings.register(MODULE_ID, "energizeAction", {
    name: "DDA.Settings.EnergizeAction.Name",
    hint: "DDA.Settings.EnergizeAction.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });


  game.settings.register(MODULE_ID, "enableSlideEvolution", {
    name: "DDA.Settings.EnableSlideEvolution.Name",
    hint: "DDA.Settings.EnableSlideEvolution.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "enableWarpEvolution", {
    name: "DDA.Settings.EnableWarpEvolution.Name",
    hint: "DDA.Settings.EnableWarpEvolution.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "enableDarkEvolution", {
    name: "DDA.Settings.EnableDarkEvolution.Name",
    hint: "DDA.Settings.EnableDarkEvolution.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "enableHiddenCompatibilityQuestionnaire", {
    name: "DDA.Settings.EnableHiddenCompatibilityQuestionnaire.Name",
    hint: "DDA.Settings.EnableHiddenCompatibilityQuestionnaire.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "enableArmorEvolution", {
  name: "DDA.Settings.EnableArmorEvolution.Name",
  hint: "DDA.Settings.EnableArmorEvolution.Hint",
  scope: "world",
  config: true,
  type: Boolean,
  default: false
});

game.settings.register(MODULE_ID, "armorEvolutionRecharge", {
  name: "DDA.Settings.ArmorEvolutionRecharge.Name",
  hint: "DDA.Settings.ArmorEvolutionRecharge.Hint",
  scope: "world",
  config: true,
  type: String,
  choices: {
    rest: "DDA.Settings.ArmorEvolutionRecharge.Rest",
    milestone: "DDA.Settings.ArmorEvolutionRecharge.Milestone",
    ip: "DDA.Settings.ArmorEvolutionRecharge.IP",
    narrative: "DDA.Settings.ArmorEvolutionRecharge.Narrative"
  },
  default: "rest"
});





game.settings.register(MODULE_ID, "enableJogressEvolution", {
  name: "DDA.Settings.EnableJogressEvolution.Name",
  hint: "DDA.Settings.EnableJogressEvolution.Hint",
  scope: "world",
  config: true,
  type: Boolean,
  default: false
});


game.settings.register(MODULE_ID, "enableHybridEvolution", {
  name: "DDA.Settings.EnableHybridEvolution.Name",
  hint: "DDA.Settings.EnableHybridEvolution.Hint",
  scope: "world",
  // Kept registered for backward compatibility with existing worlds.
  config: DDA_HYBRID_SPECIAL_WORKFLOW_SUPPORTED,
  type: Boolean,
  default: false
});


game.settings.register(MODULE_ID, "enableBioMergeEvolution", {
  name: "DDA.Settings.EnableBioMergeEvolution.Name",
  hint: "DDA.Settings.EnableBioMergeEvolution.Hint",
  scope: "world",
  // Kept registered for backward compatibility with existing worlds.
  config: DDA_HYBRID_SPECIAL_WORKFLOW_SUPPORTED,
  type: Boolean,
  default: false
});

  game.settings.register(MODULE_ID, "evolutionStructureMode", {
    name: "DDA.Settings.EvolutionStructureMode.Name",
    hint: "DDA.Settings.EvolutionStructureMode.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      classic: "DDA.Settings.EvolutionStructureMode.Classic",
      branching: "DDA.Settings.EvolutionStructureMode.Branching",
      open: "DDA.Settings.EvolutionStructureMode.Open"
    },
    default: "branching"
  });

  game.settings.register(MODULE_ID, "requireDirectEvolutionLink", {
    name: "DDA.Settings.RequireDirectEvolutionLink.Name",
    hint: "DDA.Settings.RequireDirectEvolutionLink.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "allowEvolutionRebranch", {
    name: "DDA.Settings.AllowEvolutionRebranch.Name",
    hint: "DDA.Settings.AllowEvolutionRebranch.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "showLockedEvolutions", {
    name: "DDA.Settings.ShowLockedEvolutions.Name",
    hint: "DDA.Settings.ShowLockedEvolutions.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });



game.settings.register(MODULE_ID, "enableForcedEvolution", {
  name: "DDA.Settings.EnableForcedEvolution.Name",
  hint: "DDA.Settings.EnableForcedEvolution.Hint",
  scope: "world",
  config: true,
  type: Boolean,
  default: true
});

game.settings.register(MODULE_ID, "enableBlastEvolution", {
  name: "DDA.Settings.EnableBlastEvolution.Name",
  hint: "DDA.Settings.EnableBlastEvolution.Hint",
  scope: "world",
  config: true,
  type: Boolean,
  default: true
});

game.settings.register(MODULE_ID, "enableClashActions", {
  name: "DDA.Settings.EnableClashActions.Name",
  hint: "DDA.Settings.EnableClashActions.Hint",
  scope: "world",
  config: true,
  type: Boolean,
  default: true
});

game.settings.register(MODULE_ID, "humanScaling", {
  name: "DDA.Settings.HumanScaling.Name",
  hint: "DDA.Settings.HumanScaling.Hint",
  scope: "world",
  config: true,
  type: String,
  choices: {
    small: "DDA.Settings.HumanScaling.Small",
    medium: "DDA.Settings.HumanScaling.Medium",
    large: "DDA.Settings.HumanScaling.Large"
  },
  default: "medium",
    onChange: () => onSettingChanged({ reloadRecommended: true })
});

  game.settings.register(MODULE_ID, "enableMotifs", {
    name: "DDA.Settings.EnableMotifs.Name",
    hint: "DDA.Settings.EnableMotifs.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "enableDigiModifyCards", {
    name: "DDA.Settings.EnableDigiModifyCards.Name",
    hint: "DDA.Settings.EnableDigiModifyCards.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "enableExpendableItems", {
    name: "DDA.Settings.EnableExpendableItems.Name",
    hint: "DDA.Settings.EnableExpendableItems.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

    game.settings.register(MODULE_ID, "enableEquipableItems", {
    name: "DDA.Settings.EnableEquipableItems.Name",
    hint: "DDA.Settings.EnableEquipableItems.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "campaignMilestoneLedger", {
    name: "DDA.Settings.Internal.CampaignMilestoneLedger.Name",
    hint: "DDA.Settings.Internal.CampaignMilestoneLedger.Hint",
    scope: "world",
    config: false,
    type: Object,
    default: {
      version: 1,
      method: "narrative",
      experience: {
        value: 0,
        max: 7
      },
      evolution: {
        defaultRange: {
          template: "limited",
          manualValue: 2,
          defaultStagePolicy: "range"
        }
      },
      records: []
    }
  });

  game.settings.register(MODULE_ID, "sessionState", {
    name: "DDA.Settings.Internal.SessionState.Name",
    hint: "DDA.Settings.Internal.SessionState.Hint",
    scope: "world",
    config: false,
    type: Object,
    default: {
      version: 1,
      active: false,
      id: "",
      startedAt: "",
      startedBy: {
        id: "",
        name: ""
      },
      endedAt: "",
      endedBy: {
        id: "",
        name: ""
      }
    }
  });

}

export function getDDASetting(key) {
  return game.settings.get(MODULE_ID, key);
}
