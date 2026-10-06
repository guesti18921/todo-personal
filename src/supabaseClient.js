import { createClient } from '@supabase/supabase-js';
import { boundedFetch } from './networkFetch.js';
import { AUTH_STORAGE_KEY } from './localAccount.js';

export const supabase = createClient(
  'https://ihvwqqvndmwtislvgamd.supabase.co',
  'sb_publishable_-Khx2pDkccNUEEv7QPePLw_GyFbHbJ1',
  { auth: { storageKey: AUTH_STORAGE_KEY }, global: { fetch: boundedFetch } }
);
