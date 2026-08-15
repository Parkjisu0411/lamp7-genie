import { LOGIC_EDITOR_HELPER_SOURCE } from '../../../shared/mainWorld/logicEditorSource';
import { readFrameMemory } from '../../../shared/mainWorld/readFrameMemory';
import { mainWorldFunctionSource } from '../../../shared/mainWorld/sourceBuilder';
import type { EditSelectionItem } from '../../../shared/types/messages';
import {
    resolveSelectedLogicItems,
    type ResolveSelectedLogicsPayload,
} from './selectedLogicReader';

interface LogicEditor {
    getAll(): unknown[];
}

export async function resolveSelectedLogics(
    tabId: number,
    frameId: number,
    logicIds: string[],
): Promise<EditSelectionItem[] | null> {
    return readFrameMemory(
        tabId,
        frameId,
        (
            payload: ResolveSelectedLogicsPayload,
            helperSource: string,
            readerSource: string,
        ) => {
            type Helpers = {
                readBinding(name: string): unknown;
                unwrapElement(raw: unknown): Element | null;
                asStringId(value: unknown): string;
                parseLogicKind(value: unknown): unknown;
                kindFromJson(json: unknown): unknown;
                toPlainObject(value: unknown): Record<string, unknown> | null;
                callMaybe(fn: unknown, thisArg: unknown): unknown;
            };
            const helpers = Function(
                `${helperSource}; return __lamp7GenieMainWorld;`,
            )() as Helpers;
            const reader = Function(`return (${readerSource});`)() as typeof resolveSelectedLogicItems;
            const LogicEditor = helpers.readBinding('LogicEditor') as
                | LogicEditor
                | undefined;
            if (!LogicEditor) return null;

            const logics = LogicEditor.getAll();
            if (!Array.isArray(logics)) return null;

            return reader(
                logics as Parameters<typeof resolveSelectedLogicItems>[0],
                payload,
                helpers as Parameters<typeof resolveSelectedLogicItems>[2],
            );
        },
        [
            { logicIds },
            LOGIC_EDITOR_HELPER_SOURCE,
            mainWorldFunctionSource(resolveSelectedLogicItems),
        ],
    ) as Promise<EditSelectionItem[] | null>;
}
