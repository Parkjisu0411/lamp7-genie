import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { ClipboardPanel } from '../features/clipboard';
import { SearchPanel } from '../features/search';

type Tab = 'search' | 'copy';

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

    const effectiveExpanded = eventSettingAvailable && isExpanded;

    useEffect(() => {
        if (focusSearchSignal <= 0 || !eventSettingAvailable) return;
        queueMicrotask(() => {
            setIsExpanded(true);
            setActiveTab('search');
        });
    }, [focusSearchSignal, eventSettingAvailable]);

    if (!isVisible) return null;

    const showMiniOpenButton = eventSettingAvailable && !effectiveExpanded;

    return (
        <>
            <AnimatePresence>
                {showMiniOpenButton && (
                    <motion.button
                        key="mini-btn"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        type="button"
                        onClick={() => setIsExpanded(true)}
                        className="genie-mini-btn"
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
                        <div className="genie-panel__header">
                            <span className="genie-panel__title">지니</span>
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="genie-panel__close"
                                aria-label="패널 접기"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>

                        <div className="genie-panel__tabs">
                            <button
                                onClick={() => setActiveTab('search')}
                                className={`genie-tab ${activeTab === 'search' ? 'genie-tab--active' : ''}`}
                            >
                                검색
                            </button>
                            <button
                                onClick={() => setActiveTab('copy')}
                                className={`genie-tab ${activeTab === 'copy' ? 'genie-tab--active' : ''}`}
                            >
                                복사
                            </button>
                        </div>

                        <div className="genie-panel__content">
                            {activeTab === 'search' ? (
                                <SearchPanel focusSignal={focusSearchSignal} />
                            ) : (
                                <ClipboardPanel />
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
