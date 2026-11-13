# Dependency maintenance

Use Node 22.17 or later (the current Node 22 release selected by `nvm install` is suitable).
Run `npm ci` to reproduce the committed dependency trees. Root `npm run build` also uses
`npm ci` for every bundled app. App `.npmrc` files enable `install-links` so local patched
packages and their dependencies are copied into `node_modules` on a clean install.

The November 2026 security update upgrades SvelteKit apps to v3 and compatible adapters,
Svelte, Vite and TypeScript. Configuration now lives in `vite.config.ts`; imports use
`#lib`, TypeScript extends `$app/tsconfig`, and public settings used by Routine and
Playlist Deck are explicitly declared in `src/env.ts` for static builds. These changes
follow the [SvelteKit migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3).

## Local compatibility packages

- `vendor/deepmerge` contains the MIT-licensed deepmerge 4.3.1 CommonJS implementation and
  types, with a small security backport for
  [CVE-2026-93753](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). There is no published
  upstream fix. Both source and target keys reject `__proto__`, `constructor` and
  `prototype`, and writes use own data properties. Its private package name and build
  metadata distinguish this patched copy from the vulnerable registry release. The
  regression tests cover the reported null-prototype/null-placeholder attack paths,
  target copying, nested arrays and ordinary merge options. Remove the override when a
  compatible upstream fix is available, after rerunning those tests and the builds.
- `vendor/minimatch-compat` adapts patched minimatch 11 to the callable CommonJS API still
  expected by Firebase CLI, Jest dependencies and ESLint 9. It preserves named exports,
  `Minimatch`, `match`, `defaults` and brace expansion. Other applications use minimatch
  11 directly. Do not remove the adapter by blindly overriding all consumers to the
  modern namespace API.

Other overrides select patched transitive packages where their parents still pin vulnerable
versions. Keep them until parent updates remove the old dependency chains. Do not use
`npm audit fix --force` indiscriminately: some suggested fixes downgrade whole frameworks.

## Verification

After installing the apps, run `npm run test:security` at the root. Each app retains its
existing unit-test command (`npm test` or `npm run test:unit -- --run`). Journal's optional
Cloud Functions package has its own `npm ci` and `npm test` under `pages/journal/functions`;
its tests mock Cloud Monitoring and do not call the live service. Its configured Node
runtime is now 22. No deployment is needed for local verification.

Run browser tests from their app directory. Forest Drift's focused cross-engine check is
`npx playwright test tests/determinism.e2e.ts`, after `npx playwright install`. On macOS,
its Firefox project uses temporary app-data storage to avoid the protected personal
Firefox directory ([Playwright issue](https://github.com/microsoft/playwright/issues/42768)).
The operating system can purge this temporary storage; the personal Firefox profile is untouched.

Run `npm run build` and `npm run preview` from the root for the complete site. OAuth sign-in,
live cloud data and downloaded AI-model accuracy still require their real accounts/data;
the automated browser suites use local state and mocks where configured.
