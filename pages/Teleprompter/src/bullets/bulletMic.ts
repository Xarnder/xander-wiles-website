import type { SpeechStatus } from '../asr/useSpeechStream'
import type { BulletPhase } from './BulletSession'
import type { SupervisorPhase } from './RecognitionSupervisor'

export type BulletMicState =
  | 'off'
  | 'starting'
  | 'listening'
  | 'paused'
  | 'recovering'
  | 'suspended'
  | 'unavailable'
  | 'error'

export function deriveBulletMic(input: {
  enabled: boolean
  session: BulletPhase
  supervisor: SupervisorPhase
  speech: SpeechStatus
}): BulletMicState {
  if (!input.enabled) return 'off'
  if (input.supervisor === 'suspended') return 'suspended'
  if (input.supervisor === 'unavailable') return 'unavailable'
  if (input.supervisor === 'recovering') return 'recovering'
  if (input.session === 'paused') return 'paused'
  if (input.speech === 'error') return 'error'
  if (input.speech === 'listening' && input.session === 'listening') {
    return 'listening'
  }
  if (input.speech === 'loading' || input.supervisor === 'starting') {
    return 'starting'
  }
  if (input.session === 'idle') return 'off'
  return 'starting'
}

export function bulletMicLabel(
  state: BulletMicState,
  trigger: string,
  detail?: string | null,
): string {
  const phrase = trigger.trim() || 'the trigger'
  switch (state) {
    case 'listening':
      return `Listening for “${phrase}”`
    case 'starting':
      return 'Starting microphone…'
    case 'paused':
      return 'Paused'
    case 'recovering':
      return 'Reconnecting microphone…'
    case 'suspended':
      return 'Microphone paused while this tab is in the background'
    case 'unavailable':
      return (
        detail?.trim() ||
        'Hands-free advance is unavailable. Use Previous and Next.'
      )
    case 'error':
      return detail?.trim() || 'Microphone error. Hands-free advance has stopped.'
    default:
      return 'Microphone off'
  }
}
