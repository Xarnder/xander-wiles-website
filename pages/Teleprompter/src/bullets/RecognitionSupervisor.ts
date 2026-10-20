export type SupervisorPhase =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'paused'
  | 'recovering'
  | 'suspended'
  | 'unavailable'

export interface RecognitionSupervisorOptions {
  start: () => Promise<boolean>
  stop: () => Promise<void>
  recoverable?: () => boolean
  onPhase?: (phase: SupervisorPhase) => void
  now?: () => number
  schedule?: (fn: () => void, ms: number) => number
  cancel?: (handle: number) => void
  maxFailures?: number
}

interface VisibilityTarget {
  visibilityState: DocumentVisibilityState | 'visible' | 'hidden'
  addEventListener: (type: 'visibilitychange', listener: () => void) => void
  removeEventListener: (type: 'visibilitychange', listener: () => void) => void
}

const HEALTHY_LISTEN_MS = 2000

type BeginResult = 'listening' | 'suspended' | 'recovering' | 'failed' | 'cancelled'

/**
 * Owns a single recognition session. Restarts after an unexpected stop with
 * backoff, and refuses to loop after permission / unsupported failures or
 * too many attempts. Hidden tabs are not treated as listening.
 */
export class RecognitionSupervisor {
  private intent: 'off' | 'on' = 'off'
  private generation = 0
  private failures = 0
  private timer: number | null = null
  private disposed = false
  private hidden = false
  private phase: SupervisorPhase = 'idle'
  private listeningSince: number | null = null
  private attempt: 'user' | 'retry' = 'user'
  private readonly maxFailures: number
  private readonly opts: RecognitionSupervisorOptions

  constructor(opts: RecognitionSupervisorOptions) {
    this.opts = opts
    this.maxFailures = opts.maxFailures ?? 5
  }

  getPhase(): SupervisorPhase {
    return this.phase
  }

  isDisposed(): boolean {
    return this.disposed
  }

  async userStart(): Promise<boolean> {
    if (this.disposed) return false
    this.intent = 'on'
    this.failures = 0
    this.listeningSince = null
    this.attempt = 'user'
    const outcome = await this.begin()
    if (outcome === 'listening' || outcome === 'suspended') return true
    if (outcome === 'recovering' || outcome === 'cancelled') return false
    this.intent = 'off'
    if (this.phase !== 'unavailable') this.setPhase('unavailable')
    return false
  }

  async userPause(): Promise<void> {
    this.intent = 'off'
    this.clearTimer()
    const generation = ++this.generation
    this.setPhase('paused')
    try {
      await this.opts.stop()
    } catch {
      // The session is already paused from the caller's point of view.
    }
    if (generation !== this.generation) return
  }

  async userEnd(): Promise<void> {
    this.intent = 'off'
    this.clearTimer()
    ++this.generation
    this.setPhase('idle')
    try {
      await this.opts.stop()
    } catch {
      // ignore
    }
  }

  observe(snapshot: {
    status: 'idle' | 'loading' | 'listening' | 'error'
    recoverable: boolean
  }): void {
    if (this.disposed || this.intent !== 'on') return
    if (this.hidden || this.phase === 'suspended') return
    if (snapshot.status === 'loading' || this.phase === 'starting') return
    if (this.phase === 'recovering') return

    if (snapshot.status === 'listening') {
      this.listeningSince = this.now()
      this.failures = 0
      if (this.phase !== 'listening') this.setPhase('listening')
      return
    }

    if (
      this.phase === 'listening' &&
      (snapshot.status === 'idle' || snapshot.status === 'error')
    ) {
      this.recover(snapshot.status === 'error' ? snapshot.recoverable : true)
    }
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden
    if (this.disposed) return
    if (hidden) {
      if (this.intent !== 'on') return
      this.clearTimer()
      ++this.generation
      this.setPhase('suspended')
      void this.opts.stop()
      return
    }
    if (this.intent === 'on' && this.phase === 'suspended') {
      void this.begin()
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.intent = 'off'
    this.clearTimer()
    ++this.generation
    void this.opts.stop()
  }

  private async begin(): Promise<BeginResult> {
    if (this.disposed || this.intent !== 'on') return 'cancelled'
    if (this.hidden) {
      this.setPhase('suspended')
      return 'suspended'
    }
    this.clearTimer()
    const generation = ++this.generation
    this.setPhase('starting')
    try {
      await this.opts.stop()
    } catch {
      // Starting replaces any previous session.
    }
    if (!this.stillCurrent(generation)) return this.cancelledResult()

    let ok = false
    try {
      ok = await this.opts.start()
    } catch {
      ok = false
    }
    if (!this.stillCurrent(generation)) {
      if (ok) {
        try {
          await this.opts.stop()
        } catch {
          // ignore
        }
      }
      return this.cancelledResult()
    }
    if (!ok) {
      if (this.attempt === 'retry') {
        this.recover(this.opts.recoverable?.() ?? true)
        return this.phase === 'recovering' ? 'recovering' : 'failed'
      }
      this.setPhase('unavailable')
      return 'failed'
    }

    this.failures = 0
    this.listeningSince = this.now()
    this.attempt = 'retry'
    this.setPhase('listening')
    return 'listening'
  }

  private cancelledResult(): BeginResult {
    if (this.hidden && this.intent === 'on' && !this.disposed) return 'suspended'
    return 'cancelled'
  }

  private recover(recoverable: boolean): void {
    if (this.disposed || this.intent !== 'on' || this.hidden) return
    if (!recoverable) {
      this.intent = 'off'
      this.clearTimer()
      this.setPhase('unavailable')
      return
    }
    if (
      this.listeningSince != null &&
      this.now() - this.listeningSince >= HEALTHY_LISTEN_MS
    ) {
      this.failures = 0
    }
    this.listeningSince = null
    this.failures += 1
    if (this.failures > this.maxFailures) {
      this.intent = 'off'
      this.clearTimer()
      this.setPhase('unavailable')
      return
    }
    this.attempt = 'retry'
    this.setPhase('recovering')
    this.clearTimer()
    const delay = Math.min(5000, 400 * 2 ** (this.failures - 1))
    this.timer = this.schedule(() => {
      this.timer = null
      void this.begin()
    }, delay)
  }

  private stillCurrent(generation: number): boolean {
    return (
      generation === this.generation &&
      this.intent === 'on' &&
      !this.disposed &&
      !this.hidden
    )
  }

  private setPhase(phase: SupervisorPhase): void {
    if (this.phase === phase) return
    this.phase = phase
    this.opts.onPhase?.(phase)
  }

  private clearTimer(): void {
    if (this.timer == null) return
    this.cancel(this.timer)
    this.timer = null
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now()
  }

  private schedule(fn: () => void, ms: number): number {
    if (this.opts.schedule) return this.opts.schedule(fn, ms)
    return setTimeout(fn, ms) as unknown as number
  }

  private cancel(handle: number): void {
    if (this.opts.cancel) {
      this.opts.cancel(handle)
      return
    }
    clearTimeout(handle)
  }
}

/** Subscribe to tab visibility and detach cleanly on cleanup. */
export function watchVisibility(
  supervisor: RecognitionSupervisor,
  doc: VisibilityTarget,
): () => void {
  const onChange = () => {
    supervisor.setHidden(doc.visibilityState === 'hidden')
  }
  doc.addEventListener('visibilitychange', onChange)
  onChange()
  return () => {
    doc.removeEventListener('visibilitychange', onChange)
  }
}
