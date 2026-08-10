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
			? 'Previously completed'
			: priorStatus === 'skipped'
				? 'Previously skipped'
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

		const fits = (slot: HTMLElement) => slide.scrollHeight <= slot.clientHeight + 1;

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
</script>

<section class="slide" {@attach fitTitleInSlot} aria-live="polite">
	<p class="eyebrow">Current task</p>
	{#if statusLabel}
		<p
			class={['status-chip', priorStatus === 'completed' ? 'done' : 'skipped']}
			data-testid="prior-status"
		>
			{statusLabel}
		</p>
	{/if}
	<h1>{task.title}</h1>
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

	.eyebrow {
		margin: 0 0 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--accent-strong);
	}

	.status-chip {
		margin: 0 0 0.65rem;
		align-self: flex-start;
		padding: 0.28rem 0.7rem;
		border-radius: 999px;
		font-size: 0.82rem;
		font-weight: 700;
		border: 1px solid var(--line);
	}

	.status-chip.done {
		background: var(--accent-soft);
		color: var(--accent-strong);
	}

	.status-chip.skipped {
		background: var(--mark-muted);
		color: var(--muted);
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

	.desc {
		margin: 0.85rem 0 0;
		color: var(--ink-soft);
		font-size: clamp(1.05rem, 3.2vw, 1.25rem);
		line-height: 1.45;
		max-width: 36rem;
	}
</style>
