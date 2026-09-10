# Still — adaptive breathing

A standalone Svelte 5 / SvelteKit 2 experience using TypeScript and component CSS. No runtime libraries, accounts, storage, or network services are required.

## Develop

```sh
npm install
npm run dev -- --host 127.0.0.1
```

Open `/pages/Breathing-App/` on the printed local origin. `npm run build` produces `dist/`; the root site's `build.js` builds and copies it to `deploy_out/pages/Breathing-App/`. Nothing is published by the app's build command.

## Use

Press the amber point to start or resume immediately, or select **Begin breathing**. Line mode is the default: drag the amber point up to inhale, stay at the top to hold, drag down to exhale, and stay at the bottom to hold. The guide remains stationary during each timed hold. Your own hold ends when you reverse direction. Square mode remains available; switching modes resets calibration. Calibration measures three complete, uninterrupted laps. The mint guide moves independently from the start, using the target as a provisional guide pace until a complete breath is measured. It adopts the measured pace at its next cycle boundary, then gradually slows after calibration. It never snaps to a new position.

Keep tracing your actual breathing, rather than trying to catch the guide. Pause, continue, reset/recalibrate, or change the eventual target from 4–10 breaths/minute. Releasing the point discards only the partial lap, preserving completed calibration breaths and estimates. Arrow keys also move the focused point. Changing tabs pauses the session so background time cannot distort a breath.

## Implementation

- `src/lib/breathing.ts`: pure session engine with an active-time clock, signed circular movement, complete-lap measurement, and guide timing.
- `src/lib/geometry.ts`: shared SVG geometry and pointer projection.
- `src/lib/components/BreathingPath.svelte`: cached path samples, pointer capture, touch scroll prevention, keyboard controls, and rendering.
- `BreathingStats.svelte` / `BreathingControls.svelte`: rate information and controls.
- `src/routes/+page.svelte`: requestAnimationFrame lifecycle, visibility handling, and atmospheric shell.

The duration estimate uses a rolling median of up to five valid breaths followed by a 0.25 exponential moving average of rate. Valid measured rates are 3–30 breaths/minute. Reverse movement does not add completed laps, and discontinuous jumps are rejected.

After three breaths, guide timing uses configurable phase ratios `[0.30, 0.10, 0.45, 0.15]`. At guide cycle boundaries only, its rate moves 12% of the remaining difference toward a comfortable intermediate rate, capped at a 3% change per cycle. That intermediate rate is the greater of the requested target and 88% of the measured user rate. This prevents the guide racing too far ahead of someone's ability to slow down. Further slowing depends on continued user input; without fresh input, guide adaptation freezes. The guide eventually converges toward the target when the user follows it comfortably.

Calibration does not assign a measured user rate until a complete breath is recorded. The provisional guide rate is shown separately. Pauses and interrupted drags never count as breathing time for a completed lap. All displayed rates are self-reported estimates, not sensor measurements.

Decorative motion is disabled with `prefers-reduced-motion`; essential guide movement remains. Touch hit area is 56px, with Pointer Events and pointer capture. The page uses safe-area padding and contains no persistent personal data.

## Verify

```sh
npm run check
npm run lint
npm test
npm run build
```

Unit tests cover calibration, smoothing, seam jitter, reverse movement, shortcuts, interruptions, calibration continuity, convergence, target changes, phase mapping, and pointer projection. Browser verification should additionally trace three real-time laps with mouse and touch input, check measured/guide rates, pause/resume, target adjustment, reset, narrow layouts, and reduced motion.
