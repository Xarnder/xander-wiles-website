<script lang="ts">
	import { resolve } from '$app/paths';
	import { describeAdapter } from '../runtime/capabilities';
	import type { EditorStore } from '../state/editor.svelte';
	import Modal from './Modal.svelte';

	let { store, onclose }: { store: EditorStore; onclose: () => void } = $props();
	const c = $derived(store.caps);
	const d = $derived(store.diag);
	const fmtMs = (v: number | null) =>
		v === null ? '—' : v > 2000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;
	const fmtX = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}× real time`);
	const yes = (v: boolean | null | undefined) =>
		v === null || v === undefined ? 'unknown' : v ? 'yes' : 'no';

	const rows = $derived<Array<[string, string]>>([
		['Browser', c?.browser ?? '…'],
		['Platform', c?.platform ?? '…'],
		['WebGPU', yes(c?.webgpu)],
		['GPU adapter', describeAdapter(c?.adapter ?? null) ?? '—'],
		[
			'Adapter details',
			c?.adapter
				? `${c.adapter.vendor} / ${c.adapter.architecture} / ${c.adapter.description || '—'}`
				: '—'
		],
		['shader-f16', yes(c?.f16)],
		[
			'Max GPU buffer',
			c?.adapterLimits ? `${(c.adapterLimits.maxBufferSize / 2 ** 20).toFixed(0)} MiB` : '—'
		],
		[
			'WebCodecs (dec/enc video, dec/enc audio)',
			c
				? `${yes(c.webcodecs.videoDecoder)}/${yes(c.webcodecs.videoEncoder)}, ${yes(c.webcodecs.audioDecoder)}/${yes(c.webcodecs.audioEncoder)}`
				: '…'
		],
		['H.264 encode (hardware)', `${yes(c?.h264Encode)} (${yes(c?.h264HardwareEncode)})`],
		['AAC encode', yes(c?.aacEncode)],
		['File System Access', yes(c?.fileSystemAccess)],
		['OPFS', yes(c?.opfs)],
		['Cross-origin isolated (WASM threads)', yes(c?.crossOriginIsolated)],
		[
			'CPU threads / device memory',
			`${c?.hardwareConcurrency ?? '…'} / ${c?.deviceMemoryGB ? `${c.deviceMemoryGB} GB+` : 'unknown'}`
		],
		[
			'ASR backend',
			store.asr.runtime
				? `${store.asr.runtime.backend}${store.asr.runtime.backend === 'wasm' ? ` (${store.asr.runtime.threads} threads)` : ''}`
				: 'not loaded'
		],
		['ASR model', store.asr.loadedModelId ?? '—'],
		[
			'Model load (files / session)',
			`${fmtMs(d.modelLoadMs)} (${fmtMs(d.modelFilesMs)} / ${fmtMs(d.modelSessionMs)})`
		],
		['ASR speed', fmtX(d.asrRealTimeFactor)],
		['ASR wall time', fmtMs(d.asrWallMs)],
		['Audio analysis time', `${fmtMs(d.analysisMs)} (decode ${fmtX(d.decodeSpeed)})`],
		['Export time', `${fmtMs(d.exportMs)} (${fmtX(d.exportSpeed)})`],
		[
			'Peak JS heap (Chromium only)',
			d.peakHeapMB === null ? 'not measurable' : `${d.peakHeapMB.toFixed(0)} MB`
		]
	]);

	function copy() {
		void navigator.clipboard.writeText(
			JSON.stringify(
				{
					capabilities: $state.snapshot(c),
					diagnostics: $state.snapshot(d),
					asr: $state.snapshot(store.asr.runtime)
				},
				null,
				2
			)
		);
	}
</script>

<Modal title="Developer diagnostics" {onclose} wide testid="diagnostics">
	<table>
		<tbody>
			{#each rows as [k, v] (k)}
				<tr><th>{k}</th><td class="mono">{v}</td></tr>
			{/each}
		</tbody>
	</table>
	<p class="note">
		Diagnostics stay on this device. Copy them to compare machines (e.g. Windows/NVIDIA vs Apple
		Silicon). For repeatable measurements run the <a href={resolve('/spike')}>benchmark harness</a>
		or <code>npm run bench</code>.
	</p>
	<button onclick={copy}>Copy as JSON</button>
</Modal>

<style>
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}
	th {
		text-align: left;
		font-weight: 500;
		color: var(--text-dim);
		padding: 3px 12px 3px 0;
		width: 45%;
		vertical-align: top;
	}
	td {
		padding: 3px 0;
		word-break: break-word;
	}
	tr + tr {
		border-top: 1px solid var(--border);
	}
	.note {
		font-size: 12px;
		color: var(--text-dim);
	}
	a {
		color: var(--accent);
	}
</style>
