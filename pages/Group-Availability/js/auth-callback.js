import { isSupabaseConfigured } from '../supabase-config.js';
import { getAuthClient } from './supabase-client.js';
import { APP_BASE } from './utils.js';
import { initChrome } from './theme.js';

const DEFAULT_RETURN = `${APP_BASE}/index.html`;

async function finishSignIn() {
  const returnTo = sessionStorage.getItem('wth_auth_return') || DEFAULT_RETURN;
  sessionStorage.removeItem('wth_auth_return');

  if (!isSupabaseConfigured()) {
    window.location.replace(returnTo);
    return;
  }

  const client = getAuthClient();
  if (!client) {
    window.location.replace(returnTo);
    return;
  }

  try {
    await client.auth.getSession();
  } catch (err) {
    console.error('OAuth callback failed', err);
  }

  window.location.replace(returnTo);
}

finishSignIn();

initChrome();
