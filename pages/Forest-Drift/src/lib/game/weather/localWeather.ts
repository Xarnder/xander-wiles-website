import { copyWeatherEnvironment, type WeatherEnvironment } from './WeatherTypes';

/**
 * Turning the one shared weather into what falls HERE (biomes Phase 5, decision Q24).
 *
 * The schedule is still one world-wide weather — shared online, saved once — and every client
 * applies the local climate to it the same way, so players standing together see the same thing:
 * - it's cold here: the precipitation falls as snow (whatever the schedule called it);
 * - it's mild here: as rain (a scheduled "snow" day is a wet one in the jungle);
 * - the biome scales how much falls: none in the desert (a dry, cloudy sky), more in a swamp.
 * Clouds, wind and lightning stay as scheduled (a desert can have a dry thunderstorm).
 */
export interface LocalWeatherClimate {
	/** 0..1 climate temperature at the player. */
	temperature: number;
	/** Precipitation multiplier at the player. */
	precipitation: number;
}

/** Fully snow at or below this climate temperature… */
export const SNOW_TEMPERATURE = 0.12;
/** …fully rain at or above this one, blended in between (sleet-like mix of both). */
export const RAIN_TEMPERATURE = 0.22;

function smooth(edge0: number, edge1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/** How much of the precipitation falls as snow at a temperature, 0..1. */
export function snowShare(temperature: number): number {
	return 1 - smooth(SNOW_TEMPERATURE, RAIN_TEMPERATURE, temperature);
}

/** Writes the local weather into `out` (which may be `shared`'s own copy). */
export function localizeWeather(
	shared: WeatherEnvironment,
	climate: LocalWeatherClimate,
	out: WeatherEnvironment
): WeatherEnvironment {
	if (out !== shared) copyWeatherEnvironment(shared, out);
	const falling = Math.max(0, shared.rain) + Math.max(0, shared.snow);
	const scale = Math.max(0, climate.precipitation);
	const snow = snowShare(climate.temperature);
	out.snow = Math.min(1, falling * snow * scale);
	out.rain = Math.min(1, falling * (1 - snow) * scale);
	// Snow here reads cooler even if the scheduled weather was a mild rain.
	out.coolness = Math.max(shared.coolness, out.snow * 0.6);
	return out;
}
