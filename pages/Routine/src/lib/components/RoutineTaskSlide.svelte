<script lang="ts">
	import type { RoutineTask } from '$lib/types/routine';
	import type { TaskStatus } from '$lib/types/run';
	import type { Attachment } from 'svelte/attachments';

	let {
		task,
		priorStatus = 'pending'
	}: {
		task: RoutineTask;
		priorStatus?: TaskStatus;
	} = $props();

	const statusLabel = $derived(
		priorStatus === 'completed'
			? 'Previously complete'
			: priorStatus === 'later'
				? 'Previously later'
				: priorStatus === 'skipped'
					? 'Previously not today'
					: null
	);

	/** Lowest readable display size (rem) — scroll only if still overflowing here. */
	const MIN_TITLE_REM = 1.35;

	/**
	 * Fit title to the lead slot, then show the slide.
	 * Always reveals after fit — including when layout is late (force-landscape).
	 */
	const fitTitleInSlot: Attachment = (node) => {
		if (!(node instanceof HTMLElement)) return;
		const slide = node;

		let frame = 0;
		let revealFrame = 0;
		let attempts = 0;

		const reduceMotion = () =>
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		const slotEl = () => slide.parentElement;

		/**
		 * Height of the slide with no max-height clamp. The clamped box can
		 * report a fitting scrollHeight while the title still spills out and
		 * gets sliced by the action row.
		 */
		const contentHeight = () => {
			const prev = slide.style.maxHeight;
			slide.style.maxHeight = 'none';
			// offsetHeight stays in layout space. getBoundingClientRect is the
			// rotated box in force-landscape and would look far too tall.
			const height = slide.offsetHeight;
			slide.style.maxHeight = prev;
			return height;
		};

		const fits = (slot: HTMLElement) => contentHeight() <= slot.clientHeight + 1;

		const show = () => {
			cancelAnimationFrame(revealFrame);
			if (reduceMotion()) {
				slide.style.transition = 'none';
				slide.style.opacity = '1';
				return;
			}
			revealFrame = requestAnimationFrame(() => {
				slide.style.transition = 'opacity 150ms ease';
				slide.style.opacity = '1';
			});
		};

		const hide = () => {
			cancelAnimationFrame(revealFrame);
			slide.style.transition = 'none';
			slide.style.opacity = '0';
		};

		const applyFit = (): boolean => {
			const slot = slotEl();
			if (!slot || slot.clientHeight <= 0) return false;

			const title = slide.querySelector('h1');
			if (!(title instanceof HTMLElement)) return false;

			title.style.fontSize = '';

			if (!fits(slot)) {
				const maxPx = parseFloat(getComputedStyle(title).fontSize);
				const rootPx =
					parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
				const minPx = MIN_TITLE_REM * rootPx;

				if (!(maxPx > minPx)) {
					title.style.fontSize = `${minPx}px`;
				} else {
					let lo = minPx;
					let hi = maxPx;
					for (let i = 0; i < 16; i++) {
						const mid = (lo + hi) / 2;
						title.style.fontSize = `${mid}px`;
						if (fits(slot)) lo = mid;
						else hi = mid;
					}
					title.style.fontSize = `${lo}px`;
				}
			}

			return true;
		};

		const fitAndShow = (opts?: { hideFirst?: boolean }) => {
			cancelAnimationFrame(frame);
			if (opts?.hideFirst) hide();

			attempts = 0;
			const run = () => {
				if (applyFit()) {
					show();
					return;
				}
				attempts += 1;
				// First paint / force-landscape can report 0-height briefly.
				if (attempts > 45) {
					show();
					return;
				}
				frame = requestAnimationFrame(run);
			};
			run();
		};

		const onLayout = () => {
			if (applyFit()) show();
		};

		const onOrientation = () => {
			fitAndShow();
		};

		const ro = new ResizeObserver(onLayout);
		const parent = slotEl();
		if (parent) ro.observe(parent);

		window.addEventListener('resize', onLayout);
		window.addEventListener('orientationchange', onOrientation);

		void document.fonts?.ready?.then?.(() => {
			if (slide.isConnected) onLayout();
		});

		// Mount + task changes: re-fit, then always show.
		$effect(() => {
			void task.id;
			void task.title;
			void task.description;
			void task.important;
			void statusLabel;
			fitAndShow({ hideFirst: true });
		});

		return () => {
			cancelAnimationFrame(frame);
			cancelAnimationFrame(revealFrame);
			ro.disconnect();
			window.removeEventListener('resize', onLayout);
			window.removeEventListener('orientationchange', onOrientation);
			slide.style.opacity = '';
			slide.style.transition = '';
		};
	};

	const isImportant = $derived(task.important === true);
</script>

<section class={['slide', isImportant && 'is-important']} {@attach fitTitleInSlot} aria-live="polite">
	<div class="meta-row">
		<p class="eyebrow">Current task</p>
		{#if isImportant}
			<div class="important-marker" data-testid="important-marker">
				<span class="marker-star" aria-hidden="true">★</span>
				<span class="marker-label">Important Task</span>
				<span class="marker-bullet" aria-hidden="true">•</span>
				<span class="marker-hint">Double check required</span>
			</div>
		{/if}
		{#if statusLabel}
			<p class={['status-chip', priorStatus]} data-testid="prior-status">
				{statusLabel}
			</p>
		{/if}
	</div>
	<div class={['title-frame', isImportant && 'has-animated-border']} data-testid="task-title-frame">
		{#if isImportant}
			<div class="double-check-badge" data-testid="double-check-badge">
				<span class="dc-icon" aria-hidden="true">⚡</span>
				<span>Double Check</span>
			</div>
		{/if}
		<h1>{task.title}</h1>
	</div>
	{#if task.description}
		<p class="desc">{task.description}</p>
	{/if}
</section>

<style>
	.slide {
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		padding: 0.35rem 0.15rem 0.5rem;
		min-height: 0;
		height: auto;
		max-height: 100%;
		box-sizing: border-box;
		opacity: 0;
	}

	.meta-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.5rem;
		margin: 0 0 0.35rem;
		flex: 0 0 auto;
	}

	.eyebrow {
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--accent-strong);
	}

	.important-marker {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.26rem 0.75rem;
		border-radius: 999px;
		background: linear-gradient(135deg, rgba(239, 68, 68, 0.24), rgba(245, 158, 11, 0.18));
		border: 1px solid rgba(239, 68, 68, 0.45);
		box-shadow:
			0 0 16px rgba(239, 68, 68, 0.28),
			inset 0 0 8px rgba(239, 68, 68, 0.12);
		color: #fecaca;
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		animation: marker-glow 2.4s ease-in-out infinite alternate;
	}

	:global([data-theme='light']) .important-marker {
		background: linear-gradient(135deg, #fee2e2, #fef3c7);
		border-color: #f87171;
		color: #991b1b;
		box-shadow:
			0 0 12px rgba(239, 68, 68, 0.15),
			inset 0 0 6px rgba(239, 68, 68, 0.1);
	}

	.marker-star {
		color: #f59e0b;
		font-size: 0.95rem;
		line-height: 1;
	}

	.marker-bullet {
		opacity: 0.5;
	}

	.marker-hint {
		font-size: 0.72rem;
		opacity: 0.92;
		font-weight: 700;
	}

	@keyframes marker-glow {
		0% {
			border-color: rgba(239, 68, 68, 0.35);
			box-shadow: 0 0 10px rgba(239, 68, 68, 0.2);
		}
		100% {
			border-color: rgba(245, 158, 11, 0.6);
			box-shadow:
				0 0 20px rgba(239, 68, 68, 0.38),
				0 0 10px rgba(245, 158, 11, 0.25);
		}
	}

	.status-chip {
		margin: 0;
		padding: 0.26rem 0.7rem;
		border-radius: 999px;
		font-size: 0.78rem;
		font-weight: 700;
		border: 1px solid var(--line);
		line-height: 1.2;
	}

	.status-chip.completed {
		background: var(--accent-soft);
		color: var(--accent-strong);
	}

	.status-chip.later {
		background: var(--later);
		color: var(--on-later);
		border-color: transparent;
	}

	.status-chip.skipped {
		background: var(--not-today);
		color: var(--on-not-today);
		border-color: transparent;
	}

	.title-frame {
		position: relative;
		min-width: 0;
		width: 100%;
		flex: 0 0 auto;
	}

	.title-frame.has-animated-border {
		position: relative;
		padding: 0.85rem 1.15rem 0.95rem;
		border-radius: 1.25rem;
		overflow: hidden;
		isolation: isolate;
		margin: 0.35rem 0 0.5rem;
		box-shadow:
			0 0 26px rgba(239, 68, 68, 0.3),
			0 0 10px rgba(245, 158, 11, 0.2);
	}

	.title-frame.has-animated-border::before {
		content: '';
		position: absolute;
		top: -100%;
		left: -100%;
		width: 300%;
		height: 300%;
		background: conic-gradient(
			from 0deg,
			#ef4444 0deg 45deg,
			#f59e0b 90deg 135deg,
			#dc2626 180deg 225deg,
			#f59e0b 270deg 315deg,
			#ef4444 360deg
		);
		animation: rotate-border 3.5s linear infinite;
		z-index: -2;
	}

	.title-frame.has-animated-border::after {
		content: '';
		position: absolute;
		inset: 3px;
		border-radius: calc(1.25rem - 3px);
		background: rgba(14, 14, 18, 0.86);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		z-index: -1;
	}

	:global([data-theme='light']) .title-frame.has-animated-border::after {
		background: rgba(255, 255, 255, 0.92);
	}

	:global([data-theme='light']) .title-frame.has-animated-border {
		box-shadow:
			0 0 20px rgba(239, 68, 68, 0.2),
			0 4px 14px rgba(0, 0, 0, 0.06);
	}

	.double-check-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		margin-bottom: 0.45rem;
		padding: 0.2rem 0.65rem;
		border-radius: 999px;
		font-size: 0.74rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		background: color-mix(in srgb, #ef4444 20%, transparent);
		color: #fca5a5;
		border: 1px solid rgba(239, 68, 68, 0.45);
		box-shadow: 0 0 10px rgba(239, 68, 68, 0.18);
	}

	:global([data-theme='light']) .double-check-badge {
		background: #fee2e2;
		color: #b91c1c;
		border-color: #f87171;
	}

	.dc-icon {
		font-size: 0.85rem;
		line-height: 1;
		color: #f59e0b;
	}

	@keyframes rotate-border {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.title-frame.has-animated-border::before {
			animation: none;
		}
		.important-marker {
			animation: none;
		}
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2.45rem, 11vw, 4.1rem);
		line-height: 1.08;
		letter-spacing: -0.035em;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.is-important h1 {
		font-weight: 900;
		font-variation-settings: 'wght' 900;
		letter-spacing: -0.025em;
		color: var(--ink);
		text-shadow: 0 0 20px rgba(239, 68, 68, 0.25);
	}

	:global([data-theme='light']) .is-important h1 {
		color: #7f1d1d;
		text-shadow: none;
	}

	.desc {
		margin: 0.85rem 0 0;
		color: var(--ink-soft);
		font-size: clamp(1.05rem, 3.2vw, 1.25rem);
		line-height: 1.45;
		max-width: 36rem;
	}

	.is-important .desc {
		font-weight: 700;
		font-variation-settings: 'wght' 700;
		color: var(--ink);
	}

	:global([data-theme='light']) .is-important .desc {
		color: #450a0a;
	}

	/* Phone landscape, including the rotated force-landscape run. */
	@media (orientation: landscape) and (max-height: 520px) {
		.slide {
			padding: 0.1rem 0.1rem 0.2rem;
		}

		.meta-row {
			margin-bottom: 0.2rem;
		}

		.title-frame.has-animated-border {
			padding: 0.4rem 0.75rem 0.45rem;
			margin: 0.1rem 0 0.2rem;
		}

		.double-check-badge {
			margin-bottom: 0.2rem;
		}

		h1 {
			line-height: 1.16;
		}
	}

	:global(html.routine-force-landscape) .slide {
		padding: 0.1rem 0.1rem 0.15rem;
	}

	:global(html.routine-force-landscape) .meta-row {
		margin-bottom: 0.2rem;
		flex-wrap: nowrap;
		min-width: 0;
	}

	:global(html.routine-force-landscape) .eyebrow {
		flex-shrink: 0;
		font-size: 0.72rem;
	}

	:global(html.routine-force-landscape) .important-marker {
		flex-shrink: 1;
		min-width: 0;
		font-size: 0.68rem;
		letter-spacing: 0.02em;
		padding: 0.16rem 0.55rem;
		gap: 0.28rem;
	}

	:global(html.routine-force-landscape) .marker-hint {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(html.routine-force-landscape) .status-chip {
		flex-shrink: 0;
		font-size: 0.68rem;
		padding: 0.16rem 0.5rem;
	}

	:global(html.routine-force-landscape) .title-frame.has-animated-border {
		padding: 0.4rem 0.75rem 0.45rem;
		margin: 0.1rem 0 0.15rem;
	}

	:global(html.routine-force-landscape) .double-check-badge {
		margin-bottom: 0.2rem;
	}

	:global(html.routine-force-landscape) h1 {
		line-height: 1.16;
	}
</style>
