import { DATA_ATTR_LOGIC_AREA_PIN } from '../../shared/constants';
import { sendRuntimeMessageQuietly } from '../../shared/messaging';
import { scrollWithin } from '../../shared/scrollWithin';
import { selectionOverlayStyles } from '../../shared/selectionOverlay';
import { intersectRect, type Rect } from '../visualSearch/geometry';
import { collectSameOriginDocuments, findEditDom, resyncEditSeqItems } from './dom';
import { pickLogicPasteLocation, type LogicPastePreview } from './pasteGeometry';
import type { LogicPasteContext, LogicPastePick } from './pasteTypes';
import { createPointerSelectionSession } from './pointerSelectionSession';

let session:
    | {
          modeId?: string;
          dispose(): void;
          remove(id?: string): void;
          beginPaste?(pick: LogicPastePick): LogicPasteContext | undefined;
      }
    | undefined;
export function clearLogicAreaPin(): void {
    for (const doc of collectSameOriginDocuments(document))
        doc.querySelectorAll(`[${DATA_ATTR_LOGIC_AREA_PIN}]`).forEach((el) =>
            el.removeAttribute(DATA_ATTR_LOGIC_AREA_PIN),
        );
}
export function isEditActive(): boolean {
    return !!session;
}
export function clearEditSelection(): void {
    session?.remove();
}
export function deselectEditItem(id: string): void {
    session?.remove(id);
}
export function unmountEdit(opts: { notifyInactive?: boolean; modeId?: string } = {}): void {
    if (opts.modeId && session?.modeId !== opts.modeId) return;
    const modeId = session?.modeId;
    session?.dispose();
    clearLogicAreaPin();
    if (opts.notifyInactive) sendRuntimeMessageQuietly({ action: 'EDIT_NOTIFY_INACTIVE', modeId });
}

export function beginLogicPaste(pick: LogicPastePick): LogicPasteContext | undefined {
    return session?.beginPaste?.(pick);
}
export function mountEdit(paste?: LogicPasteContext): boolean {
    if (session && !paste) return true;
    session?.dispose();
    const dom = findEditDom();
    if (!dom) return false;
    const doc = dom.logicArea.ownerDocument,
        win = doc.defaultView;
    if (!win) return false;
    let selected = new Set<string>(),
        range: Rect | null = null,
        hover: string | undefined,
        raf = 0,
        disposed = false;
    const host = doc.createElement('div');
    host.id = 'lamp7-genie-logic-edit';
    host.tabIndex = -1;
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483001;touch-action:none;outline:none';
    let pastePreview: LogicPastePreview | null = null;
    let pressed: { x: number; y: number; id: number } | undefined;
    let picked: LogicPastePick | undefined;
    if (paste) {
        host.dataset.pasteMode = paste.modeId;
        host.dataset.pastePhase = 'picking';
        dom.logicArea.setAttribute('data-genie-paste-mode', paste.modeId);
    }
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent =
        selectionOverlayStyles +
        (paste
            ? '.surface{cursor:default}.paste-line .tag{top:auto;bottom:2px;max-width:none}.paste-inside .tag{max-width:none}'
            : '');
    const shades = Array.from({ length: 4 }, () => {
        const el = doc.createElement('div');
        el.className = 'shade';
        return el;
    });
    const surface = doc.createElement('div');
    surface.className = 'surface';
    const boxes = doc.createElement('div');
    boxes.setAttribute('aria-hidden', 'true');
    shadow.append(style, ...shades, surface, boxes);
    doc.body.append(host);
    const previousFocus = doc.activeElement as HTMLElement | null;
    host.focus({ preventScroll: true });
    const listeners: Array<() => void> = [];
    const listen = (target: EventTarget, type: string, fn: EventListener) => {
        target.addEventListener(type, fn, { capture: true });
        listeners.push(() => target.removeEventListener(type, fn, true));
    };
    const block = (e: Event) => {
        e.preventDefault();
        e.stopImmediatePropagation();
    };
    const place = (el: HTMLElement, r: Rect) => {
        el.style.left = `${r.left}px`;
        el.style.top = `${r.top}px`;
        el.style.width = `${Math.max(0, r.width)}px`;
        el.style.height = `${Math.max(0, r.height)}px`;
    };
    const clipFor = (el: HTMLElement): Rect | null => {
        const bounds = el.getBoundingClientRect();
        const rect =
            paste && !paste.rows.length && el === dom.wrap
                ? {
                      left: bounds.left,
                      top: bounds.top,
                      width: bounds.width,
                      height: Math.max(48, bounds.height),
                  }
                : bounds;
        let clip: Rect | null = intersectRect(rect, {
            left: 0,
            top: 0,
            width: win.innerWidth,
            height: win.innerHeight,
        });
        for (let p = el.parentElement; p && clip; p = p.parentElement) {
            const css = win.getComputedStyle(p);
            if (css.display === 'none' || css.visibility === 'hidden') return null;
            if (/auto|scroll|hidden|clip/.test(css.overflow + css.overflowX + css.overflowY))
                clip = intersectRect(clip, p.getBoundingClientRect());
        }
        return clip;
    };
    const rows = () => {
        resyncEditSeqItems(dom);
        const clip = clipFor(dom.wrap);
        if (!clip) return [];
        const bodies = new Map(
            Array.from(dom.logicArea.querySelectorAll<HTMLElement>('.logic-row[id]')).map((el) => [
                el.id,
                el,
            ]),
        );
        return dom.seqItems.flatMap((li) => {
            const id = li.id.endsWith('_seq') ? li.id.slice(0, -4) : '';
            if (!id) return [];
            const seq = li.getBoundingClientRect(),
                body = bodies.get(id);
            if (!seq.width || !seq.height) return [];
            // Native seq heights represent the logic itself (a condition excludes its child logics).
            // Use that vertical span instead of the enclosing parent's full subtree box.
            const own = body?.getBoundingClientRect();
            const rect = intersectRect(
                {
                    left: seq.left,
                    top: seq.top,
                    width: Math.max(seq.right, own?.right ?? seq.right) - seq.left,
                    height: seq.height,
                },
                clip,
            );
            return rect
                ? [
                      {
                          key: id,
                          rect,
                          label: li.textContent?.trim() || '',
                      },
                  ]
                : [];
        });
    };
    const emit = () =>
        sendRuntimeMessageQuietly({
            action: 'EDIT_SELECTION_CHANGED',
            payload: {
                logicIds: dom.seqItems
                    .map((li) => li.id.slice(0, -4))
                    .filter((id) => selected.has(id)),
            },
        });
    const pasteAt = (x: number, y: number) => {
        const clip = clipFor(dom.wrap);
        if (!paste || !clip) return null;
        const bodies = new Map(
            Array.from(dom.logicArea.querySelectorAll<HTMLElement>('.logic-row[id]')).map((el) => [
                el.id,
                el,
            ]),
        );
        return pickLogicPasteLocation(
            paste.rows.flatMap((row) => {
                const body = bodies.get(row.id),
                    head = body?.querySelector<HTMLElement>('.head-logic');
                if (!body || !head || !head.getBoundingClientRect().height) return [];
                return [
                    {
                        ...row,
                        body: body.getBoundingClientRect(),
                        head: head.getBoundingClientRect(),
                    },
                ];
            }),
            clip,
            x,
            y,
        );
    };
    const paint = () => {
        raf = 0;
        if (disposed) return;
        const clip = clipFor(dom.wrap);
        if (!clip || !dom.logicArea.isConnected || !dom.seqUl.isConnected) {
            unmountEdit({ notifyInactive: true });
            return;
        }
        const { left, top, width, height } = clip;
        place(shades[0], { left: 0, top: 0, width: win.innerWidth, height: top });
        place(shades[1], { left: 0, top, width: left, height });
        place(shades[2], { left: left + width, top, width: win.innerWidth - left - width, height });
        place(shades[3], {
            left: 0,
            top: top + height,
            width: win.innerWidth,
            height: win.innerHeight - top - height,
        });
        boxes.replaceChildren();
        const draw = (rect: Rect, kind: string, label?: string) => {
            const el = doc.createElement('div');
            el.className = `box ${kind}`;
            place(el, rect);
            if (label) {
                const tag = doc.createElement('span');
                tag.className = 'tag';
                tag.textContent = label;
                el.append(tag);
            }
            boxes.append(el);
        };
        for (const row of rows()) {
            if (selected.has(row.key)) draw(row.rect, 'selected', row.label);
            else if (row.key === hover) draw(row.rect, 'hover');
        }
        if (range) draw(range, 'range');
        if (pastePreview)
            draw(
                pastePreview.rect,
                pastePreview.location.position === 'inside' ? 'paste-inside' : 'paste-line',
                pastePreview.label,
            );
    };
    const schedule = () => {
        if (!raf && !disposed) raf = win.requestAnimationFrame(paint);
    };
    const pointer = createPointerSelectionSession({
        getRows: rows,
        getSelected: () => selected,
        setSelected: (keys) => {
            selected = keys;
        },
        onPaint: (rect) => {
            range = rect;
            schedule();
        },
        onCommit: emit,
    });
    listen(surface, 'pointerdown', (event) => {
        const e = event as PointerEvent;
        block(e);
        if (e.button !== 0) return;
        host.focus({ preventScroll: true });
        surface.setPointerCapture(e.pointerId);
        if (paste) {
            if (host.dataset.pastePhase !== 'picking') return;
            pressed = { x: e.clientX, y: e.clientY, id: e.pointerId };
            pastePreview = pasteAt(e.clientX, e.clientY);
            schedule();
        } else pointer.onPointerDown(e);
    });
    listen(surface, 'pointermove', (event) => {
        const e = event as PointerEvent;
        block(e);
        if (paste) {
            if (host.dataset.pastePhase === 'picking') {
                pastePreview = pasteAt(e.clientX, e.clientY);
                schedule();
            }
            return;
        }
        hover = rows().find(
            ({ rect: r }) =>
                e.clientX >= r.left &&
                e.clientX <= r.left + r.width &&
                e.clientY >= r.top &&
                e.clientY <= r.top + r.height,
        )?.key;
        pointer.onPointerMove(e);
        schedule();
    });
    listen(surface, 'pointerup', (event) => {
        const e = event as PointerEvent;
        block(e);
        if (paste) {
            if (
                pressed?.id === e.pointerId &&
                Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < 6 &&
                host.dataset.pastePhase === 'picking'
            ) {
                pastePreview = pasteAt(e.clientX, e.clientY);
                if (pastePreview) {
                    host.dataset.pastePhase = 'picked';
                    picked = { modeId: paste.modeId, location: pastePreview.location };
                    sendRuntimeMessageQuietly({ action: 'EDIT_PASTE_PICKED', payload: picked });
                }
            }
            pressed = undefined;
        } else pointer.onPointerUp(e);
        if (surface.hasPointerCapture(e.pointerId)) surface.releasePointerCapture(e.pointerId);
    });
    listen(surface, 'pointercancel', (event) => {
        pressed = undefined;
        pointer.onPointerCancel(event as PointerEvent);
    });
    listen(surface, 'lostpointercapture', () => {
        pressed = undefined;
        pointer.cancel();
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
        listen(host, type, block);
    listen(surface, 'wheel', (event) => {
        const e = event as WheelEvent;
        block(e);
        host.style.pointerEvents = 'none';
        let node = doc.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        host.style.pointerEvents = '';
        if (!node || !dom.wrap.contains(node)) node = dom.logicArea;
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? win.innerHeight : 1;
        while (node) {
            const css = win.getComputedStyle(node);
            if (/auto|scroll/.test(css.overflow + css.overflowX + css.overflowY)) {
                const x = node.scrollLeft,
                    y = node.scrollTop;
                node.scrollLeft += (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit;
                node.scrollTop += (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit;
                if (x !== node.scrollLeft || y !== node.scrollTop) break;
            }
            node = node.parentElement;
        }
        schedule();
    });
    const keyboard = (event: Event) => {
        const e = event as KeyboardEvent;
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
        if (e.composedPath().some((n) => n instanceof Element && n.id === 'lamp7-genie-root'))
            return;
        block(e);
        if (e.type === 'keydown' && e.key === 'Escape') unmountEdit({ notifyInactive: true });
        if (e.type === 'keydown' && e.key === 'Tab') {
            try {
                win.top?.document
                    .querySelector<HTMLButtonElement>('#lamp7-genie-root .genie-edit-bar button')
                    ?.focus();
            } catch {
                /* different origin */
            }
        }
    };
    for (const type of ['keydown', 'keyup', 'keypress']) listen(win, type, keyboard);
    listen(win, 'blur', () => {
        pointer.cancel();
        schedule();
    });
    listen(doc, 'scroll', () => {
        if (paste && host.dataset.pastePhase === 'picking') pastePreview = null;
        schedule();
    });
    listen(win, 'resize', schedule);
    listen(win, 'pagehide', () => unmountEdit());
    const observer = new MutationObserver(() => {
        // A native re-render can invalidate captured rows; stop instead of operating on stale IDs.
        unmountEdit({ notifyInactive: true });
    });
    observer.observe(dom.logicArea, { childList: true, subtree: true });
    observer.observe(dom.seqUl, { childList: true, subtree: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(dom.wrap);
    resize.observe(dom.logicArea);
    session = {
        modeId: paste?.modeId,
        beginPaste(pick) {
            if (
                !paste ||
                !picked ||
                host.dataset.pastePhase !== 'picked' ||
                pick.modeId !== paste.modeId ||
                pick.location.anchorId !== picked.location.anchorId ||
                pick.location.position !== picked.location.position ||
                observer.takeRecords().length ||
                !clipFor(dom.wrap)
            )
                return undefined;
            host.dataset.pastePhase = 'committing';
            observer.disconnect();
            return paste;
        },
        remove(id) {
            pointer.cancel();
            if (id) selected.delete(id);
            else selected.clear();
            emit();
            schedule();
        },
        dispose() {
            disposed = true;
            session = undefined;
            pointer.cancel();
            listeners.forEach((fn) => fn());
            observer.disconnect();
            resize.disconnect();
            win.cancelAnimationFrame(raf);
            host.remove();
            if (dom.logicArea.getAttribute('data-genie-paste-mode') === paste?.modeId)
                dom.logicArea.removeAttribute('data-genie-paste-mode');
            if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        },
    };
    // A scroll position can hide an intact editor. Reveal it before rejecting
    // the mode; collapsed split panes remain under the user's control.
    if (!clipFor(dom.wrap)) {
        scrollWithin(dom.wrap, doc.body, 'nearest');
    }
    paint();
    if (disposed) return false;
    if (!paste) emit();
    return true;
}
