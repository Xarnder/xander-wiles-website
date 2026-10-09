import * as THREE from 'three';
import { HYDRO_CELL } from './HydrologySpatialIndex';
import type { HydrologySystem } from './HydrologySystem';
import type { HydrologyDebugSettings } from './HydrologyTypes';
import { lakeRadiusAt } from './HydrologyMath';

/**
 * Developer overlays for sources, raw routes, splines, lakes and spatial cells.
 * Rebuilt when the player moves to a new area or a toggle changes — not every frame.
 */
export class HydrologyDebugView {
	readonly group = new THREE.Group();
	private readonly signature = { x: Number.NaN, z: Number.NaN, flags: '' };

	constructor() {
		this.group.name = 'hydrology-debug';
	}

	update(
		hydrology: HydrologySystem,
		debug: HydrologyDebugSettings,
		playerX: number,
		playerZ: number,
		baseAt: (x: number, z: number) => number
	): void {
		const flags = JSON.stringify(debug);
		if (
			flags === this.signature.flags &&
			Math.hypot(playerX - this.signature.x, playerZ - this.signature.z) < 48
		) {
			return;
		}
		this.signature.flags = flags;
		this.signature.x = playerX;
		this.signature.z = playerZ;
		this.clear();
		if (!hydrology.settings.enabled || !anyDebug(debug)) return;

		const radius = 700;
		const yOf = (x: number, z: number) => baseAt(x, z) + 0.6;

		if (debug.showHydrologyRegions) {
			const size = hydrology.settings.regionSize;
			const rx = Math.floor(playerX / size);
			const rz = Math.floor(playerZ / size);
			this.addLoop(
				[
					[rx * size, rz * size],
					[(rx + 1) * size, rz * size],
					[(rx + 1) * size, (rz + 1) * size],
					[rx * size, (rz + 1) * size]
				],
				0x88ff88,
				yOf
			);
		}

		if (debug.showHydrologyGrid) {
			const grid = hydrology.settings.gridSpacing;
			const span = 4;
			const cx = Math.floor(playerX / grid);
			const cz = Math.floor(playerZ / grid);
			const positions: number[] = [];
			for (let z = cz - span; z <= cz + span; z++) {
				for (let x = cx - span; x <= cx + span; x++) {
					const wx = (x + 0.5) * grid;
					const wz = (z + 0.5) * grid;
					positions.push(wx, yOf(wx, wz), wz);
				}
			}
			this.addPoints(positions, 0x668866);
		}

		for (const river of hydrology.riversNear(playerX, playerZ, radius)) {
			if (debug.showRiverSources) {
				this.addPoints(
					[river.sourceX, yOf(river.sourceX, river.sourceZ) + 1.2, river.sourceZ],
					0xff3355
				);
			}
			if (debug.showRawRiverPaths && river.raw.length > 1) {
				this.addPolyline(
					river.raw.map((point) => [point.x, point.z] as [number, number]),
					0xff8822,
					yOf
				);
			}
			const active = river.samples.slice(0, river.endIndex);
			if (debug.showRiverSplines && active.length > 1) {
				this.addPolyline(
					active.map((sample) => [sample.x, sample.z] as [number, number]),
					0x3d7dff,
					(x, z) => {
						const sample = active.find((item) => item.x === x && item.z === z);
						return (sample?.waterY ?? yOf(x, z)) + 0.4;
					}
				);
			}
			if (debug.showFlowDirection) {
				for (let i = 0; i < active.length; i += 4) {
					const sample = active[i];
					this.addPolyline(
						[
							[sample.x, sample.z],
							[sample.x + sample.tangentX * 6, sample.z + sample.tangentZ * 6]
						],
						0xffffff,
						() => sample.waterY + 0.8
					);
				}
			}
			if (debug.showRiverWidth || debug.showRiverInfluence) {
				for (let i = 0; i < active.length; i += 3) {
					const sample = active[i];
					const px = -sample.tangentZ;
					const pz = sample.tangentX;
					const half = debug.showRiverInfluence
						? sample.width * 0.5 + (2.4 + sample.width * 0.5) * hydrology.settings.riverBankScale
						: sample.width * 0.5;
					this.addPolyline(
						[
							[sample.x - px * half, sample.z - pz * half],
							[sample.x + px * half, sample.z + pz * half]
						],
						debug.showRiverInfluence ? 0xffdd55 : 0x66ccff,
						() => sample.waterY + 0.3
					);
				}
			}
		}

		if (debug.showLakeCandidates) {
			for (const region of hydrology.getRegions()) {
				for (const candidate of region.candidates) {
					if (Math.hypot(candidate.x - playerX, candidate.z - playerZ) > radius) continue;
					const y = candidate.accepted ? candidate.waterLevel + 1.2 : yOf(candidate.x, candidate.z);
					this.addPoints([candidate.x, y, candidate.z], candidate.accepted ? 0x66ffcc : 0x555555);
				}
			}
		}

		for (const lake of hydrology.lakesNear(playerX, playerZ, radius)) {
			if (debug.showLakeBoundary || debug.showLakeBasin) {
				const loop: [number, number][] = [];
				for (let i = 0; i < 40; i++) {
					const angle = (i / 40) * Math.PI * 2;
					const radiusAt = lakeRadiusAt(lake, angle) * (debug.showLakeBasin ? 0.55 : 1);
					loop.push([lake.x + Math.cos(angle) * radiusAt, lake.z + Math.sin(angle) * radiusAt]);
				}
				this.addLoop(loop, debug.showLakeBasin ? 0x226688 : 0x44ddff, () => lake.waterLevel + 0.35);
			}
			if (debug.showLakeWaterLevel) {
				this.addPoints([lake.x, lake.waterLevel + 0.2, lake.z], 0xaaffee);
			}
		}

		if (debug.showSpatialCells) {
			for (const cell of hydrology.occupiedCells()) {
				const x = cell.cx * HYDRO_CELL;
				const z = cell.cz * HYDRO_CELL;
				if (Math.hypot(x - playerX, z - playerZ) > radius) continue;
				this.addLoop(
					[
						[x, z],
						[x + HYDRO_CELL, z],
						[x + HYDRO_CELL, z + HYDRO_CELL],
						[x, z + HYDRO_CELL]
					],
					0x9977ff,
					yOf
				);
			}
		}
	}

	private addPolyline(
		points: [number, number][],
		color: number,
		yAt: (x: number, z: number) => number
	): void {
		const positions: number[] = [];
		for (let i = 0; i < points.length - 1; i++) {
			const a = points[i];
			const b = points[i + 1];
			positions.push(a[0], yAt(a[0], a[1]), a[1], b[0], yAt(b[0], b[1]), b[1]);
		}
		this.addLines(positions, color);
	}

	private addLoop(
		points: [number, number][],
		color: number,
		yAt: (x: number, z: number) => number
	): void {
		if (points.length < 2) return;
		this.addPolyline([...points, points[0]], color, yAt);
	}

	private addPoints(positions: number[], color: number): void {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		const points = new THREE.Points(
			geometry,
			new THREE.PointsMaterial({ color, size: 6, sizeAttenuation: false })
		);
		this.group.add(points);
	}

	private addLines(positions: number[], color: number): void {
		if (positions.length < 6) return;
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		this.group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color })));
	}

	private clear(): void {
		for (const child of [...this.group.children]) {
			this.group.remove(child);
			const mesh = child as THREE.Points | THREE.LineSegments;
			mesh.geometry.dispose();
			const material = mesh.material;
			if (!Array.isArray(material)) material.dispose();
		}
	}
}

function anyDebug(debug: HydrologyDebugSettings): boolean {
	return Object.values(debug).some(Boolean);
}
