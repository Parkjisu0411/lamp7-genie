import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { createVisualSelection, fullyContains, selectionRect } from '../src/features/visualEdit/selection.ts';
import { watchVisualSelection } from '../src/features/visualEdit/background/watchSelection.ts';

const record = (id, parentModelId = null, extra = {}) => ({
    location: { modelId: id, domId: id, eid: id, vid: `v-${id}` },
    parentModelId, selectable: true, type: id, componentType: id, label: id, name: id,
    hidden: false, rendered: true, ...extra,
});
const records = [record('root', null, { selectable: false }), record('rowA', 'root'), record('col', 'rowA'),
    record('input', 'col'), record('hidden', 'col', { hidden: true, rendered: false }),
    record('label', 'col', { ownerModelId: 'input' }), record('rowB', 'root'), record('button', 'rowB'),
    record('caption', 'button', { ownerModelId: 'button', selectable: false }),
];
const selection = createVisualSelection(records);
test('marquee keeps only the outermost selected model, including hidden descendants', () => {
    const selected = selection.normalize(['rowA', 'col', 'input', 'button']);
    assert.deepEqual([...selected], ['rowA', 'button']);
    assert.deepEqual(selection.items(selected).map(({ id, includesChildren, includesHidden }) => ({ id, includesChildren, includesHidden })), [
        { id: 'rowA', includesChildren: true, includesHidden: true },
        { id: 'button', includesChildren: true, includesHidden: false },
    ]);
});
test('a child-only range never promotes to its parent; hierarchy is not inferred from bounds', () => {
    assert.deepEqual([...selection.normalize(['input', 'button'])], ['input', 'button']);
    assert.deepEqual([...selection.normalize(['col', 'input'])], ['col']);
    assert.deepEqual([...selection.normalize(['root'])], []);
});
test('click toggles a unit; adding its parent replaces descendants without resurrecting them', () => {
    let selected = selection.toggle(new Set(), 'input');
    selected = selection.toggle(selected, 'rowA');
    assert.deepEqual([...selected], ['rowA']);
    selected = selection.toggle(selected, 'input');
    assert.deepEqual([...selected], []);
    assert.deepEqual([...selection.toggle(selected, 'input')], ['input']);
});
test('linked label and caption clicks resolve to the owning component', () => {
    assert.equal(selection.canonical('label'), 'input');
    assert.equal(selection.canonical('caption'), 'button');
    assert.deepEqual([...selection.toggle(new Set(['input']), 'label')], []);
});
test('range additions preserve existing roots without toggling them or duplicating children', () => {
    assert.deepEqual([...selection.normalize(['rowA', 'input', 'button'])], ['rowA', 'button']);
    assert.deepEqual([...selection.normalize(['input', 'button', 'rowA'])], ['button', 'rowA']);
});

test('list deselection removes only the displayed root and is safe to repeat', () => {
    const selected = new Set(['rowA', 'button']);
    assert.deepEqual([...selection.remove(selected, 'rowA')], ['button']);
    assert.deepEqual([...selection.remove(selection.remove(selected, 'rowA'), 'rowA')], ['button']);
    assert.deepEqual([...selection.remove(selected, 'input')], ['rowA', 'button']);
    assert.deepEqual([...selected], ['rowA', 'button'], 'the source snapshot is not mutated');
});
test('marquee works in both directions and requires full containment, not mere overlap', () => {
    const rect = selectionRect(200, 160, 20, 10);
    assert.deepEqual(rect, { left: 20, top: 10, width: 180, height: 150 });
    assert.equal(fullyContains(rect, { left: 30, top: 20, width: 40, height: 30 }), true);
    assert.equal(fullyContains(rect, { left: 10, top: 20, width: 40, height: 30 }), false);
    assert.equal(fullyContains(rect, { left: 30, top: 20, width: 0, height: 30 }), false);
});
test('invalid ownership/ancestry cannot loop; independent equal names remain distinct', () => {
    const model = createVisualSelection([record('a', 'b', { ownerModelId: 'b' }), record('b', 'a', { ownerModelId: 'a' }), record('x'), record('y')]);
    assert.equal(model.canonical('a'), undefined);
    assert.deepEqual([...model.normalize(['a', 'x', 'y'])], ['x', 'y']);
});
test('MAIN selection watcher invalidates without selecting and cleans up on matching stop', () => {
    const doc = new EventTarget(), win = new EventTarget();
    const listeners = new Set();
    const invalidated = [];
    class CustomEvent extends Event { constructor(name, options) { super(name); this.detail = options.detail; } }
    doc.addEventListener('genie:visual-edit-invalid', e => invalidated.push(e.detail));
    const context = vm.createContext({ document: doc, window: win, CustomEvent, editor: {
        on: (names, fn) => listeners.add(fn), off: (names, fn) => listeners.delete(fn),
        select: () => assert.fail('native selection must not change'),
    } });
    assert.equal(vm.runInContext(`(${watchVisualSelection.toString()})('mode1')`, context), true);
    for (const fn of listeners) fn();
    assert.deepEqual(invalidated, ['mode1']);
    doc.dispatchEvent(new CustomEvent('genie:visual-edit-stop', { detail: 'old' }));
    assert.equal(listeners.size, 1);
    doc.dispatchEvent(new CustomEvent('genie:visual-edit-stop', { detail: 'mode1' }));
    assert.equal(listeners.size, 0);
    assert.equal(win.__lamp7GenieVisualEdit, undefined);
});
