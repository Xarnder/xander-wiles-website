import { expect, test } from '@playwright/test';

test('important task marks double check, animated border, extra bold, and pulses background during run', async ({
	page
}) => {
	await page.goto('./');
	await expect(page.getByRole('heading', { name: 'Your routines' })).toBeVisible();

	// Create a new routine
	await page.getByTestId('create-routine').click();
	await expect(page.getByRole('heading', { name: 'Create routine' })).toBeVisible();

	await page.getByTestId('routine-name').fill('Safety & Health Checklist');
	await page.getByTestId('add-task').click();
	await page.getByTestId('add-task').click();

	const titles = page.locator('[data-testid="task-list"] input');
	await titles.nth(0).fill('Drink water');
	await titles.nth(1).fill('Turn off the oven and lock the door');

	// Mark Task 2 as important via quick-toggle button
	await page.getByTestId('quick-toggle-important-1').click();

	// Check that important badge appears on Task 2
	await expect(page.getByTestId(/task-important-badge-/)).toBeVisible();
	await expect(page.getByTestId('quick-toggle-important-1')).toHaveClass(/is-active/);

	// Toggle overview to check the compact overview also marks important tasks
	await page.getByTestId('task-overview-toggle').click();
	await expect(page.getByTestId('task-overview')).toBeVisible();
	await expect(page.locator('.overview-important')).toBeVisible();

	// Switch back to edit mode and verify unmark/mark via menu works as well
	await page.getByTestId('task-overview-toggle').click();
	await page.getByTestId('task-menu-0').click();
	await page.getByTestId('toggle-task-important-0').click();
	await expect(page.getByTestId('quick-toggle-important-0')).toHaveClass(/is-active/);

	// Unmark Task 1 via menu
	await page.getByTestId('task-menu-0').click();
	await page.getByTestId('toggle-task-important-0').click();
	await expect(page.getByTestId('quick-toggle-important-0')).not.toHaveClass(/is-active/);

	// Save the routine
	await page.getByTestId('save-routine').click();
	await expect(page.getByTestId('routine-list')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Safety & Health Checklist' })).toBeVisible();

	// Start the routine fresh
	await page.getByRole('button', { name: /Start Safety & Health Checklist fresh/i }).click();
	await expect(page.getByTestId('run-screen')).toBeVisible();

	// Task 1: "Drink water" is normal (not important)
	await expect(page.getByRole('heading', { name: 'Drink water' })).toBeVisible();
	await expect(page.getByTestId('run-screen')).not.toHaveClass(/run-important/);
	await expect(page.getByTestId('important-marker')).toHaveCount(0);
	await expect(page.getByTestId('task-title-frame')).not.toHaveClass(/has-animated-border/);
	await expect(page.getByTestId('double-check-badge')).toHaveCount(0);

	// Complete Task 1 to move to Task 2 ("Turn off the oven and lock the door")
	await page.getByTestId('complete-task').click();

	// Task 2: Important task
	await expect(page.getByRole('heading', { name: 'Turn off the oven and lock the door' })).toBeVisible();
	const runScreen = page.getByTestId('run-screen');
	await expect(runScreen).toHaveClass(/run-important/);
	await expect(runScreen).toHaveAttribute('data-important', 'true');

	// Special important marker is displayed
	const importantMarker = page.getByTestId('important-marker');
	await expect(importantMarker).toBeVisible();
	await expect(importantMarker).toContainText('Important Task');
	await expect(importantMarker).toContainText('Double check required');

	// Animated border around title
	const titleFrame = page.getByTestId('task-title-frame');
	await expect(titleFrame).toBeVisible();
	await expect(titleFrame).toHaveClass(/has-animated-border/);

	// Double check badge
	const doubleCheckBadge = page.getByTestId('double-check-badge');
	await expect(doubleCheckBadge).toBeVisible();
	await expect(doubleCheckBadge).toContainText('Double Check');

	// Extra bold font
	const title = titleFrame.getByRole('heading');
	const fontWeight = await title.evaluate((el) => window.getComputedStyle(el).fontWeight);
	expect(Number(fontWeight)).toBeGreaterThanOrEqual(800);

	// Toggle theme during run to verify light mode pulse support
	const themeToggle = page.getByTestId('theme-toggle');
	// Current theme is dark, switch to OLED, then to light mode
	await themeToggle.click(); // OLED
	await themeToggle.click(); // Light
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	await expect(runScreen).toHaveClass(/run-important/);

	// Complete the important task
	await page.getByTestId('complete-task').click();
	await expect(page.getByTestId('routine-summary')).toBeVisible();
	await expect(page.getByTestId('summary-complete')).toContainText('2');
});

test('editing an existing routine and marking task as important persists on save', async ({ page }) => {
	await page.goto('./');
	await page.getByTestId('create-routine').click();

	await page.getByTestId('routine-name').fill('Persistence Check');
	await page.getByTestId('add-task').click();

	const input = page.locator('[data-testid="task-list"] input').first();
	await input.fill('Important Check Task');

	// Save routine without important first
	await page.getByTestId('save-routine').click();
	await expect(page.getByRole('heading', { name: 'Persistence Check' })).toBeVisible();

	// Open Edit page
	await page
		.locator('article')
		.filter({ hasText: 'Persistence Check' })
		.getByRole('link', { name: 'Edit' })
		.click();
	await expect(page.getByRole('heading', { name: 'Edit routine' })).toBeVisible();

	// Verify initially not important
	await expect(page.getByTestId('quick-toggle-important-0')).not.toHaveClass(/is-active/);

	// Mark as important
	await page.getByTestId('quick-toggle-important-0').click();
	await expect(page.getByTestId(/task-important-badge-/)).toBeVisible();
	await expect(page.getByTestId('quick-toggle-important-0')).toHaveClass(/is-active/);

	// Save routine
	await page.getByTestId('save-routine').click();
	await expect(page.getByTestId('routine-list')).toBeVisible();

	// Re-open Edit page to verify persistence
	await page
		.locator('article')
		.filter({ hasText: 'Persistence Check' })
		.getByRole('link', { name: 'Edit' })
		.click();
	await expect(page.getByRole('heading', { name: 'Edit routine' })).toBeVisible();

	// Verify task is still marked important after saving and re-opening
	await expect(page.getByTestId(/task-important-badge-/)).toBeVisible();
	await expect(page.getByTestId('quick-toggle-important-0')).toHaveClass(/is-active/);
});

