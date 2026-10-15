import { validSubscription, validTimezone } from './pushModel.js';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export function createPushApi({ server, publicKey, enabled, now = () => new Date(), hashEndpoint }) {
    return async request => {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (request.method !== 'POST') return reply(405, { code: 'method_not_allowed' });
        try {
            const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') || '')?.[1];
            if (!token) return reply(401, { code: 'authentication_required' });
            const verified = await server.auth.getUser(token);
            const owner = verified.data?.user?.id;
            if (verified.error || !owner) return reply(401, { code: 'authentication_required' });
            if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply(415, { code: 'json_required' });
            const text = await request.text();
            if (text.length > 8192) return reply(400, { code: 'invalid_request' });
            let body; try { body = JSON.parse(text); } catch (_) { return reply(400, { code: 'invalid_request' }); }
            if (!body || Object.keys(body).some(k => !['action', 'subscription', 'timeZone', 'language'].includes(k))) return reply(400, { code: 'invalid_request' });
            if (body.action === 'config') return reply(200, { enabled: Boolean(enabled && publicKey), publicKey: enabled ? publicKey : null });
            if (!['subscribe', 'unsubscribe'].includes(body.action) || !validSubscription(body.subscription)) return reply(400, { code: 'invalid_subscription' });
            const endpointHash = await hashEndpoint(body.subscription.endpoint);
            if (body.action === 'unsubscribe') {
                const deleted = await server.from('web_push_subscriptions').delete().eq('owner_id', owner).eq('endpoint_hash', endpointHash);
                if (deleted.error) return reply(503, { code: 'service_unavailable' });
                return reply(200, { enabled: false });
            }
            if (!enabled || !publicKey) return reply(503, { code: 'push_not_configured' });
            if (!validTimezone(body.timeZone) || !['ru', 'en'].includes(body.language)) return reply(400, { code: 'invalid_preferences' });
            const prior = await server.from('web_push_subscriptions').select('id,owner_id,enabled_at').eq('endpoint_hash', endpointHash).maybeSingle();
            if (prior.error) return reply(503, { code: 'service_unavailable' });
            if (prior.data && prior.data.owner_id !== owner) return reply(409, { code: 'subscription_owner_mismatch' });
            if (!prior.data) {
                const count = await server.from('web_push_subscriptions').select('id', { count: 'exact', head: true }).eq('owner_id', owner);
                if (count.error) return reply(503, { code: 'service_unavailable' });
                if (count.count >= 20) return reply(429, { code: 'device_limit' });
            }
            const stamp = now().toISOString();
            const row = { owner_id: owner, endpoint_hash: endpointHash,
                subscription: { endpoint: body.subscription.endpoint, keys: body.subscription.keys },
                time_zone: body.timeZone, language: body.language,
                enabled_at: prior.data?.enabled_at || stamp, expires_at: new Date(now().getTime() + 90 * 86400000).toISOString() };
            // Never upsert a submitted endpoint over a different account.
            const saved = prior.data
                ? await server.from('web_push_subscriptions').update(row).eq('id', prior.data.id).eq('owner_id', owner)
                : await server.from('web_push_subscriptions').insert(row);
            if (saved.error) return reply(saved.error.code === '23505' ? 409 : 503, { code: 'subscription_not_saved' });
            return reply(200, { enabled: true });
        } catch (_) { return reply(503, { code: 'service_unavailable' }); }
    };
}
