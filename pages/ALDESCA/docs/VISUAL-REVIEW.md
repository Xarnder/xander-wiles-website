# Reference comparison — 21 November 2026

This records the font/reference matching pass. A later responsive pass retains this desktop composition and adds fluid sizing and slim-phone layouts; current screenshots and its six-test verification are listed in [verification](VERIFICATION.md).

Both pages were compared with the original supplied PNGs at 1024 CSS pixels and device pixel ratio 1. Captures wait for all fonts and images, with an empty cart/wishlist, first gallery image, Dark finish, quantity one and closed dialogs/accordions.

## Changes made

- Replaced the previous Tinos editorial headings with Georgia, with a locally hosted Gelasio fallback. Georgia's letter shapes and proportions matched both the section headings and Halo title more closely in the sampled comparison.
- Replaced the Bodoni wordmark with Tinos and corrected its size, tracking and centring.
- Replaced DM Sans with Arimo for a closer match to the reference's less rounded sans-serif. Adjusted card text sizes, the product description width and line wrapping.
- Aligned the desktop search field, utility icons and navigation; tightened the product footer; calibrated headline line height and spacing around the product purchase controls.
- Restored complete product-photo frames. Generative edits remove the embedded hearts/zoom control, so live controls no longer require tighter crops or contain-fit padding. The four gallery thumbnails now use their original reference framing.
- Preserved the exact flat interface colours specified in the original brief. Subtle colour variation baked into the reference screenshots is not reproduced as a CSS gradient.

## Optical checks

The PNGs contain no source-font metadata. The font selection is a measured visual approximation, not proof of the original font family. `scripts/compare-type.mjs` records comparisons with several licensed and available system fonts; its initial candidate results are in `comparison/type-metrics.json`. Candidate font packages used only for this comparison are development dependencies and are not bundled into the website.

Representative dark-glyph widths at the reference viewport, rounded to pixels:

| Text | Reference | Updated website |
| --- | ---: | ---: |
| A considered | 319 | 320 |
| Selected pieces | 241 | 241 |
| Find your finishing touches | 440 | 440 |
| Halo Pendant Light | 364 | 364 |
| Pairs beautifully with | 302 | 302 |

These widths are checks on typography and wrapping, not a whole-page similarity score. Font rasterisation and a few glyph edges still differ. The homepage naturally renders to 1536px in this comparison; the product page is 1542px. Neither document has a fixed height.

## Comparisons and screenshots

Each comparison shows the supplied reference on the left and the updated live website on the right:

- [Homepage comparison](comparison/homepage-reference-vs-final.png)
- [Halo product comparison](comparison/halo-reference-vs-final.png)
- [Updated desktop homepage](screenshots/homepage-desktop.png)
- [Updated desktop product page](screenshots/halo-desktop.png)
- [Updated mobile homepage](screenshots/homepage-mobile.png)
- [Updated mobile product page](screenshots/halo-mobile.png)

The final comparisons and mobile homepage were visually inspected. The existing four Playwright tests passed after the changes, including checks at 360, 390, 768, 1024 and 1440px. Svelte/TypeScript reported zero errors and warnings, and production builds passed. An additional browser check forced the Gelasio fallback on both primary routes at 1024px: there was no horizontal overflow and the main headings retained their intended line count.

Remaining limitations are the source images' native resolution, slight tone/texture changes in the eight edited photo assets, and the absence of original font files. See [asset provenance](ASSETS.md).
