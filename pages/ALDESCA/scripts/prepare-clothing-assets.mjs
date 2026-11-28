import sharp from 'sharp';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const records = JSON.parse(await readFile(resolve(project, 'source-assets/clothing/generation-records.json'), 'utf8'));
const outputDir = resolve(project, 'static/images/clothing');
await mkdir(outputDir, { recursive: true });

const assets = {};
const contact = [];
for (const [index, record] of records.assets.entries()) {
  const input = resolve(project, record.source);
  const original = await sharp(input).metadata();
  const width = Math.min(1200, original.width);
  const smallWidth = Math.min(480, width);
  const output = resolve(outputDir, `${record.key}.webp`);
  const smallOutput = resolve(outputDir, `${record.key}-small.webp`);
  const fullInfo = await sharp(input).resize({ width, withoutEnlargement: true }).webp({ quality: 90, effort: 6 }).toFile(output);
  await sharp(input).resize({ width: smallWidth, withoutEnlargement: true }).webp({ quality: 86, effort: 6 }).toFile(smallOutput);

  assets[record.key] = {
    src: `/images/clothing/${record.key}.webp`,
    width: fullInfo.width,
    height: fullInfo.height,
    alt: record.alt,
    intendedUse: record.key === 'fashion-hero' ? 'Clothing editorial hero' : 'Clothing product photograph',
    aspectRatio: Number((fullInfo.width / fullInfo.height).toFixed(4)),
    focalPoint: '50% 50%',
    preferredFit: 'cover',
    srcSmall: `/images/clothing/${record.key}-small.webp`,
    smallWidth,
    provenance: {
      type: 'original AI-generated demonstration photograph',
      source: record.source,
      sourceDimensions: { width: original.width, height: original.height },
      generator: 'built-in image_gen.imagegen',
      promptRecord: 'source-assets/clothing/PROMPTS.md',
      processing: 'Aspect-ratio-preserving downsize where necessary and WebP encoding; no cropping or upscaling.'
    }
  };

  const thumbnail = await sharp(input).resize(300, 450, { fit: 'contain', background: '#EFE6D8' }).png().toBuffer();
  const label = Buffer.from(`<svg width="300" height="30"><rect width="300" height="30" fill="#EFE6D8"/><text x="8" y="21" font-size="15" font-family="Arial" fill="#000">${record.key}</text></svg>`);
  contact.push({ input: thumbnail, left: (index % 3) * 300, top: Math.floor(index / 3) * 480 });
  contact.push({ input: label, left: (index % 3) * 300, top: Math.floor(index / 3) * 480 + 450 });
  console.log(`${record.key}: ${fullInfo.width}×${fullInfo.height}, ${Math.round((await stat(output)).size / 1024)} KB; small ${smallWidth}px`);
}

await writeFile(resolve(project, 'src/lib/assets/clothing-asset-manifest.json'), JSON.stringify({ version: 1, assets }, null, 2) + '\n');
await sharp({ create: { width: 900, height: Math.ceil(records.assets.length / 3) * 480, channels: 3, background: '#EFE6D8' } })
  .composite(contact).webp({ quality: 92 }).toFile(resolve(project, 'source-assets/clothing/contact-sheet.webp'));
