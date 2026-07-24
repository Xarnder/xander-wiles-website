import {
	AdditiveBlending,
	BufferAttribute,
	BufferGeometry,
	CanvasTexture,
	Color,
	Group,
	Object3D,
	Points,
	PointsMaterial,
	Quaternion,
	Vector3
} from 'three';
import { BALANCE } from '../config/balance';
import type { QualityLevel } from '../types';
import { clamp, lerp } from '../utils/math';

export interface TrailSource {
	object: Object3D;
	intensity: number;
	afterburner: number;
	active: boolean;
}

interface EmitterState {
	lastX: number;
	lastY: number;
	lastZ: number;
	initialized: boolean;
}

const _worldPosition = new Vector3();
const _worldQuaternion = new Quaternion();
const _forward = new Vector3();
const _right = new Vector3();
const _baseColor = new Color();
const _burnColor = new Color(0x82d0ea);
const _cruiseColor = new Color(0x5aa7c4);

function capacityForQuality(quality: QualityLevel, lengthScale: number): number {
	const trails = BALANCE.trails;
	const base =
		quality === 'low'
			? trails.maxParticlesLow
			: quality === 'medium'
				? trails.maxParticlesMedium
				: trails.maxParticlesHigh;
	return Math.min(
		trails.maxParticlesAbsolute,
		Math.max(64, Math.round(base * clamp(lengthScale, 0.5, 12)))
	);
}

function createSoftParticleTexture(): CanvasTexture | null {
	if (typeof document === 'undefined') return null;
	const size = 64;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const context = canvas.getContext('2d');
	if (!context) return null;
	const gradient = context.createRadialGradient(
		size * 0.5,
		size * 0.5,
		0,
		size * 0.5,
		size * 0.5,
		size * 0.5
	);
	gradient.addColorStop(0, 'rgba(255,255,255,0.72)');
	gradient.addColorStop(0.3, 'rgba(190,230,245,0.38)');
	gradient.addColorStop(1, 'rgba(100,170,200,0)');
	context.fillStyle = gradient;
	context.fillRect(0, 0, size, size);
	const texture = new CanvasTexture(canvas);
	texture.needsUpdate = true;
	return texture;
}

/**
 * World-space engine contrails as one pooled Points draw call.
 * Particles spawn by distance travelled, fade by age, and never allocate per frame.
 */
export class JetTrailSystem extends Group {
	private readonly geometry = new BufferGeometry();
	private readonly material: PointsMaterial;
	private readonly points: Points;
	private readonly texture: CanvasTexture | null;
	private positions: Float32Array;
	private colors: Float32Array;
	private ages: Float32Array;
	private lifetimes: Float32Array;
	private colorR: Float32Array;
	private colorG: Float32Array;
	private colorB: Float32Array;
	private capacity: number;
	private liveCount = 0;
	private quality: QualityLevel;
	private lengthScale: number;
	private displayBrightness = 1;
	private userBrightness = 1;
	private readonly emitters: EmitterState[] = [];
	private readonly maxEmitters: number;

	constructor(
		quality: QualityLevel = 'high',
		lengthScale = 1,
		brightnessScale = 1,
		maxEmitters = 8
	) {
		super();
		this.name = 'JetTrailSystem';
		this.maxEmitters = maxEmitters;
		this.quality = quality;
		this.lengthScale = clamp(lengthScale, 0.5, 12);
		this.userBrightness = clamp(brightnessScale, 0.15, 2);
		this.capacity = capacityForQuality(this.quality, this.lengthScale);
		this.texture = createSoftParticleTexture();
		this.material = new PointsMaterial({
			size: BALANCE.trails.baseSize,
			map: this.texture ?? undefined,
			vertexColors: true,
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			sizeAttenuation: true,
			opacity: BALANCE.trails.opacity,
			fog: false
		});
		this.applyDisplayLook();
		this.positions = new Float32Array(this.capacity * 3);
		this.colors = new Float32Array(this.capacity * 3);
		this.ages = new Float32Array(this.capacity);
		this.lifetimes = new Float32Array(this.capacity);
		this.colorR = new Float32Array(this.capacity);
		this.colorG = new Float32Array(this.capacity);
		this.colorB = new Float32Array(this.capacity);
		this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
		this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
		this.geometry.setDrawRange(0, 0);
		this.points = new Points(this.geometry, this.material);
		this.points.frustumCulled = false;
		this.points.renderOrder = 2;
		this.add(this.points);
		for (let index = 0; index < this.maxEmitters; index += 1) {
			this.emitters.push({ lastX: 0, lastY: 0, lastZ: 0, initialized: false });
		}
	}

	get particleCount(): number {
		return this.liveCount;
	}

	get trailLifetime(): number {
		return BALANCE.trails.lifetime * this.lengthScale;
	}

	private get effectiveBrightness(): number {
		return this.displayBrightness * this.userBrightness;
	}

	setQuality(quality: QualityLevel): void {
		if (quality === this.quality) return;
		this.quality = quality;
		this.applyCapacity();
	}

	setTrailLength(lengthScale: number): void {
		const next = clamp(lengthScale, 0.5, 12);
		if (Math.abs(next - this.lengthScale) < 0.001) return;
		this.lengthScale = next;
		this.applyCapacity();
	}

	setTrailBrightness(brightnessScale: number): void {
		const next = clamp(brightnessScale, 0.15, 2);
		if (Math.abs(next - this.userBrightness) < 0.001) return;
		this.userBrightness = next;
		this.applyDisplayLook();
		this.refreshLiveColors();
	}

	/** Tone down additive bloom on small viewports; leave large/high-res displays at full strength. */
	setViewportSize(width: number, height: number): void {
		const shortSide = Math.min(Math.max(1, width), Math.max(1, height));
		const span = Math.max(
			1,
			BALANCE.trails.largeDisplayShortSide - BALANCE.trails.smallDisplayShortSide
		);
		const t = clamp((shortSide - BALANCE.trails.smallDisplayShortSide) / span, 0, 1);
		const next = lerp(BALANCE.trails.smallDisplayBrightness, 1, t);
		if (Math.abs(next - this.displayBrightness) < 0.01) return;
		this.displayBrightness = next;
		this.applyDisplayLook();
		this.refreshLiveColors();
	}

	reset(): void {
		this.liveCount = 0;
		this.geometry.setDrawRange(0, 0);
		for (const emitter of this.emitters) emitter.initialized = false;
		(this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
		(this.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
	}

	update(delta: number, sources: readonly TrailSource[]): void {
		if (delta > 0 && this.liveCount > 0) this.ageParticles(delta);

		const emitterCount = Math.min(sources.length, this.maxEmitters);
		for (let index = 0; index < emitterCount; index += 1) {
			const source = sources[index];
			const emitter = this.emitters[index];
			if (!source.active) {
				emitter.initialized = false;
				continue;
			}
			this.emitFromSource(source, emitter);
		}
		for (let index = emitterCount; index < this.maxEmitters; index += 1) {
			this.emitters[index].initialized = false;
		}

		this.geometry.setDrawRange(0, this.liveCount);
		(this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
		(this.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
	}

	dispose(): void {
		this.geometry.dispose();
		this.material.dispose();
		this.texture?.dispose();
		this.removeFromParent();
	}

	private applyCapacity(): void {
		const nextCapacity = capacityForQuality(this.quality, this.lengthScale);
		if (nextCapacity === this.capacity) return;
		this.rebuildBuffers(nextCapacity);
	}

	private applyDisplayLook(): void {
		const brightness = this.effectiveBrightness;
		this.material.opacity = BALANCE.trails.opacity * brightness;
		this.material.size = BALANCE.trails.baseSize * (0.78 + 0.22 * clamp(brightness, 0, 1.25));
	}

	private refreshLiveColors(): void {
		const brightness = this.effectiveBrightness;
		for (let index = 0; index < this.liveCount; index += 1) {
			const life = this.lifetimes[index];
			const fade = 1 - this.ages[index] / Math.max(life, 0.001);
			const soft = fade * fade * brightness;
			const colorOffset = index * 3;
			this.colors[colorOffset] = this.colorR[index] * soft;
			this.colors[colorOffset + 1] = this.colorG[index] * soft;
			this.colors[colorOffset + 2] = this.colorB[index] * soft;
		}
		if (this.liveCount > 0) {
			(this.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
		}
	}

	private rebuildBuffers(nextCapacity: number): void {
		const keep = Math.min(this.liveCount, nextCapacity);
		const nextPositions = new Float32Array(nextCapacity * 3);
		const nextColors = new Float32Array(nextCapacity * 3);
		const nextAges = new Float32Array(nextCapacity);
		const nextLifetimes = new Float32Array(nextCapacity);
		const nextColorR = new Float32Array(nextCapacity);
		const nextColorG = new Float32Array(nextCapacity);
		const nextColorB = new Float32Array(nextCapacity);
		nextPositions.set(this.positions.subarray(0, keep * 3));
		nextColors.set(this.colors.subarray(0, keep * 3));
		nextAges.set(this.ages.subarray(0, keep));
		nextLifetimes.set(this.lifetimes.subarray(0, keep));
		nextColorR.set(this.colorR.subarray(0, keep));
		nextColorG.set(this.colorG.subarray(0, keep));
		nextColorB.set(this.colorB.subarray(0, keep));
		this.positions = nextPositions;
		this.colors = nextColors;
		this.ages = nextAges;
		this.lifetimes = nextLifetimes;
		this.colorR = nextColorR;
		this.colorG = nextColorG;
		this.colorB = nextColorB;
		this.capacity = nextCapacity;
		this.liveCount = keep;
		this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
		this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
		this.geometry.setDrawRange(0, this.liveCount);
	}

	private ageParticles(delta: number): void {
		let index = 0;
		while (index < this.liveCount) {
			this.ages[index] += delta;
			const life = this.lifetimes[index];
			const age = this.ages[index];
			if (age >= life) {
				this.recycle(index);
				continue;
			}
			const fade = 1 - age / life;
			const soft = fade * fade * this.effectiveBrightness;
			const colorOffset = index * 3;
			this.colors[colorOffset] = this.colorR[index] * soft;
			this.colors[colorOffset + 1] = this.colorG[index] * soft;
			this.colors[colorOffset + 2] = this.colorB[index] * soft;
			this.positions[index * 3 + 1] += delta * 0.35;
			index += 1;
		}
	}

	private emitFromSource(source: TrailSource, emitter: EmitterState): void {
		const object = source.object;
		object.getWorldPosition(_worldPosition);
		object.getWorldQuaternion(_worldQuaternion);
		_forward.set(0, 0, -1).applyQuaternion(_worldQuaternion).normalize();
		_right.set(1, 0, 0).applyQuaternion(_worldQuaternion).normalize();

		const centerX = _worldPosition.x;
		const centerY = _worldPosition.y;
		const centerZ = _worldPosition.z;
		if (!emitter.initialized) {
			emitter.lastX = centerX;
			emitter.lastY = centerY;
			emitter.lastZ = centerZ;
			emitter.initialized = true;
			return;
		}

		const dx = centerX - emitter.lastX;
		const dy = centerY - emitter.lastY;
		const dz = centerZ - emitter.lastZ;
		const travelled = Math.hypot(dx, dy, dz);
		const intensity = clamp(source.intensity, 0, 1.5);
		const afterburner = clamp(source.afterburner, 0, 1);
		const spacing =
			BALANCE.trails.spacing - afterburner * (BALANCE.trails.spacing - BALANCE.trails.minSpacing);
		if (travelled < spacing) return;

		const steps = Math.min(4, Math.floor(travelled / spacing));
		const invSteps = 1 / steps;
		for (let step = 1; step <= steps; step += 1) {
			const t = step * invSteps;
			this.spawnTwin(
				emitter.lastX + dx * t,
				emitter.lastY + dy * t,
				emitter.lastZ + dz * t,
				intensity,
				afterburner
			);
		}
		emitter.lastX = centerX;
		emitter.lastY = centerY;
		emitter.lastZ = centerZ;
	}

	private spawnTwin(x: number, y: number, z: number, intensity: number, afterburner: number): void {
		const spread = BALANCE.trails.twinEngineSpread;
		const aft = BALANCE.trails.aftOffset;
		this.spawnParticle(
			x - _forward.x * aft - _right.x * spread,
			y - _forward.y * aft - _right.y * spread,
			z - _forward.z * aft - _right.z * spread,
			intensity,
			afterburner
		);
		this.spawnParticle(
			x - _forward.x * aft + _right.x * spread,
			y - _forward.y * aft + _right.y * spread,
			z - _forward.z * aft + _right.z * spread,
			intensity,
			afterburner
		);
	}

	private spawnParticle(
		x: number,
		y: number,
		z: number,
		intensity: number,
		afterburner: number
	): void {
		if (this.liveCount >= this.capacity) this.recycle(0);
		if (this.liveCount >= this.capacity) return;

		const jitter = BALANCE.trails.jitter;
		const index = this.liveCount;
		this.liveCount += 1;
		const positionOffset = index * 3;
		this.positions[positionOffset] = x + (Math.random() - 0.5) * jitter;
		this.positions[positionOffset + 1] = y + (Math.random() - 0.5) * jitter * 0.6;
		this.positions[positionOffset + 2] = z + (Math.random() - 0.5) * jitter;
		this.ages[index] = 0;
		this.lifetimes[index] = this.trailLifetime * (0.82 + Math.random() * 0.28 + afterburner * 0.12);

		_baseColor
			.copy(_cruiseColor)
			.lerp(_burnColor, clamp(afterburner * 0.85 + intensity * 0.2, 0, 1));
		const brightness = 0.38 + intensity * 0.22 + afterburner * 0.2;
		this.colorR[index] = _baseColor.r * brightness;
		this.colorG[index] = _baseColor.g * brightness;
		this.colorB[index] = _baseColor.b * brightness;
		const colorOffset = index * 3;
		const look = this.effectiveBrightness;
		this.colors[colorOffset] = this.colorR[index] * look;
		this.colors[colorOffset + 1] = this.colorG[index] * look;
		this.colors[colorOffset + 2] = this.colorB[index] * look;
	}

	private recycle(index: number): void {
		const last = this.liveCount - 1;
		if (last < 0) return;
		if (index !== last) {
			const from3 = last * 3;
			const to3 = index * 3;
			this.positions[to3] = this.positions[from3];
			this.positions[to3 + 1] = this.positions[from3 + 1];
			this.positions[to3 + 2] = this.positions[from3 + 2];
			this.colors[to3] = this.colors[from3];
			this.colors[to3 + 1] = this.colors[from3 + 1];
			this.colors[to3 + 2] = this.colors[from3 + 2];
			this.ages[index] = this.ages[last];
			this.lifetimes[index] = this.lifetimes[last];
			this.colorR[index] = this.colorR[last];
			this.colorG[index] = this.colorG[last];
			this.colorB[index] = this.colorB[last];
		}
		this.liveCount = last;
	}
}
