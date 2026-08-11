<script lang="ts">
	let {
		open = false,
		title,
		message,
		label,
		value = $bindable(''),
		error = null,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		confirmDisabled = false,
		inputTestId,
		onconfirm,
		oncancel
	}: {
		open?: boolean;
		title: string;
		message: string;
		label: string;
		value?: string;
		error?: string | null;
		confirmLabel?: string;
		cancelLabel?: string;
		confirmDisabled?: boolean;
		inputTestId?: string;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();

	let dialogEl = $state<HTMLDivElement | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);
	let previousFocus: HTMLElement | null = null;

	$effect(() => {
		if (!open) return;
		previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const frame = requestAnimationFrame(() => {
			inputEl?.focus();
			inputEl?.select();
		});
		return () => {
			cancelAnimationFrame(frame);
			previousFocus?.focus?.();
			previousFocus = null;
		};
	});

	function onKeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			if (confirmDisabled) return;
			oncancel();
			return;
		}
		if (event.key !== 'Tab' || !dialogEl) return;

		const focusable = [
			...dialogEl.querySelectorAll<HTMLElement>(
				'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		];
		if (focusable.length === 0) return;

		const first = focusable[0]!;
		const last = focusable[focusable.length - 1]!;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function onSubmit(event: Event) {
		event.preventDefault();
		if (confirmDisabled) return;
		onconfirm();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<div class="backdrop" role="presentation">
		<button
			type="button"
			class="backdrop-hit"
			aria-label="Dismiss dialog"
			onclick={oncancel}
			disabled={confirmDisabled}
		></button>
		<div
			class="dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="prompt-title"
			tabindex="-1"
			bind:this={dialogEl}
		>
			<h2 id="prompt-title">{title}</h2>
			<p>{message}</p>
			<form class="prompt-form" onsubmit={onSubmit}>
				<div class="field">
					<label for="prompt-input">{label}</label>
					<input
						id="prompt-input"
						type="text"
						bind:this={inputEl}
						bind:value
						data-testid={inputTestId}
						disabled={confirmDisabled}
						aria-invalid={error ? 'true' : undefined}
						aria-describedby={error ? 'prompt-error' : undefined}
					/>
				</div>
				{#if error}
					<p id="prompt-error" class="prompt-error" role="alert">{error}</p>
				{/if}
				<div class="actions">
					<button type="button" class="btn btn-ghost" onclick={oncancel} disabled={confirmDisabled}
						>{cancelLabel}</button
					>
					<button type="submit" class="btn btn-primary" disabled={confirmDisabled}
						>{confirmLabel}</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: var(--backdrop);
		display: grid;
		place-items: center;
		padding: 1rem;
		z-index: 50;
	}

	.backdrop-hit {
		position: absolute;
		inset: 0;
		border: none;
		background: transparent;
		cursor: pointer;
	}

	.dialog {
		position: relative;
		z-index: 1;
		width: min(420px, 100%);
		background: var(--surface-strong);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
		box-shadow: var(--shadow);
		color: var(--ink);
	}

	h2 {
		margin: 0 0 0.5rem;
		font-family: var(--font-display);
		font-size: 1.35rem;
		color: var(--ink);
	}

	p {
		margin: 0 0 1.1rem;
		color: var(--ink-soft);
		line-height: 1.45;
	}

	.prompt-form {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.prompt-form :global(.field) {
		margin: 0;
	}

	.prompt-error {
		margin: 0;
		color: var(--danger);
		font-size: 0.9rem;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
	}
</style>
