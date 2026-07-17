<script lang="ts">
	import type { MissionResults, SquadronMemberSnapshot } from '$lib/game/types';

	interface Props {
		success: boolean;
		results: MissionResults | null;
		squad: readonly SquadronMemberSnapshot[];
		onReplay: () => void;
		onMenu: () => void;
	}

	let { success, results, squad, onReplay, onMenu }: Props = $props();

	const time = $derived(formatTime(results?.missionTime ?? 0));
	const targets = $derived(Math.max(0, results?.hits ?? 0));
	const missiles = $derived(Math.max(0, results?.shots ?? 0));
	const squadContribution = $derived(
		squad.length === 0
			? 0
			: Math.round((squad.filter((member) => member.active).length / squad.length) * 100)
	);
	const score = $derived(results?.score ?? 0);

	function formatTime(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const remainder = Math.floor(seconds % 60);
		return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
	}

	function focusResults(node: HTMLElement) {
		requestAnimationFrame(() => node.querySelector<HTMLButtonElement>('.primary')?.focus());
	}
</script>

<dialog
	open
	class="results"
	class:failure={!success}
	aria-modal="true"
	aria-labelledby="result-title"
	{@attach focusResults}
>
	<div class="atmosphere" aria-hidden="true"></div>
	<div class="results-frame">
		<header>
			<div class="seal" aria-hidden="true">
				<span>{success ? '✓' : '!'}</span>
				<i></i>
			</div>
			<p>{success ? 'JOINT STRIKE COMMAND // DEBRIEF' : 'MISSION CONTROL // INCIDENT REPORT'}</p>
			<h1 id="result-title">{success ? 'Mission Complete' : 'Mission Failed'}</h1>
			<span class="operation">OPERATION EMBER LANCE</span>
		</header>

		<div class="score-block">
			<div>
				<p>Final score</p>
				<strong>{score.toLocaleString()}</strong>
				{#if results?.newBestScore}<span>NEW PERSONAL BEST</span>{/if}
			</div>
			<div class="rating" aria-label={`Combat rating ${results?.rating ?? 'C'}`}>
				<p>C–S RATING</p>
				<b>{results?.rating ?? (success ? 'C' : 'D')}</b>
				<small>{success ? 'COMBAT EFFECTIVE' : 'REASSESS & REDEPLOY'}</small>
			</div>
		</div>

		<div class="metrics" aria-label="Mission statistics">
			<div>
				<span>MISSION TIME</span>
				<strong>{time}</strong>
				<small>{results?.newBestTime ? 'BEST TIME' : 'ELAPSED'}</small>
			</div>
			<div>
				<span>TARGETS</span>
				<strong>{targets.toString().padStart(2, '0')}</strong>
				<small>CONFIRMED</small>
			</div>
			<div>
				<span>ACCURACY</span>
				<strong>{Math.round((results?.accuracy ?? 0) * 100)}%</strong>
				<small>WEAPONS</small>
			</div>
			<div>
				<span>MISSILES</span>
				<strong>{missiles.toString().padStart(2, '0')}</strong>
				<small>EXPENDED</small>
			</div>
			<div>
				<span>DAMAGE</span>
				<strong>{Math.round(results?.damageTaken ?? 0)}%</strong>
				<small>AIRFRAME</small>
			</div>
			<div>
				<span>SQUAD CONTRIBUTION</span>
				<strong>{squadContribution}%</strong>
				<small>FLIGHT STATUS</small>
			</div>
		</div>

		{#if success}
			<p class="debrief">
				Ember command is offline. Radar coverage has collapsed across the corridor and Viper Flight
				is returning to base.
			</p>
		{:else}
			<p class="debrief">
				The strike package could not complete its objectives. Review the tactical record and prepare
				to re-enter the corridor.
			</p>
		{/if}

		<div class="actions">
			<button class="primary" type="button" onclick={onReplay}>Replay Mission</button>
			<button type="button" onclick={onMenu}>Return to Main Menu</button>
		</div>
	</div>

	<div class="footer-code" aria-hidden="true">
		<span>AFTER ACTION REPORT // EL-01</span>
		<i></i>
		<span>FILED {success ? 'SUCCESS' : 'INCOMPLETE'}</span>
	</div>
</dialog>

<style>
	.results {
		position: absolute;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		margin: 0;
		overflow: auto;
		padding: clamp(1rem, 4vw, 3rem);
		color: #effafd;
		border: 0;
		background:
			linear-gradient(90deg, rgba(2, 9, 15, 0.97), rgba(3, 13, 20, 0.78), rgba(2, 9, 15, 0.95)),
			linear-gradient(0deg, rgba(2, 8, 14, 0.96), transparent 65%);
		backdrop-filter: blur(10px) saturate(0.7);
		animation: results-in 700ms ease both;
	}

	.results::after {
		position: fixed;
		inset: 0;
		content: '';
		pointer-events: none;
		background: repeating-linear-gradient(
			0deg,
			transparent 0 3px,
			rgba(111, 222, 240, 0.022) 3px 4px
		);
	}

	.atmosphere {
		position: fixed;
		top: 10%;
		left: 50%;
		width: min(55rem, 90vw);
		aspect-ratio: 1;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(73, 199, 218, 0.12), transparent 68%);
		transform: translateX(-50%);
	}

	.results.failure .atmosphere {
		background: radial-gradient(circle, rgba(218, 75, 50, 0.13), transparent 68%);
	}

	.results-frame {
		position: relative;
		z-index: 1;
		width: min(64rem, 100%);
	}

	header {
		text-align: center;
	}

	.seal {
		position: relative;
		display: grid;
		width: 4rem;
		aspect-ratio: 1;
		margin: 0 auto 1.3rem;
		place-items: center;
		color: #07161c;
		border-radius: 50%;
		background: #7ce3c0;
		box-shadow: 0 0 45px rgba(102, 222, 182, 0.25);
		font-size: 1.4rem;
		font-weight: 900;
	}

	.failure .seal {
		color: #fff5ef;
		background: #e66e4e;
		box-shadow: 0 0 45px rgba(226, 87, 53, 0.25);
	}

	.seal i {
		position: absolute;
		inset: -0.45rem;
		border: 1px dashed currentColor;
		border-radius: 50%;
		opacity: 0.38;
		animation: rotate 12s linear infinite;
	}

	header p {
		margin: 0 0 0.65rem;
		color: #74d9e9;
		font:
			650 0.56rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.2em;
	}

	.failure header p {
		color: #ef9a70;
	}

	h1 {
		margin: 0;
		font-size: clamp(3rem, 8vw, 7rem);
		line-height: 0.88;
		letter-spacing: -0.06em;
		text-transform: uppercase;
	}

	.operation {
		display: block;
		margin-top: 0.9rem;
		color: rgba(188, 222, 228, 0.42);
		font:
			600 0.58rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.15em;
	}

	.score-block {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 2rem;
		align-items: center;
		margin-top: clamp(2rem, 6vh, 4rem);
		padding: 1.2rem 1.4rem;
		border-block: 1px solid rgba(105, 211, 229, 0.19);
		background: linear-gradient(90deg, rgba(9, 35, 44, 0.52), rgba(4, 19, 27, 0.24));
	}

	.score-block p {
		margin: 0;
		color: rgba(169, 215, 222, 0.55);
		font:
			650 0.59rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	.score-block strong {
		display: block;
		margin-top: 0.25rem;
		font:
			500 clamp(2rem, 6vw, 4rem) / 0.9 ui-monospace,
			monospace;
		letter-spacing: -0.06em;
	}

	.score-block > div:first-child > span {
		display: inline-block;
		margin-top: 0.6rem;
		padding: 0.2rem 0.35rem;
		color: #7de2bc;
		border: 1px solid rgba(107, 226, 183, 0.35);
		font:
			650 0.48rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
	}

	.rating {
		display: grid;
		grid-template-columns: auto auto;
		gap: 0.1rem 1rem;
		align-items: center;
		text-align: right;
	}

	.rating p,
	.rating small {
		grid-column: 1;
	}

	.rating b {
		grid-row: 1 / 3;
		grid-column: 2;
		color: #f3aa70;
		font:
			800 clamp(3rem, 8vw, 5rem) / 0.8 ui-sans-serif,
			system-ui,
			sans-serif;
	}

	.rating small {
		color: rgba(168, 215, 222, 0.48);
		font:
			600 0.48rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.1em;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		border-bottom: 1px solid rgba(105, 211, 229, 0.19);
	}

	.metrics > div {
		display: grid;
		min-width: 0;
		padding: 1rem 0.7rem;
		border-right: 1px solid rgba(105, 211, 229, 0.12);
	}

	.metrics > div:last-child {
		border-right: 0;
	}

	.metrics span,
	.metrics small {
		overflow: hidden;
		color: rgba(166, 213, 221, 0.48);
		font:
			600 0.49rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.08em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.metrics strong {
		margin: 0.45rem 0;
		color: #e8f7f9;
		font:
			550 clamp(1rem, 2vw, 1.5rem) / 1 ui-monospace,
			monospace;
	}

	.metrics small {
		color: rgba(235, 159, 104, 0.55);
		font-size: 0.44rem;
	}

	.debrief {
		max-width: 43rem;
		margin: 1.3rem auto;
		color: rgba(204, 230, 234, 0.63);
		font-size: 0.72rem;
		line-height: 1.6;
		text-align: center;
	}

	.actions {
		display: flex;
		gap: 0.6rem;
		justify-content: center;
	}

	button {
		min-width: 12rem;
		padding: 0.8rem 1.2rem;
		color: #bfe7ed;
		border: 1px solid rgba(107, 214, 232, 0.3);
		background: rgba(7, 30, 39, 0.7);
		font:
			700 0.64rem/1 ui-sans-serif,
			system-ui,
			sans-serif;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		clip-path: polygon(0 0, calc(100% - 0.6rem) 0, 100% 0.6rem, 100% 100%, 0 100%);
	}

	button.primary {
		color: #07151a;
		border-color: #ef9a60;
		background: linear-gradient(105deg, #ef9256, #ffc185);
	}

	.footer-code {
		position: fixed;
		right: 2rem;
		bottom: 1rem;
		left: 2rem;
		display: flex;
		gap: 0.8rem;
		align-items: center;
		color: rgba(157, 202, 210, 0.28);
		font:
			500 0.47rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.09em;
	}

	.footer-code i {
		flex: 1;
		height: 1px;
		background: rgba(104, 206, 222, 0.12);
	}

	@keyframes results-in {
		from {
			opacity: 0;
		}
	}

	@keyframes rotate {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 760px) {
		.results {
			align-items: start;
		}

		.metrics {
			grid-template-columns: repeat(3, 1fr);
		}

		.metrics > div:nth-child(3) {
			border-right: 0;
		}

		.metrics > div:nth-child(-n + 3) {
			border-bottom: 1px solid rgba(105, 211, 229, 0.12);
		}
	}

	@media (max-width: 520px) {
		.results {
			padding: 1.5rem 0.8rem 3rem;
		}

		.score-block {
			grid-template-columns: 1fr auto;
			gap: 0.6rem;
			padding-inline: 0.8rem;
		}

		.rating p,
		.rating small {
			display: none;
		}

		.rating b {
			grid-row: auto;
			grid-column: auto;
		}

		.actions {
			flex-direction: column;
		}

		button {
			width: 100%;
		}

		.footer-code {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.results,
		.seal i {
			animation: none;
		}
	}
</style>
