/**
 * MoonshineJS always runs Silero VAD for framing. In streaming mode
 * (`useVAD: false`), VAD `onSpeechEnd` still calls `MoonshineModel.generate`
 * on whatever is left in the speech buffer — often empty or a few samples
 * after a streaming commit already flushed. That path has no `.catch()`, so
 * ONNX throws an uncaught "Invalid input shape" / OrtRun error.
 *
 * Guard short buffers and swallow inference failures so voice-follow keeps
 * running.
 */

type MoonshineModule = typeof import('@moonshine-ai/moonshine-js')

/** One Silero v5 frame — Conv front-end needs at least this much audio. */
const MIN_GENERATE_SAMPLES = 512

const PATCHED = Symbol.for('teleprompter.moonshineGeneratePatched')

export function patchMoonshineGenerate(mod: MoonshineModule): void {
  const Model = mod.MoonshineModel
  if (!Model?.prototype) return

  const proto = Model.prototype as {
    generate: (audio: Float32Array) => Promise<string | undefined>
    [PATCHED]?: boolean
  }
  if (proto[PATCHED]) return

  const original = proto.generate
  if (typeof original !== 'function') return

  proto.generate = async function patchedGenerate(
    this: unknown,
    audio: Float32Array,
  ): Promise<string | undefined> {
    if (!audio || audio.length < MIN_GENERATE_SAMPLES) {
      return ''
    }
    try {
      return await original.call(this, audio)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Empty/near-empty leftovers from VAD speech-end are expected in streaming.
      if (/Invalid input shape|OrtRun|ERROR_CODE:\s*2/i.test(message)) {
        return ''
      }
      console.warn('[asr] Moonshine generate failed:', err)
      return ''
    }
  }

  proto[PATCHED] = true
}
