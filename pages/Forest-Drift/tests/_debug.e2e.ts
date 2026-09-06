import { test } from '@playwright/test';

test('debug notice DOM timing', async ({ page }) => {
	page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
	await page.goto('/');
	await page.getByTestId('graphics-stats').waitFor({ timeout: 10_000 });

	await page.keyboard.press('l');
	const found = await page.evaluate(
		() =>
			new Promise((resolve) => {
				let seen = false;
				const check = () => {
					if (document.querySelector('[data-testid="graphics-notice"]')) seen = true;
				};
				const interval = setInterval(check, 5);
				check();
				setTimeout(() => {
					clearInterval(interval);
					resolve(seen);
				}, 2500);
			})
	);
	console.log('ever appeared in DOM during the 2.5s window:', found);
});
