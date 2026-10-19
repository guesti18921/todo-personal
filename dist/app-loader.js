// Never start authentication, sync or native bridges inside an embedded page.
(() => {
    if (window.top !== window.self) {
        const english = !navigator.language.toLowerCase().startsWith('ru');
        const main = document.createElement('main'), title = document.createElement('h1'), link = document.createElement('a');
        title.textContent = english ? 'Open TO-DO Personal directly' : 'Откройте TO-DO Personal отдельно';
        link.textContent = english ? 'Open notebook' : 'Открыть блокнот';
        link.href = location.origin + location.pathname; link.target = '_top'; link.rel = 'noopener noreferrer';
        main.append(title, link); document.body.replaceChildren(main); document.documentElement.hidden = false;
        return;
    }
    const entry = document.currentScript?.dataset.entry;
    const url = new URL(entry || '', location.href);
    if (!entry || url.origin !== location.origin || !/\/(main|password-reset)\.js$/.test(url.pathname)) return;
    const script = document.createElement('script'); script.src = url.href; document.head.append(script);
})();
