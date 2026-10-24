<script lang="ts">
	import type { PlayerRole } from '$lib/game/net/protocol';

	interface Props {
		links: { role: PlayerRole; url: string }[];
		compact?: boolean;
	}

	const { links, compact = false }: Props = $props();

	const ROLE_TEXT: Record<PlayerRole, { title: string; hint: string }> = {
		editor: { title: 'Builder link', hint: 'Can explore and build.' },
		viewer: { title: 'Visitor link', hint: 'Can look around, but not build.' },
		owner: {
			title: 'Owner link',
			hint: 'Keep this one to yourself: it can change the sky, weather and time.'
		}
	};

	let copiedRole = $state<PlayerRole | null>(null);
	let copyErrorRole = $state<PlayerRole | null>(null);

	async function copy(role: PlayerRole, url: string) {
		copyErrorRole = null;
		try {
			await navigator.clipboard.writeText(url);
			copiedRole = role;
			setTimeout(() => {
				if (copiedRole === role) copiedRole = null;
			}, 2000);
		} catch {
			copiedRole = null;
			copyErrorRole = role;
		}
	}
</script>

<ul class={['links', { compact }]}>
	{#each links as link (link.role)}
		<li data-testid="invite-link-{link.role}">
			<div class="text">
				<span class="title">{ROLE_TEXT[link.role].title}</span>
				{#if !compact}<span class="hint">{ROLE_TEXT[link.role].hint}</span>{/if}
			</div>
			<div class="row">
				<input
					readonly
					value={link.url}
					aria-label={ROLE_TEXT[link.role].title}
					onclick={(event) => event.currentTarget.select()}
				/>
				<button
					type="button"
					onclick={() => void copy(link.role, link.url)}
					onpointerdown={(event) => event.stopPropagation()}
				>
					{copiedRole === link.role ? 'Copied' : 'Copy'}
				</button>
			</div>
			{#if copyErrorRole === link.role}<span class="hint" role="status"
					>Select the link above and copy it manually; clipboard access is unavailable.</span
				>{/if}
		</li>
	{/each}
</ul>

<style>
	.links {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.links.compact {
		gap: 0.45rem;
	}

	li {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.title {
		font-size: 0.8rem;
		font-weight: 650;
	}

	.hint {
		font-size: 0.74rem;
		opacity: 0.72;
	}

	.row {
		display: flex;
		gap: 0.4rem;
	}

	input {
		flex: 1 1 auto;
		min-width: 0;
		padding: 0.4rem 0.55rem;
		border-radius: 8px;
		border: 1px solid rgba(234, 246, 255, 0.25);
		background: rgba(0, 0, 0, 0.35);
		color: #eaf6ff;
		font-family: inherit;
		font-size: 0.74rem;
	}

	button {
		padding: 0.4rem 0.75rem;
		border-radius: 8px;
		border: 1px solid rgba(234, 246, 255, 0.25);
		background: rgba(10, 20, 15, 0.55);
		color: #eaf6ff;
		font-family: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}

	button:hover {
		background: rgba(30, 55, 42, 0.85);
		border-color: rgba(159, 232, 255, 0.55);
	}
</style>
