import { browseEntries, prepareListAction, applyListChanges } from './listActions.js';
import { createEntryId } from './localNotebook.js';
import { syncPresentation, notebookSummary } from './syncModel.js';
import { suggestDeadline } from './deadlineParser.js';
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
    const common = { ...(previous?.entry || {}), id, date: fields.date || '', time: fields.date ? fields.time || '' : '', today: !fields.date && Boolean(fields.today), deadlineDismissed: fields.deadlineDismissed || '', deadlineAnchor: fields.deadlineAnchor || previous?.entry.deadlineAnchor || null, updatedAt: stamp };
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

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function createMobileNotebook({ root, todos, notes, persist, logout, getAccount, configureReminders, enableExactReminders, refreshReminders, getSyncDetails = () => null, syncNow, inspectConflict, resolveConflict, exportNotebook, canExportNotebook = true }) {
    const shell = document.createElement('section');
    shell.className = 'mobile-notebook';
    shell.setAttribute('aria-label', 'Мобильный блокнот');
    shell.innerHTML = `<header class="mn-header"><span class="mn-logo">// TO-DO</span><button type="button" class="mn-status" data-sync-open aria-label="Открыть состояние сохранения"></button></header><main class="mn-main"></main><div class="mn-message" role="status" aria-live="polite"></div><button class="mn-add" type="button" aria-label="Создать запись">+</button><nav class="mn-nav" aria-label="Разделы блокнота"><button data-view="today" type="button">Сегодня</button><button data-view="all" type="button">Все записи</button><button data-view="done" type="button">Выполнено</button><button data-view="settings" type="button">Настройки</button></nav>`;
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
    let dueFilter = 'all', listSort = 'deadline', selecting = false, selected = new Set();
    const records = () => listEntries(todos, notes);
    const find = id => records().find(record => record.entry.id === id);
    const draftKey = () => `todo-personal:entry-draft:${account}`;
    const preferencesKey = () => `todo-personal:preferences:${account}`;
    let smartDates = true, dismissedDeadline = '', suggestion = null, deadlineAnchor = null;
    let syncDetails = null, syncBusy = false, syncPreview = null, syncError = '', offlineReady = false;
    let reminderState = { native: false, enabled: false, permission: 'unknown', exact: false, scheduled: 0, error: '' }, reminderQueue = [], reminderBusy = false;
    const suggestionKey = value => value ? `${value.date}|${value.time}` : '';
    function readPreferences() {
        try { const prefs = JSON.parse(localStorage.getItem(preferencesKey())); smartDates = prefs?.smartDates !== false; listSort = prefs?.listSort === 'updated' ? 'updated' : 'deadline'; }
        catch (_) { smartDates = true; listSort = 'deadline'; }
    }
    const say = text => { message.textContent = text; };
    function offerUndo(text, action) {
        clearTimeout(undoTimer);
        undo = action;
        message.innerHTML = `${text} <button type="button" data-undo>Отменить</button>`;
        undoTimer = setTimeout(() => { if (undo === action) { undo = null; say(''); } }, 8000);
    }
    function fields() {
        return { type, text: main.querySelector('[name="text"]').value, details: main.querySelector('[name="details"]').value, date: main.querySelector('[name="date"]').value, time: main.querySelector('[name="time"]').value, today: main.querySelector('[name="today"]').checked, deadlineDismissed: dismissedDeadline, deadlineAnchor,
            reminder: normalizeReminder({ mode: main.querySelector('[name="reminderMode"]').value, date: main.querySelector('[name="reminderDate"]').value, time: main.querySelector('[name="reminderTime"]').value }) };
    }
    function stashDraft() {
        if (!editor || editingId || !account) return;
        try {
            const value = fields();
            if (value.text.trim() || value.details.trim()) localStorage.setItem(draftKey(), JSON.stringify(value));
            else localStorage.removeItem(draftKey());
            draftSafe = true;
        } catch (_) { draftSafe = false; say('Не удалось сохранить черновик. Не закрывайте приложение.'); }
    }
    function card({ entry, type: kind, project }) {
        const text = kind === 'task' ? entry.name : entry.title || entry.text;
        const details = kind === 'task' ? entry.details : entry.title ? entry.text : '';
        const labels = selecting ? [kind === 'task' ? 'Задача' : 'Заметка'] : [];
        const dueDate = entry.date ? new Date(entry.date + 'T12:00:00') : null;
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        if (dueDate && !Number.isNaN(dueDate.getTime())) labels.push(entry.date === localDateString() ? 'Сегодня' : entry.date === localDateString(tomorrow) ? 'Завтра' : new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', year: dueDate.getFullYear() !== tomorrow.getFullYear() ? 'numeric' : undefined }).format(dueDate));
        if (!entry.checked && entry.date && entry.date < localDateString()) labels.push('Просрочено');
        if (entry.time) labels.push(entry.time);
        if (!entry.date) labels.push('Без срока');
        if (!entry.date && (entry.today || (entry.today === undefined && project === 'today'))) labels.push('В Сегодня');
        const reminder = reminderLabel(entry);
        if (reminder) labels.push(reminder + (reminderState.enabled ? '' : ' · на этом устройстве выключено'));
        if (entry.conflictCopy) labels.push('Копия с устройства');
        if (project && !['home', 'today', 'week'].includes(project)) labels.push(project);
        return `<article class="mn-card ${entry.checked ? 'mn-completed' : ''}">${selecting ? `<button class="mn-select" type="button" data-select="${escape(entry.id)}" aria-pressed="${selected.has(entry.id)}" aria-label="Выбрать: ${escape(text)}">${selected.has(entry.id) ? '✓' : '○'}</button>` : kind === 'task' ? `<button class="mn-check" type="button" data-check="${escape(entry.id)}" aria-label="${entry.checked ? 'Вернуть в активные' : 'Выполнить'}: ${escape(text)}">${entry.checked ? '✓' : '○'}</button>` : '<span class="mn-note-label">Заметка</span>'}<button class="mn-open" type="button" data-open="${escape(entry.id)}"><span class="mn-title" dir="auto">${escape(text)}</span>${details ? `<span class="mn-details" dir="auto">${escape(details)}</span>` : ''}<span class="mn-meta">${escape(labels.join(' · '))}</span></button></article>`;
    }
    function group(label, list) { return list.length ? `<section><h2 class="mn-group">${label}</h2>${list.map(card).join('')}</section>` : ''; }
    function renderList() {
        const found = visibleEntries();
        for (const id of selected) if (!found.some(r => r.entry.id === id)) selected.delete(id);
        renderBulk(found);
        let html;
        if (view === 'today') {
            const groups = todayGroups(found);
            html = group('Просрочено', groups.overdue) + group('Сегодня', groups.today) + group('Без срока · добавлено в Сегодня', groups.pinned);
        } else {
            html = found.map(card).join('');
        }
        main.querySelector('.mn-list').innerHTML = html || `<p class="mn-empty">${query || filter !== 'all' || dueFilter !== 'all' ? 'По выбранным условиям ничего не найдено. Измените поиск или сбросьте фильтры.' : view === 'today' ? 'На сегодня ничего не запланировано.' : view === 'done' ? 'Здесь появятся выполненные задачи.' : 'Записей пока нет. Нажмите +, чтобы создать первую.'}</p>`;
    }
    function render() {
        renderReminderBanner();
        if (editor) return;
        nav.hidden = false; add.hidden = selecting || ['settings', 'sync'].includes(view);
        nav.querySelectorAll('button').forEach(button => { if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
        if (view === 'sync') { renderSync(); return; }
        if (view === 'settings') {
            main.innerHTML = `<h1>Настройки</h1><section class="mn-setting"><h2>Аккаунт</h2><p>${escape(getAccount() || '')}</p><button class="mn-secondary" type="button" data-logout>Выйти</button></section>${reminderSettings()}<section class="mn-setting"><h2>Подсказки сроков</h2><label class="mn-pin"><input type="checkbox" data-smart-dates ${smartDates ? 'checked' : ''}>Предлагать дату и время из текста</label><p>Работают на устройстве. Срок применяется только с вашего подтверждения. Настройка сохраняется для этого аккаунта в этом браузере или приложении.</p><p>Поддерживаются основные выражения на русском, английском, немецком, итальянском, испанском, китайском, японском, французском, португальском и корейском. Например: «завтра в 18:00» или «tomorrow at 6 pm». Подсказка заполняет срок. Напоминание выбирается отдельно в записи.</p></section>${syncSettings()}`;
            return;
        }
        main.innerHTML = `<h1>${{ today: 'Сегодня', all: 'Все записи', done: 'Выполнено' }[view]}</h1><p class="mn-date">${new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p><label class="mn-search-label" for="mn-search">Поиск</label><input id="mn-search" class="mn-input" type="search" placeholder="Найти запись" value="${escape(query)}">${view === 'all' ? `<div class="mn-filters">${[['all', 'Все'], ['task', 'Задачи'], ['note', 'Заметки'], ['reminder', 'С напоминанием']].map(([value, label]) => `<button type="button" data-filter="${value}" aria-pressed="${filter === value}">${label}</button>`).join('')}</div>` : ''}${listControls()}<div class="mn-bulk"></div><div class="mn-list"></div>`;
        renderList();
    }
    function visibleEntries() { return browseEntries(records(), { view, filter, due: dueFilter, query, sort: listSort }); }
    function listControls() {
        return `${view === 'all' ? `<details class="mn-list-options" ${dueFilter !== 'all' ? 'open' : ''}><summary>Срок и порядок записей${dueFilter !== 'all' ? ' · фильтр включён' : ''}</summary><div class="mn-list-selects"><label>Срок<select class="mn-input" data-due-filter>${[['all', 'Любой срок'], ['overdue', 'Просрочено'], ['today', 'Сегодня'], ['tomorrow', 'Завтра'], ['none', 'Без срока']].map(([key, label]) => `<option value="${key}" ${dueFilter === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Порядок<select class="mn-input" data-list-sort>${[['deadline', 'Сначала ближайший срок'], ['updated', 'Сначала недавно изменённые']].map(([key, label]) => `<option value="${key}" ${listSort === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div></details>` : ''}<div class="mn-list-tools"><button type="button" class="mn-secondary" data-selection-toggle>${selecting ? 'Завершить выбор' : 'Выбрать несколько'}</button><button type="button" class="mn-secondary" data-reset-filters ${query || filter !== 'all' || dueFilter !== 'all' ? '' : 'hidden'}>Сбросить фильтры</button></div>`;
    }
    function renderBulk(found) {
        const area = main.querySelector('.mn-bulk'); if (!area) return;
        area.classList.toggle('mn-bulk-selecting', selecting);
        const reset = main.querySelector('[data-reset-filters]'); if (reset) reset.hidden = !query && filter === 'all' && dueFilter === 'all';
        if (!selecting) { area.innerHTML = `<p class="mn-result-count">Записей: ${found.length}</p>`; return; }
        const tasks = found.filter(r => selected.has(r.entry.id) && r.type === 'task').length;
        area.innerHTML = `<section class="mn-bulk-panel" aria-label="Действия с выбранными записями"><p role="status">Выбрано: ${selected.size}</p><div><button type="button" class="mn-secondary" data-select-visible ${found.length ? '' : 'disabled'}>${selected.size === found.length && found.length ? 'Снять выбор' : 'Выбрать все найденные'}</button>${view === 'done' ? `<button type="button" class="mn-primary" data-bulk="restore" ${tasks ? '' : 'disabled'}>Вернуть задачи в активные (${tasks})</button>` : `<button type="button" class="mn-primary" data-bulk="complete" ${tasks ? '' : 'disabled'}>Выполнить задачи (${tasks})</button><button type="button" class="mn-secondary" data-bulk="tomorrow" ${selected.size ? '' : 'disabled'}>Перенести на завтра</button>`}</div><details class="mn-bulk-help"><summary>Что изменится?</summary><p>${view === 'done' ? 'Вернутся только выбранные задачи. Напоминания можно включить в каждой записи.' : 'Выполнение относится только к задачам и отменяет их напоминания. Перенос меняет срок задач и заметок, сохраняя время. Напоминания «В срок» и «За…» следуют за сроком; выбранные отдельно остаются на своей дате.'}</p></details></section>`;
    }
    function clearSelection() { selecting = false; selected.clear(); }
    function bulkAction(action) {
        const changes = prepareListAction(visibleEntries(), selected, action);
        if (!changes.length) { say('Изменять нечего: выбранные записи уже имеют этот срок или состояние.'); return; }
        if (!applyListChanges(records(), changes)) { say('Записи изменились. Выберите их заново.'); return; }
        if (persist() === false) {
            applyListChanges(records(), changes, true); persist(); render();
            say('Не удалось сохранить действие на устройстве. Изменения отменены. Освободите место и попробуйте снова.'); return;
        }
        clearSelection(); render();
        const text = action === 'tomorrow' ? `Перенесено на завтра: ${changes.length}. Найти записи можно во «Все записи».` : action === 'complete' ? `Выполнено задач: ${changes.length}.` : `Возвращено в активные: ${changes.length}.`;
        offerUndo(text, () => {
            if (!applyListChanges(records(), changes, true)) return false;
            if (persist() !== false) return true;
            applyListChanges(records(), changes); persist(); return false;
        });
    }
    function timestamp(value) {
        if (!value || Number.isNaN(new Date(value).getTime())) return 'пока не подтверждено';
        return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
    }
    function counts(state) { const c = notebookSummary(state); return `Задач: ${c.tasks} · выполнено: ${c.completed} · заметок: ${c.notes}`; }
    function syncSettings() {
        const info = syncPresentation(syncDetails);
        return `<section class="mn-setting"><h2>Сохранение и синхронизация</h2><p class="mn-settings-status">${escape(info.title)}</p><p>${escape(info.explanation)}</p><p>Подтверждено в аккаунте: ${escape(timestamp(syncDetails?.syncedAt))}</p><p class="mn-offline-ready">${offlineReady ? 'Офлайн-запуск готов на этом устройстве.' : 'Для запуска без интернета сначала откройте эту страницу с сетью и дождитесь подготовки офлайн-версии.'}</p><button type="button" class="mn-secondary" data-sync-open>Открыть состояние сохранения</button></section>`;
    }
    function updateSyncNotice() {
        const info = syncPresentation(syncDetails);
        shell.querySelector('.mn-status').textContent = info.title + ' ›';
        syncNotice.hidden = !info.warning || !syncDetails;
        syncNotice.innerHTML = `<p><strong>${escape(info.title)}</strong></p><p>${escape(info.explanation)}</p><button type="button" class="mn-secondary" data-sync-open>${syncDetails?.conflict ? 'Сравнить копии' : 'Открыть сохранение'}</button>`;
    }
    function previewRecord(record) {
        if (!record) return '<p>Нет в этой копии — возможно, запись удалена.</p>';
        const e = record.entry, text = record.type === 'task' ? e.name : e.title || e.text;
        return `<p dir="auto">${escape(text)}</p><p dir="auto">${escape(record.type === 'task' ? e.details : e.title ? e.text : '')}</p><p>${record.type === 'task' ? e.checked ? 'Выполненная задача' : 'Задача' : 'Заметка'} · ${escape(e.date || 'Без срока')}${e.time ? ' · ' + escape(e.time) : ''}${reminderLabel(e) ? ' · ' + escape(reminderLabel(e)) : ''}</p>`;
    }
    function renderSync() {
        const info = syncPresentation(syncDetails), disabled = syncBusy ? 'disabled' : '';
        const c = syncDetails?.counts;
        main.innerHTML = `<h1>Сохранение</h1><section class="mn-setting"><h2>${escape(info.title)}</h2><p>${escape(info.explanation)}</p>${c ? `<p>Задач: ${c.tasks} · выполнено: ${c.completed} · заметок: ${c.notes}</p>` : ''}<p>Сохранено на устройстве: ${escape(timestamp(syncDetails?.savedAt))}</p><p>Подтверждено в аккаунте: ${escape(timestamp(syncDetails?.syncedAt))}</p><p>${offlineReady ? 'Офлайн-запуск готов.' : 'Офлайн-запуск пока не подтверждён. Откройте страницу с интернетом и дождитесь подготовки.'}</p><button type="button" class="mn-primary" data-sync-now ${disabled}>${syncBusy ? 'Проверяем…' : 'Проверить соединение и синхронизировать'}</button>${canExportNotebook ? `<button type="button" class="mn-secondary" data-export ${disabled}>Скачать копию записей</button>` : '<p>Скачивание файла доступно в веб-версии. Резервные копии перед объединением сохраняются на этом устройстве.</p>'}${syncDetails?.backup && canExportNotebook ? `<button type="button" class="mn-secondary" data-export-recovery ${disabled}>Скачать копии до последнего объединения или замены</button>` : ''}</section>${syncDetails?.conflict ? `<section class="mn-setting"><h2>Две копии блокнота</h2><p>Сначала получите копию из аккаунта для сравнения. До вашего выбора обе копии останутся без изменений.</p><button type="button" class="mn-secondary" data-compare ${disabled}>Получить и сравнить копии</button></section>` : ''}${syncError ? `<p class="mn-sync-error" role="alert">${escape(syncError)}</p>` : ''}${syncPreview ? `<section class="mn-setting"><h2>Сравнение копий</h2><p>На устройстве: ${escape(counts(syncPreview.local))}</p><p>В аккаунте: ${escape(counts(syncPreview.cloud))}</p><p>Различающихся записей: ${syncPreview.differences.length}</p>${syncPreview.differences.map((d, i) => `<details class="mn-copy-difference"><summary>Различие ${i + 1}</summary><h3>На этом устройстве</h3>${previewRecord(d.local)}<h3>В аккаунте</h3>${previewRecord(d.cloud)}</details>`).join('')}<h3>Сохранить обе копии</h3><p>Сохраним все записи обеих копий, включая удалённые только на одном устройстве. Если одна запись различается, оставим две версии. У дополнительных копий напоминания выключены, чтобы они не дублировались.</p><button type="button" class="mn-primary" data-resolve="both" ${disabled}>Сохранить обе копии</button><details><summary>Использовать только копию из аккаунта</summary><p>Текущие записи заменятся копией из аккаунта. Перед заменой обе версии сохранятся в резервную копию на этом устройстве.</p><button type="button" class="mn-secondary" data-resolve="cloud" ${disabled}>Заменить этой копией из аккаунта</button></details><p>Если во время выбора одна из копий изменится, потребуется новое сравнение.</p></section>` : ''}`;
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
        catch (error) { if (id === account) syncError = error.message || 'Не удалось выполнить действие. Записи оставлены на устройстве.'; }
        finally { if (id === account) { syncBusy = false; syncDetails = getSyncDetails(); updateSyncNotice(); if (!editor) render(); } }
    }
    function open(id = null) {
        clearSelection();
        const previous = id ? find(id) : null;
        if (id && !previous) { say('Эта запись больше недоступна.'); return; }
        undo = null; say(''); editor = true; editingId = id; type = previous?.type || 'task';
        creating = !previous;
        let draft = null;
        if (!previous) { try { draft = JSON.parse(localStorage.getItem(draftKey())); } catch (_) { say('Черновик недоступен.'); } }
        const entry = previous?.entry;
        const text = entry ? previous.type === 'task' ? entry.name : entry.title || entry.text : draft?.text || '';
        const details = entry ? previous.type === 'task' ? entry.details : entry.title ? entry.text : '' : draft?.details || '';
        const savedAnchor = entry?.deadlineAnchor || draft?.deadlineAnchor;
        deadlineAnchor = savedAnchor?.text === text && !Number.isNaN(new Date(savedAnchor.at).getTime())
            ? savedAnchor : { text, at: new Date().toISOString() };
        const reminder = normalizeReminder(entry?.reminder || draft?.reminder);
        type = previous?.type || (draft?.type === 'note' ? 'note' : 'task');
        dismissedDeadline = entry?.deadlineDismissed || draft?.deadlineDismissed || '';
        nav.hidden = true; add.hidden = true;
        main.innerHTML = `<div class="mn-editor-header"><button type="button" class="mn-back" data-back>← Назад</button><button type="button" class="mn-primary" data-save>Сохранить</button></div><h1>${previous ? 'Запись' : 'Новая запись'}</h1><div class="mn-types">${[['task', 'Задача'], ['note', 'Заметка']].map(([value, label]) => `<button type="button" data-type="${value}" aria-pressed="${type === value}">${label}</button>`).join('')}</div><p class="mn-type-help">${type === 'task' ? 'Задача — дело, которое можно отметить выполненным.' : 'Заметка — мысль или информация, которую нужно сохранить.'} У обоих типов можно выбрать срок и напоминание.</p><label for="mn-text">Что записать?</label><textarea class="mn-input mn-text" id="mn-text" name="text" dir="auto" placeholder="Запишите мысль или задачу">${escape(text)}</textarea><aside class="mn-suggestion" aria-label="Предложенный срок" aria-live="polite" hidden></aside><details class="mn-language-examples"><summary>Как указать срок словами</summary><p>Можно написать день недели или срок через число минут, часов, дней или недель. Проверьте предложенную дату перед применением.</p><ul>${[['Русский', 'в пятницу в 18:00; через 2 часа'], ['English', 'Friday at 6 pm; in 2 hours'], ['Deutsch', 'Freitag um 18:00; in 2 Stunden'], ['Italiano', 'venerdì alle 18:00; tra 2 ore'], ['Español', 'viernes a las 18:00; en 2 horas'], ['Français', 'vendredi à 18:00; dans 2 heures'], ['Português', 'sexta-feira às 18:00; daqui a 2 horas'], ['中文', '星期五18:00; 2小时后'], ['日本語', '金曜日18:00; 2時間後'], ['한국어', '금요일 18:00; 2시간 후']].map(([language, sample]) => `<li><strong>${language}:</strong> ${sample}</li>`).join('')}</ul><p>«Следующая пятница» означает пятницу следующей недели. «Через 2 часа» отсчитывается от ввода фразы. Текст записи не сокращается и не переводится.</p></details><details ${details ? 'open' : ''}><summary>Подробности</summary><label for="mn-details">Дополнительный текст</label><textarea class="mn-input" id="mn-details" name="details" dir="auto">${escape(details)}</textarea></details><label for="mn-date">Срок · необязательно</label><div class="mn-date-fields"><input class="mn-input" type="date" id="mn-date" name="date" value="${escape(entry?.date || draft?.date || '')}"><input class="mn-input" type="time" name="time" aria-label="Время срока" value="${escape(entry?.time || draft?.time || '')}"></div><div class="mn-filters"><button type="button" data-date="today">Сегодня</button><button type="button" data-date="tomorrow">Завтра</button><button type="button" data-date="none">Без срока</button></div><p class="mn-deadline-help"></p><label class="mn-pin"><input type="checkbox" name="today" ${(entry ? (entry.today ?? (previous?.project === 'today')) : draft?.today) ? 'checked' : ''}>Также показать в «Сегодня» без срока</label><section class="mn-reminder-form"><h2>Напоминание</h2><label for="mn-reminder-mode">Когда напомнить?</label><select class="mn-input" id="mn-reminder-mode" name="reminderMode">${REMINDER_OPTIONS.map(([value, label]) => `<option value="${value}" ${reminder.mode === value ? 'selected' : ''}>${label}</option>`).join('')}</select><div class="mn-reminder-custom" hidden><label for="mn-reminder-date">Дата напоминания</label><div class="mn-date-fields"><input class="mn-input" type="date" id="mn-reminder-date" name="reminderDate" value="${escape(reminder.date)}"><input class="mn-input" type="time" name="reminderTime" aria-label="Время напоминания" value="${escape(reminder.time)}"></div></div><p class="mn-reminder-preview" aria-live="polite"></p><p class="mn-reminder-device"></p><button type="button" class="mn-secondary" data-enable-reminders>Включить напоминания на этом устройстве</button></section>${previous?.type === 'task' ? `<button type="button" class="mn-secondary" data-complete="${escape(id)}">${entry.checked ? 'Вернуть в активные' : 'Выполнить задачу'}</button>` : ''}${previous ? `<button type="button" class="mn-delete" data-delete="${escape(id)}">Удалить запись</button>` : ''}`;
        updateDate();
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
            ? 'Без срока запись остаётся во «Все записи». Галочка ниже также покажет её в «Сегодня».'
            : preset === 'today' ? 'Запись появится в «Сегодня» автоматически по выбранной дате.'
            : selectedDate < localDateString() ? 'Этот срок уже прошёл. Запись появится в «Сегодня» в разделе «Просрочено».'
            : 'Запись доступна во «Все записи» и появится в «Сегодня», когда наступит выбранная дата.';
        renderSuggestion();
        const mode = main.querySelector('[name="reminderMode"]');
        if (!hasDate && !['none', 'custom'].includes(mode.value)) mode.value = 'none';
        mode.querySelectorAll('option').forEach(option => { option.disabled = !hasDate && !['none', 'custom'].includes(option.value); });
        updateReminder();
    }
    function deviceReminderHelp() {
        if (reminderState.error) return reminderState.error;
        if (reminderState.native && reminderState.permission === 'denied') return 'Android не разрешает уведомления. Включите их в настройках телефона: Приложения → TO-DO Personal → Уведомления.';
        if (!reminderState.enabled) return 'На этом устройстве напоминания выключены. Включите их, чтобы получать напоминания по выбранному времени.';
        if (!reminderState.native) return 'В браузере напоминания появляются внутри блокнота, пока эта страница открыта. При закрытом браузере они не сработают.';
        return reminderState.exact ? 'Android-уведомления включены. Напоминания запланированы на этом устройстве и не требуют интернета.' : 'Android-уведомления включены, но телефон может задерживать их. Разрешите точное время в настройках напоминаний.';
    }
    function updateReminder() {
        if (!editor) return;
        const value = fields(), custom = value.reminder.mode === 'custom';
        main.querySelector('.mn-reminder-custom').hidden = !custom;
        const at = reminderMoment(value), helper = main.querySelector('.mn-reminder-preview');
        helper.textContent = value.reminder.mode === 'none' ? 'Для этой записи напоминание не придёт.' : !at
            ? 'Укажите дату и время напоминания.' : at <= new Date()
            ? 'Это время уже прошло — напоминание не сработает. Выберите будущее время.'
            : reminderLabel(value) + (value.reminder.mode !== 'custom' && !value.time ? ' · у срока нет времени, используем 09:00.' : '');
        main.querySelector('.mn-reminder-device').textContent = deviceReminderHelp();
        main.querySelector('[data-enable-reminders]').hidden = reminderState.enabled;
    }
    function reminderSettings() {
        return `<section class="mn-setting"><h2>Напоминания на этом устройстве</h2><p>${escape(deviceReminderHelp())}</p><button class="mn-secondary" type="button" data-toggle-reminders ${reminderBusy ? 'disabled' : ''}>${reminderState.enabled ? 'Выключить напоминания' : 'Включить напоминания'}</button>${reminderState.native && reminderState.enabled && !reminderState.exact ? '<button type="button" class="mn-secondary" data-exact-reminders>Разрешить точное время</button>' : ''}<p>Запланировано на устройстве: ${reminderState.scheduled}. Выключение отменяет уведомления на этом устройстве, но сохраняет выбранное время в записях.</p><button class="mn-secondary" type="button" data-reminder-list>Посмотреть записи с напоминаниями</button>${reminderState.error ? '<button class="mn-secondary" type="button" data-retry-reminders>Повторить настройку</button>' : ''}</section>`;
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
        reminderBanner.innerHTML = `<h2>Время напоминания</h2><p dir="auto">${escape(text)}</p><div><button type="button" class="mn-secondary" data-reminder-open>Открыть</button><button type="button" class="mn-secondary" data-reminder-snooze>Отложить на 10 минут</button>${record.type === 'task' ? '<button type="button" class="mn-primary" data-reminder-done>Выполнено</button>' : ''}<button type="button" class="mn-secondary" data-reminder-close>Закрыть</button></div>`;
    }
    function parseSuggestion() {
        const text = main.querySelector('[name="text"]').value;
        if (deadlineAnchor?.text !== text || Number.isNaN(new Date(deadlineAnchor?.at).getTime())) deadlineAnchor = { text, at: new Date().toISOString() };
        const value = suggestDeadline(text, new Date(deadlineAnchor.at));
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
        const alreadySet = suggestion && current.date === suggestion.date && current.time === suggestion.time;
        area.hidden = !suggestion || alreadySet || suggestionKey(suggestion) === dismissedDeadline;
        if (area.hidden) { area.replaceChildren(); return; }
        const label = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(suggestion.date + 'T12:00:00'));
        const at = new Date(suggestion.date + 'T' + (suggestion.time || '09:00'));
        const interpretation = { relative: 'Отсчитываем от момента ввода этой фразы. ', weekday: 'Предлагаем ближайший подходящий день недели. ', 'next-week': 'Под «следующим» понимаем день следующей недели, которая начинается с понедельника. ', 'this-week': 'Предлагаем день текущей недели, которая начинается с понедельника. ' }[suggestion.interpretation] || '';
        area.innerHTML = `<p class="mn-suggestion-title">Срок из текста: <strong>${escape(label)}${suggestion.time ? ` · ${escape(suggestion.time)}` : ''}</strong></p><p>${escape(interpretation)}${suggestion.roundedToMinute ? 'Время округлено до минуты вверх. ' : ''}${suggestion.inferredDate ? 'Указано только время — предлагаем ближайшую дату. ' : ''}${suggestion.past ? 'Этот срок уже прошёл. ' : ''}Текст записи сохранится целиком. ${current.date ? 'Применение заменит выбранный срок.' : 'Срок изменится только после подтверждения.'}</p><div class="mn-suggestion-actions"><button type="button" class="mn-primary" data-accept-deadline>Применить</button><button type="button" class="mn-primary" data-accept-reminder ${at <= new Date() ? 'disabled' : ''}>${suggestion.time ? 'Применить срок и напомнить' : 'Применить и напомнить в 09:00'}</button><button type="button" class="mn-secondary" data-dismiss-deadline>Не нужно</button></div><p>${at <= new Date() ? 'Для напоминания выберите будущее время ниже в форме.' : reminderState.enabled ? 'Напомним в выбранный срок. Уже выбранное напоминание заменится.' : 'Второе действие также включит напоминания на этом устройстве. В Android потребуется разрешение на уведомления.'}</p>`;
    }
    function commit(close = true) {
        const value = fields();
        if (!value.text.trim()) { if (close) { say('Напишите текст записи.'); main.querySelector('[name="text"]').focus(); } return false; }
        if (close && value.reminder.mode !== 'none' && !reminderMoment({ ...value, checked: false })) { say('Укажите дату и время напоминания или выберите «Не напоминать».'); main.querySelector('[name="reminderMode"]').focus(); return false; }
        const previous = editingId ? find(editingId) : null;
        if (editingId && !previous) { say('Запись удалена на другом устройстве. Скопируйте текст перед выходом.'); return false; }
        editingId = saveEntry(todos, notes, value, previous);
        const locallySaved = persist();
        if (locallySaved === false) { say('Не удалось сохранить запись на устройстве. Не закрывайте приложение.'); return false; }
        if (close) {
            if (creating) { try { localStorage.removeItem(draftKey()); } catch (_) { /* no overwrite */ } }
            editor = false; render(); say(value.date > localDateString() && view === 'today' ? 'Запись сохранена. Она доступна во «Все записи».' : 'Запись сохранена.');
        }
        return true;
    }
    function back() {
        if (editingId) { if (!commit(false)) return; }
        else { stashDraft(); if (!draftSafe) return; }
        editor = false; render();
    }
    function changed() { if (editingId) commit(false); else stashDraft(); }
    shell.addEventListener('click', event => {
        const button = event.target.closest('button'); if (!button) return;
        if (button.hasAttribute('data-selection-toggle')) { selecting = !selecting; selected.clear(); render(); }
        else if (button.hasAttribute('data-select')) { const id = button.dataset.select; if (selected.has(id)) selected.delete(id); else selected.add(id); renderList(); }
        else if (button.hasAttribute('data-select-visible')) { const found = visibleEntries(); selected = selected.size === found.length ? new Set() : new Set(found.map(r => r.entry.id)); renderList(); }
        else if (button.hasAttribute('data-bulk')) bulkAction(button.dataset.bulk);
        else if (button.hasAttribute('data-reset-filters')) { query = ''; filter = 'all'; dueFilter = 'all'; selected.clear(); render(); }
        else if (button.hasAttribute('data-sync-open')) openSync();
        else if (button.hasAttribute('data-sync-now')) runSync(() => syncNow?.());
        else if (button.hasAttribute('data-compare')) runSync(async () => { const id = account, result = await inspectConflict?.(); if (id === account && view === 'sync') syncPreview = result; });
        else if (button.hasAttribute('data-resolve')) runSync(async () => { const id = account; await resolveConflict?.(button.dataset.resolve); if (id === account) { syncPreview = null; say('Выбранная копия сохранена. Резервная копия доступна на экране сохранения.'); } });
        else if (button.hasAttribute('data-export') || button.hasAttribute('data-export-recovery')) runSync(() => exportNotebook?.(button.hasAttribute('data-export-recovery')));
        else if (button.hasAttribute('data-reminder-open')) {
            const record = find(reminderQueue[0]?.id); if (!record) return;
            if (editor) { back(); if (editor) return; }
            open(record.entry.id);
        } else if (button.hasAttribute('data-reminder-close') || button.hasAttribute('data-reminder-snooze') || button.hasAttribute('data-reminder-done')) {
            const record = find(reminderQueue[0]?.id); if (!record) return;
            if (editor) { back(); if (editor) return; }
            const handled = reminderQueue[0];
            reminderQueue = reminderQueue.filter(item => item !== handled);
            if (button.hasAttribute('data-reminder-snooze')) { snoozeReminder(record.entry); persist(); say('Напоминание отложено на 10 минут. Срок записи сохранён.'); }
            if (button.hasAttribute('data-reminder-done')) { toggleEntry(record); persist(); say('Задача выполнена. Её напоминание отменено.'); }
            render();
        } else if (button.hasAttribute('data-toggle-reminders') || button.hasAttribute('data-enable-reminders')) {
            if (reminderBusy) return;
            reminderBusy = true; button.disabled = true;
            Promise.resolve(configureReminders?.(button.hasAttribute('data-enable-reminders') || !reminderState.enabled))
                .catch(() => say('Не удалось включить напоминания. Повторите попытку.'))
                .finally(() => { reminderBusy = false; if (editor) { button.disabled = false; updateReminder(); } else render(); });
        } else if (button.hasAttribute('data-exact-reminders')) {
            Promise.resolve(enableExactReminders?.()).catch(() => say('Не удалось открыть настройки точного времени.'));
        } else if (button.hasAttribute('data-retry-reminders')) {
            refreshReminders?.();
        } else if (button.hasAttribute('data-reminder-list')) { view = 'all'; filter = 'reminder'; query = ''; render(); }
        else if (button.hasAttribute('data-view')) { clearSelection(); view = button.dataset.view; query = ''; filter = 'all'; dueFilter = 'all'; undo = null; say(''); render(); }
        else if (button === add) open();
        else if (button.hasAttribute('data-open')) { clearSelection(); open(button.dataset.open); }
        else if (button.hasAttribute('data-back')) back();
        else if (button.hasAttribute('data-save')) commit();
        else if (button.hasAttribute('data-filter')) { filter = button.dataset.filter; selected.clear(); render(); }
        else if (button.hasAttribute('data-type')) { type = button.dataset.type; main.querySelector('.mn-type-help').textContent = (type === 'task' ? 'Задача — дело, которое можно отметить выполненным.' : 'Заметка — мысль или информация, которую нужно сохранить.') + ' У обоих типов можно выбрать срок и напоминание.'; main.querySelectorAll('[data-type]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.type === type))); const complete = main.querySelector('[data-complete]'); if (complete) complete.hidden = type !== 'task'; changed(); }
        else if (button.hasAttribute('data-date')) {
            dismissedDeadline = suggestionKey(parseSuggestion());
            const date = new Date(); if (button.dataset.date === 'tomorrow') date.setDate(date.getDate() + 1);
            main.querySelector('[name="date"]').value = button.dataset.date === 'none' ? '' : localDateString(date);
            if (button.dataset.date === 'none') main.querySelector('[name="time"]').value = '';
            updateDate(); changed();
        } else if ((button.hasAttribute('data-accept-deadline') || button.hasAttribute('data-accept-reminder')) && suggestion) {
            main.querySelector('[name="date"]').value = suggestion.date;
            const withReminder = button.hasAttribute('data-accept-reminder');
            main.querySelector('[name="time"]').value = suggestion.time || (withReminder ? '09:00' : '');
            if (withReminder) main.querySelector('[name="reminderMode"]').value = 'at';
            dismissedDeadline = '';
            updateDate(); changed();
            if (withReminder) {
                say('Срок и напоминание выбраны. Сохраните запись.');
                if (!reminderState.enabled) Promise.resolve(configureReminders?.(true))
                    .then(enabled => { if (enabled === false) say('Срок выбран. Разрешите уведомления на устройстве, чтобы напоминание сработало.'); })
                    .catch(() => say('Срок выбран, но включить напоминания не удалось. Повторите включение ниже в форме.'));
            }
        } else if (button.hasAttribute('data-dismiss-deadline')) {
            dismissedDeadline = suggestionKey(suggestion);
            renderSuggestion(); changed();
        } else if (button.hasAttribute('data-check') || button.hasAttribute('data-complete')) {
            const record = find(button.dataset.check || button.dataset.complete); if (!record || record.type !== 'task') return;
            const before = { ...record.entry };
            toggleEntry(record);
            persist(); editor = false; render();
            offerUndo(record.entry.checked ? 'Задача выполнена.' : 'Задача возвращена в активные.', () => { Object.assign(record.entry, before); persist(); });
        } else if (button.hasAttribute('data-delete')) {
            const record = find(button.dataset.delete); if (!record) return;
            const list = record.type === 'note' ? notes : todos[record.project];
            const index = list.findIndex(entry => entry.id === record.entry.id);
            list.splice(index, 1);
            persist(); editor = false; render(); offerUndo('Запись удалена.', () => { list.splice(index, 0, record.entry); persist(); });
        } else if (button.hasAttribute('data-undo') && undo) { const restored = undo(); undo = null; render(); say(restored === false ? 'Не удалось отменить: записи изменились или сохранение недоступно. Текущие записи не заменены предыдущей версией.' : 'Действие отменено.'); }
        else if (button.hasAttribute('data-logout')) { logout(); }
    });
    shell.addEventListener('input', event => {
        if (event.target.id === 'mn-search') { query = event.target.value; selected.clear(); renderList(); }
        else if (editor) {
            if (['date', 'time'].includes(event.target.name)) {
                dismissedDeadline = suggestionKey(parseSuggestion());
                updateDate();
            } else if (event.target.name === 'text') renderSuggestion();
            else if (['reminderMode', 'reminderDate', 'reminderTime'].includes(event.target.name)) updateReminder();
            changed();
        }
    });
    shell.addEventListener('change', event => {
        if (event.target.hasAttribute('data-due-filter')) { dueFilter = event.target.value; selected.clear(); render(); }
        else if (event.target.hasAttribute('data-list-sort')) {
            const previous = listSort; listSort = event.target.value === 'updated' ? 'updated' : 'deadline';
            try { localStorage.setItem(preferencesKey(), JSON.stringify({ smartDates, listSort })); }
            catch (_) { listSort = previous; say('Не удалось сохранить порядок записей на устройстве.'); }
            render();
        } else if (event.target.hasAttribute('data-smart-dates')) {
            try {
                localStorage.setItem(preferencesKey(), JSON.stringify({ smartDates: event.target.checked, listSort }));
                smartDates = event.target.checked;
                say(smartDates ? 'Подсказки сроков включены.' : 'Подсказки сроков выключены. Уже выбранные сроки сохранены.');
            } catch (_) { event.target.checked = smartDates; say('Не удалось сохранить настройку на устройстве.'); }
        } else if (editor) {
            if (['date', 'time'].includes(event.target.name)) dismissedDeadline = suggestionKey(parseSuggestion());
            updateDate(); changed();
        }
    });
    window.addEventListener('beforeunload', event => {
        if (editor && !editingId) stashDraft();
        if (!draftSafe) { event.preventDefault(); event.returnValue = ''; }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && editor && !editingId) stashDraft(); });
    return {
        render,
        notifyReminder(record) {
            if (!record) reminderQueue = [];
            else {
                const at = reminderMoment(record.entry)?.toISOString();
                if (at && !reminderQueue.some(item => item.id === record.entry.id && item.at === at)) reminderQueue.push({ id: record.entry.id, at });
            }
            renderReminderBanner();
        },
        setReminderStatus(value) {
            if (JSON.stringify(reminderState) === JSON.stringify(value)) return;
            reminderState = value;
            if (editor) updateReminder(); else render();
        },
        saveDraft: stashDraft,
        back() {
            if (editor) { back(); return true; }
            if (selecting) { clearSelection(); render(); return true; }
            if (view !== 'today' || query) { view = 'today'; query = ''; filter = 'all'; undo = null; say(''); render(); return true; }
            return false;
        },
        isEditing: () => editor || selecting || Boolean(undo),
        setAccount(id) { if (account !== id) { clearTimeout(undoTimer); account = id; clearSelection(); dueFilter = 'all'; reminderQueue = []; syncDetails = null; syncBusy = false; syncPreview = null; syncError = ''; updateSyncNotice(); readPreferences(); dismissedDeadline = ''; suggestion = null; deadlineAnchor = null; editor = false; editingId = null; view = 'today'; query = ''; filter = 'all'; undo = null; draftSafe = true; say(''); render(); } },
        setOfflineReady(value) {
            offlineReady = value;
            if (!editor && ['settings', 'sync'].includes(view)) render();
        },
        setStatus(text, details) {
            syncDetails = details || getSyncDetails();
            statusText = syncPresentation(syncDetails).title;
            updateSyncNotice();
            if (!editor && ['settings', 'sync'].includes(view)) render();
        }
    };
}
