export interface VisualSearchFilters {
    ids: boolean;
    text: boolean;
}
export type VisualSearchField = 'eid' | 'vid' | 'domId' | 'name' | 'text';
export interface VisualLocation {
    modelId: string;
    domId: string;
    eid: string;
    vid: string;
    /** Canvas-body-relative element path for paste targets without a DOM id. */
    domPath?: number[];
}
export interface VisualComponentRecord {
    location: VisualLocation;
    /** A linked label/internal caption is searched through its owning component. */
    ownerModelId?: string;
    /** Model ancestry is independent of DOM geometry (including hidden descendants). */
    parentModelId?: string | null;
    selectable?: boolean;
    /** Read-only structure used to validate Lamp7 editing units, separately from search grouping. */
    structure?: {
        tag: string;
        classes: string[];
        removable: boolean;
        /** Native buttonType setting; elList alone does not make a button a Grid tool. */
        buttonTypes?: string[];
    };
    type: string;
    componentType: string;
    name: string;
    label: string;
    description: string;
    text: string;
    gridId: string | null;
    /** Concrete table/column position; used only to collapse search-list duplicates. */
    gridColumn?: { id: string; role: 'column' | 'cell' | 'content' };
    hidden: boolean;
    rendered: boolean;
    order: number;
}
export interface VisualSearchMatch {
    id: string;
    name: string;
    label: string;
    description: string;
    type: string;
    eid: string;
    hidden: boolean;
    rendered: boolean;
    locations: VisualLocation[];
    field: VisualSearchField;
    value: string;
    matchStart: number;
    matchEnd: number;
}
export interface VisualSearchRequest {
    requestId: string;
    query: string;
    filters: VisualSearchFilters;
    activeId?: string;
    /** Background refresh preserves viewport; explicit search/navigation may scroll. */
    scroll: boolean;
}
export interface VisualSearchResult {
    matches: VisualSearchMatch[];
    activeId: string | null;
    notice?: string;
}
export interface VisualPresentation extends VisualSearchResult {
    requestId: string;
    scroll: boolean;
}
