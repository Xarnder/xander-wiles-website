import * as THREE from 'three';
import type { TerrainSettings } from '../terrain/TerrainSettings';
import {
	createActiveLevelWatch,
	pullActiveLevelChange,
	type BuildingLevelManager
} from './BuildingLevelManager';
import type { BuildingManager } from './BuildingManager';
import type { BuildTool } from './BuildToolManager';
import type { BuildUndoManager } from './BuildUndoManager';
import type { BuildingGridPoint } from './FoundationLocalMath';
import { buildingGridToLocal, foundationLocalFrame } from './FoundationLocalMath';
import type { FoundationManager } from './FoundationManager';
import type { BuildingSettings, BuildUiState, ToolId } from './FoundationTypes';
import { raycastLevelConstructionPlane } from './foundationTopTargeting';
import { vertexSpacingFor } from './foundationMath';
import { colorMaterialFromHex } from './MaterialTypes';
import {
	autoPromotePolygonWallSnap,
	cycleSnapMode,
	snapDrawingPoint,
	snapModeLabel,
	type SnapMode
} from './polygonDrawSnap';
import { buildSkirtingRunGeometry } from './SkirtingRunManager';
import {
	findWallHalfThickness,
	sideOfLine,
	type SkirtingRunDefinition,
	type SkirtingRunSegment
} from './skirtingRunMath';
import { pathSelfIntersects, type Point2D } from './wallPathMath';

const VALID_COLOR = 0x39d353;
const INVALID_COLOR = 0xff4d4d;
const MAX_POINTS = 256;
const MAX_MARKERS = 64;

const markerGeometry = new THREE.SphereGeometry(0.06, 10, 8);
function makeMarker(color: number): THREE.Mesh {
	const mesh = new THREE.Mesh(
		markerGeometry,
		new THREE.MeshBasicMaterial({ color, depthTest: false })
	);
	mesh.renderOrder = 10;
	mesh.visible = false;
	return mesh;
}

export interface SkirtingToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	foundationManager: FoundationManager;
	levelManager: BuildingLevelManager;
	buildingManager: BuildingManager;
	undoManager: BuildUndoManager;
	terrainSettings: TerrainSettings;
	buildingSettings: BuildingSettings;
	/** Where the player stands (world X/Z) — boards go on the wall face on this side. */
	getPlayerPosition: () => { x: number; z: number };
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * Hotbar slot 2 → Skirting: draw a run of skirting boards by clicking along a wall's centre line,
 * exactly like drawing the wall — click points, click the first point again to close a room,
 * `Enter` to finish, `Backspace` to undo a point, right click to cancel, `B` for axis snap.
 *
 * Each board is moved off the drawn line onto the wall face on the side the player is standing
 * (decided when the segment's end point is clicked). In Auto mode the distance is half the
 * thickness of the wall drawn along that line on this storey (`findWallHalfThickness`); where no
 * wall is found, or in Manual mode (`O` toggles), the panel's manual offset is used instead.
 */
export class SkirtingTool implements BuildTool {
	readonly toolId: ToolId = 'skirting';

	private readonly options: SkirtingToolOptions;
	private readonly raycaster = new THREE.Raycaster();
	private readonly screenCenter = new THREE.Vector2(0, 0);
	private readonly overlay = new THREE.Group();
	private readonly hoverMarker = makeMarker(VALID_COLOR);
	private readonly markers: THREE.Mesh[] = [];
	private readonly previewMaterial = new THREE.MeshBasicMaterial({
		color: VALID_COLOR,
		transparent: true,
		opacity: 0.6,
		depthWrite: false
	});
	private readonly previewMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.previewMaterial);
	private readonly levelWatch = createActiveLevelWatch();

	private active = false;
	private foundationId: string | null = null;
	private levelIndex = 0;
	private baseY = 0;
	private points: BuildingGridPoint[] = [];
	private segments: SkirtingRunSegment[] = [];
	private hover: { foundationId: string; gridPoint: BuildingGridPoint } | null = null;
	private hoverKey = '';
	private snapMode: SnapMode = 'axis';

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (!this.active) return;
		const target = event.target as HTMLElement | null;
		if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
		if (event.code === 'KeyB') {
			this.snapMode = cycleSnapMode(this.snapMode, this.points.length);
			this.refresh();
		} else if (event.code === 'KeyO') {
			const draft = this.options.buildingSettings.skirtingRun;
			draft.offsetMode = draft.offsetMode === 'auto' ? 'manual' : 'auto';
			this.refresh();
		} else if (this.drawing && event.code === 'Enter') {
			this.finish(false);
		} else if (this.drawing && event.code === 'Backspace') {
			this.undoPoint();
		}
	};

	constructor(options: SkirtingToolOptions) {
		this.options = options;
		for (let i = 0; i < MAX_MARKERS; i++) this.markers.push(makeMarker(0x4da6ff));
		this.previewMesh.visible = false;
		this.previewMesh.renderOrder = 4;
		this.overlay.add(this.hoverMarker, this.previewMesh, ...this.markers);
	}

	private get drawing(): boolean {
		return this.points.length > 0;
	}

	private get settings(): BuildingSettings {
		return this.options.buildingSettings;
	}

	private vertexSpacing(): number {
		const t = this.options.terrainSettings;
		return vertexSpacingFor(t.chunkSize, t.chunkResolution);
	}

	activate(): void {
		this.active = true;
		this.reset();
		this.snapMode = 'axis';
		this.options.scene.add(this.overlay);
		window.addEventListener('keydown', this.handleKeyDown);
		this.refresh();
	}

	deactivate(): void {
		this.active = false;
		this.reset();
		this.overlay.removeFromParent();
		window.removeEventListener('keydown', this.handleKeyDown);
		this.options.onHudChange?.(null);
	}

	update(): void {
		if (!this.active) return;
		const { foundationManager, levelManager, camera } = this.options;
		this.raycaster.setFromCamera(this.screenCenter, camera);
		const hit = raycastLevelConstructionPlane(
			this.raycaster,
			foundationManager,
			levelManager,
			this.vertexSpacing(),
			this.settings.buildingGridSize
		);
		levelManager.reportHoveredFoundation(hit?.foundationId ?? null);
		const levelChanged = pullActiveLevelChange(levelManager, this.levelWatch);
		let next = hit;
		if (hit && this.drawing && hit.foundationId === this.foundationId)
			next = { ...hit, gridPoint: snapDrawingPoint(this.points, hit.gridPoint, this.snapMode) };
		// Where the player stands decides the new board's side, so re-preview when that side flips —
		// not on every step (each refresh reads level state, which counts as a world change).
		let side = 0;
		if (next && this.drawing && this.foundationId) {
			const player = this.playerLocal(this.foundationId);
			const last = this.points[this.points.length - 1];
			if (player) side = sideOfLine(this.local(last), this.local(next.gridPoint), player);
		}
		const key = next
			? `${next.foundationId}:${next.gridPoint.gridX}:${next.gridPoint.gridZ}:${side}`
			: '';
		if (key === this.hoverKey && !levelChanged) return;
		this.hoverKey = key;
		this.hover = next;
		this.refresh();
	}

	onPrimaryAction(): void {
		if (!this.active || !this.hover) return;
		const hover = this.hover;
		if (!this.drawing) {
			this.foundationId = hover.foundationId;
			const levels = this.options.levelManager;
			this.levelIndex = levels.getCurrentLevelIndex(hover.foundationId);
			this.baseY = levels.getOrCreateLevel(hover.foundationId, this.levelIndex).baseY;
			levels.lockActiveFoundation(hover.foundationId);
			this.points = [hover.gridPoint];
			this.segments = [];
			this.refresh();
			return;
		}
		const check = this.check();
		if (check.closing) {
			this.finish(true);
			return;
		}
		if (!check.valid) return;
		this.segments.push(
			this.segmentTo(this.points[this.points.length - 1], hover.gridPoint).segment
		);
		this.points.push(hover.gridPoint);
		this.snapMode = autoPromotePolygonWallSnap(this.snapMode, this.points.length);
		this.refresh();
	}

	onSecondaryAction(): void {
		if (!this.active || !this.drawing) return;
		this.reset();
		this.refresh();
	}

	dispose(): void {
		this.deactivate();
		(this.hoverMarker.material as THREE.Material).dispose();
		for (const marker of this.markers) (marker.material as THREE.Material).dispose();
		this.previewMesh.geometry.dispose();
		this.previewMaterial.dispose();
	}

	// ----------------------------------------------------------------------------------- logic

	private reset(): void {
		if (this.foundationId) this.options.levelManager.unlockActiveFoundation();
		this.foundationId = null;
		this.points = [];
		this.segments = [];
	}

	private local(point: BuildingGridPoint): Point2D {
		const p = buildingGridToLocal(point, this.settings.buildingGridSize);
		return { x: p.localX, z: p.localZ };
	}

	private playerLocal(foundationId: string): Point2D | null {
		const foundation = this.options.foundationManager.getFoundation(foundationId);
		if (!foundation) return null;
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const player = this.options.getPlayerPosition();
		return { x: player.x - frame.originWorldX, z: player.z - frame.originWorldZ };
	}

	/** The board for a new segment `a → b`: the player's side, and the wall's (or manual) offset. */
	private segmentTo(
		a: BuildingGridPoint,
		b: BuildingGridPoint
	): { segment: SkirtingRunSegment; foundWall: boolean } {
		const draft = this.settings.skirtingRun;
		const la = this.local(a);
		const lb = this.local(b);
		const player = this.foundationId ? this.playerLocal(this.foundationId) : null;
		const side = player ? sideOfLine(la, lb, player) : 1;
		const found =
			draft.offsetMode === 'auto' && this.foundationId
				? findWallHalfThickness(
						la,
						lb,
						this.baseY,
						this.options.buildingManager.getWallLinesForFoundation(this.foundationId)
					)
				: null;
		return { segment: { side, offset: found ?? draft.manualOffset }, foundWall: found !== null };
	}

	private check(): { valid: boolean; closing: boolean; reason?: string } {
		const hover = this.hover;
		if (!hover) return { valid: false, closing: false, reason: 'Look at a floor' };
		if (!this.drawing) return { valid: true, closing: false };
		if (hover.foundationId !== this.foundationId)
			return { valid: false, closing: false, reason: 'Must stay on the same building' };
		const first = this.points[0];
		const last = this.points[this.points.length - 1];
		const closing =
			this.points.length >= 3 &&
			hover.gridPoint.gridX === first.gridX &&
			hover.gridPoint.gridZ === first.gridZ;
		if (!closing && hover.gridPoint.gridX === last.gridX && hover.gridPoint.gridZ === last.gridZ)
			return { valid: false, closing: false, reason: 'Same as the last point' };
		if (!closing && this.points.length >= MAX_POINTS)
			return { valid: false, closing: false, reason: `At most ${MAX_POINTS} points` };
		const plan = [...this.points, hover.gridPoint].map((p) => ({ x: p.gridX, z: p.gridZ }));
		const crosses = closing
			? pathSelfIntersects(plan.slice(0, -1), true)
			: pathSelfIntersects(plan, false);
		if (crosses) return { valid: false, closing, reason: 'Skirting would cross itself' };
		return { valid: true, closing };
	}

	private draftDefinition(closing: boolean): Omit<SkirtingRunDefinition, 'id'> | null {
		if (!this.foundationId || !this.hover) return null;
		const draft = this.settings.skirtingRun;
		const points = closing ? [...this.points] : [...this.points, this.hover.gridPoint];
		const segments = [...this.segments];
		if (closing) segments.push(this.segmentTo(points[points.length - 1], points[0]).segment);
		else
			segments.push(
				this.segmentTo(this.points[this.points.length - 1], this.hover.gridPoint).segment
			);
		return {
			foundationId: this.foundationId,
			levelIndex: this.levelIndex,
			baseY: this.baseY,
			points,
			closed: closing,
			segments,
			height: draft.height,
			depth: draft.depth,
			...(draft.color ? { material: colorMaterialFromHex(draft.color) } : {})
		};
	}

	private finish(closed: boolean): void {
		if (!this.foundationId || this.points.length < (closed ? 3 : 2)) return;
		const draft = this.settings.skirtingRun;
		const segments = [...this.segments];
		if (closed)
			segments.push(this.segmentTo(this.points[this.points.length - 1], this.points[0]).segment);
		const result = this.options.buildingManager.addSkirtingRun({
			foundationId: this.foundationId,
			levelIndex: this.levelIndex,
			baseY: this.baseY,
			points: [...this.points],
			closed,
			segments,
			height: draft.height,
			depth: draft.depth,
			...(draft.color ? { material: colorMaterialFromHex(draft.color) } : {})
		});
		if (!result.valid || !result.value) return;
		this.options.undoManager.record({ kind: 'skirtingRun', skirtingRunId: result.value.id });
		this.reset();
		this.refresh();
	}

	private undoPoint(): void {
		if (this.points.length <= 1) this.reset();
		else {
			this.points.pop();
			this.segments.pop();
		}
		this.refresh();
	}

	// ----------------------------------------------------------------------------------- visuals

	private refresh(): void {
		const check = this.check();
		const ok = check.valid || check.closing;
		this.updateMarkers(ok);
		let hoverWall: boolean | null = null;
		if (this.drawing && this.hover && ok) {
			const definition = this.draftDefinition(check.closing);
			const last = this.points[this.points.length - 1];
			const target = check.closing ? this.points[0] : this.hover.gridPoint;
			hoverWall = this.segmentTo(last, target).foundWall;
			this.updatePreview(definition);
		} else {
			this.previewMesh.visible = false;
		}
		this.options.onHudChange?.(this.hud(check, hoverWall));
	}

	private worldOf(foundationId: string, point: BuildingGridPoint, y: number): THREE.Vector3 | null {
		const foundation = this.options.foundationManager.getFoundation(foundationId);
		if (!foundation) return null;
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const p = this.local(point);
		return new THREE.Vector3(
			frame.originWorldX + p.x,
			frame.originWorldY + y,
			frame.originWorldZ + p.z
		);
	}

	private updateMarkers(ok: boolean): void {
		const hover = this.hover;
		const levelY = hover
			? this.drawing
				? this.baseY
				: (this.options.levelManager.getLevel(
						hover.foundationId,
						this.options.levelManager.getCurrentLevelIndex(hover.foundationId)
					)?.baseY ?? 0)
			: 0;
		const at = hover ? this.worldOf(hover.foundationId, hover.gridPoint, levelY + 0.06) : null;
		if (at) {
			this.hoverMarker.position.copy(at);
			(this.hoverMarker.material as THREE.MeshBasicMaterial).color.setHex(
				ok ? VALID_COLOR : INVALID_COLOR
			);
			this.hoverMarker.visible = true;
		} else {
			this.hoverMarker.visible = false;
		}
		this.markers.forEach((marker, i) => {
			const point = this.points[i];
			const position =
				point && this.foundationId
					? this.worldOf(this.foundationId, point, this.baseY + 0.05)
					: null;
			marker.visible = !!position;
			if (position) {
				marker.position.copy(position);
				(marker.material as THREE.MeshBasicMaterial).color.setHex(i === 0 ? 0xffcc33 : 0x4da6ff);
			}
		});
	}

	private updatePreview(definition: Omit<SkirtingRunDefinition, 'id'> | null): void {
		const foundation = definition
			? this.options.foundationManager.getFoundation(definition.foundationId)
			: undefined;
		if (!definition || !foundation) {
			this.previewMesh.visible = false;
			return;
		}
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		this.previewMesh.geometry.dispose();
		this.previewMesh.geometry = buildSkirtingRunGeometry(
			{ id: 'preview', ...definition },
			this.settings.buildingGridSize
		);
		this.previewMesh.position.set(frame.originWorldX, frame.originWorldY, frame.originWorldZ);
		this.previewMesh.visible = true;
	}

	private hud(
		check: { valid: boolean; closing: boolean; reason?: string },
		hoverWall: boolean | null
	): BuildUiState {
		const draft = this.settings.skirtingRun;
		const foundationId = this.foundationId ?? this.hover?.foundationId ?? null;
		const level = foundationId
			? this.options.levelManager.getLevelUiState(foundationId)
			: undefined;
		const snap = snapModeLabel(this.snapMode);
		const mode =
			draft.offsetMode === 'auto'
				? `Offset: Auto from the wall (manual ${(draft.manualOffset * 100).toFixed(1)} cm where none)`
				: `Offset: Manual ${(draft.manualOffset * 100).toFixed(1)} cm`;
		const lines = [
			...(level
				? [level.displayName.toUpperCase(), `Elevation: ${level.baseY.toFixed(2)}m`]
				: ['Look at a floor']),
			'',
			'SKIRTING',
			mode,
			'Boards go on the face toward you',
			''
		];
		if (hoverWall !== null && draft.offsetMode === 'auto')
			lines.push(
				hoverWall ? 'Wall found on this line' : 'No wall on this line — manual offset',
				''
			);
		if (this.drawing) {
			lines.push(`Points: ${this.points.length}`);
			if (!check.valid && !check.closing && check.reason) lines.push(check.reason);
			lines.push(
				'',
				...(snap ? [snap] : []),
				check.closing ? 'Click: Close the room' : 'Click: Add point',
				'Enter: Finish',
				'Backspace: Undo point',
				'O: Auto / manual offset',
				'B: Cycle snap · E: Customise',
				'Right click: Cancel'
			);
		} else {
			lines.push(
				'Click along a wall line to start',
				...(snap ? [snap] : []),
				'O: Auto / manual offset',
				'B: Cycle snap · E: Customise'
			);
		}
		return {
			toolId: 'skirting',
			snapMode: this.snapMode,
			level,
			crosshair: !this.hover ? 'default' : check.valid || check.closing ? 'valid' : 'invalid',
			notice: !check.valid && !check.closing && this.drawing ? check.reason : undefined,
			hintLines: lines
		};
	}
}
