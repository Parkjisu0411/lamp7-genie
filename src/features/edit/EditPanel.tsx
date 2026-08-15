import { Clipboard, ClipboardPaste, Play, Square, Trash2 } from 'lucide-react';
import { KIND_ICON } from '../../shared/icons';
import type { NotifyPanel } from '../../shared/panelNotice';
import { useEditPanel } from './useEditPanel';

interface EditPanelProps {
    eventSettingAvailable: boolean;
    notify: NotifyPanel;
    clearNotice: () => void;
}

export function EditPanel({
    eventSettingAvailable,
    notify,
    clearNotice,
}: EditPanelProps) {
    const panel = useEditPanel({ notify, clearNotice });

    return (
        <div className="panel">
            <div className="panel__row">
                <button
                    type="button"
                    onClick={panel.handleStartSelection}
                    disabled={!eventSettingAvailable || panel.isSelecting}
                    className="panel__btn panel__btn--success"
                    style={{ flex: 1 }}
                >
                    <Play size={14} />
                    선택 시작
                </button>
                <button
                    type="button"
                    onClick={panel.handleEndSelection}
                    disabled={!eventSettingAvailable || !panel.isSelecting}
                    className="panel__btn panel__btn--danger"
                    style={{ flex: 1 }}
                >
                    <Square size={14} />
                    선택 종료
                </button>
            </div>
            {!panel.isSelecting && panel.copiedLogics.length > 0 && (
                <button
                    type="button"
                    onClick={panel.handlePasteCopied}
                    disabled={!eventSettingAvailable}
                    className="panel__btn panel__btn--primary"
                >
                    <ClipboardPaste size={14} />
                    붙여넣기
                </button>
            )}
            {panel.selectedItems.length > 0 && (
                <div className="panel__row">
                    <button
                        type="button"
                        onClick={panel.handleCopySelected}
                        disabled={!eventSettingAvailable}
                        className="panel__btn panel__btn--primary"
                        style={{ flex: 1 }}
                    >
                        <Clipboard size={14} />
                        복사
                    </button>
                    <button
                        type="button"
                        onClick={panel.handleDeleteSelected}
                        disabled={!eventSettingAvailable}
                        className="panel__btn panel__btn--danger"
                        style={{ flex: 1 }}
                    >
                        <Trash2 size={14} />
                        삭제
                    </button>
                </div>
            )}
            {panel.displayedItems.length > 0 && (
                <div className="panel__results">
                    <div className="panel__results-header">
                        <span>
                            {panel.resultLabel} {panel.displayIndex + 1} /{' '}
                            {panel.displayedItems.length}
                        </span>
                    </div>
                    <ul className="panel__results-list">
                        {panel.displayedItems.map((item, i) => {
                            const Icon = KIND_ICON[item.kind];
                            return (
                                <li
                                    key={item.id}
                                    className={`panel__result-item ${i === panel.displayIndex ? 'panel__result-item--active' : ''}`}
                                    role="button"
                                    tabIndex={0}
                                    aria-current={i === panel.displayIndex ? 'true' : undefined}
                                    onClick={() => panel.setCurrentIndex(i)}
                                    onKeyDown={(e) => {
                                        if (e.key !== 'Enter' && e.key !== ' ') return;
                                        e.preventDefault();
                                        panel.setCurrentIndex(i);
                                    }}
                                    title={`${item.kind} · ${item.logicId}`}
                                >
                                    <span className="panel__result-seq">
                                        {item.seq || '-'}
                                    </span>
                                    <Icon
                                        className="panel__result-icon"
                                        aria-label={item.kind}
                                    />
                                    <span className="panel__result-text">
                                        {item.snippet}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
