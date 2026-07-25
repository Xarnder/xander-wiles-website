/** Levenshtein distance between two strings. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const prev = new Array<number>(b.length + 1)
  const curr = new Array<number>(b.length + 1)

  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      )
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j] ?? 0
  }

  return prev[b.length] ?? b.length
}

/**
 * Similarity in [0, 1] between two normalized words.
 * Exact match = 1; short words are stricter about edits.
 */
export function wordSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1

  // Prefix tolerance for partial ASR last-word (e.g. "teleprom" vs "teleprompter")
  if (a.length >= 3 && b.startsWith(a)) return 0.85
  if (b.length >= 3 && a.startsWith(b)) return 0.85

  const dist = levenshtein(a, b)
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  const sim = 1 - dist / maxLen
  // Soft threshold: very dissimilar short words score near 0
  return sim < 0.5 ? 0 : sim
}

/**
 * Score how well `spoken` aligns to `scriptWords` starting at `offset`.
 * Returns average word similarity in [0, 1].
 */
export function scoreAlignment(
  scriptWords: readonly string[],
  offset: number,
  spoken: readonly string[],
): number {
  if (spoken.length === 0) return 0
  if (offset < 0 || offset >= scriptWords.length) return 0

  let total = 0
  let counted = 0

  for (let i = 0; i < spoken.length; i++) {
    const scriptWord = scriptWords[offset + i]
    if (scriptWord === undefined) break
    total += wordSimilarity(spoken[i]!, scriptWord)
    counted += 1
  }

  if (counted === 0) return 0

  // Penalize if we couldn't compare the full spoken span
  const coverage = counted / spoken.length
  return (total / counted) * coverage
}
