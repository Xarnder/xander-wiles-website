import type { ScriptWord } from './tokenize'

/**
 * Matches dashes acting as full stops:
 * - Unicode em/en dashes: —, –, ―, ‒, ⸺, ⸻
 * - Multi-hyphens: --, ---, etc.
 * - Hyphen with whitespace: " - " or "- "
 * Note: single hyphens inside compound words like "on-device" or "words-per-minute"
 * do NOT match because there is no surrounding whitespace.
 */
export const DASH_SENTENCE_REGEX = /[—–―‒⸺⸻]|--+|\s+-\s+|-\s+/

/** True when the script has a sentence-ending mark after this word. */
export function isSentenceEnd(
  script: string,
  words: readonly ScriptWord[],
  wordIndex: number,
  dashAsFullStop = true,
): boolean {
  const word = words[wordIndex]
  if (!word) return false
  const next = words[wordIndex + 1]
  if (!next) return true
  const between = script.slice(word.end, next.start)
  if (/[.!?…]/.test(between)) return true
  if (dashAsFullStop && DASH_SENTENCE_REGEX.test(between)) return true
  return false
}

/** Index of the first word in the sentence that contains `wordIndex`. */
export function findSentenceStartIndex(
  script: string,
  words: readonly ScriptWord[],
  wordIndex: number,
  dashAsFullStop = true,
): number {
  if (words.length === 0) return 0
  const clamped = Math.max(0, Math.min(wordIndex, words.length - 1))
  for (let i = clamped; i > 0; i--) {
    if (isSentenceEnd(script, words, i - 1, dashAsFullStop)) return i
  }
  return 0
}

/** Index of the last word in the sentence that contains `wordIndex`. */
export function findSentenceEndIndex(
  script: string,
  words: readonly ScriptWord[],
  wordIndex: number,
  dashAsFullStop = true,
): number {
  if (words.length === 0) return 0
  const clamped = Math.max(0, Math.min(wordIndex, words.length - 1))
  for (let i = clamped; i < words.length; i++) {
    if (isSentenceEnd(script, words, i, dashAsFullStop)) return i
  }
  return words.length - 1
}

/**
 * Jump between sentence starts and ends.
 * Down: mid → end → next start → next end …
 * Up: mid → start → previous end → previous start …
 */
export function nextSentenceBoundary(
  script: string,
  words: readonly ScriptWord[],
  cursor: number,
  direction: 'up' | 'down',
  dashAsFullStop = true,
): number {
  if (words.length === 0) return 0
  const last = words.length - 1
  const at = Math.max(0, Math.min(cursor, last))
  const start = findSentenceStartIndex(script, words, at, dashAsFullStop)
  const end = findSentenceEndIndex(script, words, at, dashAsFullStop)

  if (direction === 'down') {
    if (at < end) return end
    if (end >= last) return last
    return end + 1
  }

  if (at > start) return start
  if (start <= 0) return 0
  return start - 1
}
