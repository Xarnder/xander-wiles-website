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

## Architecture

- `src/asr` — Moonshine streaming mic transcription (`useVAD: false`)
- `src/media` — camera+mic capture helpers tuned for iOS / iPadOS Safari & Chrome
- `src/alignment` — pure fuzzy alignment engine (unit-tested)
- `src/scroll` — rAF scroll controller with pace-aware easing
- `src/components` — teleprompter UI

Optional **Record** / **Stop** captures camera+mic independently of **Start** /
**Pause** voice-follow. When both run, they share the same microphone tracks.
On Apple devices recordings prefer MP4 (H.264/AAC).

Model weights for `model/tiny` ship under `public/moonshine/` and are cached by the service worker for offline reuse after the first load. ONNX Runtime / Silero VAD assets are runtime-cached from the CDN on first use.

## Site integration

Linked from the homepage under **Utilities & Productivity** at `/pages/Teleprompter/`.
Root `build.js` builds this app and injects `dist/` into `deploy_out/pages/Teleprompter/`.
