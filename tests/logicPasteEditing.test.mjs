import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { prepareLogicPasteContext, readLogicPasteContext } from '../src/features/edit/background/pasteContext.ts';
import { mainWorldFunctionSource } from '../src/shared/mainWorld/sourceBuilder.ts';
import { logicHarness } from './logicPasteHarness.mjs';

function editingFixture() {
    const t = logicHarness();
    t.seed([{ id: 'condition', type: 'condition', condition: { prefix: 'if' } }]);
    const head = new t.Node('condition-head-row', 'head-logic editable');
    t.nodes.get('condition').append(head);
    const logic = t.logics.get('condition');
    return { ...t, head, logic };
}
const copied = [{ id: 'copy', type: 'event', seq: 1 }];

test('paste preparation finishes native editing and snapshots the committed input', () => {
    const t = editingFixture();
    let finishes = 0;
    t.logic.setDisable = function () {
        finishes++;
        this.condition.prefix = 'else';
        t.head.classes.delete('editable');
        // Native setDisable returns undefined on success.
    };
    const before = readLogicPasteContext('paste-1', t.helpers);
    assert.equal(finishes, 0, 'reading and commit guards must not finish editing');
    const context = t.start();
    assert.equal(finishes, 1);
    assert.notEqual(context.signature, before.signature);
    assert.equal(t.calls.create, 0, 'choosing a position must not create logic');
    const result = t.paste(copied, { anchorId: 'condition', position: 'inside' }, context);
    assert.equal(result.createdCount, 1);
    assert.equal(result.setupError, undefined);
    assert.equal(t.logics.get('new1').parentId, 'condition');
    assert.equal(finishes, 1, 'committing must not run native edit completion again');
});

test('native validation rejection keeps input open and creates nothing', () => {
    const t = editingFixture();
    t.logic.setDisable = () => false;
    assert.throws(() => t.start(), /입력값을 확인/);
    assert.equal(t.head.classes.has('editable'), true);
    assert.equal(t.calls.create, 0);
    assert.equal(t.host.dataset.pasteMode, undefined);
});

test('missing or ineffective edit completion cannot silently discard active input', () => {
    for (const finish of [undefined, () => undefined]) {
        const t = editingFixture();
        t.logic.setDisable = finish;
        assert.throws(() => t.start(), /편집을 종료하지 못했습니다/);
        assert.equal(t.head.classes.has('editable'), true);
        assert.equal(t.calls.create, 0);
    }
});

test('unsupported or mismatched editors are rejected before finishing input', () => {
    for (const invalidate of [
        t => { t.renderer.renderLogics = undefined; },
        t => { t.logic.getElement = () => new t.Node('outside'); },
    ]) {
        const t = editingFixture();
        let finishes = 0;
        t.logic.setDisable = () => { finishes++; };
        invalidate(t);
        assert.throws(() => t.start());
        assert.equal(finishes, 0);
        assert.equal(t.calls.create, 0);
    }
});

test('an edit reopened during position picking is rejected without finishing or creating', () => {
    const t = editingFixture();
    t.head.classes.delete('editable');
    const context = t.start();
    t.head.classes.add('editable');
    let finishes = 0;
    t.logic.setDisable = () => { finishes++; };
    const result = t.paste(copied, { anchorId: '', position: 'root-end' }, context);
    assert.match(result.setupError, /편집 상태가 변경/);
    assert.equal(result.createdCount, 0);
    assert.equal(finishes, 0);
});

const nativeDir = process.env.LAMP7_LOGIC_SOURCE_DIR || 'D:/02.Workspace/studio_cloud/studio/src/main/resources/static/js/screen/event/logic';
test('serialized preparation follows actual local Lamp7 setDisable validation and completion', {
    skip: !existsSync(nativeDir + '/Logic.js'),
}, () => {
    const source = ts.createSourceFile('Logic.js', readFileSync(nativeDir + '/Logic.js', 'utf8'), ts.ScriptTarget.Latest, true);
    const method = source.statements.find(ts.isClassDeclaration).members
        .find(member => member.name?.getText(source) === 'setDisable').getText(source);
    const prepare = vm.runInNewContext('(' + mainWorldFunctionSource(prepareLogicPasteContext) + ')');
    const read = vm.runInNewContext('(' + mainWorldFunctionSource(readLogicPasteContext) + ')');
    for (const valid of [true, false]) {
        const t = editingFixture();
        const rendered = [];
        const head = {
            length: 1,
            parent: () => ({ removeClass: value => t.head.classes.delete(value) }),
            empty: () => rendered.push('empty'),
            append: value => rendered.push(value),
        };
        const divTab = t.env.$.divTab;
        t.env.$.divTab = selector => selector === '#condition-head-row' ? head : divTab(selector);
        t.env.LogicRenderer.logicHeadView = text => text;
        t.logic.isEditable = () => t.head.classes.has('editable');
        t.logic.getDisplayText = () => 'committed input';
        t.logic.validate = () => valid;
        t.logic.setDisable = vm.runInNewContext('class NativeLogic { ' + method + ' }; NativeLogic.prototype.setDisable', t.env);
        if (valid) {
            const context = prepare('paste-1', t.helpers, read);
            assert.equal(context.rows[0].id, 'condition');
            assert.equal(t.head.classes.has('editable'), false);
            assert.deepEqual(rendered, ['empty', 'committed input']);
        } else {
            assert.throws(() => prepare('paste-1', t.helpers, read), /입력값을 확인/);
            assert.equal(t.head.classes.has('editable'), true);
            assert.deepEqual(rendered, []);
        }
        assert.equal(t.calls.create, 0);
    }
});
