import type { VisualClipboard, VisualCopyNode, VisualPastePosition } from './transferTypes';

interface PlacementModel {
    get(key: string): unknown;
    getEl?(): HTMLElement | undefined;
    parent?(): PlacementModel | undefined;
    index?(): number;
}

/** MAIN-safe. GrapesJS 0.14.66 validTarget plus Lamp7's read-only drop guards. */
export function visualPlacement(
    roots: VisualClipboard['roots'],
    target: PlacementModel | undefined,
    position: VisualPastePosition,
    probes?: Map<VisualCopyNode, HTMLElement>,
): boolean {
    const parent = position === 'inside' ? target : target?.parent?.();
    const el = parent?.getEl?.();
    if (!roots.length || !parent || !el?.isConnected || !el.classList || !parent.get('components')) return false;
    // These structures are edited as a whole by Genie. Native grid-cell moves also rebuild
    // repeated rows, so direct append into one physical cell is not a valid clipboard operation.
    if (
        el.closest(
            '.grid-compo,.tree-container,.manual-tree-container,.duration-date-compo,.dataselect-compo,.inputgroup-compo,.radio-compo,.checkbox-compo,.dropdown-compo,.cascader-container,.repeat-radio-compo,.repeat-checkbox-compo',
        )
    )
        return false;
    const match = (element: Element, rule: unknown) => {
        if (Array.isArray(rule)) rule = rule.join(', ');
        if (typeof rule !== 'string') return !!rule;
        try {
            return element.matches(rule);
        } catch {
            return false;
        }
    };
    const children = (parent.get('components') as { models?: PlacementModel[] }).models ?? [];
    const repeat = !!el.closest('.repeat-container');
    const has = (n: VisualCopyNode, c: string): boolean => n.classes.includes(c);
    const includes = (n: VisualCopyNode, c: string): boolean =>
        has(n, c) || n.children.some((child) => includes(child, c));
    // Native checks this after insertion. Count the entire bundle BEFORE inserting any root.
    if (
        el.classList.contains('form-row') &&
        roots.some((r) => has(r.node, 'default-container') || has(r.node, 'repeat-container'))
    ) {
        const containers = [
            ...children.map((m) => {
                const view = m.getEl?.();
                return {
                    container: !!view?.classList?.contains('default-container'),
                    repeat: !!view?.classList?.contains('repeat-container'),
                };
            }),
            ...roots.map((r) => ({
                container: has(r.node, 'default-container'),
                repeat: has(r.node, 'repeat-container'),
            })),
        ];
        if (containers.filter((c) => c.container).length > 1 && containers.some((c) => c.repeat))
            return false;
    }
    return roots.every((root) => {
        const n = root.node;
        const draggable = root.placement?.draggable;
        if (!match(el, draggable)) return false;
        // Detached DOM is only a CSS-selector probe, never an editor model or live canvas node.
        let probe = probes?.get(n);
        if (!probe) {
            const probeDocument = el.ownerDocument.implementation.createHTMLDocument('');
            probe = probeDocument.createElement(String(n.data.tagName || 'div'));
            for (const [key, value] of Object.entries(n.attributes)) {
                if (value != null && !/^on/i.test(key)) {
                    try {
                        probe.setAttribute(key, String(value));
                    } catch {
                        /* malformed attribute */
                    }
                }
            }
            probe.className = n.classes.join(' ');
            // :empty matters to native selectors. A text node suffices for non-empty content.
            if (n.children.length || n.data.content) probe.textContent = 'content';
            probes?.set(n, probe);
        }
        const droppable = parent.get('droppable');
        if (
            !(root.placement?.textable && parent.get('type') === 'text') &&
            !match(probe, droppable)
        )
            return false;
        if (
            repeat &&
            (((has(n, 'repeat-container') || has(n, 'default-container') || has(n, 'form-row')) &&
                includes(n, 'repeat-container')) ||
                has(n, 'comment-container'))
        )
            return false;
        if (has(n, 'form-row') && el.classList.contains('search-container')) {
            const index =
                position === 'inside'
                    ? children.length
                    : (target?.index?.() ?? children.indexOf(target!)) +
                      (position === 'after' ? 1 : 0);
            if (index === 0) return false;
        }
        if (
            has(n, 'input-search-compo') &&
            el.closest('.search-container,.unifiedSearch-container,.grid-compo')
        )
            return false;
        if (n.attributes.layoutkey) {
            const searchForm =
                [
                    'input-compo',
                    'radio-compo',
                    'checkbox-compo',
                    'select-compo',
                    'date-compo',
                    'time-compo',
                    'datetime-compo',
                    'dataselect-compo',
                    'inputgroup-compo',
                ].some((c) => has(n, c)) && !has(n, 'page-option');
            const inner =
                [
                    'input-compo',
                    'radio-compo',
                    'checkbox-compo',
                    'select-compo',
                    'date-compo',
                    'time-compo',
                    'datetime-compo',
                    'text-compo',
                ].some((c) => has(n, c)) &&
                !has(n, 'page-option') &&
                !has(n, 'tit-h2') &&
                !has(n, 'tit-sub');
            const form =
                searchForm ||
                [
                    'col-form-label',
                    'value-compo',
                    'textarea-compo',
                    'html-compo',
                    'attach-compo',
                    'id-compo',
                    'duration-date-compo',
                    'duration-date-value-compo',
                    'img-compo',
                ].some((c) => has(n, c));
            if (
                form &&
                ((parent.get('type') === 'search-inner-div' && !searchForm) ||
                    (el.classList.contains('tab-name') && !inner))
            )
                return false;
        }
        return true;
    });
}

/** The Row/Col construction branches of Lamp7 drawElement, without source removal or labels. */
export function visualPasteWrappers(
    node: VisualCopyNode,
    parent: HTMLElement,
): Array<{ kind: 'row' | 'col'; classes: string }> {
    const has = (c: string) => node.classes.includes(c);
    const outer = parent.matches('.container-fluid,.container-content');
    const row = parent.matches('.form-row');
    const search = parent.matches('.search-col,.search-row');
    const container = [
        'default-container',
        'search-container',
        'group-container',
        'tab-group-container',
        'sub-screen-tab-group-container',
        'form-col',
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
    const control = multi || ['grid-compo', 'page-info', 'pagination', 'tree-list-node'].some(has);
    const result: Array<{ kind: 'row' | 'col'; classes: string }> = [];
    if (outer && (container || control))
        result.push({ kind: 'row', classes: search ? 'search-row search-row-add' : '' });
    if ((outer || row) && control && !container)
        result.push({
            kind: 'col',
            classes: [
                has('col-form-label') ? 'label-col' : form ? 'value-col' : '',
                multi ? 'multi-col' : '',
                search ? 'search-col search-col-add' : '',
            ]
                .filter(Boolean)
                .join(' '),
        });
    return result;
}
