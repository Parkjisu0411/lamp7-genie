import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { transformVisualClipboard } from '../src/features/visualEdit/transformClipboard.ts';
import { transferVisualComponents } from '../src/features/visualEdit/background/transferComponents.ts';
import { visualPlacement, visualPasteWrappers } from '../src/features/visualEdit/placement.ts';
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

test('Cascader follows native Row placement, adds only a Row at root and rejects internal paste locations',async()=>{
    const data=clipboard(node('cas',{classes:['form-col','cascader-compo'],data:{type:'cascader-compo',droppable:false},children:[
        node('panel',{classes:['cascader-container'],data:{type:'none',droppable:true},children:[node('item',{classes:['cascader-item'],data:{type:'cascader-node'}})]}),
    ]}));
    data.roots[0].placement.draggable='.container-fluid,.container-content,.form-row:not(.tit-wrap)';
    const f=fixture();
    const out=await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:data,position:'inside'});
    assert.equal(out.error,undefined);
    const addedRow=f.root.get('components').models.at(-1),cas=addedRow.get('components').models[0],panel=cas.get('components').models[0],item=panel.get('components').models[0];
    assert.ok(addedRow.getEl().matches('.form-row'));
    assert.ok(cas.getEl().matches('.cascader-compo'),'no extra Col wrapper');
    assert.equal(visualPlacement(data.roots,addedRow,'inside'),true);
    assert.equal(visualPlacement(data.roots,cas,'after'),true);
    for(const destination of [cas,panel,item]) assert.equal(visualPlacement(data.roots,destination,'inside'),false);
    assert.equal(visualPlacement(data.roots,item,'after'),false);
    const title=fixture({children:[node('title',{classes:['form-row','tit-wrap'],data:{droppable:true}})]});
    assert.equal(visualPlacement(data.roots,title.root.get('components').models[0],'inside'),false);
    const col=fixture({children:[node('col',{classes:['form-col','multi-col'],data:{droppable:true}})]});
    assert.equal(visualPlacement(data.roots,col.root.get('components').models[0],'inside'),false);
    const legacy=clipboard(node('orphan',{classes:['cascader-item'],data:{type:'cascader-node'}}));
    legacy.roots[0].placement.draggable=true;
    assert.equal(visualPlacement(legacy.roots,f.root,'inside'),false,'old node-only clipboard is not pasted alone');
});

test('session lookup uses the page ajax transport asynchronously once and exposes HTTP failures', async () => {
    const f = fixture();
    const result = await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:clipboard(node('a')),position:'inside'});
    assert.equal(result.error,undefined);
    assert.equal(f.stats.sessionRequests,1);
    assert.deepEqual(f.stats.lastRequest,{
        url:'/session-variable/search/all/lists?systemId=s',type:'GET',async:true,dataType:'json',timeout:15000,
    });
    const failed=fixture({sessionFailure:true});
    const out=await failed.run({action:'paste',selection:failed.arm('paste',[failed.root]),clipboard:clipboard(node('a')),position:'inside'});
    assert.match(out.error,/HTTP 403/);
    assert.equal(failed.calls.length,0);
    const missing=fixture(); delete missing.context.$;
    const unavailable=await missing.run({action:'paste',selection:missing.arm('paste',[missing.root]),clipboard:clipboard(node('a')),position:'inside'});
    assert.match(unavailable.error,/조회 기능에 연결/);
    assert.equal(missing.calls.length,0);
});

test('one session lookup covers a batch; sessions affect eid only and internal IDs are always fresh', async () => {
    const f = fixture({ sessions: [{ variableId: 'fresh' }, { variableId: 'fresh1' }, { variableId: 'vs2' }] });
    const a = node('fresh', { attributes: { id: 'genie1', eid: 'fresh', vid: 'vs1' } });
    const b = node('other');
    b.attributes.for = 'genie1';
    const result = await f.run({ action: 'paste', selection: f.arm('paste', [f.root]), clipboard: clipboard(a, b), position: 'inside' });
    assert.equal(result.error, undefined);
    assert.equal(f.stats.sessionRequests, 1);
    assert.equal(f.idCalls.length, 0);
    assert.equal(f.calls[0].attributes.eid, 'fresh11');
    assert.notEqual(f.calls[0].attributes.id, 'genie1');
    assert.equal(f.calls[0].attributes.vid, 'vs2');
    assert.equal(f.calls[1].attributes.for, f.calls[0].attributes.id);
    await f.run({ action: 'paste', selection: f.arm('paste', [f.root]), clipboard: clipboard(node('third')), position: 'inside' });
    assert.equal(f.stats.sessionRequests, 2, 'next paste obtains a fresh session snapshot');
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

test('progress is scoped, reports completed roots, and invalidation at a yield prevents mutation', async () => {
    const updates=[];
    const f=fixture({progress:async(mode,request,text)=>updates.push({mode,request,text,created:f.calls.length})});
    const selection=f.arm('paste',[f.root]);
    const result=await f.run({action:'paste',selection,clipboard:clipboard(node('a'),node('b')),position:'inside'});
    assert.equal(result.error,undefined);
    assert.ok(updates.every(p=>p.mode===selection.modeId && p.request===selection.requestId));
    assert.equal(updates[0].text,'ID 확인 중…');
    assert.ok(updates.some(p=>p.text==='붙여넣는 중 0 / 2' && p.created===0));
    assert.equal(updates.at(-1).text,'화면 반영 완료 2 / 2');
    assert.equal(updates.at(-1).created,2);
    const g=fixture({progress:async(_mode,_request,text)=>{
        if(text.startsWith('붙여넣는 중')) delete g.window.__lamp7GenieVisualEdit;
    }});
    const before=JSON.stringify(g.settings);
    const stopped=await g.run({action:'paste',selection:g.arm('paste',[g.root]),clipboard:clipboard(node('a')),position:'inside'});
    assert.match(stopped.error,/화면이 변경/); assert.equal(g.calls.length,0); assert.equal(JSON.stringify(g.settings),before);
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
    const context=vm.createContext({onProgress:options.progress,URL,fetch:()=>{throw Error('Native ajax transport must be used');},
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
        sources:{progress:options.progress ? 'async function(mode,request,text){await onProgress(mode,request,text);}' : undefined,reader:'function(){return snapshot();}',policy:buildSelectionPolicy.toString(),transform:transformVisualClipboard.toString(),placement:visualPlacement.toString(),wrappers:visualPasteWrappers.toString()}}))));
    return {run,arm,root,wrapper,walk,settings,images,eventData,calls,idCalls,stats,context,window,frame,document,CustomEvent};
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

test('paste preserves free IDs, uses native allocators on collisions, and never changes existing settings/events',async()=>{
    const f=fixture(), a=node('existing'), b=node('fresh');a.setting.labelId='fresh';b.setting.valueId='existing';
    const before=JSON.stringify(f.eventData), original=structuredClone(f.settings);
    const out=(await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:clipboard(a,b),position:'inside'}));
    assert.equal(out.error,undefined);assert.equal(out.createdIds.length,2);
    assert.equal(f.calls[0].attributes.eid,'existing1'); assert.equal(f.calls[1].attributes.eid,'fresh');
    assert.equal(f.settings[f.calls[0].attributes.vid].labelId,'fresh');assert.equal(f.settings[f.calls[1].attributes.vid].valueId,'existing1');
    for(const [key,value] of Object.entries(original))assert.deepEqual(f.settings[key],value);
    assert.equal(JSON.stringify(f.eventData),before); assert.equal(f.idCalls.length,0); assert.equal(f.stats.sessionRequests,1);
    assert.equal(f.window.__lamp7GenieVisualEdit.mutating,false);
});

test('partial append failure keeps completed roots and discards uncreated settings/images',async()=>{
    const f=fixture({failAt:2}), data=clipboard(node('a'),node('b'));data.images.b={fileData:'data:image/png;base64,AA'};
    data.roots[0].node.setting.labelId='b';data.roots[0].node.attributes.labelid='b';
    const out=(await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:data,position:'inside'}));
    assert.match(out.error,/append failure/); assert.equal(out.createdIds.length,1);
    assert.ok(f.settings[f.calls[0].attributes.vid]);assert.equal(Object.values(f.settings).some(s=>s.id==='b'),false);assert.equal(f.images.b,undefined);
    assert.equal(Object.values(f.settings).find(s=>s.id==='a').labelId,'');
    assert.equal(f.walk().find(m=>m.get('attributes').eid==='a').get('attributes').labelid,undefined);
    assert.equal(f.window.__lamp7GenieVisualEdit.mutating,false);
});

test('derived suffix collisions advance the owner and reserve the entire family',async()=>{
    const f=fixture();f.eventData.eventInfos.push({eid:'duration│from'});
    const p=node('duration',{classes:['duration-date-compo'],children:[node('duration│from'),node('duration│to')]});
    const out=(await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:clipboard(p),position:'inside'}));
    assert.equal(out.error,undefined);const created=f.walk().find(m=>m.get('attributes').eid==='duration1');assert.ok(created);
    assert.deepEqual(created.get('components').models.map(m=>m.get('attributes').eid),['duration1│from','duration1│to']);
});

test('missing table or column clears only unavailable bindings and preserves the copied structure',async()=>{
    const f=fixture({tables:[{dtId:1,layoutKey:'table',columns:{2:{dcId:2}}}]}),data=clipboard(node('a'),node('b'),node('c'));
    for(const [i,root] of data.roots.entries()) {
        Object.assign(root.node.setting,{dtId:i===2?'19334':'1',dcId:i===0?'3':'2',tableRelInfo:i===2?'missing':'table',tableName:'Source',columnName:'SourceCol',name:'Keep label',essYn:'Y'});
        Object.assign(root.node.attributes,{dtid:root.node.setting.dtId,dcid:root.node.setting.dcId,layoutkey:root.node.setting.tableRelInfo});
        root.node.style={color:'red'};
    }
    const original=JSON.stringify(data);
    const result=await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:data,position:'inside'});
    assert.equal(result.error,undefined);assert.equal(result.createdIds.length,3);
    for(const i of [0,2]) {
        const created=f.calls[i],setting=f.settings[created.attributes.vid];
        assert.equal(setting.dtId,'');assert.equal(setting.dcId,'');assert.equal(setting.tableName,'');assert.equal(setting.essYn,'');
        assert.equal(created.attributes.dtid,undefined);assert.equal(created.attributes.layoutkey,undefined);
        assert.equal(setting.name,'Keep label');assert.equal(created.style.color,'red');
    }
    assert.equal(f.settings[f.calls[1].attributes.vid].dtId,'1');
    assert.equal(f.calls[1].attributes.dcid,'2');assert.equal(JSON.stringify(data),original);
});

test('native event IDs and orphaned setting keys are reserved without copying event definitions',async()=>{
    const f=fixture();f.settings['v-fresh']={original:true};
    const out=(await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:clipboard(node('event-reserved'),node('fresh')),position:'inside'}));
    assert.equal(out.error,undefined);assert.equal(f.calls[0].attributes.eid,'event-reserved1');
    assert.notEqual(f.calls[1].attributes.vid,'v-fresh');assert.deepEqual(f.settings['v-fresh'],{original:true});
});

test('stale identity, wrong operation and consumed tokens cannot paste; lost response is safe to retry only with a new selection',async()=>{
    for(const issue of ['identity','operation','consumed']) {
        const f=fixture(),selection=f.arm(issue==='operation'?'copy':'paste',[f.root]);
        if(issue==='identity')selection.locations[0].eid='wrong';
        if(issue==='consumed')f.window.__lamp7GenieVisualEdit.operation.consumed=true;
        const out=(await f.run({action:'paste',selection,clipboard:clipboard(node('a')),position:'inside'}));
        assert.ok(out.error);assert.equal(f.calls.length,0);
    }
    const f=fixture(),payload={action:'paste',selection:f.arm('paste',[f.root]),clipboard:clipboard(node('a')),position:'inside'};
    assert.equal((await f.run(payload)).error,undefined);assert.ok((await f.run(payload)).error);assert.equal(f.calls.length,1);
});

test('incompatible placement fails before writes; after inserts immediately after anchor',async()=>{
    const f=fixture(),data=clipboard(node('a'));
    const before=JSON.stringify(f.settings);
    data.tables=[];data.roots[0].placement.draggable=false;
    assert.ok((await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:data,position:'inside'})).error);
    data.roots[0].placement.draggable='.container-fluid';
    const anchor=f.root.get('components').models[0];
    const out=(await f.run({action:'paste',selection:f.arm('paste',[anchor],'after'),clipboard:data,position:'after'}));
    assert.equal(out.error,undefined);assert.equal(f.root.get('components').models[1].get('attributes').eid,'a');
});

test('target discovery is read-only; pending DOM mutation invalidation stops paste before writes',async()=>{
    const f=fixture(),data=clipboard(node('a'));
    const found=(await f.run({action:'targets',clipboard:data}));
    assert.equal(found.error,undefined);assert.deepEqual(found.targets.filter(t=>t.positions.length).map(({modelId,positions})=>({modelId,positions})),[{modelId:f.root.cid,positions:['inside']},{modelId:f.root.get('components').models[0].cid,positions:['before','after']}]);assert.equal(f.idCalls.length,0);assert.equal(f.calls.length,0);
    f.document.addEventListener('genie:visual-edit-delete-mutating',()=>f.window.__lamp7GenieVisualEdit.dispose());
    assert.ok((await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:data,position:'inside'})).error);
    assert.equal(f.calls.length,0);assert.equal(f.settings['v-a'],undefined);
});

test('before inserts roots in copy order and a changed pointer position cannot reuse its lock',async()=>{
    const f=fixture(), anchor=f.root.get('components').models[0];
    const clipboardData=clipboard(node('a'),node('b'));
    const bad=(await f.run({action:'paste',selection:f.arm('paste',[anchor],'after'),clipboard:clipboardData,position:'before'}));
    assert.ok(bad.error);assert.equal(f.calls.length,0);
    const out=(await f.run({action:'paste',selection:f.arm('paste',[anchor],'before'),clipboard:clipboardData,position:'before'}));
    assert.equal(out.error,undefined);
    assert.deepEqual(f.root.get('components').models.map(m=>m.get('attributes').eid),['a','b','existing']);
});

test('mixed original parents use effective native rules and both halves of validTarget',async()=>{
    const f=fixture(), data=clipboard(node('a'),node('b'));
    data.roots[0].parentRole='col'; data.roots[1].parentRole='content';
    data.roots[0].placement.draggable=['.container-fluid'];
    assert.equal((await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:data,position:'inside'})).error,undefined);
    const blocked=fixture({droppable:'.btn-compo'});
    assert.match((await blocked.run({action:'targets',clipboard:data})).error,/넣을 수 있는 위치/);
    assert.equal(blocked.calls.length,0);
});

test('disjoint individual destinations explain no common location; no subset is pasted',async()=>{
    const f=fixture({droppable:false,children:[node('a-slot',{classes:['slot-a'],data:{type:'col',droppable:true}}),node('b-slot',{classes:['slot-b'],data:{type:'col',droppable:true}})]});
    const data=clipboard(node('a'),node('b'));
    data.roots[0].placement.draggable='.slot-a';data.roots[1].placement.draggable='.slot-b';
    const before=JSON.stringify(f.settings);
    assert.match((await f.run({action:'targets',clipboard:data})).error,/공통 위치/);
    assert.ok((await f.run({action:'paste',selection:f.arm('paste',[f.root.get('components').models[0]]),clipboard:data,position:'inside'})).error);
    assert.equal(f.calls.length,0);assert.equal(JSON.stringify(f.settings),before);
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

test('Input at root creates native Row and value Col; new settings reserve clipboard and orphan IDs',async()=>{
    const f=fixture(), data=clipboard(node('row1',{data:{type:'col-compo',tagName:'input'},classes:['input-compo']}));
    f.settings.vs1={original:true};
    const out=(await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:data,position:'inside'}));
    assert.equal(out.error,undefined); assert.equal(out.createdIds.length,1);
    const row=f.root.get('components').models[1],col=row.get('components').models[0],input=col.get('components').models[0];
    assert.ok(row.getEl().matches('.form-row'));assert.ok(col.getEl().matches('.form-col.value-col.multi-col'));
    assert.equal(input.get('attributes').eid,'row1');assert.notEqual(row.get('attributes').eid,'row1');
    assert.equal(f.settings[col.get('attributes').vid].name,'Col');assert.deepEqual(f.settings.vs1,{original:true});
    assert.equal(f.walk().filter(m=>m.getEl().matches('.col-form-label')).length,0,'no external/automatic labels');
});

test('Row target wraps controls in ordered Cols; a permitted multi-col accepts Button directly',async()=>{
    const row=node('dest',{data:{type:'row',droppable:'[class*=-compo]'},classes:['form-row']});
    const f=fixture({children:[row]}), dest=f.root.get('components').models[0];
    const data=clipboard(node('input',{data:{type:'col-compo',tagName:'input'},classes:['input-compo']}),node('button',{data:{type:'text-compo',tagName:'button'},classes:['btn-compo']}));
    data.roots.forEach(r=>r.placement.draggable='.form-row,.multi-col');
    assert.equal((await f.run({action:'paste',selection:f.arm('paste',[dest]),clipboard:data,position:'inside'})).error,undefined);
    assert.deepEqual(dest.get('components').models.map(m=>m.get('components').models[0].get('attributes').eid),['input','button']);
    const col=dest.get('components').models[1];
    const button=clipboard(node('another',{data:{type:'text-compo',tagName:'button'},classes:['btn-compo']}));button.roots[0].placement.draggable='.multi-col';
    assert.equal((await f.run({action:'paste',selection:f.arm('paste',[col]),clipboard:button,position:'inside'})).error,undefined);
    assert.equal(col.get('components').models[1].get('attributes').eid,'another');
});

test('wrapper integration is preflighted and partial wrappers repair only surviving copy links',async()=>{
    const data=clipboard(node('a',{classes:['input-compo']}),node('b',{classes:['input-compo']}));data.roots[0].node.setting.labelId='b';
    const missing=fixture(); delete missing.context.BlockHelper;
    assert.match((await missing.run({action:'paste',selection:missing.arm('paste',[missing.root]),clipboard:data,position:'inside'})).error,/Row·Col/);
    assert.equal(missing.calls.length,0);assert.equal(missing.settings['v-a'],undefined);
    const f=fixture({failAt:4});
    const out=(await f.run({action:'paste',selection:f.arm('paste',[f.root]),clipboard:data,position:'inside'}));
    assert.match(out.error,/append failure/);assert.equal(out.createdIds.length,1);
    assert.equal(Object.values(f.settings).find(s=>s.id==='a').labelId,'');assert.equal(f.settings['v-b'],undefined);
    assert.equal(Object.keys(f.settings).filter(k=>k.startsWith('vs')).length,3);
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

test('paste validates only the live locked receiver, with no search snapshots or repeated native free-ID checks',async()=>{
    const f=fixture(),selection=f.arm('paste',[f.root]);
    f.stats.snapshots=0;
    const result=(await f.run({action:'paste',selection,clipboard:clipboard(node('fresh')),position:'inside'}));
    assert.equal(result.error,undefined);assert.equal(result.records,undefined);
    assert.equal(f.stats.snapshots,0);
    assert.deepEqual(f.idCalls,[]); assert.equal(f.stats.sessionRequests,1);
    assert.notEqual(f.calls[0].attributes.id,'dom-fresh');assert.notEqual(f.calls[0].attributes.vid,'v-fresh');
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
