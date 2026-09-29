import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { readVisualComponents } from '../src/features/visualSearch/background/readComponents.ts';
import { matchVisualComponents } from '../src/features/visualSearch/background/matcher.ts';
import { intersectRect, projectCanvasRect } from '../src/features/visualSearch/geometry.ts';
import { watchVisualEditor } from '../src/features/visualSearch/background/watchEditor.ts';

const all = { ids: true, text: true };
const record = (id, options = {}) => ({
    location: { modelId: id, domId: id, eid: `item-${id}`, vid: `setting-${id}` },
    name: '납품처', label: '납품처', description: '', componentType: 'input', text: '서울 물류', type: 'text-compo', gridId: null,
    hidden: false, rendered: true, order: 0, ...options,
});

test('substring search covers allowed fields and ranks exact IDs before tree-ordered text', () => {
    const data = [record('first', { text: 'ITEM-EXACT 설명', order: 0 }), record('exact', { order: 1 }),
        record('last', { name: 'ITEM-EXACT', order: 2 })];
    const matches = matchVisualComponents(data, '  ITEM-exact ', all);
    assert.deepEqual(matches.map(match => match.locations[0].modelId), ['exact', 'first', 'last']);
    assert.equal(matches[0].field, 'eid');
    assert.equal(matches[1].value.slice(matches[1].matchStart, matches[1].matchEnd), 'ITEM-EXACT');
    for (const query of ['납품', '서울', 'setting-first']) {
        assert.ok(matchVisualComponents(data, query, all).length);
    }
    assert.equal(matchVisualComponents(data, '서울', { ...all, text: false }).length, 0);
    assert.equal(matchVisualComponents(data, 'text-compo', all).length, 0);
    assert.equal(matchVisualComponents(data, 'item-first', { ...all, ids: false }).length, 0);
    assert.equal(matchVisualComponents(data, '  ', all).length, 0);
    assert.equal(matchVisualComponents(data, '서울', { ids: false, text: false }).length, 0);
});

test('only the same Grid, eid, vid and type are grouped; actual locations stay distinct', () => {
    const repeated = (id, gridId, hidden = false) => record(id, { gridId, hidden,
        location: { modelId: id, domId: id, eid: 'OrderNo', vid: 'v-order' } });
    const data = [repeated('row1', 'grid1', true), repeated('row2', 'grid1'), repeated('other-grid', 'grid2'),
        repeated('standalone1', null), repeated('standalone2', null),
        { ...repeated('different-setting', 'grid1'), location: { modelId: 'different-setting', domId: 'x', eid: 'OrderNo', vid: 'different' } }];
    const frozen = JSON.stringify(data);
    const matches = matchVisualComponents(data, 'OrderNo', all);
    assert.equal(matches.length, 5);
    assert.deepEqual(matches[0].locations.map(item => item.domId), ['row1', 'row2']);
    assert.equal(matches[0].hidden, false);
    assert.equal(matchVisualComponents(data, 'row2', all)[0].locations.length, 2);
    assert.equal(JSON.stringify(data), frozen);
});

test('hidden/unrendered results remain searchable', () => {
    const [match] = matchVisualComponents([record('hidden', { hidden: true, rendered: false })], '납품', all);
    assert.equal(match.hidden, true);
    assert.equal(match.rendered, false);
});

test('canvas coordinates respect iframe scale, offset and clipping', () => {
    const projected = projectCanvasRect({ left: 80, top: 60, width: 200, height: 100 },
        { left: 100, top: 50, width: 500, height: 300 }, { width: 1000, height: 600 });
    assert.deepEqual(projected, { left: 140, top: 80, width: 100, height: 50 });
    assert.deepEqual(intersectRect(projected, { left: 150, top: 0, width: 200, height: 100 }),
        { left: 150, top: 80, width: 90, height: 20 });
    assert.equal(intersectRect(projected, { left: 240, top: 80, width: 5, height: 5 }), null);
});

test('serialized MAIN extraction reads model ownership and settings without calling mutations', () => {
    const style = { display: 'block', visibility: 'visible', opacity: '1' };
    const doc = { defaultView: { getComputedStyle: element => element.style ?? style } };
    const text = content => ({ nodeType: 3, textContent: content });
    const element = (id, nodes = [], attrs = {}, extra = {}) => {
        const el = { nodeType: 1, id, tagName: 'DIV', childNodes: nodes, ownerDocument: doc, isConnected: true,
            parentElement: null, getClientRects: () => [{}], getAttribute: name => attrs[name] ?? null,
            classList: { contains: () => false }, ...extra };
        for (const node of nodes) node.parentElement = el;
        return el;
    };
    const model = (cid, el, values = {}, children = []) => {
        const data = Object.freeze({ type: 'text-compo', attributes: Object.freeze({ id: cid, eid: cid, vid: `v-${cid}` }),
            components: { models: children }, ...values });
        return Object.freeze({ cid, get: key => data[key], getEl: () => el,
            set: () => assert.fail('model setter called'), addClass: () => assert.fail('canvas class changed') });
    };
    const inline = element('inline', [text('이름')]);
    const label = element('label', [text('거래처'), inline]);
    const secret = element('secret', [text('비공개 주소')]);
    const hiddenTab = element('tab', [secret], {}, { style: { ...style, display: 'none' } });
    const row = element('row', [label, hiddenTab]);
    const labelModel = model('label', label, {}, [model('inline', inline, { type: 'default', attributes: { id: 'inline' } })]);
    const wrapper = model('wrapper', element('wrapper', [row]), {}, [model('row', row, { type: 'row' },
        [labelModel, model('tab', hiddenTab, { type: 'tab' }, [model('secret', secret)])]), model('unrendered', undefined)]);
    const settings = Object.freeze({ 'v-label': Object.freeze({ name: '고객명', type: 'input', description: ' 거래처 이름\n검색 조건 ', placeholder: '고객을 입력' }),
        'v-unrendered': Object.freeze({ name: '대기 항목', hiddenYn: 'Y' }) });
    const before = JSON.stringify(settings);
    const sandbox = { editor: { getWrapper: () => wrapper, select: () => assert.fail('selection changed') }, _settingInfo: settings };
    const result = JSON.parse(JSON.stringify(vm.runInNewContext(`(${readVisualComponents.toString()})()`, sandbox)));
    assert.equal(result.error, undefined);
    const byId = Object.fromEntries(result.records.map(item => [item.location.modelId, item]));
    assert.equal(byId.row.text, '');
    assert.equal(byId.inline.text, '');
    assert.equal(byId.label.name, '고객명');
    const [match] = matchVisualComponents(result.records, '고객명', all);
    assert.equal(match.label, '고객명');
    assert.equal(match.type, 'input');
    assert.equal(match.description, '거래처 이름\n검색 조건');
    assert.equal(byId.unrendered.description, '');
    assert.equal(byId.label.text, '거래처 이름 고객을 입력');
    assert.equal(byId.secret.hidden, true);
    assert.equal(byId.unrendered.rendered, false);
    assert.equal(JSON.stringify(settings), before);
    assert.equal(vm.runInNewContext(`(${readVisualComponents.toString()})()`, { editor: sandbox.editor }).records.length, 0);
});

test('MAIN watcher debounces changes and disposes only its own editor listeners', () => {
    let scheduled;
    const removed = [];
    const editorListeners = new Set();
    const editor = { on: (events, fn) => editorListeners.add(fn), off: (events, fn) => { removed.push(events); editorListeners.delete(fn); } };
    const document = new EventTarget(), window = new EventTarget();
    const events = [];
    document.addEventListener('genie:visual-search-changed', event => events.push(event.detail));
    const sandbox = { editor, document, window, CustomEvent,
        setTimeout: fn => { scheduled = fn; return 1; }, clearTimeout: () => { scheduled = undefined; } };
    const start = id => vm.runInNewContext(`(${watchVisualEditor.toString()})(${JSON.stringify(id)})`, sandbox);
    assert.equal(start('first'), true);
    assert.equal(start('first'), true);
    assert.equal(editorListeners.size, 1);
    for (const listener of editorListeners) { listener(); listener(); }
    scheduled();
    assert.deepEqual(events, ['first']);
    assert.equal(start('second'), true);
    assert.equal(editorListeners.size, 1);
    document.dispatchEvent(new CustomEvent('genie:visual-search-stop', { detail: 'first' }));
    assert.equal(editorListeners.size, 1);
    document.dispatchEvent(new CustomEvent('genie:visual-search-stop', { detail: 'second' }));
    assert.equal(editorListeners.size, 0);
    assert.equal(window.__lamp7GenieVisualSearch, undefined);
    assert.ok(removed[0].includes('undo redo'));
});
