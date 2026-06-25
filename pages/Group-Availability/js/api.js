import { getAuthClient, getActiveClient } from './supabase-client.js';
import { generateSlug, sanitizeSlug, computeDefaultExpiresAt, localSlotToUtc, formatDbError } from './utils.js';

export async function fetchEventBySlug(slug, client) {
  const db = client || getAuthClient();
  const { data, error } = await db
    .from('events')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchEventById(id, client) {
  const db = client || getAuthClient();
  const { data, error } = await db
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchParticipants(eventId, client) {
  const db = client || getAuthClient();
  const { data, error } = await db
    .from('event_participants')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchSlots(eventId, client) {
  const db = client || getAuthClient();
  const { data, error } = await db
    .from('availability_slots')
    .select('*')
    .eq('event_id', eventId);
  if (error) throw error;
  return data || [];
}

export async function findAuthParticipant(eventId, userId, client) {
  const db = client || getAuthClient();
  const { data, error } = await db
    .from('event_participants')
    .select('*')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function findGuestParticipant(eventId, guestToken, client) {
  const db = getActiveClient({ guestToken });
  const { data, error } = await db
    .from('event_participants')
    .select('*')
    .eq('event_id', eventId)
    .eq('guest_token', guestToken)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function joinAsAuthUser(event, profile, client) {
  const db = client || getAuthClient();
  const existing = await findAuthParticipant(event.id, profile.id, db);
  if (existing) {
    if (!existing.avatar_url && profile.avatarUrl) {
      const { data, error } = await db
        .from('event_participants')
        .update({ avatar_url: profile.avatarUrl })
        .eq('id', existing.id)
        .select()
        .single();
      if (!error && data) return data;
    }
    return existing;
  }

  const row = {
    event_id: event.id,
    user_id: profile.id,
    display_name: profile.displayName,
    avatar_url: profile.avatarUrl,
    is_organizer: event.organizer_id === profile.id,
  };
  const { data, error } = await db.from('event_participants').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function joinAsGuest(event, displayName, guestToken) {
  const db = getActiveClient({ guestToken });
  const existing = await findGuestParticipant(event.id, guestToken, db);
  if (existing) {
    if (existing.display_name !== displayName.trim()) {
      const { data, error } = await db
        .from('event_participants')
        .update({ display_name: displayName.trim() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    return existing;
  }

  const { data, error } = await db
    .from('event_participants')
    .insert({
      event_id: event.id,
      guest_token: guestToken,
      display_name: displayName.trim(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createEvent(payload, profile) {
  const client = getAuthClient();
  let slug = payload.customSlug ? sanitizeSlug(payload.customSlug) : generateSlug();
  if (!slug) slug = generateSlug();

  const expiresAt = payload.expiresAt || computeDefaultExpiresAt(payload.endDate, payload.timezone);

  const eventRow = {
    slug,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    organizer_id: profile.id,
    start_date: payload.startDate,
    end_date: payload.endDate,
    timezone: payload.timezone,
    visibility_mode: payload.visibilityMode || 'all',
    edit_deadline: payload.editDeadline || null,
    expires_at: expiresAt,
  };

  const { data: event, error } = await client.from('events').insert(eventRow).select().single();
  if (error) {
    if (error.code === '23505' && payload.customSlug) {
      throw new Error('That custom link is already taken. Try another.');
    }
    throw new Error(formatDbError(error));
  }

  if (!event?.slug) {
    throw new Error('Event was created but no share link was returned. Check Supabase logs.');
  }

  const { error: participantError } = await client.from('event_participants').insert({
    event_id: event.id,
    user_id: profile.id,
    display_name: profile.displayName,
    avatar_url: profile.avatarUrl,
    is_organizer: true,
  });

  if (participantError) {
    throw new Error(formatDbError(participantError));
  }

  return event;
}

export async function markSubmitted(participantId, client) {
  const db = client || getAuthClient();
  const { error } = await db
    .from('event_participants')
    .update({ has_submitted_availability: true })
    .eq('id', participantId);
  if (error) throw error;
}

export async function syncSlots(event, participantId, slotMap, client) {
  const db = client || getAuthClient();
  const existing = await fetchSlots(event.id, db);
  const mine = existing.filter((s) => s.participant_id === participantId);
  const desired = new Map();

  for (const [key, confidence] of slotMap.entries()) {
    const [dateStr, hourStr] = key.split('|');
    const iso = localSlotToUtc(dateStr, parseInt(hourStr, 10), event.timezone);
    desired.set(iso, confidence);
  }

  const toDelete = mine.filter((s) => !desired.has(s.slot_start));
  const toUpsert = [];

  for (const [iso, confidence] of desired.entries()) {
    const prev = mine.find((s) => s.slot_start === iso);
    if (!prev || prev.confidence !== confidence) {
      toUpsert.push({
        participant_id: participantId,
        event_id: event.id,
        slot_start: iso,
        confidence,
      });
    }
  }

  for (const row of toDelete) {
    const { error } = await db.from('availability_slots').delete().eq('id', row.id);
    if (error) throw error;
  }

  if (toUpsert.length) {
    const { error } = await db.from('availability_slots').upsert(toUpsert, {
      onConflict: 'participant_id,slot_start',
    });
    if (error) throw error;
  }
}

export async function updateEvent(eventId, patch) {
  const client = getAuthClient();
  const { data, error } = await client
    .from('events')
    .update(patch)
    .eq('id', eventId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEvent(eventId) {
  const client = getAuthClient();
  const { error } = await client.from('events').delete().eq('id', eventId);
  if (error) throw error;
}

export async function mergeGuestToUser(eventId, guestToken) {
  const client = getAuthClient();
  const { data, error } = await client.rpc('merge_guest_to_user', {
    p_event_id: eventId,
    p_guest_token: guestToken,
  });
  if (error) throw error;
  return data;
}

export async function fetchDashboardEvents(userId) {
  const client = getAuthClient();

  const { data: organized, error: e1 } = await client
    .from('events')
    .select('*')
    .eq('organizer_id', userId)
    .order('created_at', { ascending: false });
  if (e1) throw e1;

  const { data: joinedRows, error: e2 } = await client
    .from('event_participants')
    .select('event_id, events(*)')
    .eq('user_id', userId)
    .eq('is_organizer', false);
  if (e2) throw e2;

  const joined = (joinedRows || [])
    .map((r) => r.events)
    .filter(Boolean);

  const seen = new Set();
  const all = [];
  for (const ev of [...(organized || []), ...joined]) {
    if (!seen.has(ev.id)) {
      seen.add(ev.id);
      all.push(ev);
    }
  }
  all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return { organized: organized || [], joined, all };
}
