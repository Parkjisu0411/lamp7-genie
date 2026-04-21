import {
    DATA_ATTR_TARGET_ID,
    HIGHLIGHT_ACTIVE_CLASS,
    HIGHLIGHT_CLASS,
    HIGHLIGHT_STYLE_ID,
} from '../../shared/constants';
import type { SearchMatch } from '../../shared/types/messages';

// ISOLATED world(content script)에서 돌아감.
// MAIN world에서 queryFrameData가 이미 data-genie-target-id="<id>"를 DOM에 부여했다는 전제.
// 이 파일은 그 DOM을 찾아 CSS class 토글로 하이라이트만 담당.

function injectStyles() {
    if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = HIGHLIGHT_STYLE_ID;
    style.textContent = `
    .${HIGHLIGHT_CLASS} {
      background-color: #ffeb3b !important;
      border-radius: 2px;
      transition: background-color 0.15s;
    }
    .${HIGHLIGHT_ACTIVE_CLASS} {
      background-color: #ff9800 !important;
    }
  `;
    document.head.appendChild(style);
}

function queryById(id: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(
        `[${DATA_ATTR_TARGET_ID}="${CSS.escape(id)}"]`,
    );
}

export function applyHighlights(matches: SearchMatch[]) {
    clearHighlights({ keepDataAttr: true });
    injectStyles();
    for (const m of matches) {
        const el = queryById(m.id);
        if (el) el.classList.add(HIGHLIGHT_CLASS);
    }
    if (matches.length > 0) {
        activateHighlightById(matches[0].id);
    }
}

/**
 * 하이라이트 제거.
 * - 기본: data-genie-target-id attribute까지 정리해서 다음 검색을 깨끗한 상태에서 시작
 * - keepDataAttr: applyHighlights 내부에서 스타일만 재설정할 때 사용
 */
export function clearHighlights(opts: { keepDataAttr?: boolean } = {}) {
    document
        .querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}, .${HIGHLIGHT_ACTIVE_CLASS}`)
        .forEach((el) => {
            el.classList.remove(HIGHLIGHT_CLASS);
            el.classList.remove(HIGHLIGHT_ACTIVE_CLASS);
        });
    if (!opts.keepDataAttr) {
        document
            .querySelectorAll<HTMLElement>(`[${DATA_ATTR_TARGET_ID}]`)
            .forEach((el) => el.removeAttribute(DATA_ATTR_TARGET_ID));
    }
}

export function activateHighlightById(id: string) {
    document
        .querySelectorAll<HTMLElement>(`.${HIGHLIGHT_ACTIVE_CLASS}`)
        .forEach((el) => el.classList.remove(HIGHLIGHT_ACTIVE_CLASS));
    const target = queryById(id);
    if (!target) return;
    target.classList.add(HIGHLIGHT_ACTIVE_CLASS);
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
