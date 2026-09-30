import type { VisualClipboard, VisualCopyNode, VisualObject } from '../transferTypes';
import type { transformVisualClipboard } from '../transformClipboard';

export interface SnapshotPasteModel {
    cid: string;
    get(key: string): unknown;
    getEl?(): HTMLElement | undefined;
    getAttributes(): VisualObject;
    setAttributes(value: VisualObject): void;
    getStyle?(): VisualObject;
    getClasses?(): string[];
    parent(): SnapshotPasteModel | undefined;
    append(data: VisualObject | string, options: { at: number }): SnapshotPasteModel[];
    viewLayer?: unknown;
}

/** MAIN-safe import boundary. Only NEW model settings/assets may be written here.
 * Lamp7 subScreenCopy uses clone/append + copied settings, but its global reference
 * and event scans are unsuitable for cross-screen import. Keep those scoped here.
 */
export async function pasteVisualSnapshot(
    clipboard: VisualClipboard,
    parent: SnapshotPasteModel,
    index: number,
    valid: () => boolean,
    progress: (text: string) => Promise<void>,
    mutation: (active: boolean) => void,
    transformSource: string,
): Promise<{ createdIds: string[]; error?: string }> {
    const read = (name: string) =>
        Function(`return typeof ${name} === 'undefined' ? undefined : ${name}`)();
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
    const copy = clone(clipboard);
    const settings = read('_settingInfo') as Record<string, VisualObject>;
    const images = read('_fileUploadData') as VisualObject | undefined;
    const editor = read('editor') as { getWrapper(): SnapshotPasteModel };
    const children = (model: SnapshotPasteModel): SnapshotPasteModel[] =>
        (model.get('components') as { models?: SnapshotPasteModel[] })?.models ?? [];
    const walk = (model: SnapshotPasteModel): SnapshotPasteModel[] => [
        model,
        ...children(model).flatMap(walk),
    ];
    const sourceWalk = (node: VisualCopyNode): VisualCopyNode[] => [
        node,
        ...node.children.flatMap(sourceWalk),
    ];
    const str = (value: unknown) => (typeof value === 'string' ? value : '');
    const all = copy.roots.flatMap((r) => sourceWalk(r.node));
    const sourceByKey = new Map(all.map((node) => [node.key, node]));
    const own = (object: object, key: string) => Object.hasOwn(object, key);
    const canonical = (value: unknown): unknown =>
        Array.isArray(value)
            ? value.map(canonical)
            : value && typeof value === 'object'
              ? Object.fromEntries(
                    Object.entries(value)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([k, v]) => [k, canonical(v)]),
                )
              : value;
    const equal = (a: unknown, b: unknown) =>
        JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
    const before = new Set(walk(editor.getWrapper()));
    const initialSettings = new Set(Object.keys(settings));
    const registered = new Map<string, VisualObject>();
    const registeredImages = new Map<string, VisualObject[string]>();
    // Every append is synchronous. Record results even when a model hook throws
    // after insertion; never infer ownership from the whole screen after a yield.
    const created = new Set<SnapshotPasteModel>();
    const append = (target: SnapshotPasteModel, data: VisualObject | string, at: number) => {
        check();
        const previous = new Set(children(target));
        try {
            const added = target.append(data, { at });
            if (!Array.isArray(added) || added.length !== 1)
                throw Error('컴포넌트 생성 결과를 확인할 수 없습니다.');
            return added[0];
        } finally {
            for (const model of children(target))
                if (!previous.has(model) && !before.has(model))
                    walk(model).forEach((m) => created.add(m));
        }
    };
    const check = () => {
        if (
            !valid() ||
            read('editor') !== editor ||
            read('_settingInfo') !== settings ||
            read('_fileUploadData') !== images ||
            parent.getEl?.()?.isConnected === false
        )
            throw Error('대상 화면이 변경되어 붙여넣기를 중단했습니다.');
    };
    const actual = () => {
        const present = new Set(walk(editor.getWrapper()));
        return [...created].filter((m) => present.has(m));
    };
    const roots = () => {
        const present = new Set(actual());
        return [...present].filter((m) => !present.has(m.parent()!));
    };
    const pending = new Map<string, VisualObject>();
    const matched = new Map<string, SnapshotPasteModel>();
    const reservedEids = all.map((n) => str(n.attributes.eid)).filter(Boolean);
    const block = read('BlockHelper') as Record<
        string,
        (content: string | null, classes: string) => string
    >;
    const createSetting = read('createSettingInfo') as (
        m: SnapshotPasteModel,
        data: null,
        ids: string[],
    ) => void;
    const width = read('setGridCalWidth') as (m: SnapshotPasteModel) => void;
    const header = read('setGridHeaderResize') as (m: SnapshotPasteModel) => void;
    const layer = read('setLayerTab') as (m: SnapshotPasteModel) => void;
    const layout = read('scheduleVariableCanvasWidth') as (delay: number) => void;
    // drawElement's Row/Col branches, without moving a source model, recreating
    // labels/default nodes, or consulting Lamp7's previous drag selection globals.
    const wrappers = (node: VisualCopyNode): Array<{ kind: 'row' | 'col'; classes: string }> => {
        const el = parent.getEl!()!;
        const has = (name: string) => node.classes.includes(name);
        const outer = el.matches('.container-fluid,.container-content');
        const row = el.matches('.form-row');
        const search = el.matches('.search-col,.search-row');
        const container = [
            'default-container',
            'search-container',
            'group-container',
            'tab-group-container',
            'sub-screen-tab-group-container',
            'form-col',
            'cascader-compo',
            'comment-container',
        ].some(has);
        const form = [
            'col-form-label',
            'value-compo',
            'input-compo',
            'textarea-compo',
            'html-compo',
            'radio-compo',
            'checkbox-compo',
            'select-compo',
            'attach-compo',
            'date-compo',
            'time-compo',
            'datetime-compo',
            'dataselect-compo',
            'id-compo',
            'duration-date-compo',
            'duration-date-value-compo',
            'inputgroup-compo',
            'img-compo',
        ].some(has);
        const multi =
            form ||
            [
                'text-compo',
                'link-compo',
                'btn-compo',
                'chart-compo',
                'dropdown-compo',
                'page-option',
                'node-level-input',
                'CAA-compo',
                'badge-compo',
            ].some(has);
        const control =
            multi || ['grid-compo', 'page-info', 'pagination', 'tree-list-node'].some(has);
        const specs: Array<{ kind: 'row' | 'col'; classes: string }> = [];
        if (outer && (container || control))
            specs.push({ kind: 'row', classes: search ? 'search-row search-row-add' : '' });
        if ((outer || row) && control && !container)
            specs.push({
                kind: 'col',
                classes: [
                    has('col-form-label') ? 'label-col' : form ? 'value-col' : '',
                    multi ? 'multi-col' : '',
                    search ? 'search-col search-col-add' : '',
                ]
                    .filter(Boolean)
                    .join(' '),
            });
        return specs;
    };
    const plans = copy.roots.map((root) => wrappers(root.node));
    const dataFor = (node: VisualCopyNode): VisualObject => ({
        ...clone(node.data),
        attributes: clone(node.attributes),
        classes: [...node.classes],
        style: clone(node.style),
        components: node.children.map(dataFor),
    });
    const normalize = (node: VisualCopyNode, searchId: string) => {
        if (node.classes.some((c) => ['search-container', 'unifiedSearch-container'].includes(c)))
            searchId = str(node.attributes.eid);
        if (node.setting && (searchId || own(node.setting, 'elSearchContainer'))) {
            node.setting.elSearchContainer = searchId;
            for (const key of Object.keys(node.attributes))
                if (key.toLowerCase() === 'elsearchcontainer') delete node.attributes[key];
            if (searchId) node.attributes.elsearchcontainer = searchId;
        }
        // Hidden visibility is a destination editor preference, separate from the
        // saved hiddenYn flag. Never toggle every hidden component on the page.
        if (
            node.attributes['data-hidden'] === 'Y' ||
            node.setting?.hiddenYn === 'Y' ||
            (Array.isArray(node.setting?.hiddenYn) && node.setting.hiddenYn.includes('Y'))
        ) {
            node.attributes['data-hidden'] = 'Y';
            if (document.querySelector('#hiddenToggle .icon-eyeoff')) node.style.display = 'none';
            else delete node.style.display;
        }
        node.children.forEach((child) => normalize(child, searchId));
    };
    const verify = (node: VisualCopyNode, model: SnapshotPasteModel) => {
        matched.set(node.key, model);
        const attrs = model.getAttributes();
        for (const [key, value] of Object.entries(node.attributes))
            if (!equal(attrs[key], value)) throw Error(`${key} 속성이 생성 결과와 다릅니다.`);
        if (node.setting && !equal(settings[str(attrs.vid)], node.setting))
            throw Error('컴포넌트 설정이 생성 결과와 다릅니다.');
        if (typeof node.data.content === 'string' && model.get('content') !== node.data.content)
            throw Error('컴포넌트 내용이 생성 결과와 다릅니다.');
        const classes = model.getClasses?.() ?? Array.from(model.getEl?.()?.classList ?? []);
        if (node.classes.some((name) => !classes.includes(name)))
            throw Error('컴포넌트 표시 클래스가 생성 결과와 다릅니다.');
        for (const [key, value] of Object.entries(node.style))
            if (!equal(model.getStyle?.()?.[key], value))
                throw Error(`${key} 스타일이 생성 결과와 다릅니다.`);
        const list = children(model);
        if (list.length !== node.children.length)
            throw Error('하위 컴포넌트 구조가 생성 결과와 다릅니다.');
        node.children.forEach((child, i) => verify(child, list[i]));
    };
    const finish = (models: SnapshotPasteModel[]) => {
        for (const m of models) {
            check();
            if (m.getEl?.()?.classList?.contains('grid-compo')) {
                width(m);
                header(m);
            }
            if (
                m.getAttributes()['data-hidden'] === 'Y' &&
                m.viewLayer &&
                typeof layer === 'function'
            )
                layer(m);
        }
        if (typeof layout === 'function') layout(0);
    };
    try {
        check();
        if (plans.some((p) => p.length) && (!block || typeof createSetting !== 'function'))
            throw Error('Lamp7의 Row·Col 생성 기능에 연결할 수 없습니다.');
        for (const specs of plans)
            for (const spec of specs)
                if (typeof block[spec.kind] !== 'function')
                    throw Error('Lamp7의 Row·Col 템플릿을 확인할 수 없습니다.');
        if (
            all.some((n) => n.classes.includes('grid-compo')) &&
            (typeof width !== 'function' || typeof header !== 'function')
        )
            throw Error('Lamp7의 Grid 배치 기능에 연결할 수 없습니다.');
        // A tab header alone also owns a sibling content panel. It is not a full
        // imported subtree. Whole tab groups, including every panel, are supported.
        if (
            copy.roots.some((r) =>
                r.node.classes.some((c) => ['tab-name', 'sub-screen-tab-name'].includes(c)),
            )
        )
            throw Error('개별 탭 대신 탭 그룹 전체를 복사해 주세요.');
        if (
            all.some((n) =>
                n.classes.some((c) =>
                    ['sub-screen-tab-group-container', 'sub-screen-tab-name'].includes(c),
                ),
            )
        )
            throw Error(
                '서브스크린 전체 복사는 아직 지원하지 않습니다. 내부 Row·컴포넌트를 복사해 주세요.',
            );
        const searchId =
            parent
                .getEl?.()
                ?.closest('.search-container,.unifiedSearch-container')
                ?.getAttribute('eid') ?? '';
        copy.roots.forEach((r) => normalize(r.node, searchId));
        for (const node of all) {
            const vid = str(node.attributes.vid);
            if (vid && !node.setting)
                throw Error('컴포넌트 설정이 없습니다. 원본에서 다시 복사해 주세요.');
            if (!node.setting) continue;
            if (!vid || !str(node.attributes.eid) || node.setting.id !== node.attributes.eid)
                throw Error('컴포넌트와 설정의 ID 연결을 확인할 수 없습니다.');
            if (own(settings, vid))
                throw Error('설정 ID가 이미 사용 중입니다. 다시 붙여넣어 주세요.');
            if (pending.has(vid) && !equal(pending.get(vid), node.setting))
                throw Error('반복 컴포넌트의 공유 설정이 서로 다릅니다.');
            pending.set(vid, node.setting);
        }
        for (const id of Object.keys(copy.images))
            if (!images || own(images, id)) throw Error('이미지 저장 위치를 확인할 수 없습니다.');
        const inserted: Array<{ node: VisualCopyNode; model: SnapshotPasteModel }> = [];
        for (const [rootIndex, root] of copy.roots.entries()) {
            mutation(false);
            await progress(`붙여넣는 중 ${rootIndex} / ${copy.roots.length}`);
            check();
            mutation(true);
            let destination = parent;
            for (const spec of plans[rootIndex]) {
                destination = append(
                    destination,
                    block[spec.kind](spec.kind === 'row' ? null : '', spec.classes),
                    destination === parent ? index : 0,
                );
                // Same BlockHelper -> append -> createSettingInfo sequence as drawRow/
                // drawCol. Pass the complete reserved EID list for BOTH wrapper kinds;
                // drawCol itself has no reservation parameter.
                try {
                    createSetting(destination, null, reservedEids);
                } finally {
                    const vid = str(destination.getAttributes().vid);
                    if (vid && !initialSettings.has(vid) && settings[vid])
                        registered.set(vid, settings[vid]);
                }
                const attrs = destination.getAttributes();
                if (
                    !attrs.vid ||
                    !attrs.eid ||
                    !settings[str(attrs.vid)] ||
                    pending.has(str(attrs.vid)) ||
                    reservedEids.includes(str(attrs.eid))
                )
                    throw Error('새 Row·Col의 설정을 확인할 수 없습니다.');
            }
            check();
            for (const node of sourceWalk(root.node)) {
                const vid = str(node.attributes.vid);
                if (node.setting && !registered.has(vid)) {
                    if (own(settings, vid)) throw Error('생성 중 설정 ID가 변경되었습니다.');
                    const value = clone(pending.get(vid)!);
                    settings[vid] = value;
                    registered.set(vid, value);
                }
                const eid = str(node.attributes.eid);
                for (const suffix of ['', '_pre', '_suf']) {
                    const key = eid + suffix;
                    if (!own(copy.images, key) || registeredImages.has(key)) continue;
                    if (!images || own(images, key))
                        throw Error('생성 중 이미지 ID가 변경되었습니다.');
                    const value = clone(copy.images[key]);
                    images[key] = value;
                    registeredImages.set(key, value);
                }
            }
            const model = append(
                destination,
                dataFor(root.node),
                destination === parent ? index : 0,
            );
            verify(root.node, model);
            inserted.push({ node: root.node, model });
            index++;
        }
        // All peers exist before any layout hook runs. No property-panel rendering,
        // changeSettingInfoByComponent (new VID per field), or FileReader roundtrip.
        finish(actual());
        check();
        for (const { node, model } of inserted) {
            // Layout hooks legitimately update widths. Identity/structure must remain.
            if (model.getAttributes().vid !== node.attributes.vid)
                throw Error('후처리 중 설정 연결이 변경되었습니다.');
        }
        mutation(false);
        await progress(`화면 반영 완료 ${copy.roots.length} / ${copy.roots.length}`);
        check();
        return { createdIds: roots().map((m) => m.cid) };
    } catch (error) {
        let message = error instanceof Error ? error.message : String(error);
        // Keep real created models on failure. Native delete can remove an existing
        // empty parent too, so do not auto-delete the batch through that global path.
        // Reconcile only the records owned by this import, never existing records.
        try {
            check();
            mutation(true);
            const present = actual();
            const presentSet = new Set(present);
            const byDomId = new Map(
                present.flatMap((m) => {
                    const id = str(m.getAttributes().id);
                    return id ? [[id, m] as const] : [];
                }),
            );
            const survive = (
                node: VisualCopyNode,
                positional?: SnapshotPasteModel,
            ): VisualCopyNode[] => {
                const id = str(node.attributes.id);
                const model = id ? byDomId.get(id) : (matched.get(node.key) ?? positional);
                if (!model || !presentSet.has(model))
                    return node.children.flatMap((child) => survive(child));
                if (
                    !id &&
                    !matched.has(node.key) &&
                    ((node.data.type && model.get('type') !== node.data.type) ||
                        (typeof node.data.content === 'string' &&
                            model.get('content') !== node.data.content))
                )
                    return [];
                matched.set(node.key, model);
                return [
                    {
                        ...node,
                        children: node.children.flatMap((child, i) =>
                            survive(child, children(model)[i]),
                        ),
                    },
                ];
            };
            const surviving = {
                ...copy,
                roots: copy.roots.flatMap((root) =>
                    survive(root.node).map((node) => ({ ...root, node })),
                ),
            };
            const transform = Function(
                `return (${transformSource})`,
            )() as typeof transformVisualClipboard;
            const repaired = transform(surviving, (id) => id).clipboard;
            for (const root of repaired.roots)
                normalize(
                    root.node,
                    matched
                        .get(root.node.key)
                        ?.getEl?.()
                        ?.closest('.search-container,.unifiedSearch-container')
                        ?.getAttribute('eid') ?? '',
                );
            for (const node of repaired.roots.flatMap((r) => sourceWalk(r.node))) {
                const model = matched.get(node.key)!;
                const vid = str(node.attributes.vid);
                const original = sourceByKey.get(node.key)!;
                if (node.setting && registered.has(vid) && settings[vid] === registered.get(vid)) {
                    // Preserve native layout/default adjustments. Failure repair only
                    // applies reference changes between the prepared and surviving copies.
                    const value = clone(settings[vid]);
                    let changed = false;
                    for (const [key, entry] of Object.entries(node.setting))
                        if (!equal(entry, original.setting?.[key])) {
                            value[key] = clone(entry);
                            changed = true;
                        }
                    if (changed) {
                        settings[vid] = value;
                        registered.set(vid, value);
                    }
                }
                // Remove references cleared by transform, not unrelated model defaults.
                const attrs = { ...model.getAttributes() };
                let changed = false;
                for (const [key, value] of Object.entries(node.attributes))
                    if (!equal(value, original.attributes[key])) {
                        attrs[key] = value;
                        changed = true;
                    }
                for (const key of Object.keys(original.attributes))
                    if (!own(node.attributes, key)) {
                        delete attrs[key];
                        changed = true;
                    }
                if (changed) model.setAttributes(attrs);
            }
            const usedVids = new Set(present.map((m) => str(m.getAttributes().vid)));
            const usedEids = new Set(present.map((m) => str(m.getAttributes().eid)));
            for (const [vid, value] of registered)
                if (!usedVids.has(vid) && settings[vid] === value) delete settings[vid];
            for (const [key, value] of registeredImages)
                if (
                    !usedEids.has(key) &&
                    !usedEids.has(key.replace(/_(pre|suf)$/, '')) &&
                    images?.[key] === value
                )
                    delete images[key];
        } catch (cleanup) {
            message += ` ${cleanup instanceof Error ? cleanup.message : String(cleanup)}`;
        }
        return { createdIds: roots().map((m) => m.cid), error: message };
    } finally {
        mutation(false);
    }
}
