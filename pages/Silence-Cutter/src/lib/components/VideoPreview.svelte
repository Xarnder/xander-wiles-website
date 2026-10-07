<script lang="ts">
	import { onMount } from 'svelte';
	import { formatTimecode } from '../core/stats';
	import type { TimeMap } from '../core/timeMap';
	import type { Player } from '../playback/player.svelte';

	interface Props {
		src: string;
		player: Player;
		timeMap: TimeMap;
		duration: number;
		mode: 'original' | 'edited';
		onmode: (m: 'original' | 'edited') => void;
	}
	let { src, player, timeMap, duration, mode, onmode }: Props = $props();
	let video: HTMLVideoElement;

	onMount(() => player.attach(video));

	const edited = $derived(timeMap.sourceToEdited(player.currentTime));
</script>

<section class="preview" aria-label="Video preview">
	<div class="stage">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={video}
			{src}
			preload="auto"
			playsinline
			data-testid="video"
			onclick={() => player.toggle()}
		></video>
		{#if mode === 'edited'}<span class="mode-badge">EDITED PREVIEW</span>{/if}
	</div>
	<div class="transport">
		<button
			class="play"
			onclick={() => player.toggle()}
			aria-label={player.playing ? 'Pause' : 'Play'}
			data-testid="play"
		>
			{player.playing ? '❚❚' : '▶'}
		</button>
		<div class="times mono">
			<span title="Position in the original recording" data-testid="time-source"
				>{formatTimecode(player.currentTime)}</span
			>
			<span class="dim">/ {formatTimecode(duration)}</span>
			<span class="sep">·</span>
			<span title="Position in the edited result" data-testid="time-edited"
				>{formatTimecode(edited)}</span
			>
			<span class="dim">/ {formatTimecode(timeMap.editedDuration)} edited</span>
		</div>
		<div class="seg" role="radiogroup" aria-label="Preview mode">
			<button
				class:on={mode === 'original'}
				role="radio"
				aria-checked={mode === 'original'}
				onclick={() => onmode('original')}
				data-testid="preview-original">Original</button
			>
			<button
				class:on={mode === 'edited'}
				role="radio"
				aria-checked={mode === 'edited'}
				onclick={() => onmode('edited')}
				data-testid="preview-edited">Edited</button
			>
		</div>
		<select
			class="rate"
			value={player.rate}
			onchange={(e) => player.setRate(Number(e.currentTarget.value))}
			aria-label="Playback speed"
		>
			{#each [0.5, 0.75, 1, 1.25, 1.5, 2] as r (r)}<option value={r}>{r}×</option>{/each}
		</select>
	</div>
</section>

<style>
	.preview {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.stage {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		background: #000;
	}
	video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}
	.mode-badge {
		position: absolute;
		top: 8px;
		left: 8px;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		background: var(--accent);
		color: #fff;
		padding: 2px 6px;
		border-radius: 4px;
	}
	.transport {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		border-top: 1px solid var(--border);
	}
	.play {
		width: 34px;
		height: 28px;
		padding: 0;
	}
	.times {
		font-size: 12px;
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
	.dim,
	.sep {
		color: var(--text-faint);
	}
	.seg {
		margin-left: auto;
		display: flex;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}
	.seg button {
		border: none;
		border-radius: 0;
		background: transparent;
		font-size: 12px;
	}
	.seg button.on {
		background: var(--accent);
		color: #fff;
	}
	.rate {
		font-size: 12px;
	}
</style>
