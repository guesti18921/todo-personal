import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY } from './authConfig.js';
import { boundedFetch } from './networkFetch.js';
import { readRecoveryTokens, createPasswordRecovery } from './passwordRecovery.js';

const tokens = readRecoveryTokens(window.todoRecoveryFragment || '');
delete window.todoRecoveryFragment;
const en = !navigator.language.toLowerCase().startsWith('ru');
document.documentElement.lang = en ? 'en' : 'ru';
const text = (ru, english) => en ? english : ru;
const form = document.querySelector('#reset-form');
const password = document.querySelector('#new-password');
const repeat = document.querySelector('#repeat-password');
const retry = document.querySelector('#retry');
const show = document.querySelector('#show-password');
document.querySelector('#heading').textContent = text('Новый пароль', 'New password');
document.querySelector('#password-label').textContent = text('Новый пароль — минимум 8 символов', 'New password — at least 8 characters');
document.querySelector('#repeat-label').textContent = text('Повторите пароль', 'Repeat password');
document.querySelector('#save-password').textContent = text('Сохранить пароль', 'Save password');
retry.textContent = text('Повторить проверку', 'Retry verification');
document.querySelector('#return-message').textContent = text('Вернитесь в TO-DO Personal и войдите с новым паролем.', 'Return to TO-DO Personal and sign in with your new password.');
document.querySelector('#open-app').textContent = text('Открыть Android-приложение', 'Open Android app');
const messages = {
    checking: ['Проверяем ссылку…', 'Checking the link…'],
    ready: ['Придумайте новый пароль.', 'Choose a new password.'],
    invalid: ['Ссылка недействительна или устарела. Запросите новое письмо в приложении.', 'This link is invalid or expired. Request a new email in the app.'],
    offline: ['Нет соединения. Проверьте интернет и повторите попытку.', 'No connection. Check your internet and try again.'],
    saving: ['Сохраняем пароль…', 'Saving password…'],
    short: ['Пароль должен содержать минимум 8 символов и соответствовать требованиям сервера.', 'Use at least 8 characters and meet the server password requirements.'],
    mismatch: ['Пароли не совпадают.', 'Passwords do not match.'],
    same: ['Новый пароль должен отличаться от старого.', 'The new password must differ from the old one.'],
    reauth: ['Для смены пароля требуется дополнительное подтверждение. Запросите новое письмо; если ошибка повторится, обратитесь к разработчику.', 'Additional verification is required. Request a new email; if this repeats, contact the developer.'],
    failed: ['Не удалось сохранить пароль. Попробуйте снова или запросите новое письмо.', 'Could not save your password. Try again or request a new email.'],
    success: ['Пароль изменён.', 'Password changed.']
};
const client = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
        flowType: 'implicit', storageKey: 'todo-personal:password-recovery' },
    global: { fetch: boundedFetch }
});
const recovery = createPasswordRecovery({ auth: client.auth, onStatus(status) {
    document.querySelector('#status').textContent = text(...messages[status]);
    if (status === 'ready') form.hidden = false;
    if (['invalid', 'success'].includes(status)) { form.hidden = true; form.reset(); }
    for (const el of form.elements) el.disabled = ['checking', 'saving'].includes(status);
    retry.hidden = status !== 'offline' || !form.hidden;
    document.querySelector('#return-message').hidden = status !== 'success';
    document.querySelector('#open-app').hidden = !['success', 'invalid'].includes(status) || !/Android/i.test(navigator.userAgent);
} });
show.textContent = text('Показать пароль', 'Show password');
show.addEventListener('click', () => {
    const visible = password.type === 'password';
    password.type = repeat.type = visible ? 'text' : 'password';
    show.textContent = visible ? text('Скрыть пароль', 'Hide password') : text('Показать пароль', 'Show password');
    show.setAttribute('aria-pressed', String(visible));
});
retry.addEventListener('click', () => recovery.open(tokens));
form.addEventListener('submit', async event => {
    event.preventDefault();
    await recovery.save(password.value, repeat.value);
});
recovery.open(tokens);
