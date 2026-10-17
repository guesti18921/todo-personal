// Presentation only: the existing auth handlers own account and session state.
export function createAuthPresentation({ root, isRegistering, translate }) {
    const find = selector => root.querySelector(selector);
    const tabs = find('#auth-tabs'), login = find('#auth-tab-login'), signup = find('#auth-tab-register');
    const toggle = find('#auth-switch'), submit = find('#auth-submit'), google = find('#auth-google');
    const form = find('#auth-form'), password = find('#auth-password'), eye = find('#auth-password-toggle');
    const card = find('.auth-card');
    const attribute = (node, name, value) => { if (node.getAttribute(name) !== String(value)) node.setAttribute(name, String(value)); };
    function sync() {
        const registering = Boolean(isRegistering());
        if (tabs.hidden !== toggle.hidden) tabs.hidden = toggle.hidden;
        if (login.disabled !== toggle.disabled) login.disabled = toggle.disabled;
        if (signup.disabled !== toggle.disabled) signup.disabled = toggle.disabled;
        attribute(login, 'aria-pressed', !registering);
        attribute(signup, 'aria-pressed', registering);
        attribute(tabs, 'aria-label', translate('Вход или регистрация'));
        attribute(eye, 'aria-label', eye.textContent);
        attribute(password, 'placeholder', translate(registering ? 'Придумайте пароль' : 'Введите пароль'));
        attribute(find('#auth-email'), 'placeholder', 'you@example.com');
        attribute(submit, 'aria-busy', submit.disabled);
        attribute(google, 'aria-busy', google.disabled);
        card.classList.toggle('auth-card--register', registering);
    }
    function choose(registering) {
        if (toggle.disabled || toggle.hidden || isRegistering() === registering) return;
        toggle.click();
        sync();
        if (form.animate && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            form.animate([{ opacity: .35, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }],
                { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
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
