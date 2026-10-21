import { PLAYER_BODY as BODY } from './PlayerBodyDimensions';
import type { GridVec3, MiniBuildInteractionType } from '../miniBuild/MiniBuildTypes';

/** Avatar-specific offsets stay out of authored Mini Build data. The plane is the
 * pelvis support point. Lie rotates the standing body -90° about local X (head -Z). */
export function resolvePlayerInteractionPose(
	action: MiniBuildInteractionType,
	anchor: GridVec3,
	yaw: number
) {
	const lying = action === 'lie';
	const support = lying ? BODY.bodyDepth / 2 - BODY.pelvisDepthOffset : BODY.bodyDepth * 0.16;
	const eyeAbovePelvis = BODY.eyeHeight - BODY.pelvisHeight;
	const forward = lying ? eyeAbovePelvis : 0;
	return {
		action,
		anchor,
		yaw,
		eye: {
			x: anchor.x - Math.sin(yaw) * forward,
			y: anchor.y + support + (lying ? 0 : eyeAbovePelvis),
			z: anchor.z - Math.cos(yaw) * forward
		},
		pitch: lying ? Math.PI / 3 : 0,
		pelvisSupportOffset: support,
		bodyTilt: lying ? -Math.PI / 2 : 0,
		// The normalized mesh faces -Z. Turn it before reclining so its face points up,
		// while the authored -Z arrow still points toward the head.
		bodyYawOffset: lying ? Math.PI : 0
	};
}
export type PlayerInteractionPose = ReturnType<typeof resolvePlayerInteractionPose>;
