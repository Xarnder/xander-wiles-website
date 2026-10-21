import type { MiniBuildInteractionRef, OccupiedMiniBuildInteraction } from '../net/protocol';
import type { GridVec3 } from '../miniBuild/MiniBuildTypes';
import type { ResolvedMiniBuildInteraction } from '../miniBuild/MiniBuildInteractions';
import { MINI_BUILD_INTERACTION_RANGE } from '../miniBuild/MiniBuildInteractions';
import { resolvePlayerInteractionPose } from './PlayerInteractionPoseResolver';
import type { FirstPersonController } from './FirstPersonController';

export class InteractionOccupancyManager {
	private readonly owners = new Map<string, string>();
	private key(instance: string, location: string) {
		return JSON.stringify([instance, location]);
	}
	available(instance: string, location: string, player = 'local'): boolean {
		const owner = this.owners.get(this.key(instance, location));
		return !owner || owner === player;
	}
	claim(instance: string, location: string, player = 'local'): boolean {
		if (!this.available(instance, location, player)) return false;
		this.owners.set(this.key(instance, location), player);
		return true;
	}
	sync(locations: OccupiedMiniBuildInteraction[], self: string): void {
		this.owners.clear();
		for (const l of locations)
			this.owners.set(
				this.key(l.instanceId, l.locationId),
				l.playerId === self ? 'local' : l.playerId
			);
	}
	otherLocations(): MiniBuildInteractionRef[] {
		return [...this.owners]
			.filter(([, owner]) => owner !== 'local')
			.map(([key]) => {
				const [instanceId, locationId] = JSON.parse(key) as [string, string];
				return { instanceId, locationId };
			});
	}

	release(instance: string, location: string, player = 'local') {
		const key = this.key(instance, location);
		if (this.owners.get(key) === player) this.owners.delete(key);
	}
}
export interface InteractionTarget extends ResolvedMiniBuildInteraction {
	score: number;
}
export function chooseInteraction(
	locations: readonly ResolvedMiniBuildInteraction[],
	eye: GridVec3,
	hit: GridVec3,
	available: (location: ResolvedMiniBuildInteraction) => boolean
): ResolvedMiniBuildInteraction | null {
	let best: ResolvedMiniBuildInteraction | null = null,
		score = Infinity;
	for (const location of locations) {
		const p = location.position;
		const distance = Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z);
		if (distance > MINI_BUILD_INTERACTION_RANGE || !available(location)) continue;
		const rank = Math.hypot(p.x - hit.x, p.y - hit.y, p.z - hit.z) + distance * 0.15;
		if (rank < score || (rank === score && location.locationId < best!.locationId)) {
			best = location;
			score = rank;
		}
	}
	return best;
}
export interface InteractionHost {
	player: FirstPersonController;
	pick: () => ResolvedMiniBuildInteraction | null;
	resolve: (instanceId: string, locationId: string) => ResolvedMiniBuildInteraction | null;
	blocked: (location: ResolvedMiniBuildInteraction) => boolean;
	exitPosition: (location: ResolvedMiniBuildInteraction, entry: GridVec3) => GridVec3;
	inputAllowed: () => boolean;
	onPrompt: (prompt: InteractionPrompt | null) => void;
}
export interface InteractionPrompt {
	label: string;
	active: boolean;
	type: 'sit' | 'lie';
}
export type PlayerInteractionState =
	| { type: 'none' }
	| { type: 'mini-build'; location: ResolvedMiniBuildInteraction; entry: GridVec3 };

/** Owns only the active player interaction, never scans the world's definitions. */
export class PlayerInteractionController {
	state: PlayerInteractionState = { type: 'none' };
	target: ResolvedMiniBuildInteraction | null = null;
	readonly occupancy = new InteractionOccupancyManager();
	private elapsed = 0;
	onStateChange: ((location: MiniBuildInteractionRef | null) => void) | null = null;
	private promptKey = '';
	constructor(readonly host: InteractionHost) {
		host.player.onInteractionExit = () => this.exit();
	}
	update(dt: number): void {
		if (this.state.type === 'mini-build') {
			const old = this.state.location;
			if (!this.host.player.interactionPose) {
				this.occupancy.release(old.instanceId, old.locationId);
				this.state = { type: 'none' };
				this.onStateChange?.(null);
				this.publish(null);
				return;
			}
			const next = this.host.resolve(old.instanceId, old.locationId);
			if (
				!next ||
				next.revision !== old.revision ||
				next.designId !== old.designId ||
				next.yaw !== old.yaw ||
				Math.hypot(
					next.position.x - old.position.x,
					next.position.y - old.position.y,
					next.position.z - old.position.z
				) > 0.001 ||
				!this.host.player.interactionPose
			) {
				this.exit();
				return;
			}
		}
		this.elapsed += dt;
		if (this.elapsed < 0.1) return;
		this.elapsed = 0;
		if (this.state.type === 'mini-build') {
			if (this.host.blocked(this.state.location)) {
				this.exit();
				return;
			}
			this.publish({ label: 'Stand up', active: true, type: this.state.location.type });
			return;
		}
		this.target = this.host.inputAllowed() ? this.host.pick() : null;
		this.publish(
			this.target
				? {
						label: this.target.type === 'sit' ? 'Sit' : 'Lie Down',
						active: false,
						type: this.target.type
					}
				: null
		);
	}
	toggle(): boolean {
		if (!this.host.inputAllowed()) return false;
		if (this.state.type === 'mini-build') {
			this.exit();
			return true;
		}
		const location = this.host.pick();
		if (
			!location ||
			this.host.blocked(location) ||
			!this.occupancy.claim(location.instanceId, location.locationId)
		)
			return false;
		this.state = { type: 'mini-build', location, entry: { ...this.host.player.worldPosition } };
		this.onStateChange?.({ instanceId: location.instanceId, locationId: location.locationId });
		this.host.player.beginInteraction(
			resolvePlayerInteractionPose(location.type, location.position, location.yaw)
		);
		this.publish({ label: 'Stand up', active: true, type: location.type });
		return true;
	}
	exit(): void {
		if (this.state.type === 'none') return;
		const { location, entry } = this.state;
		this.state = { type: 'none' };
		this.occupancy.release(location.instanceId, location.locationId);
		this.host.player.endInteraction(this.host.exitPosition(location, entry));
		this.onStateChange?.(null);
		this.target = null;
		this.publish(null);
	}
	private publish(prompt: InteractionPrompt | null) {
		const key = JSON.stringify(prompt);
		if (key === this.promptKey) return;
		this.promptKey = key;
		this.host.onPrompt(prompt);
	}
	dispose(): void {
		this.exit();
		this.host.player.onInteractionExit = null;
	}
}
