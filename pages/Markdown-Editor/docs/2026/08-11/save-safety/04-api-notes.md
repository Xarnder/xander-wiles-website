# Save safety — Drive Revisions API notes (Phase 0 / 1)

**Feature cycle:** 2026-08-11  
**Related:** [`03-technical-plan.md`](./03-technical-plan.md)

## Confirmed from Google docs (blob / `.md` uploads)

| Fact | Implication for this app |
|------|--------------------------|
| `revisions.list` returns revision metadata for blob files | History list works without pinning |
| Head revision is never auto-purged | Current content can use `files.get?alt=media` |
| Non-head blob revisions without `keepForever` are purgeable (~30 days / revision pressure) | History depth is not infinite |
| **Downloading** older blob revision media requires `keepForever: true` first | Preview/Restore of older revisions must pin on demand |
| Max **200** `keepForever` revisions per file | Do not pin every autosave; pin only when user previews/restores (and pin pre-restore head) |

## Phase 1 behaviour

1. **List** — `files.revisions.list` + `headRevisionId` from file metadata.
2. **Preview current** — `files.get?alt=media` (no pin).
3. **Preview / restore older** — `revisions.update` `{ keepForever: true }` then `revisions.get?alt=media`.
4. **Restore** — upload selected text via existing `updateFileContent` (new head). Before upload, pin the previous head so it remains downloadable.
5. **Named labels / pruning** — deferred to Phase 4.

## Manual validation checklist

- [ ] Open a `.md` edited by this app → Version history shows ≥1 revision
- [ ] Preview current — text matches editor / Drive
- [ ] Preview an older revision — may show “Protecting revision…” then text
- [ ] Restore older → editor updates; reopen file matches; previous current still listed
- [ ] After restore, Preview of the previous current still works (protected)
