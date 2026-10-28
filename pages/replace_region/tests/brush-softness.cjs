// Run with Playwright installed, or set PLAYWRIGHT_MODULE to its absolute path.
// Checks real canvas pixels in WebKit (iOS engine) and Chromium.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webkit, chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const helper = source.slice(source.indexOf('    function drawSoftStroke('), source.indexOf('    function getFinalMaskCanvas('));

(async () => {
    for (const [name, engine] of Object.entries({ webkit, chromium })) {
        const browser = await engine.launch({ headless: true });
        try {
            const page = await browser.newPage();
            const result = await page.evaluate(helper => {
                const draw = new Function(`${helper}; return drawSoftStroke;`)();
                const canvas = () => Object.assign(document.createElement('canvas'), { width: 160, height: 100 });
                const layer = canvas();
                const stroke = layer.getContext('2d');
                stroke.fillStyle = '#ff0000';
                stroke.fillRect(60, 30, 40, 40);
                const render = (blur, erase, fallback) => {
                    const out = canvas();
                    const ctx = out.getContext('2d');
                    if (fallback) Object.defineProperty(ctx, 'filter', { value: undefined });
                    if (erase) {
                        ctx.fillStyle = 'white';
                        ctx.fillRect(0, 0, 160, 100);
                        ctx.globalCompositeOperation = 'destination-out';
                    }
                    draw(ctx, layer, blur, '#ff0000');
                    const sample = x => Array.from(ctx.getImageData(x, 50, 1, 1).data);
                    return { outside: sample(55), center: sample(80), far: sample(10), composite: ctx.globalCompositeOperation, shadowBlur: ctx.shadowBlur };
                };
                return { nativeFilter: typeof stroke.filter === 'string', hard: render(0, false, false), soft: render(6, false, false), fallback: render(6, false, true), wider: render(12, false, true), eraser: render(6, true, false), fallbackEraser: render(6, true, true) };
            }, helper);
            assert.equal(result.hard.outside[3], 0);
            assert.equal(result.hard.center[3], 255);
            for (const soft of [result.soft, result.fallback]) {
                assert(soft.outside[3] > 0 && soft.outside[3] < 128, 'soft edge must extend beyond the hard stroke');
                assert(soft.center[3] > 240, 'center should stay opaque');
                assert.equal(soft.outside[0], 255, 'paint color must survive blur');
                assert.equal(soft.far[3], 0, 'no displaced hard source should be visible');
                assert.equal(soft.shadowBlur, 0, 'drawing state should be restored');
            }
            assert(result.wider.outside[3] > result.fallback.outside[3], 'higher softness must widen the edge');
            for (const erased of [result.eraser, result.fallbackEraser]) {
                assert(erased.outside[3] > 127 && erased.outside[3] < 255, 'eraser must have a soft edge');
                assert(erased.center[3] < 15);
                assert.equal(erased.far[3], 255);
                assert.equal(erased.composite, 'destination-out');
            }
            console.log(`${name}: brush color, softness, hard edge, eraser and state restoration passed (native filter: ${result.nativeFilter})`);
        } finally {
            await browser.close();
        }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
