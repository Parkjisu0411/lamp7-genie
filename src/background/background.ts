import type { ExtensionMessage, ExtensionResponse } from '../shared/types/messages';
import { handleEditMessage } from './handlers/editMessages';
import { handlePanelMessage } from './handlers/panelMessages';
import { handleSearchMessage } from './handlers/searchMessages';
import { safeSendToTopFrame, sendToFrame } from './messaging';
import { getCurrentTarget, removeTabTarget, refreshTabTarget, syncTabTargetState } from './targetState';
import { handleVisualSearchMessage } from './handlers/visualSearchMessages';
import { cancelVisualEdit, handleVisualEditMessage } from './handlers/visualEditMessages';

const debouncedSyncByTab = new Map<number, ReturnType<typeof setTimeout>>();

function scheduleSyncTabTargetState(tabId: number): void {
    const prev = debouncedSyncByTab.get(tabId);
    if (prev !== undefined) clearTimeout(prev);
    const t = setTimeout(() => {
        debouncedSyncByTab.delete(tabId);
        void syncTabTargetState(tabId);
    }, 120);
    debouncedSyncByTab.set(tabId, t);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete' || typeof changeInfo.url === 'string') {
        scheduleSyncTabTargetState(tabId);
    }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
    void syncTabTargetState(tabId);
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    scheduleSyncTabTargetState(details.tabId);
});

chrome.webNavigation.onCommitted.addListener((details) => {
    scheduleSyncTabTargetState(details.tabId);
});

chrome.webNavigation.onCompleted.addListener((details) => {
    scheduleSyncTabTargetState(details.tabId);
});

chrome.tabs.onRemoved.addListener(tabId => {
    clearTimeout(debouncedSyncByTab.get(tabId));
    debouncedSyncByTab.delete(tabId);
    removeTabTarget(tabId);
});

chrome.action.onClicked.addListener((tab) => {
    if (!tab.id) return;
    void (async () => {
        const target = await refreshTabTarget(tab.id!);
        if (!target) {
            await syncTabTargetState(tab.id!);
            return;
        }
        await safeSendToTopFrame(tab.id!, { action: 'TOGGLE_PANEL', targetSessionId: target.sessionId });
    })();
});

chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'focus-search') return;
    try {
        const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
        });
        if (!activeTab?.id) return;
        const target = await refreshTabTarget(activeTab.id);
        if (!target) {
            await syncTabTargetState(activeTab.id);
            return;
        }
        await safeSendToTopFrame(activeTab.id, { action: 'FOCUS_SEARCH', targetSessionId: target.sessionId });
    } catch {
        /* content script may not be ready */
    }
});

type SearchMessage = Extract<
    ExtensionMessage,
    { action: 'SEARCH_START' | 'SEARCH_NAVIGATE' | 'SEARCH_CLEAR' }
>;

type EditMessage = Extract<
    ExtensionMessage,
    {
        action:
            | 'EDIT_START'
            | 'EDIT_STOP'
            | 'EDIT_CLEAR'
            | 'EDIT_DESELECT'
            | 'EDIT_NOTIFY_INACTIVE'
            | 'EDIT_SELECTION_CHANGED'
            | 'EDIT_COPY_SELECTED'
            | 'EDIT_DELETE_SELECTED'
            | 'EDIT_PASTE_START'
            | 'EDIT_PASTE_PICKED'
            | 'EDIT_PASTE_LOGICS';
    }
>;

type PanelMessage = Extract<
    ExtensionMessage,
    { action: 'REQUEST_TARGET_AVAILABILITY' | 'GENIE_DISMISS' }
>;

function isSearchMessage(message: ExtensionMessage): message is SearchMessage {
    return (
        message.action === 'SEARCH_START' ||
        message.action === 'SEARCH_NAVIGATE' ||
        message.action === 'SEARCH_CLEAR'
    );
}

function isEditMessage(message: ExtensionMessage): message is EditMessage {
    return (
        message.action === 'EDIT_START' ||
        message.action === 'EDIT_STOP' ||
        message.action === 'EDIT_CLEAR' ||
        message.action === 'EDIT_DESELECT' ||
        message.action === 'EDIT_NOTIFY_INACTIVE' ||
        message.action === 'EDIT_SELECTION_CHANGED' ||
        message.action === 'EDIT_COPY_SELECTED' ||
        message.action === 'EDIT_DELETE_SELECTED' ||
        message.action === 'EDIT_PASTE_START' ||
        message.action === 'EDIT_PASTE_PICKED' ||
        message.action === 'EDIT_PASTE_LOGICS'
    );
}

function isPanelMessage(message: ExtensionMessage): message is PanelMessage {
    return (
        message.action === 'REQUEST_TARGET_AVAILABILITY' ||
        message.action === 'GENIE_DISMISS'
    );
}

async function dispatchMessage(
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
): Promise<ExtensionResponse> {
    const tabId = sender.tab?.id;
    if (!tabId) {
        return {
            success: false,
            error: '탭 정보를 찾을 수 없습니다.',
        };
    }

    if (message.action === 'PASTE_PROGRESS') {
        const target = getCurrentTarget(tabId);
        if (!target || message.targetSessionId !== target.sessionId ||
            sender.frameId !== target.frameId || sender.documentId !== target.documentId)
            return { success: false };
        await safeSendToTopFrame(tabId, message);
        return { success: true };
    }

    if (message.action === 'TARGET_CONTEXT_DIRTY') {
        scheduleSyncTabTargetState(tabId);
        return { success: true };
    }

    if (message.action === 'VISUAL_EDIT_START' || message.action === 'VISUAL_EDIT_STOP' ||
        message.action === 'VISUAL_EDIT_DELETE' || message.action === 'VISUAL_EDIT_COPY' ||
        message.action === 'VISUAL_EDIT_PASTE_START' || message.action === 'VISUAL_EDIT_PASTE' ||
        message.action === 'VISUAL_EDIT_CLEAR' || message.action === 'VISUAL_EDIT_DESELECT' || message.action === 'VISUAL_EDIT_STATE') {
        const target = await refreshTabTarget(tabId);
        if (!target || target.kind !== 'visual' || message.targetSessionId !== target.sessionId)
            return { success: false, error: 'Visual editor 대상이 변경되었습니다.' };
        if (message.action === 'VISUAL_EDIT_STATE') {
            if (sender.frameId !== target.frameId || sender.documentId !== target.documentId) return { success: false };
            if (!message.payload.active) {
                cancelVisualEdit(tabId, target.sessionId, message.payload.modeId);
                await sendToFrame(tabId, target.frameId, { action: 'VISUAL_EDIT_STOP', targetSessionId: target.sessionId, payload: { modeId: message.payload.modeId } }, target.documentId);
            }
            await safeSendToTopFrame(tabId, message);
            return { success: true };
        }
        if (sender.frameId !== 0) return { success: false, error: '패널에서만 실행할 수 있습니다.' };
        return handleVisualEditMessage(tabId, message, target);
    }

    if (message.action === 'VISUAL_SEARCH_START' || message.action === 'VISUAL_SEARCH_NAVIGATE' ||
        message.action === 'VISUAL_SEARCH_CLEAR' || message.action === 'VISUAL_SEARCH_DIRTY') {
        const target = await refreshTabTarget(tabId);
        if (!target || target.kind !== 'visual' || message.targetSessionId !== target.sessionId) return {
            success: false, error: 'Visual editor 대상이 변경되었습니다.',
        };
        if (message.action === 'VISUAL_SEARCH_DIRTY') {
            if (sender.frameId !== target.frameId || sender.documentId !== target.documentId) return { success: false };
            await safeSendToTopFrame(tabId, { action: 'VISUAL_SEARCH_CHANGED', targetSessionId: target.sessionId });
            return { success: true };
        }
        if (sender.frameId !== 0) return { success: false, error: '패널에서만 검색할 수 있습니다.' };
        return handleVisualSearchMessage(tabId, message, target);
    }

    if (isPanelMessage(message)) {
        if (message.action === 'GENIE_DISMISS') {
            const target = await refreshTabTarget(tabId);
            if (message.targetSessionId !== target?.sessionId) return { success: false, error: '대상 화면이 변경되었습니다.' };
        }
        return handlePanelMessage(tabId, message);
    }
    if (isSearchMessage(message) || isEditMessage(message)) {
        const target = await refreshTabTarget(tabId);
        if (!target || message.targetSessionId !== target.sessionId) {
            return { success: false, error: '대상 화면이 변경되었습니다. 패널에서 다시 시도해 주세요.' };
        }
        if (target.kind !== 'logic') {
            return { success: false, error: 'Logic 전용 명령은 Visual editor에서 실행할 수 없습니다.' };
        }
        if (message.action === 'EDIT_SELECTION_CHANGED' || message.action === 'EDIT_NOTIFY_INACTIVE' || message.action === 'EDIT_PASTE_PICKED') {
            if (sender.frameId !== target.frameId || sender.documentId !== target.documentId) {
                return { success: false, error: '현재 편집 대상의 메시지가 아닙니다.' };
            }
        } else if (sender.frameId !== 0) {
            return { success: false, error: '패널에서만 실행할 수 있습니다.' };
        }
        return isSearchMessage(message)
            ? handleSearchMessage(tabId, message, target)
            : handleEditMessage(tabId, sender, message, target);
    }

    return {
        success: false,
        error: `처리되지 않은 메시지입니다: ${message.action}`,
    };
}

chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, sender, sendResponse) => {
        void dispatchMessage(message, sender).then(sendResponse).catch(() => {
            sendResponse({ success: false, error: '대상 화면을 확인할 수 없습니다.' });
        });
        return true;
    },
);
