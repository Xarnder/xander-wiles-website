import type { ScriptWord } from './tokenize'
import type { SentenceBreakMode } from '../hooks/useTeleprompter'
import { DASH_SENTENCE_REGEX } from './sentences'

export type BreakKind = 'none' | 'space' | 'tab' | 'line' | 'paragraph'
export type SentenceColor = 'white' | 'blue' | 'yellow'
export const SENTENCE_COLORS: readonly SentenceColor[] = ['white', 'blue', 'yellow']

export interface FormattedWordToken {
  word: ScriptWord
  leading: string
  trailing: string
  br: BreakKind
  separator: string | null
  hasFullStop: boolean
  hasDash?: boolean
  sentenceIndex: number
  sentenceColor: SentenceColor
}

export interface FormattedScript {
  prefix: string
  tokens: FormattedWordToken[]
  suffix: string
}

/**
 * Format script words into tokens with attached punctuation, preserving full stops
 * and ensuring that zero punctuation from the original script is removed.
 */
export function formatScriptTokens(
  script: string,
  words: readonly ScriptWord[],
  preserveBreaks: boolean,
  sentenceBreak: SentenceBreakMode,
  dashAsFullStop: boolean = true,
): FormattedScript {
  if (words.length === 0) {
    return { prefix: script, tokens: [], suffix: '' }
  }

  // Prefix before the first word
  const rawPrefix = script.slice(0, words[0].start)
  const firstLeadingMatch = rawPrefix.match(/([^\s\w]+)$/)
  const firstLeading = firstLeadingMatch ? firstLeadingMatch[1] : ''
  const prefix = firstLeadingMatch ? rawPrefix.slice(0, -firstLeading.length) : rawPrefix

  let currentSentenceIndex = 0

  const tokens: FormattedWordToken[] = words.map((word, i) => {
    const next = words[i + 1]
    const gap = next ? script.slice(word.end, next.start) : script.slice(word.end)

    // 1. Trailing punctuation attached directly to this word
    const trailingMatch = gap.match(/^([^\s\w]+)/)
    const trailing = trailingMatch ? trailingMatch[1] : ''
    const afterTrailing = gap.slice(trailing.length)

    // 2. Leading punctuation attached directly to next word (if any)
    let leadingNext = ''
    let mid = afterTrailing
    if (next) {
      const leadingMatch = afterTrailing.match(/([^\s\w]+)$/)
      if (leadingMatch) {
        leadingNext = leadingMatch[1]
        mid = afterTrailing.slice(0, -leadingNext.length)
      }
    }

    const hasPunctFullStop = /\./.test(trailing) || (trailing === '' && /^\./.test(gap))
    const hasDash =
      dashAsFullStop &&
      (DASH_SENTENCE_REGEX.test(trailing) || DASH_SENTENCE_REGEX.test(gap))
    const hasFullStop = hasPunctFullStop || hasDash

    // 3. Determine break kind
    let br: BreakKind = 'space'
    if (!next) {
      br = 'none'
    } else {
      if (preserveBreaks) {
        if (/\n\s*\n/.test(mid)) br = 'paragraph'
        else if (/\n/.test(mid)) br = 'line'
      }

      if (sentenceBreak !== 'off' && hasFullStop && br === 'space') {
        br = sentenceBreak === 'tab' ? 'tab' : 'line'
      }
    }

    // 4. Determine mid / separator text to ensure no symbols/punctuation are lost
    const midNonWhitespace = mid.match(/[^\s]/)
    let separator: string | null = ' '
    if (!next) {
      separator = null
    } else if (br === 'paragraph' || br === 'line' || br === 'tab') {
      separator = midNonWhitespace ? mid.trim() + ' ' : null
    } else {
      if (mid === '') {
        separator = null
      } else if (midNonWhitespace) {
        separator = mid
      } else {
        separator = ' '
      }
    }

    const sentenceIndex = currentSentenceIndex
    const sentenceColor: SentenceColor = SENTENCE_COLORS[sentenceIndex % 3]

    // Sentence ends on standard sentence marks (.!?…), dash (if enabled), or paragraph break
    const isPunctEnd =
      /[.!?…]/.test(trailing) ||
      (trailing === '' && /^[.!?…]/.test(gap)) ||
      hasDash
    const isParagraphEnd = preserveBreaks ? br === 'paragraph' : /\n\s*\n/.test(gap)
    if (next && (isPunctEnd || isParagraphEnd)) {
      currentSentenceIndex++
    }

    return {
      word,
      leading: '',
      trailing,
      br,
      separator,
      hasFullStop,
      hasDash,
      sentenceIndex,
      sentenceColor,
      leadingNext,
    } as FormattedWordToken & { leadingNext: string }
  })

  // Assign leading to each word
  if (tokens.length > 0) {
    tokens[0].leading = firstLeading
  }
  for (let i = 1; i < tokens.length; i++) {
    tokens[i].leading = (tokens[i - 1] as unknown as { leadingNext: string }).leadingNext
  }

  // Suffix after the last word
  const lastGap = script.slice(words[words.length - 1].end)
  const lastTrailing = tokens[tokens.length - 1].trailing
  const suffix = lastGap.slice(lastTrailing.length)

  return { prefix, tokens, suffix }
}
