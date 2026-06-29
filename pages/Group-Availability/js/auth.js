import { getAuthClient } from './supabase-client.js';
import { APP_BASE } from './utils.js';

const AUTH_CALLBACK = `${APP_BASE}/auth-callback.html`;

export function oauthCallbackUrl() {
  return `${window.location.origin}${AUTH_CALLBACK}`;
}

export async function getSession() {
  const client = getAuthClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback) {
  const client = getAuthClient();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}

export async function signInWithGoogle(redirectPath) {
  const client = getAuthClient();
  if (!client) throw new Error('Supabase is not configured');

  const returnPath = redirectPath || `${APP_BASE}/index.html`;
  const returnTo = `${window.location.origin}${returnPath}`;
  const redirectTo = oauthCallbackUrl();

  sessionStorage.setItem('wth_auth_return', returnTo);

  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw error;
}

export async function signOut() {
  const client = getAuthClient();
  if (!client) return;
  await client.auth.signOut();
}

export function avatarUrlFromUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  if (meta.avatar_url) return meta.avatar_url;
  if (meta.picture) return meta.picture;
  const google = user.identities?.find((i) => i.provider === 'google');
  if (google?.identity_data?.picture) return google.identity_data.picture;
  if (google?.identity_data?.avatar_url) return google.identity_data.avatar_url;
  return null;
}

export function profileFromSession(session) {
  if (!session?.user) return null;
  const meta = session.user.user_metadata || {};
  return {
    id: session.user.id,
    email: session.user.email,
    displayName: meta.full_name || meta.name || session.user.email?.split('@')[0] || 'User',
    avatarUrl: avatarUrlFromUser(session.user),
  };
}

/** Google avatars block hotlinking unless referrer is stripped */
export function applyAvatarImage(img, url) {
  if (!img) return;
  if (!url) {
    img.hidden = true;
    img.removeAttribute('src');
    return;
  }
  img.referrerPolicy = 'no-referrer';
  img.src = url;
  img.hidden = false;
  img.onerror = () => {
    img.hidden = true;
  };
}
