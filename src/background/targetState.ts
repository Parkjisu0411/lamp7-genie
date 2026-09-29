import { resolveTarget } from './targets/resolveTarget';
import type { TargetContext } from '../shared/targets/types';
import type { ExtensionResponse, TargetAvailabilityPayload } from '../shared/types/messages';
import { safeSendToTopFrame, sendToFrame } from './messaging';
import { targetAdapters } from './targets/adapters';

const targets = new Map<number, { identity: string; target: TargetContext }>();
const queues = new Map<number, Promise<unknown>>();
const removedTabs = new Set<number>();
const storageKey = (tabId: number) => `genie-target:${tabId}`;

export function forgetTabTarget(tabId: number): void {
    targets.delete(tabId);
    void chrome.storage.session.remove(storageKey(tabId));
}

export function removeTabTarget(tabId: number): void {
    removedTabs.add(tabId);
    forgetTabTarget(tabId);
}

export function getCurrentTarget(tabId: number): TargetContext | undefined {
    return targets.get(tabId)?.target;
}

export function isCurrentTarget(tabId: number, sessionId: string): boolean {
    return targets.get(tabId)?.target.sessionId === sessionId;
}

export async function refreshTabTarget(tabId: number): Promise<TargetContext | null> {
    return enqueueTargetUpdate(tabId, async () => {
        if (removedTabs.has(tabId)) return null;
        // MV3 service workers sleep; preserve the panel session across worker restarts.
        if (!targets.has(tabId)) {
            const stored = (await chrome.storage.session.get<Record<string,
                { identity: string; target: TargetContext } | undefined>>(storageKey(tabId)))[storageKey(tabId)];
            if (stored?.target?.tabId === tabId && typeof stored.identity === 'string') targets.set(tabId, stored);
        }
        const resolved = await resolveTarget(tabId);
        if (removedTabs.has(tabId)) return null;
        const previous = targets.get(tabId);
        if (previous?.identity === resolved?.sessionId) {
            const target = previous?.target ?? null;
            if (target) target.capabilities = targetAdapters[target.kind].capabilities;
            await safeSendToTopFrame(tabId, {
                action: 'TARGET_AVAILABILITY', payload: { available: !!target, target },
            });
            return target;
        }
        targets.delete(tabId);
        if (previous) {
            await sendToFrame(tabId, previous.target.frameId, {
                action: 'TARGET_RESET', targetSessionId: previous.target.sessionId,
            }, previous.target.documentId);
        }
        const target = resolved ? { ...resolved, sessionId: crypto.randomUUID() } : null;
        if (removedTabs.has(tabId)) return null;
        if (target && resolved) {
            const state = { identity: resolved.sessionId, target };
            targets.set(tabId, state);
            await chrome.storage.session.set({ [storageKey(tabId)]: state });
        } else {
            await chrome.storage.session.remove(storageKey(tabId));
        }
        await safeSendToTopFrame(tabId, {
            action: 'TARGET_AVAILABILITY', payload: { available: !!target, target },
        });
        return target;
    });
}

async function enqueueTargetUpdate<T>(tabId: number, update: () => Promise<T>): Promise<T> {
    const pending = (queues.get(tabId) ?? Promise.resolve()).catch(() => {}).then(update);
    queues.set(tabId, pending);
    try { return await pending; }
    finally { if (queues.get(tabId) === pending) queues.delete(tabId); }
}

export async function dismissPanelAndStopEdit(tabId: number): Promise<void> {
    await enqueueTargetUpdate(tabId, async () => {
        const target = targets.get(tabId)?.target;
        // RESET permanently retires this session in the content script. Invalidate both
        // caches before cleanup so pending work stops and reopening gets a fresh session.
        targets.delete(tabId);
        await chrome.storage.session.remove(storageKey(tabId));
        if (target) {
            await sendToFrame(tabId, target.frameId, {
                action: 'TARGET_RESET', targetSessionId: target.sessionId,
            }, target.documentId);
        }
        await safeSendToTopFrame(tabId, { action: 'HIDE_PANEL' });
    });
}

export async function syncTabTargetState(tabId: number): Promise<void> {
    const target = await refreshTabTarget(tabId);
    await chrome.action.setTitle({ tabId, title: target
        ? `Lamp7 Genie · ${target.kind === 'logic' ? 'Logic' : 'Visual editor'}`
        : 'Lamp7 Genie (이벤트 설정 / 화면 설계에서 사용 가능)',
    }).catch(() => {});
}

export async function requestTargetAvailability(
    tabId: number,
): Promise<ExtensionResponse> {
    const target = await refreshTabTarget(tabId);
    return {
        success: true,
        data: { available: !!target, target } satisfies TargetAvailabilityPayload,
    };
}
