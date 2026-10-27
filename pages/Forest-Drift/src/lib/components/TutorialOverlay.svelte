<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import type { ThreeScene } from '$lib/game/ThreeScene';
	import { formatBytes, formatDuration, type SpeechProgress } from '$lib/game/speech/progress';
	import { SpeechWindow } from '$lib/game/speech/SpeechWindow';
	import { SpeechService } from '$lib/game/speech/SpeechService';
	import { observeSubtitleLayout } from '$lib/game/tutorials/subtitleLayout';
	import { phrases, type Caption } from '$lib/game/speech/types';
	import {
		getAudioPreferences,
		setAudioPreferences,
		subscribeAudioPreferences
	} from '$lib/game/audio/AudioPreferences';
	import {
		lessons,
		lessonRequest,
		completed,
		TUTORIAL_VERSION,
		type TutorialSnapshot
	} from '$lib/game/tutorials/tutorials';
	import {
		getTutorialPreferences,
		setTutorialPreferences,
		subscribeTutorialPreferences
	} from '$lib/game/tutorials/TutorialPreferences';
	let {
		scene,
		touch,
		playing,
		blocked,
		build,
		slot,
		help,
		onPreparation
	}: {
		scene: ThreeScene;
		touch: boolean;
		playing: boolean;
		blocked: boolean;
		build: boolean;
		slot: number;
		help: boolean;
		onPreparation: (value: boolean) => void;
	} = $props();
	let preferences = $state(getTutorialPreferences());
	let menu = $state(false),
		preparing = $state(false),
		running = $state(false);
	let message = $state(''),
		caption = $state<Caption | null>(null),
		index = $state(0),
		bottom = $state(150);
	let waiting = $state(false),
		hidden = $state(false),
		textPage = $state(0);
	const captionPages = $derived(caption ? phrases(caption.text) : []);
	let dialog = $state<HTMLDialogElement>();
	let selectedTouch = $state(false);
	let textDelivery = $state(false);
	const catalogue = $derived(lessons(selectedTouch));
	let service: SpeechService;
	let speechWindow: SpeechWindow | undefined;
	let buffering = $state(false);
	let autoStarting = $state(false);
	let autoAdvance = $state(false);
	let autoNotice = $state('');
	let backgroundMessage = $state('');
	let backgroundAfter = 0;
	function createWindow() {
		if (speechWindow) return;
		speechWindow = new SpeechWindow(
			service,
			() => mounted && running && !frozen && performance.now() >= backgroundAfter,
			(value, detail) => {
				backgroundMessage =
					value +
					(detail?.loaded !== undefined
						? ` ${formatBytes(detail.loaded)}${detail.total ? ` / ${formatBytes(detail.total)}` : ''}`
						: '');
				lastProgress = now = Date.now();
			}
		);
	}
	$effect(() => {
		if (!running || frozen || !preferences.narration || preferences.deviceVoice) return;
		let last = performance.now();
		let frame = 0;
		const monitor = (now: number) => {
			// Back off between synthesis phrases when rendering misses its budget.
			if (now - last > 24) backgroundAfter = now + 1000;
			last = now;
			frame = requestAnimationFrame(monitor);
		};
		frame = requestAnimationFrame(monitor);
		return () => cancelAnimationFrame(frame);
	});
	let baseline: TutorialSnapshot;
	let sessionId = '';
	let run = 0;
	let previousAt = -Infinity;
	let reviewing = false;
	let prepareEpoch = 0;
	let clearing = $state(false);
	let mounted = $state(false);
	let startEpoch = 0;
	let testing = $state(false);
	let progress = $state<SpeechProgress | null>(null);
	let operationStarted = $state(0);
	let lastProgress = $state(0);
	let now = $state(0);
	let operationError = $state(false);
	const busy = $derived(preparing || clearing || testing || buffering || autoStarting);
	const elapsed = $derived(Math.max(0, (now - operationStarted) / 1000));
	const quietSeconds = $derived(Math.max(0, (now - lastProgress) / 1000));
	function beginOperation() {
		progress = null;
		operationError = false;
		operationStarted = lastProgress = now = Date.now();
	}
	$effect(() => {
		if (!busy) return;
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});
	let voiceReady = $state(false);
	let audio = $state(getAudioPreferences());
	const soundEnabled = $derived(!audio.muted && audio.master > 0 && audio.narration > 0);
	async function testSound() {
		if (!voiceReady || !soundEnabled || preparing || clearing) return;
		stop();
		const epoch = ++startEpoch;
		beginOperation();
		testing = true;
		message = 'Playing a sample of the first tutorial instruction.';
		try {
			await service.unlock();
			if (!mounted || epoch !== startEpoch || !menu) return;
			const result = await service.speak(
				lessonRequest(catalogue[0], sessionId, selectedTouch),
				true
			);
			if (epoch !== startEpoch || !menu) return;
			if (result === 'ended')
				message =
					'Sample finished. If you heard the narrator, continue to step 3. Otherwise check your device volume, output device, and browser tab mute setting, then test again.';
			else {
				voiceReady = false;
				message = 'The sample could not play. Prepare the voice again, then retry the sound test.';
			}
		} catch {
			if (epoch === startEpoch)
				message =
					'Audio could not start. Check your browser sound permissions and try Test sound again.';
		} finally {
			if (epoch === startEpoch) testing = false;
		}
	}
	function closeMenu() {
		if (!running) service?.stopPreparation();
		startEpoch++;
		service?.cancel();
		testing = false;
		menu = false;
	}
	function preparationState(value: boolean) {
		scene.speechPreparationOpen = value;
		onPreparation(value);
	}
	const frozen = $derived(blocked || hidden || menu);
	function snapshot(): TutorialSnapshot {
		return { ...scene.getTutorialPosition(), build, slot, help };
	}
	function stop() {
		autoAdvance = false;
		autoStarting = false;
		autoNotice = '';
		backgroundMessage = '';
		speechWindow?.dispose();
		speechWindow = undefined;
		buffering = false;
		testing = false;
		startEpoch++;
		run++;
		service?.cancel();
		running = false;
		waiting = false;
		caption = null;
	}
	function open() {
		autoStarting = false;
		run++;
		testing = false;
		startEpoch++;
		service?.cancel();
		menu = true;
		document.exitPointerLock?.();
	}
	async function autoStart() {
		if (autoStarting || clearing || (running && autoAdvance && !menu)) return;
		if (preparing) cancelPreparation();
		stop();
		menu = false;
		if (!soundEnabled) {
			autoNotice = 'Narration is muted. Press F6 and enable narrator sound, then press F8.';
			return;
		}
		const epoch = ++startEpoch;
		selectedTouch = touch;
		index = 0;
		previousAt = -Infinity;
		reviewing = false;
		baseline = snapshot();
		setTutorialPreferences({ enabled: true, narration: true, deviceVoice: false });
		beginOperation();
		autoStarting = true;
		try {
			// Unlock on the actual key/button gesture, before any download or generation.
			await service.unlock();
			if (!mounted || epoch !== startEpoch) return;
			autoStarting = false;
			autoAdvance = true;
			running = true;
		} catch {
			if (epoch === startEpoch) {
				autoStarting = false;
				autoNotice = 'Sound could not start. Press F8 to retry or F6 for speech options.';
			}
		}
	}
	async function narrate() {
		const epoch = ++run;
		const lesson = catalogue[index];
		waiting = false;
		textPage = 0;
		const audio = getAudioPreferences();
		buffering = false;
		service.cancel();
		try {
			if (
				preferences.narration &&
				!preferences.deviceVoice &&
				!audio.muted &&
				audio.master > 0 &&
				audio.narration > 0
			) {
				createWindow();
				speechWindow!.setWindow(
					catalogue
						.slice(index, index + 3)
						.map((lesson) => lessonRequest(lesson, sessionId, selectedTouch))
				);
				beginOperation();
				buffering = true;
				if (
					!(await speechWindow!.ensure(
						lessonRequest(lesson, sessionId, selectedTouch),
						() => epoch === run && running && !frozen
					))
				)
					return;
				if (epoch !== run) return;
				buffering = false;
			}

			const result = await service.speak(
				lessonRequest(lesson, sessionId, selectedTouch),
				preferences.narration && !audio.muted && audio.master > 0 && audio.narration > 0,
				preferences.deviceVoice
			);
			if (epoch !== run || result === 'cancelled') return;
			if (autoAdvance && result === 'ended' && running && !frozen) {
				// Hearing a lesson is not proof that its gameplay action was performed.
				next(lesson.action !== 'continue');
				return;
			}
			waiting = true;
			textDelivery = result === 'text';
			// Retain the action prompt after narration, without a second transcript or timing loop.
			caption = {
				requestId: lesson.id,
				speakerId: 'tutorial-narrator',
				label: '',
				text: lesson.text
			};
		} catch {
			if (epoch === run) {
				buffering = false;
				waiting = true;
				textDelivery = true;
				message =
					'Voice preparation or playback failed. Follow the text, or open Options to retry.';
				backgroundMessage = message;
				caption = {
					requestId: lesson.id,
					speakerId: 'tutorial-narrator',
					label: '',
					text: lesson.text
				};
			}
		}
	}
	function previous() {
		if (!running || frozen) return;
		const now = performance.now();
		if (now - previousAt < 400) return;
		previousAt = now;
		run++;
		service.cancel();
		index = Math.max(0, index - 1);
		// Previously satisfied game state must not skip over the instruction being replayed.
		reviewing = true;
		baseline = snapshot();
		void narrate();
	}
	function next(skipped = false) {
		if (!running) return;
		run++;
		waiting = false;
		reviewing = false;
		const id = `${TUTORIAL_VERSION}:${catalogue[index].id}:${skipped ? 'skipped' : 'completed'}`;
		setTutorialPreferences({ finished: [...new Set([...preferences.finished, id])] });
		service.cancel();
		if (index === catalogue.length - 1) {
			stop();
			return;
		}
		index++;
		baseline = snapshot();
		if (!frozen) void narrate();
	}
	async function start(voice: boolean, deviceVoice = false) {
		if (voice && (!soundEnabled || (!deviceVoice && (!voiceReady || selectedTouch !== touch))))
			return;
		stop();
		const epoch = ++startEpoch;
		selectedTouch = touch;
		index = 0;
		previousAt = -Infinity;
		reviewing = false;
		baseline = snapshot();
		message = '';
		setTutorialPreferences({ enabled: true, narration: voice, deviceVoice });
		if (!voice || deviceVoice) service.stopPreparation();
		try {
			if (voice && !deviceVoice) await service.unlock();
		} catch {
			message =
				'Audio could not start. Check your browser sound permissions and try Test sound again.';
			return;
		}
		if (!mounted || epoch !== startEpoch || !menu) return;
		menu = false;
		running = true;
	}
	async function prepare() {
		if (preparing) return;
		const epoch = ++prepareEpoch;
		stop();
		selectedTouch = touch;
		beginOperation();
		preparing = true;
		voiceReady = false;
		message = 'Preparing the local narrator…';
		preparationState(true);
		// Give the scene suspension and opaque overlay a chance to take effect before loading inference.
		await tick();
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		if (epoch !== prepareEpoch) return;
		try {
			await service.prepare(
				catalogue.slice(0, 3).map((lesson) => lessonRequest(lesson, sessionId, selectedTouch)),
				(value, detail) => {
					if (epoch === prepareEpoch) {
						message = value;
						progress = detail ?? null;
						lastProgress = now = Date.now();
					}
				},
				{ keepWorker: true }
			);
			if (epoch === prepareEpoch) {
				voiceReady = true;
				message =
					'Voice ready. The first three instructions are prepared. Test the sound, then start; the rest prepare as you go.';
			}
		} catch (error) {
			if (epoch === prepareEpoch) {
				operationError = true;
				message =
					error instanceof Error
						? error.message
						: 'Preparation failed. Text tutorials remain available.';
			}
		} finally {
			if (epoch === prepareEpoch) {
				preparing = false;
				preparationState(false);
			}
		}
	}
	function cancelPreparation() {
		prepareEpoch++;
		service.stopPreparation();
		preparing = false;
		preparationState(false);
		message = 'Preparation stopped. You can use text or already cached speech.';
	}
	async function clearCache() {
		stop();
		cancelPreparation();
		beginOperation();
		clearing = true;
		voiceReady = false;
		try {
			await service.clear();
			message = 'Saved voice model and generated clips cleared on this device.';
		} catch {
			operationError = true;
			message = 'Storage could not be cleared. Please retry.';
		} finally {
			clearing = false;
		}
	}
	$effect(() => {
		if (!running) return;
		if (frozen) {
			run++;
			service?.cancel();
		} else {
			untrack(() => void narrate());
		}
	});
	$effect(() => {
		if (!preferences.enabled) stop();
	});
	$effect(() => {
		if (menu && dialog && !dialog.open) dialog.showModal();
	});
	$effect(() => {
		if (mounted && (running || autoStarting || autoNotice) && !frozen)
			return observeSubtitleLayout((value) => (bottom = value));
	});
	onMount(() => {
		mounted = true;
		sessionId = crypto.randomUUID();
		service = new SpeechService(
			(value) => (caption = value),
			() => scene.speechPreparationOpen && preparing && !document.hidden,
			() => mounted && running && !document.hidden
		);
		const unsubscribeAudio = subscribeAudioPreferences((value) => (audio = value));
		const unsubscribe = subscribeTutorialPreferences((value) => (preferences = value));
		const visibility = () => {
			hidden = document.hidden;
			if (hidden && preparing) cancelPreparation();
		};
		const keyboard = (event: KeyboardEvent) => {
			if (
				!['F6', 'F7', 'F8', 'F9'].includes(event.code) ||
				event.repeat ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey ||
				event.shiftKey ||
				(event.target instanceof Element &&
					event.target.closest('input, textarea, select, [contenteditable="true"]'))
			)
				return;
			if (event.code === 'F7' || event.code === 'F9') {
				if (!running || frozen || event.defaultPrevented) return;
				event.preventDefault();
				// Advancing an unfinished action is a skip, not evidence it was completed.
				if (event.code === 'F7') previous();
				else next(catalogue[index].action !== 'continue');
				return;
			}
			if (blocked && !menu) return;
			event.preventDefault();
			if (event.code === 'F8') void autoStart();
			else open();
		};
		const timer = setInterval(() => {
			if (
				running &&
				!autoAdvance &&
				waiting &&
				!reviewing &&
				!hidden &&
				!menu &&
				(!blocked || help) &&
				catalogue[index].action !== 'continue' &&
				completed(catalogue[index].action, baseline, snapshot())
			)
				next();
		}, 250);
		window.addEventListener('keydown', keyboard);
		window.addEventListener('forest:tutorial', open);
		document.addEventListener('visibilitychange', visibility);
		return () => {
			mounted = false;
			startEpoch++;
			clearInterval(timer);
			unsubscribe();
			unsubscribeAudio();
			window.removeEventListener('keydown', keyboard);
			window.removeEventListener('forest:tutorial', open);
			document.removeEventListener('visibilitychange', visibility);
			prepareEpoch++;
			speechWindow?.dispose();
			service.dispose();
			preparationState(false);
		};
	});
</script>

{#if !blocked && !menu && (!touch || !playing)}
	<div class="tutorial-open" data-ui-surface="hud">
		<button data-testid="tutorial-auto-start" onclick={() => void autoStart()}
			>Auto tutorial <span>(F8)</span></button
		>
		<button data-testid="tutorial-open" onclick={open}>Speech options <span>(F6)</span></button>
	</div>
{/if}
{#if !frozen && (buffering || autoStarting || autoNotice) && !caption}
	<p
		class="subtitle preparation-caption"
		data-testid="tutorial-preparation-status"
		role="status"
		style:bottom={`${bottom}px`}
	>
		{autoNotice ||
			(autoStarting
				? 'Starting narrator…'
				: backgroundMessage || 'Preparing the first instruction…')}
		{#if !autoNotice}<small
				>{quietSeconds >= 20 ? 'Still waiting for progress. ' : ''}Speech starts automatically when
				ready. F6: options.</small
			>{/if}
	</p>
{/if}
{#if running && !frozen}
	{#if caption && (!waiting || preferences.subtitles || !preferences.narration || textDelivery)}
		<div
			class="subtitle"
			data-testid="tutorial-subtitle"
			style:bottom={`${bottom}px`}
			style:font-size={`${preferences.size}px`}
			aria-live={preferences.narration && !textDelivery ? 'off' : 'polite'}
			aria-atomic="true"
		>
			{#if caption.label}<strong>{caption.label}: </strong>{/if}{captionPages[
				Math.min(textPage, captionPages.length - 1)
			]}
		</div>
	{/if}
	<nav class="tutorial-controls" data-ui-surface="hud" aria-label="Tutorial controls">
		<span>{index + 1} / {catalogue.length}{autoAdvance ? ' · Auto' : ''}</span>
		{#if !buffering && backgroundMessage && textDelivery && preferences.narration && !preferences.deviceVoice}<span
				role="status"
				class="buffer-status">{backgroundMessage}</span
			>{/if}
		{#if captionPages.length > 1}<button
				onclick={() => (textPage = (textPage + 1) % captionPages.length)}
				>Next line ({textPage + 1}/{captionPages.length})</button
			>{/if}
		{#if catalogue[index].action === 'continue'}<button onclick={() => next()} disabled={!waiting}
				>Continue</button
			>{/if}
		<button aria-keyshortcuts="F7" onclick={previous}>Previous (F7)</button>
		<button onclick={() => void narrate()}>Replay</button>
		<button aria-keyshortcuts="F9" onclick={() => next(catalogue[index].action !== 'continue')}
			>Next (F9)</button
		>
		<button onclick={open}>Options (F6)</button>
		<button onclick={stop}>Close</button>
	</nav>
{/if}
{#if menu}
	<div class="tutorial-backdrop" data-testid="tutorial-menu">
		<dialog
			bind:this={dialog}
			data-ui-surface="panel"
			aria-labelledby="tutorial-title"
			onkeydown={(event) => {
				if (
					event.code === 'F8' &&
					!event.repeat &&
					!event.ctrlKey &&
					!event.metaKey &&
					!event.altKey &&
					!event.shiftKey &&
					!(
						event.target instanceof Element &&
						event.target.closest('input, textarea, select, [contenteditable="true"]')
					)
				) {
					event.preventDefault();
					void autoStart();
				}
				event.stopPropagation();
			}}
			oncancel={(event) => {
				event.preventDefault();
				if (preparing) cancelPreparation();
				closeMenu();
			}}
		>
			<header class="narrator-header">
				<div>
					<p class="eyebrow">FOREST DRIFT · FIELD GUIDE</p>
					<h2 id="tutorial-title">Your tutorial narrator</h2>
					<p class="header-description">A familiar voice to guide your first steps.</p>
				</div>
				<button
					class="close-setup"
					aria-label="Close tutorial setup"
					onclick={() => {
						if (preparing) cancelPreparation();
						closeMenu();
					}}>×</button
				>
			</header>
			<div class="setup-body">
				<div class="auto-start-row">
					<button class="primary" onclick={() => void autoStart()} disabled={clearing}
						>Auto start tutorial (F8)</button
					>
					<p>
						Downloads the voice if needed and starts as soon as the first instruction is ready. The
						next instructions prepare in the background. Each instruction advances when its speech
						finishes. F7 and F9 go back or forward. No sound test required.
					</p>
				</div>
				<p class="setup-intro">
					Follow these three steps to hear the guide and see subtitles above your hotbar.
				</p>
				<p class="status" class:error={operationError} role="status">
					{clearing ? 'Clearing saved speech…' : message || 'Start with step 1: Prepare voice.'}
				</p>
				{#if testing && caption}
					<p
						class="sample-caption"
						data-testid="tutorial-sample-subtitle"
						style:font-size={`${preferences.size}px`}
					>
						{caption.text}
					</p>
				{/if}
				{#if busy}
					<section class="operation-progress" aria-label="Speech operation progress">
						{#if preparing && progress?.count}
							<label for="speech-clips"
								>Speech clips ready: {progress.completed ?? 0} / {progress.count} · {progress.reused ??
									0} reused</label
							>
							<progress id="speech-clips" max={progress.count} value={progress.completed ?? 0}
							></progress>
						{/if}
						{#if progress?.stage === 'download'}
							<label for="speech-transfer">Model file: {progress.file}</label>
							<progress
								id="speech-transfer"
								max={progress.total ?? 1}
								value={progress.total ? progress.loaded : undefined}
							></progress>
							<p>
								{formatBytes(progress.loaded ?? 0)}{progress.total
									? ` / ${formatBytes(progress.total)} (${Math.min(100, Math.floor(((progress.loaded ?? 0) / progress.total) * 100))}%)`
									: ' · total size unavailable'}
							</p>
							<p>
								{quietSeconds >= 10
									? 'Waiting for more data…'
									: progress.bytesPerSecond
										? `${formatBytes(progress.bytesPerSecond)}/s average`
										: 'Measuring transfer rate…'}
								{#if quietSeconds < 10 && progress.etaSeconds !== undefined}
									· About {formatDuration(progress.etaSeconds)} left for this file{/if}
							</p>
							<small
								>Transfers may read saved files. This estimate excludes runtime loading and speech
								generation.</small
							>
						{:else}
							<progress
								aria-label={clearing
									? 'Clearing saved speech'
									: testing
										? 'Playing sample'
										: 'Processing speech'}
							></progress>
							<p>
								{clearing
									? 'Waiting for storage access and deleting saved files…'
									: testing
										? 'Starting or playing the sound sample…'
										: 'Processing on this device. A time estimate is not available for this stage.'}
							</p>
						{/if}
						<p>
							Elapsed: {formatDuration(elapsed)} · Last update: {formatDuration(quietSeconds)} ago
						</p>
						{#if quietSeconds >= 20}
							<p class="sound-warning">
								No new progress reported for {formatDuration(quietSeconds)}. This can happen during
								model initialization; it does not confirm a failure. {preparing
									? 'You can cancel and retry if it does not recover. A worker that reports nothing for 3 minutes will time out.'
									: 'If this continues, return to the game and try again.'}
							</p>
						{/if}
					</section>
				{/if}
				<ol class="setup-steps">
					<li>
						<strong>Prepare the voice</strong>
						<p>
							Click Prepare voice and wait for “Voice ready”. The first time needs internet to
							download a large voice model and can take a few minutes. Keep this tab open. The world
							pauses during preparation.
						</p>
						<p>
							On later visits, this button checks and reuses saved speech. Only the first three
							instructions are needed to start. The next two prepare in the background while you
							play.
						</p>
						<button
							class:primary={!voiceReady}
							data-testid="tutorial-prepare"
							disabled={preparing || clearing || testing}
							onclick={() => void prepare()}
							>{preparing
								? 'Preparing…'
								: voiceReady
									? 'Check saved voice'
									: 'Prepare voice'}</button
						>
						{#if preparing}<button onclick={cancelPreparation}>Cancel preparation</button>{/if}
					</li>
					<li>
						<strong>Test the sound</strong>
						<p>
							Turn up your device volume and unmute this browser tab. Click Test sound to hear a
							short narrator sample.
						</p>
						{#if !soundEnabled}
							<p class="sound-warning">
								Game sound is muted or its master/narration volume is zero.
							</p>
							<button
								onclick={() =>
									setAudioPreferences({
										muted: false,
										master: audio.master || 0.7,
										narration: audio.narration || 0.7
									})}>Enable narrator sound</button
							>
						{/if}
						<button
							data-testid="tutorial-test-sound"
							disabled={!voiceReady || !soundEnabled || preparing || clearing || testing}
							onclick={() => void testSound()}>{testing ? 'Playing sample…' : 'Test sound'}</button
						>
					</li>
					<li>
						<strong>Start the tutorial</strong>
						<p>
							Once you can hear the sample, start the spoken guide. Follow each instruction; use
							Continue when shown, or press F9 to stop the current speech and advance to the next
							instruction. Press F7 to replay the previous instruction; press again after a short
							pause to go back further. Revisited instructions stay open until you advance. Open
							Tutorial (F8) to return here.
						</p>
						<button
							class="primary"
							data-testid="tutorial-start-voice"
							disabled={!voiceReady ||
								selectedTouch !== touch ||
								!soundEnabled ||
								preparing ||
								clearing ||
								testing}
							onclick={() => void start(true)}>Start spoken tutorial</button
						>
						{#if !voiceReady}<small>Complete step 1 to unlock spoken playback.</small>{/if}
					</li>
				</ol>

				{#if !preparing && !clearing}
					<details open>
						<summary>Other ways to play (no model download)</summary>
						<p class="alternative-intro">
							Both options skip voice preparation and the model download. You can return here to
							change how the guide plays.
						</p>
						<div class="alternative-modes">
							<div>
								<strong>Text only · no narrator audio</strong>
								<p id="text-mode-description">
									Start immediately with written instructions above your hotbar. Nothing is read
									aloud; other game sounds keep their usual settings. Use Continue or F9 to advance,
									and F7 to go back.
								</p>
								<button
									data-testid="tutorial-start-text"
									aria-describedby="text-mode-description"
									onclick={() => void start(false)}>Start with text</button
								>
							</div>
							<div>
								<strong>Device voice · speech and subtitles</strong>
								<p id="device-mode-description">
									Read the same guide aloud using an English voice already installed on your device
									and available to this browser. Subtitles appear while it speaks. This voice may
									sound different from the prepared narrator. If no suitable local voice is
									available or playback fails, the guide continues as text.
								</p>
								<button
									aria-describedby="device-mode-description"
									disabled={!soundEnabled}
									onclick={() => void start(true, true)}>Start with device voice</button
								>
								{#if !soundEnabled}<small>Enable narrator sound in step 2 to use this option.</small
									>{/if}
							</div>
						</div>
					</details>
					<label
						><input
							type="checkbox"
							checked={preferences.subtitles}
							onchange={(e) => setTutorialPreferences({ subtitles: e.currentTarget.checked })}
						/> Keep instructions visible after speech</label
					>
					<label
						>Subtitle size <input
							aria-label="Subtitle size"
							type="range"
							min="16"
							max="24"
							step="1"
							value={preferences.size}
							oninput={(e) => setTutorialPreferences({ size: +e.currentTarget.value })}
						/></label
					>
					<div class="actions">
						<button onclick={() => void clearCache()}>Clear downloaded speech</button>
						<button
							onclick={() => {
								stop();
								setTutorialPreferences({ enabled: false });
								menu = false;
							}}>Disable tutorials</button
						>
						<button onclick={closeMenu}>Back to game</button>
					</div>
				{/if}
				<small
					>Generated locally with Kokoro. No recording or speech API subscription. Missing clips use
					text.</small
				>
			</div>
		</dialog>
	</div>
{/if}

<style>
	.auto-start-row {
		padding: 16px 0;
		border-bottom: 1px solid var(--fd-line);
	}
	.auto-start-row p {
		color: var(--fd-muted);
		margin-bottom: 0;
	}
	.preparation-caption {
		font-size: 14px;
		margin: 0;
	}
	.preparation-caption small {
		display: block;
		color: #f0d69e;
		font-size: 12px;
	}
	.tutorial-open {
		position: fixed;
		right: 16px;
		top: 64px;
		z-index: 42;
		display: flex;
		gap: 6px;
	}
	button {
		cursor: pointer;
		border: 1px solid var(--fd-line);
		background-color: var(--fd-wood);
		background-image: var(--fd-wood-face);
		background-size: 100% 100%;
		box-shadow:
			inset 0 1px #ffe4a632,
			inset 0 -2px #210c0b80,
			0 2px 0 #0c0806;
		color: var(--fd-text);
		border-radius: 8px;
		padding: 8px 12px;
		font: inherit;
	}
	button:focus-visible {
		outline: 2px solid #f8db9a;
		outline-offset: 3px;
	}
	button:disabled {
		opacity: 0.5;
	}
	.subtitle {
		position: fixed;
		left: 50%;
		transform: translateX(-50%);
		width: min(540px, calc(100vw - 32px));
		z-index: 44;
		pointer-events: none;
		color: white;
		text-align: center;
		line-height: 1.4;
		font-weight: 600;
		text-wrap: balance;
		text-shadow:
			0 1px 3px #000,
			1px 0 2px #000,
			-1px 0 2px #000;
	}
	.tutorial-controls {
		position: fixed;
		right: 16px;
		top: 108px;
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		align-items: center;
		z-index: 43;
		color: white;
		font-size: 12px;
		max-width: calc(100vw - 32px);
	}
	.tutorial-backdrop {
		position: fixed;
		inset: 0;
		background: #110e0b;
		z-index: 150;
		display: grid;
		place-items: center;
		padding: 20px;
		overflow-y: auto;
	}
	dialog {
		box-sizing: border-box;
		padding: 0;
		max-height: calc(100dvh - 40px);
		width: min(920px, calc(100vw - 40px));
		overflow-y: auto;
		line-height: 1.6;
		font-size: 14px;
	}
	h2 {
		font:
			bold clamp(26px, 4vw, 36px)/1.15 Georgia,
			serif;
		margin: 0;
	}
	.eyebrow {
		color: var(--fd-gold);
		letter-spacing: 0.12em;
		font-size: 12px;
	}
	.actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		margin: 16px 0;
	}
	label {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 12px 0;
	}
	.setup-steps {
		list-style: none;
		counter-reset: setup;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
		padding: 0;
		margin: 20px 0;
	}
	.setup-steps li {
		counter-increment: setup;
		padding: 18px;
		border: 1px solid var(--fd-line);
		border-radius: 12px;
		background: linear-gradient(145deg, #6a49222b, #130e0b88);
		box-shadow: inset 0 1px #ffe4a610;
	}
	.setup-steps li::before {
		content: '0' counter(setup);
		display: block;
		color: var(--fd-gold);
		font:
			bold 24px Georgia,
			serif;
		margin-bottom: 12px;
	}
	.setup-steps strong {
		display: block;
		font-size: 17px;
		margin-bottom: 10px;
	}
	.setup-steps button {
		margin-top: 8px;
		width: 100%;
		min-height: 42px;
	}
	.setup-steps p {
		color: #d5c5ae;
	}
	.setup-steps p {
		margin: 6px 0 10px;
	}
	.setup-steps small {
		display: block;
		margin-top: 6px;
	}
	.sound-warning {
		color: #f8db9a;
	}
	summary {
		cursor: pointer;
	}
	.buffer-status {
		flex-basis: 100%;
		max-width: 360px;
		padding: 8px;
		background: #201713;
		color: var(--fd-text);
		border: 1px solid var(--fd-line);
		border-radius: 8px;
	}
	.sample-caption {
		color: white;
		text-align: center;
		line-height: 1.4;
		text-wrap: balance;
		text-shadow: 0 1px 3px #000;
	}
	.operation-progress {
		border: 1px solid var(--fd-line);
		border-radius: 8px;
		padding: 12px;
		overflow-wrap: anywhere;
	}
	.operation-progress p,
	.operation-progress label {
		margin: 6px 0;
	}
	progress {
		display: block;
		width: 100%;
		accent-color: var(--fd-gold);
	}
	.status.error {
		color: #ffb8ab;
	}
	.status {
		padding: 12px 16px;
		border-left: 3px solid var(--fd-gold);
		border-radius: 0 8px 8px 0;
		background: #edbb4a0d;
		color: #f0d69e;
	}
	small {
		color: var(--fd-muted);
	}
	.narrator-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding: 26px 28px;
	}
	.eyebrow {
		margin: 0 0 8px;
	}
	.header-description {
		margin: 10px 0 0;
		color: #dcc8a6;
	}
	.close-setup {
		font-size: 26px;
		line-height: 1;
		min-width: 40px;
		min-height: 40px;
	}
	.setup-body {
		padding: 6px 28px 24px;
	}
	.setup-intro {
		color: var(--fd-muted);
	}
	details {
		border-block: 1px solid var(--fd-line);
		padding: 14px 0;
		margin-bottom: 18px;
	}
	summary {
		color: var(--fd-gold);
		font-weight: 650;
	}
	.alternative-modes {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		margin: 16px 0;
	}
	.alternative-modes > div {
		padding: 16px;
		border: 1px solid var(--fd-line);
		border-radius: 10px;
		background: #130e0b55;
	}
	.alternative-modes strong {
		color: var(--fd-text);
	}
	.alternative-modes p,
	.alternative-intro {
		color: #d5c5ae;
	}
	.alternative-modes small {
		display: block;
		margin-top: 8px;
	}
	@media (max-width: 600px) {
		.alternative-modes {
			grid-template-columns: 1fr;
		}
	}
	input {
		accent-color: var(--fd-gold);
	}
	progress::-webkit-progress-bar {
		background: #100c08;
		box-shadow: inset 0 1px 3px #0008;
	}
	progress::-webkit-progress-value {
		background: linear-gradient(90deg, #b97828, #f0cd74);
	}
	progress::-moz-progress-bar {
		background: linear-gradient(90deg, #b97828, #f0cd74);
	}
	@media (max-width: 720px) {
		.setup-steps {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 600px) {
		dialog {
			width: calc(100vw - 24px);
			max-height: calc(100dvh - 24px);
		}
		.narrator-header {
			padding: 20px;
		}
		.setup-body {
			padding: 4px 20px 20px;
		}
		.actions button {
			min-height: 42px;
		}
		.tutorial-open {
			top: max(8px, env(safe-area-inset-top));
			right: 8px;
		}
		.tutorial-controls {
			top: 154px;
			right: 8px;
		}
		.tutorial-open span {
			display: none;
		}
	}
</style>
