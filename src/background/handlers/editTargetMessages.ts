import { prepareLogicPaste } from '../../features/edit/background/pasteCopiedLogics';
import { pinLogicAreaMainWorld } from '../../features/edit/background/pinLogicAreaMainWorld';
import type { TargetContext } from '../../shared/targets/types';
import type { ExtensionMessage, ExtensionResponse } from '../../shared/types/messages';
import { sendToFrame } from '../messaging';
import { isCurrentTarget } from '../targetState';

type EditStartMessage = Extract<ExtensionMessage, { action: 'EDIT_START' }>;
type EditStopMessage = Extract<ExtensionMessage, { action: 'EDIT_STOP' }>;

export async function handleEditStart(
    tabId: number,
    target: TargetContext,
    message: EditStartMessage,
): Promise<ExtensionResponse> {
    const pinRes = await pinLogicAreaMainWorld(tabId, target.frameId, target.documentId);
    if (!isCurrentTarget(tabId, target.sessionId))
        return { success: false, error: '대상 화면이 변경되었습니다.' };
    if (pinRes.ok === false) {
        return {
            success: false,
            error: pinRes.error,
        };
    }
    return sendToFrame(tabId, target.frameId, message, target.documentId);
}

export async function handleEditPasteStart(
    tabId: number,
    target: TargetContext,
    modeId: string,
): Promise<ExtensionResponse> {
    const prepared = await prepareLogicPaste(tabId, target.frameId, modeId, target.documentId);
    if (!prepared?.context)
        return { success: false, error: prepared?.error || '붙여넣을 화면을 확인할 수 없습니다.' };
    if (!isCurrentTarget(tabId, target.sessionId))
        return { success: false, error: '대상 화면이 변경되었습니다.' };
    const pin = await pinLogicAreaMainWorld(tabId, target.frameId, target.documentId);
    if (!pin.ok || !isCurrentTarget(tabId, target.sessionId))
        return { success: false, error: '대상 화면이 변경되었습니다.' };
    return sendToFrame(
        tabId,
        target.frameId,
        {
            action: 'EDIT_PASTE_MOUNT',
            targetSessionId: target.sessionId,
            payload: prepared.context,
        },
        target.documentId,
    );
}

export function handleEditStop(
    tabId: number,
    target: TargetContext,
    message: EditStopMessage,
): Promise<ExtensionResponse> {
    return sendToFrame(tabId, target.frameId, message, target.documentId);
}
