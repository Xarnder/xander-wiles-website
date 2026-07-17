<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { GameSettings, TouchControlMode, TouchInput } from '$lib/game/types';

	type MotionPermission = 'prompt' | 'granted' | 'denied' | 'unavailable' | 'insecure';
	type PermissionResult = 'granted' | 'denied';

	interface DeviceOrientationPermissionApi {
		requestPermission?: () => Promise<PermissionResult>;
	}

	interface Props {
		settings: Readonly<GameSettings>;
		active?: boolean;
		initialThrottle?: number;
		onInput: (input: TouchInput) => void;
		onSettings: (settings: Partial<GameSettings>) => void;
		onFire: () => void;
		onTarget: () => void;
		onCamera: () => void;
		onMap: () => void;
		onPause: () => void;
	}

	let {
		settings,
		active = true,
		initialThrottle = 0.55,
		onInput,
		onSettings,
		onFire,
		onTarget,
		onCamera,
		onMap,
		onPause
	}: Props = $props();

	const clamp = (value: number, minimum = -1, maximum = 1): number =>
		Math.max(minimum, Math.min(maximum, value));
	const wrapDegrees = (value: number): number => ((((value + 180) % 360) + 360) % 360) - 180;

	let touchCapable = $state(false);
	let stickX = $state(0);
	let stickY = $state(0);
	let stickPointer: number | null = null;
	let firePointer: number | null = null;
	let firing = $state(false);
	let localThrottle = $state(0.55);
	let permission = $state<MotionPermission>('prompt');
	let permissionMessage = $state('Motion access is required for tilt controls.');
	let tiltPitch = $state(0);
	let tiltRoll = $state(0);
	let latestPitchAxis = 0;
	let latestRollAxis = 0;
	let neutralPitch = 0;
	let neutralRoll = 0;
	let hasOrientationSample = false;
	let listening = false;

	const mode = $derived(settings.touchControlMode);
	const tiltReady = $derived(mode === 'tilt' && permission === 'granted');

	function haptic(duration = 8): void {
		if (!settings.reducedMotion && typeof navigator.vibrate === 'function') {
			navigator.vibrate(duration);
		}
	}

	function setMode(nextMode: TouchControlMode): void {
		if (mode === nextMode) return;
		stopFlightInput();
		onSettings({ touchControlMode: nextMode });
		haptic(10);
	}

	function updateStick(event: PointerEvent): void {
		if (!active || mode !== 'stick') return;
		const element = event.currentTarget as HTMLElement;
		const rect = element.getBoundingClientRect();
		const radius = rect.width * 0.34;
		const rawX = event.clientX - (rect.left + rect.width / 2);
		const rawY = event.clientY - (rect.top + rect.height / 2);
		const magnitude = Math.hypot(rawX, rawY);
		const scale = magnitude > radius ? radius / magnitude : 1;
		stickX = rawX * scale;
		stickY = rawY * scale;
		onInput({ roll: clamp(stickX / radius), pitch: clamp(stickY / radius) });
	}

	function startStick(event: PointerEvent): void {
		if (!active || mode !== 'stick' || stickPointer !== null) return;
		stickPointer = event.pointerId;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		updateStick(event);
	}

	function moveStick(event: PointerEvent): void {
		if (event.pointerId === stickPointer) updateStick(event);
	}

	function releaseStick(event?: PointerEvent): void {
		if (event && event.pointerId !== stickPointer) return;
		stickPointer = null;
		stickX = 0;
		stickY = 0;
		onInput({ pitch: 0, roll: 0 });
	}

	function screenAngle(): number {
		const modernAngle = window.screen.orientation?.angle;
		return typeof modernAngle === 'number' ? modernAngle : window.orientation;
	}

	function remapOrientation(beta: number, gamma: number): [number, number] {
		const angle = ((screenAngle() % 360) + 360) % 360;
		if (angle === 90) return [-gamma, beta];
		if (angle === 270) return [gamma, -beta];
		if (angle === 180) return [-beta, -gamma];
		return [beta, gamma];
	}

	function shapeTilt(delta: number): number {
		const deadZone = 3;
		const magnitude = Math.abs(delta);
		if (magnitude <= deadZone) return 0;
		return clamp((Math.sign(delta) * (magnitude - deadZone)) / (28 - deadZone));
	}

	function handleOrientation(event: DeviceOrientationEvent): void {
		if (permission !== 'granted' || event.beta === null || event.gamma === null) return;
		const [pitchAxis, rollAxis] = remapOrientation(event.beta, event.gamma);
		latestPitchAxis = pitchAxis;
		latestRollAxis = rollAxis;
		if (!hasOrientationSample) {
			neutralPitch = pitchAxis;
			neutralRoll = rollAxis;
			hasOrientationSample = true;
			permissionMessage = 'Tilt enabled. Hold naturally, then calibrate any time.';
		}
		if (!active || mode !== 'tilt') return;

		const targetPitch = shapeTilt(wrapDegrees(pitchAxis - neutralPitch)) * settings.tiltSensitivity;
		const targetRoll = shapeTilt(wrapDegrees(rollAxis - neutralRoll)) * settings.tiltSensitivity;
		const smoothing = settings.reducedMotion ? 0.4 : 0.22;
		tiltPitch += (clamp(targetPitch) - tiltPitch) * smoothing;
		tiltRoll += (clamp(targetRoll) - tiltRoll) * smoothing;
		onInput({ pitch: tiltPitch, roll: tiltRoll });
	}

	function beginOrientationListening(): void {
		if (listening) return;
		window.addEventListener('deviceorientation', handleOrientation);
		listening = true;
	}

	async function enableTilt(): Promise<void> {
		if (!active) return;
		if (!window.isSecureContext) {
			permission = 'insecure';
			permissionMessage = 'Tilt needs a secure HTTPS connection. Stick controls remain available.';
			return;
		}
		if (typeof DeviceOrientationEvent === 'undefined') {
			permission = 'unavailable';
			permissionMessage = 'Motion sensors are unavailable here. Use the flight stick instead.';
			return;
		}

		const orientationApi = DeviceOrientationEvent as typeof DeviceOrientationEvent &
			DeviceOrientationPermissionApi;
		try {
			const result = orientationApi.requestPermission
				? await orientationApi.requestPermission()
				: 'granted';
			permission = result;
			if (result === 'granted') {
				permissionMessage = 'Tilt enabled. Move the device, then calibrate your neutral position.';
				hasOrientationSample = false;
				beginOrientationListening();
				haptic(12);
			} else {
				permissionMessage = 'Motion access was denied. You can switch back to the flight stick.';
			}
		} catch {
			permission = 'denied';
			permissionMessage = 'Motion access could not be enabled. Stick controls are still available.';
		}
	}

	function calibrate(): void {
		if (!hasOrientationSample) {
			permissionMessage = 'Move the device once, then calibrate.';
			return;
		}
		neutralPitch = latestPitchAxis;
		neutralRoll = latestRollAxis;
		tiltPitch = 0;
		tiltRoll = 0;
		onInput({ pitch: 0, roll: 0 });
		permissionMessage = 'Neutral orientation calibrated.';
		haptic(8);
	}

	function updateThrottle(event: Event): void {
		if (!active) return;
		localThrottle = Number((event.currentTarget as HTMLInputElement).value);
		onInput({ throttle: localThrottle, afterburner: localThrottle >= 0.92 });
	}

	function fireStart(event: PointerEvent): void {
		if (!active || firePointer !== null) return;
		event.preventDefault();
		firePointer = event.pointerId;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		firing = true;
		onInput({ fire: true });
		onFire();
		haptic(14);
	}

	function fireEnd(event?: PointerEvent): void {
		if (event && firePointer !== null && event.pointerId !== firePointer) return;
		firePointer = null;
		if (!firing) return;
		firing = false;
		onInput({ fire: false });
	}

	function stopFlightInput(): void {
		releaseStick();
		fireEnd();
		tiltPitch = 0;
		tiltRoll = 0;
		onInput({ pitch: 0, roll: 0, fire: false });
	}

	function runAction(action: () => void): void {
		if (!active) return;
		action();
		haptic(7);
	}

	function handleBlur(): void {
		stopFlightInput();
	}

	function handleVisibility(): void {
		if (document.hidden) stopFlightInput();
	}

	onMount(() => {
		touchCapable = navigator.maxTouchPoints > 0;
		localThrottle = clamp(initialThrottle, 0, 1);
		if (!window.isSecureContext) {
			permission = 'insecure';
			permissionMessage = 'Tilt needs a secure HTTPS connection. Stick controls remain available.';
		} else if (typeof DeviceOrientationEvent === 'undefined') {
			permission = 'unavailable';
			permissionMessage = 'Motion sensors are unavailable here. Use the flight stick instead.';
		}
	});

	onDestroy(() => {
		if (listening) window.removeEventListener('deviceorientation', handleOrientation);
		stopFlightInput();
	});
</script>

<svelte:window onblur={handleBlur} />
<svelte:document onvisibilitychange={handleVisibility} />

<div
	class={['touch-controls', { 'touch-capable': touchCapable, inactive: !active }]}
	aria-label="Touch flight controls"
	aria-hidden={!active}
	inert={!active}
>
	<div class="top-controls">
		<div class="mode-switch" aria-label="Touch control mode">
			<button
				type="button"
				class:active={mode === 'stick'}
				aria-pressed={mode === 'stick'}
				onclick={() => setMode('stick')}>STICK</button
			>
			<button
				type="button"
				class:active={mode === 'tilt'}
				aria-pressed={mode === 'tilt'}
				onclick={() => setMode('tilt')}>TILT</button
			>
		</div>
		<div class="top-actions">
			<button type="button" onclick={() => runAction(onMap)}>MAP</button>
			<button type="button" onclick={() => runAction(onPause)}>PAUSE</button>
		</div>
	</div>

	{#if mode === 'tilt'}
		<div class="tilt-panel">
			<div
				class="horizon"
				style:--tilt-x={`${tiltRoll * 18}px`}
				style:--tilt-y={`${tiltPitch * 14}px`}
				style:--tilt-angle={`${tiltRoll * 24}deg`}
				aria-hidden="true"
			>
				<span class="horizon-line"></span>
				<span class="aircraft">⌃</span>
			</div>
			<div class="tilt-copy">
				<strong>{tiltReady ? 'TILT ACTIVE' : 'TILT CONTROL'}</strong>
				<span role="status">{permissionMessage}</span>
			</div>
			{#if permission !== 'granted'}
				<button class="enable-tilt" type="button" onclick={enableTilt}>ENABLE TILT</button>
			{:else}
				<button class="calibrate" type="button" onclick={calibrate}>CALIBRATE</button>
			{/if}
		</div>
	{/if}

	<div class="bottom-controls">
		<div class="flight-cluster">
			{#if mode === 'stick'}
				<div
					class="stick"
					role="application"
					aria-label="Flight stick. Vertical controls pitch; horizontal controls roll."
					onpointerdown={startStick}
					onpointermove={moveStick}
					onpointerup={releaseStick}
					onpointercancel={releaseStick}
					onlostpointercapture={releaseStick}
				>
					<span class="axis horizontal" aria-hidden="true"></span>
					<span class="axis vertical" aria-hidden="true"></span>
					<span class="axis-label pitch-label">PITCH</span>
					<span class="axis-label roll-label">ROLL</span>
					<div class="knob" style:transform={`translate(${stickX}px, ${stickY}px)`}>
						<i></i>
					</div>
				</div>
			{:else}
				<div class="tilt-spacer" aria-hidden="true">
					<span>BANK DEVICE</span>
					<small>FOR ROLL</small>
				</div>
			{/if}
		</div>

		<label class="throttle">
			<span class:engaged={localThrottle >= 0.92}>AFTERBURNER</span>
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				value={localThrottle}
				aria-label="Throttle. Top engages afterburner."
				oninput={updateThrottle}
			/>
			<output>{Math.round(localThrottle * 100)}%</output>
			<span>IDLE</span>
		</label>

		<div class="action-cluster">
			<div class="utility-row">
				<button type="button" onclick={() => runAction(onTarget)}>TARGET</button>
				<button type="button" onclick={() => runAction(onCamera)}>CAMERA</button>
			</div>
			<button
				type="button"
				class={['fire', { firing }]}
				aria-label="Fire missile"
				onpointerdown={fireStart}
				onpointerup={fireEnd}
				onpointercancel={fireEnd}
				onlostpointercapture={fireEnd}
			>
				<span>FIRE</span>
				<small>MISSILE</small>
			</button>
		</div>
	</div>

	<p class="portrait-hint">Landscape recommended for the best flight control layout</p>
</div>

<style>
	.touch-controls {
		position: absolute;
		z-index: 16;
		inset: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		padding: max(0.65rem, env(safe-area-inset-top)) max(0.7rem, env(safe-area-inset-right))
			max(0.7rem, env(safe-area-inset-bottom)) max(0.7rem, env(safe-area-inset-left));
		pointer-events: none;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
		transition: opacity 120ms ease;
	}

	.touch-controls.inactive {
		visibility: hidden;
		opacity: 0;
	}

	.top-controls,
	.bottom-controls,
	.tilt-panel {
		pointer-events: auto;
	}

	.top-controls {
		display: flex;
		align-items: start;
		justify-content: space-between;
	}

	.mode-switch,
	.top-actions,
	.utility-row {
		display: flex;
		gap: 0.4rem;
	}

	button {
		min-width: 44px;
		min-height: 44px;
		padding: 0.55rem 0.7rem;
		color: #b7eaf2;
		border: 1px solid rgba(112, 218, 235, 0.36);
		background: rgba(4, 23, 32, 0.76);
		font:
			750 0.55rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.08em;
		cursor: pointer;
		backdrop-filter: blur(8px);
		touch-action: none;
	}

	button.active {
		color: #061319;
		border-color: #8ce9f7;
		background: #8ce9f7;
	}

	.bottom-controls {
		display: grid;
		grid-row: 3;
		grid-template-columns: minmax(7rem, 1fr) auto minmax(8rem, 1fr);
		align-items: end;
	}

	.flight-cluster {
		justify-self: start;
	}

	.stick {
		position: relative;
		display: grid;
		width: clamp(7.4rem, 22vw, 10rem);
		aspect-ratio: 1;
		place-items: center;
		border: 1px solid rgba(121, 223, 239, 0.32);
		border-radius: 50%;
		background:
			radial-gradient(circle, rgba(9, 37, 47, 0.42) 0 22%, transparent 23%),
			radial-gradient(circle, rgba(4, 20, 29, 0.7), rgba(3, 14, 22, 0.42));
		box-shadow: inset 0 0 30px rgba(98, 211, 230, 0.08);
		touch-action: none;
	}

	.stick::before,
	.stick::after {
		position: absolute;
		inset: 13%;
		content: '';
		border: 1px dashed rgba(116, 218, 235, 0.2);
		border-radius: 50%;
	}

	.stick::after {
		inset: 39%;
		border-style: solid;
	}

	.axis {
		position: absolute;
		background: rgba(107, 210, 227, 0.2);
	}

	.horizontal {
		right: 8%;
		left: 8%;
		height: 1px;
	}

	.vertical {
		top: 8%;
		bottom: 8%;
		width: 1px;
	}

	.axis-label {
		position: absolute;
		color: rgba(173, 226, 234, 0.52);
		font:
			700 0.42rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
	}

	.pitch-label {
		top: 0.8rem;
	}

	.roll-label {
		right: 0.5rem;
		transform: rotate(90deg);
	}

	.knob {
		position: relative;
		z-index: 1;
		display: grid;
		width: 2.7rem;
		aspect-ratio: 1;
		place-items: center;
		border: 1px solid rgba(139, 233, 247, 0.75);
		border-radius: 50%;
		background: rgba(10, 48, 59, 0.92);
		box-shadow: 0 0 18px rgba(90, 215, 235, 0.26);
	}

	.knob i {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
		background: #c7f7ff;
		box-shadow: 0 0 8px #80ddeb;
	}

	.tilt-panel {
		align-self: start;
		justify-self: center;
		display: grid;
		grid-template-columns: auto minmax(9rem, 15rem) auto;
		gap: 0.65rem;
		align-items: center;
		max-width: calc(100vw - 10rem);
		padding: 0.45rem 0.6rem;
		border: 1px solid rgba(103, 215, 233, 0.22);
		background: rgba(2, 16, 24, 0.68);
		backdrop-filter: blur(8px);
	}

	.horizon {
		position: relative;
		width: 3.4rem;
		height: 2.2rem;
		overflow: hidden;
		border: 1px solid rgba(120, 225, 241, 0.38);
		border-radius: 50%;
		background: linear-gradient(#185166 50%, #382c22 50%);
	}

	.horizon-line {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 5rem;
		height: 1px;
		background: #e7faff;
		transform: translate(calc(-50% + var(--tilt-x)), calc(-50% + var(--tilt-y)))
			rotate(var(--tilt-angle));
	}

	.aircraft {
		position: absolute;
		top: 50%;
		left: 50%;
		color: #ffb279;
		font-size: 1rem;
		transform: translate(-50%, -42%);
	}

	.tilt-copy {
		display: grid;
		gap: 0.2rem;
	}

	.tilt-copy strong {
		color: #9beaf6;
		font:
			700 0.55rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.1em;
	}

	.tilt-copy span {
		color: rgba(201, 230, 235, 0.65);
		font-size: 0.58rem;
		line-height: 1.25;
	}

	.enable-tilt {
		color: #07151b;
		border-color: #ffc08d;
		background: #f0a36c;
	}

	.calibrate {
		color: #ffe0c7;
		border-color: rgba(255, 174, 116, 0.55);
	}

	.tilt-spacer {
		display: grid;
		width: clamp(7.4rem, 22vw, 10rem);
		height: 5rem;
		place-content: end start;
		color: rgba(173, 226, 234, 0.48);
		font:
			700 0.52rem/1.35 ui-monospace,
			monospace;
		letter-spacing: 0.1em;
	}

	.tilt-spacer small {
		color: rgba(240, 163, 108, 0.66);
	}

	.throttle {
		display: grid;
		gap: 0.25rem;
		justify-items: center;
		align-self: end;
		color: rgba(184, 224, 231, 0.6);
		font:
			700 0.43rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.06em;
		pointer-events: auto;
	}

	.throttle > span:first-child {
		color: #ff9c62;
	}

	.throttle > span.engaged {
		color: #fff;
		text-shadow: 0 0 8px #ff7d37;
	}

	.throttle input {
		width: 2.6rem;
		height: clamp(7.5rem, 21vh, 10rem);
		margin: 0;
		accent-color: #f29b5e;
		writing-mode: vertical-lr;
		direction: rtl;
		touch-action: none;
	}

	.throttle output {
		color: #ffc093;
		font-size: 0.48rem;
	}

	.action-cluster {
		display: grid;
		gap: 0.55rem;
		justify-self: end;
	}

	.utility-row button {
		width: 4.4rem;
	}

	.fire {
		display: grid;
		justify-self: end;
		width: clamp(5.7rem, 16vw, 7rem);
		aspect-ratio: 1;
		place-content: center;
		padding: 0;
		color: #fff3e9;
		border: 2px solid rgba(247, 140, 77, 0.72);
		border-radius: 50%;
		background:
			radial-gradient(circle, rgba(156, 48, 16, 0.76), rgba(53, 17, 8, 0.82)),
			repeating-conic-gradient(rgba(255, 153, 89, 0.08) 0deg 10deg, transparent 10deg 20deg);
		box-shadow:
			inset 0 0 0 0.35rem rgba(2, 12, 18, 0.75),
			0 0 28px rgba(232, 92, 35, 0.2);
	}

	.fire span {
		font-size: 0.92rem;
	}

	.fire small {
		margin-top: 0.2rem;
		color: rgba(255, 190, 145, 0.75);
		font-size: 0.46rem;
	}

	.fire.firing {
		background: #ed713d;
		transform: scale(0.94);
	}

	.portrait-hint {
		position: absolute;
		top: calc(max(0.65rem, env(safe-area-inset-top)) + 3.2rem);
		left: 50%;
		display: none;
		margin: 0;
		padding: 0.35rem 0.55rem;
		color: rgba(226, 245, 248, 0.72);
		background: rgba(3, 20, 28, 0.58);
		font:
			600 0.5rem/1 ui-monospace,
			monospace;
		pointer-events: none;
		transform: translateX(-50%);
	}

	@media (hover: hover) and (pointer: fine) {
		.touch-controls:not(.touch-capable) {
			display: none;
		}
	}

	@media (orientation: portrait) {
		.portrait-hint {
			display: block;
		}

		.bottom-controls {
			grid-template-columns: minmax(7rem, 1fr) 2.8rem minmax(7rem, 1fr);
		}

		.tilt-panel {
			align-self: center;
			grid-template-columns: auto minmax(7rem, 1fr);
			max-width: min(23rem, calc(100vw - 1.4rem));
		}

		.tilt-panel button {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 440px) {
		.touch-controls {
			padding-right: max(0.4rem, env(safe-area-inset-right));
			padding-left: max(0.4rem, env(safe-area-inset-left));
		}

		.utility-row {
			gap: 0.25rem;
		}

		.utility-row button {
			width: 3.75rem;
			padding-inline: 0.25rem;
			font-size: 0.46rem;
		}
	}

	@media (orientation: landscape) and (max-height: 500px) {
		.touch-controls {
			padding-top: max(0.35rem, env(safe-area-inset-top));
			padding-bottom: max(0.35rem, env(safe-area-inset-bottom));
		}

		.stick,
		.tilt-spacer {
			width: clamp(6.5rem, 22vh, 7.7rem);
		}

		.fire {
			width: clamp(5rem, 20vh, 5.8rem);
		}

		.throttle input {
			height: clamp(6rem, 25vh, 7rem);
		}

		.tilt-panel {
			padding-block: 0.25rem;
		}
	}
</style>
