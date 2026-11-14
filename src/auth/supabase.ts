import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * Accounts are optional: the game is fully playable without them. The project's own Supabase
 * address and publishable key are built in below, so sign-in works locally and in every build
 * without any .env file. A deployment can point elsewhere with VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY (Vercel project settings), which take precedence.
 *
 * Only the publishable ("anon") key may appear here: Supabase designs it to be public, and the
 * project's Row Level Security limits what it can do. The secret / service_role key must never
 * be put in the site.
 *
 * The client library is loaded on demand, so players who never touch accounts do not download it.
 */

const PROJECT_URL = 'https://xewgmvcowxyptbetuohf.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_A8d9fwXBkU8SKZjNE3g4Rg_jAz1zG5g';

/**
 * Build variables are pasted by hand into hosting dashboards, and a whole "NAME=value NAME=value"
 * block sometimes lands in one field. Take the project address or key out of whatever is there,
 * and fall back to the built-in project when nothing usable is found.
 */
export function pickUrl(raw: string | undefined): string {
  const m = (raw ?? '').match(/https:\/\/[a-z0-9-]+\.supabase\.(?:co|in)\b/i);
  return m ? m[0] : PROJECT_URL;
}
export function pickKey(raw: string | undefined): string {
  const m = (raw ?? '').match(/\b(sb_publishable_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/);
  return m ? m[1] : PUBLISHABLE_KEY;
}

const url = pickUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const anonKey = pickKey(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

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
