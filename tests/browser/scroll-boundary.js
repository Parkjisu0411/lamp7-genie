// Real content-script navigation functions, in a synthetic nested-frame layout.
import { showVisualSearch, clearVisualSearch } from '../../src/features/visualSearch/overlay';
import { activateHighlightById, clearHighlights } from '../../src/features/search/searchHighlighter';
import { scrollWithin } from '../../src/shared/scrollWithin';

const canvas=document.querySelector('.gjs-frame'),logic=document.querySelector('.logic-panel');
await new Promise(resolve=>{
    canvas.onload=resolve;
    canvas.srcdoc=`<!doctype html><style>body{margin:0;font:16px sans-serif}.gap{height:1800px}#bottom{height:40px;background:#fde68a}.nested{height:120px;width:220px;overflow:auto;border:3px solid #ddd}#nested-target{margin:500px 0 0 700px;width:100px;height:40px;background:#c4b5fd}</style><div id="top" eid="top" vid="v-top">상단</div><div class="gap"></div><div id="bottom" eid="bottom" vid="v-bottom">하단 검색 대상</div><div class="nested"><div id="nested-target" eid="nested" vid="v-nested">내부 검색 대상</div></div><div class="gap"></div>`;
});
const doc=canvas.contentDocument;
const lines=[];
const output=()=>parent.postMessage({checks:lines.join('\n')},location.origin);
const check=(text,ok)=>{lines.push(`${ok?'PASS':'FAIL'} ${text}`);output();if(!ok)throw new Error(text)};
const roots=()=>[parent.document.documentElement,parent.document.body,document.documentElement,document.body];
const positions=()=>roots().map(e=>[e.scrollLeft,e.scrollTop]);
const original=doc.body.innerHTML;
function reset(){
    clearVisualSearch();clearHighlights({keepDataAttr:true});
    for(const node of roots())node.scrollTo({left:0,top:0,behavior:'instant'});
    doc.scrollingElement.scrollTo({left:0,top:0,behavior:'instant'});
    doc.querySelector('.nested').scrollTo({left:0,top:0,behavior:'instant'});
    document.querySelector('#gjs').hidden=false;logic.hidden=true;
    canvas.style.cssText='';
}
function show(id){
    const el=doc.getElementById(id);
    const match={id,type:'input',label:id,eid:el.getAttribute('eid'),locations:[{domId:id,eid:el.getAttribute('eid'),vid:el.getAttribute('vid')}],hidden:false};
    const error=showVisualSearch({requestId:id,matches:[match],activeId:id,scroll:true},'scroll-regression');
    if(error)throw new Error(error);
    return el.getBoundingClientRect();
}
function verify(){
    reset();lines.length=0;
    // Nonzero pre-existing offsets must not be silently reset either.
    parent.document.body.scrollTop=7;
    document.body.scrollTop=9;
    const before=JSON.stringify(positions()),toolbar=document.querySelector('#toolbar').getBoundingClientRect().top;
    for(let i=0;i<3;i++){
        let rect=show('bottom');
        check(`화면 검색 ${i+1}: 하단 표시`,rect.top>=0&&rect.bottom<=doc.documentElement.clientHeight);
        rect=show('top');check(`화면 검색 ${i+1}: 상단 복귀`,rect.bottom>0&&rect.top>=0);
    }
    show('nested-target');
    const nested=doc.querySelector('.nested'),nr=nested.getBoundingClientRect(),tr=doc.getElementById('nested-target').getBoundingClientRect();
    check('중첩 영역의 가로·세로 이동',nested.scrollTop>0&&nested.scrollLeft>0&&tr.left>=nr.left&&tr.right<=nr.right&&tr.top>=nr.top&&tr.bottom<=nr.bottom);
    canvas.style.cssText='transform:scale(.8);width:125%;height:125%';
    const zoomed=show('bottom');
    check('80% 캔버스에서도 대상 표시',zoomed.top>=0&&zoomed.bottom<=doc.documentElement.clientHeight);
    check('화면 검색: 외부 문서 위치 유지',JSON.stringify(positions())===before);
    check('화면 검색: 원본 HTML 유지',doc.body.innerHTML===original);
    clearVisualSearch();document.querySelector('#gjs').hidden=true;logic.hidden=false;
    activateHighlightById('logic-bottom');
    const lr=document.querySelector('.logic-row').getBoundingClientRect(),pr=logic.getBoundingClientRect();
    check('로직 검색: 실제 상위 스크롤 패널 이동',logic.scrollTop>0&&lr.top>=pr.top&&lr.bottom<=pr.bottom);
    check('로직 검색: 외부 문서 위치 유지',JSON.stringify(positions())===before);
    const list=document.querySelector('.panel__results'),result=document.querySelector('#list-result');
    scrollWithin(result,list,'nearest');
    check('검색 목록 안에서만 이동',list.scrollTop>0&&JSON.stringify(positions())===before);
    check('도구 모음 위치 유지',document.querySelector('#toolbar').getBoundingClientRect().top===toolbar);
}
window.addEventListener('message',event=>{
    if(event.source!==parent)return;
    try{
        if(event.data==='verify')verify();
        else if(event.data==='old'){
            reset();lines.length=0;
            doc.getElementById('bottom').scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
            lines.push(`기존 방식: 편집 문서 scrollTop=${document.body.scrollTop}px`, `도구 모음 top=${document.querySelector('#toolbar').getBoundingClientRect().top}px`);output();
        }
    }catch(error){lines.push(`ERROR ${error.message}`);output();}
});
lines.push('준비 완료. 기존 문제 재현 / 수정 동작 검증을 누르세요.');output();
