<script lang="ts">
	import type { SettingsField } from '$lib/game/settings/GameSettingsHost';
	import { formatSettingsNumber, snapSettingsNumber } from '$lib/game/settings/settingsFieldFormat';

	interface Props {
		field: SettingsField;
	}

	let { field }: Props = $props();

	let numberValue = $derived(field.kind === 'number' ? field.get() : 0);
	let numberDraft = $state<string | null>(null);
	let textValue = $derived(field.kind === 'text' || field.kind === 'color' ? field.get() : '');
	let boolValue = $derived(field.kind === 'boolean' ? field.get() : false);
	let selectValue = $derived(field.kind === 'select' ? field.get() : '');
	const numberDisplay = $derived(
		numberDraft ?? (field.kind === 'number' ? formatSettingsNumber(numberValue, field.step) : '')
	);
	const numberDetail = $derived(field.kind === 'number' && field.detail ? field.detail() : '');

	function applyNumber(raw: string, commit: boolean) {
		if (field.kind !== 'number') return;
		const next = Number(raw);
		if (!Number.isFinite(next)) return;
		const snapped = snapSettingsNumber(next, field.min, field.max, field.step);
		numberValue = snapped;
		field.set(snapped);
		field.onInput?.();
		if (commit) {
			field.onCommit?.();
			numberDraft = null;
		}
	}

	function commitNumber(raw: string) {
		applyNumber(raw, true);
	}

	function slideNumber(raw: string) {
		numberDraft = null;
		applyNumber(raw, false);
	}

	function commitBoolean(checked: boolean) {
		if (field.kind !== 'boolean') return;
		boolValue = checked;
		field.set(checked);
		field.onChange?.();
	}

	function commitSelect(value: string) {
		if (field.kind !== 'select') return;
		selectValue = value;
		field.set(value);
		field.onChange?.();
	}

	function commitText(value: string) {
		if (field.kind !== 'text') return;
		textValue = value;
		field.set(value);
	}

	function commitColor(value: string) {
		if (field.kind !== 'color') return;
		textValue = value;
		field.set(value);
		field.onChange?.();
	}
</script>

{#if field.kind === 'number'}
	<label class={['field', { disabled: field.disabled }]} data-testid="settings-field-{field.id}">
		<span class="label">
			{field.label}
			{#if numberDetail}
				<span class="detail">{numberDetail}</span>
			{/if}
		</span>
		<div class="number-row">
			<input
				type="range"
				min={field.min}
				max={field.max}
				step={field.step}
				value={numberValue}
				disabled={field.disabled}
				oninput={(event) => slideNumber(event.currentTarget.value)}
				onchange={(event) => commitNumber(event.currentTarget.value)}
			/>
			<input
				class="numeric"
				type="number"
				min={field.min}
				max={field.max}
				step={field.step}
				value={numberDisplay}
				disabled={field.disabled}
				onfocus={() => {
					if (field.kind === 'number') numberDraft = formatSettingsNumber(numberValue, field.step);
				}}
				oninput={(event) => {
					numberDraft = event.currentTarget.value;
					slideNumber(event.currentTarget.value);
				}}
				onblur={(event) => commitNumber(event.currentTarget.value)}
			/>
		</div>
	</label>
{:else if field.kind === 'boolean'}
	<label
		class={['field', 'toggle', { disabled: field.disabled }]}
		data-testid="settings-field-{field.id}"
	>
		<span class="label">{field.label}</span>
		<input
			type="checkbox"
			checked={boolValue}
			disabled={field.disabled}
			onchange={(event) => commitBoolean(event.currentTarget.checked)}
		/>
	</label>
{:else if field.kind === 'select'}
	<label class={['field', { disabled: field.disabled }]} data-testid="settings-field-{field.id}">
		<span class="label">{field.label}</span>
		<select
			value={selectValue}
			disabled={field.disabled}
			onchange={(event) => commitSelect(event.currentTarget.value)}
		>
			{#each field.options as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</label>
{:else if field.kind === 'text'}
	<label class={['field', { disabled: field.disabled }]} data-testid="settings-field-{field.id}">
		<span class="label">{field.label}</span>
		<input
			type="text"
			value={textValue}
			disabled={field.disabled}
			oninput={(event) => commitText(event.currentTarget.value)}
			onchange={() => field.onCommit?.()}
		/>
	</label>
{:else if field.kind === 'color'}
	<label
		class={['field', 'color', { disabled: field.disabled }]}
		data-testid="settings-field-{field.id}"
	>
		<span class="label">{field.label}</span>
		<div class="color-row">
			<input
				type="color"
				value={textValue}
				disabled={field.disabled}
				oninput={(event) => commitColor(event.currentTarget.value)}
			/>
			<input
				class="hex"
				type="text"
				spellcheck="false"
				value={textValue}
				disabled={field.disabled}
				onchange={(event) => commitColor(event.currentTarget.value)}
			/>
		</div>
	</label>
{:else if field.kind === 'button'}
	<button class="action" type="button" data-testid="settings-field-{field.id}" onclick={field.onClick}>
		{field.label}
	</button>
{/if}

<style>
	.field {
		display: grid;
		gap: 0.35rem;
	}

	.field.disabled {
		opacity: 0.5;
	}

	.label {
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: #cfe8d8;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
	}

	.detail {
		font-weight: 650;
		letter-spacing: 0.02em;
		color: #9fe0b8;
		font-variant-numeric: tabular-nums;
	}

	.number-row,
	.color-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	input,
	select,
	button {
		font: inherit;
		color: #f3fff7;
		border: 1px solid rgba(164, 214, 186, 0.28);
		border-radius: 8px;
		background: rgba(8, 20, 14, 0.55);
	}

	input[type='range'] {
		flex: 1 1 auto;
		min-width: 0;
		accent-color: #5ee08a;
		background: transparent;
		border: none;
		padding: 0;
	}

	.numeric {
		width: 5.2rem;
		padding: 0.35rem 0.45rem;
		text-align: right;
	}

	input[type='text'],
	select {
		width: 100%;
		padding: 0.45rem 0.55rem;
	}

	input[type='color'] {
		width: 2.4rem;
		height: 2rem;
		padding: 0.15rem;
		cursor: pointer;
	}

	.hex {
		flex: 1 1 auto;
		padding: 0.4rem 0.5rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.8rem;
	}

	.toggle {
		grid-template-columns: 1fr auto;
		align-items: center;
		gap: 0.8rem;
	}

	.toggle input {
		width: 2.6rem;
		height: 1.4rem;
		appearance: none;
		border-radius: 999px;
		background: rgba(234, 246, 255, 0.16);
		position: relative;
		cursor: pointer;
	}

	.toggle input:checked {
		background: #39d353;
		border-color: #39d353;
	}

	.toggle input::after {
		content: '';
		position: absolute;
		top: 0.12rem;
		left: 0.14rem;
		width: 1.02rem;
		height: 1.02rem;
		border-radius: 50%;
		background: #f4fff7;
		transition: transform 0.15s ease;
	}

	.toggle input:checked::after {
		transform: translateX(1.15rem);
	}

	.action {
		justify-self: start;
		padding: 0.5rem 0.85rem;
		font-weight: 700;
		cursor: pointer;
	}

	.action:hover {
		border-color: rgba(159, 232, 255, 0.55);
		background: rgba(30, 55, 42, 0.9);
	}
</style>
