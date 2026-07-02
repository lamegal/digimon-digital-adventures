const MODULE_ID = "digimon-digital-adventures";

export const DDA_STAGE_NAME_STYLES = {
  original: "original",
  dub: "dub"
};

const DDA_STAGE_LABEL_KEYS = {
  original: {
    baby1: "DDA.Stage.Original.Baby1",
    baby2: "DDA.Stage.Original.Baby2",
    child: "DDA.Stage.Original.Child",
    adult: "DDA.Stage.Original.Adult",
    perfect: "DDA.Stage.Original.Perfect",
    ultimate: "DDA.Stage.Original.Ultimate",
    ultimatePlus: "DDA.Stage.Original.UltimatePlus"
  },

  dub: {
    baby1: "DDA.Stage.Dub.Baby1",
    baby2: "DDA.Stage.Dub.Baby2",
    child: "DDA.Stage.Dub.Child",
    adult: "DDA.Stage.Dub.Adult",
    perfect: "DDA.Stage.Dub.Perfect",
    ultimate: "DDA.Stage.Dub.Ultimate",
    ultimatePlus: "DDA.Stage.Dub.UltimatePlus"
  }
};

export const DDA_STAGE_ORDER = [
  "baby1",
  "baby2",
  "child",
  "adult",
  "perfect",
  "ultimate",
  "ultimatePlus"
];

function localize(key, fallback = "") {
  const localized = game?.i18n?.localize(key) ?? key;
  return localized === key ? (fallback || key) : localized;
}

export function getDigimonStageNameStyle() {
  try {
    const value = game.settings.get(MODULE_ID, "digimonStageNameStyle");
    return DDA_STAGE_NAME_STYLES[value] ? value : "original";
  } catch (_error) {
    return "original";
  }
}

export function getDigimonStageLabelKey(stageKey = "", style = null) {
  const selectedStyle = DDA_STAGE_NAME_STYLES[style] ? style : getDigimonStageNameStyle();
  const normalizedStage = String(stageKey ?? "").trim();

  return DDA_STAGE_LABEL_KEYS[selectedStyle]?.[normalizedStage]
    ?? DDA_STAGE_LABEL_KEYS.original?.[normalizedStage]
    ?? CONFIG.DDA?.stages?.[normalizedStage]?.label
    ?? "DDA.Stage.Unknown";
}

export function getDigimonStageLabel(stageKey = "", options = {}) {
  const style = options?.style ?? null;
  const fallback = options?.fallback ?? String(stageKey || "");

  return localize(getDigimonStageLabelKey(stageKey, style), fallback);
}

export function getDigimonStageOptions(options = {}) {
  const includeUnknown = Boolean(options?.includeUnknown);

  const entries = DDA_STAGE_ORDER.map((key) => {
    return [key, getDigimonStageLabel(key, options)];
  });

  if (includeUnknown) {
    entries.push(["unknown", getDigimonStageLabel("unknown", options)]);
  }

  return Object.fromEntries(entries);
}