export interface TimeEstimates {
  totalSeconds: number | null
  remainingSeconds: number | null
}

/**
 * Calculates estimated total script duration from the start and
 * estimated remaining duration to complete from the current location,
 * based on current words per minute (WPM).
 */
export function calculateTimeEstimates(
  totalWords: number,
  remainingWords: number,
  wpm: number | null,
): TimeEstimates {
  if (totalWords <= 0) {
    return { totalSeconds: 0, remainingSeconds: 0 }
  }

  const remaining = Math.max(0, Math.min(remainingWords, totalWords))

  if (wpm == null || wpm <= 0 || !Number.isFinite(wpm)) {
    return {
      totalSeconds: null,
      remainingSeconds: remaining === 0 ? 0 : null,
    }
  }

  const totalSeconds = (totalWords / wpm) * 60
  const remainingSeconds = (remaining / wpm) * 60

  return {
    totalSeconds,
    remainingSeconds,
  }
}

/**
 * Formats a duration in seconds into a human-readable digital clock display:
 * - `M:SS` (e.g. 1:25, 0:42)
 * - `H:MM:SS` for durations >= 1 hour (e.g. 1:04:12)
 * Returns '—' when seconds is null, negative, or not finite.
 */
export function formatTimeEstimate(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return '—'
  }

  const total = Math.round(seconds)
  const hrs = Math.floor(total / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`
  }
  return `${mins}:${pad(secs)}`
}
