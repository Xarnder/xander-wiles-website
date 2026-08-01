import { describe, expect, it, vi } from 'vitest'
import { patchMoonshineGenerate } from './moonshinePatch'

type GenerateFn = (audio: Float32Array) => Promise<string | undefined>

function makeFakeModel(generate: GenerateFn) {
  class FakeModel {
    // Prototype method only — instance fields would shadow the patch.
    declare generate: GenerateFn
  }
  FakeModel.prototype.generate = generate
  return FakeModel
}

describe('patchMoonshineGenerate', () => {
  it('skips inference for empty or tiny audio buffers', async () => {
    const generate = vi.fn<GenerateFn>(async () => 'hello')
    const FakeModel = makeFakeModel(generate)
    const mod = {
      MoonshineModel: FakeModel,
    } as unknown as typeof import('@moonshine-ai/moonshine-js')

    patchMoonshineGenerate(mod)

    const model = new FakeModel()
    await expect(model.generate(new Float32Array(0))).resolves.toBe('')
    await expect(model.generate(new Float32Array(1))).resolves.toBe('')
    await expect(model.generate(new Float32Array(511))).resolves.toBe('')
    expect(generate).not.toHaveBeenCalled()

    await expect(model.generate(new Float32Array(512))).resolves.toBe('hello')
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('swallows OrtRun invalid-shape failures', async () => {
    const generate = vi.fn<GenerateFn>(async () => {
      throw new Error(
        'failed to call OrtRun(). ERROR_CODE: 2, ERROR_MESSAGE: Invalid input shape: {1}',
      )
    })
    const FakeModel = makeFakeModel(generate)
    const mod = {
      MoonshineModel: FakeModel,
    } as unknown as typeof import('@moonshine-ai/moonshine-js')

    patchMoonshineGenerate(mod)

    const model = new FakeModel()
    await expect(model.generate(new Float32Array(2048))).resolves.toBe('')
  })

  it('is idempotent', () => {
    const FakeModel = makeFakeModel(async () => 'ok')
    const mod = {
      MoonshineModel: FakeModel,
    } as unknown as typeof import('@moonshine-ai/moonshine-js')

    patchMoonshineGenerate(mod)
    const first = FakeModel.prototype.generate
    patchMoonshineGenerate(mod)
    expect(FakeModel.prototype.generate).toBe(first)
  })
})
