import { sendRuntimeMessageQuietly } from '../shared/messaging';
import type { PasteProgress } from '../shared/pasteProgress';

export function registerPasteProgress() {
    document.addEventListener('genie:paste-progress', (event) => {
        const data = (event as CustomEvent<Partial<PasteProgress>>).detail;
        if (
            !data ||
            typeof data.modeId !== 'string' ||
            typeof data.requestId !== 'string' ||
            typeof data.text !== 'string' ||
            data.text.length > 120
        )
            return;
        sendRuntimeMessageQuietly({
            action: 'PASTE_PROGRESS',
            payload: {
                modeId: data.modeId,
                requestId: data.requestId,
                text: data.text,
            },
        });
    });
}
