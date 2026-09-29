import { publishPasteProgress } from '../../shared/pasteProgress';
import { deleteVisualComponents } from '../../features/visualEdit/background/deleteComponents';
import { transferVisualComponents } from '../../features/visualEdit/background/transferComponents';
import { watchVisualSelection } from '../../features/visualEdit/background/watchSelection';
import { getVisualClipboard, setVisualClipboard } from '../../features/visualEdit/clipboard';
import { visualPasteWrappers, visualPlacement } from '../../features/visualEdit/placement';
import { buildSelectionPolicy } from '../../features/visualEdit/policy';
import type { VisualClipboard } from '../../features/visualEdit/transferTypes';
import { transformVisualClipboard } from '../../features/visualEdit/transformClipboard';
import type { VisualDeleteSelection, VisualEditMount } from '../../features/visualEdit/types';
import { readVisualComponents } from '../../features/visualSearch/background/readComponents';
import type { VisualComponentRecord } from '../../features/visualSearch/types';
import { readFrameMemory } from '../../shared/mainWorld/readFrameMemory';
import type { TargetContext } from '../../shared/targets/types';
import type { ExtensionMessage, ExtensionResponse } from '../../shared/types/messages';
import { sendToFrame } from '../messaging';
import { isCurrentTarget } from '../targetState';

export type VisualEditMessage = Extract<
    ExtensionMessage,
    {
        action:
            | 'VISUAL_EDIT_START'
            | 'VISUAL_EDIT_STOP'
            | 'VISUAL_EDIT_CLEAR'
            | 'VISUAL_EDIT_DELETE'
            | 'VISUAL_EDIT_COPY'
            | 'VISUAL_EDIT_PASTE_START'
            | 'VISUAL_EDIT_PASTE'
            | 'VISUAL_EDIT_DESELECT';
    }
>;
const queues = new Map<number, Promise<unknown>>();
const desired = new Map<number, string>();
export function cancelVisualEdit(tabId: number, sessionId: string, modeId: string): void {
    if (desired.get(tabId) === `${sessionId}:${modeId}`) desired.delete(tabId);
}

export async function handleVisualEditMessage(
    tabId: number,
    message: VisualEditMessage,
    target: TargetContext,
): Promise<ExtensionResponse> {
    const { modeId } = message.payload;
    const token = `${target.sessionId}:${modeId}`;
    if (message.action === 'VISUAL_EDIT_START' || message.action === 'VISUAL_EDIT_PASTE_START')
        desired.set(tabId, token);
    if (message.action === 'VISUAL_EDIT_STOP' && desired.get(tabId) === token)
        desired.delete(tabId);
    const valid = () => isCurrentTarget(tabId, target.sessionId) && desired.get(tabId) === token;
    const stop = () =>
        sendToFrame(
            tabId,
            target.frameId,
            { action: 'VISUAL_EDIT_STOP', targetSessionId: target.sessionId, payload: { modeId } },
            target.documentId,
        );
    const pending = (queues.get(tabId) ?? Promise.resolve())
        .catch(() => {})
        .then(async (): Promise<ExtensionResponse> => {
            if (message.action === 'VISUAL_EDIT_STOP') return stop();
            if (message.action === 'VISUAL_EDIT_COPY' || message.action === 'VISUAL_EDIT_PASTE') {
                if (
                    !isCurrentTarget(tabId, target.sessionId) ||
                    !message.payload.requestId ||
                    !Array.isArray(message.payload.modelIds) ||
                    !message.payload.modelIds.length ||
                    message.payload.modelIds.some((id) => typeof id !== 'string')
                )
                    return { success: false, error: '선택 항목을 확인할 수 없습니다.' };
                const action = message.action === 'VISUAL_EDIT_COPY' ? 'copy' : 'paste';
                let clipboard: VisualClipboard | undefined;
                if (message.action === 'VISUAL_EDIT_PASTE') {
                    clipboard = await getVisualClipboard();
                    if (!clipboard || clipboard.id !== message.payload.clipboardId)
                        return {
                            success: false,
                            error: '복사 데이터가 변경되었습니다. 붙여넣을 위치를 다시 선택해 주세요.',
                        };
                }
                const locked = await sendToFrame(
                    tabId,
                    target.frameId,
                    {
                        action: 'VISUAL_EDIT_TRANSFER_BEGIN',
                        targetSessionId: target.sessionId,
                        payload: { ...message.payload, operation: action },
                    },
                    target.documentId,
                );
                if (!locked.success || !locked.data) return locked;
                try {
                    const selection = locked.data as VisualDeleteSelection;
                    if (
                        !isCurrentTarget(tabId, target.sessionId) ||
                        selection.modeId !== modeId ||
                        selection.requestId !== message.payload.requestId ||
                        !Array.isArray(selection.locations) ||
                        selection.locations.length !== message.payload.modelIds.length ||
                        selection.locations.some(
                            (l) => !message.payload.modelIds.includes(l.modelId),
                        )
                    )
                        return {
                            success: false,
                            error: '대상 화면 또는 선택 항목이 변경되었습니다.',
                        };
                    const result = await readFrameMemory(
                        tabId,
                        target.frameId,
                        transferVisualComponents,
                        [
                            {
                                action,
                                selection,
                                clipboard,
                                position:
                                    message.action === 'VISUAL_EDIT_PASTE'
                                        ? message.payload.position
                                        : undefined,
                            },
                            transferSources(),
                        ],
                        target.documentId,
                    );
                    if (!result || !isCurrentTarget(tabId, target.sessionId))
                        return {
                            success: false,
                            error: '처리 결과를 확인할 수 없습니다. 현재 화면을 확인한 뒤 다시 선택해 주세요.',
                        };
                    if (action === 'paste')
                        return { success: !result.error, error: result.error, data: result };
                    if (action === 'copy' && result.clipboard && !result.error) {
                        result.clipboard.source.screenId = target.screenId ?? '';
                        try {
                            await setVisualClipboard(result.clipboard);
                        } catch {
                            return {
                                success: false,
                                error: '복사 데이터를 저장하지 못했습니다. 이미지나 항목 수를 줄여 다시 복사해 주세요.',
                            };
                        }
                        await stop();
                        return { success: true, data: result };
                    }
                    if (result.records) {
                        const refreshed = await sendToFrame(
                            tabId,
                            target.frameId,
                            {
                                action: 'VISUAL_EDIT_DELETE_END',
                                targetSessionId: target.sessionId,
                                payload: {
                                    modeId,
                                    requestId: message.payload.requestId,
                                    result: {
                                        deletedIds: [],
                                        cascadedIds: [],
                                        records: result.records,
                                        remainingIds: message.payload.modelIds,
                                    },
                                },
                            },
                            target.documentId,
                        );
                        if (refreshed.success)
                            return { success: !result.error, error: result.error, data: result };
                    }
                    await stop();
                    return {
                        success: false,
                        data: result,
                        error: result.error ?? '처리 후 선택모드를 갱신하지 못했습니다.',
                    };
                } finally {
                    // Successful, partial and lost-result paste attempts all leave native mode
                    // available again. Do not build/send a fresh selection of the inserted tree.
                    const stopped = action === 'paste' ? await stop() : undefined;
                    if (!stopped?.success)
                        await sendToFrame(
                            tabId,
                            target.frameId,
                            {
                                action: 'VISUAL_EDIT_DELETE_ABORT',
                                targetSessionId: target.sessionId,
                                payload: { modeId, requestId: message.payload.requestId },
                            },
                            target.documentId,
                        );
                }
            }
            if (message.action === 'VISUAL_EDIT_DELETE') {
                if (
                    !isCurrentTarget(tabId, target.sessionId) ||
                    !message.payload.requestId ||
                    !Array.isArray(message.payload.modelIds) ||
                    !message.payload.modelIds.length ||
                    message.payload.modelIds.some((id) => typeof id !== 'string')
                )
                    return { success: false, error: '삭제할 선택 항목을 확인할 수 없습니다.' };
                const locked = await sendToFrame(
                    tabId,
                    target.frameId,
                    {
                        action: 'VISUAL_EDIT_DELETE_BEGIN',
                        targetSessionId: target.sessionId,
                        payload: message.payload,
                    },
                    target.documentId,
                );
                if (!locked.success || !locked.data) return locked;
                try {
                    if (!isCurrentTarget(tabId, target.sessionId))
                        return { success: false, error: '대상 화면이 변경되었습니다.' };
                    const selection = locked.data as VisualDeleteSelection;
                    if (
                        selection.modeId !== modeId ||
                        selection.requestId !== message.payload.requestId ||
                        !Array.isArray(selection.locations) ||
                        selection.locations.length !== message.payload.modelIds.length ||
                        selection.locations.some(
                            (location) => !message.payload.modelIds.includes(location.modelId),
                        )
                    )
                        return { success: false, error: '선택 항목이 변경되었습니다.' };
                    const result = await readFrameMemory(
                        tabId,
                        target.frameId,
                        deleteVisualComponents,
                        [
                            selection,
                            {
                                reader: readVisualComponents.toString(),
                                policy: buildSelectionPolicy.toString(),
                            },
                        ],
                        target.documentId,
                    );
                    if (!result)
                        return {
                            success: false,
                            error: '삭제 결과를 확인할 수 없습니다. 현재 화면을 확인한 뒤 다시 선택해 주세요.',
                        };
                    if (!isCurrentTarget(tabId, target.sessionId))
                        return {
                            success: false,
                            data: result,
                            error: '대상 화면이 변경되었습니다.',
                        };
                    if (result.records) {
                        const refreshed = await sendToFrame(
                            tabId,
                            target.frameId,
                            {
                                action: 'VISUAL_EDIT_DELETE_END',
                                targetSessionId: target.sessionId,
                                payload: { modeId, requestId: message.payload.requestId, result },
                            },
                            target.documentId,
                        );
                        if (refreshed.success)
                            return { success: !result.error, data: result, error: result.error };
                    }
                    await stop();
                    return {
                        success: false,
                        data: result,
                        error: result.error ?? '삭제 후 선택모드를 갱신하지 못했습니다.',
                    };
                } finally {
                    // END unlocks a live mode. For missing/failed replies, fail closed without retrying deletion.
                    await sendToFrame(
                        tabId,
                        target.frameId,
                        {
                            action: 'VISUAL_EDIT_DELETE_ABORT',
                            targetSessionId: target.sessionId,
                            payload: { modeId, requestId: message.payload.requestId },
                        },
                        target.documentId,
                    );
                }
            }
            if (
                message.action === 'VISUAL_EDIT_CLEAR' ||
                message.action === 'VISUAL_EDIT_DESELECT'
            ) {
                // Controller checks modeId even after an MV3 worker restart.
                if (!isCurrentTarget(tabId, target.sessionId)) return { success: false };
                return sendToFrame(tabId, target.frameId, message, target.documentId);
            }
            if (!valid()) return { success: false, error: '선택모드 시작이 취소되었습니다.' };
            try {
                let paste: VisualEditMount['paste'];
                let records: VisualComponentRecord[];
                if (message.action === 'VISUAL_EDIT_PASTE_START') {
                    const clipboard = await getVisualClipboard();
                    if (!clipboard || clipboard.id !== message.payload.clipboardId)
                        return {
                            success: false,
                            error: '복사 데이터가 변경되었습니다. 다시 시도해 주세요.',
                        };
                    const locations = await readFrameMemory(
                        tabId,
                        target.frameId,
                        transferVisualComponents,
                        [{ action: 'targets', clipboard }, transferSources()],
                        target.documentId,
                    );
                    if (
                        !valid() ||
                        !locations?.targets?.length ||
                        !locations.records ||
                        locations.error
                    )
                        return {
                            success: false,
                            error: locations?.error ?? '붙여넣을 위치를 찾을 수 없습니다.',
                        };
                    paste = {
                        targets: locations.targets,
                        clipboardId: clipboard.id,
                    };
                    records = locations.records;
                } else {
                    const snapshot = await readFrameMemory(
                        tabId,
                        target.frameId,
                        readVisualComponents,
                        [],
                        target.documentId,
                    );
                    if (!valid()) return { success: false, error: '대상 화면이 변경되었습니다.' };
                    if (!snapshot || snapshot.error)
                        return {
                            success: false,
                            error: snapshot?.error ?? '컴포넌트를 읽을 수 없습니다.',
                        };
                    records = snapshot.records;
                }
                const mounted = await sendToFrame(
                    tabId,
                    target.frameId,
                    {
                        action: 'VISUAL_EDIT_MOUNT',
                        targetSessionId: target.sessionId,
                        payload: { modeId, records, paste },
                    },
                    target.documentId,
                );
                if (!mounted.success || !valid()) {
                    await stop();
                    return mounted.success ? { success: false } : mounted;
                }
                const watching = await readFrameMemory(
                    tabId,
                    target.frameId,
                    watchVisualSelection,
                    [modeId],
                    target.documentId,
                );
                if (!watching || !valid()) {
                    await stop();
                    return { success: false, error: '화면 변경 감시를 시작할 수 없습니다.' };
                }
                return { success: true };
            } catch {
                await stop();
                return { success: false, error: '선택모드를 시작할 수 없습니다.' };
            }
        });
    queues.set(tabId, pending);
    try {
        return await pending;
    } finally {
        if (queues.get(tabId) === pending) queues.delete(tabId);
    }
}

function transferSources() {
    return {
        progress: publishPasteProgress.toString(),
        reader: readVisualComponents.toString(),
        policy: buildSelectionPolicy.toString(),
        transform: transformVisualClipboard.toString(),
        placement: visualPlacement.toString(),
        wrappers: visualPasteWrappers.toString(),
    };
}
