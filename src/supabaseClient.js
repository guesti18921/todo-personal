import { createClient } from '@supabase/supabase-js';
import { boundedFetch } from './networkFetch.js';
import { AUTH_STORAGE_KEY } from './localAccount.js';
import { recoverDeletedAccounts } from './accountDeletion.js';

recoverDeletedAccounts(localStorage);

export const SUPABASE_URL = 'https://ihvwqqvndmwtislvgamd.supabase.co';
export const SUPABASE_PUBLIC_KEY = 'sb_publishable_-Khx2pDkccNUEEv7QPePLw_GyFbHbJ1';
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLIC_KEY,
  { auth: { storageKey: AUTH_STORAGE_KEY }, global: { fetch: boundedFetch } }
);
