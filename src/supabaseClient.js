import { createClient } from '@supabase/supabase-js';
import { boundedFetch } from './networkFetch.js';
import { AUTH_STORAGE_KEY } from './localAccount.js';
import { recoverDeletedAccounts } from './accountDeletion.js';
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY } from './authConfig.js';
export { SUPABASE_URL, SUPABASE_PUBLIC_KEY } from './authConfig.js';

recoverDeletedAccounts(localStorage);

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLIC_KEY,
  { auth: { storageKey: AUTH_STORAGE_KEY }, global: { fetch: boundedFetch } }
);
