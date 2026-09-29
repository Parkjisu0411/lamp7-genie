import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync,existsSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { logicHarness } from './logicPasteHarness.mjs';
import { pickLogicPasteLocation } from '../src/features/edit/pasteGeometry.ts';
import { pasteCopiedLogicsInMainWorld } from '../src/features/edit/background/pasteLogicCreator.ts';
import { readLogicPasteContext } from '../src/features/edit/background/pasteContext.ts';
import { mainWorldFunctionSource } from '../src/shared/mainWorld/sourceBuilder.ts';

const base=[{id:'tranA',type:'transaction',transaction:{id:'A'}},{id:'condition',type:'condition',condition:{prefix:'if'}},{id:'child',type:'variable',parentId:'condition'},{id:'next',type:'condition',condition:{prefix:'else'}},{id:'nextChild',type:'variable',parentId:'next'}];
const copy=(id='copy',type='transaction',extra={})=>({id,type,seq:10,transaction:{id:'B'},...extra});
const setup=()=>{const t=logicHarness();t.seed(base);return t;};

test('native paste rendering treats absent grids as empty and restores the reader after completion',()=>{
    const t=setup(),rows=[{id:'local1',name:'Local'}];
    let realReads=0;
    const original=function(grid){realReads++;return {data:grid.length?rows:{}};};
    t.env.JqGridHelper={getGridDataAll:original};
    const render=t.renderer.renderLogics;
    t.renderer.renderLogics=function(items){
        assert.equal(t.env.JqGridHelper.getGridDataAll({length:0}).data.find(()=>true),undefined);
        assert.deepEqual(t.env.JqGridHelper.getGridDataAll(null).data,[]);
        assert.equal(t.env.JqGridHelper.getGridDataAll({length:1}).data,rows);
        return render.call(this,items);
    };
    const result=t.paste([copy()]);
    assert.equal(result.setupError,undefined);assert.equal(result.createdCount,1);
    assert.equal(realReads,1);assert.equal(t.env.JqGridHelper.getGridDataAll,original);
});

test('temporary absent-grid adapter is restored on native rendering failure and stale target',()=>{
    const t=setup();const original=()=>({data:{invalid:'real grid data'}});
    t.env.JqGridHelper={getGridDataAll:original};
    t.renderer.renderLogics=()=>{t.env.JqGridHelper.getGridDataAll({length:1}).data.find(()=>true);};
    const result=t.paste([copy()]);
    assert.match(result.setupError,/find is not a function/);
    assert.equal(t.env.JqGridHelper.getGridDataAll,original);
    const fresh=setup();fresh.env.JqGridHelper={getGridDataAll:original};
    const expected=fresh.start();expected.ownerId='stale';
    const stale=fresh.paste([copy()],{anchorId:'',position:'root-end'},expected);
    assert.equal(stale.createdCount,0);assert.equal(fresh.env.JqGridHelper.getGridDataAll,original);
});
function assertAfter(t){const res=t.paste([copy()],{anchorId:'tranA',position:'after'});assert.equal(res.createdCount,1);assert.equal(res.setupError,undefined);assert.deepEqual(t.editor.getAll().map(l=>l.id),['tranA','new1','condition','child','next','nextChild']);assert.equal(t.logics.get('condition').parentTranId,'B');assert.equal(t.logics.get('condition').condition.parentTranId,'B');assert.equal(t.logics.get('child').parentTranId,'B');assert.equal(t.logics.get('nextChild').parentTranId,'B');assert.ok(t.validated.includes('nextChild'));assert.ok(t.connects>1);}

test('sibling paste recalculates downstream existing transaction links and validates descendants',()=>assertAfter(setup()));
test('inside paste appends to existing children, remaps copied forest, and keeps the input snapshot intact',()=>{const t=setup();const copied=[copy('nested','variable',{parentId:'group',seq:12,variable:{value:'original'}}),copy('group','condition',{seq:11,condition:{prefix:'if'}}),copy('last','event',{seq:13})];const before=structuredClone(copied);const r=t.paste(copied,{anchorId:'condition',position:'inside'});assert.equal(r.createdCount,3);assert.deepEqual(t.nodes.get('condition_processLogic').children.map(n=>n.id),['child','new1','new3']);assert.equal(t.logics.get('new2').parentId,'new1');assert.equal(t.logics.get('new2').lvl,2);assert.equal(t.logics.get('new1').parentTranId,'A');assert.equal(t.logics.get('condition').expanded,true);assert.ok(t.validated.includes('child'));assert.deepEqual(copied,before);});
test('after a parent means after the whole subtree at the same level',()=>{const t=setup();t.paste([copy()],{anchorId:'condition',position:'after'});assert.deepEqual(t.area.children.map(n=>n.id),['tranA','condition','new1','next']);assert.equal(t.logics.get('new1').parentId,'');});
test('after a child retains its parent and root-start works in an empty editor',()=>{const t=setup();t.paste([copy()],{anchorId:'child',position:'after'});assert.equal(t.logics.get('new1').parentId,'condition');const empty=logicHarness();assert.equal(empty.paste([copy()],{anchorId:'',position:'root-start'}).createdCount,1);});
test('only native condition/iteration child containers are allowed, and AND/OR uses the last member',()=>{const t=logicHarness();t.seed([{id:'c1',type:'condition',condition:{prefix:'if'}},{id:'c2',type:'condition',condition:{prefix:'and'}},{id:'tx',type:'transaction',transaction:{id:'A'}}]);const c=t.start();assert.equal(c.rows.find(r=>r.id==='c1').canNest,false);assert.equal(c.rows.find(r=>r.id==='c2').canNest,true);assert.ok(t.paste([copy()],{anchorId:'c1',position:'inside'},c).setupError);assert.equal(t.calls.create,0);assert.ok(t.paste([copy()],{anchorId:'tx',position:'inside'}).setupError);});
test('rejects stale event, model structure, removed shield and consumed click before any creation',()=>{for(const change of [t=>t.env._tabId_='different',t=>t.owner.value='different',t=>t.logics.get('child').parentId='',t=>t.host.dataset.pastePhase='consumed',t=>t.host.dataset.pasteMode='other',t=>t.area.setAttribute('data-genie-paste-mode','other')]){const t=setup(),c=t.start();change(t);assert.ok(t.paste([copy()],{anchorId:'tranA',position:'after'},c).setupError);assert.equal(t.calls.create,0);}});
test('one click cannot paste twice',()=>{const t=setup(),context=t.start();t.paste([copy()],{anchorId:'',position:'root-end'},context);const calls=t.calls.create;assert.ok(t.paste([copy()],{anchorId:'',position:'root-end'},context).setupError);assert.equal(t.calls.create,calls);});
test('invalid copy cycles, duplicate IDs and invalid parent types do not mutate the destination',()=>{for(const copies of [[copy('a','condition',{parentId:'b'}),copy('b','condition',{parentId:'a'})],[copy(),copy()],[copy('a'),copy('b','variable',{parentId:'a'})]]){const t=setup();assert.ok(t.paste(copies).setupError);assert.equal(t.calls.create,0);}});
test('creation failure skips dependent children and keeps accurate partial results',()=>{const t=setup();t.calls.failCreate.add('broken');const r=t.paste([copy('a','condition',{name:'broken'}),copy('b','event',{parentId:'a'}),copy('c')]);assert.equal(r.createdCount,1);assert.equal(r.errors.length,2);assert.equal(t.logics.get('new1').type,'transaction');});
test('missing native APIs reject before creating; rendering failure reports the created count',()=>{const t=setup();t.renderer.renderLogics=undefined;assert.throws(()=>t.start());assert.equal(t.calls.create,0);const t2=setup(),c=t2.start();t2.renderer.renderLogics=()=>{throw Error('renderer failed');};const r=t2.paste([copy()],{anchorId:'',position:'root-end'},c);assert.equal(r.createdCount,1);assert.match(r.setupError,/renderer failed/);});
test('native validation exceptions are visible without pretending the paste did not happen',()=>{const t=setup();t.calls.failValidate.add('condition');const r=t.paste([copy()],{anchorId:'tranA',position:'after'});assert.equal(r.createdCount,1);assert.equal(r.validationWarnings,1);});
test('MAIN functions survive serialization without imported runtime references',()=>{const paste=vm.runInNewContext('('+mainWorldFunctionSource(pasteCopiedLogicsInMainWorld)+')');const read=vm.runInNewContext('('+mainWorldFunctionSource(readLogicPasteContext)+')');const t=setup(),context=t.start();const r=paste({modeId:context.modeId,context,logics:[copy()],location:{anchorId:'condition',position:'inside'}},t.helpers,read);assert.equal(r.createdCount,1);assert.equal(r.setupError,undefined);});
test('pointer distinguishes parent header interior, lower edge, leaf, blank root and outside',()=>{const clip={left:0,top:0,width:800,height:600};const rows=[{id:'p',canNest:true,head:{left:50,top:50,width:700,height:40},body:{left:50,top:50,width:700,height:200}},{id:'c',canNest:false,head:{left:80,top:90,width:670,height:40},body:{left:80,top:90,width:670,height:40}}];assert.equal(pickLogicPasteLocation(rows,clip,300,65).location.position,'inside');assert.equal(pickLogicPasteLocation(rows,clip,300,85).location.position,'after');assert.equal(pickLogicPasteLocation(rows,clip,300,100).location.anchorId,'c');assert.equal(pickLogicPasteLocation(rows,clip,300,350).location.position,'root-end');assert.equal(pickLogicPasteLocation(rows,clip,300,30).location.position,'root-start');assert.equal(pickLogicPasteLocation(rows,clip,900,60),null);});

const nativeDir=process.env.LAMP7_LOGIC_SOURCE_DIR||'D:/02.Workspace/studio_cloud/studio/src/main/resources/static/js/screen/event/logic';
test('local Lamp7 actual resetLogicLevelAndSeqAll/getParentTranId update existing native fields', {skip:!existsSync(nativeDir+'/logicEditor.js')},()=>{
    const t=setup();
    const method=(file,name)=>{const source=ts.createSourceFile(file,readFileSync(nativeDir+'/'+file,'utf8'),ts.ScriptTarget.Latest,true);return source.statements.find(ts.isClassDeclaration).members.find(m=>m.name?.getText(source)===name).getText(source);};
    const ctx=vm.createContext({...t.env,LogicUtils:t.utils});
    t.utils.getParentTransactionLogic=vm.runInContext('class NativeUtils { '+method('logicUtils.js','getParentTransactionLogic')+' }; NativeUtils.getParentTransactionLogic',ctx);
    t.utils.getParentTranId=vm.runInContext('class NativeParent { '+method('logicUtils.js','getParentTranId')+' }; NativeParent.getParentTranId',ctx);
    t.editor.resetLogicParentId=vm.runInContext('class NativeParentReset { '+method('logicEditor.js','resetLogicParentId')+' }; NativeParentReset.resetLogicParentId',ctx);
    t.editor.resetLogicLevelAndSeqAll=vm.runInContext('class NativeReset { '+method('logicEditor.js','resetLogicLevelAndSeqAll')+' }; NativeReset.resetLogicLevelAndSeqAll',ctx);
    assertAfter(t);
});
test('paste marker reads DOMRect prototype accessors rather than spreading them',()=>{
    const head=Object.create({left:50,top:70,width:500,height:40});
    const p=pickLogicPasteLocation([{id:'c',canNest:true,head,body:Object.create({left:50,top:70,width:500,height:140})}],{left:0,top:0,width:800,height:600},200,85);
    assert.equal(p.rect.top,70);assert.equal(p.rect.height,40);
});

test('native condition connector receives the entire sequence for copied ELSE, without patching its method', {skip:!existsSync(nativeDir+'/logicRenderer.js')},()=>{
    const t=setup();
    const source=ts.createSourceFile('logicRenderer.js',readFileSync(nativeDir+'/logicRenderer.js','utf8'),ts.ScriptTarget.Latest,true);
    const method=source.statements.find(ts.isClassDeclaration).members.find(m=>m.name?.getText(source)==='connectConditionLogic').getText(source);
    const connect=vm.runInNewContext('class NativeRenderer { '+method+' }; NativeRenderer.connectConditionLogic',t.env);
    const render=t.renderer.renderLogics;
    t.renderer.connectConditionLogic=connect;
    t.renderer.renderLogics=function(items){render(items);this.connectConditionLogic(items);};
    const r=t.paste([copy('else','condition',{condition:{prefix:'else'}})],{anchorId:'condition',position:'after'});
    assert.equal(r.createdCount,1);assert.equal(r.setupError,undefined);
    assert.equal(t.renderer.connectConditionLogic,connect);
});
