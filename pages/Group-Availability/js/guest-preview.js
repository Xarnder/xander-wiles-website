import { APP_BASE, eventUrl } from './utils.js';

export const GUEST_PREVIEW_PARAM = 'preview';
export const GUEST_PREVIEW_VALUE = 'guest';

export function isGuestPreviewActive() {
  return (
    new URLSearchParams(window.location.search).get(GUEST_PREVIEW_PARAM) === GUEST_PREVIEW_VALUE
  );
}

export function appendGuestPreviewParam(url) {
  const parsed = new URL(url, window.location.origin);
  parsed.searchParams.set(GUEST_PREVIEW_PARAM, GUEST_PREVIEW_VALUE);
  return `${parsed.pathname}${parsed.search}`;
}

export function eventUrlWithGuestPreview(slug) {
  if (!slug) return `${APP_BASE}/event?${GUEST_PREVIEW_PARAM}=${GUEST_PREVIEW_VALUE}`;
  return appendGuestPreviewParam(eventUrl(slug));
}

export function navigateToGuestPreview(slug, eventId = null) {
  try {
    if (slug) {
      sessionStorage.setItem('wth_nav_slug', slug);
      window.location.href = eventUrlWithGuestPreview(slug);
    } else if (eventId) {
      sessionStorage.setItem('wth_nav_event_id', eventId);
      window.location.href = `${APP_BASE}/event?id=${encodeURIComponent(eventId)}&${GUEST_PREVIEW_PARAM}=${GUEST_PREVIEW_VALUE}`;
    }
  } catch {
    if (slug) window.location.href = eventUrlWithGuestPreview(slug);
    else if (eventId) {
      window.location.href = `${APP_BASE}/event?id=${encodeURIComponent(eventId)}&${GUEST_PREVIEW_PARAM}=${GUEST_PREVIEW_VALUE}`;
    }
  }
}

export function exitGuestPreview(slug, eventId = null) {
  if (slug) {
    window.location.href = eventUrl(slug);
    return;
  }
  if (eventId) {
    window.location.href = `${APP_BASE}/event?id=${encodeURIComponent(eventId)}`;
  }
}
