// Shared production markup keeps web recovery and Android visually identical.
const paths = {
 eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
 off: '<path d="m2 2 20 20M9.88 9.88a3 3 0 0 0 4.24 4.24M10.73 5.08A10.75 10.75 0 0 1 21.94 12a10.75 10.75 0 0 1-3.17 4.54M6.61 6.61A10.75 10.75 0 0 0 2.06 12a10.75 10.75 0 0 0 14.42 5.77"/>',
 lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><circle cx="12" cy="16" r="1"/><path d="M12 17v2M7 11V7a5 5 0 0 1 10 0v4"/>',
 check: '<path d="m9 12 2 2 4-4M20 16.2A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 3 16.3"/>',
 tick: '<path d="m20 6-11 11-5-5"/>'
};
export const resetIcon = name => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
export const resetFrame = content => `<section class="password-reset"><div class="pr-screen"><div class="pr-card"><div class="pr-brand"><span class="pr-mark" aria-hidden="true">//</span> TO-DO</div>${content}</div></div></section>`;
export function resetFields(t, native = false) {
 const first = native ? 'mn-new-password' : 'new-password', second = native ? 'mn-repeat-password' : 'repeat-password';
 return [[first,'Новый пароль'],[second,'Повторите пароль']].map(([id,label],index)=>`<div class="pr-field"><label class="pr-label" id="${index?'repeat-label':'password-label'}" for="${id}">${t(label)}</label><div class="pr-input"><input id="${id}" type="password" autocomplete="new-password" minlength="8" required ${index?'':'aria-describedby="password-hint"'}><button class="pr-eye" type="button" data-reset-eye="${id}" aria-controls="${id}" aria-pressed="false" aria-label="${t('Показать пароль')}">${resetIcon('eye')}</button></div>${index?'':`<span class="pr-hint" id="password-hint">${t('Не меньше 8 символов.')}</span>`}</div>`).join('');
}
export const resetSave = t => `${resetIcon('lock')}<span>${t('Сохранить пароль')}</span>`;
export const resetNote = t => `<p class="pr-note">${resetIcon('check')}${t('Один аккаунт для всех устройств')}</p>`;
export const resetSuccess = t => `<div class="pr-success" data-reset-success role="status"><div class="pr-success-mark">${resetIcon('tick')}</div><h1>${t('Пароль сохранён')}</h1><p class="pr-sub">${t('Теперь можно войти с новым паролем.')}</p><button class="pr-save" type="button" data-reset-back>${t('Вернуться ко входу')}</button></div>`;
export function toggleResetEye(button, root, t) {
 const input = root.querySelector('#'+button.dataset.resetEye), visible = input.type === 'password';
 input.type = visible ? 'text' : 'password';
 button.setAttribute('aria-pressed',String(visible));
 button.setAttribute('aria-label',t(visible ? 'Скрыть пароль' : 'Показать пароль'));
 button.innerHTML=resetIcon(visible?'off':'eye');
}
