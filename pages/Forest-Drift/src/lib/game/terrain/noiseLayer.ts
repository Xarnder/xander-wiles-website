export type Noise2D = (x: number, y: number) => number;

/**
 * Fixed per-octave coordinate offsets. These decorrelate successive octaves of the same
 * noise function (otherwise every octave lines up around the same zero-crossings). They are
 * constant literals, not randomness, so they never break determinism.
 */
const OCTAVE_OFFSETS: readonly [number, number][] = [
	[0, 0],
	[127.1, 311.7],
	[269.5, 183.3],
	[419.2, 371.9],
	[512.7, 64.3],
	[153.4, 490.1],
	[601.2, 213.8],
	[88.9, 588.4]
];

/**
 * Fractal Brownian motion over a seeded 2D noise function. Returns a value normalized to
 * roughly [-1, 1] regardless of octave count. With `ridgeAmount` > 0 each octave is blended
 * toward `1 - |n| * 2` (folding the noise around its zero-crossings), which is the standard
 * "ridged multifractal" trick — it turns smooth Perlin/simplex noise into sharp ridge lines,
 * used here for the mountain recipe.
 */
export function fbm2D(
	noise2D: Noise2D,
	x: number,
	z: number,
	octaves: number,
	lacunarity: number,
	persistence: number,
	ridgeAmount: number
): number {
	let amplitude = 1;
	let frequency = 1;
	let sum = 0;
	let normalization = 0;

	const clampedOctaves = Math.max(1, Math.min(octaves, OCTAVE_OFFSETS.length));
	for (let i = 0; i < clampedOctaves; i++) {
		const [offsetX, offsetZ] = OCTAVE_OFFSETS[i];
		let n = noise2D(x * frequency + offsetX, z * frequency + offsetZ);

		if (ridgeAmount > 0) {
			const ridged = 1 - Math.abs(n) * 2;
			n = n * (1 - ridgeAmount) + ridged * ridgeAmount;
		}

		sum += n * amplitude;
		normalization += amplitude;
		amplitude *= persistence;
		frequency *= lacunarity;
	}

	return normalization > 0 ? sum / normalization : 0;
}
