import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphicsSettingsStore } from '../GraphicsSettingsStore';

/** Minimal in-memory Storage stand-in — same approach as MaterialPresetStore.spec.ts's own fake. */
class FakeStorage implements Storage {
	private readonly map = new Map<string, string>();
	get length(): number {
		return this.map.size;
	}
	clear(): void {
		this.map.clear();
	}
	getItem(key: string): string | null {
		return this.map.has(key) ? this.map.get(key)! : null;
	}
	key(index: number): string | null {
		return [...this.map.keys()][index] ?? null;
	}
	removeItem(key: string): void {
		this.map.delete(key);
	}
	setItem(key: string, value: string): void {
		this.map.set(key, value);
	}
}

describe('GraphicsSettingsStore', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', new FakeStorage());
	});

	it('returns null when nothing has been saved yet', () => {
		expect(new GraphicsSettingsStore().getQuality()).toBeNull();
	});

	it('round-trips a saved quality level', () => {
		const store = new GraphicsSettingsStore();
		store.setQuality('ultra');
		expect(new GraphicsSettingsStore().getQuality()).toBe('ultra');
	});

	it('overwrites a previously saved quality', () => {
		const store = new GraphicsSettingsStore();
		store.setQuality('low');
		store.setQuality('high');
		expect(store.getQuality()).toBe('high');
	});

	it('degrades to null on a corrupted/hand-edited stored value instead of throwing', () => {
		localStorage.setItem('forest-drift.graphics.v1', 'not-a-real-quality');
		expect(new GraphicsSettingsStore().getQuality()).toBeNull();
	});

	it('never throws when localStorage is unavailable (non-browser environment)', () => {
		vi.stubGlobal('localStorage', undefined);
		const store = new GraphicsSettingsStore();
		expect(() => store.setQuality('medium')).not.toThrow();
		expect(store.getQuality()).toBeNull();
	});
});
