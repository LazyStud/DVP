/* Small statistics helpers — Wilson confidence interval for proportions.
 * Used by venue toss-bias queries (T-3.3).
 */

/**
 * Wilson score interval for a binomial proportion.
 * @param {number} successes - number of successes
 * @param {number} total - number of trials
 * @param {number} [z=1.96] - z-score (1.96 ≈ 95% CI)
 * @returns {{ p: number|null, lo: number|null, hi: number|null, n: number }}
 */
export function wilsonInterval(successes, total, z = 1.96) {
  if (total <= 0) {
    return { p: null, lo: null, hi: null, n: 0 };
  }
  const p = successes / total;
  const denom = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denom;
  return {
    p,
    lo: Math.max(0, centre - half),
    hi: Math.min(1, centre + half),
    n: total,
  };
}