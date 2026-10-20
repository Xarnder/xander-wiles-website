import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GraphicsPipeline } from '../GraphicsPipeline';
function fixture() {
	const scene = new THREE.Scene();
	const visible = new THREE.Object3D(),
		uncullable = new THREE.Object3D(),
		hidden = new THREE.Object3D();
	uncullable.frustumCulled = false;
	hidden.visible = false;
	scene.add(visible, uncullable, hidden);
	const states: boolean[][] = [];
	const renderer = {
		info: { autoReset: true, reset: vi.fn() },
		render: vi.fn(() =>
			states.push([visible.frustumCulled, uncullable.frustumCulled, hidden.frustumCulled])
		)
	};
	const camera = new THREE.PerspectiveCamera();
	camera.rotation.set(0.2, 0.7, 0);
	const orientation = camera.quaternion.clone();
	const pipeline = Object.create(GraphicsPipeline.prototype) as GraphicsPipeline;
	Object.assign(pipeline, {
		renderer,
		scene,
		camera,
		composer: null
	});
	return { camera, orientation, pipeline, renderer, states, visible, uncullable, hidden };
}
describe('first-frame GPU warmup', () => {
	it('warms other views through real passes once without changing culling or the final camera', () => {
		const f = fixture();
		f.pipeline.prewarm();
		f.pipeline.render();
		expect(f.states).toHaveLength(4);
		expect(f.states[0]).toEqual([true, false, true]);
		expect(f.visible.frustumCulled).toBe(true);
		expect(f.uncullable.frustumCulled).toBe(false);
		f.pipeline.render();
		expect(f.states).toHaveLength(5);
		expect(f.renderer.info.autoReset).toBe(true);
		expect(f.camera.quaternion.toArray()).toEqual(f.orientation.toArray());
	});
	it('restores culling and renderer state when rendering fails', () => {
		const f = fixture();
		f.renderer.render.mockImplementationOnce(() => {
			throw Error('context lost');
		});
		f.pipeline.prewarm();
		expect(() => f.pipeline.render()).toThrow('context lost');
		expect(f.visible.frustumCulled).toBe(true);
		expect(f.uncullable.frustumCulled).toBe(false);
		expect(f.renderer.info.autoReset).toBe(true);
		expect(f.camera.quaternion.toArray()).toEqual(f.orientation.toArray());
	});
});
