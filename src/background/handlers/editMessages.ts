import { resolveTargetFrame } from '../../features/search/background/resolveTargetFrame';
import type { ExtensionMessage, ExtensionResponse } from '../../shared/types/messages';
import {
    handleEditCopySelected,
    handleEditDeleteSelected,
    handleEditPasteLogics,
} from './editCommandMessages';
import {
    handleEditNotifyInactive,
    handleEditSelectionChanged,
} from './editSelectionMessages';
import { handleEditStart, handleEditStop } from './editTargetMessages';

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

export async function handleEditMessage(
    tabId: number,
    sender: chrome.runtime.MessageSender,
    message: EditMessage,
): Promise<ExtensionResponse> {
    if (message.action === 'EDIT_NOTIFY_INACTIVE') {
        return handleEditNotifyInactive(tabId);
    }

    if (message.action === 'EDIT_SELECTION_CHANGED') {
        return handleEditSelectionChanged(tabId, sender, message);
    }

    const target = await resolveTargetFrame(tabId);
    if (!target) {
        return {
            success: false,
            error: 'eventSetting 화면이 아닙니다.',
        };
    }

    if (message.action === 'EDIT_START') {
        return handleEditStart(tabId, target.frameId, message);
    }
    if (message.action === 'EDIT_STOP') {
        return handleEditStop(tabId, target.frameId, message);
    }
    if (message.action === 'EDIT_COPY_SELECTED') {
        return handleEditCopySelected(tabId, target.frameId, message);
    }
    if (message.action === 'EDIT_DELETE_SELECTED') {
        return handleEditDeleteSelected(tabId, target.frameId, message);
    }
    return handleEditPasteLogics(tabId, target.frameId, message);
}
