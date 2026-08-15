import { LOGIC_EDITOR_HELPER_SOURCE } from '../../../shared/mainWorld/logicEditorSource';
import { readFrameMemory } from '../../../shared/mainWorld/readFrameMemory';
import { mainWorldFunctionSource } from '../../../shared/mainWorld/sourceBuilder';
import type { SearchMatch } from '../../../shared/types/messages';
import {
    queryLogicEditorMatches,
    type QueryPayload,
} from './searchMatcher';

interface LogicEditor {
    getAll(): unknown[];
}

export type { QueryPayload };

export async function queryFrameData(
    tabId: number,
    frameId: number,
    payload: QueryPayload,
): Promise<SearchMatch[] | null> {
    return readFrameMemory(
        tabId,
        frameId,
        (
            p: QueryPayload,
            ctx: {
                dataAttr: string;
                helperSource: string;
                matcherSource: string;
            },
        ) => {
            type Helpers = {
                readBinding(name: string): unknown;
                unwrapElement(raw: unknown): Element | null;
            };

            const helpers = Function(
                `${ctx.helperSource}; return __lamp7GenieMainWorld;`,
            )() as Helpers;
            const matcher = Function(
                `return (${ctx.matcherSource});`,
            )() as typeof queryLogicEditorMatches;

            const LogicEditor = helpers.readBinding('LogicEditor') as
                | LogicEditor
                | undefined;
            if (!LogicEditor) return [];

            const logics = LogicEditor.getAll();
            if (!Array.isArray(logics)) return [];

            return matcher(
                logics as Parameters<typeof queryLogicEditorMatches>[0],
                p,
                { dataAttr: ctx.dataAttr },
                helpers,
            );
        },
        [
            payload,
            {
                dataAttr: 'data-genie-target-id',
                helperSource: LOGIC_EDITOR_HELPER_SOURCE,
                matcherSource: mainWorldFunctionSource(queryLogicEditorMatches),
            },
        ],
    ) as Promise<SearchMatch[] | null>;
}
