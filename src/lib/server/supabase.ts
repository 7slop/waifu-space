import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { loadEnvFiles } from './load-env';

loadEnvFiles();

let cachedClient: SupabaseClient | null = null;

/**
 * Returns a Supabase client configured with the server-side service role key if available,
 * or anon key as fallback. Secrets remain strictly on the server and are never exposed to browser client.
 */
export function getSupabaseServerClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return cachedClient;
}

/**
 * Returns true if server has active Supabase credentials configured
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return Boolean(url && key);
}

/**
 * The DM/Presence/Call RPCs are SECURITY DEFINER and EXECUTE-granted to
 * service_role only (the anon fallback grants were revoked in
 * migration restrict_dm_rpc_execute_to_service_role). The app server therefore
 * needs a real service-role key for DM features; requiring it here surfaces a
 * clear 503 instead of a stream of confusing RPC permission errors.
 */
export function isSupabaseServiceRoleConfigured(): boolean {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  return Boolean(url && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
