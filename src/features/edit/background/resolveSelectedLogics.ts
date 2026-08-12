import type { EditSelectionItem, LogicKind } from '../../../shared/types/messages';
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
    parentId?: unknown;
    type?: unknown;
    varPrefix?: unknown;
    event?: unknown;
    transaction?: unknown;
    condition?: unknown;
    variable?: unknown;
    iteration?: unknown;
    loop?: unknown;
    getId?: () => unknown;
    getElement?: () => unknown;
    getDisplayText?: () => unknown;
    getType?: () => unknown;
    getVarPrefix?: () => unknown;
    toJson?: () => unknown;
    toJSON?: () => unknown;
    getJson?: () => unknown;
    serialize?: () => unknown;
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
            const readGlobalBinding = (name: string): unknown => {
                try {
                    return Function(
                        `"use strict"; return typeof ${name} === "undefined" ? undefined : ${name};`,
                    )();
                } catch {
                    return undefined;
                }
            };

            const w = window as unknown as { LogicEditor?: LogicEditor };
            const LogicEditor =
                w.LogicEditor ?? (readGlobalBinding('LogicEditor') as LogicEditor | undefined);
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
                kind: LogicKind;
                label: string;
                snippet: string;
                seq: string;
                json: unknown;
            };

            // MAIN world 주입 함수라 import한 헬퍼를 직접 호출할 수 없다.
            const parseKind = (value: unknown): LogicKind | null => {
                if (typeof value !== 'string') return null;
                const raw = value.trim().toLowerCase();
                if (
                    raw === 'event' ||
                    raw === 'transaction' ||
                    raw === 'condition' ||
                    raw === 'variable' ||
                    raw === 'iteration' ||
                    raw === 'control'
                ) {
                    return raw;
                }
                if (raw === 'loop') return 'iteration';
                if (raw === 'systemfunction' || raw === 'system_function') return 'control';
                return null;
            };

            const isPayloadObject = (value: unknown): boolean =>
                !!value && typeof value === 'object' && !Array.isArray(value);

            const kindFromJson = (json: unknown): LogicKind | null => {
                if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
                const raw = json as Record<string, unknown>;
                const fromType = parseKind(raw.type);
                if (fromType) return fromType;
                if (isPayloadObject(raw.transaction)) return 'transaction';
                if (isPayloadObject(raw.event)) return 'event';
                if (isPayloadObject(raw.condition)) return 'condition';
                if (isPayloadObject(raw.variable)) return 'variable';
                if (isPayloadObject(raw.iteration) || isPayloadObject(raw.loop)) {
                    return 'iteration';
                }
                if (isPayloadObject(raw.control) || isPayloadObject(raw.systemFunction)) {
                    return 'control';
                }
                return null;
            };

            /** DOM/함수 없는 plain object로 만들어 executeScript·메시지 전달이 되게 함 */
            const toPlainObject = (value: unknown): Record<string, unknown> | null => {
                if (value == null) return null;
                if (typeof value === 'string') {
                    try {
                        const parsed: unknown = JSON.parse(value);
                        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                            return parsed as Record<string, unknown>;
                        }
                    } catch {
                        return null;
                    }
                    return null;
                }
                if (typeof value !== 'object' || Array.isArray(value)) return null;
                try {
                    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
                } catch {
                    /* circular / DOM 등 — 수동 카피 */
                }

                const src = value as Record<string, unknown>;
                const out: Record<string, unknown> = {};
                for (const key of Object.keys(src)) {
                    const v = src[key];
                    const t = typeof v;
                    if (v == null || t === 'string' || t === 'number' || t === 'boolean') {
                        out[key] = v;
                        continue;
                    }
                    if (t === 'object') {
                        try {
                            out[key] = JSON.parse(JSON.stringify(v));
                        } catch {
                            /* skip non-serializable field */
                        }
                    }
                }
                return Object.keys(out).length > 0 ? out : null;
            };

            const callMaybe = (fn: unknown, thisArg: unknown): unknown => {
                if (typeof fn !== 'function') return undefined;
                try {
                    return (fn as (this: unknown) => unknown).call(thisArg);
                } catch {
                    return undefined;
                }
            };

            const extractJson = (logic: Logic): Record<string, unknown> | null => {
                const methodCandidates = [
                    logic.toJson,
                    logic.toJSON,
                    logic.getJson,
                    logic.serialize,
                ];
                for (const method of methodCandidates) {
                    const plain = toPlainObject(callMaybe(method, logic));
                    if (plain && (plain.type || plain.id)) return plain;
                    if (plain) return plain;
                }

                // 프로퍼티에 이미 plain json이 있는 경우
                for (const key of ['json', 'data', '_data', 'raw'] as const) {
                    const plain = toPlainObject((logic as Record<string, unknown>)[key]);
                    if (plain) return plain;
                }

                // 최후: 검색에서 쓰는 필드들로 최소 구조 조립
                let id = '';
                try {
                    id =
                        stringifyId(
                            typeof logic.getId === 'function' ? logic.getId() : logic.id,
                        ) ?? '';
                } catch {
                    id = stringifyId(logic.id) ?? '';
                }
                let type =
                    stringifyId(
                        typeof logic.getType === 'function'
                            ? callMaybe(logic.getType, logic)
                            : logic.type,
                    ) ?? '';
                let varPrefix = '';
                try {
                    varPrefix =
                        stringifyId(
                            typeof logic.getVarPrefix === 'function'
                                ? logic.getVarPrefix()
                                : logic.varPrefix,
                        ) ?? '';
                } catch {
                    varPrefix = stringifyId(logic.varPrefix) ?? '';
                }

                const assembled: Record<string, unknown> = {
                    id,
                    type,
                    varPrefix,
                    parentId: stringifyId(logic.parentId) ?? '',
                    seq: stringifyId(logic.seq) ?? '',
                };
                for (const key of [
                    'event',
                    'transaction',
                    'condition',
                    'variable',
                    'iteration',
                    'loop',
                    'control',
                    'systemFunction',
                ] as const) {
                    const plain = toPlainObject(
                        (logic as Record<string, unknown>)[key],
                    );
                    if (plain) assembled[key] = plain;
                }

                const plainAssembled = toPlainObject(assembled);
                if (plainAssembled && (plainAssembled.type || plainAssembled.id)) {
                    return plainAssembled;
                }
                return null;
            };

            const items: Item[] = [];
            for (const logicId of payload.logicIds) {
                const logic = byId.get(logicId);
                if (!logic) {
                    console.error('[lamp7-genie] selected logic not found', { logicId });
                    continue;
                }

                let label = '';
                try {
                    const display =
                        typeof logic.getDisplayText === 'function'
                            ? logic.getDisplayText()
                            : '';
                    if (typeof display === 'string') label = display;
                } catch {
                    /* keep default */
                }

                let json = extractJson(logic);
                if (!json) {
                    console.error('[lamp7-genie] selected logic json extract failed', {
                        logicId,
                    });
                }

                let kind: LogicKind = 'event';
                try {
                    const fromGetType =
                        typeof logic.getType === 'function'
                            ? parseKind(logic.getType())
                            : null;
                    // JSON.type / payload 추론을 getType보다 우선 — 복사 목록 아이콘과 일치
                    kind = kindFromJson(json) ?? fromGetType ?? 'event';
                } catch {
                    kind = kindFromJson(json) ?? 'event';
                }

                // 복사·붙여넣기용 JSON에 type이 빠지지 않게 보정
                if (json && !parseKind(json.type)) {
                    json = { ...json, type: kind };
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
