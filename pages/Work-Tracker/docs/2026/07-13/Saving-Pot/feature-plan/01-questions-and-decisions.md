# Work Tracker — Saving Pots: Questions and Decisions

**Feature cycle:** 2026-07-13  
**Status:** Locked (2026-07-13) — ready for implementation pending approval of Phase 1.

**Decision status legend:**


| Status                | Meaning                                                   |
| --------------------- | --------------------------------------------------------- |
| `Needs user answer`   | Blocks or strongly shapes implementation — waiting on you |
| `Recommended default` | Sensible default if you want to defer                     |
| `Safe to decide now`  | Can be decided during implementation without your input   |


---

## Locked decision summary

| Q | Decision | Status |
|---|----------|--------|
| Q1 | **B + E** — Net after percentage cuts + user-selectable pool scope in Settings | `Locked` |
| Q2 | **A** — Break-adjusted effective earnings | `Locked` |
| Q3 | **A** — Derived pool + stored per-item assignments | `Locked` |
| Q4 | **A** — Cumulative partial assignments | `Locked` |
| Q5 | **A** — Cap at remaining cost | `Locked` |
| Q6 | **A** — Fully funded badge only; manual Date Bought | `Locked` |
| Q7 | **A** — Soft warning + block new assigns until withdraw | `Locked` |
| Q8 | **A** — Partial and full withdraw | `Locked` |
| Q9 | **A** — `savedAmount` on `timeCostItems` | `Locked` |
| Q10 | **B** — Time Cost integration + dashboard widget | `Locked` |
| D1 | Sign-in required | `Locked` |
| D2 | `state.currentCurrency` | `Locked` |
| D3 | 2 decimal places | `Locked` |
| D4 | Validated Firestore writes (virtual estimate) | `Locked` |
| D5 | Reuse modal patterns | `Locked` |
| D6 | No Cloud Functions | `Locked` |
| D7 | No remote feature flag | `Locked` |

---

## Earnings pool

### Question 1: What earnings count toward the assignable pool?

- **Status**: `Needs user answer`
- **Why it matters**: This defines the “money you have made” baseline. All-time gross earnings feels generous; after-cuts net earnings matches take-home thinking; period-scoped pools (e.g. this month only) change motivation and math when sessions are edited. Wrong choice makes progress bars feel wrong or unfair.
- **Recommended Default**: **All-time net earnings (after percentage cuts, break-adjusted)** — sum of effective session earnings from `state.allSessions` with `getAmountAfterPercentageCuts()` applied per session, matching the “After Cuts” display mode users already see in stats.
- **Options**:
  - [ ] A — All-time gross earnings (before percentage cuts)
  - [x] B — All-time net earnings after percentage cuts (recommended)
  - [ ] C — Rolling window only (e.g. last 30 days / custom stats period)
  - [ ] D — Calendar month to date only
  - [x] E — User-selectable pool scope in Settings
  - [ ] Custom/Other: 
- **Your Answer**: After percenrage cuts and Selectable pool scope in settings

---



### Question 2: Should break-adjusted session earnings be used for the pool?

- **Status**: `Recommended default`
- **Why it matters**: Stats widgets subtract overlapping break time from hours and earnings. Using gross session `earnings` while stats show net values would make the Saving Pot pool disagree with dashboard totals. Using break-adjusted values keeps one source of truth but requires recomputing on every session/break change.
- **Recommended Default**: **Yes — use break-adjusted effective earnings** via existing `getEffectiveSessionMetrics()` / period total helpers in `utils.js`, consistent with stats widgets.
- **Options**:
  - [x] A — Yes, break-adjusted (recommended) Always use net earnings
  - [ ] B — No, use raw `session.earnings` field only
  - [ ] Custom/Other: 
- **Your Answer**: 

---



## Allocation model



### Question 3: How should allocations relate to session history?

- **Status**: `Needs user answer`
- **Why it matters**: Determines whether deleting a session automatically reduces available money, or whether assignments are an independent ledger. **Derived pool** stays honest but can strand assignments when history changes. **Independent ledger** is simpler mentally (“I assigned £500”) but can drift from actual earnings unless reconciled.
- **Recommended Default**: **Derived pool with stored assignments** — pool = computed from sessions (Q1/Q2); assignments stored as amounts per item; unassigned = pool − sum(assignments). Session edits recalculate pool; if assigned > pool, show a warning state (see Q7).
- **Options**:
  - [x] A — Derived pool + stored per-item assignments (recommended)
  - [ ] B — Independent ledger: assignments are manual deposits unrelated to live session totals
  - [ ] C — Link assignments to specific session IDs (earmark this session’s earnings)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 4: Can one Saved Item receive money from multiple assignments over time?

- **Status**: `Recommended default`
- **Why it matters**: Real saving is incremental (£20 today, £50 next week). If only one-shot full assignment is allowed, UX is brittle. If unlimited partial assignments are allowed, we need a transaction log or a single cumulative `savedAmount` field per item.
- **Recommended Default**: **Yes — cumulative partial assignments** with optional assignment history (see Q9).
- **Options**:
  - [x] A — Yes, cumulative partial assignments (recommended)
  - [ ] B — One assignment per item only (set once)
  - [ ] C — Assign only in fixed increments (e.g. whole pounds)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 5: Can assigned amount exceed an item’s remaining cost?

- **Status**: `Recommended default`
- **Why it matters**: Allowing over-funding creates “surplus” per item that must go somewhere on withdraw or item delete. Capping at remaining cost keeps math simple: saved ≤ cost, remaining = cost − saved.
- **Recommended Default**: **No — cap assignment at remaining cost** for that item.
- **Options**:
  - [x] A — No, cap at remaining cost (recommended)
  - [ ] B — Yes, allow over-funding (track surplus separately)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 6: What happens when an item is fully funded?

- **Status**: `Needs user answer`
- **Why it matters**: Drives completion UX and whether `dateBought` is auto-set. Auto-setting date may be wrong if user is still saving physically. Doing nothing leaves fully funded items visually identical to partial ones.
- **Recommended Default**: **Show “Fully funded” badge + optional prompt to set Date Bought** — do not auto-write `dateBought` without confirmation.
- **Options**:
  - [x] A — Visual “Fully funded” state only; user sets Date Bought manually (recommended)
  - [ ] B — Auto-set `dateBought` to today when saved ≥ cost
  - [ ] C — Prompt modal: “Mark as bought?” with confirm/cancel
  - [ ] D — Move item to a separate “Funded / Purchased” list
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 7: What if total assigned exceeds the earnings pool after a session delete or edit?

- **Status**: `Needs user answer`
- **Why it matters**: With a derived pool (Q3A), this will happen in edge cases. Options range from hard-blocking session deletes to soft warnings with negative unassigned balance. Wrong policy erodes trust in the numbers.
- **Recommended Default**: **Soft warning** — show “Over-assigned by £X” banner; block *new* assignments until resolved; allow user to **withdraw** from items (see Q8); do not auto-claw-back assignments silently.
- **Options**:
  - [x] A — Soft warning + block new assignments until user withdraws (recommended)
  - [ ] B — Auto-reduce assignments pro-rata across items
  - [ ] C — Hard block session delete/edit if it would cause over-assignment
  - [ ] D — Allow negative unassigned balance (display only)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 8: Can the user withdraw / unassign money from an item?

- **Status**: `Needs user answer`
- **Why it matters**: Without withdraw, mistaken assignments are permanent unless items are deleted. With withdraw, users can reallocate between goals. Withdraw also resolves Q7 over-assignment.
- **Recommended Default**: **Yes — allow partial or full withdraw** from any item back to unassigned balance.
- **Options**:
  - [x] A — Yes, partial and full withdraw (recommended)
  - [ ] B — Full withdraw only (reset item to £0 saved)
  - [ ] C — No withdraw; only delete item to release funds
  - [ ] Custom/Other: 
- **Your Answer**: 

---



## Data & UI



### Question 9: Store allocation data where?

- **Status**: `Recommended default`
- **Why it matters**: Extending `timeCostItems` docs is simplest (one read, one item row). A separate `savingPots` collection enables assignment history and cleaner rules but adds joins and sync complexity.
- **Recommended Default**: **Extend each** `timeCostItems` **doc with** `savedAmount` **(number, default 0)**; optional subcollection `allocations/{id}` for history if you want an audit trail in v1.
- **Options**:
  - [x] A — Add `savedAmount` on each `timeCostItems` document (recommended)
  - [ ] B — Separate `users/{uid}/savingPots/{itemId}` documents mirroring items
  - [ ] C — Single `users/{uid}/settings/savingPots` doc with a map of itemId → savedAmount
  - [ ] D — A + assignment history subcollection per item
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 10: Where should Saving Pots UI live?

- **Status**: `Needs user answer`
- **Why it matters**: Determines HTML structure, widget order, and whether dashboard users see savings without opening Time Cost. Split UI increases build scope; Time Cost-only keeps feature cohesive with Saved Items.
- **Recommended Default**: **Time Cost view primary** — integrate progress + assign/withdraw into Saved Items table; add compact summary strip (pool / unassigned). **Optional** dashboard widget in a follow-up unless you want it in v1.
- **Options**:
  - [ ] A — Time Cost view only — integrated into Saved Items (recommended)
  - [x] B — Time Cost view + new dashboard widget (`widget-saving-pots`)
  - [ ] C — Dedicated fourth top-level tab “Saving Pots”
  - [ ] D — Modal-only flows launched from Saved Items row actions
  - [ ] Custom/Other: 
- **Your Answer**: 

---



## Safe to decide now (no answer required)

These can be locked during implementation unless you object:


| ID  | Decision                                                                        | Status                                      |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------- |
| D1  | Require Google sign-in for all Saving Pot writes (same as existing items)       | `Tes sign in reqirued`                     |
| D2  | Use existing `state.currentCurrency` for display; no multi-currency             | `yes` Use existing `state.currentCurrency` |
| D3  | Round displayed amounts to 2 decimal places; store numbers as Firestore doubles | Yes                                         |
| D4  | Use Firestore transactions for assign/withdraw when updating `savedAmount`      | Okay but it's more estimate                 |
| D5  | Reuse existing modal/confirm patterns (`showConfirm`, `showAlert`)              | Yes                                         |
| D6  | No Cloud Functions — client-side compute + Firestore rules validation           | If you recomend that                        |
| D7  | Feature ships behind no remote flag; rollback via git revert + rules deploy     | If you recomend that                        |


---



## After you answer

1. Update this file with your choices (or tell the agent to lock them).
2. Revise `[02-technical-plan.md](./02-technical-plan.md)` “Locked decisions” section.
3. Begin implementation per the technical plan.

