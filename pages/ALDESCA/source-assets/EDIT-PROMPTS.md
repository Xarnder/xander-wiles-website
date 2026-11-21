# Overlay-removal edit provenance

Mode: built-in `image_gen.imagegen` edit, with one local reference target per call and `transparent_background: false`. No CLI or API fallback was used. Original inputs were inspected with `view_image` before editing. Both outputs are 1024 × 1536.

## Homepage

Input: `../A considered home by Aldesca.png`

Saved project copy: `homepage-ui-removed.png`

Original built-in output: `/Users/Xander-Person/.codex/generated_images/01a1ff4d-a57f-7cf2-87a4-7c0defd70553/exec-28c12093-935b-42d2-9ef3-64a5c272d485.png`

Exact prompt:

> Use case: precise-object-edit. This attached 1024 by 1536 pixel ALDESCA homepage screenshot is the EDIT TARGET, not a style reference. Make ONLY these four tiny removals: erase the black outline wishlist heart over the upper-right corner of each of the four product photos in the Selected pieces row, centered approximately at (237,639), (481,639), (726,639), (972,639). Fill each erased heart with the same photographic background immediately behind it. Keep the header heart unchanged. Return the same complete 1024x1536 canvas with every other pixel and region as unchanged as possible: absolutely preserve the four photographed objects, all photographic crops, object sizes, geometry, light, textures, shadows, colors, margins, positions, original photography, typography, words, and UI. Do not regenerate or redesign the page or change any product. No cropping, no resizing, no additional items, no new icons. Output opaque, exact original canvas dimensions.

## Product page

Input: `../ALDESCA Halo Pendant Light product page.png`

Saved project copy: `product-ui-removed.png`

Original built-in output: `/Users/Xander-Person/.codex/generated_images/01a1ff4d-a57f-7cf2-87a4-7c0defd70553/exec-d46041b5-c865-4873-b371-a2e8d2a54ec6.png`

Exact prompt:

> Use case: precise-object-edit. This attached 1024 by 1536 pixel ALDESCA product-page screenshot is the EDIT TARGET, not a style reference. Make ONLY four small removals: (1) erase the circular pale zoom button with black magnifying glass in the bottom-right of the main product photograph, centered approximately at (557,672), filling it with the continuous original warm plaster/shadow background; (2-4) erase the black outline wishlist hearts at upper-right of the three related-product photographs near the bottom, centered approximately at (318,1244), (643,1244), (974,1244), filling only those heart pixels with matching photographic backgrounds. Keep all other hearts and icons unchanged. Return the same entire 1024x1536 canvas with every other region as unchanged as possible: absolutely preserve pendant shape, fitting, cable, all other photographed products, photographic framing and object sizes, light, texture, shadows, colors, positions, margins, typography, all words, and UI. Do not regenerate or redesign any product or the page. No crop, resize, extra item, new icon or altered camera angle. Output opaque, exact original canvas dimensions.
