import type {
    CreatedLamp7Logic,
    LogicEditorMainWorld,
    LogicRendererMainWorld,
    LogicUtilsMainWorld,
    MainWorldHelperSubset,
} from '../../../shared/mainWorld/logicTypes';
import type { EditPasteLogicsResponseData } from '../../../shared/types/messages';

export interface PasteCopiedLogicsPayload {
    logics: unknown[];
}

type CopiedLogicJson = {
    id?: unknown;
    type?: unknown;
    varPrefix?: unknown;
    parentId?: unknown;
    [key: string]: unknown;
};

type PasteHelpers = MainWorldHelperSubset<'readBinding' | 'asStringId'>;

export function pasteCopiedLogicsInMainWorld(
    payload: PasteCopiedLogicsPayload,
    helpers: PasteHelpers,
): EditPasteLogicsResponseData {
    try {
        const isObject = (v: unknown): v is CopiedLogicJson =>
            !!v && typeof v === 'object' && !Array.isArray(v);

        const sortByCopiedHierarchy = (
            items: CopiedLogicJson[],
            asId: (value: unknown) => string,
        ): CopiedLogicJson[] => {
            const byId = new Map<string, CopiedLogicJson>();
            for (const logic of items) {
                const id = asId(logic.id);
                if (id) byId.set(id, logic);
            }

            const sorted: CopiedLogicJson[] = [];
            const visiting = new Set<string>();
            const visited = new Set<string>();
            const pushedNoId = new Set<CopiedLogicJson>();

            const visit = (logic: CopiedLogicJson) => {
                const id = asId(logic.id);
                if (!id) {
                    if (!pushedNoId.has(logic)) {
                        pushedNoId.add(logic);
                        sorted.push(logic);
                    }
                    return;
                }
                if (visited.has(id)) return;
                if (visiting.has(id)) {
                    console.error('[lamp7-genie] pasted logic hierarchy cycle detected', { id });
                    visiting.delete(id);
                    visited.add(id);
                    sorted.push(logic);
                    return;
                }

                visiting.add(id);
                const parentId = asId(logic.parentId);
                const parent = parentId ? byId.get(parentId) : undefined;
                if (parent) visit(parent);
                visiting.delete(id);
                visited.add(id);
                sorted.push(logic);
            };

            for (const logic of items) visit(logic);
            return sorted;
        };

        const LogicEditor = helpers.readBinding('LogicEditor') as
            | LogicEditorMainWorld
            | undefined;
        const LogicRenderer = helpers.readBinding('LogicRenderer') as
            | LogicRendererMainWorld
            | undefined;
        const LogicUtils = helpers.readBinding('LogicUtils') as
            | LogicUtilsMainWorld
            | undefined;

        if (!LogicEditor) {
            return {
                createdCount: 0,
                errors: [],
                setupError: 'LogicEditor를 찾을 수 없습니다.',
            };
        }
        if (typeof LogicEditor.createLogic !== 'function') {
            return {
                createdCount: 0,
                errors: [],
                setupError: 'LogicEditor.createLogic을 사용할 수 없습니다.',
            };
        }

        const sortedLogics = sortByCopiedHierarchy(
            payload.logics.filter(isObject),
            helpers.asStringId,
        );
        const copiedIds = new Set(
            sortedLogics
                .map((logic) => helpers.asStringId(logic.id))
                .filter((id) => id.length > 0),
        );
        const oldIdToNewId = new Map<string, string>();
        const createdLogics: CreatedLamp7Logic[] = [];
        const errors: Array<{ oldId: string; error: string }> = [];
        let createdCount = 0;

        for (const copied of sortedLogics) {
            const oldId = helpers.asStringId(copied.id);
            try {
                if (!oldId) throw new Error('복사한 로직에 id가 없습니다.');
                const type = helpers.asStringId(copied.type);
                if (!type) throw new Error('복사한 로직에 type이 없습니다.');

                const oldParentId = helpers.asStringId(copied.parentId);
                const parentWasCopied = oldParentId && copiedIds.has(oldParentId);
                const newParentId = parentWasCopied
                    ? oldIdToNewId.get(oldParentId) ?? ''
                    : '';

                if (parentWasCopied && !newParentId) {
                    throw new Error('부모 로직이 아직 생성되지 않았습니다.');
                }

                const raw: Record<string, unknown> = {
                    ...copied,
                    id: '',
                    varPrefix: '',
                    parentId: newParentId,
                };
                const created = LogicEditor.createLogic('', type, '', raw);
                const newId = helpers.asStringId(created.getId());
                if (!newId) {
                    throw new Error('생성된 로직 id를 확인할 수 없습니다.');
                }

                oldIdToNewId.set(oldId, newId);
                createdLogics.push(created);
                createdCount += 1;
            } catch (err) {
                errors.push({
                    oldId,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        if (createdLogics.length > 0) {
            if (!LogicRenderer || typeof LogicRenderer.renderLogics !== 'function') {
                return {
                    createdCount,
                    errors,
                    setupError:
                        '로직은 생성했지만 LogicRenderer.renderLogics를 사용할 수 없습니다.',
                };
            }
            try {
                LogicRenderer.renderLogics(createdLogics);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error('[lamp7-genie] renderLogics failed', err);
                return {
                    createdCount,
                    errors,
                    setupError: `로직은 생성했지만 화면 렌더에 실패했습니다: ${message}`,
                };
            }
        }

        if (typeof LogicEditor.resetLogicLevelAndSeqAll === 'function') {
            try {
                LogicEditor.resetLogicLevelAndSeqAll();
            } catch (err) {
                console.error('[lamp7-genie] resetLogicLevelAndSeqAll failed', err);
            }
        }

        createdLogics.forEach((logic) => {
            try {
                if (
                    typeof logic.validateLoadCompelete === 'function' &&
                    logic.validateLoadCompelete() === false
                ) {
                    LogicUtils?.showError?.(logic);
                }
            } catch {
                /* validation/showError failure is not a paste failure */
            }
        });

        return { createdCount, errors };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[lamp7-genie] pasteCopiedLogics crashed', err);
        return {
            createdCount: 0,
            errors: [],
            setupError: `붙여넣기 중 오류: ${message}`,
        };
    }
}
