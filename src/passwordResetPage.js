import { resetFrame, resetFields, resetSave, resetNote, resetSuccess, toggleResetEye } from './passwordResetView.js';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY } from './authConfig.js';
import { boundedFetch } from './networkFetch.js';
import { readRecoveryTokens, createPasswordRecovery } from './passwordRecovery.js';

const tokens = readRecoveryTokens(window.todoRecoveryFragment || '');
delete window.todoRecoveryFragment;
const en = !navigator.language.toLowerCase().startsWith('ru');
document.documentElement.lang = en ? 'en' : 'ru';
const text = (ru, english) => en ? english : ru;
const translations = {
 'Новый пароль':'New password','Повторите пароль':'Repeat password','Показать пароль':'Show password','Скрыть пароль':'Hide password',
 'Сохранить пароль':'Save password','Не меньше 8 символов.':'At least 8 characters.','Один аккаунт для всех устройств':'One account for all your devices',
 'Пароль сохранён':'Password saved','Теперь можно войти с новым паролем.':'You can now sign in with your new password.','Вернуться ко входу':'Return to sign in'
};
const t = ru => en ? translations[ru] || ru : ru;
document.querySelector('#reset-root').innerHTML = resetFrame(`<div id="reset-editor"><h1 id="heading">${t('Новый пароль')}</h1><p class="pr-sub" id="status" role="status" aria-live="polite"></p><form id="reset-form" hidden>${resetFields(t)}<p class="pr-error" id="reset-error" role="alert"></p><button class="pr-save" id="save-password" type="submit">${resetSave(t)}</button></form><button class="pr-save" id="retry" type="button" hidden>${text('Повторить проверку','Retry verification')}</button>${resetNote(t)}</div><div id="return-message" hidden>${resetSuccess(t)}</div><a class="pr-link" id="open-app" href="todopersonal://auth-callback" hidden>${text('Открыть Android-приложение','Open Android app')}</a>`);
const form = document.querySelector('#reset-form');
const password = document.querySelector('#new-password');
const repeat = document.querySelector('#repeat-password');
const retry = document.querySelector('#retry');
document.addEventListener('click', event => {
 const eye = event.target.closest('[data-reset-eye]');
 if (eye) toggleResetEye(eye, document, t);
 if (event.target.closest('[data-reset-back]')) location.assign('https://todo.m1strell.com/');
});
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
    const error = ['short','mismatch','same','reauth','failed'].includes(status) || (status === 'offline' && !form.hidden);
    document.querySelector('#status').textContent = error || status === 'saving' ? text(...messages.ready) : text(...messages[status]);
    document.querySelector('#reset-error').textContent = error ? text(...messages[status]) : '';
    if (status === 'ready') form.hidden = false;
    if (['invalid', 'success'].includes(status)) { form.hidden = true; form.reset(); }
    for (const el of form.elements) el.disabled = ['checking', 'saving'].includes(status);
    retry.hidden = status !== 'offline' || !form.hidden;
    document.querySelector('#return-message').hidden = status !== 'success';
    document.querySelector('#reset-editor').hidden = status === 'success';
    const save = document.querySelector('#save-password');
    save.setAttribute('aria-busy', String(status === 'saving'));
    save.innerHTML = status === 'saving' ? `<span class="pr-spin" aria-hidden="true"></span><span>${text('Сохраняем…','Saving…')}</span>` : resetSave(t);
    document.querySelector('#open-app').hidden = !['success', 'invalid'].includes(status) || !/Android/i.test(navigator.userAgent);
} });
retry.addEventListener('click', () => recovery.open(tokens));
form.addEventListener('submit', async event => {
    event.preventDefault();
    await recovery.save(password.value, repeat.value);
});
recovery.open(tokens);
