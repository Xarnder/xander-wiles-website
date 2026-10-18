<script lang="ts">
	import { untrack } from 'svelte';
	import { AVATAR_COLOURS, parseWorldReference, type WorldReference } from '$lib/game/net/mpConfig';
	import { sanitizeDisplayName } from '$lib/game/net/protocol';

	interface Props {
		/** Known from the invite link; null asks for the link. */
		target: WorldReference | null;
		initialName: string;
		initialColour: string;
		busy: boolean;
		error: string | null;
		onJoin: (reference: WorldReference, name: string, colour: string) => void;
		onCancel: () => void;
	}

	const { target, initialName, initialColour, busy, error, onJoin, onCancel }: Props = $props();

	let reference = $state('');
	// Editable copies: the props only seed the fields.
	let name = $state(untrack(() => initialName));
	let colour = $state(untrack(() => initialColour));
	let localError = $state<string | null>(null);

	const cleanName = $derived(sanitizeDisplayName(name));

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		const world = target ?? parseWorldReference(reference);
		if (!world) {
			localError = 'Paste the whole invite link you were sent.';
			return;
		}
		if (!cleanName) {
			localError = 'Choose a name of 2–20 characters.';
			return;
		}
		localError = null;
		onJoin(world, cleanName, colour);
	}
</script>

<div class="modal-backdrop" role="presentation">
	<form class="modal" data-testid="join-world-dialog" onsubmit={submit}>
		<h3>Join an online world</h3>
		{#if !target}
			<label>
				Invite link
				<input
					data-testid="join-world-reference"
					bind:value={reference}
					placeholder="https://…?mp=…#invite=…"
					autocomplete="off"
				/>
			</label>
		{/if}
		<label>
			Your name
			<!-- svelte-ignore a11y_autofocus -->
			<input
				data-testid="join-world-name"
				bind:value={name}
				maxlength="20"
				autofocus
				placeholder="Sam"
				autocomplete="nickname"
			/>
		</label>
		<fieldset>
			<legend>Your colour</legend>
			<div class="swatches">
				{#each AVATAR_COLOURS as option (option)}
					<button
						type="button"
						class="swatch"
						class:selected={option === colour}
						style={`--swatch: ${option}`}
						aria-label={`Colour ${option}`}
						aria-pressed={option === colour}
						onclick={() => (colour = option)}
					></button>
				{/each}
			</div>
		</fieldset>
		<p class="modal-hint">
			You'll see each other move, and what you build is shared and saved online.
		</p>
		{#if localError ?? error}
			<p class="modal-error" role="alert">{localError ?? error}</p>
		{/if}
		<div class="modal-buttons">
			<button type="button" onclick={onCancel} disabled={busy}>Cancel</button>
			<button
				type="submit"
				class="primary"
				data-testid="join-world-confirm"
				disabled={busy || !cleanName}
			>
				{busy ? 'Joining…' : 'Join'}
			</button>
		</div>
	</form>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgba(4, 10, 8, 0.72);
		backdrop-filter: blur(3px);
		z-index: 40;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		color: #eaf6ff;
	}

	.modal {
		width: min(26rem, 92vw);
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		padding: 1.25rem;
		border-radius: 14px;
		background: rgba(14, 28, 22, 0.98);
		border: 1px solid rgba(234, 246, 255, 0.18);
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
	}

	h3 {
		margin: 0;
		font-size: 1.05rem;
	}

	label,
	legend {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
		font-weight: 600;
		opacity: 0.85;
	}

	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}

	legend {
		margin-bottom: 0.4rem;
	}

	input {
		padding: 0.5rem 0.6rem;
		border-radius: 8px;
		border: 1px solid rgba(234, 246, 255, 0.25);
		background: rgba(0, 0, 0, 0.35);
		color: #eaf6ff;
		font-family: inherit;
		font-size: 0.9rem;
	}

	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.swatch {
		width: 2rem;
		height: 2rem;
		padding: 0;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.15);
		background: var(--swatch);
		cursor: pointer;
	}

	.swatch.selected {
		border-color: #ffffff;
		box-shadow: 0 0 0 2px rgba(57, 211, 83, 0.9);
	}

	.modal-hint {
		margin: 0;
		font-size: 0.78rem;
		opacity: 0.75;
		line-height: 1.4;
	}

	.modal-error {
		margin: 0;
		font-size: 0.8rem;
		color: #ffb4b4;
	}

	.modal-buttons {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.modal-buttons button {
		padding: 0.5rem 0.9rem;
		border-radius: 8px;
		border: 1px solid rgba(234, 246, 255, 0.25);
		background: rgba(10, 20, 15, 0.55);
		color: #eaf6ff;
		font-family: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	.modal-buttons button:hover:not(:disabled) {
		background: rgba(30, 55, 42, 0.85);
		border-color: rgba(159, 232, 255, 0.55);
	}

	.modal-buttons button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.modal-buttons button.primary {
		background: rgba(57, 211, 83, 0.85);
		border-color: rgba(57, 211, 83, 0.9);
		color: #04121f;
	}
</style>
