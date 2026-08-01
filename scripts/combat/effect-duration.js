/**
 * Calculate Effect Duration under DDA 2E 9.02b.
 *
 * Negative/non-willing applications begin at 1 Round and gain another Round
 * for each two Accuracy Successes after the first spare Success which ensured
 * the hit. Positive/willing applications begin at 1 Round automatically and
 * gain another Round for each complete multiple of 3 in the combined pools.
 */
export function calculateEffectDurationRounds({
  targetIsWilling = false,
  leftoverAccuracySuccesses = 0,
  accuracySuccesses = 0,
  targetHealthSuccesses = 0,
  maximumDuration = 3
} = {}) {
  const maximum = Math.max(1, Math.floor(Number(maximumDuration) || 3));
  const leftover = Math.max(0, Math.floor(Number(leftoverAccuracySuccesses) || 0));
  const combined = Math.max(0, Math.floor(Number(accuracySuccesses) || 0)) +
    Math.max(0, Math.floor(Number(targetHealthSuccesses) || 0));
  const duration = targetIsWilling
    ? 1 + Math.floor(combined / 3)
    : 1 + Math.floor(Math.max(0, leftover - 1) / 2);
  return Math.min(maximum, Math.max(1, duration));
}
