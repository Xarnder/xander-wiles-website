// Run with Playwright installed, or set PLAYWRIGHT_MODULE to its absolute path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webkit, chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, '');
const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
// Expose closure internals only in this harness; production has no test hooks.
const instrumented = source.replace("document.addEventListener('DOMContentLoaded', () => {", '(() => {')
    .replace(/\}\);\s*$/, 'window.testMask = { state, setupMasking, getMaskViewport, composeMaskAndDraw, composeFullResolutionExport, updateCursorSize }; })();');
(async () => {
    for (const [name, engine] of Object.entries({ webkit, chromium })) {
        const browser = await engine.launch({ headless: true });
        try {
            const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
            await page.setContent(html);
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'style.css'), 'utf8') });
            await page.addScriptTag({ content: instrumented });
            for (const fullWidth of [1000, 4000]) {
                const result = await page.evaluate(fullWidth => {
                    const t = window.testMask;
                    const s = t.state;
                    const image = (w, h, color) => {
                        const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
                        const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); return c;
                    };
                    s.originalImage = image(fullWidth, 800, 'black');
                    s.editedImage = image(200, 160, 'white');
                    s.cropRect = { x: fullWidth - 300, y: 300, width: 200, height: 160 };
                    s.userPaintLayer = null; s.maskView = 'full'; s.brushSize = 30; s.brushSoftness = 25; s.isTouchMode = true;
                    t.setupMasking();
                    const c = s.maskCanvas;
                    const alpha = (x, y) => s.userPaintLayer.getContext('2d').getImageData(Math.round(x * s.workScale), Math.round(y * s.workScale), 1, 1).data[3];
                    const point = (x, y, touch) => {
                        const rect = c.getBoundingClientRect(), v = t.getMaskViewport();
                        const p = { clientX: rect.left + (x * s.workScale - v.x) / v.width * rect.width,
                            clientY: rect.top + (y * s.workScale - v.y) / v.height * rect.height };
                        return touch ? { touches: [p] } : p;
                    };
                    const paint = (x, y, touch) => {
                        const p = point(x, y, touch);
                        c[touch ? 'ontouchstart' : 'onmousedown']({ ...p, type: touch ? 'touchstart' : 'mousedown', preventDefault() {} });
                        c[touch ? 'ontouchend' : 'onmouseup']();
                    };
                    const x = fullWidth - 200, y = 380;
                    paint(x, y, false);
                    const fullAlpha = alpha(x, y);
                    const before = s.userPaintLayer.toDataURL();
                    document.querySelector('[data-mask-view="region"]').click();
                    const preserved = before === s.userPaintLayer.toDataURL();
                    const view = t.getMaskViewport();
                    s.userPaintLayer.getContext('2d').clearRect(0, 0, s.workWidth, s.workHeight);
                    paint(x, y, true);
                    const zoomAlpha = alpha(x, y);
                    const identical = before === s.userPaintLayer.toDataURL();
                    t.updateCursorSize();
                    const cursor = parseFloat(document.getElementById('brush-cursor').style.width);
                    const expectedCursor = s.brushSize * s.workScale * c.getBoundingClientRect().width / view.width;
                    const exported = t.composeFullResolutionExport();
                    const exportPixel = exported.getContext('2d').getImageData(x, y, 1, 1).data[0];
                    s.currentTool = 'eraser'; paint(x, y, true);
                    const erased = alpha(x, y); s.currentTool = 'brush';
                    document.querySelector('[data-mask-view="full"]').click();
                    const fullSize = [c.width, c.height];
                    // Edge crop must clamp the zoom window inside the image.
                    s.cropRect = { x: 0, y: 0, width: 100, height: 80 }; s.maskView = 'region';
                    const edge = t.getMaskViewport();
                    return { fullAlpha, zoomAlpha, preserved, identical, cursor, expectedCursor, exportPixel,
                        exportSize: [exported.width, exported.height], erased, fullSize, workSize: [s.workWidth, s.workHeight], view, edge };
                }, fullWidth);
                assert(result.preserved && result.identical, 'touch zoom and mouse full view must paint the same mask');
                assert(result.fullAlpha > 240 && result.zoomAlpha > 240);
                assert(result.erased < 15, 'zoomed eraser must hit the same location');
                assert(Math.abs(result.cursor - result.expectedCursor) < 0.01);
                assert(result.exportPixel > 230, 'exported replacement must align with painted location');
                assert.deepEqual(result.exportSize, [fullWidth, 800]);
                assert.deepEqual(result.fullSize, result.workSize);
                assert.equal(result.edge.x, 0); assert.equal(result.edge.y, 0);
                assert(result.view.width < result.workSize[0]);
                console.log(`${name}, image width ${fullWidth}: full/zoom mouse-touch alignment, mask preservation, eraser, cursor, export and edge clamping passed`);
            }
        } finally { await browser.close(); }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
