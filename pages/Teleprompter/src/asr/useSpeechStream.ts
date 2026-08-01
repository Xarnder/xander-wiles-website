import { useCallback, useEffect, useRef, useState } from 'react'
import { patchMoonshineGenerate } from './moonshinePatch'
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
  recorderOptionsCandidates,
  RECORDER_TIMESLICE_MS,
  requireSecureContextForRecording,
  resetAudioSession,
  warmCaptureTracks,
  type FacingMode,
  type VideoResolution,
} from '../media/platform'

export type SpeechStatus = 'idle' | 'loading' | 'listening' | 'error'

export type SpeechErrorAction = 'preload' | 'start' | 'record'

export interface RecordingResult {
  blob: Blob
  mimeType: string
  filename: string
  recordedAt: number
  /** Wall-clock length of the take (ms) while the recorder was active. */
  elapsedMs: number
}

export interface SpeechStreamState {
  status: SpeechStatus
  partialTranscript: string
  committedTranscript: string
  errorMessage: string | null
  error: SpeechErrorInfo | null
  errorAction: SpeechErrorAction | null
  modelReady: boolean
  /** Live capture stream (includes video while recording). */
  captureStream: MediaStream | null
  recordingActive: boolean
  /** True while start/stop recording work is in flight. */
  recordingBusy: boolean
  /** Epoch ms when the current take started (for elapsed timer). */
  recordingStartedAt: number | null
  recordingResult: RecordingResult | null
  recordingSupported: boolean
}

export interface UseSpeechStreamOptions {
  modelId?: string
  deviceId?: string | null
  facingMode?: FacingMode
  videoResolution?: VideoResolution
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

function hasLiveVideo(stream: MediaStream | null): boolean {
  return Boolean(
    stream?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled),
  )
}

function hasLiveAudio(stream: MediaStream | null): boolean {
  return Boolean(
    stream?.getAudioTracks().some((t) => t.readyState === 'live' && t.enabled),
  )
}

/**
 * On-device streaming ASR via MoonshineJS.
 * Voice-follow (start/stop) and camera recording are independent;
 * when both run, they share the same microphone tracks.
 */
export function useSpeechStream(options: UseSpeechStreamOptions = {}) {
  const {
    modelId = 'model/tiny',
    deviceId = null,
    facingMode = 'user',
    videoResolution = '720p',
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
  const [recordingBusy, setRecordingBusy] = useState(false)
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(
    null,
  )
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
  const facingModeRef = useRef(facingMode)
  const videoResolutionRef = useRef(videoResolution)
  const listeningRef = useRef(false)
  const recordingActiveRef = useRef(false)
  const recordingOpRef = useRef<'idle' | 'starting' | 'stopping'>('idle')
  const stopPromiseRef = useRef<Promise<RecordingResult | null> | null>(null)
  const recordingStartedAtRef = useRef<number | null>(null)
  const stopRecordingRef = useRef<() => Promise<void>>(async () => {})
  const recorderHealthTimerRef = useRef<number | null>(null)

  useEffect(() => {
    onPartialRef.current = onPartial
    onCommittedRef.current = onCommitted
  }, [onPartial, onCommitted])

  useEffect(() => {
    facingModeRef.current = facingMode
  }, [facingMode])

  useEffect(() => {
    videoResolutionRef.current = videoResolution
  }, [videoResolution])

  useEffect(() => {
    listeningRef.current = status === 'listening'
  }, [status])

  useEffect(() => {
    recordingActiveRef.current = recordingActive
  }, [recordingActive])

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

  const stopVideoTracks = useCallback(() => {
    const stream = streamRef.current
    if (!stream) {
      setCaptureStream(null)
      return
    }
    stream.getVideoTracks().forEach((t) => {
      try {
        t.stop()
      } catch {
        // ignore
      }
    })
    // Keep audio-only stream for ASR; clear camera preview.
    setCaptureStream(null)
  }, [])

  const clearRecorderHealthTimer = useCallback(() => {
    if (recorderHealthTimerRef.current != null) {
      window.clearInterval(recorderHealthTimerRef.current)
      recorderHealthTimerRef.current = null
    }
  }, [])

  const stopRecorder = useCallback(async (): Promise<RecordingResult | null> => {
    if (stopPromiseRef.current) {
      return stopPromiseRef.current
    }

    const recorder = recorderRef.current
    clearRecorderHealthTimer()
    if (!recorder || recorder.state === 'inactive') {
      recorderRef.current = null
      setRecordingActive(false)
      recordingActiveRef.current = false
      setRecordingStartedAt(null)
      recordingStartedAtRef.current = null
      return null
    }

    const startedAt = recordingStartedAtRef.current
    const apple = isAppleMobile()

    const promise = new Promise<RecordingResult | null>((resolve) => {
      let settled = false
      let stopSeen = false
      let settleTimer: number | null = null
      let hardTimer: number | null = null

      const clearTimers = () => {
        if (settleTimer != null) window.clearTimeout(settleTimer)
        if (hardTimer != null) window.clearTimeout(hardTimer)
        settleTimer = null
        hardTimer = null
      }

      const buildResult = (): RecordingResult | null => {
        const mimeType =
          recorder.mimeType || recordingMimeRef.current || 'video/mp4'
        const chunks = chunksRef.current.slice()
        if (!chunks.length) return null
        const blob = new Blob(chunks, { type: mimeType })
        const elapsedMs = startedAt != null ? Date.now() - startedAt : 0
        const tooSmall =
          blob.size < 64 || (blob.size < 1024 && elapsedMs < 350)
        if (tooSmall) return null
        return {
          blob,
          mimeType,
          filename: makeRecordingFilename(mimeType),
          recordedAt: Date.now(),
          elapsedMs,
        }
      }

      const finish = () => {
        if (settled) return
        settled = true
        clearTimers()
        const result = buildResult()
        chunksRef.current = []
        recorderRef.current = null
        setRecordingActive(false)
        recordingActiveRef.current = false
        setRecordingStartedAt(null)
        recordingStartedAtRef.current = null
        resolve(result)
      }

      /** Safari often delivers the final dataavailable slightly after onstop. */
      const scheduleSettle = (delayMs: number) => {
        if (settled) return
        if (settleTimer != null) window.clearTimeout(settleTimer)
        settleTimer = window.setTimeout(finish, delayMs)
      }

      // Keep collecting until we settle — including late final chunks.
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
        if (stopSeen) {
          scheduleSettle(apple ? 350 : 120)
        }
      }

      recorder.onstop = () => {
        stopSeen = true
        // Wait for a possible trailing dataavailable before assembling the file.
        scheduleSettle(apple ? 400 : 150)
      }

      // stop() itself must emit the final dataavailable before onstop. Do not
      // requestData() first: forcing a separate final MP4 fragment has caused
      // long Safari recordings to end with audio but a frozen video timeline.
      try {
        if (recorder.state !== 'inactive') {
          recorder.stop()
        } else {
          stopSeen = true
          scheduleSettle(apple ? 250 : 100)
        }
      } catch {
        stopSeen = true
        scheduleSettle(100)
      }

      hardTimer = window.setTimeout(finish, 12_000)
    })

    stopPromiseRef.current = promise
    try {
      return await promise
    } finally {
      stopPromiseRef.current = null
    }
  }, [clearRecorderHealthTimer])

  const startRecorder = useCallback(
    (stream: MediaStream) => {
      if (!isMediaRecorderSupported()) {
        throw new DOMException(
          'Video recording is not supported in this browser.',
          'NotSupportedError',
        )
      }

      const mimeType = pickRecorderMimeType()
      const attempts = recorderOptionsCandidates(stream, mimeType)

      let recorder: MediaRecorder | null = null
      let lastError: unknown = null

      for (const options of attempts) {
        try {
          recorder = new MediaRecorder(stream, options)
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
      let lastChunkAt = Date.now()
      let lastFlushRequestAt = 0
      let videoMutedAt: number | null = null

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
          lastChunkAt = Date.now()
          lastFlushRequestAt = 0
        }
      }

      recorder.onerror = () => {
        clearRecorderHealthTimer()
        setRecordingActive(false)
        recordingActiveRef.current = false
        setRecordingStartedAt(null)
        recordingStartedAtRef.current = null
        reportError(
          new Error(
            'Camera recording failed while capturing. On iPhone, keep Safari/Chrome in the foreground and try again.',
          ),
          'runtime',
          'record',
        )
        void stopRecordingRef.current()
      }

      // Long recordings must be segmented. A single growing encoder/container
      // buffer can exhaust mobile resources: audio keeps flowing while video
      // stops producing frames. Ten-second chunks are long enough for MP4
      // keyframes and short enough to keep sustained capture bounded.
      try {
        recorder.start(RECORDER_TIMESLICE_MS)
      } catch (err) {
        throw err instanceof Error
          ? err
          : new DOMException(
              'MediaRecorder.start failed on this device.',
              'NotSupportedError',
            )
      }

      if (recorder.state !== 'recording' && recorder.state !== 'paused') {
        throw new DOMException(
          'Camera recorder did not enter the recording state.',
          'InvalidStateError',
        )
      }

      const startedAt = Date.now()
      recorderRef.current = recorder
      recordingStartedAtRef.current = startedAt
      setRecordingStartedAt(startedAt)
      setRecordingActive(true)
      recordingActiveRef.current = true

      clearRecorderHealthTimer()
      recorderHealthTimerRef.current = window.setInterval(() => {
        if (recorderRef.current !== recorder || recorder.state === 'inactive') {
          clearRecorderHealthTimer()
          return
        }

        const videoTrack = stream.getVideoTracks()[0]
        const cameraUnavailable =
          !videoTrack ||
          videoTrack.readyState === 'ended' ||
          !videoTrack.enabled

        if (cameraUnavailable) {
          clearRecorderHealthTimer()
          reportError(
            new Error(
              'The camera stopped during recording. The take was stopped immediately so it does not save a long frozen-video section.',
            ),
            'runtime',
            'record',
          )
          void stopRecordingRef.current()
          return
        }

        if (videoTrack.muted) {
          videoMutedAt ??= Date.now()
          if (Date.now() - videoMutedAt >= 4_000) {
            clearRecorderHealthTimer()
            reportError(
              new Error(
                'The camera stopped sending video frames. The take was stopped to preserve the usable audio and video recorded so far.',
              ),
              'runtime',
              'record',
            )
            void stopRecordingRef.current()
            return
          }
        } else {
          videoMutedAt = null
        }

        // A timeslice is advisory. If a browser misses two slices, ask it to
        // flush at the next keyframe instead of letting one buffer grow forever.
        const now = Date.now()
        if (
          recorder.state === 'recording' &&
          now - lastChunkAt > RECORDER_TIMESLICE_MS * 2.5 &&
          now - lastFlushRequestAt > RECORDER_TIMESLICE_MS
        ) {
          try {
            recorder.requestData()
            lastFlushRequestAt = now
          } catch {
            // The track checks above still protect against silent camera loss.
          }
        }
      }, 1_000)

      const onTrackEnded = () => {
        if (recorderRef.current !== recorder) return
        clearRecorderHealthTimer()
        reportError(
          new Error(
            'Camera or microphone stopped during recording. Keep the app open and avoid switching away mid-take.',
          ),
          'runtime',
          'record',
        )
        void stopRecordingRef.current()
      }
      for (const track of stream.getTracks()) {
        track.addEventListener('ended', onTrackEnded, { once: true })
      }
    },
    [clearRecorderHealthTimer, reportError],
  )

  const loadMoonshine = useCallback(async () => {
    if (moonshineRef.current) return moonshineRef.current
    try {
      const mod = await import('@moonshine-ai/moonshine-js')
      patchMoonshineGenerate(mod)
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
          try {
            transcriberRef.current?.stop()
          } catch {
            // ignore
          }
          transcriberRef.current = null
          listeningRef.current = false
          // Keep camera recording running if it was started separately.
          if (!recordingActiveRef.current) {
            stopTracks()
            resetAudioSession()
          }
          reportError(error, context, 'start')
        },
        onTranscribeStarted() {
          setStatus('listening')
          listeningRef.current = true
        },
        onTranscribeStopped() {
          listeningRef.current = false
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
      false,
      'quantized',
    )

    transcriberRef.current = transcriber
    return transcriber
  }, [loadMoonshine, modelId, reportError, stopTracks])

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
      setStatus(listeningRef.current ? 'listening' : 'idle')
      pendingActionRef.current = null
      return true
    } catch (err) {
      reportError(err, 'model-load', 'preload')
      return false
    }
  }, [ensureTranscriber, loadModel, reportError])

  /** Pause voice-follow only — leaves an active camera recording running. */
  const stop = useCallback(async () => {
    try {
      transcriberRef.current?.stop()
    } catch {
      // ignore
    }
    transcriberRef.current = null
    listeningRef.current = false

    if (!recordingActiveRef.current) {
      stopTracks()
      resetAudioSession()
    }

    setStatus((s) => (s === 'error' ? 'error' : 'idle'))
  }, [stopTracks])

  /** Start voice-follow independently of recording. */
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

      // Reuse mic from an active recording when possible.
      let stream = streamRef.current
      if (!hasLiveAudio(stream)) {
        stream = await getCaptureStream({
          deviceId,
          recordCamera: recordingActiveRef.current,
          facingMode: facingModeRef.current,
          videoResolution: videoResolutionRef.current,
        })
        streamRef.current = stream
        if (hasLiveVideo(stream)) {
          setCaptureStream(stream)
        }
      }

      const asrStream = hasLiveVideo(stream)
        ? audioOnlyStream(stream!)
        : stream!
      transcriber.attachStream(asrStream)
      await transcriber.start()
      setStatus('listening')
      listeningRef.current = true
      pendingActionRef.current = null
      return true
    } catch (err) {
      listeningRef.current = false
      if (!recordingActiveRef.current) {
        stopTracks()
        resetAudioSession()
      }
      reportError(err, 'start', 'start')
      return false
    }
  }, [
    deviceId,
    ensureTranscriber,
    loadModel,
    modelReady,
    reportError,
    stopTracks,
  ])

  /** Start camera recording independently of voice-follow. */
  const startRecording = useCallback(async () => {
    if (recordingOpRef.current !== 'idle') return false
    if (recordingActiveRef.current) return true

    recordingOpRef.current = 'starting'
    setRecordingBusy(true)
    pendingActionRef.current = 'record'
    setError(null)
    setErrorAction(null)

    try {
      if (!isMediaRecorderSupported()) {
        reportError(
          new DOMException(
            'Video recording is not supported in this browser.',
            'NotSupportedError',
          ),
          'start',
          'record',
        )
        return false
      }
      requireSecureContextForRecording()

      const wasListening = listeningRef.current

      // Already have a live AV stream — just start the recorder.
      if (hasLiveVideo(streamRef.current) && hasLiveAudio(streamRef.current)) {
        startRecorder(streamRef.current!)
        setCaptureStream(streamRef.current)
        pendingActionRef.current = null
        return true
      }

      // Need a fresh AV stream (upgrade from audio-only or cold start).
      if (wasListening) {
        try {
          transcriberRef.current?.stop()
        } catch {
          // ignore
        }
      }

      const oldStream = streamRef.current
      const stream = await getCaptureStream({
        deviceId,
        recordCamera: true,
        facingMode: facingModeRef.current,
        videoResolution: videoResolutionRef.current,
      })
      await warmCaptureTracks(stream, { requireVideo: true })

      // Aborted or superseded while awaiting camera.
      if (recordingOpRef.current !== 'starting') {
        stream.getTracks().forEach((t) => {
          try {
            t.stop()
          } catch {
            // ignore
          }
        })
        return false
      }

      oldStream?.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch {
          // ignore
        }
      })

      streamRef.current = stream
      setCaptureStream(stream)
      startRecorder(stream)

      if (wasListening) {
        const transcriber = await ensureTranscriber()
        if (!modelReady) {
          await loadModel(transcriber)
        }
        transcriber.attachStream(audioOnlyStream(stream))
        await transcriber.start()
        setStatus('listening')
        listeningRef.current = true
      }

      pendingActionRef.current = null
      return true
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        reportError(
          new Error('Camera or microphone permission denied'),
          'start',
          'record',
        )
      } else {
        reportError(err, 'start', 'record')
      }
      if (!listeningRef.current) {
        stopTracks()
        resetAudioSession()
      }
      return false
    } finally {
      if (recordingOpRef.current === 'starting') {
        recordingOpRef.current = 'idle'
      }
      setRecordingBusy(false)
    }
  }, [
    deviceId,
    ensureTranscriber,
    loadModel,
    modelReady,
    reportError,
    startRecorder,
    stopTracks,
  ])

  /** Stop camera recording only — leaves voice-follow running if active. */
  const stopRecording = useCallback(async () => {
    if (recordingOpRef.current === 'stopping') {
      if (stopPromiseRef.current) await stopPromiseRef.current
      return
    }

    // Still connecting camera — cancel the start path.
    if (recordingOpRef.current === 'starting' && !recordingActiveRef.current) {
      recordingOpRef.current = 'idle'
      setRecordingBusy(false)
      return
    }

    recordingOpRef.current = 'stopping'
    setRecordingBusy(true)

    try {
      const expectFile = Boolean(
        recorderRef.current && recorderRef.current.state !== 'inactive',
      )
      // Keep camera tracks live until the recorder has fully flushed.
      const recorded = await stopRecorder()

      if (recorded) {
        setRecordingResult(recorded)
      } else if (expectFile) {
        reportError(
          new Error(
            'Recording produced an empty video file. On iPhone, allow Camera and Microphone for Safari/Chrome, keep the screen on, and try a longer take.',
          ),
          'runtime',
          'record',
        )
      }

      // Brief pause so the encoder can release before we tear down tracks.
      await new Promise<void>((r) => window.setTimeout(r, 60))

      if (listeningRef.current) {
        stopVideoTracks()
      } else {
        stopTracks()
        resetAudioSession()
      }
    } finally {
      recordingOpRef.current = 'idle'
      setRecordingBusy(false)
    }
  }, [reportError, stopRecorder, stopTracks, stopVideoTracks])

  stopRecordingRef.current = stopRecording

  const resetTranscript = useCallback(() => {
    committedAccRef.current = ''
    setCommittedTranscript('')
    setPartialTranscript('')
  }, [])

  // Warn before leaving mid-take.
  useEffect(() => {
    if (!recordingActive) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [recordingActive])

  // iOS suspends camera frames when Safari/Chrome is backgrounded but may keep
  // muxing audio. Stop immediately so the saved take cannot acquire a long
  // frozen-video tail.
  useEffect(() => {
    if (!recordingActive || !isAppleMobile()) return
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return
      reportError(
        new Error(
          'Recording stopped because the app went into the background. Keep it visible during a take so the camera keeps sending video frames.',
        ),
        'runtime',
        'record',
      )
      void stopRecordingRef.current()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [recordingActive, reportError])

  useEffect(() => {
    return () => {
      clearRecorderHealthTimer()
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
  }, [clearRecorderHealthTimer, stopTracks])

  return {
    status,
    partialTranscript,
    committedTranscript,
    errorMessage: error?.summary ?? null,
    error,
    errorAction,
    modelReady,
    captureStream,
    recordingActive,
    recordingBusy,
    recordingStartedAt,
    recordingResult,
    recordingSupported: isMediaRecorderSupported(),
    start,
    stop,
    startRecording,
    stopRecording,
    preload,
    resetTranscript,
    clearError,
    clearRecordingResult,
  } satisfies SpeechStreamState & {
    start: () => Promise<boolean>
    stop: () => Promise<void>
    startRecording: () => Promise<boolean>
    stopRecording: () => Promise<void>
    preload: () => Promise<boolean>
    resetTranscript: () => void
    clearError: () => void
    clearRecordingResult: () => void
  }
}
