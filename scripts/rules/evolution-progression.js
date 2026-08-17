/**
 * Canonical Character Advancement / Evolution progression helpers.
 *
 * Section 8.05 uses two distinct concepts:
 * - Evolution Point costs are fixed by target Stage: Champion 1, Ultimate 3,
 *   Mega or above 5.
 * - Default Range follows the Digimon Stage Value scale: Rookie = 2,
 *   Champion = 3, Ultimate = 4, Mega = 5.
 */
export const DDA_OFFICIAL_EVOLUTION_STAGE_NUMBERS = Object.freeze({
  baby1: -1,
  baby2: 0,
  child: 1,
  adult: 2,
  perfect: 3,
  ultimate: 4,
  ultimatePlus: 5
});

export const DDA_DEFAULT_RANGE_STAGE_VALUES = Object.freeze({
  baby1: 1,
  baby2: 1,
  child: 2,
  adult: 3,
  perfect: 4,
  ultimate: 5,
  ultimatePlus: 5
});

export const DDA_DEFAULT_RANGE_TEMPLATES = Object.freeze({
  LIMITED: "limited",
  COMPLETE: "complete",
  MANUAL: "manual"
});

function number(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function integer(value, fallback = 0) {
  return Math.max(0, Math.floor(number(value, fallback)));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getOfficialEvolutionStageNumber(stageKey = "") {
  const key = String(stageKey ?? "").trim();
  return Object.prototype.hasOwnProperty.call(DDA_OFFICIAL_EVOLUTION_STAGE_NUMBERS, key)
    ? DDA_OFFICIAL_EVOLUTION_STAGE_NUMBERS[key]
    : null;
}

export function getDefaultRangeStageValue(stageKey = "") {
  const key = String(stageKey ?? "").trim();
  return Object.prototype.hasOwnProperty.call(DDA_DEFAULT_RANGE_STAGE_VALUES, key)
    ? DDA_DEFAULT_RANGE_STAGE_VALUES[key]
    : null;
}

export function normalizeDefaultRangeTemplate(value = "limited") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === DDA_DEFAULT_RANGE_TEMPLATES.COMPLETE) return DDA_DEFAULT_RANGE_TEMPLATES.COMPLETE;
  if (normalized === DDA_DEFAULT_RANGE_TEMPLATES.MANUAL) return DDA_DEFAULT_RANGE_TEMPLATES.MANUAL;
  return DDA_DEFAULT_RANGE_TEMPLATES.LIMITED;
}

export function normalizeDefaultRangeValue(value = 2) {
  return clamp(Math.floor(number(value, 2)), 2, 5);
}

/**
 * Recommended campaign templates from 8.05b.
 * Every player Digimon starts at Default Range 2 (Rookie).
 * Limited: Champion at M5, Ultimate at M10, Mega at M15.
 * Complete: Champion at M3, Ultimate at M6, Mega at M9.
 * Manual: GM-defined fixed value.
 */
export function getDefaultRangeForMilestones(
  milestones = 0,
  {
    template = "limited",
    manualValue = 2
  } = {}
) {
  const count = integer(milestones, 0);
  const mode = normalizeDefaultRangeTemplate(template);

  if (mode === DDA_DEFAULT_RANGE_TEMPLATES.MANUAL) {
    return normalizeDefaultRangeValue(manualValue);
  }

  const interval = mode === DDA_DEFAULT_RANGE_TEMPLATES.COMPLETE ? 3 : 5;
  return clamp(2 + Math.floor(count / interval), 2, 5);
}

export function isStageWithinDefaultRange(stageKey = "", defaultRange = 2) {
  const stageValue = getDefaultRangeStageValue(stageKey);
  if (stageValue === null) return false;
  return stageValue <= normalizeDefaultRangeValue(defaultRange);
}

/**
 * Official normal Evolution Point cost for a target Stage (8.05a).
 * Default Range does not alter this table; callers waive the cost entirely
 * when the target Stage is within the Tamer's Default Range.
 */
export function getOfficialEvolutionPointCostForStage(stageKey = "") {
  const key = String(stageKey ?? "").trim();

  if (["adult"].includes(key)) return 1;
  if (["perfect"].includes(key)) return 3;
  if (["ultimate", "ultimatePlus"].includes(key)) return 5;
  return 0;
}

export function getDefaultStageKeyForRange(defaultRange = 2) {
  const range = normalizeDefaultRangeValue(defaultRange);
  return ({
    2: "child",
    3: "adult",
    4: "perfect",
    5: "ultimate"
  })[range] ?? "child";
}
