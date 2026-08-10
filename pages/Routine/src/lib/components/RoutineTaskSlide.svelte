<script lang="ts">
	import type { RoutineTask } from '$lib/types/routine';
	import type { TaskStatus } from '$lib/types/run';
	import type { Attachment } from 'svelte/attachments';
	import { fly } from 'svelte/transition';

	let {
		task,
		direction = 1,
		priorStatus = 'pending'
	}: {
		task: RoutineTask;
		direction?: number;
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
	 * Shrink the display title until the slide fits its scroll parent (.lead),
	 * keeping the CSS clamp max when content is short.
	 */
	function fitTitleInSlot(
		titleText: string,
		description: string | undefined,
		chip: string | null
	): Attachment {
		return (slide) => {
			void titleText;
			void description;
			void chip;

			const title = slide.querySelector('h1');
			const container = slide.parentElement;
			if (!(title instanceof HTMLElement) || !container) return;

			let frame = 0;

			/** Content height must fit the lead slot (slide is content-sized, not forced to 100%). */
			const fits = () => slide.scrollHeight <= container.clientHeight + 1;

			const fit = () => {
				cancelAnimationFrame(frame);
				frame = requestAnimationFrame(() => {
					// Reset to CSS clamp so short titles stay at the designed max size
					title.style.fontSize = '';

					if (container.clientHeight <= 0) return;
					if (fits()) return;

					const maxPx = parseFloat(getComputedStyle(title).fontSize);
					const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
					const minPx = MIN_TITLE_REM * rootPx;

					if (!(maxPx > minPx)) {
						title.style.fontSize = `${minPx}px`;
						return;
					}

					let lo = minPx;
					let hi = maxPx;
					for (let i = 0; i < 16; i++) {
						const mid = (lo + hi) / 2;
						title.style.fontSize = `${mid}px`;
						if (fits()) lo = mid;
						else hi = mid;
					}
					title.style.fontSize = `${lo}px`;
				});
			};

			fit();

			const ro = new ResizeObserver(fit);
			ro.observe(container);

			window.addEventListener('resize', fit);
			window.addEventListener('orientationchange', fit);

			void document.fonts?.ready?.then?.(fit);

			return () => {
				cancelAnimationFrame(frame);
				ro.disconnect();
				window.removeEventListener('resize', fit);
				window.removeEventListener('orientationchange', fit);
				title.style.fontSize = '';
			};
		};
	}
</script>

{#key task.id}
	<section
		class="slide"
		{@attach fitTitleInSlot(task.title, task.description, statusLabel)}
		in:fly={{ x: direction * 28, duration: 160 }}
		out:fly={{ x: direction * -22, duration: 120 }}
		aria-live="polite"
	>
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
{/key}

<style>
	.slide {
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		padding: 0.35rem 0.15rem 0.5rem;
		min-height: 0;
		/* Content-sized so overflow measurement can shrink the title to fit .lead */
		height: auto;
		max-height: 100%;
		box-sizing: border-box;
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
