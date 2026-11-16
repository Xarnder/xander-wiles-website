import type { MapWorldSettings } from './mapWorld';

/** Messages to the biome map worker (technical plan §8). */
export type ToMapWorker =
	| { t: 'init'; generation: number; settings: MapWorldSettings }
	| { t: 'tile'; generation: number; key: string; level: number; tx: number; tz: number }
	| { t: 'cancel'; key: string };

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
	| { t: 'error'; message: string };
