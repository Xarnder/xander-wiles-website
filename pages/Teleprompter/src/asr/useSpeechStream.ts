import { useCallback, useEffect, useRef, useState } from 'react'

export type SpeechStatus = 'idle' | 'loading' | 'listening' | 'error'

export interface SpeechStreamState {
  status: SpeechStatus
  partialTranscript: string
  committedTranscript: string
  errorMessage: string | null
  modelReady: boolean
}

export interface UseSpeechStreamOptions {
  /** Moonshine model id relative to asset base, e.g. "model/tiny". */
  modelId?: string
  deviceId?: string | null
  onPartial?: (text: string) => void
  onCommitted?: (text: string) => void
}

type MoonshineModule = typeof import('@moonshine-ai/moonshine-js')
type TranscriberInstance = InstanceType<MoonshineModule['Transcriber']>

function resolveMoonshineBase(): string {
  const base = import.meta.env.BASE_URL || '/'
  return new URL('moonshine/', window.location.origin + base).href
}

/**
 * On-device streaming ASR via MoonshineJS.
 * useVAD=false → onTranscriptionUpdated fires on a rapid interval (streaming).
 */
export function useSpeechStream(options: UseSpeechStreamOptions = {}) {
  const {
    modelId = 'model/tiny',
    deviceId = null,
    onPartial,
    onCommitted,
  } = options

  const [status, setStatus] = useState<SpeechStatus>('idle')
  const [partialTranscript, setPartialTranscript] = useState('')
  const [committedTranscript, setCommittedTranscript] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [modelReady, setModelReady] = useState(false)

  const moonshineRef = useRef<MoonshineModule | null>(null)
  const transcriberRef = useRef<TranscriberInstance | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const onPartialRef = useRef(onPartial)
  const onCommittedRef = useRef(onCommitted)
  const committedAccRef = useRef('')

  useEffect(() => {
    onPartialRef.current = onPartial
    onCommittedRef.current = onCommitted
  }, [onPartial, onCommitted])

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const stop = useCallback(() => {
    try {
      transcriberRef.current?.stop()
    } catch {
      // ignore
    }
    // Drop instance so the next start re-attaches a fresh mic graph.
    // Model weights remain cached on Transcriber's static map.
    transcriberRef.current = null
    cleanupStream()
    setStatus((s) => (s === 'error' ? 'error' : 'idle'))
  }, [cleanupStream])

  const loadMoonshine = useCallback(async () => {
    if (moonshineRef.current) return moonshineRef.current
    const mod = await import('@moonshine-ai/moonshine-js')
    moonshineRef.current = mod
    return mod
  }, [])

  const ensureTranscriber = useCallback(async () => {
    if (transcriberRef.current) return transcriberRef.current

    const Moonshine = await loadMoonshine()
    Moonshine.Settings.BASE_ASSET_PATH.MOONSHINE = resolveMoonshineBase()

    const transcriber = new Moonshine.Transcriber(
      modelId,
      {
        onModelLoadStarted() {
          setStatus('loading')
          setErrorMessage(null)
        },
        onModelLoaded() {
          setModelReady(true)
        },
        onPermissionsRequested() {
          setErrorMessage(null)
        },
        onError(error) {
          const message =
            typeof error === 'string'
              ? error
              : error instanceof Error
                ? error.message
                : 'Speech recognition error'
          const isPermission =
            message.toLowerCase().includes('permission') ||
            message === 'PermissionDenied'
          setErrorMessage(
            isPermission
              ? 'Microphone permission denied. Allow mic access in your browser settings to use voice-follow.'
              : message,
          )
          setStatus('error')
          cleanupStream()
        },
        onTranscribeStarted() {
          setStatus('listening')
        },
        onTranscribeStopped() {
          setStatus((s) => (s === 'error' ? 'error' : 'idle'))
        },
        onTranscriptionUpdated(text) {
          const value = text ?? ''
          setPartialTranscript(value)
          onPartialRef.current?.(value)
        },
        onTranscriptionCommitted(text) {
          const value = (text ?? '').trim()
          if (!value) return
          committedAccRef.current = `${committedAccRef.current} ${value}`.trim()
          setCommittedTranscript(committedAccRef.current)
          setPartialTranscript('')
          onCommittedRef.current?.(value)
        },
      },
      false, // streaming mode: disable VAD-only commits
      'quantized',
    )

    transcriberRef.current = transcriber
    return transcriber
  }, [cleanupStream, loadMoonshine, modelId])

  const preload = useCallback(async () => {
    setStatus('loading')
    setErrorMessage(null)
    try {
      const transcriber = await ensureTranscriber()
      await transcriber.load()
      setModelReady(true)
      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to load the on-device speech model.',
      )
    }
  }, [ensureTranscriber])

  const start = useCallback(async () => {
    setErrorMessage(null)

    try {
      const permission = await navigator.permissions
        ?.query({ name: 'microphone' as PermissionName })
        .catch(() => null)
      if (permission?.state === 'denied') {
        setStatus('error')
        setErrorMessage(
          'Microphone permission denied. Allow mic access in your browser settings to use voice-follow.',
        )
        return
      }

      setStatus('loading')
      const transcriber = await ensureTranscriber()

      if (!modelReady) {
        await transcriber.load()
        setModelReady(true)
      }

      cleanupStream()
      const constraints: MediaStreamConstraints = {
        audio: {
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
          sampleRate: 16000,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      transcriber.attachStream(stream)
      await transcriber.start()
      setStatus('listening')
    } catch (err) {
      cleanupStream()
      const name = err instanceof DOMException ? err.name : ''
      const isPermission =
        name === 'NotAllowedError' || name === 'PermissionDeniedError'
      setStatus('error')
      setErrorMessage(
        isPermission
          ? 'Microphone permission denied. Allow mic access in your browser settings to use voice-follow.'
          : err instanceof Error
            ? err.message
            : 'Could not start the microphone.',
      )
    }
  }, [cleanupStream, deviceId, ensureTranscriber, modelReady])

  const resetTranscript = useCallback(() => {
    committedAccRef.current = ''
    setCommittedTranscript('')
    setPartialTranscript('')
  }, [])

  useEffect(() => {
    return () => {
      try {
        transcriberRef.current?.stop()
      } catch {
        // ignore
      }
      cleanupStream()
    }
  }, [cleanupStream])

  return {
    status,
    partialTranscript,
    committedTranscript,
    errorMessage,
    modelReady,
    start,
    stop,
    preload,
    resetTranscript,
  } satisfies SpeechStreamState & {
    start: () => Promise<void>
    stop: () => void
    preload: () => Promise<void>
    resetTranscript: () => void
  }
}
