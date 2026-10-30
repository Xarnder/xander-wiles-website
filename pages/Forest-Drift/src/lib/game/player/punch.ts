/**
 * Punching other players (online only), shared by the browser and the multiplayer room. The
 * browser picks the target it is aiming at; the room decides whether the punch lands and how much
 * it costs, from the poses it already has. Keep this module free of Three.js and DOM imports.
 */

/** Points one punch takes (of 36): eighteen punches from full. */
export const PUNCH_DAMAGE = 2;
/** How far a punch reaches from the eye, metres. */
export const PUNCH_REACH = 2.5;
/** Minimum time between two punches by the same player, ms (the room enforces it). */
export const PUNCH_COOLDOWN_MS = 500;
/** How long the punching arm stays out (others see it as the reach pose), ms. */
export const PUNCH_SWING_MS = 250;

/**
 * The body, feet to head, is tested every 10 cm along its centre line. The head matters: a level
 * look from 1.7 m passes at head height, and even more so at someone standing a little downhill.
 */
const BODY_SAMPLE_HEIGHTS = Array.from({ length: 17 }, (_, index) => 0.2 + index * 0.1);
/** How far the aim may pass from the body's centre line and still connect, metres. */
const BODY_RADIUS = 0.6;

/** The room's allowance for movement and latency between the two players' last poses. */
const ROOM_REACH_SLACK = 2;
const ROOM_MAX_HEIGHT_GAP = 2.5;
/** Within this, facing isn't checked (players overlapping can face any way). */
const ROOM_FACING_FREE_DISTANCE = 1;
/** The room accepts a punch aimed within this angle of where the attacker faces. */
const ROOM_MAX_FACING_ANGLE = (75 * Math.PI) / 180;

export interface PunchCandidate {
	slot: number;
	/** Feet position. */
	x: number;
	y: number;
	z: number;
}

/**
 * The player the local aim connects with: the nearest one whose body passes within reach of the
 * look ray. `eye` is the local eye position; yaw and pitch follow FirstPersonController.
 */
export function findPunchTarget(
	eye: { x: number; y: number; z: number },
	yaw: number,
	pitch: number,
	candidates: readonly PunchCandidate[]
): number | null {
	const dx = -Math.sin(yaw) * Math.cos(pitch);
	const dy = Math.sin(pitch);
	const dz = -Math.cos(yaw) * Math.cos(pitch);
	let best: { slot: number; along: number } | null = null;
	for (const candidate of candidates) {
		for (const height of BODY_SAMPLE_HEIGHTS) {
			const px = candidate.x - eye.x;
			const py = candidate.y + height - eye.y;
			const pz = candidate.z - eye.z;
			const along = px * dx + py * dy + pz * dz;
			if (along <= 0 || along > PUNCH_REACH) continue;
			const perpendicular = Math.sqrt(Math.max(0, px * px + py * py + pz * pz - along * along));
			if (perpendicular > BODY_RADIUS) continue;
			if (!best || along < best.along) best = { slot: candidate.slot, along };
		}
	}
	return best?.slot ?? null;
}

/**
 * The room's check, from the last poses it accepted (feet positions, attacker yaw): close enough,
 * at a similar height, and roughly facing the target. Generous on purpose — the poses lag the real
 * movement by a frame or two on both sides — but enough to stop punches from across the map.
 */
export function punchPlausible(
	attacker: { x: number; y: number; z: number; yaw: number },
	target: { x: number; y: number; z: number }
): boolean {
	const dx = target.x - attacker.x;
	const dz = target.z - attacker.z;
	const horizontal = Math.hypot(dx, dz);
	if (horizontal > PUNCH_REACH + ROOM_REACH_SLACK) return false;
	if (Math.abs(target.y - attacker.y) > ROOM_MAX_HEIGHT_GAP) return false;
	if (horizontal <= ROOM_FACING_FREE_DISTANCE) return true;
	const fx = -Math.sin(attacker.yaw);
	const fz = -Math.cos(attacker.yaw);
	const cos = (dx * fx + dz * fz) / horizontal;
	return cos >= Math.cos(ROOM_MAX_FACING_ANGLE);
}
