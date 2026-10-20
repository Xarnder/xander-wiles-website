import { parseBullets } from './parseBullets'
import {
  isTriggerPhraseValid,
  parseBulletBackTrigger,
  parseBulletTrigger,
  phrasesMatch,
} from './promptSettings'
import {
  TriggerDetector,
  type TranscriptEvent,
} from './TriggerDetector'

export type BulletPhase = 'idle' | 'listening' | 'paused'

/**
 * Slideshow cursor plus trigger detection. Speech events never move the
 * cursor unless the phase is `listening`. Manual steps do not reset the
 * detector, so a later spoken trigger still lands on the right occurrence.
 */
export class BulletSession {
  private readonly detector: TriggerDetector
  private bullets: string[]
  private phase: BulletPhase = 'idle'
  private cursor = 0

  constructor(script: string, trigger: string, backTrigger = '') {
    this.bullets = parseBullets(script)
    this.detector = new TriggerDetector(parseBulletTrigger(trigger))
    if (backTrigger && !phrasesMatch(trigger, backTrigger)) {
      this.detector.setBack(parseBulletBackTrigger(backTrigger))
    }
  }

  get index(): number {
    return this.cursor
  }

  get count(): number {
    return this.bullets.length
  }

  get current(): string {
    return this.bullets[this.cursor] ?? ''
  }

  get nextBullet(): string | null {
    if (this.cursor + 1 >= this.bullets.length) return null
    return this.bullets[this.cursor + 1] ?? null
  }

  getPhase(): BulletPhase {
    return this.phase
  }

  setScript(script: string): void {
    this.bullets = parseBullets(script)
    if (this.bullets.length === 0) {
      this.cursor = 0
      return
    }
    if (this.cursor >= this.bullets.length) {
      this.cursor = this.bullets.length - 1
    }
  }

  setTrigger(trigger: string): boolean {
    if (!isTriggerPhraseValid(trigger)) return false
    this.detector.setTrigger(parseBulletTrigger(trigger))
    return true
  }

  setBackTrigger(trigger: string): boolean {
    if (!isTriggerPhraseValid(trigger)) return false
    this.detector.setBack(parseBulletBackTrigger(trigger))
    return true
  }

  /** New recognizer session. Drops old transcripts so they cannot replay. */
  beginListening(): void {
    this.phase = 'listening'
    this.detector.reset()
  }

  pause(): void {
    if (this.phase !== 'listening') return
    this.phase = 'paused'
    this.detector.pause()
  }

  /**
   * Continue after pause without resetting the slide.
   * `fresh` is for a recognizer that was stopped and started again: old
   * engine callbacks must be ignored by the caller, and detection starts clean.
   * Without `fresh`, an exact replay of the last transcript is swallowed once.
   */
  resume(options?: { fresh?: boolean }): void {
    if (this.phase !== 'paused' && this.phase !== 'listening') return
    this.phase = 'listening'
    if (options?.fresh) {
      this.detector.reset()
      return
    }
    this.detector.resume()
  }

  /** Stop listening without moving the slide. Used when start fails. */
  cancelListening(): void {
    if (this.phase === 'idle') return
    this.phase = 'idle'
    this.detector.reset()
  }

  /** Stop the presentation and return to the first bullet. */
  end(): void {
    this.phase = 'idle'
    this.cursor = 0
    this.detector.reset()
  }

  /** Leave bullet mode. Keeps the parsed list but drops recognition memory. */
  disarm(): void {
    this.phase = 'idle'
    this.cursor = 0
    this.detector.reset()
  }

  /** Arm the one-shot replay guard used when the mic reconnects. */
  armReplay(): void {
    if (this.phase !== 'listening') return
    this.detector.resume()
  }

  next(): boolean {
    if (this.cursor >= this.bullets.length - 1) return false
    this.cursor += 1
    return true
  }

  prev(): boolean {
    if (this.cursor <= 0) return false
    this.cursor -= 1
    return true
  }

  /**
   * @returns how many bullets the cursor actually moved. Triggers spoken on
   * the last bullet are still consumed so they cannot fire after a manual step back.
   */
  consume(event: TranscriptEvent): number {
    if (this.phase === 'idle') return 0
    const steps = this.detector.consumeDirections(event)
    if (this.phase !== 'listening' || steps.length === 0) return 0
    let moved = 0
    for (const step of steps) {
      const did = step === 'back' ? this.prev() : this.next()
      if (did) moved += 1
    }
    return moved
  }
}
