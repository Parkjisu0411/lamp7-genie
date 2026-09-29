import type { ExtensionMessage, ExtensionResponse } from '../shared/types/messages';

export async function safeSendToTopFrame(
    tabId: number,
    message: ExtensionMessage,
): Promise<void> {
    try {
        await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
    } catch {
        /* noop */
    }
}

export function sendToFrame(
    tabId: number,
    frameId: number,
    message: ExtensionMessage,
    documentId?: string,
): Promise<ExtensionResponse> {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(
            tabId,
            message,
            documentId ? { documentId } : { frameId },
            (response: ExtensionResponse | undefined) => {
                if (chrome.runtime.lastError) {
                    resolve({
                        success: false,
                        error: chrome.runtime.lastError.message,
                    });
                    return;
                }
                resolve(response ?? { success: true });
            },
        );
    });
}
