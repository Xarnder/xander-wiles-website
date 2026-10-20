# Voice Follow Teleprompter

On-device voice-follow teleprompter built with Vite, React, and TypeScript. Scrolling tracks live speech using Moonshine ASR entirely in the browser — no cloud speech API.

## Develop

```bash
npm install
npm run dev
```

## Test alignment engine

```bash
npm test
```

## Build

```bash
npm run build
npm run preview
```

## Bulletpoint trigger mode

Switch to **Bullets** (header or Settings → Teleprompter mode). The script editor stays the same: one bullet per line, with optional Markdown or numbered markers. Blank lines are ignored. Set a forward phrase (default `next slide`) and a back phrase (default `backwards slide`).

Start the presentation, then say the forward phrase — on its own or inside a sentence — to move to the next point. Say the back phrase to move back one point. Nothing advances on a timer. Previous / Next and the arrow keys are the manual fallback. Pause stops hands-free moves. End returns to the first point. The last point does not move further, and the first point does not move back.

Speech recognition is the on-device Moonshine model already used for voice follow (English). It listens only while this tab is visible and the screen is on. Hiding the tab or locking the phone pauses the microphone; returning to the tab reconnects if the presentation is still running. It does not listen in the background or on the lock screen.

A common trigger such as “next” also matches when you say that word while explaining a point. Use a more specific phrase if that gets in the way.

### Manual microphone check

In Chrome or Safari on desktop, with the tab in the foreground:

1. Switch to Bullets and paste a few lines, one point each.
2. Set the trigger to `moving on` and press Start. Allow the microphone. Wait until the status says it is listening for that phrase.
3. Talk about the current point without saying the phrase. The point should stay put.
4. Say “moving on”. The next point should appear once.
5. Say it again. It should advance one more time, not two.
6. Press Pause, say the phrase, and confirm the point does not change. Resume and say it again — it should advance once.
7. Press Previous, then say the phrase, and confirm it moves forward from the point you stepped back to.
8. On the last point, say the phrase and confirm it stays there.
9. Switch away from the tab. The status should say the microphone paused. Come back and confirm it reconnects instead of pretending it was still listening.
10. Switch to Follow and confirm the same script still scrolls with voice follow.

## Architecture

- `src/asr` — Moonshine streaming mic transcription (`useVAD: false`)
- `src/media` — camera+mic capture helpers tuned for iOS / iPadOS Safari & Chrome
- `src/alignment` — pure fuzzy alignment engine (unit-tested)
- `src/bullets` — bullet parsing, spoken-trigger detection, and recognition restart policy (unit-tested)
- `src/scroll` — rAF scroll controller with pace-aware easing
- `src/components` — teleprompter UI

Optional **Record** / **Stop** captures camera+mic independently of **Start** /
**Pause** voice-follow. When both run, they share the same microphone tracks.
On Apple devices recordings prefer MP4 (H.264/AAC).

Model weights for `model/tiny` ship under `public/moonshine/` and are cached by the service worker for offline reuse after the first load. ONNX Runtime / Silero VAD assets are runtime-cached from the CDN on first use.

## Site integration

Linked from the homepage under **Utilities & Productivity** at `/pages/Teleprompter/`.
Root `build.js` builds this app and injects `dist/` into `deploy_out/pages/Teleprompter/`.
