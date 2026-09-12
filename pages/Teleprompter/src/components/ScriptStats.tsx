import type { TeleprompterSettings } from '../hooks/useTeleprompter'
import {
  calculateTimeEstimates,
  formatTimeEstimate,
} from '../utils/timeEstimates'

export interface ScriptProgress {
  current: number
  total: number
  percent: number
  fillPercent: number
  said: number
  remaining: number
}

interface ScriptStatsProps {
  progress: ScriptProgress
  wpm: number | null
  confidence?: number
  elapsedSeconds?: number
  settings: Pick<
    TeleprompterSettings,
    | 'showStats'
    | 'showProgressBar'
    | 'showPercent'
    | 'showWpm'
    | 'showWordsSaid'
    | 'showWordsRemaining'
    | 'showWordsTotal'
    | 'showConfidence'
    | 'showElapsedTime'
    | 'showEstRemainingTime'
    | 'showEstTotalTime'
  >
  className?: string
  /** Stack chips vertically for narrow preview rails. */
  stacked?: boolean
}

export function ScriptStats({
  progress,
  wpm,
  confidence = 0,
  elapsedSeconds = 0,
  settings,
  className = '',
  stacked = false,
}: ScriptStatsProps) {
  const s = settings
  const { totalSeconds, remainingSeconds } = calculateTimeEstimates(
    progress.total,
    progress.remaining,
    wpm,
  )

  const showAny =
    s.showStats &&
    (s.showProgressBar ||
      s.showPercent ||
      s.showElapsedTime ||
      s.showWpm ||
      s.showEstRemainingTime ||
      s.showEstTotalTime ||
      s.showWordsSaid ||
      s.showWordsRemaining ||
      s.showWordsTotal ||
      s.showConfidence)

  if (!showAny) {
    return (
      <div
        className={`stats-strip is-empty${className ? ` ${className}` : ''}`}
        aria-hidden
      />
    )
  }

  return (
    <div
      className={`stats-strip${stacked ? ' is-stacked' : ''}${className ? ` ${className}` : ''}`}
      aria-live="polite"
    >
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
                    className={`progress-tick${isQuarter ? ' is-quarter' : ''}`}
                    style={{ left: `${(eighth / 8) * 100}%` }}
                  />
                )
              })}
            </div>
          </div>
        </div>
      )}
      <div className="stat-chips">
        {s.showPercent && (
          <span className="stat-chip" title="Progress through script">
            <em>{progress.total === 0 ? '—' : `${progress.percent}%`}</em>
            <span>done</span>
          </span>
        )}
        {s.showWpm && (
          <span className="stat-chip" title="Words per minute (last sentence)">
            <em>{wpm == null ? '—' : wpm}</em>
            <span>wpm</span>
          </span>
        )}
        {s.showElapsedTime && (
          <span
            className="stat-chip"
            title="Time elapsed since starting script"
          >
            <em>{formatTimeEstimate(elapsedSeconds)}</em>
            <span>elapsed</span>
          </span>
        )}
        {s.showEstRemainingTime && (
          <span
            className="stat-chip"
            title="Estimated time to complete from current location (based on WPM)"
          >
            <em>{formatTimeEstimate(remainingSeconds)}</em>
            <span>est. left</span>
          </span>
        )}
        {s.showEstTotalTime && (
          <span
            className="stat-chip"
            title="Estimated total script time from start (based on WPM)"
          >
            <em>{formatTimeEstimate(totalSeconds)}</em>
            <span>est. total</span>
          </span>
        )}
        {s.showConfidence && (
          <span className="stat-chip" title="Live speech-match confidence">
            <em>{Math.round(confidence * 100)}%</em>
            <span>match</span>
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
  )
}
