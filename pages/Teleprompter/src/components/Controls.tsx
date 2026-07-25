import type { MicDevice } from '../hooks/useMicDevices'
import {
  DEFAULT_SETTINGS,
  type TeleprompterSettings,
} from '../hooks/useTeleprompter'
import type { SpeechStatus } from '../asr/useSpeechStream'
import type { AlignmentState } from '../alignment/AlignmentEngine'

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
  onStart: () => void
  onPause: () => void
  onReset: () => void
  onPreload: () => void
  onDeviceChange: (id: string) => void
  onToggleEditor: () => void
  onToggleSettings: () => void
  onToggleHowTo: () => void
  onUpdateSettings: (patch: Partial<TeleprompterSettings>) => void
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
  onStart,
  onPause,
  onReset,
  onPreload,
  onDeviceChange,
  onToggleEditor,
  onToggleSettings,
  onToggleHowTo,
  onUpdateSettings,
}: ControlsProps) {
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

  return (
    <header className="controls">
      <div className="brand-row">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <p className="brand-name">Voice Follow</p>
            <p className="brand-sub">On-device teleprompter</p>
          </div>
        </div>
        <div
          className={`mode-badge mode-${scrollMode}${isHoldingOffScript ? ' is-holding' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span className="mode-dot" />
          <span className="mode-label">{statusLabel}</span>
        </div>
      </div>

      <div className="control-row primary-actions">
        {!isRunning || status !== 'listening' ? (
          <button type="button" className="btn primary" onClick={onStart}>
            {status === 'loading' ? 'Loading…' : 'Start'}
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={onPause}>
            Pause
          </button>
        )}
        <button type="button" className="btn" onClick={onReset}>
          Reset
        </button>
        <button
          type="button"
          className={`btn ${editorOpen ? 'active' : ''}`}
          onClick={onToggleEditor}
        >
          Edit
        </button>
        <button
          type="button"
          className={`btn ${settingsOpen ? 'active' : ''}`}
          onClick={onToggleSettings}
        >
          Settings
        </button>
        <button
          type="button"
          className={`btn ${howToOpen ? 'active' : ''}`}
          onClick={onToggleHowTo}
        >
          How to use
        </button>
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
              <span>Mirror mode</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.darkMode}
                onChange={(e) =>
                  onUpdateSettings({ darkMode: e.target.checked })
                }
              />
              <span>Dark mode</span>
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
          </div>
          <div className="settings-footer">
            <button type="button" className="btn settings-preload" onClick={onPreload}>
              {modelReady ? 'Reload model' : 'Preload model'}
            </button>
            <p className="confidence-readout">
              Live confidence: {(confidence * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      )}
    </header>
  )
}
