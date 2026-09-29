import { pasteCopiedLogicsInMainWorld } from '../src/features/edit/background/pasteLogicCreator.ts';
import { prepareLogicPasteContext, readLogicPasteContext } from '../src/features/edit/background/pasteContext.ts';

// Minimal DOM/model fixture. Relationship rules match Logic.js and logicUtils.js;
// the optional local-source test also runs the actual native reset method against this tree.
export function logicHarness() {
    const nodes = new Map();
    class Node {
        constructor(id='', classes='') { this.id=id; this.children=[]; this.parentElement=null; this.isConnected=true; this.dataset={}; this.attrs={}; this.classes=new Set(classes.split(' ')); this.classList={contains:v=>this.classes.has(v)}; if(id)nodes.set(id,this); }
        get nextElementSibling(){const a=this.parentElement?.children||[];return a[a.indexOf(this)+1]||null;}
        get firstElementChild(){return this.children[0]||null;}
        get lastElementChild(){return this.children.at(-1)||null;}
        append(n){return this.insertBefore(n,null);}
        insertBefore(n,b){if(n===b)return; if(n.parentElement)n.parentElement.children.splice(n.parentElement.children.indexOf(n),1);const at=b?this.children.indexOf(b):this.children.length;if(at<0)throw Error('invalid reference');this.children.splice(at,0,n);n.parentElement=this;return n;}
        contains(n){return this===n||this.children.some(c=>c.contains(n));}
        getClientRects(){return [{}];}
        getAttribute(k){return this.attrs[k]??null;}
        setAttribute(k,v){this.attrs[k]=v;}
        querySelector(s){return this.querySelectorAll(s)[0]||null;}
        querySelectorAll(s){return this.children.flatMap(c=>[(s==='[id]'?!!c.id:s==='.head-logic.editable'?c.classes.has('editable'):c.classes.has(s.slice(1)))?c:null,...c.querySelectorAll(s)]).filter(Boolean);}
    }
    const area=new Node('area','logic_area'),host=new Node('lamp7-genie-logic-edit'),owner=new Node('id');owner.value='eventA';
    area.ownerDocument={getElementById:id=>nodes.get(id)};
    const logics=new Map(),validated=[],rendered=[];let nextId=1,sequenceResets=0,connects=0;
    const calls={create:0,sort:0,failCreate:new Set(),failValidate:new Set()};
    class Logic {
        constructor(id,type,props){this.id=id;this.type=type;Object.assign(this,props);this.id=id;this.type=type;}
        getId(){return this.id;} getType(){return this.type;} getElement(){return nodes.get(this.id);}
        getPrev(){const a=editor.getAll(),i=a.indexOf(this);for(let n=i-1;n>=0;n--){if(a[n].lvl===this.lvl)return a[n];if(a[n].lvl<this.lvl)break;}}
        getNext(){const a=editor.getAll();return a.slice(a.indexOf(this)+1).find(l=>l.lvl===this.lvl&&l.parentId===this.parentId);}
        getParent(){const out=[];let p=this.parentId;while(p){const l=logics.get(p);if(!l)break;out.push(l);p=l.parentId;}return out;}
        getChildren(){const a=editor.getAll(),i=a.indexOf(this);const out=[];for(const l of a.slice(i+1)){if(l.lvl<=this.lvl)break;out.push(l);}return out;}
        validate(){validated.push(this.id);if(calls.failValidate.has(this.id))throw Error('validation failed');}
        validateLoadCompelete(){return true;} expand(){this.expanded=true;}
    }
    class ConditionLogic extends Logic {static _TYPE='condition';refreshConditionLineState(){} getBundle(){const result=[this];let p=this;while(['and','or'].includes(p.condition?.prefix)){p=p.getPrev();if(!(p instanceof ConditionLogic))break;result.unshift(p);}p=this.getNext();while(p instanceof ConditionLogic&&['and','or'].includes(p.condition?.prefix)){result.push(p);p=p.getNext();}return result;}}
    class IterationLogic extends Logic {}
    class TransactionLogic extends Logic {static _TYPE_TRANSACTION='transaction';static _TYPE_SYSTEMFUNCTION='systemFunction';isSystemFunction(){return this.type==='systemfunction';}}
    class VariableLogic extends Logic {}
    const parentTransaction = logic => {
        if(!(logic instanceof Logic))return;
        const prev=logic.getPrev(),parent=logic.getParent()[0];
        if(prev){if(prev instanceof TransactionLogic){if(logic instanceof ConditionLogic||logic instanceof IterationLogic||logic instanceof VariableLogic)return prev;return parentTransaction(prev);}if(logic instanceof ConditionLogic||logic instanceof IterationLogic)return parentTransaction(prev);return parentTransaction(parent);}
        if(!(parent instanceof TransactionLogic))return parentTransaction(parent);
    };
    const utils={getParentTranId:l=>{const p=parentTransaction(l);return p?.[p.isSystemFunction()?'systemFunction':'transaction']?.id||'';}};
    const editor={get:id=>logics.get(id),getAll:()=>[...logics.values()].sort((a,b)=>Number(a.seq)-Number(b.seq)),createLogic(id,type,prefix,props){calls.create++;if(calls.failCreate.has(props.name))throw Error('create failed');id=id||'new'+nextId++;const C=type==='condition'?ConditionLogic:type==='iteration'?IterationLogic:['transaction','systemfunction'].includes(type)?TransactionLogic:type==='variable'?VariableLogic:Logic;const l=new C(id,type,props);logics.set(id,l);return l;},resetLogicLevelAndSeqAll(){let seq=1;const walk=(container,parent='',lvl=0)=>{for(const node of container.children){const l=logics.get(node.id);if(!l)continue;l.parentId=parent;l.lvl=lvl;l.seq=seq++;const list=nodes.get(node.id+'_processLogic');if(list)walk(list,node.id,lvl+1);}};walk(area);for(const l of editor.getAll()){l.parentTranId=utils.getParentTranId(l);for(const key of ['condition','transaction','systemFunction'])if(l[key])l[key].parentTranId=l.parentTranId;}sequenceResets++;connects++;}};
    const renderer={renderLogics(items){for(const l of items){rendered.push(l.id);const node=new Node(l.id,'logic-row'),accor=new Node('','lst-accor');node.append(accor);if(['condition','iteration'].includes(l.type))accor.append(new Node(l.id+'_processLogic','body-accor'));(nodes.get(l.parentId+'_processLogic')||area).append(node);}editor.resetLogicLevelAndSeqAll();},resetLogicSeqArea(){sequenceResets++;},connectConditionLogic(){connects++;},resetConditionLogicCustomIcon(){}};
    const wrap=items=>({remove(){},prepend(){},0:items[0],length:items.length,[Symbol.iterator]:()=>items[Symbol.iterator](),children:s=>wrap(items.flatMap(n=>n.children).filter(n=>!s||n.classes.has(s.slice(1)))),hasClass:c=>items[0]?.classes.has(c),addClass:c=>items.forEach(n=>n.classes.add(c)),removeClass:c=>items.forEach(n=>n.classes.delete(c))});
    const jq=n=>wrap([n]);jq.divTab=s=>s==='.logic_area'?wrap([area]):wrap(nodes.has(s.slice(1))?[nodes.get(s.slice(1))]:[]);
    const env={LogicEditor:editor,LogicRenderer:renderer,LogicUtils:utils,Logic,ConditionLogic,IterationLogic,VariableLogic,TransactionLogic,LogicEventHandler:{setLogicBlockNestedSortable(){calls.sort++;}},$:jq,_tabId_:'tab-A'};
    const helpers={readBinding:n=>env[n],asStringId:v=>v==null?'':String(v).trim(),unwrapElement:n=>n && 'length' in n ? n[0]||null : n||null};
    function seed(items){const created=items.map(raw=>editor.createLogic(raw.id,raw.type,'',structuredClone(raw)));renderer.renderLogics(created);calls.create=0;validated.length=0;rendered.length=0;}
    function start(modeId='paste-1'){const context=prepareLogicPasteContext(modeId,helpers,readLogicPasteContext);host.dataset={pasteMode:modeId,pastePhase:'committing'};area.setAttribute('data-genie-paste-mode',modeId);return context;}
    function paste(logics,location={anchorId:'',position:'root-end'},context=start()){return pasteCopiedLogicsInMainWorld({logics,location,context,modeId:context.modeId},helpers,readLogicPasteContext);}
    return {Node,nodes,area,host,owner,editor,renderer,utils,env,helpers,seed,start,paste,validated,rendered,calls,logics,get sequenceResets(){return sequenceResets;},get connects(){return connects;}};
}
