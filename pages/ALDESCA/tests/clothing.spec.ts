import { test, expect, type Page } from '@playwright/test';
import { clothingProducts } from '../src/lib/catalogue';

const open = async (page: Page, url: string) => { await page.goto(url); await page.locator('[data-shop-ready=true]').waitFor(); };
const close = async (page: Page) => page.getByRole('button', { name: 'Close dialog' }).click();
const fits = async (page: Page) => {
  const overflow = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('header *, main *, footer *, dialog[open] *')).filter(el => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (!rect.width || !rect.height || el.closest('.sr-only') || style.display === 'contents') return false;
    return rect.left < -1 || rect.right > innerWidth + 1 || (style.display !== 'inline' && el.scrollWidth > el.clientWidth + 3);
  }).map(el => `${el.tagName}.${el.className}`));
  expect(overflow).toEqual([]);
};

test('departments, clothing categories and search link to the correct collection', async ({ page }) => {
  await open(page, '/');
  await expect(page.locator('.product-card')).toHaveCount(4);
  await page.getByRole('navigation', { name: 'Departments', exact: true }).getByRole('link', { name: 'Clothing', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('wardrobe');
  await expect(page.locator('.product-card')).toHaveCount(8);
  for (const [name, count] of [['Womenswear', 3], ['Menswear', 3], ['Accessories', 2], ['New In', 3], ['All clothing', 8]] as const) {
    await page.getByRole('navigation', { name: 'Filter clothing' }).getByRole('link', { name, exact: true }).click();
    await expect(page.locator('.product-card')).toHaveCount(count);
    await page.reload();
    await page.locator('[data-shop-ready=true]').waitFor();
    await expect(page.locator('.product-card')).toHaveCount(count);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  }
  await page.getByRole('button', { name: 'Search the collection', exact: true }).click();
  await page.getByRole('searchbox').fill('coat');
  await expect(page.locator('.search-result')).toHaveCount(1);
  await page.getByRole('link', { name: /The Tailored Coat Womenswear/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Tailored Coat');
  await expect(page.locator('.departments a.current')).toHaveText('Clothing');
  await expect(page.locator('.related .product-card')).toHaveCount(3);
  await expect(page.locator('.related')).not.toContainText('Halo Pendant');
});

test('size selection, separate variants, mixed department bag and persistence', async ({ page }) => {
  await open(page, '/products/the-tailored-coat/');
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Please select a size before adding to your bag.');
  await expect(page.locator('.sizes')).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('radio', { name: 'UK 10', exact: true }).check();
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(page.locator('.line-finish')).toHaveText('Camel · UK 10');
  await close(page);
  await page.getByRole('radio', { name: 'UK 12', exact: true }).check();
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(page.locator('.bag-line')).toHaveCount(2);
  await close(page);
  await open(page, '/products/sculptural-ceramic-vase/');
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(page.locator('.subtotal')).toHaveText('Subtotal£675');
  await close(page);
  await page.reload();
  await page.getByRole('button', { name: 'Shopping bag, 3 items' }).click();
  await expect(page.locator('.bag-line')).toHaveCount(3);
  await page.getByRole('button', { name: 'Increase the tailored coat uk 10 quantity', exact: true }).click();
  await expect(page.locator('.subtotal')).toHaveText('Subtotal£970');
  await page.getByRole('button', { name: 'Remove The Tailored Coat camel UK 12 from bag' }).click();
  await expect(page.locator('.subtotal')).toHaveText('Subtotal£675');
  await expect(page.locator('.bag-line')).toHaveCount(2);
  await expect(page.locator('.line-finish').first()).toHaveText('Camel · UK 10');
  await close(page);
  await open(page, '/products/the-sculpted-shoulder-bag/');
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(page.locator('.subtotal')).toHaveText('Subtotal£840');
});

test('stored sizes are validated without losing existing homeware selections', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('aldesca:store:v1', JSON.stringify({ version: 1, cart: [
    { productId: 'halo', finishId: 'dark', quantity: 1 },
    { productId: 'coat', finishId: 'camel', quantity: 1, size: 'UK 10' },
    { productId: 'coat', finishId: 'camel', quantity: 2, size: 'UK 10' },
    { productId: 'coat', finishId: 'camel', quantity: 1, size: 'UK 12' },
    { productId: 'coat', finishId: 'camel', quantity: 1, size: 'invalid' },
    { productId: 'coat', finishId: 'camel', quantity: 1 },
    { productId: 'halo', finishId: 'dark', quantity: 1, size: 'UK 10' }
  ], wishlist: ['coat', 'halo'] })));
  await open(page, '/clothing/');
  await page.getByRole('button', { name: 'Shopping bag, 5 items' }).click();
  await expect(page.locator('.bag-line')).toHaveCount(3);
  await expect(page.locator('.subtotal')).toHaveText('Subtotal£1,505');
});

test('all clothing pages and images work from 280px to wide desktop', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const routes = ['/clothing/', '/clothing/?category=womenswear', ...clothingProducts.map(p => `/products/${p.slug}/`)];
  for (const width of [280, 320, 390, 700, 701, 850, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    for (const route of routes) {
      await open(page, route);
      await page.evaluate(() => document.fonts.ready);
      await fits(page);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await page.locator('footer').scrollIntoViewIfNeeded();
      await page.evaluate(async () => { await Promise.all([...document.images].map(img => { img.loading = 'eager'; return img.decode(); })); });
      expect(await page.locator('img').evaluateAll(images => images.every(img => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
    }
  }
  expect(errors).toEqual([]);
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, name] of [['/clothing/', 'clothing'], ['/products/the-tailored-coat/', 'clothing-product']]) {
      await open(page, route);
      await page.locator('footer').scrollIntoViewIfNeeded();
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => { img.loading = 'eager'; return img.decode(); })); });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `docs/screenshots/${name}-${width}.png`, fullPage: true });
    }
  }
});

test.describe('clothing on a slim touch phone', () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  test('left-hand menu, sizing, wishlist and bag are usable', async ({ page }) => {
    await open(page, '/');
    await page.getByRole('button', { name: 'Open menu' }).tap();
    const menu = page.getByRole('dialog', { name: 'Explore ALDESCA' });
    expect((await menu.boundingBox())!.x).toBe(0);
    await menu.getByRole('link', { name: 'Clothing', exact: true }).tap();
    await fits(page);
    await page.getByRole('link', { name: 'View The Tailored Coat', exact: true }).tap();
    await page.getByRole('radio', { name: 'UK 10', exact: true }).check();
    await page.getByRole('button', { name: 'Save to wishlist', exact: true }).tap();
    await page.getByRole('button', { name: 'Add to bag', exact: true }).tap();
    await fits(page);
    await expect(page.locator('.line-finish')).toHaveText('Camel · UK 10');
    await page.setViewportSize({ width: 320, height: 320 });
    await expect(page.getByRole('button', { name: 'Close dialog' })).toBeInViewport();
    await close(page);
    await page.getByRole('button', { name: 'Open menu' }).tap();
    await page.getByRole('button', { name: 'Wishlist (1)' }).tap();
    await expect(page.getByRole('dialog', { name: 'Your wishlist' })).toContainText('The Tailored Coat');
    await fits(page);
  });
});
