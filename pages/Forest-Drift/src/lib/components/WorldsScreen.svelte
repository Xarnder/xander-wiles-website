<script lang="ts">
	import { onDestroy } from 'svelte';
	import titleMark from '$lib/assets/forest-drift-title.svg';
	import { generateWorldSeed } from '$lib/game/world/seedGenerator';
	import type { WorldMetadata } from '$lib/game/world/WorldTypes';

	interface Props {
		worlds: WorldMetadata[];
		thumbnails: Record<string, string>;
		defaultWorld?: WorldMetadata | null;
		defaultThumbnail?: string;
		storage: { usage?: number; quota?: number };
		busy: boolean;
		error: string | null;
		onPlay: (worldId: string) => void;
		onPlayDefault?: () => void;
		onResetDefault?: () => void;
		onCreate: (name: string, seed: string) => void;
		onRename: (worldId: string, name: string) => void;
		onDuplicate: (worldId: string) => void;
		onExport: (worldId: string) => void;
		onDelete: (worldId: string) => void;
		onImport: (file: File) => void;
		onDismissError: () => void;
	}

	const {
		worlds,
		thumbnails,
		defaultWorld = null,
		defaultThumbnail = '',
		storage,
		busy,
		error,
		onPlay,
		onPlayDefault,
		onResetDefault,
		onCreate,
		onRename,
		onDuplicate,
		onExport,
		onDelete,
		onImport,
		onDismissError
	}: Props = $props();

	type Dialog =
		| { kind: 'none' }
		| { kind: 'create'; name: string; seed: string }
		| { kind: 'rename'; worldId: string; name: string }
		| { kind: 'delete'; worldId: string; name: string }
		| { kind: 'reset-default' };

	let dialog = $state<Dialog>({ kind: 'none' });
	let openMenuId = $state<string | null>(null);
	let dragActive = $state(false);
	let fileInput = $state<HTMLInputElement | undefined>(undefined);

	function openCreateDialog() {
		openMenuId = null;
		dialog = { kind: 'create', name: '', seed: generateWorldSeed() };
	}

	function submitCreate(event: SubmitEvent) {
		event.preventDefault();
		if (dialog.kind !== 'create') return;
		const { name, seed } = dialog;
		dialog = { kind: 'none' };
		onCreate(name.trim() || 'New World', seed.trim());
	}

	function submitRename(event: SubmitEvent) {
		event.preventDefault();
		if (dialog.kind !== 'rename') return;
		const trimmed = dialog.name.trim();
		if (trimmed.length === 0) return;
		const worldId = dialog.worldId;
		dialog = { kind: 'none' };
		onRename(worldId, trimmed);
	}

	function confirmDelete() {
		if (dialog.kind !== 'delete') return;
		const worldId = dialog.worldId;
		dialog = { kind: 'none' };
		onDelete(worldId);
	}

	function handleFiles(files: FileList | null) {
		const file = files?.[0];
		if (file) onImport(file);
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
		handleFiles(event.dataTransfer?.files ?? null);
	}

	/** Closes an open row menu when the click lands anywhere else — Svelte's own handlers can't see clicks on other rows, so this listens at the document level while a menu is open. */
	$effect(() => {
		if (openMenuId === null) return;
		const close = () => (openMenuId = null);
		// Deferred so the click that opened the menu doesn't immediately close it.
		const id = setTimeout(() => document.addEventListener('click', close), 0);
		return () => {
			clearTimeout(id);
			document.removeEventListener('click', close);
		};
	});

	onDestroy(() => {
		openMenuId = null;
	});

	function relativeTime(iso: string): string {
		const then = new Date(iso).getTime();
		if (!Number.isFinite(then)) return 'unknown';
		const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
		if (seconds < 60) return 'just now';
		const minutes = Math.round(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.round(hours / 24);
		if (days === 1) return 'yesterday';
		if (days < 30) return `${days}d ago`;
		return new Date(iso).toLocaleDateString();
	}

	function formatBytes(bytes: number | undefined): string {
		if (bytes === undefined || !Number.isFinite(bytes)) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<div
	class="worlds-screen"
	data-testid="worlds-screen"
	class:drag-active={dragActive}
	aria-busy={busy}
	role="presentation"
	ondragover={(event) => {
		event.preventDefault();
		dragActive = true;
	}}
	ondragleave={() => (dragActive = false)}
	ondrop={handleDrop}
>
	<header class="worlds-header">
		<img class="title-mark" src={titleMark} alt="Forest Drift" width="614" height="350" />
		<div class="worlds-actions">
			<button
				class="primary"
				data-testid="new-world-button"
				onclick={openCreateDialog}
				disabled={busy}
			>
				+ New World
			</button>
			<button data-testid="import-world-button" onclick={() => fileInput?.click()} disabled={busy}>
				Import World
			</button>
			<input
				bind:this={fileInput}
				class="file-input"
				type="file"
				accept=".forestworld,application/zip"
				data-testid="import-world-input"
				onchange={(event) => {
					handleFiles(event.currentTarget.files);
					event.currentTarget.value = '';
				}}
			/>
		</div>
	</header>

	{#if busy}
		<div class="worlds-busy" data-testid="worlds-busy">Working…</div>
	{/if}

	{#if error}
		<div class="worlds-error" data-testid="worlds-error" role="alert">
			<span>{error}</span>
			<button class="link" onclick={onDismissError}>Dismiss</button>
		</div>
	{/if}

	<section class="default-world-section" data-testid="default-world-section">
		<div class="section-header">
			<h2 class="section-title">Default World</h2>
			<span class="badge">Featured</span>
		</div>

		<div class="default-world-card" data-testid="default-world-card">
			<div class="thumbnail default-thumbnail">
				{#if defaultThumbnail || (defaultWorld && thumbnails[defaultWorld.id])}
					<img
						src={defaultThumbnail || (defaultWorld ? thumbnails[defaultWorld.id] : '')}
						alt="Main World Preview"
						width="320"
						height="180"
					/>
				{:else}
					<div class="thumbnail-placeholder" aria-hidden="true"></div>
				{/if}
			</div>

			<div class="world-info">
				<div class="world-name-row">
					<div class="world-name" data-testid="default-world-name">{defaultWorld?.name ?? 'Main World'}</div>
					<span class="pill-tag">Always Available</span>
				</div>
				<p class="world-desc">
					Explore a crafted forest outpost featuring multi-tier buildings, stairs, roofs, and scenic woods.
				</p>
				<div class="world-meta subtle">
					Seed <code>{defaultWorld?.seed ?? 'soft-lowlands-431'}</code>
					{#if defaultWorld?.updatedAt}
						&middot; Updated {relativeTime(defaultWorld.updatedAt)}
					{/if}
				</div>
			</div>

			<div class="world-buttons">
				<button
					class="primary play-btn"
					data-testid="play-default-world"
					onclick={() => {
						if (onPlayDefault) {
							onPlayDefault();
						} else if (defaultWorld) {
							onPlay(defaultWorld.id);
						}
					}}
					disabled={busy}
				>
					<span class="play-icon" aria-hidden="true">▶</span> Play
				</button>
				<div class="menu-anchor">
					<button
						class="icon"
						data-testid="default-world-menu-button"
						aria-label="More actions for Default World"
						aria-expanded={openMenuId === 'default-world'}
						onclick={(event) => {
							event.stopPropagation();
							openMenuId = openMenuId === 'default-world' ? null : 'default-world';
						}}
					>
						&hellip;
					</button>
					{#if openMenuId === 'default-world'}
						<div class="menu" data-testid="default-world-menu" role="menu">
							<button
								role="menuitem"
								onclick={() => {
									if (onPlayDefault) {
										onPlayDefault();
									} else if (defaultWorld) {
										onPlay(defaultWorld.id);
									}
								}}
							>
								Play
							</button>
							{#if defaultWorld}
								<button
									role="menuitem"
									data-testid="default-world-menu-duplicate"
									onclick={() => onDuplicate(defaultWorld.id)}
								>
									Duplicate to My Worlds
								</button>
								<button
									role="menuitem"
									data-testid="default-world-menu-export"
									onclick={() => onExport(defaultWorld.id)}
								>
									Export
								</button>
							{/if}
							{#if onResetDefault}
								<button
									role="menuitem"
									class="danger"
									data-testid="default-world-menu-reset"
									onclick={() => (dialog = { kind: 'reset-default' })}
								>
									Reset to Original
								</button>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</section>

	<div class="section-divider" aria-hidden="true"></div>

	<h2 class="section-title">My Worlds</h2>

	{#if worlds.length === 0}
		<div class="empty-state" data-testid="worlds-empty">
			<p class="empty-title">No worlds yet</p>
			<p class="empty-body">Create a world to start exploring and building.</p>
		</div>
	{:else}
		<ul class="world-list" data-testid="world-list">
			{#each worlds as world (world.id)}
				<li class="world-card" data-testid="world-card" data-world-id={world.id}>
					<div class="thumbnail">
						{#if thumbnails[world.id]}
							<img src={thumbnails[world.id]} alt="" width="320" height="180" />
						{:else}
							<div class="thumbnail-placeholder" aria-hidden="true"></div>
						{/if}
					</div>

					<div class="world-info">
						<div class="world-name" data-testid="world-name">{world.name}</div>
						<div class="world-meta">
							Updated {relativeTime(world.updatedAt)}
							{#if world.byteSize}&middot; {formatBytes(world.byteSize)}{/if}
						</div>
						<div class="world-meta subtle">
							Created {new Date(world.createdAt).toLocaleDateString()} &middot; seed
							<code>{world.seed}</code>
						</div>
					</div>

					<div class="world-buttons">
						<button
							class="primary"
							data-testid="play-world"
							onclick={() => onPlay(world.id)}
							disabled={busy}
						>
							Play
						</button>
						<div class="menu-anchor">
							<button
								class="icon"
								data-testid="world-menu-button"
								aria-label={`More actions for ${world.name}`}
								aria-expanded={openMenuId === world.id}
								onclick={(event) => {
									event.stopPropagation();
									openMenuId = openMenuId === world.id ? null : world.id;
								}}
							>
								&hellip;
							</button>
							{#if openMenuId === world.id}
								<div class="menu" data-testid="world-menu" role="menu">
									<button role="menuitem" onclick={() => onPlay(world.id)}>Play</button>
									<button
										role="menuitem"
										data-testid="world-menu-rename"
										onclick={() =>
											(dialog = { kind: 'rename', worldId: world.id, name: world.name })}
									>
										Rename
									</button>
									<button
										role="menuitem"
										data-testid="world-menu-duplicate"
										onclick={() => onDuplicate(world.id)}
									>
										Duplicate
									</button>
									<button
										role="menuitem"
										data-testid="world-menu-export"
										onclick={() => onExport(world.id)}
									>
										Export
									</button>
									<button
										role="menuitem"
										class="danger"
										data-testid="world-menu-delete"
										onclick={() =>
											(dialog = { kind: 'delete', worldId: world.id, name: world.name })}
									>
										Delete
									</button>
								</div>
							{/if}
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if storage.usage !== undefined}
		<p class="storage-note" data-testid="storage-note">
			Storage used: {formatBytes(storage.usage)}{#if storage.quota}
				of {formatBytes(storage.quota)}{/if}
		</p>
	{/if}

	{#if dialog.kind === 'create'}
		<div class="modal-backdrop" role="presentation">
			<form class="modal" data-testid="create-world-dialog" onsubmit={submitCreate}>
				<h3>New World</h3>
				<label>
					World Name
					<!-- svelte-ignore a11y_autofocus -->
					<input
						data-testid="create-world-name"
						autofocus
						bind:value={dialog.name}
						placeholder="New World"
						maxlength="80"
					/>
				</label>
				<label>
					Seed
					<span class="seed-row">
						<input data-testid="create-world-seed" bind:value={dialog.seed} maxlength="80" />
						<button
							type="button"
							class="link"
							onclick={() => {
								if (dialog.kind === 'create') dialog.seed = generateWorldSeed();
							}}
						>
							Randomize
						</button>
					</span>
				</label>
				<p class="modal-hint">
					The seed decides the terrain and forests. The same seed always makes the same world.
				</p>
				<div class="modal-buttons">
					<button type="button" onclick={() => (dialog = { kind: 'none' })}>Cancel</button>
					<button type="submit" class="primary" data-testid="create-world-confirm"
						>Create World</button
					>
				</div>
			</form>
		</div>
	{:else if dialog.kind === 'rename'}
		<div class="modal-backdrop" role="presentation">
			<form class="modal" data-testid="rename-world-dialog" onsubmit={submitRename}>
				<h3>Rename World</h3>
				<label>
					World Name
					<!-- svelte-ignore a11y_autofocus -->
					<input
						data-testid="rename-world-name"
						autofocus
						bind:value={dialog.name}
						maxlength="80"
					/>
				</label>
				<div class="modal-buttons">
					<button type="button" onclick={() => (dialog = { kind: 'none' })}>Cancel</button>
					<button
						type="submit"
						class="primary"
						data-testid="rename-world-confirm"
						disabled={dialog.name.trim().length === 0}
					>
						Rename
					</button>
				</div>
			</form>
		</div>
	{:else if dialog.kind === 'delete'}
		<div class="modal-backdrop" role="presentation">
			<div class="modal" data-testid="delete-world-dialog">
				<h3>Delete &ldquo;{dialog.name}&rdquo;?</h3>
				<p class="modal-hint">
					This will permanently remove the locally saved world from this browser. This cannot be
					undone.
				</p>
				<div class="modal-buttons">
					<button
						type="button"
						class="link"
						data-testid="delete-world-export"
						onclick={() => {
							if (dialog.kind === 'delete') onExport(dialog.worldId);
						}}
					>
						Export Backup
					</button>
					<span class="modal-spacer"></span>
					<button type="button" onclick={() => (dialog = { kind: 'none' })}>Cancel</button>
					<button
						type="button"
						class="danger"
						data-testid="delete-world-confirm"
						onclick={confirmDelete}
					>
						Delete World
					</button>
				</div>
			</div>
		</div>
	{:else if dialog.kind === 'reset-default'}
		<div class="modal-backdrop" role="presentation">
			<div class="modal" data-testid="reset-default-dialog">
				<h3>Reset &ldquo;Main World&rdquo; to Original?</h3>
				<p class="modal-hint">
					This will revert any buildings and changes made in Main World back to the pristine default
					state. This cannot be undone.
				</p>
				<div class="modal-buttons">
					<button type="button" onclick={() => (dialog = { kind: 'none' })}>Cancel</button>
					<button
						type="button"
						class="danger"
						data-testid="reset-default-confirm"
						onclick={() => {
							dialog = { kind: 'none' };
							onResetDefault?.();
						}}
					>
						Reset to Original
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.worlds-screen {
		position: fixed;
		inset: 0;
		overflow-y: auto;
		padding: 2rem 1.5rem 3rem;
		background: radial-gradient(circle at 50% 0%, #2c4b39 0%, #16241d 60%, #0d1512 100%);
		color: #eaf6ff;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
	}

	.worlds-screen.drag-active {
		outline: 2px dashed rgba(159, 232, 255, 0.7);
		outline-offset: -12px;
	}

	.worlds-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.title-mark {
		width: min(18rem, 60vw);
		height: auto;
		filter: drop-shadow(0 4px 16px rgba(0, 0, 0, 0.55));
	}

	.worlds-actions {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.file-input {
		display: none;
	}

	button {
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

	button:hover:not(:disabled) {
		background: rgba(30, 55, 42, 0.85);
		border-color: rgba(159, 232, 255, 0.55);
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	button.primary {
		background: rgba(57, 211, 83, 0.85);
		border-color: rgba(57, 211, 83, 0.9);
		color: #04121f;
	}

	button.primary:hover:not(:disabled) {
		background: rgba(87, 226, 111, 0.95);
	}

	button.danger {
		color: #ffb4b4;
		border-color: rgba(255, 122, 122, 0.5);
	}

	button.link {
		background: none;
		border: none;
		color: #9fe8ff;
		text-decoration: underline;
		padding: 0.35rem 0.2rem;
	}

	.section-title {
		max-width: 46rem;
		margin: 0 auto 0.75rem;
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.7;
	}

	.default-world-section {
		max-width: 46rem;
		margin: 0 auto;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.75rem;
	}

	.section-header .section-title {
		margin: 0;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		background: rgba(57, 211, 83, 0.18);
		border: 1px solid rgba(57, 211, 83, 0.45);
		color: #89f5a3;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.default-world-card {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		padding: 1rem;
		border-radius: 14px;
		background: linear-gradient(135deg, rgba(17, 38, 28, 0.75) 0%, rgba(10, 24, 18, 0.65) 100%);
		border: 1px solid rgba(57, 211, 83, 0.35);
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4), 0 0 20px rgba(57, 211, 83, 0.08);
		transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
	}

	.default-world-card:hover {
		border-color: rgba(87, 226, 111, 0.65);
		box-shadow: 0 10px 36px rgba(0, 0, 0, 0.5), 0 0 26px rgba(57, 211, 83, 0.18);
		transform: translateY(-1px);
	}

	.default-thumbnail {
		width: 140px;
		height: 80px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
	}

	.world-name-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.pill-tag {
		font-size: 0.68rem;
		font-weight: 600;
		padding: 0.1rem 0.45rem;
		border-radius: 4px;
		background: rgba(159, 232, 255, 0.12);
		border: 1px solid rgba(159, 232, 255, 0.25);
		color: #9fe8ff;
	}

	.world-desc {
		margin: 0.25rem 0 0.35rem;
		font-size: 0.8rem;
		line-height: 1.35;
		color: rgba(234, 246, 255, 0.75);
	}

	.play-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.6rem 1.2rem;
		font-size: 0.9rem;
		box-shadow: 0 4px 14px rgba(57, 211, 83, 0.3);
	}

	.play-icon {
		font-size: 0.75rem;
	}

	.section-divider {
		max-width: 46rem;
		height: 1px;
		margin: 2rem auto;
		background: linear-gradient(90deg, transparent, rgba(234, 246, 255, 0.12), transparent);
	}

	.worlds-busy {
		max-width: 46rem;
		margin: 0 auto 1rem;
		padding: 0.5rem 0.9rem;
		border-radius: 8px;
		background: rgba(12, 28, 20, 0.8);
		border: 1px solid rgba(159, 224, 184, 0.35);
		color: #cfe8d8;
		font-size: 0.82rem;
		text-align: center;
	}

	.worlds-error {
		max-width: 46rem;
		margin: 0 auto 1rem;
		padding: 0.6rem 0.9rem;
		border-radius: 8px;
		background: rgba(90, 20, 20, 0.75);
		border: 1px solid rgba(255, 122, 122, 0.55);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		font-size: 0.85rem;
	}

	.world-list {
		list-style: none;
		max-width: 46rem;
		margin: 0 auto;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.world-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem;
		border-radius: 12px;
		background: rgba(10, 20, 15, 0.55);
		border: 1px solid rgba(234, 246, 255, 0.12);
	}

	.thumbnail {
		flex: 0 0 auto;
		width: 128px;
		height: 72px;
		border-radius: 8px;
		overflow: hidden;
		background: rgba(0, 0, 0, 0.35);
	}

	.thumbnail img,
	.thumbnail-placeholder {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.thumbnail-placeholder {
		background: linear-gradient(160deg, #35543f, #1c2c24);
	}

	.world-info {
		flex: 1 1 auto;
		min-width: 0;
	}

	.world-name {
		font-size: 1rem;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.world-meta {
		font-size: 0.78rem;
		opacity: 0.8;
		margin-top: 0.15rem;
	}

	.world-meta.subtle {
		opacity: 0.55;
	}

	.world-meta code {
		font-size: 0.75rem;
	}

	.world-buttons {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.menu-anchor {
		position: relative;
	}

	button.icon {
		padding: 0.35rem 0.6rem;
		line-height: 1;
	}

	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 0.35rem);
		z-index: 5;
		display: flex;
		flex-direction: column;
		min-width: 10rem;
		padding: 0.25rem;
		border-radius: 10px;
		background: rgba(12, 24, 19, 0.97);
		border: 1px solid rgba(234, 246, 255, 0.18);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
	}

	.menu button {
		border: none;
		background: none;
		text-align: left;
		font-weight: 500;
	}

	.empty-state {
		max-width: 46rem;
		margin: 0 auto;
		padding: 3rem 1rem;
		text-align: center;
		border-radius: 12px;
		border: 1px dashed rgba(234, 246, 255, 0.2);
	}

	.empty-title {
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0 0 0.35rem;
	}

	.empty-body {
		margin: 0;
		opacity: 0.75;
		font-size: 0.9rem;
	}

	.storage-note {
		max-width: 46rem;
		margin: 1.5rem auto 0;
		font-size: 0.75rem;
		opacity: 0.55;
		text-align: right;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgba(4, 10, 8, 0.72);
		backdrop-filter: blur(3px);
		z-index: 20;
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

	.modal h3 {
		margin: 0;
		font-size: 1.05rem;
	}

	.modal label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
		font-weight: 600;
		opacity: 0.85;
	}

	.modal input {
		padding: 0.5rem 0.6rem;
		border-radius: 8px;
		border: 1px solid rgba(234, 246, 255, 0.25);
		background: rgba(0, 0, 0, 0.35);
		color: #eaf6ff;
		font-family: inherit;
		font-size: 0.9rem;
		font-weight: 400;
	}

	.seed-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.seed-row input {
		flex: 1 1 auto;
		min-width: 0;
	}

	.modal-hint {
		margin: 0;
		font-size: 0.78rem;
		opacity: 0.7;
		line-height: 1.4;
	}

	.modal-buttons {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.modal-spacer {
		flex: 1 1 auto;
	}
</style>
