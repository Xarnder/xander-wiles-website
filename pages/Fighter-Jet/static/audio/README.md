# Custom audio (MP3)

Viper Strike ships with **procedural** engine, wind, and combat sounds. You can replace
individual cues by dropping **your own MP3 files** here (OGG also works if you change the
extension in `src/lib/game/config/assetPaths.ts`).

## File names

Use these exact paths under `pages/Fighter-Jet/static/audio/`:

| File | Used for |
|------|----------|
| `missile-launch.mp3` | Missile fire |
| `explosion.mp3` | Target detonations |
| `lock-tone.mp3` | Target locking (in progress) |
| `lock-confirmed.mp3` | Lock complete |
| `warning.mp3` | Incoming fire / alerts |
| `radio-static.mp3` | Radio message sting |
| `ui-click.mp3` | Menu and UI |
| `mission-success.mp3` | Mission complete |
| `mission-failure.mp3` | Mission failed |
| `engine-loop.mp3` | **Optional** looping engine (replaces synth engine; wind stays procedural) |

Only add the files you want. Anything missing keeps the built-in procedural sound.

## Steps

1. Export or convert your sounds to MP3 (44.1 kHz or 48 kHz mono/stereo both work).
2. Copy them into this folder with the names above.
3. Rebuild or restart dev:

   ```bash
   cd pages/Fighter-Jet
   npm run dev
   ```

   For the full site:

   ```bash
   cd /path/to/xander-wiles-website
   npm run build
   ```

4. Start a mission once (user gesture) so audio can load. Use Settings → volume sliders as usual.

## Tips

- Keep one-shots short (under ~2 s) except `engine-loop.mp3`, which should loop cleanly with no click at the wrap point.
- Normalize levels so explosions are not much louder than UI clicks.
- Use only audio you have rights to use.

To map different filenames, edit `AUDIO_PATHS` in `src/lib/game/config/assetPaths.ts`.
