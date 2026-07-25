import { normalizeText } from './normalize'

export interface ScriptWord {
  /** Stable index in the script word list. */
  index: number
  /** Original surface form for display. */
  raw: string
  /** Normalized form used for matching. */
  normalized: string
  /** Character offset of this word in the original script. */
  start: number
  /** Character offset after this word in the original script. */
  end: number
}

const WORD_RE = /[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)?|\d+(?:st|nd|rd|th)?/g

/** Tokenize script text into stable-indexed words, preserving display offsets. */
export function tokenizeScript(script: string): ScriptWord[] {
  const words: ScriptWord[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(WORD_RE.source, 'g')

  while ((match = re.exec(script)) !== null) {
    const raw = match[0]
    const normalized = normalizeText(raw)
    if (!normalized) continue
    words.push({
      index: words.length,
      raw,
      normalized,
      start: match.index,
      end: match.index + raw.length,
    })
  }

  return words
}

/** Tokenize arbitrary transcript text into normalized words. */
export function tokenizeTranscript(text: string): string[] {
  const normalized = normalizeText(text)
  if (!normalized) return []
  return normalized.split(' ').filter(Boolean)
}
