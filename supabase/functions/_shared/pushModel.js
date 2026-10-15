import { Temporal } from 'npm:@js-temporal/polyfill@0.5.1';

export function validSubscription(value) {
    try {
        const url = new URL(value.endpoint);
        const host = url.hostname;
        if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || value.endpoint.length > 4096) return false;
        // Sending requests to an arbitrary submitted URL would permit SSRF.
        if (!(host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') || host === 'web.push.apple.com' || host.endsWith('.notify.windows.com'))) return false;
        const decode = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
        if (!/^[\w-]{87}$/.test(value.keys.p256dh) || !/^[\w-]{22}$/.test(value.keys.auth)) return false;
        const key = decode(value.keys.p256dh);
        return key.length === 65 && key[0] === 4 && decode(value.keys.auth).length === 16;
    } catch (_) { return false; }
}
export function validTimezone(zone) {
    if (typeof zone !== 'string' || zone.length > 100) return false;
    try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); return true; } catch (_) { return false; }
}
export function reminderInstant(entry, timeZone) {
    if (!entry || entry.checked || !entry.id) return null;
    const mode = entry.reminder?.mode;
    if (!['at', '15', '60', 'day', 'custom'].includes(mode)) return null;
    const date = mode === 'custom' ? entry.reminder.date : entry.date;
    const time = mode === 'custom' ? entry.reminder.time : entry.time || '09:00';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '') || Number(date.slice(0, 4)) < 1000) return null;
    try {
        let local = Temporal.PlainDateTime.from(date + 'T' + time, { overflow: 'reject' });
        // Match reminderModel: a nonexistent entered local clock time is invalid.
        let zoned = local.toZonedDateTime(timeZone, { disambiguation: 'compatible' });
        if (!zoned.toPlainDateTime().equals(local)) return null;
        // Existing Android/web reminders subtract wall-clock days/minutes.
        if (mode === 'day') local = local.subtract({ days: 1 });
        if (mode === '15' || mode === '60') local = local.subtract({ minutes: Number(mode) });
        zoned = local.toZonedDateTime(timeZone, { disambiguation: 'compatible' });
        return new Date(Number(zoned.epochMilliseconds)).toISOString();
    } catch (_) { return null; }
}
export function notebookRecords(notebook) {
    const tasks = Object.values(notebook?.todos || {}).flatMap(list => Array.isArray(list) ? list : []);
    return [...tasks, ...(Array.isArray(notebook?.notes) ? notebook.notes : [])];
}
export function dueReminders(notebook, subscription, now) {
    const since = Math.max(Date.parse(subscription.enabled_at), Date.parse(now) - 30 * 60000);
    if (!Number.isFinite(since) || !validTimezone(subscription.time_zone)) return [];
    const used = new Set();
    return notebookRecords(notebook).flatMap(entry => {
        const at = reminderInstant(entry, subscription.time_zone);
        if (!at || Date.parse(at) < since || at > now || used.has(entry.id)) return [];
        used.add(entry.id);
        return [{ entryId: String(entry.id), at }];
    });
}
