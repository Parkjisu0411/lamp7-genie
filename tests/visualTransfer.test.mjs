import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { transformVisualClipboard } from '../src/features/visualEdit/transformClipboard.ts';
import { transferVisualComponents } from '../src/features/visualEdit/background/transferComponents.ts';
import { pasteVisualSnapshot } from '../src/features/visualEdit/background/snapshotPaste.ts';
import { visualPlacement } from '../src/features/visualEdit/placement.ts';
import { explainVisualPlacementFailure } from '../src/features/visualEdit/placementFailure.ts';
import { placementDocument } from './fixtures/placementDom.mjs';
import { buildSelectionPolicy } from '../src/features/visualEdit/policy.ts';
import { watchVisualSelection } from '../src/features/visualEdit/background/watchSelection.ts';

const node = (key, extra = {}) => ({ key, scope: '', data: { type: 'row', tagName: 'div' },
    attributes: { id: `dom-${key}`, eid: key, vid: `v-${key}` }, classes: ['form-row'], style: {},
    setting: { id: key, name: key }, children: [], ...extra });
const clipboard = (...nodes) => ({ kind: 'lamp7-genie/visual', version: 1, id: 'clipboard-1', createdAt: 1,
    source: { origin: 'https://lamp7.test', systemId: 's', screenId: 'source-screen' },
    roots: nodes.map(n => ({ node: n, type: 'Row', label: n.key, eid: n.attributes.eid, parentRole: 'screen', placement: { draggable: '.container-fluid,.container-content', textable: false } })), images: {}, tables: [] });
const rename = id => `${id}1`;

// Snapshot creation/recovery contracts live in visualSnapshotPaste.test.mjs. These
// tests isolate the transfer boundary: token validation, read-only preparation,
// table cleanup, placement and the serialized native adapter handoff.
test('paste delegates a detached snapshot without writing settings or images',async()=>{
    const f=fixture(),data=clipboard(node('a'));
    const before=JSON.stringify({settings:f.settings,images:f.images,events:f.eventData});
    const source=JSON.stringify(data);
    const out=await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:data,position:'inside'});
    assert.equal(out.error,undefined); assert.deepEqual(out.createdIds,['native-result']);
    assert.equal(f.delegated.length,1); assert.equal(f.calls.length,0);
    assert.equal(JSON.stringify({settings:f.settings,images:f.images,events:f.eventData}),before);
    assert.equal(JSON.stringify(data),source);
    assert.equal(f.stats.sessionRequests,1);
});

test('native adapter handoff remains single-use and verifies the receiver and position',async()=>{
    const f=fixture(),data=clipboard(node('a')),anchor=f.root.get('components').models[0];
    const selection=f.arm('paste',[anchor],'after');
    assert.equal((await f.run({action:'paste',selection,clipboard:data,position:'after'})).error,undefined);
    assert.equal(f.delegated[0].index,anchor.index()+1);
    assert.equal(f.delegated[0].parent,f.root.cid);
    assert.ok((await f.run({action:'paste',selection,clipboard:data,position:'after'})).error);
    assert.equal(f.delegated.length,1);
    const fresh=f.arm('paste',[anchor],'before');
    assert.ok((await f.run({action:'paste',selection:fresh,clipboard:data,position:'after'})).error);
    assert.equal(f.delegated.length,1);
});

test('native handoff strips unavailable table bindings and copied events before creation',async()=>{
    const f=fixture(),a=node('a',{setting:{id:'a',name:'A',dtId:'19334',tableRelInfo:'missing',dcId:'col',event:['click']}});
    const out=await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:clipboard(a),position:'inside'});
    assert.equal(out.error,undefined); assert.ok(out.removedConnections>0);
    const setting=f.delegated[0].data.roots[0].node.setting;
    assert.ok(!setting.dtId);assert.ok(!setting.tableRelInfo);assert.ok(!setting.dcId);
    assert.deepEqual(setting.event,[]);
});

test('ID preparation reserves sessions and existing events before passing EIDs to native validation',async()=>{
    const f=fixture({sessions:[{variableId:'fresh'}]});
    const out=await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:clipboard(node('fresh')),position:'inside'});
    assert.equal(out.error,undefined);
    assert.notEqual(f.delegated[0].data.roots[0].node.attributes.eid,'fresh');
    assert.equal(f.stats.sessionRequests,1);
});

test('native adapter failure returns real remaining IDs and releases mutation ownership',async()=>{
    const f=fixture();
    f.context.nativeDelegate=async (_data,_parent,_index,_valid,_report,mutate)=>{mutate(true);return {createdIds:['remaining'],error:'native cleanup failed'};};
    const out=await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:clipboard(node('a')),position:'inside'});
    assert.equal(out.error,'native cleanup failed');assert.deepEqual(out.createdIds,['remaining']);
    assert.equal(f.window.__lamp7GenieVisualEdit.mutating,false);
});







test('failed or malformed session lookup and navigation during lookup cannot create components', async () => {
    for (const options of [{sessionFailure:true}, {sessions:{}}, {sessions:[{}]}]) {
        const f = fixture(options), before = JSON.stringify(f.settings);
        const result = await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:clipboard(node('a')),position:'inside'});
        assert.ok(result.error); assert.equal(f.calls.length,0); assert.equal(JSON.stringify(f.settings),before);
    }
    const f = fixture({onFetch:async()=>{delete f.window.__lamp7GenieVisualEdit;}});
    const result = await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:clipboard(node('a')),position:'inside'});
    assert.match(result.error,/화면이 변경/); assert.equal(f.calls.length,0);
});



test('internal sibling links follow new IDs; external references never attach to same-ID target items', async()=> {
    const a = node('a'), label = node('label');
    a.setting = { id: 'a', name: 'a', labelId: 'label', elTarget: ['label','outside'], dtId: 'outside', dcId: 'a', placeholder: 'label' };
    a.attributes.labelid = 'label'; a.attributes.eltarget = 'label,outside';
    label.setting.valueId = 'a'; label.attributes.for = 'dom-a';
    const original = clipboard(a,label), before = JSON.stringify(original);
    const output = transformVisualClipboard(original, rename).clipboard;
    const [x,y] = output.roots.map(r => r.node);
    assert.equal(x.setting.labelId,'label1'); assert.deepEqual(x.setting.elTarget,['label1']);
    assert.equal(x.attributes.labelid,'label1'); assert.equal(x.attributes.eltarget,'label1');
    assert.equal(y.setting.valueId,'a1'); assert.equal(y.attributes.for,'dom-a1');
    assert.equal(x.setting.dtId,'outside'); assert.equal(x.setting.dcId,'a'); assert.equal(x.setting.placeholder,'label');
    assert.equal(JSON.stringify(original),before);
    const alone = transformVisualClipboard(clipboard(a), rename).clipboard.roots[0].node;
    assert.equal(alone.setting.labelId,''); assert.equal(alone.attributes.labelid,undefined);
});

test('conditions and arithmetic clear as whole settings when an operand is outside the bundle', async()=> {
    const a = node('a');
    a.setting.showOn = [{eType:'E',eid:'a',valueType:'L',valueId:'literal'}];
    a.setting.editableOn = [{eType:'E',eid:'outside',valueType:'E',valueId:'a'}];
    a.setting.calcurationSetting = [{eid:'a'}, {children:{eid:'outside',gridId:'a'}}];
    a.setting.selectDataMapping = [{sourceId:'a',_ID_:'a',targetId:'database-column'}];
    const result = transformVisualClipboard(clipboard(a),rename).clipboard.roots[0].node;
    assert.deepEqual(result.setting.showOn,[{eType:'E',eid:'a1',valueType:'L',valueId:'literal'}]);
    assert.deepEqual(result.setting.editableOn,[]); assert.deepEqual(result.setting.calcurationSetting,[]);
    assert.equal(result.attributes.showon,',a1,'); assert.equal(result.attributes.editableon,undefined);
    assert.deepEqual(result.setting.selectDataMapping,[{sourceId:'a1',_ID_:'a1',targetId:'database-column'}]);
});

test('event executions, scripts and newer Blockly calculation logic are excluded', async()=> {
    const a = node('a');
    a.setting.event=['click']; a.setting.selectEvent='pick'; a.setting.transaction=['t1'];
    a.setting.calcurationSetting = {logic:{type:'lamp7_screen_element',fields:{element:'outside'}}};
    a.attributes.onclick='run()'; a.attributes.selectevent='pick'; a.data.script='run()';
    const result = transformVisualClipboard(clipboard(a),rename).clipboard.roots[0].node;
    assert.deepEqual(result.setting.event,[]); assert.equal(result.setting.selectEvent,'');
    assert.deepEqual(result.setting.transaction,[]); assert.deepEqual(result.setting.calcurationSetting,{});
    assert.equal(result.attributes.onclick,undefined); assert.equal(result.data.script,undefined);
});

test('whole Grid shares repeated logical eid/vid but each DOM ID remains unique', async()=> {
    const g = node('g',{scope:'g',classes:['grid-compo']});
    g.children = [node('first',{scope:'g'}),node('second',{scope:'g'})];
    for (const n of g.children) { n.attributes.eid='value'; n.attributes.vid='shared'; n.setting={id:'value',labelId:'g',listId:'g'}; }
    const calls=[];
    const copy = transformVisualClipboard(clipboard(g),(id,attr) => { calls.push([id,attr]); return id+'1'; }).clipboard.roots[0].node;
    assert.equal(copy.children[0].attributes.eid,copy.children[1].attributes.eid);
    assert.equal(copy.children[0].attributes.vid,copy.children[1].attributes.vid);
    assert.notEqual(copy.children[0].attributes.id,copy.children[1].attributes.id);
    assert.equal(calls.filter(([id,attr]) => id==='value' && attr==='eid').length,1);
    assert.equal(copy.children[0].setting.listId,'g1');
});

test('derived duration and button IDs use the renamed owner, not independent suffixes', async()=> {
    for (const [kind,suffixes] of [['duration-date-compo',['│from','│to']],['dataselect-compo',['_addBtn','_selectBtn','_deleteBtn']],['inputgroup-compo',['_inputGroupBtn']]]) {
        const p=node('parent',{classes:[kind]}); p.children=suffixes.map(suffix=>node('parent'+suffix));
        const calls=[];
        const result=transformVisualClipboard(clipboard(p),(id,attr,related)=>{calls.push([id,attr,related]);return id+'1';}).clipboard.roots[0].node;
        assert.deepEqual(result.children.map(n=>n.attributes.eid),suffixes.map(s=>'parent1'+s));
        assert.deepEqual(result.children.map(n=>n.setting.id),suffixes.map(s=>'parent1'+s));
        assert.deepEqual(calls.find(([id,attr])=>id==='parent'&&attr==='eid')[2],suffixes);
        assert.equal(calls.filter(([id,attr])=>suffixes.some(s=>id==='parent'+s)&&attr==='eid').length,0);
    }
});

test('radio names stay grouped by owner; tab/group DOM links and image keys follow new IDs', async()=> {
    const a=node('a',{classes:['radio-compo']}), b=node('b',{classes:['radio-compo']});
    for (const p of [a,b]) p.children=[0,1].map(i=>node(`${p.key}-${i}`,{attributes:{id:`${p.key}-${i}`,type:'radio',name:'shared-name'}}));
    a.attributes['data-target']='#dom-b'; a.attributes['aria-controls']='dom-b';
    const data=clipboard(a,b); data.images.a_pre=[{fileName:'test.png',fileData:'data:image/png;base64,AAAA'}];
    const counters={};
    const output=transformVisualClipboard(data,(id,attr)=>`${id}${counters[attr+id]=(counters[attr+id]??0)+1}`).clipboard;
    const [x,y]=output.roots.map(r=>r.node);
    assert.equal(x.children[0].attributes.name,x.children[1].attributes.name);
    assert.notEqual(x.children[0].attributes.name,y.children[0].attributes.name);
    assert.equal(x.attributes['data-target'],'#dom-b1'); assert.equal(x.attributes['aria-controls'],'dom-b1');
    assert.deepEqual(output.images.a1_pre,data.images.a_pre);
});

test('embedded Grid headers, chart fields and tree defaults are remapped without changing text', async()=> {
    const a=node('a'), b=node('b');
    a.setting.gridHeaders=[{id:'b',childHeader:['a'],name:'b'}];
    a.setting.chartSetting={axes:[{labelEid:'a',valueGridColId:'b',title:'b'}]};
    a.setting.defaultValueInfo=JSON.stringify({a:{nodeId:'b',elementId:'a',defaultValue:'b'},outside:{defaultValue:'x'}});
    const out=transformVisualClipboard(clipboard(a,b),rename).clipboard.roots[0].node.setting;
    assert.deepEqual(out.gridHeaders,[{id:'b1',childHeader:['a1'],name:'b'}]);
    assert.deepEqual(out.chartSetting,{axes:[{labelEid:'a1',valueGridColId:'b1',title:'b'}]});
    assert.deepEqual(JSON.parse(out.defaultValueInfo),{a1:{nodeId:'b1',elementId:'a1',defaultValue:'b'}});
});

// Serialized MAIN functions operate in a fresh world, with no imported closures.
function fixture(options={}) {
    const document=new EventTarget(),window=new EventTarget();
    const dom = placementDocument(); document.createElement = dom.createElement;
    class CustomEvent extends Event { constructor(type,init) { super(type); this.detail=init.detail; } }
    const canvas={querySelector:()=>null}, frame={contentDocument:canvas,isConnected:true}; document.querySelector=()=>frame;
    const listeners=new Map(), calls=[], settings={}, images={}, eventData={eventInfos:[{id:'event-reserved',logics:[{original:true}]}]};
    const stats={views:0,snapshots:0};
    const emit=name=>{for(const fn of listeners.get(name)??[])fn();};
    let serial=0;
    const make=(n,parent)=>{
        const id=`m${++serial}`, attrs={...n.attributes}, models=[];
        const data={draggable:'.container-fluid,.container-content',droppable:false,...n.data,attributes:attrs,components:{models},style:n.style,selectable:true,removable:true};
        const classes=n.classes??[];
        const el=dom.createElement(data.tagName||'div');
        for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);
        el.className=classes.join(' '); el.parentElement=parent?.getEl()??null;
        const m={cid:id,get:k=>data[k],getAttributes:()=>({...attrs,class:classes.join(' ')}),getStyle:()=>data.style,
            setAttributes(value){for(const key of Object.keys(attrs))delete attrs[key];Object.assign(attrs,value);},
            getEl:()=>{stats.views++;return el;},toJSON:()=>({...data}),parent:()=>parent,index:()=>parent?.get('components').models.indexOf(m)??0,
            append(value,{at}) { calls.push(value); if(options.failAt===calls.length)throw Error('append failure');
                if(typeof value==='string') { const template=dom.createElement('template');template.innerHTML=value;const e=template.content.firstElementChild;value={type:e.classList.contains('form-row')?'row':'col',tagName:'div',classes:[...e.classList],attributes:Object.fromEntries(['id','eid','vid'].map(k=>[k,e.getAttribute(k)])),components:[],style:{},droppable:true}; }
                const child=make({data:value,attributes:value.attributes,style:value.style,classes:value.classes,children:[]},m);
                const build=(dest,items)=>{for(const v of items){ const c=make({data:v,attributes:v.attributes,style:v.style,classes:v.classes,children:[]},dest);dest.get('components').models.push(c);dest.getEl().children.push(c.getEl());build(c,v.components??[]); }};
                build(child,value.components??[]);models.splice(at,0,child);el.children.splice(at,0,child.getEl());emit('component:add');return [child]; } };
        n.children?.forEach(child=>{ const c=make(child,m);models.push(c);el.children.push(c.getEl()); });
        if(n.setting&&attrs.vid)settings[attrs.vid]=structuredClone(n.setting);
        return m;
    };
    const existing=node('existing',options.existing??{});
    const root=make(node('screen',{data:{type:'default',tagName:'main',droppable:options.droppable??true},classes:['container-fluid'],children:options.children??[existing]}),null);
    const wrapper=make(node('wrapper',{data:{type:'wrapper'},children:[]}),null);
    // Make screen a physical wrapper child without recreating it.
    root.parent=()=>wrapper; wrapper.get('components').models.push(root); wrapper.getEl().children.push(root.getEl());root.getEl().parentElement=wrapper.getEl();canvas.body=wrapper.getEl();
    const walk=(m=wrapper)=>[m,...m.get('components').models.flatMap(walk)];
    const snapshot=()=>{stats.snapshots++;return {records:walk().filter(m=>m.getEl()?.classList).map(m=>({location:{modelId:m.cid,domId:m.getEl().id,eid:m.get('attributes').eid??'',vid:m.get('attributes').vid??''},
        parentModelId:m.parent()?.cid??null,type:m.get('type'),componentType:m.get('type'),label:m.get('attributes').eid,selectable:true,hidden:false,rendered:true,
        structure:{classes:[...m.getEl().classList],tag:m.getEl().tagName,removable:true}}))};};
    const editor={getWrapper:()=>wrapper,DomComponents:{getType:()=>true},
        on(names,fn){for(const name of names.split(' ')){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);}},
        off(names,fn){for(const name of names.split(' '))listeners.get(name)?.delete(fn);}};
    const idCalls=[];
    const seq = {};
    const delegated=[];
    const context=vm.createContext({onProgress:options.progress,URL,fetch:()=>{throw Error('Native ajax transport must be used');},
        nativeDelegate: async (data,parent,index,valid,progress,mutation) => {
            assert.equal(valid(),true); delegated.push({data:structuredClone(data),index,parent:parent.cid});
            mutation(true); mutation(false);
            return {createdIds:['native-result']};
        },
        $:{ajax(request){
            stats.sessionRequests=(stats.sessionRequests||0)+1;
            stats.lastRequest={url:request.url,type:request.type,async:request.async,dataType:request.dataType,timeout:request.timeout};
            Promise.resolve().then(async()=>{
                await options.onFetch?.();
                if(options.sessionFailure)request.error({status:403},'error');
                else request.success(options.sessions??[]);
            });
        }},
        veuid(prefix){return prefix+(seq[prefix]=(seq[prefix]||0)+1);},
        getComponentsByAttribute(attr,id){return walk().filter(m=>m.get('attributes')[attr]===id);},
        window,document,CustomEvent,editor,_settingInfo:settings,_fileUploadData:images,
        _event:eventData,selectTableData:options.tables??[],_systemId_:'s',location:{origin:'https://lamp7.test',href:'https://lamp7.test/editor'},snapshot,
        BlockHelper:{row:(_,c)=>`<div class="form-row ${c||'bx-tbl'}"></div>`,col:(_,c)=>`<div class="form-col ${c}"></div>`},
        componentSetting:{'form-row':[{id:'name',defaultValue:'Row'}],'form-col':[{id:'name',defaultValue:'Col'}]},
        getCompoTypeSettingInfo(schema,out){for(const s of schema)out[s.id]=s.defaultValue;},getUid(prefix){return prefix+'1';},
        getUidCheckAttribute(id,prefix,attr){idCalls.push([id,attr]);while(walk().some(m=>m.get('attributes')[attr]===id))id+='1';return id;},
        getNewEidByCheckIdList(id,prefix,list){while(list.includes(id))id+='1';return id;}});
    vm.runInContext(`(${watchVisualSelection.toString()})('mode')`,context);
    let token=0;
    const arm=(action,selected,position='inside')=>{
        const selection={modeId:'mode',requestId:`request${++token}`,locations:selected.map(m=>snapshot().records.find(r=>r.location.modelId===m.cid).location)};
        const bridge=window.__lamp7GenieVisualEdit; if(bridge)bridge.operation=undefined;
        document.dispatchEvent(new CustomEvent('genie:visual-edit-delete-ready',{detail:{...selection,modelIds:selected.map(m=>m.cid),kind:action,position:action==='paste'?position:undefined}}));
        return selection;
    };
    const run=async payload=>JSON.parse(JSON.stringify(await vm.runInContext(`(${transferVisualComponents.toString()})(payload,sources)`,Object.assign(context,{payload,
        sources:{snapshotPaste:options.realPaste?pasteVisualSnapshot.toString():'async function(...args){return nativeDelegate(...args);}',progress:options.progress ? 'async function(mode,request,text){await onProgress(mode,request,text);}' : undefined,reader:'function(){return snapshot();}',policy:buildSelectionPolicy.toString(),transform:transformVisualClipboard.toString(),placement:visualPlacement.toString(),placementFailure:explainVisualPlacementFailure.toString()}}))));
    return {run,arm,root,wrapper,walk,settings,images,eventData,calls,idCalls,stats,context,window,frame,document,CustomEvent,delegated};
}

test('copy captures hidden descendants and style as JSON without touching source or events',async()=>{
    const hidden=node('hidden',{style:{display:'none'},data:{type:'col-compo',tagName:'input'}});
    const f=fixture({existing:{children:[hidden],style:{color:'red'}}}), source=f.root.get('components').models[0];
    f.settings['v-existing'].event=['click'];
    const before=JSON.stringify({settings:f.settings,events:f.eventData});
    const out=(await f.run({action:'copy',selection:f.arm('copy',[source])}));
    assert.equal(out.error,undefined); assert.equal(out.clipboard.roots[0].node.attributes.eid,'existing');
    assert.deepEqual(out.clipboard.roots[0].node.setting.event,[]);
    assert.equal(JSON.stringify({settings:f.settings,events:f.eventData}),before); assert.equal(f.calls.length,0);
    assert.equal(out.clipboard.source.systemId,'s');
    assert.deepEqual(out.clipboard.roots[0].node.style,{color:'red'});
    assert.deepEqual(out.clipboard.roots[0].node.children[0].style,{display:'none'});
});

test('real snapshot handoff preserves EIDs, allocates fresh internal IDs and queries sessions once',async()=>{
    const f=fixture({realPaste:true}),a=node('a'),label=node('label');
    a.setting={id:'a',labelId:'label',hiddenYn:'Y',mandatoryYn:['Y'],event:['click']};a.attributes.labelid='label';
    label.setting={id:'label',valueId:'a',mandatoryYn:['Y']};label.attributes.valueid='a';
    const data=clipboard(a,label),before=JSON.stringify(data);
    const result=await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:data,position:'inside'});
    assert.equal(result.error,undefined);assert.equal(result.createdIds.length,2);
    const added=f.root.get('components').models.slice(1),[input,text]=added.map(m=>m.getAttributes());
    assert.equal(input.eid,'a');assert.equal(text.eid,'label');
    assert.notEqual(input.id,'dom-a');assert.notEqual(input.vid,'v-a');
    assert.equal(f.settings[input.vid].labelId,text.eid);assert.equal(f.settings[text.vid].valueId,input.eid);
    assert.equal(f.settings[input.vid].hiddenYn,'Y');assert.equal(f.settings[input.vid].event.length,0);
    assert.equal(f.stats.sessionRequests,1);assert.equal(f.idCalls.length,0);assert.equal(f.calls.length,2);
    assert.equal(JSON.stringify(data),before);assert.equal(f.window.__lamp7GenieVisualEdit.mutating,false);
});

test('real import clears missing table only and keeps existing same-ID component unchanged',async()=>{
    const f=fixture({realPaste:true}),a=node('existing');a.setting.dtId='19334';a.setting.dcId='col';a.setting.tableRelInfo='absent';
    const original=JSON.stringify(f.settings['v-existing']);
    const result=await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:clipboard(a),position:'inside'});
    assert.equal(result.error,undefined);assert.equal(result.createdIds.length,1);assert.ok(result.removedConnections);
    const attrs=f.root.get('components').models[1].getAttributes();assert.notEqual(attrs.eid,'existing');
    assert.equal(f.settings[attrs.vid].dtId,'');assert.equal(f.settings[attrs.vid].dcId,'');
    assert.equal(JSON.stringify(f.settings['v-existing']),original);
});















test('target discovery is read-only; pending DOM mutation invalidation stops paste before writes',async()=>{
    const f=fixture(),data=clipboard(node('a'));
    const found=(await f.run({action:'targets',clipboard:data}));
    assert.equal(found.error,undefined);assert.deepEqual(found.targets.filter(t=>t.positions.length).map(({modelId,positions})=>({modelId,positions})),[{modelId:f.root.cid,positions:['inside']},{modelId:f.root.get('components').models[0].cid,positions:['before','after']}]);assert.equal(f.idCalls.length,0);assert.equal(f.calls.length,0);
    f.document.addEventListener('genie:visual-edit-delete-mutating',()=>f.window.__lamp7GenieVisualEdit.dispose());
    assert.ok((await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:data,position:'inside'})).error);
    assert.equal(f.calls.length,0);assert.equal(f.settings['v-a'],undefined);
});





test('disjoint individual destinations explain no common location; no subset is pasted',async()=>{
    const f=fixture({droppable:false,children:[node('a-slot',{classes:['slot-a'],data:{type:'col',droppable:true}}),node('b-slot',{classes:['slot-b'],data:{type:'col',droppable:true}})]});
    const data=clipboard(node('a'),node('b'));
    data.roots[0].placement.draggable='.slot-a';data.roots[1].placement.draggable='.slot-b';
    const before=JSON.stringify(f.settings);
    const message=(await f.run({action:'targets',clipboard:data})).error;
    assert.match(message,/공통 위치/);
    assert.match(message,/a → Col a-slot/);
    assert.match(message,/b → Col b-slot/);
    assert.doesNotMatch(message,/\.slot/);
    assert.ok((await f.run({action:'paste',selection:f.arm('paste',[f.root.get('components').models[0]]),clipboard:data,position:'inside'})).error);
    assert.equal(f.calls.length,0);assert.equal(JSON.stringify(f.settings),before);
});

test('mixed ordinary Rows and search-only Cols name the restricted copied items without changing placement',async()=>{
    const f=fixture({children:[node('search-row',{classes:['form-row','search-row','search-form-wrapper'],data:{type:'search-inner-div',droppable:true}})]});
    const ids=['col9','col341','col361','col371'];
    const searchCols=ids.map((id,index)=>node(id,{
        classes:['form-col','search-col','search-col-add'],data:{type:'search-inner-div'},
        children:index%2===0?[node('label-'+id,{classes:['col-form-label'],data:{type:'label'},setting:{name:index===0?'프로젝트코드':'양산예정일자'}})]:[],
    }));
    const data=clipboard(...Array.from({length:18},(_,i)=>node('ordinary'+i)),...searchCols);
    data.roots.slice(18).forEach(root=>{root.type='Col';root.placement.draggable='.search-form-wrapper,.search-row-add,.container-content.search-col-add';});
    const before=JSON.stringify({data,settings:f.settings});
    const result=await f.run({action:'targets',clipboard:data});
    assert.match(result.error,/공통 위치/);
    assert.match(result.error,/프로젝트코드 \(col9\)/);
    assert.match(result.error,/양산예정일자 \(col361\)/);
    for(const id of ids)assert.ok(result.error.includes(id));
    assert.match(result.error,/검색영역 안에만/);
    assert.match(result.error,/나누어 복사/);
    assert.doesNotMatch(result.error,/ordinary|search-inner-div|form-wrapper/);
    assert.ok(result.targets.every(t=>!t.positions.length));
    assert.equal(JSON.stringify({data,settings:f.settings}),before);
    assert.equal(f.calls.length,0);assert.equal(f.idCalls.length,0);assert.equal(f.stats.sessionRequests,undefined);
    const searchOnly={...data,roots:data.roots.slice(18)};
    assert.equal((await f.run({action:'targets',clipboard:searchOnly})).error,undefined);
});

test('missing search receiver and long restricted lists give compact actionable messages',async()=>{
    const data=clipboard(...Array.from({length:7},(_,i)=>node('searchCol'+i,{classes:['form-col','search-col-add']})));
    data.roots.forEach(root=>{root.type='Col';root.placement.draggable=['.search-form-wrapper','.search-row-add'];});
    const result=await fixture().run({action:'targets',clipboard:data});
    assert.match(result.error,/붙여넣을 수 있는 검색영역이 없습니다/);
    assert.match(result.error,/searchCol0, searchCol1, searchCol2, searchCol3 외 3개/);
    assert.match(result.error,/편집 가능한 검색영역/);
    assert.doesNotMatch(result.error,/나누어 복사/);
});

test('batch-only Repeat restriction reports the Row rule rather than incompatible individual destinations',async()=>{
    const f=fixture({droppable:false,children:[node('target-row',{classes:['form-row'],data:{type:'row',droppable:true}})]});
    const data=clipboard(node('repeat',{classes:['default-container','repeat-container']}),node('ordinary',{classes:['default-container']}));
    data.roots.forEach(root=>root.placement.draggable='.form-row');
    for(const root of data.roots)assert.equal((await f.run({action:'targets',clipboard:{...data,roots:[root]}})).error,undefined);
    const result=await f.run({action:'targets',clipboard:data});
    assert.match(result.error,/repeat, ordinary/);
    assert.match(result.error,/반복컨테이너와 다른 컨테이너는 같은 Row/);
    assert.equal(f.calls.length,0);
});

test('specific native restrictions and locked destinations report their real cause',async()=>{
    for(const [classes,expected] of [[['default-container','repeat-container'],/반복컨테이너 안에는 반복컨테이너/],[['comment-container'],/댓글은 반복컨테이너/]]){
        const f=fixture({droppable:false,children:[node('repeat-target',{classes:['default-container','repeat-container','container-content'],data:{type:'col',droppable:true}})]});
        const data=clipboard(node('blocked',{classes}));data.roots[0].placement.draggable='.repeat-container';
        const message=(await f.run({action:'targets',clipboard:data})).error;
        assert.match(message,/blocked/);assert.match(message,expected);assert.equal(f.calls.length,0);
    }
    const locked=await fixture({droppable:false}).run({action:'targets',clipboard:clipboard(node('locked-row'))});
    assert.match(locked.error,/locked-row/);assert.match(locked.error,/내부 항목 추가를 허용하지 않습니다/);
    const orphan=clipboard(node('child',{classes:['cascader-item'],data:{type:'cascader-item'}}));
    assert.match((await fixture().run({action:'targets',clipboard:orphan})).error,/Cascader 전체/);
});

test('search-looking classes never override a permitted source rule or change its restriction',async()=>{
    const f=fixture();
    const data=clipboard(node('normal'),node('search-looking',{classes:['form-col','search-col-add']}));
    data.roots[1].placement.draggable='.container-fluid,.container-content:not(.search-col)';
    const result=await f.run({action:'targets',clipboard:data});
    assert.equal(result.error,undefined);
    assert.ok(result.targets.find(t=>t.modelId===f.root.cid).positions.includes('inside'));
});

test('dynamic root locks and non-selectable ID-less content receivers are independent of selection policy',async()=>{
    const f=fixture({droppable:false,children:[node('content',{attributes:{},classes:['container-content'],data:{type:'container-content',droppable:true,selectable:false}})]});
    const result=(await f.run({action:'targets',clipboard:clipboard(node('a'))}));
    const content=f.root.get('components').models[0];
    assert.equal(result.error,undefined);
    assert.deepEqual(result.targets.find(t=>t.modelId===f.root.cid).positions,[]);
    assert.ok(result.targets.find(t=>t.modelId===content.cid).positions.includes('inside'));
    const record=result.records.find(r=>r.location.modelId===content.cid);
    assert.equal(record.location.domId,'');assert.deepEqual(record.location.domPath,[0,0]);
    assert.equal(f.calls.length,0);
});

test('copy explicitly captures effective defaults; older clipboard asks for recopy',async()=>{
    const f=fixture(), source=f.root.get('components').models[0];
    source.toJSON=()=>({type:'row'});
    const copied=(await f.run({action:'copy',selection:f.arm('copy',[source])}));
    assert.equal(copied.clipboard.roots[0].placement.draggable,'.container-fluid,.container-content');
    delete copied.clipboard.roots[0].placement;
    assert.match((await f.run({action:'targets',clipboard:copied.clipboard})).error,/다시 복사/);
});







test('Lamp7 rejects nested Repeat, Comment in Repeat and Repeat plus another Container in one Row before writes',async()=>{
    const repeated=node('repeat',{classes:['default-container','repeat-container','container-content'],data:{type:'col',droppable:true}});
    const f=fixture({children:[repeated]});const dest=f.root.get('components').models[0];
    for(const copy of [node('repeat-copy',{classes:['default-container','repeat-container']}),node('comment',{classes:['comment-container']}),node('row-copy',{classes:['form-row'],children:[node('nested',{classes:['repeat-container']})]})]) {
        const data=clipboard(copy);data.roots[0].placement.draggable=true;
        assert.ok((await f.run({action:'paste',selection:f.arm('paste',[dest]),clipboard:data,position:'inside'})).error);
    }
    assert.equal(f.calls.length,0);
    const g=fixture({children:[node('dest',{data:{type:'row',droppable:true},classes:['form-row']})]});
    const data=clipboard(node('repeat-copy',{classes:['default-container','repeat-container']}),node('ordinary',{classes:['default-container']}));data.roots.forEach(r=>r.placement.draggable=true);
    assert.ok((await g.run({action:'paste',selection:g.arm('paste',[g.root.get('components').models[0]]),clipboard:data,position:'inside'})).error);
    assert.equal(g.calls.length,0);
});



test('direct paste validation still rejects changed DOM attributes and moved ID-less receiver paths',async()=>{
    for(const issue of ['attribute','path']) {
        const f=fixture(),selection=f.arm('paste',[f.root]);
        if(issue==='attribute')f.root.getEl().setAttribute('eid','changed');
        else selection.locations[0].domPath=[99];
        assert.ok((await f.run({action:'paste',selection,clipboard:clipboard(node('a')),position:'inside'})).error);
        assert.equal(f.calls.length,0);
    }
});

test('placement target indexing does not rescan the complete model tree per child',async()=>{
    const counts=[];
    for(const size of [100,400]) {
        const f=fixture({children:Array.from({length:size},(_,i)=>node(`r${i}`))});
        f.stats.views=0;f.stats.snapshots=0;
        const result=(await f.run({action:'targets',clipboard:clipboard(node('fresh'))}));
        assert.equal(result.error,undefined);assert.equal(f.stats.snapshots,1);
        counts.push(f.stats.views);
    }
    assert.ok(counts[1]<counts[0]*5,`view lookups must grow linearly: ${counts}`);
});

test('paste discovery skips connected GrapesJS textnode views without changing destination data', async()=> {
    const f = fixture(), data = clipboard(node('a'));
    const text = { nodeType: 3, isConnected: true, parentElement: f.root.getEl() };
    const model = { cid: 'text-view', getEl: () => text, parent: () => f.root,
        get: key => key === 'components' ? { models: [] } : key === 'attributes' ? {} : 'textnode' };
    f.root.get('components').models.push(model);
    const result = (await f.run({ action: 'targets', clipboard: data }));
    assert.equal(result.error, undefined);
    assert.ok(result.targets.some(t => t.modelId === f.root.cid && t.positions.includes('inside')));
    assert.equal(result.targets.some(t => t.modelId === model.cid), false);
    assert.equal(f.calls.length, 0);
});

test('container placement ignores text siblings and rejects text nodes as receivers', async()=> {
    const doc = placementDocument(), row = doc.createElement('div');
    row.className = 'form-row';
    const textModel = { getEl: () => ({ nodeType: 3, isConnected: true }), get: () => ({ models: [] }) };
    const parent = { getEl: () => row, get: key => key === 'components' ? { models: [textModel] } : true };
    const data = clipboard(node('container', { classes: ['default-container'] }));
    data.roots[0].placement.draggable = true;
    assert.equal(visualPlacement(data.roots, parent, 'inside'), true);
    assert.equal(visualPlacement(data.roots, textModel, 'inside'), false);
});
