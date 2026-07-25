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
