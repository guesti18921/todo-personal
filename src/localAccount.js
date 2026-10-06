// Keep the existing Supabase storage key, so browser sessions are not reset.
export const AUTH_STORAGE_KEY = 'sb-ihvwqqvndmwtislvgamd-auth-token';

export function readCachedAccount() {
    try {
        const session = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
        const id = session?.user?.id;
        if (typeof id !== 'string' || !id || !session.access_token || !session.refresh_token) return null;
        return { id, email: typeof session.user.email === 'string' ? session.user.email : '' };
    } catch (_) { return null; }
}
