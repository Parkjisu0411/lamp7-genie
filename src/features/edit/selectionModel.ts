import { EDIT_SELECTED_CLASS } from '../../shared/constants';
import type { EditDomBundle } from './dom';
import { seqItemKey } from './dom';

export interface EditSelectionModel {
    selectedKeys: Set<string>;
    lastAnchorIndex: number | null;
    applySelectionClass(): void;
    clearSelectionClasses(): void;
    addRangeInclusive(from: number, to: number): void;
    applyDragPaint(
        from: number,
        to: number,
        paintSelect: boolean,
        snapshot: Set<string>,
    ): void;
    toggleIndex(index: number): void;
    restore(snapshot: Set<string>): void;
    clear(): void;
}

export function createEditSelectionModel(dom: EditDomBundle): EditSelectionModel {
    const selectedKeys = new Set<string>();

    return {
        selectedKeys,
        lastAnchorIndex: null,

        applySelectionClass(): void {
            dom.seqItems.forEach((li, i) => {
                const key = seqItemKey(li, i);
                li.classList.toggle(EDIT_SELECTED_CLASS, selectedKeys.has(key));
            });
        },

        clearSelectionClasses(): void {
            for (const li of dom.seqItems) {
                li.classList.remove(EDIT_SELECTED_CLASS);
            }
        },

        addRangeInclusive(from: number, to: number): void {
            const a = Math.min(from, to);
            const b = Math.max(from, to);
            for (let i = a; i <= b; i++) {
                const li = dom.seqItems[i];
                if (li) selectedKeys.add(seqItemKey(li, i));
            }
        },

        applyDragPaint(
            from: number,
            to: number,
            paintSelect: boolean,
            snapshot: Set<string>,
        ): void {
            selectedKeys.clear();
            for (const key of snapshot) selectedKeys.add(key);
            const a = Math.min(from, to);
            const b = Math.max(from, to);
            for (let i = a; i <= b; i++) {
                const li = dom.seqItems[i];
                if (!li) continue;
                const key = seqItemKey(li, i);
                if (paintSelect) selectedKeys.add(key);
                else selectedKeys.delete(key);
            }
        },

        toggleIndex(index: number): void {
            const li = dom.seqItems[index];
            if (!li) return;
            const key = seqItemKey(li, index);
            if (selectedKeys.has(key)) selectedKeys.delete(key);
            else selectedKeys.add(key);
        },

        restore(snapshot: Set<string>): void {
            selectedKeys.clear();
            for (const key of snapshot) selectedKeys.add(key);
        },

        clear(): void {
            selectedKeys.clear();
            this.lastAnchorIndex = null;
        },
    };
}
