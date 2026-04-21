import { DATA_ATTR_LOGIC_AREA_PIN } from '../../shared/constants';

/** seq `li`별 안정 키. id 없으면 인덱스(추후 LogicEditor 연동 시 seq 순서 참고용). */
export function seqItemKey(li: HTMLLIElement, index: number): string {
    const id = li.id?.trim();
    if (id) return id;
    return `__genie_seq:${index}`;
}

export interface EditDomBundle {
    wrap: HTMLElement;
    seqArea: HTMLElement;
    seqUl: HTMLUListElement;
    seqItems: HTMLLIElement[];
    /** $.divTab 핀 위치 — seq 열(형제/조상) 탐색용. 본문 logic 행과는 아직 짝지 않음 */
    logicArea: HTMLElement;
}

function findSeqAreaForLogicArea(logicArea: HTMLElement): HTMLElement | null {
    const prev = logicArea.previousElementSibling;
    if (prev instanceof HTMLElement && prev.classList.contains('logic_seq_area')) {
        return prev;
    }
    const parent = logicArea.parentElement;
    if (parent) {
        const kids = Array.from(parent.children);
        const idx = kids.indexOf(logicArea);
        for (let i = idx - 1; i >= 0; i--) {
            const c = kids[i];
            if (c instanceof HTMLElement && c.classList.contains('logic_seq_area')) return c;
        }
        const scoped = parent.querySelector<HTMLElement>(':scope > .logic_seq_area');
        if (scoped) return scoped;
    }
    const wrap = logicArea.closest('.logic_wrap');
    if (wrap) {
        const inWrap = wrap.querySelector<HTMLElement>('.logic_seq_area');
        if (inWrap) return inWrap;
    }
    return null;
}

function listSeqItems(seqUl: HTMLUListElement): HTMLLIElement[] {
    const scoped = Array.from(seqUl.querySelectorAll<HTMLLIElement>(':scope > li'));
    if (scoped.length > 0) return scoped;
    return Array.from(seqUl.children).filter(
        (n): n is HTMLLIElement => n instanceof HTMLLIElement && n.tagName === 'LI',
    );
}

function buildEditDomBundle(
    wrap: HTMLElement,
    seqArea: HTMLElement,
    logicArea: HTMLElement,
): EditDomBundle | null {
    const seqUl = seqArea.querySelector<HTMLUListElement>('ul');
    if (!seqUl) return null;

    const seqItems = listSeqItems(seqUl);
    if (seqItems.length === 0) return null;

    return { wrap, seqArea, seqUl, seqItems, logicArea };
}

/** 현재 문서 + 접근 가능한 같은 출처 iframe(중첩). 핀 제거·탐색에 공통 사용 */
export function collectSameOriginDocuments(root: Document): Document[] {
    const out: Document[] = [];
    const seen = new Set<Document>();
    const stack: Document[] = [root];
    while (stack.length > 0) {
        const d = stack.pop()!;
        if (seen.has(d)) continue;
        seen.add(d);
        out.push(d);
        for (const iframe of d.querySelectorAll('iframe')) {
            try {
                const inner = iframe.contentDocument;
                if (inner) stack.push(inner);
            } catch {
                /* cross-origin */
            }
        }
    }
    return out;
}

/**
 * 표식이 꽂인 `.logic_area` 근처에서 seq 열(`ul > li`)만 찾는다.
 * 본문 logic DOM과의 정합 검증은 하지 않음(추후 LogicEditor).
 */
export function findEditDom(): EditDomBundle | null {
    for (const doc of collectSameOriginDocuments(document)) {
        const pinned = doc.querySelector<HTMLElement>(`[${DATA_ATTR_LOGIC_AREA_PIN}]`);
        if (!pinned) continue;

        const seqArea = findSeqAreaForLogicArea(pinned);
        if (!seqArea) continue;

        const wrap =
            pinned.closest<HTMLElement>('.logic_wrap') ?? pinned.parentElement ?? pinned;
        const bundle = buildEditDomBundle(wrap, seqArea, pinned);
        if (bundle) return bundle;
    }
    return null;
}
