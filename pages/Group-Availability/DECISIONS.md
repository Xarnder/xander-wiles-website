# Group Availability — Decisions & Open Questions

Please answer each section below (you can edit this file directly or reply in chat). Implementation will follow your choices.

---

## 1. App naming & URL

**Question:** What should the app be called in the UI and navigation?


| Option      | URL path                     | Display name       |
| ----------- | ---------------------------- | ------------------ |
| A (default) | `/pages/Group-Availability/` | Group Availability |
| B           | `/pages/When-Free/`          | When Free          |
| C           | `/pages/Sync-Up/`            | Sync Up            |
| D           | Custom                       | *your answer*      |


**Your answer:**

```
"D" Custom "WhenToHang.com" or "When To Hang"
```

---

## 2. Time slot granularity

**Question:** What is the default slot size when painting the calendar?


| Option          | Slot length                 | Pros         | Cons                           |
| --------------- | --------------------------- | ------------ | ------------------------------ |
| A               | 15 minutes                  | Most precise | More clicks, more DB rows      |
| B (recommended) | 30 minutes                  | Good balance | —                              |
| C               | 60 minutes                  | Simple, fast | Less precise for dinner timing |
| D               | Organizer chooses per event | Flexible     | Slightly more UI               |


**Your answer:**

```
"C" Simple
```

**Follow-up:** Should participants be able to paint partial-hour blocks (e.g. 6:30–8:00) by dragging across multiple slots?

```
No
```

---

## 3. Default daily time window

**Question:** What hours should the calendar show by default for a new event?


| Option          | Range                                      |
| --------------- | ------------------------------------------ |
| A (recommended) | 08:00 – 22:00                              |
| B               | 09:00 – 21:00                              |
| C               | 00:00 – 23:59 (full day)                   |
| D               | Organizer sets on create (already in plan) |


**Your answer:**

```
"C" as you may want dinner and late games night
```

---

## 4. Event date range limits

**Question:** How far ahead can an event span?


| Option          | Limit           |
| --------------- | --------------- |
| A               | Single day only |
| B (recommended) | Up to 7 days    |
| C               | Up to 31 days   |
| D               | No limit        |


**Your answer:**

```
"D" no limit
```

**Follow-up:** Should past dates be selectable when creating an event?

```
No Past dates not selectable
```

---

## 5. Timezone handling

**Question:** Events span multiple timezones if friends are abroad. How should we handle this?


| Option          | Behavior                                                |
| --------------- | ------------------------------------------------------- |
| A (recommended) | Store UTC; display in **each user’s browser timezone**  |
| B               | Organizer picks a timezone; everyone sees that timezone |
| C               | Always Europe/London                                    |
| D               | Show both: “6 pm your time (1 pm ET)”                   |


**Your answer:**

```
"B" Organizer picks a timezone; everyone sees that timezone by default ti is London Time
```

---

## 6. Guest identity & editing

**Question:** Can a guest change their display name after joining?

```
Yes
```

**Your answer:**

```
Yes
```

**Question:** Can a guest edit availability after closing the browser?


| Option          | Behavior                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| A (recommended) | Yes, if they return on the **same browser** (`localStorage` guest token) |
| B               | No — one session only                                                    |
| C               | Email magic link (future)                                                |


**Your answer:**

```
"A" but if they login with email then they can change details
```

**Question:** Should an authenticated user be able to **merge** a guest profile into their Google account (same event)?

```
Yes
```

**Your answer:**

```
Yes
```

---

## 7. Guest security model

**Question:** Guest auth uses a client-generated token in `localStorage` + custom header. Acceptable for friend groups?

```
Yes
```

**Your answer:**

```
Yes
```

**If Yes:** Should we add optional **event password** set by organizer?

```
No not for now
```

**Your answer:**

```
No not for now
```

---

## 8. Who can see individual availability?

**Question:** On the event page, can participants see **each person’s** green/yellow grid, or only the **aggregate overlap**?


| Option          | Privacy                                               |
| --------------- | ----------------------------------------------------- |
| A               | Everyone sees everyone’s grid (like When2meet)        |
| B (recommended) | Default: overlap only; toggle “show individual grids” |
| C               | Only organizer sees individual grids                  |
| D               | Only see your own grid + overlap summary              |


**Your answer:**

```
"A" Everyone can sees everyone avalibiltiy by default but admin can change this 
```

---

## 9. Overlap scoring & filters

**Question:** How should “best time” be ranked?


| Option          | Formula                                                 |
| --------------- | ------------------------------------------------------- |
| A (recommended) | Green = 2 points, Yellow = 1 point; sort by total score |
| B               | Green only counts; yellow ignored unless filter on      |
| C               | Require minimum % of group (slider)                     |
| D               | All of the above as UI toggles                          |


**Your answer:**

```
"A" Green = 2 points, Yellow = 1 point; sort by total score
```

**Question:** Default filter on load?

```
Everyone free (green only) / Best score / 80% threshold / Other: ___
```

**Your answer:**

```
Don't show anyones avaliblity at first, so people are not swayed by other peoples, only show them after they have saved their avaliblity after the first time. 
```

---

## 10. Organizer permissions

**Question:** Can there be multiple organizers per event?

```
No — single creator only (recommended)
```

**Your answer:**

```
No — single creator only
```

**Question:** Can the organizer edit or delete **other people’s** availability?

```
 No (recommended: No)
```

**Your answer:**

```
No
```

**Question:** Can the organizer **close** the event (no more edits)?

```
Yes
```

**Your answer:**

```
Yes and a last edit deadline is displayed to all uses. Admin sets last edit deadline but admin can chagne it later if needed
```

---

## 11. Event discovery

**Question:** Should authenticated users see a **dashboard** of events they created or joined?

```
Yes (recommended)
```

**Your answer:**

```
Yes (recommended) 
```

**Question:** Should the home page be public (marketing) or require sign-in to see anything?

```
Public landing (recommended) 
```

**Your answer:**

```
Public landing but up front login input portal as well, use Google for Authentication
```

---

## 12. Slug / share link format

**Question:** How should event URLs look?


| Option          | Example                                                           |
| --------------- | ----------------------------------------------------------------- |
| A (recommended) | `.../event.html?slug=a8f3k2m1` (random 8 char)                    |
| B               | `.../event.html?slug=dinner-june-7` (user-chosen, must be unique) |
| C               | Both — auto-generate with optional custom slug                    |


**Your answer:**

```
"C" Both — auto-generate with optional custom slug
```

---

## 13. Authentication scope

**Question:** Restrict Google sign-in to specific email domains?


| Option          |                         |
| --------------- | ----------------------- |
| A (recommended) | Any Google account      |
| B               | Only `@xanderwiles.com` |
| C               | Allowlist of emails     |


**Your answer:**

```
"A" Any Google account
```

---

## 14. Data retention

**Question:** When should event data be deleted?


| Option          |                                         |
| --------------- | --------------------------------------- |
| A               | Never (manual delete by organizer only) |
| B (recommended) | Auto-delete 90 days after `end_date`    |
| C               | Auto-delete 30 days after `end_date`    |
| D               | Organizer chooses expiry on create      |


**Your answer:**

```
D Organizer chooses expiry on create but by default week after last avalibile date
```

---

## 15. UI interaction model

**Question:** How do users mark availability on the calendar?


| Option          | Interaction                                             |
| --------------- | ------------------------------------------------------- |
| A (recommended) | Click or drag to paint; toolbar selects green vs yellow |
| B               | Click cycles: empty → green → yellow → empty            |
| C               | Two brushes: separate green and yellow drag modes       |


**Your answer:**

```
"A"  Click or drag to paint; toolbar selects green vs yellow
```

**Question:** Mobile primary use case?

```
Important — optimize for touch first / Desktop first
```

**Your answer:**

```
Mobile is important so optimize for touch first
```

---

## 16. Navigation integration

**Question:** Add this app to the main site navigation (`nav-loader.js` / projects list)?

```
After MVP is done (recommended)
```

**Your answer:**

```
After MVP is done
```

---

## 17. Branding & accent colors

**Question:** Accent color for neon buttons/glow?


| Option |                                                   |
| ------ | ------------------------------------------------- |
| A      | Cyan/teal (`#38bdf8`) — cool, matches space theme |
| B      | Site gradient pink-orange (`#FF56A1` → `#FF9350`) |
| C      | Green/yellow match availability colors            |
| D      | Custom: ___                                       |


**Your answer:**

```
"A"  Cyan/teal (#38bdf8) — cool, matches space theme
```

---

## 18. Technical preferences

**Question:** Supabase JS import method?


| Option          |                                                                  |
| --------------- | ---------------------------------------------------------------- |
| A (recommended) | ESM from `https://esm.sh/@supabase/supabase-js@2` (no npm build) |
| B               | Bundle via small Vite sub-project (like journal)                 |


**Your answer:**

```
Whatever you recomend
```

**Question:** Prefer single `event.html` or split create/view into separate pages?

```
index + event + create (plan default)
```

**Your answer:**

```
index + event + create (Seprate)
```

---

## 19. Analytics & error tracking

**Question:** Add privacy-friendly analytics (e.g. Vercel Analytics, Plausible)?

```

```

**Your answer:**

```
No not for now
```

---

## 20. Anything else?

**Free-form requirements, constraints, or features not covered above:**

```
Need dark/light toggle and needs Integrate with WhatsApp share
```

---

## Summary checklist for you

Copy this block, fill in, and send back:

```yaml
app_name:
url_path:
slot_minutes: 15 | 30 | 60 | per-event
day_hours: 08:00-22:00 | other
max_event_days:
timezone: browser | organizer | london | dual-display
guest_name_editable:
guest_return_same_browser:
see_individual_grids: all | overlap-only | organizer-only | own-only
overlap_scoring: weighted | green-only | toggles
multiple_organizers:
organizer_delete_others_slots:
event_dashboard:
slug_style: random | custom | both
google_auth: anyone | domain-restricted
data_retention:
paint_interaction: drag-brush | cycle | dual-brush
mobile_priority:
nav_integration:
accent_color:
supabase_import: esm | vite
extra_notes:
```

