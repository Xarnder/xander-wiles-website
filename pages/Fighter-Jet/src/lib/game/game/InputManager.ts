import type { GameSettings, InputMethod, InputState, TouchInput } from '../types';
import { GAME_CONFIG } from '../config/gameConfig';
import { clamp } from '../utils/math';

export type GameAction =
	| 'pitchUp'
	| 'pitchDown'
	| 'rollLeft'
	| 'rollRight'
	| 'yawLeft'
	| 'yawRight'
	| 'throttleUp'
	| 'throttleDown'
	| 'afterburner'
	| 'fire'
	| 'cycleTarget'
	| 'cycleCamera'
	| 'pause'
	| 'map';

export type InputBindings = Record<GameAction, readonly string[]>;

export const DEFAULT_BINDINGS: InputBindings = {
	pitchUp: ['ArrowUp'],
	pitchDown: ['ArrowDown'],
	rollLeft: ['KeyA'],
	rollRight: ['KeyD'],
	yawLeft: ['KeyQ', 'ArrowLeft'],
	yawRight: ['KeyE', 'ArrowRight'],
	throttleUp: ['KeyW'],
	throttleDown: ['KeyS'],
	afterburner: ['ShiftLeft', 'ShiftRight'],
	fire: ['Space'],
	cycleTarget: ['Tab'],
	cycleCamera: ['KeyC'],
	pause: ['Escape', 'KeyP'],
	map: ['KeyM']
};

const ACTIONS = Object.keys(DEFAULT_BINDINGS) as GameAction[];

export class InputManager {
	private readonly keys = new Set<string>();
	private readonly pressed = new Set<GameAction>();
	private readonly touch: Required<TouchInput> = {
		pitch: 0,
		roll: 0,
		yaw: 0,
		throttle: 0.55,
		afterburner: false,
		fire: false
	};
	private bindings: InputBindings = DEFAULT_BINDINGS;
	private element: HTMLElement | null = null;
	private attached = false;
	private pointerX = 0;
	private pointerY = 0;
	private method: InputMethod = 'keyboard-mouse';
	private throttle = 0.55;
	private settings: Readonly<GameSettings>;
	private readonly output: InputState = {
		pitch: 0,
		roll: 0,
		yaw: 0,
		throttle: 0.55,
		afterburner: false,
		fire: false,
		cycleTarget: false,
		cycleCamera: false,
		pause: false,
		map: false,
		method: 'keyboard-mouse'
	};

	constructor(settings: Readonly<GameSettings>) {
		this.settings = settings;
		this.method = settings.preferredControls;
	}

	attach(element: HTMLElement): void {
		if (this.attached || typeof window === 'undefined') return;
		this.element = element;
		window.addEventListener('keydown', this.onKeyDown);
		window.addEventListener('keyup', this.onKeyUp);
		window.addEventListener('blur', this.onBlur);
		element.addEventListener('pointermove', this.onPointerMove);
		element.addEventListener('pointerdown', this.onPointerDown);
		element.addEventListener('contextmenu', this.onContextMenu);
		this.attached = true;
	}

	detach(): void {
		if (!this.attached || typeof window === 'undefined') return;
		window.removeEventListener('keydown', this.onKeyDown);
		window.removeEventListener('keyup', this.onKeyUp);
		window.removeEventListener('blur', this.onBlur);
		this.element?.removeEventListener('pointermove', this.onPointerMove);
		this.element?.removeEventListener('pointerdown', this.onPointerDown);
		this.element?.removeEventListener('contextmenu', this.onContextMenu);
		this.element = null;
		this.attached = false;
		this.onBlur();
	}

	update(delta: number): Readonly<InputState> {
		const keyboardPitch = this.axis('pitchDown', 'pitchUp');
		const keyboardRoll = this.axis('rollLeft', 'rollRight');
		const keyboardYaw = this.axis('yawLeft', 'yawRight');
		let pitch = clamp(keyboardPitch - this.pointerY, -1, 1);
		let roll = keyboardRoll;
		let yaw = clamp(keyboardYaw + this.pointerX, -1, 1);
		let afterburner = this.isDown('afterburner');
		let fire = this.isDown('fire');

		if (this.isDown('throttleUp')) this.throttle += delta * 0.5;
		if (this.isDown('throttleDown')) this.throttle -= delta * 0.5;

		const gamepad = typeof navigator !== 'undefined' ? navigator.getGamepads?.()[0] : null;
		if (gamepad?.connected) {
			const deadZone = GAME_CONFIG.controls.gamepadDeadZone;
			const axis = (value: number): number =>
				Math.abs(value) < deadZone
					? 0
					: ((Math.abs(value) - deadZone) / (1 - deadZone)) * Math.sign(value);
			const sensitivity = this.settings.gamepadSensitivity;
			const gamepadRoll = clamp(axis(gamepad.axes[0] ?? 0) * sensitivity, -1, 1);
			const gamepadPitch = clamp(axis(gamepad.axes[1] ?? 0) * sensitivity, -1, 1);
			const gamepadYaw = clamp(axis(gamepad.axes[2] ?? 0) * sensitivity, -1, 1);
			if (Math.abs(gamepadRoll) + Math.abs(gamepadPitch) + Math.abs(gamepadYaw) > 0.05) {
				this.method = 'gamepad';
				roll = gamepadRoll;
				pitch = gamepadPitch;
				yaw = gamepadYaw;
			}
			const triggerThrottle = gamepad.axes[3];
			if (triggerThrottle !== undefined && Math.abs(triggerThrottle) > 0.1) {
				this.throttle = clamp((1 - triggerThrottle) * 0.5, 0, 1);
			}
			afterburner ||= Boolean(gamepad.buttons[5]?.pressed);
			fire ||= Boolean(gamepad.buttons[0]?.pressed);
			this.captureGamepadButton(gamepad, 1, 'cycleTarget');
			this.captureGamepadButton(gamepad, 3, 'cycleCamera');
			this.captureGamepadButton(gamepad, 9, 'pause');
		}

		if (this.method === 'touch') {
			pitch = this.touch.pitch;
			roll = this.touch.roll;
			yaw = this.touch.yaw;
			this.throttle = this.touch.throttle;
			afterburner = this.touch.afterburner;
			fire = this.touch.fire;
		}
		if (this.settings.simplifiedFlight) {
			roll = clamp(roll + yaw * 0.72, -1, 1);
			yaw *= 0.65;
		}

		const pitchDirection = this.settings.invertPitch ? -1 : 1;
		this.output.pitch = clamp(pitch * pitchDirection, -1, 1);
		this.output.roll = clamp(roll, -1, 1);
		this.output.yaw = clamp(yaw, -1, 1);
		this.output.throttle = clamp(this.throttle, 0, 1);
		this.output.afterburner = afterburner;
		this.output.fire = fire;
		this.output.cycleTarget = this.pressed.has('cycleTarget');
		this.output.cycleCamera = this.pressed.has('cycleCamera');
		this.output.pause = this.pressed.has('pause');
		this.output.map = this.pressed.has('map');
		this.output.method = this.method;
		return this.output;
	}

	consume(action: GameAction): boolean {
		return this.pressed.delete(action);
	}

	setTouchInput(input: TouchInput): void {
		this.touch.pitch = clamp(input.pitch ?? this.touch.pitch, -1, 1);
		this.touch.roll = clamp(input.roll ?? this.touch.roll, -1, 1);
		this.touch.yaw = clamp(input.yaw ?? this.touch.yaw, -1, 1);
		this.touch.throttle = clamp(input.throttle ?? this.touch.throttle, 0, 1);
		this.touch.afterburner = input.afterburner ?? this.touch.afterburner;
		this.touch.fire = input.fire ?? this.touch.fire;
		this.throttle = this.touch.throttle;
		this.method = 'touch';
	}

	setBindings(partial: Partial<InputBindings>): void {
		this.bindings = { ...this.bindings, ...partial };
	}

	updateSettings(settings: Readonly<GameSettings>): void {
		this.settings = settings;
		if (!this.attached) this.method = settings.preferredControls;
	}

	private axis(negative: GameAction, positive: GameAction): number {
		return Number(this.isDown(positive)) - Number(this.isDown(negative));
	}

	private isDown(action: GameAction): boolean {
		return this.bindings[action].some((code) => this.keys.has(code));
	}

	private actionForCode(code: string): GameAction | null {
		for (const action of ACTIONS) {
			if (this.bindings[action].includes(code)) return action;
		}
		return null;
	}

	private captureGamepadButton(gamepad: Gamepad, index: number, action: GameAction): void {
		const key = `gamepad-${index}`;
		if (gamepad.buttons[index]?.pressed) {
			if (!this.keys.has(key)) this.pressed.add(action);
			this.keys.add(key);
		} else {
			this.keys.delete(key);
		}
	}

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		const action = this.actionForCode(event.code);
		if (action && !this.keys.has(event.code)) this.pressed.add(action);
		this.keys.add(event.code);
		this.method = 'keyboard-mouse';
		if (action === 'fire' || action === 'cycleTarget' || action === 'cycleCamera') {
			event.preventDefault();
		}
	};

	private readonly onKeyUp = (event: KeyboardEvent): void => {
		this.keys.delete(event.code);
	};

	private readonly onPointerMove = (event: PointerEvent): void => {
		if (!this.element) return;
		const rect = this.element.getBoundingClientRect();
		const range = GAME_CONFIG.controls.pointerRangePixels;
		this.pointerX = clamp(
			((event.clientX - (rect.left + rect.width * 0.5)) / range) * this.settings.mouseSensitivity,
			-1,
			1
		);
		this.pointerY = clamp(
			((event.clientY - (rect.top + rect.height * 0.5)) / range) * this.settings.mouseSensitivity,
			-1,
			1
		);
		if (Math.abs(this.pointerX) + Math.abs(this.pointerY) > 0.03) {
			this.method = 'keyboard-mouse';
		}
	};

	private readonly onPointerDown = (event: PointerEvent): void => {
		this.method = 'keyboard-mouse';
		if (event.button === 0) this.pressed.add('fire');
		if (event.button === 2) this.pressed.add('cycleTarget');
	};

	private readonly onContextMenu = (event: Event): void => {
		event.preventDefault();
	};

	private readonly onBlur = (): void => {
		this.keys.clear();
		this.pressed.clear();
		this.pointerX = 0;
		this.pointerY = 0;
	};
}
