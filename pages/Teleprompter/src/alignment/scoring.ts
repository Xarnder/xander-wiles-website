/** High-frequency words that match too easily across a script. */
export const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'had',
  'has',
  'have',
  'he',
  'her',
  'him',
  'his',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'my',
  'no',
  'not',
  'of',
  'on',
  'or',
  'our',
  'she',
  'so',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'to',
  'up',
  'us',
  'was',
  'we',
  'were',
  'what',
  'when',
  'which',
  'who',
  'will',
  'with',
  'you',
  'your',
])

export function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word)
}

/** Alignment weight: stop / tiny words count less than distinctive content. */
export function wordWeight(word: string): number {
  if (!word) return 0
  if (isStopWord(word)) return 0.22
  if (word.length <= 2) return 0.35
  if (word.length <= 3) return 0.55
  return 1
}

/** Fraction of spoken words that are distinctive (not stop words). */
export function contentFraction(words: readonly string[]): number {
  if (words.length === 0) return 0
  let content = 0
  for (const w of words) {
    if (!isStopWord(w)) content += 1
  }
  return content / words.length
}

export function contentWordCount(words: readonly string[]): number {
  let n = 0
  for (const w of words) {
    if (!isStopWord(w)) n += 1
  }
  return n
}

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
  // Don't apply to very short / stop-like stems — too ambiguous.
  if (a.length >= 4 && b.startsWith(a)) return 0.85
  if (b.length >= 4 && a.startsWith(b)) return 0.85

  const dist = levenshtein(a, b)
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  const sim = 1 - dist / maxLen
  // Soft threshold: very dissimilar short words score near 0
  return sim < 0.5 ? 0 : sim
}

/**
 * Score how well `spoken` aligns to `scriptWords` starting at `offset`.
 * Returns a weighted average similarity in [0, 1] (stop words contribute less).
 */
export function scoreAlignment(
  scriptWords: readonly string[],
  offset: number,
  spoken: readonly string[],
): number {
  if (spoken.length === 0) return 0
  if (offset < 0 || offset >= scriptWords.length) return 0

  let total = 0
  let weightSum = 0
  let counted = 0

  for (let i = 0; i < spoken.length; i++) {
    const scriptWord = scriptWords[offset + i]
    const spokenWord = spoken[i]!
    if (scriptWord === undefined) break
    const w = Math.max(wordWeight(spokenWord), wordWeight(scriptWord))
    total += wordSimilarity(spokenWord, scriptWord) * w
    weightSum += w
    counted += 1
  }

  if (counted === 0 || weightSum === 0) return 0

  // Penalize if we couldn't compare the full spoken span
  const coverage = counted / spoken.length
  return (total / weightSum) * coverage
}

/**
 * Rank a candidate match for the live cursor.
 * Local matches (start near cursor) keep full score so normal reading advances.
 * Distant matches need distinctive content words — stop words alone can't yank the cursor.
 */
export function rankCandidate(
  scriptWords: readonly string[],
  start: number,
  spoken: readonly string[],
  cursor: number,
): { score: number; end: number } {
  const base = scoreAlignment(scriptWords, start, spoken)
  const end = Math.min(scriptWords.length - 1, start + spoken.length - 1)
  if (base <= 0) return { score: 0, end }

  const startDelta = start - cursor
  const endDelta = end - cursor
  const cf = contentFraction(spoken)
  const contentN = contentWordCount(spoken)

  // Match begins near the reading head → treat as continuous tracking
  const isLocal = startDelta >= -5 && startDelta <= 8

  if (isLocal) {
    const localBoost = endDelta >= 0 && endDelta <= spoken.length + 2 ? 1.05 : 1
    return { score: base * localBoost, end }
  }

  // Strong unique phrase elsewhere in the script (skip ahead / rewind)
  const strongResync =
    base >= 0.88 &&
    contentN >= 2 &&
    spoken.length >= 3

  if (strongResync) {
    // Keep score above the usual confidence threshold
    return { score: base * 0.95, end }
  }

  // Weaker distant candidates: soften but still require content
  if (contentN === 0) {
    return { score: base * 0.15, end }
  }

  let proximity = 1
  if (Math.abs(startDelta) > 30) proximity = 0.7
  else if (Math.abs(startDelta) > 15) proximity = 0.82
  else proximity = 0.9

  const contentFactor = 0.55 + 0.45 * cf
  return { score: base * proximity * contentFactor, end }
}
