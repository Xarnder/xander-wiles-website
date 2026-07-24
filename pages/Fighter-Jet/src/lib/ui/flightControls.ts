export type FlightControlRow = {
	keys: string;
	description: string;
};

/** Shared flight / combat reference for intro overlay and pause controls dialog. */
export const FLIGHT_CONTROL_ROWS: readonly FlightControlRow[] = [
	{ keys: 'Mouse / W S', description: 'Pitch' },
	{ keys: 'A / D', description: 'Roll' },
	{ keys: 'Q / E', description: 'Yaw (fine aim)' },
	{ keys: 'R / F', description: 'Throttle up / down' },
	{ keys: 'Shift', description: 'Afterburner' },
	{ keys: 'Space', description: 'Fire missile' },
	{ keys: 'Tab', description: 'Cycle target' },
	{ keys: 'C', description: 'Cycle camera' },
	{ keys: 'B', description: 'Toggle Formation / Free Squad' },
	{ keys: 'T', description: 'Toggle squad target / direction debug' },
	{ keys: 'M', description: 'Tactical map' },
	{ keys: 'Escape', description: 'Pause' },
	{ keys: 'R', description: 'Restart after mission end' },
	{ keys: 'Gamepad L stick', description: 'Pitch and roll' },
	{ keys: 'Gamepad R stick', description: 'Yaw / look' },
	{ keys: 'RT / LT', description: 'Throttle / brake' },
	{ keys: 'A / B / shoulders', description: 'Fire / cycle target / afterburner' },
	{ keys: 'Touch stick', description: 'Pitch and roll' },
	{ keys: 'Tilt (iOS/iPad)', description: 'Enable motion, then bank device' },
	{ keys: 'Touch throttle', description: 'Throttle / afterburner at top' },
	{ keys: 'Touch yaw', description: 'Yaw left / right' },
	{
		keys: 'Touch buttons',
		description: 'Fire, AB, target, camera, squad, debug, map, pause'
	}
];
