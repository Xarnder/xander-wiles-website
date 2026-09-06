/**
 * Human-readable world seeds, in the same kebab-case shape as the project's existing default seed
 * (`peaceful-world`) so a generated seed looks like something a person could have typed — and so it
 * can be read aloud, shared, and re-entered by hand to get the same world back.
 *
 * The seed is only ever used as a *string* by the noise samplers (see TerrainHeightSampler /
 * VegetationRegionSampler `setSeed`), so any string works; these word lists exist purely to make the
 * default pleasant rather than to add entropy.
 */
const ADJECTIVES = [
	'quiet',
	'peaceful',
	'misty',
	'golden',
	'amber',
	'hidden',
	'wandering',
	'gentle',
	'ancient',
	'silver',
	'drifting',
	'still',
	'shaded',
	'hollow',
	'sunlit',
	'northern',
	'wild',
	'soft',
	'distant',
	'quietest'
] as const;

const NOUNS = [
	'forest',
	'valley',
	'meadow',
	'ridge',
	'grove',
	'hollow',
	'pines',
	'birches',
	'highlands',
	'clearing',
	'creek',
	'thicket',
	'plateau',
	'basin',
	'foothills',
	'moor',
	'glade',
	'woods',
	'summit',
	'lowlands'
] as const;

function pick<T>(values: readonly T[], random: () => number): T {
	return values[Math.floor(random() * values.length) % values.length];
}

/**
 * `random` is injectable so tests can produce a deterministic seed; production callers use the
 * default `Math.random` (seed generation itself doesn't need to be reproducible — the *world* does,
 * and it is, because the generated seed is then stored).
 */
export function generateWorldSeed(random: () => number = Math.random): string {
	const suffix = Math.floor(random() * 1000)
		.toString()
		.padStart(3, '0');
	return `${pick(ADJECTIVES, random)}-${pick(NOUNS, random)}-${suffix}`;
}

/** Default name offered for a brand-new world, matching the seed's readable style. */
export function generateWorldName(existingNames: readonly string[] = []): string {
	const base = 'New World';
	if (!existingNames.includes(base)) return base;
	for (let n = 2; n < 1000; n++) {
		const candidate = `${base} ${n}`;
		if (!existingNames.includes(candidate)) return candidate;
	}
	return `${base} ${Date.now()}`;
}

/**
 * Names are display labels, never identity (world identity is the UUID), so duplicates are allowed —
 * this only guarantees a non-empty, length-bounded, trimmed string so the UI and export filenames
 * always have something sane to work with.
 */
export function normalizeWorldName(name: string, fallback = 'Untitled World'): string {
	const trimmed = name.trim().replace(/\s+/g, ' ');
	if (trimmed.length === 0) return fallback;
	return trimmed.slice(0, 80);
}
