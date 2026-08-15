import type { EditDomBundle } from './dom';
import { resyncEditSeqItems, seqItemKey } from './dom';
import type { EditSelectionModel } from './selectionModel';

interface PointerSelectionSessionOptions {
    dom: EditDomBundle;
    selection: EditSelectionModel;
    dragThresholdPx: number;
    onPaint: () => void;
    onCommit: () => void;
    onSuppressClick: () => void;
}

type PointerDownState = {
    pointerId: number;
    startX: number;
    startY: number;
    startIndex: number;
    snapshot: Set<string>;
    paintSelect: boolean;
    dragActivated: boolean;
    lastDragIndex: number;
    lastClientY: number;
    lastClientX: number;
};

export interface PointerSelectionSession {
    onPointerDown(e: PointerEvent): void;
    onPointerMove(e: PointerEvent): void;
    onPointerUp(e: PointerEvent): void;
    onPointerCancel(e: PointerEvent): void;
}

function clipIndex(index: number, length: number): number {
    return Math.max(0, Math.min(length - 1, index));
}

function seqIndexFromClientY(dom: EditDomBundle, clientY: number): number {
    const n = dom.seqItems.length;
    if (n <= 1) return 0;

    for (let i = 0; i < n; i++) {
        const rect = dom.seqItems[i].getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) return i;
    }

    const firstRect = dom.seqItems[0].getBoundingClientRect();
    if (clientY < firstRect.top) return 0;
    const lastRect = dom.seqItems[n - 1].getBoundingClientRect();
    if (clientY > lastRect.bottom) return n - 1;

    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
        const rect = dom.seqItems[i].getBoundingClientRect();
        if (rect.height <= 0) continue;
        const dist =
            clientY >= rect.top && clientY <= rect.bottom
                ? 0
                : clientY < rect.top
                  ? rect.top - clientY
                  : clientY - rect.bottom;
        if (dist < bestDist) {
            bestDist = dist;
            best = i;
        }
    }
    return bestDist === Infinity ? 0 : best;
}

export function createPointerSelectionSession({
    dom,
    selection,
    dragThresholdPx,
    onPaint,
    onCommit,
    onSuppressClick,
}: PointerSelectionSessionOptions): PointerSelectionSession {
    let pointerDown: PointerDownState | null = null;

    const applyDragPaint = (state: PointerDownState, endIndex: number): void => {
        selection.applyDragPaint(
            state.startIndex,
            endIndex,
            state.paintSelect,
            state.snapshot,
        );
    };

    return {
        onPointerDown(e: PointerEvent): void {
            if (e.button !== 0) return;
            resyncEditSeqItems(dom);
            const li = (e.target as HTMLElement | null)?.closest('li');
            if (!li) return;
            const startIndex = dom.seqItems.indexOf(li as HTMLLIElement);
            if (startIndex < 0) return;
            const startKey = seqItemKey(li as HTMLLIElement, startIndex);
            pointerDown = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                startIndex,
                snapshot: new Set(selection.selectedKeys),
                paintSelect: !selection.selectedKeys.has(startKey),
                dragActivated: false,
                lastDragIndex: startIndex,
                lastClientY: e.clientY,
                lastClientX: e.clientX,
            };
            try {
                dom.seqUl.setPointerCapture(e.pointerId);
            } catch {
                /* noop */
            }
        },

        onPointerMove(e: PointerEvent): void {
            if (!pointerDown || e.pointerId !== pointerDown.pointerId) return;
            const state = pointerDown;
            resyncEditSeqItems(dom);
            if (dom.seqItems.length === 0) return;

            state.lastClientX = e.clientX;
            state.lastClientY = e.clientY;

            const coalesced =
                typeof e.getCoalescedEvents === 'function'
                    ? e.getCoalescedEvents()
                    : [];
            const samples = coalesced.length > 0 ? coalesced : [e];
            const nItems = dom.seqItems.length;

            for (const ev of samples) {
                state.lastClientX = ev.clientX;
                state.lastClientY = ev.clientY;

                const dist = Math.hypot(
                    ev.clientX - state.startX,
                    ev.clientY - state.startY,
                );
                if (!state.dragActivated && dist <= dragThresholdPx) continue;

                if (!state.dragActivated) state.dragActivated = true;

                const currentIndex = clipIndex(
                    seqIndexFromClientY(dom, ev.clientY),
                    nItems,
                );
                state.lastDragIndex = currentIndex;
                applyDragPaint(state, currentIndex);
            }
            onPaint();
        },

        onPointerUp(e: PointerEvent): void {
            if (!pointerDown || e.pointerId !== pointerDown.pointerId) return;
            const state = pointerDown;
            pointerDown = null;
            try {
                dom.seqUl.releasePointerCapture(e.pointerId);
            } catch {
                /* noop */
            }

            resyncEditSeqItems(dom);

            const dragDist = Math.hypot(e.clientX - state.startX, e.clientY - state.startY);
            const isDrag = state.dragActivated || dragDist > dragThresholdPx;

            if (isDrag) {
                const nItems = dom.seqItems.length;
                if (nItems > 0) {
                    const y = state.dragActivated ? state.lastClientY : e.clientY;
                    const endIndex = clipIndex(seqIndexFromClientY(dom, y), nItems);
                    state.lastDragIndex = endIndex;
                    applyDragPaint(state, endIndex);
                    selection.lastAnchorIndex = endIndex;
                }
            } else if (e.shiftKey) {
                const anchor = selection.lastAnchorIndex ?? state.startIndex;
                selection.addRangeInclusive(anchor, state.startIndex);
                selection.lastAnchorIndex = state.startIndex;
            } else {
                selection.toggleIndex(state.startIndex);
                selection.lastAnchorIndex = state.startIndex;
            }

            onPaint();
            onSuppressClick();
            onCommit();
        },

        onPointerCancel(e: PointerEvent): void {
            if (!pointerDown || e.pointerId !== pointerDown.pointerId) return;
            const state = pointerDown;
            pointerDown = null;
            try {
                dom.seqUl.releasePointerCapture(e.pointerId);
            } catch {
                /* noop */
            }
            selection.restore(state.snapshot);
            onPaint();
            onCommit();
        },
    };
}
