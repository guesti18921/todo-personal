export const AUTH_REDIRECT_URL = 'todopersonal://auth-callback';

// Only the dedicated auth URI may supply credentials. Never log callback URLs.
export function parseAuthLink(value) {
    let url;
    try { url = new URL(value); } catch (_) { return null; }
    if (url.protocol !== 'todopersonal:' || url.hostname !== 'auth-callback' ||
        url.username || url.password || url.port || !['', '/'].includes(url.pathname)) return null;
    const params = new URLSearchParams(url.hash ? url.hash.slice(1) : url.search.slice(1));
    if (!url.hash && !url.search) return null; // Open-app link contains no credentials.
    if (params.has('error') || params.has('error_code')) return { error: true };
    if (params.get('type') === 'recovery') return { error: true };
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) return { session: { access_token, refresh_token } };
    const code = params.get('code');
    return code ? { code } : { error: true };
}

export function createAuthLinkHandler({ auth, onStatus }) {
    let pendingUrl = null, pending = null, completedUrl = null;
    return function handleAuthLink(url) {
        const link = parseAuthLink(url);
        if (!link) return Promise.resolve(false);
        if (url === completedUrl) return Promise.resolve(true);
        if (url === pendingUrl) return pending;
        // Do not race two account changes from overlapping OS events.
        if (pending) return Promise.resolve(false);
        pendingUrl = url;
        pending = Promise.resolve().then(async () => {
            onStatus('pending');
            try {
                if (link.error) throw new Error('Invalid confirmation');
                const result = link.session
                    ? await auth.setSession(link.session)
                    : await auth.exchangeCodeForSession(link.code);
                if (result.error || !result.data?.session) throw new Error('Confirmation failed');
                completedUrl = url;
                onStatus('success');
                return true;
            } catch (_) {
                onStatus('error');
                return false;
            } finally { pendingUrl = null; pending = null; }
        });
        return pending;
    };
}
