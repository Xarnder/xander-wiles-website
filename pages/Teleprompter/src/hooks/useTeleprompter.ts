import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlignmentEngine, type AlignmentState } from '../alignment/AlignmentEngine'
import { useSpeechStream } from '../asr/useSpeechStream'
import type { FacingMode, VideoResolution } from '../media/platform'
import { isVideoResolution } from '../media/platform'
import { useScrollController, type ScrollAnchorMode } from '../scroll/useScrollController'
import { tokenizeTranscript } from '../utils/tokenize'
import { isSentenceEnd, nextSentenceBoundary } from '../utils/sentences'
import { DEFAULT_SCRIPT } from '../utils/defaultScript'

/** Extra spacing after a full stop in the displayed script. */
export type SentenceBreakMode = 'off' | 'tab' | 'line'
/** How the script is shown while prompting. */
export type DisplayMode = 'script' | 'one_word' | 'two_word'
export type { ScrollAnchorMode }

/** Script typography limits — wide max for small-phone teleprompter reading. */
export const FONT_SIZE_MIN = 18
export const FONT_SIZE_MAX = 128
export const LINE_WIDTH_MIN = 8
export const LINE_WIDTH_MAX = 140

export interface TeleprompterSettings {
  fontSize: number
  lineWidth: number
  /** Horizontally flip script text only (beam-splitter / glass). */
  mirror: boolean
  /** Flip chrome text/icons horizontally without rearranging layout. */
  uiMirror: boolean
  /** Dock the controls chrome at the bottom (footer) for easier reach. */
  chromeBottom: boolean
  /** Larger, chunkier chrome controls for iPad / touch. */
  largeControls: boolean
  darkMode: boolean
  /** Pure black background + pure white text (OLED-friendly). */
  oledMode: boolean
  /** Heavier weight for teleprompter script text. */
  boldText: boolean
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
   * Full scrolling script, one giant next-word cue, or said+next cue.
   */
  displayMode: DisplayMode
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
  /** Camera recording resolution (16:9). */
  videoResolution: VideoResolution
  /** Master switch — hide the entire stats strip when false. */
  showStats: boolean
  showProgressBar: boolean
  showPercent: boolean
  showWpm: boolean
  showWordsSaid: boolean
  showWordsRemaining: boolean
  showWordsTotal: boolean
}

export const DEFAULT_SETTINGS: TeleprompterSettings = {
  fontSize: 36,
  lineWidth: 42,
  mirror: false,
  uiMirror: false,
  chromeBottom: false,
  largeControls: false,
  darkMode: true,
  oledMode: false,
  boldText: false,
  confidenceThreshold: 0.62,
  scrollSensitivity: 1,
  preserveBreaks: true,
  sentenceBreak: 'off',
  displayMode: 'script',
  cursorOffset: 0,
  showCursorHighlight: true,
  allowJumpBack: true,
  scrollAnchor: 'hybrid',
  videoResolution: 'max',
  showStats: true,
  showProgressBar: true,
  showPercent: true,
  showWpm: true,
  showWordsSaid: true,
  showWordsRemaining: true,
  showWordsTotal: true,
}

const SETTINGS_STORAGE_KEY = 'voice-follow-settings'
const SCRIPT_STORAGE_KEY = 'voice-follow-script'
const DEVICE_STORAGE_KEY = 'voice-follow-mic'

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
  const displayMode: DisplayMode =
    p.displayMode === 'one_word' ||
    p.displayMode === 'two_word' ||
    p.displayMode === 'script'
      ? p.displayMode
      : DEFAULT_SETTINGS.displayMode
  const videoResolution: VideoResolution = isVideoResolution(p.videoResolution)
    ? p.videoResolution
    : DEFAULT_SETTINGS.videoResolution

  return {
    fontSize: clamp(
      typeof p.fontSize === 'number' ? p.fontSize : DEFAULT_SETTINGS.fontSize,
      FONT_SIZE_MIN,
      FONT_SIZE_MAX,
    ),
    lineWidth: clamp(
      typeof p.lineWidth === 'number' ? p.lineWidth : DEFAULT_SETTINGS.lineWidth,
      LINE_WIDTH_MIN,
      LINE_WIDTH_MAX,
    ),
    mirror: typeof p.mirror === 'boolean' ? p.mirror : DEFAULT_SETTINGS.mirror,
    uiMirror:
      typeof p.uiMirror === 'boolean' ? p.uiMirror : DEFAULT_SETTINGS.uiMirror,
    chromeBottom:
      typeof p.chromeBottom === 'boolean'
        ? p.chromeBottom
        : DEFAULT_SETTINGS.chromeBottom,
    largeControls:
      typeof p.largeControls === 'boolean'
        ? p.largeControls
        : DEFAULT_SETTINGS.largeControls,
    darkMode:
      typeof p.darkMode === 'boolean' ? p.darkMode : DEFAULT_SETTINGS.darkMode,
    oledMode:
      typeof p.oledMode === 'boolean' ? p.oledMode : DEFAULT_SETTINGS.oledMode,
    boldText:
      typeof p.boldText === 'boolean' ? p.boldText : DEFAULT_SETTINGS.boldText,
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
    displayMode,
    videoResolution,
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
    showStats:
      typeof p.showStats === 'boolean' ? p.showStats : DEFAULT_SETTINGS.showStats,
    showProgressBar:
      typeof p.showProgressBar === 'boolean'
        ? p.showProgressBar
        : DEFAULT_SETTINGS.showProgressBar,
    showPercent:
      typeof p.showPercent === 'boolean'
        ? p.showPercent
        : DEFAULT_SETTINGS.showPercent,
    showWpm:
      typeof p.showWpm === 'boolean' ? p.showWpm : DEFAULT_SETTINGS.showWpm,
    showWordsSaid:
      typeof p.showWordsSaid === 'boolean'
        ? p.showWordsSaid
        : DEFAULT_SETTINGS.showWordsSaid,
    showWordsRemaining:
      typeof p.showWordsRemaining === 'boolean'
        ? p.showWordsRemaining
        : DEFAULT_SETTINGS.showWordsRemaining,
    showWordsTotal:
      typeof p.showWordsTotal === 'boolean'
        ? p.showWordsTotal
        : DEFAULT_SETTINGS.showWordsTotal,
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

function loadStoredScript(): string {
  try {
    const raw = localStorage.getItem(SCRIPT_STORAGE_KEY)
    if (typeof raw === 'string' && raw.length > 0) return raw
  } catch {
    // ignore
  }
  return DEFAULT_SCRIPT
}

function persistScript(script: string): void {
  try {
    localStorage.setItem(SCRIPT_STORAGE_KEY, script)
  } catch {
    // ignore
  }
}

function loadStoredDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_STORAGE_KEY)
  } catch {
    return null
  }
}

function persistDeviceId(deviceId: string | null): void {
  try {
    if (deviceId) localStorage.setItem(DEVICE_STORAGE_KEY, deviceId)
    else localStorage.removeItem(DEVICE_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export interface UseTeleprompterOptions {
  facingMode?: FacingMode
}

export function useTeleprompter(options: UseTeleprompterOptions = {}) {
  const { facingMode = 'user' } = options
  const [script, setScriptState] = useState(loadStoredScript)
  const [settings, setSettings] = useState<TeleprompterSettings>(loadStoredSettings)
  const [cursor, setCursor] = useState(0)
  const [alignState, setAlignState] = useState<AlignmentState>('tracking')
  const [confidence, setConfidence] = useState(0)
  const [deviceId, setDeviceIdState] = useState<string | null>(loadStoredDeviceId)
  const [isRunning, setIsRunning] = useState(false)
  const [liveScroll, setLiveScroll] = useState(false)
  /** Words-per-minute from the most recently completed sentence. */
  const [wpm, setWpm] = useState<number | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const wordRefs = useRef<Map<number, HTMLSpanElement>>(new Map())
  const engineRef = useRef<AlignmentEngine | null>(null)
  const committedWordsRef = useRef<string[]>([])
  const partialWordsRef = useRef<string[]>([])
  const thresholdRef = useRef(settings.confidenceThreshold)
  thresholdRef.current = settings.confidenceThreshold
  const allowJumpBackRef = useRef(settings.allowJumpBack)
  allowJumpBackRef.current = settings.allowJumpBack
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const prevCursorRef = useRef(0)
  const sentenceStartIndexRef = useRef(0)
  const sentenceStartTsRef = useRef<number>(performance.now())
  const scriptRef = useRef(script)
  scriptRef.current = script
  const listeningRef = useRef(false)

  useEffect(() => {
    persistSettings(settings)
  }, [settings])

  useEffect(() => {
    persistScript(script)
  }, [script])

  useEffect(() => {
    persistDeviceId(deviceId)
  }, [deviceId])

  const setScript = useCallback((value: string) => {
    setScriptState(value)
  }, [])

  const setDeviceId = useCallback((id: string | null) => {
    setDeviceIdState(id)
  }, [])

  const { setCursor: scrollToCursor, jumpToWord, reset: resetScroll } =
    useScrollController(containerRef, {
      sensitivity: settings.scrollSensitivity,
      anchorMode: settings.scrollAnchor,
      active: liveScroll,
    })

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

  const resetPaceTracking = useCallback((atIndex = 0) => {
    prevCursorRef.current = atIndex
    sentenceStartIndexRef.current = atIndex
    sentenceStartTsRef.current = performance.now()
    setWpm(null)
  }, [])

  // Sentence-based WPM: when the cursor advances past a sentence end, score that sentence.
  useEffect(() => {
    const words = scriptWords
    const prev = prevCursorRef.current
    const next = cursor

    if (next < prev) {
      // Seek / rewind — restart the open sentence clock from the new spot.
      prevCursorRef.current = next
      sentenceStartIndexRef.current = next
      sentenceStartTsRef.current = performance.now()
      return
    }

    if (next === prev) return

    if (listeningRef.current && next > prev) {
      const now = performance.now()
      for (let i = prev; i < next; i++) {
        if (!isSentenceEnd(scriptRef.current, words, i)) continue
        const start = sentenceStartIndexRef.current
        const wordCount = i - start + 1
        const elapsedMs = now - sentenceStartTsRef.current
        if (wordCount >= 2 && elapsedMs >= 600) {
          const rate = Math.round(wordCount / (elapsedMs / 60000))
          setWpm(Math.max(1, Math.min(400, rate)))
        }
        sentenceStartIndexRef.current = i + 1
        sentenceStartTsRef.current = now
      }
    }

    prevCursorRef.current = next
  }, [cursor, scriptWords])

  useEffect(() => {
    resetPaceTracking(0)
  }, [script, resetPaceTracking])

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
    error,
    errorAction,
    modelReady,
    captureStream,
    recordingActive,
    recordingBusy,
    recordingStartedAt,
    recordingResult,
    recordingSupported,
    start: startSpeech,
    stop: stopSpeech,
    startRecording,
    stopRecording,
    preload,
    resetTranscript,
    clearError,
    clearRecordingResult,
  } = useSpeechStream({
    deviceId,
    facingMode,
    videoResolution: settings.videoResolution,
    onPartial,
    onCommitted,
  })

  // Auto-scroll only while mic is live, tracking, and showing the full script
  useEffect(() => {
    setLiveScroll(
      status === 'listening' &&
        alignState === 'tracking' &&
        settings.displayMode === 'script',
    )
  }, [status, alignState, settings.displayMode])

  useEffect(() => {
    const wasListening = listeningRef.current
    listeningRef.current = status === 'listening'
    if (!wasListening && status === 'listening') {
      sentenceStartIndexRef.current = prevCursorRef.current
      sentenceStartTsRef.current = performance.now()
    }
  }, [status])

  const start = useCallback(async () => {
    setIsRunning(true)
    sentenceStartIndexRef.current = cursor
    sentenceStartTsRef.current = performance.now()
    prevCursorRef.current = cursor
    const ok = await startSpeech()
    if (!ok) setIsRunning(false)
  }, [cursor, startSpeech])

  const pause = useCallback(() => {
    void stopSpeech()
    setIsRunning(false)
  }, [stopSpeech])

  const reset = useCallback(() => {
    void stopSpeech()
    resetTranscript()
    committedWordsRef.current = []
    partialWordsRef.current = []
    engineRef.current?.reset(0)
    setCursor(applyCursorOffset(0))
    setAlignState('tracking')
    setConfidence(0)
    setIsRunning(false)
    resetScroll()
    resetPaceTracking(0)
  }, [applyCursorOffset, resetPaceTracking, resetScroll, resetTranscript, stopSpeech])

  /** Jump the reading position to a display word (click-to-seek / keyboard nudge). */
  const seekTo = useCallback(
    (displayIndex: number) => {
      const last = Math.max(0, scriptWords.length - 1)
      if (last < 0) return
      const display = Math.max(0, Math.min(displayIndex, last))
      const s = settingsRef.current
      const offset = s.showCursorHighlight ? Math.max(0, s.cursorOffset) : 0
      const detected = Math.max(0, display - offset)

      // Clear ASR + alignment memory so live listening continues from the new spot.
      resetTranscript()
      committedWordsRef.current = []
      partialWordsRef.current = []
      engineRef.current?.reset(detected)
      setCursor(display)
      setAlignState('tracking')
      setConfidence(1)

      prevCursorRef.current = display
      sentenceStartIndexRef.current = display
      sentenceStartTsRef.current = performance.now()

      const wordEl = wordRefs.current.get(display) ?? null
      jumpToWord(display, wordEl)
    },
    [jumpToWord, resetTranscript, scriptWords.length],
  )

  const nudge = useCallback(
    (deltaWords: number) => {
      seekTo(cursor + deltaWords)
    },
    [cursor, seekTo],
  )

  /** Jump to the previous/next sentence start or end boundary. */
  const nudgeSentence = useCallback(
    (direction: 'up' | 'down') => {
      const next = nextSentenceBoundary(script, scriptWords, cursor, direction)
      seekTo(next)
    },
    [cursor, script, scriptWords, seekTo],
  )

  const updateSettings = useCallback(
    (patch: Partial<TeleprompterSettings>) => {
      setSettings((prev) => ({ ...prev, ...patch }))
    },
    [],
  )

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS })
  }, [])

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

  const progress = useMemo(() => {
    const total = scriptWords.length
    if (total <= 0) {
      return {
        total: 0,
        current: 0,
        percent: 0,
        fillPercent: 0,
        said: 0,
        remaining: 0,
      }
    }
    const said = Math.min(cursor, total)
    const remaining = Math.max(0, total - said)
    const current = Math.min(cursor + 1, total)
    const fillPercent = (current / total) * 100
    return {
      total,
      current,
      percent: Math.round(fillPercent),
      fillPercent,
      said,
      remaining,
    }
  }, [cursor, scriptWords.length])

  return {
    script,
    setScript,
    scriptWords,
    settings,
    updateSettings,
    resetSettings,
    cursor,
    seekTo,
    nudge,
    nudgeSentence,
    progress,
    wpm,
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
      error,
      errorAction,
      modelReady,
      preload,
      clearError,
      captureStream,
      recordingActive,
      recordingBusy,
      recordingStartedAt,
      recordingResult,
      recordingSupported,
      clearRecordingResult,
      startRecording,
      stopRecording,
    },
  }
}
