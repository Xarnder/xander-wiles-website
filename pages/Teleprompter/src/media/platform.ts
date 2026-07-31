/** Platform helpers for camera+mic capture on iOS / iPadOS Safari & Chrome (WebKit). */

export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  // iPadOS 13+ may report as Macintosh; detect touch + Mac.
  const iOS = /iPad|iPhone|iPod/.test(ua)
  const iPadOs =
    navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
  return iOS || iPadOs
}

export function isMediaRecorderSupported(): boolean {
  return typeof MediaRecorder !== 'undefined'
}

/** Prefer MP4 on Apple (Safari / Chrome iOS); WebM elsewhere when available. */
export function pickRecorderMimeType(): string | undefined {
  if (!isMediaRecorderSupported()) return undefined
  const apple = isAppleMobile()
  // On iOS, plain video/mp4 is the most reliable; codec strings can pass
  // isTypeSupported then fail at MediaRecorder.start().
  const candidates = apple
    ? [
        'video/mp4',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=avc1,mp4a.40.2',
      ]
    : [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      ]
  return candidates.find((t) => {
    try {
      return MediaRecorder.isTypeSupported(t)
    } catch {
      return false
    }
  })
}

export function requireSecureContextForRecording(): void {
  if (typeof window === 'undefined') return
  if (window.isSecureContext) return
  throw new DOMException(
    'Camera recording requires HTTPS (or localhost). Open this page over a secure connection.',
    'SecurityError',
  )
}

/** Wait briefly for iOS tracks that start muted / not-yet-live. */
export async function warmCaptureTracks(
  stream: MediaStream,
  opts: { requireVideo?: boolean } = {},
): Promise<void> {
  const { requireVideo = false } = opts
  const deadline = performance.now() + 1200

  const ready = () => {
    const audio = stream.getAudioTracks()[0]
    const video = stream.getVideoTracks()[0]
    if (!audio || audio.readyState === 'ended') return false
    if (requireVideo && (!video || video.readyState === 'ended')) return false
    // iOS may keep track.muted true briefly (or permanently) even while audio flows.
    const audioOk = audio.readyState === 'live' && audio.enabled
    const videoOk =
      !requireVideo ||
      (Boolean(video) && video!.readyState === 'live' && video!.enabled)
    return audioOk && videoOk
  }

  for (const track of stream.getTracks()) {
    try {
      track.enabled = true
    } catch {
      // ignore
    }
  }

  while (performance.now() < deadline) {
    if (ready()) return
    await new Promise((r) => window.setTimeout(r, 50))
  }

  assertRecordingTracks(stream, { requireVideo })
}

export function assertRecordingTracks(
  stream: MediaStream,
  opts: { requireVideo?: boolean } = {},
): void {
  const { requireVideo = false } = opts
  const audio = stream.getAudioTracks()[0]
  const video = stream.getVideoTracks()[0]

  if (!audio) {
    throw new DOMException(
      'No microphone track available to record.',
      'NotFoundError',
    )
  }
  if (audio.readyState === 'ended') {
    throw new DOMException(
      'Microphone track ended before recording could start.',
      'InvalidStateError',
    )
  }
  if (!audio.enabled) {
    throw new DOMException(
      'Microphone track is disabled.',
      'InvalidStateError',
    )
  }

  if (requireVideo) {
    if (!video) {
      throw new DOMException(
        'No camera track available to record.',
        'NotFoundError',
      )
    }
    if (video.readyState === 'ended') {
      throw new DOMException(
        'Camera track ended before recording could start.',
        'InvalidStateError',
      )
    }
    if (!video.enabled) {
      throw new DOMException('Camera track is disabled.', 'InvalidStateError')
    }
  }
}

export function extensionForMime(mime: string | undefined): string {
  if (!mime) return 'mp4'
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mp4') || mime.includes('avc1')) return 'mp4'
  return 'mp4'
}

type AudioSessionNav = Navigator & {
  audioSession?: { type: string }
}

/** Best-effort iOS audio session for mic + capture without wrecking routing. */
export function prepareAudioSessionForCapture(): void {
  try {
    const session = (navigator as AudioSessionNav).audioSession
    if (!session) return
    session.type = 'play-and-record'
  } catch {
    // Unsupported — ignore.
  }
}

export function resetAudioSession(): void {
  try {
    const session = (navigator as AudioSessionNav).audioSession
    if (!session) return
    session.type = 'playback'
    session.type = 'auto'
  } catch {
    // Unsupported — ignore.
  }
}

export type FacingMode = 'user' | 'environment'

export interface CaptureConstraintsOptions {
  deviceId?: string | null
  recordCamera?: boolean
  facingMode?: FacingMode
  /** Soften constraints after OverconstrainedError. */
  relaxed?: boolean
}

/** Audio (+ optional video) constraints tuned for iOS and shared ASR/recording. */
export function buildCaptureConstraints(
  options: CaptureConstraintsOptions,
): MediaStreamConstraints {
  const { deviceId, recordCamera = false, facingMode = 'user', relaxed = false } =
    options
  const apple = isAppleMobile()

  const audio: MediaTrackConstraints = {
    echoCancellation: true,
    autoGainControl: true,
    noiseSuppression: true,
  }

  if (!relaxed) {
    audio.channelCount = { ideal: 1 }
    // Exact 16 kHz often fails on iOS; keep as ideal on desktop only.
    if (!apple) {
      audio.sampleRate = { ideal: 16000 }
    }
    if (deviceId) {
      audio.deviceId = { exact: deviceId }
    }
  } else if (deviceId) {
    // Prefer the chosen mic without hard-failing.
    audio.deviceId = { ideal: deviceId }
  }

  if (!recordCamera) {
    return { audio }
  }

  const video: MediaTrackConstraints = relaxed
    ? { facingMode }
    : {
        facingMode: { ideal: facingMode },
        width: { ideal: apple ? 1280 : 1920 },
        height: { ideal: apple ? 720 : 1080 },
        frameRate: { ideal: 30, max: 30 },
      }

  return { audio, video }
}

export async function getCaptureStream(
  options: CaptureConstraintsOptions,
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException(
      'Camera/microphone capture is not supported in this browser.',
      'NotSupportedError',
    )
  }

  prepareAudioSessionForCapture()

  try {
    return await navigator.mediaDevices.getUserMedia(
      buildCaptureConstraints({ ...options, relaxed: false }),
    )
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
      return navigator.mediaDevices.getUserMedia(
        buildCaptureConstraints({ ...options, relaxed: true }),
      )
    }
    throw err
  }
}

/** Audio-only view of the same tracks (shared with video recording). */
export function audioOnlyStream(stream: MediaStream): MediaStream {
  return new MediaStream(stream.getAudioTracks())
}

export async function saveRecordingBlob(
  blob: Blob,
  filename: string,
): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, {
    type: blob.type || 'video/mp4',
  })

  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean
  }

  if (typeof nav.share === 'function') {
    try {
      const data: ShareData = { files: [file], title: 'Teleprompter recording' }
      if (!nav.canShare || nav.canShare(data)) {
        await nav.share(data)
        return 'shared'
      }
    } catch (err) {
      // User cancel should not fall through to download.
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err
      }
    }
  }

  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  return 'downloaded'
}
