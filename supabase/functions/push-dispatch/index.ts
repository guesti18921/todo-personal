import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import webpush from 'npm:web-push@3.6.7';
import { createPushDispatch } from '../_shared/pushDispatch.js';
const server = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) }) }
});
const publicKey = Deno.env.get('WEB_PUSH_PUBLIC_KEY');
const privateKey = Deno.env.get('WEB_PUSH_PRIVATE_KEY');
Deno.serve(createPushDispatch({ server, secret: Deno.env.get('WEB_PUSH_CRON_SECRET'),
    enabled: Deno.env.get('WEB_PUSH_ENABLED') === 'true' && Boolean(publicKey && privateKey),
    send: (subscription, payload, options) => webpush.sendNotification(subscription, payload, {
        ...options, timeout: 10000, vapidDetails: { publicKey, privateKey, subject: 'mailto:support@m1strell.com' }
    })
}));
