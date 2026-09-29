import type { VisualClipboard, VisualCopyNode, VisualJson, VisualObject } from './transferTypes';

/** Pure, serializable helper. Only changes a deep copy, never source/target models. */
export function transformVisualClipboard(
    clipboard: VisualClipboard,
    allocate: (id: string, attribute: 'id' | 'eid' | 'vid' | 'name', suffixes?: string[]) => string,
) {
    const copy = JSON.parse(JSON.stringify(clipboard)) as VisualClipboard;
    const all: VisualCopyNode[] = [];
    const parents = new Map<string, VisualCopyNode>();
    const visit = (node: VisualCopyNode) => {
        all.push(node);
        node.children.forEach((child) => {
            parents.set(child.key, node);
            visit(child);
        });
    };
    copy.roots.forEach((root) => visit(root.node));
    const text = (v: VisualJson | undefined): string => (typeof v === 'string' ? v : '');
    const own = (obj: VisualObject, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
    const original = new Map(all.map((n) => [n.key, { ...n.attributes }]));
    const groups = new Map<string, string>();
    const ids = new Map<string, VisualCopyNode[]>();
    let removedConnections = 0;
    const derived = new Map<string, { owner: VisualCopyNode; suffix: string }>();
    const suffixes = new Map<string, string[]>();
    for (const node of all) {
        const owner = parents.get(node.key);
        if (!owner) continue;
        const eid = text(node.attributes.eid),
            base = text(owner.attributes.eid);
        const suffix = base && eid.startsWith(base) ? eid.slice(base.length) : '';
        const matches =
            (owner.classes.includes('duration-date-compo') && ['│from', '│to'].includes(suffix)) ||
            (owner.classes.includes('dataselect-compo') &&
                ['_addBtn', '_selectBtn', '_deleteBtn'].includes(suffix)) ||
            (owner.classes.includes('inputgroup-compo') && suffix === '_inputGroupBtn');
        if (matches) {
            derived.set(node.key, { owner, suffix });
            suffixes.set(owner.key, [...(suffixes.get(owner.key) ?? []), suffix]);
        }
    }
    for (const node of all) {
        for (const attr of ['id', 'eid', 'vid'] as const) {
            const old = text(node.attributes[attr]);
            if (!old) continue;
            const group =
                attr === 'id'
                    ? `${node.key}:id`
                    : JSON.stringify([node.scope || node.key, attr, old]);
            let next = groups.get(group);
            const dependency = attr === 'eid' ? derived.get(node.key) : undefined;
            if (!next) {
                next = dependency
                    ? text(dependency.owner.attributes.eid) + dependency.suffix
                    : allocate(old, attr, attr === 'eid' ? suffixes.get(node.key) : undefined);
                groups.set(group, next);
            }
            node.attributes[attr] = next;
            const index = `${attr}:${old}`;
            ids.set(index, [...(ids.get(index) ?? []), node]);
        }
        if (
            ['radio', 'checkbox'].includes(text(node.attributes.type)) &&
            text(node.attributes.name)
        ) {
            let owner = parents.get(node.key);
            while (
                owner &&
                !owner.classes.some((c) =>
                    [
                        'radio-compo',
                        'checkbox-compo',
                        'repeat-radio-compo',
                        'repeat-checkbox-compo',
                    ].includes(c),
                )
            )
                owner = parents.get(owner.key);
            const group = JSON.stringify([
                owner?.key || node.scope || node.key,
                'name',
                node.attributes.name,
            ]);
            const oldName = text(node.attributes.name),
                oldEid = owner && text(original.get(owner.key)?.eid);
            const desired =
                oldEid && oldName === `_${oldEid}_repeat_check`
                    ? `_${text(owner!.attributes.eid)}_repeat_check`
                    : oldName;
            if (!groups.has(group)) groups.set(group, allocate(desired, 'name'));
            node.attributes.name = groups.get(group)!;
        }
        if (node.setting && node.attributes.eid) node.setting.id = node.attributes.eid;
    }
    const resolve = (value: string, node: VisualCopyNode, attr = 'eid'): string => {
        const candidates = ids.get(`${attr}:${value}`) ?? [];
        const scoped = candidates.filter((n) => n.scope === node.scope);
        const values = new Set(
            (scoped.length ? scoped : candidates).map((n) => text(n.attributes[attr])),
        );
        if (values.size === 1) return [...values][0];
        // Search-range endpoints can be virtual fields without separate canvas models.
        if (!candidates.length && attr === 'eid' && /│(from|to)$/.test(value)) {
            const index = value.lastIndexOf('│');
            const base = resolve(value.slice(0, index), node);
            return base ? base + value.slice(index) : '';
        }
        return '';
    };
    const scalar = (v: VisualJson, node: VisualCopyNode, attr = 'eid'): VisualJson => {
        if (Array.isArray(v)) return v.map((x) => scalar(x, node, attr)).filter((x) => x !== '');
        if (typeof v !== 'string' || !v) return v;
        const next = resolve(v, node, attr);
        if (!next) removedConnections++;
        return next;
    };
    const refs = new Set([
        'labelId',
        'valueId',
        'elList',
        'elContainer',
        'elEqualCompo',
        'elSearchContainer',
        'elTree',
        'elTarget',
        'elRepeatContainer',
        'elNode',
        'parentNodeId',
        'elMenu',
        'elModal',
        'elModalTarget',
        'gridId',
        'listId',
        'gridColId',
        'parentHeader',
        'childHeader',
        'valueIds',
        'elColumn',
    ]);
    const complex = new Set([
        'showOn',
        'editableOn',
        'autocompleteDataMapping',
        'selectDataMapping',
        'addDataMapping',
        'calcurationSetting',
        'summarySetting',
        'searchHelpDataMapping',
        'autocompleteCondition',
        'searchHelpCondition',
        'domainValueTableCondition',
        'transactionParams',
        'recursiveTransactionParams',
        'pivotSetting',
        'chartSetting',
        'gridHeaders',
        'treeGridNodes',
        'treeGridNodeImage',
        'tab-inner-compos',
    ]);
    const eventKeys = new Set([
        'event',
        'events',
        'eventId',
        'eventIds',
        'eventInfos',
        'selectEvent',
        'addEvent',
        'inputGroupBtnEvent',
        'transaction',
        'transactions',
        'transactionId',
        'transactionIds',
        'logics',
        'customLogic',
        'script',
        'script-export',
    ]);
    const empty = (v: VisualJson): VisualJson =>
        Array.isArray(v) ? [] : typeof v === 'object' && v ? {} : '';
    // Structured field adapters, not a replace-all of strings resembling IDs.
    const structured = (value: VisualJson, node: VisualCopyNode, key: string): VisualJson => {
        let missing = false;
        const walk = (v: VisualJson): VisualJson => {
            if (Array.isArray(v)) return v.map(walk);
            if (!v || typeof v !== 'object') return v;
            const out: VisualObject = {};
            for (const [k, item] of Object.entries(v)) {
                // Newer conditional-calculation data stores executable Blockly logic.
                if (k === 'logic' || k === 'condCalcJson') {
                    missing = true;
                    continue;
                }
                if (eventKeys.has(k)) {
                    out[k] = empty(item);
                    continue;
                }
                const typed =
                    (k === 'eid' && v.eType === 'E') || (k === 'valueId' && v.valueType === 'E');
                const calculated =
                    [
                        'calcurationSetting',
                        'summarySetting',
                        'pivotSetting',
                        'gridHeaders',
                    ].includes(key) &&
                    [
                        'eid',
                        'gridId',
                        'gridColId',
                        'valueIds',
                        'childHeader',
                        'parentHeader',
                    ].includes(k);
                const mapping = /DataMapping$/.test(key) && ['sourceId', '_ID_'].includes(k);
                const pivot =
                    key === 'pivotSetting' &&
                    (['id', 'fromGridId', 'fromGridColId', 'toGridId', 'toGridColId'].includes(k) ||
                        (k === 'fromId' && v.fromType === 'E') ||
                        (k === 'toId' && v.toType === 'E'));
                const chart =
                    key === 'chartSetting' &&
                    [
                        'labelEid',
                        'valueEid',
                        'labelGridColId',
                        'valueGridColId',
                        'labelEidList',
                    ].includes(k);
                const nested =
                    ['gridHeaders', 'treeGridNodes', 'tab-inner-compos'].includes(key) &&
                    (k === 'id' || refs.has(k));
                if (typed || calculated || mapping || pivot || chart || nested) {
                    const before = removedConnections;
                    out[k] = scalar(item, node);
                    if (nested && k === 'id' && item && !out[k])
                        throw Error(
                            `${text(node.attributes.eid) || node.key}: ${key} 내부 항목 ${String(item)}을 복사 구조에서 찾을 수 없습니다.`,
                        );
                    missing ||= removedConnections > before;
                } else out[k] = walk(item);
            }
            return out;
        };
        if (typeof value === 'string' && value) {
            let parsed: VisualJson;
            try {
                parsed = JSON.parse(value) as VisualJson;
            } catch {
                removedConnections++;
                return '';
            }
            const result = walk(parsed);
            return missing ? '' : JSON.stringify(result);
        }
        const result = walk(value);
        // Removing a term can change boolean/arithmetic meaning: clear the affected setting.
        return missing ? empty(value) : result;
    };
    const lowerRefs = new Map([...refs].map((k) => [k.toLowerCase(), k]));
    const lowerComplex = new Map([...complex].map((k) => [k.toLowerCase(), k]));
    const lowerEvents = new Set([...eventKeys].map((k) => k.toLowerCase()));
    for (const node of all) {
        if (node.setting) {
            for (const [key, value] of Object.entries(node.setting)) {
                if (eventKeys.has(key)) node.setting[key] = empty(value);
                else if (refs.has(key)) node.setting[key] = scalar(value, node);
                else if (complex.has(key)) node.setting[key] = structured(value, node, key);
                else if (key === 'defaultValueInfo' || key === 'listViewSettingDetail') {
                    try {
                        const parsed =
                            typeof value === 'string' ? (JSON.parse(value) as VisualJson) : value;
                        const remapKeys = (v: VisualJson): VisualJson => {
                            if (Array.isArray(v)) return v.map(remapKeys);
                            if (!v || typeof v !== 'object') return v;
                            const out: VisualObject = {};
                            for (const [id, item] of Object.entries(v)) {
                                const next = resolve(id, node);
                                if (!next) {
                                    removedConnections++;
                                    continue;
                                }
                                if (item && typeof item === 'object' && !Array.isArray(item)) {
                                    const entry = { ...item };
                                    let valid = true;
                                    for (const ref of ['elementId', 'nodeId'])
                                        if (text(entry[ref])) {
                                            entry[ref] = scalar(entry[ref], node);
                                            valid &&= !!entry[ref];
                                        }
                                    if (valid) out[next] = entry;
                                } else out[next] = item;
                            }
                            return out;
                        };
                        const result = remapKeys(parsed);
                        node.setting[key] =
                            typeof value === 'string' ? JSON.stringify(result) : result;
                    } catch {
                        node.setting[key] = empty(value);
                        removedConnections++;
                    }
                }
            }
        }
        // Maintain Lamp7's HTML reference index even when an old version omitted it.
        for (const key of [
            'labelId',
            'valueId',
            'elList',
            'elContainer',
            'elEqualCompo',
            'elSearchContainer',
            'elTree',
            'elTarget',
            'elRepeatContainer',
            'elNode',
            'parentNodeId',
            'elMenu',
            'elModal',
            'elModalTarget',
            'showOn',
            'editableOn',
            'autocompleteDataMapping',
            'selectDataMapping',
            'addDataMapping',
            'calcurationSetting',
            'searchHelpDataMapping',
            'autocompleteCondition',
            'searchHelpCondition',
            'domainValueTableCondition',
            'transactionParams',
            'recursiveTransactionParams',
        ])
            if (
                node.setting &&
                own(node.setting, key) &&
                !Object.keys(node.attributes).some((k) => k.toLowerCase() === key.toLowerCase())
            )
                node.attributes[key.toLowerCase()] = '';
        for (const key of Object.keys(node.data))
            if (lowerEvents.has(key.toLowerCase()) || ['status', 'state'].includes(key))
                delete node.data[key];
        for (const [key, value] of Object.entries(node.attributes)) {
            const lower = key.toLowerCase();
            if (/^on[a-z]/.test(lower) || lowerEvents.has(lower)) {
                delete node.attributes[key];
                continue;
            }
            const ref = lowerRefs.get(lower),
                compound = lowerComplex.get(lower);
            if (ref) {
                const transformed =
                    node.setting && own(node.setting, ref)
                        ? node.setting[ref]
                        : scalar(value, node);
                if (transformed === '' || (Array.isArray(transformed) && !transformed.length))
                    delete node.attributes[key];
                else
                    node.attributes[key] = Array.isArray(transformed)
                        ? transformed.join(',')
                        : transformed;
            } else if (compound) {
                // Lamp7 stores a comma-delimited index of referenced EIDs on the HTML attribute.
                if (node.setting && own(node.setting, compound)) {
                    const values: string[] = [];
                    const collect = (v: VisualJson) => {
                        if (Array.isArray(v)) {
                            v.forEach(collect);
                            return;
                        }
                        if (!v || typeof v !== 'object') return;
                        for (const [k, x] of Object.entries(v)) {
                            if (
                                ((k === 'eid' && (v.eType === 'E' || /Setting$/.test(compound))) ||
                                    (k === 'valueId' && v.valueType === 'E') ||
                                    (/DataMapping$/.test(compound) && k === 'sourceId') ||
                                    k === 'gridId') &&
                                typeof x === 'string' &&
                                x
                            )
                                values.push(x);
                            else collect(x);
                        }
                    };
                    collect(node.setting[compound]);
                    if (values.length) node.attributes[key] = `,${[...new Set(values)].join(',')},`;
                    else delete node.attributes[key];
                } else {
                    const tokens = text(value).split(',').filter(Boolean);
                    const mapped = tokens.map((id) => resolve(id, node));
                    if (mapped.length && mapped.every(Boolean))
                        node.attributes[key] = `,${mapped.join(',')},`;
                    else {
                        delete node.attributes[key];
                        removedConnections += tokens.length;
                    }
                }
            } else if (
                [
                    'for',
                    'aria-labelledby',
                    'aria-describedby',
                    'aria-controls',
                    'data-target',
                    'href',
                ].includes(lower)
            ) {
                if (lower === 'href' && !text(value).startsWith('#')) {
                    if (/^javascript:/i.test(text(value))) delete node.attributes[key];
                    continue;
                }
                const hash = text(value).startsWith('#');
                const mapped = text(value)
                    .replace(/^#/, '')
                    .split(/\s+/)
                    .map((id) => resolve(id, node, 'id'))
                    .filter(Boolean);
                if (mapped.length) node.attributes[key] = (hash ? '#' : '') + mapped.join(' ');
                else {
                    delete node.attributes[key];
                    removedConnections++;
                }
            } else if (lower === 'data-header') node.attributes[key] = scalar(value, node);
        }
    }
    const images: VisualObject = {};
    for (const node of all) {
        const old = text(original.get(node.key)?.eid),
            next = text(node.attributes.eid);
        if (!old || !next) continue;
        for (const suffix of ['', '_pre', '_suf'])
            if (own(copy.images, old + suffix)) images[next + suffix] = copy.images[old + suffix];
    }
    copy.images = images;
    return { clipboard: copy, removedConnections };
}
