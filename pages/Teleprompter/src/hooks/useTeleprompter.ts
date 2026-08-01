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
/** 0 = automatic leading from font size; otherwise unitless line-height. */
export const LINE_HEIGHT_MIN = 1.1
export const LINE_HEIGHT_MAX = 2.0
export const SPOKEN_WINDOW_MIN = 5
export const SPOKEN_WINDOW_MAX = 20
export const BACKTRACK_MIN = 2
export const BACKTRACK_MAX = 15
export const PAST_WORD_DIM_MIN = 15
export const PAST_WORD_DIM_MAX = 80

export type CameraPreviewMirrorMode = 'auto' | 'on' | 'off'
/**
 * Camera preview layout size.
 * `auto` → fullscreen under the script on slim portrait phones;
 * quarter beside/above the script on wider layouts.
 */
export type CameraPreviewSize =
  | 'auto'
  | 'quarter'
  | 'half'
  | 'three_quarters'
  | 'fullscreen'

/** Resolve stored preview size for the current viewport. */
export function resolveCameraPreviewSize(
  size: CameraPreviewSize,
  slimPortrait: boolean,
): Exclude<CameraPreviewSize, 'auto'> {
  if (size === 'auto') return slimPortrait ? 'fullscreen' : 'quarter'
  return size
}

export function isCameraPreviewSize(value: unknown): value is CameraPreviewSize {
  return (
    value === 'auto' ||
    value === 'quarter' ||
    value === 'half' ||
    value === 'three_quarters' ||
    value === 'fullscreen'
  )
}

export interface TeleprompterSettings {
  fontSize: number
  lineWidth: number
  /**
   * Script line-height. 0 = automatic (scaled with font size);
   * otherwise a unitless multiplier (1.1–2.0).
   */
  lineHeight: number
  /** Horizontally flip script text only (beam-splitter / glass). */
  mirror: boolean
  /** Flip chrome text/icons horizontally without rearranging layout. */
  uiMirror: boolean
  /** Dock the controls chrome at the bottom (footer) for easier reach. */
  chromeBottom: boolean
  /** Larger, chunkier chrome controls for iPad / touch. */
  largeControls: boolean
  /** Force the compact sticky Start/Record/menu chrome on any screen size. */
  compactMode: boolean
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
   * Opacity of already-spoken words (15–80%). Lower = more faded past text.
   */
  pastWordDim: number
  /**
   * When true, re-speaking earlier script can rewind the cursor.
   * When false, alignment only searches at/ahead of the current position.
   */
  allowJumpBack: boolean
  /** How many earlier words must rematch before jump-back rewinds. */
  backtrackWordCount: number
  /** Recent spoken-word window used for fingerprint matching. */
  spokenWindow: number
  /** Where the live cursor sits in the viewport while scrolling. */
  scrollAnchor: ScrollAnchorMode
  /** Preferred camera facing for recording. */
  facingMode: FacingMode
  /** Camera recording resolution (16:9). */
  videoResolution: VideoResolution
  /** Side of the script where the live camera preview sits while recording. */
  cameraPreviewSide: 'left' | 'right'
  /**
   * How much of the stage the live camera preview uses.
   * `auto` defaults to fullscreen on slim vertical phones, quarter elsewhere.
   */
  cameraPreviewSize: CameraPreviewSize
  /**
   * Fullscreen preview brightness (1–100). Higher = brighter camera / less dark tint.
   * Only used when the resolved preview size is fullscreen.
   */
  cameraPreviewBrightness: number
  /** Stretch the camera to fill the whole preview column (cover crop). */
  cameraPreviewFill: boolean
  /**
   * Mirror the live camera preview. Auto mirrors front camera only
   * (does not change the recorded file).
   */
  cameraPreviewMirror: CameraPreviewMirrorMode
  /** Ask whether to also start camera recording when pressing Start. */
  askRecordOnStart: boolean
  /** When starting Record, also start voice-follow if it isn’t already running. */
  recordStartsFollow: boolean
  /** Keep the screen awake while voice-follow is listening. */
  wakeLock: boolean
  /** Master switch — hide the entire stats strip when false. */
  showStats: boolean
  showProgressBar: boolean
  showPercent: boolean
  showWpm: boolean
  showWordsSaid: boolean
  showWordsRemaining: boolean
  showWordsTotal: boolean
  /** Show live alignment confidence in the stats strip. */
  showConfidence: boolean
}

export const DEFAULT_SETTINGS: TeleprompterSettings = {
  fontSize: 36,
  lineWidth: 42,
  lineHeight: 0,
  mirror: false,
  uiMirror: false,
  chromeBottom: false,
  largeControls: false,
  compactMode: false,
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
  pastWordDim: 38,
  allowJumpBack: true,
  backtrackWordCount: 5,
  spokenWindow: 10,
  scrollAnchor: 'hybrid',
  facingMode: 'user',
  // 720p/30 is the reliable sustained-recording default on mobile. Higher
  // resolutions remain available in Advanced → Camera.
  videoResolution: '720p',
  cameraPreviewSide: 'left',
  cameraPreviewSize: 'auto',
  cameraPreviewBrightness: 50,
  cameraPreviewFill: false,
  cameraPreviewMirror: 'auto',
  askRecordOnStart: true,
  recordStartsFollow: true,
  wakeLock: true,
  showStats: true,
  showProgressBar: true,
  showPercent: true,
  showWpm: true,
  showWordsSaid: true,
  showWordsRemaining: true,
  showWordsTotal: true,
  showConfidence: false,
}

const SETTINGS_STORAGE_KEY = 'voice-follow-settings'
const SETTINGS_PREVIEW_AUTO_MIGRATION_KEY = 'voice-follow-preview-auto-v1'
const SETTINGS_RELIABLE_VIDEO_MIGRATION_KEY =
  'voice-follow-reliable-video-v1'
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
  const cameraPreviewSide =
    p.cameraPreviewSide === 'left' || p.cameraPreviewSide === 'right'
      ? p.cameraPreviewSide
      : DEFAULT_SETTINGS.cameraPreviewSide
  const cameraPreviewSize = isCameraPreviewSize(p.cameraPreviewSize)
    ? p.cameraPreviewSize
    : DEFAULT_SETTINGS.cameraPreviewSize
  const cameraPreviewBrightness = clamp(
    typeof p.cameraPreviewBrightness === 'number'
      ? Math.round(p.cameraPreviewBrightness)
      : DEFAULT_SETTINGS.cameraPreviewBrightness,
    1,
    100,
  )
  const cameraPreviewFill =
    typeof p.cameraPreviewFill === 'boolean'
      ? p.cameraPreviewFill
      : DEFAULT_SETTINGS.cameraPreviewFill
  const askRecordOnStart =
    typeof p.askRecordOnStart === 'boolean'
      ? p.askRecordOnStart
      : DEFAULT_SETTINGS.askRecordOnStart
  const recordStartsFollow =
    typeof p.recordStartsFollow === 'boolean'
      ? p.recordStartsFollow
      : DEFAULT_SETTINGS.recordStartsFollow
  const wakeLock =
    typeof p.wakeLock === 'boolean' ? p.wakeLock : DEFAULT_SETTINGS.wakeLock
  const cameraPreviewMirror =
    p.cameraPreviewMirror === 'auto' ||
    p.cameraPreviewMirror === 'on' ||
    p.cameraPreviewMirror === 'off'
      ? p.cameraPreviewMirror
      : DEFAULT_SETTINGS.cameraPreviewMirror
  const facingMode: FacingMode =
    p.facingMode === 'user' || p.facingMode === 'environment'
      ? p.facingMode
      : DEFAULT_SETTINGS.facingMode
  const rawLineHeight =
    typeof p.lineHeight === 'number' ? p.lineHeight : DEFAULT_SETTINGS.lineHeight
  const lineHeight =
    rawLineHeight <= 0
      ? 0
      : clamp(rawLineHeight, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX)

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
    lineHeight,
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
    compactMode:
      typeof p.compactMode === 'boolean'
        ? p.compactMode
        : DEFAULT_SETTINGS.compactMode,
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
    cameraPreviewSide,
    cameraPreviewSize,
    cameraPreviewBrightness,
    cameraPreviewFill,
    cameraPreviewMirror,
    askRecordOnStart,
    recordStartsFollow,
    wakeLock,
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
    backtrackWordCount: clamp(
      typeof p.backtrackWordCount === 'number'
        ? Math.round(p.backtrackWordCount)
        : DEFAULT_SETTINGS.backtrackWordCount,
      BACKTRACK_MIN,
      BACKTRACK_MAX,
    ),
    spokenWindow: clamp(
      typeof p.spokenWindow === 'number'
        ? Math.round(p.spokenWindow)
        : DEFAULT_SETTINGS.spokenWindow,
      SPOKEN_WINDOW_MIN,
      SPOKEN_WINDOW_MAX,
    ),
    pastWordDim: clamp(
      typeof p.pastWordDim === 'number'
        ? Math.round(p.pastWordDim)
        : DEFAULT_SETTINGS.pastWordDim,
      PAST_WORD_DIM_MIN,
      PAST_WORD_DIM_MAX,
    ),
    scrollAnchor,
    facingMode,
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
    showConfidence:
      typeof p.showConfidence === 'boolean'
        ? p.showConfidence
        : DEFAULT_SETTINGS.showConfidence,
  }
}

function loadStoredSettings(): TeleprompterSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) {
      // A fresh install already has the new defaults. Mark migrations now so
      // an explicit first-session choice is never mistaken for an old default.
      try {
        localStorage.setItem(SETTINGS_PREVIEW_AUTO_MIGRATION_KEY, '1')
        localStorage.setItem(SETTINGS_RELIABLE_VIDEO_MIGRATION_KEY, '1')
      } catch {
        // ignore migration-marker failures
      }
      return { ...DEFAULT_SETTINGS }
    }
    const parsed = JSON.parse(raw) as unknown
    let settings = sanitizeSettings(parsed)
    let settingsChanged = false
    const rawObj =
      parsed && typeof parsed === 'object'
        ? (parsed as Partial<TeleprompterSettings>)
        : null

    // One-time: previous default was `quarter`. Promote untouched installs to
    // `auto` so slim portrait phones get fullscreen preview by default.
    // Explicit later choices of `quarter` are left alone (migration flag set).
    try {
      const migrated = localStorage.getItem(SETTINGS_PREVIEW_AUTO_MIGRATION_KEY)
      if (!migrated) {
        localStorage.setItem(SETTINGS_PREVIEW_AUTO_MIGRATION_KEY, '1')
        if (
          rawObj &&
          (rawObj.cameraPreviewSize === 'quarter' ||
            rawObj.cameraPreviewSize == null)
        ) {
          settings = { ...settings, cameraPreviewSize: 'auto' }
          settingsChanged = true
        }
      }
    } catch {
      // ignore migration failures
    }

    // One-time: old installs inherited the former "Full sensor" default, which
    // can request 4K/60 and stall video during long takes. Move that untouched
    // default to the sustained-recording 720p preset.
    try {
      const migrated = localStorage.getItem(
        SETTINGS_RELIABLE_VIDEO_MIGRATION_KEY,
      )
      if (!migrated) {
        localStorage.setItem(SETTINGS_RELIABLE_VIDEO_MIGRATION_KEY, '1')
        if (
          rawObj &&
          (rawObj.videoResolution === 'max' || rawObj.videoResolution == null)
        ) {
          settings = { ...settings, videoResolution: '720p' }
          settingsChanged = true
        }
      }
    } catch {
      // ignore migration failures
    }

    if (settingsChanged) persistSettings(settings)
    return settings
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
  /**
   * Media-query compact breakpoint (phone / phone landscape).
   * Combined with settings.compactMode to force keep-at-top scroll.
   */
  autoCompact?: boolean
}

export function useTeleprompter(options: UseTeleprompterOptions = {}) {
  const { autoCompact = false } = options
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

  const compactLayout = settings.compactMode || autoCompact
  // Compact layouts default to top unless the user picked another anchor.
  const effectiveScrollAnchor: ScrollAnchorMode = compactLayout
    ? settings.scrollAnchor === 'hybrid'
      ? 'top'
      : settings.scrollAnchor
    : settings.scrollAnchor

  const { setCursor: scrollToCursor, jumpToWord, reset: resetScroll } =
    useScrollController(containerRef, {
      sensitivity: settings.scrollSensitivity,
      anchorMode: effectiveScrollAnchor,
      active: liveScroll,
    })

  const scriptWords = useMemo(() => {
    const engine = new AlignmentEngine(script, {
      confidenceThreshold: thresholdRef.current,
      allowJumpBack: allowJumpBackRef.current,
      spokenWindow: settings.spokenWindow,
      backtrackWordCount: settings.backtrackWordCount,
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
    engineRef.current?.setSpokenWindow(settings.spokenWindow)
  }, [settings.spokenWindow])

  useEffect(() => {
    engineRef.current?.setBacktrackWordCount(settings.backtrackWordCount)
  }, [settings.backtrackWordCount])

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
    facingMode: settings.facingMode,
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
  }, [
    cursor,
    liveScroll,
    scrollToCursor,
    settings.fontSize,
    settings.lineWidth,
    settings.cursorOffset,
    effectiveScrollAnchor,
  ])

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
    /** Compact chrome active (manual setting or small-screen breakpoint). */
    compactLayout,
    /** Scroll anchor forced by layout: top in compact, hybrid on wide screens. */
    effectiveScrollAnchor,
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
