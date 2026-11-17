import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

/**
 * Find a biome Phase 1: the Biomes list on the full map (plan §6, Q1–Q7, Q10). The list and its
 * distances, picking (a pin well inside the nearest patch, ready for Travel here), Next nearest,
 * the keyboard (B, arrows, Enter, N, the Esc order), screen-reader names, touch on a phone, and the
 * switches that hide it. Runs in Chromium, WebKit and Firefox; screenshots to $FIND_BIOME_SHOTS.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scene = any;
async function sceneValue<R, A = undefined>(
	page: Page,
	read: (s: Scene, arg: A) => R,
	arg?: A
): Promise<Awaited<R>> {
	return page.evaluate(
		({ source, arg }) =>
			new Function('s', 'arg', `return (${source})(s, arg)`)(
				(window as unknown as { __forestSession: { scene: Scene } }).__forestSession.scene,
				arg
			),
		{ source: read.toString(), arg }
	) as Promise<Awaited<R>>;
}

const shots = process.env.FIND_BIOME_SHOTS;
const SEED = 'minimap-e2e';

/** The readout's coordinates ("x 1 234 · z −567") as numbers. */
async function readoutPoint(page: Page) {
	const text = (await page.getByTestId('biome-full-map-coordinates').textContent()) ?? '';
	const [x, z] = text
		.split('·')
		.map((part) => Number(part.replace(/[xz\s\u202f\u00a0]/g, '').replace('\u2212', '-')));
	return { x, z };
}

async function openMap(page: Page) {
	await page.keyboard.press('Backquote');
	await expect(page.getByTestId('biome-full-map')).toBeVisible();
	await expect(page.getByTestId('biome-full-map-biome')).not.toHaveText('—', { timeout: 20_000 });
}

/** Waits for the list's distances, and returns the rows as shown. */
async function rows(page: Page) {
	const list = page.getByTestId('biome-list');
	await expect(list).toBeVisible();
	await expect(page.getByTestId('biome-list-status')).toHaveText('Nearest within 16 km', {
		timeout: 30_000
	});
	return list.locator('button[data-biome]').evaluateAll((buttons) =>
		buttons.map((b) => ({
			id: (b as HTMLElement).dataset.testid!.replace('biome-row-', ''),
			name: b.querySelector('.name')!.textContent!,
			text: b.querySelector('.distance')!.textContent!,
			label: b.getAttribute('aria-label')!
		}))
	);
}

/** "2.4 km" or "640 m" in metres. */
const metres = (text: string) =>
	text.endsWith(' km') ? Number(text.slice(0, -3)) * 1000 : Number(text.slice(0, -2));

test('the Biomes list: distances, picking pins the nearest patch, Next nearest, Travel here', async ({
	page
}) => {
	test.setTimeout(180_000);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Find a biome', seed: SEED });
	await expect(page.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
	await openMap(page);

	const button = page.getByTestId('biome-full-map-biomes');
	await expect(button).toHaveAttribute('aria-expanded', 'false');
	await button.click();
	await expect(button).toHaveAttribute('aria-expanded', 'true');
	const list = await rows(page);
	expect(list).toHaveLength(26);
	// Every row has a distance, "Here" (exactly one) or "None within 16 km".
	const here = list.filter((r) => r.text === 'Here');
	expect(here).toHaveLength(1);
	for (const r of list) expect(r.text).toMatch(/^(Here|None within 16 km|\d+(\.\d)? k?m)$/);
	expect(here[0].name).toBe(await page.getByTestId('biome-full-map-biome').textContent());
	// Screen readers hear the name and the distance.
	expect(list.find((r) => r.text !== 'Here')!.label).toMatch(/^[A-Z][\w ]+, /);
	// Within each group, nearest first after Here.
	const groups = await page
		.getByTestId('biome-list')
		.locator('ul')
		.evaluateAll((uls) =>
			uls.map((ul) => [...ul.querySelectorAll('.distance')].map((d) => d.textContent!))
		);
	for (const texts of groups) {
		const distances = texts.filter((t) => /\d/.test(t)).map(metres);
		expect([...distances].sort((a, b) => a - b)).toEqual(distances);
	}
	if (shots) await page.screenshot({ path: `${shots}/biomes-list.jpg`, quality: 85 });

	// Pick the nearest biome that isn't the one you're in.
	const target = list
		.filter((r) => /\d/.test(r.text))
		.sort((a, b) => metres(a.text) - metres(b.text))[0];
	await page.getByTestId(`biome-row-${target.id}`).click();
	const found = page.getByTestId('biome-full-map-found');
	await expect(found).toHaveText(new RegExp(`^Nearest ${target.name} · 1 of \\d$`));
	await expect(page.getByTestId(`biome-row-${target.id}`)).toHaveAttribute('aria-current', 'true');
	await expect(page.getByTestId('biome-full-map-travel')).toHaveText('Travel here');
	await expect(page.getByTestId('biome-full-map-distance')).toContainText(target.text);
	const map = page.getByTestId('biome-full-map');
	await expect(map.getByRole('status')).toContainText(`Nearest ${target.name}: ${target.text}`);
	// The pin is in that biome, and the map is centred on it.
	const pin = await readoutPoint(page);
	expect(await sceneValue(page, (s, p) => s.biomeNameAt(p.x, p.z), pin)).toBe(target.name);
	if (shots) await page.screenshot({ path: `${shots}/biome-picked.jpg`, quality: 85 });

	// Next nearest: a different patch at least 1 km away, then the end of the list.
	const count = Number((await found.textContent())!.match(/of (\d)$/)![1]);
	if (count > 1) {
		await page.getByTestId('biome-full-map-next').click();
		await expect(found).toHaveText(`${target.name} · 2 of ${count}`);
		const second = await readoutPoint(page);
		expect(Math.hypot(second.x - pin.x, second.z - pin.z)).toBeGreaterThanOrEqual(990);
		expect(await sceneValue(page, (s, p) => s.biomeNameAt(p.x, p.z), second)).toBe(target.name);
	}
	for (let i = 2; i < count; i++) await page.getByTestId('biome-full-map-next').click();
	await page.getByTestId('biome-full-map-next').click();
	await expect(page.getByTestId('biome-full-map-find-message')).toHaveText(
		`No more ${target.name} within 16 km`
	);

	// Back to the nearest, then Travel here: you arrive in that biome.
	await page.getByTestId(`biome-row-${target.id}`).click();
	await expect(found).toHaveText(new RegExp(`^Nearest ${target.name}`));
	await page.getByTestId('biome-full-map-travel').click();
	await expect(page.getByTestId('biome-full-map')).toBeHidden({ timeout: 15_000 });
	await expect
		.poll(() =>
			sceneValue(page, (s) =>
				s.biomeNameAt(s.controller.worldPosition.x, s.controller.worldPosition.z)
			)
		)
		.toBe(target.name);

	// Reopened after travelling more than 250 m: a fresh scan, and now that biome is Here.
	await openMap(page);
	await page.getByTestId('biome-full-map-biomes').click();
	await expect(page.getByTestId(`biome-row-${target.id}`)).toContainText('Here', {
		timeout: 30_000
	});
	expect(errors).toEqual([]);
});

test('by keyboard: B, arrows, Enter, N, and Esc closes the list, then the pin, then the map', async ({
	page
}) => {
	test.setTimeout(180_000);
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Find by keys', seed: SEED });
	await expect(page.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
	await openMap(page);
	await expect(page.getByRole('application')).toHaveAttribute('aria-label', /B lists biomes/);

	await page.keyboard.press('b');
	// The first row takes focus; one down, then the rows re-sort as distances arrive, and focus
	// stays on the same biome.
	await expect(page.getByTestId('biome-list').locator('button[data-biome]').first()).toBeFocused();
	await page.keyboard.press('ArrowDown');
	const focusedId = await page.evaluate(
		() => (document.activeElement as HTMLElement | null)?.dataset.testid ?? ''
	);
	expect(focusedId).toMatch(/^biome-row-/);
	const list = await rows(page);
	await expect(page.getByTestId(focusedId)).toBeFocused();
	// Home goes to the first row; arrows move without panning the map.
	await page.keyboard.press('Home');
	const first = page.getByTestId(`biome-row-${list[0].id}`);
	await expect(first).toBeFocused();
	const before = await readoutPoint(page);
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	await expect(page.getByTestId(`biome-row-${list[2].id}`)).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(page.getByTestId(`biome-row-${list[1].id}`)).toBeFocused();
	expect(await readoutPoint(page)).toEqual(before);
	await page.keyboard.press('End');
	await expect(page.getByTestId(`biome-row-${list.at(-1)!.id}`)).toBeFocused();

	// Enter on a row with a distance picks it.
	const target = list.find((r) => /\d/.test(r.text))!;
	await page.getByTestId(`biome-row-${target.id}`).focus();
	await page.keyboard.press('Enter');
	const found = page.getByTestId('biome-full-map-found');
	await expect(found).toHaveText(new RegExp(`^Nearest ${target.name} · 1 of \\d$`));
	const count = Number((await found.textContent())!.match(/of (\d)$/)![1]);
	await page.keyboard.press('n');
	await expect(found).toHaveText(
		count > 1 ? `${target.name} · 2 of ${count}` : new RegExp(`^Nearest ${target.name}`)
	);

	// Esc: the list closes first (focus back on the Biomes button), the pin stays.
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('biome-list')).toBeHidden();
	await expect(page.getByTestId('biome-full-map-biomes')).toBeFocused();
	await expect(found).toBeVisible();
	// Then the pin.
	await page.keyboard.press('Escape');
	await expect(found).toBeHidden();
	await expect(page.getByTestId('biome-full-map-travel')).toBeHidden();
	// B reopens the list straight away: the scan is kept while you haven't moved (Q9).
	await page.keyboard.press('b');
	await expect(page.getByTestId('biome-list-status')).toHaveText('Nearest within 16 km', {
		timeout: 2000
	});
	await page.keyboard.press('b');
	await expect(page.getByTestId('biome-list')).toBeHidden();
	// Then the map.
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('biome-full-map')).toBeHidden();
});

test('a biome with none in range says so', async ({ page }) => {
	test.setTimeout(180_000);
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Find none', seed: SEED });
	await expect(page.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
	await openMap(page);
	await page.keyboard.press('b');
	const list = await rows(page);
	const none = list.find((r) => r.text === 'None within 16 km');
	const here = list.find((r) => r.text === 'Here')!;
	if (none) {
		await expect(page.getByTestId(`biome-row-${none.id}`)).toHaveClass(/none/);
		await page.getByTestId(`biome-row-${none.id}`).click();
		await expect(page.getByTestId('biome-full-map-find-message')).toHaveText(
			`No ${none.name} within 16 km`
		);
		await expect(page.getByTestId('biome-full-map-found')).toBeHidden();
	}
	// Picking the biome you're in pins another patch of it, not the one underfoot (Q10).
	await page.getByTestId(`biome-row-${here.id}`).click();
	const found = page.getByTestId('biome-full-map-found');
	const message = page.getByTestId('biome-full-map-find-message');
	await expect(
		found.or(message.filter({ hasText: `No other ${here.name} within 16 km` }))
	).toBeVisible();
	if (await found.isVisible()) {
		await expect(found).toHaveText(new RegExp(`^Nearest ${here.name} · 1 of \\d$`));
		const me = await sceneValue(page, (s) => ({
			x: s.controller.worldPosition.x,
			z: s.controller.worldPosition.z
		}));
		await expect
			.poll(async () => {
				const pin = await readoutPoint(page);
				return Math.hypot(pin.x - me.x, pin.z - me.z);
			})
			.toBeGreaterThan(200);
	} else await expect(message).toHaveText(`No other ${here.name} within 16 km`);
});

test('hidden in a world without biomes, and with ?findBiome=off', async ({ page }) => {
	test.setTimeout(180_000);
	await page.goto('/?findBiome=off');
	await createAndEnterWorld(page, { name: 'Find off', seed: SEED });
	await expect(page.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
	await openMap(page);
	await expect(page.getByTestId('biome-full-map-zoom-in')).toBeVisible();
	await expect(page.getByTestId('biome-full-map-biomes')).toHaveCount(0);
	await page.keyboard.press('b');
	await expect(page.getByTestId('biome-list')).toHaveCount(0);
	await page.keyboard.press('Escape');

	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Find no biomes', seed: SEED });
	await expect(page.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
	await sceneValue(page, (s) => {
		s.setBiomesEnabled(false);
		s.emitStats();
	});
	await expect(page.getByTestId('biome-minimap')).toBeHidden();
	await page.keyboard.press('Backquote');
	await expect(page.getByTestId('biome-full-map')).toBeVisible();
	await expect(page.getByTestId('biome-full-map-zoom-in')).toBeVisible();
	await expect(page.getByTestId('biome-full-map-biomes')).toHaveCount(0);
});

test.describe('touch', () => {
	test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
	test('on a phone: the list is a sheet, and picking closes it to show the pin', async ({
		page,
		browserName
	}) => {
		test.skip(browserName === 'firefox', 'Firefox has no touch emulation in Playwright');
		test.setTimeout(180_000);
		await page.goto('/');
		await createAndEnterWorld(page, { name: 'Find touch', seed: SEED });
		await expect(page.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
		await page.getByTestId('biome-minimap-open').tap();
		await expect(page.getByTestId('biome-full-map')).toBeVisible();
		await page.getByTestId('biome-full-map-biomes').tap();
		const list = await rows(page);
		const sheet = (await page.getByTestId('biome-list').boundingBox())!;
		expect(sheet.x).toBe(0);
		expect(sheet.width).toBe(390);
		expect(sheet.y + sheet.height).toBeLessThanOrEqual(844 + 1);
		expect(sheet.height).toBeLessThanOrEqual(844 * 0.6);
		if (shots) await page.screenshot({ path: `${shots}/biomes-phone.jpg`, quality: 85 });
		const target = list.find((r) => /\d/.test(r.text))!;
		await page.getByTestId(`biome-row-${target.id}`).tap();
		await expect(page.getByTestId('biome-list')).toBeHidden();
		await expect(page.getByTestId('biome-full-map-found')).toHaveText(
			new RegExp(`^Nearest ${target.name}`)
		);
		for (const id of ['biome-full-map-travel', 'biome-full-map-next']) {
			const b = (await page.getByTestId(id).boundingBox())!;
			expect(b.x).toBeGreaterThanOrEqual(0);
			expect(b.x + b.width).toBeLessThanOrEqual(390);
			expect(b.y + b.height).toBeLessThanOrEqual(844);
		}
		if (shots) await page.screenshot({ path: `${shots}/biome-picked-phone.jpg`, quality: 85 });
	});
});
