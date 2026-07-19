# Journal PWA Reliability Guide

> Read this before changing `pages/journal`. The Journal must always remain usable for writing, especially as an iOS home-screen PWA.

## Architecture

- React/Vite app hosted at `/pages/journal/`.
- `BrowserRouter` uses `basename="/pages/journal"`.
- Entries are Firestore documents at `users/{uid}/entries/{yyyy-MM-dd}`.
- `CalendarView` owns the nested `/entry/:date` route and renders `EntryEditor`.
- Local AI summaries and Harper proofreading are optional enhancements. They must never block entry loading or writing.

## Non-negotiable reliability rules

1. **Use absolute app routes.** Navigate to entries with `/entry/${dateKey}`, never `entry/${dateKey}`. Relative navigation from an existing entry can create `/entry/entry/...` and a blank outlet.
2. **Never allow indefinite loading.** Firestore reads must retain a timeout, cached fallback, retry UI, and stale-request protection when the date, user, or component changes.
3. **Keep malformed-route recovery.** `App.jsx` redirects `entry/*` routes that do not match `/entry/:date` back to the calendar.
4. **Writing must survive optional feature failures.** Do not make EasyMDE, Harper, local AI, WebGPU, external CDNs, or image tools prerequisites for displaying the editor.
5. **Preserve the iOS standalone fallback.** `EntryEditor` deliberately uses a native `<textarea>` in an iOS home-screen PWA. Do not remove it without successful testing on physical iPhones/iPads after backgrounding and resuming the app.
6. **Never render a blank entry panel.** Keep an error boundary around the entry route and provide visible recovery actions for every load or render failure.
7. **Do not overwrite another day's state.** Ignore results from superseded asynchronous requests and remount/reset date-specific editor state when the route date changes.
8. **Treat app suspension as normal.** iOS may pause timers and Firestore connections. Loading, saving, and retry flows must recover after the app returns from the background.
9. **Protect user text first.** Refactors must not clear editor state, navigate away, or replace cached content merely because an optional network request failed.
10. **Keep editor APIs correctly separated.** `getMdeInstance` returns EasyMDE; clipboard and Harper require CodeMirror from `getCodemirrorInstance`. Never pass the EasyMDE object to CodeMirror-only methods such as `setOption`, `markText`, `on`, or `off`.
11. **Validate persisted entry data.** Firestore fields must be normalized before entering React state so malformed text, mood, tag, image, or structured-field values cannot crash rendering.

## Regression history

In July 2026, opening a day could remain on “Summoning your memories...” because `getDoc()` had no timeout. Day switching could also produce a blank page because the calendar used a relative route. Empty days additionally mounted a heavy rich-editor/proofreader stack that was fragile under iOS PWA memory pressure. The safeguards above were added specifically to prevent those failures.

## Required checks for entry-related changes

- Open a day from the calendar in portrait mobile layout.
- In a split/landscape layout, open day A and then day B; the URL must be `/entry/yyyy-MM-dd`, never `/entry/entry/...`.
- Open an empty day in iOS standalone mode and confirm the native textarea accepts and retains text.
- Use **Type clipboard** with the iOS native textarea and confirm text is inserted at the current selection; this feature must not depend solely on an EasyMDE instance.
- Open edit mode outside iOS and confirm the CodeMirror instance initializes without triggering the entry error boundary.
- Simulate Harper startup failure and confirm writing remains available and the expandable iPhone/iPad spelling instructions are readable.
- Simulate a slow or failed Firestore read; the UI must leave loading and show retry/recovery controls.
- Change days rapidly and confirm the final screen matches the final URL.
- Test backgrounding/resuming while loading and while editing.
- Confirm a malformed legacy URL such as `/entry/entry/2026-07-19` returns to the calendar.
- Run `npm --prefix pages/journal run build`.
- Lint changed source files. The broad lint command currently also scans old generated files under `pages/journal/assets`, so distinguish those existing generated-file errors from source errors.

## Build-output warning

The root `.gitignore` ignores `dist/`, although `pages/journal/dist/index.html` is already tracked. A local Vite build rewrites that file to reference ignored hashed assets. Do not commit that rewritten HTML by itself; deployment should build source and publish the matching asset set together.
