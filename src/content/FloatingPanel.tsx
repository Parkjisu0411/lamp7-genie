import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { EditPanel } from '../features/edit';
import { SearchPanel } from '../features/search';
import { VisualEditPanel } from '../features/visualEdit/VisualEditPanel';
import { VisualSearchPanel } from '../features/visualSearch/VisualSearchPanel';
import { EditPresentation } from '../shared/editPresentation';
import type { TargetContext } from '../shared/targets/types';
import { PanelNoticeBar } from './PanelNoticeBar';
import { useFloatingPanel } from './useFloatingPanel';

interface FloatingPanelProps {
    isVisible: boolean;
    focusSearchSignal: number;
    target: TargetContext | null;
}

export function FloatingPanel({ isVisible, focusSearchSignal, target }: FloatingPanelProps) {
    const [editCompactRequested, setCompactEdit] = useState(false);
    const {
        activeTab,
        setActiveTab,
        effectiveExpanded,
        showMiniOpenButton,
        notice,
        guide,
        notify,
        clearNotice,
        clearGuide,
        offsetY,
        panelBodyContentRef,
        bodyClipHeightPx,
        bodyHeightTransitionOn,
        collapsePanel,
        onHeaderPointerDown,
        onMiniPointerDown,
    } = useFloatingPanel({
        isVisible,
        focusSearchSignal,
        targetAvailable: !!target,
    });

    const compactEdit = activeTab === 'edit' && editCompactRequested;

    if (!isVisible || !target) return null;

    return (
        <EditPresentation.Provider
            value={{ compact: compactEdit, setCompact: setCompactEdit, notice, clearNotice }}
        >
            <div className="genie-float-stack" style={{ transform: `translateY(${offsetY}px)` }}>
                <AnimatePresence>
                    {showMiniOpenButton && !compactEdit && (
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
                            <ChevronLeft size={20} aria-hidden="true" />
                        </motion.button>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {(effectiveExpanded || compactEdit) && (
                        <motion.div
                            key="panel"
                            initial={{ x: 380, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 380, opacity: 0 }}
                            transition={{ duration: 0.18, ease: 'easeOut' }}
                            className="genie-panel"
                            style={{
                                display: compactEdit && activeTab === 'edit' ? 'none' : undefined,
                            }}
                        >
                            <div
                                className="genie-panel__toolbar genie-panel__toolbar--draggable"
                                onPointerDown={onHeaderPointerDown}
                            >
                                <div className="genie-panel__tabs" role="tablist">
                                    <button
                                        type="button"
                                        disabled={!target.capabilities.search}
                                        onClick={() => {
                                            setCompactEdit(false);
                                            setActiveTab('search');
                                        }}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        className={`genie-tab ${activeTab === 'search' ? 'genie-tab--active' : ''}`}
                                        role="tab"
                                        aria-selected={activeTab === 'search'}
                                    >
                                        검색
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!target.capabilities.edit}
                                        onClick={() => {
                                            setCompactEdit(false);
                                            setActiveTab('edit');
                                        }}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        className={`genie-tab ${activeTab === 'edit' ? 'genie-tab--active' : ''}`}
                                        role="tab"
                                        aria-selected={activeTab === 'edit'}
                                    >
                                        편집
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        collapsePanel();
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="genie-panel__collapse"
                                    aria-label="패널 접기"
                                    title="접기"
                                >
                                    <ChevronRight size={16} strokeWidth={2.25} aria-hidden="true" />
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
                                <div ref={panelBodyContentRef} className="genie-panel__content">
                                    {notice && (
                                        <PanelNoticeBar
                                            key={notice.id}
                                            notice={notice}
                                            onClose={clearNotice}
                                        />
                                    )}
                                    {guide && (
                                        <PanelNoticeBar
                                            key={guide.id}
                                            notice={guide}
                                            onClose={clearGuide}
                                        />
                                    )}
                                    {target.kind === 'visual' ? (
                                        activeTab === 'search' ? (
                                            <VisualSearchPanel
                                                focusSignal={focusSearchSignal}
                                                notify={notify}
                                                clearNotice={clearNotice}
                                            />
                                        ) : (
                                            <VisualEditPanel
                                                notify={notify}
                                                clearNotice={clearNotice}
                                            />
                                        )
                                    ) : activeTab === 'search' ? (
                                        <SearchPanel
                                            focusSignal={focusSearchSignal}
                                            notify={notify}
                                            clearNotice={clearNotice}
                                            clearGuide={clearGuide}
                                        />
                                    ) : (
                                        <EditPanel
                                            eventSettingAvailable={target.kind === 'logic'}
                                            notify={notify}
                                            clearNotice={clearNotice}
                                        />
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </EditPresentation.Provider>
    );
}
