import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { deleteVisualComponents } from '../src/features/visualEdit/background/deleteComponents.ts';
import { watchVisualSelection } from '../src/features/visualEdit/background/watchSelection.ts';
import { buildSelectionPolicy } from '../src/features/visualEdit/policy.ts';

// Execute the serialized MAIN function in a separate world; no imported runtime helpers.
function fixture(options = {}) {
    const document = new EventTarget(), window = new EventTarget();
    class CustomEvent extends Event { constructor(type, init) { super(type); this.detail = init.detail; } }
    const canvas = { querySelector: () => options.editing ? {} : null };
    const frame = { contentDocument: canvas, isConnected: true };
    document.querySelector = () => frame;
    const listeners = new Map(), calls = [], removed = [];
    const nodes = new Map();
    const make = (id, parent, extra = {}) => {
        const data = { components: { models: [] }, removable: true, ...extra };
        const node = { cid: id, get: k => data[k], parent: () => parent,
            index: () => parent?.get('components').models.indexOf(node) ?? 0 };
        node.record = { location: { modelId: id, domId: id, eid: id, vid: `v-${id}` },
            type: 'row', componentType: 'row', selectable: true, parentModelId: parent?.cid ?? null,
            structure: { tag: 'DIV', classes: [], removable: data.removable }, ...extra.record };
        nodes.set(id, node);
        parent?.get('components').models.push(node);
        return node;
    };
    const wrapper = make('wrapper', null, { removable: false, record: { type: 'wrapper', selectable: false } });
    const a = make('a', wrapper), b = make('b', wrapper), c = make('c', wrapper);
    make('hidden', a, { record: { hidden: true, rendered: false } });
    let selected = a;
    const emit = name => { for (const fn of [...(listeners.get(name) ?? [])]) fn(); };
    const remove = id => {
        const node = nodes.get(id), children = node.parent().get('components').models;
        const index = children.indexOf(node);
        if (index >= 0) { children.splice(index, 1); removed.push(id); emit('component:remove'); }
    };
    const walk = (node = wrapper) => [node, ...node.get('components').models.flatMap(child => walk(child))];
    const editor = {
        getWrapper: () => wrapper, getSelected: () => selected, getSelectedAll: () => selected ? [selected] : [],
        select(node) { calls.push(['select', node?.cid]); selected = options.promote ? wrapper : node; },
        on(names, fn) { for (const name of names.split(' ')) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); } },
        off(names, fn) { for (const name of names.split(' ')) listeners.get(name)?.delete(fn); },
        runCommand(name, { component }) {
            assert.equal(name, 'core:component-delete');
            assert.equal(selected, component, 'before hook must see the singleton native selection');
            assert.equal(context._selectParentCompo, component.parent());
            assert.equal(context._selectCompoIndex, component.index());
            const id = component.cid;
            calls.push(['before', id]);
            options.before?.({ id, remove, frame, context, nodes });
            if (options.abort === id) { emit('abort:core:component-delete'); return; }
            selected = null;
            if (options.noop !== id) remove(id);
            calls.push(['after', id]);
            options.after?.({ id, remove, frame, context, nodes });
            return [component]; // Native command also returns models when no removal happened.
        },
    };
    const invalidated = [];
    document.addEventListener('genie:visual-edit-invalid', e => invalidated.push(e.detail));
    const context = vm.createContext({ document, window, CustomEvent, editor,
        ctrlKey: false, shiftKey: false, deleteBeforeEvent() {}, deleteEndEvent() {},
        selectedComponent(node) { context._selectParentCompo = node.parent(); context._selectCompoIndex = node.index(); },
        snapshot: () => options.snapshotError ? { records: [], error: 'read failed' } : { records: walk().map(n => n.record) },
    });
    vm.runInContext(`(${watchVisualSelection.toString()})('mode')`, context);
    const ids = options.ids ?? ['a', 'b', 'c'];
    const payload = { modeId: 'mode', requestId: 'delete-1', locations: ids.map(id => ({ ...nodes.get(id).record.location })) };
    document.dispatchEvent(new CustomEvent('genie:visual-edit-delete-ready', { detail: { ...payload, modelIds: ids } }));
    const run = (overrides = {}) => JSON.parse(JSON.stringify(vm.runInContext(`(${deleteVisualComponents.toString()})(payload, sources)`,
        Object.assign(context, { payload: { ...payload, ...overrides }, sources: { reader: 'function () { return snapshot(); }', policy: buildSelectionPolicy.toString() } }))));
    return { run, payload, context, nodes, walk, calls, removed, remove, frame, window, invalidated, emit, document, CustomEvent };
}

test('native command runs once per selected root with fresh parent/index; hidden descendants are included', () => {
    const f = fixture();
    const result = f.run();
    assert.equal(result.error, undefined);
    assert.deepEqual(result.deletedIds, ['a', 'b', 'c']);
    assert.deepEqual(result.remainingIds, []);
    assert.deepEqual(f.calls.filter(([name]) => name !== 'select'), [['before', 'a'], ['after', 'a'], ['before', 'b'], ['after', 'b'], ['before', 'c'], ['after', 'c']]);
    assert.deepEqual(f.walk().map(n => n.cid), ['wrapper']);
    assert.deepEqual(f.invalidated, [], 'own mutations must not terminate mode');
    f.emit('undo');
    assert.deepEqual(f.invalidated, ['mode'], 'external/native undo still invalidates');
});

test('native cascade skips an already removed selected root without calling its hooks twice', () => {
    const f = fixture({ after({ id, remove }) { if (id === 'a') remove('b'); } });
    const result = f.run();
    assert.deepEqual(result.deletedIds, ['a', 'c']);
    assert.deepEqual(result.cascadedIds, ['b']);
    assert.deepEqual(f.calls.filter(([name]) => name === 'before').map(([, id]) => id), ['a', 'c']);
});

test('native before-hook error stops immediately and retains failed and unprocessed roots', () => {
    const f = fixture({ before({ id }) { if (id === 'b') throw new Error('before failed'); } });
    const result = f.run();
    assert.deepEqual(result.deletedIds, ['a']);
    assert.deepEqual(result.remainingIds, ['b', 'c']);
    assert.equal(result.failed.id, 'b');
    assert.ok(result.error);
    assert.deepEqual(f.removed, ['a']);
});

test('native after-hook error reports the actual removals, including a cascade, and never rolls back', () => {
    const f = fixture({ after({ id, remove }) { if (id === 'a') { remove('b'); throw new Error('after failed'); } } });
    const result = f.run();
    assert.deepEqual(result.deletedIds, ['a']);
    assert.deepEqual(result.cascadedIds, ['b']);
    assert.deepEqual(result.remainingIds, ['c']);
    assert.equal(result.failed.id, 'a');
});

for (const kind of ['abort', 'noop']) test(`native ${kind} is treated as a stopped deletion even if a command returns models`, () => {
    const f = fixture({ [kind]: 'b' });
    const result = f.run();
    assert.deepEqual(result.deletedIds, ['a']);
    assert.deepEqual(result.remainingIds, ['b', 'c']);
    assert.equal(result.failed.id, 'b');
    assert.ok(!f.calls.some(([name, id]) => name === 'before' && id === 'c'));
});

test('a missing stale target is never counted as a cascade or partially processed', () => {
    const f = fixture(); f.remove('b'); f.calls.length = 0;
    const result = f.run();
    assert.ok(result.error);
    assert.deepEqual(result.deletedIds, []);
    assert.deepEqual(result.cascadedIds, []);
    assert.deepEqual(f.calls, []);
});

test('internal parts and ancestor/descendant requests are rejected before mutation', () => {
    const f = fixture({ ids: ['hidden'] });
    f.nodes.get('a').record.structure.classes = ['duration-date-compo'];
    assert.ok(f.run().error);
    assert.deepEqual(f.calls, []);
    const nested = fixture({ ids: ['a', 'hidden'] });
    assert.ok(nested.run().error);
    assert.deepEqual(nested.calls, []);
});

test('stale DOM identity and changed removable state are rejected before any native selection', () => {
    for (const change of [f => { f.nodes.get('b').record.location.eid = 'different'; }, f => { const b = f.nodes.get('b'), get = b.get; b.get = k => k === 'removable' ? false : get(k); }]) {
        const f = fixture(); change(f);
        assert.ok(f.run().error);
        assert.deepEqual(f.calls, []);
    }
});

test('mode and request tokens are single-use; unarmed requests cannot execute', () => {
    const f = fixture({ ids: ['a'] });
    assert.ok(f.run({ requestId: 'forged' }).error);
    assert.deepEqual(f.calls, []);
    assert.equal(f.run().error, undefined);
    const count = f.calls.length;
    assert.ok(f.run().error);
    assert.equal(f.calls.length, count);
});

test('pending DOM invalidation disposes the bridge before native selection', () => {
    const f = fixture();
    f.document.addEventListener('genie:visual-edit-delete-mutating', () => f.window.__lamp7GenieVisualEdit.dispose());
    assert.ok(f.run().error);
    assert.deepEqual(f.calls, []);
});

test('frame changes during native hooks stop subsequent targets', () => {
    const f = fixture({ after({ frame }) { frame.isConnected = false; } });
    const result = f.run();
    assert.deepEqual(result.deletedIds, ['a']);
    assert.deepEqual(result.remainingIds, ['b', 'c']);
    assert.ok(result.error);
});

test('modifier keys, text editing, or native selection promotion prevent removal', () => {
    for (const options of [{ editing: true }, { promote: true }, { ctrl: true }]) {
        const f = fixture(options); f.context.ctrlKey = !!options.ctrl;
        assert.ok(f.run().error);
        assert.deepEqual(f.removed, []);
    }
});

test('missing native integration never falls back to raw model removal', () => {
    const f = fixture(); f.context.deleteBeforeEvent = undefined;
    assert.ok(f.run().error);
    assert.deepEqual(f.calls, []);
});

test('failed snapshots do not call native commands', () => {
    const f = fixture({ snapshotError: true });
    assert.ok(f.run().error);
    assert.deepEqual(f.calls, []);
    assert.equal(f.run().records, undefined);
});
