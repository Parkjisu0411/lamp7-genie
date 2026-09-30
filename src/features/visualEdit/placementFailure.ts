import type { PlacementModel, visualPlacement, VisualPlacementIssue } from './placement';
import type { VisualClipboard, VisualCopyNode, VisualPastePosition } from './transferTypes';

/** MAIN-safe, read-only. Called only when the whole bundle has no valid destination.
 * Diagnose with the same predicate used to permit insertion, never relaxed rules.
 */
export function explainVisualPlacementFailure(
    roots: VisualClipboard['roots'],
    candidates: Array<{ model: PlacementModel; position: VisualPastePosition }>,
    place: typeof visualPlacement,
    probes: Map<VisualCopyNode, HTMLElement>,
): string {
    const clean = (value: unknown, limit = 40) => {
        const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
        return text.length > limit ? text.slice(0, limit) + '…' : text;
    };
    const name = (root: VisualClipboard['roots'][number]) => {
        const id = clean(root.eid || root.node.attributes.eid, 64);
        const type = clean(root.type || root.node.data.type);
        let label = clean(root.label);
        if (label === id || label.toLowerCase() === type.toLowerCase()) label = '';
        // A layout Col often has no caption of its own. A single copied label is
        // useful, but do not turn a multi-field container's first child into its name.
        if (!label && root.node.classes.includes('form-col')) {
            const captions: string[] = [];
            const visit = (node: VisualCopyNode) => {
                if (node.classes.includes('col-form-label') || node.data.type === 'label') {
                    const caption = clean(node.setting?.name || node.data.content);
                    if (caption && !/[<>]/.test(caption)) captions.push(caption);
                } else node.children.forEach(visit);
            };
            visit(root.node);
            if (new Set(captions).size === 1) label = captions[0];
        }
        return label ? `${label}${id ? ` (${id})` : ''}` : id || type || '항목';
    };
    const list = (items: typeof roots) =>
        items.slice(0, 4).map(name).join(', ') +
        (items.length > 4 ? ` 외 ${items.length - 4}개` : '');
    const searchOnly = (root: (typeof roots)[number]) => {
        const rule = root.placement?.draggable;
        const selectors = (Array.isArray(rule) ? rule : typeof rule === 'string' ? [rule] : [])
            .flatMap((value) => value.split(','))
            .map((value) => value.trim());
        // Known positive selectors only: :not(.search-col) must never be
        // misreported as a search-only rule. Unknown selectors use actual targets.
        return (
            selectors.length > 0 &&
            selectors.every((value) =>
                [
                    '.search-form-wrapper',
                    '.search-row-add',
                    '.search-col-add',
                    '.container-content.search-col',
                    '.container-content.search-col-add',
                    '.search-row.search-form-wrapper',
                ].includes(value),
            )
        );
    };
    const destination = (model: PlacementModel, position: VisualPastePosition) => {
        const parent = position === 'inside' ? model : model.parent?.();
        const el = parent?.getEl?.();
        if (!el?.classList) return '영역';
        if (el.classList.contains('container-fluid')) return '최상위';
        if (el.closest('.search-container,.unifiedSearch-container,.search-col,.search-row'))
            return '검색영역';
        const type =
            el.classList.contains('form-row') || parent?.get('type') === 'row'
                ? 'Row'
                : el.classList.contains('form-col') || parent?.get('type') === 'col'
                  ? 'Col'
                  : '컨테이너';
        const id = clean(el.getAttribute('eid'), 40);
        return id ? `${type} ${id}` : type;
    };
    const allowed = roots.map(() => new Set<string>());
    let best:
        | {
              count: number;
              rank: number;
              reasons: Array<VisualPlacementIssue | undefined>;
              candidate: (typeof candidates)[number];
          }
        | undefined;
    for (const candidate of candidates) {
        let count = 0;
        const reasons = roots.map((root, index) => {
            const issues: VisualPlacementIssue[] = [];
            if (place([root], candidate.model, candidate.position, probes, issues)) {
                count++;
                if (allowed[index].size < 2)
                    allowed[index].add(destination(candidate.model, candidate.position));
                return undefined;
            }
            return issues[0];
        });
        const rank = Math.max(
            -1,
            ...reasons.map((issue) =>
                !issue
                    ? -1
                    : ['unavailable', 'dependent', 'source-rule'].includes(issue.code)
                      ? 0
                      : issue.code === 'target-rule'
                        ? 1
                        : issue.code === 'target-locked'
                          ? 2
                          : 3,
            ),
        );
        if (!best || count > best.count || (count === best.count && rank > best.rank))
            best = { count, rank, reasons, candidate };
    }
    if (!best) return '붙여넣을 편집 영역을 찾을 수 없습니다. 화면을 확인해 주세요.';
    let rejected = roots.filter((_, index) => !!best!.reasons[index]);
    const issues = best.reasons.filter((issue): issue is VisualPlacementIssue => !!issue);
    if (!rejected.length) {
        // All items fit separately, but their combination can violate a Row rule.
        place(roots, best.candidate.model, best.candidate.position, probes, issues);
        rejected = roots.filter((root) =>
            issues.some((issue) => issue.rootKeys.includes(root.node.key)),
        );
    }
    const blocked = roots.filter((_, index) => !allowed[index].size);
    const specific: Partial<Record<VisualPlacementIssue['code'], string>> = {
        'repeat-row': '반복컨테이너와 다른 컨테이너는 같은 Row에 놓을 수 없습니다.',
        'nested-repeat': '반복컨테이너 안에는 반복컨테이너를 넣을 수 없습니다.',
        'repeat-comment': '댓글은 반복컨테이너 안에 넣을 수 없습니다.',
        'cascader-child': 'Cascader 노드 대신 Cascader 전체를 복사해 주세요.',
        'search-first-row': '검색영역의 첫 번째 위치에는 Row를 넣을 수 없습니다.',
        'search-input': '검색 Input은 검색영역이나 Grid 안에 넣을 수 없습니다.',
        'linked-form': '데이터가 연결된 항목은 이 영역에 배치할 수 없습니다.',
    };
    const reason = issues.find(
        (issue) =>
            !!specific[issue.code] &&
            (!blocked.length || blocked.some((root) => issue.rootKeys.includes(root.node.key))),
    );
    if (reason) {
        const items = roots.filter((root) => reason.rootKeys.includes(root.node.key));
        return (
            `${list(items)}\n${specific[reason.code]}` +
            (reason.code === 'cascader-child'
                ? ''
                : '\n항목을 나누거나 다른 영역이 있는 화면에서 붙여넣어 주세요.')
        );
    }
    const searchItems = roots.filter(searchOnly);
    if (searchItems.length && (!blocked.length || blocked.every(searchOnly))) {
        const items = blocked.length ? blocked : searchItems;
        return (
            `${blocked.length ? '붙여넣을 수 있는 검색영역이 없습니다.' : '함께 붙여넣을 공통 위치가 없습니다.'}\n` +
            `${list(items)}: 검색영역 안에만 배치할 수 있습니다.\n` +
            (blocked.length
                ? '편집 가능한 검색영역에서 다시 시도해 주세요.'
                : '이 항목들을 나누어 복사해 주세요.')
        );
    }
    if (blocked.length) {
        const locked = blocked.every(
            (root) => best!.reasons[roots.indexOf(root)]?.code === 'target-locked',
        );
        return (
            `${list(blocked)}: 현재 화면에 허용된 붙여넣기 위치가 없습니다.\n` +
            (locked
                ? '대상 영역은 내부 항목 추가를 허용하지 않습니다. 다른 영역에서 다시 시도해 주세요.'
                : '해당 항목이 들어갈 영역을 확인하거나, 상위 컨테이너와 함께 복사해 주세요.')
        );
    }
    // Unknown/custom rules: report observed usable destinations, not raw CSS or
    // a guessed global restriction. Show one conflicting item from each side.
    const examples = [rejected[0], roots.find((root) => !rejected.includes(root))].filter(
        (root): root is (typeof roots)[number] => !!root,
    );
    const details = examples.map(
        (root) => `${name(root)} → ${[...allowed[roots.indexOf(root)]].join(' / ')}`,
    );
    return `함께 붙여넣을 공통 위치가 없습니다.\n${details.join('\n')}\n항목을 나누어 복사해 주세요.`;
}
