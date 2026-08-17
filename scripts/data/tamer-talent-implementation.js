/**
 * Canonical implementation metadata for the 65 official Tamer Talents.
 *
 * This registry does not control unlocks or rules resolution. It exists so the
 * sheet, action console and developer audit all describe the same runtime
 * coverage instead of inferring it from the presence of a legacy `automation`
 * object.
 */

const IMPLEMENTATIONS = {
  quickStep: automated("tamer-actions", "reposition-result"),
  strikeFast: automated("tamer-talent-runtime", "special-order"),
  bulkUp: automated("tamer-actions", "reinforce-result"),
  energyBurst: automated("tamer-talent-automation", "special-order"),
  directTeam: automated("tamer-actions", "direct-modifier"),
  swagger: automated("tamer-talent-special-orders", "special-order"),
  experienced: automated("character-progression", "derived-progression"),
  calculated: automated("tamer-talent-runtime", "bolster-conversion"),
  potential: automated("tamer-resources", "session-resource"),
  purifyPartner: automated("tamer-talent-special-orders", "special-order"),

  avoidingConsequences: automated("check-and-torment-rolls", "critical-failure-interceptor"),
  tuckAndRoll: automated("attack-roll", "failed-dodge-interceptor"),
  busyHands: assisted("tamer-talent-runtime", "craft-and-narrative-placement"),
  aimAssist: automated("tamer-actions", "direct-modifier"),
  overlooked: assisted("tamer-talent-combat-survival", "relative-perception"),
  silentMovement: narrative("tamer-talent-narrative", "rules-reminder"),
  naturalExplorer: assisted("tamer-talent-runtime", "movement-and-followers"),
  experiencedStep: automated("tamer-actions", "reposition-result"),
  noPainNoGain: automated("check-roll", "failed-check-reroll"),
  grit: automated("attack-and-damage", "defense-and-survival-interceptor"),
  heavyForce: automated("check-and-tamer-attack", "check-substitution-and-rest-bonus"),
  jointEffort: automated("tamer-actions", "teamwork-modifier"),
  plantedIdea: assisted("tamer-talent-narrative", "roleplay-effect-record"),
  fakeout: automated("tamer-talent-attack-direct", "miss-dodge-penalty"),
  endlessDream: automated("tamer-talent-socket", "temporary-ip-distribution"),
  personalCheerleader: automated("tamer-talent-attack-direct", "direct-reroll"),
  charmingInfluence: assisted("tamer-talent-narrative", "roleplay-effect-record"),
  beTheWinners: automated("tamer-talent-attack-direct", "split-direct"),
  cyberSleuth: assisted("tamer-talent-narrative", "gm-question-response"),
  bestLaidPlans: assisted("tamer-talent-runtime", "hold-bonus-and-surprise-confirmation"),
  gloriousWorld: automated("tamer-talent-transversal", "rest-meal-temp-wounds"),
  trailblazer: narrative("tamer-talent-narrative", "route-record-and-reminder"),
  academicAdvice: automated("tamer-actions", "teamwork-check-substitution"),
  livingEncyclopedia: automated("check-roll", "knowledge-critical-success"),
  hyperAlert: automated("initiative", "initiative-modifier"),
  dangerSense: automated("tamer-actions", "interrupt-action-payment"),
  calmingInfluence: automated("torment-roll", "torment-reroll"),
  teamPlayer: automated("teamwork", "teamwork-result-modifier"),
  breakTheChain: automated("torment-roll", "torment-modifier"),
  withTheWill: automated("torment-roll", "digimon-teamwork-interrupt"),

  evasiveManeuvers: automated("initiative-and-pool-roll", "combat-dodge-reserve"),
  speedSurge: automated("tamer-talent-runtime", "virtual-round"),
  undefeatedEndurance: automated("damage-application", "defeat-interceptor"),
  overpower: automated("attack-roll", "post-accuracy-interceptor"),
  peakPerformance: automated("tamer-talent-special-orders", "special-order"),
  revitalize: automated("tamer-talent-combat-survival", "defeat-form-restoration"),
  signatureVersatility: automated("tamer-talent-attack-direct", "temporary-signature"),
  enemyScan: automated("tamer-talent-special-orders", "special-order"),
  challenger: automated("tamer-talent-combat-survival", "initiative-temp-wounds"),
  miracle: automated("tamer-talent-transversal", "shared-ip-roll-control"),
  quickening: automated("attack-roll", "automatic-dodge"),
  autoHit: automated("tamer-talent-attack-direct", "automatic-hit"),
  vanish: automated("tamer-talent-special-orders", "relative-visibility"),
  bullrush: automated("tamer-talent-combat-survival", "difficult-move-reserve"),
  thickSkin: automated("tamer-talent-combat-survival", "forced-movement-interceptor"),
  adrenalineHit: assisted("tamer-talent-special-orders", "gm-approved-object-attack"),
  hackingPride: automated("tamer-talent-attack-direct", "negative-direct"),
  distractingGesture: automated("tamer-talent-attack-direct", "accuracy-interrupt"),
  nextOrder: automated("tamer-talent-attack-direct", "multi-target-direct"),
  predictable: automated("tamer-talent-transversal", "enemy-action-hold-trigger"),
  survivalInstinct: automated("tamer-talent-combat-survival", "damage-interceptor"),
  hackersMemory: assisted("tamer-talent-transversal", "prior-enemy-derived-stat-modifier"),
  realization: automated("tamer-talent-special-orders", "persistent-exploit"),
  takeTheLead: automated("tamer-talent-attack-direct", "post-check-interceptor"),
  heroicExemplar: automated("tamer-talent-special-orders", "post-hit-area-bastion")
};

function automated(module, trigger) {
  return Object.freeze({ mode: "automated", module, trigger });
}

function assisted(module, trigger) {
  return Object.freeze({ mode: "assisted", module, trigger });
}

function narrative(module, trigger) {
  return Object.freeze({ mode: "narrative", module, trigger });
}

export const DDA_TAMER_TALENT_IMPLEMENTATIONS = Object.freeze(IMPLEMENTATIONS);

export function getTamerTalentImplementation(talentOrId) {
  const id = String(
    typeof talentOrId === "string"
      ? talentOrId
      : talentOrId?.id ?? talentOrId?.system?.officialId ?? ""
  ).trim();

  return DDA_TAMER_TALENT_IMPLEMENTATIONS[id] ?? Object.freeze({
    mode: "unknown",
    module: "",
    trigger: ""
  });
}

export function getTamerTalentImplementationLabelKey(mode) {
  switch (String(mode ?? "")) {
    case "automated":
      return "DDA.Automation.Status.Automated";
    case "assisted":
      return "DDA.Automation.Status.Assisted";
    case "narrative":
      return "DDA.Automation.Status.Narrative";
    default:
      return "DDA.Automation.Status.Unknown";
  }
}

export function auditTamerTalentImplementations(talents = []) {
  const ids = talents
    .map((talent) => String(talent?.id ?? "").trim())
    .filter(Boolean);

  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);

  const duplicateTalentIds = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort();

  const implementationIds = Object.keys(DDA_TAMER_TALENT_IMPLEMENTATIONS);
  const talentIdSet = new Set(ids);
  const implementationIdSet = new Set(implementationIds);

  const missingImplementations = ids
    .filter((id) => !implementationIdSet.has(id))
    .filter((id, index, array) => array.indexOf(id) === index)
    .sort();

  const orphanImplementations = implementationIds
    .filter((id) => !talentIdSet.has(id))
    .sort();

  const modeCounts = implementationIds.reduce((result, id) => {
    const mode = DDA_TAMER_TALENT_IMPLEMENTATIONS[id]?.mode ?? "unknown";
    result[mode] = (result[mode] ?? 0) + 1;
    return result;
  }, {});

  return Object.freeze({
    ok: !duplicateTalentIds.length && !missingImplementations.length && !orphanImplementations.length,
    talentCount: ids.length,
    uniqueTalentCount: talentIdSet.size,
    implementationCount: implementationIds.length,
    triggeredOnlyCount: ids.filter((id) => TRIGGERED_ONLY_TALENTS.has(id)).length,
    duplicateTalentIds,
    missingImplementations,
    orphanImplementations,
    modeCounts
  });
}

const TRIGGERED_ONLY_TALENTS = new Set([
  "avoidingConsequences",
  "tuckAndRoll",
  "noPainNoGain",
  "grit",
  "heavyForce",
  "dangerSense",
  "calmingInfluence",
  "withTheWill",
  "overpower",
  "quickening",
  "thickSkin",
  "distractingGesture",
  "survivalInstinct",
  "takeTheLead",
  "heroicExemplar",
  "livingEncyclopedia"
]);

export function isTamerTalentTriggeredOnly(talentOrId) {
  const id = String(
    typeof talentOrId === "string"
      ? talentOrId
      : talentOrId?.id ?? talentOrId?.system?.officialId ?? ""
  ).trim();

  return TRIGGERED_ONLY_TALENTS.has(id);
}
