import { useCallback, useEffect, useState } from 'react'
import { Controls } from './components/Controls'
import { HowToUse } from './components/HowToUse'
import { ScriptEditor } from './components/ScriptEditor'
import { ScriptView } from './components/ScriptView'
import { useMicDevices } from './hooks/useMicDevices'
import { useTeleprompter } from './hooks/useTeleprompter'
import { useWakeLock } from './hooks/useWakeLock'

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

export default function App() {
  const tp = useTeleprompter()
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

  const isListening = tp.speech.status === 'listening'
  useWakeLock(isListening)

  useEffect(() => {
    if (selectedDeviceId) {
      tp.setDeviceId(selectedDeviceId)
    }
  }, [selectedDeviceId, tp.setDeviceId])

  useEffect(() => {
    document.documentElement.dataset.theme = tp.settings.oledMode
      ? 'oled'
      : tp.settings.darkMode
        ? 'dark'
        : 'light'
    document.documentElement.dataset.boldScript = tp.settings.boldText
      ? 'true'
      : 'false'
  }, [tp.settings.darkMode, tp.settings.oledMode, tp.settings.boldText])

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
    void tp.start()
  }, [closePanels, tp])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          void document.exitFullscreen()
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
          else void startSession()
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
    editorOpen,
    howToOpen,
    isListening,
    settingsOpen,
    startSession,
    toggleFullscreen,
    tp,
  ])

  return (
    <div className="app-shell">
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
        errorMessage={tp.speech.errorMessage}
        devices={devices}
        deviceId={tp.deviceId}
        settings={tp.settings}
        editorOpen={editorOpen}
        settingsOpen={settingsOpen}
        howToOpen={howToOpen}
        progress={tp.progress}
        wpm={tp.wpm}
        isFullscreen={isFullscreen}
        onStart={startSession}
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
        onNudge={tp.nudge}
        onNudgeSentence={tp.nudgeSentence}
        onUpdateSettings={tp.updateSettings}
        onResetSettings={tp.resetSettings}
      />

      <main className="stage">
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
            mirror={tp.settings.mirror}
            preserveBreaks={tp.settings.preserveBreaks}
            sentenceBreak={tp.settings.sentenceBreak}
            showCursorHighlight={tp.settings.showCursorHighlight}
            scrollAnchor={tp.settings.scrollAnchor}
            onSeek={tp.seekTo}
            containerRef={tp.containerRef}
            registerWordRef={tp.registerWordRef}
          />
        )}
      </main>
    </div>
  )
}
