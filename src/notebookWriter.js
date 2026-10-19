// One writer per account and browser origin. The browser releases a lock even
// when a tab crashes; a waiting tab reads storage only after taking ownership.
export function createNotebookWriter(locks = globalThis.navigator?.locks) {
    let operation = 0, owner = null, pending = null, cancel = null, unlock = null;
    function release() {
        operation++; owner = null; pending = null;
        cancel?.abort(); cancel = null;
        unlock?.(); unlock = null;
    }
    function acquire(id, onWaiting = () => {}) {
        if (owner === id && pending) return pending;
        release(); owner = id;
        if (!locks?.request) return Promise.resolve(true);
        const ticket = operation, controller = new AbortController(); cancel = controller;
        let resolve, reject;
        pending = new Promise((yes, no) => { resolve = yes; reject = no; });
        const claim = lock => {
            if (ticket !== operation || !lock) { resolve(false); return; }
            const held = new Promise(done => { unlock = done; });
            resolve(true); return held;
        };
        const failed = error => { if (ticket !== operation || error?.name === 'AbortError') resolve(false); else reject(Object.assign(new Error('notebook_lock_unavailable'), { code: 'notebook_lock_unavailable' })); };
        Promise.resolve().then(() => locks.request('todo-personal:notebook:' + id, { mode: 'exclusive', ifAvailable: true }, lock => {
            if (ticket !== operation) { resolve(false); return; }
            if (lock) return claim(lock);
            onWaiting();
            // Do not await another request inside the first lock callback.
            Promise.resolve().then(() => locks.request('todo-personal:notebook:' + id, { mode: 'exclusive', signal: controller.signal }, claim)).catch(failed);
        })).catch(failed);
        return pending;
    }
    return { acquire, release };
}
