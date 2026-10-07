import { notificationPlan, reminderMoment } from './reminderModel.js';

// Native operations are serialized; every async boundary rechecks the account.
export function createReminderEngine({ native, plugin, storage, getRecords, onDue, onOpen = onDue, onStatus, now = () => new Date(), localize = text => text }) {
    let account = null, enabled = false, generation = 0, queue = Promise.resolve();
    let armed = new Map(), pendingAction = null;
    let permission = 'unknown', exact = false, error = '', scheduled = 0;
    const key = id => `todo-personal:reminders-enabled:${id}`;
    const seenKey = (id, at) => `todo-personal:reminder-seen:${account}:${id}:${at}`;
    const report = () => onStatus({ native, enabled, permission, exact, error, scheduled });
    const enqueue = action => {
        queue = queue.catch(() => {}).then(action).catch(() => {
            error = 'Не удалось обновить напоминания. Откройте настройки и повторите попытку.'; report();
        });
        return queue;
    };
    function deliver(notification, open = false) {
        if (!enabled || notification.extra?.account !== account) return false;
        const record = getRecords().find(r => r.entry.id === notification.extra?.entryId);
        if (!record || reminderMoment(record.entry)?.toISOString() !== notification.extra?.at) return false;
        if (open) return onOpen(record) !== false;
        onDue(record); return true;
    }
    function tick() {
        if (native || !enabled || !account) return;
        for (const record of getRecords()) {
            const at = reminderMoment(record.entry);
            // Do not flood the user with old reminders after a long absence.
            if (!at || armed.get(record.entry.id) !== at.toISOString() || at > now() || now() - at > 30 * 60000) continue;
            try {
                const marker = seenKey(record.entry.id, at.toISOString());
                if (storage.getItem(marker)) continue;
                storage.setItem(marker, '1');
            } catch (_) { error = 'Не удалось запомнить показ напоминания на устройстве.'; report(); return; }
            onDue(record); return;
        }
    }
    function refresh() {
        if (!native) {
            const records = getRecords();
            const nextArmed = new Map();
            if (enabled && account) for (const record of records) {
                const at = reminderMoment(record.entry);
                if (at && (at > now() || armed.get(record.entry.id) === at.toISOString())) nextArmed.set(record.entry.id, at.toISOString());
            }
            armed = nextArmed;
            scheduled = enabled ? notificationPlan(records, account, now()).length : 0;
            report(); tick(); return Promise.resolve();
        }
        const ticket = generation;
        return enqueue(async () => {
            if (ticket !== generation) return;
            error = '';
            if (!enabled || !account) {
                await plugin.cancelAll();
                if (ticket !== generation) return;
                await plugin.removeAllDeliveredNotifications();
                if (ticket !== generation) return;
                scheduled = 0; report(); return;
            }
            const permissions = await plugin.checkPermissions();
            if (ticket !== generation) return;
            permission = permissions.display;
            if (permission !== 'granted') {
                await plugin.cancelAll(); scheduled = 0; report(); return;
            }
            exact = (await plugin.checkExactNotificationSetting()).exact_alarm === 'granted';
            if (ticket !== generation) return;
            await plugin.createChannel({ id: 'todo-reminders', name: localize('Напоминания о записях'), importance: 4, visibility: 0, vibration: true });
            if (ticket !== generation) return;
            const pending = (await plugin.getPending()).notifications;
            if (ticket !== generation) return;
            const desired = notificationPlan(getRecords(), account, now()).map(item => ({ ...item, title: localize(item.title), isExactNotification: exact }));
            const wanted = new Map(desired.map(item => [item.id, item]));
            const unchanged = new Set(), cancel = [];
            for (const old of pending) {
                const next = wanted.get(old.id);
                if (next && old.extra?.signature === next.extra.signature && old.title === next.title && old.isExactNotification === exact) unchanged.add(old.id);
                else cancel.push({ id: old.id });
            }
            if (cancel.length) await plugin.cancel({ notifications: cancel });
            if (ticket !== generation) return;
            const fresh = desired.filter(item => !unchanged.has(item.id));
            if (fresh.length) await plugin.schedule({ notifications: fresh });
            if (ticket !== generation) return;
            const delivered = await plugin.getDeliveredNotifications();
            if (ticket !== generation) return;
            const active = getRecords();
            const obsolete = delivered.notifications.filter(item => {
                const record = active.find(r => r.entry.id === item.extra?.entryId);
                return item.extra?.account !== account || !record || reminderMoment(record.entry)?.toISOString() !== item.extra?.at;
            });
            if (obsolete.length) await plugin.removeDeliveredNotifications({ notifications: obsolete });
            scheduled = desired.length; report();
            if (pendingAction && deliver(pendingAction, true)) pendingAction = null;
        });
    }
    return {
        refresh, tick,
        async start() {
            if (!native) return;
            await plugin.addListener('localNotificationReceived', notification => deliver(notification));
            await plugin.addListener('localNotificationActionPerformed', event => { if (!deliver(event.notification, true)) pendingAction = event.notification; });
        },
        setAccount(id) {
            if (id && pendingAction?.extra?.account !== id) pendingAction = null;
            account = id; armed.clear(); generation++; error = ''; permission = 'unknown'; scheduled = 0;
            try { enabled = Boolean(id && storage.getItem(key(id)) === 'true'); } catch (_) { enabled = false; }
            onDue(null); report(); return refresh();
        },
        async configure(value) {
            const id = account, ticket = generation;
            if (!id) return false;
            error = '';
            try {
                if (native && value) {
                    const result = await plugin.requestPermissions();
                    if (ticket !== generation) return false;
                    permission = result.display;
                    if (permission !== 'granted') { report(); return false; }
                }
                if (ticket !== generation) return false;
                storage.setItem(key(id), String(value)); enabled = value; generation++;
                if (!value) { pendingAction = null; onDue(null); }
                report(); await refresh(); return true;
            } catch (_) { error = 'Не удалось сохранить настройку напоминаний.'; report(); return false; }
        },
        async enableExact() {
            if (!native || !account) return;
            await plugin.changeExactNotificationSetting();
            return refresh();
        }
    };
}
