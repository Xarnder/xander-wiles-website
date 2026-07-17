<script lang="ts">
	interface Props {
		onResume: () => void;
		onRestart: () => void;
		onControls: () => void;
		onSettings: () => void;
		onReturnToMenu: () => void;
	}

	let { onResume, onRestart, onControls, onSettings, onReturnToMenu }: Props = $props();

	function focusDialog(node: HTMLElement) {
		const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		requestAnimationFrame(() => node.querySelector<HTMLButtonElement>('button')?.focus());
		return () => previous?.focus();
	}
</script>

<div class="scrim" aria-hidden="true"></div>
<dialog
	open
	class="pause-panel"
	aria-modal="true"
	aria-labelledby="pause-title"
	{@attach focusDialog}
>
	<div class="pause-mark" aria-hidden="true"><i></i><i></i></div>
	<p class="eyebrow">FLIGHT COMPUTER // HOLD</p>
	<h1 id="pause-title">Mission Paused</h1>
	<p class="status"><span aria-hidden="true"></span> Simulation clock suspended</p>

	<nav aria-label="Pause menu">
		<button class="resume" type="button" onclick={onResume}>
			<span>
				<small>CONTINUE SORTIE</small>
				Resume
			</span>
			<b aria-hidden="true">→</b>
		</button>
		<button type="button" onclick={onRestart}>
			<span><small>RESET CURRENT RUN</small>Restart Mission</span>
			<b aria-hidden="true">↻</b>
		</button>
		<button type="button" onclick={onControls}>
			<span><small>FLIGHT REFERENCE</small>Controls</span>
			<b aria-hidden="true">?</b>
		</button>
		<button type="button" onclick={onSettings}>
			<span><small>AUDIO / VIDEO / ACCESS</small>Settings</span>
			<b aria-hidden="true">⌁</b>
		</button>
		<button class="return" type="button" onclick={onReturnToMenu}>
			<span><small>ABORT SORTIE</small>Return to Main Menu</span>
			<b aria-hidden="true">×</b>
		</button>
	</nav>

	<div class="footer">
		<span>ESC</span>
		<p>RESUME</p>
		<i></i>
		<p>AIRCRAFT STATUS SAFE</p>
	</div>
</dialog>

<style>
	.scrim {
		position: absolute;
		inset: 0;
		z-index: 29;
		background:
			linear-gradient(90deg, rgba(2, 8, 14, 0.96), rgba(3, 12, 19, 0.78) 54%, rgba(1, 7, 12, 0.65)),
			repeating-linear-gradient(0deg, transparent 0 3px, rgba(119, 222, 238, 0.022) 3px 4px);
		backdrop-filter: blur(8px) saturate(0.7);
		animation: fade-in 200ms ease both;
	}

	.pause-panel {
		position: absolute;
		z-index: 30;
		top: 50%;
		left: clamp(1.2rem, 7vw, 8rem);
		width: min(31rem, calc(100vw - 2.4rem));
		margin: 0;
		padding: 0;
		color: #edf9fb;
		border: 0;
		background: transparent;
		transform: translateY(-50%);
		animation: panel-in 330ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.pause-mark {
		display: flex;
		gap: 0.28rem;
		margin-bottom: 2rem;
	}

	.pause-mark i {
		display: block;
		width: 0.34rem;
		height: 1.5rem;
		background: #ef9559;
		box-shadow: 0 0 14px rgba(239, 128, 65, 0.34);
	}

	.eyebrow {
		margin: 0 0 0.55rem;
		color: #78dce9;
		font:
			650 0.59rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.18em;
	}

	h1 {
		margin: 0;
		font-size: clamp(2.8rem, 7vw, 5.5rem);
		line-height: 0.86;
		letter-spacing: -0.055em;
		text-transform: uppercase;
	}

	.status {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin: 1rem 0 2rem;
		color: rgba(187, 224, 230, 0.5);
		font:
			550 0.56rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	.status span {
		width: 0.35rem;
		height: 0.35rem;
		border-radius: 50%;
		background: #f4a166;
		animation: status-pulse 1.7s ease-in-out infinite;
	}

	nav {
		display: grid;
		gap: 0.4rem;
	}

	button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.78rem 0.9rem;
		color: #c9e9ee;
		border: 1px solid rgba(105, 208, 225, 0.19);
		background: linear-gradient(90deg, rgba(8, 34, 43, 0.74), rgba(4, 20, 28, 0.46));
		font:
			720 0.84rem/1 ui-sans-serif,
			system-ui,
			sans-serif;
		letter-spacing: 0.03em;
		text-align: left;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			padding 160ms ease,
			color 160ms ease,
			border-color 160ms ease,
			background 160ms ease;
		clip-path: polygon(0 0, calc(100% - 0.55rem) 0, 100% 0.55rem, 100% 100%, 0 100%);
	}

	button:hover,
	button:focus-visible {
		padding-left: 1.15rem;
		color: #fff;
		border-color: rgba(115, 221, 239, 0.56);
		background: linear-gradient(90deg, rgba(14, 61, 73, 0.82), rgba(5, 26, 35, 0.56));
	}

	button span {
		display: grid;
		gap: 0.3rem;
	}

	button small {
		color: rgba(145, 202, 211, 0.46);
		font:
			550 0.48rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
	}

	button b {
		color: #78dbe9;
		font-size: 1.05rem;
		font-weight: 500;
	}

	button.resume {
		color: #07151b;
		border-color: #f4a164;
		background: linear-gradient(105deg, #f09255, #ffc184);
	}

	button.resume small,
	button.resume b {
		color: rgba(24, 42, 45, 0.68);
	}

	button.return {
		margin-top: 0.5rem;
		color: #e0b29d;
		border-color: rgba(224, 119, 84, 0.24);
		background: rgba(42, 15, 10, 0.44);
	}

	.footer {
		display: flex;
		gap: 0.55rem;
		align-items: center;
		margin-top: 1.2rem;
		color: rgba(156, 204, 212, 0.36);
		font:
			550 0.49rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.09em;
	}

	.footer span {
		padding: 0.2rem 0.3rem;
		color: #eea36e;
		border: 1px solid rgba(237, 157, 101, 0.38);
	}

	.footer p {
		margin: 0;
	}

	.footer i {
		flex: 1;
		height: 1px;
		background: rgba(108, 206, 222, 0.13);
	}

	@keyframes panel-in {
		from {
			opacity: 0;
			transform: translate(-1.5rem, -50%);
		}
		to {
			opacity: 1;
			transform: translate(0, -50%);
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}

	@keyframes status-pulse {
		50% {
			opacity: 0.3;
		}
	}

	@media (max-width: 600px) {
		.pause-panel {
			left: 1rem;
			width: calc(100vw - 2rem);
		}

		h1 {
			font-size: clamp(3rem, 15vw, 4.5rem);
		}

		.pause-mark {
			margin-bottom: 1.2rem;
		}

		.footer {
			display: none;
		}
	}

	@media (max-height: 700px) {
		.pause-mark {
			display: none;
		}

		.status {
			margin-bottom: 1rem;
		}

		button {
			padding-block: 0.6rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.scrim,
		.pause-panel,
		.status span {
			animation: none;
		}
	}
</style>
