<script lang="ts">
	import { FLIGHT_CONTROL_ROWS } from './flightControls';

	interface Props {
		phaseLabel?: string;
		durationSeconds?: number;
	}

	let { phaseLabel = 'Ingress corridor', durationSeconds = 3.25 }: Props = $props();
</script>

<section
	class="mission-intro"
	style:--intro-duration={`${durationSeconds}s`}
	aria-labelledby="mission-title"
>
	<div class="wipe" aria-hidden="true"></div>
	<div class="transmission">
		<div class="signal">
			<span></span><span></span><span></span><span></span>
			<p>SECURE BURST // 7-ALPHA</p>
		</div>
		<p class="eyebrow">JOINT STRIKE COMMAND PRESENTS</p>
		<p class="mission-index">MISSION <strong>01</strong></p>
		<h1 id="mission-title">Operation<br /><span>Ember Lance</span></h1>
		<div class="directive">
			<i aria-hidden="true"></i>
			<div>
				<span>INITIAL DIRECTIVE</span>
				<p>{phaseLabel}</p>
			</div>
		</div>
		<div class="controls-brief" aria-label="Flight and weapons controls">
			<header>
				<span>CONTROLS</span>
				<small>Hold inside targeting cone to lock, then fire</small>
			</header>
			<ul>
				{#each FLIGHT_CONTROL_ROWS as row (row.keys)}
					<li>
						<kbd>{row.keys}</kbd>
						<span>{row.description}</span>
					</li>
				{/each}
			</ul>
		</div>
	</div>
	<div class="coordinates" aria-hidden="true">
		<span>N 34° 12' 08"</span>
		<i></i>
		<span>W 112° 43' 17"</span>
	</div>
</section>

<style>
	.mission-intro {
		position: absolute;
		inset: 0;
		z-index: 35;
		display: grid;
		place-items: center;
		overflow: hidden;
		color: #f3fbfd;
		pointer-events: none;
		animation: intro-lifecycle var(--intro-duration, 3.25s) ease both;
	}

	.mission-intro::before {
		position: absolute;
		inset: 0;
		content: '';
		background:
			linear-gradient(90deg, rgba(2, 9, 16, 0.97), rgba(2, 10, 17, 0.74) 55%, rgba(2, 9, 16, 0.87)),
			repeating-linear-gradient(0deg, transparent 0 3px, rgba(123, 223, 239, 0.025) 3px 4px);
		backdrop-filter: blur(5px);
	}

	.wipe {
		position: absolute;
		inset: 0;
		z-index: 2;
		background: #d67b3d;
		transform: translateX(-101%);
		animation: wipe 0.75s 180ms cubic-bezier(0.72, 0, 0.2, 1) both;
		mix-blend-mode: screen;
	}

	.transmission {
		position: relative;
		z-index: 1;
		width: min(58rem, calc(100vw - 2rem));
		max-height: calc(100dvh - 2rem);
		padding: clamp(1.25rem, 4vw, 2.5rem);
		overflow: auto;
		border-left: 1px solid rgba(101, 212, 231, 0.37);
		animation: card-in 0.45s 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
		scrollbar-width: thin;
	}

	.signal {
		display: flex;
		gap: 0.2rem;
		align-items: end;
		margin-bottom: 1.25rem;
		color: #74dbea;
	}

	.signal span {
		width: 0.18rem;
		height: 0.6rem;
		background: currentColor;
	}

	.signal span:nth-child(2) {
		height: 0.9rem;
	}

	.signal span:nth-child(3) {
		height: 0.45rem;
	}

	.signal span:nth-child(4) {
		height: 0.75rem;
	}

	.signal p {
		margin: 0 0 0 0.55rem;
		font:
			600 0.53rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.15em;
	}

	.eyebrow {
		margin: 0 0 0.45rem;
		color: #e89a63;
		font:
			700 0.61rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.21em;
	}

	.mission-index {
		position: absolute;
		top: 38%;
		right: 3%;
		margin: 0;
		color: rgba(111, 209, 226, 0.2);
		font:
			600 0.62rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.16em;
		writing-mode: vertical-rl;
	}

	.mission-index strong {
		margin-top: 0.5rem;
		color: rgba(238, 153, 93, 0.38);
		font-size: 3.4rem;
	}

	h1 {
		margin: 0;
		font-size: clamp(2.2rem, 8vw, 5.2rem);
		font-weight: 820;
		line-height: 0.86;
		letter-spacing: -0.065em;
		text-transform: uppercase;
		text-shadow: 0 0 28px rgba(92, 215, 235, 0.12);
	}

	h1 span {
		color: transparent;
		-webkit-text-stroke: 1px rgba(232, 246, 248, 0.82);
	}

	.directive {
		display: flex;
		gap: 0.9rem;
		align-items: center;
		margin-top: 1rem;
	}

	.directive i {
		width: 2.2rem;
		height: 1px;
		background: #ed965b;
	}

	.directive span {
		color: rgba(130, 215, 230, 0.62);
		font:
			600 0.53rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.14em;
	}

	.directive p {
		margin: 0.3rem 0 0;
		font-size: 0.78rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.controls-brief {
		margin-top: 1.1rem;
		padding-top: 0.85rem;
		border-top: 1px solid rgba(108, 214, 232, 0.22);
	}

	.controls-brief header {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.75rem;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 0.55rem;
	}

	.controls-brief header span {
		color: #8ce9f7;
		font:
			700 0.56rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.14em;
	}

	.controls-brief header small {
		color: rgba(201, 230, 235, 0.58);
		font-size: 0.58rem;
	}

	.controls-brief ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 0.35rem 0.9rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.controls-brief li {
		display: grid;
		gap: 0.12rem;
	}

	.controls-brief kbd {
		width: fit-content;
		padding: 0.12rem 0.35rem;
		color: #ffe8d4;
		border: 1px solid rgba(237, 150, 91, 0.45);
		background: rgba(8, 32, 42, 0.72);
		font:
			650 0.48rem/1.35 ui-monospace,
			monospace;
		letter-spacing: 0.04em;
	}

	.controls-brief li span {
		color: rgba(214, 241, 246, 0.72);
		font-size: 0.62rem;
		line-height: 1.25;
	}

	.coordinates {
		position: absolute;
		z-index: 1;
		right: 2rem;
		bottom: 1.5rem;
		left: 2rem;
		display: flex;
		gap: 0.8rem;
		align-items: center;
		justify-content: center;
		color: rgba(163, 210, 219, 0.34);
		font:
			500 0.5rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
	}

	.coordinates i {
		width: min(20rem, 30vw);
		height: 1px;
		background: rgba(110, 208, 225, 0.16);
	}

	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateX(-1.25rem);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	@keyframes wipe {
		0% {
			transform: translateX(-101%);
		}
		45% {
			transform: translateX(0);
		}
		55% {
			transform: translateX(0);
		}
		100% {
			transform: translateX(101%);
		}
	}

	@keyframes intro-lifecycle {
		0%,
		8% {
			opacity: 0;
		}
		18%,
		78% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}

	@media (max-width: 600px) {
		.transmission {
			width: calc(100vw - 1.25rem);
			padding: 1.1rem 0.9rem;
		}

		.mission-index {
			display: none;
		}

		.controls-brief ul {
			grid-template-columns: 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.mission-intro {
			animation-duration: 1.1s;
		}

		.wipe {
			display: none;
		}

		.transmission {
			animation: none;
		}
	}
</style>
