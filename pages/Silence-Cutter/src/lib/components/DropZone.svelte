<script lang="ts">
	import { onMount } from 'svelte';
	import { formatDuration } from '../core/stats';
	import { deleteProject, listProjects, type ProjectSummary } from '../state/persist';

	interface Props {
		onfile: (file: File, handle?: FileSystemFileHandle) => void;
		error: string | null;
	}
	let { onfile, error }: Props = $props();
	let over = $state(false);
	let recent = $state<ProjectSummary[]>([]);
	let input: HTMLInputElement;
	let localError = $state<string | null>(null);

	onMount(async () => {
		recent = await listProjects();
	});

	const ACCEPT = ['video/mp4', 'video/quicktime', 'video/x-m4v'];
	function accept(file: File | null | undefined, handle?: FileSystemFileHandle) {
		if (!file) return;
		if (!ACCEPT.includes(file.type) && !/\.(mp4|mov|m4v)$/i.test(file.name)) {
			localError = `"${file.name}" is not an MP4 or MOV file.`;
			return;
		}
		localError = null;
		onfile(file, handle);
	}

	async function ondrop(e: DragEvent) {
		e.preventDefault();
		over = false;
		const item = e.dataTransfer?.items?.[0];
		let handle: FileSystemFileHandle | undefined;
		const getHandle = (
			item as unknown as { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }
		)?.getAsFileSystemHandle;
		const file = e.dataTransfer?.files?.[0];
		if (getHandle) {
			try {
				const h = await getHandle.call(item);
				if (h?.kind === 'file') handle = h as FileSystemFileHandle;
			} catch {
				/* not supported */
			}
		}
		accept(file, handle);
	}

	async function pick() {
		const g = globalThis as unknown as {
			showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]>;
		};
		if (g.showOpenFilePicker) {
			try {
				const [handle] = await g.showOpenFilePicker({
					types: [
						{
							description: 'Video',
							accept: { 'video/mp4': ['.mp4', '.m4v'], 'video/quicktime': ['.mov'] }
						}
					]
				});
				accept(await handle.getFile(), handle);
				return;
			} catch (err) {
				if ((err as DOMException)?.name === 'AbortError') return;
			}
		}
		input.click();
	}

	async function reopen(p: ProjectSummary) {
		if (!p.handle) return;
		const h = p.handle as FileSystemFileHandle & {
			requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
		};
		try {
			if (h.requestPermission && (await h.requestPermission({ mode: 'read' })) !== 'granted')
				return;
			accept(await h.getFile(), h);
		} catch {
			localError = `Could not reopen "${p.name}". Drop the file again to continue where you left off.`;
		}
	}

	async function forget(p: ProjectSummary) {
		await deleteProject(p.id);
		recent = recent.filter((r) => r.id !== p.id);
	}
</script>

<div
	class="drop"
	class:over
	role="region"
	aria-label="Open a video"
	ondragover={(e) => {
		e.preventDefault();
		over = true;
	}}
	ondragleave={() => (over = false)}
	{ondrop}
>
	<div class="card">
		<h1>Drop an MP4 or MOV here</h1>
		<p class="sub">
			Spoken video — talks, interviews, podcasts, meetings. Silence is found from the audio level <em
				>and</em
			> a verbatim transcript, so every um, uh, repeat and false start is treated as speech.
		</p>
		<button class="primary big" onclick={pick} data-testid="open-file">Choose video…</button>
		<input
			bind:this={input}
			type="file"
			accept=".mp4,.mov,.m4v,video/mp4,video/quicktime"
			class="visually-hidden"
			data-testid="file-input"
			onchange={(e) => accept(e.currentTarget.files?.[0])}
		/>
		<p class="private">
			<span aria-hidden="true">🔒</span> Your video stays on this device. Nothing is uploaded.
		</p>
		{#if error || localError}<p class="error" role="alert" data-testid="open-error">
				{localError ?? error}
			</p>{/if}

		{#if recent.length}
			<div class="recent">
				<h2>Recent projects</h2>
				<ul>
					{#each recent.slice(0, 8) as p (p.id)}
						<li>
							<span class="rname" title={p.name}>{p.name}</span>
							<span class="meta"
								>{formatDuration(p.duration)} · {p.words.toLocaleString()} words · {p.edits} edits</span
							>
							{#if p.handle}<button class="small" onclick={() => reopen(p)}>Reopen</button>{/if}
							<button class="small ghost" onclick={() => forget(p)} aria-label="Forget {p.name}"
								>Forget</button
							>
						</li>
					{/each}
				</ul>
				<p class="hint">
					Projects are remembered in this browser only. Dropping the same file again restores its
					transcript and edits.
				</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.drop {
		flex: 1;
		display: grid;
		place-items: center;
		padding: 32px;
		transition: background 0.15s;
	}
	.drop.over {
		background: var(--accent-soft);
	}
	.card {
		width: min(640px, 100%);
		text-align: center;
		border: 2px dashed var(--border-strong);
		border-radius: 16px;
		padding: 40px 32px;
		background: var(--panel);
	}
	.over .card {
		border-color: var(--accent);
	}
	h1 {
		margin: 0 0 8px;
		font-size: 22px;
	}
	.sub {
		color: var(--text-dim);
		margin: 0 auto 20px;
		max-width: 48ch;
	}
	.big {
		font-size: 15px;
		padding: 10px 22px;
	}
	.private {
		color: var(--private);
		margin-top: 16px;
		font-size: 12px;
	}
	.error {
		color: var(--remove);
	}
	.recent {
		margin-top: 28px;
		text-align: left;
		border-top: 1px solid var(--border);
		padding-top: 14px;
	}
	h2 {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dim);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 0;
		font-size: 12px;
	}
	.rname {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		color: var(--text-faint);
	}
	.small {
		font-size: 11px;
		padding: 2px 8px;
	}
	.hint {
		font-size: 11px;
		color: var(--text-faint);
	}
</style>
