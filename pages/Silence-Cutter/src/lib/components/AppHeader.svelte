<script lang="ts">
	import { accelerationLabel, type Capabilities } from '../runtime/capabilities';

	interface Props {
		caps: Capabilities | null;
		fileName: string | null;
		onclose: () => void;
		ondiagnostics: () => void;
		onshortcuts: () => void;
	}
	let { caps, fileName, onclose, ondiagnostics, onshortcuts }: Props = $props();
	let privacyOpen = $state(false);
</script>

<header class="app-header">
	<div class="brand">
		<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
			<path
				d="M3 12h3l2-6 3 12 3-9 2 3h5"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		<span class="name">Silence Cutter</span>
		<span class="tag">Remove the silence, not the speech.</span>
	</div>
	{#if fileName}
		<div class="file" title={fileName}>
			<span>{fileName}</span>
			<button class="ghost small" onclick={onclose} aria-label="Close video">✕</button>
		</div>
	{/if}
	<div class="right">
		<div class="privacy-wrap">
			<button
				class="privacy"
				onclick={() => (privacyOpen = !privacyOpen)}
				aria-expanded={privacyOpen}
				data-testid="privacy"
			>
				<span aria-hidden="true">🔒</span> Private — this video never leaves your device.
			</button>
			{#if privacyOpen}
				<div class="popover" role="dialog" aria-label="Privacy details">
					<p><strong>All processing happens in this browser tab.</strong></p>
					<ul>
						<li>
							Your video is read directly from your disk. It is never uploaded, and this site has no
							upload endpoint.
						</li>
						<li>
							Audio decoding, silence detection, speech recognition and video export run on your
							CPU/GPU.
						</li>
						<li>
							The only download is the speech-recognition model (from huggingface.co), cached on
							this device.
						</li>
						<li>
							No analytics or telemetry. Projects (settings, transcript, edits) are stored only in
							this browser.
						</li>
					</ul>
					<button class="small" onclick={() => (privacyOpen = false)}>Close</button>
				</div>
			{/if}
		</div>
		<span class="runtime" class:cpu={caps && !caps.webgpu} data-testid="runtime"
			>{accelerationLabel(caps)}</span
		>
		<button class="ghost small" onclick={onshortcuts} title="Keyboard shortcuts (?)"
			>⌨ Shortcuts</button
		>
		<button class="ghost small" onclick={ondiagnostics} title="Developer diagnostics"
			>Diagnostics</button
		>
	</div>
</header>

<style>
	.app-header {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 8px 14px;
		border-bottom: 1px solid var(--border);
		background: var(--panel);
		min-height: 46px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--accent);
		white-space: nowrap;
	}
	.name {
		font-weight: 700;
		font-size: 15px;
		color: var(--text);
	}
	.tag {
		color: var(--text-faint);
		font-size: 12px;
	}
	.file {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
		color: var(--text-dim);
		font-size: 12px;
	}
	.file span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 28ch;
	}
	.right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.privacy {
		border-color: color-mix(in srgb, var(--private) 50%, transparent);
		color: var(--private);
		background: color-mix(in srgb, var(--private) 10%, transparent);
		font-weight: 600;
		font-size: 12px;
		border-radius: 20px;
		padding: 3px 10px;
	}
	.privacy-wrap {
		position: relative;
	}
	.popover {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		width: 360px;
		background: var(--panel);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 10px 14px;
		z-index: 30;
		font-size: 12px;
	}
	.popover ul {
		padding-left: 18px;
		margin: 6px 0 10px;
		color: var(--text-dim);
	}
	.popover li {
		margin-bottom: 4px;
	}
	.runtime {
		font-size: 12px;
		color: var(--text-dim);
		white-space: nowrap;
	}
	.runtime.cpu {
		color: var(--manual);
	}
	.small {
		font-size: 12px;
		padding: 3px 8px;
	}
	@media (max-width: 1100px) {
		.tag {
			display: none;
		}
	}
</style>
