import type { TargetContext } from '../../shared/targets/types';
import type { ExtensionMessage, ExtensionResponse } from '../../shared/types/messages';
import { safeSendToTopFrame, sendToFrame } from '../messaging';
import {
    handleEditCopySelected,
    handleEditDeleteSelected,
    handleEditPasteLogics,
} from './editCommandMessages';
import { handleEditNotifyInactive, handleEditSelectionChanged } from './editSelectionMessages';
import { handleEditPasteStart, handleEditStart, handleEditStop } from './editTargetMessages';

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

export async function handleEditMessage(
    tabId: number,
    sender: chrome.runtime.MessageSender,
    message: EditMessage,
    target: TargetContext,
): Promise<ExtensionResponse> {
    if (message.action === 'EDIT_NOTIFY_INACTIVE') {
        return handleEditNotifyInactive(tabId, target, message.modeId);
    }

    if (message.action === 'EDIT_SELECTION_CHANGED') {
        return handleEditSelectionChanged(tabId, sender, message, target);
    }

    if (message.action === 'EDIT_PASTE_START')
        return handleEditPasteStart(tabId, target, message.payload.modeId);
    if (message.action === 'EDIT_PASTE_PICKED') {
        await safeSendToTopFrame(tabId, {
            action: 'EDIT_UI_SYNC',
            targetSessionId: target.sessionId,
            payload: { logicEditActive: true, paste: message.payload },
        });
        return { success: true };
    }
    if (message.action === 'EDIT_START') {
        return handleEditStart(tabId, target, message);
    }
    if (message.action === 'EDIT_CLEAR' || message.action === 'EDIT_DESELECT') {
        return sendToFrame(tabId, target.frameId, message, target.documentId);
    }
    if (message.action === 'EDIT_STOP') {
        return handleEditStop(tabId, target, message);
    }
    if (message.action === 'EDIT_COPY_SELECTED') {
        return handleEditCopySelected(tabId, target, message);
    }
    if (message.action === 'EDIT_DELETE_SELECTED') {
        return handleEditDeleteSelected(tabId, target, message);
    }
    return handleEditPasteLogics(tabId, target, message);
}
