-- When To Hang — run this entire file in Supabase SQL Editor (new project)

-- ============================================================
-- Schema
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
  location         text,
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

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;

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
    AND guest_token = coalesce(
      current_setting('request.headers', true)::json->>'x-guest-token',
      ''
    )
  )
  WITH CHECK (
    guest_token = coalesce(
      current_setting('request.headers', true)::json->>'x-guest-token',
      ''
    )
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

CREATE OR REPLACE FUNCTION public.event_allows_edits(p_event_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = p_event_id
      AND e.is_closed = false
      AND (e.edit_deadline IS NULL OR e.edit_deadline > now())
      AND e.expires_at > now()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

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
        AND p.guest_token = coalesce(
          current_setting('request.headers', true)::json->>'x-guest-token',
          ''
        )
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

CREATE POLICY "slots_update_guest"
  ON public.availability_slots FOR UPDATE TO anon
  USING (
    public.event_allows_edits(event_id)
    AND EXISTS (
      SELECT 1 FROM public.event_participants p
      WHERE p.id = participant_id
        AND p.guest_token = coalesce(
          current_setting('request.headers', true)::json->>'x-guest-token',
          ''
        )
    )
  )
  WITH CHECK (
    public.event_allows_edits(event_id)
    AND EXISTS (
      SELECT 1 FROM public.event_participants p
      WHERE p.id = participant_id
        AND p.guest_token = coalesce(
          current_setting('request.headers', true)::json->>'x-guest-token',
          ''
        )
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
        AND p.guest_token = coalesce(
          current_setting('request.headers', true)::json->>'x-guest-token',
          ''
        )
    )
  );

-- Guest → Google merge
CREATE OR REPLACE FUNCTION public.merge_guest_to_user(p_event_id uuid, p_guest_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_participants
    WHERE event_id = p_event_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Already joined as authenticated user';
  END IF;

  UPDATE public.event_participants
  SET
    user_id = v_user_id,
    guest_token = NULL,
    merged_from_guest_token = p_guest_token,
    avatar_url = COALESCE(
      avatar_url,
      (SELECT raw_user_meta_data->>'avatar_url' FROM auth.users WHERE id = v_user_id)
    )
  WHERE event_id = p_event_id AND guest_token = p_guest_token
  RETURNING id INTO v_participant_id;

  IF v_participant_id IS NULL THEN
    RAISE EXCEPTION 'Guest participant not found';
  END IF;

  RETURN v_participant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_guest_to_user(uuid, text) TO authenticated;

-- ============================================================
-- Realtime (run after tables exist)
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.availability_slots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;

-- ============================================================
-- Existing projects: run supabase/migrate-existing.sql in SQL Editor
-- ============================================================
