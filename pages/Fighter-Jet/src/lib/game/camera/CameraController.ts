import { PerspectiveCamera, Vector3 } from 'three';
import type { FlightController } from '../aircraft/FlightController';
import type { PlayerJet } from '../aircraft/PlayerJet';
import { GAME_CONFIG } from '../config/gameConfig';
import type { CameraMode, CameraState, GameSettings } from '../types';
import { damp } from '../utils/math';
import type { Missile } from '../combat/Missile';
import type { Terrain } from '../world/Terrain';

const _desiredPosition = new Vector3();
const _desiredLook = new Vector3();
const _local = new Vector3();
const _missileDirection = new Vector3();
const _up = new Vector3(0, 1, 0);

export class CameraController {
	private modeValue: CameraMode = 'chase';
	private readonly smoothedLook = new Vector3();
	private shakeAmount = 0;
	private elapsed = 0;
	private settings: Readonly<GameSettings>;
	private missileCamera: Missile | null = null;
	private missileCameraTime = 0;

	constructor(
		readonly camera: PerspectiveCamera,
		settings: Readonly<GameSettings>
	) {
		this.settings = settings;
		this.modeValue = settings.lastCamera;
	}

	get mode(): CameraMode {
		return this.modeValue;
	}

	cycleMode(): CameraMode {
		this.modeValue =
			this.modeValue === 'chase' ? 'wide' : this.modeValue === 'wide' ? 'cockpit' : 'chase';
		this.missileCameraTime = 0;
		return this.modeValue;
	}

	setMode(mode: CameraMode): void {
		this.modeValue = mode;
	}

	updateSettings(settings: Readonly<GameSettings>): void {
		this.settings = settings;
		if (settings.reducedMotion || !settings.missileCamera) this.missileCameraTime = 0;
	}

	onMissileLaunch(missile: Missile, launchNumber: number): void {
		if (
			this.settings.missileCamera &&
			!this.settings.reducedMotion &&
			this.modeValue !== 'cockpit' &&
			launchNumber % 4 === 0
		) {
			this.missileCamera = missile;
			this.missileCameraTime = 1.05;
		}
		this.addShake(0.12);
	}

	addShake(amount: number): void {
		if (this.settings.reducedMotion) return;
		this.shakeAmount = Math.min(2.5, this.shakeAmount + amount * this.settings.screenShake);
	}

	update(
		delta: number,
		player: PlayerJet,
		flight: FlightController,
		terrain: Terrain,
		lockProgress: number
	): void {
		this.elapsed += delta;
		this.missileCameraTime = Math.max(0, this.missileCameraTime - delta);
		if (
			this.missileCameraTime > 0 &&
			this.missileCamera?.active &&
			this.settings.missileCamera &&
			!this.settings.reducedMotion
		) {
			this.updateMissileCamera(delta);
		} else {
			this.updateAircraftCamera(delta, player, flight, lockProgress);
		}
		const floor =
			terrain.terrainHeightAt(this.camera.position.x, this.camera.position.z) +
			GAME_CONFIG.camera.terrainClearance;
		this.camera.position.y = Math.max(floor, this.camera.position.y);
		this.applyShake(delta);
		this.camera.fov = damp(
			this.camera.fov,
			GAME_CONFIG.camera.baseFov + (flight.afterburnerActive ? 6 : 0),
			4,
			delta
		);
		this.camera.updateProjectionMatrix();
	}

	snapshot(): CameraState {
		return {
			mode: this.modeValue,
			position: {
				x: this.camera.position.x,
				y: this.camera.position.y,
				z: this.camera.position.z
			},
			lookAt: {
				x: this.smoothedLook.x,
				y: this.smoothedLook.y,
				z: this.smoothedLook.z
			},
			shake: this.shakeAmount,
			fov: this.camera.fov
		};
	}

	reset(player: PlayerJet): void {
		this.modeValue = this.settings.lastCamera;
		_local.set(0, GAME_CONFIG.camera.chaseHeight, GAME_CONFIG.camera.chaseDistance);
		_desiredPosition.copy(_local).applyQuaternion(player.quaternion).add(player.position);
		this.camera.position.copy(_desiredPosition);
		_desiredLook.set(0, 0, -GAME_CONFIG.camera.lookAhead).applyQuaternion(player.quaternion);
		this.smoothedLook.copy(player.position).add(_desiredLook);
		this.camera.lookAt(this.smoothedLook);
		this.shakeAmount = 0;
		this.missileCameraTime = 0;
	}

	private updateAircraftCamera(
		delta: number,
		player: PlayerJet,
		flight: FlightController,
		lockProgress: number
	): void {
		if (this.modeValue === 'cockpit') {
			player.cockpitCamera.getWorldPosition(_desiredPosition);
			_desiredLook.set(0, 0, -180).applyQuaternion(player.quaternion).add(_desiredPosition);
			this.camera.position.lerp(_desiredPosition, 1 - Math.exp(-18 * delta));
			this.smoothedLook.lerp(_desiredLook, 1 - Math.exp(-14 * delta));
			this.camera.lookAt(this.smoothedLook);
			return;
		}
		const baseDistance =
			this.modeValue === 'wide'
				? GAME_CONFIG.camera.wideDistance
				: GAME_CONFIG.camera.chaseDistance;
		const lockTightening = lockProgress * (this.modeValue === 'wide' ? 8 : 4.5);
		const pullback = flight.afterburnerActive ? 8 : 0;
		const distance = baseDistance - lockTightening + pullback;
		const height =
			GAME_CONFIG.camera.chaseHeight +
			(this.modeValue === 'wide' ? 11 : 0) +
			Math.abs(flight.roll) * 2;
		_local.set(-flight.roll * 4.2, height, distance);
		_desiredPosition.copy(_local).applyQuaternion(player.quaternion).add(player.position);
		_desiredLook
			.set(
				flight.roll * 5,
				flight.pitch * 18,
				-(GAME_CONFIG.camera.lookAhead + flight.speed * 0.12)
			)
			.applyQuaternion(player.quaternion)
			.add(player.position);
		const positionSharpness = this.modeValue === 'wide' ? 3.8 : 6;
		this.camera.position.set(
			damp(this.camera.position.x, _desiredPosition.x, positionSharpness, delta),
			damp(this.camera.position.y, _desiredPosition.y, positionSharpness, delta),
			damp(this.camera.position.z, _desiredPosition.z, positionSharpness, delta)
		);
		this.smoothedLook.set(
			damp(this.smoothedLook.x, _desiredLook.x, 7, delta),
			damp(this.smoothedLook.y, _desiredLook.y, 7, delta),
			damp(this.smoothedLook.z, _desiredLook.z, 7, delta)
		);
		this.camera.lookAt(this.smoothedLook);
		this.camera.rotateZ(-flight.roll * 0.08);
	}

	private updateMissileCamera(delta: number): void {
		if (!this.missileCamera) return;
		_missileDirection.copy(this.missileCamera.velocity).normalize();
		_desiredPosition
			.copy(this.missileCamera.position)
			.addScaledVector(_missileDirection, -6)
			.addScaledVector(_up, 2.2);
		_desiredLook.copy(this.missileCamera.position).addScaledVector(_missileDirection, 30);
		this.camera.position.lerp(_desiredPosition, 1 - Math.exp(-14 * delta));
		this.smoothedLook.lerp(_desiredLook, 1 - Math.exp(-16 * delta));
		this.camera.lookAt(this.smoothedLook);
	}

	private applyShake(delta: number): void {
		if (this.shakeAmount <= 0.001) {
			this.shakeAmount = 0;
			return;
		}
		const amount = this.shakeAmount;
		this.camera.position.x += Math.sin(this.elapsed * 73.1) * amount;
		this.camera.position.y += Math.sin(this.elapsed * 91.7 + 1.1) * amount * 0.7;
		this.camera.position.z += Math.sin(this.elapsed * 67.3 + 2.2) * amount;
		this.shakeAmount = damp(this.shakeAmount, 0, 5.5, delta);
	}
}
