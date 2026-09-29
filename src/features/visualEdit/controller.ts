import { isExtensionContextValid } from '../../shared/extensionContext';
import { sendRuntimeMessageQuietly } from '../../shared/messaging';
import { selectionOverlayStyles } from '../../shared/selectionOverlay';
import { intersectRect, projectCanvasRect, type Rect } from '../visualSearch/geometry';
import type { VisualComponentRecord } from '../visualSearch/types';
import {
    findPasteLocation,
    pasteIndicator,
    pastePositionText,
    type PasteGeometry,
} from './pastePointer';
import { createVisualSelection, fullyContains, selectionRect } from './selection';
import type { VisualPasteLocation } from './transferTypes';
import type {
    VisualDeleteRequest,
    VisualDeleteResult,
    VisualDeleteSelection,
    VisualEditMount,
    VisualEditState,
} from './types';

let active:
    | {
          modeId: string;
          clear(): void;
          remove(id: string): void;
          dispose(notice?: string): void;
          beginDelete(
              request: VisualDeleteRequest & { clipboardId?: string; position?: string },
              kind?: 'copy' | 'paste' | 'delete',
          ): VisualDeleteSelection | undefined;
          endDelete(requestId: string, result: VisualDeleteResult): boolean;
          abortDelete(requestId: string): void;
      }
    | undefined;

export function stopVisualEdit(modeId?: string, notice?: string): void {
    if (active && (!modeId || active.modeId === modeId)) active.dispose(notice);
    if (modeId)
        document.dispatchEvent(new CustomEvent('genie:visual-edit-stop', { detail: modeId }));
}
export function clearVisualSelection(modeId: string): void {
    if (active?.modeId === modeId) active.clear();
}
export function deselectVisualItem(modeId: string, modelId: string): void {
    if (active?.modeId === modeId) active.remove(modelId);
}
export function beginVisualDelete(
    request: VisualDeleteRequest & { clipboardId?: string; position?: string },
    kind: 'copy' | 'paste' | 'delete' = 'delete',
): VisualDeleteSelection | undefined {
    return active?.modeId === request.modeId ? active.beginDelete(request, kind) : undefined;
}
export function endVisualDelete(
    modeId: string,
    requestId: string,
    result: VisualDeleteResult,
): boolean {
    return active?.modeId === modeId ? active.endDelete(requestId, result) : false;
}
export function abortVisualDelete(modeId: string, requestId: string): void {
    if (active?.modeId === modeId) active.abortDelete(requestId);
}

/** Input shield and all selection markup live OUTSIDE the saved canvas iframe. */
export function mountVisualEdit(payload: VisualEditMount, sessionId: string): string | undefined {
    stopVisualEdit();
    const frame = document.querySelector<HTMLIFrameElement>('#gjs .gjs-frame');
    const canvas = frame?.contentDocument;
    const canvasWindow = canvas?.defaultView;
    if (!frame || !canvas?.body || !canvasWindow) return 'Visual editor 캔버스를 찾을 수 없습니다.';
    if (canvas.querySelector('[contenteditable="true"]'))
        return '텍스트 편집을 마친 뒤 선택모드를 시작해 주세요.';
    const { modeId, records } = payload;
    const resolve = (record: VisualComponentRecord) => {
        let el: Element | null = null;
        if (record.location.domPath) {
            el = canvas.body;
            for (const index of record.location.domPath) el = el?.children[index] ?? null;
        } else el = canvas.getElementById(record.location.domId);
        return el &&
            (el.getAttribute('eid') ?? '') === record.location.eid &&
            (el.getAttribute('vid') ?? '') === record.location.vid &&
            (el.id || '') === record.location.domId
            ? (el as HTMLElement)
            : null;
    };
    if (
        records.some((record) => {
            if (!record.rendered) return false;
            const el = resolve(record);
            return (
                !el ||
                (el.getAttribute('eid') ?? '') !== record.location.eid ||
                (el.getAttribute('vid') ?? '') !== record.location.vid
            );
        })
    )
        return '화면 구성이 변경되었습니다. 선택모드를 다시 시작해 주세요.';
    let model = createVisualSelection(records);
    let byDom = new Map(records.filter((r) => r.location.domId).map((r) => [r.location.domId, r]));
    const byElement = new Map(
        records.flatMap((r) => {
            const el = resolve(r);
            return el ? [[el, r] as const] : [];
        }),
    );
    const disposers: Array<() => void> = [];
    let disposed = false;
    let raf = 0;
    let selected = new Set<string>();
    const paste = payload.paste;
    let pasteLocation: VisualPasteLocation | undefined;
    let pasteHover: VisualPasteLocation | undefined;
    let pointer: { x: number; y: number } | undefined;
    let operation: 'copy' | 'paste' | 'delete' | undefined;
    const selectionItems = (ids: Set<string>) =>
        paste
            ? [...ids].flatMap((id) => {
                  const r = model.byId.get(id);
                  return r
                      ? [
                            {
                                id,
                                type: r.componentType,
                                eid: r.location.eid,
                                label: r.label,
                                includesChildren: false,
                                includesHidden: r.hidden,
                            },
                        ]
                      : [];
              })
            : model.items(ids);
    const members = (id: string) => (paste ? [model.byId.get(id)!] : model.members(id));
    const canonical = (id: string) =>
        paste
            ? paste.targets.some((target) => target.modelId === id)
                ? id
                : undefined
            : model.canonical(id);
    let deletion: string | undefined;
    const usedDeleteRequests = new Set<string>();
    let preview: Set<string> | undefined;
    let previewNotice: string | undefined;
    let hover: string | undefined;
    type Gesture = {
        pointerId: number;
        x: number;
        y: number;
        endX: number;
        endY: number;
        target?: string;
        pasteTarget?: VisualPasteLocation;
        dragged: boolean;
        before: Set<string>;
    };
    let gesture: Gesture | undefined;

    const emit = (isActive: boolean, notice?: string) => {
        const state: VisualEditState = {
            modeId,
            active: isActive,
            items: isActive ? selectionItems(selected) : [],
            notice,
            deleting: isActive && !!deletion,
            operation: isActive ? operation : undefined,
            purpose: isActive && paste ? 'paste' : undefined,
            clipboardId: isActive ? paste?.clipboardId : undefined,
            pasteLocation: isActive && paste ? pasteLocation : undefined,
        };
        sendRuntimeMessageQuietly({
            action: 'VISUAL_EDIT_STATE',
            targetSessionId: sessionId,
            payload: state,
        });
    };
    const host = document.createElement('div');
    host.id = 'lamp7-genie-visual-edit';
    host.tabIndex = -1;
    host.style.cssText =
        'position:fixed;inset:0;z-index:2147483001;touch-action:none;outline:none;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent =
        selectionOverlayStyles +
        `
        .insertion{border:0;background:#7c3aed;box-shadow:0 0 0 1px white}
        .insertion.hover{background:#8b5cf6;opacity:.8}
        .paste .tag{max-width:320px;top:auto;bottom:4px;border-radius:3px}
    `;
    const shades = Array.from({ length: 4 }, () => {
        const div = document.createElement('div');
        div.className = 'shade';
        return div;
    });
    const surface = document.createElement('div');
    surface.className = 'surface';
    const boxes = document.createElement('div');
    boxes.setAttribute('aria-hidden', 'true');
    shadow.append(style, ...shades, surface, boxes);
    // Editor chrome is outside the saved wrapper. Remove this style on every exit path.
    const chromeStyle = document.createElement('style');
    chromeStyle.textContent =
        '#gjs .gjs-toolbar,#gjs .gjs-badge,#gjs .gjs-highlighter,#gjs .gjs-resizer,#gjs .gjs-offset-v,#gjs .gjs-offset-h{visibility:hidden!important;pointer-events:none!important}';
    document.head.append(chromeStyle);
    document.body.append(host);
    // Swallow clicks on the shield too, so editor-wide bubbling handlers cannot act.
    for (const type of [
        'pointerdown',
        'pointerup',
        'mousedown',
        'mouseup',
        'click',
        'dblclick',
        'contextmenu',
        'dragstart',
        'drop',
    ]) {
        host.addEventListener(type, (event) => {
            event.stopPropagation();
            event.preventDefault();
        });
    }

    const listen = (
        target: EventTarget,
        type: string,
        callback: EventListener,
        passive = false,
    ) => {
        target.addEventListener(type, callback, { capture: true, passive });
        disposers.push(() => target.removeEventListener(type, callback, true));
    };
    const place = (el: HTMLElement, rect: Rect) => {
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        el.style.width = `${Math.max(0, rect.width)}px`;
        el.style.height = `${Math.max(0, rect.height)}px`;
    };
    const geometry = () => {
        const outer = frame.getBoundingClientRect();
        const sx = outer.width / (frame.offsetWidth || 1),
            sy = outer.height / (frame.offsetHeight || 1);
        const rect: Rect = {
            left: outer.left + frame.clientLeft * sx,
            top: outer.top + frame.clientTop * sy,
            width: frame.clientWidth * sx,
            height: frame.clientHeight * sy,
        };
        let clip = intersectRect(rect, { left: 0, top: 0, width: innerWidth, height: innerHeight });
        for (let el: HTMLElement | null = frame; el && clip; el = el.parentElement) {
            const css = getComputedStyle(el);
            if (el.hidden || css.display === 'none' || css.visibility === 'hidden') return null;
            if (
                el !== frame &&
                /(hidden|auto|scroll|clip)/.test(`${css.overflowX} ${css.overflowY}`)
            )
                clip = intersectRect(clip, el.getBoundingClientRect());
        }
        if (!clip || !rect.width || !rect.height) return null;
        return {
            rect,
            clip,
            viewport: { width: canvasWindow.innerWidth, height: canvasWindow.innerHeight },
        };
    };
    const rectFor = (
        record: VisualComponentRecord,
        geom: NonNullable<ReturnType<typeof geometry>>,
        margins = false,
    ) => {
        const el = resolve(record);
        if (record.hidden || !el?.getClientRects().length) return null;
        const bounds = el.getBoundingClientRect();
        const own = canvasWindow.getComputedStyle(el);
        const ml = margins ? parseFloat(own.marginLeft) || 0 : 0,
            mr = margins ? parseFloat(own.marginRight) || 0 : 0;
        const mt = margins ? parseFloat(own.marginTop) || 0 : 0,
            mb = margins ? parseFloat(own.marginBottom) || 0 : 0;
        const full = {
            left: bounds.left - ml,
            top: bounds.top - mt,
            width: bounds.width + ml + mr,
            height: bounds.height + mt + mb,
        };
        let visible: Rect | null = full;
        for (let node: HTMLElement | null = el; node && visible; node = node.parentElement) {
            const css = canvasWindow.getComputedStyle(node);
            if (
                node.hidden ||
                node.getAttribute('data-hidden') === 'Y' ||
                css.display === 'none' ||
                css.visibility === 'hidden' ||
                css.opacity === '0'
            )
                return null;
            if (
                node !== el &&
                /(hidden|auto|scroll|clip)/.test(`${css.overflowX} ${css.overflowY}`)
            )
                visible = intersectRect(visible, node.getBoundingClientRect());
        }
        if (!visible) return null;
        const projected = projectCanvasRect(full, geom.rect, geom.viewport);
        const clipped = intersectRect(
            projectCanvasRect(visible, geom.rect, geom.viewport),
            geom.clip,
        );
        return clipped ? { full: projected, clipped } : null;
    };
    const pointInCanvas = (x: number, y: number) => {
        const geom = geometry();
        if (
            !geom ||
            x < geom.clip.left ||
            y < geom.clip.top ||
            x > geom.clip.left + geom.clip.width ||
            y > geom.clip.top + geom.clip.height
        )
            return null;
        return {
            x: ((x - geom.rect.left) * geom.viewport.width) / geom.rect.width,
            y: ((y - geom.rect.top) * geom.viewport.height) / geom.rect.height,
        };
    };
    const hit = (x: number, y: number) => {
        const point = pointInCanvas(x, y);
        let el = point ? canvas.elementFromPoint(point.x, point.y) : null;
        while (el) {
            const record = byDom.get(el.id);
            if (record && resolve(record) === el) {
                // A known internal/blocked model is a boundary, not permission to select its parent.
                return record.location.modelId;
            }
            el = el.parentElement;
        }
    };
    const pasteGeometry = (geom: NonNullable<ReturnType<typeof geometry>>): PasteGeometry[] => {
        if (!paste) return [];
        return paste.targets.flatMap((target) => {
            const record = model.byId.get(target.modelId);
            const rect = record && rectFor(record, geom, true);
            const el = record && resolve(record);
            if (!record || !rect || !el) return [];
            const parent = el.parentElement;
            const css = parent && canvasWindow.getComputedStyle(parent);
            const own = canvasWindow.getComputedStyle(el);
            // Native styleInFlow uses inline overflow/position and the computed float,
            // parent flex direction and display. It does not reverse RTL/reverse layouts.
            const inFlow =
                !(el.style.overflow && el.style.overflow !== 'visible') &&
                own.cssFloat === 'none' &&
                !(css?.display === 'flex' && css.flexDirection !== 'column') &&
                ['', 'static', 'relative'].includes(el.style.position) &&
                (['TR', 'TBODY', 'THEAD', 'TFOOT'].includes(el.tagName) ||
                    ['block', 'list-item', 'table', 'flex'].includes(own.display));
            const sx = geom.rect.width / geom.viewport.width,
                sy = geom.rect.height / geom.viewport.height;
            let depth = 0;
            for (let node = el.parentElement; node; node = node.parentElement) depth++;
            return [
                {
                    ...target,
                    parentId: parent ? byElement.get(parent)?.location.modelId : undefined,
                    depth,
                    rect: rect.full,
                    visible: rect.clipped,
                    axis: inFlow ? ('vertical' as const) : ('horizontal' as const),
                    borderX: 10 * sx,
                    borderY: 10 * sy,
                },
            ];
        });
    };
    const pasteHit = (x: number, y: number, candidates?: PasteGeometry[]) => {
        const geom = geometry();
        const point = pointInCanvas(x, y);
        if (!geom || !point) return;
        const hitIds = new Set<string>();
        for (let el = canvas.elementFromPoint(point.x, point.y); el; el = el.parentElement) {
            const record = byElement.get(el as HTMLElement);
            if (record && resolve(record) === el) hitIds.add(record.location.modelId);
        }
        return findPasteLocation(x, y, candidates ?? pasteGeometry(geom), hitIds);
    };
    const rangePreview = () => {
        if (!gesture || paste) return;
        const geom = geometry();
        if (!geom) return;
        const range = selectionRect(gesture.x, gesture.y, gesture.endX, gesture.endY);
        const ids = [...model.units.keys()].filter((id) => {
            if (model.canonical(id) !== id) return false;
            const members = model.members(id).filter((record) => !record.hidden);
            // The complete unit must fit; a range around one internal part is insufficient.
            return (
                members.length > 0 &&
                members.every((record) => {
                    const rect = rectFor(record, geom);
                    return (
                        !!rect &&
                        fullyContains(range, rect.full) &&
                        fullyContains(rect.clipped, rect.full)
                    );
                })
            );
        });
        const result = model.combine([...gesture.before, ...ids]);
        preview = result.selected;
        previewNotice = result.notice;
    };
    const paint = () => {
        raf = 0;
        if (disposed) return;
        const geom = geometry();
        if (!geom || !frame.isConnected || frame.contentDocument !== canvas) {
            stopVisualEdit(modeId);
            return;
        }
        // Keep the editor chrome shielded, but allow a marquee to start in its dimmed margins.
        // Panel controls and the mode banner remain above this input surface.
        const interactionRect = { left: 0, top: 0, width: innerWidth, height: innerHeight };
        place(surface, interactionRect);
        const { left, top, width, height } = geom.clip;
        place(shades[0], { left: 0, top: 0, width: innerWidth, height: top });
        place(shades[1], { left: 0, top, width: left, height });
        place(shades[2], { left: left + width, top, width: innerWidth - left - width, height });
        place(shades[3], {
            left: 0,
            top: top + height,
            width: innerWidth,
            height: innerHeight - top - height,
        });
        if (gesture?.dragged) rangePreview();
        const shown = preview ?? selected;
        const hoverUnit = hover ? canonical(hover) : undefined;
        const placements = pasteGeometry(geom);
        pasteHover =
            paste && pointer && !deletion ? pasteHit(pointer.x, pointer.y, placements) : undefined;
        surface.style.cursor = paste
            ? pointer && !pasteHover
                ? 'not-allowed'
                : 'default'
            : hover && !hoverUnit
              ? 'not-allowed'
              : 'crosshair';
        boxes.replaceChildren();
        const draw = (rect: Rect, className: string, label?: string) => {
            const box = document.createElement('div');
            box.className = `box ${className}`;
            place(box, rect);
            if (label) {
                const tag = document.createElement('span');
                tag.className = 'tag';
                tag.textContent = label;
                box.append(tag);
            }
            boxes.append(box);
            return box;
        };
        if (paste) {
            const drawSlot = (location: VisualPasteLocation, fixed: boolean) => {
                const target = placements.find((c) => c.modelId === location.modelId);
                const record = model.byId.get(location.modelId);
                if (!target || !record) return;
                const edgeClip = {
                    left: target.visible.left - 2,
                    top: target.visible.top - 2,
                    width: target.visible.width + 4,
                    height: target.visible.height + 4,
                };
                const visible = intersectRect(pasteIndicator(location, target), edgeClip);
                const rect = visible && intersectRect(visible, geom.clip);
                if (rect) {
                    const box = draw(
                        rect,
                        `paste insertion ${fixed ? '' : 'hover'}`,
                        `${record.label || record.location.eid || record.componentType} ${pastePositionText(location.position)} · ${fixed ? '붙여넣는 중…' : '클릭하여 붙여넣기'}`,
                    );
                    const tag = box.querySelector<HTMLElement>('.tag')!;
                    tag.style.maxWidth = `${Math.min(320, geom.clip.width)}px`;
                    if (rect.left > geom.clip.left + geom.clip.width / 2) {
                        tag.style.left = 'auto';
                        tag.style.right = '0';
                    }
                    if (rect.top < 26) {
                        tag.style.top = '4px';
                        tag.style.bottom = 'auto';
                    }
                }
            };
            if (pasteLocation) drawSlot(pasteLocation, true);
            if (
                pasteHover &&
                (pasteHover.modelId !== pasteLocation?.modelId ||
                    pasteHover.position !== pasteLocation.position)
            )
                drawSlot(pasteHover, false);
        }
        for (const item of paste ? [] : selectionItems(shown)) {
            for (const member of members(item.id)) {
                const rect = rectFor(member, geom);
                if (rect)
                    draw(
                        rect.clipped,
                        '',
                        `✓ ${paste ? '붙여넣을 위치 · ' : ''}${'kind' in item && item.kind === 'grid' ? 'Grid 전체' : item.type}${item.includesHidden ? ' · 숨김 포함' : ''}`,
                    );
            }
        }
        if (!paste && !gesture && hoverUnit && !shown.has(hoverUnit)) {
            for (const member of members(hoverUnit)) {
                const rect = rectFor(member, geom);
                if (rect) draw(rect.clipped, 'hover');
            }
        }
        if (gesture?.dragged && !paste) {
            const rect = intersectRect(
                selectionRect(gesture.x, gesture.y, gesture.endX, gesture.endY),
                interactionRect,
            );
            if (rect) draw(rect, 'range');
        }
    };
    function schedule() {
        if (!disposed && !raf) raf = requestAnimationFrame(paint);
    }
    const block = (event: Event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    const release = () => {
        const pointerId = gesture?.pointerId;
        gesture = undefined;
        preview = undefined;
        previewNotice = undefined;
        if (pointerId !== undefined && surface.hasPointerCapture(pointerId))
            surface.releasePointerCapture(pointerId);
        schedule();
    };
    listen(surface, 'pointerdown', (event) => {
        const e = event as PointerEvent;
        block(e);
        if (e.button !== 0 || gesture || deletion || pasteLocation) return;
        host.focus({ preventScroll: true });
        gesture = {
            pointerId: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            endX: e.clientX,
            endY: e.clientY,
            target: hit(e.clientX, e.clientY),
            pasteTarget: paste ? pasteHit(e.clientX, e.clientY) : undefined,
            dragged: false,
            before: new Set(selected),
        };
        surface.setPointerCapture(e.pointerId);
    });
    listen(surface, 'pointermove', (event) => {
        const e = event as PointerEvent;
        block(e);
        if (deletion) return;
        pointer = { x: e.clientX, y: e.clientY };
        if (!gesture) {
            hover = hit(e.clientX, e.clientY);
            schedule();
            return;
        }
        if (e.pointerId !== gesture.pointerId) return;
        gesture.endX = e.clientX;
        gesture.endY = e.clientY;
        gesture.dragged ||= Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 6;
        schedule();
    });
    listen(surface, 'pointerup', (event) => {
        const e = event as PointerEvent;
        block(e);
        if (!gesture || gesture.pointerId !== e.pointerId) return;
        gesture.endX = e.clientX;
        gesture.endY = e.clientY;
        gesture.dragged ||= Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 6;
        let notice: string | undefined;
        if (paste) {
            if (!gesture.dragged && gesture.pasteTarget) {
                const target = gesture.pasteTarget;
                pasteLocation = target;
                selected = new Set(pasteLocation ? [pasteLocation.modelId] : []);
            }
        } else if (gesture.dragged) {
            rangePreview();
            selected = preview ?? selected;
            notice = previewNotice;
        } else if (gesture.target) {
            const result = model.toggleResult(selected, gesture.target);
            selected = result.selected;
            notice = result.notice;
        }
        release();
        emit(true, notice);
    });
    listen(surface, 'pointercancel', release);
    listen(surface, 'lostpointercapture', release);
    listen(surface, 'pointerleave', () => {
        if (!gesture) {
            hover = undefined;
            pointer = undefined;
            schedule();
        }
    });
    for (const type of [
        'click',
        'dblclick',
        'mousedown',
        'mouseup',
        'contextmenu',
        'dragstart',
        'drop',
    ])
        listen(surface, type, block);
    listen(host, 'wheel', (event) => {
        const e = event as WheelEvent;
        block(e);
        release();
        const point = pointInCanvas(e.clientX, e.clientY);
        if (!point) return;
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvasWindow.innerHeight : 1;
        const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit;
        const dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit;
        let node = canvas.elementFromPoint(point.x, point.y) as HTMLElement | null;
        while (node) {
            const css = canvasWindow.getComputedStyle(node);
            if (
                node === canvas.scrollingElement ||
                /(auto|scroll)/.test(`${css.overflowX} ${css.overflowY}`)
            ) {
                const beforeX = node.scrollLeft,
                    beforeY = node.scrollTop;
                node.scrollLeft += dx;
                node.scrollTop += dy;
                if (beforeX !== node.scrollLeft || beforeY !== node.scrollTop) break;
            }
            node = node.parentElement;
        }
        schedule();
    });
    const keyboard = (event: Event) => {
        const e = event as KeyboardEvent;
        // Lamp7 tracks Ctrl in document keydown/keyup handlers. Let modifier state
        // settle normally so leaving this mode cannot leave native Ctrl selection stuck.
        if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return;
        if (
            e
                .composedPath()
                .some((node) => node instanceof Element && node.id === 'lamp7-genie-root')
        )
            return;
        block(e);
        if (!deletion && e.type === 'keydown' && e.key === 'Escape') stopVisualEdit(modeId);
        if (e.type === 'keydown' && e.key === 'Tab') {
            try {
                window.top?.document
                    .querySelector<HTMLButtonElement>('#lamp7-genie-root .genie-edit-bar button')
                    ?.focus();
            } catch {
                /* different origin */
            }
        }
    };
    for (const target of [window, canvasWindow]) {
        for (const type of ['keydown', 'keyup', 'keypress']) listen(target, type, keyboard);
    }
    listen(window, 'blur', release);
    listen(window, 'resize', schedule);
    listen(document, 'scroll', schedule, true);
    listen(canvas, 'scroll', schedule, true);
    listen(canvasWindow, 'resize', schedule);
    listen(frame, 'load', () => stopVisualEdit(modeId));
    listen(window, 'pagehide', () => stopVisualEdit(modeId));
    listen(document, 'genie:visual-edit-invalid', (event) => {
        if ((event as CustomEvent).detail === modeId) stopVisualEdit(modeId);
    });
    const observer = new MutationObserver(() => stopVisualEdit(modeId));
    const observeCanvas = () =>
        observer.observe(canvas.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
        });
    observeCanvas();
    listen(document, 'genie:visual-edit-delete-mutating', (event) => {
        const detail = (event as CustomEvent).detail;
        if (detail?.modeId !== modeId || detail.requestId !== deletion) return;
        if (observer.takeRecords().length) {
            stopVisualEdit(modeId, '화면 구성이 변경되어 삭제를 중단했습니다.');
            return;
        }
        observer.disconnect();
    });
    disposers.push(() => observer.disconnect());
    const resize = new ResizeObserver(schedule);
    resize.observe(frame);
    resize.observe(canvas.body);
    disposers.push(() => resize.disconnect());
    const timer = setInterval(() => {
        if (
            !isExtensionContextValid() ||
            !host.isConnected ||
            !frame.isConnected ||
            frame.contentDocument !== canvas ||
            !geometry()
        )
            stopVisualEdit(modeId);
    }, 300);
    disposers.push(() => clearInterval(timer));
    active = {
        modeId,
        abortDelete(requestId) {
            if (deletion === requestId) stopVisualEdit(modeId);
        },
        beginDelete(request, kind = 'delete') {
            if (
                (kind === 'paste') !== !!paste ||
                (paste &&
                    (request.clipboardId !== paste.clipboardId ||
                        !pasteLocation ||
                        request.position !== pasteLocation.position ||
                        request.modelIds[0] !== pasteLocation.modelId)) ||
                deletion ||
                !request.requestId ||
                usedDeleteRequests.has(request.requestId) ||
                !request.modelIds.length ||
                request.modelIds.length !== selected.size ||
                new Set(request.modelIds).size !== selected.size ||
                request.modelIds.some((id) => !selected.has(id))
            )
                return;
            if (observer.takeRecords().length) {
                stopVisualEdit(modeId, '화면 구성이 변경되어 삭제를 중단했습니다.');
                return;
            }
            release();
            hover = undefined;
            deletion = request.requestId;
            operation = kind;
            usedDeleteRequests.add(request.requestId);
            document.dispatchEvent(
                new CustomEvent('genie:visual-edit-delete-ready', {
                    detail: {
                        modeId,
                        requestId: deletion,
                        modelIds: [...selected],
                        kind,
                        position: kind === 'paste' ? pasteLocation?.position : undefined,
                    },
                }),
            );
            emit(true);
            schedule();
            return {
                modeId,
                requestId: deletion,
                locations: [...selected].map((id) => ({ ...model.byId.get(id)!.location })),
            };
        },
        endDelete(requestId, result) {
            if (deletion !== requestId) return false;
            if (operation === 'paste') {
                stopVisualEdit(modeId);
                return true;
            }
            if (!result.records) return false;
            model = createVisualSelection(result.records);
            byDom = new Map(
                result.records.filter((r) => r.location.domId).map((r) => [r.location.domId, r]),
            );
            selected = model.normalize(result.remainingIds);
            deletion = undefined;
            operation = undefined;
            document.dispatchEvent(
                new CustomEvent('genie:visual-edit-delete-finished', {
                    detail: { modeId, requestId },
                }),
            );
            observeCanvas();
            emit(true);
            schedule();
            return true;
        },
        remove(id) {
            if (deletion) return;
            release();
            if (paste) {
                selected.delete(id);
                pasteLocation = undefined;
            } else selected = model.remove(selected, id);
            emit(true);
            schedule();
        },
        clear() {
            if (deletion) return;
            release();
            selected = new Set();
            pasteLocation = undefined;
            emit(true);
            schedule();
        },
        dispose(notice) {
            if (disposed) return;
            disposed = true;
            disposers.forEach((dispose) => dispose());
            release();
            cancelAnimationFrame(raf);
            host.remove();
            chromeStyle.remove();
            active = undefined;
            document.dispatchEvent(new CustomEvent('genie:visual-edit-stop', { detail: modeId }));
            emit(false, notice);
        },
    };
    host.focus({ preventScroll: true });
    paint();
    if (disposed) return '캔버스가 보이지 않아 선택모드를 시작할 수 없습니다.';
    emit(true);
    return undefined;
}
