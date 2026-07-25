import type { ScriptWord } from './tokenize'

/** True when the script has a sentence-ending mark after this word. */
export function isSentenceEnd(
  script: string,
  words: readonly ScriptWord[],
  wordIndex: number,
): boolean {
  const word = words[wordIndex]
  if (!word) return false
  const next = words[wordIndex + 1]
  if (!next) return true
  const between = script.slice(word.end, next.start)
  return /[.!?…]/.test(between)
}

/** Index of the first word in the sentence that contains `wordIndex`. */
export function findSentenceStartIndex(
  script: string,
  words: readonly ScriptWord[],
  wordIndex: number,
): number {
  if (words.length === 0) return 0
  const clamped = Math.max(0, Math.min(wordIndex, words.length - 1))
  for (let i = clamped; i > 0; i--) {
    if (isSentenceEnd(script, words, i - 1)) return i
  }
  return 0
}

/** Index of the last word in the sentence that contains `wordIndex`. */
export function findSentenceEndIndex(
  script: string,
  words: readonly ScriptWord[],
  wordIndex: number,
): number {
  if (words.length === 0) return 0
  const clamped = Math.max(0, Math.min(wordIndex, words.length - 1))
  for (let i = clamped; i < words.length; i++) {
    if (isSentenceEnd(script, words, i)) return i
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
): number {
  if (words.length === 0) return 0
  const last = words.length - 1
  const at = Math.max(0, Math.min(cursor, last))
  const start = findSentenceStartIndex(script, words, at)
  const end = findSentenceEndIndex(script, words, at)

  if (direction === 'down') {
    if (at < end) return end
    if (end >= last) return last
    return end + 1
  }

  if (at > start) return start
  if (start <= 0) return 0
  return start - 1
}
