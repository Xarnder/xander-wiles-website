import { plantMetrics } from './PlantVisualMetrics';
import * as THREE from 'three';
import {
	clamp,
	positionOf,
	species,
	scaleNotes,
	type MusicPlantDefinition,
	type MusicTreeDefinition
} from './MusicModel';
import {
	buildSustainTrail,
	disposeSustainTrail,
	type SustainSettings,
	type SustainTrail
} from './SustainTrailBuilder';
export function plantVisual(p: MusicPlantDefinition) {
	const group = new THREE.Group();
	const sp = species.find((s) => s.id === p.speciesId)!;
	const material = new THREE.MeshStandardMaterial({
		color: new THREE.Color().setHSL(sp.hue, 0.12 + p.vibrancy * 0.78, 0.65),
		emissive: new THREE.Color().setHSL(sp.hue, 0.7, 0.3),
		emissiveIntensity: 0.1 + p.vibrancy * 0.25
	});
	const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.08, 0.65, 6), material);
	stem.position.y = 0.325;
	group.add(stem);
	if (p.speciesId === 'mushroom') {
		const cap = new THREE.Mesh(
			new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
			material
		);
		cap.position.y = 0.6;
		group.add(cap);
	} else if (p.speciesId === 'crystal') {
		const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), material);
		cap.position.y = 0.85;
		cap.scale.y = 1.6;
		group.add(cap);
	} else {
		const count = p.speciesId === 'reed' ? 3 : 5;
		for (let i = 0; i < count; i++) {
			const petal = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), material);
			const a = (i / count) * Math.PI * 2;
			petal.position.set(Math.cos(a) * 0.2, 0.68, Math.sin(a) * 0.2);
			petal.scale.set(1, p.speciesId === 'reed' ? 2.4 : 0.45, p.speciesId === 'fern' ? 2 : 1);
			group.add(petal);
		}
	}
	group.scale.setScalar(plantMetrics(p).scale);
	return group;
}
export function disposeGroup(g: THREE.Object3D) {
	const materials = new Set<THREE.Material>();
	g.traverse((o) => {
		if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
			o.geometry.dispose();
			for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
		}
	});
	materials.forEach((m) => m.dispose());
	g.removeFromParent();
}
export class MusicPlantManager {
	definitions: MusicPlantDefinition[] = [];
	readonly byId = new Map<string, MusicPlantDefinition>();
	readonly visuals = new Map<string, THREE.Group>();
	readonly trails = new Map<string, SustainTrail>();
	readonly group = new THREE.Group();
	private readonly trailGroup = new THREE.Group();
	private cells = new Map<string, Set<string>>();
	private trees = new Map<string, MusicTreeDefinition>();
	private positions = new Map<string, { x: number; z: number; radius: number }>();
	private maxClearance = 1;
	private desired = new Set<string>();
	private lastStream = 0;
	readonly maxLivePlants = 400;
	readonly renderDistance = 100;
	constructor(
		private surface: (x: number, z: number) => number,
		private sustainSettings: SustainSettings
	) {
		this.group.add(this.trailGroup);
	}
	private key(x: number, z: number) {
		return `${Math.floor(x / 32)},${Math.floor(z / 32)}`;
	}
	overlaps(x: number, z: number, radius = 0.2, ignoreId?: string) {
		const reach = Math.ceil((radius + this.maxClearance) / 32);
		for (let dx = -reach; dx <= reach; dx++)
			for (let dz = -reach; dz <= reach; dz++)
				for (const id of this.cells.get(this.key(x + dx * 32, z + dz * 32)) ?? []) {
					if (id === ignoreId) continue;
					const p = this.positions.get(id)!;
					if (Math.hypot(p.x - x, p.z - z) < radius + p.radius) return true;
				}
		return false;
	}
	add(t: MusicTreeDefinition, p: MusicPlantDefinition, render = true) {
		this.definitions.push(p);
		this.byId.set(p.id, p);
		this.trees.set(t.id, t);
		this.index(p, t);
		if (render && this.visuals.size < this.maxLivePlants) this.createVisual(p, t);
	}
	private index(p: MusicPlantDefinition, t: MusicTreeDefinition) {
		const pos = positionOf(t, p),
			radius = plantMetrics(p).placementClearanceRadius;
		this.positions.set(p.id, { ...pos, radius });
		this.maxClearance = Math.max(this.maxClearance, radius);
		const key = this.key(pos.x, pos.z),
			cell = this.cells.get(key) ?? new Set<string>();
		cell.add(p.id);
		this.cells.set(key, cell);
	}
	private createVisual(p: MusicPlantDefinition, t: MusicTreeDefinition) {
		const g = plantVisual(p),
			pos = this.positions.get(p.id)!;
		g.position.set(pos.x, this.surface(pos.x, pos.z), pos.z);
		g.traverse((o) => (o.userData.musicPlantId = p.id));
		this.group.add(g);
		this.visuals.set(p.id, g);
		this.rebuildTrail(t, p);
	}
	private unload(id: string) {
		const g = this.visuals.get(id);
		if (g) disposeGroup(g);
		this.visuals.delete(id);
		const trail = this.trails.get(id);
		if (trail) disposeSustainTrail(trail);
		this.trails.delete(id);
	}
	stream(x: number, z: number, now = performance.now()) {
		if (now - this.lastStream > 250 || !this.lastStream) {
			this.lastStream = now;
			const range = Math.ceil((this.renderDistance + this.maxClearance) / 32);
			const near: { id: string; distance: number }[] = [];
			for (let dx = -range; dx <= range; dx++)
				for (let dz = -range; dz <= range; dz++)
					for (const id of this.cells.get(this.key(x + dx * 32, z + dz * 32)) ?? []) {
						const p = this.positions.get(id)!;
						const distance = Math.hypot(p.x - x, p.z - z) - p.radius;
						if (distance < this.renderDistance) near.push({ id, distance });
					}
			near.sort((a, b) => a.distance - b.distance);
			this.desired = new Set(near.slice(0, this.maxLivePlants).map((p) => p.id));
			for (const id of this.visuals.keys()) if (!this.desired.has(id)) this.unload(id);
		}
		let budget = 16;
		for (const id of this.desired)
			if (!this.visuals.has(id)) {
				const p = this.byId.get(id);
				if (p) this.createVisual(p, this.trees.get(p.musicTreeId)!);
				if (--budget === 0) break;
			}
	}
	rebuildSpatialIndex() {
		this.cells.clear();
		this.positions.clear();
		this.maxClearance = 1;
		for (const p of this.definitions) {
			const t = this.trees.get(p.musicTreeId)!;
			this.index(p, t);
			const g = this.visuals.get(p.id);
			if (g) {
				const pos = this.positions.get(p.id)!;
				g.position.set(pos.x, this.surface(pos.x, pos.z), pos.z);
				this.rebuildTrail(t, p);
			}
		}
		this.lastStream = 0;
	}
	rebuildTrail(t: MusicTreeDefinition, p: MusicPlantDefinition) {
		const old = this.trails.get(p.id);
		if (old) disposeSustainTrail(old);
		this.trails.delete(p.id);
		if (!this.visuals.has(p.id) || !this.sustainSettings.sustainTrailsEnabled) return;
		const trail = buildSustainTrail(t, p, this.surface, this.sustainSettings);
		trail.object.traverse((o) => (o.userData.musicPlantId = p.id));
		this.trailGroup.add(trail.object);
		this.trails.set(p.id, trail);
	}
	remove(id: string) {
		this.unload(id);
		const pos = this.positions.get(id);
		if (pos) this.cells.get(this.key(pos.x, pos.z))?.delete(id);
		this.positions.delete(id);
		this.byId.delete(id);
		this.desired.delete(id);
		this.definitions = this.definitions.filter((p) => p.id !== id);
	}
	quantize(t: MusicTreeDefinition, p: MusicPlantDefinition) {
		if (p.pitchMidi === undefined) {
			const notes = scaleNotes(
				t.scale,
				species.find((s) => s.id === p.speciesId)!
			);
			p.pitchMidi = notes[Math.round(clamp(p.growth ?? 0.5) * (notes.length - 1))];
		}
		p.instrumentId ??= species.find((s) => s.id === p.speciesId)!.instrumentId;
		delete p.growth;
	}
	clear() {
		for (const id of this.visuals.keys()) this.unload(id);
		this.cells.clear();
		this.positions.clear();
		this.byId.clear();
		this.trees.clear();
		this.desired.clear();
		this.definitions = [];
	}
}
