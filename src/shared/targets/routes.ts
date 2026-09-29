import type { TargetKind } from './types';

/** Local studio ScreenController / EventController routes. Never match canvas/about:blank. */
export function targetKindFromUrl(url: string): TargetKind | null {
    try {
        const parsed = new URL(url);
        if (!['https:', 'http:'].includes(parsed.protocol)) return null;
        const path = parsed.pathname.replace(/\/+$/, '');
        if (path.endsWith('/screens/event/eventSetting')) return 'logic';
        if (/\/screens\/(edit|new)$/.test(path)) return 'visual';
    } catch {
        // Not a supported web page.
    }
    return null;
}
