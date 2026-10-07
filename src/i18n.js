import english from './translations.en.js';

export const LANGUAGE_KEY = 'todo-personal:language';
export const LANGUAGE_METADATA = 'todo_personal_language';
const valid = value => value === 'ru' || value === 'en';
export function detectLanguage(languages = []) {
    const first = String(languages[0] || 'en').toLowerCase().split(/[-_]/)[0];
    return valid(first) ? first : 'en';
}
const pattern = new RegExp(Object.keys(english).sort((a, b) => b.length - a.length).map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
export function translate(text, language) {
    if (language !== 'en' || typeof text !== 'string') return text;
    return english[text] ?? text.replace(pattern, key => english[key]);
}

export function createLanguagePreferences({ storage, languages = [], updateUser = null, onChange = () => {}, onStatus = () => {} }) {
    let language = detectLanguage(languages), account = null, explicitLoginChoice = false, syncing = false;
    const accountKey = id => `${LANGUAGE_KEY}:${id}`;
    const read = key => { try { return JSON.parse(storage.getItem(key)); } catch (_) { return null; } };
    const saved = read(LANGUAGE_KEY);
    if (valid(saved?.language)) language = saved.language;
    function apply(next) { if (next !== language) { language = next; onChange(next); } }
    function bindUser(user, { cached = false } = {}) {
        const id = user?.id || null;
        if (!id) { account = null; return; }
        const changing = id !== account;
        account = id;
        const local = read(accountKey(id)), remote = user.user_metadata?.[LANGUAGE_METADATA];
        if (changing && explicitLoginChoice) {
            try { storage.setItem(accountKey(id), JSON.stringify({ language, dirty: true })); } catch (_) { onStatus('error'); }
            explicitLoginChoice = false;
        } else if (local?.dirty && valid(local.language)) apply(local.language);
        else if (valid(remote)) {
            apply(remote);
            try { storage.setItem(accountKey(id), JSON.stringify({ language: remote, dirty: false })); } catch (_) { /* UI still usable */ }
        } else if (valid(local?.language)) apply(local.language);
        else if (!cached) {
            try { storage.setItem(accountKey(id), JSON.stringify({ language, dirty: true })); } catch (_) { /* retry on a later choice */ }
        }
    }
    function choose(next) {
        if (!valid(next)) return false;
        const value = JSON.stringify({ language: next, dirty: Boolean(account) });
        try {
            // Write before changing the UI so a storage failure leaves the current choice intact.
            storage.setItem(account ? accountKey(account) : LANGUAGE_KEY, value);
            if (account) { try { storage.setItem(LANGUAGE_KEY, JSON.stringify({ language: next })); } catch (_) {} }
        } catch (_) { onStatus('error'); return false; }
        if (!account) explicitLoginChoice = true;
        apply(next);
        onStatus(account ? 'pending' : 'saved');
        return true;
    }
    async function sync() {
        if (syncing || !account || !updateUser) return;
        const id = account, pending = read(accountKey(id));
        if (!pending?.dirty || !valid(pending.language)) return;
        syncing = true;
        try {
            const result = await updateUser({ data: { [LANGUAGE_METADATA]: pending.language } });
            if (account !== id || result?.error || result?.data?.user?.id !== id) return;
            const latest = read(accountKey(id));
            if (latest?.language !== pending.language) return;
            storage.setItem(accountKey(id), JSON.stringify({ language: pending.language, dirty: false }));
            if (account === id) onStatus('saved');
        } catch (_) { /* Keep the local choice pending while offline. */ }
        finally { syncing = false; }
    }
    return { getLanguage: () => language, bindUser, choose, sync };
}

let current = detectLanguage(typeof navigator === 'undefined' ? ['ru'] : navigator.languages || [navigator.language]);
try { const saved = JSON.parse(localStorage.getItem(LANGUAGE_KEY)); if (valid(saved?.language)) current = saved.language; } catch (_) {}
export const getLanguage = () => current;
export function setLanguage(language) { if (valid(language)) current = language; }
export const t = text => translate(text, current);
// Translate only the static portions of a UI template; interpolations can contain user text.
export function ui(parts, ...values) { return parts.map((part, index) => t(part) + (index < values.length ? values[index] : '')).join(''); }
