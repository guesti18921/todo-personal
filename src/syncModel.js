import { normalizeNotebook, createEntryId } from './localNotebook.js';
export function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(name => JSON.stringify(name) + ':' + stable(value[name])).join(',') + '}';
    return JSON.stringify(value);
}
export function notebookSummary(state) {
    const tasks = Object.values(state.todos).flat();
    return { tasks: tasks.filter(e => !e.checked).length, completed: tasks.filter(e => e.checked).length, notes: state.notes.length };
}
function entries(state) {
    return [...Object.entries(state.todos).flatMap(([project, list]) => list.map(entry => ({ type: 'task', project, entry }))), ...state.notes.map(entry => ({ type: 'note', project: '', entry }))];
}
export function compareNotebooks(local, cloud) {
    const a = new Map(entries(local).map(r => [r.entry.id, r])), b = new Map(entries(cloud).map(r => [r.entry.id, r]));
    return [...new Set([...a.keys(), ...b.keys()])].flatMap(id => {
        const left = a.get(id), right = b.get(id);
        return stable(left) === stable(right) ? [] : [{ id, local: left || null, cloud: right || null }];
    });
}
export function combineNotebooks(local, cloud) {
    const result = normalizeNotebook(cloud), existing = new Map(entries(result).map(r => [r.entry.id, r]));
    const used = new Set([...existing.keys(), ...entries(local).map(r => r.entry.id)]);
    for (const record of entries(normalizeNotebook(local))) {
        const old = existing.get(record.entry.id);
        if (old && stable(old) === stable(record)) continue;
        const entry = JSON.parse(JSON.stringify(record.entry));
        if (old) {
            do { entry.id = createEntryId(); } while (used.has(entry.id));
            used.add(entry.id); entry.conflictCopy = true;
            entry.reminder = { mode: 'none', date: '', time: '' }; entry.reminderAt = null;
        }
        if (record.type === 'note') result.notes.push(entry);
        else { if (!Object.prototype.hasOwnProperty.call(result.todos, record.project)) result.todos[record.project] = []; result.todos[record.project].push(entry); }
    }
    return normalizeNotebook(result);
}
export function syncPresentation(details) {
    if (!details) return { title: 'Блокнот загружается', explanation: 'Дождитесь открытия записей.', warning: false };
    if (!details.localSaved) return { title: 'Не сохранено на устройстве', explanation: 'Не закрывайте страницу. Освободите место и повторите сохранение или скачайте копию записей.', warning: true };
    if (details.conflict) return { title: 'Нужно сравнить две копии', explanation: 'На другом устройстве изменились записи. Эта копия сохранена на устройстве. Автоматическая отправка приостановлена, чтобы ничего не перезаписать.', warning: true };
    const states = {
        synced: ['Синхронизировано', 'Эта копия сохранена на устройстве и совпадает с последней проверенной копией в аккаунте.'],
        syncing: ['Отправляем изменения', 'Записи уже сохранены на устройстве. Можно продолжать работу.'],
        pending: ['На устройстве · ожидает отправки', 'Изменения сохранены здесь. Отправим их автоматически при доступном соединении.'],
        offline: ['На устройстве · нет соединения с сервером', 'Записи сохранены здесь. Интернет или VPN могут быть недоступны. Попробуем соединиться снова; можно продолжать работу.'],
        local: ['Сохранено на устройстве', 'Открыта сохранённая копия. Проверим изменения в аккаунте при доступном соединении.'],
        older: ['Облачная копия устарела', 'Сохранённые на устройстве записи оставлены без изменений. Повторите проверку позже.']
    };
    const [title, explanation] = states[details.phase] || states.local;
    return { title, explanation, warning: ['offline', 'older'].includes(details.phase) };
}
