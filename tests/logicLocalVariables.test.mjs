import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { localVariableTransfer } from '../src/features/edit/background/localVariableTransfer.ts';
import { pasteCopiedLogicsInMainWorld } from '../src/features/edit/background/pasteLogicCreator.ts';
import { readLogicPasteContext } from '../src/features/edit/background/pasteContext.ts';
import { logicHarness } from './logicPasteHarness.mjs';

const definition = (id, extra = {}) => ({ id, name: id, dataType: 'String', dataTypeId: 'STR', dataStructure: '', initYn: 'Y', ...extra });
const logic = (variable = {}, extra = {}) => ({ id: 'source', seq: 1, type: 'variable', variable: { type: 'local', id: 'value', ...variable }, ...extra });
function environment(initial = []) {
    const rows = structuredClone(initial), parameterIds = new Map(), structures = { target: {} }, calls = [];
    const selected = new Set();
    const columns = ['id', 'name', 'dataType', 'dataTypeId', 'dataStructure', 'initYn'].map(name => ({ name }));
    const beforeIds = new Map();
    const callbacks = {
        beforeSaveCell(rowId, field, value, index, column) {
            beforeIds.set(rowId, this.p.savedRow.find(r => r.id === index && r.ic === column)?.v);
            return value;
        },
        afterSaveCell(rowId, field, value) {
            calls.push(['native-save', field]);
            const row = rows.find(r => r._ID_ === rowId);
            if (field === 'id') {
                parameterIds.set(rowId, value);
                if (['OBJ', 'LIST-OBJ'].includes(row.dataTypeId)) {
                    delete structures.target[beforeIds.get(rowId)];
                    structures.target[value] = row.dataStructure;
                }
                beforeIds.delete(rowId);
            }
        },
    };
    const table = {
        p: { savedRow: [] },
        get rows() { return rows.map((row, index) => ({ id: row._ID_, rowIndex: index,
            cells: columns.map(() => ({ getAttribute: () => '' })) })); },
    };
    const grid = { 0: table, length: 1, getRowData: () => rows,
        attr: () => 'variableList',
        jqGrid(command, ...args) {
            if (command === 'getGridParam') return args[0] === 'colModel' ? columns : args[0] === 'savedRow' ? table.p.savedRow : callbacks[args[0]];
            if (command === 'editCell') throw Error("Cannot read properties of undefined (reading 'close')");
            else if (command === 'resetSelection') selected.clear();
            else if (command === 'setSelection') selected.add(args[0]);
        },
    };
    let count = 0, suffix = 0;
    const env = {
        $: Object.assign(target => target === table ? grid : { 0: target }, { divTab: selector => selector === '#variableList' ? grid : { val: () => 'target' } }),
        _variableListGridId_: 'variableList', _varStructMap_: structures, variableParameterId: parameterIds,
        _appType_: 'WEB',
        CommonHelper: {
            getStructureDataTypeName: type => ({ STR: 'String', NUM: 'Number', OBJ: 'Object', 'LIST-OBJ': 'List[Object]', 'LIST-STR': 'List[String]', 'LIST-NUM': 'List[Number]' })[type] ?? '',
            checkReservedWord: () => false,
        },
        uid: () => 'JG' + ++count,
        gridAddBtn() {
            const rowId = 'JG' + ++count;
            calls.push(['native-add']);
            rows.push({ ...definition('varParam' + count), _ID_: rowId });
            parameterIds.set(rowId, 'varParam' + count);
        },
        gridDelBtn() {
            calls.push(['native-delete', [...selected]]);
            for (let i = rows.length - 1; i >= 0; i--) if (selected.has(rows[i]._ID_)) {
                parameterIds.delete(rows[i]._ID_); delete structures.target[rows[i].id]; rows.splice(i, 1);
            }
        },
        setStructJsonData() { throw Error('must not open or close a popup'); },
        getTransactionUid(prefix, g, check) {
            calls.push(['allocate', prefix]);
            let id = check;
            while (g.getRowData().some(r => r.id === id)) id = prefix + ++suffix;
            return id;
        },
        JqGridHelper: {
            endEdit() { return true; },
            setRowData(g, rowId, type, data, endEdit) {
                assert.equal(endEdit, false);
                if (data.id === 'rhs' && env.failRhs) throw Error('native failure');
                calls.push(['set-row', rowId]);
                Object.assign(rows.find(r => r._ID_ === rowId), structuredClone(data));
            },
            getGridDataAll: () => ({ data: rows }),
            getRowData: (g, id) => ({ data: rows.find(r => r._ID_ === id) }),
            getRowId: (g, index) => g[0].rows[index].id,
            addRowData(g, rowId, row) { calls.push(['add', row.id]); rows.push({ ...structuredClone(row), _ID_: rowId }); return true; },
            delRowData(g, rowId) { const i = rows.findIndex(r => r._ID_ === rowId); if (i >= 0) rows.splice(i, 1); return true; },
        },
    };
    return { env, grid, rows, calls, callbacks, structures, parameterIds, beforeIds, read: name => env[name] };
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
    const structure = JSON.stringify({ structure: { child: 'STR' }, info: { child: { key: 'child', dataType: 'STR' } } });
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
    f.env.failRhs = true;
    const plan = localVariableTransfer(data, f.read, 'paste');
    assert.throws(() => plan.apply(), /native failure/);
    assert.deepEqual(f.rows, [definition('kept')]);
    assert.equal(f.parameterIds.size, 0);
    assert.deepEqual(f.structures, { target: {} });
});

test('serialized MAIN helper carries copied definitions across independent source and destination contexts', () => {
    const fn = vm.runInNewContext('(' + localVariableTransfer.toString() + ')', { Event });
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
        jq.divTab = selector => selector === '#variableList' ? f.grid : selector === '#id' ? { 0: t.owner, length: 1, val: () => 'target' } : divTab(selector);
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

test('script registration handles unchecked declaration without opening any cell editor', () => {
    const f = environment();
    f.env.JqGridHelper.addRowData = f.env.JqGridHelper.delRowData = () => { throw Error('forbidden low-level write'); };
    const read = name => {
        assert.notEqual(name, 'variableParameterId', 'extension must not manage the native ID map');
        return f.read(name);
    };
    const plan = localVariableTransfer(copied([logic()], [definition('value', { initYn: '' })]), read, 'paste');
    plan.apply();
    assert.equal(f.rows[0].initYn, '');
    assert.equal(f.calls.filter(c => c[0] === 'set-row').length, 1);
    assert.deepEqual(f.calls.filter(c => c[0] === 'native-save').map(c => c[1]), ['id', 'name', 'initYn']);
    assert.deepEqual(f.grid[0].p.savedRow, [], 'the live grid never enters edit mode');
    plan.rollback();
    assert.equal(f.rows.length, 0);
    assert.ok(f.calls.some(c => c[0] === 'native-delete'));
});

test('native ID rejection is detected by readback and rolls back new rows only', () => {
    const f = environment([definition('kept')]);
    const afterSave = f.callbacks.afterSaveCell;
    f.callbacks.afterSaveCell = (...args) => {
        afterSave(...args);
        const row = f.rows.find(r => r.id === 'value');
        if (row) row.id = 'rejected';
    };
    const plan = localVariableTransfer(copied([logic()], [definition('value')]), f.read, 'paste');
    assert.throws(() => plan.apply(), /설정을 완료/);
    assert.deepEqual(f.rows, [definition('kept')]);
});

test('malformed structures and missing registration callback fail before any row is added', () => {
    for (const missing of [false, true]) {
        const f = environment();
        if (missing) delete f.callbacks.afterSaveCell;
        const data = copied([logic()], [definition('value', { dataTypeId: 'OBJ', dataStructure: '{"structure":{"child":false},"info":{}}' })]);
        const plan = localVariableTransfer(data, f.read, 'paste');
        assert.throws(() => plan.apply(), /구조|등록 기능/);
        assert.equal(f.rows.length, 0);
        assert.ok(!f.calls.some(c => c[0] === 'native-add'));
    }
});

test('object registration never calls or dismisses a structure dialog', () => {
    const f = environment();
    f.env.parent = { $: () => { throw Error('must not access popup'); } };
    const data = copied([logic()], [definition('value', { dataTypeId: 'OBJ', dataStructure: '{"structure":{"child":"STR"},"info":{}}' })]);
    const plan = localVariableTransfer(data, f.read, 'paste');
    plan.apply();
    assert.equal(f.rows.length, 1);
    assert.equal(f.structures.target.value, f.rows[0].dataStructure);
});

test('a changed grid rejects mutation and failed native deletion reports remaining rows', () => {
    const f = environment();
    const plan = localVariableTransfer(copied([logic()], [definition('value')]), f.read, 'paste');
    const original = f.env.$.divTab;
    f.env.$.divTab = selector => selector === '#variableList' ? { ...f.grid, 0: {} } : original(selector);
    assert.throws(() => plan.apply(), /화면이 변경/);
    assert.equal(f.rows.length, 0);
    f.env.$.divTab = original;
    f.env.gridDelBtn = () => {};
    const failedCleanup = localVariableTransfer(copied([logic()], [definition('value')]), f.read, 'paste');
    failedCleanup.apply();
    assert.throws(() => failedCleanup.rollback(), /자동으로 취소하지 못했습니다/);
    assert.equal(f.rows.length, 1);
});

test('an add handler throwing after creation still cleans up through the native delete route', () => {
    const f = environment();
    const add = f.env.gridAddBtn;
    f.env.gridAddBtn = () => { add(); throw Error('post-add failure'); };
    const plan = localVariableTransfer(copied([logic()], [definition('value')]), f.read, 'paste');
    assert.throws(() => plan.apply(), /post-add failure/);
    assert.equal(f.rows.length, 0);
});

test('invalid IDs, reserved words and invalid types reject before adding rows', () => {
    for (const extra of [{ id: '1bad' }, { id: 'reserved' }, { dataTypeId: 'MISSING' }, { initYn: 'N' }]) {
        const f = environment();
        f.env.CommonHelper.checkReservedWord = id => id === 'reserved';
        const def = definition('value', extra);
        const plan = localVariableTransfer(copied([logic({ id: def.id })], [def]), f.read, 'paste');
        assert.throws(() => plan.apply(), /사용할 수 없습니다|올바르지 않습니다/);
        assert.equal(f.rows.length, 0);
    }
});

test('cleanup failure retains the original registration error as well as the remaining-row warning', () => {
    const f = environment();
    f.env.JqGridHelper.setRowData = () => { throw Error('registration failed'); };
    f.env.gridDelBtn = () => {};
    const plan = localVariableTransfer(copied([logic()], [definition('value')]), f.read, 'paste');
    assert.throws(() => plan.apply(), /registration failed.*자동으로 취소하지 못했습니다/);
});

const nativeDir = process.env.LAMP7_EVENT_SOURCE_DIR || 'D:/02.Workspace/studio_cloud/studio/src/main/resources/static/js/screen/event';
function nativeCallbacks(file, fn, context) {
    const source = ts.createSourceFile(file, readFileSync(nativeDir + '/' + file, 'utf8'), ts.ScriptTarget.Latest, true);
    const setup = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === fn);
    const result = {};
    const visit = node => {
        if (ts.isPropertyAssignment(node) && ['beforeSaveCell', 'afterSaveCell'].includes(node.name.getText(source))) {
            result[node.name.getText(source)] = vm.runInContext('(' + node.initializer.getText(source) + ')', context);
        }
        ts.forEachChild(node, visit);
    };
    visit(setup);
    return result;
}

for (const [file, fn] of [['eventInfoEdit.js', 'setGrid_evt'], ['transactionEdit.js', 'setGrid_tran']]) {
    test(`local Lamp7 ${fn} callbacks register IDs and structures without cell widgets or undefined old IDs`, { skip: !existsSync(nativeDir + '/' + file) }, () => {
        const f = environment([definition('value')]);
        const changes = [];
        const ctx = vm.createContext({
            ...f.env, gridId: 'variableList', _inputParamListGridId_: 'inputParams',
            _outParamListGridId_: 'outputParams', _beforeChangeParamId_: f.beforeIds,
            _VAR_TYPE: 'V', _ITER_INPARAM_TYPE: 'I', _message_: { alarm: 'alarm' },
            getType: () => fn === 'setGrid_evt' ? 'event' : 'transaction',
            getUidCheckParam: (a, b, id) => id, getUidCheckItemId: (a, b, id) => id,
            LogicUtils: { changeUseVariable: (...args) => changes.push(args) },
            LogicEditor: { getAll: () => [] },
            PopupHelper: { openAlert() { throw Error('unexpected popup'); } },
        });
        Object.assign(f.callbacks, nativeCallbacks(file, fn, ctx));
        const structure = JSON.stringify({ structure: { child: 'STR' }, info: { child: { key: 'child', dataType: 'STR' } } });
        const data = copied([logic({ setParamType: 'V', setParamId: 'rhs' })], [
            definition('value', { dataTypeId: 'OBJ', dataType: 'Object', dataStructure: structure }),
            definition('rhs', { dataTypeId: 'NUM', dataType: 'Number', initYn: '' }),
        ]);
        const plan = localVariableTransfer(data, f.read, 'paste');
        plan.apply();
        assert.equal(plan.logics[0].variable.id, 'value1');
        assert.deepEqual(f.rows[0], definition('value'));
        assert.equal(f.rows[2].initYn, '');
        assert.equal(f.rows[2].dataType, 'Number');
        assert.deepEqual([...f.parameterIds.values()], ['value1', 'rhs']);
        assert.equal(f.structures.target.value1, structure);
        assert.equal(f.beforeIds.size, 0);
        assert.deepEqual(changes, [['varParam1', 'value1', 'V'], ['varParam2', 'rhs', 'V']]);
        assert.deepEqual(f.grid[0].p.savedRow, []);
    });

    test(`local Lamp7 ${fn} duplicate rejection preserves existing rows`, { skip: !existsSync(nativeDir + '/' + file) }, () => {
        const f = environment([definition('kept')]);
        const ctx = vm.createContext({
            ...f.env, gridId: 'variableList', _inputParamListGridId_: 'inputParams',
            _outParamListGridId_: 'outputParams', _beforeChangeParamId_: f.beforeIds,
            _VAR_TYPE: 'V', _ITER_INPARAM_TYPE: 'I', _message_: { alarm: 'alarm' },
            getType: () => fn === 'setGrid_evt' ? 'event' : 'transaction',
            getUidCheckParam: () => 'duplicate', getUidCheckItemId: (a, b, id) => id,
            PopupHelper: { openAlert() {} },
        });
        Object.assign(f.callbacks, nativeCallbacks(file, fn, ctx));
        const plan = localVariableTransfer(copied([logic()], [definition('value')]), f.read, 'paste');
        assert.throws(() => plan.apply(), /설정을 완료하지 못했습니다/);
        assert.deepEqual(f.rows, [definition('kept')]);
    });
}
