import React from 'react';
import { createRoot } from 'react-dom/client';
import { VisualEditPanel } from '../../src/features/visualEdit/VisualEditPanel';
import { setMessageTarget } from '../../src/shared/messaging';
import '../../src/content/content.css';
import { VISUAL_CLIPBOARD_KEY } from '../../src/features/visualEdit/clipboard';
const target = document.querySelector('#editor-target');
const listeners = new Set();
const storageListeners = new Set();
// Fixture-only implementation of extension storage with real browser cross-tab events.
const storage = { local: {
    get: async key => ({[key]:JSON.parse(localStorage.getItem(key)??'null')}),
    set: async values => { for(const [key,value] of Object.entries(values)){const oldValue=JSON.parse(localStorage.getItem(key)??'null');localStorage.setItem(key,JSON.stringify(value));for(const fn of storageListeners)fn({[key]:{oldValue,newValue:value}},'local');} },
}, onChanged: {addListener: fn=>storageListeners.add(fn),removeListener:fn=>storageListeners.delete(fn)} };
window.addEventListener('storage',event=>{if(event.key)for(const fn of storageListeners)fn({[event.key]:{newValue:JSON.parse(event.newValue??'null')}},'local');});
window.chrome = { storage, runtime: { id: 'fixture', onMessage: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
    async sendMessage(message, callback) {
        const api = target.contentWindow.fixture;
        let result = { success: true };
        if (message.action === 'VISUAL_EDIT_START') result = api.start(message.payload.modeId);
        if (message.action === 'VISUAL_EDIT_STOP') api.stop(message.payload.modeId);
        if (message.action === 'VISUAL_EDIT_CLEAR') api.clear(message.payload.modeId);
        if (message.action === 'VISUAL_EDIT_DESELECT') api.deselect(message.payload.modeId, message.payload.modelId);
        if (message.action === 'VISUAL_EDIT_DELETE') result = await api.delete(message.payload);
        if (message.action === 'VISUAL_EDIT_PASTE_START') result = api.pasteStart(message.payload,(await storage.local.get(VISUAL_CLIPBOARD_KEY))[VISUAL_CLIPBOARD_KEY]);
        if (message.action === 'VISUAL_EDIT_COPY') { result=await api.transfer('copy',message.payload);if(result.success)await storage.local.set({[VISUAL_CLIPBOARD_KEY]:result.data.clipboard}); }
        if (message.action === 'VISUAL_EDIT_PASTE') result=await api.transfer('paste',message.payload,(await storage.local.get(VISUAL_CLIPBOARD_KEY))[VISUAL_CLIPBOARD_KEY]);
        callback?.(result); return Promise.resolve(result);
    } } };
setMessageTarget('fixture-session');
const notify = (kind, text) => { document.querySelector('#notice').textContent = text; };
const clearNotice = () => { document.querySelector('#notice').textContent = ''; };
const root = createRoot(document.querySelector('#panel'));
const mount = () => root.render(<VisualEditPanel notify={notify} clearNotice={clearNotice} />);
window.addEventListener('message', e => {
    if (e.source !== target.contentWindow || e.origin !== location.origin) return;
    if (e.data.fixture === 'visual-edit-ready') { mount(); document.querySelector('#checks').textContent = '준비 완료'; }
    if (e.data.fixture === 'visual-edit-state') for (const listener of listeners) listener(e.data.message);
});
if (target.contentWindow.fixture) mount();
document.querySelector('#verify').onclick = () => { document.querySelector('#checks').textContent = JSON.stringify(target.contentWindow.fixture.verify(), null, 2); };
document.querySelector('#zoom').onclick = () => target.contentWindow.fixture.zoom();
document
    .querySelector('#scroll-left')
    ?.addEventListener('click', () => target.contentWindow.fixture.scrollCanvas(false));
document
    .querySelector('#scroll-right')
    ?.addEventListener('click', () => target.contentWindow.fixture.scrollCanvas(true));
document.querySelector('#change').onclick = () => target.contentWindow.fixture.change();
document.querySelector('#close').onclick = () => root.render(null);
document.querySelector('#reopen').onclick = mount;
