import {
    DATA_ATTR_LOGIC_AREA_PIN,
    EDIT_WRAP_ACTIVE_CLASS,
} from '../../shared/constants';
import { sendRuntimeMessageQuietly } from '../../shared/messaging';
import type {
    EditSelectionChangedPayload,
    ExtensionMessage,
} from '../../shared/types/messages';
import { collectSameOriginDocuments, findEditDom, resyncEditSeqItems, seqItemKey } from './dom';
import { createPointerSelectionSession } from './pointerSelectionSession';
import { createEditSelectionModel } from './selectionModel';
import { injectEditStyles } from './styles';

const POINTER_DRAG_THRESHOLD_PX = 6;
const CLICK_SUPPRESS_MS = 120;

let disposeSession: (() => void) | null = null;

function notifyInactive(): void {
    sendRuntimeMessageQuietly({ action: 'EDIT_NOTIFY_INACTIVE' });
}

function logicIdFromSeqLi(li: HTMLLIElement): { logicId: string | null; error?: string } {
    const id = li.id?.trim();
    const suffix = '_seq';
    if (!id || !id.endsWith(suffix)) {
        console.error('[lamp7-genie] seq li id does not match {logicId}_seq', { id });
        return {
            logicId: null,
            error: '선택한 로직의 연결 정보를 읽을 수 없습니다. 화면을 새로고침한 뒤 다시 시도하세요.',
        };
    }

    const logicId = id.slice(0, -suffix.length).trim();
    if (!logicId) {
        console.error('[lamp7-genie] seq li id has empty logicId', { id });
        return {
            logicId: null,
            error: '선택한 로직의 연결 정보가 비어 있습니다. 다시 선택해 주세요.',
        };
    }

    return { logicId };
}

export function clearLogicAreaPin(): void {
    for (const doc of collectSameOriginDocuments(document)) {
        try {
            doc.querySelectorAll(`[${DATA_ATTR_LOGIC_AREA_PIN}]`).forEach((node) => {
                node.removeAttribute(DATA_ATTR_LOGIC_AREA_PIN);
            });
        } catch {
            /* noop */
        }
    }
}

export function isEditActive(): boolean {
    return disposeSession !== null;
}

export function mountEdit(): boolean {
    if (disposeSession) return true;

    const dom = findEditDom();
    if (!dom) return false;

    const rootDoc = dom.logicArea.ownerDocument;
    const rootWin = rootDoc.defaultView;

    injectEditStyles(rootDoc);
    dom.wrap.classList.add(EDIT_WRAP_ACTIVE_CLASS);

    const selection = createEditSelectionModel(dom);
    let clickSuppressUntil = 0;

    const notifySelectionChanged = (): void => {
        resyncEditSeqItems(dom);
        const logicIds: string[] = [];
        const seen = new Set<string>();
        let error: string | undefined;

        dom.seqItems.forEach((li, i) => {
            const key = seqItemKey(li, i);
            if (!selection.selectedKeys.has(key)) return;

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
        sendRuntimeMessageQuietly(msg);
    };

    const pointerSession = createPointerSelectionSession({
        dom,
        selection,
        dragThresholdPx: POINTER_DRAG_THRESHOLD_PX,
        onPaint: () => selection.applySelectionClass(),
        onCommit: notifySelectionChanged,
        onSuppressClick: () => {
            clickSuppressUntil = performance.now() + CLICK_SUPPRESS_MS;
        },
    });

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
        sendRuntimeMessageQuietly({ action: 'GENIE_DISMISS' });
    };

    dom.seqUl.addEventListener('pointerdown', pointerSession.onPointerDown);
    const onMove = pointerSession.onPointerMove;
    if (rootWin) {
        rootWin.addEventListener('pointermove', onMove, { capture: true, passive: true });
        rootWin.addEventListener('pointerup', pointerSession.onPointerUp, { capture: true, passive: true });
        rootWin.addEventListener('pointercancel', pointerSession.onPointerCancel, { capture: true, passive: true });
    } else {
        rootDoc.addEventListener('pointermove', onMove, true);
        rootDoc.addEventListener('pointerup', pointerSession.onPointerUp, true);
        rootDoc.addEventListener('pointercancel', pointerSession.onPointerCancel, true);
    }
    dom.seqUl.addEventListener('click', onClickCapture, true);
    rootDoc.addEventListener('keydown', onKeyDown, true);

    disposeSession = (): void => {
        disposeSession = null;
        dom.seqUl.removeEventListener('pointerdown', pointerSession.onPointerDown);
        if (rootWin) {
            rootWin.removeEventListener('pointermove', onMove, { capture: true } as AddEventListenerOptions);
            rootWin.removeEventListener('pointerup', pointerSession.onPointerUp, { capture: true } as AddEventListenerOptions);
            rootWin.removeEventListener('pointercancel', pointerSession.onPointerCancel, { capture: true } as AddEventListenerOptions);
        } else {
            rootDoc.removeEventListener('pointermove', onMove, true);
            rootDoc.removeEventListener('pointerup', pointerSession.onPointerUp, true);
            rootDoc.removeEventListener('pointercancel', pointerSession.onPointerCancel, true);
        }
        dom.seqUl.removeEventListener('click', onClickCapture, true);
        rootDoc.removeEventListener('keydown', onKeyDown, true);

        selection.clear();
        dom.wrap.classList.remove(EDIT_WRAP_ACTIVE_CLASS);
        selection.clearSelectionClasses();
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
