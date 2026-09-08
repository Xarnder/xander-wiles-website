import * as THREE from 'three';
import { totalSteps, waveRadius, type MusicTreeDefinition } from './MusicModel';
import { disposeGroup } from './MusicPlantManager';
/** Static ground-projected mesh; only uniforms change per frame. No terrain sampling in animation. */
export class MusicWaveRenderer {
	readonly group = new THREE.Group();
	private patchX = NaN;
	private patchZ = NaN;
	private geometry = new THREE.PlaneGeometry(224, 224, 112, 112).rotateX(-Math.PI / 2);
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
		const cx = Math.round(x / 16) * 16,
			cz = Math.round(z / 16) * 16;
		if (cx === this.patchX && cz === this.patchZ) return;
		this.patchX = cx;
		this.patchZ = cz;
		const pos = this.geometry.getAttribute('position');
		for (let i = 0; i < pos.count; i++)
			pos.setY(i, this.surface(pos.getX(i) + cx, pos.getZ(i) + cz) + 0.08);
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
