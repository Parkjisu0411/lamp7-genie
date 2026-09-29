import { publishPasteProgress } from '../../src/shared/pasteProgress';
import { mountEdit, unmountEdit, clearEditSelection, deselectEditItem, beginLogicPaste } from '../../src/features/edit/controller';
import { prepareLogicPasteContext, readLogicPasteContext } from '../../src/features/edit/background/pasteContext';
import { pasteCopiedLogicsInMainWorld } from '../../src/features/edit/background/pasteLogicCreator';
import { setMessageTarget } from '../../src/shared/messaging';
import { DATA_ATTR_LOGIC_AREA_PIN } from '../../src/shared/constants';
let rows=[], nextId=1, nativeCount=0;
const validated=[];
const area=document.querySelector('.logic_area');
const owner=document.createElement('input');owner.type='hidden';owner.value='event-stock';
const env={_tabId_:'tab-fixture',$:{divTab:s=>s==='.logic_area'?area:s==='#id'?owner:null},LogicEventHandler:{setLogicBlockNestedSortable(){}}};
const helpers={readBinding:n=>env[n],asStringId:v=>v==null?'':String(v),unwrapElement:n=>n};
const editor=env.LogicEditor={
    get:id=>rows.find(r=>r.id===id),getAll:()=>[...rows].sort((a,b)=>a.seq-b.seq),
    createLogic(id,type,prefix,props){const r={...props,id:id||`pasted${nextId++}`,type,kind:type,
        getId(){return this.id;},getType(){return this.type;},getElement(){return document.getElementById(this.id);},
        getPrev(){const a=editor.getAll();for(let i=a.indexOf(this)-1;i>=0;i--){if(a[i].lvl===this.lvl)return a[i];if(a[i].lvl<this.lvl)break;}},
        getNext(){const a=editor.getAll();return a.slice(a.indexOf(this)+1).find(l=>l.lvl===this.lvl&&l.parentId===this.parentId);},
        getParent(){const parents=[];let p=editor.get(this.parentId);while(p){parents.push(p);p=editor.get(p.parentId);}return parents;},
        getChildren(){const a=editor.getAll(),out=[];for(const l of a.slice(a.indexOf(this)+1)){if(l.lvl<=this.lvl)break;out.push(l);}return out;},
        validate(){validated.push(this.id);},validateLoadCompelete(){return true;},expand(){},
    };rows.push(r);return r;},
    resetLogicLevelAndSeqAll(){let seq=1;const walk=(list,parentId='',lvl=0)=>{for(const el of list.children){const r=editor.get(el.id);if(!r)continue;r.seq=seq++;r.lvl=lvl;r.parentId=parentId;const children=document.getElementById(r.id+'_processLogic');if(children)walk(children,r.id,lvl+1);}};walk(area);
        const parentTran=r=>{if(!r)return '';const p=r.getPrev();if(p?.type==='transaction')return ['condition','iteration','variable'].includes(r.type)?p.transaction?.id:parentTran(p);return parentTran(p&&['condition','iteration'].includes(r.type)?p:r.getParent()[0]);};
        for(const r of editor.getAll()){r.parentTranId=parentTran(r)||'';for(const k of ['condition','transaction'])if(r[k])r[k].parentTranId=r.parentTranId;}
        const ul=document.querySelector('.logic_seq_area ul');ul.replaceChildren();for(const r of editor.getAll()){const li=document.createElement('li');li.id=r.id+'_seq';li.textContent=String(r.seq);ul.append(li);}
    },
};
const renderer=env.LogicRenderer={renderLogics(logics){for(const r of logics){
    const row=document.createElement('div');row.className='logic-row';row.id=r.id;
    const head=document.createElement('div');head.className='head-logic';
    const label=document.createElement('strong');label.textContent=r.name;
    const input=document.createElement('input');input.value=r.id;input.setAttribute('aria-label',r.name);
    const button=document.createElement('button');button.textContent='설정';button.onclick=()=>document.querySelector('#native').click();
    head.append(label,input,button);row.append(head);
    if(['condition','iteration'].includes(r.type)){const children=document.createElement('div');children.className='children nested-sortable';children.id=r.id+'_processLogic';row.append(children);}
    (document.getElementById(r.parentId+'_processLogic')||area).append(row);
}editor.resetLogicLevelAndSeqAll();}};
const seed=[{id:'queryStock',type:'transaction',name:'재고 조회',transaction:{id:'stockQuery'}},{id:'hasStock',type:'condition',name:'재고 여부 확인',condition:{prefix:'if'}},{id:'showStock',type:'event',name:'재고 표시',parentId:'hasStock'},{id:'setWarehouse',type:'variable',name:'창고 코드 설정'},{id:'saveStock',type:'transaction',name:'재고 저장',transaction:{id:'stockSave'}},{id:'showMessage',type:'event',name:'처리 결과 안내'}];
renderer.renderLogics(seed.map(r=>editor.createLogic(r.id,r.type,'',r)));
const plain=r=>Object.fromEntries(Object.entries(r).filter(([,v])=>typeof v!=='function'));
const item=r=>({id:r.id,logicId:r.id,kind:r.type,label:r.name,snippet:r.name,seq:String(r.seq),json:plain(r)});
const emit=payload=>parent.postMessage({fixture:'logic-edit-state',message:{action:'EDIT_UI_SYNC',targetSessionId:'fixture-session',payload}},location.origin);
window.chrome={runtime:{id:'fixture',sendMessage(message,callback){
    if(message.action==='EDIT_SELECTION_CHANGED')emit({logicEditActive:true,selectedItems:message.payload.logicIds.map(id=>editor.get(id)).filter(Boolean).map(item)});
    if(message.action==='EDIT_NOTIFY_INACTIVE')emit({logicEditActive:false,selectedItems:[],modeId:message.modeId});
    if(message.action==='EDIT_PASTE_PICKED')emit({logicEditActive:true,paste:message.payload});
    callback?.({success:true});return Promise.resolve({success:true});
}}};
setMessageTarget('fixture-session');
document.querySelector('#native').onclick=()=>{document.querySelector('#native-count').textContent=String(++nativeCount);};
window.fixture={
    stop(){unmountEdit({notifyInactive:true});},
    verify:()=>({overlayActive:!!document.querySelector('#lamp7-genie-logic-edit'),nativeCount,rows:editor.getAll().map(r=>({id:r.id,parent:r.parentId,transaction:r.parentTranId,seq:r.seq})),validated}),
    command:async message=>{
        if(message.action==='EDIT_START'){area.setAttribute(DATA_ATTR_LOGIC_AREA_PIN,'true');return {success:mountEdit()};}
        if(message.action==='EDIT_STOP')unmountEdit({notifyInactive:true,modeId:message.modeId});
        if(message.action==='EDIT_CLEAR')clearEditSelection();
        if(message.action==='EDIT_DESELECT')deselectEditItem(message.payload.logicId);
        if(message.action==='EDIT_COPY_SELECTED')return {success:true,data:{logics:editor.getAll().filter(r=>message.payload.logicIds.includes(r.id)).map(plain)}};
        if(message.action==='EDIT_DELETE_SELECTED'){unmountEdit({notifyInactive:true});const before=rows.length;rows=rows.filter(r=>!message.payload.logicIds.includes(r.id));area.replaceChildren();renderer.renderLogics(rows);return {success:true,data:{deletedCount:before-rows.length,errors:[]}};}
        if(message.action==='EDIT_PASTE_START'){const context=prepareLogicPasteContext(message.payload.modeId,helpers,readLogicPasteContext);area.setAttribute(DATA_ATTR_LOGIC_AREA_PIN,'true');return {success:mountEdit(context)};}
        if(message.action==='EDIT_PASTE_LOGICS'){const context=beginLogicPaste(message.payload);if(!context)return {success:false,error:'위치 변경'};await publishPasteProgress(message.payload.modeId,message.payload.modeId,'로직 생성·연결 중 '+message.payload.logics.length+'개');const data=pasteCopiedLogicsInMainWorld({...message.payload,context},helpers,readLogicPasteContext);unmountEdit({notifyInactive:true,modeId:message.payload.modeId});return {success:!data.setupError&&!data.errors.length,data,error:data.setupError};}
        return {success:true};
    },
};
parent.postMessage({fixture:'logic-edit-ready'},location.origin);

document.addEventListener('genie:paste-progress',event=>parent.postMessage({message:{action:'PASTE_PROGRESS',targetSessionId:'fixture-session',payload:event.detail}},location.origin));
