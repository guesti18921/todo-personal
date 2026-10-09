// HTTP status belongs to the PostgREST response, not necessarily to its error.
export function syncFailurePhase(error, responseStatus) {
    const status = Number(responseStatus ?? error?.status ?? error?.statusCode);
    const code = String(error?.code || '');
    if (status === 401 || ['PGRST301', 'PGRST302', 'PGRST303'].includes(code)) return 'auth';
    if (status === 403 || code === '42501') return 'permission';
    if (status === 429) return 'limited';
    if (code === 'PGRST116') return 'account-data';
    if (status >= 500) return 'server';
    const message = `${error?.name || ''} ${error?.message || ''} ${error?.details || ''}`;
    if (status === 0 || (!status && /fetch|network|abort|timeout|timed out|load failed|connection/i.test(message))) return 'offline';
    return 'request';
}
export function syncFailureDetails(error, responseStatus) {
    const status = Number(responseStatus ?? error?.status ?? error?.statusCode);
    const code = /^[A-Z0-9_]{1,32}$/.test(error?.code || '') ? error.code : '';
    return { phase: syncFailurePhase(error, responseStatus), status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null, code };
}
