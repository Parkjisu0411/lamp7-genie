import { clearLogicAreaPin, mountEdit, unmountEdit } from '../features/edit';
import { beginLogicPaste, clearEditSelection, deselectEditItem } from '../features/edit/controller';
import { activateHighlightById, applyHighlights, clearHighlights } from '../features/search';
import {
    abortVisualDelete,
    beginVisualDelete,
    clearVisualSelection,
    deselectVisualItem,
    endVisualDelete,
    mountVisualEdit,
    stopVisualEdit,
} from '../features/visualEdit/controller';
import { clearVisualSearch, showVisualSearch } from '../features/visualSearch/overlay';
import { isExtensionContextValid } from '../shared/extensionContext';
import { getMessageTarget, setMessageTarget } from '../shared/messaging';
import type { ExtensionMessage, ExtensionResponse } from '../shared/types/messages';

export function registerFrameMessageHandlers(): void {
    if (!isExtensionContextValid()) return;
    const retiredSessions = new Set<string>();
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
        if (!isExtensionContextValid()) return;
        if (message.action === 'TARGET_RESET') {
            if (message.targetSessionId) retiredSessions.add(message.targetSessionId);
            if (retiredSessions.size > 32)
                retiredSessions.delete(retiredSessions.values().next().value!);
            if (!getMessageTarget() || getMessageTarget() === message.targetSessionId) {
                unmountEdit();
                clearHighlights();
                clearVisualSearch();
                stopVisualEdit();
                document.dispatchEvent(
                    new CustomEvent('genie:visual-search-stop', {
                        detail: message.targetSessionId,
                    }),
                );
                setMessageTarget(undefined);
            }
            sendResponse({ success: true } satisfies ExtensionResponse);
            return true;
        }
        if (message.action === 'VISUAL_EDIT_MOUNT') {
            if (!message.targetSessionId || retiredSessions.has(message.targetSessionId)) {
                sendResponse({
                    success: false,
                    error: '대상 화면이 변경되었습니다.',
                } satisfies ExtensionResponse);
                return true;
            }
            setMessageTarget(message.targetSessionId);
            clearVisualSearch();
            const error = mountVisualEdit(message.payload, message.targetSessionId!);
            sendResponse({ success: !error, error } satisfies ExtensionResponse);
            return true;
        }
        if (
            message.action === 'VISUAL_EDIT_DELETE_BEGIN' ||
            message.action === 'VISUAL_EDIT_TRANSFER_BEGIN' ||
            message.action === 'VISUAL_EDIT_DELETE_END' ||
            message.action === 'VISUAL_EDIT_DELETE_ABORT'
        ) {
            if (getMessageTarget() !== message.targetSessionId) {
                sendResponse({
                    success: false,
                    error: '대상 화면이 변경되었습니다.',
                } satisfies ExtensionResponse);
                return true;
            }
            if (
                message.action === 'VISUAL_EDIT_DELETE_BEGIN' ||
                message.action === 'VISUAL_EDIT_TRANSFER_BEGIN'
            ) {
                const data = beginVisualDelete(
                    message.payload,
                    message.action === 'VISUAL_EDIT_TRANSFER_BEGIN'
                        ? message.payload.operation
                        : 'delete',
                );
                sendResponse({
                    success: !!data,
                    data,
                    error: data ? undefined : '선택 항목이 변경되었거나 처리 중입니다.',
                } satisfies ExtensionResponse);
            } else if (message.action === 'VISUAL_EDIT_DELETE_END') {
                sendResponse({
                    success: endVisualDelete(
                        message.payload.modeId,
                        message.payload.requestId,
                        message.payload.result,
                    ),
                } satisfies ExtensionResponse);
            } else {
                abortVisualDelete(message.payload.modeId, message.payload.requestId);
                sendResponse({ success: true } satisfies ExtensionResponse);
            }
            return true;
        }
        if (
            message.action === 'VISUAL_EDIT_STOP' ||
            message.action === 'VISUAL_EDIT_CLEAR' ||
            message.action === 'VISUAL_EDIT_DESELECT'
        ) {
            if (getMessageTarget() === message.targetSessionId) {
                if (message.action === 'VISUAL_EDIT_STOP') stopVisualEdit(message.payload.modeId);
                else if (message.action === 'VISUAL_EDIT_DESELECT')
                    deselectVisualItem(message.payload.modeId, message.payload.modelId);
                else clearVisualSelection(message.payload.modeId);
            }
            sendResponse({ success: true } satisfies ExtensionResponse);
            return true;
        }
        if (message.action === 'VISUAL_SEARCH_PRESENT') {
            setMessageTarget(message.targetSessionId);
            const notice = showVisualSearch(message.payload, message.targetSessionId!);
            sendResponse({ success: true, data: { notice } } satisfies ExtensionResponse);
            return true;
        }
        if (message.action === 'VISUAL_SEARCH_CLEAR') {
            if (!getMessageTarget() || getMessageTarget() === message.targetSessionId) {
                clearVisualSearch();
                document.dispatchEvent(
                    new CustomEvent('genie:visual-search-stop', {
                        detail: message.targetSessionId,
                    }),
                );
            }
            sendResponse({ success: true } satisfies ExtensionResponse);
            return true;
        }
        if (message.action === 'EDIT_PASTE_MOUNT') {
            if (!message.targetSessionId || retiredSessions.has(message.targetSessionId)) {
                sendResponse({ success: false, error: '대상 화면이 변경되었습니다.' });
                return true;
            }
            setMessageTarget(message.targetSessionId);
            const ok = mountEdit(message.payload);
            if (!ok) clearLogicAreaPin();
            sendResponse({
                success: ok,
                error: ok ? undefined : '로직 영역이 보이지 않습니다. 처리로직 탭을 열고 화면 분할선을 조절한 뒤 다시 시도해 주세요.',
            });
            return true;
        }
        if (message.action === 'EDIT_PASTE_BEGIN') {
            const data =
                getMessageTarget() === message.targetSessionId
                    ? beginLogicPaste(message.payload)
                    : undefined;
            sendResponse({ success: !!data, data });
            return true;
        }
        if (message.action === 'EDIT_START' || message.action === 'HIGHLIGHT_TARGETS') {
            setMessageTarget(message.targetSessionId);
        }
        if (
            [
                'EDIT_STOP',
                'EDIT_CLEAR',
                'EDIT_DESELECT',
                'SEARCH_NAVIGATE',
                'SEARCH_CLEAR',
            ].includes(message.action) &&
            getMessageTarget() !== message.targetSessionId
        ) {
            sendResponse({
                success: false,
                error: '대상 화면이 변경되었습니다.',
            } satisfies ExtensionResponse);
            return true;
        }
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
                    : '로직 영역이 보이지 않습니다. 처리로직 탭을 열고 화면 분할선을 조절한 뒤 다시 시도해 주세요.',
            } satisfies ExtensionResponse);
            return true;
        }

        if (message.action === 'EDIT_CLEAR' || message.action === 'EDIT_DESELECT') {
            if (message.action === 'EDIT_CLEAR') clearEditSelection();
            else deselectEditItem(message.payload.logicId);
            sendResponse({ success: true } satisfies ExtensionResponse);
            return true;
        }
        if (message.action === 'EDIT_STOP') {
            unmountEdit({ notifyInactive: true, modeId: message.modeId });
            sendResponse({ success: true } satisfies ExtensionResponse);
            return true;
        }
    });
}
