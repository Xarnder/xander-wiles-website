import { scoreAlignment } from './scoring'
import { tokenizeScript, tokenizeTranscript, type ScriptWord } from '../utils/tokenize'

export type AlignmentState = 'tracking' | 'off_script'

export interface AlignmentConfig {
  /** Words searched behind the cursor. */
  lookbehind: number
  /** Words searched ahead of the cursor. */
  lookahead: number
  /** Min average similarity to stay/enter tracking. */
  confidenceThreshold: number
  /** How many recent spoken words to use as the match fingerprint. */
  spokenWindow: number
  /** Min spoken words before attempting a match (avoid noise). */
  minSpokenWords: number
  /**
   * If speech matches this many words (or more) behind the cursor,
   * rewind to that earlier sentence.
   */
  backtrackWordCount: number
}

export interface AlignmentResult {
  cursor: number
  state: AlignmentState
  confidence: number
  /** Index where the best spoken span begins in the script, or -1. */
  matchStart: number
}

export interface AlignmentSnapshot {
  cursor: number
  state: AlignmentState
  confidence: number
}

const DEFAULT_CONFIG: AlignmentConfig = {
  lookbehind: 80,
  lookahead: 100,
  confidenceThreshold: 0.62,
  spokenWindow: 10,
  minSpokenWords: 2,
  backtrackWordCount: 5,
}

/**
 * Pure alignment engine: script words + spoken transcript chunks → cursor + state.
 * No DOM / React / ASR dependencies — unit-testable with synthetic transcripts.
 */
export class AlignmentEngine {
  private readonly script: string
  private readonly scriptWords: ScriptWord[]
  private readonly normalized: string[]
  private readonly config: AlignmentConfig
  private cursor = 0
  private state: AlignmentState = 'tracking'
  private confidence = 0

  constructor(script: string, config: Partial<AlignmentConfig> = {}) {
    this.script = script
    this.scriptWords = tokenizeScript(script)
    this.normalized = this.scriptWords.map((w) => w.normalized)
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  getScriptWords(): readonly ScriptWord[] {
    return this.scriptWords
  }

  getSnapshot(): AlignmentSnapshot {
    return {
      cursor: this.cursor,
      state: this.state,
      confidence: this.confidence,
    }
  }

  reset(cursor = 0): AlignmentSnapshot {
    this.cursor = Math.max(0, Math.min(cursor, Math.max(0, this.normalized.length - 1)))
    this.state = 'tracking'
    this.confidence = 0
    return this.getSnapshot()
  }

  setConfidenceThreshold(threshold: number): void {
    this.config.confidenceThreshold = Math.max(0.3, Math.min(0.95, threshold))
  }

  /**
   * Feed a spoken transcript chunk (partial or committed). Uses only a recent
   * window of spoken words and searches a bounded window around the cursor.
   */
  processTranscript(transcript: string): AlignmentResult {
    const spoken = tokenizeTranscript(transcript)
    return this.processSpokenWords(spoken)
  }

  processSpokenWords(spokenAll: readonly string[]): AlignmentResult {
    if (this.normalized.length === 0) {
      return {
        cursor: 0,
        state: 'off_script',
        confidence: 0,
        matchStart: -1,
      }
    }

    const spoken = spokenAll.slice(-this.config.spokenWindow)
    if (spoken.length < this.config.minSpokenWords) {
      return {
        cursor: this.cursor,
        state: this.state,
        confidence: this.confidence,
        matchStart: -1,
      }
    }

    const windowStart = Math.max(0, this.cursor - this.config.lookbehind)
    const windowEnd = Math.min(
      this.normalized.length,
      this.cursor + this.config.lookahead,
    )

    let bestScore = 0
    let bestStart = -1
    let bestEnd = this.cursor
    let bestSpokenLen = spoken.length

    // Prefer matching the spoken span ending near/after the current cursor.
    // Try every start offset in the window; cursor advances to end of match.
    for (let start = windowStart; start < windowEnd; start++) {
      const score = scoreAlignment(this.normalized, start, spoken)
      if (score > bestScore) {
        bestScore = score
        bestStart = start
        bestSpokenLen = spoken.length
        bestEnd = Math.min(this.normalized.length - 1, start + spoken.length - 1)
      }
    }

    // Also try shorter suffixes of spoken — ASR partials often append one word
    // at a time; a long fingerprint can under-match near the live edge.
    if (spoken.length > this.config.minSpokenWords) {
      for (let len = spoken.length - 1; len >= this.config.minSpokenWords; len--) {
        const suffix = spoken.slice(-len)
        for (let start = windowStart; start < windowEnd; start++) {
          const score = scoreAlignment(this.normalized, start, suffix)
          // Slight preference for longer matches
          const adjusted = score * (0.9 + 0.1 * (len / spoken.length))
          if (adjusted > bestScore) {
            bestScore = adjusted
            bestStart = start
            bestSpokenLen = len
            bestEnd = Math.min(this.normalized.length - 1, start + len - 1)
          }
        }
      }
    }

    this.confidence = bestScore

    if (bestScore >= this.config.confidenceThreshold && bestStart >= 0) {
      const wordsBehind = this.cursor - bestEnd
      const shouldRewindToSentence =
        wordsBehind >= this.config.backtrackWordCount &&
        bestSpokenLen >= this.config.backtrackWordCount

      if (shouldRewindToSentence) {
        // User re-spoke ~5+ words from earlier — jump back to that sentence.
        this.cursor = this.findSentenceStartIndex(bestStart)
        this.state = 'tracking'
      } else if (bestEnd >= this.cursor) {
        this.cursor = bestEnd
        this.state = 'tracking'
      } else if (this.state === 'off_script' || wordsBehind <= 12) {
        // Small backtracks / recoveries still allowed
        this.cursor = bestEnd
        this.state = 'tracking'
      } else {
        // Weak backward match — stay put but remain tracking if score is good
        this.state = 'tracking'
      }
    } else {
      this.state = 'off_script'
    }

    return {
      cursor: this.cursor,
      state: this.state,
      confidence: this.confidence,
      matchStart: bestStart,
    }
  }

  /** Index of the first word in the sentence that contains `wordIndex`. */
  findSentenceStartIndex(wordIndex: number): number {
    const clamped = Math.max(0, Math.min(wordIndex, this.scriptWords.length - 1))
    for (let i = clamped; i > 0; i--) {
      const prev = this.scriptWords[i - 1]!
      const curr = this.scriptWords[i]!
      const between = this.script.slice(prev.end, curr.start)
      if (/[.!?…]|\n/.test(between)) return i
    }
    return 0
  }
}

/**
 * Replay a sequence of transcript chunks against a script.
 * Useful for offline tests without a microphone.
 */
export function replayAlignment(
  script: string,
  chunks: readonly string[],
  config: Partial<AlignmentConfig> = {},
): AlignmentResult[] {
  const engine = new AlignmentEngine(script, config)
  return chunks.map((chunk) => engine.processTranscript(chunk))
}
