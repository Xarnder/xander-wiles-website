import { describe, expect, it } from 'vitest';
import { createDefaultSkySettings } from '../SkyTypes';
import {
	DEFAULT_DAY_CYCLE_SECONDS,
	advanceTimeOfDay,
	daylightAmount,
	dayPhaseLabel,
	formatClockFromDayFraction,
	formatDayClock,
	resolveEffectiveSky,
	solarElevationFactor,
	sunAnglesForTimeOfDay,
	twilightAmount,
	wrapTimeOfDay
} from '../dayNightMath';

describe('wrapTimeOfDay', () => {
	it('wraps past 1 back into the day', () => {
		expect(wrapTimeOfDay(1.25)).toBeCloseTo(0.25);
		expect(wrapTimeOfDay(-0.25)).toBeCloseTo(0.75);
	});
});

describe('advanceTimeOfDay', () => {
	it('advances one full day in 20 real minutes', () => {
		const next = advanceTimeOfDay(0.1, DEFAULT_DAY_CYCLE_SECONDS, DEFAULT_DAY_CYCLE_SECONDS);
		expect(next).toBeCloseTo(0.1);
	});

	it('moves a quarter-day in 5 minutes', () => {
		const next = advanceTimeOfDay(0, 5 * 60, DEFAULT_DAY_CYCLE_SECONDS);
		expect(next).toBeCloseTo(0.25);
	});
});

describe('sunAnglesForTimeOfDay', () => {
	it('puts the sun on the horizon at sunrise and sunset', () => {
		expect(sunAnglesForTimeOfDay(0.25, 70, 130).elevation).toBeCloseTo(0, 5);
		expect(sunAnglesForTimeOfDay(0.75, 70, 130).elevation).toBeCloseTo(0, 5);
	});

	it('reaches noon elevation at midday and is below the horizon at midnight', () => {
		expect(sunAnglesForTimeOfDay(0.5, 70, 130).elevation).toBeCloseTo(70, 5);
		expect(sunAnglesForTimeOfDay(0, 70, 130).elevation).toBeLessThan(0);
	});

	it('faces the noon azimuth at midday', () => {
		expect(sunAnglesForTimeOfDay(0.5, 70, 130).azimuth).toBeCloseTo(130, 5);
	});
});

describe('formatClockFromDayFraction', () => {
	it('labels midnight, noon, and morning in 12-hour time', () => {
		expect(formatClockFromDayFraction(0)).toBe('12:00 AM');
		expect(formatClockFromDayFraction(0.5)).toBe('12:00 PM');
		expect(formatClockFromDayFraction(0.34)).toBe('8:10 AM');
		expect(formatDayClock(0)).toContain('Night');
		expect(dayPhaseLabel(0.5)).toBe('Midday');
	});
});

describe('solarElevationFactor', () => {
	it('is -1 at midnight, 0 at sunrise, +1 at noon', () => {
		expect(solarElevationFactor(0)).toBeCloseTo(-1);
		expect(solarElevationFactor(0.25)).toBeCloseTo(0);
		expect(solarElevationFactor(0.5)).toBeCloseTo(1);
	});
});

describe('resolveEffectiveSky', () => {
	it('leaves authored colours alone when the cycle is off', () => {
		const settings = createDefaultSkySettings();
		settings.dayCycle.enabled = false;
		settings.sky.topColor = '#123456';
		const look = resolveEffectiveSky(settings);
		expect(look.sky.topColor).toBe('#123456');
		expect(look.atmosphere.sunElevation).toBe(settings.atmosphere.sunElevation);
	});

	it('darkens the sky at midnight without mutating the authored day colours', () => {
		const settings = createDefaultSkySettings();
		settings.dayCycle.timeOfDay = 0;
		const before = settings.sky.topColor;
		const look = resolveEffectiveSky(settings);
		expect(settings.sky.topColor).toBe(before);
		expect(look.sky.topColor.toLowerCase()).not.toBe(before.toLowerCase());
		expect(look.atmosphere.sunIntensity).toBeLessThan(settings.atmosphere.sunIntensity);
		expect(look.atmosphere.sunElevation).toBeLessThan(0);
	});

	it('is brightest near noon', () => {
		const settings = createDefaultSkySettings();
		settings.dayCycle.timeOfDay = 0.5;
		const noon = resolveEffectiveSky(settings);
		settings.dayCycle.timeOfDay = 0;
		const night = resolveEffectiveSky(settings);
		expect(noon.atmosphere.sunIntensity).toBeGreaterThan(night.atmosphere.sunIntensity);
		expect(daylightAmount(0.5)).toBeGreaterThan(daylightAmount(0));
		expect(twilightAmount(0.25)).toBeGreaterThan(twilightAmount(0.5));
	});
});
