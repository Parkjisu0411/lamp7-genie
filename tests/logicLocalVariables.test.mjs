import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { localVariableTransfer } from '../src/features/edit/background/localVariableTransfer.ts';
import { pasteCopiedLogicsInMainWorld } from '../src/features/edit/background/pasteLogicCreator.ts';
import { readLogicPasteContext } from '../src/features/edit/background/pasteContext.ts';
import { logicHarness } from './logicPasteHarness.mjs';

const definition = (id, extra = {}) => ({ id, name: id, dataType: 'String', dataTypeId: 'STR', dataStructure: '', initYn: 'Y', ...extra });
const logic = (variable = {}, extra = {}) => ({ id: 'source', seq: 1, type: 'variable', variable: { type: 'local', id: 'value', ...variable }, ...extra });
function environment(initial = []) {
    const rows = structuredClone(initial), parameterIds = new Map(), structures = { target: {} }, calls = [];
    const grid = { length: 1, getRowData: () => rows };
    let count = 0, suffix = 0;
    const env = {
        $: { divTab: selector => selector === '#variableList' ? grid : { val: () => 'target' } },
        _variableListGridId_: 'variableList', _varStructMap_: structures, variableParameterId: parameterIds,
        uid: () => 'JG' + ++count,
        getTransactionUid(prefix, g, check) {
            calls.push(['allocate', prefix]);
            let id = check;
            while (g.getRowData().some(r => r.id === id)) id = prefix + ++suffix;
            return id;
        },
        JqGridHelper: {
            endEdit: () => true,
            getGridDataAll: () => ({ data: rows }),
            addRowData(g, rowId, row) { calls.push(['add', row.id]); rows.push({ ...structuredClone(row), _ID_: rowId }); return true; },
            delRowData(g, rowId) { const i = rows.findIndex(r => r._ID_ === rowId); if (i >= 0) rows.splice(i, 1); return true; },
        },
    };
    return { env, rows, calls, structures, parameterIds, read: name => env[name] };
}
const copied = (logics, defs) => localVariableTransfer(logics, environment(defs).read, 'copy').logics;

test('copy bundles only referenced ordinary locals, with no source writes or UI row IDs', () => {
    const f = environment([definition('value', { _ID_: 'source-row', no: 9 }), definition('rhs'), definition('unused')]);
    const source = [logic({ setParamType: 'V', setParamId: 'rhs' }), logic({}, { id: 'second' })];
    const before = JSON.stringify({ source, rows: f.rows });
    const result = localVariableTransfer(source, f.read, 'copy');
    assert.deepEqual(result.logics[0].__genieLocalVariables.map(r => r.id), ['value', 'rhs']);
    assert.equal(result.logics[0].__genieLocalVariables[0]._ID_, undefined);
    assert.equal(result.logics[1].__genieLocalVariables, undefined);
    assert.equal(JSON.stringify({ source, rows: f.rows }), before);
    assert.deepEqual(f.calls, []);
});

test('missing locals are added before use, same definitions reused, conflicts use native numbering', () => {
    const data = copied([logic({ setParamType: 'V', setParamId: 'rhs', setIndexType: 'V', setIndexId: 'index' })],
        [definition('value'), definition('rhs'), definition('index')]);
    const f = environment([definition('value', { dataTypeId: 'NUM', dataType: 'Number' }), definition('value1'), definition('rhs')]);
    const original = structuredClone(f.rows), before = JSON.stringify(data);
    const plan = localVariableTransfer(data, f.read, 'paste');
    assert.deepEqual(f.calls, [], 'preflight has no mutations');
    plan.apply();
    assert.equal(plan.logics[0].variable.id, 'value2');
    assert.equal(plan.logics[0].variable.setParamId, 'rhs');
    assert.equal(plan.logics[0].variable.setIndexId, 'index');
    assert.equal(f.rows.length, 5);
    assert.deepEqual(f.rows.slice(0, 3), original);
    assert.equal(plan.logics[0].__genieLocalVariables, undefined);
    assert.equal(f.parameterIds.size, 2);
    assert.equal(JSON.stringify(data), before);
});

test('object parent references change but member keys, literals, globals and iteration references do not', () => {
    const structure = JSON.stringify({ info: { child: { key: 'child', dataType: 'STR' } } });
    const data = copied([
        logic({ id: 'child', pId: 'value', setParamType: 'V', setParamId: 'child', pSetParamId: 'value', defaultValue: 'value' }),
        { id: 'condition', type: 'condition', condition: { condParamType: 'V', condParamId: 'child', pCondParamId: 'value' } },
        logic({ type: 'global', id: 'value', setParamType: 'IV', setParamId: 'value' }, { id: 'global' }),
    ], [definition('value', { dataType: 'Object', dataTypeId: 'OBJ', dataStructure: structure })]);
    const f = environment([definition('value')]);
    const plan = localVariableTransfer(data, f.read, 'paste'); plan.apply();
    assert.equal(plan.logics[0].variable.pId, 'value1');
    assert.equal(plan.logics[0].variable.pSetParamId, 'value1');
    assert.equal(plan.logics[0].variable.id, 'child');
    assert.equal(plan.logics[0].variable.defaultValue, 'value');
    assert.equal(plan.logics[1].condition.pCondParamId, 'value1');
    assert.equal(plan.logics[2].variable.id, 'value');
    assert.equal(plan.logics[2].variable.setParamId, 'value');
    assert.equal(f.structures.target.value1, structure);
});

test('equivalent JSON structures reuse a local regardless of key order or display name', () => {
    const data = copied([logic()], [definition('value', { dataTypeId: 'OBJ', dataStructure: '{"a":1,"b":2}' })]);
    const f = environment([definition('value', { name: 'existing name', dataTypeId: 'OBJ', dataStructure: '{"b":2,"a":1}' })]);
    const plan = localVariableTransfer(data, f.read, 'paste'); plan.apply();
    assert.equal(f.rows.length, 1);
    assert.equal(plan.logics[0].variable.id, 'value');
    assert.equal(f.rows[0].name, 'existing name');
});

test('missing and SAP-generated source locals fail without copying unrelated definitions', () => {
    assert.throws(() => copied([logic()], []), /value/);
    assert.throws(() => copied([logic()], [definition('value', { sapFuncTranId: 'tran' })]), /SAP/);
    const f = environment();
    assert.deepEqual(localVariableTransfer([logic({ type: 'global' })], f.read, 'copy').logics, [logic({ type: 'global' })]);
    assert.deepEqual(localVariableTransfer([logic()], () => undefined, 'paste').logics, [logic()], 'legacy clipboard stays usable');
});

test('partial variable registration failure rolls back only newly added rows and maps', () => {
    const data = copied([logic({ setParamType: 'V', setParamId: 'rhs' })], [definition('value'), definition('rhs')]);
    const f = environment([definition('kept')]);
    const add = f.env.JqGridHelper.addRowData;
    f.env.JqGridHelper.addRowData = (...args) => { if (args[2].id === 'rhs') throw Error('native failure'); return add(...args); };
    const plan = localVariableTransfer(data, f.read, 'paste');
    assert.throws(() => plan.apply(), /native failure/);
    assert.deepEqual(f.rows, [definition('kept')]);
    assert.equal(f.parameterIds.size, 0);
    assert.deepEqual(f.structures, { target: {} });
});

test('serialized MAIN helper carries copied definitions across independent source and destination contexts', () => {
    const fn = vm.runInNewContext('(' + localVariableTransfer.toString() + ')');
    const source = environment([definition('value')]);
    const data = JSON.parse(JSON.stringify(fn([logic()], source.read, 'copy').logics));
    const dest = environment([definition('value', { initYn: 'N' })]);
    const plan = fn(data, dest.read, 'paste'); plan.apply();
    assert.equal(plan.logics[0].variable.id, 'value1');
    assert.equal(dest.rows[1].initYn, 'Y');
});

test('logic paste applies locals before creation and removes them if no logic was created', () => {
    for (const fail of [false, true]) {
        const t = logicHarness(), f = environment();
        const jq = t.env.$, divTab = jq.divTab;
        Object.assign(t.env, f.env, { $: jq });
        jq.divTab = selector => selector === '#variableList' ? { length: 1, getRowData: () => f.rows } : selector === '#id' ? { 0: t.owner, length: 1, val: () => 'target' } : divTab(selector);
        const nativeCreate = t.editor.createLogic;
        t.editor.createLogic = (...args) => {
            assert.equal(f.rows[0]?.id, 'value', 'definition precedes native constructor');
            assert.equal(args[3].__genieLocalVariables, undefined);
            if (fail) throw Error('creation failed');
            return nativeCreate(...args);
        };
        const context = t.start();
        const result = pasteCopiedLogicsInMainWorld({ modeId: context.modeId, context, location: { anchorId: '', position: 'root-end' }, logics: copied([logic()], [definition('value')]) }, t.helpers, readLogicPasteContext, localVariableTransfer);
        assert.equal(result.setupError, undefined);
        assert.equal(result.createdCount, fail ? 0 : 1);
        assert.equal(f.rows.length, fail ? 0 : 1);
    }
});

test('serialized object assignment references and structure cache keys follow renamed locals', () => {
    const detail = JSON.stringify([{ id: 'member', setParamType: 'V', setParamId: 'rhs' }]);
    const data = copied([logic({ dataStructure: 'value', dataStructureSet: detail })], [definition('value'), definition('rhs')]);
    const f = environment([definition('value', { initYn: 'N' }), definition('rhs', { initYn: 'N' })]);
    const plan = localVariableTransfer(data, f.read, 'paste'); plan.apply();
    assert.equal(plan.logics[0].variable.dataStructure, plan.logics[0].variable.id);
    const entries = JSON.parse(plan.logics[0].variable.dataStructureSet);
    assert.equal(entries[0].id, 'member');
    assert.notEqual(entries[0].setParamId, 'rhs');
    assert.ok(f.rows.some(row => row.id === entries[0].setParamId));
});

test('stale paste scope rejects local variable creation and invalid copied forests never register rows', () => {
    const t = logicHarness(), f = environment();
    const originalRead = t.helpers.readBinding;
    const helpers = { ...t.helpers, readBinding: name => name === '$' ? originalRead(name) : f.env[name] ?? originalRead(name) };
    const context = t.start(); t.host.dataset.pasteMode = 'different';
    const result = pasteCopiedLogicsInMainWorld({ modeId: context.modeId, context, location: { anchorId: '', position: 'root-end' }, logics: copied([logic()], [definition('value')]) }, helpers, readLogicPasteContext, localVariableTransfer);
    assert.ok(result.setupError);
    assert.equal(f.rows.length, 0);
    assert.equal(t.calls.create, 0);
});
