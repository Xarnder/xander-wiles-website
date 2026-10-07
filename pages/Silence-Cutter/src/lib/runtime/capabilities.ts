/**
 * Runtime feature detection (no browser-name assumptions). Every capability degrades gracefully:
 * no WebGPU → WASM/CPU inference; no File System Access → OPFS or in-memory export; no native
 * AAC encoder → WASM AAC encoder polyfill.
 */
export interface Capabilities {
	browser: string;
	platform: string;
	webgpu: boolean;
	f16: boolean;
	adapter: { vendor: string; architecture: string; description: string } | null;
	adapterLimits: { maxBufferSize: number; maxStorageBufferBindingSize: number } | null;
	webcodecs: {
		videoDecoder: boolean;
		videoEncoder: boolean;
		audioDecoder: boolean;
		audioEncoder: boolean;
	};
	h264Encode: boolean | null;
	h264HardwareEncode: boolean | null;
	aacEncode: boolean | null;
	fileSystemAccess: boolean;
	opfs: boolean;
	crossOriginIsolated: boolean;
	sharedArrayBuffer: boolean;
	hardwareConcurrency: number;
	deviceMemoryGB: number | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- experimental browser APIs */

function browserName(): string {
	const nav = navigator as any;
	const brands: Array<{ brand: string; version: string }> | undefined = nav.userAgentData?.brands;
	if (brands?.length) {
		const real = brands.filter((b) => !/not.?a.?brand|chromium/i.test(b.brand));
		const pick = real[0] ?? brands[0];
		return `${pick.brand} ${pick.version}`;
	}
	const ua = navigator.userAgent;
	const m =
		/(Firefox|Edg|OPR|Chrome|Version)\/([\d.]+)/.exec(ua) ?? (/Safari\/([\d.]+)/.exec(ua) as any);
	if (!m) return 'Unknown browser';
	const name = m[1] === 'Version' ? 'Safari' : m[1] === 'Edg' ? 'Edge' : m[1];
	return `${name} ${m[2] ?? ''}`.trim();
}

/** Friendly adapter label, e.g. "Apple M-series GPU (metal-3)". */
export function describeAdapter(a: Capabilities['adapter']): string | null {
	if (!a) return null;
	const vendor = a.vendor?.toLowerCase() ?? '';
	if (vendor === 'apple') {
		return `Apple ${a.architecture?.startsWith('metal') ? 'M-series' : ''} GPU${a.architecture ? ` (${a.architecture})` : ''}`.replace(
			'  ',
			' '
		);
	}
	const parts = [a.vendor, a.architecture, a.description].filter((p) => p && p.trim());
	if (parts.length === 0) return null;
	return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

export async function detectCapabilities(): Promise<Capabilities> {
	const nav = navigator as any;
	let webgpu = false;
	let f16 = false;
	let adapter: Capabilities['adapter'] = null;
	let adapterLimits: Capabilities['adapterLimits'] = null;
	if (nav.gpu) {
		try {
			const a = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
			if (a) {
				webgpu = true;
				f16 = a.features.has('shader-f16');
				const info = a.info ?? (await a.requestAdapterInfo?.()) ?? {};
				adapter = {
					vendor: info.vendor ?? '',
					architecture: info.architecture ?? '',
					description: info.description ?? ''
				};
				adapterLimits = {
					maxBufferSize: a.limits.maxBufferSize,
					maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize
				};
			}
		} catch {
			webgpu = false;
		}
	}

	const g = globalThis as any;
	const webcodecs = {
		videoDecoder: typeof g.VideoDecoder === 'function',
		videoEncoder: typeof g.VideoEncoder === 'function',
		audioDecoder: typeof g.AudioDecoder === 'function',
		audioEncoder: typeof g.AudioEncoder === 'function'
	};

	let h264Encode: boolean | null = null;
	let h264HardwareEncode: boolean | null = null;
	if (webcodecs.videoEncoder) {
		const config = { codec: 'avc1.640028', width: 1920, height: 1080, bitrate: 8e6, framerate: 30 };
		try {
			h264Encode = !!(await g.VideoEncoder.isConfigSupported(config)).supported;
			h264HardwareEncode = !!(
				await g.VideoEncoder.isConfigSupported({
					...config,
					hardwareAcceleration: 'prefer-hardware'
				})
			).supported;
		} catch {
			h264Encode = false;
		}
	}
	let aacEncode: boolean | null = null;
	if (webcodecs.audioEncoder) {
		try {
			aacEncode = !!(
				await g.AudioEncoder.isConfigSupported({
					codec: 'mp4a.40.2',
					sampleRate: 48000,
					numberOfChannels: 2,
					bitrate: 128000
				})
			).supported;
		} catch {
			aacEncode = false;
		}
	}

	return {
		browser: browserName(),
		platform: nav.userAgentData?.platform ?? navigator.platform ?? 'unknown',
		webgpu,
		f16,
		adapter,
		adapterLimits,
		webcodecs,
		h264Encode,
		h264HardwareEncode,
		aacEncode,
		fileSystemAccess: typeof g.showSaveFilePicker === 'function',
		opfs: typeof navigator.storage?.getDirectory === 'function',
		crossOriginIsolated: !!g.crossOriginIsolated,
		sharedArrayBuffer: typeof g.SharedArrayBuffer === 'function',
		hardwareConcurrency: navigator.hardwareConcurrency || 1,
		deviceMemoryGB: nav.deviceMemory ?? null
	};
}

/** The user-facing acceleration label shown in the header. */
export function accelerationLabel(c: Capabilities | null): string {
	if (!c) return 'Detecting hardware…';
	if (c.webgpu) {
		const adapter = describeAdapter(c.adapter);
		return adapter ? `AI acceleration: WebGPU — ${adapter}` : 'AI acceleration: WebGPU';
	}
	return 'AI acceleration unavailable — using CPU';
}
