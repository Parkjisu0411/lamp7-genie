import { LOGIC_EDITOR_HELPER_SOURCE } from '../../../shared/mainWorld/logicEditorSource';
import type { LogicEditorMainWorld, MainWorldHelpers } from '../../../shared/mainWorld/logicTypes';
import { readFrameMemory } from '../../../shared/mainWorld/readFrameMemory';
import { mainWorldFunctionSource } from '../../../shared/mainWorld/sourceBuilder';
import type { EditSelectionItem } from '../../../shared/types/messages';
import { localVariableTransfer } from './localVariableTransfer';
import {
    resolveSelectedLogicItems,
    type ResolveSelectedLogicsPayload,
} from './selectedLogicReader';

export async function resolveSelectedLogics(
    tabId: number,
    frameId: number,
    logicIds: string[],
    documentId?: string,
    includeLocalVariables = false,
): Promise<EditSelectionItem[] | null> {
    return readFrameMemory(
        tabId,
        frameId,
        (
            payload: ResolveSelectedLogicsPayload,
            helperSource: string,
            readerSource: string,
            variableSource: string,
            includeVariables: boolean,
        ) => {
            const helpers = Function(
                `${helperSource}; return __lamp7GenieMainWorld;`,
            )() as MainWorldHelpers;
            const reader = Function(
                `return (${readerSource});`,
            )() as typeof resolveSelectedLogicItems;
            const LogicEditor = helpers.readBinding('LogicEditor') as
                | LogicEditorMainWorld
                | undefined;
            if (!LogicEditor) return null;

            const logics = LogicEditor.getAll();
            if (!Array.isArray(logics)) return null;

            const items = reader(
                logics as Parameters<typeof resolveSelectedLogicItems>[0],
                payload,
                helpers as Parameters<typeof resolveSelectedLogicItems>[2],
            );
            if (includeVariables) {
                const transfer = Function(
                    `return (${variableSource});`,
                )() as typeof localVariableTransfer;
                const valid = items.filter(
                    (item) =>
                        item.json && typeof item.json === 'object' && !Array.isArray(item.json),
                );
                const result = transfer(
                    valid.map((item) => item.json as Record<string, unknown>),
                    helpers.readBinding,
                    'copy',
                );
                valid.forEach((item, index) => {
                    item.json = result.logics[index];
                });
            }
            return items;
        },
        [
            { logicIds },
            LOGIC_EDITOR_HELPER_SOURCE,
            mainWorldFunctionSource(resolveSelectedLogicItems),
            mainWorldFunctionSource(localVariableTransfer),
            includeLocalVariables,
        ],
        documentId,
    ) as Promise<EditSelectionItem[] | null>;
}
