import { resolveTargetFrame } from '../features/search/background/resolveTargetFrame';
import type { ExtensionResponse } from '../shared/types/messages';
import { safeSendToTopFrame, sendToFrame } from './messaging';

export async function dismissPanelAndStopEdit(tabId: number): Promise<void> {
    const target = await resolveTargetFrame(tabId);
    if (target) {
        await sendToFrame(tabId, target.frameId, { action: 'EDIT_STOP' });
    }
    await safeSendToTopFrame(tabId, { action: 'HIDE_PANEL' });
}

export async function syncTabTargetState(tabId: number): Promise<void> {
    const target = await resolveTargetFrame(tabId);
    const available = !!target;
    chrome.action.setTitle({
        tabId,
        title: available
            ? 'Lamp7 Genie'
            : 'Lamp7 Genie (eventSetting 화면에서 사용 가능)',
    });
    await safeSendToTopFrame(tabId, {
        action: 'TARGET_AVAILABILITY',
        payload: { available },
    });
    if (!available) {
        await dismissPanelAndStopEdit(tabId);
    }
}

export async function requestTargetAvailability(
    tabId: number,
): Promise<ExtensionResponse> {
    const target = await resolveTargetFrame(tabId);
    return {
        success: true,
        data: { available: !!target },
    };
}
