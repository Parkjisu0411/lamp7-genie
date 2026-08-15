import { LOGIC_EDITOR_HELPER_SOURCE } from '../../../shared/mainWorld/logicEditorSource';
import { readFrameMemory } from '../../../shared/mainWorld/readFrameMemory';
import { mainWorldFunctionSource } from '../../../shared/mainWorld/sourceBuilder';
import type { EditPasteLogicsResponseData } from '../../../shared/types/messages';
import {
    pasteCopiedLogicsInMainWorld,
    type PasteCopiedLogicsPayload,
} from './pasteLogicCreator';

export async function pasteCopiedLogics(
    tabId: number,
    frameId: number,
    logics: unknown[],
): Promise<EditPasteLogicsResponseData | null> {
    try {
        return await readFrameMemory(
            tabId,
            frameId,
            (
                payload: PasteCopiedLogicsPayload,
                helperSource: string,
                pasteSource: string,
            ) => {
                type Helpers = {
                    readBinding(name: string): unknown;
                    asStringId(value: unknown): string;
                };
                const helpers = Function(
                    `${helperSource}; return __lamp7GenieMainWorld;`,
                )() as Helpers;
                const paste = Function(
                    `return (${pasteSource});`,
                )() as typeof pasteCopiedLogicsInMainWorld;
                return paste(payload, helpers);
            },
            [
                { logics },
                LOGIC_EDITOR_HELPER_SOURCE,
                mainWorldFunctionSource(pasteCopiedLogicsInMainWorld),
            ],
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[lamp7-genie] pasteCopiedLogics inject failed', err);
        return {
            createdCount: 0,
            errors: [],
            setupError: `eventSetting 프레임에 접근하지 못했습니다. ${message}`,
        };
    }
}
