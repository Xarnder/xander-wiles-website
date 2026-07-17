<script lang="ts">
	import type { RadioSnapshot } from '$lib/game/types';

	interface Props {
		message: RadioSnapshot | null;
		subtitles?: boolean;
		subtitleSize?: 'small' | 'medium' | 'large';
	}

	let { message, subtitles = true, subtitleSize = 'medium' }: Props = $props();
	const initials = $derived(
		message?.speaker
			.split(/\s+/)
			.map((word) => word[0])
			.join('')
			.slice(0, 2)
			.toUpperCase() ?? '—'
	);
</script>

{#if message?.active && subtitles}
	<aside
		class="radio"
		class:size-small={subtitleSize === 'small'}
		class:size-large={subtitleSize === 'large'}
	>
		<div class="portrait" aria-hidden="true">
			<span>{initials}</span>
			<i></i>
		</div>
		<div class="transcript">
			<div class="header">
				<span>ENCRYPTED COMMS</span>
				<div class="wave" aria-hidden="true">
					<i></i><i></i><i></i><i></i><i></i><i></i>
				</div>
			</div>
			<strong>{message.speaker}</strong>
			<p>{message.text}</p>
		</div>
	</aside>
{/if}

<style>
	.radio {
		position: absolute;
		z-index: 11;
		bottom: clamp(5rem, 12vh, 8rem);
		left: 50%;
		display: grid;
		grid-template-columns: 4.2rem minmax(0, 1fr);
		width: min(34rem, calc(100vw - 2rem));
		color: #eefbfe;
		border: 1px solid rgba(101, 212, 230, 0.38);
		background:
			linear-gradient(100deg, rgba(5, 27, 37, 0.93), rgba(3, 14, 22, 0.86)),
			repeating-linear-gradient(0deg, transparent 0 2px, rgba(118, 226, 243, 0.035) 2px 3px);
		box-shadow: 0 14px 48px rgba(0, 0, 0, 0.35);
		pointer-events: none;
		transform: translateX(-50%);
		animation: radio-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
		clip-path: polygon(0 0, calc(100% - 0.8rem) 0, 100% 0.8rem, 100% 100%, 0 100%);
	}

	.radio::after {
		position: absolute;
		inset: 0;
		content: '';
		background: linear-gradient(
			110deg,
			transparent 30%,
			rgba(128, 232, 248, 0.08) 50%,
			transparent 70%
		);
		transform: translateX(-100%);
		animation: static-scan 2.6s linear infinite;
	}

	.portrait {
		position: relative;
		display: grid;
		overflow: hidden;
		place-items: center;
		color: #86e1ee;
		border-right: 1px solid rgba(104, 210, 228, 0.25);
		background:
			linear-gradient(rgba(5, 40, 50, 0.75), rgba(3, 20, 28, 0.8)),
			repeating-linear-gradient(90deg, transparent 0 5px, rgba(107, 222, 239, 0.06) 5px 6px);
		font:
			700 1rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.08em;
	}

	.portrait::before {
		position: absolute;
		width: 2.5rem;
		height: 2.5rem;
		content: '';
		border: 1px solid rgba(123, 225, 241, 0.25);
		border-radius: 50%;
	}

	.portrait i {
		position: absolute;
		right: 0.35rem;
		bottom: 0.35rem;
		width: 0.32rem;
		height: 0.32rem;
		border-radius: 50%;
		background: #7fe5b9;
		box-shadow: 0 0 8px #7fe5b9;
	}

	.transcript {
		position: relative;
		z-index: 1;
		padding: 0.75rem 0.9rem 0.85rem;
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.3rem;
		color: rgba(119, 214, 230, 0.56);
		font:
			600 0.48rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
	}

	.wave {
		display: flex;
		gap: 0.12rem;
		align-items: center;
		height: 0.75rem;
	}

	.wave i {
		width: 1px;
		height: 30%;
		background: #84ddeb;
		animation: wave 600ms ease-in-out infinite alternate;
	}

	.wave i:nth-child(2),
	.wave i:nth-child(5) {
		height: 70%;
		animation-delay: -180ms;
	}

	.wave i:nth-child(3) {
		height: 100%;
		animation-delay: -320ms;
	}

	.wave i:nth-child(4) {
		height: 55%;
		animation-delay: -80ms;
	}

	.transcript strong {
		color: #f4a66d;
		font:
			750 0.66rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.transcript p {
		margin: 0.35rem 0 0;
		color: rgba(239, 249, 251, 0.92);
		font-size: 0.82rem;
		line-height: 1.4;
	}

	.radio.size-small .transcript p {
		font-size: 0.7rem;
	}

	.radio.size-large .transcript p {
		font-size: 1rem;
	}

	@keyframes radio-in {
		from {
			opacity: 0;
			transform: translate(-50%, 1rem) scale(0.97);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0) scale(1);
		}
	}

	@keyframes static-scan {
		to {
			transform: translateX(100%);
		}
	}

	@keyframes wave {
		to {
			transform: scaleY(0.25);
		}
	}

	@media (max-width: 600px) {
		.radio {
			bottom: 8.5rem;
			grid-template-columns: 3.1rem minmax(0, 1fr);
		}

		.transcript {
			padding: 0.6rem 0.7rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.radio,
		.radio::after,
		.wave i {
			animation: none;
		}
	}
</style>
