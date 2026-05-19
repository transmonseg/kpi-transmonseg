import jaroWinkler from 'talisman/metrics/jaro-winkler'

export function normalizeForScore(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')       // strip all Unicode combining marks (accents)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
  return dp[m][n]
}

function levNorm(a: string, b: string): number {
  if (!a || !b) return 0
  const maxLen = Math.max(a.length, b.length)
  return maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen
}

/**
 * Hybrid score: 60% Jaro-Winkler (prefix-sensitive) + 40% normalized Levenshtein.
 * Both inputs must already be normalized via normalizeForScore().
 */
export function hybridScore(a: string, b: string): number {
  if (!a || !b) return 0
  return 0.6 * (jaroWinkler(a, b) as number) + 0.4 * levNorm(a, b)
}

/** Returns true if hybrid score of normalized inputs >= 0.8 */
export function isSameStore(a: string, b: string): boolean {
  return hybridScore(normalizeForScore(a), normalizeForScore(b)) >= 0.8
}
