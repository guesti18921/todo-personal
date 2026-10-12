const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function fixture(fetcher) {
 const context = vm.createContext({});
 const local = new vm.SourceTextModule(fs.readFileSync('src/localAccount.js', 'utf8'), { context });
 const mod = new vm.SourceTextModule(fs.readFileSync('src/accountGuard.js', 'utf8'), { context });
 await local.link(() => {}); await mod.link(() => local); await mod.evaluate();
 let owner = 'a', token = 'old-token'; const deleted = [], calls = [];
 const check = mod.namespace.createAccountGuard({
  storage: { getItem: () => JSON.stringify({ user: { id: owner }, access_token: token }) },
  fetch: async (...args) => { calls.push(args); return fetcher(...args); },
  serverUrl: 'https://test.supabase.co', publicKey: 'public-key', getOwner: () => owner,
  onDeleted: async id => { deleted.push(id); },
 });
 return { check, deleted, calls, switchOwner: id => { owner = id; }, rotateToken: () => { token = 'new-token'; } };
}
const response = (status, code) => ({ status, json: async () => ({ code }) });

test('only explicit Auth user_not_found confirms deletion; offline, expired and forbidden preserve copies', async () => {
 for (const [status, code] of [[200, 'user_not_found'], [401, 'bad_jwt'], [403, 'session_not_found'], [403, 'forbidden'], [429, 'user_not_found'], [503, 'user_not_found']]) {
  const f = await fixture(async () => response(status, code));
  assert.equal(await f.check(), false); assert.equal(f.deleted.length, 0);
 }
 const offline = await fixture(async () => { throw Error('Network unavailable'); });
 assert.equal(await offline.check(), false); assert.equal(offline.deleted.length, 0);
 const missing = await fixture(async () => response(403, 'user_not_found'));
 assert.equal(await missing.check(), true); assert.deepEqual(missing.deleted, ['a']);
 assert.equal(missing.calls[0][1].cache, 'no-store');
});
test('a late deletion response cannot clear a different account or a renewed session', async () => {
 for (const change of ['switchOwner', 'rotateToken']) {
  let resolve; const f = await fixture(() => new Promise(r => { resolve = r; }));
  const pending = f.check(); await Promise.resolve(); f[change]('b');
  resolve(response(403, 'user_not_found'));
  assert.equal(await pending, false); assert.equal(f.deleted.length, 0);
 }
});
test('both real Auth wire formats recognize deletion and the request specifies API version', async () => {
 for (const body of [
  { code: 403, error_code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' },
  { code: 'user_not_found', message: 'User from sub claim in JWT does not exist' },
 ]) {
  const f = await fixture(async () => ({ status: 403, json: async () => body }));
  assert.equal(await f.check(), true); assert.deepEqual(f.deleted, ['a']);
  assert.equal(f.calls[0][1].headers['X-Supabase-Api-Version'], '2024-01-01');
 }
 const expired = await fixture(async () => ({ status: 403, json: async () => ({ code: 403, error_code: 'bad_jwt' }) }));
 assert.equal(await expired.check(), false); assert.equal(expired.deleted.length, 0);
});
test('overlapping checks share a request and failures allow retry', async () => {
 let resolve; const f = await fixture(() => new Promise(r => { resolve = r; }));
 const first = f.check(); assert.equal(f.check(), first); await Promise.resolve();
 assert.equal(f.calls.length, 1); resolve(response(503, 'unavailable')); await first;
 const retry = f.check(); await Promise.resolve(); assert.equal(f.calls.length, 2);
 resolve(response(403, 'user_not_found')); assert.equal(await retry, true);
});
