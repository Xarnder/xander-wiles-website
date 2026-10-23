<script lang="ts">
	import { untrack } from 'svelte';
	import {
		AVATAR_COLOURS,
		parseWorldReference,
		type OnlineWorldEntry,
		type WorldReference
	} from '$lib/game/net/mpConfig';
	import { sanitizeDisplayName } from '$lib/game/net/protocol';
	import { relativeTime } from '$lib/ui/relativeTime';

	interface Props {
		/** Known from the invite link; null asks for the link. */
		target: WorldReference | null;
		initialName: string;
		initialColour: string;
		busy: boolean;
		error: string | null;
		/** Online worlds this browser has joined before (most recent first), offered in place of a link. */
		recentWorlds?: OnlineWorldEntry[];
		onJoin: (reference: WorldReference, name: string, colour: string) => void;
		onForget?: (worldId: string) => void;
		onCancel: () => void;
	}

	const {
		target,
		initialName,
		initialColour,
		busy,
		error,
		recentWorlds = [],
		onJoin,
		onForget,
		onCancel
	}: Props = $props();

	const ROLE_LABEL = { owner: 'Owner', editor: 'Builder', viewer: 'Visitor' } as const;

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

	function joinRecent(entry: OnlineWorldEntry) {
		if (busy) return;
		if (!cleanName) {
			localError = 'Choose a name of 2–20 characters.';
			return;
		}
		localError = null;
		onJoin({ worldId: entry.worldId, invite: entry.invite }, cleanName, colour);
	}

	function recentMeta(entry: OnlineWorldEntry): string {
		const parts: string[] = [];
		if (entry.role) parts.push(ROLE_LABEL[entry.role]);
		if (entry.lastJoinedAt) parts.push(`Played ${relativeTime(entry.lastJoinedAt)}`);
		return parts.join(' · ');
	}
</script>

<div data-ui-backdrop class="modal-backdrop" role="presentation">
	<form data-ui-surface="panel" class="modal" data-testid="join-world-dialog" onsubmit={submit}>
		<h3>Join an online world</h3>
		{#if !target && recentWorlds.length > 0}
			<section class="recent" aria-labelledby="recent-worlds-heading">
				<h4 id="recent-worlds-heading">Recent worlds</h4>
				<ul data-testid="recent-worlds">
					{#each recentWorlds as entry (entry.worldId)}
						<li data-testid="recent-world-{entry.worldId}">
							<button
								type="button"
								class="recent-join"
								data-testid="recent-world-join"
								title="Join {entry.name}"
								onclick={() => joinRecent(entry)}
								disabled={busy}
							>
								<span class="recent-name">{entry.name}</span>
								{#if recentMeta(entry)}<span class="recent-meta">{recentMeta(entry)}</span>{/if}
							</button>
							{#if onForget}
								<button
									type="button"
									class="recent-forget"
									aria-label="Forget {entry.name}"
									title="Remove from this list (the world itself stays online)"
									onclick={() => onForget(entry.worldId)}
									disabled={busy}
								>
									×
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		{#if !target}
			<label>
				{recentWorlds.length > 0 ? 'Or paste an invite link' : 'Invite link'}
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

	.recent {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.recent h4 {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 600;
		opacity: 0.85;
	}

	.recent ul {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-height: 14rem;
		overflow-y: auto;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.recent li {
		display: flex;
		gap: 0.35rem;
	}

	.recent button {
		border-radius: 8px;
		border: 1px solid rgba(234, 246, 255, 0.18);
		background: rgba(0, 0, 0, 0.3);
		color: #eaf6ff;
		font-family: inherit;
		cursor: pointer;
	}

	.recent button:hover:not(:disabled) {
		background: rgba(30, 55, 42, 0.85);
		border-color: rgba(57, 211, 83, 0.7);
	}

	.recent button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.recent-join {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		padding: 0.5rem 0.7rem;
		text-align: left;
	}

	.recent-name {
		max-width: 100%;
		font-size: 0.9rem;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.recent-meta {
		font-size: 0.72rem;
		opacity: 0.7;
	}

	.recent-forget {
		flex: none;
		width: 2.25rem;
		font-size: 1.1rem;
		line-height: 1;
		opacity: 0.75;
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
