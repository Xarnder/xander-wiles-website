/// <reference lib="webworker" />
import { generateMaterialMaps } from './generateMaterialMaps';
import type { MaterialMapRequest, MaterialMapResponse } from './MaterialMapSource';

/**
 * Texture generation off the main thread: at high quality a single material takes ~0.5 s of pure
 * number crunching, which would otherwise be a visible hitch while a world loads. The worker runs
 * the exact same pure `generateMaterialMaps` the main thread would, so output is byte-identical.
 */
self.onmessage = (event: MessageEvent<MaterialMapRequest>) => {
	const { id, recipe } = event.data;
	try {
		const data = generateMaterialMaps(recipe);
		const response: MaterialMapResponse = { id, data };
		(self as unknown as Worker).postMessage(response, [
			data.albedo.buffer,
			data.normal.buffer,
			data.orm.buffer
		]);
	} catch (error) {
		const response: MaterialMapResponse = { id, error: String(error) };
		(self as unknown as Worker).postMessage(response);
	}
};
