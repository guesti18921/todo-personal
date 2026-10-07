// Resume password sign-in on the originating device after email verification.
// Credentials live only in this short-lived closure; never persist or log them.
export const EMAIL_CONFIRMATION_URL = 'https://guesti18921.github.io/todo-personal/email-confirmed.html';

export function createEmailConfirmation({ auth, applySession, onStatus, visible = () => true,
    now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
    let pending = null, timer = null, busy = false, lastAttempt = -Infinity;
    function stop() {
        pending = null;
        if (timer !== null) clearTimer(timer);
        timer = null;
    }
    function later() {
        if (pending && timer === null) timer = setTimer(() => { timer = null; check(); }, 30000);
    }
    async function check() {
        if (!pending || busy) return;
        const attempt = pending;
        if (now() >= attempt.expires) { stop(); onStatus('expired'); return; }
        if (!visible() || now() - lastAttempt < 30000) { later(); return; }
        busy = true; lastAttempt = now();
        try {
            const result = await auth.signInWithPassword({ email: attempt.email, password: attempt.password });
            if (pending !== attempt) return;
            if (result.data?.session && !result.error) {
                stop();
                const applied = await applySession(result.data.session);
                onStatus(applied?.error ? 'failed' : 'success');
            }
            else {
                const error = result.error;
                const code = error?.code;
                if (code === 'email_not_confirmed' || error?.message === 'Email not confirmed') onStatus('waiting');
                else if (error?.status === 429 || code?.includes('rate_limit')) { stop(); onStatus('limited'); }
                else if (code === 'invalid_credentials' || error?.message === 'Invalid login credentials') { stop(); onStatus('failed'); }
                else onStatus('offline');
            }
        } catch (_) { if (pending === attempt) onStatus('offline'); }
        finally { busy = false; later(); }
    }
    return {
        start(email, password) {
            stop(); lastAttempt = now();
            pending = { email, password, expires: now() + 15 * 60000 };
            onStatus('waiting'); later();
        },
        check, stop,
        isWaiting: () => Boolean(pending)
    };
}
