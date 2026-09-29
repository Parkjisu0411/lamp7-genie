import type { PasteProgress } from '../pasteProgress';
import type {
    VisualPasteRequest,
    VisualPasteStart,
    VisualTransferResult,
} from '../../features/visualEdit/transferTypes';
import type {
    VisualDeleteRequest,
    VisualDeleteResult,
    VisualDeleteSelection,
    VisualEditMount,
    VisualEditState,
} from '../../features/visualEdit/types';
import type {
    VisualPresentation,
    VisualSearchRequest,
    VisualSearchResult,
} from '../../features/visualSearch/types';
import type { TargetContext } from '../targets/types';

export type MessageAction =
    | 'PASTE_PROGRESS'
    | 'TOGGLE_PANEL'
    | 'HIDE_PANEL'
    | 'FOCUS_SEARCH'
    | 'TARGET_AVAILABILITY'
    | 'REQUEST_TARGET_AVAILABILITY'
    | 'TARGET_CONTEXT_DIRTY'
    | 'TARGET_RESET'
    | 'SEARCH_START'
    | 'SEARCH_NAVIGATE'
    | 'SEARCH_CLEAR'
    | 'HIGHLIGHT_TARGETS'
    | 'VISUAL_SEARCH_START'
    | 'VISUAL_SEARCH_NAVIGATE'
    | 'VISUAL_SEARCH_CLEAR'
    | 'VISUAL_SEARCH_PRESENT'
    | 'VISUAL_SEARCH_DIRTY'
    | 'VISUAL_SEARCH_CHANGED'
    | 'VISUAL_EDIT_START'
    | 'VISUAL_EDIT_STOP'
    | 'VISUAL_EDIT_CLEAR'
    | 'VISUAL_EDIT_DESELECT'
    | 'VISUAL_EDIT_DELETE'
    | 'VISUAL_EDIT_COPY'
    | 'VISUAL_EDIT_PASTE_START'
    | 'VISUAL_EDIT_PASTE'
    | 'VISUAL_EDIT_TRANSFER_BEGIN'
    | 'VISUAL_EDIT_DELETE_BEGIN'
    | 'VISUAL_EDIT_DELETE_END'
    | 'VISUAL_EDIT_DELETE_ABORT'
    | 'VISUAL_EDIT_MOUNT'
    | 'VISUAL_EDIT_STATE'
    | 'EDIT_START'
    | 'EDIT_STOP'
    | 'EDIT_CLEAR'
    | 'EDIT_DESELECT'
    | 'EDIT_NOTIFY_INACTIVE'
    | 'EDIT_SELECTION_CHANGED'
    | 'EDIT_DELETE_SELECTED'
    | 'EDIT_COPY_SELECTED'
    | 'EDIT_PASTE_START'
    | 'EDIT_PASTE_MOUNT'
    | 'EDIT_PASTE_PICKED'
    | 'EDIT_PASTE_BEGIN'
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
    target: TargetContext | null;
}

export interface SearchStartResponseData {
    count: number;
    matches: SearchMatch[];
}

export interface EditUiSyncPayload {
    modeId?: string;
    logicEditActive: boolean;
    paste?: import('../../features/edit/pasteTypes').LogicPastePick;
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
    modeId: string;
    location: import('../../features/edit/pasteTypes').LogicPasteLocation;
}

export interface EditPasteLogicsResponseData {
    createdCount: number;
    errors: Array<{ oldId: string; error: string }>;
    setupError?: string;
    validationWarnings?: number;
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

type ExtensionMessageBody =
    | MessageWithPayload<'PASTE_PROGRESS', PasteProgress>
    | MessageWithoutPayload<'TOGGLE_PANEL'>
    | MessageWithoutPayload<'HIDE_PANEL'>
    | MessageWithoutPayload<'FOCUS_SEARCH'>
    | MessageWithPayload<'TARGET_AVAILABILITY', TargetAvailabilityPayload>
    | MessageWithoutPayload<'REQUEST_TARGET_AVAILABILITY'>
    | MessageWithoutPayload<'TARGET_CONTEXT_DIRTY'>
    | MessageWithoutPayload<'TARGET_RESET'>
    | MessageWithPayload<'SEARCH_START', SearchStartPayload>
    | MessageWithPayload<'SEARCH_NAVIGATE', SearchNavigatePayload>
    | MessageWithoutPayload<'SEARCH_CLEAR'>
    | MessageWithPayload<'HIGHLIGHT_TARGETS', HighlightTargetsPayload>
    | MessageWithPayload<'VISUAL_SEARCH_START', VisualSearchRequest>
    | MessageWithPayload<'VISUAL_SEARCH_NAVIGATE', VisualSearchRequest>
    | MessageWithPayload<'VISUAL_SEARCH_CLEAR', { requestId: string }>
    | MessageWithPayload<'VISUAL_SEARCH_PRESENT', VisualPresentation>
    | MessageWithoutPayload<'VISUAL_SEARCH_DIRTY'>
    | MessageWithoutPayload<'VISUAL_SEARCH_CHANGED'>
    | MessageWithPayload<'VISUAL_EDIT_START', { modeId: string }>
    | MessageWithPayload<'VISUAL_EDIT_STOP', { modeId: string }>
    | MessageWithPayload<'VISUAL_EDIT_CLEAR', { modeId: string }>
    | MessageWithPayload<'VISUAL_EDIT_DESELECT', { modeId: string; modelId: string }>
    | MessageWithPayload<'VISUAL_EDIT_DELETE', VisualDeleteRequest>
    | MessageWithPayload<'VISUAL_EDIT_COPY', VisualDeleteRequest>
    | MessageWithPayload<'VISUAL_EDIT_PASTE_START', VisualPasteStart>
    | MessageWithPayload<'VISUAL_EDIT_PASTE', VisualPasteRequest>
    | MessageWithPayload<
          'VISUAL_EDIT_TRANSFER_BEGIN',
          VisualDeleteRequest & {
              operation: 'copy' | 'paste';
              clipboardId?: string;
              position?: 'inside' | 'before' | 'after';
          }
      >
    | MessageWithPayload<'VISUAL_EDIT_DELETE_BEGIN', VisualDeleteRequest>
    | MessageWithPayload<
          'VISUAL_EDIT_DELETE_END',
          { modeId: string; requestId: string; result: VisualDeleteResult }
      >
    | MessageWithPayload<'VISUAL_EDIT_DELETE_ABORT', { modeId: string; requestId: string }>
    | MessageWithPayload<'VISUAL_EDIT_MOUNT', VisualEditMount>
    | MessageWithPayload<'VISUAL_EDIT_STATE', VisualEditState>
    | MessageWithoutPayload<'EDIT_START'>
    | (MessageWithoutPayload<'EDIT_STOP'> & { modeId?: string })
    | MessageWithoutPayload<'EDIT_CLEAR'>
    | MessageWithPayload<'EDIT_DESELECT', { logicId: string }>
    | (MessageWithoutPayload<'EDIT_NOTIFY_INACTIVE'> & { modeId?: string })
    | MessageWithPayload<'EDIT_SELECTION_CHANGED', EditSelectionChangedPayload>
    | MessageWithPayload<'EDIT_DELETE_SELECTED', EditDeleteSelectedPayload>
    | MessageWithPayload<'EDIT_COPY_SELECTED', EditCopySelectedPayload>
    | MessageWithPayload<'EDIT_PASTE_START', { modeId: string }>
    | MessageWithPayload<
          'EDIT_PASTE_MOUNT',
          import('../../features/edit/pasteTypes').LogicPasteContext
      >
    | MessageWithPayload<
          'EDIT_PASTE_PICKED',
          import('../../features/edit/pasteTypes').LogicPastePick
      >
    | MessageWithPayload<
          'EDIT_PASTE_BEGIN',
          import('../../features/edit/pasteTypes').LogicPastePick
      >
    | MessageWithPayload<'EDIT_PASTE_LOGICS', EditPasteLogicsPayload>
    | MessageWithPayload<'EDIT_UI_SYNC', EditUiSyncPayload>
    | MessageWithoutPayload<'GENIE_DISMISS'>;

export type ExtensionMessage = ExtensionMessageBody & { targetSessionId?: string };

export interface ExtensionResponseDataByAction {
    REQUEST_TARGET_AVAILABILITY: TargetAvailabilityPayload;
    SEARCH_START: SearchStartResponseData;
    HIGHLIGHT_TARGETS: SearchStartResponseData;
    VISUAL_SEARCH_START: VisualSearchResult;
    VISUAL_SEARCH_NAVIGATE: VisualSearchResult;
    VISUAL_SEARCH_PRESENT: { notice?: string };
    VISUAL_EDIT_DELETE: VisualDeleteResult;
    VISUAL_EDIT_COPY: VisualTransferResult;
    VISUAL_EDIT_PASTE: VisualTransferResult;
    VISUAL_EDIT_TRANSFER_BEGIN: VisualDeleteSelection;
    VISUAL_EDIT_DELETE_BEGIN: VisualDeleteSelection;
    EDIT_SELECTION_CHANGED: { count: number };
    EDIT_COPY_SELECTED: EditCopySelectedResponseData;
    EDIT_DELETE_SELECTED: EditDeleteSelectedResponseData;
    EDIT_PASTE_LOGICS: EditPasteLogicsResponseData;
    EDIT_PASTE_BEGIN: import('../../features/edit/pasteTypes').LogicPasteContext;
}

export type ExtensionResponseFor<A extends MessageAction> = Omit<ExtensionResponse, 'data'> & {
    data?: A extends keyof ExtensionResponseDataByAction
        ? ExtensionResponseDataByAction[A]
        : unknown;
};
