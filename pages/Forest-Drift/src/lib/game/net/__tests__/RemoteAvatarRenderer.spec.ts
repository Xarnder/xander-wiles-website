import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteAvatarRenderer } from '../RemoteAvatarRenderer';
import type { RemotePlayerView } from '../NetSession';

afterEach(() => vi.unstubAllGlobals());

describe('remote name tags', () => {
	it('excludes only the billboard from AO, retains it through turns, and releases exclusions on leave', () => {
		const noop = () => {};
		vi.stubGlobal('document', {
			createElement: () => ({
				width: 0,
				height: 0,
				getContext: () => ({
					measureText: () => ({ width: 160 }),
					beginPath: noop,
					moveTo: noop,
					arcTo: noop,
					closePath: noop,
					fill: noop,
					arc: noop,
					fillText: noop
				})
			})
		});
		const excluded = new Set<THREE.Object3D>();
		const avatars = new RemoteAvatarRenderer(noop, (object) => {
			excluded.add(object);
			return () => {
				excluded.delete(object);
			};
		});
		const camera = new THREE.PerspectiveCamera();
		camera.position.z = 4;
		const view: RemotePlayerView = {
			info: {
				playerId: 'p',
				slot: 0,
				name: 'Player Test',
				colour: '#e6194b',
				role: 'editor',
				away: false,
				offline: false
			},
			frame: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0, flags: 0, stale: false }
		};
		avatars.update([view], 1 / 60, camera);
		expect(excluded.size).toBe(1);
		const label = [...excluded][0] as THREE.Sprite;
		expect(label.isSprite).toBe(true);
		expect(label.material.toneMapped).toBe(false);
		expect(label.material.fog).toBe(false);
		expect(label.material.depthTest).toBe(true); // Still hidden by real walls and terrain.
		view.frame.yaw = Math.PI;
		avatars.update([view], 1 / 60, camera);
		expect([...excluded]).toEqual([label]);
		avatars.update([], 1 / 60, camera);
		expect(excluded.size).toBe(0);
		avatars.update([view], 1 / 60, camera);
		expect(excluded.size).toBe(1);
		avatars.dispose();
		expect(excluded.size).toBe(0);
	});
});
