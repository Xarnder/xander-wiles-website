import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { CameraPreview } from './components/CameraPreview'
import { Controls } from './components/Controls'
import { HowToUse } from './components/HowToUse'
import { AlertModal, StartChoiceModal } from './components/Modal'
import { RecordingReviewModal } from './components/RecordingReviewModal'
import { ReplaceRecordingModal } from './components/ReplaceRecordingModal'
import { ScriptEditor } from './components/ScriptEditor'
import { ScriptStats } from './components/ScriptStats'
import { ScriptView } from './components/ScriptView'
import { useMicDevices } from './hooks/useMicDevices'
import { useTeleprompter } from './hooks/useTeleprompter'
import { useWakeLock } from './hooks/useWakeLock'
import { isMediaRecorderSupported } from './media/platform'

/** Matches the previous CSS compact breakpoints (phone + phone landscape). */
const COMPACT_MQ =
  '(max-width: 720px), (orientation: landscape) and (max-height: 500px)'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

function useAutoCompact(): boolean {
  const [autoCompact, setAutoCompact] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(COMPACT_MQ).matches
  })

  useEffect(() => {
    const mq = window.matchMedia(COMPACT_MQ)
    const onChange = () => setAutoCompact(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return autoCompact
}

export default function App() {
  const [reviewOpen, setReviewOpen] = useState(false)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [startChoiceOpen, setStartChoiceOpen] = useState(false)
  const lastRecordingAtRef = useRef<number | null>(null)
  const autoCompact = useAutoCompact()

  const tp = useTeleprompter({ autoCompact })
  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    refresh: refreshMics,
  } = useMicDevices(tp.deviceId)
  const [editorOpen, setEditorOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [howToOpen, setHowToOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const compactChrome = tp.compactLayout

  const isListening = tp.speech.status === 'listening'
  useWakeLock(isListening && tp.settings.wakeLock)
  const facingMode = tp.settings.facingMode
  const previewMirror =
    tp.settings.cameraPreviewMirror === 'auto'
      ? facingMode === 'user'
      : tp.settings.cameraPreviewMirror === 'on'

  // Open review whenever a new take finishes.
  useEffect(() => {
    const result = tp.speech.recordingResult
    if (!result) {
      lastRecordingAtRef.current = null
      setReviewOpen(false)
      return
    }
    if (lastRecordingAtRef.current !== result.recordedAt) {
      lastRecordingAtRef.current = result.recordedAt
      setReviewOpen(true)
      setReplaceOpen(false)
    }
  }, [tp.speech.recordingResult])

  useEffect(() => {
    if (selectedDeviceId) {
      tp.setDeviceId(selectedDeviceId)
    }
  }, [selectedDeviceId, tp.setDeviceId])

  useEffect(() => {
    const useOled = compactChrome || tp.settings.oledMode
    document.documentElement.dataset.theme = useOled
      ? 'oled'
      : tp.settings.darkMode
        ? 'dark'
        : 'light'
    document.documentElement.dataset.boldScript = tp.settings.boldText
      ? 'true'
      : 'false'
    if (tp.settings.uiMirror) {
      document.documentElement.dataset.uiMirrored = 'true'
    } else {
      delete document.documentElement.dataset.uiMirrored
    }
  }, [
    compactChrome,
    tp.settings.darkMode,
    tp.settings.oledMode,
    tp.settings.boldText,
    tp.settings.uiMirror,
  ])

  useEffect(() => {
    if (tp.speech.status === 'listening') {
      void refreshMics()
    }
  }, [refreshMics, tp.speech.status])

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const closePanels = useCallback(() => {
    setEditorOpen(false)
    setSettingsOpen(false)
    setHowToOpen(false)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // Browser denied / unsupported.
    }
  }, [])

  const startSession = useCallback(() => {
    closePanels()
    setStartChoiceOpen(false)
    void tp.start()
  }, [closePanels, tp])

  const requestStart = useCallback(() => {
    const recordingSupported =
      tp.speech.recordingSupported && isMediaRecorderSupported()
    if (
      tp.settings.askRecordOnStart &&
      recordingSupported &&
      !tp.speech.recordingActive
    ) {
      closePanels()
      setStartChoiceOpen(true)
      return
    }
    startSession()
  }, [
    closePanels,
    startSession,
    tp.settings.askRecordOnStart,
    tp.speech.recordingActive,
    tp.speech.recordingSupported,
  ])

  const startScriptOnly = useCallback(() => {
    startSession()
  }, [startSession])

  const startWithRecording = useCallback(() => {
    startSession()
    if (tp.speech.recordingBusy || tp.speech.recordingActive) return
    if (tp.speech.recordingResult) {
      tp.speech.clearRecordingResult()
    }
    void tp.speech.startRecording()
  }, [startSession, tp.speech])

  const dismissSpeechError = useCallback(() => {
    tp.speech.clearError()
  }, [tp.speech])

  const retrySpeechError = useCallback(() => {
    const action = tp.speech.errorAction
    tp.speech.clearError()
    if (action === 'preload') {
      void tp.speech.preload()
      return
    }
    if (action === 'record') {
      if (!tp.speech.recordingBusy && !tp.speech.recordingActive) {
        void tp.speech.startRecording()
      }
      return
    }
    void requestStart()
  }, [requestStart, tp.speech])

  const toggleRecording = useCallback(() => {
    if (tp.speech.recordingBusy) return
    if (tp.speech.recordingActive) {
      void tp.speech.stopRecording()
      return
    }
    if (tp.speech.recordingResult) {
      setReviewOpen(false)
      setReplaceOpen(true)
      return
    }
    // Starting a take also starts script follow/scroll (unless disabled).
    if (
      tp.settings.recordStartsFollow &&
      tp.speech.status !== 'listening'
    ) {
      closePanels()
      void tp.start()
    }
    void tp.speech.startRecording()
  }, [closePanels, tp])

  const closeReview = useCallback(() => {
    setReviewOpen(false)
  }, [])

  const openReviewTake = useCallback(() => {
    if (!tp.speech.recordingResult || tp.speech.recordingActive) return
    setReplaceOpen(false)
    setReviewOpen(true)
  }, [tp.speech.recordingActive, tp.speech.recordingResult])

  const discardRecording = useCallback(() => {
    setReviewOpen(false)
    setReplaceOpen(false)
    tp.speech.clearRecordingResult()
  }, [tp.speech])

  const confirmReplaceRecording = useCallback(() => {
    if (tp.speech.recordingBusy) return
    setReplaceOpen(false)
    setReviewOpen(false)
    tp.speech.clearRecordingResult()
    if (
      tp.settings.recordStartsFollow &&
      tp.speech.status !== 'listening'
    ) {
      closePanels()
      void tp.start()
    }
    void tp.speech.startRecording()
  }, [closePanels, tp])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          void document.exitFullscreen()
          return
        }
        if (replaceOpen) {
          e.preventDefault()
          setReplaceOpen(false)
          return
        }
        if (startChoiceOpen) {
          e.preventDefault()
          setStartChoiceOpen(false)
          return
        }
        if (reviewOpen) {
          e.preventDefault()
          closeReview()
          return
        }
        if (tp.speech.error) {
          e.preventDefault()
          dismissSpeechError()
          return
        }
        if (editorOpen || settingsOpen || howToOpen) {
          e.preventDefault()
          closePanels()
        }
        return
      }

      if (isTypingTarget(e.target)) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (isListening) tp.pause()
          else void requestStart()
          break
        case 'r':
        case 'R':
          e.preventDefault()
          tp.reset()
          break
        case 'e':
        case 'E':
          e.preventDefault()
          setEditorOpen((v) => !v)
          setSettingsOpen(false)
          setHowToOpen(false)
          break
        case ',':
          e.preventDefault()
          setSettingsOpen((v) => !v)
          setEditorOpen(false)
          setHowToOpen(false)
          break
        case '?':
          e.preventDefault()
          setHowToOpen((v) => !v)
          setEditorOpen(false)
          setSettingsOpen(false)
          break
        case 'f':
        case 'F':
          e.preventDefault()
          void toggleFullscreen()
          break
        case 'v':
        case 'V':
          e.preventDefault()
          if (reviewOpen || replaceOpen || startChoiceOpen) break
          toggleRecording()
          break
        case 'ArrowLeft':
          e.preventDefault()
          tp.nudge(-1)
          break
        case 'ArrowRight':
          e.preventDefault()
          tp.nudge(1)
          break
        case 'ArrowUp':
          e.preventDefault()
          tp.nudgeSentence('up')
          break
        case 'ArrowDown':
          e.preventDefault()
          tp.nudgeSentence('down')
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    closePanels,
    closeReview,
    dismissSpeechError,
    editorOpen,
    howToOpen,
    isListening,
    replaceOpen,
    reviewOpen,
    requestStart,
    settingsOpen,
    startChoiceOpen,
    toggleFullscreen,
    toggleRecording,
    tp,
  ])

  const previewStream =
    tp.speech.recordingActive && tp.speech.captureStream
      ? tp.speech.captureStream
      : null

  const recording = tp.speech.recordingResult

  return (
    <div
      className="app-shell"
      data-ui-mirrored={tp.settings.uiMirror ? 'true' : undefined}
      data-chrome-dock={tp.settings.chromeBottom ? 'bottom' : 'top'}
      data-ui-scale={tp.settings.largeControls ? 'large' : undefined}
      data-compact={compactChrome ? 'true' : undefined}
    >
      <div className="atmosphere" aria-hidden>
        <span className="glow-orb glow-orb-a" />
        <span className="glow-orb glow-orb-b" />
        <span className="glow-orb glow-orb-c" />
      </div>
      <Controls
        isRunning={tp.isRunning}
        status={tp.speech.status}
        alignState={tp.alignState}
        confidence={tp.confidence}
        modelReady={tp.speech.modelReady}
        devices={devices}
        deviceId={tp.deviceId}
        settings={tp.settings}
        editorOpen={editorOpen}
        settingsOpen={settingsOpen}
        howToOpen={howToOpen}
        progress={tp.progress}
        wpm={tp.wpm}
        isFullscreen={isFullscreen}
        compactChrome={compactChrome}
        recordingActive={tp.speech.recordingActive}
        recordingBusy={tp.speech.recordingBusy}
        hasRecordingTake={tp.speech.recordingResult != null}
        recordingSupported={tp.speech.recordingSupported && isMediaRecorderSupported()}
        facingMode={facingMode}
        onStart={requestStart}
        onPause={tp.pause}
        onReset={tp.reset}
        onPreload={() => void tp.speech.preload()}
        onDeviceChange={(id) => {
          tp.setDeviceId(id)
          setSelectedDeviceId(id)
        }}
        onToggleEditor={() => {
          setEditorOpen((v) => !v)
          setSettingsOpen(false)
          setHowToOpen(false)
        }}
        onToggleSettings={() => {
          setSettingsOpen((v) => !v)
          setEditorOpen(false)
          setHowToOpen(false)
        }}
        onToggleHowTo={() => {
          setHowToOpen((v) => !v)
          setEditorOpen(false)
          setSettingsOpen(false)
        }}
        onToggleFullscreen={() => void toggleFullscreen()}
        onToggleRecording={toggleRecording}
        onReviewTake={openReviewTake}
        onFacingModeChange={(mode) => tp.updateSettings({ facingMode: mode })}
        onNudge={tp.nudge}
        onNudgeSentence={tp.nudgeSentence}
        onUpdateSettings={tp.updateSettings}
        onResetSettings={tp.resetSettings}
      />

      <main
        className="stage"
        data-recording-preview={previewStream ? 'true' : undefined}
        data-preview-side={
          previewStream ? tp.settings.cameraPreviewSide : undefined
        }
        data-preview-size={
          previewStream ? tp.settings.cameraPreviewSize : undefined
        }
        data-preview-fill={
          previewStream && tp.settings.cameraPreviewFill ? 'true' : undefined
        }
        style={
          previewStream && tp.settings.cameraPreviewSize === 'fullscreen'
            ? ({
                ['--preview-dim']: String(
                  (100 - tp.settings.cameraPreviewBrightness) / 100,
                ),
              } as CSSProperties)
            : undefined
        }
      >
        <div className="stage-main">
          {howToOpen ? (
            <HowToUse onClose={() => setHowToOpen(false)} />
          ) : editorOpen ? (
            <ScriptEditor
              script={tp.script}
              onChange={tp.setScript}
              onClose={() => setEditorOpen(false)}
            />
          ) : (
            <ScriptView
              script={tp.script}
              words={tp.scriptWords}
              cursor={tp.cursor}
              alignState={tp.alignState}
              fontSize={tp.settings.fontSize}
              lineWidth={tp.settings.lineWidth}
              lineHeight={tp.settings.lineHeight}
              pastWordDim={tp.settings.pastWordDim}
              mirror={tp.settings.mirror}
              preserveBreaks={tp.settings.preserveBreaks}
              sentenceBreak={tp.settings.sentenceBreak}
              displayMode={tp.settings.displayMode}
              showCursorHighlight={tp.settings.showCursorHighlight}
              scrollAnchor={tp.effectiveScrollAnchor}
              onSeek={tp.seekTo}
              containerRef={tp.containerRef}
              registerWordRef={tp.registerWordRef}
            />
          )}
        </div>

        <CameraPreview
          stream={previewStream}
          mirror={previewMirror}
          recording={tp.speech.recordingActive}
          recordingStartedAt={tp.speech.recordingStartedAt}
          fillColumn={
            tp.settings.cameraPreviewFill ||
            tp.settings.cameraPreviewSize === 'fullscreen'
          }
          footer={
            tp.settings.cameraPreviewFill ||
            tp.settings.cameraPreviewSize === 'fullscreen' ? undefined : (
              <ScriptStats
                progress={tp.progress}
                wpm={tp.wpm}
                confidence={tp.confidence}
                settings={tp.settings}
                stacked
              />
            )
          }
        />
      </main>

      <StartChoiceModal
        open={startChoiceOpen}
        recordingSupported={
          tp.speech.recordingSupported && isMediaRecorderSupported()
        }
        onCancel={() => setStartChoiceOpen(false)}
        onStartScriptOnly={startScriptOnly}
        onStartWithRecording={startWithRecording}
      />

      <AlertModal
        open={tp.speech.error != null}
        title={tp.speech.error?.title}
        message={tp.speech.error?.message ?? ''}
        fix={tp.speech.error?.fix}
        onClose={dismissSpeechError}
        actionLabel="Retry"
        onAction={retrySpeechError}
        dismissLabel="Dismiss"
      />

      <RecordingReviewModal
        open={reviewOpen && recording != null}
        recording={recording}
        onClose={closeReview}
        onDiscard={discardRecording}
      />

      <ReplaceRecordingModal
        open={replaceOpen && recording != null}
        recording={recording}
        onCancel={() => setReplaceOpen(false)}
        onConfirmReplace={confirmReplaceRecording}
        onReviewOld={() => {
          setReplaceOpen(false)
          setReviewOpen(true)
        }}
      />
    </div>
  )
}
