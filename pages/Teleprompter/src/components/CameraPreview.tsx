import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useCaptureMeters } from '../media/useCaptureMeters'

interface CameraPreviewProps {
  stream: MediaStream | null
  /** Mirror the preview for front-facing selfie framing (does not affect the file). */
  mirror?: boolean
  recording?: boolean
  /** Epoch ms when the current take started. */
  recordingStartedAt?: number | null
  className?: string
  /** Stretch video to fill the whole preview column (cover crop). */
  fillColumn?: boolean
  /** Optional panel rendered under the video (stats fill letterbox space). */
  footer?: ReactNode
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function aspectFromStream(stream: MediaStream | null): number | null {
  const track = stream?.getVideoTracks()[0]
  if (!track) return null
  const settings = track.getSettings()
  if (settings.width && settings.height && settings.height > 0) {
    return settings.width / settings.height
  }
  return null
}

const RAIL_GAP_PX = 8
/** Minimum vertical room reserved for the stats panel under the video. */
const MIN_STATS_PX = 88

/**
 * Live camera preview with mic-level + camera/mic status.
 * Preview video is muted to avoid feedback; audio still records from the stream.
 */
export function CameraPreview({
  stream,
  mirror = true,
  recording = false,
  recordingStartedAt = null,
  className = '',
  fillColumn = false,
  footer,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const railRef = useRef<HTMLElement>(null)
  const meters = useCaptureMeters(stream, Boolean(stream))
  const [elapsedMs, setElapsedMs] = useState(0)
  const [aspectRatio, setAspectRatio] = useState(
    () => aspectFromStream(stream) ?? 16 / 9,
  )
  /** Largest full-width frame that fits the recording aspect in the rail. */
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(
    null,
  )

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    if (!stream) {
      el.srcObject = null
      return
    }

    el.srcObject = stream
    el.muted = true
    el.defaultMuted = true
    el.volume = 0
    el.playsInline = true
    el.setAttribute('playsinline', 'true')
    el.setAttribute('webkit-playsinline', 'true')

    const syncAspect = () => {
      const fromStream = aspectFromStream(stream)
      if (fromStream) {
        setAspectRatio(fromStream)
        return
      }
      if (el.videoWidth > 0 && el.videoHeight > 0) {
        setAspectRatio(el.videoWidth / el.videoHeight)
      }
    }

    syncAspect()
    el.addEventListener('loadedmetadata', syncAspect)
    el.addEventListener('resize', syncAspect)

    const play = () => {
      void el.play().catch(() => {
        // Autoplay may be blocked until a gesture; Start already is a gesture.
      })
    }
    play()

    return () => {
      el.removeEventListener('loadedmetadata', syncAspect)
      el.removeEventListener('resize', syncAspect)
      el.srcObject = null
    }
  }, [stream])

  useEffect(() => {
    if (!recording || recordingStartedAt == null) {
      setElapsedMs(0)
      return
    }
    const tick = () => setElapsedMs(Date.now() - recordingStartedAt)
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [recording, recordingStartedAt])

  // Size the video to the recording aspect at full rail width (as tall as it can be).
  useLayoutEffect(() => {
    if (!footer || fillColumn) {
      setFrameSize(null)
      return
    }
    const rail = railRef.current
    if (!rail) return

    const layout = () => {
      const railW = rail.clientWidth
      const railH = rail.clientHeight
      if (railW <= 0 || railH <= 0 || aspectRatio <= 0) return

      const maxVideoH = Math.max(48, railH - RAIL_GAP_PX - MIN_STATS_PX)
      // Full width of the preview+stats column; height from aspect, capped to fit.
      const width = railW
      const height = Math.min(railW / aspectRatio, maxVideoH)
      setFrameSize({
        width: Math.round(width),
        height: Math.round(height),
      })
    }

    layout()
    const ro = new ResizeObserver(layout)
    ro.observe(rail)
    return () => ro.disconnect()
  }, [aspectRatio, footer, fillColumn, stream])

  if (!stream) return null

  const micPct = Math.round(meters.micLevel * 100)
  const camOk = meters.camLive
  const micOk = meters.micLive
  const hearing = meters.micHearing
  const useRail = Boolean(footer) || fillColumn

  const frameStyle = {
    ...(frameSize && !fillColumn
      ? {
          width: `${frameSize.width}px`,
          height: `${frameSize.height}px`,
          aspectRatio: 'auto',
          maxHeight: 'none',
        }
      : !fillColumn
        ? {
            '--preview-aspect': String(aspectRatio),
          }
        : undefined),
  } as CSSProperties

  const frame = (
    <div
      className={`camera-preview${recording ? ' is-recording' : ''}${!camOk || !micOk ? ' is-warn' : ''}`}
      style={frameStyle}
      aria-label="Camera preview"
      role="status"
      aria-live="polite"
    >
      <video
        ref={videoRef}
        className={`camera-preview-video${mirror ? ' is-mirrored' : ''}`}
        autoPlay
        muted
        playsInline
      />

      <div className="camera-preview-hud">
        {recording ? (
          <span className="camera-preview-rec">
            <span className="camera-preview-rec-dot" aria-hidden />
            REC {formatElapsed(elapsedMs)}
          </span>
        ) : null}

        <div className="camera-preview-status">
          <span
            className={`camera-preview-pill${camOk ? ' is-ok' : ' is-bad'}`}
            title={camOk ? 'Camera is live in the recording' : 'Camera not live'}
          >
            <span className="camera-preview-pill-dot" aria-hidden />
            Cam {camOk ? 'on' : 'off'}
          </span>
          <span
            className={`camera-preview-pill${micOk ? (hearing ? ' is-hot' : ' is-ok') : ' is-bad'}`}
            title={
              !micOk
                ? 'Microphone not live'
                : hearing
                  ? 'Microphone is picking up sound for the video'
                  : 'Microphone is live — speak to see the meter move'
            }
          >
            <span className="camera-preview-pill-dot" aria-hidden />
            Mic {micOk ? (hearing ? 'live' : 'on') : 'off'}
          </span>
        </div>
      </div>

      <div
        className="camera-preview-meter"
        title="Microphone level in the video recording"
        aria-label={`Microphone level ${micPct} percent`}
      >
        <span className="camera-preview-meter-label">Mic</span>
        <div className="camera-preview-meter-track" aria-hidden>
          <div
            className={`camera-preview-meter-fill${hearing ? ' is-hot' : ''}`}
            style={{ width: `${micPct}%` }}
          />
        </div>
      </div>
    </div>
  )

  if (!useRail) {
    return className ? <div className={className}>{frame}</div> : frame
  }

  return (
    <aside
      ref={railRef}
      className={`preview-rail${fillColumn ? ' is-fill' : ''}${className ? ` ${className}` : ''}`}
      aria-label="Recording preview"
    >
      {frame}
      {footer ? <div className="preview-rail-stats">{footer}</div> : null}
    </aside>
  )
}
