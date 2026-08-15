import { queryFrameData } from '../../features/search/background/queryFrameData';
import { resolveTargetFrame } from '../../features/search/background/resolveTargetFrame';
import type {
    ExtensionMessage,
    ExtensionResponse,
    HighlightTargetsPayload,
    SearchStartResponseData,
} from '../../shared/types/messages';
import { sendToFrame } from '../messaging';

type SearchMessage = Extract<
    ExtensionMessage,
    { action: 'SEARCH_START' | 'SEARCH_NAVIGATE' | 'SEARCH_CLEAR' }
>;

export async function handleSearchMessage(
    tabId: number,
    message: SearchMessage,
): Promise<ExtensionResponse> {
    if (message.action === 'SEARCH_START') {
        const target = await resolveTargetFrame(tabId);
        if (!target) {
            console.warn('[lamp7-genie] target frame not found', { tabId });
            return {
                success: false,
                error: 'eventSetting 화면이 아닙니다.',
            };
        }

        const matches = await queryFrameData(tabId, target.frameId, message.payload);
        if (!matches) {
            return {
                success: false,
                error: 'LogicEditor 접근에 실패했습니다.',
            };
        }

        const highlightRes = await sendToFrame(tabId, target.frameId, {
            action: 'HIGHLIGHT_TARGETS',
            payload: { matches } satisfies HighlightTargetsPayload,
        });
        if (!highlightRes.success) {
            return {
                success: false,
                error: highlightRes.error ?? '하이라이트에 실패했습니다.',
            };
        }

        return {
            success: true,
            data: {
                count: matches.length,
                matches,
            } satisfies SearchStartResponseData,
        };
    }

    const target = await resolveTargetFrame(tabId);
    if (!target) {
        return message.action === 'SEARCH_CLEAR'
            ? { success: true }
            : {
                  success: false,
                  error: 'eventSetting 화면이 아닙니다.',
              };
    }

    return sendToFrame(tabId, target.frameId, message);
}
