import * as THREE from 'three';
import {
	species,
	trailEndpoints,
	type MusicPlantDefinition,
	type MusicTreeDefinition
} from './MusicModel';

/**
 * Purely visual per-species trail identity (see the README's "Sustained notes" section) — every
 * species shares the exact same `ringIndex`/`durationSteps` timing logic (MusicModel.ts); only how
 * the sustain is DRAWN differs, kept as data here rather than hard-coded per species anywhere else.
 */
export interface SustainTrailStyle {
	kind: 'mycelium' | 'root' | 'vine' | 'energy';
	width: number;
	opacity: number;
	glow: number;
	/** Lateral (perpendicular-to-radial) wobble amplitude, metres — kept small; the start/end radii must stay visually unambiguous, never a wandering path. */
	waviness: number;
}

const STYLES: Record<string, SustainTrailStyle> = {
	flower: { kind: 'vine', width: 0.045, opacity: 0.55, glow: 0.55, waviness: 0.1 },
	mushroom: { kind: 'mycelium', width: 0.055, opacity: 0.65, glow: 0.6, waviness: 0.2 },
	fern: { kind: 'root', width: 0.04, opacity: 0.5, glow: 0.35, waviness: 0.14 },
	reed: { kind: 'root', width: 0.032, opacity: 0.42, glow: 0.3, waviness: 0.08 },
	crystal: { kind: 'energy', width: 0.045, opacity: 0.7, glow: 0.85, waviness: 0.05 }
};
export function trailStyleFor(speciesId: string): SustainTrailStyle {
	return STYLES[speciesId] ?? STYLES.flower;
}

/**
 * Live, dev-tunable multipliers on top of each species' own base `SustainTrailStyle` — exposed under
 * the debug GUI's Music &gt; Sustain folder. Global knobs scale every trail's look uniformly without
 * losing species differentiation (a mushroom's mycelium stays visibly thicker/glowier than a reed's
 * faint root at any `trailWidth`/`activeTrailGlow` setting, since both are multiplied by the SAME
 * factor). Not persisted — purely a rendering preference, never part of a `MusicPlantDefinition`.
 */
export interface SustainSettings {
	sustainTrailsEnabled: boolean;
	/** Multiplier on each style's own base tube width. */
	trailWidth: number;
	/** Multiplier on each style's own base idle (non-playing) opacity. */
	idleTrailOpacity: number;
	/** Multiplier on each style's own base Compose Mode opacity. */
	composeTrailOpacity: number;
	/** Multiplier on each style's own base glow strength while a note is actively sustaining. */
	activeTrailGlow: number;
	/** Metres between terrain-height samples along the trail — smaller values follow bumpier terrain more closely, at the cost of more tube segments. */
	trailSampleSpacing: number;
	/** Debug: small end-cap markers at the trail's start/end radii. */
	showSustainStartEnd: boolean;
}

export function createDefaultSustainSettings(): SustainSettings {
	return {
		sustainTrailsEnabled: true,
		trailWidth: 1,
		idleTrailOpacity: 1,
		composeTrailOpacity: 1,
		activeTrailGlow: 1,
		trailSampleSpacing: 0.5,
		showSustainStartEnd: false
	};
}

/** Deterministic (never `Math.random()`) per-plant seed for the trail's waviness/branch placement — the SAME plant always regenerates an identical-looking trail after a rebuild/reload, matching `hingeSideForOpening`'s identical reasoning in the building system. */
function seedFor(id: string): number {
	let hash = 0;
	for (let i = 0; i < id.length; i++) hash = (Math.imul(hash, 31) + id.charCodeAt(i)) | 0;
	return (hash >>> 0) / 0xffffffff;
}

const vertexShader = `
varying float vT;
void main(){
	vT = uv.y;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const fragmentShader = `
varying float vT;
uniform vec3 color;
uniform float idleOpacity;
uniform float composeOpacity;
uniform float compose;
// Named 'noteActive' (not 'active') — 'active' is a reserved word in GLSL and silently fails to
// compile the fragment shader under WebGL's strict validator, which is why this trail never
// rendered anything at all despite geometry/uniforms/scene-graph all being otherwise correct.
uniform float noteActive;
uniform float progress;
uniform float glowStrength;
void main(){
	float base = mix(idleOpacity, composeOpacity, compose);
	float lit = step(vT, progress) * noteActive;
	// A small ALWAYS-ON shimmer (not gated by note-active) so the trail reads as a distinct shape at rest,
	// not just while its note is currently sounding — the progress sweep on top of it is what actually
	// communicates playback, but the trail's own LENGTH (the duration) must be legible at all times.
	float ambientGlow = glowStrength * 0.4;
	float glow = ambientGlow + lit * glowStrength;
	vec3 rgb = color * (1.0 + glow * 0.9);
	gl_FragColor = vec4(rgb, clamp(base + glow, 0.0, 1.0));
}`;

function buildTrailMaterial(
	style: SustainTrailStyle,
	color: THREE.Color,
	settings: SustainSettings
): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		side: THREE.DoubleSide,
		uniforms: {
			color: { value: color },
			// `style.opacity` already carries each species' own relative intensity (~0.4-0.7), so these
			// are the ONLY additional scaling applied — stacking another fractional multiplier here (as
			// a prior version did) collapsed idle/compose trails down near the wave's near-invisible
			// guide-ring alpha (~0.06-0.14), which is why they couldn't be seen in normal play.
			idleOpacity: { value: 0.6 * style.opacity * settings.idleTrailOpacity },
			composeOpacity: { value: 1.2 * style.opacity * settings.composeTrailOpacity },
			compose: { value: 0 },
			noteActive: { value: 0 },
			progress: { value: 0 },
			glowStrength: { value: style.glow * settings.activeTrailGlow }
		},
		vertexShader,
		fragmentShader
	});
}

export interface SustainTrail {
	/** Parent to add directly to the scene/plant group at IDENTITY transform — the geometry already bakes in absolute world coordinates (see `trailEndpoints`), so this must NEVER be re-parented under the plant's own (positioned + growth-scaled) group. */
	object: THREE.Group;
	/** The trunk's own material — the one `progress`/`active`/`compose` are written to every frame; decorative branches (mycelium only) intentionally do NOT share it, so they never imply extra timing. */
	material: THREE.ShaderMaterial;
}

/**
 * Builds one static trail mesh (trunk, plus a couple of short decorative branches for mycelium) from
 * a plant's CURRENT `ringIndex`/`durationSteps`/`angle` — never rebuilt per frame (see the class-level
 * "efficient trail geometry" requirement); only `progress`/`active`/`compose` uniforms change during
 * playback. Terrain-follows by sampling `surface(x, z)` at several points along the radial segment
 * rather than assuming a flat trail at the plant's own Y.
 */
export function buildSustainTrail(
	tree: MusicTreeDefinition,
	plant: MusicPlantDefinition,
	surface: (x: number, z: number) => number,
	settings: SustainSettings
): SustainTrail {
	const style = trailStyleFor(plant.speciesId);
	const sp = species.find((s) => s.id === plant.speciesId)!;
	const { start, end } = trailEndpoints(tree, plant);
	const length = Math.hypot(end.x - start.x, end.z - start.z);
	const seed = seedFor(plant.id);
	const width = style.width * settings.trailWidth;

	// Perpendicular (lateral) unit vector — waviness offsets points sideways from the radial line,
	// never along it, so the start/end radii (the actual timing information) stay exact.
	const dx = end.x - start.x;
	const dz = end.z - start.z;
	const dirLen = Math.max(1e-6, Math.hypot(dx, dz));
	const perpX = -dz / dirLen;
	const perpZ = dx / dirLen;

	const samples = Math.max(
		2,
		Math.min(24, Math.ceil(length / Math.max(0.1, settings.trailSampleSpacing)))
	);
	const points: THREE.Vector3[] = [];
	for (let i = 0; i <= samples; i++) {
		const t = i / samples;
		const x = start.x + dx * t;
		const z = start.z + dz * t;
		// Waviness fades to exactly zero at both ends so the trunk always touches the plant and the
		// end-of-sustain point precisely, however wavy the middle looks.
		const wobble =
			Math.sin(t * Math.PI * (2 + seed * 2) + seed * 10) * style.waviness * Math.sin(t * Math.PI);
		points.push(
			new THREE.Vector3(
				x + perpX * wobble,
				// Clearance above the analytic surface sample: the tube is thin (a few cm radius) and only
				// sampled at a handful of points, unlike the wave-ring's dense full-area plane — on sloped
				// terrain a small analytic/mesh mismatch can otherwise depth-occlude the whole tube.
				// Matches (slightly exceeds) MusicWaveRenderer's own working +0.07 offset.
				surface(x + perpX * wobble, z + perpZ * wobble) + 0.09,
				z + perpZ * wobble
			)
		);
	}

	const color = new THREE.Color().setHSL(sp.hue, 0.55, 0.55 + plant.vibrancy * 0.1);
	const group = new THREE.Group();
	group.name = 'sustain-trail';

	const curve = new THREE.CatmullRomCurve3(points);
	const tubeSegments = Math.max(4, samples * 2);
	const trunkGeometry = new THREE.TubeGeometry(curve, tubeSegments, width, 5, false);
	const material = buildTrailMaterial(style, color, settings);
	const trunk = new THREE.Mesh(trunkGeometry, material);
	trunk.name = 'sustain-trunk';
	group.add(trunk);

	if (style.kind === 'mycelium' && length > 0.6) {
		const branchMaterial = new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.12,
			depthWrite: false
		});
		for (const bt of [0.35, 0.68]) {
			const originIndex = Math.min(points.length - 1, Math.round(bt * samples));
			const origin = points[originIndex];
			const branchAngle = seed * Math.PI * 2 + bt * 7;
			const branchLength = 0.35 + seed * 0.3;
			const tip = new THREE.Vector3(
				origin.x + Math.cos(branchAngle) * branchLength,
				surface(
					origin.x + Math.cos(branchAngle) * branchLength,
					origin.z + Math.sin(branchAngle) * branchLength
				) + 0.02,
				origin.z + Math.sin(branchAngle) * branchLength
			);
			const branchCurve = new THREE.CatmullRomCurve3([origin, tip]);
			const branchGeometry = new THREE.TubeGeometry(branchCurve, 4, width * 0.5, 4, false);
			const branch = new THREE.Mesh(branchGeometry, branchMaterial);
			branch.name = 'sustain-branch';
			group.add(branch);
		}
	}

	if (settings.showSustainStartEnd) {
		const markerGeometry = new THREE.SphereGeometry(width * 2.5, 6, 5);
		const startMarker = new THREE.Mesh(
			markerGeometry,
			new THREE.MeshBasicMaterial({ color: 0x39d353, depthTest: false })
		);
		startMarker.position.copy(points[0]);
		startMarker.name = 'sustain-start-marker';
		const endMarker = new THREE.Mesh(
			markerGeometry.clone(),
			new THREE.MeshBasicMaterial({ color: 0xff6655, depthTest: false })
		);
		endMarker.position.copy(points[points.length - 1]);
		endMarker.name = 'sustain-end-marker';
		group.add(startMarker, endMarker);
	}

	return { object: group, material };
}

/** Disposes a trail's geometries and materials — call on plant removal, rebuild (before replacing), and manager `clear()`. Trail materials are per-trail (never cached/shared across plants, unlike `BuildingMaterialManager`-style caches), so they must always be disposed alongside their geometry. */
export function disposeSustainTrail(trail: SustainTrail): void {
	trail.object.traverse((child) => {
		if (child instanceof THREE.Mesh) {
			child.geometry.dispose();
			const material = child.material;
			for (const m of Array.isArray(material) ? material : [material]) m.dispose();
		}
	});
	trail.object.removeFromParent();
}
