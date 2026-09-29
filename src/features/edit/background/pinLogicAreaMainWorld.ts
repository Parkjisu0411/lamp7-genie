import { DATA_ATTR_LOGIC_AREA_PIN } from '../../../shared/constants';
import { LOGIC_EDITOR_HELPER_SOURCE } from '../../../shared/mainWorld/logicEditorSource';
import type {
    DivTabHostMainWorld,
    MainWorldHelperSubset,
} from '../../../shared/mainWorld/logicTypes';
import { readFrameMemory } from '../../../shared/mainWorld/readFrameMemory';

export type PinLogicAreaResult =
    | { ok: true }
    | { ok: false; error: string };

/** MAIN 주입 결과 — structured clone 가능한 문자열만 */
type PinOutcome = 'ok' | 'no_divtab' | 'no_logic_area';

/**
 * **오직** 페이지의 `$.divTab('.logic_area')` / `jQuery.divTab('.logic_area')` 만 사용한다.
 * divTab 없음·결과 없음 → 폴백 없이 실패.
 */
export async function pinLogicAreaMainWorld(
    tabId: number,
    frameId: number,
    documentId?: string,
): Promise<PinLogicAreaResult> {
    const attr = DATA_ATTR_LOGIC_AREA_PIN;
    const outcome = await readFrameMemory(tabId, frameId, (pinAttr: string, helperSource: string): PinOutcome => {
        const helpers = Function(
            `${helperSource}; return __lamp7GenieMainWorld;`,
        )() as MainWorldHelperSubset<'readBinding'>;
        try {
            document.querySelectorAll(`[${pinAttr}]`).forEach((n) => {
                n.removeAttribute(pinAttr);
            });
        } catch {
            /* noop */
        }

        const unwrap = (raw: unknown): Element | null => {
            if (!raw) return null;
            if (raw instanceof Element) return raw;
            const o = raw as {
                get?: (i: number) => unknown;
                length?: number;
                0?: unknown;
            };
            if (typeof o.get === 'function') {
                const g = o.get(0);
                if (g instanceof Element) return g;
            }
            if (typeof o.length === 'number' && o.length > 0) {
                const first = o[0];
                if (first instanceof Element) return first;
            }
            return null;
        };

        let divTab: ((sel: string) => unknown) | null = null;
        try {
            for (const key of ['$', 'jQuery'] as const) {
                const host = helpers.readBinding(key) as
                    | DivTabHostMainWorld
                    | undefined;
                if (host && typeof host.divTab === 'function') {
                    divTab = host.divTab.bind(host);
                    break;
                }
            }
        } catch {
            return 'no_divtab';
        }

        if (!divTab) return 'no_divtab';

        let logicArea: HTMLElement | null = null;
        try {
            const el = unwrap(divTab('.logic_area'));
            if (el instanceof HTMLElement) logicArea = el;
        } catch {
            return 'no_logic_area';
        }

        if (!logicArea) return 'no_logic_area';

        logicArea.setAttribute(pinAttr, '1');
        return 'ok';
    }, [attr, LOGIC_EDITOR_HELPER_SOURCE], documentId);

    if (outcome === null) {
        return { ok: false, error: '페이지에서 편집 핀을 설정하지 못했습니다.' };
    }
    if (outcome === 'no_divtab') {
        return { ok: false, error: '$.divTab을 사용할 수 없습니다.' };
    }
    if (outcome === 'no_logic_area') {
        return {
            ok: false,
            error: `$.divTab('.logic_area')로 요소를 찾지 못했습니다.`,
        };
    }
    return { ok: true };
}
