import {
	ArrowHelper,
	Euler,
	Group,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	Quaternion,
	SphereGeometry,
	Vector3
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../config/assetPaths';
import { BALANCE } from '../config/balance';
import type { MissionPhase, SquadronMemberSnapshot, SquadronMode } from '../types';
import type { Target } from '../combat/Target';
import { clamp, damp, moveTowards } from '../utils/math';
import { createSquadronFallbackModel, prepareFighterMaterials, SquadronJet } from './SquadronJet';

export type SquadronAttackCallback = (jet: SquadronJet, target: Target, canDamage: boolean) => void;

type WaypointPhase = 'approach' | 'attack' | 'break' | 'patrol';

interface Member {
	jet: SquadronJet;
	offset: Vector3;
	attackCooldown: number;
	attackIndex: number;
	speedBias: number;
	waypointPhase: WaypointPhase;
	waypointTime: number;
	passIndex: number;
	target: Target | null;
	firedThisPass: boolean;
	bank: number;
	targetVelocity: Vector3;
	formationTargetReady: boolean;
	debugTarget: Mesh<SphereGeometry, MeshBasicMaterial>;
	debugDirection: ArrowHelper;
}

const _desired = new Vector3();
const _direction = new Vector3();
const _desiredDirection = new Vector3();
const _desiredVelocity = new Vector3();
const _correction = new Vector3();
const _currentDirection = new Vector3();
const _turnAxis = new Vector3();
const _formationOffset = new Vector3();
const _previousTarget = new Vector3();
const _measuredTargetVelocity = new Vector3();
const _debugForward = new Vector3();
const _forward = new Vector3();
const _lookAt = new Vector3();
const _turn = new Quaternion();
const _fullTurn = new Quaternion();
const _orientationTarget = new Object3D();
const _playerEuler = new Euler(0, 0, 0, 'YXZ');
const _zeroVelocity = new Vector3();
const TAU = Math.PI * 2;

export class SquadronController extends Group {
	readonly jets: readonly SquadronJet[];
	private readonly members: Member[];
	private modeValue: SquadronMode = 'formation';
	private elapsed = 0;
	private assistedKills = 0;
	private debugVisibleValue = false;

	constructor() {
		super();
		this.name = 'ViperSquadron';
		const callsigns = ['Viper Two', 'Viper Three', 'Viper Four', 'Viper Five'] as const;
		const debugColors = [0x63ddff, 0x84ff9f, 0xffd66b, 0xff83d1] as const;
		const spacing = BALANCE.squadron.formationSpacing;
		const depth = BALANCE.squadron.formationDepth;
		const offsets = [
			new Vector3(-spacing, 0, depth),
			new Vector3(spacing, 0, depth),
			new Vector3(-spacing * 2, 0, depth * 2),
			new Vector3(spacing * 2, 0, depth * 2)
		];
		this.members = callsigns.map((callsign, index) => {
			const jet = new SquadronJet(callsign);
			const debugTarget = new Mesh(
				new SphereGeometry(6, 10, 8),
				new MeshBasicMaterial({
					color: debugColors[index],
					wireframe: true,
					transparent: true,
					opacity: 0.95,
					depthTest: false
				})
			);
			debugTarget.name = `${callsign} Target`;
			debugTarget.renderOrder = 1000;
			debugTarget.visible = false;
			const debugDirection = new ArrowHelper(
				new Vector3(0, 0, -1),
				new Vector3(),
				BALANCE.squadron.debugDirectionLength,
				debugColors[index],
				10,
				5
			);
			debugDirection.name = `${callsign} Direction`;
			debugDirection.visible = false;
			this.add(jet, debugTarget, debugDirection);
			return {
				jet,
				offset: offsets[index],
				attackCooldown: 5 + index * 2.2,
				attackIndex: index,
				speedBias: (index - 1.5) * 2,
				waypointPhase: 'patrol' as WaypointPhase,
				waypointTime: 0,
				passIndex: 0,
				target: null,
				firedThisPass: false,
				bank: 0,
				targetVelocity: new Vector3(),
				formationTargetReady: false,
				debugTarget,
				debugDirection
			};
		});
		this.jets = this.members.map((member) => member.jet);
	}

	/** Load the same fighter GLB used by the player (cloned per wingman). */
	async initialize(): Promise<boolean> {
		try {
			const gltf = await new GLTFLoader().loadAsync(ASSET_PATHS.fighterJet);
			prepareFighterMaterials(gltf.scene);
			for (const member of this.members) {
				member.jet.applyModel(gltf.scene.clone(true), false);
			}
			return true;
		} catch {
			for (const member of this.members) {
				member.jet.applyModel(createSquadronFallbackModel(), true);
			}
			return false;
		}
	}

	get mode(): SquadronMode {
		return this.modeValue;
	}

	get debugVisible(): boolean {
		return this.debugVisibleValue;
	}

	setDebugVisuals(enabled: boolean): void {
		this.debugVisibleValue = enabled;
		for (const member of this.members) {
			const visible = enabled && member.jet.active;
			member.debugTarget.visible = visible;
			member.debugDirection.visible = visible;
			if (visible) this.updateDebugVisual(member);
		}
	}

	toggleDebugVisuals(): boolean {
		this.setDebugVisuals(!this.debugVisibleValue);
		return this.debugVisibleValue;
	}

	setMode(mode: SquadronMode): void {
		if (mode === this.modeValue) return;
		this.modeValue = mode;
		for (const member of this.members) {
			member.target = null;
			member.waypointPhase = mode === 'formation' ? 'patrol' : 'approach';
			member.waypointTime = BALANCE.squadron.waypointTimeout;
			member.firedThisPass = false;
			member.jet.state = mode === 'formation' ? 'formation' : 'approach';
			member.formationTargetReady = false;
		}
	}

	toggleMode(): SquadronMode {
		this.setMode(this.modeValue === 'formation' ? 'free-squad' : 'formation');
		return this.modeValue;
	}

	reset(player: Object3D, leaderVelocity: Vector3 = _zeroVelocity): void {
		this.elapsed = 0;
		this.assistedKills = 0;
		this.modeValue = 'formation';
		_forward
			.set(0, 0, -1)
			.applyQuaternion(player.quaternion)
			.multiplyScalar(BALANCE.flight.cruiseSpeed);
		const initialVelocity = leaderVelocity.lengthSq() > 1 ? leaderVelocity : _forward;
		for (let index = 0; index < this.members.length; index += 1) {
			const member = this.members[index];
			member.jet.state = 'formation';
			member.jet.health = 100;
			member.jet.active = true;
			member.attackCooldown = 5 + index * 2.2;
			member.waypointPhase = 'patrol';
			member.waypointTime = 0;
			member.passIndex = 0;
			member.target = null;
			member.firedThisPass = false;
			member.bank = 0;
			this.formationPosition(player, member.offset, _desired);
			member.jet.position.copy(_desired);
			member.jet.targetPosition.copy(_desired);
			member.jet.velocity.copy(initialVelocity);
			member.targetVelocity.copy(initialVelocity);
			member.formationTargetReady = true;
			member.jet.quaternion.copy(player.quaternion);
		}
	}

	update(
		delta: number,
		_phase: MissionPhase,
		player: Object3D,
		leaderVelocity: Vector3,
		targets: readonly Target[],
		onAttack: SquadronAttackCallback
	): void {
		this.elapsed += delta;
		for (const member of this.members) {
			if (!member.jet.active) {
				member.debugTarget.visible = false;
				member.debugDirection.visible = false;
				continue;
			}
			member.attackCooldown = Math.max(0, member.attackCooldown - delta);
			if (this.modeValue === 'formation') {
				member.jet.state = 'formation';
				_previousTarget.copy(member.jet.targetPosition);
				this.formationPosition(player, member.offset, member.jet.targetPosition);
				if (member.formationTargetReady && delta > 0) {
					_measuredTargetVelocity
						.copy(member.jet.targetPosition)
						.sub(_previousTarget)
						.multiplyScalar(1 / delta);
					const targetVelocityBlend = 1 - Math.exp(-BALANCE.squadron.slotVelocitySharpness * delta);
					member.targetVelocity.lerp(_measuredTargetVelocity, targetVelocityBlend);
				} else {
					member.targetVelocity.copy(leaderVelocity);
					member.formationTargetReady = true;
				}
			} else {
				member.formationTargetReady = false;
				this.updateFreeTarget(member, delta, player, targets);
			}
			const distanceToTarget = member.jet.position.distanceTo(member.jet.targetPosition);
			this.steerMember(member, delta, player, leaderVelocity, distanceToTarget);
			member.jet.updateVisual(
				this.elapsed,
				this.modeValue === 'free-squad' && member.waypointPhase === 'attack' ? 1 : 0.35
			);
			this.tryAttack(member, onAttack);
			if (this.debugVisibleValue) this.updateDebugVisual(member);
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

	private updateFreeTarget(
		member: Member,
		delta: number,
		player: Object3D,
		targets: readonly Target[]
	): void {
		member.waypointTime += delta;
		if (member.target && !this.isEligibleTarget(member.target)) {
			member.target = null;
			member.waypointPhase = 'patrol';
			this.assignWaypoint(member, player);
			return;
		}
		if (!member.target) {
			member.target = this.attackTarget(member, targets);
			if (member.target) {
				member.waypointPhase = 'approach';
				this.assignWaypoint(member, player);
				return;
			}
			if (member.waypointPhase !== 'patrol') {
				member.waypointPhase = 'patrol';
				this.assignWaypoint(member, player);
				return;
			}
		}
		const arrived =
			member.jet.position.distanceToSquared(member.jet.targetPosition) <=
			BALANCE.squadron.waypointArrivalRadius ** 2;
		if (!arrived && member.waypointTime < BALANCE.squadron.waypointTimeout) return;

		if (!member.target) {
			member.passIndex += 1;
			member.waypointPhase = 'patrol';
		} else if (member.waypointPhase === 'approach') {
			member.waypointPhase = 'attack';
		} else if (member.waypointPhase === 'attack') {
			member.waypointPhase = 'break';
		} else {
			member.passIndex += 1;
			member.target = this.attackTarget(member, targets);
			member.waypointPhase = member.target ? 'approach' : 'patrol';
		}
		this.assignWaypoint(member, player);
	}

	private assignWaypoint(member: Member, player: Object3D): void {
		member.waypointTime = 0;
		member.firedThisPass = member.waypointPhase !== 'attack';
		const angle = (member.attackIndex / this.members.length) * TAU + member.passIndex * 0.67;
		const radialX = Math.cos(angle);
		const radialZ = Math.sin(angle);
		const target = member.target;

		if (!target || member.waypointPhase === 'patrol') {
			_direction
				.set(
					radialX * BALANCE.squadron.patrolSpread,
					100 + member.attackIndex * 22,
					260 + Math.abs(radialZ) * BALANCE.squadron.patrolSpread * 0.45
				)
				.applyQuaternion(player.quaternion);
			member.jet.targetPosition.copy(player.position).add(_direction);
			member.jet.state = 'break';
			return;
		}

		const altitude = BALANCE.squadron.attackAltitude + member.attackIndex * 16;
		if (member.waypointPhase === 'approach') {
			member.jet.targetPosition
				.copy(target.position)
				.add(_direction.set(radialX * 720, altitude, radialZ * 720));
			member.jet.state = 'approach';
		} else if (member.waypointPhase === 'attack') {
			member.jet.targetPosition
				.copy(target.position)
				.add(_direction.set(-radialX * 260, 75, -radialZ * 260));
			member.jet.state = 'attack-run';
			member.firedThisPass = false;
		} else {
			member.jet.targetPosition
				.copy(target.position)
				.add(_direction.set(-radialX * 900, altitude + 220, -radialZ * 900));
			member.jet.state = 'break';
		}
	}

	private steerMember(
		member: Member,
		delta: number,
		player: Object3D,
		leaderVelocity: Vector3,
		distanceToTarget: number
	): void {
		const jet = member.jet;
		_direction.copy(jet.targetPosition).sub(jet.position);
		if (this.modeValue === 'formation') {
			_desiredVelocity.copy(member.targetVelocity);
			const leaderSpeed = leaderVelocity.length();
			const slotSpeed = member.targetVelocity.length();
			const sweepSpeedBoost = clamp(
				slotSpeed - leaderSpeed,
				0,
				BALANCE.squadron.tightTurnSpeedBoost
			);
			if (distanceToTarget > 0.01) {
				const correctionLimit =
					BALANCE.squadron.catchupSpeedMargin +
					member.speedBias +
					Math.min(
						BALANCE.squadron.tightTurnCatchupBoost,
						distanceToTarget * BALANCE.squadron.tightTurnDistanceBoost
					);
				const correctionSpeed = Math.min(
					correctionLimit,
					distanceToTarget * BALANCE.squadron.formationCorrectionGain
				);
				_correction.copy(_direction).normalize().multiplyScalar(correctionSpeed);
				_desiredVelocity.add(_correction);
			}
			const maxSpeed =
				Math.max(BALANCE.flight.cruiseSpeed, leaderSpeed) +
				BALANCE.squadron.catchupSpeedMargin +
				member.speedBias +
				sweepSpeedBoost +
				Math.min(
					BALANCE.squadron.tightTurnCatchupBoost,
					distanceToTarget * BALANCE.squadron.tightTurnDistanceBoost
				);
			if (_desiredVelocity.lengthSq() > maxSpeed * maxSpeed) {
				_desiredVelocity.setLength(maxSpeed);
			}
		} else {
			_desiredVelocity
				.copy(_direction)
				.normalize()
				.multiplyScalar(BALANCE.squadron.freeFlightSpeed + member.speedBias);
		}

		const desiredSpeed = _desiredVelocity.length();
		if (desiredSpeed > 0.01) _desiredDirection.copy(_desiredVelocity).normalize();
		else _desiredDirection.set(0, 0, -1).applyQuaternion(player.quaternion);
		if (jet.velocity.lengthSq() > 0.01) _currentDirection.copy(jet.velocity).normalize();
		else _currentDirection.copy(_desiredDirection);

		_turnAxis.crossVectors(_currentDirection, _desiredDirection);
		const steeringBank =
			clamp(-_turnAxis.y * BALANCE.squadron.bankTurnScale, -1, 1) * BALANCE.squadron.maxBankAngle;
		_playerEuler.setFromQuaternion(player.quaternion, 'YXZ');
		const leaderBank = clamp(
			-_playerEuler.z,
			-BALANCE.squadron.maxBankAngle,
			BALANCE.squadron.maxBankAngle
		);
		const targetBank =
			this.modeValue === 'formation'
				? clamp(
						leaderBank + steeringBank * 0.45,
						-BALANCE.squadron.maxBankAngle,
						BALANCE.squadron.maxBankAngle
					)
				: steeringBank;
		member.bank = damp(member.bank, targetBank, BALANCE.squadron.bankSharpness, delta);

		_fullTurn.setFromUnitVectors(_currentDirection, _desiredDirection);
		const maxTurnRate =
			this.modeValue === 'formation'
				? BALANCE.squadron.formationMaxTurnRate
				: BALANCE.squadron.maxTurnRate;
		_turn.identity().rotateTowards(_fullTurn, maxTurnRate * delta);
		_currentDirection.applyQuaternion(_turn).normalize();
		const currentSpeed = jet.velocity.length();
		const rate =
			this.modeValue === 'formation'
				? desiredSpeed >= currentSpeed
					? BALANCE.squadron.formationAcceleration
					: BALANCE.squadron.formationBraking
				: desiredSpeed >= currentSpeed
					? BALANCE.squadron.acceleration
					: BALANCE.squadron.braking;
		const nextSpeed = moveTowards(currentSpeed, desiredSpeed, rate * delta);
		jet.velocity.copy(_currentDirection).multiplyScalar(nextSpeed);
		jet.position.addScaledVector(jet.velocity, delta);

		if (jet.velocity.lengthSq() > 1) {
			_orientationTarget.position.copy(jet.position);
			_lookAt.copy(jet.position).add(jet.velocity);
			_orientationTarget.lookAt(_lookAt);
			_orientationTarget.rotateY(Math.PI);
			_orientationTarget.rotateZ(-member.bank);
		}
		const rotationBlend = 1 - Math.exp(-BALANCE.squadron.rotationSharpness * delta);
		jet.quaternion.slerp(_orientationTarget.quaternion, rotationBlend);
	}

	private tryAttack(member: Member, onAttack: SquadronAttackCallback): void {
		if (
			this.modeValue !== 'free-squad' ||
			member.waypointPhase !== 'attack' ||
			member.firedThisPass ||
			member.attackCooldown > 0
		) {
			return;
		}
		const target = member.target;
		if (
			this.isEligibleTarget(target) &&
			member.jet.position.distanceToSquared(target.position) < BALANCE.squadron.attackRange ** 2
		) {
			onAttack(member.jet, target, this.assistedKills < BALANCE.squadron.maxAssistedKills);
			member.firedThisPass = true;
			member.attackCooldown = BALANCE.squadron.attackInterval + member.attackIndex * 1.3;
		}
	}

	private attackTarget(member: Member, targets: readonly Target[]): Target | null {
		let activeCount = 0;
		for (const target of targets) {
			if (target.enabled && !target.destroyed && !target.isFinal) activeCount += 1;
		}
		if (activeCount === 0) return null;
		const selectedIndex = (member.attackIndex + member.passIndex) % activeCount;
		let activeIndex = 0;
		for (const target of targets) {
			if (!target.enabled || target.destroyed || target.isFinal) continue;
			if (activeIndex === selectedIndex) return target;
			activeIndex += 1;
		}
		return null;
	}

	private isEligibleTarget(target: Target | null): target is Target {
		return Boolean(target?.enabled && !target.destroyed && !target.isFinal);
	}

	private updateDebugVisual(member: Member): void {
		member.debugTarget.position.copy(member.jet.targetPosition);
		member.debugDirection.position.copy(member.jet.position);
		if (member.jet.velocity.lengthSq() > 0.01) {
			_debugForward.copy(member.jet.velocity).normalize();
		} else {
			_debugForward.set(0, 0, -1).applyQuaternion(member.jet.quaternion).normalize();
		}
		member.debugDirection.setDirection(_debugForward);
		member.debugDirection.setLength(BALANCE.squadron.debugDirectionLength, 10, 5);
	}

	private formationPosition(player: Object3D, offset: Vector3, out: Vector3): void {
		// Use climb direction (nose up => forward.y > 0), not FlightController's inverted pitch euler.
		// Pitch up → lag below; pitch down → lag above, in the leader's local frame.
		_forward.set(0, 0, -1).applyQuaternion(player.quaternion);
		const pitchLag = clamp(
			-_forward.y * offset.z * BALANCE.squadron.pitchLagFactor,
			-BALANCE.squadron.maxPitchLag,
			BALANCE.squadron.maxPitchLag
		);
		_formationOffset.copy(offset);
		_formationOffset.y = pitchLag;
		_direction.copy(_formationOffset).applyQuaternion(player.quaternion);
		out.copy(player.position).add(_direction);
	}
}
