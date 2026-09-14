import { expect, test, type Page } from '@playwright/test';
import {
	createAndEnterWorld,
	openSettingsMenu,
	openWorldNamed,
	waitForSaved
} from './worldHelpers';

/** The slice of the running scene these tests reach into (types only — erased before evaluate runs). */
interface InstanceView {
	id: string;
	designId: string;
	position: { x: number; y: number; z: number };
	rotationY: number;
}
interface DefinitionView {
	id: string;
	name: string;
	revision: number;
	blocks: unknown[];
}
interface TestScene {
	controller: {
		worldPosition: { x: number; y: number; z: number };
		restoreState(position: { x: number; y: number; z: number }, yaw: number, pitch: number): void;
	};
	miniBuilds: {
		instances: {
			count: number;
			getAll(): InstanceView[];
			get(id: string): InstanceView | undefined;
			getChunkOf(id: string): string | undefined;
			getBatches(): { count: number }[];
		};
		library: { size: number; list(): DefinitionView[] };
		getDesign(id: string): DefinitionView | undefined;
		budget: { getPrimitiveUsage(chunkId: string): number };
		cache: { compileCount: number; refCount(definition: DefinitionView): number };
	};
	placeObjectTool: {
		getPreview(): { valid: boolean; reason: string | null } | null;
		getTargetInstanceId(): string | null;
		getSelection(): { type: string; designId?: string };
	};
	triggerPrimaryAction(): void;
}
type TestWindow = Window & { __forestSession: { scene: TestScene } };

async function aimAtGround(page: Page, offsetX: number): Promise<void> {
	await page.evaluate((dx) => {
		const scene = (window as unknown as TestWindow).__forestSession.scene;
		const p = scene.controller.worldPosition;
		scene.controller.restoreState({ x: dx, y: p.y, z: 0 }, 0, -0.8);
	}, offsetX);
	await expect
		.poll(
			() =>
				page.evaluate(
					() =>
						(window as unknown as TestWindow).__forestSession.scene.placeObjectTool.getPreview()
							?.valid ?? false
				),
			{
				timeout: 10_000
			}
		)
		.toBe(true);
}

async function aimAtInstance(page: Page, instanceId: string): Promise<void> {
	await page.evaluate((id) => {
		const scene = (window as unknown as TestWindow).__forestSession.scene;
		const instance = scene.miniBuilds.instances.get(id)!;
		const eye = instance.position.y + 1.7;
		scene.controller.restoreState(
			{ x: instance.position.x, y: eye, z: instance.position.z + 2 },
			0,
			Math.atan2(instance.position.y + 0.4 - eye, 2)
		);
	}, instanceId);
}

async function instances(page: Page): Promise<InstanceView[]> {
	return page.evaluate(() =>
		(window as unknown as TestWindow).__forestSession.scene.miniBuilds.instances
			.getAll()
			.map((i) => ({ ...i }))
	);
}

async function setNumber(page: Page, testId: string, value: string): Promise<void> {
	const input = page.getByTestId(testId);
	await input.fill(value);
	await input.press('Enter');
}

test('builds a Mini Build, places copies, saves, reloads and makes one copy unique', async ({
	page
}) => {
	test.setTimeout(180_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Mini Build World', seed: 'mini-build-seed' });

	// 1–4: 8 → E → Create New → editor
	await page.keyboard.press('8');
	await expect(page.getByTestId('hotbar-slot-place-object')).toHaveClass(/active/);
	await page.keyboard.press('e');
	await expect(page.getByTestId('object-library-modal')).toBeVisible();
	await page.getByTestId('mini-build-create-new').click();
	await expect(page.getByTestId('mini-build-editor')).toBeVisible();
	await expect(page.getByTestId('object-library-modal')).toBeHidden();

	// 5–9: add, resize to a snapped value, duplicate, move, second material
	await page.getByTestId('mini-build-add').click();
	await expect(page.getByTestId('mini-build-block-count')).toHaveText('1 / 16');
	await setNumber(page, 'mini-build-size-x', '0.3');
	await expect(page.getByTestId('mini-build-size-x')).toHaveValue('0.3125');
	await page.getByTestId('mini-build-duplicate').click();
	await expect(page.getByTestId('mini-build-block-count')).toHaveText('2 / 16');
	await setNumber(page, 'mini-build-pos-y', '0.5');
	await expect(page.getByTestId('mini-build-pos-y')).toHaveValue('0.5');
	await page.getByTestId('mini-build-add-material').click();
	await expect(page.getByTestId('mini-build-material-count')).toHaveText('2 / 4');
	await page.getByTestId('mini-build-block-material').selectOption('1');

	// 10–12: Save as "Test Chair" → back in the world with a ghost
	await page.getByTestId('mini-build-save').click();
	await page.getByTestId('mini-build-name-input').fill('Test Chair');
	await page.getByTestId('mini-build-name-confirm').click();
	await expect(page.getByTestId('mini-build-editor')).toBeHidden();
	await expect(page.getByTestId('build-hud')).toContainText('Test Chair');
	await aimAtGround(page, 0);

	// 13: place first copy
	await page.evaluate(() =>
		(window as unknown as TestWindow).__forestSession.scene.triggerPrimaryAction()
	);
	await expect.poll(async () => (await instances(page)).length).toBe(1);
	const [first] = await instances(page);

	// 14–15: Copy the placed object, place a second copy
	await page.evaluate(() => {
		const scene = (window as unknown as TestWindow).__forestSession.scene;
		(scene as unknown as { selectPlaceObject(selection: unknown): void }).selectPlaceObject({
			type: 'default-design',
			defaultId: 'default-bed'
		});
	});
	await aimAtInstance(page, first.id);
	await expect
		.poll(() =>
			page.evaluate(() =>
				(
					window as unknown as TestWindow
				).__forestSession.scene.placeObjectTool.getTargetInstanceId()
			)
		)
		.toBe(first.id);
	await page.keyboard.press('c');
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as TestWindow).__forestSession.scene.placeObjectTool.getSelection()
						.designId
			)
		)
		.toBe(first.designId);
	await aimAtGround(page, 3);
	const compilesBeforeSecond = await page.evaluate(
		() => (window as unknown as TestWindow).__forestSession.scene.miniBuilds.cache.compileCount
	);
	await page.evaluate(() =>
		(window as unknown as TestWindow).__forestSession.scene.triggerPrimaryAction()
	);
	await expect.poll(async () => (await instances(page)).length).toBe(2);
	const placed = await instances(page);
	expect(new Set(placed.map((i) => i.designId)).size).toBe(1);
	expect(
		await page.evaluate(
			() => (window as unknown as TestWindow).__forestSession.scene.miniBuilds.library.size
		)
	).toBe(1);
	expect(
		await page.evaluate(
			() => (window as unknown as TestWindow).__forestSession.scene.miniBuilds.cache.compileCount
		)
	).toBe(compilesBeforeSecond);

	// 16–17: save, reload, both instances exist with the same design and transforms
	await page.keyboard.press('ControlOrMeta+s');
	await waitForSaved(page);
	await page.reload();
	await openWorldNamed(page, 'Mini Build World');
	await expect.poll(async () => (await instances(page)).length, { timeout: 20_000 }).toBe(2);
	const reloaded = await instances(page);
	expect(reloaded.map((i) => [i.id, i.designId, i.position, i.rotationY]).sort()).toEqual(
		placed.map((i) => [i.id, i.designId, i.position, i.rotationY]).sort()
	);

	// 18–21: Edit → Make Unique from one instance → change it → the other copy is unchanged
	await page.keyboard.press('8');
	await aimAtInstance(page, first.id);
	await expect
		.poll(() =>
			page.evaluate(() =>
				(
					window as unknown as TestWindow
				).__forestSession.scene.placeObjectTool.getTargetInstanceId()
			)
		)
		.toBe(first.id);
	await page.keyboard.press('f');
	await expect(page.getByTestId('mini-build-edit-choice')).toBeVisible();
	await page.getByTestId('mini-build-make-unique').click();
	await expect(page.getByTestId('mini-build-editor')).toBeVisible();
	await page.getByTestId('mini-build-add').click();
	await expect(page.getByTestId('mini-build-block-count')).toHaveText('3 / 16');
	await page.getByTestId('mini-build-save').click();
	await expect(page.getByTestId('mini-build-editor')).toBeHidden();

	const after = await page.evaluate(
		([firstId, originalDesign]) => {
			const scene = (window as unknown as TestWindow).__forestSession.scene;
			const firstInstance = scene.miniBuilds.instances.get(firstId)!;
			const other = scene.miniBuilds.instances.getAll().find((i) => i.id !== firstId)!;
			return {
				firstDesign: firstInstance.designId,
				firstBlocks: scene.miniBuilds.getDesign(firstInstance.designId)!.blocks.length,
				otherDesign: other.designId,
				otherBlocks: scene.miniBuilds.getDesign(other.designId)!.blocks.length,
				originalRevision: scene.miniBuilds.getDesign(originalDesign)!.revision
			};
		},
		[first.id, first.designId] as const
	);
	expect(after.firstDesign).not.toBe(first.designId);
	expect(after.firstBlocks).toBe(3);
	expect(after.otherDesign).toBe(first.designId);
	expect(after.otherBlocks).toBe(2);
	expect(after.originalRevision).toBe(1);

	expect(pageErrors).toEqual([]);
});

test('the editor enforces the 16-block limit, the 4m bounds, the 0.0625m grid and planes', async ({
	page
}) => {
	test.setTimeout(120_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Limits World', seed: 'limits-seed' });
	await page.keyboard.press('8');
	await page.keyboard.press('e');
	await page.getByTestId('mini-build-create-new').click();
	await expect(page.getByTestId('mini-build-editor')).toBeVisible();

	await page.getByTestId('mini-build-add').click();
	for (const axis of ['x', 'y', 'z']) await setNumber(page, `mini-build-size-${axis}`, '0.125');

	// Non-grid values snap.
	await setNumber(page, 'mini-build-pos-y', '0.44');
	await expect(page.getByTestId('mini-build-pos-y')).toHaveValue('0.4375');
	await setNumber(page, 'mini-build-pos-y', '0');

	// Size 0 on one axis makes a two-sided plane; a second flat axis is refused.
	await setNumber(page, 'mini-build-size-y', '0');
	await expect(page.getByTestId('mini-build-size-y')).toHaveValue('0');
	await expect(page.getByTestId('mini-build-block-0')).toContainText('Plane 1');
	await expect(page.getByTestId('mini-build-plane-hint')).toContainText('two-sided plane');
	await setNumber(page, 'mini-build-size-x', '0');
	await expect(page.getByTestId('mini-build-message')).toContainText('only one axis');
	await expect(page.getByTestId('mini-build-size-x')).toHaveValue('0.125');
	await setNumber(page, 'mini-build-size-y', '0.125');
	await expect(page.getByTestId('mini-build-block-0')).toContainText('Block 1');

	// Beyond the build area is rejected and the field shows the stored value again.
	await setNumber(page, 'mini-build-pos-x', '5');
	await expect(page.getByTestId('mini-build-message')).toBeVisible();
	await expect(page.getByTestId('mini-build-pos-x')).not.toHaveValue('5');

	// Two blocks further apart than 4m are rejected.
	await setNumber(page, 'mini-build-pos-x', '-2');
	await page.getByTestId('mini-build-duplicate').click();
	await setNumber(page, 'mini-build-pos-x', '2');
	await expect(page.getByTestId('mini-build-message')).toContainText('4m');
	await expect(page.getByTestId('mini-build-pos-x')).not.toHaveValue('2');

	// 17th block.
	for (let i = 2; i < 16; i++) await page.getByTestId('mini-build-duplicate').click();
	await expect(page.getByTestId('mini-build-block-count')).toHaveText('16 / 16');
	await expect(page.getByTestId('mini-build-add')).toBeDisabled();
	await expect(page.getByTestId('mini-build-add')).toHaveText('16 / 16');
	await page.getByTestId('mini-build-editor-canvas').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('n');
	await page.keyboard.press('ControlOrMeta+d');
	await expect(page.getByTestId('mini-build-block-count')).toHaveText('16 / 16');

	expect(pageErrors).toEqual([]);
});

test('Remove Mode removes one copy, reclaims budget and keeps the design', async ({ page }) => {
	test.setTimeout(120_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Remove World', seed: 'remove-seed' });
	await page.keyboard.press('8');
	await page.keyboard.press('e');
	await page
		.locator('[data-testid="mini-build-card"][data-name="Chair"] [data-testid="mini-build-place"]')
		.click();
	await expect(page.getByTestId('object-library-modal')).toBeHidden();

	await aimAtGround(page, 0);
	await page.evaluate(() =>
		(window as unknown as TestWindow).__forestSession.scene.triggerPrimaryAction()
	);
	await aimAtGround(page, 3);
	await page.evaluate(() =>
		(window as unknown as TestWindow).__forestSession.scene.triggerPrimaryAction()
	);
	await expect.poll(async () => (await instances(page)).length).toBe(2);
	const [victim, survivor] = await instances(page);
	const chunk = await page.evaluate(
		(id) =>
			(window as unknown as TestWindow).__forestSession.scene.miniBuilds.instances.getChunkOf(id)!,
		victim.id
	);
	const usageBefore = await page.evaluate(
		(c) =>
			(window as unknown as TestWindow).__forestSession.scene.miniBuilds.budget.getPrimitiveUsage(
				c
			),
		chunk
	);

	await page.keyboard.press('x');
	await aimAtInstance(page, victim.id);
	await expect(page.getByTestId('build-hud')).toContainText('REMOVE CHAIR');
	await page.evaluate(() =>
		(window as unknown as TestWindow).__forestSession.scene.triggerPrimaryAction()
	);
	await expect.poll(async () => (await instances(page)).length).toBe(1);

	const state = await page.evaluate(
		([c, designId, survivorId]) => {
			const scene = (window as unknown as TestWindow).__forestSession.scene;
			const design = scene.miniBuilds.getDesign(designId)!;
			return {
				usage: scene.miniBuilds.budget.getPrimitiveUsage(c),
				designExists: !!design,
				blocks: design.blocks.length,
				survivorExists: !!scene.miniBuilds.instances.get(survivorId),
				refs: scene.miniBuilds.cache.refCount(design),
				batches: scene.miniBuilds.instances.getBatches().map((b) => b.count)
			};
		},
		[chunk, victim.designId, survivor.id] as const
	);
	expect(state.designExists).toBe(true);
	expect(state.survivorExists).toBe(true);
	expect(state.usage).toBe(usageBefore - state.blocks);
	expect(state.refs).toBeGreaterThanOrEqual(1);
	expect(state.batches).toEqual([1]);
	expect(pageErrors).toEqual([]);
});

test('shows chunk primitive usage in normal view and while placing, and toggles chunk boundaries from settings', async ({
	page
}) => {
	test.setTimeout(120_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await page.evaluate(() => localStorage.removeItem('forest-drift.mini-builds.prefs.v1'));
	await createAndEnterWorld(page, { name: 'Chunk Readout World', seed: 'chunk-readout-seed' });

	// Normal view: the counter for the chunk the player is standing in.
	const usage = page.getByTestId('mini-build-chunk-usage');
	await expect(usage).toBeVisible();
	await expect(page.getByTestId('mini-build-chunk-value')).toContainText('0');
	await expect(page.getByTestId('mini-build-chunk-value')).toContainText('512');

	// While building: the target chunk plus what the object adds, in the HUD and the counter.
	await page.keyboard.press('8');
	await page.keyboard.press('e');
	await page
		.locator('[data-testid="mini-build-card"][data-name="Chair"] [data-testid="mini-build-place"]')
		.click();
	await aimAtGround(page, 0);
	await expect(usage).toContainText('Placing here');
	await expect(page.getByTestId('mini-build-chunk-value')).toContainText('+8');
	await expect(page.getByTestId('build-hud')).toContainText('Area detail: 0 + 8 / 512 primitives');
	await page.evaluate(() =>
		(window as unknown as TestWindow).__forestSession.scene.triggerPrimaryAction()
	);
	await expect(page.getByTestId('build-hud')).toContainText('Area detail: 8 + 8 / 512 primitives');

	// Settings → Mini Builds → Show Mini Build chunk boundaries.
	await expect(page.locator('.mini-build-chunk-marker')).toHaveCount(0);
	await openSettingsMenu(page);
	await page.getByTestId('settings-nav-mini-builds').click();
	await page
		.getByTestId('settings-field-mini-builds.display.boundaries')
		.locator('input[type="checkbox"]')
		.click();
	await page.getByTestId('settings-close').click();
	await page.getByTestId('pause-resume').click();
	await expect(page.getByTestId('mini-build-chunk-labels')).toBeAttached();
	await expect
		.poll(() => page.locator('.mini-build-chunk-marker[data-level]').count())
		.toBeGreaterThan(0);
	await expect(page.locator('.mini-build-chunk-marker').filter({ hasText: '8 / 512' })).toHaveCount(
		1
	);

	expect(pageErrors).toEqual([]);
});
