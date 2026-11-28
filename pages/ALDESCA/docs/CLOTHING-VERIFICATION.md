# Clothing release — 28 November 2026

ALDESCA now has a Clothing department alongside Home & Living, with eight illustrative products across womenswear, menswear and accessories. Nine original generated photographs are stored in the repository and served locally as optimized WebP images. Product cards and galleries preserve the full portrait photographs.

## Validation

- `npm run check`: zero errors and warnings.
- All eleven Playwright checks passed across the initial run and targeted reruns after fixes. Coverage includes the six existing storefront checks and five clothing checks.
- Clothing pages checked at 280, 320, 390, 700, 701, 850, 1024 and 1440px: all eight product pages, the department landing page and category view. No horizontal content overflow; all photographs decode successfully.
- Existing homeware routes retain the 280–1920px responsive checks and the slim touch-phone shopping flow.
- Clothing checks cover category filters after refresh, cross-department search, required size selection, separate bag lines for different sizes, quantity and removal isolation, mixed homeware/clothing totals, persistent bags, invalid saved sizes, wishlist, left-hand menu and short mobile dialogs.
- Desktop and 320px landing/product screenshots captured in `docs/screenshots/clothing-*.png` and visually reviewed.
- `npm run build:site`: success. Production browser smoke at `/pages/ALDESCA/` verified all 16 static routes and a 320px sized clothing add-to-bag flow without page errors or failed responses.

The first test run exposed a narrow category heading overflow, a case-sensitive test selector mismatch and lazy-image screenshot waits. The heading now wraps, the test selector matches the accessible name, and screenshot checks explicitly load all images. Photo manifests were moved from `static/` into `src/lib/assets/` to eliminate Vite public-directory import warnings; both asset-preparation scripts write the new paths.

The clothing prices, sizes and imagery are illustrative. Checkout, inventory, account sign-in and newsletter submission remain unconnected. Existing local homeware bags remain compatible with the optional size field.
