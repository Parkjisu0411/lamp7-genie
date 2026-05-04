import {
    DATA_ATTR_LOGIC_AREA_PIN,
    EDIT_SELECTED_CLASS,
    EDIT_WRAP_ACTIVE_CLASS,
} from '../../shared/constants';
import type {
    EditSelectionChangedPayload,
    ExtensionMessage,
} from '../../shared/types/messages';
import { collectSameOriginDocuments, findEditDom, resyncEditSeqItems, seqItemKey } from './dom';
import { injectEditStyles } from './styles';

const POINTER_DRAG_THRESHOLD_PX = 6;
const CLICK_SUPPRESS_MS = 120;

let disposeSession: (() => void) | null = null;

function notifyInactive(): void {
    const msg: ExtensionMessage = { action: 'EDIT_NOTIFY_INACTIVE' };
    void chrome.runtime.sendMessage(msg);
}

function logicIdFromSeqLi(li: HTMLLIElement): { logicId: string | null; error?: string } {
    const id = li.id?.trim();
    const suffix = '_seq';
    if (!id || !id.endsWith(suffix)) {
        console.error('[lamp7-genie] seq li id does not match {logicId}_seq', { id });
        return {
            logicId: null,
            error: '선택한 로직의 식별자를 읽을 수 없습니다. 화면을 새로고침한 뒤 다시 시도하세요.',
        };
    }
    const logicId = id.slice(0, -suffix.length).trim();
    if (!logicId) {
        console.error('[lamp7-genie] seq li id has empty logicId', { id });
        return {
            logicId: null,
            error: '선택한 로직의 식별자가 비어 있습니다. 선택을 다시 시도하세요.',
        };
    }
    return { logicId };
}

/** 핀은 iframe 내부 문서에만 있을 수 있어, 접근 가능한 같은 출처 문서 전부에서 제거 */
export function clearLogicAreaPin(): void {
    for (const doc of collectSameOriginDocuments(document)) {
        try {
            doc.querySelectorAll(`[${DATA_ATTR_LOGIC_AREA_PIN}]`).forEach((n) => {
                n.removeAttribute(DATA_ATTR_LOGIC_AREA_PIN);
            });
        } catch {
            /* noop */
        }
    }
}

export function isEditActive(): boolean {
    return disposeSession !== null;
}

/**
 * seq 열에서 다중 선택 UI를 연다. 이미 열려 있으면 true.
 * DOM을 찾지 못하면 false.
 */
export function mountEdit(): boolean {
    if (disposeSession) return true;

    const dom = findEditDom();
    if (!dom) return false;

    const rootDoc = dom.logicArea.ownerDocument;
    const rootWin = rootDoc.defaultView;

    injectEditStyles(rootDoc);
    dom.wrap.classList.add(EDIT_WRAP_ACTIVE_CLASS);

    const selectedKeys = new Set<string>();
    let lastAnchorIndex: number | null = null;

    let clickSuppressUntil = 0;

    const applySelectionClass = (): void => {
        dom.seqItems.forEach((li, i) => {
            const key = seqItemKey(li, i);
            li.classList.toggle(EDIT_SELECTED_CLASS, selectedKeys.has(key));
        });
    };

    const notifySelectionChanged = (): void => {
        resyncEditSeqItems(dom);
        const logicIds: string[] = [];
        const seen = new Set<string>();
        let error: string | undefined;
        dom.seqItems.forEach((li, i) => {
            const key = seqItemKey(li, i);
            if (!selectedKeys.has(key)) return;
            const result = logicIdFromSeqLi(li);
            const logicId = result.logicId;
            if (!logicId && !error) error = result.error;
            if (!logicId || seen.has(logicId)) return;
            seen.add(logicId);
            logicIds.push(logicId);
        });
        const msg: ExtensionMessage = {
            action: 'EDIT_SELECTION_CHANGED',
            payload: { logicIds, error } satisfies EditSelectionChangedPayload,
        };
        void chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError);
    };

    const addRangeInclusive = (from: number, to: number): void => {
        const a = Math.min(from, to);
        const b = Math.max(from, to);
        for (let i = a; i <= b; i++) {
            const li = dom.seqItems[i];
            if (li) selectedKeys.add(seqItemKey(li, i));
        }
    };

    const clearSelectionClassesLocal = (): void => {
        for (const li of dom.seqItems) {
            li.classList.remove(EDIT_SELECTED_CLASS);
        }
    };

    /**
     * Y좌표로 seq 행 인덱스. (호스트 리렌더 시 seqItems resync는 호출부에서)
     */
    const seqIndexFromClientY = (clientY: number): number => {
        const n = dom.seqItems.length;
        if (n === 0) return 0;
        if (n === 1) return 0;

        for (let i = 0; i < n; i++) {
            const r = dom.seqItems[i].getBoundingClientRect();
            if (clientY >= r.top && clientY <= r.bottom) return i;
        }

        const firstR = dom.seqItems[0].getBoundingClientRect();
        if (clientY < firstR.top) return 0;
        const lastR = dom.seqItems[n - 1].getBoundingClientRect();
        if (clientY > lastR.bottom) return n - 1;

        let best = 0;
        let bestDist = Infinity;
        for (let i = 0; i < n; i++) {
            const r = dom.seqItems[i].getBoundingClientRect();
            if (r.height <= 0) continue;
            const d =
                clientY >= r.top && clientY <= r.bottom
                    ? 0
                    : clientY < r.top
                      ? r.top - clientY
                      : clientY - r.bottom;
            if (d < bestDist) {
                bestDist = d;
                best = i;
            }
        }
        if (bestDist === Infinity) return 0;
        return best;
    };

    const toggleSeqIndex = (i: number): void => {
        const li = dom.seqItems[i];
        if (!li) return;
        const k = seqItemKey(li, i);
        if (selectedKeys.has(k)) selectedKeys.delete(k);
        else selectedKeys.add(k);
    };

    /** from~to 사이(양끝 포함) 모든 행을 한 번씩 토글 — 제스처에서 첫 번째로 인덱스가 바뀔 때만 사용 */
    const toggleInclusiveRange = (from: number, to: number): void => {
        if (from === to) return;
        const step = to > from ? 1 : -1;
        for (let i = from; i !== to; i += step) {
            toggleSeqIndex(i);
        }
        toggleSeqIndex(to);
    };

    /**
     * 이전 프레임 인덱스에서 한 칸씩 이동할 때만 새로 걸친 행만 토글.
     * (매번 inclusive를 쓰면 경계 행이 두 번 토글되어 원래대로 돌아감)
     * - 아래로: 직전 행(from)만 밟고 있었으므로 from+1 … to 만 토글.
     * - 위로: 끝 행(from)에서 위로 빠져나가면 from 자체를 토글해야 하므로 from … to+1 만큼 토글.
     */
    const toggleStrokeIncremental = (from: number, to: number): void => {
        if (from === to) return;
        if (to > from) {
            for (let i = from + 1; i <= to; i++) toggleSeqIndex(i);
        } else {
            for (let i = from; i > to; i--) {
                toggleSeqIndex(i);
            }
        }
    };

    type PointerDownState = {
        pointerId: number;
        startX: number;
        startY: number;
        startIndex: number;
        /** pointercancel 시 복구용 */
        snapshot: Set<string>;
        dragActivated: boolean;
        /** ul 밖으로 나갔을 때 마지막으로 잡힌 행 */
        lastDragIndex: number;
        /** 드래그 토글 브러시: 직전 포인터가 있던 행 */
        strokePrevIndex: number;
        /** 한 번이라도 행이 바뀌며 토글했으면 이후는 incremental만 */
        strokeBrushStarted: boolean;
        /** pointerup이 잘못된 clientY를 줄 때를 대비 — 마지막으로 본 Y */
        lastClientY: number;
        lastClientX: number;
    };

    let pointerDown: PointerDownState | null = null;

    const onPointerDown = (e: PointerEvent): void => {
        if (e.button !== 0) return;
        resyncEditSeqItems(dom);
        const li = (e.target as HTMLElement | null)?.closest('li');
        if (!li) return;
        const startIndex = dom.seqItems.indexOf(li as HTMLLIElement);
        if (startIndex < 0) return;
        pointerDown = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            startIndex,
            snapshot: new Set(selectedKeys),
            dragActivated: false,
            lastDragIndex: startIndex,
            strokePrevIndex: startIndex,
            strokeBrushStarted: false,
            lastClientY: e.clientY,
            lastClientX: e.clientX,
        };
        try {
            dom.seqUl.setPointerCapture(e.pointerId);
        } catch {
            /* noop */
        }
    };

    const onPointerMove = (e: PointerEvent): void => {
        if (!pointerDown || e.pointerId !== pointerDown.pointerId) return;
        const pd = pointerDown;
        resyncEditSeqItems(dom);
        if (dom.seqItems.length === 0) return;

        pd.lastClientX = e.clientX;
        pd.lastClientY = e.clientY;

        const coalesced =
            typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
        const samples = coalesced.length > 0 ? coalesced : [e];

        let runningPrev = pd.strokePrevIndex;
        const nItems = dom.seqItems.length;
        const clip = (i: number): number => Math.max(0, Math.min(nItems - 1, i));
        runningPrev = clip(runningPrev);

        for (const ev of samples) {
            pd.lastClientX = ev.clientX;
            pd.lastClientY = ev.clientY;

            const dx = ev.clientX - pd.startX;
            const dy = ev.clientY - pd.startY;
            const dist = Math.hypot(dx, dy);
            if (!pd.dragActivated && dist <= POINTER_DRAG_THRESHOLD_PX) continue;

            if (!pd.dragActivated) pd.dragActivated = true;

            const currentIndex = clip(seqIndexFromClientY(ev.clientY));
            pd.lastDragIndex = currentIndex;

            if (currentIndex !== runningPrev) {
                if (!pd.strokeBrushStarted) {
                    toggleInclusiveRange(runningPrev, currentIndex);
                    pd.strokeBrushStarted = true;
                } else {
                    toggleStrokeIncremental(runningPrev, currentIndex);
                }
                runningPrev = currentIndex;
            }
        }
        pd.strokePrevIndex = runningPrev;
        applySelectionClass();
    };

    const onPointerUp = (e: PointerEvent): void => {
        if (!pointerDown || e.pointerId !== pointerDown.pointerId) return;
        const pd = pointerDown;
        pointerDown = null;
        try {
            dom.seqUl.releasePointerCapture(e.pointerId);
        } catch {
            /* noop */
        }

        resyncEditSeqItems(dom);

        const dx = e.clientX - pd.startX;
        const dy = e.clientY - pd.startY;
        const dragDist = Math.hypot(dx, dy);
        const isDrag = pd.dragActivated || dragDist > POINTER_DRAG_THRESHOLD_PX;

        if (isDrag) {
            const nItems = dom.seqItems.length;
            if (nItems > 0) {
                const clip = (i: number): number => Math.max(0, Math.min(nItems - 1, i));
                const y = pd.dragActivated ? pd.lastClientY : e.clientY;
                const endIndex = clip(seqIndexFromClientY(y));
                const fromIdx = clip(pd.strokePrevIndex);
                pd.lastDragIndex = endIndex;
                if (endIndex !== fromIdx) {
                    if (!pd.strokeBrushStarted) {
                        toggleInclusiveRange(fromIdx, endIndex);
                    } else {
                        toggleStrokeIncremental(fromIdx, endIndex);
                    }
                    pd.strokePrevIndex = endIndex;
                    pd.strokeBrushStarted = true;
                }
                lastAnchorIndex = endIndex;
            }
        } else if (e.shiftKey) {
            const anchor = lastAnchorIndex ?? pd.startIndex;
            addRangeInclusive(anchor, pd.startIndex);
            lastAnchorIndex = pd.startIndex;
        } else {
            const li = dom.seqItems[pd.startIndex];
            if (li) {
                const k = seqItemKey(li, pd.startIndex);
                if (selectedKeys.has(k)) selectedKeys.delete(k);
                else selectedKeys.add(k);
            }
            lastAnchorIndex = pd.startIndex;
        }

        applySelectionClass();
        clickSuppressUntil = performance.now() + CLICK_SUPPRESS_MS;
        notifySelectionChanged();
    };

    const onPointerCancel = (e: PointerEvent): void => {
        if (!pointerDown || e.pointerId !== pointerDown.pointerId) return;
        const pd = pointerDown;
        pointerDown = null;
        try {
            dom.seqUl.releasePointerCapture(e.pointerId);
        } catch {
            /* noop */
        }
        selectedKeys.clear();
        for (const k of pd.snapshot) selectedKeys.add(k);
        applySelectionClass();
        notifySelectionChanged();
    };

    const onClickCapture = (e: MouseEvent): void => {
        if (performance.now() < clickSuppressUntil) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    };

    const onKeyDown = (e: KeyboardEvent): void => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        const msg: ExtensionMessage = { action: 'GENIE_DISMISS' };
        void chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError);
    };

    dom.seqUl.addEventListener('pointerdown', onPointerDown);
    /** document보다 window 캡처가 iframe/캡처 시 이동 이벤트 수신이 안정적인 경우가 많음 */
    const onMove = onPointerMove;
    if (rootWin) {
        rootWin.addEventListener('pointermove', onMove, { capture: true, passive: true });
        rootWin.addEventListener('pointerup', onPointerUp, { capture: true, passive: true });
        rootWin.addEventListener('pointercancel', onPointerCancel, { capture: true, passive: true });
    } else {
        rootDoc.addEventListener('pointermove', onMove, true);
        rootDoc.addEventListener('pointerup', onPointerUp, true);
        rootDoc.addEventListener('pointercancel', onPointerCancel, true);
    }
    dom.seqUl.addEventListener('click', onClickCapture, true);
    rootDoc.addEventListener('keydown', onKeyDown, true);

    disposeSession = (): void => {
        disposeSession = null;
        dom.seqUl.removeEventListener('pointerdown', onPointerDown);
        if (rootWin) {
            rootWin.removeEventListener('pointermove', onMove, { capture: true } as AddEventListenerOptions);
            rootWin.removeEventListener('pointerup', onPointerUp, { capture: true } as AddEventListenerOptions);
            rootWin.removeEventListener('pointercancel', onPointerCancel, { capture: true } as AddEventListenerOptions);
        } else {
            rootDoc.removeEventListener('pointermove', onMove, true);
            rootDoc.removeEventListener('pointerup', onPointerUp, true);
            rootDoc.removeEventListener('pointercancel', onPointerCancel, true);
        }
        dom.seqUl.removeEventListener('click', onClickCapture, true);
        rootDoc.removeEventListener('keydown', onKeyDown, true);

        selectedKeys.clear();
        lastAnchorIndex = null;
        dom.wrap.classList.remove(EDIT_WRAP_ACTIVE_CLASS);
        clearSelectionClassesLocal();
        clearLogicAreaPin();
    };

    notifySelectionChanged();

    return true;
}

export function unmountEdit(opts: { notifyInactive?: boolean } = {}): void {
    if (disposeSession) {
        disposeSession();
    } else {
        clearLogicAreaPin();
    }
    if (opts.notifyInactive) notifyInactive();
}
