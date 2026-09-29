import type { Rect } from '../visualSearch/geometry';
import type { VisualPasteLocation, VisualPasteTarget } from './transferTypes';

export interface PasteGeometry extends VisualPasteTarget {
    /** Immediate DOM parent, as used by Sorter.closest('*'). */
    parentId?: string | null;
    depth: number;
    rect: Rect;
    visible: Rect;
    axis: 'horizontal' | 'vertical';
    borderX?: number;
    borderY?: number;
}
const contains = (r: Rect, x: number, y: number) =>
    x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;

/** GrapesJS 0.14.66 Sorter dimsFromTarget + findPosition. No nearest-distance heuristic. */
export function findPasteLocation(
    x: number,
    y: number,
    candidates: PasteGeometry[],
    hitIds?: ReadonlySet<string>,
): VisualPasteLocation | undefined {
    const byId = new Map(candidates.map((c) => [c.modelId, c]));
    let target = candidates
        .filter(
            (c) =>
                c.positions.includes('inside') &&
                (!hitIds || hitIds.has(c.modelId)) &&
                contains(c.visible, x, y),
        )
        .sort((a, b) => b.depth - a.depth)[0];
    if (!target) return;
    const r = target.rect,
        bx = target.borderX ?? 10,
        by = target.borderY ?? 10;
    if (
        y < r.top + by ||
        y > r.top + r.height - by ||
        x < r.left + bx ||
        x > r.left + r.width - bx
    ) {
        const parent = target.parentId ? byId.get(target.parentId) : undefined;
        if (parent?.positions.includes('inside')) target = parent;
    }
    const children = target.children
        ? target.children.flatMap((id) => {
              const c = byId.get(id);
              return c ? [c] : [];
          })
        : candidates.filter((c) => c.parentId === target.modelId);
    if (!children.length) return { modelId: target.modelId, position: 'inside' };
    let leftLimit = 0,
        xLimit = 0,
        yLimit = 0;
    let chosen = children[0];
    let position: 'before' | 'after' = 'before';
    for (const child of children) {
        const d = child.rect,
            right = d.left + d.width,
            bottom = d.top + d.height;
        const xc = d.left + d.width / 2,
            yc = d.top + d.height / 2;
        if (
            (xLimit && d.left > xLimit) ||
            (yLimit && yc >= yLimit) ||
            (leftLimit && right < leftLimit)
        )
            continue;
        chosen = child;
        if (child.axis === 'horizontal') {
            if (y < bottom) yLimit = bottom;
            if (x < xc) {
                xLimit = xc;
                position = 'before';
            } else {
                leftLimit = xc;
                position = 'after';
            }
        } else if (y < yc) {
            position = 'before';
            break;
        } else position = 'after';
    }
    if (!chosen.positions.includes(position)) return;
    // Do not advertise a line behind clipped/scrolling content.
    const edge =
        chosen.axis === 'horizontal'
            ? chosen.rect.left + (position === 'after' ? chosen.rect.width : 0)
            : chosen.rect.top + (position === 'after' ? chosen.rect.height : 0);
    const start = chosen.axis === 'horizontal' ? chosen.visible.left : chosen.visible.top;
    const end =
        start + (chosen.axis === 'horizontal' ? chosen.visible.width : chosen.visible.height);
    if (edge < start - 1 || edge > end + 1) return;
    return { modelId: chosen.modelId, position };
}

export function pasteIndicator(location: VisualPasteLocation, target: PasteGeometry): Rect {
    if (location.position === 'inside')
        return {
            left: target.rect.left + 5,
            top: target.rect.top + 5,
            width: Math.max(0, target.rect.width - 10),
            height: 4,
        };
    const start = location.position === 'before';
    return target.axis === 'horizontal'
        ? {
              left: target.rect.left + (start ? 0 : target.rect.width) - 2,
              top: target.visible.top,
              width: 4,
              height: target.visible.height,
          }
        : {
              left: target.visible.left,
              top: target.rect.top + (start ? 0 : target.rect.height) - 2,
              width: target.visible.width,
              height: 4,
          };
}
export function pastePositionText(position: VisualPasteLocation['position']): string {
    return position === 'inside' ? '안에' : position === 'before' ? '앞에' : '뒤에';
}
