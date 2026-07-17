import { Group, Object3D, Vector3 } from 'three';
import { BALANCE } from '../config/balance';
import type { MissionPhase, SquadronMemberSnapshot, SquadronState } from '../types';
import type { Target } from '../combat/Target';
import { damp } from '../utils/math';
import { SquadronJet } from './SquadronJet';

export type SquadronAttackCallback = (jet: SquadronJet, target: Target, canDamage: boolean) => void;

interface Member {
	jet: SquadronJet;
	offset: Vector3;
	stateTime: number;
	attackCooldown: number;
	attackIndex: number;
}

const _desired = new Vector3();
const _direction = new Vector3();
const _lookAt = new Vector3();

export class SquadronController extends Group {
	readonly jets: readonly SquadronJet[];
	private readonly members: Member[];
	private elapsed = 0;
	private assistedKills = 0;

	constructor() {
		super();
		this.name = 'ViperSquadron';
		const callsigns = ['Viper Two', 'Viper Three', 'Viper Four'] as const;
		const colors = [0x788c90, 0x7f8784, 0x708387] as const;
		const offsets = [new Vector3(-30, 7, 30), new Vector3(30, 9, 38), new Vector3(0, 14, 62)];
		this.members = callsigns.map((callsign, index) => {
			const jet = new SquadronJet(callsign, colors[index]);
			this.add(jet);
			return {
				jet,
				offset: offsets[index],
				stateTime: 0,
				attackCooldown: 5 + index * 2.2,
				attackIndex: index
			};
		});
		this.jets = this.members.map((member) => member.jet);
	}

	reset(player: Object3D): void {
		this.elapsed = 0;
		this.assistedKills = 0;
		for (let index = 0; index < this.members.length; index += 1) {
			const member = this.members[index];
			member.jet.state = 'formation';
			member.jet.health = 100;
			member.jet.active = true;
			member.stateTime = 0;
			member.attackCooldown = 5 + index * 2.2;
			this.formationPosition(player, member.offset, _desired);
			member.jet.position.copy(_desired);
			member.jet.quaternion.copy(player.quaternion);
		}
	}

	update(
		delta: number,
		phase: MissionPhase,
		player: Object3D,
		targets: readonly Target[],
		onAttack: SquadronAttackCallback
	): void {
		this.elapsed += delta;
		for (const member of this.members) {
			member.stateTime += delta;
			this.updateState(member, phase);
			this.chooseDestination(member, player, targets, _desired);
			const previousX = member.jet.position.x;
			const previousY = member.jet.position.y;
			const previousZ = member.jet.position.z;
			const followsFormation =
				member.jet.state === 'formation' ||
				member.jet.state === 'approach' ||
				member.jet.state === 'regroup' ||
				member.jet.state === 'egress' ||
				member.jet.state === 'victory-flyover';
			const sharpness = member.jet.state === 'attack-run' ? 1.65 : 3.4;
			member.jet.position.set(
				damp(member.jet.position.x, _desired.x, sharpness, delta),
				damp(member.jet.position.y, _desired.y, sharpness, delta),
				damp(member.jet.position.z, _desired.z, sharpness, delta)
			);
			member.jet.velocity
				.set(
					member.jet.position.x - previousX,
					member.jet.position.y - previousY,
					member.jet.position.z - previousZ
				)
				.multiplyScalar(delta > 0 ? 1 / delta : 0);
			if (followsFormation) {
				const rotationBlend = 1 - Math.exp(-4.5 * delta);
				member.jet.quaternion.slerp(player.quaternion, rotationBlend);
			} else if (member.jet.velocity.lengthSq() > 1) {
				_lookAt.copy(member.jet.position).add(member.jet.velocity);
				member.jet.lookAt(_lookAt);
				member.jet.rotateY(Math.PI);
			}
			member.jet.updateVisual(this.elapsed, member.jet.state === 'attack-run' ? 1 : 0.25);
			this.tryAttack(member, delta, targets, onAttack);
		}
	}

	registerAssistedKill(): void {
		this.assistedKills = Math.min(BALANCE.squadron.maxAssistedKills, this.assistedKills + 1);
	}

	snapshot(playerPosition: Vector3): SquadronMemberSnapshot[] {
		return this.members.map(({ jet }) => ({
			callsign: jet.callsign,
			state: jet.state,
			health: jet.health,
			position: { x: jet.position.x, y: jet.position.y, z: jet.position.z },
			distance: jet.position.distanceTo(playerPosition),
			active: jet.active
		}));
	}

	private updateState(member: Member, phase: MissionPhase): void {
		let desired: SquadronState = member.jet.state;
		if (phase === 'approach') desired = member.stateTime < 2 ? 'formation' : 'approach';
		else if (phase === 'combat-zone' || phase === 'first-lock') desired = 'formation';
		else if (phase === 'strikes') {
			// Only one wingman leaves formation at a time for a short attack run.
			const activeAttacker = Math.floor(this.elapsed / 7) % this.members.length;
			desired = member.attackIndex === activeAttacker ? 'attack-run' : 'formation';
		} else if (phase === 'final-target') desired = 'formation';
		else if (phase === 'egress') desired = 'regroup';
		else if (phase === 'complete') desired = 'victory-flyover';
		if (desired !== member.jet.state) {
			member.jet.state = desired;
			member.stateTime = 0;
		}
	}

	private chooseDestination(
		member: Member,
		player: Object3D,
		targets: readonly Target[],
		out: Vector3
	): void {
		switch (member.jet.state) {
			case 'formation':
			case 'approach':
			case 'regroup':
				this.formationPosition(player, member.offset, out);
				break;
			case 'break': {
				const side = member.attackIndex % 2 === 0 ? -1 : 1;
				out.set(side * (480 + member.attackIndex * 120), 360 + member.attackIndex * 55, -2600);
				break;
			}
			case 'attack-run': {
				const target = this.attackTarget(member, targets);
				if (target) {
					out.copy(target.position);
					out.y += 70 + member.attackIndex * 16;
					out.z += 420;
				} else {
					this.formationPosition(player, member.offset, out);
				}
				break;
			}
			case 'egress':
				this.formationPosition(player, member.offset, out);
				break;
			case 'victory-flyover':
				this.formationPosition(player, member.offset, out);
				out.y += Math.sin(this.elapsed * 0.7 + member.attackIndex) * 8;
				break;
		}
	}

	private tryAttack(
		member: Member,
		delta: number,
		targets: readonly Target[],
		onAttack: SquadronAttackCallback
	): void {
		if (member.jet.state !== 'attack-run') return;
		member.attackCooldown -= delta;
		if (member.attackCooldown > 0) return;
		const target = this.attackTarget(member, targets);
		if (target && member.jet.position.distanceToSquared(target.position) < 1800 * 1800) {
			onAttack(member.jet, target, this.assistedKills < BALANCE.squadron.maxAssistedKills);
		}
		member.attackCooldown = BALANCE.squadron.attackInterval + member.attackIndex * 1.7;
	}

	private attackTarget(member: Member, targets: readonly Target[]): Target | null {
		let activeCount = 0;
		for (const target of targets) {
			if (target.enabled && !target.destroyed && !target.isFinal) activeCount += 1;
		}
		if (activeCount === 0) return null;
		const selectedIndex = member.attackIndex % activeCount;
		let activeIndex = 0;
		for (const target of targets) {
			if (!target.enabled || target.destroyed || target.isFinal) continue;
			if (activeIndex === selectedIndex) return target;
			activeIndex += 1;
		}
		return null;
	}

	private formationPosition(player: Object3D, offset: Vector3, out: Vector3): void {
		_direction.copy(offset).applyQuaternion(player.quaternion);
		out.copy(player.position).add(_direction);
	}
}
