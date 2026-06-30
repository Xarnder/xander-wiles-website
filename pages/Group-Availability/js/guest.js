const GUEST_KEY_PREFIX = 'wth_guest_';
const PARTICIPANT_KEY_PREFIX = 'wth_participant_';
const PENDING_GUEST_TOKEN_KEY = 'wth_pending_guest_token';
const PENDING_GUEST_SLUG_KEY = 'wth_pending_guest_slug';

export function stashGuestTokenFromUrl(slug, token) {
  if (!token) return;
  try {
    sessionStorage.setItem(PENDING_GUEST_TOKEN_KEY, token);
    if (slug) sessionStorage.setItem(PENDING_GUEST_SLUG_KEY, slug);
  } catch {
    /* private browsing */
  }
}

export function takePendingGuestToken(slug) {
  try {
    const token = sessionStorage.getItem(PENDING_GUEST_TOKEN_KEY);
    if (!token) return null;
    const pendingSlug = sessionStorage.getItem(PENDING_GUEST_SLUG_KEY);
    if (slug && pendingSlug && pendingSlug !== slug) return null;
    sessionStorage.removeItem(PENDING_GUEST_TOKEN_KEY);
    sessionStorage.removeItem(PENDING_GUEST_SLUG_KEY);
    return token;
  } catch {
    return null;
  }
}

export function clearPendingGuestToken() {
  try {
    sessionStorage.removeItem(PENDING_GUEST_TOKEN_KEY);
    sessionStorage.removeItem(PENDING_GUEST_SLUG_KEY);
  } catch {
    /* ignore */
  }
}

export function getGuestToken(eventId) {
  return localStorage.getItem(`${GUEST_KEY_PREFIX}${eventId}`);
}

export function setGuestToken(eventId, token) {
  localStorage.setItem(`${GUEST_KEY_PREFIX}${eventId}`, token);
}

export function clearGuestToken(eventId) {
  localStorage.removeItem(`${GUEST_KEY_PREFIX}${eventId}`);
  localStorage.removeItem(`${PARTICIPANT_KEY_PREFIX}${eventId}`);
}

export function createGuestToken() {
  return crypto.randomUUID();
}

export function setParticipantId(eventId, participantId) {
  localStorage.setItem(`${PARTICIPANT_KEY_PREFIX}${eventId}`, participantId);
}

export function getParticipantId(eventId) {
  return localStorage.getItem(`${PARTICIPANT_KEY_PREFIX}${eventId}`);
}

const GUEST_VIEW_KEY_PREFIX = 'wth_guest_view_';

export function getGuestViewParticipantId(eventId) {
  try {
    return sessionStorage.getItem(`${GUEST_VIEW_KEY_PREFIX}${eventId}`);
  } catch {
    return null;
  }
}

export function setGuestViewParticipantId(eventId, participantId) {
  try {
    sessionStorage.setItem(`${GUEST_VIEW_KEY_PREFIX}${eventId}`, participantId);
  } catch {
    /* private browsing */
  }
}

export function clearGuestViewParticipantId(eventId) {
  try {
    sessionStorage.removeItem(`${GUEST_VIEW_KEY_PREFIX}${eventId}`);
  } catch {
    /* ignore */
  }
}
