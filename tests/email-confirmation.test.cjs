const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
async function setup() {
 const mod = new vm.SourceTextModule(fs.readFileSync('src/emailConfirmation.js', 'utf8'), { context: vm.createContext({ Date, setTimeout, clearTimeout }) });
 await mod.link(() => {}); await mod.evaluate();
 let clock = 0, visible = true, response = { error: { code: 'email_not_confirmed' } }, calls = [], applied = [], statuses = [], timers = new Map(), sequence = 0;
 const engine = mod.namespace.createEmailConfirmation({ auth: { async signInWithPassword(credentials) { calls.push(credentials); return typeof response === 'function' ? response() : response; } },
  applySession: async session => { applied.push(session); return {}; }, onStatus: value => statuses.push(value),
  visible: () => visible, now: () => clock, setTimer: fn => { timers.set(++sequence, fn); return sequence; }, clearTimer: id => timers.delete(id) });
 return { engine, calls, applied, statuses, timers, set clock(v) { clock = v; }, set visible(v) { visible = v; }, set response(v) { response = v; } };
}
test('confirmation on another device resumes only the originating sign-in after server confirmation', async () => {
 const s = await setup(); s.engine.start('test@example.com', 'memory-only');
 await s.engine.check(); assert.equal(s.calls.length, 0, 'no immediate repeated login');
 s.clock = 30000; await s.engine.check(); assert.equal(s.calls.length, 1); assert.equal(s.applied.length, 0);
 s.response = { data: { session: { access_token: 'test', refresh_token: 'test-refresh' } } };
 s.clock = 60000; await s.engine.check(); assert.equal(s.applied.length, 1); assert.equal(s.engine.isWaiting(), false); assert.equal(s.timers.size, 0);
});
test('cancelled or overlapping pending requests never install a stale session', async () => {
 const s = await setup(); let resolve;
 s.response = () => new Promise(r => { resolve = r; });
 s.engine.start('first@example.com', 'first'); s.clock = 30000;
 const request = s.engine.check(); await s.engine.check(); assert.equal(s.calls.length, 1);
 s.engine.stop(); resolve({ data: { session: { access_token: 'stale' } } }); await request;
 assert.equal(s.applied.length, 0); assert.equal(s.timers.size, 0);
});
test('background, expiry, network failure and rate limiting do not create request loops', async () => {
 const s = await setup(); s.engine.start('test@example.com', 'secret'); s.clock = 30000;
 s.visible = false; await s.engine.check(); assert.equal(s.calls.length, 0);
 s.visible = true; s.response = () => { throw Error('offline'); }; await s.engine.check(); assert.equal(s.statuses.at(-1), 'offline');
 await s.engine.check(); assert.equal(s.calls.length, 1);
 s.clock = 60000; s.response = { error: { status: 429 } }; await s.engine.check(); assert.equal(s.engine.isWaiting(), false); assert.equal(s.statuses.at(-1), 'limited');
 s.engine.start('test@example.com', 'secret'); s.clock = 1000000; await s.engine.check(); assert.equal(s.statuses.at(-1), 'expired'); assert.equal(s.engine.isWaiting(), false);
});
