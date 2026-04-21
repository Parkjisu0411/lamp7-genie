import type {
    SearchFilters,
    SearchMatch,
    SearchMatchField,
    SearchMatchKind,
} from '../../../shared/types/messages';
import { readFrameMemory } from './readFrameMemory';

export interface QueryPayload {
    query: string;
    filters: SearchFilters;
}

interface LogicEditor {
    getAll(): Logic[];
}

// Logic.getElement()는 실제로 jQuery 객체를 반환한다 (순수 DOM Element 아님).
// MAIN world 주입 함수 안에서 .get(0) / [0]으로 언래핑하며,
// 구조 변경에 대비해 DOM/커스텀 래퍼 fallback도 함께 둔다.
//
// 상세 데이터 필드(event/transaction/condition/variable)는 직접 프로퍼티로 접근한다.
// (LogicEditor가 제공하는 raw JSON 구조 기준)
interface Logic {
    getElement(): unknown;
    getDisplayText(): string;
    getType(): 'event' | 'transaction' | 'condition' | 'variable';
    getVarPrefix(): string;
    seq: string;
    event?: {
        id?: string;
        inputParams?: Array<{ id?: string; eid?: string }>;
    } | null;
    transaction?: {
        id?: string;
        inputParams?: Array<{ id?: string; setParamId?: string }>;
        outParams?: Array<{ id?: string }>;
    } | null;
    condition?: {
        condParamId?: string;
        condParamValue?: string;
        setParamId?: string;
        setParamValue?: string;
    } | null;
    variable?: {
        id?: string;
        setParamId?: string;
    } | null;
}

/**
 * 대상 프레임의 MAIN world에서 window.LogicEditor를 순회하며
 * 각 Logic에 대해 우선순위 기반으로 매칭을 수행한다.
 *
 * 우선순위 (Logic 단위로 최상위 1개만 기록):
 *   1) varPrefix              (공통)
 *   2) displayText            (공통, snippet 내 하이라이트 위치 계산)
 *   3) 타입별 상세 필드        (event/transaction/condition/variable)
 *
 * 매칭된 Logic의 DOM element에 data-genie-target-id를 부여하고,
 * 정렬은 원래 seq 순(=getAll 순서)을 유지한다.
 *
 * ⚠️ 주입 함수는 MAIN world에서 직렬화 실행되므로:
 *   - import / 외부 클로저 / 외부 타입 참조 금지 (런타임에 없음)
 *   - chrome.* API 금지
 *   - DOM element, 함수, Map/Set 등 non-cloneable 값은 return 불가
 *     → 반드시 string id로만 다리 놓기
 */
export async function queryFrameData(
    tabId: number,
    frameId: number,
    payload: QueryPayload,
): Promise<SearchMatch[] | null> {
    return readFrameMemory(
        tabId,
        frameId,
        (p: QueryPayload, ctx: { dataAttr: string }) => {
            const LogicEditor = (window as unknown as { LogicEditor?: LogicEditor }).LogicEditor;
            if (!LogicEditor) return [];

            const { query, filters } = p;
            const rawQ = query.trim();
            if (!rawQ) return [];
            const lowerQ = rawQ.toLowerCase();
            const strippedQ = lowerQ.replace(/_/g, '');

            // MAIN world에서 SearchMatchField 타입 참조가 불가하므로 string으로 다룸.
            // 경계에서 SearchMatch[]로 캐스팅.
            type Match = {
                id: string;
                kind: 'event' | 'transaction' | 'condition' | 'variable';
                label: string;
                snippet: string;
                matchStart: number;
                matchEnd: number;
                seq: string;
                matchedField: string;
                matchedValue: string;
            };
            const matches: Match[] = [];

            const logics = LogicEditor.getAll();
            if (!Array.isArray(logics)) return [];

            // getElement()가 순수 DOM Element가 아닐 수 있으므로 안전하게 언래핑.
            // jQuery, 커스텀 래퍼, 배열-유사 객체 등 다양한 케이스를 허용한다.
            const unwrapElement = (raw: unknown): Element | null => {
                if (!raw) return null;
                const direct = raw as { setAttribute?: unknown };
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
                const wrapper = raw as {
                    el?: unknown;
                    element?: unknown;
                    node?: unknown;
                    dom?: unknown;
                    $el?: unknown;
                };
                for (const cand of [
                    wrapper.el,
                    wrapper.element,
                    wrapper.node,
                    wrapper.dom,
                    wrapper.$el,
                ]) {
                    if (cand && typeof (cand as { setAttribute?: unknown }).setAttribute === 'function') {
                        return cand as Element;
                    }
                }
                return null;
            };

            // 필드 값이 쿼리를 포함하는지 검사.
            // stripUnderscore: transaction.id처럼 코드에선 '_'가 제거된 형태로 노출되는 필드에 한해 사용.
            const contains = (val: unknown, stripUnderscore: boolean): boolean => {
                if (typeof val !== 'string' || val.length === 0) return false;
                const target = stripUnderscore
                    ? val.toLowerCase().replace(/_/g, '')
                    : val.toLowerCase();
                const q = stripUnderscore ? strippedQ : lowerQ;
                if (q.length === 0) return false;
                return target.indexOf(q) !== -1;
            };

            // 타입별 상세 필드 매칭. 매칭된 경우 최초로 걸린 필드 식별자 + 원본 값을 반환.
            // 필드 순회 순서는 "사용자가 정한 필드 나열 순서" = 암묵적 우선순위로 사용.
            const detailMatch = (
                logic: Logic,
                kind: 'event' | 'transaction' | 'condition' | 'variable',
            ): { field: string; value: string } | null => {
                if (kind === 'event') {
                    const ev = logic.event;
                    if (!ev) return null;
                    if (contains(ev.id, false)) {
                        return { field: 'eventId', value: String(ev.id ?? '') };
                    }
                    const inputs = Array.isArray(ev.inputParams) ? ev.inputParams : [];
                    for (const ip of inputs) {
                        if (contains(ip && ip.id, false)) {
                            return { field: 'eventInputParamId', value: String(ip.id ?? '') };
                        }
                    }
                    for (const ip of inputs) {
                        if (contains(ip && ip.eid, false)) {
                            return { field: 'eventInputParamEid', value: String(ip.eid ?? '') };
                        }
                    }
                    return null;
                }
                if (kind === 'transaction') {
                    const tr = logic.transaction;
                    if (!tr) return null;
                    if (contains(tr.id, true)) {
                        return { field: 'transactionId', value: String(tr.id ?? '') };
                    }
                    const inputs = Array.isArray(tr.inputParams) ? tr.inputParams : [];
                    const outputs = Array.isArray(tr.outParams) ? tr.outParams : [];
                    for (const ip of inputs) {
                        if (contains(ip && ip.id, false)) {
                            return {
                                field: 'transactionInputParamId',
                                value: String(ip.id ?? ''),
                            };
                        }
                    }
                    for (const op of outputs) {
                        if (contains(op && op.id, false)) {
                            return {
                                field: 'transactionOutParamId',
                                value: String(op.id ?? ''),
                            };
                        }
                    }
                    for (const ip of inputs) {
                        if (contains(ip && ip.setParamId, false)) {
                            return {
                                field: 'transactionInputParamSetParamId',
                                value: String(ip.setParamId ?? ''),
                            };
                        }
                    }
                    return null;
                }
                if (kind === 'variable') {
                    const v = logic.variable;
                    if (!v) return null;
                    if (contains(v.id, false)) {
                        return { field: 'variableId', value: String(v.id ?? '') };
                    }
                    if (contains(v.setParamId, false)) {
                        return { field: 'variableSetParamId', value: String(v.setParamId ?? '') };
                    }
                    return null;
                }
                if (kind === 'condition') {
                    const c = logic.condition;
                    if (!c) return null;
                    if (contains(c.condParamId, false)) {
                        return {
                            field: 'conditionCondParamId',
                            value: String(c.condParamId ?? ''),
                        };
                    }
                    if (contains(c.condParamValue, false)) {
                        return {
                            field: 'conditionCondParamValue',
                            value: String(c.condParamValue ?? ''),
                        };
                    }
                    if (contains(c.setParamId, false)) {
                        return {
                            field: 'conditionSetParamId',
                            value: String(c.setParamId ?? ''),
                        };
                    }
                    if (contains(c.setParamValue, false)) {
                        return {
                            field: 'conditionSetParamValue',
                            value: String(c.setParamValue ?? ''),
                        };
                    }
                    return null;
                }
                return null;
            };

            logics.forEach((logic, index) => {
                const kind = logic.getType();
                if (!filters[kind]) return;

                const displayText =
                    typeof logic.getDisplayText === 'function' ? logic.getDisplayText() : '';
                const varPrefix =
                    typeof logic.getVarPrefix === 'function' ? logic.getVarPrefix() : '';
                const safeDisplay = typeof displayText === 'string' ? displayText : '';
                const safeVarPrefix = typeof varPrefix === 'string' ? varPrefix : '';

                let matchedField: string | null = null;
                let matchedValue = '';
                let matchStart = -1;
                let matchEnd = -1;

                // Stage 1: varPrefix
                if (safeVarPrefix && safeVarPrefix.toLowerCase().indexOf(lowerQ) !== -1) {
                    matchedField = 'varPrefix';
                    matchedValue = safeVarPrefix;
                }

                // Stage 2: displayText (snippet 내 하이라이트 위치도 계산)
                if (!matchedField && safeDisplay) {
                    const idx = safeDisplay.toLowerCase().indexOf(lowerQ);
                    if (idx !== -1) {
                        matchedField = 'displayText';
                        matchedValue = safeDisplay;
                        matchStart = idx;
                        matchEnd = idx + lowerQ.length;
                    }
                }

                // Stage 3: 타입별 상세 필드
                if (!matchedField) {
                    const detail = detailMatch(logic, kind);
                    if (detail) {
                        matchedField = detail.field;
                        matchedValue = detail.value;
                    }
                }

                if (!matchedField) return;

                const id = `${kind}-${index}`;
                try {
                    const el = unwrapElement(logic.getElement());
                    if (el) el.setAttribute(ctx.dataAttr, id);
                } catch {
                    // DOM 태깅 실패는 검색 자체를 중단시키지 않는다.
                }

                matches.push({
                    id,
                    kind,
                    label: safeDisplay,
                    snippet: safeDisplay,
                    matchStart,
                    matchEnd,
                    seq: String(logic.seq ?? ''),
                    matchedField,
                    matchedValue,
                });
            });

            return matches;
        },
        [payload, { dataAttr: 'data-genie-target-id' }],
    ) as Promise<SearchMatch[] | null>;
}

// SearchMatchKind/SearchMatchField 타입을 MAIN world 쪽에서는 string으로만 다뤘으므로
// 경계에서 타입을 좁혀주는 헬퍼(현재는 사용 안 하지만 향후 검증용).
export function isValidKind(k: string): k is SearchMatchKind {
    return k === 'event' || k === 'transaction' || k === 'condition' || k === 'variable';
}

const VALID_MATCH_FIELDS: readonly SearchMatchField[] = [
    'varPrefix',
    'displayText',
    'eventId',
    'eventInputParamId',
    'eventInputParamEid',
    'transactionId',
    'transactionInputParamId',
    'transactionOutParamId',
    'transactionInputParamSetParamId',
    'variableId',
    'variableSetParamId',
    'conditionCondParamId',
    'conditionCondParamValue',
    'conditionSetParamId',
    'conditionSetParamValue',
];

export function isValidMatchField(f: string): f is SearchMatchField {
    return (VALID_MATCH_FIELDS as readonly string[]).indexOf(f) !== -1;
}
