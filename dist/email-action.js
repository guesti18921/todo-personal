(() => {
    'use strict';
    const fragment = window.todoEmailAction || '';
    delete window.todoEmailAction;
    // A second email can reuse this tab without causing a full navigation.
    window.addEventListener('hashchange', () => {
        if (window.location.hash) window.location.reload();
    });
    const en = !navigator.language.toLowerCase().startsWith('ru');
    document.documentElement.lang = en ? 'en' : 'ru';
    const text = (ru, english) => en ? english : ru;
    const heading = document.querySelector('#heading');
    const message = document.querySelector('#message');
    const button = document.querySelector('#continue');
    const back = document.querySelector('#back');
    back.textContent = text('Вернуться в блокнот', 'Return to notebook');
    let target = null;
    try {
        if (window.top !== window.self || fragment.length > 8192) throw new Error();
        const params = new URLSearchParams(fragment.replace(/^#/, ''));
        if (params.getAll('confirmation_url').length !== 1 || [...params.keys()].length !== 1) throw new Error();
        const url = new URL(params.get('confirmation_url'));
        if (url.origin !== 'https://ihvwqqvndmwtislvgamd.supabase.co' ||
            url.pathname !== '/auth/v1/verify' || url.username || url.password || url.hash ||
            url.searchParams.getAll('type').length !== 1 ||
            !['signup', 'recovery'].includes(url.searchParams.get('type')) ||
            url.searchParams.getAll('token').length !== 1 ||
            !/^[a-zA-Z0-9_-]{16,2048}$/.test(url.searchParams.get('token'))) throw new Error();
        if (url.searchParams.has('redirect_to')) {
            if (url.searchParams.getAll('redirect_to').length !== 1) throw new Error();
            const redirect = new URL(url.searchParams.get('redirect_to'));
            const web = redirect.origin === 'https://todo.m1strell.com' &&
                ['/', '/reset-password.html', '/email-confirmed.html', '/mobile-preview/', '/mobile-preview/index.html'].includes(redirect.pathname);
            const legacy = redirect.origin === 'https://guesti18921.github.io' &&
                ['/todo-personal/', '/todo-personal/reset-password.html', '/todo-personal/email-confirmed.html'].includes(redirect.pathname);
            const native = redirect.protocol === 'todopersonal:' && redirect.hostname === 'auth-callback' &&
                !redirect.port && ['', '/'].includes(redirect.pathname);
            if (redirect.username || redirect.password || redirect.hash || !(web || legacy || native)) throw new Error();
        }
        target = url.href;
        const recovery = url.searchParams.get('type') === 'recovery';
        heading.textContent = recovery ? text('Создать новый пароль', 'Create a new password') : text('Подтвердите почту', 'Confirm your email');
        message.textContent = text('Нажмите кнопку, чтобы продолжить. Это защитит одноразовую ссылку от автоматической проверки почтовым сервисом.', 'Press the button to continue. This protects your single-use link from automatic checks by your email provider.');
        button.textContent = text('Продолжить', 'Continue');
        button.hidden = false;
    } catch (_) {
        heading.textContent = text('Не удалось открыть ссылку', 'Unable to open the link');
        message.textContent = text('Ссылка отсутствует или повреждена. Запросите новое письмо в приложении.', 'The link is missing or damaged. Request a new email in the app.');
        back.hidden = false;
    }
    // No fetch, SDK, storage or token verification until the recipient continues.
    button.addEventListener('click', () => {
        if (!target || button.disabled) return;
        button.disabled = true;
        window.location.replace(target);
    });
})();
