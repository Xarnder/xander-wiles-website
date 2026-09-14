import * as THREE from 'three';
import { chunkCoordsForPosition, chunkIdFromCoords } from './miniBuildGrid';
import type { MiniBuildChunkReadout } from './MiniBuildSystem';
import { MINI_BUILD_WORLD_LIMITS } from './MiniBuildTypes';

const CURRENT_EDGE = new THREE.Color(0xffd166);
const OTHER_EDGE = new THREE.Color(0x7ec8e3);
const POST_HEIGHT = 2.4;
const LINE_LIFT = 0.08;
const SAMPLE_STEP = 1;
const LABEL_COLORS: Record<MiniBuildChunkReadout['level'], string> = {
	ok: 'rgba(22, 70, 46, 0.82)',
	near: 'rgba(140, 98, 18, 0.9)',
	full: 'rgba(150, 40, 35, 0.92)'
};
const LABEL_BAR_COLORS: Record<MiniBuildChunkReadout['level'], string> = {
	ok: '#7ec89a',
	near: '#f3c969',
	full: '#ff8a80'
};
/** Labels fade out beyond this distance so far chunks don't clutter the screen. */
const LABEL_FADE_START = 30;
const LABEL_FADE_END = 60;

export interface MiniBuildChunkBoundariesOptions {
	camera: THREE.Camera;
	/** Element the labels are positioned over (the canvas container). */
	getLabelContainer: () => HTMLElement | null;
	/** Supporting surface under a point, relative to a reference height (upper floors stay upper). */
	getSurfaceY: (x: number, z: number, referenceY: number) => number;
	getReadout: (x: number, z: number) => MiniBuildChunkReadout;
	/** Chunks drawn on each side of the player's chunk. */
	radiusChunks?: number;
}

interface Label {
	element: HTMLDivElement;
	world: THREE.Vector3;
	key: string;
}

/**
 * Debug overlay for Mini Build budget chunks (16m): edge lines that follow the ground, corner posts
 * that are visible from a distance, and a usage label per chunk ("124 / 512") coloured by how full it
 * is. The chunk the player stands in is highlighted.
 *
 * Labels are small DOM elements projected over the canvas rather than sprites: the GTAO pre-pass
 * renders sprites with an override material (darkening them), while lines are excluded from it.
 *
 * Only exists while enabled. Line geometry is rebuilt when the player changes chunk or floor, or the
 * building surfaces change; label text only changes when a chunk's usage does. Per frame it just
 * projects at most 25 label anchors.
 */
export class MiniBuildChunkBoundaries {
	readonly group = new THREE.Group();
	private readonly options: Required<MiniBuildChunkBoundariesOptions>;
	private readonly material = new THREE.LineBasicMaterial({
		vertexColors: true,
		transparent: true,
		opacity: 0.9,
		depthWrite: false
	});
	private lines: THREE.LineSegments | null = null;
	private readonly labels = new Map<string, Label>();
	private labelLayer: HTMLDivElement | null = null;
	private readonly projected = new THREE.Vector3();
	private enabled = false;
	private geometryKey = '';

	constructor(options: MiniBuildChunkBoundariesOptions) {
		this.options = { radiusChunks: 2, ...options };
		this.group.name = 'mini-build-chunk-boundaries';
		this.group.visible = false;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	setEnabled(enabled: boolean): void {
		if (enabled === this.enabled) return;
		this.enabled = enabled;
		this.group.visible = enabled;
		if (!enabled) this.clear();
	}

	/** Cheap when nothing changed: one key comparison plus a usage check per labelled chunk. */
	update(eye: { x: number; y: number; z: number }, surfaceRevision: number): void {
		if (!this.enabled) return;
		const { cx, cz } = chunkCoordsForPosition(eye.x, eye.z);
		const floor = Math.round(eye.y / 1.5);
		const key = `${cx}:${cz}:${floor}:${surfaceRevision}`;
		if (key !== this.geometryKey) {
			this.geometryKey = key;
			this.rebuildLines(cx, cz, eye.y);
		}
		this.updateLabels(cx, cz, eye.y);
		this.positionLabels(eye);
	}

	dispose(): void {
		this.clear();
		this.material.dispose();
		this.group.removeFromParent();
	}

	private clear(): void {
		if (this.lines) {
			this.lines.geometry.dispose();
			this.lines.removeFromParent();
			this.lines = null;
		}
		for (const label of this.labels.values()) this.disposeLabel(label);
		this.labels.clear();
		this.labelLayer?.remove();
		this.labelLayer = null;
		this.geometryKey = '';
	}

	private rebuildLines(pcx: number, pcz: number, referenceY: number): void {
		if (this.lines) {
			this.lines.geometry.dispose();
			this.lines.removeFromParent();
		}
		const size = MINI_BUILD_WORLD_LIMITS.chunkSize;
		const r = this.options.radiusChunks;
		const positions: number[] = [];
		const colors: number[] = [];
		const y = (x: number, z: number) => this.options.getSurfaceY(x, z, referenceY) + LINE_LIFT;
		const push = (
			ax: number,
			az: number,
			bx: number,
			bz: number,
			color: THREE.Color,
			ay?: number,
			by?: number
		) => {
			positions.push(ax, ay ?? y(ax, az), az, bx, by ?? y(bx, bz), bz);
			colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
		};
		const segmentsPerEdge = Math.ceil(size / SAMPLE_STEP);
		// Lines of constant X (running along Z), then constant Z (running along X).
		for (let gx = pcx - r; gx <= pcx + r + 1; gx++) {
			for (let gz = pcz - r; gz <= pcz + r; gz++) {
				const current = (gx === pcx || gx === pcx + 1) && gz === pcz;
				const x = gx * size;
				for (let s = 0; s < segmentsPerEdge; s++) {
					push(
						x,
						gz * size + s * SAMPLE_STEP,
						x,
						gz * size + (s + 1) * SAMPLE_STEP,
						current ? CURRENT_EDGE : OTHER_EDGE
					);
				}
			}
		}
		for (let gz = pcz - r; gz <= pcz + r + 1; gz++) {
			for (let gx = pcx - r; gx <= pcx + r; gx++) {
				const current = (gz === pcz || gz === pcz + 1) && gx === pcx;
				const z = gz * size;
				for (let s = 0; s < segmentsPerEdge; s++) {
					push(
						gx * size + s * SAMPLE_STEP,
						z,
						gx * size + (s + 1) * SAMPLE_STEP,
						z,
						current ? CURRENT_EDGE : OTHER_EDGE
					);
				}
			}
		}
		// Corner posts make the grid readable from a distance and over uneven ground.
		for (let gx = pcx - r; gx <= pcx + r + 1; gx++) {
			for (let gz = pcz - r; gz <= pcz + r + 1; gz++) {
				const x = gx * size;
				const z = gz * size;
				const base = y(x, z);
				const current = (gx === pcx || gx === pcx + 1) && (gz === pcz || gz === pcz + 1);
				push(x, z, x, z, current ? CURRENT_EDGE : OTHER_EDGE, base, base + POST_HEIGHT);
			}
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
		geometry.computeBoundingSphere();
		this.lines = new THREE.LineSegments(geometry, this.material);
		this.lines.renderOrder = 15;
		this.lines.frustumCulled = false;
		this.group.add(this.lines);
	}

	private updateLabels(pcx: number, pcz: number, referenceY: number): void {
		const size = MINI_BUILD_WORLD_LIMITS.chunkSize;
		const r = this.options.radiusChunks;
		const wanted = new Set<string>();
		for (let gx = pcx - r; gx <= pcx + r; gx++) {
			for (let gz = pcz - r; gz <= pcz + r; gz++) {
				const centerX = (gx + 0.5) * size;
				const centerZ = (gz + 0.5) * size;
				const readout = this.options.getReadout(centerX, centerZ);
				const near = Math.abs(gx - pcx) <= 1 && Math.abs(gz - pcz) <= 1;
				// Keep the view readable: always label the 3×3 around the player, further chunks only if used.
				if (!near && readout.instances === 0) continue;
				const id = chunkIdFromCoords(gx, gz);
				wanted.add(id);
				const current = gx === pcx && gz === pcz;
				const key = `${readout.primitives}:${readout.instances}:${readout.level}:${current}:${Math.round(referenceY / 1.5)}`;
				let label = this.labels.get(id);
				if (label && label.key === key) continue;
				if (!label) {
					const created = this.createLabel();
					if (!created) continue;
					label = created;
					this.labels.set(id, label);
				}
				label.key = key;
				this.drawLabel(label, readout, current);
				label.world.set(
					centerX,
					this.options.getSurfaceY(centerX, centerZ, referenceY) + 1.2,
					centerZ
				);
			}
		}
		for (const [id, label] of [...this.labels]) {
			if (wanted.has(id)) continue;
			this.disposeLabel(label);
			this.labels.delete(id);
		}
	}

	private ensureLabelLayer(): HTMLDivElement | null {
		if (this.labelLayer) return this.labelLayer;
		const container = this.options.getLabelContainer();
		if (!container || typeof document === 'undefined') return null;
		const layer = document.createElement('div');
		layer.dataset.testid = 'mini-build-chunk-labels';
		Object.assign(layer.style, {
			position: 'absolute',
			inset: '0',
			overflow: 'hidden',
			pointerEvents: 'none',
			zIndex: '5'
		});
		container.appendChild(layer);
		this.labelLayer = layer;
		return layer;
	}

	private createLabel(): Label | null {
		const layer = this.ensureLabelLayer();
		if (!layer) return null;
		const element = document.createElement('div');
		element.className = 'mini-build-chunk-marker';
		Object.assign(element.style, {
			position: 'absolute',
			left: '0',
			top: '0',
			padding: '3px 8px 5px',
			borderRadius: '8px',
			color: '#ffffff',
			font: '600 12px/1.25 system-ui, -apple-system, sans-serif',
			textAlign: 'center',
			whiteSpace: 'nowrap',
			fontVariantNumeric: 'tabular-nums',
			boxShadow: '0 2px 10px rgba(0, 0, 0, 0.35)',
			willChange: 'transform, opacity',
			display: 'none'
		});
		layer.appendChild(element);
		return { element, world: new THREE.Vector3(), key: '' };
	}

	private drawLabel(label: Label, readout: MiniBuildChunkReadout, current: boolean): void {
		const ratio = Math.min(1, readout.primitives / readout.budget);
		const element = label.element;
		element.dataset.chunk = readout.chunkId;
		element.dataset.level = readout.level;
		element.style.background = LABEL_COLORS[readout.level];
		element.style.border = current ? '2px solid #ffd166' : '1px solid rgba(255, 255, 255, 0.25)';
		element.style.fontSize = current ? '13px' : '11px';
		element.replaceChildren();
		const value = document.createElement('div');
		value.textContent = `${readout.primitives} / ${readout.budget}`;
		const bar = document.createElement('div');
		Object.assign(bar.style, {
			height: '3px',
			margin: '3px 0 2px',
			borderRadius: '2px',
			background: `linear-gradient(90deg, ${LABEL_BAR_COLORS[readout.level]} ${ratio * 100}%, rgba(255,255,255,0.2) ${ratio * 100}%)`
		});
		const detail = document.createElement('div');
		Object.assign(detail.style, {
			font: '500 10px system-ui, -apple-system, sans-serif',
			opacity: '0.85'
		});
		detail.textContent = `${readout.instances} obj · ${readout.chunkId}`;
		element.append(value, bar, detail);
	}

	/** Projects label anchors to screen space; hides labels behind the camera or far away. */
	private positionLabels(eye: { x: number; y: number; z: number }): void {
		const layer = this.labelLayer;
		if (!layer) return;
		const width = layer.clientWidth;
		const height = layer.clientHeight;
		for (const label of this.labels.values()) {
			const distance = Math.hypot(
				label.world.x - eye.x,
				label.world.y - eye.y,
				label.world.z - eye.z
			);
			this.projected.copy(label.world).project(this.options.camera);
			const visible =
				this.projected.z > -1 &&
				this.projected.z < 1 &&
				Math.abs(this.projected.x) < 1.2 &&
				Math.abs(this.projected.y) < 1.2 &&
				distance < LABEL_FADE_END;
			if (!visible) {
				label.element.style.display = 'none';
				continue;
			}
			const x = ((this.projected.x + 1) / 2) * width;
			const y = ((1 - this.projected.y) / 2) * height;
			const fade =
				1 -
				Math.max(
					0,
					Math.min(1, (distance - LABEL_FADE_START) / (LABEL_FADE_END - LABEL_FADE_START))
				);
			label.element.style.display = 'block';
			label.element.style.opacity = String(fade);
			label.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
		}
	}

	private disposeLabel(label: Label): void {
		label.element.remove();
	}
}
