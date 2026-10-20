import { tokenizeTranscript } from '../utils/tokenize'

/** Voice-follow scrolling, or one-bullet-at-a-time trigger advance. */
export type PromptMode = 'follow' | 'bullets'

export const DEFAULT_BULLET_TRIGGER = 'next slide'
export const DEFAULT_BULLET_BACK_TRIGGER = 'backwards slide'
export const BULLET_TRIGGER_MAX_LENGTH = 80

const AMBIGUOUS_TRIGGERS = new Set([
  'a',
  'an',
  'and',
  'continue',
  'done',
  'forward',
  'go',
  'next',
  'now',
  'ok',
  'okay',
  'on',
  'or',
  'right',
  'so',
  'the',
  'then',
  'yeah',
  'yes',
])

export function parsePromptMode(value: unknown): PromptMode {
  return value === 'bullets' ? 'bullets' : 'follow'
}

/** A trigger must contain at least one spoken word after normalization. */
export function isTriggerPhraseValid(value: string): boolean {
  const collapsed = value.trim().replace(/\s+/g, ' ')
  if (!collapsed || collapsed.length > BULLET_TRIGGER_MAX_LENGTH) return false
  return tokenizeTranscript(collapsed).length > 0
}

/** Persist only a usable phrase. Invalid stored values fall back to the default. */
export function parseBulletTrigger(
  value: unknown,
  fallback: string = DEFAULT_BULLET_TRIGGER,
): string {
  if (typeof value !== 'string') return fallback
  const collapsed = value.trim().replace(/\s+/g, ' ')
  if (!isTriggerPhraseValid(collapsed)) return fallback
  return collapsed.slice(0, BULLET_TRIGGER_MAX_LENGTH)
}

export function parseBulletBackTrigger(value: unknown): string {
  return parseBulletTrigger(value, DEFAULT_BULLET_BACK_TRIGGER)
}

/** True when two phrases are the same spoken words. */
export function phrasesMatch(left: string, right: string): boolean {
  const a = tokenizeTranscript(left)
  const b = tokenizeTranscript(right)
  if (a.length === 0 || a.length !== b.length) return false
  return a.every((word, index) => word === b[index])
}

/**
 * Common one-word triggers also appear in ordinary sentences, so the slide
 * will advance whenever that word is spoken. Multi-word phrases are specific
 * enough that this warning stays quiet.
 */
export function triggerCaution(trigger: string): string | null {
  const tokens = tokenizeTranscript(trigger)
  if (tokens.length !== 1) return null
  const word = tokens[0]
  if (!word || !AMBIGUOUS_TRIGGERS.has(word)) return null
  const shown = trigger.trim().replace(/\s+/g, ' ')
  return `“${shown}” is a common word. The slide advances whenever it is spoken, including in the middle of a sentence.`
}
