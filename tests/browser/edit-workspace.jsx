import React from 'react';
import { createRoot } from 'react-dom/client';
import { FloatingPanel } from '../../src/content/FloatingPanel';
import { setMessageTarget } from '../../src/shared/messaging';
import { VISUAL_CLIPBOARD_KEY } from '../../src/features/visualEdit/clipboard';
import '../../src/content/content.css';
// The installed extension also injects its bundled CSS on localhost. Keep this
// fixture on the working-tree stylesheet so an older build cannot override it.
const removeInstalledStyles = () => {
    for (const style of document.querySelectorAll('style:not([data-vite-dev-id])')) {
        if (style.textContent.includes('#lamp7-genie-root')) style.remove();
    }
};
removeInstalledStyles();
const styleObserver = new MutationObserver(removeInstalledStyles);
styleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
window.addEventListener('pagehide', () => styleObserver.disconnect(), { once: true });
const kind=new URLSearchParams(location.search).get('kind')==='logic'?'logic':'visual';
const target=document.querySelector('#editor-target');
const listeners=new Set(),storageListeners=new Set();
const store={};
const storage={local:{get:async key=>({[key]:store[key]}),set:async values=>{Object.assign(store,values);for(const fn of storageListeners)fn(Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{newValue:value}])),'local');}},onChanged:{addListener:fn=>storageListeners.add(fn),removeListener:fn=>storageListeners.delete(fn)}};
let isVisible=true;
const root=createRoot(document.querySelector('#lamp7-genie-root'));
const context={kind,tabId:1,frameId:10,documentId:'fixture-doc',sessionId:'fixture-session',url:location.href,screenId:'fixture',capabilities:{search:true,edit:true}};
const mount=()=>root.render(<FloatingPanel isVisible={isVisible} focusSearchSignal={0} target={context}/>);
window.chrome={storage,runtime:{id:'fixture',onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},async sendMessage(message,callback){
    const api=target.contentWindow.fixture;
    let result={success:true};
    if(message.action==='GENIE_DISMISS'){api.stop();isVisible=false;mount();}
    if(message.action==='VISUAL_EDIT_START')result=api.start(message.payload.modeId);
    if(message.action==='VISUAL_EDIT_STOP')api.stop(message.payload.modeId);
    if(message.action==='VISUAL_EDIT_CLEAR')api.clear(message.payload.modeId);
    if(message.action==='VISUAL_EDIT_DESELECT')api.deselect(message.payload.modeId,message.payload.modelId);
    if(message.action==='VISUAL_EDIT_DELETE')result=await api.delete(message.payload);
    if(message.action==='VISUAL_EDIT_PASTE_START')result=await api.pasteStart(message.payload,store[VISUAL_CLIPBOARD_KEY]);
    if(message.action==='VISUAL_EDIT_COPY'){result=await api.transfer('copy',message.payload);if(result.success)await storage.local.set({[VISUAL_CLIPBOARD_KEY]:result.data.clipboard});}
    if(message.action==='VISUAL_EDIT_PASTE')result=await api.transfer('paste',message.payload,store[VISUAL_CLIPBOARD_KEY]);
    if(kind==='logic')result=await api.command(message);
    callback?.(result);return result;
}}};
setMessageTarget('fixture-session');
window.addEventListener('message',event=>{
    if(event.source!==target.contentWindow || event.origin!==location.origin)return;
    if(event.data.fixture?.endsWith('-ready')){mount();document.querySelector('#checks').textContent='준비 완료';}
    if(event.data.message)for(const fn of listeners)fn(event.data.message);
});
target.src=kind==='logic'?'./logic-edit-target.html':'./visual-edit-target.html';
document.querySelector('#verify').onclick=()=>{document.querySelector('#checks').textContent=JSON.stringify(target.contentWindow.fixture.verify());};
document.querySelector('#dismiss').onclick=()=>{isVisible=false;mount();};
document.querySelector('#reopen').onclick=()=>{isVisible=true;mount();};
document.querySelector('#narrow').onclick=()=>{document.querySelector('body').style.width='375px';};
