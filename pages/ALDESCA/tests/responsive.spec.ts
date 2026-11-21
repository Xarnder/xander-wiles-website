import { test, expect, type Page } from '@playwright/test';

const open = async (page: Page, route: string) => {
  await page.goto(route);
  await page.locator('[data-shop-ready=true]').waitFor();
  await page.evaluate(() => document.fonts.ready);
};

// Check actual content bounds as well as the document: hiding horizontal
// overflow must not conceal a heading, a control, or the end of a product name.
const expectContentFits = async (page: Page) => {
  const overflow = await page.evaluate(() => {
    const root = document.querySelector('dialog[open]') ?? document;
    return Array.from(root.querySelectorAll<HTMLElement>('header *, main *, footer *, .dialog-heading, .dialog-content, .dialog-content *'))
      .filter(element => {
        const style = getComputedStyle(element);
        if (element.closest('.sr-only') || style.display === 'contents') return false;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        return rect.left < -1 || rect.right > innerWidth + 1 ||
          (style.display !== 'inline' && element.scrollWidth > element.clientWidth + 3);
      }).map(element => `${element.tagName}.${element.className}`);
  });
  expect(overflow, `Content overflows at ${page.viewportSize()?.width}px on ${page.url()}`).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
};

test('all storefront pages reflow from slim phones to wide desktop', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const routes = ['/', '/shop/', '/products/halo-pendant-light/', '/products/arc-table-lamp/', '/products/travertine-coffee-table/', '/products/sculptural-ceramic-vase/'];
  for (const width of [280, 320, 360, 390, 480, 700, 701, 850, 851, 900, 901, 1000, 1001, 1024, 1200, 1440, 1920]) {
    await page.setViewportSize({ width, height: 740 });
    for (const route of routes) {
      await open(page, route);
      await expectContentFits(page);
      const header = await page.locator('.header-top').evaluate(element => {
        const [left, logo, right] = Array.from(element.children).map(child => child.getBoundingClientRect());
        return { left: left.right <= logo.left + 1, right: logo.right <= right.left + 1 };
      });
      expect(header).toEqual({ left: true, right: true });
    }
  }
  expect(errors).toEqual([]);
});

test.describe('slim touch phone', () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });

  test('menu, search, wishlist, gallery, finishes and bag remain usable', async ({ page }) => {
    await open(page, '/');
    const touchTargets = page.locator('.header-left .mobile-control:visible, .header-actions .bag, .heart, .swatch, .newsletter button');
    for (const target of await touchTargets.all()) {
      const rect = await target.boundingBox();
      expect(rect!.width).toBeGreaterThanOrEqual(44);
      expect(rect!.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: 'Save Halo Pendant Light to wishlist', exact: true }).tap();
    await page.getByRole('button', { name: 'Open menu' }).tap();
    await expectContentFits(page);
    await page.getByRole('button', { name: 'Wishlist (1)', exact: true }).tap();
    await expect(page.getByRole('dialog', { name: 'Your wishlist' })).toBeVisible();
    await expectContentFits(page);
    await page.getByRole('button', { name: 'Close dialog' }).tap();
    await page.getByRole('button', { name: 'Open menu' }).tap();
    await page.getByRole('button', { name: 'Search the collection', exact: true }).filter({ visible: true }).tap();
    await page.getByRole('searchbox').fill('Halo');
    await expectContentFits(page);
    await page.getByRole('link', { name: /Halo Pendant Light Lighting/ }).tap();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Halo Pendant Light');
    await page.getByRole('button', { name: 'Dark fitting detail', exact: true }).tap();
    await expect(page.locator('.main-photo img')).toHaveAttribute('src', /halo-fitting-detail/);
    await page.getByRole('button', { name: 'Zoom Halo Pendant Light image' }).tap();
    await expectContentFits(page);
    await page.getByRole('button', { name: 'Close dialog' }).tap();
    await page.getByRole('radio', { name: 'Light neutral', exact: true }).check();
    await page.getByRole('button', { name: 'Increase quantity', exact: true }).tap();
    await page.getByRole('button', { name: 'Add to bag', exact: true }).tap();
    const bag = page.getByRole('dialog', { name: 'Your bag', exact: true });
    await expectContentFits(page);
    await expect(bag.locator('.subtotal')).toHaveText('Subtotal£650');
    await expect(bag.locator('.line-finish')).toHaveText('Light neutral');
    await bag.getByRole('button', { name: 'Increase halo pendant light quantity' }).tap();
    await expect(bag.locator('.subtotal')).toHaveText('Subtotal£975');
    await bag.getByRole('button', { name: 'Checkout', exact: true }).tap();
    await expect(bag.getByRole('status')).toContainText('no order has been placed');
    // A shorter visible viewport exercises the scrollable drawer used when a
    // keyboard is open or the phone is turned sideways. Close stays reachable.
    await page.setViewportSize({ width: 320, height: 320 });
    await expectContentFits(page);
    const close = page.getByRole('button', { name: 'Close dialog' });
    await expect(close).toBeInViewport();
    await close.tap();
    await page.getByText('Dimensions & care', { exact: true }).tap();
    await expect(page.locator('details[open]')).toContainText('Dimensions and care instructions');
    await page.getByRole('button', { name: 'Delivery & Returns', exact: true }).tap();
    await expectContentFits(page);
    await expect(close).toBeInViewport();
    await close.tap();
    await page.setViewportSize({ width: 568, height: 320 });
    await page.getByRole('button', { name: 'Open menu' }).tap();
    await expectContentFits(page);
    await page.getByRole('link', { name: 'Homeware', exact: true }).filter({ visible: true }).tap();
    await expect(page).toHaveURL(/category=homeware/);
    await expect(page.locator('.product-card')).toHaveCount(1);
    await expectContentFits(page);
  });
});
