import { LAKE_SURFACE_LIFT, RIVER_SURFACE_LIFT } from './HydrologyMath';
import type { HydrologySample } from './HydrologyTypes';

/**
 * The camera is under the rendered water plane and still above the bed.
 * Wading with the camera above the plane is not underwater, and a camera that has
 * passed through the ground is not either.
 */
export function cameraIsUnderwater(
	cameraY: number,
	sample: Pick<HydrologySample, 'waterType' | 'waterSurfaceY' | 'terrainY'>
): boolean {
	if (sample.waterType === 'none' || !Number.isFinite(sample.waterSurfaceY)) return false;
	const lift = sample.waterType === 'lake' ? LAKE_SURFACE_LIFT : RIVER_SURFACE_LIFT;
	const plane = sample.waterSurfaceY + lift;
	return cameraY < plane && cameraY > sample.terrainY;
}

/** Full-view blue wash while the camera is under the water plane. Sits on the canvas only. */
export class UnderwaterTint {
	private readonly element: HTMLDivElement;

	constructor(container: HTMLElement) {
		const element = document.createElement('div');
		element.dataset.testid = 'underwater-tint';
		element.setAttribute('aria-hidden', 'true');
		element.style.position = 'absolute';
		element.style.inset = '0';
		element.style.pointerEvents = 'none';
		element.style.opacity = '0';
		element.style.zIndex = '1';
		element.style.background = 'rgba(24, 104, 176, 0.42)';
		element.style.boxShadow = 'inset 0 0 160px 46px rgba(6, 42, 86, 0.62)';
		element.style.transition = 'opacity 80ms linear';
		container.appendChild(element);
		this.element = element;
	}

	setActive(active: boolean): void {
		this.element.style.opacity = active ? '1' : '0';
	}

	get active(): boolean {
		return this.element.style.opacity === '1';
	}

	dispose(): void {
		this.element.remove();
	}
}
