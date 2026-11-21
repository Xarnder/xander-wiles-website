import sharp from 'sharp';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Native-resolution photographic extractions, explicitly requested in the brief.
// Original references remain unchanged. Edited siblings remove only baked-in UI.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const home = 'A considered home by Aldesca.png';
const product = 'ALDESCA Halo Pendant Light product page.png';
const entries = [
  ['home-hero', home, [397, 140, 627, 397], 'Homepage split hero', 'Warm dining room with an opal pendant above a travertine table, curved upholstered chairs and an olive branch arrangement.'],
  ['halo-card', home, [29, 650, 232, 189], 'Halo product card', 'Flattened oval opal-glass Halo pendant, softly glowing below a dark fitting and thin cable.'],
  ['halo-main', product, [29, 170, 509, 533], 'Halo main gallery and zoom', 'Large glowing Halo pendant against a warm plaster wall, with olive branches, books and a stone surface below.'],
  ['halo-front-thumbnail', product, [32, 719, 126, 127], 'Halo first gallery thumbnail', 'Front view of the glowing oval Halo pendant beneath its dark fitting and black cable.'],
  ['halo-interior-thumbnail', product, [174, 716, 130, 133], 'Halo interior gallery thumbnail', 'Halo pendant above a travertine table beside a tall sunlit window.'],
  ['halo-interior', home, [397, 140, 627, 397], 'Halo interior gallery', 'Halo pendant illuminating a travertine dining table in a softly lit, neutral interior.'],
  ['halo-fitting-detail', product, [316, 716, 131, 133], 'Halo fitting gallery detail', 'Close view of the Halo pendant’s dark cylindrical fitting, black cable and curved opal shade.'],
  ['halo-glass-detail', product, [459, 716, 126, 133], 'Halo glass gallery detail', 'Close view of the rounded edge of the warm, illuminated opal-glass Halo shade.'],
  ['arc-table-lamp', home, [274, 620, 195, 219], 'Arc product card and supporting gallery', 'Arc table lamp with a rounded speckled ceramic base and an ivory fabric shade.'],
  ['travertine-coffee-table', home, [520, 650, 231, 189], 'Travertine product card and supporting gallery', 'Low round travertine coffee table with a broad stone top and a substantial cylindrical pedestal.'],
  ['sculptural-ceramic-vase', home, [765, 650, 231, 189], 'Vase product card and supporting gallery', 'Organic pale ceramic vase with a narrow opening and softly irregular, chalky surface.'],
  ['category-lighting', home, [30, 1003, 233, 188], 'Lighting category tile', 'Glowing oval pendant hanging beside olive branches against a warm plaster wall.'],
  ['category-tables', home, [275, 1003, 233, 188], 'Tables category tile', 'Travertine side table with books and a ceramic bowl beside an upholstered chair.'],
  ['category-furniture', home, [521, 1003, 231, 188], 'Furniture category tile', 'Curved oatmeal upholstered armchair beside a tall window in soft daylight.'],
  ['category-homeware', home, [765, 1003, 232, 188], 'Homeware category tile', 'Ceramic vase with olive branches, a small bowl, books and a candle on a stone surface.'],
  ['home-closing-editorial', home, [30, 1263, 443, 192], 'Homepage closing editorial', 'Textured ceramic vase, shallow bowl and stacked books arranged on a travertine surface in warm sunlight.'],
  ['product-editorial', product, [413, 876, 583, 274], 'Product lighting editorial', 'Halo pendant above a round travertine dining table, surrounded by curved chairs and softly lit natural materials.'],
  ['arc-related', product, [29, 1226, 277, 188], 'Wider related Arc product card', 'Arc ceramic table lamp and ivory fabric shade on a softly lit neutral background.'],
  ['table-related', product, [356, 1255, 312, 159], 'Wider related travertine product card', 'Broad round travertine coffee table with a low cylindrical pedestal on a neutral background.'],
  ['vase-related', product, [684, 1226, 277, 188], 'Wider related ceramic vase product card', 'Sculptural chalky ceramic vase with a gently asymmetric body on a neutral background.']
];

// Keep complete reference compositions where an inspected UI-removal edit exists.
// The fallback crops above still produce clean photographs if a source edit is absent.
const editedSources = {
  'halo-card': ['source-assets/homepage-ui-removed.png', [29, 620, 232, 219]],
  'arc-table-lamp': ['source-assets/homepage-ui-removed.png', [274, 620, 231, 219]],
  'travertine-coffee-table': ['source-assets/homepage-ui-removed.png', [519, 620, 232, 219]],
  'sculptural-ceramic-vase': ['source-assets/homepage-ui-removed.png', [764, 620, 232, 219]],
  'halo-main': ['source-assets/product-ui-removed.png', [29, 170, 556, 533]],
  'arc-related': ['source-assets/product-ui-removed.png', [29, 1226, 312, 188]],
  'table-related': ['source-assets/product-ui-removed.png', [356, 1226, 312, 188]],
  'vase-related': ['source-assets/product-ui-removed.png', [683, 1226, 312, 188]]
};

const outputDir = resolve(project, 'static/images');
await mkdir(outputDir, { recursive: true });
await mkdir(resolve(project, 'docs'), { recursive: true });
const assets = {};
const contact = [];
for (const [name, originalSource, originalCrop, intendedUse, alt] of entries) {
  let source = originalSource;
  let crop = originalCrop;
  let generativeUiRemoval = false;
  const edited = editedSources[name];
  if (edited) {
    try {
      await access(resolve(project, edited[0]));
      source = edited[0];
      crop = edited[1];
      generativeUiRemoval = true;
    } catch {
      console.warn(`Edited source missing for ${name}; using documented clean-crop fallback.`);
    }
  }
  const [left, top, width, height] = crop;
  const pipeline = sharp(resolve(project, source)).extract({ left, top, width, height });
  await pipeline.clone().webp({ quality: 94, effort: 6 }).toFile(resolve(outputDir, `${name}.webp`));
  const asset = {
    src: `/images/${name}.webp`, width, height, alt,
    intendedUse, aspectRatio: Number((width / height).toFixed(4)), focalPoint: !generativeUiRemoval && name === 'arc-table-lamp' ? '50% 60%' : '50% 50%',
    preferredFit: !generativeUiRemoval && ['travertine-coffee-table', 'arc-related', 'vase-related'].includes(name) ? 'contain' : 'cover',
    provenance: {
      type: generativeUiRemoval ? 'user-supplied screenshot with generative UI removal' : 'user-supplied screenshot crop', source,
      originalSource,
      crop: { left, top, width, height }, sourceDimensions: { width: 1024, height: 1536 },
      processing: generativeUiRemoval
        ? 'Built-in imagegen edit removed baked-in wishlist hearts or zoom overlay. Composition visually checked against the original; slight tonal/texture changes remain. Native-resolution crop and WebP encoding; no upscaling.'
        : 'Native-resolution crop and WebP encoding; no retouching, upscaling or generated detail.'
    }
  };
  if (width > 400) {
    const smallWidth = Math.round(width / 2);
    await pipeline.clone().resize({ width: smallWidth, withoutEnlargement: true }).webp({ quality: 90, effort: 6 }).toFile(resolve(outputDir, `${name}-small.webp`));
    asset.srcSmall = `/images/${name}-small.webp`;
    asset.smallWidth = smallWidth;
  }
  assets[name] = asset;
  const cell = await pipeline.clone().resize(280, 220, { fit: 'contain', background: '#EFE6D8', withoutEnlargement: true }).png().toBuffer();
  const label = Buffer.from(`<svg width="280" height="32"><rect width="280" height="32" fill="#EFE6D8"/><text x="8" y="21" font-size="14" font-family="Arial" fill="#000">${name} · ${width}×${height}</text></svg>`);
  const index = contact.length / 2;
  contact.push({ input: cell, left: (index % 3) * 280, top: Math.floor(index / 3) * 252 });
  contact.push({ input: label, left: (index % 3) * 280, top: Math.floor(index / 3) * 252 + 220 });
}
await writeFile(resolve(project, 'static/asset-manifest.json'), JSON.stringify({ version: 1, assets }, null, 2) + '\n');
await sharp({ create: { width: 840, height: Math.ceil(entries.length / 3) * 252, channels: 3, background: '#EFE6D8' } }).composite(contact).png().toFile(resolve(project, 'docs/asset-contact-sheet.png'));
console.log(`Prepared ${entries.length} photographic assets and their manifest. Originals unchanged.`);
