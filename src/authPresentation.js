// Presentation only: the existing auth handlers own account and session state.
export function createAuthPresentation({ root, isRegistering, translate }) {
    const find = selector => root.querySelector(selector);
    const tabs = find('#auth-tabs'), login = find('#auth-tab-login'), signup = find('#auth-tab-register');
    const toggle = find('#auth-switch'), submit = find('#auth-submit'), google = find('#auth-google');
    const form = find('#auth-form'), password = find('#auth-password'), eye = find('#auth-password-toggle');
    const card = find('.auth-card');
    const recovery = find('#auth-recovery-form'), recoveryBack = find('#auth-recovery-back');
    const attribute = (node, name, value) => { if (node.getAttribute(name) !== String(value)) node.setAttribute(name, String(value)); };
    function sync() {
        const registering = Boolean(isRegistering());
        const recovering = !recovery.hidden;
        const notice = !find('#auth-confirm').hidden;
        card.classList.toggle('auth-card--notice', notice);
        const intro = find('.auth-card__intro');
        if (intro.hidden !== notice) intro.hidden = notice;
        attribute(root, 'aria-labelledby', notice ? 'auth-confirm-title' : 'auth-title');
        const hideTabs = toggle.hidden && !recovering;
        if (tabs.hidden !== hideTabs) tabs.hidden = hideTabs;
        if (login.disabled !== toggle.disabled) login.disabled = toggle.disabled;
        if (signup.disabled !== toggle.disabled) signup.disabled = toggle.disabled;
        attribute(login, 'aria-pressed', !registering && !recovering);
        attribute(signup, 'aria-pressed', registering && !recovering);
        attribute(tabs, 'aria-label', translate('Вход или регистрация'));
        attribute(eye, 'aria-label', eye.textContent);
        attribute(password, 'placeholder', translate(registering ? 'Придумайте пароль' : 'Введите пароль'));
        attribute(find('#auth-email'), 'placeholder', 'you@example.com');
        attribute(submit, 'aria-busy', submit.disabled);
        attribute(google, 'aria-busy', google.disabled);
        card.classList.toggle('auth-card--register', registering);
        card.classList.toggle('td-signup', registering && !recovering);
        const hint = find('#auth-password-hint'), forgotRow = find('#auth-forgot-row');
        const hideHint = !registering || recovering || form.hidden;
        if (hint.hidden !== hideHint) hint.hidden = hideHint;
        if (forgotRow.hidden !== find('#auth-forgot').hidden) forgotRow.hidden = find('#auth-forgot').hidden;
        const label = translate(submit.disabled ? 'Секунду…' : registering ? 'Создать аккаунт' : 'Войти');
        if (submit.textContent !== label) submit.textContent = label;
    }
    function choose(registering) {
        if (toggle.disabled || (!recovery.hidden && recoveryBack.disabled)) return;
        if (!recovery.hidden) recoveryBack.click();
        if (toggle.hidden || isRegistering() === registering) return;
        toggle.click();
        sync();
        if (form.animate && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            [form, find('#auth-title'), find('.auth-card__intro')].forEach(element => element.animate(
                [{ opacity: .3, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }],
                { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' }));
        }
    }
    login.addEventListener('click', () => choose(false));
    signup.addEventListener('click', () => choose(true));
    // Sync legacy flows too: confirmation, recovery, account deletion and language.
    const observer = new MutationObserver(sync);
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ['hidden', 'disabled', 'autocomplete', 'lang'] });
    sync();
    return { sync, destroy: () => observer.disconnect() };
}
