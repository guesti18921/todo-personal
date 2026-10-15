import { dueReminders, notebookRecords, reminderInstant, validSubscription } from './pushModel.js';
export function createPushDispatch({ server, send, secret, enabled, now = () => new Date(), uuid = () => crypto.randomUUID() }) {
    return async request => {
        const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
        if (request.method !== 'POST') return reply(405, { code: 'method_not_allowed' });
        if (!secret || request.headers.get('Authorization') !== 'Bearer ' + secret) return reply(401, { code: 'authentication_required' });
        if (!enabled) return reply(503, { code: 'push_not_configured' });
        let delivered = 0, failed = 0;
        try {
            const stamp = now().toISOString();
            const page = await server.from('web_push_subscriptions').select('*').gt('expires_at', stamp).order('last_checked_at', { ascending: true }).limit(100);
            if (page.error) throw Error('database');
            for (const sub of page.data || []) {
                await server.from('web_push_subscriptions').update({ last_checked_at: stamp }).eq('id', sub.id);
                if (!validSubscription(sub.subscription)) { failed++; continue; }
                const loaded = await server.from('notebooks').select('todos,notes,revision').eq('user_id', sub.owner_id).maybeSingle();
                if (loaded.error) { failed++; continue; }
                for (const job of dueReminders(loaded.data, sub, stamp)) {
                    const token = uuid();
                    const claimed = await server.rpc('claim_web_push_delivery', { p_subscription: sub.id, p_entry: job.entryId, p_at: job.at, p_token: token });
                    if (claimed.error) { failed++; continue; }
                    if (!claimed.data) continue;
                    try {
                        // Recheck deletions, completion and date edits after claiming.
                        const live = await server.from('notebooks').select('todos,notes').eq('user_id', sub.owner_id).maybeSingle();
                        const currentSub = await server.from('web_push_subscriptions').select('id,enabled_at,time_zone').eq('id', sub.id).eq('owner_id', sub.owner_id).maybeSingle();
                        if (live.error || currentSub.error) throw Error('database');
                        const entry = notebookRecords(live.data).find(e => e.id === job.entryId);
                        if (!currentSub.data || currentSub.data.enabled_at !== sub.enabled_at || currentSub.data.time_zone !== sub.time_zone || reminderInstant(entry, sub.time_zone) !== job.at) {
                            await server.from('web_push_deliveries').update({ state: 'cancelled', locked_until: null }).eq('subscription_id', sub.id).eq('entry_id', job.entryId).eq('remind_at', job.at).eq('lease_token', token);
                            continue;
                        }
                        // Keep note text out of lock-screen notifications and push logs.
                        await send(sub.subscription, JSON.stringify({ version: 1, owner: sub.owner_id, entryId: job.entryId, at: job.at, language: sub.language }), { TTL: 1800, urgency: 'normal' });
                        const saved = await server.from('web_push_deliveries').update({ state: 'sent', locked_until: null }).eq('subscription_id', sub.id).eq('entry_id', job.entryId).eq('remind_at', job.at).eq('lease_token', token);
                        if (saved.error) { failed++; } else delivered++;
                    } catch (error) {
                        failed++;
                        if ([404, 410].includes(error?.statusCode)) {
                            await server.from('web_push_subscriptions').delete().eq('id', sub.id).eq('owner_id', sub.owner_id);
                        } else {
                            await server.from('web_push_deliveries').update({ locked_until: null, next_attempt_at: new Date(now().getTime() + 60000).toISOString() }).eq('subscription_id', sub.id).eq('entry_id', job.entryId).eq('remind_at', job.at).eq('lease_token', token);
                        }
                    }
                }
            }
            // Expired endpoints and delivery history are not kept indefinitely.
            await server.from('web_push_subscriptions').delete().lt('expires_at', stamp);
            await server.from('web_push_deliveries').delete().lt('remind_at', new Date(now().getTime() - 7 * 86400000).toISOString());
            return reply(200, { delivered, failed });
        } catch (_) { return reply(503, { code: 'service_unavailable' }); }
    };
}
