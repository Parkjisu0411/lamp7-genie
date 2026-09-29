import { sendRuntimeMessageQuietly } from '../../shared/messaging';
import { intersectRect, projectCanvasRect, type Rect } from './geometry';
import type { VisualLocation, VisualPresentation } from './types';

let session:
    | { id: string; update(presentation: VisualPresentation): string | undefined; dispose(): void }
    | undefined;

export function clearVisualSearch(): void {
    session?.dispose();
    session = undefined;
}

export function showVisualSearch(
    presentation: VisualPresentation,
    sessionId: string,
): string | undefined {
    if (session?.id !== sessionId) {
        clearVisualSearch();
        session = createOverlaySession(sessionId);
    }
    return session.update(presentation);
}

function createOverlaySession(sessionId: string) {
    let data: VisualPresentation = { requestId: '', matches: [], activeId: null, scroll: false };
    let frame: HTMLIFrameElement | null = null;
    let canvasDocument: Document | null = null;
    let frameDisposers: Array<() => void> = [];
    const disposers: Array<() => void> = [];
    let raf = 0;
    let dirtyTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const host = document.createElement('div');
    host.id = 'lamp7-genie-visual-overlay';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
        'position:fixed;inset:0;pointer-events:none;z-index:2147483000;overflow:hidden;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent =
        '.box{position:absolute;box-sizing:border-box;border:2px dashed #d97706;pointer-events:none}.active{border:3px solid #ea580c;background:rgba(251,146,60,.08)}.label{position:absolute;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px/20px sans-serif;color:#fff;background:#9a3412;padding:0 5px;border-radius:3px;}';
    const layer = document.createElement('div');
    shadow.append(style, layer);
    document.body.appendChild(host);

    const dirty = () => {
        if (disposed || dirtyTimer !== undefined) return;
        dirtyTimer = setTimeout(() => {
            dirtyTimer = undefined;
            sendRuntimeMessageQuietly({
                action: 'VISUAL_SEARCH_DIRTY',
                targetSessionId: sessionId,
            });
        }, 240);
    };
    const resolveLocation = (location: VisualLocation): HTMLElement | null => {
        if (!canvasDocument || !location.domId) return null;
        const el = canvasDocument.getElementById(location.domId);
        if (
            !el ||
            (el.getAttribute('eid') ?? '') !== location.eid ||
            (el.getAttribute('vid') ?? '') !== location.vid
        )
            return null;
        return el;
    };
    const isVisible = (el: HTMLElement) => {
        if (!el.isConnected || !el.getClientRects().length) return false;
        for (let node: HTMLElement | null = el; node; node = node.parentElement) {
            const computed = node.ownerDocument.defaultView?.getComputedStyle(node);
            if (
                node.hidden ||
                node.getAttribute('data-hidden') === 'Y' ||
                computed?.display === 'none' ||
                computed?.visibility === 'hidden' ||
                computed?.opacity === '0'
            )
                return false;
        }
        return true;
    };
    const listen = (target: EventTarget, name: string, fn: EventListener, list = disposers) => {
        target.addEventListener(name, fn, true);
        list.push(() => target.removeEventListener(name, fn, true));
    };
    const attachCanvas = () => {
        const next = document.querySelector<HTMLIFrameElement>('#gjs .gjs-frame');
        const nextDoc = next?.contentDocument ?? null;
        if (next === frame && nextDoc === canvasDocument) return;
        frameDisposers.forEach((dispose) => dispose());
        frameDisposers = [];
        frame = next;
        canvasDocument = nextDoc;
        if (!canvasDocument) return;
        listen(canvasDocument, 'scroll', schedulePaint, frameDisposers);
        const win = canvasDocument.defaultView;
        if (win) listen(win, 'resize', schedulePaint, frameDisposers);
        const observer = new MutationObserver((records) => {
            schedulePaint();
            if (
                records.some(
                    (record) =>
                        record.type !== 'attributes' ||
                        !['class', 'style'].includes(record.attributeName ?? '') ||
                        !(record.target as Element).classList?.contains('gjs-hovered'),
                )
            )
                dirty();
        });
        observer.observe(canvasDocument.documentElement, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: [
                'id',
                'eid',
                'vid',
                'class',
                'style',
                'hidden',
                'data-hidden',
                'value',
                'placeholder',
            ],
        });
        frameDisposers.push(() => observer.disconnect());
        const resize = new ResizeObserver(schedulePaint);
        if (canvasDocument.body) resize.observe(canvasDocument.body);
        if (frame) resize.observe(frame);
        frameDisposers.push(() => resize.disconnect());
    };
    const paint = () => {
        raf = 0;
        if (disposed) return;
        attachCanvas();
        layer.replaceChildren();
        if (!frame || !canvasDocument?.defaultView) return;
        const rect = frame.getBoundingClientRect();
        const sx = rect.width / (frame.offsetWidth || rect.width || 1);
        const sy = rect.height / (frame.offsetHeight || rect.height || 1);
        const frameRect: Rect = {
            left: rect.left + frame.clientLeft * sx,
            top: rect.top + frame.clientTop * sy,
            width: frame.clientWidth * sx,
            height: frame.clientHeight * sy,
        };
        let clip = intersectRect(frameRect, {
            left: 0,
            top: 0,
            width: window.innerWidth,
            height: window.innerHeight,
        });
        for (let parent = frame.parentElement; parent && clip; parent = parent.parentElement) {
            const css = getComputedStyle(parent);
            if (css.display === 'none' || css.visibility === 'hidden') {
                clip = null;
                break;
            }
            if (/(hidden|auto|scroll|clip)/.test(`${css.overflowX} ${css.overflowY}`))
                clip = intersectRect(clip, parent.getBoundingClientRect());
        }
        if (!clip) return;
        const fragment = document.createDocumentFragment();
        for (const match of data.matches) {
            if (match.hidden) continue;
            let labelled = false;
            for (const location of match.locations) {
                const el = resolveLocation(location);
                if (!el || !isVisible(el)) continue;
                let inner: Rect | null = el.getBoundingClientRect();
                // Account for inner scroll containers as well as the iframe viewport.
                for (
                    let parent = el.parentElement;
                    parent && inner;
                    parent = parent.parentElement
                ) {
                    const css = canvasDocument.defaultView.getComputedStyle(parent);
                    if (/(hidden|auto|scroll|clip)/.test(`${css.overflowX} ${css.overflowY}`))
                        inner = intersectRect(inner, parent.getBoundingClientRect());
                }
                if (!inner) continue;
                const projected = projectCanvasRect(inner, frameRect, {
                    width: canvasDocument.defaultView.innerWidth || frame.clientWidth,
                    height: canvasDocument.defaultView.innerHeight || frame.clientHeight,
                });
                const boxRect = intersectRect(projected, clip);
                if (!boxRect) continue;
                const active = match.id === data.activeId;
                const box = document.createElement('div');
                box.className = `box${active ? ' active' : ''}`;
                box.style.cssText = `left:${boxRect.left}px;top:${boxRect.top}px;width:${boxRect.width}px;height:${boxRect.height}px;`;
                fragment.appendChild(box);
                if (active && !labelled) {
                    const label = document.createElement('div');
                    label.className = 'label';
                    label.textContent = `${match.name}${match.eid ? ` · ${match.eid}` : ''}`;
                    label.style.cssText = `left:${boxRect.left}px;top:${Math.max(clip.top, boxRect.top - 22)}px;max-width:${Math.min(240, clip.left + clip.width - boxRect.left)}px;`;
                    fragment.appendChild(label);
                    labelled = true;
                }
            }
        }
        layer.appendChild(fragment);
    };
    function schedulePaint() {
        if (!disposed && !raf) raf = requestAnimationFrame(paint);
    }
    const bridgeChanged = (event: Event) => {
        if ((event as CustomEvent).detail === sessionId) dirty();
    };
    listen(document, 'genie:visual-search-changed', bridgeChanged);
    const settingChanged = (event: Event) => {
        if (!(event.target instanceof Element) || !event.target.closest('#lamp7-genie-root'))
            dirty();
    };
    listen(document, 'change', settingChanged);
    listen(document, 'input', settingChanged);
    listen(document, 'scroll', schedulePaint);
    listen(document, 'transitionend', schedulePaint);
    listen(window, 'resize', schedulePaint);
    listen(document, 'load', () => {
        attachCanvas();
        schedulePaint();
        dirty();
    });
    const canvasHost = document.querySelector('#gjs');
    if (canvasHost) {
        const layout = new MutationObserver(schedulePaint);
        layout.observe(canvasHost, {
            attributes: true,
            subtree: true,
            childList: true,
            attributeFilter: ['style', 'class'],
        });
        disposers.push(() => layout.disconnect());
    }
    attachCanvas();
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(raf);
        clearTimeout(dirtyTimer);
        frameDisposers.forEach((fn) => fn());
        disposers.forEach((fn) => fn());
        host.remove();
        document.dispatchEvent(new CustomEvent('genie:visual-search-stop', { detail: sessionId }));
    };
    listen(window, 'pagehide', clearVisualSearch);
    return {
        id: sessionId,
        dispose,
        update(presentation: VisualPresentation) {
            data = presentation;
            attachCanvas();
            schedulePaint();
            if (!data.scroll || !data.activeId) return;
            const match = data.matches.find((item) => item.id === data.activeId);
            if (!match) return '항목이 변경되어 검색 결과를 갱신했습니다.';
            if (match.hidden)
                return '현재 숨겨진 컴포넌트라 위치를 강조할 수 없습니다. 숨김 설정을 해제하거나 해당 탭을 연 뒤 다시 이동해 주세요.';
            const ordered = [...match.locations].sort(
                (a, b) => Number(b.domId === match.value) - Number(a.domId === match.value),
            );
            const el = ordered
                .map(resolveLocation)
                .find((element) => element && isVisible(element));
            if (!el) {
                dirty();
                return '현재 표시 위치를 찾을 수 없습니다. 검색 결과를 갱신합니다.';
            }
            // Scrolling changes viewport only; never select a component or toggle its hidden state.
            el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        },
    };
}
