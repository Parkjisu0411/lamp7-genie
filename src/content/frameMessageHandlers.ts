import { clearLogicAreaPin, mountEdit, unmountEdit } from '../features/edit';
import {
    activateHighlightById,
    applyHighlights,
    clearHighlights,
} from '../features/search';
import { isExtensionContextValid } from '../shared/extensionContext';
import type { ExtensionMessage, ExtensionResponse } from '../shared/types/messages';

export function registerFrameMessageHandlers(): void {
    if (!isExtensionContextValid()) return;
    chrome.runtime.onMessage.addListener(
        (message: ExtensionMessage, _sender, sendResponse) => {
            if (!isExtensionContextValid()) return;
            if (message.action === 'HIGHLIGHT_TARGETS') {
                const matches = message.payload.matches;
                applyHighlights(matches);
                sendResponse({
                    success: true,
                    data: { count: matches.length, matches },
                } satisfies ExtensionResponse);
                return true;
            }

            if (message.action === 'SEARCH_NAVIGATE') {
                const matchId = message.payload.matchId;
                activateHighlightById(matchId);
                sendResponse({ success: true } satisfies ExtensionResponse);
                return true;
            }

            if (message.action === 'SEARCH_CLEAR') {
                clearHighlights();
                sendResponse({ success: true } satisfies ExtensionResponse);
                return true;
            }

            if (message.action === 'EDIT_START') {
                const ok = mountEdit();
                if (!ok) clearLogicAreaPin();
                sendResponse({
                    success: ok,
                    error: ok
                        ? undefined
                        : 'seq 편집 영역(.logic_seq_area / ul > li)을 찾을 수 없습니다.',
                } satisfies ExtensionResponse);
                return true;
            }

            if (message.action === 'EDIT_STOP') {
                unmountEdit({ notifyInactive: true });
                sendResponse({ success: true } satisfies ExtensionResponse);
                return true;
            }
        },
    );
}
