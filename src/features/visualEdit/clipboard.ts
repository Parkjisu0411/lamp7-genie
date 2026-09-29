import { isExtensionContextValid } from '../../shared/extensionContext';
import type { VisualClipboard } from './transferTypes';

export const VISUAL_CLIPBOARD_KEY = 'genie.visualClipboard.v1';
export function isVisualClipboard(value: unknown): value is VisualClipboard {
    if (!value || typeof value !== 'object') return false;
    const item = value as VisualClipboard;
    return (
        item.kind === 'lamp7-genie/visual' &&
        item.version === 1 &&
        typeof item.id === 'string' &&
        !!item.id &&
        Array.isArray(item.roots) &&
        !!item.roots.length &&
        !!item.source &&
        !!item.images &&
        Array.isArray(item.tables)
    );
}
export async function getVisualClipboard(): Promise<VisualClipboard | undefined> {
    if (!isExtensionContextValid()) return;
    const data = (await chrome.storage.local.get(VISUAL_CLIPBOARD_KEY))[VISUAL_CLIPBOARD_KEY];
    return isVisualClipboard(data) ? data : undefined;
}
export async function setVisualClipboard(value: VisualClipboard): Promise<void> {
    if (!isExtensionContextValid()) throw new Error('확장 프로그램 연결이 종료되었습니다.');
    // One atomic write: a quota failure keeps the previous clipboard intact.
    await chrome.storage.local.set({ [VISUAL_CLIPBOARD_KEY]: value });
}
