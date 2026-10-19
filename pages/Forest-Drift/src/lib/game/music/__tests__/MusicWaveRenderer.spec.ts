import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createMusicTree } from '../MusicModel';
import { MusicWaveRenderer } from '../MusicWaveRenderer';

describe('music wave ground projection', () => {
	it('reuses overlapping ground samples while walking without changing the projected surface', () => {
		const surface = vi.fn((x: number, z: number) => Math.sin(x * 0.1) + Math.cos(z * 0.1));
		const wave = new MusicWaveRenderer(createMusicTree(1, 0, 0), surface);
		surface.mockClear();
		wave.follow(17, 0);
		expect(surface).toHaveBeenCalledTimes(8 * 113);
		const pos = (wave.group.children[0] as THREE.Mesh).geometry.getAttribute('position');
		for (let i = 0; i < pos.count; i++)
			expect(pos.getY(i)).toBeCloseTo(
				Math.sin((pos.getX(i) + 16) * 0.1) + Math.cos(pos.getZ(i) * 0.1) + 0.08,
				5
			);
		surface.mockClear();
		wave.follow(17, 17);
		expect(surface).toHaveBeenCalledTimes(8 * 113);
		for (let i = 0; i < pos.count; i++)
			expect(pos.getY(i)).toBeCloseTo(
				Math.sin((pos.getX(i) + 16) * 0.1) + Math.cos((pos.getZ(i) + 16) * 0.1) + 0.08,
				5
			);
		wave.dispose();
	});
	it('does not rebuild when oscillating at a cell boundary, and invalidates samples on rebuild', () => {
		let height = 2;
		const surface = vi.fn(() => height);
		const wave = new MusicWaveRenderer(createMusicTree(1, 0, 0), surface);
		surface.mockClear();
		for (let i = 0; i < 20; i++) wave.follow(i % 2 ? 7.9 : 8.1, 0);
		expect(surface).not.toHaveBeenCalled();
		height = 8;
		wave.rebuild();
		expect(surface).toHaveBeenCalledTimes(113 * 113);
		const pos = (wave.group.children[0] as THREE.Mesh).geometry.getAttribute('position');
		expect(pos.getY(0)).toBeCloseTo(8.08, 5);
		wave.dispose();
	});
});
