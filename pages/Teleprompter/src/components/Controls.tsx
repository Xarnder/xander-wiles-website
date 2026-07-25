import { useState } from 'react'
import type { MicDevice } from '../hooks/useMicDevices'
import {
  DEFAULT_SETTINGS,
  type TeleprompterSettings,
} from '../hooks/useTeleprompter'
import type { SpeechStatus } from '../asr/useSpeechStream'
import type { AlignmentState } from '../alignment/AlignmentEngine'
import { ConfirmModal } from './Modal'
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
} from './icons'

interface ControlsProps {
  isRunning: boolean
  status: SpeechStatus
  alignState: AlignmentState
  confidence: number
  modelReady: boolean
  errorMessage: string | null
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
  onStart: () => void
  onPause: () => void
  onReset: () => void
  onPreload: () => void
  onDeviceChange: (id: string) => void
  onToggleEditor: () => void
  onToggleSettings: () => void
  onToggleHowTo: () => void
  onToggleFullscreen: () => void
  onNudge: (delta: number) => void
  onNudgeSentence: (direction: 'up' | 'down') => void
  onUpdateSettings: (patch: Partial<TeleprompterSettings>) => void
  onResetSettings: () => void
}

type SliderKey =
  | 'fontSize'
  | 'lineWidth'
  | 'confidenceThreshold'
  | 'scrollSensitivity'
  | 'cursorOffset'

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
            Reset
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

export function Controls({
  isRunning,
  status,
  alignState,
  confidence,
  modelReady,
  errorMessage,
  devices,
  deviceId,
  settings,
  editorOpen,
  settingsOpen,
  howToOpen,
  progress,
  wpm,
  isFullscreen,
  onStart,
  onPause,
  onReset,
  onPreload,
  onDeviceChange,
  onToggleEditor,
  onToggleSettings,
  onToggleHowTo,
  onToggleFullscreen,
  onNudge,
  onNudgeSentence,
  onUpdateSettings,
  onResetSettings,
}: ControlsProps) {
  const [resetSettingsOpen, setResetSettingsOpen] = useState(false)
  const isLiveScroll = status === 'listening' && alignState === 'tracking'
  const isHoldingOffScript = status === 'listening' && alignState === 'off_script'
  const scrollMode: 'live' | 'paused' = isLiveScroll ? 'live' : 'paused'

  const statusLabel = isLiveScroll
    ? 'Live scroll'
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
      s.showWordsSaid ||
      s.showWordsRemaining ||
      s.showWordsTotal)

  return (
    <header className="controls">
      <div className="controls-main">
        <div className="controls-start">
          {!isRunning || status !== 'listening' ? (
            <button
              type="button"
              className="btn primary start-btn"
              onClick={onStart}
              title="Start (Space)"
            >
              {status === 'loading' ? 'Loading…' : 'Start'}
            </button>
          ) : (
            <button
              type="button"
              className="btn primary start-btn"
              onClick={onPause}
              title="Pause (Space)"
            >
              Pause
            </button>
          )}
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
              <button
                type="button"
                className="btn"
                onClick={onReset}
                title="Reset to start (R)"
              >
                Reset
              </button>
              <button
                type="button"
                className={`btn ${editorOpen ? 'active' : ''}`}
                onClick={onToggleEditor}
                title="Edit script (E)"
              >
                Edit
              </button>
              <button
                type="button"
                className={`btn ${settingsOpen ? 'active' : ''}`}
                onClick={onToggleSettings}
                title="Settings (,)"
              >
                Settings
              </button>
              <button
                type="button"
                className={`btn ${howToOpen ? 'active' : ''}`}
                onClick={onToggleHowTo}
                title="How to use (?)"
              >
                Help
              </button>
              <button
                type="button"
                className={`btn ${settings.mirror ? 'active' : ''}`}
                onClick={() => onUpdateSettings({ mirror: !settings.mirror })}
                title="Script mirror — flip script text only"
                aria-pressed={settings.mirror}
              >
                Script ↔
              </button>
              <button
                type="button"
                className={`btn ${settings.uiMirror ? 'active' : ''}`}
                onClick={() =>
                  onUpdateSettings({ uiMirror: !settings.uiMirror })
                }
                title="UI mirror — flip the whole interface horizontally"
                aria-pressed={settings.uiMirror}
              >
                UI ↔
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
                {settings.chromeBottom ? 'Header' : 'Footer'}
              </button>
              <button
                type="button"
                className={`btn ${isFullscreen ? 'active' : ''}`}
                onClick={onToggleFullscreen}
                title="Fullscreen (F)"
              >
                {isFullscreen ? 'Exit' : 'Full'}
              </button>
            </div>
          </div>

          <div className="control-row secondary-actions">
            {showAnyStat ? (
              <div className="stats-strip" aria-live="polite">
                {s.showProgressBar && (
                  <div
                    className="progress-readout"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress.percent}
                    aria-label="Script progress"
                  >
                    <div className="progress-meter" aria-hidden>
                      <div
                        className="progress-meter-fill"
                        style={{ width: `${progress.fillPercent}%` }}
                      />
                      <div className="progress-segments">
                        {Array.from({ length: 8 }, (_, i) => {
                          const eighth = i + 1
                          const isQuarter = eighth % 2 === 0
                          return (
                            <span
                              key={eighth}
                              className={`progress-segment ${isQuarter ? 'is-quarter' : 'is-eighth'}`}
                            />
                          )
                        })}
                      </div>
                      <div className="progress-ticks">
                        {[1, 2, 3, 4, 5, 6, 7].map((eighth) => (
                          <span
                            key={eighth}
                            className={`progress-tick ${eighth % 2 === 0 ? 'is-quarter' : 'is-eighth'}`}
                            style={{ left: `${(eighth / 8) * 100}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="stat-chips">
                  {s.showPercent && (
                    <span className="stat-chip" title="Progress through script">
                      <em>
                        {progress.total === 0 ? '—' : `${progress.percent}%`}
                      </em>
                      <span>done</span>
                    </span>
                  )}
                  {s.showWpm && (
                    <span
                      className="stat-chip"
                      title="Words per minute (last sentence)"
                    >
                      <em>{wpm == null ? '—' : wpm}</em>
                      <span>wpm</span>
                    </span>
                  )}
                  {s.showWordsSaid && (
                    <span className="stat-chip" title="Words already passed">
                      <em>{progress.said}</em>
                      <span>said</span>
                    </span>
                  )}
                  {s.showWordsRemaining && (
                    <span className="stat-chip" title="Words still ahead">
                      <em>{progress.remaining}</em>
                      <span>left</span>
                    </span>
                  )}
                  {s.showWordsTotal && (
                    <span className="stat-chip" title="Total words in script">
                      <em>{progress.total}</em>
                      <span>total</span>
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="stats-strip is-empty" aria-hidden />
            )}
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
          </div>
        </div>
      </div>

      {errorMessage && (
        <p className="error-banner" role="alert">
          {errorMessage}
        </p>
      )}

      {status === 'loading' && !modelReady && (
        <div className="loading-bar" aria-live="polite">
          <div className="loading-bar-fill" />
          <span>Downloading & caching the speech model (one-time)…</span>
        </div>
      )}

      {settingsOpen && (
        <div className="panel settings-panel glass-panel">
          <div className="settings-grid">
            <SliderField
              label="Font size"
              valueLabel={`${settings.fontSize}px`}
              min={22}
              max={64}
              value={settings.fontSize}
              onChange={(fontSize) => onUpdateSettings({ fontSize })}
              onReset={() => resetSlider('fontSize')}
              isDefault={settings.fontSize === DEFAULT_SETTINGS.fontSize}
            />
            <SliderField
              label="Line width"
              valueLabel={`${settings.lineWidth}ch`}
              min={24}
              max={140}
              value={settings.lineWidth}
              onChange={(lineWidth) => onUpdateSettings({ lineWidth })}
              onReset={() => resetSlider('lineWidth')}
              isDefault={settings.lineWidth === DEFAULT_SETTINGS.lineWidth}
            />
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
                settings.scrollSensitivity === DEFAULT_SETTINGS.scrollSensitivity
              }
            />
            <label className="settings-mic">
              <span>Cursor position</span>
              <select
                value={settings.scrollAnchor}
                onChange={(e) =>
                  onUpdateSettings({
                    scrollAnchor: e.target.value as
                      | 'top'
                      | 'middle'
                      | 'hybrid',
                  })
                }
              >
                <option value="top">Keep at top</option>
                <option value="middle">Keep in middle</option>
                <option value="hybrid">Hybrid (top → middle)</option>
              </select>
            </label>
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
              isDefault={settings.cursorOffset === DEFAULT_SETTINGS.cursorOffset}
              disabled={!settings.showCursorHighlight}
            />
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.mirror}
                onChange={(e) => onUpdateSettings({ mirror: e.target.checked })}
              />
              <span>Script mirror</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.uiMirror}
                onChange={(e) =>
                  onUpdateSettings({ uiMirror: e.target.checked })
                }
              />
              <span>UI mirror</span>
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
            <label className={`toggle${settings.oledMode ? ' is-disabled' : ''}`}>
              <input
                type="checkbox"
                checked={settings.darkMode}
                disabled={settings.oledMode}
                onChange={(e) =>
                  onUpdateSettings({ darkMode: e.target.checked })
                }
              />
              <span>Dark mode</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.oledMode}
                onChange={(e) =>
                  onUpdateSettings({ oledMode: e.target.checked })
                }
              />
              <span>OLED black mode</span>
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
                    sentenceBreak: e.target.value as
                      | 'off'
                      | 'tab'
                      | 'line',
                  })
                }
              >
                <option value="off">No change</option>
                <option value="tab">Insert tab space</option>
                <option value="line">Insert line break</option>
              </select>
            </label>
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

            <div className="settings-section-label">Stats</div>
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
            <label className={`toggle${!settings.showStats ? ' is-disabled' : ''}`}>
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
            <label className={`toggle${!settings.showStats ? ' is-disabled' : ''}`}>
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
            <label className={`toggle${!settings.showStats ? ' is-disabled' : ''}`}>
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
            <label className={`toggle${!settings.showStats ? ' is-disabled' : ''}`}>
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
            <label className={`toggle${!settings.showStats ? ' is-disabled' : ''}`}>
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
            <label className={`toggle${!settings.showStats ? ' is-disabled' : ''}`}>
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
          </div>
          <div className="settings-footer">
            <button type="button" className="btn settings-preload" onClick={onPreload}>
              {modelReady ? 'Reload model' : 'Preload model'}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setResetSettingsOpen(true)}
            >
              Reset settings
            </button>
            <p className="confidence-readout">
              Live confidence: {(confidence * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      )}

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
