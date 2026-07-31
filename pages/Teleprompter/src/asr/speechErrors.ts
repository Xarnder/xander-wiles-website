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
    return {
      kind: 'permission',
      title: 'Microphone blocked',
      message: 'This browser blocked microphone access, so voice-follow cannot start.',
      fix: 'Allow microphone access for this site in your browser settings, then try again.',
      summary:
        'Microphone permission denied. Allow mic access in your browser settings to use voice-follow.',
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
    /getusermedia|mediaDevices|microphone|audio device/i.test(message)
  ) {
    let fix =
      'Check that a microphone is connected, not used by another app, and selected in Settings.'
    if (name === 'NotReadableError') {
      fix =
        'Close other apps using the microphone, then try again. On some systems only one app can use the mic at a time.'
    } else if (name === 'OverconstrainedError') {
      fix = 'Pick a different microphone in Settings, or choose the default device and try again.'
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      fix = 'Plug in or enable a microphone, grant access if asked, then refresh and try again.'
    }

    return {
      kind: 'microphone',
      title: 'Microphone unavailable',
      message: 'Could not open the selected microphone.',
      fix,
      summary: message || 'Could not start the microphone.',
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
