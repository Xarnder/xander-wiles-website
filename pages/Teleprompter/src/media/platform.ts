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

/** Camera capture size for recording (always 16:9 targets). */
export type VideoResolution = 'max' | '2160p' | '1080p' | '720p' | '480p'

export const VIDEO_RESOLUTION_OPTIONS: ReadonlyArray<{
  id: VideoResolution
  label: string
  width: number | null
  height: number | null
}> = [
  {
    id: 'max',
    label: 'Full sensor (16:9)',
    width: null,
    height: null,
  },
  {
    id: '2160p',
    label: '4K · 3840×2160',
    width: 3840,
    height: 2160,
  },
  {
    id: '1080p',
    label: '1080p · 1920×1080',
    width: 1920,
    height: 1080,
  },
  {
    id: '720p',
    label: '720p · 1280×720',
    width: 1280,
    height: 720,
  },
  {
    id: '480p',
    label: '480p · 854×480',
    width: 854,
    height: 480,
  },
]

export function isVideoResolution(value: unknown): value is VideoResolution {
  return VIDEO_RESOLUTION_OPTIONS.some((o) => o.id === value)
}

export interface CaptureConstraintsOptions {
  deviceId?: string | null
  recordCamera?: boolean
  facingMode?: FacingMode
  /** Target recording resolution (16:9). Default: full sensor. */
  videoResolution?: VideoResolution
  /** Soften constraints after OverconstrainedError. */
  relaxed?: boolean
}

function videoConstraintsForResolution(
  facingMode: FacingMode,
  resolution: VideoResolution,
  relaxed: boolean,
): MediaTrackConstraints {
  if (relaxed) {
    return {
      facingMode,
      aspectRatio: { ideal: 16 / 9 },
    }
  }

  const preset = VIDEO_RESOLUTION_OPTIONS.find((o) => o.id === resolution)
  const width = preset?.width
  const height = preset?.height

  // Full sensor / max: ask for the highest 16:9 the device will give.
  if (!width || !height) {
    return {
      facingMode: { ideal: facingMode },
      aspectRatio: { ideal: 16 / 9 },
      width: { ideal: 3840, max: 4096 },
      height: { ideal: 2160, max: 2160 },
      frameRate: { ideal: 30, max: 60 },
    }
  }

  return {
    facingMode: { ideal: facingMode },
    aspectRatio: { ideal: 16 / 9 },
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: 30, max: 60 },
  }
}

/** Audio (+ optional video) constraints tuned for iOS and shared ASR/recording. */
export function buildCaptureConstraints(
  options: CaptureConstraintsOptions,
): MediaStreamConstraints {
  const {
    deviceId,
    recordCamera = false,
    facingMode = 'user',
    videoResolution = 'max',
    relaxed = false,
  } = options
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

  return {
    audio,
    video: videoConstraintsForResolution(facingMode, videoResolution, relaxed),
  }
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

export function canShareRecordingFiles(): boolean {
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean
  }
  if (typeof nav.share !== 'function') return false
  try {
    const probe = new File([new Blob(['x'], { type: 'video/mp4' })], 'probe.mp4', {
      type: 'video/mp4',
    })
    if (!nav.canShare) return true
    return nav.canShare({ files: [probe] })
  } catch {
    return typeof nav.share === 'function'
  }
}

export async function shareRecordingBlob(
  blob: Blob,
  filename: string,
): Promise<void> {
  const type =
    blob.type || (filename.endsWith('.webm') ? 'video/webm' : 'video/mp4')
  const file =
    blob instanceof File
      ? blob
      : new File([blob], filename, { type, lastModified: Date.now() })
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean
  }
  if (typeof nav.share !== 'function') {
    throw new DOMException(
      'Sharing is not available in this browser. Use Download instead.',
      'NotSupportedError',
    )
  }
  const data: ShareData = {
    files: [file],
    title: 'Teleprompter recording',
  }
  if (nav.canShare && !nav.canShare(data)) {
    throw new DOMException(
      'This browser cannot share video files. Use Download instead.',
      'NotSupportedError',
    )
  }
  await nav.share(data)
}

function mimeForDownload(blob: Blob, filename: string): string {
  if (blob.type) return blob.type
  if (/\.webm$/i.test(filename)) return 'video/webm'
  if (/\.mp4$/i.test(filename)) return 'video/mp4'
  return 'video/mp4'
}

function toDownloadFile(blob: Blob, filename: string): File {
  const type = mimeForDownload(blob, filename)
  if (blob instanceof File && blob.name === filename && blob.type === type) {
    return blob
  }
  return new File([blob], filename, { type, lastModified: Date.now() })
}

async function downloadViaSavePicker(file: File): Promise<boolean> {
  const w = window as Window & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string
      types?: Array<{
        description?: string
        accept: Record<string, string[]>
      }>
    }) => Promise<FileSystemFileHandle>
  }
  if (typeof w.showSaveFilePicker !== 'function') return false

  const ext = `.${extensionForMime(file.type) || 'mp4'}`
  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: file.name,
      types: [
        {
          description: 'Video',
          accept: { [file.type || 'video/mp4']: [ext] },
        },
      ],
    })
    const writable = await handle.createWritable()
    await writable.write(file)
    await writable.close()
    return true
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    return false
  }
}

function downloadViaAnchor(file: File): void {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

/**
 * Robust download: Save-As picker when available, then anchor download,
 * then open-in-tab fallback for stubborn mobile browsers.
 */
export async function downloadRecordingBlob(
  blob: Blob,
  filename: string,
): Promise<void> {
  if (!blob || blob.size <= 0) {
    throw new DOMException(
      'Nothing to download — the recording file is empty.',
      'InvalidStateError',
    )
  }

  const file = toDownloadFile(blob, filename)

  try {
    if (await downloadViaSavePicker(file)) return
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
  }

  try {
    downloadViaAnchor(file)
    return
  } catch {
    // fall through
  }

  // iOS / in-app browsers sometimes ignore download= — open the blob instead.
  const url = URL.createObjectURL(file)
  const opened = window.open(url, '_blank', 'noopener')
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
  if (!opened) {
    throw new DOMException(
      'Could not start the download. Try Share to Files/Photos, or allow pop-ups.',
      'NetworkError',
    )
  }
}

/** @deprecated Prefer shareRecordingBlob / downloadRecordingBlob for separate UI. */
export async function saveRecordingBlob(
  blob: Blob,
  filename: string,
): Promise<'shared' | 'downloaded'> {
  if (canShareRecordingFiles()) {
    try {
      await shareRecordingBlob(blob, filename)
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
    }
  }
  await downloadRecordingBlob(blob, filename)
  return 'downloaded'
}
