import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { createVisualSelection, fullyContains, marqueeContainsComponent, selectionRect } from '../src/features/visualEdit/selection.ts';
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
test('wide components need only their visible width at left, middle and right scroll positions', () => {
    for (const left of [170, 10, -150]) {
        const full = { left, top: 120, width: 1608, height: 185 };
        const visible = {
            left: Math.max(160, left),
            top: 120,
            width: Math.min(1660, left + 1608) - Math.max(160, left),
            height: 185,
        };
        const range = selectionRect(visible.left - 5, 115, visible.left + visible.width + 5, 310);
        assert.equal(marqueeContainsComponent(range, full, visible), true);
        assert.equal(
            marqueeContainsComponent({ ...range, left: visible.left + 5 }, full, visible),
            false,
            'partial coverage of visible width is not enough',
        );
        assert.equal(
            marqueeContainsComponent(range, full, { ...visible, width: 0 }),
            false,
            'fully offscreen items are excluded',
        );
    }
});

test('vertical clipping and partial height still exclude a tall parent, even with a large marquee', () => {
    const full = { left: -100, top: 50, width: 1000, height: 200 };
    const visible = { left: 100, top: 50, width: 600, height: 200 };
    assert.equal(marqueeContainsComponent(selectionRect(90, 60, 710, 250), full, visible), false);
    const all = selectionRect(0, 0, 1000, 500);
    assert.equal(marqueeContainsComponent(all, full, { ...visible, top: 60, height: 190 }), false);
    assert.equal(marqueeContainsComponent(all, full, { ...visible, height: 190 }), false);
});

test('reverse drag and scaled coordinates enclose visible width without changing ordinary selection', () => {
    const full = { left: 40.25, top: 80.5, width: 1200.5, height: 148.25 };
    const visible = { ...full, left: 160.5, width: 720.25 };
    const range = selectionRect(881, 229, 160, 80);
    assert.equal(marqueeContainsComponent(range, full, visible), true);
    assert.equal(marqueeContainsComponent(range, full, full), false);
    const small = { left: 180, top: 100, width: 80, height: 40 };
    assert.equal(marqueeContainsComponent(range, small, small), fullyContains(range, small));
});

test('a clipped Row wins over enclosed children and retains hidden and offscreen descendants', () => {
    const range = selectionRect(100, 10, 700, 110);
    const full = { left: 0, top: 20, width: 1000, height: 80 };
    const visible = { left: 100, top: 20, width: 600, height: 80 };
    const candidates = marqueeContainsComponent(range, full, visible)
        ? ['rowA', 'col', 'input']
        : ['col', 'input'];
    const selected = selection.combine(candidates).selected;
    assert.deepEqual([...selected], ['rowA']);
    assert.equal(selection.items(selected)[0].includesHidden, true);
    assert.deepEqual(
        selection.members('rowA').map((r) => r.location.modelId),
        ['rowA'],
    );
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
