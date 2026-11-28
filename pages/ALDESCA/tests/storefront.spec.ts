import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

const open = async (page: Page, url: string) => { await page.goto(url); await page.locator('[data-shop-ready=true]').waitFor(); };
const closeDialog = (page: Page) => page.getByRole('button', { name: 'Close dialog' }).click();
const ready = async (page: Page) => page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all(Array.from(document.images).map(image => { image.loading = 'eager'; return image.decode(); }));
});

test('cart arithmetic, finish identity, quantities, removals and persistence', async ({ page }) => {
  await open(page, '/products/halo-pendant-light/');
  await expect(page.getByRole('button', { name: 'Decrease quantity', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Increase quantity', exact: true }).click();
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  const bag = page.getByRole('dialog', { name: 'Your bag', exact: true });
  await expect(bag.locator('.subtotal')).toHaveText('Subtotal£650');
  await closeDialog(page);
  await open(page, '/products/sculptural-ceramic-vase/');
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(bag.locator('.subtotal')).toHaveText('Subtotal£735');
  await expect(page.getByRole('button', { name: 'Shopping bag, 3 items' })).toHaveCount(1);
  await closeDialog(page);
  await page.reload();
  await page.getByRole('button', { name: 'Shopping bag, 3 items' }).click();
  await expect(bag.locator('.subtotal')).toHaveText('Subtotal£735');
  await bag.getByRole('button', { name: 'Increase halo pendant light quantity' }).click();
  await expect(bag.locator('.subtotal')).toHaveText('Subtotal£1,060');
  await bag.getByRole('button', { name: 'Remove Sculptural Ceramic Vase chalk from bag' }).click();
  await expect(bag.locator('.subtotal')).toHaveText('Subtotal£975');
  await closeDialog(page);
  await open(page, '/products/halo-pendant-light/');
  await page.getByRole('radio', { name: 'Light neutral', exact: true }).check();
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(bag.locator('.bag-line')).toHaveCount(2);
  await expect(bag.locator('.subtotal')).toHaveText('Subtotal£1,300');
  await closeDialog(page);
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(bag.locator('.bag-line')).toHaveCount(2);
  await expect(bag.locator('.subtotal')).toHaveText('Subtotal£1,625');
  await bag.getByRole('button', { name: 'Checkout', exact: true }).click();
  await expect(bag.getByRole('status')).toContainText('no order has been placed');
});

test('navigation, gallery, wishlist sync, search and honest newsletter outcome', async ({ page }) => {
  await open(page, '/');
  await page.getByRole('button', { name: 'Save Halo Pendant Light to wishlist', exact: true }).click();
  await page.reload();
  await page.locator('[data-shop-ready=true]').waitFor();
  await expect(page.getByRole('button', { name: 'Wishlist, 1 saved products' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Remove Halo Pendant Light from wishlist', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'View Halo Pendant Light', exact: true }).click();
  await expect(page).toHaveURL(/products\/halo-pendant-light\/$/);
  await expect(page.getByRole('button', { name: 'Saved to wishlist', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Dark fitting detail', exact: true }).click();
  await expect(page.locator('.main-photo img')).toHaveAttribute('src', /halo-fitting-detail/);
  await page.getByRole('button', { name: 'Zoom Halo Pendant Light image' }).click();
  await expect(page.getByRole('dialog', { name: /Halo Pendant Light/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Zoom Halo Pendant Light image' })).toBeFocused();
  await page.getByText('Dimensions & care', { exact: true }).click();
  await expect(page.getByText('Dimensions and care instructions have not yet been supplied.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Wishlist, 1 saved products' }).click();
  await page.getByRole('button', { name: 'Remove Halo Pendant Light from wishlist', exact: true }).click();
  await expect(page.getByText('Keep your favourites close.')).toBeVisible();
  await closeDialog(page);
  await expect(page.getByRole('button', { name: 'Save to wishlist', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Search the collection', exact: true }).click();
  await page.getByRole('searchbox').fill('lighting');
  await expect(page.locator('.search-result')).toHaveCount(2);
  await page.getByRole('searchbox').fill('no-such-piece');
  await expect(page.getByText('Nothing here just yet.')).toBeVisible();
  await page.getByRole('searchbox').fill('Arc');
  await page.getByRole('link', { name: /Arc Table Lamp Lighting/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Arc Table Lamp');
  await expect(page.getByRole('spinbutton', { name: 'Quantity', exact: true })).toHaveValue('1');
  await page.getByRole('link', { name: 'ALDESCA home' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A considered');
  await page.getByLabel('Newsletter', { exact: true }).fill('invalid');
  await page.getByRole('button', { name: 'Submit newsletter email' }).click();
  await expect(page.locator('#newsletter-status')).toContainText('valid email');
  await page.getByLabel('Newsletter', { exact: true }).fill('hello@example.com');
  await page.getByRole('button', { name: 'Submit newsletter email' }).click();
  await expect(page.locator('#newsletter-status')).toContainText('not been subscribed or saved');
  await expect(page.getByLabel('Newsletter', { exact: true })).toHaveValue('');
});

test('restores only valid persisted data and survives corrupted or blocked storage', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('aldesca:store:v1', JSON.stringify({ version: 1, cart: [
      { productId: 'halo', finishId: 'dark', quantity: 2 },
      { productId: 'halo', finishId: 'dark', quantity: 1 },
      { productId: 'vase', finishId: 'unknown', quantity: 1 },
      { productId: 'missing', finishId: 'dark', quantity: 1 },
      { productId: 'vase', finishId: 'chalk', quantity: -2 },
      { productId: 'vase', finishId: 'chalk', quantity: 1.2 },
      null
    ], wishlist: ['halo', 'halo', 'missing', 3] }));
  });
  await open(page, '/');
  await page.getByRole('button', { name: 'Shopping bag, 3 items' }).click();
  await expect(page.locator('.bag-line')).toHaveCount(1);
  await expect(page.locator('.subtotal')).toHaveText('Subtotal£975');
  await closeDialog(page);
  await expect(page.getByRole('button', { name: 'Wishlist, 1 saved products' })).toHaveCount(1);
  const broken = await page.context().newPage();
  await broken.addInitScript(() => localStorage.setItem('aldesca:store:v1', '{broken-json'));
  await open(broken, '/');
  await expect(broken.getByRole('button', { name: 'Shopping bag, 0 items' })).toHaveCount(1);
  await broken.close();
  const blocked = await page.context().newPage();
  await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }));
  await open(blocked, '/products/halo-pendant-light/');
  await blocked.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(blocked.locator('.subtotal')).toHaveText('Subtotal£325');
  await blocked.close();
});

test('category routes, focus containment and responsive reference captures', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || /hydration/i.test(message.text())) errors.push(message.text()); });
  await fs.mkdir('docs/screenshots', { recursive: true });
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, name] of [['/', 'homepage'], ['/products/halo-pendant-light/', 'halo']]) {
      await open(page, route); await ready(page);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(await page.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
      if (width === 1024 || width === 390) await page.screenshot({ path: `docs/screenshots/${name}-${width === 1024 ? 'desktop' : 'mobile'}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Explore ALDESCA' });
  await expect(menu).toBeVisible();
  for (let index = 0; index < 14; index++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.querySelector('dialog[open]')?.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeFocused();
  for (const [category, count] of [['lighting', 2], ['tables', 1], ['furniture', 1], ['homeware', 1], ['new-in', 2]] as const) {
    await open(page, `/shop/?category=${category}`);
    await expect(page.locator('.product-card')).toHaveCount(count);
    await page.reload();
    await expect(page.locator('.product-card')).toHaveCount(count);
  }
  expect(errors).toEqual([]);
});
