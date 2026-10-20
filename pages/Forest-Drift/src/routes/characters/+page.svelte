<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { CharacterAssetCache } from '$lib/game/characters/CharacterAssetCache';
	import { CharacterInstance } from '$lib/game/characters/CharacterInstance';
	import { PLAYER_COLOURS, POSE_FLAGS } from '$lib/game/net/protocol';
	let canvas: HTMLCanvasElement;
	let mode = $state('idle');
	let count = $state(1);
	let status = $state('Loading character…');
	onMount(() => {
		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
		const scene = new THREE.Scene();
		scene.background = new THREE.Color('#c7d6d1');
		const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
		camera.position.set(3, 2.3, -4);
		const controls = new OrbitControls(camera, canvas);
		controls.target.set(0, 0.9, 0);
		controls.update();
		scene.add(new THREE.HemisphereLight(0xffffff, 0x72755b, 2));
		const sun = new THREE.DirectionalLight(0xffffff, 3);
		sun.position.set(-3, 5, -4);
		scene.add(sun);
		const grid = new THREE.GridHelper(40, 40, 0x6b8177, 0xa0b1a7);
		scene.add(grid);
		const cache = new CharacterAssetCache();
		const characters: CharacterInstance[] = [];
		let template: THREE.Group | null = null;
		let disposed = false;
		let animation = 0;
		let last = performance.now();
		let elapsed = 0;
		let framedCount = 1;
		const samples: number[] = [];
		const resize = () => {
			renderer.setSize(innerWidth, innerHeight);
			camera.aspect = innerWidth / innerHeight;
			camera.updateProjectionMatrix();
		};
		resize();
		addEventListener('resize', resize);
		void cache
			.load()
			.then((asset) => {
				if (!disposed) {
					template = asset;
					status = 'Ready';
				}
			})
			.catch((error) => {
				if (!disposed) status = String(error);
			});
		const render = (now: number) => {
			const dt = Math.min((now - last) / 1000, 0.05);
			last = now;
			elapsed += dt;
			if (framedCount !== count) {
				framedCount = count;
				const centerX = (Math.min(count, 5) - 1) * 0.75;
				const centerZ = Math.floor((count - 1) / 5) * 0.75;
				const speed = mode === 'run' ? 12 : mode === 'walk' ? 6 : 0;
				controls.target.set(centerX, 0.9, centerZ - speed * elapsed);
				camera.position.set(
					centerX + (count === 1 ? 3 : 8),
					count === 1 ? 2.3 : 6,
					controls.target.z - (count === 1 ? 4 : 10)
				);
				controls.update();
			}
			if (template && characters.length < count) {
				const c = new CharacterInstance(template, PLAYER_COLOURS[characters.length], () => {});
				characters.push(c);
				scene.add(c.object);
			}
			while (characters.length > count) characters.pop()!.dispose();
			const start = performance.now();
			characters.forEach((c, i) => {
				const speed = mode === 'run' ? 12 : mode === 'walk' ? 6 : 0;
				const x = (i % 5) * 1.5;
				const z = Math.floor(i / 5) * 1.5;
				const jumpTime = elapsed % 2;
				const jumpHeight =
					mode === 'jump' && jumpTime < 0.8 ? 4 * 0.9 * (jumpTime / 0.8) * (1 - jumpTime / 0.8) : 0;
				// Translate both character and tracking camera for a real world-space gait.
				c.object.position.set(x, mode === 'flight' ? 0.7 : jumpHeight, z - speed * elapsed);
				c.update(
					{
						x,
						y: c.object.position.y,
						z: z - speed * elapsed,
						yaw: mode === 'look' || mode === 'build' ? Math.sin(elapsed * 0.8) * 1.1 : 0,
						pitch: mode === 'look' || mode === 'build' ? Math.sin(elapsed * 1.2) * 0.7 : 0,
						speed,
						stale: false,
						flags:
							mode === 'flight'
								? POSE_FLAGS.flying
								: mode === 'jump' && jumpHeight > 0.001
									? 0
									: POSE_FLAGS.grounded |
										(mode === 'run' ? POSE_FLAGS.running : 0) |
										(mode === 'build' ? POSE_FLAGS.building : 0)
					},
					dt,
					4,
					() => 0
				);
			});
			samples.push(performance.now() - start);
			if (samples.length > 3600) samples.shift();
			const speed = mode === 'run' ? 12 : mode === 'walk' ? 6 : 0;
			const targetZ = Math.floor((count - 1) / 5) * 0.75 - speed * elapsed;
			camera.position.z += targetZ - controls.target.z;
			controls.target.z = targetZ;
			controls.update();
			grid.position.z = Math.floor(targetZ);
			renderer.render(scene, camera);
			// Read-only diagnostics for browser tests and local profiling.
			Object.assign(window, {
				__characterLab: {
					count: characters.length,
					cpuSamples: samples,
					drawCalls: renderer.info.render.calls,
					triangles: renderer.info.render.triangles,
					characters
				}
			});
			animation = requestAnimationFrame(render);
		};
		animation = requestAnimationFrame(render);
		return () => {
			disposed = true;
			cancelAnimationFrame(animation);
			removeEventListener('resize', resize);
			characters.forEach((c) => c.dispose());
			cache.dispose();
			controls.dispose();
			grid.geometry.dispose();
			(grid.material as THREE.Material).dispose();
			renderer.dispose();
		};
	});
</script>

<svelte:head><title>Forest Drift · Characters</title></svelte:head>
<canvas bind:this={canvas} aria-label="Character preview"></canvas>
<div class="toolbar">
	<strong>Character preview</strong><span data-testid="character-status">{status}</span>
	<label
		>Animation <select bind:value={mode}
			><option>idle</option><option>look</option><option>build</option><option>walk</option><option
				>run</option
			><option>jump</option><option>flight</option></select
		></label
	>
	<label
		>Characters <select bind:value={count}
			><option value={1}>1</option><option value={5}>5</option><option value={19}>19</option
			></select
		></label
	>
	<span>Drag to orbit · Scroll to zoom</span>
</div>

<style>
	canvas {
		display: block;
		width: 100vw;
		height: 100vh;
	}
	.toolbar {
		position: fixed;
		top: 1rem;
		left: 1rem;
		display: flex;
		gap: 1rem;
		align-items: center;
		padding: 0.8rem;
		background: #ffffffed;
		border-radius: 0.5rem;
		font: 14px system-ui;
		color: #182f26;
		flex-wrap: wrap;
	}
	label {
		display: flex;
		gap: 0.4rem;
	}
</style>
