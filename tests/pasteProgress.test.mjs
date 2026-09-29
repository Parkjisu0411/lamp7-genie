import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { publishPasteProgress } from '../src/shared/pasteProgress.ts';

test('serialized MAIN progress publishes the request before yielding a browser task', async () => {
    const events = [];
    let resume;
    const context = vm.createContext({
        document: { dispatchEvent: event => events.push(event) },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        setTimeout: callback => { resume = callback; },
    });
    const pending = vm.runInContext(`(${publishPasteProgress.toString()})('mode','request','붙여넣는 중 1 / 3')`, context);
    let settled = false;
    pending.then(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, false);
    assert.deepEqual(JSON.parse(JSON.stringify(events)), [{
        type: 'genie:paste-progress',
        detail: { modeId: 'mode', requestId: 'request', text: '붙여넣는 중 1 / 3' },
    }]);
    resume();
    await pending;
    assert.equal(settled, true);
});
