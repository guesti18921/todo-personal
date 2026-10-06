// A network change must not leave synchronization waiting indefinitely.
export async function boundedFetch(input, options = {}, timeout = 15000, fetcher = globalThis.fetch) {
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeout);
    try { return await fetcher(input, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
