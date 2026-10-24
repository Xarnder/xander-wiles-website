import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocatorBar, inkFor } from '../LocatorBar';

/** Just enough DOM for LocatorBar, counting every write so tests can see what was touched. */
let writes = 0;
class FakeElement {
	className = '';
	children: FakeElement[] = [];
	parent: FakeElement | null = null;
	readonly classes = new Set<string>();
	readonly vars = new Map<string, string>();
	private text = '';
	private styleValues: Record<string, string> = {};
	clientWidth = 0;
	readonly style = new Proxy(
		{
			setProperty: (name: string, value: string) => {
				writes++;
				this.vars.set(name, value);
			}
		} as Record<string, unknown>,
		{
			get: (target, key: string) => (key in target ? target[key] : (this.styleValues[key] ?? '')),
			set: (_target, key: string, value: string) => {
				writes++;
				this.styleValues[key] = value;
				return true;
			}
		}
	);
	readonly classList = {
		toggle: (name: string, on: boolean) => {
			writes++;
			if (on) this.classes.add(name);
			else this.classes.delete(name);
		}
	};
	get textContent(): string {
		return this.text;
	}
	set textContent(value: string) {
		writes++;
		this.text = value;
	}
	append(...nodes: FakeElement[]): void {
		for (const node of nodes) {
			node.parent = this;
			this.children.push(node);
		}
	}
	remove(): void {
		if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
	}
	get labelText(): string {
		return this.children[2]?.textContent ?? '';
	}
	get x(): number {
		return Number(/translate3d\(([-\d.]+)px/.exec(String(this.style.transform))?.[1]);
	}
	get shown(): boolean {
		return this.style.display !== 'none';
	}
}

const WIDTH = 400;

function setup() {
	const bar = new LocatorBar();
	const element = new FakeElement();
	element.clientWidth = WIDTH;
	bar.attach(element as unknown as HTMLElement);
	// 90° vertical on a square view: 90° across, looking down −Z from the origin, 1.7 m eyes.
	const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
	camera.position.set(0, 1.7, 0);
	camera.updateMatrixWorld(true);
	const markers = () => element.children;
	const marker = (index: number) => element.children[index]!;
	return { bar, element, camera, markers, marker };
}

function frame(
	bar: LocatorBar,
	camera: THREE.PerspectiveCamera,
	players: [id: string, x: number, z: number, colour?: string][]
) {
	bar.beginFrame(camera, 0);
	for (const [id, x, z, colour] of players) bar.place(id, x, 0, z, colour ?? '#e6194b', id, false);
	bar.endFrame();
}

describe('LocatorBar', () => {
	beforeEach(() => {
		writes = 0;
		vi.stubGlobal('document', { createElement: () => new FakeElement() });
	});
	afterEach(() => vi.unstubAllGlobals());

	it("puts each player's dot where they are, in their colour", () => {
		const { bar, camera, marker } = setup();
		frame(bar, camera, [
			['sam', 0, -10, '#e6194b'],
			['alex', 10, -10, '#4363d8']
		]);
		expect(marker(0).x).toBe(200);
		expect(marker(1).x).toBe(400);
		expect(marker(0).vars.get('--locator-colour')).toBe('#e6194b');
		expect(marker(1).vars.get('--locator-colour')).toBe('#4363d8');
	});

	it('always labels the closest player with their distance, in their colour', () => {
		const { bar, camera, marker } = setup();
		frame(bar, camera, [
			['far', -20, -40],
			['near', 6, -8]
		]);
		expect(bar.closest).toBe('near');
		expect(marker(1).classes.has('closest')).toBe(true);
		expect(marker(1).labelText).toBe('near · 10 m');
		// Others only say who they are when you look straight at them.
		expect(marker(0).labelText).toBe('');
	});

	it('pins the closest player to the end of the bar when they are out of view, pointing the way', () => {
		const { bar, camera, marker } = setup();
		// Closest is behind and to the right; the other is ahead but further away.
		frame(bar, camera, [
			['ahead', 0, -50],
			['behind', 5, 5]
		]);
		expect(bar.closest).toBe('behind');
		expect(marker(1).shown).toBe(true);
		expect(marker(1).x).toBe(WIDTH);
		expect(marker(1).classes.has('edge-right')).toBe(true);
		expect(marker(1).labelText).toBe('behind · 7 m ▶');
		// Behind and to the left: the left end, arrow first.
		frame(bar, camera, [
			['ahead', 0, -50],
			['behind', -5, 5]
		]);
		expect(marker(1).x).toBe(0);
		expect(marker(1).labelText).toBe('◀ behind · 7 m');
		// Anyone else out of view is still hidden.
		frame(bar, camera, [
			['ahead', 0, -50],
			['behind', -5, 5],
			['near', 0, -3]
		]);
		expect(bar.closest).toBe('near');
		expect(marker(1).shown).toBe(false);
	});

	it("doesn't flicker between two players at almost the same distance", () => {
		const { bar, camera } = setup();
		frame(bar, camera, [
			['a', 0, -10],
			['b', 3, -10.2]
		]);
		expect(bar.closest).toBe('a');
		frame(bar, camera, [
			['a', 0, -10.4],
			['b', 3, -9.6]
		]);
		expect(bar.closest).toBe('a');
		frame(bar, camera, [
			['a', 0, -14],
			['b', 3, -9.6]
		]);
		expect(bar.closest).toBe('b');
	});

	it('writes nothing to the page when nothing has moved', () => {
		const { bar, camera } = setup();
		frame(bar, camera, [
			['a', 0, -10],
			['b', 5, -20]
		]);
		writes = 0;
		frame(bar, camera, [
			['a', 0, -10],
			['b', 5, -20]
		]);
		expect(writes).toBe(0);
	});

	it('removes markers for players who left, and hides the bar when nobody else is here', () => {
		const { bar, element, camera, markers } = setup();
		frame(bar, camera, [
			['a', 0, -10],
			['b', 5, -20]
		]);
		expect(markers()).toHaveLength(2);
		expect(element.style.visibility).toBe('visible');
		frame(bar, camera, []);
		expect(markers()).toHaveLength(0);
		expect(element.style.visibility).toBe('hidden');
	});

	it('pins a selected player instead of the nearest, and returns to automatic selection on stop', () => {
		const { bar, camera, marker } = setup();
		const players: [string, number, number][] = [
			['near', 0, -2],
			['sam', -40, 40]
		];
		bar.setTrackedPlayer('sam');
		frame(bar, camera, players);
		expect(bar.closest).toBe('near');
		expect(marker(1).shown).toBe(true);
		expect(marker(1).classes.has('tracked')).toBe(true);
		expect(marker(1).classes.has('edge-left')).toBe(true);
		expect(marker(1).labelText).toContain('sam');
		expect(marker(0).classes.has('closest')).toBe(false);
		writes = 0;
		frame(bar, camera, players);
		expect(writes).toBe(0);
		bar.setTrackedPlayer(null);
		frame(bar, camera, players);
		expect(marker(1).shown).toBe(false);
		expect(marker(1).classes.has('tracked')).toBe(false);
		expect(marker(0).classes.has('closest')).toBe(true);
	});

	it('falls back to the nearest when a tracked player has no position', () => {
		const { bar, camera, marker } = setup();
		bar.setTrackedPlayer('missing');
		frame(bar, camera, [['sam', 5, 5]]);
		expect(marker(0).shown).toBe(true);
		expect(marker(0).classes.has('closest')).toBe(true);
	});
	it('picks readable text for each colour', () => {
		expect(inkFor('#ffe119')).toBe('#04121f');
		expect(inkFor('#ffffff')).toBe('#04121f');
		expect(inkFor('#000075')).toBe('#ffffff');
		expect(inkFor('#4363d8')).toBe('#ffffff');
	});
});
