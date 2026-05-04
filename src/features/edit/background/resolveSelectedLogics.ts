import type { EditSelectionItem } from '../../../shared/types/messages';
import { readFrameMemory } from '../../search/background/readFrameMemory';

interface ResolveSelectedLogicsPayload {
    logicIds: string[];
}

interface LogicEditor {
    getAll(): Logic[];
}

interface Logic {
    id?: unknown;
    logicId?: unknown;
    _id?: unknown;
    seq?: unknown;
    getId?: () => unknown;
    getElement?: () => unknown;
    getDisplayText?: () => unknown;
    getType?: () => unknown;
    toJson?: () => unknown;
}

export async function resolveSelectedLogics(
    tabId: number,
    frameId: number,
    logicIds: string[],
): Promise<EditSelectionItem[] | null> {
    return readFrameMemory(
        tabId,
        frameId,
        (payload: ResolveSelectedLogicsPayload) => {
            const LogicEditor = (window as unknown as { LogicEditor?: LogicEditor }).LogicEditor;
            if (!LogicEditor) return null;

            const logics = LogicEditor.getAll();
            if (!Array.isArray(logics)) return null;

            const unwrapElement = (raw: unknown): Element | null => {
                if (!raw) return null;
                const direct = raw as { id?: unknown; setAttribute?: unknown };
                if (typeof direct.setAttribute === 'function') {
                    return raw as Element;
                }
                const withGet = raw as { get?: (i: number) => unknown };
                if (typeof withGet.get === 'function') {
                    const got = withGet.get(0) as { setAttribute?: unknown } | null;
                    if (got && typeof got.setAttribute === 'function') {
                        return got as unknown as Element;
                    }
                }
                const indexed = raw as { 0?: unknown; length?: number };
                if (typeof indexed.length === 'number' && indexed[0]) {
                    const first = indexed[0] as { setAttribute?: unknown };
                    if (typeof first.setAttribute === 'function') {
                        return first as unknown as Element;
                    }
                }
                return null;
            };

            const stringifyId = (value: unknown): string | null => {
                if (typeof value === 'string' && value.trim()) return value.trim();
                if (typeof value === 'number' && Number.isFinite(value)) return String(value);
                return null;
            };

            const logicIdsFor = (logic: Logic): string[] => {
                const ids: string[] = [];
                const push = (value: unknown) => {
                    const id = stringifyId(value);
                    if (id) ids.push(id);
                };
                push(logic.id);
                push(logic.logicId);
                push(logic._id);
                try {
                    if (typeof logic.getId === 'function') push(logic.getId());
                } catch {
                    /* noop */
                }
                try {
                    if (typeof logic.getElement === 'function') {
                        const el = unwrapElement(logic.getElement());
                        push(el?.id);
                    }
                } catch {
                    /* noop */
                }
                return ids;
            };

            const byId = new Map<string, Logic>();
            for (const logic of logics) {
                for (const id of logicIdsFor(logic)) {
                    if (!byId.has(id)) byId.set(id, logic);
                }
            }

            type Item = {
                id: string;
                logicId: string;
                kind: 'event' | 'transaction' | 'condition' | 'variable';
                label: string;
                snippet: string;
                seq: string;
                json: unknown;
            };

            const items: Item[] = [];
            for (const logicId of payload.logicIds) {
                const logic = byId.get(logicId);
                if (!logic) {
                    console.error('[lamp7-genie] selected logic not found', { logicId });
                    continue;
                }

                let kind: Item['kind'] = 'event';
                try {
                    const rawKind = typeof logic.getType === 'function' ? logic.getType() : null;
                    if (
                        rawKind === 'event' ||
                        rawKind === 'transaction' ||
                        rawKind === 'condition' ||
                        rawKind === 'variable'
                    ) {
                        kind = rawKind;
                    }
                } catch {
                    /* keep default */
                }

                let label = '';
                try {
                    const display = typeof logic.getDisplayText === 'function'
                        ? logic.getDisplayText()
                        : '';
                    if (typeof display === 'string') label = display;
                } catch {
                    /* keep default */
                }

                let json: unknown = null;
                try {
                    if (typeof logic.toJson === 'function') {
                        json = logic.toJson();
                    } else {
                        console.error('[lamp7-genie] selected logic has no toJson()', { logicId });
                    }
                } catch (err) {
                    console.error('[lamp7-genie] selected logic toJson() failed', {
                        logicId,
                        err,
                    });
                }

                const seq = stringifyId(logic.seq) ?? '';
                items.push({
                    id: logicId,
                    logicId,
                    kind,
                    label: label || logicId,
                    snippet: label || logicId,
                    seq,
                    json,
                });
            }
            return items;
        },
        [{ logicIds }],
    ) as Promise<EditSelectionItem[] | null>;
}
