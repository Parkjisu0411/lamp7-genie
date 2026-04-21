import { TARGET_FRAME_PATH } from '../../../shared/constants';

export interface ResolvedFrame {
    frameId: number;
    url: string;
}

function isExactMatch(frameUrl: string): boolean {
    try {
        const { pathname } = new URL(frameUrl);
        // /s/<orgKey>/<tenantKey>/screens/event/eventSetting 처럼 동적 prefix 뒤에 위치
        // 쿼리스트링/해시는 pathname에서 이미 분리됨
        // 서버에 따라 pathname 끝에 / 가 붙을 수 있음 → 일치하도록 정규화
        const path = pathname.replace(/\/+$/, '') || '/';
        const suffix = TARGET_FRAME_PATH.replace(/\/+$/, '');
        return path.endsWith(suffix);
    } catch {
        return false;
    }
}

/**
 * 탭 내 모든 프레임을 조회해 TARGET_FRAME_PATH와 정확히 매치되는 첫 프레임을 반환.
 * 없으면 null.
 */
export async function resolveTargetFrame(tabId: number): Promise<ResolvedFrame | null> {
    try {
        const frames = await chrome.webNavigation.getAllFrames({ tabId });
        if (!frames) return null;
        const target = frames.find((f) => isExactMatch(f.url));
        return target ? { frameId: target.frameId, url: target.url } : null;
    } catch {
        return null;
    }
}
