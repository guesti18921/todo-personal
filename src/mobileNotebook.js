import { attachNativeDatePicker } from './dateInput.js';
import { t, ui, getLanguage } from './i18n.js';
import { formatClock, timeInput, syncClockInputs, readClockInput, getTimePreference, setTimePreference, clockHourCycle } from './timeInput.js';
import { browseEntries, prepareListAction, applyListChanges, entryTimestamp, prepareRemoval, applyRemoval } from './listActions.js';
import { createEntryId } from './localNotebook.js';
import { syncPresentation as rawSyncPresentation, notebookSummary } from './syncModel.js';
import { suggestDeadlineChoices } from './deadlineParser.js';
import { REMINDER_OPTIONS, normalizeReminder, reminderMoment, reminderLabel, snoozeReminder } from './reminderModel.js';

export function localDateString(date = new Date()) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function listEntries(todos, notes) {
    const tasks = Object.entries(todos).flatMap(([project, entries]) => entries.map(entry => ({ entry, type: 'task', project })));
    return tasks.concat(notes.map(entry => ({ entry, type: 'note', project: null })));
}

export function todayGroups(records, day = localDateString()) {
    const active = records.filter(record => !record.entry.checked);
    const sort = list => list.sort((a, b) => (a.entry.date || '').localeCompare(b.entry.date || '') || (a.entry.time || '99:99').localeCompare(b.entry.time || '99:99'));
    return {
        overdue: sort(active.filter(({ entry }) => entry.date && entry.date < day)),
        today: sort(active.filter(({ entry }) => entry.date === day)),
        pinned: active.filter(({ entry, project }) => !entry.date && (entry.today === true || (entry.today === undefined && project === 'today')))
    };
}

export function saveEntry(todos, notes, fields, previous = null) {
    const id = previous?.entry.id || createEntryId();
    const stamp = new Date().toISOString();
    const common = { ...(previous?.entry || {}), id, date: fields.date || '', time: fields.date ? fields.time || '' : '', today: !fields.date && Boolean(fields.today), deadlineDismissed: fields.deadlineDismissed || '', deadlineAnchor: fields.deadlineAnchor || previous?.entry.deadlineAnchor || null, createdAt: previous?.entry.createdAt || previous?.entry.updatedAt || stamp, pinned: fields.pinned === undefined ? Boolean(previous?.entry.pinned) : Boolean(fields.pinned), updatedAt: stamp };
    common.reminder = normalizeReminder(fields.reminder ?? previous?.entry.reminder);
    if (previous && previous.type !== fields.type) {
        if (previous.type === 'note') notes.splice(notes.findIndex(entry => entry.id === id), 1);
        else todos[previous.project] = todos[previous.project].filter(entry => entry.id !== id);
    }
    let entry;
    if (fields.type === 'note') {
        entry = { ...common, title: fields.text, text: fields.details || '', checked: false };
        delete entry.name; delete entry.details; delete entry.completedAt;
        const index = notes.findIndex(item => item.id === id);
        if (index < 0) notes.unshift(entry); else notes[index] = entry;
    } else {
        const project = previous?.type === 'task' ? previous.project : 'home';
        entry = { ...common, name: fields.text, details: fields.details || '', project, priority: previous?.entry.priority || 'low', checked: Boolean(previous?.type === 'task' && previous.entry.checked) };
        delete entry.title; delete entry.text;
        const index = todos[project].findIndex(item => item.id === id);
        if (index < 0) todos[project].push(entry); else todos[project][index] = entry;
    }
    return id;
}

export function toggleEntry(record) {
    if (record.type !== 'task') return;
    record.entry.checked = !record.entry.checked;
    record.entry.completedAt = record.entry.checked ? new Date().toISOString() : null;
    record.entry.reminderAt = null;
    record.entry.reminder = { mode: 'none', date: '', time: '' };
    record.entry.updatedAt = new Date().toISOString();
}

const syncPresentation = details => { const info = rawSyncPresentation(details); return { ...info, title: t(info.title), explanation: t(info.explanation) }; };

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function createMobileNotebook({ root, todos, notes, persist, logout, reauthenticate, reauthenticateGoogle, recoverPassword, resetPassword, getReauthenticationMethods = () => ({ password: true, google: false }), pickTime = () => false, pickDate = null, configureWebPush = null, deleteAccount, getAccount, configureReminders, enableExactReminders, refreshReminders, getSyncDetails = () => null, syncNow, inspectConflict, resolveConflict, exportNotebook, canExportNotebook = true, changeLanguage = () => false }) {
    const shell = document.createElement('section');
    shell.className = 'mobile-notebook';
    shell.setAttribute('aria-label', t('Мобильный блокнот'));
    shell.innerHTML = ui`<header class="mn-header"><span class="mn-logo">// TO-DO</span><button type="button" class="mn-status" data-sync-open aria-label="Открыть состояние сохранения"></button></header><main class="mn-main"></main><div class="mn-message" role="status" aria-live="polite"></div><button class="mn-add" type="button" aria-label="Создать запись">+</button><nav class="mn-nav" aria-label="Разделы блокнота"><button data-view="today" type="button">Сегодня</button><button data-view="all" type="button">Все записи</button><button data-view="done" type="button">Выполнено</button><button data-view="settings" type="button">Настройки</button></nav>`;
    root.append(shell);
    const reminderBanner = document.createElement('section');
    reminderBanner.className = 'mn-reminder-banner'; reminderBanner.hidden = true;
    reminderBanner.setAttribute('role', 'status');
    shell.querySelector('.mn-header').after(reminderBanner);
    const syncNotice = document.createElement('aside');
    syncNotice.className = 'mn-sync-notice'; syncNotice.hidden = true; syncNotice.setAttribute('role', 'status');
    reminderBanner.before(syncNotice);
    const main = shell.querySelector('.mn-main'), nav = shell.querySelector('.mn-nav'), add = shell.querySelector('.mn-add'), message = shell.querySelector('.mn-message');
    let view = 'today', editor = false, editingId = null, creating = false, type = 'task', query = '', filter = 'all', account = null, draftSafe = true, statusText = '', undo = null, undoTimer;
    let dueFilter = 'all', listSort = 'oldest', selecting = false, selected = new Set();
    const records = () => listEntries(todos, notes);
    const find = id => records().find(record => record.entry.id === id);
    const draftKey = (id = null) => id ? `todo-personal:entry-edit-draft:${account}:${id}` : `todo-personal:entry-draft:${account}`;
    const preferencesKey = () => `todo-personal:preferences:${account}`;
    let smartDates = true, dismissedDeadline = '', suggestion = null, deadlineAnchor = null;
    let syncDetails = null, syncBusy = false, syncPreview = null, syncError = '', offlineReady = false;
    let deletionBusy = false, deletionError = '';
    let reauthBusy = false, reauthError = '', reauthMessage = '', reauthOperation = 0, savedEditorFingerprint = null;
    let orphanDraftId = null;
    let pushState = { supported: false, enabled: false, error: '' }, pushBusy = false;
    const reauthButton = () => `<button type="button" class="mn-secondary" data-reauthenticate>${t('Войти заново')}</button>`;
    let reminderState = { native: false, enabled: false, permission: 'unknown', exact: false, scheduled: 0, error: '' }, reminderQueue = [], reminderBusy = false;
    const suggestionKey = value => value ? `${value.date}|${value.time}` : '';
    function readPreferences() {
        try { const prefs = JSON.parse(localStorage.getItem(preferencesKey())); smartDates = prefs?.smartDates !== false; listSort = ['oldest', 'newest', 'updated', 'deadline'].includes(prefs?.listSort) ? prefs.listSort : 'oldest'; }
        catch (_) { smartDates = true; listSort = 'oldest'; }
    }
    let messageTimer, pendingRemoval = null;
    const say = text => {
        clearTimeout(messageTimer); clearTimeout(undoTimer); undo = null;
        message.textContent = t(text);
        const important = /не удалось|не закрывайте|не сохран|cannot|could not|unsaved|do not close|failed/i.test(text);
        message.dataset.error = String(important);
        if (text && !important) messageTimer = setTimeout(() => { message.textContent = ''; }, 3000);
    };
    function offerUndo(text, action) {
        clearTimeout(undoTimer); clearTimeout(messageTimer);
        undo = action;
        message.innerHTML = ui`${text} <button type="button" data-undo>Отменить</button>`;
        undoTimer = setTimeout(() => { if (undo === action) { undo = null; say(''); } }, 8000);
    }
    function fields() {
        return { type, pinned: main.querySelector('[name="pinned"]').checked, text: main.querySelector('[name="text"]').value, details: main.querySelector('[name="details"]').value, date: main.querySelector('[name="date"]').value, time: main.querySelector('[name="time"]').value, today: main.querySelector('[name="today"]').checked, deadlineDismissed: dismissedDeadline, deadlineAnchor,
            reminder: normalizeReminder({ mode: main.querySelector('[name="reminderMode"]').value, date: main.querySelector('[name="reminderDate"]').value, time: main.querySelector('[name="reminderTime"]').value }) };
    }
    function stashDraft() {
        if (!editor || !account) return;
        try {
            const value = fields();
            if (!creating && editingId && JSON.stringify(value) === savedEditorFingerprint) return;
            if (editingId || value.text.trim() || value.details.trim()) {
                localStorage.setItem(draftKey(creating ? null : editingId), JSON.stringify({ ...value, editingId: creating ? null : editingId }));
                // Remove the orphan only after its replacement draft is durable.
                if (orphanDraftId) { try { localStorage.removeItem(draftKey(orphanDraftId)); orphanDraftId = null; } catch (_) { /* Both safe copies remain. */ } }
            }
            else localStorage.removeItem(draftKey());
            draftSafe = true;
        } catch (_) { draftSafe = false; say(t('Не удалось сохранить черновик. Не закрывайте приложение.')); }
    }
    function readDraft(id = null) {
        try {
            const value = JSON.parse(localStorage.getItem(draftKey(id)));
            return value && typeof value.text === 'string' && typeof value.details === 'string' && ['task', 'note'].includes(value.type) && (id || value.text.trim() || value.details.trim()) ? value : null;
        } catch (_) { return null; }
    }
    function renderDraft() {
        const slot = main.querySelector('.mn-draft-slot');
        if (!slot) return;
        let draft = readDraft(), id = null;
        if (!draft) {
            const prefix = `todo-personal:entry-edit-draft:${account}:`;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith(prefix)) { id = key.slice(prefix.length); draft = readDraft(id); if (draft) break; }
            }
        }
        const saved = id && find(id);
        const savedTitle = saved && (saved.type === 'task' ? saved.entry.name : saved.entry.title || saved.entry.text);
        const preview = text => escape(Array.from(String(text)).slice(0, 100).join(''));
        slot.innerHTML = draft ? ui`<aside class="mn-draft-panel" aria-label="Несохранённая запись"><h2>${saved ? t('Незавершённые изменения записи') : t('Продолжить черновик')}</h2>${saved ? `<p dir="auto">${preview(savedTitle)}</p>` : ''}<p dir="auto">${preview(draft.text.trim() || draft.details.trim() || t(saved ? 'Текст в черновике очищен. Сохранённая запись остаётся в блокноте.' : 'Текст в черновике очищен.'))}</p><p>${id && !saved ? t('Исходная запись удалена. Черновик сохранён на этом устройстве; его можно сохранить как новую запись.') : saved ? t('Изменения сохранены на этом устройстве. Можно продолжить правки или удалить черновик и оставить сохранённую запись.') : t('Текст сохранён на этом устройстве. Завершите запись, чтобы добавить её в блокнот.')}</p><div><button type="button" class="mn-primary" data-continue-draft="${escape(id || '')}">Продолжить</button><button type="button" class="mn-secondary" data-discard-draft="${escape(id || '')}">${saved ? t('Отменить незавершённые правки') : t('Удалить черновик')}</button></div></aside>` : '';
    }
    function card({ entry, type: kind, project }) {
        const text = kind === 'task' ? entry.name : entry.title || entry.text;
        const details = kind === 'task' ? entry.details : entry.title ? entry.text : '';
        const labels = selecting ? [kind === 'task' ? t('Задача') : t('Заметка')] : [];
        const dueDate = entry.date ? new Date(entry.date + 'T12:00:00') : null;
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        if (dueDate && !Number.isNaN(dueDate.getTime())) labels.push(entry.date === localDateString() ? t('Сегодня') : entry.date === localDateString(tomorrow) ? t('Завтра') : new Intl.DateTimeFormat(getLanguage(), { day: 'numeric', month: 'short', year: dueDate.getFullYear() !== tomorrow.getFullYear() ? 'numeric' : undefined }).format(dueDate));
        if (!entry.checked && entry.date && entry.date < localDateString()) labels.push(t('Просрочено'));
        if (entry.time) labels.push(formatClock(entry.time, getLanguage()));
        if (!entry.date) labels.push(t('Без срока'));
        if (!entry.date && (entry.today || (entry.today === undefined && project === 'today'))) labels.push(t('В Сегодня'));
        const reminder = t(reminderLabel(entry, new Date(), getLanguage(), clockHourCycle()));
        if (reminder) labels.push(reminder + (reminderState.enabled ? '' : t(' · на этом устройстве выключено')));
        if (entry.conflictCopy) labels.push(t('Копия с устройства'));
        if (project && !['home', 'today', 'week'].includes(project)) labels.push(project);
        return `<article class="mn-card ${entry.checked ? 'mn-completed' : ''}">${selecting ? ui`<button class="mn-select" type="button" data-select="${escape(entry.id)}" aria-pressed="${selected.has(entry.id)}" aria-label="Выбрать: ${escape(text)}">${selected.has(entry.id) ? '✓' : '○'}</button>` : kind === 'task' ? `<button class="mn-check" type="button" data-check="${escape(entry.id)}" aria-label="${entry.checked ? t('Вернуть в активные') : t('Выполнить')}: ${escape(text)}">${entry.checked ? '✓' : '○'}</button>` : t('<span class="mn-note-label">Заметка</span>')}<button class="mn-open" type="button" data-open="${escape(entry.id)}">${entry.pinned ? `<span class="mn-pinned-mark">${t('Закреплено')}</span>` : ''}<span class="mn-title" dir="auto">${escape(text)}</span>${details ? `<span class="mn-details" dir="auto">${escape(details)}</span>` : ''}<span class="mn-meta">${escape(labels.join(' · '))}</span></button></article>`;
    }
    function group(label, list) { return list.length ? `<section><h2 class="mn-group">${label}</h2>${list.map(card).join('')}</section>` : ''; }
    function timeSettings() { return ui`<section class="mn-setting"><h2>Формат времени</h2><select class="mn-input" data-time-format aria-label="Формат времени">${[['device', t('Как на устройстве')], ['24', t('24 часа · 18:30')], ['12', t('12 часов · 6:30 PM')]].map(([value, label]) => `<option value="${value}" ${getTimePreference() === value ? 'selected' : ''}>${label}</option>`).join('')}</select><p>Меняется только отображение времени. Сроки и напоминания остаются прежними.</p></section>`; }
    function languageSettings() { return ui`<section class="mn-setting"><h2>Язык интерфейса</h2><select class="mn-input" data-language aria-label="Язык интерфейса"><option value="ru" ${getLanguage() === 'ru' ? 'selected' : ''}>Русский</option><option value="en" ${getLanguage() === 'en' ? 'selected' : ''}>English</option></select><p>Язык можно изменить в любой момент. Текст записей не переводится.</p></section>`; }
    function renderList() {
        renderDraft();
        const found = visibleEntries();
        for (const id of selected) if (!found.some(r => r.entry.id === id)) selected.delete(id);
        renderBulk(found);
        let html;
        if (view === 'today') {
            const pinned = found.filter(r => r.entry.pinned);
            const groups = todayGroups(found.filter(r => !r.entry.pinned));
            html = group(t('Закреплённые'), pinned) + group(t('Просрочено'), groups.overdue) + group(t('Сегодня'), groups.today) + group(t('Без срока · добавлено в Сегодня'), groups.pinned);
        } else {
            const pinned = found.filter(r => r.entry.pinned), regular = found.filter(r => !r.entry.pinned);
            html = group(t('Закреплённые'), pinned);
            if (view === 'all') {
                const buckets = new Map();
                for (const record of regular) {
                    const timestamp = ['oldest', 'newest'].includes(listSort) ? entryTimestamp(record.entry) : listSort === 'updated' ? Date.parse(record.entry.updatedAt || '') : record.entry.date ? new Date(record.entry.date + 'T12:00:00').getTime() : null;
                    const day = timestamp !== null && Number.isFinite(timestamp) ? localDateString(new Date(timestamp)) : '';
                    if (!buckets.has(day)) buckets.set(day, []);
                    buckets.get(day).push(record);
                }
                for (const [day, list] of buckets) {
                    const label = day ? new Intl.DateTimeFormat(getLanguage(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(day + 'T12:00:00')) : t(listSort === 'deadline' ? 'Без срока' : 'Дата неизвестна');
                    html += group(label, list);
                }
            } else html += regular.map(card).join('');
        }
        main.querySelector('.mn-list').innerHTML = html || `<p class="mn-empty">${query || filter !== 'all' || dueFilter !== 'all' ? t('По выбранным условиям ничего не найдено. Измените поиск или сбросьте фильтры.') : view === 'today' ? t('На сегодня ничего не запланировано.') : view === 'done' ? t('Здесь появятся выполненные задачи.') : t('Записей пока нет. Нажмите +, чтобы создать первую.')}</p>`;
    }
    function render() {
        shell.setAttribute('aria-label', t('Мобильный блокнот'));
        add.setAttribute('aria-label', t('Создать запись'));
        nav.setAttribute('aria-label', t('Разделы блокнота'));
        shell.querySelector('.mn-status').setAttribute('aria-label', t('Открыть состояние сохранения'));
        updateSyncNotice();
        const navLabels = { today: 'Сегодня', all: 'Все записи', done: 'Выполнено', settings: 'Настройки' };
        nav.querySelectorAll('[data-view]').forEach(button => { button.textContent = t(navLabels[button.dataset.view]); });
        renderReminderBanner();
        if (editor) return;
        nav.hidden = view === 'delete-account'; add.hidden = selecting || ['settings', 'sync', 'delete-account'].includes(view);
        nav.querySelectorAll('button').forEach(button => { if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
        if (view === 'sync') { renderSync(); return; }
        if (view === 'delete-account') { renderDeletion(); return; }
        if (view === 'reset-password') {
            add.hidden = true; nav.hidden = true;
            if (!main.querySelector('[data-native-reset-form]')) main.innerHTML = ui`<section><button type="button" class="mn-back" data-cancel-reauth>← Назад</button><h1>Новый пароль</h1><p>${escape(getAccount() || '')}</p><form data-native-reset-form><label for="mn-new-password">Новый пароль — минимум 8 символов</label><input class="mn-input" id="mn-new-password" type="password" autocomplete="new-password" minlength="8" required><label for="mn-repeat-password">Повторите пароль</label><input class="mn-input" id="mn-repeat-password" type="password" autocomplete="new-password" minlength="8" required><button class="mn-primary" type="submit">Сохранить пароль</button><p role="alert"></p></form></section>`;
            main.querySelectorAll('input, button').forEach(el => { el.disabled = reauthBusy; });
            main.querySelector('[role="alert"]').textContent = reauthError;
            return;
        }
        if (view === 'reauthenticate') {
            add.hidden = true; nav.hidden = true;
            // Keyboard resize must not replace the focused input. Update only
            // the state of the existing form until this screen is left.
            const methods = getReauthenticationMethods();
            if (!main.querySelector('[data-reauth-screen]')) main.innerHTML = ui`<section data-reauth-screen><button type="button" class="mn-back" data-cancel-reauth>← Назад</button><h1>Войти заново</h1><p>Локальные изменения сохранятся. После входа отправим их в этот же аккаунт.</p><p>${escape(getAccount() || '')}</p>${methods.google ? t('<button type="button" class="mn-primary" data-reauth-google>Продолжить с Google</button><p>Выберите тот же аккаунт Google, который использовали для входа.</p>') : ''}${methods.password ? t('<form data-reauth-form><label for="mn-reauth-password">Пароль</label><input class="mn-input" id="mn-reauth-password" type="password" autocomplete="current-password" required><button type="submit" class="mn-primary">Войти</button><p role="alert"></p></form><button type="button" class="mn-secondary" data-reauth-recovery>Забыли пароль?</button>') : ''}<p data-reauth-message role="status"></p><p data-reauth-error role="alert"></p></section>`;
            const password = main.querySelector('#mn-reauth-password');
            if (password) { password.disabled = reauthBusy; if (reauthBusy) password.value = ''; }
            main.querySelectorAll('[data-reauth-screen] button').forEach(button => { button.disabled = reauthBusy; });
            const submit = main.querySelector('[data-reauth-form] button');
            if (submit) submit.textContent = reauthBusy ? t('Проверяем…') : t('Войти');
            const formError = main.querySelector('[data-reauth-form] [role="alert"]');
            if (formError) formError.textContent = reauthError;
            main.querySelector('[data-reauth-error]').textContent = formError ? '' : reauthError;
            main.querySelector('[data-reauth-message]').textContent = reauthMessage;
            return;
        }
        if (view === 'settings') {
            main.innerHTML = ui`<h1>Настройки</h1><section class="mn-setting"><h2>Аккаунт</h2><p>${escape(getAccount() || '')}</p><button class="mn-secondary" type="button" data-logout>Выйти</button>${reauthButton()}<button class="mn-secondary mn-danger" type="button" data-delete-account>Удалить аккаунт</button></section>${languageSettings()}${timeSettings()}${reminderSettings()}${webPushSettings()}<section class="mn-setting"><h2>Подсказки сроков</h2><label class="mn-pin"><input type="checkbox" data-smart-dates ${smartDates ? 'checked' : ''}>Предлагать дату и время из текста</label><p>Напишите, например, «завтра в 18:00». Блокнот предложит срок — применить его можно одним нажатием.</p><details><summary>Какие языки поддерживаются?</summary><p>Поддерживаются основные выражения на русском, английском, немецком, итальянском, испанском, китайском, японском, французском, португальском и корейском. Например: «завтра в 18:00» или «tomorrow at 6 pm». Текст записи сохраняется целиком. Напоминание выбирается отдельно.</p></details></section>${syncSettings()}<section class="mn-setting"><h2>О приложении</h2><p class="mn-version">TO-DO Personal · версия 0.4.37</p><nav class="mn-about-links" aria-label="Информация о приложении"><a data-public-page href="https://todo.m1strell.com/privacy.html#${getLanguage()}" target="_blank" rel="noopener noreferrer"><span>Политика конфиденциальности</span><span aria-hidden="true">›</span></a><a data-public-page href="https://todo.m1strell.com/support.html#${getLanguage()}" target="_blank" rel="noopener noreferrer"><span>Связаться с поддержкой</span><span aria-hidden="true">›</span></a><a data-public-page href="https://todo.m1strell.com/delete-account.html#${getLanguage()}" target="_blank" rel="noopener noreferrer"><span>Удаление без приложения</span><span aria-hidden="true">›</span></a></nav></section>`;
            return;
        }
        // Android's keyboard changes the viewport. Keep the focused search
        // element mounted across resize, reminder refresh and cloud updates.
        const search = main.querySelector('#mn-search');
        if (search && main.dataset.listView === view && document.activeElement === search) {
            search.placeholder = t('Найти запись');
            renderList();
            return;
        }
        main.innerHTML = ui`<h1>${{ today: t('Сегодня'), all: t('Все записи'), done: t('Выполнено') }[view]}</h1><p class="mn-date">${new Intl.DateTimeFormat(getLanguage(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p><label class="mn-search-label" for="mn-search">Поиск</label><input id="mn-search" class="mn-input" type="search" placeholder="Найти запись" value="${escape(query)}">${view === 'all' ? `<div class="mn-filters">${[['all', t('Все')], ['task', t('Задачи')], ['note', t('Заметки')], ['reminder', t('С напоминанием')]].map(([value, label]) => `<button type="button" data-filter="${value}" aria-pressed="${filter === value}">${label}</button>`).join('')}</div>` : ''}${listControls()}<div class="mn-bulk"></div><div class="mn-draft-slot"></div><div class="mn-list"></div>`;
        main.dataset.listView = view;
        renderList();
    }
    function renderDeletion() {
        main.innerHTML = ui`<h1>Удалить аккаунт?</h1><section class="mn-setting"><p>${escape(getAccount() || '')}</p><p>Аккаунт и все записи в облаке будут удалены без возможности восстановления. На этом устройстве будут очищены записи, черновики, резервные копии и напоминания этого аккаунта.</p><p>Для удаления нужен интернет. Копии на других устройствах могут оставаться доступными без сети.</p><p class="mn-deletion-error" role="alert">${escape(deletionError)}</p><div><button class="mn-secondary" type="button" data-cancel-account-deletion ${deletionBusy ? 'disabled' : ''}>Отмена</button><button class="mn-primary mn-danger" type="button" data-confirm-account-deletion ${deletionBusy ? 'disabled' : ''}>${deletionBusy ? t('Удаляем аккаунт…') : t('Удалить навсегда')}</button></div></section>`;
    }
    async function confirmAccountDeletion() {
        if (deletionBusy || view !== 'delete-account' || !account) return;
        const owner = account;
        deletionBusy = true; deletionError = ''; render();
        try { await deleteAccount(); }
        catch (error) { if (owner === account) deletionError = error.message || t('Не удалось удалить аккаунт. Попробуйте снова.'); }
        finally { if (owner === account) { deletionBusy = false; render(); } }
    }
    function visibleEntries() { return browseEntries(records(), { view, filter, due: dueFilter, query, sort: listSort }); }
    function listControls() {
        return ui`${view === 'all' ? ui`<details class="mn-list-options" ${dueFilter !== 'all' ? 'open' : ''}><summary>Срок и порядок записей${dueFilter !== 'all' ? t(' · фильтр включён') : ''}</summary><div class="mn-list-selects"><label>Срок<select class="mn-input" data-due-filter>${[['all', t('Любой срок')], ['overdue', t('Просрочено')], ['today', t('Сегодня')], ['tomorrow', t('Завтра')], ['none', t('Без срока')]].map(([key, label]) => `<option value="${key}" ${dueFilter === key ? 'selected' : ''}>${t(label)}</option>`).join('')}</select></label><label>Порядок<select class="mn-input" data-list-sort>${[['oldest', t('Сначала старые')], ['newest', t('Сначала новые')], ['deadline', t('Сначала ближайший срок')], ['updated', t('Сначала недавно изменённые')]].map(([key, label]) => `<option value="${key}" ${listSort === key ? 'selected' : ''}>${t(label)}</option>`).join('')}</select></label></div></details>` : ''}<div class="mn-list-tools"><button type="button" class="mn-secondary" data-selection-toggle>${selecting ? t('Завершить выбор') : t('Выбрать несколько')}</button><button type="button" class="mn-secondary" data-reset-filters ${query || filter !== 'all' || dueFilter !== 'all' ? '' : 'hidden'}>Сбросить фильтры</button></div>`;
    }
    function renderBulk(found) {
        const area = main.querySelector('.mn-bulk'); if (!area) return;
        area.classList.toggle('mn-bulk-selecting', selecting);
        const reset = main.querySelector('[data-reset-filters]'); if (reset) reset.hidden = !query && filter === 'all' && dueFilter === 'all';
        if (pendingRemoval && (pendingRemoval.length !== selected.size || pendingRemoval.some(c => !selected.has(c.entry.id)))) pendingRemoval = null;
        if (pendingRemoval) { area.innerHTML = ui`<section class="mn-bulk-panel" role="alert"><p>Удалить выбранные записи (${pendingRemoval.length})?</p><p>Их напоминания также будут отменены.</p><div><button type="button" class="mn-secondary" data-cancel-removal>Отмена</button><button type="button" class="mn-primary mn-danger" data-confirm-removal>Удалить выбранные</button></div></section>`; return; }
        if (!selecting) { area.innerHTML = ui`<p class="mn-result-count">Записей: ${found.length}</p>`; return; }
        const tasks = found.filter(r => selected.has(r.entry.id) && r.type === 'task').length;
        area.innerHTML = ui`<section class="mn-bulk-panel" aria-label="Действия с выбранными записями"><p role="status">Выбрано: ${selected.size}</p><div><button type="button" class="mn-secondary" data-select-visible ${found.length ? '' : 'disabled'}>${selected.size === found.length && found.length ? t('Снять выбор') : t('Выбрать все найденные')}</button>${view === 'done' ? ui`<button type="button" class="mn-primary" data-bulk="restore" ${tasks ? '' : 'disabled'}>Вернуть задачи в активные (${tasks})</button>` : ui`<button type="button" class="mn-primary" data-bulk="complete" ${tasks ? '' : 'disabled'}>Выполнить задачи (${tasks})</button><button type="button" class="mn-secondary" data-bulk="tomorrow" ${selected.size ? '' : 'disabled'}>Перенести на завтра</button>`}<button type="button" class="mn-secondary mn-danger" data-bulk="delete" ${selected.size ? '' : 'disabled'}>Удалить выбранные (${selected.size})</button></div><details class="mn-bulk-help"><summary>Что изменится?</summary><p>${view === 'done' ? t('Вернутся только выбранные задачи. Напоминания можно включить в каждой записи.') : t('Выполнение относится только к задачам и отменяет их напоминания. Перенос меняет срок задач и заметок, сохраняя время. Напоминания «В срок» и «За…» следуют за сроком; выбранные отдельно остаются на своей дате.')}</p></details></section>`;
    }
    function clearSelection() { pendingRemoval = null; selecting = false; selected.clear(); }
    function deleteSelection() {
        const changes = pendingRemoval;
        pendingRemoval = null;
        if (!changes || !applyRemoval({ todos, notes }, changes)) { say(t('Записи изменились. Выберите их заново.')); renderList(); return; }
        if (persist() === false) {
            applyRemoval({ todos, notes }, changes, true); persist(); renderList();
            say(t('Не удалось сохранить действие на устройстве. Изменения отменены. Освободите место и попробуйте снова.')); return;
        }
        selecting = false; selected.clear(); render();
        offerUndo(t('Записи удалены.'), () => {
            if (!applyRemoval({ todos, notes }, changes, true)) return false;
            if (persist() !== false) return true;
            applyRemoval({ todos, notes }, changes); persist(); return false;
        });
    }
    function bulkAction(action) {
        if (action === 'delete') { pendingRemoval = prepareRemoval({ todos, notes }, [...selected]); renderBulk(visibleEntries()); return; }
        const changes = prepareListAction(visibleEntries(), selected, action);
        if (!changes.length) { say(t('Изменять нечего: выбранные записи уже имеют этот срок или состояние.')); return; }
        if (!applyListChanges(records(), changes)) { say(t('Записи изменились. Выберите их заново.')); return; }
        if (persist() === false) {
            applyListChanges(records(), changes, true); persist(); render();
            say(t('Не удалось сохранить действие на устройстве. Изменения отменены. Освободите место и попробуйте снова.')); return;
        }
        clearSelection(); render();
        const text = action === 'tomorrow' ? ui`Перенесено на завтра: ${changes.length}. Найти записи можно во «Все записи».` : action === 'complete' ? ui`Выполнено задач: ${changes.length}.` : ui`Возвращено в активные: ${changes.length}.`;
        offerUndo(text, () => {
            if (!applyListChanges(records(), changes, true)) return false;
            if (persist() !== false) return true;
            applyListChanges(records(), changes); persist(); return false;
        });
    }
    function saveChanges(changes, reverse = false) {
        if (!applyListChanges(records(), changes, reverse)) return false;
        if (persist() !== false) return true;
        applyListChanges(records(), changes, !reverse); persist(); return false;
    }
    const actionFailed = () => say(t('Не удалось сохранить действие на устройстве. Изменения отменены. Освободите место и попробуйте снова.'));
    function timestamp(value) {
        if (!value || Number.isNaN(new Date(value).getTime())) return t('пока не подтверждено');
        return new Intl.DateTimeFormat(getLanguage(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: clockHourCycle() }).format(new Date(value));
    }
    function counts(state) { const c = notebookSummary(state); return ui`Задач: ${c.tasks} · выполнено: ${c.completed} · заметок: ${c.notes}`; }
    function syncSettings() {
        const info = syncPresentation(syncDetails);
        return ui`<section class="mn-setting"><h2>Сохранение и синхронизация</h2><p class="mn-settings-status">${escape(info.title)}</p><p class="mn-settings-explanation">${escape(info.explanation)}</p><details><summary>Работа без интернета</summary><p class="mn-offline-ready">${offlineReady ? t('Офлайн-запуск готов на этом устройстве.') : t('Для запуска без интернета сначала откройте эту страницу с сетью и дождитесь подготовки офлайн-версии.')}</p></details><button type="button" class="mn-secondary" data-sync-open>Сохранение и резервная копия</button></section>`;
    }
    function updateSyncNotice() {
        const info = syncPresentation(syncDetails);
        const status = shell.querySelector('.mn-status');
        const short = { offline: 'Нет связи с сервером', local: 'Сохранено на телефоне', pending: 'Ожидает отправки', request: 'Сбой синхронизации', 'account-data': 'Нет облачной копии', permission: 'Нет доступа', auth: 'Нужно войти снова', limited: 'Отправка отложена', available: 'Есть обновления', server: 'Сбой сервера', syncing: 'Отправляем', conflict: 'Две копии' }[syncDetails?.conflict ? 'conflict' : syncDetails?.phase];
        const label = (syncDetails && !syncDetails.localSaved ? info.title : short ? t(short) : info.title) + ' ›';
        if (status.textContent !== label) status.textContent = label;
        status.title = info.title;
        status.dataset.warning = String(info.warning);
        status.dataset.state = info.warning ? 'warning' : syncDetails?.phase === 'synced' && !syncDetails.dirty ? 'confirmed' : syncDetails?.phase === 'syncing' ? 'uploading' : 'local';

        syncNotice.hidden = !info.warning || !syncDetails;
        const noticeKey = `${info.title}|${info.explanation}|${Boolean(syncDetails?.conflict)}`;
        if (syncNotice.dataset.key === noticeKey) return;
        syncNotice.dataset.key = noticeKey;
        const expanded = Boolean(syncNotice.querySelector('details')?.open);
        syncNotice.innerHTML = `<details ${expanded ? 'open' : ''}><summary>${escape(info.title)}</summary><p>${escape(info.explanation)}</p><button type="button" class="mn-secondary" data-sync-open>${syncDetails?.conflict ? t('Сравнить копии') : t('Открыть сохранение')}</button>${syncDetails?.phase === 'auth' ? reauthButton() : ''}</details>`;
    }
    function previewRecord(record) {
        if (!record) return t('<p>Нет в этой копии — возможно, запись удалена.</p>');
        const e = record.entry, text = record.type === 'task' ? e.name : e.title || e.text;
        return `<p dir="auto">${escape(text)}</p><p dir="auto">${escape(record.type === 'task' ? e.details : e.title ? e.text : '')}</p><p>${record.type === 'task' ? e.checked ? t('Выполненная задача') : t('Задача') : t('Заметка')} · ${escape(e.date || t('Без срока'))}${e.time ? ' · ' + escape(formatClock(e.time, getLanguage())) : ''}${t(reminderLabel(e, new Date(), getLanguage(), clockHourCycle())) ? ' · ' + escape(t(reminderLabel(e, new Date(), getLanguage(), clockHourCycle()))) : ''}</p>`;
    }
    function refreshSettingsStatus() {
        const info = syncPresentation(syncDetails);
        const title = main.querySelector('.mn-settings-status'), explanation = main.querySelector('.mn-settings-explanation');
        if (title) title.textContent = info.title;
        if (explanation) explanation.textContent = info.explanation;
        const offline = main.querySelector('.mn-offline-ready');
        if (offline) offline.textContent = offlineReady ? t('Офлайн-запуск готов на этом устройстве.') : t('Для запуска без интернета сначала откройте эту страницу с сетью и дождитесь подготовки офлайн-версии.');
    }
    function renderSync() {
        const info = syncPresentation(syncDetails), disabled = syncBusy ? 'disabled' : '';
        const c = syncDetails?.counts;
        const expanded = [...main.querySelectorAll('details')].filter(detail => detail.open).map(detail => detail.querySelector('summary')?.textContent);
        const failure = syncDetails?.failure;
        const diagnostic = failure ? [failure.status ? `HTTP ${failure.status}` : '', failure.code].filter(Boolean).join(' · ') : '';
        main.innerHTML = ui`<h1>Сохранение</h1><section class="mn-setting"><h2>${escape(info.title)}</h2><p>${escape(info.explanation)}</p>${diagnostic ? ui`<details class="mn-diagnostic"><summary>Код для поддержки</summary><p>${escape(diagnostic)}</p></details>` : ''}${c ? ui`<p>Задач: ${c.tasks} · выполнено: ${c.completed} · заметок: ${c.notes}</p>` : ''}<p>Сохранено на устройстве: ${escape(timestamp(syncDetails?.savedAt))}</p><p>Подтверждено в аккаунте: ${escape(timestamp(syncDetails?.syncedAt))}</p><p>${offlineReady ? t('Офлайн-запуск готов.') : t('Офлайн-запуск пока не подтверждён. Откройте страницу с интернетом и дождитесь подготовки.')}</p><button type="button" class="mn-primary" data-sync-now ${disabled}>${syncBusy ? t('Проверяем…') : t('Синхронизировать сейчас')}</button>${syncDetails?.phase === 'auth' ? reauthButton() : ''}${canExportNotebook ? ui`<button type="button" class="mn-secondary" data-export ${disabled}>Скачать копию записей</button>` : t('<p>Скачивание файла доступно в веб-версии. Резервные копии перед объединением сохраняются на этом устройстве.</p>')}${syncDetails?.backup && canExportNotebook ? ui`<button type="button" class="mn-secondary" data-export-recovery ${disabled}>Скачать копии до последнего объединения или замены</button>` : ''}</section>${syncDetails?.conflict ? ui`<section class="mn-setting"><h2>Две копии блокнота</h2><p>Сначала получите копию из аккаунта для сравнения. До вашего выбора обе копии останутся без изменений.</p><button type="button" class="mn-secondary" data-compare ${disabled}>Получить и сравнить копии</button></section>` : ''}${syncError ? `<p class="mn-sync-error" role="alert">${escape(t(syncError))}</p>` : ''}${syncPreview ? ui`<section class="mn-setting"><h2>Сравнение копий</h2><p>На устройстве: ${escape(counts(syncPreview.local))}</p><p>В аккаунте: ${escape(counts(syncPreview.cloud))}</p><p>Различающихся записей: ${syncPreview.differences.length}</p>${syncPreview.differences.map((d, i) => ui`<details class="mn-copy-difference"><summary>Различие ${i + 1}</summary><h3>На этом устройстве</h3>${previewRecord(d.local)}<h3>В аккаунте</h3>${previewRecord(d.cloud)}</details>`).join('')}<h3>Сохранить обе копии</h3><p>Сохраним все записи обеих копий, включая удалённые только на одном устройстве. Если одна запись различается, оставим две версии. У дополнительных копий напоминания выключены, чтобы они не дублировались.</p><button type="button" class="mn-primary" data-resolve="both" ${disabled}>Сохранить обе копии</button><details><summary>Использовать только копию из аккаунта</summary><p>Текущие записи заменятся копией из аккаунта. Перед заменой обе версии сохранятся в резервную копию на этом устройстве.</p><button type="button" class="mn-secondary" data-resolve="cloud" ${disabled}>Заменить этой копией из аккаунта</button></details><p>Если во время выбора одна из копий изменится, потребуется новое сравнение.</p></section>` : ''}`;
        main.querySelectorAll('details').forEach(detail => { if (expanded.includes(detail.querySelector('summary')?.textContent)) detail.open = true; });
    }
    function openSync() {
        clearSelection();
        if (editor) { back(); if (editor) return; }
        syncDetails = getSyncDetails(); view = 'sync'; syncPreview = null; syncError = ''; render();
    }
    async function runSync(action) {
        if (syncBusy) return;
        const id = account; syncBusy = true; syncError = ''; render();
        try { await action(); }
        catch (error) { if (id === account) syncError = error.message || t('Не удалось выполнить действие. Записи оставлены на устройстве.'); }
        finally { if (id === account) { syncBusy = false; syncDetails = getSyncDetails(); updateSyncNotice(); if (!editor) render(); } }
    }
    function open(id = null) {
        clearSelection();
        const previous = id ? find(id) : null;
        const draft = readDraft(id);
        if (id && !previous && !draft) { say(t('Эта запись больше недоступна.')); return; }
        orphanDraftId = id && !previous ? id : null;
        undo = null; say(''); editor = true; editingId = previous ? id : null; type = previous?.type || 'task';
        creating = !previous;
        const entry = draft && previous ? { ...previous.entry, ...draft, name: draft.text, title: draft.text, text: draft.details } : previous?.entry;
        const text = draft ? draft.text : entry ? previous.type === 'task' ? entry.name : entry.title || entry.text : draft?.text || '';
        const details = draft ? draft.details : entry ? previous.type === 'task' ? entry.details : entry.title ? entry.text : '' : draft?.details || '';
        const savedAnchor = entry?.deadlineAnchor || draft?.deadlineAnchor;
        deadlineAnchor = savedAnchor?.text === text && !Number.isNaN(new Date(savedAnchor.at).getTime())
            ? savedAnchor : { text, at: new Date().toISOString() };
        const reminder = normalizeReminder(entry?.reminder || draft?.reminder);
        type = draft?.type || previous?.type || 'task';
        dismissedDeadline = entry?.deadlineDismissed || draft?.deadlineDismissed || '';
        nav.hidden = true; add.hidden = true;
        main.innerHTML = ui`<div class="mn-editor-header"><button type="button" class="mn-back" data-back>← Назад</button><button type="button" class="mn-primary" data-save>Сохранить</button></div><h1>${previous ? t('Запись') : t('Новая запись')}</h1>${draft ? t('<p class="mn-draft-restored">Черновик восстановлен. Нажмите «Сохранить», когда закончите.</p>') : ''}<div class="mn-types">${[['task', t('Задача')], ['note', t('Заметка')]].map(([value, label]) => `<button type="button" data-type="${value}" aria-pressed="${type === value}">${label}</button>`).join('')}</div><p class="mn-type-help">${type === 'task' ? t('Можно отметить выполненной.') : t('Для мыслей и информации.')}</p><label for="mn-text">Что записать?</label><textarea class="mn-input mn-text" id="mn-text" name="text" dir="auto" placeholder="Запишите мысль или задачу">${escape(text)}</textarea><aside class="mn-suggestion" aria-label="Предложенный срок" aria-live="polite" hidden></aside><details class="mn-language-examples"><summary>Как указать срок словами</summary><p>Можно написать день недели или срок через число минут, часов, дней или недель. Проверьте предложенную дату перед применением.</p><ul>${[[t('Русский'), 'в пятницу в 18:00; через 2 часа'], ['English', 'Friday at 6 pm; in 2 hours'], ['Deutsch', 'Freitag um 18:00; in 2 Stunden'], ['Italiano', 'venerdì alle 18:00; tra 2 ore'], ['Español', 'viernes a las 18:00; en 2 horas'], ['Français', 'vendredi à 18:00; dans 2 heures'], ['Português', 'sexta-feira às 18:00; daqui a 2 horas'], ['中文', '星期五18:00; 2小时后'], ['日本語', '金曜日18:00; 2時間後'], ['한국어', '금요일 18:00; 2시간 후']].map(([language, sample]) => `<li><strong>${language}:</strong> ${sample}</li>`).join('')}</ul><p>«Следующая пятница» означает пятницу следующей недели. «Через 2 часа» отсчитывается от ввода фразы. Текст записи не сокращается и не переводится.</p></details><details ${details ? 'open' : ''}><summary>Подробности</summary><label for="mn-details">Дополнительный текст</label><textarea class="mn-input" id="mn-details" name="details" dir="auto">${escape(details)}</textarea></details><label class="mn-entry-pin"><input type="checkbox" name="pinned" ${(entry?.pinned ?? draft?.pinned) ? 'checked' : ''}><span>Закрепить сверху</span></label><label for="mn-date">Срок · необязательно</label><div class="mn-date-fields"><input class="mn-input" type="date" id="mn-date" name="date" value="${escape(entry?.date || draft?.date || '')}">${timeInput('time', entry?.time || draft?.time || '', t('Время срока'), getLanguage())}</div><div class="mn-filters"><button type="button" data-date="today">Сегодня</button><button type="button" data-date="tomorrow">Завтра</button><button type="button" data-date="none">Без срока</button></div><p class="mn-deadline-help"></p><label class="mn-pin"><input type="checkbox" name="today" ${(entry ? (entry.today ?? (previous?.project === 'today')) : draft?.today) ? 'checked' : ''}>Также показать в «Сегодня» без срока</label><section class="mn-reminder-form"><h2>Напоминание</h2><label for="mn-reminder-mode">Когда напомнить?</label><select class="mn-input" id="mn-reminder-mode" name="reminderMode">${REMINDER_OPTIONS.map(([value, label]) => `<option value="${value}" ${reminder.mode === value ? 'selected' : ''}>${t(label)}</option>`).join('')}</select><div class="mn-reminder-custom" hidden><label for="mn-reminder-date">Дата напоминания</label><div class="mn-date-fields"><input class="mn-input" type="date" id="mn-reminder-date" name="reminderDate" value="${escape(reminder.date)}">${timeInput('reminderTime', reminder.time, t('Время напоминания'), getLanguage())}</div></div><p class="mn-reminder-preview" aria-live="polite"></p><p class="mn-reminder-device"></p><button type="button" class="mn-secondary" data-enable-reminders>Включить напоминания на этом устройстве</button></section>${previous?.type === 'task' ? `<button type="button" class="mn-secondary" data-complete="${escape(id)}">${entry.checked ? t('Вернуть в активные') : t('Выполнить задачу')}</button>` : ''}${previous ? ui`<button type="button" class="mn-delete" data-delete="${escape(id)}">Удалить запись</button>` : ''}`;
        if (pickDate) for (const input of main.querySelectorAll('input[type="date"]')) {
            attachNativeDatePicker(input, { pickDate, getOwner: () => account });
        }
        updateDate();
        const draftNotice = main.querySelector('.mn-draft-restored');
        if (draftNotice && previous) {
            draftNotice.textContent = t('Незавершённые изменения восстановлены. Сохранённая запись остаётся в блокноте.');
            const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'mn-secondary'; restore.dataset.restoreSaved = ''; restore.textContent = t('Вернуть сохранённую запись'); draftNotice.after(restore);
        }
        savedEditorFingerprint = draft ? null : JSON.stringify(fields());
        if (!id && !draft) main.querySelector('[name="text"]').focus();
    }
    function updateDate() {
        const selectedDate = main.querySelector('[name="date"]').value;
        const hasDate = Boolean(selectedDate);
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        const preset = !hasDate ? 'none' : selectedDate === localDateString() ? 'today'
            : selectedDate === localDateString(tomorrow) ? 'tomorrow' : null;
        main.querySelectorAll('[data-date]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.date === preset));
        });
        main.querySelector('[name="time"]').disabled = !hasDate;
        const pin = main.querySelector('[name="today"]');
        pin.disabled = hasDate;
        if (hasDate) pin.checked = false;
        main.querySelector('.mn-pin').hidden = hasDate;
        main.querySelector('.mn-deadline-help').textContent = !hasDate
            ? t('Без срока запись остаётся во «Все записи». Галочка ниже также покажет её в «Сегодня».')
            : preset === 'today' ? t('Запись появится в «Сегодня» автоматически по выбранной дате.')
            : selectedDate < localDateString() ? t('Этот срок уже прошёл. Запись появится в «Сегодня» в разделе «Просрочено».')
            : t('Запись доступна во «Все записи» и появится в «Сегодня», когда наступит выбранная дата.');
        renderSuggestion();
        const mode = main.querySelector('[name="reminderMode"]');
        if (!hasDate && !['none', 'custom'].includes(mode.value)) mode.value = 'none';
        mode.querySelectorAll('option').forEach(option => { option.disabled = !hasDate && !['none', 'custom'].includes(option.value); });
        syncClockInputs(main);
        updateReminder();
    }
    function deviceReminderHelp() {
        if (reminderState.error) return t(reminderState.error);
        if (reminderState.native && reminderState.permission === 'denied') return t('Android не разрешает уведомления. Включите их в настройках телефона: Приложения → TO-DO Personal → Уведомления.');
        if (!reminderState.enabled) return t('На этом устройстве напоминания выключены. Включите их, чтобы получать напоминания по выбранному времени.');
        if (!reminderState.native) return t('В браузере напоминания появляются внутри блокнота, пока эта страница открыта. При закрытом браузере они не сработают.');
        return reminderState.exact ? t('Android-уведомления включены. Напоминания запланированы на этом устройстве и не требуют интернета.') : t('Android-уведомления включены, но телефон может задерживать их. Разрешите точное время в настройках напоминаний.');
    }
    function updateReminder() {
        if (!editor) return;
        syncClockInputs(main);
        const value = fields(), custom = value.reminder.mode === 'custom';
        main.querySelector('.mn-reminder-custom').hidden = !custom;
        const at = reminderMoment(value), helper = main.querySelector('.mn-reminder-preview');
        helper.textContent = value.reminder.mode === 'none' ? t('Для этой записи напоминание не придёт.') : !at
            ? t('Укажите дату и время напоминания.') : at <= new Date()
            ? t('Это время уже прошло — напоминание не сработает. Выберите будущее время.')
            : t(reminderLabel(value, new Date(), getLanguage(), clockHourCycle())) + (value.reminder.mode !== 'custom' && !value.time ? t(' · у срока нет времени, используем 09:00.') : '');
        const active = value.reminder.mode !== 'none';
        const device = main.querySelector('.mn-reminder-device');
        device.textContent = deviceReminderHelp();
        device.hidden = !active || (reminderState.native && reminderState.enabled && reminderState.exact && !reminderState.error);
        main.querySelector('[data-enable-reminders]').hidden = !active || reminderState.enabled;
    }
    function webPushSettings() {
        if (!configureWebPush) return '';
        return ui`<section class="mn-setting" data-web-push-setting><h2>Системные уведомления браузера</h2><p>${pushState.error ? escape(t(pushState.error)) : pushState.enabled ? t('Уведомления включены для этого аккаунта и браузера. Вкладку можно закрыть; нужен интернет и разрешённая фоновая работа браузера. Отправка проверяется раз в минуту.') : t('Получайте напоминания на компьютере при закрытой вкладке. Текст записи в уведомлении не показывается.')}</p><button type="button" class="mn-secondary" data-web-push-toggle ${pushBusy || !pushState.supported ? 'disabled' : ''}>${pushState.enabled ? t('Отключить системные уведомления') : t('Включить системные уведомления')}</button></section>`;
    }
    function reminderSettings() {
        return ui`<section class="mn-setting" data-reminder-setting><h2>Напоминания на этом устройстве</h2><p>${escape(deviceReminderHelp())}</p><button class="mn-secondary" type="button" data-toggle-reminders ${reminderBusy ? 'disabled' : ''}>${reminderState.enabled ? t('Выключить напоминания') : t('Включить напоминания')}</button>${reminderState.native && reminderState.enabled && !reminderState.exact ? t('<button type="button" class="mn-secondary" data-exact-reminders>Разрешить точное время</button>') : ''}<p>Напоминаний запланировано: ${reminderState.scheduled}. Выключение отменит уведомления здесь; время в записях сохранится.</p><button class="mn-secondary" type="button" data-reminder-list>Посмотреть записи с напоминаниями</button>${reminderState.error ? t('<button class="mn-secondary" type="button" data-retry-reminders>Повторить настройку</button>') : ''}</section>`;
    }
    function openReminder(record) {
        const target = record && find(record.entry.id);
        if (!target) return false;
        if (editor && editingId === target.entry.id) return true;
        if (editor) { back(); if (editor) return false; }
        reminderQueue = reminderQueue.filter(item => item.id !== target.entry.id);
        renderReminderBanner();
        open(target.entry.id);
        return true;
    }
    function renderReminderBanner() {
        reminderQueue = reminderQueue.filter(item => {
            const record = find(item.id);
            return record && reminderMoment(record.entry)?.toISOString() === item.at;
        });
        const next = reminderQueue[0], record = next && find(next.id);
        reminderBanner.hidden = !record;
        if (!record) { reminderBanner.replaceChildren(); return; }
        const text = record.type === 'task' ? record.entry.name : record.entry.title || record.entry.text;
        reminderBanner.innerHTML = ui`<h2>Время напоминания</h2><p dir="auto">${escape(text)}</p><div><button type="button" class="mn-secondary" data-reminder-open>Открыть</button><button type="button" class="mn-secondary" data-reminder-snooze>Отложить на 10 минут</button>${record.type === 'task' ? t('<button type="button" class="mn-primary" data-reminder-done>Выполнено</button>') : ''}<button type="button" class="mn-secondary" data-reminder-close>Закрыть</button></div>`;
    }
    function parseSuggestion() {
        const text = main.querySelector('[name="text"]').value;
        if (deadlineAnchor?.text !== text || Number.isNaN(new Date(deadlineAnchor?.at).getTime())) deadlineAnchor = { text, at: new Date().toISOString() };
        const choices = suggestDeadlineChoices(text, new Date(deadlineAnchor.at));
        const value = choices.length ? { ...choices[0], alternatives: choices } : null;
        if (value) {
            const current = new Date();
            const clock = `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`;
            value.past = value.date < localDateString(current) || Boolean(value.date === localDateString(current) && value.time && value.time < clock);
        }
        return value;
    }
    function renderSuggestion() {
        const area = main.querySelector('.mn-suggestion');
        if (!area) return;
        suggestion = smartDates ? parseSuggestion() : null;
        const current = fields();
        const alreadySet = suggestion?.alternatives.some(choice => current.date === choice.date && current.time === choice.time);
        area.hidden = !suggestion || alreadySet || suggestionKey(suggestion) === dismissedDeadline;
        if (area.hidden) { area.replaceChildren(); return; }
        if (suggestion.alternatives?.length > 1) {
            area.innerHTML = ui`<p class="mn-suggestion-title">Уточните дату или время</p><p>Эту фразу можно понять по-разному. Выберите подходящий вариант.</p>${suggestion.alternatives.map((choice, index) => {
                const label = new Intl.DateTimeFormat(getLanguage(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(choice.date + 'T12:00:00'));
                const at = new Date(choice.date + 'T' + (choice.time || '09:00'));
                return `<section class="mn-date-choice"><strong>${escape(label)}${choice.time ? ' · ' + escape(formatClock(choice.time, getLanguage())) : ''}</strong><div class="mn-suggestion-actions"><button type="button" class="mn-primary" data-accept-deadline data-choice-index="${index}">${t('Только срок')}</button><button type="button" class="mn-secondary" data-accept-reminder data-choice-index="${index}" ${at <= new Date() ? 'disabled' : ''}>${t('Срок и напоминание')}</button></div></section>`;
            }).join('')}<button type="button" class="mn-secondary" data-dismiss-deadline>Не нужно</button>`;
            return;
        }
        const label = new Intl.DateTimeFormat(getLanguage(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(suggestion.date + 'T12:00:00'));
        const at = new Date(suggestion.date + 'T' + (suggestion.time || '09:00'));
        const interpretation = { relative: t('Отсчитываем от момента ввода этой фразы. '), weekday: t('Предлагаем ближайший подходящий день недели. '), 'next-week': t('Под «следующим» понимаем день следующей недели, которая начинается с понедельника. '), 'this-week': t('Предлагаем день текущей недели, которая начинается с понедельника. ') }[suggestion.interpretation] || '';
        area.innerHTML = ui`<p class="mn-suggestion-title">Срок из текста: <strong>${escape(label)}${suggestion.time ? ` · ${escape(formatClock(suggestion.time, getLanguage()))}` : ''}</strong></p><p>${escape(interpretation)}${suggestion.roundedToMinute ? t('Время округлено до минуты вверх. ') : ''}${suggestion.inferredDate ? t('Указано только время — предлагаем ближайшую дату. ') : ''}${suggestion.past ? t('Этот срок уже прошёл. ') : ''}Текст записи сохранится целиком. ${current.date ? t('Применение заменит выбранный срок.') : t('Срок изменится только после подтверждения.')}</p><div class="mn-suggestion-actions"><button type="button" class="mn-primary" data-accept-deadline>Только срок</button><button type="button" class="mn-primary" data-accept-reminder ${at <= new Date() ? 'disabled' : ''}>${suggestion.time ? t('Срок и напоминание') : t('Срок и напомнить в 09:00')}</button><button type="button" class="mn-secondary" data-dismiss-deadline>Не нужно</button></div><p>${at <= new Date() ? t('Для напоминания выберите будущее время ниже в форме.') : reminderState.enabled ? t('Напомним в выбранный срок. Уже выбранное напоминание заменится.') : t('Второе действие также включит напоминания на этом устройстве. В Android потребуется разрешение на уведомления.')}</p>`;
    }
    function commit(close = true) {
        const value = fields();
        if (!value.text.trim()) { if (close) { say(t('Напишите текст записи.')); main.querySelector('[name="text"]').focus(); } return false; }
        if (close && value.reminder.mode !== 'none' && !reminderMoment({ ...value, checked: false })) { say(t('Укажите дату и время напоминания или выберите «Не напоминать».')); main.querySelector('[name="reminderMode"]').focus(); return false; }
        const previous = editingId ? find(editingId) : null;
        if (editingId && !previous) { say(t('Запись удалена на другом устройстве. Скопируйте текст перед выходом.')); return false; }
        // Merely viewing a record must not create an upload or a cloud conflict.
        // Retry real persistence when the local copy has not been saved safely.
        if (previous && JSON.stringify(value) === savedEditorFingerprint && getSyncDetails()?.localSaved !== false) {
            if (close) { editor = false; render(); say(t('Запись сохранена.')); }
            return true;
        }
        const before = JSON.parse(JSON.stringify({ todos, notes }));
        const nextId = saveEntry(todos, notes, value, previous);
        const locallySaved = persist();
        if (locallySaved === false) {
            Object.keys(todos).forEach(key => delete todos[key]); Object.assign(todos, before.todos);
            notes.splice(0, notes.length, ...before.notes);
            persist();
            say(t('Не удалось сохранить запись на устройстве. Не закрывайте приложение.')); return false;
        }
        editingId = nextId;
        savedEditorFingerprint = JSON.stringify(value); draftSafe = true;
        if (!creating || close) { try { localStorage.removeItem(draftKey(creating ? null : editingId)); } catch (_) { /* The safe draft remains recoverable. */ } }
        if (close) {
            editor = false; render(); say(value.date > localDateString() && view === 'today' ? t('Запись сохранена. Она доступна во «Все записи».') : t('Запись сохранена.'));
        }
        return true;
    }
    function back() {
        if (editingId) {
            if (!fields().text.trim()) { stashDraft(); if (!draftSafe) return; }
            else if (!commit(false)) return;
        }
        else { stashDraft(); if (!draftSafe) return; }
        editor = false; render();
    }
    function changed() { stashDraft(); if (editingId) commit(false); }
    shell.addEventListener('datepickererror', () => say(t('Не удалось открыть календарь. Попробуйте снова.')));
    shell.addEventListener('click', event => {
        const button = event.target.closest('button'); if (!button || button.disabled || deletionBusy || reauthBusy) return;
        if (button.hasAttribute('data-web-push-toggle')) {
            if (pushBusy) return;
            pushBusy = true; button.disabled = true;
            Promise.resolve(configureWebPush?.(!pushState.enabled)).catch(() => say(t('Не удалось изменить настройку системных уведомлений.'))).finally(() => { pushBusy = false; if (view === 'settings') render(); });
            return;
        }
        if (button.hasAttribute('data-clock-open')) { Promise.resolve(pickTime(button.closest('[data-clock]'))).catch(() => say(t('Не удалось открыть выбор времени. Попробуйте снова.'))); return; }
        if (button.hasAttribute('data-continue-draft')) open(button.dataset.continueDraft || null);
        else if (button.hasAttribute('data-restore-saved')) {
            const id = editingId;
            try { localStorage.removeItem(draftKey(id)); }
            catch (_) { say(t('Не удалось удалить черновик. Он сохранён на устройстве.')); return; }
            open(id);
        }
        else if (button.hasAttribute('data-discard-draft')) {
            const owner = account, key = draftKey(button.dataset.discardDraft || null);
            try {
                const previous = localStorage.getItem(key);
                localStorage.removeItem(key); renderDraft();
                offerUndo(t('Черновик удалён.'), () => {
                    if (owner !== account || localStorage.getItem(key) !== null) return false;
                    try { if (previous) localStorage.setItem(key, previous); return true; } catch (_) { return false; }
                });
            } catch (_) { say(t('Не удалось удалить черновик. Он сохранён на устройстве.')); }
        }
        else if (button.hasAttribute('data-selection-toggle')) { pendingRemoval = null; selecting = !selecting; selected.clear(); render(); }
        else if (button.hasAttribute('data-select')) { pendingRemoval = null; const id = button.dataset.select; if (selected.has(id)) selected.delete(id); else selected.add(id); renderList(); }
        else if (button.hasAttribute('data-select-visible')) { pendingRemoval = null; const found = visibleEntries(); selected = selected.size === found.length ? new Set() : new Set(found.map(r => r.entry.id)); renderList(); }
        else if (button.hasAttribute('data-cancel-removal')) { pendingRemoval = null; renderBulk(visibleEntries()); }
        else if (button.hasAttribute('data-confirm-removal')) deleteSelection();
        else if (button.hasAttribute('data-bulk')) bulkAction(button.dataset.bulk);
        else if (button.hasAttribute('data-reset-filters')) { query = ''; filter = 'all'; dueFilter = 'all'; selected.clear(); render(); }
        else if (button.hasAttribute('data-sync-open')) openSync();
        else if (button.hasAttribute('data-sync-now')) runSync(() => syncNow?.());
        else if (button.hasAttribute('data-compare')) runSync(async () => { const id = account, result = await inspectConflict?.(); if (id === account && view === 'sync') syncPreview = result; });
        else if (button.hasAttribute('data-resolve')) runSync(async () => { const id = account; await resolveConflict?.(button.dataset.resolve); if (id === account) { syncPreview = null; say(t('Выбранная копия сохранена. Резервная копия доступна на экране сохранения.')); } });
        else if (button.hasAttribute('data-export') || button.hasAttribute('data-export-recovery')) runSync(() => exportNotebook?.(button.hasAttribute('data-export-recovery')));
        else if (button.hasAttribute('data-reminder-open')) {
            const record = find(reminderQueue[0]?.id); if (!record) return;
            openReminder(record);
        } else if (button.hasAttribute('data-reminder-close') || button.hasAttribute('data-reminder-snooze') || button.hasAttribute('data-reminder-done')) {
            const record = find(reminderQueue[0]?.id); if (!record) return;
            if (editor) { back(); if (editor) return; }
            const handled = reminderQueue[0];
            if (!button.hasAttribute('data-reminder-close')) {
                const before = JSON.parse(JSON.stringify(record.entry));
                if (button.hasAttribute('data-reminder-snooze')) snoozeReminder(record.entry);
                else toggleEntry(record);
                const after = JSON.parse(JSON.stringify(record.entry));
                Object.keys(record.entry).forEach(key => delete record.entry[key]); Object.assign(record.entry, before);
                const changes = [{ id: before.id, type: record.type, project: record.project, before, after }];
                if (!saveChanges(changes)) { actionFailed(); return; }
                say(button.hasAttribute('data-reminder-snooze') ? t('Напоминание отложено на 10 минут. Срок записи сохранён.') : t('Задача выполнена. Её напоминание отменено.'));
            }
            reminderQueue = reminderQueue.filter(item => item !== handled);
            render();
        } else if (button.hasAttribute('data-toggle-reminders') || button.hasAttribute('data-enable-reminders')) {
            if (reminderBusy) return;
            reminderBusy = true; button.disabled = true;
            Promise.resolve(configureReminders?.(button.hasAttribute('data-enable-reminders') || !reminderState.enabled))
                .catch(() => say(t('Не удалось включить напоминания. Повторите попытку.')))
                .finally(() => { reminderBusy = false; if (editor) { button.disabled = false; updateReminder(); } else render(); });
        } else if (button.hasAttribute('data-exact-reminders')) {
            Promise.resolve(enableExactReminders?.()).catch(() => say(t('Не удалось открыть настройки точного времени.')));
        } else if (button.hasAttribute('data-retry-reminders')) {
            refreshReminders?.();
        } else if (button.hasAttribute('data-reminder-list')) { view = 'all'; filter = 'reminder'; query = ''; render(); }
        else if (button.hasAttribute('data-view')) { clearSelection(); view = button.dataset.view; query = ''; filter = 'all'; dueFilter = 'all'; undo = null; say(''); render(); }
        else if (button === add) open();
        else if (button.hasAttribute('data-open')) { clearSelection(); open(button.dataset.open); }
        else if (button.hasAttribute('data-back')) back();
        else if (button.hasAttribute('data-save')) commit();
        else if (button.hasAttribute('data-filter')) { filter = button.dataset.filter; selected.clear(); render(); }
        else if (button.hasAttribute('data-type')) { type = button.dataset.type; main.querySelector('.mn-type-help').textContent = (type === 'task' ? t('Можно отметить выполненной.') : t('Для мыслей и информации.')); main.querySelectorAll('[data-type]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.type === type))); const complete = main.querySelector('[data-complete]'); if (complete) complete.hidden = type !== 'task'; changed(); }
        else if (button.hasAttribute('data-date')) {
            dismissedDeadline = suggestionKey(parseSuggestion());
            const date = new Date(); if (button.dataset.date === 'tomorrow') date.setDate(date.getDate() + 1);
            main.querySelector('[name="date"]').value = button.dataset.date === 'none' ? '' : localDateString(date);
            if (button.dataset.date === 'none') main.querySelector('[name="time"]').value = '';
            updateDate(); changed();
        } else if ((button.hasAttribute('data-accept-deadline') || button.hasAttribute('data-accept-reminder')) && suggestion) {
            const choice = suggestion.alternatives?.[Number(button.dataset.choiceIndex || 0)] || suggestion;
            main.querySelector('[name="date"]').value = choice.date;
            const withReminder = button.hasAttribute('data-accept-reminder');
            main.querySelector('[name="time"]').value = choice.time || (withReminder ? '09:00' : '');
            if (withReminder) main.querySelector('[name="reminderMode"]').value = 'at';
            dismissedDeadline = suggestionKey(suggestion);
            updateDate(); changed();
            if (withReminder) {
                say(t('Срок и напоминание выбраны. Сохраните запись.'));
                if (!reminderState.enabled) Promise.resolve(configureReminders?.(true))
                    .then(enabled => { if (enabled === false) say(t('Срок выбран. Разрешите уведомления на устройстве, чтобы напоминание сработало.')); })
                    .catch(() => say(t('Срок выбран, но включить напоминания не удалось. Повторите включение ниже в форме.')));
            }
        } else if (button.hasAttribute('data-dismiss-deadline')) {
            dismissedDeadline = suggestionKey(suggestion);
            renderSuggestion(); changed();
        } else if (button.hasAttribute('data-check') || button.hasAttribute('data-complete')) {
            const record = find(button.dataset.check || button.dataset.complete); if (!record || record.type !== 'task') return;
            const changes = prepareListAction(records(), [record.entry.id], record.entry.checked ? 'restore' : 'complete');
            if (!saveChanges(changes)) { actionFailed(); return; }
            editor = false; render();
            offerUndo(record.entry.checked ? t('Задача выполнена.') : t('Задача возвращена в активные.'), () => saveChanges(changes, true));
        } else if (button.hasAttribute('data-delete')) {
            const record = find(button.dataset.delete); if (!record) return;
            const changes = prepareRemoval({ todos, notes }, [record.entry.id]);
            if (!applyRemoval({ todos, notes }, changes)) return;
            if (persist() === false) { applyRemoval({ todos, notes }, changes, true); persist(); actionFailed(); return; }
            try { localStorage.removeItem(draftKey(record.entry.id)); } catch (_) {}
            editor = false; render(); offerUndo(t('Запись удалена.'), () => {
                if (!applyRemoval({ todos, notes }, changes, true)) return false;
                if (persist() !== false) return true;
                applyRemoval({ todos, notes }, changes); persist(); return false;
            });
        } else if (button.hasAttribute('data-undo') && undo) { const restored = undo(); undo = null; render(); say(restored === false ? t('Не удалось отменить: записи изменились или сохранение недоступно. Текущие записи не заменены предыдущей версией.') : t('Действие отменено.')); }
        else if (button.hasAttribute('data-delete-account')) { deletionError = ''; view = 'delete-account'; render(); }
        else if (button.hasAttribute('data-cancel-account-deletion')) { view = 'settings'; deletionError = ''; render(); }
        else if (button.hasAttribute('data-confirm-account-deletion')) { confirmAccountDeletion(); }
        else if (button.hasAttribute('data-reauthenticate')) { if (editor) { back(); if (editor) return; } reauthError = ''; reauthMessage = ''; view = 'reauthenticate'; render(); }
        else if (button.hasAttribute('data-reauth-google')) runReauthenticationAction(reauthenticateGoogle, t('Завершите вход в окне Google. Если закрыли его, можно попробовать снова.'));
        else if (button.hasAttribute('data-reauth-recovery')) runReauthenticationAction(recoverPassword, t('Письмо для сброса пароля отправлено на почту этого аккаунта. Задайте новый пароль по ссылке, затем вернитесь и войдите.'));
        else if (button.hasAttribute('data-cancel-reauth') && !reauthBusy) { view = 'settings'; reauthError = ''; render(); }
        else if (button.hasAttribute('data-logout')) { logout(); }
    });
    async function runReauthenticationAction(action, success) {
        if (!action || reauthBusy) return;
        const owner = account, operation = ++reauthOperation;
        const current = () => owner === account && operation === reauthOperation;
        reauthBusy = true; reauthError = ''; reauthMessage = ''; render();
        try { await action(); if (current() && view === 'reauthenticate') reauthMessage = success; }
        catch (error) { if (current()) reauthError = error.message || t('Не удалось войти. Проверьте пароль и соединение.'); }
        finally { if (current()) { reauthBusy = false; render(); } }
    }
    shell.addEventListener('submit', async event => {
        if (event.target.matches('[data-native-reset-form]')) {
            event.preventDefault(); if (reauthBusy || !resetPassword) return;
            const owner = account, password = main.querySelector('#mn-new-password').value, repeat = main.querySelector('#mn-repeat-password').value;
            const operation = ++reauthOperation;
            const current = () => owner === account && operation === reauthOperation;
            reauthBusy = true; reauthError = ''; render();
            try { await resetPassword(password, repeat); if (current()) { view = 'reauthenticate'; reauthMessage = t('Пароль изменён. Войдите с новым паролем. Локальные записи сохранены.'); } }
            catch (error) { if (current()) reauthError = error.message; }
            finally { if (current()) { reauthBusy = false; render(); } }
            return;
        }
        if (!event.target.matches('[data-reauth-form]')) return;
        event.preventDefault(); if (reauthBusy || !reauthenticate) return;
        let password = main.querySelector('#mn-reauth-password').value;
        const owner = account, operation = ++reauthOperation;
        const current = () => owner === account && operation === reauthOperation;
        reauthBusy = true; reauthError = ''; render();
        try { await reauthenticate(password); if (current()) { view = 'settings'; say(t('Вход обновлён. Локальные изменения сохранены.')); } }
        catch (error) { if (current()) reauthError = error.message || t('Не удалось войти. Проверьте пароль и соединение.'); }
        finally { password = ''; if (current()) { reauthBusy = false; render(); } }
    });
    shell.addEventListener('input', event => {
        if (event.target.id === 'mn-search') { pendingRemoval = null; query = event.target.value; selected.clear(); renderList(); }
        else if (editor) {
            const target = readClockInput(event.target);
            if (['date', 'time'].includes(target.name)) {
                dismissedDeadline = suggestionKey(parseSuggestion());
                updateDate();
            } else if (target.name === 'text') renderSuggestion();
            else if (['reminderMode', 'reminderDate', 'reminderTime'].includes(target.name)) updateReminder();
            changed();
        }
    });
    shell.addEventListener('change', event => {
        if (event.target.matches('[data-time-format]')) { if (!setTimePreference(event.target.value)) say(t('Не удалось сохранить настройку на устройстве.')); render(); return; }
        if (event.target.matches('[data-language]')) { changeLanguage(event.target.value); render(); return; }
        if (event.target.hasAttribute('data-due-filter')) { pendingRemoval = null; dueFilter = event.target.value; selected.clear(); render(); }
        else if (event.target.hasAttribute('data-list-sort')) {
            const previous = listSort; listSort = ['oldest', 'newest', 'updated', 'deadline'].includes(event.target.value) ? event.target.value : 'oldest';
            try { localStorage.setItem(preferencesKey(), JSON.stringify({ smartDates, listSort })); }
            catch (_) { listSort = previous; say(t('Не удалось сохранить порядок записей на устройстве.')); }
            render();
        } else if (event.target.hasAttribute('data-smart-dates')) {
            try {
                localStorage.setItem(preferencesKey(), JSON.stringify({ smartDates: event.target.checked, listSort }));
                smartDates = event.target.checked;
                say(smartDates ? t('Подсказки сроков включены.') : t('Подсказки сроков выключены. Уже выбранные сроки сохранены.'));
            } catch (_) { event.target.checked = smartDates; say(t('Не удалось сохранить настройку на устройстве.')); }
        } else if (editor) {
            const target = readClockInput(event.target);
            if (['date', 'time'].includes(target.name)) {
                dismissedDeadline = suggestionKey(parseSuggestion());
                updateDate();
            } else if (['reminderMode', 'reminderDate', 'reminderTime'].includes(target.name)) updateReminder();
            // Text input already updated the suggestion. Replacing its buttons
            // on blur would remove the pressed button before its click arrives.
            changed();
        }
    });
    window.addEventListener('beforeunload', event => {
        if (editor) stashDraft();
        if (!draftSafe) { event.preventDefault(); event.returnValue = ''; }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && editor) stashDraft(); });
    return {
        render,
        showMessage: say,
        openReminder,
        notifyReminder(record) {
            if (!record) reminderQueue = [];
            else {
                const at = reminderMoment(record.entry)?.toISOString();
                if (at && !reminderQueue.some(item => item.id === record.entry.id && item.at === at)) reminderQueue.push({ id: record.entry.id, at });
            }
            renderReminderBanner();
        },
        setPushStatus(value) {
            pushState = value;
            if (view === 'settings' && !editor) { const section = main.querySelector('[data-web-push-setting]'); if (section) section.outerHTML = webPushSettings(); }
        },
        setReminderStatus(value) {
            if (JSON.stringify(reminderState) === JSON.stringify(value)) return;
            reminderState = value;
            if (editor) updateReminder();
            else if (view === 'settings') {
                const section = main.querySelector('[data-reminder-setting]');
                if (section) section.outerHTML = reminderSettings();
            } else if (!['sync', 'delete-account', 'reauthenticate'].includes(view)) render();
        },
        saveDraft: stashDraft,
        back() {
            if (deletionBusy) return true;
            if (['reauthenticate', 'reset-password'].includes(view)) { if (!reauthBusy) { view = 'settings'; render(); } return true; }
            if (view === 'delete-account') { view = 'settings'; deletionError = ''; render(); return true; }
            if (editor) { back(); return true; }
            if (selecting) { clearSelection(); render(); return true; }
            if (view !== 'today' || query) { view = 'today'; query = ''; filter = 'all'; undo = null; say(''); render(); return true; }
            return false;
        },
        isEditing: () => editor || selecting || Boolean(undo) || ['delete-account', 'reauthenticate', 'reset-password'].includes(view),
        openPasswordRecovery() {
            // Preserve every editor field, including an empty title, before replacing its DOM.
            // If storage refuses the draft, leave the editor and its text on screen.
            if (editor) { stashDraft(); if (!draftSafe) return false; editor = false; }
            reauthOperation++;
            clearSelection(); reauthBusy = false; reauthError = ''; reauthMessage = ''; view = 'reset-password'; render(); return true;
        },
        completeReauthentication(error = '') {
            if (view === 'reset-password') { if (!reauthBusy && error) { reauthError = error; render(); } return; }
            reauthOperation++;
            reauthBusy = false; reauthError = error; reauthMessage = '';
            if (!error && view === 'reauthenticate') view = 'settings';
            render(); if (!error) say(t('Вход обновлён. Локальные изменения сохранены.')); else if (view !== 'reauthenticate') say(error);
        },
        setAccount(id) { if (account !== id) { reauthOperation++; orphanDraftId = null; clearTimeout(undoTimer); deletionBusy = false; deletionError = ''; reauthBusy = false; reauthError = ''; savedEditorFingerprint = null; account = id; clearSelection(); dueFilter = 'all'; reminderQueue = []; syncDetails = null; syncBusy = false; syncPreview = null; syncError = ''; updateSyncNotice(); readPreferences(); dismissedDeadline = ''; suggestion = null; deadlineAnchor = null; editor = false; editingId = null; view = 'today'; query = ''; filter = 'all'; undo = null; draftSafe = true; say(''); render(); } },
        setOfflineReady(value) {
            offlineReady = value;
            if (!editor && view === 'settings') refreshSettingsStatus();
            else if (!editor && view === 'sync') renderSync();
        },
        setStatus(text, details) {
            syncDetails = details || getSyncDetails();
            statusText = syncPresentation(syncDetails).title;
            updateSyncNotice();
            if (!editor && view === 'settings') refreshSettingsStatus();
            else if (!editor && view === 'sync') renderSync();
        }
    };
}
