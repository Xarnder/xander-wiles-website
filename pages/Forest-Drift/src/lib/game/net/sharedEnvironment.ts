/**
 * Helpers for the owner's shared sky, weather and time (`SharedEnvironment`, decision Q14-A).
 *
 * The room passes the owner's settings on without understanding them, so every client applies them
 * defensively: only onto keys its own settings already have, only with the same type, and never onto
 * the prototype chain. A newer or older client simply ignores what it doesn't know.
 */

/**
 * The weather settings everyone shares. The rest of `WeatherDebugSettings` is personal (sound volume,
 * precipitation density for performance, debug overlays) or meaningless online (pausing and speeding
 * up the weather clock — it follows the room clock there).
 */
export const SHARED_WEATHER_KEYS = [
	'enabled',
	'selection',
	'intensity',
	'transitionDuration',
	'windDirection',
	'windStrength',
	'cloudiness',
	'allowSnow',
	'lightningFrequency',
	'wetnessOverride',
	'snowCoverOverride'
] as const;

/** Sky settings that stay local: the developer overlays. */
export const LOCAL_SKY_KEYS = ['debug'] as const;

const MAX_STRING_LENGTH = 200;
const MAX_DEPTH = 6;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** A deep copy of the listed keys of `source` (plain JSON values only). */
export function pickKeys(source: object, keys: readonly string[]): Record<string, unknown> {
	const record = source as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const key of keys) {
		if (key in record) out[key] = cloneJson(record[key]);
	}
	return out;
}

/** A deep copy of `source` without the listed keys. */
export function omitKeys(source: object, keys: readonly string[]): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(source)) {
		if (!keys.includes(key)) out[key] = cloneJson(value);
	}
	return out;
}

/**
 * Copies values from `source` onto `target`, but only for keys `target` already has, with the same
 * type (finite numbers, short strings, booleans, nested objects). Returns how many values changed.
 */
export function applyKnownFields(
	target: object,
	source: unknown,
	skipKeys: readonly string[] = [],
	depth = 0
): number {
	if (!isRecord(source) || depth > MAX_DEPTH) return 0;
	const into = target as Record<string, unknown>;
	let changed = 0;
	for (const [key, value] of Object.entries(source)) {
		if (FORBIDDEN_KEYS.has(key) || skipKeys.includes(key)) continue;
		if (!Object.prototype.hasOwnProperty.call(into, key)) continue;
		const current = into[key];
		if (isRecord(current)) {
			changed += applyKnownFields(current, value, [], depth + 1);
		} else if (typeof current === 'number') {
			if (typeof value === 'number' && Number.isFinite(value) && value !== current) {
				into[key] = value;
				changed++;
			}
		} else if (typeof current === 'boolean') {
			if (typeof value === 'boolean' && value !== current) {
				into[key] = value;
				changed++;
			}
		} else if (typeof current === 'string') {
			if (typeof value === 'string' && value.length <= MAX_STRING_LENGTH && value !== current) {
				into[key] = value;
				changed++;
			}
		}
	}
	return changed;
}

function cloneJson(value: unknown): unknown {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
