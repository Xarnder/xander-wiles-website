import { useEffect, useRef, useState } from 'react'

export interface CaptureMeters {
  /** 0–1 smoothed mic input level from the capture stream. */
  micLevel: number
  /** True when an audio track is live and enabled. */
  micLive: boolean
  /** True when a video track is live and enabled. */
  camLive: boolean
  /** True when the mic has recently received audible signal. */
  micHearing: boolean
}

const IDLE: CaptureMeters = {
  micLevel: 0,
  micLive: false,
  camLive: false,
  micHearing: false,
}

/**
 * Live mic level + camera/mic track health for the shared capture stream.
 * Uses Web Audio AnalyserNode (works on iOS Safari/Chrome after a user gesture).
 */
export function useCaptureMeters(
  stream: MediaStream | null,
  enabled: boolean,
): CaptureMeters {
  const [meters, setMeters] = useState<CaptureMeters>(IDLE)
  const hearingUntilRef = useRef(0)

  useEffect(() => {
    if (!enabled || !stream) {
      setMeters(IDLE)
      return
    }

    const audioTrack = stream.getAudioTracks()[0] ?? null
    const videoTrack = stream.getVideoTracks()[0] ?? null

    let cancelled = false
    let raf = 0
    let audioCtx: AudioContext | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let analyser: AnalyserNode | null = null
    let smoothed = 0

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext

    const teardownAudio = () => {
      try {
        source?.disconnect()
      } catch {
        // ignore
      }
      source = null
      analyser = null
      if (audioCtx) {
        void audioCtx.close().catch(() => undefined)
        audioCtx = null
      }
    }

    const setupAudio = async () => {
      if (!audioTrack || !AudioCtx) return
      const micStream = new MediaStream([audioTrack])
      audioCtx = new AudioCtx()
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => undefined)
      }
      if (cancelled || !audioCtx) return
      source = audioCtx.createMediaStreamSource(micStream)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      source.connect(analyser)
    }

    void setupAudio()

    const data = new Uint8Array(128)

    const tick = () => {
      if (cancelled) return

      const micLive = Boolean(
        audioTrack && audioTrack.readyState === 'live' && audioTrack.enabled,
      )
      const camLive = Boolean(
        videoTrack && videoTrack.readyState === 'live' && videoTrack.enabled,
      )

      let level = 0
      if (analyser && micLive) {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i]! - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        // Boost a bit so quiet speech still moves the meter on phones.
        level = Math.min(1, rms * 3.2)
        smoothed = smoothed * 0.72 + level * 0.28
        if (smoothed > 0.06) {
          hearingUntilRef.current = performance.now() + 700
        }
      } else {
        smoothed *= 0.85
      }

      const micHearing = performance.now() < hearingUntilRef.current

      setMeters({
        micLevel: smoothed,
        micLive,
        camLive,
        micHearing,
      })

      raf = window.requestAnimationFrame(tick)
    }

    raf = window.requestAnimationFrame(tick)

    const onTrackEnded = () => {
      // Force a meter refresh; tick will pick up readyState.
    }
    audioTrack?.addEventListener('ended', onTrackEnded)
    audioTrack?.addEventListener('mute', onTrackEnded)
    audioTrack?.addEventListener('unmute', onTrackEnded)
    videoTrack?.addEventListener('ended', onTrackEnded)
    videoTrack?.addEventListener('mute', onTrackEnded)
    videoTrack?.addEventListener('unmute', onTrackEnded)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
      audioTrack?.removeEventListener('ended', onTrackEnded)
      audioTrack?.removeEventListener('mute', onTrackEnded)
      audioTrack?.removeEventListener('unmute', onTrackEnded)
      videoTrack?.removeEventListener('ended', onTrackEnded)
      videoTrack?.removeEventListener('mute', onTrackEnded)
      videoTrack?.removeEventListener('unmute', onTrackEnded)
      teardownAudio()
      setMeters(IDLE)
    }
  }, [enabled, stream])

  return meters
}
