import { describe, expect, it } from 'vitest';
import { pickKey, pickUrl } from './supabase';

const URL = 'https://xewgmvcowxyptbetuohf.supabase.co';
const KEY = 'sb_publishable_A8d9fwXBkU8SKZjNE3g4Rg_jAz1zG5g';

describe('Supabase settings from the build environment', () => {
  it('takes a clean value as it is', () => {
    expect(pickUrl(URL)).toBe(URL);
    expect(pickKey(KEY)).toBe(KEY);
  });

  it('finds the address and key in a whole block pasted into one field', () => {
    const pasted = `VITE_SUPABASE_URL=${URL} VITE_SUPABASE_ANON_KEY=${KEY}`;
    expect(pickUrl(pasted)).toBe(URL);
    expect(pickKey(pasted)).toBe(KEY);
    expect(pickUrl(`"${URL}/"`)).toBe(URL);
  });

  it('falls back to the built-in project when the value is empty or unusable', () => {
    expect(pickUrl(undefined)).toBe(URL);
    expect(pickUrl('')).toBe(URL);
    expect(pickUrl('https://supabase.co')).toBe(URL);
    expect(pickKey('short')).toBe(KEY);
  });

  it('never accepts a secret key', () => {
    expect(pickKey('sb_secret_abcdefghijklmnopqrstuvwxyz')).toBe(KEY);
  });
});
