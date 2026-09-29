import { selectionRect } from '../visualEdit/selection';
import { intersectRect, type Rect } from '../visualSearch/geometry';

export interface LogicHit {
    key: string;
    rect: Rect;
}
/** Rectangular additive selection. Even a small visible overlap includes a logic. */
export function createPointerSelectionSession({
    getRows,
    getSelected,
    setSelected,
    onPaint,
    onCommit,
    dragThresholdPx = 6,
}: {
    getRows(): LogicHit[];
    getSelected(): Set<string>;
    setSelected(keys: Set<string>): void;
    onPaint(range: Rect | null): void;
    onCommit(): void;
    dragThresholdPx?: number;
}) {
    let gesture:
        | { id: number; x: number; y: number; before: Set<string>; hit?: string; dragged: boolean }
        | undefined;
    const hit = (x: number, y: number) =>
        getRows().find(
            ({ rect: r }) =>
                x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height,
        )?.key;
    const move = (e: PointerEvent) => {
        if (!gesture || gesture.id !== e.pointerId) return;
        if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > dragThresholdPx)
            gesture.dragged = true;
        if (!gesture.dragged) return;
        const rect = selectionRect(gesture.x, gesture.y, e.clientX, e.clientY);
        const next = new Set(gesture.before);
        for (const row of getRows()) if (intersectRect(rect, row.rect)) next.add(row.key);
        setSelected(next);
        onPaint(rect);
    };
    const cancel = () => {
        if (gesture) {
            setSelected(gesture.before);
            gesture = undefined;
            onPaint(null);
        }
    };
    return {
        onPointerDown(e: PointerEvent) {
            if (e.button !== 0 || gesture) return;
            gesture = {
                id: e.pointerId,
                x: e.clientX,
                y: e.clientY,
                before: new Set(getSelected()),
                hit: hit(e.clientX, e.clientY),
                dragged: false,
            };
        },
        onPointerMove: move,
        onPointerUp(e: PointerEvent) {
            if (!gesture || gesture.id !== e.pointerId) return;
            move(e);
            if (!gesture.dragged && gesture.hit && hit(e.clientX, e.clientY) === gesture.hit) {
                const next = new Set(gesture.before);
                if (next.has(gesture.hit)) next.delete(gesture.hit);
                else next.add(gesture.hit);
                setSelected(next);
            }
            gesture = undefined;
            onPaint(null);
            onCommit();
        },
        onPointerCancel(e: PointerEvent) {
            if (e.pointerId === gesture?.id) cancel();
        },
        cancel,
    };
}
