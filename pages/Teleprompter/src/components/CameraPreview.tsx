import { useEffect, useRef } from 'react'
import { useCaptureMeters } from '../media/useCaptureMeters'

interface CameraPreviewProps {
  stream: MediaStream | null
  /** Mirror the preview for front-facing selfie framing (does not affect the file). */
  mirror?: boolean
  recording?: boolean
  className?: string
}

/**
 * Live camera preview with mic-level + camera/mic status.
 * Preview video is muted to avoid feedback; audio still records from the stream.
 */
export function CameraPreview({
  stream,
  mirror = true,
  recording = false,
  className = '',
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const meters = useCaptureMeters(stream, Boolean(stream))

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

    const play = () => {
      void el.play().catch(() => {
        // Autoplay may be blocked until a gesture; Start already is a gesture.
      })
    }
    play()

    return () => {
      el.srcObject = null
    }
  }, [stream])

  if (!stream) return null

  const micPct = Math.round(meters.micLevel * 100)
  const camOk = meters.camLive
  const micOk = meters.micLive
  const hearing = meters.micHearing

  return (
    <div
      className={`camera-preview ${className}${recording ? ' is-recording' : ''}${!camOk || !micOk ? ' is-warn' : ''}`}
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
            REC
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
}
