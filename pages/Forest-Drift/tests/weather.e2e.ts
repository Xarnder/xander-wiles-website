import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld, openSettingsMenu, openWorldNamed } from './worldHelpers';

interface WeatherProbe {
	type: string;
	mode: string;
	rain: number;
	snow: number;
	strikes: number;
	transition: number;
	drawCalls: number;
	active: number;
	capacity: number;
}

async function probe(page: Page): Promise<WeatherProbe> {
	return page.evaluate(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const scene = (window as any).__forestSession.scene;
		const w = scene.weather.getStats();
		const p = scene.particles.getStats();
		return {
			type: w.type,
			mode: w.mode,
			rain: w.rain,
			snow: w.snow,
			strikes: w.lightningStrikes,
			transition: w.transition,
			drawCalls: p.drawCalls,
			active: p.activeParticles,
			capacity: p.capacity
		};
	});
}

async function chooseWeather(page: Page, weather: string, transitionSeconds = 2): Promise<void> {
	await openSettingsMenu(page);
	await page.getByTestId('settings-search').fill('weather');
	const transition = page
		.getByTestId('settings-field-weather.transition')
		.locator('input[type="number"]');
	await transition.fill(String(transitionSeconds));
	await transition.press('Enter');
	await page.getByTestId('settings-field-weather.selection').locator('select').selectOption(weather);
	await page.getByTestId('settings-close').click();
	await page.getByTestId('pause-resume').click();
}

test('weather: rain, storm lightning and snow on the shared particle system, restored after reload', async ({
	page
}) => {
	test.setTimeout(240_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Weather World', seed: 'weather-seed' });
	expect((await probe(page)).rain).toBe(0);

	// Rain: precipitation fades in over the transition, as one shared-renderer draw.
	await chooseWeather(page, 'rain');
	await expect.poll(async () => (await probe(page)).rain, { timeout: 20_000 }).toBeGreaterThan(200);
	let state = await probe(page);
	expect(state.type).toBe('rain');
	expect(state.mode).toBe('manual');
	expect(state.active).toBeLessThanOrEqual(state.capacity);
	expect(state.drawCalls).toBeLessThanOrEqual(3);

	// Thunderstorm: lightning strikes (forced here so the test does not wait on the storm).
	await chooseWeather(page, 'thunderstorm');
	await openSettingsMenu(page);
	await page.getByTestId('settings-search').fill('lightning');
	await page.getByTestId('settings-field-weather.lightning').click();
	await page.getByTestId('settings-close').click();
	await page.getByTestId('pause-resume').click();
	await expect.poll(async () => (await probe(page)).strikes).toBeGreaterThan(0);

	// Snow: the rain field empties, the snow field fills.
	await chooseWeather(page, 'snow');
	await expect
		.poll(async () => {
			const s = await probe(page);
			return s.snow > 100 && s.rain === 0;
		}, { timeout: 20_000 })
		.toBe(true);
	state = await probe(page);
	expect(state.type).toBe('snow');

	// Save, reload, reopen: the logical weather comes back; particles are rebuilt locally.
	await page.keyboard.press('ControlOrMeta+s');
	await expect(page.getByTestId('save-indicator')).toHaveAttribute('data-status', 'saved', {
		timeout: 20_000
	});
	const saved = await page.evaluate(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const env = (window as any).__forestSession.scene.getEnvironment();
		return env.weather;
	});
	expect(saved.mode).toBe('manual');
	expect(saved.manual.type).toBe('snow');
	expect(JSON.stringify(saved)).not.toContain('particle');

	await page.reload();
	await openWorldNamed(page, 'Weather World');
	await expect.poll(async () => (await probe(page)).type, { timeout: 20_000 }).toBe('snow');
	await expect.poll(async () => (await probe(page)).snow, { timeout: 20_000 }).toBeGreaterThan(100);

	expect(errors).toEqual([]);
});
