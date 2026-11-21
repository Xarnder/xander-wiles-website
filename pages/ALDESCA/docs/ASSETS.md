# ALDESCA photographic assets

The photographs originate in the two 1024 × 1536 PNG references supplied by the user. Both original references remain unchanged in the project root. Photography is rendered separately from live HTML/Svelte text and controls.

Run `npm run assets` from this project to reproduce the 20 assets in `static/images`, `static/asset-manifest.json`, and `docs/asset-contact-sheet.png`. The `sharp` development dependency encodes native-size WebP images at quality 94. Images wider than 400 pixels also have half-width variants at quality 90. Runtime images are local and require no external service.

The manifest gives each image a stable name, path, dimensions, intended use, alt text, aspect ratio, focal point, fit recommendation, source file and exact crop rectangle. Crop coordinates are integer pixels from the upper-left of the source image.

## Removing baked-in controls while preserving framing

The initial clean-crop approach excluded hearts and zoom by tightening photographic crops. Visual comparison exposed a larger-looking lamp, clipped product edges, and letterboxing. The current assets instead use the original full photographic rectangles for the four homepage cards, main Halo photo, and three related cards.

Two non-destructive edited source siblings were created with the **built-in imagegen tool**, following the imagegen skill:

- `source-assets/homepage-ui-removed.png`: remove only the four wishlist hearts over the Selected pieces product photos.
- `source-assets/product-ui-removed.png`: remove only the main-photo zoom overlay and three wishlist hearts over the related product photos.

Both tool outputs retained the exact 1024 × 1536 dimensions. Their framing, product silhouettes, object sizes, lighting and materials were visually compared with the references before use. Generative edits can change texture and tone slightly outside the removal areas: these files are not claimed to be pixel-identical originals. As a scale check, mean absolute RGB channel differences were approximately 1.94/255 for the full Halo card and 3.48/255 for the full main Halo photograph, including the removed overlays.

The exact prompts and built-in output paths are recorded in `source-assets/EDIT-PROMPTS.md`. The edited siblings live in the project so the application does not depend on generated files outside the workspace. No external stock photography or alternate products are used.

The preparation script prefers those edited siblings for the eight affected images. If an edited source is absent, it warns and uses the earlier documented clean-crop fallback; those fallback assets are tighter and may recommend `contain`. The committed complete-source assets all use `cover`.

## Dimensions and remaining limits

- Homepage card photographs retain their approximately 232 × 219 reference compositions. The Arc source is 231 pixels wide because that screenshot photograph ends a pixel earlier.
- The main Halo photograph retains its complete 556 × 533 framing. Its zoom dialog can show the available source detail but cannot add genuine resolution.
- Related cards retain their complete 312 × 188 photographic compositions without side padding.
- Fitting and glass details use the exact reference thumbnail regions: 131 × 133 and 126 × 133. They are suitable for thumbnails but will look soft in a larger gallery or zoom view.
- The interior thumbnail is also extracted directly from its 130 × 133 reference region, preserving the window framing.
- The first Halo thumbnail is a clean 126 × 127 extraction inside the reference selection border, with one additional pixel inset to avoid antialiased dark edges. It is used for the thumbnail only; the full main photograph remains available for the main gallery and zoom.
- The 627 × 397 hero and 583 × 274 product editorial retain the original interior compositions. These and the smaller card assets will soften on wide desktops and high-density screens. Original photography at approximately 2× display dimensions would improve detail.
- The homepage closing photo excludes the narrow sage strip at its left; that strip belongs to the live layout.
- No alternate-finish photography was supplied. Selecting a demonstration finish does not change the product photo or imply another material.
- The supplied black/sage logo board remains an untouched brand reference. The live wordmark uses typography rather than a baked background.

Copyright and commercial-use rights for the supplied references remain with their respective rights holders. Provenance records source attribution and does not assert a new licence.
