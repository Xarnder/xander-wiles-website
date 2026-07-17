<script lang="ts">
	interface Props {
		progress: number;
		asset: string;
		error?: string | null;
	}

	const TIPS = [
		'Stay below ridge lines to delay surface-to-air locks.',
		'Hold a target inside the acquisition ring before firing.',
		'Afterburner trades control authority for rapid acceleration.',
		'Cycle targets to prioritize radar and missile batteries.',
		'Squadron members draw fire when ordered into an attack run.'
	] as const;
	const PROGRESS_SEGMENT_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

	let { progress, asset, error = null }: Props = $props();
	let tipIndex = $state(0);
	const safeProgress = $derived(Math.max(0, Math.min(1, progress)));
	const percent = $derived(Math.round(safeProgress * 100));

	function rotateTips() {
		const interval = window.setInterval(() => {
			tipIndex = (tipIndex + 1) % TIPS.length;
		}, 3600);
		return () => window.clearInterval(interval);
	}
</script>

<section
	class="loading-screen"
	aria-labelledby="loading-title"
	aria-live="polite"
	{@attach rotateTips}
>
	<div class="radar" aria-hidden="true">
		<span class="ring ring-one"></span>
		<span class="ring ring-two"></span>
		<span class="ring ring-three"></span>
		<i></i>
		<b></b>
	</div>

	<div class="loading-card">
		<div class="brand">
			<span>VS</span>
			<div>
				<p>VIPER STRIKE</p>
				<small>OPERATION EMBER LANCE</small>
			</div>
		</div>

		<div class="readout">
			<p class="eyebrow">PRE-FLIGHT SYSTEM CHECK</p>
			<h1 id="loading-title">Preparing combat theatre</h1>
			<div class="progress-meta">
				<span>{asset || 'Initializing flight systems'}</span>
				<strong>{percent.toString().padStart(2, '0')}%</strong>
			</div>
			<div
				class="track"
				role="progressbar"
				aria-label="Game loading progress"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={percent}
			>
				<i style:--progress={`${percent}%`}></i>
			</div>
			<div class="segments" aria-hidden="true">
				{#each PROGRESS_SEGMENT_INDICES as index (index)}
					<span class:loaded={index / 16 < safeProgress}></span>
				{/each}
			</div>
		</div>

		<div class="tip">
			<span>TACTICAL NOTE</span>
			<p>{TIPS[tipIndex]}</p>
		</div>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<p class="resilience">
			<span aria-hidden="true"></span>
			Resilient loading enabled — unavailable models will use tactical fallback geometry.
		</p>
	</div>

	<div class="telemetry" aria-hidden="true">
		<span>LINK 04 // STABLE</span>
		<span>GPU PIPELINE // SYNC</span>
		<span>THEATRE ID // EL-017</span>
	</div>
</section>

<style>
	.loading-screen {
		position: absolute;
		inset: 0;
		z-index: 60;
		display: grid;
		place-items: center;
		overflow: hidden;
		color: #eaf9fc;
		background:
			linear-gradient(rgba(2, 12, 19, 0.91), rgba(2, 9, 15, 0.97)),
			radial-gradient(circle at 65% 35%, rgba(37, 145, 165, 0.28), transparent 45%);
	}

	.loading-screen::after {
		position: absolute;
		inset: 0;
		content: '';
		pointer-events: none;
		background: repeating-linear-gradient(
			0deg,
			transparent 0 3px,
			rgba(129, 231, 248, 0.018) 3px 4px
		);
	}

	.radar {
		position: absolute;
		top: 50%;
		left: 62%;
		width: min(72vw, 58rem);
		aspect-ratio: 1;
		border: 1px solid rgba(88, 205, 225, 0.09);
		border-radius: 50%;
		transform: translate(-50%, -50%);
	}

	.ring {
		position: absolute;
		inset: 12%;
		border: 1px solid rgba(88, 205, 225, 0.08);
		border-radius: 50%;
	}

	.ring-two {
		inset: 28%;
	}

	.ring-three {
		inset: 43%;
	}

	.radar::before,
	.radar::after {
		position: absolute;
		content: '';
		background: rgba(86, 200, 220, 0.08);
	}

	.radar::before {
		top: 50%;
		right: 0;
		left: 0;
		height: 1px;
	}

	.radar::after {
		top: 0;
		bottom: 0;
		left: 50%;
		width: 1px;
	}

	.radar i {
		position: absolute;
		inset: 50% 50% 0 0;
		display: block;
		border-top: 1px solid rgba(120, 224, 241, 0.42);
		background: linear-gradient(150deg, rgba(80, 208, 229, 0.18), transparent 60%);
		transform-origin: bottom right;
		animation: sweep 3.4s linear infinite;
	}

	.radar b {
		position: absolute;
		top: 34%;
		left: 28%;
		width: 0.34rem;
		height: 0.34rem;
		border-radius: 50%;
		background: #ff9f59;
		box-shadow: 0 0 14px #ff8243;
		animation: ping 1.7s ease-in-out infinite;
	}

	.loading-card {
		position: relative;
		z-index: 1;
		width: min(36rem, calc(100vw - 2rem));
		padding: clamp(1.2rem, 4vw, 2.5rem);
		border: 1px solid rgba(104, 215, 234, 0.22);
		background: rgba(3, 17, 25, 0.76);
		box-shadow: 0 30px 100px rgba(0, 0, 0, 0.36);
		backdrop-filter: blur(16px);
		clip-path: polygon(
			0 0,
			calc(100% - 1.4rem) 0,
			100% 1.4rem,
			100% 100%,
			1.4rem 100%,
			0 calc(100% - 1.4rem)
		);
	}

	.brand {
		display: flex;
		gap: 0.8rem;
		align-items: center;
	}

	.brand > span {
		display: grid;
		width: 2.7rem;
		aspect-ratio: 1;
		place-items: center;
		color: #071119;
		background: #74dff0;
		font-size: 0.8rem;
		font-weight: 900;
		clip-path: polygon(0 0, 100% 0, 80% 100%, 0 82%);
	}

	.brand p,
	.brand small {
		margin: 0;
	}

	.brand p {
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.13em;
	}

	.brand small {
		display: block;
		margin-top: 0.18rem;
		color: #ed9b5d;
		font:
			600 0.52rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.14em;
	}

	.readout {
		margin-top: clamp(3rem, 9vh, 5.5rem);
	}

	.eyebrow {
		margin: 0 0 0.65rem;
		color: #74dff0;
		font:
			650 0.58rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.18em;
	}

	h1 {
		margin: 0;
		font-size: clamp(1.8rem, 5vw, 3.15rem);
		line-height: 0.98;
		letter-spacing: -0.04em;
		text-transform: uppercase;
	}

	.progress-meta {
		display: flex;
		gap: 1rem;
		align-items: end;
		justify-content: space-between;
		margin-top: 2rem;
		color: rgba(207, 236, 241, 0.62);
		font:
			500 0.64rem/1.2 ui-monospace,
			monospace;
	}

	.progress-meta strong {
		color: #ffc08b;
		font-size: 1.4rem;
		font-weight: 500;
	}

	.track {
		height: 0.3rem;
		margin-top: 0.55rem;
		overflow: hidden;
		background: rgba(113, 209, 225, 0.13);
	}

	.track i {
		display: block;
		width: var(--progress);
		height: 100%;
		background: linear-gradient(90deg, #4ec8df, #f6a260);
		box-shadow: 0 0 16px rgba(103, 219, 238, 0.55);
		transition: width 350ms ease;
	}

	.segments {
		display: grid;
		grid-template-columns: repeat(16, 1fr);
		gap: 0.25rem;
		margin-top: 0.45rem;
	}

	.segments span {
		height: 0.18rem;
		background: rgba(106, 205, 222, 0.1);
		transition: background 200ms ease;
	}

	.segments span.loaded {
		background: rgba(120, 221, 239, 0.6);
	}

	.tip {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 1rem;
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(103, 205, 222, 0.14);
	}

	.tip span {
		color: #f0a467;
		font:
			700 0.53rem/1.5 ui-monospace,
			monospace;
		letter-spacing: 0.13em;
	}

	.tip p {
		margin: 0;
		color: rgba(220, 239, 243, 0.7);
		font-size: 0.72rem;
		line-height: 1.45;
	}

	.error {
		margin: 1rem 0 0;
		padding: 0.6rem;
		color: #ffd2b6;
		border-left: 2px solid #ff8d51;
		background: rgba(83, 24, 9, 0.36);
		font-size: 0.7rem;
	}

	.resilience {
		display: flex;
		gap: 0.55rem;
		align-items: center;
		margin: 1.2rem 0 0;
		color: rgba(175, 211, 218, 0.45);
		font:
			500 0.52rem/1.35 ui-monospace,
			monospace;
	}

	.resilience span {
		flex: 0 0 auto;
		width: 0.35rem;
		height: 0.35rem;
		border-radius: 50%;
		background: #76d9ae;
		box-shadow: 0 0 9px #76d9ae;
	}

	.telemetry {
		position: absolute;
		right: 2rem;
		bottom: 1.2rem;
		left: 2rem;
		display: flex;
		gap: 2rem;
		justify-content: center;
		color: rgba(148, 198, 208, 0.3);
		font:
			500 0.5rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.1em;
	}

	@keyframes sweep {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes ping {
		50% {
			opacity: 0.3;
			transform: scale(1.8);
		}
	}

	@media (max-width: 600px) {
		.loading-card {
			padding: 1.25rem;
		}

		.readout {
			margin-top: 3.2rem;
		}

		.tip {
			grid-template-columns: 1fr;
			gap: 0.4rem;
		}

		.telemetry span:not(:first-child) {
			display: none;
		}
	}
</style>
