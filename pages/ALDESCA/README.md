# ALDESCA

A responsive SvelteKit storefront based on the supplied ALDESCA homepage, Halo product-page and brand references. All interface text, layout, icons and controls are HTML/Svelte/CSS. Homeware photography comes from the supplied references. The Clothing department extends the brand with original AI-generated fashion photography.

## Run

Use **Node 22.17 or later** (22.23.4 was used for the final checks) and npm. From the repository root:

```sh
cd pages/ALDESCA
npm ci
npm run dev -- --host 127.0.0.1 --port 5194
```

Open `http://127.0.0.1:5194/`. If your shell uses an older Node installation, select the repository's Node 22 installation first (for example, `nvm use 22`).

```sh
npm run check
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 5194
```

Tests use an installed Google Chrome by default. To use Playwright's Chromium instead:

```sh
npx playwright install chromium
PW_CHANNEL=chromium npm test
```

`npm run build` creates a fully prerendered static website in `dist/`, served from the domain root. SSR is retained; every product has a physical HTML route and can be loaded/refreshed directly. Query-based filters and saved shopping state initialise after hydration so initial server/client HTML agrees.

## Routes and deployment

- `/` — reference homepage
- `/products/halo-pendant-light/` — reference product page
- `/products/arc-table-lamp/`
- `/products/travertine-coffee-table/`
- `/products/sculptural-ceramic-vase/`
- `/clothing/` — fashion landing and eight clothing/accessory products; filters `womenswear`, `menswear`, `accessories`, `new-in`
- `/products/the-tailored-coat/` and seven additional clothing routes generated from the catalogue
- `/shop/` — homeware products; supports `?category=lighting`, `tables`, `furniture`, `homeware` and `new-in`
- `/privacy-policy/` — responsive privacy notice, linked from every page’s footer

The repository's root `build.js` includes this app. It runs `npm run build:site`, then copies only `dist/` into `deploy_out/pages/ALDESCA/`. This excludes source, original reference PNGs, tests and screenshots from the public website. `build:site` sets the public base to `/pages/ALDESCA`; all product URLs and assets follow that base. The complete root build passed, with a browser smoke check from the Explore page into ALDESCA. The Explore directory and shared Guides menu both link to the storefront. Publishing uses the parent website’s existing hosting integration.

## Structure

- `src/routes` — shared layout, home, catalogue and reusable product route
- `src/lib/catalogue.ts` — typed product data; prices are integer pence
- `src/lib/store.svelte.ts` — per-layout cart and wishlist state through Svelte context
- `src/lib/components` — header/footer, cards, photography, gallery, quantity/finish controls and native dialogs
- `src/lib/styles.css` — exact brand tokens and shared typography
- `src/lib/fonts` — locally hosted WOFF2 files, bundled by Vite
- `static/images` and `src/lib/assets/asset-manifest.json` — photographic crops, responsive variants, alt text, focal points and provenance
- `scripts/prepare-assets.mjs` — repeatable extraction from the original PNGs (`npm run assets`)
- `tests/storefront.spec.ts` — focused Playwright checks and screenshot capture
- `tests/responsive.spec.ts` — all-route layout checks from 280–1920px and a 320px touch shopping flow
- `docs/screenshots` — clean desktop (1024px/DPR 1) and mobile (390px) captures
- `docs/VERIFICATION.md` — checks and known limitations

## Responsive layout

Shared fluid gutters, grid gaps and clamped heading sizes adapt to the viewport while retaining the 1024px reference composition. Editorial sections grow with their content. Product grids use four columns on desktop, two on tablet/mobile, and one below 360px so slim phones retain readable product names and generous photographs. Related products use three desktop columns.

The mobile header keeps the menu, wordmark and bag visible; search, wishlist and account are available in the menu. Purchase controls stack below the gallery, inputs use 16px text, and mobile icon buttons, finish swatches and quantity buttons have at least 44px tap areas. Dialog content scrolls independently of its heading and close button, including in short landscape viewports. No horizontal overflow is hidden to make the layout appear to fit.

See [320px mobile overview](docs/screenshots/responsive/slim-mobile-overview.png), [slim homepage](docs/screenshots/responsive/home-320.png), [slim product page](docs/screenshots/responsive/halo-320.png) and [slim collection](docs/screenshots/responsive/shop-320.png).

## Typography and assets

**Tinos 400** reproduces the uppercase wordmark. **Georgia 400** is used for editorial headings after optical comparison with the references, with locally hosted **Gelasio 400** as its fallback. **Arimo 400/500** supplies the closer Arial-style body text and controls. The PNGs do not identify the original fonts, so these are visual matches rather than claims about source font identity. Georgia uses the reader’s installed system font and is not redistributed. Tinos, Gelasio and Arimo are self-hosted under SIL OFL 1.1; licence copies ship in `static/font-licenses/` and are also in `docs/font-licenses/`.

The raster logo is retained as a brand reference. The live wordmark uses text for sharp rendering at different sizes. No extra logo symbol was introduced.

See `docs/ASSETS.md` for native crop dimensions and limits. Eight product photographs now retain their full reference frames after built-in imagegen edits removed the baked-in hearts and zoom control. Those edits can slightly alter tone and texture; the other photographs remain direct original crops. All assets retain native resolution without upscaling. High-resolution original photographs would be the next asset upgrade, especially for zoom and wide desktop displays. See `docs/VISUAL-REVIEW.md` for side-by-side comparisons and the typography audit.

## Demo assumptions and integration points

- The privacy page describes the current demo’s actual browser storage and unavailable services. It is clearly marked as a draft because the legal operator, privacy contact and hosting/logging arrangements have not been supplied. Confirm those details, lawful bases, retention and transfer arrangements before treating it as a final notice. ICO guidance used for the notice: [privacy information](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-be-informed/) and [storage technologies](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-storage-and-access-technologies/).
- Four homeware products with exact supplied names/prices, plus eight illustrative clothing/accessory products with concept prices. Halo and Vase are explicitly designated as the demo **New In** selection.
- **Light neutral** is the demonstration second Halo finish, not a material claim. Arc Sage and Vase Stone are also demonstration finish options. The cart retains finish identity; photos do not change because matching alternate-finish photographs were not supplied.
- Cart lines are identified by product ID, finish ID and optional clothing size. Quantities are positive integers, capped at 999 per line. The bag count is total units; subtotal is products only, in GBP.
- Cart and wishlist persist in `aldesca:store:v1` in localStorage after browser restoration. Invalid IDs, finishes, sizes, quantities and malformed JSON are rejected. Blocked storage falls back to in-memory operation. Data is local to the device/browser, not synchronised between devices.
- There is no payment backend, real account service, customer-support endpoint or newsletter provider. Those controls explain their status at the point of use. No successful order or subscription is simulated, and newsletter addresses are not stored.
- Dimensions, electrical specifications, certifications, delivery rules and returns promises were not supplied. Editable catalogue descriptions and accordion copy avoid inventing them.
- Replace catalogue content in `catalogue.ts`; connect a real commerce API at the cart/checkout boundary in `ShopPanels.svelte`; connect a newsletter endpoint in `SiteFooter.svelte`. Server validation, inventory, policies, account/session handling and real payment-provider integration are required before enabling transactions.

## Technical references

This project uses Svelte 5 runes and SvelteKit 3 conventions, including Vite-based configuration, `#lib` imports and the current typed path helpers. Consult [SvelteKit 3 migration/configuration](https://svelte.dev/docs/kit/migrating-to-sveltekit-3), [routing](https://svelte.dev/docs/kit/routing), [state management](https://svelte.dev/docs/kit/state-management) and [static generation](https://svelte.dev/docs/kit/adapter-static).

## Clothing department

The shared header and mobile menu switch between Home & Living and Clothing. Clothing has womenswear, menswear and accessories, searchable products, wishlist support, size selection, image zoom, and a shared bag. Homeware bags already saved on a device remain valid. Sized clothing requires a selection; one-size accessories select automatically. Related products stay within their department.

Eight original product photos and one campaign hero were generated with the built-in imagegen tool. Originals and exact prompts are in `source-assets/clothing/`; production WebPs and smaller variants are in `static/images/clothing/`. Run `node scripts/prepare-clothing-assets.mjs` to rebuild optimized images and `src/lib/assets/clothing-asset-manifest.json`. Photographic manifests live in source so Vite can import them without public-directory warnings.

`tests/clothing.spec.ts` covers department navigation, categories, search, mixed bags, separate sizes, persistence, invalid saved sizes, all new routes at 280–1440px, image loading, and a 320px touch flow. Screenshots are saved in `docs/screenshots/clothing-*.png`. Product specifications, actual inventory and checkout remain unconnected.
