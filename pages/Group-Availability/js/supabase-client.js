import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { supabaseConfig, isSupabaseConfigured } from '../supabase-config.js';

let authClient = null;

export function getAuthClient() {
  if (!isSupabaseConfigured()) return null;
  if (!authClient) {
    authClient = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return authClient;
}

export function getGuestClient(guestToken) {
  if (!isSupabaseConfigured()) return null;
  return createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    global: {
      headers: guestToken ? { 'x-guest-token': guestToken } : {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/** Prefer auth client when logged in; otherwise guest client with token */
export function getActiveClient({ session, guestToken }) {
  if (session) return getAuthClient();
  if (guestToken) return getGuestClient(guestToken);
  return getAuthClient();
}
