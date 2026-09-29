import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { readVisualComponents } from '../src/features/visualSearch/background/readComponents.ts';
import { matchVisualComponents } from '../src/features/visualSearch/background/matcher.ts';
import { createVisualSelection } from '../src/features/visualEdit/selection.ts';

const all = { ids: true, text: true };
function snapshot(specs) {
    const settings = {};
    const doc = { defaultView: { getComputedStyle: el => ({ display: el.hidden ? 'none' : 'block', visibility: 'visible', opacity: '1' }) } };
    const make = spec => {
        const attrs = Object.freeze(spec.attrs ?? { id: `dom-${spec.id}`, eid: spec.eid ?? spec.id, vid: spec.vid ?? `v-${spec.id}` });
        if (attrs.vid) settings[attrs.vid] = Object.freeze(spec.setting ?? {});
        const children = (spec.children ?? []).map(make);
        const el = {
            nodeType: 1, id: attrs.id, tagName: spec.tag ?? 'DIV', isConnected: true,
            hidden: !!spec.hidden, parentElement: null, ownerDocument: doc,
            getAttribute: key => attrs[key] ?? null, getClientRects: () => [{}],
            classList: { contains: name => (spec.classes ?? []).includes(name) },
            childNodes: [...(spec.text ? [{ nodeType: 3, textContent: spec.text }] : []), ...children.map(child => child.getEl())],
        };
        for (const node of el.childNodes) node.parentElement = el;
        const data = Object.freeze({ type: spec.type ?? 'col-compo', attributes: attrs,
            selectable: spec.selectable !== false, removable: spec.removable !== false,
            components: Object.freeze({ models: Object.freeze(children) }) });
        return Object.freeze({ cid: spec.id, get: key => data[key], getEl: () => el,
            set: () => assert.fail('Unexpected model write'), addClass: () => assert.fail('Unexpected canvas write') });
    };
    const wrapper = make({ id: 'wrapper', type: 'wrapper', children: specs });
    Object.freeze(settings);
    const before = JSON.stringify(settings);
    const result = JSON.parse(JSON.stringify(vm.runInNewContext(`(${readVisualComponents.toString()})()`, {
        editor: { getWrapper: () => wrapper, select: () => assert.fail('Unexpected selection') }, _settingInfo: settings,
    })));
    assert.equal(result.error, undefined);
    assert.equal(JSON.stringify(settings), before);
    return result.records;
}
const matches = (records, query) => matchVisualComponents(records, query, all);
const ownerIds = result => result.map(item => item.locations.map(location => location.modelId));

function gridSearchFixture(id = 'grid', options = {}) {
    return { id, type: 'grid-compo', classes: ['grid-compo'], children: [
        { id: `${id}-table`, type: 'table', tag: 'TABLE', children: [
            { id: `${id}-head`, type: 'thead', tag: 'THEAD', children: [
                { id: `${id}-headers`, type: 'grid-col-tr', tag: 'TR', classes: ['grid-col-tr'], children: [
                    { id: `${id}-header`, eid: 'OrderColumn', vid: `${id}-header-setting`, type: 'cell', tag: 'TH',
                        classes: ['grid-col-compo'], hidden: !!options.hiddenHeader,
                        setting: { type: 'grid-col', name: '주문 번호' }, children: [
                            { id: `${id}-caption`, type: 'colName', tag: 'SPAN', attrs: { id: `${id}-caption` }, text: '주문 번호' },
                        ] },
                    { id: `${id}-other-header`, type: 'cell', tag: 'TH', classes: ['grid-col-compo'], setting: { name: '다른 열' } },
                ] },
            ] },
            { id: `${id}-body`, type: 'tbody', tag: 'TBODY', children: [0, 1].map(row => ({
                id: `${id}-row-${row}`, type: 'table-row', tag: 'TR', children: [
                    { id: `${id}-cell-${row}`, type: 'cell', tag: 'TD', classes: ['grid-td'],
                        attrs: { id: `${id}-cell-${row}`, ...(options.merged ? { colspan: 2 } : {}) }, children: [
                            { id: `${id}-value-${row}`, eid: 'OrderNo', vid: 'order-setting', tag: 'INPUT',
                                setting: { type: 'input', name: options.cellName || '주문 번호', placeholder: '숫자 입력' } },
                        ] },
                    { id: `${id}-other-cell-${row}`, type: 'cell', tag: 'TD', classes: ['grid-td'], attrs: { id: `${id}-other-cell-${row}` } },
                ],
            })) },
        ] },
    ] };
}

test('matching Grid column, its caption and repeated values appear once with all highlight locations', () => {
    const data = snapshot([gridSearchFixture()]);
    const before = JSON.stringify(data);
    const result = matches(data, '주문 번호');
    assert.equal(result.length, 1);
    assert.equal(result[0].type, 'grid-col');
    assert.equal(result[0].eid, 'OrderColumn');
    assert.deepEqual(ownerIds(result), [['grid-header', 'grid-value-0', 'grid-value-1']]);
    assert.equal(JSON.stringify(data), before);
});

test('cell-only queries keep cell metadata, while repeated ID-less TDs also form one result', () => {
    const data = snapshot([gridSearchFixture()]);
    const result = matches(data, '숫자 입력');
    assert.equal(result.length, 1);
    assert.equal(result[0].type, 'input');
    assert.equal(result[0].eid, 'OrderNo');
    assert.deepEqual(ownerIds(result), [['grid-value-0', 'grid-value-1']]);
    const td = matchVisualComponents(data, 'grid-cell-0', { ids: true, text: false });
    assert.deepEqual(ownerIds(td), [['grid-cell-0', 'grid-cell-1']]);
    assert.equal(td[0].type, 'cell');
    assert.equal(matchVisualComponents(data, 'cell', { ids: false, text: false, type: true }).length, 0,
        'legacy type filter does not enable component type search');
});

test('same names and IDs in separate Grids never merge; hidden columns do not hide visible matched cells', () => {
    const data = snapshot([gridSearchFixture('a', { hiddenHeader: true }), gridSearchFixture('b')]);
    const result = matches(data, '주문 번호');
    assert.equal(result.length, 2);
    assert.deepEqual(result.map(item => item.locations.length), [3, 3]);
    assert.equal(result[0].hidden, false);
    assert.equal(result[0].rendered, true);
    const cellOnly = matches(data, 'OrderNo');
    assert.equal(cellOnly.length, 2);
    assert.deepEqual(cellOnly.map(item => item.type), ['input', 'input']);
});

test('merged body cells and header-free tables are not guessed into column groups', () => {
    const data = snapshot([gridSearchFixture('grid', { merged: true })]);
    assert.equal(matches(data, '주문 번호').length, 2);
    assert.equal(matchVisualComponents(data, 'grid-cell', { ids: true }).length, 2);
    const standalone = snapshot([{ id: 'plain', type: 'table', tag: 'TABLE', children: [
        { id: 'row', tag: 'TR', children: [
            { id: 'cell-a', tag: 'TD', type: 'cell' },
            { id: 'cell-b', tag: 'TD', type: 'cell' },
        ] },
    ] }]);
    assert.equal(matches(standalone, 'cell-').length, 2);
});

test('serialized MAIN facts distinguish whole controls from same-type internals and keep search results unchanged', () => {
    const data = snapshot([
        { id: 'range', classes: ['duration-date-compo'], children: [
            { id: 'from', tag: 'INPUT', classes: ['duration-date-value-compo'], removable: false },
            { id: 'to', tag: 'INPUT', classes: ['duration-date-value-compo'], removable: false },
        ] },
        { id: 'dropdown', type: 'dropdown', classes: ['dropdown-compo'], children: [
            { id: 'menu', type: 'dropdown', classes: ['dropdown-list'], removable: false, children: [
                { id: 'group', type: 'dropdown', classes: ['dropdown-group'], children: [
                    { id: 'action', type: 'text-compo', tag: 'BUTTON', setting: { type: 'btn', name: '메뉴 실행' } },
                ] },
            ] },
        ] },
        { id: 'radio', classes: ['radio-compo'], children: [
            { id: 'option-label', type: 'label', tag: 'LABEL', classes: ['form-check-label'], selectable: false, removable: false, children: [
                { id: 'option', type: 'none', tag: 'INPUT', selectable: false },
            ] },
        ] },
    ]);
    const searchBefore = matches(data, '메뉴 실행');
    const selection = createVisualSelection(data);
    for (const id of ['from', 'to']) assert.equal(selection.canonical(id), 'range');
    for (const id of ['menu', 'group', 'action']) assert.equal(selection.canonical(id), 'dropdown');
    for (const id of ['option-label', 'option']) assert.equal(selection.canonical(id), 'radio');
    assert.deepEqual([...selection.units.keys()], ['range', 'dropdown', 'radio']);
    assert.deepEqual(matches(data, '메뉴 실행'), searchBefore);
    assert.deepEqual(ownerIds(searchBefore), [['action']], 'selection ownership does not merge search records');
});

test('serialized MAIN uses button types and ignores stale elList attributes for ordinary buttons', () => {
    const data = snapshot([
        { id: 'settings-button', tag: 'BUTTON', setting: { type: 'btn', buttonType: ['grid-delete'], elList: ['GridA', 'GridB'] } },
        { id: 'camel-button', tag: 'BUTTON', attrs: { id: 'camel', elList: 'GridA' } },
        { id: 'lower-button', tag: 'BUTTON', attrs: { id: 'lower', vid: 'v-lower', ellist: 'deleted' }, setting: { type: 'btn', buttonType: 'default' } },
        { id: 'page', type: 'table-page', classes: ['page-info'] },
        { id: 'plain', tag: 'BUTTON', setting: { type: 'btn', elList: [] } },
        { id: 'input', tag: 'INPUT', setting: { type: 'input', elList: 'GridA' } },
    ]);
    assert.deepEqual(data[0].structure.buttonTypes, ['grid-delete']);
    assert.deepEqual(data[2].structure.buttonTypes, ['default']);
    const selection = createVisualSelection(data);
    for (const id of ['settings-button', 'page']) {
        assert.equal(selection.canonical(id), undefined, id);
    }
    for (const id of ['camel-button', 'lower-button']) {
        assert.equal(selection.canonical(id), id, 'stale list attributes do not make a Grid tool');
    }
    assert.equal(selection.canonical('plain'), 'plain');
    assert.equal(selection.canonical('input'), 'input');
});

test('serialized MAIN structural facts feed verified Grid units without modifying search scope or settings', () => {
    const data = snapshot([{ id: 'grid', type: 'grid-compo', classes: ['grid-compo'], children: [
        { id: 'table', type: 'table', tag: 'TABLE', selectable: false, children: [
            { id: 'head', type: 'thead', tag: 'THEAD', children: [{ id: 'headers', type: 'grid-col-tr', tag: 'TR', children: [
                { id: 'header', type: 'cell', tag: 'TH', classes: ['grid-col-compo'] },
            ] }] },
            { id: 'body', type: 'tbody', tag: 'TBODY', children: [0, 1].map(row => ({ id: `r${row}`, type: 'table-row', tag: 'TR', children: [
                { id: `cell${row}`, type: 'cell', tag: 'TD', classes: ['grid-td'], removable: false, children: [
                    { id: `value${row}`, eid: 'value', vid: 'value-v', tag: 'INPUT', setting: { type: 'input', name: '주문' } },
                ] },
            ] })) },
        ] },
    ] }]);
    const selection = createVisualSelection(data);
    assert.equal(selection.canonical('value1'), 'grid');
    assert.equal(selection.canonical('cell0'), 'grid');
    assert.equal(selection.canonical('table'), 'grid');
    assert.equal(data.find(record => record.location.modelId === 'cell0').structure.removable, false);
    assert.deepEqual(ownerIds(matches(data, '주문')), [['value0', 'value1']]);
});

test('selection metadata preserves model ancestry and excludes the screen root/internal wrappers', () => {
    const data = snapshot([{ id: 'screen-root', type: 'default', classes: ['container-fluid'], children: [
        { id: 'row', type: 'row', children: [{ id: 'col', type: 'col', children: [
            { id: 'hidden', type: 'col-compo', hidden: true },
            { id: 'wrapper-span', type: 'none', attrs: { id: 'wrapper-span-dom' } },
        ] }] },
    ] }]);
    const byId = new Map(data.map(record => [record.location.modelId, record]));
    assert.equal(byId.get('screen-root').selectable, false);
    assert.equal(byId.get('wrapper-span').selectable, false);
    assert.equal(byId.get('row').selectable, true);
    assert.equal(byId.get('col').parentModelId, 'row');
    assert.equal(byId.get('hidden').parentModelId, 'col');
    assert.equal(byId.get('hidden').hidden, true);
});

test('paired input labels are aliases: label text/IDs find only the owning input', () => {
    const data = snapshot([{ id: 'row', type: 'row', children: [
        { id: 'caption', type: 'label', tag: 'LABEL', text: '고객 성명', setting: { type: 'label', name: '고객명', valueId: 'customer' } },
        { id: 'customer', tag: 'INPUT', setting: { type: 'input', name: '고객명', labelId: 'caption', description: '거래처 조회' } },
    ] }]);
    for (const query of ['고객명', '고객 성명', 'caption', 'dom-caption', 'v-caption', 'customer']) {
        const result = matches(data, query);
        assert.deepEqual(ownerIds(result), [['customer']], query);
        assert.equal(result[0].type, 'input');
        assert.equal(result[0].label, '고객명');
        assert.equal(result[0].description, '거래처 조회');
    }
});

test('btn-inner caption and its formatting spans resolve to one button location', () => {
    const data = snapshot([{ id: 'save', type: 'text-compo', tag: 'BUTTON', setting: { type: 'btn', name: '저장' }, children: [
        { id: 'caption', type: 'btn-inner', attrs: { id: 'caption-dom' }, text: '변경사항 저장', children: [
            { id: 'formatting', type: 'default', attrs: { id: 'format-dom' }, text: '완료' },
        ] },
    ] }]);
    for (const query of ['저장', '변경사항', '완료', 'caption-dom', 'format-dom']) {
        assert.deepEqual(ownerIds(matches(data, query)), [['save']], query);
    }
    assert.equal(matchVisualComponents(data, 'btn-inner', { ids: false, text: false }).length, 0,
        'internal caption type is not a separate component');
});

test('nested form labels without mapping belong to their control, with label fallback', () => {
    const data = snapshot([{ id: 'checkbox', setting: { type: 'checkbox' }, children: [
        { id: 'wrapper-span', type: 'default', attrs: { id: 'inner-dom' }, children: [
            { id: 'caption', type: 'label', tag: 'LABEL', text: '동의합니다' },
        ] },
    ] }]);
    const result = matches(data, '동의합니다');
    assert.deepEqual(ownerIds(result), [['checkbox']]);
    assert.equal(result[0].label, '동의합니다');
});

test('the input labelId alone resolves a sibling label even without a valueId', () => {
    const data = snapshot([
        { id: 'caption', type: 'label', text: '납품처' },
        { id: 'input', setting: { type: 'input', labelId: 'caption' } },
    ]);
    const result = matches(data, '납품처');
    assert.deepEqual(ownerIds(result), [['input']]);
    assert.equal(result[0].label, '납품처');
});

test('standalone labels and separate components with the same text are not suppressed', () => {
    const data = snapshot([
        { id: 'standalone', type: 'label', text: '이름' },
        { id: 'first', setting: { type: 'input', name: '이름' } },
        { id: 'second', setting: { type: 'input', name: '이름' } },
    ]);
    assert.deepEqual(ownerIds(matches(data, '이름')), [['standalone'], ['first'], ['second']]);
});

test('attribute mappings accept lowercase/camelCase and never cross Grid boundaries', () => {
    const grid = (id, rows) => ({ id, type: 'grid-compo', children: rows.map((row, index) => ({
        id: `${id}-row${index}`, type: 'row', children: [
            { id: `${id}-caption${index}`, type: 'label', attrs: { id: `${id}-label-dom${index}`, eid: 'caption', vid: `${id}-label-v`, valueid: 'order' }, text: '주문 번호' },
            { id: `${id}-order${index}`, attrs: { id: `${id}-input-dom${index}`, eid: 'order', vid: `${id}-input-v`, labelId: 'caption' }, setting: { type: 'input', name: '주문 번호' } },
        ],
    })) });
    const data = snapshot([grid('gridA', [1, 2]), grid('gridB', [1])]);
    assert.deepEqual(ownerIds(matches(data, '주문 번호')), [['gridA-order0', 'gridA-order1'], ['gridB-order0']]);
    assert.deepEqual(ownerIds(matches(data, 'gridA-label-dom1')), [['gridA-order0', 'gridA-order1']]);
});

test('stale or ambiguous label references remain independent instead of hiding results', () => {
    const data = snapshot([
        { id: 'missing-owner-label', type: 'label', text: '조회', setting: { valueId: 'deleted' } },
        { id: 'ambiguous-label', type: 'label', text: '조회', setting: { valueId: 'duplicate' } },
        { id: 'input1', eid: 'duplicate', setting: { type: 'input', name: '조회' } },
        { id: 'input2', eid: 'duplicate', setting: { type: 'input', name: '조회' } },
    ]);
    assert.deepEqual(ownerIds(matches(data, '조회')), [['missing-owner-label'], ['ambiguous-label'], ['input1'], ['input2']]);
});

test('visible label does not make a hidden owning control appear visible', () => {
    const data = snapshot([
        { id: 'caption', type: 'label', text: '비공개', setting: { valueId: 'secret' } },
        { id: 'secret', hidden: true, setting: { type: 'input', name: '비공개' } },
    ]);
    const result = matches(data, '비공개');
    assert.deepEqual(ownerIds(result), [['secret']]);
    assert.equal(result[0].hidden, true);
});
