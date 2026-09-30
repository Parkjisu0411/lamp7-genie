import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { pasteVisualSnapshot } from '../src/features/visualEdit/background/snapshotPaste.ts';
import { transformVisualClipboard } from '../src/features/visualEdit/transformClipboard.ts';
import { placementDocument } from './fixtures/placementDom.mjs';

const plain = value => JSON.parse(JSON.stringify(value));

const node = (key, extra = {}) => ({key,scope:'',data:{type:'row',tagName:'div'},
    attributes:{id:`dom-${key}`,eid:key,vid:`v-${key}`},classes:['form-row'],style:{},
    setting:{id:key,name:key},children:[],...extra});
const clipboard = (...nodes) => ({kind:'lamp7-genie/visual',version:1,id:'copy',createdAt:1,
    source:{origin:'https://lamp7.test',systemId:'s',screenId:'source'},
    roots:nodes.map(n=>({node:n,type:n.data.type,label:n.key,eid:n.attributes.eid})),images:{},tables:[]});

// Models/views are doubles. The import itself is serialized into a fresh MAIN
// world; mocks forbid property UI, drop-default initialization and network I/O.
function fixture(options={}) {
    const dom=placementDocument(),settings={'v-existing':{id:'existing',name:'Existing'}},images={existing:{fileData:'keep'}};
    const events={eventInfos:[{id:'original',logics:[{id:1}]}]},calls=[],messages=[],mutations=[];
    let serial=0,valid=true,attempt=0;
    const make=(data,p)=>{
        const values={...data,attributes:{...data.attributes},components:{models:[]}},el=dom.createElement(data.tagName||'div');
        const m={cid:`c${++serial}`,get:k=>values[k],getAttributes:()=>({...values.attributes}),
            getName:()=>values.type,addAttributes(value){m.setAttributes({...values.attributes,...value});},
            setAttributes(value){values.attributes={...value};for(const [k,v] of Object.entries(value))el.setAttribute(k,v);},
            getStyle:()=>values.style||{},setStyle(value){values.style={...value};},getEl:()=>el,parent:()=>p,
            append(value,{at}) {
                attempt++;calls.push(['append',m.cid]);
                if(options.failAt===attempt)throw Error('append failed');
                if(typeof value==='string') {
                    const t=dom.createElement('template');t.innerHTML=value;const e=t.content.firstElementChild;
                    value={tagName:'div',type:e.classList.contains('form-row')?'row':'col',classes:[...e.classList],attributes:{id:`wrapper-${serial+1}`},style:{},components:[]};
                }
                const child=make(value,m);values.components.models.splice(at,0,child);el.children.splice(at,0,child.getEl());
                options.afterAppend?.(child,f);
                if(options.throwAfter===attempt)throw Error('hook failed after append');
                return [child];
            }, viewLayer:{},
        };
        el.className=(data.classes||[]).join(' ');el.parentElement=p?.getEl()??null;m.setAttributes(values.attributes);
        for(const child of data.components||[]) {const c=make(child,m);values.components.models.push(c);el.children.push(c.getEl());}
        return m;
    };
    const existing=make({type:'button',attributes:{id:'existing-dom',eid:'existing',vid:'v-existing'},classes:['btn-compo']},null);
    const root=make({type:'root',attributes:{id:'root'},classes:options.parentClasses||['container-fluid'],components:[]},null);
    existing.parent=()=>root;existing.getEl().parentElement=root.getEl();root.get('components').models.push(existing);root.getEl().children.push(existing.getEl());
    const editor={getWrapper:()=>root};
    const fail=()=>{throw Error('property UI, native drop, deletion and network are not paste import APIs');};
    const context=vm.createContext({document:{querySelector:selector=>options.hide&&selector==='#hiddenToggle .icon-eyeoff'?{}:null},
        editor,_settingInfo:settings,_fileUploadData:images,_event:events,
        renderSettingTab:fail,changeSettingInfoByComponent:fail,fetch:fail,FileReader:fail,
        BlockHelper:{row:(_,classes)=>`<div class="form-row ${classes}"></div>`,col:(_,classes)=>`<div class="form-col ${classes}"></div>`},
        createSettingInfo(m,_data,reserved){
            calls.push(['createSetting',m.cid,[...reserved]]);
            let eid=`${m.get('type')}1`;while(reserved.includes(eid))eid+='1';
            const vid=`native-${m.cid}`;m.setAttributes({...m.getAttributes(),eid,vid});settings[vid]={id:eid,name:m.get('type')};
        },
        setGridCalWidth(m){calls.push(['width',m.cid]);options.onWidth?.(m,f);},
        setGridHeaderResize(m){calls.push(['header',m.cid]);},
        setLayerTab(m){calls.push(['layer',m.cid]);},scheduleVariableCanvasWidth(delay){calls.push(['layout',delay]);},
    });
    const f={context,settings,images,events,root,existing,calls,messages,mutations,
        invalidate(){valid=false;},
        async run(data){context.data=data;context.parent=root;context.valid=()=>valid;
            context.progress=async msg=>{messages.push(msg);await options.progress?.(msg,f);};
            context.mutation=flag=>mutations.push(flag);context.transform=transformVisualClipboard.toString();
            return JSON.parse(JSON.stringify(await vm.runInContext(`(${pasteVisualSnapshot.toString()})(data,parent,1,valid,progress,mutation,transform)`,context)));},
    };
    return f;
}

test('hiddenYn and label mandatoryYn import without property inputs, preserving JSON/style/content',async()=>{
    for(const hide of [true,false]) {
        const f=fixture({hide});const a=node('a',{classes:['btn-compo'],setting:{id:'a',name:'Abort',hiddenYn:'Y'},style:{color:'red',display:'none'},
            children:[node('label',{classes:['col-form-label','required'],setting:{id:'label',name:'작업 ID',mandatoryYn:['Y']},data:{type:'text',content:'작업 ID'}})]});
        const data=clipboard(a),before=JSON.stringify(data),original=JSON.stringify({settings:f.settings,images:f.images,events:f.events});
        const result=await f.run(data);assert.equal(result.error,undefined);assert.equal(result.createdIds.length,1);
        assert.equal(f.settings['v-a'].hiddenYn,'Y');assert.deepEqual(plain(f.settings['v-label'].mandatoryYn),['Y']);
        const m=f.root.get('components').models[1].get('components').models[0].get('components').models[0];
        assert.equal(m.getStyle().display,hide?'none':undefined);assert.equal(m.getStyle().color,'red');
        assert.equal(m.getAttributes()['data-hidden'],'Y');assert.equal(m.get('components').models[0].get('content'),'작업 ID');
        assert.equal(JSON.stringify(data),before);assert.equal(f.settings['v-existing'].name,'Existing');
        assert.ok(original.includes('Existing'));assert.equal(f.events.eventInfos.length,1);
        assert.ok(f.calls.some(c=>c[0]==='layer'));assert.equal(f.mutations.at(-1),false);
    }
});

test('whole complex structures import once and preserve repeated shared settings and internal links',async()=>{
    for(const kind of ['grid-compo','manual-tree-container','tree-container','cascader-compo','tab-group-container']) {
        const f=fixture(),a=node('a',{scope:'a',classes:[kind],children:[node('one'),node('two')]});
        if(kind==='grid-compo')for(const child of a.children){child.scope='a';child.attributes.eid='cell';child.attributes.vid='v-cell';child.setting={id:'cell',listId:'a',hiddenYn:'N'};}
        const result=await f.run(clipboard(a));assert.equal(result.error,undefined,kind);
        const collect=m=>[m,...m.get('components').models.flatMap(collect)];const all=collect(f.root);
        const model=all.find(m=>m.getAttributes().eid==='a');assert.equal(model.get('components').models.length,2);
        if(kind==='grid-compo') {
            assert.deepEqual(plain(f.settings['v-cell']),{id:'cell',listId:'a',hiddenYn:'N'});
            assert.deepEqual(f.calls.filter(c=>['width','header'].includes(c[0])).map(c=>c[0]),['width','header']);
        }
    }
});

test('image bytes register under new keys without re-upload or source aliases',async()=>{
    const f=fixture(),data=clipboard(node('image'));
    data.images.image=[{fileData:'data:image/png;base64,AAAA',fileName:'a.png',type:'src'}];
    const before=JSON.stringify(data);const result=await f.run(data);assert.equal(result.error,undefined);
    assert.deepEqual(plain(f.images.image),data.images.image);assert.notEqual(f.images.image,data.images.image);
    assert.equal(JSON.stringify(data),before);assert.deepEqual(f.images.existing,{fileData:'keep'});
});

test('Row and Col use native templates and createSettingInfo with all copied EIDs reserved',async()=>{
    const f=fixture(),data=clipboard(node('row1',{classes:['input-compo']}));
    const out=await f.run(data);assert.equal(out.error,undefined);
    const wrappers=f.calls.filter(c=>c[0]==='createSetting');assert.equal(wrappers.length,2);
    assert.deepEqual(wrappers.map(c=>c[2]),[['row1'],['row1']]);
    assert.equal(f.root.get('components').models[1].getAttributes().eid,'row11');
    assert.equal(f.settings['v-row1'].id,'row1');
});

test('directly pasting a Row does not generate a redundant wrapper or native per-field VIDs',async()=>{
    const f=fixture(),a=node('a',{setting:{id:'a',name:'a',hiddenYn:'N',mandatoryYn:'N',description:'saved'}});
    assert.equal((await f.run(clipboard(a))).error,undefined);
    assert.equal(f.calls.filter(c=>c[0]==='append').length,1);assert.equal(f.calls.filter(c=>c[0]==='createSetting').length,0);
    assert.deepEqual(Object.keys(f.settings),['v-existing','v-a']);
});

test('preflight conflicts and inconsistent repeated settings cause zero creation',async()=>{
    for(const kind of ['setting','image','shared','missing','grid-hook']) {
        const f=fixture(),a=node('a'),data=clipboard(a);
        if(kind==='setting')a.attributes.vid='v-existing';
        if(kind==='image')data.images.existing={fileData:'overwrite'};
        if(kind==='shared'){const b=node('b');b.attributes.vid='v-a';data.roots.push(...clipboard(b).roots);}
        if(kind==='missing')delete a.setting;
        if(kind==='grid-hook'){a.classes=['grid-compo'];delete f.context.setGridCalWidth;}
        const before=JSON.stringify({s:f.settings,i:f.images,e:f.events});const result=await f.run(data);
        assert.ok(result.error,kind);assert.equal(result.createdIds.length,0);assert.equal(f.calls.length,0);
        assert.equal(JSON.stringify({s:f.settings,i:f.images,e:f.events}),before);
    }
});

test('append failure removes only orphan import records and preserves earlier roots',async()=>{
    const f=fixture({failAt:2}),a=node('a'),b=node('b');a.setting.labelId='b';a.attributes.labelid='b';b.setting.valueId='a';b.attributes.valueid='a';
    const data=clipboard(a,b);data.images.b={fileData:'unused'};
    const result=await f.run(data);assert.match(result.error,/append failed/);assert.equal(result.createdIds.length,1);
    assert.equal(f.settings['v-b'],undefined);assert.equal(f.images.b,undefined);
    assert.equal(f.settings['v-a'].labelId,'');assert.equal(f.root.get('components').models[1].getAttributes().labelid,undefined);
    assert.equal(f.root.get('components').models[0],f.existing);assert.equal(f.settings['v-existing'].name,'Existing');
});

test('hook failure after append reports and retains real models with their settings',async()=>{
    const f=fixture({throwAfter:1}),result=await f.run(clipboard(node('a')));
    assert.match(result.error,/hook failed/);assert.equal(result.createdIds.length,1);assert.ok(f.settings['v-a']);
});

test('native wrapper creation failure retains real wrapper and does not register uncreated contents',async()=>{
    const f=fixture();const original=f.context.createSettingInfo;f.context.createSettingInfo=(...args)=>{original(...args);throw Error('wrapper hook');};
    const result=await f.run(clipboard(node('a',{classes:['input-compo']})));
    assert.match(result.error,/wrapper hook/);assert.equal(result.createdIds.length,1);assert.equal(f.settings['v-a'],undefined);
    const vid=f.root.get('components').models[1].getAttributes().vid;assert.ok(f.settings[vid]);
});

test('failed Grid layout is reported and touches only the new grid',async()=>{
    const f=fixture({onWidth(m,t){assert.equal(m.getAttributes().eid,'a');t.settings[m.getAttributes().vid].rowNumColWidth='30px';m.addAttributes({'data-layout':'native'});throw Error('layout failed');}});
    const result=await f.run(clipboard(node('a',{classes:['grid-compo']})));
    assert.match(result.error,/layout failed/);assert.equal(result.createdIds.length,1);assert.equal(f.settings['v-existing'].name,'Existing');
    assert.equal(f.settings['v-a'].rowNumColWidth,'30px');
});

test('navigation between roots prevents later creation and never modifies the replacement screen',async()=>{
    const replacement={untouched:{id:'new-screen'}};
    const f=fixture({progress(msg,t){if(msg.includes('1 / 2')){t.invalidate();t.context._settingInfo=replacement;}}});
    const result=await f.run(clipboard(node('a'),node('b')));
    assert.match(result.error,/화면이 변경/);assert.equal(result.createdIds.length,1);
    assert.deepEqual(replacement,{untouched:{id:'new-screen'}});assert.equal(f.settings['v-b'],undefined);assert.equal(f.mutations.at(-1),false);
});

test('missing layer view is harmless; existing hidden items are never globally toggled',async()=>{
    const f=fixture({hide:true,afterAppend(m){delete m.viewLayer;}}),a=node('a',{attributes:{id:'dom-a',eid:'a',vid:'v-a','data-hidden':'Y'}});
    const result=await f.run(clipboard(a));assert.equal(result.error,undefined);
    assert.equal(f.calls.filter(c=>c[0]==='layer').length,0);
});

test('failure recovery preserves ID-less text children without confusing them with each other',async()=>{
    const f=fixture({failAt:2}),a=node('a',{children:[
        node('text1',{attributes:{},setting:undefined,classes:[],data:{type:'textnode',content:'one'}}),
        node('text2',{attributes:{},setting:undefined,classes:[],data:{type:'textnode',content:'two'}}),
    ]});
    const out=await f.run(clipboard(a,node('b')));assert.match(out.error,/append failed/);
    assert.deepEqual(f.root.get('components').models[1].get('components').models.map(m=>m.get('content')),['one','two']);
});

test('search context is applied to new settings even when source had no field',async()=>{
    const f=fixture({parentClasses:['container-content','search-container'],failAt:2});
    f.root.setAttributes({...f.root.getAttributes(),eid:'target-search'});
    const out=await f.run(clipboard(node('a'),node('b')));assert.match(out.error,/append failed/);
    assert.equal(f.settings['v-a'].elSearchContainer,'target-search');
    assert.equal(f.root.get('components').models[1].getAttributes().elsearchcontainer,'target-search');
    assert.equal(f.settings['v-existing'].elSearchContainer,undefined);
});

test('sub-screen sequences and lone tab headers are rejected before new records are registered',async()=>{
    for(const c of ['tab-name','sub-screen-tab-group-container']) {
        const f=fixture(),out=await f.run(clipboard(node('a',{classes:[c]})));
        assert.ok(out.error);assert.equal(f.calls.length,0);assert.deepEqual(Object.keys(f.settings),['v-existing']);
    }
});

const nativeDir=process.env.LAMP7_VISUAL_SOURCE_DIR||'D:/02.Workspace/studio_cloud/studio/src/main/resources/static/js/screen';
test('local Lamp7 createSettingInfo and getNewEidByCheckIdList create reserved-safe wrappers', {skip:!existsSync(nativeDir+'/visualEditorSetting.js')},async()=>{
    const source=ts.createSourceFile('visualEditorSetting.js',readFileSync(nativeDir+'/visualEditorSetting.js','utf8'),ts.ScriptTarget.Latest,true);
    const get=name=>source.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name).getText(source);
    const code=get('createSettingInfo')+'\n'+get('getNewEidByCheckIdList');
    const f=fixture(),seq={};
    // Only environmental predicates/schema/UID services are doubles. The actual
    // native creation function registers attributes/settings and reserves IDs.
    for(const match of code.matchAll(/\b(is[A-Z]\w*)\(/g))f.context[match[1]]=()=>false;
    Object.assign(f.context,{
        $:()=>({length:1,parents:()=>({length:0})}),enameAbbr:{},
        getSettingInfo:m=>f.settings[m.getAttributes().vid],getComponentSetting:()=>[{name:'native'}],
        getCompoTypeSettingInfo(_schema,out){out.nativeDefaults=true;},
        getUid(prefix){return prefix+(seq[prefix]=(seq[prefix]||0)+1);},
    });
    vm.runInContext(code,f.context);
    const a=node('row1',{classes:['input-compo'],children:[node('col1',{classes:['col-form-label']})]});
    const out=await f.run(clipboard(a));assert.equal(out.error,undefined);
    const row=f.root.get('components').models[1],col=row.get('components').models[0];
    assert.equal(row.getAttributes().eid,'row2');assert.equal(col.getAttributes().eid,'col2');
    assert.equal(f.settings[row.getAttributes().vid].nativeDefaults,true);
    assert.equal(f.settings[col.getAttributes().vid].nativeDefaults,true);
    assert.equal(f.settings['v-row1'].id,'row1');assert.equal(f.settings['v-col1'].id,'col1');
});

test('local Lamp7 layer handler accepts imported hidden flag without a setting input', {skip:!existsSync(nativeDir+'/visualEditor.js')},async()=>{
    const source=ts.createSourceFile('visualEditor.js',readFileSync(nativeDir+'/visualEditor.js','utf8'),ts.ScriptTarget.Latest,true);
    const code=source.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='setLayerTab').getText(source);
    const marks=[],f=fixture({hide:true,afterAppend(m){m.viewLayer={pfx:'gjs-', $el:{addClass:c=>marks.push(c)}, getVisibilityEl:()=>({addClass:c=>marks.push(c)})};}});
    vm.runInContext(code,f.context);
    const out=await f.run(clipboard(node('a',{setting:{id:'a',hiddenYn:'Y'}})));
    assert.equal(out.error,undefined);assert.deepEqual(marks,['gjs-layer-hidden','fa-eye-slash']);
});
