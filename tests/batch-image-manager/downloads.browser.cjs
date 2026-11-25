// Uses the same Playwright and preview-server configuration as fast-sort.browser.cjs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { chromium } = require(process.env.BATCH_SORT_PLAYWRIGHT || 'playwright');

test('single SVGs and images download directly; every batch export still zips multiple files', async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.BATCH_SORT_BROWSER || undefined });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(process.env.BATCH_SORT_URL || 'http://localhost:3000/pages/Batch_Image_Manger/');
        await page.waitForFunction(() => typeof JSZip !== 'undefined');
        // Direct downloads must work even if the ZIP library is unavailable.
        await page.evaluate(() => { window.savedZipLibrary = window.JSZip; window.JSZip = undefined; });
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6"><rect width="8" height="6" fill="teal"/></svg>';
        const file = { name: 'icon.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) };
        await page.locator('#photo-upload').setInputFiles([file]);
        assert.equal(await page.locator('#export-btn').innerText(), 'Download File');
        await page.locator('#filename-spacing-select').selectOption('underscores');
        await page.locator('#filename-prefix').fill('renamed_');

        async function download(button) {
            const pending = page.waitForEvent('download');
            await page.locator(button).click();
            const result = await pending;
            return { name: result.suggestedFilename(), bytes: await readFile(await result.path()) };
        }

        const original = await download('#export-btn');
        assert.match(original.name, /^renamed_.*\.svg$/);
        assert.equal(original.bytes.toString(), svg);
        assert.equal(await page.locator('#export-btn').innerText(), 'Download File');

        await page.locator('#open-sort-modal-btn').click();
        await page.locator('#sort-folder-name').fill('Keep');
        await page.locator('#sort-save-folder-btn').click();
        assert.equal(await page.locator('#sort-download-btn').innerText(), 'Download file');
        const sorted = await download('#sort-download-btn');
        assert.equal(sorted.name, 'icon.svg');
        assert.equal(sorted.bytes.toString(), svg);
        await page.locator('#sort-done-btn').click();

        // A raster upload follows the same rule and retains the selected output format.
        const png = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 8; canvas.height = 6;
            canvas.getContext('2d').fillRect(0, 0, 8, 6);
            return canvas.toDataURL().split(',')[1];
        });
        const raster = { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
        await page.locator('#photo-upload').setInputFiles([raster]);
        await page.locator('#export-format-select').selectOption('image/png');
        const image = await download('#export-btn');
        assert.match(image.name, /\.png$/);
        assert.equal(image.bytes.subarray(1, 4).toString(), 'PNG');

        async function resizeDownload(kind) {
            await page.locator(`#open-${kind}-modal-btn`).click();
            await page.locator(`#${kind}-format-select`).selectOption('image/png');
            if (kind === 'downscale') {
                if (await page.locator('#downscale-aspect-lock-toggle').isChecked()) {
                    await page.locator('label[for="downscale-aspect-lock-toggle"]').click();
                }
                await page.locator('#downscale-width-input').fill('4');
                await page.locator('#downscale-height-input').fill('3');
            }
            const result = await download(`#${kind}-generate-btn`);
            await page.locator(`#${kind}-popup .popup-close-btn`).click();
            return result;
        }

        for (const [kind, width, height] of [['downscale', 4, 3], ['upscale', 16, 12]]) {
            const result = await resizeDownload(kind);
            assert.match(result.name, /\.png$/);
            assert.equal(result.bytes.subarray(1, 4).toString(), 'PNG');
            assert.equal(result.bytes.readUInt32BE(16), width);
            assert.equal(result.bytes.readUInt32BE(20), height);
        }

        await page.evaluate(() => { window.JSZip = window.savedZipLibrary; });
        await page.locator('#photo-upload').setInputFiles([raster, { ...raster, name: 'second.png' }]);
        assert.equal(await page.locator('#export-btn').innerText(), 'Export All as .ZIP');
        assert.equal(await page.locator('#downscale-generate-btn').innerText(), 'Generate & Download ZIP');
        assert.equal(await page.locator('#upscale-generate-btn').innerText(), 'Upscale & Download ZIP');
        const results = [await download('#export-btn')];
        await page.locator('#open-sort-modal-btn').click();
        results.push(await download('#sort-download-btn'));
        await page.locator('#sort-done-btn').click();
        results.push(await resizeDownload('downscale'), await resizeDownload('upscale'));
        for (const result of results) {
            assert.match(result.name, /\.zip$/);
            const entries = await page.evaluate(async bytes => {
                const zip = await JSZip.loadAsync(bytes, { base64: true });
                return Object.values(zip.files).filter(file => !file.dir).map(file => file.name);
            }, result.bytes.toString('base64'));
            assert.equal(entries.length, 2, result.name);
        }
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
});
