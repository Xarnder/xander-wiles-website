// Optical font comparison against user-supplied raster references.
// This measures shape/size similarity; it does not identify a source font.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
await page.goto('http://127.0.0.1:5194/');
await page.evaluate(() => document.fonts.ready);
for (const [family, file] of [
  ['Arimo', 'arimo'], ['Baskervville', 'baskervville'], ['Libre Caslon Display', 'libre-caslon-display'],
  ['Aldesca Bodoni', 'bodoni-moda'], ['Aldesca Sans', 'dm-sans']
]) {
  const data = await fs.readFile(`node_modules/@fontsource/${file}/files/${file}-latin-400-normal.woff2`);
  await page.evaluate(async ({ family, base64 }) => {
    const font = new FontFace(family, `url(data:font/woff2;base64,${base64})`);
    document.fonts.add(await font.load());
  }, { family, base64: data.toString('base64') });
}

function tight(data, width, height, channels = 1, reference = false) {
  let left = width, top = height, right = 0, bottom = 0;
  const points = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const idx = (y * width + x) * channels;
    const ink = reference ? Math.max(data[idx], data[idx + 1], data[idx + 2]) < 90 : data[idx] > 160;
    if (ink) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); points.push([x, y]); }
  }
  return { width: right - left + 1, height: bottom - top + 1, points: points.map(([x, y]) => [x - left, y - top]) };
}
function score(ref, sample) {
  const refSet = new Set(ref.points.map(([x, y]) => `${x},${y}`));
  let best = 0;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    let overlap = 0;
    for (const [x, y] of sample.points) if (refSet.has(`${x + dx},${y + dy}`)) overlap++;
    best = Math.max(best, overlap / (ref.points.length + sample.points.length - overlap));
  }
  return best;
}
const home = 'A considered home by Aldesca.png';
const product = 'ALDESCA Halo Pendant Light product page.png';
const samples = [
  { id: 'heading', file: home, box: [29, 560, 280, 45], text: 'Selected pieces', size: 40, serif: true },
  { id: 'product-title', file: product, box: [619, 196, 379, 50], text: 'Halo Pendant Light', size: 46, serif: true },
  { id: 'wordmark', file: home, box: [366, 14, 295, 51], text: 'ALDESCA', size: 56, serif: true },
  { id: 'card-name', file: home, box: [31, 869, 210, 23], text: 'Halo Pendant Light', size: 17, serif: false },
  { id: 'body-line', file: product, box: [621, 340, 370, 22], text: 'A soft, inviting glow for everyday living.', size: 16, serif: false }
];
const report = [];
for (const sample of samples) {
  const [left, top, width, height] = sample.box;
  const { data, info } = await sharp(sample.file).extract({ left, top, width, height }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ref = tight(data, width, height, info.channels, true);
  const fonts = sample.serif ? ['Aldesca Tinos', 'Times New Roman', 'Baskerville', 'Baskervville', 'Libre Caslon Display', 'Georgia', 'Aldesca Bodoni'] : ['Aldesca Sans', 'Arial', 'Arimo', 'Helvetica'];
  const results = [];
  for (const family of fonts) {
    let best = { score: -1 };
    for (let size = sample.size - 3; size <= sample.size + 5; size += .5) {
      for (const spacing of sample.id === 'wordmark' ? [1, 2, 3, 4, 5] : [-.5, 0, .5]) {
        const pixels = await page.evaluate(({ family, size, text, spacing }) => {
          const canvas = document.createElement('canvas'); canvas.width = 700; canvas.height = 100;
          const ctx = canvas.getContext('2d'); ctx.font = `${size}px "${family}"`; ctx.letterSpacing = `${spacing}px`; ctx.fillStyle = '#000'; ctx.fillText(text, 5, 75);
          const rgba = ctx.getImageData(0, 0, 700, 100).data;
          return Array.from({ length: 70000 }, (_, index) => rgba[index * 4 + 3]);
        }, { family, size, text: sample.text, spacing });
        const mask = tight(pixels, 700, 100);
        const similarity = score(ref, mask);
        if (similarity > best.score) best = { family, size, spacing, score: Number(similarity.toFixed(4)), width: mask.width, height: mask.height };
      }
    }
    results.push(best);
  }
  results.sort((a, b) => b.score - a.score);
  const item = { sample: sample.id, reference: { width: ref.width, height: ref.height }, results };
  console.log(JSON.stringify(item)); report.push(item);
}
await fs.writeFile('docs/comparison/type-metrics.json', JSON.stringify(report, null, 2));
await browser.close();
