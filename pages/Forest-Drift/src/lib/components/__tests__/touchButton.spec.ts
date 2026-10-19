import { describe, expect, it, vi } from 'vitest';
import { touchButton } from '../touchButton';

class FakeButton extends EventTarget {
	disabled = false;
	getBoundingClientRect() {
		return { left: 0, top: 0, right: 100, bottom: 100 };
	}
}
function setup() {
	const node = new FakeButton();
	const callback = vi.fn();
	const action = touchButton(node as unknown as HTMLButtonElement, callback);
	const dispatch = (type: string, overrides: Record<string, unknown> = {}) => {
		const event = Object.assign(new Event(type, { cancelable: true }), {
			pointerId: 2,
			pointerType: 'touch',
			isPrimary: false,
			clientX: 50,
			clientY: 50,
			detail: 1,
			...overrides
		});
		node.dispatchEvent(event);
		return event;
	};
	return { node, callback, action, dispatch };
}

describe('touchButton', () => {
	it('activates a non-primary touch without any synthesized click', () => {
		const h = setup();
		h.dispatch('pointerdown');
		h.dispatch('pointerup');
		expect(h.callback).toHaveBeenCalledTimes(1);
	});
	it('keeps independently held button touches separate', () => {
		const run = setup();
		const jump = setup();
		run.dispatch('pointerdown', { pointerId: 2 });
		jump.dispatch('pointerdown', { pointerId: 3 });
		jump.dispatch('pointerup', { pointerId: 3 });
		expect(jump.callback).toHaveBeenCalledTimes(1);
		expect(run.callback).not.toHaveBeenCalled();
		run.dispatch('pointerup', { pointerId: 2 });
		expect(run.callback).toHaveBeenCalledTimes(1);
	});
	it('suppresses duplicate touch clicks while preserving mouse and keyboard activation', () => {
		const h = setup();
		h.dispatch('pointerdown');
		h.dispatch('pointerup');
		expect(h.dispatch('click').defaultPrevented).toBe(true);
		expect(h.dispatch('click', { pointerType: undefined }).defaultPrevented).toBe(true);
		expect(h.callback).toHaveBeenCalledTimes(1);
		h.dispatch('click', { pointerType: undefined, detail: 0 });
		expect(h.callback).toHaveBeenCalledTimes(2);
		h.dispatch('pointerdown', { pointerType: 'mouse' });
		h.dispatch('pointerup', { pointerType: 'mouse' });
		h.dispatch('click', { pointerType: 'mouse' });
		expect(h.callback).toHaveBeenCalledTimes(3);
	});
	it('does not activate swiped hotbar slots or releases outside the button', () => {
		const h = setup();
		h.dispatch('pointerdown');
		h.dispatch('pointermove', { clientX: 80 });
		h.dispatch('pointerup');
		h.dispatch('pointerdown');
		h.dispatch('pointerup', { clientX: 140 });
		h.dispatch('click');
		expect(h.callback).not.toHaveBeenCalled();
	});
	it.each(['pointercancel', 'lostpointercapture'])('discards interrupted presses on %s', (type) => {
		const h = setup();
		h.dispatch('pointerdown');
		h.dispatch(type);
		h.dispatch('pointerup');
		expect(h.callback).not.toHaveBeenCalled();
	});
	it('ignores unmatched releases and disabled controls', () => {
		const h = setup();
		h.dispatch('pointerdown');
		h.dispatch('pointerup', { pointerId: 999 });
		expect(h.callback).not.toHaveBeenCalled();
		h.node.disabled = true;
		h.dispatch('pointerup');
		h.dispatch('click', { detail: 0 });
		expect(h.callback).not.toHaveBeenCalled();
	});
	it('updates the action and removes listeners on destruction', () => {
		const h = setup();
		const next = vi.fn();
		h.action.update(next);
		h.dispatch('pointerdown');
		h.dispatch('pointerup');
		expect(h.callback).not.toHaveBeenCalled();
		expect(next).toHaveBeenCalledTimes(1);
		h.action.destroy();
		h.dispatch('pointerdown');
		h.dispatch('pointerup');
		expect(next).toHaveBeenCalledTimes(1);
	});
});
