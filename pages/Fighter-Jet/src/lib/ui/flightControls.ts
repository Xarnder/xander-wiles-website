export type FlightControlRow = {
	keys: string;
	description: string;
};

/** Shared flight / combat reference for intro overlay and pause controls dialog. */
export const FLIGHT_CONTROL_ROWS: readonly FlightControlRow[] = [
	{ keys: 'Mouse / Arrows', description: 'Pitch and yaw' },
	{ keys: 'A / D', description: 'Roll' },
	{ keys: 'Q / E', description: 'Yaw (fine aim)' },
	{ keys: 'W / S', description: 'Throttle up / down' },
	{ keys: 'Shift', description: 'Afterburner' },
	{ keys: 'Space', description: 'Fire missile (when locked)' },
	{ keys: 'Tab', description: 'Cycle target' },
	{ keys: 'C', description: 'Cycle camera' },
	{ keys: 'M', description: 'Tactical map' },
	{ keys: 'Escape', description: 'Pause' },
	{ keys: 'R', description: 'Restart after mission end' },
	{ keys: 'Gamepad L stick', description: 'Pitch and roll' },
	{ keys: 'Gamepad R stick', description: 'Yaw / look' },
	{ keys: 'RT / LT', description: 'Throttle / brake' },
	{ keys: 'A / B / shoulders', description: 'Fire / cycle target / afterburner' },
	{ keys: 'Touch stick', description: 'Pitch and roll' },
	{ keys: 'Tilt (iOS/iPad)', description: 'Enable motion, then bank device' },
	{ keys: 'Touch buttons', description: 'Fire, target, camera, map, pause' }
];
