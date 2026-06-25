# When To Hang — Project Plan

A collaborative scheduling web app where friends mark when they are free on a shared calendar. Authenticated users sign in with Google; guests can participate with only a display name. An event organizer creates an event (e.g. “Dinner”), shares a public link, and everyone highlights availability. The app surfaces overlapping free windows across the group.

**Display name:** When To Hang (future brand: WhenToHang.com)  
**Repo path:** `pages/Group-Availability/`  
**Live URL (v1):** `https://xanderwiles.com/pages/Group-Availability/`  
**Backend:** Supabase (PostgreSQL + Auth + Realtime)  
**Hosting:** Vercel (existing monorepo build pipeline)

> **Decisions locked in** — see [Resolved Product Decisions](#resolved-product-decisions) (sourced from `DECISIONS.md`).

---

## Table of Contents

1. [Product Summary](#1-product-summary)
2. [Resolved Product Decisions](#resolved-product-decisions)
3. [Tech Stack](#2-tech-stack)
4. [User Roles & Flows](#3-user-roles--flows)
5. [Screens & Features](#4-screens--features)
6. [Data Model](#5-data-model)
7. [Supabase Project Setup (Console)](#6-supabase-project-setup-console)
8. [Google OAuth Setup](#7-google-oauth-setup)
9. [Database Schema & Migrations](#8-database-schema--migrations)
10. [Row Level Security (RLS) — Full Policies](#9-row-level-security-rls--full-policies)
11. [Environment Variables & Secrets](#10-environment-variables--secrets)
12. [Client Config Injection (Build-Time)](#11-client-config-injection-build-time)
13. [Custom Domain — xanderwiles.com](#12-custom-domain--xanderwilescom)
14. [Vercel Deployment](#13-vercel-deployment)
15. [Realtime Sync Strategy](#14-realtime-sync-strategy)
16. [Availability Overlap Algorithm](#15-availability-overlap-algorithm)
17. [UI & Styling Specification](#16-ui--styling-specification)
18. [Proposed File Structure](#17-proposed-file-structure)
19. [Implementation Phases](#18-implementation-phases)
20. [Security Checklist](#19-security-checklist)
21. [Testing Plan](#20-testing-plan)

---

## 1. Product Summary

### Core loop

1. **Organizer** signs in with Google → creates an event → receives a shareable link (`/pages/Group-Availability/event.html?slug={slug}`).
2. **Participants** open the link → sign in with Google **or** enter a display name (guest).
3. Each participant paints **1-hour** time blocks on a full-day calendar (00:00–23:59 in the event timezone):
   - **Green** — mostly likely free
   - **Yellow** — might be free
4. **Blind first submission:** others’ availability is hidden until the current user saves their own availability for the first time (prevents anchoring).
5. The **overlap view** ranks mutual free windows (green = 2 pts, yellow = 1 pt).
6. Organizer can **close** the event and set a **last edit deadline** shown to all participants.

### Non-goals (v1)

- Event password protection
- Email/SMS reminders
- Calendar import (Google Calendar sync)
- Recurring events
- Mobile native apps
- Main site nav entry (add after MVP)
- Analytics (not decided — skip unless requested)

---

## Resolved Product Decisions

| Area | Decision |
|------|----------|
| **Branding** | **When To Hang** (future domain: WhenToHang.com) |
| **Slot size** | **60 minutes** — no sub-hour painting; drag paints whole hours only |
| **Daily window** | **Full day** — `00:00`–`23:59` (supports late dinners, games nights) |
| **Event span** | **No max days**; **past dates not selectable** on create |
| **Timezone** | **Organizer picks**; default `Europe/London`; **all participants see event timezone** |
| **Guest name** | Editable anytime |
| **Guest return** | Same browser via `localStorage` token; **Google login unlocks cross-device** |
| **Guest → Google merge** | **Yes** (implement in Phase 2) |
| **Guest security** | Token model acceptable; **no event password** for now |
| **Grid visibility** | **Everyone sees all grids by default**; organizer can change visibility mode per event |
| **Blind submission** | **Hide others’ availability** until current user has saved at least once |
| **Overlap scoring** | Green = 2 pts, yellow = 1 pt; sort by total score |
| **Organizer** | Single creator only; **cannot** edit/delete others’ slots |
| **Event close** | Organizer can close event; **last edit deadline** displayed to all; deadline editable by organizer |
| **Dashboard** | Authenticated users see events created/joined |
| **Landing** | **Public** marketing page with **prominent Google sign-in** up front |
| **Share links** | Auto-generated slug + **optional custom slug** |
| **Google auth** | Any Google account |
| **Data retention** | Organizer sets expiry on create; **default: 7 days after `end_date`** |
| **Paint UX** | Toolbar picks green/yellow; click/drag to paint |
| **Mobile** | **Touch-first** layout and interactions |
| **Nav integration** | Add to main site nav **after MVP** |
| **Accent color** | Cyan/teal `#38bdf8` |
| **Supabase JS** | ESM from `esm.sh` (no separate npm build) |
| **Page structure** | `index.html` + `create.html` + `event.html` |

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | Vanilla HTML/CSS/JS (ES modules) | Matches most `pages/*` apps; touch-first calendar without build step |
| Supabase client | `https://esm.sh/@supabase/supabase-js@2` | No Vite sub-project; works with `build.js` env injection |
| Backend | Supabase | Auth, Postgres, Realtime, RLS |
| Auth | Supabase Auth + Google OAuth | Any Google account; upfront on landing |
| Hosting | Vercel via existing `build.js` | Same deploy path as xanderwiles.com |
| Fonts | Outfit (Google Fonts) | Site-wide; wide modern sans-serif |

---

## 3. User Roles & Flows

### Roles

| Role | How identified | Capabilities |
|------|----------------|--------------|
| **Organizer** | Google account that created the event | Create/edit event, set timezone, visibility mode, edit deadline, close event, delete event |
| **Authenticated participant** | Google sign-in | Paint own availability; cross-device sync; merge guest profile |
| **Guest participant** | Display name + `localStorage` guest token | Paint own availability; edit name; same-browser return |

Organizer **cannot** edit or delete other participants’ availability slots.

### Flow A — Landing & create (organizer)

```
Public landing → Google sign-in (prominent) → Dashboard of my events
  → "Create Event" → title, dates (no past), timezone (default London),
     optional custom slug, data expiry (default end_date + 7 days),
     optional edit deadline
  → Insert event → redirect to event page with share link
```

### Flow B — Join event (authenticated)

```
Open share link → Sign in with Google (or already signed in)
  → Join as participant → Paint calendar (toolbar: green / yellow)
  → First save → unlock view of others' grids (per blind-submission rule)
  → Auto-save debounced to Supabase
```

### Flow C — Join event (guest)

```
Open share link → "Continue as guest" → Enter display name (editable later)
  → guest_token in localStorage → Paint → Save
  → Optional: "Sign in with Google" to merge guest row → cross-device access
```

### Flow D — View overlap & others’ grids

```
Before first save: only own grid + empty/hidden others' section
After first save: full multi-user grid (if visibility_mode = 'all')
  + overlap panel ranked by score (green×2 + yellow×1)
Organizer may set visibility_mode to restrict grids (see data model)
```

### Flow E — Event closed

```
Organizer sets is_closed = true and/or edit_deadline passes
  → UI shows banner with deadline → all slot edits disabled
  → Read-only view of grids + overlap remains
```

---

## 4. Screens & Features

### 4.1 Landing (`index.html`)

- Public glass hero — **When To Hang** branding
- **Sign in with Google** — primary, above the fold
- Short value prop + “Create event” (auth required)
- Authenticated: **dashboard** — events you organized or joined
- Guest users browse via share links only (no dashboard)

### 4.2 Create Event (`create.html`)

Fields:

| Field | Required | Default / rules |
|-------|----------|-----------------|
| Title | Yes | — |
| Start date | Yes | ≥ today |
| End date | Yes | ≥ start date; no max span |
| Timezone | Yes | `Europe/London` |
| Description | No | — |
| Custom slug | No | Auto 8-char if blank; must be unique |
| Data expiry | Yes | Default: `end_date + 7 days` |
| Edit deadline | No | Optional; shown to all; organizer can change later |
| Visibility mode | Yes | Default: `all` (everyone sees all grids after blind unlock) |

Fixed for v1 (not organizer-configurable):

- `day_start_time`: `00:00`
- `day_end_time`: `23:59`
- `slot_minutes`: `60`

On submit → insert `events` + organizer `event_participants` row → navigate to event page.

### 4.3 Event Page (`event.html?slug={slug}`)

Sections:

1. **Header** — title, date range, timezone label, copy-link, participant count
2. **Status bar** — edit deadline countdown; “Event closed” if applicable
3. **Identity bar** — Google avatar/name or guest name + “Sign in to sync across devices”
4. **Paint toolbar** — green brush, yellow brush, eraser; touch-friendly targets (≥ 44px)
5. **Calendar grid** — days × **hourly** slots; click/drag to paint whole hours
6. **Blind gate** — until `has_submitted_availability`, others’ grids hidden with prompt: “Save your availability to see everyone else’s”
7. **Multi-user grid** — all participants’ rows visible (When2meet-style) when unlocked + `visibility_mode = 'all'`
8. **Overlap panel** — ranked best times (score = green×2 + yellow×1)
9. **Organizer controls** — edit deadline, close/reopen event, visibility mode, delete event

### 4.4 Mobile (touch-first)

- Horizontal scroll for day columns OR swipe between days (pick simplest in build)
- Large touch targets on hour cells
- Sticky paint toolbar at bottom on small screens
- `touch-action: manipulation` to reduce scroll/paint conflicts

---

## 5. Data Model

### Entity relationship

```
events (1) ──< event_participants (many)
event_participants (1) ──< availability_slots (many)
```

### `events`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `slug` | `text` UNIQUE | Auto or custom; URL identifier |
| `title` | `text` | “Dinner” |
| `description` | `text` nullable | |
| `organizer_id` | `uuid` FK → `auth.users` | |
| `start_date` | `date` | First day; must be ≥ today on create |
| `end_date` | `date` | No max span |
| `timezone` | `text` | IANA, default `Europe/London` |
| `day_start_time` | `time` | Fixed `00:00` (v1) |
| `day_end_time` | `time` | Fixed `23:59` (v1) |
| `slot_minutes` | `int` | Fixed `60` (v1) |
| `visibility_mode` | `text` | `'all'` (default) \| `'overlap_only'` \| `'organizer_only'` |
| `edit_deadline` | `timestamptz` nullable | Last moment participants can edit |
| `is_closed` | `boolean` | Default `false`; organizer can close early |
| `expires_at` | `timestamptz` | Default `end_date + 7 days` at 23:59 event TZ |
| `created_at` | `timestamptz` | `now()` |
| `updated_at` | `timestamptz` | trigger |

### `event_participants`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `event_id` | `uuid` FK → `events` | |
| `user_id` | `uuid` FK → `auth.users` nullable | Null for guests |
| `guest_token` | `text` nullable | UUID in browser |
| `display_name` | `text` | Editable (guest + auth) |
| `avatar_url` | `text` nullable | Google profile |
| `is_organizer` | `boolean` | Default false |
| `has_submitted_availability` | `boolean` | Default false; set true on first successful slot save |
| `merged_from_guest_token` | `text` nullable | Audit trail when guest merges to Google |
| `created_at` | `timestamptz` | |

**Constraints:**

- Either `user_id` OR `guest_token` must be set.
- `UNIQUE (event_id, user_id)` where `user_id IS NOT NULL`
- `UNIQUE (event_id, guest_token)` where `guest_token IS NOT NULL`

### `availability_slots`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `participant_id` | `uuid` FK → `event_participants` | |
| `event_id` | `uuid` FK → `events` | Denormalized for RLS/realtime |
| `slot_start` | `timestamptz` | UTC; interpreted in event `timezone` |
| `confidence` | `text` | `'likely'` (green) or `'maybe'` (yellow) |
| `created_at` | `timestamptz` | |

**Constraints:**

- `UNIQUE (participant_id, slot_start)`
- `confidence IN ('likely', 'maybe')`
- Slots align to **hour boundaries** in event timezone (client enforces; no half-hour blocks)

### Client-side edit lock

Before any slot write, client checks:

```javascript
const editable = !event.is_closed
  && (!event.edit_deadline || new Date() < new Date(event.edit_deadline))
  && (!event.expires_at || new Date() < new Date(event.expires_at));
```

RLS can optionally mirror this server-side via policies on `availability_slots` INSERT/UPDATE/DELETE.

---

## 6. Supabase Project Setup (Console)

Follow at [https://supabase.com/dashboard](https://supabase.com/dashboard).

### Step 1 — Create organization (if needed)

Sign in → create **Organization** (e.g. “Xander Wiles”).

### Step 2 — Create project (production-minded)

1. **New project** → Name: `when-to-hang` (or preference).
2. Strong **database password** → store in password manager.
3. **Region:** `West EU (London)` (matches default timezone).
4. Treat as production: dedicated project, RLS before launch, never expose `service_role` in client.
5. Wait for provisioning (~2 min).

### Step 3 — Copy credentials

**Project Settings → API:**

| Field | Env var |
|-------|---------|
| Project URL | `SUPABASE_URL` |
| anon public key | `SUPABASE_ANON_KEY` |
| service_role key | **Never in client** |

**Project Settings → General → Reference ID** — for dashboard URLs only.

### Step 4 — Enable Google provider

**Authentication → Providers → Google** → paste Client ID + Secret (Section 7).

### Step 5 — Auth URLs

**Authentication → URL Configuration:**

| Setting | Production | Local dev |
|---------|------------|-----------|
| Site URL | `https://xanderwiles.com` | `http://localhost:5500` |
| Redirect URLs | `https://xanderwiles.com/pages/Group-Availability/**` | `http://localhost:5500/pages/Group-Availability/**` |

Add `https://*.vercel.app/pages/Group-Availability/**` for previews.

> When **WhenToHang.com** launches, add that domain here and in Google OAuth origins.

### Step 6 — Run migrations

SQL Editor → run [Section 8](#8-database-schema--migrations) then [Section 9](#9-row-level-security-rls--full-policies).

### Step 7 — Realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE availability_slots;
ALTER PUBLICATION supabase_realtime ADD TABLE event_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE events;
```

### Step 8 — Verify RLS

```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('events', 'event_participants', 'availability_slots');
```

---

## 7. Google OAuth Setup

### Google Cloud Console

1. [Google Cloud Console](https://console.cloud.google.com/) → project e.g. `when-to-hang`.
2. **OAuth consent screen** — External; app name **When To Hang**; domains: `xanderwiles.com`, `supabase.co` (add `whentohang.com` later).
3. Scopes: `email`, `profile`, `openid`.
4. **Credentials → OAuth client ID → Web application:**
   - **Origins:** `https://xanderwiles.com`, `http://localhost:5500`, `https://YOUR_PROJECT_REF.supabase.co`
   - **Redirect URI (only):** `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
5. Paste Client ID + Secret into Supabase Google provider.
6. **Publish app** when ready for public use.

**Auth scope:** any Google account (no domain restriction).

---

## 8. Database Schema & Migrations

```sql
-- ============================================================
-- When To Hang — Schema
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE public.events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL UNIQUE,
  title            text NOT NULL,
  description      text,
  organizer_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  timezone         text NOT NULL DEFAULT 'Europe/London',
  day_start_time   time NOT NULL DEFAULT '00:00',
  day_end_time     time NOT NULL DEFAULT '23:59',
  slot_minutes     int NOT NULL DEFAULT 60 CHECK (slot_minutes = 60),
  visibility_mode  text NOT NULL DEFAULT 'all'
    CHECK (visibility_mode IN ('all', 'overlap_only', 'organizer_only')),
  edit_deadline    timestamptz,
  is_closed        boolean NOT NULL DEFAULT false,
  expires_at       timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.event_participants (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                   uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  user_id                    uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  guest_token                text,
  display_name               text NOT NULL,
  avatar_url                 text,
  is_organizer               boolean NOT NULL DEFAULT false,
  has_submitted_availability boolean NOT NULL DEFAULT false,
  merged_from_guest_token    text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (user_id IS NOT NULL AND guest_token IS NULL)
    OR (user_id IS NULL AND guest_token IS NOT NULL)
  )
);

CREATE UNIQUE INDEX event_participants_user_unique
  ON public.event_participants (event_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX event_participants_guest_unique
  ON public.event_participants (event_id, guest_token)
  WHERE guest_token IS NOT NULL;

CREATE INDEX idx_participants_event ON public.event_participants (event_id);

CREATE TABLE public.availability_slots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.event_participants (id) ON DELETE CASCADE,
  event_id       uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  slot_start     timestamptz NOT NULL,
  confidence     text NOT NULL CHECK (confidence IN ('likely', 'maybe')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, slot_start)
);

CREATE INDEX idx_availability_event_start
  ON public.availability_slots (event_id, slot_start);

CREATE INDEX idx_events_slug ON public.events (slug);

CREATE OR REPLACE FUNCTION public.generate_event_slug()
RETURNS text AS $$
DECLARE
  chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result text := '';
  i int;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Optional: pg_cron job to purge expired events (Supabase Pro)
-- DELETE FROM public.events WHERE expires_at < now();
```

### Default `expires_at` on insert (client or DB trigger)

Client computes: end of `end_date` in event timezone + 7 days. Example for London:

```javascript
// expires_at = end_date 23:59:59 in Europe/London + 7 days
```

---

## 9. Row Level Security (RLS) — Full Policies

```sql
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;

-- EVENTS
CREATE POLICY "events_select_public"
  ON public.events FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "events_insert_organizer"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "events_update_organizer"
  ON public.events FOR UPDATE TO authenticated
  USING (organizer_id = auth.uid())
  WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "events_delete_organizer"
  ON public.events FOR DELETE TO authenticated
  USING (organizer_id = auth.uid());

-- PARTICIPANTS
CREATE POLICY "participants_select_public"
  ON public.event_participants FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "participants_insert_auth"
  ON public.event_participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "participants_insert_guest"
  ON public.event_participants FOR INSERT TO anon
  WITH CHECK (user_id IS NULL AND guest_token IS NOT NULL);

CREATE POLICY "participants_update_auth"
  ON public.event_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "participants_update_guest"
  ON public.event_participants FOR UPDATE TO anon
  USING (
    guest_token IS NOT NULL
    AND guest_token = current_setting('request.headers', true)::json->>'x-guest-token'
  )
  WITH CHECK (
    guest_token = current_setting('request.headers', true)::json->>'x-guest-token'
  );

CREATE POLICY "participants_delete_auth"
  ON public.event_participants FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_participants.event_id AND e.organizer_id = auth.uid()
    )
  );

-- SLOTS — helper: event still open for edits
CREATE OR REPLACE FUNCTION public.event_allows_edits(p_event_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = p_event_id
      AND e.is_closed = false
      AND (e.edit_deadline IS NULL OR e.edit_deadline > now())
      AND e.expires_at > now()
  );
$$ LANGUAGE sql STABLE;

CREATE POLICY "slots_select_public"
  ON public.availability_slots FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "slots_insert_auth"
  ON public.availability_slots FOR INSERT TO authenticated
  WITH CHECK (
    public.event_allows_edits(event_id)
    AND EXISTS (
      SELECT 1 FROM public.event_participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid()
        AND p.event_id = availability_slots.event_id
    )
  );

CREATE POLICY "slots_insert_guest"
  ON public.availability_slots FOR INSERT TO anon
  WITH CHECK (
    public.event_allows_edits(event_id)
    AND EXISTS (
      SELECT 1 FROM public.event_participants p
      WHERE p.id = participant_id
        AND p.guest_token = current_setting('request.headers', true)::json->>'x-guest-token'
        AND p.event_id = availability_slots.event_id
    )
  );

CREATE POLICY "slots_update_auth"
  ON public.availability_slots FOR UPDATE TO authenticated
  USING (
    public.event_allows_edits(event_id)
    AND EXISTS (
      SELECT 1 FROM public.event_participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "slots_delete_auth"
  ON public.availability_slots FOR DELETE TO authenticated
  USING (
    public.event_allows_edits(event_id)
    AND EXISTS (
      SELECT 1 FROM public.event_participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "slots_delete_guest"
  ON public.availability_slots FOR DELETE TO anon
  USING (
    public.event_allows_edits(event_id)
    AND EXISTS (
      SELECT 1 FROM public.event_participants p
      WHERE p.id = participant_id
        AND p.guest_token = current_setting('request.headers', true)::json->>'x-guest-token'
    )
  );
```

### Guest token header

```javascript
const guestToken = localStorage.getItem(`wth_guest_${eventId}`);
const supabase = createClient(url, anonKey, {
  global: { headers: { 'x-guest-token': guestToken ?? '' } }
});
```

### Guest → Google merge (Phase 2)

1. Guest has `participant_id` + `guest_token` in localStorage.
2. User signs in with Google.
3. If no existing participant row for that `user_id` on event:
   - `UPDATE event_participants SET user_id = auth.uid(), guest_token = NULL, merged_from_guest_token = <old token> WHERE id = <guest participant id>` (via RPC or careful policy).
4. Clear guest token from localStorage.

---

## 10. Environment Variables & Secrets

| Variable | Client? | Vercel? | Notes |
|----------|---------|---------|-------|
| `SUPABASE_URL` | Yes | Yes | Public |
| `SUPABASE_ANON_KEY` | Yes | Yes | Public with RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **Never** | Server only | Not needed for v1 |

### `.env.local` (repo root, not committed)

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

### Vercel

Add both vars for Production, Preview, Development → redeploy.

---

## 11. Client Config Injection (Build-Time)

Uses existing `build.js` `process.env.*` replacement.

### `supabase-config.js`

```javascript
export const supabaseConfig = {
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
};
```

### `js/supabase-client.js`

```javascript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabaseConfig } from '../supabase-config.js';

export function createSupabaseClient(guestToken) {
  return createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    global: {
      headers: guestToken ? { 'x-guest-token': guestToken } : {}
    }
  });
}
```

---

## 12. Custom Domain — xanderwiles.com

### Vercel

App at `https://xanderwiles.com/pages/Group-Availability/`. Future: point `whentohang.com` to same deployment or subdirectory.

### Supabase Auth

- **Site URL:** `https://xanderwiles.com`
- **Redirect URLs:** `https://xanderwiles.com/pages/Group-Availability/**`

### Google OAuth

- **Origins:** `https://xanderwiles.com`
- **Redirect:** `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` only

---

## 13. Vercel Deployment

Static app copied by `build.js` — do not exclude `pages/Group-Availability`.

```javascript
const redirectTo = `${window.location.origin}/pages/Group-Availability/event.html?slug=${slug}`;
await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
```

---

## 14. Realtime Sync Strategy

Subscribe on event page to `availability_slots`, `event_participants`, and `events` (for deadline/close changes).

**Blind submission:** realtime updates for **other** participants’ slots are ignored in UI until `has_submitted_availability === true` for current user (still receive overlap counts if in overlap-only mode).

### Write path

1. Paint hour cell(s) — optimistic UI.
2. Debounce 400 ms → upsert/delete slots.
3. On first successful write batch → `UPDATE event_participants SET has_submitted_availability = true`.
4. Unlock others’ grid view.

---

## 15. Availability Overlap Algorithm

```
1. Load all slots for event_id
2. Group by slot_start (hourly, event timezone labels)
3. Per slot:
     likely_count = count confidence 'likely'
     maybe_count  = count confidence 'maybe'
     score = likely_count * 2 + maybe_count
4. Sort by score DESC, then likely_count DESC
5. Merge adjacent hours with identical participant sets into ranges
6. Display top ranges: "Sat 7 Jun, 6–9 pm — score 11 (4 green, 3 yellow)"
```

**Visibility modes (organizer setting):**

| Mode | After blind unlock |
|------|-------------------|
| `all` | Full multi-user grid + overlap |
| `overlap_only` | Overlap panel only (no per-person rows) |
| `organizer_only` | Only organizer sees per-person rows; others see overlap only |

**Timezone:** all slot labels rendered in **event `timezone`**, not browser local.

---

## 16. UI & Styling Specification

### Branding

- Title: **When To Hang**
- Accent: cyan/teal `#38bdf8` — buttons, glows, links

### Background

- Deep gradient (`#0a0a1a` → `#1a0a2e` → `#0d0d1f`)
- 2–3 drifting blurred orbs

### Glass cards

```css
.glass-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  border-radius: 16px;
}
```

### Buttons

- Cyan neon border/glow on hover — **no** `translateY` lift

```css
.btn-primary:hover {
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.5), 0 0 40px rgba(56, 189, 248, 0.2);
}
```

### Calendar

| State | Color |
|-------|-------|
| Likely free | `#22c55e` |
| Maybe free | `#eab308` |
| Hour cells | min-height 44px for touch |

### Sliders (threshold filters, if added)

- Track thicker than thumb; end padding so thumb doesn’t touch edge.

---

## 17. Proposed File Structure

```
pages/Group-Availability/
├── PLAN.md
├── DECISIONS.md
├── index.html              ← public landing + Google auth + dashboard
├── create.html             ← create event form
├── event.html              ← calendar + overlap + organizer controls
├── styles.css
├── supabase-config.js
├── js/
│   ├── supabase-client.js
│   ├── auth.js
│   ├── api.js
│   ├── calendar.js         ← hourly grid, touch paint
│   ├── overlap.js
│   ├── realtime.js
│   ├── guest.js            ← token, name edit, merge hook
│   ├── blind-gate.js       ← hide/show others until first save
│   └── utils.js            ← timezone, debounce, slug helpers
└── site.webmanifest        ← optional
```

---

## 18. Implementation Phases

### Phase 1 — MVP

- [ ] Supabase schema + RLS + Realtime
- [ ] Env injection on Vercel
- [ ] Google auth on production domain
- [ ] Public landing with upfront Google sign-in
- [ ] Create event (dates, timezone, slug, expiry, deadline)
- [ ] Event page: hourly paint, green/yellow toolbar, touch-first
- [ ] Blind submission gate
- [ ] Multi-user grid when unlocked (`visibility_mode = all`)
- [ ] Overlap ranking (green×2 + yellow×1)
- [ ] Edit deadline display + `is_closed` read-only mode
- [ ] Guest flow + localStorage return
- [ ] Authenticated dashboard

### Phase 2 — Polish

- [ ] Realtime sync
- [ ] Guest → Google merge
- [ ] Organizer: change visibility mode, edit deadline, close event
- [ ] Mobile polish (sticky toolbar, scroll UX)
- [ ] Loading/error toasts
- [ ] Favicon + PWA manifest

### Phase 3 — Post-MVP

- [ ] Main site nav entry (`nav-loader.js`)
- [ ] WhenToHang.com domain cutover
- [ ] Export overlap summary (copy / ICS)
- [ ] Scheduled purge of expired events (pg_cron or Edge Function)
- [ ] Rate limiting if needed

---

## 19. Security Checklist

- [ ] RLS on all tables
- [ ] `service_role` never in client
- [ ] `.env.local` gitignored
- [ ] Guest tokens UUID v4
- [ ] Slot writes blocked when event closed / past deadline (RLS + client)
- [ ] Redirect URLs domain-restricted
- [ ] No event password in v1 (link = access)

---

## 20. Testing Plan

| Test | Expected |
|------|----------|
| Google login (any account) | Session established; dashboard visible |
| Create event | No past dates; default London TZ; expiry = end + 7d |
| Custom slug | Unique slug works; duplicate rejected |
| Hourly paint | Only whole hours; 60-min slots in DB |
| Blind gate | Others hidden until first save |
| After save | All grids visible (mode `all`) |
| Overlap score | 2 greens + 1 yellow = 5 points for that hour |
| Edit deadline | Banner shown; edits blocked after deadline |
| Close event | Read-only for all participants |
| Guest same browser | Token restores participant |
| Guest → Google merge | Slots follow Google account |
| Mobile touch | 44px targets; paint without accidental scroll |
| RLS | Guest A cannot edit Guest B |
| Timezone | Labels match event TZ, not device TZ |

---

## Quick Reference — Setup Order

1. Create Supabase project (`when-to-hang`, London region).
2. Run schema (Section 8) + RLS (Section 9).
3. Enable Realtime on three tables.
4. Google OAuth → Supabase Google provider.
5. Auth URLs for `xanderwiles.com`.
6. `.env.local` + Vercel env vars.
7. Build frontend in `pages/Group-Availability/`.
8. Deploy → test Google login on live domain.

---

*Product decisions are locked in `DECISIONS.md`. Ready for Phase 1 implementation.*
