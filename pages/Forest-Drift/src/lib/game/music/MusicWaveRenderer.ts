import * as THREE from 'three';
import { totalSteps, waveRadius, type MusicTreeDefinition } from './MusicModel';
import { disposeGroup } from './MusicPlantManager';
const PATCH_SIZE = 224;
const PATCH_SEGMENTS = 112;
const PATCH_SIDE = PATCH_SEGMENTS + 1;
const PATCH_STEP = PATCH_SIZE / PATCH_SEGMENTS;
const FOLLOW_STEP = 16;

/** Static ground-projected mesh; only uniforms change per frame. No terrain sampling in animation. */
export class MusicWaveRenderer {
	readonly group = new THREE.Group();
	private patchX = NaN;
	private patchZ = NaN;
	private readonly heights = new Float32Array(PATCH_SIDE * PATCH_SIDE);
	private readonly nextHeights = new Float32Array(PATCH_SIDE * PATCH_SIDE);
	private geometry = new THREE.PlaneGeometry(
		PATCH_SIZE,
		PATCH_SIZE,
		PATCH_SEGMENTS,
		PATCH_SEGMENTS
	).rotateX(-Math.PI / 2);
	readonly material = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		side: THREE.DoubleSide,
		uniforms: {
			radius: { value: 3 },
			offset: { value: new THREE.Vector2() },
			first: { value: 3 },
			spacing: { value: 1 },
			count: { value: 32 },
			compose: { value: 0 },
			hover: { value: -1 },
			width: { value: 0.24 },
			opacity: { value: 0.6 },
			glow: { value: 1 },
			playing: { value: 0 },
			beat: { value: 2 },
			bar: { value: 8 }
		},
		vertexShader:
			'uniform vec2 offset; varying vec2 ground; void main(){ground=position.xz+offset;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
		fragmentShader: `varying vec2 ground; uniform float radius, first, spacing, count, compose, hover, width, opacity, glow, playing, beat, bar;
 void main(){float r=length(ground);float i=floor((r-first)/spacing+0.5);float ring=first+i*spacing;float valid=step(0.,i)*step(i,count-1.);float hierarchy=0.06+0.04*(1.-step(0.1,mod(i,beat)))+0.04*(1.-step(0.1,mod(i,bar)));float guide=exp(-pow((r-ring)/0.045,2.))*valid*compose*(hierarchy+0.22*(1.-step(0.1,abs(i-hover))));float pulse=exp(-pow((r-radius)/width,2.))*playing;float fade=1.-smoothstep(first+(count-1.)*spacing,first+count*spacing,r);gl_FragColor=vec4(vec3(0.42,0.95,0.76)*glow,(guide+pulse*opacity)*fade);}`
	});
	constructor(
		private tree: MusicTreeDefinition,
		private surface: (x: number, z: number) => number
	) {
		this.rebuild();
	}
	rebuild() {
		const s = this.tree.loop;
		if (!this.group.children.length) this.group.add(new THREE.Mesh(this.geometry, this.material));
		this.patchX = NaN;
		this.patchZ = NaN;
		this.follow(this.tree.position.x, this.tree.position.z);

		Object.assign(this.material.uniforms.first, { value: s.firstRingRadius });
		this.material.uniforms.spacing.value = s.ringSpacing;
		this.material.uniforms.count.value = totalSteps(s);
		this.material.uniforms.beat.value = s.subdivisionsPerBeat;
		this.material.uniforms.bar.value = s.subdivisionsPerBeat * s.beatsPerBar;
	}
	follow(x: number, z: number) {
		// Keep a full cell of hysteresis: hovering near a rounding boundary must not
		// re-project 12,769 vertices on every change of direction.
		if (Math.abs(x - this.patchX) <= FOLLOW_STEP && Math.abs(z - this.patchZ) <= FOLLOW_STEP)
			return;
		const cx = Math.round(x / FOLLOW_STEP) * FOLLOW_STEP,
			cz = Math.round(z / FOLLOW_STEP) * FOLLOW_STEP;
		const shiftX = (cx - this.patchX) / PATCH_STEP,
			shiftZ = (cz - this.patchZ) / PATCH_STEP;
		const pos = this.geometry.getAttribute('position');
		for (let i = 0; i < pos.count; i++) {
			const oldX = (i % PATCH_SIDE) + shiftX,
				oldZ = Math.floor(i / PATCH_SIDE) + shiftZ;
			const height =
				oldX >= 0 && oldX < PATCH_SIDE && oldZ >= 0 && oldZ < PATCH_SIDE
					? this.heights[oldZ * PATCH_SIDE + oldX]
					: this.surface(pos.getX(i) + cx, pos.getZ(i) + cz) + 0.08;
			this.nextHeights[i] = height;
			pos.setY(i, height);
		}
		this.heights.set(this.nextHeights);
		this.patchX = cx;
		this.patchZ = cz;
		pos.needsUpdate = true;
		this.geometry.computeBoundingSphere();
		this.group.position.set(cx, 0, cz);
		this.material.uniforms.offset.value.set(cx - this.tree.position.x, cz - this.tree.position.z);
	}

	update(elapsed: number, playing: boolean, compose: boolean, hover = -1) {
		this.material.uniforms.radius.value = waveRadius(this.tree.loop, elapsed);
		this.material.uniforms.playing.value = Number(playing);
		this.material.uniforms.compose.value = Number(compose);
		this.material.uniforms.hover.value = hover;
	}
	dispose() {
		disposeGroup(this.group);
		this.material.dispose();
	}
}
