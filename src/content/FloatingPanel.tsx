import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ClipboardPanel } from '../features/clipboard';
import { SearchPanel } from '../features/search';
import { getPanelOffsetY, setPanelOffsetY } from './storage';

type Tab = 'search' | 'copy';

/** 기본 translateY(0) 기준 허용 범위 — 뷰포트 높이에 맞춤 */
function clampPanelOffsetY(y: number): number {
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    const min = -160;
    const max = Math.max(min, h - 240);
    return Math.round(Math.max(min, Math.min(max, y)));
}

/** 짧은 드래그는 클릭으로 간주 (미니 버튼 펼치기) */
const DRAG_CLICK_THRESHOLD_PX = 6;

interface FloatingPanelProps {
    isVisible: boolean;
    focusSearchSignal: number;
    /** false면 패널 열기(미니) 버튼을 아예 렌더하지 않음 — disabled 스타일 아님 */
    eventSettingAvailable: boolean;
}

export function FloatingPanel({
    isVisible,
    focusSearchSignal,
    eventSettingAvailable,
}: FloatingPanelProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('search');
    const [offsetY, setOffsetY] = useState(0);
    const offsetYRef = useRef(0);

    /** 본문 래퍼 높이만 CSS transition — ResizeObserver로 실제 콘텐츠 높이만 반영 (내부 FLIP 스케일 없음) */
    const panelBodyContentRef = useRef<HTMLDivElement>(null);
    const [bodyClipHeightPx, setBodyClipHeightPx] = useState<number | null>(null);
    const [bodyHeightTransitionOn, setBodyHeightTransitionOn] = useState(false);

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

    const effectiveExpanded = eventSettingAvailable && isExpanded;

    useEffect(() => {
        if (focusSearchSignal <= 0 || !eventSettingAvailable) return;
        queueMicrotask(() => {
            setIsExpanded(true);
            setActiveTab('search');
        });
    }, [focusSearchSignal, eventSettingAvailable]);

    useEffect(() => {
        if (!effectiveExpanded) {
            queueMicrotask(() => {
                setBodyClipHeightPx(null);
                setBodyHeightTransitionOn(false);
            });
        }
    }, [effectiveExpanded]);

    useLayoutEffect(() => {
        if (!effectiveExpanded) return;
        const el = panelBodyContentRef.current;
        if (!el) return;

        const measure = () => {
            const h = Math.ceil(el.getBoundingClientRect().height);
            setBodyClipHeightPx(h);
        };

        const ro = new ResizeObserver(() => {
            measure();
        });
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
    }, [effectiveExpanded, activeTab]);

    /**
     * 세로 드래그 공통.
     * - setPointerCapture + document 캡처 단계로 호스트·iframe 위에서도 move/up 유실 완화
     * - mini: 수직 이동이 작으면 펼치기로 처리 (클릭 대체)
     */
    const startVerticalDrag = useCallback(
        (e: React.PointerEvent, mode: 'header' | 'mini') => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();

            const el = e.currentTarget as HTMLElement;
            const pointerId = e.pointerId;
            const startY = e.clientY;
            const startOffset = offsetYRef.current;
            let maxAbsDy = 0;

            const onMove = (ev: PointerEvent) => {
                const dy = ev.clientY - startY;
                maxAbsDy = Math.max(maxAbsDy, Math.abs(dy));
                setOffsetY(clampPanelOffsetY(startOffset + dy));
            };

            let finished = false;

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
                    /* 이미 해제됨 */
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
                /* 일부 환경 */
            }

            document.addEventListener('pointermove', onMove, true);
            document.addEventListener('pointerup', onEnd, true);
            document.addEventListener('pointercancel', onEnd, true);
            document.addEventListener('lostpointercapture', onLostCapture, true);
        },
        [],
    );

    const onHeaderPointerDown = useCallback(
        (e: React.PointerEvent) => startVerticalDrag(e, 'header'),
        [startVerticalDrag],
    );

    const onMiniPointerDown = useCallback(
        (e: React.PointerEvent) => startVerticalDrag(e, 'mini'),
        [startVerticalDrag],
    );

    if (!isVisible) return null;

    const showMiniOpenButton = eventSettingAvailable && !effectiveExpanded;

    return (
        <div
            className="genie-float-stack"
            style={{ transform: `translateY(${offsetY}px)` }}
        >
            <AnimatePresence>
                {showMiniOpenButton && (
                    <motion.button
                        key="mini-btn"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        type="button"
                        onPointerDown={onMiniPointerDown}
                        className="genie-mini-btn genie-mini-btn--draggable"
                        aria-label="패널 열기"
                    >
                        <ChevronLeft size={22} />
                    </motion.button>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {effectiveExpanded && (
                    <motion.div
                        key="panel"
                        initial={{ x: 380, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 380, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="genie-panel"
                    >
                        <div
                            className="genie-panel__header genie-panel__header--draggable"
                            onPointerDown={onHeaderPointerDown}
                        >
                            <span className="genie-panel__title">지니</span>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsExpanded(false);
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="genie-panel__close"
                                aria-label="패널 접기"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>

                        <div className="genie-panel__tabs">
                            <button
                                type="button"
                                onClick={() => setActiveTab('search')}
                                className={`genie-tab ${activeTab === 'search' ? 'genie-tab--active' : ''}`}
                            >
                                검색
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('copy')}
                                className={`genie-tab ${activeTab === 'copy' ? 'genie-tab--active' : ''}`}
                            >
                                복사
                            </button>
                        </div>

                        <div
                            className="genie-panel__body-clip"
                            style={{
                                height:
                                    bodyClipHeightPx === null
                                        ? 'auto'
                                        : `${bodyClipHeightPx}px`,
                                transition: bodyHeightTransitionOn
                                    ? 'height 0.28s cubic-bezier(0.4, 0, 0.2, 1)'
                                    : 'none',
                            }}
                        >
                            <div
                                ref={panelBodyContentRef}
                                className="genie-panel__content"
                            >
                                {activeTab === 'search' ? (
                                    <SearchPanel focusSignal={focusSearchSignal} />
                                ) : (
                                    <ClipboardPanel />
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
