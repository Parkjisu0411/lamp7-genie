/**
 * 특정 프레임의 MAIN world에서 함수를 실행하고 structured-clone 가능한 결과를 반환.
 *
 * 주의사항:
 * - fn은 직렬화되어 주입되므로 외부 import/클로저 참조가 불가하다.
 * - fn 내부에서는 chrome.* API에 접근할 수 없다.
 * - 반환값은 DOM element, 함수, 클래스 인스턴스가 아닌 plain data여야 한다.
 */
export async function readFrameMemory<TArgs extends unknown[], TResult>(
    tabId: number,
    frameId: number,
    fn: (...args: TArgs) => TResult,
    args: TArgs,
    documentId?: string,
): Promise<TResult | null> {
    try {
        const [injectionResult] = await chrome.scripting.executeScript({
            target: documentId ? { tabId, documentIds: [documentId] } : { tabId, frameIds: [frameId] },
            world: 'MAIN',
            func: fn as (...args: unknown[]) => unknown,
            args: args as unknown[],
        });
        if (!injectionResult) {
            console.warn('[lamp7-genie] readFrameMemory: empty injection result', {
                tabId,
                frameId,
            });
            return null;
        }
        return (injectionResult.result as TResult) ?? null;
    } catch (err) {
        console.warn('[lamp7-genie] readFrameMemory failed', { tabId, frameId, err });
        return null;
    }
}

/**
 * 개발/탐색용: 대상 프레임의 window 객체에서 사용자 전역으로 보이는 항목을 스캔한다.
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
                    // cross-origin 등 접근 불가능한 항목은 건너뜀
                }
            }
            return out;
        },
        [],
    );
}
