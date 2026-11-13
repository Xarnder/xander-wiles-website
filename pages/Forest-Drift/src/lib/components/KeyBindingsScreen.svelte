<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		findKeyAction,
		KEY_ACTIONS,
		KEY_CATEGORIES,
		type KeyActionDef,
		type KeyActionId,
		type KeyCategoryId
	} from '#lib/game/input/keyActions';
	import {
		bindingFromKeyDown,
		codesOverlap,
		formatBinding,
		genericModifier,
		isApplePlatform,
		loadKeyboardLayoutLabels,
		codeLabel,
		physicalCodes,
		refusalReason,
		type Binding
	} from '#lib/game/input/keyCodes';
	import {
		checkCandidate,
		findConflicts,
		type BindingSlot,
		type KeyConflict
	} from '#lib/game/input/conflicts';
	import {
		addProfiles,
		applyBindingChanges,
		canUndoKeyBindings,
		createProfile,
		DEFAULT_PROFILE_ID,
		deleteProfile,
		getActiveProfile,
		getBindings,
		getKeyBindingsState,
		MAX_PROFILES,
		MAX_PROFILE_NAME_LENGTH,
		renameProfile,
		resetActions,
		resetActiveProfile,
		setActiveProfile,
		subscribeKeyBindings,
		undoKeyBindings,
		type BindingPair
	} from '#lib/game/input/KeyBindingsStore';
	import {
		exportProfilesFile,
		MAX_KEY_BINDINGS_FILE_BYTES,
		parseProfilesFile,
		profilesFileName,
		resolverFor,
		type LoadedProfile
	} from '#lib/game/input/keyBindingsFile';
	import { suspendGameKeys } from '#lib/game/input/KeyInput';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	const actions: readonly KeyActionDef[] = KEY_ACTIONS;
	const apple = isApplePlatform();

	/** Mouse controls are fixed this round (plan, Q1); shown so the picture is complete. */
	const MOUSE_ROWS: Partial<Record<KeyCategoryId, readonly [string, string][]>> = {
		movement: [
			['Mouse', 'Look around. Click into the world to capture the mouse.'],
			['Mouse wheel', 'While flying: change fly speed.']
		],
		interaction: [['Left click while carrying', 'Fire a seed pellet.']],
		building: [
			['Left click', 'Place, add a point or confirm.'],
			['Right click', 'Cancel placement or deselect the tool.']
		]
	};

	/** The keyboard picture: rows of [code, width in key units]. */
	const KEYBOARD: readonly (readonly [string, number])[][] = [
		[['Escape', 1.25], ...Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, 1] as const)],
		[
			['Backquote', 1],
			...Array.from({ length: 10 }, (_, i) => [`Digit${(i + 1) % 10}`, 1] as const),
			['Minus', 1],
			['Equal', 1],
			['Backspace', 2]
		],
		[
			['Tab', 1.5],
			...'QWERTYUIOP'.split('').map((c) => [`Key${c}`, 1] as const),
			['BracketLeft', 1],
			['BracketRight', 1],
			['Backslash', 1.5]
		],
		[
			['CapsLock', 1.75],
			...'ASDFGHJKL'.split('').map((c) => [`Key${c}`, 1] as const),
			['Semicolon', 1],
			['Quote', 1],
			['Enter', 2.25]
		],
		[
			['ShiftLeft', 2.25],
			...'ZXCVBNM'.split('').map((c) => [`Key${c}`, 1] as const),
			['Comma', 1],
			['Period', 1],
			['Slash', 1],
			['ShiftRight', 2.75]
		],
		[
			['ControlLeft', 1.5],
			['AltLeft', 1.25],
			['MetaLeft', 1.25],
			['Space', 6],
			['MetaRight', 1.25],
			['AltRight', 1.25],
			['ArrowLeft', 1],
			['ArrowUp', 1],
			['ArrowDown', 1],
			['ArrowRight', 1]
		],
		[
			['Insert', 1],
			['Delete', 1],
			['Home', 1],
			['End', 1],
			['PageUp', 1],
			['PageDown', 1]
		]
	];

	// ---------------------------------------------------------------- live state

	let revision = $state(0);
	let root: HTMLDivElement;
	let fileInput: HTMLInputElement;

	const bindingsState = $derived.by(() =>
		revision >= 0 ? getKeyBindingsState() : getKeyBindingsState()
	);
	const activeProfile = $derived.by(() => (revision >= 0 ? getActiveProfile() : null));
	const conflicts: KeyConflict[] = $derived.by(() =>
		revision >= 0 ? findConflicts(getBindings) : []
	);
	const pairs = $derived.by(() => {
		const map: Partial<Record<KeyActionId, BindingPair>> = {};
		if (revision >= 0) for (const action of KEY_ACTIONS) map[action.id] = getBindings(action.id);
		return map;
	});

	/** For each `id:slot`, the actions it clashes with. */
	const conflictBySlot = $derived.by(() => {
		const map: Record<string, KeyActionId[]> = {};
		const add = (key: string, other: KeyActionId) => {
			const list = (map[key] ??= []);
			if (!list.includes(other)) list.push(other);
		};
		for (const c of conflicts) {
			add(`${c.first.id}:${c.first.slot}`, c.second.id);
			add(`${c.second.id}:${c.second.slot}`, c.first.id);
		}
		return map;
	});

	const conflictCountByCategory = $derived.by(() => {
		const counts: Record<string, number> = {};
		const seen: Record<string, true> = {};
		for (const c of conflicts)
			for (const side of [c.first, c.second]) {
				if (seen[side.id]) continue;
				seen[side.id] = true;
				const category = findKeyAction(side.id)!.category;
				counts[category] = (counts[category] ?? 0) + 1;
			}
		return counts;
	});

	const profileOptions = $derived.by(() =>
		bindingsState.profiles.map((profile) => ({
			id: profile.id,
			name: profile.name,
			changed: Object.keys(profile.overrides).length,
			conflicts: findConflicts(resolverFor(profile.overrides)).length
		}))
	);

	let categoryId = $state<KeyCategoryId>('movement');
	let query = $state('');
	let keyFilter = $state<string | null>(null);
	let showKeyboard = $state(true);

	/** The slot waiting for a key, or a "find by key" wait. */
	let capturing = $state<{ id: KeyActionId; slot: BindingSlot } | 'find' | null>(null);
	let captureMessage = $state<string | null>(null);
	let pendingModifier: string | null = null;

	let conflictPrompt = $state<{
		id: KeyActionId;
		slot: BindingSlot;
		binding: Binding;
		others: { id: KeyActionId; slot: BindingSlot }[];
		previous: Binding | null;
	} | null>(null);

	let toast = $state<{ text: string; undo: boolean; tone?: 'warn' } | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	let liveMessage = $state('');

	let renaming = $state(false);
	let renameValue = $state('');
	let confirming = $state<'delete' | 'reset' | 'close' | null>(null);
	let downloadMenu = $state(false);
	let dragging = $state(false);
	let conflictCursor = 0;
	let touchOnly = $state(false);

	type PreviewProfile = LoadedProfile & { selected: boolean; editName: string };
	let preview = $state<{ profiles: PreviewProfile[]; newerVersion: boolean } | null>(null);
	let loadError = $state<string | null>(null);

	const dialogOpen = $derived(!!conflictPrompt || !!preview || !!confirming || !!loadError);

	// ---------------------------------------------------------------- derived view

	const normalizedQuery = $derived(query.trim().toLowerCase());

	function labelsOf(id: KeyActionId): string[] {
		return (pairs[id] ?? [null, null])
			.filter((b): b is Binding => !!b)
			.map((b) => formatBinding(b, { apple }).toLowerCase());
	}

	function matchesQuery(action: KeyActionDef): boolean {
		if (!normalizedQuery) return true;
		const id = action.id as KeyActionId;
		return (
			action.label.toLowerCase().includes(normalizedQuery) ||
			(action.description ?? '').toLowerCase().includes(normalizedQuery) ||
			labelsOf(id).some(
				(label) =>
					label === normalizedQuery || label.replace(/ /g, '') === normalizedQuery.replace(/ /g, '')
			)
		);
	}

	function usesCode(id: KeyActionId, code: string): boolean {
		return (pairs[id] ?? [null, null]).some((b) => !!b && codesOverlap(b.code, code));
	}

	const searching = $derived(!!normalizedQuery || !!keyFilter);
	const visibleActions = $derived(
		actions.filter((action) => {
			if (!searching) return action.category === categoryId;
			if (keyFilter && !usesCode(action.id as KeyActionId, keyFilter)) return false;
			return matchesQuery(action);
		})
	);

	function changed(id: KeyActionId): boolean {
		return !!activeProfile?.overrides[id];
	}

	function slotConflicts(id: KeyActionId, slot: BindingSlot): KeyActionId[] {
		return conflictBySlot[`${id}:${slot}`] ?? [];
	}

	function actionLabel(id: KeyActionId): string {
		return findKeyAction(id)?.label ?? id;
	}

	function categoryTitle(id: KeyActionId): string {
		const category = findKeyAction(id)?.category;
		return KEY_CATEGORIES.find((c) => c.id === category)?.title ?? '';
	}

	function capLabel(binding: Binding | null): string {
		return binding ? formatBinding(binding, { apple }) : '';
	}

	function keyState(code: string): {
		used: boolean;
		conflict: boolean;
		fixed: boolean;
		names: string[];
	} {
		const names: string[] = [];
		let used = false;
		for (const action of KEY_ACTIONS) {
			if (!usesCode(action.id, code)) continue;
			names.push(action.label);
			if (searching ? visibleActions.includes(action) : action.category === categoryId) used = true;
		}
		const conflict = conflicts.some((c) =>
			physicalCodes(c.binding.code).some((p) => codesOverlap(p, code))
		);
		const fixed = code === 'Escape' || !!refusalReason({ code }, apple);
		return { used, conflict, fixed, names };
	}

	// ---------------------------------------------------------------- feedback

	function say(text: string, options: { undo?: boolean; tone?: 'warn' } = {}) {
		toast = { text, undo: !!options.undo, tone: options.tone };
		liveMessage = text;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), 6000);
	}

	function undo() {
		if (undoKeyBindings()) say('Undone');
	}

	// ---------------------------------------------------------------- choosing keys

	function startCapture(id: KeyActionId, slot: BindingSlot) {
		if (findKeyAction(id)?.locked) return;
		capturing = { id, slot };
		pendingModifier = null;
		captureMessage = null;
		liveMessage = `Press a key for ${actionLabel(id)}. Escape cancels.`;
	}

	function cancelCapture() {
		capturing = null;
		pendingModifier = null;
		captureMessage = null;
	}

	function clearSlot(id: KeyActionId, slot: BindingSlot) {
		const result = applyBindingChanges([{ id, slot, binding: null }]);
		cancelCapture();
		announceChange(
			result.createdProfile,
			`${actionLabel(id)}: ${slot === 0 ? 'key' : 'second key'} cleared`
		);
	}

	function announceChange(createdProfile: string | null, text: string) {
		if (createdProfile)
			say(`Created “${createdProfile}” so the default stays intact. ${text}`, { undo: true });
		else say(text, { undo: true });
	}

	function offerBinding(binding: Binding) {
		if (capturing === 'find') {
			keyFilter = binding.code;
			query = '';
			capturing = null;
			liveMessage = `Showing everything on ${capLabel(binding)}`;
			return;
		}
		if (!capturing) return;
		const { id, slot } = capturing;
		const check = checkCandidate(id, binding, getBindings, apple);
		if (check.refused) {
			captureMessage = check.refused;
			liveMessage = check.refused;
			return;
		}
		const previous = (pairs[id] ?? [null, null])[slot];
		cancelCapture();
		if (check.conflicts.length) {
			conflictPrompt = { id, slot, binding, others: [...check.conflicts], previous };
			tick().then(() => root?.querySelector<HTMLElement>('[data-testid="conflict-swap"]')?.focus());
			return;
		}
		commitBinding(id, slot, binding, check.harmless, check.warning);
	}

	function commitBinding(
		id: KeyActionId,
		slot: BindingSlot,
		binding: Binding,
		harmless: readonly KeyActionId[] = [],
		warning: string | null = null
	) {
		const result = applyBindingChanges([{ id, slot, binding }]);
		if (!result.applied) {
			say(`You have ${MAX_PROFILES} profiles. Delete one to change keys on Default.`, {
				tone: 'warn'
			});
			return;
		}
		let text = `${actionLabel(id)} → ${capLabel(binding)}`;
		if (harmless.length)
			text += `. Also used by ${harmless.map(actionLabel).join(', ')} — no conflict, never at the same time.`;
		if (warning) text += ` ${warning}`;
		announceChange(result.createdProfile, text);
	}

	function resolveConflict(choice: 'swap' | 'both' | 'cancel') {
		const prompt = conflictPrompt;
		conflictPrompt = null;
		if (!prompt || choice === 'cancel') return;
		if (choice === 'both') {
			commitBinding(prompt.id, prompt.slot, prompt.binding);
			return;
		}
		// Swap: each clashing action gets the key this slot had before.
		const result = applyBindingChanges([
			{ id: prompt.id, slot: prompt.slot, binding: prompt.binding },
			...prompt.others.map((other) => ({
				id: other.id,
				slot: other.slot,
				binding: prompt.previous
			}))
		]);
		const names = prompt.others.map((o) => actionLabel(o.id)).join(', ');
		announceChange(
			result.createdProfile,
			prompt.previous
				? `Swapped: ${actionLabel(prompt.id)} → ${capLabel(prompt.binding)}, ${names} → ${capLabel(prompt.previous)}`
				: `${actionLabel(prompt.id)} → ${capLabel(prompt.binding)}; ${names} now unbound`
		);
	}

	function showNextConflict() {
		if (!conflicts.length) return;
		const conflict = conflicts[conflictCursor % conflicts.length];
		conflictCursor++;
		const id = conflict.first.id;
		query = '';
		keyFilter = null;
		categoryId = findKeyAction(id)!.category;
		tick().then(() => {
			const row = root?.querySelector<HTMLElement>(`[data-action-row="${id}"]`);
			row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			row?.classList.add('flash');
			setTimeout(() => row?.classList.remove('flash'), 1200);
			row?.querySelector<HTMLElement>('.cap.conflict')?.focus();
		});
	}

	function goTo(id: KeyActionId) {
		query = '';
		keyFilter = null;
		categoryId = findKeyAction(id)!.category;
		tick().then(() => {
			const row = root?.querySelector<HTMLElement>(`[data-action-row="${id}"]`);
			row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			row?.classList.add('flash');
			setTimeout(() => row?.classList.remove('flash'), 1200);
		});
	}

	// ---------------------------------------------------------------- profiles

	function onProfileChange(event: Event) {
		const id = (event.currentTarget as HTMLSelectElement).value;
		setActiveProfile(id);
		const name = id === DEFAULT_PROFILE_ID ? 'Default' : getActiveProfile()?.name;
		say(`Using “${name}”`);
	}

	function newProfile(from: 'defaults' | 'active') {
		const id = createProfile(
			from === 'active' ? `${activeProfile?.name ?? 'Default'} copy` : 'New profile',
			from
		);
		if (!id) {
			say(`You can keep up to ${MAX_PROFILES} profiles. Delete one first.`, { tone: 'warn' });
			return;
		}
		say(`Created “${getActiveProfile()?.name}”`, { undo: true });
		startRename();
	}

	function startRename() {
		if (!activeProfile) return;
		renameValue = activeProfile.name;
		renaming = true;
		tick().then(() =>
			root?.querySelector<HTMLInputElement>('[data-testid="profile-rename-input"]')?.select()
		);
	}

	function finishRename(save: boolean) {
		if (save && activeProfile) renameProfile(activeProfile.id, renameValue);
		renaming = false;
	}

	function confirmAction() {
		const what = confirming;
		confirming = null;
		if (what === 'delete' && activeProfile) {
			const name = activeProfile.name;
			deleteProfile(activeProfile.id);
			say(`Deleted “${name}”. Using Default.`, { undo: true });
		} else if (what === 'reset') {
			resetActiveProfile();
			say('Every key is back to its default', { undo: true });
		} else if (what === 'close') onClose();
	}

	function requestClose() {
		if (capturing) return cancelCapture();
		if (conflicts.length) {
			confirming = 'close';
			return;
		}
		onClose();
	}

	// ---------------------------------------------------------------- files

	function download(which: 'active' | 'all') {
		downloadMenu = false;
		const profiles =
			which === 'all'
				? bindingsState.profiles
				: [activeProfile ?? { name: 'Default', overrides: {} }];
		if (!profiles.length) {
			say('There are no saved profiles yet. Change a key first.', { tone: 'warn' });
			return;
		}
		const text = exportProfilesFile(profiles);
		const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = profilesFileName(which === 'all' ? 'all-profiles' : profiles[0].name);
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
		say(
			which === 'all'
				? `Downloaded ${profiles.length} profiles`
				: `Downloaded “${profiles[0].name}”`
		);
	}

	async function readFile(file: File | undefined) {
		if (!file) return;
		if (file.size > MAX_KEY_BINDINGS_FILE_BYTES) {
			loadError = 'This file is too large to be a controls file.';
			return;
		}
		const result = parseProfilesFile(await file.text());
		if (!result.ok) {
			loadError = result.error;
			return;
		}
		const names = new Set(bindingsState.profiles.map((p) => p.name.toLowerCase()));
		preview = {
			newerVersion: result.newerVersion,
			profiles: result.profiles.map((p) => ({
				...p,
				selected: true,
				editName: names.has(p.name.toLowerCase())
					? `${p.name} (2)`.slice(0, MAX_PROFILE_NAME_LENGTH)
					: p.name
			}))
		};
	}

	function existingByName(name: string) {
		return bindingsState.profiles.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
	}

	function finishLoad(mode: 'use' | 'only' | 'replace') {
		if (!preview) return;
		const chosen = preview.profiles.filter((p) => p.selected);
		preview = null;
		if (!chosen.length) return;
		const ids = addProfiles(
			chosen.map((p) => ({
				name: mode === 'replace' ? p.name : p.editName,
				overrides: p.overrides,
				replaceId: mode === 'replace' ? existingByName(p.name)?.id : undefined
			})),
			mode !== 'only'
		);
		if (!ids.length) {
			say(`You can keep up to ${MAX_PROFILES} profiles. Delete one first.`, { tone: 'warn' });
			return;
		}
		const conflictTotal = chosen.reduce((n, p) => n + p.conflicts, 0);
		say(
			`Loaded ${ids.length === 1 ? `“${getKeyBindingsState().profiles.find((p) => p.id === ids[0])?.name}”` : `${ids.length} profiles`}` +
				(conflictTotal
					? ` · ⚠ ${conflictTotal} conflict${conflictTotal === 1 ? '' : 's'} to fix`
					: ''),
			{ undo: true }
		);
	}

	// ---------------------------------------------------------------- keyboard handling

	function focusables(): HTMLElement[] {
		const scope = root.querySelector<HTMLElement>('[data-kb-dialog]') ?? root;
		return Array.from(
			scope.querySelectorAll<HTMLElement>(
				'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'
			)
		).filter((el) => el.getClientRects().length);
	}

	function typingIn(target: EventTarget | null): boolean {
		return (
			target instanceof HTMLInputElement ||
			target instanceof HTMLSelectElement ||
			target instanceof HTMLTextAreaElement
		);
	}

	function onKeyDown(event: KeyboardEvent) {
		// Nothing reaches the game or the menus underneath while this screen is open.
		event.stopPropagation();
		touchOnly = false;
		if (capturing) {
			event.preventDefault();
			if (event.repeat) return;
			if (event.code === 'Escape') return cancelCapture();
			const modifier = genericModifier(event.code);
			if (modifier) {
				pendingModifier = modifier;
				return;
			}
			pendingModifier = null;
			const binding = bindingFromKeyDown(event);
			if (!binding) {
				captureMessage = refusalReason({ code: event.code }, apple) ?? 'That key can’t be used.';
				return;
			}
			offerBinding(binding);
			return;
		}
		if (event.key === 'Tab') {
			const controls = focusables();
			const first = controls[0];
			const last = controls[controls.length - 1];
			if (
				event.shiftKey &&
				(document.activeElement === first || !root.contains(document.activeElement))
			) {
				event.preventDefault();
				last?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first?.focus();
			}
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			if (renaming) return finishRename(false);
			if (downloadMenu) return void (downloadMenu = false);
			if (conflictPrompt) return resolveConflict('cancel');
			if (preview) return void (preview = null);
			if (loadError) return void (loadError = null);
			if (confirming) return void (confirming = null);
			if (typingIn(event.target)) return (event.target as HTMLElement).blur();
			if (keyFilter) return void (keyFilter = null);
			return requestClose();
		}
		if (
			(event.ctrlKey || event.metaKey) &&
			event.code === 'KeyZ' &&
			!typingIn(event.target) &&
			!dialogOpen
		) {
			event.preventDefault();
			undo();
		}
	}

	function onKeyUp(event: KeyboardEvent) {
		event.stopPropagation();
		if (!capturing || !pendingModifier) return;
		if (genericModifier(event.code) !== pendingModifier) return;
		const binding: Binding = { code: pendingModifier };
		pendingModifier = null;
		offerBinding(binding);
	}

	onMount(() => {
		const previous = document.activeElement as HTMLElement | null;
		document.exitPointerLock?.();
		const resume = suspendGameKeys();
		const unsubscribe = subscribeKeyBindings(() => revision++);
		void loadKeyboardLayoutLabels().then(() => revision++);
		touchOnly =
			typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
		window.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('keyup', onKeyUp, true);
		root.focus();
		return () => {
			window.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('keyup', onKeyUp, true);
			unsubscribe();
			resume();
			clearTimeout(toastTimer);
			previous?.focus?.();
		};
	});
</script>

{#snippet keyCap(id: KeyActionId, slot: BindingSlot, binding: Binding | null, locked: boolean)}
	{@const clashes = slotConflicts(id, slot)}
	{@const waiting =
		capturing !== null && capturing !== 'find' && capturing.id === id && capturing.slot === slot}
	{@const warn =
		binding && !clashes.length ? checkCandidate(id, binding, getBindings, apple).warning : null}
	<button
		type="button"
		class={[
			'cap',
			{ conflict: clashes.length > 0, waiting, empty: !binding, warn: !!warn, locked }
		]}
		data-testid="key-cap-{id}-{slot}"
		disabled={locked}
		title={clashes.length
			? `Conflicts with ${clashes.map(actionLabel).join(', ')}`
			: (warn ?? (locked ? 'Fixed' : 'Change this key'))}
		aria-label={`${actionLabel(id)}, ${slot === 0 ? 'primary' : 'secondary'} key ${binding ? capLabel(binding) : 'not set'}${clashes.length ? `, conflicts with ${clashes.map(actionLabel).join(', ')}` : ''}. ${locked ? 'Fixed.' : 'Press to change.'}`}
		onclick={() => (waiting ? cancelCapture() : startCapture(id, slot))}
	>
		{#if waiting}
			Press a key…
		{:else if binding}
			{#if clashes.length}<span aria-hidden="true">⚠ </span>{/if}{#if locked}<span
					aria-hidden="true"
					>🔒
				</span>{/if}{capLabel(binding)}
		{:else}
			{slot === 0 ? 'Unbound' : '+'}
		{/if}
	</button>
{/snippet}

<div
	bind:this={root}
	class="kb-screen"
	role="dialog"
	aria-modal="true"
	aria-labelledby="kb-title"
	tabindex="-1"
	data-testid="key-bindings-screen"
	data-ui-surface="panel"
	ondragover={(event) => {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		dragging = true;
	}}
	ondragleave={(event) => {
		if (event.currentTarget === event.target || !root.contains(event.relatedTarget as Node))
			dragging = false;
	}}
	ondrop={(event) => {
		event.preventDefault();
		dragging = false;
		void readFile(event.dataTransfer?.files?.[0]);
	}}
>
	<header>
		<div class="title">
			<p class="eyebrow">Forest Drift</p>
			<h2 id="kb-title">Controls</h2>
		</div>
		<div class="profile">
			<label for="kb-profile">Profile</label>
			{#if renaming}
				<input
					class="rename"
					data-testid="profile-rename-input"
					maxlength={MAX_PROFILE_NAME_LENGTH}
					bind:value={renameValue}
					onkeydown={(event) => {
						if (event.key === 'Enter') finishRename(true);
					}}
					onblur={() => finishRename(true)}
				/>
			{:else}
				<select
					id="kb-profile"
					data-testid="profile-select"
					value={bindingsState.activeProfileId}
					onchange={onProfileChange}
				>
					<option value={DEFAULT_PROFILE_ID}>Default (built-in)</option>
					{#each profileOptions as option (option.id)}
						<option value={option.id}>
							{option.name} · {option.changed} changed{option.conflicts
								? ` · ⚠ ${option.conflicts}`
								: ''}
						</option>
					{/each}
				</select>
			{/if}
			<div class="profile-actions">
				<button type="button" data-testid="profile-new" onclick={() => newProfile('defaults')}
					>New</button
				>
				<button type="button" data-testid="profile-copy" onclick={() => newProfile('active')}
					>Copy</button
				>
				<button
					type="button"
					data-testid="profile-rename"
					disabled={!activeProfile}
					onclick={startRename}>Rename</button
				>
				<button
					type="button"
					data-testid="profile-delete"
					disabled={!activeProfile}
					onclick={() => (confirming = 'delete')}>Delete</button
				>
			</div>
		</div>
		<div class="file-actions">
			<div class="menu-wrap">
				<button
					type="button"
					data-testid="kb-download"
					aria-haspopup="menu"
					aria-expanded={downloadMenu}
					onclick={() => (downloadMenu = !downloadMenu)}>⬇ Download</button
				>
				{#if downloadMenu}
					<div class="menu" role="menu">
						<button
							type="button"
							role="menuitem"
							data-testid="kb-download-active"
							onclick={() => download('active')}>This profile</button
						>
						<button
							type="button"
							role="menuitem"
							data-testid="kb-download-all"
							disabled={!bindingsState.profiles.length}
							onclick={() => download('all')}>All profiles</button
						>
					</div>
				{/if}
			</div>
			<button type="button" data-testid="kb-load" onclick={() => fileInput.click()}>⬆ Load</button>
			<input
				bind:this={fileInput}
				class="hidden-file"
				type="file"
				accept=".json,application/json"
				data-testid="kb-load-input"
				tabindex="-1"
				onchange={(event) => {
					const input = event.currentTarget;
					void readFile(input.files?.[0]).finally(() => (input.value = ''));
				}}
			/>
			<button
				type="button"
				data-testid="kb-undo"
				disabled={revision < 0 || !canUndoKeyBindings()}
				onclick={undo}>↶ Undo</button
			>
			<button
				type="button"
				data-testid="kb-reset-profile"
				disabled={!activeProfile || !Object.keys(activeProfile.overrides).length}
				onclick={() => (confirming = 'reset')}>Reset all</button
			>
			<button type="button" class="done" data-testid="kb-done" onclick={requestClose}>Done</button>
		</div>
	</header>

	<div class="toolbar">
		<input
			class="search"
			type="search"
			placeholder="Search actions or keys"
			aria-label="Search actions or keys"
			data-testid="kb-search"
			bind:value={query}
			oninput={() => (keyFilter = null)}
		/>
		<button
			type="button"
			class={['find', { waiting: capturing === 'find' }]}
			data-testid="kb-find-by-key"
			onclick={() => (capturing === 'find' ? cancelCapture() : (capturing = 'find'))}
		>
			{capturing === 'find' ? 'Press any key…' : '⌨ Find by key'}
		</button>
		{#if keyFilter}
			<span class="chip" data-testid="kb-key-filter">
				On {codeLabel(keyFilter, apple)}
				<button type="button" aria-label="Clear key filter" onclick={() => (keyFilter = null)}
					>×</button
				>
			</span>
		{/if}
		{#if conflicts.length}
			<button
				type="button"
				class="conflict-summary"
				data-testid="kb-conflict-summary"
				onclick={showNextConflict}
			>
				⚠ {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'} — Show
			</button>
		{:else}
			<span class="ok-summary" data-testid="kb-no-conflicts">✓ No conflicts</span>
		{/if}
	</div>

	{#if touchOnly}
		<p class="notice" data-testid="kb-touch-notice">
			Key mapping is for physical keyboards. Touch controls are unchanged. You can still manage and
			download profiles here.
		</p>
	{/if}

	<div class="body">
		<nav aria-label="Control sections">
			{#each KEY_CATEGORIES as category (category.id)}
				{@const count = conflictCountByCategory[category.id] ?? 0}
				<button
					type="button"
					class={{ active: !searching && category.id === categoryId }}
					aria-current={!searching && category.id === categoryId ? 'true' : undefined}
					data-testid="kb-nav-{category.id}"
					onclick={() => {
						categoryId = category.id;
						query = '';
						keyFilter = null;
					}}
				>
					<span>{category.title}</span>
					{#if count}<span
							class="badge"
							data-testid="kb-nav-badge-{category.id}"
							title="{count} conflicting">⚠ {count}</span
						>{/if}
				</button>
			{/each}
		</nav>

		<section class="content" aria-live="off">
			{#if capturing && capturing !== 'find'}
				<div class="capture-bar" role="status" data-testid="kb-capture-bar">
					<span>
						Press any key or combination for <strong>{actionLabel(capturing.id)}</strong>. Esc
						cancels.
					</span>
					{#if captureMessage}<span class="refused" data-testid="kb-capture-refused"
							>{captureMessage}</span
						>{/if}
					<span class="capture-actions">
						<button
							type="button"
							data-testid="kb-capture-clear"
							onclick={() =>
								capturing && capturing !== 'find' && clearSlot(capturing.id, capturing.slot)}
							>Clear</button
						>
						<button type="button" onclick={cancelCapture}>Cancel</button>
					</span>
				</div>
			{/if}

			<h3>
				{#if searching}
					{visibleActions.length} result{visibleActions.length === 1 ? '' : 's'}
				{:else}
					{KEY_CATEGORIES.find((c) => c.id === categoryId)?.title}
				{/if}
			</h3>

			<div class="rows" role="table" aria-label="Key bindings">
				<div class="row head" role="row">
					<span role="columnheader">Action</span>
					<span role="columnheader">Key</span>
					<span role="columnheader">Second key</span>
					<span role="columnheader"><span class="visually-hidden">Reset</span></span>
				</div>
				{#each visibleActions as action (action.id)}
					{@const id = action.id as KeyActionId}
					{@const pair = pairs[id] ?? [null, null]}
					{@const clashes = [...new Set([...slotConflicts(id, 0), ...slotConflicts(id, 1)])]}
					<div
						class={['row', { clash: clashes.length > 0 }]}
						role="row"
						data-action-row={id}
						data-testid="kb-row-{id}"
					>
						<div class="label" role="cell">
							<span class="name">
								{action.label}
								{#if changed(id)}<span class="changed-dot" title="Changed from the default"
										>Changed</span
									>{/if}
								{#if searching}<span class="where">{categoryTitle(id)}</span>{/if}
							</span>
							{#if action.description}<span class="description">{action.description}</span>{/if}
							{#if clashes.length}
								<span class="clash-note" data-testid="kb-clash-{id}">
									⚠ Conflicts with
									{#each clashes as other, i (other)}
										{#if i > 0},{/if}
										<button type="button" class="link" onclick={() => goTo(other)}
											>{actionLabel(other)}</button
										>
									{/each}
								</span>
							{/if}
						</div>
						<div role="cell">{@render keyCap(id, 0, pair[0], !!action.locked)}</div>
						<div role="cell">{@render keyCap(id, 1, pair[1], !!action.locked)}</div>
						<div role="cell">
							{#if changed(id)}
								<button
									type="button"
									class="reset"
									data-testid="kb-reset-{id}"
									aria-label="Reset {action.label} to its default"
									title="Reset to default"
									onclick={() => {
										resetActions([id]);
										say(`${action.label} is back to its default`, { undo: true });
									}}>↺</button
								>
							{/if}
						</div>
					</div>
				{:else}
					<p class="empty" data-testid="kb-empty">Nothing matches.</p>
				{/each}
				{#if !searching}
					{#each MOUSE_ROWS[categoryId] ?? [] as [input, text] (input)}
						<div class="row fixed" role="row">
							<div class="label" role="cell">
								<span class="name">{text}</span>
								<span class="description">Mouse controls are fixed.</span>
							</div>
							<div role="cell"><span class="cap locked static">{input}</span></div>
							<div role="cell"></div>
							<div role="cell"></div>
						</div>
					{/each}
				{/if}
			</div>

			<div class="keyboard-wrap">
				<button
					type="button"
					class="link"
					data-testid="kb-toggle-keyboard"
					onclick={() => (showKeyboard = !showKeyboard)}
				>
					{showKeyboard ? 'Hide keyboard' : 'Show keyboard'}
				</button>
				{#if showKeyboard}
					<div
						class="keyboard"
						data-testid="kb-keyboard"
						aria-label="Keyboard: click a key to see what it does"
					>
						{#each KEYBOARD as row, r (r)}
							<div class="krow">
								{#each row as [code, width] (code)}
									{@const k = keyState(code)}
									<button
										type="button"
										class={[
											'key',
											{
												used: k.used,
												conflict: k.conflict,
												fixed: k.fixed,
												selected: keyFilter === code
											}
										]}
										style:flex-grow={width}
										data-testid="kb-key-{code}"
										title={k.names.length ? k.names.join(' · ') : 'Not used'}
										aria-label={`${codeLabel(code, apple)}: ${k.names.length ? k.names.join(', ') : 'not used'}${k.conflict ? ', conflict' : ''}`}
										onclick={() => (keyFilter = keyFilter === code ? null : code)}
									>
										{codeLabel(code, apple).replace('Left ', '').replace('Right ', '')}
									</button>
								{/each}
							</div>
						{/each}
					</div>
					<p class="legend">
						<span class="swatch used"></span> Used here
						<span class="swatch conflict"></span> Conflict
						<span class="swatch fixed"></span> Fixed or kept by the browser
					</p>
				{/if}
			</div>
		</section>
	</div>

	{#if toast}
		<div class={['toast', toast.tone]} data-testid="kb-toast">
			<span>{toast.text}</span>
			{#if toast.undo && canUndoKeyBindings()}
				<button type="button" data-testid="kb-toast-undo" onclick={undo}>Undo</button>
			{/if}
		</div>
	{/if}
	<div class="visually-hidden" aria-live="polite">{liveMessage}</div>

	{#if dragging}
		<div class="drop" data-testid="kb-drop">Drop to load controls</div>
	{/if}

	{#if conflictPrompt}
		{@const prompt = conflictPrompt}
		<div class="dialog-backdrop">
			<div
				class="dialog"
				role="alertdialog"
				aria-labelledby="kb-conflict-title"
				data-kb-dialog
				data-testid="kb-conflict-dialog"
			>
				<h3 id="kb-conflict-title">
					{capLabel(prompt.binding)} is already
					{prompt.others
						.map((o) => `“${actionLabel(o.id)}” (${categoryTitle(o.id)})`)
						.join(' and ')}
				</h3>
				<p>Both would fire at the same time. What should happen?</p>
				<div class="dialog-actions">
					<button
						type="button"
						class="primary"
						data-testid="conflict-swap"
						onclick={() => resolveConflict('swap')}
					>
						Swap{prompt.previous
							? `: ${prompt.others.map((o) => actionLabel(o.id)).join(', ')} gets ${capLabel(prompt.previous)}`
							: ` (leaves ${prompt.others.map((o) => actionLabel(o.id)).join(', ')} unbound)`}
					</button>
					<button type="button" data-testid="conflict-both" onclick={() => resolveConflict('both')}
						>Use for both</button
					>
					<button
						type="button"
						data-testid="conflict-cancel"
						onclick={() => resolveConflict('cancel')}>Cancel</button
					>
				</div>
			</div>
		</div>
	{/if}

	{#if preview}
		{@const p = preview}
		<div class="dialog-backdrop">
			<div
				class="dialog wide"
				role="dialog"
				aria-labelledby="kb-load-title"
				data-kb-dialog
				data-testid="kb-load-dialog"
			>
				<h3 id="kb-load-title">Load controls</h3>
				{#if p.newerVersion}
					<p class="warn-text">
						This file is from a newer version of Forest Drift. Anything this version doesn’t know is
						skipped.
					</p>
				{/if}
				<ul class="load-list">
					{#each p.profiles as item, i (i)}
						<li>
							<label class="check">
								<input
									type="checkbox"
									bind:checked={item.selected}
									data-testid="kb-load-select-{i}"
								/>
								<span>
									<strong>{item.name}</strong> · {item.changed} changed key{item.changed === 1
										? ''
										: 's'}
									{#if item.skipped}
										· {item.skipped} skipped{/if}
									{#if item.conflicts}
										· <span class="clash-text"
											>⚠ {item.conflicts} conflict{item.conflicts === 1 ? '' : 's'}</span
										>{/if}
								</span>
							</label>
							<label class="name-field">
								Name
								<input
									maxlength={MAX_PROFILE_NAME_LENGTH}
									bind:value={item.editName}
									data-testid="kb-load-name-{i}"
								/>
							</label>
						</li>
					{/each}
				</ul>
				<div class="dialog-actions">
					<button
						type="button"
						class="primary"
						data-testid="kb-load-use"
						onclick={() => finishLoad('use')}>Load and use</button
					>
					<button type="button" data-testid="kb-load-only" onclick={() => finishLoad('only')}
						>Load only</button
					>
					{#if p.profiles.length === 1 && existingByName(p.profiles[0].name)}
						<button
							type="button"
							data-testid="kb-load-replace"
							onclick={() => finishLoad('replace')}
						>
							Replace “{p.profiles[0].name}”
						</button>
					{/if}
					<button type="button" onclick={() => (preview = null)}>Cancel</button>
				</div>
			</div>
		</div>
	{/if}

	{#if loadError}
		<div class="dialog-backdrop">
			<div
				class="dialog"
				role="alertdialog"
				aria-labelledby="kb-error-title"
				data-kb-dialog
				data-testid="kb-load-error"
			>
				<h3 id="kb-error-title">Couldn’t load that file</h3>
				<p>{loadError} Nothing was changed.</p>
				<div class="dialog-actions">
					<button type="button" class="primary" onclick={() => (loadError = null)}>OK</button>
				</div>
			</div>
		</div>
	{/if}

	{#if confirming}
		<div class="dialog-backdrop">
			<div
				class="dialog"
				role="alertdialog"
				aria-labelledby="kb-confirm-title"
				data-kb-dialog
				data-testid="kb-confirm-{confirming}"
			>
				{#if confirming === 'delete'}
					<h3 id="kb-confirm-title">Delete “{activeProfile?.name}”?</h3>
					<p>You can undo this straight away; after that it’s gone unless you downloaded it.</p>
				{:else if confirming === 'reset'}
					<h3 id="kb-confirm-title">Put every key back to its default?</h3>
					<p>This changes “{activeProfile?.name}”. You can undo it.</p>
				{:else}
					<h3 id="kb-confirm-title">
						{conflicts.length} key{conflicts.length === 1 ? '' : 's'} still do two things at once
					</h3>
					<p>Both actions will fire when you press {conflicts.length === 1 ? 'it' : 'them'}.</p>
				{/if}
				<div class="dialog-actions">
					{#if confirming === 'close'}
						<button
							type="button"
							class="primary"
							data-testid="kb-fix-now"
							onclick={() => {
								confirming = null;
								showNextConflict();
							}}>Fix now</button
						>
						<button type="button" data-testid="kb-close-anyway" onclick={confirmAction}
							>Keep and close</button
						>
					{:else}
						<button
							type="button"
							class="primary danger"
							data-testid="kb-confirm-yes"
							onclick={confirmAction}
						>
							{confirming === 'delete' ? 'Delete' : 'Reset all'}
						</button>
						<button type="button" onclick={() => (confirming = null)}>Cancel</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.kb-screen {
		--bg: #0b1712;
		--panel: rgba(8, 18, 14, 0.6);
		--line: rgba(164, 214, 186, 0.16);
		--text: #eaf6ff;
		--muted: #c5ddcf;
		--accent: #39d353;
		--wood: #b38b4b;
		--clash: #ff6b6b;
		--warn: #ffc45c;
		position: fixed;
		inset: 0;
		z-index: 70;
		display: flex;
		flex-direction: column;
		height: 100dvh;
		background: linear-gradient(180deg, rgba(16, 32, 25, 0.99), rgba(10, 20, 16, 0.995));
		color: var(--text);
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		outline: none;
	}

	header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 16px 24px;
		padding: max(20px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) 16px
			max(24px, env(safe-area-inset-left));
		border-bottom: 1px solid var(--line);
	}

	.eyebrow {
		margin: 0 0 4px;
		font-size: 0.68rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #9fe0b8;
	}

	h2 {
		margin: 0;
		font:
			bold clamp(28px, 4vw, 42px) Georgia,
			serif;
	}

	.profile {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		flex: 1 1 360px;
	}

	.profile label {
		font-size: 0.8rem;
		color: var(--muted);
	}

	.profile-actions,
	.file-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	button,
	select,
	input {
		font: inherit;
		color: var(--text);
	}

	header button,
	.toolbar button,
	select,
	.search,
	.rename,
	.dialog button,
	.capture-actions button,
	.toast button {
		min-height: 40px;
		padding: 0 12px;
		border-radius: 9px;
		border: 1px solid rgba(234, 246, 255, 0.22);
		background: var(--panel);
		cursor: pointer;
	}

	select {
		min-width: 14rem;
		max-width: 100%;
	}

	button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	button:focus-visible,
	select:focus-visible,
	input:focus-visible {
		outline: 2px solid #9fe8ff;
		outline-offset: 2px;
	}

	.done,
	.dialog .primary {
		background: rgba(57, 211, 83, 0.88);
		border-color: rgba(57, 211, 83, 0.95);
		color: #04121f;
		font-weight: 700;
	}

	.dialog .danger {
		background: rgba(255, 107, 107, 0.9);
		border-color: var(--clash);
	}

	.menu-wrap {
		position: relative;
	}

	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 4px);
		z-index: 5;
		display: grid;
		min-width: 11rem;
		padding: 6px;
		gap: 4px;
		border-radius: 10px;
		background: #10201a;
		border: 1px solid var(--line);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
	}

	.hidden-file {
		display: none;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 12px max(24px, env(safe-area-inset-right)) 12px max(24px, env(safe-area-inset-left));
		border-bottom: 1px solid var(--line);
	}

	.search {
		flex: 1 1 16rem;
		max-width: 26rem;
		cursor: text;
	}

	.find.waiting,
	.cap.waiting {
		border-color: #9fe8ff !important;
		background: rgba(159, 232, 255, 0.16) !important;
		animation: pulse 1s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			box-shadow: 0 0 0 4px rgba(159, 232, 255, 0.18);
		}
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 4px 4px 10px;
		border-radius: 99px;
		background: rgba(159, 232, 255, 0.14);
		font-size: 0.85rem;
	}

	.chip button {
		min-height: 28px;
		padding: 0 8px;
	}

	.conflict-summary {
		margin-left: auto;
		border-color: var(--clash) !important;
		background: rgba(255, 107, 107, 0.16) !important;
		font-weight: 700;
	}

	.ok-summary {
		margin-left: auto;
		font-size: 0.85rem;
		color: #9fe0b8;
	}

	.notice {
		margin: 12px 24px 0;
		padding: 10px 14px;
		border-radius: 10px;
		background: rgba(255, 196, 92, 0.1);
		border: 1px solid rgba(255, 196, 92, 0.35);
		color: #ffe2a8;
		font-size: 0.86rem;
	}

	.body {
		flex: 1 1 auto;
		display: grid;
		grid-template-columns: clamp(190px, 22vw, 270px) minmax(0, 1fr);
		min-height: 0;
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 20px 14px;
		border-right: 1px solid var(--line);
		overflow: auto;
	}

	nav button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 48px;
		padding: 10px 14px;
		text-align: left;
		border-radius: 9px;
		border: 1px solid rgba(234, 246, 255, 0.18);
		background: var(--panel);
		font:
			bold 16px Georgia,
			serif;
		cursor: pointer;
	}

	nav button:hover {
		border-color: rgba(159, 232, 255, 0.45);
	}

	nav button.active {
		background: rgba(57, 211, 83, 0.18);
		border-color: rgba(94, 224, 138, 0.7);
	}

	/* Let a long section name wrap so its conflict badge always stays inside the button. */
	nav button > span:first-child {
		min-width: 0;
	}

	.badge {
		flex: none;
		padding: 2px 8px;
		border-radius: 99px;
		background: var(--clash) !important;
		color: #1a0505 !important;
		font:
			700 12px system-ui,
			sans-serif;
	}

	.content {
		overflow: auto;
		padding: clamp(16px, 3vw, 36px);
		padding-bottom: max(32px, env(safe-area-inset-bottom));
	}

	.content h3 {
		margin: 0 0 12px;
		font:
			bold 22px Georgia,
			serif;
	}

	.capture-bar {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 16px;
		margin: -4px 0 16px;
		padding: 10px 14px;
		border-radius: 10px;
		background: #133246;
		border: 1px solid #9fe8ff;
	}

	.capture-actions {
		display: flex;
		gap: 6px;
		margin-left: auto;
	}

	.refused {
		flex-basis: 100%;
		color: #ffd0d0;
		font-weight: 600;
	}

	.rows {
		max-width: 980px;
		display: grid;
		gap: 6px;
	}

	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 10rem 10rem 2.5rem;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 10px;
		background: rgba(6, 16, 12, 0.45);
		border: 1px solid rgba(164, 214, 186, 0.12);
	}

	.row.head {
		background: none;
		border: none;
		padding-block: 0;
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.row.clash {
		border-color: rgba(255, 107, 107, 0.55);
		background: rgba(255, 107, 107, 0.07);
	}

	.row.fixed {
		opacity: 0.75;
	}

	:global(.row.flash) {
		animation: flash 1.2s ease-out;
	}

	@keyframes flash {
		0% {
			box-shadow: 0 0 0 3px #9fe8ff;
		}
	}

	.label {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.name {
		font-weight: 650;
	}

	.description {
		font-size: 0.8rem;
		color: var(--muted);
	}

	.changed-dot,
	.where {
		margin-left: 6px;
		padding: 1px 7px;
		border-radius: 99px;
		font-size: 0.7rem;
		font-weight: 600;
		vertical-align: 1px;
	}

	.changed-dot {
		background: rgba(179, 139, 75, 0.3);
		color: #f3dcae;
	}

	.where {
		background: rgba(159, 232, 255, 0.12);
		color: #cfefff;
	}

	.clash-note {
		font-size: 0.82rem;
		color: #ffd0d0;
	}

	.link {
		padding: 0;
		border: none;
		background: none;
		color: #9fe8ff;
		text-decoration: underline;
		cursor: pointer;
	}

	.cap {
		width: 100%;
		min-height: 42px;
		padding: 0 10px;
		border-radius: 8px;
		border: 1px solid rgba(234, 246, 255, 0.28);
		border-bottom-width: 3px;
		background: rgba(20, 38, 30, 0.9);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cap:hover:not(:disabled) {
		border-color: rgba(159, 232, 255, 0.6);
	}

	.cap.empty {
		color: rgba(234, 246, 255, 0.45) !important;
		font-weight: 500;
		border-style: dashed !important;
	}

	.cap.conflict {
		border-color: var(--clash) !important;
		background: rgba(255, 107, 107, 0.18) !important;
		color: #ffe1e1 !important;
	}

	.cap.warn {
		border-color: var(--warn) !important;
	}

	.cap.locked {
		opacity: 0.7;
		cursor: default;
	}

	.cap.static {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		box-sizing: border-box;
		font-size: 0.8rem;
	}

	.reset {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 1px solid rgba(234, 246, 255, 0.22);
		background: var(--panel);
		font-size: 1.1rem;
		cursor: pointer;
	}

	.empty {
		color: var(--muted);
	}

	.keyboard-wrap {
		max-width: 980px;
		margin-top: 28px;
	}

	.keyboard {
		display: grid;
		gap: 4px;
		margin-top: 10px;
		padding: 12px;
		border-radius: 12px;
		background: rgba(6, 16, 12, 0.55);
		border: 1px solid var(--line);
	}

	.krow {
		display: flex;
		gap: 4px;
	}

	.key {
		background: rgba(30, 48, 40, 0.6) !important;
		box-shadow: none !important;
		flex: 1 1 0;
		min-width: 0;
		height: 38px;
		padding: 0 2px;
		border-radius: 6px;
		border: 1px solid rgba(234, 246, 255, 0.14);
		background: rgba(30, 48, 40, 0.6);
		color: rgba(234, 246, 255, 0.55);
		font-size: 0.72rem;
		overflow: hidden;
		white-space: nowrap;
		cursor: pointer;
	}

	.key.used {
		background: rgba(57, 211, 83, 0.32) !important;
		border-color: rgba(94, 224, 138, 0.8) !important;
		color: #f4fff7 !important;
		font-weight: 700;
	}

	.key.conflict {
		background: rgba(255, 107, 107, 0.4) !important;
		border-color: var(--clash) !important;
		color: #fff !important;
	}

	.key.fixed {
		background: rgba(120, 120, 120, 0.25) !important;
		color: rgba(234, 246, 255, 0.4) !important;
	}

	.key.selected {
		outline: 2px solid #9fe8ff;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
		font-size: 0.78rem;
		color: var(--muted);
	}

	.swatch {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 4px;
		margin-right: -8px;
		vertical-align: -2px;
	}

	.swatch.used {
		background: rgba(57, 211, 83, 0.6);
	}

	.swatch.conflict {
		background: var(--clash);
	}

	.swatch.fixed {
		background: rgba(120, 120, 120, 0.5);
	}

	.toast {
		position: fixed;
		left: 50%;
		bottom: max(20px, env(safe-area-inset-bottom));
		transform: translateX(-50%);
		z-index: 3;
		display: flex;
		align-items: center;
		gap: 12px;
		max-width: min(640px, calc(100vw - 32px));
		padding: 10px 12px 10px 16px;
		border-radius: 12px;
		background: #17352a;
		border: 1px solid rgba(94, 224, 138, 0.55);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
		font-size: 0.9rem;
	}

	.toast.warn {
		border-color: var(--warn);
		background: #3a2e12;
	}

	.drop {
		position: fixed;
		inset: 12px;
		z-index: 4;
		display: grid;
		place-items: center;
		border: 3px dashed #9fe8ff;
		border-radius: 18px;
		background: rgba(11, 23, 18, 0.88);
		font:
			bold 28px Georgia,
			serif;
		pointer-events: none;
	}

	.dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 6;
		display: grid;
		place-items: center;
		padding: 16px;
		background: rgba(4, 10, 8, 0.6);
	}

	.dialog {
		width: min(560px, 100%);
		max-height: calc(100dvh - 32px);
		overflow: auto;
		padding: 22px;
		border-radius: 16px;
		background: #10201a;
		border: 1px solid rgba(179, 139, 75, 0.5);
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
	}

	.dialog.wide {
		width: min(720px, 100%);
	}

	.dialog h3 {
		margin: 0 0 8px;
		font:
			bold 20px Georgia,
			serif;
	}

	.dialog p {
		margin: 0 0 16px;
		color: var(--muted);
	}

	.dialog-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.warn-text {
		color: #ffe2a8 !important;
	}

	.clash-text {
		color: #ffb3b3;
	}

	.load-list {
		display: grid;
		gap: 10px;
		margin: 0 0 18px;
		padding: 0;
		list-style: none;
	}

	.load-list li {
		display: grid;
		gap: 8px;
		padding: 12px;
		border-radius: 10px;
		background: rgba(6, 16, 12, 0.5);
		border: 1px solid var(--line);
	}

	.check {
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}

	.name-field {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--muted);
	}

	.name-field input {
		flex: 1;
		min-height: 36px;
		padding: 0 10px;
		border-radius: 8px;
		border: 1px solid rgba(234, 246, 255, 0.22);
		background: var(--panel);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	@media (max-width: 720px) {
		header {
			padding: 16px;
			gap: 12px;
		}

		.file-actions,
		.profile {
			flex: 1 1 100%;
		}

		.toolbar {
			padding: 10px 16px;
		}

		.body {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr);
		}

		nav {
			flex-direction: row;
			padding: 10px 16px;
			border-right: none;
			border-bottom: 1px solid var(--line);
			overflow-x: auto;
		}

		nav button {
			flex: none;
			min-height: 44px;
			font-size: 14px;
			white-space: nowrap;
		}

		.content {
			padding: 16px;
		}

		.row {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 2.5rem;
			grid-template-areas:
				'label label label'
				'one two reset';
		}

		.row > :nth-child(1) {
			grid-area: label;
		}

		.row > :nth-child(2) {
			grid-area: one;
		}

		.row > :nth-child(3) {
			grid-area: two;
		}

		.row > :nth-child(4) {
			grid-area: reset;
		}

		.row.head {
			display: none;
		}

		.keyboard {
			overflow-x: auto;
		}

		.krow {
			min-width: 640px;
		}
	}
</style>
