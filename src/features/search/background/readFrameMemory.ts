/**
 * 특정 프레임의 MAIN world에서 함수를 실행하고 structured-clone된 결과를 반환.
 *
 * 주의사항:
 * - fn은 직렬화되어 주입되므로 외부 클로저/import 참조 불가.
 *   필요한 값은 반드시 args로 넘길 것.
 * - fn 내부에서는 chrome.* API 접근 불가 (MAIN world는 페이지 컨텍스트).
 * - 리턴값은 structured clone 대상 - DOM element, 함수, 클래스 인스턴스 등은 불가.
 *   DOM을 넘겨야 하면 element에 data-* attribute를 부여하고 key(string)만 리턴할 것.
 */
export async function readFrameMemory<TArgs extends unknown[], TResult>(
    tabId: number,
    frameId: number,
    fn: (...args: TArgs) => TResult,
    args: TArgs,
): Promise<TResult | null> {
    try {
        const [injectionResult] = await chrome.scripting.executeScript({
            target: { tabId, frameIds: [frameId] },
            world: 'MAIN',
            func: fn as (...args: unknown[]) => unknown,
            args: args as unknown[],
        });
        return (injectionResult?.result as TResult) ?? null;
    } catch (err) {
        console.warn('[lamp7-genie] readFrameMemory failed', err);
        return null;
    }
}

/**
 * 개발/탐색용: 대상 프레임의 window 객체에서 "흥미로워 보이는" 전역을 덤프.
 * - 일반적인 브라우저 빌트인은 휴리스틱으로 제외
 * - 배열/함수/비-object는 타입만 표기
 */
export async function dumpFrameGlobals(
    tabId: number,
    frameId: number,
): Promise<Record<string, string> | null> {
    return readFrameMemory(
        tabId,
        frameId,
        () => {
            const BUILTIN_PREFIX = /^(webkit|on|chrome|navigator|document|location|history|screen|console|performance|caches|crypto|indexedDB|localStorage|sessionStorage|fetch|XMLHttpRequest|WebSocket|Request|Response|Headers|Blob|File|URL|URLSearchParams|Worker|SharedWorker|Notification|requestAnimationFrame|cancelAnimationFrame|requestIdleCallback|cancelIdleCallback|setTimeout|setInterval|clearTimeout|clearInterval|queueMicrotask|structuredClone|atob|btoa)/i;
            const BUILTIN_EXACT = new Set([
                'window', 'self', 'top', 'parent', 'frames', 'length', 'closed', 'name',
                'status', 'defaultStatus', 'screenX', 'screenY', 'innerWidth', 'innerHeight',
                'outerWidth', 'outerHeight', 'scrollX', 'scrollY', 'pageXOffset', 'pageYOffset',
                'devicePixelRatio', 'visualViewport', 'speechSynthesis', 'origin', 'isSecureContext',
                'crossOriginIsolated', 'trustedTypes', 'customElements', 'external',
                'clientInformation', 'styleMedia', 'menubar', 'toolbar', 'locationbar',
                'personalbar', 'scrollbars', 'statusbar', 'globalThis',
            ]);

            const out: Record<string, string> = {};
            for (const key of Object.getOwnPropertyNames(window)) {
                if (BUILTIN_EXACT.has(key)) continue;
                if (BUILTIN_PREFIX.test(key)) continue;
                try {
                    const v = (window as unknown as Record<string, unknown>)[key];
                    if (v === null || v === undefined) continue;
                    const t = typeof v;
                    if (t === 'object') {
                        out[key] = Array.isArray(v) ? `Array(${(v as unknown[]).length})` : 'object';
                    } else {
                        out[key] = t;
                    }
                } catch {
                    // cross-origin 등으로 접근 불가한 항목은 건너뜀
                }
            }
            return out;
        },
        [],
    );
}
