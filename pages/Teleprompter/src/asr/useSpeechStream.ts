import { useCallback, useEffect, useRef, useState } from 'react'
import {
  classifySpeechError,
  type SpeechErrorInfo,
} from './speechErrors'
import {
  audioOnlyStream,
  extensionForMime,
  getCaptureStream,
  isAppleMobile,
  isMediaRecorderSupported,
  pickRecorderMimeType,
  requireSecureContextForRecording,
  resetAudioSession,
  warmCaptureTracks,
  type FacingMode,
} from '../media/platform'

export type SpeechStatus = 'idle' | 'loading' | 'listening' | 'error'

export type SpeechErrorAction = 'preload' | 'start'

export interface RecordingResult {
  blob: Blob
  mimeType: string
  filename: string
  recordedAt: number
}

export interface SpeechStreamState {
  status: SpeechStatus
  partialTranscript: string
  committedTranscript: string
  errorMessage: string | null
  error: SpeechErrorInfo | null
  /** Which user action to retry after dismissing the error popup. */
  errorAction: SpeechErrorAction | null
  modelReady: boolean
  /** Live capture stream (includes video when recording). */
  captureStream: MediaStream | null
  /** True while MediaRecorder is active. */
  recordingActive: boolean
  /** Finished take waiting for the user to save/share. */
  recordingResult: RecordingResult | null
  recordingSupported: boolean
}

export interface UseSpeechStreamOptions {
  /** Moonshine model id relative to asset base, e.g. "model/tiny". */
  modelId?: string
  deviceId?: string | null
  /** Open camera and record A/V while listening (same mic feeds ASR). */
  recordCamera?: boolean
  facingMode?: FacingMode
  onPartial?: (text: string) => void
  onCommitted?: (text: string) => void
}

type MoonshineModule = typeof import('@moonshine-ai/moonshine-js')
type TranscriberInstance = InstanceType<MoonshineModule['Transcriber']>

function resolveMoonshineBase(): string {
  const base = import.meta.env.BASE_URL || '/'
  return new URL('moonshine/', window.location.origin + base).href
}

function makeRecordingFilename(mimeType: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `teleprompter-${stamp}.${extensionForMime(mimeType)}`
}

/**
 * On-device streaming ASR via MoonshineJS.
 * useVAD=false → onTranscriptionUpdated fires on a rapid interval (streaming).
 * Optional camera recording shares the same microphone tracks with ASR.
 */
export function useSpeechStream(options: UseSpeechStreamOptions = {}) {
  const {
    modelId = 'model/tiny',
    deviceId = null,
    recordCamera = false,
    facingMode = 'user',
    onPartial,
    onCommitted,
  } = options

  const [status, setStatus] = useState<SpeechStatus>('idle')
  const [partialTranscript, setPartialTranscript] = useState('')
  const [committedTranscript, setCommittedTranscript] = useState('')
  const [error, setError] = useState<SpeechErrorInfo | null>(null)
  const [errorAction, setErrorAction] = useState<SpeechErrorAction | null>(null)
  const [modelReady, setModelReady] = useState(false)
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null)
  const [recordingActive, setRecordingActive] = useState(false)
  const [recordingResult, setRecordingResult] = useState<RecordingResult | null>(
    null,
  )

  const moonshineRef = useRef<MoonshineModule | null>(null)
  const transcriberRef = useRef<TranscriberInstance | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingMimeRef = useRef<string>('video/mp4')
  const onPartialRef = useRef(onPartial)
  const onCommittedRef = useRef(onCommitted)
  const committedAccRef = useRef('')
  const loadingModelRef = useRef(false)
  const pendingActionRef = useRef<SpeechErrorAction | null>(null)
  const recordCameraRef = useRef(recordCamera)
  const facingModeRef = useRef(facingMode)
  const stopPromiseRef = useRef<Promise<void> | null>(null)
  const stopSessionRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    onPartialRef.current = onPartial
    onCommittedRef.current = onCommitted
  }, [onPartial, onCommitted])

  useEffect(() => {
    recordCameraRef.current = recordCamera
  }, [recordCamera])

  useEffect(() => {
    facingModeRef.current = facingMode
  }, [facingMode])

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

  const clearRecordingResult = useCallback(() => {
    setRecordingResult(null)
  }, [])

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop()
      } catch {
        // ignore
      }
    })
    streamRef.current = null
    setCaptureStream(null)
  }, [])

  const stopRecorder = useCallback(async (): Promise<RecordingResult | null> => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      recorderRef.current = null
      setRecordingActive(false)
      return null
    }

    const result = await new Promise<RecordingResult | null>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        const mimeType =
          recorder.mimeType || recordingMimeRef.current || 'video/mp4'
        const chunks = chunksRef.current
        chunksRef.current = []
        recorderRef.current = null
        setRecordingActive(false)
        if (!chunks.length) {
          resolve(null)
          return
        }
        const blob = new Blob(chunks, { type: mimeType })
        // Tiny blobs are almost always a failed WebKit encode.
        if (blob.size < 256) {
          resolve(null)
          return
        }
        resolve({
          blob,
          mimeType,
          filename: makeRecordingFilename(mimeType),
          recordedAt: Date.now(),
        })
      }

      recorder.onstop = finish
      try {
        // Flush the current buffer before stop — important on iOS WebKit.
        if (typeof recorder.requestData === 'function') {
          recorder.requestData()
        }
      } catch {
        // ignore
      }
      window.setTimeout(() => {
        try {
          if (recorder.state !== 'inactive') recorder.stop()
          else finish()
        } catch {
          finish()
        }
      }, isAppleMobile() ? 120 : 0)
      // Safety: never hang if onstop never fires.
      window.setTimeout(finish, 4000)
    })

    return result
  }, [])

  const startRecorder = useCallback(
    (stream: MediaStream) => {
      if (!isMediaRecorderSupported()) {
        throw new DOMException(
          'Video recording is not supported in this browser.',
          'NotSupportedError',
        )
      }

      const mimeType = pickRecorderMimeType()
      const attempts: Array<MediaRecorderOptions | undefined> = mimeType
        ? [{ mimeType }, undefined]
        : [undefined]

      let recorder: MediaRecorder | null = null
      let lastError: unknown = null

      for (const options of attempts) {
        try {
          recorder = options
            ? new MediaRecorder(stream, options)
            : new MediaRecorder(stream)
          break
        } catch (err) {
          lastError = err
          recorder = null
        }
      }

      if (!recorder) {
        throw lastError instanceof Error
          ? lastError
          : new DOMException(
              'Could not create a video recorder in this browser.',
              'NotSupportedError',
            )
      }

      recordingMimeRef.current = recorder.mimeType || mimeType || 'video/mp4'
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        setRecordingActive(false)
        reportError(
          new Error(
            'Camera recording failed while capturing. On iPhone, keep Safari/Chrome in the foreground and try again.',
          ),
          'runtime',
          'start',
        )
        void stopSessionRef.current()
      }

      // timeslice helps WebKit deliver chunks before stop; fall back if rejected.
      try {
        recorder.start(1000)
      } catch {
        try {
          recorder.start()
        } catch (err) {
          throw err instanceof Error
            ? err
            : new DOMException(
                'MediaRecorder.start failed on this device.',
                'NotSupportedError',
              )
        }
      }

      if (recorder.state !== 'recording' && recorder.state !== 'paused') {
        throw new DOMException(
          'Camera recorder did not enter the recording state.',
          'InvalidStateError',
        )
      }

      recorderRef.current = recorder
      setRecordingActive(true)

      // Watch for mid-session track loss (common if iOS interrupts capture).
      const onTrackEnded = () => {
        if (recorderRef.current !== recorder) return
        reportError(
          new Error(
            'Camera or microphone stopped during recording. Keep the app open and avoid switching away mid-take.',
          ),
          'runtime',
          'start',
        )
        void stopSessionRef.current()
      }
      for (const track of stream.getTracks()) {
        track.addEventListener('ended', onTrackEnded, { once: true })
      }
    },
    [reportError],
  )

  const stop = useCallback(async () => {
    if (stopPromiseRef.current) {
      await stopPromiseRef.current
      return
    }

    const run = (async () => {
      const expectFile = Boolean(
        recorderRef.current && recorderRef.current.state !== 'inactive',
      )
      const recorded = await stopRecorder()
      if (recorded) {
        setRecordingResult(recorded)
      } else if (expectFile) {
        reportError(
          new Error(
            'Recording produced an empty video file. On iPhone, allow Camera and Microphone for Safari/Chrome, keep the screen on, and try a longer take.',
          ),
          'runtime',
          'start',
        )
      }

      try {
        transcriberRef.current?.stop()
      } catch {
        // ignore
      }
      // Drop instance so the next start re-attaches a fresh mic graph.
      // Model weights remain cached on Transcriber's static map.
      transcriberRef.current = null
      stopTracks()
      resetAudioSession()
      setStatus((s) => (s === 'error' ? 'error' : 'idle'))
    })()

    stopPromiseRef.current = run
    try {
      await run
    } finally {
      if (stopPromiseRef.current === run) stopPromiseRef.current = null
    }
  }, [reportError, stopRecorder, stopTracks])

  stopSessionRef.current = stop

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
          void stopRecorder()
          reportError(error, context)
          stopTracks()
          resetAudioSession()
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
  }, [loadMoonshine, modelId, reportError, stopRecorder, stopTracks])

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

    const wantRecord = recordCameraRef.current

    try {
      if (stopPromiseRef.current) {
        await stopPromiseRef.current
      }

      if (wantRecord && !isMediaRecorderSupported()) {
        reportError(
          new DOMException(
            'Video recording is not supported in this browser.',
            'NotSupportedError',
          ),
          'start',
          'start',
        )
        return false
      }

      if (wantRecord) {
        requireSecureContextForRecording()
      }

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

      await stopRecorder()
      stopTracks()

      const stream = await getCaptureStream({
        deviceId,
        recordCamera: wantRecord,
        facingMode: facingModeRef.current,
      })

      if (wantRecord) {
        await warmCaptureTracks(stream, { requireVideo: true })
      }

      streamRef.current = stream
      setCaptureStream(stream)

      // Same mic tracks feed ASR and (when enabled) the video file.
      const asrStream = wantRecord ? audioOnlyStream(stream) : stream
      transcriber.attachStream(asrStream)

      if (wantRecord) {
        startRecorder(stream)
      }

      await transcriber.start()
      setStatus('listening')
      pendingActionRef.current = null
      return true
    } catch (err) {
      void stopRecorder()
      stopTracks()
      resetAudioSession()
      const name = err instanceof DOMException ? err.name : ''
      if (
        wantRecord &&
        (name === 'NotAllowedError' || name === 'PermissionDeniedError')
      ) {
        reportError(
          new Error('Camera or microphone permission denied'),
          'start',
          'start',
        )
      } else {
        reportError(err, 'start', 'start')
      }
      return false
    }
  }, [
    deviceId,
    ensureTranscriber,
    loadModel,
    modelReady,
    reportError,
    startRecorder,
    stopRecorder,
    stopTracks,
  ])

  const resetTranscript = useCallback(() => {
    committedAccRef.current = ''
    setCommittedTranscript('')
    setPartialTranscript('')
  }, [])

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop()
      } catch {
        // ignore
      }
      try {
        transcriberRef.current?.stop()
      } catch {
        // ignore
      }
      stopTracks()
      resetAudioSession()
    }
  }, [stopTracks])

  const errorMessage = error?.summary ?? null
  const recordingSupported = isMediaRecorderSupported()

  return {
    status,
    partialTranscript,
    committedTranscript,
    errorMessage,
    error,
    errorAction,
    modelReady,
    captureStream,
    recordingActive,
    recordingResult,
    recordingSupported,
    start,
    stop,
    preload,
    resetTranscript,
    clearError,
    clearRecordingResult,
  } satisfies SpeechStreamState & {
    start: () => Promise<boolean>
    stop: () => Promise<void>
    preload: () => Promise<boolean>
    resetTranscript: () => void
    clearError: () => void
    clearRecordingResult: () => void
  }
}
