import * as THREE from 'three';
import { jointWorldPositions } from './SkeletonGenerator';
import { createCreatureState, decideCreature, advanceCreature } from './CreatureBehaviourSystem';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
	compileCreatureGeometry,
	instantiateCreature,
	type CompiledCreature
} from './CreatureCompiler';
import { createCreatureMaterial } from './CreatureMaterial';
import { animateCreature } from './CreatureAnimationSystem';
import { generateSpecies } from './SpeciesGenerator';
import { generateIndividual } from './IndividualGenerator';
import { resolveSpeciesForm } from './CreatureForm';
import { validateCreatureAnatomy } from './CreatureAnatomyValidation';
import { volumePath } from './SweptBodyVolume';
import { CreatureGroundingController, groundingStats } from './CreatureGrounding';
import {
	DEFAULT_GROUNDING_DEBUG,
	DEFAULT_LAB_TERRAIN,
	GroundingDebugView,
	buildLabTerrainMesh,
	labHeading,
	labSurface,
	type GroundingDebugFlags,
	type LabTerrainSettings
} from './CreatureLabTerrain';
import type {
	BodyPlanId,
	CreatureCompilation,
	CreatureDefinition,
	CreatureIntent,
	CreatureLod,
	SpeciesGenome,
	Vec3
} from './CreatureTypes';

/** CURRENT is the frozen pre-rewrite generator, loaded lazily for comparison only. */
export type CreatureLabMode = 'improved' | 'current';
/** Developer multipliers over the generated species form. 1 = as generated. */
export interface CreatureLabTuning {
	limbRootPenetration: number;
	shoulderMass: number;
	hipMass: number;
	limbTaper: number;
	jointScale: number;
	headScale: number;
	eyeScale: number;
	muzzleScale: number;
}
export const DEFAULT_LAB_TUNING: CreatureLabTuning = {
	limbRootPenetration: 1,
	shoulderMass: 1,
	hipMass: 1,
	limbTaper: 1,
	jointScale: 1,
	headScale: 1,
	eyeScale: 1,
	muzzleScale: 1
};
type LegacyCompile = (definition: CreatureDefinition, lod?: 0 | 1) => CreatureCompilation;
const PLANS = ['quadruped', 'biped', 'hexapod', 'serpentine'] as const;

/** Isolated developer renderer. Nothing in this scene is world state until explicitly placed. */
export class CreatureLab {
	readonly scene = new THREE.Scene();
	readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 5000);
	readonly renderer = new THREE.WebGLRenderer({ antialias: true });
	readonly controls: OrbitControls;
	/** One Lab material for every Lab creature, isolated from the world's shadow-shader setup. */
	readonly material = createCreatureMaterial();
	creature?: CompiledCreature;
	definition?: CreatureDefinition;
	mode: CreatureLabMode = 'improved';
	tuning: CreatureLabTuning = { ...DEFAULT_LAB_TUNING };
	private legacy?: LegacyCompile;
	private helpers = new THREE.Group();
	private boneHelpers: THREE.Object3D[] = [];
	private gallery: CompiledCreature[] = [];
	private observer: ResizeObserver;
	private raf = 0;
	private start = performance.now();
	private last = 0;
	gait: CreatureIntent['gait'] = 'walk';
	wireframe = false;
	skeleton = false;
	collision = false;
	chains = false;
	crossSections = false;
	anchors = false;
	weights = false;
	limbRoots = false;
	attachmentVolumes = false;
	jointFrames = false;
	/** Test ground under the Lab creature, and whether the new terrain conformation runs. */
	terrain: LabTerrainSettings = { ...DEFAULT_LAB_TERRAIN };
	groundingEnabled = true;
	groundDebug: GroundingDebugFlags = { ...DEFAULT_GROUNDING_DEBUG };
	grounding?: CreatureGroundingController;
	private surface: (x: number, z: number) => number = () => 0;
	private terrainMesh?: THREE.Mesh;
	private debugView?: GroundingDebugView;
	private walked = 0;
	telemetry = {
		fps: 0,
		vertices: 0,
		triangles: 0,
		bones: 0,
		compileMs: 0,
		drawCalls: 0,
		animationMs: 0,
		issues: 0,
		pitch: 0,
		roll: 0,
		slope: 0,
		supportLegs: 0,
		support: '',
		canStand: true,
		surfaceSamples: 0
	};
	private followScratch = new THREE.Vector3();
	private frameCount = 0;
	private frameStart = performance.now();
	constructor(readonly container: HTMLElement) {
		this.scene.background = new THREE.Color('#e5e9de');
		this.scene.add(new THREE.HemisphereLight(0xe9f6ff, 0x5b6144, 2.4));
		const light = new THREE.DirectionalLight(0xfff0d4, 3);
		light.position.set(4, 7, 5);
		this.scene.add(light);
		this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		container.appendChild(this.renderer.domElement);
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.scene.add(this.helpers);
		this.observer = new ResizeObserver(() => this.resize());
		this.observer.observe(container);
		this.resize();
		this.raf = requestAnimationFrame(this.frame);
	}
	private resize() {
		const { width, height } = this.container.getBoundingClientRect();
		this.renderer.setSize(Math.max(1, width), Math.max(1, height));
		this.camera.aspect = width / Math.max(1, height);
		this.camera.updateProjectionMatrix();
	}
	/** Switches between the improved pipeline and the frozen CURRENT generator. */
	async setMode(mode: CreatureLabMode) {
		if (mode === 'current' && !this.legacy)
			this.legacy = (await import('./legacy/LegacyCreatureCompiler')).compileLegacyCreatureGeometry;
		this.mode = mode;
	}
	/** Applies Lab tuning to a copy of the generated form, so placed creatures keep what you saw. */
	private tuned(species: SpeciesGenome): SpeciesGenome {
		const t = this.tuning;
		if (Object.entries(t).every(([k, v]) => v === DEFAULT_LAB_TUNING[k as keyof CreatureLabTuning]))
			return species;
		const form = { ...resolveSpeciesForm(species) };
		form.limbRootPenetration *= t.limbRootPenetration;
		form.shoulderMass *= t.shoulderMass;
		form.hipMass *= t.hipMass;
		form.limbTaper = Math.min(1.2, form.limbTaper * t.limbTaper);
		form.jointScale *= t.jointScale;
		form.headScale *= t.headScale;
		form.eyeScale *= t.eyeScale;
		form.muzzleLength *= t.muzzleScale;
		form.muzzleWidth = Math.min(0.9, form.muzzleWidth * Math.sqrt(t.muzzleScale));
		form.muzzleHeight = Math.min(0.8, form.muzzleHeight * Math.sqrt(t.muzzleScale));
		return { ...species, id: `${species.id}_lab_tuned`, form };
	}
	private compile(definition: CreatureDefinition, lod: CreatureLod): CompiledCreature {
		const compilation =
			this.mode === 'current' && this.legacy
				? this.legacy(definition, Math.min(1, lod) as 0 | 1)
				: compileCreatureGeometry(definition, lod);
		return instantiateCreature(compilation, this.material);
	}
	generate(
		speciesSeed: number,
		individualSeed: number,
		plan: BodyPlanId,
		scale = 1,
		lod: CreatureLod = 0
	) {
		let species = generateSpecies(speciesSeed, plan);
		if (scale !== 1) {
			species.id += `_lab_${scale}`;
			for (const key of Object.keys(species.proportions) as (keyof typeof species.proportions)[])
				if (!['chestScale', 'waistScale', 'frontLegRatio'].includes(key))
					species.proportions[key] *= scale;
		}
		species = this.tuned(species);
		const individual = generateIndividual(species, individualSeed);
		const definition = { species, individual };
		const start = performance.now();
		const next = this.compile(definition, lod);
		this.clearGallery();
		this.creature?.dispose();
		this.creature = next;
		this.definition = definition;
		this.scene.add(next.object);
		this.telemetry.compileMs = performance.now() - start;
		this.telemetry.vertices = next.compilation.geometry.positions.length / 3;
		this.telemetry.triangles = next.compilation.geometry.indices.length / 3;
		this.telemetry.bones = next.compilation.skeleton.joints.length;
		this.telemetry.issues =
			this.mode === 'improved' ? validateCreatureAnatomy(next.compilation).length : 0;
		this.resetGround();
		this.view('front');
		this.updateHelpers();
		return definition;
	}
	/** Changes the test ground (flat, ramp, uneven, ramp + foundation slab) and walk direction. */
	setTerrain(settings: Partial<LabTerrainSettings>) {
		Object.assign(this.terrain, settings);
		this.resetGround();
	}
	/** Rebuilds the test ground at the creature's scale and restarts grounding from rest. */
	private resetGround() {
		const c = this.creature;
		this.debugView?.dispose();
		this.debugView = undefined;
		if (this.terrainMesh) {
			this.terrainMesh.geometry.dispose();
			(this.terrainMesh.material as THREE.Material).dispose();
			this.terrainMesh.removeFromParent();
		}
		if (!c) return;
		const size = Math.max(0.05, c.compilation.bounds.height);
		this.surface = labSurface(this.terrain, size);
		this.terrainMesh = buildLabTerrainMesh(this.surface, size);
		this.terrainMesh.visible = this.terrain.kind !== 'flat';
		this.scene.add(this.terrainMesh);
		this.grounding = new CreatureGroundingController(c.compilation);
		this.debugView = new GroundingDebugView(c, this.grounding);
		this.scene.add(this.debugView.group);
		this.walked = 0;
		c.object.position.set(0, this.surface(0, 0), 0);
		this.step(0, 0);
	}
	/**
	 * Advances the Lab creature: it walks along the chosen direction over the test ground (wrapping
	 * back to the start), posed by the grounded pipeline — or the old flat-ground one when grounding
	 * is disabled, for comparison.
	 */
	private step(time: number, dt: number) {
		const c = this.creature;
		if (!c || !this.definition) return;
		const behaviour = this.definition.species.behaviour;
		const heading = labHeading(this.terrain.direction);
		const speed =
			this.gait === 'idle' ? 0 : this.gait === 'run' ? behaviour.fleeSpeed : behaviour.wanderSpeed;
		const range = Math.max(0.05, c.compilation.bounds.height) * 4;
		this.walked += speed * dt;
		if (this.walked > range) this.walked = -range;
		const vx = Math.sin(heading) * speed,
			vz = Math.cos(heading) * speed;
		c.object.position.set(
			Math.sin(heading) * this.walked,
			c.object.position.y,
			Math.cos(heading) * this.walked
		);
		const samples = groundingStats.surfaceCalls;
		animateCreature(
			c,
			{
				velocity: { x: vx, y: 0, z: vz },
				heading,
				angularVelocity: 0,
				gait: this.gait
			},
			time,
			dt,
			this.surface,
			this.groundingEnabled ? { grounding: this.grounding, lod: 0 } : {}
		);
		this.debugView?.update(this.groundingEnabled ? this.groundDebug : DEFAULT_GROUNDING_DEBUG);
		const g = this.grounding;
		if (g && this.groundingEnabled) {
			const t = this.telemetry;
			t.pitch = (g.bodyPitch * 180) / Math.PI;
			t.roll = (g.bodyRoll * 180) / Math.PI;
			t.slope = (g.plane.slope * 180) / Math.PI;
			t.supportLegs = g.plane.supportLegCount;
			t.support = g.plane.source;
			t.canStand = g.canStand;
			t.surfaceSamples = groundingStats.surfaceCalls - samples;
		}
	}
	/**
	 * Mixed-plan stress scene. `mode` and `lod` let CURRENT and IMPROVED be measured on identical
	 * recipes; one shared material, as in the world.
	 */
	async benchmark(
		count: number,
		mode: CreatureLabMode = 'improved',
		lod: CreatureLod = 0,
		/** Terrain conformation on/off (off = the previous flat-ground posing) and the test ground. */
		options: { grounding?: boolean; terrain?: LabTerrainSettings } = {}
	) {
		if (![1, 10, 25, 50, 100].includes(count)) throw Error('Choose 1, 10, 25, 50 or 100 creatures');
		const previous = this.mode;
		await this.setMode(mode);
		cancelAnimationFrame(this.raf);
		const creatures: CompiledCreature[] = [];
		const states: ReturnType<typeof createCreatureState>[] = [];
		const surface = options.terrain ? labSurface(options.terrain, 1.4) : () => 0;
		const access = { surface, blocked: () => false };
		const groundings: CreatureGroundingController[] = [];
		const start = performance.now();
		if (this.creature) this.creature.object.visible = false;
		this.helpers.visible = false;
		try {
			for (let i = 0; i < count; i++) {
				const species = generateSpecies(i + 500, PLANS[i % 4]);
				const p = species.proportions;
				const scale = 1.4 / (p.legLength + p.bodyDepth + p.headSize + p.neckLength);
				for (const key of Object.keys(p) as (keyof typeof p)[])
					if (!['chestScale', 'waistScale', 'frontLegRatio'].includes(key)) p[key] *= scale;
				const individual = generateIndividual(species, i + 80),
					c = this.compile({ species, individual }, lod);
				c.object.position.set((i % 10) * 4, 0, Math.floor(i / 10) * 4);
				this.scene.add(c.object);
				creatures.push(c);
				if (options.grounding) groundings.push(new CreatureGroundingController(c.compilation));
				states.push(
					createCreatureState({
						id: individual.id,
						species,
						individual,
						position: { ...c.object.position },
						heading: 0,
						groupId: species.id,
						groupCentre: { ...c.object.position },
						cellX: 0,
						cellZ: 0,
						persistent: false
					})
				);
				if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0));
			}
			const compileMs = performance.now() - start;
			this.controls.target.set(18, 0, Math.floor(count / 10) * 2);
			this.camera.position.set(35, 35, 65);
			this.controls.update();
			// Warm-up frames absorb first-use uploads and the previous run's disposal; timings are
			// medians so one stall cannot dominate a short sample.
			const warmup = 10,
				frames = 60;
			const intervals: number[] = [],
				cpu: number[] = [],
				animation: number[] = [],
				skin: number[] = [],
				behaviour: number[] = [],
				support: number[] = [],
				sampleCounts: number[] = [];
			let previous = 0;
			for (let frame = 0; frame < warmup + frames; frame++) {
				const now = await new Promise<number>(requestAnimationFrame);
				if (frame > warmup) intervals.push(now - previous);
				previous = now;
				const cpuStart = performance.now(),
					time = frame / 30;
				let stamp = performance.now();
				if (frame % 6 === 0)
					for (const state of states)
						decideCreature(state, { x: 18, y: 0, z: 18 }, states, time, access);
				for (const state of states) advanceCreature(state, 1 / 30, access);
				const behaviourMs = performance.now() - stamp;
				stamp = performance.now();
				const samples = groundingStats.surfaceCalls;
				// Support/body solve timed on its own; posing + IK below reuses its result.
				if (options.grounding)
					for (let i = 0; i < count; i++) {
						const st = states[i];
						groundings[i].update(
							{
								x: st.position.x,
								z: st.position.z,
								heading: st.heading,
								velocityX: st.intent.velocity.x,
								velocityZ: st.intent.velocity.z,
								gait: 'walk',
								dt: 1 / 30,
								lod
							},
							surface
						);
					}
				const supportMs = performance.now() - stamp;
				stamp = performance.now();
				for (let i = 0; i < count; i++) {
					creatures[i].object.position.copy(states[i].position);
					animateCreature(
						creatures[i],
						{ ...states[i].intent, heading: states[i].heading, gait: 'walk' },
						time,
						1 / 30,
						access.surface,
						options.grounding ? { grounding: groundings[i], lod, skipGroundingUpdate: true } : {}
					);
				}
				const animationMs = performance.now() - stamp + supportMs;
				// Bone-matrix upload cost, measured separately from posing (animateCreature also runs it).
				stamp = performance.now();
				for (const c of creatures) c.skeleton.update();
				const skinMs = performance.now() - stamp;
				this.renderer.render(this.scene, this.camera);
				if (frame >= warmup) {
					cpu.push(performance.now() - cpuStart);
					animation.push(animationMs);
					support.push(supportMs);
					sampleCounts.push(groundingStats.surfaceCalls - samples);
					skin.push(skinMs);
					behaviour.push(behaviourMs);
				}
			}
			const median = (values: number[]) => {
				const sorted = [...values].sort((a, b) => a - b);
				return sorted[Math.floor(sorted.length / 2)] ?? 0;
			};
			const p95 = (values: number[]) =>
				[...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)] ?? 0;
			const geometry = creatures.map((c) => c.compilation.geometry);
			return {
				count,
				mode,
				lod,
				compileMs,
				fps: 1000 / Math.max(1e-3, median(intervals)),
				frameMs: median(intervals),
				p95FrameMs: p95(intervals),
				cpuFrameMs: median(cpu),
				animationMs: median(animation),
				skinUpdateMs: median(skin),
				grounding: !!options.grounding,
				terrain: options.terrain?.kind ?? 'flat',
				supportSolveMs: median(support),
				surfaceCallsPerFrame: median(sampleCounts),
				behaviourMs: median(behaviour),
				drawCalls: this.renderer.info.render.calls,
				triangles: this.renderer.info.render.triangles,
				vertices: geometry.reduce((n, g) => n + g.positions.length / 3, 0),
				geometryBytes: geometry.reduce(
					(n, g) =>
						n +
						[
							g.positions,
							g.normals,
							g.colors,
							g.uvs,
							g.surface,
							g.skinIndices,
							g.skinWeights,
							g.indices
						]
							.map((a) => a.byteLength)
							.reduce((x, y) => x + y, 0),
					0
				),
				heapBytes: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
					?.usedJSHeapSize
			};
		} finally {
			creatures.forEach((c) => c.dispose());
			if (this.creature) this.creature.object.visible = true;
			this.helpers.visible = true;
			this.mode = previous;
			this.view('front');
			this.raf = requestAnimationFrame(this.frame);
		}
	}

	view(side: 'front' | 'side' | 'top') {
		if (!this.creature) return;
		const b = this.creature.compilation.bounds;
		const size = Math.max(b.height, b.max.z - b.min.z, b.max.x - b.min.x, 0.2);
		this.controls.target.set(0, b.height * 0.45, 0);
		this.camera.near = Math.max(0.001, size / 1000);
		this.camera.far = Math.max(100, size * 40);
		this.camera.updateProjectionMatrix();
		this.camera.position
			.copy(this.controls.target)
			.add(
				side === 'top'
					? new THREE.Vector3(0, size * 2.5, 0.001)
					: side === 'side'
						? new THREE.Vector3(size * 2.5, size * 0.2, 0)
						: new THREE.Vector3(size * 0.35, size * 0.2, size * 2.5)
			);
		this.controls.update();
	}
	/** Frames the creature from an arbitrary direction and renders immediately (art review, tests). */
	frameView(direction: [number, number, number] = [1, 0.3, 1.2], distance = 1.5) {
		if (!this.creature) return;
		const b = this.creature.compilation.bounds;
		const size = Math.max(b.height, b.max.z - b.min.z, b.max.x - b.min.x, 0.2);
		const p = this.creature.object.position;
		this.controls.target.set(p.x, p.y + b.height * 0.5, p.z + (b.max.z + b.min.z) / 2);
		this.camera.near = Math.max(0.001, size / 1000);
		this.camera.far = Math.max(100, size * 40);
		this.camera.updateProjectionMatrix();
		this.camera.position
			.set(...direction)
			.normalize()
			.multiplyScalar(size * distance)
			.add(this.controls.target);
		this.controls.update();
		this.renderer.render(this.scene, this.camera);
	}
	/**
	 * Lays out `count` species of one plan in a grid, each normalised to unit height, for reviewing
	 * many seeds at once. The single Lab creature is hidden until `clearGallery`.
	 */
	showGallery(plan: BodyPlanId, firstSeed = 1, count = 12, columns = 4, lod: CreatureLod = 0) {
		this.clearGallery();
		if (this.creature) this.creature.object.visible = false;
		this.helpers.visible = false;
		for (let i = 0; i < count; i++) {
			const species = this.tuned(generateSpecies(firstSeed + i, plan));
			const c = this.compile(
				{ species, individual: generateIndividual(species, firstSeed + i + 700) },
				lod
			);
			const b = c.compilation.bounds;
			const size = Math.max(b.height, (b.max.z - b.min.z) * 0.6, 1e-3);
			c.object.scale.setScalar(1 / size);
			c.object.position.set((i % columns) * 1.5, 0, -Math.floor(i / columns) * 1.6);
			c.object.position.z -= (b.max.z + b.min.z) / 2 / size;
			c.object.userData.gallerySeed = firstSeed + i;
			this.scene.add(c.object);
			this.gallery.push(c);
		}
		const rows = Math.ceil(count / columns);
		this.controls.target.set(((columns - 1) * 1.5) / 2, 0.45, (-(rows - 1) * 1.6) / 2);
		this.camera.near = 0.01;
		this.camera.far = 500;
		this.camera.updateProjectionMatrix();
		this.camera.position
			.copy(this.controls.target)
			.add(new THREE.Vector3(2.2, 1.6 + rows * 0.6, 2.4 + rows * 1.1));
		this.controls.update();
		this.animateGallery(0);
	}
	private animateGallery(time: number) {
		const intent: CreatureIntent = {
			velocity: { x: 0, y: 0, z: this.gait === 'idle' ? 0 : 1 },
			heading: 0,
			angularVelocity: 0,
			gait: this.gait
		};
		for (const c of this.gallery) animateCreature(c, intent, time, 1 / 60, () => 0);
		this.renderer.render(this.scene, this.camera);
	}
	clearGallery() {
		for (const c of this.gallery) c.dispose();
		this.gallery = [];
		if (this.creature) this.creature.object.visible = true;
		this.helpers.visible = true;
	}
	/** Poses the Lab creature (and gallery) at an explicit time and renders, independent of rAF. */
	poseAt(time: number, gait: CreatureIntent['gait'] = this.gait) {
		this.gait = gait;
		this.step(time, 1 / 60);
		this.animateGallery(time);
	}
	/** Runs the Lab creature for `seconds` at a fixed step (deterministic captures and tests). */
	simulate(seconds: number, gait: CreatureIntent['gait'] = this.gait, hz = 60) {
		this.gait = gait;
		const frames = Math.max(1, Math.round(seconds * hz));
		for (let i = 0; i < frames; i++) this.step(i / hz, 1 / hz);
		this.renderer.render(this.scene, this.camera);
	}
	private clearHelpers() {
		const dispose = (o: THREE.Object3D) =>
			o.traverse((n) => {
				const m = n as THREE.Mesh;
				m.geometry?.dispose();
				if (m.material)
					for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
			});
		for (const child of [...this.helpers.children, ...this.boneHelpers]) {
			dispose(child);
			child.removeFromParent();
		}
		this.boneHelpers = [];
	}
	/** Debug marker riding a bone, so attachment overlays stay correct while the creature animates. */
	private onBone(boneId: string, object: THREE.Object3D, bindPoint: Vec3) {
		const c = this.creature!;
		const bone = c.bonesById.get(boneId);
		const joint = jointWorldPositions(c.compilation.skeleton).get(boneId);
		if (!bone || !joint) return;
		object.position.set(bindPoint.x - joint.x, bindPoint.y - joint.y, bindPoint.z - joint.z);
		object.renderOrder = 10;
		bone.add(object);
		this.boneHelpers.push(object);
	}
	updateHelpers() {
		this.clearHelpers();
		const c = this.creature;
		if (!c) return;
		this.material.wireframe = this.wireframe;
		const g = c.compilation.geometry;
		for (const mesh of c.skinnedMeshes) {
			if (this.weights) {
				// Blended bone colours: smooth gradients show where skin weights mix across joints.
				const a = new Float32Array(g.colors.length),
					tint = new THREE.Color();
				for (let i = 0; i < a.length / 3; i++) {
					for (let k = 0; k < 4; k++) {
						const w = g.skinWeights[i * 4 + k];
						if (!w) continue;
						tint.setHSL((g.skinIndices[i * 4 + k] * 0.137) % 1, 0.75, 0.52);
						a[i * 3] += tint.r * w;
						a[i * 3 + 1] += tint.g * w;
						a[i * 3 + 2] += tint.b * w;
					}
				}
				mesh.geometry.setAttribute('color', new THREE.BufferAttribute(a, 3));
			} else mesh.geometry.setAttribute('color', new THREE.BufferAttribute(g.colors, 3));
		}
		const rig = c.compilation.skeleton,
			b = c.compilation.bounds;
		const marker = Math.max(0.004, b.height * 0.012);
		const overlay = (color: number, opacity = 1) =>
			new THREE.MeshBasicMaterial({
				color,
				depthTest: false,
				transparent: opacity < 1,
				opacity
			});
		if (this.skeleton) this.helpers.add(new THREE.SkeletonHelper(c.object));
		if (this.collision)
			this.helpers.add(
				new THREE.Box3Helper(
					new THREE.Box3(
						new THREE.Vector3(b.min.x, b.min.y, b.min.z),
						new THREE.Vector3(b.max.x, b.max.y, b.max.z)
					),
					0xd88846
				)
			);
		if (this.crossSections) {
			const positions = jointWorldPositions(rig);
			for (const volume of rig.volumes) {
				const curve = new THREE.CatmullRomCurve3(
					volumePath(volume, positions).map((p) => new THREE.Vector3(p.x, p.y, p.z)),
					false,
					'centripetal'
				);
				for (const section of volume.sections) {
					const center = curve.getPoint(section.t),
						rotation = new THREE.Quaternion().setFromUnitVectors(
							new THREE.Vector3(0, 0, 1),
							curve.getTangent(section.t)
						);
					const points = Array.from({ length: 17 }, (_, i) =>
						new THREE.Vector3(
							Math.cos((i / 16) * Math.PI * 2) * section.radiusX,
							Math.sin((i / 16) * Math.PI * 2) * section.radiusY,
							0
						)
							.applyQuaternion(rotation)
							.add(center)
					);
					this.helpers.add(
						new THREE.Line(
							new THREE.BufferGeometry().setFromPoints(points),
							new THREE.LineBasicMaterial({ color: 0xe07432, depthTest: false })
						)
					);
				}
			}
		}
		if (this.chains || this.anchors) {
			c.object.updateMatrixWorld(true);
			const points: THREE.Vector3[] = [];
			for (const j of rig.joints) {
				const bone = c.bonesById.get(j.id)!;
				if (j.parentId && this.chains)
					points.push(
						bone.getWorldPosition(new THREE.Vector3()),
						c.bonesById.get(j.parentId)!.getWorldPosition(new THREE.Vector3())
					);
			}
			if (points.length)
				this.helpers.add(
					new THREE.LineSegments(
						new THREE.BufferGeometry().setFromPoints(points),
						new THREE.LineBasicMaterial({ color: 0x158d78, depthTest: false })
					)
				);
			if (this.anchors)
				for (const f of rig.features) {
					const host = jointWorldPositions(rig).get(f.hostJointId);
					if (!host) continue;
					this.onBone(
						f.hostJointId,
						new THREE.Mesh(new THREE.OctahedronGeometry(marker), overlay(0xcd4568)),
						{ x: host.x + f.offset.x, y: host.y + f.offset.y, z: host.z + f.offset.z }
					);
				}
		}
		if (this.limbRoots)
			for (const a of rig.attachments ?? []) {
				// Torso surface point (yellow), outward normal, embedded root (red), proximal bone (cyan).
				this.onBone(
					a.hostJointId,
					new THREE.Mesh(new THREE.SphereGeometry(marker, 8, 6), overlay(0xf2c230)),
					a.surfacePoint
				);
				const arrow = new THREE.ArrowHelper(
					new THREE.Vector3(a.surfaceNormal.x, a.surfaceNormal.y, a.surfaceNormal.z),
					new THREE.Vector3(),
					a.rootRadius * 3,
					0xf2c230
				);
				(arrow.line.material as THREE.LineBasicMaterial).depthTest = false;
				(arrow.cone.material as THREE.MeshBasicMaterial).depthTest = false;
				this.onBone(a.hostJointId, arrow, a.surfacePoint);
				this.onBone(
					a.hostJointId,
					new THREE.Mesh(new THREE.SphereGeometry(marker * 1.2, 8, 6), overlay(0xe0443a)),
					a.rootPoint
				);
				const pivot = jointWorldPositions(rig).get(a.proximalJointId)!;
				const bone = new THREE.Line(
					new THREE.BufferGeometry().setFromPoints([
						new THREE.Vector3(),
						new THREE.Vector3(
							pivot.x - a.rootPoint.x,
							pivot.y - a.rootPoint.y,
							pivot.z - a.rootPoint.z
						)
					]),
					new THREE.LineBasicMaterial({ color: 0x29c4d6, depthTest: false })
				);
				this.onBone(a.hostJointId, bone, a.rootPoint);
			}
		if (this.attachmentVolumes)
			for (const m of rig.masses ?? []) {
				const mesh = new THREE.Mesh(
					new THREE.SphereGeometry(1, 12, 8),
					new THREE.MeshBasicMaterial({ color: 0xc552d6, wireframe: true, depthTest: false })
				);
				const [a0, a1, a2] = m.axes.map((v) => new THREE.Vector3(v.x, v.y, v.z));
				mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(a1, a2, a0));
				mesh.scale.set(m.radii[1], m.radii[2], m.radii[0]);
				this.onBone(m.hostJointId, mesh, m.centre);
			}
		if (this.jointFrames) {
			for (const j of rig.joints) {
				const axes = new THREE.AxesHelper(marker * 4);
				(axes.material as THREE.LineBasicMaterial).depthTest = false;
				this.onBone(j.id, axes, jointWorldPositions(rig).get(j.id)!);
			}
			if (rig.face) {
				const f = rig.face;
				for (const [dir, color] of [
					[f.forward, 0x3d7bf2],
					[f.up, 0x3fbf5a],
					[f.right, 0xe0443a]
				] as const) {
					const arrow = new THREE.ArrowHelper(
						new THREE.Vector3(dir.x, dir.y, dir.z),
						new THREE.Vector3(),
						f.radii.y * 2.2,
						color
					);
					(arrow.line.material as THREE.LineBasicMaterial).depthTest = false;
					this.onBone('head', arrow, f.centre);
				}
			}
		}
	}
	/** GENERATE N: compiles, validates (incl. FLOATING_LIMB etc.) and disposes N species of a plan. */
	async sample(count = 100, plan: BodyPlanId = 'quadruped') {
		const report = {
			mode: this.mode,
			successes: 0,
			failures: 0,
			averageVertices: 0,
			maxVertices: 0,
			averageTriangles: [0, 0, 0],
			maxTriangles: 0,
			compileMs: 0,
			invalidSkeletons: 0,
			invalidSkinning: 0,
			nans: 0,
			anatomyIssues: {} as Record<string, number>,
			issueSeeds: [] as number[]
		};
		let sum = 0;
		const start = performance.now();
		for (let i = 0; i < count; i++) {
			try {
				const species = this.tuned(generateSpecies(i + 1, plan));
				const definition = { species, individual: generateIndividual(species, i + 700) };
				const lods = (this.mode === 'improved' ? [0, 1, 2] : [0, 1]) as CreatureLod[];
				const compilations = lods.map((lod) =>
					this.mode === 'current' && this.legacy
						? this.legacy(definition, lod as 0 | 1)
						: compileCreatureGeometry(definition, lod)
				);
				const g = compilations[0].geometry;
				if (!g.positions.every(Number.isFinite)) {
					report.nans++;
					throw Error('NaN');
				}
				if (!g.skinWeights.every(Number.isFinite)) {
					report.invalidSkinning++;
					throw Error('Skinning');
				}
				if (this.mode === 'improved') {
					const issues = validateCreatureAnatomy(compilations[0]);
					for (const issue of issues)
						report.anatomyIssues[issue.code] = (report.anatomyIssues[issue.code] ?? 0) + 1;
					if (issues.length && report.issueSeeds.length < 10) report.issueSeeds.push(i + 1);
				}
				compilations.forEach(
					(c, n) => (report.averageTriangles[n] += c.geometry.indices.length / 3 / count)
				);
				report.maxTriangles = Math.max(report.maxTriangles, g.indices.length / 3);
				const vertices = g.positions.length / 3;
				sum += vertices;
				report.maxVertices = Math.max(report.maxVertices, vertices);
				report.successes++;
			} catch {
				report.failures++;
			}
			if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0));
		}
		report.averageTriangles = report.averageTriangles.map(Math.round);
		report.averageVertices = sum / Math.max(1, report.successes);
		report.compileMs = performance.now() - start;
		return report;
	}
	private frame = (now: number) => {
		const dt = Math.min(0.1, (now - this.last) / 1000);
		this.last = now;
		const c = this.creature;
		if (c) {
			const before = this.followScratch.copy(c.object.position);
			const start = performance.now();
			this.step((now - this.start) / 1000, dt);
			this.telemetry.animationMs = performance.now() - start;
			// The camera follows the walking creature (including its wrap back to the start).
			const delta = before.sub(c.object.position).negate();
			if (delta.lengthSq() > 0 && this.gallery.length === 0) {
				this.controls.target.add(delta);
				this.camera.position.add(delta);
			}
		}
		if (this.gallery.length) this.animateGallery((now - this.start) / 1000);
		this.controls.update();
		this.renderer.render(this.scene, this.camera);
		this.telemetry.drawCalls = this.renderer.info.render.calls;
		this.frameCount++;
		if (now - this.frameStart > 500) {
			this.telemetry.fps = (this.frameCount * 1000) / (now - this.frameStart);
			this.frameStart = now;
			this.frameCount = 0;
		}
		this.raf = requestAnimationFrame(this.frame);
	};
	dispose() {
		cancelAnimationFrame(this.raf);
		this.observer.disconnect();
		this.controls.dispose();
		this.clearGallery();
		this.clearHelpers();
		this.debugView?.dispose();
		if (this.terrainMesh) {
			this.terrainMesh.geometry.dispose();
			(this.terrainMesh.material as THREE.Material).dispose();
		}
		this.creature?.dispose();
		this.creature = undefined;
		this.material.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}
}
