import type { EditDeleteSelectedResponseData } from '../../../shared/types/messages';
import { readFrameMemory } from '../../search/background/readFrameMemory';

interface RemoveSelectedLogicsPayload {
    logicIds: string[];
}

interface LogicEditor {
    removeLogic?: (logicId: string) => unknown;
}

export async function removeSelectedLogics(
    tabId: number,
    frameId: number,
    logicIds: string[],
): Promise<EditDeleteSelectedResponseData | null> {
    return readFrameMemory(
        tabId,
        frameId,
        (payload: RemoveSelectedLogicsPayload) => {
            const LogicEditor = (window as unknown as { LogicEditor?: LogicEditor }).LogicEditor;
            if (!LogicEditor || typeof LogicEditor.removeLogic !== 'function') return null;

            const errors: Array<{ logicId: string; error: string }> = [];
            let deletedCount = 0;

            for (const logicId of payload.logicIds) {
                try {
                    LogicEditor.removeLogic(logicId);
                    deletedCount += 1;
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.error('[lamp7-genie] removeLogic() failed', {
                        logicId,
                        err,
                    });
                    errors.push({ logicId, error: message });
                }
            }

            return { deletedCount, errors };
        },
        [{ logicIds }],
    );
}
