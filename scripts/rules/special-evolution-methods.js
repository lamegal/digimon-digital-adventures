/**
 * Shared method classification for Special Evolution workflows.
 *
 * Current DDA rules provide a dedicated mechanical workflow for Jogress and
 * explicitly allow DNA Digivolution, DigiXros, Joint Progress and App Gattai
 * to use that same ruleset. The current rules text does not define a separate
 * mechanical procedure for Hybrid / Bio-Merge / Mind Link, so those labels
 * remain evolution metadata and are handled as normal evolution paths.
 */

const normalizeMethod = (value = "") => String(value ?? "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[\s_\-:()\/]+/g, "")
  .trim();

const JOGRESS_RULESET_METHODS = new Set([
  "jogress",
  "jogressevolution",
  "evolucaojogress",
  "jointprogress",
  "jointprogressevolution",
  "dnadigivolution",
  "dnadigivolve",
  "dna",
  "digixros",
  "digixrosevolution",
  "xros",
  "appgattai",
  "appgattaievolution"
]);

const LEGACY_HYBRID_SPECIAL_METHODS = new Set([
  "hybrid",
  "hybridevolution",
  "spirit",
  "spiritevolution",
  "biomerge",
  "biomergeevolution",
  "matrixevolution",
  "mindlink",
  "mindlinkevolution"
]);

/**
 * The current rules text supplied for the system does not define a dedicated
 * Hybrid/Bio-Merge/Mind Link mechanical workflow. Keep legacy state readable,
 * but do not expose or start that speculative workflow.
 */
export const DDA_HYBRID_SPECIAL_WORKFLOW_SUPPORTED = false;

export function isJogressRulesMethod(method = "") {
  return JOGRESS_RULESET_METHODS.has(normalizeMethod(method));
}

export function isLegacyHybridSpecialMethod(method = "") {
  return LEGACY_HYBRID_SPECIAL_METHODS.has(normalizeMethod(method));
}

export function normalizeSpecialEvolutionMethod(method = "") {
  return normalizeMethod(method);
}
