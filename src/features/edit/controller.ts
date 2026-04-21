import {
    DATA_ATTR_LOGIC_AREA_PIN,
    EDIT_SELECTED_CLASS,
    EDIT_WRAP_ACTIVE_CLASS,
} from '../../shared/constants';
import type { ExtensionMessage } from '../../shared/types/messages';
import { collectSameOriginDocuments, findEditDom, seqItemKey } from './dom';
import { injectEditStyles } from './styles';

const POINTER_DRAG_THRESHOLD_PX = 6;
const CLICK_SUPPRESS_MS = 120;

let disposeSession: (() => void) | null = null;

function notifyInactive(): void {
    const msg: ExtensionMessage = { action: 'EDIT_NOTIFY_INACTIVE' };
    void chrome.runtime.sendMessage(msg);
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

    type PointerDownState = {
        pointerId: number;
        startX: number;
        startY: number;
        startIndex: number;
        dragMinY: number;
        dragMaxY: number;
    };

    let pointerDown: PointerDownState | null = null;

    const onPointerDown = (e: PointerEvent): void => {
        if (e.button !== 0) return;
        const li = (e.target as HTMLElement | null)?.closest('li');
        if (!li || !dom.seqItems.includes(li as HTMLLIElement)) return;
        const startIndex = dom.seqItems.indexOf(li as HTMLLIElement);
        if (startIndex < 0) return;
        pointerDown = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            startIndex,
            dragMinY: e.clientY,
            dragMaxY: e.clientY,
        };
        try {
            dom.seqUl.setPointerCapture(e.pointerId);
        } catch {
            /* noop */
        }
    };

    const onPointerMove = (e: PointerEvent): void => {
        if (!pointerDown || e.pointerId !== pointerDown.pointerId) return;
        pointerDown.dragMinY = Math.min(pointerDown.dragMinY, e.clientY);
        pointerDown.dragMaxY = Math.max(pointerDown.dragMaxY, e.clientY);
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

        const dx = e.clientX - pd.startX;
        const dy = e.clientY - pd.startY;
        const dragDist = Math.hypot(dx, dy);
        const bandSpan = pd.dragMaxY - pd.dragMinY;
        const isDrag =
            dragDist > POINTER_DRAG_THRESHOLD_PX || bandSpan > POINTER_DRAG_THRESHOLD_PX;

        let endIndex = pd.startIndex;
        const endEl = rootDoc.elementFromPoint(e.clientX, e.clientY);
        const endLi = endEl?.closest('li');
        if (endLi && dom.seqItems.includes(endLi as HTMLLIElement)) {
            endIndex = dom.seqItems.indexOf(endLi as HTMLLIElement);
        }

        if (isDrag) {
            const bandMin = pd.dragMinY;
            const bandMax = pd.dragMaxY;
            for (let i = 0; i < dom.seqItems.length; i++) {
                const r = dom.seqItems[i].getBoundingClientRect();
                if (r.bottom >= bandMin && r.top <= bandMax) {
                    selectedKeys.add(seqItemKey(dom.seqItems[i], i));
                }
            }
            lastAnchorIndex = endIndex;
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
    };

    const onPointerCancel = (e: PointerEvent): void => {
        if (pointerDown && e.pointerId === pointerDown.pointerId) {
            pointerDown = null;
            try {
                dom.seqUl.releasePointerCapture(e.pointerId);
            } catch {
                /* noop */
            }
        }
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
        unmountEdit({ notifyInactive: true });
    };

    dom.seqUl.addEventListener('pointerdown', onPointerDown);
    dom.seqUl.addEventListener('pointermove', onPointerMove);
    dom.seqUl.addEventListener('pointerup', onPointerUp);
    dom.seqUl.addEventListener('pointercancel', onPointerCancel);
    dom.seqUl.addEventListener('click', onClickCapture, true);
    rootDoc.addEventListener('keydown', onKeyDown, true);

    disposeSession = (): void => {
        disposeSession = null;
        dom.seqUl.removeEventListener('pointerdown', onPointerDown);
        dom.seqUl.removeEventListener('pointermove', onPointerMove);
        dom.seqUl.removeEventListener('pointerup', onPointerUp);
        dom.seqUl.removeEventListener('pointercancel', onPointerCancel);
        dom.seqUl.removeEventListener('click', onClickCapture, true);
        rootDoc.removeEventListener('keydown', onKeyDown, true);

        selectedKeys.clear();
        lastAnchorIndex = null;
        dom.wrap.classList.remove(EDIT_WRAP_ACTIVE_CLASS);
        clearSelectionClassesLocal();
        clearLogicAreaPin();
    };

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
