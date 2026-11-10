import { describe, expect, it } from 'vitest';
import { conflictsFor, findConflicts, type BindingResolver } from '../conflicts';
import { findKeyAction, type KeyActionId } from '../keyActions';
import type { Binding } from '../keyCodes';
import type { BindingPair } from '../KeyBindingsStore';

const defaults: BindingResolver = (id) => findKeyAction(id)!.defaults;

/** Defaults, with some actions changed. */
function withOverrides(overrides: Partial<Record<KeyActionId, BindingPair>>): BindingResolver {
	return (id) => overrides[id] ?? defaults(id);
}

const key = (code: string, modifiers: Omit<Binding, 'code'> = {}): Binding => ({
	code,
	...modifiers
});
const pairsOf = (resolve: BindingResolver) =>
	findConflicts(resolve).map((c) => [c.first.id, c.second.id].sort().join(' & '));

describe('findConflicts', () => {
	it('finds none in the default controls', () => {
		expect(findConflicts(defaults)).toEqual([]);
	});

	it('reports a key shared by actions that can fire together', () => {
		// You can build and compose while walking, so Jump on E clashes with every E there.
		const resolve = withOverrides({ 'move.jump': [key('KeyE'), null] });
		expect(pairsOf(resolve).sort()).toEqual([
			'build.customise & move.jump',
			'move.jump & music.instrumentNext',
			'move.jump & roof.footprint'
		]);
	});

	it('ignores a key used only in another tool or mode', () => {
		// J is Play loop in Compose Mode; Snap only lives in build tools.
		const resolve = withOverrides({ 'tool.snap': [key('KeyJ'), null] });
		expect(findConflicts(resolve)).toEqual([]);
	});

	it('flags each tool the new key collides with, and only those', () => {
		// Snap on R clashes in the roof, opening and fence tools, not in floor detailing
		// (which has no Snap) and not in the Mini Build editor.
		const resolve = withOverrides({ 'tool.snap': [key('KeyR'), null] });
		expect(pairsOf(resolve).sort()).toEqual([
			'barrier.restyle & tool.snap',
			'opening.beamOrientation & tool.snap',
			'tool.rotate & tool.snap'
		]);
	});

	it('treats Shift + R and R as different keys', () => {
		const resolve = withOverrides({ 'tool.snap': [key('KeyR', { shift: true }), null] });
		expect(findConflicts(resolve)).toEqual([]);
	});

	it('lets Jump and Fly up share Space, since walking and flying never overlap', () => {
		expect(defaults('move.jump')[0]).toEqual(defaults('flight.up')[0]);
		expect(conflictsFor('move.jump', findConflicts(defaults))).toEqual([]);
	});

	it('still reports a third action on a key that two actions share on purpose', () => {
		// F is Toggle flight and Place Object: edit on purpose; Build Mode on F clashes with both.
		const resolve = withOverrides({ 'build.toggle': [key('KeyF'), null] });
		expect(pairsOf(resolve)).toEqual([
			'build.toggle & flight.toggle',
			'build.toggle & placeObject.edit'
		]);
	});

	it('sees Left Shift and either-side Shift as the same key', () => {
		const resolve = withOverrides({ 'camera.zoom': [key('ShiftLeft'), null] });
		expect(pairsOf(resolve)).toContain('camera.zoom & move.run');
	});

	it('reports the slots involved', () => {
		const resolve = withOverrides({ 'ui.help': [null, key('KeyL')] });
		expect(findConflicts(resolve)).toEqual([
			{
				binding: key('KeyL'),
				first: { id: 'ui.help', slot: 1 },
				second: { id: 'ui.graphicsQuality', slot: 0 }
			}
		]);
	});

	it('never clashes across the Mini Build editor and the world', () => {
		const resolve = withOverrides({ 'miniBuild.addBlock': [key('KeyW'), null] });
		expect(findConflicts(resolve)).toEqual([]);
	});
});
