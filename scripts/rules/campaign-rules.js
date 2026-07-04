import { getDDASetting } from "../settings.js";

export const DDA_CAMPAIGN_LEVEL_CONFIGS = {
  classic: {
    key: "classic",
    label: "DDA.Settings.CampaignLevel.Classic",

    attributeStartingCap: 3,
    attributeFinalCap: 5,
    skillStartingCap: 3,
    skillFinalCap: 5,

    startingAttributePoints: 5,
    startingSkillPoints: 20,

    skillTnModifier: -2,
    recommendedMilestones: 5,
    startingMarkedTormentBoxes: 5,

    legacyFinalXp: 60,
    legacyFinalBonusDp: 15,

    talentRequirementScale: {
      3: 2,
      5: 3,
      6: 4,
      7: 5
    },

    skillBeyondThreshold: 1
  },

  standard: {
    key: "standard",
    label: "DDA.Settings.CampaignLevel.Standard",

    attributeStartingCap: 5,
    attributeFinalCap: 7,
    skillStartingCap: 5,
    skillFinalCap: 7,

    startingAttributePoints: 10,
    startingSkillPoints: 25,

    skillTnModifier: 0,
    recommendedMilestones: 10,
    startingMarkedTormentBoxes: 7,

    legacyFinalXp: 120,
    legacyFinalBonusDp: 30,

    talentRequirementScale: {
      3: 3,
      5: 5,
      6: 6,
      7: 7
    },

    skillBeyondThreshold: 2
  },

  extreme: {
    key: "extreme",
    label: "DDA.Settings.CampaignLevel.Extreme",

    attributeStartingCap: 7,
    attributeFinalCap: 10,
    skillStartingCap: 7,
    skillFinalCap: 10,

    startingAttributePoints: 15,
    startingSkillPoints: 30,

    skillTnModifier: 2,
    recommendedMilestones: 15,
    startingMarkedTormentBoxes: 10,

    legacyFinalXp: 180,
    legacyFinalBonusDp: 45,

    talentRequirementScale: {
      3: 4,
      5: 6,
      6: 8,
      7: 10
    },

    skillBeyondThreshold: 3
  }
};

export function getCampaignLevelKey() {
  return getDDASetting("campaignLevel") ?? "standard";
}

export function getCampaignLevelConfig(level = null) {
  const key = level ?? getCampaignLevelKey();
  return DDA_CAMPAIGN_LEVEL_CONFIGS[key] ?? DDA_CAMPAIGN_LEVEL_CONFIGS.standard;
}

export function getCampaignLevelLabel(level = null) {
  const config = getCampaignLevelConfig(level);
  return game.i18n.localize(config.label);
}

export function getAttributeStartingCap(level = null) {
  return getCampaignLevelConfig(level).attributeStartingCap;
}

export function getAttributeFinalCap(level = null) {
  return getCampaignLevelConfig(level).attributeFinalCap;
}

export function getSkillStartingCap(level = null) {
  return getCampaignLevelConfig(level).skillStartingCap;
}

export function getSkillFinalCap(level = null) {
  return getCampaignLevelConfig(level).skillFinalCap;
}

export function getStartingAttributePoints(level = null) {
  return getCampaignLevelConfig(level).startingAttributePoints;
}

export function getStartingSkillPoints(level = null) {
  return getCampaignLevelConfig(level).startingSkillPoints;
}

export function getSkillTnModifier(level = null) {
  return getCampaignLevelConfig(level).skillTnModifier;
}

export function getRecommendedMilestones(level = null) {
  return getCampaignLevelConfig(level).recommendedMilestones;
}

export function getStartingMarkedTormentBoxes(level = null) {
  return getCampaignLevelConfig(level).startingMarkedTormentBoxes;
}

export function getLegacyFinalXp(level = null) {
  return getCampaignLevelConfig(level).legacyFinalXp;
}

export function getLegacyFinalBonusDp(level = null) {
  return getCampaignLevelConfig(level).legacyFinalBonusDp;
}

export function getSkillBeyondThreshold(level = null) {
  return getCampaignLevelConfig(level).skillBeyondThreshold;
}

export function getScaledTalentRequirement(value, level = null) {
  const numericValue = Number(value ?? 0);
  const config = getCampaignLevelConfig(level);

  return config.talentRequirementScale[numericValue] ?? numericValue;
}

export function applySkillTnModifier(baseTn, level = null) {
  const tn = Number(baseTn ?? 0);
  const modifier = getSkillTnModifier(level);

  if (!tn) return tn;

  return Math.max(1, tn + modifier);
}

export function getCampaignLevelSummary(level = null) {
  const config = getCampaignLevelConfig(level);

  return {
    key: config.key,
    label: getCampaignLevelLabel(config.key),
    attributeStartingCap: config.attributeStartingCap,
    attributeFinalCap: config.attributeFinalCap,
    skillStartingCap: config.skillStartingCap,
    skillFinalCap: config.skillFinalCap,
    startingAttributePoints: config.startingAttributePoints,
    startingSkillPoints: config.startingSkillPoints,
    skillTnModifier: config.skillTnModifier,
    recommendedMilestones: config.recommendedMilestones,
    startingMarkedTormentBoxes: config.startingMarkedTormentBoxes,
    legacyFinalXp: config.legacyFinalXp,
    legacyFinalBonusDp: config.legacyFinalBonusDp,
    skillBeyondThreshold: config.skillBeyondThreshold
  };
}
