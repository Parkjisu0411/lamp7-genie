import type { SearchFilters } from '../../../shared/types/messages';

export interface QueryPayload {
    query: string;
    filters: SearchFilters;
}

type SearchableLogicKind = 'event' | 'transaction' | 'condition' | 'variable';

interface SearchableLogic {
    getElement(): unknown;
    getDisplayText(): string;
    getType(): SearchableLogicKind;
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

export type SearchMatchForMainWorld = {
    id: string;
    kind: SearchableLogicKind;
    label: string;
    snippet: string;
    matchStart: number;
    matchEnd: number;
    seq: string;
    matchedField: string;
    matchedValue: string;
};

interface MainWorldSearchHelpers {
    unwrapElement(raw: unknown): Element | null;
}

/**
 * 검색 기준 요약
 *
 * 1. 검색어는 앞뒤 공백을 제거하고 대소문자를 구분하지 않는다.
 * 2. 필터가 꺼진 로직 타입(event/transaction/condition/variable)은 검색하지 않는다.
 * 3. 한 로직 안에서는 우선순위가 가장 높은 첫 번째 매칭만 결과로 만든다.
 *    - 1순위: 공통 varPrefix
 *    - 2순위: 공통 displayText
 *    - 3순위: 타입별 상세 필드
 * 4. displayText에서 매칭된 경우에만 snippet 안의 matchStart/matchEnd를 계산한다.
 *    상세 필드나 varPrefix에서 매칭된 경우에는 snippet 위치를 특정할 수 없어 -1로 둔다.
 * 5. transaction id는 사용자가 get/insert/update/delete/modify/call 같은 verb를 붙여
 *    검색할 수 있어서, 검색어 쪽에서만 알려진 prefix를 제거한 뒤 id와도 비교한다.
 * 6. 매칭된 로직의 실제 DOM에는 data-genie-target-id를 붙인다.
 *    content script는 이 id로 DOM을 찾아 하이라이트만 적용한다.
 */
export function queryLogicEditorMatches(
    logics: SearchableLogic[],
    payload: QueryPayload,
    ctx: { dataAttr: string },
    helpers: MainWorldSearchHelpers,
): SearchMatchForMainWorld[] {
    const { query, filters } = payload;
    const rawQ = query.trim();
    if (!rawQ) return [];

    const lowerQ = rawQ.toLowerCase();
    const strippedQ = lowerQ.replace(/_/g, '');
    const matches: SearchMatchForMainWorld[] = [];

    const transactionIdPrefixesDesc: readonly string[] = [
        'insertrev',
        'sessionvariable',
        'modify',
        'remove',
        'delete',
        'update',
        'insert',
        'call',
        'mail',
        'save',
        'get',
        'restapi',
    ];

    const tailAfterTrxPrefix = (lowerNoUnderscore: string): string => {
        for (const prefix of transactionIdPrefixesDesc) {
            if (
                lowerNoUnderscore.startsWith(prefix) &&
                lowerNoUnderscore.length > prefix.length
            ) {
                return lowerNoUnderscore.slice(prefix.length);
            }
        }
        return lowerNoUnderscore;
    };

    const transactionIdMatches = (val: unknown): boolean => {
        if (typeof val !== 'string' || val.length === 0) return false;
        const targetBase = val.toLowerCase().replace(/_/g, '');
        if (targetBase.includes(strippedQ)) return true;

        const tailQ = tailAfterTrxPrefix(strippedQ);
        return (
            tailQ !== strippedQ &&
            tailQ.length > 0 &&
            (targetBase === tailQ || targetBase.startsWith(tailQ))
        );
    };

    const contains = (val: unknown, stripUnderscore: boolean): boolean => {
        if (typeof val !== 'string' || val.length === 0) return false;
        const target = stripUnderscore
            ? val.toLowerCase().replace(/_/g, '')
            : val.toLowerCase();
        const q = stripUnderscore ? strippedQ : lowerQ;
        return q.length > 0 && target.includes(q);
    };

    const detailMatch = (
        logic: SearchableLogic,
        kind: SearchableLogicKind,
    ): { field: string; value: string } | null => {
        if (kind === 'event') {
            const ev = logic.event;
            if (!ev) return null;
            if (contains(ev.id, false)) return { field: 'eventId', value: String(ev.id ?? '') };
            const inputs = Array.isArray(ev.inputParams) ? ev.inputParams : [];
            for (const ip of inputs) {
                if (contains(ip?.id, false)) {
                    return { field: 'eventInputParamId', value: String(ip.id ?? '') };
                }
            }
            for (const ip of inputs) {
                if (contains(ip?.eid, false)) {
                    return { field: 'eventInputParamEid', value: String(ip.eid ?? '') };
                }
            }
            return null;
        }

        if (kind === 'transaction') {
            const tr = logic.transaction;
            if (!tr) return null;
            if (transactionIdMatches(tr.id)) {
                return { field: 'transactionId', value: String(tr.id ?? '') };
            }
            const inputs = Array.isArray(tr.inputParams) ? tr.inputParams : [];
            const outputs = Array.isArray(tr.outParams) ? tr.outParams : [];
            for (const ip of inputs) {
                if (contains(ip?.id, false)) {
                    return {
                        field: 'transactionInputParamId',
                        value: String(ip.id ?? ''),
                    };
                }
            }
            for (const op of outputs) {
                if (contains(op?.id, false)) {
                    return {
                        field: 'transactionOutParamId',
                        value: String(op.id ?? ''),
                    };
                }
            }
            for (const ip of inputs) {
                if (contains(ip?.setParamId, false)) {
                    return {
                        field: 'transactionInputParamSetParamId',
                        value: String(ip.setParamId ?? ''),
                    };
                }
            }
            return null;
        }

        if (kind === 'variable') {
            const variable = logic.variable;
            if (!variable) return null;
            if (contains(variable.id, false)) {
                return { field: 'variableId', value: String(variable.id ?? '') };
            }
            if (contains(variable.setParamId, false)) {
                return {
                    field: 'variableSetParamId',
                    value: String(variable.setParamId ?? ''),
                };
            }
            return null;
        }

        const condition = logic.condition;
        if (!condition) return null;
        if (contains(condition.condParamId, false)) {
            return {
                field: 'conditionCondParamId',
                value: String(condition.condParamId ?? ''),
            };
        }
        if (contains(condition.condParamValue, false)) {
            return {
                field: 'conditionCondParamValue',
                value: String(condition.condParamValue ?? ''),
            };
        }
        if (contains(condition.setParamId, false)) {
            return {
                field: 'conditionSetParamId',
                value: String(condition.setParamId ?? ''),
            };
        }
        if (contains(condition.setParamValue, false)) {
            return {
                field: 'conditionSetParamValue',
                value: String(condition.setParamValue ?? ''),
            };
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

        if (safeVarPrefix && safeVarPrefix.toLowerCase().includes(lowerQ)) {
            matchedField = 'varPrefix';
            matchedValue = safeVarPrefix;
        }

        if (!matchedField && safeDisplay) {
            const idx = safeDisplay.toLowerCase().indexOf(lowerQ);
            if (idx !== -1) {
                matchedField = 'displayText';
                matchedValue = safeDisplay;
                matchStart = idx;
                matchEnd = idx + lowerQ.length;
            }
        }

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
            const el = helpers.unwrapElement(logic.getElement());
            if (el) el.setAttribute(ctx.dataAttr, id);
        } catch {
            // DOM marking failure should not cancel search results.
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
}
