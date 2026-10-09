// Bound both connection establishment and response reading. Keep the original
// Response metadata; never log URLs, bodies or credentials on network failures.
export async function boundedFetch(input, options = {}, timeout = 15000, fetcher = globalThis.fetch) {
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
    const wrap = response => new Proxy(response, {
        get(target, key) {
            if (key === 'clone') return () => wrap(target.clone());
            const value = Reflect.get(target, key, target);
            if (['text', 'json', 'arrayBuffer', 'blob', 'formData', 'bytes'].includes(key) && typeof value === 'function') {
                return (...args) => Promise.race([value.apply(target, args), deadline]).finally(finish);
            }
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
    try {
        const response = await Promise.race([fetcher(input, { ...options, cache: options.cache || 'no-store', signal: controller.signal }), deadline]);
        if (!response || typeof response.text !== 'function') { finish(); return response; }
        return wrap(response);
    } catch (error) { finish(); throw error; }
}
