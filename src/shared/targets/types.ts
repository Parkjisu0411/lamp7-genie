export type TargetKind = 'logic' | 'visual';

export interface TargetContext {
    kind: TargetKind;
    tabId: number;
    frameId: number;
    documentId: string;
    sessionId: string;
    url: string;
    screenId: string | null;
    capabilities: { search: boolean; edit: boolean };
}

export interface TargetProbe {
    visible: boolean;
    focused: boolean;
    ready: boolean;
    url: string;
    screenId: string | null;
    missing: string[];
}
