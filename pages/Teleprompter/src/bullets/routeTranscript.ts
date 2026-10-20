import type { PromptMode } from './promptSettings'
import type { BulletSession } from './BulletSession'
import type { TranscriptEvent } from './TriggerDetector'

/** Follow mode keeps the alignment engine. Bullet mode never shares that path. */
export function transcriptTarget(mode: PromptMode): 'alignment' | 'trigger' {
  return mode === 'bullets' ? 'trigger' : 'alignment'
}

export function applyTranscript(options: {
  mode: PromptMode
  accepting: boolean
  session: BulletSession
  event: TranscriptEvent
}): number {
  if (transcriptTarget(options.mode) !== 'trigger' || !options.accepting) return 0
  return options.session.consume(options.event)
}
