export const REMINDER_OPTIONS = [
    ['none', 'Не напоминать'], ['at', 'В срок'], ['15', 'За 15 минут'],
    ['60', 'За 1 час'], ['day', 'За 1 день'], ['custom', 'В другое время']
];
export const dateValue = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
export const timeValue = date => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
export function normalizeReminder(value) {
    const mode = REMINDER_OPTIONS.some(([key]) => key === value?.mode) ? value.mode : 'none';
    return { mode, date: mode === 'custom' ? String(value.date || '') : '', time: mode === 'custom' ? String(value.time || '') : '' };
}
export function reminderMoment(entry) {
    if (!entry || entry.checked) return null;
    const reminder = normalizeReminder(entry.reminder);
    if (reminder.mode === 'none') return null;
    const day = reminder.mode === 'custom' ? reminder.date : entry.date;
    const time = reminder.mode === 'custom' ? reminder.time : entry.time || '09:00';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || !/^\d{2}:\d{2}$/.test(time || '')) return null;
    const [year, month, date] = day.split('-').map(Number), [hour, minute] = time.split(':').map(Number);
    if (year < 1000 || year > 9999 || month < 1 || month > 12 || hour > 23 || minute > 59) return null;
    const moment = new Date(year, month - 1, date, hour, minute);
    if (dateValue(moment) !== day || timeValue(moment) !== time) return null;
    if (reminder.mode === 'day') moment.setDate(moment.getDate() - 1);
    else if (['15', '60'].includes(reminder.mode)) moment.setMinutes(moment.getMinutes() - Number(reminder.mode));
    return moment;
}
export function snoozeReminder(entry, now = new Date(), minutes = 10) {
    const at = new Date(Math.ceil((now.getTime() + minutes * 60000) / 60000) * 60000);
    entry.reminder = { mode: 'custom', date: dateValue(at), time: timeValue(at) };
    entry.updatedAt = now.toISOString();
}
export function reminderLabel(entry, now = new Date(), locale = 'ru') {
    const at = reminderMoment(entry);
    if (!at) return '';
    return `${at <= now ? 'Напоминание прошло' : 'Напомнить'}: ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: String(locale).startsWith('en') ? 'h12' : 'h23' }).format(at)}`;
}
export function notificationPlan(records, account, now = new Date(), { includePast = false } = {}) {
    const used = new Set();
    return [...records].sort((a, b) => a.entry.id.localeCompare(b.entry.id)).flatMap(record => {
        let hash = 2166136261;
        for (const char of `${account}:${record.entry.id}`) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
        let id = (hash >>> 0) % 2147483646 + 1;
        while (used.has(id)) id = id % 2147483646 + 1;
        used.add(id);
        const at = reminderMoment(record.entry);
        if (!account || !at || (!includePast && at <= now)) return [];
        const text = record.type === 'task' ? record.entry.name : record.entry.title || record.entry.text;
        const body = String(text || '').slice(0, 300);
        const extra = { account, entryId: record.entry.id, at: at.toISOString(),
            wallTime: `${dateValue(at)}T${timeValue(at)}:00` };
        extra.signature = JSON.stringify([account, record.entry.id, extra.at, body]);
        return [{ id, title: record.type === 'task' ? 'Пора выполнить задачу' : 'Напоминание о заметке', body,
            schedule: { at, allowWhileIdle: true }, channelId: 'todo-reminders', extra }];
    });
}
