import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, test } from '@playwright/test';

// Exercise the actual actions without loading the WebGL world. This keeps real
// multi-touch regression checks quick enough to run in both browser engines.
const actionSource = ['touchButton', 'preventTouchPageZoom']
	.map((name) => readFileSync(new URL(`../src/lib/components/${name}.ts`, import.meta.url), 'utf8'))
	.join('\n');
const actionJs = ts.transpileModule(actionSource, {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText;

test.use({ hasTouch: true });

test.beforeEach(async ({ page }) => {
	await page.setContent(`
		<style>
			#shell { position: fixed; inset: 0; touch-action: pan-x pan-y; }
			#controls { position: absolute; inset: 0; touch-action: none; }
			#joystick { position: absolute; left: 20px; top: 20px; width: 120px; height: 120px; }
			button { position: absolute; left: 300px; width: 100px; height: 60px; }
			#run { top: 20px; } #jump { top: 110px; }
		</style>
		<div id="shell"><div id="controls">
			<div id="joystick"></div>
			<button id="run" data-count="0">Run</button>
			<button id="jump" data-count="0">Jump</button>
		</div></div>
	`);
	await page.addScriptTag({
		type: 'module',
		content: `${actionJs}
		preventTouchPageZoom(document.querySelector('#shell'), true);
		for (const button of document.querySelectorAll('button')) {
			touchButton(button, () => { button.dataset.count = String(Number(button.dataset.count) + 1); });
		}
		const joystick = document.querySelector('#joystick');
		joystick.addEventListener('pointerdown', (event) => {
			event.preventDefault();
			joystick.dataset.pointer = String(event.pointerId);
			joystick.setPointerCapture(event.pointerId);
		});
		joystick.addEventListener('pointerup', () => { delete joystick.dataset.pointer; });
		joystick.addEventListener('pointercancel', () => { delete joystick.dataset.pointer; });
		document.body.dataset.ready = 'true';
	`
	});
	await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
});

test('activates Jump and Run while the joystick remains held', async ({ page, browserName }) => {
	const run = page.locator('#run');
	const jump = page.locator('#jump');
	if (browserName === 'chromium') {
		const session = await page.context().newCDPSession(page);
		const joystick = { x: 60, y: 60, id: 1 };
		await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [joystick] });
		for (const [button, y] of [
			[run, 50],
			[jump, 140],
			[jump, 140]
		] as const) {
			await session.send('Input.dispatchTouchEvent', {
				type: 'touchStart',
				touchPoints: [joystick, { x: 350, y, id: 2 }]
			});
			// Keep the movement finger in motion while the second finger holds a button.
			await session.send('Input.dispatchTouchEvent', {
				type: 'touchMove',
				touchPoints: [
					{ ...joystick, x: 70 },
					{ x: 350, y: y + 2, id: 2 }
				]
			});
			await session.send('Input.dispatchTouchEvent', {
				type: 'touchEnd',
				touchPoints: [{ x: 350, y: y + 2, id: 2 }]
			});
			await expect(button).not.toHaveAttribute('data-count', '0');
			await expect(page.locator('#joystick')).toHaveAttribute('data-pointer', /\d+/);
		}
		await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await session.detach();
	} else {
		// WebKit's automation API cannot inject simultaneous native touches. Check
		// secondary-pointer delivery explicitly, alongside native taps below.
		await page.evaluate(() => {
			const joystick = document.querySelector('#joystick')!;
			joystick.setAttribute('data-pointer', '1');
			for (const id of ['run', 'jump', 'jump']) {
				const button = document.querySelector<HTMLButtonElement>(`#${id}`)!;
				const box = button.getBoundingClientRect();
				const init = {
					pointerId: 2,
					pointerType: 'touch',
					isPrimary: false,
					clientX: box.x + 30,
					clientY: box.y + 30,
					bubbles: true,
					cancelable: true
				};
				button.dispatchEvent(new PointerEvent('pointerdown', init));
				button.dispatchEvent(new PointerEvent('pointerup', init));
			}
		});
		await expect(page.locator('#joystick')).toHaveAttribute('data-pointer', '1');
	}
	await expect(run).toHaveAttribute('data-count', '1');
	await expect(jump).toHaveAttribute('data-count', '2');
});

test('does not double-trigger native taps and retains mouse and keyboard controls', async ({
	page
}) => {
	const jump = page.locator('#jump');
	await jump.tap();
	await expect(jump).toHaveAttribute('data-count', '1');
	await jump.click();
	await expect(jump).toHaveAttribute('data-count', '2');
	await jump.focus();
	await page.keyboard.press('Enter');
	await expect(jump).toHaveAttribute('data-count', '3');
});
