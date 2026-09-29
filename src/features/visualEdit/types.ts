import type { VisualComponentRecord, VisualLocation } from '../visualSearch/types';
import type { VisualPasteLocation, VisualPasteTarget } from './transferTypes';

export interface VisualSelectionItem {
    id: string;
    type: string;
    eid: string;
    label: string;
    includesChildren: boolean;
    includesHidden: boolean;
    kind?: 'component' | 'grid';
}
export interface VisualEditState {
    modeId: string;
    active: boolean;
    items: VisualSelectionItem[];
    notice?: string;
    deleting?: boolean;
    purpose?: 'paste';
    clipboardId?: string;
    pasteLocation?: VisualPasteLocation;
    operation?: 'copy' | 'paste' | 'delete';
}

export interface VisualDeleteRequest {
    modeId: string;
    requestId: string;
    modelIds: string[];
}
export interface VisualDeleteSelection {
    modeId: string;
    requestId: string;
    locations: VisualLocation[];
}
export interface VisualDeleteResult {
    deletedIds: string[];
    cascadedIds: string[];
    remainingIds: string[];
    failed?: { id: string; message: string };
    error?: string;
    records?: VisualComponentRecord[];
}
export interface VisualEditMount {
    modeId: string;
    records: VisualComponentRecord[];
    paste?: { targets: VisualPasteTarget[]; clipboardId: string };
}
