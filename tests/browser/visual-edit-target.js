import { publishPasteProgress } from '../../src/shared/pasteProgress';
import { readVisualComponents } from '../../src/features/visualSearch/background/readComponents';
import { watchVisualSelection } from '../../src/features/visualEdit/background/watchSelection';
import { mountVisualEdit, stopVisualEdit, clearVisualSelection, deselectVisualItem, beginVisualDelete, endVisualDelete, abortVisualDelete } from '../../src/features/visualEdit/controller';
import { deleteVisualComponents } from '../../src/features/visualEdit/background/deleteComponents';
import { buildSelectionPolicy } from '../../src/features/visualEdit/policy';
import { dependencyMarkup, dependencySettings } from './visual-dependencies-data';
import { transferVisualComponents } from '../../src/features/visualEdit/background/transferComponents';
import { transformVisualClipboard } from '../../src/features/visualEdit/transformClipboard';
import { visualPlacement, visualPasteWrappers } from '../../src/features/visualEdit/placement';
const frame = document.querySelector('.gjs-frame');
const gridFixture = new URLSearchParams(location.search).has('grid');
const dependencyFixture = new URLSearchParams(location.search).has('dependencies');
const gridMarkup = `<section id="grid-a" eid="GridA" vid="v-grid-a" class="grid-compo">
    <h3>주문 Grid</h3><table id="grid-table"><thead id="grid-head"><tr id="grid-headers" class="grid-col-tr">
    <th id="grid-system" class="grid-col-select">선택</th><th id="grid-col-a" eid="OrderName" vid="v-col-name" class="grid-col-compo">주문명</th><th id="grid-col-b" eid="OrderQty" vid="v-col-qty" class="grid-col-compo">수량</th>
    </tr></thead><tbody id="grid-body">${[0, 1, 2].map(row => `<tr id="grid-row-${row}">
        <td id="grid-cell-${row}-system" class="grid-td"><input type="checkbox" id="grid-check-${row}" eid="Check" vid="v-check"></td>
        ${['a', 'b'].map(col => `<td id="grid-cell-${row}-${col}" class="grid-td"><input id="grid-value-${row}-${col}" eid="${col === 'a' ? 'Name' : 'Qty'}" vid="v-grid-${col}" value="${col === 'a' ? '반복 주문' : '3'}"><input id="grid-hidden-${row}-${col}" eid="Hidden-${col}" vid="v-grid-hidden-${col}" hidden></td>`).join('')}
    </tr>`).join('')}</tbody></table></section>`;
await new Promise(resolve => {
    frame.onload = resolve;
    frame.srcdoc = `<!doctype html><style>
    body{margin:24px 0;font:16px/1.5 sans-serif;color:#0f172a;background:white}
    .form-row{display:flex;gap:20px;border:2px solid #64748b;padding:24px;margin-bottom:24px;background:#f8fafc}
    .form-col{flex:1;min-width:0;padding:16px;border:1px dashed #94a3b8;background:white}
    input,button{box-sizing:border-box;width:100%;padding:10px;font:inherit}label{display:block;margin-bottom:8px}
    .gap{height:400px}
    .grid-compo{border:2px solid #64748b;padding:14px;margin-bottom:16px}.grid-compo h3{margin:0 0 12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #94a3b8;padding:6px}th{background:#e2e8f0}.grid-col-select{width:42px}td input{padding:4px;font-size:14px}
    </style><main id="wrapper"><div id="root" class="container-fluid">
    <section id="row-a" eid="RowA" vid="v-row-a" class="form-row">
    <div id="col-a" eid="ColA" vid="v-col-a" class="form-col value-col multi-col"><label id="label-a" eid="LabelA" vid="v-label-a" class="col-form-label">고객명</label><input id="input-a" eid="InputA" vid="v-input-a" class="input-compo" value="거래처 A"><input id="hidden-a" eid="HiddenA" vid="v-hidden-a" class="input-compo" hidden></div>
    <div id="col-b" eid="ColB" vid="v-col-b" class="form-col multi-col"><button id="button-a" eid="ButtonA" vid="v-button-a" class="btn-compo"><span id="caption-a" class="btn-name">조회</span></button></div>
    </section>
    <section id="row-b" eid="RowB" vid="v-row-b" class="form-row"><input id="input-b" eid="InputB" vid="v-input-b" class="input-compo" value="독립 항목"></section>
    <div id="gap" class="gap"></div><section id="row-c" eid="RowC" vid="v-row-c" class="form-row"><input id="input-c" eid="InputC" vid="v-input-c" class="input-compo" value="아래쪽 항목"></section>
    </div></main>`;
});
const doc = frame.contentDocument;
if (gridFixture) {
    doc.getElementById('row-a').remove();
    doc.getElementById('row-c').remove();
    doc.querySelector('.gap').remove();
    doc.getElementById('root').insertAdjacentHTML('afterbegin', gridMarkup);
}
window._settingInfo = {
    'v-grid-a': { type: 'grid', name: '주문 목록' },
    'v-row-a': { type: 'row', name: '조회 조건' },
    'v-row-b': { type: 'row', name: '주문 상세 정보' },
    'v-input-b': { type: 'input', name: '배송 요청 사항과 고객 전달 메시지를 입력하는 항목' },
    'v-label-a': { type: 'label', name: '고객명', valueId: 'InputA' },
    'v-input-a': { type: 'input', name: '고객명', labelId: 'LabelA' },
    'v-hidden-a': { type: 'input', name: '숨김 입력', hiddenYn: 'Y' },
    'v-button-a': { type: 'btn', name: '조회' },
};
doc.getElementById('input-b').setAttribute('eid', 'CustomerDeliveryRequestAndSpecialInstructions');
window._event = { InputA: { change: ['sample-event'] } };
window._fileUploadData = {};
window.selectTableData = [];
window._systemId_ = 'fixture';
let appendedCount = 0;
const make = (id, type, children = [], selectable = true) => {
    const el = doc.getElementById(id);
    const draggable=type==='row' ? '.container-fluid,.container-content:not(.search-col,.repeat-check-col)' : type==='col' ? '.container-fluid,.container-content,.form-row' : el.matches('.input-compo,.btn-compo,.col-form-label') ? '.container-fluid,.container-content,.form-row'+(el.matches('.btn-compo')?',.multi-col':'') : false;
    const droppable=el.matches('.container-fluid,.form-col') ? true : type==='row' ? '.form-col,.default-container,[class*=-compo],.col-form-label' : false;
    const data = { type, draggable, droppable, tagName: el.tagName.toLowerCase(), content: children.length ? '' : el.innerHTML, name: type, selectable, removable: type !== 'wrapper', attributes: Object.fromEntries([...el.attributes].map(a => [a.name, a.value])), components: { models: children } };
    const model = { cid: id, get: key => data[key], getEl: () => el, set: () => { throw Error('Unexpected model write'); },
        getAttributes: () => ({ ...data.attributes }), getStyle: () => Object.fromEntries([...el.style].map(k=>[k,el.style.getPropertyValue(k)])), toJSON: () => ({...data}),
        setAttributes(attrs) { data.attributes = {...attrs}; for (const a of [...el.attributes]) if (a.name !== 'class') el.removeAttribute(a.name); for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,String(value)); },
        append(value, { at }) {
            if(typeof value==='string') { const template=doc.createElement('template');template.innerHTML=value;const e=template.content.firstElementChild;value={type:e.matches('.form-row')?'row':'col',tagName:'div',classes:[...e.classList],attributes:Object.fromEntries([...e.attributes].map(a=>[a.name,a.value])),components:[]}; }
            const render = v => { const element=doc.createElement(v.tagName || 'div');
                for (const [k,x] of Object.entries(v.attributes ?? {})) element.setAttribute(k,String(x));
                element.className=(v.classes ?? []).join(' '); for(const [k,x] of Object.entries(v.style ?? {})) element.style.setProperty(k,String(x));
                if (v.content) element.innerHTML=v.content;
                const childEls=(v.components??[]).map(render); childEls.forEach(child=>element.append(child.el));
                return {el:element,children:childEls,v}; };
            const tree=render(value); el.insertBefore(tree.el,data.components.models[at]?.getEl()??null);
            const build=t=> { if(!t.el.id)t.el.id=`generated-${++appendedCount}`; const m=make(t.el.id,t.v.type,t.children.map(build),t.v.selectable!==false); m.cid=`created-${++appendedCount}`; return m; };
            const added=build(tree);added.owner=model;data.components.models.splice(at,0,added);emit('component:add');return [added];
        },
        parent: () => model.owner, index: () => model.owner?.get('components').models.indexOf(model) ?? 0 };
    for (const child of children) child.owner = model;
    return model;
};
let roots;
if (dependencyFixture) {
    doc.getElementById('root').innerHTML = dependencyMarkup;
    Object.assign(window._settingInfo, dependencySettings);
    const tree = el => make(el.id, el.dataset.fixtureType, [...el.children].filter(child => child.id).map(tree));
    roots = [...doc.getElementById('root').children].filter(el => el.id).map(tree);
} else if (gridFixture) {
    window._settingInfo['v-col-name'] = { type: 'listCol', name: '주문명' };
    window._settingInfo['v-col-qty'] = { type: 'listCol', name: '수량' };
    const tree = el => {
        const type = el.classList.contains('grid-compo') ? 'grid-compo' : el.classList.contains('grid-col-tr') ? 'grid-col-tr' :
            ({ TABLE: 'table', THEAD: 'thead', TBODY: 'tbody', TR: 'table-row', TH: 'cell', TD: 'cell', INPUT: 'col-compo' })[el.tagName] || 'none';
        return make(el.id, type, [...el.children].filter(child => child.id).map(tree));
    };
    roots = [tree(doc.getElementById('grid-a')), make('row-b', 'row', [make('input-b', 'col-compo')])];
} else {
    const label = make('label-a', 'label');
    const input = make('input-a', 'col-compo');
    const hidden = make('hidden-a', 'col-compo');
    const button = make('button-a', 'text-compo', [make('caption-a', 'btn-inner', [], false)]);
    const rowA = make('row-a', 'row', [make('col-a', 'col', [label, input, hidden]), make('col-b', 'col', [button])]);
    roots = [rowA, make('row-b', 'row', [make('input-b', 'col-compo')]), make('gap','none',[],false), make('row-c', 'row', [make('input-c', 'col-compo')])];
}
const root = make('root', 'default', roots);
const wrapper = make('wrapper', 'wrapper', [root]);
// Test a real model receiver without a saved DOM id.
root.getEl().removeAttribute('id'); delete root.get('attributes').id;
window.BlockHelper={row:(_,c)=>`<div class="form-row ${c||'bx-tbl'}"></div>`,col:(_,c)=>`<div class="form-col ${c}"></div>`};
window.componentSetting={'form-row':[{id:'name',defaultValue:'Row'}],'form-col':[{id:'name',defaultValue:'Col'}]};
window.getCompoTypeSettingInfo=(schema,out)=>{for(const s of schema)out[s.id]=s.defaultValue;};
let uid=0;window.getUid=prefix=>prefix+(++uid);
let nativeSelected = roots.find(model => model.cid === 'row-b') ?? roots[0];
const listeners = new Map();
const emit = name => { for (const fn of [...(listeners.get(name) ?? [])]) fn(); };
let nativeCalls = 0;
const native = () => { nativeCalls++; document.querySelector('#native-status').textContent = `기본 조작 ${nativeCalls}회`; };
document.querySelector('#native-delete').onclick = native;
for (const type of ['click', 'dragstart', 'keydown']) doc.addEventListener(type, native);
const deletionLog = [];
const walk = model => [model, ...model.get('components').models.flatMap(walk)];
const sequences={};
window.veuid=prefix=>prefix+(sequences[prefix]=(sequences[prefix]||0)+1);
window.getComponentsByAttribute=(attr,id)=>walk(wrapper).filter(m=>m.get('attributes')[attr]===id);
window.$={ajax:async options=>{
    if(!options.url.includes('/session-variable/search/all/lists')) throw Error('Unexpected fixture request');
    if(new URLSearchParams(parent.location.search).has('slow')) await new Promise(r=>setTimeout(r,600));
    options.success([]);
}};
document.addEventListener('genie:paste-progress',event=>parent.postMessage({message:{action:'PASTE_PROGRESS',targetSessionId:'fixture-session',payload:event.detail}},location.origin));
window.getUidCheckAttribute = (id, prefix, attr) => { while(walk(wrapper).some(m=>m.get('attributes')[attr]===id))id+='1';return id; };
window.getNewEidByCheckIdList = (id,prefix,list) => { while(list.includes(id))id+='1';return id; };
window.selectedComponent = model => { window._selectParentCompo = model.parent(); window._selectCompoIndex = model.index(); };
// Representative hooks for the synthetic browser fixture, not a copy of Lamp7's implementation.
window.deleteBeforeEvent = () => {
    const model = editor.getSelected();
    deletionLog.push(`before:${model.cid}`);
    if (new URLSearchParams(parent.location.search).get('fail') === model.cid) throw Error('테스트용 기본 삭제 오류');
    for (const child of walk(model)) {
        const attrs = child.get('attributes');
        delete _settingInfo[attrs.vid]; delete _event[attrs.eid];
    }
    return false;
};
window.deleteEndEvent = () => deletionLog.push('after');
window.editor = { getWrapper: () => wrapper, getSelected: () => nativeSelected, getSelectedAll: () => nativeSelected ? [nativeSelected] : [], getCss: () => '.saved-style{color:red}',
    select(model) { nativeSelected = model; if (model) selectedComponent(model); },
    on(names, fn) { for (const name of names.split(' ')) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); } },
    off(names, fn) { for (const name of names.split(' ')) listeners.get(name)?.delete(fn); },
    runCommand(name, { component }) {
        if (name !== 'core:component-delete') throw Error('Unexpected command');
        if (deleteBeforeEvent()) { emit('abort:core:component-delete'); return; }
        editor.select(null);
        component.parent().get('components').models.splice(component.index(), 1);
        component.getEl().remove();
        emit('component:remove');
        deleteEndEvent();
        return [component];
    } };
const serialize = () => JSON.stringify({ html: wrapper.getEl().innerHTML, css: editor.getCss(), settings: _settingInfo, events: _event, selected: editor.getSelectedAll().map(c => c.cid) });
const baseline = serialize();
let latest;
window.chrome = { runtime: { id: 'fixture', sendMessage(message, callback) {
    if (message.action === 'VISUAL_EDIT_STATE') { latest = message.payload; parent.postMessage({ fixture: 'visual-edit-state', message }, location.origin); }
    callback?.({ success: true }); return Promise.resolve({ success: true });
} } };
window.fixture = {
    start(modeId) { const snapshot = readVisualComponents(); const error = snapshot.error || mountVisualEdit({ modeId, records: snapshot.records }, 'fixture-session'); if (!error) watchVisualSelection(modeId); return { success: !error, error }; },
    stop: stopVisualEdit, clear: clearVisualSelection, deselect: deselectVisualItem,
    async pasteStart(payload, clipboard) {
        const result=await transferVisualComponents({action:'targets',clipboard},transferSources());
        const error=result.error || mountVisualEdit({modeId:payload.modeId,records:result.records,paste:{targets:result.targets,clipboardId:clipboard.id}},'fixture-session');
        if(!error)watchVisualSelection(payload.modeId);return {success:!error,error};
    },
    async transfer(action,payload,clipboard) {
        const selection=beginVisualDelete(payload,action);if(!selection)return {success:false,error:'선택 잠금 실패'};
        try {
            // Optional explicit delay for busy/duplicate-click tests, never a product delay.
            if(new URLSearchParams(parent.location.search).has('slow'))await new Promise(resolve=>setTimeout(resolve,350));
            const data=transferVisualComponents({action,selection,clipboard,position:payload.position},transferSources());
            if(action==='copy'&&data.clipboard&&!data.error){stopVisualEdit(payload.modeId);return {success:true,data};}
            if(action==='paste'){stopVisualEdit(payload.modeId);return {success:!data.error,data,error:data.error};}
            const refreshed=endVisualDelete(payload.modeId,payload.requestId,{deletedIds:[],cascadedIds:[],remainingIds:data.createdIds??[],records:data.records});
            return {success:refreshed&&!data.error,data,error:data.error};
        } finally {abortVisualDelete(payload.modeId,payload.requestId);}
    },
    async delete(payload) {
        const selection = beginVisualDelete(payload);
        if (!selection) return { success: false, error: '선택 잠금 실패' };
        try {
            // Exposes busy/duplicate-click behavior across the asynchronous extension boundary.
            await new Promise(resolve => setTimeout(resolve, 450));
            const data = deleteVisualComponents(selection, { reader: readVisualComponents.toString(), policy: buildSelectionPolicy.toString() });
            if (new URLSearchParams(parent.location.search).has('lost')) return { success: false, error: '테스트용 결과 통신 유실' };
            const refreshed = endVisualDelete(payload.modeId, payload.requestId, data);
            return { success: refreshed && !data.error, data, error: data.error };
        } finally { abortVisualDelete(payload.modeId, payload.requestId); }
    },
    zoom() { frame.style.transform = frame.style.transform ? '' : 'scale(.8)'; frame.dispatchEvent(new Event('load')); },
    change() { emit('component:update'); },
    verify() { return { unchanged: baseline === serialize(), nativeCalls, watching: [...listeners.values()].some(set => set.size), active: !!document.querySelector('#lamp7-genie-visual-edit'), deletionLog, remaining: walk(root).map(c => c.cid), settings: _settingInfo, events: _event, latest }; },
};
function transferSources() {return {progress:publishPasteProgress.toString(),reader:readVisualComponents.toString(),policy:buildSelectionPolicy.toString(),transform:transformVisualClipboard.toString(),placement:visualPlacement.toString(),wrappers:visualPasteWrappers.toString()};}
parent.postMessage({ fixture: 'visual-edit-ready' }, location.origin);
