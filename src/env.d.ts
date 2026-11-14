/// <reference types="vite/client" />

/** The development server's address on the local network ("" in a production build). */
declare const __LAN_ORIGIN__: string;

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://abcd1234.supabase.co (optional: without it accounts are off). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (publishable) key. Public by design; never the service_role key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
