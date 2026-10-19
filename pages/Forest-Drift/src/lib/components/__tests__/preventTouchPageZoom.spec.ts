import { describe, expect, it } from 'vitest';
import { preventTouchPageZoom } from '../preventTouchPageZoom';

function setup(enabled = true) {
	const node = new EventTarget();
	const action = preventTouchPageZoom(node as HTMLElement, enabled);
	const dispatch = (type: string, fingers = 1) => {
		const event = Object.assign(new Event(type, { cancelable: true }), {
			touches: { length: fingers }
		});
		node.dispatchEvent(event);
		return event.defaultPrevented;
	};
	return { action, dispatch };
}

describe('touchscreen game page zoom prevention', () => {
	it('blocks pinch movement, Safari gestures and double-click zoom', () => {
		const { dispatch } = setup();
		expect(dispatch('touchmove', 2)).toBe(true);
		for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
			expect(dispatch(type)).toBe(true);
		}
	});

	it('preserves scrolling and pointer input, including buttons held alongside the joystick', () => {
		const { dispatch } = setup();
		expect(dispatch('touchmove', 1)).toBe(false);
		for (const type of [
			'touchstart',
			'touchend',
			'pointerdown',
			'pointermove',
			'pointerup',
			'click'
		]) {
			expect(dispatch(type, 2)).toBe(false);
		}
	});

	it('leaves desktop behavior alone and supports changing touch mode', () => {
		const { action, dispatch } = setup(false);
		expect(dispatch('touchmove', 2)).toBe(false);
		expect(dispatch('gesturestart')).toBe(false);
		expect(dispatch('dblclick')).toBe(false);
		action.update(true);
		expect(dispatch('gesturestart')).toBe(true);
		action.update(false);
		expect(dispatch('gesturestart')).toBe(false);
	});

	it('removes gesture interception when leaving the game', () => {
		const { action, dispatch } = setup();
		action.destroy();
		expect(dispatch('touchmove', 2)).toBe(false);
		expect(dispatch('gesturestart')).toBe(false);
		expect(dispatch('dblclick')).toBe(false);
	});
});
