import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlignmentEngine, type AlignmentState } from '../alignment/AlignmentEngine'
import { useSpeechStream } from '../asr/useSpeechStream'
import { useScrollController, type ScrollAnchorMode } from '../scroll/useScrollController'
import { tokenizeTranscript } from '../utils/tokenize'
import { DEFAULT_SCRIPT } from '../utils/defaultScript'

/** Extra spacing after a full stop in the displayed script. */
export type SentenceBreakMode = 'off' | 'tab' | 'line'
export type { ScrollAnchorMode }

export interface TeleprompterSettings {
  fontSize: number
  lineWidth: number
  mirror: boolean
  darkMode: boolean
  confidenceThreshold: number
  scrollSensitivity: number
  /** Keep original newlines / blank lines in the teleprompter display. */
  preserveBreaks: boolean
  /**
   * Insert a tab-sized gap or a line break after each sentence-ending "."
   * (works even when preserveBreaks is off).
   */
  sentenceBreak: SentenceBreakMode
  /**
   * Highlight / scroll this many words ahead of the detected spoken word.
   * 0 = highlight the matched word; positive = lead the reader.
   */
  cursorOffset: number
  /** Show the current-word highlight (and past-word dimming). */
  showCursorHighlight: boolean
  /**
   * When true, re-speaking earlier script can rewind the cursor.
   * When false, alignment only searches at/ahead of the current position.
   */
  allowJumpBack: boolean
  /** Where the live cursor sits in the viewport while scrolling. */
  scrollAnchor: ScrollAnchorMode
}

export const DEFAULT_SETTINGS: TeleprompterSettings = {
  fontSize: 36,
  lineWidth: 42,
  mirror: false,
  darkMode: true,
  confidenceThreshold: 0.62,
  scrollSensitivity: 1,
  preserveBreaks: true,
  sentenceBreak: 'off',
  cursorOffset: 0,
  showCursorHighlight: true,
  allowJumpBack: true,
  scrollAnchor: 'hybrid',
}

const SETTINGS_STORAGE_KEY = 'voice-follow-settings'

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function sanitizeSettings(raw: unknown): TeleprompterSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const p = raw as Partial<TeleprompterSettings>
  const sentenceBreak: SentenceBreakMode =
    p.sentenceBreak === 'tab' || p.sentenceBreak === 'line' || p.sentenceBreak === 'off'
      ? p.sentenceBreak
      : DEFAULT_SETTINGS.sentenceBreak
  const scrollAnchor: ScrollAnchorMode =
    p.scrollAnchor === 'top' ||
    p.scrollAnchor === 'middle' ||
    p.scrollAnchor === 'hybrid'
      ? p.scrollAnchor
      : DEFAULT_SETTINGS.scrollAnchor

  return {
    fontSize: clamp(
      typeof p.fontSize === 'number' ? p.fontSize : DEFAULT_SETTINGS.fontSize,
      22,
      64,
    ),
    lineWidth: clamp(
      typeof p.lineWidth === 'number' ? p.lineWidth : DEFAULT_SETTINGS.lineWidth,
      24,
      140,
    ),
    mirror: typeof p.mirror === 'boolean' ? p.mirror : DEFAULT_SETTINGS.mirror,
    darkMode:
      typeof p.darkMode === 'boolean' ? p.darkMode : DEFAULT_SETTINGS.darkMode,
    confidenceThreshold: clamp(
      typeof p.confidenceThreshold === 'number'
        ? p.confidenceThreshold
        : DEFAULT_SETTINGS.confidenceThreshold,
      0.4,
      0.85,
    ),
    scrollSensitivity: clamp(
      typeof p.scrollSensitivity === 'number'
        ? p.scrollSensitivity
        : DEFAULT_SETTINGS.scrollSensitivity,
      0.5,
      1.8,
    ),
    preserveBreaks:
      typeof p.preserveBreaks === 'boolean'
        ? p.preserveBreaks
        : DEFAULT_SETTINGS.preserveBreaks,
    sentenceBreak,
    cursorOffset: clamp(
      typeof p.cursorOffset === 'number'
        ? Math.round(p.cursorOffset)
        : DEFAULT_SETTINGS.cursorOffset,
      0,
      12,
    ),
    showCursorHighlight:
      typeof p.showCursorHighlight === 'boolean'
        ? p.showCursorHighlight
        : DEFAULT_SETTINGS.showCursorHighlight,
    allowJumpBack:
      typeof p.allowJumpBack === 'boolean'
        ? p.allowJumpBack
        : DEFAULT_SETTINGS.allowJumpBack,
    scrollAnchor,
  }
}

function loadStoredSettings(): TeleprompterSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return sanitizeSettings(JSON.parse(raw) as unknown)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function persistSettings(settings: TeleprompterSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function useTeleprompter() {
  const [script, setScript] = useState(DEFAULT_SCRIPT)
  const [settings, setSettings] = useState<TeleprompterSettings>(loadStoredSettings)
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
  const allowJumpBackRef = useRef(settings.allowJumpBack)
  allowJumpBackRef.current = settings.allowJumpBack

  useEffect(() => {
    persistSettings(settings)
  }, [settings])

  const { setCursor: scrollToCursor, reset: resetScroll } = useScrollController(
    containerRef,
    {
      sensitivity: settings.scrollSensitivity,
      anchorMode: settings.scrollAnchor,
      active: liveScroll,
    },
  )

  const scriptWords = useMemo(() => {
    const engine = new AlignmentEngine(script, {
      confidenceThreshold: thresholdRef.current,
      allowJumpBack: allowJumpBackRef.current,
    })
    engineRef.current = engine
    committedWordsRef.current = []
    partialWordsRef.current = []
    return engine.getScriptWords()
  }, [script])

  const applyCursorOffset = useCallback(
    (detected: number) => {
      const last = Math.max(0, scriptWords.length - 1)
      const offset =
        settings.showCursorHighlight ? Math.max(0, settings.cursorOffset) : 0
      return Math.min(detected + offset, last)
    },
    [
      scriptWords.length,
      settings.cursorOffset,
      settings.showCursorHighlight,
    ],
  )

  useEffect(() => {
    setAlignState('tracking')
    setConfidence(0)
    resetScroll()
  }, [script, resetScroll])

  useEffect(() => {
    engineRef.current?.setConfidenceThreshold(settings.confidenceThreshold)
  }, [settings.confidenceThreshold])

  useEffect(() => {
    engineRef.current?.setAllowJumpBack(settings.allowJumpBack)
  }, [settings.allowJumpBack])

  useEffect(() => {
    const detected = engineRef.current?.getSnapshot().cursor ?? 0
    setCursor(applyCursorOffset(detected))
  }, [applyCursorOffset])

  const feedAlignment = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    const spoken = [
      ...committedWordsRef.current,
      ...partialWordsRef.current,
    ]
    const result = engine.processSpokenWords(spoken)
    const displayCursor = applyCursorOffset(result.cursor)
    setCursor(displayCursor)
    setAlignState(result.state)
    setConfidence(result.confidence)

    if (result.state === 'tracking') {
      const wordEl = wordRefs.current.get(displayCursor) ?? null
      scrollToCursor(displayCursor, wordEl)
    }
  }, [applyCursorOffset, scrollToCursor])

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
    setCursor(applyCursorOffset(0))
    setAlignState('tracking')
    setConfidence(0)
    setIsRunning(false)
    resetScroll()
  }, [applyCursorOffset, resetScroll, resetTranscript, stopSpeech])

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
  }, [cursor, liveScroll, scrollToCursor, settings.fontSize, settings.lineWidth, settings.cursorOffset, settings.scrollAnchor])

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
