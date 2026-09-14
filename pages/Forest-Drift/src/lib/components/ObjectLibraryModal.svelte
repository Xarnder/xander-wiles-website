<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { DEFAULT_MINI_BUILDS } from '$lib/game/miniBuild/defaultMiniBuilds';
	import { contentHash, gridToMeters } from '$lib/game/miniBuild/miniBuildGrid';
	import { selectionKey, type LibrarySort } from '$lib/game/miniBuild/MiniBuildPreferences';
	import type {
		MiniBuildDefinition,
		PlaceObjectSelection
	} from '$lib/game/miniBuild/MiniBuildTypes';
	import type { ThreeScene } from '$lib/game/ThreeScene';
	import type { MiniBuildEditorLaunch } from './MiniBuildEditor.svelte';
	import MiniBuildChoiceDialog, { type ChoiceOption } from './MiniBuildChoiceDialog.svelte';

	let {
		scene,
		onClose,
		onOpenEditor
	}: {
		scene: ThreeScene;
		onClose: () => void;
		onOpenEditor: (launch: MiniBuildEditorLaunch) => void;
	} = $props();

	interface LibraryItem {
		key: string;
		definition: MiniBuildDefinition;
		selection: PlaceObjectSelection;
		source: 'world' | 'personal' | 'default';
		placed: number;
	}

	const LIGHTS = [
		{ kind: 'torch', name: 'Torch' },
		{ kind: 'lantern', name: 'Lantern' },
		{ kind: 'fireplace', name: 'Fireplace' }
	] as const;

	let revision = $state(0);
	let query = $state('');
	let sort = $state<LibrarySort>('recent');
	let selectedKey = $state('');
	let thumbnails = $state<Record<string, string>>({});
	let dialog = $state<{ title: string; lines: string[]; options: ChoiceOption[] } | null>(null);
	let renaming = $state<{ id: string; value: string } | null>(null);
	let notice = $state<string | null>(null);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	let unsubscribeSystem = () => {};
	let unsubscribePersonal = () => {};

	const myBuilds = $derived.by((): LibraryItem[] => {
		void revision;
		// A plain local record: rebuilt on every revision, never mutated reactively.
		const items: Record<string, LibraryItem> = {};
		for (const summary of scene.miniBuilds.listDesigns()) {
			// World copies of defaults are listed under Default Designs until the player changes them.
			if (summary.definition.sourceDefaultId && summary.placedCount === 0) continue;
			items[summary.definition.id] = {
				key: `design:${summary.definition.id}`,
				definition: summary.definition,
				selection: { type: 'mini-build', designId: summary.definition.id },
				source: 'world',
				placed: summary.placedCount
			};
		}
		for (const definition of scene.miniBuildPersonalLibrary.list()) {
			if (items[definition.id]) continue;
			items[definition.id] = {
				key: `design:${definition.id}`,
				definition,
				selection: { type: 'personal-design', designId: definition.id },
				source: 'personal',
				placed: 0
			};
		}
		return sortItems(filterItems(Object.values(items)));
	});

	const defaults = $derived.by((): LibraryItem[] => {
		void revision;
		return filterItems(
			DEFAULT_MINI_BUILDS.map((definition) => ({
				key: `default:${definition.id}`,
				definition,
				selection: { type: 'default-design', defaultId: definition.id } as PlaceObjectSelection,
				source: 'default' as const,
				placed: 0
			}))
		);
	});

	const lights = $derived(
		LIGHTS.filter(
			(light) => !query.trim() || light.name.toLowerCase().includes(query.trim().toLowerCase())
		)
	);

	function filterItems(items: LibraryItem[]): LibraryItem[] {
		const needle = query.trim().toLowerCase();
		if (!needle) return items;
		return items.filter(
			(item) =>
				item.definition.name.toLowerCase().includes(needle) ||
				(item.definition.semanticType ?? '').includes(needle)
		);
	}

	function sortItems(items: LibraryItem[]): LibraryItem[] {
		const prefs = scene.miniBuildPreferences;
		return [...items].sort((a, b) => {
			if (sort === 'name') return a.definition.name.localeCompare(b.definition.name);
			if (sort === 'created') return b.definition.createdAt.localeCompare(a.definition.createdAt);
			const rankA = prefs.recentRank(a.selection);
			const rankB = prefs.recentRank(b.selection);
			// Never-used designs rank Infinity; compare explicitly (Infinity - Infinity is NaN).
			if (rankA !== rankB) return rankA < rankB ? -1 : 1;
			return b.definition.updatedAt.localeCompare(a.definition.updatedAt);
		});
	}

	function setSort(next: LibrarySort) {
		sort = next;
		scene.miniBuildPreferences.setSort(next);
	}

	function flash(text: string) {
		notice = text;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = null), 2600);
	}

	function loadThumbnail(definition: MiniBuildDefinition) {
		const hash = contentHash(definition);
		if (thumbnails[hash]) return;
		void scene.miniBuildThumbnails.getUrl(definition).then((url) => {
			if (url) thumbnails = { ...thumbnails, [hash]: url };
		});
	}

	$effect(() => {
		for (const item of [...myBuilds, ...defaults]) loadThumbnail(item.definition);
	});

	function sizeLabel(definition: MiniBuildDefinition): string {
		const b = definition.bounds;
		return `${gridToMeters(b.max.x - b.min.x).toFixed(2)} × ${gridToMeters(b.max.z - b.min.z).toFixed(2)} × ${gridToMeters(b.max.y - b.min.y).toFixed(2)}m`;
	}

	function place(selection: PlaceObjectSelection) {
		scene.selectPlaceObject(selection);
		selectedKey = selectionKey(selection);
		onClose();
	}

	function edit(item: LibraryItem) {
		if (item.source === 'default') {
			onOpenEditor({ kind: 'template', definition: item.definition });
			return;
		}
		if (item.source === 'personal') {
			// Editing a personal design brings it into this world first, so the result is self-contained.
			const imported = scene.miniBuilds.ensureInWorld(item.selection);
			if (!imported.ok) return flash(imported.error);
			onOpenEditor({ kind: 'edit', designId: imported.value.id });
			return;
		}
		if (item.placed === 0) {
			onOpenEditor({ kind: 'edit', designId: item.definition.id });
			return;
		}
		dialog = {
			title: `Edit "${item.definition.name}"`,
			lines: [
				`${item.placed} placed ${item.placed === 1 ? 'copy uses' : 'copies use'} this design.`,
				'Changes will update all copies.'
			],
			options: [
				{
					label: 'Edit All Copies',
					testId: 'mini-build-edit-all',
					tone: 'primary',
					onSelect: () => {
						dialog = null;
						onOpenEditor({ kind: 'edit', designId: item.definition.id });
					}
				},
				{
					label: 'Make Unique Copy',
					testId: 'mini-build-edit-unique',
					onSelect: () => {
						dialog = null;
						const copy = scene.miniBuilds.duplicateDesign(item.definition.id);
						if (!copy.ok) return flash(copy.error);
						onOpenEditor({ kind: 'edit', designId: copy.value.id });
					}
				}
			]
		};
	}

	function duplicate(item: LibraryItem) {
		const source = scene.miniBuilds.ensureInWorld(item.selection);
		if (!source.ok) return flash(source.error);
		const copy = scene.miniBuilds.duplicateDesign(source.value.id);
		if (!copy.ok) return flash(copy.error);
		void scene.miniBuildPersonalLibrary.upsert(copy.value);
		flash(`Created ${copy.value.name}`);
	}

	function startRename(item: LibraryItem) {
		renaming = { id: item.definition.id, value: item.definition.name };
	}

	function commitRename(item: LibraryItem) {
		if (!renaming) return;
		const name = renaming.value;
		renaming = null;
		if (item.source === 'world') {
			const result = scene.miniBuilds.renameDesign(item.definition.id, name);
			if (!result.ok) return flash(result.error);
			void scene.miniBuildPersonalLibrary.upsert(result.value);
		} else if (item.source === 'personal') {
			void scene.miniBuildPersonalLibrary.upsert({
				...item.definition,
				name: name.trim() || item.definition.name,
				updatedAt: new Date().toISOString()
			});
		}
	}

	function remove(item: LibraryItem) {
		const inWorld = item.source === 'world';
		const placed = inWorld ? scene.miniBuilds.placedCount(item.definition.id) : 0;
		const finish = () => {
			void scene.miniBuildPersonalLibrary.remove(item.definition.id);
			scene.miniBuildPreferences.forget((selection) => selectionKey(selection) === item.key);
			dialog = null;
			flash(`Deleted ${item.definition.name}`);
		};
		if (placed > 0) {
			dialog = {
				title: `Delete "${item.definition.name}"?`,
				lines: [`This design is used by ${placed} placed ${placed === 1 ? 'object' : 'objects'}.`],
				options: [
					{
						label: 'Delete Design and All Instances',
						testId: 'mini-build-delete-all',
						tone: 'danger',
						onSelect: () => {
							const result = scene.miniBuilds.deleteDesign(item.definition.id, {
								deleteInstances: true
							});
							if (!result.ok) return flash(result.error);
							finish();
						}
					}
				]
			};
			return;
		}
		dialog = {
			title: `Delete "${item.definition.name}"?`,
			lines: [
				inWorld
					? 'No placed objects use this design.'
					: 'This removes it from My Builds on this device.'
			],
			options: [
				{
					label: 'Delete Design',
					testId: 'mini-build-delete-confirm',
					tone: 'danger',
					onSelect: () => {
						if (inWorld) {
							const result = scene.miniBuilds.deleteDesign(item.definition.id);
							if (!result.ok) return flash(result.error);
						}
						finish();
					}
				}
			]
		};
	}

	/**
	 * Keyboard: typing into search must never trigger world shortcuts; `E` / `Esc` close the library
	 * (the same key that opened it), matching the other placement modals.
	 */
	function onKeyDown(event: KeyboardEvent) {
		if (dialog) return;
		const target = event.target as HTMLElement | null;
		const typing =
			target instanceof HTMLInputElement ||
			target instanceof HTMLSelectElement ||
			target instanceof HTMLTextAreaElement;
		event.stopPropagation();
		if (event.code === 'Escape') {
			event.preventDefault();
			if (renaming) renaming = null;
			else if (typing) target?.blur();
			else onClose();
			return;
		}
		if (!typing && event.code === 'KeyE') {
			event.preventDefault();
			onClose();
		}
	}

	onMount(() => {
		sort = scene.miniBuildPreferences.sort;
		selectedKey = selectionKey(scene.getPlaceObjectSelection());
		unsubscribeSystem = scene.miniBuilds.subscribe(() => revision++);
		unsubscribePersonal = scene.miniBuildPersonalLibrary.subscribe(() => revision++);
		scene.setMiniBuildOverlay({ libraryOpen: true });
		window.addEventListener('keydown', onKeyDown, true);
		void scene.miniBuildPersonalLibrary.ready().then(() => revision++);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', onKeyDown, true);
		unsubscribeSystem();
		unsubscribePersonal();
		clearTimeout(noticeTimer);
		scene.setMiniBuildOverlay({ libraryOpen: false });
	});

	function onBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) onClose();
	}
</script>

{#snippet card(item: LibraryItem)}
	{@const hash = contentHash(item.definition)}
	<article
		class="card"
		class:selected={selectedKey === item.key}
		data-testid="mini-build-card"
		data-name={item.definition.name}
		data-source={item.source}
	>
		<button
			type="button"
			class="card-main"
			data-testid="mini-build-place"
			onclick={() => place(item.selection)}
			title="Place {item.definition.name}"
		>
			<span class="thumb">
				{#if thumbnails[hash]}
					<img src={thumbnails[hash]} alt="" />
				{:else}
					<span class="thumb-placeholder">{item.definition.blocks.length}</span>
				{/if}
			</span>
			{#if renaming?.id === item.definition.id}
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="rename"
					data-testid="mini-build-rename-input"
					bind:value={renaming.value}
					autofocus
					onclick={(event) => event.stopPropagation()}
					onblur={() => commitRename(item)}
					onchange={() => commitRename(item)}
				/>
			{:else}
				<span class="name">{item.definition.name}</span>
			{/if}
			<span class="meta">
				{item.definition.blocks.length} blocks · {sizeLabel(item.definition)}
			</span>
			{#if item.source === 'world' && item.placed > 0}
				<span class="badge" data-testid="mini-build-placed-count">{item.placed} placed</span>
			{:else if item.source === 'personal'}
				<span class="badge subtle">My Builds</span>
			{/if}
		</button>
		<div class="card-actions">
			<button type="button" data-testid="mini-build-edit" onclick={() => edit(item)}>Edit</button>
			<button
				type="button"
				data-testid="mini-build-duplicate-design"
				onclick={() => duplicate(item)}>Duplicate</button
			>
			{#if item.source !== 'default'}
				<button type="button" data-testid="mini-build-rename" onclick={() => startRename(item)}
					>Rename</button
				>
				<button
					type="button"
					class="danger"
					data-testid="mini-build-delete-design"
					onclick={() => remove(item)}>Delete</button
				>
			{/if}
		</div>
	</article>
{/snippet}

<div
	class="backdrop"
	role="presentation"
	data-testid="object-library-modal"
	onclick={onBackdropClick}
>
	<div class="panel" role="dialog" aria-modal="true" aria-labelledby="object-library-title">
		<header>
			<div>
				<p class="eyebrow">PLACE OBJECT</p>
				<h2 id="object-library-title">Objects</h2>
			</div>
			<button type="button" data-testid="object-library-done" onclick={onClose}>Done</button>
		</header>

		<div class="toolbar">
			<input
				type="search"
				data-testid="object-library-search"
				placeholder="Search…"
				aria-label="Search objects"
				bind:value={query}
			/>
			<label class="sort">
				<span>Sort</span>
				<select
					data-testid="object-library-sort"
					value={sort}
					onchange={(event) => setSort(event.currentTarget.value as LibrarySort)}
				>
					<option value="recent">Recently Used</option>
					<option value="name">Name</option>
					<option value="created">Recently Created</option>
				</select>
			</label>
			<button
				type="button"
				class="create"
				data-testid="mini-build-create-new"
				onclick={() => onOpenEditor({ kind: 'new' })}>+ Create New</button
			>
		</div>
		{#if notice}
			<p class="notice" role="status" data-testid="object-library-notice">{notice}</p>
		{/if}

		<section>
			<h3>My Builds</h3>
			{#if myBuilds.length === 0}
				<p class="empty">
					{query
						? 'No builds match that search.'
						: 'Nothing here yet — create a build from up to 16 cuboids.'}
				</p>
			{:else}
				<div class="grid" data-testid="my-builds-grid">
					{#each myBuilds as item (item.key)}
						{@render card(item)}
					{/each}
				</div>
			{/if}
		</section>

		<section>
			<h3>Default Designs</h3>
			<p class="section-hint">Built with the same 16-cuboid rules. Edit one to make it your own.</p>
			<div class="grid" data-testid="default-designs-grid">
				{#each defaults as item (item.key)}
					{@render card(item)}
				{/each}
			</div>
		</section>

		{#if lights.length > 0}
			<section>
				<h3>Lights</h3>
				<div class="grid lights">
					{#each lights as light (light.kind)}
						<button
							type="button"
							class="light-card"
							class:selected={selectedKey === `light:${light.kind}`}
							data-testid="object-light-{light.kind}"
							onclick={() => place({ type: 'light', kind: light.kind })}
						>
							{light.name}
						</button>
					{/each}
				</div>
			</section>
		{/if}
	</div>
</div>

{#if dialog}
	<MiniBuildChoiceDialog
		title={dialog.title}
		lines={dialog.lines}
		options={dialog.options}
		onCancel={() => (dialog = null)}
	/>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 0.75rem;
		background: #07140dd9;
		backdrop-filter: blur(5px);
		box-sizing: border-box;
	}
	.panel {
		width: min(1100px, 96vw);
		max-height: min(92vh, calc(100dvh - 1.5rem));
		overflow-y: auto;
		background: #142a20;
		color: #e3f5e8;
		border: 1px solid #446553;
		border-radius: 18px;
		padding: 1.2rem 1.4rem 1.4rem;
		font:
			14px/1.5 system-ui,
			sans-serif;
		box-shadow: 0 20px 100px #0007;
		box-sizing: border-box;
		scrollbar-width: thin;
	}
	header {
		position: sticky;
		top: -1.2rem;
		z-index: 2;
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: #142a20;
		padding: 0.2rem 0 0.6rem;
		border-bottom: 1px solid #44655366;
	}
	h2 {
		margin: 0;
		font-size: 26px;
	}
	.eyebrow {
		margin: 0 0 0.3rem;
		font-size: 11px;
		letter-spacing: 0.18em;
		color: #a0d9b7;
	}
	h3 {
		margin: 1.1rem 0 0.5rem;
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #a0d9b7;
	}
	button,
	input,
	select {
		font: inherit;
		color: #f0fff3;
		border: 1px solid #52715d;
		border-radius: 7px;
		background: #203d2d;
		padding: 0.4rem 0.65rem;
	}
	button {
		cursor: pointer;
	}
	.toolbar {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 0.6rem;
		margin-top: 0.9rem;
		align-items: center;
	}
	.sort {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 12px;
		color: #c5e6d2;
	}
	.create {
		background: #2d6a4f;
		border-color: #7ec89a;
		font-weight: 600;
	}
	.notice {
		margin: 0.6rem 0 0;
		color: #ffd89b;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
		gap: 0.6rem;
	}
	.card {
		display: grid;
		border: 1px solid #446553;
		border-radius: 12px;
		background: #1a3326;
		overflow: hidden;
	}
	.card.selected {
		border-color: #7ec89a;
		box-shadow: 0 0 0 1px #7ec89a;
	}
	.card-main {
		display: grid;
		gap: 0.15rem;
		text-align: left;
		border: none;
		border-radius: 0;
		background: transparent;
		padding: 0.5rem 0.6rem 0.4rem;
	}
	.thumb {
		display: grid;
		place-items: center;
		aspect-ratio: 4 / 3;
		border-radius: 8px;
		background: #183426;
		overflow: hidden;
		margin-bottom: 0.3rem;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.thumb-placeholder {
		color: #6b8f7a;
		font-size: 20px;
	}
	.name {
		font-weight: 600;
	}
	.meta {
		font-size: 11px;
		color: #a0d9b7;
	}
	.badge {
		justify-self: start;
		font-size: 11px;
		padding: 0.05rem 0.4rem;
		border-radius: 999px;
		background: #2d5a40;
	}
	.badge.subtle {
		background: #203d2d;
		color: #a0d9b7;
	}
	.rename {
		padding: 0.2rem 0.35rem;
	}
	.card-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		padding: 0 0.5rem 0.5rem;
	}
	.card-actions button {
		font-size: 12px;
		padding: 0.2rem 0.45rem;
	}
	.card-actions .danger {
		border-color: #a4443f;
	}
	.lights {
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
	}
	.light-card.selected {
		border-color: #7ec89a;
		background: #2d5a40;
	}
	.empty,
	.section-hint {
		margin: 0 0 0.5rem;
		font-size: 12px;
		color: #a0d9b7;
	}
	@media (max-width: 600px) {
		.toolbar {
			grid-template-columns: 1fr;
		}
	}
</style>
