-- When To Hang — run this in Supabase SQL Editor on EXISTING projects
-- (Skip if you created the project from the latest schema.sql after location was added.)
--
-- After running: wait ~10 seconds for the API schema cache to refresh, then reload the app.

-- Event location (organizer sets; shown to all visitors)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location text;

-- Guest availability edits use upsert (ON CONFLICT UPDATE) — needs UPDATE policy for anon
DROP POLICY IF EXISTS "slots_update_guest" ON public.availability_slots;
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

-- Organizer can remove guest participants (slots cascade on delete)
DROP POLICY IF EXISTS "participants_delete_auth" ON public.event_participants;
CREATE POLICY "participants_delete_auth"
  ON public.event_participants FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_participants.event_id AND e.organizer_id = auth.uid()
    )
  );

-- Reload PostgREST schema cache (Supabase API)
NOTIFY pgrst, 'reload schema';
