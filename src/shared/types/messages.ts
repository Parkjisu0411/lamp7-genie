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
    | 'EDIT_START'
    | 'EDIT_STOP'
    | 'EDIT_NOTIFY_INACTIVE'
    | 'EDIT_SELECTION_CHANGED'
    | 'EDIT_DELETE_SELECTED'
    | 'EDIT_COPY_SELECTED'
    | 'EDIT_PASTE_LOGICS'
    | 'EDIT_UI_SYNC'
    | 'GENIE_DISMISS';

export interface ExtensionResponse {
    success: boolean;
    data?: unknown;
    error?: string;
}

export type SearchMatchKind = 'event' | 'transaction' | 'condition' | 'variable';

export type LogicKind = SearchMatchKind | 'iteration' | 'control';

export interface SearchFilters {
    event: boolean;
    transaction: boolean;
    condition: boolean;
    variable: boolean;
}

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

export interface TargetAvailabilityPayload {
    available: boolean;
}

export interface SearchStartResponseData {
    count: number;
    matches: SearchMatch[];
}

export interface EditUiSyncPayload {
    logicEditActive: boolean;
    selectedItems?: EditSelectionItem[];
    error?: string;
}

export interface EditSelectionChangedPayload {
    logicIds: string[];
    error?: string;
}

export interface EditDeleteSelectedPayload {
    logicIds: string[];
}

export interface EditDeleteSelectedResponseData {
    deletedCount: number;
    errors: Array<{ logicId: string; error: string }>;
}

export interface EditCopySelectedPayload {
    logicIds: string[];
}

export interface EditCopySelectedResponseData {
    logics: unknown[];
    count: number;
}

export interface EditPasteLogicsPayload {
    logics: unknown[];
}

export interface EditPasteLogicsResponseData {
    createdCount: number;
    errors: Array<{ oldId: string; error: string }>;
    setupError?: string;
}

export interface EditSelectionItem {
    id: string;
    logicId: string;
    kind: LogicKind;
    label: string;
    snippet: string;
    seq: string;
    json: unknown;
}

type MessageWithoutPayload<A extends MessageAction> = {
    action: A;
};

type MessageWithPayload<A extends MessageAction, P> = {
    action: A;
    payload: P;
};

export type ExtensionMessage =
    | MessageWithoutPayload<'TOGGLE_PANEL'>
    | MessageWithoutPayload<'HIDE_PANEL'>
    | MessageWithoutPayload<'FOCUS_SEARCH'>
    | MessageWithPayload<'TARGET_AVAILABILITY', TargetAvailabilityPayload>
    | MessageWithoutPayload<'REQUEST_TARGET_AVAILABILITY'>
    | MessageWithPayload<'SEARCH_START', SearchStartPayload>
    | MessageWithPayload<'SEARCH_NAVIGATE', SearchNavigatePayload>
    | MessageWithoutPayload<'SEARCH_CLEAR'>
    | MessageWithPayload<'HIGHLIGHT_TARGETS', HighlightTargetsPayload>
    | MessageWithoutPayload<'EDIT_START'>
    | MessageWithoutPayload<'EDIT_STOP'>
    | MessageWithoutPayload<'EDIT_NOTIFY_INACTIVE'>
    | MessageWithPayload<'EDIT_SELECTION_CHANGED', EditSelectionChangedPayload>
    | MessageWithPayload<'EDIT_DELETE_SELECTED', EditDeleteSelectedPayload>
    | MessageWithPayload<'EDIT_COPY_SELECTED', EditCopySelectedPayload>
    | MessageWithPayload<'EDIT_PASTE_LOGICS', EditPasteLogicsPayload>
    | MessageWithPayload<'EDIT_UI_SYNC', EditUiSyncPayload>
    | MessageWithoutPayload<'GENIE_DISMISS'>;

export interface ExtensionResponseDataByAction {
    REQUEST_TARGET_AVAILABILITY: TargetAvailabilityPayload;
    SEARCH_START: SearchStartResponseData;
    HIGHLIGHT_TARGETS: SearchStartResponseData;
    EDIT_SELECTION_CHANGED: { count: number };
    EDIT_COPY_SELECTED: EditCopySelectedResponseData;
    EDIT_DELETE_SELECTED: EditDeleteSelectedResponseData;
    EDIT_PASTE_LOGICS: EditPasteLogicsResponseData;
}

export type ExtensionResponseFor<A extends MessageAction> = Omit<
    ExtensionResponse,
    'data'
> & {
    data?: A extends keyof ExtensionResponseDataByAction
        ? ExtensionResponseDataByAction[A]
        : unknown;
};
