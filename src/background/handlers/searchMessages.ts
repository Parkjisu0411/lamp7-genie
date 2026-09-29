import { queryFrameData } from '../../features/search/background/queryFrameData';
import type { TargetContext } from '../../shared/targets/types';
import { isCurrentTarget } from '../targetState';
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
    target: TargetContext,
): Promise<ExtensionResponse> {
    if (message.action === 'SEARCH_START') {
        const matches = await queryFrameData(tabId, target.frameId, message.payload, target.documentId);
        if (!isCurrentTarget(tabId, target.sessionId)) return { success: false, error: '대상 화면이 변경되었습니다.' };
        if (!matches) {
            return {
                success: false,
                error: 'LogicEditor 접근에 실패했습니다.',
            };
        }

        const highlightRes = await sendToFrame(tabId, target.frameId, {
            action: 'HIGHLIGHT_TARGETS',
            targetSessionId: target.sessionId,
            payload: { matches } satisfies HighlightTargetsPayload,
        }, target.documentId);
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

    return sendToFrame(tabId, target.frameId, message, target.documentId);
}
