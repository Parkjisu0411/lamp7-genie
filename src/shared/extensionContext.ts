/** 확장 재로드/제거 후 옛 content script가 chrome.* 호출 시 컨텍스트가 무효화됨 */

export function isExtensionContextValid(): boolean {
    try {
        return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
    } catch {
        return false;
    }
}

export function isExtensionContextInvalidatedError(err: unknown): boolean {
    const msg =
        err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : '';
    return msg.includes('Extension context invalidated');
}

/** storage / sendMessage 등 Promise API — 무효 컨텍스트면 조용히 포기 */
export async function withExtensionContext<T>(
    run: () => Promise<T>,
    fallback: T,
): Promise<T> {
    if (!isExtensionContextValid()) return fallback;
    try {
        return await run();
    } catch (err) {
        if (isExtensionContextInvalidatedError(err)) return fallback;
        throw err;
    }
}
