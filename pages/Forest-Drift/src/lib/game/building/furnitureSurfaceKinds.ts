import type { FurnitureKind } from './FurnitureTypes';
import type { MaterialKind } from './MaterialTypes';

/** Shared by the placed furniture and catalogue preview: frames are wood, upholstery is cloth. */
export function furnitureSecondaryKind(kind: FurnitureKind): MaterialKind {
	return kind === 'bed' || kind === 'chair' || kind === 'stool'
		? 'mini-build-fabric'
		: 'furniture-accent';
}
