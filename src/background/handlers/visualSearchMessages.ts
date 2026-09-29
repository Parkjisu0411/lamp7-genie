import { matchVisualComponents } from '../../features/visualSearch/background/matcher';
import { readVisualComponents } from '../../features/visualSearch/background/readComponents';
import { watchVisualEditor } from '../../features/visualSearch/background/watchEditor';
import { readFrameMemory } from '../../shared/mainWorld/readFrameMemory';
import type { TargetContext } from '../../shared/targets/types';
import type { ExtensionMessage, ExtensionResponse } from '../../shared/types/messages';
import { sendToFrame } from '../messaging';
import { isCurrentTarget } from '../targetState';

export type VisualSearchMessage = Extract<
    ExtensionMessage,
    { action: 'VISUAL_SEARCH_START' | 'VISUAL_SEARCH_NAVIGATE' | 'VISUAL_SEARCH_CLEAR' }
>;
const queues = new Map<number, Promise<unknown>>();
const latest = new Map<number, string>();
const changed = (): ExtensionResponse => ({
    success: false,
    error: '검색 요청 또는 대상 화면이 변경되었습니다.',
});

export async function handleVisualSearchMessage(
    tabId: number,
    message: VisualSearchMessage,
    target: TargetContext,
): Promise<ExtensionResponse> {
    const token = `${target.sessionId}:${message.payload.requestId}`;
    latest.set(tabId, token);
    const valid = () => latest.get(tabId) === token && isCurrentTarget(tabId, target.sessionId);
    const pending = (queues.get(tabId) ?? Promise.resolve())
        .catch(() => {})
        .then(async (): Promise<ExtensionResponse> => {
            if (!valid()) return changed();
            if (message.action === 'VISUAL_SEARCH_CLEAR') {
                return sendToFrame(tabId, target.frameId, message, target.documentId);
            }
            const snapshot = await readFrameMemory(
                tabId,
                target.frameId,
                readVisualComponents,
                [],
                target.documentId,
            );
            if (!valid()) return changed();
            if (!snapshot || snapshot.error) {
                await sendToFrame(
                    tabId,
                    target.frameId,
                    {
                        action: 'VISUAL_SEARCH_CLEAR',
                        targetSessionId: target.sessionId,
                        payload: { requestId: message.payload.requestId },
                    },
                    target.documentId,
                );
                return {
                    success: false,
                    error: snapshot?.error ?? '화면 구성요소를 읽을 수 없습니다.',
                };
            }
            const { query, filters, activeId, scroll, requestId } = message.payload;
            const matches = matchVisualComponents(snapshot.records, query, filters);
            const active = matches.find((match) => match.id === activeId) ?? matches[0];
            const missing = !!activeId && !matches.some((match) => match.id === activeId);
            const watching = await readFrameMemory(
                tabId,
                target.frameId,
                watchVisualEditor,
                [target.sessionId],
                target.documentId,
            );
            if (!valid()) {
                // Clear only this session's listener if target switched while MAIN injection was pending.
                if (!isCurrentTarget(tabId, target.sessionId))
                    await readFrameMemory(
                        tabId,
                        target.frameId,
                        (id: string) => {
                            document.dispatchEvent(
                                new CustomEvent('genie:visual-search-stop', { detail: id }),
                            );
                        },
                        [target.sessionId],
                        target.documentId,
                    );
                return changed();
            }
            if (!watching) {
                await sendToFrame(
                    tabId,
                    target.frameId,
                    {
                        action: 'VISUAL_SEARCH_CLEAR',
                        targetSessionId: target.sessionId,
                        payload: { requestId },
                    },
                    target.documentId,
                );
                return { success: false, error: '화면 변경 감시를 연결할 수 없습니다.' };
            }
            const response = await sendToFrame(
                tabId,
                target.frameId,
                {
                    action: 'VISUAL_SEARCH_PRESENT',
                    targetSessionId: target.sessionId,
                    payload: {
                        matches,
                        activeId: active?.id ?? null,
                        requestId,
                        scroll: scroll && !missing,
                    },
                },
                target.documentId,
            );
            if (!valid()) return changed();
            if (!response.success) return response;
            const notice = missing
                ? '항목이 변경되어 검색 결과를 갱신했습니다.'
                : (response.data as { notice?: string } | undefined)?.notice;
            return { success: true, data: { matches, activeId: active?.id ?? null, notice } };
        });
    queues.set(tabId, pending);
    try {
        return await pending;
    } finally {
        if (queues.get(tabId) === pending) {
            queues.delete(tabId);
            latest.delete(tabId);
        }
    }
}
