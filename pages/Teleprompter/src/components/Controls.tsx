import type { MicDevice } from '../hooks/useMicDevices'
import type { TeleprompterSettings } from '../hooks/useTeleprompter'
import type { SpeechStatus } from '../asr/useSpeechStream'
import type { AlignmentState } from '../alignment/AlignmentEngine'

interface ControlsProps {
  isRunning: boolean
  status: SpeechStatus
  alignState: AlignmentState
  confidence: number
  modelReady: boolean
  errorMessage: string | null
  partialTranscript: string
  devices: MicDevice[]
  deviceId: string | null
  settings: TeleprompterSettings
  editorOpen: boolean
  settingsOpen: boolean
  onStart: () => void
  onPause: () => void
  onReset: () => void
  onPreload: () => void
  onDeviceChange: (id: string) => void
  onToggleEditor: () => void
  onToggleSettings: () => void
  onUpdateSettings: (patch: Partial<TeleprompterSettings>) => void
}

export function Controls({
  isRunning,
  status,
  alignState,
  confidence,
  modelReady,
  errorMessage,
  partialTranscript,
  devices,
  deviceId,
  settings,
  editorOpen,
  settingsOpen,
  onStart,
  onPause,
  onReset,
  onPreload,
  onDeviceChange,
  onToggleEditor,
  onToggleSettings,
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
        <div className="panel settings-panel">
          <div className="settings-grid">
            <label>
              <span>Font size</span>
              <input
                type="range"
                min={22}
                max={64}
                value={settings.fontSize}
                onChange={(e) =>
                  onUpdateSettings({ fontSize: Number(e.target.value) })
                }
              />
              <em>{settings.fontSize}px</em>
            </label>
            <label>
              <span>Line width</span>
              <input
                type="range"
                min={24}
                max={56}
                value={settings.lineWidth}
                onChange={(e) =>
                  onUpdateSettings({ lineWidth: Number(e.target.value) })
                }
              />
              <em>{settings.lineWidth}ch</em>
            </label>
            <label>
              <span>Match confidence</span>
              <input
                type="range"
                min={40}
                max={85}
                value={Math.round(settings.confidenceThreshold * 100)}
                onChange={(e) =>
                  onUpdateSettings({
                    confidenceThreshold: Number(e.target.value) / 100,
                  })
                }
              />
              <em>{Math.round(settings.confidenceThreshold * 100)}%</em>
            </label>
            <label>
              <span>Scroll sensitivity</span>
              <input
                type="range"
                min={50}
                max={180}
                value={Math.round(settings.scrollSensitivity * 100)}
                onChange={(e) =>
                  onUpdateSettings({
                    scrollSensitivity: Number(e.target.value) / 100,
                  })
                }
              />
              <em>{settings.scrollSensitivity.toFixed(2)}×</em>
            </label>
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
            <label>
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
            <button type="button" className="btn" onClick={onPreload}>
              {modelReady ? 'Reload model' : 'Preload model'}
            </button>
          </div>
          <p className="confidence-readout">
            Live confidence: {(confidence * 100).toFixed(0)}%
            {partialTranscript ? ` · “${partialTranscript}”` : ''}
          </p>
        </div>
      )}
    </header>
  )
}
