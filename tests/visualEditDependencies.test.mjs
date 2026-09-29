import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVisualSelection } from '../src/features/visualEdit/selection.ts';

const record = (id, parentModelId, type, classes = [], extra = {}) => ({
    location: { modelId: id, domId: id, eid: id, vid: `v-${id}` },
    parentModelId, type, componentType: type, selectable: true,
    structure: { tag: 'DIV', classes, removable: true },
    label: '', name: id, hidden: false, rendered: true, ...extra,
});
const page = record('page', null, 'default', ['container-fluid']);
const row = record('row', 'page', 'row');
const build = (...records) => createVisualSelection([page, row, ...records]);

test('Tree and Manual Tree nodes select the complete tree including sibling child lists and hidden nodes', () => {
    for (const type of ['tree-container', 'manual-tree-container']) {
        const nodeType = type === 'tree-container' ? 'tree-node' : 'manual-tree-node';
        const records = [record('tree', 'row', type), record('list', 'tree', 'none'),
            record('li', 'list', 'none'), record('node', 'li', nodeType),
            record('children', 'li', 'none'), record('child-node', 'children', nodeType, [], { hidden: true }),
            record('icon', 'node', 'none', [], { selectable: false })];
        const before = JSON.stringify(records), selection = build(...records);
        for (const { location } of records) assert.equal(selection.canonical(location.modelId), 'tree');
        assert.deepEqual([...selection.units.keys()], ['row', 'tree'], 'a node-only marquee has no candidate');
        assert.deepEqual(selection.members('tree').map(r => r.location.modelId), ['tree']);
        assert.deepEqual([...selection.toggle(new Set(), 'icon')], ['tree']);
        assert.deepEqual([...selection.toggle(new Set(['tree']), 'child-node')], []);
        assert.equal(selection.items(new Set(['tree']))[0].includesHidden, true);
        assert.deepEqual([...selection.normalize(['row', 'node'])], ['row']);
        assert.equal(JSON.stringify(records), before);
    }
});

test('duration from/to are one unit per actual container, never paired by eID suffix or shared ID', () => {
    const records = ['first', 'second'].flatMap(id => [record(id, 'row', 'col-compo', ['duration-date-compo']),
        ...['from', 'to'].map(part => record(`${id}-${part}`, id, 'col-compo', ['duration-date-value-compo'], {
            location: { modelId: `${id}-${part}`, domId: `${id}-${part}`, eid: `Range_${part}`, vid: `v-${part}` },
            hidden: part === 'to', structure: { tag: 'INPUT', classes: ['duration-date-value-compo'], removable: false },
        }))]);
    const selection = build(...records);
    assert.deepEqual([...selection.normalize(['first-from', 'first-to', 'second-from'])], ['first', 'second']);
    assert.equal(selection.items(new Set(['first']))[0].includesHidden, true);
    assert.deepEqual([...selection.units.keys()], ['row', 'first', 'second']);
});

test('DataSelect, InputGroup, Radio, Checkbox and Dropdown parts never become separate units', () => {
    for (const className of ['dataselect-compo', 'inputgroup-compo', 'radio-compo', 'checkbox-compo',
        'repeat-radio-compo', 'repeat-checkbox-compo', 'dropdown-compo']) {
        const type = className === 'dropdown-compo' ? 'dropdown' : 'col-compo';
        const selection = build(record('control', 'row', type, [className]),
            record('group', 'control', 'dropdown', ['dropdown-group']),
            record('part', 'group', 'text-compo', [], { ownerModelId: 'unrelated' }),
            record('caption', 'part', 'label', [], { selectable: false, ownerModelId: 'part' }),
            record('unrelated', 'row', 'col-compo'));
        for (const id of ['group', 'part', 'caption']) {
            assert.equal(selection.canonical(id), 'control', className);
            assert.equal(selection.units.has(id), false);
        }
        assert.deepEqual([...selection.toggle(new Set(['control']), 'caption')], []);
        assert.equal(selection.canonical('unrelated'), 'unrelated');
    }
});

test('protected whole components and orphaned internal branches fail closed', () => {
    for (const className of ['manual-tree-container', 'duration-date-compo', 'dataselect-compo', 'dropdown-compo']) {
        const selection = build(record('control', 'row', 'col-compo', [className], {
            structure: { tag: 'DIV', classes: [className], removable: false },
        }), record('child', 'control', 'text-compo'));
        assert.equal(selection.canonical('child'), undefined);
        assert.deepEqual([...selection.units.keys()], ['row']);
    }
    for (const partClass of ['manual-tree-node', 'duration-date-value-compo', 'dataselect-btn-compo',
        'inputgroup-btn-compo', 'form-check-label', 'dropdown-group']) {
        const selection = build(record('part', 'row', 'col-compo', [partClass], { ownerModelId: 'row' }),
            record('inner', 'part', 'text-compo'), record('ordinary-col', 'row', 'col'));
        assert.equal(selection.canonical('part'), undefined);
        assert.equal(selection.canonical('inner'), undefined);
        assert.equal(selection.canonical('ordinary-col'), 'ordinary-col');
    }
});

test('paging and linked Grid tools exclude their captions too, without selecting or clearing another unit', () => {
    const selection = build(record('grid', 'row', 'grid-compo'),
        record('tool', 'row', 'text-compo', [], { structure: { tag: 'BUTTON', classes: [], removable: true, linkedListIds: ['deleted-grid'], buttonTypes: ['grid-delete'] } }),
        record('caption', 'tool', 'btn-inner', [], { ownerModelId: 'tool' }),
        record('page-info', 'grid', 'table-page'), record('page-number', 'page-info', 'link-compo'),
        record('pagination', 'row', 'pagination'), record('page-option', 'row', 'page-option'),
        record('level', 'grid', 'node-level-input'), record('grid-button', 'grid', 'text-compo', ['grid-btn-compo']),
        record('ordinary', 'row', 'text-compo'),
        record('input-with-reference', 'row', 'col-compo', [], { structure: { tag: 'INPUT', classes: [], removable: true, linkedListIds: ['grid'] } }));
    for (const id of ['tool', 'caption', 'page-info', 'page-number', 'pagination', 'page-option', 'level', 'grid-button']) {
        assert.equal(selection.canonical(id), undefined, id);
        assert.equal(selection.units.has(id), false, id);
        const result = selection.toggleResult(new Set(['row']), id);
        assert.deepEqual([...result.selected], ['row']);
        assert.ok(result.notice);
    }
    assert.equal(selection.canonical('grid'), 'grid');
    assert.equal(selection.canonical('ordinary'), 'ordinary');
    assert.equal(selection.canonical('input-with-reference'), 'input-with-reference', 'elList alone must not block regular data fields');
});

test('nested compound components stay in their outer editing unit; Tab and Cascader policy is unchanged', () => {
    const selection = build(record('grid', 'row', 'grid-compo'),
        record('tree', 'grid', 'manual-tree-container'), record('node', 'tree', 'manual-tree-node'),
        record('tab', 'row', 'tab'), record('cascader', 'row', 'cascader-container'),
        record('list', 'cascader', 'cascader-list', [], { structure: { tag: 'UL', classes: [], removable: false } }),
        record('item', 'list', 'cascader-item'));
    assert.equal(selection.canonical('node'), 'grid');
    assert.equal(selection.units.has('tree'), false);
    assert.equal(selection.canonical('tab'), 'tab');
    assert.equal(selection.canonical('item'), 'item');
    assert.equal(selection.canonical('list'), undefined);
});

test('custom buttons with stale elList remain selectable while native Grid button types stay protected', () => {
    for (const buttonTypes of [['default'], ['save'], ['delete'], []]) {
        const source = [record('cancel', 'row', 'text-compo', [], {
            componentType: 'btn',
            structure: { tag: 'BUTTON', classes: ['btn-compo', 'default-btn'], removable: true,
                linkedListIds: ['current_job_list'], buttonTypes },
        }), record('caption', 'cancel', 'btn-inner', [], { ownerModelId: 'cancel' })];
        const before = JSON.stringify(source);
        const selection = build(...source);
        assert.equal(selection.canonical('cancel'), 'cancel');
        assert.equal(selection.canonical('caption'), 'cancel');
        assert.deepEqual([...selection.toggle(new Set(), 'caption')], ['cancel']);
        assert.equal(JSON.stringify(source), before);
    }
    for (const type of ['grid-delete', 'grid-refresh', 'grid-wrap', 'frozen-left']) {
        const selection = build(record('tool', 'row', 'text-compo', [], {
            structure: { tag: 'BUTTON', classes: [], removable: true, buttonTypes: [type], linkedListIds: [] },
        }));
        assert.equal(selection.canonical('tool'), undefined, type);
    }
});
