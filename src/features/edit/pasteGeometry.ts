import type { Rect } from '../visualSearch/geometry';
import type { LogicPasteLocation } from './pasteTypes';

export interface LogicPasteRow {
    id: string;
    canNest: boolean;
    head: Rect;
    body: Rect;
}
export interface LogicPastePreview {
    location: LogicPasteLocation;
    rect: Rect;
    label: string;
}

export function pickLogicPasteLocation(
    rows: LogicPasteRow[],
    clip: Rect,
    x: number,
    y: number,
): LogicPastePreview | null {
    const contains = (r: Rect) =>
        x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;
    if (!contains(clip)) return null;
    const line = (r: Rect, bottom: number): Rect => ({
        left: Math.max(clip.left, r.left),
        top: Math.max(clip.top, Math.min(bottom - 2, clip.top + clip.height - 3)),
        width: Math.max(
            0,
            Math.min(clip.left + clip.width, r.left + r.width) - Math.max(clip.left, r.left),
        ),
        height: 3,
    });
    if (!rows.length || y > Math.max(...rows.map((row) => row.body.top + row.body.height)))
        return {
            location: { anchorId: '', position: 'root-end' },
            rect: line(
                clip,
                rows.length
                    ? Math.max(...rows.map((row) => row.body.top + row.body.height))
                    : clip.top + 30,
            ),
            label: '맨 아래에 붙여넣기',
        };
    if (y <= rows[0].head.top + 6)
        return {
            location: { anchorId: '', position: 'root-start' },
            rect: line(clip, rows[0].head.top),
            label: '맨 위에 붙여넣기',
        };
    const head = rows.find((row) => contains(row.head));
    const row = head || [...rows].reverse().find((row) => row.canNest && contains(row.body));
    if (!row) return null;
    const inside =
        row.canNest &&
        (!head || y < row.head.top + row.head.height - Math.min(12, row.head.height * 0.3));
    return {
        location: { anchorId: row.id, position: inside ? 'inside' : 'after' },
        rect: inside
            ? {
                  left: row.head.left + 18,
                  top: row.head.top,
                  height: row.head.height,
                  width: Math.max(0, row.head.width - 18),
              }
            : line(row.body, row.body.top + row.body.height),
        label: inside ? '하위 끝에 붙여넣기' : '아래에 붙여넣기',
    };
}
