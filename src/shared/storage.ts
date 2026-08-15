/** chrome.storage.local 키 — content / extension 컨텍스트 공통 */

import { withExtensionContext } from './extensionContext';

export const STORAGE_KEYS = {
    PANEL_OFFSET_Y: 'genie.panelOffsetY',
    SEARCH_FILTERS: 'genie.searchFilters',
    EDIT_CLIPBOARD_LOGICS: 'genie.editClipboardLogics',
} as const;

export type StoredFilterKey =
    | 'event'
    | 'transaction'
    | 'condition'
    | 'variable';

export type StoredSearchFilters = Record<StoredFilterKey, boolean>;

const defaultFilters: StoredSearchFilters = {
    event: true,
    transaction: true,
    condition: true,
    variable: true,
};

export async function getPanelOffsetY(): Promise<number> {
    return withExtensionContext(async () => {
        const r = await chrome.storage.local.get(STORAGE_KEYS.PANEL_OFFSET_Y);
        const v = r[STORAGE_KEYS.PANEL_OFFSET_Y];
        return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    }, 0);
}

export async function setPanelOffsetY(y: number): Promise<void> {
    await withExtensionContext(async () => {
        await chrome.storage.local.set({ [STORAGE_KEYS.PANEL_OFFSET_Y]: y });
    }, undefined);
}

export async function getSearchFilters(): Promise<StoredSearchFilters> {
    return withExtensionContext(async () => {
        const r = await chrome.storage.local.get(STORAGE_KEYS.SEARCH_FILTERS);
        const raw = r[STORAGE_KEYS.SEARCH_FILTERS] as
            | Partial<StoredSearchFilters>
            | undefined;
        if (!raw || typeof raw !== 'object') return { ...defaultFilters };
        return {
            event: !!raw.event,
            transaction: !!raw.transaction,
            condition: !!raw.condition,
            variable: !!raw.variable,
        };
    }, { ...defaultFilters });
}

export async function setSearchFilters(f: StoredSearchFilters): Promise<void> {
    await withExtensionContext(async () => {
        await chrome.storage.local.set({ [STORAGE_KEYS.SEARCH_FILTERS]: f });
    }, undefined);
}

export async function getEditClipboardLogics(): Promise<unknown[]> {
    return withExtensionContext(async () => {
        const r = await chrome.storage.local.get(STORAGE_KEYS.EDIT_CLIPBOARD_LOGICS);
        const raw = r[STORAGE_KEYS.EDIT_CLIPBOARD_LOGICS];
        return Array.isArray(raw) ? raw : [];
    }, []);
}

export async function setEditClipboardLogics(logics: unknown[]): Promise<void> {
    await withExtensionContext(async () => {
        await chrome.storage.local.set({
            [STORAGE_KEYS.EDIT_CLIPBOARD_LOGICS]: logics,
        });
    }, undefined);
}
