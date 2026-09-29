import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVisualSelection } from '../src/features/visualEdit/selection.ts';

const record = (id, type, parent = null, classes = [], tag = 'DIV', extra = {}) => ({
    location: { modelId: id, domId: id, eid: id, vid: `v-${id}` },
    parentModelId: parent, selectable: true, type, componentType: type, label: id, name: id,
    hidden: false, rendered: true,
    structure: { tag, classes, removable: true, headerRef: '', rowSpan: 1, colSpan: 1 }, ...extra,
});
function grid(id, rowCount = 3) {
    const result = [record(id, 'grid-compo', 'page', ['grid-compo']),
        record(`${id}-table`, 'table', id, [], 'TABLE'),
        record(`${id}-head`, 'thead', `${id}-table`, [], 'THEAD'),
        record(`${id}-headers`, 'grid-col-tr', `${id}-head`, ['grid-col-tr'], 'TR'),
        ...['system', 'a', 'b'].map(column => record(`${id}-h-${column}`, 'cell', `${id}-headers`,
            column === 'system' ? ['grid-col-select'] : ['grid-col-compo'], 'TH')),
        record(`${id}-body`, 'tbody', `${id}-table`, [], 'TBODY')];
    for (let row = 0; row < rowCount; row++) {
        result.push(record(`${id}-r${row}`, 'table-row', `${id}-body`, [], 'TR'));
        for (const col of ['system', 'a', 'b']) {
            const cell = `${id}-r${row}-${col}`;
            result.push(record(cell, 'cell', `${id}-r${row}`, ['grid-td'], 'TD'));
            for (const part of ['value', 'hidden']) result.push(record(`${cell}-${part}`, 'col-compo', cell, [], 'INPUT', {
                location: { modelId: `${cell}-${part}`, domId: `${cell}-${part}`, eid: col + part, vid: `${id}-${col}-${part}` },
                hidden: part === 'hidden', rendered: part !== 'hidden',
            }));
        }
    }
    return result;
}
const page = record('page', 'default', null, ['container-fluid']);
const outside = record('outside', 'col-compo', 'page');
const build = (...records) => createVisualSelection([page, outside, ...records]);

test('every Grid descendant resolves to the whole Grid, including repeated and hidden fields', () => {
    const source = grid('g'), before = JSON.stringify(source), selection = build(...source);
    for (const item of source) assert.equal(selection.canonical(item.location.modelId), 'g', item.location.modelId);
    const selected = selection.normalize(['g-r0-a-value', 'g-r2-a-value', 'g-r1-a-hidden', 'g-h-b']);
    assert.deepEqual([...selected], ['g']);
    assert.equal(selection.members('g').length, 1);
    assert.equal(selection.items(selected)[0].includesHidden, true);
    assert.equal(selection.items(selected)[0].kind, 'grid');
    assert.deepEqual([...selection.toggle(selected, 'g-r2-a-value')], []);
    assert.equal(JSON.stringify(source), before);
});

test('Grid selection remains the same unit before and after adding an outside component', () => {
    const selection = build(...grid('g'));
    const first = selection.toggleResult(new Set(), 'g-h-a');
    assert.deepEqual([...first.selected], ['g']);
    const result = selection.toggleResult(first.selected, 'outside');
    assert.deepEqual(new Set(result.selected), new Set(['g', 'outside']));
    assert.equal(result.notice, undefined, 'there is no conditional promotion anymore');
    assert.deepEqual(new Set(selection.toggle(new Set(['outside']), 'g-r2-a-value')), new Set(['outside', 'g']));
    assert.deepEqual([...selection.remove(result.selected, 'outside')], ['g']);
    assert.deepEqual(new Set(selection.remove(result.selected, 'g-h-a')), result.selected, 'a child ID cannot remove its parent via list removal');
    assert.deepEqual([...selection.remove(result.selected, 'g')], ['outside']);
});

test('separate Grids stay distinct despite shared business IDs; a parent Row wins', () => {
    const data = grid('g'); data[0].parentModelId = 'row';
    const selection = build(record('row', 'row', 'page'), ...data, ...grid('other'));
    assert.deepEqual(new Set(selection.normalize(['g-r0-a-value', 'other-r1-b-value'])), new Set(['g', 'other']));
    assert.deepEqual([...selection.normalize(['row', 'g-r0-a-value'])], ['row']);
    assert.deepEqual([...selection.toggle(new Set(['row']), 'g-r2-a-value')], []);
    assert.equal(selection.items(new Set(['row']))[0].includesHidden, true);
});

test('only actual editing units are range candidates, so a cell-only rectangle cannot select a Grid', () => {
    const selection = build(...grid('g'));
    assert.deepEqual([...selection.units.keys()], ['outside', 'g']);
    assert.deepEqual(selection.members('g').map(record => record.location.modelId), ['g']);
    assert.equal(selection.canonical('g-h-system'), 'g', 'system cells are aliases, not standalone units');
});

test('unknown cells and protected layouts outside Grid still do not promote to an arbitrary parent', () => {
    const selection = build(record('locked', 'row', 'page', ['layout-frame']), record('unknown-cell', 'cell', 'outside'));
    for (const id of ['locked', 'unknown-cell']) {
        assert.equal(selection.canonical(id), undefined);
        const result = selection.toggleResult(new Set(['outside']), id);
        assert.deepEqual([...result.selected], ['outside']);
        assert.ok(result.notice);
    }
});

test('complex, incomplete and mismatched Grid internals do not affect whole-Grid ownership', () => {
    const data = grid('g');
    data.find(record => record.location.modelId === 'g-h-a').structure.classes.push('grid-header-th', 'pivot-list-col');
    data.find(record => record.location.modelId === 'g-r2-a-value').location.vid = 'different';
    const selection = build(...data.filter(record => record.location.modelId !== 'g-r1-system'));
    assert.equal(selection.canonical('g-h-a'), 'g');
    assert.equal(selection.canonical('g-r2-a-value'), 'g');
    const missingFacts = build(...grid('g').map(({ structure, ...record }) => record));
    assert.equal(missingFacts.canonical('g-h-a'), 'g', 'a known Grid model is enough; cell pairing is not needed');
});

test('a protected Grid root never exposes otherwise selectable children', () => {
    for (const protect of [root => { root.selectable = false; }, root => { root.structure.removable = false; }]) {
        const data = grid('g'); protect(data[0]);
        const selection = build(...data);
        for (const item of data) assert.equal(selection.canonical(item.location.modelId), undefined);
        assert.deepEqual([...selection.normalize(['g-r0-a-value', 'outside'])], ['outside']);
    }
});

test('outer Grid owns nested Grids, while ordinary layout Col stays independently selectable', () => {
    const nested = grid('nested'); nested[0].parentModelId = 'g-r0-a';
    const selection = build(...grid('g'), ...nested, record('col', 'col', 'page'), record('input', 'col-compo', 'col'));
    assert.equal(selection.canonical('nested-r0-a-value'), 'g');
    assert.equal(selection.canonical('nested'), 'g');
    assert.equal(selection.units.has('nested'), false);
    assert.equal(selection.canonical('col'), 'col');
    assert.equal(selection.canonical('input'), 'input');
    assert.deepEqual([...selection.normalize(['col', 'input'])], ['col']);
});
