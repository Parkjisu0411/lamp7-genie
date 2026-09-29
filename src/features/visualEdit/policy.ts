import type { VisualComponentRecord } from '../visualSearch/types';

export interface SelectionUnit {
    id: string;
    kind: 'component' | 'grid';
    /** Physical roots of the complete editing unit. */
    members: string[];
}

/** Lamp7 operation units, not GrapesJS's selectable/copyable defaults. No model writes. */
export function buildSelectionPolicy(records: VisualComponentRecord[]) {
    const byId = new Map(records.map((record) => [record.location.modelId, record]));
    const has = (record: VisualComponentRecord, name: string) =>
        record.structure?.classes.includes(name);
    const isGrid = (record: VisualComponentRecord) =>
        ['grid', 'grid-compo'].includes(record.type) || has(record, 'grid-compo');
    const isWholeComponent = (record: VisualComponentRecord) =>
        isGrid(record) ||
        ['tree-container', 'manual-tree-container'].includes(record.type) ||
        [
            'tree-container',
            'manual-tree-container',
            'duration-date-compo',
            'dataselect-compo',
            'inputgroup-compo',
            'radio-compo',
            'repeat-radio-compo',
            'checkbox-compo',
            'repeat-checkbox-compo',
            'dropdown-compo',
        ].some((name) => has(record, name));
    const isExcludedTool = (record: VisualComponentRecord) =>
        ['table-page', 'pagination', 'page-option', 'node-level-input'].includes(record.type) ||
        [
            'page-info',
            'pagination',
            'page-option',
            'repeat-container-page',
            'node-level-input',
            'grid-btn-compo',
            'grid-up-btn',
            'grid-down-btn',
            'grid-expand-btn',
            'grid-expand-toggle-btn',
            'frozen-left-btn',
            'frozen-right-btn',
        ].some((name) => has(record, name)) ||
        (record.structure?.buttonTypes?.some((type) => /^(grid-|frozen-)/.test(type)) &&
            (record.structure.tag === 'BUTTON' ||
                ['btn', 'button'].includes(record.componentType) ||
                has(record, 'btn-compo') ||
                has(record, 'dropdown-btn-compo')));
    // These parts cannot become standalone units even if a malformed tree loses its owner.
    // Dropdown's native type is shared by the root, menu, group and button: only its root class identifies ownership.
    const isInternalPart = (record: VisualComponentRecord) =>
        ['tree-node', 'manual-tree-node'].includes(record.type) ||
        (record.type === 'dropdown' && !has(record, 'dropdown-compo')) ||
        [
            'tree-node',
            'manual-tree-node',
            'duration-date-value-compo',
            'dataselect-btn-compo',
            'inputgroup-btn-compo',
            'form-check-label',
            'dropdown-btn-compo',
            'dropdown-list',
            'dropdown-group',
            'dropdown-group-content',
            'dropdown-group-name',
        ].some((name) => has(record, name));
    const ancestors = (id: string) => {
        const result: string[] = [],
            seen = new Set([id]);
        let parent = byId.get(id)?.parentModelId;
        while (parent && !seen.has(parent)) {
            seen.add(parent);
            result.push(parent);
            parent = byId.get(parent)?.parentModelId;
        }
        return result;
    };
    const ancestorMap = new Map(
        records.map((record) => [record.location.modelId, ancestors(record.location.modelId)]),
    );
    // Outermost complete components own all physical descendants, including hidden nodes.
    const wholeById = new Map(
        records.map((record) => [
            record.location.modelId,
            [...ancestorMap.get(record.location.modelId)!]
                .reverse()
                .concat(record.location.modelId)
                .find((id) => byId.has(id) && isWholeComponent(byId.get(id)!)),
        ]),
    );
    const inBranch = (
        record: VisualComponentRecord,
        predicate: (record: VisualComponentRecord) => unknown,
    ) =>
        [record.location.modelId, ...ancestorMap.get(record.location.modelId)!].some(
            (id) => byId.has(id) && predicate(byId.get(id)!),
        );
    const excluded = new Set(
        records
            .filter((record) => inBranch(record, isExcludedTool))
            .map((record) => record.location.modelId),
    );
    const orphaned = new Set(
        records
            .filter(
                (record) =>
                    !wholeById.get(record.location.modelId) && inBranch(record, isInternalPart),
            )
            .map((record) => record.location.modelId),
    );
    const units = new Map<string, SelectionUnit>();
    const aliases = new Map<string, string>();
    const blocked = new Map<string, string>();
    const descendantMap = new Map<string, VisualComponentRecord[]>();
    for (const record of records)
        for (const parent of [
            record.location.modelId,
            ...ancestorMap.get(record.location.modelId)!,
        ]) {
            const list = descendantMap.get(parent) ?? [];
            list.push(record);
            descendantMap.set(parent, list);
        }
    const descendants = (id: string) => descendantMap.get(id) ?? [];
    const eligible = (record: VisualComponentRecord) =>
        record.selectable &&
        record.structure?.removable !== false &&
        ![
            'wrapper',
            'none',
            'container-content',
            'tab-name-wrapper',
            'tab-name',
            'btn-inner',
            'table',
            'thead',
            'tbody',
            'grid-col-tr',
            'grid-header-tr',
            'table-row',
            'cell',
            'colName',
        ].includes(record.type) &&
        !['TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD'].includes(record.structure?.tag ?? '') &&
        ![
            'container-fluid',
            'container-fluid-sub-screen',
            'layout-frame',
            'panel-frame',
            'layout-content',
            'repeat-check-row',
        ].some((name) => has(record, name));
    for (const record of records) {
        const id = record.location.modelId;
        if (excluded.has(id)) {
            blocked.set(id, '페이징·그리드 연결 도구는 개별 선택할 수 없습니다.');
        } else if (orphaned.has(id)) {
            blocked.set(id, '본체를 확인할 수 없는 내부 항목은 선택할 수 없습니다.');
        } else if (wholeById.get(id) && wholeById.get(id) !== id) {
            blocked.set(id, '이 항목의 본체 전체를 선택할 수 없는 상태입니다.');
        } else if (eligible(record)) {
            units.set(id, { id, kind: isGrid(record) ? 'grid' : 'component', members: [id] });
            aliases.set(id, id);
        } else blocked.set(id, '이 항목은 Lamp7의 내부 구조이므로 개별 선택할 수 없습니다.');
    }
    // Explicit ownership, not a generic climb through nonselectable structures.
    // Unknown/protected roots fail closed instead of exposing their children.
    for (const record of records) {
        const id = record.location.modelId;
        if (excluded.has(id) || orphaned.has(id)) continue;
        const wholeId = wholeById.get(id);
        if (wholeId) {
            if (units.has(wholeId)) {
                aliases.set(id, wholeId);
                blocked.delete(id);
            }
        } else if (record.ownerModelId) aliases.set(id, record.ownerModelId);
    }
    const canonical = (id: string): string | undefined => {
        const seen = new Set<string>();
        while (!seen.has(id)) {
            seen.add(id);
            const next = aliases.get(id);
            if (!next) return;
            if (next === id) return units.has(id) ? id : undefined;
            id = next;
        }
    };
    return { byId, units, ancestorMap, canonical, blocked, descendants };
}
