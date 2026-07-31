import { useCallback, useEffect, useRef, useState } from 'react'
import {
  classifySpeechError,
  type SpeechErrorInfo,
} from './speechErrors'

export type SpeechStatus = 'idle' | 'loading' | 'listening' | 'error'

export type SpeechErrorAction = 'preload' | 'start'

export interface SpeechStreamState {
  status: SpeechStatus
  partialTranscript: string
  committedTranscript: string
  errorMessage: string | null
  error: SpeechErrorInfo | null
  /** Which user action to retry after dismissing the error popup. */
  errorAction: SpeechErrorAction | null
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
  const [error, setError] = useState<SpeechErrorInfo | null>(null)
  const [errorAction, setErrorAction] = useState<SpeechErrorAction | null>(null)
  const [modelReady, setModelReady] = useState(false)

  const moonshineRef = useRef<MoonshineModule | null>(null)
  const transcriberRef = useRef<TranscriberInstance | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const onPartialRef = useRef(onPartial)
  const onCommittedRef = useRef(onCommitted)
  const committedAccRef = useRef('')
  const loadingModelRef = useRef(false)
  const pendingActionRef = useRef<SpeechErrorAction | null>(null)

  useEffect(() => {
    onPartialRef.current = onPartial
    onCommittedRef.current = onCommitted
  }, [onPartial, onCommitted])

  const reportError = useCallback(
    (
      err: unknown,
      context: 'model-load' | 'start' | 'runtime',
      action: SpeechErrorAction | null = pendingActionRef.current,
    ) => {
      const info = classifySpeechError(err, context)
      setError(info)
      setErrorAction(action)
      setStatus('error')
    },
    [],
  )

  const clearError = useCallback(() => {
    setError(null)
    setErrorAction(null)
    setStatus((s) => (s === 'error' ? 'idle' : s))
  }, [])

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
    try {
      const mod = await import('@moonshine-ai/moonshine-js')
      moonshineRef.current = mod
      return mod
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to load speech engine')
    }
  }, [])

  const ensureTranscriber = useCallback(async () => {
    if (transcriberRef.current) return transcriberRef.current

    const Moonshine = await loadMoonshine()
    Moonshine.Settings.BASE_ASSET_PATH.MOONSHINE = resolveMoonshineBase()

    const transcriber = new Moonshine.Transcriber(
      modelId,
      {
        onModelLoadStarted() {
          loadingModelRef.current = true
          setStatus('loading')
          setError(null)
          setErrorAction(null)
        },
        onModelLoaded() {
          loadingModelRef.current = false
          setModelReady(true)
        },
        onPermissionsRequested() {
          setError(null)
          setErrorAction(null)
        },
        onError(error) {
          const context = loadingModelRef.current ? 'model-load' : 'runtime'
          loadingModelRef.current = false
          reportError(error, context)
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
  }, [cleanupStream, loadMoonshine, modelId, reportError])

  const loadModel = useCallback(async (transcriber: TranscriberInstance) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('You appear to be offline')
    }
    loadingModelRef.current = true
    try {
      await transcriber.load()
      loadingModelRef.current = false
      setModelReady(true)
    } catch (err) {
      loadingModelRef.current = false
      throw err
    }
  }, [])

  const preload = useCallback(async () => {
    pendingActionRef.current = 'preload'
    setStatus('loading')
    setError(null)
    setErrorAction(null)
    try {
      const transcriber = await ensureTranscriber()
      await loadModel(transcriber)
      setStatus('idle')
      pendingActionRef.current = null
      return true
    } catch (err) {
      reportError(err, 'model-load', 'preload')
      return false
    }
  }, [ensureTranscriber, loadModel, reportError])

  const start = useCallback(async () => {
    pendingActionRef.current = 'start'
    setError(null)
    setErrorAction(null)

    try {
      const permission = await navigator.permissions
        ?.query({ name: 'microphone' as PermissionName })
        .catch(() => null)
      if (permission?.state === 'denied') {
        reportError('PermissionDenied', 'start', 'start')
        return false
      }

      setStatus('loading')
      const transcriber = await ensureTranscriber()

      if (!modelReady) {
        try {
          await loadModel(transcriber)
        } catch (err) {
          reportError(err, 'model-load', 'start')
          return false
        }
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
      pendingActionRef.current = null
      return true
    } catch (err) {
      cleanupStream()
      reportError(err, 'start', 'start')
      return false
    }
  }, [cleanupStream, deviceId, ensureTranscriber, loadModel, modelReady, reportError])

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

  const errorMessage = error?.summary ?? null

  return {
    status,
    partialTranscript,
    committedTranscript,
    errorMessage,
    error,
    errorAction,
    modelReady,
    start,
    stop,
    preload,
    resetTranscript,
    clearError,
  } satisfies SpeechStreamState & {
    start: () => Promise<boolean>
    stop: () => void
    preload: () => Promise<boolean>
    resetTranscript: () => void
    clearError: () => void
  }
}
