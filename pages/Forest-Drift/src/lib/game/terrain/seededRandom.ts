/**
 * Deterministic string -> PRNG helpers. No Math.random() anywhere in this module: the same
 * seed string must always produce the same numeric sequence, on any client, forever.
 */

/** cyrb53 string hash — fast, well distributed, fully deterministic. */
export function hashStringToUint32(text: string, salt = 0): number {
	let h1 = 0xdeadbeef ^ salt;
	let h2 = 0x41c6ce57 ^ salt;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (h1 >>> 0) ^ (h2 >>> 0);
}

/** mulberry32 — tiny, fast, deterministic PRNG producing floats in [0, 1). */
export function createMulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return function next() {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Derives an independent, deterministic PRNG for a named sub-purpose of a world seed. */
export function createNamedRandom(worldSeed: string, name: string): () => number {
	const combined = hashStringToUint32(`${worldSeed}::${name}`);
	return createMulberry32(combined);
}
