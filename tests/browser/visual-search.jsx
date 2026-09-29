// Browser-only smoke fixture. Run with: npx vite --host 127.0.0.1
// Open /tests/browser/visual-search.html. All Lamp7 data and Chrome messaging are synthetic.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { VisualSearchPanel } from '../../src/features/visualSearch/VisualSearchPanel';
import { readVisualComponents } from '../../src/features/visualSearch/background/readComponents';
import { matchVisualComponents } from '../../src/features/visualSearch/background/matcher';
import { watchVisualEditor } from '../../src/features/visualSearch/background/watchEditor';
import { clearVisualSearch, showVisualSearch } from '../../src/features/visualSearch/overlay';
import { setMessageTarget } from '../../src/shared/messaging';
import '../../src/content/content.css';

const frame = document.querySelector('.gjs-frame');
await new Promise(resolve => {
    frame.onload = resolve;
    frame.srcdoc = `<!doctype html><style>
        body{margin:24px;font:16px/1.5 sans-serif;color:#0f172a;background:white}
        section{border:1px solid #cbd5e1;padding:20px;margin:0 0 24px}
        .field{border:1px solid #94a3b8;padding:10px;margin:10px 0;background:#f8fafc}
        .gap{height:600px} .grid-compo{border:1px solid #64748b;padding:15px}
    </style><main id="wrapper"><section id="row" eid="SearchArea" vid="v-row"><h2>거래처 조회</h2>
    <label id="customer-label" eid="CustomerLabel" vid="v-customer-label" valueid="CustomerName" class="col-form-label">고객명</label>
    <div id="customer" eid="CustomerName" vid="v-customer" labelid="CustomerLabel" class="field input-compo">고객 <span id="inline">이름</span></div>
    <button id="save" eid="SaveButton" vid="v-save" class="btn-compo"><span id="save-label" class="btn-name">저장</span></button>
    <div id="tab" style="display:none"><div id="hidden" eid="Secret" vid="v-hidden">숨김 주소</div></div></section>
    <div id="grid1" class="grid-compo"><h3>주문 Grid</h3>
    <table id="order-table"><thead id="order-head"><tr id="order-headers" class="grid-col-tr">
    <th id="order-header" eid="OrderColumn" vid="v-order-col" class="grid-col-compo"><span id="order-caption">주문 번호</span></th>
    </tr></thead><tbody id="order-body">
    <tr id="order-row1"><td id="order-cell1" class="grid-td"><div id="order1" eid="OrderNo" vid="v-order" class="field">주문 번호</div></td></tr>
    <tr id="order-row2"><td id="order-cell2" class="grid-td"><div id="order2" eid="OrderNo" vid="v-order" class="field">주문 번호</div></td></tr>
    </tbody></table></div>
    <div class="gap"></div><div id="grid2" class="grid-compo"><h3>다른 Grid</h3>
    <div id="order3" eid="OrderNo" vid="v-order" class="field">주문 번호</div></div></main>`;
});
const doc = frame.contentDocument;
const model = (id, type, children = []) => {
    const el = doc.getElementById(id);
    const attrs = Object.freeze(Object.fromEntries([...el.attributes].map(attr => [attr.name, attr.value])));
    const data = { type, attributes: attrs, components: { models: children } };
    return { cid: id, get: key => data[key], getEl: () => el };
};
const customerLabel = model('customer-label', 'label');
const customer = model('customer', 'col-compo', [model('inline', 'default')]);
const save = model('save', 'text-compo', [model('save-label', 'btn-inner')]);
const row = model('row', 'row', [customerLabel, customer, save, model('tab', 'tab', [model('hidden', 'text-compo')])]);
const wrapper = model('wrapper', 'wrapper', [row,
    model('grid1', 'grid-compo', [model('order-table', 'table', [
        model('order-head', 'thead', [model('order-headers', 'grid-col-tr', [model('order-header', 'cell', [model('order-caption', 'colName')])])]),
        model('order-body', 'tbody', [
            model('order-row1', 'table-row', [model('order-cell1', 'cell', [model('order1', 'text-compo')])]),
            model('order-row2', 'table-row', [model('order-cell2', 'cell', [model('order2', 'text-compo')])]),
        ]),
    ])]),
    model('grid2', 'grid-compo', [model('order3', 'text-compo')])]);
const editorListeners = new Set();
const selected = Object.freeze([customer]);
let selectionCalls = 0, dirtyCount = 0;
window.editor = { getWrapper: () => wrapper, getSelectedAll: () => selected,
    select: () => { selectionCalls++; }, on: (events, fn) => editorListeners.add(fn), off: (events, fn) => editorListeners.delete(fn) };
window._settingInfo = Object.freeze({ 'v-customer': Object.freeze({ name: '고객명', type: 'input', labelId: 'CustomerLabel', description: '조회할 거래처의 이름입니다.\n일부 이름으로도 조회할 수 있습니다.', nameHtml: '<b>고객</b> 이름<script>bad()</script>', placeholder: '고객을 입력하세요' }),
    'v-customer-label': Object.freeze({ name: '고객명', type: 'label', valueId: 'CustomerName' }),
    'v-save': Object.freeze({ name: '저장', type: 'btn', description: '변경한 거래처 정보를 저장합니다.' }),
    'v-row': Object.freeze({ name: '조회 영역' }), 'v-hidden': Object.freeze({ name: '숨김 주소' }), 'v-order': Object.freeze({ name: '주문 번호' }),
    'v-order-col': Object.freeze({ name: '주문 번호', type: 'grid-col' }) });
window._event = Object.freeze({ CustomerName: { change: ['example'] } });
const serialize = () => JSON.stringify({ html: wrapper.getEl().innerHTML, head: doc.head.innerHTML,
    settings: window._settingInfo, events: window._event, selected: window.editor.getSelectedAll().map(item => item.cid), selectionCalls });
let baseline = serialize();
const listeners = new Set();
const sessionId = 'fixture-visual-session';
setMessageTarget(sessionId);
const runtime = { id: 'synthetic-extension', onMessage: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
    sendMessage: async (message, callback) => {
        let result = { success: true };
        if (message.action === 'VISUAL_SEARCH_DIRTY') {
            dirtyCount++;
            for (const listener of listeners) listener({ action: 'VISUAL_SEARCH_CHANGED', targetSessionId: sessionId });
        } else if (message.action === 'VISUAL_SEARCH_CLEAR') clearVisualSearch();
        else if (message.action === 'VISUAL_SEARCH_START' || message.action === 'VISUAL_SEARCH_NAVIGATE') {
            const snapshot = readVisualComponents();
            if (snapshot.error) result = { success: false, error: snapshot.error };
            else {
                const { query, filters, activeId, requestId, scroll } = message.payload;
                const matches = matchVisualComponents(snapshot.records, query, filters);
                const current = matches.find(match => match.id === activeId) ?? matches[0];
                watchVisualEditor(sessionId);
                const data = { matches, activeId: current?.id ?? null, requestId, scroll };
                result.data = { ...data, notice: showVisualSearch(data, sessionId) };
            }
        }
        callback?.(result);
        return result;
    } };
window.chrome = { ...window.chrome, runtime };
const lines = [];
const check = (name, condition) => { lines.push(`${condition ? 'PASS' : 'FAIL'} ${name}`); document.querySelector('#checks').textContent = lines.join('\n'); };
const records = readVisualComponents().records;
check('설정 HTML을 텍스트로 추출하고 script를 제외', records.find(r => r.location.modelId === 'customer').text.includes('고객 이름') && !records.some(r => r.text.includes('bad()')));
check('부모가 자식의 검색 텍스트를 중복 소유하지 않음', !records.find(r => r.location.modelId === 'row').text.includes('고객'));
check('반복 Grid는 같은 Grid 안에서만 묶음', matchVisualComponents(records, 'OrderNo', { ids: true }).length === 2);
const columns = matchVisualComponents(records, '주문 번호', { text: true });
check('Col과 반복 Cell 동시 검색은 Col 하나로 표시', columns.length === 2 && columns[0].type === 'grid-col' && columns[0].locations.length === 3);
const cells = matchVisualComponents(records, 'order-cell', { ids: true });
check('ID 없는 반복 TD도 열마다 한 개 결과', cells.length === 1 && cells[0].locations.length === 2);
check('숨김 탭 내부도 검색 가능', matchVisualComponents(records, '숨김', { text: true })[0].hidden);
check('입력칸과 연결 라벨은 한 개 결과', matchVisualComponents(records, '고객명', { text: true }).length === 1);
const captionMatch = matchVisualComponents(records, 'CustomerLabel', { ids: true });
check('라벨 ID 검색은 입력칸으로 이동', captionMatch.length === 1 && captionMatch[0].locations.length === 1 && captionMatch[0].locations[0].modelId === 'customer');
const buttonMatch = matchVisualComponents(records, '저장', { text: true });
check('버튼과 내부 라벨은 한 개 결과', buttonMatch.length === 1 && buttonMatch[0].locations.length === 1 && buttonMatch[0].locations[0].modelId === 'save');
const verify = () => {
    check('캔버스 HTML·CSS·설정·이벤트·선택 원본 유지', baseline === serialize());
    check('하이라이트는 캔버스 외부에 위치', !doc.querySelector('#lamp7-genie-visual-overlay'));
};
verify();
const root = createRoot(document.querySelector('#panel'));
const notify = (kind, text) => { document.querySelector('#notice').textContent = text; };
root.render(<React.StrictMode><VisualSearchPanel focusSignal={1} notify={notify} clearNotice={() => notify('', '')} /></React.StrictMode>);
document.querySelector('#verify').onclick = verify;
document.querySelector('#zoom').onclick = () => {
    const zoomed = frame.style.transform === 'scale(0.8)';
    frame.style.transform = zoomed ? '' : 'scale(0.8)';
    frame.style.width = zoomed ? '100%' : '125%';
    frame.style.height = zoomed ? '100%' : '125%';
};
document.querySelector('#remove').onclick = () => {
    row.get('components').models = row.get('components').models.filter(item => item !== customer && item !== customerLabel);
    customerLabel.getEl().remove(); customer.getEl().remove(); baseline = serialize();
    for (const listener of editorListeners) listener();
};
document.querySelector('#undo').onclick = () => {
    if (!row.get('components').models.includes(customer)) {
        row.get('components').models.unshift(customerLabel, customer);
        row.getEl().append(customerLabel.getEl(), customer.getEl()); baseline = serialize();
        for (const listener of editorListeners) listener();
    }
};
document.querySelector('#unmount').onclick = () => {
    root.unmount();
    setTimeout(() => {
        verify();
        check('패널 종료 시 오버레이·editor 감시 해제', !document.querySelector('#lamp7-genie-visual-overlay') && editorListeners.size === 0);
        const count = dirtyCount;
        customer.getEl().setAttribute('data-hidden', 'Y');
        setTimeout(() => check('종료 후 변경 알림 없음', dirtyCount === count), 600);
    }, 20);
};
