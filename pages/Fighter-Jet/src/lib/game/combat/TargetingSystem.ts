import { Camera, PerspectiveCamera, Vector3 } from 'three';
import { BALANCE } from '../config/balance';
import type { TargetLockState, TargetMarkerSnapshot } from '../types';
import { clamp, saturate } from '../utils/math';
import type { Target } from './Target';

export type VisibilityTest = (from: Vector3, to: Vector3) => boolean;

const _cameraPosition = new Vector3();
const _cameraDirection = new Vector3();
const _toTarget = new Vector3();
const _projected = new Vector3();

export interface CandidateScore {
	target: Target;
	score: number;
	angle: number;
	distance: number;
}

export function scoreTargetCandidate(camera: Camera, target: Target): CandidateScore | null {
	if (!target.enabled || target.destroyed) return null;
	camera.getWorldPosition(_cameraPosition);
	camera.getWorldDirection(_cameraDirection);
	_toTarget.copy(target.position).sub(_cameraPosition);
	const distance = _toTarget.length();
	if (distance <= 0 || distance > BALANCE.targeting.maxLockDistance) return null;
	_toTarget.multiplyScalar(1 / distance);
	const angle = Math.acos(clamp(_cameraDirection.dot(_toTarget), -1, 1));
	if (angle > BALANCE.targeting.retentionConeRadians) return null;
	const centrality = 1 - angle / BALANCE.targeting.retentionConeRadians;
	const proximity = 1 - distance / BALANCE.targeting.maxLockDistance;
	return {
		target,
		score:
			centrality * BALANCE.targeting.screenWeight + proximity * BALANCE.targeting.distanceWeight,
		angle,
		distance
	};
}

export function selectTargetCandidate(
	camera: Camera,
	targets: readonly Target[],
	visibility?: VisibilityTest
): Target | null {
	let best: CandidateScore | null = null;
	camera.getWorldPosition(_cameraPosition);
	for (const target of targets) {
		const candidate = scoreTargetCandidate(camera, target);
		if (!candidate || (visibility && !visibility(_cameraPosition, target.position))) continue;
		if (
			best === null ||
			candidate.score > best.score ||
			(candidate.score === best.score && target.id.localeCompare(best.target.id) < 0)
		) {
			best = candidate;
		}
	}
	return best?.target ?? null;
}

export class TargetingSystem {
	private selected: Target | null = null;
	private progressValue = 0;
	private lockedValue = false;
	private retentionRemaining = 0;
	private lockStateValue: TargetLockState = 'none';
	private visibleValue = false;
	private previousAcquisitionTone = -1;
	private aimAssist = 0.75;

	constructor(
		private readonly camera: PerspectiveCamera,
		private readonly targets: readonly Target[],
		private readonly visibility: VisibilityTest,
		private readonly testMode = false
	) {}

	get target(): Target | null {
		return this.selected;
	}

	get progress(): number {
		return this.progressValue;
	}

	get locked(): boolean {
		return this.lockedValue;
	}

	get lockState(): TargetLockState {
		return this.lockStateValue;
	}

	get visible(): boolean {
		return this.visibleValue;
	}

	setAimAssist(strength: number): void {
		this.aimAssist = saturate(strength);
	}

	update(delta: number): void {
		if (!this.selected || !this.selected.enabled || this.selected.destroyed) {
			this.selected = selectTargetCandidate(this.camera, this.targets, this.visibility);
			this.resetLock();
		}
		if (!this.selected) return;

		this.camera.getWorldPosition(_cameraPosition);
		this.camera.getWorldDirection(_cameraDirection);
		_toTarget.copy(this.selected.position).sub(_cameraPosition);
		const distance = _toTarget.length();
		if (distance <= 0) return;
		_toTarget.multiplyScalar(1 / distance);
		const angle = Math.acos(clamp(_cameraDirection.dot(_toTarget), -1, 1));
		this.visibleValue =
			distance <= BALANCE.targeting.maxLockDistance &&
			this.visibility(_cameraPosition, this.selected.position);
		const assistedLockCone = BALANCE.targeting.lockConeRadians * (0.72 + this.aimAssist * 0.56);
		const inLockCone = angle <= assistedLockCone && this.visibleValue;
		const inRetentionCone =
			angle <= BALANCE.targeting.retentionConeRadians &&
			distance <= BALANCE.targeting.maxLockDistance;

		if (inLockCone) {
			this.retentionRemaining = BALANCE.targeting.retentionSeconds;
			const lockSeconds = this.testMode
				? BALANCE.targeting.testLockSeconds
				: BALANCE.targeting.lockSeconds * (1.18 - this.aimAssist * 0.36);
			this.progressValue = saturate(this.progressValue + delta / lockSeconds);
			this.lockedValue = this.progressValue >= 1;
			this.lockStateValue = this.lockedValue ? 'locked' : 'acquiring';
		} else if (inRetentionCone && this.retentionRemaining > 0) {
			this.retentionRemaining = Math.max(0, this.retentionRemaining - delta);
			this.progressValue = Math.max(0, this.progressValue - delta * 0.16);
			this.lockStateValue = this.lockedValue ? 'retaining' : 'acquiring';
		} else {
			this.retentionRemaining = Math.max(0, this.retentionRemaining - delta);
			this.progressValue = Math.max(0, this.progressValue - delta * 1.4);
			if (this.retentionRemaining <= 0 || this.progressValue <= 0) {
				this.lockedValue = false;
				this.lockStateValue = 'none';
			} else {
				this.lockStateValue = 'retaining';
			}
		}
	}

	cycle(direction = 1): Target | null {
		const count = this.targets.length;
		if (count === 0) return null;
		const currentIndex = this.selected ? this.targets.indexOf(this.selected) : -1;
		for (let step = 1; step <= count; step += 1) {
			const index = (((currentIndex + step * Math.sign(direction || 1)) % count) + count) % count;
			const candidate = this.targets[index];
			if (candidate.enabled && !candidate.destroyed) {
				this.selected = candidate;
				this.resetLock();
				return candidate;
			}
		}
		this.selected = null;
		this.resetLock();
		return null;
	}

	select(target: Target | null): void {
		this.selected = target?.enabled && !target.destroyed ? target : null;
		this.resetLock();
	}

	acquisitionToneStep(steps = 8): number {
		const value = Math.floor(this.progressValue * steps);
		if (value === this.previousAcquisitionTone) return -1;
		this.previousAcquisitionTone = value;
		return value;
	}

	snapshot(viewportWidth: number, viewportHeight: number): TargetMarkerSnapshot | null {
		if (!this.selected) return null;
		this.camera.updateMatrixWorld();
		_projected.copy(this.selected.position).project(this.camera);
		this.camera.getWorldPosition(_cameraPosition);
		this.camera.getWorldDirection(_cameraDirection);
		_toTarget.copy(this.selected.position).sub(_cameraPosition);
		const behindCamera = _cameraDirection.dot(_toTarget) < 0;
		let normalizedX = (_projected.x + 1) * 0.5;
		let normalizedY = (1 - _projected.y) * 0.5;
		if (behindCamera) {
			normalizedX = 1 - normalizedX;
			normalizedY = 1 - normalizedY;
		}
		const onScreen =
			!behindCamera &&
			_projected.z >= -1 &&
			_projected.z <= 1 &&
			normalizedX >= 0 &&
			normalizedX <= 1 &&
			normalizedY >= 0 &&
			normalizedY <= 1;
		const edgeInset = 0.055;
		const edgeX = clamp(normalizedX, edgeInset, 1 - edgeInset);
		const edgeY = clamp(normalizedY, edgeInset, 1 - edgeInset);
		return {
			id: this.selected.id,
			name: this.selected.name,
			type: this.selected.type,
			screen: { x: normalizedX * viewportWidth, y: normalizedY * viewportHeight },
			edge: { x: edgeX * viewportWidth, y: edgeY * viewportHeight },
			onScreen,
			behindCamera,
			distance: _toTarget.length(),
			health: this.selected.healthRatio,
			lockState: this.lockStateValue,
			lockProgress: this.progressValue,
			visible: this.visibleValue,
			isFinal: this.selected.isFinal
		};
	}

	private resetLock(): void {
		this.progressValue = 0;
		this.lockedValue = false;
		this.retentionRemaining = 0;
		this.lockStateValue = 'none';
		this.visibleValue = false;
		this.previousAcquisitionTone = -1;
	}
}
