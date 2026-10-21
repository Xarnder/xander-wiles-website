import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HdriEnvironmentSystem } from '../HdriEnvironmentSystem';
import { loadEnvironmentTexture } from '../loadEnvironmentTexture';
import { createProceduralSkyTexture } from '../proceduralEnvironmentTexture';
import { createDefaultSkySettings } from '../SkyTypes';

const gpu = vi.hoisted(() => ({ compile: vi.fn(), convert: vi.fn(), dispose: vi.fn() }));
vi.mock('three', async (importOriginal) => {
	const actual = await importOriginal<typeof import('three')>();
	return {
		...actual,
		PMREMGenerator: class {
			compileEquirectangularShader = gpu.compile;
			fromEquirectangular = gpu.convert;
			dispose = gpu.dispose;
		}
	};
});
vi.mock('../loadEnvironmentTexture', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../loadEnvironmentTexture')>();
	return { ...actual, loadEnvironmentTexture: vi.fn() };
});
vi.mock('../proceduralEnvironmentTexture', () => ({ createProceduralSkyTexture: vi.fn() }));

const systems: HdriEnvironmentSystem[] = [];
let sources: THREE.Texture[];
let targets: THREE.WebGLRenderTarget[];
beforeEach(() => {
	sources = [];
	targets = [];
	vi.mocked(loadEnvironmentTexture).mockImplementation(async () => source());
	vi.mocked(createProceduralSkyTexture).mockImplementation(() => source());
	gpu.convert.mockImplementation(() => {
		const target = new THREE.WebGLRenderTarget(8, 8);
		vi.spyOn(target, 'dispose');
		targets.push(target);
		return target;
	});
});
afterEach(() => {
	for (const system of systems) system.dispose();
	systems.length = 0;
	vi.resetAllMocks();
});
function source() {
	const texture = new THREE.Texture({ close: vi.fn() });
	vi.spyOn(texture, 'dispose');
	sources.push(texture);
	return texture;
}
function setup() {
	const scene = new THREE.Scene();
	const settings = createDefaultSkySettings().hdri;
	const changed = vi.fn();
	const system = new HdriEnvironmentSystem({} as THREE.WebGLRenderer, scene, settings, changed);
	systems.push(system);
	const ready = () => system.initialize('#123456', '#abcdef');
	return { system, scene, settings, changed, ready };
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('HDRI environment lifecycle', () => {
	it('loads only the default WebP, uses sRGB and converts once despite repeated sky updates', async () => {
		const h = setup();
		await h.ready();
		expect(loadEnvironmentTexture).toHaveBeenCalledTimes(1);
		expect(vi.mocked(loadEnvironmentTexture).mock.calls[0][0]).toContain('Cloudscape%20Sunny%20Seamless.webp');
		expect(sources[0].colorSpace).toBe(THREE.SRGBColorSpace);
		expect(sources[0].mapping).toBe(THREE.EquirectangularReflectionMapping);
		expect(sources[0].generateMipmaps).toBe(false);
		for (let i = 0; i < 100; i++) h.system.applySettings();
		expect(gpu.convert).toHaveBeenCalledTimes(1);
		expect(h.scene.environment).toBe(targets[0].texture);
		expect(h.changed).toHaveBeenCalledTimes(1);
	});
	it('loads Moody on demand and reuses both cached panoramas', async () => {
		const h = setup();
		await h.ready();
		h.settings.preset = 'cloudscape-moody';
		await h.ready();
		expect(vi.mocked(loadEnvironmentTexture).mock.calls[1][0]).toContain('Cloudscape%20Moody%20Seamless.webp');
		h.settings.preset = 'cloudscape-sunny';
		await h.ready();
		expect(h.scene.environment).toBe(targets[0].texture);
		expect(loadEnvironmentTexture).toHaveBeenCalledTimes(2);
		expect(gpu.convert).toHaveBeenCalledTimes(2);
	});
	it('uses the sharp source for background and preserves independent lighting and rotation controls', async () => {
		const h = setup();
		await h.ready();
		expect(h.system.getBackgroundTexture()).toBe(sources[0]);
		h.settings.showAsBackground = true;
		h.settings.enabled = false;
		h.settings.rotation = 90;
		h.settings.intensity = 0.4;
		h.system.applySettings();
		expect(h.system.getBackgroundTexture()).toBe(sources[0]);
		expect(h.scene.environment).toBeNull();
		expect(h.scene.backgroundRotation.y).toBeCloseTo(Math.PI / 2);
		expect(h.scene.environmentRotation.y).toBeCloseTo(Math.PI / 2);
		expect(h.scene.environmentIntensity).toBe(0.4);
	});
	it('keeps the daytime panorama available when environment lighting is disabled', async () => {
		const h = setup();
		h.settings.enabled = false;
		await h.ready();
		expect(loadEnvironmentTexture).toHaveBeenCalledTimes(1);
		expect(h.system.getBackgroundTexture()).toBe(sources[0]);
		expect(h.scene.environment).toBeNull();
		h.settings.enabled = true;
		await h.ready();
		expect(gpu.convert).toHaveBeenCalledTimes(1);
	});
	it('deduplicates concurrent settings updates while an image is loading', async () => {
		const h = setup();
		const pending = deferred<THREE.Texture>();
		vi.mocked(loadEnvironmentTexture).mockReturnValueOnce(pending.promise);
		const ready = h.ready();
		for (let i = 0; i < 30; i++) h.system.applySettings();
		expect(loadEnvironmentTexture).toHaveBeenCalledTimes(1);
		pending.resolve(source());
		await ready;
		expect(gpu.convert).toHaveBeenCalledTimes(1);
	});
	it('aborts and discards an obsolete load when the preset changes', async () => {
		const h = setup();
		const pending = deferred<THREE.Texture>();
		vi.mocked(loadEnvironmentTexture).mockReturnValueOnce(pending.promise);
		const firstReady = h.ready();
		const signal = vi.mocked(loadEnvironmentTexture).mock.calls[0][1];
		h.settings.preset = 'cloudscape-moody';
		await h.ready();
		const currentEnvironment = h.scene.environment;
		const obsolete = source();
		pending.resolve(obsolete);
		await firstReady;
		expect(signal.aborted).toBe(true);
		expect(obsolete.dispose).toHaveBeenCalledOnce();
		expect(obsolete.image.close).toHaveBeenCalledOnce();
		expect(h.scene.environment).toBe(currentEnvironment);
		expect(gpu.convert).toHaveBeenCalledTimes(1);
	});
	it('keeps the existing environment visible until its replacement is ready', async () => {
		const h = setup();
		await h.ready();
		const pending = deferred<THREE.Texture>();
		vi.mocked(loadEnvironmentTexture).mockReturnValueOnce(pending.promise);
		h.settings.preset = 'cloudscape-moody';
		const ready = h.ready();
		expect(h.scene.environment).toBe(targets[0].texture);
		pending.resolve(source());
		await ready;
		expect(h.scene.environment).toBe(targets[1].texture);
	});
	it('uses a procedural fallback once on image failure without retrying each frame', async () => {
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(loadEnvironmentTexture).mockRejectedValueOnce(new Error('offline'));
		const h = setup();
		await h.ready();
		h.system.applySettings();
		expect(createProceduralSkyTexture).toHaveBeenCalledWith('#123456', '#abcdef');
		expect(loadEnvironmentTexture).toHaveBeenCalledTimes(1);
		expect(h.scene.environment).not.toBeNull();
		warning.mockRestore();
	});
	it('bounds the cache and disposes complete render targets and bitmap memory', async () => {
		const h = setup();
		await h.ready();
		h.settings.preset = 'cloudscape-moody';
		await h.ready();
		h.settings.preset = 'procedural';
		await h.ready();
		expect(targets[0].dispose).toHaveBeenCalledOnce();
		expect(sources[0].dispose).toHaveBeenCalledOnce();
		expect((sources[0].image as { close: () => void }).close).toHaveBeenCalledOnce();
		h.system.dispose();
		h.system.dispose();
		for (const target of targets) expect(target.dispose).toHaveBeenCalledOnce();
		for (const texture of sources) expect(texture.dispose).toHaveBeenCalledOnce();
		expect(gpu.dispose).toHaveBeenCalledOnce();
		expect(h.scene.environment).toBeNull();
	});
	it('aborts on disposal and releases a decode finishing after teardown without touching the scene', async () => {
		const h = setup();
		const pending = deferred<THREE.Texture>();
		vi.mocked(loadEnvironmentTexture).mockReturnValueOnce(pending.promise);
		const ready = h.ready();
		h.system.dispose();
		const texture = source();
		pending.resolve(texture);
		await ready;
		expect(texture.dispose).toHaveBeenCalledOnce();
		expect(gpu.convert).not.toHaveBeenCalled();
		expect(h.changed).not.toHaveBeenCalled();
	});
	it('defaults legacy or invalid preset settings to Sunny', async () => {
		const h = setup();
		delete h.settings.preset;
		await h.ready();
		expect(vi.mocked(loadEnvironmentTexture).mock.calls[0][0]).toContain('Cloudscape%20Sunny%20Seamless.webp');
	});
});
