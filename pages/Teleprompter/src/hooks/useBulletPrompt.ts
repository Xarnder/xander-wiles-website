import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpeechErrorKind } from '../asr/speechErrors'
import type { SpeechStatus } from '../asr/useSpeechStream'
import { BulletSession, type BulletPhase } from '../bullets/BulletSession'
import {
  bulletMicLabel,
  deriveBulletMic,
  type BulletMicState,
} from '../bullets/bulletMic'
import {
  RecognitionSupervisor,
  watchVisibility,
  type SupervisorPhase,
} from '../bullets/RecognitionSupervisor'
import type { TranscriptEvent } from '../bullets/TriggerDetector'

export interface BulletPromptState {
  index: number
  count: number
  current: string
  nextBullet: string | null
  mic: BulletMicState
  micLabel: string
  /** Presentation is running (including reconnect and background suspend). */
  sessionActive: boolean
  /** Hide the speech error dialog while an automatic retry is in progress. */
  suppressError: boolean
  consume: (event: TranscriptEvent) => void
  start: () => Promise<boolean>
  pause: () => Promise<void>
  end: () => Promise<void>
  next: () => void
  prev: () => void
}

export function useBulletPrompt(options: {
  enabled: boolean
  script: string
  trigger: string
  backTrigger: string
  speechStatus: SpeechStatus
  errorKind: SpeechErrorKind | null
  errorDetail: string | null
  startSpeech: () => Promise<boolean>
  stopSpeech: () => Promise<void>
  onForcedStop?: () => void
}): BulletPromptState {
  const {
    enabled,
    script,
    trigger,
    backTrigger,
    speechStatus,
    errorKind,
    errorDetail,
    startSpeech,
    stopSpeech,
    onForcedStop,
  } = options

  const sessionRef = useRef<BulletSession | null>(null)
  const session =
    sessionRef.current ?? new BulletSession(script, trigger, backTrigger)
  if (sessionRef.current == null) sessionRef.current = session

  const startRef = useRef(startSpeech)
  const stopRef = useRef(stopSpeech)
  const recoverableRef = useRef(true)
  const onForcedStopRef = useRef(onForcedStop)
  const acceptRef = useRef(false)
  const replayOnStartRef = useRef(false)
  const mountedRef = useRef(true)
  startRef.current = startSpeech
  stopRef.current = stopSpeech
  recoverableRef.current =
    errorKind !== 'permission' && errorKind !== 'platform'
  onForcedStopRef.current = onForcedStop

  const [index, setIndex] = useState(session.index)
  const [count, setCount] = useState(session.count)
  const [current, setCurrent] = useState(session.current)
  const [nextBullet, setNextBullet] = useState<string | null>(session.nextBullet)
  const [sessionPhase, setSessionPhase] = useState<BulletPhase>('idle')
  const [supervisorPhase, setSupervisorPhase] = useState<SupervisorPhase>('idle')

  const supervisorRef = useRef<RecognitionSupervisor | null>(null)
  const startPromiseRef = useRef<Promise<boolean> | null>(null)

  const createSupervisor = useCallback(() => {
    return new RecognitionSupervisor({
      start: async () => {
        acceptRef.current = false
        const session = sessionRef.current
        if (replayOnStartRef.current && session) {
          replayOnStartRef.current = false
          session.armReplay()
        }
        const ok = await startRef.current()
        if (ok && sessionRef.current?.getPhase() === 'listening') {
          acceptRef.current = true
        }
        return ok
      },
      stop: () => stopRef.current(),
      recoverable: () => recoverableRef.current,
      onPhase: (phase) => {
        if (phase === 'recovering' || phase === 'suspended') {
          replayOnStartRef.current = true
        }
        if (phase !== 'listening') acceptRef.current = false
        if (mountedRef.current) setSupervisorPhase(phase)
      },
    })
  }, [])

  const publish = useCallback(() => {
    const session = sessionRef.current
    if (!session) return
    setIndex(session.index)
    setCount(session.count)
    setCurrent(session.current)
    setNextBullet(session.nextBullet)
    setSessionPhase(session.getPhase())
  }, [])

  useEffect(() => {
    sessionRef.current?.setScript(script)
    publish()
  }, [publish, script])

  useEffect(() => {
    sessionRef.current?.setTrigger(trigger)
  }, [trigger])

  useEffect(() => {
    sessionRef.current?.setBackTrigger(backTrigger)
  }, [backTrigger])

  // Own the supervisor here, not during render. React Strict Mode disposes
  // the effect instance and runs it again; a supervisor created in render
  // would stay disposed and Start would return to "microphone off" with no error.
  useEffect(() => {
    mountedRef.current = true
    const supervisor = createSupervisor()
    supervisorRef.current = supervisor
    const unwatch = enabled ? watchVisibility(supervisor, document) : undefined
    return () => {
      acceptRef.current = false
      unwatch?.()
      supervisor.dispose()
      if (supervisorRef.current === supervisor) supervisorRef.current = null
      setSupervisorPhase('idle')
      mountedRef.current = false
    }
  }, [createSupervisor, enabled])

  const enabledRef = useRef(enabled)
  useEffect(() => {
    if (enabledRef.current === enabled) return
    enabledRef.current = enabled
    acceptRef.current = false
    replayOnStartRef.current = false
    sessionRef.current?.disarm()
    publish()
    void supervisorRef.current?.userEnd()
    onForcedStopRef.current?.()
  }, [enabled, publish])

  useEffect(() => {
    if (!enabled) return
    const supervisor = supervisorRef.current
    if (!supervisor) return
    supervisor.observe({
      status: speechStatus,
      recoverable: errorKind !== 'permission' && errorKind !== 'platform',
    })
    const phase = supervisor.getPhase()
    if (
      speechStatus === 'listening' &&
      sessionRef.current?.getPhase() === 'listening' &&
      phase === 'listening'
    ) {
      acceptRef.current = true
    }
  }, [enabled, errorKind, speechStatus])

  const start = useCallback(() => {
    if (startPromiseRef.current) return startPromiseRef.current
    const run = (async () => {
      const session = sessionRef.current
      const supervisor = supervisorRef.current
      if (!session || !supervisor || supervisor.isDisposed()) return false
      acceptRef.current = false
      replayOnStartRef.current = false
      session.beginListening()
      publish()
      const ok = await supervisor.userStart()
      if (!ok) {
        acceptRef.current = false
        if (session.getPhase() === 'listening') {
          session.cancelListening()
          publish()
        }
      }
      return ok
    })()
    startPromiseRef.current = run
    void run.finally(() => {
      if (startPromiseRef.current === run) startPromiseRef.current = null
    })
    return run
  }, [publish])

  const pause = useCallback(async () => {
    acceptRef.current = false
    replayOnStartRef.current = false
    sessionRef.current?.pause()
    publish()
    await supervisorRef.current?.userPause()
  }, [publish])

  const end = useCallback(async () => {
    acceptRef.current = false
    replayOnStartRef.current = false
    sessionRef.current?.end()
    publish()
    await supervisorRef.current?.userEnd()
  }, [publish])

  const next = useCallback(() => {
    sessionRef.current?.next()
    publish()
  }, [publish])

  const prev = useCallback(() => {
    sessionRef.current?.prev()
    publish()
  }, [publish])

  const consume = useCallback(
    (event: TranscriptEvent) => {
      if (!enabled || !acceptRef.current) return
      const moved = sessionRef.current?.consume(event) ?? 0
      if (moved > 0) publish()
    },
    [enabled, publish],
  )

  const mic = deriveBulletMic({
    enabled,
    session: sessionPhase,
    supervisor: supervisorPhase,
    speech: speechStatus,
  })

  const sessionActive =
    enabled &&
    sessionPhase === 'listening' &&
    (supervisorPhase === 'starting' ||
      supervisorPhase === 'listening' ||
      supervisorPhase === 'recovering' ||
      supervisorPhase === 'suspended' ||
      speechStatus === 'loading' ||
      speechStatus === 'listening')

  return {
    index,
    count,
    current,
    nextBullet,
    mic,
    micLabel: bulletMicLabel(
      mic,
      trigger,
      mic === 'error' || mic === 'unavailable' ? errorDetail : null,
    ),
    sessionActive,
    suppressError: enabled && supervisorPhase === 'recovering',
    consume,
    start,
    pause,
    end,
    next,
    prev,
  }
}
