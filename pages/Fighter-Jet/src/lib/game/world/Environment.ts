import {
	BoxGeometry,
	Color,
	CylinderGeometry,
	DirectionalLight,
	Group,
	HemisphereLight,
	IcosahedronGeometry,
	InstancedMesh,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	PointLight,
	SpotLight
} from 'three';
import { GAME_CONFIG } from '../config/gameConfig';
import type { QualityLevel } from '../types';
import type { Terrain } from './Terrain';

function seeded(index: number, salt: number): number {
	const value = Math.sin(index * 91.17 + salt * 47.73) * 43758.5453;
	return value - Math.floor(value);
}

export class Environment extends Group {
	private readonly radar: Group;
	private readonly searchlightPivots: Group[] = [];

	constructor(terrain: Terrain, quality: QualityLevel) {
		super();
		this.name = 'Environment';
		this.addLights(quality);
		this.add(this.createClouds(quality));
		this.add(this.createGroundDetails(terrain, quality));
		this.add(this.createRoads(terrain));
		this.addIndustrialLights(terrain, quality);
		this.radar = this.createRadar(terrain);
		this.add(this.radar);
		if (quality !== 'low') this.addSearchlights(terrain);
	}

	update(elapsed: number): void {
		this.radar.rotation.y = elapsed * 0.82;
		for (let index = 0; index < this.searchlightPivots.length; index += 1) {
			const pivot = this.searchlightPivots[index];
			pivot.rotation.y = elapsed * (0.17 + index * 0.035) + index * 2.1;
			pivot.rotation.x = -0.22 + Math.sin(elapsed * 0.31 + index) * 0.08;
		}
	}

	private addLights(quality: QualityLevel): void {
		const sky = new HemisphereLight(0xb8d9ec, 0x6b3f22, 2.35);
		this.add(sky);
		const sun = new DirectionalLight(0xffe3bd, 3.25);
		sun.position.set(-2400, 3600, 1700);
		sun.castShadow = quality === 'high';
		if (sun.castShadow) {
			sun.shadow.mapSize.set(2048, 2048);
			sun.shadow.camera.near = 100;
			sun.shadow.camera.far = 8000;
			sun.shadow.camera.left = -2400;
			sun.shadow.camera.right = 2400;
			sun.shadow.camera.top = 2400;
			sun.shadow.camera.bottom = -2400;
		}
		this.add(sun);
	}

	private createClouds(quality: QualityLevel): InstancedMesh {
		const count =
			quality === 'low'
				? Math.floor(GAME_CONFIG.world.cloudCount * 0.5)
				: GAME_CONFIG.world.cloudCount;
		const geometry = new IcosahedronGeometry(1, quality === 'high' ? 2 : 1);
		const material = new MeshStandardMaterial({
			color: 0xe9f0f0,
			transparent: true,
			opacity: 0.62,
			roughness: 1,
			depthWrite: false
		});
		const clouds = new InstancedMesh(geometry, material, count);
		const dummy = new Object3D();
		for (let index = 0; index < count; index += 1) {
			const angle = seeded(index, 1) * Math.PI * 2;
			const radius = 1800 + seeded(index, 2) * 4300;
			dummy.position.set(
				Math.cos(angle) * radius,
				720 + seeded(index, 3) * 1050,
				Math.sin(angle) * radius - 800
			);
			dummy.scale.set(
				80 + seeded(index, 4) * 190,
				22 + seeded(index, 5) * 48,
				55 + seeded(index, 6) * 125
			);
			dummy.rotation.y = seeded(index, 7) * Math.PI;
			dummy.updateMatrix();
			clouds.setMatrixAt(index, dummy.matrix);
		}
		clouds.instanceMatrix.needsUpdate = true;
		clouds.name = 'CloudField';
		return clouds;
	}

	private createGroundDetails(terrain: Terrain, quality: QualityLevel): Group {
		const group = new Group();
		const rockCount =
			quality === 'low'
				? Math.floor(GAME_CONFIG.world.rockCount * 0.35)
				: GAME_CONFIG.world.rockCount;
		const rockGeometry = new IcosahedronGeometry(1, 0);
		const rockMaterial = new MeshStandardMaterial({ color: 0x6f4930, roughness: 1 });
		const rocks = new InstancedMesh(rockGeometry, rockMaterial, rockCount);
		const dummy = new Object3D();
		for (let index = 0; index < rockCount; index += 1) {
			const x = (seeded(index, 12) - 0.5) * GAME_CONFIG.world.size;
			const z = (seeded(index, 13) - 0.5) * GAME_CONFIG.world.size;
			const scale = 3 + seeded(index, 14) * 13;
			dummy.position.set(x, terrain.terrainHeightAt(x, z) + scale * 0.35, z);
			dummy.scale.set(scale, scale * (0.45 + seeded(index, 15) * 0.7), scale * 0.8);
			dummy.rotation.set(seeded(index, 16), seeded(index, 17) * Math.PI, seeded(index, 18));
			dummy.updateMatrix();
			rocks.setMatrixAt(index, dummy.matrix);
		}
		rocks.instanceMatrix.needsUpdate = true;
		group.add(rocks);

		if (quality !== 'low') {
			const scrubGeometry = new IcosahedronGeometry(1, 0);
			const scrubMaterial = new MeshStandardMaterial({ color: 0x6e6b31, roughness: 1 });
			const scrub = new InstancedMesh(scrubGeometry, scrubMaterial, GAME_CONFIG.world.scrubCount);
			for (let index = 0; index < GAME_CONFIG.world.scrubCount; index += 1) {
				const x = (seeded(index, 21) - 0.5) * GAME_CONFIG.world.size;
				const z = (seeded(index, 22) - 0.5) * GAME_CONFIG.world.size;
				const scale = 1.4 + seeded(index, 23) * 3.5;
				dummy.position.set(x, terrain.terrainHeightAt(x, z) + scale * 0.35, z);
				dummy.scale.set(scale, scale * 0.55, scale);
				dummy.rotation.y = seeded(index, 24) * Math.PI;
				dummy.updateMatrix();
				scrub.setMatrixAt(index, dummy.matrix);
			}
			scrub.instanceMatrix.needsUpdate = true;
			group.add(scrub);
		}
		return group;
	}

	private createRoads(terrain: Terrain): Group {
		const roads = new Group();
		const material = new MeshStandardMaterial({ color: 0x34312c, roughness: 0.92 });
		const coordinates: ReadonlyArray<readonly [number, number, number, number]> = [
			[-850, -3600, 1700, 34],
			[0, -4300, 32, 1500],
			[430, -3250, 32, 950]
		];
		for (const [x, z, width, depth] of coordinates) {
			const road = new Mesh(new BoxGeometry(width, 1.2, depth), material);
			road.position.set(x, terrain.terrainHeightAt(x, z) + 0.45, z);
			road.receiveShadow = true;
			roads.add(road);
		}
		return roads;
	}

	private addIndustrialLights(terrain: Terrain, quality: QualityLevel): void {
		if (quality === 'low') return;
		for (let index = 0; index < 8; index += 1) {
			const angle = (index / 8) * Math.PI * 2;
			const x = Math.cos(angle) * 620;
			const z = -3600 + Math.sin(angle) * 460;
			const light = new PointLight(index % 3 === 0 ? 0xff592f : 0xffc46b, 7, 170, 2);
			light.position.set(x, terrain.terrainHeightAt(x, z) + 18, z);
			this.add(light);
		}
	}

	private createRadar(terrain: Terrain): Group {
		const group = new Group();
		const support = new Mesh(
			new CylinderGeometry(8, 12, 36, 8),
			new MeshStandardMaterial({ color: 0x6b716b, metalness: 0.7, roughness: 0.35 })
		);
		const dish = new Mesh(
			new CylinderGeometry(2, 18, 4, 16),
			new MeshStandardMaterial({ color: 0x8d998f, metalness: 0.65, roughness: 0.3 })
		);
		dish.position.y = 20;
		dish.rotation.z = Math.PI * 0.38;
		group.add(support, dish);
		group.position.set(-360, terrain.terrainHeightAt(-360, -3650) + 18, -3650);
		return group;
	}

	private addSearchlights(terrain: Terrain): void {
		for (let index = 0; index < 2; index += 1) {
			const pivot = new Group();
			const x = index === 0 ? -540 : 590;
			const z = -3400 + index * 160;
			pivot.position.set(x, terrain.terrainHeightAt(x, z) + 8, z);
			const light = new SpotLight(new Color(0xdbe9ff), 22, 1700, 0.07, 0.55, 1.3);
			light.position.set(0, 0, 0);
			light.target.position.set(0, 450, -1100);
			pivot.add(light, light.target);
			this.searchlightPivots.push(pivot);
			this.add(pivot);
		}
	}
}
