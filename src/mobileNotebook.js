import { createEntryId } from './localNotebook.js';

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
    const common = { ...(previous?.entry || {}), id, date: fields.date || '', time: fields.date ? fields.time || '' : '', today: !fields.date && Boolean(fields.today), updatedAt: stamp };
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
    record.entry.updatedAt = new Date().toISOString();
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function createMobileNotebook({ root, todos, notes, persist, logout, getAccount }) {
    const shell = document.createElement('section');
    shell.className = 'mobile-notebook';
    shell.setAttribute('aria-label', 'Мобильный блокнот');
    shell.innerHTML = `<header class="mn-header"><span class="mn-logo">// TO-DO</span><span class="mn-status" role="status" aria-live="polite"></span></header><main class="mn-main"></main><div class="mn-message" role="status" aria-live="polite"></div><button class="mn-add" type="button" aria-label="Создать запись">+</button><nav class="mn-nav" aria-label="Разделы блокнота"><button data-view="today" type="button">Сегодня</button><button data-view="all" type="button">Все записи</button><button data-view="done" type="button">Выполнено</button><button data-view="settings" type="button">Настройки</button></nav>`;
    root.append(shell);
    const main = shell.querySelector('.mn-main'), nav = shell.querySelector('.mn-nav'), add = shell.querySelector('.mn-add'), message = shell.querySelector('.mn-message');
    let view = 'today', editor = false, editingId = null, creating = false, type = 'task', query = '', filter = 'all', account = null, draftSafe = true, statusText = '', undo = null, undoTimer;
    const records = () => listEntries(todos, notes);
    const find = id => records().find(record => record.entry.id === id);
    const draftKey = () => `todo-personal:entry-draft:${account}`;
    const say = text => { message.textContent = text; };
    function offerUndo(text, action) {
        clearTimeout(undoTimer);
        undo = action;
        message.innerHTML = `${text} <button type="button" data-undo>Отменить</button>`;
        undoTimer = setTimeout(() => { if (undo === action) { undo = null; say(''); } }, 8000);
    }
    function fields() {
        return { type, text: main.querySelector('[name="text"]').value, details: main.querySelector('[name="details"]').value, date: main.querySelector('[name="date"]').value, time: main.querySelector('[name="time"]').value, today: main.querySelector('[name="today"]').checked };
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
        const labels = [];
        const dueDate = entry.date ? new Date(entry.date + 'T12:00:00') : null;
        if (dueDate && !Number.isNaN(dueDate.getTime())) labels.push(entry.date === localDateString() ? 'Сегодня' : new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' }).format(dueDate));
        if (entry.time) labels.push(entry.time);
        if (!entry.date) labels.push('Без срока');
        if (project && !['home', 'today', 'week'].includes(project)) labels.push(project);
        return `<article class="mn-card ${entry.checked ? 'mn-completed' : ''}">${kind === 'task' ? `<button class="mn-check" type="button" data-check="${escape(entry.id)}" aria-label="${entry.checked ? 'Вернуть в активные' : 'Выполнить'}: ${escape(text)}">${entry.checked ? '✓' : '○'}</button>` : '<span class="mn-note-label">Заметка</span>'}<button class="mn-open" type="button" data-open="${escape(entry.id)}"><span class="mn-title" dir="auto">${escape(text)}</span>${details ? `<span class="mn-details" dir="auto">${escape(details)}</span>` : ''}<span class="mn-meta">${escape(labels.join(' · '))}</span></button></article>`;
    }
    function group(label, list) { return list.length ? `<section><h2 class="mn-group">${label}</h2>${list.map(card).join('')}</section>` : ''; }
    function renderList() {
        const found = records().filter(({ entry, type: kind }) => (view === 'done' ? kind === 'task' && entry.checked : !entry.checked) && (filter === 'all' || view !== 'all' || kind === filter) && [entry.name, entry.title, entry.details, entry.text].some(text => String(text || '').toLocaleLowerCase().includes(query.toLocaleLowerCase())));
        let html;
        if (view === 'today') {
            const groups = todayGroups(found);
            html = group('Просрочено', groups.overdue) + group('Сегодня', groups.today) + group('Без срока · добавлено в Сегодня', groups.pinned);
        } else {
            found.sort((a, b) => view === 'done' ? String(b.entry.completedAt || '').localeCompare(String(a.entry.completedAt || '')) : (a.entry.date || '9999').localeCompare(b.entry.date || '9999') || (a.entry.time || '99:99').localeCompare(b.entry.time || '99:99') || String(b.entry.updatedAt || '').localeCompare(String(a.entry.updatedAt || '')));
            html = found.map(card).join('');
        }
        main.querySelector('.mn-list').innerHTML = html || `<p class="mn-empty">${query ? 'Ничего не найдено.' : view === 'today' ? 'На сегодня ничего не запланировано.' : view === 'done' ? 'Здесь появятся выполненные задачи.' : 'Записей пока нет. Нажмите +, чтобы создать первую.'}</p>`;
    }
    function render() {
        if (editor) return;
        nav.hidden = false; add.hidden = view === 'settings';
        nav.querySelectorAll('button').forEach(button => { if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
        if (view === 'settings') {
            main.innerHTML = `<h1>Настройки</h1><section class="mn-setting"><h2>Аккаунт</h2><p>${escape(getAccount() || '')}</p><button class="mn-secondary" type="button" data-logout>Выйти</button></section><section class="mn-setting"><h2>Сохранение</h2><p class="mn-settings-status">${escape(statusText)}</p><p>Записи сохраняются на этом устройстве и синхронизируются при доступном соединении.</p></section>`;
            return;
        }
        main.innerHTML = `<h1>${{ today: 'Сегодня', all: 'Все записи', done: 'Выполнено' }[view]}</h1><p class="mn-date">${new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p><label class="mn-search-label" for="mn-search">Поиск</label><input id="mn-search" class="mn-input" type="search" placeholder="Найти запись" value="${escape(query)}">${view === 'all' ? `<div class="mn-filters">${[['all', 'Все'], ['task', 'Задачи'], ['note', 'Заметки']].map(([value, label]) => `<button type="button" data-filter="${value}" aria-pressed="${filter === value}">${label}</button>`).join('')}</div>` : ''}<div class="mn-list"></div>`;
        renderList();
    }
    function open(id = null) {
        const previous = id ? find(id) : null;
        if (id && !previous) { say('Эта запись больше недоступна.'); return; }
        undo = null; say(''); editor = true; editingId = id; type = previous?.type || 'task';
        creating = !previous;
        let draft = null;
        if (!previous) { try { draft = JSON.parse(localStorage.getItem(draftKey())); } catch (_) { say('Черновик недоступен.'); } }
        const entry = previous?.entry;
        const text = entry ? previous.type === 'task' ? entry.name : entry.title || entry.text : draft?.text || '';
        const details = entry ? previous.type === 'task' ? entry.details : entry.title ? entry.text : '' : draft?.details || '';
        type = previous?.type || (draft?.type === 'note' ? 'note' : 'task');
        nav.hidden = true; add.hidden = true;
        main.innerHTML = `<div class="mn-editor-header"><button type="button" class="mn-back" data-back>← Назад</button><button type="button" class="mn-primary" data-save>Сохранить</button></div><h1>${previous ? 'Запись' : 'Новая запись'}</h1><div class="mn-types">${[['task', 'Задача'], ['note', 'Заметка']].map(([value, label]) => `<button type="button" data-type="${value}" aria-pressed="${type === value}">${label}</button>`).join('')}</div><label for="mn-text">Что записать?</label><textarea class="mn-input mn-text" id="mn-text" name="text" dir="auto" placeholder="Запишите мысль или задачу">${escape(text)}</textarea><details ${details ? 'open' : ''}><summary>Подробности</summary><label for="mn-details">Дополнительный текст</label><textarea class="mn-input" id="mn-details" name="details" dir="auto">${escape(details)}</textarea></details><label for="mn-date">Срок · необязательно</label><div class="mn-date-fields"><input class="mn-input" type="date" id="mn-date" name="date" value="${escape(entry?.date || draft?.date || '')}"><input class="mn-input" type="time" name="time" aria-label="Время срока" value="${escape(entry?.time || draft?.time || '')}"></div><div class="mn-filters"><button type="button" data-date="today">Сегодня</button><button type="button" data-date="tomorrow">Завтра</button><button type="button" data-date="none">Без срока</button></div><label class="mn-pin"><input type="checkbox" name="today" ${(entry ? (entry.today ?? (previous?.project === 'today')) : draft?.today) ? 'checked' : ''}>Добавить в Сегодня без срока</label>${previous?.type === 'task' ? `<button type="button" class="mn-secondary" data-complete="${escape(id)}">${entry.checked ? 'Вернуть в активные' : 'Выполнить задачу'}</button>` : ''}${previous ? `<button type="button" class="mn-delete" data-delete="${escape(id)}">Удалить запись</button>` : ''}`;
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
        main.querySelector('[name="today"]').disabled = hasDate;
    }
    function commit(close = true) {
        const value = fields();
        if (!value.text.trim()) { if (close) { say('Напишите текст записи.'); main.querySelector('[name="text"]').focus(); } return false; }
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
        if (button.hasAttribute('data-view')) { view = button.dataset.view; query = ''; filter = 'all'; undo = null; say(''); render(); }
        else if (button === add) open();
        else if (button.hasAttribute('data-open')) open(button.dataset.open);
        else if (button.hasAttribute('data-back')) back();
        else if (button.hasAttribute('data-save')) commit();
        else if (button.hasAttribute('data-filter')) { filter = button.dataset.filter; render(); }
        else if (button.hasAttribute('data-type')) { type = button.dataset.type; main.querySelectorAll('[data-type]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.type === type))); const complete = main.querySelector('[data-complete]'); if (complete) complete.hidden = type !== 'task'; changed(); }
        else if (button.hasAttribute('data-date')) {
            const date = new Date(); if (button.dataset.date === 'tomorrow') date.setDate(date.getDate() + 1);
            main.querySelector('[name="date"]').value = button.dataset.date === 'none' ? '' : localDateString(date);
            if (button.dataset.date === 'none') main.querySelector('[name="time"]').value = '';
            updateDate(); changed();
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
        } else if (button.hasAttribute('data-undo') && undo) { undo(); undo = null; render(); say('Действие отменено.'); }
        else if (button.hasAttribute('data-logout')) { logout(); }
    });
    shell.addEventListener('input', event => {
        if (event.target.id === 'mn-search') { query = event.target.value; renderList(); }
        else if (editor) { if (event.target.name === 'date') updateDate(); changed(); }
    });
    shell.addEventListener('change', () => { if (editor) { updateDate(); changed(); } });
    window.addEventListener('beforeunload', event => {
        if (editor && !editingId) stashDraft();
        if (!draftSafe) { event.preventDefault(); event.returnValue = ''; }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && editor && !editingId) stashDraft(); });
    return {
        render,
        saveDraft: stashDraft,
        back() {
            if (editor) { back(); return true; }
            if (view !== 'today' || query) { view = 'today'; query = ''; filter = 'all'; undo = null; say(''); render(); return true; }
            return false;
        },
        isEditing: () => editor || Boolean(undo),
        setAccount(id) { if (account !== id) { clearTimeout(undoTimer); account = id; editor = false; editingId = null; view = 'today'; query = ''; filter = 'all'; undo = null; draftSafe = true; say(''); render(); } },
        setStatus(text) {
            const labels = { 'Saved': 'Синхронизировано', 'Saved locally': 'Сохранено на устройстве', 'Saved locally — waiting for sync': 'На устройстве · ожидает синхронизации', 'Saving...': 'Синхронизация…', 'Saved locally — connection unavailable': 'На устройстве · нет соединения', 'Saved locally — connection unavailable; sync will retry': 'На устройстве · ожидает соединения' };
            statusText = labels[text] || text;
            shell.querySelector('.mn-status').textContent = statusText;
            const settingsStatus = main.querySelector('.mn-settings-status'); if (settingsStatus) settingsStatus.textContent = statusText;
        }
    };
}
