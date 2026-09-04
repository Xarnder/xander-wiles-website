# Smart Video to GIF

A local, private browser app that turns a video into a GIF. You choose the maximum file size; the app chooses resolution, frame rate, palette size and dithering so the result stays under that limit.

Nothing is uploaded. Video bytes never leave the browser.

## Run locally

```sh
npm install
npm run dev
```

Then open the printed localhost URL.

```sh
npm run check
npm run lint
npm test
```

## How it works

1. Drop or choose a video. Metadata and a lightweight motion/detail analysis run in the browser.
2. Pick a maximum GIF size (default 10 MB) and optionally trim the clip.
3. A deterministic optimiser estimates the highest-quality settings that should fit.
4. Short sample encodes refine that estimate. A final full encode is the source of truth.
5. FFmpeg’s `palettegen` + `paletteuse` pipeline builds the GIF entirely with [ffmpeg.wasm](https://ffmpegwasm.netlify.app/).

The SvelteKit server is not used for media processing.

## Browser notes

- The first conversion loads a local FFmpeg WebAssembly core (~25–35 MB) from this app, not a CDN. After that, it can work offline from the browser cache.
- Multi-thread encoding needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. `npm run dev` and `npm run preview` set these. Without them the app falls back to the single-thread core.
- Safari and iOS have tighter memory limits. Very large or long videos may fail even though shorter clips work.
- `ffmpeg.wasm` is software-only. Long clips are slow; trim first for better quality and speed.
- Browser-decodable formats (MP4, WebM, MOV, M4V) preview immediately. AVI, MKV and similar containers are accepted and decoded by FFmpeg when the bundled build supports them.
- WebCodecs is used for cheaper frame sampling when `VideoFrame` exists. GIF encoding always goes through ffmpeg.wasm.
- There is no conventional GIF “bitrate” control. Size is governed by resolution, frame rate, colours, dithering and how compressible the picture is.

## Privacy

- No accounts
- No uploads
- No analytics on filenames or media metadata
- Temporary object URLs and FFmpeg virtual files are revoked or deleted after use
