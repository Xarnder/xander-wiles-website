<script lang="ts">
	let { line }: { line: string } = $props();

	// Format existing hints without changing the strings also used by touch controls.
	function partsFor(text: string) {
		const keys =
			/(?<![\w])(?:Left[ -][Cc]lick|Right[ -][Cc]lick|Middle[ -][Cc]lick|Backspace|PageUp|PageDown|Escape|Enter|Shift|Ctrl|Alt|Space|Delete|Esc|Click|Left(?=:)|Right(?=:)|[A-Z0-9↑↓←→\[\]−+])(?=$|[\s:/+),.·])/g;
		const parts: { text: string; key: boolean }[] = [];
		let end = 0;
		for (const match of text.matchAll(keys)) {
			const key = match[0];
			const before = text.slice(0, match.index);
			// A letter in a name or a measurement is not a keyboard shortcut.
			if (
				/^[A-Z0-9↑↓←→\[\]−+]$/.test(key) &&
				!(
					(before.trim() === '' && !/^[0-9]$/.test(key)) ||
					/[·(+/]\s*$/.test(before) ||
					/\b(?:Hold|hold|Press|press)\s+$/.test(before) ||
					text[match.index + key.length] === ':' ||
					(parts.at(-1)?.key && before.slice(end).trim() === '')
				)
			)
				continue;
			if (match.index > end) parts.push({ text: text.slice(end, match.index), key: false });
			parts.push({ text: key, key: true });
			end = match.index + key.length;
		}
		if (end < text.length) parts.push({ text: text.slice(end), key: false });
		return parts;
	}

	const parts = $derived(partsFor(line));
	const heading = $derived(/^[A-Z][A-Z /-]+$/.test(line));
</script>

<div class="hint" class:heading>
	{#each parts as part}
		{#if part.key}<kbd>{part.text}</kbd>{:else}{part.text}{/if}
	{/each}
</div>

<style>
	.hint {
		color: #d3ddd7;
		font-weight: 450;
		white-space: normal;
	}

	.heading {
		color: #f0f5f1;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.065em;
	}

	kbd {
		display: inline-block;
		box-sizing: border-box;
		min-width: 15px;
		height: 15px;
		padding: 0 3px;
		border: 1px solid rgba(185, 213, 196, 0.32);
		border-radius: 3px;
		background: #354b40;
		box-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
		color: #f0f8e9;
		font:
			600 10px/13px system-ui,
			sans-serif;
		text-align: center;
		vertical-align: 1px;
		white-space: nowrap;
	}
</style>
