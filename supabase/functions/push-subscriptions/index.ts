import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createPushApi } from '../_shared/pushApi.js';
const server = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) }) }
});
Deno.serve(createPushApi({ server,
    publicKey: Deno.env.get('WEB_PUSH_PUBLIC_KEY'),
    enabled: Deno.env.get('WEB_PUSH_ENABLED') === 'true' && Boolean(Deno.env.get('WEB_PUSH_PRIVATE_KEY') && Deno.env.get('WEB_PUSH_CRON_SECRET')),
    async hashEndpoint(endpoint) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
        return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
    }
}));
