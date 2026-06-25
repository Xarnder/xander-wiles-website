# Group Availability — Project Plan

A collaborative scheduling web app where friends mark when they are free on a shared calendar. Authenticated users sign in with Google; guests can participate with only a display name. An event organizer creates an event (e.g. “Dinner”), shares a public link, and everyone highlights availability. The app surfaces overlapping free windows across the group.

**Planned URL:** `https://xanderwiles.com/pages/Group-Availability/`  
**Backend:** Supabase (PostgreSQL + Auth + Realtime)  
**Hosting:** Vercel (existing monorepo build pipeline)

---

## Table of Contents

1. [Product Summary](#1-product-summary)
2. [Tech Stack](#2-tech-stack)
3. [User Roles & Flows](#3-user-roles--flows)
4. [Screens & Features](#4-screens--features)
5. [Data Model](#5-data-model)
6. [Supabase Project Setup (Console)](#6-supabase-project-setup-console)
7. [Google OAuth Setup](#7-google-oauth-setup)
8. [Database Schema & Migrations](#8-database-schema--migrations)
9. [Row Level Security (RLS) — Full Policies](#9-row-level-security-rls--full-policies)
10. [Environment Variables & Secrets](#10-environment-variables--secrets)
11. [Client Config Injection (Build-Time)](#11-client-config-injection-build-time)
12. [Custom Domain — xanderwiles.com](#12-custom-domain--xanderwilescom)
13. [Vercel Deployment](#13-vercel-deployment)
14. [Realtime Sync Strategy](#14-realtime-sync-strategy)
15. [Availability Overlap Algorithm](#15-availability-overlap-algorithm)
16. [UI & Styling Specification](#16-ui--styling-specification)
17. [Proposed File Structure](#17-proposed-file-structure)
18. [Implementation Phases](#18-implementation-phases)
19. [Security Checklist](#19-security-checklist)
20. [Testing Plan](#20-testing-plan)

---

## 1. Product Summary

### Core loop

1. **Organizer** creates an event → receives a shareable link (`/pages/Group-Availability/event/{slug}`).
2. **Participants** open the link → sign in with Google **or** enter a display name (guest).
3. Each participant paints time blocks on a calendar:
   - **Green** — mostly likely free
   - **Yellow** — might be free
4. The **overlap view** highlights when the most people (or everyone) are free at the same time.

### Non-goals (v1)

- Email/SMS reminders
- Calendar import (Google Calendar sync)
- Recurring events
- Mobile native apps

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | Vanilla HTML/CSS/JS (ES modules) | Matches most `pages/*` apps in this repo; no extra build step unless needed later |
| Backend | Supabase | Auth, Postgres, Realtime, RLS — all sync across devices |
| Auth | Supabase Auth + Google OAuth | Required by spec |
| Hosting | Vercel via existing `build.js` | Same deploy path as the rest of xanderwiles.com |
| Fonts | Outfit (Google Fonts) | Already used site-wide; wide, modern sans-serif |

**Why not Firebase here:** This project explicitly requires Supabase. The To-Do List uses Firebase; this app is independent.

---

## 3. User Roles & Flows

### Roles

| Role | How identified | Capabilities |
|------|----------------|--------------|
| **Organizer** | Google account that created the event | Create/edit event metadata, delete event, view all responses |
| **Authenticated participant** | Google sign-in | Add/edit own availability; name from Google profile |
| **Guest participant** | Display name + browser `localStorage` token | Add/edit own availability for that event only |

### Flow A — Create event (organizer)

```
Home → Sign in with Google → "Create Event"
  → Title, date range, optional description
  → Supabase insert → redirect to event page with share link
```

### Flow B — Join event (authenticated)

```
Open share link → Sign in with Google → Calendar grid loads
  → Paint green/yellow blocks → Auto-save to Supabase (debounced)
```

### Flow C — Join event (guest)

```
Open share link → "Continue as guest" → Enter display name
  → Generate guest_token (UUID) stored in localStorage
  → Paint blocks → Save tied to guest_token
```

### Flow D — View overlap

```
Event page → "Best times" tab (or sidebar)
  → Heatmap / ranked list of slots where N people are free
  → Filter: "everyone free", "≥ 80% free", include yellow or green-only
```

---

## 4. Screens & Features

### 4.1 Landing (`index.html`)

- Glass hero card explaining the app
- **Sign in with Google** (primary CTA)
- **Create event** (requires auth)
- List of events you created or joined (authenticated users only)

### 4.2 Create Event (`create.html` or modal on landing)

Fields:

- Event title (required)
- Start date / end date (required) — bounds the calendar
- Optional description
- Time-of-day range (e.g. 08:00–22:00) — configurable per event
- Slot duration (default 30 min — see DECISIONS.md)

On submit → insert `events` row → navigate to event page.

### 4.3 Event Page (`event.html?slug={slug}`)

Sections:

1. **Header** — event title, date range, copy-link button, participant count
2. **Identity bar** — Google avatar + name, or guest name + “Sign in to sync across devices”
3. **Calendar grid** — days × time slots; click/drag to paint
4. **Legend** — green / yellow / clear
5. **Overlap panel** — best mutual windows
6. **Participants list** — who has responded (privacy: only show names, not individual grids unless toggled)

### 4.4 Overlap visualization options (implement simplest first)

- **Ranked list:** “Sat 7 Jun, 6:00–8:00 pm — 5/6 free (4 green, 1 yellow)”
- **Heatmap row per day** — color intensity = % free
- Optional v2: mini multi-user grid (like When2meet)

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
| `slug` | `text` UNIQUE | Short public ID, e.g. `dinner-jun-7` or random 8-char |
| `title` | `text` | “Dinner” |
| `description` | `text` nullable | |
| `organizer_id` | `uuid` FK → `auth.users` | Set from `auth.uid()` on insert |
| `start_date` | `date` | First day of range |
| `end_date` | `date` | Last day of range |
| `day_start_time` | `time` | Default `08:00` |
| `day_end_time` | `time` | Default `22:00` |
| `slot_minutes` | `int` | Default `30` |
| `created_at` | `timestamptz` | `now()` |
| `updated_at` | `timestamptz` | trigger |

### `event_participants`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `event_id` | `uuid` FK → `events` | |
| `user_id` | `uuid` FK → `auth.users` nullable | Null for guests |
| `guest_token` | `text` nullable | UUID stored in browser; unique per event |
| `display_name` | `text` | From Google or guest input |
| `avatar_url` | `text` nullable | Google profile photo |
| `is_organizer` | `boolean` | Default false |
| `created_at` | `timestamptz` | |

**Constraints:**

- Either `user_id` OR `guest_token` must be set (not both null).
- `UNIQUE (event_id, user_id)` where `user_id IS NOT NULL`
- `UNIQUE (event_id, guest_token)` where `guest_token IS NOT NULL`

### `availability_slots`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `participant_id` | `uuid` FK → `event_participants` | |
| `event_id` | `uuid` FK → `events` | Denormalized for simpler RLS/queries |
| `slot_start` | `timestamptz` | UTC storage |
| `confidence` | `text` | `'likely'` (green) or `'maybe'` (yellow) |
| `created_at` | `timestamptz` | |

**Constraints:**

- `UNIQUE (participant_id, slot_start)`
- `confidence IN ('likely', 'maybe')`

### Indexes

```sql
CREATE INDEX idx_availability_event_start ON availability_slots (event_id, slot_start);
CREATE INDEX idx_participants_event ON event_participants (event_id);
CREATE INDEX idx_events_slug ON events (slug);
```

---

## 6. Supabase Project Setup (Console)

Follow these steps in order at [https://supabase.com/dashboard](https://supabase.com/dashboard).

### Step 1 — Create organization (if needed)

1. Sign in to Supabase.
2. If prompted, create an **Organization** (e.g. “Xander Wiles”).

### Step 2 — Create project in **production** mode

1. Click **New project**.
2. **Name:** `group-availability` (or your preference).
3. **Database password:** Generate a strong password → **save it in a password manager**. You need it for direct DB access; the app does not use it client-side.
4. **Region:** Choose closest to your users (e.g. `West EU (London)` if UK-based).
5. **Pricing plan:** Free tier is fine to start; production workloads may need Pro later.
6. **Important — Production vs Development:**
   - Supabase does not label a toggle “production mode” in the UI.
   - **Treat this project as production** by:
     - Using a dedicated project (not a throwaway dev project).
     - Enabling **Point-in-Time Recovery** if on Pro (Project Settings → Database → Backups).
     - Never exposing the **service_role** key in frontend code.
     - Applying RLS on every table before going live.
7. Click **Create new project** and wait ~2 minutes for provisioning.

### Step 3 — Copy project credentials

1. Go to **Project Settings** (gear icon) → **API**.
2. Copy and store securely:

| Field | Where in dashboard | Used for |
|-------|-------------------|----------|
| **Project URL** | `Project URL` | `SUPABASE_URL` |
| **anon public** key | `Project API keys` → `anon` `public` | `SUPABASE_ANON_KEY` (client-safe with RLS) |
| **service_role** key | `service_role` `secret` | **Server only** — never Vercel env exposed to browser |

3. **Project ID** (reference): **Project Settings → General → Reference ID**  
   Example: `abcdefghijklmnop`. Used in dashboard URLs and docs; the app uses **Project URL**, not the ID alone.

### Step 4 — Enable Google provider

See [Section 7](#7-google-oauth-setup) — configure Google Cloud first, then:

1. **Authentication** → **Providers** → **Google** → Enable.
2. Paste **Client ID** and **Client Secret** from Google Cloud.
3. Save.

### Step 5 — Configure auth URLs

**Authentication** → **URL Configuration**:

| Setting | Local dev | Production |
|---------|-----------|------------|
| **Site URL** | `http://localhost:5500` or your local server | `https://xanderwiles.com` |
| **Redirect URLs** | `http://localhost:5500/pages/Group-Availability/**` | `https://xanderwiles.com/pages/Group-Availability/**` |

Add every origin you will use. Wildcards are supported in redirect URLs.

### Step 6 — Run database migrations

1. **SQL Editor** → **New query**.
2. Paste the full SQL from [Section 8](#8-database-schema--migrations), then **Run**.
3. Paste RLS policies from [Section 9](#9-row-level-security-rls--full-policies), then **Run**.

### Step 7 — Enable Realtime (optional but recommended)

1. **Database** → **Replication** (or **Publications** depending on UI version).
2. Ensure `availability_slots` and `event_participants` are in the `supabase_realtime` publication:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE availability_slots;
ALTER PUBLICATION supabase_realtime ADD TABLE event_participants;
```

### Step 8 — Verify RLS

In SQL Editor:

```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('events', 'event_participants', 'availability_slots');
```

All should show `rowsecurity = true`.

---

## 7. Google OAuth Setup

### Part A — Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project (e.g. `xanderwiles-group-availability`).
3. **APIs & Services** → **OAuth consent screen**:
   - User type: **External** (unless Workspace-only).
   - App name: `Group Availability` (or site name).
   - User support email: your email.
   - Authorized domains: `xanderwiles.com`, `supabase.co` (Supabase callback uses supabase domain).
   - Scopes: add `email`, `profile`, `openid` (defaults).
   - Add test users while in **Testing** mode.
4. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**:
   - Application type: **Web application**
   - Name: `Supabase Group Availability`
   - **Authorized JavaScript origins:**
     ```
     https://xanderwiles.com
     http://localhost:5500
     https://YOUR_PROJECT_REF.supabase.co
     ```
     Replace `YOUR_PROJECT_REF` with your Supabase reference ID.
   - **Authorized redirect URIs:**
     ```
     https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
     ```
     This is the **only** redirect URI Google needs for Supabase Auth. Supabase handles the OAuth callback, then redirects to your app.
5. Copy **Client ID** and **Client Secret** → paste into Supabase Google provider (Step 4 above).

### Part B — Publish consent screen (production)

When ready for public use:

1. OAuth consent screen → **Publish app**.
2. Google may require verification if you request sensitive scopes (basic profile/email usually does not).

---

## 8. Database Schema & Migrations

Run this in **Supabase SQL Editor** as a single migration (or split logically).

```sql
-- ============================================================
-- Group Availability — Schema
-- ============================================================

-- Updated-at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Events
CREATE TABLE public.events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  title         text NOT NULL,
  description   text,
  organizer_id  uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  day_start_time time NOT NULL DEFAULT '08:00',
  day_end_time   time NOT NULL DEFAULT '22:00',
  slot_minutes  int NOT NULL DEFAULT 30 CHECK (slot_minutes IN (15, 30, 60)),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Participants (auth or guest)
CREATE TABLE public.event_participants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  guest_token  text,
  display_name text NOT NULL,
  avatar_url   text,
  is_organizer boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
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

-- Availability slots
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

-- Slug generator (optional helper)
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
```

---

## 9. Row Level Security (RLS) — Full Policies

Copy and run **after** creating tables.

```sql
-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper: check if request can access an event (public read by slug)
-- Events are readable by anyone who knows the slug (link is the secret).
-- ============================================================

-- EVENTS
-- Anyone can read events (needed for public share links)
CREATE POLICY "events_select_public"
  ON public.events FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only authenticated users can create; must set themselves as organizer
CREATE POLICY "events_insert_organizer"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (organizer_id = auth.uid());

-- Only organizer can update/delete their event
CREATE POLICY "events_update_organizer"
  ON public.events FOR UPDATE
  TO authenticated
  USING (organizer_id = auth.uid())
  WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "events_delete_organizer"
  ON public.events FOR DELETE
  TO authenticated
  USING (organizer_id = auth.uid());

-- ============================================================
-- EVENT PARTICIPANTS
-- ============================================================

-- Anyone with the link can see participant list (names only in UI; RLS allows row read)
CREATE POLICY "participants_select_public"
  ON public.event_participants FOR SELECT
  TO anon, authenticated
  USING (true);

-- Authenticated: insert self as participant
CREATE POLICY "participants_insert_auth"
  ON public.event_participants FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Guest: insert with guest_token (anon role)
-- Guest token is generated client-side; possession of token proves ownership for updates.
CREATE POLICY "participants_insert_guest"
  ON public.event_participants FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL AND guest_token IS NOT NULL);

-- Authenticated: update own row
CREATE POLICY "participants_update_auth"
  ON public.event_participants FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Guest: update row matching guest_token passed in request header
-- See client section: set header x-guest-token on Supabase client for guests.
CREATE POLICY "participants_update_guest"
  ON public.event_participants FOR UPDATE
  TO anon
  USING (
    guest_token IS NOT NULL
    AND guest_token = current_setting('request.headers', true)::json->>'x-guest-token'
  )
  WITH CHECK (
    guest_token = current_setting('request.headers', true)::json->>'x-guest-token'
  );

-- Delete: auth own row, or organizer deletes any participant
CREATE POLICY "participants_delete_auth"
  ON public.event_participants FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_participants.event_id
        AND e.organizer_id = auth.uid()
    )
  );

-- ============================================================
-- AVAILABILITY SLOTS
-- ============================================================

-- Public read for overlap calculation
CREATE POLICY "slots_select_public"
  ON public.availability_slots FOR SELECT
  TO anon, authenticated
  USING (true);

-- Authenticated insert: only for own participant row
CREATE POLICY "slots_insert_auth"
  ON public.availability_slots FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_participants p
      WHERE p.id = participant_id
        AND p.user_id = auth.uid()
        AND p.event_id = availability_slots.event_id
    )
  );

-- Guest insert: participant must match guest_token header
CREATE POLICY "slots_insert_guest"
  ON public.availability_slots FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_participants p
      WHERE p.id = participant_id
        AND p.guest_token = current_setting('request.headers', true)::json->>'x-guest-token'
        AND p.event_id = availability_slots.event_id
    )
  );

-- Authenticated update/delete own slots
CREATE POLICY "slots_update_auth"
  ON public.availability_slots FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "slots_delete_auth"
  ON public.availability_slots FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid()
    )
  );

-- Guest delete own slots
CREATE POLICY "slots_delete_guest"
  ON public.availability_slots FOR DELETE
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.event_participants p
      WHERE p.id = participant_id
        AND p.guest_token = current_setting('request.headers', true)::json->>'x-guest-token'
    )
  );
```

### Guest token header (client implementation note)

For anonymous guests, the Supabase JS client must send a custom header on each request:

```javascript
const guestToken = localStorage.getItem(`ga_guest_${eventId}`);
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: {
    headers: { 'x-guest-token': guestToken ?? '' }
  }
});
```

> **Security note:** Guest identity is “possession of the token.” Anyone with the token can edit that guest’s availability. This is acceptable for low-stakes scheduling; see DECISIONS.md for hardening options.

---

## 10. Environment Variables & Secrets

### What is safe where

| Variable | Client/browser? | Vercel env? | Notes |
|----------|---------------|-------------|-------|
| `SUPABASE_URL` | Yes | Yes | Public |
| `SUPABASE_ANON_KEY` | Yes | Yes | Public **by design**; RLS protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | **Never** | Only if you add server routes | Bypasses RLS — do not use in static JS |
| Database password | **Never** | **Never** | Direct Postgres only |

The **anon key is not a secret** in Supabase’s model — security comes from **RLS policies**, not hiding the anon key. Still avoid committing values to git; inject at build time.

### Local development — `.env.local` (repo root)

Create `/Users/xanderwiles/Documents/Work/Code/Web_Apps/xander-wiles-website/.env.local`:

```bash
# Supabase — Group Availability
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Do not commit** `.env.local` (already excluded in `build.js` copy filter).

### Vercel — Project Environment Variables

1. Vercel Dashboard → your **xander-wiles-website** project.
2. **Settings** → **Environment Variables**.
3. Add:

| Name | Value | Environments |
|------|-------|--------------|
| `SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` | Production, Preview, Development |
| `SUPABASE_ANON_KEY` | your anon key | Production, Preview, Development |

4. **Do not** add `SUPABASE_SERVICE_ROLE_KEY` unless you add Edge Functions later.

5. Redeploy after adding variables (Vercel rebuild runs `node build.js`, which injects env vars — see below).

---

## 11. Client Config Injection (Build-Time)

This repo already replaces `process.env.VAR_NAME` in deployed JS/HTML at build time (`build.js` lines 112–158). Use the same pattern as Firebase apps.

### `supabase-config.js` (source — committed with placeholders)

```javascript
export const supabaseConfig = {
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
};
```

### `supabase-client.js`

```javascript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabaseConfig } from './supabase-config.js';

export const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
```

After `node build.js` runs on Vercel with env vars set, output becomes:

```javascript
export const supabaseConfig = {
  url: "https://xxxx.supabase.co",
  anonKey: "eyJ...",
};
```

### `.gitignore` reminder

Never commit filled-in keys. Placeholders using `process.env.*` are fine.

### Local preview without full build

For local dev, either:

- Run `node build.js` and serve `deploy_out`, or
- Temporarily hardcode in a **gitignored** `supabase-config.local.js` override (optional dev convenience).

---

## 12. Custom Domain — xanderwiles.com

### A. Vercel (site hosting)

Already configured if the main site is on Vercel. The app lives at:

`https://xanderwiles.com/pages/Group-Availability/`

No extra Vercel domain step unless this is a new project.

### B. Supabase Auth (required for Google login on your domain)

1. Supabase Dashboard → **Authentication** → **URL Configuration**.
2. Set **Site URL** to:
   ```
   https://xanderwiles.com
   ```
3. Under **Redirect URLs**, add:
   ```
   https://xanderwiles.com/pages/Group-Availability/**
   http://localhost:5500/pages/Group-Availability/**
   ```
   Add any preview URLs if needed, e.g.:
   ```
   https://*.vercel.app/pages/Group-Availability/**
   ```

4. **Authentication** → **Providers** → **Google** — ensure enabled.

### C. Google Cloud Console (authorized origins)

Under your OAuth client, **Authorized JavaScript origins** must include:

```
https://xanderwiles.com
```

Redirect URI remains only:

```
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

### D. Optional — custom Supabase Auth domain (advanced)

Supabase Pro supports custom auth domains (e.g. `auth.xanderwiles.com`). Not required for v1; default `*.supabase.co` callback works.

### E. OAuth consent screen — authorized domains

Add `xanderwiles.com` under **Authorized domains** on the Google OAuth consent screen.

---

## 13. Vercel Deployment

### Integration with existing `build.js`

The Group Availability app is **static** (no separate npm build). It will be copied with the rest of the site automatically.

Ensure `build.js` `excludeList` does **not** exclude `pages/Group-Availability`.

Env injection runs over all `.js` / `.html` in `deploy_out` — `supabase-config.js` will be processed.

### Auth redirect after Google sign-in

```javascript
const redirectTo = `${window.location.origin}/pages/Group-Availability/event.html?slug=${slug}`;

await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo }
});
```

Supabase must have that redirect URL allowlisted (Section 12).

### SPA routing

If you later use clean URLs without `.html`, add a rewrite in root `vercel.json` similar to the journal app. For v1, query-param routing (`event.html?slug=abc`) avoids extra config.

---

## 14. Realtime Sync Strategy

Subscribe on the event page:

```javascript
supabase
  .channel(`event:${eventId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'availability_slots',
    filter: `event_id=eq.${eventId}`
  }, handleSlotChange)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'event_participants',
    filter: `event_id=eq.${eventId}`
  }, handleParticipantChange)
  .subscribe();
```

### Write path

- User paints cell → update local state immediately (optimistic UI).
- Debounce 300–500 ms → `upsert` or delete slot rows in Supabase.
- On error → toast + revert cell.

### Conflict handling

Last write wins per `(participant_id, slot_start)` — unique constraint enforces one confidence per slot.

---

## 15. Availability Overlap Algorithm

Pseudocode for “best times” panel:

```
1. Load all slots for event_id
2. Group by slot_start timestamp
3. For each slot:
     likely_count = participants with confidence 'likely'
     maybe_count  = participants with confidence 'maybe'
     total_participants = count from event_participants
4. Score (example):
     score = likely_count * 2 + maybe_count
5. Sort slots by score desc, then likely_count desc
6. Merge adjacent slots with same participant set into ranges
7. Display top N ranges with labels
```

Filters (UI toggles):

- **Green only** — ignore `maybe` slots in counts
- **Everyone free** — `likely_count === total_participants`
- **Threshold** — e.g. ≥ 80% with `ceil(0.8 * total)`

Timezone: store UTC in DB; display in organizer’s or browser’s local timezone (see DECISIONS.md).

---

## 16. UI & Styling Specification

Match your glassmorphism brief. Reference implementation patterns exist in `pages/Story-Weaver-Canvas/app.css` and site `assets/css/style.css`.

### Background

- Base: deep gradient (`#0a0a1a` → `#1a0a2e` → `#0d0d1f`).
- 2–3 `.orb` elements: `filter: blur(80–120px)`, low opacity, `animation: drift 20–30s infinite alternate`.

### Glass cards

```css
.glass-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-image: linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.05)) 1;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  border-radius: 16px;
}
```

### Typography

- Font: `'Outfit', sans-serif` (already on main site).
- Body text: `#f3f4f6` / `#e5e7eb`.

### Buttons

- Neon gradient border or fill; `box-shadow` glow on `:hover`.
- **No** `transform: translateY` lift on hover.

```css
.btn-primary:hover {
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.5), 0 0 40px rgba(56, 189, 248, 0.2);
}
```

### Calendar cells

| State | Color |
|-------|-------|
| Likely free | `#22c55e` (green), ~70% opacity on glass |
| Maybe free | `#eab308` (yellow) |
| Empty | transparent / subtle grid lines |
| Overlap heat | blend green intensity by count |

### Sliders (if used for time range or filters)

- Track thicker than thumb (e.g. track `8px`, thumb `18px`).
- Padding at track ends so thumb does not touch edges (`padding: 0 8px` on wrapper or use `calc()` width).

### File upload (if added later)

Style `<input type="file">` with same glass wrapper — hidden input + glass label button.

---

## 17. Proposed File Structure

```
pages/Group-Availability/
├── PLAN.md                    ← this file
├── DECISIONS.md               ← open questions
├── index.html                 ← landing + auth
├── event.html                 ← main calendar + overlap
├── create.html                ← create event form (or merge into index)
├── styles.css                 ← glass UI + calendar grid
├── supabase-config.js         ← process.env placeholders
├── js/
│   ├── supabase-client.js     ← client factory (auth + guest headers)
│   ├── auth.js                ← Google sign-in/out, session
│   ├── api.js                 ← CRUD wrappers
│   ├── calendar.js            ← grid render, paint interactions
│   ├── overlap.js             ← best-times computation
│   ├── realtime.js            ← subscriptions
│   ├── guest.js               ← guest token + name flow
│   └── utils.js               ← dates, debounce, slug copy
├── favicon.ico                ← optional, match site icons
└── site.webmanifest           ← optional PWA metadata
```

---

## 18. Implementation Phases

### Phase 1 — Foundation (MVP)

- [ ] Supabase project + schema + RLS deployed
- [ ] `supabase-config.js` + build injection verified on Vercel
- [ ] Google auth working on production domain
- [ ] Create event (authenticated only)
- [ ] Event page with share link copy
- [ ] Guest name flow + guest_token
- [ ] Paint calendar (green/yellow) + save slots
- [ ] Basic overlap list (top 10 windows)

### Phase 2 — Polish

- [ ] Realtime updates when others edit
- [ ] Participant list + response status
- [ ] Mobile-responsive grid (horizontal scroll or stacked days)
- [ ] Loading/error states, toasts
- [ ] Favicon + nav integration (`assets/js/nav-loader.js`)

### Phase 3 — Enhancements (post-MVP)

- [ ] Edit event details (organizer)
- [ ] Export overlap summary (copy text / ICS)
- [ ] Guest → Google account merge
- [ ] Edge Function for rate limiting / abuse prevention

---

## 19. Security Checklist

- [ ] RLS enabled on all public tables
- [ ] `service_role` key not in repo or client bundle
- [ ] `.env.local` gitignored
- [ ] Guest tokens are UUID v4 (unguessable)
- [ ] No PII beyond display name + email (Google) stored
- [ ] Supabase redirect URLs restricted to your domains (no open `*`)
- [ ] Rate limiting considered if spam becomes an issue (Supabase dashboard or Edge Function)

---

## 20. Testing Plan

| Test | Steps | Expected |
|------|-------|----------|
| Google login | Sign in on production URL | Redirect back, session in `supabase.auth.getSession()` |
| Create event | Authenticated user creates “Dinner” | Row in `events`, slug in URL |
| Guest join | Open link, enter name, paint slots | Rows in `participants` + `availability_slots` |
| Cross-device sync | Two browsers, same event | Realtime or refresh shows both |
| Overlap | 3 users mark same slot green | Slot appears at top of overlap list |
| RLS isolation | Guest A cannot delete Guest B slots | Postgres permission denied |
| Build injection | Deploy without env vars | Console warning; client fails gracefully |
| Mobile layout | iPhone Safari | Grid usable, glass readable |

---

## Quick Reference — Setup Order

1. Create Supabase project (production-minded).
2. Run schema SQL (Section 8).
3. Run RLS SQL (Section 9).
4. Enable Realtime on tables.
5. Create Google OAuth client → enable in Supabase.
6. Set Site URL + Redirect URLs for `xanderwiles.com`.
7. Add `SUPABASE_URL` + `SUPABASE_ANON_KEY` to `.env.local` and Vercel.
8. Implement frontend in `pages/Group-Availability/`.
9. Deploy via git push → Vercel build.
10. Test Google login on live domain.

---

*Answer the questions in `DECISIONS.md` before Phase 1 implementation begins.*
