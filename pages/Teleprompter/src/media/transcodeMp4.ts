import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { extensionForMime } from './platform'

const FFMPEG_CORE_BASE =
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'

let ffmpegSingleton: FFmpeg | null = null
let ffmpegLoadPromise: Promise<FFmpeg> | null = null

export function isAlreadyMp4(mimeType: string, filename?: string): boolean {
  const mime = (mimeType || '').toLowerCase()
  if (mime.includes('mp4') || mime.includes('m4v') || mime.includes('avc1')) {
    return true
  }
  return Boolean(filename && /\.mp4$/i.test(filename))
}

export function recordingFormatLabel(mimeType: string, filename: string): string {
  const ext = extensionForMime(mimeType) || filename.split('.').pop() || 'video'
  return ext.toUpperCase()
}

export function mp4FilenameFrom(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '') || 'teleprompter-recording'
  return `${base}.mp4`
}

async function loadFfmpeg(
  onStatus?: (message: string) => void,
): Promise<FFmpeg> {
  if (ffmpegSingleton?.loaded) return ffmpegSingleton
  if (ffmpegLoadPromise) return ffmpegLoadPromise

  ffmpegLoadPromise = (async () => {
    onStatus?.('Loading video converter…')
    const ffmpeg = new FFmpeg()
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(
          `${FFMPEG_CORE_BASE}/ffmpeg-core.js`,
          'text/javascript',
        ),
        wasmURL: await toBlobURL(
          `${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`,
          'application/wasm',
        ),
      })
      ffmpegSingleton = ffmpeg
      return ffmpeg
    } catch (err) {
      ffmpegLoadPromise = null
      throw err instanceof Error
        ? err
        : new Error('Could not load the MP4 converter. Check your connection and try again.')
    }
  })()

  return ffmpegLoadPromise
}

export interface TranscodeProgress {
  /** 0–1 overall progress once encoding starts; null while loading. */
  ratio: number | null
  message: string
}

/**
 * Re-encode a recording blob to H.264/AAC MP4 in the browser (ffmpeg.wasm).
 * First run downloads the converter (~30MB, then cached).
 */
export async function transcodeRecordingToMp4(
  blob: Blob,
  filename: string,
  options?: {
    onProgress?: (progress: TranscodeProgress) => void
    signal?: AbortSignal
  },
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const { onProgress, signal } = options ?? {}

  if (signal?.aborted) {
    throw new DOMException('Conversion cancelled.', 'AbortError')
  }

  if (isAlreadyMp4(blob.type || '', filename)) {
    const outName = mp4FilenameFrom(filename)
    const typed =
      blob.type.includes('mp4')
        ? blob
        : new Blob([blob], { type: 'video/mp4' })
    return { blob: typed, filename: outName, mimeType: 'video/mp4' }
  }

  const ffmpeg = await loadFfmpeg((message) =>
    onProgress?.({ ratio: null, message }),
  )

  if (signal?.aborted) {
    throw new DOMException('Conversion cancelled.', 'AbortError')
  }

  const onAbort = () => {
    try {
      ffmpeg.terminate()
    } catch {
      // ignore
    }
    ffmpegSingleton = null
    ffmpegLoadPromise = null
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  const progressHandler = ({ progress }: { progress: number }) => {
    const ratio = Math.min(1, Math.max(0, progress))
    onProgress?.({
      ratio,
      message: `Converting to MP4… ${Math.round(ratio * 100)}%`,
    })
  }
  ffmpeg.on('progress', progressHandler)

  const inExt = extensionForMime(blob.type) || 'webm'
  const inputName = `input.${inExt}`
  const outputName = 'output.mp4'

  try {
    onProgress?.({ ratio: 0, message: 'Preparing conversion…' })
    await ffmpeg.writeFile(inputName, await fetchFile(blob))

    if (signal?.aborted) {
      throw new DOMException('Conversion cancelled.', 'AbortError')
    }

    onProgress?.({ ratio: 0, message: 'Converting to MP4… 0%' })

    // Fast preset for interactive export; +faststart helps progressive playback.
    const code = await ffmpeg.exec([
      '-i',
      inputName,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '-pix_fmt',
      'yuv420p',
      outputName,
    ])

    if (code !== 0) {
      throw new Error('MP4 conversion failed. Try downloading the original format instead.')
    }

    const data = await ffmpeg.readFile(outputName)
    const bytes =
      data instanceof Uint8Array
        ? data
        : new TextEncoder().encode(String(data))
    // Copy into a plain ArrayBuffer-backed view for Blob Part compatibility.
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)

    const outBlob = new Blob([copy], { type: 'video/mp4' })
    if (outBlob.size < 64) {
      throw new Error('MP4 conversion produced an empty file.')
    }

    onProgress?.({ ratio: 1, message: 'MP4 ready' })
    return {
      blob: outBlob,
      filename: mp4FilenameFrom(filename),
      mimeType: 'video/mp4',
    }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    ffmpeg.off('progress', progressHandler)
    try {
      await ffmpeg.deleteFile(inputName)
    } catch {
      // ignore
    }
    try {
      await ffmpeg.deleteFile(outputName)
    } catch {
      // ignore
    }
  }
}
