import type { LogicKind } from '../types/messages';

export interface MainWorldHelpers {
    readBinding(name: string): unknown;
    unwrapElement(raw: unknown): Element | null;
    asStringId(value: unknown): string;
    parseLogicKind(value: unknown): LogicKind | null;
    kindFromJson(json: unknown): LogicKind | null;
    toPlainObject(value: unknown): Record<string, unknown> | null;
    callMaybe(fn: unknown, thisArg: unknown): unknown;
}

export type MainWorldHelperSubset<K extends keyof MainWorldHelpers> = Pick<
    MainWorldHelpers,
    K
>;

export interface Lamp7Logic {
    id?: unknown;
    logicId?: unknown;
    _id?: unknown;
    seq?: unknown;
    lvl?: unknown;
    parentId?: unknown;
    type?: unknown;
    varPrefix?: unknown;
    event?: unknown;
    transaction?: unknown;
    condition?: unknown;
    variable?: unknown;
    iteration?: unknown;
    loop?: unknown;
    control?: unknown;
    systemFunction?: unknown;
    getId?: () => unknown;
    getType?: () => unknown;
    getVarPrefix?: () => unknown;
    getDisplayText?: () => unknown;
    getElement?: () => unknown;
    getPrev?: () => Lamp7Logic | unknown;
    getNext?: () => Lamp7Logic | unknown;
    getParent?: () => Lamp7Logic[] | unknown[];
    getChildren?: () => Lamp7Logic[] | unknown[];
    setDisable?: () => boolean | void;
    setEditable?: () => void;
    isExpanded?: () => boolean;
    expand?: () => void;
    collapse?: () => void;
    validate?: () => void;
    validateLoadCompelete?: () => boolean;
    toJson?: () => unknown;
    toJSON?: () => unknown;
    getJson?: () => unknown;
    serialize?: () => unknown;
}

export interface CreatedLamp7Logic extends Lamp7Logic {
    getId: () => string;
}

export interface LogicEditorMainWorld {
    get?: (logicId: string) => Lamp7Logic | unknown;
    getAll: () => unknown[];
    createLogic?: (
        id: string,
        type: string,
        varPrefix: string,
        raw: Record<string, unknown>,
    ) => CreatedLamp7Logic;
    createLogicView?: (
        parentLogicId: string,
        id: string,
        type: string,
        varPrefix: string,
        raw: Record<string, unknown>,
    ) => Lamp7Logic;
    removeLogic?: (logicId: string) => unknown;
    resetLogicLevelAndSeqAll?: () => void;
}

export interface LogicRendererMainWorld {
    logic?: (logic: Lamp7Logic | unknown) => HTMLElement | unknown;
    renderLogics: (logics: unknown) => void;
}

export interface LogicEventHandlerMainWorld {
    clickLogic?: (event: MouseEvent) => void;
    clickLogicView?: (event: MouseEvent) => void;
    clickLogicIcon?: (event: MouseEvent) => void;
    clickLogicExpandToggle?: (event: MouseEvent) => void;
    clickLogicAdd?: (event: MouseEvent) => void;
    clickLogicDelete?: (event: MouseEvent) => void;
    clickLogicMoveToggle?: (event: MouseEvent) => void;
    mouseoverLogic?: (event: MouseEvent) => void;
    mouseoutLogic?: (event: MouseEvent) => void;
    keyDown?: (event: KeyboardEvent) => void;
    setLogicBlockNestedSortable?: (opts: { disabled: boolean }) => void;
}

export interface DivTabHostMainWorld {
    divTab?: (selector: string) => unknown;
}
