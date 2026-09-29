export interface LogicPasteLocation {
    anchorId: string;
    position: 'inside' | 'after' | 'root-start' | 'root-end';
}

export interface LogicPasteContext {
    modeId: string;
    tabKey: string;
    ownerId: string;
    signature: string;
    rows: Array<{ id: string; canNest: boolean }>;
}

export interface LogicPastePick {
    modeId: string;
    location: LogicPasteLocation;
}
