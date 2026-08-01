declare module '@moonshine-ai/moonshine-js' {
  export interface TranscriberCallbacks {
    onPermissionsRequested: () => unknown
    onError: (error: unknown) => unknown
    onModelLoadStarted: () => unknown
    onModelLoaded: () => unknown
    onTranscribeStarted: () => unknown
    onTranscribeStopped: () => unknown
    onTranscriptionUpdated: (text: string) => unknown
    onTranscriptionCommitted: (text: string, buffer?: AudioBuffer) => unknown
    onFrame: (probs: unknown, frame: Float32Array, ema: number) => unknown
    onSpeechStart: () => unknown
    onSpeechEnd: () => unknown
  }

  export const Settings: {
    FRAME_SIZE: number
    STREAM_UPDATE_INTERVAL: number
    STREAM_COMMIT_MIN_INTERVAL: number
    STREAM_COMMIT_MAX_INTERVAL: number
    STREAM_COMMIT_EMA_THRESHOLD: number
    STREAM_COMMIT_EMA_PERIOD: number
    VAD_COMMIT_INTERVAL: number
    BASE_ASSET_PATH: {
      MOONSHINE: string
      ONNX_RUNTIME: string
      SILERO_VAD: string
    }
    VERBOSE_LOGGING: boolean
  }

  export const MoonshineError: {
    PermissionDenied: string
    PlatformUnsupported: string
  }

  export class MoonshineModel {
    constructor(modelURL: string, precision?: string)
    loadModel(): Promise<void>
    generate(audio: Float32Array): Promise<string | undefined>
    isLoaded(): boolean
    isLoading(): boolean
  }

  export class Transcriber {
    callbacks: TranscriberCallbacks
    isActive: boolean
    constructor(
      modelURL: string,
      callbacks?: Partial<TranscriberCallbacks>,
      useVAD?: boolean,
      precision?: string,
    )
    attachStream(stream: MediaStream): void
    detachStream(): void
    load(): Promise<void>
    start(): Promise<void>
    stop(): void
  }

  export class MicrophoneTranscriber extends Transcriber {
    constructor(
      modelURL: string,
      callbacks?: Partial<TranscriberCallbacks>,
      useVAD?: boolean,
      precision?: string,
    )
    start(): Promise<void>
  }
}
