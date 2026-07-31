export type SpeechErrorKind =
  | 'network'
  | 'permission'
  | 'platform'
  | 'model'
  | 'microphone'
  | 'unknown'

export type SpeechErrorContext = 'model-load' | 'start' | 'runtime'

export interface SpeechErrorInfo {
  kind: SpeechErrorKind
  title: string
  /** What went wrong. */
  message: string
  /** How the user can fix it. */
  fix: string
  /** Short single-line summary for banners / status. */
  summary: string
}

function rawMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message || err.name
  if (err && typeof err === 'object') {
    const record = err as Record<string, unknown>
    if (typeof record.message === 'string') return record.message
    if (typeof record.error === 'string') return record.error
    if (typeof record.code === 'string') return record.code
  }
  return ''
}

function rawName(err: unknown): string {
  if (err instanceof Error) return err.name
  if (err instanceof DOMException) return err.name
  if (err && typeof err === 'object' && typeof (err as { name?: unknown }).name === 'string') {
    return (err as { name: string }).name
  }
  return ''
}

function looksLikeNetwork(message: string, name: string): boolean {
  const hay = `${name} ${message}`.toLowerCase()
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (
    name === 'TypeError' &&
    /fetch|network|load failed|failed to fetch/i.test(message)
  ) {
    return true
  }
  return /failed to fetch|networkerror|network request failed|err_internet|err_network|net::|timed?\s*out|timeout|offline|load failed|download(ing)? failed|connection (reset|refused|aborted)|dns|econnreset|enotfound|you appear to be offline/i.test(
    hay,
  )
}

function looksLikeModelAsset(message: string): boolean {
  return /onnx|wasm|webassembly|ort-|webgpu|webgl|model|moonshine|silero|vad|asset|weight/i.test(
    message,
  )
}

function looksLikePermission(message: string, name: string): boolean {
  const hay = `${name} ${message}`.toLowerCase()
  return (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    /permissiondenied|permission denied|notallowed|microphone permission/i.test(hay)
  )
}

function looksLikePlatform(message: string): boolean {
  return /platformunsupported|not supported|unsupported browser|webassembly|sharedarraybuffer|cross-origin isolated/i.test(
    message,
  )
}

/**
 * Turn raw Moonshine / mic / fetch failures into user-facing copy
 * with a concrete fix suggestion.
 */
export function classifySpeechError(
  err: unknown,
  context: SpeechErrorContext = 'runtime',
): SpeechErrorInfo {
  const message = rawMessage(err)
  const name = rawName(err)
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false

  if (looksLikePermission(message, name) || message === 'PermissionDenied') {
    const wantsCamera = /camera|video/i.test(message)
    return {
      kind: 'permission',
      title: wantsCamera ? 'Camera or microphone blocked' : 'Microphone blocked',
      message: wantsCamera
        ? 'This browser blocked camera or microphone access, so recording and voice-follow cannot start.'
        : 'This browser blocked microphone access, so voice-follow cannot start.',
      fix: wantsCamera
        ? 'Allow camera and microphone access for this site in Safari or Chrome settings, then try again.'
        : 'Allow microphone access for this site in your browser settings, then try again.',
      summary: wantsCamera
        ? 'Camera/microphone permission denied. Allow access in browser settings.'
        : 'Microphone permission denied. Allow mic access in your browser settings to use voice-follow.',
    }
  }

  if (
    name === 'SecurityError' ||
    /https|secure connection|secure context/i.test(message)
  ) {
    return {
      kind: 'platform',
      title: 'Secure connection required',
      message:
        'Camera recording only works on HTTPS (or localhost). This page is not in a secure context.',
      fix: 'Open the site with https:// in Safari or Chrome, then try Record again.',
      summary: 'Camera recording requires HTTPS.',
    }
  }

  if (
    name === 'NotSupportedError' ||
    /video recording is not supported|mediarecorder|could not create a video recorder/i.test(
      message,
    )
  ) {
    return {
      kind: 'platform',
      title: 'Recording not supported',
      message:
        'This browser cannot record camera video with MediaRecorder (needed on iPhone/iPad Safari & Chrome).',
      fix: 'Update to the latest iOS / iPadOS and try again in Safari or Chrome. You can still use voice-follow without Record.',
      summary: 'Video recording is not supported in this browser.',
    }
  }

  if (
    /empty video|recorder did not|recording failed|stopped during recording|mediarecorder\.start|track ended|track is disabled/i.test(
      message,
    )
  ) {
    return {
      kind: 'microphone',
      title: 'Recording failed',
      message:
        message ||
        'The camera recording could not be saved. This is often an iPhone permission or backgrounding issue.',
      fix: 'In iPhone Settings → Safari (or Chrome) allow Camera and Microphone. Keep the app open while recording, then Pause to save. Try again.',
      summary: message || 'Camera recording failed.',
    }
  }

  if (
    context === 'model-load' ||
    offline ||
    looksLikeNetwork(message, name) ||
    (looksLikeModelAsset(message) && /fail|error|unable|cannot|could not/i.test(message))
  ) {
    if (offline || looksLikeNetwork(message, name)) {
      return {
        kind: 'network',
        title: 'Model download failed',
        message:
          'The speech model could not be downloaded. This usually means the connection dropped or is too unstable.',
        fix: 'Find a stronger internet connection, then tap Retry. After it loads once, the model is cached for offline use.',
        summary: 'Model download failed. Check your internet connection and try again.',
      }
    }

    if (looksLikePlatform(message)) {
      return {
        kind: 'platform',
        title: 'Browser not supported',
        message:
          'On-device speech recognition needs a modern browser with WebAssembly support.',
        fix: 'Try the latest Chrome, Edge, Firefox, or Safari on a desktop or recent mobile device.',
        summary: 'This browser does not support on-device speech recognition.',
      }
    }

    return {
      kind: 'model',
      title: 'Speech model failed to load',
      message:
        'The on-device speech model could not finish loading. Downloads, cache, or browser limits may be involved.',
      fix: 'Check your internet connection, refresh the page, and try Preload model again. If it keeps failing, clear site data for this page and retry.',
      summary: 'Failed to load the on-device speech model. Check your connection and try again.',
    }
  }

  if (looksLikePlatform(message) || message === 'PlatformUnsupported') {
    return {
      kind: 'platform',
      title: 'Browser not supported',
      message:
        'On-device speech recognition needs a modern browser with WebAssembly support.',
      fix: 'Try the latest Chrome, Edge, Firefox, or Safari on a desktop or recent mobile device.',
      summary: 'This browser does not support on-device speech recognition.',
    }
  }

  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError' ||
    name === 'NotReadableError' ||
    name === 'AbortError' ||
    /getusermedia|mediaDevices|microphone|audio device|camera|video/i.test(message)
  ) {
    const involvesCamera = /camera|video/i.test(`${name} ${message}`)
    let fix =
      'Check that a microphone is connected, not used by another app, and selected in Settings.'
    let title = 'Microphone unavailable'
    let body = 'Could not open the selected microphone.'

    if (involvesCamera) {
      title = 'Camera or microphone unavailable'
      body = 'Could not open the camera and microphone for recording.'
      fix =
        'Allow camera + microphone access, close other apps using them, then try again. On iPhone/iPad, check Settings → Safari (or Chrome) → Camera & Microphone.'
    }
    if (name === 'NotReadableError') {
      fix =
        'Close other apps using the camera or microphone, then try again. On phones, only one app can often use them at a time.'
    } else if (name === 'OverconstrainedError') {
      fix =
        'Try the other camera (front/back), pick a different microphone in Settings, or turn Record off and use voice-follow only.'
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      fix = involvesCamera
        ? 'Make sure this device has a camera and microphone, grant access if asked, then refresh and try again.'
        : 'Plug in or enable a microphone, grant access if asked, then refresh and try again.'
    }

    return {
      kind: 'microphone',
      title,
      message: body,
      fix,
      summary: message || body,
    }
  }

  if (context === 'start') {
    return {
      kind: 'unknown',
      title: 'Could not start listening',
      message: message || 'Voice-follow could not start.',
      fix: 'Check microphone permissions and your internet connection, then try again.',
      summary: message || 'Could not start the microphone.',
    }
  }

  return {
    kind: 'unknown',
    title: 'Speech recognition error',
    message: message || 'Something went wrong with speech recognition.',
    fix: 'Try again. If the problem continues, refresh the page or preload the speech model from Settings.',
    summary: message || 'Speech recognition error',
  }
}
