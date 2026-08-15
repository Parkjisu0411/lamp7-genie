import { resolveSelectedLogics } from '../../features/edit/background/resolveSelectedLogics';
import type {
    EditUiSyncPayload,
    ExtensionMessage,
    ExtensionResponse,
} from '../../shared/types/messages';
import { safeSendToTopFrame } from '../messaging';

type EditSelectionChangedMessage = Extract<
    ExtensionMessage,
    { action: 'EDIT_SELECTION_CHANGED' }
>;

export async function handleEditNotifyInactive(
    tabId: number,
): Promise<ExtensionResponse> {
    await safeSendToTopFrame(tabId, {
        action: 'EDIT_UI_SYNC',
        payload: {
            logicEditActive: false,
            selectedItems: [],
        } satisfies EditUiSyncPayload,
    });
    return { success: true };
}

export async function handleEditSelectionChanged(
    tabId: number,
    sender: chrome.runtime.MessageSender,
    message: EditSelectionChangedMessage,
): Promise<ExtensionResponse> {
    const frameId = sender.frameId;
    if (typeof frameId !== 'number') {
        return {
            success: false,
            error: '편집 대상 프레임을 찾을 수 없습니다.',
        };
    }

    const logicIds = message.payload.logicIds.filter(
        (id): id is string => typeof id === 'string',
    );
    const selectedItems = await resolveSelectedLogics(tabId, frameId, logicIds);
    if (!selectedItems) {
        await safeSendToTopFrame(tabId, {
            action: 'EDIT_UI_SYNC',
            payload: {
                logicEditActive: true,
                selectedItems: [],
                error: '선택한 로직 정보를 읽을 수 없습니다. 다시 선택해 주세요.',
            } satisfies EditUiSyncPayload,
        });
        return {
            success: false,
            error: '선택한 로직 정보를 읽을 수 없습니다.',
        };
    }

    await safeSendToTopFrame(tabId, {
        action: 'EDIT_UI_SYNC',
        payload: {
            logicEditActive: true,
            selectedItems,
            error: message.payload.error,
        } satisfies EditUiSyncPayload,
    });
    return {
        success: true,
        data: { count: selectedItems.length },
    };
}
