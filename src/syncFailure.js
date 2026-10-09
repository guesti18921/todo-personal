// Do not mistake an authenticated server response for a broken internet connection.
export function syncFailurePhase(error) {
    const status = Number(error?.status || error?.statusCode);
    const code = String(error?.code || '');
    if (status === 401 || ['PGRST301', 'PGRST302', 'PGRST303'].includes(code)) return 'auth';
    if (status === 403 || code === '42501') return 'permission';
    if (status === 429) return 'limited';
    if (status >= 400) return 'server';
    const message = `${error?.name || ''} ${error?.message || ''} ${error?.details || ''}`;
    if (/fetch|network|abort|timeout|timed out|load failed|connection/i.test(message)) return 'offline';
    return 'server';
}
