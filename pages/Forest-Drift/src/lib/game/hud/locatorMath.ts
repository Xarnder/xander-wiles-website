/**
 * Locator bar maths: where along the bar a target sits, from the camera's horizontal heading.
 * Pure numbers (no Three.js), so it's cheap per frame and easy to test.
 */

/**
 * Horizontal field of view (radians) from the camera's vertical one (degrees), its aspect ratio
 * and zoom — the same frustum Three.js renders with.
 */
export function horizontalFov(verticalFovDegrees: number, aspect: number, zoom = 1): number {
	const halfVertical = (verticalFovDegrees * Math.PI) / 360;
	const effectiveHalf = Math.atan(Math.tan(halfVertical) / Math.max(zoom, 1e-6));
	return 2 * Math.atan(Math.tan(effectiveHalf) * aspect);
}

/**
 * Signed horizontal angle (radians) from the camera's forward direction to the target direction,
 * both on the XZ plane: 0 straight ahead, positive to the right, ±π behind. NaN when either
 * direction has no horizontal length (looking straight down, or standing on the target).
 */
export function signedHorizontalAngle(
	forwardX: number,
	forwardZ: number,
	toTargetX: number,
	toTargetZ: number
): number {
	if (forwardX * forwardX + forwardZ * forwardZ < 1e-12) return Number.NaN;
	if (toTargetX * toTargetX + toTargetZ * toTargetZ < 1e-12) return Number.NaN;
	// With Y up, the camera's right on the XZ plane is (−forward.z, forward.x).
	const along = forwardX * toTargetX + forwardZ * toTargetZ;
	const across = -forwardZ * toTargetX + forwardX * toTargetZ;
	return Math.atan2(across, along);
}

/**
 * Pixel X along a bar `width` wide for a target at `angle`: the middle is straight ahead and the
 * ends are the edges of the horizontal field of view. Null when the target is behind the camera or
 * outside that view (its marker is hidden).
 */
export function locatorX(
	angle: number,
	horizontalFovRadians: number,
	width: number
): number | null {
	if (!Number.isFinite(angle) || width <= 0) return null;
	const halfView = Math.min(horizontalFovRadians / 2, Math.PI / 2);
	if (Math.abs(angle) > halfView) return null;
	return (angle / halfView) * (width / 2) + width / 2;
}
