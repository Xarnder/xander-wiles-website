import * as THREE from 'three';
import type { BuildTool } from '../building/BuildToolManager';
import type { BuildUiState } from '../building/FoundationTypes';
import type { BuildUndoManager } from '../building/BuildUndoManager';
import { TerrainEdits, type TerrainStroke } from './TerrainEdits';
export interface ShovelSettings {
	radius: number;
	strength: number;
	point: boolean;
}
export interface ShovelOptions {
	scene: THREE.Scene;
	camera: THREE.Camera;
	edits: TerrainEdits;
	undo: BuildUndoManager;
	meshes: () => readonly THREE.Object3D[];
	sample: (x: number, z: number) => number;
	allowed: (x: number, z: number, height: number, footprintOnly?: boolean) => string | null;
	prepare: () => void;
	changed: (stroke: TerrainStroke) => void;
	canUse: () => boolean;
	heldInput: () => boolean;
	onHud?: (hud: BuildUiState | null) => void;
}
/** One reusable local preview; fixed-rate input; a whole gesture is one history transaction. */
export class ShovelTool implements BuildTool {
	readonly toolId = 'shovel' as const;
	readonly settings: ShovelSettings = { radius: 3, strength: 0.125, point: false };
	private active = false;
	private direction = 0;
	private lastTick = 0;
	private target: THREE.Vector3 | null = null;
	private ray = new THREE.Raycaster();
	private center = new THREE.Vector2();
	private positions = new Float32Array(2048 * 3);
	private geometry = new THREE.BufferGeometry();
	private material = new THREE.PointsMaterial({ color: 0xf5c85b, size: 0.16, depthTest: true });
	private preview = new THREE.Points(this.geometry, this.material);
	private ringGeometry = new THREE.BufferGeometry();
	private ringPositions = new Float32Array(65 * 3);
	private ringMaterial = new THREE.LineBasicMaterial({ color: 0xf5c85b });
	private ring = new THREE.Line(this.ringGeometry, this.ringMaterial);
	private lastPreview = 0;
	private notice = '';
	constructor(private options: ShovelOptions) {
		this.ray.far = 12;
		this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
		this.geometry.setDrawRange(0, 0);
		this.preview.frustumCulled = false;
		options.scene.add(this.preview, this.ring);
		this.preview.visible = false;
		this.ring.visible = false;
		this.ringGeometry.setAttribute('position', new THREE.BufferAttribute(this.ringPositions, 3));
		this.ring.frustumCulled = false;
		window.addEventListener('mouseup', this.release);
		window.addEventListener('blur', this.cancel);
		window.addEventListener('keydown', this.key, true);
		document.addEventListener('pointerlockchange', this.lockChange);
	}
	private release = () => this.finish();
	private cancel = () => this.finish(true);
	private lockChange = () => {
		if (!this.options.heldInput()) this.cancel();
	};
	private key = (e: KeyboardEvent) => {
		if (!this.active) return;
		if (e.code === 'Escape') this.cancel();
		if (['Minus', 'Equal', 'NumpadSubtract', 'NumpadAdd'].includes(e.code)) this.finish();
	};
	isStrokeOpen(): boolean {
		return this.direction !== 0;
	}
	isPlacementInProgress(): boolean {
		return this.isStrokeOpen();
	}

	activate(): void {
		this.active = true;
		this.lastPreview = 0;
	}
	deactivate(): void {
		this.cancel();
		this.active = false;
		this.preview.visible = false;
		this.ring.visible = false;
		this.options.onHud?.(null);
	}
	prepareForCustomize(): void {
		this.cancel();
	}
	onPrimaryAction(): void {
		this.start(1);
	}
	onSecondaryAction(): void {
		this.start(-1);
	}
	private start(direction: number): void {
		if (!this.active || !this.options.canUse()) return;
		this.finish();
		this.options.edits.begin();
		this.direction = direction;
		this.tick();
		if (!this.options.heldInput()) this.finish();
	}
	private proposal(direction: number) {
		const p = this.target!;
		return this.options.edits.propose(
			p.x,
			p.z,
			this.settings.radius,
			direction * this.settings.strength,
			this.settings.point,
			this.options.sample,
			this.options.allowed
		);
	}
	private tick(): void {
		this.lastTick = performance.now();
		if (!this.target) return;
		this.options.prepare();
		const { stroke, reason } = this.proposal(this.direction);
		this.notice = reason;
		if (stroke.patches.length) {
			this.options.edits.apply(stroke, false, true);
			this.options.changed(stroke);
		}
	}
	private finish(cancel = false): void {
		if (!this.direction) return;
		this.direction = 0;
		const stroke = this.options.edits.finish();
		if (!stroke) return;
		const apply = (reverse: boolean) => {
			if (
				stroke.patches.some(
					(p) => this.options.edits.get(p.x, p.z) !== (reverse ? p.after : p.before)
				)
			) {
				this.notice = 'This terrain has changed since that stroke; undo/redo was not applied.';
				return false;
			}
			this.options.edits.apply(stroke, reverse);
			this.options.changed(stroke);
			return true;
		};
		if (cancel) apply(true);
		else
			this.options.undo.record({
				kind: 'terrain',
				undo: () => apply(true),
				redo: () => apply(false)
			});
	}
	update(): void {
		if (!this.active) return;
		if (!this.options.canUse()) {
			this.cancel();
			this.preview.visible = false;
			this.ring.visible = false;
			return;
		}
		const now = performance.now();
		if (this.direction && now - this.lastTick >= 125) this.tick();
		if (now - this.lastPreview < 80) return;
		this.lastPreview = now;
		this.ray.setFromCamera(this.center, this.options.camera);
		this.target =
			this.ray.intersectObjects(this.options.meshes() as THREE.Object3D[], false)[0]?.point ?? null;
		this.preview.visible = !!this.target;
		this.ring.visible = !!this.target;
		if (this.target) {
			this.options.prepare();
			const up = this.proposal(1),
				down = this.proposal(-1);
			const chosen = this.direction < 0 ? down : up;
			let i = 0;
			for (const p of chosen.stroke.patches) {
				if (i >= this.positions.length - 3) break;
				this.positions[i++] = p.x * this.options.edits.spacing;
				this.positions[i++] = p.after! + 0.06;
				this.positions[i++] = p.z * this.options.edits.spacing;
			}
			if (!i) {
				this.positions[i++] = this.target.x;
				this.positions[i++] = this.target.y + 0.08;
				this.positions[i++] = this.target.z;
			}
			this.material.color.setHex(
				!up.stroke.patches.length && !down.stroke.patches.length
					? 0xe66b54
					: chosen.reason
						? 0xf5c85b
						: 0x91e0a0
			);
			const spacing = this.options.edits.spacing;
			const centerX = Math.round(this.target.x / spacing) * spacing,
				centerZ = Math.round(this.target.z / spacing) * spacing;
			const radius = this.settings.point ? spacing * 0.22 : Math.max(spacing, this.settings.radius);
			for (let n = 0; n <= 64; n++) {
				const a = (n / 64) * Math.PI * 2,
					x = centerX + Math.cos(a) * radius,
					z = centerZ + Math.sin(a) * radius;
				this.ringPositions[n * 3] = x;
				this.ringPositions[n * 3 + 1] = this.options.sample(x, z) + 0.08;
				this.ringPositions[n * 3 + 2] = z;
			}
			this.ringMaterial.color.copy(this.material.color);
			this.ringGeometry.attributes.position.needsUpdate = true;
			this.geometry.setDrawRange(0, i / 3);
			this.geometry.attributes.position.needsUpdate = true;
			this.notice =
				chosen.reason ||
				(!chosen.stroke.patches.length ? 'Try a wider brush or another point.' : '');
		}
		this.options.onHud?.({
			toolId: 'shovel',
			crosshair: this.target ? 'valid' : 'default',
			notice: this.notice,
			hintLines: [
				'Shovel · 7',
				'Left: raise · Right: lower · Hold to shape',
				'E: brush settings · −: undo · +: redo'
			]
		});
	}
	dispose(): void {
		this.deactivate();
		window.removeEventListener('mouseup', this.release);
		window.removeEventListener('blur', this.cancel);
		window.removeEventListener('keydown', this.key, true);
		document.removeEventListener('pointerlockchange', this.lockChange);
		this.preview.removeFromParent();
		this.ring.removeFromParent();
		this.ringGeometry.dispose();
		this.ringMaterial.dispose();
		this.geometry.dispose();
		this.material.dispose();
	}
}
