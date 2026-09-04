import * as THREE from 'three';

/**
 * World-space direction *toward* the sun from elevation/azimuth angles (degrees). Pure and
 * deterministic — same angles always produce the same unit vector, in Node or the browser, which
 * is what SkySystem.spec.ts asserts. Writes into `out` when provided, matching this codebase's
 * "reuse a scratch object, don't allocate on a hot path" convention elsewhere.
 */
export function sunDirectionFromAngles(
	elevationDegrees: number,
	azimuthDegrees: number,
	out: THREE.Vector3 = new THREE.Vector3()
): THREE.Vector3 {
	const elevation = THREE.MathUtils.degToRad(elevationDegrees);
	const azimuth = THREE.MathUtils.degToRad(azimuthDegrees);
	const cosElevation = Math.cos(elevation);
	out.set(cosElevation * Math.sin(azimuth), Math.sin(elevation), cosElevation * Math.cos(azimuth));
	return out.normalize();
}

/**
 * The colour `scene.fog` should use: the sky's horizon colour when `matchHorizon` is on (the
 * default — see SkyTypes.ts), otherwise the explicit `fogColor` setting. Deterministic and pure,
 * so terrain/forest/sky reliably "feel like the same atmosphere" without any hidden state.
 */
export function resolveFogColor(
	horizonColorHex: string,
	fogColorHex: string,
	matchHorizon: boolean
): THREE.Color {
	return new THREE.Color(matchHorizon ? horizonColorHex : fogColorHex);
}
