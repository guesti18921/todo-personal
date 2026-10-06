// OAuth launches only after a tap. No provider tokens or secrets are logged.
export function authErrorMessage(error) {
    const legacyCodes = { 'Invalid login credentials': 'invalid_credentials', 'Email not confirmed': 'email_not_confirmed' };
    const code = error?.code || legacyCodes[error?.message] || '';
    if (code === 'invalid_credentials') return 'Неверная почта или пароль. Проверьте их и попробуйте снова.';
    if (code === 'email_not_confirmed') return 'Подтвердите почту: откройте ссылку из письма, затем войдите.';
    if (code === 'user_already_exists') return 'Аккаунт с этой почтой уже существует. Попробуйте войти.';
    if (code === 'weak_password') return 'Придумайте более надёжный пароль: минимум 6 символов.';
    if (code.includes('rate_limit') || error?.status === 429) return 'Слишком много попыток. Подождите немного и попробуйте снова.';
    if (code === 'provider_disabled' || code === 'validation_failed') return 'Этот способ входа сейчас недоступен. Используйте почту и пароль.';
    return 'Не удалось войти. Проверьте соединение и попробуйте снова.';
}

export function createGoogleLogin({ auth, native, redirectTo, serverUrl, open, onStatus }) {
    let pending = null;
    function start() {
        if (pending) return pending;
        onStatus('pending');
        pending = (async () => {
            await Promise.resolve(); // Assign pending before even a synchronous SDK failure.
            try {
                const { data, error } = await auth.signInWithOAuth({ provider: 'google', options: {
                    redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' }
                } });
                if (error) throw error;
                const url = new URL(data?.url);
                if (url.origin !== new URL(serverUrl).origin || url.protocol !== 'https:' || !url.pathname.endsWith('/auth/v1/authorize')) throw new Error('Invalid authorization URL');
                await open(url.href, native);
                onStatus('opened');
                return true;
            } catch (error) {
                onStatus('error', authErrorMessage(error));
                return false;
            } finally { pending = null; }
        })();
        return pending;
    }
    return { start };
}

export async function googleProviderEnabled({ fetch, serverUrl, publicKey }) {
    const response = await fetch(`${serverUrl}/auth/v1/settings`, { headers: { apikey: publicKey }, cache: 'no-store' });
    if (!response.ok) throw new Error('Could not check sign-in methods');
    return (await response.json()).external?.google === true;
}
