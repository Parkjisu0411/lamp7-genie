import { useCallback, useEffect, useState } from 'react';
import { isExtensionContextValid } from '../../shared/extensionContext';
import { logicKindFromJson } from '../../shared/logicKind';
import {
    getEditClipboardLogics,
    STORAGE_KEYS,
} from '../../shared/storage';
import type { EditSelectionItem, LogicKind } from '../../shared/types/messages';

export type EditListItem = Pick<
    EditSelectionItem,
    'id' | 'logicId' | 'kind' | 'snippet' | 'seq' | 'json'
>;

export function nextIndexFor(items: unknown[]): number {
    return items.length > 0 ? 0 : -1;
}

function copiedLogicToListItem(logic: unknown, index: number): EditListItem | null {
    if (!logic || typeof logic !== 'object' || Array.isArray(logic)) return null;
    const raw = logic as Record<string, unknown>;
    const asString = (value: unknown): string =>
        typeof value === 'string'
            ? value
            : typeof value === 'number' && Number.isFinite(value)
              ? String(value)
              : '';
    const kind: LogicKind = logicKindFromJson(logic) ?? 'event';
    const logicId = asString(raw.id) || `copied-${index}`;
    const label =
        asString(raw.displayText) ||
        asString(raw.name) ||
        asString(raw.label) ||
        logicId;
    return {
        id: logicId,
        logicId,
        kind,
        snippet: label,
        seq: asString(raw.seq),
        json: logic,
    };
}

function copiedLogicsToListItems(logics: unknown[]): EditListItem[] {
    return logics
        .map((logic, index) => copiedLogicToListItem(logic, index))
        .filter((item): item is EditListItem => item !== null);
}

export function useEditClipboard(setCurrentIndex: (index: number) => void) {
    const [copiedItems, setCopiedItems] = useState<EditListItem[]>([]);
    const [copiedLogics, setCopiedLogics] = useState<unknown[]>([]);

    const applyClipboardState = useCallback((logics: unknown[]) => {
        setCopiedLogics(logics);
        setCopiedItems(copiedLogicsToListItems(logics));
        setCurrentIndex(nextIndexFor(logics));
    }, [setCurrentIndex]);

    useEffect(() => {
        void getEditClipboardLogics().then(applyClipboardState);
    }, [applyClipboardState]);

    useEffect(() => {
        if (!isExtensionContextValid()) return;
        const onChanged = (
            changes: { [key: string]: chrome.storage.StorageChange },
            areaName: string,
        ) => {
            if (!isExtensionContextValid()) return;
            if (areaName !== 'local') return;
            const change = changes[STORAGE_KEYS.EDIT_CLIPBOARD_LOGICS];
            if (!change) return;
            const next = Array.isArray(change.newValue) ? change.newValue : [];
            applyClipboardState(next);
        };
        try {
            chrome.storage.onChanged.addListener(onChanged);
        } catch {
            return;
        }
        return () => {
            try {
                chrome.storage.onChanged.removeListener(onChanged);
            } catch {
                /* extension context invalidated */
            }
        };
    }, [applyClipboardState]);

    return {
        copiedItems,
        copiedLogics,
        applyClipboardState,
    };
}
