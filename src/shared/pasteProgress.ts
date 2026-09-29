import { useEffect, useState } from 'react';
import { isExtensionContextValid } from './extensionContext';
import type { ExtensionMessage } from './types/messages';

export interface PasteProgress {
    modeId: string;
    requestId: string;
    text: string;
}

/** Serialized MAIN helper: yield a task so the compact toolbar can repaint. */
export async function publishPasteProgress(modeId: string, requestId: string, text: string) {
    document.dispatchEvent(
        new CustomEvent('genie:paste-progress', {
            detail: { modeId, requestId, text },
        }),
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 32));
}

export function usePasteProgress(
    sessionId: string | undefined,
    modeId?: string,
    requestId?: string,
) {
    const [progress, setProgress] = useState<PasteProgress>();
    useEffect(() => {
        if (!isExtensionContextValid()) return;
        const receive = (message: ExtensionMessage) => {
            if (
                message.action === 'PASTE_PROGRESS' &&
                message.targetSessionId === sessionId &&
                message.payload.modeId === modeId &&
                message.payload.requestId === requestId
            )
                setProgress(message.payload);
        };
        chrome.runtime.onMessage.addListener(receive);
        return () => {
            try {
                chrome.runtime.onMessage.removeListener(receive);
            } catch {
                /* unloaded */
            }
        };
    }, [sessionId, modeId, requestId]);
    return progress?.modeId === modeId && progress?.requestId === requestId
        ? progress?.text
        : undefined;
}
