# Verification — 21 November 2026

## Checks run

- `npm run check` — **0 errors, 0 warnings** from Svelte/TypeScript.
- `npm run build` — static production build and prerendering succeeded for the homepage, shop, privacy policy and all four products.
- `npm run build:site` — production build succeeded with the `/pages/ALDESCA` base used by the parent website.
- `npm test` — **6 Playwright tests passed**, using installed Google Chrome, including mobile touch emulation.
- `node --check ../../build.js` — parent build script syntax passed.
- `git diff --check` — passed.
- Root `npm run build` — the complete parent website build succeeded, including ALDESCA at `/pages/ALDESCA/`.

The app was checked with Node 22.23.4. The initial shell inside this directory selected an older system Node; final verification explicitly selected the installed Node 22.23.4 runtime.

## Browser checks

The automated smoke tests cover:

- Two Dark Halo pendants plus one Chalk vase: **£735**, three bag units.
- Quantity changes, removals, same-finish merging and separate lines for different finishes.
- Cart and wishlist restoration after reload, invalid-data rejection, malformed JSON and blocked localStorage.
- Card-to-product navigation, the Arc route, returning home and product-specific state reset.
- Thumbnail changes, image zoom, Escape dismissal and restoration of keyboard focus.
- Wishlist synchronisation between cards, the product page and the wishlist drawer.
- Search by name/category, genuine empty results and result navigation.
- Native product accordions and honest newsletter validation/unavailable outcome.
- Category filters and refreshes for Lighting, Tables, Furniture, Homeware and the demo New In selection.
- Menu focus containment and keyboard dismissal.
- Both primary pages at **360, 390, 768, 1024 and 1440 CSS pixels**; no horizontal document overflow, broken images, page errors or hydration warnings were found in the responsive check.
- All six storefront routes at **280, 320, 360, 390, 480, 700, 701, 850, 851, 900, 901, 1000, 1001, 1024, 1200, 1440 and 1920 CSS pixels**. Checks cover individual content bounds, internal horizontal overflow and separation of the header controls/wordmark, as well as document width. No horizontal overflow or page errors were found.
- A **320 × 568 touch-emulated phone** flow: save a favourite, open menu/wishlist/search, navigate to Halo, switch thumbnails, zoom, choose Light neutral, adjust quantity, add to bag, update bag quantity and reach checkout's unavailable message.
- Mobile icon, favourite, finish and newsletter controls have at least **44 × 44px** touch areas. At **320 × 320**, the bag content scrolls while Close remains in the viewport; delivery information and accordions work. At **568 × 320** landscape, menu navigation and the filtered collection remain usable.
- The new privacy policy was checked separately at **280, 320, 390, 768, 1024 and 1440px**: footer navigation, direct reload, page title and content bounds passed without overflow or page errors. The six existing browser tests were rerun after adding its footer link and all passed. Its 320px capture was visually reviewed.

The built subdirectory version was also served with `npm run preview` and checked separately: all six routes returned HTTP 200, each refreshed successfully, local fonts/images loaded, category filtering worked, card navigation kept the `/pages/ALDESCA` base, and adding a Halo produced a £325 subtotal. No console/page errors were recorded in that production smoke check.

The final `deploy_out` build was served as the parent website. Its Explore page lists ALDESCA under Guides, Demos & More, and the shared Guides menu links to it. Browser checks confirmed the card/icon, directory search, navigation into ALDESCA, Halo purchase controls, the £325 bag subtotal, privacy-page navigation and direct reload, and a 320px mobile entry without overflow.

## Visual review

The saved screenshots use a clean initial state and wait for fonts and images. Desktop captures use **1024px width and device pixel ratio 1**; mobile captures use **390px width**:

- [Homepage — desktop](screenshots/homepage-desktop.png)
- [Halo product — desktop](screenshots/halo-desktop.png)
- [Homepage — mobile](screenshots/homepage-mobile.png)
- [Halo product — mobile](screenshots/halo-mobile.png)
- [320px overview — home, Halo, collection](screenshots/responsive/slim-mobile-overview.png)
- [Homepage — 320px](screenshots/responsive/home-320.png)
- [Halo product — 320px](screenshots/responsive/halo-320.png)
- [Collection — 320px](screenshots/responsive/shop-320.png)
- [Privacy policy — 320px](screenshots/privacy-320.png)
- [Privacy policy — desktop](screenshots/privacy-1024.png)

The screenshots were visually inspected against the supplied references. Major composition, gutters, sage/ivory surfaces, header, grid proportions and section order are closely reproduced. The page scrolls naturally, without a fixed document height or a scaled screenshot overlay. The follow-up visual audit replaced the earlier fonts with Georgia/Gelasio headings, a Tinos wordmark and Arimo body text, and restored full product-photo framing. The subsequent responsive pass uses fluid gutters/type, content-driven editorial heights, single-column product cards below 360px, stacked mobile product details and scrollable dialog bodies with a persistent close control. The 320px overview, product purchase section, complete 390px homepage and refreshed 1024px desktop captures were visually inspected. See [visual review](VISUAL-REVIEW.md) for the earlier typography measurements and side-by-side comparisons. Exact source font identity cannot be established from the PNGs alone; this is not a pixel-perfect claim.

## Limits

- The privacy notice is marked as a draft because the legal operator, privacy contact and hosting/logging details have not been supplied. Its description of the current storefront was checked against the code; it does not assert that unknown hosting practices or lawful bases have been verified.
- Mobile checks use Chrome's viewport and touch emulation, not physical iOS/Android hardware.
- Images retain native reference resolution. Eight product frames use inspected generative UI-removal edits to preserve their original framing; slight tone/texture changes are possible. Other photographs are direct crops. High-resolution originals are still needed for sharper zoom and large displays. See [asset notes](ASSETS.md).
- Alternative finishes have no matching photographs and do not change the displayed image.
- Payment, accounts, subscriptions, customer support, delivery policies and unsupplied technical facts remain unconnected/unavailable, with contextual messages.
- Publishing is handled through the parent website’s `main` branch and existing hosting integration; this project does not create a separate Sites deployment.
