import { pinLogicAreaMainWorld } from '../../features/edit/background/pinLogicAreaMainWorld';
import type { ExtensionMessage, ExtensionResponse } from '../../shared/types/messages';
import { sendToFrame } from '../messaging';

type EditStartMessage = Extract<ExtensionMessage, { action: 'EDIT_START' }>;
type EditStopMessage = Extract<ExtensionMessage, { action: 'EDIT_STOP' }>;

export async function handleEditStart(
    tabId: number,
    frameId: number,
    message: EditStartMessage,
): Promise<ExtensionResponse> {
    const pinRes = await pinLogicAreaMainWorld(tabId, frameId);
    if (pinRes.ok === false) {
        return {
            success: false,
            error: pinRes.error,
        };
    }
    return sendToFrame(tabId, frameId, message);
}

export function handleEditStop(
    tabId: number,
    frameId: number,
    message: EditStopMessage,
): Promise<ExtensionResponse> {
    return sendToFrame(tabId, frameId, message);
}
