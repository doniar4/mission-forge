import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * Accounts are optional. The game is fully playable without them; with a Supabase project
 * configured (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, see .env.example)
 * players can create an account and sign in.
 *
 * Only the public "anon" (publishable) key belongs here: it is meant to be shipped in a browser
 * and is limited by the project's Row Level Security. Never put the service_role key in the site.
 *
 * The client library is loaded on demand, so players who never touch accounts do not download it.
 */

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

/** True when the site was built with a Supabase project to sign in to. */
export const authConfigured = /^https:\/\/.+/.test(url) && anonKey.length > 20;

let client: Promise<SupabaseClient> | null = null;

export function supabase(): Promise<SupabaseClient> {
  if (!authConfigured) return Promise.reject(new Error('Supabase is not configured'));
  if (!client) {
    client = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // PKCE puts the sign-in code in ?code=…, which leaves the #room= and #m= links of the game alone.
          flowType: 'pkce',
          detectSessionInUrl: true,
          storageKey: 'mission-forge-auth',
        },
      }),
    );
  }
  return client;
}

/** Where confirmation and password-reset emails send the player back to: this page, without hash or query. */
export const returnUrl = () => `${location.origin}${location.pathname}`;
