import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MicDevice } from '../hooks/useMicDevices'
import {
  BACKTRACK_MAX,
  BACKTRACK_MIN,
  DEFAULT_SETTINGS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  LINE_WIDTH_MAX,
  LINE_WIDTH_MIN,
  PAST_WORD_DIM_MAX,
  PAST_WORD_DIM_MIN,
  SPOKEN_WINDOW_MAX,
  SPOKEN_WINDOW_MIN,
  type CameraPreviewMirrorMode,
  type DisplayMode,
  type ScrollAnchorMode,
  type TeleprompterSettings,
} from '../hooks/useTeleprompter'
import type { SpeechStatus } from '../asr/useSpeechStream'
import type { AlignmentState } from '../alignment/AlignmentEngine'
import {
  VIDEO_RESOLUTION_OPTIONS,
  type FacingMode,
  type VideoResolution,
} from '../media/platform'
import { ConfirmModal } from './Modal'
import { BtnLabel } from './BtnLabel'
import { ScriptStats } from './ScriptStats'
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconClose,
  IconFlip,
  IconMenu,
} from './icons'

interface ControlsProps {
  isRunning: boolean
  status: SpeechStatus
  alignState: AlignmentState
  confidence: number
  modelReady: boolean
  devices: MicDevice[]
  deviceId: string | null
  settings: TeleprompterSettings
  editorOpen: boolean
  settingsOpen: boolean
  howToOpen: boolean
  progress: {
    current: number
    total: number
    percent: number
    fillPercent: number
    said: number
    remaining: number
  }
  wpm: number | null
  isFullscreen: boolean
  compactChrome?: boolean
  recordingActive: boolean
  recordingBusy?: boolean
  hasRecordingTake?: boolean
  recordingSupported: boolean
  facingMode: FacingMode
  onStart: () => void
  onPause: () => void
  onReset: () => void
  onPreload: () => void
  onDeviceChange: (id: string) => void
  onToggleEditor: () => void
  onToggleSettings: () => void
  onToggleHowTo: () => void
  onToggleFullscreen: () => void
  onToggleRecording: () => void
  onReviewTake?: () => void
  onFacingModeChange: (mode: FacingMode) => void
  onNudge: (delta: number) => void
  onNudgeSentence: (direction: 'up' | 'down') => void
  onUpdateSettings: (patch: Partial<TeleprompterSettings>) => void
  onResetSettings: () => void
}

type SliderKey =
  | 'fontSize'
  | 'lineWidth'
  | 'lineHeight'
  | 'pastWordDim'
  | 'confidenceThreshold'
  | 'scrollSensitivity'
  | 'cursorOffset'
  | 'cameraPreviewBrightness'
  | 'spokenWindow'
  | 'backtrackWordCount'

type SettingsTabId = 'script' | 'look' | 'speech' | 'camera' | 'stats' | 'model'

const SETTINGS_TABS: ReadonlyArray<{ id: SettingsTabId; label: string }> = [
  { id: 'script', label: 'Script' },
  { id: 'look', label: 'Look' },
  { id: 'speech', label: 'Speech' },
  { id: 'camera', label: 'Camera' },
  { id: 'stats', label: 'Stats' },
  { id: 'model', label: 'Model' },
]

function SliderField({
  label,
  valueLabel,
  min,
  max,
  step = 1,
  value,
  onChange,
  onReset,
  isDefault,
  disabled = false,
}: {
  label: string
  valueLabel: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (value: number) => void
  onReset: () => void
  isDefault: boolean
  disabled?: boolean
}) {
  return (
    <div className={`slider-field${disabled ? ' is-disabled' : ''}`}>
      <div className="slider-field-header">
        <span>{label}</span>
        <div className="slider-field-meta">
          <em>{valueLabel}</em>
          <button
            type="button"
            className="btn ghost slider-reset"
            onClick={onReset}
            disabled={disabled || isDefault}
            title={`Reset ${label.toLowerCase()} to default`}
          >
            <BtnLabel>Reset</BtnLabel>
          </button>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function StartPauseButton({
  isRunning,
  status,
  onStart,
  onPause,
  className = 'btn primary start-btn',
}: {
  isRunning: boolean
  status: SpeechStatus
  onStart: () => void
  onPause: () => void
  className?: string
}) {
  if (!isRunning || status !== 'listening') {
    return (
      <button
        type="button"
        className={className}
        onClick={onStart}
        title="Start (Space)"
      >
        {status === 'loading' ? <BtnLabel>Loading…</BtnLabel> : <BtnLabel>Start</BtnLabel>}
      </button>
    )
  }
  return (
    <button
      type="button"
      className={className}
      onClick={onPause}
      title="Pause (Space)"
    >
      <BtnLabel>Pause</BtnLabel>
    </button>
  )
}

function RecordButton({
  recordingActive,
  recordingBusy,
  hasRecordingTake,
  recordingSupported,
  onToggleRecording,
  className,
}: {
  recordingActive: boolean
  recordingBusy: boolean
  hasRecordingTake: boolean
  recordingSupported: boolean
  onToggleRecording: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={`btn record-btn${recordingActive ? ' active is-recording' : ''}${hasRecordingTake && !recordingActive ? ' has-take' : ''}${recordingBusy ? ' is-busy' : ''}${className ? ` ${className}` : ''}`}
      onClick={onToggleRecording}
      disabled={!recordingSupported || recordingBusy}
      title={
        !recordingSupported
          ? 'Video recording is not supported in this browser'
          : recordingBusy
            ? recordingActive
              ? 'Saving recording…'
              : 'Starting camera…'
            : recordingActive
              ? 'Stop camera recording (V)'
              : hasRecordingTake
                ? 'A take is kept — tap to record a new one (V)'
                : 'Start camera recording (V) — independent of Start/Pause'
      }
      aria-pressed={recordingActive}
    >
      <span className="record-btn-dot" aria-hidden />
      <BtnLabel>
        {recordingBusy
          ? recordingActive
            ? 'Saving…'
            : 'Starting…'
          : recordingActive
            ? 'Stop'
            : 'Record'}
      </BtnLabel>
    </button>
  )
}

export function Controls({
  isRunning,
  status,
  alignState,
  confidence,
  modelReady,
  devices,
  deviceId,
  settings,
  editorOpen,
  settingsOpen,
  howToOpen,
  progress,
  wpm,
  isFullscreen,
  compactChrome = false,
  recordingActive,
  recordingBusy = false,
  hasRecordingTake = false,
  recordingSupported,
  facingMode,
  onStart,
  onPause,
  onReset,
  onPreload,
  onDeviceChange,
  onToggleEditor,
  onToggleSettings,
  onToggleHowTo,
  onToggleFullscreen,
  onToggleRecording,
  onReviewTake,
  onFacingModeChange,
  onNudge,
  onNudgeSentence,
  onUpdateSettings,
  onResetSettings,
}: ControlsProps) {
  const [resetSettingsOpen, setResetSettingsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('script')
  const mobileChromeRef = useRef<HTMLDivElement>(null)
  const isLiveScroll = status === 'listening' && alignState === 'tracking'
  const isHoldingOffScript = status === 'listening' && alignState === 'off_script'
  const scrollMode: 'live' | 'paused' = isLiveScroll ? 'live' : 'paused'

  const statusLabel = isLiveScroll
    ? recordingActive
      ? 'Live scroll · recording'
      : 'Live scroll'
    : recordingActive
      ? status === 'listening'
        ? 'Listening · recording'
        : 'Recording'
      : isHoldingOffScript
        ? 'Paused — off script'
        : status === 'loading'
          ? modelReady
            ? 'Starting mic…'
            : 'Loading speech model…'
          : status === 'error'
            ? 'Error'
            : 'Paused'

  const resetSlider = (key: SliderKey) => {
    onUpdateSettings({ [key]: DEFAULT_SETTINGS[key] })
  }

  const s = settings
  const statsEnabled = s.showStats
  const showAnyStat =
    statsEnabled &&
    (s.showProgressBar ||
      s.showPercent ||
      s.showWpm ||
      s.showConfidence ||
      s.showWordsSaid ||
      s.showWordsRemaining ||
      s.showWordsTotal)

  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (e: PointerEvent) => {
      const root = mobileChromeRef.current
      if (!root) return
      if (e.target instanceof Node && !root.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (settingsOpen || editorOpen || howToOpen) {
      setMenuOpen(false)
    }
  }, [settingsOpen, editorOpen, howToOpen])

  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const target = e.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      const idx = SETTINGS_TABS.findIndex((t) => t.id === settingsTab)
      if (idx < 0) return
      const next =
        e.key === 'ArrowRight'
          ? SETTINGS_TABS[(idx + 1) % SETTINGS_TABS.length]
          : SETTINGS_TABS[(idx - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length]
      e.preventDefault()
      setSettingsTab(next.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen, settingsTab])

  const runAndCloseMenu = (fn: () => void) => {
    setMenuOpen(false)
    fn()
  }

  const primaryActions = (
    <>
      <button
        type="button"
        className="btn"
        onClick={() => runAndCloseMenu(onReset)}
        title="Reset to start (R)"
      >
        <BtnLabel>Reset</BtnLabel>
      </button>
      <button
        type="button"
        className={`btn ${editorOpen ? 'active' : ''}`}
        onClick={() => runAndCloseMenu(onToggleEditor)}
        title="Edit script (E)"
      >
        <BtnLabel>Edit</BtnLabel>
      </button>
      <button
        type="button"
        className={`btn ${settingsOpen ? 'active' : ''}`}
        onClick={() => runAndCloseMenu(onToggleSettings)}
        title="Settings (,)"
      >
        <BtnLabel>Settings</BtnLabel>
      </button>
      <button
        type="button"
        className={`btn ${howToOpen ? 'active' : ''}`}
        onClick={() => runAndCloseMenu(onToggleHowTo)}
        title="How to use (?)"
      >
        <BtnLabel>Help</BtnLabel>
      </button>
      <button
        type="button"
        className={`btn icon-label-btn ${settings.mirror ? 'active' : ''}`}
        onClick={() => onUpdateSettings({ mirror: !settings.mirror })}
        title="Script mirror — flip script text only"
        aria-pressed={settings.mirror}
      >
        <IconFlip className="btn-icon" />
        <BtnLabel>Script</BtnLabel>
      </button>
      <button
        type="button"
        className={`btn icon-label-btn ${settings.uiMirror ? 'active' : ''}`}
        onClick={() => onUpdateSettings({ uiMirror: !settings.uiMirror })}
        title="UI mirror — flip icons and text only (layout stays put)"
        aria-pressed={settings.uiMirror}
      >
        <IconFlip className="btn-icon" />
        <BtnLabel>UI</BtnLabel>
      </button>
      <button
        type="button"
        className={`btn ${settings.chromeBottom ? 'active' : ''}`}
        onClick={() =>
          onUpdateSettings({ chromeBottom: !settings.chromeBottom })
        }
        title={
          settings.chromeBottom
            ? 'Move controls back to the top'
            : 'Move controls to the bottom for easier reach'
        }
        aria-pressed={settings.chromeBottom}
      >
        <BtnLabel>{settings.chromeBottom ? 'Header' : 'Footer'}</BtnLabel>
      </button>
      <button
        type="button"
        className={`btn ${settings.largeControls ? 'active' : ''}`}
        onClick={() =>
          onUpdateSettings({ largeControls: !settings.largeControls })
        }
        title="Large controls — chunkier UI for iPad / touch"
        aria-pressed={settings.largeControls}
      >
        <BtnLabel>Large</BtnLabel>
      </button>
      <button
        type="button"
        className={`btn ${settings.compactMode ? 'active' : ''}`}
        onClick={() =>
          onUpdateSettings({ compactMode: !settings.compactMode })
        }
        title="Compact mode — sticky Start / Record / menu"
        aria-pressed={settings.compactMode}
      >
        <BtnLabel>Compact</BtnLabel>
      </button>
      <button
        type="button"
        className={`btn ${isFullscreen ? 'active' : ''}`}
        onClick={() => runAndCloseMenu(onToggleFullscreen)}
        title="Fullscreen (F)"
      >
        <BtnLabel>{isFullscreen ? 'Exit' : 'Full'}</BtnLabel>
      </button>
    </>
  )

  const nudgeGroup = (
    <div className="nudge-group" role="group" aria-label="Nudge cursor">
      <button
        type="button"
        className="btn ghost nudge-btn icon-btn"
        onClick={() => onNudgeSentence('up')}
        title="Previous sentence boundary (↑)"
        aria-label="Previous sentence boundary"
      >
        <IconArrowUp className="btn-icon" />
      </button>
      <button
        type="button"
        className="btn ghost nudge-btn icon-btn"
        onClick={() => onNudge(-1)}
        title="Back one word (←)"
        aria-label="Back one word"
      >
        <IconArrowLeft className="btn-icon" />
      </button>
      <button
        type="button"
        className="btn ghost nudge-btn icon-btn"
        onClick={() => onNudge(1)}
        title="Forward one word (→)"
        aria-label="Forward one word"
      >
        <IconArrowRight className="btn-icon" />
      </button>
      <button
        type="button"
        className="btn ghost nudge-btn icon-btn"
        onClick={() => onNudgeSentence('down')}
        title="Next sentence boundary (↓)"
        aria-label="Next sentence boundary"
      >
        <IconArrowDown className="btn-icon" />
      </button>
    </div>
  )

  const statsStrip = (
    <ScriptStats
      progress={progress}
      wpm={wpm}
      confidence={confidence}
      settings={settings}
    />
  )

  const settingsPanel = settingsOpen ? (
    <div
      className={`panel settings-panel${compactChrome ? ' is-compact-sheet' : ''}`}
      role="dialog"
      aria-modal={compactChrome ? true : undefined}
      aria-label="Settings"
    >
      <div className="settings-panel-header">
        <h2>Settings</h2>
        <button
          type="button"
          className="btn ghost icon-btn settings-close-btn"
          onClick={onToggleSettings}
          title="Close settings"
          aria-label="Close settings"
        >
          <IconClose className="btn-icon" />
        </button>
      </div>

      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Settings categories"
      >
        {SETTINGS_TABS.map((tab) => {
          const selected = settingsTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`settings-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`settings-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={`settings-tab${selected ? ' is-active' : ''}`}
              onClick={() => setSettingsTab(tab.id)}
            >
              <span className="btn-label">{tab.label}</span>
            </button>
          )
        })}
      </div>

      <div className="settings-panel-body">
        <div
          className="settings-grid"
          role="tabpanel"
          id={`settings-panel-${settingsTab}`}
          aria-labelledby={`settings-tab-${settingsTab}`}
        >
          {settingsTab === 'script' ? (
            <>
              <SliderField
                label="Font size"
                valueLabel={`${settings.fontSize}px`}
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                value={settings.fontSize}
                onChange={(fontSize) => onUpdateSettings({ fontSize })}
                onReset={() => resetSlider('fontSize')}
                isDefault={settings.fontSize === DEFAULT_SETTINGS.fontSize}
              />
              <SliderField
                label="Line width"
                valueLabel={`${settings.lineWidth}ch`}
                min={LINE_WIDTH_MIN}
                max={LINE_WIDTH_MAX}
                value={settings.lineWidth}
                onChange={(lineWidth) => onUpdateSettings({ lineWidth })}
                onReset={() => resetSlider('lineWidth')}
                isDefault={settings.lineWidth === DEFAULT_SETTINGS.lineWidth}
              />
              <SliderField
                label="Line height"
                valueLabel={
                  settings.lineHeight <= 0
                    ? 'Auto'
                    : settings.lineHeight.toFixed(2)
                }
                min={Math.round(LINE_HEIGHT_MIN * 100)}
                max={Math.round(LINE_HEIGHT_MAX * 100)}
                step={5}
                value={
                  settings.lineHeight <= 0
                    ? 145
                    : Math.round(settings.lineHeight * 100)
                }
                onChange={(v) =>
                  onUpdateSettings({ lineHeight: v / 100 })
                }
                onReset={() => onUpdateSettings({ lineHeight: 0 })}
                isDefault={settings.lineHeight === DEFAULT_SETTINGS.lineHeight}
              />
              <SliderField
                label="Past word dim"
                valueLabel={`${settings.pastWordDim}%`}
                min={PAST_WORD_DIM_MIN}
                max={PAST_WORD_DIM_MAX}
                value={settings.pastWordDim}
                onChange={(pastWordDim) => onUpdateSettings({ pastWordDim })}
                onReset={() => resetSlider('pastWordDim')}
                isDefault={
                  settings.pastWordDim === DEFAULT_SETTINGS.pastWordDim
                }
                disabled={!settings.showCursorHighlight}
              />
              <p className="settings-hint settings-hint-span">
                On a small iPhone, try One word or Two words mode for giant
                cues, or a large font (80–128px) with a narrow line width
                (8–16ch) in full script mode. Line height Auto scales with font
                size; Past word dim needs Highlight cursor on.
              </p>
              <label className="settings-mic">
                <span>Display mode</span>
                <select
                  value={settings.displayMode}
                  onChange={(e) =>
                    onUpdateSettings({
                      displayMode: e.target.value as DisplayMode,
                    })
                  }
                >
                  <option value="script">Full script</option>
                  <option value="one_word">One word (prev + next faded)</option>
                  <option value="two_word">Two words (said + next)</option>
                </select>
              </label>
              <p className="settings-hint settings-hint-span">
                One-word mode shows the current cue giant, with previous and
                next small and faded. Two-word shows said + next. Font size
                still scales them. Line width only applies to full script mode.
              </p>
              <label className="settings-mic">
                <span>Cursor position</span>
                <select
                  value={settings.scrollAnchor}
                  onChange={(e) =>
                    onUpdateSettings({
                      scrollAnchor: e.target.value as ScrollAnchorMode,
                    })
                  }
                >
                  <option value="top">Keep at top</option>
                  <option value="middle">Keep in middle</option>
                  <option value="hybrid">Hybrid (top, then center)</option>
                </select>
              </label>
              <p className="settings-hint settings-hint-span">
                On compact / small mobile layouts, Hybrid is treated as Keep at
                top so the cue stays readable near the top of the screen.
              </p>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.showCursorHighlight}
                  onChange={(e) =>
                    onUpdateSettings({ showCursorHighlight: e.target.checked })
                  }
                />
                <span>Highlight cursor</span>
              </label>
              <SliderField
                label="Cursor lead"
                valueLabel={
                  !settings.showCursorHighlight
                    ? 'Highlight off'
                    : settings.cursorOffset === 0
                      ? 'On spoken word'
                      : `${settings.cursorOffset} word${settings.cursorOffset === 1 ? '' : 's'} ahead`
                }
                min={0}
                max={12}
                value={settings.cursorOffset}
                onChange={(cursorOffset) => onUpdateSettings({ cursorOffset })}
                onReset={() => resetSlider('cursorOffset')}
                isDefault={
                  settings.cursorOffset === DEFAULT_SETTINGS.cursorOffset
                }
                disabled={!settings.showCursorHighlight}
              />
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.mirror}
                  onChange={(e) =>
                    onUpdateSettings({ mirror: e.target.checked })
                  }
                />
                <span>Script mirror</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.boldText}
                  onChange={(e) =>
                    onUpdateSettings({ boldText: e.target.checked })
                  }
                />
                <span>Bold text</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.preserveBreaks}
                  onChange={(e) =>
                    onUpdateSettings({ preserveBreaks: e.target.checked })
                  }
                />
                <span>Keep line &amp; paragraph breaks</span>
              </label>
              <label className="settings-mic">
                <span>After each full stop (.)</span>
                <select
                  value={settings.sentenceBreak}
                  onChange={(e) =>
                    onUpdateSettings({
                      sentenceBreak: e.target.value as 'off' | 'tab' | 'line',
                    })
                  }
                >
                  <option value="off">No change</option>
                  <option value="tab">Insert tab space</option>
                  <option value="line">Insert line break</option>
                </select>
              </label>
            </>
          ) : null}

          {settingsTab === 'look' ? (
            <>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.uiMirror}
                  onChange={(e) =>
                    onUpdateSettings({ uiMirror: e.target.checked })
                  }
                />
                <span>UI mirror (text/icons)</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.chromeBottom}
                  onChange={(e) =>
                    onUpdateSettings({ chromeBottom: e.target.checked })
                  }
                />
                <span>Controls at bottom</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.largeControls}
                  onChange={(e) =>
                    onUpdateSettings({ largeControls: e.target.checked })
                  }
                />
                <span>Large controls (iPad)</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.compactMode}
                  onChange={(e) =>
                    onUpdateSettings({ compactMode: e.target.checked })
                  }
                />
                <span>Compact mode</span>
              </label>
              <p className="settings-hint settings-hint-span">
                Sticky Start / Record / menu chrome. Also turns on automatically
                on small screens and phone landscape.
              </p>
              <label
                className={`toggle${settings.oledMode || compactChrome ? ' is-disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={settings.darkMode || compactChrome}
                  disabled={settings.oledMode || compactChrome}
                  onChange={(e) =>
                    onUpdateSettings({ darkMode: e.target.checked })
                  }
                />
                <span>Dark mode</span>
              </label>
              <label className={`toggle${compactChrome ? ' is-disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={settings.oledMode || compactChrome}
                  disabled={compactChrome}
                  onChange={(e) =>
                    onUpdateSettings({ oledMode: e.target.checked })
                  }
                />
                <span>OLED black mode</span>
              </label>
              {compactChrome ? (
                <p className="settings-hint settings-hint-span">
                  Compact / mobile layout always uses OLED pure black.
                </p>
              ) : null}
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.wakeLock}
                  onChange={(e) =>
                    onUpdateSettings({ wakeLock: e.target.checked })
                  }
                />
                <span>Keep screen awake while following</span>
              </label>
              <p className="settings-hint settings-hint-span">
                Uses the browser Wake Lock API while voice-follow is listening,
                so the display does not dim mid-take.
              </p>
            </>
          ) : null}

          {settingsTab === 'speech' ? (
            <>
              <SliderField
                label="Match confidence"
                valueLabel={`${Math.round(settings.confidenceThreshold * 100)}%`}
                min={40}
                max={85}
                value={Math.round(settings.confidenceThreshold * 100)}
                onChange={(v) =>
                  onUpdateSettings({ confidenceThreshold: v / 100 })
                }
                onReset={() => resetSlider('confidenceThreshold')}
                isDefault={
                  settings.confidenceThreshold ===
                  DEFAULT_SETTINGS.confidenceThreshold
                }
              />
              <SliderField
                label="Scroll sensitivity"
                valueLabel={`${settings.scrollSensitivity.toFixed(2)}×`}
                min={50}
                max={180}
                value={Math.round(settings.scrollSensitivity * 100)}
                onChange={(v) =>
                  onUpdateSettings({ scrollSensitivity: v / 100 })
                }
                onReset={() => resetSlider('scrollSensitivity')}
                isDefault={
                  settings.scrollSensitivity ===
                  DEFAULT_SETTINGS.scrollSensitivity
                }
              />
              <SliderField
                label="Spoken window"
                valueLabel={`${settings.spokenWindow} words`}
                min={SPOKEN_WINDOW_MIN}
                max={SPOKEN_WINDOW_MAX}
                value={settings.spokenWindow}
                onChange={(spokenWindow) => onUpdateSettings({ spokenWindow })}
                onReset={() => resetSlider('spokenWindow')}
                isDefault={
                  settings.spokenWindow === DEFAULT_SETTINGS.spokenWindow
                }
              />
              <SliderField
                label="Backtrack window"
                valueLabel={`${settings.backtrackWordCount} words`}
                min={BACKTRACK_MIN}
                max={BACKTRACK_MAX}
                value={settings.backtrackWordCount}
                onChange={(backtrackWordCount) =>
                  onUpdateSettings({ backtrackWordCount })
                }
                onReset={() => resetSlider('backtrackWordCount')}
                isDefault={
                  settings.backtrackWordCount ===
                  DEFAULT_SETTINGS.backtrackWordCount
                }
                disabled={!settings.allowJumpBack}
              />
              <p className="settings-hint settings-hint-span">
                Spoken window is how many recent script words the matcher looks
                ahead/behind for. Backtrack window (Jump back mode) is how far
                you can re-match earlier words after a stumble.
              </p>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.allowJumpBack}
                  onChange={(e) =>
                    onUpdateSettings({ allowJumpBack: e.target.checked })
                  }
                />
                <span>Jump back mode</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.askRecordOnStart}
                  onChange={(e) =>
                    onUpdateSettings({ askRecordOnStart: e.target.checked })
                  }
                />
                <span>Ask to record when starting</span>
              </label>
              <p className="settings-hint settings-hint-span">
                When on, Start asks whether to begin camera recording too, or
                only follow the script.
              </p>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.recordStartsFollow}
                  onChange={(e) =>
                    onUpdateSettings({ recordStartsFollow: e.target.checked })
                  }
                />
                <span>Record also starts script follow</span>
              </label>
              <p className="settings-hint settings-hint-span">
                When on, pressing Record (or choosing record on Start) begins
                voice-follow as well. When off, Record only captures video —
                press Start separately to follow the script.
              </p>
              <label className="settings-mic">
                <span>Microphone</span>
                <select
                  value={deviceId ?? ''}
                  onChange={(e) => onDeviceChange(e.target.value)}
                >
                  {devices.length === 0 && (
                    <option value="">Default microphone</option>
                  )}
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="settings-hint settings-hint-span">
                The same microphone can power both voice-follow and the video
                soundtrack. Use the Model tab to preload or reload the speech
                model.
              </p>
            </>
          ) : null}

          {settingsTab === 'camera' ? (
            <>
              <label className="settings-mic">
                <span>Camera (when Record is on)</span>
                <select
                  value={facingMode}
                  onChange={(e) =>
                    onFacingModeChange(e.target.value as FacingMode)
                  }
                  disabled={
                    !recordingSupported || recordingActive || recordingBusy
                  }
                >
                  <option value="user">Front camera</option>
                  <option value="environment">Back camera</option>
                </select>
              </label>
              <label className="settings-mic">
                <span>Camera preview side</span>
                <select
                  value={settings.cameraPreviewSide}
                  onChange={(e) =>
                    onUpdateSettings({
                      cameraPreviewSide: e.target.value as 'left' | 'right',
                    })
                  }
                >
                  <option value="left">Left of script</option>
                  <option value="right">Right of script</option>
                </select>
              </label>
              <label className="settings-mic">
                <span>Camera preview size</span>
                <select
                  value={settings.cameraPreviewSize}
                  onChange={(e) =>
                    onUpdateSettings({
                      cameraPreviewSize: e.target.value as
                        | 'quarter'
                        | 'half'
                        | 'three_quarters'
                        | 'fullscreen',
                    })
                  }
                >
                  <option value="quarter">Quarter of screen</option>
                  <option value="half">Half of screen</option>
                  <option value="three_quarters">Three quarters</option>
                  <option value="fullscreen">
                    Full screen (under script)
                  </option>
                </select>
              </label>
              {settings.cameraPreviewSize === 'fullscreen' ? (
                <SliderField
                  label="Camera preview brightness"
                  valueLabel={`${settings.cameraPreviewBrightness}%`}
                  min={1}
                  max={100}
                  value={settings.cameraPreviewBrightness}
                  onChange={(cameraPreviewBrightness) =>
                    onUpdateSettings({ cameraPreviewBrightness })
                  }
                  onReset={() => resetSlider('cameraPreviewBrightness')}
                  isDefault={
                    settings.cameraPreviewBrightness ===
                    DEFAULT_SETTINGS.cameraPreviewBrightness
                  }
                />
              ) : null}
              <label className="settings-mic">
                <span>Preview mirror</span>
                <select
                  value={settings.cameraPreviewMirror}
                  onChange={(e) =>
                    onUpdateSettings({
                      cameraPreviewMirror: e.target
                        .value as CameraPreviewMirrorMode,
                    })
                  }
                >
                  <option value="auto">Auto (mirror front camera)</option>
                  <option value="on">Always mirror</option>
                  <option value="off">Never mirror</option>
                </select>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.cameraPreviewFill}
                  onChange={(e) =>
                    onUpdateSettings({ cameraPreviewFill: e.target.checked })
                  }
                />
                <span>Fill preview column</span>
              </label>
              <p className="settings-hint settings-hint-span">
                Off (default): camera keeps the recording aspect ratio at full
                column width, with progress stats underneath. On: camera
                stretches to fill the whole preview column. Full screen size
                fills under the script; use brightness to control the dark tint.
                Preview mirror Auto flips the front camera like a selfie view.
              </p>
              <label className="settings-mic">
                <span>Recording resolution</span>
                <select
                  value={settings.videoResolution}
                  onChange={(e) =>
                    onUpdateSettings({
                      videoResolution: e.target.value as VideoResolution,
                    })
                  }
                  disabled={
                    !recordingSupported || recordingActive || recordingBusy
                  }
                >
                  {VIDEO_RESOLUTION_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="settings-hint settings-hint-span">
                Record / Stop is independent of Start / Pause. While recording,
                the camera preview sits beside the script — choose side and
                width above. Default resolution is full sensor 16:9; change it
                before the next Record.
              </p>
            </>
          ) : null}

          {settingsTab === 'stats' ? (
            <>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.showStats}
                  onChange={(e) =>
                    onUpdateSettings({ showStats: e.target.checked })
                  }
                />
                <span>Show stats</span>
              </label>
              <label
                className={`toggle${!settings.showStats ? ' is-disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={settings.showProgressBar}
                  disabled={!settings.showStats}
                  onChange={(e) =>
                    onUpdateSettings({ showProgressBar: e.target.checked })
                  }
                />
                <span>Progress bar</span>
              </label>
              <label
                className={`toggle${!settings.showStats ? ' is-disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={settings.showPercent}
                  disabled={!settings.showStats}
                  onChange={(e) =>
                    onUpdateSettings({ showPercent: e.target.checked })
                  }
                />
                <span>Percentage</span>
              </label>
              <label
                className={`toggle${!settings.showStats ? ' is-disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={settings.showWpm}
                  disabled={!settings.showStats}
                  onChange={(e) =>
                    onUpdateSettings({ showWpm: e.target.checked })
                  }
                />
                <span>Words per minute</span>
              </label>
              <label
                className={`toggle${!settings.showStats ? ' is-disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={settings.showConfidence}
                  disabled={!settings.showStats}
                  onChange={(e) =>
                    onUpdateSettings({ showConfidence: e.target.checked })
                  }
                />
                <span>Match confidence</span>
              </label>
              <label
                className={`toggle${!settings.showStats ? ' is-disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={settings.showWordsSaid}
                  disabled={!settings.showStats}
                  onChange={(e) =>
                    onUpdateSettings({ showWordsSaid: e.target.checked })
                  }
                />
                <span>Words said</span>
              </label>
              <label
                className={`toggle${!settings.showStats ? ' is-disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={settings.showWordsRemaining}
                  disabled={!settings.showStats}
                  onChange={(e) =>
                    onUpdateSettings({ showWordsRemaining: e.target.checked })
                  }
                />
                <span>Words left</span>
              </label>
              <label
                className={`toggle${!settings.showStats ? ' is-disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={settings.showWordsTotal}
                  disabled={!settings.showStats}
                  onChange={(e) =>
                    onUpdateSettings({ showWordsTotal: e.target.checked })
                  }
                />
                <span>Words total</span>
              </label>
            </>
          ) : null}

          {settingsTab === 'model' ? (
            <>
              <p className="settings-hint settings-hint-span">
                Download or refresh the on-device speech model, or restore every
                setting to its default. Your script and microphone choice are
                kept when you reset.
              </p>
              <div className="settings-model-actions">
                <button
                  type="button"
                  className="btn settings-preload"
                  onClick={onPreload}
                >
                  <BtnLabel>
                    {modelReady ? 'Reload model' : 'Preload model'}
                  </BtnLabel>
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setResetSettingsOpen(true)}
                >
                  <BtnLabel>Reset settings</BtnLabel>
                </button>
              </div>
              <p className="confidence-readout settings-hint-span">
                Live confidence: {(confidence * 100).toFixed(0)}%
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  ) : null

  return (
    <header className="controls" data-menu-open={menuOpen ? 'true' : undefined}>
      {/* Desktop / tablet header chrome */}
      <div className="controls-desktop">
        <div className="controls-main">
          <div className="controls-start">
            <StartPauseButton
              isRunning={isRunning}
              status={status}
              onStart={onStart}
              onPause={onPause}
            />
            <RecordButton
              recordingActive={recordingActive}
              recordingBusy={recordingBusy}
              hasRecordingTake={hasRecordingTake}
              recordingSupported={recordingSupported}
              onToggleRecording={onToggleRecording}
            />
            {hasRecordingTake && !recordingActive && onReviewTake ? (
              <button
                type="button"
                className="btn record-take-btn"
                onClick={onReviewTake}
                disabled={recordingBusy}
                title="Review the kept recording"
              >
                  <BtnLabel>Take</BtnLabel>
                </button>
            ) : null}
          </div>

          <div className="controls-rest">
            <div className="controls-top">
              <div className="brand">
                <span className="brand-mark" aria-hidden />
                <h1 className="brand-name">Teleprompter Flow</h1>
              </div>
              <div
                className={`mode-badge mode-${scrollMode}${isHoldingOffScript ? ' is-holding' : ''}`}
                role="status"
                aria-live="polite"
              >
                <span className="mode-dot" />
                <span className="mode-label">{statusLabel}</span>
              </div>
              <div className="control-row primary-actions">
                {primaryActions}
              </div>
            </div>

            <div className="control-row secondary-actions">
              {statsStrip}
              {nudgeGroup}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: compact sticky cluster — script wraps around via CSS float */}
      <div className="controls-mobile" ref={mobileChromeRef}>
        <div className="mobile-sticky">
          <StartPauseButton
            isRunning={isRunning}
            status={status}
            onStart={onStart}
            onPause={onPause}
            className="btn primary start-btn mobile-chrome-btn"
          />
          <RecordButton
            recordingActive={recordingActive}
            recordingBusy={recordingBusy}
            hasRecordingTake={hasRecordingTake}
            recordingSupported={recordingSupported}
            onToggleRecording={onToggleRecording}
            className="mobile-chrome-btn"
          />
          <button
            type="button"
            className={`btn icon-btn mobile-menu-btn mobile-chrome-btn${menuOpen ? ' active' : ''}`}
            onClick={() => setMenuOpen((v) => !v)}
            title={menuOpen ? 'Close menu' : 'Open menu'}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-controls-menu"
          >
            {menuOpen ? (
              <IconClose className="btn-icon" />
            ) : (
              <IconMenu className="btn-icon" />
            )}
          </button>
        </div>

        {menuOpen && (
          <div
            id="mobile-controls-menu"
            className="mobile-menu"
            role="menu"
            aria-label="Teleprompter controls"
          >
            <div
              className={`mode-badge mode-${scrollMode}${isHoldingOffScript ? ' is-holding' : ''}`}
              role="status"
              aria-live="polite"
            >
              <span className="mode-dot" />
              <span className="mode-label">{statusLabel}</span>
            </div>

            <div className="mobile-menu-actions" role="group">
              {hasRecordingTake && !recordingActive && onReviewTake ? (
                <button
                  type="button"
                  className="btn record-take-btn"
                  onClick={() => runAndCloseMenu(onReviewTake)}
                  disabled={recordingBusy}
                  title="Review the kept recording"
                >
                  <BtnLabel>Take</BtnLabel>
                </button>
              ) : null}
              {primaryActions}
            </div>

            {showAnyStat ? (
              <div className="mobile-menu-stats">{statsStrip}</div>
            ) : null}

            <div className="mobile-menu-nudge">{nudgeGroup}</div>
          </div>
        )}
      </div>

      {status === 'loading' && !modelReady && (
        <div className="loading-bar" aria-live="polite">
          <div className="loading-bar-fill" />
          <span>Downloading & caching the speech model (one-time)…</span>
        </div>
      )}

      {compactChrome && settingsPanel
        ? createPortal(settingsPanel, document.body)
        : settingsPanel}

      <ConfirmModal
        open={resetSettingsOpen}
        title="Reset settings?"
        message="Restore every setting to its default value. Your script and microphone choice are kept."
        confirmLabel="Reset settings"
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => setResetSettingsOpen(false)}
        onConfirm={() => {
          onResetSettings()
          setResetSettingsOpen(false)
        }}
      />
    </header>
  )
}
