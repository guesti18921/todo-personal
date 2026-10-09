const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
async function fixture() {
    const m = new vm.SourceTextModule(readFileSync('src/localDataReset.js', 'utf8'), { context: vm.createContext({}) });
    await m.link(() => {}); await m.evaluate();
    return m.namespace.offerDeletedAccountReset;
}
test('web and a newly signed-in account never offer a destructive reset', async () => {
    const offer = await fixture(); let calls = 0;
    const plugin = { offerReset() { calls++; throw Error('must not run'); } };
    await offer({ native: false, plugin, getOwner: () => null });
    await offer({ native: true, plugin, getOwner: () => 'different-account' });
    assert.equal(calls, 0);
});
test('native reset explicitly warns about unsynced other-account copies; declining is retained', async () => {
    const offer = await fixture(); let options;
    const result = await offer({ native: true, getOwner: () => null, plugin: {
        async offerReset(value) { options = value; return { resetRequested: false }; }
    } });
    assert.match(options.message, /несинхронизированные записи/);
    assert.match(options.message, /Облачные данные других аккаунтов сохранятся/);
    assert.equal(result.resetRequested, false); assert.equal(result.offered, true);
});
test('native reset failure remains distinguishable from successful account deletion', async () => {
    const offer = await fixture();
    await assert.rejects(offer({ native: true, getOwner: () => null, plugin: {
        async offerReset() { throw Error('reset_failed'); }
    } }), /reset_failed/);
});
