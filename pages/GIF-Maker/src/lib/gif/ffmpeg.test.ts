import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	load: vi.fn(),
	instances: [] as { loaded: boolean; terminate: ReturnType<typeof vi.fn> }[]
}));
vi.mock('$app/paths', () => ({ resolve: () => '/pages/GIF-Maker/' }));
vi.mock('@ffmpeg/ffmpeg/worker?worker&url', () => ({ default: '/bundled-worker.js' }));
vi.mock('@ffmpeg/ffmpeg', () => ({
	FFmpeg: class {
		loaded = false;
		terminate = vi.fn(() => {
			this.loaded = false;
		});
		on = vi.fn();
		constructor() {
			mocks.instances.push(this);
		}
		async load(config: unknown) {
			await mocks.load(config);
			this.loaded = true;
		}
	}
}));

import { loadFfmpeg, terminateFfmpeg } from './ffmpeg';

afterEach(async () => {
	await terminateFfmpeg();
	mocks.load.mockReset();
	mocks.instances.length = 0;
	vi.unstubAllGlobals();
});

it('uses app-relative core URLs and a bundled worker', async () => {
	vi.stubGlobal('window', { location: { href: 'https://example.com/pages/GIF-Maker/' } });
	await loadFfmpeg();
	expect(mocks.load).toHaveBeenCalledWith(
		expect.objectContaining({
			classWorkerURL: '/bundled-worker.js',
			coreURL: 'https://example.com/pages/GIF-Maker/ffmpeg/core/ffmpeg-core.js',
			wasmURL: 'https://example.com/pages/GIF-Maker/ffmpeg/core/ffmpeg-core.wasm'
		})
	);
});

it('discards a failed load and permits retry', async () => {
	vi.stubGlobal('window', { location: { href: 'https://example.com/' } });
	mocks.load.mockRejectedValueOnce(new Error('Missing core'));
	await expect(loadFfmpeg()).rejects.toThrow('Missing core');
	expect(mocks.instances[0].terminate).toHaveBeenCalledOnce();
	await expect(loadFfmpeg()).resolves.toHaveProperty('ffmpeg.loaded', true);
	expect(mocks.instances).toHaveLength(2);
});

it('reloads after a conversion terminates the cached worker', async () => {
	vi.stubGlobal('window', { location: { href: 'https://example.com/' } });
	const first = await loadFfmpeg();
	first.ffmpeg.terminate();
	const second = await loadFfmpeg();
	expect(second.ffmpeg).not.toBe(first.ffmpeg);
	expect(second.ffmpeg.loaded).toBe(true);
});
