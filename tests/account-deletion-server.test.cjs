const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function setup({ user = { id: 'verified-owner' }, authError = null, deletionError = null, fail = false } = {}) {
 let handler; const calls = [];
 const createClient = (url, key, options) => {
  calls.push({ kind: 'client', url, key, options });
  return { auth: {
   async getUser(token) { calls.push({ kind: 'verify', token }); if (fail) throw Error('SECRET ERROR'); return { data: { user }, error: authError }; },
   admin: { async deleteUser(id, soft) { calls.push({ kind: 'delete', id, soft }); return { error: deletionError }; } },
  } };
 };
 const context = vm.createContext({ Request, Response, JSON, Object,
  Deno: { env: { get: name => name === 'SUPABASE_URL' ? 'https://test.supabase.co' : 'SERVER-ONLY-KEY' }, serve: callback => { handler = callback; } },
 });
 const sdk = new vm.SyntheticModule(['createClient'], function () { this.setExport('createClient', createClient); }, { context });
 const mod = new vm.SourceTextModule(fs.readFileSync('supabase/functions/delete-account/index.ts', 'utf8'), { context });
 await mod.link(() => sdk); await mod.evaluate();
 const request = (body = { confirm: 'DELETE' }, headers = { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' }, method = 'POST') =>
  handler(new Request('https://test.supabase.co/functions/v1/delete-account', { method, headers, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }));
 return { request, calls };
}
test('deletion requires a verified user and deletes only that user with hard deletion', async () => {
 const s = await setup(); const response = await s.request();
 assert.equal(response.status, 200); assert.equal((await response.json()).code, 'account_deleted');
 assert.deepEqual(s.calls.filter(c => c.kind === 'delete'), [{ kind: 'delete', id: 'verified-owner', soft: false }]);
 const client = s.calls.find(c => c.kind === 'client');
 assert.equal(client.options.auth.persistSession, false); assert.equal(client.options.auth.autoRefreshToken, false);
 assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('missing and invalid authentication never reaches account deletion', async () => {
 for (const settings of [{ user: null }, { authError: { message: 'invalid' } }, { fail: true }]) {
  const s = await setup(settings); const response = await s.request();
  assert.ok([401, 503].includes(response.status)); assert.equal(s.calls.some(c => c.kind === 'delete'), false);
  assert.doesNotMatch(await response.text(), /SECRET|SERVER-ONLY|valid-token/);
 }
 const s = await setup(); assert.equal((await s.request({}, { 'Content-Type': 'application/json' })).status, 401);
 assert.equal(s.calls.length, 0);
});
test('client-selected identities, missing confirmation and malformed requests cannot delete accounts', async () => {
 for (const body of [{ confirm: 'DELETE', user_id: 'victim' }, { confirm: 'DELETE', id: 'victim' }, {}, { confirm: true }, null, 'bad json', 'x'.repeat(257)]) {
  const s = await setup(); assert.equal((await s.request(body)).status, 400); assert.equal(s.calls.length, 0);
 }
 const s = await setup(); assert.equal((await s.request({}, { Authorization: 'Bearer token' })).status, 415);
 assert.equal((await s.request(undefined, undefined, 'GET')).status, 405);
 assert.equal((await s.request(undefined, {}, 'OPTIONS')).status, 204); assert.equal(s.calls.length, 0);
});
test('failed Auth deletion never reports success or exposes server details', async () => {
 const s = await setup({ deletionError: { message: 'SERVER-ONLY-KEY database details' } });
 const response = await s.request(); assert.equal(response.status, 503);
 assert.deepEqual(await response.json(), { code: 'deletion_failed' });
});
