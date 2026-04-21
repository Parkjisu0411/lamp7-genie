export type MessageAction =
    | 'TOGGLE_PANEL'
    | 'HIDE_PANEL'
    | 'FOCUS_SEARCH'
    | 'TARGET_AVAILABILITY'
    | 'REQUEST_TARGET_AVAILABILITY'
    | 'SEARCH_START'
    | 'SEARCH_NAVIGATE'
    | 'SEARCH_CLEAR'
    | 'HIGHLIGHT_TARGETS'
    | 'CLIPBOARD_COPY'
    | 'CLIPBOARD_PASTE'
    | 'EDIT_START'
    | 'EDIT_STOP'
    | 'EDIT_NOTIFY_INACTIVE'
    | 'EDIT_UI_SYNC';

export interface ExtensionMessage {
    action: MessageAction;
    // action별 payload shape은 각 사이트에서 캐스트로 해석.
    // (추후 discriminated union 리팩토링 대상)
    payload?: unknown;
}

export interface ExtensionResponse {
    success: boolean;
    data?: unknown;
    error?: string;
}

export type SearchMatchKind = 'event' | 'transaction' | 'condition' | 'variable';

export interface SearchFilters {
    event: boolean;
    transaction: boolean;
    condition: boolean;
    variable: boolean;
}

// 매칭이 발견된 필드 식별자.
// 우선순위: varPrefix > displayText > 타입별 상세
// displayText 이외의 필드로 매칭된 경우 snippet 내 하이라이트 위치를 특정할 수 없어
// matchStart/matchEnd는 -1로 둔다 (UI에서 가드).
export type SearchMatchField =
    | 'varPrefix'
    | 'displayText'
    | 'eventId'
    | 'eventInputParamId'
    | 'eventInputParamEid'
    | 'transactionId'
    | 'transactionInputParamId'
    | 'transactionOutParamId'
    | 'transactionInputParamSetParamId'
    | 'variableId'
    | 'variableSetParamId'
    | 'conditionCondParamId'
    | 'conditionCondParamValue'
    | 'conditionSetParamId'
    | 'conditionSetParamValue';

export interface SearchMatch {
    id: string;
    kind: SearchMatchKind;
    label: string;
    snippet: string;
    matchStart: number;
    matchEnd: number;
    seq: string;
    matchedField: SearchMatchField;
    // 실제로 쿼리가 매칭된 원본 필드 값. 툴팁에서 "어느 값이 걸렸는지" 노출용.
    matchedValue: string;
}

export interface SearchStartPayload {
    query: string;
    filters: SearchFilters;
}

export interface SearchNavigatePayload {
    matchId: string;
}

export interface HighlightTargetsPayload {
    matches: SearchMatch[];
}

/** eventSetting 대상 iframe 존재 여부 (background → top frame). 미니 버튼 표시 여부에 사용 */
export interface TargetAvailabilityPayload {
    available: boolean;
}

export interface SearchStartResponseData {
    count: number;
    matches: SearchMatch[];
}

/** top frame 편집 탭 등 — iframe에서 Esc 등으로 편집 종료 시 동기화 */
export interface EditUiSyncPayload {
    logicEditActive: boolean;
}
