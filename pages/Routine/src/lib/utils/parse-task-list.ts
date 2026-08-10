/**
 * Parse pasted checklist text into task titles.
 * Supports:
 * - Numbered lines: `1. Task`, `2) Task`, `3 - Task`
 * - Bullets: `- Task`, `* Task`, `• Task`
 * - Plain one-task-per-line text
 */
export function parseTaskListText(raw: string): string[] {
	const lines = raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	const titles: string[] = [];

	for (const line of lines) {
		const stripped = line
			.replace(/^\d+[.)\-:]\s*/, '')
			.replace(/^[-*•]\s*/, '')
			.trim();

		if (!stripped) continue;
		titles.push(stripped);
	}

	return titles;
}
