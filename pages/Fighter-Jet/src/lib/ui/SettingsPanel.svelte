<script lang="ts">
	import type {
		ColourBlindMode,
		GameSettings,
		QualityLevel,
		SubtitleSize,
		TouchControlMode
	} from '$lib/game/types';

	type VolumeKey =
		'masterVolume' | 'effectsVolume' | 'engineVolume' | 'musicVolume' | 'radioVolume';

	interface Props {
		settings: Readonly<GameSettings>;
		onUpdate: (partial: Partial<GameSettings>) => void;
		onClose: () => void;
	}

	let { settings, onUpdate, onClose }: Props = $props();

	const volumeChannels = $derived([
		{ key: 'masterVolume', label: 'Master', value: settings.masterVolume },
		{ key: 'effectsVolume', label: 'Effects', value: settings.effectsVolume },
		{ key: 'engineVolume', label: 'Engine', value: settings.engineVolume },
		{ key: 'musicVolume', label: 'Music', value: settings.musicVolume },
		{ key: 'radioVolume', label: 'Radio', value: settings.radioVolume }
	] satisfies Array<{ key: VolumeKey; label: string; value: number }>);

	function update<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
		onUpdate({ [key]: value } as Partial<GameSettings>);
	}

	function rangeValue(event: Event): number {
		return Number((event.currentTarget as HTMLInputElement).value);
	}

	function checked(event: Event): boolean {
		return (event.currentTarget as HTMLInputElement).checked;
	}

	function focusPanel(node: HTMLElement) {
		const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		requestAnimationFrame(() => node.querySelector<HTMLButtonElement>('.close')?.focus());
		return () => previous?.focus();
	}
</script>

<div class="settings-scrim" aria-hidden="true"></div>
<dialog
	open
	class="settings-panel"
	aria-modal="true"
	aria-labelledby="settings-title"
	{@attach focusPanel}
>
	<header>
		<div>
			<p>VIPER FLIGHT COMPUTER</p>
			<h1 id="settings-title">Settings</h1>
		</div>
		<button class="close" type="button" aria-label="Close settings" onclick={onClose}>
			<span aria-hidden="true">×</span>
		</button>
	</header>

	<div class="settings-body">
		<section class="group">
			<div class="group-title">
				<span>01</span>
				<div>
					<p>DISPLAY</p>
					<small>Rendering and motion</small>
				</div>
			</div>

			<div class="field-grid">
				<label class="select-field">
					<span>Quality</span>
					<select
						aria-label="Quality"
						value={settings.quality}
						onchange={(event) =>
							update('quality', (event.currentTarget as HTMLSelectElement).value as QualityLevel)}
					>
						<option value="low">Low</option>
						<option value="medium">Medium</option>
						<option value="high">High</option>
					</select>
				</label>

				<label class="select-field">
					<span>Colour-blind mode</span>
					<select
						value={settings.colourBlindMode}
						onchange={(event) =>
							update(
								'colourBlindMode',
								(event.currentTarget as HTMLSelectElement).value as ColourBlindMode
							)}
					>
						<option value="off">Off</option>
						<option value="deuteranopia">Deuteranopia</option>
						<option value="protanopia">Protanopia</option>
						<option value="tritanopia">Tritanopia</option>
					</select>
				</label>
			</div>

			<label class="range-field">
				<span><b>Camera shake</b><output>{Math.round(settings.screenShake * 100)}%</output></span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={settings.screenShake}
					oninput={(event) => update('screenShake', rangeValue(event))}
				/>
			</label>

			<div class="toggle-grid">
				<label class="toggle">
					<input
						type="checkbox"
						checked={settings.reducedMotion}
						onchange={(event) => update('reducedMotion', checked(event))}
					/>
					<span aria-hidden="true"></span>
					<b>Reduced motion</b>
				</label>
				<label class="toggle">
					<input
						type="checkbox"
						checked={settings.highContrast}
						onchange={(event) => update('highContrast', checked(event))}
					/>
					<span aria-hidden="true"></span>
					<b>High contrast HUD</b>
				</label>
				<label class="toggle">
					<input
						type="checkbox"
						checked={settings.missileCamera}
						onchange={(event) => update('missileCamera', checked(event))}
					/>
					<span aria-hidden="true"></span>
					<b>Cinematic missile camera</b>
				</label>
			</div>
		</section>

		<section class="group">
			<div class="group-title">
				<span>02</span>
				<div>
					<p>FLIGHT ASSISTANCE</p>
					<small>Aircraft response</small>
				</div>
			</div>

			<div class="toggle-grid">
				<label class="toggle">
					<input
						type="checkbox"
						checked={settings.simplifiedFlight}
						onchange={(event) => update('simplifiedFlight', checked(event))}
					/>
					<span aria-hidden="true"></span>
					<b>Simplified flight</b>
				</label>
				<label class="toggle">
					<input
						type="checkbox"
						checked={settings.autoLevel}
						onchange={(event) => update('autoLevel', checked(event))}
					/>
					<span aria-hidden="true"></span>
					<b>Auto level</b>
				</label>
				<label class="toggle">
					<input
						type="checkbox"
						checked={settings.simplifiedFiring}
						onchange={(event) => update('simplifiedFiring', checked(event))}
					/>
					<span aria-hidden="true"></span>
					<b>Fire without full lock</b>
				</label>
			</div>

			<label class="range-field">
				<span><b>Aim assist</b><output>{Math.round(settings.aimAssist * 100)}%</output></span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={settings.aimAssist}
					oninput={(event) => update('aimAssist', rangeValue(event))}
				/>
			</label>

			<label class="range-field">
				<span
					><b>Mouse sensitivity</b><output>{Math.round(settings.mouseSensitivity * 100)}%</output
					></span
				>
				<input
					type="range"
					min="0.2"
					max="2.5"
					step="0.1"
					value={settings.mouseSensitivity}
					oninput={(event) => update('mouseSensitivity', rangeValue(event))}
				/>
			</label>
			<label class="toggle single">
				<input
					type="checkbox"
					checked={settings.invertPitch}
					onchange={(event) => update('invertPitch', checked(event))}
				/>
				<span aria-hidden="true"></span>
				<b>Invert pitch</b>
			</label>
		</section>

		<section class="group">
			<div class="group-title">
				<span>03</span>
				<div>
					<p>TOUCH CONTROLS</p>
					<small>iPhone and iPad flight input</small>
				</div>
			</div>

			<label class="select-field">
				<span>Flight control</span>
				<select
					value={settings.touchControlMode}
					onchange={(event) =>
						update(
							'touchControlMode',
							(event.currentTarget as HTMLSelectElement).value as TouchControlMode
						)}
				>
					<option value="stick">Virtual stick</option>
					<option value="tilt">Device tilt</option>
				</select>
			</label>

			<label class="range-field">
				<span
					><b>Tilt sensitivity</b><output>{Math.round(settings.tiltSensitivity * 100)}%</output
					></span
				>
				<input
					type="range"
					aria-label="Tilt sensitivity"
					min="0.25"
					max="1.5"
					step="0.05"
					value={settings.tiltSensitivity}
					oninput={(event) => update('tiltSensitivity', rangeValue(event))}
				/>
			</label>
			<p class="touch-note">
				On iOS and iPadOS, motion permission is requested from the Enable Tilt button during
				gameplay. The virtual stick always remains available.
			</p>
		</section>

		<section class="group">
			<div class="group-title">
				<span>04</span>
				<div>
					<p>SUBTITLES</p>
					<small>Radio transcript display</small>
				</div>
			</div>

			<div class="field-grid">
				<label class="toggle single">
					<input
						type="checkbox"
						checked={settings.subtitles}
						onchange={(event) => update('subtitles', checked(event))}
					/>
					<span aria-hidden="true"></span>
					<b>Subtitles</b>
				</label>
				<label class="select-field">
					<span>Subtitle size</span>
					<select
						value={settings.subtitleSize}
						onchange={(event) =>
							update(
								'subtitleSize',
								(event.currentTarget as HTMLSelectElement).value as SubtitleSize
							)}
					>
						<option value="small">Small</option>
						<option value="medium">Medium</option>
						<option value="large">Large</option>
					</select>
				</label>
			</div>
		</section>

		<section class="group audio-group">
			<div class="group-title">
				<span>05</span>
				<div>
					<p>AUDIO MIX</p>
					<small>Independent channels</small>
				</div>
			</div>

			{#each volumeChannels as channel (channel.key)}
				<label class="range-field compact">
					<span><b>{channel.label}</b><output>{Math.round(channel.value * 100)}%</output></span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						value={channel.value}
						oninput={(event) => update(channel.key, rangeValue(event))}
					/>
				</label>
			{/each}
		</section>
	</div>

	<footer>
		<p><span aria-hidden="true"></span> Changes save automatically</p>
		<button type="button" onclick={onClose}>Done</button>
	</footer>
</dialog>

<style>
	.settings-scrim {
		position: absolute;
		inset: 0;
		z-index: 44;
		background: rgba(1, 7, 12, 0.72);
		backdrop-filter: blur(9px);
		animation: fade 180ms ease both;
	}

	.settings-panel {
		position: absolute;
		z-index: 45;
		top: clamp(0.5rem, 3vh, 2rem);
		right: clamp(0.5rem, 3vw, 2rem);
		bottom: clamp(0.5rem, 3vh, 2rem);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		width: min(46rem, calc(100vw - 1rem));
		margin: 0;
		padding: 0;
		overflow: hidden;
		color: #eaf7f9;
		border: 1px solid rgba(103, 212, 230, 0.34);
		background:
			linear-gradient(145deg, rgba(6, 27, 37, 0.97), rgba(2, 13, 21, 0.98)),
			repeating-linear-gradient(0deg, transparent 0 3px, rgba(107, 221, 239, 0.025) 3px 4px);
		box-shadow: 0 30px 100px rgba(0, 0, 0, 0.54);
		clip-path: polygon(
			0 0,
			calc(100% - 1.3rem) 0,
			100% 1.3rem,
			100% 100%,
			1.3rem 100%,
			0 calc(100% - 1.3rem)
		);
		animation: panel-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	header,
	footer {
		display: flex;
		gap: 1rem;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.2rem;
	}

	header {
		border-bottom: 1px solid rgba(104, 209, 226, 0.17);
	}

	header p,
	header h1 {
		margin: 0;
	}

	header p {
		color: #ed9d63;
		font:
			650 0.51rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.16em;
	}

	header h1 {
		margin-top: 0.25rem;
		font-size: 1.45rem;
		line-height: 1;
		letter-spacing: -0.02em;
		text-transform: uppercase;
	}

	button,
	select,
	input {
		font: inherit;
	}

	.close {
		display: grid;
		width: 2.5rem;
		aspect-ratio: 1;
		place-items: center;
		color: #aee7ef;
		border: 1px solid rgba(111, 215, 232, 0.3);
		background: rgba(6, 31, 40, 0.65);
		font-size: 1.3rem;
		cursor: pointer;
	}

	.settings-body {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0;
		overflow: auto;
		overscroll-behavior: contain;
		scrollbar-color: rgba(105, 211, 228, 0.4) rgba(7, 29, 38, 0.5);
	}

	.group {
		padding: 1.2rem;
		border-right: 1px solid rgba(104, 209, 226, 0.12);
		border-bottom: 1px solid rgba(104, 209, 226, 0.12);
	}

	.group:nth-child(even) {
		border-right: 0;
	}

	.group-title {
		display: flex;
		gap: 0.7rem;
		align-items: start;
		margin-bottom: 1rem;
	}

	.group-title > span {
		color: #eea067;
		font:
			700 0.55rem/1.3 ui-monospace,
			monospace;
	}

	.group-title p,
	.group-title small {
		margin: 0;
	}

	.group-title p {
		color: #c8edf2;
		font:
			700 0.64rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
	}

	.group-title small {
		display: block;
		margin-top: 0.28rem;
		color: rgba(168, 211, 218, 0.43);
		font-size: 0.58rem;
	}

	.field-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.7rem;
		margin-bottom: 1rem;
	}

	.select-field {
		display: grid;
		gap: 0.35rem;
	}

	.select-field > span,
	.range-field b {
		color: rgba(193, 225, 231, 0.7);
		font:
			600 0.57rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.06em;
	}

	select {
		width: 100%;
		padding: 0.55rem 0.6rem;
		color: #daf3f7;
		border: 1px solid rgba(109, 211, 229, 0.24);
		border-radius: 0;
		background: #071e28;
		font-size: 0.68rem;
		text-transform: uppercase;
	}

	.range-field {
		display: grid;
		gap: 0.4rem;
		margin-top: 0.8rem;
	}

	.range-field > span {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	output {
		color: #f1a56d;
		font:
			600 0.55rem/1 ui-monospace,
			monospace;
	}

	input[type='range'] {
		width: 100%;
		height: 0.25rem;
		margin: 0.35rem 0;
		accent-color: #74ddeb;
	}

	.toggle-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
		margin-top: 0.9rem;
	}

	.toggle {
		position: relative;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.55rem;
		align-items: center;
		min-height: 1.6rem;
		color: rgba(205, 232, 236, 0.68);
		cursor: pointer;
	}

	.toggle.single {
		margin-top: 0.7rem;
	}

	.toggle input {
		position: absolute;
		z-index: 1;
		opacity: 0;
	}

	.toggle > span {
		position: relative;
		width: 2rem;
		height: 1rem;
		border: 1px solid rgba(106, 208, 225, 0.32);
		background: rgba(2, 14, 21, 0.68);
		pointer-events: none;
		transition: background 150ms ease;
	}

	.toggle > span::after {
		position: absolute;
		top: 0.15rem;
		left: 0.15rem;
		width: 0.58rem;
		height: 0.58rem;
		content: '';
		background: rgba(166, 211, 219, 0.55);
		transition:
			transform 150ms ease,
			background 150ms ease;
	}

	.toggle input:checked + span {
		border-color: #65d3e5;
		background: rgba(41, 130, 145, 0.38);
	}

	.toggle input:checked + span::after {
		background: #8be8f6;
		transform: translateX(0.95rem);
	}

	.toggle input:focus-visible + span {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.toggle b {
		font-size: 0.63rem;
		font-weight: 560;
		line-height: 1.2;
	}

	.audio-group {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0 1rem;
	}

	.audio-group .group-title {
		grid-column: 1 / -1;
	}

	.range-field.compact {
		margin-top: 0.35rem;
	}

	.touch-note {
		margin: 0.9rem 0 0;
		color: rgba(177, 217, 224, 0.52);
		font-size: 0.58rem;
		line-height: 1.45;
	}

	footer {
		border-top: 1px solid rgba(104, 209, 226, 0.17);
	}

	footer p {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin: 0;
		color: rgba(166, 211, 219, 0.45);
		font:
			550 0.53rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.08em;
	}

	footer p span {
		width: 0.36rem;
		height: 0.36rem;
		border-radius: 50%;
		background: #75daa9;
		box-shadow: 0 0 8px #75daa9;
	}

	footer button {
		padding: 0.65rem 1.3rem;
		color: #061319;
		border: 0;
		background: linear-gradient(105deg, #ef955b, #ffc089);
		font:
			750 0.63rem/1 ui-sans-serif,
			system-ui,
			sans-serif;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
	}

	@keyframes panel-in {
		from {
			opacity: 0;
			transform: translateX(1.5rem);
		}
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}

	@media (max-width: 680px) {
		.settings-panel {
			inset: 0;
			width: 100%;
			clip-path: none;
		}

		.settings-body {
			grid-template-columns: 1fr;
		}

		.group,
		.group:nth-child(even) {
			border-right: 0;
		}
	}

	@media (max-width: 420px) {
		.field-grid,
		.toggle-grid,
		.audio-group {
			grid-template-columns: 1fr;
		}

		.audio-group .group-title {
			grid-column: auto;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.settings-panel,
		.settings-scrim {
			animation: none;
		}
	}
</style>
