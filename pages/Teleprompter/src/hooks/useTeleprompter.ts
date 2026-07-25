import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlignmentEngine, type AlignmentState } from '../alignment/AlignmentEngine'
import { useSpeechStream } from '../asr/useSpeechStream'
import { useScrollController } from '../scroll/useScrollController'
import { tokenizeTranscript } from '../utils/tokenize'
import { DEFAULT_SCRIPT } from '../utils/defaultScript'

export interface TeleprompterSettings {
  fontSize: number
  lineWidth: number
  mirror: boolean
  darkMode: boolean
  confidenceThreshold: number
  scrollSensitivity: number
}

const DEFAULT_SETTINGS: TeleprompterSettings = {
  fontSize: 36,
  lineWidth: 42,
  mirror: false,
  darkMode: true,
  confidenceThreshold: 0.62,
  scrollSensitivity: 1,
}

export function useTeleprompter() {
  const [script, setScript] = useState(DEFAULT_SCRIPT)
  const [settings, setSettings] = useState<TeleprompterSettings>(DEFAULT_SETTINGS)
  const [cursor, setCursor] = useState(0)
  const [alignState, setAlignState] = useState<AlignmentState>('tracking')
  const [confidence, setConfidence] = useState(0)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [liveScroll, setLiveScroll] = useState(false)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const wordRefs = useRef<Map<number, HTMLSpanElement>>(new Map())
  const engineRef = useRef<AlignmentEngine | null>(null)
  const committedWordsRef = useRef<string[]>([])
  const partialWordsRef = useRef<string[]>([])
  const thresholdRef = useRef(settings.confidenceThreshold)
  thresholdRef.current = settings.confidenceThreshold

  const { setCursor: scrollToCursor, reset: resetScroll } = useScrollController(
    containerRef,
    {
      sensitivity: settings.scrollSensitivity,
      active: liveScroll,
    },
  )

  const scriptWords = useMemo(() => {
    const engine = new AlignmentEngine(script, {
      confidenceThreshold: thresholdRef.current,
    })
    engineRef.current = engine
    committedWordsRef.current = []
    partialWordsRef.current = []
    return engine.getScriptWords()
  }, [script])

  useEffect(() => {
    setCursor(0)
    setAlignState('tracking')
    setConfidence(0)
    resetScroll()
  }, [script, resetScroll])

  useEffect(() => {
    engineRef.current?.setConfidenceThreshold(settings.confidenceThreshold)
  }, [settings.confidenceThreshold])

  const feedAlignment = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    const spoken = [
      ...committedWordsRef.current,
      ...partialWordsRef.current,
    ]
    const result = engine.processSpokenWords(spoken)
    setCursor(result.cursor)
    setAlignState(result.state)
    setConfidence(result.confidence)

    if (result.state === 'tracking') {
      const wordEl = wordRefs.current.get(result.cursor) ?? null
      scrollToCursor(result.cursor, wordEl)
    }
  }, [scrollToCursor])

  const onPartial = useCallback(
    (text: string) => {
      partialWordsRef.current = tokenizeTranscript(text)
      feedAlignment()
    },
    [feedAlignment],
  )

  const onCommitted = useCallback(
    (text: string) => {
      const words = tokenizeTranscript(text)
      committedWordsRef.current = [
        ...committedWordsRef.current,
        ...words,
      ].slice(-40)
      partialWordsRef.current = []
      feedAlignment()
    },
    [feedAlignment],
  )

  const {
    status,
    partialTranscript,
    committedTranscript,
    errorMessage,
    modelReady,
    start: startSpeech,
    stop: stopSpeech,
    preload,
    resetTranscript,
  } = useSpeechStream({
    deviceId,
    onPartial,
    onCommitted,
  })

  // Auto-scroll only while mic is live and alignment is tracking
  useEffect(() => {
    setLiveScroll(status === 'listening' && alignState === 'tracking')
  }, [status, alignState])

  const start = useCallback(async () => {
    setIsRunning(true)
    await startSpeech()
  }, [startSpeech])

  const pause = useCallback(() => {
    stopSpeech()
    setIsRunning(false)
  }, [stopSpeech])

  const reset = useCallback(() => {
    stopSpeech()
    resetTranscript()
    committedWordsRef.current = []
    partialWordsRef.current = []
    engineRef.current?.reset(0)
    setCursor(0)
    setAlignState('tracking')
    setConfidence(0)
    setIsRunning(false)
    resetScroll()
  }, [resetScroll, resetTranscript, stopSpeech])

  const updateSettings = useCallback(
    (patch: Partial<TeleprompterSettings>) => {
      setSettings((prev) => ({ ...prev, ...patch }))
    },
    [],
  )

  const registerWordRef = useCallback(
    (index: number, el: HTMLSpanElement | null) => {
      if (el) wordRefs.current.set(index, el)
      else wordRefs.current.delete(index)
    },
    [],
  )

  useEffect(() => {
    if (!liveScroll) return
    const wordEl = wordRefs.current.get(cursor) ?? null
    scrollToCursor(cursor, wordEl)
  }, [cursor, liveScroll, scrollToCursor, settings.fontSize, settings.lineWidth])

  return {
    script,
    setScript,
    scriptWords,
    settings,
    updateSettings,
    cursor,
    alignState,
    confidence,
    containerRef,
    registerWordRef,
    deviceId,
    setDeviceId,
    isRunning,
    start,
    pause,
    reset,
    speech: {
      status,
      partialTranscript,
      committedTranscript,
      errorMessage,
      modelReady,
      preload,
    },
  }
}
