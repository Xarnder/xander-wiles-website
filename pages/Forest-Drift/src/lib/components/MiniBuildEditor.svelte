<script module lang="ts">
	import type { MiniBuildDefinition as LaunchDefinition } from '$lib/game/miniBuild/MiniBuildTypes';

	export type MiniBuildEditorLaunch =
		| { kind: 'new' }
		| { kind: 'edit'; designId: string }
		| { kind: 'template'; definition: LaunchDefinition };
</script>

<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { onDestroy, onMount } from 'svelte';
	import {
		MiniBuildEditorState,
		type EditorResult
	} from '$lib/game/miniBuild/MiniBuildEditorState';
	import { MiniBuildEditorViewport } from '$lib/game/miniBuild/MiniBuildEditorViewport';
	import {
		blockBox,
		effectiveSize,
		flatAxis,
		gridToMeters,
		isPlaneBlock,
		type Axis
	} from '$lib/game/miniBuild/miniBuildGrid';
	import {
		MINI_BUILD_FINISHES,
		MINI_BUILD_FINISH_LABELS,
		MINI_BUILD_LIMITS,
		MINI_BUILD_SEMANTIC_TYPES,
		type MiniBuildBlockCollision,
		type MiniBuildDefinition,
		type MiniBuildFinish,
		type MiniBuildSemanticType
	} from '$lib/game/miniBuild/MiniBuildTypes';
	import type { ThreeScene } from '$lib/game/ThreeScene';

	let {
		scene,
		launch,
		onClose,
		onSaved
	}: {
		scene: ThreeScene;
		launch: MiniBuildEditorLaunch;
		onClose: () => void;
		/** Called after a Save / Save As that should return to the world with this design selected. */
		onSaved: (definition: MiniBuildDefinition) => void;
	} = $props();

	const system = $derived(scene.miniBuilds);

	function createState(): MiniBuildEditorState {
		if (launch.kind === 'edit') {
			const definition = system.getDesign(launch.designId);
			if (definition) return MiniBuildEditorState.fromDefinition(definition);
		}
		if (launch.kind === 'template')
			return MiniBuildEditorState.fromDefinition(launch.definition, { asTemplate: true });
		return MiniBuildEditorState.createNew();
	}

	const editor = createState();
	let version = $state(editor.version);
	let message = $state<{ text: string; tone: 'error' | 'info' } | null>(null);
	let namePrompt = $state<{ mode: 'save' | 'save-as'; value: string } | null>(null);
	let confirmDiscard = $state(false);
	let saving = $state(false);
	let showHelp = $state(false);
	let viewport: MiniBuildEditorViewport | null = null;
	let messageTimer: ReturnType<typeof setTimeout> | undefined;

	const blocks = $derived.by(() => {
		void version;
		return [...editor.getBlocks()];
	});
	const materials = $derived.by(() => {
		void version;
		return [...editor.getMaterials()];
	});
	const selected = $derived.by(() => {
		void version;
		return editor.selectedBlock;
	});
	const sizeMeters = $derived.by(() => {
		void version;
		return editor.getSizeMeters();
	});
	const designName = $derived.by(() => {
		void version;
		return editor.name;
	});
	const semanticType = $derived.by(() => {
		void version;
		return editor.semanticType ?? 'generic';
	});
	const placedCopies = $derived.by(() => {
		void version;
		return editor.sourceDesignId ? system.placedCount(editor.sourceDesignId) : 0;
	});
	const canUndo = $derived.by(() => {
		void version;
		return editor.canUndo;
	});
	const canRedo = $derived.by(() => {
		void version;
		return editor.canRedo;
	});
	const selectedBox = $derived(selected ? blockBox(selected) : null);
	const selectedSize = $derived(selected ? effectiveSize(selected) : null);

	function refresh() {
		version = editor.version;
		viewport?.sync();
	}

	function flash(text: string, tone: 'error' | 'info' = 'error') {
		message = { text, tone };
		clearTimeout(messageTimer);
		messageTimer = setTimeout(() => (message = null), 2600);
	}

	function run(result: EditorResult | boolean) {
		if (typeof result === 'object' && !result.ok) flash(result.error);
		refresh();
	}

	const attachViewport: Attachment<HTMLCanvasElement> = (canvas) => {
		viewport = new MiniBuildEditorViewport(canvas, {
			getState: () => editor,
			onSelect: (id) => {
				editor.selectBlock(id);
				refresh();
			},
			onCommitTransform: (id, position, size) => {
				const result = editor.setBlockGrid(id, position, size);
				run(result);
				return result;
			},
			onInvalidPreview: (text) => flash(text)
		});
		return () => {
			viewport?.dispose();
			viewport = null;
		};
	};

	function meters(value: number): string {
		return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
	}

	/**
	 * Numeric fields: the value is snapped (or rejected) by the editor state, then written back into
	 * the field explicitly — if the stored value didn't change (0.44 → 0.5 when it was already 0.5, or
	 * a rejected out-of-bounds move) Svelte has nothing to re-render, and the typed text would linger.
	 */
	function onPositionInput(axis: Axis, input: HTMLInputElement) {
		const value = Number(input.value);
		if (Number.isFinite(value)) run(editor.setPositionMeters(axis, value));
		const block = editor.selectedBlock;
		if (block) input.value = meters(gridToMeters(blockBox(block).min[axis]));
	}

	function onSizeInput(axis: Axis, input: HTMLInputElement) {
		const value = Number(input.value);
		if (Number.isFinite(value)) run(editor.setSizeMeters(axis, value));
		const block = editor.selectedBlock;
		if (block) input.value = meters(gridToMeters(effectiveSize(block)[axis]));
	}

	function isUntitled(name: string): boolean {
		return !name.trim() || /^untitled build( \d+)?$/i.test(name.trim());
	}

	async function persistExtras(definition: MiniBuildDefinition) {
		// Personal library + thumbnail are conveniences: failures must never undo a successful save.
		try {
			await scene.miniBuildPersonalLibrary.upsert(definition);
			await scene.miniBuildThumbnails.refresh(definition);
		} catch (error) {
			console.warn('[mini-builds] optional save step failed', error);
		}
	}

	async function save(options: { mode: 'save' | 'save-as'; stay?: boolean; name?: string }) {
		if (saving) return;
		const valid = editor.validateForSave();
		if (!valid.ok) {
			flash(valid.error);
			return;
		}
		const saveAs = options.mode === 'save-as' || !editor.sourceDesignId;
		if (
			saveAs &&
			options.name === undefined &&
			(options.mode === 'save-as' || isUntitled(editor.name))
		) {
			namePrompt = { mode: options.mode, value: isUntitled(editor.name) ? '' : editor.name };
			return;
		}
		if (options.name !== undefined) editor.setName(options.name);
		saving = true;
		try {
			const draft = editor.toDraft();
			const result = saveAs
				? system.createDesign(draft)
				: system.saveDesign(editor.sourceDesignId!, draft);
			if (!result.ok) {
				flash(result.error);
				return;
			}
			editor.markSaved(result.value.id, result.value.revision);
			refresh();
			void persistExtras(result.value);
			if (options.stay) {
				flash(`Saved ${result.value.name}`, 'info');
			} else {
				onSaved(result.value);
			}
		} finally {
			saving = false;
		}
	}

	function cancel() {
		if (editor.isDirty && editor.blockCount > 0) {
			confirmDiscard = true;
			return;
		}
		onClose();
	}

	function submitName(event: SubmitEvent) {
		event.preventDefault();
		if (!namePrompt) return;
		const name = namePrompt.value.trim();
		if (!name) {
			flash('Give your build a name.');
			return;
		}
		const mode = namePrompt.mode;
		namePrompt = null;
		void save({ mode, name });
	}

	function isTyping(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		return (
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement ||
			target.isContentEditable
		);
	}

	/**
	 * Capture-phase handler on window: while the editor is open, no key reaches the world (build
	 * tools, undo, pause). Default actions such as typing into inputs still happen.
	 */
	function onKeyDown(event: KeyboardEvent) {
		event.stopPropagation();
		const mod = event.metaKey || event.ctrlKey;
		if (namePrompt || confirmDiscard) {
			if (event.code === 'Escape') {
				namePrompt = null;
				confirmDiscard = false;
			}
			return;
		}
		if (mod && event.code === 'KeyS') {
			event.preventDefault();
			void save({ mode: 'save', stay: true });
			return;
		}
		if (mod && event.code === 'KeyZ') {
			event.preventDefault();
			run(event.shiftKey ? editor.redo() : editor.undo());
			return;
		}
		if (mod && event.code === 'KeyY') {
			event.preventDefault();
			run(editor.redo());
			return;
		}
		if (isTyping(event.target)) {
			if (event.code === 'Escape') (event.target as HTMLElement).blur();
			return;
		}
		if (mod && event.code === 'KeyD') {
			event.preventDefault();
			run(editor.duplicateSelected());
			return;
		}
		if (mod || (event.altKey && event.code !== 'KeyR')) return;
		const step = event.shiftKey;
		switch (event.code) {
			case 'Escape':
				cancel();
				break;
			case 'KeyN':
				run(editor.addBlock());
				break;
			case 'Delete':
			case 'Backspace':
				event.preventDefault();
				run(editor.deleteSelected());
				break;
			case 'ArrowLeft':
				event.preventDefault();
				run(step ? editor.resizeSelected('x', -1) : editor.moveSelected({ x: -1 }));
				break;
			case 'ArrowRight':
				event.preventDefault();
				run(step ? editor.resizeSelected('x', 1) : editor.moveSelected({ x: 1 }));
				break;
			case 'ArrowUp':
				event.preventDefault();
				run(step ? editor.resizeSelected('z', -1) : editor.moveSelected({ z: -1 }));
				break;
			case 'ArrowDown':
				event.preventDefault();
				run(step ? editor.resizeSelected('z', 1) : editor.moveSelected({ z: 1 }));
				break;
			case 'KeyE':
			case 'PageUp':
				event.preventDefault();
				run(step ? editor.resizeSelected('y', 1) : editor.moveSelected({ y: 1 }));
				break;
			case 'KeyQ':
			case 'PageDown':
				event.preventDefault();
				run(step ? editor.resizeSelected('y', -1) : editor.moveSelected({ y: -1 }));
				break;
			case 'KeyR':
				run(editor.rotateSelected(event.altKey ? 'z' : event.shiftKey ? 'x' : 'y'));
				break;
			case 'KeyM':
				run(editor.mirrorDuplicateX());
				break;
			case 'KeyF':
				viewport?.frameDesign();
				break;
			case 'Tab':
				event.preventDefault();
				editor.selectNext(event.shiftKey ? -1 : 1);
				refresh();
				break;
			case 'Digit1':
			case 'Digit2':
			case 'Digit3':
			case 'Digit4':
				run(editor.setBlockMaterial(Number(event.code.slice(5)) - 1));
				break;
			case 'Slash':
				showHelp = !showHelp;
				break;
		}
	}

	onMount(() => {
		scene.setMiniBuildOverlay({ editorOpen: true });
		window.addEventListener('keydown', onKeyDown, true);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', onKeyDown, true);
		clearTimeout(messageTimer);
		scene.setMiniBuildOverlay({ editorOpen: false });
	});

	const AXIS_LIST: Axis[] = ['x', 'y', 'z'];
</script>

<div
	class="editor"
	data-testid="mini-build-editor"
	role="dialog"
	aria-modal="true"
	aria-label="Mini Build Editor"
>
	<header>
		<div class="title">
			<p class="eyebrow">MINI BUILD EDITOR</p>
			<input
				class="name"
				data-testid="mini-build-name"
				aria-label="Design name"
				maxlength={MINI_BUILD_LIMITS.maxNameLength}
				value={designName}
				oninput={(event) => {
					editor.setName(event.currentTarget.value);
					version = editor.version;
				}}
			/>
		</div>
		<dl class="stats">
			<div class:limit={blocks.length >= MINI_BUILD_LIMITS.maxBlocks}>
				<dt>Blocks</dt>
				<dd data-testid="mini-build-block-count">
					{blocks.length} / {MINI_BUILD_LIMITS.maxBlocks}
				</dd>
			</div>
			<div>
				<dt>Size</dt>
				<dd data-testid="mini-build-size">
					{sizeMeters.x.toFixed(2)} × {sizeMeters.z.toFixed(2)} × {sizeMeters.y.toFixed(2)}m
				</dd>
			</div>
			<div>
				<dt>Materials</dt>
				<dd data-testid="mini-build-material-count">
					{materials.length} / {MINI_BUILD_LIMITS.maxMaterialSlots}
				</dd>
			</div>
		</dl>
		<div class="actions">
			<button
				type="button"
				data-testid="mini-build-undo"
				disabled={!canUndo}
				onclick={() => run(editor.undo())}
				title="Undo (Ctrl/Cmd+Z)">Undo</button
			>
			<button
				type="button"
				data-testid="mini-build-redo"
				disabled={!canRedo}
				onclick={() => run(editor.redo())}
				title="Redo (Ctrl/Cmd+Shift+Z)">Redo</button
			>
			<button type="button" data-testid="mini-build-cancel" onclick={cancel}>Cancel</button>
			<button
				type="button"
				data-testid="mini-build-save-as"
				onclick={() => save({ mode: 'save-as' })}
				disabled={saving}>Save As</button
			>
			<button
				type="button"
				class="primary"
				data-testid="mini-build-save"
				onclick={() => save({ mode: 'save' })}
				disabled={saving}>Save</button
			>
		</div>
	</header>

	{#if placedCopies > 0}
		<p class="shared-banner" data-testid="mini-build-shared-banner">
			Editing a shared design — saving updates all {placedCopies} placed {placedCopies === 1
				? 'copy'
				: 'copies'}.
		</p>
	{/if}

	<div class="body">
		<aside class="toolbar" aria-label="Build tools">
			<button
				type="button"
				data-testid="mini-build-add"
				disabled={blocks.length >= MINI_BUILD_LIMITS.maxBlocks}
				onclick={() => run(editor.addBlock())}
			>
				{blocks.length >= MINI_BUILD_LIMITS.maxBlocks
					? `${MINI_BUILD_LIMITS.maxBlocks} / ${MINI_BUILD_LIMITS.maxBlocks}`
					: '+ Add Cuboid'}
			</button>
			<button
				type="button"
				data-testid="mini-build-duplicate"
				disabled={!selected}
				onclick={() => run(editor.duplicateSelected())}>Duplicate Block</button
			>
			<button
				type="button"
				data-testid="mini-build-mirror"
				disabled={!selected}
				onclick={() => run(editor.mirrorDuplicateX())}>Duplicate + Mirror X</button
			>
			<div class="rotate-row">
				<button
					type="button"
					data-testid="mini-build-rotate-y"
					disabled={!selected}
					onclick={() => run(editor.rotateSelected('y'))}
					title="Rotate 90° around Y (R)">↻ Y</button
				>
				<button
					type="button"
					data-testid="mini-build-rotate-x"
					disabled={!selected}
					onclick={() => run(editor.rotateSelected('x'))}
					title="Rotate 90° around X (Shift+R)">↻ X</button
				>
				<button
					type="button"
					data-testid="mini-build-rotate-z"
					disabled={!selected}
					onclick={() => run(editor.rotateSelected('z'))}
					title="Rotate 90° around Z (Alt+R)">↻ Z</button
				>
			</div>
			<button
				type="button"
				class="danger"
				data-testid="mini-build-delete"
				disabled={!selected}
				onclick={() => run(editor.deleteSelected())}>Delete Block</button
			>

			<p class="section-label">Blocks</p>
			<ol class="block-list">
				{#each blocks as block, index (block.id)}
					{@const slot = materials[block.materialSlot]}
					<li>
						<button
							type="button"
							data-testid="mini-build-block-{index}"
							aria-pressed={selected?.id === block.id}
							onclick={() => {
								editor.selectBlock(block.id);
								refresh();
							}}
						>
							<span class="swatch" style:background={slot?.material.color}></span>
							{isPlaneBlock(block) ? 'Plane' : 'Block'}
							{index + 1}
						</button>
					</li>
				{/each}
				{#if blocks.length === 0}
					<li class="empty">No blocks yet — add a cuboid to start.</li>
				{/if}
			</ol>
		</aside>

		<section class="viewport">
			<canvas data-testid="mini-build-editor-canvas" {@attach attachViewport}></canvas>
			<div class="legend" aria-hidden="true">
				<span class="axis x">X</span><span class="axis y">Y</span><span class="axis z">Z</span>
				<span class="anchor">● origin</span>
				<span>snap {MINI_BUILD_LIMITS.gridSize}m</span>
			</div>
			{#if message}
				<p
					class="toast"
					class:info={message.tone === 'info'}
					data-testid="mini-build-message"
					role="status"
				>
					{message.text}
				</p>
			{/if}
		</section>

		<aside class="properties" aria-label="Properties">
			<p class="section-label">
				{selected && isPlaneBlock(selected) ? 'Selected Plane' : 'Selected Block'}
			</p>
			{#if selected && selectedBox && selectedSize}
				<div class="grid-fields">
					<span class="field-title">Position</span>
					{#each AXIS_LIST as axis (axis)}
						<label>
							<span class="axis {axis}">{axis.toUpperCase()}</span>
							<input
								type="number"
								step={MINI_BUILD_LIMITS.gridSize}
								data-testid="mini-build-pos-{axis}"
								value={meters(gridToMeters(selectedBox.min[axis]))}
								onchange={(event) => onPositionInput(axis, event.currentTarget)}
							/>
						</label>
					{/each}
					<span class="field-title">Size</span>
					{#each AXIS_LIST as axis (axis)}
						<label>
							<span class="axis {axis}">{axis.toUpperCase()}</span>
							<input
								type="number"
								min={MINI_BUILD_LIMITS.minBlockSizeGrid}
								max={MINI_BUILD_LIMITS.maxBounds[axis]}
								step={MINI_BUILD_LIMITS.gridSize}
								data-testid="mini-build-size-{axis}"
								value={meters(gridToMeters(selectedSize[axis]))}
								onchange={(event) => onSizeInput(axis, event.currentTarget)}
							/>
						</label>
					{/each}
				</div>
				<label class="row">
					<span>Material</span>
					<select
						data-testid="mini-build-block-material"
						value={String(selected.materialSlot)}
						onchange={(event) => run(editor.setBlockMaterial(Number(event.currentTarget.value)))}
					>
						{#each materials as slot, index (index)}
							<option value={String(index)}>{index + 1}. {slot.name}</option>
						{/each}
					</select>
				</label>
				<label class="row">
					<span>Collision</span>
					<select
						data-testid="mini-build-block-collision"
						value={selected.collision ?? 'auto'}
						onchange={(event) =>
							run(editor.setBlockCollision(event.currentTarget.value as MiniBuildBlockCollision))}
					>
						<option value="auto">Auto</option>
						<option value="solid">Solid</option>
						<option value="none">None (visual only)</option>
					</select>
				</label>
				<p class="hint" data-testid="mini-build-plane-hint">
					{#if flatAxis(selectedSize)}
						Flat on {flatAxis(selectedSize)?.toUpperCase()} — drawn as a two-sided plane. Give it a size
						to make it a cuboid again.
					{:else}
						Set any one size to 0 to make a two-sided plane.
					{/if}
				</p>
				<p class="hint">
					Rotation {selected.rotation.x}° / {selected.rotation.y}° / {selected.rotation.z}° (X / Y /
					Z)
				</p>
			{:else}
				<p class="hint">Click a block to select it.</p>
			{/if}

			<p class="section-label">Materials</p>
			<ul class="materials">
				{#each materials as slot, index (index)}
					<li data-testid="mini-build-material-{index}">
						<span class="slot-number">{index + 1}</span>
						<input
							type="color"
							data-testid="mini-build-material-color-{index}"
							value={slot.material.color.toLowerCase()}
							onchange={(event) =>
								run(editor.updateMaterialSlot(index, { color: event.currentTarget.value }))}
							aria-label="Material {index + 1} colour"
						/>
						<input
							class="slot-name"
							value={slot.name}
							aria-label="Material {index + 1} name"
							onchange={(event) =>
								run(editor.updateMaterialSlot(index, { name: event.currentTarget.value }))}
						/>
						<select
							data-testid="mini-build-material-finish-{index}"
							value={slot.finish}
							aria-label="Material {index + 1} finish"
							onchange={(event) =>
								run(
									editor.updateMaterialSlot(index, {
										finish: event.currentTarget.value as MiniBuildFinish
									})
								)}
						>
							{#each MINI_BUILD_FINISHES as finish (finish)}
								<option value={finish}>{MINI_BUILD_FINISH_LABELS[finish]}</option>
							{/each}
						</select>
						<button
							type="button"
							class="icon"
							aria-label="Remove material {index + 1}"
							disabled={materials.length <= 1}
							onclick={() => run(editor.removeMaterialSlot(index))}>×</button
						>
					</li>
				{/each}
			</ul>
			<button
				type="button"
				data-testid="mini-build-add-material"
				disabled={materials.length >= MINI_BUILD_LIMITS.maxMaterialSlots}
				onclick={() => run(editor.addMaterialSlot())}
			>
				+ Add Material
			</button>

			<label class="row">
				<span>Type</span>
				<select
					value={semanticType}
					onchange={(event) => {
						editor.setSemanticType(event.currentTarget.value as MiniBuildSemanticType);
						refresh();
					}}
				>
					{#each MINI_BUILD_SEMANTIC_TYPES as type (type)}
						<option value={type}>{type[0].toUpperCase() + type.slice(1)}</option>
					{/each}
				</select>
			</label>

			<button
				type="button"
				class="help-toggle"
				onclick={() => (showHelp = !showHelp)}
				aria-expanded={showHelp}>Keyboard controls (?)</button
			>
			{#if showHelp}
				<dl class="keys" data-testid="mini-build-keys">
					<dt>N</dt>
					<dd>Add cuboid</dd>
					<dt>Click</dt>
					<dd>Select block · drag arrows to move · drag cubes to resize</dd>
					<dt>← → ↑ ↓</dt>
					<dd>Move on X / Z ({MINI_BUILD_LIMITS.gridSize}m)</dd>
					<dt>E / Q</dt>
					<dd>Move up / down</dd>
					<dt>Shift + arrows, E, Q</dt>
					<dd>Resize (shrink to 0 for a plane)</dd>
					<dt>R</dt>
					<dd>Rotate 90° (Shift X, Alt Z)</dd>
					<dt>Ctrl/Cmd+D</dt>
					<dd>Duplicate block</dd>
					<dt>M</dt>
					<dd>Duplicate + mirror X</dd>
					<dt>Delete</dt>
					<dd>Delete block</dd>
					<dt>1 – 4</dt>
					<dd>Assign material slot</dd>
					<dt>Tab</dt>
					<dd>Next block</dd>
					<dt>F</dt>
					<dd>Frame design</dd>
					<dt>Ctrl/Cmd+Z</dt>
					<dd>Undo (Shift to redo)</dd>
					<dt>Ctrl/Cmd+S</dt>
					<dd>Save and keep editing</dd>
					<dt>Drag / right-drag / wheel</dt>
					<dd>Orbit / pan / zoom</dd>
					<dt>Esc</dt>
					<dd>Cancel</dd>
				</dl>
			{/if}
		</aside>
	</div>

	{#if namePrompt}
		<div class="dialog-backdrop">
			<form class="dialog" onsubmit={submitName} data-testid="mini-build-name-dialog">
				<h3>{namePrompt.mode === 'save-as' ? 'Save As New Design' : 'Name Your Build'}</h3>
				<p>
					{namePrompt.mode === 'save-as'
						? 'Creates a separate design. Placed copies keep using the original.'
						: 'Give this Mini Build a name for your library.'}
				</p>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					data-testid="mini-build-name-input"
					bind:value={namePrompt.value}
					maxlength={MINI_BUILD_LIMITS.maxNameLength}
					placeholder="e.g. Arm Chair"
					autofocus
				/>
				<div class="dialog-actions">
					<button type="button" onclick={() => (namePrompt = null)}>Cancel</button>
					<button type="submit" class="primary" data-testid="mini-build-name-confirm">Save</button>
				</div>
			</form>
		</div>
	{/if}

	{#if confirmDiscard}
		<div class="dialog-backdrop">
			<div class="dialog" role="alertdialog" data-testid="mini-build-discard-dialog">
				<h3>Discard changes?</h3>
				<p>Your changes to this build have not been saved.</p>
				<div class="dialog-actions">
					<button type="button" onclick={() => (confirmDiscard = false)}>Keep Editing</button>
					<button
						type="button"
						class="danger"
						data-testid="mini-build-discard-confirm"
						onclick={onClose}>Discard</button
					>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.editor {
		position: fixed;
		inset: 0;
		z-index: 70;
		display: flex;
		flex-direction: column;
		background: #1b1f21;
		color: #e6edf3;
		font:
			13px/1.45 system-ui,
			-apple-system,
			sans-serif;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1.5rem;
		padding: 0.7rem 1rem;
		border-bottom: 1px solid #30363d;
		background: #22272b;
	}
	.eyebrow {
		margin: 0 0 0.2rem;
		font-size: 10px;
		letter-spacing: 0.18em;
		color: #9fb0bd;
	}
	.name {
		font-size: 18px;
		font-weight: 600;
		min-width: 14rem;
		background: transparent;
		border: 1px solid transparent;
	}
	.name:hover,
	.name:focus {
		border-color: #444c56;
		background: #1b1f21;
	}
	.stats {
		display: flex;
		gap: 1.25rem;
		margin: 0;
	}
	.stats div {
		display: grid;
	}
	.stats dt {
		font-size: 10px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #8b949e;
	}
	.stats dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	.stats .limit dd {
		color: #ffb86b;
	}
	.actions {
		margin-left: auto;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	button,
	input,
	select {
		font: inherit;
		color: inherit;
		background: #2d333b;
		border: 1px solid #444c56;
		border-radius: 6px;
		padding: 0.35rem 0.6rem;
	}
	button {
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	button.primary {
		background: #2d6a4f;
		border-color: #52b788;
	}
	button.danger {
		border-color: #a4443f;
	}
	button[aria-pressed='true'] {
		background: #3b4a58;
		border-color: #ffd166;
	}
	.shared-banner {
		margin: 0;
		padding: 0.4rem 1rem;
		background: #3d2f12;
		color: #ffd89b;
		border-bottom: 1px solid #5c4516;
	}
	.body {
		flex: 1;
		display: grid;
		grid-template-columns: 12.5rem 1fr 17rem;
		min-height: 0;
	}
	.toolbar,
	.properties {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0.75rem;
		overflow-y: auto;
		background: #1f2428;
	}
	.toolbar {
		border-right: 1px solid #30363d;
	}
	.properties {
		border-left: 1px solid #30363d;
	}
	.rotate-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.3rem;
	}
	.section-label {
		margin: 0.6rem 0 0.1rem;
		font-size: 10px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #8b949e;
	}
	.block-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.25rem;
	}
	.block-list button {
		width: 100%;
		text-align: left;
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.swatch {
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 3px;
		border: 1px solid #0006;
	}
	.empty,
	.hint {
		color: #8b949e;
		font-size: 12px;
		margin: 0;
	}
	.viewport {
		position: relative;
		min-width: 0;
		min-height: 0;
	}
	.viewport canvas {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
		cursor: grab;
	}
	.legend {
		position: absolute;
		left: 0.75rem;
		bottom: 0.6rem;
		display: flex;
		gap: 0.6rem;
		font-size: 11px;
		color: #9fb0bd;
		pointer-events: none;
	}
	.axis {
		font-weight: 700;
	}
	.axis.x {
		color: #e5534b;
	}
	.axis.y {
		color: #57ab5a;
	}
	.axis.z {
		color: #539bf5;
	}
	.anchor {
		color: #ff9e3d;
	}
	.toast {
		position: absolute;
		top: 0.75rem;
		left: 50%;
		transform: translateX(-50%);
		margin: 0;
		padding: 0.4rem 0.8rem;
		border-radius: 6px;
		background: #5a1e1b;
		border: 1px solid #a4443f;
		white-space: pre-line;
	}
	.toast.info {
		background: #1e4630;
		border-color: #52b788;
	}
	.grid-fields {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.3rem;
	}
	.field-title {
		grid-column: 1 / -1;
		font-size: 12px;
		color: #c9d1d9;
	}
	.grid-fields label {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 0.25rem;
	}
	.grid-fields input {
		min-width: 0;
		padding: 0.25rem 0.3rem;
	}
	.row {
		display: grid;
		grid-template-columns: 4.5rem 1fr;
		align-items: center;
		gap: 0.4rem;
	}
	.materials {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}
	.materials li {
		display: grid;
		grid-template-columns: 1rem 2rem 1fr 4.6rem 1.8rem;
		align-items: center;
		gap: 0.25rem;
	}
	.materials input[type='color'] {
		padding: 0.1rem;
		height: 1.8rem;
		width: 2rem;
	}
	.slot-name,
	.materials select {
		min-width: 0;
		padding: 0.25rem 0.3rem;
	}
	.slot-number {
		color: #8b949e;
		font-variant-numeric: tabular-nums;
	}
	.icon {
		padding: 0.2rem;
	}
	.help-toggle {
		margin-top: 0.6rem;
	}
	.keys {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.2rem 0.6rem;
		margin: 0;
		font-size: 12px;
	}
	.keys dt {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		color: #ffd166;
	}
	.keys dd {
		margin: 0;
		color: #c9d1d9;
	}
	.dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		background: #0009;
	}
	.dialog {
		width: min(26rem, 92vw);
		background: #22272b;
		border: 1px solid #444c56;
		border-radius: 12px;
		padding: 1.1rem;
		display: grid;
		gap: 0.6rem;
	}
	.dialog h3,
	.dialog p {
		margin: 0;
	}
	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.4rem;
	}
	@media (max-width: 900px) {
		.body {
			grid-template-columns: 1fr;
			grid-template-rows: auto minmax(16rem, 1fr) auto;
			overflow-y: auto;
		}
		.toolbar,
		.properties {
			border: none;
		}
	}
</style>
