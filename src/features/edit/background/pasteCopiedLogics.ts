import type { EditPasteLogicsResponseData } from '../../../shared/types/messages';
import { readFrameMemory } from '../../search/background/readFrameMemory';

interface PasteCopiedLogicsPayload {
    logics: unknown[];
}

type CopiedLogicJson = {
    id?: unknown;
    type?: unknown;
    varPrefix?: unknown;
    parentId?: unknown;
    [key: string]: unknown;
};

interface Logic {
    getId: () => string;
    validateLoadCompelete?: () => boolean;
}

interface LogicEditor {
    createLogic: (
        id: string,
        type: string,
        varPrefix: string,
        raw: Record<string, unknown>,
    ) => Logic;
    getAll: () => Logic[];
    resetLogicLevelAndSeqAll?: () => void;
}

interface LogicRenderer {
    renderLogics: (logics: unknown) => void;
}

interface LogicUtils {
    showError?: (logic: unknown) => void;
}

export async function pasteCopiedLogics(
    tabId: number,
    frameId: number,
    logics: unknown[],
): Promise<EditPasteLogicsResponseData | null> {
    return readFrameMemory(
        tabId,
        frameId,
        (payload: PasteCopiedLogicsPayload) => {
            const w = window as unknown as {
                LogicEditor?: LogicEditor;
                LogicRenderer?: LogicRenderer;
                LogicUtils?: LogicUtils;
            };
            const readGlobalBinding = (name: string): unknown => {
                try {
                    return Function(
                        `"use strict"; return typeof ${name} === "undefined" ? undefined : ${name};`,
                    )();
                } catch {
                    return undefined;
                }
            };

            const LogicEditor =
                w.LogicEditor ?? (readGlobalBinding('LogicEditor') as LogicEditor | undefined);
            const LogicRenderer =
                w.LogicRenderer ??
                (readGlobalBinding('LogicRenderer') as LogicRenderer | undefined);
            const LogicUtils =
                w.LogicUtils ?? (readGlobalBinding('LogicUtils') as LogicUtils | undefined);

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
            if (!LogicRenderer) {
                return {
                    createdCount: 0,
                    errors: [],
                    setupError: 'LogicRenderer를 찾을 수 없습니다.',
                };
            }
            if (typeof LogicRenderer.renderLogics !== 'function') {
                return {
                    createdCount: 0,
                    errors: [],
                    setupError: 'LogicRenderer.renderLogics를 사용할 수 없습니다.',
                };
            }

            const isObject = (v: unknown): v is CopiedLogicJson =>
                !!v && typeof v === 'object' && !Array.isArray(v);

            const asId = (value: unknown): string => {
                if (typeof value === 'string' && value.trim()) return value.trim();
                if (typeof value === 'number' && Number.isFinite(value)) return String(value);
                return '';
            };

            const sortByCopiedHierarchy = (items: CopiedLogicJson[]): CopiedLogicJson[] => {
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

            const copiedLogics = payload.logics.filter(isObject);
            const sortedLogics = sortByCopiedHierarchy(copiedLogics);
            const copiedIds = new Set(
                sortedLogics.map((logic) => asId(logic.id)).filter((id) => id.length > 0),
            );
            const oldIdToNewId = new Map<string, string>();
            const errors: Array<{ oldId: string; error: string }> = [];
            let createdCount = 0;

            for (const copied of sortedLogics) {
                const oldId = asId(copied.id);
                try {
                    if (!oldId) throw new Error('복사된 로직에 id가 없습니다.');
                    const type = asId(copied.type);
                    if (!type) throw new Error('복사된 로직에 type이 없습니다.');

                    const oldParentId = asId(copied.parentId);
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
                    const newId = asId(created.getId());
                    if (!newId) throw new Error('생성된 로직 id를 확인할 수 없습니다.');

                    oldIdToNewId.set(oldId, newId);
                    createdCount += 1;
                } catch (err) {
                    errors.push({
                        oldId,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }

            const allLogics = LogicEditor.getAll();
            LogicRenderer.renderLogics(allLogics);
            if (typeof LogicEditor.resetLogicLevelAndSeqAll === 'function') {
                LogicEditor.resetLogicLevelAndSeqAll();
            }
            allLogics.forEach((logic) => {
                try {
                    if (
                        typeof logic.validateLoadCompelete === 'function' &&
                        logic.validateLoadCompelete() === false
                    ) {
                        LogicUtils?.showError?.(logic);
                    }
                } catch {
                    /* validation/showError 실패는 붙여넣기 실패로 보지 않음 */
                }
            });

            return { createdCount, errors };
        },
        [{ logics }],
    );
}
