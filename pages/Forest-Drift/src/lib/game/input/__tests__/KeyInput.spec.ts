import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BindingResolver } from '../conflicts';
import { findKeyAction, type KeyActionId } from '../keyActions';
import type { Binding } from '../keyCodes';
import type { BindingPair } from '../KeyBindingsStore';
import {
	ACTION_EVENT_PROPERTY,
	createActionEvent,
	firstMatchingAction,
	isTypingTarget,
	KeyInput,
	labelForAction,
	labelsForAction,
	matchesAction,
	type KeyEventLike
} from '../KeyInput';

const defaults: BindingResolver = (id) => findKeyAction(id)!.defaults;
const withOverrides =
	(overrides: Partial<Record<KeyActionId, BindingPair>>): BindingResolver =>
	(id) =>
		overrides[id] ?? defaults(id);

function press(code: string, modifiers: Partial<KeyEventLike> = {}): KeyEventLike {
	return { code, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...modifiers };
}

const key = (code: string, modifiers: Omit<Binding, 'code'> = {}): Binding => ({
	code,
	...modifiers
});

describe('matchesAction', () => {
	it('matches the bound key', () => {
		expect(matchesAction(press('KeyG'), 'build.toggle', defaults)).toBe(true);
		expect(matchesAction(press('KeyH'), 'build.toggle', defaults)).toBe(false);
	});

	it('matches either default key', () => {
		expect(matchesAction(press('Minus'), 'build.undo', defaults)).toBe(true);
		expect(matchesAction(press('NumpadSubtract'), 'build.undo', defaults)).toBe(true);
	});

	it('follows a rebinding', () => {
		const resolve = withOverrides({ 'build.toggle': [key('KeyB'), null] });
		expect(matchesAction(press('KeyB'), 'build.toggle', resolve)).toBe(true);
		expect(matchesAction(press('KeyG'), 'build.toggle', resolve)).toBe(false);
	});

	it('never fires a plain key while Ctrl, Cmd or Alt is held', () => {
		for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const)
			expect(matchesAction(press('KeyR', { [modifier]: true }), 'tool.rotate', defaults)).toBe(
				false
			);
	});

	it('treats Ctrl and Cmd alike for the platform modifier', () => {
		expect(matchesAction(press('KeyS', { ctrlKey: true }), 'world.save', defaults)).toBe(true);
		expect(matchesAction(press('KeyS', { metaKey: true }), 'world.save', defaults)).toBe(true);
		expect(matchesAction(press('KeyS'), 'world.save', defaults)).toBe(false);
	});

	it('allows an extra Shift (reverse / finer), unless that Shift chord is bound nearby', () => {
		// Rotate: Shift + R turns the other way.
		expect(matchesAction(press('KeyR', { shiftKey: true }), 'tool.rotate', defaults)).toBe(true);
		// Mini Build editor: Shift + ← is Shrink, so it must not also move the block.
		expect(
			matchesAction(press('ArrowLeft', { shiftKey: true }), 'miniBuild.moveXMinus', defaults)
		).toBe(false);
		expect(
			matchesAction(press('ArrowLeft', { shiftKey: true }), 'miniBuild.resizeXMinus', defaults)
		).toBe(true);
		expect(matchesAction(press('ArrowLeft'), 'miniBuild.resizeXMinus', defaults)).toBe(false);
	});

	it('picks the right Mini Build rotation from its modifiers', () => {
		const ids = ['miniBuild.rotateX', 'miniBuild.rotateZ', 'miniBuild.rotateY'] as const;
		expect(firstMatchingAction(press('KeyR'), ids, defaults)).toBe('miniBuild.rotateY');
		expect(firstMatchingAction(press('KeyR', { shiftKey: true }), ids, defaults)).toBe(
			'miniBuild.rotateX'
		);
		expect(firstMatchingAction(press('KeyR', { altKey: true }), ids, defaults)).toBe(
			'miniBuild.rotateZ'
		);
	});

	it('matches either Shift key for a lone Shift binding', () => {
		expect(matchesAction(press('ShiftLeft', { shiftKey: true }), 'move.run', defaults)).toBe(true);
		expect(matchesAction(press('ShiftRight', { shiftKey: true }), 'move.run', defaults)).toBe(true);
	});

	it('ignores modifiers for hold actions', () => {
		expect(
			matchesAction(press('KeyW', { shiftKey: true, ctrlKey: true }), 'move.forward', defaults)
		).toBe(true);
	});

	it('never matches an unbound action from the keyboard', () => {
		const resolve = withOverrides({ 'build.toggle': [null, null] });
		expect(matchesAction(press('KeyG'), 'build.toggle', resolve)).toBe(false);
	});

	it('lets a touch event trigger its action whatever the bindings are', () => {
		const resolve = withOverrides({ 'build.toggle': [null, null] });
		const touch = { ...press(''), [ACTION_EVENT_PROPERTY]: 'build.toggle' };
		expect(matchesAction(touch, 'build.toggle', resolve)).toBe(true);
		expect(matchesAction(touch, 'ui.help', resolve)).toBe(false);
		// A touch event never doubles as the key it happens to carry.
		expect(
			matchesAction(
				{ ...press('KeyH'), [ACTION_EVENT_PROPERTY]: 'build.toggle' },
				'ui.help',
				defaults
			)
		).toBe(false);
	});
});

describe('KeyInput', () => {
	it('tracks held keys for hold actions', () => {
		const input = new KeyInput(defaults);
		expect(input.isHeld('move.forward')).toBe(false);
		input.handleKeyDown(press('KeyW'));
		expect(input.isHeld('move.forward')).toBe(true);
		input.handleKeyUp(press('KeyW'));
		expect(input.isHeld('move.forward')).toBe(false);
	});

	it('holds Run with either Shift key', () => {
		const input = new KeyInput(defaults);
		input.handleKeyDown(press('ShiftRight', { shiftKey: true }));
		expect(input.isHeld('move.run')).toBe(true);
		expect(input.isHeld('flight.down')).toBe(true);
	});

	it('forgets every held key on clear', () => {
		const input = new KeyInput(defaults);
		input.handleKeyDown(press('KeyW'));
		input.handleKeyDown({ ...press(''), [ACTION_EVENT_PROPERTY]: 'move.jump' });
		input.clear();
		expect(input.isHeld('move.forward')).toBe(false);
		expect(input.isHeld('move.jump')).toBe(false);
	});

	it('ignores typing in text fields', () => {
		const input = new KeyInput(defaults);
		input.handleKeyDown(press('KeyW', { target: { tagName: 'INPUT' } }));
		expect(input.isHeld('move.forward')).toBe(false);
	});

	it('holds a touch button’s action until it is released', () => {
		const input = new KeyInput(withOverrides({ 'move.jump': [null, null] }));
		input.handleKeyDown({ ...press(''), [ACTION_EVENT_PROPERTY]: 'move.jump' });
		expect(input.isHeld('move.jump')).toBe(true);
		input.handleKeyUp({ ...press(''), [ACTION_EVENT_PROPERTY]: 'move.jump' });
		expect(input.isHeld('move.jump')).toBe(false);
	});

	it('listens to a target, clears on blur and stops on detach', () => {
		const target = new EventTarget();
		const input = new KeyInput(defaults);
		const detach = input.attach(target);
		const event = (type: string, code: string) => Object.assign(new Event(type), press(code));
		target.dispatchEvent(event('keydown', 'KeyA'));
		expect(input.isHeld('move.left')).toBe(true);
		target.dispatchEvent(new Event('blur'));
		expect(input.isHeld('move.left')).toBe(false);
		detach();
		target.dispatchEvent(event('keydown', 'KeyA'));
		expect(input.isHeld('move.left')).toBe(false);
	});
});

describe('isTypingTarget', () => {
	it('spots text fields and editable text', () => {
		expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
		expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
		expect(isTypingTarget({ tagName: 'SPAN', closest: () => ({}) })).toBe(true);
		expect(isTypingTarget({ tagName: 'CANVAS', closest: () => null })).toBe(false);
		expect(isTypingTarget(null)).toBe(false);
	});
});

describe('labels', () => {
	it('names the bound keys for prompts and help', () => {
		expect(labelForAction('interact.use', undefined, { resolve: defaults })).toBe('K');
		expect(labelForAction('world.save', undefined, { resolve: defaults, apple: true })).toBe(
			'Cmd + S'
		);
		expect(labelForAction('world.save', undefined, { resolve: defaults, apple: false })).toBe(
			'Ctrl + S'
		);
		expect(labelsForAction('build.undo', { resolve: defaults })).toEqual(['-', 'Numpad −']);
	});

	it('falls back to the secondary key, then says Unbound', () => {
		expect(
			labelForAction('ui.help', undefined, {
				resolve: withOverrides({ 'ui.help': [null, key('F1')] })
			})
		).toBe('F1');
		expect(
			labelForAction('ui.help', undefined, { resolve: withOverrides({ 'ui.help': [null, null] }) })
		).toBe('Unbound');
		expect(labelForAction('build.undo', 1, { resolve: defaults })).toBe('Numpad −');
	});
});

describe('createActionEvent', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('builds a key event that carries its action', () => {
		class FakeKeyboardEvent extends Event {
			readonly code: string;
			constructor(type: string, init: { code?: string }) {
				super(type);
				this.code = init.code ?? '';
			}
		}
		vi.stubGlobal('KeyboardEvent', FakeKeyboardEvent);
		const event = createActionEvent('keydown', 'build.toggle', defaults);
		expect(event.type).toBe('keydown');
		expect(event.code).toBe('KeyG');
		expect((event as unknown as Record<string, unknown>)[ACTION_EVENT_PROPERTY]).toBe(
			'build.toggle'
		);
		const unbound = createActionEvent(
			'keyup',
			'build.toggle',
			withOverrides({ 'build.toggle': [null, null] })
		);
		expect(unbound.code).toBe('');
	});
});
