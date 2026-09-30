import type { Rect } from '../visualSearch/geometry';
import type { VisualComponentRecord } from '../visualSearch/types';
import { buildSelectionPolicy } from './policy';
import type { VisualSelectionItem } from './types';

/** A set of model roots, never both a parent and its descendant. No editor writes. */
export function createVisualSelection(records: VisualComponentRecord[]) {
    const { byId, units, ancestorMap, canonical, blocked, descendants } =
        buildSelectionPolicy(records);
    const roots = (candidates: Set<string>) =>
        new Set(
            [...candidates].filter(
                (id) => !ancestorMap.get(id)?.some((parent) => candidates.has(parent)),
            ),
        );
    const combine = (ids: Iterable<string>) => {
        const candidates = new Set(
            Array.from(ids)
                .map(canonical)
                .filter((id): id is string => !!id),
        );
        return { selected: roots(candidates), notice: undefined as string | undefined };
    };
    const normalize = (ids: Iterable<string>) => combine(ids).selected;
    const toggleResult = (selected: Set<string>, clicked: string) => {
        const id = canonical(clicked);
        if (!id) return { selected: new Set(selected), notice: blocked.get(clicked) };
        const next = new Set(selected);
        const includedBy = [id, ...(ancestorMap.get(id) ?? [])].find((parent) => next.has(parent));
        // An included child belongs to the selected parent; a click toggles that unit.
        if (includedBy) next.delete(includedBy);
        else next.add(id);
        return combine(next);
    };
    const toggle = (selected: Set<string>, clicked: string) =>
        toggleResult(selected, clicked).selected;
    const itemMap = new Map<string, VisualSelectionItem>(
        records.map((record) => [
            record.location.modelId,
            {
                id: record.location.modelId,
                type: record.componentType || record.type,
                eid: record.location.eid || record.location.domId,
                label: record.label,
                includesChildren: false,
                includesHidden: record.hidden,
                kind: units.get(record.location.modelId)?.kind,
            },
        ]),
    );
    for (const unit of units.values()) {
        const item = itemMap.get(unit.id)!;
        for (const member of unit.members)
            for (const record of descendants(member)) {
                item.includesChildren ||= record.location.modelId !== unit.id;
                item.includesHidden ||= record.hidden;
            }
    }
    const items = (selected: Set<string>): VisualSelectionItem[] =>
        records
            .filter((record) => selected.has(record.location.modelId))
            .map((record) => ({ ...itemMap.get(record.location.modelId)! }));
    // List removal is exact and idempotent: an old child item cannot remove a new parent selection.
    const remove = (selected: Set<string>, id: string): Set<string> => {
        const next = new Set(selected);
        next.delete(id);
        return next;
    };
    const members = (id: string) =>
        (units.get(id)?.members ?? []).map((member) => byId.get(member)!);
    return {
        byId,
        units,
        members,
        canonical,
        normalize,
        combine,
        toggle,
        toggleResult,
        remove,
        items,
    };
}

export function selectionRect(x1: number, y1: number, x2: number, y2: number): Rect {
    return {
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
    };
}
export function fullyContains(outer: Rect, inner: Rect): boolean {
    return (
        inner.width > 0 &&
        inner.height > 0 &&
        inner.left >= outer.left &&
        inner.top >= outer.top &&
        inner.left + inner.width <= outer.left + outer.width &&
        inner.top + inner.height <= outer.top + outer.height
    );
}

/** Horizontal overflow may be offscreen; the full height must still be visible and enclosed. */
export function marqueeContainsComponent(range: Rect, full: Rect, visible: Rect): boolean {
    const required = {
        left: visible.left,
        width: visible.width,
        top: full.top,
        height: full.height,
    };
    return full.width > 0 && fullyContains(visible, required) && fullyContains(range, required);
}
