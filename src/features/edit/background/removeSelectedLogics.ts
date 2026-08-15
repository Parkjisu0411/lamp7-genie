import type { EditDeleteSelectedResponseData } from '../../../shared/types/messages';
import { LOGIC_EDITOR_HELPER_SOURCE } from '../../../shared/mainWorld/logicEditorSource';
import { readFrameMemory } from '../../../shared/mainWorld/readFrameMemory';

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
        (payload: RemoveSelectedLogicsPayload, helperSource: string) => {
            type Helpers = {
                readBinding(name: string): unknown;
            };
            const helpers = Function(`${helperSource}; return __lamp7GenieMainWorld;`)() as Helpers;
            const LogicEditor = helpers.readBinding('LogicEditor') as LogicEditor | undefined;
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
        [{ logicIds }, LOGIC_EDITOR_HELPER_SOURCE],
    );
}
