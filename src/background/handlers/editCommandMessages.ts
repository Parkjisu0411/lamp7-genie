import { pasteCopiedLogics } from '../../features/edit/background/pasteCopiedLogics';
import { removeSelectedLogics } from '../../features/edit/background/removeSelectedLogics';
import { resolveSelectedLogics } from '../../features/edit/background/resolveSelectedLogics';
import type {
    EditCopySelectedResponseData,
    EditUiSyncPayload,
    ExtensionMessage,
    ExtensionResponse,
} from '../../shared/types/messages';
import { safeSendToTopFrame, sendToFrame } from '../messaging';

type EditCopyMessage = Extract<ExtensionMessage, { action: 'EDIT_COPY_SELECTED' }>;
type EditDeleteMessage = Extract<ExtensionMessage, { action: 'EDIT_DELETE_SELECTED' }>;
type EditPasteMessage = Extract<ExtensionMessage, { action: 'EDIT_PASTE_LOGICS' }>;

function validLogicIds(logicIds: string[]): string[] {
    return logicIds.filter((id): id is string => typeof id === 'string');
}

async function stopEditAndSyncTop(tabId: number, frameId: number): Promise<void> {
    await sendToFrame(tabId, frameId, { action: 'EDIT_STOP' });
    await safeSendToTopFrame(tabId, {
        action: 'EDIT_UI_SYNC',
        payload: {
            logicEditActive: false,
            selectedItems: [],
        } satisfies EditUiSyncPayload,
    });
}

export async function handleEditCopySelected(
    tabId: number,
    frameId: number,
    message: EditCopyMessage,
): Promise<ExtensionResponse> {
    const logicIds = validLogicIds(message.payload.logicIds);
    if (logicIds.length === 0) {
        return {
            success: false,
            error: '복사할 로직이 없습니다.',
        };
    }

    const selectedItems = await resolveSelectedLogics(tabId, frameId, logicIds);
    if (!selectedItems) {
        return {
            success: false,
            error: '선택한 로직 정보를 읽을 수 없습니다.',
        };
    }

    const logics = selectedItems
        .map((item) => item.json)
        .filter(
            (v): v is Record<string, unknown> =>
                !!v && typeof v === 'object' && !Array.isArray(v),
        );
    if (logics.length === 0) {
        return {
            success: false,
            error: '복사할 로직 JSON이 없습니다.',
        };
    }

    return {
        success: true,
        data: {
            logics,
            count: logics.length,
        } satisfies EditCopySelectedResponseData,
    };
}

export async function handleEditDeleteSelected(
    tabId: number,
    frameId: number,
    message: EditDeleteMessage,
): Promise<ExtensionResponse> {
    const logicIds = validLogicIds(message.payload.logicIds);
    if (logicIds.length === 0) {
        return {
            success: false,
            error: '삭제할 로직이 없습니다.',
        };
    }

    const data = await removeSelectedLogics(tabId, frameId, logicIds);
    if (!data) {
        return {
            success: false,
            error: 'LogicEditor.removeLogic을 사용할 수 없습니다.',
        };
    }

    await stopEditAndSyncTop(tabId, frameId);

    return {
        success: data.errors.length === 0,
        data,
        error:
            data.errors.length > 0
                ? '일부 로직 삭제에 실패했습니다.'
                : undefined,
    };
}

export async function handleEditPasteLogics(
    tabId: number,
    frameId: number,
    message: EditPasteMessage,
): Promise<ExtensionResponse> {
    const logics = message.payload.logics;
    if (logics.length === 0) {
        return {
            success: false,
            error: '붙여넣을 로직이 없습니다.',
        };
    }

    const data = await pasteCopiedLogics(tabId, frameId, logics);
    if (!data) {
        return {
            success: false,
            error:
                'eventSetting 화면에 붙여넣기 스크립트를 실행하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
        };
    }
    if (data.setupError) {
        return {
            success: false,
            data,
            error: data.setupError,
        };
    }

    await stopEditAndSyncTop(tabId, frameId);

    return {
        success: data.errors.length === 0,
        data,
        error:
            data.errors.length > 0
                ? '일부 로직 붙여넣기에 실패했습니다.'
                : undefined,
    };
}
