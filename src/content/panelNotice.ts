export type NoticeKind = 'info' | 'success' | 'error';

export interface PanelNotice {
    id: number;
    kind: NoticeKind;
    message: string;
}

export type NotifyPanel = (kind: NoticeKind, message: string) => void;
export type SetPanelGuide = (message: string) => void;
