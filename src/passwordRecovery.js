export const PASSWORD_RESET_URL = 'https://guesti18921.github.io/todo-personal/reset-password.html';

export function readRecoveryTokens(fragment) {
    const p = new URLSearchParams(fragment.replace(/^#/, ''));
    if (p.has('error') || p.has('error_code') || p.get('type') !== 'recovery') return null;
    const access_token = p.get('access_token'), refresh_token = p.get('refresh_token');
    return access_token && refresh_token ? { access_token, refresh_token } : null;
}

// This client belongs only to the reset page, never to the notebook account.
export function createPasswordRecovery({ auth, onStatus }) {
    let ready = false, busy = false, done = false;
    return {
        async open(tokens) {
            if (busy || ready || done) return false;
            if (!tokens) { onStatus('invalid'); return false; }
            busy = true;
            onStatus('checking');
            try {
                const result = await auth.setSession(tokens);
                if (result.error || !result.data?.session) { onStatus('invalid'); return false; }
                ready = true;
                onStatus('ready');
                return true;
            } catch (_) { onStatus('offline'); return false; }
            finally { busy = false; }
        },
        async save(password, repeat) {
            if (!ready || busy || done) return false;
            if (Array.from(password).length < 8) { onStatus('short'); return false; }
            if (password !== repeat) { onStatus('mismatch'); return false; }
            busy = true;
            onStatus('saving');
            try {
                const result = await auth.updateUser({ password });
                if (result.error) {
                    const code = result.error.code;
                    onStatus(code === 'same_password' ? 'same' : code === 'weak_password' ? 'short'
                        : ['session_not_found', 'refresh_token_not_found', 'bad_jwt'].includes(code) ? 'invalid'
                        : code === 'reauthentication_needed' ? 'reauth' : 'failed');
                    return false;
                }
                if (!result.data?.user) { onStatus('failed'); return false; }
                done = true;
                ready = false;
                // Clear only this temporary recovery session. The notebook is independent.
                try { await auth.signOut({ scope: 'local' }); } catch (_) { /* memory-only client */ }
                onStatus('success');
                return true;
            } catch (_) { onStatus('offline'); return false; }
            finally { busy = false; }
        }
    };
}
