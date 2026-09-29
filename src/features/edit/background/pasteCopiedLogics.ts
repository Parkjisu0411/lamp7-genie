import { LOGIC_EDITOR_HELPER_SOURCE } from '../../../shared/mainWorld/logicEditorSource';
import type { MainWorldHelperSubset } from '../../../shared/mainWorld/logicTypes';
import { readFrameMemory } from '../../../shared/mainWorld/readFrameMemory';
import { mainWorldFunctionSource } from '../../../shared/mainWorld/sourceBuilder';
import { publishPasteProgress } from '../../../shared/pasteProgress';
import type { EditPasteLogicsResponseData } from '../../../shared/types/messages';
import type { LogicPasteContext } from '../pasteTypes';
import { localVariableTransfer } from './localVariableTransfer';
import { prepareLogicPasteContext, readLogicPasteContext } from './pasteContext';
import { pasteCopiedLogicsInMainWorld, type PasteCopiedLogicsPayload } from './pasteLogicCreator';

export async function pasteCopiedLogics(
    tabId: number,
    frameId: number,
    payload: PasteCopiedLogicsPayload,
    documentId?: string,
): Promise<EditPasteLogicsResponseData | null> {
    try {
        return await readFrameMemory(
            tabId,
            frameId,
            async (
                payload: PasteCopiedLogicsPayload,
                helperSource: string,
                pasteSource: string,
                contextSource: string,
                variableSource: string,
                progressSource: string,
            ) => {
                type Helpers = MainWorldHelperSubset<
                    'readBinding' | 'asStringId' | 'unwrapElement'
                >;
                const helpers = Function(
                    `${helperSource}; return __lamp7GenieMainWorld;`,
                )() as Helpers;
                const paste = Function(
                    `return (${pasteSource});`,
                )() as typeof pasteCopiedLogicsInMainWorld;
                const readContext = Function(
                    `return (${contextSource});`,
                )() as typeof readLogicPasteContext;
                const variables = Function(
                    `return (${variableSource});`,
                )() as typeof localVariableTransfer;
                const progress = Function(
                    'return (' + progressSource + ')',
                )() as typeof publishPasteProgress;
                await progress(
                    payload.modeId,
                    payload.modeId,
                    '로직 생성·연결 중 ' + payload.logics.length + '개',
                );
                // The native creator revalidates owner, signature and click ticket after this yield.
                const result = paste(payload, helpers, readContext, variables);
                return result;
            },
            [
                payload,
                LOGIC_EDITOR_HELPER_SOURCE,
                mainWorldFunctionSource(pasteCopiedLogicsInMainWorld),
                mainWorldFunctionSource(readLogicPasteContext),
                mainWorldFunctionSource(localVariableTransfer),
                mainWorldFunctionSource(publishPasteProgress),
            ],
            documentId,
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

export async function prepareLogicPaste(
    tabId: number,
    frameId: number,
    modeId: string,
    documentId?: string,
) {
    return readFrameMemory(
        tabId,
        frameId,
        (
            id: string,
            helperSource: string,
            contextSource: string,
            prepareSource: string,
        ): { context?: LogicPasteContext; error?: string } => {
            try {
                const helpers = Function(`${helperSource}; return __lamp7GenieMainWorld;`)();
                const read = Function(
                    `return (${contextSource});`,
                )() as typeof readLogicPasteContext;
                const prepare = Function(
                    `return (${prepareSource});`,
                )() as typeof prepareLogicPasteContext;
                return { context: prepare(id, helpers, read) };
            } catch (error) {
                return { error: error instanceof Error ? error.message : String(error) };
            }
        },
        [
            modeId,
            LOGIC_EDITOR_HELPER_SOURCE,
            mainWorldFunctionSource(readLogicPasteContext),
            mainWorldFunctionSource(prepareLogicPasteContext),
        ],
        documentId,
    );
}
