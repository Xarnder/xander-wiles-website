<script lang="ts">
	import type { GameSettingsHost, SettingsGroup } from '$lib/game/settings/GameSettingsHost';
	import {
		buildSettingsCatalog,
		categoryMatchesQuery,
		fieldMatchesQuery,
		firstMatchingCategoryId,
		groupMatchesQuery
	} from '$lib/game/settings/settingsCatalog';
	import SettingsField from './SettingsField.svelte';

	interface Props {
		host: GameSettingsHost;
		onClose: () => void;
	}

	let { host, onClose }: Props = $props();

	let categoryId = $state('world');
	let query = $state('');

	const catalog = $derived(buildSettingsCatalog(host));
	const normalizedQuery = $derived(query.trim().toLowerCase());
	const active = $derived(catalog.find((category) => category.id === categoryId) ?? catalog[0]);

	function visibleFields(group: SettingsGroup) {
		if (!normalizedQuery) return group.fields;
		if (
			group.title.toLowerCase().includes(normalizedQuery) ||
			group.id.toLowerCase().includes(normalizedQuery)
		)
			return group.fields;
		return group.fields.filter((field) => fieldMatchesQuery(field, normalizedQuery));
	}

	function showGroup(group: SettingsGroup): boolean {
		return groupMatchesQuery(group, normalizedQuery);
	}

	function onSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		query = value;
		const match = firstMatchingCategoryId(catalog, value);
		if (match) categoryId = match;
	}

	const activeHasResults = $derived(!!active && active.groups.some((group) => showGroup(group)));
</script>

{#snippet fieldList(group: SettingsGroup)}
	<div class="fields">
		{#each visibleFields(group) as field (field.id)}
			<SettingsField {field} />
		{/each}
	</div>
{/snippet}

<div
	class="settings-overlay"
	data-testid="settings-overlay"
	role="presentation"
	onclick={(event) => {
		if (event.currentTarget === event.target) onClose();
	}}
>
	<div class="settings-panel" role="dialog" aria-labelledby="settings-title" aria-modal="true">
		<header>
			<div>
				<p class="eyebrow">Forest Drift</p>
				<h2 id="settings-title">Settings</h2>
			</div>
			<div class="header-actions">
				<input
					class="search"
					type="search"
					placeholder="Search settings"
					data-testid="settings-search"
					value={query}
					oninput={onSearchInput}
				/>
				<button type="button" class="close" data-testid="settings-close" onclick={onClose}
					>Done</button
				>
			</div>
		</header>

		<div class="body">
			<nav aria-label="Settings sections">
				{#each catalog as category (category.id)}
					<button
						type="button"
						class={{
							active: category.id === active?.id,
							dim: normalizedQuery.length > 0 && !categoryMatchesQuery(category, normalizedQuery)
						}}
						aria-current={category.id === active?.id ? 'true' : undefined}
						data-testid="settings-nav-{category.id}"
						onclick={() => (categoryId = category.id)}
					>
						{category.title}
					</button>
				{/each}
			</nav>

			<section class="content">
				{#if active}
					<p class="section-lead">{active.description}</p>
					{#if !activeHasResults}
						<p class="empty-results" data-testid="settings-empty">
							No settings match “{query.trim()}”.
						</p>
					{/if}
					{#each active.groups as group (group.id)}
						{#if showGroup(group)}
							<div class="group" data-testid="settings-group-{group.id}">
								<h3>{group.title}</h3>
								{@render fieldList(group)}
								{#if group.groups}
									{#each group.groups as child (child.id)}
										{#if showGroup(child)}
											<div class="subgroup" data-testid="settings-group-{child.id}">
												<h4>{child.title}</h4>
												{@render fieldList(child)}
											</div>
										{/if}
									{/each}
								{/if}
							</div>
						{/if}
					{/each}
				{/if}
			</section>
		</div>
	</div>
</div>

<style>
	.settings-overlay {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
		padding: 1.2rem;
		background: rgba(4, 10, 8, 0.62);
		backdrop-filter: blur(6px);
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		color: #eaf6ff;
	}

	.settings-panel {
		width: min(72rem, 96vw);
		height: min(46rem, 92vh);
		display: flex;
		flex-direction: column;
		border-radius: 18px;
		background: linear-gradient(180deg, rgba(16, 32, 25, 0.98), rgba(10, 20, 16, 0.98));
		border: 1px solid rgba(234, 246, 255, 0.16);
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
		overflow: hidden;
	}

	header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.15rem 1.3rem 1rem;
		border-bottom: 1px solid rgba(164, 214, 186, 0.16);
	}

	.eyebrow {
		margin: 0 0 0.2rem;
		font-size: 0.68rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #9fe0b8;
	}

	h2 {
		margin: 0;
		font-size: 1.45rem;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}

	.search,
	.close,
	nav button {
		font: inherit;
		color: #eaf6ff;
		border: 1px solid rgba(234, 246, 255, 0.22);
		background: rgba(8, 18, 14, 0.55);
	}

	.search {
		width: min(18rem, 42vw);
		padding: 0.5rem 0.7rem;
		border-radius: 9px;
	}

	.close {
		padding: 0.5rem 0.9rem;
		border-radius: 9px;
		font-weight: 700;
		cursor: pointer;
		background: rgba(57, 211, 83, 0.86);
		border-color: rgba(57, 211, 83, 0.95);
		color: #04121f;
	}

	.body {
		flex: 1 1 auto;
		display: grid;
		grid-template-columns: 13.5rem minmax(0, 1fr);
		min-height: 0;
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.85rem 0.7rem;
		border-right: 1px solid rgba(164, 214, 186, 0.14);
		overflow: auto;
	}

	nav button {
		text-align: left;
		padding: 0.55rem 0.7rem;
		border-radius: 8px;
		font-size: 0.86rem;
		font-weight: 650;
		cursor: pointer;
	}

	nav button:hover {
		border-color: rgba(159, 232, 255, 0.45);
		background: rgba(30, 55, 42, 0.75);
	}

	nav button.active {
		background: rgba(57, 211, 83, 0.18);
		border-color: rgba(94, 224, 138, 0.7);
		color: #f4fff7;
	}

	nav button.dim {
		opacity: 0.38;
	}

	.content {
		overflow: auto;
		padding: 1rem 1.2rem 1.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.section-lead {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.45;
		color: #c5ddcf;
	}

	.empty-results {
		margin: 0;
		padding: 0.85rem 1rem;
		border-radius: 12px;
		background: rgba(6, 16, 12, 0.45);
		border: 1px solid rgba(164, 214, 186, 0.12);
		font-size: 0.86rem;
		color: #c5ddcf;
	}

	.group,
	.subgroup {
		padding: 0.9rem 1rem;
		border-radius: 12px;
		background: rgba(6, 16, 12, 0.45);
		border: 1px solid rgba(164, 214, 186, 0.12);
	}

	.subgroup {
		margin-top: 0.75rem;
		background: rgba(12, 28, 20, 0.45);
	}

	h3,
	h4 {
		margin: 0 0 0.75rem;
		font-size: 0.95rem;
	}

	h4 {
		font-size: 0.82rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #a8d4b8;
	}

	.fields {
		display: grid;
		gap: 0.85rem;
	}

	@media (max-width: 720px) {
		.settings-panel {
			height: min(52rem, 94vh);
		}

		.body {
			grid-template-columns: 1fr;
		}

		nav {
			flex-direction: row;
			flex-wrap: wrap;
			border-right: none;
			border-bottom: 1px solid rgba(164, 214, 186, 0.14);
		}
	}
</style>
