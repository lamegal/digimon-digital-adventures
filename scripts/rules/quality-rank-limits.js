import { DDA_DIGIMON_QUALITIES } from "../data/digimon-qualities.js";

function identity(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Read current rank rules without changing purchased ranks or player choices.
 * Unknown explicit source IDs belong to custom qualities and are left alone.
 * Name matching is only a fallback for old Items without a source ID.
 */
export function getCanonicalQualityRankData(quality = {}) {
  const system = quality?.system ?? quality;
  if (!system) return null;
  const sourceId = identity(system.sourceId || system.id);
  const identities = sourceId ? [sourceId] : [
    system.originalName, quality.originalName, quality.name, system.name
  ].map(identity).filter(Boolean);
  if (!identities.length) return null;

  const definition = DDA_DIGIMON_QUALITIES.find(entry =>
    [entry.id, entry.originalName, entry.name].some(value => identities.includes(identity(value)))
  );
  if (!definition) return null;

  const clone = value => foundry.utils.deepClone(value);
  const rank = {
    ...(system.rank ?? {}),
    ...clone(definition.rank ?? {}),
    value: system.rank?.value ?? definition.rank?.value ?? 1
  };
  // Prepared limits belong to the current Actor/build, never to a snapshot.
  delete rank.effectiveMax;
  delete rank.exceeded;
  return { rank, rankLimit: definition.rankLimit ? clone(definition.rankLimit) : null };
}
