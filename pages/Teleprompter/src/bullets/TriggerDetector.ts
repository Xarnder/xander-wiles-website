import { tokenizeTranscript } from '../utils/tokenize'

export type TranscriptKind = 'interim' | 'final'
export type TranscriptCoverage = 'segment' | 'cumulative'

export interface TranscriptEvent {
  text: string
  kind: TranscriptKind
  /**
   * 0–1 when the engine reports it. Events below `minConfidence` are ignored.
   * Omitted confidence is treated as unknown: finals are trusted, interims
   * must be seen twice (or score at/above `immediateInterimConfidence`).
   */
  confidence?: number
  /**
   * `segment` — text is only the current utterance (Moonshine).
   * `cumulative` — text includes earlier words from this session and may
   * overlap the previous result.
   */
  coverage?: TranscriptCoverage
}

export type SlideDirection = 'forward' | 'back'

export interface TriggerDetectorOptions {
  minConfidence?: number
  immediateInterimConfidence?: number
}

interface Match {
  start: number
  end: number
  direction: SlideDirection
}

/**
 * Counts distinct spoken occurrences of a trigger phrase.
 *
 * Interim and final results for the same utterance share one occurrence
 * counter, so a partial transcript followed by its final cannot advance
 * twice. A later utterance — even the same words said again — is a new
 * occurrence. Cumulative results are merged onto one timeline so words that
 * were already counted cannot match again.
 */
export class TriggerDetector {
  private triggerTokens: string[] = []
  private backTokens: string[] = []
  private paused = false
  private replayArmed = false
  private lastUtterance: string[] = []
  private lastInterimStarts: number[] = []
  /** Match starts already emitted for the open segment utterance. */
  private emittedStarts: number[] = []
  /** Cumulative timeline. Segment mode still appends closed utterances here. */
  private timeline: string[] = []
  /** Exclusive word index in `timeline` through which cumulative matches are spent. */
  private emittedUntil = 0
  private readonly minConfidence: number
  private readonly immediateInterimConfidence: number

  constructor(trigger: string, options: TriggerDetectorOptions = {}) {
    this.minConfidence = options.minConfidence ?? 0.45
    this.immediateInterimConfidence = options.immediateInterimConfidence ?? 0.72
    this.triggerTokens = tokenizeTranscript(trigger)
  }

  setTrigger(trigger: string): void {
    const next = tokenizeTranscript(trigger)
    if (sameWords(next, this.triggerTokens)) return
    const paused = this.paused
    this.triggerTokens = next
    this.reset()
    this.paused = paused
  }

  setBack(trigger: string): void {
    const next = tokenizeTranscript(trigger)
    if (sameWords(next, this.backTokens)) return
    const paused = this.paused
    this.backTokens = next
    this.reset()
    this.paused = paused
  }

  reset(): void {
    this.paused = false
    this.replayArmed = false
    this.lastUtterance = []
    this.lastInterimStarts = []
    this.emittedStarts = []
    this.timeline = []
    this.emittedUntil = 0
  }

  pause(): void {
    this.paused = true
  }

  /**
   * Listen again. The next event that repeats the last transcript is treated
   * as a buffered replay and does not advance. New words still count.
   */
  resume(): void {
    this.paused = false
    this.replayArmed = true
    this.lastInterimStarts = []
  }

  /** How many distinct trigger occurrences this event adds. */
  consume(event: TranscriptEvent): number {
    return this.consumeDirections(event).length
  }

  /**
   * Distinct spoken commands in order. A forward phrase and a back phrase
   * that cover the same words count once; the longer phrase wins.
   */
  consumeDirections(event: TranscriptEvent): SlideDirection[] {
    if (this.triggerTokens.length === 0 && this.backTokens.length === 0) return []
    if (
      event.confidence != null &&
      (event.confidence < this.minConfidence || event.confidence > 1)
    ) {
      return []
    }

    const incoming = tokenizeTranscript(event.text)
    return event.coverage === 'cumulative'
      ? this.consumeCumulative(incoming, event)
      : this.consumeSegment(incoming, event)
  }

  private consumeSegment(incoming: string[], event: TranscriptEvent): SlideDirection[] {
    if (incoming.length === 0) {
      if (event.kind === 'final') this.closeUtterance()
      return []
    }

    if (this.replayArmed && sameWords(incoming, this.lastUtterance)) {
      this.replayArmed = false
      this.lastUtterance = incoming
      if (event.kind === 'interim') {
        this.emittedStarts = this.matchDirections(incoming).map((match) => match.start)
        this.lastInterimStarts = []
      } else {
        this.closeUtterance()
      }
      return []
    }
    if (this.replayArmed) this.replayArmed = false

    const matches = this.matchDirections(incoming)
    let fresh: SlideDirection[] = []
    if (event.kind === 'final') {
      fresh = matches
        .filter((match) => !this.emittedStarts.includes(match.start))
        .map((match) => match.direction)
      this.closeUtterance()
    } else {
      const stable = matches.filter((match) =>
        this.isInterimStable(match, event.confidence),
      )
      fresh = stable
        .filter((match) => !this.emittedStarts.includes(match.start))
        .map((match) => match.direction)
      for (const match of stable) {
        if (!this.emittedStarts.includes(match.start)) {
          this.emittedStarts.push(match.start)
        }
      }
      this.lastInterimStarts = matches.map((match) => match.start)
    }
    this.lastUtterance = incoming
    this.noteTimeline(incoming, event.kind)
    return this.paused ? [] : fresh
  }

  private consumeCumulative(incoming: string[], event: TranscriptEvent): SlideDirection[] {
    if (incoming.length === 0) return []

    if (
      this.replayArmed &&
      (sameWords(incoming, this.lastUtterance) || sameWords(incoming, this.timeline))
    ) {
      this.replayArmed = false
      this.lastUtterance = incoming
      return []
    }
    if (this.replayArmed) this.replayArmed = false

    const previous = this.timeline
    const merged = mergeCumulativeWords(previous, incoming)
    const prefix = commonPrefixLength(previous, merged)
    if (prefix < previous.length) {
      this.emittedUntil = Math.min(this.emittedUntil, prefix)
    }
    this.timeline = merged
    this.lastUtterance = incoming

    const matches = this.matchDirections(merged)
    const confirmable =
      event.kind === 'final'
        ? matches
        : matches.filter((match) => this.isInterimStable(match, event.confidence))

    this.lastInterimStarts =
      event.kind === 'interim' ? matches.map((match) => match.start) : []

    const fresh: SlideDirection[] = []
    for (const match of confirmable) {
      if (match.start >= this.emittedUntil) {
        fresh.push(match.direction)
        this.emittedUntil = match.end
      }
    }
    return this.paused ? [] : fresh
  }

  private matchDirections(words: string[]): Match[] {
    const backTokens = sameWords(this.backTokens, this.triggerTokens)
      ? []
      : this.backTokens
    const candidates = [
      ...findTriggerMatches(words, this.triggerTokens, 'forward'),
      ...findTriggerMatches(words, backTokens, 'back'),
    ]
    candidates.sort((left, right) => {
      if (left.start !== right.start) return left.start - right.start
      const span = right.end - right.start - (left.end - left.start)
      if (span !== 0) return span
      if (left.direction === right.direction) return 0
      return left.direction === 'forward' ? -1 : 1
    })
    const chosen: Match[] = []
    let cursor = 0
    for (const match of candidates) {
      if (match.start < cursor) continue
      chosen.push(match)
      cursor = match.end
    }
    return chosen
  }

  private noteTimeline(incoming: string[], kind: TranscriptKind): void {
    if (kind !== 'final') return
    this.timeline = this.timeline.concat(incoming)
    this.emittedUntil = this.timeline.length
  }

  private closeUtterance(): void {
    this.emittedStarts = []
    this.lastInterimStarts = []
  }

  private isInterimStable(match: Match, confidence?: number): boolean {
    if (
      confidence != null &&
      confidence >= this.immediateInterimConfidence
    ) {
      return true
    }
    return this.lastInterimStarts.includes(match.start)
  }
}

function findTriggerMatches(
  words: string[],
  trigger: string[],
  direction: SlideDirection,
): Match[] {
  const matches: Match[] = []
  if (trigger.length === 0 || words.length < trigger.length) return matches
  const lastStart = words.length - trigger.length
  for (let start = 0; start <= lastStart; start++) {
    let matched = true
    for (let offset = 0; offset < trigger.length; offset++) {
      if (words[start + offset] !== trigger[offset]) {
        matched = false
        break
      }
    }
    if (!matched) continue
    matches.push({ start, end: start + trigger.length, direction })
    start += trigger.length - 1
  }
  return matches
}

function mergeCumulativeWords(previous: string[], incoming: string[]): string[] {
  if (incoming.length === 0) return previous
  if (previous.length === 0) return incoming.slice()
  if (startsWith(incoming, previous)) return incoming.slice()
  if (startsWith(previous, incoming)) return previous

  const overlap = suffixPrefixOverlap(previous, incoming)
  if (overlap >= 2) return previous.concat(incoming.slice(overlap))

  const prefix = commonPrefixLength(previous, incoming)
  if (prefix >= 2) return incoming.slice()

  return previous.concat(incoming)
}

function startsWith(words: string[], prefix: string[]): boolean {
  if (prefix.length > words.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (words[i] !== prefix[i]) return false
  }
  return true
}

function commonPrefixLength(left: string[], right: string[]): number {
  const limit = Math.min(left.length, right.length)
  let i = 0
  while (i < limit && left[i] === right[i]) i += 1
  return i
}

function suffixPrefixOverlap(previous: string[], incoming: string[]): number {
  const max = Math.min(previous.length, incoming.length)
  for (let size = max; size >= 1; size--) {
    let matched = true
    for (let i = 0; i < size; i++) {
      if (previous[previous.length - size + i] !== incoming[i]) {
        matched = false
        break
      }
    }
    if (matched) return size
  }
  return 0
}

function sameWords(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false
  }
  return true
}
