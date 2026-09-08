import { plantMetrics } from './PlantVisualMetrics';
import { compiledTimeline } from './MusicTimeline';
import type { MidiImportPlan } from './midi/MidiImportPlan';
import * as THREE from 'three';
import type { BuildTool } from '../building/BuildToolManager';
import type { BuildUiState } from '../building/FoundationTypes';
import {
	createMusicTree,
	radialSnap,
	positionOf,
	pitch,
	noteName,
	species,
	scaleNotes,
	scales,
	secondsAtStep,
	fractionalLoopStep,
	timelineDefinition,
	totalSteps,
	loopDuration,
	maxDurationSteps,
	clampDurationSteps,
	endRingIndex,
	sustainProgress,
	type MusicTreeDefinition,
	type MusicPlantDefinition
} from './MusicModel';
import { MusicPlantManager, plantVisual, disposeGroup } from './MusicPlantManager';
import {
	buildSustainTrail,
	disposeSustainTrail,
	type SustainSettings
} from './SustainTrailBuilder';
import { MusicWaveRenderer } from './MusicWaveRenderer';
import { validateMusic } from './MusicValidation';
import { MusicTreeSequencer } from './MusicTreeSequencer';
interface Options {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	surface: (x: number, z: number) => number;
	targets: () => THREE.Object3D[];
	blocked: (x: number, z: number, radius?: number, height?: number) => boolean;
	sustainSettings: SustainSettings;
	hud?: (hud: BuildUiState | null) => void;
}
/** "Bar N · Beat M" for a timing ring — the player-facing time format everywhere in this tool; raw ring numbers are debug-only (`showRingIndices`). */
function barBeat(t: MusicTreeDefinition, ring: number) {
	const label = compiledTimeline(timelineDefinition(t.loop)).label(ring);
	return `Bar ${label.bar} · Beat ${label.beat}`;
}
export class MusicPlantPlacementTool implements BuildTool {
	readonly toolId = 'music' as const;
	debug = {
		showRingIndices: false,
		showPlantTimingDebug: false,
		showAudioSchedulerDebug: false,
		showDurationSteps: false
	};
	active = false;
	revision = 0;
	trees: MusicTreeDefinition[] = [];
	plants: MusicPlantManager;
	importPanelOpen = false;
	committing = false;
	pendingImport?: MidiImportPlan;
	selectedId?: string;
	private treePreview?: THREE.Group;
	readonly runtimes = new Map<
		string,
		{ sequencer: MusicTreeSequencer; wave: MusicWaveRenderer; visual: THREE.Group }
	>();
	activeTree?: MusicTreeDefinition;
	speciesIndex = 0;
	growth = 0.5;
	vibrancy = 0.7;
	/** The PREFERRED duration (in timing subdivisions) for the next plant — raw and un-clamped; `previewAt` clamps it to `[1, maxDurationSteps]` for the CURRENT candidate ring via `clampDurationSteps`, exactly like `growth` is adjusted raw here and quantized downstream by `MusicPlantManager.quantize`. */
	duration = 1;
	candidate: MusicPlantDefinition | null = null;
	private ghost?: THREE.Group;
	private ghostTrailSignature = '';
	private ghostTrail?: { object: THREE.Group; material: THREE.ShaderMaterial };
	private ray = new THREE.Raycaster();
	private center = new THREE.Vector2();
	private lastHud = 0;
	private disposed = false;
	private resumeIds: string[] = [];
	constructor(private options: Options) {
		this.plants = new MusicPlantManager(options.surface, options.sustainSettings);
		options.scene.add(this.plants.group);
		window.addEventListener('keydown', this.key, true);
		document.addEventListener('visibilitychange', this.visibility);
	}
	load(trees: MusicTreeDefinition[], plants: MusicPlantDefinition[]) {
		this.plants.clear();
		for (const r of this.runtimes.values()) {
			r.sequencer.dispose();
			r.wave.dispose();
			disposeGroup(r.visual);
		}
		this.runtimes.clear();
		this.trees = structuredClone(trees);
		for (const t of this.trees) this.addRuntime(t);
		for (const p of structuredClone(plants)) {
			const t = this.trees.find((t) => t.id === p.musicTreeId);
			if (t) this.plants.add(t, p, false);
		}
		this.reindex();
	}
	private addRuntime(t: MusicTreeDefinition) {
		const visual = new THREE.Group();
		const trunk = new THREE.Mesh(
			new THREE.CylinderGeometry(0.45, 0.85, 5, 9),
			new THREE.MeshStandardMaterial({
				color: 0x655644,
				emissive: 0x4b8c71,
				emissiveIntensity: 0.3
			})
		);
		trunk.position.y = 2.5;
		visual.add(trunk);
		for (let i = 0; i < 5; i++) {
			const crown = new THREE.Mesh(
				new THREE.IcosahedronGeometry(1.8, 1),
				new THREE.MeshStandardMaterial({
					color: 0x88c6a5,
					emissive: 0x31896c,
					emissiveIntensity: 0.3,
					roughness: 0.7
				})
			);
			crown.position.set(Math.cos(i * 2.4) * 1.2, 4.4 + i * 0.45, Math.sin(i * 2.4) * 1.2);
			visual.add(crown);
		}
		visual.position.copy(t.position);
		let wave: MusicWaveRenderer;
		try {
			wave = new MusicWaveRenderer(t, this.options.surface);
		} catch (error) {
			disposeGroup(visual);
			throw error;
		}
		this.options.scene.add(visual);
		this.options.scene.add(wave.group);
		this.runtimes.set(t.id, { visual, wave, sequencer: new MusicTreeSequencer(t) });
	}
	activate() {
		this.active = true;
		if (!this.trees.length) {
			const p = this.options.camera.position;
			const t = createMusicTree(p.x, this.options.surface(p.x, p.z - 10), p.z - 10);
			this.trees.push(t);
			if (this.disposed) throw Error('World closed during import.');
			this.addRuntime(t);
			this.revision++;
		}
		this.activeTree = this.trees.reduce((a, b) =>
			Math.hypot(
				a.position.x - this.options.camera.position.x,
				a.position.z - this.options.camera.position.z
			) <
			Math.hypot(
				b.position.x - this.options.camera.position.x,
				b.position.z - this.options.camera.position.z
			)
				? a
				: b
		);
		void this.play();
	}
	async play() {
		if (this.activeTree && !this.disposed) {
			try {
				await this.runtimes.get(this.activeTree.id)!.sequencer.play();
				if (this.disposed) this.runtimes.get(this.activeTree.id)?.sequencer.pause();
			} catch {
				/* Suspended browser audio remains retryable through the play control. */
			}
		}
	}
	deactivate() {
		this.onSecondaryAction();
		this.active = false;
		this.candidate = null;
		this.clearGhost();
		this.options.hud?.(null);
	}
	onSecondaryAction() {
		this.pendingImport = undefined;
		this.selectedId = undefined;
		if (this.treePreview) disposeGroup(this.treePreview);
		this.treePreview = undefined;
		this.candidate = null;
		this.clearGhost();
	}
	previewAt(x: number, z: number) {
		const t = this.activeTree;
		if (!t) return null;
		let snap = radialSnap(t, x, z);
		const selected = this.selectedId ? this.plants.byId.get(this.selectedId) : undefined;
		if (selected) {
			const angle = Math.atan2(z - t.position.z, x - t.position.x);
			snap = {
				angle,
				ringIndex: selected.ringIndex,
				...positionOf(t, { angle, ringIndex: selected.ringIndex })
			};
		}
		this.candidate = null;
		if (!snap) {
			this.clearGhost();
			return null;
		}
		const p: MusicPlantDefinition = {
			id: crypto.randomUUID(),
			musicTreeId: t.id,
			speciesId: species[this.speciesIndex].id,
			angle: snap.angle,
			ringIndex: snap.ringIndex,
			durationSteps: clampDurationSteps(t.loop, snap.ringIndex, this.duration),
			growth: this.growth,
			vibrancy: this.vibrancy
		};
		this.plants.quantize(t, p);
		if (selected) {
			Object.assign(p, selected, { angle: snap.angle });
		}
		const y = this.options.surface(snap.x, snap.z);
		if (
			this.options.blocked(
				snap.x,
				snap.z,
				plantMetrics(p).placementClearanceRadius,
				plantMetrics(p).height
			) ||
			Math.abs(y - this.options.surface(snap.x + 0.3, snap.z)) > 0.6 ||
			Math.abs(y - this.options.surface(snap.x, snap.z + 0.3)) > 0.6 ||
			this.plants.overlaps(
				snap.x,
				snap.z,
				plantMetrics(p).placementClearanceRadius,
				this.selectedId
			)
		) {
			this.clearGhost();
			return null;
		}
		this.candidate = p;
		const signature = [p.speciesId, p.pitchMidi, p.vibrancy].join(':');
		if (this.ghost?.userData.signature !== signature) {
			this.clearGhost();
			this.ghost = plantVisual(p);
			this.ghost.userData.signature = signature;
			this.options.scene.add(this.ghost);
		}
		this.ghost!.position.set(snap.x, y, snap.z);
		this.ghost!.traverse((o) => {
			if (o instanceof THREE.Mesh) {
				o.material.transparent = true;
				o.material.opacity = 0.5;
			}
		});
		this.updateGhostTrail(t, p);
		return p;
	}
	/** The ghost sustain trail shown alongside the ghost plant while previewing — always rebuilt (never eased/animated toward the snapped shape), since its whole purpose is to make the exact snapped duration/end-ring obvious the instant it changes. */
	private updateGhostTrail(t: MusicTreeDefinition, p: MusicPlantDefinition) {
		const signature = JSON.stringify([
			t.position,
			t.loop.firstRingRadius,
			t.loop.ringSpacing,
			p.ringIndex,
			p.durationSteps,
			Math.round(p.angle * 10000),
			p.speciesId,
			this.options.sustainSettings
		]);
		if (this.ghostTrail && signature === this.ghostTrailSignature) return;
		this.ghostTrailSignature = signature;
		if (this.ghostTrail) disposeSustainTrail(this.ghostTrail);
		this.ghostTrail = undefined;
		if (!this.options.sustainSettings.sustainTrailsEnabled) return;
		const trail = buildSustainTrail(t, p, this.options.surface, {
			...this.options.sustainSettings,
			composeTrailOpacity: 1.4,
			showSustainStartEnd: true
		});
		trail.material.uniforms.compose.value = 1;
		this.options.scene.add(trail.object);
		this.ghostTrail = trail;
	}
	onPrimaryAction() {
		if (this.importPanelOpen || this.committing) return;
		if (this.pendingImport && this.treePreview?.visible) {
			void this.commitImport(this.pendingImport, {
				x: this.treePreview.position.x,
				y: this.treePreview.position.y,
				z: this.treePreview.position.z
			}).catch((e) =>
				this.options.hud?.({
					toolId: 'music',
					crosshair: 'invalid',
					hintLines: [
						'Import could not be placed',
						e instanceof Error ? e.message : String(e),
						'Choose another tree location or reopen Import MIDI'
					]
				})
			);
			this.pendingImport = undefined;
			disposeGroup(this.treePreview);
			this.treePreview = undefined;
			return;
		}
		if (!this.candidate || !this.activeTree) return;
		const p = { ...this.candidate };
		if (this.selectedId) {
			this.plants.remove(this.selectedId);
			this.selectedId = undefined;
		}
		this.plants.add(this.activeTree, p);
		this.candidate = null;
		this.clearGhost();
		this.revision++;
		this.reindex();
	}
	remove(id: string) {
		for (const r of this.runtimes.values()) r.sequencer.cancel(id);
		this.plants.remove(id);
		this.reindex();
		this.revision++;
	}
	private reindex() {
		for (const r of this.runtimes.values()) r.sequencer.reindex(this.plants.definitions);
	}
	private clearGhost() {
		if (this.ghost) disposeGroup(this.ghost);
		this.ghost = undefined;
		if (this.ghostTrail) disposeSustainTrail(this.ghostTrail);
		this.ghostTrail = undefined;
	}
	update() {
		if (this.importPanelOpen || this.committing) return;
		if (this.pendingImport) {
			this.ray.setFromCamera(this.center, this.options.camera);
			const hit = this.ray.intersectObjects(this.options.targets(), false)[0];
			if (hit && hit.distance < 100 && !this.options.blocked(hit.point.x, hit.point.z)) {
				if (!this.treePreview) {
					this.treePreview = new THREE.Group();
					const mesh = new THREE.Mesh(
						new THREE.CylinderGeometry(0.5, 0.8, 5, 8),
						new THREE.MeshBasicMaterial({ color: 0x9ce1bf, transparent: true, opacity: 0.4 })
					);
					mesh.position.y = 2.5;
					this.treePreview.add(mesh);
					this.options.scene.add(this.treePreview);
				}
				this.treePreview.visible = true;
				this.treePreview.position.set(
					hit.point.x,
					this.options.surface(hit.point.x, hit.point.z),
					hit.point.z
				);
			} else if (this.treePreview) this.treePreview.visible = false;
			this.options.hud?.({
				toolId: 'music',
				crosshair: this.treePreview?.visible ? 'valid' : 'invalid',
				hintLines: [
					'PLACE MUSIC TREE',
					'Click an open patch of earth to grow the imported garden',
					'Right click cancels'
				]
			});
			return;
		}
		this.ray.setFromCamera(this.center, this.options.camera);
		const hit = this.ray.intersectObjects(this.options.targets(), false)[0];
		if (hit && hit.distance < 80) this.previewAt(hit.point.x, hit.point.z);
		else {
			this.candidate = null;
			this.clearGhost();
		}
		if (performance.now() - this.lastHud > 150) {
			this.lastHud = performance.now();
			const t = this.activeTree;
			if (!t) return;
			const c = this.candidate;
			const selected = this.selectedId ? this.plants.byId.get(this.selectedId) : undefined;
			this.options.hud?.({
				toolId: 'music',
				crosshair: c ? 'valid' : 'invalid',
				hintLines: [
					'MUSIC GARDEN',
					selected
						? `${species.find((s) => s.id === selected.speciesId)!.name} · Selected`
						: species[this.speciesIndex].name,
					`Pitch: ${noteName(pitch(t, selected ?? { speciesId: species[this.speciesIndex].id, growth: this.growth }))} · Volume: ${Math.round((selected?.vibrancy ?? this.vibrancy) * 100)}%`,
					c === null
						? 'Aim at an open patch of earth'
						: `Duration: ${c.durationSteps} step${c.durationSteps === 1 ? '' : 's'}`,
					c === null ? '' : `${barBeat(t, c.ringIndex)} → ${barBeat(t, endRingIndex(c))}`,
					'↑ ↓ Pitch · ← → Vibrancy',
					', . Duration · Q / E Species',
					'Click: Plant · F Select / move · J Play/Pause · M Exit',
					...(this.debug.showRingIndices || this.debug.showDurationSteps
						? [
								`Ring ${c?.ringIndex ?? '—'} → ${c ? endRingIndex(c) : '—'} (max ${c ? maxDurationSteps(t.loop, c.ringIndex) : '—'})`
							]
						: []),
					...(this.debug.showPlantTimingDebug && c
						? [`Angle ${c.angle.toFixed(4)} · Note ${pitch(t, c)}`]
						: []),
					...(this.debug.showAudioSchedulerDebug ? this.audioDebugLines() : [])
				]
			});
		}
	}
	animate() {
		this.plants.stream(this.options.camera.position.x, this.options.camera.position.z);
		for (const [id, r] of this.runtimes) {
			const t = r.sequencer.tree,
				e = r.sequencer.elapsed;
			r.wave.follow(this.options.camera.position.x, this.options.camera.position.z);
			r.wave.update(
				e,
				r.sequencer.started,
				this.active && this.activeTree?.id === id,
				this.candidate?.ringIndex
			);
			const beat = fractionalLoopStep(t.loop, e) / timelineDefinition(t.loop).grid.stepsPerQuarter;
			r.visual.scale.setScalar(
				1 + (r.sequencer.playing ? 0.018 * Math.exp(-(beat % t.loop.beatsPerBar) * 8) : 0)
			);
		}
		for (const [id, g] of this.plants.visuals) {
			const p = this.plants.byId.get(id)!;
			const r = this.runtimes.get(p.musicTreeId)!;
			const s = r.sequencer.tree.loop;
			const age =
				(r.sequencer.elapsed - secondsAtStep(s, p.ringIndex) + loopDuration(s)) % loopDuration(s);
			const pulse = r.sequencer.started && age < 0.4 ? Math.exp(-age * 10) : 0;
			g.scale.setScalar(plantMetrics(p).scale * (1 + pulse * 0.18));
			g.traverse((o) => {
				if (o instanceof THREE.Mesh) o.material.emissiveIntensity = 0.1 + p.vibrancy * 0.25 + pulse;
			});

			// The sustain trail's own progress is driven by the SAME audio-clock elapsed time, via the
			// shared `sustainProgress` (against the note's REAL duration, unlike the plant's own fixed
			// 0.4s attack-flash window above) — this is what keeps the illuminated portion an honest
			// visualisation of "how much of the note has played so far", never a render-frame-driven
			// animation (see the class doc comment).
			const trail = this.plants.trails.get(p.id);
			if (trail) {
				const sustain = sustainProgress(s, r.sequencer.elapsed, p);
				const active = r.sequencer.started && sustain.active;
				trail.material.uniforms.noteActive.value = active ? 1 : 0;
				trail.material.uniforms.progress.value = sustain.progress;
				trail.material.uniforms.compose.value =
					this.active && this.activeTree?.id === p.musicTreeId ? 1 : 0;
			}
		}
	}
	/** Rebuilds every plant's sustain trail across every tree — used when a global `SustainSettings` default (width, opacity, glow, sample spacing, enabled...) changes in the debug GUI, mirroring the building system's own `rebuildAllWalls`/`rebuildAllPaths`. */
	rebuildAllTrails() {
		for (const p of this.plants.definitions) {
			const t = this.trees.find((t) => t.id === p.musicTreeId);
			if (t) this.plants.rebuildTrail(t, p);
		}
	}
	private audioDebugLines() {
		const r = this.activeTree && this.runtimes.get(this.activeTree.id);
		if (!r) return [];
		const q = r.sequencer;
		return [
			`${q.tree.loop.bpm} BPM · ${q.elapsed.toFixed(2)}s · ${q.state}`,
			`Scheduled through ${q.scheduledThrough.toFixed(2)} · Voices ${q.voices}`,
			`${this.plants.definitions.length} plants`
		];
	}
	refreshSurfaces() {
		for (const t of this.trees) {
			t.position.y = this.options.surface(t.position.x, t.position.z);
			const r = this.runtimes.get(t.id)!;
			r.visual.position.copy(t.position);
			r.wave.rebuild();
		}
		for (const p of this.plants.definitions) {
			const g = this.plants.visuals.get(p.id);
			if (!g) continue;
			g.position.y = this.options.surface(g.position.x, g.position.z);
			// The trail samples terrain height along its WHOLE path, not just the plant's own point, so
			// a terrain regeneration needs a real rebuild here — a single Y write (like the plant's own
			// marker above) can't fix up a multi-sample curve.
			const t = this.trees.find((t) => t.id === p.musicTreeId);
			if (t) this.plants.rebuildTrail(t, p);
		}
	}
	changeLoop(settings: Partial<MusicTreeDefinition['loop']>) {
		const t = this.activeTree ?? this.trees[0];
		if (!t) return;
		const next = { ...t.loop, ...settings };
		if (t.loop.timeline) {
			const timeline = structuredClone(t.loop.timeline);
			if (settings.bpm !== undefined) {
				const ratio = settings.bpm / timeline.tempoMap[0].bpm;
				timeline.tempoMap = timeline.tempoMap.map((e) => ({ ...e, bpm: e.bpm * ratio }));
			}
			if (
				settings.barsPerLoop !== undefined ||
				settings.beatsPerBar !== undefined ||
				settings.subdivisionsPerBeat !== undefined
			)
				return;
			next.timeline = timeline;
		}
		if (
			validateMusic(
				[{ ...t, loop: next }],
				this.plants.definitions.filter((p) => p.musicTreeId === t.id)
			)
		)
			return;
		if (
			this.plants.definitions.some(
				(p) =>
					p.musicTreeId === t.id &&
					(p.ringIndex >= totalSteps(next) || endRingIndex(p) > totalSteps(next))
			)
		)
			return;
		const r = this.runtimes.get(t.id)!;
		const playing = r.sequencer.playing;
		r.sequencer.pause();
		Object.assign(t.loop, next);
		r.wave.rebuild();
		for (const p of this.plants.definitions.filter((p) => p.musicTreeId === t.id)) {
			const pos = positionOf(t, p);
			this.plants.visuals.get(p.id)?.position.set(pos.x, this.options.surface(pos.x, pos.z), pos.z);
			this.plants.rebuildTrail(t, p);
		}
		this.plants.rebuildSpatialIndex();
		this.revision++;
		if (playing) void r.sequencer.play().catch(() => {});
	}
	private key = (e: KeyboardEvent) => {
		if (
			!this.active ||
			this.importPanelOpen ||
			this.committing ||
			this.pendingImport ||
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement
		)
			return;
		const t = this.activeTree!;
		if (e.code === 'KeyF') {
			if (this.selectedId) this.selectedId = undefined;
			else {
				this.ray.setFromCamera(this.center, this.options.camera);
				const hit = this.ray.intersectObjects([...this.plants.visuals.values()], true)[0];
				if (hit) {
					this.selectedId = hit.object.userData.musicPlantId;
					const p = this.plants.byId.get(this.selectedId!)!;
					this.activeTree = this.trees.find((t) => t.id === p.musicTreeId);
				}
			}
			e.preventDefault();
			return;
		}
		if (
			this.selectedId &&
			['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Comma', 'Period'].includes(e.code)
		) {
			const old = this.plants.byId.get(this.selectedId)!;
			const p = { ...old };
			if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
				const notes = Array.from({ length: 128 }, (_, i) => i).filter((n) =>
					scales[t.scale.scale].includes((((n - t.scale.rootMidi) % 12) + 12) % 12)
				);
				p.pitchMidi =
					e.code === 'ArrowUp'
						? (notes.find((n) => n > (p.pitchMidi ?? 60)) ?? 127)
						: ([...notes].reverse().find((n) => n < (p.pitchMidi ?? 60)) ?? 0);
			} else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight')
				p.vibrancy = Math.max(0, Math.min(1, p.vibrancy + (e.code === 'ArrowRight' ? 0.1 : -0.1)));
			else
				p.durationSteps = clampDurationSteps(
					t.loop,
					p.ringIndex,
					p.durationSteps + (e.code === 'Period' ? 1 : -1)
				);
			this.editPlant(p);
			e.preventDefault();
			e.stopImmediatePropagation();
			return;
		}
		const n = scaleNotes(t.scale, species[this.speciesIndex]).length;
		if (e.code === 'ArrowUp' || e.code === 'ArrowDown')
			this.growth = Math.max(
				0,
				Math.min(1, (Math.round(this.growth * (n - 1)) + (e.code === 'ArrowUp' ? 1 : -1)) / (n - 1))
			);
		else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight')
			this.vibrancy = Math.max(
				0,
				Math.min(1, this.vibrancy + (e.code === 'ArrowRight' ? 0.1 : -0.1))
			);
		else if (e.code === 'KeyQ' || e.code === 'KeyE')
			this.speciesIndex =
				(this.speciesIndex + (e.code === 'KeyE' ? 1 : species.length - 1)) % species.length;
		else if (e.code === 'Comma' || e.code === 'Period') {
			// Clamped loosely here (a generous, ring-agnostic upper bound); `previewAt` re-clamps to the
			// CURRENT candidate ring's own `maxDurationSteps` every time it runs, which is the precise
			// bound that actually matters (see its own comment on why `duration` is deliberately raw).
			const upperBound = Math.max(1, totalSteps(t.loop));
			this.duration = Math.max(
				1,
				Math.min(upperBound, this.duration + (e.code === 'Period' ? 1 : -1))
			);
		} else if (e.code === 'KeyJ') {
			const r = this.runtimes.get(t.id)!;
			if (r.sequencer.playing) r.sequencer.pause();
			else void this.play();
		} else return;
		e.preventDefault();
		e.stopImmediatePropagation();
	};
	editPlant(p: MusicPlantDefinition) {
		const t = this.trees.find((t) => t.id === p.musicTreeId);
		if (!t) return;
		const pos = positionOf(t, p);
		if (
			this.plants.overlaps(pos.x, pos.z, plantMetrics(p).placementClearanceRadius, p.id) ||
			this.options.blocked(
				pos.x,
				pos.z,
				plantMetrics(p).placementClearanceRadius,
				plantMetrics(p).height
			)
		)
			return;
		this.runtimes.get(t.id)!.sequencer.cancel(p.id);
		this.plants.remove(p.id);
		this.plants.add(t, p);
		this.reindex();
		this.revision++;
	}
	beginImport(plan: MidiImportPlan) {
		this.importPanelOpen = false;
		this.clearGhost();
		if (plan.target === 'new') this.pendingImport = plan;
		else return this.commitImport(plan);
	}
	async commitImport(plan: MidiImportPlan, position?: { x: number; y: number; z: number }) {
		const target =
			plan.target === 'new' ? undefined : this.trees.find((t) => t.id === plan.targetTreeId);
		if (plan.target !== 'new' && !target)
			throw Error('The selected Music Tree is no longer available.');
		if (plan.target === 'new' && !position) throw Error('Choose a tree position first.');
		if (plan.target === 'new' && this.options.blocked(position!.x, position!.z, 3, 7))
			throw Error('The Music Tree cannot fit here. Choose open ground.');
		const t = target
			? structuredClone(target)
			: createMusicTree(position!.x, this.options.surface(position!.x, position!.z), position!.z);
		t.loop = {
			...t.loop,
			firstRingRadius: plan.layout.firstRingRadius,
			ringSpacing: plan.layout.ringSpacing,
			timeline: structuredClone(plan.timeline),
			bpm: plan.timeline.tempoMap[0].bpm,
			beatsPerBar: plan.timeline.meterMap[0].numerator,
			subdivisionsPerBeat: plan.timeline.grid.stepsPerQuarter
		};
		const imported = plan.notes.map((n) => ({
			id: crypto.randomUUID(),
			musicTreeId: t.id,
			speciesId: n.speciesId,
			instrumentId: n.instrumentId,
			pitchMidi: n.pitchMidi,
			percussionNote: n.percussionNote,
			ringIndex: n.ringIndex,
			durationSteps: n.durationSteps,
			angle: n.angle,
			vibrancy: n.vibrancy
		}));
		const definitions = [
			...this.plants.definitions.filter((p) => plan.target !== 'replace' || p.musicTreeId !== t.id),
			...imported
		];
		const trees = [...this.trees.filter((tree) => tree.id !== t.id), t];
		const error = validateMusic(trees, definitions);
		if (error) throw Error(error);
		// Stage the complete logical/spatial state before touching the active composition.
		const staged = new MusicPlantManager(this.options.surface, this.options.sustainSettings);
		this.committing = true;
		try {
			const treeMap = new Map(trees.map((tree) => [tree.id, tree]));
			const importedIds = new Set<string>(imported.map((p) => p.id));
			for (const p of definitions)
				if (!importedIds.has(p.id)) {
					if (plan.target === 'add' && p.musicTreeId === t.id) {
						const pos = positionOf(t, p);
						if (
							this.options.blocked(
								pos.x,
								pos.z,
								plantMetrics(p).placementClearanceRadius,
								plantMetrics(p).height
							)
						)
							throw Error(
								'Expanded spacing puts an existing plant inside a building. Move that plant or use a new tree.'
							);
					}
					staged.add(treeMap.get(p.musicTreeId)!, p, false);
				}
			for (let i = 0; i < imported.length; i++) {
				if (this.disposed) throw Error('World closed during import.');
				const p = imported[i],
					radius = plantMetrics(p).placementClearanceRadius;
				let valid = false;
				const original = p.angle;
				for (let attempt = 0; attempt < 80; attempt++) {
					p.angle = Math.atan2(
						Math.sin(original + attempt * 2.3999632297),
						Math.cos(original + attempt * 2.3999632297)
					);
					const pos = positionOf(t, p),
						y = this.options.surface(pos.x, pos.z);
					if (
						!this.options.blocked(
							pos.x,
							pos.z,
							plantMetrics(p).placementClearanceRadius,
							plantMetrics(p).height
						) &&
						Math.abs(y - this.options.surface(pos.x + 0.3, pos.z)) <= 0.6 &&
						Math.abs(y - this.options.surface(pos.x, pos.z + 0.3)) <= 0.6 &&
						!staged.overlaps(pos.x, pos.z, radius)
					) {
						valid = true;
						break;
					}
				}
				if (!valid)
					throw Error(
						'Some plants cannot fit the terrain or buildings here. Choose another location or wider spacing.'
					);
				staged.add(t, p, false);
				if (i % 128 === 127) await new Promise<void>((resolve) => setTimeout(resolve, 0));
			}
		} catch (error) {
			this.committing = false;
			staged.clear();
			throw error;
		}
		const previous = target ? this.runtimes.get(target.id) : undefined;
		try {
			if (this.disposed) throw Error('World closed during import.');
			this.addRuntime(t);
		} catch (error) {
			this.committing = false;
			staged.clear();
			if (previous) this.runtimes.set(t.id, previous);
			throw error;
		}
		previous?.sequencer.dispose();
		previous?.wave.dispose();
		if (previous) disposeGroup(previous.visual);
		this.plants.clear();
		this.plants.group.removeFromParent();
		this.plants = staged;
		this.options.scene.add(staged.group);
		this.trees = trees;
		this.activeTree = t;
		this.selectedId = undefined;
		this.reindex();
		this.revision++;
		this.pendingImport = undefined;
		this.committing = false;
		void this.play();
	}
	private visibility = () => {
		if (document.hidden) {
			this.resumeIds = [];
			for (const [id, r] of this.runtimes)
				if (r.sequencer.playing) {
					this.resumeIds.push(id);
					r.sequencer.pause();
				}
		} else
			for (const id of this.resumeIds) {
				void this.runtimes
					.get(id)
					?.sequencer.play()
					.catch(() => {});
			}
	};
	dispose() {
		this.disposed = true;
		this.deactivate();
		window.removeEventListener('keydown', this.key, true);
		document.removeEventListener('visibilitychange', this.visibility);
		this.load([], []);
		this.plants.group.removeFromParent();
	}
}
