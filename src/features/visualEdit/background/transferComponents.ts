import type { readVisualComponents } from '../../visualSearch/background/readComponents';
import type { visualPasteWrappers, visualPlacement } from '../placement';
import type { buildSelectionPolicy } from '../policy';
import type {
    VisualClipboard,
    VisualCopyNode,
    VisualJson,
    VisualObject,
    VisualTransferPayload,
    VisualTransferResult,
} from '../transferTypes';
import type { transformVisualClipboard } from '../transformClipboard';

/** MAIN world. All helper implementations are explicit serialized arguments. */
export async function transferVisualComponents(
    payload: VisualTransferPayload,
    sources: {
        progress?: string;
        reader: string;
        policy: string;
        transform: string;
        placement: string;
        wrappers: string;
    },
): Promise<VisualTransferResult> {
    type Model = {
        cid: string;
        get(key: string): unknown;
        getEl?(): HTMLElement | undefined;
        getStyle?(): VisualObject;
        getClasses?(): string[];
        getAttributes?(): VisualObject;
        setAttributes?(value: VisualObject): void;
        toJSON?(): VisualObject;
        view?: { getChildrenContainer?(): HTMLElement };
        parent(): Model | undefined;
        index(): number;
        append(data: VisualObject | string, options?: { at: number }): Model[];
    };
    type Editor = {
        getWrapper(): Model;
        DomComponents?: { getType(type: string): unknown };
        getModel?(): { isEditing?(): boolean };
    };
    type Bridge = {
        modeId: string;
        editor: Editor;
        mutating: boolean;
        operation?: {
            requestId: string;
            modelIds: string[];
            consumed: boolean;
            kind?: string;
            position?: string;
        };
    };
    const read = (name: string) =>
        Function(`return typeof ${name} === 'undefined' ? undefined : ${name}`)();
    const host = window as unknown as { __lamp7GenieVisualEdit?: Bridge };
    const result: VisualTransferResult = { createdIds: [] };
    let ownsMutation = false;
    let bridge: Bridge | undefined;
    try {
        const editor = read('editor') as Editor;
        const settings = read('_settingInfo') as Record<string, VisualObject>;
        const images = read('_fileUploadData') as VisualObject | undefined;
        if (!editor?.getWrapper || !settings)
            throw Error('Visual editor 데이터를 읽을 수 없습니다.');
        const frame = document.querySelector<HTMLIFrameElement>('#gjs .gjs-frame');
        const canvas = frame?.contentDocument;
        if (
            !canvas ||
            editor.getModel?.().isEditing?.() ||
            canvas.querySelector('[contenteditable="true"]')
        )
            throw Error('텍스트 편집을 마친 뒤 실행해 주세요.');
        const nodes: Model[] = [],
            seen = new Set<Model>();
        const children = (m: Model): Model[] =>
            (m.get('components') as { models?: Model[] })?.models ?? [];
        const visit = (m: Model) => {
            if (seen.has(m)) return;
            seen.add(m);
            nodes.push(m);
            children(m).forEach(visit);
        };
        visit(editor.getWrapper());
        const byId = new Map(nodes.map((m) => [m.cid, m]));
        const reader = Function(`return (${sources.reader})`)() as typeof readVisualComponents;
        // Paste validates the locked receiver directly. It neither needs search labels for
        // every existing node nor a post-insertion snapshot: the mode ends after the operation.
        const snapshot = payload.action === 'paste' ? { records: [] } : reader();
        if (snapshot.error) throw Error(snapshot.error);
        if (payload.action === 'targets') {
            const recordsById = new Map(snapshot.records.map((r) => [r.location.modelId, r]));
            // Paste receivers include unselectable content and ID-less views. Do not add
            // temporary identifiers to Lamp7's saved DOM merely to find them from ISOLATED.
            for (const m of nodes) {
                const el = m.getEl?.();
                // GrapesJS textnode views are connected Text nodes, not element receivers.
                if (!el?.isConnected || !el.classList || !canvas.body?.contains(el)) continue;
                const path: number[] = [];
                let cursor = el;
                while (cursor !== canvas.body && cursor.parentElement) {
                    path.unshift(
                        Array.prototype.indexOf.call(cursor.parentElement.children, cursor),
                    );
                    cursor = cursor.parentElement;
                }
                if (cursor !== canvas.body) continue;
                let r = recordsById.get(m.cid);
                if (!r) {
                    const a = m.getAttributes?.() ?? {};
                    r = {
                        location: {
                            modelId: m.cid,
                            domId: el.id || '',
                            eid: String(a.eid ?? ''),
                            vid: String(a.vid ?? ''),
                        },
                        parentModelId: m.parent()?.cid ?? null,
                        type: String(m.get('type') ?? ''),
                        componentType: el.classList.contains('container-fluid')
                            ? 'Screen'
                            : 'Container',
                        name: '',
                        label: '',
                        description: '',
                        text: '',
                        gridId: null,
                        hidden: false,
                        rendered: true,
                        order: snapshot.records.length,
                        selectable: false,
                    };
                    snapshot.records.push(r);
                    recordsById.set(m.cid, r);
                }
                r.location.domPath = path;
                r.rendered = true;
            }
        }
        if (payload.action !== 'paste') result.records = snapshot.records;
        const policy =
            payload.action === 'copy'
                ? (Function(`return (${sources.policy})`)() as typeof buildSelectionPolicy)(
                      snapshot.records,
                  )
                : undefined;
        const placement = Function(`return (${sources.placement})`)() as typeof visualPlacement;
        const probes = new Map<VisualCopyNode, HTMLElement>();
        const place = (
            roots: VisualClipboard['roots'],
            m: Model | undefined,
            position: 'inside' | 'before' | 'after',
        ) => placement(roots, m, position, probes);
        const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
        const str = (value: unknown) =>
            typeof value === 'string' || typeof value === 'number' ? String(value) : '';
        const clipboard = payload.clipboard;
        const checkClipboard = () => {
            if (
                !clipboard ||
                clipboard.kind !== 'lamp7-genie/visual' ||
                clipboard.version !== 1 ||
                !Array.isArray(clipboard.roots) ||
                !clipboard.roots.length
            )
                throw Error('Visual 복사 데이터를 확인할 수 없습니다. 다시 복사해 주세요.');
            let count = 0;
            const keys = new Set<string>();
            const check = (n: VisualCopyNode, depth: number) => {
                if (
                    ++count > 10000 ||
                    depth > 100 ||
                    !n ||
                    !n.key ||
                    keys.has(n.key) ||
                    !n.attributes ||
                    !n.data ||
                    !Array.isArray(n.children)
                )
                    throw Error('복사 데이터 구조가 올바르지 않습니다.');
                keys.add(n.key);
                n.children.forEach((c) => check(c, depth + 1));
            };
            clipboard.roots.forEach((r) => check(r.node, 0));
            if (
                clipboard.roots.some(
                    (r) =>
                        !r.placement ||
                        (!['boolean', 'string'].includes(typeof r.placement.draggable) &&
                            !Array.isArray(r.placement.draggable)),
                )
            )
                throw Error(
                    '이전 복사 데이터에는 드롭 규칙이 없습니다. 컴포넌트를 다시 복사해 주세요.',
                );
        };
        if (payload.action !== 'copy') checkClipboard();
        if (
            (payload.action === 'paste' || payload.position !== undefined) &&
            !['inside', 'before', 'after'].includes(payload.position ?? '')
        )
            throw Error('붙여넣을 위치를 다시 선택해 주세요.');
        if (payload.action === 'targets') {
            const byElement = new Map(
                nodes.flatMap((m) => {
                    const el = m.getEl?.();
                    return el ? [[el, m] as const] : [];
                }),
            );
            result.targets = snapshot.records
                .filter((r) => r.rendered && !r.hidden)
                .map((r) => ({
                    modelId: r.location.modelId,
                    positions: (['inside', 'before', 'after'] as const).filter((position) =>
                        place(clipboard!.roots, byId.get(r.location.modelId), position),
                    ),
                    children: (() => {
                        const m = byId.get(r.location.modelId)!;
                        const container = m.view?.getChildrenContainer?.() ?? m.getEl?.();
                        return container?.children
                            ? Array.from(container.children).flatMap((el) => {
                                  const child = byElement.get(el as HTMLElement);
                                  return child ? [child.cid] : [];
                              })
                            : children(m).map((c) => c.cid);
                    })(),
                }));
            if (!result.targets.some((t) => t.positions.length)) {
                const individuallyBlocked = clipboard!.roots.filter(
                    (root) =>
                        !snapshot.records.some(
                            (r) =>
                                r.rendered &&
                                !r.hidden &&
                                place([root], byId.get(r.location.modelId), 'inside'),
                        ),
                );
                result.error = individuallyBlocked.length
                    ? `현재 화면에 ${individuallyBlocked.map((r) => r.label || r.eid || r.type).join(', ')}을(를) 넣을 수 있는 위치가 없습니다. Lamp7의 드롭 제한 또는 잠긴 컨테이너를 확인해 주세요.`
                    : '각 항목은 배치할 수 있지만 모두 함께 들어갈 공통 위치가 없습니다. 항목을 나누어 복사해 주세요.';
            }
            return result;
        }
        const selection = payload.selection;
        bridge = host.__lamp7GenieVisualEdit;
        if (
            !selection ||
            !bridge ||
            bridge.editor !== editor ||
            bridge.modeId !== selection.modeId ||
            bridge.operation?.requestId !== selection.requestId ||
            (payload.action === 'paste' && bridge.operation.position !== payload.position) ||
            bridge.operation.kind !== payload.action ||
            bridge.operation.consumed ||
            bridge.mutating ||
            !selection.locations.length ||
            new Set(selection.locations.map((l) => l.modelId)).size !==
                selection.locations.length ||
            bridge.operation.modelIds.length !== selection.locations.length ||
            selection.locations.some((l) => !bridge!.operation!.modelIds.includes(l.modelId))
        )
            throw Error('선택이 변경되었거나 이미 처리한 요청입니다.');
        bridge.operation.consumed = true;
        const selected = selection.locations.map((location) => {
            const m = byId.get(location.modelId);
            const el = m?.getEl?.();
            const attrs = m?.get('attributes') as VisualObject | undefined;
            const actual =
                payload.action === 'copy'
                    ? policy!.byId.get(location.modelId)?.location
                    : m && {
                          domId: el?.id || str(attrs?.id),
                          eid: str(attrs?.eid),
                          vid: str(attrs?.vid),
                      };
            if (
                !m ||
                !actual ||
                ['domId', 'eid', 'vid'].some(
                    (k) =>
                        actual[k as keyof typeof actual] !== location[k as keyof typeof location],
                )
            )
                throw Error('선택 항목이 변경되었습니다. 다시 선택해 주세요.');
            if (payload.action === 'paste') {
                if (
                    !el?.isConnected ||
                    !canvas.body.contains(el) ||
                    el.id !== location.domId ||
                    (el.getAttribute('eid') ?? '') !== location.eid ||
                    (el.getAttribute('vid') ?? '') !== location.vid
                )
                    throw Error('붙여넣을 영역이 변경되었습니다. 위치를 다시 선택해 주세요.');
                if (location.domPath) {
                    let expected: Element | undefined = canvas.body;
                    for (const index of location.domPath) expected = expected?.children[index];
                    if (expected !== el)
                        throw Error('붙여넣을 영역이 이동되었습니다. 위치를 다시 선택해 주세요.');
                }
            }
            return m;
        });
        const valid = () =>
            host.__lamp7GenieVisualEdit === bridge &&
            read('editor') === editor &&
            read('_settingInfo') === settings &&
            frame?.isConnected &&
            frame.contentDocument === canvas;
        if (payload.action === 'copy') {
            if (selected.some((m) => policy!.canonical(m.cid) !== m.cid))
                throw Error('복사할 본체를 다시 선택해 주세요.');
            const selectedIds = new Set(selected.map((m) => m.cid));
            if (
                selected.some((m) =>
                    policy!.ancestorMap.get(m.cid)?.some((id) => selectedIds.has(id)),
                )
            )
                throw Error('부모와 하위를 중복해서 복사할 수 없습니다.');
            const role = (m: Model | undefined) => {
                const el = m?.getEl?.();
                if (!m || !el) return '';
                const has = (c: string) => el.classList.contains(c);
                if (has('container-fluid') || has('container-fluid-sub-screen')) return 'screen';
                if (has('container-content'))
                    return has('search-col') ? 'search-content' : 'content';
                if (has('form-row') || has('row')) return has('search-row') ? 'search-row' : 'row';
                if (has('form-col') || has('col')) return has('search-col') ? 'search-col' : 'col';
                return `${m.get('type') ?? ''}:${el.tagName}`;
            };
            const copiedImages: VisualObject = {};
            const tables = new Map<string, VisualClipboard['tables'][number]>();
            let count = 0;
            const capture = (m: Model, scope: string, depth: number): VisualCopyNode => {
                if (++count > 10000 || depth > 100)
                    throw Error('복사 범위가 너무 큽니다. 항목을 나누어 복사해 주세요.');
                const attrs = json(
                    m.getAttributes?.() ?? (m.get('attributes') as VisualObject) ?? {},
                );
                const el = m.getEl?.();
                if (!attrs.id && el?.id) attrs.id = el.id;
                const classes =
                    m.getClasses?.().slice() ?? str(attrs.class).split(/\s+/).filter(Boolean);
                if (!m.getClasses && !classes.length && el?.classList)
                    classes.push(...el.classList);
                delete attrs.class;
                scope = classes.includes('grid-compo') ? m.cid : scope;
                const raw = m.toJSON?.() ?? {
                    type: m.get('type'),
                    tagName: m.get('tagName'),
                    content: m.get('content'),
                };
                const data: VisualObject = {};
                for (const [key, value] of Object.entries(raw)) {
                    if (
                        [
                            'components',
                            'attributes',
                            'classes',
                            'style',
                            'traits',
                            'toolbar',
                            'view',
                            'status',
                            'state',
                            'script',
                            'script-export',
                        ].includes(key) ||
                        key.startsWith('_') ||
                        value === undefined ||
                        typeof value === 'function'
                    )
                        continue;
                    data[key] = json(value) as VisualJson;
                }
                data.type = str(m.get('type'));
                if (!data.tagName && el?.tagName) data.tagName = el.tagName.toLowerCase();
                // Remove executable content without touching source DOM or models.
                if (data.type === 'script' || str(data.tagName).toLowerCase() === 'script') {
                    data.type = 'textnode';
                    data.tagName = '';
                    data.content = '';
                }
                if (typeof data.content === 'string' && /[<>]/.test(data.content)) {
                    const template = document.createElement('template');
                    template.innerHTML = data.content;
                    template.content.querySelectorAll('script').forEach((e) => e.remove());
                    template.content
                        .querySelectorAll('*')
                        .forEach((e) =>
                            [...e.attributes]
                                .filter((a) => /^on/i.test(a.name))
                                .forEach((a) => e.removeAttribute(a.name)),
                        );
                    if (
                        template.content.querySelector(
                            '[eid],[vid],[id],[href^="#"],[data-target],[labelid],[valueid]',
                        )
                    )
                        throw Error(
                            `${str(attrs.eid) || m.cid}: HTML 내용 안의 항목 연결을 모델 구조로 확인할 수 없어 복사를 중단했습니다.`,
                        );
                    data.content = template.innerHTML;
                }
                const setting = settings[str(attrs.vid)]
                    ? json(settings[str(attrs.vid)])
                    : undefined;
                if (setting?.dtId) {
                    const layoutKey = str(setting.tableRelInfo),
                        dtId = str(setting.dtId);
                    const key = `${layoutKey}:${dtId}`;
                    const table = tables.get(key) ?? { layoutKey, dtId, dcIds: [] };
                    if (str(setting.dcId) && !table.dcIds.includes(str(setting.dcId)))
                        table.dcIds.push(str(setting.dcId));
                    tables.set(key, table);
                }
                const eid = str(attrs.eid);
                for (const suffix of ['', '_pre', '_suf'])
                    if (eid && images?.[eid + suffix])
                        copiedImages[eid + suffix] = json(images[eid + suffix]);
                return {
                    key: m.cid,
                    scope,
                    data,
                    attributes: attrs,
                    classes,
                    style: json(m.getStyle?.() ?? {}),
                    setting,
                    children: children(m).map((c) => capture(c, scope, depth + 1)),
                };
            };
            const roots = nodes
                .filter((m) => selectedIds.has(m.cid))
                .map((m) => {
                    const r = policy!.byId.get(m.cid)!;
                    return {
                        node: capture(m, '', 0),
                        type: r.componentType,
                        label: r.label,
                        eid: r.location.eid,
                        parentRole: role(m.parent()),
                        placement: {
                            draggable:
                                Array.isArray(m.get('draggable')) ||
                                typeof m.get('draggable') === 'string'
                                    ? (json(m.get('draggable')) as string | string[])
                                    : !!m.get('draggable'),
                            textable: !!m.get('textable'),
                        },
                    };
                });
            const rawClipboard: VisualClipboard = {
                kind: 'lamp7-genie/visual',
                version: 1,
                id: selection.requestId,
                createdAt: Date.now(),
                source: payload.source ?? {
                    origin: location.origin,
                    systemId: str(read('_systemId_')),
                    screenId: '',
                },
                roots,
                images: copiedImages,
                tables: [...tables.values()],
            };
            // Remove events/external links at capture time too. ID changes happen only on the target.
            const transform = Function(
                `return (${sources.transform})`,
            )() as typeof transformVisualClipboard;
            const cleaned = transform(rawClipboard, (id) => id);
            if (!valid()) throw Error('복사 중 화면이 변경되었습니다.');
            result.clipboard = cleaned.clipboard;
            result.removedConnections = cleaned.removedConnections;
            return result;
        }
        if (
            selected.length !== 1 ||
            !place(clipboard!.roots, selected[0], payload.position ?? 'inside')
        )
            throw Error('현재 위치에는 붙여넣을 수 없습니다. 위치를 다시 선택해 주세요.');
        const progress = sources.progress
            ? (Function('return (' + sources.progress + ')')() as (
                  mode: string,
                  request: string,
                  text: string,
              ) => Promise<void>)
            : async () => {};
        let lastProgress = 0;
        const report = async (text: string, force = true) => {
            if (!force && Date.now() - lastProgress < 80) return;
            lastProgress = Date.now();
            await progress(selection.modeId, selection.requestId, text);
        };
        await report('ID 확인 중…');
        if (!valid()) throw Error('붙여넣을 화면이 변경되었습니다.');
        // One fresh snapshot per paste. Never treat a failed lookup as an empty namespace.
        const base = str(read('_baseUrl_'));
        const url = new URL(base + '/session-variable/search/all/lists', location.href);
        if (url.origin !== location.origin) throw Error('세션변수 조회 주소를 확인할 수 없습니다.');
        url.searchParams.set('systemId', str(read('_systemId_')));
        // Use Lamp7's own jQuery transport so ajaxSetup/prefilters/auth hooks and
        // X-Requested-With remain identical to the native session-variable lookup.
        const ajaxHost = read('$') as {
            ajax?: (options: {
                url: string;
                type: string;
                async: boolean;
                dataType: string;
                timeout: number;
                success(data: unknown): void;
                error(xhr: { status?: number }, status: string): void;
            }) => unknown;
        };
        if (typeof ajaxHost?.ajax !== 'function')
            throw Error('Lamp7의 세션변수 조회 기능에 연결할 수 없습니다.');
        const sessionRows = await new Promise<unknown>((resolve, reject) => {
            ajaxHost.ajax!({
                url: base + '/session-variable/search/all/lists' + url.search,
                type: 'GET',
                async: true,
                dataType: 'json',
                timeout: 15000,
                success: resolve,
                error: (xhr, status) =>
                    reject(
                        Error(
                            status === 'timeout'
                                ? '세션변수 조회 시간이 초과되었습니다. 다시 시도해 주세요.'
                                : `세션변수를 조회하지 못했습니다${xhr.status ? ' (HTTP ' + xhr.status + ')' : ''}. 다시 시도해 주세요.`,
                        ),
                    ),
            });
        });
        if (
            !Array.isArray(sessionRows) ||
            sessionRows.some(
                (row) => !row || typeof row !== 'object' || typeof row.variableId !== 'string',
            )
        )
            throw Error('세션변수 응답을 확인할 수 없습니다.');
        const sessionIds = new Set<string>(sessionRows.map((row) => row.variableId));
        if (!valid()) throw Error('붙여넣을 화면이 변경되었습니다.');
        const anchor = selected[0];
        const parent = payload.position === 'inside' ? anchor : anchor.parent()!;
        if (!parent.append) throw Error('대상 컨테이너의 생성 기능을 사용할 수 없습니다.');
        const targetTables: VisualObject[] = [];
        const tableWalk = (items: VisualObject[]) => {
            for (const t of items) {
                targetTables.push(t);
                if (Array.isArray(t.children)) tableWalk(t.children as VisualObject[]);
            }
        };
        tableWalk(read('selectTableData') ?? []);
        const sequence = read('veuid') as (prefix: string) => string;
        const find = read('getComponentsByAttribute') as (
            attr: string,
            id: string,
        ) => unknown[] | null;
        if (typeof sequence !== 'function' || typeof find !== 'function')
            throw Error('Lamp7의 기존 ID 채번 함수에 연결할 수 없습니다.');
        const reserved = new Map(['id', 'eid', 'vid', 'name'].map((k) => [k, new Set<string>()]));
        for (const m of nodes) {
            const a = m.getAttributes?.() ?? (m.get('attributes') as VisualObject);
            for (const k of reserved.keys()) if (str(a?.[k])) reserved.get(k)!.add(str(a[k]));
            if (m.getEl?.()?.id) reserved.get('id')!.add(m.getEl!()!.id);
        }
        Object.keys(settings).forEach((id) => reserved.get('vid')!.add(id));
        for (const id of Object.keys(images ?? {})) {
            reserved.get('eid')!.add(id);
            reserved.get('eid')!.add(id.replace(/_(pre|suf)$/, ''));
        }
        const eventData = read('_event') as
            | { eventInfos?: Array<{ id?: string; eid?: string }> }
            | undefined;
        for (const event of eventData?.eventInfos ?? [])
            for (const id of [event.id, event.eid]) if (id) reserved.get('eid')!.add(id);
        const occupied = new Map<string, boolean>();
        const exists = (attr: string, id: string) => {
            const key = JSON.stringify([attr, id]);
            if (!occupied.has(key)) occupied.set(key, !!find(attr, id)?.length);
            return occupied.get(key)!;
        };
        const allocate = (
            old: string,
            attr: 'id' | 'eid' | 'vid' | 'name',
            suffixes: string[] = [],
        ) => {
            const taken = reserved.get(attr)!;
            const internal = attr === 'id' || attr === 'vid';
            const prefix = attr === 'id' ? 'genie' : attr === 'vid' ? 'vs' : old;
            let next = internal ? sequence(prefix) : old;
            // Match getUidCheckAttribute's recursive prefix when the original collides.
            if (!internal) {
                let attempts = 0;
                while (sessionIds.has(next) || exists(attr, next)) {
                    if (++attempts > 10000) throw Error('ID 채번 범위를 초과했습니다.');
                    next = sequence(next);
                }
            }
            const attempted = new Set<string>();
            for (let attempts = 0; attempts < 10000; attempts++) {
                if (!next || attempted.has(next)) break;
                attempted.add(next);
                const related = [next, ...suffixes.map((suffix) => next + suffix)];
                // Preserve native DOM lookup semantics (including attribute aliases), without HTTP.
                if (
                    related.every(
                        (id) =>
                            !taken.has(id) &&
                            (internal || (!sessionIds.has(id) && !exists(attr, id))),
                    )
                ) {
                    related.forEach((id) => taken.add(id));
                    return next;
                }
                next = sequence(prefix);
            }
            throw Error(`ID 중복을 해결하지 못했습니다: ${old}`);
        };
        // Internal identifiers are regenerated even when the source screen is different.
        const reserveSourceIds = (node: VisualCopyNode) => {
            for (const attr of ['id', 'vid'])
                if (str(node.attributes[attr])) reserved.get(attr)!.add(str(node.attributes[attr]));
            node.children.forEach(reserveSourceIds);
        };
        clipboard!.roots.forEach((root) => reserveSourceIds(root.node));
        const transform = Function(
            `return (${sources.transform})`,
        )() as typeof transformVisualClipboard;
        const prepared = transform(clipboard!, allocate);
        if (!place(prepared.clipboard.roots, anchor, payload.position ?? 'inside'))
            throw Error(
                '새 ID를 적용한 항목은 이 위치의 드롭 조건에 맞지 않습니다. 다른 위치를 선택해 주세요.',
            );
        result.removedConnections = prepared.removedConnections;
        const all: VisualCopyNode[] = [];
        const collect = (n: VisualCopyNode) => {
            all.push(n);
            n.children.forEach(collect);
        };
        prepared.clipboard.roots.forEach((r) => collect(r.node));
        for (const n of all)
            if (
                str(n.data.type) &&
                editor.DomComponents?.getType &&
                !editor.DomComponents.getType(str(n.data.type))
            )
                throw Error(`대상 화면에서 ${n.data.type} 유형을 사용할 수 없습니다.`);
        const unavailableBinding = (binding: VisualObject) => {
            const dtId = str(binding.dtId ?? binding.dtid);
            const layoutKey = str(binding.tableRelInfo ?? binding.layoutkey);
            const dcId = str(binding.dcId ?? binding.dcid);
            if (!dtId && !layoutKey) return false;
            const table = targetTables.find(
                (t) =>
                    (!dtId || str(t.dtId) === dtId) &&
                    (!layoutKey || str(t.layoutKey) === layoutKey),
            );
            if (!table) return true;
            if (!dcId) return false;
            const known = read('_tableList')?.[layoutKey]?.columns ?? table.columns;
            let columns: unknown = known;
            try {
                if (typeof known === 'string') columns = JSON.parse(known);
            } catch {
                return true;
            }
            if (!columns || typeof columns !== 'object') return true;
            return (
                !Object.hasOwn(columns, dcId) &&
                !Object.values(columns).some(
                    (c) => c && typeof c === 'object' && str((c as VisualObject).dcId) === dcId,
                )
            );
        };
        // Match Lamp7's disconnected-binding fields, on the NEW clipboard snapshot only.
        const bindingFields = [
            'table',
            'column',
            'tableComment',
            'columnComment',
            'pkYn',
            'tableName',
            'columnName',
            'columnTypeName',
            'dtId',
            'dcId',
            'tableRelInfo',
            'essYn',
        ];
        const clearBinding = (setting: VisualObject) => {
            for (const key of bindingFields) if (Object.hasOwn(setting, key)) setting[key] = '';
        };
        const cleanNestedBindings = (value: VisualJson): void => {
            if (Array.isArray(value)) {
                value.forEach(cleanNestedBindings);
                return;
            }
            if (!value || typeof value !== 'object') return;
            if (unavailableBinding(value)) clearBinding(value);
            Object.values(value).forEach(cleanNestedBindings);
        };
        for (const n of all) {
            if ((n.setting && unavailableBinding(n.setting)) || unavailableBinding(n.attributes)) {
                if (n.setting) clearBinding(n.setting);
                for (const key of Object.keys(n.attributes))
                    if (['layoutkey', 'dtid', 'dcid', 'tablerelinfo'].includes(key.toLowerCase()))
                        delete n.attributes[key];
                result.removedConnections = (result.removedConnections ?? 0) + 1;
            }
            // Grid/tree embedded descriptors also carry table/column bindings.
            for (const key of [
                'gridHeaders',
                'treeGridNodes',
                'treeGridNodeImage',
                'chartSetting',
            ]) {
                const value = n.setting?.[key];
                if (typeof value === 'string' && value) {
                    try {
                        const parsed = JSON.parse(value) as VisualJson;
                        cleanNestedBindings(parsed);
                        n.setting![key] = JSON.stringify(parsed);
                    } catch {
                        /* Existing non-JSON display settings are not bindings. */
                    }
                } else if (value) cleanNestedBindings(value);
            }
        }
        const pendingSettings = new Map<string, VisualObject>();
        for (const n of all)
            if (n.setting && str(n.attributes.vid))
                pendingSettings.set(str(n.attributes.vid), n.setting);
        const dataFor = (n: VisualCopyNode): VisualObject => ({
            ...n.data,
            attributes: n.attributes,
            classes: n.classes,
            style: n.style,
            components: n.children.map(dataFor),
        });
        const wrappersFor = Function(
            `return (${sources.wrappers})`,
        )() as typeof visualPasteWrappers;
        const plans = prepared.clipboard.roots.map((r) => wrappersFor(r.node, parent.getEl!()!));
        const wrapperTemplates = plans.map((plan) =>
            plan.map((spec) => {
                const block = read('BlockHelper') as Record<
                    string,
                    (content: string, classes: string) => string
                >;
                const schema = read('componentSetting')?.[`form-${spec.kind}`];
                const defaults = read('getCompoTypeSettingInfo') as (
                    schema: unknown,
                    output: VisualObject,
                ) => void;
                const getUid = read('getUid') as (prefix: string, attribute: string) => string;
                if (
                    !block?.[spec.kind] ||
                    !schema ||
                    typeof defaults !== 'function' ||
                    typeof getUid !== 'function'
                )
                    throw Error(
                        'Lamp7의 Row·Col 생성 설정에 연결할 수 없습니다. 화면을 새로 연 뒤 시도해 주세요.',
                    );
                const template = document.createElement('template');
                template.innerHTML = block[spec.kind]('', spec.classes);
                const element = template.content.firstElementChild;
                if (!element || element.tagName !== 'DIV' || template.content.children.length !== 1)
                    throw Error('Lamp7의 Row·Col 템플릿을 확인할 수 없습니다.');
                // Same schema/defaults and ID helpers as createSettingInfo, restricted to NEW
                // empty wrappers. Reserve the entire copied tree before allocating wrapper IDs.
                const prefix = str(read('enameAbbr')?.[spec.kind]) || spec.kind;
                const eid = allocate(getUid(prefix, 'eid'), 'eid');
                const vid = allocate(getUid('vs', 'vid'), 'vid');
                const id = allocate(getUid(spec.kind, 'id'), 'id');
                const setting: VisualObject = {};
                defaults(schema, setting);
                setting.id = eid;
                const search = parent
                    .getEl?.()
                    ?.closest('.search-container,.unifiedSearch-container');
                if (search?.getAttribute('eid')) {
                    setting.elSearchContainer = search.getAttribute('eid')!;
                    element.setAttribute('elSearchContainer', String(setting.elSearchContainer));
                }
                for (const [key, value] of Object.entries({ id, eid, vid }))
                    element.setAttribute(key, value);
                pendingSettings.set(vid, json(setting));
                return element.outerHTML;
            }),
        );
        document.dispatchEvent(
            new CustomEvent('genie:visual-edit-delete-mutating', {
                detail: { modeId: selection.modeId, requestId: selection.requestId },
            }),
        );
        if (!valid()) throw Error('붙여넣기 전에 화면이 변경되었습니다.');
        bridge.mutating = true;
        ownsMutation = true;
        const initialChildren = new Set(children(parent));
        const insertedSettings = new Set<string>(),
            insertedImages = new Set<string>();
        try {
            for (const [id, value] of pendingSettings) {
                settings[id] = value;
                insertedSettings.add(id);
            }
            if (Object.keys(prepared.clipboard.images).length && !images)
                throw Error('대상 화면의 이미지 저장소를 찾을 수 없습니다.');
            for (const [id, value] of Object.entries(prepared.clipboard.images)) {
                if (images![id] !== undefined) throw Error(`이미지 ID가 이미 사용 중입니다: ${id}`);
                images![id] = value;
                insertedImages.add(id);
            }
            let index =
                payload.position === 'inside'
                    ? children(parent).length
                    : anchor.index() + (payload.position === 'after' ? 1 : 0);
            for (const [rootIndex, root] of prepared.clipboard.roots.entries()) {
                bridge.mutating = false;
                await report(
                    `붙여넣는 중 ${rootIndex} / ${prepared.clipboard.roots.length}`,
                    rootIndex === 0,
                );
                bridge.mutating = true;
                if (!valid()) throw Error('대상 화면이 변경되어 붙여넣기를 중단했습니다.');
                let destination = parent;
                let top: Model | undefined;
                for (const template of wrapperTemplates[rootIndex]) {
                    const added = destination.append(template, {
                        at: destination === parent ? index : 0,
                    });
                    if (!Array.isArray(added) || added.length !== 1)
                        throw Error('Row·Col 생성 결과를 확인할 수 없습니다.');
                    top ??= added[0];
                    destination = added[0];
                }
                const added = destination.append(dataFor(root.node), {
                    at: destination === parent ? index : 0,
                });
                if (!Array.isArray(added) || added.length !== 1)
                    throw Error('생성 결과를 확인할 수 없습니다.');
                result.createdIds!.push((top ?? added[0]).cid);
                index++;
            }
            await report(
                `화면 반영 완료 ${result.createdIds!.length} / ${prepared.clipboard.roots.length}`,
            );
        } catch (error) {
            // Keep actual completed roots; never roll back through hooks that could touch existing data.
            const present = new Set<string>(),
                presentEids = new Set<string>();
            const inspect = (m: Model) => {
                const a = m.getAttributes?.() ?? (m.get('attributes') as VisualObject);
                if (str(a?.vid)) present.add(str(a.vid));
                if (str(a?.eid)) presentEids.add(str(a.eid));
                children(m).forEach(inspect);
            };
            const actual = children(parent).filter((m) => !initialChildren.has(m));
            result.createdIds = actual.map((m) => m.cid);
            actual.forEach(inspect);
            for (const id of insertedSettings) if (!present.has(id)) delete settings[id];
            for (const id of insertedImages)
                if (![...presentEids].some((eid) => [eid, eid + '_pre', eid + '_suf'].includes(id)))
                    delete images![id];
            // Detach links to roots that failed to insert, exclusively on newly created models.
            const actualIds = new Set<string>();
            const collectActual = (m: Model) => {
                actualIds.add(
                    str((m.getAttributes?.() ?? (m.get('attributes') as VisualObject))?.id),
                );
                children(m).forEach(collectActual);
            };
            actual.forEach(collectActual);
            const surviving = {
                ...prepared.clipboard,
                roots: prepared.clipboard.roots.filter((r) =>
                    actualIds.has(str(r.node.attributes.id)),
                ),
            };
            const repaired = transform(surviving, (id) => id).clipboard;
            const attributesById = new Map<string, VisualCopyNode>();
            const collectRepair = (n: VisualCopyNode) => {
                attributesById.set(str(n.attributes.id), n);
                n.children.forEach(collectRepair);
            };
            repaired.roots.forEach((r) => collectRepair(r.node));
            const repair = (m: Model) => {
                const a = m.getAttributes?.() ?? (m.get('attributes') as VisualObject);
                const n = attributesById.get(str(a?.id));
                if (n) {
                    if (n.setting && str(n.attributes.vid))
                        settings[str(n.attributes.vid)] = n.setting;
                    m.setAttributes?.(n.attributes);
                }
                children(m).forEach(repair);
            };
            actual.forEach(repair);
            throw error;
        }
        return result;
    } catch (error) {
        result.error =
            error && typeof error === 'object' && 'message' in error
                ? String(error.message)
                : '복사·붙여넣기 처리 중 오류가 발생했습니다.';
        return result;
    } finally {
        if (bridge && ownsMutation) bridge.mutating = false;
    }
}
