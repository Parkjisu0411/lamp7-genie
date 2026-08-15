import { resolveTargetFrame } from '../features/search/background/resolveTargetFrame';
import type { ExtensionMessage, ExtensionResponse } from '../shared/types/messages';
import { handleEditMessage } from './handlers/editMessages';
import { handlePanelMessage } from './handlers/panelMessages';
import { handleSearchMessage } from './handlers/searchMessages';
import { safeSendToTopFrame } from './messaging';
import { syncTabTargetState } from './targetState';

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
    if (details.frameId !== 0) return;
    scheduleSyncTabTargetState(details.tabId);
});

chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    scheduleSyncTabTargetState(details.tabId);
});

chrome.webNavigation.onCompleted.addListener((details) => {
    scheduleSyncTabTargetState(details.tabId);
});

chrome.action.onClicked.addListener((tab) => {
    if (!tab.id) return;
    void (async () => {
        const target = await resolveTargetFrame(tab.id!);
        if (!target) {
            await syncTabTargetState(tab.id!);
            return;
        }
        await safeSendToTopFrame(tab.id!, { action: 'TOGGLE_PANEL' });
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
        const target = await resolveTargetFrame(activeTab.id);
        if (!target) {
            await syncTabTargetState(activeTab.id);
            return;
        }
        await safeSendToTopFrame(activeTab.id, { action: 'FOCUS_SEARCH' });
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
            | 'EDIT_NOTIFY_INACTIVE'
            | 'EDIT_SELECTION_CHANGED'
            | 'EDIT_COPY_SELECTED'
            | 'EDIT_DELETE_SELECTED'
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
        message.action === 'EDIT_NOTIFY_INACTIVE' ||
        message.action === 'EDIT_SELECTION_CHANGED' ||
        message.action === 'EDIT_COPY_SELECTED' ||
        message.action === 'EDIT_DELETE_SELECTED' ||
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

    if (isPanelMessage(message)) {
        return handlePanelMessage(tabId, message);
    }
    if (isSearchMessage(message)) {
        return handleSearchMessage(tabId, message);
    }
    if (isEditMessage(message)) {
        return handleEditMessage(tabId, sender, message);
    }

    return {
        success: false,
        error: `처리되지 않은 메시지입니다: ${message.action}`,
    };
}

chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, sender, sendResponse) => {
        void dispatchMessage(message, sender).then(sendResponse);
        return true;
    },
);
