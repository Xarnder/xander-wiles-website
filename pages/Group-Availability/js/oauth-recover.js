import { APP_BASE } from './utils.js';

const AUTH_CALLBACK = `${APP_BASE}/auth-callback.html`;

/** If Supabase fell back to site root, forward tokens to our callback page. */
export function recoverOAuthRedirectFromSiteRoot() {
  const hash = window.location.hash;
  if (!hash || (!hash.includes('access_token=') && !hash.includes('error='))) {
    return false;
  }

  const path = window.location.pathname;
  if (path.includes('/pages/Group-Availability/')) {
    return false;
  }

  const callback = `${window.location.origin}${AUTH_CALLBACK}`;
  window.location.replace(`${callback}${hash}`);
  return true;
}
