// Bound both connection establishment and response reading. Keep the original
// Response metadata; never log URLs, bodies or credentials on network failures.
export async function boundedFetch(input, options = {}, timeout = 15000, fetcher = globalThis.fetch) {
    // Interactive password login should not keep the button spinning while a
    // broken connection waits on the general data-request deadline.
    const passwordRequest = /\/auth\/v1\/token\?/.test(String(input?.url || input))
        && new URL(String(input?.url || input)).searchParams.get('grant_type') === 'password';
    if (passwordRequest) timeout = Math.min(timeout, 10000);
    const controller = new AbortController();
    let rejectDeadline;
    const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
    const abort = () => {
        const error = options.signal?.reason || Object.assign(new Error('Request aborted'), { name: 'AbortError' });
        controller.abort(error); rejectDeadline(error);
    };
    const timer = setTimeout(() => {
        const error = Object.assign(new Error('Request timed out'), { name: 'AbortError' });
        controller.abort(error); rejectDeadline(error);
    }, timeout);
    const finish = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); };
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    const wrap = response => {
        // GoTrue includes the error code in its response headers. A received
        // rejection is final even if the error body is delayed or interrupted.
        const headerCode = passwordRequest && !response.ok && response.status === 400
            ? response.headers?.get('x-sb-error-code') : null;
        const rejection = ['invalid_credentials', 'email_not_confirmed'].includes(headerCode)
            ? { code: headerCode, error_code: headerCode, message: headerCode === 'invalid_credentials' ? 'Invalid login credentials' : 'Email not confirmed' } : null;
        if (rejection) {
            finish();
        }
        return new Proxy(response, {
        get(target, key) {
            if (rejection && ['json', 'text'].includes(key)) return async () => {
                try { target.body?.cancel()?.catch(() => {}); } catch (_) { /* No credentials are logged. */ }
                return key === 'json' ? { ...rejection } : JSON.stringify(rejection);
            };
            if (key === 'clone') return () => wrap(target.clone());
            const value = Reflect.get(target, key, target);
            if (['text', 'json', 'arrayBuffer', 'blob', 'formData', 'bytes'].includes(key) && typeof value === 'function') {
                return (...args) => Promise.race([value.apply(target, args), deadline]).catch(error => {
                    if (passwordRequest && !target.ok) throw Object.assign(new Error('Sign-in response could not be read'), { status: target.status, code: headerCode || undefined });
                    throw error;
                }).finally(finish);
            }
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
    };
    try {
        const response = await Promise.race([fetcher(input, { ...options, cache: options.cache || 'no-store', signal: controller.signal }), deadline]);
        if (!response || typeof response.text !== 'function') { finish(); return response; }
        return wrap(response);
    } catch (error) { finish(); throw error; }
}
