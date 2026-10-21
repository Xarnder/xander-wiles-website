<script lang="ts">
	import type { OpeningInteractionState } from '$lib/game/building/DoorInteractionController';
	import { onMount } from 'svelte';
	import { touchButton } from '$lib/components/touchButton';
	import type { ThreeScene } from '$lib/game/ThreeScene';
	import type { BuildUiState, HotbarUiState, ToolId } from '$lib/game/building/FoundationTypes';
	import {
		snapKeyForHints,
		snapLabelForHints,
		touchToolActions,
		variantControl
	} from '$lib/components/touchToolActions';

	// Bundled SVG icons from assets/SVGs
	import jumpIcon from '$lib/assets/icons/jump.svg';
	import runIcon from '$lib/assets/icons/run.svg';
	import hexPlaceIcon from '$lib/assets/icons/hex-place.svg';
	import breakIcon from '$lib/assets/icons/break.svg';
	import paintIcon from '$lib/assets/icons/paint.svg';
	import magnetIcon from '$lib/assets/icons/magnet.svg';
	import spannerIcon from '$lib/assets/icons/spanner.svg';
	import editIcon from '$lib/assets/icons/edit.svg';
	import crossIcon from '$lib/assets/icons/cross.svg';
	import rotateHIcon from '$lib/assets/icons/rotate-horiznontal.svg';
	import handPointIcon from '$lib/assets/icons/hand-point.svg';
	import pauseIcon from '$lib/assets/icons/pause.svg';
	import openDoorIcon from '$lib/assets/icons/open.svg';
	import musicIcon from '$lib/assets/icons/music.svg';

	interface Props {
		scene: ThreeScene | undefined;
		buildHud: BuildUiState | null;
		hotbar: HotbarUiState | null;
		lookedAtDoorId: string | null;
		lookedAtOpening?: OpeningInteractionState | null;
		customizeToolId: ToolId | undefined;
		heightToolId: ToolId | undefined;
		onOpenPause: () => void;
		onOpenHelp: () => void;
	}

	const {
		scene,
		buildHud,
		hotbar,
		lookedAtDoorId,
		lookedAtOpening = null,
		customizeToolId,
		heightToolId,
		onOpenPause,
		onOpenHelp
	}: Props = $props();

	// --- Virtual Joystick Movement State ---
	let joystickActive = $state(false);
	let joystickPointerId = $state<number | null>(null);
	let joystickKnobX = $state(0);
	let joystickKnobY = $state(0);
	let joystickBaseEl = $state<HTMLDivElement | undefined>(undefined);
	let topBarEl = $state<HTMLElement | undefined>(undefined);
	let movementEl = $state<HTMLElement | undefined>(undefined);
	let actionsEl = $state<HTMLElement | undefined>(undefined);

	/** Publishes the touch bars' size so the hotbar, floor selector, and HUD stay in the gap. */
	$effect(() => {
		const top = topBarEl;
		const movement = movementEl;
		const actions = actionsEl;
		if (!top || !movement || !actions) return;
		const shell = top.closest('.game-shell');
		if (!(shell instanceof HTMLElement)) return;
		const publish = () => {
			const shellBox = shell.getBoundingClientRect();
			const topBox = top.getBoundingClientRect();
			const movementBox = movement.getBoundingClientRect();
			const actionsBox = actions.getBoundingClientRect();
			const dockTop = Math.min(movementBox.top, actionsBox.top);
			shell.style.setProperty('--touch-top-height', `${Math.ceil(topBox.bottom - shellBox.top)}px`);
			shell.style.setProperty('--touch-dock-height', `${Math.ceil(shellBox.bottom - dockTop)}px`);
			shell.style.setProperty('--touch-move-width', `${Math.ceil(movementBox.width)}px`);
		};
		publish();
		const observer = new ResizeObserver(publish);
		observer.observe(top);
		observer.observe(movement);
		observer.observe(actions);
		window.addEventListener('resize', publish);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', publish);
			shell.style.removeProperty('--touch-top-height');
			shell.style.removeProperty('--touch-dock-height');
			shell.style.removeProperty('--touch-move-width');
		};
	});
	const JOYSTICK_RADIUS = 48; // Max thumb knob travel in pixels

	// Sprint state
	let sprintToggled = $state(false);

	// --- Look Swipe State ---
	let lookActive = $state(false);
	let lookPointerId = $state<number | null>(null);
	let lastLookX = $state(0);
	let lastLookY = $state(0);

	function handleJoystickPointerDown(event: PointerEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (joystickPointerId !== null) return;

		joystickPointerId = event.pointerId;
		joystickActive = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		updateJoystickPosition(event.clientX, event.clientY);
	}

	function handleJoystickPointerMove(event: PointerEvent) {
		if (event.pointerId !== joystickPointerId || !joystickActive) return;
		event.preventDefault();
		updateJoystickPosition(event.clientX, event.clientY);
	}

	function handleJoystickPointerUp(event: PointerEvent) {
		if (event.pointerId !== joystickPointerId) return;
		event.preventDefault();
		resetJoystick();
	}

	function resetJoystick() {
		const pointerId = joystickPointerId;
		joystickActive = false;
		joystickPointerId = null;
		joystickKnobX = 0;
		joystickKnobY = 0;
		scene?.setTouchMovement(0, 0);
		if (pointerId !== null && joystickBaseEl?.hasPointerCapture(pointerId)) {
			joystickBaseEl.releasePointerCapture(pointerId);
		}
	}

	function resetTouchInput() {
		resetJoystick();
		lookActive = false;
		lookPointerId = null;
		sprintToggled = false;
		scene?.setTouchRunning(false);
	}

	onMount(() => {
		// Capture phase also sees releases over UI that stops event propagation.
		const releasePointer = (event: PointerEvent) => {
			if (event.pointerId === joystickPointerId) resetJoystick();
			if (event.pointerId === lookPointerId) {
				lookActive = false;
				lookPointerId = null;
			}
		};
		const visibilityChanged = () => {
			if (document.hidden) resetTouchInput();
		};
		// Safari can interrupt pointer delivery for native gestures. Once every
		// finger is lifted, no virtual control should retain an active pointer.
		const releaseTouches = (event: TouchEvent) => {
			if (event.touches.length === 0) {
				resetJoystick();
				lookActive = false;
				lookPointerId = null;
			}
		};
		window.addEventListener('pointerup', releasePointer, true);
		window.addEventListener('pointercancel', releasePointer, true);
		window.addEventListener('touchend', releaseTouches, true);
		window.addEventListener('touchcancel', releaseTouches, true);
		window.addEventListener('blur', resetTouchInput);
		window.addEventListener('pagehide', resetTouchInput);
		document.addEventListener('visibilitychange', visibilityChanged);
		return () => {
			window.removeEventListener('pointerup', releasePointer, true);
			window.removeEventListener('pointercancel', releasePointer, true);
			window.removeEventListener('touchend', releaseTouches, true);
			window.removeEventListener('touchcancel', releaseTouches, true);
			window.removeEventListener('blur', resetTouchInput);
			window.removeEventListener('pagehide', resetTouchInput);
			document.removeEventListener('visibilitychange', visibilityChanged);
			resetTouchInput();
		};
	});

	function updateJoystickPosition(clientX: number, clientY: number) {
		if (!joystickBaseEl) return;
		const rect = joystickBaseEl.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;

		let dx = clientX - centerX;
		let dy = clientY - centerY;
		const dist = Math.hypot(dx, dy);

		const maxTravel = rect.width > 0 ? (rect.width / 2) * 0.8 : JOYSTICK_RADIUS;

		if (dist > maxTravel) {
			dx = (dx / dist) * maxTravel;
			dy = (dy / dist) * maxTravel;
		}

		joystickKnobX = dx;
		joystickKnobY = dy;

		// Normalize to -1..1 (dy is inverted because moving up is forward)
		const moveX = dx / maxTravel;
		const moveZ = -dy / maxTravel;
		scene?.setTouchMovement(moveX, moveZ);
	}

	function toggleSprint() {
		sprintToggled = !sprintToggled;
		scene?.setTouchRunning(sprintToggled);
	}

	function triggerJump() {
		scene?.triggerTouchJump();
	}

	// --- Look Area Pointer Handling ---
	function handleLookPointerDown(event: PointerEvent) {
		// Only capture if target is the look surface itself
		if (event.target !== event.currentTarget) return;
		if (lookPointerId !== null) return;

		event.preventDefault();
		lookPointerId = event.pointerId;
		lookActive = true;
		lastLookX = event.clientX;
		lastLookY = event.clientY;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function handleLookPointerMove(event: PointerEvent) {
		if (event.pointerId !== lookPointerId || !lookActive) return;
		event.preventDefault();

		const deltaX = event.clientX - lastLookX;
		const deltaY = event.clientY - lastLookY;
		lastLookX = event.clientX;
		lastLookY = event.clientY;

		scene?.addTouchLook(deltaX, deltaY);
	}

	function handleLookPointerUp(event: PointerEvent) {
		if (event.pointerId !== lookPointerId) return;
		event.preventDefault();
		lookActive = false;
		lookPointerId = null;
	}

	const hintLines = $derived(buildHud?.hintLines ?? []);

	/** Roof rise, stair direction, skirting offset, object copy, music pitch, and the other tool-only keys. */
	const extraActions = $derived(
		touchToolActions(hintLines, {
			canFinishOpenPath: buildHud?.canFinishOpenPath === true,
			toolId: buildHud?.toolId
		})
	);

	const variant = $derived(variantControl(hintLines));
	const snapLabel = $derived(snapLabelForHints(hintLines));
	const editingRoofFootprint = $derived(
		buildHud?.toolId === 'flat-roof' && hintLines.some((line) => line.startsWith('E: '))
	);

	// Actions
	function onPrimaryAction() {
		scene?.triggerPrimaryAction();
	}

	function onSecondaryAction() {
		scene?.triggerSecondaryAction();
	}

	function onUndo() {
		scene?.simulateKey('Minus');
	}

	function onCycleVariant() {
		if (variant.roofShape) scene?.simulateKey('KeyV');
		else scene?.cycleSlotVariant(1);
	}

	function onToggleSnap() {
		scene?.simulateKey(snapKeyForHints(hintLines));
	}

	function onRotate() {
		scene?.simulateKey('KeyR');
	}

	function onCustomise() {
		scene?.simulateKey('KeyE');
	}

	function onToggleDoor() {
		scene?.toggleLookedAtDoor();
	}

	function onToggleBuildMode() {
		scene?.toggleBuildMode();
	}

	function onToggleRemove() {
		scene?.toggleRemoveMode();
	}

	function onTogglePaint() {
		scene?.togglePaintMode();
	}

	function onToggleMove() {
		scene?.toggleMoveMode();
	}

	function onToggleMusic() {
		scene?.toggleMusicMode();
	}

	const isDoorOpen = $derived.by(() => {
		if (!lookedAtDoorId || !scene) return false;
		return lookedAtOpening?.id === lookedAtDoorId
			? lookedAtOpening.open
			: scene.isDoorOpen(lookedAtDoorId);
	});
	const openingNoun = $derived(
		lookedAtOpening?.id === lookedAtDoorId && lookedAtOpening?.kind === 'shutters'
			? 'shutters'
			: 'door'
	);
</script>

<div
	class="touch-controls-layer"
	data-testid="touch-controls"
	role="group"
	aria-label="Touch game controls"
	oncontextmenu={(event) => {
		event.preventDefault();
		resetTouchInput();
	}}
>
	<!-- Look swipe surface covering right half of screen -->
	<div
		class="touch-look-zone"
		data-testid="touch-look-zone"
		role="region"
		aria-label="Swipe to look"
		onpointerdown={handleLookPointerDown}
		onpointermove={handleLookPointerMove}
		onpointerup={handleLookPointerUp}
		onpointercancel={handleLookPointerUp}
		onlostpointercapture={handleLookPointerUp}
	></div>

	<!-- Top Bar Controls -->
	<header class="touch-top-bar" bind:this={topBarEl}>
		<div class="touch-mode-buttons">
			<button
				type="button"
				class="touch-mode-btn"
				class:active={hotbar?.buildModeActive && hotbar?.globalMode === 'none'}
				use:touchButton={onToggleBuildMode}
				data-testid="touch-build-toggle"
				aria-label="Toggle Build Mode"
			>
				<img class="touch-icon" src={hexPlaceIcon} alt="" />
				<span>Build</span>
			</button>

			<button
				type="button"
				class="touch-mode-btn danger"
				class:active={hotbar?.globalMode === 'remove'}
				use:touchButton={onToggleRemove}
				data-testid="touch-remove-toggle"
				aria-label="Toggle Remove Mode"
			>
				<img class="touch-icon" src={breakIcon} alt="" />
				<span>Remove</span>
			</button>

			<button
				type="button"
				class="touch-mode-btn"
				class:active={hotbar?.globalMode === 'paint'}
				use:touchButton={onTogglePaint}
				data-testid="touch-paint-toggle"
				aria-label="Toggle Paint Mode"
			>
				<img class="touch-icon" src={paintIcon} alt="" />
				<span>Paint</span>
			</button>

			<button
				type="button"
				class="touch-mode-btn"
				class:active={hotbar?.globalMode === 'move'}
				use:touchButton={onToggleMove}
				data-testid="touch-move-toggle"
				aria-label="Toggle Move Mode"
			>
				<img class="touch-icon" src={handPointIcon} alt="" />
				<span>Move</span>
			</button>

			<button
				type="button"
				class="touch-mode-btn music"
				class:active={hotbar?.globalMode === 'music'}
				use:touchButton={onToggleMusic}
				data-testid="touch-music-toggle"
				aria-label="Toggle Music Mode"
			>
				<img class="touch-icon" src={musicIcon} alt="" />
				<span>Music</span>
			</button>
		</div>

		<div class="touch-top-utility">
			<button
				type="button"
				class="touch-util-btn"
				use:touchButton={onOpenHelp}
				data-testid="touch-help-btn"
				aria-label="Help"
			>
				<span>Help</span>
			</button>
			<button
				type="button"
				class="touch-util-btn"
				use:touchButton={onOpenPause}
				data-testid="touch-pause-btn"
				aria-label="Pause Game"
			>
				<img class="touch-icon" src={pauseIcon} alt="" />
				<span>Pause</span>
			</button>
		</div>
	</header>

	<!-- Contextual opening action for doors and window shutters -->
	{#if lookedAtDoorId}
		<div class="touch-door-bar">
			<button
				type="button"
				class="touch-door-btn"
				use:touchButton={onToggleDoor}
				onpointerdown={(e) => e.stopPropagation()}
				data-testid="touch-door-button"
				aria-label={`${isDoorOpen ? 'Close' : 'Open'} ${openingNoun}`}
			>
				<img class="touch-icon" src={openDoorIcon} alt="" />
				<span
					>{isDoorOpen ? 'Close' : 'Open'} {openingNoun === 'shutters' ? 'Shutters' : 'Door'}</span
				>
			</button>
		</div>
	{/if}

	<!-- Bottom Left: Virtual Joystick -->
	<div class="touch-movement-cluster" bind:this={movementEl}>
		<div
			class="touch-joystick-base"
			bind:this={joystickBaseEl}
			data-testid="touch-joystick"
			role="slider"
			aria-label="Movement joystick"
			aria-valuenow={0}
			tabindex={-1}
			onpointerdown={handleJoystickPointerDown}
			onpointermove={handleJoystickPointerMove}
			onpointerup={handleJoystickPointerUp}
			onpointercancel={handleJoystickPointerUp}
			onlostpointercapture={handleJoystickPointerUp}
		>
			<div
				class="touch-joystick-knob"
				class:active={joystickActive}
				style={`transform: translate(${joystickKnobX}px, ${joystickKnobY}px);`}
			></div>
		</div>
	</div>

	<!-- Bottom Right: Building and Locomotion Buttons -->
	<div class="touch-actions-cluster" bind:this={actionsEl}>
		<!-- Tool-only actions: roof rise and shape, stair direction, fence finish, music, and the rest. -->
		{#if extraActions.length > 0}
			<div class="touch-path-actions" data-testid="touch-tool-actions">
				{#each extraActions as action (action.id)}
					<button
						type="button"
						class="touch-pill-btn"
						class:primary={action.primary}
						use:touchButton={() => scene?.simulateKey(action.code)}
						data-testid={action.testId}
						aria-label={action.aria}
					>
						{action.label}
					</button>
				{/each}
			</div>
		{/if}

		<!-- Also put the opening action under the right thumb -->
		{#if lookedAtDoorId}
			<div class="touch-path-actions">
				<button
					type="button"
					class="touch-pill-btn primary"
					use:touchButton={onToggleDoor}
					onpointerdown={(e) => e.stopPropagation()}
					data-testid="touch-door-cluster-btn"
					aria-label={`${isDoorOpen ? 'Close' : 'Open'} ${openingNoun}`}
				>
					<img class="touch-icon" src={openDoorIcon} alt="" />
					<span
						>{isDoorOpen ? 'Close' : 'Open'}
						{openingNoun === 'shutters' ? 'Shutters' : 'Door'}</span
					>
				</button>
			</div>
		{/if}

		{#if hotbar?.globalMode === 'paint'}
			<button
				type="button"
				class="touch-pill-btn primary"
				use:touchButton={() => scene?.simulateKey('KeyC')}
				data-testid="touch-paint-palette"
				aria-label="Open paint and colour selector"
			>
				<img class="touch-icon" src={paintIcon} alt="" />
				<span>Paint &amp; colour</span>
			</button>
		{/if}

		<!-- Secondary Tool Controls (Rotate, Customise, Snap, Variant, Undo) -->
		<div class="touch-tools-row">
			<button
				type="button"
				class="touch-circle-btn"
				use:touchButton={onUndo}
				data-testid="touch-undo-btn"
				title="Undo last placement"
				aria-label="Undo"
			>
				<span>Undo</span>
			</button>

			<button
				type="button"
				class="touch-circle-btn"
				use:touchButton={onToggleSnap}
				data-testid="touch-snap-btn"
				title={snapLabel === 'Polygon' ? 'Switch to polygon roof drawing' : 'Cycle Snap Mode'}
				aria-label={snapLabel === 'Polygon'
					? 'Switch to polygon roof drawing'
					: snapLabel === 'Mode'
						? 'Cycle path mode'
						: 'Cycle Snap'}
			>
				<img class="touch-icon" src={magnetIcon} alt="" />
				<span>{snapLabel}</span>
			</button>

			<button
				type="button"
				class="touch-circle-btn"
				use:touchButton={onCycleVariant}
				data-testid="touch-variant-btn"
				title={variant.roofShape ? 'Cycle roof shape' : 'Cycle Tool Variant'}
				aria-label={variant.roofShape ? 'Cycle roof shape' : 'Cycle Tool Variant'}
			>
				<img class="touch-icon" src={spannerIcon} alt="" />
				<span>{variant.label}</span>
			</button>

			<button
				type="button"
				class="touch-circle-btn"
				use:touchButton={onRotate}
				data-testid="touch-rotate-btn"
				title="Rotate"
				aria-label="Rotate"
			>
				<img class="touch-icon" src={rotateHIcon} alt="" />
				<span>Rotate</span>
			</button>

			{#if customizeToolId || heightToolId}
				<button
					type="button"
					class="touch-circle-btn highlight"
					use:touchButton={onCustomise}
					data-testid="touch-edit-btn"
					title={editingRoofFootprint ? 'Switch roof footprint mode' : 'Customise piece'}
					aria-label={editingRoofFootprint ? 'Switch roof footprint mode' : 'Customise'}
				>
					<img class="touch-icon" src={editIcon} alt="" />
					<span>{editingRoofFootprint ? 'Mode' : 'Edit'}</span>
				</button>
			{/if}
		</div>

		{#if hotbar?.globalMode === 'remove' && buildHud?.foundationDeleteId}
			<div class="touch-path-actions">
				<button
					type="button"
					class="touch-pill-btn"
					use:touchButton={() => scene?.simulateKey('Delete')}
					data-testid="touch-delete-foundation"
					aria-label="Delete whole foundation"
				>
					Delete foundation
				</button>
			</div>
		{/if}

		<!-- Primary Place & Cancel Buttons -->
		<div class="touch-primary-row">
			<button
				type="button"
				class="touch-main-btn cancel-btn"
				use:touchButton={onSecondaryAction}
				data-testid="touch-cancel-btn"
				aria-label={buildHud?.toolId === 'shovel' ? 'Lower terrain' : 'Cancel or Deselect'}
			>
				<img class="touch-icon" src={crossIcon} alt="" />
				<span>{buildHud?.toolId === 'shovel' ? 'Lower' : 'Cancel'}</span>
			</button>

			<button
				type="button"
				class="touch-main-btn place-btn"
				use:touchButton={onPrimaryAction}
				data-testid="touch-place-btn"
				aria-label={hotbar?.globalMode === 'remove'
					? 'Delete'
					: buildHud?.toolId === 'shovel'
						? 'Raise terrain'
						: 'Place or Confirm'}
			>
				<img
					class="touch-icon"
					src={hotbar?.globalMode === 'remove' ? breakIcon : hexPlaceIcon}
					alt=""
				/>
				<span
					>{hotbar?.globalMode === 'remove'
						? 'Delete'
						: buildHud?.toolId === 'shovel'
							? 'Raise'
							: 'Place'}</span
				>
			</button>
		</div>
		<div class="touch-locomotion-buttons">
			<button
				type="button"
				class="touch-action-btn run-btn"
				class:active={sprintToggled}
				use:touchButton={toggleSprint}
				data-testid="touch-run-btn"
				aria-label="Sprint"
			>
				<img class="touch-icon" src={runIcon} alt="" />
				<span>Run</span>
			</button>

			<button
				type="button"
				class="touch-action-btn jump-btn"
				use:touchButton={triggerJump}
				data-testid="touch-jump-btn"
				aria-label="Jump"
			>
				<img class="touch-icon" src={jumpIcon} alt="" />
				<span>Jump</span>
			</button>
		</div>
	</div>
</div>

<style>
	.touch-controls-layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		z-index: 20;
		touch-action: none;
	}

	/* Look swipe surface covers right half of screen */
	.touch-look-zone {
		position: absolute;
		top: calc(var(--touch-top-height, 60px) + 4px);
		right: 0;
		bottom: calc(var(--touch-dock-height, 120px) + 4px);
		width: 55%;
		pointer-events: auto;
		touch-action: none;
		z-index: 10;
	}

	/* Top Bar */
	.touch-top-bar {
		position: absolute;
		top: 12px;
		left: 14px;
		right: 14px;
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		row-gap: 6px;
		pointer-events: auto;
		z-index: 30;
	}

	.touch-mode-buttons,
	.touch-top-utility {
		display: flex;
		gap: 6px;
	}

	.touch-mode-btn,
	.touch-util-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 42px;
		padding: 6px 12px;
		border-radius: 10px;
		background: rgba(14, 28, 20, 0.78);
		border: 1px solid rgba(234, 246, 255, 0.22);
		color: #eaf6ff;
		font-family: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
		transition:
			background 0.15s ease,
			border-color 0.15s ease,
			transform 0.1s ease;
	}

	.touch-mode-btn:active,
	.touch-util-btn:active {
		transform: scale(0.95);
	}

	.touch-mode-btn.active {
		background: rgba(57, 211, 83, 0.3);
		border-color: rgba(57, 211, 83, 0.7);
		color: #a4f5b9;
	}

	.touch-mode-btn.danger.active {
		background: rgba(220, 60, 60, 0.35);
		border-color: rgba(255, 120, 120, 0.7);
		color: #ffc4c4;
	}

	.touch-mode-btn.music.active {
		background: rgba(179, 136, 255, 0.35);
		border-color: rgba(179, 136, 255, 0.75);
		color: #e2d1ff;
	}

	.touch-icon {
		width: 18px;
		height: 18px;
		filter: brightness(0) invert(1);
		display: block;
	}

	/* Door Hover Button */
	.touch-door-bar {
		position: absolute;
		top: calc(50% + 32px);
		left: 50%;
		transform: translateX(-50%);
		pointer-events: auto;
		z-index: 35;
		animation: snap-badge-in 0.15s ease;
	}

	.touch-door-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 8px 20px;
		border-radius: 999px;
		background: rgba(14, 28, 20, 0.92);
		border: 1.5px solid rgba(57, 211, 83, 0.85);
		color: #eaf6ff;
		font-family: inherit;
		font-size: 0.88rem;
		font-weight: 700;
		cursor: pointer;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		box-shadow:
			0 6px 20px rgba(0, 0, 0, 0.45),
			0 0 16px rgba(57, 211, 83, 0.35);
		transition:
			transform 0.1s ease,
			background 0.15s ease;
		touch-action: manipulation;
		white-space: nowrap;
	}

	.touch-door-btn:active {
		transform: scale(0.94);
		background: rgba(57, 211, 83, 0.35);
		border-color: rgba(57, 211, 83, 1);
	}

	.touch-door-btn .touch-icon {
		width: 20px;
		height: 20px;
		filter: brightness(0) invert(1);
	}

	/* Bottom-Left Movement Area */
	.touch-movement-cluster {
		position: absolute;
		bottom: 24px;
		left: 24px;
		display: flex;
		align-items: flex-end;
		gap: 14px;
		pointer-events: auto;
		z-index: 25;
	}

	.touch-joystick-base {
		width: 120px;
		height: 120px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(20, 44, 32, 0.7) 0%, rgba(10, 22, 16, 0.8) 100%);
		border: 2px solid rgba(159, 232, 255, 0.35);
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		box-shadow:
			0 8px 24px rgba(0, 0, 0, 0.5),
			inset 0 0 14px rgba(0, 0, 0, 0.4);
		touch-action: none;
	}

	.touch-joystick-knob {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		background: radial-gradient(circle at 35% 35%, #57e26f 0%, #2b7740 100%);
		border: 2px solid rgba(255, 255, 255, 0.6);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
		pointer-events: none;
		will-change: transform;
	}

	.touch-joystick-knob.active {
		background: radial-gradient(circle at 35% 35%, #85f59c 0%, #3ca058 100%);
		box-shadow: 0 0 16px rgba(87, 226, 111, 0.7);
	}

	.touch-locomotion-buttons {
		display: flex;
		flex-direction: row;
		gap: 10px;
	}

	.touch-action-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		width: 54px;
		height: 54px;
		border-radius: 50%;
		background: rgba(14, 28, 20, 0.82);
		border: 1px solid rgba(234, 246, 255, 0.3);
		color: #eaf6ff;
		font-family: inherit;
		font-size: 0.7rem;
		font-weight: 700;
		cursor: pointer;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
		transition: transform 0.1s ease;
	}

	.touch-action-btn:active {
		transform: scale(0.92);
	}

	.touch-action-btn.active {
		background: rgba(57, 211, 83, 0.35);
		border-color: rgba(57, 211, 83, 0.8);
		color: #a4f5b9;
	}

	/* Bottom-Right Action Cluster */
	.touch-actions-cluster {
		position: absolute;
		bottom: 24px;
		right: 24px;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 12px;
		pointer-events: auto;
		z-index: 25;
		max-width: calc(
			100vw - var(--touch-move-width, 168px) - 36px - env(safe-area-inset-left) -
				env(safe-area-inset-right)
		);
	}

	.touch-path-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
		max-width: 100%;
	}

	.touch-pill-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 6px 14px;
		border-radius: 999px;
		background: rgba(14, 28, 20, 0.85);
		border: 1px solid rgba(234, 246, 255, 0.3);
		color: #eaf6ff;
		font-family: inherit;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	}

	.touch-pill-btn.primary {
		background: rgba(57, 211, 83, 0.85);
		color: #04121f;
		border-color: rgba(87, 226, 111, 0.9);
	}

	.touch-tools-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
		max-width: 100%;
	}

	.touch-circle-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		width: 50px;
		height: 50px;
		border-radius: 14px;
		background: rgba(14, 28, 20, 0.82);
		border: 1px solid rgba(234, 246, 255, 0.28);
		color: #eaf6ff;
		font-family: inherit;
		font-size: 0.68rem;
		font-weight: 700;
		cursor: pointer;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
		transition: transform 0.1s ease;
	}

	.touch-circle-btn:active {
		transform: scale(0.92);
	}

	.touch-circle-btn.highlight {
		border-color: rgba(159, 232, 255, 0.6);
		color: #9fe8ff;
	}

	.touch-circle-btn .touch-icon {
		width: 16px;
		height: 16px;
	}

	.touch-primary-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 12px;
		align-items: center;
		max-width: 100%;
	}

	.touch-main-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-family: inherit;
		font-weight: 700;
		cursor: pointer;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
		transition:
			transform 0.1s ease,
			filter 0.15s ease;
	}

	.touch-main-btn:active {
		transform: scale(0.94);
	}

	.cancel-btn {
		min-height: 52px;
		padding: 10px 18px;
		border-radius: 16px;
		background: rgba(40, 20, 20, 0.85);
		border: 1px solid rgba(255, 120, 120, 0.45);
		color: #ffc4c4;
		font-size: 0.9rem;
	}

	.place-btn {
		min-height: 64px;
		padding: 12px 26px;
		border-radius: 18px;
		background: linear-gradient(135deg, rgba(57, 211, 83, 0.95) 0%, rgba(35, 160, 58, 0.95) 100%);
		border: 2px solid rgba(135, 245, 158, 0.8);
		color: #04121f;
		font-size: 1.05rem;
		box-shadow:
			0 6px 24px rgba(0, 0, 0, 0.4),
			0 0 20px rgba(57, 211, 83, 0.4);
	}

	.place-btn .touch-icon {
		width: 22px;
		height: 22px;
		filter: brightness(0);
	}

	/* Responsive scaling for small mobile screens */
	@media (max-width: 768px), (max-height: 500px) {
		.touch-top-bar {
			top: max(6px, env(safe-area-inset-top));
			left: max(8px, env(safe-area-inset-left));
			right: max(8px, env(safe-area-inset-right));
			gap: 4px;
		}

		.touch-mode-buttons,
		.touch-top-utility {
			gap: 4px;
		}

		.touch-mode-btn,
		.touch-util-btn {
			min-height: 34px;
			padding: 4px 8px;
			gap: 4px;
			font-size: 0.72rem;
			border-radius: 8px;
		}

		.touch-icon {
			width: 15px;
			height: 15px;
		}

		.touch-door-bar {
			top: calc(50% + 24px);
		}

		.touch-door-btn {
			min-height: 36px;
			padding: 5px 14px;
			font-size: 0.78rem;
			gap: 6px;
		}

		.touch-door-btn .touch-icon {
			width: 16px;
			height: 16px;
		}

		.touch-movement-cluster {
			bottom: max(8px, env(safe-area-inset-bottom));
			left: max(8px, env(safe-area-inset-left));
			gap: 8px;
		}

		.touch-joystick-base {
			width: 92px;
			height: 92px;
		}

		.touch-joystick-knob {
			width: 40px;
			height: 40px;
		}

		.touch-locomotion-buttons {
			gap: 6px;
		}

		.touch-action-btn {
			width: 40px;
			height: 40px;
			font-size: 0.58rem;
			gap: 1px;
		}

		.touch-action-btn .touch-icon {
			width: 14px;
			height: 14px;
		}

		.touch-actions-cluster {
			bottom: max(8px, env(safe-area-inset-bottom));
			right: max(8px, env(safe-area-inset-right));
			gap: 6px;
		}

		.touch-tools-row {
			gap: 4px;
		}

		.touch-circle-btn {
			width: 36px;
			height: 36px;
			border-radius: 10px;
			font-size: 0.56rem;
			gap: 1px;
		}

		.touch-circle-btn .touch-icon {
			width: 13px;
			height: 13px;
		}

		.touch-primary-row {
			gap: 6px;
		}

		.cancel-btn {
			min-height: 40px;
			padding: 6px 12px;
			font-size: 0.78rem;
			border-radius: 12px;
		}

		.place-btn {
			min-height: 46px;
			padding: 8px 16px;
			font-size: 0.85rem;
			border-radius: 14px;
		}

		.place-btn .touch-icon {
			width: 17px;
			height: 17px;
		}

		.touch-pill-btn {
			min-height: 32px;
			padding: 4px 10px;
			font-size: 0.74rem;
			gap: 4px;
		}
	}

	@media (max-width: 520px) {
		.touch-mode-btn span,
		.touch-util-btn span {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
			border: 0;
		}

		.touch-mode-btn,
		.touch-util-btn {
			position: relative;
			justify-content: center;
			min-width: 36px;
			padding: 6px;
		}
	}

	@media (max-width: 440px) {
		.touch-top-bar {
			left: max(4px, env(safe-area-inset-left));
			right: max(4px, env(safe-area-inset-right));
			gap: 3px;
		}

		.touch-mode-buttons,
		.touch-top-utility {
			gap: 3px;
		}

		.touch-mode-btn,
		.touch-util-btn {
			min-height: 32px;
			padding: 3px 5px;
			font-size: 0.65rem;
			gap: 3px;
		}

		.touch-mode-btn .touch-icon,
		.touch-util-btn .touch-icon {
			width: 13px;
			height: 13px;
		}

		.touch-movement-cluster {
			bottom: max(6px, env(safe-area-inset-bottom));
			left: max(6px, env(safe-area-inset-left));
			gap: 6px;
		}

		.touch-joystick-base {
			width: 84px;
			height: 84px;
		}

		.touch-joystick-knob {
			width: 36px;
			height: 36px;
		}

		.touch-action-btn {
			width: 36px;
			height: 36px;
			font-size: 0.52rem;
		}

		.touch-actions-cluster {
			bottom: max(6px, env(safe-area-inset-bottom));
			right: max(6px, env(safe-area-inset-right));
			gap: 5px;
		}

		.touch-circle-btn {
			width: 32px;
			height: 32px;
			border-radius: 8px;
			font-size: 0.5rem;
		}

		.cancel-btn {
			min-height: 36px;
			padding: 4px 8px;
			font-size: 0.72rem;
		}

		.place-btn {
			min-height: 42px;
			padding: 6px 12px;
			font-size: 0.8rem;
		}

		.touch-door-bar {
			top: calc(50% + 28px);
		}

		.touch-door-btn {
			min-height: 38px;
			padding: 5px 14px;
			font-size: 0.8rem;
			gap: 6px;
		}

		.touch-door-btn .touch-icon {
			width: 16px;
			height: 16px;
		}
	}
</style>
