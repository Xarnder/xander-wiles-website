// Filled at build time by build.js (see repo root). Safe in browser — no process.env.
export const supabaseConfig = {
  url: '__SUPABASE_URL__',
  anonKey: '__SUPABASE_ANON_KEY__',
};

export function isSupabaseConfigured() {
  const { url, anonKey } = supabaseConfig;
  return Boolean(
    typeof url === 'string' &&
    typeof anonKey === 'string' &&
    url.startsWith('https://') &&
    anonKey.length > 10 &&
    !url.includes('__SUPABASE') &&
    !anonKey.includes('__SUPABASE')
  );
}
