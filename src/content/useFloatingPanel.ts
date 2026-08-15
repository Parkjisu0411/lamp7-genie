import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from 'react';
import { sendRuntimeMessageQuietly } from '../shared/messaging';
import type { NoticeKind, PanelNotice } from '../shared/panelNotice';
import { getPanelOffsetY, setPanelOffsetY } from '../shared/storage';

export type FloatingPanelTab = 'search' | 'edit';

interface UseFloatingPanelArgs {
    isVisible: boolean;
    focusSearchSignal: number;
    eventSettingAvailable: boolean;
}

function clampPanelOffsetY(y: number): number {
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    const min = -160;
    const max = Math.max(min, h - 240);
    return Math.round(Math.max(min, Math.min(max, y)));
}

const DRAG_CLICK_THRESHOLD_PX = 6;

export function useFloatingPanel({
    isVisible,
    focusSearchSignal,
    eventSettingAvailable,
}: UseFloatingPanelArgs) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [activeTab, setActiveTab] = useState<FloatingPanelTab>('search');
    const [notice, setNotice] = useState<PanelNotice | null>(null);
    const [guide, setGuideNotice] = useState<PanelNotice | null>(null);
    const [offsetY, setOffsetY] = useState(0);
    const offsetYRef = useRef(0);
    const panelBodyContentRef = useRef<HTMLDivElement>(null);
    const [bodyClipHeightPx, setBodyClipHeightPx] = useState<number | null>(null);
    const [bodyHeightTransitionOn, setBodyHeightTransitionOn] = useState(false);
    const prevExpandedRef = useRef<boolean | null>(null);

    const effectiveExpanded = eventSettingAvailable && isExpanded;

    useEffect(() => {
        offsetYRef.current = offsetY;
    }, [offsetY]);

    useEffect(() => {
        void getPanelOffsetY().then((y) => setOffsetY(clampPanelOffsetY(y)));
    }, []);

    useEffect(() => {
        const onResize = () => setOffsetY((prev) => clampPanelOffsetY(prev));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const notify = useCallback((kind: NoticeKind, message: string) => {
        setNotice({ id: Date.now(), kind, message });
    }, []);

    const clearNotice = useCallback(() => {
        setNotice(null);
    }, []);

    const clearGuide = useCallback(() => {
        setGuideNotice(null);
    }, []);

    useEffect(() => {
        if (prevExpandedRef.current === null) {
            prevExpandedRef.current = effectiveExpanded;
            return;
        }
        if (prevExpandedRef.current && !effectiveExpanded) {
            sendRuntimeMessageQuietly({ action: 'EDIT_STOP' });
        }
        prevExpandedRef.current = effectiveExpanded;
    }, [effectiveExpanded]);

    useEffect(() => {
        if (!isVisible || !effectiveExpanded) return;
        const onKeyDown = (ev: KeyboardEvent) => {
            if (ev.key !== 'Escape') return;
            const root = document.getElementById('lamp7-genie-root');
            if (!root?.contains(ev.target as Node)) return;
            ev.preventDefault();
            ev.stopPropagation();
            sendRuntimeMessageQuietly({ action: 'GENIE_DISMISS' });
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [isVisible, effectiveExpanded]);

    useEffect(() => {
        if (focusSearchSignal <= 0 || !eventSettingAvailable) return;
        queueMicrotask(() => {
            setIsExpanded(true);
            setActiveTab('search');
        });
    }, [focusSearchSignal, eventSettingAvailable]);

    useEffect(() => {
        if (!isVisible || !effectiveExpanded) {
            queueMicrotask(() => {
                setBodyClipHeightPx(null);
                setBodyHeightTransitionOn(false);
            });
        }
    }, [isVisible, effectiveExpanded]);

    useLayoutEffect(() => {
        if (!isVisible || !effectiveExpanded) return;
        const el = panelBodyContentRef.current;
        if (!el) return;

        const measure = () => {
            const h = Math.ceil(el.getBoundingClientRect().height);
            if (h <= 0) return;
            setBodyClipHeightPx(h);
        };

        const ro = new ResizeObserver(measure);
        ro.observe(el);
        measure();

        let raf2 = 0;
        const raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => {
                setBodyHeightTransitionOn(true);
            });
        });

        return () => {
            cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
            ro.disconnect();
        };
    }, [isVisible, effectiveExpanded, activeTab]);

    const startVerticalDrag = useCallback(
        (e: ReactPointerEvent, mode: 'header' | 'mini') => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();

            const el = e.currentTarget as HTMLElement;
            const pointerId = e.pointerId;
            const startY = e.clientY;
            const startOffset = offsetYRef.current;
            let maxAbsDy = 0;
            let finished = false;

            const onMove = (ev: PointerEvent) => {
                const dy = ev.clientY - startY;
                maxAbsDy = Math.max(maxAbsDy, Math.abs(dy));
                setOffsetY(clampPanelOffsetY(startOffset + dy));
            };

            const cleanup = () => {
                if (finished) return;
                finished = true;
                document.removeEventListener('pointermove', onMove, true);
                document.removeEventListener('pointerup', onEnd, true);
                document.removeEventListener('pointercancel', onEnd, true);
                document.removeEventListener('lostpointercapture', onLostCapture, true);
                try {
                    el.releasePointerCapture(pointerId);
                } catch {
                    /* already released */
                }
                void setPanelOffsetY(offsetYRef.current);
            };

            const onLostCapture = () => {
                cleanup();
            };

            const onEnd = () => {
                cleanup();
                if (mode === 'mini' && maxAbsDy <= DRAG_CLICK_THRESHOLD_PX) {
                    setIsExpanded(true);
                }
            };

            try {
                el.setPointerCapture(pointerId);
            } catch {
                /* unsupported environment */
            }

            document.addEventListener('pointermove', onMove, true);
            document.addEventListener('pointerup', onEnd, true);
            document.addEventListener('pointercancel', onEnd, true);
            document.addEventListener('lostpointercapture', onLostCapture, true);
        },
        [],
    );

    return {
        activeTab,
        setActiveTab,
        effectiveExpanded,
        showMiniOpenButton: eventSettingAvailable && !effectiveExpanded,
        notice,
        guide,
        notify,
        clearNotice,
        clearGuide,
        offsetY,
        panelBodyContentRef,
        bodyClipHeightPx,
        bodyHeightTransitionOn,
        collapsePanel: () => setIsExpanded(false),
        onHeaderPointerDown: (e: ReactPointerEvent) => startVerticalDrag(e, 'header'),
        onMiniPointerDown: (e: ReactPointerEvent) => startVerticalDrag(e, 'mini'),
    };
}
