import type { ExtensionMessage, ExtensionResponse } from '../../shared/types/messages';
import { dismissPanelAndStopEdit, requestTargetAvailability } from '../targetState';

type PanelMessage = Extract<
    ExtensionMessage,
    { action: 'REQUEST_TARGET_AVAILABILITY' | 'GENIE_DISMISS' }
>;

export async function handlePanelMessage(
    tabId: number,
    message: PanelMessage,
): Promise<ExtensionResponse> {
    if (message.action === 'REQUEST_TARGET_AVAILABILITY') {
        return requestTargetAvailability(tabId);
    }

    await dismissPanelAndStopEdit(tabId);
    return { success: true };
}
