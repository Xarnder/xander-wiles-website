import manifest from '../characters/assets/character.manifest.json' with { type: 'json' };

/** Metres, measured from the normalized character.glb bind pose (including clothing).
 * Interaction anchors are pelvis support points: sit = seat surface, lie = back support
 * below the pelvis. Local -Z means facing forward for sit and toward the head for lie.
 */
export const PLAYER_BODY = {
	standingHeight: manifest.height,
	bodyWidth: 0.995,
	bodyDepth: 0.51,
	pelvisHeight: 0.75,
	pelvisDepthOffset: -0.021,
	/** Sole-to-pelvis drop measured after applying the seated skeleton pose. */
	seatedFootDrop: 0.453,
	eyeHeight: 1.7,
	upperLegLength: 0.267,
	lowerLegLength: 0.29,
	collisionRadius: 0.35,
	clearance: 0.06
} as const;
export const PLAYER_INTERACTION_BODY = {
	width: PLAYER_BODY.bodyWidth + PLAYER_BODY.clearance,
	seatedBelowSupport:
		PLAYER_BODY.seatedFootDrop - PLAYER_BODY.bodyDepth * 0.16 + PLAYER_BODY.clearance,
	seatedHeight:
		PLAYER_BODY.standingHeight -
		PLAYER_BODY.pelvisHeight +
		PLAYER_BODY.seatedFootDrop +
		PLAYER_BODY.clearance * 2,
	seatedDepth: PLAYER_BODY.bodyDepth + PLAYER_BODY.upperLegLength + PLAYER_BODY.clearance,
	lyingLength: PLAYER_BODY.standingHeight + PLAYER_BODY.clearance,
	lyingThickness: PLAYER_BODY.bodyDepth + PLAYER_BODY.clearance
} as const;
