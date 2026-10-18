import * as THREE from 'three';
import { GraphicsPipeline } from '../../src/lib/game/graphics/GraphicsPipeline';
import { createDefaultGraphicsSettings } from '../../src/lib/game/graphics/GraphicsTypes';
import { RemoteAvatarRenderer } from '../../src/lib/game/net/RemoteAvatarRenderer';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360);
document.body.style.margin = '0';
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#64829a');
const camera = new THREE.PerspectiveCamera(45, 640 / 360, 0.1, 100);
const sun = new THREE.DirectionalLight(0xffffff, 2);
scene.add(sun, new THREE.AmbientLight(0xffffff, 1));
const settings = createDefaultGraphicsSettings();
settings.quality = 'high';
settings.dynamicResolutionEnabled = false;
const pipeline = new GraphicsPipeline({ renderer, scene, camera, sunLight: sun, settings });
pipeline.handleResize(640, 360);
let avatars: RemoteAvatarRenderer | null = null;

(
	window as unknown as { renderNameTag: (angle: number, yaw: number, exclude: boolean) => object }
).renderNameTag = (angle, yaw, exclude) => {
	avatars?.dispose();
	avatars = new RemoteAvatarRenderer(
		(material) => pipeline.registerMaterial(material),
		(object) => (exclude ? pipeline.excludeFromAo(object) : () => {})
	);
	scene.add(avatars.group);
	camera.position.set(4 * Math.sin(angle), 2.12, 4 * Math.cos(angle));
	camera.lookAt(0, 2.12, 0);
	camera.updateMatrixWorld(true);
	avatars.update(
		[
			{
				info: {
					playerId: 'test-player',
					slot: 1,
					name: 'Player Test',
					colour: '#e6194b',
					role: 'editor',
					away: false,
					offline: false
				},
				frame: { x: 0, y: 0, z: 0, yaw, pitch: 0, speed: 0, flags: 0, stale: false }
			}
		],
		1 / 60,
		camera
	);
	pipeline.render();
	pipeline.render();
	const pixels = new Uint8Array(220 * 40 * 4);
	renderer
		.getContext()
		.readPixels(
			210,
			160,
			220,
			40,
			renderer.getContext().RGBA,
			renderer.getContext().UNSIGNED_BYTE,
			pixels
		);
	let white = 0;
	for (let i = 0; i < pixels.length; i += 4) {
		const r = pixels[i]!,
			g = pixels[i + 1]!,
			b = pixels[i + 2]!;
		if (Math.min(r, g, b) > 180 && Math.max(r, g, b) - Math.min(r, g, b) < 30) white++;
	}
	return { white, aoEnabled: pipeline.getRenderStats().aoEnabled };
};
