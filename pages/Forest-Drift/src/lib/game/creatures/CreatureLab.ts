import * as THREE from 'three';
import { jointWorldPositions } from './SkeletonGenerator';
import { createCreatureState, decideCreature, advanceCreature } from './CreatureBehaviourSystem';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { compileCreature, type CompiledCreature } from './CreatureCompiler';
import { animateCreature } from './CreatureAnimationSystem';
import { generateSpecies } from './SpeciesGenerator';
import { generateIndividual } from './IndividualGenerator';
import type { BodyPlanId, CreatureDefinition, CreatureIntent } from './CreatureTypes';

/** Isolated developer renderer. Nothing in this scene is world state until explicitly placed. */
export class CreatureLab {
	readonly scene = new THREE.Scene();
	readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 5000);
	readonly renderer = new THREE.WebGLRenderer({ antialias: true });
	readonly controls: OrbitControls;
	creature?: CompiledCreature;
	definition?: CreatureDefinition;
	private helpers = new THREE.Group();
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
	telemetry = {
		fps: 0,
		vertices: 0,
		triangles: 0,
		bones: 0,
		compileMs: 0,
		drawCalls: 0,
		animationMs: 0
	};
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
	generate(
		speciesSeed: number,
		individualSeed: number,
		plan: BodyPlanId,
		scale = 1,
		lod: 0 | 1 = 0
	) {
		const species = generateSpecies(speciesSeed, plan);
		if (scale !== 1) {
			species.id += `_lab_${scale}`;
			for (const key of Object.keys(species.proportions) as (keyof typeof species.proportions)[])
				if (!['chestScale', 'waistScale', 'frontLegRatio'].includes(key))
					species.proportions[key] *= scale;
		}
		const individual = generateIndividual(species, individualSeed);
		const definition = { species, individual };
		const start = performance.now();
		const next = this.isolateMaterial(compileCreature(definition, lod));
		this.creature?.dispose();
		this.creature = next;
		this.definition = definition;
		this.scene.add(next.object);
		this.telemetry.compileMs = performance.now() - start;
		this.telemetry.vertices = next.compilation.geometry.positions.length / 3;
		this.telemetry.triangles = next.compilation.geometry.indices.length / 3;
		this.telemetry.bones = next.compilation.skeleton.joints.length;
		this.view('front');
		this.updateHelpers();
		return definition;
	}
	private isolateMaterial(c: CompiledCreature) {
		const materials = c.skinnedMeshes.map((mesh) => {
			const palette = c.compilation.definition.species.appearance.palette;
			const m = new THREE.MeshStandardMaterial({
				vertexColors: true,
				roughness: palette.roughness,
				metalness: palette.metalness
			});
			mesh.material = m;
			return m;
		});
		const dispose = c.dispose;
		c.dispose = () => {
			materials.forEach((m) => m.dispose());
			dispose();
		};
		return c;
	}
	async benchmark(count: number) {
		if (![10, 25, 50, 100].includes(count)) throw Error('Choose 10,25,50 or100 creatures');
		cancelAnimationFrame(this.raf);
		const creatures: CompiledCreature[] = [];
		const states: ReturnType<typeof createCreatureState>[] = [];
		const access = { surface: () => 0, blocked: () => false };
		const start = performance.now();
		this.creature!.object.visible = false;
		try {
			for (let i = 0; i < count; i++) {
				const species = generateSpecies(
					i + 500,
					(['quadruped', 'biped', 'hexapod', 'serpentine'] as const)[i % 4]
				);
				const p = species.proportions;
				const scale = 1.4 / (p.legLength + p.bodyDepth + p.headSize + p.neckLength);
				for (const key of Object.keys(p) as (keyof typeof p)[])
					if (!['chestScale', 'waistScale', 'frontLegRatio'].includes(key)) p[key] *= scale;
				const individual = generateIndividual(species, i + 80),
					c = this.isolateMaterial(compileCreature({ species, individual }));
				c.object.position.set((i % 10) * 4, 0, Math.floor(i / 10) * 4);
				this.scene.add(c.object);
				creatures.push(c);
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
			let animationMs = 0,
				behaviourMs = 0,
				cpuMs = 0;
			const elapsedStart = performance.now();
			for (let frame = 0; frame < 45; frame++) {
				await new Promise(requestAnimationFrame);
				const cpuStart = performance.now(),
					time = frame / 30;
				let stamp = performance.now();
				if (frame % 6 === 0)
					for (const state of states)
						decideCreature(state, { x: 18, y: 0, z: 18 }, states, time, access);
				for (const state of states) advanceCreature(state, 1 / 30, access);
				behaviourMs += performance.now() - stamp;
				stamp = performance.now();
				for (let i = 0; i < count; i++) {
					creatures[i].object.position.copy(states[i].position);
					animateCreature(
						creatures[i],
						{ ...states[i].intent, gait: 'walk' },
						time,
						1 / 30,
						access.surface
					);
				}
				animationMs += performance.now() - stamp;
				this.renderer.render(this.scene, this.camera);
				cpuMs += performance.now() - cpuStart;
			}
			return {
				count,
				compileMs,
				fps: 45000 / (performance.now() - elapsedStart),
				cpuFrameMs: cpuMs / 45,
				animationMs: animationMs / 45,
				behaviourMs: behaviourMs / 45,
				drawCalls: this.renderer.info.render.calls,
				triangles: this.renderer.info.render.triangles,
				heapBytes: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
					?.usedJSHeapSize
			};
		} finally {
			creatures.forEach((c) => c.dispose());
			this.creature!.object.visible = true;
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
	updateHelpers() {
		for (const child of [...this.helpers.children]) {
			child.traverse((o) => {
				const m = o as THREE.Mesh;
				if (m.geometry) m.geometry.dispose();
				if (m.material) {
					for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
				}
			});
			child.removeFromParent();
		}
		const c = this.creature;
		if (!c) return;
		for (const mesh of c.skinnedMeshes) {
			for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
				if (mat instanceof THREE.MeshStandardMaterial) mat.wireframe = this.wireframe;
			}
			const colors = c.compilation.geometry.colors;
			if (this.weights) {
				const a = new Float32Array(colors.length);
				for (let i = 0; i < a.length / 3; i++) {
					const color = new THREE.Color().setHSL(
						(c.compilation.geometry.skinIndices[i * 4] * 0.137) % 1,
						0.7,
						0.5
					);
					color.toArray(a, i * 3);
				}
				mesh.geometry.setAttribute('color', new THREE.BufferAttribute(a, 3));
			} else mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		}
		if (this.skeleton) this.helpers.add(new THREE.SkeletonHelper(c.object));
		if (this.collision) {
			const b = c.compilation.bounds;
			this.helpers.add(
				new THREE.Box3Helper(
					new THREE.Box3(
						new THREE.Vector3(b.min.x, b.min.y, b.min.z),
						new THREE.Vector3(b.max.x, b.max.y, b.max.z)
					),
					0xd88846
				)
			);
		}
		if (this.crossSections) {
			const positions = jointWorldPositions(c.compilation.skeleton);
			for (const volume of c.compilation.skeleton.volumes) {
				const curve = new THREE.CatmullRomCurve3(
					volume.jointIds.map((id) => {
						const p = positions.get(id)!;
						return new THREE.Vector3(p.x, p.y, p.z);
					})
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
			for (const j of c.compilation.skeleton.joints) {
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
				for (const f of c.compilation.skeleton.features) {
					const b = c.bonesById.get(f.hostJointId);
					if (b) {
						const marker = new THREE.Mesh(
							new THREE.OctahedronGeometry(Math.max(0.015, c.compilation.bounds.height * 0.014)),
							new THREE.MeshBasicMaterial({ color: 0xcd4568 })
						);
						marker.position.copy(
							b.localToWorld(new THREE.Vector3(f.offset.x, f.offset.y, f.offset.z))
						);
						this.helpers.add(marker);
					}
				}
		}
	}
	async sample(count = 100, plan: BodyPlanId = 'quadruped') {
		const report = {
			successes: 0,
			failures: 0,
			averageVertices: 0,
			maxVertices: 0,
			compileMs: 0,
			invalidSkeletons: 0,
			invalidSkinning: 0,
			nans: 0
		};
		let sum = 0;
		const start = performance.now();
		for (let i = 0; i < count; i++) {
			try {
				const species = generateSpecies(i + 1, plan);
				const c = compileCreature({ species, individual: generateIndividual(species, i + 700) }, 0);
				const g = c.compilation.geometry;
				if (!g.positions.every(Number.isFinite)) {
					report.nans++;
					throw Error('NaN');
				}
				if (!g.skinWeights.every(Number.isFinite)) {
					report.invalidSkinning++;
					throw Error('Skinning');
				}
				const vertices = g.positions.length / 3;
				sum += vertices;
				report.maxVertices = Math.max(report.maxVertices, vertices);
				report.successes++;
				c.dispose();
			} catch {
				report.failures++;
			}
			if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0));
		}
		report.averageVertices = sum / Math.max(1, report.successes);
		report.compileMs = performance.now() - start;
		return report;
	}
	private frame = (now: number) => {
		const dt = Math.min(0.1, (now - this.last) / 1000);
		this.last = now;
		const c = this.creature;
		if (c) {
			const start = performance.now();
			animateCreature(
				c,
				{
					velocity: {
						x: 0,
						y: 0,
						z: this.gait === 'idle' ? 0 : this.definition!.species.behaviour.wanderSpeed
					},
					heading: 0,
					angularVelocity: 0,
					gait: this.gait,
					lookTarget: { x: 2, y: 1, z: 4 }
				},
				(now - this.start) / 1000,
				dt,
				() => 0
			);
			this.telemetry.animationMs = performance.now() - start;
		}
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
		this.creature?.dispose();
		this.creature = undefined;
		this.updateHelpers();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}
}
