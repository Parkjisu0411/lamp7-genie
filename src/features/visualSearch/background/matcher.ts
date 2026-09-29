import type {
    VisualComponentRecord,
    VisualSearchField,
    VisualSearchFilters,
    VisualSearchMatch,
} from '../types';

export function matchVisualComponents(
    records: VisualComponentRecord[],
    query: string,
    filters: VisualSearchFilters,
): VisualSearchMatch[] {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    const byModel = new Map(records.map((record) => [record.location.modelId, record]));
    const ownerOf = (record: VisualComponentRecord) => {
        const visited = new Set<string>();
        let owner = record;
        while (owner.ownerModelId) {
            if (visited.has(owner.location.modelId)) return record;
            visited.add(owner.location.modelId);
            const parent = byModel.get(owner.ownerModelId);
            if (!parent) return record;
            owner = parent;
        }
        return owner;
    };
    const groups = new Map<
        string,
        { records: VisualComponentRecord[]; owners: Set<VisualComponentRecord> }
    >();
    for (const record of records) {
        const owner = ownerOf(record);
        const { eid, vid, modelId } = owner.location;
        const key =
            owner.gridId && owner.gridColumn?.role === 'cell'
                ? JSON.stringify(['grid-cell', owner.gridId, owner.gridColumn.id])
                : owner.gridId && eid && vid
                  ? JSON.stringify(['grid', owner.gridId, eid, vid, owner.type])
                  : JSON.stringify(['model', modelId]);
        const group = groups.get(key) ?? { records: [], owners: new Set<VisualComponentRecord>() };
        group.records.push(record);
        group.owners.add(owner);
        groups.set(key, group);
    }
    type RankedMatch = {
        match: VisualSearchMatch;
        rank: number;
        order: number;
        columnKey?: string;
        isColumn: boolean;
    };
    const ranked: RankedMatch[] = [];
    for (const [id, group] of groups) {
        let best:
            | { field: VisualSearchField; value: string; start: number; rank: number }
            | undefined;
        for (const record of group.records) {
            const fields: Array<[VisualSearchField, string]> = [];
            if (filters.ids)
                fields.push(
                    ['eid', record.location.eid],
                    ['vid', record.location.vid],
                    ['domId', record.location.domId],
                );
            if (filters.text) fields.push(['name', record.name], ['text', record.text]);
            for (const [field, value] of fields) {
                const normalized = value.toLocaleLowerCase();
                const start = normalized.indexOf(needle);
                if (start < 0) continue;
                const rank =
                    ['eid', 'vid', 'domId'].includes(field) && normalized === needle ? 0 : 1;
                if (!best || rank < best.rank) best = { field, value, start, rank };
            }
        }
        if (!best) continue;
        const owners = [...group.owners].sort((a, b) => a.order - b.order);
        const representative = owners.find((record) => !record.hidden) ?? owners[0];
        const label =
            representative.label ||
            group.records.find((record) => !group.owners.has(record) && record.label)?.label ||
            '';
        const columnKey = (record: VisualComponentRecord) =>
            record.gridId && record.gridColumn
                ? JSON.stringify([record.gridId, record.gridColumn.id])
                : undefined;
        const column = columnKey(representative);
        ranked.push({
            rank: best.rank,
            order: owners[0].order,
            columnKey:
                column && owners.every((record) => columnKey(record) === column)
                    ? column
                    : undefined,
            isColumn: representative.gridColumn?.role === 'column',
            match: {
                id,
                name: representative.name,
                label,
                description: representative.description,
                type: representative.componentType || representative.type,
                eid: representative.location.eid,
                hidden: owners.every((record) => record.hidden),
                rendered: owners.some((record) => record.rendered),
                locations: owners.map((record) => record.location),
                field: best.field,
                value: best.value,
                matchStart: best.start,
                matchEnd: best.start + needle.length,
            },
        });
    }
    // Only promote matching cells/contents when their own column also matched.
    // Cell-only queries retain the cell's metadata and all repeated DOM locations.
    const columns = new Map(
        ranked
            .filter((item) => item.isColumn && item.columnKey)
            .map((item) => [item.columnKey!, item]),
    );
    const results = ranked.filter((item) => {
        const column = item.columnKey && columns.get(item.columnKey);
        if (!column || column === item || item.isColumn) return true;
        if (item.rank < column.rank) {
            column.rank = item.rank;
            const { field, value, matchStart, matchEnd } = item.match;
            Object.assign(column.match, { field, value, matchStart, matchEnd });
        }
        const locations = new Map(
            column.match.locations.map((location) => [location.modelId, location]),
        );
        for (const location of item.match.locations) locations.set(location.modelId, location);
        column.match.locations = [...locations.values()];
        column.match.hidden &&= item.match.hidden;
        column.match.rendered ||= item.match.rendered;
        return false;
    });
    return results.sort((a, b) => a.rank - b.rank || a.order - b.order).map((item) => item.match);
}
