import { useEffect, useState } from 'react'
import { Controls } from './components/Controls'
import { HowToUse } from './components/HowToUse'
import { ScriptEditor } from './components/ScriptEditor'
import { ScriptView } from './components/ScriptView'
import { useMicDevices } from './hooks/useMicDevices'
import { useTeleprompter } from './hooks/useTeleprompter'

export default function App() {
  const tp = useTeleprompter()
  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    refresh: refreshMics,
  } = useMicDevices()
  const [editorOpen, setEditorOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [howToOpen, setHowToOpen] = useState(false)

  useEffect(() => {
    if (selectedDeviceId) {
      tp.setDeviceId(selectedDeviceId)
    }
  }, [selectedDeviceId, tp.setDeviceId])

  useEffect(() => {
    document.documentElement.dataset.theme = tp.settings.darkMode
      ? 'dark'
      : 'light'
  }, [tp.settings.darkMode])

  useEffect(() => {
    if (tp.speech.status === 'listening') {
      void refreshMics()
    }
  }, [refreshMics, tp.speech.status])

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
        onStart={() => {
          setEditorOpen(false)
          setSettingsOpen(false)
          setHowToOpen(false)
          void tp.start()
        }}
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
        onUpdateSettings={tp.updateSettings}
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
            containerRef={tp.containerRef}
            registerWordRef={tp.registerWordRef}
          />
        )}
      </main>
    </div>
  )
}
