// Start the repository's dev server, then run this with Playwright available.
// Optional: BATCH_SORT_URL, BATCH_SORT_PLAYWRIGHT, BATCH_SORT_BROWSER.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, writeFile, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.BATCH_SORT_PLAYWRIGHT || 'playwright');

const svg = colour => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${colour}"/></svg>`;

test('directory sorting, renaming, undo, export, reopen, and responsive controls', async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'batch-sort-test-'));
    const directory = path.join(fixture, 'Images');
    await mkdir(path.join(directory, 'A'), { recursive: true });
    await mkdir(path.join(directory, 'B'), { recursive: true });
    await writeFile(path.join(directory, 'A', 'same.svg'), svg('teal'));
    await writeFile(path.join(directory, 'B', 'same.svg'), svg('purple'));
    await writeFile(path.join(directory, 'last.svg'), svg('orange'));
    const browser = await chromium.launch({ headless: true, executablePath: process.env.BATCH_SORT_BROWSER || undefined });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(process.env.BATCH_SORT_URL || 'http://localhost:3000/pages/Batch_Image_Manger/');
        await page.locator('#directory-upload').setInputFiles(directory);
        await page.locator('#open-sort-modal-btn').click();
        assert.deepEqual(await page.locator('.sort-folder-title').allTextContents(), ['A', 'B']);
        await page.locator('#sort-folder-name').fill('Keep');
        await page.locator('#sort-save-folder-btn').click();
        await page.locator('#sort-start-btn').click();
        const ready = () => page.locator('.sort-folder-btn:enabled').first().waitFor();
        await ready();
        await page.keyboard.press('3');
        await ready();
        assert.match(await page.locator('#sort-progress').innerText(), /Image 2 of 3/);
        // Holding a shortcut must not sort the next image.
        await page.evaluate(() => document.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: '3', code: 'Digit3', repeat: true, bubbles: true })));
        assert.match(await page.locator('#sort-progress').innerText(), /Image 2 of 3/);
        await page.keyboard.press('3');
        await ready();
        await page.locator('#sort-manage-btn').click();
        await page.getByRole('button', { name: 'Rename Keep', exact: true }).click();
        await page.locator('#sort-folder-name').fill('Selected');
        await page.locator('#sort-folder-name').press('1');
        assert.match(await page.locator('#sort-progress').innerText(), /Image 3 of 3/);
        await page.locator('#sort-folder-name').fill('Selected');
        await page.locator('#sort-save-folder-btn').click();
        assert.deepEqual(await page.locator('.sort-folder-title').allTextContents(), ['A', 'B', 'Selected']);
        await page.locator('#sort-start-btn').click();
        await page.keyboard.press('Backspace');
        await ready();
        assert.match(await page.locator('#sort-current-folder').innerText(), /B$/);
        await page.keyboard.press('3');
        await ready();
        await page.keyboard.press('Space');
        assert.match(await page.locator('#sort-progress').innerText(), /All 3 images reviewed · 2 sorted · 1 skipped/);
        // Renamed folders and file collisions must survive a real ZIP download.
        const downloadPromise = page.waitForEvent('download');
        await page.locator('#sort-download-btn').click();
        const download = await downloadPromise;
        assert.equal(download.suggestedFilename(), 'sorted_images.zip');
        const bytes = await readFile(await download.path());
        const entries = await page.evaluate(async encoded => {
            const zip = await JSZip.loadAsync(encoded, { base64: true });
            return Promise.all(Object.values(zip.files).filter(file => !file.dir).map(async file => [file.name, await file.async('string')]));
        }, bytes.toString('base64'));
        assert.deepEqual(entries.map(([name]) => name).sort(), ['Selected/same (2).svg', 'Selected/same.svg', 'last.svg']);
        assert.equal(entries.find(([name]) => name === 'Selected/same.svg')[1], svg('teal'));
        assert.equal(entries.find(([name]) => name === 'Selected/same (2).svg')[1], svg('purple'));
        await page.locator('#sort-done-btn').click();
        assert.equal(await page.locator('#folder-select').inputValue(), 'Selected');
        await page.locator('#open-sort-modal-btn').click();
        assert.match(await page.locator('#sort-progress').innerText(), /All 3 images reviewed/);
        assert.deepEqual(await page.locator('.sort-folder-title').allTextContents(), ['A', 'B', 'Selected']);
        await page.locator('#sort-undo-btn').click();
        await ready();
        assert.match(await page.locator('#sort-filename').innerText(), /last.svg/);
        assert.equal(await page.locator('#sort-skip-btn').isDisabled(), false);
        await page.screenshot({ path: path.join(tmpdir(), 'batch-fast-sort-desktop.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: path.join(tmpdir(), 'batch-fast-sort-mobile.png') });
        assert.equal(await page.locator('.sort-card').evaluate(element => element.scrollWidth <= element.clientWidth), true);
        assert.equal(await page.locator('#sort-heading').evaluate(element => {
            const rect = element.getBoundingClientRect();
            return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element;
        }), true, 'The sorter must appear above the global mobile navigation');
        await page.locator('.sort-folder-btn').nth(2).click();
        assert.match(await page.locator('#sort-progress').innerText(), /3 sorted · 0 skipped/);
        // A fresh upload must clear completion, history, and old shortcut names.
        await page.keyboard.press('Escape');
        await page.locator('#photo-upload').setInputFiles([{ name: 'fresh.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg('blue')) }]);
        await page.locator('#open-sort-modal-btn').click();
        assert.match(await page.locator('#sort-progress').innerText(), /Image 1 of 1 · 0 sorted/);
        assert.equal(await page.locator('.sort-folder-btn').count(), 0);
        assert.equal(await page.locator('#sort-start-btn').isDisabled(), true);
        // Unsupported or damaged files should not leave the batch stuck.
        await page.keyboard.press('Escape');
        await page.locator('#photo-upload').setInputFiles([
            { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') },
            { name: 'working.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg('green')) }
        ]);
        await page.locator('#open-sort-modal-btn').click();
        await page.locator('#sort-folder-name').fill('Keep');
        await page.locator('#sort-save-folder-btn').click();
        await page.locator('#sort-start-btn').click();
        await page.getByText('This image cannot be previewed. Skip it to continue; its file will still be included in the download.', { exact: true }).waitFor();
        await page.keyboard.press('1');
        assert.match(await page.locator('#sort-progress').innerText(), /Image 1 of 2/);
        await page.keyboard.press('Space');
        await ready();
        assert.equal(await page.locator('#sort-filename').innerText(), 'working.svg');
        await page.keyboard.press('1');
        assert.match(await page.locator('#sort-progress').innerText(), /All 2 images reviewed · 1 sorted · 1 skipped/);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        await rm(fixture, { recursive: true, force: true });
    }
});
