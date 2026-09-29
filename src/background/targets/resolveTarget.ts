import { readFrameMemory } from '../../shared/mainWorld/readFrameMemory';
import { targetKindFromUrl } from '../../shared/targets/routes';
import type { TargetContext } from '../../shared/targets/types';
import { targetAdapters } from './adapters';
import { probeTarget } from './probeTarget';

export async function resolveTarget(tabId: number): Promise<TargetContext | null> {
    try {
        const frames = await chrome.webNavigation.getAllFrames({ tabId });
        const candidates = (frames ?? []).filter(f => !f.errorOccurred && targetKindFromUrl(f.url));
        const probes = await Promise.allSettled(candidates.map(async frame => {
            const kind = targetKindFromUrl(frame.url)!;
            if (!frame.documentId) return null;
            const probe = await readFrameMemory(tabId, frame.frameId, probeTarget, [kind], frame.documentId);
            if (!probe?.visible || targetKindFromUrl(probe.url) !== kind) return null;
            return { frame, kind, probe };
        }));
        const visible = probes.flatMap(result =>
            result.status === 'fulfilled' && result.value ? [result.value] : []);
        // An open eventSetting owns the context, including while it is loading.
        // Do not fall through to the visual editor behind an unready logic modal.
        const logic = visible.filter(candidate => candidate.kind === 'logic');
        const preferred = logic.length ? logic : visible;
        const focused = preferred.filter(candidate => candidate.probe.focused);
        const choices = focused.length ? focused : preferred;
        if (choices.length !== 1 || !choices[0].probe.ready) return null;
        const { frame, kind, probe } = choices[0];
        return {
            kind, tabId, frameId: frame.frameId, documentId: frame.documentId,
            sessionId: JSON.stringify([tabId, frame.documentId, kind, probe.url, probe.screenId]),
            url: probe.url, screenId: probe.screenId,
            capabilities: targetAdapters[kind].capabilities,
        };
    } catch {
        return null;
    }
}
