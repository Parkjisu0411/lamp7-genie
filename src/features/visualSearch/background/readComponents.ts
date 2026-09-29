import type { VisualComponentRecord } from '../types';

/** MAIN world: only read the local studio model/setting schema. Never call setters. */
export function readVisualComponents(): { records: VisualComponentRecord[]; error?: string } {
    type Model = {
        cid: string;
        get(key: string): unknown;
        getEl?(): HTMLElement | undefined;
    };
    type Editor = { getWrapper(): Model };
    const read = (name: string) =>
        Function(`return typeof ${name} === 'undefined' ? undefined : ${name}`)();
    const scalar = (value: unknown): string =>
        typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
    const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
    try {
        const editor = read('editor') as Editor | undefined;
        if (!editor || typeof editor.getWrapper !== 'function')
            return { records: [], error: 'Visual editor 모델에 접근할 수 없습니다.' };
        const settings = read('_settingInfo') as
            | Record<string, Record<string, unknown>>
            | undefined;
        if (!settings || typeof settings !== 'object')
            return { records: [], error: 'Lamp7 항목 설정(_settingInfo)을 읽을 수 없습니다.' };
        const wrapper = editor.getWrapper();
        if (!wrapper || typeof wrapper.get !== 'function')
            return { records: [], error: '컴포넌트 트리가 아직 준비되지 않았습니다.' };
        const entries: Array<{
            model: Model;
            el?: HTMLElement;
            attrs: Record<string, unknown>;
            type: string;
            name: string;
            gridId: string | null;
            setting: Record<string, unknown>;
            parentId: string | null;
        }> = [];
        const children = (model: Model): Model[] => {
            const collection = model.get('components') as { models?: Model[] } | undefined;
            return Array.isArray(collection?.models) ? collection.models : [];
        };
        const seen = new Set<Model>();
        const visit = (
            model: Model,
            gridId: string | null,
            parentId: string | null,
        ) => {
            if (seen.has(model)) return;
            seen.add(model);
            const attrs = (model.get('attributes') ?? {}) as Record<string, unknown>;
            const el = model.getEl?.();
            const type = scalar(model.get('type')) || scalar(model.get('tagName')) || 'component';
            const setting = settings[scalar(attrs.vid)] ?? {};
            const typeName = scalar(model.get('name')) || type;
            const name = clean(
                scalar(setting.name) ||
                    scalar(setting.elShowName) ||
                    scalar(model.get('custom-name')) ||
                    typeName,
            );
            const isWrapper = model === wrapper;
            const isTextNode = type === 'textnode' || (el && el.nodeType !== 1);
            // Grid copies share eid/vid. Scope grouping to this concrete grid model.
            const isGrid =
                /^(grid|grid-compo|table)$/.test(type) || !!el?.classList?.contains('grid-compo');
            const scopedGridId = isGrid ? scalar(model.cid) : gridId;
            if (!isWrapper && !isTextNode && model.cid)
                entries.push({
                    model,
                    el,
                    attrs,
                    type,
                    name,
                    setting,
                    parentId,
                    gridId: scopedGridId,
                });
            for (const child of children(model))
                visit(
                    child,
                    scopedGridId,
                    !isWrapper && !isTextNode && model.cid ? model.cid : parentId,
                );
        };
        visit(wrapper, null, null);
        type Entry = (typeof entries)[number];
        const byModel = new Map(entries.map((entry) => [entry.model.cid, entry]));
        const ownerIds = new Map<string, string>();
        const relationId = (entry: Entry, key: 'labelId' | 'valueId') =>
            scalar(entry.setting[key]) ||
            scalar(entry.attrs[key]) ||
            scalar(entry.attrs[key.toLowerCase()]);
        const isLabel = (entry: Entry) =>
            entry.type === 'label' ||
            entry.setting.type === 'label' ||
            entry.el?.tagName === 'LABEL';
        const isCaption = (entry: Entry) =>
            entry.type === 'btn-inner' || !!entry.el?.classList?.contains('btn-name');
        const isControl = (entry: Entry) =>
            entry.type === 'col-compo' ||
            entry.el?.tagName === 'BUTTON' ||
            [
                'btn',
                'button',
                'input',
                'textarea',
                'select',
                'radio',
                'checkbox',
                'date',
                'datetime',
                'time',
                'dataselect',
                'autocomplete',
                'value',
                'inputgroup',
            ].includes(scalar(entry.setting.type)) ||
            ['btn-compo', 'dropdown-btn-compo', 'inputgroup-btn-compo'].some((name) =>
                entry.el?.classList?.contains(name),
            );
        const ancestors = (entry: Entry) => {
            const result: Entry[] = [];
            for (
                let parent = byModel.get(entry.parentId ?? '');
                parent;
                parent = byModel.get(parent.parentId ?? '')
            )
                result.push(parent);
            return result;
        };
        const byEid = new Map<string, Entry[]>();
        const byLabelId = new Map<string, Entry[]>();
        const scopeKey = (entry: Entry, id: string) => JSON.stringify([entry.gridId, id]);
        for (const entry of entries) {
            if (isLabel(entry) || isCaption(entry)) continue;
            for (const [index, id] of [
                [byEid, scalar(entry.attrs.eid)],
                [byLabelId, relationId(entry, 'labelId')],
            ] as const) {
                if (!id) continue;
                const key = scopeKey(entry, id);
                const candidates = index.get(key) ?? [];
                candidates.push(entry);
                index.set(key, candidates);
            }
        }
        // labelId/valueId refer to eIDs, not DOM IDs. Resolve only within the same Grid.
        // Repeated copies can share a relationship; unrelated duplicate IDs must stay separate.
        const chooseOwner = (label: Entry, candidates: Entry[]) => {
            const ancestor = ancestors(label).find((parent) => candidates.includes(parent));
            if (ancestor) return ancestor;
            const siblings = candidates.filter(
                (candidate) => candidate.parentId === label.parentId,
            );
            const scoped = siblings.length ? siblings : candidates;
            if (scoped.length === 1) return scoped[0];
            const first = scoped[0];
            if (
                first?.gridId &&
                first.attrs.eid &&
                first.attrs.vid &&
                scoped.every(
                    (candidate) =>
                        candidate.gridId === first.gridId &&
                        candidate.attrs.eid === first.attrs.eid &&
                        candidate.attrs.vid === first.attrs.vid &&
                        candidate.type === first.type,
                )
            )
                return first;
        };
        for (const entry of entries) {
            if (!isLabel(entry) && !isCaption(entry)) continue;
            const valueId = relationId(entry, 'valueId');
            const labelId = scalar(entry.attrs.eid);
            const candidates = !isLabel(entry)
                ? []
                : valueId
                  ? (byEid.get(scopeKey(entry, valueId)) ?? []).filter((candidate) => {
                        const reverse = relationId(candidate, 'labelId');
                        return !reverse || reverse === labelId;
                    })
                  : labelId
                    ? (byLabelId.get(scopeKey(entry, labelId)) ?? [])
                    : [];
            let owner = chooseOwner(entry, candidates);
            if (!owner && !valueId && candidates.length === 0) {
                for (const parent of ancestors(entry)) {
                    // Lamp7 btn-inner stores its editable caption on the immediate parent.
                    if (
                        isControl(parent) ||
                        (isCaption(entry) &&
                            parent.model.cid === entry.parentId &&
                            parent.type === 'dropdown')
                    ) {
                        owner = parent;
                        break;
                    }
                    // Do not climb across a distinct Lamp7 component to claim its label.
                    if (
                        parent.attrs.eid ||
                        parent.attrs.vid ||
                        !['default', 'text', 'none'].includes(parent.type)
                    )
                        break;
                }
            }
            if (owner) ownerIds.set(entry.model.cid, owner.model.cid);
        }
        // Formatting spans inside labels/captions also belong to that label, never a new result.
        for (const entry of entries) {
            const parent = byModel.get(entry.parentId ?? '');
            if (entry.type === 'colName' && parent?.el?.classList?.contains('grid-col-compo')) {
                ownerIds.set(entry.model.cid, parent.model.cid);
                continue;
            }
            if (
                entry.attrs.eid ||
                entry.attrs.vid ||
                !['default', 'text', 'none'].includes(entry.type)
            )
                continue;
            if (
                parent &&
                (isLabel(parent) || isCaption(parent) || ownerIds.has(parent.model.cid))
            ) {
                ownerIds.set(entry.model.cid, parent.model.cid);
            }
        }
        const boundaries = new Set(
            entries
                .filter(
                    (e) =>
                        e.el &&
                        (e.attrs.eid || e.attrs.vid || !['default', 'text'].includes(e.type)),
                )
                .map((e) => e.el!),
        );
        const ownText = (el: HTMLElement | undefined): string => {
            if (!el) return '';
            const parts: string[] = [];
            const walk = (node: Node) => {
                if (node.nodeType === 3) {
                    parts.push(node.textContent ?? '');
                    return;
                }
                if (node.nodeType !== 1) return;
                const element = node as HTMLElement;
                if (element !== el && boundaries.has(element)) return;
                if (['SCRIPT', 'STYLE', 'TEMPLATE'].includes(element.tagName)) return;
                for (const child of element.childNodes) walk(child);
            };
            walk(el);
            return clean(parts.join(' '));
        };
        const htmlText = (value: unknown) => {
            const html = scalar(value);
            if (!html) return '';
            // Inert template: no insertion into the canvas, scripts are never executed.
            const template = document.createElement('template');
            template.innerHTML = html;
            template.content
                .querySelectorAll('script, style, template')
                .forEach((node) => node.remove());
            return clean(template.content.textContent ?? '');
        };
        const hidden = (el: HTMLElement | undefined) => {
            if (!el?.isConnected || !el.getClientRects().length) return true;
            for (let node: HTMLElement | null = el; node; node = node.parentElement) {
                const style = node.ownerDocument.defaultView?.getComputedStyle(node);
                if (
                    node.hidden ||
                    node.getAttribute('data-hidden') === 'Y' ||
                    style?.display === 'none' ||
                    style?.visibility === 'hidden' ||
                    style?.opacity === '0'
                )
                    return true;
            }
            return false;
        };
        const structure = (entry: Entry): NonNullable<VisualComponentRecord['structure']> => {
            const collection = entry.model.get('classes') as
                | { models?: Array<{ get(key: string): unknown }> }
                | undefined;
            const classes = new Set(
                [
                    ...scalar(entry.attrs.class).split(/\s+/),
                    ...scalar(entry.el?.getAttribute('class')).split(/\s+/),
                    ...(collection?.models ?? []).map((model) => scalar(model.get('name'))),
                ].filter(Boolean),
            );
            // Also works with older studio views exposing only classList.
            for (const name of [
                'container-fluid',
                'container-fluid-sub-screen',
                'layout-frame',
                'panel-frame',
                'layout-content',
                'repeat-check-row',
                'grid-compo',
                'grid-col-tr',
                'grid-header-tr',
                'grid-header-th',
                'grid-col-compo',
                'grid-td',
                'grid-col-select',
                'grid-col-rownum',
                'pivot-list-col',
                'pivot-value-list-col',
                'tree-grid-node-compo',
                'tree-container',
                'manual-tree-container',
                'tree-node',
                'manual-tree-node',
                'duration-date-compo',
                'duration-date-value-compo',
                'dataselect-compo',
                'dataselect-btn-compo',
                'inputgroup-compo',
                'inputgroup-btn-compo',
                'radio-compo',
                'repeat-radio-compo',
                'checkbox-compo',
                'repeat-checkbox-compo',
                'form-check-label',
                'dropdown-compo',
                'dropdown-btn-compo',
                'dropdown-list',
                'dropdown-group',
                'dropdown-group-content',
                'dropdown-group-name',
                'btn-compo',
                'grid-btn-compo',
                'page-info',
                'pagination',
                'page-option',
                'repeat-container-page',
                'node-level-input',
                'grid-up-btn',
                'grid-down-btn',
                'grid-expand-btn',
                'grid-expand-toggle-btn',
                'frozen-left-btn',
                'frozen-right-btn',
            ])
                if (entry.el?.classList?.contains(name)) classes.add(name);
            const stringList = (value: unknown): string[] =>
                (Array.isArray(value) ? value : [value]).map(scalar).map(clean).filter(Boolean);
            return {
                tag: (entry.el?.tagName || scalar(entry.model.get('tagName'))).toUpperCase(),
                classes: [...classes],
                removable: entry.model.get('removable') !== false,
                buttonTypes: stringList(entry.setting.buttonType),
            };
        };
        const structures = new Map(entries.map((entry) => [entry.model.cid, structure(entry)]));
        const columnByCell = new Map<string, { id: string; role: 'column' | 'cell' }>();
        for (const entry of entries) {
            if (!entry.gridId) continue;
            const info = structures.get(entry.model.cid)!;
            const isColumn = info.tag === 'TH' && info.classes.includes('grid-col-compo');
            const isCell = info.tag === 'TD' && info.classes.includes('grid-td');
            if (!isColumn && !isCell) continue;
            const row = byModel.get(entry.parentId ?? '');
            const section = byModel.get(row?.parentId ?? '');
            const table = byModel.get(section?.parentId ?? '');
            if (
                !row ||
                !section ||
                !table ||
                structures.get(row.model.cid)?.tag !== 'TR' ||
                structures.get(section.model.cid)?.tag !== (isColumn ? 'THEAD' : 'TBODY') ||
                structures.get(table.model.cid)?.tag !== 'TABLE' ||
                table.gridId !== entry.gridId ||
                (isColumn && !structures.get(row.model.cid)?.classes.includes('grid-col-tr'))
            )
                continue;
            const siblings = children(row.model);
            // Native getTdByGridCol uses the physical cell index. Do not infer merged spans.
            if (
                siblings.some((model) => {
                    const attrs = (model.get('attributes') ?? {}) as Record<string, unknown>;
                    return Number(attrs.colspan || 1) !== 1 || Number(attrs.rowspan || 1) !== 1;
                })
            )
                continue;
            const index = siblings.indexOf(entry.model);
            if (index < 0) continue;
            columnByCell.set(entry.model.cid, {
                id: JSON.stringify([table.model.cid, index]),
                role: isColumn ? 'column' : 'cell',
            });
        }
        const columnOf = (entry: Entry): VisualComponentRecord['gridColumn'] => {
            const own = columnByCell.get(entry.model.cid);
            if (own) return own;
            const parent = ancestors(entry).find(
                (candidate) =>
                    candidate.gridId === entry.gridId && columnByCell.has(candidate.model.cid),
            );
            const column = parent && columnByCell.get(parent.model.cid);
            return column ? { id: column.id, role: 'content' } : undefined;
        };
        return {
            records: entries.map((entry, order) => ({
                location: {
                    modelId: entry.model.cid,
                    domId: entry.el?.id || scalar(entry.attrs.id),
                    eid: scalar(entry.attrs.eid),
                    vid: scalar(entry.attrs.vid),
                },
                ownerModelId: ownerIds.get(entry.model.cid),
                parentModelId: entry.parentId,
                structure: structures.get(entry.model.cid),
                selectable:
                    entry.model.get('selectable') !== false &&
                    ![
                        'wrapper',
                        'none',
                        'container-content',
                        'tab-name-wrapper',
                        'btn-inner',
                    ].includes(entry.type) &&
                    ![
                        'container-fluid',
                        'container-fluid-sub-screen',
                        'layout-frame',
                        'panel-frame',
                        'layout-content',
                    ].some((name) => entry.el?.classList?.contains(name)) &&
                    (!['default', 'text'].includes(entry.type) ||
                        !!entry.attrs.eid ||
                        !!entry.attrs.vid),
                type: entry.type,
                componentType: scalar(entry.setting.type) || entry.type,
                name: entry.name,
                label:
                    clean(scalar(entry.setting.name)) ||
                    htmlText(entry.setting.nameHtml) ||
                    clean(scalar(entry.setting.elShowName)) ||
                    (boundaries.has(entry.el!) ? ownText(entry.el) : ''),
                description: scalar(entry.setting.description).trim(),
                // Anonymous inline wrappers can be addressed by ID, but do not duplicate their owner's text.
                text: clean(
                    [
                        entry.attrs.eid || entry.attrs.vid || boundaries.has(entry.el!)
                            ? ownText(entry.el)
                            : '',
                        htmlText(entry.setting.nameHtml),
                        scalar(entry.setting.placeholder),
                    ]
                        .filter(Boolean)
                        .join(' '),
                ),
                gridId: entry.gridId,
                gridColumn: columnOf(entry),
                hidden: entry.setting.hiddenYn === 'Y' || hidden(entry.el),
                rendered: !!entry.el?.isConnected && !!entry.el.id,
                order,
            })),
        };
    } catch {
        return {
            records: [],
            error: '현재 Visual editor 버전의 컴포넌트 정보를 읽을 수 없습니다.',
        };
    }
}
