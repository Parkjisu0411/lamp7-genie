import type { VisualComponentRecord } from '../visualSearch/types';
import type { VisualDeleteRequest, VisualDeleteSelection } from './types';

export type VisualJson =
    | string
    | number
    | boolean
    | null
    | VisualJson[]
    | { [key: string]: VisualJson };
export type VisualObject = { [key: string]: VisualJson };
export interface VisualCopyNode {
    key: string;
    scope: string;
    data: VisualObject;
    attributes: VisualObject;
    classes: string[];
    style: VisualObject;
    setting?: VisualObject;
    children: VisualCopyNode[];
}
export interface VisualCopyRoot {
    node: VisualCopyNode;
    type: string;
    label: string;
    eid: string;
    /** Kept for older clipboard readers; not a placement restriction. */
    parentRole?: string;
    /** Effective source model rules, including defaults omitted by toJSON(). */
    placement?: { draggable: boolean | string | string[]; textable: boolean };
}
export interface VisualClipboard {
    kind: 'lamp7-genie/visual';
    version: 1;
    id: string;
    createdAt: number;
    source: { origin: string; systemId: string; screenId: string };
    roots: VisualCopyRoot[];
    images: VisualObject;
    tables: Array<{ layoutKey: string; dtId: string; dcIds: string[] }>;
}
export type VisualPastePosition = 'inside' | 'before' | 'after';
export interface VisualPasteTarget {
    modelId: string;
    positions: VisualPastePosition[];
    /** Direct model views in getChildrenContainer(), in native DOM order. */
    children?: string[];
}
export interface VisualPasteLocation {
    modelId: string;
    position: VisualPastePosition;
}
export interface VisualPasteStart {
    modeId: string;
    clipboardId: string;
}
export interface VisualPasteRequest extends VisualDeleteRequest {
    clipboardId: string;
    position: VisualPastePosition;
}
export interface VisualTransferResult {
    clipboard?: VisualClipboard;
    records?: VisualComponentRecord[];
    targets?: VisualPasteTarget[];
    createdIds?: string[];
    removedConnections?: number;
    error?: string;
}
export interface VisualTransferPayload {
    action: 'copy' | 'targets' | 'paste';
    selection?: VisualDeleteSelection;
    clipboard?: VisualClipboard;
    position?: VisualPastePosition;
    source?: VisualClipboard['source'];
}
