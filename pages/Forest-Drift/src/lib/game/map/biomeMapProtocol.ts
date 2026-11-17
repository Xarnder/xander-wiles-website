import type { BiomePatch } from './biomeSearch';
import type { MapWorldSettings } from './mapWorld';

/** Messages to the biome map worker (technical plan §8). */
export type ToMapWorker =
	| { t: 'init'; generation: number; settings: MapWorldSettings }
	| { t: 'tile'; generation: number; key: string; level: number; tx: number; tz: number }
	| { t: 'cancel'; key: string }
	/** Find a biome: start (or restart) a scan centred on (x, z). */
	| { t: 'scan'; generation: number; id: number; x: number; z: number }
	/** Patches of `biome` from the current scan (answered once it's finished). */
	| { t: 'find'; generation: number; id: number; biome: number }
	/** Stop scanning (the full map closed); frees the grid. */
	| { t: 'cancelScan' };

/**
 * From the worker. A tile arrives twice when the world has water: first its land (as soon as it's
 * drawn), then with rivers and lakes on top, once the hydrology regions it needs are built.
 */
export type FromMapWorker =
	| {
			t: 'tile';
			generation: number;
			key: string;
			pixels: ArrayBuffer;
			water: boolean;
			final: boolean;
			ms: number;
	  }
	| { t: 'error'; message: string }
	/**
	 * A scan's progress, then its result (`done`). `nearest` (empty until done): metres to each
	 * biome's nearest pin, null for none within range. `here`: the biome under the centre.
	 */
	| {
			t: 'scanned';
			generation: number;
			id: number;
			done: boolean;
			nearest: (number | null)[];
			here: number;
			ms: number;
			sampled: number;
	  }
	| { t: 'found'; generation: number; id: number; patches: BiomePatch[]; ms: number };
