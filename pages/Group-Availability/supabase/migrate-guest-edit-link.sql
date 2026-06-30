-- Guest private edit link — run in Supabase SQL Editor on EXISTING projects
-- Lets the organizer generate a one-time recovery URL so a guest can edit
-- their existing submission on a new device (rotates guest_token on that row).
--
-- After running: wait ~10 seconds, then reload the app.

CREATE OR REPLACE FUNCTION public.issue_guest_edit_link(p_participant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_user_id uuid;
  v_organizer_id uuid;
  v_new_token text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.event_id, p.user_id, e.organizer_id
  INTO v_event_id, v_user_id, v_organizer_id
  FROM public.event_participants p
  JOIN public.events e ON e.id = p.event_id
  WHERE p.id = p_participant_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  IF v_organizer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the event organizer can issue edit links';
  END IF;

  IF v_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Google sign-in users can edit by signing in — no private link needed';
  END IF;

  v_new_token := gen_random_uuid()::text;

  UPDATE public.event_participants
  SET guest_token = v_new_token
  WHERE id = p_participant_id;

  RETURN v_new_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_guest_edit_link(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
