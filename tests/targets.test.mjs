import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { targetKindFromUrl } from '../src/shared/targets/routes.ts';
import { probeTarget } from '../src/background/targets/probeTarget.ts';
import { resolveTarget } from '../src/background/targets/resolveTarget.ts';
import { refreshTabTarget, forgetTabTarget } from '../src/background/targetState.ts';
import { readVisualComponents } from '../src/features/visualSearch/background/readComponents.ts';
import { watchVisualEditor } from '../src/features/visualSearch/background/watchEditor.ts';
import { watchVisualSelection } from '../src/features/visualEdit/background/watchSelection.ts';
import { deleteVisualComponents } from '../src/features/visualEdit/background/deleteComponents.ts';
import { transferVisualComponents } from '../src/features/visualEdit/background/transferComponents.ts';
import { VISUAL_CLIPBOARD_KEY } from '../src/features/visualEdit/clipboard.ts';

const base = 'https://lamp7.seoyoneh.com/s/2/10033';
const visual = { frameId: 10, documentId: 'visual-doc', url: `${base}/screens/edit?seq=17038` };
const logic = { frameId: 20, documentId: 'logic-doc', url: `${base}/screens/event/eventSetting` };
let frames = [];
let reports = {};
let injections = [];
let sent = [];
let runtimeListener;
const sessionStorage = {};
const localStorage = {};
let storageFailure = false;
let operationResult;
let frameResponse;
const listenerEvent = { addListener() {} };
globalThis.chrome = {
    storage: { session: {
        get: async key => ({ [key]: sessionStorage[key] }),
        set: async values => Object.assign(sessionStorage, values),
        remove: async key => { delete sessionStorage[key]; },
    }, local: {
        get: async key => ({ [key]: localStorage[key] }),
        set: async values => { if (storageFailure) throw Error('quota'); Object.assign(localStorage, values); },
    } },
    webNavigation: { getAllFrames: async () => frames,
        onCompleted: listenerEvent, onCommitted: listenerEvent, onHistoryStateUpdated: listenerEvent },
    scripting: { executeScript: async options => {
        injections.push(options);
        const doc = options.target.documentIds?.[0];
        if (options.func !== probeTarget) {
            if (operationResult === undefined) throw new Error('Unexpected edit operation');
            return [{ result: typeof operationResult === 'function' ? await operationResult(options) : operationResult }];
        }
        return [{ result: reports[doc] ?? null }];
    } },
    tabs: { onUpdated: listenerEvent, onActivated: listenerEvent, onRemoved: listenerEvent,
        sendMessage: async (tabId, message, options, callback) => {
            sent.push({ tabId, message, options });
            const response = frameResponse ? await frameResponse(message) : { success: true };
            callback?.(response);
            return response;
        } },
    runtime: { id: 'test-extension', onMessage: { addListener(fn) { runtimeListener = fn; } } },
    action: { onClicked: listenerEvent, setTitle: async () => {} },
    commands: { onCommand: listenerEvent },
};
await import('../src/background/background.ts');

function setup(items) {
    forgetTabTarget(1);
    frames = items;
    reports = Object.fromEntries(items.map(frame => [frame.documentId, {
        visible: true, ready: true, focused: false, url: frame.url, screenId: '17038', missing: [],
    }]));
    injections = [];
    sent = [];
    operationResult = undefined;
    frameResponse = undefined;
    storageFailure = false;
}
const dispatch = (message, sender = { tab: { id: 1 }, frameId: 0, documentId: 'top-doc' }) =>
    new Promise(resolve => runtimeListener(message, sender, resolve));

const copiedVisual = () => ({kind:'lamp7-genie/visual',version:1,id:'copy-1',source:{origin:base,systemId:'10033'},roots:[{eid:'A'}],images:{},tables:[]});
test('logic list removal and clear only forward from the current panel to the exact document', async()=>{
    for(const action of ['EDIT_CLEAR','EDIT_DESELECT']){
        setup([logic]);const target=await refreshTabTarget(1);
        const request={action,targetSessionId:target.sessionId,payload:{logicId:'logic-1'}};
        assert.equal((await dispatch(request)).success,true);
        assert.equal(sent.find(call=>call.message.action===action).options.documentId,'logic-doc');
        sent=[];
        assert.equal((await dispatch({...request,targetSessionId:'stale'})).success,false);
        assert.equal((await dispatch(request,{tab:{id:1},frameId:20,documentId:'logic-doc'})).success,false);
        assert.equal(sent.some(call=>call.message.action===action),false);
    }
});
async function transferSetup(action='VISUAL_EDIT_COPY') {
    setup([visual]);const target=await refreshTabTarget(1);
    const payload={modeId:'transfer-mode',requestId:'transfer-request',modelIds:['a'],clipboardId:'copy-1',position:'inside'};
    const request={action,targetSessionId:target.sessionId,payload};
    const selection={modeId:payload.modeId,requestId:payload.requestId,locations:[{modelId:'a',domId:'a',eid:'A',vid:'v-a'}]};
    frameResponse=message=>message.action==='VISUAL_EDIT_TRANSFER_BEGIN'?{success:true,data:selection}:{success:true};
    localStorage[VISUAL_CLIPBOARD_KEY]=copiedVisual();
    operationResult=action==='VISUAL_EDIT_COPY'?{clipboard:copiedVisual(),records:[]}:{createdIds:['new-a'],records:[]};
    return {request,selection,target};
}

test('visual copy stores a self-contained clipboard only after the verified MAIN result',async()=>{
    const {request}=await transferSetup();localStorage[VISUAL_CLIPBOARD_KEY]={previous:true};
    const response=await dispatch(request);assert.equal(response.success,true);
    assert.equal(localStorage[VISUAL_CLIPBOARD_KEY].source.screenId,'17038');
    const calls=injections.filter(c=>c.func===transferVisualComponents);assert.equal(calls.length,1);
    assert.deepEqual(calls[0].target.documentIds,['visual-doc']);assert.equal(calls[0].args[0].action,'copy');
    assert.ok(sent.some(c=>c.message.action==='VISUAL_EDIT_STOP'));
});

test('clipboard quota failure retains previous data, reports failure and releases the selection lock',async()=>{
    const {request}=await transferSetup();localStorage[VISUAL_CLIPBOARD_KEY]={previous:true};storageFailure=true;
    const response=await dispatch(request);assert.equal(response.success,false);assert.match(response.error,/저장/);
    assert.deepEqual(localStorage[VISUAL_CLIPBOARD_KEY],{previous:true});
    assert.ok(sent.some(c=>c.message.action==='VISUAL_EDIT_DELETE_ABORT'));
});

test('paste reads extension storage and ends selection without rebuilding or selecting created roots',async()=>{
    const {request}=await transferSetup('VISUAL_EDIT_PASTE');
    const response=await dispatch(request);assert.equal(response.success,true);
    const call=injections.find(c=>c.func===transferVisualComponents);assert.equal(call.args[0].clipboard.id,'copy-1');
    assert.deepEqual(call.target.documentIds,['visual-doc']);
    assert.equal(sent.some(c=>c.message.action==='VISUAL_EDIT_DELETE_END'),false);
    assert.ok(sent.some(c=>c.message.action==='VISUAL_EDIT_STOP'&&c.options.documentId==='visual-doc'));
    assert.equal(sent.some(c=>c.message.action==='VISUAL_EDIT_DELETE_ABORT'),false,'no redundant abort after acknowledged stop');
    assert.deepEqual(response.data.createdIds,['new-a']);
});

test('changed clipboard, stale session, non-panel sender and mismatched lock cannot paste',async()=>{
    for(const variant of ['clipboard','session','sender','lock']){
        const {request}=await transferSetup('VISUAL_EDIT_PASTE');let sender;
        if(variant==='clipboard')localStorage[VISUAL_CLIPBOARD_KEY].id='new-copy';
        if(variant==='session')request.targetSessionId='old';
        if(variant==='sender')sender={tab:{id:1},frameId:10,documentId:'visual-doc'};
        if(variant==='lock')frameResponse=m=>m.action==='VISUAL_EDIT_TRANSFER_BEGIN'?{success:true,data:{modeId:'wrong',requestId:'wrong',locations:[]}}:{success:true};
        assert.equal((await dispatch(request,sender)).success,false);
        assert.equal(injections.some(c=>c.func===transferVisualComponents),false);
    }
});

test('paste result loss and partial failures stop selection without retrying or hiding actual created IDs',async()=>{
    for(const result of [null,{createdIds:['new-a'],records:[],error:'partial'}]){
        const {request}=await transferSetup('VISUAL_EDIT_PASTE');operationResult=result;
        const response=await dispatch(request);assert.equal(response.success,false);
        assert.equal(injections.filter(c=>c.func===transferVisualComponents).length,1);
        assert.ok(sent.some(c=>c.message.action==='VISUAL_EDIT_STOP'));
        assert.equal(sent.some(c=>c.message.action==='VISUAL_EDIT_DELETE_END'),false);
        if(result)assert.deepEqual(response.data.createdIds,['new-a']);
    }
});

test('paste-position mode mounts only validated targets from the exact destination document',async()=>{
    const {request}=await transferSetup('VISUAL_EDIT_PASTE_START');
    operationResult=call=>call.func===readVisualComponents?{records:[]}:call.func===watchVisualSelection?true:{targets:[{modelId:'container',positions:['inside']}],records:[]};
    assert.equal((await dispatch(request)).success,true);
    const mounted=sent.find(c=>c.message.action==='VISUAL_EDIT_MOUNT');
    assert.deepEqual(mounted.message.payload.paste,{targets:[{modelId:'container',positions:['inside']}],clipboardId:'copy-1'});
    assert.equal(mounted.options.documentId,'visual-doc');
    assert.equal(injections.filter(c=>c.func===readVisualComponents).length,0,'targets already supplies the single screen snapshot');
    assert.equal(injections.filter(c=>c.func===transferVisualComponents).length,1);
});

test('paste cleanup falls back to abort when stop is not acknowledged',async()=>{
    const {request,selection}=await transferSetup('VISUAL_EDIT_PASTE');
    frameResponse=m=>m.action==='VISUAL_EDIT_TRANSFER_BEGIN'?{success:true,data:selection}:m.action==='VISUAL_EDIT_STOP'?{success:false}:{success:true};
    assert.equal((await dispatch(request)).success,true);
    assert.ok(sent.some(c=>c.message.action==='VISUAL_EDIT_DELETE_ABORT'));
    assert.equal(injections.filter(c=>c.func===transferVisualComponents).length,1);
});

test('closing and reopening the same screen renews the retired session before paste selection', async () => {
    const { request, target } = await transferSetup('VISUAL_EDIT_PASTE_START');
    const retired = new Set();
    frameResponse = message => {
        if (message.action === 'TARGET_RESET') retired.add(message.targetSessionId);
        return { success: message.action !== 'VISUAL_EDIT_MOUNT' || !retired.has(message.targetSessionId) };
    };
    assert.equal((await dispatch({ action: 'GENIE_DISMISS', targetSessionId: target.sessionId })).success, true);
    const reopened = await refreshTabTarget(1);
    assert.notEqual(reopened.sessionId, target.sessionId);
    assert.equal(retired.has(target.sessionId), true);
    operationResult = call => call.func === readVisualComponents ? { records: [] } : call.func === watchVisualSelection ? true : { targets: ['container'], records: [] };
    assert.equal((await dispatch(request)).success, false, 'old panel commands remain invalid');
    assert.equal((await dispatch({ ...request, targetSessionId: reopened.sessionId })).success, true);
});

async function deleteSetup() {
    setup([visual]);
    const target = await refreshTabTarget(1);
    const payload = { modeId: 'delete-mode', requestId: 'delete-request', modelIds: ['a'] };
    const request = { action: 'VISUAL_EDIT_DELETE', targetSessionId: target.sessionId, payload };
    const selection = { modeId: payload.modeId, requestId: payload.requestId,
        locations: [{ modelId: 'a', domId: 'a', eid: 'A', vid: 'v-a' }] };
    frameResponse = message => message.action === 'VISUAL_EDIT_DELETE_BEGIN' ? { success: true, data: selection } : { success: true };
    operationResult = { deletedIds: ['a'], cascadedIds: [], remainingIds: [], records: [] };
    return { request, selection };
}

test('visual delete locks actual selection, targets the exact document once, and refreshes selection', async () => {
    const { request, selection } = await deleteSetup();
    const response = await dispatch(request);
    assert.equal(response.success, true);
    const mutations = injections.filter(call => call.func === deleteVisualComponents);
    assert.equal(mutations.length, 1);
    assert.deepEqual(mutations[0].target.documentIds, ['visual-doc']);
    assert.deepEqual(mutations[0].args[0], selection);
    assert.equal(typeof mutations[0].args[1].reader, 'string');
    assert.deepEqual(sent.filter(call => call.message.action.startsWith('VISUAL_EDIT_DELETE')).map(call => call.message.action),
        ['VISUAL_EDIT_DELETE_BEGIN', 'VISUAL_EDIT_DELETE_END', 'VISUAL_EDIT_DELETE_ABORT']);
    assert.ok(sent.filter(call => call.message.action.startsWith('VISUAL_EDIT_DELETE')).every(call => call.options.documentId === 'visual-doc'));
});

test('visual delete rejects a stale session, non-panel sender, and replaced editor document', async () => {
    const { request } = await deleteSetup();
    assert.equal((await dispatch({ ...request, targetSessionId: 'old' })).success, false);
    assert.equal((await dispatch(request, { tab: { id: 1 }, frameId: 10, documentId: 'visual-doc' })).success, false);
    frames = [{ ...visual, documentId: 'new-doc' }]; reports['new-doc'] = reports['visual-doc'];
    assert.equal((await dispatch(request)).success, false);
    assert.equal(injections.some(call => call.func === deleteVisualComponents), false);
});

test('visual delete needs a matching controller lock; mismatched and busy requests never mutate', async () => {
    for (const mismatch of [false, true]) {
        const { request, selection } = await deleteSetup();
        frameResponse = message => message.action === 'VISUAL_EDIT_DELETE_BEGIN'
            ? mismatch ? { success: true, data: { ...selection, requestId: 'other' } } : { success: false, error: 'busy' }
            : { success: true };
        assert.equal((await dispatch(request)).success, false);
        assert.equal(injections.some(call => call.func === deleteVisualComponents), false);
        if (mismatch) assert.ok(sent.some(call => call.message.action === 'VISUAL_EDIT_DELETE_ABORT'));
    }
});

test('visual delete preserves partial results and refreshes remaining selection on failure', async () => {
    const { request } = await deleteSetup();
    operationResult = { deletedIds: [], cascadedIds: [], remainingIds: ['a'], records: [], failed: { id: 'a', message: 'native rejected' }, error: 'native rejected' };
    const response = await dispatch(request);
    assert.equal(response.success, false);
    assert.equal(response.data.failed.id, 'a');
    assert.deepEqual(sent.find(call => call.message.action === 'VISUAL_EDIT_DELETE_END').message.payload.result.remainingIds, ['a']);
});

test('lost visual delete result is never retried and releases the busy mode through abort', async () => {
    const { request } = await deleteSetup(); operationResult = null;
    const response = await dispatch(request);
    assert.equal(response.success, false);
    assert.equal(injections.filter(call => call.func === deleteVisualComponents).length, 1);
    assert.equal(sent.some(call => call.message.action === 'VISUAL_EDIT_DELETE_END'), false);
    assert.ok(sent.some(call => call.message.action === 'VISUAL_EDIT_DELETE_ABORT'));
});

test('visual selection mounts only in the verified visual document and cannot run Logic mutations', async () => {
    setup([visual]);
    const target = await refreshTabTarget(1);
    operationResult = options => options.func === readVisualComponents ? { records: [] } : true;
    const result = await dispatch({ action: 'VISUAL_EDIT_START', targetSessionId: target.sessionId, payload: { modeId: 'selection-1' } });
    assert.equal(result.success, true);
    const mount = sent.find(call => call.message.action === 'VISUAL_EDIT_MOUNT');
    assert.equal(mount.options.documentId, visual.documentId);
    assert.equal(mount.message.targetSessionId, target.sessionId);
    assert.ok(injections.every(call => [probeTarget, readVisualComponents, watchVisualSelection].includes(call.func)));
    assert.equal((await dispatch({ action: 'EDIT_DELETE_SELECTED', targetSessionId: target.sessionId, payload: { logicIds: ['row'] } })).success, false);
});

test('visual selection rejects stale sessions, non-panel starts, and wrong-document state', async () => {
    setup([visual]);
    const target = await refreshTabTarget(1);
    const message = { action: 'VISUAL_EDIT_START', targetSessionId: target.sessionId, payload: { modeId: 'bad' } };
    assert.equal((await dispatch({ ...message, targetSessionId: 'old' })).success, false);
    assert.equal((await dispatch(message, { tab: { id: 1 }, frameId: 9, documentId: 'wrong' })).success, false);
    assert.equal((await dispatch({ action: 'VISUAL_EDIT_STATE', targetSessionId: target.sessionId, payload: { modeId: 'bad', active: true, items: [] } }, { tab: { id: 1 }, frameId: visual.frameId, documentId: 'old-doc' })).success, false);
    assert.ok(injections.every(call => call.func === probeTarget));
    setup([logic]);
    const logicTarget = await refreshTabTarget(1);
    assert.equal((await dispatch({ ...message, targetSessionId: logicTarget.sessionId })).success, false);
});

test('stop cancels an in-flight selection snapshot before it can mount', async () => {
    setup([visual]);
    const target = await refreshTabTarget(1);
    let release;
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    operationResult = () => { entered(); return new Promise(resolve => { release = resolve; }); };
    const request = { targetSessionId: target.sessionId, payload: { modeId: 'cancelled' } };
    const start = dispatch({ ...request, action: 'VISUAL_EDIT_START' });
    await started;
    const stop = dispatch({ ...request, action: 'VISUAL_EDIT_STOP' });
    await new Promise(resolve => setTimeout(resolve, 10));
    release({ records: [] });
    assert.equal((await start).success, false);
    await stop;
    assert.equal(sent.some(call => call.message.action === 'VISUAL_EDIT_MOUNT'), false);
});

test('watcher failure after mounting tears down the selection shield', async () => {
    setup([visual]);
    const target = await refreshTabTarget(1);
    operationResult = options => options.func === readVisualComponents ? { records: [] } : false;
    const result = await dispatch({ action: 'VISUAL_EDIT_START', targetSessionId: target.sessionId, payload: { modeId: 'watch-failure' } });
    assert.equal(result.success, false);
    assert.ok(sent.some(call => call.message.action === 'VISUAL_EDIT_MOUNT'));
    assert.ok(sent.some(call => call.message.action === 'VISUAL_EDIT_STOP' && call.message.payload.modeId === 'watch-failure'));
});

test('dismissing during a pending start cancels it and cannot revive a retired session from storage', async () => {
    setup([visual]);
    const target = await refreshTabTarget(1);
    let release, entered;
    const started = new Promise(resolve => { entered = resolve; });
    operationResult = () => { entered(); return new Promise(resolve => { release = resolve; }); };
    const start = dispatch({ action: 'VISUAL_EDIT_START', targetSessionId: target.sessionId, payload: { modeId: 'closing' } });
    await started;
    assert.equal((await dispatch({ action: 'GENIE_DISMISS', targetSessionId: target.sessionId })).success, true);
    assert.equal(sessionStorage['genie-target:1'], undefined);
    release({ records: [] });
    assert.equal((await start).success, false);
    assert.equal(sent.some(call => call.message.action === 'VISUAL_EDIT_MOUNT'), false);
    assert.notEqual((await refreshTabTarget(1)).sessionId, target.sessionId);
});

test('list deselection uses the verified document and rejects stale/non-panel requests', async () => {
    setup([visual]);
    const target = await refreshTabTarget(1);
    const request = { action: 'VISUAL_EDIT_DESELECT', targetSessionId: target.sessionId, payload: { modeId: 'mode-list', modelId: 'rowA' } };
    assert.equal((await dispatch(request)).success, true);
    const delivery = sent.find(call => call.message.action === request.action);
    assert.equal(delivery.options.documentId, visual.documentId);
    assert.deepEqual(delivery.message.payload, request.payload);
    assert.equal((await dispatch({ ...request, targetSessionId: 'old' })).success, false);
    assert.equal((await dispatch(request, { tab: { id: 1 }, frameId: visual.frameId, documentId: visual.documentId })).success, false);
    assert.ok(injections.every(call => call.func === probeTarget));
});

test('only exact local studio routes are accepted', () => {
    assert.equal(targetKindFromUrl(`${base}/screens/edit?seq=1#setting`), 'visual');
    assert.equal(targetKindFromUrl(`${base}/screens/new/`), 'visual');
    assert.equal(targetKindFromUrl(`${base}/screens/event/eventSetting/`), 'logic');
    for (const url of ['about:blank', `${base}/screens/list`, `${base}/screens/editPreview`,
        `${base}/screens/event/eventSetting/other`, `https://example.com/?url=${base}/screens/edit`]) {
        assert.equal(targetKindFromUrl(url), null);
    }
});

test('unsupported pages are never probed and cannot dispatch editing', async () => {
    setup([{ ...visual, url: `${base}/screens/list` }]);
    assert.equal(await resolveTarget(1), null);
    assert.equal(injections.length, 0);
    assert.equal((await dispatch({ action: 'EDIT_DELETE_SELECTED', payload: { logicIds: ['x'] } })).success, false);
    assert.equal(injections.length, 0);
});

test('visible logic modal wins; hiding it restores visual; unready modal blocks fallback', async () => {
    setup([visual, logic]);
    assert.equal((await resolveTarget(1)).kind, 'logic');
    reports['logic-doc'].ready = false;
    assert.equal(await resolveTarget(1), null);
    reports['logic-doc'].visible = false;
    assert.equal((await resolveTarget(1)).kind, 'visual');
    assert.ok(injections.every(call => call.target.documentIds && !call.target.frameIds));
});

test('ambiguous editors fail closed; the focused editor resolves ambiguity', async () => {
    setup([visual, { ...visual, frameId: 11, documentId: 'second' }]);
    assert.equal(await resolveTarget(1), null);
    reports.second.focused = true;
    assert.equal((await resolveTarget(1)).documentId, 'second');
});

test('modal transitions clear the old document and use a fresh activation session', async () => {
    setup([visual, logic]);
    reports['logic-doc'].visible = false;
    const first = await refreshTabTarget(1);
    assert.equal((await refreshTabTarget(1)).sessionId, first.sessionId);
    reports['logic-doc'].visible = true;
    const second = await refreshTabTarget(1);
    assert.equal(second.kind, 'logic');
    assert.notEqual(second.sessionId, first.sessionId);
    assert.ok(sent.some(call => call.message.action === 'TARGET_RESET' && call.options.documentId === 'visual-doc'));
    reports['logic-doc'].visible = false;
    const third = await refreshTabTarget(1);
    assert.notEqual(third.sessionId, first.sessionId);
    frames = [];
    assert.equal(await refreshTabTarget(1), null);
    assert.equal(sent.at(-1).message.payload.available, false);
});

test('stale, wrong-frame and visual edit requests never execute a mutation', async () => {
    setup([logic]);
    const target = await refreshTabTarget(1);
    const message = { action: 'EDIT_DELETE_SELECTED', payload: { logicIds: ['old'] }, targetSessionId: target.sessionId };
    // Same frame id now holds a different document.
    frames = [{ ...logic, documentId: 'new-logic-doc' }];
    reports['new-logic-doc'] = { ...reports['logic-doc'] };
    assert.equal((await dispatch(message)).success, false);
    const fresh = await refreshTabTarget(1);
    assert.equal((await dispatch({ ...message, targetSessionId: fresh.sessionId },
        { tab: { id: 1 }, frameId: 99, documentId: 'unrelated' })).success, false);
    setup([visual]);
    const canvasTarget = await refreshTabTarget(1);
    assert.deepEqual(canvasTarget.capabilities, { search: true, edit: true });
    assert.equal((await dispatch({ ...message, targetSessionId: canvasTarget.sessionId })).success, false);
    assert.ok(injections.every(call => call.func === probeTarget));
});

test('valid logic search and selection mode retain the verified document and session', async () => {
    setup([logic]);
    const target = await refreshTabTarget(1);
    operationResult = [];
    const search = await dispatch({ action: 'SEARCH_START', targetSessionId: target.sessionId,
        payload: { query: 'logic1', filters: { event: true } } });
    assert.equal(search.success, true);
    const highlight = sent.find(call => call.message.action === 'HIGHLIGHT_TARGETS');
    assert.equal(highlight.options.documentId, logic.documentId);
    assert.equal(highlight.message.targetSessionId, target.sessionId);
    operationResult = 'ok';
    assert.equal((await dispatch({ action: 'EDIT_START', targetSessionId: target.sessionId })).success, true);
    assert.equal(sent.find(call => call.message.action === 'EDIT_START').options.documentId, logic.documentId);
});

test('a sleeping MV3 worker resumes the stored session without resetting the editor', async () => {
    setup([logic]);
    const resolved = await resolveTarget(1);
    sessionStorage['genie-target:1'] = {
        identity: resolved.sessionId,
        target: { ...resolved, sessionId: 'resumed-session' },
    };
    assert.equal((await refreshTabTarget(1)).sessionId, 'resumed-session');
    assert.equal(sent.some(call => call.message.action === 'TARGET_RESET'), false);
});

test('serialized MAIN probe detects hidden frame ancestors and missing APIs without mutating', () => {
    const style = { display: 'block', visibility: 'visible', opacity: '1' };
    const ownerDocument = { defaultView: { getComputedStyle: el => el.style ?? style } };
    const el = extra => ({ ownerDocument, parentElement: null, hasAttribute: () => false,
        getClientRects: () => [{}], ...extra });
    const modal = el({ style: { ...style, display: 'none' } });
    const frame = el({ parentElement: modal });
    const parent = { document: { activeElement: frame } };
    parent.top = parent;
    const window = { frameElement: frame, parent, top: parent };
    const canvas = { contentDocument: { body: el({}) } };
    const document = { body: el({}), querySelector: selector =>
        selector === '#gjs .gjs-frame' ? canvas : selector === '#screen-save' ? el({}) : null };
    const editor = { getWrapper() {}, getSelectedAll() {}, select() {}, on() {}, off() {}, Canvas: { getFrameEl() {} } };
    const sandbox = { window, document, editor, location: { href: visual.url }, URL };
    const run = () => vm.runInNewContext(`(${probeTarget.toString()})('visual')`, sandbox);
    assert.equal(run().visible, false);
    modal.style = style;
    assert.equal(run().visible, true);
    assert.equal(run().ready, true);
    delete editor.getSelectedAll;
    assert.equal(run().ready, false);
    assert.ok(run().missing.includes('editor.getSelectedAll'));
});

const sampleComponent = {
    location: { modelId: 'c10', domId: 'dom10', eid: 'CustomerName', vid: 'v10' },
    name: '고객 이름', label: '고객 이름', description: '', componentType: 'input', type: 'text-compo', text: '거래처', path: '검색 영역', gridId: null,
    hidden: false, rendered: true, order: 0,
};
const searchVisual = sessionId => ({ action: 'VISUAL_SEARCH_START', targetSessionId: sessionId,
    payload: { requestId: crypto.randomUUID(), query: 'customername', filters: { ids: true, text: true }, scroll: true } });

test('visual search uses the verified document and never calls selection/edit APIs', async () => {
    setup([visual]);
    const target = await refreshTabTarget(1);
    operationResult = options => {
        if (options.func === readVisualComponents) return { records: [sampleComponent] };
        if (options.func === watchVisualEditor) return true;
        assert.fail('Unexpected MAIN operation');
    };
    const result = await dispatch(searchVisual(target.sessionId));
    assert.equal(result.success, true);
    assert.equal(result.data.matches.length, 1);
    const present = sent.find(call => call.message.action === 'VISUAL_SEARCH_PRESENT');
    assert.equal(present.options.documentId, visual.documentId);
    assert.equal(present.message.targetSessionId, target.sessionId);
    assert.equal(present.message.payload.scroll, true);
    assert.ok(injections.every(call => call.target.documentIds[0] === visual.documentId));
    const navigate = searchVisual(target.sessionId);
    navigate.action = 'VISUAL_SEARCH_NAVIGATE';
    navigate.payload.activeId = 'removed-component';
    assert.match((await dispatch(navigate)).data.notice, /갱신/);
    assert.equal(sent.at(-1).message.payload.scroll, false);
});

test('visual search rejects wrong sessions, Logic targets and wrong frame notifications', async () => {
    setup([visual]);
    const target = await refreshTabTarget(1);
    assert.equal((await dispatch(searchVisual('stale-session'))).success, false);
    assert.equal((await dispatch(searchVisual(target.sessionId), { tab: { id: 1 }, frameId: 99 })).success, false);
    const dirty = { action: 'VISUAL_SEARCH_DIRTY', targetSessionId: target.sessionId };
    assert.equal((await dispatch(dirty, { tab: { id: 1 }, frameId: visual.frameId, documentId: 'replaced' })).success, false);
    assert.equal((await dispatch(dirty, { tab: { id: 1 }, frameId: visual.frameId, documentId: visual.documentId })).success, true);
    assert.equal(sent.at(-1).message.action, 'VISUAL_SEARCH_CHANGED');
    setup([logic]);
    assert.equal((await dispatch(searchVisual((await refreshTabTarget(1)).sessionId))).success, false);
    assert.ok(injections.every(call => call.func === probeTarget));
});

test('clear supersedes an in-flight snapshot without presenting stale highlights', async () => {
    setup([visual]);
    const target = await refreshTabTarget(1);
    let release, started;
    const startedPromise = new Promise(resolve => { started = resolve; });
    operationResult = () => new Promise(resolve => { release = resolve; started(); });
    const search = dispatch(searchVisual(target.sessionId));
    await startedPromise;
    const clear = dispatch({ action: 'VISUAL_SEARCH_CLEAR', targetSessionId: target.sessionId, payload: { requestId: 'clear' } });
    // Allow target refresh to enqueue clear while the snapshot is still pending.
    await new Promise(resolve => setImmediate(resolve));
    release({ records: [sampleComponent] });
    assert.equal((await search).success, false);
    assert.equal((await clear).success, true);
    assert.equal(sent.some(call => call.message.action === 'VISUAL_SEARCH_PRESENT'), false);
    assert.equal(sent.at(-1).message.action, 'VISUAL_SEARCH_CLEAR');
});

test('reader and watcher failures remove stale highlights and report an error', async () => {
    setup([visual]);
    const target = await refreshTabTarget(1);
    operationResult = { records: [], error: '설정 없음' };
    assert.equal((await dispatch(searchVisual(target.sessionId))).error, '설정 없음');
    assert.equal(sent.at(-1).message.action, 'VISUAL_SEARCH_CLEAR');
    operationResult = options => options.func === readVisualComponents ? { records: [sampleComponent] } : false;
    assert.equal((await dispatch(searchVisual(target.sessionId))).success, false);
    assert.equal(sent.at(-1).message.action, 'VISUAL_SEARCH_CLEAR');
});

test('opening the Logic modal invalidates an in-flight visual search', async () => {
    setup([visual, logic]);
    reports['logic-doc'].visible = false;
    const target = await refreshTabTarget(1);
    let release, started;
    const startedPromise = new Promise(resolve => { started = resolve; });
    operationResult = () => new Promise(resolve => { release = resolve; started(); });
    const search = dispatch(searchVisual(target.sessionId));
    await startedPromise;
    reports['logic-doc'].visible = true;
    assert.equal((await refreshTabTarget(1)).kind, 'logic');
    release({ records: [sampleComponent] });
    assert.equal((await search).success, false);
    assert.equal(sent.some(call => call.message.action === 'VISUAL_SEARCH_PRESENT'), false);
    assert.ok(sent.some(call => call.message.action === 'TARGET_RESET' && call.options.documentId === visual.documentId));
});

test('Logic paste start/pick are scoped to the current panel and source document',async()=>{
    setup([logic]);const target=await refreshTabTarget(1);
    const context={modeId:'paste-mode',tabKey:'event-tab',ownerId:'eventA',signature:'[]',rows:[]};
    operationResult=options=>options.args?.[0]==='paste-mode'?{context}:'ok';
    const start={action:'EDIT_PASTE_START',targetSessionId:target.sessionId,payload:{modeId:'paste-mode'}};
    assert.equal((await dispatch(start)).success,true);
    const mount=sent.find(call=>call.message.action==='EDIT_PASTE_MOUNT');
    assert.equal(mount.options.documentId,'logic-doc');assert.deepEqual(mount.message.payload,context);
    const pick={action:'EDIT_PASTE_PICKED',targetSessionId:target.sessionId,payload:{modeId:'paste-mode',location:{anchorId:'a',position:'inside'}}};
    assert.equal((await dispatch(pick)).success,false);
    assert.equal((await dispatch(pick,{tab:{id:1},frameId:20,documentId:'old-doc'})).success,false);
    assert.equal((await dispatch(pick,{tab:{id:1},frameId:20,documentId:'logic-doc'})).success,true);
    assert.deepEqual(sent.at(-1).message.payload.paste,pick.payload);
});
test('Logic paste never injects a mutation without a controller click ticket',async()=>{
    setup([logic]);const target=await refreshTabTarget(1);
    frameResponse=()=>({success:false});
    const req={action:'EDIT_PASTE_LOGICS',targetSessionId:target.sessionId,payload:{modeId:'m',logics:[{id:'copy'}],location:{anchorId:'a',position:'inside'}}};
    const res=await dispatch(req);assert.equal(res.success,false);
    assert.equal(injections.filter(c=>c.func!==probeTarget).length,0);
});
test('Logic paste forwards context to exact-document MAIN and stops even on partial render failure',async()=>{
    setup([logic]);const target=await refreshTabTarget(1);
    const context={modeId:'m',tabKey:'event-tab',ownerId:'eventA',signature:'old',rows:[]};
    frameResponse=m=>m.action==='EDIT_PASTE_BEGIN'?{success:true,data:context}:{success:true};
    operationResult={createdCount:2,errors:[],setupError:'render error'};
    const payload={modeId:'m',logics:[{id:'copy'}],location:{anchorId:'a',position:'inside'}};
    const res=await dispatch({action:'EDIT_PASTE_LOGICS',targetSessionId:target.sessionId,payload});
    assert.equal(res.success,false);assert.equal(res.data.createdCount,2);
    const call=injections.find(c=>c.func!==probeTarget);assert.deepEqual(call.target.documentIds,['logic-doc']);
    assert.deepEqual(call.args[0],{...payload,context});
    assert.ok(sent.some(c=>c.message.action==='EDIT_STOP'&&c.message.modeId==='m'));
});
